package com.bwernerdev.controlesaidami;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins locais precisam ser registrados antes do super.onCreate.
        registerPlugin(AtualizadorPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
