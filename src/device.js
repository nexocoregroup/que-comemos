// El puente con el reconocimiento de voz del teléfono.
//
// La primera versión de esto mandaba la voz a un servidor que el usuario tenía
// que montar. Era un error de diseño: esta app es para una casa corriente, y una
// casa corriente no despliega un servidor. Pedirlo convertía una función útil en
// una función que nadie iba a usar nunca.
//
// Android trae dentro el mismo reconocimiento de voz que el micrófono del
// teclado: no necesita servidor, ni clave, ni cuenta, ni cuesta dinero. Viaja
// dentro de la app y ya está. Este archivo es el puente entre ese motor nativo y
// el resto de la aplicación, que sigue siendo JavaScript corriente y no sabe
// nada de Android.
//
// Por qué no hay ni un `import` del complemento, aunque esté en package.json:
// este proyecto no tiene empaquetador, y un `import '@capgo/…'` no lo sabe
// resolver un navegador. El paquete hace falta para que el código nativo entre
// en el APK; una vez dentro, Capacitor lo deja colgando de
// `window.Capacitor.Plugins`. Se lee de ahí, que además es la comprobación de
// disponibilidad más honesta que hay: si no está, es que no está.
//
// ── El fallo que hubo aquí, anotado para que no vuelva ──────────────────────
//
// El dictado no funcionaba en el APK aunque el complemento y el permiso
// estuvieran. La causa: con `partialResults: true`, el complemento resuelve la
// promesa de `start()` **en cuanto abre el micrófono**, con la carga vacía (lo
// hace en `startInlineListening`, justo después de emitir `listeningState:
// started`). El código de antes leía `resultado.matches[0]` de esa respuesta
// vacía, concluía «No entendí nada» y, en el `finally`, retiraba el oyente de
// parciales: todo lo que la persona dijera a partir de ahí caía en el vacío.
//
// O sea: `start()` no es «la promesa del resultado», es «la promesa de que el
// micrófono está abierto». El resultado llega **por los eventos**. Todo lo de
// abajo está construido sobre esa diferencia.
//
// Segundo fallo del mismo sitio: se pedía `useOnDeviceRecognition: true` a
// ciegas «porque Android cae solo a su ruta de siempre». No cae: si el idioma no
// está descargado en el aparato, el complemento rechaza `start()` y emite
// `UNSUPPORTED_LOCALE`. Por eso ahora se pregunta antes con
// `isOnDeviceRecognitionAvailable()`.
//
// ── Cuatro reglas que gobiernan todo lo de abajo ────────────────────────────
//
//   1. Nada lanza hacia fuera. Todo devuelve `{ ok, ... }` con un motivo en
//      español, porque quien llama tiene que poder ofrecer una alternativa en
//      vez de enseñar un error. Escribir a mano siempre tiene que seguir vivo.
//   2. Lo que no se puede hacer, se dice, y no se promete de más: si no se sabe
//      si el teléfono entiende sin conexión, no se afirma que sí.
//   3. Todo se degrada. En el navegador hay dictado si el navegador lo trae; si
//      no, queda escribir a mano, que es lo que siempre ha funcionado.
//   4. El texto oído no se tira nunca. Aunque el motor acabe con error, lo que
//      la persona alcanzó a decir vuelve marcado como parcial: perderlo obliga a
//      repetir la frase entera, que es justo lo que se quería evitar.

const puente = () => globalThis.Capacitor;
const nativo = () => Boolean(puente()?.isNativePlatform?.());
const plugin = nombre => puente()?.Plugins?.[nombre] || null;

// El navegador trae su propio reconocimiento de voz. No es el mismo, necesita
// conexión y no está en todas partes; sirve para probar en la computadora.
const VozDelNavegador = () => globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;

/* ── Topes de tiempo ───────────────────────────────────────────────────────
   Ningún motor garantiza que vaya a contestar, así que aquí se le pone hora de
   cierre a todo. Quedarse con el micrófono abierto en silencio gasta batería y,
   peor, deja a la persona mirando un «escuchando…» que ya no escucha. */

// Cuarenta y cinco segundos de sesión como mucho. La compra entera de una
// quincena dictada de corrido —el ejemplo que trae la app— se dice en unos
// veinte, así que cuarenta y cinco deja margen de sobra para pensar a media
// frase; y a la vez es poco tiempo para que nadie se quede sin darse cuenta con
// el micrófono abierto si el motor se cuelga sin avisar.
const TOPE_SESION_MS = 45000;
// Doce segundos sin oír ni una palabra: el micrófono no está cogiendo nada (mal
// permiso de fondo, otra app ocupándolo, o sencillamente nadie habló). Se cierra
// y se dice, en vez de esperar a los cuarenta y cinco callados.
const TOPE_SIN_VOZ_MS = 12000;
// Al pulsar «parar», el motor todavía tiene que digerir lo último. Segundo y
// medio es lo que tarda un reconocedor de Android en soltar el resultado final;
// pasado ese plazo se devuelve lo que hubiera, porque quien pulsó parar no puede
// quedarse colgado esperando a un motor que no piensa contestar.
const GRACIA_AL_PARAR_MS = 1500;

