// «Más»: todo lo que existe pero no se usa a diario.
//
// La navegación tenía siete destinos y cuatro de ellos —Productos y datos,
// Personas, Preparaciones, Revisión— competían de tú a tú con la pantalla de
// hoy. Ninguna casa abre la app para editar una ficha de producto; se abre para
// saber qué se cocina y qué falta comprar.
//
// Nada se ha eliminado: todo sigue aquí, a un toque, ordenado por la frecuencia
// real con que hace falta. Lo que cambia es que ya no estorba.

import { CATEGORIES } from './catalog-seed.js';
import {
  FRECUENCIAS, UNITS, archiveProduct, effectiveBasket, esActiva, findSimilarProducts, frecuenciaDe,
  habitualLines, historialDeFrecuencia, inventoryNow, lastStockReview, monthBasketSummary, monthChanges,
  periodosDelMes, personasActivas, product, productByName, restoreProduct, restriccionesDe,
  reviewAvailability, sliceStyle, syncReviewProducts, todayISO
} from './model.js';
import { filaDeReparto } from './setup.js';
import { claseDe, hogarDe, resumenDeRestricciones } from './hogar.js';
import { WEEKDAY_LABELS, WEEKDAYS } from './routines.js';
import { button, cap, empty, esc, fmt, measure, monthName, niceDate, notice, options, shiftMonth, unitText } from './ui-kit.js';
import { avisoDeVoz, capacidad, comprobarDictado } from './device.js';
import { panelDeVoz } from './voz.js';
// El intérprete de frases vive en el asistente, y entiende «quedan dos plátanos,
// diez huevos y media libra de queso» desde hace tiempo. Escribir aquí un
// segundo intérprete sería tener dos gramáticas que se van separando con los
// meses; se reutiliza esa, que además ya está probada.
import { interpretar } from './chat-ui.js';
import { LEGAL } from './legal.js';

const hoy = todayISO();

// El orden no es alfabético ni por categorías: es por cuántas veces al año una
// casa necesita abrir cada cosa. La canasta se toca a menudo; el respaldo, casi
// nunca, pero cuando hace falta hace muchísima falta.
export const ENTRADAS_MAS = [
  ['canasta', '🧺', 'Mi canasta habitual', 'Lo que se compra todos los meses'],
  ['preparaciones', '📖', 'Preparaciones', 'Las comidas que se repiten en casa'],
  ['familia', '👨‍👩‍👧‍👦', 'Familia y restricciones', 'Quién come y qué evita cada quien'],
  ['revision', '✓', 'Revisar lo que queda', 'Un repaso a la nevera y la despensa'],
  ['alimentos', '🥬', 'Alimentos de la casa', 'La ficha de cada uno: medidas y existencias'],
  ['historial', '🕘', 'Historial', 'Compras, revisiones y correcciones'],
  ['respaldo', '💾', 'Respaldo', 'Guardar una copia o traerla de vuelta'],
  ['cuenta', '👤', 'Mi cuenta', 'Entrar, sincronizar o cerrar sesión'],
  ['ajustes', '⚙️', 'Ajustes', 'Día de revisión, micrófono y ayuda'],
  ['avanzado', '🔧', 'Funciones avanzadas', 'Medidas, correcciones y uniones']
];

// «legal» no sale en el índice —se llega desde Ajustes— pero es una página de
// Más como las otras: necesita el mismo enrutado y el mismo botón de volver.
// «cuenta» sale en el índice de Más, pero no la pinta este archivo: la pintan
// las pantallas de `page-cuenta.js`, que necesitan cosas —la sesión, el cajón
// abierto, la sincronización— que solo conoce `app.js`. Por eso se queda fuera
// de esta lista aunque esté en la de arriba.
export const PAGINAS_MAS = [...ENTRADAS_MAS.map(([id]) => id).filter(id => id !== 'cuenta'), 'legal', 'organizacion'];

export const TITULOS_MAS = {
  ...Object.fromEntries(ENTRADAS_MAS.map(([id, , titulo]) => [id, titulo])),
  // Tampoco sale en el índice: se llega desde Ajustes, que es donde el usuario
  // la pidió —«Ajustes → Organización de compra → Frecuencia de compra»—.
  organizacion: 'Organización de compra'
};

export function emptyMas() {
  return {
    canastaVista: 'habitual', canastaMes: hoy.slice(0, 7), filtroAlimento: '', verArchivados: false,
    revisionFiltro: '', revisionSoloFaltan: false, revisionAviso: '',
    documento: 'privacidad',
    // El formulario de cambiar la frecuencia, plegado hasta que alguien lo pide.
    cambiandoFrecuencia: false, frecuenciaNueva: '', frecuenciaDesde: ''
  };
}

export function renderMas(ctx) {
  const { ui } = ctx;
  if (!ui.mas) ui.mas = emptyMas();
  const pagina = ui.page === 'mas' ? 'inicio' : ui.page;
  const vistas = {
    inicio: renderInicio,
    canasta: renderCanasta,
    preparaciones: renderPreparaciones,
    familia: renderFamilia,
    revision: renderRevision,
    alimentos: renderAlimentos,
    historial: renderHistorial,
    respaldo: renderRespaldo,
    ajustes: renderAjustes,
    organizacion: renderOrganizacion,
    avanzado: renderAvanzado,
    legal: renderLegal
  };
  return (vistas[pagina] || renderInicio)(ctx);
}

function volver(titulo) {
  return `<div class="mas-volver">${button('‹ Más', 'navigate', 'btn-quiet btn-small', 'data-page="mas"')}<h2>${esc(titulo)}</h2></div>`;
}

/* ── El índice ─────────────────────────────────────────────────────────── */

function renderInicio(ctx) {
  const { state } = ctx;
  const pistas = {
    canasta: `${habitualLines(state).length} alimento(s)`,
    preparaciones: `${state.recipes.length}`,
    familia: `${personasActivas(state).length} persona(s)`,
    alimentos: `${state.products.filter(item => !item.archived).length}`,
    revision: lastStockReview(state) ? `última: ${niceDate(lastStockReview(state), { day: 'numeric', month: 'short' })}` : 'nunca',
    historial: `${state.purchases.length} compra(s)`,
    respaldo: pistaDeCopia(state),
    ajustes: ''
  };
  const copia = estadoDeLaCopia(state);
  return `${copia.urgente ? `<div class="notice warn"><span>!</span><div><strong>${copia.ultima ? `Hace ${copia.dias} días que no guardas una copia.` : 'Todavía no has guardado ninguna copia.'}</strong>Todo lo que has escrito existe solo en este teléfono. <button type="button" class="enlace" data-action="navigate" data-page="respaldo">Guardar una ahora</button></div></div>` : ''}
    <div class="card mas-lista">${ENTRADAS_MAS.map(([id, icono, titulo, detalle]) => `
    <button type="button" class="mas-item" data-action="navigate" data-page="${id}">
      <span class="mas-icono" aria-hidden="true">${icono}</span>
      <span class="mas-texto"><strong>${esc(titulo)}</strong><span>${esc(detalle)}</span></span>
      ${pistas[id] ? `<span class="mas-pista ${id === 'respaldo' && copia.urgente ? 'alerta' : ''}">${esc(pistas[id])}</span>` : ''}
      <span class="mas-flecha" aria-hidden="true">›</span>
    </button>`).join('')}</div>
    <div class="card soft mas-pie">
      <h3>¿Cómo funciona?</h3>
      <p class="muted small">Lo habitual se escribe una vez. Cada mes empieza ya preparado y tú solo revisas lo diferente. Si algo no te cuadra, nada de lo que toques aquí borra tu historial.</p>
      <div class="inline">${button('Organizar mi casa', 'setup-open', 'btn-secondary btn-small')}${button('Ver el recorrido', 'open-tour', 'btn-quiet btn-small')}</div>
    </div>`;
}

/* ── Mi canasta habitual ───────────────────────────────────────────────── */

