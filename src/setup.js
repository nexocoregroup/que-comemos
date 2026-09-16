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

import { RUBROS, SEED_PRODUCTS, categoriaDelRubro, rubroDeCategoria, rubroPorIndice, seedByRubro } from './catalog-seed.js';
import { UNITS, addProduct, findSimilarProducts, habitualLines, product, productByName, setHabitualBasket, todayISO } from './model.js';
import { normalizeName, parseProductText } from './text-parse.js';
import { cancelarDictado, capacidad } from './device.js';
import { panelDeVoz } from './voz.js';
import { button, esc, notice, options } from './ui-kit.js';

export const PASOS = [
  { id: 1, titulo: 'La canasta base de tu hogar', corto: 'Alimentos' },
  { id: 2, titulo: '¿Falta algo por dictar o escribir de corrido?', corto: 'Dictar' },
  { id: 3, titulo: '¿Cuánto se consume al mes?', corto: 'Cantidades' },
  { id: 4, titulo: 'Preparar mi primer menú mensual', corto: 'El mes' }
];

// El paso 0 no es un paso: es la pantalla que promete una sola cosa antes de
// pedir nada. Por eso no cuenta en la barra ni lleva número.
export const emptySetup = () => ({
  paso: 0,
  precargado: false,
  rubro: 0,            // cuál de los ocho rubros se está preguntando (0…7)
  elegidos: [],        // todos los nombres marcados, del catálogo o escritos
  propios: [],         // [{ nombre, unidad, categoria, origen }] los que no estaban
  cantidades: {},      // nombre → { cantidad, unidad, yaGuardada }
  texto: '',           // lo que se lleva escrito o dictado en el paso 2
  filas: null,         // las filas separadas del texto, antes de aceptarlas
  busqueda: '',
  anadiendo: false,    // ¿está abierta la ventanita de «añadir un alimento»?
  nombreNuevo: '',
  errorNuevo: '',
  guardados: 0
});

/* ── El avance se guarda solo ──────────────────────────────────────────────

   Registrar la canasta de una casa son ocho pantallas, y nadie las hace de una
   sentada sin que le hablen, le llamen o se le acabe la batería. Hasta ahora lo
   marcado vivía solo en memoria: cerrar la app antes de llegar a las cantidades
   tiraba el trabajo entero sin decir nada.

   Ahora cada toque escribe en `state.settings.canasta`, que es estado de la
   casa y por tanto se guarda en el cajón de esta cuenta y viaja con ella. Se
   guardan los campos que costó rellenar y ninguno más: lo que está a medio
   buscar o la ventanita abierta no hacen falta mañana. */

const CAMPOS_GUARDADOS = ['paso', 'precargado', 'rubro', 'elegidos', 'propios', 'cantidades', 'texto', 'guardados'];

export function guardarAvance(ctx) {
  const setup = ctx.ui.setup;
  if (!setup) return null;
  if (!ctx.state.settings || typeof ctx.state.settings !== 'object') ctx.state.settings = {};
  ctx.state.settings.canasta = Object.fromEntries(CAMPOS_GUARDADOS.map(campo => [campo, structuredClone(setup[campo])]));
  // Guardar sin repintar: marcar ochenta casillas repintando ochenta veces es
  // exactamente lo que le quitaba el sitio al pulgar.
  if (typeof ctx.guardar === 'function') ctx.guardar();
  return ctx.state.settings.canasta;
}

export function avanceGuardado(state) {
  const guardado = state?.settings?.canasta;
  if (!guardado || typeof guardado !== 'object' || Array.isArray(guardado)) return null;
  const setup = { ...emptySetup(), ...guardado };
  // Un respaldo traído a mano puede venir con cualquier cosa escrita aquí. Se
  // recorta a lo que las pantallas saben pintar, en vez de confiar.
  setup.paso = Math.min(PASOS.length, Math.max(0, Number(setup.paso) || 0));
  setup.rubro = Math.min(RUBROS.length - 1, Math.max(0, Number(setup.rubro) || 0));
  setup.elegidos = (Array.isArray(setup.elegidos) ? setup.elegidos : []).map(String);
  setup.propios = (Array.isArray(setup.propios) ? setup.propios : []).filter(item => item && item.nombre);
  setup.cantidades = setup.cantidades && typeof setup.cantidades === 'object' ? setup.cantidades : {};
  setup.filas = null;
  setup.anadiendo = false;
  return setup;
}