/* ── Traducción de los códigos del motor ───────────────────────────────────
   El complemento devuelve cosas como `SPEECH_TIMEOUT` o `NO_MATCH`. Eso no se
   le enseña a nadie: cada código se convierte en una frase que dice qué pasó y
   qué hacer. El código crudo se guarda aparte, en el diagnóstico, que es donde
   sirve para arreglar el problema a distancia. */

const GENERICO = 'No se pudo escuchar. Prueba otra vez, o escríbelo a mano.';
const FALTA_PERMISO = 'Falta el permiso del micrófono. Puedes dárselo desde los ajustes del teléfono, o escribirlo a mano.';
const NO_SE_OYO = 'No se oyó nada. Prueba otra vez, más cerca del micrófono, o escríbelo a mano.';
const MICROFONO_OCUPADO = 'No se pudo usar el micrófono. Comprueba que no lo tenga ocupado otra cosa —una llamada, una nota de voz— y prueba otra vez.';

const MENSAJES = {
  // Android
  NO_MATCH: 'No se entendió lo que se dijo. Prueba otra vez, más despacio y cerca del micrófono.',
  SPEECH_TIMEOUT: NO_SE_OYO,
  INSUFFICIENT_PERMISSIONS: FALTA_PERMISO,
  AUDIO: MICROFONO_OCUPADO,
  CLIENT: 'El reconocimiento de voz se cortó solo. Prueba otra vez, o escríbelo a mano.',
  NETWORK: 'Este teléfono necesita conexión para entender la voz y ahora no la tiene. Escríbelo a mano, o prueba otra vez con datos o wifi.',
  NETWORK_TIMEOUT: 'La conexión tardó demasiado en responder. Escríbelo a mano, o prueba otra vez.',
  SERVER: 'El servicio de voz del teléfono no respondió. Prueba otra vez dentro de un momento, o escríbelo a mano.',
  SERVER_DISCONNECTED: 'El servicio de voz del teléfono se desconectó. Prueba otra vez dentro de un momento, o escríbelo a mano.',
  RECOGNIZER_BUSY: 'El micrófono seguía ocupado con el dictado anterior. Espera un momento y prueba otra vez.',
  START_FAILED: 'No se pudo abrir el micrófono. Prueba otra vez, o escríbelo a mano.',
  UNSUPPORTED_LOCALE: 'Este teléfono no tiene descargado el español para dictar sin conexión. Se descarga desde los ajustes de voz del teléfono; mientras tanto, escríbelo a mano.',
  NOT_AVAILABLE: 'Este teléfono no trae reconocimiento de voz. Escríbelo a mano, o usa el micrófono del teclado.',
  // iOS, por si el día de mañana hay versión para iPhone
  MICROPHONE_PERMISSION_DENIED: FALTA_PERMISO,
  ON_DEVICE_RECOGNITION_UNAVAILABLE: 'Este teléfono no entiende la voz sin conexión. Se puede dictar con datos o wifi, o escribirlo a mano.',
  RECOGNIZER_UNAVAILABLE: 'Este teléfono no trae reconocimiento de voz. Escríbelo a mano, o usa el micrófono del teclado.',
  AUDIO_SESSION_FAILED: MICROFONO_OCUPADO,
  AUDIO_ENGINE_START_FAILED: MICROFONO_OCUPADO,
  MODERN_START_FAILED: 'No se pudo abrir el micrófono. Prueba otra vez, o escríbelo a mano.',
  // Navegador: sus códigos vienen en minúsculas y con guiones.
  'not-allowed': FALTA_PERMISO,
  'service-not-allowed': FALTA_PERMISO,
  'no-speech': NO_SE_OYO,
  'audio-capture': 'No se encontró ningún micrófono en este aparato. Escríbelo a mano.',
  network: 'El dictado del navegador necesita conexión y ahora no la hay. Escríbelo a mano, o prueba otra vez.',
  aborted: 'Se cortó el dictado antes de terminar.'
};

function mensajeDeCodigo(codigo) {
  const clave = String(codigo || '').trim();
  return MENSAJES[clave] || MENSAJES[clave.toUpperCase()] || GENERICO;
}

