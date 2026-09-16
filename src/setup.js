// «Organizar mi casa»: un camino, de principio a fin.
//
// El asistente anterior ofrecía cuatro formas distintas de empezar antes de
// dejar marcar un solo alimento. Elegir entre cuatro caminos no es avanzar: es
// una pregunta más que responder antes de haber entendido para qué sirve la
// app. Aquí hay un camino y se recorre entero: quién come en esta casa, qué se
// compra, cuánto, cada cuánto, qué se cocina de costumbre, y el primer menú.
//
// Los dos extremos son nuevos y los dos arreglan el mismo agujero: el asistente
// terminaba ofreciendo «preparar mi primer menú mensual» a una casa sin nadie
// registrado y sin una sola preparación guardada, así que al llegar allí no
// había nada con qué llenar el calendario ni a quién avisarle de una alergia.
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
import {
  FRECUENCIAS, UNITS, addProduct, deleteRecipe, etiquetaDeMomento, findSimilarProducts, frecuenciaDe, habitualLines,
  historialDeFrecuencia, personasActivas, ponerFrecuencia, ponerReparto, product, productByName, repartoDe,
  setHabitualBasket, todayISO
} from './model.js';
// La ficha de una persona se dibuja en un solo sitio, y ese sitio es `hogar.js`.
// Aquí solo se enseña el resumen de lo que ya está guardado y se abre esa misma
// ventana: dos formularios de persona serían dos sitios donde olvidarse de
// preguntar si un alimento es alergia o manía.
import { claseDe, resumenDeRestricciones } from './hogar.js';
import { datesForRule, describeRule, monthProgress, routinesFor } from './routines.js';
import { normalizeName, parseProductText } from './text-parse.js';
import { cancelarDictado, capacidad } from './device.js';
import { panelDeVoz } from './voz.js';
import { button, esc, monthName, notice, options } from './ui-kit.js';

// Los pasos se llaman por su nombre y no por su número. Los números cambian
// cada vez que se añade uno en medio, y un `setup.paso === 4` repartido por el
// archivo es la forma más rápida de que al insertar un paso se rompa otro sin
// que salte ninguna prueba.
export const PASO = {
  personas: 1, alimentos: 2, dictar: 3, compra: 4,
  cantidades: 5, reparto: 6, preparaciones: 7, mes: 8
};

export const PASOS = [
  { id: PASO.personas, titulo: '¿Quiénes comen en tu casa?', corto: 'Personas' },
  { id: PASO.alimentos, titulo: 'La canasta base de tu hogar', corto: 'Alimentos' },
  { id: PASO.dictar, titulo: '¿Falta algo por dictar o escribir de corrido?', corto: 'Dictar' },
  { id: PASO.compra, titulo: '¿Cada cuánto hacen la compra principal en tu hogar?', corto: 'Compra' },
  { id: PASO.cantidades, titulo: '¿Cuánto se compra normalmente al mes?', corto: 'Cantidades' },
  { id: PASO.reparto, titulo: 'Cómo se reparte entre las dos quincenas', corto: 'Reparto' },
  { id: PASO.preparaciones, titulo: 'Las comidas que se repiten en tu casa', corto: 'Preparaciones' },
  { id: PASO.mes, titulo: 'Tu primer mes', corto: 'El mes' }
];

// El paso del reparto solo existe para quien compra por quincenas. A quien
// compra una vez al mes no se le enseña un paso que no tiene nada que decidir,
// ni se le cuenta en «paso 5 de 8» un paso por el que no va a pasar.
export const pasosDe = setup => PASOS.filter(paso => paso.id !== PASO.reparto || setup?.frecuencia === 'quincenal');
const posicionDe = (setup, paso) => pasosDe(setup).findIndex(item => item.id === paso);
const saltarA = (setup, desde, direccion) => {
  const visibles = pasosDe(setup);
  const indice = visibles.findIndex(item => item.id === desde);
  const destino = visibles[Math.min(visibles.length - 1, Math.max(0, indice + direccion))];
  return destino ? destino.id : desde;
};

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
  frecuencia: null,   // 'mensual' | 'quincenal', se pregunta en el paso de la compra
  personas: null,     // cuántas comen en casa; null es «todavía no lo ha dicho»
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