// Una sola canasta a la vista. Lo que antes eran «canasta base» y «canasta
// mensual» —dos conceptos que había que aprender— son ahora la lista y sus
// excepciones, que es como lo piensa cualquiera: «lo de siempre» y «este mes,
// además, cangrejo».
function renderCanasta(ctx) {
  const { state, ui } = ctx;
  const mes = ui.mas.canastaMes;
  const resumen = monthBasketSummary(state, mes);
  const cambios = resumen.cambiados + resumen.quitados + resumen.extras;
  const enCambios = ui.mas.canastaVista === 'cambios';
  return `${volver('Mi canasta habitual')}
    <div class="segmented segmented-ancho">
      <button type="button" data-action="canasta-vista" data-vista="habitual" class="${enCambios ? '' : 'active'}">Lo de siempre</button>
      <button type="button" data-action="canasta-vista" data-vista="cambios" class="${enCambios ? 'active' : ''}">Cambios de este mes${cambios ? ` · ${cambios}` : ''}</button>
    </div>
    ${enCambios ? vistaCambios(ctx, mes, resumen) : vistaHabitual(ctx)}`;
}

function vistaHabitual(ctx) {
  const { state } = ctx;
  const lineas = habitualLines(state);
  if (!lineas.length) {
    return empty('🧺', 'Todavía no has escrito tu canasta',
      'Es la lista de lo que se compra en tu casa todos los meses: los plátanos, el arroz, los huevos, el salami. Se escribe una vez y vale para siempre; después solo cambias lo diferente de cada mes.',
      `${button('Marcarla de una lista', 'setup-open', 'btn-primary')}${button('🗣️ Dictarla de corrido', 'open-bulk', 'btn-secondary', 'data-destino="habitual"')}`);
  }
  const porCategoria = new Map();
  for (const linea of lineas) {
    const item = product(state, linea.productId);
    const categoria = item?.category || 'otros';
    if (!porCategoria.has(categoria)) porCategoria.set(categoria, []);
    porCategoria.get(categoria).push({ linea, item });
  }
  return `<p class="pantalla-intro">Lo que tu casa consume en un mes corriente. Cambiar algo aquí vale <strong>desde ahora y para todos los meses</strong>.</p>
    <form data-form="canasta-habitual" class="canasta-form">
      ${[...porCategoria.entries()].sort((a, b) => etiquetaCategoria(a[0]).localeCompare(etiquetaCategoria(b[0]), 'es')).map(([categoria, filas]) => `
        <h3 class="canasta-grupo">${esc(etiquetaCategoria(categoria))}</h3>
        <div class="card canasta-card">${filas.sort((a, b) => a.item.name.localeCompare(b.item.name, 'es')).map(({ linea, item }) => `
          <div class="canasta-fila">
            <label class="canasta-nombre" for="cant-${linea.productId}">${esc(item.name)}</label>
            <input id="cant-${linea.productId}" class="text canasta-cantidad" type="number" min="0" step="any" inputmode="decimal"
                   name="cantidad-${linea.productId}" value="${linea.quantity ?? ''}" placeholder="—" aria-label="Cantidad al mes de ${esc(item.name)}">
            <select class="canasta-unidad" name="unidad-${linea.productId}" aria-label="Unidad de ${esc(item.name)}">${options(UNITS.map(unidad => [unidad, unidad]), linea.unit)}</select>
            <button type="button" class="btn btn-quiet btn-small" data-action="canasta-quitar" data-id="${linea.productId}" aria-label="Quitar ${esc(item.name)} de la canasta">✕</button>
          </div>`).join('')}</div>`).join('')}
      <p class="small muted">Deja una cantidad en blanco si todavía no la sabes: el alimento sigue en la lista y la compra lo avisará.</p>
      <div class="pantalla-acciones">
        ${button('+ Añadir alimento', 'open-product', 'btn-secondary')}
        ${button('🗣️ Añadir varios de corrido', 'open-bulk', 'btn-quiet', 'data-destino="habitual"')}
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>`;
}

const etiquetaCategoria = id => CATEGORIES.find(cat => cat.id === id)?.label || 'Otros';

// La pista que va al lado de «Respaldo» en el índice de Más.
function pistaDeCopia(state) {
  const copia = estadoDeLaCopia(state);
  if (!copia.hayDatos) return '';
  if (!copia.ultima) return 'sin copia';
  if (copia.dias === 0) return 'hoy';
  return `hace ${copia.dias} ${copia.dias === 1 ? 'día' : 'días'}`;
}

function vistaCambios(ctx, mes, resumen) {
  const { state } = ctx;
  const lineas = effectiveBasket(state, mes);
  const cambiadas = lineas.filter(linea => linea.source !== 'habitual');
  const quitadas = (monthChanges(state, mes)?.changes || []).filter(cambio => cambio.removed);
  return `<div class="toolbar">
      <div class="inline">
        ${button('‹', 'canasta-mes', 'btn-secondary btn-small', 'data-delta="-1" aria-label="Mes anterior"')}
        <div class="strong plan-mes-nombre">${esc(monthName(mes))}</div>
        ${button('›', 'canasta-mes', 'btn-secondary btn-small', 'data-delta="1" aria-label="Mes siguiente"')}
      </div>
    </div>
    <p class="pantalla-intro">Lo que este mes será diferente. <strong>No toca los demás meses</strong> ni cambia tu costumbre.</p>
    ${cambiadas.length || quitadas.length ? `<div class="card">
      ${cambiadas.map(linea => `<div class="list-row">
        <div class="list-row-main">
          <div class="list-row-title">${esc(product(state, linea.productId)?.name || 'Alimento eliminado')} <span class="pill warm">${linea.source === 'extra' ? `extra de ${esc(monthName(mes).split(' ')[0])}` : 'otra cantidad'}</span></div>
          <div class="list-row-sub">${linea.quantity === null ? 'cantidad pendiente' : esc(measure(linea.quantity, linea.unit))} este mes</div>
        </div>
        <div class="inline">
          ${button('Dejarlo fijo', 'canasta-promover', 'btn-secondary btn-small', `data-id="${linea.productId}" data-month="${mes}"`)}
          ${button('Quitar', 'canasta-quitar-cambio', 'btn-quiet btn-small', `data-id="${linea.productId}" data-month="${mes}"`)}
        </div>
      </div>`).join('')}
      ${quitadas.map(cambio => `<div class="list-row">
        <div class="list-row-main">
          <div class="list-row-title">${esc(product(state, cambio.productId)?.name || 'Alimento eliminado')} <span class="pill gray">este mes no</span></div>
          <div class="list-row-sub">Sigue en tu canasta habitual; solo este mes no se compra.</div>
        </div>
        ${button('Volver a comprarlo', 'canasta-quitar-cambio', 'btn-quiet btn-small', `data-id="${cambio.productId}" data-month="${mes}"`)}
      </div>`).join('')}
    </div>
    <p class="small muted">«Dejarlo fijo» lo pasa a tu canasta habitual y desde el mes siguiente aparece solo. Los meses ya cerrados no cambian.</p>`
    : empty('✓', `${monthName(mes)} es un mes normal`, 'No hay nada diferente. Si este mes van a comprar algo especial —un cangrejo para una cena, o menos arroz porque estarán de viaje—, anótalo aquí.', '')}
    <div class="pantalla-acciones">
      ${button('+ Añadir algo solo para este mes', 'canasta-nuevo-cambio', 'btn-primary', `data-month="${mes}"`)}
      ${button('🗣️ Dictar varios', 'open-bulk', 'btn-quiet', `data-destino="mes" data-month="${mes}"`)}
    </div>`;
}

/* ── Preparaciones ─────────────────────────────────────────────────────── */