/* ── Diagnóstico ───────────────────────────────────────────────────────────
   Se guardan códigos y metadatos, nunca audio ni la transcripción: para saber
   por qué falló un dictado hace falta el código del motor, no lo que se dijo en
   la cocina. */

let ultimoError = null;   // { cuando, origen, codigo, mensaje }
let ultimoMotor = null;   // { cuando, origen, idioma, local }
// `null` significa «todavía no se ha preguntado», que no es lo mismo que `false`.
let reconocimientoLocalConocido = null;

function apuntarError(origen, codigo, detalle) {
  ultimoError = {
    cuando: new Date().toISOString(),
    origen,
    codigo: String(codigo || 'DESCONOCIDO'),
    // El mensaje del motor viene en inglés y con jerga: sirve para diagnosticar,
    // no para enseñárselo a nadie, y por eso vive aquí y no en `error`.
    mensaje: String(detalle?.message || detalle || '').slice(0, 200)
  };
  return ultimoError;
}

export function ultimoErrorDeDictado() {
  return ultimoError ? { ...ultimoError } : null;
}

/* ── Qué puede hacer este aparato ──────────────────────────────────────────
   `capacidad()` es síncrona porque se llama al pintar cada pantalla, y ahí no se
   puede esperar a nadie. Por eso solo puede mirar lo que se sabe sin preguntar:
   si el complemento está y si estamos dentro de la app instalada. Lo que exige
   una pregunta al motor —si entiende sin conexión, si el servicio existe de
   verdad— está en `comprobarDictado()`, que sí es asíncrona. */

export function capacidad(cual) {
  if (cual === 'dictar') {
    if (nativo() && plugin('SpeechRecognition')) {
      return { ok: true, origen: 'telefono', local: reconocimientoLocalConocido, detalle: detalleDelTelefono() };
    }
    if (VozDelNavegador()) {
      return { ok: true, origen: 'navegador', local: false, detalle: 'Reconocimiento de voz del navegador. Necesita conexión y pasa por los servidores del navegador.' };
    }
    return { ok: false, origen: 'ninguno', local: false, detalle: 'Este aparato no ofrece dictado. En Android, el micrófono del teclado escribe en cualquier campo.' };
  }
  return { ok: false, origen: 'ninguno', detalle: 'Capacidad desconocida.' };
}

// Antes esto prometía «no necesita conexión» siempre que el complemento
// estuviera, y era mentira en los teléfonos que no traen el idioma descargado:
// esos mandan la voz a Google igual. Mientras nadie haya preguntado, se dice que
// no se sabe, que es la verdad.
function detalleDelTelefono() {
  if (reconocimientoLocalConocido === true) {
    return 'Reconocimiento de voz de Android, dentro del aparato: no necesita conexión y tu voz no sale del teléfono.';
  }
  if (reconocimientoLocalConocido === false) {
    return 'Reconocimiento de voz de Android, el mismo del micrófono del teclado. Este teléfono no lo trae dentro, así que necesita conexión para entender la voz.';
  }
  return 'Reconocimiento de voz de Android, el mismo del micrófono del teclado. Si además funciona sin conexión depende de este teléfono; se comprueba al abrir el micrófono.';
}

// La respuesta honesta y completa, con lo que hay que preguntarle al motor. La
// pantalla de diagnóstico la puede esperar; el pintado de cada pantalla no.
export async function comprobarDictado({ idioma = 'es-DO' } = {}) {
  const base = capacidad('dictar');
  if (base.origen !== 'telefono') return { ...base, local: false, permiso: null, idioma, motor: base.origen };

  const voz = plugin('SpeechRecognition');
  const servicio = await hayServicio(voz);
  if (servicio === false) {
    return {
      ok: false, origen: 'ninguno', local: false, permiso: null, idioma, motor: 'telefono',
      detalle: MENSAJES.NOT_AVAILABLE
    };
  }
  const local = await reconocimientoLocal(voz, idioma);
  const permiso = await estadoDelPermiso(voz);
  return { ok: true, origen: 'telefono', local, permiso, idioma, motor: 'telefono', detalle: detalleDelTelefono() };
}

