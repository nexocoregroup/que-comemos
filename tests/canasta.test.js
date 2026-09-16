import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// La canasta base: ocho rubros, uno detrás de otro.
//
// Lo que se comprueba aquí, por encima de todo, es que nadie se quede sin
// registrar la mitad de su despensa. La pantalla anterior tenía una tira de
// catorce categorías que se arrastraba de lado, y en un teléfono las últimas
// quedaban fuera de la vista: existían, pero no se visitaban. De ahí salen las
// dos pruebas que más valen de este archivo —que ninguna categoría se quede
// huérfana de rubro, y que se pueda continuar sin marcar nada— y la que
// comprueba que cerrar la app a mitad no tira el trabajo.

import { CATEGORIES, RUBROS, SEED_PRODUCTS, categoriaDelRubro, rubroDeCategoria, seedByRubro } from '../src/catalog-seed.js';
import { createEmptyState, habitualLines, product, productByName } from '../src/model.js';
import { loadState, saveState } from '../src/storage.js';
import {
  PASO, PASOS, SETUP_ACTIONS, SETUP_FORMS, avanceGuardado, emptySetup,
  guardarEnLaCanasta, olvidarAvance, renderSetup
} from '../src/setup.js';

/* ── Una pantalla de mentira ───────────────────────────────────────────── */

// `setup.js` toca el DOM para marcar sin repintar. En Node no hay DOM, así que
// se le da el mínimo que necesita: elementos que no hacen nada y no revientan.
const nodoTonto = () => ({
  value: '',
  focus() {},
  classList: { toggle() {} },
  closest: () => null,
  querySelector: () => null
});
globalThis.document = { querySelectorAll: () => [], querySelector: () => nodoTonto() };

const casilla = (nombre, checked) => ({ dataset: { nombre }, checked, closest: () => null });

