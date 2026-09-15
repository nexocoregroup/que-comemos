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
  UNITS, archiveProduct, effectiveBasket, findSimilarProducts, habitualLines, inventoryNow,
  lastStockReview, monthBasketSummary, monthChanges, product, productByName, restoreProduct,
  reviewAvailability, sliceStyle, syncReviewProducts, todayISO
} from './model.js';
import { WEEKDAY_LABELS, WEEKDAYS } from './routines.js';
import { button, cap, empty, esc, fmt, measure, monthName, niceDate, options, shiftMonth, unitText } from './ui-kit.js';
import { cancelarDictado, capacidad, dictar, pararDictado } from './device.js';
// El intérprete de frases vive en el asistente, y entiende «quedan dos plátanos,
// diez huevos y media libra de queso» desde hace tiempo. Escribir aquí un
// segundo intérprete sería tener dos gramáticas que se van separando con los
// meses; se reutiliza esa, que además ya está probada.
import { interpretar } from './chat-ui.js';

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
  ['ajustes', '⚙️', 'Ajustes', 'Día de revisión, micrófono y ayuda'],
  ['avanzado', '🔧', 'Funciones avanzadas', 'Medidas, correcciones y uniones']
];

export const PAGINAS_MAS = ENTRADAS_MAS.map(([id]) => id);

export const TITULOS_MAS = Object.fromEntries(ENTRADAS_MAS.map(([id, , titulo]) => [id, titulo]));

