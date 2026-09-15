// El armazón de la aplicación: estado, navegación, ventanas y el reparto de
// eventos. Las pantallas viven cada una en su archivo.
//
// La navegación tenía siete destinos. Ahora tiene cuatro —Hoy, Plan mensual,
// Compra y Más— porque esos son los cuatro momentos reales de una casa: qué se
// cocina hoy, cómo queda el mes, qué falta comprar, y todo lo demás. Lo que
// desapareció de la barra no desapareció de la app: está en Más, ordenado por
// la frecuencia con que hace falta de verdad.

import {
  SLICEABLE, SLICE_STYLES, SLOTS, UNITS, addDays, addProduct, addPurchase, archiveProduct,
  copyPlan, correctReview, correctStock, createEmptyState, createReview, dependents, effectiveBasket,
  exportState, findSimilarProducts, habitualLines, importState, incompatibleItems, inventoryNow,
  isAbsent, linkPlan, makeRecipePlan, mergeProducts, monthBounds, movePlan, nextId, planFor, product,
  promoteToHabitual, quantity, removeMonthChange, restoreProduct, reservedQuantity, reviewAvailability,
  saveReview, setAbsence, setEquivalence, setHabitualBasket, setHabitualLine, setMonthChange,
  setSlice, setStatusPlan, shoppingList, sliceStyle, todayISO, updatePlan, updateProduct,
  upsertPerson, upsertRecipe
} from './model.js';
import { hasSavedState, loadStateDetailed, saveState } from './storage.js';
import { BRAND_MARK } from './brand.js';
import { TOUR_STEPS, WELCOME } from './onboarding.js';
import { CATEGORIES } from './catalog-seed.js';
import { SETUP_ACTIONS, SETUP_FORMS, emptySetup, renderSetup } from './setup.js';
import { CHAT_ACTIONS, CHAT_FORMS, emptyChat, renderChat } from './chat-ui.js';
import { BULK_ACTIONS, BULK_FORMS, emptyBulk, renderBulk } from './bulk-entry.js';
import { MES_ACTIONS, MES_FORMS, abrirMesSiHaceFalta, emptyMes, modalRutina, renderMes } from './page-mes.js';
import { COMPRA_ACTIONS, COMPRA_FORMS, emptyCompra, periodoDeCompra, renderCompra } from './page-compra.js';
import { MAS_ACTIONS, PAGINAS_MAS, TITULOS_MAS, emptyMas, renderMas } from './page-mas.js';
import { cancelarDictado, capacidad, diagnostico } from './device.js';
import { describeConfig, readConfig, writeConfig } from './providers.js';
import { button, cap, empty, esc, fmt, measure, modal, monthName, niceDate, notice, options, productDatalist, unitText } from './ui-kit.js';

const firstRun = !hasSavedState();
let state, loadError = '', migratedFrom = 0;
try { const cargado = loadStateDetailed(); state = cargado.state; if (cargado.migrated) migratedFrom = cargado.from; }
catch (error) { state = createEmptyState(); loadError = error.message; }
const today = todayISO();
const mesActual = today.slice(0, 7);
const SIDEBAR_KEY = 'que-comemos-sidebar-collapsed';
const sidebarInitiallyCollapsed = (() => { try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; } })();

const ui = {
  page: 'hoy',
  modal: null,
  setup: null, chat: null, bulk: null,
  mes: emptyMes(mesActual),
  compra: emptyCompra(mesActual),
  mas: emptyMas(),
  reviewId: null, correctingReview: false,
  sidebarCollapsed: sidebarInitiallyCollapsed, drawerOpen: false,
  welcome: firstRun, tour: null, justStarted: false
};

/* ── Atajos de lectura ─────────────────────────────────────────────────── */

const personName = id => state.people.find(person => person.id === id)?.name || 'Persona eliminada';
const productName = id => product(state, id)?.name || 'Alimento eliminado';
// «14 ruedas» no dice nada si no se sabe cómo las cortan en esta casa.
const cutText = (item, amount) => {
  const style = sliceStyle(item?.slice);
  if (!style) return '';
  const word = style.label.toLowerCase();
  return ` ${amount > 0 && amount <= 1 ? word : `${word}s`}`;
};
const stockText = (amount, item) => `${measure(amount, item?.controlUnit || '')}${esc(cutText(item, amount))}`;
const itemText = item => `${measure(item.quantity, item.unit)} · ${esc(productName(item.productId))}`;
const planTitle = plan => plan.kind === 'recipe' || plan.kind === 'linked'
  ? plan.title
  : ({ outside: 'Fuera de casa', order: 'Pedimos comida', unplanned: 'Sin decidir' }[plan.kind] || 'Sin decidir');

const NAV = [
  ['hoy', '☀️', 'Hoy'],
  ['mes', '▦', 'Plan mensual'],
  ['compra', '🧺', 'Compra'],
  ['mas', '⋯', 'Más']
];

// Cuatro acciones, no once. Las once seguían existiendo en un menú que nadie
// leía entero: quien abre el «+» quiere anotar una cosa concreta, y tener que
// escoger entre once formularios es peor que no tener el botón.
const RAPIDAS = [
  ['rapida-comida', '🍽️', 'Poner una comida', 'En un día, o en todos los lunes'],
  ['open-chat', '💬', 'Hablar o dictar', 'Dile lo que pasó y ella lo anota'],
  ['open-purchase', '🧺', 'Anotar una compra', 'Lo que trajiste del colmado'],
  ['open-product', '🥬', 'Añadir un alimento', 'Uno nuevo, con su medida']
];