export function olvidarAvance(state) {
  if (state?.settings) delete state.settings.canasta;
}

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

/* ── Pantalla inicial ──────────────────────────────────────────────────── */

// Una promesa, un botón. La opción de ver un ejemplo va plegada debajo para que
// se pueda mirar sin salir de aquí y sin competir con lo que hay que pulsar.
function pantallaInicio(setup) {
  const llevaEmpezado = Boolean(setup?.elegidos?.length);
  return `<section class="setup setup-inicio">
    <p class="eyebrow">Tu canasta base</p>
    <h2 class="setup-promesa">Ahora vamos a crear la canasta base de tu hogar. Selecciona los alimentos que normalmente compras todos los meses. Podrás agregar cualquier alimento que no aparezca.</h2>
    <div class="pantalla-acciones">${button(llevaEmpezado ? 'Seguir donde lo dejé' : 'Empezar', 'setup-empezar', 'btn-primary btn-grande')}</div>
    ${llevaEmpezado ? `<p class="small muted">Llevas ${setup.elegidos.length} alimento(s) marcados.</p>` : ''}
    <details class="plegable setup-ejemplo">
      <summary>¿Qué es la canasta base?</summary>
      <p class="muted">Una casa marca arroz, huevos, salami, plátanos y detergente, y dice cuánto lleva de cada uno en un mes corriente. Eso es <strong>su canasta base</strong>: hay una sola y se escribe una vez.</p>
      <p class="muted">En diciembre compran el doble de arroz y no compran plátanos. En lugar de escribir la lista entera otra vez, solo anotan esas dos cosas: son los <strong>cambios de ese mes</strong>. Enero vuelve solo a la canasta base.</p>
    </details>
    <p class="tiny muted setup-nota">Se puede salir en cualquier momento. Lo que marques se guarda solo.</p>
  </section>`;
}

/* ── Paso 1: la canasta base, rubro por rubro ──────────────────────────────

   Antes esto era una sola pantalla con una tira de catorce categorías que había
   que arrastrar de lado. Esa tira tenía tres problemas a la vez: no se ve
   cuántas quedan, la lista salta bajo el dedo al cambiar de pestaña, y en un
   teléfono las últimas categorías están escondidas fuera de la pantalla, así
   que sencillamente no se visitan.

   Ahora son ocho pantallas seguidas, cada una en el mismo sitio, y se avanza
   con Continuar. La posición no cambia nunca: lo único que cambia es la lista
   de en medio. */

