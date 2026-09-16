import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_VERSION, migrate } from '../src/migrate.js';
import { balances, effectiveBasket, exportState, habitualLines, importState, inventoryNow, monthChanges } from '../src/model.js';
import { BACKUP_KEY, STORAGE_KEY, loadStateDetailed, saveState } from '../src/storage.js';

// Un respaldo de la versión 1 escrito a mano, con un poco de todo: es lo que
// tiene guardado ahora mismo cualquiera que ya venía usando la app.
function respaldoV1() {
  return {
    version: 1, seq: 12, demo: false,
    products: [
      { id: 'producto-1', name: 'Plátano maduro', controlUnit: 'unidad', purchaseUnit: 'unidad', equivalences: {}, slice: null },
      { id: 'producto-2', name: 'Salami', controlUnit: 'rueda', purchaseUnit: 'paquete', equivalences: { paquete: 16 }, slice: 'media' }
    ],
    people: [{ id: 'persona-1', name: 'Sofía', restrictions: ['producto-2'], habitual: [{ productId: 'producto-1', quantity: 2, unit: 'unidad' }] }],
    recipes: [{ id: 'preparacion-1', name: 'Mangú', uses: ['desayuno'], items: [{ productId: 'producto-1', quantity: 3, unit: 'unidad', personId: null }], covers: [], servings: null, note: '' }],
    plans: [{ id: 'comida-1', date: '2026-09-01', slot: 'desayuno', kind: 'recipe', recipeId: 'preparacion-1', title: 'Mangú', note: '', servings: null, participants: ['persona-1'], items: [{ id: 'alimento-1', productId: 'producto-1', quantity: 3, unit: 'unidad', personId: null }] }],
    absences: [{ date: '2026-09-02', slot: 'cena', personId: 'persona-1' }],
    opening: { 'producto-1': 8, 'producto-2': 0 },
    purchases: [{ id: 'compra-1', seq: 8, date: '2026-09-01', period: null, lines: [{ productId: 'producto-2', quantity: 1, unit: 'paquete', controlQuantity: 16 }] }],
    reviews: [{ id: 'revision-1', seq: 9, date: '2026-09-03', status: 'confirmed', productIds: ['producto-1'], consumed: { 'producto-1': 3 } }],
    corrections: [{ id: 'ajuste-1', seq: 10, date: '2026-09-04', productId: 'producto-1', delta: -1, actual: 4, reason: 'se dañó uno' }],
    manualItems: [{ id: 'otro-11', name: 'Detergente', quantity: '', done: false }],
    basket: [{ id: 'canasta-12', productId: 'producto-1', quantity: 40, unit: 'unidad' }]
  };
}

// Un respaldo de la versión 2: canasta base más una copia entera por mes. Los
// tres meses cubren los tres casos que la conversión tiene que distinguir —uno
// idéntico a la base, uno con diferencias, y otro también idéntico— porque de
// ahí sale la decisión de guardar un cambio o no guardar nada.
function respaldoV2() {
  const base = {
    lines: [
      { id: 'canasta-1', productId: 'producto-1', quantity: 40, unit: 'unidad', priority: 'obligatorio' },
      { id: 'canasta-2', productId: 'producto-2', quantity: 8, unit: 'rueda', priority: 'ocasional' }
    ],
    updatedAt: '2026-08-01', history: []
  };
  const copia = () => base.lines.map(line => ({ ...line, id: `${line.id}-copia` }));
  return {
    ...respaldoV1(),
    version: 2,
    reviews: [{ id: 'revision-1', seq: 9, date: '2026-09-03', status: 'confirmed', mode: 'consumido', remaining: {}, productIds: ['producto-1'], consumed: { 'producto-1': 3 } }],
    basket: undefined,
    baseBasket: base,
    monthlyBaskets: {
      // Igual que la base: no fue una excepción de nadie.
      '2026-08': { month: '2026-08', lines: copia(), createdAt: '2026-08-01', updatedAt: '2026-08-01', basedOn: '2026-08-01' },
      // 60 en vez de 40, sin salami y con un pollo que no está en la base.
      '2026-09': {
        month: '2026-09',
        lines: [
          { id: 'canasta-9a', productId: 'producto-1', quantity: 60, unit: 'unidad', priority: 'obligatorio' },
          { id: 'canasta-9b', productId: 'producto-3', quantity: 4, unit: 'lb', priority: 'frecuente' }
        ],
        createdAt: '2026-09-01', updatedAt: '2026-09-10', basedOn: '2026-08-01'
      },
      '2026-10': { month: '2026-10', lines: copia(), createdAt: '2026-10-01', updatedAt: '2026-10-01', basedOn: '2026-08-01' }
    },
    products: [
      ...respaldoV1().products,
      { id: 'producto-3', name: 'Pollo', normalized: 'pollo', aliases: [], category: 'otros', controlUnit: 'lb', purchaseUnit: 'lb', equivalences: {}, slice: null, archived: false, origin: 'manual', createdAt: '2026-09-01', updatedAt: '2026-09-01' }
    ],
    invoices: [{ id: 'factura-1', total: 1200, date: '2026-09-02' }],
    activity: []
  };
}

