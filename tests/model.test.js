import test from 'node:test';
import assert from 'node:assert/strict';
import { WEEKDAYS, WEEKDAY_LABELS, WEEKDAY_SHORT, addDays, addProduct, habitualLines, choquesDeLaComida, dateRange, deletePlan, effectiveBasket, product, setSlice, setHabitualBasket, setHabitualLine, addPurchase, balances, convert, correctReview, createEmptyState, createReview, exportState, importState, inventoryNow, linkPlan, makeRecipePlan, monthBounds, monthProgress, saveReview, setAbsence, setEquivalence, setReviewScope, setStatusPlan, todayISO, ultimaCompra, updatePlan, upsertPerson, upsertRecipe, weekdayOf } from '../src/model.js';
import { loadState, saveState, STORAGE_KEY } from '../src/storage.js';

function setup() {
  const state = createEmptyState();
  const platano = addProduct(state, { name: 'Plátano', controlUnit: 'unidad', purchaseUnit: 'unidad' }).id;
  const recipeId = upsertRecipe(state, { name: 'Plátano cocido', uses: ['desayuno', 'cena'], items: [{ productId: platano, quantity: 7, unit: 'unidad' }], covers: [], note: '' }).id;
  state.opening[platano] = 8;
  return { state, platano, recipeId };
}


/* ── El calendario real ────────────────────────────────────────────────────

   Estas cuatro venían de las pruebas del motor de rutinas, que se fue entero.
   La aritmética del calendario no se fue con él: el mes se sigue recorriendo
   día a día, y quien la equivoque perderá el 29 de febrero o el último lunes
   de un mes de 31 sin que nada más se queje. */

// Los días de un mes que de verdad caen en ese día de la semana, contados sobre
// el calendario y sin pasar por el código que se está probando.
function diasRealesDe(month, weekday) {
  const { start, end } = monthBounds(month);
  return dateRange(start, end).filter(date => {
    const dia = new Date(`${date}T12:00:00`).getDay();
    return (dia === 0 ? 7 : dia) === weekday;
  });
}

