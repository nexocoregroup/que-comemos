import test from 'node:test';
import assert from 'node:assert/strict';

// La compra, la revisión y el historial congelado.
//
// Tres ideas, y la tercera es una corrección de algo que la app decía y no era
// verdad.
//
// 1. La compra sale de la canasta base vigente + los cambios del período − lo
//    que queda. El menú sigue pudiendo calcularla, pero como opción avanzada:
//    una casa nueva no tiene por qué planificar noventa comidas para saber qué
//    comprar. Y las dos cuentas no se suman nunca.
//
// 2. Una revisión parte de lo que se trajo en la compra anterior, y solo
//    pregunta cuánto queda. Con dos compras al mes, la segunda descuenta lo que
//    sobró de la primera.
//
// 3. «Los meses ya cerrados no cambian» era falso: nada estaba congelado, y la
//    lista de marzo se recalculaba contra la canasta de hoy. Ahora cerrar un
//    período guarda una fotografía y la app la lee en vez de volver a sumar.

import {
  addProduct, addPurchase, cerrarPeriodo, cierresDe, createEmptyState, createReview, effectiveBasket,
  habitualLines, inventoryNow, nombreEnElCierre, periodoCerrado, ponerFrecuencia, promoteToHabitual, reabrirPeriodo,
  saveReview, setHabitualBasket, setHabitualLine, setMonthChange, setReviewScope, shoppingList,
  todayISO, ultimaCompra, updateProduct, upsertRecipe, makeRecipePlan, monthBounds
} from '../src/model.js';
import { shiftMonth } from '../src/ui-kit.js';
import { migrate, SCHEMA_VERSION } from '../src/migrate.js';

const MES = todayISO().slice(0, 7);
const DIA = (n) => `${MES}-${String(n).padStart(2, '0')}`;

function casa() {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  const aceite = addProduct(state, { name: 'Aceite', controlUnit: 'unidad', purchaseUnit: 'unidad' }).id;
  setHabitualBasket(state, [
    { productId: arroz, quantity: 20, unit: 'lb' },
    { productId: aceite, quantity: 2, unit: 'unidad' }
  ]);
  return { state, arroz, aceite };
}

const linea = (lista, productId) => lista.lines.find(item => item.productId === productId);

/* ── La compra sale de la canasta, no del menú ─────────────────────────── */

test('la compra se calcula con la canasta base más los cambios menos lo que hay', () => {
  const { state, arroz } = casa();
  // Este mes, más arroz.
  setMonthChange(state, MES, arroz, { quantity: 30, unit: 'lb' });
  addPurchase(state, { date: DIA(1), lines: [{ productId: arroz, quantity: 8, unit: 'lb' }] });

  const lista = shoppingList(state, DIA(1), DIA(28), 'casa');
  const fila = linea(lista, arroz);
  assert.equal(lista.basis, 'casa', 'la canasta es la base, sin tener que pedirla');
  assert.equal(fila.available, 8, 'no descuenta lo que hay en casa');
  assert.ok(fila.need > 0 && fila.shortfall === Math.max(0, fila.need - 8));
});

test('las dos cuentas nunca se suman', () => {
  // El mismo arroz, en la canasta y dentro de una preparación. Sumarlas lo
  // contaría dos veces: una lista tiene una base, y solo una.
  const { state, arroz } = casa();
  const receta = upsertRecipe(state, { name: 'Locrio', uses: ['almuerzo'], items: [{ productId: arroz, quantity: 2, unit: 'lb' }], note: '' });
  makeRecipePlan(state, receta.id, DIA(3), 'almuerzo');

  const deCasa = shoppingList(state, DIA(1), DIA(28), 'casa');
  const deMenu = shoppingList(state, DIA(1), DIA(28), 'menu');
  assert.equal(deCasa.basis, 'casa');
  assert.equal(deMenu.basis, 'menu');
  assert.equal(linea(deMenu, arroz).need, 2, 'el menú solo cuenta lo que está planificado');
  assert.ok(linea(deCasa, arroz).need > 2, 'la canasta cuenta el consumo del mes');
  // Y una base que no existe cae en la canasta, nunca en una suma de las dos.
  assert.equal(shoppingList(state, DIA(1), DIA(28), 'inventada').basis, 'casa');
});

