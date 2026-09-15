// «Organizar mi casa»: cuatro pasos y se acabó.
//
// El asistente anterior ofrecía cuatro formas distintas de empezar antes de
// dejar marcar un solo alimento. Elegir entre cuatro caminos no es avanzar: es
// una pregunta más que responder antes de haber entendido para qué sirve la
// app. Aquí hay un camino, y los cuatro pasos son los cuatro que el usuario
// pidió: marcar lo habitual, añadir lo suyo, decir cuánto, y preparar el primer
// menú del mes.
//
// Dos reglas gobiernan el archivo:
//
// 1. Una cosa se escribe una vez. Marcar «Arroz» lo registra en el catálogo y
//    pone su línea en la canasta habitual. No se vuelve a pedir en otro sitio.
// 2. Volver a pasar por aquí no borra nada. Lo que ya estaba guardado se
//    precarga a la vista —marcado y con su cantidad escrita—, lo que no se toca
//    se queda intacto, y los cambios de cada mes ni se rozan: este archivo no
//    llama a nada que escriba en `monthOverrides`.

import { CATEGORIES, SEED_PRODUCTS, seedByCategory } from './catalog-seed.js';
import { UNITS, addProduct, findSimilarProducts, habitualLines, product, productByName, setHabitualBasket, todayISO } from './model.js';
import { normalizeName, parseProductText } from './text-parse.js';
import { cancelarDictado, capacidad, dictar, pararDictado } from './device.js';
import { button, esc, notice, options } from './ui-kit.js';

export const PASOS = [
  { id: 1, titulo: '¿Qué se consume normalmente en tu casa?', corto: 'Alimentos' },
  { id: 2, titulo: '¿Falta algo habitual de tu casa?', corto: 'Lo tuyo' },
  { id: 3, titulo: '¿Cuánto se consume al mes?', corto: 'Cantidades' },
  { id: 4, titulo: 'Preparar mi primer menú mensual', corto: 'El mes' }
];

// El paso 0 no es un paso: es la pantalla que promete una sola cosa antes de
// pedir nada. Por eso no cuenta en la barra ni lleva número.
export const emptySetup = () => ({
  paso: 0,
  precargado: false,
  elegidos: [],        // nombres del catálogo marcados
  propios: [],         // [{ nombre, unidad }] escritos o dictados en el paso 2
  cantidades: {},      // nombre → { cantidad, unidad, yaGuardada }
  texto: '',           // lo que se lleva escrito o dictado en el paso 2
  filas: null,         // las filas separadas del texto, antes de aceptarlas
  categoria: CATEGORIES[0].id,
  busqueda: '',
  escuchando: false,
  avisoVoz: '',
  pistaVoz: '',
  errorVoz: '',
  guardados: 0
});

const ETIQUETA_UNIDAD = { unidad: 'unidades', lb: 'libras', taza: 'tazas', lata: 'latas', paquete: 'paquetes', rueda: 'ruedas', rebanada: 'rebanadas' };
const unidades = elegida => options(UNITS.map(unidad => [unidad, ETIQUETA_UNIDAD[unidad] || unidad]), elegida);
const unidadValida = unidad => (UNITS.includes(unidad) ? unidad : null);

// El catálogo indexado por nombre normalizado: es la comparación que usa el
// modelo, así que «TORTILLAS DE MAIZ» y «tortilla de maíz» caen en la misma
// casilla y no se crea el mismo alimento dos veces.
const POR_CLAVE = new Map();
for (const semilla of SEED_PRODUCTS) {
  POR_CLAVE.set(normalizeName(semilla.name), semilla);
  for (const alias of semilla.aliases) if (!POR_CLAVE.has(normalizeName(alias))) POR_CLAVE.set(normalizeName(alias), semilla);
}
const semillaPorNombre = nombre => POR_CLAVE.get(normalizeName(nombre)) || null;

// `findSimilarProducts` compara contra los alimentos de una casa, y el primer
// día no hay ninguno: sin esto, «pan pita» el primer día no se parecería a nada
// y «yogur de fresa» tampoco. El catálogo se le presenta con la forma que esa
// función lee —nombre y alias— para que el parecido lo calcule el comparador
// del modelo y no una segunda versión escrita aquí.
const CATALOGO_COMO_CASA = { products: SEED_PRODUCTS.map(item => ({ id: item.name, name: item.name, aliases: item.aliases })) };
const parecidoA = (state, nombre) =>
  findSimilarProducts(state, nombre, { limit: 1 })[0]?.product?.name
  || findSimilarProducts(CATALOGO_COMO_CASA, nombre, { limit: 1 })[0]?.product?.name
  || '';

const AVISO_VOZ_AJENA = 'Este aparato no trae reconocimiento de voz propio, así que lo dictado viaja a los servidores del navegador para convertirse en texto. Si prefieres que no salga de aquí, escríbelo.';

/* ── Pantalla inicial ──────────────────────────────────────────────────── */