test('los días de la semana se cuentan como los cuenta la gente: el lunes es el 1 y el domingo el 7', () => {
  assert.deepEqual(WEEKDAYS, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(WEEKDAY_LABELS.length, 7);
  assert.equal(WEEKDAY_SHORT.length, 7);
  assert.equal(WEEKDAY_LABELS[0], 'Lunes');
  assert.equal(WEEKDAY_LABELS[6], 'Domingo');
  assert.equal(WEEKDAY_SHORT[0], 'Lun');
  assert.equal(weekdayOf('2026-10-04'), 7, 'el 4 de octubre de 2026 es domingo');
  assert.equal(weekdayOf('2026-10-05'), 1);
});

test('ningún día del mes se queda fuera, ni en febrero ni en los meses de 31', () => {
  // 28, 29 (bisiesto), 30 y 31 días. Si el mes se recorriera sumando semanas o
  // dando por hecha una longitud, aquí faltarían fechas.
  const casos = [['2026-02', 28], ['2028-02', 29], ['2026-09', 30], ['2026-10', 31]];
  for (const [mes, largo] of casos) {
    const { start, end } = monthBounds(mes);
    const fechas = dateRange(start, end);
    assert.equal(fechas.length, largo, `${mes} tiene ${largo} días`);
    assert.equal(start, `${mes}-01`);
    assert.equal(end, `${mes}-${String(largo).padStart(2, '0')}`, `${mes} no termina donde debería`);
    let total = 0;
    for (const dia of WEEKDAYS) {
      const esperadas = diasRealesDe(mes, dia);
      assert.deepEqual(fechas.filter(fecha => weekdayOf(fecha) === dia), esperadas, `${mes}: todos los ${WEEKDAY_LABELS[dia - 1]}`);
      total += esperadas.length;
    }
    assert.equal(total, largo, `${mes}: los siete días de la semana cubren el mes entero, sin sobras ni faltas`);
  }
});

test('un lunes que cae el 29, el 30 o el 31 sale igual que el del día 5', () => {
  assert.equal(weekdayOf('2026-11-30'), 1, 'el lunes 30 de noviembre de 2026');
  assert.equal(weekdayOf('2026-12-31'), 4, 'el jueves 31 de diciembre de 2026');
  assert.equal(weekdayOf('2028-02-29'), 2, 'el martes 29 de febrero de 2028');
  assert.equal(diasRealesDe('2028-02', 2).length, 5, 'febrero bisiesto que empieza en martes tiene cinco martes');
  // Y en un mes que empieza en domingo, el primer domingo es el día 1.
  assert.deepEqual(diasRealesDe('2026-03', 7), ['2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22', '2026-03-29']);
});

test('un mes mal escrito se rechaza en vez de devolver un mes vacío que parece cierto', () => {
  assert.throws(() => monthProgress(createEmptyState(), '2026-13'), /mes válido/);
  assert.throws(() => monthProgress(createEmptyState(), 'octubre'), /mes válido/);
  assert.throws(() => monthProgress(createEmptyState(), ''), /mes válido/);
});

test('una comida fuera no cuenta como pendiente: ya está decidida', () => {
  const state = createEmptyState();
  const antes = monthProgress(state, '2026-10');
  assert.equal(antes.dias, 31);
  assert.equal(antes.huecos, 93, 'treinta y un días por las tres comidas que una casa espera resolver');
  assert.equal(antes.pendientes, 93, 'un mes vacío está entero por decidir');
  assert.equal(antes.porcentaje, 0);
  setStatusPlan(state, '2026-10-04', 'almuerzo', 'outside');
  setStatusPlan(state, '2026-10-05', 'cena', 'order');
  setStatusPlan(state, '2026-10-06', 'cena', 'unplanned');
  const despues = monthProgress(state, '2026-10');
  assert.equal(despues.fuera, 1);
  assert.equal(despues.pedido, 1);
  assert.equal(despues.encasa, 0);
  assert.equal(despues.pendientes, 91, 'fuera y pedido dejan de ser huecos; «sin decidir» no');
});

test('de ocho plátanos quedan dos: la revisión deduce que se consumieron seis', () => {
  const { state, platano } = setup();
  // El modo normal pregunta lo que se puede mirar en la nevera —cuánto queda—
  // y deduce el consumo. Es la misma cuenta al revés, pero sin obligar a nadie
  // a restar de memoria.
  const review = createReview(state);
  assert.equal(review.mode, 'restante');
  saveReview(state, review.id, { [platano]: 2 }, true);
  assert.equal(review.consumed[platano], 6, 'de ocho quedan dos: se consumieron seis');
  assert.equal(inventoryNow(state)[platano], 2);
});

test('poner una comida no cambia las existencias y anotar la compra sí', () => {
  const { state, platano, recipeId } = setup();
  makeRecipePlan(state, recipeId, todayISO(), 'cena');
  assert.equal(inventoryNow(state)[platano], 8, 'decidir qué se come no descuenta nada de la despensa');
  addPurchase(state, { lines: [{ productId: platano, quantity: 3, unit: 'unidad' }] });
  assert.equal(inventoryNow(state)[platano], 11);
});

test('reconfirmar no duplica, corregir recalcula, la siguiente revisión parte del saldo nuevo', () => {
  const { state, platano } = setup();
  const first = createReview(state, todayISO(), 'consumido');
  saveReview(state, first.id, { [platano]: 6 }, true);
  assert.throws(() => saveReview(state, first.id, { [platano]: 6 }, true));
  assert.equal(inventoryNow(state)[platano], 2);
  correctReview(state, first.id, { [platano]: 5 });
  assert.equal(inventoryNow(state)[platano], 3);
  const next = createReview(state, addDays(todayISO(), 1), 'consumido');
  assert.equal(balances(state, { date: next.date, seq: next.seq }).values[platano], 3);
  saveReview(state, next.id, { [platano]: 1 }, true);
  assert.equal(balances(state).values[platano], 2);
});

test('vacío significa pendiente; cero explícito completa', () => {
  const { state, platano } = setup();
  const review = createReview(state, todayISO(), 'consumido');
  saveReview(state, review.id, { [platano]: '' }, false);
  assert.equal(review.status, 'draft');
  assert.equal(review.consumed[platano], undefined);
  assert.throws(() => saveReview(state, review.id, { [platano]: '' }, true), /pendientes/);
  saveReview(state, review.id, { [platano]: 0 }, true);
  assert.equal(review.status, 'confirmed');
  assert.equal(inventoryNow(state)[platano], 8);
});

test('una unidad sin equivalencia no se convierte a ojo, y el paquete se compra entero', () => {
  const state = createEmptyState();
  const rice = addProduct(state, { name: 'Arroz', controlUnit: 'taza', purchaseUnit: 'lb' }).id;
  const salami = addProduct(state, { name: 'Salami', controlUnit: 'rueda', purchaseUnit: 'paquete' }).id;
  assert.equal(convert(state, rice, 2, 'lb'), null, 'sin equivalencia no se inventa una cuenta');
  assert.equal(convert(state, salami, 1, 'paquete'), null);
  // Y mientras no la haya, anotar esa compra se rechaza en vez de guardarla con
  // una cantidad inventada.
  assert.throws(() => addPurchase(state, { lines: [{ productId: rice, quantity: 2, unit: 'lb' }] }), /equivalencia/);
  setEquivalence(state, rice, 'lb', 2);
  setEquivalence(state, salami, 'paquete', 12);
  assert.equal(convert(state, rice, 2, 'lb'), 4, 'dos libras son cuatro tazas');
  assert.equal(convert(state, salami, 2, 'paquete'), 24);
  addPurchase(state, { lines: [{ productId: salami, quantity: 2, unit: 'paquete' }] });
  assert.equal(inventoryNow(state)[salami], 24, 'lo comprado entra en la unidad con la que se controla');
  assert.throws(() => addPurchase(state, { lines: [{ productId: salami, quantity: 1.5, unit: 'paquete' }] }), /completos/);
});

test('exportación, importación y recarga del almacenamiento local recuperan datos', () => {
  const { state, platano } = setup();
  const memory = new Map();
  const storage = { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) };
  saveState(state, storage);
  assert.ok(memory.has(STORAGE_KEY));
  assert.deepEqual(loadState(storage), state);
  assert.deepEqual(importState(exportState(state)), state);
  assert.equal(loadState(storage).opening[platano], 8);
});