/* ── Venir de la versión 1 ─────────────────────────────────────────────── */

test('la cadena de la versión 1 a la 3 corre entera y no pierde nada de lo que había', () => {
  const viejo = respaldoV1();
  const { ok, state, from, to, migrated } = migrate(viejo);
  assert.equal(ok, true);
  assert.equal(from, 1);
  assert.equal(to, 4);
  assert.equal(to, SCHEMA_VERSION);
  assert.equal(state.version, 4);
  assert.equal(migrated, true);
  for (const clave of ['people', 'recipes', 'plans', 'absences', 'purchases', 'reviews', 'corrections', 'manualItems']) {
    assert.equal(state[clave].length, viejo[clave].length, `se conservaron los datos de ${clave}`);
  }
  assert.deepEqual(state.opening, viejo.opening, 'las existencias de apertura son las mismas');
  assert.equal(state.seq >= 12, true, 'el contador de identificadores no retrocede: los ids nuevos no chocan');
});

test('los identificadores y las referencias entre datos siguen apuntando a lo mismo', () => {
  const { state } = migrate(respaldoV1());
  assert.deepEqual(state.products.map(item => item.id), ['producto-1', 'producto-2']);
  assert.equal(state.people[0].restricciones[0].productId, 'producto-2');
  assert.equal(state.recipes[0].items[0].productId, 'producto-1');
  assert.equal(state.plans[0].items[0].productId, 'producto-1');
  assert.equal(state.purchases[0].lines[0].productId, 'producto-2');
  assert.equal(habitualLines(state)[0].id, 'canasta-12', 'hasta la línea de la canasta conserva su identidad');
});

test('la canasta que había pasa a llamarse habitual y sigue siendo la misma', () => {
  const { state } = migrate(respaldoV1());
  assert.equal('baseBasket' in state, false, 'el nombre viejo ya no existe');
  assert.equal('monthlyBaskets' in state, false);
  assert.equal(habitualLines(state).length, 1);
  assert.equal(habitualLines(state)[0].quantity, 40);
  assert.equal(habitualLines(state)[0].priority, 'frecuente', 'sin prioridad escrita, el término medio');
  // El mes que la v1→v2 abrió era una copia exacta de la base: no era ninguna
  // excepción y por eso no deja rastro.
  assert.deepEqual(state.monthOverrides, {}, 'no se inventan excepciones donde no las hubo');
  assert.equal(effectiveBasket(state, '2026-09')[0].quantity, 40);
});

test('el catálogo nuevo se rellena sin inventar categorías', () => {
  const { state } = migrate(respaldoV1());
  const salami = state.products.find(item => item.id === 'producto-2');
  assert.equal(salami.normalized, 'salami');
  assert.equal(salami.category, 'otros', 'no se adivina la categoría: se deja neutra');
  assert.equal(salami.origin, 'manual');
  assert.equal(salami.archived, false);
  assert.deepEqual(salami.aliases, []);
  assert.equal(salami.slice, 'media', 'lo que ya estaba escrito se respeta');
  assert.equal(salami.equivalences.paquete, 16);
  assert.ok(salami.createdAt && salami.updatedAt);
});