// Para la pantalla de diagnóstico: qué soporta este teléfono en concreto, que es
// la única respuesta que sirve de verdad. Decir «funciona en Android» no ayuda a
// quien lo tiene en la mano y no le funciona.
// ¿Va a salir la voz de este aparato? Una sola respuesta para toda la app.
//
// Había tres sitios prometiendo «tu voz no sale del teléfono» sin condición, y
// en un teléfono sin el paquete de español descargado eso era falso: Android
// manda el audio a sus servidores igual. Tres textos fijos no pueden decir la
// verdad de un aparato que todavía no se ha comprobado; esta función sí.
//
// Devuelve el aviso que hay que enseñar ANTES de abrir el micrófono, o `null`
// cuando no hay nada que avisar. Conviene llamar antes a `comprobarDictado()`:
// mientras nadie haya preguntado, `local` vale `null` y aquí se dice justamente
// eso, que no se sabe.
export function avisoDeVoz() {
  const motor = capacidad('dictar');
  if (!motor.ok) return null;
  if (motor.origen === 'navegador') {
    return 'Aquí el dictado lo hace el navegador, así que tu voz sale hacia sus servidores para convertirse en texto. Si prefieres que no salga, escríbelo.';
  }
  if (motor.local === false) {
    return 'Este teléfono no trae el reconocimiento de voz dentro, así que Android manda el audio a sus servidores para entenderlo. Lo hace el sistema, no esta app, pero pasa igual. Si prefieres que no salga, escríbelo.';
  }
  if (motor.local === null) {
    return 'Todavía no se ha comprobado si este teléfono entiende la voz por sí solo. Si no puede, Android mandará el audio a sus servidores para convertirlo en texto.';
  }
  return null;
}

export function diagnostico() {
  return {
    plataforma: nativo() ? `Aplicación instalada (${puente()?.getPlatform?.() || 'android'})` : 'Navegador',
    dictar: capacidad('dictar'),
    // Sin esto, «no me funciona» es imposible de diagnosticar a distancia.
    complementos: {
      SpeechRecognition: Boolean(plugin('SpeechRecognition'))
    },
    voz: {
      // `null` = nadie lo ha comprobado todavía; `false` = se comprobó y no hay.
      reconocimientoLocal: reconocimientoLocalConocido,
      escuchando: Boolean(sesionNativa || sesionNavegador),
      // Qué motor se usó la última vez y con qué idioma. Ni audio ni texto: eso
      // es de quien dictó, y para diagnosticar no hace ninguna falta.
      ultimoMotor: ultimoMotor ? { ...ultimoMotor } : null,
      ultimoError: ultimoErrorDeDictado()
    }
  };
}

/* ── Permiso del micrófono ─────────────────────────────────────────────────
   «Denegado» y «no se pudo preguntar» son cosas distintas y llevan a consejos
   distintos: una se arregla en los ajustes del teléfono y la otra, casi siempre,
   cerrando y abriendo la app. Mezclarlas manda a la persona al sitio equivocado. */

export async function permisoDeVoz() {
  const voz = plugin('SpeechRecognition');
  if (!voz) {
    return { ok: Boolean(VozDelNavegador()), motivo: 'navegador', detalle: 'El navegador pide el permiso al empezar a escuchar.' };
  }
  let estado = null;
  try {
    estado = (await voz.checkPermissions())?.speechRecognition || null;
  } catch (error) {
    apuntarError('telefono', 'CHECK_PERMISSIONS', error);
    return { ok: false, motivo: 'error', detalle: 'No se pudo consultar el permiso del micrófono. Prueba a cerrar y abrir la aplicación, o escríbelo a mano.' };
  }
  if (estado === 'granted') return { ok: true, motivo: 'concedido' };

  let pedido = null;
  try {
    pedido = (await voz.requestPermissions())?.speechRecognition || null;
  } catch (error) {
    apuntarError('telefono', 'REQUEST_PERMISSIONS', error);
    return { ok: false, motivo: 'error', detalle: 'No se pudo pedir el permiso del micrófono. Prueba a cerrar y abrir la aplicación, o escríbelo a mano.' };
  }
  if (pedido === 'granted') return { ok: true, motivo: 'concedido' };
  return { ok: false, motivo: 'denegado', detalle: FALTA_PERMISO };
}

async function estadoDelPermiso(voz) {
  // Aquí solo se mira, no se pide: preguntar por el permiso en una pantalla de
  // diagnóstico le saldría a la persona como un cartel del sistema sin venir a
  // cuento.
  try { return (await voz.checkPermissions())?.speechRecognition || null; }
  catch (error) { apuntarError('telefono', 'CHECK_PERMISSIONS', error); return null; }
}

async function hayServicio(voz) {
  try {
    const respuesta = await voz.available();
    // Solo un `false` explícito cierra la puerta. Que la respuesta venga rara no
    // prueba que el motor no esté, y negarse a intentarlo por eso sería peor que
    // intentarlo y fallar con un aviso claro.
    return respuesta?.available === false ? false : true;
  } catch (error) {
    apuntarError('telefono', 'AVAILABLE', error);
    return true;
  }
}

