import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addProduct, createEmptyState, dateRange, makeRecipePlan, monthBounds, planFor, setHabitualBasket,
  setMonthChange, setStatusPlan, upsertRecipe
} from '../src/model.js';
import {
  addRoutine, applyRoutine, applyRoutines, copyPatternFromMonth, datesForRule, deleteRoutine,
  describeRule, detachPlanFromRoutine, monthProgress, openMonth, ordinalInMonth, routinePlans,
  extenderAMesesAbiertos, ocupadasEnMesesAbiertos, routinesFor, updateRoutine, weekdayOf, WEEKDAYS, WEEKDAY_LABELS, WEEKDAY_SHORT
} from '../src/routines.js';

function cocina() {
  const state = createEmptyState();
  const platano = addProduct(state, { name: 'Plátano', controlUnit: 'unidad', purchaseUnit: 'unidad' }).id;
  const huevo = addProduct(state, { name: 'Huevo', controlUnit: 'unidad', purchaseUnit: 'unidad' }).id;
  const mangu = upsertRecipe(state, { name: 'Mangú', uses: ['desayuno', 'cena'], items: [{ productId: platano, quantity: 3, unit: 'unidad' }], covers: [] }).id;
  const revoltillo = upsertRecipe(state, { name: 'Revoltillo', uses: ['desayuno'], items: [{ productId: huevo, quantity: 2, unit: 'unidad' }], covers: [] }).id;
  return { state, platano, huevo, mangu, revoltillo };
}

// Los días de un mes que de verdad caen en ese día de la semana, contados sobre
// el calendario y sin pasar por el código que se está probando.
function diasRealesDe(month, weekday) {
  const { start, end } = monthBounds(month);
  return dateRange(start, end).filter(date => {
    const dia = new Date(`${date}T12:00:00`).getDay();
    return (dia === 0 ? 7 : dia) === weekday;
  });
}

/* ── El calendario real ────────────────────────────────────────────────── */