function pantallaDeRubro(setup) {
  const rubro = rubroPorIndice(setup.rubro);
  const elegidos = new Set(setup.elegidos.map(normalizeName));
  const marcado = nombre => elegidos.has(normalizeName(nombre));
  const busqueda = normalizeName(setup.busqueda || '');
  const delRubro = seedByRubro(rubro.id);
  const lista = busqueda
    ? delRubro.filter(item => normalizeName(item.name).includes(busqueda) || item.aliases.some(alias => normalizeName(alias).includes(busqueda)))
    : delRubro;
  // Los que escribió la propia casa van al final, justo encima del botón de
  // añadir: es donde estaba el dedo cuando los escribió, y así el que acaba de
  // añadirse se ve sin tener que buscarlo.
  const tuyos = setup.propios.filter(item => item.categoria === categoriaDelRubro(rubro.id));
  const enEsteRubro = [...delRubro.map(item => item.name), ...tuyos.map(item => item.nombre)].filter(marcado).length;
  const primero = setup.rubro === 0;
  const ultimo = setup.rubro >= RUBROS.length - 1;

  return `<p class="setup-rubro" role="status" aria-live="polite">
      <span class="setup-rubro-emoji" aria-hidden="true">${rubro.emoji}</span>
      Categoría ${setup.rubro + 1} de ${RUBROS.length} — <strong>${esc(rubro.titulo)}</strong>
    </p>
    <div class="progress setup-rubro-progreso"><span style="width:${Math.round((setup.rubro + 1) / RUBROS.length * 100)}%"></span></div>

    <p class="pantalla-intro">Selecciona todos los que compras habitualmente. No importa cuántos sean.</p>

    ${delRubro.length > 12 ? `<div class="setup-buscador">
      <label class="field setup-search"><span class="sr-only">Buscar dentro de ${esc(rubro.titulo)}</span>
        <input type="search" id="setup-buscar" value="${esc(setup.busqueda)}" placeholder="Buscar en ${esc(rubro.titulo.toLocaleLowerCase('es'))}…" autocomplete="off" aria-label="Buscar dentro de ${esc(rubro.titulo)}">
      </label>
      ${setup.busqueda ? button('Ver todo', 'setup-limpiar-busqueda', 'btn-quiet') : ''}
    </div>` : ''}

    <div class="setup-lista">${lista.map(item => fichaAlimento(item.name, item.controlUnit, marcado(item.name))).join('')
      || `<p class="muted">Nada de este rubro coincide con «${esc(setup.busqueda)}». Puedes añadirlo aquí abajo.</p>`}</div>

    ${tuyos.length ? `<p class="setup-tuyos-titulo">Añadidos por ti</p>
      <div class="setup-lista setup-tuyos">${tuyos.map(item => fichaAlimento(item.nombre, item.unidad, marcado(item.nombre))).join('')}</div>` : ''}

    <div class="setup-falta">
      ${setup.anadiendo
        ? ventanitaDeAnadir(setup, rubro)
        : `<button type="button" class="enlace" data-action="setup-falta">¿No encuentras un alimento? Añadirlo</button>`}
    </div>

    <div class="modal-actions setup-actions">
      ${button(primero ? 'Salir' : 'Atrás', primero ? 'setup-salir' : 'setup-rubro-atras', 'btn-quiet')}
      <span class="tour-spacer"></span>
      <span class="pill ${enEsteRubro ? '' : 'gray'}" data-setup-total role="status" aria-live="polite">${textoMarcados(setup.elegidos.length)}</span>
      ${button(ultimo ? 'Continuar' : 'Continuar', 'setup-rubro-seguir', 'btn-primary', 'data-setup-seguir')}
    </div>`;
}

const textoMarcados = total => `${total} marcado${total === 1 ? '' : 's'} en total`;

function fichaAlimento(nombre, unidad, marcado) {
  return `<label class="chip-check setup-ficha ${marcado ? 'marcado' : ''}">
    <input type="checkbox" data-action="setup-marcar" data-setup-marca data-nombre="${esc(nombre)}" ${marcado ? 'checked' : ''}>
    <span class="setup-ficha-texto">${esc(nombre)}<span class="tiny">${esc(ETIQUETA_UNIDAD[unidad] || unidad || 'unidad')}</span></span>
  </label>`;
}

// La ventanita de añadir. Pide el nombre y nada más: la medida se sugiere sola
// según el rubro y se puede cambiar después, y preguntarla aquí sería un
// segundo campo entre alguien y el alimento que ya sabe que compra.
//
// Se abre dentro de la propia categoría, no encima de la pantalla, por una
// razón práctica: aquí no se puede perder el sitio. Quien la cierra sigue
// exactamente donde estaba, con lo marcado intacto.
function ventanitaDeAnadir(setup, rubro) {
  return `<form data-form="setup-nuevo" class="setup-ventanita" aria-label="Añadir un alimento a ${esc(rubro.titulo)}">
    <p class="setup-ventanita-titulo">Añadir a ${esc(rubro.titulo)}</p>
    <label class="field"><span class="sr-only">Nombre del alimento</span>
      <input name="nombre" data-setup-nuevo value="${esc(setup.nombreNuevo || '')}" placeholder="Ej. Fresa" autocomplete="off" maxlength="40" enterkeyhint="done">
    </label>
    ${setup.errorNuevo ? `<p class="setup-error" role="alert">${esc(setup.errorNuevo)}</p>` : ''}
    <div class="inline setup-ventanita-acciones">
      <button type="submit" class="btn btn-primary btn-small">Añadir</button>
      ${button('Cancelar', 'setup-cancelar-nuevo', 'btn-quiet btn-small')}
    </div>
    <p class="tiny muted">Solo el nombre. Queda marcado en ${esc(rubro.titulo.toLocaleLowerCase('es'))} y se mide en ${esc(ETIQUETA_UNIDAD[rubro.unidad] || rubro.unidad)} mientras no digas otra cosa.</p>
  </form>`;
}

