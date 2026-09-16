import test from 'node:test';
import assert from 'node:assert/strict';

// El hogar: quién vive aquí y qué evita cada quien.
//
// Estas pruebas están escritas alrededor de una idea: en esta parte de la app un
// dato mal puesto puede hacer daño de verdad. Por eso más de la mitad de lo que
// hay aquí abajo no comprueba que algo funcione, sino que algo NO se invente:
// que una alergia no se rebaje a manía al migrar, que una preferencia no se
// pinte de rojo, que dar de baja a alguien no reescriba lo que comió en marzo.

import { migrate, SCHEMA_VERSION } from '../src/migrate.js';
import {
  addProduct, alimentosProhibidos, createEmptyState, effectiveParticipants, esActiva,
  exportState, importState, incompatibleItems, makeRecipePlan, personasActivas, product,
  restriccionesDe, setPersonActive, todayISO, upsertPerson, upsertRecipe
} from '../src/model.js';
import { loadState, saveState } from '../src/storage.js';
import {
  CLASES, HOGAR_ACTIONS, HOGAR_FORMS, claseDe, emptyHogar, hogarDe, ordenarRestricciones,
  renderHogar, resumenDeRestricciones, tocaConfigurarElHogar
} from '../src/hogar.js';

/* ── Un teléfono y un navegador de mentira ─────────────────────────────── */

// `hogar.js` lee dos campos del formulario que hay en pantalla para no perder lo
// escrito al repintar. En Node no hay pantalla, así que se le da una: un
// `document.querySelector` que devuelve lo que la prueba diga que hay escrito.
function fingirPantalla(campos = {}) {
  const nodo = {
    querySelector: selector => {
      if (selector === '[data-hogar-nombre]' && 'nombre' in campos) return { value: campos.nombre };
      if (selector === '[data-hogar-alimento]' && 'alimento' in campos) return { value: campos.alimento };
      return null;
    }
  };
  globalThis.document = {
    querySelector: selector => (selector.startsWith('[data-form=') ? nodo : null)
  };
  return nodo;
}
const quitarPantalla = () => { delete globalThis.document; };

function contexto(state) {
  const ctx = {
    state,
    ui: { page: 'hogar', modal: null, hogar: emptyHogar() },
    avisos: [],
    commit: mensaje => { ctx.guardados++; if (mensaje) ctx.avisos.push(mensaje); },
    toast: mensaje => ctx.avisos.push(mensaje),
    render: () => { ctx.pintados++; },
    closeModal: () => { ctx.ui.modal = null; },
    openModal: (type, extras = {}) => { ctx.ui.modal = { type, ...extras }; },
    guardados: 0, pintados: 0
  };
  return ctx;
}

