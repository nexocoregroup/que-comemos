package com.nexocore.quecomemos;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import java.io.PrintWriter;
import java.io.StringWriter;

/**
 * La red que hay debajo de todo, para que la aplicación no desaparezca.
 *
 * ── El problema ────────────────────────────────────────────────────────────
 *
 * Al dictar, la aplicación se cerraba entera. Eso no lo puede provocar un error
 * de JavaScript: dentro de un WebView, un error de JavaScript rompe una pantalla
 * pero no mata el proceso. Lo que mata el proceso es una excepción de Java que
 * nadie recoge, y en el camino del dictado hay varias que nadie recoge. Son del
 * complemento de reconocimiento de voz, no de esta app, y por tanto no se pueden
 * arreglar desde aquí. Las que se han encontrado leyendo su código:
 *
 *   · `mainExecutor()` devuelve `bridge.getActivity().runOnUiThread(...)`. El
 *     motor de voz contesta desde su propio hilo; si para entonces la Activity
 *     ya no está —la app pasó a segundo plano—, eso es un NPE en un hilo que
 *     nadie vigila, y un hilo sin vigilancia se lleva el proceso por delante.
 *   · `beginOnDeviceListening` llama a `startInlineListening` desde el callback
 *     del servicio de reconocimiento, y ahí `speechRecognizer.startListening()`
 *     no está dentro de ningún try. Lanza `SecurityException` si el permiso del
 *     micrófono se retira mientras se escucha.
 *   · `load()` crea un `SpeechRecognizer` al abrir la aplicación, sin try.
 *
 * ── Qué hace esta clase ────────────────────────────────────────────────────
 *
 * Dos cosas, y ninguna de ellas es «arreglar» el error:
 *
 *   1. ANOTARLO. Sea cual sea el desenlace, la causa técnica queda escrita en el
 *      teléfono. Sin esto, «se me cerró la app» es un informe imposible de
 *      seguir; con esto, en «Más → Detalle técnico» aparece la clase, el
 *      mensaje, el hilo y las primeras líneas de la pila.
 *
 *   2. AGUANTAR cuando aguantar es seguro:
 *
 *      · Si el error viene de un hilo secundario, el proceso no necesita morir:
 *        ese hilo ya acabó y el resto de la aplicación —la pantalla, los datos,
 *        el WebView— está intacto. Se anota y se sigue. Aquí es donde caen los
 *        fallos del motor de voz, que es justo lo que se quería.
 *
 *      · Si el error viene del hilo principal, el bucle de mensajes de Android
 *        ha muerto y la aplicación se quedaría congelada. Se vuelve a entrar en
 *        el bucle, que es la forma conocida de resucitarlo.
 *
 * ── Y dónde se planta ──────────────────────────────────────────────────────
 *
 * Aguantar no siempre es lo correcto, y una red que lo tapa todo es peor que no
 * tener red: escondería fallos de verdad y dejaría al usuario con una app que se
 * comporta raro sin decir por qué. Así que se rinde, y deja morir el proceso
 * como habría muerto, en dos casos:
 *
 *   · Cuando el error sale del ciclo de vida de Android (`ActivityThread` y
 *     compañía). Ahí el sistema lleva su propia contabilidad de la Activity, y
 *     seguir como si nada la deja a medio construir; en Android 12 y posteriores
 *     eso termina en un bloqueo peor que el cierre.
 *   · Cuando se repite. Cinco fallos en diez segundos no son un tropiezo, son un
 *     bucle, y girar dentro de un bucle con la pantalla congelada es lo único
 *     peor que cerrarse.
 */
final class GuardiaDeFallos {

    private static final String TAG = "QueComemos";
    static final String PREFERENCIAS = "que-comemos-fallos";
    static final String CLAVE_FALLO = "ultimo";

    /** Cuántos fallos seguidos se aguantan antes de dar el proceso por perdido. */
    private static final int TOPE_DE_FALLOS = 5;
    /** Y en cuánto tiempo. Pasado ese rato sin fallar, la cuenta vuelve a cero. */
    private static final long VENTANA_MS = 10_000L;

    private static long primerFalloMs = 0L;
    private static int fallosSeguidos = 0;

    private GuardiaDeFallos() {}

    static void instalar(final Context contexto) {
        final Context app = contexto.getApplicationContext();
        final Thread.UncaughtExceptionHandler anterior = Thread.getDefaultUncaughtExceptionHandler();

        Thread.setDefaultUncaughtExceptionHandler((hilo, error) -> {
            anotar(app, hilo, error);
            // Un hilo secundario que muere no se lleva nada por delante: se deja
            // ir y la aplicación sigue en pie. Este es el caso del motor de voz.
            if (hilo != Looper.getMainLooper().getThread() && !rendirse(error)) return;
            if (anterior != null) anterior.uncaughtException(hilo, error);
        });

        // El hilo principal necesita su propia red: cuando una excepción sube
        // por `Looper.loop()`, el bucle de mensajes termina y la aplicación se
        // queda con la pantalla puesta pero sin responder a nada. Volver a
        // entrar en el bucle es lo que la devuelve a la vida.
        new Handler(Looper.getMainLooper()).post(() -> {
            while (true) {
                try {
                    Looper.loop();
                    // `loop()` solo vuelve cuando alguien llama a `quit()`, y eso
                    // es la aplicación cerrándose de verdad.
                    return;
                } catch (Throwable error) {
                    anotar(app, Thread.currentThread(), error);
                    if (rendirse(error)) throw error;
                }
            }
        });
    }