async function reconocimientoLocal(voz, idioma) {
  if (typeof voz?.isOnDeviceRecognitionAvailable !== 'function') return null;
  try {
    const respuesta = await voz.isOnDeviceRecognitionAvailable({ language: idioma });
    reconocimientoLocalConocido = Boolean(respuesta?.available);
    return reconocimientoLocalConocido;
  } catch (error) {
    apuntarError('telefono', 'ON_DEVICE_CHECK', error);
    // No se sabe: ni se promete que sí ni se descarta. Se pedirá el modo normal,
    // que funciona en los dos casos.
    return null;
  }
}

/* ── Dictar ────────────────────────────────────────────────────────────────

   `dictar({ onParcial, onEstado, idioma })` devuelve:

     { ok: true,  texto, origen, parcial, local }
     { ok: false, error, origen, cancelado? }

   `onParcial(texto)` recibe lo que se va oyendo, para enseñarlo mientras se
   habla. `onEstado(estado)` recibe 'preparando' | 'escuchando' | 'procesando' |
   'listo', para que la interfaz sepa qué decir. Los dos son opcionales y, si
   fallan, no tumban el dictado: son adorno, no motor.

   Devuelve lo que oyó; no lo ejecuta. Quien llama tiene que enseñar el texto
   para que la persona lo lea y lo corrija: una transcripción se equivoca, y
   actuar sobre ella sin verla es como firmar sin leer. */

export async function dictar({ onParcial, onEstado, idioma = 'es-DO' } = {}) {
  const disponible = capacidad('dictar');
  if (!disponible.ok) return { ok: false, origen: disponible.origen, error: disponible.detalle };
  try {
    return disponible.origen === 'telefono'
      ? await dictarNativo(onParcial, onEstado, idioma)
      : await dictarNavegador(onParcial, onEstado, idioma);
  } catch (error) {
    // Regla 1: de aquí no sale nunca una excepción. Quien llama tiene una
    // pantalla abierta con alguien esperando, y lo que necesita es una frase.
    apuntarError(disponible.origen, 'INESPERADO', error);
    return { ok: false, origen: disponible.origen, error: GENERICO };
  }
}

// Parar es cerrar el micrófono y quedarse con lo dicho. No es cancelar: el
// dictado en curso se resuelve con el texto que hubiera.
export async function pararDictado() {
  const sesion = sesionNativa;
  if (sesion && !sesion.terminado) {
    avisar(sesion, 'procesando');
    // Red de seguridad: si el motor no suelta el resultado final, a los segundo y
    // medio se devuelve lo que se llevaba oído.
    sesion.relojes.push(reloj(() => finalizar(sesion, { motivo: 'parada' }), GRACIA_AL_PARAR_MS));
    try { await sesion.voz?.stop?.(); }
    catch (error) { apuntarError('telefono', 'STOP', error); finalizar(sesion, { motivo: 'parada' }); }
    return;
  }
  sesionNavegador?.parar?.();
}

// Cancelar es lo que hace la app al cerrar el modal o salir de la pantalla: se
// para el motor y se retiran los oyentes. Sin esto, un oyente huérfano seguiría
// escribiendo en una pantalla que ya no existe, y el siguiente dictado heredaría
// los oyentes del anterior.
export async function cancelarDictado() {
  const nativa = sesionNativa;
  const navegador = sesionNavegador;
  if (nativa) await finalizar(nativa, { motivo: 'cancelado' });
  navegador?.cancelar?.();
  const voz = plugin('SpeechRecognition');
  if (!voz) return;
  // Y una pasada final aunque no hubiera sesión viva: el modal puede cerrarse
  // después de que el dictado acabara solo, y lo que se busca aquí es la
  // certeza de dejar el motor limpio, no el ahorro de una llamada.
  try { await voz.removeAllListeners?.(); } catch (error) { apuntarError('telefono', 'REMOVE_LISTENERS', error); }
  try { await voz.stop?.(); } catch { /* si ya estaba parado, mejor */ }
}

/* ── Dictado con el motor del teléfono ─────────────────────────────────────

   El orden importa y es este:

     1. ¿existe el servicio de verdad?  (`available()`, no solo que el
        complemento esté colgado de `window`)
     2. ¿hay permiso?                    (y si no, por qué no)
     3. ¿entiende sin conexión?          (para no pedir una ruta que rechaza)
     4. limpiar oyentes viejos, poner los nuestros
     5. abrir el micrófono
     6. esperar a los EVENTOS, no a la promesa de `start()`

   El paso 6 es el arreglo del fallo: la promesa de `start()` solo dice que el
   micrófono se abrió. */

let sesionNativa = null;