test('una restricción avisa pero no impide poner la comida', () => {
  // Antes esto lanzaba un error y la comida no se guardaba. En una casa real se
  // cocina el mismo plátano y a quien no puede comerlo se le hace otra cosa,
  // así que ahora la app avisa —con la gravedad que toque— y deja decidir.
  const { state, platano, recipeId } = setup();
  const child = upsertPerson(state, { name: 'Persona', restricciones: [{ productId: platano, texto: '', motivo: 'alergia' }], habitual: [] });
  const other = upsertPerson(state, { name: 'Otra persona', restricciones: [], habitual: [] });

  const plan = makeRecipePlan(state, recipeId, todayISO(), 'desayuno');
  assert.ok(plan, 'la comida se guarda igual');
  const choques = choquesDeLaComida(state, plan.items, plan.participants);
  assert.equal(choques.length, 1);
  assert.equal(choques[0].persona, 'Persona');
  assert.equal(choques[0].gravedad, 3, 'una alergia es el aviso más fuerte');

  // Y marcar a alguien fuera lo deja fuera de las comidas que se creen después.
  deletePlan(state, plan.id);
  setAbsence(state, todayISO(), 'desayuno', child.id, true);
  const segundo = makeRecipePlan(state, recipeId, todayISO(), 'desayuno');
  assert.deepEqual(segundo.participants, [other.id]);
  assert.equal(choquesDeLaComida(state, segundo.items, segundo.participants).length, 0);
});

test('marcar una ausencia no encoge lo que ya estaba puesto', () => {
  // La olla de arroz no se achica porque un hijo avise a las seis de que come
  // fuera, y desde luego la cena de la casa no se cancela por eso.
  const { state, platano, recipeId } = setup();
  const child = upsertPerson(state, { name: 'Persona', restricciones: [], habitual: [] });
  upsertPerson(state, { name: 'Otra persona', restricciones: [], habitual: [] });
  const plan = makeRecipePlan(state, recipeId, todayISO(), 'desayuno');
  const antes = structuredClone(plan);

  setAbsence(state, todayISO(), 'desayuno', child.id, true);

  assert.deepEqual(plan.items, antes.items, 'los alimentos no se tocan');
  assert.deepEqual(plan.participants, antes.participants, 'sigue puesta para los mismos');
  assert.equal(plan.kind, 'recipe', 'no se convierte en «fuera de casa»');
  assert.equal(state.plans.length, 1, 'no se borra');
  assert.equal(inventoryNow(state)[platano], 8 - antes.items[0].quantity + antes.items[0].quantity, 'el inventario no cambia por una ausencia');
});

test('una comida vinculada protege el alimento reservado ante cambios de cantidad o unidad', () => {
  const { state, recipeId } = setup();
  const source = makeRecipePlan(state, recipeId, todayISO(), 'cena');
  linkPlan(state, source.id, addDays(todayISO(), 1), 'desayuno', { [source.items[0].id]: 2 });
  const original = structuredClone(source.items[0]);
  assert.throws(() => updatePlan(state, source.id, { title: source.title, note: '', participants: [], items: [{ ...original, quantity: 1 }] }), /menor/);
  assert.throws(() => updatePlan(state, source.id, { title: source.title, note: '', participants: [], items: [{ ...original, unit: 'paquete' }] }), /vinculada/);
  assert.deepEqual(source.items[0], original);
});

