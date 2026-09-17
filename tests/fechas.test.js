// Las fechas, que es donde una app de calendario se rompe sin avisar.
//
// Las funciones del modelo trabajan con texto `YYYY-MM-DD` y, cuando necesitan
// un `Date`, lo anclan a las 12:00 del mediodía. Eso es lo que impide que un
// cambio de horario a medianoche mueva un día de sitio. Aquí se comprueba que
// siga siendo verdad, y se defienden dos fallos de pantalla que aparecieron
// auditando esto:
//
//   · La semana que cruza de año se rotulaba «Del 29 dic al 4 de enero de
//     2026». El 29 de diciembre es de 2025; el año del final se derramaba
//     hacia atrás sobre una fecha que no era suya.
//   · El atajo «Toda la semana» no marcaba ni una casilla si se estaba mirando
//     una semana pasada.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { addDays, dateRange, monthBounds, validDate, weekStart, weekdayOf } from '../src/model.js';

/* ── Cruces de mes y de año ────────────────────────────────────────────── */

test('una semana que cruza de mes trae siete días seguidos', () => {
  const inicio = weekStart('2026-09-30'); // miércoles
  assert.equal(inicio, '2026-09-28', 'la semana no empieza el lunes');
  const dias = dateRange(inicio, addDays(inicio, 6));
  assert.deepEqual(dias, ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
});

test('una semana que cruza de año también', () => {
  const inicio = weekStart('2026-01-01'); // jueves
  assert.equal(inicio, '2025-12-29');
  const dias = dateRange(inicio, addDays(inicio, 6));
  assert.deepEqual(dias, ['2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
  assert.equal(addDays('2025-12-31', 1), '2026-01-01', 'el año no avanza');
});

/* ── Febrero ───────────────────────────────────────────────────────────── */

test('febrero de un año normal tiene 28 días y no acepta el 29', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(validDate('2026-02-29'), false, 'se acepta un día que no existe');
  assert.equal(monthBounds('2026-02').end, '2026-02-28');
});

test('febrero de un año bisiesto tiene 29', () => {
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2028-02-29', 1), '2028-03-01');
  assert.equal(validDate('2028-02-29'), true);
  assert.equal(monthBounds('2028-02').end, '2028-02-29');
});

test('los siglos que engañan: 2000 sí, 2100 no', () => {
  // Divisible entre 100 no es bisiesto, salvo que además lo sea entre 400.
  assert.equal(validDate('2000-02-29'), true);
  assert.equal(validDate('2100-02-29'), false);
});

test('una semana de febrero bisiesto no salta ni repite', () => {
  const dias = dateRange('2028-02-28', '2028-03-05');
  assert.deepEqual(dias, ['2028-02-28', '2028-02-29', '2028-03-01', '2028-03-02', '2028-03-03', '2028-03-04', '2028-03-05']);
});

/* ── Que sumar días no se tuerza nunca ─────────────────────────────────── */

test('sumar día a día cuatro años seguidos no salta ninguno', () => {
  // Si alguna función usara un `Date` a medianoche local, un cambio de horario
  // haría que este bucle se saltara o repitiera un día. Son 1461 pasos.
  let fecha = '2026-01-01';
  const vistos = new Set([fecha]);
  for (let i = 0; i < 1460; i += 1) {
    const siguiente = addDays(fecha, 1);
    assert.ok(validDate(siguiente), `${siguiente} no es una fecha válida`);
    assert.ok(!vistos.has(siguiente), `${siguiente} salió dos veces`);
    vistos.add(siguiente);
    fecha = siguiente;
  }
  assert.equal(fecha, '2029-12-31', 'cuatro años dieron un número de días distinto');
  assert.equal(vistos.size, 1461);
});

test('el lunes de una semana es siempre lunes, y contiene su fecha', () => {
  let fecha = '2025-11-01';
  for (let i = 0; i < 800; i += 1) {
    const lunes = weekStart(fecha);
    assert.equal(weekdayOf(lunes), 1, `${lunes} no es lunes`);
    assert.equal(weekStart(lunes), lunes, 'el lunes de un lunes no es él mismo');
    assert.ok(lunes <= fecha && fecha <= addDays(lunes, 6), `${fecha} no cae en su propia semana`);
    fecha = addDays(fecha, 1);
  }
});

/* ── Lo que se lee en pantalla ─────────────────────────────────────────── */

// `renderSemana` se dibuja con el módulo entero, así que se importa aquí abajo
// para que el resto del archivo no dependa de la pantalla.
const { emptySemana, renderSemana, SEMANA_ACTIONS } = await import('../src/page-semana.js');
const { createEmptyState, upsertPerson } = await import('../src/model.js');

function contexto(inicio) {
  const state = createEmptyState();
  upsertPerson(state, { name: 'Ana', kind: 'adulto', restricciones: [] });
  return {
    state,
    ui: { page: 'semana', modal: null, semana: { ...emptySemana(), inicio } },
    commit: () => {}, toast: () => {}, render: () => {}, openModal: () => {}, closeModal: () => {}
  };
}

test('la semana que cambia de año dice los dos años, no solo el último', () => {
  const html = renderSemana(contexto('2025-12-29'));
  // El 29 de diciembre es de 2025. Decir «del 29 dic al 4 de enero de 2026»
  // lo manda un año hacia adelante.
  assert.ok(/29 dic.*2025/.test(html), 'el primer día de la semana perdió su año');
  assert.ok(/4 de enero de 2026/.test(html), 'el último día perdió el suyo');
});

test('una semana de un solo mes no repite el mes ni saca el año a pasear', () => {
  const html = renderSemana(contexto('2026-09-14'));
  assert.ok(/Del 14 al 20 de septiembre/.test(html), 'el rótulo de una semana normal cambió');
});

test('«Toda la semana» marca días también en una semana pasada', () => {
  /* El fallo: el atajo arrancaba siempre desde hoy, así que en una semana que
     ya pasó no había ningún día «de hoy en adelante» y el botón no hacía nada,
     sin decir por qué. */
  const pasada = ['2020-01-06', '2020-01-07', '2020-01-08', '2020-01-09', '2020-01-10', '2020-01-11', '2020-01-12'];
  const casillas = pasada.map(value => ({ value, checked: false }));
  globalThis.document = { querySelectorAll: () => casillas };

  const ctx = contexto('2020-01-06');
  SEMANA_ACTIONS['poner-dias-atajo']({ dataset: { cuantos: '7' } }, ctx);
  assert.equal(casillas.filter(casilla => casilla.checked).length, 7,
    'el atajo no marcó ni un día de una semana pasada');
});

test('en la semana de hoy el atajo no llena los días que ya pasaron', () => {
  const hoy = new Date().toISOString().slice(0, 10);
  const lunes = weekStart(hoy);
  const dias = dateRange(lunes, addDays(lunes, 6));
  const casillas = dias.map(value => ({ value, checked: false }));
  globalThis.document = { querySelectorAll: () => casillas };

  const ctx = contexto(lunes);
  SEMANA_ACTIONS['poner-dias-atajo']({ dataset: { cuantos: '7' } }, ctx);
  const marcados = casillas.filter(casilla => casilla.checked).map(casilla => casilla.value);
  assert.ok(marcados.length >= 1, 'no marcó ni el día de hoy');
  assert.ok(marcados.every(fecha => fecha >= hoy), 'marcó un día que ya pasó');
});

test('la fecha de hoy se pregunta cada vez, no se guarda al cargar', () => {
  // Una constante calculada al importar el módulo deja la app pintando el día
  // de ayer cuando el teléfono se queda encendido pasada la medianoche.
  for (const archivo of ['src/page-semana.js', 'src/page-mas.js', 'src/page-compra.js']) {
    const fuente = readFileSync(archivo, 'utf8');
    assert.ok(!/^const hoy = todayISO\(\);/m.test(fuente), `${archivo} vuelve a congelar la fecha al cargar`);
  }
});