function renderPreparaciones(ctx) {
  const { state } = ctx;
  const nombrePersona = id => state.people.find(persona => persona.id === id)?.name || 'Persona eliminada';
  return `${volver('Preparaciones')}
    <p class="pantalla-intro">Comidas que se repiten en tu casa. Se guardan una vez y después se ponen en el calendario de golpe, eligiendo los días de la semana.</p>
    <div class="pantalla-acciones">${button('+ Nueva preparación', 'open-recipe', 'btn-primary')}</div>
    ${state.recipes.length
      ? `<div class="grid grid-2">${state.recipes.map(receta => `<article class="card">
          <div class="between"><h3>${esc(receta.name)}</h3><span class="pill warm">${receta.uses.map(cap).join(' · ')}</span></div>
          <p class="small muted">${receta.covers.length ? receta.covers.map(id => esc(nombrePersona(id))).join(', ') : 'Para quien coma ese día'}${receta.servings ? ` · ${fmt(receta.servings)} raciones` : ''}</p>
          ${receta.items.length ? `<ul class="food-list">${receta.items.map(item => `<li>${esc(measure(item.quantity, item.unit))} · ${esc(product(state, item.productId)?.name || '—')}</li>`).join('')}</ul>` : '<p class="small muted">Sin alimentos anotados todavía. Puedes añadirlos cuando quieras.</p>'}
          ${receta.note ? `<p class="small"><strong>Para quien cocina:</strong> ${esc(receta.note)}</p>` : ''}
          <div class="inline">
            ${button('Ponerla en el calendario', 'mes-nueva-rutina', 'btn-secondary btn-small', `data-receta="${receta.id}"`)}
            ${button('Editar', 'open-recipe', 'btn-quiet btn-small', `data-id="${receta.id}"`)}
            ${button('Eliminar', 'delete-recipe', 'btn-quiet btn-small', `data-id="${receta.id}"`)}
          </div>
        </article>`).join('')}</div>`
      : empty('📖', 'Todavía no hay ninguna',
          'Una preparación es algo como «mangú con salami» o «arroz con pollo»: el nombre, en qué comida se sirve y, si quieres, los alimentos principales. No hace falta anotar la sal ni el aceite.',
          button('Crear la primera', 'open-recipe', 'btn-primary'))}`;
}

/* ── Familia ───────────────────────────────────────────────────────────── */

// Quien llega aquí viene por una de dos razones: registrar a su casa por primera
// vez, o cambiar algo porque la familia cambió. Las dos tienen su botón arriba y
// ninguna obliga a pasar por la otra.
//
// Dar de baja no borra. Una persona que se fue de casa tiene que seguir
// leyéndose en las comidas de marzo —fue quien las comió— y su ficha sigue
// entera por si vuelve. Lo único que cambia es que deja de contar para lo que se
// va a cocinar. Por eso aquí no hay ningún botón de «eliminar»: borrar a alguien
// reescribiría el historial, que es justo lo que no puede pasar.
function renderFamilia(ctx) {
  const { state } = ctx;
  const nombreProducto = id => product(state, id)?.name || 'Alimento eliminado';
  const enCasa = personasActivas(state);
  const fuera = state.people.filter(persona => !esActiva(persona));
  const hogar = hogarDe(state);
  const sinMotivo = state.people.reduce((total, persona) => total + restriccionesDe(persona).filter(fila => !fila.motivo).length, 0);

  const tarjeta = (persona, activa) => `<article class="card familia-persona">
    <div class="between">
      <h3>${esc(persona.name)}</h3>
      <div class="familia-etiquetas">
        <span class="pill gray">${esc(claseDe(persona.kind).etiqueta)}</span>
        ${activa ? '' : '<span class="pill warm">Dado de baja</span>'}
      </div>
    </div>
    ${resumenDeRestricciones(state, persona)}
    ${persona.habitual?.length ? `<p class="small" style="margin-top:12px"><strong>Come normalmente:</strong> ${persona.habitual.map(item => `${esc(measure(item.quantity, item.unit))} de ${esc(nombreProducto(item.productId))}`).join(' · ')}</p>` : ''}
    <div class="familia-acciones">
      ${button('Editar', 'hogar-editar', 'btn-secondary btn-small', `data-id="${persona.id}"`)}
      ${activa
        ? button('Ya no vive aquí', 'hogar-baja', 'btn-quiet btn-small', `data-id="${persona.id}"`)
        : button('Vuelve a vivir aquí', 'hogar-alta', 'btn-secondary btn-small', `data-id="${persona.id}"`)}
    </div>
  </article>`;

  return `${volver('Familia y restricciones')}
    <p class="pantalla-intro">Quién come en casa y qué evita cada quien. La app avisa si una comida lleva algo que alguien no puede comer.</p>
    <div class="pantalla-acciones">
      ${button(hogar.estado === 'listo' || enCasa.length ? 'Configurar mi hogar otra vez' : 'Configurar mi hogar', 'hogar-open', enCasa.length ? 'btn-secondary' : 'btn-primary')}
      ${button('+ Añadir persona', 'hogar-editar', enCasa.length ? 'btn-primary' : 'btn-secondary')}
      ${button('Marcar una ausencia', 'open-absence', 'btn-secondary')}
    </div>
    ${sinMotivo ? notice('Hay alimentos anotados sin decir por qué', `${sinMotivo} alimento(s) están marcados como «sin decir»: se anotaron antes de que la app preguntara si era alergia, intolerancia o preferencia. La app avisa de ellos igual que siempre. Si entras a editar a la persona puedes decir cuál es cada uno.`, 'warn') : ''}
    ${enCasa.length
      ? `<div class="grid grid-2">${enCasa.map(persona => tarjeta(persona, true)).join('')}</div>`
      : empty('👨‍👩‍👧‍👦', 'Todavía no hay nadie', 'Anotar quién come en casa sirve para dos cosas: avisar de alergias y saber para cuántos se cocina. Son dos preguntas por persona.', button('Configurar mi hogar', 'hogar-open', 'btn-primary'))}
    ${fuera.length ? `<div class="section-head"><h3 class="plan-sub">Ya no viven aquí</h3></div>
      <p class="small muted">Siguen apareciendo en las comidas de antes, porque las comieron. No cuentan para las comidas nuevas.</p>
      <div class="grid grid-2 familia-baja">${fuera.map(persona => tarjeta(persona, false)).join('')}</div>` : ''}
    ${state.absences.length ? `<div class="section-head"><h3 class="plan-sub">Ausencias anotadas</h3></div>
      <div class="card">${[...state.absences].sort((a, b) => a.date.localeCompare(b.date)).map(item => `<div class="list-row"><div class="list-row-main"><div class="list-row-title">${esc(state.people.find(p => p.id === item.personId)?.name || 'Persona eliminada')}</div><div class="list-row-sub">${cap(item.slot)} · ${esc(niceDate(item.date, { weekday: 'long', day: 'numeric', month: 'long' }))}</div></div>${button('Quitar', 'remove-absence', 'btn-quiet btn-small', `data-date="${item.date}" data-slot="${item.slot}" data-id="${item.personId}"`)}</div>`).join('')}</div>` : ''}`;
}

/* ── Revisar lo que queda ──────────────────────────────────────────────── */

// «¿Cuánto queda?» en vez de «¿cuánto se consumió?». La diferencia parece
// pequeña y no lo es: lo primero se contesta abriendo la nevera y mirando; lo
// segundo obliga a recordar toda la semana y a restar de cabeza.
function renderRevision(ctx) {
  const { state, ui } = ctx;
  const abierta = state.reviews.find(item => item.id === ui.reviewId) || [...state.reviews].reverse().find(item => item.status === 'draft');
  if (abierta) syncReviewProducts(state, abierta);
  const ultima = lastStockReview(state);
  if (!abierta) {
    return `${volver('Revisar lo que queda')}
      ${empty('✓', ultima ? `Última revisión: ${niceDate(ultima, { day: 'numeric', month: 'long' })}` : 'Todavía no has revisado nada',
        'Abre la nevera y la despensa y escribe lo que ves. La app calcula sola lo que se consumió y afina la lista de la compra.',
        button('Empezar una revisión', 'open-new-review', 'btn-primary'))}
      ${state.reviews.filter(item => item.status === 'confirmed').length ? `<div class="section-head"><h3 class="plan-sub">Revisiones anteriores</h3></div><div class="card">${[...state.reviews].filter(item => item.status === 'confirmed').reverse().slice(0, 8).map(item => `<div class="list-row"><div class="list-row-main"><div class="list-row-title">${esc(niceDate(item.date, { day: 'numeric', month: 'long', year: 'numeric' }))}</div><div class="list-row-sub">${item.productIds.filter(id => item.consumed[id] !== undefined).length} de ${item.productIds.length} alimentos</div></div>${button('Ver', 'select-review', 'btn-quiet btn-small', `data-id="${item.id}"`)}</div>`).join('')}</div>` : ''}`;
  }
  return `${volver('Revisar lo que queda')}${tablaDeRevision(ctx, abierta)}`;
}

