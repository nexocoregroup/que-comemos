import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// El recorrido para registrar una casa: cinco pasos.
//
// Mi hogar, productos habituales, cómo compramos, comidas habituales y ver mi
// casa. Fueron ocho, luego siete, y ahora cinco; cada resta quitó algo que se
// pedía antes de tiempo.
//
// Las dos últimas en irse fueron «¿cuánto se compra al mes?» y «cómo se reparte
// entre las dos quincenas». Pedían un número que la casa no tiene por qué
// saber, y lo pedían justo después de marcar los alimentos: quien marcaba
// ciento cincuenta se encontraba con ciento cincuenta casillas de cantidad
// antes de poder terminar.
//
// La prueba que más vale de este archivo es la que recorre los cinco pasos y
// exige que en ninguno haya dónde escribir una cantidad. Y la segunda, la que
// comprueba que editar una comida desde aquí no le borra los alimentos que
// alguien escribió en la ventana completa.

// El asistente lee la pantalla para no perder lo que se está escribiendo. Aquí
// no hay pantalla, así que se finge una que puede devolver lo que haga falta.
const campos = new Map();
const nodoTonto = () => ({ value: undefined, focus() {}, classList: { toggle() {} }, closest: () => null, querySelector: () => null });
globalThis.document = {
  querySelectorAll: () => [],
  querySelector: selector => (campos.has(selector) ? { ...nodoTonto(), value: campos.get(selector) } : nodoTonto())
};
let confirmaciones = true;
globalThis.window = { ...(globalThis.window || {}), confirm: () => confirmaciones };

import {
  PASO, PASOS, SETUP_ACTIONS, SETUP_FORMS, avanceGuardado, emptySetup, pasosDe, renderSetup
} from '../src/setup.js';
import { HOGAR_ACTIONS, HOGAR_FORMS, emptyHogar } from '../src/hogar.js';
import { addProduct, createEmptyState, marcarRecorridoOfrecido, personasActivas, recorridoYaOfrecido, setHabitualBasket, upsertPerson, upsertRecipe } from '../src/model.js';
import { loadState, saveState } from '../src/storage.js';

function contexto(state = createEmptyState()) {
  const ctx = {
    state,
    ui: { page: 'setup', modal: null, setup: emptySetup(), hogar: emptyHogar(), voz: { destino: '', estado: 'quieto', sesion: 0 } },
    avisos: [],
    commit: mensaje => { if (mensaje) ctx.avisos.push(mensaje); },
    guardar: () => {},
    toast: mensaje => ctx.avisos.push(mensaje),
    render: () => {},
    closeModal: () => { ctx.ui.modal = null; },
    openModal: (type, extras) => { ctx.ui.modal = { type, ...extras }; },
    servicios: { transcribe: false, chat: false, enElAparato: { voz: false } }
  };
  return ctx;
}