test('una preparación sin cantidades se nombra en vez de inventarse', () => {
  const { state, arroz } = casa();
  const conAlimentos = upsertRecipe(state, { name: 'Locrio', uses: ['almuerzo'], items: [{ productId: arroz, quantity: 2, unit: 'lb' }], note: '' });
  const sinAlimentos = upsertRecipe(state, { name: 'Sopa de la abuela', uses: ['cena'], items: [], note: '' });
  makeRecipePlan(state, conAlimentos.id, DIA(3), 'almuerzo');
  makeRecipePlan(state, sinAlimentos.id, DIA(3), 'cena');

  const lista = shoppingList(state, DIA(1), DIA(28), 'menu');
  assert.equal(lista.sinCantidades.length, 1);
  assert.equal(lista.sinCantidades[0].title, 'Sopa de la abuela');
  assert.equal(linea(lista, arroz).need, 2, 'la que no se puede calcular no suma nada');
  assert.equal(lista.lines.length, 1, 'no se inventó ningún alimento para la sopa');
});

/* ── La revisión parte de la compra anterior ───────────────────────────── */

test('una revisión pregunta por lo que se trajo en la compra anterior', () => {
  const { state, arroz, aceite } = casa();
  addPurchase(state, { date: DIA(2), lines: [{ productId: arroz, quantity: 10, unit: 'lb' }] });

  const revision = createReview(state, DIA(15));
  assert.equal(revision.origen, 'compra');
  assert.equal(revision.purchaseId, ultimaCompra(state).id);
  assert.deepEqual(revision.productIds, [arroz], 'preguntó por algo que no se compró');

  // Y la despensa entera sigue a un toque.
  addPurchase(state, { date: DIA(3), lines: [{ productId: aceite, quantity: 2, unit: 'unidad' }] });
  setReviewScope(state, revision.id, 'todo');
  assert.equal(revision.productIds.length, 2);

  // Volver a «lo de la compra» vuelve a la compra de esta revisión, no a la
  // última que se haya anotado desde entonces: una revisión empezada el martes
  // no puede cambiar de tema porque el jueves alguien anotara otra compra.
  setReviewScope(state, revision.id, 'compra');
  assert.deepEqual(revision.productIds, [arroz]);
  assert.equal(revision.purchaseId, state.purchases[0].id);
});

test('sin ninguna compra anotada, la revisión no se queda en blanco', () => {
  const { state, arroz } = casa();
  addProduct(state, { name: 'Sal', controlUnit: 'unidad', purchaseUnit: 'unidad', opening: 3 });
  const revision = createReview(state, todayISO());
  assert.equal(revision.origen, 'todo', 'sin compra anterior no hay «lo de la compra» que enseñar');
  assert.ok(revision.productIds.length >= 1);
  assert.ok(arroz);
});

test('lo ya contestado no se cae al cambiar de alcance', () => {
  const { state, arroz, aceite } = casa();
  addPurchase(state, { date: DIA(2), lines: [{ productId: arroz, quantity: 10, unit: 'lb' }, { productId: aceite, quantity: 2, unit: 'unidad' }] });
  const revision = createReview(state, DIA(15));
  saveReview(state, revision.id, { [arroz]: 4 });

  setReviewScope(state, revision.id, 'todo');
  setReviewScope(state, revision.id, 'compra');
  assert.ok(revision.productIds.includes(arroz));
  assert.equal(revision.remaining[arroz], 4, 'se perdió lo que ya estaba contado');
});

test('la segunda quincena descuenta lo que quedó de la primera', () => {
  const { state, arroz } = casa();
  ponerFrecuencia(state, 'quincenal', MES);

  const primera = shoppingList(state, DIA(1), DIA(15), 'casa');
  assert.ok(linea(primera, arroz).shortfall > 0);
  addPurchase(state, { date: DIA(2), lines: [{ productId: arroz, quantity: 10, unit: 'lb' }] });

  const revision = createReview(state, DIA(15));
  saveReview(state, revision.id, { [arroz]: 4 }, true);
  assert.equal(inventoryNow(state)[arroz], 4, 'lo declarado no llegó al inventario');

  const segunda = shoppingList(state, DIA(16), `${MES}-28`, 'casa');
  const fila = linea(segunda, arroz);
  assert.equal(fila.available, 4);
  assert.equal(fila.shortfall, Math.max(0, fila.need - 4), 'la segunda compra no descuenta lo que queda');
  assert.ok(fila.shortfall < fila.need, 'pidió lo mismo que si no quedara nada');
});