function tablaDeRevision(ctx, revision) {
  const { state, ui } = ctx;
  const disponible = reviewAvailability(state, revision);
  const editando = revision.status === 'draft' || ui.correctingReview;
  const queda = (revision.mode || 'restante') === 'restante';
  if (!revision.productIds.length) {
    return empty('🧺', 'No hay nada que revisar', 'Todavía no hay alimentos con existencias anotadas. Anota una compra primero.', button('Ir a la compra', 'navigate', 'btn-secondary', 'data-page="compra"'));
  }
  // Revisar treinta alimentos de corrido es donde se abandona la revisión. Por
  // eso hay tres salidas: buscar el que se tiene en la mano, esconder los que ya
  // están contestados, y dictar varios de un tirón.
  const filtro = String(ui.mas.revisionFiltro || '').trim().toLocaleLowerCase('es');
  const contestado = id => revision.consumed[id] !== undefined;
  const visibles = revision.productIds.filter(id => {
    if (ui.mas.revisionSoloFaltan && contestado(id)) return false;
    if (!filtro) return true;
    const item = product(state, id);
    return item?.name.toLocaleLowerCase('es').includes(filtro) || (item?.aliases || []).some(alias => String(alias).toLocaleLowerCase('es').includes(filtro));
  });
  const faltan = revision.productIds.filter(id => !contestado(id)).length;

  return `<p class="pantalla-intro">${esc(niceDate(revision.date, { weekday: 'long', day: 'numeric', month: 'long' }))} · ${queda ? 'Escribe lo que ves en casa. La resta la hacemos nosotros.' : 'Escribe lo que se consumió desde la última vez.'}</p>
    ${editando && revision.status === 'draft' ? `<div class="segmented segmented-ancho">
      <button type="button" data-action="review-mode" data-mode="restante" data-id="${revision.id}" class="${queda ? 'active' : ''}">¿Cuánto queda?</button>
      <button type="button" data-action="review-mode" data-mode="consumido" data-id="${revision.id}" class="${queda ? '' : 'active'}">Lo consumido</button>
    </div>` : ''}
    ${editando ? herramientasDeRevision(ctx, revision, faltan, queda) : ''}
    <form data-form="review" data-id="${revision.id}">
      <div class="card revision-lista">${(visibles.length ? visibles : []).map(id => {
        const item = product(state, id);
        const habia = disponible[id] || 0;
        const usado = revision.consumed[id];
        const resto = revision.remaining?.[id];
        const escrito = queda ? resto : usado;
        const derivado = usado === undefined ? null : queda ? usado : Math.max(0, habia - usado);
        return `<div class="revision-fila" data-review-product="${id}" data-available="${habia}" data-mode="${queda ? 'restante' : 'consumido'}">
          <div class="revision-nombre">
            <strong>${esc(item?.name || 'Alimento eliminado')}</strong>
            <span class="small muted">Había ${esc(measure(habia, item?.controlUnit || ''))}${esc(corte(item, habia))}</span>
          </div>
          ${editando
            ? `<input class="text revision-dato" type="number" name="consume-${id}" min="0" ${queda ? '' : `max="${habia}"`} step="any" inputmode="decimal" placeholder="—" value="${escrito === undefined || escrito === null ? '' : escrito}" aria-label="${queda ? `Cuánto queda de ${esc(item?.name || '')}` : `Cuánto se consumió de ${esc(item?.name || '')}`}">`
            : `<span class="revision-dato">${escrito === undefined || escrito === null ? '—' : fmt(escrito)}</span>`}
          <span class="revision-derivado remaining ${derivado === null ? 'pending' : 'good'}">${derivado === null ? 'pendiente' : `${queda ? 'se consumió' : 'queda'} ${fmt(derivado)}`}</span>
        </div>`;
      }).join('') || `<p class="muted">Nada coincide con «${esc(ui.mas.revisionFiltro)}».</p>`}</div>
      ${ocultas(revision, visibles, queda, editando)}
      <p class="small muted">Lo que dejes en blanco queda pendiente y no cambia nada. Escribe <strong>0</strong> si ${queda ? 'no queda nada' : 'no se consumió nada'}.</p>
      <div class="pantalla-acciones">${editando
        ? revision.status === 'draft'
          ? `<button type="submit" name="intent" value="save" class="btn btn-secondary">Guardar y seguir después</button><button type="submit" name="intent" value="confirm" class="btn btn-primary">Terminar</button>`
          : `<button type="submit" name="intent" value="correct" class="btn btn-primary">Guardar la corrección</button>`
        : `<span class="pill">Terminada</span>${button('Corregir', 'toggle-correct-review', 'btn-quiet btn-small')}`}</div>
    </form>`;
}

// Filtrar esconde filas, y `saveReview` reconstruye la revisión entera con lo
// que venga en el formulario: una fila que no esté deja de existir y borraría la
// respuesta que ya tenía. Por eso lo escondido sigue viajando, en un campo
// oculto con su valor. Buscar no puede costarle a nadie lo que ya había contado.
function ocultas(revision, visibles, queda, editando) {
  if (!editando) return '';
  const dentro = new Set(visibles);
  return revision.productIds.filter(id => !dentro.has(id)).map(id => {
    const valor = queda ? revision.remaining?.[id] : revision.consumed[id];
    return `<input type="hidden" name="consume-${id}" value="${valor === undefined || valor === null ? '' : valor}">`;
  }).join('');
}

// La barra de herramientas de la revisión: buscar, esconder lo ya contestado y
// dictar varios de corrido.
function herramientasDeRevision(ctx, revision, faltan, queda) {
  const { ui } = ctx;
  const motor = capacidad('dictar');
  return `<div class="revision-herramientas">
    <label class="field revision-buscar"><span class="sr-only">Buscar un alimento de esta revisión</span>
      <input type="search" id="revision-filtro" data-revision-buscar value="${esc(ui.mas.revisionFiltro)}" placeholder="Buscar un alimento…" aria-label="Buscar un alimento de esta revisión">
    </label>
    <div class="inline">
      <button type="button" class="chip ${ui.mas.revisionSoloFaltan ? 'activa' : ''}" data-action="revision-solo-faltan" aria-pressed="${ui.mas.revisionSoloFaltan}">Solo lo que falta · ${faltan}</button>
      ${motor.ok ? `<button type="button" class="btn btn-secondary btn-small" data-action="voz-abrir" data-destino="revision" aria-label="Dictar o escribir lo que queda">🎤 Dictar</button>` : ''}
    </div>
    ${panelDeVoz(ctx, 'revision')}
    ${ui.mas.revisionAviso ? `<p class="small revision-aviso">${esc(ui.mas.revisionAviso)}</p>` : ''}
  </div>`;
}

const corte = (item, cantidad) => {
  const estilo = sliceStyle(item?.slice);
  if (!estilo) return '';
  const palabra = estilo.label.toLowerCase();
  return ` ${cantidad > 0 && cantidad <= 1 ? palabra : `${palabra}s`}`;
};

