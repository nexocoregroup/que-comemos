import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Las pantallas se pueden probar, y hasta ahora no se probaban.
//
// Dos veces la aplicación se quedó en blanco porque una pantalla llamaba a algo
// que ya no existía. Ninguna prueba lo vio: todas probaban el modelo, y las
// pantallas «tocan el DOM, no se pueden cargar en Node».
//
// Eso era verdad de `app.js`, que lee `document` al arrancar. No lo es de los
// módulos de pantalla: `renderMes`, `renderCompra` y `renderMas` reciben un
// contexto y devuelven una cadena de HTML. Se pueden llamar aquí mismo, con un
// estado de verdad, y comprobar qué sale. Eso caza el «no es una función», el
// campo que cambió de forma y el `undefined` que se cuela en la pantalla.

import { createDemoState } from '../src/demo.js';
import { addProduct, createEmptyState, createReview, saveReview, setHabitualLine, setMonthChange, setPersonActive, todayISO, upsertPerson } from '../src/model.js';
import { addRoutine } from '../src/routines.js';
import { PASOS, emptyMes, modalRutina, renderMes } from '../src/page-mes.js';
import { emptyCompra, renderCompra } from '../src/page-compra.js';
import { PAGINAS_MAS, emptyMas, estadoDeLaCopia, renderMas } from '../src/page-mas.js';

const MES = todayISO().slice(0, 7);

// Lo mínimo que un módulo de pantalla necesita. Las funciones no hacen nada
// porque aquí solo se pinta: si una pantalla intentara guardar algo al
// dibujarse, eso sería el fallo, no la prueba.
function contexto(state, extra = {}) {
  return {
    state,
    ui: {
      page: 'hoy', modal: null, reviewId: null, correctingReview: false,
      mes: emptyMes(MES), compra: emptyCompra(MES), mas: emptyMas(),
      ...extra
    },
    commit: () => {}, toast: () => {}, render: () => {},
    closeModal: () => {}, openModal: () => {}, startTour: () => {},
    servicios: { transcribe: false, chat: false, enElAparato: { voz: false } }
  };
}

