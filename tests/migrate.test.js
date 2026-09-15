import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_VERSION, migrate } from '../src/migrate.js';
import { balances, exportState, importState, inventoryNow } from '../src/model.js';
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

test('la migración no pierde nada de lo que había', () => {
  const viejo = respaldoV1();
  const { ok, state, from, to, migrated } = migrate(viejo);
  assert.equal(ok, true);
  assert.equal(from, 1);
  assert.equal(to, SCHEMA_VERSION);
  assert.equal(migrated, true);
  for (const clave of ['people', 'recipes', 'plans', 'absences', 'purchases', 'reviews', 'corrections', 'manualItems']) {
    assert.equal(state[clave].length, viejo[clave].length, `se conservaron los datos de ${clave}`);
  }
  assert.deepEqual(state.opening, viejo.opening, 'las existencias de apertura son las mismas');
  assert.equal(state.seq, 12, 'el contador de identificadores se conserva: los ids nuevos no chocan');
});

test('los identificadores y las referencias entre datos siguen apuntando a lo mismo', () => {
  const { state } = migrate(respaldoV1());
  assert.deepEqual(state.products.map(item => item.id), ['producto-1', 'producto-2']);
  assert.equal(state.people[0].restrictions[0], 'producto-2');
  assert.equal(state.recipes[0].items[0].productId, 'producto-1');
  assert.equal(state.plans[0].items[0].productId, 'producto-1');
  assert.equal(state.purchases[0].lines[0].productId, 'producto-2');
  assert.equal(state.baseBasket.lines[0].id, 'canasta-12', 'hasta la línea de la canasta conserva su identidad');
});

test('la canasta que había se convierte en canasta base, y el mes actual nace de ella', () => {
  const { state } = migrate(respaldoV1());
  assert.equal(state.baseBasket.lines.length, 1);
  assert.equal(state.baseBasket.lines[0].quantity, 40);
  assert.equal(state.baseBasket.lines[0].priority, 'frecuente', 'sin prioridad escrita, el término medio');
  const meses = Object.keys(state.monthlyBaskets);
  assert.equal(meses.length, 1);
  assert.equal(state.monthlyBaskets[meses[0]].lines.length, 1, 'el mes corriente se abrió con una copia');
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

test('un respaldo de la versión 1 se puede importar y vuelve a exportarse en la nueva', () => {
  const importado = importState(JSON.stringify(respaldoV1()));
  assert.equal(importado.version, SCHEMA_VERSION);
  const ida = importState(exportState(importado));
  assert.deepEqual(ida, importado, 'exportar e importar el formato nuevo devuelve lo mismo');
});

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
