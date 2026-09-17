// Los productos habituales y la lista de una salida al supermercado.
//
// Son las dos mitades de lo mismo. Los habituales son lo que esta casa siempre
// compra —una lista de la que uno se acuerda, agrupada por rubros—. La lista de
// compra es la de un sábado concreto: lo que se va a buscar, cuánto decidió
// llevar quien la escribió, y qué se fue tachando por el pasillo.
//
// Lo que más se vigila aquí es lo que la etapa vino a cambiar: que la cantidad
// deje de ser obligatoria. Quien sabe que compra arroz todos los meses no tiene
// por qué saber cuántas libras, y perder el alimento por no saber el número
// sería el peor de los dos males.
//
// Y lo otro: que cerrar una lista no toque las existencias. Una lista no afirma
// nada sobre lo que hay en la casa; afirma lo que alguien decidió comprar.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RUBROS_IDS, actualizarHabitual, actualizarLineaDeLista, agregarALista, agregarHabitual,
  cerrarLista, crearLista, createEmptyState, habitualLines, habitualesPorRubro, inventoryNow,
  listaDeCompra, listasAbiertas, marcarComprado, productByName, quitarDeLista, reabrirLista,
  resumenDeLista, rubroDe, rubroDeCategoria, setHabitualBasket, sugerenciasDeLista, addProduct,
  SCHEMA_VERSION, exportState, importState, upsertRecipe
} from '../src/model.js';
import { CATEGORIES, RUBROS } from '../src/catalog-seed.js';

const casa = () => createEmptyState();

/* ── Los rubros ────────────────────────────────────────────────────────── */

test('toda categoría del catálogo tiene un rubro, y todo rubro del catálogo existe', () => {
  // El mapa vive en migrate.js, escrito a mano, porque una migración no puede
  // depender de lo que el catálogo diga dentro de dos años. Esta prueba es lo
  // que impide que se quede atrás.
  for (const { id, label } of CATEGORIES) {
    assert.ok(RUBROS_IDS.includes(rubroDeCategoria(id)), `la categoría «${label}» cae en un rubro que no existe`);
  }
  assert.deepEqual([...RUBROS_IDS].sort(), RUBROS.map(rubro => rubro.id).sort(), 'los rubros del modelo y los del catálogo se separaron');
});

test('una categoría de otra época cae en «otros» y no en un hueco', () => {
  assert.equal(rubroDeCategoria('categoria-de-otra-epoca'), 'otros');
  assert.equal(rubroDeCategoria(undefined), 'otros');
});

/* ── Anotar un habitual sin saber cuánto ───────────────────────────────── */

test('se puede anotar un alimento habitual sin decir cuánto se compra', () => {
  const state = casa();
  const linea = agregarHabitual(state, { name: 'Arroz', category: 'granos' });
  assert.ok(linea, 'se guardó');
  assert.equal(linea.rubro, 'granos');
  const guardada = habitualLines(state).find(row => row.productId === linea.productId);
  assert.ok(guardada, 'y está en la lista de habituales');
  assert.equal(guardada.quantity, null, 'sin cantidad, que es lo que se dijo');
});

test('anotar un nombre suelto da de alta el alimento: nadie tiene que registrarlo antes', () => {
  const state = casa();
  agregarHabitual(state, { name: 'Yautía', category: 'viveres', unit: 'lb' });
  const item = productByName(state, 'Yautía');
  assert.ok(item, 'el alimento existe ahora');
  assert.equal(item.controlUnit, 'lb');
  assert.equal(rubroDe(state, item.id), 'viveres');
});

test('anotar dos veces el mismo alimento no lo duplica ni le borra la cantidad', () => {
  const state = casa();
  const primera = agregarHabitual(state, { name: 'Arroz', category: 'granos', unit: 'lb', quantity: 25 });
  agregarHabitual(state, { name: 'Arroz' });
  assert.equal(state.habitualBasket.lines.length, 1, 'una línea, no dos');
  const guardada = habitualLines(state).find(row => row.productId === primera.productId);
  assert.equal(guardada.quantity, 25, 'volver a anotarlo no es decir «ya no sé cuánto»');
});