/* ── Alimentos de la casa ──────────────────────────────────────────────── */

function renderAlimentos(ctx) {
  const { state, ui } = ctx;
  const filtro = String(ui.mas.filtroAlimento || '').trim().toLocaleLowerCase('es');
  const existencias = inventoryNow(state);
  const visibles = state.products
    .filter(item => ui.mas.verArchivados || !item.archived)
    .filter(item => !filtro || item.name.toLocaleLowerCase('es').includes(filtro) || (item.aliases || []).some(alias => String(alias).toLocaleLowerCase('es').includes(filtro)))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, 'es'));
  const archivados = state.products.filter(item => item.archived).length;
  return `${volver('Alimentos de la casa')}
    <p class="pantalla-intro">La ficha de cada alimento: cómo se cuenta, cómo se compra y cuánto hay. Normalmente no hace falta entrar aquí; la app rellena esto sola cuando marcas o dictas alimentos.</p>
    <div class="pantalla-acciones">${button('+ Añadir alimento', 'open-product', 'btn-primary')}${button('🗣️ Dictar varios', 'open-bulk', 'btn-secondary')}</div>
    ${state.products.length ? `<div class="toolbar">
      <label class="field" style="flex:1"><span class="sr-only">Buscar</span><input type="search" id="alimento-filtro" value="${esc(ui.mas.filtroAlimento)}" placeholder="Buscar entre ${state.products.length} alimentos…" aria-label="Buscar un alimento"></label>
      ${archivados ? button(ui.mas.verArchivados ? 'Ocultar archivados' : `Ver ${archivados} archivados`, 'alimentos-archivados', 'btn-quiet btn-small') : ''}
    </div>
    <div class="card">${visibles.map(item => filaDeAlimento(state, item, existencias)).join('') || '<p class="muted">Nada coincide con esa búsqueda.</p>'}</div>`
      : empty('🥬', 'Todavía no hay alimentos', 'Lo más rápido es marcarlos de una lista: se registran solos, con su categoría y su unidad.', `${button('Marcarlos de una lista', 'setup-open', 'btn-primary')}${button('Añadir uno a mano', 'open-product', 'btn-secondary')}`)}`;
}

function filaDeAlimento(state, item, existencias) {
  const linea = habitualLines(state).find(row => row.productId === item.id);
  const equivalencias = Object.entries(item.equivalences || {});
  const categoria = CATEGORIES.find(cat => cat.id === item.category);
  const hay = existencias[item.id] || 0;
  return `<div class="list-row ${item.archived ? 'archived' : ''}">
    <div class="list-row-main">
      <div class="list-row-title">${esc(item.name)} ${item.archived ? '<span class="pill gray">archivado</span>' : linea ? `<span class="pill">${linea.quantity === null ? 'cantidad pendiente' : `${esc(measure(linea.quantity, linea.unit))} al mes`}</span>` : '<span class="pill gray">no está en la canasta</span>'}</div>
      <div class="list-row-sub">${categoria ? `${categoria.emoji} ${esc(categoria.label)} · ` : ''}Se cuenta en ${esc(unitText(item.controlUnit, 2))}${equivalencias.length ? ` · 1 ${esc(item.purchaseUnit)} = ${equivalencias.map(([, factor]) => esc(measure(factor, item.controlUnit))).join(' / ')}` : item.purchaseUnit !== item.controlUnit ? ` · se compra en ${esc(unitText(item.purchaseUnit, 2))} <span class="pill gray">falta la medida</span>` : ''} · hay ${esc(measure(hay, item.controlUnit))}</div>
    </div>
    <div class="inline">${item.archived
      ? button('Reactivar', 'restore-product', 'btn-secondary btn-small', `data-id="${item.id}"`)
      : `${button('Editar', 'open-product', 'btn-secondary btn-small', `data-id="${item.id}"`)}${button('⋯', 'open-avanzado-producto', 'btn-quiet btn-small', `data-id="${item.id}" aria-label="Más opciones de ${esc(item.name)}"`)}`}</div>
  </div>`;
}

/* ── Historial ─────────────────────────────────────────────────────────── */

function renderHistorial(ctx) {
  const { state } = ctx;
  const eventos = [
    ...state.purchases.map(item => ({ tipo: 'compra', fecha: item.date, seq: item.seq, item })),
    ...state.reviews.filter(item => item.status === 'confirmed').map(item => ({ tipo: 'revision', fecha: item.date, seq: item.seq, item })),
    ...state.corrections.map(item => ({ tipo: 'correccion', fecha: item.date, seq: item.seq, item }))
  ].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.seq - a.seq);
  return `${volver('Historial')}
    <p class="pantalla-intro">Todo lo que ha movido las existencias, de lo más reciente a lo más antiguo.</p>
    ${eventos.length ? `<div class="card">${eventos.slice(0, 60).map(evento => `<div class="list-row">
      <div class="list-row-main">
        <div class="list-row-title">${({ compra: 'Compra', revision: 'Revisión', correccion: 'Corrección' })[evento.tipo]} · ${esc(niceDate(evento.fecha, { day: 'numeric', month: 'long', year: 'numeric' }))}</div>
        <div class="list-row-sub">${esc(detalleDeEvento(state, evento))}</div>
      </div>
      ${evento.tipo === 'revision' ? button('Ver', 'select-review', 'btn-quiet btn-small', `data-id="${evento.item.id}"`) : ''}
    </div>`).join('')}</div>${eventos.length > 60 ? `<p class="small muted">Se muestran los 60 más recientes de ${eventos.length}.</p>` : ''}`
      : empty('🕘', 'Todavía no hay nada', 'Aquí aparecerán las compras que anotes y las revisiones que hagas.', '')}`;
}

function detalleDeEvento(state, evento) {
  if (evento.tipo === 'compra') {
    const nombres = evento.item.lines.slice(0, 5).map(linea => product(state, linea.productId)?.name || '—');
    return `${evento.item.lines.length} alimento(s): ${nombres.join(', ')}${evento.item.lines.length > 5 ? '…' : ''}`;
  }
  if (evento.tipo === 'revision') {
    const revisados = evento.item.productIds.filter(id => evento.item.consumed[id] !== undefined).length;
    return `${revisados} de ${evento.item.productIds.length} alimentos revisados`;
  }
  const item = product(state, evento.item.productId);
  return `${item?.name || '—'}: ${evento.item.delta >= 0 ? '+' : ''}${fmt(evento.item.delta)} ${item?.controlUnit || ''}${evento.item.reason ? ` · ${evento.item.reason}` : ''}`;
}

/* ── Respaldo ──────────────────────────────────────────────────────────── */

function renderRespaldo(ctx) {
  const { state } = ctx;
  return `${volver('Respaldo')}
    <p class="pantalla-intro">Tus datos viven solo en este teléfono. No hay cuenta, no hay servidor, y ni siquiera la copia automática de Android se los lleva: eso está apagado a propósito. La otra cara es que <strong>si pierdes el teléfono sin una copia, se pierde todo</strong>.</p>
    ${avisoDeCopia(state)}
    <div class="card">
      <h3>Guardar una copia</h3>
      <p class="muted small">Descarga un archivo con todo: alimentos, canasta, preparaciones, compras y revisiones. Guárdalo donde guardes tus cosas importantes —el correo, un pendrive, otra nube—, no en este mismo teléfono.</p>
      ${button('Descargar una copia', 'export', 'btn-primary')}
    </div>
    <div class="card">
      <h3>Traer una copia de vuelta</h3>
      <p class="muted small">Reemplaza todo lo que hay ahora por lo que traiga el archivo. Te preguntamos antes.</p>
      ${button('Traer una copia', 'open-import', 'btn-secondary')}
    </div>
    <div class="card">
      <h3>Empezar de cero</h3>
      <p class="muted small">Borra todo lo de esta app en este teléfono. No se puede deshacer sin una copia guardada.</p>
      ${button('Borrar todos mis datos', 'clear-demo', 'btn-danger')}
    </div>`;
}

