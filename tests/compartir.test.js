// El día que se le manda a quien cocina.
//
// La prueba que más vale de este archivo es la de los avisos de alergia. En
// muchas casas quien planifica y quien cocina no son la misma persona, y hasta
// que esto existió la segunda no veía ninguno: la app se los enseñaba a quien
// llenaba el calendario, que no es quien echa el maní a la olla.
//
// Eso convierte este archivo en un sitio peligroso. Un mensaje con las comidas
// pero sin los avisos no sería una función a medias: sería un atajo que rodea
// la única comprobación de seguridad que tiene la app, y encima uno que se usa
// todas las mañanas. Por eso aquí se comprueba que el aviso viaja, que viaja el
// «no se ha podido comprobar», y que lo grave va antes que lo leve.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addProduct, createEmptyState, guardarRecado, recadoDe, todayISO, upsertPerson
} from '../src/model.js';
import { loadState, saveState } from '../src/storage.js';
import { compartirTexto, textoDelDia } from '../src/compartir.js';

const HOY = '2026-09-18';

function casa() {
  const state = createEmptyState();
  const id = {};
  for (const [clave, nombre, categoria] of [
    ['mani', 'Maní', 'otros'],
    ['leche', 'Leche', 'lacteos'],
    ['arroz', 'Arroz', 'granos']
  ]) {
    id[clave] = addProduct(state, { name: nombre, category: categoria, controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  }
  id.sofia = upsertPerson(state, { name: 'Sofía', restricciones: [{ productId: id.mani, motivo: 'alergia' }] }).id;
  id.luis = upsertPerson(state, { name: 'Luis', restricciones: [{ productId: id.leche, motivo: 'intolerancia' }] }).id;
  id.ana = upsertPerson(state, { name: 'Ana', restricciones: [{ productId: id.arroz, motivo: 'preferencia' }] }).id;
  return { state, id };
}

// Una comida puesta a mano, que es lo que `state.plans` guarda.
function ponerComida(state, { slot, title, items = [], participants = [], note = '', kind = 'suelta' }) {
  state.plans.push({
    id: `c${state.plans.length + 1}`, date: HOY, slot, kind, origen: 'manual',
    title, note, participants, items: items.map((productId, i) => ({ id: `i${i}`, productId }))
  });
}

/* ── Lo que lleva el mensaje ───────────────────────────────────────────── */

test('el mensaje dice de qué día es, en la primera línea', () => {
  // Es lo que sustituye a que un enlace se actualice solo: un mensaje reenviado
  // o leído dos días después dice de qué día habla y no se confunde con el de
  // hoy. Sin esto, el mensaje del lunes sirve de cena el miércoles.
  const { state } = casa();
  const texto = textoDelDia(state, HOY);
  assert.match(texto.split('\n')[0], /18 de septiembre/);
});

test('cada comida puesta sale con su nombre y su nota', () => {
  const { state, id } = casa();
  ponerComida(state, { slot: 'almuerzo', title: 'Arroz con pollo', note: 'Dejar una parte para la cena', participants: [id.luis] });
  const texto = textoDelDia(state, HOY);
  assert.match(texto, /\*Almuerzo\*/);
  assert.match(texto, /Arroz con pollo/);
  assert.match(texto, /Nota: Dejar una parte para la cena/);
});

test('una comida principal sin decidir lo dice, en vez de callarse', () => {
  // Omitirla dejaría a quien cocina pensando que hoy no hay almuerzo.
  const { state } = casa();
  assert.match(textoDelDia(state, HOY), /\*Almuerzo\*\nSin decidir todavía\./);
});

test('las meriendas solo salen si hay alguna puesta', () => {
  // Una casa que no merienda no tiene que recibir dos renglones cada mañana
  // diciéndole que no merienda.
  const { state, id } = casa();
  assert.ok(!/Merienda/.test(textoDelDia(state, HOY)), 'salen meriendas que nadie puso');

  ponerComida(state, { slot: 'merienda-manana', title: 'Fruta', participants: [id.ana] });
  assert.match(textoDelDia(state, HOY), /Fruta/);
});

/* ── Lo que no se puede omitir ─────────────────────────────────────────── */

test('el aviso de alergia viaja dentro del mensaje', () => {
  const { state, id } = casa();
  ponerComida(state, { slot: 'almuerzo', title: 'Arroz con maní', items: [id.mani], participants: [id.sofia] });

  const texto = textoDelDia(state, HOY);
  assert.match(texto, /ALERGIA/, 'el mensaje no avisa de una alergia');
  assert.match(texto, /Sofía/, 'el aviso no dice de quién es');
  assert.match(texto, /maní/, 'el aviso no dice de qué alimento es');
});

test('lo grave va antes que lo leve, y lo leve no lleva marca de peligro', () => {
  // El orden lo decide `choquesDeLaComida` y aquí solo hay que no estropearlo:
  // quien lee un mensaje de corrido a las siete de la mañana lee lo primero.
  const { state, id } = casa();
  ponerComida(state, {
    slot: 'almuerzo', title: 'Arroz con leche y maní',
    items: [id.arroz, id.leche, id.mani], participants: [id.sofia, id.luis, id.ana]
  });

  const texto = textoDelDia(state, HOY);
  assert.ok(texto.indexOf('ALERGIA') < texto.indexOf('Cuidado'), 'la alergia no va la primera');
  assert.ok(texto.indexOf('Cuidado') < texto.indexOf('prefiere evitar'), 'la preferencia no va la última');
  // Y la preferencia no gasta el triángulo: si todo lleva señal, nada la tiene.
  const renglonDeAna = texto.split('\n').find(linea => /prefiere evitar/.test(linea));
  assert.ok(!/⚠/.test(renglonDeAna), 'una preferencia se anuncia como si fuera un peligro');
});

test('una comida sin alimentos anotados lo dice, y no calla', () => {
  /* El silencio se lee como «revisado y todo bien». `src/avisos.js` lo dice en
     su cabecera y la pantalla lo respeta desde que existe; el mensaje tiene que
     respetarlo igual, porque quien lo recibe es quien puede mirar la olla. */
  const { state, id } = casa();
  ponerComida(state, { slot: 'cena', title: 'Lo que sobró', items: [], participants: [id.sofia] });
  assert.match(textoDelDia(state, HOY), /SIN COMPROBAR/);
});

test('sin restricciones en casa no se avisa de nada, ni para bien ni para mal', () => {
  // Afirmar «esta comida es segura» sería prometer una revisión que depende de
  // que los alimentos estén completos, y eso no lo sabe nadie más que quien
  // cocina. Una casa sin restricciones no necesita ni la promesa ni la duda.
  const state = createEmptyState();
  const ana = upsertPerson(state, { name: 'Ana', restricciones: [] }).id;
  ponerComida(state, { slot: 'cena', title: 'Sopa', items: [], participants: [ana] });
  const texto = textoDelDia(state, HOY);
  assert.ok(!/SIN COMPROBAR|ALERGIA|Cuidado/.test(texto), 'se avisa de algo en una casa sin restricciones');
});

test('el nombre del alimento no se lee como si fuera alguien', () => {
  // El catálogo los guarda capitalizados —«Maní»— porque así se enseñan en una
  // lista. A media frase, «no puede comer Maní» se lee como un nombre propio.
  const { state, id } = casa();
  ponerComida(state, { slot: 'almuerzo', title: 'Algo con maní', items: [id.mani], participants: [id.sofia] });
  assert.match(textoDelDia(state, HOY), /no puede comer: maní/);
});

/* ── El recado ─────────────────────────────────────────────────────────── */

test('el recado del día sale en el mensaje, y sin recado no hay bloque', () => {
  const { state } = casa();
  assert.ok(!/quehaceres/i.test(textoDelDia(state, HOY)), 'aparece un bloque de quehaceres vacío');

  guardarRecado(state, HOY, 'Sacar la basura. Viene el plomero a las 9.');
  const texto = textoDelDia(state, HOY);
  assert.match(texto, /\*Otros quehaceres\*/);
  assert.match(texto, /Viene el plomero a las 9\./);
});

test('un recado es de su día y no se arrastra al siguiente', () => {
  // Un quehacer tiene fecha. «Hoy viene el plomero» deja de ser verdad mañana,
  // y un recado que se queda puesto se lee al tercer día como si fuera de hoy.
  const { state } = casa();
  guardarRecado(state, HOY, 'Viene el plomero');
  assert.equal(recadoDe(state, '2026-09-19'), '');
  assert.ok(!/plomero/.test(textoDelDia(state, '2026-09-19')));
});

test('guardar un recado vacío lo borra en vez de dejar la clave puesta', () => {
  // Un objeto que solo crece se lleva trescientos días vacíos dentro de cada
  // copia de seguridad.
  const { state } = casa();
  guardarRecado(state, HOY, 'Algo');
  guardarRecado(state, HOY, '   ');
  assert.deepEqual(state.recados, {});
});

test('los recados sobreviven a guardar y volver a leer', () => {
  const { state } = casa();
  guardarRecado(state, HOY, 'Sacar la basura');
  const memoria = new Map();
  const almacen = { getItem: k => memoria.get(k) || null, setItem: (k, v) => memoria.set(k, v) };
  saveState(state, almacen);
  assert.equal(recadoDe(loadState(almacen), HOY), 'Sacar la basura');
});

/* ── Es texto, no HTML ─────────────────────────────────────────────────── */

test('el mensaje es texto plano: nada pasa por esc()', () => {
  /* Lo que sale de aquí va a la bandeja de compartir del teléfono, no a un
     documento. Escaparlo dejaría «Arroz &amp; habichuelas» en el WhatsApp de
     alguien. La otra mitad de esta regla —que el archivo no dibuje interfaz—
     la vigila `tests/iconos.test.js`. */
  const { state, id } = casa();
  ponerComida(state, { slot: 'cena', title: 'Arroz & habichuelas', note: 'Con «sofrito»', participants: [id.ana] });
  const texto = textoDelDia(state, HOY);
  assert.match(texto, /Arroz & habichuelas/);
  assert.match(texto, /Con «sofrito»/);
  assert.ok(!/&amp;|&laquo;|&#39;/.test(texto), 'el mensaje viene escapado como si fuera HTML');
});

/* ── Mandarlo ──────────────────────────────────────────────────────────── */

test('sin la bandeja del teléfono se cae al portapapeles, y se dice', () => {
  // No es lo mismo, pero deja el mensaje en la mano de quien lo pidió en vez de
  // no hacer nada. Que la app diga por cuál de las dos salió es lo que permite
  // a la pantalla decir «copiado» en vez de mentir con «compartido».
  delete globalThis.Capacitor;
  let copiado = '';
  // `navigator` en Node solo tiene lectura, así que se sustituye por descriptor
  // y se devuelve al terminar. Asignarlo a secas revienta con «has only a
  // getter», que es un fallo de la prueba y no del código.
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async texto => { copiado = texto; } } },
    configurable: true, writable: true
  });
  return compartirTexto('hola').then(salida => {
    assert.deepEqual(salida, { ok: true, via: 'portapapeles' });
    assert.equal(copiado, 'hola');
  }).finally(() => {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  });
});

test('cerrar la bandeja sin elegir nada no es un fallo', () => {
  // Es alguien que se arrepintió. Enseñarle un aviso rojo por cambiar de idea
  // es regañarle por usar el botón de atrás.
  globalThis.Capacitor = { Plugins: { Share: { share: async () => { throw new Error('Share canceled'); } } } };
  return compartirTexto('hola').then(salida => {
    assert.equal(salida.ok, false);
    assert.equal(salida.motivo, 'cancelado');
    delete globalThis.Capacitor;
  });
});
