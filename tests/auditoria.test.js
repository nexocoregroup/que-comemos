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
  addProduct, addPurchase, agregarALista, cerrarLista, crearLista, createEmptyState, createReview,
  dateRange, effectiveBasket, frecuenciaDe, habitualLines, inventoryNow, makeRecipePlan, marcarComprado,
  monthBounds, monthProgress, periodosDelMes, planFor, ponerFrecuencia, resumenDeLista, saveReview,
  setHabitualBasket, setHabitualLine, todayISO, upsertPerson, upsertRecipe, weekdayOf
} from '../src/model.js';

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

// Los días de un mes que caen en un día de la semana, contados sobre el
// calendario y sin pasar por el código que se está probando.
const diasQueCaenEn = (mes, dia) => {
  const { start, end } = monthBounds(mes);
  return dateRange(start, end).filter(fecha => {
    const numero = new Date(`${fecha}T12:00:00`).getDay();
    return (numero === 0 ? 7 : numero) === dia;
  });
};

// Todos los días del mes, repartidos por día de la semana, según el calendario.
const todosLosDias = mes => {
  const { start, end } = monthBounds(mes);
  const salida = [];
  for (let dia = Number(start.slice(8, 10)); dia <= Number(end.slice(8, 10)); dia++) {
    salida.push(`${mes}-${String(dia).padStart(2, '0')}`);
  }
  return salida;
};

test('A1 · febrero de 2027 tiene 28 días, y el calendario no inventa un 29', () => {
  assert.equal(diasDelMes('2027-02'), 28);
  assert.equal(monthBounds('2027-02').end, '2027-02-28');
  for (let dia = 1; dia <= 7; dia++) {
    const fechas = diasQueCaenEn('2027-02', dia);
    assert.ok(fechas.every(fecha => Number(fecha.slice(8, 10)) <= 28), `el día ${dia} salió del mes`);
    assert.ok(fechas.length >= 4 && fechas.length <= 5, `${fechas.length} apariciones del día ${dia}`);
  }
  // Los siete días de la semana, juntos, cubren el mes entero sin huecos.
  const cubiertos = [1, 2, 3, 4, 5, 6, 7].flatMap(dia => diasQueCaenEn('2027-02', dia)).sort();
  assert.deepEqual(cubiertos, todosLosDias('2027-02'));
});

test('A2 · febrero de 2028 tiene 29 días, y el 29 se usa', () => {
  assert.equal(diasDelMes('2028-02'), 29);
  assert.equal(monthBounds('2028-02').end, '2028-02-29');
  const cubiertos = [1, 2, 3, 4, 5, 6, 7].flatMap(dia => diasQueCaenEn('2028-02', dia)).sort();
  assert.deepEqual(cubiertos, todosLosDias('2028-02'));
  assert.ok(cubiertos.includes('2028-02-29'), 'el año bisiesto perdió su día 29');
});

test('A3 · abril tiene 30 días y el 31 no existe', () => {
  assert.equal(diasDelMes('2027-04'), 30);
  assert.equal(monthBounds('2027-04').end, '2027-04-30');
  const cubiertos = [1, 2, 3, 4, 5, 6, 7].flatMap(dia => diasQueCaenEn('2027-04', dia)).sort();
  assert.deepEqual(cubiertos, todosLosDias('2027-04'));
  assert.ok(!cubiertos.some(fecha => fecha.endsWith('-31')), 'abril tiene un día 31');
});

test('A4 · enero tiene 31 días y ninguno se queda fuera', () => {
  assert.equal(diasDelMes('2027-01'), 31);
  assert.equal(monthBounds('2027-01').end, '2027-01-31');
  const cubiertos = [1, 2, 3, 4, 5, 6, 7].flatMap(dia => diasQueCaenEn('2027-01', dia)).sort();
  assert.deepEqual(cubiertos, todosLosDias('2027-01'));
  assert.ok(cubiertos.includes('2027-01-31'), 'el día 31 se quedó fuera');
});

