package com.nexocore.quecomemos;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

/**
 * Lo poco que la aplicación necesita del teléfono y no puede hacer sola.
 *
 * Son dos cosas, y las dos nacen de la misma fase: que el dictado dejara de
 * cerrar la app y que, cuando falle, se pueda saber por qué.
 *
 *   · `abrirAjustes()` — cuando alguien dice «no» al permiso del micrófono,
 *     Android no lo vuelve a preguntar nunca más. Sin esto, el único consejo
 *     posible es «búscalo tú en los ajustes del teléfono», que es exactamente el
 *     tipo de instrucción que hace abandonar a la gente. Con esto, hay un botón.
 *
 *   · `ultimoFallo()` / `olvidarFallo()` — la ventana por la que el JavaScript
 *     lee lo que `GuardiaDeFallos` dejó apuntado. Un fallo que mató el proceso
 *     no se puede contar desde dentro del proceso muerto; se cuenta al arrancar
 *     el siguiente.
 *
 * No se usa ningún complemento de terceros para esto a propósito. Son cuarenta
 * líneas de Java; una dependencia nueva traería su propio código nativo, sus
 * propios permisos y su propia superficie de ataque, a cambio de nada.
 */
@CapacitorPlugin(name = "Aparato")
public class Aparato extends Plugin {

    /**
     * Abre la ficha de esta aplicación en los ajustes del teléfono, que es donde
     * están los permisos.
     *
     * Se apunta a la ficha de la app y no a la lista general de permisos porque
     * es la única pantalla que existe igual en todas las versiones de Android y
     * en todas las capas de los fabricantes. Llevar a alguien a una pantalla que
     * en su teléfono no existe es peor que no llevarlo.
     */
    @PluginMethod
    public void abrirAjustes(PluginCall call) {
        try {
            final Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve(new JSObject().put("abierto", true));
        } catch (Throwable error) {
            // Que no se pueda abrir no es motivo para romper nada: quien llama
            // enseña entonces el camino a mano, que es lo que había antes.
            call.resolve(new JSObject().put("abierto", false).put("motivo", String.valueOf(error.getMessage())));
        }
    }

    /**
     * Lo último que mató —o estuvo a punto de matar— a la aplicación.
     *
     * Devuelve `{ hay: false }` cuando no hay nada apuntado, que es el caso
     * normal y el que se espera.
     */
    @PluginMethod
    public void ultimoFallo(PluginCall call) {
        final JSObject respuesta = new JSObject();
        try {
            final SharedPreferences prefs = getContext()
                .getSharedPreferences(GuardiaDeFallos.PREFERENCIAS, Context.MODE_PRIVATE);
            final String guardado = prefs.getString(GuardiaDeFallos.CLAVE_FALLO, null);
            if (guardado == null) {
                call.resolve(respuesta.put("hay", false));
                return;
            }
            final JSONObject fallo = new JSONObject(guardado);
            respuesta.put("hay", true);
            respuesta.put("cuando", fallo.optLong("cuando", 0L));
            respuesta.put("clase", fallo.optString("clase", ""));
            respuesta.put("mensaje", fallo.optString("mensaje", ""));
            respuesta.put("hilo", fallo.optString("hilo", ""));
            respuesta.put("principal", fallo.optBoolean("principal", false));
            respuesta.put("pila", fallo.optString("pila", ""));
            call.resolve(respuesta);
        } catch (Throwable error) {
            // Un informe de fallo ilegible no puede provocar otro fallo.
            call.resolve(respuesta.put("hay", false));
        }
    }

    /** Se llama cuando el fallo ya se ha enseñado: enseñarlo dos veces asusta. */
    @PluginMethod
    public void olvidarFallo(PluginCall call) {
        try {
            getContext()
                .getSharedPreferences(GuardiaDeFallos.PREFERENCIAS, Context.MODE_PRIVATE)
                .edit()
                .remove(GuardiaDeFallos.CLAVE_FALLO)
                .apply();
        } catch (Throwable error) {
            // Da igual: si no se puede borrar, se volverá a enseñar, y eso es
            // molesto pero no rompe nada.
        }
        call.resolve();
    }
}
