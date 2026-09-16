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
 *   · `abrirEnNavegador()` y `enlaceDeEntrada()` — el viaje de ida y vuelta de
 *     Google. Ver más abajo: tiene que ser el navegador del sistema, y no es
 *     opcional.
 *
 * No se usa ningún complemento de terceros para esto a propósito. Son cien
 * líneas de Java; una dependencia nueva traería su propio código nativo, sus
 * propios permisos y su propia superficie de ataque, a cambio de nada.
 */
@CapacitorPlugin(name = "Aparato")
public class Aparato extends Plugin {

    /**
     * El enlace con el que alguien volvió del navegador.
     *
     * Es estático porque el viaje de vuelta puede llegar de dos maneras y hay
     * que atender las dos: si la app seguía viva en segundo plano, Android la
     * despierta con `onNewIntent`; si el sistema la había cerrado mientras la
     * persona escribía su contraseña, vuelve a arrancarla entera y el enlace
     * llega en el `onCreate`. En el segundo caso este complemento todavía no
     * existe cuando el enlace aparece, así que el enlace tiene que esperarle
     * aquí, fuera de cualquier instancia.
     */
    private static String enlacePendiente = null;

    /** La llama `MainActivity` cada vez que un enlace entra en la aplicación. */
    static void recibirEnlace(String enlace) {
        if (enlace == null || enlace.isEmpty()) return;
        enlacePendiente = enlace;
    }

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

    /**
     * Abre una dirección en el navegador del teléfono, fuera de la aplicación.
     *
     * Esto NO es una preferencia de diseño. Google rechaza desde 2021 los
     * inicios de sesión hechos dentro de un WebView incrustado y contesta
     * `disallowed_useragent`: es una medida suya contra las aplicaciones que
     * espían la contraseña de quien entra, y no hay forma de esquivarla ni
     * conviene que la haya. Así que la identificación pasa por el navegador de
     * verdad, donde la persona puede ver la barra de direcciones y comprobar que
     * está escribiendo su contraseña en accounts.google.com y no en una copia.
     *
     * Solo se abren direcciones `https`. Sin esa comprobación, cualquier cosa
     * capaz de llegar hasta aquí podría lanzar intenciones arbitrarias del
     * sistema desde dentro de la aplicación.
     */
    @PluginMethod
    public void abrirEnNavegador(PluginCall call) {
        final String url = call.getString("url", "");
        if (url == null || !url.regionMatches(true, 0, "https://", 0, 8)) {
            call.resolve(new JSObject().put("abierto", false).put("motivo", "Solo se abren direcciones https."));
            return;
        }
        try {
            final Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve(new JSObject().put("abierto", true));
        } catch (Throwable error) {
            // Un teléfono sin navegador es raro pero existe (algunos aparatos de
            // empresa). Quien llama enseña entonces la alternativa del correo.
            call.resolve(new JSObject().put("abierto", false).put("motivo", String.valueOf(error.getMessage())));
        }
    }

    /**
     * El enlace con el que se volvió del navegador, si lo hubo.
     *
     * Se entrega una sola vez: en cuanto el JavaScript lo recoge, se borra. Un
     * código de autorización sirve para canjearse una vez, y dejarlo aquí para
     * que lo vuelva a leer el siguiente arranque solo produciría un error
     * confuso días después.
     */
    @PluginMethod
    public void enlaceDeEntrada(PluginCall call) {
        final String enlace = enlacePendiente;
        enlacePendiente = null;
        final JSObject respuesta = new JSObject();
        respuesta.put("hay", enlace != null);
        if (enlace != null) respuesta.put("enlace", enlace);
        call.resolve(respuesta);
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
