// Modo offline: o app continua funcionando sem internet e envia tudo quando a rede volta.
//
// Fica por cima da camada de dados (api.js) com a mesma interface, então as telas não
// sabem se estão online. O que faz:
//  - Guarda neste aparelho a última lista recebida do servidor (pendentes e finalizados do
//    dia) e o perfil do login. Sem rede, as telas mostram essa cópia, e o app abre direto
//    na tela de trabalho com o perfil guardado, sem pedir login.
//  - Cadastro, saída e cancelamento feitos sem rede entram numa fila, com a hora real em
//    que aconteceram e um id gerado no aparelho. A fila é aplicada por cima da cópia local:
//    quem registrou já vê o resultado (marcado "não enviado").
//  - Saída sem rede: o lacre digitado é conferido contra o lacre da cópia local.
//  - A fila é enviada na ordem, quando a rede volta (evento "online", app voltando para a
//    frente, a cada 20 s enquanto houver fila, e logo depois de cada registro).
//  - Reenviar é seguro: o cadastro leva o id do aparelho (coluna id_cliente, única) e as
//    funções do banco aceitam de novo uma saída/cancelamento já feito pelo mesmo login.
//  - O que o servidor recusar (ex.: a balança cancelou enquanto a portaria estava sem
//    rede) sai da fila e vai para a lista de "não aceitos", mostrada no topo do app.
//
// Onde fica: no APK, armazenamento nativo (@capacitor/preferences); no navegador,
// localStorage. No PC só funciona sem rede se a página já estiver aberta (não há
// service worker: recarregar a página sem internet não abre o site).
import { Preferences } from '@capacitor/preferences';
import {
  SemConexao, ehApp, ehErroDeRede, normalizarLacre, validarMotivo, validarNovo,
} from './util.js';

const LIMITE_MS = 10000; // sem resposta nesse tempo, trata como sem rede
const INTERVALO_FILA_MS = 20000;
const ESGOTOU = Symbol('tempo esgotado');

const armazem = ehApp()
  ? {
    ler: async (k) => (await Preferences.get({ key: k })).value,
    gravar: (k, v) => Preferences.set({ key: k, value: v }),
  }
  : {
    ler: async (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    gravar: async (k, v) => { try { localStorage.setItem(k, v); } catch { /* modo privado */ } },
  };

function novoId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  // Reserva (contexto sem crypto.randomUUID): uuid v4 com Math.random.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
  });
}

const vazio = () => ({
  email: null, // login a que esta cópia pertence
  perfil: null,
  pendentes: [],
  finalizados: [],
  atualizadoEm: null, // última resposta do servidor (para mostrar "dados de HH:MM")
  fila: [], // { id, tipo: 'criar'|'saida'|'cancelar', quando, placa, registro?, lacre?, observacao?, motivo? }
  mapa: {}, // id do aparelho (cadastro) -> id no servidor, depois de enviado
  rejeitadas: [], // operações recusadas pelo servidor: { ...op, erro, em }
});

