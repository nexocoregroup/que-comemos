import { SLOTS, UNITS, addDays, addProduct, addPurchase, convert, copyPlan, correctReview, correctStock, createEmptyState, createReview, dateRange, deletePlan, deleteRecipe, dependents, exportState, generateMonth, incompatibleItems, inventoryNow, isAbsent, lastStockReview, linkPlan, makeRecipePlan, monthBounds, movePlan, nextId, planFor, product, quantity, repeatWeek, reservedQuantity, reviewAvailability, saveReview, setAbsence, setEquivalence, setStatusPlan, shoppingList, syncReviewProducts, todayISO, updatePlan, upsertPerson, upsertRecipe, weekStart, importState } from './model.js';
import { hasSavedState, loadState, saveState } from './storage.js';
import { BRAND_MARK } from './brand.js';
import { TOUR_STEPS, WELCOME } from './onboarding.js';

const firstRun = !hasSavedState();
let state, loadError = '';
try { state = loadState(); } catch (error) { state = createEmptyState(); loadError = error.message; }
const today = todayISO();
const SIDEBAR_KEY = 'que-comemos-sidebar-collapsed';
const sidebarInitiallyCollapsed = (() => { try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; } })();
const ui = { page: 'hoy', menuDate: today, menuMode: 'week', shopMonth: today.slice(0, 7), shopKind: Number(today.slice(8)) <= 15 ? 'first' : 'second', customStart: today, customEnd: addDays(today, 14), modal: null, reviewId: null, correctingReview: false, generationResult: null, sidebarCollapsed: sidebarInitiallyCollapsed, drawerOpen: false, welcome: firstRun, tour: null };
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const fmt = value => new Intl.NumberFormat('es-DO', { maximumFractionDigits: 3 }).format(Number(value || 0));
const cap = value => value.charAt(0).toUpperCase() + value.slice(1);
const niceDate = (date, options = { weekday: 'long', day: 'numeric', month: 'long' }) => new Intl.DateTimeFormat('es-DO', options).format(new Date(`${date}T12:00:00`));
const monthName = month => cap(new Intl.DateTimeFormat('es-DO', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`)));
const personName = id => state.people.find(person => person.id === id)?.name || 'Persona eliminada';
const productName = id => product(state, id)?.name || 'Producto eliminado';
const unitText = (unit, amount) => amount > 0 && amount <= 1 ? unit : ({ unidad: 'unidades', taza: 'tazas', lata: 'latas', paquete: 'paquetes', rueda: 'ruedas', rebanada: 'rebanadas' }[unit] || unit);
const measure = (amount, unit) => `${fmt(amount)} ${esc(unitText(unit, amount))}`;
const itemText = item => `${measure(item.quantity, item.unit)} · ${esc(productName(item.productId))}`;
const planTitle = plan => plan.kind === 'recipe' || plan.kind === 'linked' ? plan.title : ({ outside: 'Fuera de casa', order: 'Pedir comida', unplanned: 'Sin planificar' }[plan.kind] || 'Sin planificar');
const button = (label, action, cls = 'btn-secondary', attrs = '') => `<button type="button" class="btn ${cls}" data-action="${action}" ${attrs}>${label}</button>`;
const notice = (title, detail, tone = '') => `<div class="notice ${tone}"><span>✦</span><div><strong>${title}</strong>${detail ? `<span>${detail}</span>` : ''}</div></div>`;
const empty = (emoji, title, text, action = '') => `<div class="empty"><span class="emoji">${emoji}</span><h3>${title}</h3><p>${text}</p>${action}</div>`;
const nav = [ ['hoy','☀️','Hoy'], ['menu','▦','Menú'], ['compras','🧺','Compras'], ['revision','✓','Revisión'] ];
const secondary = [ ['catalogo','📖','Preparaciones'], ['personas','👨‍👩‍👧‍👦','Personas'], ['productos','⚙️','Productos y datos'] ];
let toastTimer;
function toast(message, error = false) {
  const el = document.querySelector('#toast');
  el.textContent = message; el.className = `show${error ? ' error' : ''}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = '', 4200);
}
function commit(message) { saveState(state); render(); if (message) toast(message); }
function pageTitle() { return ({ hoy: 'Hoy en casa', menu: 'Menú', compras: 'Compras', revision: 'Revisión de consumo', catalogo: 'Preparaciones', personas: 'Personas de la casa', productos: 'Productos y datos' })[ui.page]; }
function renderWelcome() {
  return `<div class="welcome-screen"><div class="welcome-card">
    <span class="welcome-mark">${BRAND_MARK}</span>
    <h1>¿Qué comemos?</h1>
    <p class="welcome-promise">${esc(WELCOME.promise)}</p>
    <ul class="welcome-points">${WELCOME.points.map(([lead, rest]) => `<li><span><strong>${esc(lead)}</strong> ${esc(rest)}</span></li>`).join('')}</ul>
    <div class="welcome-actions">${button('Ver el ejemplo', 'welcome-demo', 'btn-primary')}${button('Empezar desde cero', 'welcome-empty', 'btn-secondary')}</div>
    <p class="welcome-note">${esc(WELCOME.note)}</p>
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
// El recorrido lleva la app a la página del paso; después el usuario puede
// navegar libremente sin que la tarjeta lo devuelva a la fuerza.
function goTour(index) {
  ui.tour = index; ui.page = TOUR_STEPS[index].page; ui.modal = null; ui.drawerOpen = false;
  render();
}
function render() {
  document.body.classList.toggle('menu-open', ui.drawerOpen);
  document.body.classList.toggle('tour-open', ui.tour !== null);
  if (ui.welcome) {
    document.querySelector('#app').innerHTML = renderWelcome();
    document.querySelector('#modal-root').innerHTML = '';
    return;
  }
  document.querySelector('#app').innerHTML = `<div class="shell ${ui.sidebarCollapsed ? 'sidebar-collapsed' : ''} ${ui.drawerOpen ? 'drawer-open' : ''}">
    <aside class="sidebar" id="app-sidebar" aria-label="Menú lateral"><div class="sidebar-head"><button type="button" class="icon-btn sidebar-close" data-action="close-sidebar" aria-label="Ocultar menú">‹</button><div class="brand"><span class="brand-mark">${BRAND_MARK}</span>¿Qué comemos?</div></div>
      <nav class="nav" aria-label="Navegación principal">${nav.map(([id, icon, label]) => `<button type="button" class="${ui.page === id ? 'active' : ''}" data-action="navigate" data-page="${id}"><span class="nav-icon">${icon}</span>${label}</button>`).join('')}</nav>
      <nav class="secondary" aria-label="Configuración">${secondary.map(([id, icon, label]) => `<button type="button" class="${ui.page === id ? 'active' : ''}" data-action="navigate" data-page="${id}"><span class="nav-icon">${icon}</span>${label}</button>`).join('')}</nav>
      <div class="side-foot">Datos guardados solo en este navegador y dispositivo. Exporta un respaldo periódicamente.</div>
    </aside><button type="button" class="drawer-scrim" data-action="close-sidebar" aria-label="Cerrar menú lateral"></button><main class="main"><div class="mobile-brand"><button type="button" class="menu-toggle" data-action="toggle-sidebar" aria-label="${ui.drawerOpen ? 'Ocultar menú' : 'Abrir menú'}" aria-controls="app-sidebar" aria-expanded="${ui.drawerOpen}">☰</button><span class="brand-mark">${BRAND_MARK}</span><span>¿Qué comemos?</span></div>
      <header class="topline"><div class="topline-heading"><button type="button" class="menu-toggle desktop-menu-toggle" data-action="toggle-sidebar" aria-label="${ui.sidebarCollapsed ? 'Abrir menú' : 'Ocultar menú'}" aria-controls="app-sidebar" aria-expanded="${!ui.sidebarCollapsed}">☰</button><div><p class="eyebrow">Organización de comidas</p><h1>${pageTitle()}</h1></div></div><div class="top-actions">${ui.page !== 'productos' ? button('⚙️ Ajustes', 'navigate', 'btn-secondary btn-small', 'data-page="productos"') : ''}</div></header>
      ${loadError ? notice('No se pudieron leer los datos guardados.', `${esc(loadError)} Importa un respaldo o borra los datos del navegador desde Productos y datos.`, 'error') : ''}
      ${state.demo ? `<div class="demo-banner"><span>✦</span><div><strong>Estás viendo datos de demostración</strong>Las cantidades son solo ejemplos para probar el flujo; no son recomendaciones de alimentación.</div>${button('Borrar ejemplos', 'clear-demo', 'btn-secondary btn-small')}</div>` : ''}
      ${({ hoy: renderToday, menu: renderMenu, compras: renderShopping, revision: renderReviews, catalogo: renderCatalog, personas: renderPeople, productos: renderProducts })[ui.page]()}
    </main><nav class="mobile-nav" aria-label="Navegación principal">${nav.map(([id, icon, label]) => `<button type="button" class="${ui.page === id ? 'active' : ''}" data-action="navigate" data-page="${id}"><span>${icon}</span>${label}</button>`).join('')}</nav></div>`;
  document.querySelector('#modal-root').innerHTML = ui.modal ? renderModal() : ui.tour === null ? '' : tourCard();
}
function servings(plan) {
  if (!plan || !['recipe', 'linked'].includes(plan.kind)) return '';
  if (plan.kind === 'linked') {
    const source = state.plans.find(item => item.id === plan.sourceId);
    return `<div class="hint">Parte reservada de ${esc(source?.title || 'una preparación eliminada')} · preparada el ${esc(source ? niceDate(source.date, { day: 'numeric', month: 'short' }) : '—')}.</div>
      <ul class="food-list">${(plan.reservedItems || []).map(row => { const item = source?.items.find(i => i.id === row.sourceItemId); return item ? `<li>${fmt(row.quantity)} ${esc(item.unit)} de ${esc(productName(item.productId))}${item.personId ? ` · para ${esc(personName(item.personId))}` : ''}</li>` : '<li>Reserva sin alimento de origen</li>'; }).join('')}</ul>
      ${plan.items.length ? `<p class="small strong">Además, preparar ahora:</p>${foodList(plan.items)}` : ''}`;
  }
  const prepared = plan.items.map(item => {
    const reserved = reservedQuantity(state, plan.id, item.id);
    const served = Math.max(0, item.quantity - reserved);
    return `<li><span><strong>${measure(served, item.unit)}</strong> de ${esc(productName(item.productId))}${item.personId ? ` · para ${esc(personName(item.personId))}` : ''}${reserved ? `<br><span class="muted">Preparar ${fmt(item.quantity)}; reservar ${measure(reserved, item.unit)} para otra comida.</span>` : ''}</span></li>`;
  }).join('');
  const children = dependents(state, plan.id);
  return `<ul class="food-list">${prepared}</ul>${children.length ? `<div class="hint">Reserva vinculada: ${children.map(child => `${cap(child.slot)} del ${niceDate(child.date, { day: 'numeric', month: 'short' })}`).join(', ')}. La compra se cuenta el día de esta preparación.</div>` : ''}`;
}
function foodList(items) { return `<ul class="food-list">${items.map(item => `<li>${itemText(item)}${item.personId ? ` · para ${esc(personName(item.personId))}` : ''}</li>`).join('')}</ul>`; }
function mealCard(slot, date, editable = true) {
  const plan = planFor(state, date, slot);
  return `<article class="card meal-card"><div class="slot">${cap(slot)}</div><div class="meal-body">${plan ? `<div class="meal-title">${esc(planTitle(plan))}</div>${['recipe','linked'].includes(plan.kind) ? `<div class="meal-people">${plan.participants.length ? `Para ${plan.participants.map(id => esc(personName(id))).join(', ')}` : 'Sin participantes indicados'}</div>${servings(plan)}${plan.note ? `<p class="small"><strong>Nota:</strong> ${esc(plan.note)}</p>` : ''}${incompatibleItems(state, plan.items, plan.participants).length ? `<p class="pill red">Revisar restricciones</p>` : ''}` : `<p class="muted small">${plan.kind === 'unplanned' ? 'Esta comida necesita una decisión.' : 'No se incluyen alimentos en la compra.'}</p>`}` : `<div class="meal-title">Aún sin plan</div><p class="muted">Elige una preparación o marca esta comida.</p>`}</div>${editable ? button(plan ? 'Ver o cambiar' : 'Planificar', 'open-meal', 'btn-secondary btn-small', `data-date="${date}" data-slot="${slot}"`) : ''}</article>`;
}
function renderToday() {
  const count = SLOTS.filter(slot => planFor(state, today, slot) && planFor(state, today, slot).kind !== 'unplanned').length;
  return `<section class="hero"><div><div class="eyebrow">${esc(niceDate(today))}</div><h2>${count === 3 ? 'Todo listo para hoy' : 'Vamos a organizar el día'}</h2><p>${count} de 3 comidas decididas</p></div>${button('Abrir menú', 'navigate', 'btn-secondary', 'data-page="menu"')}</section>
    <div class="section-head"><div><h2>Qué preparar</h2><p>Cantidades y acompañamientos de cada comida.</p></div></div>
    <div class="grid grid-3">${SLOTS.map(slot => mealCard(slot, today)).join('')}</div>
    <div class="section-head"><div><h2>Lo que sigue</h2><p>Una vista rápida de mañana.</p></div></div>
    <div class="grid grid-3">${SLOTS.map(slot => { const plan = planFor(state, addDays(today, 1), slot); return `<div class="card soft"><div class="between"><span class="pill warm">${cap(slot)}</span><span class="small muted">${niceDate(addDays(today, 1), { day: 'numeric', month: 'short' })}</span></div><h3 style="margin-top:12px">${esc(plan ? planTitle(plan) : 'Sin planificar')}</h3>${plan?.kind === 'linked' ? '<p class="small muted">Usa una parte reservada de hoy.</p>' : ''}</div>`; }).join('')}</div>`;
}
function renderMenu() {
  const start = ui.menuMode === 'week' ? weekStart(ui.menuDate) : monthBounds(ui.menuDate.slice(0, 7)).start;
  const end = ui.menuMode === 'week' ? addDays(start, 6) : monthBounds(ui.menuDate.slice(0, 7)).end;
  const label = ui.menuMode === 'week' ? `${niceDate(start, { day: 'numeric', month: 'short' })} – ${niceDate(end, { day: 'numeric', month: 'short', year: 'numeric' })}` : monthName(ui.menuDate.slice(0, 7));
  let calendar;
  if (ui.menuMode === 'week') {
    calendar = `<div class="calendar-week">${dateRange(start, end).map(date => `<div class="day-col"><div class="day-head ${date === today ? 'today' : ''}">${niceDate(date, { weekday: 'short' })}<strong>${Number(date.slice(8))}</strong></div>${SLOTS.map(slot => menuCell(date, slot)).join('')}</div>`).join('')}</div>`;
  } else {
    const offset = (new Date(`${start}T12:00:00`).getDay() + 6) % 7;
    calendar = `<div class="calendar-month">${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(day => `<div class="day-head">${day}</div>`).join('')}${Array.from({ length: offset }, () => '<div class="month-cell outside"></div>').join('')}${dateRange(start, end).map(date => `<div class="month-cell ${date === today ? 'today' : ''}"><div class="number">${Number(date.slice(8))}</div>${SLOTS.map(slot => { const plan = planFor(state, date, slot); return `<button type="button" class="month-meal ${plan ? '' : 'missing'}" data-action="open-meal" data-date="${date}" data-slot="${slot}"><span>${slot[0].toUpperCase()}</span> ${esc(plan ? planTitle(plan) : 'Agregar')}</button>`; }).join('')}</div>`).join('')}</div>`;
  }
  return `<div class="toolbar"><div class="inline">${button('‹', 'menu-prev', 'btn-secondary btn-small')}<div class="strong" style="min-width:185px;text-align:center">${esc(label)}</div>${button('›', 'menu-next', 'btn-secondary btn-small')}${button('Hoy', 'menu-today', 'btn-quiet btn-small')}</div><div class="segmented"><button type="button" data-action="menu-mode" data-mode="week" class="${ui.menuMode === 'week' ? 'active' : ''}">Semana</button><button type="button" data-action="menu-mode" data-mode="month" class="${ui.menuMode === 'month' ? 'active' : ''}">Mes</button></div></div>
    ${ui.generationResult ? notice(`${ui.generationResult.count} comidas propuestas este mes.`, ui.generationResult.unavailable.length ? `${ui.generationResult.unavailable.length} comida(s) quedaron sin una preparación compatible; decide cómo resolverlas desde el calendario.` : 'Puedes modificar cualquier comida desde el calendario.', ui.generationResult.unavailable.length ? 'warn' : '') : ''}
    <div class="card" style="padding:15px">${calendar}</div>
    <div class="section-head"><div><h2>Organizar más rápido</h2><p>La propuesta solo usa tus preparaciones y respeta las restricciones registradas.</p></div></div>
    <div class="inline">${button('✦ Proponer este mes', 'generate-month', 'btn-primary')}${button('Repetir esta semana en el mes', 'repeat-week', 'btn-secondary')}${button('Registrar ausencia', 'open-absence', 'btn-secondary')}</div>
    ${state.recipes.length ? '' : `<div style="margin-top:18px">${empty('📖','Primero crea preparaciones','Luego podrás asignarlas y generar un menú.', button('Abrir preparaciones', 'navigate', 'btn-primary', 'data-page="catalogo"'))}</div>`}`;
}
function menuCell(date, slot) {
  const plan = planFor(state, date, slot);
  return `<button type="button" class="day-cell ${plan ? '' : 'empty-cell'}" data-action="open-meal" data-date="${date}" data-slot="${slot}"><span class="mini-slot">${slot}</span><span class="mini-title">${esc(plan ? planTitle(plan) : '+ Agregar')}</span></button>`;
}
function shopPeriod() {
  if (ui.shopKind === 'custom') return { start: ui.customStart, end: ui.customEnd };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ui.shopMonth)) return { start: '', end: '' };
  const bounds = monthBounds(ui.shopMonth);
  return ui.shopKind === 'first' ? { start: bounds.start, end: `${ui.shopMonth}-15` } : { start: `${ui.shopMonth}-16`, end: bounds.end };
}
function renderShopping() {
  const period = shopPeriod();
  let list, periodError = ''; try { list = shoppingList(state, period.start, period.end); } catch (error) { periodError = error.message; list = { lines: [], missing: [], pending: [], lastReview: null, future: false }; }
  const suggested = list.lines.filter(line => line.shortfall > 0);
  const incomplete = list.missing.length || list.pending.length;
  return `<div class="card"><div class="section-head" style="margin:0 0 16px"><div><h2>Compra según el menú</h2><p>Necesario en el período menos lo que hay hoy.</p></div></div>
    <div class="shopping-period"><label class="field"><span>Período</span><select id="shop-kind"><option value="first" ${ui.shopKind === 'first' ? 'selected' : ''}>Primera quincena</option><option value="second" ${ui.shopKind === 'second' ? 'selected' : ''}>Segunda quincena</option><option value="custom" ${ui.shopKind === 'custom' ? 'selected' : ''}>Fechas personalizadas</option></select></label>
    ${ui.shopKind === 'custom' ? `<label class="field"><span>Desde</span><input id="shop-start" type="date" value="${esc(ui.customStart)}"></label><label class="field"><span>Hasta</span><input id="shop-end" type="date" value="${esc(ui.customEnd)}"></label>` : `<label class="field"><span>Mes</span><input id="shop-month" type="month" value="${esc(ui.shopMonth)}"></label>`}
    ${button('Preparar compra', 'open-purchase', 'btn-primary')}</div></div>
    ${periodError ? notice('Revisa las fechas de compra.', esc(periodError), 'error') : ''}
    <div class="section-head"><div><h2>Lista sugerida</h2><p>Existencias según compras y revisiones confirmadas.</p></div><span class="pill">${suggested.length} productos por comprar</span></div>
    ${list.lastReview ? notice('Última revisión de existencias: ' + niceDate(list.lastReview, { day: 'numeric', month: 'long', year: 'numeric' }) + '.', '') : notice('Todavía no hay una revisión confirmada.', 'La lista usa las existencias actuales. Haz una revisión para comprobar qué queda.', 'warn')}
    ${list.future ? notice('Compra para un período futuro.', 'Este cálculo usa las existencias de hoy. Actualízalas antes de comprar; el menú previsto no se descuenta como consumo real.', 'warn') : ''}
    ${suggested.length ? `<div class="card table-wrap"><table class="data-table"><thead><tr><th>Producto</th><th class="num">Necesario</th><th class="num">Disponible</th><th class="num">Por comprar</th></tr></thead><tbody>${suggested.map(line => `<tr><td><strong>${esc(productName(line.productId))}</strong>${line.purchaseQuantity === null ? '<div class="small pending">Falta equivalencia de compra</div>' : ''}</td><td class="num">${measure(line.need, product(state, line.productId).controlUnit)}</td><td class="num">${fmt(line.available)}</td><td class="num strong">${line.purchaseQuantity === null ? '—' : measure(line.purchaseQuantity, line.purchaseUnit)}</td></tr>`).join('')}</tbody></table></div>` : empty('🧺','Nada que comprar por ahora','Planifica comidas o revisa el período seleccionado para calcular cantidades.')}
    ${incomplete ? `<div class="section-head"><h2>Antes de comprar</h2></div><div class="grid grid-2">${list.pending.length ? `<div class="notice warn"><span>↔</span><div><strong>${list.pending.length} equivalencia(s) pendiente(s)</strong>${[...new Set(list.pending.map(item => `${productName(item.productId)}: ${item.unit} → ${product(state, item.productId)?.controlUnit || '?'}`))].slice(0, 5).map(esc).join('<br>')}<br>${button('Configurar', 'navigate', 'btn-secondary btn-small', 'data-page="productos"')}</div></div>` : ''}${list.missing.length ? `<div class="notice warn"><span>◌</span><div><strong>${list.missing.length} comida(s) sin planificar</strong>La compra podría quedar incompleta. ${list.missing.slice(0, 5).map(item => `${cap(item.slot)} ${niceDate(item.date, { day: 'numeric', month: 'short' })}`).join(', ')}${list.missing.length > 5 ? '…' : ''}</div></div>` : ''}</div>` : ''}
    <div class="section-head"><div><h2>Otros productos que faltan</h2><p>Sal, aceite, detergente y lo que prefieras anotar sin seguimiento.</p></div></div>
    <form data-form="manual-item" class="inline"><input class="text" name="name" placeholder="Producto" required style="max-width:250px"><input class="text" name="quantity" placeholder="Cantidad (opcional)" style="max-width:185px"> <button class="btn btn-secondary" type="submit">Agregar</button></form>
    <div class="card" style="margin-top:15px">${state.manualItems.length ? state.manualItems.map(item => `<div class="list-row"><label class="inline"><input type="checkbox" data-action="toggle-manual" data-id="${item.id}" ${item.done ? 'checked' : ''}><span style="${item.done ? 'text-decoration:line-through;color:#6b5b51' : ''}">${esc(item.name)} ${item.quantity ? `<span class="muted">· ${esc(item.quantity)}</span>` : ''}</span></label>${button('Quitar', 'delete-manual', 'btn-quiet btn-small', `data-id="${item.id}"`)}</div>`).join('') : '<p class="muted">Anota aquí productos que no forman parte del menú.</p>'}</div>
    <div class="section-head"><div><h2>Compras confirmadas</h2><p>Solo estas compras aumentan las existencias.</p></div></div>${state.purchases.length ? `<div class="card">${[...state.purchases].reverse().map(purchase => `<div class="list-row"><div><div class="list-row-title">${niceDate(purchase.date, { day: 'numeric', month: 'long', year: 'numeric' })}</div><div class="list-row-sub">${purchase.lines.map(line => `${measure(line.quantity, line.unit)} de ${esc(productName(line.productId))}`).join(' · ')}</div></div><span class="pill">Confirmada</span></div>`).join('')}</div>` : empty('🧾','Aún no hay compras confirmadas','Prepara una compra sugerida y confirma las cantidades reales.')}`;
}
function renderReviews() {
  const stock = inventoryNow(state);
  const latest = lastStockReview(state);
  const selected = state.reviews.find(item => item.id === ui.reviewId) || [...state.reviews].reverse()[0];
  if (selected) syncReviewProducts(state, selected);
  return `<div class="grid grid-3"><div class="card"><div class="stat">${state.products.filter(item => (stock[item.id] || 0) > 0).length}</div><div class="stat-label">productos con existencias</div></div><div class="card"><div class="stat">${state.reviews.filter(item => item.status === 'confirmed').length}</div><div class="stat-label">revisiones confirmadas</div></div><div class="card"><div class="stat">${latest ? esc(niceDate(latest, { day: 'numeric', month: 'short' })) : '—'}</div><div class="stat-label">última revisión o ajuste</div></div></div>
    <div class="section-head"><div><h2>Existencias actuales</h2><p>Compras confirmadas menos consumo revisado, con ajustes de conteo.</p></div><div class="inline">${button('Corregir existencias', 'open-correction', 'btn-secondary btn-small')}${button('Nueva revisión', 'open-new-review', 'btn-primary btn-small')}</div></div>
    <div class="card">${state.products.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Producto</th><th class="num">Disponible</th></tr></thead><tbody>${state.products.map(item => `<tr><td>${esc(item.name)}</td><td class="num strong">${measure(stock[item.id] || 0, item.controlUnit)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Primero agrega productos para llevar sus existencias.</p>'}</div>
    ${selected ? `<div class="section-head"><div><h2>${selected.status === 'confirmed' ? 'Revisión confirmada' : 'Revisión pendiente'}</h2><p>${niceDate(selected.date, { day: 'numeric', month: 'long', year: 'numeric' })}</p></div>${selected.status === 'confirmed' ? button(ui.correctingReview ? 'Cancelar corrección' : 'Corregir revisión', 'toggle-correct-review', 'btn-secondary btn-small') : ''}</div>${reviewTable(selected)}` : `<div class="section-head"><h2>Revisión semanal</h2></div>${empty('✓','Todavía no hay revisiones','Abre una revisión y registra cuánto se consumió de cada producto. Un campo vacío queda pendiente.', button('Empezar revisión', 'open-new-review', 'btn-primary'))}`}
    <div class="section-head"><h2>Historial</h2></div>${state.reviews.length || state.corrections.length ? `<div class="card">${[...state.reviews.map(item => ({ ...item, event: 'review' })), ...state.corrections.map(item => ({ ...item, event: 'correction' }))].sort((a,b) => b.date.localeCompare(a.date) || b.seq - a.seq).map(item => `<div class="list-row"><div class="list-row-main"><div class="list-row-title">${item.event === 'review' ? 'Revisión' : 'Corrección de existencias'} · ${niceDate(item.date, { day: 'numeric', month: 'short', year: 'numeric' })}</div><div class="list-row-sub">${item.event === 'review' ? `${item.productIds.filter(id => item.consumed[id] !== undefined).length}/${item.productIds.length} productos revisados` : `${esc(productName(item.productId))}: ${item.delta >= 0 ? '+' : ''}${measure(item.delta, product(state, item.productId)?.controlUnit || '')}${item.reason ? ` · ${esc(item.reason)}` : ''}`}</div></div>${item.event === 'review' ? button(item.status === 'confirmed' ? 'Ver' : 'Continuar', 'select-review', 'btn-secondary btn-small', `data-id="${item.id}"`) : '<span class="pill gray">Ajuste</span>'}</div>`).join('')}</div>` : ''}`;
}
function reviewTable(review) {
  const available = reviewAvailability(state, review);
  const editing = review.status === 'draft' || ui.correctingReview;
  return `<form data-form="review" data-id="${review.id}" class="card"><div class="table-wrap"><table class="data-table"><thead><tr><th>Producto</th><th class="num">Antes</th><th class="num">Consumida</th><th class="num">Restante</th></tr></thead><tbody>${review.productIds.map(id => {
    const amount = review.consumed[id]; const remain = amount === undefined ? null : Math.max(0, (available[id] || 0) - amount);
    return `<tr data-review-product="${id}" data-available="${available[id] || 0}"><td><strong>${esc(productName(id))}</strong><div class="small muted">${esc(product(state, id)?.controlUnit || '')}</div></td><td class="num">${fmt(available[id] || 0)}</td><td class="num">${editing ? `<input class="text" type="number" name="consume-${id}" aria-label="Cantidad consumida de ${esc(productName(id))}" min="0" max="${available[id] || 0}" step="any" inputmode="decimal" placeholder="Pendiente" value="${amount === undefined ? '' : amount}">` : fmt(amount)}</td><td class="num remaining ${remain === null ? 'pending' : 'good'}">${remain === null ? 'Pendiente' : fmt(remain)}</td></tr>`;
  }).join('')}</tbody></table></div>${review.productIds.length ? '' : '<p class="muted">No hay productos con existencias antes de esta revisión.</p>'}<div class="modal-actions">${editing ? review.status === 'draft' ? `<button type="submit" name="intent" value="save" class="btn btn-secondary">Guardar pendiente</button><button type="submit" name="intent" value="confirm" class="btn btn-primary">Confirmar revisión</button>` : `<button type="submit" name="intent" value="correct" class="btn btn-primary">Guardar corrección</button>` : `<span class="pill">Confirmada · el consumo ya se descontó</span>`}</div></form>`;
}
function renderCatalog() {
  return `<div class="section-head" style="margin-top:0"><div><h2>Comidas que se repiten en casa</h2><p>Se copian al menú; luego puedes ajustar cada fecha por separado.</p></div>${button('+ Nueva preparación', 'open-recipe', 'btn-primary')}</div>
    ${state.recipes.length ? `<div class="grid grid-2">${state.recipes.map(recipe => `<article class="card"><div class="between"><h2>${esc(recipe.name)}</h2><span class="pill warm">${recipe.uses.map(cap).join(' · ')}</span></div><p class="small muted">${recipe.covers.length ? recipe.covers.map(id => esc(personName(id))).join(', ') : 'Para quienes participen'}${recipe.servings ? ` · ${fmt(recipe.servings)} raciones` : ''}</p>${foodList(recipe.items)}${recipe.note ? `<p class="small"><strong>Nota:</strong> ${esc(recipe.note)}</p>` : ''}<div class="inline">${button('Editar', 'open-recipe', 'btn-secondary btn-small', `data-id="${recipe.id}"`)}${button('Eliminar', 'delete-recipe', 'btn-danger btn-small', `data-id="${recipe.id}"`)}</div></article>`).join('')}</div>` : empty('📖','Tu catálogo está vacío','Agrega las comidas habituales con sus alimentos principales y variantes por persona.', button('Crear preparación', 'open-recipe', 'btn-primary'))}`;
}
function renderPeople() {
  return `<div class="section-head" style="margin-top:0"><div><h2>Quiénes comen en casa</h2><p>Guarda restricciones y cantidades habituales como referencia.</p></div><div class="inline">${button('Registrar ausencia', 'open-absence', 'btn-secondary')}${button('+ Añadir persona', 'open-person', 'btn-primary')}</div></div>
    ${state.people.length ? `<div class="grid grid-2">${state.people.map(person => `<article class="card"><div class="between"><h2>${esc(person.name)}</h2>${button('Editar', 'open-person', 'btn-secondary btn-small', `data-id="${person.id}"`)}</div><p class="small"><strong>Evitar:</strong> ${person.restrictions.length ? person.restrictions.map(id => esc(productName(id))).join(', ') : 'Sin restricciones registradas'}</p><p class="small"><strong>Cantidades habituales:</strong> ${person.habitual.length ? person.habitual.map(item => `${fmt(item.quantity)} ${esc(item.unit)} de ${esc(productName(item.productId))}`).join(' · ') : 'Sin referencias todavía'}</p></article>`).join('')}</div>` : empty('👨‍👩‍👧‍👦','Agrega a las personas de casa','Después podrás indicar variantes y ausencias por comida.', button('Añadir persona', 'open-person', 'btn-primary'))}
    <div class="section-head"><h2>Ausencias registradas</h2></div>${state.absences.length ? `<div class="card">${state.absences.sort((a,b) => a.date.localeCompare(b.date)).map(item => `<div class="list-row"><div>${esc(personName(item.personId))} · ${cap(item.slot)} · ${niceDate(item.date, { day: 'numeric', month: 'long' })}</div>${button('Quitar', 'remove-absence', 'btn-quiet btn-small', `data-date="${item.date}" data-slot="${item.slot}" data-id="${item.personId}"`)}</div>`).join('')}</div>` : '<p class="muted">No hay ausencias indicadas.</p>'}`;
}
function renderProducts() {
  return `<div class="card soft" style="margin-bottom:20px"><h2>Organización de la casa</h2><p class="muted small">Edita las comidas habituales y las personas que participan. El recorrido explica cada pantalla paso a paso.</p><div class="inline">${button('Preparaciones', 'navigate', 'btn-secondary', 'data-page="catalogo"')}${button('Personas', 'navigate', 'btn-secondary', 'data-page="personas"')}${button('Cómo funciona', 'open-tour', 'btn-secondary')}</div></div>
    <div class="section-head" style="margin-top:0"><div><h2>Productos y equivalencias</h2><p>La unidad de control define cómo se cuentan las existencias.</p></div>${button('+ Añadir producto', 'open-product', 'btn-primary')}</div>
    ${state.products.length ? `<div class="card">${state.products.map(item => `<div class="list-row"><div class="list-row-main"><div class="list-row-title">${esc(item.name)}</div><div class="list-row-sub">Control: ${esc(item.controlUnit)} · Compra: ${esc(item.purchaseUnit)}${Object.entries(item.equivalences || {}).length ? ` · ${Object.entries(item.equivalences).map(([unit,factor]) => `1 ${esc(unit)} = ${fmt(factor)} ${esc(item.controlUnit)}`).join(' · ')}` : ''}</div></div><div class="inline">${button('Equivalencia', 'open-equivalence', 'btn-secondary btn-small', `data-id="${item.id}"`)}${button('Editar', 'open-product', 'btn-secondary btn-small', `data-id="${item.id}"`)}</div></div>`).join('')}</div>` : empty('🥬','Sin productos todavía','Agrega los alimentos principales que quieres controlar.', button('Añadir producto', 'open-product', 'btn-primary'))}
    <div class="section-head"><h2>Tus datos</h2></div><div class="grid grid-2"><div class="card"><h2>Respaldo</h2><p class="muted">Los datos viven solo en este navegador y dispositivo. Exporta un archivo para conservarlos o importarlos aquí más tarde.</p><div class="inline">${button('Exportar respaldo', 'export', 'btn-primary')}${button('Importar respaldo', 'open-import', 'btn-secondary')}</div></div><div class="card"><h2>Comenzar con datos reales</h2><p class="muted">Borra las demostraciones y empieza desde cero. Esta acción elimina todos los datos locales de la app; exporta un respaldo antes si quieres conservarlos.</p>${button('Borrar todos los datos', 'clear-demo', 'btn-danger')}</div></div>`;
}
function options(values, selected, placeholder = '') { return `${placeholder ? `<option value="">${placeholder}</option>` : ''}${values.map(([value,label]) => `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`).join('')}`; }
const unitOptions = selected => options(UNITS.map(unit => [unit, unit]), selected);
const productOptions = selected => options(state.products.map(item => [item.id, item.name]), selected, 'Seleccionar producto');
const personOptions = selected => options([['','Para todos'], ...state.people.map(item => [item.id, item.name])], selected || '');
function itemRow(item = {}, type = 'ingredient') {
  const isPurchase = type === 'purchase';
  const isHabitual = type === 'habitual';
  const defaultProduct = product(state, item.productId);
  return `<div class="item-row" data-item-row><input type="hidden" name="itemId" value="${esc(item.id || '')}"><label class="field"><span>Producto</span><select name="productId" required>${productOptions(item.productId || '')}</select></label><label class="field"><span>Cantidad</span><input name="quantity" type="number" min="0" step="any" inputmode="decimal" value="${item.quantity ?? ''}" placeholder="0"></label><label class="field"><span>Unidad</span><select name="unit">${unitOptions(item.unit || defaultProduct?.[isPurchase ? 'purchaseUnit' : 'controlUnit'] || 'unidad')}</select></label>${isPurchase || isHabitual ? '<span></span>' : `<label class="field person-select"><span>Para quién</span><select name="personId">${personOptions(item.personId)}</select></label>`}<button type="button" class="btn btn-quiet remove-item" data-action="remove-item" aria-label="Quitar alimento">✕</button></div>`;
}
function modal(title, subtitle, body, wide = false) { return `<div class="modal-overlay" data-overlay><div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div><button type="button" class="icon-btn" data-action="close-modal" aria-label="Cerrar">×</button></div>${body}</div></div>`; }
function checkPeople(name, selected, date = null, slot = null) {
  return `<div class="checks">${state.people.map(person => `<label class="check-chip"><input type="checkbox" name="${name}" value="${person.id}" ${selected.includes(person.id) ? 'checked' : ''} ${date && isAbsent(state, date, slot, person.id) ? 'disabled' : ''}>${esc(person.name)}${date && isAbsent(state, date, slot, person.id) ? ' · fuera' : ''}</label>`).join('') || '<span class="muted small">Agrega personas en la sección Personas.</span>'}</div>`;
}
function renderModal() {
  const m = ui.modal;
  if (m.type === 'meal') {
    const plan = planFor(state, m.date, m.slot);
    const context = `${cap(m.slot)} · ${niceDate(m.date, { weekday: 'long', day: 'numeric', month: 'long' })}`;
    if (!plan) {
      const choices = state.recipes.filter(recipe => recipe.uses.includes(m.slot));
      const selected = choices[0]?.covers.length ? choices[0].covers : state.people.map(person => person.id);
      return modal('Planificar comida', context, `<form data-form="assign" class="stack"><input type="hidden" name="date" value="${m.date}"><input type="hidden" name="slot" value="${m.slot}"><label class="field"><span>Preparación del catálogo</span><select name="recipeId" id="assign-recipe" ${choices.length ? '' : 'disabled'}>${options(choices.map(recipe => [recipe.id, recipe.name]), choices[0]?.id)}</select></label><div class="field"><span>Quiénes comerán</span>${checkPeople('participants', selected, m.date, m.slot)}</div>${choices.length ? '<button type="submit" class="btn btn-primary">Asignar preparación</button>' : `<div class="hint">No hay preparaciones para esta comida. ${button('Crear una', 'navigate', 'btn-secondary btn-small', 'data-page="catalogo"')}</div>`}</form><div class="divider"></div><div class="small strong" style="margin-bottom:9px">O marcar como</div><div class="inline">${[['outside','Fuera de casa'],['order','Pedir comida'],['unplanned','Sin planificar']].map(([kind,label]) => button(label, 'mark-status', 'btn-secondary btn-small', `data-date="${m.date}" data-slot="${m.slot}" data-kind="${kind}"`)).join('')}</div>`);
    }
    if (!['recipe','linked'].includes(plan.kind)) return modal(planTitle(plan), context, `<p class="muted">Esta comida no genera alimentos para la compra.</p><div class="modal-actions">${button('Cambiar a preparación', 'delete-plan', 'btn-secondary', `data-id="${plan.id}"`)}${button('Mover', 'open-move', 'btn-secondary', `data-id="${plan.id}"`)}${button('Eliminar marca', 'delete-plan', 'btn-danger', `data-id="${plan.id}"`)}</div>`);
    return modal(plan.kind === 'linked' ? 'Comida reservada' : 'Editar comida', context, `<div class="hint">Los cambios aquí afectan solo a esta fecha, no al catálogo.</div>${plan.kind === 'linked' ? servings(plan) : dependents(state, plan.id).length ? `<div class="notice warn"><span>↪</span><div><strong>Esta preparación tiene una comida vinculada.</strong>Si cambias las cantidades, conserva suficiente para la parte reservada.</div></div>` : ''}
      <form data-form="plan" data-id="${plan.id}"><div class="form-grid"><label class="field"><span>Nombre visible</span><input name="title" value="${esc(plan.title)}" required></label><div class="field"><span>Quiénes comerán</span>${checkPeople('participants', plan.participants, plan.date, plan.slot)}</div></div><div class="section-head"><h3>${plan.kind === 'linked' ? 'Alimentos adicionales para esta comida' : 'Cantidad total preparada'}</h3></div><div data-item-list="ingredient">${plan.items.map(item => itemRow(item)).join('')}</div>${button('+ Añadir alimento', 'add-item', 'btn-secondary btn-small', 'data-type="ingredient"')}<label class="field" style="margin-top:16px"><span>Nota para quien cocina</span><textarea name="note">${esc(plan.note || '')}</textarea></label><div class="modal-actions"><button type="submit" class="btn btn-primary">Guardar cambios</button></div></form><div class="divider"></div><div class="inline">${plan.kind === 'recipe' ? button('Reservar para otra comida', 'open-link', 'btn-secondary btn-small', `data-id="${plan.id}"`) : ''}${button('Mover', 'open-move', 'btn-secondary btn-small', `data-id="${plan.id}"`)}${plan.kind !== 'linked' ? button('Copiar', 'open-copy', 'btn-secondary btn-small', `data-id="${plan.id}"`) : ''}${button('Eliminar', 'delete-plan', 'btn-danger btn-small', `data-id="${plan.id}"`)}</div><div class="small strong" style="margin:17px 0 8px">Cambiar esta comida a</div><div class="inline">${[['outside','Fuera de casa'],['order','Pedir comida'],['unplanned','Sin planificar']].map(([kind,label]) => button(label, 'replace-status', 'btn-quiet btn-small', `data-id="${plan.id}" data-kind="${kind}"`)).join('')}</div>`, true);
  }
  if (m.type === 'recipe') {
    const recipe = state.recipes.find(item => item.id === m.id);
    return modal(recipe ? 'Editar preparación' : 'Nueva preparación', 'Guarda las cantidades que usas normalmente. Podrás cambiarlas en cada fecha.', `<form data-form="recipe" data-id="${recipe?.id || ''}"><label class="field"><span>Nombre</span><input name="name" required value="${esc(recipe?.name || '')}" placeholder="Ej. Arroz con carne"></label><div class="field" style="margin-top:14px"><span>Se usa en</span><div class="checks">${SLOTS.map(slot => `<label class="check-chip"><input type="checkbox" name="uses" value="${slot}" ${recipe?.uses.includes(slot) ? 'checked' : ''}>${cap(slot)}</label>`).join('')}</div></div><div class="field" style="margin-top:14px"><span>Personas que cubre</span>${checkPeople('covers', recipe?.covers || [])}<small>Si no seleccionas a nadie, se ofrece a quienes participen ese día.</small></div><label class="field" style="margin-top:14px"><span>Raciones que cubre (opcional)</span><input name="servings" type="number" min="0.1" step="any" inputmode="decimal" value="${recipe?.servings ?? ''}" placeholder="Ej. 4"></label><div class="section-head"><h3>Alimentos principales</h3></div><div data-item-list="ingredient">${(recipe?.items || [{}]).map(item => itemRow(item)).join('')}</div>${button('+ Añadir alimento', 'add-item', 'btn-secondary btn-small', 'data-type="ingredient"')}<label class="field" style="margin-top:17px"><span>Nota para quien cocina (opcional)</span><textarea name="note" placeholder="Ej. dejar una parte para mañana">${esc(recipe?.note || '')}</textarea></label><div class="modal-actions"><button class="btn btn-primary" type="submit">Guardar preparación</button></div></form>`, true);
  }
  if (m.type === 'person') {
    const person = state.people.find(item => item.id === m.id);
    return modal(person ? 'Editar persona' : 'Añadir persona', 'Las restricciones evitan asignaciones automáticas incompatibles.', `<form data-form="person" data-id="${person?.id || ''}"><label class="field"><span>Nombre</span><input name="name" required value="${esc(person?.name || '')}" placeholder="Nombre de la persona"></label><div class="field" style="margin-top:16px"><span>Alimentos incompatibles</span><div class="checks">${state.products.map(item => `<label class="check-chip"><input type="checkbox" name="restrictions" value="${item.id}" ${person?.restrictions.includes(item.id) ? 'checked' : ''}>${esc(item.name)}</label>`).join('') || '<span class="muted small">Agrega productos primero para configurar restricciones.</span>'}</div></div><div class="section-head"><h3>Cantidades habituales (opcional)</h3></div><div data-item-list="habitual">${(person?.habitual || []).map(item => itemRow(item)).join('')}</div>${button('+ Añadir cantidad', 'add-item', 'btn-secondary btn-small', 'data-type="habitual"')}<div class="modal-actions"><button type="submit" class="btn btn-primary">Guardar persona</button></div></form>`, true);
  }
  if (m.type === 'product') {
    const item = product(state, m.id);
    const stock = item ? inventoryNow(state)[item.id] || 0 : 0;
    const otherUnit = item && item.purchaseUnit !== item.controlUnit;
    return modal(item ? 'Editar producto' : 'Añadir producto', item ? '' : 'Anota cómo cuentas este alimento y cuánto tienes ahora mismo.', `<form data-form="product" data-id="${item?.id || ''}" class="stack">
      <label class="field"><span>Nombre</span><input name="name" required value="${esc(item?.name || '')}" placeholder="Ej. Plátano maduro"></label>
      <div class="form-grid">
        <label class="field"><span>¿En qué unidad lo cuentas?</span><select name="controlUnit" ${item ? 'disabled' : ''}>${unitOptions(item?.controlUnit || 'unidad')}</select><small>${item ? 'No se cambia cuando ya hay movimientos.' : 'Así verás sus existencias en la casa.'}</small></label>
        ${item
          ? `<div class="field"><span>Existencias ahora</span><div class="hint" style="min-height:42px;display:flex;align-items:center">${measure(stock, item.controlUnit)}</div><small>Se cambia con una compra, una revisión o ${button('corregir existencias', 'open-correction', 'btn-quiet btn-small')}.</small></div>`
          : `<label class="field"><span>¿Cuánto tienes ahora?</span><input name="opening" type="number" min="0" step="any" inputmode="decimal" value="0" placeholder="0"><small>Déjalo en 0 si no tienes nada todavía.</small></label>`}
      </div>
      <details class="more" ${otherUnit ? 'open' : ''}>
        <summary>Lo compro en otra medida</summary>
        <p class="small muted">Por ejemplo: cuentas el salami por ruedas, pero en el colmado lo venden por paquetes.</p>
        <div class="form-grid">
          <label class="field"><span>Unidad de compra</span><select name="purchaseUnit">${options([['', 'La misma de arriba'], ...UNITS.map(unit => [unit, unit])], otherUnit ? item.purchaseUnit : '')}</select></label>
          <label class="field"><span>Cada una trae…</span><input name="factor" type="number" min="0.001" step="any" inputmode="decimal" value="${otherUnit ? item.equivalences?.[item.purchaseUnit] ?? '' : ''}" placeholder="Ej. 16"><small>En la unidad con que lo cuentas.</small></label>
        </div>
      </details>
      <div class="modal-actions"><button type="submit" class="btn btn-primary">Guardar producto</button></div></form>`);
  }
  if (m.type === 'equivalence') {
    const item = product(state, m.id);
    return modal('Configurar equivalencia', item?.name || '', `<p class="muted small">Escribe cuántas <strong>${esc(item?.controlUnit || '')}</strong> contiene 1 unidad de la medida elegida. Usa solo una equivalencia que conozcas.</p><form data-form="equivalence" data-id="${item?.id || ''}" class="stack"><label class="field"><span>Unidad que quieres convertir</span><select name="unit">${unitOptions(item?.purchaseUnit !== item?.controlUnit ? item.purchaseUnit : UNITS.find(unit => unit !== item?.controlUnit))}</select></label><label class="field"><span>1 unidad equivale a cuántas ${esc(item?.controlUnit || '')}</span><input name="factor" type="number" step="any" min="0.001" inputmode="decimal" required placeholder="Ej. 12"></label><div class="modal-actions"><button type="submit" class="btn btn-primary">Guardar equivalencia</button></div></form>`);
  }
  if (m.type === 'link') {
    const source = state.plans.find(item => item.id === m.id);
    return modal('Reservar para otra comida', `${source?.title || ''} · ${niceDate(source.date, { day: 'numeric', month: 'long' })}`, `<div class="hint">La cantidad de origen es todo lo preparado. Indica cuánto separarás y cuándo se servirá. La compra se contará solo en la fecha de preparación.</div><form data-form="link" data-id="${source.id}"><div class="form-grid" style="margin-top:15px"><label class="field"><span>Fecha de la comida posterior</span><input type="date" name="date" min="${addDays(source.date, 1)}" value="${addDays(source.date, 1)}" required></label><label class="field"><span>Comida</span><select name="slot">${options(SLOTS.map(slot => [slot, cap(slot)]), 'desayuno')}</select></label></div><div class="section-head"><h3>Parte que se reserva</h3></div>${source.items.map(item => `<div class="list-row"><div>${itemText(item)}${item.personId ? ` · ${esc(personName(item.personId))}` : ''}<div class="small muted">Ya reservado: ${fmt(reservedQuantity(state, source.id, item.id))} ${esc(item.unit)}</div></div><label class="field" style="max-width:140px"><span>Reservar</span><input type="number" min="0" max="${Math.max(0,item.quantity-reservedQuantity(state,source.id,item.id))}" step="any" inputmode="decimal" name="reserve-${item.id}" value="0"></label></div>`).join('')}<div class="field" style="margin-top:15px"><span>Quiénes comerán la parte reservada</span>${checkPeople('participants', source.participants)}</div><div class="section-head"><h3>Alimentos adicionales en la comida posterior</h3></div><div data-item-list="ingredient"></div>${button('+ Añadir alimento', 'add-item', 'btn-secondary btn-small', 'data-type="ingredient"')}<div class="modal-actions"><button type="submit" class="btn btn-primary">Crear comida vinculada</button></div></form>`, true);
  }
  if (m.type === 'move' || m.type === 'copy') {
    const plan = state.plans.find(item => item.id === m.id);
    return modal(m.type === 'move' ? 'Mover comida' : 'Copiar comida', planTitle(plan), `<form data-form="move-copy" data-id="${plan.id}" data-operation="${m.type}" class="stack"><div class="form-grid"><label class="field"><span>Fecha destino</span><input type="date" name="date" value="${m.type === 'copy' ? addDays(plan.date, 1) : plan.date}" required></label><label class="field"><span>Comida</span><select name="slot">${options(SLOTS.map(slot => [slot, cap(slot)]), plan.slot)}</select></label></div><div class="modal-actions"><button type="submit" class="btn btn-primary">${m.type === 'move' ? 'Mover' : 'Copiar'}</button></div></form>`);
  }
  if (m.type === 'purchase') {
    const period = shopPeriod(); const list = shoppingList(state, period.start, period.end);
    return modal('Confirmar compra real', `${niceDate(period.start, { day: 'numeric', month: 'short' })} – ${niceDate(period.end, { day: 'numeric', month: 'short' })}`, `<div class="hint">Cambia las cantidades según lo que realmente compraste. Solo al confirmar aumentarán las existencias.</div>${list.pending.length ? notice('Hay equivalencias pendientes.', 'Puedes confirmar los productos que sí tienen unidad válida y completar los otros después.', 'warn') : ''}<form data-form="purchase" class="stack"><label class="field"><span>Fecha de compra</span><input name="date" type="date" value="${today}" required></label><div class="section-head"><h3>Productos comprados</h3></div><div data-item-list="purchase">${list.lines.filter(line => line.shortfall > 0 && line.purchaseQuantity !== null).map(line => itemRow({ productId: line.productId, quantity: line.purchaseQuantity, unit: line.purchaseUnit }, 'purchase')).join('')}</div>${button('+ Añadir otro producto', 'add-item', 'btn-secondary btn-small', 'data-type="purchase"')}<div class="modal-actions"><button type="submit" class="btn btn-primary">Confirmar compra</button></div></form>`, true);
  }
  if (m.type === 'new-review') return modal('Abrir revisión', 'Se cargarán automáticamente los productos disponibles.', `<form data-form="new-review" class="stack"><label class="field"><span>Fecha de revisión</span><input name="date" type="date" value="${today}" required></label><div class="modal-actions"><button type="submit" class="btn btn-primary">Abrir revisión</button></div></form>`);
  if (m.type === 'correction') return modal('Corregir existencias', 'Para pérdidas, alimentos dañados o diferencias de conteo.', `<form data-form="correction" class="stack"><label class="field"><span>Producto</span><select name="productId" required>${productOptions(state.products[0]?.id)}</select></label><label class="field"><span>Cantidad real que queda (en unidad de control)</span><input name="actual" type="number" min="0" step="any" inputmode="decimal" value="${inventoryNow(state)[state.products[0]?.id] || 0}" required></label><label class="field"><span>Motivo (opcional)</span><input name="reason" placeholder="Ej. se dañaron 2 unidades"></label><div class="modal-actions"><button type="submit" class="btn btn-primary">Guardar corrección</button></div></form>`);
  if (m.type === 'absence') return modal('Registrar ausencia', 'Indica quién no comerá en casa en esta fecha y comida.', `<form data-form="absence" class="stack"><div class="form-grid"><label class="field"><span>Fecha</span><input name="date" type="date" value="${m.date || today}" required></label><label class="field"><span>Comida</span><select name="slot">${options(SLOTS.map(slot => [slot,cap(slot)]), m.slot || 'almuerzo')}</select></label></div><div class="field"><span>Personas fuera de casa</span>${checkPeople('absent', state.absences.filter(item => item.date === (m.date || today) && item.slot === (m.slot || 'almuerzo')).map(item => item.personId))}</div><div class="modal-actions"><button type="submit" class="btn btn-primary">Guardar ausencia</button></div></form>`);
  if (m.type === 'import') return modal('Importar respaldo', 'Se reemplazarán los datos actuales con los del archivo.', `<form data-form="import" class="stack"><label class="field"><span>Archivo JSON exportado desde ¿Qué comemos?</span><input name="file" type="file" accept=".json,application/json" required></label><div class="modal-actions"><button type="submit" class="btn btn-primary">Importar datos</button></div></form>`);
  return '';
}

function collectItems(form) {
  return [...form.querySelectorAll('[data-item-row]')].map(row => ({ id: row.querySelector('[name="itemId"]')?.value || undefined, productId: row.querySelector('[name="productId"]')?.value, quantity: row.querySelector('[name="quantity"]')?.value, unit: row.querySelector('[name="unit"]')?.value, personId: row.querySelector('[name="personId"]')?.value || null })).filter(item => item.productId && item.quantity !== '');
}
function formValues(form) { return new FormData(form); }
function selected(form, name) { return [...form.querySelectorAll(`[name="${name}"]:checked`)].map(input => input.value); }
function closeModal() { ui.modal = null; render(); }
function openModal(type, extras = {}) { ui.modal = { type, ...extras }; render(); }
function shiftMonth(month, delta) { const d = new Date(`${month}-01T12:00:00`); d.setMonth(d.getMonth() + delta); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
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
document.addEventListener('click', event => {
  if (event.target.matches('[data-overlay]')) { closeModal(); return; }
  const el = event.target.closest('[data-action]'); if (!el) return;
  const action = el.dataset.action;
  try {
    if (action === 'navigate') { ui.page = el.dataset.page; ui.modal = null; ui.drawerOpen = false; render(); }
    else if (action === 'welcome-demo') { ui.welcome = false; ui.page = TOUR_STEPS[0].page; ui.tour = 0; commit('Datos de demostración cargados.'); }
    else if (action === 'welcome-empty') { state = createEmptyState(); ui.welcome = false; ui.page = TOUR_STEPS[0].page; ui.tour = 0; commit('Todo listo para empezar con tus datos.'); }
    else if (action === 'open-tour') goTour(0);
    else if (action === 'tour-prev') goTour(Math.max(0, ui.tour - 1));
    else if (action === 'tour-next') { if (ui.tour + 1 < TOUR_STEPS.length) goTour(ui.tour + 1); else { ui.tour = null; render(); toast('Recorrido terminado. Vuelve a abrirlo desde Productos y datos.'); } }
    else if (action === 'tour-skip') { ui.tour = null; render(); }
    else if (action === 'toggle-sidebar') toggleSidebar();
    else if (action === 'close-sidebar') closeSidebar();
    else if (action === 'close-modal') closeModal();
    else if (action === 'open-meal') openModal('meal', { date: el.dataset.date, slot: el.dataset.slot });
    else if (action === 'open-recipe') openModal('recipe', { id: el.dataset.id });
    else if (action === 'open-person') openModal('person', { id: el.dataset.id });
    else if (action === 'open-product') openModal('product', { id: el.dataset.id });
    else if (action === 'open-equivalence') openModal('equivalence', { id: el.dataset.id });
    else if (action === 'open-link') openModal('link', { id: el.dataset.id });
    else if (action === 'open-move') openModal('move', { id: el.dataset.id });
    else if (action === 'open-copy') openModal('copy', { id: el.dataset.id });
    else if (action === 'open-purchase') openModal('purchase');
    else if (action === 'open-new-review') openModal('new-review');
    else if (action === 'open-correction') openModal('correction');
    else if (action === 'open-absence') openModal('absence');
    else if (action === 'open-import') openModal('import');
    else if (action === 'menu-mode') { ui.menuMode = el.dataset.mode; render(); }
    else if (action === 'menu-prev' || action === 'menu-next') { ui.menuDate = ui.menuMode === 'week' ? addDays(ui.menuDate, action === 'menu-prev' ? -7 : 7) : `${shiftMonth(ui.menuDate.slice(0,7), action === 'menu-prev' ? -1 : 1)}-01`; render(); }
    else if (action === 'menu-today') { ui.menuDate = today; render(); }
    else if (action === 'generate-month') { const result = generateMonth(state, ui.menuDate.slice(0,7)); ui.generationResult = result; commit(`${result.count} comidas propuestas. ${result.unavailable.length} quedaron sin opción compatible.`); }
    else if (action === 'repeat-week') { const result = repeatWeek(state, weekStart(ui.menuDate), ui.menuDate.slice(0,7)); commit(`${result.count} comidas copiadas. ${result.skipped} omitidas por estar ocupadas o incompatibles.`); }
    else if (action === 'mark-status') { setStatusPlan(state, el.dataset.date, el.dataset.slot, el.dataset.kind); ui.modal = null; commit('Comida marcada.'); }
    else if (action === 'replace-status') { const children = dependents(state, el.dataset.id); if (children.length && !window.confirm(`Esta preparación tiene ${children.length} comida(s) vinculadas. Cambiarla también eliminará esas comidas. ¿Continuar?`)) return; const old = state.plans.find(item => item.id === el.dataset.id); deletePlan(state, old.id, true); setStatusPlan(state, old.date, old.slot, el.dataset.kind); ui.modal = null; commit('Comida actualizada.'); }
    else if (action === 'delete-plan') { const children = dependents(state, el.dataset.id); if (children.length && !window.confirm(`Esta preparación tiene ${children.length} comida(s) vinculadas. Si la eliminas, esas comidas también se quitarán. ¿Continuar?`)) return; deletePlan(state, el.dataset.id, true); ui.modal = null; commit('Comida eliminada del menú.'); }
    else if (action === 'delete-recipe') { if (!window.confirm('¿Eliminar esta preparación del catálogo? Las comidas ya asignadas conservarán sus cantidades.')) return; deleteRecipe(state, el.dataset.id); commit('Preparación eliminada.'); }
    else if (action === 'add-item') { const list = el.parentElement.querySelector(`[data-item-list="${el.dataset.type}"]`); list?.insertAdjacentHTML('beforeend', itemRow({}, el.dataset.type)); }
    else if (action === 'remove-item') el.closest('[data-item-row]')?.remove();
    else if (action === 'clear-demo') { if (!window.confirm('¿Borrar todos los datos de esta aplicación en este navegador? Esta acción no se puede deshacer sin un respaldo exportado.')) return; state = createEmptyState(); loadError = ''; ui.modal = null; ui.reviewId = null; commit('Datos borrados. Ya puedes empezar con los tuyos.'); }
    else if (action === 'export') { const blob = new Blob([exportState(state)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `que-comemos-respaldo-${today}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast('Respaldo descargado.'); }
    else if (action === 'select-review') { ui.reviewId = el.dataset.id; ui.correctingReview = false; render(); }
    else if (action === 'toggle-correct-review') { ui.correctingReview = !ui.correctingReview; render(); }
    else if (action === 'remove-absence') { setAbsence(state, el.dataset.date, el.dataset.slot, el.dataset.id, false); commit('Ausencia quitada.'); }
    else if (action === 'toggle-manual') { const item = state.manualItems.find(item => item.id === el.dataset.id); item.done = el.checked; commit(item.done ? 'Producto marcado como comprado.' : 'Producto pendiente otra vez.'); }
    else if (action === 'delete-manual') { state.manualItems = state.manualItems.filter(item => item.id !== el.dataset.id); commit('Producto quitado de la lista.'); }
  } catch (error) { toast(error.message, true); }
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || ui.tour === null || ui.modal) return;
  ui.tour = null; render();
});
document.addEventListener('change', event => {
  const el = event.target;
  if (el.id === 'shop-kind') { ui.shopKind = el.value; render(); }
  if (el.id === 'shop-month') { ui.shopMonth = el.value; render(); }
  if (el.id === 'shop-start') { ui.customStart = el.value; render(); }
  if (el.id === 'shop-end') { ui.customEnd = el.value; render(); }
  if (el.id === 'assign-recipe') { const recipe = state.recipes.find(item => item.id === el.value); const form = el.closest('form'); form.querySelectorAll('[name="participants"]').forEach(input => input.checked = !input.disabled && (recipe?.covers.length ? recipe.covers.includes(input.value) : true)); }
  if (['date','slot'].includes(el.name) && el.closest('[data-form="absence"]')) { const form = el.closest('form'), date = form.querySelector('[name="date"]').value, slot = form.querySelector('[name="slot"]').value; form.querySelectorAll('[name="absent"]').forEach(input => input.checked = isAbsent(state, date, slot, input.value)); }
  if (el.name === 'productId' && el.closest('[data-item-row]')) { const row = el.closest('[data-item-row]'); const item = product(state, el.value); if (item) row.querySelector('[name="unit"]').value = row.closest('[data-item-list="purchase"]') ? item.purchaseUnit : item.controlUnit; }
  if (el.name === 'productId' && el.closest('[data-form="correction"]')) { el.form.querySelector('[name="actual"]').value = inventoryNow(state)[el.value] || 0; }
});
document.addEventListener('input', event => {
  const input = event.target;
  if (!input.name?.startsWith('consume-')) return;
  const row = input.closest('[data-review-product]'); const cell = row?.querySelector('.remaining'); if (!cell) return;
  if (input.value === '') { cell.textContent = 'Pendiente'; cell.className = 'num remaining pending'; return; }
  const remaining = Number(row.dataset.available) - Number(input.value);
  cell.textContent = remaining < 0 ? 'Revisar cantidad' : fmt(remaining);
  cell.className = `num remaining ${remaining < 0 ? 'pending' : 'good'}`;
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && ui.modal) closeModal(); else if (event.key === 'Escape' && ui.drawerOpen) closeSidebar(); });
window.addEventListener('resize', () => { if (ui.drawerOpen && !sidebarOnMobile()) { ui.drawerOpen = false; render(); } });
document.addEventListener('submit', async event => {
  const form = event.target.closest('[data-form]'); if (!form) return;
  event.preventDefault();
  const data = formValues(form), kind = form.dataset.form;
  try {
    if (kind === 'recipe') { upsertRecipe(state, { id: form.dataset.id, name: data.get('name'), uses: selected(form,'uses'), covers: selected(form,'covers'), servings: data.get('servings'), items: collectItems(form), note: data.get('note') }); ui.modal = null; commit('Preparación guardada.'); }
    else if (kind === 'person') { upsertPerson(state, { id: form.dataset.id, name: data.get('name'), restrictions: selected(form,'restrictions'), habitual: collectItems(form) }); ui.modal = null; commit('Persona guardada.'); }
    else if (kind === 'product') {
      const existing = product(state, form.dataset.id);
      // Una unidad de compra vacía significa «la misma con la que lo cuento».
      const controlUnit = existing ? existing.controlUnit : data.get('controlUnit');
      const purchaseUnit = data.get('purchaseUnit') || controlUnit;
      const factor = String(data.get('factor') || '').trim();
      const item = existing || addProduct(state, { name: data.get('name'), controlUnit, purchaseUnit, opening: data.get('opening') });
      if (existing) {
        existing.name = String(data.get('name')).trim();
        if (!existing.name) throw new Error('Escribe el nombre.');
        existing.purchaseUnit = purchaseUnit;
      }
      // La equivalencia se guarda aquí mismo para no mandar a otra pantalla.
      // Sin ella la app no convierte: Compras avisa de que la lista está incompleta.
      if (purchaseUnit !== controlUnit && factor) setEquivalence(state, item.id, purchaseUnit, factor);
      ui.modal = null;
      commit('Producto guardado.');
    }
    else if (kind === 'equivalence') { setEquivalence(state, form.dataset.id, data.get('unit'), data.get('factor')); ui.modal = null; commit('Equivalencia guardada.'); }
    else if (kind === 'assign') { makeRecipePlan(state, data.get('recipeId'), data.get('date'), data.get('slot'), selected(form,'participants')); ui.modal = null; commit('Preparación asignada.'); }
    else if (kind === 'plan') { const plan = state.plans.find(item => item.id === form.dataset.id); updatePlan(state, plan.id, { title: data.get('title'), note: data.get('note'), participants: selected(form,'participants'), items: collectItems(form).map(item => ({ ...item, id: item.id || nextId(state,'alimento'), quantity: quantity(item.quantity) })) }); ui.modal = null; commit('Comida actualizada.'); }
    else if (kind === 'link') { const source = state.plans.find(item => item.id === form.dataset.id); const allocation = Object.fromEntries(source.items.map(item => [item.id, data.get(`reserve-${item.id}`)])); linkPlan(state, source.id, data.get('date'), data.get('slot'), allocation, collectItems(form), selected(form,'participants')); ui.modal = null; commit('Comida vinculada. La parte reservada no duplica la compra.'); }
    else if (kind === 'move-copy') { if (form.dataset.operation === 'move') movePlan(state, form.dataset.id, data.get('date'), data.get('slot')); else copyPlan(state, form.dataset.id, data.get('date'), data.get('slot')); ui.modal = null; commit(form.dataset.operation === 'move' ? 'Comida movida.' : 'Comida copiada.'); }
    else if (kind === 'purchase') { const lines = collectItems(form); addPurchase(state, { date: data.get('date'), period: shopPeriod(), lines }); ui.modal = null; commit('Compra confirmada. Las existencias aumentaron.'); }
    else if (kind === 'new-review') { const date = data.get('date'); const existing = state.reviews.find(item => item.date === date && item.status === 'draft'); const review = existing || createReview(state, date); ui.reviewId = review.id; ui.correctingReview = false; ui.modal = null; commit(existing ? 'Revisión pendiente abierta.' : 'Revisión abierta con los productos disponibles.'); }
    else if (kind === 'review') { const review = state.reviews.find(item => item.id === form.dataset.id); const inputs = Object.fromEntries(review.productIds.map(id => [id, data.get(`consume-${id}`)])); const intent = event.submitter?.value || 'save'; if (intent === 'correct') { correctReview(state, review.id, inputs); ui.correctingReview = false; commit('Revisión corregida. Saldos recalculados.'); } else { saveReview(state, review.id, inputs, intent === 'confirm'); commit(intent === 'confirm' ? 'Revisión confirmada. El consumo se descontó una vez.' : 'Revisión guardada como pendiente.'); } }
    else if (kind === 'correction') { correctStock(state, data.get('productId'), data.get('actual'), data.get('reason')); ui.modal = null; commit('Existencias corregidas.'); }
    else if (kind === 'absence') { const date = data.get('date'), slot = data.get('slot'); for (const person of state.people) setAbsence(state, date, slot, person.id, selected(form,'absent').includes(person.id)); ui.modal = null; commit('Ausencias guardadas.'); }
    else if (kind === 'manual-item') { const name = String(data.get('name') || '').trim(); if (!name) throw new Error('Escribe el producto.'); state.manualItems.push({ id: nextId(state,'otro'), name, quantity: String(data.get('quantity') || '').trim(), done: false }); commit('Producto añadido a la lista.'); }
    else if (kind === 'import') { const file = data.get('file'); if (!file?.size) throw new Error('Selecciona un archivo JSON.'); const imported = importState(await file.text()); if (!window.confirm('¿Reemplazar todos los datos actuales con este respaldo?')) return; state = imported; loadError = ''; ui.modal = null; ui.reviewId = null; commit('Respaldo importado correctamente.'); }
  } catch (error) { toast(error.message, true); }
});
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