test('el inventario da exactamente el mismo número antes y después de migrar', () => {
  const { state } = migrate(respaldoV1());
  // 8 de apertura − 3 revisados − 1 de corrección = 4.
  assert.equal(inventoryNow(state)['producto-1'], 4);
  assert.equal(inventoryNow(state)['producto-2'], 16);
  assert.equal(balances(state).problems.length, 0);
});

/* ── Venir de la versión 2 ─────────────────────────────────────────────── */

test('un respaldo de la versión 2 se convierte directamente, sin pasar por la 1', () => {
  const { ok, state, from, to } = migrate(respaldoV2());
  assert.equal(ok, true);
  assert.equal(from, 2);
  assert.equal(to, 4);
  assert.equal(state.products.length, 3);
  assert.equal(state.purchases.length, 1);
  assert.equal(state.reviews.length, 1);
  assert.equal(state.recipes.length, 1);
  assert.equal(state.plans.length, 1);
  assert.equal(state.corrections.length, 1);
  assert.equal(state.manualItems.length, 1);
  assert.equal(inventoryNow(state)['producto-1'], 4, 'las cuentas de la despensa no se movieron');
  assert.equal(inventoryNow(state)['producto-2'], 16);
});

test('cada mes guarda solo aquello en lo que se apartaba de la canasta base', () => {
  const { state } = migrate(respaldoV2());
  // Agosto y octubre eran copias exactas: no eran excepciones y no se guardan.
  assert.deepEqual(Object.keys(state.monthOverrides), ['2026-09']);
  assert.deepEqual(monthChanges(state, '2026-08').changes, []);
  assert.deepEqual(monthChanges(state, '2026-10').changes, []);
  const cambios = monthChanges(state, '2026-09').changes;
  assert.equal(cambios.length, 3);
  const porProducto = Object.fromEntries(cambios.map(cambio => [cambio.productId, cambio]));
  // 60 en vez de 40: un cambio de cantidad.
  assert.equal(porProducto['producto-1'].quantity, 60);
  assert.equal(porProducto['producto-1'].removed, false);
  assert.equal(porProducto['producto-1'].extra, false);
  // El pollo no estaba en la base: fue un extra de septiembre.
  assert.equal(porProducto['producto-3'].extra, true);
  assert.equal(porProducto['producto-3'].quantity, 4);
  // El salami estaba en la base y no en el mes: aquel mes se quitó.
  assert.equal(porProducto['producto-2'].removed, true);
  assert.ok(cambios.every(cambio => cambio.id && cambio.createdAt), 'cada cambio queda identificado y fechado');
});

test('la canasta de cada mes se vuelve a leer igual que estaba escrita', () => {
  const { state } = migrate(respaldoV2());
  const septiembre = effectiveBasket(state, '2026-09');
  assert.equal(septiembre.length, 2, 'el salami no se compró aquel mes');
  assert.equal(septiembre.find(line => line.productId === 'producto-1').quantity, 60);
  assert.equal(septiembre.find(line => line.productId === 'producto-1').source, 'cambio');
  assert.equal(septiembre.find(line => line.productId === 'producto-3').source, 'extra');
  // Agosto y octubre vuelven a salir de la habitual y dan lo mismo que tenían.
  for (const mes of ['2026-08', '2026-10']) {
    const canasta = effectiveBasket(state, mes);
    assert.equal(canasta.length, 2, `${mes} sigue teniendo sus dos alimentos`);
    assert.equal(canasta.find(line => line.productId === 'producto-1').quantity, 40);
    assert.equal(canasta.find(line => line.productId === 'producto-2').quantity, 8);
    assert.ok(canasta.every(line => line.source === 'habitual'));
  }
});