// Una promesa, un botón. La opción de ver un ejemplo va plegada debajo para que
// se pueda mirar sin salir de aquí y sin competir con lo que hay que pulsar.
function pantallaInicio() {
  return `<section class="setup setup-inicio">
    <p class="eyebrow">¿Qué comemos?</p>
    <h2 class="setup-promesa">Organiza una vez lo habitual de tu casa y prepara cada mes cambiando solamente lo diferente.</h2>
    <div class="pantalla-acciones">${button('Organizar mi casa', 'setup-empezar', 'btn-primary btn-grande')}</div>
    <details class="plegable setup-ejemplo">
      <summary>Ver un ejemplo</summary>
      <p class="muted">Una casa marca arroz, huevos, salami, plátanos y detergente, y dice cuánto lleva de cada uno en un mes corriente. Eso es <strong>su canasta habitual</strong>: se escribe una vez.</p>
      <p class="muted">En diciembre compran el doble de arroz y no compran plátanos. En lugar de escribir la lista entera otra vez, solo anotan esas dos cosas: son los <strong>cambios de este mes</strong>. Enero vuelve solo a lo habitual.</p>
    </details>
    <p class="tiny muted setup-nota">Se puede salir en cualquier momento. Lo que marques se guarda al llegar al paso de las cantidades.</p>
  </section>`;
}

/* ── Paso 1: los alimentos habituales ──────────────────────────────────── */

function pasoHabituales(setup) {
  const elegidos = new Set(setup.elegidos);
  const busqueda = normalizeName(setup.busqueda || '');
  const lista = busqueda
    ? SEED_PRODUCTS.filter(item => normalizeName(item.name).includes(busqueda) || item.aliases.some(alias => normalizeName(alias).includes(busqueda)))
    : seedByCategory(setup.categoria);
  const habituales = busqueda ? [] : seedByCategory(setup.categoria).filter(item => item.common && !elegidos.has(item.name));

  return `<p class="pantalla-intro">Te mostramos algunos de los alimentos más habituales para que no tengas que escribirlos uno por uno. Esta lista es solo un punto de partida: cada hogar es diferente y podrás añadir todo lo que falte.</p>

    <div class="setup-buscador">
      <label class="field setup-search"><span class="sr-only">Buscar un alimento</span>
        <input type="search" id="setup-buscar" value="${esc(setup.busqueda)}" placeholder="Buscar entre ${SEED_PRODUCTS.length} alimentos…" autocomplete="off" aria-label="Buscar un alimento">
      </label>
      ${button('Buscar', 'setup-buscar', 'btn-secondary')}
      ${setup.busqueda ? button('Ver todo', 'setup-limpiar-busqueda', 'btn-quiet') : ''}
    </div>

    ${busqueda ? '' : `<div class="setup-cats" role="group" aria-label="Filtrar por categoría">${CATEGORIES.map(cat => {
      const marcados = seedByCategory(cat.id).filter(item => elegidos.has(item.name)).length;
      return `<button type="button" class="setup-cat ${cat.id === setup.categoria ? 'active' : ''}" aria-pressed="${cat.id === setup.categoria}" data-action="setup-categoria" data-cat="${esc(cat.id)}">
        <span aria-hidden="true">${cat.emoji}</span> ${esc(cat.label)}<span class="setup-cat-count" data-setup-cuenta="${esc(cat.id)}">${marcados || ''}</span></button>`;
    }).join('')}</div>`}

    ${habituales.length ? `<div class="inline setup-bulk">${button(`Marcar los ${habituales.length} más habituales`, 'setup-marcar-habituales', 'btn-secondary btn-small')}</div>` : ''}

    <div class="setup-lista">${lista.map(item => fichaAlimento(item, elegidos.has(item.name))).join('')
      || `<p class="muted">Nada coincide con «${esc(setup.busqueda)}». Añádelo tú en el paso siguiente.</p>`}</div>

    <div class="setup-falta">
      <button type="button" class="enlace" data-action="setup-falta">¿No encuentras un alimento? Añadirlo</button>
    </div>

    <div class="modal-actions setup-actions">
      ${button('Salir', 'setup-salir', 'btn-quiet')}
      <span class="tour-spacer"></span>
      <span class="pill" data-setup-total role="status" aria-live="polite">${textoMarcados(setup.elegidos.length)}</span>
      ${button('Continuar', 'setup-siguiente', 'btn-primary', `data-setup-seguir ${setup.elegidos.length ? '' : 'disabled'}`)}
    </div>`;
}

const textoMarcados = total => `${total} marcado${total === 1 ? '' : 's'}`;

function fichaAlimento(item, marcado) {
  return `<label class="chip-check setup-ficha ${marcado ? 'marcado' : ''}">
    <input type="checkbox" data-action="setup-marcar" data-setup-marca data-nombre="${esc(item.name)}" data-cat="${esc(item.category)}" ${marcado ? 'checked' : ''}>
    <span class="setup-ficha-texto">${esc(item.name)}<span class="tiny">${esc(ETIQUETA_UNIDAD[item.controlUnit] || item.controlUnit)}</span></span>
  </label>`;
}

/* ── Paso 2: lo propio de cada casa ────────────────────────────────────── */

