// El cuaderno donde se apunta lo que se rompe.
//
// ── Por qué hacía falta ────────────────────────────────────────────────────
//
// Hasta ahora la aplicación no tenía ni una sola red global. El reparto de clics
// envuelve cada acción en un `try`, sí, pero eso no atrapa nada de esto:
//
//   · Una acción declarada `async` —entrar en la cuenta, sincronizar, hablar
//     con el teléfono— devuelve una promesa. El `try` que la llama termina
//     antes de que la promesa falle, así que el fallo no cae dentro del `try`:
//     sale por la puerta de atrás como «promesa rechazada sin recoger», donde
//     no había absolutamente nadie esperando.
//   · Un fallo dentro de `render()` deja la pantalla a medio escribir y sin
//     ningún aviso: el `#app` se queda con lo que hubiera, y quien mira ve una
//     aplicación congelada sin saber si esperar o cerrar.
//   · Un fallo en un oyente de eventos del navegador —un `setTimeout`, un
//     `visibilitychange`— no pasa por ningún `try` de nadie.
//
// «Ningún error secundario puede cerrar la aplicación» exige que alguien esté
// escuchando en los tres sitios. Eso es este archivo.
//
// ── Qué se guarda, y qué no ────────────────────────────────────────────────
//
// El mensaje del error, de dónde salió y cuándo. Ni el estado de la casa, ni
// nada que haya escrito una persona. Se lee desde «Más → Detalle de este
// aparato», que es donde sirve para arreglar algo a distancia sin pedirle a
// nadie que describa un error.
//
// ── Y lo que se rompió antes de que esto existiera ─────────────────────────
//
// Al final del archivo está `falloAnterior()`, que lee lo que el guardián
// nativo dejó apuntado cuando la aplicación se cerró entera. Vive aquí porque
// es el mismo cuaderno visto desde el otro lado: lo que no se pudo apuntar en
// marcha porque no quedaba proceso donde apuntarlo.

// Ocho. Los tres últimos suelen ser el mismo fallo repitiéndose, y con ocho cabe
// además lo que pasó justo antes, que es lo que explica el fallo.
const CUANTOS = 8;

const cuaderno = [];
let puesta = false;

/**
 * Apunta un fallo. Nunca lanza: una red que se rompe al recoger algo es peor
 * que no tener red, porque el error de la red sustituye al error de verdad.
 */
export function anotar(donde, error, extra = {}) {
  try {
    const fila = {
      cuando: new Date().toISOString(),
      donde: String(donde || 'desconocido'),
      mensaje: recortar(error?.message || error, 300),
      clase: String(error?.name || (error ? typeof error : 'sin-error')),
      // La pila dice en qué archivo y en qué línea. Es lo único que convierte
      // «se rompió» en algo que se pueda arreglar.
      pila: recortar(error?.stack, 900),
      ...extra
    };
    cuaderno.unshift(fila);
    if (cuaderno.length > CUANTOS) cuaderno.length = CUANTOS;
    // A la consola también: cuando el teléfono está enchufado al cable, el log
    // de Android es más rápido de leer que cualquier pantalla.
    globalThis.console?.error?.(`[¿Qué comemos?] ${fila.donde}:`, error);
    return fila;
  } catch {
    return null;
  }
}

export const fallosRecientes = () => cuaderno.map(fila => ({ ...fila }));
export const hayFallos = () => cuaderno.length > 0;
export const olvidarFallos = () => { cuaderno.length = 0; };

const recortar = (valor, tope) => String(valor ?? '').slice(0, tope);

/**
 * Pone la red bajo los tres sitios por donde se escapaban los fallos.
 *
 * `alFallar` se llama con la fila apuntada para que la aplicación pueda decir
 * algo. Se la protege aparte: si avisar falla, lo importante —que el fallo quede
 * apuntado y que la aplicación siga viva— ya ha ocurrido.
 */
export function instalarRed({ alFallar } = {}) {
  if (puesta || typeof globalThis.addEventListener !== 'function') return false;
  puesta = true;

  const avisar = fila => {
    if (!fila || typeof alFallar !== 'function') return;
    try { alFallar(fila); } catch { /* Avisar de un fallo no puede provocar otro. */ }
  };

  globalThis.addEventListener('error', evento => {
    // Los recursos que no cargan —una imagen, una hoja de estilo— también
    // disparan este evento, pero sin `error` dentro y sin burbujear. No son
    // fallos de la aplicación y no merecen un aviso en la cara.
    if (!evento?.error && !evento?.message) return;
    avisar(anotar('pantalla', evento.error || evento.message, {
      archivo: recortar(evento.filename, 200),
      linea: Number(evento.lineno) || 0
    }));
  });

  // Aquí es donde cae todo lo `async` que nadie recogió: la sesión, la nube y
  // las preguntas al teléfono.
  globalThis.addEventListener('unhandledrejection', evento => {
    avisar(anotar('promesa', evento?.reason));
  });

  return true;
}