async function dictarNativo(onParcial, onEstado, idioma) {
  const voz = plugin('SpeechRecognition');
  // Dos dictados a la vez se pelearían por el mismo motor y por los mismos
  // oyentes. El anterior se cierra antes de abrir el siguiente.
  if (sesionNativa) await cancelarDictado();

  if ((await hayServicio(voz)) === false) {
    apuntarError('telefono', 'NOT_AVAILABLE', 'available() devolvió false');
    return { ok: false, origen: 'telefono', error: MENSAJES.NOT_AVAILABLE };
  }
  const permiso = await permisoDeVoz();
  if (!permiso.ok) return { ok: false, origen: 'telefono', error: permiso.detalle, motivo: permiso.motivo };

  const local = await reconocimientoLocal(voz, idioma);
  ultimoMotor = { cuando: new Date().toISOString(), origen: 'telefono', idioma, local };

  const sesion = {
    voz, onParcial, onEstado, local,
    parcial: '', confirmado: false, terminado: false, cierre: null, codigo: null,
    oyentes: [], relojes: [], resolver: null, estado: null
  };
  sesionNativa = sesion;
  const espera = new Promise(resolver => { sesion.resolver = resolver; });

  avisar(sesion, 'preparando');
  try {
    // Antes de poner los nuestros: si quedó algo de un dictado anterior que
    // acabó mal, dos oyentes escribirían la misma frase dos veces.
    await voz.removeAllListeners?.();
    await registrarOyentes(sesion);
  } catch (error) {
    finalizar(sesion, { motivo: 'error', codigo: apuntarError('telefono', 'ADD_LISTENER', error).codigo });
    return espera;
  }

  armarRelojes(sesion);
  // `start()` NO se espera aquí dentro a propósito. Si el motor decidiera dejar
  // esa promesa colgada, esperarla dejaría colgado también a quien llamó, aunque
  // los eventos ya hubieran dado el resultado. Se atiende aparte.
  Promise.resolve()
    .then(() => voz.start({
      language: idioma,
      maxResults: 1,
      // Siempre en modo parcial: es la única forma de ver el texto mientras se
      // habla, y el resultado final llega igual por el evento `partialResults`.
      partialResults: true,
      // Sin ventana del sistema: la app enseña su propio indicador, y así el
      // texto reconocido vuelve aquí en vez de quedarse en un diálogo ajeno.
      popup: false,
      // Solo si este teléfono lo trae de verdad. Pedirlo a ciegas hace que el
      // complemento rechace el arranque con `UNSUPPORTED_LOCALE` en cuanto el
      // idioma no esté descargado.
      useOnDeviceRecognition: local === true
    }))
    .then(arranque => {
      // Con `partialResults: true` esto llega vacío y no significa nada: el
      // micrófono se abrió, y ya. Solo se usa si trae matches, que es lo que
      // ocurre en el modo sin parciales.
      const texto = primerTexto(arranque?.matches);
      if (texto) finalizar(sesion, { motivo: 'final', texto, confirmado: true });
    })
    .catch(error => {
      // Si la sesión ya terminó, este rechazo es el eco de haberla parado
      // («Recognition stopped before final results were produced») y no es una
      // noticia: no se pisa el resultado bueno ni se ensucia el diagnóstico.
      if (sesion.terminado) return;
      const apuntado = apuntarError('telefono', codigoDeExcepcion(error), error);
      finalizar(sesion, { motivo: 'error', codigo: apuntado.codigo });
    });

  return espera;
}

async function registrarOyentes(sesion) {
  const { voz } = sesion;
  const poner = async (evento, manejador) => {
    const oyente = await voz.addListener(evento, manejador);
    // Se guarda el mango para retirarlo al terminar: es lo que evita que dos
    // dictados seguidos acumulen oyentes.
    if (oyente) sesion.oyentes.push(oyente);
  };

  await poner('partialResults', datos => {
    // `accumulatedText` manda cuando viene: incluye lo dicho en tandas
    // anteriores de la misma sesión, y `matches` solo trae el trozo de ahora.
    const texto = String(datos?.accumulatedText || '').trim() || primerTexto(datos?.matches);
    if (!texto || sesion.terminado) return;
    sesion.parcial = texto;
    llamar(sesion.onParcial, texto);
  });

  await poner('listeningState', datos => {
    // `status` es el campo viejo del complemento; se mira por si el aparato trae
    // una versión nativa anterior a los estados finitos.
    const estado = datos?.state || datos?.status;
    if (estado === 'started') { avisar(sesion, 'escuchando'); return; }
    if (estado === 'stoppingListening') { avisar(sesion, 'procesando'); return; }
    if (estado !== 'stopped') return;
    const razon = datos?.reason || 'unknown';
    if (razon === 'error') {
      finalizar(sesion, { motivo: 'error', codigo: datos?.errorCode || sesion.codigo });
      return;
    }
    if (razon === 'silence') { finalizar(sesion, { motivo: 'silencio' }); return; }
    // `results` significa que el motor ya soltó su resultado final, y ese
    // resultado vino por `partialResults` justo antes: lo que tenemos es el
    // texto bueno, no un trozo a medias.
    if (razon === 'results') { finalizar(sesion, { motivo: 'final', confirmado: true }); return; }
    finalizar(sesion, { motivo: 'parada' });
  });

  await poner('error', datos => {
    const apuntado = apuntarError('telefono', datos?.code, datos?.message);
    sesion.codigo = apuntado.codigo;
    // Aquí está la regla 4: si ya se había oído algo, el error no lo borra.
    finalizar(sesion, { motivo: 'error', codigo: apuntado.codigo });
  });
}

