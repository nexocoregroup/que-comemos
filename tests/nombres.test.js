// Decidir si dos nombres son el mismo alimento es de las pocas cosas de esta
// app que, hecha mal, no se ve: no hay pantalla en blanco ni mensaje de error.
// Simplemente aparece «Galletas dulces» dos veces en la lista de la compra, y
// la casa se entera semanas después.
//
// Durante un tiempo hubo dos gramáticas —una en `nombres.js` y otra en
// `text-parse.js`— y discrepaban. Estas pruebas están para que no vuelva a
// haber dos, y para que la que queda no se rompa por los lados.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeName, singular, presentar, similarity, containsWords } from '../src/nombres.js';
import { normalizeName as normalizeDeTextParse } from '../src/text-parse.js';
import { createEmptyState, addProduct, productByName } from '../src/model.js';
import { SEED_PRODUCTS } from '../src/catalog-seed.js';

test('«galleta dulce» encuentra las «Galletas dulces» que ya están guardadas', () => {
  const state = createEmptyState();
  addProduct(state, { name: 'Galletas dulces', category: 'otros', controlUnit: 'paquete', purchaseUnit: 'paquete' });

  // Las cuatro formas en que alguien escribe lo mismo tienen que llegar al
  // mismo alimento. La que fallaba era el singular.
  for (const escrito of ['Galletas dulces', 'galletas dulces', 'galleta dulce', 'Galleta dulce']) {
    assert.equal(productByName(state, escrito)?.name, 'Galletas dulces', `no encontró «${escrito}»`);
  }
});

test('el plural en -ces solo pierde la «c» cuando de verdad venía de una «z»', () => {
  // La regla vieja aplicaba «-ces → -z» a todo, y convertía «dulces» en «dulz».
  assert.equal(singular('dulces'), 'dulce');
  assert.equal(singular('nueces'), 'nuez');
  assert.equal(singular('peces'), 'pez');
  assert.equal(singular('luces'), 'luz');
  assert.equal(singular('arroces'), 'arroz');
});

test('el plural en -es devuelve la tilde al singular agudo, pero no se la inventa', () => {
  assert.equal(singular('jamones'), 'jamón');
  assert.equal(singular('limones'), 'limón');
  assert.equal(singular('melones'), 'melón');
  // Corta, así que no lleva tilde.
  assert.equal(singular('panes'), 'pan');
  // Termina en vocal: pierde solo la «s».
  assert.equal(singular('tomates'), 'tomate');
});

test('los días de la semana y los invariables no se quedan sin su «s»', () => {
  for (const palabra of ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'país', 'anís']) {
    assert.equal(singular(palabra), palabra, `«${palabra}» perdió la «s»`);
  }
});

test('la clave ignora tildes, mayúsculas, puntuación y la eñe', () => {
  assert.equal(normalizeName('PIÑA'), normalizeName('pina'));
  assert.equal(normalizeName('Plátano'), normalizeName('platanos'));
  assert.equal(normalizeName('Arroz (integral)'), 'arroz integral');
  assert.equal(normalizeName('  jamón,  queso '), 'jamon queso');
  assert.equal(normalizeName(''), '');
  assert.equal(normalizeName(null), '');
});

test('el nombre que se enseña conserva la tilde y una sola mayúscula', () => {
  assert.equal(presentar('JAMONES'), 'Jamón');
  assert.equal(presentar('galletas dulces'), 'Galleta dulce');
  assert.equal(presentar(''), '');
});

test('hay una sola gramática: la de text-parse.js es la de nombres.js', () => {
  // La misma función, no dos que coinciden hoy.
  assert.equal(normalizeDeTextParse, normalizeName);

  // Y que el archivo no vuelva a definir la suya: el día que alguien escriba
  // otro `function singular` aquí, esta prueba lo dice antes de que discrepen.
  const fuente = readFileSync(new URL('../src/text-parse.js', import.meta.url), 'utf8');
  assert.ok(!/^(?:export )?function singular\b/m.test(fuente), 'text-parse.js volvió a tener su propio singular');
  assert.ok(!/^(?:export )?function normalizeName\b/m.test(fuente), 'text-parse.js volvió a tener su propio normalizeName');
});

test('ningún alimento del catálogo choca con otro al normalizar', () => {
  // Dos semillas distintas con la misma clave serían dos filas que la app
  // trataría como la misma cosa nada más crearlas.
  const porClave = new Map();
  for (const semilla of SEED_PRODUCTS) {
    const clave = normalizeName(semilla.name);
    assert.ok(clave, `«${semilla.name}» normaliza a cadena vacía`);
    const antes = porClave.get(clave);
    assert.equal(antes, undefined, `«${semilla.name}» y «${antes}» comparten la clave «${clave}»`);
    porClave.set(clave, semilla.name);
  }
});

test('el parecido y la contención siguen midiendo sobre la clave', () => {
  assert.equal(similarity('Plátano', 'platanos'), 1);
  assert.ok(similarity('arroz', 'detergente') < 0.4);
  assert.ok(containsWords('Plátano', 'Plátanos maduros'));
  assert.ok(!containsWords('arroz', 'habichuelas negras'));
});