let toastTimer;
function toast(message, error = false) {
  const el = document.querySelector('#toast');
  el.textContent = message; el.className = `show${error ? ' error' : ''}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = '', 4200);
}
function commit(message) { saveState(state); render(); if (message) toast(message); }

// Lo que un módulo de pantalla necesita para trabajar sin conocer app.js por
// dentro. Se construye en cada llamada porque `state` se reasigna al importar un
// respaldo o al borrar los datos, y una referencia guardada apuntaría al viejo.
function ctx() {
  return {
    state, ui, commit, toast, render, closeModal, openModal,
    startTour: () => goTour(0),
    servicios: {
      transcribe: capacidad('dictar').ok,
      chat: false,
      enElAparato: { voz: capacidad('dictar').ok }
    }
  };
}

const TITULOS = { hoy: 'Hoy en casa', mes: 'Plan mensual', compra: 'La compra', mas: 'Más', setup: 'Organizar mi casa', ...TITULOS_MAS };
function pageTitle() { return TITULOS[ui.page] || '¿Qué comemos?'; }

/* ── Bienvenida y recorrido ────────────────────────────────────────────── */

function renderWelcome() {
  return `<div class="welcome-screen"><div class="welcome-card">
    <span class="welcome-mark">${BRAND_MARK}</span>
    <h1>¿Qué comemos?</h1>
    <p class="welcome-promise">${esc(WELCOME.promise)}</p>
    <div class="welcome-actions">${button('Organizar mi casa', 'welcome-empty', 'btn-primary')}</div>
    <p class="welcome-note"><button type="button" class="enlace" data-action="welcome-demo">Ver un ejemplo primero</button></p>
    <p class="welcome-foot">${esc(WELCOME.foot)}</p>
  </div></div>`;
}

function tourCard() {
  const step = TOUR_STEPS[ui.tour], total = TOUR_STEPS.length, position = ui.tour + 1, last = position === total;
  return `<aside class="tour" role="dialog" aria-label="Recorrido por la aplicación">
    <div class="tour-head"><span class="tour-step">Paso ${position} de ${total}</span><button type="button" class="icon-btn" data-action="tour-skip" aria-label="Cerrar el recorrido">×</button></div>
    <div class="progress"><span style="width:${Math.round(position / total * 100)}%"></span></div>
    <h2>${esc(step.title)}</h2><p>${esc(step.body)}</p>${step.tip ? `<p class="tour-tip">${esc(step.tip)}</p>` : ''}
    <div class="tour-actions">${button('Saltar', 'tour-skip', 'btn-quiet btn-small')}<span class="tour-spacer"></span>${ui.tour ? button('Atrás', 'tour-prev', 'btn-secondary btn-small') : ''}${button(last ? 'Terminar' : 'Siguiente', 'tour-next', 'btn-primary btn-small')}</div>
  </aside>`;
}
function goTour(index) {
  ui.tour = index; ui.page = TOUR_STEPS[index].page; ui.modal = null; ui.drawerOpen = false;
  render();
}

/* ── Armazón ───────────────────────────────────────────────────────────── */

const PAGINAS = {
  hoy: renderToday,
  mes: () => renderMes(ctx()),
  compra: () => renderCompra(ctx()),
  setup: () => renderSetup(ctx())
};
const esPaginaDeMas = pagina => pagina === 'mas' || PAGINAS_MAS.includes(pagina);

function render() {
  document.body.classList.toggle('menu-open', ui.drawerOpen);
  document.body.classList.toggle('tour-open', ui.tour !== null);
  document.body.classList.toggle('tour-fab', ui.tour !== null && TOUR_STEPS[ui.tour].highlight === 'fab');
  if (ui.welcome) {
    document.querySelector('#app').innerHTML = renderWelcome();
    document.querySelector('#modal-root').innerHTML = '';
    return;
  }
  const activa = id => (ui.page === id || (id === 'mas' && esPaginaDeMas(ui.page))) ? 'active' : '';
  const cuerpo = PAGINAS[ui.page] ? PAGINAS[ui.page]() : esPaginaDeMas(ui.page) ? renderMas(ctx()) : renderToday();
  document.querySelector('#app').innerHTML = `<div class="shell ${ui.sidebarCollapsed ? 'sidebar-collapsed' : ''} ${ui.drawerOpen ? 'drawer-open' : ''}">
    <aside class="sidebar" id="app-sidebar" aria-label="Menú lateral">
      <div class="sidebar-head"><button type="button" class="icon-btn sidebar-close" data-action="close-sidebar" aria-label="Ocultar menú">‹</button><div class="brand"><span class="brand-mark">${BRAND_MARK}</span>¿Qué comemos?</div></div>
      <nav class="nav" aria-label="Navegación principal">${NAV.map(([id, icon, label]) => `<button type="button" class="${activa(id)}" data-action="navigate" data-page="${id}"><span class="nav-icon">${icon}</span>${label}</button>`).join('')}</nav>
      <div class="side-foot">Tus datos están solo en este aparato. Guarda una copia de vez en cuando desde Más → Respaldo.</div>
    </aside>
    <button type="button" class="drawer-scrim" data-action="close-sidebar" aria-label="Cerrar menú lateral"></button>
    <main class="main">
      <div class="mobile-brand"><button type="button" class="menu-toggle" data-action="toggle-sidebar" aria-label="${ui.drawerOpen ? 'Ocultar menú' : 'Abrir menú'}" aria-controls="app-sidebar" aria-expanded="${ui.drawerOpen}">☰</button><span class="brand-mark">${BRAND_MARK}</span><span>¿Qué comemos?</span></div>
      <header class="topline"><div class="topline-heading"><button type="button" class="menu-toggle desktop-menu-toggle" data-action="toggle-sidebar" aria-label="${ui.sidebarCollapsed ? 'Abrir menú' : 'Ocultar menú'}" aria-controls="app-sidebar" aria-expanded="${!ui.sidebarCollapsed}">☰</button><div><p class="eyebrow">${esc(eyebrow())}</p><h1>${esc(pageTitle())}</h1></div></div></header>
      ${migratedFrom ? notice('Tus datos se actualizaron al formato nuevo.', 'La canasta que tenías es ahora <strong>tu canasta habitual</strong>, y lo que cambiaba en algún mes quedó guardado como cambio de ese mes. Nada se perdió, y lo anterior quedó a salvo por si acaso.') : ''}
      ${loadError ? notice('No se pudieron leer los datos guardados.', `${esc(loadError)} Trae una copia desde Más → Respaldo, o borra los datos para empezar de nuevo.`, 'error') : ''}
      ${state.demo ? `<div class="demo-banner"><span>✦</span><div><strong>Estás viendo un ejemplo</strong>Las cantidades son inventadas para que veas cómo funciona; no son recomendaciones de alimentación.</div>${button('Borrar el ejemplo', 'clear-demo', 'btn-secondary btn-small')}</div>` : ''}
      ${cuerpo}
    </main>
    ${ui.modal || ui.page === 'setup' ? '' : `<button type="button" class="fab" data-action="open-quick" aria-label="Anotar algo"><span aria-hidden="true">+</span></button>`}
    <nav class="mobile-nav" aria-label="Navegación principal">${NAV.map(([id, icon, label]) => `<button type="button" class="${activa(id)}" data-action="navigate" data-page="${id}"><span>${icon}</span>${label}</button>`).join('')}</nav>
  </div>`;
  document.querySelector('#modal-root').innerHTML = ui.modal ? renderModal() : ui.tour === null ? '' : tourCard();
}

const eyebrow = () => esPaginaDeMas(ui.page) && ui.page !== 'mas' ? 'Más' : 'Organización de comidas';

/* ── Hoy ───────────────────────────────────────────────────────────────── */

// Esta pantalla no es para quien organiza: es para quien cocina. Tiene que
// decir qué preparar, cuánto, para quién y qué hay que apartar, sin una sola
// palabra de canastas, inventarios ni bases de cálculo.
function renderToday() {
  const sinNada = !state.products.length && !habitualLines(state).length && !state.recipes.length;
  if (sinNada) {
    return `<section class="hero start-hero">
      <div>
        <div class="eyebrow">${esc(niceDate(today))}</div>
        <h2>Vamos a organizar tu casa</h2>
        <p>Una sola vez: marcas lo que se come normalmente y qué días se prepara. Desde ahí, cada mes empieza casi hecho y tú solo revisas lo diferente.</p>
      </div>
      ${button('Organizar mi casa', 'setup-open', 'btn-secondary')}
    </section>
    <div class="inline" style="margin-top:16px">${button('Ver un ejemplo', 'welcome-demo', 'btn-quiet')}</div>`;
  }
  const decididas = SLOTS.filter(slot => { const plan = planFor(state, today, slot); return plan && plan.kind !== 'unplanned'; }).length;
  return `<section class="hero">
      <div>
        <div class="eyebrow">${esc(niceDate(today))}</div>
        <h2>${decididas === 3 ? 'Todo listo para hoy' : decididas ? 'Casi listo' : '¿Qué comemos hoy?'}</h2>
        <p>${decididas} de 3 comidas decididas</p>
      </div>
      ${decididas === 3 ? '' : button('Ver el mes', 'navigate', 'btn-secondary', 'data-page="mes"')}
    </section>
    <div class="grid grid-3">${SLOTS.map(slot => tarjetaDeComida(slot, today)).join('')}</div>
    ${pieDeHoy()}`;
}

function tarjetaDeComida(slot, date) {
  const plan = planFor(state, date, slot);
  if (!plan) {
    return `<article class="card meal-card"><div class="slot">${cap(slot)}</div>
      <div class="meal-body"><div class="meal-title">Todavía sin decidir</div><p class="muted small">Elige una comida o marca que hoy no se cocina.</p></div>
      ${button('Decidir', 'open-meal', 'btn-secondary btn-small', `data-date="${date}" data-slot="${slot}"`)}</article>`;
  }
  if (!['recipe', 'linked'].includes(plan.kind)) {
    return `<article class="card meal-card fuera"><div class="slot">${cap(slot)}</div>
      <div class="meal-body"><div class="meal-title">${esc(planTitle(plan))}</div><p class="muted small">${plan.kind === 'outside' ? 'Hoy esta comida no se prepara en casa.' : plan.kind === 'order' ? 'Se pedirá fuera.' : 'Esta comida necesita una decisión.'}</p></div>
      ${button('Cambiar', 'open-meal', 'btn-quiet btn-small', `data-date="${date}" data-slot="${slot}"`)}</article>`;
  }
  return `<article class="card meal-card"><div class="slot">${cap(slot)}</div>
    <div class="meal-body">
      <div class="meal-title">${esc(planTitle(plan))}</div>
      <div class="meal-people">${plan.participants.length ? `Para ${plan.participants.map(id => esc(personName(id))).join(', ')}` : 'Para quien coma en casa'}</div>
      ${cantidades(plan)}
      ${plan.note ? `<p class="small nota-cocina"><strong>Nota:</strong> ${esc(plan.note)}</p>` : ''}
      ${incompatibleItems(state, plan.items, plan.participants).length ? '<p class="pill red">Ojo: lleva algo que alguien no puede comer</p>' : ''}
    </div>
    ${button('Ver o cambiar', 'open-meal', 'btn-secondary btn-small', `data-date="${date}" data-slot="${slot}"`)}</article>`;
}

// Lo que se reserva para otro día va en negrita y con su fecha: quien cocina
// tiene que saber que de esas ocho libras, dos no se sirven hoy.
function cantidades(plan) {
  if (plan.kind === 'linked') {
    const origen = state.plans.find(item => item.id === plan.sourceId);
    return `<p class="small muted">Se usa la parte que se apartó de ${esc(origen?.title || 'otra comida')}${origen ? `, del ${esc(niceDate(origen.date, { day: 'numeric', month: 'short' }))}` : ''}.</p>
      <ul class="food-list">${(plan.reservedItems || []).map(fila => {
        const item = origen?.items.find(row => row.id === fila.sourceItemId);
        return item ? `<li>${esc(measure(fila.quantity, item.unit))} de ${esc(productName(item.productId))}</li>` : '<li>Reserva sin alimento de origen</li>';
      }).join('')}</ul>
      ${plan.items.length ? `<p class="small strong">Además hay que preparar:</p><ul class="food-list">${plan.items.map(item => `<li>${itemText(item)}</li>`).join('')}</ul>` : ''}`;
  }
  if (!plan.items.length) return '<p class="small muted">Sin cantidades anotadas.</p>';
  const filas = plan.items.map(item => {
    const reservado = reservedQuantity(state, plan.id, item.id);
    return `<li><strong>${esc(measure(item.quantity, item.unit))}</strong> de ${esc(productName(item.productId))}${item.personId ? ` · para ${esc(personName(item.personId))}` : ''}${reservado ? `<br><span class="muted small">Apartar ${esc(measure(reservado, item.unit))} para otra comida.</span>` : ''}</li>`;
  }).join('');
  const hijos = dependents(state, plan.id);
  return `<ul class="food-list">${filas}</ul>${hijos.length ? `<p class="small muted">Se aparta una parte para ${hijos.map(hijo => `${cap(hijo.slot)} del ${niceDate(hijo.date, { day: 'numeric', month: 'short' })}`).join(', ')}.</p>` : ''}`;
}

function pieDeHoy() {
  const manana = addDays(today, 1);
  const hayManana = SLOTS.some(slot => planFor(state, manana, slot));
  const diaDeHoy = (new Date(`${today}T12:00:00`).getDay() + 6) % 7 + 1;
  const tocaRevisar = diaDeHoy === (state.settings?.reviewWeekday ?? 5);
  return `${tocaRevisar ? notice('Hoy toca revisar lo que queda.', `Un repaso rápido a la nevera deja la compra exacta. <button type="button" class="enlace" data-action="open-new-review">Empezar</button>`) : ''}
    ${lineaDeCompra()}
    ${hayManana ? `<div class="section-head"><div><h2>Mañana</h2></div>${button('Ver el mes', 'navigate', 'btn-quiet btn-small', 'data-page="mes"')}</div>
      <div class="grid grid-3">${SLOTS.map(slot => {
        const plan = planFor(state, manana, slot);
        return `<div class="card soft"><div class="between"><span class="pill warm">${cap(slot)}</span></div><h3 style="margin-top:10px">${esc(plan ? planTitle(plan) : 'Sin decidir')}</h3>${plan?.kind === 'linked' ? '<p class="small muted">Usa la parte apartada de hoy.</p>' : ''}</div>`;
      }).join('')}</div>` : ''}`;
}

// Una línea, no una tarjeta: quien abre «Hoy» viene a cocinar, y lo que falta
// comprar es un dato de fondo. Si no falta nada, no se dice nada: un aviso que
// aparece siempre deja de leerse.
function lineaDeCompra() {
  const periodo = periodoDeCompra(ui.compra);
  let faltan = 0;
  try { faltan = shoppingList(state, periodo.start, periodo.end, ui.compra.base).lines.filter(linea => linea.shortfall > 0).length; }
  catch { return ''; }
  if (!faltan) return '';
  return `<p class="hoy-compra small muted">Para ${esc(rotuloDePeriodo())} faltan <strong>${faltan}</strong> ${faltan === 1 ? 'alimento' : 'alimentos'}. <button type="button" class="enlace" data-action="navigate" data-page="compra">Ver la lista</button></p>`;
}

const rotuloDePeriodo = () => ({
  mes: 'este mes',
  primera: 'la primera quincena',
  segunda: 'la segunda quincena',
  fechas: 'ese período'
})[ui.compra.tramo] || 'este mes';

/* ── Piezas de formulario compartidas ──────────────────────────────────── */

const unitOptions = selected => options(UNITS.map(unit => [unit, unit]), selected);
const productOptions = selected => options(state.products.filter(item => !item.archived).map(item => [item.id, item.name]), selected, 'Elegir un alimento');
const personOptions = selected => options([['', 'Para todos'], ...state.people.map(item => [item.id, item.name])], selected || '');

function itemRow(item = {}, type = 'ingredient') {
  const isPurchase = type === 'purchase';
  const noPerson = type !== 'ingredient';
  const defaultProduct = product(state, item.productId);
  return `<div class="item-row" data-item-row><input type="hidden" name="itemId" value="${esc(item.id || '')}">
    <label class="field"><span>Alimento</span><select name="productId" required>${productOptions(item.productId || '')}</select></label>
    <label class="field"><span>Cantidad</span><input name="quantity" type="number" min="0" step="any" inputmode="decimal" value="${item.quantity ?? ''}" placeholder="0"></label>
    <label class="field"><span>Unidad</span><select name="unit">${unitOptions(item.unit || defaultProduct?.[isPurchase ? 'purchaseUnit' : 'controlUnit'] || 'unidad')}</select></label>
    ${noPerson ? '<span></span>' : `<label class="field person-select"><span>Para quién</span><select name="personId">${personOptions(item.personId)}</select></label>`}
    <button type="button" class="btn btn-quiet remove-item" data-action="remove-item" aria-label="Quitar alimento">✕</button></div>`;
}

function checkPeople(name, selected, date = null, slot = null) {
  if (!state.people.length) return '<p class="muted small">Todavía no hay personas registradas. Puedes seguir sin ellas.</p>';
  return `<div class="checks">${state.people.map(person => {
    const ausente = date && isAbsent(state, date, slot, person.id);
    return `<label class="check-chip ${ausente ? 'disabled' : ''}"><input type="checkbox" name="${name}" value="${person.id}" ${selected.includes(person.id) ? 'checked' : ''} ${ausente ? 'disabled' : ''}>${esc(person.name)}${ausente ? ' <span class="muted">(fuera)</span>' : ''}</label>`;
  }).join('')}</div>`;
}

/* ── Ventanas ──────────────────────────────────────────────────────────── */

function renderModal() {
  const m = ui.modal;

  if (m.type === 'quick') {
    return modal('Anotar algo', '', `<div class="quick-grid">${RAPIDAS.map(([action, icono, titulo, detalle]) =>
      `<button type="button" class="quick-item" data-action="${action}"><span class="quick-icon" aria-hidden="true">${icono}</span><span class="quick-text"><strong>${esc(titulo)}</strong><span>${esc(detalle)}</span></span></button>`).join('')}</div>`);
  }

  if (m.type === 'rutina') return modalRutina(ctx(), m);

  if (m.type === 'meal') return modalComida(m);

  if (m.type === 'alcance-comida') {
    const plan = state.plans.find(item => item.id === m.id);
    const rutina = state.mealRoutines?.find(item => item.id === plan?.routineId);
    const quitando = m.accion === 'quitar';
    const cuantas = state.plans.filter(item => item.routineId === plan.routineId).length;
    return modal('¿Qué quieres cambiar?', `${cap(plan.slot)} · ${niceDate(plan.date, { weekday: 'long', day: 'numeric', month: 'long' })}`,
      `<p class="muted small">Esta comida viene de una rutina${rutina ? ` —${esc(describeRutina(rutina))}— que está puesta en ${cuantas} día(s)` : ''}. Dinos hasta dónde llega ${quitando ? 'lo que quitas' : 'el cambio'}.</p>
       <div class="opcion-larga" style="margin-top:16px">
         ${[['sola', 'Solo esta fecha', quitando ? 'Las demás se quedan igual, y la rutina también.' : 'Esta comida deja de seguir la rutina; las demás siguen igual.'],
            ['siguientes', 'Esta y todas las siguientes', 'Las anteriores no se tocan.'],
            ['todas', 'Toda la rutina', 'Incluidas las que ya pasaron este mes.']].map(([valor, titulo, detalle]) =>
           `<button type="button" class="radio-bloque" data-action="alcance-elegido" data-id="${plan.id}" data-alcance="${valor}"><span><strong>${esc(titulo)}</strong>${esc(detalle)}</span></button>`).join('')}
       </div>`);
  }

  if (m.type === 'recipe') {
    const recipe = state.recipes.find(item => item.id === m.id);
    return modal(recipe ? 'Editar preparación' : 'Nueva preparación',
      'Con el nombre y en qué comida se sirve ya basta. Lo demás se puede añadir después.',
      `<form data-form="recipe" data-id="${recipe?.id || ''}">
        <label class="field"><span>¿Cómo se llama?</span><input name="name" required value="${esc(recipe?.name || '')}" placeholder="Ej. Mangú con salami"></label>
        <div class="field" style="margin-top:14px"><span>¿En qué comida?</span><div class="checks">${SLOTS.map(slot => `<label class="check-chip"><input type="checkbox" name="uses" value="${slot}" ${recipe?.uses.includes(slot) ? 'checked' : ''}>${cap(slot)}</label>`).join('')}</div></div>
        <div class="field" style="margin-top:14px"><span>¿Quiénes la comen normalmente?</span>${checkPeople('covers', recipe?.covers || [])}<small>Si no marcas a nadie, vale para quien coma ese día.</small></div>
        <label class="field" style="margin-top:14px"><span>Nota para quien cocina (opcional)</span><textarea name="note" placeholder="Ej. dejar una parte para la cena">${esc(recipe?.note || '')}</textarea></label>
        <details class="more" style="margin-top:17px" ${recipe?.items.length ? 'open' : ''}>
          <summary>Más opciones: alimentos y raciones</summary>
          <p class="small muted">Solo los alimentos principales. No hace falta anotar la sal, el aceite, el ajo ni los condimentos: la app no les lleva la cuenta y pedírtelos sería trabajo para nada.</p>
          <label class="field"><span>¿Para cuántas raciones? (opcional)</span><input name="servings" type="number" min="0.1" step="any" inputmode="decimal" value="${recipe?.servings ?? ''}" placeholder="Ej. 4"></label>
          <div data-item-list="ingredient">${(recipe?.items || []).map(item => itemRow(item)).join('')}</div>
          <div class="inline">${button('+ Añadir alimento', 'add-item', 'btn-secondary btn-small', 'data-type="ingredient"')}${state.people.some(person => person.habitual?.length) ? button('↺ Traer las cantidades habituales', 'fill-habitual', 'btn-quiet btn-small') : ''}</div>
        </details>
        <div class="modal-actions"><button class="btn btn-primary" type="submit">Guardar</button></div>
      </form>`, true);
  }

  if (m.type === 'person') {
    const person = state.people.find(item => item.id === m.id);
    return modal(person ? 'Editar persona' : 'Añadir persona', '', `<form data-form="person" data-id="${person?.id || ''}">
      <label class="field"><span>Nombre</span><input name="name" required value="${esc(person?.name || '')}" placeholder="Nombre de la persona"></label>
      <div class="field" style="margin-top:16px"><span>¿Hay algo que no pueda comer?</span>
        <input name="pendingRestrictions" class="text" value="${esc((person?.pendingRestrictions || []).join(', '))}" placeholder="Ej. maní, mariscos" autocomplete="off" aria-label="Alimentos que no puede comer">
        <small>Escríbelos aunque no estén todavía en tu lista: se enlazan solos en cuanto aparezcan.</small>
        ${state.products.length ? `<details class="more" style="margin-top:10px"><summary>O marcarlos de la lista</summary><div class="checks">${state.products.filter(item => !item.archived).map(item => `<label class="check-chip"><input type="checkbox" name="restrictions" value="${item.id}" ${person?.restrictions.includes(item.id) ? 'checked' : ''}>${esc(item.name)}</label>`).join('')}</div></details>` : ''}
      </div>
      <details class="more" style="margin-top:16px" ${person?.habitual.length ? 'open' : ''}>
        <summary>Más opciones: cuánto come normalmente</summary>
        <p class="small muted">Queda guardado y no hay que volver a escribirlo: al crear una preparación se suman con un toque las de todos los que comen.</p>
        <div data-item-list="habitual">${(person?.habitual || []).map(item => itemRow(item, 'habitual')).join('')}</div>
        ${button('+ Añadir cantidad', 'add-item', 'btn-secondary btn-small', 'data-type="habitual"')}
      </details>
      <div class="modal-actions"><button type="submit" class="btn btn-primary">Guardar</button></div></form>`, true);
  }

  if (m.type === 'product') return modalProducto(m);

  if (m.type === 'cambio-mes') {
    const mes = m.month;
    const enCanasta = new Set(habitualLines(state).map(linea => linea.productId));
    return modal(`Un cambio solo para ${monthName(mes)}`, 'No toca los demás meses ni tu costumbre.',
      `${productDatalist(state.products)}
       <form data-form="cambio-mes" data-month="${esc(mes)}" class="stack">
        <label class="field"><span>¿Qué alimento?</span>
          <input name="nombre" class="text" list="lista-de-productos" required placeholder="Ej. Cangrejo" autocomplete="off">
          <small>Si no existe todavía, se crea solo al guardar.</small></label>
        <div class="form-grid">
          <label class="field"><span>¿Cuánto, este mes?</span><input name="cantidad" type="number" min="0" step="any" inputmode="decimal" placeholder="Déjalo vacío si no lo sabes"></label>
          <label class="field"><span>Unidad</span><select name="unidad">${unitOptions('lb')}</select></label>
        </div>
        <div class="field"><span>¿Y después?</span>
          <div class="radio-fila">
            <label class="radio-pill"><input type="radio" name="alcance" value="mes" checked><span>Solo este mes</span></label>
            <label class="radio-pill"><input type="radio" name="alcance" value="siempre"><span>Desde ahora, todos los meses</span></label>
          </div>
          <small>«Solo este mes» es lo normal para algo extraordinario: una cena, una visita. «Todos los meses» es para cuando el hábito de la casa cambió de verdad.</small>
        </div>
        ${enCanasta.size ? `<details class="more"><summary>O quitar algo que este mes no se compra</summary>
          <div class="checks" style="margin-top:10px">${habitualLines(state).map(linea => `<label class="check-chip"><input type="checkbox" name="quitar" value="${linea.productId}">${esc(productName(linea.productId))}</label>`).join('')}</div></details>` : ''}
        <div class="modal-actions"><button type="submit" class="btn btn-primary">Guardar el cambio</button></div>
      </form>`, true);
  }

  if (m.type === 'avanzado-producto') {
    const item = product(state, m.id);
    return modal('Más opciones', item?.name || '', `<div class="opcion-larga">
      <button type="button" class="radio-bloque" data-action="open-equivalence" data-id="${m.id}"><span><strong>Cómo lo compras</strong>Si lo cuentas de una forma y lo compras de otra —ruedas y paquetes, por ejemplo—, aquí se dice cuánto trae cada uno.</span></button>
      <button type="button" class="radio-bloque" data-action="open-merge" data-id="${m.id}"><span><strong>Unir con otro alimento</strong>Si el mismo alimento quedó anotado dos veces con nombres distintos, esto junta su historial y sus existencias.</span></button>
      <button type="button" class="radio-bloque" data-action="open-correction" data-id="${m.id}"><span><strong>Corregir lo que hay</strong>Si se dañó algo, o el conteo no cuadra.</span></button>
      <button type="button" class="radio-bloque" data-action="archive-product" data-id="${m.id}"><span><strong>Archivar</strong>Deja de aparecer en las listas, pero su historial se conserva entero. Se puede reactivar cuando quieras.</span></button>
    </div>`);
  }

  if (m.type === 'merge') {
    const item = product(state, m.id);
    const parecidos = findSimilarProducts(state, item?.name || '', { limit: 6, threshold: 0.45, exclude: m.id });
    const compatibles = state.products.filter(other => other.id !== m.id && other.controlUnit === item?.controlUnit);
    return modal('Unir con otro alimento', item?.name || '', `<div class="notice warn"><span>⚠</span><div><strong>Esto no se puede deshacer.</strong>Se suman las existencias y se junta todo el historial —compras, revisiones, preparaciones— bajo un solo alimento. El otro deja de existir.</div></div>
      ${parecidos.length ? `<p class="small"><strong>Se parecen a este:</strong> ${parecidos.map(row => esc(row.product.name)).join(', ')}.</p>` : ''}
      <form data-form="merge" data-id="${m.id}" class="stack">
        <label class="field"><span>¿Con cuál se une?</span><select name="otro" required>${options(compatibles.map(other => [other.id, other.name]), parecidos[0]?.product.id, 'Elegir un alimento')}</select>
        <small>Solo salen los que se cuentan en <strong>${esc(item?.controlUnit || '')}</strong>: sumar libras con unidades daría un número sin significado.</small></label>
        <label class="field"><span>¿Cuál nombre se queda?</span><select name="conservar">${options([[m.id, `«${item?.name}» (este)`], ['otro', 'El del otro alimento']], m.id)}</select></label>
        <div class="modal-actions"><button type="submit" class="btn btn-danger">Unir los dos</button></div></form>`);
  }

  if (m.type === 'diagnostico') return modalDiagnostico();

  if (m.type === 'equivalence') {
    const item = product(state, m.id);
    return modal('Cómo lo compras', item?.name || '',
      `<p class="muted small">Cuentas este alimento en <strong>${esc(item?.controlUnit || '')}</strong>. Si lo compras de otra forma, dinos cuántas trae cada una y la app hace la cuenta sola.</p>
       <form data-form="equivalence" data-id="${item?.id || ''}" class="stack">
        <label class="field"><span>Lo compro en…</span><select name="unit">${unitOptions(item?.purchaseUnit !== item?.controlUnit ? item.purchaseUnit : UNITS.find(unit => unit !== item?.controlUnit))}</select></label>
        <label class="field"><span>Y cada uno trae… (en ${esc(unitText(item?.controlUnit || '', 2))})</span><input name="factor" type="number" step="any" min="0.001" inputmode="decimal" required placeholder="Ej. 12"></label>
        <div class="modal-actions"><button type="submit" class="btn btn-primary">Guardar</button></div></form>`);
  }

  if (m.type === 'link') {
    const source = state.plans.find(item => item.id === m.id);
    return modal('Apartar para otra comida', `${source?.title || ''} · ${niceDate(source.date, { day: 'numeric', month: 'long' })}`,
      `<div class="hint">Indica cuánto se aparta y para cuándo. La compra se cuenta una sola vez, el día que se prepara.</div>
       <form data-form="link" data-id="${source.id}">
        <div class="form-grid" style="margin-top:15px">
          <label class="field"><span>¿Para qué día?</span><input type="date" name="date" min="${addDays(source.date, 1)}" value="${addDays(source.date, 1)}" required></label>
          <label class="field"><span>¿Qué comida?</span><select name="slot">${options(SLOTS.map(slot => [slot, cap(slot)]), 'almuerzo')}</select></label>
        </div>
        <div class="section-head"><h3>¿Cuánto se aparta?</h3></div>
        ${source.items.map(item => `<div class="list-row"><div>${itemText(item)}<div class="small muted">Ya apartado: ${fmt(reservedQuantity(state, source.id, item.id))} ${esc(item.unit)}</div></div><label class="field" style="max-width:130px"><span class="sr-only">Apartar</span><input type="number" min="0" max="${Math.max(0, item.quantity - reservedQuantity(state, source.id, item.id))}" step="any" inputmode="decimal" name="reserve-${item.id}" value="0" aria-label="Cuánto apartar de ${esc(productName(item.productId))}"></label></div>`).join('')}
        <div class="field" style="margin-top:15px"><span>¿Quiénes comerán esa parte?</span>${checkPeople('participants', source.participants)}</div>
        <div data-item-list="ingredient"></div>
        <div class="modal-actions"><button type="submit" class="btn btn-primary">Apartar</button></div></form>`, true);
  }

  if (m.type === 'move' || m.type === 'copy') {
    const plan = state.plans.find(item => item.id === m.id);
    return modal(m.type === 'move' ? 'Mover esta comida' : 'Copiar esta comida', planTitle(plan),
      `<form data-form="move-copy" data-id="${plan.id}" data-operation="${m.type}" class="stack">
        <div class="form-grid"><label class="field"><span>¿A qué día?</span><input type="date" name="date" value="${m.type === 'copy' ? addDays(plan.date, 1) : plan.date}" required></label>
        <label class="field"><span>¿Qué comida?</span><select name="slot">${options(SLOTS.map(slot => [slot, cap(slot)]), plan.slot)}</select></label></div>
        <div class="modal-actions"><button type="submit" class="btn btn-primary">${m.type === 'move' ? 'Mover' : 'Copiar'}</button></div></form>`);
  }

  if (m.type === 'purchase') {
    const periodo = periodoDeCompra(ui.compra);
    let lista;
    try { lista = shoppingList(state, periodo.start, periodo.end, ui.compra.base); }
    catch { lista = { lines: [], pending: [] }; }
    const sugeridas = lista.lines.filter(linea => linea.shortfall > 0 && linea.purchaseQuantity !== null);
    return modal('Anotar la compra', 'Cambia las cantidades por lo que de verdad trajiste.',
      `<div class="hint">Solo al guardar aquí aumentan las existencias de la casa.</div>
       ${lista.pending?.length ? notice('Hay alimentos sin medida de compra.', 'Puedes anotar los demás ahora y completar esos después.', 'warn') : ''}
       <form data-form="purchase" class="stack">
        <label class="field"><span>¿Qué día compraste?</span><input name="date" type="date" value="${today}" required></label>
        <div class="section-head"><h3>Lo que trajiste</h3></div>
        <div data-item-list="purchase">${(sugeridas.length ? sugeridas.map(linea => itemRow({ productId: linea.productId, quantity: linea.purchaseQuantity, unit: linea.purchaseUnit }, 'purchase')) : [itemRow({}, 'purchase')]).join('')}</div>
        ${button('+ Añadir otro', 'add-item', 'btn-secondary btn-small', 'data-type="purchase"')}
        <div class="modal-actions"><button type="submit" class="btn btn-primary">Guardar la compra</button></div></form>`, true);
  }

  if (m.type === 'chat') return modal('Asistente', 'Dile lo que pasó en casa. Antes de tocar nada te enseña lo que entendió.', renderChat({ ...ctx(), chat: ui.chat }), true);
  if (m.type === 'bulk') return modal('Escribir o dictar varios', 'De corrido, como se habla. La app lo separa y tú revisas antes de guardar.', renderBulk({ ...ctx(), bulk: ui.bulk }), true);

  if (m.type === 'new-review') return modal('Revisar lo que queda', 'Se cargan solos los alimentos que tienen existencias.',
    `<form data-form="new-review" class="stack"><label class="field"><span>¿De qué día?</span><input name="date" type="date" value="${today}" required></label><div class="modal-actions"><button type="submit" class="btn btn-primary">Empezar</button></div></form>`);

  if (m.type === 'correction') {
    const elegido = m.id || state.products[0]?.id;
    return modal('Corregir lo que hay', 'Para cuando algo se dañó, se perdió o el conteo no cuadra.',
      `<form data-form="correction" class="stack">
        <label class="field"><span>¿Qué alimento?</span><select name="productId" required>${productOptions(elegido)}</select></label>
        <label class="field"><span>¿Cuánto queda de verdad?</span><input name="actual" type="number" min="0" step="any" inputmode="decimal" value="${inventoryNow(state)[elegido] || 0}" required></label>
        <label class="field"><span>¿Por qué? (opcional)</span><input name="reason" placeholder="Ej. se dañaron 2"></label>
        <div class="modal-actions"><button type="submit" class="btn btn-primary">Guardar</button></div></form>`);
  }

  if (m.type === 'absence') return modal('Alguien no come en casa', '',
    `<form data-form="absence" class="stack"><div class="form-grid">
      <label class="field"><span>¿Qué día?</span><input name="date" type="date" value="${m.date || today}" required></label>
      <label class="field"><span>¿Qué comida?</span><select name="slot">${options(SLOTS.map(slot => [slot, cap(slot)]), m.slot || 'almuerzo')}</select></label></div>
      <div class="field"><span>¿Quién?</span>${checkPeople('absent', state.absences.filter(item => item.date === (m.date || today) && item.slot === (m.slot || 'almuerzo')).map(item => item.personId))}</div>
      <div class="modal-actions"><button type="submit" class="btn btn-primary">Guardar</button></div></form>`);

  if (m.type === 'import') return modal('Traer una copia', 'Reemplaza todo lo que hay ahora.',
    `<form data-form="import" class="stack"><label class="field"><span>Archivo guardado desde ¿Qué comemos?</span><input name="file" type="file" accept=".json,application/json" required></label><div class="modal-actions"><button type="submit" class="btn btn-primary">Traer</button></div></form>`);

  return '';
}

function describeRutina(rutina) {
  return rutina.label || (rutina.kind === 'outside' ? 'comemos fuera' : rutina.kind === 'order' ? 'pedimos comida' : state.recipes.find(item => item.id === rutina.recipeId)?.name || 'preparación');
}

// La ventana de una comida es donde se decide entre «solo hoy» y «todos los
// lunes». Ofrecer las dos cosas aquí es lo que evita tener que tocar dieciocho
// casillas para poner el mismo desayuno.
function modalComida(m) {
  const plan = planFor(state, m.date, m.slot);
  const contexto = `${cap(m.slot)} · ${niceDate(m.date, { weekday: 'long', day: 'numeric', month: 'long' })}`;
  if (!plan) {
    const opciones = state.recipes.filter(recipe => recipe.uses.includes(m.slot));
    const marcados = opciones[0]?.covers.length ? opciones[0].covers : state.people.map(person => person.id);
    return modal('¿Qué se come?', contexto, `<form data-form="assign" class="stack">
      <input type="hidden" name="date" value="${m.date}"><input type="hidden" name="slot" value="${m.slot}">
      <label class="field"><span>Preparación</span><select name="recipeId" id="assign-recipe" ${opciones.length ? '' : 'disabled'}>${options(opciones.map(recipe => [recipe.id, recipe.name]), opciones[0]?.id, opciones.length ? '' : 'Todavía no hay ninguna')}</select></label>
      ${state.people.length ? `<div class="field"><span>¿Quiénes comen?</span>${checkPeople('participants', marcados, m.date, m.slot)}</div>` : ''}
      ${opciones.length
        ? `<div class="field"><span>¿Solo hoy, o se repite?</span>
            <div class="radio-fila">
              <label class="radio-pill"><input type="radio" name="repetir" value="sola" checked><span>Solo este día</span></label>
              <label class="radio-pill"><input type="radio" name="repetir" value="rutina"><span>Hacerla rutina</span></label>
            </div>
            <small>«Hacerla rutina» te deja elegir los días de la semana y llena el mes entero de una vez.</small></div>
           <button type="submit" class="btn btn-primary">Poner esta comida</button>`
        : `<div class="hint">Todavía no tienes preparaciones para ${esc(m.slot)}. ${button('Crear una', 'open-recipe', 'btn-secondary btn-small')}</div>`}
      </form>
      <div class="divider"></div>
      <div class="small strong" style="margin-bottom:9px">O marcar que no se cocina</div>
      <div class="inline">${[['outside', 'Comemos fuera'], ['order', 'Pedimos comida'], ['unplanned', 'Todavía no sabemos']].map(([kind, label]) =>
        button(label, 'mark-status', 'btn-secondary btn-small', `data-date="${m.date}" data-slot="${m.slot}" data-kind="${kind}"`)).join('')}</div>
      <p class="small muted" style="margin:12px 0 0">Un día de paseo no se parte en tres: ${button('marcar el día entero fuera', 'mark-day', 'btn-quiet btn-small', `data-date="${m.date}" data-kind="outside"`)}</p>`);
  }
  if (!['recipe', 'linked'].includes(plan.kind)) {
    return modal(planTitle(plan), contexto, `<p class="muted">Esta comida está resuelta: no cuenta como pendiente y no gasta alimentos.</p>
      ${plan.routineId ? '<p class="small muted">Viene de una rutina.</p>' : ''}
      <div class="modal-actions">${button('Cambiarla por una comida', 'delete-plan', 'btn-secondary', `data-id="${plan.id}"`)}${button('Quitar la marca', 'delete-plan', 'btn-quiet', `data-id="${plan.id}"`)}</div>`);
  }
  return modal(plan.kind === 'linked' ? 'Comida apartada' : 'Esta comida', contexto,
    `${plan.routineId ? `<div class="hint">Esta comida viene de una rutina. Lo que cambies aquí afecta <strong>solo a este día</strong>; para cambiar la rutina entera, ve a Plan mensual.</div>` : '<div class="hint">Lo que cambies aquí afecta solo a este día.</div>'}
     ${plan.kind === 'linked' ? cantidades(plan) : dependents(state, plan.id).length ? `<div class="notice warn"><span>↪</span><div><strong>De esta comida se aparta una parte para otro día.</strong>Si bajas las cantidades, deja suficiente.</div></div>` : ''}
     <form data-form="plan" data-id="${plan.id}">
      <div class="form-grid">
        <label class="field"><span>Nombre</span><input name="title" value="${esc(plan.title)}" required></label>
        ${state.people.length ? `<div class="field"><span>¿Quiénes comen?</span>${checkPeople('participants', plan.participants, plan.date, plan.slot)}</div>` : '<span></span>'}
      </div>
      <label class="field" style="margin-top:14px"><span>Nota para quien cocina</span><textarea name="note" placeholder="Ej. dejar una parte para mañana">${esc(plan.note || '')}</textarea></label>
      <details class="more" style="margin-top:16px" ${plan.items.length ? 'open' : ''}>
        <summary>${plan.kind === 'linked' ? 'Alimentos que hay que preparar además' : 'Cantidades'}</summary>
        <div data-item-list="ingredient">${plan.items.map(item => itemRow(item)).join('')}</div>
        ${button('+ Añadir alimento', 'add-item', 'btn-secondary btn-small', 'data-type="ingredient"')}
      </details>
      <div class="modal-actions"><button type="submit" class="btn btn-primary">Guardar</button></div>
     </form>
     <div class="divider"></div>
     <div class="inline">
       ${plan.kind === 'recipe' ? button('Apartar para otro día', 'open-link', 'btn-quiet btn-small', `data-id="${plan.id}"`) : ''}
       ${button('Mover', 'open-move', 'btn-quiet btn-small', `data-id="${plan.id}"`)}
       ${plan.kind !== 'linked' ? button('Copiar', 'open-copy', 'btn-quiet btn-small', `data-id="${plan.id}"`) : ''}
       ${button('Quitar', plan.routineId ? 'open-alcance' : 'delete-plan', 'btn-quiet btn-small', `data-id="${plan.id}"`)}
     </div>
     <div class="small strong" style="margin:17px 0 8px">O cambiarla a</div>
     <div class="inline">${[['outside', 'Comemos fuera'], ['order', 'Pedimos comida'], ['unplanned', 'Todavía no sabemos']].map(([kind, label]) =>
       button(label, 'replace-status', 'btn-quiet btn-small', `data-id="${plan.id}" data-kind="${kind}"`)).join('')}</div>`, true);
}

function modalProducto(m) {
  const item = product(state, m.id);
  const stock = item ? inventoryNow(state)[item.id] || 0 : 0;
  const otraUnidad = item && item.purchaseUnit !== item.controlUnit;
  const controlUnit = item?.controlUnit || 'unidad';
  const mensual = item && habitualLines(state).find(line => line.productId === item.id);
  return modal(item ? 'Editar alimento' : 'Añadir un alimento', item ? '' : 'Con el nombre basta para empezar.',
    `<form data-form="product" data-id="${item?.id || ''}" class="stack">
      <label class="field"><span>¿Cómo se llama?</span><input name="name" data-dedup required value="${esc(item?.name || '')}" placeholder="Ej. Plátano maduro" autocomplete="off"></label>
      <div data-dedup-warning></div>
      <div class="form-grid">
        <label class="field"><span>¿Cómo lo cuentas?</span><select name="controlUnit" ${item ? 'disabled' : ''}>${unitOptions(controlUnit)}</select><small>${item ? 'No se cambia cuando ya hay movimientos.' : 'Por unidades, por libras, por paquetes…'}</small></label>
        <label class="field"><span>¿Cuánto se consume al mes?</span>
          <div class="paired"><input name="monthly" type="number" min="0" step="any" inputmode="decimal" value="${mensual?.quantity ?? ''}" placeholder="No lo sé"><select name="monthlyUnit" aria-label="Unidad del consumo del mes">${unitOptions(mensual?.unit || controlUnit)}</select></div>
          <small>Es lo que entra en tu canasta habitual. Puedes dejarlo vacío.</small></label>
      </div>
      <details class="more" ${item ? 'open' : ''}>
        <summary>Más opciones</summary>
        <label class="field"><span>Categoría</span><select name="category">${options(CATEGORIES.map(cat => [cat.id, `${cat.emoji} ${cat.label}`]), item?.category || 'otros')}</select><small>Solo sirve para ordenar y buscar.</small></label>
        ${item
          ? `<div class="field"><span>Lo que hay ahora</span><div class="hint" style="min-height:42px;display:flex;align-items:center">${stockText(stock, item)}</div><small>Cambia con una compra, una revisión o una corrección.</small></div>`
          : `<label class="field"><span>¿Cuánto tienes ahora mismo?</span><input name="opening" type="number" min="0" step="any" inputmode="decimal" value="0" placeholder="0"><small>Déjalo en 0 si no tienes nada.</small></label>`}
        <div class="field" data-cut-field ${SLICEABLE.includes(controlUnit) ? '' : 'hidden'}>
          <span>¿De qué grosor lo cortan en casa?</span>
          <div class="checks">${SLICE_STYLES.map(style => `<label class="check-chip"><input type="radio" name="slice" value="${style.id}" ${(item?.slice || 'media') === style.id ? 'checked' : ''}><span class="cut-option"><strong>${esc(style.label)}</strong><span class="muted tiny">${esc(style.range)}</span></span></label>`).join('')}</div>
          <small>Cada casa corta distinto. Esto no convierte nada: deja escrito qué significa una rueda aquí.</small>
        </div>
        <div class="form-grid">
          <label class="field"><span>Lo compro en…</span><select name="purchaseUnit">${options([['', 'Lo mismo que cuento'], ...UNITS.map(unit => [unit, unit])], otraUnidad ? item.purchaseUnit : '')}</select></label>
          <label class="field"><span>Y cada uno trae…</span><input name="factor" type="number" min="0.001" step="any" inputmode="decimal" value="${otraUnidad ? item.equivalences?.[item.purchaseUnit] ?? '' : ''}" placeholder="Ej. 16"></label>
        </div>
      </details>
      <div class="modal-actions"><button type="submit" class="btn btn-primary">Guardar</button></div></form>`);
}

// Sin esta pantalla, un «no me funciona el micrófono» es imposible de resolver a
// distancia. Con ella, basta con que la persona mande esta lista.
function modalDiagnostico() {
  const d = diagnostico();
  const cfg = readConfig();
  return modal('Detalle de este aparato', 'Lo que tu teléfono puede hacer solo.',
    `<div class="cap-list">
      <div class="cap-row ${d.dictar.ok ? 'si' : 'no'}">
        <span class="cap-mark" aria-hidden="true">${d.dictar.ok ? '✓' : '—'}</span>
        <div><strong>Dictar en vez de escribir</strong><span>${esc(d.dictar.detalle)}</span></div>
        <span class="pill ${d.dictar.ok ? '' : 'gray'}">${d.dictar.ok ? (d.dictar.origen === 'telefono' ? 'En tu teléfono' : 'En el navegador') : 'No disponible'}</span>
      </div>
    </div>
    ${notice('No hay nada que configurar.', 'El dictado viaja dentro de la aplicación: no hace falta cuenta, ni clave, y <strong>tu voz no sale del teléfono</strong>.')}
    <details class="more" style="margin-top:16px">
      <summary>Detalle técnico</summary>
      <p class="small muted">Para poder explicar un «no me funciona» sin tener el teléfono delante.</p>
      <table class="data-table"><tbody>
        <tr><td>Dónde corre</td><td class="num">${esc(d.plataforma)}</td></tr>
        ${Object.entries(d.complementos || {}).map(([nombre, hay]) => `<tr><td>${esc(nombre)}</td><td class="num ${hay ? 'good' : 'pending'}">${hay ? 'presente' : 'ausente'}</td></tr>`).join('')}
        ${d.voz?.ultimoError ? `<tr><td>Último fallo</td><td class="num pending">${esc(d.voz.ultimoError.mensaje || d.voz.ultimoError.codigo || 'sin detalle')}</td></tr>` : ''}
      </tbody></table>
    </details>
    <details class="more" style="margin-top:12px" ${cfg.baseUrl ? 'open' : ''}>
      <summary>Entender frases totalmente libres (opcional, para quien sepa)</summary>
      <p class="small muted">La app entiende sin conexión un buen puñado de frases —poner comidas, añadir a la canasta, cuánto queda, quién no come— reconociéndolas por su forma. Para lenguaje <em>totalmente</em> libre haría falta un modelo grande, que no cabe dentro de la aplicación. Quien tenga un servidor propio puede conectarlo aquí; <strong>nadie lo necesita para usar la app</strong>.</p>
      <form data-form="ajustes-ia" class="stack">
        <label class="field"><span>Dirección del servidor</span><input name="baseUrl" type="url" value="${esc(cfg.baseUrl)}" placeholder="https://mi-servidor.ejemplo" autocomplete="off"><small>Vacío = no se usa ninguno.</small></label>
        <label class="field"><span>Token compartido (opcional)</span><input name="token" type="text" value="${esc(cfg.token)}" placeholder="Solo si tu servidor lo pide" autocomplete="off"></label>
        <p class="small muted">${esc(describeConfig(cfg))}</p>
        <div class="modal-actions"><button type="submit" class="btn btn-primary">Guardar</button></div>
      </form>
    </details>`, true);
}

/* ── Utilidades de formulario ──────────────────────────────────────────── */

function collectItems(form) {
  return [...form.querySelectorAll('[data-item-row]')].map(row => ({
    id: row.querySelector('[name="itemId"]')?.value || undefined,
    productId: row.querySelector('[name="productId"]')?.value,
    quantity: row.querySelector('[name="quantity"]')?.value,
    unit: row.querySelector('[name="unit"]')?.value,
    personId: row.querySelector('[name="personId"]')?.value || null
  })).filter(item => item.productId && item.quantity !== '');
}
// El segundo argumento no es opcional por capricho: sin él, el botón que envió
// el formulario no entra en los datos, y dos botones con el mismo `name` y
// distinto `value` —«guardar a medias» y «terminar»— se vuelven indistinguibles.
const formValues = (form, submitter = null) => new FormData(form, submitter);
const selected = (form, name) => [...form.querySelectorAll(`[name="${name}"]:checked`)].map(input => input.value);

function closeModal() {
  // Cerrar la ventana mientras el micrófono escucha tiene que apagarlo: si no,
  // el motor sigue vivo detrás y el siguiente dictado arranca sobre el anterior.
  if (['bulk', 'chat'].includes(ui.modal?.type)) cancelarDictado();
  ui.modal = null;
  render();
}
function openModal(type, extras = {}) { ui.modal = { type, ...extras }; render(); }
function sidebarOnMobile() { return window.matchMedia('(max-width: 700px)').matches; }
function closeSidebar() {
  if (sidebarOnMobile()) ui.drawerOpen = false;
  else {
    ui.sidebarCollapsed = true;
    try { localStorage.setItem(SIDEBAR_KEY, '1'); } catch { /* La preferencia es opcional. */ }
  }
  render();
  document.querySelector(sidebarOnMobile() ? '.mobile-brand .menu-toggle' : '.desktop-menu-toggle')?.focus();
}
function toggleSidebar() {
  if (sidebarOnMobile()) ui.drawerOpen = !ui.drawerOpen;
  else {
    ui.sidebarCollapsed = !ui.sidebarCollapsed;
    try { localStorage.setItem(SIDEBAR_KEY, ui.sidebarCollapsed ? '1' : '0'); } catch { /* La preferencia es opcional. */ }
  }
  render();
  document.querySelector(sidebarOnMobile() ? (ui.drawerOpen ? '.sidebar-close' : '.mobile-brand .menu-toggle') : (ui.sidebarCollapsed ? '.desktop-menu-toggle' : '.sidebar-close'))?.focus();
}

// Para el «+»: la comida de hoy que todavía no se ha decidido, o el desayuno.
function proximaComidaLibre() {
  const hora = new Date().getHours();
  const preferida = hora < 10 ? 'desayuno' : hora < 16 ? 'almuerzo' : 'cena';
  const orden = [preferida, ...SLOTS.filter(slot => slot !== preferida)];
  return orden.find(slot => !planFor(state, today, slot)) || preferida;
}

/* ── Reparto de clics ──────────────────────────────────────────────────── */

document.addEventListener('click', event => {
  if (event.target.matches('[data-overlay]')) { closeModal(); return; }
  const el = event.target.closest('[data-action]'); if (!el) return;
  const action = el.dataset.action;
  try {
    // Las pantallas que viven en su propio archivo traen sus propias acciones.
    if (SETUP_ACTIONS[action]) {
      SETUP_ACTIONS[action](el, ctx());
      // Salir del onboarding hacia el plan del mes tiene que abrirlo igual que
      // entrar por la barra de abajo; si no, el mes queda sin estrenar y el
      // aviso de «ya está preparado» aparecería más tarde y fuera de sitio.
      if (ui.page === 'mes' && abrirMesSiHaceFalta(ctx(), ui.mes.month)) commit('');
      return;
    }
    if (CHAT_ACTIONS[action]) { CHAT_ACTIONS[action](el, { ...ctx(), chat: ui.chat }); return; }
    if (BULK_ACTIONS[action]) { BULK_ACTIONS[action](el, { ...ctx(), bulk: ui.bulk }); return; }
    if (MES_ACTIONS[action]) { MES_ACTIONS[action](el, ctx()); return; }
    if (COMPRA_ACTIONS[action]) { COMPRA_ACTIONS[action](el, ctx()); return; }
    if (MAS_ACTIONS[action]) { MAS_ACTIONS[action](el, ctx()); return; }

    // Un atajo puede pedir que la app se sitúe antes en la pantalla donde se
    // verá el resultado de lo que se está por escribir.
    if (el.dataset.goto) { ui.page = el.dataset.goto; if (ui.page === 'mes') abrirMesSiHaceFalta(ctx(), ui.mes.month); }

    if (action === 'navigate') {
      // Salir de la revisión con el micrófono abierto lo dejaría escuchando
      // detrás de una pantalla que ya no se ve.
      if (ui.page === 'revision' && ui.mas.revisionEscuchando) { cancelarDictado(); ui.mas.revisionEscuchando = false; }
      ui.page = el.dataset.page;
      if (el.dataset.month) { ui.mas.canastaMes = el.dataset.month; ui.mas.canastaVista = 'cambios'; }
      if (ui.page === 'mes') abrirMesSiHaceFalta(ctx(), ui.mes.month);
      ui.modal = null; ui.drawerOpen = false;
      commit('');
    }
    else if (action === 'open-quick') openModal('quick');
    else if (action === 'rapida-comida') openModal('meal', { date: today, slot: proximaComidaLibre() });
    else if (action === 'open-chat') { ui.chat = ui.chat || emptyChat(); openModal('chat'); }
    else if (action === 'open-bulk') { ui.bulk = emptyBulk(el.dataset.destino || 'habitual'); ui.bulk.mes = el.dataset.month || ui.mas.canastaMes; openModal('bulk'); }
    else if (action === 'welcome-demo') { ui.welcome = false; ui.page = TOUR_STEPS[0].page; ui.tour = 0; commit('Este es un ejemplo. Puedes borrarlo cuando quieras.'); }
    // Empezar de cero lleva directo a organizar la casa: es lo único que hay
    // que hacer para que la app sirva, y de ahí sale todo lo demás.
    else if (action === 'welcome-empty') { state = createEmptyState(); ui.welcome = false; ui.tour = null; ui.modal = null; ui.setup = emptySetup(); ui.page = 'setup'; commit(''); }
    else if (action === 'dismiss-start') { ui.justStarted = false; render(); }
    else if (action === 'open-tour') { ui.justStarted = false; ui.modal = null; goTour(0); }
    else if (action === 'tour-prev') goTour(Math.max(0, ui.tour - 1));
    else if (action === 'tour-next') { if (ui.tour + 1 < TOUR_STEPS.length) goTour(ui.tour + 1); else { ui.tour = null; render(); toast('Listo. Puedes volver a verlo desde Más → Ajustes.'); } }
    else if (action === 'tour-skip') { ui.tour = null; render(); }
    else if (action === 'toggle-sidebar') toggleSidebar();
    else if (action === 'close-sidebar') closeSidebar();
    else if (action === 'close-modal') closeModal();
    else if (action === 'open-meal') openModal('meal', { date: el.dataset.date, slot: el.dataset.slot });
    else if (action === 'open-recipe') openModal('recipe', { id: el.dataset.id });
    else if (action === 'open-person') openModal('person', { id: el.dataset.id });
    else if (action === 'open-product') openModal('product', { id: el.dataset.id });
    else if (action === 'open-equivalence') openModal('equivalence', { id: el.dataset.id });
    else if (action === 'open-merge') openModal('merge', { id: el.dataset.id });
    else if (action === 'open-link') openModal('link', { id: el.dataset.id });
    else if (action === 'open-move') openModal('move', { id: el.dataset.id });
    else if (action === 'open-copy') openModal('copy', { id: el.dataset.id });
    else if (action === 'open-purchase') openModal('purchase');
    // Los dos destinos a los que manda la asistente cuando no entiende una
    // frase de canasta o de rutina: el sitio donde eso se escribe a mano.
    else if (action === 'open-basket') { ui.page = 'canasta'; ui.mas.canastaVista = 'habitual'; ui.modal = null; render(); }
    else if (action === 'open-routine') openModal('rutina', { month: ui.mes.month });
    else if (action === 'open-new-review') openModal('new-review');
    else if (action === 'open-correction') openModal('correction', { id: el.dataset.id });
    else if (action === 'open-absence') openModal('absence');
    else if (action === 'open-import') openModal('import');
    else if (action === 'open-alcance') openModal('alcance-comida', { id: el.dataset.id, accion: 'quitar' });
    else if (action === 'alcance-elegido') aplicarPorAlcance(el.dataset.id, el.dataset.alcance);
    else if (action === 'review-mode') { const review = state.reviews.find(item => item.id === el.dataset.id); if (review && review.status === 'draft') { review.mode = el.dataset.mode; commit(''); } }
    else if (action === 'select-review') { ui.reviewId = el.dataset.id; ui.correctingReview = false; ui.page = 'revision'; render(); }
    else if (action === 'toggle-correct-review') { ui.correctingReview = !ui.correctingReview; render(); }
    else if (action === 'canasta-promover') {
      promoteToHabitual(state, el.dataset.month, [el.dataset.id]);
      commit(`«${productName(el.dataset.id)}» pasa a tu canasta habitual. Desde el mes siguiente aparece solo.`);
    }
    else if (action === 'canasta-quitar-cambio') { removeMonthChange(state, el.dataset.month, el.dataset.id); commit('Ese cambio se quitó; vuelve a ser como siempre.'); }
    else if (action === 'canasta-quitar') {
      const fila = el.closest('.canasta-fila');
      const campo = fila?.querySelector('.canasta-cantidad');
      if (campo) { campo.value = ''; campo.dataset.quitado = '1'; fila.classList.add('quitada'); }
      toast('Se quitará al guardar.');
    }
    else if (action === 'mark-status') { setStatusPlan(state, el.dataset.date, el.dataset.slot, el.dataset.kind); ui.modal = null; commit('Comida marcada.'); }
    // «Ese día salimos» es una frase sobre el día, no sobre tres comidas. Lo que
    // ya tuviera plan se respeta salvo que la persona diga que lo reemplace: un
    // paseo por la tarde no borra el desayuno que ya estaba decidido.
    else if (action === 'mark-day') {
      const fecha = el.dataset.date;
      const ocupadas = SLOTS.filter(slot => planFor(state, fecha, slot) && planFor(state, fecha, slot).kind !== 'unplanned');
      const reemplazar = ocupadas.length
        ? window.confirm(`Ese día ya tiene ${ocupadas.length} comida(s) decidida(s) (${ocupadas.map(cap).join(', ')}).\n\nAceptar: se cambian también.\nCancelar: se quedan y solo marco las que faltan.`)
        : false;
      let puestas = 0;
      for (const slot of SLOTS) {
        const antes = planFor(state, fecha, slot);
        if (antes && antes.kind !== 'unplanned' && !reemplazar) continue;
        if (antes) deletePlanSeguro(antes.id, true);
        setStatusPlan(state, fecha, slot, el.dataset.kind);
        puestas++;
      }
      ui.modal = null;
      commit(puestas ? `${puestas} comida(s) de ese día quedaron fuera de casa.` : 'Ese día ya estaba decidido entero.');
    }
    else if (action === 'replace-status') {
      const hijos = dependents(state, el.dataset.id);
      if (hijos.length && !window.confirm(`De esta comida se aparta una parte para ${hijos.length} comida(s). Cambiarla también las quitará. ¿Continuar?`)) return;
      const antigua = state.plans.find(item => item.id === el.dataset.id);
      deletePlanSeguro(antigua.id, true);
      setStatusPlan(state, antigua.date, antigua.slot, el.dataset.kind);
      ui.modal = null; commit('Comida cambiada.');
    }
    else if (action === 'delete-plan') {
      const hijos = dependents(state, el.dataset.id);
      if (hijos.length && !window.confirm(`De esta comida se aparta una parte para ${hijos.length} comida(s). Si la quitas, esas también se van. ¿Continuar?`)) return;
      deletePlanSeguro(el.dataset.id, true);
      ui.modal = null; commit('Comida quitada.');
    }
    else if (action === 'delete-recipe') {
      if (!window.confirm('¿Quitar esta preparación? Las comidas que ya estén puestas se quedan con sus cantidades.')) return;
      const rutinas = (state.mealRoutines || []).filter(rutina => rutina.recipeId === el.dataset.id);
      state.recipes = state.recipes.filter(item => item.id !== el.dataset.id);
      for (const rutina of rutinas) rutina.active = false;
      commit(rutinas.length ? `Preparación quitada. ${rutinas.length} rutina(s) que la usaban dejaron de repetirse.` : 'Preparación quitada.');
    }
    else if (action === 'add-item') { const lista = el.closest('form').querySelector(`[data-item-list="${el.dataset.type}"]`); lista?.insertAdjacentHTML('beforeend', itemRow({}, el.dataset.type)); }
    else if (action === 'fill-habitual') traerCantidadesHabituales(el);
    else if (action === 'remove-item') el.closest('[data-item-row]')?.remove();
    else if (action === 'clear-demo') {
      if (!window.confirm('¿Borrar todos los datos de esta app en este aparato? No se puede deshacer sin una copia guardada.')) return;
      state = createEmptyState(); loadError = ''; ui.modal = null; ui.reviewId = null;
      ui.mes = emptyMes(mesActual); ui.compra = emptyCompra(mesActual); ui.mas = emptyMas();
      ui.page = 'hoy';
      commit('Datos borrados. Ya puedes empezar con los tuyos.');
    }
    else if (action === 'export') {
      const blob = new Blob([exportState(state)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `que-comemos-respaldo-${today}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      // Se anota la fecha porque el respaldo automático de Android está
      // apagado a propósito: esta copia es la única red que hay, y la app tiene
      // que poder decir cuándo fue la última en vez de esperar a que se note.
      state.settings = { ...(state.settings || {}), lastBackupAt: today };
      commit('Copia descargada. Guárdala donde no dependa de este teléfono.');
    }
    else if (action === 'remove-absence') { setAbsence(state, el.dataset.date, el.dataset.slot, el.dataset.id, false); commit('Ausencia quitada.'); }
    else if (action === 'toggle-manual') { const item = state.manualItems.find(row => row.id === el.dataset.id); item.done = el.checked; commit(''); }
    else if (action === 'delete-manual') { state.manualItems = state.manualItems.filter(row => row.id !== el.dataset.id); commit('Quitado de la lista.'); }
  } catch (error) { toast(error.message, true); }
});