function pasoPropios(setup) {
  const motor = capacidad('dictar');
  return `<p class="pantalla-intro">Añade aquí los alimentos que no encontraste en la lista. Puedes escribir varios de corrido.</p>

    <form data-form="setup-propios" class="stack">
      <label class="field"><span class="sr-only">Alimentos que faltan</span>
        <textarea name="texto" rows="3" data-setup-texto placeholder="Tortillas de maíz, queso gouda, jamón de pavo y yogurt de fresa." aria-label="Alimentos que faltan">${esc(setup.texto)}</textarea>
      </label>

      ${motor.ok ? bloqueDictado(setup) : `<p class="hint">${esc(motor.detalle)} Escríbelos en el cuadro, separados por comas.</p>`}
      ${setup.avisoVoz ? notice('Tu voz sale de este aparato', esc(setup.avisoVoz), 'warn') : ''}
      ${setup.pistaVoz ? `<p class="tiny muted">${esc(setup.pistaVoz)}</p>` : ''}
      ${setup.errorVoz ? notice('No se pudo dictar', esc(setup.errorVoz), 'error') : ''}

      <div class="inline">${button('Separar en filas', 'setup-separar', 'btn-secondary')}</div>

      ${setup.filas === null ? '' : setup.filas.length
        ? `<p class="plan-sub">Revísalas antes de seguir</p>
           <div class="setup-propios" data-setup-propios>${setup.filas.map(fila => filaPropia(fila)).join('')}</div>
           <div class="inline" style="margin-top:12px">${button('+ Añadir uno más', 'setup-anadir-fila', 'btn-quiet btn-small')}</div>`
        : notice('No se entendió ningún alimento.', 'Escríbelos separados por comas, por ejemplo: «tortillas de maíz, queso gouda, jamón de pavo».')}

      <div class="modal-actions setup-actions">
        ${button('Atrás', 'setup-atras', 'btn-quiet')}
        <span class="tour-spacer"></span>
        <button type="submit" class="btn btn-primary">Continuar</button>
      </div>
    </form>`;
}

function bloqueDictado(setup) {
  return `<div class="setup-dictado">
    <button type="button" class="btn btn-secondary setup-microfono ${setup.escuchando ? 'escuchando' : ''}"
      data-action="${setup.escuchando ? 'setup-parar' : 'setup-dictar'}"
      aria-label="${setup.escuchando ? 'Dejar de escuchar' : 'Dictar los alimentos que faltan'}">
      <span aria-hidden="true">${setup.escuchando ? '■' : '🎤'}</span><span>${setup.escuchando ? 'Escuchando… toca para parar' : 'Dictar'}</span>
    </button>
    <p class="tiny muted">Dilos de corrido, separados como los dirías en voz alta. Aquí solo hace falta el nombre: cuánto se consume se pregunta en el paso siguiente.</p>
  </div>
  ${setup.escuchando ? `<p role="status" aria-live="polite" class="tiny muted">Escuchando… después lee lo que quedó en el cuadro. Nada se guarda ni avanza solo.</p>` : ''}`;
}

// Nombre y, cuando de verdad haga falta, unidad. Si el alimento ya existe en el
// catálogo o en la casa, su unidad ya está decidida y preguntarla otra vez sería
// pedir un dato que la app tiene: se enseña y se manda escondida.
function filaPropia(fila) {
  const conocido = fila.reconocido || '';
  return `<div class="item-row setup-propio-row" data-setup-propio>
    <label class="field"><span class="sr-only">Nombre del alimento</span>
      <input name="nombre" value="${esc(fila.nombre)}" placeholder="Ej. Queso gouda" autocomplete="off" aria-label="Nombre del alimento"></label>
    ${conocido
      ? `<span class="setup-unidad-fija">${esc(ETIQUETA_UNIDAD[fila.unidad] || fila.unidad)}<input type="hidden" name="unidad" value="${esc(fila.unidad)}"></span>`
      : `<label class="field"><span class="sr-only">Unidad habitual</span><select name="unidad" aria-label="Unidad habitual de ${esc(fila.nombre)}">${unidades(fila.unidad)}</select></label>`}
    <button type="button" class="btn btn-quiet remove-item" data-action="setup-quitar-fila" aria-label="Quitar ${esc(fila.nombre)}">✕</button>
    ${conocido ? `<p class="tiny muted setup-fila-nota">Ya está en la lista como «${esc(conocido)}»: se usará ese, no se duplica.</p>` : ''}
    ${fila.parecido ? `<p class="tiny setup-fila-nota">Se parece a «${esc(fila.parecido)}», que ya tienes. <button type="button" class="enlace" data-action="setup-usar-parecido" data-nombre="${esc(fila.parecido)}">Es el mismo: usar «${esc(fila.parecido)}»</button></p>` : ''}
  </div>`;
}

/* ── Paso 3: cuánto al mes ─────────────────────────────────────────────── */

// Todo en una sola pantalla editable. Abrir un formulario por alimento para
// veinte alimentos es exactamente lo que hacía que nadie terminara.
function pasoCantidades(setup) {
  const filas = filasDeCantidades(setup);
  const pendientes = filas.filter(fila => fila.cantidad === '').length;
  const yaGuardadas = filas.filter(fila => fila.yaGuardada).length;
  return `<form data-form="setup-cantidades">
    <p class="pantalla-intro">Cuánto se consume en un <strong>mes completo</strong>. Si no lo sabes, déjalo vacío: el alimento se guarda igual y la cantidad queda pendiente.</p>
    ${yaGuardadas ? `<p class="tiny muted">${yaGuardadas} ${yaGuardadas === 1 ? 'viene' : 'vienen'} con la cantidad que ya tenías escrita. Cámbiala solo si quieres.</p>` : ''}

    <div class="setup-cantidades" data-setup-cantidades>${filas.map(fila => filaCantidad(fila)).join('')
      || '<p class="muted">No hay ningún alimento marcado. Vuelve atrás y marca los que se consumen en tu casa.</p>'}</div>

    ${pendientes ? notice(`${pendientes} sin cantidad.`, 'Se guardan igual y se completan cuando lo sepas. Mientras tanto no entran en el cálculo de la compra.') : ''}
    <p class="tiny muted">Nada más por ahora: ni equivalencias, ni grosor de ruedas, ni lo que ya tienes en casa. Eso se pregunta cuando haga falta de verdad, al confirmar una compra.</p>

    <div class="modal-actions setup-actions">
      ${button('Atrás', 'setup-atras', 'btn-quiet')}
      <span class="tour-spacer"></span>
      ${button('Completar después', 'setup-luego', 'btn-secondary')}
      <button type="submit" class="btn btn-primary">Guardar y continuar</button>
    </div>
  </form>`;
}

