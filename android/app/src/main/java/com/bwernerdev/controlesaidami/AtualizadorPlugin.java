package com.bwernerdev.controlesaidami;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Autoatualização do APK (instalação direta, fora da Play Store).
 *
 * O JavaScript (src/atualizador.js) descobre a versão nova na Release do GitHub e chama:
 *  - info(): versionCode/versionName instalados e se o app já pode instalar APKs;
 *  - ultimaVersao({ repo }): tag da última Release (v1.0.N), sem a API do GitHub;
 *  - abrirPermissao(): abre a tela do Android "Instalar apps desconhecidos" deste app;
 *  - baixarEInstalar({ url }): baixa o APK para o cache (evento "progresso" com pct) e
 *    abre o instalador do Android. A pessoa só confirma em "Atualizar".
 *
 * Instalar sem nenhum toque exige app de sistema ou Play Store; isto é o máximo permitido.
 * O Android só aceita a atualização se o APK novo tiver a mesma assinatura (assinatura/).
 */
@CapacitorPlugin(name = "Atualizador")
public class AtualizadorPlugin extends Plugin {

    private volatile boolean baixando = false;

    @PluginMethod
    public void info(PluginCall call) {
        try {
            PackageInfo p = getContext().getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), 0);
            long codigo = Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode;
            JSObject r = new JSObject();
            r.put("versionCode", codigo);
            r.put("versionName", p.versionName);
            r.put("podeInstalar", podeInstalar());
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Não foi possível ler a versão do app: " + e.getMessage());
        }
    }

    private boolean podeInstalar() {
        return Build.VERSION.SDK_INT < 26
                || getContext().getPackageManager().canRequestPackageInstalls();
    }

    /**
     * Tag da última Release, lida do redirecionamento de github.com/.../releases/latest
     * (302 para .../releases/tag/v1.0.N). Não usa a API do GitHub, que aceita só 60
     * consultas por hora por endereço de internet (no 4G, muitos aparelhos dividem o mesmo).
     */
    @PluginMethod
    public void ultimaVersao(PluginCall call) {
        final String repo = call.getString("repo");
        if (repo == null || !repo.matches("[A-Za-z0-9._-]+/[A-Za-z0-9._-]+")) {
            call.reject("Repositório inválido.");
            return;
        }
        new Thread(() -> {
            HttpURLConnection conexao = null;
            try {
                conexao = (HttpURLConnection) new URL("https://github.com/" + repo + "/releases/latest").openConnection();
                conexao.setInstanceFollowRedirects(false);
                conexao.setRequestMethod("HEAD");
                conexao.setUseCaches(false);
                conexao.setConnectTimeout(15000);
                conexao.setReadTimeout(15000);
                int status = conexao.getResponseCode();
                String destino = conexao.getHeaderField("Location");
                if (status < 300 || status >= 400 || destino == null) {
                    throw new IOException("GitHub respondeu " + status);
                }
                java.util.regex.Matcher m = java.util.regex.Pattern
                        .compile("/releases/tag/(v\\d+\\.\\d+\\.\\d+)$").matcher(destino);
                if (!m.find()) throw new IOException("endereço inesperado: " + destino);
                JSObject r = new JSObject();
                r.put("tag", m.group(1));
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Não foi possível consultar a versão nova: " + e.getMessage());
            } finally {
                if (conexao != null) conexao.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void abrirPermissao(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 26) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    @PluginMethod
    public void baixarEInstalar(PluginCall call) {
        final String endereco = call.getString("url");
        if (endereco == null || !endereco.startsWith("https://")) {
            call.reject("Endereço da atualização inválido.");
            return;
        }
        if (baixando) {
            call.reject("A atualização já está sendo baixada.");
            return;
        }
        baixando = true;

        new Thread(() -> {
            HttpURLConnection conexao = null;
            try {
                File pasta = new File(getContext().getCacheDir(), "atualizacao");
                if (!pasta.exists() && !pasta.mkdirs()) {
                    throw new IOException("não foi possível criar a pasta de download");
                }
                File apk = new File(pasta, "controle-saida-mi.apk");

                // O GitHub redireciona (302) para o servidor de arquivos, também https:
                // o HttpURLConnection segue sozinho.
                conexao = (HttpURLConnection) new URL(endereco).openConnection();
                conexao.setInstanceFollowRedirects(true);
                conexao.setConnectTimeout(20000);
                conexao.setReadTimeout(60000);
                int status = conexao.getResponseCode();
                if (status != HttpURLConnection.HTTP_OK) {
                    throw new IOException("servidor respondeu " + status);
                }
                long total = conexao.getContentLengthLong();

                try (InputStream in = conexao.getInputStream();
                     OutputStream out = new FileOutputStream(apk, false)) {
                    byte[] buffer = new byte[64 * 1024];
                    long lido = 0;
                    int n;
                    int ultimo = -1;
                    while ((n = in.read(buffer)) > 0) {
                        out.write(buffer, 0, n);
                        lido += n;
                        if (total > 0) {
                            int pct = (int) (lido * 100 / total);
                            if (pct != ultimo) {
                                ultimo = pct;
                                JSObject ev = new JSObject();
                                ev.put("pct", pct);
                                notifyListeners("progresso", ev);
                            }
                        }
                    }
                    if (total > 0 && lido != total) {
                        throw new IOException("download incompleto (" + lido + " de " + total + " bytes)");
                    }
                }

                Uri uri = FileProvider.getUriForFile(getContext(),
                        getContext().getPackageName() + ".fileprovider", apk);
                Intent instalar = new Intent(Intent.ACTION_VIEW);
                instalar.setDataAndType(uri, "application/vnd.android.package-archive");
                instalar.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(instalar);
                call.resolve();
            } catch (Exception e) {
                call.reject("Falha ao baixar a atualização: " + e.getMessage());
            } finally {
                if (conexao != null) conexao.disconnect();
                baixando = false;
            }
        }).start();
    }
}
