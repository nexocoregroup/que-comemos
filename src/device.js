// Lo que el teléfono sabe hacer solo.
//
// La primera versión de esto mandaba la voz y las fotos a un servidor que el
// usuario tenía que montar. Era un error de diseño: esta app es para una casa
// corriente, y una casa corriente no despliega un servidor. Pedirlo convertía
// dos funciones útiles en dos funciones que nadie iba a usar nunca.
//
// Android trae dentro casi todo lo que hacía falta:
//
//   · Reconocimiento de voz nativo, el mismo del micrófono del teclado.
//   · ML Kit Text Recognition, que lee texto de una foto sin salir del aparato.
//
// Ninguno necesita servidor, ni clave, ni cuenta, ni conexión, ni cuesta
// dinero. Viajan dentro de la app y ya están. Este archivo es el puente entre
// esos motores nativos y el resto de la aplicación, que sigue siendo
// JavaScript corriente y no sabe nada de Android.
//
// Por qué no hay ni un `import` de los complementos, aunque estén en
// package.json: este proyecto no tiene empaquetador, y un `import '@capgo/…'`
// no lo sabe resolver un navegador. Los paquetes hacen falta para que el código
// nativo entre en el APK; una vez dentro, Capacitor los deja colgando de
// `window.Capacitor.Plugins`. Se leen de ahí, que además es la comprobación de
// disponibilidad más honesta que hay: si no está, es que no está.
//
// Tres reglas que gobiernan todo lo de abajo:
//
//   1. Nada lanza hacia fuera. Todo devuelve `{ ok, ... }` con un motivo en
//      español, porque quien llama tiene que poder ofrecer una alternativa en
//      vez de enseñar un error.
//   2. Lo que no se puede hacer, se dice. Nunca se simula: una transcripción
//      inventada o un texto de factura falso serían mucho peores que un aviso.
//   3. Todo se degrada. En el navegador hay dictado si el navegador lo trae, y
//      no hay lectura de fotos. En los dos casos queda escribir a mano, que es
//      lo que siempre ha funcionado.

const puente = () => globalThis.Capacitor;
const nativo = () => Boolean(puente()?.isNativePlatform?.());
const plugin = nombre => puente()?.Plugins?.[nombre] || null;

// El navegador trae su propio reconocimiento de voz. No es el mismo, necesita
// conexión y no está en todas partes; sirve para probar en la computadora.
const VozDelNavegador = () => globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;

/* ── Qué puede hacer este aparato ──────────────────────────────────────── */

export function capacidad(cual) {
  if (cual === 'dictar') {
    if (nativo() && plugin('SpeechRecognition')) {
      return { ok: true, origen: 'telefono', detalle: 'Reconocimiento de voz de Android, dentro del aparato. No necesita conexión y tu voz no sale del teléfono.' };
    }
    if (VozDelNavegador()) {
      return { ok: true, origen: 'navegador', detalle: 'Reconocimiento de voz del navegador. Necesita conexión y pasa por los servidores del navegador.' };
    }
    return { ok: false, origen: 'ninguno', detalle: 'Este aparato no ofrece dictado. En Android, el micrófono del teclado escribe en cualquier campo.' };
  }
  if (cual === 'leer-foto') {
    if (nativo() && plugin('TextRecognition')) {
      return { ok: true, origen: 'telefono', detalle: 'Lectura de texto de Google, dentro del aparato. Sin conexión, y la foto no se envía a ningún sitio.' };
    }
    return { ok: false, origen: 'ninguno', detalle: 'Leer facturas de una foto solo funciona en la aplicación instalada de Android, no en el navegador.' };
  }
  if (cual === 'camara') {
    if (nativo() && plugin('Camera')) return { ok: true, origen: 'telefono', detalle: 'Cámara del teléfono.' };
    return { ok: false, origen: 'navegador', detalle: 'Se usa el selector de archivos del navegador.' };
  }
  return { ok: false, origen: 'ninguno', detalle: 'Capacidad desconocida.' };
}

// Para la pantalla de diagnóstico: qué soporta este teléfono en concreto, que
// es la única respuesta que sirve de verdad. Decir «funciona en Android» no
// ayuda a quien lo tiene en la mano y no le funciona.
export function diagnostico() {
  return {
    plataforma: nativo() ? `Aplicación instalada (${puente()?.getPlatform?.() || 'android'})` : 'Navegador',
    dictar: capacidad('dictar'),
    leerFoto: capacidad('leer-foto'),
    camara: capacidad('camara'),
    // Sin esto, «no me funciona» es imposible de diagnosticar a distancia.
    complementos: {
      SpeechRecognition: Boolean(plugin('SpeechRecognition')),
      TextRecognition: Boolean(plugin('TextRecognition')),
      Camera: Boolean(plugin('Camera')),
      Filesystem: Boolean(plugin('Filesystem'))
    }
  };
}