// Lo marcado en el paso 1 y lo escrito en el paso 2, en una sola lista y sin
// repetidos: el mismo alimento por las dos vías es un alimento, no dos.
function filasDeCantidades(setup) {
  const filas = new Map();
  const meter = (nombre, unidadPorDefecto, origen) => {
    const clave = normalizeName(nombre);
    if (!clave || filas.has(clave)) return;
    const guardada = setup.cantidades[nombre] || setup.cantidades[clave] || {};
    filas.set(clave, {
      nombre,
      origen,
      cantidad: guardada.cantidad ?? '',
      unidad: unidadValida(guardada.unidad) || unidadValida(unidadPorDefecto) || 'unidad',
      yaGuardada: Boolean(guardada.yaGuardada)
    });
  };
  for (const nombre of setup.elegidos) meter(nombre, semillaPorNombre(nombre)?.controlUnit, 'catalogo');
  for (const propio of setup.propios) meter(propio.nombre, propio.unidad, propio.origen || 'texto');
  return [...filas.values()];
}

function filaCantidad({ nombre = '', unidad = 'unidad', cantidad = '', origen = 'catalogo' } = {}) {
  return `<div class="item-row setup-cantidad-row" data-setup-cantidad data-origen="${esc(origen)}">
    <span class="setup-cantidad-nombre">${esc(nombre)}<input type="hidden" name="nombre" value="${esc(nombre)}"></span>
    <label class="field"><span class="sr-only">Cantidad al mes de ${esc(nombre)}</span>
      <input name="cantidad" type="number" min="0" step="any" inputmode="decimal" value="${esc(cantidad)}" placeholder="Al mes" aria-label="Cantidad al mes de ${esc(nombre)}"></label>
    <label class="field"><span class="sr-only">Unidad de ${esc(nombre)}</span>
      <select name="unidad" aria-label="Unidad de ${esc(nombre)}">${unidades(unidad)}</select></label>
    <button type="button" class="btn btn-quiet remove-item" data-action="setup-quitar-cantidad" aria-label="Quitar ${esc(nombre)}">✕</button>
  </div>`;
}

/* ── Paso 4: el primer menú del mes ────────────────────────────────────── */

function pasoMenu(setup) {
  return `<div class="setup-hecho">
    <span class="setup-hecho-marca" aria-hidden="true">✓</span>
    <h3>Tu canasta habitual está guardada</h3>
    <p class="muted">${setup.guardados} alimento${setup.guardados === 1 ? '' : 's'} escritos una sola vez. Desde ahora, todos los meses parten de ahí y solo anotas lo diferente.</p>
  </div>

  <p class="pantalla-intro">Guarda las comidas que se repiten en tu casa y elige qué días suelen prepararse. La aplicación llenará automáticamente el calendario real del mes.</p>

  <div class="modal-actions setup-actions">
    <span class="tour-spacer"></span>
    ${button('Ahora no', 'setup-ahora-no', 'btn-secondary')}
    ${button('Preparar mi primer menú mensual', 'setup-menu', 'btn-primary btn-grande')}
  </div>`;
}

/* ── Armazón ───────────────────────────────────────────────────────────── */

function barra(paso) {
  return `<div class="setup-steps" role="list" aria-label="Progreso">
    ${PASOS.map(item => `<div class="setup-step ${item.id === paso ? 'now' : item.id < paso ? 'done' : ''}" role="listitem" ${item.id === paso ? 'aria-current="step"' : ''}>
      <span class="setup-dot" aria-hidden="true">${item.id < paso ? '✓' : item.id}</span><span class="setup-label">${esc(item.corto)}</span></div>`).join('')}
  </div><div class="progress setup-progress"><span style="width:${Math.round(paso / PASOS.length * 100)}%"></span></div>`;
}

export function renderSetup(ctx) {
  const setup = ctx.ui.setup;
  if (!setup || setup.paso === 0) return pantallaInicio();

  const cuerpo = setup.paso === 1 ? pasoHabituales(setup)
    : setup.paso === 2 ? pasoPropios(setup)
    : setup.paso === 3 ? pasoCantidades(setup)
    : pasoMenu(setup);

  return `<section class="setup">
    <div class="setup-head">
      <div><p class="eyebrow">Paso ${setup.paso} de ${PASOS.length}</p><h2>${esc(PASOS[setup.paso - 1].titulo)}</h2></div>
      ${setup.paso < 4 ? button('Salir', 'setup-salir', 'btn-quiet btn-small') : ''}
    </div>
    ${barra(setup.paso)}
    <div class="setup-body">${cuerpo}</div>
  </section>`;
}

/* ── Guardado ──────────────────────────────────────────────────────────── */

