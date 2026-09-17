// El respaldo de antes de la etapa 1, y la promesa de que no se perdió nada.
//
// En `tests/fixtures/` hay dos estados congelados en la versión 8 del esquema:
// una casa completa —con su historial de compras, sus revisiones, un período
// cerrado y una regla que valía para tres momentos del día— y el ejemplo que
// trae la aplicación. Se generaron antes de tocar una sola línea del modelo.
//
// `SUMAS-v8.txt` es su huella. Sirve para dos cosas distintas:
//
//  · Para que nadie los edite sin querer. Un patrón que se puede retocar no es
//    un patrón: mañana alguien lo ajusta para que pase una prueba y el respaldo
//    deja de decir cómo eran las cosas.
//  · Para poder comprobarlo desde fuera, sin la aplicación: `sha256sum -c
//    SUMAS-v8.txt` dentro de esa carpeta da la misma respuesta que esta prueba.
//
// Lo demás de aquí abajo es la pregunta que de verdad importa: al abrir la app
// con esos datos guardados, ¿sigue estando todo?

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SCHEMA_VERSION, migrate } from '../src/migrate.js';
import { importState } from '../src/model.js';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const leer = nombre => readFileSync(join(FIXTURES, nombre), 'utf8');
const sumas = leer('SUMAS-v8.txt').trim().split(/\r?\n/).map(fila => {
  const [suma, nombre] = fila.split(/\s+/);
  return { suma, nombre };
});
const PATRONES = sumas.map(({ nombre }) => nombre);

test('los respaldos congelados son exactamente los que se guardaron', () => {
  for (const { suma, nombre } of sumas) {
    const huella = createHash('sha256').update(leer(nombre), 'utf8').digest('hex');
    assert.equal(huella, suma, `${nombre} no es el archivo que se respaldó: alguien lo tocó después`);
  }
});

test('los dos patrones siguen siendo de la versión 8, la de antes de todo esto', () => {
  // El número está escrito y no calculado a partir de `SCHEMA_VERSION`. Estos
  // archivos son una fotografía de cómo estaban las cosas aquel día: cada
  // esquema nuevo les añade un salto más que recorrer, y eso es precisamente lo
  // que tienen que seguir demostrando que se puede recorrer sin perder nada.
  for (const nombre of PATRONES) {
    assert.equal(JSON.parse(leer(nombre)).version, 8, `${nombre} ya no es el estado de antes`);
  }
  assert.ok(SCHEMA_VERSION > 8, 'si el esquema volviera a la 8 estas pruebas dejarían de comprobar nada');
});

/* ── Abrir una instalación que ya existía ─────────────────────────────────

   Esto es lo que pasa en el teléfono de alguien que tenía la app instalada:
   `importState` migra y valida. Si algo quedara incoherente, lanzaría y el
   estado anterior se quedaría donde estaba. Que no lance ya dice bastante; lo
   que sigue dice qué sobrevivió. */

const migrado = nombre => importState(leer(nombre));

test('una instalación que ya existía abre, y abre en la versión nueva', () => {
  for (const nombre of PATRONES) {
    const despues = migrado(nombre);
    assert.equal(despues.version, SCHEMA_VERSION, `${nombre} no llegó a la versión nueva`);
  }
});

test('no se pierde ni un registro de lo que había escrito', () => {
  for (const nombre of PATRONES) {
    const antes = JSON.parse(leer(nombre));
    const despues = migrado(nombre);
    // Las reglas no están: esas se parten a propósito y se comprueban aparte.
    for (const clave of ['products', 'people', 'recipes', 'plans', 'absences', 'purchases', 'reviews', 'corrections', 'manualItems', 'closedPeriods', 'activity']) {
      assert.equal(despues[clave].length, antes[clave].length, `${nombre}: cambió el número de ${clave}`);
    }
    assert.equal(despues.habitualBasket.lines.length, antes.habitualBasket.lines.length, `${nombre}: cambió la canasta`);
    assert.deepEqual(Object.keys(despues.monthOverrides).sort(), Object.keys(antes.monthOverrides).sort(), `${nombre}: cambiaron los meses con excepciones`);
    assert.deepEqual(Object.keys(despues.monthPlans).sort(), Object.keys(antes.monthPlans).sort(), `${nombre}: cambiaron los meses abiertos`);
  }
});

test('el historial se conserva letra por letra: compras, revisiones, correcciones y cierres', () => {
  // Esto es lo que no se puede volver a preguntar. Un plan del mes que viene se
  // rehace; una compra de agosto, no.
  for (const nombre of PATRONES) {
    const antes = JSON.parse(leer(nombre));
    const despues = migrado(nombre);
    for (const clave of ['purchases', 'reviews', 'corrections', 'closedPeriods', 'opening']) {
      assert.deepEqual(despues[clave], antes[clave], `${nombre}: cambió algo en ${clave}`);
    }
  }
});

test('las cantidades viejas de la canasta siguen ahí, con sus fechas', () => {
  for (const nombre of PATRONES) {
    const antes = JSON.parse(leer(nombre));
    const despues = migrado(nombre);
    for (const linea of antes.habitualBasket.lines) {
      const ahora = despues.habitualBasket.lines.find(row => row.productId === linea.productId);
      assert.ok(ahora, `${nombre}: desapareció una línea de la canasta`);
      assert.deepEqual(ahora.tramos, linea.tramos, `${nombre}: cambiaron los tramos de ${linea.productId}`);
    }
  }
});

test('las preferencias de la casa —hogar, frecuencia de compra, reparto— no se tocan', () => {
  for (const nombre of PATRONES) {
    const antes = JSON.parse(leer(nombre));
    const despues = migrado(nombre);
    assert.deepEqual(despues.settings, antes.settings, `${nombre}: cambiaron las preferencias`);
    assert.equal(despues.demo, antes.demo);
  }
});

/* ── Repetirla no duplica nada ─────────────────────────────────────────── */

test('migrar dos veces da exactamente lo mismo que migrar una', () => {
  for (const nombre of PATRONES) {
    const una = migrate(JSON.parse(leer(nombre)));
    const otra = migrate(una.state);
    assert.ok(otra.ok, `${nombre}: la segunda pasada falló`);
    assert.deepEqual(otra.state, una.state, `${nombre}: la segunda pasada cambió algo`);
    assert.equal(otra.migrated, false, `${nombre}: la segunda pasada dice que migró algo`);
  }
});

test('repetirla no duplica alimentos, preparaciones ni reglas', () => {
  for (const nombre of PATRONES) {
    const una = migrate(JSON.parse(leer(nombre))).state;
    const otra = migrate(migrate(una).state).state;
    for (const clave of ['products', 'recipes', 'mealRoutines', 'habitualBasket']) {
      const cuenta = estado => (clave === 'habitualBasket' ? estado.habitualBasket.lines.length : estado[clave].length);
      assert.equal(cuenta(otra), cuenta(una), `${nombre}: se duplicó algo en ${clave}`);
    }
    // Y los identificadores siguen siendo únicos, que es la otra forma de
    // duplicar: dos registros distintos con el mismo id.
    for (const clave of ['products', 'recipes', 'mealRoutines', 'plans']) {
      const ids = otra[clave].map(item => item.id);
      assert.equal(new Set(ids).size, ids.length, `${nombre}: hay ids repetidos en ${clave}`);
    }
  }
});