// Un `undefined` dentro de una plantilla no lanza: se imprime tal cual y el
// usuario ve la palabra en pantalla. Es el fallo más silencioso de todos.
function revisar(html, donde) {
  assert.equal(typeof html, 'string', `${donde} no devolvió HTML`);
  assert.ok(html.length > 40, `${donde} devolvió una pantalla prácticamente vacía`);
  for (const basura of ['undefined', 'NaN', '[object Object]', 'null null']) {
    assert.ok(!html.includes(basura), `${donde} imprime «${basura}» en pantalla`);
  }
  // Un `${...}` sin resolver significa que alguien anidó mal una plantilla.
  assert.ok(!/\$\{/.test(html), `${donde} dejó una plantilla sin resolver`);
}

/* ── Con datos ─────────────────────────────────────────────────────────── */

test('plan mensual se dibuja con datos', () => {
  const ctx = contexto(createDemoState());
  revisar(renderMes(ctx), 'renderMes (resumen)');
  ctx.ui.mes.vista = 'calendario';
  revisar(renderMes(ctx), 'renderMes (calendario)');
});

test('los siete pasos de preparar el mes se dibujan', () => {
  const ctx = contexto(createDemoState());
  for (const paso of PASOS) {
    ctx.ui.mes.paso = paso.id;
    revisar(renderMes(ctx), `paso «${paso.id}»`);
  }
});

test('el formulario de una rutina se dibuja, con atajo y sin él', () => {
  const ctx = contexto(createDemoState());
  revisar(modalRutina(ctx, { month: MES }), 'modalRutina');
  revisar(modalRutina(ctx, { month: MES, atajo: 'primer-tercer', kind: 'outside' }), 'modalRutina (primer y tercer domingo)');
});

test('la compra se dibuja con las dos bases y los tres tramos', () => {
  const ctx = contexto(createDemoState());
  for (const base of ['casa', 'menu']) {
    ctx.ui.compra.base = base;
    for (const tramo of ['mes', 'primera', 'segunda']) {
      ctx.ui.compra.tramo = tramo;
      revisar(renderCompra(ctx), `renderCompra (${base} · ${tramo})`);
    }
  }
});

test('todas las pantallas de Más se dibujan', () => {
  const ctx = contexto(createDemoState());
  for (const pagina of ['mas', ...PAGINAS_MAS]) {
    ctx.ui.page = pagina;
    revisar(renderMas(ctx), `renderMas («${pagina}»)`);
  }
});

test('la canasta se dibuja en sus dos vistas', () => {
  const ctx = contexto(createDemoState(), { page: 'canasta' });
  revisar(renderMas(ctx), 'canasta (lo de siempre)');
  ctx.ui.mas.canastaVista = 'cambios';
  revisar(renderMas(ctx), 'canasta (cambios del mes)');
});

// Familia es la pantalla donde un fallo de dibujo tiene consecuencias: si una
// alergia no se pinta, quien cocina no la ve. Se prueba con las cuatro
// situaciones a la vez, que es como se ve en una casa de verdad.
test('familia se dibuja con alergias, con gente de baja y con motivos sin decir', () => {
  const state = createEmptyState();
  const mani = addProduct(state, { name: 'Maní', controlUnit: 'lb', purchaseUnit: 'lb' }).id;
  upsertPerson(state, { name: 'Sofía', kind: 'nino', restricciones: [
    { productId: mani, texto: '', motivo: 'alergia' },
    { productId: null, texto: 'Berenjena', motivo: 'preferencia' },
    { productId: null, texto: 'Mariscos', motivo: null }
  ], habitual: [] });
  const luis = upsertPerson(state, { name: 'Luis', kind: 'adolescente', restricciones: [], habitual: [] });
  setPersonActive(state, luis.id, false);

  const ctx = contexto(state, { page: 'familia' });
  const html = renderMas(ctx);
  revisar(html, 'familia');
  assert.ok(html.includes('restriccion-alergia'), 'la alergia se distingue');
  assert.ok(html.includes('Dado de baja'), 'quien se fue sigue a la vista, marcado');
  assert.ok(html.includes('Ya no viven aquí'));
  assert.ok(html.includes('Adolescente'), 'la clasificación nueva se pinta');
  assert.ok(html.includes('sin decir por qué'), 'se avisa de lo que falta por completar');
  assert.ok(html.indexOf('Maní') < html.indexOf('Berenjena'), 'la alergia va delante de la preferencia');
});

/* ── Sin datos: los estados vacíos son los que más se ven ──────────────── */

test('todas las pantallas se dibujan con el estado vacío', () => {
  const vacio = createEmptyState();
  const ctx = contexto(vacio);
  revisar(renderMes(ctx), 'renderMes vacío');
  revisar(renderCompra(ctx), 'renderCompra vacía');
  for (const pagina of ['mas', ...PAGINAS_MAS]) {
    ctx.ui.page = pagina;
    revisar(renderMas(ctx), `renderMas vacío («${pagina}»)`);
  }
  for (const paso of PASOS) {
    ctx.ui.mes.paso = paso.id;
    revisar(renderMes(ctx), `paso vacío «${paso.id}»`);
  }
});

test('un estado vacío ofrece qué hacer, no una pantalla en blanco', () => {
  const ctx = contexto(createEmptyState());
  const html = renderMes(ctx);
  assert.ok(html.includes('rutina'), 'el plan mensual vacío no explica qué es una rutina');
  assert.ok(html.includes('data-action='), 'el plan mensual vacío no ofrece ninguna acción');
});

/* ── Que no se filtre el vocabulario que se quitó ──────────────────────── */

// «Canasta base», «canasta mensual» y «base de cálculo» eran los tres términos
// que obligaban a entender la estructura interna para usar la app. Que no
// vuelvan por una plantilla olvidada.
test('ninguna pantalla enseña el vocabulario técnico que se retiró', () => {
  const PROHIBIDAS = ['canasta base', 'canasta del mes', 'canasta mensual', 'base de cálculo', 'unidad de control', 'promover a base', 'instancia mensual'];
  const state = createDemoState();
  const ctx = contexto(state);
  const pantallas = [['mes', () => renderMes(ctx)], ['compra', () => renderCompra(ctx)]];
  for (const pagina of ['mas', ...PAGINAS_MAS]) pantallas.push([pagina, () => { ctx.ui.page = pagina; return renderMas(ctx); }]);

  const encontradas = [];
  for (const [nombre, dibujar] of pantallas) {
    const html = dibujar().toLocaleLowerCase('es');
    for (const termino of PROHIBIDAS) if (html.includes(termino)) encontradas.push(`${nombre}: «${termino}»`);
  }
  assert.deepEqual(encontradas, [], 'términos técnicos que volvieron a la interfaz');
});

/* ── Que un extra del mes se vea como tal ──────────────────────────────── */

test('un extra de un mes se enseña marcado, y no como parte de lo habitual', () => {
  const state = createEmptyState();
  const arroz = addProduct(state, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' });
  const cangrejo = addProduct(state, { name: 'Cangrejo', controlUnit: 'lb', purchaseUnit: 'lb' });
  setHabitualLine(state, arroz.id, 20, 'lb');
  setMonthChange(state, MES, cangrejo.id, { quantity: 4, unit: 'lb' });

  const ctx = contexto(state, { page: 'canasta' });
  ctx.ui.mas.canastaVista = 'habitual';
  const habitual = renderMas(ctx);
  assert.ok(habitual.includes('Arroz'), 'el arroz debería estar en lo de siempre');
  assert.ok(!habitual.includes('Cangrejo'), 'el cangrejo de este mes NO puede aparecer como habitual');

  ctx.ui.mas.canastaVista = 'cambios';
  const cambios = renderMas(ctx);
  assert.ok(cambios.includes('Cangrejo'), 'el cangrejo debería estar en los cambios del mes');
  revisar(cambios, 'canasta (cambios con un extra)');
});

/* ── La revisión, que es la pantalla que más se toca ───────────────────── */

test('la revisión ofrece buscar, esconder lo contestado y dictar', () => {
  const state = createDemoState();
  const revision = createReview(state, todayISO());
  const ctx = contexto(state, { page: 'revision' });
  ctx.ui.reviewId = revision.id;

  const html = renderMas(ctx);
  revisar(html, 'revisión abierta');
  assert.ok(html.includes('id="revision-filtro"'), 'falta el buscador');
  assert.ok(html.includes('revision-solo-faltan'), 'falta el filtro de pendientes');
  assert.ok(html.includes('¿Cuánto queda?'), 'la pregunta principal debería ser «¿cuánto queda?»');
});

// El filtro esconde filas del DOM, y `saveReview` reconstruye la revisión con lo
// que venga en el formulario. Si una fila escondida no viajara, buscar «arroz»
// borraría las otras veintinueve respuestas. Esta prueba existe por eso.
test('buscar en la revisión no deja fuera lo ya contestado', () => {
  const state = createDemoState();
  const revision = createReview(state, todayISO());
  assert.ok(revision.productIds.length >= 3, 'el ejemplo debería traer varios alimentos');
  const ctx = contexto(state, { page: 'revision' });
  ctx.ui.reviewId = revision.id;

  // Un filtro que no deja pasar nada: todas las filas tienen que seguir viajando.
  ctx.ui.mas.revisionFiltro = 'zzzzz';
  const html = renderMas(ctx);
  for (const id of revision.productIds) {
    assert.ok(html.includes(`name="consume-${id}"`), `el alimento ${id} desapareció del formulario al filtrar`);
  }
  assert.ok(html.includes('type="hidden"'), 'lo escondido debería viajar en campos ocultos');
});

test('la revisión se puede mirar solo por lo que falta', () => {
  const state = createDemoState();
  const revision = createReview(state, todayISO());
  const [primero] = revision.productIds;
  saveReview(state, revision.id, { [primero]: 0 });

  const ctx = contexto(state, { page: 'revision' });
  ctx.ui.reviewId = revision.id;
  ctx.ui.mas.revisionSoloFaltan = true;
  const html = renderMas(ctx);
  // El contestado sale del listado visible pero sigue en el formulario.
  assert.ok(!html.includes(`data-review-product="${primero}"`), 'el alimento ya contestado debería esconderse');
  assert.ok(html.includes(`name="consume-${primero}"`), 'y aun así seguir viajando al guardar');
});

/* ── La copia de seguridad, que ahora es la única red que hay ──────────── */

// El respaldo automático de Android está apagado a propósito, así que perder el
// teléfono sin copia es perderlo todo. La app tiene que insistir —pero solo
// cuando hay algo que perder y solo cuando ya toca.
test('la app avisa de la copia cuando toca, y calla cuando no', () => {
  const vacio = createEmptyState();
  assert.equal(estadoDeLaCopia(vacio).hayDatos, false, 'una casa vacía no necesita que le riñan');

  const conDatos = createDemoState();
  const nunca = estadoDeLaCopia(conDatos);
  assert.equal(nunca.ultima, null);
  assert.equal(nunca.urgente, true, 'sin ninguna copia, el aviso tiene que salir');

  conDatos.settings = { ...conDatos.settings, lastBackupAt: todayISO() };
  const hoyMismo = estadoDeLaCopia(conDatos);
  assert.equal(hoyMismo.dias, 0);
  assert.equal(hoyMismo.urgente, false, 'recién guardada no debería avisar');

  // Un mes es el umbral: lo que se perdería ya duele.
  //
  // La fecha se cuenta hacia atrás desde `todayISO()`, que es el día del
  // calendario local, y no desde `Date.now()`. Restando milisegundos a `Date.now()`
  // y pasando el resultado por `toISOString()` se mezclaban dos husos: con el
  // reloj local en UTC-4 y pasadas las ocho de la noche, el día UTC ya era el
  // siguiente y la resta daba 39. La prueba fallaba por la hora a la que se
  // ejecutara, que es lo peor que le puede pasar a una prueba.
  const hace40 = new Date(`${todayISO()}T12:00:00`);
  hace40.setDate(hace40.getDate() - 40);
  const hace40ISO = `${hace40.getFullYear()}-${String(hace40.getMonth() + 1).padStart(2, '0')}-${String(hace40.getDate()).padStart(2, '0')}`;
  conDatos.settings.lastBackupAt = hace40ISO;
  const vieja = estadoDeLaCopia(conDatos);
  assert.equal(vieja.dias, 40);
  assert.equal(vieja.urgente, true, 'una copia de hace cuarenta días debería avisar');
});

/* ── Que una rutina se lea en palabras ─────────────────────────────────── */

test('el plan mensual describe una rutina en palabras, no en números', () => {
  const state = createEmptyState();
  addRoutine(state, { kind: 'outside', slots: ['almuerzo'], weekdays: [7], weeks: [1, 3], scope: 'permanent', label: 'Almuerzo fuera' });
  const ctx = contexto(state);
  const html = renderMes(ctx);
  assert.ok(/domingo/i.test(html), 'la regla debería decir «domingo», no un número de día');
  assert.ok(!html.includes('weekdays') && !html.includes('[7]'), 'se está enseñando la estructura interna');
  revisar(html, 'renderMes con una rutina de domingos');
});


/* ── Que el micrófono del teclado pueda escribir en los campos ─────────────

   El micrófono del teclado es la alternativa que sigue funcionando cuando el de
   la aplicación falla, y es además la que no puede llevarse la app por delante:
   corre dentro del proceso del teclado, no dentro de este. Por eso importa que
   los campos lo admitan, y por eso se comprueba aquí en vez de confiar en que
   nadie añada mañana un `readonly` sin pensarlo.

   Lo que de verdad apaga la tecla del micrófono en un WebView de Android:

     · `readonly` y `disabled` — no hay dónde escribir, así que no hay teclado.
     · `inputmode="none"` — le dice al sistema que no saque teclado ninguno.

   Aparte queda un caso que no es un fallo y conviene no confundir: en un campo
   `type="number"` el teclado que sale es el numérico, y el numérico no trae
   tecla de micrófono. Eso lo decide Android, no esta aplicación. La respuesta a
   eso es el panel de dictado, que oye una frase entera —«quedan dos libras de
   arroz»— y la reparte entre las casillas; no es quitarle el `type="number"` a
   un campo donde solo caben números. */

test('ningún campo de texto apaga el micrófono del teclado', () => {
  const state = createDemoState();
  const ctx = contexto(state);
  const pantallas = [['mes', () => renderMes(ctx)], ['compra', () => renderCompra(ctx)]];
  for (const pagina of ['mas', ...PAGINAS_MAS]) pantallas.push([pagina, () => { ctx.ui.page = pagina; return renderMas(ctx); }]);

  const culpables = [];
  for (const [nombre, dibujar] of pantallas) {
    const html = dibujar();
    // Los campos donde se escriben palabras: texto libre, búsqueda y áreas.
    const campos = html.match(/<(?:input|textarea)\b[^>]*>/g) || [];
    for (const campo of campos) {
      const tipo = (campo.match(/type="([^"]*)"/) || [])[1] || (campo.startsWith('<textarea') ? 'textarea' : 'text');
      if (!['text', 'search', 'textarea'].includes(tipo)) continue;
      if (/\breadonly\b/.test(campo)) culpables.push(`${nombre}: readonly en ${tipo}`);
      if (/\bdisabled\b/.test(campo)) culpables.push(`${nombre}: disabled en ${tipo}`);
      if (/inputmode="none"/.test(campo)) culpables.push(`${nombre}: inputmode="none" en ${tipo}`);
    }
  }
  assert.deepEqual(culpables, [], 'campos donde el micrófono del teclado no podría escribir');
});

test('los cuadros de texto libre vienen preparados para dictar de corrido', () => {
  // `autocapitalize="sentences"` hace que lo dictado empiece en mayúscula como
  // una frase y no como un grito; `spellcheck` es lo que subraya la palabra que
  // el reconocimiento oyó mal, que es exactamente lo que hay que repasar.
  const fuentes = ['src/voz.js', 'src/bulk-entry.js', 'src/setup.js', 'src/app.js'];
  const sinPreparar = [];
  for (const archivo of fuentes) {
    const codigo = readFileSync(archivo, 'utf8');
    for (const etiqueta of codigo.match(/<textarea\b[^>]*>/g) || []) {
      if (!/autocapitalize=/.test(etiqueta)) sinPreparar.push(`${archivo}: textarea sin autocapitalize`);
    }
  }
  assert.deepEqual(sinPreparar, [], 'cuadros de texto sin preparar para el dictado');
});