// Una cosa se escribe una vez: el alimento se crea en el catálogo con lo que el
// catálogo dominicano ya sabe de él —categoría, unidades, alias— y su línea
// entra en la canasta habitual. No hay que repetirlo en ningún otro sitio.
//
// Se escribe con `setHabitualBasket` y no línea a línea con `setHabitualLine`
// porque `setHabitualLine` lee una cantidad vacía como una baja y borra la
// línea, y aquí las cantidades pendientes son legítimas y frecuentes: quien
// sabe que compra arroz todos los meses no sabe todavía cuántas libras. La
// lista que se manda lleva delante las líneas que ya había y no se tocan, así
// que guardar añade y corrige, nunca sustituye la canasta entera.
export function guardarEnLaCanasta(state, filas) {
  const previas = habitualLines(state);
  const nuevas = [];
  for (const fila of filas) {
    const nombre = String(fila.nombre || '').trim();
    if (!nombre) continue;
    const semilla = semillaPorNombre(nombre);
    const unidad = unidadValida(fila.unidad);
    let item = productByName(state, nombre);
    if (!item) {
      item = addProduct(state, {
        // El nombre bueno es el del catálogo cuando lo escrito era un alias:
        // «plat mad» se guarda como «Plátano maduro».
        name: semilla?.name || nombre,
        controlUnit: unidad || semilla?.controlUnit || 'unidad',
        purchaseUnit: semilla?.purchaseUnit || unidad || 'unidad',
        category: semilla?.category || 'otros',
        aliases: semilla?.aliases || [],
        origin: semilla ? 'catalogo' : fila.origen === 'texto' ? 'texto' : 'manual'
      });
    }
    if (nuevas.some(linea => linea.productId === item.id)) continue;
    const anterior = previas.find(linea => linea.productId === item.id);
    nuevas.push({
      id: anterior?.id,
      productId: item.id,
      // Un cero no es un consumo: es «todavía no sé» o «no lo compro». Se guarda
      // como pendiente en vez de tumbar el guardado por un número que nadie
      // quiso escribir de verdad.
      quantity: fila.cantidad === '' || fila.cantidad === null || fila.cantidad === undefined || Number(fila.cantidad) === 0 ? null : fila.cantidad,
      unit: unidad || anterior?.unit || item.controlUnit,
      priority: anterior?.priority || (semilla?.common ? 'obligatorio' : 'frecuente')
    });
  }
  const intactas = previas.filter(linea => !nuevas.some(nueva => nueva.productId === linea.productId));
  setHabitualBasket(state, [...intactas, ...nuevas]);
  if (!state.settings) state.settings = { reviewWeekday: 5, onboarded: false };
  state.settings.onboarded = true;
  return nuevas.length;
}

/* ── Lectura de la pantalla ────────────────────────────────────────────── */

const leerFilas = (selector, campos) => [...document.querySelectorAll(selector)].map(fila =>
  Object.fromEntries([...campos.map(campo => [campo, fila.querySelector(`[name="${campo}"]`)?.value ?? '']), ['origen', fila.dataset.origen || 'catalogo']]));

// Lo escrito en el paso 2 y lo escrito en el paso 3 vive en el DOM mientras se
// edita. Cualquier cosa que redibuje tiene que pasar antes por aquí, o se
// pierde el párrafo que alguien acaba de dictar o la columna de cantidades que
// acaba de teclear.
function recordarTexto(ctx) {
  const setup = ctx.ui.setup;
  const cuadro = document.querySelector('[data-setup-texto]');
  if (cuadro) setup.texto = cuadro.value;
  if (setup.filas) {
    const escritas = leerFilas('[data-setup-propio]', ['nombre', 'unidad']);
    if (escritas.length) setup.filas = escritas.map((fila, indice) => ({ ...setup.filas[indice], nombre: fila.nombre, unidad: unidadValida(fila.unidad) || 'unidad' })).filter(fila => fila.nombre.trim());
  }
}

// El paso 3 se guarda igual por las dos salidas: lo que hay escrito en la
// pantalla, con las cantidades vacías como pendientes.
function guardarLoEscrito(ctx) {
  const filas = leerFilas('[data-setup-cantidad]', ['nombre', 'cantidad', 'unidad']).filter(fila => fila.nombre.trim());
  if (!filas.length) throw new Error('Marca al menos un alimento antes de guardar.');
  recordarCantidades(ctx);
  const guardados = guardarEnLaCanasta(ctx.state, filas);
  ctx.ui.setup.guardados = guardados;
  return guardados;
}

function recordarCantidades(ctx) {
  const setup = ctx.ui.setup;
  for (const fila of leerFilas('[data-setup-cantidad]', ['nombre', 'cantidad', 'unidad'])) {
    if (!fila.nombre.trim()) continue;
    setup.cantidades[fila.nombre] = { cantidad: fila.cantidad, unidad: unidadValida(fila.unidad) || 'unidad', yaGuardada: setup.cantidades[fila.nombre]?.yaGuardada || false };
  }
}

// Salir de la pantalla o del paso del micrófono sin retirar los oyentes deja el
// motor de voz escribiendo en una pantalla que ya no existe.
// `cancelarDictado` es asíncrona: sin recoger el rechazo, un micrófono que falla
// al cerrarse tumbaría la salida de la pantalla. Cerrarlo nunca puede impedir
// irse.
function soltarMicrofono(setup) {
  if (setup) setup.escuchando = false;
  try { Promise.resolve(cancelarDictado()).catch(() => {}); } catch { /* Ya estaba cerrado. */ }
}