/* ── Un período cerrado no se vuelve a calcular ────────────────────────── */

test('cambiar el arroz de 10 a 15 libras hoy no modifica un mes cerrado', () => {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  setHabitualBasket(state, [{ productId: arroz, quantity: 10, unit: 'lb' }]);

  // El mes entero, para que el prorrateo por días no enturbie el número.
  const { start, end } = monthBounds(MES);
  const antes = shoppingList(state, start, end, 'casa');
  assert.equal(linea(antes, arroz).need, 10);
  cerrarPeriodo(state, { start, end, periodo: 'mes' });

  setHabitualLine(state, arroz, 15, 'lb');
  assert.equal(effectiveBasket(state, MES)[0].quantity, 15, 'la canasta de hoy sí cambia');

  const despues = shoppingList(state, start, end, 'casa');
  assert.equal(linea(despues, arroz).need, 10, 'el mes cerrado se recalculó');
  assert.equal(despues.congelado, true);
  // Y el mes siguiente, que no se cerró, sí usa lo de hoy: es lo que se quiere
  // mientras todavía no ha pasado.
  const proximo = monthBounds(shiftMonth(MES, 1));
  const suelto = shoppingList(state, proximo.start, proximo.end, 'casa');
  assert.equal(suelto.congelado, false);
  assert.equal(linea(suelto, arroz).need, 15);
});

test('el cierre guarda todo lo que hizo falta para calcularlo', () => {
  const { state, arroz, aceite } = casa();
  ponerFrecuencia(state, 'quincenal', MES);
  setMonthChange(state, MES, aceite, { quantity: 5, unit: 'unidad' });
  addPurchase(state, { date: DIA(2), lines: [{ productId: arroz, quantity: 10, unit: 'lb' }] });
  const revision = createReview(state, DIA(14));
  saveReview(state, revision.id, { [arroz]: 3 }, true);

  const cierre = cerrarPeriodo(state, { start: DIA(1), end: DIA(15), periodo: 'primera' });

  assert.equal(cierre.frecuencia, 'quincenal', 'no guardó la frecuencia vigente');
  assert.equal(cierre.periodo, 'primera');
  assert.ok(cierre.canasta.length, 'no guardó la canasta que se usó');
  assert.equal(cierre.excepciones.length, 1, 'no guardó las excepciones del mes');
  assert.equal(cierre.compras.length, 1, 'no guardó lo que se compró');
  assert.equal(cierre.compras[0].lines[0].quantity, 10);
  assert.equal(cierre.existencia.origen, 'revision', 'no guardó la existencia declarada');
  assert.equal(cierre.existencia.valores[arroz], 3);
  assert.ok(cierre.lista.length, 'no guardó la lista final');
  assert.equal(cierre.menu, null, 'calculado desde la canasta, el menú no pinta nada');
  assert.equal(cierre.basis, 'casa');
  // Y los nombres de entonces, para que renombrar no reescriba el historial.
  assert.equal(nombreEnElCierre(state, cierre, arroz), 'Arroz');
  updateProduct(state, arroz, { name: 'Arroz blanco' });
  assert.equal(nombreEnElCierre(state, cierre, arroz), 'Arroz', 'el historial cambió de nombre solo');
});

test('el menú se guarda cuando fue el que produjo la lista', () => {
  const { state, arroz } = casa();
  const receta = upsertRecipe(state, { name: 'Locrio', uses: ['almuerzo'], items: [{ productId: arroz, quantity: 2, unit: 'lb' }], note: '' });
  makeRecipePlan(state, receta.id, DIA(3), 'almuerzo');
  const cierre = cerrarPeriodo(state, { start: DIA(1), end: DIA(15), periodo: 'primera', basis: 'menu' });
  assert.equal(cierre.basis, 'menu');
  assert.equal(cierre.menu.length, 1);
  assert.equal(cierre.menu[0].title, 'Locrio');
});