    /**
     * ¿Hay que dejar morir esto?
     *
     * Se mira el contenido del error, no su gravedad aparente: lo que decide es
     * de dónde viene y cuántas veces ha venido.
     */
    private static boolean rendirse(Throwable error) {
        if (delCicloDeVida(error)) return true;

        final long ahora = System.currentTimeMillis();
        if (ahora - primerFalloMs > VENTANA_MS) {
            primerFalloMs = ahora;
            fallosSeguidos = 0;
        }
        fallosSeguidos += 1;
        return fallosSeguidos >= TOPE_DE_FALLOS;
    }

    /**
     * Un error nacido dentro del montaje de una pantalla por parte de Android.
     *
     * Estos no se tocan. El sistema tiene apuntado que la Activity está en un
     * estado que nunca llegó a alcanzar, y taparlo cambia un cierre —molesto,
     * pero que se entiende— por una aplicación viva que ya no responde, que es
     * mucho peor para quien la tiene delante.
     */
    private static boolean delCicloDeVida(Throwable error) {
        for (Throwable actual = error; actual != null; actual = actual.getCause()) {
            for (StackTraceElement linea : actual.getStackTrace()) {
                final String clase = linea.getClassName();
                if (clase.startsWith("android.app.ActivityThread")) return true;
                if (clase.startsWith("android.app.servertransaction")) return true;
                if (clase.startsWith("android.app.LoadedApk")) return true;
            }
        }
        return false;
    }

    /**
     * Deja la causa técnica escrita donde la aplicación la pueda leer después.
     *
     * Se guarda la clase, el mensaje, el hilo y las primeras líneas de la pila:
     * lo justo para saber de dónde salió. Nada de esto es información de la
     * casa: ni comidas, ni despensa, ni lo que se dictó. Un informe de fallo con
     * datos personales dentro es un problema nuevo, no la solución de uno viejo.
     */
    private static void anotar(Context contexto, Thread hilo, Throwable error) {
        // Se escribe en el log del sistema primero, que es lo único que funciona
        // aunque el disco esté lleno o las preferencias no se puedan abrir.
        Log.e(TAG, "Fallo no recogido en " + hilo.getName(), error);
        try {
            final SharedPreferences prefs = contexto.getSharedPreferences(PREFERENCIAS, Context.MODE_PRIVATE);
            prefs
                .edit()
                .putString(CLAVE_FALLO, resumen(hilo, error))
                // `commit` y no `apply`: si el proceso va a morir en el renglón
                // siguiente, una escritura diferida no llega a ocurrir nunca, y
                // el fallo que más importa anotar es justo el que mata la app.
                .commit();
        } catch (Throwable fallandoAlAnotar) {
            // Si ni anotar se puede, no se insiste: lanzar desde aquí sustituiría
            // el error que se quería guardar por otro más confuso.
            Log.e(TAG, "No se pudo anotar el fallo", fallandoAlAnotar);
        }
    }

    /** El fallo en JSON, escrito a mano para no depender de nada. */
    private static String resumen(Thread hilo, Throwable error) {
        final StringWriter pila = new StringWriter();
        error.printStackTrace(new PrintWriter(pila));
        final String[] lineas = pila.toString().split("\n");

        final StringBuilder recorte = new StringBuilder();
        for (int i = 0; i < lineas.length && i < 12; i++) {
            if (recorte.length() > 0) recorte.append('\n');
            recorte.append(lineas[i].trim());
        }

        return "{" +
            "\"cuando\":" + System.currentTimeMillis() + "," +
            "\"clase\":\"" + escapar(error.getClass().getName()) + "\"," +
            "\"mensaje\":\"" + escapar(String.valueOf(error.getMessage())) + "\"," +
            "\"hilo\":\"" + escapar(hilo.getName()) + "\"," +
            "\"principal\":" + (hilo == Looper.getMainLooper().getThread()) + "," +
            "\"pila\":\"" + escapar(recorte.toString()) + "\"" +
            "}";
    }

    private static String escapar(String texto) {
        if (texto == null) return "";
        final StringBuilder salida = new StringBuilder(texto.length() + 16);
        for (int i = 0; i < texto.length() && salida.length() < 1600; i++) {
            final char letra = texto.charAt(i);
            switch (letra) {
                case '"': salida.append("\\\""); break;
                case '\\': salida.append("\\\\"); break;
                case '\n': salida.append("\\n"); break;
                case '\r': break;
                case '\t': salida.append(' '); break;
                default:
                    if (letra < 0x20) salida.append(' ');
                    else salida.append(letra);
            }
        }
        return salida.toString();
    }
}
