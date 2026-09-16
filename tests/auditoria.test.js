// La auditoría de la fase 12, caso por caso y con el nombre que tiene en el
// encargo. No prueba funciones nuevas: vuelve a pasar por lo que ya existe, con
// las fechas y los datos exactos que se pidieron, para que la evidencia se pueda
// volver a correr cuando alguien dude.
//
// Lo que se demuestra aquí se demuestra sobre el calendario real y sobre
// respaldos escritos a mano como los que tiene guardados quien ya venía usando
// la app, no sobre estados construidos por la propia app de hoy.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SCHEMA_VERSION, migrate } from '../src/migrate.js';
import {
  addProduct, addPurchase, cerrarPeriodo, createEmptyState, createReview, effectiveBasket,
  frecuenciaDe, habitualLines, inventoryNow, makeRecipePlan, monthBounds, periodosDelMes,
  planFor, ponerFrecuencia, saveReview, setHabitualBasket, setHabitualLine, shoppingList,
  todayISO, upsertPerson, upsertRecipe
} from '../src/model.js';
import {
  addRoutine, applyRoutine, datesForRule, extenderAMesesAbiertos, openMonth, routinesFor
} from '../src/routines.js';

/* ══ A. CALENDARIOS ═══════════════════════════════════════════════════════

   Los días de cada mes salen del calendario real. Un mes no son «cuatro
   semanas» ni «los primeros 28 días»: es el número de días que tiene, y
   febrero cambia de año en año. */

const diasDelMes = mes => {
  const { start, end } = monthBounds(mes);
  return Number(end.slice(8, 10)) - Number(start.slice(8, 10)) + 1;
};