test('los días de la semana se cuentan como los cuenta la gente: el lunes es el 1 y el domingo el 7', () => {
  assert.deepEqual(WEEKDAYS, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(WEEKDAY_LABELS.length, 7);
  assert.equal(WEEKDAY_SHORT.length, 7);
  assert.equal(WEEKDAY_LABELS[0], 'Lunes');
  assert.equal(WEEKDAY_LABELS[6], 'Domingo');
  assert.equal(weekdayOf('2026-10-04'), 7, 'el 4 de octubre de 2026 es domingo');
  assert.equal(weekdayOf('2026-10-05'), 1);
  assert.equal(ordinalInMonth('2026-10-04'), 1, 'primer domingo');
  assert.equal(ordinalInMonth('2026-10-18'), 3, 'tercer domingo');
  assert.equal(ordinalInMonth('2026-10-31'), 5);
});

test('ningún día del mes se queda fuera, ni en febrero ni en los meses de 31', () => {
  // 28, 29 (bisiesto), 30 y 31 días. Si la regla se calculara sumando semanas o
  // dando por hecha una longitud de mes, aquí faltarían fechas.
  const casos = [['2026-02', 28], ['2028-02', 29], ['2026-09', 30], ['2026-10', 31]];
  for (const [mes, largo] of casos) {
    const { start, end } = monthBounds(mes);
    assert.equal(dateRange(start, end).length, largo, `${mes} tiene ${largo} días`);
    let total = 0;
    for (const dia of WEEKDAYS) {
      const esperadas = diasRealesDe(mes, dia);
      assert.deepEqual(datesForRule(mes, [dia]), esperadas, `${mes}: todos los ${WEEKDAY_LABELS[dia - 1]}`);
      total += esperadas.length;
    }
    assert.equal(total, largo, `${mes}: los siete días de la semana cubren el mes entero, sin sobras ni faltas`);
    // Y todos juntos devuelven el mes completo, en orden.
    assert.deepEqual(datesForRule(mes, WEEKDAYS), dateRange(start, end));
  }
});

test('un lunes que cae el 29, el 30 o el 31 sale igual que el del día 5', () => {
  assert.ok(datesForRule('2026-11', [1]).includes('2026-11-30'), 'el lunes 30 de noviembre de 2026');
  assert.ok(datesForRule('2026-12', [4]).includes('2026-12-31'), 'el jueves 31 de diciembre de 2026');
  assert.ok(datesForRule('2028-02', [2]).includes('2028-02-29'), 'el martes 29 de febrero de 2028');
  assert.equal(datesForRule('2028-02', [2]).length, 5, 'febrero bisiesto que empieza en martes tiene cinco martes');
});

test('«primer y tercer domingo» son las dos fechas exactas, no la primera y la tercera semana', () => {
  // Octubre de 2026 empieza en jueves: sus domingos son 4, 11, 18 y 25.
  assert.deepEqual(diasRealesDe('2026-10', 7), ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25']);
  assert.deepEqual(datesForRule('2026-10', [7], [1, 3]), ['2026-10-04', '2026-10-18']);
  assert.deepEqual(datesForRule('2026-10', [7], [2]), ['2026-10-11']);
  assert.deepEqual(datesForRule('2026-10', [7], [5]), [], 'octubre de 2026 no tiene quinto domingo');
  // Marzo de 2026 empieza en domingo: ahí el primer domingo es el día 1.
  assert.deepEqual(datesForRule('2026-03', [7], [1, 3]), ['2026-03-01', '2026-03-15']);
  assert.deepEqual(datesForRule('2026-03', [7], [5]), ['2026-03-29'], 'y sí tiene quinto domingo');
});

test('la regla se dice en palabras que se entienden sin saber qué es weeks', () => {
  assert.equal(describeRule([7], [1, 3]), 'Primer y tercer domingo');
  assert.equal(describeRule([7], null), 'Todos los domingos');
  assert.equal(describeRule([1, 3], null), 'Todos los lunes y miércoles');
  assert.equal(describeRule([1, 2, 3, 4, 5, 6, 7], null), 'Todos los días');
  assert.equal(describeRule([6], [2]), 'Segundo sábado');
  assert.equal(describeRule([], null), 'Sin días');
});

test('un mes mal escrito se rechaza en vez de devolver una lista vacía que parece cierta', () => {
  assert.throws(() => datesForRule('2026-13', [1]), /mes válido/);
  assert.throws(() => datesForRule('octubre', [1]), /mes válido/);
  assert.deepEqual(datesForRule('2026-10', []), [], 'sin días de la semana no hay fechas');
  assert.deepEqual(datesForRule('2026-10', [9]), [], 'un día que no existe no inventa fechas');
});

/* ── Escribir rutinas ──────────────────────────────────────────────────── */

test('una rutina se escribe una vez y se explica sola', () => {
  const { state, mangu } = cocina();
  const rutina = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [1, 3] });
  assert.match(rutina.id, /^rutina-/);
  assert.equal(rutina.scope, 'permanent');
  assert.equal(rutina.month, null);
  assert.equal(rutina.weeks, null, 'sin semanas escritas es «todas»');
  assert.equal(rutina.active, true);
  assert.equal(rutina.label, 'Todos los lunes y miércoles', 'sin nombre se pone el de la regla');
  const fuera = addRoutine(state, { kind: 'outside', slots: ['almuerzo'], weekdays: [7], label: 'Domingos fuera' });
  assert.equal(fuera.recipeId, null);
  assert.equal(fuera.label, 'Domingos fuera');
  assert.throws(() => addRoutine(state, { kind: 'recipe', slots: ['desayuno'], weekdays: [1] }), /preparación/);
  assert.throws(() => addRoutine(state, { kind: 'outside', slots: [], weekdays: [1] }), /comida del día/);
  assert.throws(() => addRoutine(state, { kind: 'outside', slots: ['cena'], weekdays: [] }), /día de la semana/);
  assert.throws(() => addRoutine(state, { kind: 'outside', slots: ['cena'], weekdays: [1], scope: 'month' }), /mes/);
});

test('las rutinas de un mes solo salen en su mes, y las apagadas no salen nunca', () => {
  const { state, mangu } = cocina();
  const siempre = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [1] });
  const soloOctubre = addRoutine(state, { kind: 'outside', slots: ['cena'], weekdays: [5], scope: 'month', month: '2026-10' });
  const apagada = addRoutine(state, { kind: 'order', slots: ['cena'], weekdays: [6], active: false });
  assert.deepEqual(routinesFor(state, '2026-10').map(item => item.id), [siempre.id, soloOctubre.id]);
  assert.deepEqual(routinesFor(state, '2026-11').map(item => item.id), [siempre.id]);
  assert.equal(routinesFor(state, '2026-11').some(item => item.id === apagada.id), false);
  updateRoutine(state, apagada.id, { active: true });
  assert.equal(routinesFor(state, '2026-11').length, 2);
  // Una rutina terminada deja de contar en los meses posteriores a su final.
  updateRoutine(state, siempre.id, { until: '2026-10-20' });
  assert.equal(routinesFor(state, '2026-10').some(item => item.id === siempre.id), true);
  assert.equal(routinesFor(state, '2026-11').some(item => item.id === siempre.id), false);
});

