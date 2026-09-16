import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Lo único que esta aplicación tiene que defender.
//
// No hay servidor, ni cuentas, ni contraseñas, ni pagos, ni sincronización: casi
// todo el catálogo de ataques habituales no tiene dónde agarrarse aquí. Lo que
// sí existe es una pantalla que se dibuja metiendo texto dentro de HTML, y
// dentro del APK ese HTML corre en un WebView que tiene al lado el puente de
// Capacitor —y por tanto el micrófono—.
//
// Si un nombre de alimento llegara a la pantalla sin escapar, bastaría con un
// respaldo preparado a mala fe, o con que alguien escriba ese nombre, para
// ejecutar JavaScript dentro de la app. Ese es el ataque real de esta
// aplicación, y es el que estas pruebas vigilan.

import {
  addProduct, addPurchase, correctStock, createEmptyState, createReview, importState,
  makeRecipePlan, setHabitualLine, setMonthChange, todayISO, upsertPerson, upsertRecipe
} from '../src/model.js';
import { addRoutine } from '../src/routines.js';
import { BLOQUES, emptyMes, modalDia, modalRutina, renderMes } from '../src/page-mes.js';
import { emptyCompra, renderCompra } from '../src/page-compra.js';
import { PAGINAS_MAS, emptyMas, renderMas } from '../src/page-mas.js';

const VENENO = '<img src=x onerror=alert(1)>';
const MES = todayISO().slice(0, 7);

// Un estado donde TODO lo que el usuario puede escribir lleva el ataque dentro.
function estadoEnvenenado() {
  const s = createEmptyState();
  const p = addProduct(s, { name: VENENO + ' Arroz', controlUnit: 'lb', purchaseUnit: 'lb', category: 'granos' });
  p.aliases = [VENENO];
  setHabitualLine(s, p.id, 10, 'lb');
  setMonthChange(s, MES, p.id, { quantity: 4, unit: 'lb' });
  upsertPerson(s, { name: VENENO, restrictions: [], pendingRestrictions: ['<b>mani</b>'], habitual: [] });
  const receta = upsertRecipe(s, { name: VENENO, uses: ['almuerzo', 'cena'], covers: [], items: [{ productId: p.id, quantity: 1, unit: 'lb' }], note: VENENO });
  const plan = makeRecipePlan(s, receta.id, todayISO(), 'almuerzo');
  plan.title = VENENO;
  plan.note = VENENO;
  addRoutine(s, { kind: 'recipe', recipeId: receta.id, slots: ['cena'], weekdays: [1], weeks: null, scope: 'permanent', label: VENENO });
  addPurchase(s, { date: todayISO(), lines: [{ productId: p.id, quantity: 2, unit: 'lb' }] });
  correctStock(s, p.id, 1, VENENO);
  createReview(s, todayISO());
  s.manualItems.push({ id: 'otro-1', name: VENENO, quantity: VENENO, done: false });
  return s;
}

const contexto = (state, extra = {}) => ({
  state,
  ui: { page: 'hoy', modal: null, reviewId: null, correctingReview: false, mes: emptyMes(MES), compra: emptyCompra(MES), mas: emptyMas(), ...extra },
  commit: () => {}, toast: () => {}, render: () => {}, closeModal: () => {}, openModal: () => {}, startTour: () => {},
  servicios: { transcribe: false, chat: false, enElAparato: { voz: false } }
});

function todasLasPantallas(state) {
  const salida = [];
  const ctx = contexto(state);
  salida.push(['plan mensual', renderMes(ctx)]);
  ctx.ui.mes.vista = 'calendario';
  salida.push(['calendario', renderMes(ctx)]);
  ctx.ui.mes.vista = 'resumen';
  for (const bloque of BLOQUES) { ctx.ui.mes.bloque = bloque.id; salida.push(['bloque ' + bloque.id, renderMes(ctx)]); }
  ctx.ui.mes.bloque = null;
  salida.push(['modal rutina', modalRutina(contexto(state), { month: MES })]);
  salida.push(['modal día', modalDia(contexto(state), { date: MES + '-05' })]);
  salida.push(['compra', renderCompra(contexto(state))]);
  for (const pagina of ['mas', ...PAGINAS_MAS]) salida.push([pagina, renderMas(contexto(state, { page: pagina }))]);
  const revision = contexto(state, { page: 'revision' });
  revision.ui.reviewId = state.reviews[0].id;
  salida.push(['revisión abierta', renderMas(revision)]);
  return salida;
}