// `deletePlan` vive en model.js; esto solo centraliza el borrado en cascada para
// no repetir la comprobación de comidas dependientes en cada sitio.
function deletePlanSeguro(id, cascade = false) {
  const hijos = cascade ? dependents(state, id) : [];
  for (const hijo of hijos) state.plans = state.plans.filter(plan => plan.id !== hijo.id);
  state.plans = state.plans.filter(plan => plan.id !== id);
}

// Tocar una comida que viene de una rutina obliga a preguntar hasta dónde llega
// el cambio, tanto si se quita como si se edita. Suponerlo destruiría el trabajo
// de alguien sin avisar: cambiar el desayuno del martes no es lo mismo que
// cambiar todos los martes del año.
function aplicarPorAlcance(planId, alcance) {
  const plan = state.plans.find(item => item.id === planId);
  if (!plan) return;
  const quitando = ui.modal?.accion === 'quitar';
  const desde = alcance === 'siguientes' ? plan.date : '0000-00-00';
  const afectadas = alcance === 'sola'
    ? [plan]
    : state.plans.filter(item => item.routineId === plan.routineId && item.date >= desde);

  if (quitando) {
    if (alcance !== 'sola' && !window.confirm(`Se van a quitar ${afectadas.length} comida(s). ¿Continuar?`)) return;
    for (const item of [...afectadas]) deletePlanSeguro(item.id, true);
    if (alcance === 'todas') {
      const rutina = (state.mealRoutines || []).find(item => item.id === plan.routineId);
      if (rutina) rutina.active = false;
    }
    ui.modal = null;
    commit(alcance === 'sola' ? 'Quitada solo esta fecha. La rutina sigue igual.'
      : alcance === 'todas' ? 'Rutina quitada junto con sus comidas.'
      : `${afectadas.length} comida(s) quitadas de aquí en adelante.`);
    return;
  }

  // Editar: los cambios quedaron guardados al abrir esta ventana.
  const cambios = ui.modal?.cambios;
  if (!cambios) { ui.modal = null; render(); return; }
  if (alcance !== 'sola' && !window.confirm(`Se van a cambiar ${afectadas.length} comida(s). ¿Continuar?`)) return;
  for (const item of afectadas) {
    updatePlan(state, item.id, {
      title: cambios.title,
      note: cambios.note,
      // Los participantes y los alimentos se copian solo a esta fecha: en otra
      // puede haber alguien ausente, y forzarlo rompería esa comida.
      participants: item.id === plan.id ? cambios.participants : item.participants,
      items: item.id === plan.id ? cambios.items : item.items
    });
    // Una fecha que se aparta deja de seguir la rutina; si no, la próxima vez
    // que se aplique volvería a pisarla.
    if (alcance === 'sola') item.routineId = null;
  }
  ui.modal = null;
  commit(alcance === 'sola' ? 'Cambiada solo esta fecha. La rutina sigue igual.'
    : alcance === 'todas' ? `Cambiadas las ${afectadas.length} comidas de la rutina.`
    : `${afectadas.length} comida(s) cambiadas de aquí en adelante.`);
}