const CAMPOS_GUARDADOS = ['paso', 'precargado', 'rubro', 'elegidos', 'propios', 'cantidades', 'texto', 'frecuencia', 'personas', 'guardados'];

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
  setup.frecuencia = FRECUENCIAS.includes(setup.frecuencia) ? setup.frecuencia : null;
  setup.personas = Number(setup.personas) > 0 ? Math.min(20, Math.round(Number(setup.personas))) : null;
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
    <p class="eyebrow">Organizar mi casa</p>
    <p class="setup-camino">Ocho pasos cortos: quiénes comen aquí, lo que compras todos los meses, cuánto y cada cuánto, las comidas que se repiten, y el primer menú.</p>
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
    <p class="pantalla-intro">Indica cuánto compras normalmente. Puedes completarlo o corregirlo después.</p>
    <p class="small muted">Es la cantidad de un <strong>mes completo</strong>, aunque compres dos veces. Si no la sabes, déjala vacía: el alimento se guarda igual y la cantidad queda pendiente.</p>
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

/* ── Paso 3: cada cuánto se hace la compra ─────────────────────────────────

   Dos opciones y nada más. No se pregunta el día, ni el presupuesto, ni quién
   va: lo único que la app necesita saber es en cuántas veces se parte la lista,
   porque de ahí salen uno o dos períodos de compra al mes. */

function pasoFrecuencia(ctx, setup) {
  // Solo se enseña marcada una opción que alguien haya elegido de verdad. La
  // app se comporta como mensual mientras nadie diga nada, pero pintar
  // «Mensual» ya marcada sería contestar por el usuario una pregunta que
  // acabamos de hacerle, y dejarle pulsar Continuar sin haber decidido.
  const yaSeDijo = historialDeFrecuencia(ctx.state).length > 0;
  const elegida = setup.frecuencia || (yaSeDijo ? frecuenciaDe(ctx.state, todayISO().slice(0, 7)) : '');
  const opcion = (id, titulo, detalle) => `<button type="button" class="setup-opcion ${elegida === id ? 'activa' : ''}"
      data-action="setup-frecuencia" data-frecuencia="${id}" aria-pressed="${elegida === id}">
      <strong>${esc(titulo)}</strong><small>${esc(detalle)}</small></button>`;
  return `<p class="pantalla-intro">Es lo único que necesitamos saber para armar la lista: si se compra una vez al mes o dos.</p>
    <div class="setup-opciones">
      ${opcion('quincenal', 'Quincenal', 'Dos compras: del 1 al 15 y del 16 al último día del mes.')}
      ${opcion('mensual', 'Mensual', 'Una sola compra que cubre el mes completo.')}
    </div>
    <p class="tiny muted">Las quincenas son del 1 al 15 y del 16 al final del mes, sea de 28, 30 o 31 días. No son períodos de catorce días.</p>
    <p class="tiny muted">Puedes cambiarlo cuando quieras desde Más → Ajustes → Organización de compra, y elegir desde qué mes entra en vigencia.</p>

    <div class="modal-actions setup-actions">
      ${button('Atrás', 'setup-atras', 'btn-quiet')}
      <span class="tour-spacer"></span>
      ${button('Continuar', 'setup-siguiente', 'btn-primary', elegida ? '' : 'disabled')}
    </div>`;
}

/* ── Paso 5: cómo se parte el mes entre las dos quincenas ──────────────────

   La necesidad del mes no se toca. Lo que se decide aquí es cuánto de ella se
   compra en la primera quincena, y solo para los alimentos donde haga falta
   decirlo: el resto se queda en la mitad sugerida, que no es un dato escrito
   sino una cuenta que se rehace sola si mañana cambia la cantidad del mes.

   El arroz y el aceite se compran enteros el día 1 aunque duren el mes; la
   lechuga, no. Esa es exactamente la diferencia que esta pantalla deja marcar. */

