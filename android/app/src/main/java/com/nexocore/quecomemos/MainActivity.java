package com.nexocore.quecomemos;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // La red se pone antes que nada. Un fallo durante el arranque de
        // Capacitor —crear el WebView, cargar los complementos— también tiene que
        // quedar apuntado, y para eso hay que llegar primero.
        GuardiaDeFallos.instalar(getApplicationContext());

        // Los complementos se registran antes de `super.onCreate`, que es cuando
        // Capacitor monta el puente: registrarlos después los deja fuera.
        registerPlugin(Aparato.class);

        super.onCreate(savedInstanceState);
    }
}