/* ── Aplicar rutinas ───────────────────────────────────────────────────── */

test('una preparación se aplica a varios días de la semana de una sola vez', () => {
  const { state, mangu } = cocina();
  const rutina = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [1, 3] });
  const resultado = applyRoutine(state, rutina.id, '2026-10');
  const esperadas = [...diasRealesDe('2026-10', 1), ...diasRealesDe('2026-10', 3)];
  assert.equal(resultado.creados.length, esperadas.length);
  assert.deepEqual(resultado.saltados, []);
  for (const fecha of esperadas) {
    const plan = planFor(state, fecha, 'desayuno');
    assert.equal(plan.title, 'Mangú', `el ${fecha} hay mangú`);
    assert.equal(plan.routineId, rutina.id, 'queda escrito que lo puso la rutina');
  }
  assert.equal(routinePlans(state, rutina.id).length, esperadas.length);
});

test('aplicar una rutina solo llena los huecos: no pisa lo que alguien ya decidió', () => {
  const { state, mangu, revoltillo } = cocina();
  makeRecipePlan(state, revoltillo, '2026-10-05', 'desayuno');
  const rutina = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [1] });
  const resultado = applyRoutine(state, rutina.id, '2026-10');
  assert.equal(planFor(state, '2026-10-05', 'desayuno').title, 'Revoltillo', 'el lunes decidido a mano no se toca');
  assert.equal(planFor(state, '2026-10-05', 'desayuno').routineId, null);
  assert.deepEqual(resultado.saltados, [{ date: '2026-10-05', slot: 'desayuno', motivo: 'ya tenía plan' }]);
  assert.equal(resultado.creados.length, diasRealesDe('2026-10', 1).length - 1);
  assert.deepEqual(resultado.reemplazados, []);
});

test('reemplazar sustituye lo que había y deja escrito qué se fue', () => {
  const { state, mangu, revoltillo } = cocina();
  makeRecipePlan(state, revoltillo, '2026-10-05', 'desayuno');
  const rutina = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [1] });
  const resultado = applyRoutine(state, rutina.id, '2026-10', { modo: 'reemplazar' });
  assert.equal(planFor(state, '2026-10-05', 'desayuno').title, 'Mangú');
  assert.deepEqual(resultado.reemplazados, [{ date: '2026-10-05', slot: 'desayuno', antes: 'Revoltillo' }]);
  assert.deepEqual(resultado.saltados, []);
  assert.equal(resultado.creados.length, diasRealesDe('2026-10', 1).length);
});

test('si la rutina no cabe, la comida que había vuelve donde estaba', () => {
  const { state, revoltillo, mangu } = cocina();
  // El revoltillo solo sirve para el desayuno: una rutina que lo ponga en la
  // cena no puede cumplirse.
  makeRecipePlan(state, mangu, '2026-10-05', 'cena');
  const antes = structuredClone(state.plans);
  const rutina = addRoutine(state, { kind: 'recipe', recipeId: revoltillo, slots: ['cena'], weekdays: [1] });
  const resultado = applyRoutine(state, rutina.id, '2026-10', { modo: 'reemplazar' });
  assert.deepEqual(resultado.creados, []);
  assert.deepEqual(resultado.reemplazados, []);
  assert.equal(resultado.saltados.length, diasRealesDe('2026-10', 1).length);
  assert.deepStrictEqual(state.plans, antes, 'el mangú del lunes 5 sigue intacto');
});

test('aplicar una rutina no se desborda a los meses vecinos', () => {
  const { state, mangu } = cocina();
  const rutina = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [1] });
  applyRoutine(state, rutina.id, '2026-10');
  assert.ok(state.plans.every(plan => plan.date.slice(0, 7) === '2026-10'));
  assert.equal(planFor(state, '2026-11-02', 'desayuno'), undefined, 'noviembre sigue vacío hasta que se abra');
});

test('la fecha final corta la rutina donde se dijo', () => {
  const { state, mangu } = cocina();
  const rutina = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [1], until: '2026-10-20' });
  applyRoutine(state, rutina.id, '2026-10');
  assert.ok(planFor(state, '2026-10-19', 'desayuno'));
  assert.equal(planFor(state, '2026-10-26', 'desayuno'), undefined, 'después del 20 ya no');
});