function traerCantidadesHabituales(el) {
  const form = el.closest('form');
  const lista = form.querySelector('[data-item-list="ingredient"]');
  const marcadas = selected(form, 'covers');
  const personas = state.people.filter(person => (!marcadas.length || marcadas.includes(person.id)) && person.habitual?.length);
  const totales = new Map();
  for (const persona of personas) for (const fila of persona.habitual) {
    const clave = `${fila.productId}|${fila.unit}`;
    totales.set(clave, (totales.get(clave) || 0) + Number(fila.quantity));
  }
  if (!totales.size) throw new Error(marcadas.length ? 'Las personas marcadas no tienen cantidades guardadas.' : 'Todavía no hay cantidades habituales guardadas en Familia.');
  const escrito = [...lista.querySelectorAll('[data-item-row]')].some(row => row.querySelector('[name="productId"]')?.value);
  if (escrito && !window.confirm('Se reemplazará lo escrito por la suma de las cantidades habituales. ¿Continuar?')) return;
  lista.innerHTML = [...totales].map(([clave, total]) => {
    const [productId, unit] = clave.split('|');
    return itemRow({ productId, quantity: Math.round(total * 1000) / 1000, unit });
  }).join('');
  toast(`${totales.size} alimento(s) sumados de ${personas.length} persona(s).`);
}