test('el rubro se puede cambiar sin recategorizar el alimento', () => {
  const state = casa();
  const linea = agregarHabitual(state, { name: 'Jabón de cuaba', category: 'limpieza' });
  assert.equal(linea.rubro, 'otros');
  actualizarHabitual(state, linea.productId, { rubro: 'vegetales', nota: 'El de la bolsa azul' });
  assert.equal(rubroDe(state, linea.productId), 'vegetales');
  assert.equal(state.products.find(item => item.id === linea.productId).category, 'limpieza', 'la categoría del alimento no se toca');
  assert.equal(state.habitualBasket.lines[0].nota, 'El de la bolsa azul');
});

test('un rubro inventado no se guarda: se cae en el que le toca por su categoría', () => {
  const state = casa();
  const linea = agregarHabitual(state, { name: 'Arroz', category: 'granos' });
  actualizarHabitual(state, linea.productId, { rubro: 'rubro-que-no-existe' });
  assert.equal(rubroDe(state, linea.productId), 'granos');
});

test('los habituales se enseñan agrupados por rubro, sin los rubros vacíos', () => {
  const state = casa();
  agregarHabitual(state, { name: 'Yuca', category: 'viveres' });
  agregarHabitual(state, { name: 'Arroz', category: 'granos' });
  agregarHabitual(state, { name: 'Batata', category: 'viveres' });
  const grupos = habitualesPorRubro(state);
  assert.deepEqual(grupos.map(grupo => grupo.rubro), ['viveres', 'granos'], 'en el orden en que se preguntan');
  assert.deepEqual(grupos[0].lineas.map(linea => linea.productId).length, 2);
  const nombres = grupos[0].lineas.map(linea => state.products.find(item => item.id === linea.productId).name);
  assert.deepEqual(nombres, ['Batata', 'Yuca'], 'y por nombre dentro de cada rubro');
});

test('una canasta escrita por el camino de siempre también queda con su rubro', () => {
  const state = casa();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb', category: 'granos' }).id;
  setHabitualBasket(state, [{ productId: arroz, quantity: 20, unit: 'lb', priority: 'obligatorio' }]);
  assert.equal(state.habitualBasket.lines[0].rubro, 'granos');
  assert.equal(state.habitualBasket.lines[0].nota, '');
});

/* ── La lista de una salida ────────────────────────────────────────────── */

function conHabituales() {
  const state = casa();
  const arroz = agregarHabitual(state, { name: 'Arroz', category: 'granos', unit: 'lb' }).productId;
  const platano = agregarHabitual(state, { name: 'Plátano', category: 'viveres', unit: 'unidad' }).productId;
  return { state, arroz, platano };
}

test('una lista pertenece a una salida y nace abierta y vacía', () => {
  const { state } = conHabituales();
  const lista = crearLista(state, { fecha: '2026-10-03', nombre: 'La del sábado' });
  assert.equal(lista.estado, 'abierta');
  assert.deepEqual(lista.lineas, []);
  assert.equal(lista.fecha, '2026-10-03');
  assert.equal(listasAbiertas(state).length, 1);
  assert.equal(listaDeCompra(state, lista.id).id, lista.id);
});

test('se apunta lo que hay que comprar, con cantidad o sin ella', () => {
  const { state, arroz } = conHabituales();
  const lista = crearLista(state);
  const conCantidad = agregarALista(state, lista.id, { productId: arroz, cantidad: 25, unidad: 'lb' });
  assert.equal(conCantidad.cantidad, 25);
  assert.equal(conCantidad.rubro, 'granos', 'el renglón se acuerda de su rubro para poder ordenar la lista por pasillos');

  const sinCantidad = agregarALista(state, lista.id, { texto: 'Servilletas' });
  assert.equal(sinCantidad.cantidad, null);
  assert.equal(sinCantidad.productId, null);
  assert.equal(sinCantidad.comprado, false);
});