/* ── Comidas fuera ─────────────────────────────────────────────────────── */

test('una comida fuera se marca sola, sin preparación que elegir', () => {
  const { state } = cocina();
  const plan = setStatusPlan(state, '2026-10-04', 'almuerzo', 'outside');
  assert.equal(plan.kind, 'outside');
  assert.deepEqual(plan.items, [], 'comer fuera no gasta nada de la despensa');
  assert.equal(plan.routineId, null, 'esta la puso una persona, no una regla');
});

test('un día entero fuera de casa se marca en las tres comidas', () => {
  const { state } = cocina();
  const rutina = addRoutine(state, { kind: 'outside', slots: ['desayuno', 'almuerzo', 'cena'], weekdays: [7], scope: 'month', month: '2026-10', label: 'Domingo de playa' });
  const resultado = applyRoutine(state, rutina.id, '2026-10', { hasta: '2026-10-04' });
  assert.equal(resultado.creados.length, 3);
  for (const slot of ['desayuno', 'almuerzo', 'cena']) {
    assert.equal(planFor(state, '2026-10-04', slot).kind, 'outside');
  }
});

test('todos los domingos fuera: las cuatro fechas del mes, ni una más', () => {
  const { state } = cocina();
  const rutina = addRoutine(state, { kind: 'outside', slots: ['almuerzo'], weekdays: [7], label: 'Domingos fuera' });
  const resultado = applyRoutine(state, rutina.id, '2026-10');
  assert.equal(resultado.creados.length, 4);
  for (const fecha of diasRealesDe('2026-10', 7)) {
    assert.equal(planFor(state, fecha, 'almuerzo').kind, 'outside', `el ${fecha}`);
  }
});

test('primer y tercer domingo fuera: el 4 y el 18 de octubre de 2026 y nada más', () => {
  const { state } = cocina();
  const rutina = addRoutine(state, { kind: 'outside', slots: ['almuerzo'], weekdays: [7], weeks: [1, 3] });
  applyRoutine(state, rutina.id, '2026-10');
  const marcados = state.plans.filter(plan => plan.kind === 'outside').map(plan => plan.date).sort();
  assert.deepEqual(marcados, ['2026-10-04', '2026-10-18']);
  assert.equal(planFor(state, '2026-10-11', 'almuerzo'), undefined, 'el segundo domingo se come en casa');
  assert.equal(planFor(state, '2026-10-25', 'almuerzo'), undefined, 'y el cuarto también');
});

test('una comida fuera solo para este mes no se repite en el siguiente', () => {
  const { state } = cocina();
  const soloOctubre = addRoutine(state, { kind: 'outside', slots: ['almuerzo'], weekdays: [7], scope: 'month', month: '2026-10' });
  applyRoutines(state, '2026-10');
  assert.equal(state.plans.filter(plan => plan.kind === 'outside').length, 4);
  applyRoutines(state, '2026-11');
  assert.equal(state.plans.filter(plan => plan.date.slice(0, 7) === '2026-11').length, 0, 'noviembre no la hereda');
  assert.throws(() => applyRoutine(state, soloOctubre.id, '2026-11'), /solo de 2026-10/);
});

test('una rutina permanente sí se repite sola en los meses que se abren después', () => {
  const { state } = cocina();
  addRoutine(state, { kind: 'outside', slots: ['almuerzo'], weekdays: [7], label: 'Domingos fuera' });
  openMonth(state, '2026-10');
  openMonth(state, '2026-11');
  assert.equal(state.plans.filter(plan => plan.date.slice(0, 7) === '2026-10').length, 4);
  assert.equal(state.plans.filter(plan => plan.date.slice(0, 7) === '2026-11').length, diasRealesDe('2026-11', 7).length);
});

