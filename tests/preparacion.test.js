// El formulario de una preparación, y lo que el nombre ya dice.
//
// Había dos formularios para la misma cosa. El del recorrido inicial preguntaba
// el nombre, los momentos y la nota; el de la sección Preparaciones preguntaba
// además qué alimentos lleva. O sea que quien registraba su casa por primera vez
// —la persona a la que más le costaría volver— escribía sus preparaciones a
// medias sin enterarse, y los avisos de alergia de esa casa no funcionaban hasta
// que alguien las abriera una por una en el otro sitio.
//
// Y aunque las escribiera en el sitio bueno, había que elegir cada alimento en
// un desplegable de setenta. «Mangú de plátano maduro con salami» ya nombra dos;
// pedir que se vuelvan a elegir es pedir que se escriba dos veces lo mismo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { addProduct, alimentosEnElTexto, createEmptyState, upsertRecipe } from '../src/model.js';
import { camposDePreparacion, leerPreparacion, opcionesDeAlimento } from '../src/preparacion.js';

const fuente = nombre => readFileSync(resolve(import.meta.dirname, '..', 'src', nombre), 'utf8');

function casa() {
  const state = createEmptyState();
  const id = {};
  for (const [clave, nombre, categoria] of [
    ['maduro', 'Plátano maduro', 'viveres'],
    ['verde', 'Plátano verde', 'viveres'],
    ['salami', 'Salami', 'embutidos'],
    ['papa', 'Papa', 'viveres'],
    ['queso', 'Queso', 'lacteos'],
    ['arroz', 'Arroz', 'granos']
  ]) {
    id[clave] = addProduct(state, { name: nombre, category: categoria, controlUnit: 'unidad', purchaseUnit: 'unidad' }).id;
  }
  return { state, id };
}

/* ── Lo que el nombre ya dice ──────────────────────────────────────────── */

test('de «mangú de plátano maduro con salami» salen los dos alimentos', () => {
  const { state } = casa();
  const salen = texto => alimentosEnElTexto(state, texto).map(item => item.name);

  assert.deepEqual(salen('Mangú de plátano maduro con salami'), ['Plátano maduro', 'Salami']);
  // Sin tildes y en minúsculas, que es como se escribe con prisa.
  assert.deepEqual(salen('mangu de platano verde'), ['Plátano verde']);
  assert.deepEqual(salen('Puré de papa con queso'), ['Papa', 'Queso']);
  // Un plato que no nombra nada no inventa nada.
  assert.deepEqual(salen('Locrio'), []);
  assert.deepEqual(salen(''), []);
});

test('el nombre largo le gana al corto, y ninguna palabra se reparte', () => {
  /* «Plátano maduro» tiene que ganarle a «Plátano», o un mangú de maduro
     acabaría diciendo que lleva plátano a secas, que en esta isla es otro
     alimento. Y una vez que esas dos palabras son del maduro, ya no pueden ser
     también del verde. */
  const { state } = casa();
  addProduct(state, { name: 'Plátano', category: 'viveres', controlUnit: 'unidad', purchaseUnit: 'unidad' });

  assert.deepEqual(alimentosEnElTexto(state, 'Mangú de plátano maduro').map(item => item.name),
    ['Plátano maduro'], 'el nombre corto se comió al largo');
  assert.deepEqual(alimentosEnElTexto(state, 'Tostones de plátano').map(item => item.name), ['Plátano']);
});

test('salen en el orden en que se dijeron, y ninguno dos veces', () => {
  const { state } = casa();
  assert.deepEqual(alimentosEnElTexto(state, 'Salami con plátano maduro').map(item => item.name),
    ['Salami', 'Plátano maduro'], 'salen en el orden del catálogo y no en el que se escribieron');
  assert.deepEqual(alimentosEnElTexto(state, 'Arroz con arroz').map(item => item.name), ['Arroz']);
});

test('un alimento archivado no se propone', () => {
  const { state, id } = casa();
  state.products.find(item => item.id === id.salami).archived = true;
  assert.deepEqual(alimentosEnElTexto(state, 'Mangú con salami').map(item => item.name), []);
});

/* ── Un solo formulario ────────────────────────────────────────────────── */

