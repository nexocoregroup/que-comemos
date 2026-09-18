import test from 'node:test';
import assert from 'node:assert/strict';

// Las preparaciones.
//
// El cambio de fondo es una resta: la preparación deja de preguntar quién la
// come. Se preguntaba al crearla y se volvía a preguntar al ponerla en el
// calendario, y de las dos respuestas la buena era siempre la segunda, porque
// quién come depende del día y no del plato.
//
// Lo que más se comprueba aquí es que una preparación marcada para dos momentos
// siga siendo UN registro. Dos bloques enseñando lo mismo es fácil; dos bloques
// enseñando dos copias que se desincronizan es el error que hay que impedir.

import { MOMENTOS, MOMENTOS_IDS, SLOTS, SLOTS_PRINCIPALES, addProduct, createEmptyState, effectiveParticipants, makeRecipePlan, upsertPerson, upsertRecipe } from '../src/model.js';
import { migrate, SCHEMA_VERSION } from '../src/migrate.js';
import { emptyMas, renderMas, MAS_ACTIONS } from '../src/page-mas.js';

function contexto(state, extra = {}) {
  const ctx = {
    state,
    ui: { page: 'preparaciones', modal: null, mas: emptyMas(), ...extra },
    commit: () => {}, toast: () => {}, render: () => {}, closeModal: () => {}, openModal: () => {}, startTour: () => {},
    servicios: { transcribe: false, chat: false, enElAparato: { voz: false } }
  };
  return ctx;
}