function armarRelojes(sesion) {
  sesion.relojes.push(reloj(() => finalizar(sesion, { motivo: 'tope' }), TOPE_SESION_MS));
  sesion.relojes.push(reloj(() => {
    if (!sesion.parcial) finalizar(sesion, { motivo: 'silencio' });
  }, TOPE_SIN_VOZ_MS));
}

function finalizar(sesion, info) {
  if (sesion.terminado) return sesion.cierre || Promise.resolve();
  sesion.terminado = true;
  sesion.cierre = cerrar(sesion, info);
  return sesion.cierre;
}

async function cerrar(sesion, info) {
  limpiarRelojes(sesion);
  if (info.motivo !== 'cancelado') avisar(sesion, 'procesando');

  let texto = String(info.texto || '').trim();
  let confirmado = Boolean(info.confirmado) && Boolean(texto);
  if (!texto && sesion.parcial) {
    texto = sesion.parcial;
    // Un `stopped` por `results` confirma el texto aunque llegara por el evento
    // de parciales: el motor lo dio por final antes de cerrar.
    confirmado = Boolean(info.confirmado);
  }
  if (!texto) {
    // Última red: el complemento guarda el último parcial aunque el evento se
    // haya perdido por el camino. Cuesta una llamada y salva la frase entera.
    try {
      const guardado = await sesion.voz?.getLastPartialResult?.();
      if (guardado?.available) {
        texto = String(guardado.text || '').trim() || primerTexto(guardado.matches);
        confirmado = false;
      }
    } catch (error) { apuntarError('telefono', 'LAST_PARTIAL', error); }
  }

  await soltarOyentes(sesion);
  try { await sesion.voz?.stop?.(); } catch { /* si ya estaba parado, mejor */ }
  if (sesionNativa === sesion) sesionNativa = null;
  avisar(sesion, 'listo');
  sesion.resolver(salidaNativa(sesion, info, texto, confirmado));
}

function salidaNativa(sesion, info, texto, confirmado) {
  const base = { origen: 'telefono', local: sesion.local };
  if (info.motivo === 'cancelado') {
    // Se devuelve el texto por si a quien llama le sirve, pero con `ok: false`:
    // cerrar la pantalla no es terminar de dictar.
    return { ...base, ok: false, cancelado: true, texto, error: 'Se cerró el dictado antes de terminar.' };
  }
  if (texto) {
    const salida = { ...base, ok: true, texto, parcial: !confirmado };
    // Hubo error pero hay texto: se entrega, y se dice que quedó a medias.
    if (info.motivo === 'error') salida.aviso = mensajeDeCodigo(info.codigo);
    return salida;
  }
  if (info.motivo === 'error') return { ...base, ok: false, error: mensajeDeCodigo(info.codigo) };
  if (info.motivo === 'tope') return { ...base, ok: false, error: 'Se cerró el micrófono después de un rato sin entender nada. Prueba otra vez, o escríbelo a mano.' };
  return { ...base, ok: false, error: NO_SE_OYO };
}

async function soltarOyentes(sesion) {
  const oyentes = sesion.oyentes;
  sesion.oyentes = [];
  for (const oyente of oyentes) {
    try { await oyente?.remove?.(); } catch (error) { apuntarError('telefono', 'REMOVE_LISTENER', error); }
  }
}

/* ── Dictado con el motor del navegador ────────────────────────────────────
   Sirve para probar en la computadora, y se rige por las mismas garantías: no
   se pierde lo oído a medias, no quedan manejadores colgando y se puede parar. */

let sesionNavegador = null;