export function emptyMas() {
  return {
    canastaVista: 'habitual', canastaMes: hoy.slice(0, 7), filtroAlimento: '', verArchivados: false,
    revisionFiltro: '', revisionSoloFaltan: false, revisionEscuchando: false, revisionAviso: ''
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
    avanzado: renderAvanzado
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
    familia: `${state.people.length} persona(s)`,
    alimentos: `${state.products.filter(item => !item.archived).length}`,
    revision: lastStockReview(state) ? `última: ${niceDate(lastStockReview(state), { day: 'numeric', month: 'short' })}` : 'nunca',
    historial: `${state.purchases.length} compra(s)`,
    respaldo: '',
    ajustes: ''
  };
  return `<div class="card mas-lista">${ENTRADAS_MAS.map(([id, icono, titulo, detalle]) => `
    <button type="button" class="mas-item" data-action="navigate" data-page="${id}">
      <span class="mas-icono" aria-hidden="true">${icono}</span>
      <span class="mas-texto"><strong>${esc(titulo)}</strong><span>${esc(detalle)}</span></span>
      ${pistas[id] ? `<span class="mas-pista">${esc(pistas[id])}</span>` : ''}
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

function renderFamilia(ctx) {
  const { state } = ctx;
  const nombreProducto = id => product(state, id)?.name || 'Alimento eliminado';
  return `${volver('Familia y restricciones')}
    <p class="pantalla-intro">Quién come en casa y qué evita cada quien. La app avisa si una comida lleva algo que alguien no puede comer.</p>
    <div class="pantalla-acciones">${button('+ Añadir persona', 'open-person', 'btn-primary')}${button('Marcar una ausencia', 'open-absence', 'btn-secondary')}</div>
    ${state.people.length
      ? `<div class="grid grid-2">${state.people.map(persona => `<article class="card">
          <div class="between"><h3>${esc(persona.name)}</h3>${button('Editar', 'open-person', 'btn-quiet btn-small', `data-id="${persona.id}"`)}</div>
          <p class="small"><strong>Evita:</strong> ${persona.restrictions.length || persona.pendingRestrictions?.length
            ? [...persona.restrictions.map(id => esc(nombreProducto(id))), ...(persona.pendingRestrictions || []).map(texto => `${esc(texto)} <span class="muted">(por enlazar)</span>`)].join(', ')
            : 'nada anotado'}</p>
          ${persona.habitual.length ? `<p class="small"><strong>Come normalmente:</strong> ${persona.habitual.map(item => `${esc(measure(item.quantity, item.unit))} de ${esc(nombreProducto(item.productId))}`).join(' · ')}</p>` : ''}
        </article>`).join('')}</div>`
      : empty('👨‍👩‍👧‍👦', 'Todavía no hay nadie', 'Anotar quién come en casa sirve para dos cosas: avisar de restricciones y calcular cuánto preparar. No es obligatorio para nada más.', button('Añadir la primera persona', 'open-person', 'btn-primary'))}
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
      <input type="search" id="revision-filtro" value="${esc(ui.mas.revisionFiltro)}" placeholder="Buscar un alimento…" aria-label="Buscar un alimento de esta revisión">
    </label>
    <div class="inline">
      <button type="button" class="chip ${ui.mas.revisionSoloFaltan ? 'activa' : ''}" data-action="revision-solo-faltan" aria-pressed="${ui.mas.revisionSoloFaltan}">Solo lo que falta · ${faltan}</button>
      ${motor.ok
        ? (ui.mas.revisionEscuchando
            ? button('■ Parar', 'revision-parar', 'btn-primary btn-small')
            : button('🎤 Dictar', 'revision-dictar', 'btn-secondary btn-small'))
        : ''}
    </div>
    ${ui.mas.revisionEscuchando ? `<p class="small muted">Escuchando… Di por ejemplo: «${queda ? 'quedan dos plátanos, diez huevos y media libra de queso' : 'se consumieron seis plátanos y cuatro huevos'}».</p>` : ''}
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
  return `${volver('Respaldo')}
    <p class="pantalla-intro">Tus datos viven solo en este teléfono. No hay cuenta, no hay servidor y nadie más los ve. Eso también significa que si pierdes el teléfono, se pierden: guarda una copia de vez en cuando.</p>
    <div class="card">
      <h3>Guardar una copia</h3>
      <p class="muted small">Descarga un archivo con todo: alimentos, canasta, preparaciones, compras y revisiones. Guárdalo donde guardes tus cosas importantes.</p>
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
      <p class="muted small">Lo hace el propio teléfono. No hay que configurar nada, no hay cuentas ni claves, y tu voz no sale del aparato.</p>
      <p class="small ${dictado.ok ? '' : 'muted'}">${dictado.ok ? '✓ Disponible en este aparato.' : '· No disponible en este aparato. Puedes escribir a mano en cualquier campo, o usar el micrófono del teclado de Android.'}</p>
      <p class="small muted">${esc(dictado.detalle)}</p>
      ${button('Detalle técnico de este aparato', 'open-diagnostico', 'btn-quiet btn-small')}
    </div>
    <div class="card">
      <h3>Cómo funciona la app</h3>
      <p class="muted small">Un recorrido corto por las cuatro pantallas y por la idea de fondo: escribir una vez lo habitual y revisar solo lo diferente.</p>
      <div class="inline">${button('Ver el recorrido', 'open-tour', 'btn-secondary btn-small')}${button('Organizar mi casa otra vez', 'setup-open', 'btn-quiet btn-small')}</div>
    </div>`;
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
      <p class="muted small">La app funciona entera sin conexión y sin cuentas. Lo único que un servidor propio añadiría es entender frases totalmente libres en la asistente. <strong>Nadie lo necesita.</strong></p>
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
function aplicarDictado(ctx, texto) {
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
  'revision-parar': (el, ctx) => { pararDictado(); },
  'revision-dictar': async (el, ctx) => {
    const { ui } = ctx;
    const motor = capacidad('dictar');
    if (!motor.ok) { ui.mas.revisionAviso = motor.detalle; ctx.render(); return; }
    ui.mas.revisionEscuchando = true;
    ui.mas.revisionAviso = '';
    ctx.render();
    let oido;
    try { oido = await dictar({ idioma: 'es-DO' }); }
    catch { oido = { ok: false, error: 'No se pudo escuchar. Escríbelo a mano.' }; }
    ui.mas.revisionEscuchando = false;
    if (!oido.ok) {
      // Cancelar no es un fallo: es una decisión, y no merece un aviso rojo.
      ui.mas.revisionAviso = oido.cancelado ? '' : oido.error;
      ctx.render();
      return;
    }
    aplicarDictado(ctx, oido.texto);
  },
  'canasta-vista': (el, ctx) => { ctx.ui.mas.canastaVista = el.dataset.vista; ctx.render(); },
  'canasta-mes': (el, ctx) => { ctx.ui.mas.canastaMes = shiftMonth(ctx.ui.mas.canastaMes, Number(el.dataset.delta)); ctx.render(); },
  'alimentos-archivados': (el, ctx) => { ctx.ui.mas.verArchivados = !ctx.ui.mas.verArchivados; ctx.render(); },
  'canasta-nuevo-cambio': (el, ctx) => ctx.openModal('cambio-mes', { month: el.dataset.month || ctx.ui.mas.canastaMes }),
  'open-avanzado-producto': (el, ctx) => ctx.openModal('avanzado-producto', { id: el.dataset.id }),
  'open-diagnostico': (el, ctx) => ctx.openModal('diagnostico'),
  'archive-product': (el, ctx) => { archiveProduct(ctx.state, el.dataset.id); ctx.closeModal(); ctx.commit('Alimento archivado. Su historial se conserva.'); },
  'restore-product': (el, ctx) => { restoreProduct(ctx.state, el.dataset.id); ctx.commit('Alimento disponible otra vez.'); }
};