/* ── Paso 2: lo propio de cada casa ────────────────────────────────────── */

function pasoPropios(setup, ctx) {
  const motor = capacidad('dictar');
  return `<p class="pantalla-intro">Este paso es opcional. Si te resulta más rápido decirlos de corrido que buscarlos uno por uno, dilos o escríbelos aquí; si ya marcaste todo lo tuyo, pasa de largo.</p>

    <form data-form="setup-propios" class="stack">
      <label class="field"><span class="sr-only">Alimentos que faltan</span>
        <textarea name="texto" rows="3" data-setup-texto placeholder="Tortillas de maíz, queso gouda, jamón de pavo y yogurt de fresa." aria-label="Alimentos que faltan" autocapitalize="sentences" spellcheck="true" enterkeyhint="done">${esc(setup.texto)}</textarea>
      </label>

      ${bloqueDictado(ctx, motor)}
      ${panelDeVoz(ctx, 'setup')}

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

// El botón abre el panel de dictado; no abre el micrófono. Todo lo que pasa
// después —los estados, parar, cancelar, reintentar, escribir en su lugar— lo
// lleva `voz.js`, que es el mismo en las cuatro pantallas desde donde se dicta.
function bloqueDictado(ctx, motor) {
  if (!motor.ok) return `<p class="hint">Este aparato no trae dictado dentro de la aplicación. Escríbelos en el cuadro separados por comas, o toca el 🎤 de tu teclado.</p>`;
  return `<div class="setup-dictado">
    <button type="button" class="btn btn-secondary setup-microfono" data-action="voz-abrir" data-destino="setup"
      aria-label="Dictar o escribir los alimentos que faltan">
      <span aria-hidden="true">🎤</span><span>Dictar</span>
    </button>
    <p class="tiny muted">Dilos de corrido, separados como los dirías en voz alta. Aquí solo hace falta el nombre: cuánto se consume se pregunta en el paso siguiente.</p>
  </div>`;
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

// Todo lo marcado, sea del catálogo o escrito por la casa, en una sola lista y
// sin repetidos: el mismo alimento por las dos vías es un alimento, no dos.
//
// La lista sale de `elegidos` y solo de ahí. Un alimento que se escribió y
// después se desmarcó se queda en `propios` —para poder volver a marcarlo sin
// escribirlo otra vez— pero no llega hasta aquí.
function filasDeCantidades(setup) {
  const filas = new Map();
  const propioDe = nombre => setup.propios.find(item => normalizeName(item.nombre) === normalizeName(nombre));
  for (const nombre of setup.elegidos) {
    const clave = normalizeName(nombre);
    if (!clave || filas.has(clave)) continue;
    const propio = propioDe(nombre);
    const guardada = setup.cantidades[nombre] || setup.cantidades[clave] || {};
    filas.set(clave, {
      nombre,
      origen: propio?.origen || 'catalogo',
      categoria: propio?.categoria || semillaPorNombre(nombre)?.category || '',
      cantidad: guardada.cantidad ?? '',
      unidad: unidadValida(guardada.unidad) || unidadValida(propio?.unidad) || unidadValida(semillaPorNombre(nombre)?.controlUnit) || 'unidad',
      yaGuardada: Boolean(guardada.yaGuardada)
    });
  }
  return [...filas.values()];
}

function filaCantidad({ nombre = '', unidad = 'unidad', cantidad = '', origen = 'catalogo', categoria = '' } = {}) {
  return `<div class="item-row setup-cantidad-row" data-setup-cantidad data-origen="${esc(origen)}" data-categoria="${esc(categoria)}">
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
  if (!setup || setup.paso === 0) return pantallaInicio(setup);

  const cuerpo = setup.paso === 1 ? pantallaDeRubro(setup)
    : setup.paso === 2 ? pasoPropios(setup, ctx)
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
        // El rubro donde se escribió manda sobre el cajón de sobras: «Fresa»,
        // escrita en Frutas, se guarda en Frutas.
        category: semilla?.category || fila.categoria || 'otros',
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
  Object.fromEntries([
    ...campos.map(campo => [campo, fila.querySelector(`[name="${campo}"]`)?.value ?? '']),
    ['origen', fila.dataset.origen || 'catalogo'],
    ['categoria', fila.dataset.categoria || '']
  ]));

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
function soltarMicrofono(ctx) {
  const voz = ctx?.ui?.voz;
  // El panel de dictado es compartido: si el que estaba abierto era el de esta
  // pantalla, se cierra con ella. Si era el de otra, no se toca.
  if (voz?.destino === 'setup') { voz.sesion += 1; voz.destino = ''; voz.estado = 'quieto'; }
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
    const nombre = semilla?.name || item.name;
    setup.elegidos = [...new Set([...setup.elegidos, nombre])];
    if (!semilla) {
      setup.propios = [...setup.propios.filter(propio => normalizeName(propio.nombre) !== normalizeName(item.name)),
        { nombre: item.name, unidad: linea.unit, categoria: item.category || 'otros', origen: 'manual', reconocido: item.name }];
    }
  }
}