// El recorrido completo se hace sobre meses de verdad, no sobre fechas
// inventadas del futuro: el inventario solo cuenta los movimientos hasta hoy.
const HOY = todayISO();
const MES = HOY.slice(0, 7);
const SIGUIENTE = (() => {
  const [ano, mes] = MES.split('-').map(Number);
  return mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, '0')}`;
})();

// Todos los días del mes, repartidos por día de la semana, según el calendario.
const todosLosDias = mes => {
  const { start, end } = monthBounds(mes);
  const salida = [];
  for (let dia = Number(start.slice(8, 10)); dia <= Number(end.slice(8, 10)); dia++) {
    salida.push(`${mes}-${String(dia).padStart(2, '0')}`);
  }
  return salida;
};

test('A1 · febrero de 2027 tiene 28 días, y ninguna regla inventa un 29', () => {
  assert.equal(diasDelMes('2027-02'), 28);
  assert.equal(monthBounds('2027-02').end, '2027-02-28');
  for (let dia = 1; dia <= 7; dia++) {
    const fechas = datesForRule('2027-02', [dia]);
    assert.ok(fechas.every(fecha => Number(fecha.slice(8, 10)) <= 28), `el día ${dia} salió del mes`);
    assert.ok(fechas.length >= 4 && fechas.length <= 5, `${fechas.length} apariciones del día ${dia}`);
  }
  // Los siete días de la semana, juntos, cubren el mes entero sin huecos.
  const cubiertos = [1, 2, 3, 4, 5, 6, 7].flatMap(dia => datesForRule('2027-02', [dia])).sort();
  assert.deepEqual(cubiertos, todosLosDias('2027-02'));
});

test('A2 · febrero de 2028 tiene 29 días, y el 29 se usa', () => {
  assert.equal(diasDelMes('2028-02'), 29);
  assert.equal(monthBounds('2028-02').end, '2028-02-29');
  const cubiertos = [1, 2, 3, 4, 5, 6, 7].flatMap(dia => datesForRule('2028-02', [dia])).sort();
  assert.deepEqual(cubiertos, todosLosDias('2028-02'));
  assert.ok(cubiertos.includes('2028-02-29'), 'el año bisiesto perdió su día 29');
});

test('A3 · abril tiene 30 días y el 31 no existe', () => {
  assert.equal(diasDelMes('2027-04'), 30);
  assert.equal(monthBounds('2027-04').end, '2027-04-30');
  const cubiertos = [1, 2, 3, 4, 5, 6, 7].flatMap(dia => datesForRule('2027-04', [dia])).sort();
  assert.deepEqual(cubiertos, todosLosDias('2027-04'));
  assert.ok(!cubiertos.some(fecha => fecha.endsWith('-31')), 'abril tiene un día 31');
});

test('A4 · enero tiene 31 días y ninguno se queda fuera', () => {
  assert.equal(diasDelMes('2027-01'), 31);
  assert.equal(monthBounds('2027-01').end, '2027-01-31');
  const cubiertos = [1, 2, 3, 4, 5, 6, 7].flatMap(dia => datesForRule('2027-01', [dia])).sort();
  assert.deepEqual(cubiertos, todosLosDias('2027-01'));
  assert.ok(cubiertos.includes('2027-01-31'), 'el día 31 se quedó fuera');
});

test('A5 · primer y tercer domingo, en cuatro meses distintos', () => {
  // Domingo es 7 en la numeración ISO, la misma de todo el proyecto.
  const esperado = {
    '2027-01': ['2027-01-03', '2027-01-17'],
    '2027-02': ['2027-02-07', '2027-02-21'],
    '2027-04': ['2027-04-04', '2027-04-18'],
    '2028-02': ['2028-02-06', '2028-02-20']
  };
  for (const [mes, dias] of Object.entries(esperado)) {
    assert.deepEqual(datesForRule(mes, [7], [1, 3]), dias, `primer y tercer domingo de ${mes}`);
  }
});

test('A6 · segundo y cuarto domingo, en los mismos cuatro meses', () => {
  const esperado = {
    '2027-01': ['2027-01-10', '2027-01-24'],
    '2027-02': ['2027-02-14', '2027-02-28'],
    '2027-04': ['2027-04-11', '2027-04-25'],
    '2028-02': ['2028-02-13', '2028-02-27']
  };
  for (const [mes, dias] of Object.entries(esperado)) {
    assert.deepEqual(datesForRule(mes, [7], [2, 4]), dias, `segundo y cuarto domingo de ${mes}`);
  }
  // Y los dos repartos juntos son todos los domingos del mes, sin repetir uno.
  for (const mes of Object.keys(esperado)) {
    const todos = datesForRule(mes, [7]);
    const juntos = [...datesForRule(mes, [7], [1, 3]), ...datesForRule(mes, [7], [2, 4])].sort();
    assert.deepEqual(juntos, todos.slice(0, juntos.length), `los domingos de ${mes} no cuadran`);
  }
});

test('A7 · una rutina nueva llega a un mes futuro que ya estaba abierto', () => {
  const state = createEmptyState();
  const platano = addProduct(state, { name: 'Plátano maduro', controlUnit: 'unidad', purchaseUnit: 'unidad' }).id;
  const mangu = upsertRecipe(state, { name: 'Mangú', uses: ['desayuno'], items: [{ productId: platano, quantity: 4, unit: 'unidad' }] }).id;

  // Se abre enero antes de que exista la rutina: es el caso que importa.
  openMonth(state, '2027-01');
  assert.equal(state.plans.length, 0, 'abrir un mes no escribe comidas por su cuenta');

  const rutina = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [7], weeks: [1, 3], scope: 'permanent' });
  applyRoutine(state, rutina.id, '2026-12', { modo: 'vacios' });
  extenderAMesesAbiertos(state, rutina.id, '2026-12', { modo: 'vacios' });

  for (const fecha of datesForRule('2027-01', [7], [1, 3])) {
    const comida = planFor(state, fecha, 'desayuno');
    assert.ok(comida, `el ${fecha} se quedó vacío en un mes que ya estaba abierto`);
    assert.equal(comida.routineId, rutina.id);
    assert.equal(comida.origen, 'rutina');
  }
  assert.ok(routinesFor(state, '2027-01').some(item => item.id === rutina.id));
});

/* ══ B. MIGRACIÓN DE DATOS ANTERIORES ═════════════════════════════════════

   Un respaldo escrito a mano como los que había antes, con un poco de todo, y
   la comprobación de que nada se pierde ni se duplica al convertirlo. */

function casaVieja() {
  return {
    version: 3, seq: 20, demo: false,
    products: [
      { id: 'producto-1', name: 'Plátano maduro', controlUnit: 'unidad', purchaseUnit: 'unidad', equivalences: {}, slice: null },
      { id: 'producto-2', name: 'Salami', controlUnit: 'rueda', purchaseUnit: 'paquete', equivalences: { paquete: 16 }, slice: 'media' },
      { id: 'producto-3', name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb', equivalences: {}, slice: null }
    ],
    people: [{ id: 'persona-1', name: 'Sofía', restrictions: ['producto-2'], habitual: [] }],
    recipes: [
      { id: 'preparacion-1', name: 'Mangú con salami', uses: ['desayuno'], items: [
        { productId: 'producto-1', quantity: 4, unit: 'unidad', personId: null },
        { productId: 'producto-2', quantity: 4, unit: 'rueda', personId: null }
      ], covers: ['persona-1'], servings: null, note: 'La nota de siempre.' },
      { id: 'preparacion-2', name: 'Arroz blanco', uses: ['almuerzo'], items: [
        { productId: 'producto-3', quantity: 3, unit: 'lb', personId: null }
      ], covers: [], servings: null, note: '' }
    ],
    plans: [
      { id: 'comida-1', date: '2026-08-03', slot: 'desayuno', kind: 'recipe', recipeId: 'preparacion-1', title: 'Mangú con salami', note: '', servings: null, participants: ['persona-1'], items: [{ id: 'alimento-1', productId: 'producto-1', quantity: 4, unit: 'unidad', personId: null }] },
      { id: 'comida-2', date: '2026-08-04', slot: 'almuerzo', kind: 'recipe', recipeId: 'preparacion-2', title: 'Arroz blanco', note: '', servings: null, participants: [], items: [] },
      { id: 'comida-3', date: '2026-08-05', slot: 'cena', kind: 'outside', recipeId: null, title: '', note: '', servings: null, participants: [], items: [] }
    ],
    absences: [{ date: '2026-08-02', slot: 'cena', personId: 'persona-1' }],
    opening: { 'producto-1': 8, 'producto-2': 0, 'producto-3': 5 },
    purchases: [
      { id: 'compra-1', seq: 8, date: '2026-08-01', period: null, lines: [{ productId: 'producto-2', quantity: 1, unit: 'paquete', controlQuantity: 16 }] },
      { id: 'compra-2', seq: 9, date: '2026-08-15', period: null, lines: [{ productId: 'producto-3', quantity: 10, unit: 'lb', controlQuantity: 10 }] }
    ],
    reviews: [{ id: 'revision-1', seq: 10, date: '2026-08-20', status: 'confirmed', mode: 'consumido', remaining: {}, productIds: ['producto-1'], consumed: { 'producto-1': 3 } }],
    corrections: [],
    manualItems: [{ id: 'otro-11', name: 'Detergente', quantity: '', done: false }],
    habitualBasket: {
      lines: [
        { id: 'canasta-1', productId: 'producto-1', quantity: 40, unit: 'unidad', priority: 'obligatorio' },
        { id: 'canasta-2', productId: 'producto-3', quantity: 30, unit: 'lb' }
      ],
      updatedAt: '2026-08-01', history: []
    },
    monthOverrides: {},
    mealRoutines: [
      { id: 'rutina-1', kind: 'recipe', recipeId: 'preparacion-1', slots: ['desayuno'], weekdays: [1, 3, 5], weeks: null, scope: 'permanent', month: null, until: null, label: 'Mangú de siempre', active: true },
      { id: 'rutina-2', kind: 'outside', recipeId: null, slots: ['cena'], weekdays: [7], weeks: [1, 3], scope: 'permanent', month: null, until: null, label: 'Domingos fuera', active: true }
    ],
    monthPlans: {}, activity: [], settings: { reviewWeekday: 5, onboarded: true }
  };
}

const convertida = () => {
  const salida = migrate(casaVieja());
  assert.equal(salida.ok, true, salida.error);
  return salida.state;
};

test('B1 · la canasta anterior llega entera, y con su historia', () => {
  const state = convertida();
  const lineas = habitualLines(state);
  assert.equal(lineas.length, 2, 'se perdió alguna línea de la canasta');
  const platano = lineas.find(linea => linea.productId === 'producto-1');
  assert.equal(platano.quantity, 40);
  assert.equal(platano.unit, 'unidad');
  assert.equal(platano.priority, 'obligatorio', 'la prioridad se degradó al convertir');
  // Sin fecha es «desde siempre», y así tiene que quedarse: esa era la canasta
  // de la casa durante aquellos meses.
  assert.equal(platano.desde, null);
  assert.ok(effectiveBasket(state, '2020-01').some(fila => fila.productId === 'producto-1'),
    'un mes viejo perdió lo que sí compraba');
});

test('B2 · las preparaciones existentes conservan nombre, momentos y alimentos', () => {
  const state = convertida();
  assert.equal(state.recipes.length, 2);
  const mangu = state.recipes.find(receta => receta.id === 'preparacion-1');
  assert.equal(mangu.name, 'Mangú con salami');
  assert.deepEqual(mangu.uses, ['desayuno']);
  assert.equal(mangu.items.length, 2);
  assert.equal(mangu.note, 'La nota de siempre.');
  // `covers` —a quién le tocaba— dejó de existir a propósito en una fase
  // anterior: una preparación es de la casa. No puede quedar un resto.
  assert.equal('covers' in mangu, false, 'quedó el campo que se quitó');
});

test('B3 · los menús anteriores siguen en su día y con su origen', () => {
  const state = convertida();
  assert.equal(state.plans.length, 3, 'se perdió alguna comida del calendario');
  assert.equal(planFor(state, '2026-08-03', 'desayuno').title, 'Mangú con salami');
  assert.equal(planFor(state, '2026-08-04', 'almuerzo').recipeId, 'preparacion-2');
  assert.equal(planFor(state, '2026-08-05', 'cena').kind, 'outside');
  // Cada comida dice de dónde vino, y ninguna se queda en «undefined».
  for (const comida of state.plans) {
    assert.ok(comida.origen, `la comida del ${comida.date} no dice de dónde vino`);
    assert.ok(['manual', 'rutina', 'excepcion', 'sugerencia'].includes(comida.origen), `origen raro: ${comida.origen}`);
  }
});

test('B4 · las rutinas anteriores conservan su regla y siguen aplicando', () => {
  const state = convertida();
  assert.equal(state.mealRoutines.length, 2);
  const [mangu, domingos] = state.mealRoutines;
  assert.deepEqual(mangu.weekdays, [1, 3, 5]);
  assert.equal(mangu.scope, 'permanent');
  assert.deepEqual(domingos.weeks, [1, 3]);
  // `desde` llegó después que las rutinas: las viejas salen con el null
  // explícito, que es «desde siempre», y no con undefined.
  for (const rutina of state.mealRoutines) {
    assert.ok('desde' in rutina, 'la rutina no trae el campo de vigencia');
    assert.equal(rutina.desde, null);
  }
  // Y siguen sirviendo: la regla de los lunes, miércoles y viernes se aplica
  // sobre un mes cualquiera sin tocarla.
  applyRoutine(state, 'rutina-1', '2027-04', { modo: 'vacios' });
  for (const fecha of datesForRule('2027-04', [1, 3, 5])) {
    assert.ok(planFor(state, fecha, 'desayuno'), `el ${fecha} se quedó sin desayuno`);
  }
});

test('B5 · las compras anteriores conservan su fecha, sus líneas y su efecto en el inventario', () => {
  const state = convertida();
  assert.equal(state.purchases.length, 2);
  const [primera, segunda] = state.purchases;
  assert.equal(primera.date, '2026-08-01');
  assert.equal(primera.lines[0].controlQuantity, 16, 'el paquete de salami dejó de valer 16 ruedas');
  assert.equal(segunda.lines[0].quantity, 10);
  // El inventario es la suma de los movimientos, y esos movimientos siguen ahí:
  // 8 de apertura, menos 3 consumidos en la revisión confirmada.
  assert.equal(inventoryNow(state)['producto-1'], 5, 'el saldo del plátano cambió al convertir');
  assert.equal(inventoryNow(state)['producto-2'], 16, 'el salami comprado se perdió');
});

test('B6 · un usuario local que después crea una cuenta no pierde nada', () => {
  // Crear la cuenta es una decisión aparte de subir los datos, y ninguna de las
  // dos toca lo que ya está escrito en el teléfono. Lo que se comprueba aquí es
  // que el estado local sobrevive intacto a que aparezca una sesión.
  const state = convertida();
  const antes = JSON.stringify(state);

  state.sesion = { userId: 'usuario-1', email: 'alguien@ejemplo.com', nombre: 'Sofía' };
  state.settings = { ...state.settings, sincronizar: false };

  const vuelta = migrate(JSON.parse(JSON.stringify(state)));
  assert.equal(vuelta.ok, true);
  delete vuelta.state.sesion;
  const despues = JSON.parse(JSON.stringify(vuelta.state));
  delete despues.settings.sincronizar;
  assert.deepEqual(despues, JSON.parse(antes), 'aparecer una sesión cambió los datos de la casa');
});

test('B7 · convertir dos y tres veces no duplica ni cambia nada', () => {
  const una = migrate(casaVieja()).state;
  const dos = migrate(JSON.parse(JSON.stringify(una))).state;
  const tres = migrate(JSON.parse(JSON.stringify(dos))).state;

  assert.equal(dos.version, SCHEMA_VERSION);
  assert.deepEqual(dos, una, 'la segunda conversión cambió algo');
  assert.deepEqual(tres, una, 'la tercera conversión cambió algo');
  // Y lo que se cuenta, se cuenta una sola vez.
  assert.equal(tres.products.length, 3);
  assert.equal(tres.recipes.length, 2);
  assert.equal(tres.plans.length, 3);
  assert.equal(tres.purchases.length, 2);
  assert.equal(tres.mealRoutines.length, 2);
  assert.equal(habitualLines(tres).length, 2);
  assert.equal(tres.habitualBasket.lines[0].tramos.length, 1, 'se apiló un tramo por cada conversión');
});

/* ══ C. LA EXPERIENCIA COMPLETA, DE PUNTA A PUNTA ═════════════════════════

   Los once pasos del encargo, encadenados sobre una casa que empieza vacía.
   Cada paso comprueba lo suyo antes de pasar al siguiente: si uno falla, se
   sabe cuál, y no hay que adivinar en qué punto se torció. */

test('C · los once pasos, de una cuenta nueva a abrir el mes siguiente', () => {
  const pasos = [];
  const hecho = (paso, detalle) => pasos.push(`${paso} · ${detalle}`);

  // 1. Cuenta nueva: una casa vacía, sin nada escrito.
  const state = createEmptyState();
  assert.equal(state.products.length, 0);
  assert.equal(state.people.length, 0);
  assert.equal(habitualLines(state).length, 0);
  hecho('1 cuenta nueva', 'la casa empieza vacía, sin catálogo ni gente');

  // 2. Crear hogar.
  const sofia = upsertPerson(state, { name: 'Sofía', restrictions: [], habitual: [] }).id;
  const luis = upsertPerson(state, { name: 'Luis', restrictions: [], habitual: [] }).id;
  assert.equal(state.people.length, 2);
  hecho('2 crear hogar', `${state.people.length} personas`);

  // 3. Restricciones.
  const mani = addProduct(state, { name: 'Maní', controlUnit: 'lb', purchaseUnit: 'lb', category: 'otros' }).id;
  upsertPerson(state, { id: sofia, name: 'Sofía', restrictions: [mani] });
  const conRestriccion = state.people.find(persona => persona.id === sofia);
  const restricciones = conRestriccion.restricciones || conRestriccion.restrictions || [];
  assert.equal(restricciones.length, 1, 'la restricción no quedó guardada');
  hecho('3 restricciones', 'Sofía no come maní');

  // 4. Canasta.
  const platano = addProduct(state, { name: 'Plátano maduro', controlUnit: 'unidad', purchaseUnit: 'unidad', category: 'viveres' }).id;
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb', category: 'granos' }).id;
  const huevo = addProduct(state, { name: 'Huevo', controlUnit: 'unidad', purchaseUnit: 'unidad', category: 'lacteos' }).id;
  setHabitualBasket(state, [
    { productId: platano, quantity: 60, unit: 'unidad', priority: 'obligatorio' },
    { productId: arroz, quantity: 30, unit: 'lb', priority: 'obligatorio' },
    { productId: huevo, quantity: 60, unit: 'unidad' }
  ]);
  assert.equal(habitualLines(state).length, 3);
  hecho('4 canasta', '3 alimentos al mes');

  // 5. Frecuencia: quincenal desde este mes.
  //
  // De aquí en adelante se trabaja sobre el mes en curso y el siguiente, que es
  // lo que hace alguien que acaba de instalar la app. Con fechas del futuro el
  // recorrido parecería funcionar y no probaría nada: el inventario solo cuenta
  // los movimientos hasta hoy, así que una compra fechada en 2027 no sube
  // ningún saldo, y con razón.
  ponerFrecuencia(state, 'quincenal', MES);
  assert.equal(frecuenciaDe(state, MES), 'quincenal');
  const tramos = periodosDelMes(state, MES);
  assert.equal(tramos.length, 2, 'quincenal tiene que dar dos tramos');
  assert.equal(tramos[0].dias + tramos[1].dias, diasDelMes(MES), 'los dos tramos no suman el mes entero');
  hecho('5 frecuencia', `quincenal · ${tramos[0].dias} + ${tramos[1].dias} días`);

  // 6. Preparación.
  const mangu = upsertRecipe(state, {
    name: 'Mangú con huevo', uses: ['desayuno'],
    items: [{ productId: platano, quantity: 4, unit: 'unidad' }, { productId: huevo, quantity: 2, unit: 'unidad' }]
  }).id;
  assert.equal(state.recipes.length, 1);
  hecho('6 preparación', 'Mangú con huevo, 2 alimentos');

  // 7. Rutina: lunes, miércoles y viernes de desayuno.
  const rutina = addRoutine(state, { kind: 'recipe', recipeId: mangu, slots: ['desayuno'], weekdays: [1, 3, 5], weeks: null, scope: 'permanent' });
  assert.ok(rutina.id);
  hecho('7 rutina', 'lunes, miércoles y viernes de desayuno');

  // 8. Preparar el mes.
  openMonth(state, MES);
  applyRoutine(state, rutina.id, MES, { modo: 'vacios' });
  const esperados = datesForRule(MES, [1, 3, 5]);
  for (const fecha of esperados) {
    const comida = planFor(state, fecha, 'desayuno');
    assert.ok(comida, `el ${fecha} se quedó sin desayuno`);
    assert.equal(comida.origen, 'rutina');
  }
  hecho('8 preparar el mes', `${esperados.length} desayunos puestos por la rutina`);

  // 9. Compra del primer tramo.
  const lista = shoppingList(state, tramos[0].start, tramos[0].end, 'casa');
  assert.ok(lista.lines.length >= 3, 'la lista no pidió los tres alimentos de la canasta');
  const delArroz = lista.lines.find(linea => linea.productId === arroz);
  // La canasta dice 30 lb al mes: la quincena pide la parte del mes que cubre,
  // no la mitad redonda, porque los dos tramos no siempre miden lo mismo.
  const tocan = Math.round((30 * tramos[0].dias / diasDelMes(MES)) * 100) / 100;
  assert.equal(delArroz.need, tocan, `${tramos[0].dias} de ${diasDelMes(MES)} días tendrían que pedir ${tocan} lb`);
  hecho('9 compra', `${lista.lines.length} líneas · arroz: ${delArroz.need} lb`);

  // 10. Revisar existencias. Se anota la compra y después se revisa lo que queda.
  addPurchase(state, { date: HOY, lines: [{ productId: arroz, quantity: 15, unit: 'lb' }] });
  assert.equal(inventoryNow(state)[arroz], 15, 'la compra no subió el inventario');
  const revision = createReview(state, HOY, 'restante');
  saveReview(state, revision.id, { [arroz]: 9 }, true, 'restante');
  assert.equal(inventoryNow(state)[arroz], 9, 'la revisión no dejó el saldo en lo que se contó');
  hecho('10 revisión', 'de 15 lb quedan 9: consumió 6');

  // 11. Abrir el mes siguiente, y que la rutina llegue.
  openMonth(state, SIGUIENTE);
  extenderAMesesAbiertos(state, rutina.id, MES, { modo: 'vacios' });
  const delSiguiente = datesForRule(SIGUIENTE, [1, 3, 5]);
  for (const fecha of delSiguiente) {
    assert.ok(planFor(state, fecha, 'desayuno'), `${SIGUIENTE}: el ${fecha} se quedó vacío`);
  }
  // Y lo del mes en curso no se movió.
  assert.equal(inventoryNow(state)[arroz], 9, 'abrir el mes siguiente tocó el inventario de este');
  hecho('11 mes siguiente', `${delSiguiente.length} desayunos en ${SIGUIENTE} (${diasDelMes(SIGUIENTE)} días)`);

  assert.equal(pasos.length, 11, 'no se completaron los once pasos');
});

/* ══ D. HISTORIAL CONGELADO ══════════════════════════════════════════════ */

test('D · un período cerrado se lee tal como quedó, aunque todo lo demás cambie', () => {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  setHabitualBasket(state, [{ productId: arroz, quantity: 30, unit: 'lb', desde: '2026-01' }]);

  const cierre = cerrarPeriodo(state, { start: '2027-01-01', end: '2027-01-31', periodo: 'mes' });
  const antes = shoppingList(state, '2027-01-01', '2027-01-31', 'casa');
  assert.equal(antes.congelado, true, 'un período cerrado tendría que leerse de su copia');
  const pedidoAntes = antes.lines.find(linea => linea.productId === arroz)?.need;

  // Se cambia la canasta tres veces después de cerrar.
  setHabitualLine(state, arroz, 50, 'lb');
  setHabitualLine(state, arroz, 80, 'lb');
  setHabitualLine(state, arroz, 120, 'lb');

  const despues = shoppingList(state, '2027-01-01', '2027-01-31', 'casa');
  assert.equal(despues.lines.find(linea => linea.productId === arroz)?.need, pedidoAntes,
    'la lista de un mes cerrado cambió al cambiar la canasta de hoy');
  assert.equal(despues.cierre.id, cierre.id);
});