// Cuánto hace de la última copia, y si eso ya es preocupante.
//
// El umbral es de treinta días, que es más o menos un ciclo de la app: si pasó
// un mes entero de compras y revisiones sin copia, lo que se perdería ya duele.
// Y no se avisa cuando no hay nada que perder: una casa recién instalada no
// necesita que le riñan por no haber respaldado una lista vacía.
export function estadoDeLaCopia(state) {
  const hayDatos = state.products.length > 0 || state.purchases.length > 0 || habitualLines(state).length > 0;
  if (!hayDatos) return { hayDatos: false };
  const ultima = state.settings?.lastBackupAt || null;
  if (!ultima) return { hayDatos: true, ultima: null, dias: null, urgente: true };
  const dias = Math.round((new Date(`${hoy}T12:00:00`) - new Date(`${ultima}T12:00:00`)) / 86400000);
  return { hayDatos: true, ultima, dias, urgente: dias >= 30 };
}

function avisoDeCopia(state) {
  const copia = estadoDeLaCopia(state);
  if (!copia.hayDatos) return '';
  if (!copia.ultima) {
    return `<div class="notice warn"><span>!</span><div><strong>Todavía no has guardado ninguna copia.</strong>Ahora mismo, todo lo que has escrito existe en un solo sitio: este teléfono.</div></div>`;
  }
  if (copia.urgente) {
    return `<div class="notice warn"><span>!</span><div><strong>La última copia es de hace ${copia.dias} días.</strong>Desde entonces has anotado compras y revisiones que no están en ningún otro lado.</div></div>`;
  }
  return `<div class="notice"><span>✓</span><div><strong>Última copia: ${esc(niceDate(copia.ultima, { day: 'numeric', month: 'long', year: 'numeric' }))}.</strong>${copia.dias === 0 ? 'Hoy mismo.' : `Hace ${copia.dias} ${copia.dias === 1 ? 'día' : 'días'}.`}</div></div>`;
}

/* ── Ajustes ───────────────────────────────────────────────────────────── */

function renderAjustes(ctx) {
  const { state } = ctx;
  const dictado = capacidad('dictar');
  const diaRevision = state.settings?.reviewWeekday ?? 5;
  return `${volver('Ajustes')}
    <div class="card">
      <h3>¿Qué día revisas lo que queda?</h3>
      <p class="muted small">Ese día la app te lo recuerda en la pantalla de la compra. Nada más: no manda notificaciones.</p>
      <form data-form="ajuste-revision" class="inline">
        <label class="field" style="max-width:220px"><span class="sr-only">Día de revisión</span>
          <select name="dia">${options(WEEKDAYS.map((dia, indice) => [dia, WEEKDAY_LABELS[indice]]), diaRevision)}</select>
        </label>
        <button type="submit" class="btn btn-secondary">Guardar</button>
      </form>
    </div>
    <div class="card">
      <h3>Dictar en vez de escribir</h3>
      <p class="muted small">Lo hace el propio teléfono. No hay que configurar nada, no hay cuentas ni claves.</p>
      ${avisoDeVoz() ? `<p class="small revision-aviso">${esc(avisoDeVoz())}</p>` : '<p class="small muted">✓ En este teléfono la voz no sale del aparato.</p>'}
      <p class="small ${dictado.ok ? '' : 'muted'}">${dictado.ok ? '✓ Disponible en este aparato.' : '· No disponible en este aparato. Puedes escribir a mano en cualquier campo, o usar el micrófono del teclado de Android.'}</p>
      <p class="small muted">${esc(dictado.detalle)}</p>
      ${button('Detalle técnico de este aparato', 'open-diagnostico', 'btn-quiet btn-small')}
    </div>
    <div class="card">
      <h3>Organización de compra</h3>
      <p class="muted small">Cada cuánto se hace la compra principal, y cómo se reparte el mes cuando se compra dos veces.</p>
      <p class="small">Ahora mismo: <strong>${esc(frecuenciaDe(state, hoy.slice(0, 7)) === 'quincenal' ? 'quincenal — dos compras al mes' : 'mensual — una compra al mes')}</strong>.</p>
      <div class="inline">${button('Frecuencia de compra', 'navigate', 'btn-secondary btn-small', 'data-page="organizacion"')}</div>
    </div>
    <div class="card">
      <h3>Las personas de tu hogar</h3>
      <p class="muted small">Quién vive aquí, qué es de la casa cada quien y qué alimentos debe evitar. Desde aquí se añade gente, se corrige y se da de baja a quien ya no vive contigo.</p>
      <p class="small">${personasActivas(state).length
        ? `${personasActivas(state).length} persona(s) en casa${state.people.length - personasActivas(state).length ? ` · ${state.people.length - personasActivas(state).length} dada(s) de baja` : ''}.`
        : 'Todavía no hay nadie registrado.'}</p>
      <div class="inline">${button('Editar mi familia', 'navigate', 'btn-secondary btn-small', 'data-page="familia"')}${button('Configuración guiada', 'hogar-open', 'btn-quiet btn-small')}</div>
    </div>
    <div class="card">
      <h3>Cómo funciona la app</h3>
      <p class="muted small">Un recorrido corto por las cuatro pantallas y por la idea de fondo: escribir una vez lo habitual y revisar solo lo diferente.</p>
      <div class="inline">${button('Ver el recorrido', 'open-tour', 'btn-secondary btn-small')}${button('Organizar mi casa otra vez', 'setup-open', 'btn-quiet btn-small')}</div>
    </div>
    <div class="card">
      <h3>Privacidad y condiciones</h3>
      <p class="muted small">Qué se guarda, dónde, y qué no sale de aquí. Está dentro de la app a propósito: se puede leer sin conexión y sin abrir el navegador.</p>
      ${button('Leerlo', 'navigate', 'btn-secondary btn-small', 'data-page="legal"')}
    </div>`;
}

/* ── Organización de compra ────────────────────────────────────────────────

   La frecuencia no es un interruptor: es una lista de tramos con fecha de
   vigencia. Cambiarla hoy no puede reescribir lo que pasó en marzo —si en marzo
   se compró una vez al mes, marzo se compró una vez al mes— así que lo único
   que se puede elegir es desde qué mes de aquí en adelante entra en vigencia, y
   lo que se recomienda es el mes siguiente: cambiarla a mitad de mes deja el
   mes en curso partido por la mitad. */

function renderOrganizacion(ctx) {
  const { state, ui } = ctx;
  const mesActual = hoy.slice(0, 7);
  const actual = frecuenciaDe(state, mesActual);
  const historial = historialDeFrecuencia(state);
  const periodos = periodosDelMes(state, mesActual);
  const quincenal = actual === 'quincenal';

  return `${volver('Organización de compra')}
    <p class="pantalla-intro">Cada cuánto se hace la compra principal de la casa. De esto salen los períodos que ves en la pantalla de la compra.</p>

    <div class="card">
      <h3>Frecuencia de compra</h3>
      <p class="small"><strong>${quincenal ? 'Quincenal' : 'Mensual'}</strong> — ${quincenal ? 'dos compras al mes' : 'una compra al mes'} en ${esc(monthName(mesActual))}.</p>
      <p class="small muted">Este mes se parte así: ${periodos.map(periodo => `${esc(periodo.etiqueta)} (${periodo.dias} días)`).join(' · ')}.</p>

      ${historial.length ? `<div class="section-head"><h3 class="plan-sub">Desde cuándo</h3></div>
        <div class="organizacion-historial">${historial.map((fila, indice) => {
          const siguiente = historial[indice + 1];
          const hasta = siguiente ? ` hasta ${esc(monthName(shiftMonth(siguiente.desde, -1)))}` : '';
          return `<div class="list-row"><div class="list-row-main">
            <div class="list-row-title">${fila.tipo === 'quincenal' ? 'Quincenal' : 'Mensual'}</div>
            <div class="list-row-sub">Desde ${esc(monthName(fila.desde))}${hasta}</div>
          </div>${fila.desde > mesActual ? '<span class="pill warm">Aún no empieza</span>' : ''}</div>`;
        }).join('')}</div>` : '<p class="small muted">Nunca se ha cambiado: la app viene con la compra mensual.</p>'}

      ${ui.mas.cambiandoFrecuencia ? formularioDeFrecuencia(ctx, actual, mesActual) : `<div class="inline" style="margin-top:14px">${button('Cambiar la frecuencia', 'frecuencia-abrir', 'btn-secondary')}</div>`}
      <p class="tiny muted">Cambiarla no toca ninguna compra, revisión ni resultado de los meses anteriores: cada mes se queda con la frecuencia que tenía cuando se compró.</p>
    </div>

    ${quincenal ? bloqueDeReparto(ctx) : ''}`;
}