test('el texto suelto no se convierte en un alimento del catálogo', () => {
  const { state } = conHabituales();
  const lista = crearLista(state);
  const antes = state.products.length;
  agregarALista(state, lista.id, { texto: 'Lo del cumpleaños' });
  assert.equal(state.products.length, antes, 'una lista no puede ir llenando el catálogo de cosas de una sola vez');
});

test('tocar dos veces el mismo alimento actualiza el renglón en vez de repetirlo', () => {
  const { state, arroz } = conHabituales();
  const lista = crearLista(state);
  agregarALista(state, lista.id, { productId: arroz, cantidad: 25, unidad: 'lb' });
  const otra = agregarALista(state, lista.id, { productId: arroz, cantidad: 30, unidad: 'lb' });
  assert.equal(listaDeCompra(state, lista.id).lineas.length, 1);
  assert.equal(otra.cantidad, 30);
});

test('una lista vacía de qué comprar no se guarda', () => {
  const { state } = conHabituales();
  const lista = crearLista(state);
  assert.throws(() => agregarALista(state, lista.id, {}), /Escribe qué hay que comprar/);
});

test('tachar y destachar es lo único que hay que poder hacer en el supermercado', () => {
  const { state, arroz } = conHabituales();
  const lista = crearLista(state);
  const renglon = agregarALista(state, lista.id, { productId: arroz });
  marcarComprado(state, lista.id, renglon.id);
  assert.equal(listaDeCompra(state, lista.id).lineas[0].comprado, true);
  assert.deepEqual(resumenDeLista(listaDeCompra(state, lista.id)), { total: 1, comprados: 1, pendientes: 0 });
  marcarComprado(state, lista.id, renglon.id, false);
  assert.equal(listaDeCompra(state, lista.id).lineas[0].comprado, false);
});

test('se corrige la cantidad y se quita un renglón sin tocar el resto', () => {
  const { state, arroz, platano } = conHabituales();
  const lista = crearLista(state);
  const uno = agregarALista(state, lista.id, { productId: arroz, cantidad: 25, unidad: 'lb' });
  const otro = agregarALista(state, lista.id, { productId: platano });
  actualizarLineaDeLista(state, lista.id, uno.id, { cantidad: '', nota: 'El que esté en oferta' });
  assert.equal(listaDeCompra(state, lista.id).lineas[0].cantidad, null, 'borrar la cantidad es legítimo: no borra el renglón');
  assert.equal(listaDeCompra(state, lista.id).lineas[0].nota, 'El que esté en oferta');
  assert.equal(quitarDeLista(state, lista.id, otro.id), true);
  assert.equal(listaDeCompra(state, lista.id).lineas.length, 1);
});

/* ── Una lista no es un inventario ─────────────────────────────────────── */

test('cerrar una lista no toca las existencias de la casa', () => {
  const { state, arroz } = conHabituales();
  const antes = inventoryNow(state);
  const lista = crearLista(state);
  const renglon = agregarALista(state, lista.id, { productId: arroz, cantidad: 25, unidad: 'lb' });
  marcarComprado(state, lista.id, renglon.id);
  cerrarLista(state, lista.id);

  assert.deepEqual(inventoryNow(state), antes, 'una lista dice lo que alguien decidió comprar, no lo que hay en la casa');
  assert.equal(state.purchases.length, 0, 'y no se anota como compra por su cuenta');
  assert.equal(listaDeCompra(state, lista.id).estado, 'cerrada');
});

test('lo que quedó sin tachar se queda sin tachar: no se consiguió, y eso es verdad', () => {
  const { state, arroz, platano } = conHabituales();
  const lista = crearLista(state);
  const uno = agregarALista(state, lista.id, { productId: arroz });
  agregarALista(state, lista.id, { productId: platano });
  marcarComprado(state, lista.id, uno.id);
  cerrarLista(state, lista.id);
  assert.deepEqual(resumenDeLista(listaDeCompra(state, lista.id)), { total: 2, comprados: 1, pendientes: 1 });
});