function pasoReparto(ctx, setup) {
  const filas = habitualLines(ctx.state)
    .map(linea => ({ linea, item: product(ctx.state, linea.productId) }))
    .filter(fila => fila.item && fila.linea.quantity !== null)
    .sort((a, b) => a.item.name.localeCompare(b.item.name));

  if (!filas.length) {
    return `${notice('Todavía no hay cantidades que repartir.', 'Las cantidades que dejaste en blanco se reparten cuando las escribas. Puedes seguir.')}
      <div class="modal-actions setup-actions">
        ${button('Atrás', 'setup-atras', 'btn-quiet')}
        <span class="tour-spacer"></span>
        ${button('Continuar', 'setup-siguiente', 'btn-primary')}
      </div>`;
  }

  return `<p class="pantalla-intro">Tu casa compra dos veces al mes. Esto no cambia cuánto se compra en total: solo dice cuánto de ello entra en la primera compra.</p>
    <p class="small muted">Sin tocar nada se reparte a la mitad. Cambia solo los que no se reparten así —el arroz o el aceite suelen comprarse enteros el día 1—.</p>

    <div class="card setup-reparto">${filas.map(({ linea, item }) => filaDeReparto(ctx, linea, item)).join('')}</div>

    <div class="modal-actions setup-actions">
      ${button('Atrás', 'setup-atras', 'btn-quiet')}
      <span class="tour-spacer"></span>
      ${button('Continuar', 'setup-siguiente', 'btn-primary')}
    </div>`;
}

export function filaDeReparto(ctx, linea, item) {
  const reparto = repartoDe(ctx.state, linea.productId, linea.quantity);
  const unidad = ETIQUETA_UNIDAD[linea.unit] || linea.unit;
  const boton = (modo, texto) => `<button type="button" class="setup-reparto-modo ${reparto.modo === modo ? 'activo' : ''}"
    data-action="reparto-modo" data-id="${esc(linea.productId)}" data-modo="${modo}" aria-pressed="${reparto.modo === modo}">${esc(texto)}</button>`;
  return `<div class="setup-reparto-fila" data-reparto="${esc(linea.productId)}">
    <div class="setup-reparto-nombre">
      <strong>${esc(item.name)}</strong>
      <span class="small muted">${esc(`${fmtNumero(linea.quantity)} ${unidad} al mes`)}</span>
    </div>
    <div class="setup-reparto-partes">
      <label class="field"><span>1.ª quincena</span>
        <input type="number" min="0" step="any" inputmode="decimal" value="${esc(fmtNumero(reparto.primera))}"
          data-reparto-primera data-id="${esc(linea.productId)}" data-total="${esc(linea.quantity)}"
          aria-label="Cuánto de ${esc(item.name)} en la primera quincena"></label>
      <span class="setup-reparto-segunda" data-reparto-segunda>2.ª: <strong>${esc(fmtNumero(reparto.segunda))}</strong> ${esc(unidad)}</span>
    </div>
    <div class="setup-reparto-modos">
      ${boton('mitad', 'A la mitad')}
      ${boton('todo', 'Todo en la 1.ª')}
      ${boton('nada', 'Todo en la 2.ª')}
    </div>
    ${reparto.sugerido ? '<p class="tiny muted setup-reparto-nota">Repartido a la mitad porque no lo has cambiado.</p>' : ''}
  </div>`;
}

// Los números de esta pantalla son cantidades de comida, no dinero: «2.5» se
// lee mal y «2,5» aún peor dentro de un campo numérico, que espera el punto.
const fmtNumero = valor => String(Math.round((Number(valor) || 0) * 1000) / 1000);

/* ── Paso 6: el primer menú del mes ────────────────────────────────────── */

/* ── El último paso: revisar el mes, no construirlo ────────────────────────

   Antes esto decía «preparar mi primer menú mensual» y mandaba a una pantalla
   en blanco a empezar de cero. Ya no hace falta: al escribir cada preparación
   se dice qué días se repite, así que para cuando se llega aquí el calendario
   está puesto. Lo que queda es mirarlo y cambiar lo que no cuadre, que es muy
   distinto de construirlo.

   Y «Cambiar» abre la preparación, no una pantalla de reglas: ahí es donde la
   persona escribió los días, y es donde va a buscarlos. */