function formularioDeFrecuencia(ctx, actual, mesActual) {
  const { ui } = ctx;
  const recomendado = shiftMonth(mesActual, 1);
  const elegida = ui.mas.frecuenciaNueva || (actual === 'quincenal' ? 'mensual' : 'quincenal');
  const desde = ui.mas.frecuenciaDesde || recomendado;
  // Solo de aquí en adelante. Hacia atrás no se ofrece porque cambiaría meses
  // que ya se compraron, y eso es justamente lo que no puede pasar.
  const meses = [mesActual, ...Array.from({ length: 5 }, (unused, i) => shiftMonth(mesActual, i + 1))];
  const opcion = (id, titulo, detalle) => `<button type="button" class="setup-opcion ${elegida === id ? 'activa' : ''}"
      data-action="frecuencia-tipo" data-frecuencia="${id}" aria-pressed="${elegida === id}">
      <strong>${esc(titulo)}</strong><small>${esc(detalle)}</small></button>`;

  return `<form data-form="frecuencia" class="stack organizacion-form">
    <div class="field"><span>¿Cada cuánto hacen la compra principal en tu hogar?</span>
      <div class="setup-opciones">
        ${opcion('quincenal', 'Quincenal', 'Del 1 al 15 y del 16 al último día del mes.')}
        ${opcion('mensual', 'Mensual', 'Una sola compra para el mes completo.')}
      </div>
      <input type="hidden" name="tipo" value="${esc(elegida)}">
    </div>
    <label class="field"><span>¿Desde qué mes entra en vigencia?</span>
      <select name="desde">${options(meses.map(mes => [mes, `${monthName(mes)}${mes === recomendado ? ' (recomendado)' : ''}${mes === mesActual ? ' — este mes, ya empezado' : ''}`]), desde)}</select>
      <small>Lo anterior a ese mes se queda como está. No se puede cambiar hacia atrás.</small>
    </label>
    <div class="inline">
      <button type="submit" class="btn btn-primary">Guardar el cambio</button>
      ${button('Cancelar', 'frecuencia-cerrar', 'btn-quiet')}
    </div>
  </form>`;
}

// El reparto entre las dos quincenas, el mismo que enseña el asistente. Aquí
// vive el resto del año, que es cuando de verdad se corrige.
function bloqueDeReparto(ctx) {
  const { state } = ctx;
  const filas = habitualLines(state)
    .map(linea => ({ linea, item: product(state, linea.productId) }))
    .filter(fila => fila.item && fila.linea.quantity !== null)
    .sort((a, b) => a.item.name.localeCompare(b.item.name));
  if (!filas.length) {
    return `<div class="card"><h3>Cómo se reparte el mes</h3>
      <p class="muted small">Cuando escribas cuánto se compra al mes de cada alimento, aquí podrás decir cuánto de eso entra en la primera quincena.</p></div>`;
  }
  return `<div class="card">
    <h3>Cómo se reparte el mes</h3>
    <p class="muted small">La cantidad del mes no cambia: esto solo dice cuánto de ella entra en la primera compra. Lo que no toques se reparte a la mitad.</p>
    <div class="setup-reparto">${filas.map(({ linea, item }) => filaDeReparto(ctx, linea, item)).join('')}</div>
  </div>`;
}

/* ── Privacidad y condiciones ──────────────────────────────────────────── */

// El mismo texto que se publica en la web, viajando dentro de la app.
//
// Google Play exige una dirección pública con el aviso de privacidad, y eso ya
// está en `legal/`. Pero una política que solo se lee con conexión no la lee
// nadie en el momento en que importa, que es cuando alguien se pregunta si esto
// manda sus cosas a algún sitio. Por eso está también aquí.
//
// `src/legal.js` guarda texto plano, sin etiquetas: se pinta con `esc()` y una
// etiqueta que se colara saldría escrita en pantalla en vez de ejecutarse.
const DOCUMENTOS = [['privacidad', 'Privacidad'], ['terminos', 'Condiciones'], ['eliminar', 'Borrar mis datos']];

function renderLegal(ctx) {
  const { ui } = ctx;
  const cual = DOCUMENTOS.some(([id]) => id === ui.mas.documento) ? ui.mas.documento : 'privacidad';
  const doc = LEGAL[cual];
  return `${volver('Privacidad y condiciones')}
    <div class="segmented segmented-ancho">${DOCUMENTOS.map(([id, etiqueta]) =>
      `<button type="button" data-action="legal-ver" data-doc="${id}" class="${cual === id ? 'active' : ''}">${esc(etiqueta)}</button>`).join('')}</div>
    <article class="card documento">
      <h2>${esc(doc.titulo)}</h2>
      <p class="small muted">Última actualización: ${esc(niceDate(LEGAL.actualizado, { day: 'numeric', month: 'long', year: 'numeric' }))}</p>
      ${doc.secciones.map(seccion => `<h3>${esc(seccion.titulo)}</h3>${seccion.parrafos.map(parrafo => `<p>${esc(parrafo)}</p>`).join('')}`).join('')}
    </article>`;
}

/* ── Funciones avanzadas ───────────────────────────────────────────────── */

// Estas cuatro cosas existían ya, repartidas por donde se usan: la medida se
// pide cuando hace falta calcular una compra, la unión cuando se ve el alimento
// duplicado. Eso sigue igual y es lo correcto —se pregunta en el momento, no el
// primer día—. Lo que faltaba era una puerta para quien sabe lo que busca y no
// quiere ir a encontrárselo por casualidad.
function renderAvanzado(ctx) {
  const { state } = ctx;
  const sinMedida = state.products.filter(item => !item.archived && item.purchaseUnit !== item.controlUnit && !Number.isFinite(item.equivalences?.[item.purchaseUnit]));
  const parecidos = paresParecidos(state);
  return `${volver('Funciones avanzadas')}
    <p class="pantalla-intro">Nada de esto hace falta para usar la app. Está aquí por si algo no cuadra y quieres arreglarlo a mano.</p>

    <div class="card">
      <h3>Medidas de compra</h3>
      <p class="muted small">Cuando un alimento se cuenta de una forma y se compra de otra —ruedas y paquetes—, hace falta decir cuántas trae cada uno. Sin eso la compra avisa en vez de dar un número inventado.</p>
      ${sinMedida.length
        ? `<div class="card soft">${sinMedida.slice(0, 8).map(item => `<div class="list-row"><div class="list-row-main"><div class="list-row-title">${esc(item.name)}</div><div class="list-row-sub">Se cuenta en ${esc(unitText(item.controlUnit, 2))} y se compra en ${esc(unitText(item.purchaseUnit, 2))}</div></div>${button('Decirlo', 'open-equivalence', 'btn-secondary btn-small', `data-id="${item.id}"`)}</div>`).join('')}</div>
           ${sinMedida.length > 8 ? `<p class="small muted">Y ${sinMedida.length - 8} más.</p>` : ''}`
        : '<p class="small muted">✓ No falta ninguna medida.</p>'}
    </div>

    <div class="card">
      <h3>Alimentos que podrían ser el mismo</h3>
      <p class="muted small">Un alimento anotado dos veces parte su inventario en dos, y eso se descubre semanas después, cuando las cuentas no cuadran. Unirlos suma sus existencias y junta su historial. <strong>No se puede deshacer.</strong></p>
      ${parecidos.length
        ? `<div class="card soft">${parecidos.slice(0, 6).map(([uno, otro]) => `<div class="list-row"><div class="list-row-main"><div class="list-row-title">${esc(uno.name)} · ${esc(otro.name)}</div><div class="list-row-sub">Los dos se cuentan en ${esc(unitText(uno.controlUnit, 2))}</div></div>${button('Revisar', 'open-merge', 'btn-quiet btn-small', `data-id="${uno.id}"`)}</div>`).join('')}</div>`
        : '<p class="small muted">✓ No encontré parecidos sospechosos.</p>'}
    </div>

    <div class="card">
      <h3>Corregir existencias a mano</h3>
      <p class="muted small">Para cuando algo se dañó, se perdió, o el conteo no cuadra y no quieres esperar a la próxima revisión. Queda anotado en el historial con su motivo.</p>
      ${button('Corregir un alimento', 'open-correction', 'btn-secondary')}
    </div>

    <div class="card">
      <h3>Servicios externos</h3>
      <p class="muted small">No hay ninguno, y no es un descuido: <strong>esta app no habla con ningún servidor</strong>. No hay dirección que configurar, ni clave que guardar, ni nada que pueda salir de aquí. Lo que la asistente entiende, lo entiende dentro del teléfono; lo que no, lo dice.</p>
      ${button('Ver el detalle de este aparato', 'open-diagnostico', 'btn-quiet')}
    </div>`;
}

