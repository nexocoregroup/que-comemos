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
import { camposDePreparacion, leerPreparacion, loQueSeReconoce, opcionesDeAlimento } from '../src/preparacion.js';

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

test('el formulario pregunta tres cosas, y ninguna más', () => {
  const { state, id } = casa();
  const receta = upsertRecipe(state, {
    name: 'Mangú', uses: ['desayuno'], items: [{ productId: id.maduro }], note: 'Agua bien caliente'
  });
  const html = camposDePreparacion(state, receta);

  assert.ok(html.includes('name="nombre"'), 'no pregunta cómo se llama');
  assert.ok(html.includes('name="momentos"'), 'no pregunta en qué momentos se come');
  assert.ok(html.includes('name="nota"'), 'no deja dejar una nota');
  /* Y NO pregunta qué alimentos lleva: salen del nombre. Tenerlo aquí además
     del nombre era escribir dos veces lo mismo, y el desplegable de setenta
     alimentos era lo más caro de todo el formulario. */
  assert.ok(!html.includes('data-item-list="receta"'), 'volvió el desplegable de alimentos');
  // Lo que se retiró no vuelve por aquí.
  assert.ok(!/name="servings"/.test(html), 'vuelve a preguntar cuántas porciones rinde');
  assert.ok(!/name="participants"/.test(html), 'vuelve a preguntar quiénes la comen');
  assert.ok(!/name="quantity"|name="unit"/.test(html), 'vuelve a preguntar cuánto lleva de cada alimento');

  // Lo que ya tenía se conserva al guardar, no al pintar: lo vigila la prueba
  // de «editar no le borra los alimentos a una preparación».
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
  /* Sin `state` no hay catálogo contra el que mirar el nombre, así que devuelve
     lo que ya había y nada más. Leer un formulario nunca puede ser la operación
     que le borre los alimentos a una preparación guardada. */
  assert.deepEqual(leida.items, [], 'sin catálogo se inventó algún alimento');
});

test('el sancocho: lo que el nombre no dice, lo dice el campo de abajo', () => {
  /* Quitamos el desplegable de alimentos porque el nombre del plato ya dice de
     qué es, y para «plátano maduro con salami» es cierto. No lo es para el
     sancocho, el locrio o un asopao: platos de siete cosas cuyo nombre no
     nombra ninguna, y en esta casa no son la excepción.

     Así que los alimentos salen de los dos campos, y el de abajo se escribe
     con comas en vez de elegirse en una lista de setenta. */
  const { state, id } = casa();
  const sancocho = new Map([
    ['nombre', 'Sancocho'], ['momentos', 'almuerzo'], ['nota', ''],
    ['alimentos', 'papa, arroz, queso']
  ]);
  const leido = leerPreparacion(null, sancocho, state);
  assert.deepEqual(leido.items.map(item => item.productId).sort(), [id.arroz, id.papa, id.queso].sort(),
    'un plato cuyo nombre no dice nada se quedó sin alimentos');
});

test('el nombre y el campo se suman, sin repetir', () => {
  const { state, id } = casa();
  const datos = new Map([
    ['nombre', 'Mangú de plátano maduro con salami'], ['momentos', 'desayuno'], ['nota', ''],
    ['alimentos', 'queso, salami']
  ]);
  const leido = leerPreparacion(null, datos, state);
  assert.deepEqual(leido.items.map(item => item.productId), [id.maduro, id.salami, id.queso],
    'el nombre y el campo no se suman bien');
  assert.equal(new Set(leido.items.map(item => item.productId)).size, leido.items.length,
    'un alimento quedó dos veces');
});

test('borrar una palabra del campo quita ese alimento, y sin campo no se borra nada', () => {
  /* Las dos mitades de la misma regla.

     El campo viene relleno con lo que la preparación ya tiene, así que es un
     ida y vuelta completo: lo que se ve es lo que hay, y quitar un alimento es
     borrar su palabra. Eso solo es seguro porque el campo llega; cuando no
     llega —un envío probado con un `Map` y sin pantalla— se conserva lo que
     había, porque `upsertRecipe` reescribe la ficha entera y leer un
     formulario no puede ser la operación que la vacíe. */
  const { state, id } = casa();

  const conCampo = new Map([['nombre', 'Sancocho'], ['momentos', 'almuerzo'], ['nota', ''], ['alimentos', 'papa']]);
  assert.deepEqual(leerPreparacion(null, conCampo, state, [{ productId: id.queso }]).items.map(i => i.productId),
    [id.papa], 'el campo manda: el queso borrado tenía que irse');

  const sinCampo = new Map([['nombre', 'Sancocho'], ['momentos', 'almuerzo'], ['nota', '']]);
  assert.deepEqual(leerPreparacion(null, sinCampo, state, [{ productId: id.queso }]).items.map(i => i.productId),
    [id.queso], 'sin campo se borraron los alimentos que ya había');
});

test('el campo viene relleno con lo que la preparación ya tiene', () => {
  // Sin esto habría que adivinar qué guardó la app, y quitar algo sería
  // imposible: no se puede borrar una palabra que no está escrita.
  const { state, id } = casa();
  const html = camposDePreparacion(state, { name: 'Sancocho', items: [{ productId: id.papa }, { productId: id.queso }] });
  const campo = /<textarea[^>]*data-preparacion-alimentos[^>]*>([^<]*)<\/textarea>/.exec(html)?.[1];
  assert.equal(campo, 'Papa, Queso', 'el campo no trae los alimentos que ya estaban');
});

test('se dice qué alimentos se reconocieron, para que el silencio no engañe', () => {
  /* Escribir «auyama» cuando el catálogo no la tiene no produce ningún efecto
     ni ningún aviso: la app se calla y quien escribió da por hecho que quedó
     anotada. Es el mismo error que `avisos.js` evita diciendo «no se ha podido
     comprobar», y aquí se paga más caro, porque de estos alimentos salen las
     alergias. */
  const { state } = casa();
  assert.match(loQueSeReconoce(state, 'Sancocho', 'papa, auyama'), /Reconocidos:.*Papa/);
  assert.match(loQueSeReconoce(state, 'Sancocho', 'auyama, mapuey'), /Todavía no reconozco/);
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
