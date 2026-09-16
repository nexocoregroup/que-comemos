import test from 'node:test';
import assert from 'node:assert/strict';

// Los dos pasos que le faltaban al asistente de entrada.
//
// Quien entraba sin cuenta llegaba al final —«preparar mi primer menú
// mensual»— con la casa vacía: sin nadie registrado, así que la app no podía
// avisar de ninguna alergia ni repartir ninguna porción; y sin una sola
// preparación guardada, así que al abrir el menú no había nada que poner en el
// calendario. El asistente pedía el menú antes de que existiera con qué
// llenarlo.
//
// Ahora son ocho pasos: el primero pregunta quiénes comen aquí y qué debe
// evitar cada quien, y el penúltimo escribe las comidas que se repiten.

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
import { addProduct, createEmptyState, personasActivas, upsertPerson, upsertRecipe } from '../src/model.js';
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

// Un formulario de mentira con las casillas que el paso de preparaciones lee.
const formularioDeReceta = momentos => ({
  querySelectorAll: selector => (selector === '[name="uses"]:checked' ? momentos.map(id => ({ value: id })) : [])
});

function almacenDeMentira() {
  const datos = new Map();
  return {
    getItem: clave => (datos.has(clave) ? datos.get(clave) : null),
    setItem: (clave, valor) => datos.set(clave, String(valor)),
    removeItem: clave => datos.delete(clave)
  };
}

/* ── Ocho pasos ────────────────────────────────────────────────────────── */

test('el asistente son ocho pasos, y los dos nuevos están en su sitio', () => {
  assert.equal(PASOS.length, 8);
  const orden = PASOS.map(paso => paso.id);
  assert.equal(orden[0], PASO.personas, 'quiénes comen aquí va primero: de eso depende todo lo demás');
  assert.equal(orden[orden.length - 1], PASO.mes);
  // Y sobre todo: las preparaciones se escriben ANTES de pedir el primer menú.
  // Ese era el fallo: se ofrecía el menú y al abrirlo no había nada que poner.
  assert.ok(orden.indexOf(PASO.preparaciones) < orden.indexOf(PASO.mes));
});

test('quien compra una vez al mes ve siete, porque el reparto no le pregunta nada', () => {
  const mensual = { ...emptySetup(), frecuencia: 'mensual' };
  const quincenal = { ...emptySetup(), frecuencia: 'quincenal' };
  assert.equal(pasosDe(quincenal).length, 8);
  assert.equal(pasosDe(mensual).length, 7);
  assert.ok(pasosDe(mensual).some(paso => paso.id === PASO.personas));
  assert.ok(pasosDe(mensual).some(paso => paso.id === PASO.preparaciones));
});