test('una lista cerrada no se cambia sin volver a abrirla', () => {
  const { state, arroz } = conHabituales();
  const lista = crearLista(state);
  cerrarLista(state, lista.id);
  assert.throws(() => agregarALista(state, lista.id, { productId: arroz }), /ya se cerró/);
  reabrirLista(state, lista.id);
  assert.doesNotThrow(() => agregarALista(state, lista.id, { productId: arroz }));
});

/* ── La ayuda, y toda la ayuda ─────────────────────────────────────────── */

test('la lista se asiste con los habituales que todavía no están en ella', () => {
  const { state, arroz, platano } = conHabituales();
  const lista = crearLista(state);
  const primeras = sugerenciasDeLista(state, lista.id);
  assert.deepEqual(primeras.flatMap(grupo => grupo.lineas.map(linea => linea.productId)).sort(), [arroz, platano].sort());

  agregarALista(state, lista.id, { productId: arroz });
  const despues = sugerenciasDeLista(state, lista.id);
  assert.deepEqual(despues.flatMap(grupo => grupo.lineas.map(linea => linea.productId)), [platano], 'lo que ya está apuntado deja de sugerirse');
});

test('sugerir no es añadir, y no propone cantidades', () => {
  const { state } = conHabituales();
  const lista = crearLista(state);
  sugerenciasDeLista(state, lista.id);
  assert.equal(listaDeCompra(state, lista.id).lineas.length, 0, 'mirar las sugerencias no apunta nada');
  for (const grupo of sugerenciasDeLista(state, lista.id)) {
    for (const linea of grupo.lineas) assert.equal(linea.quantity, null, 'la cantidad la decide quien compra');
  }
});

/* ── Una instalación nueva, de principio a fin ─────────────────────────── */

test('una casa que empieza hoy monta habituales, preparaciones y su primera lista sin decir una sola cantidad', () => {
  const state = createEmptyState();

  // Los habituales, por rubros, sin cantidades.
  for (const [nombre, categoria] of [['Arroz', 'granos'], ['Plátano maduro', 'viveres'], ['Huevo', 'lacteos'], ['Detergente', 'limpieza']]) {
    agregarHabitual(state, { name: nombre, category: categoria });
  }
  assert.equal(habitualesPorRubro(state).length, 4, 'cuatro rubros con algo dentro');
  for (const grupo of habitualesPorRubro(state)) {
    for (const linea of grupo.lineas) assert.equal(linea.quantity, null);
  }

  // Una preparación, también sin cantidades.
  const receta = upsertRecipe(state, {
    name: 'Mangú con huevo', uses: ['desayuno', 'cena'], note: 'El agua bien caliente.',
    items: [{ productId: productByName(state, 'Plátano maduro').id }, { productId: productByName(state, 'Huevo').id }]
  });
  assert.equal(receta.items.every(item => item.quantity === null), true);

  // Y la lista del sábado, asistida por lo que siempre se compra.
  const lista = crearLista(state, { fecha: '2026-10-03' });
  for (const grupo of sugerenciasDeLista(state, lista.id)) {
    for (const linea of grupo.lineas) agregarALista(state, lista.id, { productId: linea.productId });
  }
  assert.equal(listaDeCompra(state, lista.id).lineas.length, 4);

  // Lo que se guardó tiene que poder volver a entrar: es lo que hace el
  // respaldo, y lo que valida que el estado es coherente de verdad.
  const devuelto = importState(exportState(state));
  assert.equal(devuelto.version, SCHEMA_VERSION);
  assert.equal(devuelto.listasDeCompra.length, 1);
  assert.equal(devuelto.listasDeCompra[0].lineas.length, 4);
  assert.equal(devuelto.recipes[0].items.every(item => item.quantity === null), true);
  assert.equal(devuelto.habitualBasket.lines.every(linea => typeof linea.rubro === 'string'), true);
});