test('A5 · los domingos de cuatro meses distintos, fecha por fecha', () => {
  // Domingo es 7 en la numeración ISO, la misma de todo el proyecto. Las fechas
  // están escritas a mano, contra un calendario: si se calcularan igual que las
  // calcula la app, esta prueba no diría nada.
  const esperado = {
    '2027-01': ['2027-01-03', '2027-01-10', '2027-01-17', '2027-01-24', '2027-01-31'],
    '2027-02': ['2027-02-07', '2027-02-14', '2027-02-21', '2027-02-28'],
    '2027-04': ['2027-04-04', '2027-04-11', '2027-04-18', '2027-04-25'],
    '2028-02': ['2028-02-06', '2028-02-13', '2028-02-20', '2028-02-27']
  };
  for (const [mes, domingos] of Object.entries(esperado)) {
    assert.deepEqual(diasQueCaenEn(mes, 7), domingos, `los domingos de ${mes}`);
    for (const fecha of domingos) assert.equal(weekdayOf(fecha), 7, `el ${fecha} no es domingo`);
  }
});

test('A6 · un mes que nadie ha tocado está entero por decidir, y nada lo llena solo', () => {
  const state = createEmptyState();
  const platano = addProduct(state, { name: 'Plátano maduro', controlUnit: 'unidad', purchaseUnit: 'unidad' }).id;
  const mangu = upsertRecipe(state, { name: 'Mangú', uses: ['desayuno'], items: [{ productId: platano, quantity: 4, unit: 'unidad' }] }).id;

  // Mirar enero no escribe nada: es la resta que hizo esta fase.
  const enero = monthProgress(state, '2027-01');
  assert.equal(state.plans.length, 0, 'mirar un mes escribió comidas por su cuenta');
  assert.equal(enero.dias, 31);
  assert.equal(enero.pendientes, 31 * 3, 'enero tendría que estar entero por decidir');
  assert.equal(enero.porcentaje, 0);

  // Y lo que se pone, se pone día a día, en los días que se dijeron y ni uno más.
  const domingos = diasQueCaenEn('2027-01', 7);
  for (const fecha of domingos) makeRecipePlan(state, mangu, fecha, 'desayuno', null, null, 'manual');
  assert.equal(state.plans.length, domingos.length);
  assert.equal(monthProgress(state, '2027-01').pendientes, 31 * 3 - domingos.length);
  assert.deepEqual(state.mealRoutines, [], 'poner cinco domingos dejó escrita una costumbre');
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

test('B4 · las rutinas anteriores se conservan enteras, aunque ya no pongan comidas', () => {
  // La app dejó de repetir comidas sola, y con ella se fue todo lo que aplicaba
  // una regla. Lo que una casa escribió sigue guardado tal cual: convertir un
  // respaldo no es el momento de decidir que algo suyo sobra.
  const state = convertida();
  assert.equal(state.mealRoutines.length, 2, 'la conversión se llevó por delante lo que había escrito');
  const [mangu, domingos] = state.mealRoutines;
  assert.deepEqual(mangu.weekdays, [1, 3, 5]);
  assert.equal(mangu.scope, 'permanent');
  assert.equal(mangu.label, 'Mangú de siempre');
  assert.deepEqual(domingos.weeks, [1, 3]);

  // Y ninguna de ellas escribe nada por su cuenta: el calendario convertido
  // tiene las tres comidas que tenía el respaldo, ni una más.
  assert.equal(state.plans.length, 3, 'una regla vieja se puso a llenar el calendario al convertir');
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

test('C · los once pasos, de una cuenta nueva a poner el mes siguiente', () => {
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

  // 7. Poner el mes: los lunes, miércoles y viernes de desayuno, marcados a
  //    mano. Es lo que hace la ventana de «poner una comida en varios días», y
  //    lo que deja escrito son esas comidas y ninguna regla.
  const esperados = [1, 3, 5].flatMap(dia => diasQueCaenEn(MES, dia)).sort();
  for (const fecha of esperados) makeRecipePlan(state, mangu, fecha, 'desayuno', null, null, 'manual');
  for (const fecha of esperados) {
    const comida = planFor(state, fecha, 'desayuno');
    assert.ok(comida, `el ${fecha} se quedó sin desayuno`);
    assert.equal(comida.origen, 'manual');
  }
  assert.deepEqual(state.mealRoutines, [], 'poner unos desayunos escribió una costumbre que nadie pidió');
  hecho('7 poner el mes', `${esperados.length} desayunos puestos a mano`);

  // 8. Lo que falta sigue siendo un hueco, y el mes se mira con huecos.
  const progreso = monthProgress(state, MES);
  assert.equal(progreso.dias, diasDelMes(MES));
  assert.equal(progreso.encasa, esperados.length);
  assert.equal(progreso.pendientes, diasDelMes(MES) * 3 - esperados.length, 'los huecos no cuadran con lo puesto');
  hecho('8 mirar el mes', `${progreso.porcentaje}% decidido, ${progreso.pendientes} huecos`);

  // 9. La compra: una lista de la salida, escrita desde los habituales.
  const lista = crearLista(state, { nombre: 'La del sábado' });
  for (const linea of habitualLines(state)) agregarALista(state, lista.id, { productId: linea.productId, cantidad: linea.quantity, unidad: linea.unit });
  assert.equal(lista.lineas.length, 3, 'la lista no recogió los tres alimentos de la canasta');
  const delArroz = lista.lineas.find(linea => linea.productId === arroz);
  assert.equal(delArroz.cantidad, 30, 'el renglón del arroz no trae lo que dice la canasta');
  marcarComprado(state, lista.id, delArroz.id);
  assert.equal(resumenDeLista(lista).comprados, 1);
  cerrarLista(state, lista.id);
  assert.equal(lista.estado, 'cerrada', 'la lista no se pudo cerrar');
  hecho('9 compra', `${lista.lineas.length} renglones · arroz: ${delArroz.cantidad} lb`);

  // 10. Revisar existencias. Se anota la compra y después se revisa lo que queda.
  addPurchase(state, { date: HOY, lines: [{ productId: arroz, quantity: 15, unit: 'lb' }] });
  assert.equal(inventoryNow(state)[arroz], 15, 'la compra no subió el inventario');
  const revision = createReview(state, HOY, 'restante');
  saveReview(state, revision.id, { [arroz]: 9 }, true, 'restante');
  assert.equal(inventoryNow(state)[arroz], 9, 'la revisión no dejó el saldo en lo que se contó');
  hecho('10 revisión', 'de 15 lb quedan 9: consumió 6');

  // 11. El mes siguiente: nace vacío, y se pone igual que este.
  const antesDelSiguiente = monthProgress(state, SIGUIENTE);
  assert.equal(antesDelSiguiente.encasa, 0, 'el mes siguiente se llenó solo con lo de este');
  assert.equal(antesDelSiguiente.pendientes, diasDelMes(SIGUIENTE) * 3);

  const delSiguiente = [1, 3, 5].flatMap(dia => diasQueCaenEn(SIGUIENTE, dia));
  for (const fecha of delSiguiente) makeRecipePlan(state, mangu, fecha, 'desayuno', null, null, 'manual');
  for (const fecha of delSiguiente) {
    assert.ok(planFor(state, fecha, 'desayuno'), `${SIGUIENTE}: el ${fecha} se quedó vacío`);
  }
  // Y lo del mes en curso no se movió.
  assert.equal(inventoryNow(state)[arroz], 9, 'poner el mes siguiente tocó el inventario de este');
  assert.equal(monthProgress(state, MES).encasa, esperados.length, 'poner el mes siguiente cambió el de ahora');
  hecho('11 mes siguiente', `${delSiguiente.length} desayunos en ${SIGUIENTE} (${diasDelMes(SIGUIENTE)} días)`);

  assert.equal(pasos.length, 11, 'no se completaron los once pasos');
});

/* ══ D. EL MES QUE YA PASÓ NO SE REESCRIBE ═══════════════════════════════ */

test('D · un mes que ya pasó se lee tal como quedó, aunque la canasta cambie tres veces', () => {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  setHabitualBasket(state, [{ productId: arroz, quantity: 30, unit: 'lb', desde: '2026-01' }]);

  const enEnero = () => effectiveBasket(state, '2026-01').find(linea => linea.productId === arroz).quantity;
  assert.equal(enEnero(), 30, 'enero de 2026 se compró con 30 libras');

  // Se cambia la canasta tres veces después, ya en otro mes.
  setHabitualLine(state, arroz, 50, 'lb', null, '2026-06');
  setHabitualLine(state, arroz, 80, 'lb', null, '2026-09');
  setHabitualLine(state, arroz, 120, 'lb', null, '2027-01');

  assert.equal(enEnero(), 30, 'la canasta de un mes que ya pasó cambió al cambiar la de hoy');
  assert.equal(effectiveBasket(state, '2026-06').find(linea => linea.productId === arroz).quantity, 50);
  assert.equal(effectiveBasket(state, '2026-09').find(linea => linea.productId === arroz).quantity, 80);
  assert.equal(effectiveBasket(state, '2027-01').find(linea => linea.productId === arroz).quantity, 120);
  // Y un mes anterior al primer tramo no se inventa una canasta que no había.
  assert.deepEqual(effectiveBasket(state, '2025-12'), []);
});