function dictarNavegador(onParcial, onEstado, idioma) {
  return new Promise(resolver => {
    const Motor = VozDelNavegador();
    let motor = null;
    try { motor = new Motor(); }
    catch (error) {
      apuntarError('navegador', 'NEW_ENGINE', error);
      resolver({ ok: false, origen: 'navegador', error: 'No se pudo abrir el micrófono.' });
      return;
    }
    motor.lang = idioma;
    motor.interimResults = true;
    motor.maxAlternatives = 1;

    const sesion = { onEstado, relojes: [], terminado: false, parcial: '', confirmado: false, estado: null };
    sesionNavegador = sesion;
    ultimoMotor = { cuando: new Date().toISOString(), origen: 'navegador', idioma, local: false };

    const terminar = salida => {
      if (sesion.terminado) return;
      sesion.terminado = true;
      limpiarRelojes(sesion);
      // Los manejadores se sueltan a mano: un motor que se queda con `onresult`
      // apuntando aquí seguiría escribiendo en una pantalla que ya no existe.
      motor.onresult = null;
      motor.onerror = null;
      motor.onend = null;
      motor.onstart = null;
      if (sesionNavegador === sesion) sesionNavegador = null;
      avisar(sesion, 'listo');
      resolver(salida);
    };

    sesion.parar = () => { avisar(sesion, 'procesando'); try { motor.stop(); } catch { /* ya estaba parado */ } };
    sesion.cancelar = () => {
      try { (motor.abort || motor.stop).call(motor); } catch { /* ya estaba parado */ }
      terminar({ ok: false, origen: 'navegador', cancelado: true, texto: sesion.parcial, error: 'Se cerró el dictado antes de terminar.' });
    };

    motor.onstart = () => avisar(sesion, 'escuchando');
    motor.onresult = evento => {
      sesion.parcial = [...evento.results].map(fila => fila[0].transcript).join(' ').trim();
      const ultimaFila = evento.results[evento.results.length - 1];
      if (ultimaFila?.isFinal) sesion.confirmado = true;
      else llamar(onParcial, sesion.parcial);
    };
    // Lo dicho a medias no se tira aunque el motor acabe con error: es lo único
    // que la persona llegó a decir, y perderlo obliga a repetir la frase entera.
    motor.onerror = evento => {
      apuntarError('navegador', evento?.error, evento?.message);
      terminar(sesion.parcial
        ? { ok: true, origen: 'navegador', texto: sesion.parcial, parcial: true, aviso: mensajeDeCodigo(evento?.error) }
        : { ok: false, origen: 'navegador', error: mensajeDeCodigo(evento?.error) });
    };
    motor.onend = () => terminar(sesion.parcial
      ? { ok: true, origen: 'navegador', texto: sesion.parcial, parcial: !sesion.confirmado }
      : { ok: false, origen: 'navegador', error: NO_SE_OYO });

    avisar(sesion, 'preparando');
    sesion.relojes.push(reloj(() => {
      try { motor.stop(); } catch { /* si no para solo, el `onend` no vendrá */ }
      terminar(sesion.parcial
        ? { ok: true, origen: 'navegador', texto: sesion.parcial, parcial: true }
        : { ok: false, origen: 'navegador', error: NO_SE_OYO });
    }, TOPE_SESION_MS));

    try { motor.start(); }
    catch (error) {
      apuntarError('navegador', 'START', error);
      terminar({ ok: false, origen: 'navegador', error: 'No se pudo abrir el micrófono.' });
    }
  });
}

/* ── Piezas pequeñas ───────────────────────────────────────────────────────── */

const primerTexto = lista => String((Array.isArray(lista) ? lista[0] : '') || '').trim();

// Los adornos de la interfaz —el texto vivo, el «escuchando…»— no pueden tumbar
// el dictado: si quien llama se rompe pintando, el micrófono sigue su camino.
function llamar(fn, valor) {
  if (typeof fn !== 'function') return;
  try { fn(valor); } catch (error) { apuntarError('interfaz', 'CALLBACK', error); }
}

function avisar(sesion, estado) {
  if (!sesion || sesion.estado === estado) return;
  sesion.estado = estado;
  llamar(sesion.onEstado, estado);
}

function reloj(fn, ms) {
  const id = setTimeout(fn, ms);
  // Un temporizador pendiente no debe mantener vivo el proceso en las pruebas de
  // Node. En el navegador `id` es un número y esto no hace nada.
  id?.unref?.();
  return id;
}

function limpiarRelojes(sesion) {
  for (const id of sesion.relojes || []) clearTimeout(id);
  sesion.relojes = [];
}

// El complemento rechaza con mensajes en inglés, no con códigos. Se reconocen
// los que tienen consejo propio y el resto cae en el mensaje genérico.
function codigoDeExcepcion(error) {
  const texto = String(error?.message || error || '');
  if (/on-device recognition is not available/i.test(texto)) return 'UNSUPPORTED_LOCALE';
  if (/missing permission/i.test(texto)) return 'INSUFFICIENT_PERMISSIONS';
  if (/already running/i.test(texto)) return 'RECOGNIZER_BUSY';
  if (/not available/i.test(texto)) return 'NOT_AVAILABLE';
  return 'START_FAILED';
}