test('los ocho pasos se dibujan, con la casa vacía y con la casa llena', () => {
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

/* ── Paso 7: las comidas que se repiten ────────────────────────────────── */

test('una preparación se escribe con el nombre y los momentos, y queda guardada de verdad', () => {
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.preparaciones;
  SETUP_FORMS['setup-preparacion'](formularioDeReceta(['desayuno', 'cena']), new Map([['name', 'Mangú con salami']]), ctx);

  assert.equal(ctx.state.recipes.length, 1);
  assert.equal(ctx.state.recipes[0].name, 'Mangú con salami');
  assert.deepEqual(ctx.state.recipes[0].uses, ['desayuno', 'cena']);
  assert.deepEqual(ctx.state.recipes[0].items, [], 'los alimentos se añaden después, no aquí');
  assert.ok(ctx.avisos.some(aviso => aviso.includes('Mangú con salami')));

  const html = renderSetup(ctx);
  revisar(html, 'paso de preparaciones');
  assert.ok(html.includes('Mangú con salami'));
  assert.ok(html.includes('Desayuno · Cena'), 'no dice en qué momentos se come');
});

test('sin nombre o sin momentos no se guarda nada, y se dice cuál de las dos falta', () => {
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.preparaciones;

  SETUP_FORMS['setup-preparacion'](formularioDeReceta(['almuerzo']), new Map([['name', ' ']]), ctx);
  assert.equal(ctx.state.recipes.length, 0);
  assert.match(ctx.ui.setup.errorReceta, /nombre/i);

  SETUP_FORMS['setup-preparacion'](formularioDeReceta([]), new Map([['name', 'Sancocho']]), ctx);
  assert.equal(ctx.state.recipes.length, 0);
  assert.match(ctx.ui.setup.errorReceta, /momentos/i);
  assert.ok(ctx.ui.setup.errorReceta.includes('Sancocho'), 'el error no dice de cuál habla');

  // Y con las dos cosas, entra.
  SETUP_FORMS['setup-preparacion'](formularioDeReceta(['almuerzo']), new Map([['name', 'Sancocho']]), ctx);
  assert.equal(ctx.state.recipes.length, 1);
  assert.equal(ctx.ui.setup.errorReceta, '');
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
  assert.ok(vacio.includes('Todavía no has guardado ninguna.'));
  assert.ok(vacio.includes('data-action="setup-siguiente"'));
  assert.ok(!/disabled/.test(vacio), 'ningún control puede quedar apagado por no tener preparaciones');
});

/* ── El final ya no promete un menú vacío ──────────────────────────────── */

test('el último paso cuenta con qué se va a llenar el mes', () => {
  const ctx = contexto();
  upsertPerson(ctx.state, { name: 'Sofía', kind: 'nino', restricciones: [] });
  upsertRecipe(ctx.state, { name: 'Mangú', uses: ['desayuno'], items: [], note: '' });
  ctx.ui.setup.paso = PASO.mes;
  ctx.ui.setup.guardados = 12;

  const html = renderSetup(ctx);
  revisar(html, 'último paso');
  assert.ok(/1 persona en casa/.test(html));
  assert.ok(/12 alimentos/.test(html));
  assert.ok(/1 preparación/.test(html), 'no dice cuántas preparaciones hay');
  assert.ok(!html.includes('No hay ninguna preparación guardada'), 'no puede avisar de algo que sí hay');
  // Y el último paso no ofrece «Salir»: ya no queda nada que abandonar.
  assert.ok(!html.includes('data-action="setup-salir"'));
});

test('sin preparaciones, el último paso lo dice antes de ofrecer el menú', () => {
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.mes;
  const html = renderSetup(ctx);
  assert.ok(html.includes('No hay ninguna preparación guardada.'));
  assert.ok(html.includes('El menú del mes va a empezar vacío'));
  // Pero se puede seguir igual: avisar no es bloquear.
  assert.ok(html.includes('data-action="setup-menu"'));
});

/* ── Y el camino se recorre entero ─────────────────────────────────────── */

test('se llega del principio al final sin quedarse atascado en ningún paso', () => {
  const ctx = contexto();
  SETUP_ACTIONS['setup-empezar'](null, ctx);
  assert.equal(ctx.ui.setup.paso, PASO.personas);

  const visitados = [ctx.ui.setup.paso];
  for (let i = 0; i < 20 && ctx.ui.setup.paso !== PASO.mes; i++) {
    SETUP_ACTIONS['setup-siguiente'](null, ctx);
    visitados.push(ctx.ui.setup.paso);
  }
  assert.equal(ctx.ui.setup.paso, PASO.mes, `se quedó atascado: ${visitados.join(' → ')}`);
  assert.deepEqual(visitados, pasosDe(ctx.ui.setup).map(paso => paso.id));

  // Y hacia atrás también, sin saltarse ninguno.
  for (let i = 0; i < 20 && ctx.ui.setup.paso !== PASO.personas; i++) SETUP_ACTIONS['setup-atras'](null, ctx);
  assert.equal(ctx.ui.setup.paso, PASO.personas);
});

test('el borrador sobrevive hasta el final, no hasta las cantidades', () => {
  // Detrás de las cantidades quedan dos pasos. Borrar el borrador ahí dejaba a
  // quien cerrara la app en medio volviendo a la pantalla de entrada.
  const ctx = contexto();
  ctx.ui.setup.paso = PASO.cantidades;
  ctx.ui.setup.personas = 4;
  // El paso de las cantidades guarda lo que haya escrito en la pantalla, y sin
  // una sola línea se niega a guardar. Se le pone una.
  const fila = {
    dataset: { origen: 'catalogo', categoria: 'granos' },
    querySelector: nombre => ({ value: { nombre: 'Arroz', cantidad: '10', unidad: 'lb' }[nombre.replace(/^\[name="|"\]$/g, '')] ?? '' })
  };
  document.querySelectorAll = selector => (selector === '[data-setup-cantidad]' ? [fila] : []);
  SETUP_FORMS['setup-cantidades']({ querySelectorAll: () => [] }, new Map(), ctx);
  document.querySelectorAll = () => [];

  assert.equal(ctx.ui.setup.paso, PASO.preparaciones);
  const guardado = avanceGuardado(ctx.state);
  assert.ok(guardado, 'el borrador se borró con dos pasos todavía por delante');
  assert.equal(guardado.paso, PASO.preparaciones);
  assert.equal(guardado.personas, 4);

  // Al terminar sí se borra: ya no queda nada que retomar.
  SETUP_ACTIONS['setup-ahora-no'](null, ctx);
  assert.equal(avanceGuardado(ctx.state), null);
});
