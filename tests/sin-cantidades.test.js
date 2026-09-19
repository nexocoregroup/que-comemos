// Mis productos habituales dejó de preguntar cuánto se compra al mes.
//
// Esa cifra era el presupuesto con el que la app calculaba sola la lista de la
// compra: consumo del mes menos lo que hay en casa. La cuenta se retiró en la
// Fase 1 y el campo se quedó, preguntando por un dato que ya no alimentaba
// nada. Un campo así es peor que no tenerlo: quien lo ve cree que sirve.
//
// Lo que estas pruebas defienden son las dos mitades del cambio:
//
//   1. Que no se pida. Ni en la fila, ni en la ficha del producto, ni un clic
//      más adentro en «escribirlos de corrido».
//   2. Que lo que ya estaba escrito siga escrito. Las cantidades viejas son con
//      las que se calcularon los meses que ya se cerraron, y tirarlas dejaría el
//      historial contando otra cosa.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  addProduct, agregarHabitual, choquesDeLaComida, createEmptyState, habitualLines, habitualesPorRubro,
  makeRecipePlan, product, productByName, removeHabitualLine, rubroDe, setHabitualLine, setMonthChange,
  todayISO, upsertPerson, upsertRecipe
} from '../src/model.js';
import { createDemoState } from '../src/demo.js';
import { emptyMas, renderMas } from '../src/page-mas.js';

