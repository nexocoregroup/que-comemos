// Los datos de quien ya usaba la app tienen que abrir enteros.
//
// `tests/fixtures/estado-v10-completo.json` es una casa de la versión 10 del
// esquema: la que tenía un teléfono el día antes de que la app dejara de llenar
// el calendario sola. Dentro hay cinco reglas —una en pausa—, veinticuatro
// comidas de las que diecinueve las puso una regla, un período cerrado con su
// lista congelada, dos listas de compra, una canasta con tramos y un reparto de
// quincena escrito.
//
// Esta prueba dice tres cosas, y son las tres que importan después de una
// reestructura:
//
//   1. Nada se pierde. Ni un producto, ni una comida, ni una regla, ni un
//      cierre. Se comprueba colección por colección y, donde es historia, letra
//      por letra.
//   2. Repetir la migración no duplica ni borra nada.
//   3. **Ninguna regla antigua vuelve a poner una comida.** Se guardan como lo
//      que son —lo que esta casa hacía— y no como algo que siga ejecutándose.
//
// El archivo se comprueba por su huella SHA-256 antes de mirarlo. Si alguien lo
// edita, esta prueba lo dice en vez de acomodarse al cambio.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { SCHEMA_VERSION, migrate } from '../src/migrate.js';
import { exportState, importState, monthProgress, planFor } from '../src/model.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(AQUI, 'fixtures');
const CRUDO = readFileSync(join(FIXTURES, 'estado-v10-completo.json'), 'utf8');
const leer = () => JSON.parse(CRUDO);

const COLECCIONES = ['products', 'people', 'recipes', 'plans', 'absences', 'purchases', 'reviews', 'corrections', 'manualItems', 'mealRoutines', 'listasDeCompra', 'closedPeriods', 'activity'];

test('el respaldo congelado es el que se congeló: nadie lo ha editado', () => {
  const esperadas = Object.fromEntries(readFileSync(join(FIXTURES, 'SUMAS-v10.txt'), 'utf8')
    .split('\n').filter(Boolean)
    .map(linea => linea.trim().split(/\s+/))
    .map(([huella, nombre]) => [nombre, huella]));
  const calculada = createHash('sha256').update(CRUDO, 'utf8').digest('hex');
  assert.equal(calculada, esperadas['estado-v10-completo.json'],
    'la huella no coincide: o se editó el respaldo, o Git le tocó los finales de línea (ver tests/fixtures/.gitattributes)');
});

test('el respaldo sigue siendo de la versión 10, que es de lo que sirve', () => {
  assert.equal(leer().version, 10);
  assert.ok(SCHEMA_VERSION >= 10, 'el esquema no puede retroceder');
});

test('abre entero, sin perder un solo registro', () => {
  const antes = leer();
  const despues = importState(CRUDO);

  for (const clave of COLECCIONES) {
    assert.equal(despues[clave].length, antes[clave].length,
      `cambió el número de ${clave}: ${antes[clave].length} → ${despues[clave].length}`);
  }
  assert.equal(despues.habitualBasket.lines.length, antes.habitualBasket.lines.length);
  assert.deepEqual(Object.keys(despues.monthOverrides).sort(), Object.keys(antes.monthOverrides).sort());
  assert.deepEqual(Object.keys(despues.monthPlans).sort(), Object.keys(antes.monthPlans).sort());
  assert.deepEqual(despues.opening, antes.opening);
  assert.equal(despues.demo, antes.demo);
});

test('lo que es historia se conserva letra por letra', () => {
  const antes = leer();
  const despues = importState(CRUDO);
  // Una compra, una revisión, una corrección y un período cerrado son hechos
  // que pasaron. Normalizarlos sería reescribir el pasado.
  for (const clave of ['purchases', 'reviews', 'corrections', 'closedPeriods', 'listasDeCompra']) {
    assert.deepEqual(despues[clave], antes[clave], `se tocó ${clave}, que es historia`);
  }
});

test('las reglas antiguas siguen guardadas, con su pausa y todo', () => {
  const antes = leer();
  const despues = importState(CRUDO);
  assert.equal(despues.mealRoutines.length, 5);
  assert.deepEqual(
    despues.mealRoutines.map(regla => regla.id).sort(),
    antes.mealRoutines.map(regla => regla.id).sort());
  assert.equal(despues.mealRoutines.filter(regla => regla.active === false).length, 1,
    'la regla en pausa tiene que seguir en pausa');
  for (const regla of despues.mealRoutines) {
    assert.ok(Array.isArray(regla.weekdays) && regla.weekdays.length, `${regla.id} perdió sus días`);
    assert.ok(regla.momento, `${regla.id} perdió su momento`);
  }
});