test('cambiar un domingo suelto no cambia la rutina de los domingos', () => {
  const { state, mangu } = cocina();
  const rutina = addRoutine(state, { kind: 'outside', slots: ['cena'], weekdays: [7] });
  applyRoutine(state, rutina.id, '2026-10');
  // Este domingo sí se cocina: se suelta la comida de la rutina y se cambia.
  const suelto = planFor(state, '2026-10-11', 'cena');
  detachPlanFromRoutine(state, suelto.id);
  state.plans = state.plans.filter(plan => plan.id !== suelto.id);
  makeRecipePlan(state, mangu, '2026-10-11', 'cena');
  assert.equal(planFor(state, '2026-10-11', 'cena').title, 'Mangú');
  assert.equal(planFor(state, '2026-10-11', 'cena').routineId, null);
  // La regla sigue intacta y los demás domingos también.
  const guardada = state.mealRoutines.find(item => item.id === rutina.id);
  assert.equal(guardada.active, true);
  assert.deepEqual(guardada.weekdays, [7]);
  assert.equal(guardada.weeks, null);
  for (const fecha of ['2026-10-04', '2026-10-18', '2026-10-25']) {
    assert.equal(planFor(state, fecha, 'cena').kind, 'outside', `el ${fecha} se sigue comiendo fuera`);
  }
  // Y borrar la regla, sin decir otra cosa, no borra las comidas que puso: solo
  // las suelta. Lo contrario —«quitar»— hay que pedirlo, y se pide en pantalla.
  const borrado = deleteRoutine(state, rutina.id);
  assert.equal(borrado.borrada, true);
  assert.equal(borrado.quitadas, 0, 'sin pedirlo no se borra ninguna comida');
  assert.ok(borrado.conservadas >= 3);
  assert.equal(planFor(state, '2026-10-04', 'cena').kind, 'outside');
  assert.equal(planFor(state, '2026-10-04', 'cena').routineId, null);
  assert.equal(deleteRoutine(state, rutina.id), false);
});

test('una comida fuera no cuenta como pendiente: ya está decidida', () => {
  const { state } = cocina();
  const antes = monthProgress(state, '2026-10');
  assert.equal(antes.dias, 31);
  assert.equal(antes.huecos, 93);
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

/* ── Abrir un mes ──────────────────────────────────────────────────────── */

test('abrir un mes nuevo lo llena con las rutinas permanentes', () => {
  const { state, mangu } = cocina();
  addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [1] });
  addRoutine(state, { kind: 'outside', slots: ['almuerzo'], weekdays: [7], label: 'Domingos fuera' });
  const resultado = openMonth(state, '2026-10');
  assert.equal(resultado.yaAbierto, false);
  assert.equal(resultado.creados.length, diasRealesDe('2026-10', 1).length + 4);
  assert.equal(state.monthPlans['2026-10'].month, '2026-10');
  assert.equal(state.monthPlans['2026-10'].preparedAt, null);
  assert.ok(state.monthPlans['2026-10'].openedAt);
  assert.equal(resultado.resumen.encasa, diasRealesDe('2026-10', 1).length);
  assert.equal(resultado.resumen.fuera, 4);
});

test('abrir dos veces el mismo mes no duplica nada ni rehace lo que se borró', () => {
  const { state, mangu } = cocina();
  addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [1] });
  openMonth(state, '2026-10');
  const primera = state.plans.length;
  // Alguien decide que este lunes no: lo borra a mano.
  state.plans = state.plans.filter(plan => !(plan.date === '2026-10-05' && plan.slot === 'desayuno'));
  const copia = structuredClone(state);
  const segunda = openMonth(state, '2026-10');
  assert.equal(segunda.yaAbierto, true);
  assert.equal(segunda.creados, undefined, 'no se crea nada la segunda vez');
  assert.equal(state.plans.length, primera - 1);
  assert.equal(planFor(state, '2026-10-05', 'desayuno'), undefined, 'lo que se borró sigue borrado');
  assert.deepStrictEqual(state, copia, 'abrir un mes ya abierto no toca absolutamente nada');
});

