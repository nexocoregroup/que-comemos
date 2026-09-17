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
  addProduct, agregarHabitual, createEmptyState, habitualLines, habitualesPorRubro,
  product, productByName, removeHabitualLine, rubroDe, setHabitualLine, setMonthChange, todayISO
} from '../src/model.js';
import { emptyMas, renderMas } from '../src/page-mas.js';
import { BULK_FORMS, emptyBulk, renderBulk } from '../src/bulk-entry.js';

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
  // De hecho no queda ningún campo: la pantalla dejó de ser un formulario.
  assert.ok(!/<input/.test(html), 'volvió un campo a una pantalla que es una lista de nombres');
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
  for (const archivo of ['src/app.js', 'src/page-mas.js', 'src/setup.js', 'src/bulk-entry.js', 'src/page-compra.js']) {
    const fuente = sinComentarios(readFileSync(archivo, 'utf8'));
    assert.ok(!/name="monthly"/.test(fuente), `${archivo} pide el consumo del mes`);
    assert.ok(!/consumo del mes/i.test(fuente), `${archivo} habla del consumo del mes`);
    assert.ok(!/¿Cuánto se compra?|Cantidad al mes/i.test(fuente), `${archivo} sigue preguntando cuánto se compra al mes`);
  }
});

/* ── Escribir varios de corrido ────────────────────────────────────────── */

const datos = pares => ({ get: clave => (clave in pares ? String(pares[clave]) : null) });
const tablaVacia = { querySelectorAll: () => [] };

function bulk(state, destino) {
  const ctx = { state, bulk: emptyBulk(destino), render: () => {}, commit: () => {}, toast: () => {}, closeModal: () => {} };
  return ctx;
}

test('escribir varios de corrido no pide cantidades para los habituales', () => {
  const ctx = bulk(createEmptyState(), 'habitual');
  BULK_FORMS['bulk-texto'](null, datos({ texto: 'Arroz, salami y tres plátanos.', destino: 'habitual' }), ctx);
  const html = renderBulk(ctx);

  assert.ok(html.includes('Arroz') && html.includes('Salami'), 'la tabla perdió las filas');
  assert.ok(!/<th scope="col">Cantidad<\/th>/.test(html), 'volvió la columna de cantidad');
  assert.ok(!/data-bulk-cantidad/.test(html), 'volvió el campo de cantidad en cada fila');
  assert.ok(!/pendiente de cantidad/.test(html), 'una fila sin cantidad vuelve a contarse como algo que falta');
});

test('una compra que ya se hizo sí las pide: ahí la cantidad es un hecho', () => {
  const ctx = bulk(createEmptyState(), 'compra');
  BULK_FORMS['bulk-texto'](null, datos({ texto: 'Compré 5 libras de arroz y atún.', destino: 'compra' }), ctx);
  const html = renderBulk(ctx);

  assert.ok(/<th scope="col">Cantidad<\/th>/.test(html), 'una compra tiene que poder decir cuánto se llevó');
  assert.ok(/data-bulk-cantidad/.test(html), 'falta el campo de cantidad en la compra');
});

test('ya no se puede escribir «solo para un mes concreto»', () => {
  const fuente = readFileSync('src/bulk-entry.js', 'utf8');
  assert.ok(!/Solo para un mes concreto/.test(fuente), 'volvió el destino de un mes suelto');
  assert.ok(!/type="month"/.test(fuente), 'volvió el selector de mes');
  assert.ok(!/setMonthChange/.test(fuente), 'volvió a escribirse un cambio de mes');
});

test('lo escrito de corrido entra sin cantidad, y no pisa la que ya había', () => {
  const { state, arroz } = casa();
  const ctx = bulk(state, 'habitual');
  BULK_FORMS['bulk-texto'](null, datos({ texto: '30 libras de arroz y dos paquetes de café.', destino: 'habitual' }), ctx);
  BULK_FORMS['bulk-revision'](tablaVacia, datos({}), ctx);

  // El arroz ya estaba con 20: volver a nombrarlo es decir «esto lo compro
  // siempre», no «ahora son 30». Las 30 del texto no se escriben en ninguna
  // parte, porque aquí ya no se anota ninguna cantidad.
  assert.equal(habitualLines(state).find(linea => linea.productId === arroz).quantity, 20,
    'el texto reescribió una cantidad que nadie pidió cambiar');
  const cafe = productByName(state, 'Café');
  assert.ok(cafe, 'el café no se registró');
  assert.equal(habitualLines(state).find(linea => linea.productId === cafe.id).quantity, null,
    'lo nuevo nació con una cantidad que nadie escribió');
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
