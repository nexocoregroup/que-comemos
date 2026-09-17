// Que el asistente prometa los pasos que luego enseña.
//
// Prometía ocho y enseñaba seis. No fue un descuido de una vez: fue verdad
// cuando se escribió —había ocho pasos, uno de ellos para dictar los alimentos
// de corrido—, y dejó de serlo cuando ese paso se quitó sin tocar la frase. Un
// número escrito a mano en una frase no sabe que alguien cambió una lista en
// otro archivo.
//
// Estas pruebas son lo que lo sabe.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PASO, PASOS, pasosDe, renderSetup } from '../src/setup.js';

// La pantalla de inicio es la que lleva la promesa. Se pide con `paso: 0`, que
// no es un paso sino la portada de antes de empezar.
const portada = setup => renderSetup({ ui: { setup: { paso: 0, elegidos: [], ...setup } } });

const NUMEROS = {
  Un: 1, Dos: 2, Tres: 3, Cuatro: 4, Cinco: 5, Seis: 6, Siete: 7, Ocho: 8, Nueve: 9
};

function prometidos(html) {
  const hit = html.match(/>(\w+) pasos cortos/);
  assert.ok(hit, 'la portada ya no dice cuántos pasos son');
  const n = NUMEROS[hit[1]];
  assert.ok(n, `«${hit[1]}» no es un número que sepamos leer`);
  return n;
}

test('la portada promete los pasos que de verdad se van a enseñar', () => {
  for (const frecuencia of [null, 'mensual', 'quincenal']) {
    const esperados = pasosDe({ frecuencia }).length;
    assert.equal(
      prometidos(portada({ frecuencia })),
      esperados,
      `comprando «${frecuencia}» se enseñan ${esperados} pasos y la portada promete otra cosa`
    );
  }
});

test('ya no hay ningún paso que dependa de una respuesta anterior', () => {
  // Lo que provocó el «ocho pasos y veo seis» fue justo eso: un paso —el del
  // reparto entre quincenas— que solo se le enseñaba a una parte de la gente.
  // Ese paso salió del recorrido, así que la cuenta no puede volver a moverse
  // por lo que alguien conteste a mitad de camino.
  for (const frecuencia of [null, 'mensual', 'quincenal']) {
    assert.deepEqual(
      pasosDe({ frecuencia }).map(paso => paso.id), PASOS.map(paso => paso.id),
      `comprando «${frecuencia}» se ven otros pasos`
    );
  }
});

test('el recorrido es el que se pidió: hogar, productos, compra, preparaciones y el primer plan', () => {
  assert.deepEqual(PASOS.map(paso => paso.id), [PASO.personas, PASO.alimentos, PASO.compra, PASO.preparaciones, PASO.plan]);
  assert.deepEqual(PASOS.map(paso => paso.titulo),
    ['Mi hogar', 'Mis productos habituales', 'Cómo compramos', 'Mis preparaciones', 'Crear mi primer plan']);
});

test('ningún paso se queda sin nombre corto para el indicador', () => {
  for (const paso of PASOS) {
    assert.ok(paso.corto && paso.corto.trim(), `el paso ${paso.id} no tiene nombre corto`);
    assert.ok(paso.titulo && paso.titulo.trim(), `el paso ${paso.id} no tiene título`);
  }
});

test('los identificadores de los pasos no se repiten', () => {
  // Dos pasos con el mismo número hacen que el indicador marque el equivocado
  // y que «atrás» salte a otro sitio.
  const ids = PASOS.map(paso => paso.id);
  assert.equal(new Set(ids).size, ids.length);
});