const revisar = (html, donde) => {
  assert.equal(typeof html, 'string', `${donde} no devolvió HTML`);
  for (const basura of ['undefined', 'NaN', '[object Object]']) {
    assert.ok(!html.includes(basura), `${donde} imprime «${basura}»`);
  }
  assert.ok(!/\$\{/.test(html), `${donde} dejó una plantilla sin resolver`);
};

function casa() {
  const state = createEmptyState();
  const platano = addProduct(state, { name: 'Plátano', controlUnit: 'unidad', purchaseUnit: 'unidad' }).id;
  const salami = addProduct(state, { name: 'Salami', controlUnit: 'rueda', purchaseUnit: 'unidad' }).id;
  return { state, platano, salami };
}

/* ── Los cinco momentos ────────────────────────────────────────────────── */

test('son cinco momentos, en el orden del día', () => {
  assert.deepEqual(MOMENTOS.map(item => item.etiqueta), [
    'Desayuno', 'Merienda de mañana', 'Almuerzo', 'Merienda de tarde', 'Cena'
  ]);
});

test('el calendario tiene los cinco momentos, y los principales son tres', () => {
  assert.deepEqual(SLOTS, ['desayuno', 'merienda-manana', 'almuerzo', 'merienda-tarde', 'cena']);
  assert.deepEqual(SLOTS, MOMENTOS.map(item => item.id));
  // Las meriendas son opcionales: están en el día, pero no cuentan como hueco.
  assert.deepEqual(SLOTS_PRINCIPALES, ['desayuno', 'almuerzo', 'cena']);
  assert.deepEqual(SLOTS_PRINCIPALES, MOMENTOS.filter(item => !item.opcional).map(item => item.id));
});

test('mangú con salami se guarda para desayuno y cena, en una sola preparación', () => {
  const { state, platano, salami } = casa();
  const mangu = upsertRecipe(state, {
    name: 'Mangú con salami',
    uses: ['cena', 'desayuno'],
    items: [{ productId: platano, quantity: 3, unit: 'unidad' }, { productId: salami, quantity: 4, unit: 'rueda' }],
    note: 'Guardar lo que sobre para el desayuno del día siguiente.'
  });
  assert.equal(state.recipes.length, 1, 'un momento más no es una preparación más');
  assert.deepEqual(mangu.uses, ['desayuno', 'cena'], 'se guardan en el orden del día, no en el que se tocaron');
  assert.equal(mangu.note, 'Guardar lo que sobre para el desayuno del día siguiente.');
});

test('una preparación puede estar en los cinco momentos, meriendas incluidas', () => {
  const { state } = casa();
  const receta = upsertRecipe(state, { name: 'Pan con queso', uses: [...MOMENTOS_IDS], items: [] });
  assert.deepEqual(receta.uses, MOMENTOS_IDS);
});

test('un momento inventado no entra, y sin ninguno no se guarda', () => {
  const { state } = casa();
  const receta = upsertRecipe(state, { name: 'Algo', uses: ['almuerzo', 'medianoche'], items: [] });
  assert.deepEqual(receta.uses, ['almuerzo']);
  assert.throws(() => upsertRecipe(state, { name: 'Otra', uses: [], items: [] }), /momentos/i);
  assert.throws(() => upsertRecipe(state, { name: 'Otra', uses: ['medianoche'], items: [] }), /momentos/i);
});

/* ── Se fue «quiénes la comen normalmente» ─────────────────────────────── */

test('una preparación ya no guarda a quién le toca', () => {
  const { state } = casa();
  const ana = upsertPerson(state, { name: 'Ana', restricciones: [], habitual: [] }).id;
  // Aunque se le pase a la fuerza, no se guarda: el campo dejó de existir.
  const receta = upsertRecipe(state, { name: 'Sopa', uses: ['cena'], items: [], covers: [ana] });
  assert.equal('covers' in receta, false);
});

test('editar una preparación vieja le quita el campo', () => {
  const { state } = casa();
  const receta = upsertRecipe(state, { name: 'Sopa', uses: ['cena'], items: [] });
  receta.covers = ['persona-1'];              // como si viniera de un respaldo a medias
  upsertRecipe(state, { id: receta.id, name: 'Sopa', uses: ['cena'], items: [] });
  assert.equal('covers' in receta, false);
});

test('sin decir nada, la comida es para toda la casa', () => {
  const { state } = casa();
  const ana = upsertPerson(state, { name: 'Ana', restricciones: [], habitual: [] }).id;
  const luis = upsertPerson(state, { name: 'Luis', restricciones: [], habitual: [] }).id;
  const receta = upsertRecipe(state, { name: 'Sopa', uses: ['cena'], items: [] });

  const participantes = effectiveParticipants(state, receta, '2026-10-05', 'cena');
  assert.deepEqual([...participantes].sort(), [ana, luis].sort());

  // Y la excepción se marca al ponerla en el calendario, que es donde se sabe.
  const plan = makeRecipePlan(state, receta.id, '2026-10-06', 'cena', [ana]);
  assert.deepEqual(plan.participants, [ana]);
});

/* ── Se puede guardar a medias ─────────────────────────────────────────── */

test('una preparación sin alimentos se guarda igual', () => {
  const { state } = casa();
  const receta = upsertRecipe(state, { name: 'Sancocho', uses: ['almuerzo'], items: [] });
  assert.equal(receta.items.length, 0);
  assert.equal(state.recipes.length, 1);
  // Y sirve para el calendario, que es lo que se pierde si no se puede guardar.
  const plan = makeRecipePlan(state, receta.id, '2026-10-07', 'almuerzo');
  assert.equal(plan.title, 'Sancocho');
});

test('el rendimiento es opcional y no se inventa', () => {
  const { state } = casa();
  assert.equal(upsertRecipe(state, { name: 'A', uses: ['cena'], items: [] }).servings, null);
  assert.equal(upsertRecipe(state, { name: 'B', uses: ['cena'], items: [], servings: '' }).servings, null);
  assert.equal(upsertRecipe(state, { name: 'C', uses: ['cena'], items: [], servings: 4 }).servings, 4);
});

/* ── La migración ──────────────────────────────────────────────────────── */

const respaldoV4 = () => ({
  version: 4, seq: 12, demo: false,
  products: [{ id: 'producto-1', name: 'Plátano', normalized: 'platano', aliases: [], category: 'viveres', controlUnit: 'unidad', purchaseUnit: 'unidad', equivalences: {}, slice: null, archived: false, origin: 'manual', createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
  people: [{ id: 'persona-1', name: 'Ana', kind: 'adulto', activo: true, restricciones: [], habitual: [] }],
  recipes: [
    { id: 'preparacion-1', name: 'Mangú con salami', uses: ['cena', 'desayuno'], items: [{ productId: 'producto-1', quantity: 3, unit: 'unidad', personId: null }], covers: ['persona-1'], servings: 4, note: 'Dejar una parte.' },
    { id: 'preparacion-2', name: 'Sopa', uses: ['almuerzo'], items: [], covers: [], servings: null, note: '' }
  ],
  plans: [{ id: 'comida-1', date: '2026-03-10', slot: 'cena', kind: 'recipe', recipeId: 'preparacion-1', routineId: null, title: 'Mangú con salami', note: '', servings: 4, participants: ['persona-1'], items: [] }],
  absences: [], opening: {}, purchases: [], reviews: [], corrections: [], manualItems: [],
  habitualBasket: { lines: [], updatedAt: null, history: [] },
  monthOverrides: {}, mealRoutines: [], monthPlans: {},
  settings: { reviewWeekday: 5, onboarded: true }, activity: []
});

test('un respaldo de la versión 4 llega a la 5 y pierde solo el campo que sobraba', () => {
  const { ok, state, from, to, migrated } = migrate(respaldoV4());
  assert.equal(ok, true);
  assert.equal(from, 4);
  assert.equal(to, SCHEMA_VERSION);
  assert.equal(state.version, SCHEMA_VERSION);
  assert.equal(migrated, true);

  const mangu = state.recipes[0];
  assert.equal('covers' in mangu, false, 'el campo que sobraba ya no está');
  assert.equal(mangu.name, 'Mangú con salami');
  assert.deepEqual(mangu.uses, ['desayuno', 'cena'], 'los momentos viejos se conservan, en el orden del día');
  assert.equal(mangu.servings, 4);
  assert.equal(mangu.note, 'Dejar una parte.');
  assert.equal(mangu.items.length, 1, 'los alimentos no se tocan');
});

test('la migración no asigna meriendas a nadie', () => {
  const { state } = migrate(respaldoV4()).state ? migrate(respaldoV4()) : {};
  for (const receta of state.recipes) {
    assert.ok(!receta.uses.includes('merienda-manana'), `${receta.name} se llevó una merienda que nadie puso`);
    assert.ok(!receta.uses.includes('merienda-tarde'), `${receta.name} se llevó una merienda que nadie puso`);
  }
});

test('las comidas que ya estaban en el calendario no cambian de participantes', () => {
  const antes = respaldoV4();
  const { state } = migrate(antes);
  assert.deepEqual(state.plans[0].participants, ['persona-1'], 'lo planificado se queda como estaba');
  assert.equal(state.plans.length, 1);
});

test('migrar dos veces da lo mismo que migrar una', () => {
  const primera = migrate(respaldoV4()).state;
  const segunda = migrate(structuredClone(primera)).state;
  assert.deepEqual(segunda.recipes, primera.recipes);
});

test('un respaldo a medias —ya sin covers pero con un momento raro— se limpia igual', () => {
  const medias = respaldoV4();
  medias.version = 5;
  medias.recipes = [{ id: 'preparacion-9', name: 'Rara', uses: ['almuerzo', 'medianoche'], items: [], servings: null, note: '', covers: ['persona-1'] }];
  const { state } = migrate(medias);
  assert.deepEqual(state.recipes[0].uses, ['almuerzo']);
  assert.equal('covers' in state.recipes[0], false);
});

/* ── La pantalla ───────────────────────────────────────────────────────── */

function conPreparaciones() {
  const { state, platano, salami } = casa();
  upsertRecipe(state, { name: 'Mangú con salami', uses: ['desayuno', 'cena'], items: [{ productId: platano, quantity: 3, unit: 'unidad' }, { productId: salami, quantity: 4, unit: 'rueda' }], servings: 4, note: 'Guardar lo que sobre.' });
  upsertRecipe(state, { name: 'Sancocho', uses: ['almuerzo'], items: [] });
  upsertRecipe(state, { name: 'Pan con queso', uses: ['merienda-tarde'], items: [] });
  return state;
}

test('los cinco bloques salen con su cuenta', () => {
  const ctx = contexto(conPreparaciones());
  const html = renderMas(ctx);
  revisar(html, 'preparaciones');
  for (const momento of MOMENTOS) assert.ok(html.includes(momento.plural), `falta el bloque «${momento.plural}»`);
  // Desayunos 1 · Meriendas de mañana 0 · Almuerzos 1 · Meriendas de tarde 1 · Cenas 1
  const cuentas = [...html.matchAll(/<span class="badge-count">(\d+)<\/span>/g)].map(fila => Number(fila[1]));
  assert.deepEqual(cuentas, [1, 0, 1, 1, 1]);
});

test('el mangú sale en Desayunos y en Cenas, y sigue siendo un solo registro', () => {
  const state = conPreparaciones();
  const html = renderMas(contexto(state));
  const veces = [...html.matchAll(/Mangú con salami/g)].length;
  assert.equal(veces, 2, 'aparece en los dos bloques');
  assert.equal(state.recipes.filter(receta => receta.name === 'Mangú con salami').length, 1, 'pero es una sola preparación');

  // Y editarla la cambia en los dos sitios a la vez, sin nada que sincronizar.
  const mangu = state.recipes.find(receta => receta.name === 'Mangú con salami');
  upsertRecipe(state, { id: mangu.id, name: 'Mangú con huevo', uses: ['desayuno', 'cena'], items: [] });
  const despues = renderMas(contexto(state));
  assert.equal([...despues.matchAll(/Mangú con huevo/g)].length, 2);
  assert.ok(!despues.includes('Mangú con salami'));
  assert.equal(state.recipes.length, 3, 'editar no crea una copia');
});

test('no queda ninguna pregunta sobre quién come en la pantalla de preparaciones', () => {
  const state = conPreparaciones();
  upsertPerson(state, { name: 'Ana', restricciones: [], habitual: [] });
  const html = renderMas(contexto(state));
  // Ojo con «raciones» a secas: está dentro de «prepa-raciones». El límite de
  // palabra es lo que separa la palabra vieja del nombre de la pantalla.
  for (const sobra of [/Quiénes la comen/i, /Para quien coma ese día/i, /¿Para quiénes/i, /raciones/i]) {
    assert.ok(!sobra.test(html), `todavía dice algo como «${sobra}»`);
  }
});

test('una preparación sin alimentos lo dice en voz baja, no en rojo', () => {
  const html = renderMas(contexto(conPreparaciones()));
  assert.ok(html.includes('Sin alimentos anotados'));
  assert.ok(!/error|falta obligatori/i.test(html));
});

test('sin alimentos y con alguien que evita algo, se dice que no se ha revisado nada', () => {
  // Esto es lo que no se puede callar. Una preparación sin alimentos no choca
  // con nada, y eso se leía igual que «revisada y limpia». Para una casa con una
  // alergia al maní, las dos cosas no se parecen.
  const state = conPreparaciones();
  upsertPerson(state, { name: 'Sofía', kind: 'nino', restricciones: [{ productId: null, texto: 'Maní', motivo: 'alergia' }] });
  const html = renderMas(contexto(state));
  revisar(html, 'preparaciones con una alergia en casa');
  assert.ok(/no ha revisado/.test(html), 'no dice que no pudo revisar nada');
  assert.ok(!/segura|sin problemas|todo bien/i.test(html), 'no puede presentarla como segura');
});

test('sin nadie que evite nada, no se alarma de algo que no hay', () => {
  const html = renderMas(contexto(conPreparaciones()));
  assert.ok(!/no ha revisado/.test(html), 'avisa de alergias en una casa donde nadie evita nada');
});

test('el buscador filtra por nombre, por nota y por alimento', () => {
  const state = conPreparaciones();
  const porNombre = contexto(state);
  porNombre.ui.mas.recetaFiltro = 'sancocho';
  assert.ok(renderMas(porNombre).includes('Sancocho'));
  assert.ok(!renderMas(porNombre).includes('Mangú'));

  const porAlimento = contexto(state);
  porAlimento.ui.mas.recetaFiltro = 'salami';
  assert.ok(renderMas(porAlimento).includes('Mangú con salami'));
  assert.ok(!renderMas(porAlimento).includes('Sancocho'));

  const porNota = contexto(state);
  porNota.ui.mas.recetaFiltro = 'sobre';
  assert.ok(renderMas(porNota).includes('Mangú con salami'));

  const nada = contexto(state);
  nada.ui.mas.recetaFiltro = 'pizza siciliana';
  const html = renderMas(nada);
  revisar(html, 'búsqueda sin resultados');
  assert.ok(html.includes('Nada coincide'));
});

/* Plegar ya no lo hace la app: lo hace el navegador.

   Los bloques son `<details class="plegable">` y la acción solo apunta en qué
   quedaron, porque el siguiente repintado reconstruye la pantalla desde el
   estado y se llevaría el atributo `open` por delante. Dos consecuencias que
   esta prueba tiene que imitar para decir algo cierto:

     · al entrar en la acción, `open` todavía vale lo de ANTES del clic —el
       oyente corre antes de que el navegador lo cambie—;
     · lo plegado sigue estando en el HTML. Lo esconde el navegador, no la
       plantilla, y eso es una mejora: el «buscar en la página» lo encuentra.

   Así que lo que se comprueba es el atributo, no la ausencia del texto. */
const abierto = (html, momento) => {
  const encaje = new RegExp(`<details[^>]*class="[^"]*recetas-bloque[^"]*"[^>]*>\\s*<summary[^>]*data-momento="${momento}"`, 's').exec(html);
  assert.ok(encaje, `no encuentro el bloque de ${momento}`);
  return / open[ >]/.test(encaje[0]);
};
const plegar = (ctx, momento, estabaAbierto) =>
  MAS_ACTIONS['receta-plegar']({ dataset: { momento }, closest: () => ({ open: estabaAbierto }) }, ctx);

test('los bloques se pliegan y se despliegan, y se acuerdan', () => {
  const ctx = contexto(conPreparaciones());
  const primero = renderMas(ctx);
  assert.ok(primero.includes('Mangú con salami'), 'empiezan abiertos');
  assert.ok(abierto(primero, 'desayuno'), 'empiezan abiertos');

  plegar(ctx, 'desayuno', true);
  plegar(ctx, 'cena', true);
  const plegado = renderMas(ctx);
  assert.ok(!abierto(plegado, 'desayuno'), 'plegado su bloque, sigue desplegado');
  assert.ok(!abierto(plegado, 'cena'), 'plegado su bloque, sigue desplegado');
  assert.ok(plegado.includes('Desayunos'), 'pero la cabecera sigue ahí');
  assert.ok(abierto(plegado, 'almuerzo'), 'los demás bloques no se tocan');
  assert.ok(plegado.includes('Sancocho'), 'los demás bloques no se tocan');

  plegar(ctx, 'desayuno', false);
  assert.ok(abierto(renderMas(ctx), 'desayuno'), 'no se vuelve a abrir');
});

test('buscando, ningún bloque se queda plegado sobre lo que coincide', () => {
  const ctx = contexto(conPreparaciones());
  plegar(ctx, 'desayuno', true);
  ctx.ui.mas.recetaFiltro = 'mangú';
  assert.ok(abierto(renderMas(ctx), 'desayuno'),
    'lo que coincide con la búsqueda se quedó escondido detrás de un pliegue');
});

test('la pantalla vacía y la pantalla llena se dibujan las dos', () => {
  revisar(renderMas(contexto(createEmptyState())), 'preparaciones sin ninguna');
  assert.ok(renderMas(contexto(createEmptyState())).includes('Todavía no hay ninguna'));
  revisar(renderMas(contexto(conPreparaciones())), 'preparaciones con datos');
});

test('una preparación que se quedó sin momento se avisa en vez de esconderse', () => {
  const state = conPreparaciones();
  state.recipes[1].uses = [];               // como si viniera dañada de un respaldo
  const html = renderMas(contexto(state));
  revisar(html, 'preparaciones con una sin momento');
  assert.ok(html.includes('sin momento'));
  assert.ok(html.includes('Sancocho'));
});

/* ── La ficha sin cantidades ───────────────────────────────────────────────

   Desde la etapa 1 una preparación es una ficha reutilizable con nombre,
   momentos y nota para quien cocina. Los alimentos que lleva son un dato
   opcional, y su cantidad también: una casa apunta «locrio: arroz, pollo,
   aceitunas» mucho antes de saber cuántas tazas, y muchas veces no lo sabe
   nunca. Exigir el número era pedir un inventario antes de dejar apuntar la
   idea. */

test('una instalación nueva puede crear una preparación sin ninguna cantidad', () => {
  const { state, platano, salami } = casa();
  const receta = upsertRecipe(state, {
    name: 'Mangú con salami', uses: ['desayuno'], note: 'El agua bien caliente.',
    items: [{ productId: platano }, { productId: salami }]
  });
  assert.equal(receta.items.length, 2, 'los alimentos se guardan igual');
  for (const item of receta.items) {
    assert.equal(item.quantity, null);
    assert.equal(item.unit, null, 'sin cantidad no se guarda unidad: «3 de nada» no dice nada');
  }
  assert.equal(receta.note, 'El agua bien caliente.');
});

test('se pueden mezclar alimentos medidos y sin medir en la misma preparación', () => {
  const { state, platano, salami } = casa();
  const receta = upsertRecipe(state, {
    name: 'Mangú', uses: ['desayuno'],
    items: [{ productId: platano, quantity: 4, unit: 'unidad' }, { productId: salami }]
  });
  assert.equal(receta.items[0].quantity, 4);
  assert.equal(receta.items[0].unit, 'unidad');
  assert.equal(receta.items[1].quantity, null);
});

test('lo que sigue sin poderse guardar es una cantidad imposible o un alimento que no existe', () => {
  const { state, platano } = casa();
  assert.throws(() => upsertRecipe(state, { name: 'X', uses: ['cena'], items: [{ productId: platano, quantity: 0, unit: 'unidad' }] }), /mayor que cero/);
  assert.throws(() => upsertRecipe(state, { name: 'X', uses: ['cena'], items: [{ productId: 'no-existe' }] }), /Selecciona un alimento/);
  assert.throws(() => upsertRecipe(state, { name: 'X', uses: ['cena'], items: [{ productId: platano, quantity: 3 }] }), /unidad/);
});

test('una preparación sin cantidades se puede poner en el calendario igual', () => {
  const { state, platano } = casa();
  const receta = upsertRecipe(state, { name: 'Sancocho', uses: ['almuerzo'], items: [{ productId: platano }] });
  const plan = makeRecipePlan(state, receta.id, '2026-10-05', 'almuerzo', null);
  assert.equal(plan.title, 'Sancocho');
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].quantity, null, 'la comida tampoco se inventa cuánto lleva');
});

test('un respaldo viejo no cambia: sus cantidades siguen donde estaban', () => {
  const { state, platano } = casa();
  upsertRecipe(state, { name: 'Mangú', uses: ['desayuno'], items: [{ productId: platano, quantity: 4, unit: 'unidad' }] });
  const { ok, state: despues } = migrate(state);
  assert.ok(ok);
  assert.equal(despues.version, SCHEMA_VERSION);
  assert.deepEqual(despues.recipes[0].items[0], { productId: platano, quantity: 4, unit: 'unidad', personId: null });
});