/* ── Dictar ────────────────────────────────────────────────────────────── */

export async function permisoDeVoz() {
  const voz = plugin('SpeechRecognition');
  if (!voz) return { ok: Boolean(VozDelNavegador()), detalle: 'El navegador pide el permiso al empezar a escuchar.' };
  try {
    const estado = await voz.checkPermissions();
    if (estado?.speechRecognition === 'granted') return { ok: true };
    const pedido = await voz.requestPermissions();
    if (pedido?.speechRecognition === 'granted') return { ok: true };
    return { ok: false, detalle: 'Hace falta permiso para el micrófono. Puedes dárselo desde los ajustes del teléfono, o escribirlo a mano.' };
  } catch {
    return { ok: false, detalle: 'No se pudo pedir el permiso del micrófono.' };
  }
}

// Devuelve lo que oyó; no lo ejecuta. Quien llama tiene que enseñar el texto
// para que la persona lo lea y lo corrija: una transcripción se equivoca, y
// actuar sobre ella sin verla es como firmar sin leer.
export async function dictar({ onParcial, idioma = 'es-DO' } = {}) {
  const disponible = capacidad('dictar');
  if (!disponible.ok) return { ok: false, error: disponible.detalle };
  return disponible.origen === 'telefono' ? dictarNativo(onParcial, idioma) : dictarNavegador(onParcial, idioma);
}

async function dictarNativo(onParcial, idioma) {
  const permiso = await permisoDeVoz();
  if (!permiso.ok) return { ok: false, error: permiso.detalle };
  const voz = plugin('SpeechRecognition');
  let quitar = () => {};
  try {
    if (onParcial) {
      const oyente = await voz.addListener('partialResults', datos => {
        const texto = datos?.matches?.[0];
        if (texto) onParcial(texto);
      });
      quitar = () => oyente?.remove?.();
    }
    const resultado = await voz.start({
      language: idioma,
      maxResults: 1,
      partialResults: Boolean(onParcial),
      // Sin ventana del sistema: la app enseña su propio indicador, y así el
      // texto reconocido vuelve aquí en vez de quedarse en un diálogo ajeno.
      popup: false,
      // Dentro del aparato cuando el teléfono lo soporta: sin conexión y sin
      // que la voz salga de casa. Si no lo soporta, Android cae solo a su ruta
      // de siempre, así que pedirlo nunca empeora nada.
      useOnDeviceRecognition: true
    });
    const texto = String(resultado?.matches?.[0] || '').trim();
    return texto
      ? { ok: true, texto, origen: 'telefono' }
      : { ok: false, error: 'No entendí nada. Prueba otra vez, más cerca del micrófono.' };
  } catch {
    return { ok: false, error: 'No se pudo escuchar. Prueba otra vez o escríbelo a mano.' };
  } finally {
    quitar();
  }
}

let pararNavegador = null;
function dictarNavegador(onParcial, idioma) {
  return new Promise(resolver => {
    const Motor = VozDelNavegador();
    const motor = new Motor();
    motor.lang = idioma;
    motor.interimResults = Boolean(onParcial);
    motor.maxAlternatives = 1;
    let ultimo = '';
    let resuelto = false;
    const terminar = valor => { if (!resuelto) { resuelto = true; pararNavegador = null; resolver(valor); } };
    motor.onresult = evento => {
      ultimo = [...evento.results].map(fila => fila[0].transcript).join(' ').trim();
      if (onParcial && !evento.results[evento.results.length - 1].isFinal) onParcial(ultimo);
    };
    // Lo dicho a medias no se tira aunque el motor acabe con error: es lo único
    // que la persona llegó a decir, y perderlo obliga a repetir la frase entera.
    motor.onerror = evento => terminar(ultimo
      ? { ok: true, texto: ultimo, origen: 'navegador', parcial: true }
      : { ok: false, error: evento?.error === 'not-allowed' ? 'Hace falta permiso para el micrófono.' : 'No se pudo escuchar. Escríbelo a mano.' });
    motor.onend = () => terminar(ultimo ? { ok: true, texto: ultimo, origen: 'navegador' } : { ok: false, error: 'No entendí nada.' });
    try { motor.start(); pararNavegador = () => { try { motor.stop(); } catch { /* ya estaba parado */ } }; }
    catch { terminar({ ok: false, error: 'No se pudo abrir el micrófono.' }); }
  });
}