/* ── Marcar sin que la pantalla salte ──────────────────────────────────────
   Marcar veinte casillas redibujando la pantalla veinte veces es lo que hacía
   perder el sitio al pulgar: cada redibujo reemplaza los nodos, el navegador
   vuelve el desplazamiento a cero y el foco se va al cuerpo del documento.

   La solución es no redibujar. `setup-marcar` escribe en `ui.setup.elegidos`
   —que es lo que se leerá al guardar y lo que pintará el próximo redibujo, si
   llega—, guarda el avance sin pintar, y después toca a mano las dos cosas que
   se ven: la clase de la ficha y el contador de arriba. Ningún nodo se crea ni
   se destruye, así que ni el desplazamiento ni el foco se mueven.

   Los redibujos que sí ocurren —cambiar de rubro, buscar, abrir la ventanita—
   son los que cambian la lista entera, y ahí empezar por arriba es lo
   correcto. */

function refrescarContadores(ctx) {
  const setup = ctx.ui.setup;
  const total = document.querySelector('[data-setup-total]');
  if (total) {
    total.textContent = textoMarcados(setup.elegidos.length);
    total.classList.toggle('gray', !setup.elegidos.length);
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
    guardarAvance(ctx);
    ctx.render();
  },
  'setup-salir': (el, ctx) => {
    const setup = ctx.ui.setup;
    if (setup.paso === 2) recordarTexto(ctx);
    if (setup.paso === 3) recordarCantidades(ctx);
    soltarMicrofono(ctx);
    // Salir no descarta nada: el avance se queda escrito donde estaba.
    guardarAvance(ctx);
    ctx.ui.page = 'hoy';
    ctx.render();
    ctx.toast('Guardado. Puedes retomarlo desde Más → Organizar mi casa.');
  },
  'setup-atras': (el, ctx) => {
    const setup = ctx.ui.setup;
    if (setup.paso === 2) recordarTexto(ctx);
    if (setup.paso === 3) recordarCantidades(ctx);
    soltarMicrofono(ctx);
    // Volver del paso 2 al 1 devuelve el último rubro, no el primero: es donde
    // estaba quien pulsó «Atrás».
    setup.paso = Math.max(1, setup.paso - 1);
    if (setup.paso === 1) setup.rubro = RUBROS.length - 1;
    guardarAvance(ctx);
    ctx.render();
  },
  'setup-siguiente': (el, ctx) => {
    const setup = ctx.ui.setup;
    setup.paso = Math.min(PASOS.length, setup.paso + 1);
    guardarAvance(ctx);
    ctx.render();
  },

  /* ── Paso 1: los ocho rubros ─────────────────────────────────────────── */

  'setup-rubro-atras': (el, ctx) => {
    const setup = ctx.ui.setup;
    setup.rubro = Math.max(0, setup.rubro - 1);
    // Lo marcado no se toca al retroceder: eso es lo que se estaba comprobando.
    Object.assign(setup, { busqueda: '', anadiendo: false, nombreNuevo: '', errorNuevo: '' });
    guardarAvance(ctx);
    ctx.render();
  },
  // Se puede continuar sin marcar nada. Hay casas que no compran vegetales
  // frescos, y obligarlas a marcar algo para pasar sería pedirles que mientan.
  'setup-rubro-seguir': (el, ctx) => {
    const setup = ctx.ui.setup;
    Object.assign(setup, { busqueda: '', anadiendo: false, nombreNuevo: '', errorNuevo: '' });
    if (setup.rubro >= RUBROS.length - 1) setup.paso = 2;
    else setup.rubro += 1;
    guardarAvance(ctx);
    ctx.render();
  },
  'setup-limpiar-busqueda': (el, ctx) => {
    ctx.ui.setup.busqueda = '';
    ctx.render();
  },

  // La ventanita de añadir un alimento, dentro de la propia categoría.
  'setup-falta': (el, ctx) => {
    Object.assign(ctx.ui.setup, { anadiendo: true, nombreNuevo: '', errorNuevo: '' });
    ctx.render();
    document.querySelector('[data-setup-nuevo]')?.focus();
  },
  'setup-cancelar-nuevo': (el, ctx) => {
    Object.assign(ctx.ui.setup, { anadiendo: false, nombreNuevo: '', errorNuevo: '' });
    ctx.render();
  },

  'setup-marcar': (el, ctx) => {
    const setup = ctx.ui.setup;
    const nombre = el.dataset.nombre;
    const clave = normalizeName(nombre);
    setup.elegidos = el.checked
      ? [...new Set([...setup.elegidos, nombre])]
      : setup.elegidos.filter(item => normalizeName(item) !== clave);
    // Se guarda en cada toque, y sin repintar: quien está marcando veinte
    // casillas no puede perder el sitio, y tampoco lo marcado si cierra la app.
    guardarAvance(ctx);
    pintarFicha(el, el.checked);
    refrescarContadores(ctx);
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
  // Dictar ya no vive aquí: lo lleva `voz.js`, igual que en las otras tres
  // pantallas desde donde se puede dictar. El botón manda `voz-abrir`.

  // Paso 3
  // «Completar después» guarda lo mismo que «Guardar y continuar» —las
  // cantidades en blanco quedan pendientes, que es legítimo— y se va a Hoy. Es
  // una acción y no un segundo botón de enviar porque `app.js` construye el
  // FormData sin el botón que lo envió, así que un `name`/`value` en el botón
  // no llegaría nunca y las dos salidas harían lo mismo en silencio.
  'setup-luego': (el, ctx) => {
    const guardados = guardarLoEscrito(ctx);
    olvidarAvance(ctx.state);
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
    guardarAvance(ctx);
  },

  // Paso 4
  'setup-menu': (el, ctx) => {
    const mes = todayISO().slice(0, 7);
    olvidarAvance(ctx.state);
    ctx.ui.setup = null;
    ctx.ui.page = 'mes';
    ctx.openModal('rutina', { month: mes });
  },
  'setup-ahora-no': (el, ctx) => {
    olvidarAvance(ctx.state);
    ctx.ui.setup = null;
    ctx.ui.page = 'hoy';
    ctx.render();
    ctx.toast('Cuando quieras, el menú del mes está en «Mes».');
  }
};

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
  /* ── Añadir un alimento que no está en la lista ──────────────────────────

     Nombre y un toque en «Añadir». Nada más, y nunca se sale de la categoría.

     Lo único que esto hace con cabeza es no crear dos veces el mismo alimento:
     si lo escrito ya existe —en el catálogo dominicano o en la casa— se marca
     el que hay y se dice dónde estaba, en vez de fabricar un duplicado que
     partiría el inventario en dos fichas del mismo arroz. */
  'setup-nuevo': (form, data, ctx) => {
    const setup = ctx.ui.setup;
    const rubro = rubroPorIndice(setup.rubro);
    const escrito = String(data.get('nombre') ?? document.querySelector('[data-setup-nuevo]')?.value ?? '').trim();
    setup.nombreNuevo = escrito;

    if (escrito.length < 2) {
      setup.errorNuevo = 'Escribe el nombre del alimento.';
      ctx.render();
      document.querySelector('[data-setup-nuevo]')?.focus();
      return;
    }

    const clave = normalizeName(escrito);
    const yaMarcado = setup.elegidos.some(item => normalizeName(item) === clave);
    const semilla = semillaPorNombre(escrito);
    const existente = productByName(ctx.state, escrito);
    const propio = setup.propios.find(item => normalizeName(item.nombre) === clave);
    const nombre = semilla?.name || existente?.name || propio?.nombre || escrito;

    if (!propio && !semilla && !existente) {
      // Un alimento nuevo de verdad. La medida sale del rubro donde se escribió
      // —libras en las carnes, unidades en las frutas— y se puede cambiar
      // después desde la ficha del alimento.
      setup.propios = [...setup.propios, {
        nombre: escrito,
        unidad: unidadValida(rubro.unidad) || 'unidad',
        categoria: categoriaDelRubro(rubro.id),
        origen: 'manual'
      }];
    }

    setup.elegidos = [...new Set([...setup.elegidos, nombre])];
    Object.assign(setup, { anadiendo: false, nombreNuevo: '', errorNuevo: '' });
    guardarAvance(ctx);
    ctx.render();

    // Dónde quedó. Si estaba en otro rubro hay que decirlo, o quien lo escribió
    // se quedará buscándolo en esta pantalla.
    const suyo = semilla?.category || existente?.category || propio?.categoria || categoriaDelRubro(rubro.id);
    const donde = rubroDeCategoria(suyo);
    if (yaMarcado) ctx.toast(`«${nombre}» ya estaba marcado.`);
    else if (donde && donde.id !== rubro.id) ctx.toast(`«${nombre}» ya estaba en ${donde.titulo}: queda marcado ahí.`);
    else ctx.toast(`«${nombre}» añadido a ${rubro.titulo} y marcado.`);
  },

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

    soltarMicrofono(ctx);
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
      // Lo dictado de corrido no dice de qué rubro es, y adivinarlo por el
      // nombre sería inventar. Va al cajón de «Otros productos habituales», que
      // es donde se puede encontrar, y se cambia desde la ficha del alimento.
      propios.push({ nombre, unidad: unidadValida(fila.unidad) || 'unidad', categoria: 'otros', origen: 'texto' });
      setup.elegidos = [...new Set([...setup.elegidos, nombre])];
    }
    // Lo escrito en visitas anteriores no se pierde: se suma sin repetir.
    const previos = setup.propios.filter(item => !propios.some(nuevo => normalizeName(nuevo.nombre) === normalizeName(item.nombre)));
    setup.propios = [...previos, ...propios];
    setup.texto = '';
    setup.filas = null;
    setup.paso = 3;
    guardarAvance(ctx);
    ctx.render();
  },

  'setup-cantidades': (form, data, ctx) => {
    const guardados = guardarLoEscrito(ctx);
    ctx.ui.setup.paso = 4;
    // La canasta ya está escrita donde vive de verdad: el borrador del
    // asistente deja de hacer falta y se borra, para que volver a entrar no
    // enseñe un avance a medias de algo que ya está hecho.
    olvidarAvance(ctx.state);
    ctx.commit(`${guardados} alimento(s) en tu canasta base.`);
  }
};