/* ── Cambios y escritura ───────────────────────────────────────────────── */

document.addEventListener('change', event => {
  const el = event.target;
  if (el.id === 'compra-desde') { ui.compra.desde = el.value; render(); }
  if (el.id === 'compra-hasta') { ui.compra.hasta = el.value; render(); }
  if (el.id === 'assign-recipe') {
    const receta = state.recipes.find(item => item.id === el.value);
    const form = el.closest('form');
    form.querySelectorAll('[name="participants"]').forEach(input => input.checked = !input.disabled && (receta?.covers.length ? receta.covers.includes(input.value) : true));
  }
  if (['date', 'slot'].includes(el.name) && el.closest('[data-form="absence"]')) {
    const form = el.closest('form'), date = form.querySelector('[name="date"]').value, slot = form.querySelector('[name="slot"]').value;
    form.querySelectorAll('[name="absent"]').forEach(input => input.checked = isAbsent(state, date, slot, input.value));
  }
  if (el.name === 'productId' && el.closest('[data-item-row]')) {
    const fila = el.closest('[data-item-row]');
    const item = product(state, el.value);
    if (item) fila.querySelector('[name="unit"]').value = fila.closest('[data-item-list="purchase"]') ? item.purchaseUnit : item.controlUnit;
  }
  if (el.name === 'productId' && el.closest('[data-form="correction"]')) el.form.querySelector('[name="actual"]').value = inventoryNow(state)[el.value] || 0;
  // El grosor solo aparece en lo que se corta; se oculta sin volver a dibujar
  // el formulario para no perder lo ya escrito.
  if (el.name === 'controlUnit' && el.closest('[data-form="product"]')) { const campo = el.form.querySelector('[data-cut-field]'); if (campo) campo.hidden = !SLICEABLE.includes(el.value); }
  // Elegir «una preparación» o «fuera de casa» enseña u oculta el selector.
  if (el.name === 'kind' && el.closest('[data-form="rutina"]')) { const campo = el.form.querySelector('[data-rutina-receta]'); if (campo) campo.hidden = el.value !== 'recipe'; }
});

