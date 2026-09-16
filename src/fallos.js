// El cuaderno donde se apunta lo que se rompe.
//
// ── Por qué hacía falta ────────────────────────────────────────────────────
//
// Hasta ahora la aplicación no tenía ni una sola red global. El reparto de clics
// envuelve cada acción en un `try`, sí, pero eso no atrapa nada de esto:
//
//   · Una acción declarada `async` —y el dictado lo es en los cuatro sitios—
//     devuelve una promesa. El `try` que la llama termina antes de que la
//     promesa falle, así que el fallo no cae dentro del `try`: sale por la
//     puerta de atrás como «promesa rechazada sin recoger», donde no había
//     absolutamente nadie esperando.
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
// El mensaje del error, de dónde salió y cuándo. Ni el estado de la casa, ni lo
// que se dictó, ni nada que haya escrito una persona. Y no sale del teléfono: no
// hay a dónde mandarlo, porque esta aplicación no habla con ninguna red. Se lee
// desde «Más → Detalle técnico de este aparato», que es donde sirve para
// arreglar algo a distancia sin pedirle a nadie que describa un error.

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

  // Aquí es donde caían los fallos del dictado, que es todo `async`.
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