test('cerrar dos veces el mismo período no se deja, y reabrir lo devuelve a la vida', () => {
  const { state, arroz } = casa();
  cerrarPeriodo(state, { start: DIA(1), end: DIA(15), periodo: 'primera' });
  assert.throws(() => cerrarPeriodo(state, { start: DIA(1), end: DIA(15) }), /ya está cerrado/);
  assert.equal(cierresDe(state, MES).length, 1);
  assert.ok(periodoCerrado(state, DIA(1), DIA(15)));

  setHabitualLine(state, arroz, 40, 'lb');
  assert.equal(shoppingList(state, DIA(1), DIA(15), 'casa').congelado, true);

  const cierre = cierresDe(state, MES)[0];
  assert.equal(reabrirPeriodo(state, cierre.id), true);
  const suelto = shoppingList(state, DIA(1), DIA(15), 'casa');
  assert.equal(suelto.congelado, false, 'reabrir tiene que devolverlo al cálculo de hoy');
  assert.ok(linea(suelto, arroz).need > 10);
  // Reabrir no puede llevarse por delante ninguna compra ni ninguna revisión.
  assert.equal(state.purchases.length, 0);
  assert.equal(state.reviews.length, 0);
});

test('las quincenas se cierran por separado', () => {
  const { state } = casa();
  ponerFrecuencia(state, 'quincenal', MES);
  cerrarPeriodo(state, { start: DIA(1), end: DIA(15), periodo: 'primera' });
  assert.equal(shoppingList(state, DIA(1), DIA(15), 'casa').congelado, true);
  assert.equal(shoppingList(state, DIA(16), `${MES}-28`, 'casa').congelado, false, 'cerrar una quincena congeló la otra');
});

/* ── Un ocasional que pasa a ser de siempre ────────────────────────────── */