// Lo que ya está guardado se enseña marcado y con su cantidad escrita. Es la
// única forma de que volver a pasar por el asistente no pise en silencio lo que
// costó escribir la primera vez: se ve antes de tocarlo.
function precargar(ctx) {
  const setup = ctx.ui.setup;
  if (setup.precargado) return;
  setup.precargado = true;
  for (const linea of habitualLines(ctx.state)) {
    const item = product(ctx.state, linea.productId);
    if (!item) continue;
    const semilla = semillaPorNombre(item.name);
    setup.cantidades[item.name] = { cantidad: linea.quantity === null ? '' : linea.quantity, unidad: linea.unit, yaGuardada: true };
    if (semilla) setup.elegidos = [...new Set([...setup.elegidos, semilla.name])];
    else setup.propios = [...setup.propios, { nombre: item.name, unidad: linea.unit, origen: 'manual', reconocido: item.name }];
  }
}

/* ── Marcar sin que la pantalla salte ──────────────────────────────────────
   Marcar veinte casillas redibujando la pantalla veinte veces es lo que hacía
   perder el sitio al pulgar: cada redibujo reemplaza los nodos, el navegador
   vuelve el desplazamiento a cero y el foco se va al cuerpo del documento.

   La solución es no redibujar. `setup-marcar` escribe en `ui.setup.elegidos`
   —que es lo que se leerá al guardar y lo que pintará el próximo redibujo, si
   llega— y después toca a mano las cuatro cosas que se ven: la clase de la
   ficha, el contador de arriba, el número de la categoría y si el botón de
   continuar está apagado. Ningún nodo se crea ni se destruye, así que ni el
   desplazamiento ni el foco se mueven. Lo mismo hace «marcar los más
   habituales», que además marca casillas ya pintadas en vez de repintar la
   lista.

   Los redibujos que sí ocurren —cambiar de categoría, buscar— son los que
   cambian la lista entera, y ahí empezar por arriba es lo correcto. */

function refrescarContadores(ctx) {
  const setup = ctx.ui.setup;
  const total = document.querySelector('[data-setup-total]');
  if (total) total.textContent = textoMarcados(setup.elegidos.length);
  const seguir = document.querySelector('[data-setup-seguir]');
  if (seguir) seguir.disabled = !setup.elegidos.length;
  const elegidos = new Set(setup.elegidos);
  for (const cat of CATEGORIES) {
    const cuenta = document.querySelector(`[data-setup-cuenta="${cat.id}"]`);
    if (cuenta) cuenta.textContent = seedByCategory(cat.id).filter(item => elegidos.has(item.name)).length || '';
  }
}

const pintarFicha = (casilla, marcado) => casilla.closest('.setup-ficha')?.classList.toggle('marcado', marcado);

/* ── Acciones ──────────────────────────────────────────────────────────── */

let dictadoActual = 0;
let avisadoDeVozAjena = false;