let filtroTimer;
document.addEventListener('input', event => {
  // Los dos buscadores se comportan igual: filtran mientras se teclea, con un
  // respiro para no repintar por letra, y devuelven el foco y el cursor donde
  // estaban. Antes el del catálogo inicial era un `change`, así que no pasaba
  // nada hasta pulsar Intro o salir del campo.
  const buscadores = {
    'alimento-filtro': valor => { ui.mas.filtroAlimento = valor; },
    'revision-filtro': valor => { ui.mas.revisionFiltro = valor; },
    'setup-buscar': valor => { ui.setup.busqueda = valor; }
  };
  const escribir = buscadores[event.target.id];
  if (escribir) {
    const campoId = event.target.id;
    escribir(event.target.value);
    clearTimeout(filtroTimer);
    filtroTimer = setTimeout(() => {
      const pos = event.target.selectionStart;
      render();
      const campo = document.getElementById(campoId);
      if (campo) { campo.focus(); campo.setSelectionRange(pos, pos); }
    }, 160);
    return;
  }
  // Un mismo alimento registrado dos veces parte su inventario en dos, y eso se
  // descubre semanas después, cuando las cuentas no cuadran. Avisar mientras se
  // escribe es mucho más barato que unirlos luego.
  if (event.target.matches('[data-dedup]')) {
    const caja = event.target.form?.querySelector('[data-dedup-warning]');
    if (!caja) return;
    const parecidos = findSimilarProducts(state, event.target.value, { limit: 2, exclude: event.target.form.dataset.id || null });
    caja.innerHTML = parecidos.length
      ? `<div class="notice warn"><span>?</span><div><strong>Ya tienes algo parecido: «${esc(parecidos[0].product.name)}».</strong>Si es el mismo, cierra esto y edítalo desde la lista en vez de crear otro.</div></div>`
      : '';
    return;
  }
  const input = event.target;
  if (!input.name?.startsWith('consume-')) return;
  const fila = input.closest('[data-review-product]');
  const celda = fila?.querySelector('.revision-derivado');
  if (!celda) return;
  const queda = fila.dataset.mode === 'restante';
  if (input.value === '') { celda.textContent = 'pendiente'; celda.className = 'revision-derivado remaining pending'; return; }
  const derivado = Number(fila.dataset.available) - Number(input.value);
  const excede = derivado < 0;
  celda.textContent = excede ? (queda ? 'queda más de lo que había anotado' : 'revisa la cantidad') : `${queda ? 'se consumió' : 'queda'} ${fmt(derivado)}`;
  celda.className = `revision-derivado remaining ${excede ? 'pending' : 'good'}`;
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (ui.modal) closeModal();
  else if (ui.drawerOpen) closeSidebar();
  else if (ui.tour !== null) { ui.tour = null; render(); }
});
window.addEventListener('resize', () => { if (ui.drawerOpen && !sidebarOnMobile()) { ui.drawerOpen = false; render(); } });