test('añadir a la canasta base entra en vigor desde el mes que se diga', () => {
  const { state } = casa();
  const cangrejo = addProduct(state, { name: 'Cangrejo', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  setMonthChange(state, '2026-03', cangrejo, { quantity: 3, unit: 'lb' });
  promoteToHabitual(state, '2026-03', [cangrejo], '2026-06');

  const tiene = mes => effectiveBasket(state, mes).some(fila => fila.productId === cangrejo);
  assert.equal(tiene('2026-02'), false, 'apareció en un mes anterior a la excepción');
  assert.equal(tiene('2026-03'), true, 'el mes donde se compró de verdad lo perdió');
  assert.equal(tiene('2026-04'), false, 'apareció antes de entrar en vigencia');
  assert.equal(tiene('2026-06'), true);
  assert.equal(tiene('2026-07'), true);
  // Y en marzo sigue siendo la excepción que fue, no la norma.
  assert.equal(effectiveBasket(state, '2026-03').find(fila => fila.productId === cangrejo).source, 'extra');
});

test('sin decir el mes, entra desde el mes del cambio', () => {
  const { state } = casa();
  const cangrejo = addProduct(state, { name: 'Cangrejo', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  setMonthChange(state, '2026-03', cangrejo, { quantity: 3, unit: 'lb' });
  promoteToHabitual(state, '2026-03', [cangrejo]);
  const tiene = mes => effectiveBasket(state, mes).some(fila => fila.productId === cangrejo);
  assert.equal(tiene('2026-02'), false, 'se metió hacia atrás en un mes que ya pasó');
  assert.equal(tiene('2026-03'), true);
  assert.equal(tiene('2026-04'), true);
});

test('corregir la cantidad de una línea no cambia desde cuándo se compra', () => {
  const { state } = casa();
  const cangrejo = addProduct(state, { name: 'Cangrejo', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  setMonthChange(state, '2026-03', cangrejo, { quantity: 3, unit: 'lb' });
  promoteToHabitual(state, '2026-03', [cangrejo], '2026-06');
  setHabitualLine(state, cangrejo, 5, 'lb');
  const tiene = mes => effectiveBasket(state, mes).some(fila => fila.productId === cangrejo);
  assert.equal(tiene('2026-05'), false, 'corregir la cantidad lo adelantó dos meses');
  assert.equal(effectiveBasket(state, '2026-06').find(fila => fila.productId === cangrejo).quantity, 3, 'junio se quedó con la cantidad que se dijo para junio');
  assert.equal(effectiveBasket(state, todayISO().slice(0, 7)).find(fila => fila.productId === cangrejo).quantity, 5, 'y la corrección vale desde este mes');
});

/* ── Una línea nueva nace con su fecha ─────────────────────────────────────

   Lo de arriba cubre el alimento que se asciende desde una excepción del mes,
   que es el único sitio donde la app pregunta desde cuándo. Estas pruebas son
   de los otros cinco: la pantalla de la canasta, la ficha del alimento, el
   dictado, el asistente y el cambio del mes. Por todos ellos entraba antes sin
   fecha, y sin fecha quiere decir «desde siempre»: añadir cangrejo hoy ponía a
   junio, julio y agosto a comprar cangrejo. */

// Una casa que ya venía funcionando antes de este mes, con su arroz marcado
// como obligatorio, que es lo que hace el asistente de entrada con los
// alimentos comunes del catálogo.
function casaDeAntes() {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  setHabitualBasket(state, [{ productId: arroz, quantity: 20, unit: 'lb', priority: 'obligatorio', desde: '2025-01' }]);
  return { state, arroz };
}

test('un alimento añadido hoy no aparece en los meses que ya pasaron', () => {
  const { state } = casaDeAntes();
  const cangrejo = addProduct(state, { name: 'Cangrejo', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  setHabitualLine(state, cangrejo, 5, 'lb');
  const tiene = mes => effectiveBasket(state, mes).some(fila => fila.productId === cangrejo);
  assert.equal(tiene(shiftMonth(MES, -3)), false, 'se metió tres meses hacia atrás');
  assert.equal(tiene(shiftMonth(MES, -1)), false, 'se metió en el mes pasado');
  assert.equal(tiene(MES), true, 'no entró en el mes en curso');
  assert.equal(tiene(shiftMonth(MES, 1)), true, 'no sigue el mes que viene');
});

test('la compra de un mes que ya pasó no cambia porque hoy se añada algo', () => {
  const { state, arroz } = casaDeAntes();
  const pasado = monthBounds(shiftMonth(MES, -1));
  const antes = shoppingList(state, pasado.start, pasado.end, 'casa');
  assert.equal(antes.lines.length, 1, 'la casa de antes debería tener su arroz el mes pasado');

  const cangrejo = addProduct(state, { name: 'Cangrejo', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  setHabitualLine(state, cangrejo, 5, 'lb');

  const despues = shoppingList(state, pasado.start, pasado.end, 'casa');
  assert.equal(despues.lines.length, 1, 'la compra del mes pasado cambió sola');
  assert.equal(linea(despues, cangrejo), undefined, 'el mes pasado se puso a comprar cangrejo');
  assert.ok(linea(despues, arroz), 'y de paso perdió el arroz de siempre');
  // En el mes en curso sí está, que es lo que se pidió.
  const ahora = monthBounds(MES);
  assert.ok(linea(shoppingList(state, ahora.start, ahora.end, 'casa'), cangrejo));
});

test('guardar la canasta entera no vuelve a fechar lo que ya estaba', () => {
  const { state, arroz } = casaDeAntes();
  // La pantalla de la canasta reenvía todas sus líneas sin fecha al guardar. Si
  // eso las volviera a fechar hoy, cada mes anterior se quedaría vacío de golpe
  // por haber corregido una cantidad.
  setHabitualBasket(state, [{ productId: arroz, quantity: 25, unit: 'lb' }]);
  assert.equal(habitualLines(state)[0].desde, '2025-01', 'guardar la canasta vació todos los meses anteriores');
  assert.equal(effectiveBasket(state, '2025-06').find(fila => fila.productId === arroz).quantity, 20, 'junio de 2025 se compró con 20 libras, y así tiene que quedarse');
  assert.equal(habitualLines(state)[0].quantity, 25, 'y desde este mes son 25');
});

test('guardar la canasta entera tampoco rebaja lo que estaba en obligatorio', () => {
  const { state, arroz } = casaDeAntes();
  // Esa pantalla tampoco pinta la prioridad, así que la reenvía en blanco igual
  // que la fecha: corregir unas libras de arroz no puede decidir que el arroz
  // ha dejado de ser obligatorio en esta casa.
  setHabitualBasket(state, [{ productId: arroz, quantity: 25, unit: 'lb' }]);
  assert.equal(habitualLines(state)[0].priority, 'obligatorio', 'guardar la canasta borró las prioridades');

  // Y corregir la cantidad desde la ficha del alimento, tampoco.
  setHabitualLine(state, arroz, 30, 'lb');
  assert.equal(habitualLines(state)[0].priority, 'obligatorio');
  // Pero decirlo a propósito sí manda.
  setHabitualLine(state, arroz, 30, 'lb', 'ocasional');
  assert.equal(habitualLines(state)[0].priority, 'ocasional');
});

test('añadir varios de corrido fecha solo lo nuevo', () => {
  const { state, arroz } = casaDeAntes();
  const habichuela = addProduct(state, { name: 'Habichuela', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  // Así guardan el dictado y el asistente de entrada: lo de siempre delante, lo
  // nuevo detrás, todo de una sentada.
  setHabitualBasket(state, [
    { productId: arroz, quantity: 20, unit: 'lb' },
    { productId: habichuela, quantity: 4, unit: 'lb' }
  ]);
  const enLaCanasta = id => habitualLines(state).find(fila => fila.productId === id);
  assert.equal(enLaCanasta(arroz).desde, '2025-01');
  assert.equal(enLaCanasta(arroz).priority, 'obligatorio', 'el dictado rebajó lo que ya estaba');
  assert.equal(enLaCanasta(habichuela).desde, MES);
  assert.equal(enLaCanasta(habichuela).priority, 'frecuente');

  const anterior = effectiveBasket(state, shiftMonth(MES, -1)).map(fila => fila.productId);
  assert.ok(anterior.includes(arroz), 'el mes pasado perdió el arroz de siempre');
  assert.ok(!anterior.includes(habichuela), 'el mes pasado se puso a comprar habichuela');
});

test('una canasta escrita antes de esto sigue contando desde siempre', () => {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  // Tal cual quedaba guardada antes de que las líneas llevaran fecha. Ponerle
  // una ahora sería inventar un día en que esta casa empezó a comer arroz.
  state.habitualBasket.lines = [{ id: 'canasta-1', productId: arroz, quantity: 20, unit: 'lb', priority: 'frecuente', desde: null }];
  assert.ok(effectiveBasket(state, '2020-01').some(fila => fila.productId === arroz));

  setHabitualLine(state, arroz, 25, 'lb');
  assert.equal(habitualLines(state)[0].desde, null, 'corregir la cantidad le inventó una fecha de nacimiento');
  assert.ok(effectiveBasket(state, '2020-01').some(fila => fila.productId === arroz), 'un mes viejo perdió el arroz que sí compró');
});

test('corregir hoy la cantidad de algo añadido hoy no lo adelanta ni lo atrasa', () => {
  const { state } = casaDeAntes();
  const cangrejo = addProduct(state, { name: 'Cangrejo', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  setHabitualLine(state, cangrejo, 5, 'lb');
  setHabitualLine(state, cangrejo, 8, 'lb');
  const fila = habitualLines(state).find(item => item.productId === cangrejo);
  assert.equal(fila.desde, MES);
  assert.equal(fila.quantity, 8);
});

/* ── La migración ──────────────────────────────────────────────────────── */

test('un respaldo sin períodos cerrados se convierte sin inventarse ninguno', () => {
  const viejo = {
    version: 6, seq: 10, products: [], people: [], recipes: [], plans: [], absences: [],
    opening: {}, purchases: [], reviews: [], corrections: [], manualItems: [],
    habitualBasket: { lines: [], updatedAt: null, history: [] },
    monthOverrides: {}, mealRoutines: [], monthPlans: {}, activity: [],
    settings: { reviewWeekday: 5, onboarded: true }
  };
  const { ok, state, to } = migrate(structuredClone(viejo));
  assert.equal(ok, true);
  assert.equal(to, SCHEMA_VERSION);
  assert.deepEqual(state.closedPeriods, [], 'no hay forma honrada de reconstruir un cierre que nunca se guardó');
  // Y repetirla no cambia nada.
  assert.deepEqual(migrate(structuredClone(state)).state.closedPeriods, []);
});

test('un respaldo que ya traía cierres los conserva tal cual', () => {
  const { state } = casa();
  const cierre = cerrarPeriodo(state, { start: DIA(1), end: DIA(15), periodo: 'primera' });
  const vuelto = migrate(structuredClone(state));
  assert.equal(vuelto.ok, true);
  assert.deepEqual(vuelto.state.closedPeriods, [cierre]);
});