// Dos alimentos que se cuentan igual y cuyos nombres se parecen mucho. Solo se
// proponen; unirlos siempre lo decide una persona.
function paresParecidos(state) {
  const vivos = state.products.filter(item => !item.archived);
  const pares = [], vistos = new Set();
  for (const item of vivos) {
    if (vistos.has(item.id)) continue;
    const parecido = findSimilarProducts(state, item.name, { limit: 1, threshold: 0.78, exclude: item.id })[0];
    if (!parecido || parecido.product.controlUnit !== item.controlUnit || vistos.has(parecido.product.id)) continue;
    vistos.add(item.id); vistos.add(parecido.product.id);
    pares.push([item, parecido.product]);
  }
  return pares;
}

/* ── Acciones ──────────────────────────────────────────────────────────── */

// Dictar «quedan dos plátanos, diez huevos y media libra de queso» y que aparezca
// en tres casillas.
//
// Lo dictado se escribe en el formulario y se guarda **a través del formulario**,
// no directamente en el estado. Parece un rodeo y no lo es: así lo que la persona
// ya había tecleado a mano viaja en el mismo envío y no se pierde al repintar.
// Guardar por un lado y repintar por otro habría borrado media revisión.
export function aplicarDictado(ctx, texto) {
  const { state, ui } = ctx;
  const revision = state.reviews.find(item => item.id === ui.reviewId) || [...state.reviews].reverse().find(item => item.status === 'draft');
  const form = document.querySelector('[data-form="review"]');
  if (!revision || !form) return;
  const enLaRevision = new Set(revision.productIds);
  const disponible = reviewAvailability(state, revision);
  const queda = (revision.mode || 'restante') === 'restante';

  const puestos = [], fuera = [];
  for (const { action, arguments: args } of interpretar(texto).acciones || []) {
    if (action !== 'registrar_restante') continue;
    const item = productByName(state, args.producto) || findSimilarProducts(state, args.producto, { limit: 1 })[0]?.product;
    if (!item || !enLaRevision.has(item.id)) { fuera.push(args.producto); continue; }
    const campo = form.querySelector(`[name="consume-${item.id}"]`);
    if (!campo) continue;
    // El intérprete siempre dice cuánto QUEDA. Si la revisión está puesta en
    // «lo consumido», lo que hay que escribir es la resta, no el mismo número.
    const valor = queda ? args.queda : Math.max(0, (disponible[item.id] || 0) - Number(args.queda));
    campo.value = valor;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    puestos.push(item.name);
  }

  ui.mas.revisionAviso = puestos.length
    ? `Anotado: ${puestos.join(', ')}.${fuera.length ? ` No encontré en esta revisión: ${fuera.join(', ')}.` : ''}`
    : `No reconocí ningún alimento de esta revisión en «${texto}». Puedes escribirlo a mano.`;

  if (!puestos.length) { ctx.render(); return; }
  // Guardar sin confirmar: la revisión sigue abierta y lo dictado queda a salvo.
  const guardar = form.querySelector('[name="intent"][value="save"]');
  if (guardar) form.requestSubmit(guardar); else ctx.render();
}

export const MAS_ACTIONS = {
  'revision-solo-faltan': (el, ctx) => { ctx.ui.mas.revisionSoloFaltan = !ctx.ui.mas.revisionSoloFaltan; ctx.render(); },
  // Dictar ya no vive aquí: lo lleva `voz.js`, el mismo panel que usan el
  // asistente, la configuración inicial y la entrada rápida. Cuando la persona
  // toca «Usar este texto», app.js llama a `aplicarDictado` con lo dictado.
  'legal-ver': (el, ctx) => { ctx.ui.mas.documento = el.dataset.doc; ctx.render(); },
  'canasta-vista': (el, ctx) => { ctx.ui.mas.canastaVista = el.dataset.vista; ctx.render(); },
  'canasta-mes': (el, ctx) => { ctx.ui.mas.canastaMes = shiftMonth(ctx.ui.mas.canastaMes, Number(el.dataset.delta)); ctx.render(); },
  'alimentos-archivados': (el, ctx) => { ctx.ui.mas.verArchivados = !ctx.ui.mas.verArchivados; ctx.render(); },
  'canasta-nuevo-cambio': (el, ctx) => ctx.openModal('cambio-mes', { month: el.dataset.month || ctx.ui.mas.canastaMes }),
  'open-avanzado-producto': (el, ctx) => ctx.openModal('avanzado-producto', { id: el.dataset.id }),
  'open-diagnostico': (el, ctx) => {
    ctx.openModal('diagnostico');
    // Preguntarle al teléfono si entiende la voz por sí solo. Es asíncrono y no
    // pide permisos, así que se lanza y se vuelve a pintar cuando conteste: es
    // la diferencia entre decir «no se sabe» y decir la verdad.
    comprobarDictado().then(() => { if (ctx.ui.modal?.type === 'diagnostico') ctx.render(); }).catch(() => {});
  },
  'frecuencia-abrir': (el, ctx) => {
    Object.assign(ctx.ui.mas, { cambiandoFrecuencia: true, frecuenciaNueva: '', frecuenciaDesde: '' });
    ctx.render();
  },
  'frecuencia-cerrar': (el, ctx) => {
    Object.assign(ctx.ui.mas, { cambiandoFrecuencia: false, frecuenciaNueva: '', frecuenciaDesde: '' });
    ctx.render();
  },
  'frecuencia-tipo': (el, ctx) => {
    if (!FRECUENCIAS.includes(el.dataset.frecuencia)) return;
    // Lo que ya estuviera elegido en el desplegable no se pierde al cambiar de
    // botón: se lee de la pantalla antes de redibujar.
    ctx.ui.mas.frecuenciaDesde = document.querySelector('[data-form="frecuencia"] [name="desde"]')?.value || ctx.ui.mas.frecuenciaDesde;
    ctx.ui.mas.frecuenciaNueva = el.dataset.frecuencia;
    ctx.render();
  },
  'archive-product': (el, ctx) => { archiveProduct(ctx.state, el.dataset.id); ctx.closeModal(); ctx.commit('Alimento archivado. Su historial se conserva.'); },
  'restore-product': (el, ctx) => { restoreProduct(ctx.state, el.dataset.id); ctx.commit('Alimento disponible otra vez.'); }
};