const revisar = (html, donde) => {
  assert.equal(typeof html, 'string', `${donde} no devolvió HTML`);
  for (const basura of ['undefined', 'NaN', '[object Object]']) {
    assert.ok(!html.includes(basura), `${donde} imprime «${basura}» en pantalla`);
  }
  assert.ok(!/\$\{/.test(html), `${donde} dejó una plantilla sin resolver`);
};

/* ── Venir de la versión 3 ─────────────────────────────────────────────── */

const respaldoV3 = () => ({
  version: 3, seq: 9, demo: false,
  products: [
    { id: 'producto-1', name: 'Maní', normalized: 'mani', aliases: [], category: 'otros', controlUnit: 'lb', purchaseUnit: 'lb', equivalences: {}, slice: null, archived: false, origin: 'manual', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    { id: 'producto-2', name: 'Leche', normalized: 'leche', aliases: [], category: 'otros', controlUnit: 'unidad', purchaseUnit: 'unidad', equivalences: {}, slice: null, archived: false, origin: 'manual', createdAt: '2026-01-01', updatedAt: '2026-01-01' }
  ],
  people: [
    { id: 'persona-1', name: 'Sofía', kind: 'nino', restrictions: ['producto-1'], pendingRestrictions: ['Mariscos'], habitual: [] },
    { id: 'persona-2', name: 'Luis', kind: 'adulto', restrictions: [], pendingRestrictions: [], habitual: [] }
  ],
  recipes: [], plans: [], absences: [], opening: {}, purchases: [], reviews: [], corrections: [], manualItems: [],
  habitualBasket: { lines: [], updatedAt: null, history: [] },
  monthOverrides: {}, mealRoutines: [], monthPlans: {},
  settings: { reviewWeekday: 5, onboarded: true }, activity: []
});

test('un respaldo de la versión 3 llega entero a la 4 y nadie pierde una restricción', () => {
  const { ok, state, from, to, migrated } = migrate(respaldoV3());
  assert.equal(ok, true);
  assert.equal(from, 3);
  assert.equal(to, SCHEMA_VERSION);
  assert.equal(state.version, 5);
  assert.equal(migrated, true);
  assert.equal(state.people.length, 2);

  const sofia = state.people[0];
  assert.equal(sofia.name, 'Sofía');
  assert.equal(sofia.kind, 'nino', 'la clasificación que ya tenía se respeta');
  assert.equal(sofia.activo, true, 'nadie pidió dar de baja a nadie');
  assert.equal(sofia.restricciones.length, 2, 'las dos listas viejas se juntan en una');
  assert.deepEqual(sofia.restricciones[0], { productId: 'producto-1', texto: '', motivo: null });
  assert.deepEqual(sofia.restricciones[1], { productId: null, texto: 'Mariscos', motivo: null });
  assert.equal('restrictions' in sofia, false, 'el campo viejo ya no existe');
  assert.equal('pendingRestrictions' in sofia, false);
});

test('la migración no se inventa por qué alguien evitaba un alimento', () => {
  const { state } = migrate(respaldoV3());
  // Esta es la prueba que importa de todo el archivo. Poner «preferencia»
  // convertiría una alergia real en un gusto; poner «alergia» pintaría de rojo
  // algo que a alguien simplemente no le apetece, y a la tercera nadie mira ya
  // los rojos. Sin motivo es la única respuesta honesta.
  for (const fila of state.people[0].restricciones) {
    assert.equal(fila.motivo, null, 'un motivo que nadie dijo no se rellena');
  }
});

test('migrar dos veces da exactamente lo mismo que migrar una', () => {
  const primera = migrate(respaldoV3()).state;
  const segunda = migrate(structuredClone(primera)).state;
  assert.deepEqual(segunda.people, primera.people);
});

test('un respaldo a medio camino —con restricciones nuevas pero sin activo— se completa', () => {
  const medias = respaldoV3();
  medias.version = 4;
  medias.people = [{ id: 'persona-1', name: 'Ana', kind: 'adolescente', restricciones: [{ productId: 'producto-1', texto: '', motivo: 'alergia' }] }];
  const { ok, state } = migrate(medias);
  assert.equal(ok, true);
  assert.equal(state.people[0].activo, true);
  assert.equal(state.people[0].kind, 'adolescente');
  assert.equal(state.people[0].restricciones[0].motivo, 'alergia', 'lo que ya estaba dicho no se borra');
  assert.deepEqual(state.people[0].habitual, []);
});

test('un respaldo migrado sigue pasando la validación de la app', () => {
  const { state } = migrate(respaldoV3());
  const vuelto = importState(JSON.stringify(state));
  assert.equal(vuelto.people.length, 2);
  assert.equal(vuelto.version, SCHEMA_VERSION);
});

/* ── Guardar una persona ───────────────────────────────────────────────── */

function casa() {
  const state = createEmptyState();
  const mani = addProduct(state, { name: 'Maní', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  return { state, mani, arroz };
}

test('una persona puede tener más de una restricción y cada una con su motivo', () => {
  const { state, mani } = casa();
  const sofia = upsertPerson(state, {
    name: 'Sofía', kind: 'nino',
    restricciones: [
      { productId: mani, texto: '', motivo: 'alergia' },
      { productId: null, texto: 'Leche', motivo: 'intolerancia' },
      { productId: null, texto: 'Berenjena', motivo: 'preferencia' }
    ],
    habitual: []
  });
  assert.equal(sofia.restricciones.length, 3);
  assert.deepEqual(sofia.restricciones.map(fila => fila.motivo), ['alergia', 'intolerancia', 'preferencia']);
  assert.equal(sofia.kind, 'nino');
  assert.equal(sofia.activo, true);
});

test('las tres clasificaciones existen y adolescente es una de ellas', () => {
  const { state } = casa();
  for (const clase of ['adulto', 'adolescente', 'nino']) {
    const persona = upsertPerson(state, { name: `Alguien ${clase}`, kind: clase, restricciones: [], habitual: [] });
    assert.equal(persona.kind, clase);
  }
  assert.deepEqual(CLASES.map(item => item.id), ['adulto', 'adolescente', 'nino']);
  assert.equal(claseDe('adolescente').etiqueta, 'Adolescente');
  // Una clasificación inventada no entra: se queda en la neutra.
  assert.equal(upsertPerson(state, { name: 'Raro', kind: 'marciano', restricciones: [], habitual: [] }).kind, 'adulto');
});

test('el mismo alimento anotado dos veces es una sola restricción, y gana el motivo dicho', () => {
  const { state, mani } = casa();
  const persona = upsertPerson(state, {
    name: 'Sofía',
    restricciones: [
      { productId: mani, texto: '', motivo: null },
      { productId: null, texto: 'Maní', motivo: 'alergia' }
    ],
    habitual: []
  });
  assert.equal(persona.restricciones.length, 1, 'no se duplica');
  assert.equal(persona.restricciones[0].productId, mani);
  assert.equal(persona.restricciones[0].motivo, 'alergia', 'el motivo que alguien escribió no se pierde al juntar');
});

test('un alimento que todavía no existe se guarda por su nombre y se enlaza con su motivo intacto', () => {
  const { state } = casa();
  const persona = upsertPerson(state, {
    name: 'Luis',
    restricciones: [{ productId: null, texto: 'Camarón', motivo: 'alergia' }],
    habitual: []
  });
  assert.equal(persona.restricciones[0].productId, null, 'todavía no hay a qué apuntar');
  assert.equal(persona.restricciones[0].texto, 'Camarón');

  const camaron = addProduct(state, { name: 'Camarón', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  upsertPerson(state, { id: persona.id, name: 'Luis', habitual: [] });
  assert.equal(persona.restricciones[0].productId, camaron, 'se enlaza solo');
  assert.equal(persona.restricciones[0].motivo, 'alergia', 'y sigue siendo una alergia');
});

test('guardar desde una pantalla que no pregunta el motivo no borra el motivo', () => {
  const { state, mani } = casa();
  const persona = upsertPerson(state, { name: 'Sofía', restricciones: [{ productId: mani, texto: '', motivo: 'alergia' }], habitual: [] });
  // La forma antigua de llamar —la que usaba el asistente— sigue funcionando.
  upsertPerson(state, { id: persona.id, name: 'Sofía', restrictions: [mani], pendingRestrictions: [], habitual: [] });
  assert.equal(persona.restricciones[0].motivo, 'alergia');
});

test('no se obliga a registrar ninguna restricción', () => {
  const { state } = casa();
  const persona = upsertPerson(state, { name: 'Ana', kind: 'adulto', restricciones: [], habitual: [] });
  assert.deepEqual(persona.restricciones, []);
  assert.ok(resumenDeRestricciones(state, persona).includes('No evita ningún alimento'));
});

/* ── Avisar es lo primero ──────────────────────────────────────────────── */

test('la app avisa igual sea alergia, intolerancia, preferencia o motivo sin decir', () => {
  const { state, mani } = casa();
  // El motivo cambia cómo se ve, no a quién protege. Una preferencia mal puesta
  // que dejara pasar un maní sería peor error que una advertencia de más.
  for (const motivo of ['alergia', 'intolerancia', 'preferencia', null]) {
    const persona = upsertPerson(state, { name: `Quien evita ${motivo}`, restricciones: [{ productId: mani, texto: '', motivo }], habitual: [] });
    assert.ok(alimentosProhibidos(persona).has(mani), `${motivo}: el alimento sigue prohibido`);
    const choques = incompatibleItems(state, [{ productId: mani, quantity: 1, unit: 'lb' }], [persona.id]);
    assert.equal(choques.length, 1, `${motivo}: la comida se marca como incompatible`);
  }
});

test('una alergia se lee antes que una preferencia', () => {
  const filas = [
    { productId: null, texto: 'Berenjena', motivo: 'preferencia' },
    { productId: null, texto: 'Leche', motivo: 'intolerancia' },
    { productId: null, texto: 'Maní', motivo: 'alergia' }
  ];
  assert.deepEqual(ordenarRestricciones(filas).map(fila => fila.texto), ['Maní', 'Leche', 'Berenjena']);
});

test('la ficha de una alergia se distingue de la de una preferencia sin depender del color', () => {
  const { state } = casa();
  const persona = upsertPerson(state, {
    name: 'Sofía',
    restricciones: [
      { productId: null, texto: 'Maní', motivo: 'alergia' },
      { productId: null, texto: 'Berenjena', motivo: 'preferencia' }
    ],
    habitual: []
  });
  const html = resumenDeRestricciones(state, persona);
  revisar(html, 'resumenDeRestricciones');
  assert.ok(html.includes('restriccion-alergia'), 'la alergia lleva su propia clase');
  assert.ok(html.includes('restriccion-preferencia'));
  // Y las palabras, que es lo que lee quien no distingue los colores.
  assert.ok(html.includes('Alergia'));
  assert.ok(html.includes('Lo evita'));
  assert.ok(html.indexOf('Maní') < html.indexOf('Berenjena'), 'la alergia va primero');
});

test('un nombre con etiquetas HTML sale escrito, no ejecutado', () => {
  const { state } = casa();
  const persona = upsertPerson(state, {
    name: '<img src=x onerror=alert(1)>',
    restricciones: [{ productId: null, texto: '<script>alert(2)</script>', motivo: 'alergia' }],
    habitual: []
  });
  const html = resumenDeRestricciones(state, persona);
  assert.ok(!html.includes('<script>'), 'no se cuela una etiqueta');
  assert.ok(html.includes('&lt;script&gt;'));
});

/* ── Dar de baja sin tocar el historial ────────────────────────────────── */

test('dar de baja a alguien no cambia ni una coma de lo que ya se cocinó', () => {
  const { state, arroz } = casa();
  const sofia = upsertPerson(state, { name: 'Sofía', restricciones: [], habitual: [] });
  const luis = upsertPerson(state, { name: 'Luis', restricciones: [], habitual: [] });
  const receta = upsertRecipe(state, { name: 'Arroz blanco', uses: ['almuerzo'], items: [{ productId: arroz, quantity: 2, unit: 'lb' }], covers: [], note: '' });
  const comida = makeRecipePlan(state, receta.id, '2026-03-10', 'almuerzo');
  assert.deepEqual([...comida.participants].sort(), [sofia.id, luis.id].sort());

  const antes = JSON.stringify(state.plans);
  setPersonActive(state, sofia.id, false);

  assert.equal(JSON.stringify(state.plans), antes, 'el plan de marzo queda idéntico');
  assert.ok(comida.participants.includes(sofia.id), 'Sofía comió ese arroz y eso no se reescribe');
  assert.equal(esActiva(sofia), false);
  assert.equal(state.people.length, 2, 'no se borra a nadie: se da de baja');
  assert.deepEqual(personasActivas(state).map(persona => persona.id), [luis.id]);
});

test('quien está de baja no entra en las comidas nuevas, pero sí si se le nombra', () => {
  const { state, arroz } = casa();
  const sofia = upsertPerson(state, { name: 'Sofía', restricciones: [], habitual: [] });
  const luis = upsertPerson(state, { name: 'Luis', restricciones: [], habitual: [] });
  const receta = upsertRecipe(state, { name: 'Arroz blanco', uses: ['cena'], items: [{ productId: arroz, quantity: 2, unit: 'lb' }], covers: [], note: '' });
  setPersonActive(state, sofia.id, false);

  const solos = effectiveParticipants(state, receta, '2026-04-01', 'cena');
  assert.deepEqual(solos, [luis.id], 'por defecto la comida es para quien vive aquí hoy');

  const nombrados = effectiveParticipants(state, receta, '2026-04-01', 'cena', [sofia.id, luis.id]);
  assert.deepEqual(nombrados.sort(), [sofia.id, luis.id].sort(), 'editar una comida vieja no expulsa a nadie');
});

test('una persona de baja vuelve con sus restricciones enteras', () => {
  const { state, mani } = casa();
  const sofia = upsertPerson(state, { name: 'Sofía', kind: 'nino', restricciones: [{ productId: mani, texto: '', motivo: 'alergia' }], habitual: [] });
  setPersonActive(state, sofia.id, false);
  setPersonActive(state, sofia.id, true);
  assert.equal(esActiva(sofia), true);
  assert.equal(sofia.restricciones[0].motivo, 'alergia');
  assert.equal(sofia.kind, 'nino');
});

/* ── La configuración guiada ───────────────────────────────────────────── */

test('un hogar de una sola persona se configura entero', () => {
  const state = createEmptyState();
  const ctx = contexto(state);
  try {
    HOGAR_ACTIONS['hogar-empezar'](null, ctx);
    assert.equal(hogarDe(state).estado, 'contando');

    HOGAR_FORMS['hogar-cuantos'](null, new Map([['total', '1']]), ctx);
    assert.equal(hogarDe(state).estado, 'fichas');
    assert.equal(hogarDe(state).total, 1);
    assert.equal(hogarDe(state).fichas.length, 1);

    fingirPantalla({ nombre: 'Ana', alimento: '' });
    HOGAR_FORMS['hogar-ficha'](null, new Map(), ctx);
  } finally { quitarPantalla(); }

  assert.equal(state.people.length, 1);
  assert.equal(state.people[0].name, 'Ana');
  assert.equal(hogarDe(state).estado, 'listo', 'con una sola persona se termina en la primera ficha');
});

test('el avance se guarda solo: cerrar la app a mitad devuelve la ficha a medias', () => {
  const state = createEmptyState();
  const ctx = contexto(state);
  const almacen = new Map();
  const storage = {
    getItem: clave => (almacen.has(clave) ? almacen.get(clave) : null),
    setItem: (clave, valor) => almacen.set(clave, String(valor)),
    removeItem: clave => almacen.delete(clave),
    key: indice => [...almacen.keys()][indice] ?? null,
    get length() { return almacen.size; }
  };

  try {
    HOGAR_ACTIONS['hogar-empezar'](null, ctx);
    HOGAR_FORMS['hogar-cuantos'](null, new Map([['total', '3']]), ctx);

    // Primera persona completa.
    fingirPantalla({ nombre: 'Ana', alimento: '' });
    HOGAR_FORMS['hogar-ficha'](null, new Map(), ctx);

    // Segunda a medias: nombre escrito, un alimento marcado, y aquí se cierra.
    fingirPantalla({ nombre: 'Luis', alimento: 'Maní' });
    HOGAR_ACTIONS['hogar-motivo']({ dataset: { motivo: 'alergia' } }, ctx);
    HOGAR_ACTIONS['hogar-anadir'](null, ctx);
    fingirPantalla({ nombre: 'Luis', alimento: '' });
    HOGAR_ACTIONS['hogar-clase']({ dataset: { clase: 'adolescente' } }, ctx);
  } finally { quitarPantalla(); }

  // Se guarda como guarda la app de verdad y se vuelve a leer de cero.
  saveState(state, storage);
  const vuelto = loadState(storage);
  const hogar = hogarDe(vuelto);

  assert.equal(hogar.estado, 'fichas');
  assert.equal(hogar.indice, 1, 'se vuelve por la segunda persona');
  assert.equal(hogar.total, 3);
  assert.equal(hogar.borrador.nombre, 'Luis', 'el nombre a medio escribir sobrevivió');
  assert.equal(hogar.borrador.kind, 'adolescente');
  assert.deepEqual(hogar.borrador.restricciones, [{ productId: null, texto: 'Maní', motivo: 'alergia' }]);
  assert.equal(vuelto.people.length, 1, 'la que estaba a medias todavía no es una persona');
  assert.equal(vuelto.people[0].name, 'Ana');
});

test('no se añade un alimento sin decir por qué, ni un motivo sin alimento', () => {
  const state = createEmptyState();
  const ctx = contexto(state);
  try {
    HOGAR_ACTIONS['hogar-empezar'](null, ctx);
    HOGAR_FORMS['hogar-cuantos'](null, new Map([['total', '1']]), ctx);

    // Alimento escrito, motivo sin elegir.
    fingirPantalla({ nombre: 'Ana', alimento: 'Maní' });
    HOGAR_ACTIONS['hogar-anadir'](null, ctx);
    assert.deepEqual(hogarDe(state).borrador.restricciones, [], 'no entra sin motivo');
    assert.match(hogarDe(state).borrador.error, /por qué/);

    // Motivo elegido, sin alimento.
    fingirPantalla({ nombre: 'Ana', alimento: '' });
    HOGAR_ACTIONS['hogar-motivo']({ dataset: { motivo: 'alergia' } }, ctx);
    HOGAR_ACTIONS['hogar-anadir'](null, ctx);
    assert.deepEqual(hogarDe(state).borrador.restricciones, []);
    assert.match(hogarDe(state).borrador.error, /qué alimento/);

    // Las dos cosas: ahora sí.
    fingirPantalla({ nombre: 'Ana', alimento: 'Maní' });
    HOGAR_ACTIONS['hogar-motivo']({ dataset: { motivo: 'alergia' } }, ctx);
    HOGAR_ACTIONS['hogar-anadir'](null, ctx);
    assert.equal(hogarDe(state).borrador.restricciones.length, 1);
    assert.equal(hogarDe(state).borrador.error, '');
  } finally { quitarPantalla(); }
});

test('un alimento escrito y sin añadir no se pierde en silencio al continuar', () => {
  const state = createEmptyState();
  const ctx = contexto(state);
  try {
    HOGAR_ACTIONS['hogar-empezar'](null, ctx);
    HOGAR_FORMS['hogar-cuantos'](null, new Map([['total', '2']]), ctx);
    fingirPantalla({ nombre: 'Ana', alimento: 'Mariscos' });
    HOGAR_FORMS['hogar-ficha'](null, new Map(), ctx);
  } finally { quitarPantalla(); }
  assert.equal(state.people.length, 0, 'no se guarda a medias');
  assert.match(hogarDe(state).borrador.error, /sin añadir/);
});

test('con el motivo ya elegido, guardar añade el alimento en vez de regañar', () => {
  // Quien escribe «Maní», toca «Alergia» y pulsa Intro no ve el botón «Añadir»:
  // está mirando el campo. Su intención no tiene dos lecturas, así que se hace
  // lo que quería —añadirlo— y se queda en la misma ficha para que lo vea.
  const state = createEmptyState();
  const ctx = contexto(state);
  try {
    HOGAR_ACTIONS['hogar-empezar'](null, ctx);
    HOGAR_FORMS['hogar-cuantos'](null, new Map([['total', '1']]), ctx);
    fingirPantalla({ nombre: 'Ana', alimento: 'Maní' });
    HOGAR_ACTIONS['hogar-motivo']({ dataset: { motivo: 'alergia' } }, ctx);
    HOGAR_FORMS['hogar-ficha'](null, new Map(), ctx);
  } finally { quitarPantalla(); }

  assert.equal(state.people.length, 0, 'no se avanza: primero se ve lo añadido');
  assert.deepEqual(hogarDe(state).borrador.restricciones, [{ productId: null, texto: 'Maní', motivo: 'alergia' }]);
  assert.equal(hogarDe(state).borrador.nombre, 'Ana', 'el nombre escrito no se pierde por el camino');
  assert.equal(hogarDe(state).borrador.texto, '', 'el campo queda limpio para el siguiente');

  // Y al segundo toque sí se guarda.
  try {
    fingirPantalla({ nombre: 'Ana', alimento: '' });
    HOGAR_FORMS['hogar-ficha'](null, new Map(), ctx);
  } finally { quitarPantalla(); }
  assert.equal(state.people.length, 1);
  assert.equal(state.people[0].restricciones[0].motivo, 'alergia');
});

test('se puede saltar una persona y seguir', () => {
  const state = createEmptyState();
  const ctx = contexto(state);
  try {
    HOGAR_ACTIONS['hogar-empezar'](null, ctx);
    HOGAR_FORMS['hogar-cuantos'](null, new Map([['total', '2']]), ctx);
    HOGAR_ACTIONS['hogar-saltar'](null, ctx);
    assert.equal(hogarDe(state).indice, 1);
    fingirPantalla({ nombre: 'Luis', alimento: '' });
    HOGAR_FORMS['hogar-ficha'](null, new Map(), ctx);
  } finally { quitarPantalla(); }
  assert.equal(state.people.length, 1);
  assert.equal(hogarDe(state).estado, 'listo');
});

test('volver atrás devuelve la ficha ya guardada para poder corregirla', () => {
  const state = createEmptyState();
  const ctx = contexto(state);
  try {
    HOGAR_ACTIONS['hogar-empezar'](null, ctx);
    HOGAR_FORMS['hogar-cuantos'](null, new Map([['total', '2']]), ctx);
    fingirPantalla({ nombre: 'Ana', alimento: '' });
    HOGAR_FORMS['hogar-ficha'](null, new Map(), ctx);
    HOGAR_ACTIONS['hogar-atras'](null, ctx);
  } finally { quitarPantalla(); }
  const hogar = hogarDe(state);
  assert.equal(hogar.indice, 0);
  assert.equal(hogar.borrador.nombre, 'Ana');
  assert.equal(hogar.borrador.id, state.people[0].id, 'corregir a Ana no crea una segunda Ana');
});

test('volver a pasar por la configuración no duplica a quien ya estaba', () => {
  const state = createEmptyState();
  upsertPerson(state, { name: 'Ana', kind: 'adulto', restricciones: [], habitual: [] });
  const ctx = contexto(state);
  HOGAR_ACTIONS['hogar-empezar'](null, ctx);
  HOGAR_FORMS['hogar-cuantos'](null, new Map([['total', '2']]), ctx);
  const hogar = hogarDe(state);
  assert.equal(hogar.fichas[0], state.people[0].id, 'la primera ficha ya es Ana');
  assert.equal(hogar.borrador.nombre, 'Ana');
  assert.equal(hogar.borrador.id, state.people[0].id);
});

test('solo se ofrece la configuración guiada a quien no tiene a nadie registrado', () => {
  const state = createEmptyState();
  assert.equal(tocaConfigurarElHogar(state), true);
  upsertPerson(state, { name: 'Ana', restricciones: [], habitual: [] });
  assert.equal(tocaConfigurarElHogar(state), false, 'a quien ya tiene su casa no se le planta un asistente');
});

test('las cuatro pantallas del asistente se dibujan sin dejar huecos', () => {
  const state = createEmptyState();
  const ctx = contexto(state);
  revisar(renderHogar(ctx), 'renderHogar (inicio)');
  assert.ok(renderHogar(ctx).includes('Vamos a conocer tu hogar'), 'la promesa es la que se pidió');

  HOGAR_ACTIONS['hogar-empezar'](null, ctx);
  revisar(renderHogar(ctx), 'renderHogar (cuántos)');

  HOGAR_FORMS['hogar-cuantos'](null, new Map([['total', '2']]), ctx);
  revisar(renderHogar(ctx), 'renderHogar (ficha)');
  assert.ok(renderHogar(ctx).includes('Persona 1 de 2'));

  try {
    fingirPantalla({ nombre: 'Ana', alimento: '' });
    HOGAR_FORMS['hogar-ficha'](null, new Map(), ctx);
    fingirPantalla({ nombre: 'Luis', alimento: '' });
    HOGAR_FORMS['hogar-ficha'](null, new Map(), ctx);
  } finally { quitarPantalla(); }
  assert.equal(hogarDe(state).estado, 'listo');
  revisar(renderHogar(ctx), 'renderHogar (final)');
});

test('el contador de personas no baja de una ni sube de veinte', () => {
  const state = createEmptyState();
  const ctx = contexto(state);
  HOGAR_FORMS['hogar-cuantos'](null, new Map([['total', '0']]), ctx);
  assert.equal(hogarDe(state).total, 1);
  HOGAR_FORMS['hogar-cuantos'](null, new Map([['total', '999']]), ctx);
  assert.equal(hogarDe(state).total, 20);
  HOGAR_FORMS['hogar-cuantos'](null, new Map([['total', 'dos']]), ctx);
  assert.equal(hogarDe(state).total, 1, 'lo que no es un número no rompe nada');
});

/* ── Editar la familia desde Familia ───────────────────────────────────── */

test('editar a alguien desde la ventana no toca sus cantidades habituales', () => {
  const { state, mani, arroz } = casa();
  const persona = upsertPerson(state, {
    name: 'Sofía', kind: 'nino',
    restricciones: [{ productId: mani, texto: '', motivo: 'alergia' }],
    habitual: [{ productId: arroz, quantity: 2, unit: 'lb' }]
  });
  const ctx = contexto(state);
  ctx.ui.modal = { type: 'persona', id: persona.id };
  HOGAR_ACTIONS['hogar-editar']({ dataset: { id: persona.id } }, ctx);
  try {
    fingirPantalla({ nombre: 'Sofía Isabel', alimento: '' });
    HOGAR_FORMS['persona']({ dataset: { id: persona.id } }, new Map(), ctx);
  } finally { quitarPantalla(); }

  assert.equal(persona.name, 'Sofía Isabel');
  assert.deepEqual(persona.habitual, [{ productId: arroz, quantity: 2, unit: 'lb' }], 'lo que la ventana no traía se queda');
  assert.equal(persona.restricciones[0].motivo, 'alergia');
  assert.equal(state.people.length, 1, 'editar no crea una segunda persona');
});

test('cambiar la familia no cambia lo que dice un mes anterior', () => {
  const { state, arroz } = casa();
  const sofia = upsertPerson(state, { name: 'Sofía', restricciones: [], habitual: [] });
  const receta = upsertRecipe(state, { name: 'Arroz', uses: ['almuerzo'], items: [{ productId: arroz, quantity: 2, unit: 'lb' }], covers: [], note: '' });
  makeRecipePlan(state, receta.id, '2026-03-10', 'almuerzo');
  const marzoAntes = JSON.stringify(state.plans.filter(plan => plan.date.startsWith('2026-03')));

  // Llega alguien nuevo, se le anota una alergia, y a Sofía la dan de baja.
  upsertPerson(state, { name: 'Pedro', kind: 'adolescente', restricciones: [{ productId: arroz, texto: '', motivo: 'alergia' }], habitual: [] });
  setPersonActive(state, sofia.id, false);

  assert.equal(JSON.stringify(state.plans.filter(plan => plan.date.startsWith('2026-03'))), marzoAntes);
});

/* ── Que todo esto sobreviva a un respaldo ─────────────────────────────── */

test('el hogar entero viaja en un respaldo y vuelve igual', () => {
  const { state, mani } = casa();
  upsertPerson(state, { name: 'Sofía', kind: 'nino', restricciones: [{ productId: mani, texto: '', motivo: 'alergia' }, { productId: null, texto: 'Mariscos', motivo: 'preferencia' }], habitual: [] });
  const luis = upsertPerson(state, { name: 'Luis', kind: 'adolescente', restricciones: [], habitual: [] });
  setPersonActive(state, luis.id, false);

  const vuelto = importState(exportState(state));
  assert.equal(vuelto.people.length, 2);
  assert.equal(vuelto.people[0].kind, 'nino');
  assert.equal(vuelto.people[0].restricciones.length, 2);
  assert.equal(vuelto.people[0].restricciones[0].motivo, 'alergia');
  assert.equal(vuelto.people[1].activo, false, 'quien estaba de baja sigue de baja');
  assert.ok(product(vuelto, vuelto.people[0].restricciones[0].productId), 'la restricción sigue apuntando a un alimento real');
});

test('un día cualquiera con todo esto puesto no rompe el cálculo de siempre', () => {
  const { state, arroz } = casa();
  const sofia = upsertPerson(state, { name: 'Sofía', restricciones: [{ productId: arroz, texto: '', motivo: 'alergia' }], habitual: [] });
  const luis = upsertPerson(state, { name: 'Luis', restricciones: [], habitual: [] });
  const receta = upsertRecipe(state, { name: 'Arroz', uses: ['cena'], items: [{ productId: arroz, quantity: 2, unit: 'lb' }], covers: [], note: '' });
  // Con Sofía en casa, esa cena no se puede guardar: lleva lo que ella no come.
  assert.throws(() => makeRecipePlan(state, receta.id, todayISO(), 'cena'), /incompatible/);
  // Para Luis solo, sí.
  const plan = makeRecipePlan(state, receta.id, todayISO(), 'cena', [luis.id]);
  assert.deepEqual(plan.participants, [luis.id]);
  assert.equal(restriccionesDe(sofia).length, 1);
});