function contexto(state = createEmptyState()) {
  const ctx = {
    state,
    ui: { page: 'setup', modal: null, setup: emptySetup(), voz: { destino: '', estado: 'quieto', sesion: 0 } },
    avisos: [],
    guardados: 0,
    commit: mensaje => { ctx.guardados++; if (mensaje) ctx.avisos.push(mensaje); },
    guardar: () => { ctx.guardados++; },
    toast: mensaje => ctx.avisos.push(mensaje),
    render: () => {},
    closeModal: () => {}, openModal: () => {},
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

// Empezar el asistente y llegar al primer rubro. El primer paso pregunta
// quiénes comen en casa; estas pruebas van a la canasta, así que lo pasan
// continuando, que es lo que hace quien ya contestó o lo deja para después.
function empezar(ctx) {
  SETUP_ACTIONS['setup-empezar'](null, ctx);
  SETUP_ACTIONS['setup-siguiente'](null, ctx);
  return ctx.ui.setup;
}

// Recorrer el asistente hasta el rubro N, marcando por el camino lo que se pida.
function irAlRubro(ctx, indice) {
  empezar(ctx);
  for (let i = 0; i < indice; i++) SETUP_ACTIONS['setup-rubro-seguir'](null, ctx);
  return ctx.ui.setup;
}

/* ── Los ocho rubros ───────────────────────────────────────────────────── */

test('son ocho rubros, en el orden y con los nombres que se pidieron', () => {
  assert.deepEqual(RUBROS.map(item => item.titulo), [
    'Víveres',
    'Arroz, granos y pastas',
    'Carnes y proteínas',
    'Lácteos y derivados',
    'Frutas',
    'Vegetales',
    'Desayunos y meriendas',
    'Otros productos habituales'
  ]);
});

test('ninguna categoría se queda huérfana, y ninguna está en dos rubros', () => {
  // Esta es la prueba que impide el fallo que no se ve mirando: una categoría
  // que no esté en ningún rubro tiene alimentos que nadie podrá marcar nunca,
  // porque no aparecen en ninguna de las ocho pantallas.
  const enRubros = RUBROS.flatMap(rubro => rubro.categorias);
  for (const categoria of CATEGORIES) {
    const veces = enRubros.filter(id => id === categoria.id).length;
    assert.equal(veces, 1, `la categoría «${categoria.id}» aparece en ${veces} rubro(s), debería aparecer en 1`);
  }
  assert.equal(enRubros.length, CATEGORIES.length, 'hay rubros apuntando a categorías que no existen');
});

test('todos los alimentos del catálogo caben en exactamente un rubro', () => {
  const contados = RUBROS.flatMap(rubro => seedByRubro(rubro.id));
  assert.equal(contados.length, SEED_PRODUCTS.length);
  assert.equal(new Set(contados.map(item => item.name)).size, SEED_PRODUCTS.length, 'algún alimento sale dos veces');
  for (const item of SEED_PRODUCTS) {
    assert.ok(rubroDeCategoria(item.category), `«${item.name}» está en la categoría «${item.category}», que no tiene rubro`);
  }
});

/* ── La pantalla ───────────────────────────────────────────────────────── */

test('la pantalla de entrada dice lo que se pidió, palabra por palabra', () => {
  const ctx = contexto();
  const html = renderSetup(ctx);
  revisar(html, 'renderSetup (entrada)');
  assert.ok(html.includes('Ahora vamos a crear la canasta base de tu hogar. Selecciona los alimentos que normalmente compras todos los meses. Podrás agregar cualquier alimento que no aparezca.'));
});

test('cada uno de los ocho rubros se dibuja y dice por dónde va', () => {
  const ctx = contexto();
  empezar(ctx);
  for (let i = 0; i < RUBROS.length; i++) {
    const html = renderSetup(ctx);
    revisar(html, `rubro ${i + 1}`);
    assert.ok(html.includes(`Categoría ${i + 1} de 8 — <strong>${RUBROS[i].titulo}</strong>`), `falta el progreso del rubro ${i + 1}`);
    assert.ok(html.includes('Selecciona todos los que compras habitualmente. No importa cuántos sean.'), `falta la frase pedida en el rubro ${i + 1}`);
    if (i < RUBROS.length - 1) SETUP_ACTIONS['setup-rubro-seguir'](null, ctx);
  }
  assert.equal(renderSetup(ctx).includes('Categoría 8 de 8 — <strong>Otros productos habituales</strong>'), true);
});

test('«Categoría 2 de 8 — Arroz, granos y pastas» es literalmente lo que sale', () => {
  const ctx = contexto();
  irAlRubro(ctx, 1);
  assert.ok(renderSetup(ctx).includes('Categoría 2 de 8 — <strong>Arroz, granos y pastas</strong>'));
});

test('ya no hay tira de categorías que arrastrar de lado', () => {
  const ctx = contexto();
  empezar(ctx);
  for (let i = 0; i < RUBROS.length; i++) {
    const html = renderSetup(ctx);
    assert.ok(!html.includes('setup-cats'), `el rubro ${i + 1} todavía pinta la tira de categorías`);
    assert.ok(!html.includes('setup-categoria'), `el rubro ${i + 1} todavía tiene botones de cambiar de categoría`);
    SETUP_ACTIONS['setup-rubro-seguir'](null, ctx);
  }
  assert.equal(SETUP_ACTIONS['setup-categoria'], undefined, 'la acción de cambiar de categoría sigue existiendo');
});

test('no queda ni un texto que imponga cuántos alimentos marcar', () => {
  const ctx = contexto();
  empezar(ctx);
  const prohibidos = [/Selecciona\s+(cinco|cuatro|tres|\d)/i, /Marca\s+los\s+\S+\s+más\s+habituales/i, /más habituales/i, /al menos \d/i];
  for (let i = 0; i < RUBROS.length; i++) {
    const html = renderSetup(ctx);
    for (const prohibido of prohibidos) {
      assert.ok(!prohibido.test(html), `el rubro ${i + 1} todavía dice algo como «${prohibido}»`);
    }
    SETUP_ACTIONS['setup-rubro-seguir'](null, ctx);
  }
  assert.equal(SETUP_ACTIONS['setup-marcar-habituales'], undefined, 'el botón de marcar los más habituales sigue existiendo');
});

/* ── Atrás y Continuar ─────────────────────────────────────────────────── */

test('se puede continuar sin marcar nada, los ocho rubros seguidos', () => {
  // Hay casas que no compran vegetales frescos, y otras que no compran nada de
  // limpieza en el colmado. Obligarlas a marcar algo para pasar sería pedirles
  // que mientan para poder seguir.
  const ctx = contexto();
  empezar(ctx);
  for (let i = 0; i < RUBROS.length; i++) {
    assert.equal(ctx.ui.setup.rubro, i);
    SETUP_ACTIONS['setup-rubro-seguir'](null, ctx);
  }
  assert.equal(ctx.ui.setup.paso, PASO.compra, 'el último rubro pasa al paso siguiente');
  assert.deepEqual(ctx.ui.setup.elegidos, [], 'no se marcó nada y no pasó nada');
});

test('el botón de continuar nunca está apagado', () => {
  const ctx = contexto();
  empezar(ctx);
  for (let i = 0; i < RUBROS.length; i++) {
    const html = renderSetup(ctx);
    const boton = html.slice(html.indexOf('data-setup-seguir') - 200, html.indexOf('data-setup-seguir') + 40);
    assert.ok(!boton.includes('disabled'), `el rubro ${i + 1} apaga el botón de continuar`);
    SETUP_ACTIONS['setup-rubro-seguir'](null, ctx);
  }
});

test('retroceder no pierde lo marcado', () => {
  const ctx = contexto();
  empezar(ctx);
  SETUP_ACTIONS['setup-marcar'](casilla('Arroz', true), ctx);
  SETUP_ACTIONS['setup-marcar'](casilla('Yuca', true), ctx);

  SETUP_ACTIONS['setup-rubro-seguir'](null, ctx);
  SETUP_ACTIONS['setup-rubro-seguir'](null, ctx);
  assert.equal(ctx.ui.setup.rubro, 2);

  SETUP_ACTIONS['setup-rubro-atras'](null, ctx);
  SETUP_ACTIONS['setup-rubro-atras'](null, ctx);
  assert.equal(ctx.ui.setup.rubro, 0);
  assert.deepEqual([...ctx.ui.setup.elegidos].sort(), ['Arroz', 'Yuca']);
  // Y se ven marcados de verdad al volver a pintar.
  const html = renderSetup(ctx);
  assert.ok(html.includes('data-nombre="Yuca" checked'), 'Yuca vuelve marcada en su rubro');
});

test('en el primer rubro el botón de la izquierda es Salir, y después es Atrás', () => {
  const ctx = contexto();
  empezar(ctx);
  assert.ok(renderSetup(ctx).includes('>Salir<'));
  SETUP_ACTIONS['setup-rubro-seguir'](null, ctx);
  const html = renderSetup(ctx);
  assert.ok(html.includes('>Atrás<'));
  assert.ok(html.includes('setup-rubro-atras'));
});

/* ── El avance se guarda solo ──────────────────────────────────────────── */

function almacenDeMentira() {
  const datos = new Map();
  return {
    getItem: clave => (datos.has(clave) ? datos.get(clave) : null),
    setItem: (clave, valor) => datos.set(clave, String(valor)),
    removeItem: clave => datos.delete(clave),
    key: indice => [...datos.keys()][indice] ?? null,
    get length() { return datos.size; }
  };
}

test('cerrar la app a mitad de los rubros no tira nada', () => {
  const ctx = contexto();
  empezar(ctx);
  SETUP_ACTIONS['setup-marcar'](casilla('Arroz', true), ctx);
  SETUP_ACTIONS['setup-rubro-seguir'](null, ctx);
  SETUP_ACTIONS['setup-rubro-seguir'](null, ctx);
  SETUP_ACTIONS['setup-marcar'](casilla('Pollo', true), ctx);

  // Se guarda como guarda la app de verdad y se vuelve a leer de cero.
  const storage = almacenDeMentira();
  saveState(ctx.state, storage);
  const vuelto = loadState(storage);
  const setup = avanceGuardado(vuelto);

  assert.ok(setup, 'no se guardó ningún avance');
  assert.equal(setup.paso, PASO.alimentos);
  assert.equal(setup.rubro, 2, 'se vuelve por «Carnes y proteínas»');
  assert.deepEqual([...setup.elegidos].sort(), ['Arroz', 'Pollo']);
});

test('desmarcar también queda guardado', () => {
  const ctx = contexto();
  empezar(ctx);
  SETUP_ACTIONS['setup-marcar'](casilla('Arroz', true), ctx);
  SETUP_ACTIONS['setup-marcar'](casilla('Arroz', false), ctx);
  assert.deepEqual(avanceGuardado(ctx.state).elegidos, []);
});

test('un avance escrito con basura no rompe la pantalla', () => {
  const state = createEmptyState();
  state.settings.canasta = { paso: 99, rubro: -4, elegidos: 'no soy una lista', propios: null, cantidades: 7 };
  const setup = avanceGuardado(state);
  assert.equal(setup.paso, PASOS.length);
  assert.equal(setup.rubro, 0);
  assert.deepEqual(setup.elegidos, []);
  assert.deepEqual(setup.propios, []);
  const ctx = contexto(state);
  ctx.ui.setup = setup;
  revisar(renderSetup(ctx), 'renderSetup con un avance dañado');
});

test('olvidar el avance lo borra del estado', () => {
  const ctx = contexto();
  empezar(ctx);
  assert.ok(ctx.state.settings.canasta);
  olvidarAvance(ctx.state);
  assert.equal(avanceGuardado(ctx.state), null);
});

/* ── Añadir un alimento que no está ────────────────────────────────────── */

test('«Fresa» escrita en Frutas aparece seleccionada en Frutas, en el acto', () => {
  const ctx = contexto();
  irAlRubro(ctx, 4);                       // Frutas
  assert.equal(RUBROS[ctx.ui.setup.rubro].id, 'frutas');

  SETUP_ACTIONS['setup-falta'](null, ctx);
  assert.equal(ctx.ui.setup.anadiendo, true, 'la ventanita se abre');
  assert.ok(renderSetup(ctx).includes('Añadir a Frutas'));

  SETUP_FORMS['setup-nuevo'](null, new Map([['nombre', 'Fresa']]), ctx);

  assert.equal(ctx.ui.setup.anadiendo, false, 'la ventanita se cierra sola');
  assert.ok(ctx.ui.setup.elegidos.includes('Fresa'), 'queda marcada');
  const propia = ctx.ui.setup.propios.find(item => item.nombre === 'Fresa');
  assert.equal(propia.categoria, 'frutas', 'queda en el rubro correcto');
  assert.equal(propia.unidad, 'unidad', 'con la medida sugerida por el rubro');

  // Y se ve, marcada, sin salir de la categoría.
  const html = renderSetup(ctx);
  assert.ok(html.includes('Añadidos por ti'));
  assert.ok(html.includes('data-nombre="Fresa" checked'));
  assert.ok(html.includes('Categoría 5 de 8 — <strong>Frutas</strong>'), 'no se salió de Frutas');
});

test('añadir pide el nombre y nada más', () => {
  const ctx = contexto();
  irAlRubro(ctx, 4);
  SETUP_ACTIONS['setup-falta'](null, ctx);
  const ventanita = renderSetup(ctx);
  const trozo = ventanita.slice(ventanita.indexOf('setup-ventanita'), ventanita.indexOf('</form>', ventanita.indexOf('setup-ventanita')));
  assert.equal((trozo.match(/<input/g) || []).length, 1, 'la ventanita pide más de un dato');
  assert.ok(!trozo.includes('<select'), 'la ventanita pregunta la unidad');
  assert.ok(trozo.includes('>Añadir<'));
});

test('sin nombre no se añade nada, y se dice por qué', () => {
  const ctx = contexto();
  irAlRubro(ctx, 4);
  SETUP_ACTIONS['setup-falta'](null, ctx);
  SETUP_FORMS['setup-nuevo'](null, new Map([['nombre', ' ']]), ctx);
  assert.deepEqual(ctx.ui.setup.propios, []);
  assert.equal(ctx.ui.setup.anadiendo, true, 'la ventanita se queda abierta');
  assert.match(ctx.ui.setup.errorNuevo, /nombre/i);
});

test('cada rubro sugiere su propia medida', () => {
  const esperado = { proteinas: 'lb', lacteos: 'unidad', desayunos: 'paquete', vegetales: 'lb' };
  for (const [id, unidad] of Object.entries(esperado)) {
    const ctx = contexto();
    irAlRubro(ctx, RUBROS.findIndex(item => item.id === id));
    SETUP_ACTIONS['setup-falta'](null, ctx);
    SETUP_FORMS['setup-nuevo'](null, new Map([['nombre', 'Algo raro']]), ctx);
    assert.equal(ctx.ui.setup.propios[0].unidad, unidad, `el rubro «${id}» debería sugerir ${unidad}`);
  }
});

test('escribir algo que ya existe lo marca en vez de duplicarlo, y dice dónde estaba', () => {
  const ctx = contexto();
  irAlRubro(ctx, 4);                       // en Frutas se escribe «Arroz»
  SETUP_ACTIONS['setup-falta'](null, ctx);
  SETUP_FORMS['setup-nuevo'](null, new Map([['nombre', 'arroz']]), ctx);

  assert.deepEqual(ctx.ui.setup.propios, [], 'no se fabrica un alimento nuevo');
  assert.ok(ctx.ui.setup.elegidos.includes('Arroz'), 'se marca el que ya existía, con su nombre bueno');
  assert.match(ctx.avisos.at(-1), /Arroz, granos y pastas/, 'se dice en qué rubro estaba');
});

test('escribir dos veces el mismo alimento no lo duplica', () => {
  const ctx = contexto();
  irAlRubro(ctx, 4);
  for (let i = 0; i < 2; i++) {
    SETUP_ACTIONS['setup-falta'](null, ctx);
    SETUP_FORMS['setup-nuevo'](null, new Map([['nombre', 'Fresa']]), ctx);
  }
  assert.equal(ctx.ui.setup.propios.filter(item => item.nombre === 'Fresa').length, 1);
  assert.equal(ctx.ui.setup.elegidos.filter(nombre => nombre === 'Fresa').length, 1);
  assert.match(ctx.avisos.at(-1), /ya estaba marcado/i);
});

test('lo añadido a mano sobrevive a cerrar la app', () => {
  const ctx = contexto();
  irAlRubro(ctx, 4);
  SETUP_ACTIONS['setup-falta'](null, ctx);
  SETUP_FORMS['setup-nuevo'](null, new Map([['nombre', 'Fresa']]), ctx);

  const storage = almacenDeMentira();
  saveState(ctx.state, storage);
  const setup = avanceGuardado(loadState(storage));
  assert.ok(setup.elegidos.includes('Fresa'));
  assert.equal(setup.propios[0].categoria, 'frutas');
});

/* ── Lo que se guarda al final ─────────────────────────────────────────── */

test('terminar crea una sola canasta base y ni un solo cambio de mes', () => {
  const state = createEmptyState();
  guardarEnLaCanasta(state, [
    { nombre: 'Arroz', cantidad: '20', unidad: 'lb' },
    { nombre: 'Huevo', cantidad: '60', unidad: 'unidad' },
    { nombre: 'Fresa', cantidad: '', unidad: 'unidad', categoria: 'frutas', origen: 'manual' }
  ]);

  assert.equal(habitualLines(state).length, 3, 'hay una sola canasta, con sus tres líneas');
  assert.deepEqual(state.monthOverrides, {}, 'no se copió la canasta a ningún mes');
  assert.deepEqual(state.monthPlans, {}, 'no se abrió ningún mes');
  // La cantidad que nadie escribió queda pendiente, no en cero.
  const fresa = productByName(state, 'Fresa');
  assert.equal(habitualLines(state).find(linea => linea.productId === fresa.id).quantity, null);
});

test('un alimento escrito en Frutas se guarda en Frutas', () => {
  const state = createEmptyState();
  guardarEnLaCanasta(state, [{ nombre: 'Fresa', cantidad: '4', unidad: 'unidad', categoria: categoriaDelRubro('frutas'), origen: 'manual' }]);
  const fresa = productByName(state, 'Fresa');
  assert.equal(fresa.category, 'frutas');
  assert.equal(fresa.controlUnit, 'unidad');
});

test('guardar dos veces no duplica la línea de un alimento', () => {
  const state = createEmptyState();
  guardarEnLaCanasta(state, [{ nombre: 'Arroz', cantidad: '20', unidad: 'lb' }]);
  guardarEnLaCanasta(state, [{ nombre: 'Arroz', cantidad: '25', unidad: 'lb' }]);
  assert.equal(habitualLines(state).length, 1);
  assert.equal(habitualLines(state)[0].quantity, 25, 'la segunda vez corrige, no añade');
  assert.equal(state.products.filter(item => item.name === 'Arroz').length, 1);
});

test('lo que ya estaba en la canasta no se pierde al volver a guardar otra cosa', () => {
  const state = createEmptyState();
  guardarEnLaCanasta(state, [{ nombre: 'Arroz', cantidad: '20', unidad: 'lb' }]);
  guardarEnLaCanasta(state, [{ nombre: 'Huevo', cantidad: '60', unidad: 'unidad' }]);
  assert.equal(habitualLines(state).length, 2);
});

/* ── De los rubros a las cantidades ────────────────────────────────────── */

test('lo marcado en los ocho rubros llega entero al paso de las cantidades', () => {
  const ctx = contexto();
  empezar(ctx);
  SETUP_ACTIONS['setup-marcar'](casilla('Yuca', true), ctx);
  SETUP_ACTIONS['setup-rubro-seguir'](null, ctx);
  SETUP_ACTIONS['setup-marcar'](casilla('Arroz', true), ctx);
  irAlRubroDirecto(ctx, 4);
  SETUP_ACTIONS['setup-falta'](null, ctx);
  SETUP_FORMS['setup-nuevo'](null, new Map([['nombre', 'Fresa']]), ctx);

  ctx.ui.setup.paso = PASO.cantidades;
  const html = renderSetup(ctx);
  revisar(html, 'paso de cantidades');
  for (const nombre of ['Yuca', 'Arroz', 'Fresa']) {
    assert.ok(html.includes(`value="${nombre}"`), `falta ${nombre} en las cantidades`);
  }
  assert.ok(html.includes('data-categoria="frutas"'), 'la fruta escrita a mano lleva su rubro hasta el final');
});

// Saltar de rubro sin pasar por `setup-empezar` otra vez.
function irAlRubroDirecto(ctx, indice) {
  while (ctx.ui.setup.rubro < indice) SETUP_ACTIONS['setup-rubro-seguir'](null, ctx);
}

test('un alimento desmarcado después de escribirlo no llega a la canasta', () => {
  const ctx = contexto();
  irAlRubro(ctx, 4);
  SETUP_ACTIONS['setup-falta'](null, ctx);
  SETUP_FORMS['setup-nuevo'](null, new Map([['nombre', 'Fresa']]), ctx);
  SETUP_ACTIONS['setup-marcar'](casilla('Fresa', false), ctx);

  ctx.ui.setup.paso = PASO.cantidades;
  const html = renderSetup(ctx);
  assert.ok(!html.includes('value="Fresa"'), 'la fresa desmarcada no debería estar en las cantidades');
  // Pero sigue en la lista de su rubro, por si se quiere volver a marcar sin
  // escribirla otra vez.
  ctx.ui.setup.paso = PASO.alimentos;
  assert.ok(renderSetup(ctx).includes('data-nombre="Fresa"'));
});

/* ── Volver a abrir la app ─────────────────────────────────────────────── */

test('un avance restaurado abre por su rubro, no por la pantalla de entrada', () => {
  const ctx = contexto();
  empezar(ctx);
  SETUP_ACTIONS['setup-rubro-seguir'](null, ctx);
  SETUP_ACTIONS['setup-rubro-seguir'](null, ctx);
  SETUP_ACTIONS['setup-marcar'](casilla('Pollo', true), ctx);

  // Lo que hace la app al arrancar: leer el estado y reconstruir el asistente.
  const otro = contexto(ctx.state);
  otro.ui.setup = avanceGuardado(ctx.state);
  const html = renderSetup(otro);
  assert.ok(html.includes('Categoría 3 de 8'), 'debería abrir por donde se quedó');
  assert.ok(!html.includes('Ahora vamos a crear la canasta base'), 'no debería volver a la pantalla de entrada');
  assert.ok(html.includes('data-nombre="Pollo" checked'));
});

// Esta prueba es de las feas —lee el código en vez de ejecutarlo— y existe por
// una razón concreta: el asistente se restauraba en `abrirCajon`, que solo corre
// al cambiar de cuenta. En el arranque normal, sin sesión, el estado se lee
// arriba del todo de app.js y nunca pasaba por ahí, así que el avance guardado
// no se recuperaba nunca. Se veía abriendo la app; no lo veía ninguna prueba,
// porque `app.js` toca el DOM al cargarse y no se puede importar aquí.
test('app.js recupera el avance guardado por las dos puertas', () => {
  const codigo = readFileSync(resolve(import.meta.dirname, '..', 'src', 'app.js'), 'utf8');
  assert.ok(/setup: avanceGuardado\(state\)/.test(codigo), 'el arranque normal no recupera el avance guardado');
  assert.ok(/ui\.setup = avanceGuardado\(state\)/.test(codigo), 'abrir el cajón de otra cuenta no recupera el avance guardado');
  assert.ok(/import \{[^}]*avanceGuardado[^}]*\} from '\.\/setup\.js'/.test(codigo), 'app.js no importa avanceGuardado');
});