export const SETUP_ACTIONS = {
  'setup-open': (el, ctx) => {
    ctx.ui.setup = ctx.ui.setup || emptySetup();
    ctx.ui.page = 'setup';
    ctx.ui.modal = null;
    ctx.render();
  },
  'setup-empezar': (el, ctx) => {
    ctx.ui.setup = ctx.ui.setup || emptySetup();
    precargar(ctx);
    ctx.ui.setup.paso = 1;
    ctx.render();
  },
  'setup-salir': (el, ctx) => {
    const setup = ctx.ui.setup;
    if (setup.paso === 2) recordarTexto(ctx);
    if (setup.paso === 3) recordarCantidades(ctx);
    soltarMicrofono(setup);
    ctx.ui.page = 'hoy';
    ctx.render();
    ctx.toast('Puedes retomarlo cuando quieras desde Más.');
  },
  'setup-atras': (el, ctx) => {
    const setup = ctx.ui.setup;
    if (setup.paso === 2) recordarTexto(ctx);
    if (setup.paso === 3) recordarCantidades(ctx);
    soltarMicrofono(setup);
    setup.paso = Math.max(1, setup.paso - 1);
    ctx.render();
  },
  'setup-siguiente': (el, ctx) => {
    const setup = ctx.ui.setup;
    setup.paso = Math.min(PASOS.length, setup.paso + 1);
    ctx.render();
  },
  'setup-falta': (el, ctx) => {
    ctx.ui.setup.paso = 2;
    ctx.render();
    document.querySelector('[data-setup-texto]')?.focus();
  },

  // Paso 1
  'setup-categoria': (el, ctx) => {
    Object.assign(ctx.ui.setup, { categoria: el.dataset.cat, busqueda: '' });
    ctx.render();
  },
  'setup-buscar': (el, ctx) => {
    ctx.ui.setup.busqueda = document.querySelector('#setup-buscar')?.value || '';
    ctx.render();
    document.querySelector('#setup-buscar')?.focus();
  },
  'setup-limpiar-busqueda': (el, ctx) => {
    ctx.ui.setup.busqueda = '';
    ctx.render();
  },
  'setup-marcar': (el, ctx) => {
    const setup = ctx.ui.setup;
    const nombre = el.dataset.nombre;
    setup.elegidos = el.checked ? [...new Set([...setup.elegidos, nombre])] : setup.elegidos.filter(item => item !== nombre);
    pintarFicha(el, el.checked);
    refrescarContadores(ctx);
  },
  'setup-marcar-habituales': (el, ctx) => {
    const setup = ctx.ui.setup;
    const habituales = new Set(seedByCategory(setup.categoria).filter(item => item.common).map(item => item.name));
    let marcados = 0;
    for (const casilla of document.querySelectorAll('[data-setup-marca]')) {
      if (!habituales.has(casilla.dataset.nombre) || casilla.checked) continue;
      casilla.checked = true;
      pintarFicha(casilla, true);
      setup.elegidos = [...new Set([...setup.elegidos, casilla.dataset.nombre])];
      marcados++;
    }
    refrescarContadores(ctx);
    ctx.toast(marcados ? `${marcados} marcados. Quita los que no apliquen.` : 'Ya estaban todos marcados.');
  },

  // Paso 2
  'setup-separar': (el, ctx) => {
    recordarTexto(ctx);
    ctx.ui.setup.filas = separarAlimentos(ctx.state, ctx.ui.setup);
    ctx.render();
  },
  'setup-anadir-fila': (el, ctx) => {
    const lista = document.querySelector('[data-setup-propios]');
    if (!lista) return;
    lista.insertAdjacentHTML('beforeend', filaPropia({ nombre: '', unidad: 'unidad' }));
    lista.lastElementChild?.querySelector('input')?.focus();
  },
  'setup-quitar-fila': el => el.closest('[data-setup-propio]')?.remove(),
  'setup-usar-parecido': el => {
    const fila = el.closest('[data-setup-propio]');
    const campo = fila?.querySelector('[name="nombre"]');
    if (campo) campo.value = el.dataset.nombre;
    // La nota ya no dice nada útil una vez aceptada: se quita sin redibujar,
    // que es lo que mantiene quieto el resto de la pantalla.
    el.closest('.setup-fila-nota')?.remove();
  },
  'setup-dictar': async (el, ctx) => {
    const setup = ctx.ui.setup;
    try {
      recordarTexto(ctx);
      const motor = capacidad('dictar');
      if (!motor.ok) { setup.escuchando = false; setup.errorVoz = motor.detalle; ctx.render(); return; }
      if (motor.origen === 'navegador' && !avisadoDeVozAjena) { avisadoDeVozAjena = true; setup.avisoVoz = AVISO_VOZ_AJENA; }
      const base = setup.texto || '';
      const sesion = ++dictadoActual;
      Object.assign(setup, { escuchando: true, errorVoz: '', pistaVoz: '' });
      ctx.render();
      const oido = await dictar({
        onParcial: trozo => {
          if (sesion !== dictadoActual) return;
          setup.texto = juntar(base, trozo);
          // Lo que se va oyendo se escribe en el cuadro vivo. Redibujar por
          // palabra parpadea, pierde el foco y deja al dedo sin dónde tocar
          // para parar.
          const cuadro = document.querySelector('[data-setup-texto]');
          if (cuadro) { cuadro.value = setup.texto; cuadro.scrollTop = cuadro.scrollHeight; }
        }
      });
      if (sesion !== dictadoActual) return;
      setup.escuchando = false;
      if (oido.ok) {
        setup.texto = juntar(base, oido.texto);
        setup.pistaVoz = oido.parcial ? 'Eso fue lo que alcancé a oír antes de que se cortara: repásalo y sigue dictando si falta algo.' : '';
      } else if (!oido.cancelado) {
        // Lo oído a medias se queda en el cuadro; el motivo lo escribe
        // device.js en español.
        setup.errorVoz = oido.error;
      }
      ctx.render();
      const cuadro = document.querySelector('[data-setup-texto]');
      if (cuadro) { cuadro.focus(); cuadro.setSelectionRange(cuadro.value.length, cuadro.value.length); }
    } catch {
      setup.escuchando = false;
      setup.errorVoz = 'No se pudo dictar. Escríbelo en el cuadro, o usa el micrófono del teclado.';
      ctx.render();
    }
  },
  'setup-parar': (el, ctx) => {
    // Parar cierra el micrófono y se queda con lo dicho; cancelar lo tira. Aquí
    // se para.
    recordarTexto(ctx);
    try { Promise.resolve(pararDictado()).catch(() => {}); } catch { /* Ya estaba parado. */ }
    ctx.ui.setup.escuchando = false;
    ctx.render();
  },

  // Paso 3
  // «Completar después» guarda lo mismo que «Guardar y continuar» —las
  // cantidades en blanco quedan pendientes, que es legítimo— y se va a Hoy. Es
  // una acción y no un segundo botón de enviar porque `app.js` construye el
  // FormData sin el botón que lo envió, así que un `name`/`value` en el botón
  // no llegaría nunca y las dos salidas harían lo mismo en silencio.
  'setup-luego': (el, ctx) => {
    const guardados = guardarLoEscrito(ctx);
    ctx.ui.setup = null;
    ctx.ui.page = 'hoy';
    ctx.commit(`${guardados} alimento(s) en tu canasta habitual. Las cantidades que falten las completas cuando quieras.`);
  },
  'setup-quitar-cantidad': (el, ctx) => {
    const fila = el.closest('[data-setup-cantidad]');
    const nombre = fila?.querySelector('[name="nombre"]')?.value;
    const setup = ctx.ui.setup;
    if (nombre) {
      const clave = normalizeName(nombre);
      setup.elegidos = setup.elegidos.filter(item => normalizeName(item) !== clave);
      setup.propios = setup.propios.filter(item => normalizeName(item.nombre) !== clave);
      delete setup.cantidades[nombre];
    }
    fila?.remove();
  },

  // Paso 4
  'setup-menu': (el, ctx) => {
    const mes = todayISO().slice(0, 7);
    ctx.ui.setup = null;
    ctx.ui.page = 'mes';
    ctx.openModal('rutina', { month: mes });
  },
  'setup-ahora-no': (el, ctx) => {
    ctx.ui.setup = null;
    ctx.ui.page = 'hoy';
    ctx.render();
    ctx.toast('Cuando quieras, el menú del mes está en «Mes».');
  }
};