test('el recorrido y la sección escriben la preparación con el mismo formulario', () => {
  // Dos formularios para la misma cosa son dos sitios donde olvidarse de
  // preguntar algo, y así fue: el del recorrido nunca preguntó los alimentos.
  for (const nombre of ['app.js', 'setup.js']) {
    assert.ok(/camposDePreparacion\(/.test(fuente(nombre)), `${nombre} volvió a escribir su propio formulario`);
    assert.ok(/leerPreparacion\(/.test(fuente(nombre)), `${nombre} volvió a leer los campos por su cuenta`);
  }
  // Y ninguno de los dos vuelve a tener un campo de preparación escrito a mano.
  const archivos = readdirSync(resolve(import.meta.dirname, '..', 'src')).filter(item => item.endsWith('.js') && item !== 'preparacion.js');
  for (const archivo of archivos) {
    assert.ok(!/data-item-list="receta"/.test(fuente(archivo)),
      `${archivo} volvió a pintar las filas de alimentos por su cuenta`);
  }
});

test('el formulario pregunta las cuatro cosas, y ninguna más', () => {
  const { state, id } = casa();
  const receta = upsertRecipe(state, {
    name: 'Mangú', uses: ['desayuno'], items: [{ productId: id.maduro }], note: 'Agua bien caliente'
  });
  const html = camposDePreparacion(state, receta);

  assert.ok(html.includes('name="nombre"'), 'no pregunta cómo se llama');
  assert.ok(html.includes('name="momentos"'), 'no pregunta en qué momentos se come');
  assert.ok(html.includes('data-item-list="receta"'), 'no pregunta qué alimentos lleva');
  assert.ok(html.includes('name="nota"'), 'no deja dejar una nota');
  // Lo que se retiró no vuelve por aquí.
  assert.ok(!/name="servings"/.test(html), 'vuelve a preguntar cuántas porciones rinde');
  assert.ok(!/name="participants"/.test(html), 'vuelve a preguntar quiénes la comen');
  assert.ok(!/name="quantity"|name="unit"/.test(html), 'vuelve a preguntar cuánto lleva de cada alimento');

  // Y lo que ya tenía viene puesto: sin esto, editar borraría los alimentos.
  assert.ok(html.includes(`value="${id.maduro}" selected`), 'el alimento que ya tenía no viene elegido');
  assert.ok(html.includes('value="Mangú"'), 'el nombre que ya tenía no viene escrito');
  assert.ok(html.includes('Agua bien caliente'), 'la nota que ya tenía no viene escrita');
});

test('el ejemplo del nombre cabe en el campo y nombra alimentos de verdad', () => {
  /* Esta prueba pedía antes que el marcador dijera «de plátano maduro», y por
     eso el marcador era «Ej. Mangú de plátano maduro con salami». En un
     teléfono de 375 px eso son 329 px de texto en un hueco de 279: el campo lo
     cortaba en «con sal» y se leía como otra receta, con un ingrediente que
     además nadie registra como producto.

     El motivo de la prueba no era la frase, era que el ejemplo enseñe a
     escribir un nombre del que se puedan sacar los alimentos solos. Eso se
     comprueba mejor de dos maneras: que del marcador salgan alimentos del
     catálogo, y que la lección de «di de qué es» siga estando donde sí se lee
     entera, que es la ayuda de debajo del campo. */
  const { state } = casa();
  const html = camposDePreparacion(state, {});
  const marcador = /placeholder="([^"]*)"/.exec(html)?.[1] || '';

  assert.ok(marcador.length <= 30,
    `el ejemplo no cabe en el campo de un teléfono estrecho: «${marcador}» son ${marcador.length} caracteres`);
  assert.deepEqual(alimentosEnElTexto(state, marcador.replace(/^Ej\.\s*/, '')).map(item => item.name),
    ['Plátano maduro', 'Salami'], `del ejemplo ya no salen dos alimentos del catálogo: «${marcador}»`);
  assert.ok(!/\bsal\b/i.test(marcador), 'el ejemplo vuelve a terminar en algo que no es un producto');

  /* Y la ayuda de debajo sigue diciendo qué hay que escribir. Decía «di de qué
     es», que es una regla de gramática; ahora nombra las dos partes de un plato
     —el principal y lo que lo acompaña—, que es como se piensa una comida. Lo
     que no puede pasar es que deje de pedir las dos: con una sola, el
     autorrelleno encuentra un alimento y parece roto. */
  assert.match(html, /alimento principal/i, 'la ayuda dejó de pedir el alimento principal');
  assert.match(html, /acompañantes/i, 'la ayuda dejó de pedir los acompañantes');
});

test('los alimentos salen agrupados por rubro y ordenados por nombre', () => {
  const { state } = casa();
  const html = opcionesDeAlimento(state, '');
  assert.ok(html.includes('<optgroup'), 'el desplegable volvió a ser plano');
  const viveres = /<optgroup label="Víveres">([\s\S]*?)<\/optgroup>/.exec(html)?.[1] || '';
  const nombres = [...viveres.matchAll(/>([^<]+)<\/option>/g)].map(encaje => encaje[1]);
  assert.deepEqual(nombres, [...nombres].sort((a, b) => a.localeCompare(b, 'es')), 'dentro de un rubro no van por orden');
});

/* ── Leer lo escrito ───────────────────────────────────────────────────── */

test('leerPreparacion lee los cuatro campos, vengan de donde vengan', () => {
  const formulario = {
    querySelector: () => null,
    querySelectorAll: () => [
      { querySelector: selector => ({ value: selector.includes('itemId') ? '' : 'producto-1' }) },
      // Una fila en blanco no entra: es la que deja «+ Añadir alimento».
      { querySelector: () => ({ value: '' }) }
    ]
  };
  const datos = new FormData();
  datos.set('nombre', '  Locrio de pollo  ');
  datos.append('momentos', 'almuerzo');
  datos.append('momentos', 'cena');
  datos.set('nota', 'Dejar una parte');

  const leida = leerPreparacion(formulario, datos);
  assert.equal(leida.name, 'Locrio de pollo', 'no se limpian los espacios');
  assert.deepEqual(leida.uses, ['almuerzo', 'cena']);
  assert.equal(leida.note, 'Dejar una parte');
  assert.deepEqual(leida.items, [{ id: undefined, productId: 'producto-1' }], 'una fila en blanco se coló');
});

test('leerPreparacion aguanta un Map, que es lo que llega en las pruebas', () => {
  // Un `Map` no tiene `getAll`. Dar por hecho de qué clase es lo que llega es
  // como se rompen las pruebas del recorrido inicial, que llaman a los envíos a
  // mano y sin navegador.
  const leida = leerPreparacion(null, new Map([['nombre', 'Sancocho'], ['momentos', 'almuerzo']]));
  assert.equal(leida.name, 'Sancocho');
  assert.deepEqual(leida.uses, ['almuerzo']);
  assert.deepEqual(leida.items, []);
});