function pasoMenu(ctx, setup) {
  const { state } = ctx;
  const mes = todayISO().slice(0, 7);
  const recetas = state.recipes.length;
  const gente = personasActivas(state).length;
  const reglas = routinesFor(state, mes).filter(rutina => rutina.kind === 'recipe');
  const nombreDe = rutina => state.recipes.find(item => item.id === rutina.recipeId)?.name || 'Preparación eliminada';

  const hecho = `<div class="setup-hecho">
    <span class="setup-hecho-marca" aria-hidden="true">✓</span>
    <h3>Tu casa ya está escrita</h3>
    <p class="muted">${gente} persona${gente === 1 ? '' : 's'} en casa, ${setup.guardados} alimento${setup.guardados === 1 ? '' : 's'} en la canasta base y ${recetas} preparaci${recetas === 1 ? 'ón' : 'ones'}. Escrito una sola vez: desde ahora todos los meses parten de ahí y solo anotas lo diferente.</p>
  </div>`;

  if (!reglas.length) {
    return `${hecho}
      <p class="pantalla-intro">Falta decir qué días se prepara cada comida. Puedes volver atrás y anotarlo dentro de cada preparación —es donde antes te lo preguntamos— o decirlo ahora de una vez.</p>
      ${recetas ? '' : notice('No hay ninguna preparación guardada.', 'El menú del mes va a empezar vacío. Puedes volver atrás y escribir dos o tres: con eso, el mes entero queda hecho.')}
      <div class="modal-actions setup-actions">
        ${button('Atrás', 'setup-atras', 'btn-quiet')}
        ${button('Ahora no', 'setup-ahora-no', 'btn-secondary')}
        ${button('Decir qué días se repiten', 'setup-menu', 'btn-primary btn-grande')}
      </div>`;
  }

  const progreso = monthProgress(state, mes);
  return `${hecho}
    <p class="pantalla-intro">Y tu mes <strong>ya está montado</strong>. Al escribir cada preparación dijiste qué días se repite, así que la aplicación las colocó sola. Esto es lo que quedó; cambia lo que no sea así.</p>

    <div class="card setup-repeticiones">${reglas.map(rutina => {
      const dias = datesForRule(mes, rutina.weekdays, rutina.weeks).length;
      return `<div class="list-row">
        <div class="list-row-main">
          <div class="list-row-title">${esc(nombreDe(rutina))}</div>
          <div class="list-row-sub">${esc(describeRule(rutina.weekdays, rutina.weeks))} · ${esc(rutina.slots.map(etiquetaDeMomento).join(' y '))}</div>
          <div class="list-row-sub">${dias} día${dias === 1 ? '' : 's'} en ${esc(monthName(mes))}${rutina.scope === 'permanent' ? ' · y en los meses siguientes' : ' · solo este mes'}</div>
        </div>
        ${button('Cambiar', 'open-recipe', 'btn-quiet btn-small', `data-id="${esc(rutina.recipeId)}"`)}
      </div>`;
    }).join('')}</div>

    <div class="card soft setup-resumen-mes">
      <div class="between"><strong>${esc(monthName(mes))}</strong><span class="pill warm">${progreso.porcentaje}%</span></div>
      <p class="small muted">${progreso.encasa} comida${progreso.encasa === 1 ? '' : 's'} puesta${progreso.encasa === 1 ? '' : 's'} en casa${progreso.fuera ? ` · ${progreso.fuera} fuera` : ''} · ${progreso.pendientes} sin decidir. Lo que quede en blanco no es un error: se decide cuando toque. Las meriendas van aparte, y un día sin merienda está completo igual.</p>
    </div>

    <div class="modal-actions setup-actions">
      ${button('Atrás', 'setup-atras', 'btn-quiet')}
      ${button('+ Otra repetición', 'setup-menu', 'btn-secondary')}
      ${button('Ver mi mes', 'setup-ver-mes', 'btn-primary btn-grande')}
    </div>`;
}

/* ── Paso 1: quiénes comen en esta casa ────────────────────────────────────

   Esto no se preguntaba aquí, y hacía falta: la app avisa de alergias, reparte
   porciones y cuenta cuánta gente come, y sin nadie registrado no puede hacer
   ninguna de las tres. Quien entraba sin cuenta llegaba al final del asistente
   con la casa vacía.

   No se escribe un segundo formulario de personas. La ficha —nombre, qué es de
   la casa, qué debe evitar y por qué— es exactamente la misma que la del
   asistente del hogar y la de Familia: se abre con `hogar-editar` y la dibuja
   `cuerpoDeFicha`. Un solo sitio donde se edita una persona significa un solo
   sitio donde acordarse de preguntar el motivo de una alergia. */

