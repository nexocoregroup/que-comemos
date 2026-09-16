package com.nexocore.quecomemos;

import android.content.Intent;
import android.net.Uri;
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

        // Arranque en frío desde el enlace de vuelta de Google: el sistema había
        // cerrado la aplicación mientras la persona escribía su contraseña en el
        // navegador, y ahora la abre otra vez con el enlace dentro.
        guardarEnlace(getIntent());
    }

    /**
     * La vuelta del navegador con la aplicación todavía viva.
     *
     * Es el camino normal, y funciona porque la Activity está declarada como
     * `singleTask` en el manifiesto: sin eso, Android abriría una segunda copia
     * de la aplicación encima de la primera y el enlace llegaría a una instancia
     * que no es la que está esperando.
     */
    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Sin esto, `getIntent()` seguiría devolviendo el de la vez anterior.
        setIntent(intent);
        guardarEnlace(intent);
    }

    private void guardarEnlace(Intent intent) {
        if (intent == null) return;
        final Uri datos = intent.getData();
        if (datos == null) return;
        Aparato.recibirEnlace(datos.toString());
    }
}