test('los meses que estaban en uso quedan marcados como abiertos, y nadie más', () => {
  const { state } = migrate(respaldoV2());
  assert.deepEqual(Object.keys(state.monthPlans), ['2026-08', '2026-09', '2026-10']);
  assert.equal(state.monthPlans['2026-09'].openedAt, '2026-09-01', 'la fecha en que se abrió de verdad');
  assert.equal(state.monthPlans['2026-09'].preparedAt, null);
  assert.equal(state.monthPlans['2026-09'].summary, null);
  assert.equal(state.monthPlans['2026-11'], undefined, 'un mes que nadie usó no se abre solo');
});

test('lo que aparece nuevo arranca vacío, sin rutinas inventadas del historial', () => {
  const { state } = migrate(respaldoV2());
  assert.deepEqual(state.mealRoutines, [], 'comer fuera tres domingos no es haber escrito una regla');
  assert.deepEqual(state.settings, { reviewWeekday: 5, onboarded: true }, 'ya tenía productos: la configuración estaba hecha');
  assert.ok(Array.isArray(state.activity));
  const vacio = migrate({ ...respaldoV2(), products: [], baseBasket: { lines: [], updatedAt: null, history: [] }, monthlyBaskets: {} }).state;
  assert.equal(vacio.settings.onboarded, false, 'sin un solo alimento, la configuración está por hacer');
});

test('cada comida queda marcada como no puesta por ninguna rutina', () => {
  const { state } = migrate(respaldoV2());
  assert.ok(state.plans.every(plan => plan.routineId === null));
  assert.equal('routineId' in state.plans[0], true, 'el campo existe, no falta');
});

test('las facturas salen del estado vivo pero no se borran a espaldas de nadie', () => {
  const viejo = respaldoV2();
  const { state, notes } = migrate(viejo);
  assert.equal('invoices' in state, false, 'ya no viajan con el estado de cada día');
  assert.equal(viejo.invoices.length, 1, 'el respaldo que se le pasó sigue teniéndolas');
  assert.ok(notes.some(note => /factura/i.test(note)), 'y se le avisa a la persona de dónde quedaron');
});

test('las notas de la migración se le pueden leer a cualquiera', () => {
  const { notes } = migrate(respaldoV2());
  assert.ok(notes.length > 0);
  assert.ok(notes.some(note => /canasta habitual/i.test(note)));
  assert.ok(notes.every(note => typeof note === 'string' && note.trim().length > 10));
});

/* ── Migrar dos veces ──────────────────────────────────────────────────── */

test('migrar dos veces da exactamente lo mismo: nada se duplica', () => {
  const primera = migrate(respaldoV2());
  const segunda = migrate(structuredClone(primera.state));
  assert.equal(segunda.ok, true);
  assert.equal(segunda.migrated, false, 'un estado que ya está en la versión nueva no se vuelve a convertir');
  assert.deepStrictEqual(segunda.state, primera.state);
  // Y volver a migrar el original tampoco da otra cosa.
  assert.deepStrictEqual(migrate(respaldoV2()).state, primera.state);
  const desdeV1 = migrate(respaldoV1()).state;
  assert.deepStrictEqual(migrate(structuredClone(desdeV1)).state, desdeV1);
  assert.equal(monthChanges(segunda.state, '2026-09').changes.length, 3, 'los cambios no se apilan sobre sí mismos');
});

test('importar y exportar el formato nuevo devuelve lo mismo, venga de donde venga', () => {
  for (const respaldo of [respaldoV1(), respaldoV2()]) {
    const importado = importState(JSON.stringify(respaldo));
    assert.equal(importado.version, SCHEMA_VERSION);
    assert.deepStrictEqual(importState(exportState(importado)), importado);
  }
});

/* ── Lo que no se puede migrar ─────────────────────────────────────────── */