function pasoPersonas(ctx, setup) {
  const { state } = ctx;
  const gente = personasActivas(state);
  const total = Math.min(20, Math.max(1, Number(setup.personas) || gente.length || 1));
  const filas = Math.max(total, gente.length);
  const faltan = Math.max(0, total - gente.length);

  const fila = (indice) => {
    const persona = gente[indice];
    if (!persona) {
      return `<div class="list-row setup-persona pendiente">
        <div class="list-row-main">
          <div class="list-row-title">Persona ${indice + 1}</div>
          <div class="list-row-sub">Sin llenar</div>
        </div>
        ${button('Llenar', 'hogar-editar', 'btn-secondary btn-small', 'data-id=""')}
      </div>`;
    }
    return `<div class="list-row setup-persona">
      <div class="list-row-main">
        <div class="list-row-title">${esc(persona.name)} <span class="pill gray">${esc(claseDe(persona.kind).etiqueta)}</span></div>
        ${resumenDeRestricciones(state, persona)}
      </div>
      ${button('Editar', 'hogar-editar', 'btn-quiet btn-small', `data-id="${esc(persona.id)}"`)}
    </div>`;
  };

  return `<p class="pantalla-intro">Cuéntate a ti también. Con el nombre basta para empezar, y si alguien debe evitar algún alimento se anota aquí mismo.</p>

    <form data-form="setup-personas" class="hogar-contador">
      ${button('−', 'setup-personas-menos', 'hogar-paso', 'aria-label="Una persona menos"')}
      <label class="hogar-numero"><span class="sr-only">Personas que comen en casa</span>
        <input name="total" data-setup-personas type="number" inputmode="numeric" min="1" max="20" value="${total}" required></label>
      ${button('+', 'setup-personas-mas', 'hogar-paso', 'aria-label="Una persona más"')}
    </form>

    <div class="card setup-personas">${Array.from({ length: filas }, (unused, i) => fila(i)).join('')}</div>

    ${faltan
      ? notice(`${faltan === 1 ? 'Falta una persona' : `Faltan ${faltan} personas`} por llenar.`, 'Puedes seguir igual y anotarlas después desde Más → Familia y restricciones. Mientras no estén, la app no sabrá avisarte de lo que esa persona debe evitar.')
      : ''}

    <p class="tiny muted setup-nota">No te preguntamos el peso, ni la fecha de nacimiento, ni nada médico: la app no lo usa para nada.</p>

    <div class="modal-actions setup-actions">
      <span class="tour-spacer"></span>
      ${button('Continuar', 'setup-siguiente', 'btn-primary')}
    </div>`;
}

/* ── Paso 7: las comidas que se repiten ────────────────────────────────────

   El asistente terminaba ofreciendo «Preparar mi primer menú mensual», y al
   entrar ahí no había ninguna preparación que poner: el menú se pedía antes de
   que existiera nada con qué llenarlo. Es el orden al revés.

   Aquí se escriben. Y se escriben en la ventana de siempre —la misma que sale
   desde «Nueva preparación»— y no en una versión recortada de ella: el primer
   intento pedía solo el nombre y los momentos, y quien registraba su casa
   entera se quedaba sin poder decir qué lleva cada plato, cuánto rinde ni qué
   nota tiene para quien cocina. Dos formularios de la misma cosa es una
   promesa rota en el sitio donde más se nota: cuando el segundo enseña campos
   que el primero no tenía.

   Encadenar es lo otro que hacía falta: «Guardar y añadir otra» deja la
   ventana abierta y en blanco, para escribir las seis comidas de la casa de
   una sentada. */

