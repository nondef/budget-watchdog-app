package com.atakansenturk.budgetwatchdog;

import android.os.Bundle;

import androidx.activity.EdgeToEdge;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // @capacitor-community/safe-area: WebView'ın status bar / çentik altına
        // doğru şekilde uzanması ve insetlerin env(safe-area-inset-*) olarak
        // raporlanması için edge-to-edge modunu açıkça etkinleştir.
        EdgeToEdge.enable(this);
    }
}