const revisar = (html, donde) => {
  assert.equal(typeof html, 'string', `${donde} no devolvió HTML`);
  for (const basura of ['undefined', 'NaN', '[object Object]']) {
    assert.ok(!html.includes(basura), `${donde} imprime «${basura}» en pantalla`);
  }
  assert.ok(!/\$\{/.test(html), `${donde} dejó una plantilla sin resolver`);
};

function almacenDeMentira() {
  const datos = new Map();
  return {
    getItem: clave => (datos.has(clave) ? datos.get(clave) : null),
    setItem: (clave, valor) => datos.set(clave, String(valor)),
    removeItem: clave => datos.delete(clave)
  };
}

// Un formulario con filas de alimentos, como el que pinta la pantalla. Estas
// pruebas llaman a los envíos sin navegador, así que las filas hay que
// fingirlas: son lo que `leerPreparacion` lee del DOM, y no del FormData.
const formularioCon = (...productIds) => ({
  querySelector: () => null,
  querySelectorAll: () => productIds.map(id => ({
    querySelector: selector => ({ value: selector.includes('itemId') ? '' : id })
  }))
});

/* ── Cuatro pasos ──────────────────────────────────────────────────────── */

test('el recorrido son cuatro pasos, y en este orden', () => {
  // Eran cinco. El tercero, «Cómo compramos», se retiró: preguntaba mensual o
  // quincenal, y desde que la app no reparte la canasta entre quincenas esa
  // respuesta no cambia una sola pantalla. Sigue en Ajustes, que es donde hace
  // falta para leer los períodos cerrados del historial.
  assert.equal(PASOS.length, 4);
  assert.equal(PASO.compra, undefined, 'volvió el paso de la frecuencia');
  assert.deepEqual(PASOS.map(paso => paso.id),
    [PASO.personas, PASO.alimentos, PASO.preparaciones, PASO.plan]);
  // Quiénes comen aquí va primero: de eso depende todo lo demás. Y las comidas
  // se escriben antes del repaso, que es lo único que hay después.
  assert.equal(PASOS[0].id, PASO.personas);
  assert.equal(PASOS[PASOS.length - 1].id, PASO.plan);
});

test('los cuatro son siempre los mismos', () => {
  // Ya no hay ningún paso condicional, ni ninguno que dependa de cómo se
  // compre: eso se dejó de preguntar aquí.
  assert.equal(pasosDe(emptySetup()).length, 4);
});

test('los cinco pasos se dibujan, con la casa vacía y con la casa llena', () => {
  const llena = createEmptyState();
  const arroz = addProduct(llena, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  upsertPerson(llena, { name: 'Sofía', kind: 'nino', restricciones: [{ productId: null, texto: 'Maní', motivo: 'alergia' }] });
  upsertRecipe(llena, { name: 'Mangú', uses: ['desayuno'], items: [{ productId: arroz, quantity: 1, unit: 'lb' }], note: '' });

  for (const state of [createEmptyState(), llena]) {
    const ctx = contexto(state);
    ctx.ui.setup.frecuencia = 'quincenal';
    for (const paso of PASOS) {
      ctx.ui.setup.paso = paso.id;
      revisar(renderSetup(ctx), `paso «${paso.corto}»`);
    }
  }
});

/* ── Paso 1: quiénes comen aquí ────────────────────────────────────────── */

test('el paso de las personas cuenta, y la cuenta sube y baja', () => {
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.personas;
  SETUP_ACTIONS['setup-personas-mas'](null, ctx);
  SETUP_ACTIONS['setup-personas-mas'](null, ctx);
  SETUP_ACTIONS['setup-personas-mas'](null, ctx);
  assert.equal(ctx.ui.setup.personas, 4, 'empieza en una: tú');
  SETUP_ACTIONS['setup-personas-menos'](null, ctx);
  assert.equal(ctx.ui.setup.personas, 3);
  // Nunca por debajo de una persona: una casa sin nadie no existe.
  for (let i = 0; i < 9; i++) SETUP_ACTIONS['setup-personas-menos'](null, ctx);
  assert.equal(ctx.ui.setup.personas, 1);
});

test('cuántas personas son sobrevive a cerrar la app', () => {
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.personas;
  SETUP_ACTIONS['setup-personas-mas'](null, ctx);
  SETUP_ACTIONS['setup-personas-mas'](null, ctx);

  const almacen = almacenDeMentira();
  saveState(ctx.state, almacen);
  const vuelto = avanceGuardado(loadState(almacen));
  assert.equal(vuelto.personas, 3);
  assert.equal(vuelto.paso, PASO.personas, 'vuelve por donde iba');
});

test('una persona con alergia se ve desde el propio paso, y sin llenar también se ve', () => {
  const state = createEmptyState();
  upsertPerson(state, { name: 'Sofía', kind: 'nino', restricciones: [{ productId: null, texto: 'Maní', motivo: 'alergia' }] });
  const ctx = contexto(state);
  ctx.ui.setup.paso = PASO.personas;
  ctx.ui.setup.personas = 3;
  const html = renderSetup(ctx);
  revisar(html, 'paso de personas');

  assert.ok(html.includes('Sofía'));
  assert.ok(html.includes('Maní'), 'no se ve lo que esa persona debe evitar');
  assert.ok(/motivo-alergia|restriccion-alergia|alergia/i.test(html), 'la alergia tiene que verse como alergia');
  assert.ok(html.includes('Persona 2') && html.includes('Persona 3'), 'las que faltan no se ven');
  // Y se puede seguir sin llenarlas: se avisa, no se bloquea.
  assert.ok(/Faltan 2 personas por llenar/.test(html));
  assert.ok(html.includes('data-action="setup-siguiente"'));
  assert.ok(!/data-action="setup-siguiente"[^>]*disabled/.test(html), 'no se puede bloquear el paso');
});

test('la ficha de una persona es la de siempre, no una segunda escrita aquí', () => {
  // Dos formularios de persona serían dos sitios donde olvidarse de preguntar
  // si un alimento es una alergia o una manía.
  const state = createEmptyState();
  const ctx = contexto(state);
  ctx.ui.setup.paso = PASO.personas;
  assert.ok(renderSetup(ctx).includes('data-action="hogar-editar"'), 'el paso no abre la ficha de siempre');

  HOGAR_ACTIONS['hogar-editar']({ dataset: { id: '' } }, ctx);
  assert.equal(ctx.ui.modal?.type, 'persona');
  assert.ok(ctx.ui.hogar.ficha, 'no se preparó la ficha que la ventana va a pintar');

  ctx.ui.hogar.ficha = { ...ctx.ui.hogar.ficha, nombre: 'Luis', restricciones: [{ productId: null, texto: 'Leche', motivo: 'intolerancia' }] };
  HOGAR_FORMS.persona({ }, new Map(), ctx);
  assert.deepEqual(personasActivas(state).map(persona => persona.name), ['Luis']);
  assert.equal(personasActivas(state)[0].restricciones[0].motivo, 'intolerancia');
});

test('continuar desde las personas guarda el número tecleado, no solo el de los botones', () => {
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.personas;
  campos.set('[data-setup-personas]', '5');
  SETUP_ACTIONS['setup-siguiente'](null, ctx);
  campos.clear();
  assert.equal(ctx.ui.setup.personas, 5);
  assert.equal(ctx.ui.setup.paso, PASO.alimentos);
});

/* ── Paso 4: las comidas habituales ────────────────────────────────────────

   Este paso abría la ventana completa de una preparación: alimentos, cantidades
   de cada uno, cuánto rinde y qué días se repite. Se hizo así para no tener dos
   formularios de la misma cosa, que es un buen principio, y aun así estaba mal:
   escribir las seis comidas de una familia eran treinta campos, y quien está
   registrando su casa no quiere describir seis platos, quiere nombrarlos.

   Ahora pregunta tres cosas y una es opcional. La ventana completa no
   desapareció: sigue en Más → Preparaciones para quien quiera decir qué lleva
   cada plato. */

test('el paso pide el nombre, los momentos y una nota opcional, y nada más', () => {
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.preparaciones;
  const html = renderSetup(ctx);
  revisar(html, 'paso de comidas habituales');

  assert.ok(html.includes('data-form="setup-preparacion"'), 'no hay dónde escribirlas');
  assert.ok(html.includes('name="nombre"'));
  assert.ok(html.includes('name="momentos"'));
  assert.ok(html.includes('name="nota"'));
  assert.ok(/Nota para quien cocina <span class="muted">\(opcional\)<\/span>/.test(html), 'la nota tiene que decir que es opcional');

  // Y lo que NO puede pedir. Cada una de estas fue una razón para abandonar.
  assert.ok(!/name="servings"/.test(html), 'vuelve a pedir cuántas porciones rinde');
  assert.ok(!/name="quantity"/.test(html), 'vuelve a pedir cantidades de los alimentos');
  assert.ok(!/name="items"/.test(html), 'vuelve a pedir qué alimentos lleva');
  assert.ok(!/name="participants"/.test(html), 'vuelve a preguntar quiénes comen normalmente');
  // Los días de repetición son de la etapa siguiente. Enseñar la casilla sin
  // tener detrás el flujo que la hace valer es peor que no enseñarla.
  assert.ok(!/name="weekdays"/.test(html), 'enseña una opción de repetición que todavía no funciona');
});

test('se escriben varias seguidas: guardar deja el formulario en blanco', () => {
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.preparaciones;

  for (const [nombre, momentos] of [['Mangú con salami', ['desayuno', 'cena']], ['Locrio de pollo', ['almuerzo']]]) {
    const datos = new FormData();
    datos.set('nombre', nombre);
    for (const momento of momentos) datos.append('momentos', momento);
    SETUP_FORMS['setup-preparacion'](null, datos, ctx);
  }

  assert.deepEqual(ctx.state.recipes.map(receta => receta.name), ['Mangú con salami', 'Locrio de pollo']);
  assert.deepEqual(ctx.state.recipes[0].uses, ['desayuno', 'cena']);
  assert.deepEqual(ctx.state.recipes[0].items, [], 'sin alimentos, y sin inventarlos');
  assert.equal(ctx.state.recipes[0].servings, null);
  assert.equal(ctx.ui.setup.preparacion.name, '', 'el formulario tiene que quedar en blanco para la siguiente');
});

test('sin nombre o sin momentos no se guarda, y se dice por qué', () => {
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.preparaciones;

  const soloNombre = new FormData();
  soloNombre.set('nombre', 'Mangú');
  SETUP_FORMS['setup-preparacion'](null, soloNombre, ctx);
  assert.equal(ctx.state.recipes.length, 0);
  assert.match(ctx.ui.setup.preparacion.error, /momentos/);
  assert.equal(ctx.ui.setup.preparacion.name, 'Mangú', 'lo escrito no se puede perder al avisar');

  const soloMomentos = new FormData();
  soloMomentos.append('momentos', 'cena');
  SETUP_FORMS['setup-preparacion'](null, soloMomentos, ctx);
  assert.equal(ctx.state.recipes.length, 0);
  assert.match(ctx.ui.setup.preparacion.error, /cómo se llama/);
});

test('editar desde el recorrido no le borra los alimentos a una preparación', () => {
  /* El motivo de esta prueba no ha cambiado en tres versiones del formulario, y
     es el que importa: `upsertRecipe` reescribe la ficha ENTERA con lo que se
     le pase, así que corregirle el nombre a una preparación puede borrarle en
     silencio los alimentos que alguien anotó.

     Lo que sí ha cambiado es de dónde salen. Hubo un desplegable por alimento;
     lo quitamos porque el nombre del plato ya dice de qué es. Ahora los
     alimentos se sacan del nombre Y se unen con los que ya había —añadir,
     nunca quitar—, que es lo único que impide que «Locrio» → «Locrio de pollo»
     se lleve por delante lo que estaba guardado.

     Por eso esta prueba ya no mira si la pantalla pinta filas: mira lo que
     tiene que ser cierto pinte lo que pinte, que es que después de editar los
     alimentos sigan ahí. */
  const ctx = contexto();
  const arroz = addProduct(ctx.state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  const receta = upsertRecipe(ctx.state, {
    name: 'Locrio', uses: ['almuerzo'],
    items: [{ productId: arroz, quantity: 3, unit: 'lb' }], servings: 6, note: 'Dejar una parte'
  });
  ctx.ui.setup.paso = PASO.preparaciones;

  SETUP_ACTIONS['setup-preparacion-editar']({ dataset: { id: receta.id } }, ctx);
  assert.equal(ctx.ui.setup.preparacion.name, 'Locrio');
  assert.deepEqual(ctx.ui.setup.preparacion.uses, ['almuerzo']);
  assert.equal(ctx.ui.setup.preparacion.items.length, 1, 'al editar no se traen los alimentos que ya tenía');

  // La pantalla se dibuja sin reventar aunque ya no pinte los alimentos.
  const pintado = renderSetup(ctx);
  assert.ok(pintado.includes('data-preparacion-nombre'), 'el formulario del recorrido dejó de preguntar el nombre');
  assert.ok(!pintado.includes('data-item-list="receta"'), 'volvió el desplegable de alimentos que se retiró');

  const datos = new FormData();
  datos.set('nombre', 'Locrio de pollo');
  datos.append('momentos', 'almuerzo');
  datos.append('momentos', 'cena');
  SETUP_FORMS['setup-preparacion'](formularioCon(arroz), datos, ctx);

  assert.equal(ctx.state.recipes.length, 1, 'editar no puede crear una segunda');
  const despues = ctx.state.recipes[0];
  assert.equal(despues.name, 'Locrio de pollo');
  assert.deepEqual(despues.uses, ['almuerzo', 'cena']);
  assert.equal(despues.items.length, 1, 'se perdieron los alimentos');
  assert.equal(despues.servings, 6, 'se perdió cuánto rinde');
});

test('la lista enseña lo que hay, y lo que le falta sin regañar', () => {
  const ctx = contexto();
  upsertRecipe(ctx.state, { name: 'Locrio de pollo', uses: ['almuerzo', 'cena'], items: [], note: 'Dejar una parte' });
  upsertRecipe(ctx.state, { name: 'Mangú', uses: ['desayuno'], items: [], note: '' });
  ctx.state.recipes[1].uses = [];   // como si viniera dañada de un respaldo
  ctx.ui.setup.paso = PASO.preparaciones;
  const html = renderSetup(ctx);
  revisar(html, 'paso con comidas escritas');

  assert.ok(html.includes('Locrio de pollo'));
  assert.ok(html.includes('Almuerzo · Cena'), 'no dice en qué momentos se come');
  assert.ok(html.includes('con nota'));
  assert.ok(html.includes('sin momentos: no saldrá en el calendario'));
  assert.ok(!/disabled/.test(html), 'nada puede quedar apagado por una comida a medias');
});

test('la ventana de una preparación se puede encadenar para escribirlas de una sentada', () => {
  // «Guardar y añadir otra»: la pantalla se comprueba aquí porque la ventana la
  // dibuja app.js, que lee el documento al cargarse y no entra en las pruebas.
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'app.js'), 'utf8');
  assert.ok(/name="seguir" value="1"/.test(codigo), 'no hay forma de guardar y seguir escribiendo');
  assert.ok(/Guardar y añadir otra/.test(codigo));
  // Solo al crear una nueva: encadenar mientras se edita una que ya existe no
  // significa nada.
  assert.ok(/\$\{recipe \? '' : '<button class="btn btn-secondary" type="submit" name="seguir"/.test(codigo),
    'el botón de encadenar sale también al editar una preparación que ya existe');
  // Y al guardar, la ventana se queda abierta y en blanco.
  assert.ok(/const seguir = data\.get\('seguir'\) === '1';/.test(codigo));
  assert.ok(/ui\.modal = seguir \? \{ type: 'recipe', id: '' \}/.test(codigo),
    'guardar y seguir no deja la ventana abierta y vacía');
  // Y no vuelve a ninguna otra parte. Había un camino de ida y vuelta entre
  // esta ventana y la de poner una comida en varios días, de cuando esa
  // ventana era el único sitio desde donde se llenaba el calendario. Ahora
  // Preparaciones es una sección de la barra, y volver es tocarla.
  assert.ok(!/volverPoner|volverARutina|volverRutina/.test(codigo),
    'volvió el camino de vuelta a una ventana que ya no manda a ningún sitio');
});

test('quitar una preparación pregunta antes, y avisa si está puesta en el calendario', () => {
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.preparaciones;
  const receta = upsertRecipe(ctx.state, { name: 'Sancocho', uses: ['almuerzo'], items: [], note: '' });

  confirmaciones = false;
  SETUP_ACTIONS['setup-quitar-preparacion']({ dataset: { id: receta.id } }, ctx);
  assert.equal(ctx.state.recipes.length, 1, 'decir que no tiene que dejarla donde estaba');

  confirmaciones = true;
  SETUP_ACTIONS['setup-quitar-preparacion']({ dataset: { id: receta.id } }, ctx);
  assert.equal(ctx.state.recipes.length, 0);
});

test('el paso avisa cuando no hay ninguna, sin impedir seguir', () => {
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.preparaciones;
  const vacio = renderSetup(ctx);
  assert.ok(vacio.includes('Todavía no has escrito ninguna.'));
  assert.ok(vacio.includes('data-action="setup-siguiente"'));
  assert.ok(!/disabled/.test(vacio), 'ningún control puede quedar apagado por no tener preparaciones');
});

/* ── Paso 5: ver mi casa ───────────────────────────────────────────────── */

test('el último paso enseña lo registrado, uno por uno, y deja volver a cada cosa', () => {
  const ctx = contexto();
  const arroz = addProduct(ctx.state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  setHabitualBasket(ctx.state, [{ productId: arroz, quantity: '', unit: 'lb', priority: 'frecuente' }]);
  upsertPerson(ctx.state, { name: 'Sofía', kind: 'nino', restricciones: [] });
  upsertRecipe(ctx.state, { name: 'Mangú', uses: ['desayuno'], items: [], note: '' });
  ctx.ui.setup.paso = PASO.plan;
  ctx.ui.setup.personas = 1;

  const html = renderSetup(ctx);
  revisar(html, 'paso de ver mi casa');
  assert.ok(html.includes('Mi hogar') && /1 persona</.test(html));
  assert.ok(html.includes('Productos habituales') && /1 producto</.test(html));
  // «Cómo compramos» ya no está: se retiró del recorrido entero.
  assert.ok(!html.includes('Cómo compramos'), 'volvió la línea del paso retirado');
  assert.ok(html.includes('Mis preparaciones') && /1 preparación</.test(html));
  // Cada línea vuelve a su paso.
  for (const paso of [PASO.personas, PASO.alimentos, PASO.preparaciones]) {
    assert.ok(html.includes(`data-action="setup-ir" data-paso="${paso}"`), `no se puede volver al paso ${paso}`);
  }
  // Y el último paso no ofrece «Salir»: ya no queda nada que abandonar.
  assert.ok(!html.includes('data-action="setup-salir"'));
  assert.ok(html.includes('data-action="setup-terminar"'));
});

test('el último paso deja terminar sin poner ni una comida, y lo dice', () => {
  // Es la promesa que no se puede callar. Quien acaba de registrar su casa
  // entera no tiene por qué planificar catorce días ahí mismo para poder
  // salir, y tiene que saberlo antes de empezar a elegir.
  const conComidas = contexto();
  upsertRecipe(conComidas.state, { name: 'Mangú', uses: ['desayuno'], items: [], note: '' });
  conComidas.ui.setup.paso = PASO.plan;
  const html = renderSetup(conComidas);
  revisar(html, 'ver mi casa con una preparación escrita');
  assert.ok(html.includes('Puedes terminar sin poner ni una comida'), 'no dice que se puede terminar sin planificar');
  assert.ok(/Plan semanal/.test(html), 'no dice dónde se pone lo que falte');
  // Y antes de elegir 7 o 14 no se enseña ni un día: la primera pregunta es
  // cuántos, no cuál.
  assert.ok(/¿Cuántos días quieres planificar\?/.test(html));
  // Terminar está a un toque, sin nada que lo bloquee.
  assert.ok(html.includes('data-action="setup-terminar"'));
  assert.ok(!/disabled/.test(html));

  // Y sin ninguna preparación escrita no se enseñan desplegables vacíos: se
  // dice, y se ofrece volver al paso donde se escriben.
  const vacia = contexto();
  vacia.ui.setup.paso = PASO.plan;
  const sinNada = renderSetup(vacia);
  assert.ok(/preparaci[oó]n/i.test(sinNada), 'no explica que faltan preparaciones');
  assert.ok(sinNada.includes(`data-action="setup-ir" data-paso="${PASO.preparaciones}"`), 'no ofrece volver a escribirlas');
  assert.ok(sinNada.includes('data-action="setup-terminar"'), 'sin preparaciones tampoco se puede quedar atrapado');
});

/* ── Y el camino se recorre entero ─────────────────────────────────────── */

test('se llega del principio al final sin quedarse atascado en ningún paso', () => {
  const ctx = contexto();
  SETUP_ACTIONS['setup-empezar'](null, ctx);
  assert.equal(ctx.ui.setup.paso, PASO.personas);

  const visitados = [ctx.ui.setup.paso];
  for (let i = 0; i < 20 && ctx.ui.setup.paso !== PASO.plan; i++) {
    SETUP_ACTIONS['setup-siguiente'](null, ctx);
    visitados.push(ctx.ui.setup.paso);
  }
  assert.equal(ctx.ui.setup.paso, PASO.plan, `se quedó atascado: ${visitados.join(' → ')}`);
  assert.deepEqual(visitados, pasosDe(ctx.ui.setup).map(paso => paso.id));

  // Y hacia atrás también, sin saltarse ninguno.
  for (let i = 0; i < 20 && ctx.ui.setup.paso !== PASO.personas; i++) SETUP_ACTIONS['setup-atras'](null, ctx);
  assert.equal(ctx.ui.setup.paso, PASO.personas);
});

test('el borrador sobrevive hasta el final, y se borra al terminar', () => {
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.preparaciones;
  ctx.ui.setup.personas = 4;
  ctx.ui.setup.elegidos = ['Arroz'];
  SETUP_ACTIONS['setup-siguiente'](null, ctx);

  assert.equal(ctx.ui.setup.paso, PASO.plan);
  const guardado = avanceGuardado(ctx.state);
  assert.ok(guardado, 'el borrador se borró con un paso todavía por delante');
  assert.equal(guardado.paso, PASO.plan);
  assert.equal(guardado.personas, 4);

  // Al terminar sí se borra: ya no queda nada que retomar.
  SETUP_ACTIONS['setup-terminar'](null, ctx);
  assert.equal(avanceGuardado(ctx.state), null);
});

test('un avance guardado con la numeración vieja no aterriza en el paso equivocado', () => {
  // Quien lo dejó a medias antes de esta etapa tiene escrito un número de paso
  // de los de entonces. El 5 era «cómo se reparte entre quincenas» y ahora es
  // «ver mi casa»: sin traducirlo, volvería al resumen de una casa que todavía
  // no ha terminado de registrar.
  const state = createEmptyState();
  const comoAntes = paso => {
    state.settings.canasta = { paso, elegidos: [], propios: [], cantidades: {} };
    return avanceGuardado(state).paso;
  };
  assert.equal(comoAntes(4), PASO.preparaciones, 'el de las cantidades');
  assert.equal(comoAntes(5), PASO.preparaciones, 'el del reparto');
  assert.equal(comoAntes(6), PASO.preparaciones, 'el de las preparaciones');
  assert.equal(comoAntes(7), PASO.plan, 'el del mes');
  assert.equal(comoAntes(1), PASO.personas);

  // El paso 5 de la numeración anterior era «Ver mi casa»: un repaso, y nada
  // más. El 5 de ahora crea el primer plan, y crearlo es elegir entre las
  // preparaciones escritas. Devolver a alguien ahí sin haberlas visto es
  // pedirle que elija a ciegas, así que aterriza en el paso donde se escriben.
  state.settings.canasta = { paso: 5, esquema: 2, elegidos: [], propios: [], cantidades: {} };
  assert.equal(avanceGuardado(state).paso, PASO.preparaciones, 'el «ver mi casa» de antes no es el plan de ahora');

  // Y lo guardado ya con la numeración de ahora se respeta tal cual.
  state.settings.canasta = { paso: 5, esquema: 3, elegidos: [], propios: [], cantidades: {} };
  assert.equal(avanceGuardado(state).paso, PASO.plan);
});

/* ── Los días se dicen en la propia preparación ────────────────────────── */

test('la ficha de una preparación no pregunta los días: los días se marcan aparte', () => {
  /* Aquí había un bloque que preguntaba los días dentro de la ficha, y
     arrastraba un error de fondo: aplicaba esos días a TODOS los momentos
     marcados arriba. Quien decía «mangú, de desayuno y de cena, los lunes»
     acababa con mangú el lunes de desayuno y el lunes de cena, cuando lo que
     quería era el lunes de desayuno y el viernes de cena.

     La ficha dice en qué momentos puede comerse; en qué días se pone se marca
     en el plan del mes, un momento cada vez. */
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'app.js'), 'utf8');
  assert.ok(!/function bloqueDeDias\(/.test(codigo), 'el bloque de días sigue dentro de la ficha');
  assert.ok(!/function aplicarDiasDeLaReceta\(/.test(codigo), 'sigue aplicando los días a todos los momentos');
  assert.ok(!/function rutinaDeLaReceta\(/.test(codigo));
  // Y desde una comida ya puesta se llega a ponerla otros días, con la
  // preparación y el momento que ya se sabían.
  const desdeLaComida = codigo.slice(codigo.indexOf("'semana-poner-en-dias'"));
  assert.ok(desdeLaComida, 'no hay camino de una comida del calendario a ponerla en otros días');
  assert.ok(/^'semana-poner-en-dias', 'btn-secondary btn-small', `data-receta=/.test(desdeLaComida),
    'el botón no se lleva la preparación que ya se sabía');
  assert.ok(/data-slot=/.test(desdeLaComida.slice(0, 200)), 'ni el momento, que también se sabía');
  assert.ok(/Ponerla otros días/.test(codigo));
});

test('la ficha ya no pide porciones ni cantidades de los alimentos', () => {
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'app.js'), 'utf8');
  // El corte va de un trozo de código a otro, no a un comentario: un
  // comentario se reescribe, y el día que su frase aparezca antes en el
  // archivo esta prueba se queda mirando una ventana vacía.
  const ventana = codigo.slice(codigo.indexOf("if (m.type === 'recipe')"), codigo.indexOf("if (m.type === 'persona')"));
  assert.ok(ventana.length > 200, 'no se encontró la ventana de la preparación');
  assert.ok(!/name="servings"/.test(ventana), 'vuelve a pedir cuántas porciones rinde');
  assert.ok(!/name="participants"/.test(ventana), 'vuelve a preguntar quiénes comen normalmente');
  // El cuerpo del formulario se fue a `preparacion.js`, para que el recorrido
  // inicial use exactamente el mismo y deje de escribir preparaciones a medias
  // —sin alimentos, y por tanto sin poder avisar de ninguna alergia—.
  assert.ok(/camposDePreparacion\(state/.test(ventana), 'la ventana dejó de usar el formulario compartido');
  const campos = readFileSync(resolve(import.meta.dirname, '..', 'src', 'preparacion.js'), 'utf8');
  assert.ok(!/name="servings"/.test(campos), 'vuelve a pedir cuántas porciones rinde');
  assert.ok(!/name="participants"/.test(campos), 'vuelve a preguntar quiénes comen normalmente');
  /* La preparación ya no pregunta qué alimentos lleva: salen de su nombre. La
     fila de alimento sigue existiendo porque la usa la ventana de una COMIDA,
     que es donde se corrige lo que se va a cocinar ese día, y por eso lo de
     abajo se sigue comprobando. */
  assert.ok(!/data-item-list="receta"/.test(campos), 'volvió el desplegable de alimentos de la preparación');
  // Y la fila de un alimento no lleva cantidad ni unidad. Hay una sola fila
  // desde que se retiró el reparto por raciones, así que comprobarla aquí la
  // comprueba también para la ventana de una comida.
  const desde = campos.indexOf('export function filaDeAlimento');
  const fila = campos.slice(desde, desde + 900);
  assert.ok(!/name="quantity"/.test(fila), 'la fila de un alimento vuelve a pedir cuánto');
  assert.ok(!/name="unit"/.test(fila));
  // Lo que la ventana no pregunta, tampoco lo borra.
  assert.ok(/servings: anterior\?\.servings \?\? null/.test(codigo), 'editar una preparación le borraría lo que rinde');
});

test('terminar lleva a Hoy y no deja borrador', () => {
  const state = createEmptyState();
  upsertRecipe(state, { name: 'Sancocho', uses: ['almuerzo'], items: [], note: '' });
  const ctx = contexto(state);
  ctx.ui.setup.paso = PASO.plan;
  SETUP_ACTIONS['setup-terminar'](null, ctx);
  assert.equal(ctx.ui.page, 'hoy');
  assert.equal(ctx.ui.setup, null);
  assert.equal(avanceGuardado(state), null, 'el borrador tenía que borrarse al terminar');
});

test('desde el repaso se vuelve a cualquier paso sin perder nada', () => {
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.plan;
  ctx.ui.setup.elegidos = ['Arroz', 'Yuca'];
  ctx.ui.setup.personas = 3;

  SETUP_ACTIONS['setup-ir']({ dataset: { paso: String(PASO.alimentos) } }, ctx);
  assert.equal(ctx.ui.setup.paso, PASO.alimentos);
  assert.equal(ctx.ui.setup.rubro, 0, 'volver a los productos empieza por el primer rubro');
  assert.deepEqual(ctx.ui.setup.elegidos, ['Arroz', 'Yuca'], 'lo marcado no se puede perder al volver');
  assert.equal(ctx.ui.setup.personas, 3);

  // Un paso que no existe no lleva a ninguna parte.
  SETUP_ACTIONS['setup-ir']({ dataset: { paso: '99' } }, ctx);
  assert.equal(ctx.ui.setup.paso, PASO.alimentos);
});

/* ── El recorrido, ofrecido donde se ve ────────────────────────────────── */

test('al terminar de registrar la casa se ofrece el recorrido', () => {
  /* Estaba escrito —seis pasos con su motor de siguiente, atrás y saltar— y no
     lo veía nadie: la única puerta era Ajustes → Ver el recorrido, y ahí no
     entra quien acaba de instalar una app, entra quien ya se atascó. O sea que
     estaba construido para alguien que nunca iba a pasar por delante.

     Terminar el registro es el único momento en que tiene sentido preguntarlo:
     se acaban de ver las cinco pantallas por encima, ya hay datos dentro y
     todavía no se sabe qué se puede hacer con ellos. */
  const ctx = contexto();
  SETUP_ACTIONS['setup-terminar'](null, ctx);
  assert.equal(ctx.ui.modal?.type, 'recorrido', 'terminar el registro no ofrece el recorrido');
  assert.equal(ctx.ui.page, 'hoy', 'terminar tiene que dejar en Hoy, con o sin ventana');
  assert.equal(ctx.ui.setup, null, 'el recorrido inicial se quedó abierto');
});

test('la ventana no vuelve a salir si ya se preguntó una vez', () => {
  // Se guarda que se PREGUNTÓ, no que se hiciera. Quien dijo «ahora no» no
  // tiene que esquivar la misma ventana cada vez que reorganice su casa.
  const ctx = contexto();
  marcarRecorridoOfrecido(ctx.state);
  SETUP_ACTIONS['setup-terminar'](null, ctx);
  assert.equal(ctx.ui.modal, null, 'se vuelve a ofrecer el recorrido a quien ya dijo que no');
  // Y entonces sí se dice en voz alta que quedó registrada, que es el aviso al
  // que la ventana sustituía.
  assert.ok(ctx.avisos.some(aviso => /registrada/i.test(aviso)), 'sin ventana nadie dice que terminó');
});

test('la marca del recorrido sobrevive a guardar y volver a leer', () => {
  const state = createEmptyState();
  assert.equal(recorridoYaOfrecido(state), false, 'una casa nueva ya viene preguntada');
  marcarRecorridoOfrecido(state);

  const memoria = new Map();
  const almacen = { getItem: k => memoria.get(k) || null, setItem: (k, v) => memoria.set(k, v) };
  saveState(state, almacen);
  assert.equal(recorridoYaOfrecido(loadState(almacen)), true, 'la respuesta se perdió al guardar');
});

test('un estado sin ajustes no revienta al marcarlo', () => {
  // Un respaldo viejo o dañado puede llegar sin `settings`. Preguntar por el
  // recorrido no puede ser lo que tire la app.
  const state = createEmptyState();
  delete state.settings;
  assert.equal(recorridoYaOfrecido(state), false);
  marcarRecorridoOfrecido(state);
  assert.equal(recorridoYaOfrecido(state), true);
});

test('las dos respuestas de la ventana existen y hacen lo suyo', () => {
  /* La ventana vive en app.js, que no se puede importar aquí, así que se lee.
     Que las dos acciones tengan quien las atienda lo vigila nada-suelto; lo que
     se comprueba aquí es lo que esa prueba no puede ver: que LAS DOS marcan que
     ya se preguntó. Si solo lo marcara el «sí», decir «ahora no» dejaría la
     ventana saliendo para siempre. */
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'app.js'), 'utf8');
  for (const accion of ['recorrido-si', 'recorrido-no']) {
    const desde = codigo.indexOf(`action === '${accion}'`);
    assert.ok(desde > 0, `no hay quien atienda «${accion}»`);
    assert.match(codigo.slice(desde, desde + 260), /marcarRecorridoOfrecido/,
      `«${accion}» no marca que ya se preguntó`);
  }
  // Y el «sí» arranca el recorrido de verdad, no solo cierra la ventana.
  const si = codigo.indexOf("action === 'recorrido-si'");
  assert.match(codigo.slice(si, si + 260), /goTour\(0\)/, 'decir que sí no arranca el recorrido');
});