export function criarCamadaOffline(base) {
  const CHAVE = base.demo ? 'csmi-offline-demo-v1' : 'csmi-offline-v1';
  let estado = vazio();
  let online = navigator.onLine !== false;
  let enviando = false;
  let emVoo = null; // id da operação sendo enviada agora
  const ouvintesEstado = new Set();
  const ouvintesDados = new Set();
  let pararBase = null;

  const pronto = (async () => {
    try {
      const t = await armazem.ler(CHAVE);
      if (t) estado = { ...vazio(), ...JSON.parse(t) };
    } catch { /* cópia corrompida: começa vazia */ }
  })();

  const gravar = () => armazem.gravar(CHAVE, JSON.stringify(estado));

  // Outra aba do navegador mexeu na fila: recarrega para não sobrescrever.
  if (!ehApp()) {
    window.addEventListener('storage', (e) => {
      if (e.key !== CHAVE || !e.newValue) return;
      try { estado = { ...vazio(), ...JSON.parse(e.newValue) }; } catch { return; }
      emitirEstado(); notificarDados();
    });
  }

  function resumo() {
    return {
      online,
      enviando,
      naFila: estado.fila.length,
      rejeitadas: estado.rejeitadas.length,
      atualizadoEm: estado.atualizadoEm,
    };
  }
  function emitirEstado() { const r = resumo(); ouvintesEstado.forEach((f) => f(r)); }
  function notificarDados() { ouvintesDados.forEach((f) => f()); }

  function marcarOnline(valor) {
    if (online === valor) return;
    online = valor;
    emitirEstado();
    if (valor) {
      // A rede voltou: envia a fila. O canal de tempo real não é refeito aqui: o cliente
      // do Supabase volta ao canal sozinho quando o socket reconecta, e sair e assinar de
      // novo na hora pegava o mesmo canal ainda saindo, que depois era removido.
      sincronizar();
      notificarDados();
    }
  }

  /** Chama o servidor com limite de tempo; erro de rede vira SemConexao. */
  async function viaRede(fn) {
    if (navigator.onLine === false) {
      marcarOnline(false);
      throw new SemConexao('Sem conexão com o servidor.');
    }
    let r;
    try {
      r = await Promise.race([
        fn(),
        new Promise((resolver) => { setTimeout(() => resolver(ESGOTOU), LIMITE_MS); }),
      ]);
    } catch (e) {
      if (ehErroDeRede(e)) { marcarOnline(false); throw new SemConexao('Sem conexão com o servidor.'); }
      marcarOnline(true); // o servidor respondeu (com uma recusa)
      throw e;
    }
    if (r === ESGOTOU) { marcarOnline(false); throw new SemConexao('Sem conexão com o servidor.'); }
    marcarOnline(true);
    return r;
  }

  const nomeAtual = () => estado.perfil?.nome || '';
  const chave = (id) => String(id);

  function registroDoCadastro(op) {
    return {
      id: `local-${op.id}`, placa: op.placa, lacre: op.lacre, observacao: op.observacao || null,
      status: 'pendente', criado_em: op.quando, criado_por_nome: nomeAtual(),
      saida_em: null, saida_por_nome: null, cancelado_em: null, cancelado_por_nome: null,
      motivo_cancelamento: null, _local: true,
    };
  }

  /** id que a tela tem em mãos -> id no servidor (ou null se o cadastro ainda não subiu). */
  function resolver(id) {
    const k = chave(id);
    if (!k.startsWith('local-')) return id;
    return estado.mapa[k.slice(6)] ?? null;
  }

  /**
   * Junta linhas do servidor (ou da cópia), a fila ainda não enviada e o filtro da consulta.
   * Registros mexidos pela fila saem com _local: true.
   */
  function mesclar(linhas, filtro = () => true) {
    const mapa = new Map();
    for (const r of [...estado.pendentes, ...estado.finalizados]) mapa.set(chave(r.id), { r, daConsulta: false });
    for (const r of linhas) mapa.set(chave(r.id), { r, daConsulta: true });
    const achar = (id) => {
      const real = resolver(id);
      return mapa.get(chave(real ?? id));
    };
    for (const op of estado.fila) {
      if (op.tipo === 'criar') {
        const r = registroDoCadastro(op);
        mapa.set(r.id, { r, daConsulta: true });
        continue;
      }
      const item = achar(op.registro);
      if (!item) continue;
      const mudanca = op.tipo === 'saida'
        ? { status: 'liberado', saida_em: op.quando, saida_por_nome: nomeAtual() }
        : {
          status: 'cancelado', cancelado_em: op.quando, cancelado_por_nome: nomeAtual(),
          motivo_cancelamento: op.motivo || null,
        };
      item.r = { ...item.r, ...mudanca, _local: true };
      item.daConsulta = true;
    }
    return [...mapa.values()]
      .filter((x) => x.daConsulta)
      .map((x) => x.r)
      .filter(filtro)
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  }

  /** Atualiza a cópia local com um registro que o servidor devolveu. */
  function aplicarResultado(r) {
    if (!r || r.id == null) return;
    const k = chave(r.id);
    estado.pendentes = estado.pendentes.filter((x) => chave(x.id) !== k);
    estado.finalizados = estado.finalizados.filter((x) => chave(x.id) !== k);
    if (r.status === 'pendente') estado.pendentes.unshift(r);
    else estado.finalizados.unshift(r);
  }

  /** Envia uma operação ao servidor (direto ou pela fila). */
  async function enviar(op) {
    if (op.tipo === 'criar') {
      try {
        return await base.criar(
          { placa: op.placa, lacre: op.lacre, observacao: op.observacao },
          { idCliente: op.id, quando: op.quando },
        );
      } catch (e) {
        // Recusa depois de um envio que talvez tenha chegado (resposta perdida): se o
        // cadastro com este id já existe, deu certo da primeira vez.
        if (!ehErroDeRede(e)) {
          const ja = await base.buscarPorIdCliente(op.id).catch(() => null);
          if (ja) return ja;
        }
        throw e;
      }
    }
    const id = resolver(op.registro);
    if (id == null) throw new Error('O cadastro desta saída não foi aceito pelo servidor.');
    if (op.tipo === 'saida') return base.registrarSaida(id, op.lacre, { quando: op.quando });
    return base.cancelar(id, op.motivo, { quando: op.quando });
  }

  /** Confere sem rede o que o servidor conferiria (lacre, status, placa repetida). */
  function conferirSemRede(op) {
    const pendentes = mesclar([], (s) => s.status === 'pendente');
    if (op.tipo === 'criar') {
      if (pendentes.some((s) => s.placa === op.placa)) throw new Error('Esta placa já está aguardando saída.');
      return;
    }
    const todos = mesclar([...estado.pendentes, ...estado.finalizados]);
    const real = resolver(op.registro);
    const r = todos.find((s) => chave(s.id) === chave(op.registro) || (real != null && chave(s.id) === chave(real)));
    if (!r) throw new Error('Registro não encontrado.');
    if (r.status !== 'pendente') {
      throw new Error(op.tipo === 'saida'
        ? 'Este veículo não está mais aguardando saída.'
        : 'Só dá para cancelar o que ainda aguarda saída.');
    }
    if (op.tipo === 'saida' && normalizarLacre(r.lacre) !== normalizarLacre(op.lacre)) {
      throw new Error('Lacre não confere. Confira o lacre ou chame a balança.');
    }
  }

  /** Tenta enviar já; sem rede (ou com fila na frente), guarda na fila. */
  async function enviarOuGuardar(op) {
    await pronto;
    const dependeDeCadastroLocal = op.registro != null && resolver(op.registro) == null;
    if (!estado.fila.length && !dependeDeCadastroLocal) {
      try {
        const r = await viaRede(() => enviar(op));
        aplicarResultado(r);
        estado.atualizadoEm = new Date().toISOString();
        await gravar();
        notificarDados();
        return r;
      } catch (e) {
        if (!ehErroDeRede(e)) throw e;
      }
    }
    conferirSemRede(op);
    estado.fila.push(op);
    await gravar();
    emitirEstado();
    notificarDados();
    setTimeout(sincronizar, 0);
    const lista = mesclar([], () => true);
    const alvo = op.tipo === 'criar' ? `local-${op.id}` : chave(op.registro);
    return { ...(lista.find((s) => chave(s.id) === alvo) || {}), _local: true, _naFila: true };
  }

  let sincronizando = null;
  /** Envia a fila em ordem. Para no primeiro erro de rede; recusas vão para "não aceitos". */
  function sincronizar() {
    if (sincronizando) return sincronizando;
    sincronizando = (async () => {
      await pronto;
      if (!estado.fila.length) return;
      enviando = true;
      emitirEstado();
      let mudou = false;
      try {
        while (estado.fila.length) {
          const op = estado.fila[0];
          emVoo = op.id;
          let r;
          try {
            r = await viaRede(() => enviar(op));
          } catch (e) {
            if (ehErroDeRede(e)) break;
            estado.rejeitadas.push({ ...op, erro: e.message, em: new Date().toISOString() });
            estado.fila = estado.fila.filter((o) => o.id !== op.id);
            mudou = true;
            await gravar();
            continue;
          } finally {
            emVoo = null;
          }
          if (op.tipo === 'criar') estado.mapa[op.id] = r.id;
          aplicarResultado(r);
          estado.fila = estado.fila.filter((o) => o.id !== op.id);
          estado.atualizadoEm = new Date().toISOString();
          mudou = true;
          await gravar();
        }
        // Mantém só os últimos 200 ids traduzidos (bastam para telas abertas há pouco).
        const ids = Object.keys(estado.mapa);
        if (ids.length > 200) {
          for (const k of ids.slice(0, ids.length - 200)) delete estado.mapa[k];
          await gravar();
        }
      } finally {
        enviando = false;
        sincronizando = null;
        emitirEstado();
        if (mudou) notificarDados();
      }
    })();
    return sincronizando;
  }

  // Gatilhos do envio: rede voltou, app voltou para a frente e, enquanto houver fila, de 20 em 20 s.
  window.addEventListener('online', () => { sincronizar(); notificarDados(); });
  window.addEventListener('offline', () => marcarOnline(false));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sincronizar();
  });
  setInterval(() => { if (estado.fila.length) sincronizar(); }, INTERVALO_FILA_MS);
  pronto.then(() => { if (estado.fila.length) sincronizar(); });

  const lerComCopia = async (consulta, guardar, filtro) => {
    await pronto;
    let linhas;
    try {
      linhas = await viaRede(consulta);
      if (guardar) {
        guardar(linhas);
        estado.atualizadoEm = new Date().toISOString();
        await gravar();
      }
    } catch (e) {
      if (!ehErroDeRede(e)) throw e;
      return mesclar([...estado.pendentes, ...estado.finalizados], filtro);
    }
    return mesclar(linhas, filtro);
  };

  return {
    demo: base.demo,
    usuarios: base.usuarios, // aba Usuários: só online
    aoMudarSessao: (cb) => base.aoMudarSessao(cb),
    entrar: (email, senha) => base.entrar(email, senha),

    async sessao() {
      await pronto;
      try {
        return await base.sessao();
      } catch (e) {
        if (!ehErroDeRede(e)) throw e;
        const email = await base.emailSalvo();
        if (email && estado.email === email && estado.perfil) {
          marcarOnline(false);
          return { email, offline: true };
        }
        throw e;
      }
    },

    async perfil() {
      await pronto;
      try {
        const p = await viaRede(() => base.perfil());
        const email = await base.emailSalvo();
        if (estado.email !== email) {
          // Outro login neste aparelho: a fila do anterior não pode subir com este login.
          const antigas = estado.fila.map((op) => ({
            ...op, erro: 'Registrado por outro login neste aparelho; não foi enviado.', em: new Date().toISOString(),
          }));
          estado = { ...vazio(), rejeitadas: [...estado.rejeitadas, ...antigas] };
          estado.email = email;
        }
        estado.perfil = p;
        await gravar();
        emitirEstado();
        return p;
      } catch (e) {
        if (ehErroDeRede(e) && estado.perfil && estado.email === await base.emailSalvo()) return estado.perfil;
        throw e;
      }
    },

    async sair() {
      await pronto;
      estado = vazio();
      await gravar();
      emitirEstado();
      await base.sair();
    },

    async listar(q = {}) {
      const { status = null, desde = null, ate = null } = q;
      const filtro = (s) => (!status || s.status === status)
        && (!desde || s.criado_em >= desde) && (!ate || s.criado_em < ate);
      const guardar = status === 'pendente' && !desde && !ate
        ? (linhas) => { estado.pendentes = linhas; }
        : null;
      return lerComCopia(() => base.listar(q), guardar, filtro);
    },

    async finalizadosDesde(desde) {
      const filtro = (s) => (s.status === 'liberado' && s.saida_em >= desde)
        || (s.status === 'cancelado' && s.cancelado_em >= desde);
      return lerComCopia(() => base.finalizadosDesde(desde), (linhas) => { estado.finalizados = linhas; }, filtro);
    },

    async criar(dados) {
      const { placa, lacre } = validarNovo(dados);
      const observacao = String(dados.observacao || '').trim() || null;
      return enviarOuGuardar({
        id: novoId(), tipo: 'criar', quando: new Date().toISOString(), placa, lacre, observacao,
      });
    },

    async registrarSaida(id, lacreConferido) {
      await pronto;
      const r = mesclar([...estado.pendentes, ...estado.finalizados]).find((s) => chave(s.id) === chave(id));
      return enviarOuGuardar({
        id: novoId(), tipo: 'saida', quando: new Date().toISOString(), placa: r?.placa || '',
        registro: id, lacre: lacreConferido,
      });
    },

    async cancelar(id, motivoDigitado) {
      const motivo = validarMotivo(motivoDigitado);
      await pronto;
      const k = chave(id);
      // Cadastro que nem chegou ao servidor: basta tirá-lo da fila.
      if (k.startsWith('local-')) {
        const idOp = k.slice(6);
        const cadastro = estado.fila.find((o) => o.id === idOp);
        if (cadastro && emVoo !== idOp) {
          estado.fila = estado.fila.filter((o) => o.id !== idOp && chave(o.registro) !== k);
          await gravar();
          emitirEstado();
          notificarDados();
          return { ...registroDoCadastro(cadastro), status: 'cancelado' };
        }
      }
      const r = mesclar([...estado.pendentes, ...estado.finalizados]).find((s) => chave(s.id) === k);
      return enviarOuGuardar({
        id: novoId(), tipo: 'cancelar', quando: new Date().toISOString(), placa: r?.placa || '',
        registro: id, motivo,
      });
    },

    /** Só com internet: apaga no servidor e limpa a cópia local do mesmo jeito. */
    async apagarHistorico(opcoes = {}) {
      await pronto;
      let n;
      try {
        n = await viaRede(() => base.apagarHistorico(opcoes));
      } catch (e) {
        if (ehErroDeRede(e)) throw new Error('Sem internet: apagar o histórico precisa de conexão.');
        throw e;
      }
      estado.finalizados = [];
      if (opcoes.incluirPendentes) estado.pendentes = [];
      await gravar();
      notificarDados();
      return n;
    },

    /** cb a cada mudança (servidor em tempo real ou fila local). Devolve função para parar. */
    assinar(cb) {
      ouvintesDados.add(cb);
      if (!pararBase) pararBase = base.assinar(notificarDados);
      return () => {
        ouvintesDados.delete(cb);
        if (!ouvintesDados.size && pararBase) { pararBase(); pararBase = null; }
      };
    },

    // ---- estado do envio (faixa no topo do app)
    estadoEnvio: resumo,
    aoMudarEstadoEnvio(cb) { ouvintesEstado.add(cb); cb(resumo()); return () => ouvintesEstado.delete(cb); },
    sincronizar,
    rejeitadas: () => estado.rejeitadas.slice(),
    async dispensarRejeitada(id) {
      estado.rejeitadas = estado.rejeitadas.filter((o) => o.id !== id);
      await gravar();
      emitirEstado();
    },
  };
}
