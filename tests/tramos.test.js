// Los tramos de la canasta: cada línea guarda su historia y cada mes lee la
// suya. Lo que estas pruebas vigilan es una sola frase, dicha de siete formas:
// escribir hoy no puede cambiar lo que la app dice de un mes que ya se compró.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addProduct, createEmptyState, effectiveBasket, habitualLines, product,
  removeHabitualLine, setHabitualBasket, setHabitualLine, todayISO
} from '../src/model.js';
import { SCHEMA_VERSION, migrate } from '../src/migrate.js';

const ESTE_MES = todayISO().slice(0, 7);

// Meses relativos a hoy, para que estas pruebas no caduquen en enero.
function mesesAntes(cuantos) {
  const [ano, mes] = ESTE_MES.split('-').map(Number);
  const total = ano * 12 + (mes - 1) - cuantos;
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`;
}
const mesesDespues = cuantos => mesesAntes(-cuantos);

function casa() {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'taza', purchaseUnit: 'lb', category: 'granos' }).id;
  const pollo = addProduct(state, { name: 'Pollo', controlUnit: 'lb', purchaseUnit: 'lb', category: 'carnes' }).id;
  return { state, arroz, pollo };
}

const cuanto = (state, mes, productId) => {
  const linea = effectiveBasket(state, mes).find(fila => fila.productId === productId);
  return linea ? linea.quantity : null;
};

/* ── Lo que esta fase vino a arreglar ──────────────────────────────────── */

test('corregir una cantidad hoy no cambia lo que se compró en los meses pasados', () => {
  const { state, arroz } = casa();
  const julio = mesesAntes(2);
  setHabitualLine(state, arroz, 90, 'taza', 'obligatorio', julio);

  setHabitualLine(state, arroz, 120, 'taza');

  assert.equal(cuanto(state, julio, arroz), 90, 'julio ya se compró con 90');
  assert.equal(cuanto(state, mesesAntes(1), arroz), 90, 'y el mes pasado también');
  assert.equal(cuanto(state, ESTE_MES, arroz), 120, 'el cambio vale desde este mes');
  assert.equal(cuanto(state, mesesDespues(1), arroz), 120, 'y de aquí en adelante');
});

test('la comparación con el mes anterior vuelve a ver el cambio que se acaba de hacer', () => {
  // Es la pantalla del plan mensual: «Y en la compra cambia esto». Con una sola
  // cantidad por línea, al recalcular el mes pasado con la de hoy los dos meses
  // salían iguales, y la pantalla que existe para acordarte de lo que hiciste
  // distinto era precisamente la que no podía verlo.
  const { state, arroz } = casa();
  setHabitualLine(state, arroz, 90, 'taza', 'obligatorio', mesesAntes(2));
  setHabitualLine(state, arroz, 120, 'taza');

  const antes = cuanto(state, mesesAntes(1), arroz);
  const ahora = cuanto(state, ESTE_MES, arroz);
  assert.notEqual(antes, ahora, 'el mes pasado y este salen iguales: el cambio es invisible');
  assert.equal(antes, 90);
  assert.equal(ahora, 120);
});

test('un alimento que se deja de comprar no desaparece de los meses en que sí se compró', () => {
  const { state, pollo } = casa();
  const enero = mesesAntes(3);
  setHabitualLine(state, pollo, 8, 'lb', 'frecuente', enero);

  assert.equal(removeHabitualLine(state, pollo), true);

  assert.equal(cuanto(state, enero, pollo), 8, 'en enero sí se compraba pollo');
  assert.equal(cuanto(state, mesesAntes(1), pollo), 8);
  assert.equal(cuanto(state, ESTE_MES, pollo), null, 'y desde este mes ya no');
  assert.equal(habitualLines(state).length, 0, 'la canasta de hoy no lo lleva');
});

test('lo añadido y quitado el mismo mes no deja una línea fantasma', () => {
  const { state, pollo } = casa();
  setHabitualLine(state, pollo, 8, 'lb');
  removeHabitualLine(state, pollo);
  // No hay ningún mes que proteger, así que no se guarda una línea de baja: eso
  // sería dejar basura con forma de dato.
  assert.equal(state.habitualBasket.lines.length, 0);
  assert.equal(removeHabitualLine(state, pollo), false, 'quitar lo que ya no está no cambia nada');
});

/* ── Las dos intenciones que se parecen ────────────────────────────────── */

test('«estaba mal escrito» corrige hacia atrás, pero solo hasta donde empezó el error', () => {
  const { state, arroz } = casa();
  const hace4 = mesesAntes(4), hace2 = mesesAntes(2);
  setHabitualLine(state, arroz, 60, 'taza', 'obligatorio', hace4);
  setHabitualLine(state, arroz, 90, 'taza', 'obligatorio', hace2);

  // Los 90 estaban mal: eran 95 desde el principio de ese tramo.
  setHabitualLine(state, arroz, 95, 'taza', null, hace2, { corregir: true });

  assert.equal(cuanto(state, hace4, arroz), 60, 'el tramo anterior era correcto y no se toca');
  assert.equal(cuanto(state, mesesAntes(3), arroz), 60);
  assert.equal(cuanto(state, hace2, arroz), 95, 'la corrección alcanza hasta donde empezó el dato malo');
  assert.equal(cuanto(state, ESTE_MES, arroz), 95);
  assert.equal(state.habitualBasket.lines[0].tramos.length, 2, 'corregir no abre un tramo nuevo');
});

test('sin decir nada, escribir abre un tramo desde este mes y deja quieto lo anterior', () => {
  const { state, arroz } = casa();
  setHabitualLine(state, arroz, 60, 'taza', 'obligatorio', mesesAntes(4));
  setHabitualLine(state, arroz, 95, 'taza');
  assert.equal(state.habitualBasket.lines[0].tramos.length, 2);
  assert.equal(cuanto(state, mesesAntes(4), arroz), 60);
});

/* ── Que no se llene de ruido ──────────────────────────────────────────── */

test('guardar la canasta sin tocar nada no le añade un tramo a cada alimento', () => {
  const { state, arroz, pollo } = casa();
  setHabitualBasket(state, [
    { productId: arroz, quantity: 90, unit: 'taza', priority: 'obligatorio' },
    { productId: pollo, quantity: 8, unit: 'lb' }
  ]);
  const tramosAntes = state.habitualBasket.lines.map(linea => linea.tramos.length);

  // La pantalla reenvía todas sus líneas al guardar, también las que nadie tocó.
  for (let vez = 0; vez < 3; vez++) {
    setHabitualBasket(state, [
      { productId: arroz, quantity: 90, unit: 'taza', priority: 'obligatorio' },
      { productId: pollo, quantity: 8, unit: 'lb' }
    ]);
  }
  assert.deepEqual(state.habitualBasket.lines.map(linea => linea.tramos.length), tramosAntes,
    'guardar sin cambiar nada convirtió la historia en ruido');
});

test('escribir dos veces en el mismo mes corrige el tramo en vez de apilar dos', () => {
  const { state, arroz } = casa();
  setHabitualLine(state, arroz, 90, 'taza');
  setHabitualLine(state, arroz, 100, 'taza');
  setHabitualLine(state, arroz, 110, 'taza');
  assert.equal(state.habitualBasket.lines[0].tramos.length, 1);
  assert.equal(cuanto(state, ESTE_MES, arroz), 110);
});

/* ── Fechar hacia adelante, que antes no se podía ──────────────────────── */

test('se puede decir «desde el mes que viene son 120» sin tocar este mes', () => {
  const { state, arroz } = casa();
  setHabitualLine(state, arroz, 90, 'taza', 'obligatorio', mesesAntes(1));
  setHabitualLine(state, arroz, 120, 'taza', null, mesesDespues(1));

  assert.equal(cuanto(state, ESTE_MES, arroz), 90, 'este mes todavía son 90');
  assert.equal(cuanto(state, mesesDespues(1), arroz), 120);

  // Y la pantalla tiene cómo decirlo, que si no parecería que no se guardó.
  const linea = habitualLines(state)[0];
  assert.equal(linea.quantity, 90);
  assert.equal(linea.proximo.quantity, 120);
  assert.equal(linea.proximo.desde, mesesDespues(1));
});

test('lo que empieza más adelante ya está en la canasta, aunque todavía no en la compra', () => {
  const { state, pollo } = casa();
  setHabitualLine(state, pollo, 8, 'lb', 'frecuente', mesesDespues(2));

  assert.equal(habitualLines(state).length, 1, 'el alimento que acabas de guardar se esfumó de la pantalla');
  assert.equal(cuanto(state, ESTE_MES, pollo), null, 'pero este mes todavía no se compra');
  assert.equal(cuanto(state, mesesDespues(2), pollo), 8);
});

/* ── La conversión de lo que ya está guardado ──────────────────────────── */

const canastaVieja = () => ({
  version: 7, seq: 5, demo: false,
  products: [{ id: 'producto-1', name: 'Arroz', controlUnit: 'taza', purchaseUnit: 'lb', category: 'granos', active: true }],
  people: [], recipes: [], plans: [], absences: [], opening: {}, purchases: [], reviews: [],
  corrections: [], manualItems: [], closedPeriods: [], mealRoutines: [], monthOverrides: {},
  habitualBasket: {
    updatedAt: '2026-09-01', history: [],
    lines: [
      // Como se guardaban antes: una cantidad suelta y una fecha de entrada.
      { id: 'canasta-1', productId: 'producto-1', quantity: 90, unit: 'taza', priority: 'obligatorio', desde: '2026-07' },
      // Y una de las más viejas todavía, sin fecha ninguna.
      { id: 'canasta-2', productId: 'producto-1', quantity: 20, unit: 'lb', priority: 'frecuente' }
    ]
  }
});

test('una canasta guardada antes de los tramos se convierte sin perder nada', () => {
  const salida = migrate(canastaVieja());
  assert.equal(salida.ok, true);
  assert.equal(salida.state.version, SCHEMA_VERSION);

  const [conFecha, sinFecha] = salida.state.habitualBasket.lines;
  assert.deepEqual(conFecha.tramos, [{ desde: '2026-07', quantity: 90, unit: 'taza', priority: 'obligatorio' }]);
  // Sin fecha es «desde siempre», y así se queda: era la canasta de la casa
  // durante aquellos meses, e inventarle ahora un mes de comienzo sería escribir
  // un dato que nadie dijo.
  assert.deepEqual(sinFecha.tramos, [{ desde: null, quantity: 20, unit: 'lb', priority: 'frecuente' }]);
  assert.equal('quantity' in conFecha, false, 'la cantidad suelta se queda como segunda verdad');
});

test('convertir dos veces la misma canasta no la cambia la segunda vez', () => {
  const una = migrate(canastaVieja()).state;
  const dos = migrate(una).state;
  assert.deepEqual(dos.habitualBasket, una.habitualBasket);
});

test('una línea sin tramos que llegue por otro camino no desaparece de la canasta', () => {
  // Un respaldo pegado a mano, código viejo, lo que sea: la línea se convierte
  // donde está. Desaparecer sin decir nada es peor que cualquier error.
  const { state, arroz } = casa();
  state.habitualBasket.lines = [{ id: 'canasta-1', productId: arroz, quantity: 30, unit: 'lb', priority: 'frecuente', desde: null }];
  assert.equal(habitualLines(state).length, 1);
  assert.equal(habitualLines(state)[0].quantity, 30);
  assert.ok(effectiveBasket(state, '2020-01').some(fila => fila.productId === arroz), 'un mes viejo perdió lo que sí compró');
});

/* ── Que las excepciones del mes sigan funcionando encima ──────────────── */

test('un cambio de un mes concreto hereda lo que la canasta decía ESE mes', () => {
  const { state, arroz } = casa();
  setHabitualLine(state, arroz, 90, 'taza', 'obligatorio', mesesAntes(3));
  setHabitualLine(state, arroz, 120, 'taza');
  // Nadie ha tocado el nombre del producto; es para que la prueba lea bien.
  assert.equal(product(state, arroz).name, 'Arroz');

  assert.equal(cuanto(state, mesesAntes(2), arroz), 90);
  assert.equal(cuanto(state, ESTE_MES, arroz), 120);
});

/* ── Unir dos alimentos que estaban los dos en la canasta ──────────────── */

test('unir dos alimentos suma sus dos historias, mes a mes', async () => {
  const { mergeProducts } = await import('../src/model.js');
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  const arrocito = addProduct(state, { name: 'Arroz blanco', controlUnit: 'lb', purchaseUnit: 'lb' }).id;

  // Dos historias distintas del que resultó ser el mismo alimento.
  setHabitualLine(state, arroz, 20, 'lb', 'obligatorio', mesesAntes(4));
  setHabitualLine(state, arroz, 30, 'lb', 'obligatorio', mesesAntes(2));
  setHabitualLine(state, arrocito, 5, 'lb', 'frecuente', mesesAntes(3));

  mergeProducts(state, arroz, arrocito);

  assert.equal(habitualLines(state).length, 1, 'quedan dos líneas del mismo alimento');
  assert.equal(cuanto(state, mesesAntes(4), arroz), 20, 'antes de que existiera el otro, solo el primero');
  assert.equal(cuanto(state, mesesAntes(3), arroz), 25, '20 y 5 en el mes en que convivieron');
  assert.equal(cuanto(state, mesesAntes(2), arroz), 35, 'y 30 y 5 cuando el primero subió');
  assert.ok(Number.isFinite(cuanto(state, ESTE_MES, arroz)), 'una cantidad que no es un número rompe la compra entera');
});