function pasoPreparaciones(ctx, setup) {
  const { state } = ctx;
  const recetas = state.recipes;
  const fila = receta => `<div class="list-row">
    <div class="list-row-main">
      <div class="list-row-title">${esc(receta.name)}</div>
      <div class="list-row-sub">${receta.uses.length ? esc(receta.uses.map(etiquetaDeMomento).join(' · ')) : 'Sin momentos: no saldrá en el calendario'}</div>
      <div class="list-row-sub">${receta.items.length
        ? `${receta.items.length} alimento${receta.items.length === 1 ? '' : 's'}`
        : '<span class="muted">sin alimentos todavía</span>'}${receta.servings ? ` · rinde ${esc(String(receta.servings))} porcion${Number(receta.servings) === 1 ? '' : 'es'}` : ''}${receta.note ? ' · con nota' : ''}</div>
    </div>
    <div class="inline">
      ${button('Editar', 'open-recipe', 'btn-quiet btn-small', `data-id="${esc(receta.id)}"`)}
      ${button('Quitar', 'setup-quitar-preparacion', 'btn-quiet btn-small', `data-id="${esc(receta.id)}"`)}
    </div>
  </div>`;

  const sinAlimentos = recetas.filter(receta => !receta.items.length).length;
  return `<p class="pantalla-intro">Escribe las comidas que se cocinan de costumbre en tu casa: cómo se llama cada una, en qué momentos se come, qué lleva y en qué cantidades, cuánto rinde y la nota para quien cocina. <strong>Es la misma ventana de siempre</strong>, y con «Guardar y añadir otra» se escriben todas de una sentada.</p>

    <div class="setup-preparaciones-anadir">
      ${button('+ Añadir una preparación', 'open-recipe', 'btn-primary btn-grande')}
    </div>

    ${recetas.length
      ? `<div class="card">${recetas.map(fila).join('')}</div>
         <p class="tiny muted">Una misma preparación puede estar en varios momentos: el mangú con salami suele ser desayuno y cena.${sinAlimentos ? ` Hay ${sinAlimentos} sin alimentos anotados: sirven igual para llenar el calendario, pero no suman a la compra hasta que digas qué llevan.` : ''}</p>`
      : notice('Todavía no has guardado ninguna.',
          'Sin preparaciones, el menú del mes empieza vacío y hay que escribir cada día a mano. Con dos o tres, el mes entero queda hecho.')}

    <div class="modal-actions setup-actions">
      ${button('Atrás', 'setup-atras', 'btn-quiet')}
      <span class="tour-spacer"></span>
      ${button('Continuar', 'setup-siguiente', 'btn-primary')}
    </div>`;
}

/* ── Armazón ───────────────────────────────────────────────────────────── */

function barra(setup) {
  const visibles = pasosDe(setup);
  const posicion = posicionDe(setup, setup.paso);
  return `<div class="setup-steps" role="list" aria-label="Progreso">
    ${visibles.map((item, indice) => `<div class="setup-step ${indice === posicion ? 'now' : indice < posicion ? 'done' : ''}" role="listitem" ${indice === posicion ? 'aria-current="step"' : ''}>
      <span class="setup-dot" aria-hidden="true">${indice < posicion ? '✓' : indice + 1}</span><span class="setup-label">${esc(item.corto)}</span></div>`).join('')}
  </div><div class="progress setup-progress"><span style="width:${Math.round((posicion + 1) / visibles.length * 100)}%"></span></div>`;
}