test('cada comida sigue pudiendo decir de dónde vino, aunque eso ya no se produzca', () => {
  const despues = importState(CRUDO);
  const origenes = new Set(despues.plans.map(plan => plan.origen));
  for (const origen of ['rutina', 'sugerida', 'mes-anterior', 'manual', 'excepcion']) {
    assert.ok(origenes.has(origen), `se perdieron las comidas con origen «${origen}»`);
  }
  assert.equal(despues.plans.filter(plan => plan.routineId).length, 19,
    'las comidas dejaron de apuntar a la regla que las puso');
  // Y la regla a la que apuntan existe: una marca que no lleva a ninguna parte
  // es peor que ninguna marca.
  const reglas = new Set(despues.mealRoutines.map(regla => regla.id));
  for (const plan of despues.plans.filter(item => item.routineId)) {
    assert.ok(reglas.has(plan.routineId), `${plan.id} apunta a la regla ${plan.routineId}, que no existe`);
  }
});

test('abrir esta casa no pone ni una comida: las reglas ya no rellenan nada', () => {
  const antes = leer();
  const primera = importState(CRUDO);
  assert.equal(primera.plans.length, antes.plans.length);

  // El mes que las reglas cubren —todas son de domingos, lunes, miércoles y
  // viernes— y los dos siguientes, que nunca se abrieron. Abrir, leer el
  // progreso y volver a mirar no puede crear nada.
  for (const mes of ['2026-08', '2026-09', '2026-10']) {
    monthProgress(primera, mes);
  }
  assert.equal(primera.plans.length, antes.plans.length,
    'mirar el mes puso comidas');

  // Septiembre y octubre son meses que las reglas permanentes habrían llenado.
  // Tienen que seguir como estaban: vacíos.
  const deSeptiembre = primera.plans.filter(plan => plan.date.startsWith('2026-09'));
  const deOctubre = primera.plans.filter(plan => plan.date.startsWith('2026-10'));
  assert.equal(deSeptiembre.length, 0, 'septiembre se llenó solo');
  assert.equal(deOctubre.length, 0, 'octubre se llenó solo');
  assert.equal(planFor(primera, '2026-09-07', 'desayuno'), undefined,
    'el lunes 7 de septiembre lo llenó la regla de los lunes');
});

test('migrar dos veces da exactamente lo mismo', () => {
  const primera = migrate(leer());
  assert.ok(primera.ok);
  const segunda = migrate(structuredClone(primera.state));
  assert.ok(segunda.ok);
  assert.deepEqual(segunda.state, primera.state);
  assert.equal(segunda.migrated, false, 'la segunda pasada dice que migró algo');
});

test('exportar y volver a importar devuelve la misma casa', () => {
  const abierta = importState(CRUDO);
  assert.deepEqual(importState(exportState(abierta)), abierta);
});

test('no hay ids repetidos después de abrirla', () => {
  const despues = importState(CRUDO);
  for (const clave of ['products', 'people', 'recipes', 'plans', 'mealRoutines', 'listasDeCompra', 'closedPeriods']) {
    const ids = despues[clave].map(item => item.id);
    assert.equal(new Set(ids).size, ids.length, `hay ids repetidos en ${clave}`);
  }
});

test('el modelo ya no exporta nada que llene el calendario solo', async () => {
  const modelo = await import('../src/model.js');
  const prohibidas = ['generateMonth', 'repeatWeek', 'applyRoutine', 'applyRoutines', 'openMonth', 'copyPatternFromMonth', 'extenderAMesesAbiertos', 'shoppingList'];
  for (const nombre of prohibidas) {
    assert.equal(modelo[nombre], undefined,
      `«${nombre}» volvió al modelo: la app no puede volver a decidir por la casa`);
  }
  // Y el archivo donde vivían tampoco puede volver.
  const { access } = await import('node:fs/promises');
  await assert.rejects(access(join(AQUI, '..', 'src', 'routines.js')),
    'src/routines.js volvió a existir');
});