test('abrir un mes no copia las excepciones de la canasta del mes anterior', () => {
  const { state } = cocina();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  const pollo = addProduct(state, { name: 'Pollo', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  setHabitualBasket(state, [{ productId: arroz, quantity: 30, unit: 'lb' }]);
  setMonthChange(state, '2026-10', arroz, { quantity: 45, unit: 'lb' });
  setMonthChange(state, '2026-10', pollo, { quantity: 4, unit: 'lb' });
  const habitualAntes = structuredClone(state.habitualBasket);
  openMonth(state, '2026-11');
  assert.deepStrictEqual(state.habitualBasket, habitualAntes, 'abrir un mes no toca la costumbre');
  assert.deepEqual(Object.keys(state.monthOverrides), ['2026-10'], 'noviembre no hereda las excepciones de octubre');
  assert.equal(monthProgress(state, '2026-11').cambiosCanasta, 0);
  assert.equal(monthProgress(state, '2026-10').cambiosCanasta, 2);
});

test('abrir un mes no arrastra las comidas sueltas del mes anterior', () => {
  const { state, mangu } = cocina();
  makeRecipePlan(state, mangu, '2026-10-07', 'cena');
  setStatusPlan(state, '2026-10-09', 'almuerzo', 'outside');
  openMonth(state, '2026-11');
  assert.equal(state.plans.filter(plan => plan.date.slice(0, 7) === '2026-11').length, 0, 'noviembre nace vacío si no hay rutinas');
});

/* ── Copiar el patrón del mes anterior ─────────────────────────────────── */

test('copiar el mes anterior va por día de la semana, no por número de fecha', () => {
  const { state, mangu, revoltillo } = cocina();
  // Lunes 5 y miércoles 7 de octubre de 2026.
  makeRecipePlan(state, mangu, '2026-10-05', 'desayuno');
  makeRecipePlan(state, revoltillo, '2026-10-07', 'desayuno');
  const resultado = copyPatternFromMonth(state, '2026-10', '2026-11');
  // El primer lunes de noviembre de 2026 es el 2; el primer miércoles, el 4.
  assert.equal(planFor(state, '2026-11-02', 'desayuno').title, 'Mangú');
  assert.equal(planFor(state, '2026-11-04', 'desayuno').title, 'Revoltillo');
  assert.equal(planFor(state, '2026-11-05', 'desayuno'), undefined, 'no se copió al día 5, que es jueves');
  assert.equal(resultado.creados.length, 2);
  assert.equal(weekdayOf('2026-11-02'), weekdayOf('2026-10-05'));
});

test('copiar el patrón no se lleva las comidas fuera ni las reservadas', () => {
  const { state, mangu } = cocina();
  makeRecipePlan(state, mangu, '2026-10-05', 'desayuno');
  setStatusPlan(state, '2026-10-04', 'almuerzo', 'outside');
  setStatusPlan(state, '2026-10-06', 'cena', 'order');
  const resultado = copyPatternFromMonth(state, '2026-10', '2026-11');
  assert.equal(resultado.creados.length, 1, 'solo el patrón de preparaciones');
  assert.equal(state.plans.filter(plan => plan.date.slice(0, 7) === '2026-11').length, 1);
  assert.equal(planFor(state, '2026-11-01', 'almuerzo'), undefined, 'aquel domingo fuera fue de aquel domingo');
  assert.equal(state.plans.some(plan => plan.date.slice(0, 7) === '2026-11' && plan.kind === 'order'), false);
});

test('la copia es una decisión propia: no queda atada a la rutina que puso el original', () => {
  const { state, mangu } = cocina();
  const rutina = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [1] });
  applyRoutine(state, rutina.id, '2026-10');
  copyPatternFromMonth(state, '2026-10', '2026-11');
  const copiadas = state.plans.filter(plan => plan.date.slice(0, 7) === '2026-11');
  assert.ok(copiadas.length > 0);
  assert.ok(copiadas.every(plan => plan.routineId === null));
  assert.deepEqual(routinePlans(state, rutina.id, { from: '2026-11-01' }), []);
});

test('un quinto lunes que no existe en el mes nuevo se avisa en vez de perderse', () => {
  const { state, mangu } = cocina();
  // El 30 de noviembre de 2026 es el quinto lunes; diciembre solo tiene cuatro.
  assert.equal(ordinalInMonth('2026-11-30'), 5);
  makeRecipePlan(state, mangu, '2026-11-30', 'cena');
  const resultado = copyPatternFromMonth(state, '2026-11', '2026-12');
  assert.equal(resultado.creados.length, 0);
  assert.deepEqual(resultado.saltados, [{ date: '2026-11-30', slot: 'cena', motivo: 'ese día no existe en el mes nuevo' }]);
  assert.throws(() => copyPatternFromMonth(state, '2026-11', '2026-11'), /distintos/);
});

/* ── Vigencia: desde cuándo vale una rutina ────────────────────────────────

   Sin esto, la única forma de decir «los martes, a partir del 15» era esperar a
   que llegara el 15, que es justo lo que esta pantalla existe para evitar. */

test('una rutina con fecha de inicio no toca los días anteriores', () => {
  const { state, mangu } = cocina();
  const rutina = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [2], desde: '2026-10-13' });
  applyRoutine(state, rutina.id, '2026-10');

  const martes = diasRealesDe('2026-10', 2);
  assert.ok(martes.length >= 4);
  for (const fecha of martes) {
    const puesto = Boolean(planFor(state, fecha, 'desayuno'));
    assert.equal(puesto, fecha >= '2026-10-13', `el ${fecha} debería ${fecha >= '2026-10-13' ? 'tener' : 'no tener'} desayuno`);
  }
});

