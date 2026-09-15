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
import { PASOS, emptyMes, modalRutina, renderMes } from '../src/page-mes.js';
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
  for (const paso of PASOS) { ctx.ui.mes.paso = paso.id; salida.push(['paso ' + paso.id, renderMes(ctx)]); }
  ctx.ui.mes.paso = null;
  salida.push(['modal rutina', modalRutina(contexto(state), { month: MES })]);
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

test('la aplicación solo sale a la red hacia el servidor que configure el usuario', () => {
  const salidas = modulos().filter(archivo => /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(sinComentarios(archivo)));
  // `providers.js` es el único, y su dirección la escribe el usuario a mano.
  // Cualquier otro módulo que aparezca aquí es una fuga que nadie pidió.
  assert.deepEqual(salidas, ['providers.js'], 'módulos que salen a la red');
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
  // Sin comodines: un `*` en script-src o connect-src anula el resto.
  assert.ok(!/(script|connect|object)-src[^;]*\*/.test(csp), 'la política tiene un comodín donde no debe');

  for (const regla of ["default-src 'self'", "object-src 'none'", "base-uri 'none'", "frame-src 'none'"]) {
    assert.ok(csp.includes(regla), `falta la regla: ${regla}`);
  }
  // Nada puede salir a un http:// en claro, que es por donde se iría una fuga.
  assert.ok(/connect-src 'self' https:/.test(csp), 'connect-src dejó de exigir https');

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