test('ningún texto del usuario llega a la pantalla sin escapar', () => {
  const pantallas = todasLasPantallas(estadoEnvenenado());
  assert.ok(pantallas.length > 15, 'deberían probarse todas las pantallas');
  const filtradas = pantallas.filter(([, html]) => html.includes(VENENO)).map(([nombre]) => nombre);
  assert.deepEqual(filtradas, [], 'pantallas donde el ataque sale sin escapar');
  // Y que de verdad se esté pintando el texto, no descartándolo en silencio.
  assert.ok(pantallas.some(([, html]) => html.includes('&lt;img')), 'el texto debería verse escapado en alguna parte');
});

// «Borrar todos mis datos» tiene que borrar todos los datos.
//
// Durante un tiempo no lo hizo: reemplazaba el estado y guardaba encima, pero
// `que-comemos-antes-de-migrar` —que puede tener una copia íntegra de todo lo
// anterior— y la clave con la dirección y el token del servidor opcional se
// quedaban en el aparato. Alguien que pide borrar sus datos no espera que quede
// una copia completa esperando. Y es justo el botón al que apunta la página de
// eliminación de datos que Google Play exige.
test('borrar los datos no deja ninguna copia detrás', async () => {
  const { clearAll, STORAGE_KEY, BACKUP_KEY } = await import('../src/storage.js');
  const almacen = new Map([
    [STORAGE_KEY, '{"version":3}'],
    [BACKUP_KEY, '{"version":2,"products":[{"name":"copia entera de lo anterior"}]}'],
    ['que-comemos-proveedores-v1', '{"baseUrl":"https://…","token":"secreto"}'],
    ['que-comemos-sidebar-collapsed', '1'],
    ['que-comemos-voz-v1', '{"fallos":2,"enCurso":false}'],
    ['app-de-otro', 'esto no es nuestro']
  ]);
  const falso = { getItem: k => (almacen.has(k) ? almacen.get(k) : null), removeItem: k => almacen.delete(k) };

  clearAll(falso);

  assert.equal(almacen.get(STORAGE_KEY), undefined, 'quedaron los datos');
  assert.equal(almacen.get(BACKUP_KEY), undefined, 'quedó la copia previa a la migración, con todo dentro');
  assert.equal(almacen.get('que-comemos-proveedores-v1'), undefined, 'quedó la dirección del servidor y su token');
  assert.equal(almacen.get('que-comemos-voz-v1'), undefined, 'quedó lo que la app sabe del micrófono de este teléfono');
  assert.equal(almacen.get('app-de-otro'), 'esto no es nuestro', 'se borró algo que no era de esta app');
});

// La lista de `clearAll` se enumera a mano, y una lista a mano se queda atrás en
// cuanto alguien añade una clave nueva y no se acuerda. Esta prueba busca por el
// código todas las claves que empiezan por `que-comemos-` y exige que estén
// todas en la lista. Es la única forma de que el olvido salga en rojo aquí en
// vez de salir como un dato que sobrevive a «borrar todos mis datos».
test('ninguna clave de esta app se queda fuera de «borrar mis datos»', async () => {
  const { clearAll } = await import('../src/storage.js');
  const { readdirSync, readFileSync } = await import('node:fs');

  const enElCodigo = new Set();
  for (const archivo of readdirSync('src').filter(nombre => nombre.endsWith('.js'))) {
    const codigo = readFileSync(`src/${archivo}`, 'utf8');
    for (const cita of codigo.match(/'que-comemos-[a-z0-9-]*'/g) || []) enElCodigo.add(cita.slice(1, -1));
  }
  assert.ok(enElCodigo.size >= 4, 'la búsqueda no encontró claves: el patrón debe de estar mal');

  // Se le da a `clearAll` un almacén con todas ellas dentro y se mira cuáles
  // sobreviven.
  const almacen = new Map([...enElCodigo].map(clave => [clave, 'algo']));
  const falso = { getItem: k => (almacen.has(k) ? almacen.get(k) : null), removeItem: k => almacen.delete(k) };
  clearAll(falso);

  assert.deepEqual([...almacen.keys()], [], 'claves que esta app escribe y «borrar mis datos» no borra');
});