export async function pararDictado() {
  const voz = plugin('SpeechRecognition');
  if (voz) { try { await voz.stop(); } catch { /* ya estaba parado */ } return; }
  pararNavegador?.();
}

/* ── Tomar una foto ────────────────────────────────────────────────────── */

// Con la cámara nativa la foto queda en un archivo del teléfono y tenemos su
// ruta, que es justo lo que pide el lector de texto. El `<input type="file">`
// del navegador da un Blob sin ruta, y por eso hay que escribirlo antes.
export async function tomarFoto({ desdeGaleria = false } = {}) {
  const camara = plugin('Camera');
  if (!camara) return { ok: false, error: 'La cámara nativa solo está en la aplicación instalada.' };
  try {
    const foto = await camara.getPhoto({
      quality: 82,
      // Una foto de teléfono son cuatro megas y el lector de texto no gana nada
      // con ellos; 1600 px de lado mayor deja la letra de una factura legible.
      width: 1600,
      allowEditing: false,
      resultType: 'uri',
      source: desdeGaleria ? 'PHOTOS' : 'CAMERA',
      correctOrientation: true,
      promptLabelHeader: 'Factura',
      promptLabelPhoto: 'Elegir de la galería',
      promptLabelPicture: 'Tomar una foto'
    });
    return { ok: true, ruta: foto.path || foto.webPath, vista: foto.webPath, formato: foto.format };
  } catch (error) {
    const mensaje = String(error?.message || '');
    // Cancelar no es un fallo: es una decisión. Tratarlo como error llenaría la
    // pantalla de avisos rojos cada vez que alguien se arrepiente.
    if (/cancel/i.test(mensaje)) return { ok: false, cancelado: true };
    return { ok: false, error: 'No se pudo abrir la cámara. Puedes elegir una foto de la galería.' };
  }
}

/* ── Leer una foto ─────────────────────────────────────────────────────── */

// Devuelve el texto crudo tal como lo vio el aparato. Interpretarlo es cosa de
// `receipt-parse.js`: separar el motor de la interpretación deja probar las dos
// piezas por separado, y la interpretación corre en Node sin necesitar teléfono.
export async function leerFoto(entrada) {
  const disponible = capacidad('leer-foto');
  if (!disponible.ok) return { ok: false, error: disponible.detalle };
  const lector = plugin('TextRecognition');
  try {
    const path = typeof entrada === 'string' ? entrada : await escribirTemporal(entrada);
    if (!path) return { ok: false, error: 'No se pudo preparar la foto para leerla.' };
    const resultado = await lector.processImage({ path });
    const texto = String(resultado?.text || '').trim();
    if (!texto) return { ok: false, error: 'No se leyó ningún texto en esa foto. Prueba con más luz, más cerca y sin reflejos.' };
    return {
      ok: true, texto, origen: 'telefono',
      // Los bloques traen las coordenadas de cada trozo. Hoy no se usan, pero
      // el día que haya que reordenar columnas torcidas harán falta.
      bloques: (resultado?.blocks || []).map(bloque => ({ texto: bloque.text, lineas: (bloque.lines || []).map(linea => linea.text) }))
    };
  } catch {
    return { ok: false, error: 'No se pudo leer la foto. Prueba con otra, o escribe las líneas a mano.' };
  }
}

// El archivo temporal vive en la caché del propio teléfono y nunca sale de ahí.
async function escribirTemporal(blob) {
  const fs = plugin('Filesystem');
  if (!fs) return null;
  const base64 = await comoBase64(blob);
  const nombre = `factura-${Date.now()}.jpg`;
  await fs.writeFile({ path: nombre, data: base64, directory: 'CACHE' });
  const { uri } = await fs.getUri({ path: nombre, directory: 'CACHE' });
  return uri;
}

// Y se borra en cuanto se ha leído: la foto original la guarda la app aparte,
// en IndexedDB, y solo si el usuario decide conservarla.
export async function borrarTemporales() {
  const fs = plugin('Filesystem');
  if (!fs) return;
  try {
    const { files } = await fs.readdir({ path: '', directory: 'CACHE' });
    for (const archivo of files) {
      const nombre = archivo.name || archivo;
      if (String(nombre).startsWith('factura-')) await fs.deleteFile({ path: nombre, directory: 'CACHE' });
    }
  } catch { /* si no se pueden borrar, el sistema limpiará su caché igual */ }
}

function comoBase64(blob) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result).split(',')[1]);
    lector.onerror = () => rechazar(new Error('No se pudo leer el archivo.'));
    lector.readAsDataURL(blob);
  });
}