const juntar = (antes, trozo) => (antes.trim() ? `${antes.replace(/\s+$/, '')} ${trozo}` : trozo);

// `parseProductText` parte por comas y puntos, y por «y» solo cuando alguno de
// los dos lados trae cantidad («2 panes y atún»): es lo correcto al dictar una
// compra, porque «arroz y habichuelas» es el nombre de un plato. Aquí no se
// dictan compras sino nombres sueltos, y sin un solo número en todo el texto la
// «y» solo puede estar separando alimentos. En ese caso —y solo en ese— se
// convierte en coma antes de partir, de modo que el separador sigue siendo el
// de text-parse.js y no hay un segundo separador que mantener.
const prepararTexto = texto => (/\d/.test(texto) ? texto : String(texto).replace(/\s+[ye]\s+/gi, ', '));

function separarAlimentos(state, setup) {
  const { lines } = parseProductText(prepararTexto(setup.texto || ''));
  const yaElegidos = new Set(setup.elegidos.map(normalizeName));
  const vistos = new Set();
  const filas = [];
  for (const linea of lines) {
    const nombre = String(linea.name || '').trim();
    if (nombre.length <= 1) continue;
    const clave = normalizeName(nombre);
    if (!clave || vistos.has(clave) || yaElegidos.has(clave)) continue;
    vistos.add(clave);
    const semilla = semillaPorNombre(nombre);
    const existente = productByName(state, nombre);
    // Lo que ya está en el catálogo dominicano no se escribe otra vez: se marca
    // en el paso 1, que es donde vive, y aquí se dice para que se vea.
    const reconocido = semilla?.name || existente?.name || '';
    if (semilla) setup.elegidos = [...new Set([...setup.elegidos, semilla.name])];
    const parecido = reconocido ? '' : parecidoA(state, nombre);
    // La cantidad dictada de pasada no se tira: se guarda para el paso 3, que es
    // donde se pregunta. Aquí no se enseña.
    if (linea.quantity !== null) setup.cantidades[semilla?.name || nombre] = { cantidad: linea.quantity, unidad: unidadValida(linea.unit) || semilla?.controlUnit || 'unidad', yaGuardada: false };
    filas.push({
      nombre: semilla?.name || existente?.name || nombre,
      unidad: unidadValida(linea.unit) || semilla?.controlUnit || existente?.controlUnit || 'unidad',
      reconocido,
      parecido
    });
  }
  return filas;
}

/* ── Formularios ───────────────────────────────────────────────────────── */

export const SETUP_FORMS = {
  'setup-propios': (form, data, ctx) => {
    const setup = ctx.ui.setup;
    recordarTexto(ctx);
    const escritas = leerFilas('[data-setup-propio]', ['nombre', 'unidad']).filter(fila => fila.nombre.trim());

    // Continuar con el párrafo escrito y ninguna fila a la vista no puede tirar
    // lo escrito ni colarlo sin mirar: se separa aquí mismo y la pantalla se
    // queda enseñando las filas, que es lo que había que revisar.
    if (!escritas.length && setup.texto.trim()) {
      setup.filas = separarAlimentos(ctx.state, setup);
      ctx.render();
      ctx.toast(setup.filas.length ? 'Revisa las filas y vuelve a tocar Continuar.' : 'No se entendió ningún alimento en lo escrito.');
      return;
    }

    soltarMicrofono(setup);
    const yaElegidos = new Set(setup.elegidos.map(normalizeName));
    const vistos = new Set();
    const propios = [];
    for (const fila of escritas) {
      const nombre = fila.nombre.trim();
      const clave = normalizeName(nombre);
      if (!clave || vistos.has(clave) || yaElegidos.has(clave)) continue;
      vistos.add(clave);
      const semilla = semillaPorNombre(nombre);
      // Un alimento del catálogo escrito a mano no crea un duplicado: se marca
      // en la lista de siempre, con su categoría y sus alias.
      if (semilla) { setup.elegidos = [...new Set([...setup.elegidos, semilla.name])]; continue; }
      propios.push({ nombre, unidad: unidadValida(fila.unidad) || 'unidad', origen: 'texto' });
    }
    // Lo escrito en visitas anteriores no se pierde: se suma sin repetir.
    const previos = setup.propios.filter(item => !propios.some(nuevo => normalizeName(nuevo.nombre) === normalizeName(item.nombre)));
    setup.propios = [...previos, ...propios];
    setup.texto = '';
    setup.filas = null;
    setup.paso = 3;
    ctx.render();
  },

  'setup-cantidades': (form, data, ctx) => {
    const guardados = guardarLoEscrito(ctx);
    ctx.ui.setup.paso = 4;
    ctx.commit(`${guardados} alimento(s) en tu canasta habitual.`);
  }
};