// Prometer «tu voz no sale del teléfono» sin comprobarlo era falso en cualquier
// aparato sin el paquete de español descargado: esos mandan el audio a Google.
// La promesa tiene que salir de lo que se sabe del aparato, no de un texto fijo.
test('la promesa sobre la voz depende de lo que se sabe del aparato', async () => {
  const guardado = globalThis.Capacitor;
  const { avisoDeVoz } = await import('../src/device.js');
  try {
    // Sin Capacitor y sin reconocimiento del navegador no hay dictado ni aviso.
    delete globalThis.Capacitor;
    assert.equal(avisoDeVoz(), null, 'sin dictado no hay nada que avisar');
  } finally {
    if (guardado === undefined) delete globalThis.Capacitor; else globalThis.Capacitor = guardado;
  }

  // Y ninguna pantalla puede llevar la promesa escrita a fuego.
  const PROMESAS = ['tu voz no sale del teléfono', 'no sale del aparato'];
  const culpables = [];
  for (const archivo of readdirSync(SRC).filter(nombre => nombre.endsWith('.js'))) {
    // `device.js` sí puede afirmarlo: es el único que ha preguntado primero.
    // `legal.js` explica los dos casos enteros, que es lo contrario de prometer.
    if (archivo === 'device.js' || archivo === 'legal.js') continue;
    const codigo = readFileSync(resolve(SRC, archivo), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    for (const promesa of PROMESAS) {
      // Vale dentro de una condición sobre `avisoDeVoz()`; lo que no vale es
      // soltarla sin más.
      if (codigo.includes(promesa) && !codigo.includes('avisoDeVoz()')) culpables.push(`${archivo}: «${promesa}»`);
    }
  }
  assert.deepEqual(culpables, [], 'pantallas que prometen sobre la voz sin haberlo comprobado');
});

const SRC = resolve(import.meta.dirname, '..', 'src');
const modulos = () => readdirSync(SRC).filter(nombre => nombre.endsWith('.js'));
const sinComentarios = archivo => readFileSync(resolve(SRC, archivo), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

test('la aplicación no ejecuta código escrito en texto', () => {
  // `eval`, el constructor Function, `document.write` y las formas de
  // `setTimeout` que aceptan una cadena. Cualquiera de las cuatro convierte un
  // nombre de alimento en código si alguien se descuida una tarde.
  const PELIGROS = [
    ['eval', /\beval\s*\(/],
    ['new Function', /\bnew\s+Function\s*\(/],
    ['document.write', /\bdocument\s*\.\s*write\s*\(/],
    ['setTimeout con una cadena', /\bset(?:Timeout|Interval)\s*\(\s*["'`]/]
  ];
  const sospechas = [];
  for (const archivo of modulos()) {
    const codigo = sinComentarios(archivo);
    for (const [nombre, patron] of PELIGROS) if (patron.test(codigo)) sospechas.push(archivo + ': ' + nombre);
  }
  assert.deepEqual(sospechas, [], 'formas de ejecutar texto como código');
});

test('la aplicación sale a la red por una sola puerta, y solo a ella', () => {
  // Esta prueba decía «no hay ninguna salida», y era verdad hasta que llegaron
  // las cuentas. Borrarla al añadir la primera habría sido perder justo lo que
  // protegía. Así que dice ahora lo más fuerte que sigue siendo cierto, que no
  // es poco:
  //
  //   · Un único módulo habla con la red: `nube.js`.
  //   · Dentro de él hay UNA sola llamada a `fetch`, y su dirección se compone
  //     siempre a partir de `urlLimpia()`, que es el proyecto configurado.
  //
  // De ahí sale la afirmación que hay que poder hacer delante de Google Play y
  // de quien use esto: los datos de una casa solo pueden ir al sitio que su
  // dueño configuró. No hay telemetría, no hay analítica, no hay una segunda
  // dirección escondida en otro archivo.
  const salidas = modulos().filter(archivo => /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(sinComentarios(archivo)));
  assert.deepEqual(salidas, ['nube.js'], 'módulos que salen a la red: solo nube.js debería');

  const nube = sinComentarios('nube.js');
  const llamadas = nube.match(/\bfetch\s*\(/g) || [];
  assert.equal(llamadas.length, 1, 'nube.js tiene más de una llamada a fetch: la puerta única deja de serlo');

  // Y esa llamada se construye con la dirección configurada, no con una escrita
  // a mano en medio del archivo.
  assert.ok(/fetch\(`\$\{urlLimpia\(\)\}/.test(nube), 'la llamada de red ya no se construye con la dirección configurada');

  // Ninguna dirección de otro sitio, en ningún módulo. Se admite supabase.co
  // —que es a donde va la cuenta— y nada más.
  const ajenas = [];
  for (const archivo of modulos()) {
    // Se exige un dominio de verdad —con punto y extensión— para no cazar los
    // «https://» sueltos que aparecen dentro de las frases que se le enseñan a
    // quien tiene que configurar el proyecto.
    for (const url of sinComentarios(archivo).match(/https?:\/\/(?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi) || []) {
      // El proyecto de cada instalación es un subdominio distinto de
      // `supabase.co` —el identificador que Supabase le pone—, así que se
      // admite cualquiera de ellos y nada más. Un `https://otracosa.com`
      // colado en cualquier módulo pone esto en rojo.
      if (/^https:\/\/(\*\.|[a-z0-9-]+\.)?supabase\.co(\/|$)/i.test(url)) continue;
      if (/^https:\/\/localhost/i.test(url)) continue;
      ajenas.push(`${archivo}: ${url}`);
    }
  }
  assert.deepEqual(ajenas, [], 'direcciones de terceros dentro del código del cliente');
});

// La clave que viaja en el APK es la pública, y eso es correcto: no abre nada
// por sí sola, porque quien decide qué se puede leer son las políticas por fila
// de la base de datos. La que NO puede estar aquí es la de servicio, que se las
// salta todas: quien la tenga puede leer y borrar los datos de cualquier casa.
//
// Un pegado por descuido de esa clave es el peor fallo posible de este proyecto,
// y además es silencioso: la app funcionaría igual de bien. Por eso se busca.
test('ninguna clave de servicio se cuela en el código del cliente', () => {
  // Se mira el CÓDIGO, no los comentarios. Una clave pegada por descuido acaba
  // en una variable, nunca dentro de un párrafo explicando por qué no debe
  // estar ahí —y este archivo tiene varios de esos párrafos a propósito.
  const leer = archivo => archivo === 'index.html'
    ? readFileSync(resolve(SRC, '..', 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, ' ')
    : sinComentarios(archivo);
  const sospechosas = [];
  for (const archivo of [...modulos(), 'index.html']) {
    const texto = leer(archivo);
    if (/service_role/i.test(texto)) sospechosas.push(`${archivo}: menciona service_role`);
    if (/\bsb_secret_[A-Za-z0-9_-]{8,}/.test(texto)) sospechosas.push(`${archivo}: clave secreta de Supabase`);
    // Un JWT de Supabase con el papel de servicio dentro. Se mira el contenido
    // descodificado, que es donde está el papel, y no el nombre de la variable.
    for (const jwt of texto.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) || []) {
      let carga = '';
      try { carga = Buffer.from(jwt.split('.')[1], 'base64').toString('utf8'); } catch { carga = ''; }
      if (/service_role/i.test(carga)) sospechosas.push(`${archivo}: JWT con papel de servicio`);
    }
  }
  assert.deepEqual(sospechosas, [], 'claves privadas dentro del cliente');
});

test('un respaldo hostil no envenena el prototipo ni entra a medias', () => {
  const base = {
    version: 3, seq: 0, demo: false, products: [], people: [], recipes: [], plans: [], absences: [],
    opening: {}, purchases: [], reviews: [], corrections: [], manualItems: [],
    habitualBasket: { lines: [], updatedAt: null, history: [] },
    monthOverrides: {}, mealRoutines: [], monthPlans: {}, settings: {}, activity: []
  };
  importState(JSON.stringify({ ...base, ['__' + 'proto__']: { colado: true } }));
  assert.equal({}.colado, undefined, 'el prototipo de Object quedó contaminado');

  for (const [nombre, json] of [
    ['texto que no es JSON', 'esto no es json'],
    ['sin versión', '{"products":[]}'],
    ['de una versión futura', '{"version":99,"seq":0}'],
    ['con campos del tipo equivocado', '{"version":3,"seq":0,"products":"no"}']
  ]) {
    assert.throws(() => importState(json), 'debería rechazarse: ' + nombre);
  }
});

// La CSP se debilita sin querer con una línea, y nadie se entera hasta que pasa
// algo. Esto fija lo que tiene que seguir prohibido.
test('la política de contenido sigue cerrando las vías que cierra hoy', () => {
  const html = readFileSync(resolve(import.meta.dirname, '..', 'index.html'), 'utf8');
  const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1];
  assert.ok(csp, 'index.html se quedó sin política de contenido');

  // `'unsafe-eval'` convertiría cualquier texto en código ejecutable. Nunca.
  assert.ok(!csp.includes('unsafe-eval'), 'la política volvió a permitir ejecutar texto como código');
  // Sin comodines en script-src ni object-src: uno solo anula el resto.
  assert.ok(!/(script|object)-src[^;]*\*/.test(csp), 'la política tiene un comodín donde no debe');
  // `connect-src` sí lleva uno, y es el único admitido: `https://*.supabase.co`
  // cubre el subdominio del proyecto, que cambia de una instalación a otra. Lo
  // que no puede volver es `https:` a secas, que permitía mandar la despensa de
  // una casa a cualquier servidor del mundo.
  const conectar = csp.match(/connect-src ([^;]+)/)?.[1]?.trim();
  assert.equal(conectar, "'self' https://*.supabase.co", 'connect-src dejó de nombrar un único destino');

  for (const regla of ["default-src 'self'", "object-src 'none'", "base-uri 'none'", "frame-src 'none'"]) {
    assert.ok(csp.includes(regla), `falta la regla: ${regla}`);
  }
  // Y nada puede salir a un http:// en claro, que es por donde se iría una fuga.
  assert.ok(!/connect-src[^;]*http:/.test(csp), 'connect-src volvió a admitir tráfico sin cifrar');

  // `script-src` lleva 'unsafe-inline' a la fuerza: Capacitor inyecta su puente
  // como script en línea y sin eso la app no arranca dentro del APK. Se deja
  // constancia aquí para que nadie lo lea como un descuido.
  assert.ok(csp.includes("script-src 'self' 'unsafe-inline'"), 'script-src cambió de forma; revisa que el puente de Capacitor siga funcionando');

  // `frame-ancestors` no vale dentro de un <meta>: tiene que ir por cabecera.
  const servidor = readFileSync(resolve(import.meta.dirname, '..', 'server.js'), 'utf8');
  assert.ok(servidor.includes("frame-ancestors 'none'"), 'el servidor dejó de impedir que la app se meta en un marco ajeno');
  assert.ok(servidor.includes('nosniff'), 'el servidor dejó de impedir que el navegador adivine tipos');
});

test('Android no saca los datos del teléfono por su cuenta', () => {
  const carpeta = resolve(import.meta.dirname, '..', 'android', 'app', 'src', 'main');
  const manifiesto = readFileSync(resolve(carpeta, 'AndroidManifest.xml'), 'utf8');

  // Con el respaldo automático encendido, Android sube el almacenamiento de la
  // app a la cuenta de Google del dueño. La app promete lo contrario.
  assert.ok(/android:allowBackup="false"/.test(manifiesto), 'el respaldo automático de Android volvió a encenderse');
  assert.ok(/android:dataExtractionRules="@xml\/reglas_de_datos"/.test(manifiesto), 'faltan las reglas de extracción de Android 12+');
  assert.ok(/android:networkSecurityConfig="@xml\/seguridad_de_red"/.test(manifiesto), 'falta la configuración de red');

  const reglas = readFileSync(resolve(carpeta, 'res', 'xml', 'reglas_de_datos.xml'), 'utf8');
  for (const bloque of ['cloud-backup', 'device-transfer']) {
    assert.ok(reglas.includes(bloque), `las reglas de datos no cubren ${bloque}`);
  }
  const red = readFileSync(resolve(carpeta, 'res', 'xml', 'seguridad_de_red.xml'), 'utf8');
  assert.ok(red.includes('cleartextTrafficPermitted="false"'), 'se volvió a permitir tráfico sin cifrar');
});

test('el APK no pide permisos que ya no usa', () => {
  const manifiesto = readFileSync(resolve(import.meta.dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
  for (const permiso of ['CAMERA', 'READ_MEDIA_IMAGES', 'READ_EXTERNAL_STORAGE', 'ACCESS_FINE_LOCATION', 'READ_CONTACTS']) {
    assert.ok(!manifiesto.includes('permission.' + permiso), 'el manifiesto pide ' + permiso + ' sin usarlo');
  }
  assert.ok(manifiesto.includes('permission.RECORD_AUDIO'), 'el dictado necesita el micrófono');
});