test('el inicio y el final se pueden poner a la vez, y el inicio no puede ir después', () => {
  const { state, mangu } = cocina();
  const rutina = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [1, 2, 3, 4, 5], desde: '2026-10-06', until: '2026-10-09' });
  applyRoutine(state, rutina.id, '2026-10');
  const puestos = state.plans.filter(plan => plan.routineId === rutina.id).map(plan => plan.date).sort();
  assert.deepEqual(puestos, ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
  assert.throws(() => addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [1], desde: '2026-10-20', until: '2026-10-05' }), /no puede ser posterior/);
});

test('una rutina que aún no ha entrado en vigor no se aplica al abrir su mes', () => {
  const { state, mangu } = cocina();
  addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [2], desde: '2026-12-01' });
  assert.equal(routinesFor(state, '2026-10').length, 0, 'octubre no la ve');
  assert.equal(routinesFor(state, '2026-12').length, 1, 'diciembre sí');
  openMonth(state, '2026-10');
  assert.equal(state.plans.length, 0, 'octubre se abrió vacío');
});

/* ── Una costumbre nueva llega a los meses ya preparados ───────────────────

   Abrir un mes le pasa las rutinas permanentes una sola vez. Quien preparó
   noviembre en octubre y hoy escribe «los martes, pollo» esperaba que noviembre
   se enterara, y su único momento de escuchar ya había pasado. */

test('una rutina nueva llega a un mes futuro que ya estaba abierto', () => {
  const { state, mangu } = cocina();
  openMonth(state, '2026-10');
  openMonth(state, '2026-11');
  openMonth(state, '2026-12');

  const rutina = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [3], scope: 'permanent' });
  applyRoutine(state, rutina.id, '2026-10');
  const salida = extenderAMesesAbiertos(state, rutina.id, '2026-10');

  assert.deepEqual(salida.meses, ['2026-11', '2026-12'], 'tenía que llegar a los dos meses de después');
  for (const mes of ['2026-11', '2026-12']) {
    const miercoles = diasRealesDe(mes, 3);
    const puestos = state.plans.filter(plan => plan.routineId === rutina.id && plan.date.slice(0, 7) === mes).length;
    assert.equal(puestos, miercoles.length, `${mes}: faltan miércoles`);
  }
});

test('extender no toca los meses que ya pasaron', () => {
  const { state, mangu } = cocina();
  openMonth(state, '2026-08');
  openMonth(state, '2026-09');
  openMonth(state, '2026-10');
  const rutina = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [3], scope: 'permanent' });
  const salida = extenderAMesesAbiertos(state, rutina.id, '2026-10');
  assert.deepEqual(salida.meses, [], 'agosto y septiembre ya pasaron: no se reescriben');
  assert.equal(state.plans.filter(plan => plan.date < '2026-10-01').length, 0);
});

test('una rutina de un solo mes no se va a los demás', () => {
  const { state, mangu } = cocina();
  openMonth(state, '2026-10');
  openMonth(state, '2026-11');
  const rutina = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [3], scope: 'month', month: '2026-10' });
  assert.deepEqual(extenderAMesesAbiertos(state, rutina.id, '2026-10').meses, []);
});

test('antes de pisar nada se puede contar qué se pisaría', () => {
  const { state, mangu, revoltillo } = cocina();
  openMonth(state, '2026-10');
  openMonth(state, '2026-11');
  // Noviembre ya tiene revoltillo puesto en dos miércoles.
  const miercoles = diasRealesDe('2026-11', 3).slice(0, 2);
  for (const fecha of miercoles) makeRecipePlan(state, revoltillo, fecha, 'desayuno');

  const rutina = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [3], scope: 'permanent' });
  const ocupadas = ocupadasEnMesesAbiertos(state, rutina.id, '2026-10');
  assert.equal(ocupadas.length, 2, 'son las dos que ya estaban');
  assert.ok(ocupadas.every(item => item.mes === '2026-11' && item.titulo === 'Revoltillo'));

  // Rellenando huecos no se pisan; reemplazando, sí.
  extenderAMesesAbiertos(state, rutina.id, '2026-10', { modo: 'vacios' });
  assert.equal(planFor(state, miercoles[0], 'desayuno').title, 'Revoltillo', 'se respetó lo que ya estaba');
  extenderAMesesAbiertos(state, rutina.id, '2026-10', { modo: 'reemplazar' });
  assert.equal(planFor(state, miercoles[0], 'desayuno').title, 'Mangú', 'con permiso sí se reemplaza');
});