/* ── Formularios ───────────────────────────────────────────────────────── */

document.addEventListener('submit', async event => {
  const form = event.target.closest('[data-form]'); if (!form) return;
  event.preventDefault();
  const data = formValues(form, event.submitter), kind = form.dataset.form;
  try {
    if (SETUP_FORMS[kind]) { SETUP_FORMS[kind](form, data, ctx()); return; }
    if (CHAT_FORMS[kind]) { await CHAT_FORMS[kind](form, data, { ...ctx(), chat: ui.chat }); return; }
    if (BULK_FORMS[kind]) { await BULK_FORMS[kind](form, data, { ...ctx(), bulk: ui.bulk }); return; }
    if (MES_FORMS[kind]) { MES_FORMS[kind](form, data, ctx()); return; }
    if (COMPRA_FORMS[kind]) { COMPRA_FORMS[kind](form, data, ctx()); return; }

    if (kind === 'recipe') {
      upsertRecipe(state, { id: form.dataset.id, name: data.get('name'), uses: selected(form, 'uses'), covers: selected(form, 'covers'), servings: data.get('servings'), items: collectItems(form), note: data.get('note') });
      ui.modal = null; commit('Preparación guardada.');
    }
    else if (kind === 'person') {
      const escritas = String(data.get('pendingRestrictions') || '').split(/[,;]/).map(texto => texto.trim()).filter(Boolean);
      const persona = upsertPerson(state, { id: form.dataset.id, name: data.get('name'), restrictions: selected(form, 'restrictions'), pendingRestrictions: escritas, habitual: collectItems(form) });
      ui.modal = null;
      commit(persona.pendingRestrictions.length ? `Guardado. ${persona.pendingRestrictions.length} alimento(s) se enlazarán cuando los registres.` : 'Guardado.');
    }
    else if (kind === 'product') {
      const existente = product(state, form.dataset.id);
      const controlUnit = existente ? existente.controlUnit : data.get('controlUnit');
      const purchaseUnit = data.get('purchaseUnit') || controlUnit;
      const factor = String(data.get('factor') || '').trim();
      const item = existente || addProduct(state, { name: data.get('name'), controlUnit, purchaseUnit, category: data.get('category'), opening: data.get('opening'), slice: data.get('slice'), origin: 'manual' });
      if (existente) updateProduct(state, existente.id, { name: data.get('name'), purchaseUnit, category: data.get('category') });
      if (data.get('slice')) setSlice(state, item.id, data.get('slice'));
      if (purchaseUnit !== controlUnit && factor) setEquivalence(state, item.id, purchaseUnit, factor);
      setHabitualLine(state, item.id, data.get('monthly'), data.get('monthlyUnit'));
      ui.modal = null;
      commit('Guardado.');
    }
    else if (kind === 'canasta-habitual') {
      const lineas = [];
      for (const fila of form.querySelectorAll('.canasta-fila')) {
        const campo = fila.querySelector('.canasta-cantidad');
        const productId = campo.name.replace('cantidad-', '');
        if (campo.dataset.quitado === '1') continue;
        lineas.push({ productId, quantity: campo.value === '' ? null : campo.value, unit: fila.querySelector('.canasta-unidad').value });
      }
      setHabitualBasket(state, lineas);
      commit(`Canasta guardada con ${lineas.length} alimento(s).`);
    }
    else if (kind === 'cambio-mes') {
      const mes = form.dataset.month;
      const nombre = String(data.get('nombre') || '').trim();
      const quitar = selected(form, 'quitar');
      const paraSiempre = data.get('alcance') === 'siempre';
      let mensaje = '';
      if (nombre) {
        const existente = state.products.find(item => item.name.toLocaleLowerCase('es') === nombre.toLocaleLowerCase('es'))
          || addProduct(state, { name: nombre, controlUnit: data.get('unidad'), purchaseUnit: data.get('unidad'), category: 'otros', origin: 'manual' });
        if (paraSiempre) {
          setHabitualLine(state, existente.id, data.get('cantidad'), data.get('unidad'));
          mensaje = `«${existente.name}» entra en tu canasta habitual: aparecerá todos los meses.`;
        } else {
          setMonthChange(state, mes, existente.id, { quantity: data.get('cantidad'), unit: data.get('unidad') });
          mensaje = `«${existente.name}» solo para ${monthName(mes)}. Los demás meses no cambian.`;
        }
      }
      for (const productId of quitar) setMonthChange(state, mes, productId, { removed: true });
      if (quitar.length) mensaje += `${mensaje ? ' ' : ''}${quitar.length} alimento(s) no se comprarán este mes.`;
      if (!mensaje) throw new Error('Escribe un alimento o marca algo que quitar.');
      ui.modal = null;
      commit(mensaje);
    }
    else if (kind === 'ajuste-revision') {
      state.settings = { ...(state.settings || {}), reviewWeekday: Number(data.get('dia')) };
      commit('Guardado.');
    }
    else if (kind === 'merge') {
      const otro = data.get('otro');
      const conservar = data.get('conservar') === 'otro' ? otro : form.dataset.id;
      const eliminar = conservar === otro ? form.dataset.id : otro;
      const nombres = [productName(conservar), productName(eliminar)];
      if (!window.confirm(`Se unirá «${nombres[1]}» dentro de «${nombres[0]}». Sus existencias se suman y «${nombres[1]}» deja de existir. Esto no se puede deshacer. ¿Continuar?`)) return;
      mergeProducts(state, conservar, eliminar);
      ui.modal = null;
      commit(`«${nombres[1]}» se unió a «${nombres[0]}».`);
    }
    else if (kind === 'ajustes-ia') { writeConfig({ baseUrl: data.get('baseUrl'), token: data.get('token') }); ui.modal = null; commit('Guardado en este aparato.'); }
    else if (kind === 'equivalence') { setEquivalence(state, form.dataset.id, data.get('unit'), data.get('factor')); ui.modal = null; commit('Guardado.'); }
    else if (kind === 'assign') {
      const receta = data.get('recipeId');
      if (data.get('repetir') === 'rutina') {
        ui.modal = { type: 'rutina', month: String(data.get('date')).slice(0, 7), receta, slot: data.get('slot') };
        render();
        return;
      }
      makeRecipePlan(state, receta, data.get('date'), data.get('slot'), selected(form, 'participants'));
      ui.modal = null; commit('Comida puesta.');
    }
    else if (kind === 'plan') {
      const plan = state.plans.find(item => item.id === form.dataset.id);
      const cambios = {
        title: data.get('title'),
        note: data.get('note'),
        participants: selected(form, 'participants'),
        items: collectItems(form).map(item => ({ ...item, id: item.id || nextId(state, 'alimento'), quantity: quantity(item.quantity) }))
      };
      // Si esta comida la puso una rutina, no se guarda a ciegas: se pregunta
      // primero si el cambio es de este día o de toda la costumbre.
      if (plan.routineId) { ui.modal = { type: 'alcance-comida', id: plan.id, accion: 'editar', cambios }; render(); return; }
      updatePlan(state, plan.id, cambios);
      ui.modal = null; commit('Guardado.');
    }
    else if (kind === 'link') {
      const origen = state.plans.find(item => item.id === form.dataset.id);
      const reparto = Object.fromEntries(origen.items.map(item => [item.id, data.get(`reserve-${item.id}`)]));
      linkPlan(state, origen.id, data.get('date'), data.get('slot'), reparto, collectItems(form), selected(form, 'participants'));
      ui.modal = null; commit('Apartado. La compra no se cuenta dos veces.');
    }
    else if (kind === 'move-copy') {
      if (form.dataset.operation === 'move') movePlan(state, form.dataset.id, data.get('date'), data.get('slot'));
      else copyPlan(state, form.dataset.id, data.get('date'), data.get('slot'));
      ui.modal = null; commit(form.dataset.operation === 'move' ? 'Movida.' : 'Copiada.');
    }
    else if (kind === 'purchase') {
      addPurchase(state, { date: data.get('date'), period: periodoDeCompra(ui.compra), basis: ui.compra.base, lines: collectItems(form) });
      ui.modal = null; commit('Compra guardada. Las existencias subieron.');
    }
    else if (kind === 'new-review') {
      const fecha = data.get('date');
      const abierta = state.reviews.find(item => item.date === fecha && item.status === 'draft');
      const revision = abierta || createReview(state, fecha);
      ui.reviewId = revision.id; ui.correctingReview = false; ui.modal = null; ui.page = 'revision';
      commit(abierta ? 'Sigues la revisión que tenías a medias.' : 'Revisión abierta.');
    }
    else if (kind === 'review') {
      const revision = state.reviews.find(item => item.id === form.dataset.id);
      const valores = Object.fromEntries(revision.productIds.map(id => [id, data.get(`consume-${id}`)]));
      const intencion = event.submitter?.value || 'save';
      if (intencion === 'correct') { correctReview(state, revision.id, valores); ui.correctingReview = false; commit('Corregida. Las cuentas se rehicieron.'); }
      else { saveReview(state, revision.id, valores, intencion === 'confirm'); commit(intencion === 'confirm' ? 'Listo. El consumo se descontó una sola vez.' : 'Guardada a medias. Puedes seguir cuando quieras.'); }
    }
    else if (kind === 'correction') { correctStock(state, data.get('productId'), data.get('actual'), data.get('reason')); ui.modal = null; commit('Corregido.'); }
    else if (kind === 'absence') {
      const fecha = data.get('date'), slot = data.get('slot');
      for (const persona of state.people) setAbsence(state, fecha, slot, persona.id, selected(form, 'absent').includes(persona.id));
      ui.modal = null; commit('Guardado.');
    }
    else if (kind === 'manual-item') {
      const nombre = String(data.get('name') || '').trim();
      if (!nombre) throw new Error('Escribe qué hay que anotar.');
      state.manualItems.push({ id: nextId(state, 'otro'), name: nombre, quantity: String(data.get('quantity') || '').trim(), done: false });
      commit('Anotado.');
    }
    else if (kind === 'import') {
      const archivo = data.get('file');
      if (!archivo?.size) throw new Error('Elige un archivo.');
      const traido = importState(await archivo.text());
      if (!window.confirm('¿Reemplazar todo lo que hay ahora con esta copia?')) return;
      state = traido; loadError = ''; ui.modal = null; ui.reviewId = null;
      ui.mes = emptyMes(mesActual); ui.compra = emptyCompra(mesActual); ui.mas = emptyMas();
      commit('Copia traída.');
    }
  } catch (error) { toast(error.message, true); }
});

/* ── Arranque ──────────────────────────────────────────────────────────── */

// El mes corriente se abre en cuanto arranca la app, no cuando alguien entra en
// Plan mensual: así la pantalla de Hoy ya encuentra las comidas puestas.
if (!ui.welcome) {
  try { if (abrirMesSiHaceFalta(ctx(), mesActual)) saveState(state); } catch { /* Sin rutinas no hay nada que aplicar. */ }
}
render();

// El trabajador de servicio permite instalar la app y abrirla sin conexión. El
// navegador solo lo acepta en contexto seguro (https o localhost); sobre http en
// una IP de la red local lo ignora y la app sigue funcionando como página.
//
// Dentro del APK no se registra: ahí los archivos ya viajan en la aplicación, y
// un caché viejo podría seguir sirviendo la versión anterior tras actualizarla.
if ('serviceWorker' in navigator && !globalThis.Capacitor) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* Sin contexto seguro no hay instalación; no es un error de la app. */ }));
}