test('un respaldo dañado se rechaza sin tocar nada', () => {
  const roto = respaldoV1();
  delete roto.purchases;
  const { state } = migrate(roto);
  assert.equal(state.purchases.length, 0, 'la migración rellena lo que falta…');
  const sinVersion = respaldoV1();
  delete sinVersion.version;
  assert.equal(migrate(sinVersion).ok, false, '…pero sin versión no se migra a ciegas');
  assert.equal(migrate(null).ok, false);
  assert.equal(migrate([]).ok, false);
  assert.match(migrate({ version: 99 }).error, /más nueva/, 'un respaldo del futuro no se degrada en silencio');
  const negativo = respaldoV1();
  negativo.opening = { 'producto-1': 0, 'producto-2': 0 };
  negativo.reviews[0].consumed['producto-1'] = 500;
  assert.throws(() => importState(JSON.stringify(negativo)), /negativas/, 'la validación corre después de migrar');
});

test('un respaldo con los cambios de un mes rotos se rechaza antes de guardarse', () => {
  const roto = importState(JSON.stringify(respaldoV2()));
  roto.monthOverrides['2026-09'].changes = null;
  assert.throws(() => importState(JSON.stringify(roto)), /2026-09/);
  const sinCanasta = importState(JSON.stringify(respaldoV2()));
  delete sinCanasta.habitualBasket;
  assert.throws(() => importState(JSON.stringify(sinCanasta)), /respaldo/);
});

/* ── El almacenamiento del teléfono ────────────────────────────────────── */

test('cargar del almacenamiento migra, guarda la versión nueva y conserva la anterior aparte', () => {
  const memoria = new Map();
  const storage = { getItem: key => memoria.get(key) ?? null, setItem: (key, value) => memoria.set(key, value) };
  storage.setItem(STORAGE_KEY, JSON.stringify(respaldoV1()));
  const { state, migrated, from } = loadStateDetailed(storage);
  assert.equal(migrated, true);
  assert.equal(from, 1);
  assert.equal(state.version, SCHEMA_VERSION);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).version, SCHEMA_VERSION, 'lo guardado se actualizó');
  assert.equal(JSON.parse(storage.getItem(BACKUP_KEY)).version, 1, 'y lo de antes sigue existiendo por si acaso');
  // Volver a cargar ya no migra nada: la conversión ocurre una sola vez.
  assert.equal(loadStateDetailed(storage).migrated, false);
});

test('el respaldo previo guarda el estado entero, facturas incluidas', () => {
  const memoria = new Map();
  const storage = { getItem: key => memoria.get(key) ?? null, setItem: (key, value) => memoria.set(key, value) };
  const original = JSON.stringify(respaldoV2());
  storage.setItem(STORAGE_KEY, original);
  loadStateDetailed(storage);
  assert.equal(storage.getItem(BACKUP_KEY), original, 'letra por letra, tal como estaba');
  const guardado = JSON.parse(storage.getItem(BACKUP_KEY));
  assert.equal(guardado.invoices.length, 1, 'las facturas que salieron del estado vivo siguen aquí');
  assert.equal(guardado.monthlyBaskets['2026-09'].lines.length, 2, 'y las canastas de cada mes tal como se escribieron');
});

test('un estado dañado en el almacenamiento no se sobrescribe con nada', () => {
  const memoria = new Map();
  const storage = { getItem: key => memoria.get(key) ?? null, setItem: (key, value) => memoria.set(key, value) };
  const roto = respaldoV1();
  roto.opening = null;
  const original = JSON.stringify(roto);
  storage.setItem(STORAGE_KEY, original);
  assert.throws(() => loadStateDetailed(storage), /existencias/);
  assert.equal(storage.getItem(STORAGE_KEY), original, 'lo que había sigue intacto, letra por letra');
  assert.equal(storage.getItem(BACKUP_KEY), null);
});

test('actualizar la app conserva los datos: es el mismo almacenamiento', () => {
  const memoria = new Map();
  const storage = { getItem: key => memoria.get(key) ?? null, setItem: (key, value) => memoria.set(key, value) };
  const estado = importState(JSON.stringify(respaldoV1()));
  estado.manualItems.push({ id: 'otro-99', name: 'Jabón', quantity: '2', done: false });
  saveState(estado, storage);
  const recuperado = loadStateDetailed(storage).state;
  assert.equal(recuperado.manualItems.length, 2);
  assert.equal(inventoryNow(recuperado)['producto-1'], 4);
});