// Solo para las pruebas: cada una necesita empezar con la red sin poner.
export function reiniciarRed() {
  puesta = false;
  cuaderno.length = 0;
}

/**
 * Envuelve una función para que no pueda tumbar a quien la llama.
 *
 * Se usa con las acciones del reparto de clics, y sirve tanto si la función es
 * normal como si es `async`: en el segundo caso se engancha también al rechazo
 * de la promesa, que es justo lo que se escapaba.
 */
export function protegida(donde, fn, alFallar) {
  return (...argumentos) => {
    try {
      const salida = fn(...argumentos);
      if (salida && typeof salida.then === 'function') {
        return salida.then(undefined, error => {
          const fila = anotar(donde, error);
          try { alFallar?.(fila); } catch { /* Ver arriba. */ }
        });
      }
      return salida;
    } catch (error) {
      const fila = anotar(donde, error);
      try { alFallar?.(fila); } catch { /* Ver arriba. */ }
      return undefined;
    }
  };
}

/* ── El otro lado del cuaderno: lo que apuntó el guardián nativo ───────────

   Capacitor deja los complementos colgando de `window.Capacitor.Plugins`. Se
   leen de ahí, que además es la comprobación de disponibilidad más honesta que
   hay: si no está, es que no está. En el navegador no está ninguno, y todo lo
   de abajo contesta que no hay nada que contar. */

const plugin = nombre => globalThis.Capacitor?.Plugins?.[nombre] || null;

// Lo que se le concede al teléfono para contestar. Son preguntas instantáneas
// cuando el teléfono está sano.
const TOPE_PREGUNTA_MS = 6000;

/* ── Nada se espera para siempre ───────────────────────────────────────────

   Cada llamada cruza el puente de Capacitor hacia código nativo que puede no
   contestar nunca, y una promesa colgada deja colgada con ella a la persona.

   `preguntar()` convierte «no contesta» en una respuesta como cualquier otra.
   Nunca lanza y nunca se queda colgada: devuelve `{ ok, valor, motivo }`, donde
   `motivo` es `'sin-respuesta'` o `'fallo'` cuando la cosa salió mal. */

async function preguntar(queEs, hacer, ms = TOPE_PREGUNTA_MS) {
  let id = null;
  const tope = new Promise(resolver => {
    id = setTimeout(() => resolver({ ok: false, motivo: 'sin-respuesta' }), ms);
    // Un temporizador pendiente no debe mantener vivo el proceso en las pruebas
    // de Node. En el navegador `id` es un número y esto no hace nada.
    id?.unref?.();
  });
  const intento = Promise.resolve()
    .then(hacer)
    .then(valor => ({ ok: true, valor }), error => ({ ok: false, motivo: 'fallo', error }));

  const salida = await Promise.race([intento, tope]);
  clearTimeout(id);
  if (salida.motivo === 'sin-respuesta') anotar('telefono', new Error(`El teléfono no contestó a ${queEs} en ${ms} ms.`));
  if (salida.motivo === 'fallo') anotar('telefono', salida.error, { pregunta: queEs });
  return salida;
}

/* ── El fallo que mató a la aplicación la vez anterior ─────────────────────

   Un fallo nativo no se puede contar desde dentro del proceso que ha matado.
   `GuardiaDeFallos` lo deja apuntado en el teléfono; esto lo lee al arrancar el
   siguiente. Es la única forma de que «se me cerró la app» deje de ser un
   informe imposible de seguir. */

export async function falloAnterior() {
  const aparato = plugin('Aparato');
  if (!aparato?.ultimoFallo) return null;
  const leido = await preguntar('ULTIMO_FALLO', () => aparato.ultimoFallo());
  if (!leido.ok || !leido.valor?.hay) return null;
  return {
    cuando: Number(leido.valor.cuando) || 0,
    clase: String(leido.valor.clase || ''),
    mensaje: String(leido.valor.mensaje || ''),
    hilo: String(leido.valor.hilo || ''),
    principal: Boolean(leido.valor.principal),
    pila: String(leido.valor.pila || '')
  };
}

export async function olvidarFalloAnterior() {
  const aparato = plugin('Aparato');
  if (!aparato?.olvidarFallo) return;
  await preguntar('OLVIDAR_FALLO', () => aparato.olvidarFallo());
}