/* ── Borrar la regla ───────────────────────────────────────────────────── */

test('al borrar se puede elegir qué pasa con las comidas, y las pasadas nunca se tocan', () => {
  const { state, mangu } = cocina();
  const rutina = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [3] });
  applyRoutine(state, rutina.id, '2026-10');
  const miercoles = diasRealesDe('2026-10', 3);
  const corte = miercoles[2];

  const salida = deleteRoutine(state, rutina.id, { comidas: 'quitar', desde: corte });
  assert.equal(salida.borrada, true);
  assert.equal(salida.quitadas, miercoles.length - 2, 'se quitan las de la fecha de corte en adelante');
  assert.equal(salida.conservadas, 2, 'las dos anteriores se quedan');
  for (const fecha of miercoles.slice(0, 2)) assert.ok(planFor(state, fecha, 'desayuno'), `el ${fecha} ya había pasado y se queda`);
  for (const fecha of miercoles.slice(2)) assert.equal(planFor(state, fecha, 'desayuno'), undefined);
});

test('una palabra que no está en la lista no borra comidas', () => {
  const { state, mangu } = cocina();
  const rutina = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [3] });
  applyRoutine(state, rutina.id, '2026-10');
  const miercoles = diasRealesDe('2026-10', 3);

  // Solo la palabra exacta borra. 'Quitar' con mayúscula, 'borrar' o un campo
  // vacío conservan, y así tiene que seguir siendo: entre equivocarse hacia lo
  // que se deshace y hacia lo que no, esto se equivoca hacia lo que se deshace.
  const salida = deleteRoutine(state, rutina.id, { comidas: 'Quitar', desde: '2026-10-01' });
  assert.equal(salida.borrada, true, 'la regla sí se va');
  assert.equal(salida.quitadas, 0, 'pero no se lleva ninguna comida por delante');
  assert.equal(salida.conservadas, miercoles.length);
  for (const fecha of miercoles) assert.ok(planFor(state, fecha, 'desayuno'), `el ${fecha} sigue puesto`);
});

/* ── Los criterios de aceptación del encargo, uno por uno ───────────────── */

test('se puede configurar un desayuno los lunes, miércoles y viernes', () => {
  const { state, mangu } = cocina();
  const rutina = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [1, 3, 5], scope: 'permanent' });
  applyRoutine(state, rutina.id, '2026-10');
  const esperados = [1, 3, 5].flatMap(dia => diasRealesDe('2026-10', dia)).sort();
  const puestos = state.plans.filter(plan => plan.routineId === rutina.id).map(plan => plan.date).sort();
  assert.deepEqual(puestos, esperados);
  assert.equal(describeRule([1, 3, 5], null), 'Todos los lunes, miércoles y viernes');
});

test('se puede configurar el primer y tercer domingo fuera de casa', () => {
  const { state } = cocina();
  const rutina = addRoutine(state, { kind: 'outside', slots: ['almuerzo'], weekdays: [7], weeks: [1, 3], scope: 'permanent' });
  applyRoutine(state, rutina.id, '2026-10');
  const domingos = diasRealesDe('2026-10', 7);
  const puestos = state.plans.filter(plan => plan.routineId === rutina.id).map(plan => plan.date).sort();
  assert.deepEqual(puestos, [domingos[0], domingos[2]]);
  assert.ok(puestos.every(fecha => planFor(state, fecha, 'almuerzo').kind === 'outside'));
  assert.equal(describeRule([7], [1, 3]), 'Primer y tercer domingo');
});

test('editar la regla cambia lo que pasa en los meses siguientes', () => {
  const { state, mangu } = cocina();
  const rutina = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [2], scope: 'permanent' });
  openMonth(state, '2026-10');
  applyRoutine(state, rutina.id, '2026-10');

  // La casa cambia de idea: ya no son los martes, son los jueves.
  updateRoutine(state, rutina.id, { weekdays: [4] });
  applyRoutine(state, rutina.id, '2026-11');

  const jueves = diasRealesDe('2026-11', 4);
  const enNoviembre = state.plans.filter(plan => plan.routineId === rutina.id && plan.date.slice(0, 7) === '2026-11').map(plan => plan.date).sort();
  assert.deepEqual(enNoviembre, jueves, 'noviembre tiene que ir por la regla nueva');
  assert.deepEqual(state.mealRoutines.find(item => item.id === rutina.id).weekdays, [4], 'la regla de verdad cambió');
});