const MES = todayISO().slice(0, 7);
const mesesAntes = n => {
  const [ano, mes] = MES.split('-').map(Number);
  const total = ano * 12 + (mes - 1) - n;
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`;
};

const APP = readFileSync('src/app.js', 'utf8');

function contexto(state, page = 'canasta') {
  return {
    state,
    ui: { page, modal: null, mas: emptyMas() },
    commit: () => {}, toast: () => {}, render: () => {}, openModal: () => {}, closeModal: () => {}
  };
}

// Una casa con tres productos habituales, uno de ellos con la cantidad mensual
// que se escribió cuando todavía se preguntaba.
function casa() {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb', category: 'granos' });
  const salami = addProduct(state, { name: 'Salami', controlUnit: 'rueda', purchaseUnit: 'rueda', category: 'embutidos' });
  const platano = addProduct(state, { name: 'Plátano', controlUnit: 'unidad', purchaseUnit: 'unidad', category: 'viveres' });
  setHabitualLine(state, arroz.id, 20, 'lb', null, mesesAntes(3));
  agregarHabitual(state, { productId: salami.id });
  agregarHabitual(state, { productId: platano.id });
  return { state, arroz: arroz.id, salami: salami.id, platano: platano.id };
}

/* ── 1. Que no se pida ─────────────────────────────────────────────────── */

test('la pantalla de los habituales no tiene ni un campo de cantidad', () => {
  const { state } = casa();
  const html = renderMas(contexto(state));

  assert.ok(html.includes('Arroz') && html.includes('Salami') && html.includes('Plátano'),
    'la lista dejó de enseñar los productos');
  // Lo que se pedía: un número por producto y una medida al lado.
  assert.ok(!/type="number"/.test(html), 'volvió un campo numérico a la lista de productos');
  assert.ok(!/name="cantidad-/.test(html), 'volvió la cantidad por producto');
  assert.ok(!/name="unidad-/.test(html), 'volvió la medida por producto');
  assert.ok(!/<select/.test(html), 'volvió un desplegable a una pantalla que es una lista de nombres');
  // De hecho no queda ningún campo que PIDA nada de un producto: la pantalla
  // dejó de ser un formulario. El buscador es la excepción y es de otra
  // naturaleza —no escribe nada, filtra lo que ya está—, así que se nombra
  // aquí en vez de debilitar la aserción hasta que pase cualquier cosa.
  const campos = [...html.matchAll(/<input[^>]*>/g)]
    .map(encaje => encaje[0])
    .filter(campo => !/type="search"/.test(campo));
  assert.deepEqual(campos, [], 'volvió un campo a una pantalla que es una lista de nombres');
  assert.ok(!/type="submit"/.test(html), 'volvió un botón de guardar a una lista que se guarda sola');
  // Y se dice, porque quien venía de la versión anterior lo va a buscar.
  assert.ok(/no se apuntan cantidades/i.test(html), 'la pantalla no explica que ya no se apuntan cantidades');
});

test('la cantidad escrita hace tres meses no se enseña, pero sigue guardada', () => {
  const { state, arroz } = casa();
  const html = renderMas(contexto(state));

  // 20 libras de arroz están en el estado y no en la pantalla. Se mira el
  // texto y no el marcado: los iconos de los rubros traen sus propias medidas
  // dentro —width="20"— y buscar un 20 a secas encontraría uno de esos.
  const visible = html.replace(/<[^>]*>/g, ' ');
  assert.equal(habitualLines(state).find(linea => linea.productId === arroz).quantity, 20,
    'la cantidad vieja se perdió al cambiar la pantalla');
  assert.ok(!/\b20\b/.test(visible), 'la cantidad vieja volvió a la pantalla');
  assert.ok(!/\blb\b/.test(visible), 'la medida vieja volvió a la pantalla');
});

test('no hay dos vistas ni un mes que pasar: es una lista y ya', () => {
  const { state } = casa();
  const html = renderMas(contexto(state));
  assert.ok(!/Cambios de este mes/.test(html), 'volvió la vista de los cambios del mes');
  assert.ok(!/canasta-vista|canasta-mes|canasta-nuevo-cambio/.test(html), 'volvió algún control de la canasta mensual');
  assert.ok(!/Lo de siempre/.test(html), 'volvió el interruptor entre las dos vistas');
});

test('un extra de un mes viejo no se cuela en la lista, y tampoco se borra', () => {
  const { state } = casa();
  const cangrejo = addProduct(state, { name: 'Cangrejo', controlUnit: 'lb', purchaseUnit: 'lb', category: 'mar' });
  setMonthChange(state, MES, cangrejo.id, { quantity: 4, unit: 'lb' });

  const html = renderMas(contexto(state));
  assert.ok(!html.includes('Cangrejo'), 'lo de un solo mes no es habitual y no puede aparecer como tal');
  // Pero el dato sigue donde estaba: no se enseña, no se destruye.
  assert.equal(state.monthOverrides[MES].changes.length, 1, 'el cambio del mes se borró al retirar la pantalla');
});

test('los productos salen agrupados por el mismo rubro en el que se marcaron', () => {
  const { state } = casa();
  const html = renderMas(contexto(state));
  assert.ok(html.includes('Arroz, granos y pastas'), 'falta el rubro del arroz');
  assert.ok(html.includes('Víveres'), 'falta el rubro del plátano');
  assert.ok(html.includes('Carnes y proteínas'), 'falta el rubro del salami');
  // Y el orden es el de los ocho rubros, el mismo del registro y de la compra.
  assert.ok(html.indexOf('Víveres') < html.indexOf('Arroz, granos y pastas'),
    'los rubros salen en un orden distinto al de las otras dos pantallas');
});

/* ── La ficha de un producto ───────────────────────────────────────────── */

test('la ficha de un producto pregunta tres cosas, y ninguna es una medida', () => {
  const ficha = APP.slice(APP.indexOf('function modalProducto'), APP.indexOf('function modalDiagnostico'));

  assert.ok(/name="name"/.test(ficha), 'la ficha no pregunta el nombre');
  assert.ok(/name="rubro"/.test(ficha), 'la ficha no pregunta en qué rubro se busca');
  assert.ok(/name="nota"/.test(ficha), 'la ficha no deja escribir una nota para la compra');

  for (const campo of ['monthly', 'monthlyUnit', 'controlUnit', 'purchaseUnit', 'factor', 'opening', 'slice', 'destino']) {
    assert.ok(!new RegExp(`name="${campo}"`).test(ficha), `la ficha volvió a preguntar «${campo}»`);
  }
});

test('guardar la ficha escribe en los habituales, no en ninguna canasta mensual', () => {
  const guardado = APP.slice(APP.indexOf("else if (kind === 'product')"), APP.indexOf("else if (kind === 'recipe-note')"));
  assert.ok(/agregarHabitual\(/.test(guardado), 'un producto nuevo ya no entra en los habituales');
  assert.ok(/actualizarHabitual\(/.test(guardado), 'editar uno no guarda su rubro ni su nota');
  assert.ok(!/setHabitualLine|setMonthChange/.test(guardado), 'volvió a escribirse una cantidad mensual');
});

// Los comentarios sí pueden nombrarlo: explicar por qué un campo se fue es
// justo lo que hay que dejar escrito. Lo que no puede es llegar a la pantalla.
const sinComentarios = fuente => fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('ninguna pantalla pide ya el consumo del mes', () => {
  for (const archivo of ['src/app.js', 'src/page-mas.js', 'src/setup.js', 'src/page-compra.js']) {
    const fuente = sinComentarios(readFileSync(archivo, 'utf8'));
    assert.ok(!/name="monthly"/.test(fuente), `${archivo} pide el consumo del mes`);
    assert.ok(!/consumo del mes/i.test(fuente), `${archivo} habla del consumo del mes`);
    assert.ok(!/¿Cuánto se compra?|Cantidad al mes/i.test(fuente), `${archivo} sigue preguntando cuánto se compra al mes`);
  }
});

/* ── 2. Que lo viejo siga estando ──────────────────────────────────────── */

test('un producto habitual se guarda sin ninguna cantidad', () => {
  const state = createEmptyState();
  const linea = agregarHabitual(state, { name: 'Yautía', rubro: 'viveres' });

  assert.ok(linea, 'no se pudo guardar sin cantidad');
  const guardada = habitualLines(state).find(fila => fila.productId === linea.productId);
  assert.equal(guardada.quantity, null, 'se inventó una cantidad');
  assert.equal(rubroDe(state, linea.productId), 'viveres', 'no se guardó en el rubro que se dijo');
  assert.ok(habitualesPorRubro(state).some(grupo => grupo.rubro === 'viveres'), 'no aparece en su rubro');
});

test('quitar uno de la lista no borra lo que se compró antes', () => {
  const { state, arroz } = casa();
  const antes = mesesAntes(2);

  assert.ok(habitualLines(state, antes).some(linea => linea.productId === arroz), 'el arroz no estaba hace dos meses');
  removeHabitualLine(state, arroz);

  assert.ok(!habitualLines(state).some(linea => linea.productId === arroz), 'sigue en la lista de hoy');
  assert.ok(habitualLines(state, antes).some(linea => linea.productId === arroz),
    'quitarlo de la lista de hoy reescribió los meses que ya pasaron');
  assert.ok(product(state, arroz), 'el alimento desapareció del catálogo');
});

test('volver a nombrar algo que ya tiene cantidad escrita no se la borra', () => {
  const { state, arroz } = casa();
  agregarHabitual(state, { productId: arroz });
  assert.equal(habitualLines(state).find(linea => linea.productId === arroz).quantity, 20,
    'apuntarlo otra vez le borró la cantidad que tenía');
});

/* ── 3. Dentro de una comida tampoco ───────────────────────────────────────

   El formulario de una preparación dejó de preguntar la cantidad en la Fase 1,
   pero las pantallas seguían pintando la que trajera el dato. Una casa que
   viene de la versión anterior —y el propio ejemplo— veía «Huevo · 4 unidades»
   en una ficha donde nadie puede escribir ese 4.

   Los alimentos se quedan: son lo que permite avisar de una alergia. Lo que se
   va es la medida. */

// Una preparación con cantidades escritas, como las que trae una casa vieja.
function conPorciones() {
  const state = createEmptyState();
  const huevo = addProduct(state, { name: 'Huevo', controlUnit: 'unidad', purchaseUnit: 'unidad', category: 'lacteos' }).id;
  const jamon = addProduct(state, { name: 'Jamón', controlUnit: 'rebanada', purchaseUnit: 'rebanada', category: 'embutidos' }).id;
  const receta = upsertRecipe(state, {
    name: 'Huevos con jamón', uses: ['desayuno', 'cena'], note: '',
    items: [{ productId: huevo, quantity: 4, unit: 'unidad' }, { productId: jamon, quantity: 4, unit: 'rebanada' }]
  });
  return { state, receta, huevo, jamon };
}

test('la ficha de una preparación dice qué lleva, no cuánto', () => {
  const { state, receta } = conPorciones();
  const html = renderMas(contexto(state, 'preparaciones'));

  assert.ok(html.includes('Huevo') && html.includes('Jamón'), 'la ficha dejó de decir qué lleva');
  const visible = html.replace(/<[^>]*>/g, ' ');
  assert.ok(!/4 unidades|4 rebanadas/.test(visible), 'la ficha vuelve a pintar las porciones');
  assert.ok(!/·\s*\d/.test(visible), 'quedó alguna medida pegada a un alimento');

  // Y el dato sigue guardado: no se enseña, no se destruye.
  assert.equal(state.recipes.find(item => item.id === receta.id).items[0].quantity, 4,
    'la porción vieja se perdió al cambiar la pantalla');
});

test('los alimentos siguen sirviendo para lo que sirven: avisar de una alergia', () => {
  const { state, huevo } = conPorciones();
  const persona = upsertPerson(state, { name: 'Sofía', kind: 'nino', restricciones: [{ productId: huevo, motivo: 'alergia' }] });
  const receta = state.recipes[0];
  const plan = makeRecipePlan(state, receta.id, todayISO(), 'desayuno', [persona.id]);

  const choques = choquesDeLaComida(state, plan.items, plan.participants);
  assert.ok(choques.length, 'una comida con huevo dejó de avisar a quien es alérgico al huevo');
  assert.equal(choques[0].productId, huevo);
});

test('el ejemplo que ve alguien nuevo no trae ni una porción', () => {
  const state = createDemoState();
  const conCantidad = state.recipes.flatMap(receta => receta.items).filter(item => item.quantity !== undefined && item.quantity !== null);
  assert.deepEqual(conCantidad, [], 'el ejemplo vuelve a sugerir que hay que anotar porciones');

  const html = renderMas(contexto(state, 'preparaciones')).replace(/<[^>]*>/g, ' ');
  assert.ok(!/·\s*\d+\s*(unidad|rebanada|taza|lb|lata|rueda)/.test(html), 'el ejemplo pinta medidas en sus preparaciones');
});

test('la ficha de una persona ya no dice cuánto come', () => {
  const { state, huevo } = conPorciones();
  upsertPerson(state, { name: 'Luis', kind: 'adulto', restricciones: [], habitual: [{ productId: huevo, quantity: 2, unit: 'unidad' }] });

  const html = renderMas(contexto(state, 'familia'));
  assert.ok(html.includes('Luis'), 'la persona desapareció de la familia');
  assert.ok(!/Come normalmente/.test(html), 'volvió «come normalmente»');
  // Guardado sigue estando: era de cuando la app repartía raciones.
  assert.equal(state.people[0].habitual.length, 1, 'se borró lo que la persona tenía escrito');
});

test('no queda ninguna fila donde escribir cuánto lleva una comida', () => {
  // Hay una sola fila de alimento, y no tiene dónde. Esto es más fuerte que
  // comprobar que las pantallas no la pintan: si no hay campo, no hay manera.
  const fila = APP.slice(APP.indexOf('function itemRow'), APP.indexOf('function itemRow') + 900);
  assert.ok(!/name="quantity"/.test(fila), 'la fila de un alimento vuelve a pedir cuánto');
  assert.ok(!/name="unit"/.test(fila), 'vuelve a pedir la medida');
  assert.ok(!/name="personId"/.test(fila), 'volvió el «para quién» por alimento');

  // Y lo que lee esas filas tampoco busca ninguna cantidad.
  const lector = APP.slice(APP.indexOf('function collectItems'), APP.indexOf('const formValues'));
  assert.ok(!/quantity|unit/.test(lector), 'volvió a leerse una cantidad del formulario');

  // Al guardar, lo que ya estaba no se toca.
  const guardado = APP.slice(APP.indexOf("else if (kind === 'plan')"), APP.indexOf("else if (kind === 'sobras')"));
  assert.ok(/antes\.get\(item\.id\)/.test(guardado), 'guardar una comida vieja le borraría lo que traía');
});