test('un producto nuevo arranca con lo que ya hay en casa, no en cero', () => {
  const state = createEmptyState();
  const platano = addProduct(state, { name: 'Plátano', controlUnit: 'unidad', purchaseUnit: 'unidad', opening: 7 }).id;
  const sal = addProduct(state, { name: 'Sal', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  assert.equal(inventoryNow(state)[platano], 7);
  assert.equal(inventoryNow(state)[sal], 0, 'sin cantidad declarada, arranca en cero');
  assert.throws(() => addProduct(state, { name: 'Arroz', controlUnit: 'taza', purchaseUnit: 'lb', opening: -1 }));
});

test('el grosor solo se guarda en lo que de verdad se corta en ruedas', () => {
  const state = createEmptyState();
  const salami = addProduct(state, { name: 'Salami', controlUnit: 'rueda', purchaseUnit: 'paquete', slice: 'gruesa' });
  assert.equal(salami.slice, 'gruesa');
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb', slice: 'fina' });
  assert.equal(arroz.slice, null, 'una libra de arroz no tiene grosor de rueda');
  const queso = addProduct(state, { name: 'Queso', controlUnit: 'rebanada', purchaseUnit: 'rebanada' });
  assert.equal(queso.slice, null, 'sin declararlo queda vacío, no se inventa un grosor');
  // Un valor que no está en la lista se descarta en vez de guardarse tal cual.
  assert.equal(setSlice(state, salami.id, 'finisima'), null);
  assert.equal(setSlice(state, salami.id, 'media'), 'media');
  assert.throws(() => setSlice(state, 'producto-inexistente', 'fina'), /producto/);
});

test('un respaldo anterior al grosor sigue siendo válido', () => {
  const state = createEmptyState();
  const salami = addProduct(state, { name: 'Salami', controlUnit: 'rueda', purchaseUnit: 'rueda', opening: 4 }).id;
  const old = JSON.parse(exportState(state));
  delete old.products[0].slice;
  const restored = importState(JSON.stringify(old));
  assert.equal(restored.products[0].slice, undefined);
  assert.equal(inventoryNow(restored)[salami], 4, 'las existencias se leen igual sin el campo nuevo');
});

test('escribir la canasta habitual no mueve existencias, y una línea mala no deja media canasta', () => {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb', opening: 4 }).id;
  setHabitualBasket(state, [{ productId: arroz, quantity: 30, unit: 'lb' }]);
  assert.equal(habitualLines(state).length, 1);
  assert.equal(habitualLines(state)[0].quantity, 30);
  assert.equal(inventoryNow(state)[arroz], 4, 'escribir la canasta no mueve existencias');
  assert.throws(() => setHabitualBasket(state, [{ productId: 'producto-inventado', quantity: 1, unit: 'lb' }]), /alimento/);
  assert.equal(state.habitualBasket.lines.length, 1, 'una canasta rechazada deja la anterior intacta');
  assert.equal(habitualLines(state)[0].quantity, 30, 'y la que valía sigue diciendo lo mismo');
});

test('la canasta crea los alimentos que no existen, sin registrarlos aparte', () => {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  setHabitualBasket(state, [
    { name: '  arroz ', quantity: 30, unit: 'lb' },
    { name: 'Huevo', quantity: 60, unit: 'unidad' },
    { name: 'huevos', quantity: 12, unit: 'unidad' }
  ]);
  const lineas = habitualLines(state);
  assert.equal(state.products.length, 2, 'solo se crea el huevo, y una sola vez');
  assert.equal(lineas[0].productId, arroz, 'un nombre que ya existe no duplica el alimento');
  // Singular y plural son el mismo alimento, y por eso son también la misma
  // línea: dos líneas de huevo lo pedirían dos veces en la misma compra.
  assert.equal(lineas.length, 2, 'huevo y huevos quedaron como dos líneas distintas');
  const huevo = product(state, lineas[1].productId);
  assert.equal(huevo.name, 'Huevo');
  assert.equal(huevo.controlUnit, 'unidad', 'toma la unidad de su propia línea');
  assert.equal(huevo.origin, 'canasta', 'queda escrito de dónde salió');
  assert.equal(inventoryNow(state)[huevo.id], 0, 'nace sin existencias: la canasta dice qué se consume, no qué hay');
  // Una línea mal escrita no puede dejar media canasta registrada.
  assert.throws(() => setHabitualBasket(state, [{ name: 'Sal', quantity: 2, unit: 'lb' }, { name: 'Aceite', quantity: 2, unit: 'inventada' }]), /unidad/);
  assert.equal(state.products.length, 2, 'no se creó nada a medias');
  assert.equal(habitualLines(state).length, 2, 'la canasta anterior queda intacta');
});

test('la canasta y la ficha del producto escriben la misma línea', () => {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  setHabitualLine(state, arroz, 30, 'lb');
  assert.equal(habitualLines(state).length, 1);
  const id = habitualLines(state)[0].id;
  // Volver a escribirlo corrige la línea que ya existe, no añade otra.
  setHabitualLine(state, arroz, 25, 'lb');
  assert.equal(habitualLines(state).length, 1);
  assert.equal(habitualLines(state)[0].quantity, 25);
  assert.equal(habitualLines(state)[0].id, id, 'conserva su identidad al corregirla');
  // Y lo escrito en la ficha es lo que la canasta de un mes cualquiera dice.
  assert.equal(effectiveBasket(state, '2026-09').find(linea => linea.productId === arroz).quantity, 25);
  // Vacío o cero la quita: un consumo de cero no significa nada.
  setHabitualLine(state, arroz, '', 'lb');
  assert.equal(habitualLines(state).length, 0);
  setHabitualLine(state, arroz, 10, 'lb');
  setHabitualLine(state, arroz, 0, 'lb');
  assert.equal(habitualLines(state).length, 0);
  assert.throws(() => setHabitualLine(state, 'producto-inventado', 5, 'lb'), /producto/);
});

test('una cantidad que todavía no se sabe se guarda pendiente en vez de perder el alimento', () => {
  const state = createEmptyState();
  setHabitualBasket(state, [
    { name: 'Arroz', quantity: 30, unit: 'lb' },
    { name: 'Detergente', quantity: '', unit: 'paquete' }
  ]);
  assert.equal(habitualLines(state).length, 2, 'el alimento sin cantidad se conserva');
  assert.equal(habitualLines(state)[1].quantity, null);
  // Y llega así a la canasta del mes: sin cantidad, que no es lo mismo que en
  // cero. Un cero lo dejaría fuera de la compra sin que nadie lo decidiera.
  const detergente = effectiveBasket(state, '2026-09').find(linea => linea.productId === habitualLines(state)[1].productId);
  assert.ok(detergente, 'el alimento sin cantidad desapareció de la canasta del mes');
  assert.equal(detergente.quantity, null, 'una cantidad que no se sabe no puede convertirse en cero');
});

/* ── La revisión parte de la compra anterior ───────────────────────────────

   Venía de las pruebas del cierre de períodos. Lo que se fue de aquel archivo
   fue el cálculo de la lista de compra; preguntar «¿cuánto te queda de lo que
   trajiste?» sigue siendo lo que hace una revisión. */

function casaConCompra() {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  const aceite = addProduct(state, { name: 'Aceite', controlUnit: 'unidad', purchaseUnit: 'unidad' }).id;
  setHabitualBasket(state, [
    { productId: arroz, quantity: 20, unit: 'lb' },
    { productId: aceite, quantity: 2, unit: 'unidad' }
  ]);
  return { state, arroz, aceite };
}
const MES_EN_CURSO = todayISO().slice(0, 7);
const DIA = numero => `${MES_EN_CURSO}-${String(numero).padStart(2, '0')}`;

test('una revisión pregunta por lo que se trajo en la compra anterior', () => {
  const { state, arroz, aceite } = casaConCompra();
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
  const { state, arroz } = casaConCompra();
  addProduct(state, { name: 'Sal', controlUnit: 'unidad', purchaseUnit: 'unidad', opening: 3 });
  const revision = createReview(state, todayISO());
  assert.equal(revision.origen, 'todo', 'sin compra anterior no hay «lo de la compra» que enseñar');
  assert.ok(revision.productIds.length >= 1);
  assert.ok(arroz);
});

test('lo ya contestado no se cae al cambiar de alcance', () => {
  const { state, arroz, aceite } = casaConCompra();
  addPurchase(state, { date: DIA(2), lines: [{ productId: arroz, quantity: 10, unit: 'lb' }, { productId: aceite, quantity: 2, unit: 'unidad' }] });
  const revision = createReview(state, DIA(15));
  saveReview(state, revision.id, { [arroz]: 4 });

  setReviewScope(state, revision.id, 'todo');
  setReviewScope(state, revision.id, 'compra');
  assert.ok(revision.productIds.includes(arroz));
  assert.equal(revision.remaining[arroz], 4, 'se perdió lo que ya estaba contado');
});