export function renderSetup(ctx) {
  const setup = ctx.ui.setup;
  if (!setup || setup.paso === 0) return pantallaInicio(setup);

  const cuerpo = setup.paso === PASO.personas ? pasoPersonas(ctx, setup)
    : setup.paso === PASO.alimentos ? pantallaDeRubro(setup)
    : setup.paso === PASO.dictar ? pasoPropios(setup, ctx)
    : setup.paso === PASO.compra ? pasoFrecuencia(ctx, setup)
    : setup.paso === PASO.cantidades ? pasoCantidades(setup)
    : setup.paso === PASO.reparto ? pasoReparto(ctx, setup)
    : setup.paso === PASO.preparaciones ? pasoPreparaciones(ctx, setup)
    : pasoMenu(ctx, setup);

  const visibles = pasosDe(setup);
  const posicion = posicionDe(setup, setup.paso);
  const actual = PASOS.find(item => item.id === setup.paso) || PASOS[0];

  return `<section class="setup">
    <div class="setup-head">
      <div><p class="eyebrow">Paso ${posicion + 1} de ${visibles.length}</p><h2>${esc(actual.titulo)}</h2></div>
      ${setup.paso === PASO.mes ? '' : button('Salir', 'setup-salir', 'btn-quiet btn-small')}
    </div>
    ${barra(setup)}
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

/* ── El reparto entre quincenas, escrito a mano ────────────────────────────

   Lo que se teclea en las casillas de la primera quincena vive en el DOM
   mientras se edita, igual que las cantidades del paso anterior: cualquier cosa
   que redibuje tiene que pasar antes por aquí.

   La conversión a modo no es cosmética. Escribir exactamente la mitad se guarda
   como «a la mitad» —es decir, no se guarda nada— para que la sugerencia siga
   viva si mañana cambia la cantidad del mes; escribir el total se guarda como
   «todo en la primera», que es lo que alguien quiso decir aunque el mes cambie
   de número. Solo lo que está de verdad en medio se guarda como una cifra. */

function guardarUnaParte(state, productId, escrito, total) {
  const primera = Math.min(total, Math.max(0, Number(escrito) || 0));
  const mitad = Math.round((total / 2) * 1000) / 1000;
  try {
    if (primera >= total && total > 0) ponerReparto(state, productId, 'todo');
    else if (primera <= 0) ponerReparto(state, productId, 'nada');
    else if (primera === mitad) ponerReparto(state, productId, 'mitad');
    else ponerReparto(state, productId, 'cantidad', primera);
  } catch { /* El alimento se borró mientras se editaba: no hay nada que repartir. */ }
}

export function leerRepartoEscrito(ctx) {
  if (typeof document === 'undefined') return;
  for (const campo of document.querySelectorAll('[data-reparto-primera]')) {
    const total = Number(campo.dataset.total);
    if (campo.value === '' || !Number.isFinite(total)) continue;
    guardarUnaParte(ctx.state, campo.dataset.id, campo.value, total);
  }
}

// Una casilla concreta, al salir de ella. Se redibuja porque la segunda
// quincena y los tres botones de al lado tienen que decir la verdad.
export function aplicarReparto(ctx, campo) {
  const total = Number(campo?.dataset?.total);
  if (!Number.isFinite(total)) return;
  guardarUnaParte(ctx.state, campo.dataset.id, campo.value, total);
  ctx.commit('');
}

// Salir de la pantalla o del paso del micrófono sin retirar los oyentes deja el
// motor de voz escribiendo en una pantalla que ya no existe.
// `cancelarDictado` es asíncrona: sin recoger el rechazo, un micrófono que falla
// al cerrarse tumbaría la salida de la pantalla. Cerrarlo nunca puede impedir
// irse.
// Lo que esté escrito en la pantalla que se deja, sea cual sea. Antes esto era
// un par de `if (paso === 2)` repetidos en tres acciones, y cada paso nuevo
// obligaba a acordarse de los tres.
function recordarLoEscrito(ctx) {
  const paso = ctx.ui.setup?.paso;
  if (paso === PASO.personas) recordarPersonas(ctx);
  if (paso === PASO.dictar) recordarTexto(ctx);
  if (paso === PASO.cantidades) recordarCantidades(ctx);
}

// El número que se esté viendo, venga de los botones o de haberlo tecleado.
function recordarPersonas(ctx) {
  const escrito = document.querySelector('[data-setup-personas]')?.value;
  const total = Math.round(Number(escrito));
  if (Number.isFinite(total) && total > 0) ctx.ui.setup.personas = Math.min(20, total);
}

function ajustarPersonas(ctx, delta) {
  const setup = ctx.ui.setup;
  recordarPersonas(ctx);
  const actual = Number(setup.personas) || personasActivas(ctx.state).length || 1;
  setup.personas = Math.min(20, Math.max(1, actual + delta));
  guardarAvance(ctx);
  ctx.render();
}

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
    ctx.ui.setup.paso = PASOS[0].id;
    guardarAvance(ctx);
    ctx.render();
  },
  'setup-salir': (el, ctx) => {
    const setup = ctx.ui.setup;
    recordarLoEscrito(ctx);
    soltarMicrofono(ctx);
    // Salir no descarta nada: el avance se queda escrito donde estaba.
    guardarAvance(ctx);
    ctx.ui.page = 'hoy';
    ctx.render();
    ctx.toast('Guardado. Puedes retomarlo desde Más → Organizar mi casa.');
  },
  'setup-atras': (el, ctx) => {
    const setup = ctx.ui.setup;
    recordarLoEscrito(ctx);
    soltarMicrofono(ctx);
    // Volver al paso de los alimentos devuelve el último rubro, no el primero:
    // es donde estaba quien pulsó «Atrás».
    setup.paso = saltarA(setup, setup.paso, -1);
    if (setup.paso === PASO.alimentos) setup.rubro = RUBROS.length - 1;
    guardarAvance(ctx);
    ctx.render();
  },
  'setup-siguiente': (el, ctx) => {
    const setup = ctx.ui.setup;
    recordarLoEscrito(ctx);
    setup.paso = saltarA(setup, setup.paso, 1);
    guardarAvance(ctx);
    ctx.render();
  },

  // Paso 3: cada cuánto se compra.
  //
  // La primera vez entra en vigencia desde el mes en curso: no hay pasado que
  // proteger todavía. Cambiarla después se hace desde Ajustes, y ahí sí se
  // pregunta desde cuándo.
  'setup-frecuencia': (el, ctx) => {
    const setup = ctx.ui.setup;
    if (!FRECUENCIAS.includes(el.dataset.frecuencia)) return;
    setup.frecuencia = el.dataset.frecuencia;
    ponerFrecuencia(ctx.state, setup.frecuencia, todayISO().slice(0, 7));
    guardarAvance(ctx);
    ctx.commit('');
  },

  // Paso 5: el reparto entre quincenas.
  'reparto-modo': (el, ctx) => {
    leerRepartoEscrito(ctx);
    ponerReparto(ctx.state, el.dataset.id, el.dataset.modo);
    ctx.commit('');
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
    if (setup.rubro >= RUBROS.length - 1) setup.paso = PASO.dictar;
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
  /* ── Paso 1: cuántas personas comen en casa ──────────────────────────── */

  'setup-personas-mas': (el, ctx) => ajustarPersonas(ctx, 1),
  'setup-personas-menos': (el, ctx) => ajustarPersonas(ctx, -1),

  /* ── Paso 7: quitar una preparación recién escrita ───────────────────── */

  // Quitar aquí es quitar del todo, y se pregunta: la preparación puede llevar
  // diez minutos escrita o llevar puesta en veinte días del calendario.
  'setup-quitar-preparacion': (el, ctx) => {
    const receta = ctx.state.recipes.find(item => item.id === el.dataset.id);
    if (!receta) return;
    const puestas = ctx.state.plans.filter(plan => plan.recipeId === receta.id).length;
    const aviso = puestas
      ? `«${receta.name}» está puesta en ${puestas} comida(s) del calendario. Quitarla de aquí no las borra, pero dejarán de poder repetirse. ¿Quitarla?`
      : `¿Quitar «${receta.name}»?`;
    if (!window.confirm(aviso)) return;
    deleteRecipe(ctx.state, receta.id);
    ctx.commit(`«${receta.name}» quitada.`);
  },

  'setup-menu': (el, ctx) => {
    const mes = todayISO().slice(0, 7);
    olvidarAvance(ctx.state);
    ctx.ui.setup = null;
    ctx.ui.page = 'mes';
    ctx.openModal('rutina', { month: mes });
  },
  // Terminar mirando el mes que quedó hecho, no una pantalla en blanco.
  'setup-ver-mes': (el, ctx) => {
    olvidarAvance(ctx.state);
    ctx.ui.setup = null;
    ctx.ui.page = 'mes';
    ctx.commit('Tu mes está montado. Revisa lo que será diferente.');
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
    setup.paso = PASO.compra;
    guardarAvance(ctx);
    ctx.render();
  },

  'setup-cantidades': (form, data, ctx) => {
    const guardados = guardarLoEscrito(ctx);
    ctx.ui.setup.paso = saltarA(ctx.ui.setup, PASO.cantidades, 1);
    // El borrador no se borra aquí, aunque la canasta ya esté escrita donde vive
    // de verdad: detrás quedan dos pasos, y sin borrador cerrar la app en medio
    // devolvería al principio del asistente. Se borra al terminar.
    guardarAvance(ctx);
    ctx.commit(`${guardados} alimento(s) en tu canasta base.`);
  },

  /* ── Paso 1: quiénes comen en casa ───────────────────────────────────── */

  'setup-personas': (form, data, ctx) => {
    recordarPersonas(ctx);
    ctx.ui.setup.paso = saltarA(ctx.ui.setup, PASO.personas, 1);
    guardarAvance(ctx);
    ctx.render();
  }
};
