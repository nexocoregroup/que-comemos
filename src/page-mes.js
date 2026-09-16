// Plan mensual: la pantalla principal de la aplicación.
//
// Hasta ahora el calendario era una cuadrícula de noventa y tantas casillas y
// cada una había que tocarla. Nadie organiza un mes así, y por eso nadie lo
// organizaba: se planificaban tres días y se abandonaba.
//
// Aquí la unidad de trabajo deja de ser la casilla y pasa a ser la costumbre.
// «Plátano maduro con huevo, desayuno, lunes miércoles viernes y sábado» es una
// frase que alguien dice de verdad, y con ella se llenan dieciocho desayunos de
// un golpe. Lo que queda después —los huecos que ninguna rutina cubre— es lo
// único que hay que decidir a mano, y suele ser poco.
//
// El mes se abre solo. Entrar en octubre por primera vez aplica las rutinas
// permanentes y deja el calendario montado; lo que el usuario hace entonces no
// es construir el mes, es revisar en qué se va a diferenciar.

import { MOMENTOS, SLOTS, SLOTS_PRINCIPALES, dateRange, deletePlan, effectiveBasket, esOpcional, etiquetaDeMomento, makeRecipePlan, momentoDe, monthBasketSummary, monthBounds, planFor, restore, setStatusPlan, shoppingList, snapshot, todayISO } from './model.js';
import { WEEKDAY_SHORT, WEEKDAYS, addRoutine, applyRoutine, applyRoutines, copyPatternFromMonth, datesForRule, deleteRoutine, describeRule, monthProgress, openMonth, routinesFor } from './routines.js';
import { button, cap, empty, esc, measure, modal, monthName, niceDate, notice, options, shiftMonth } from './ui-kit.js';

const hoy = todayISO();

// Los pasos de «Preparar este mes». Siete pantallas cortas, cada una con una
// sola pregunta, en lugar de una pantalla con siete decisiones a la vez.
export const PASOS = [
  { id: 'rutinas', titulo: 'Lo que se repite', pregunta: '¿Qué come tu casa normalmente?' },
  { id: 'comparar', titulo: 'Qué cambia', pregunta: '¿En qué se parece al mes pasado?' },
  { id: 'salidas', titulo: 'Comidas fuera', pregunta: '¿Qué días no van a comer en casa?' },
  { id: 'pendientes', titulo: 'Lo que falta', pregunta: '¿Qué hacemos con los huecos?' },
  { id: 'canasta', titulo: 'La compra del mes', pregunta: '¿Este mes cambia algo de lo que compran?' },
  { id: 'compra', titulo: 'La lista', pregunta: '¿Qué habría que comprar?' },
  { id: 'listo', titulo: 'Listo', pregunta: '' }
];

export function emptyMes(month = hoy.slice(0, 7)) {
  return { month, vista: 'resumen', paso: null, deshacer: null, aviso: null, verPendientes: 12 };
}

/* ── Abrir un mes ──────────────────────────────────────────────────────── */

// Entrar en un mes que nunca se abrió no debe enseñar un calendario en blanco.
// Se aplican las rutinas permanentes y se avisa de lo que pasó, que es muy
// distinto de hacerlo en silencio: el usuario tiene que poder deshacerlo.
export function abrirMesSiHaceFalta(ctx, month) {
  const { state, ui } = ctx;
  if (state.monthPlans?.[month]) return false;
  const antes = snapshot(state);
  const resultado = openMonth(state, month);
  if (resultado.yaAbierto) return false;
  ui.mes.deshacer = resultado.creados?.length ? antes : null;
  ui.mes.aviso = {
    tipo: 'abierto',
    month,
    creados: resultado.creados?.length || 0
  };
  return true;
}

/* ── Pantalla ──────────────────────────────────────────────────────────── */

export function renderMes(ctx) {
  const { ui } = ctx;
  if (!ui.mes) ui.mes = emptyMes();
  if (ui.mes.paso) return renderPaso(ctx);
  return ui.mes.vista === 'calendario' ? renderCalendario(ctx) : renderResumen(ctx);
}

function barraDeMes(ctx, extra = '') {
  const { ui } = ctx;
  return `<div class="toolbar plan-barra"><div class="inline">
    ${button('‹', 'mes-mover', 'btn-secondary btn-small', 'data-delta="-1" aria-label="Mes anterior"')}
    <div class="strong plan-mes-nombre">${esc(monthName(ui.mes.month))}</div>
    ${button('›', 'mes-mover', 'btn-secondary btn-small', 'data-delta="1" aria-label="Mes siguiente"')}
    ${ui.mes.month === hoy.slice(0, 7) ? '' : button('Este mes', 'mes-hoy', 'btn-quiet btn-small')}
  </div>${extra}</div>`;
}

function avisoDeApertura(ctx) {
  const { ui } = ctx;
  const aviso = ui.mes.aviso;
  if (!aviso || aviso.month !== ui.mes.month) return '';
  const nombre = monthName(aviso.month);
  const deshacer = ui.mes.deshacer ? `<div class="inline" style="margin-top:10px">${button('Deshacer', 'mes-deshacer', 'btn-quiet btn-small')}</div>` : '';
  if (aviso.tipo === 'abierto') {
    return aviso.creados
      ? notice(`${esc(nombre)} está preparado con la rutina habitual de tu casa.`, `Se llenaron ${aviso.creados} comidas. Revisa lo que será diferente este mes.${deshacer}`)
      : notice(`${esc(nombre)} está listo para organizar.`, `Todavía no has guardado ninguna rutina, así que el calendario está vacío. Guarda una comida que se repita y se llena solo.`);
  }
  if (aviso.tipo === 'rutina') {
    return notice(aviso.titulo, `${esc(aviso.detalle)}${deshacer}`, aviso.tono || '');
  }
  return '';
}

function renderResumen(ctx) {
  const { state, ui } = ctx;
  const month = ui.mes.month;
  const progreso = monthProgress(state, month);
  const rutinas = routinesFor(state, month);
  const sinNada = !rutinas.length && !progreso.encasa && !progreso.fuera;

  const cabecera = `<section class="plan-cabecera card">
    <div class="plan-cifra">
      <div class="plan-porcentaje">${progreso.porcentaje}<span>%</span></div>
      <div class="progress plan-progreso"><span style="width:${progreso.porcentaje}%"></span></div>
      <p class="plan-resumen-texto">${resumenEnPalabras(progreso)}</p>
    </div>
    <div class="plan-acciones">
      ${button(progreso.pendientes ? 'Preparar este mes' : 'Revisar este mes', 'mes-preparar', 'btn-primary')}
      ${button('Ver calendario', 'mes-vista', 'btn-secondary', 'data-vista="calendario"')}
    </div>
  </section>`;

  const desglose = `<div class="plan-slots">${MOMENTOS.map(momento => {
    const cuenta = contarSlot(state, month, momento.id);
    return `<div class="card soft plan-slot ${momento.opcional ? 'plan-slot-opcional' : ''}">
      <div class="between"><span class="pill ${momento.opcional ? 'gray' : 'warm'}">${esc(momento.etiqueta)}</span><span class="small muted">${cuenta.total} días</span></div>
      <div class="plan-slot-cifra">${cuenta.resueltos}<span class="muted"> / ${cuenta.total}</span></div>
      <p class="small muted">${momento.opcional
        ? (cuenta.resueltos ? `${cuenta.resueltos} puesta(s) · es opcional` : 'Opcional: puede quedar vacía')
        : (cuenta.pendientes ? `${cuenta.pendientes} sin decidir` : 'Todo decidido')}</p>
    </div>`;
  }).join('')}</div>`;

  if (sinNada) {
    return `${barraDeMes(ctx)}${avisoDeApertura(ctx)}${cabecera}
      ${empty('▦', 'Todavía no has creado una rutina de comidas',
        'Guarda una preparación y elige qué días suele comerse; nosotros llenamos el calendario. Con dos o tres rutinas, el mes entero queda hecho.',
        `${button('Crear mi primera rutina', 'mes-nueva-rutina', 'btn-primary')}${button('Ver calendario', 'mes-vista', 'btn-secondary', 'data-vista="calendario"')}`)}`;
  }

  return `${barraDeMes(ctx)}${avisoDeApertura(ctx)}${cabecera}${desglose}
    ${seccionRutinas(ctx, rutinas)}
    ${seccionCanasta(ctx)}`;
}

// «73 en casa, 3 fuera, 17 por decidir» se entiende de un vistazo; un cuadro de
// estadísticas con cuatro números y sus etiquetas, no.
function resumenEnPalabras(progreso) {
  const partes = [];
  if (progreso.encasa) partes.push(`<strong>${progreso.encasa}</strong> comidas en casa`);
  if (progreso.fuera) partes.push(`<strong>${progreso.fuera}</strong> fuera`);
  if (progreso.pedido) partes.push(`<strong>${progreso.pedido}</strong> pedidas`);
  if (progreso.pendientes) partes.push(`<strong>${progreso.pendientes}</strong> por decidir`);
  return partes.length ? partes.join(' · ') : 'Este mes todavía está en blanco';
}

function contarSlot(state, month, slot) {
  const { start, end } = monthBounds(month);
  const fechas = dateRange(start, end);
  let resueltos = 0;
  for (const date of fechas) {
    const plan = planFor(state, date, slot);
    if (plan && plan.kind !== 'unplanned') resueltos++;
  }
  return { total: fechas.length, resueltos, pendientes: fechas.length - resueltos };
}

function seccionRutinas(ctx, rutinas) {
  const { state, ui } = ctx;
  if (!rutinas.length) {
    return `<div class="section-head"><div><h2>Lo que se repite</h2><p>Guarda una comida y los días que suele prepararse; el calendario se llena solo.</p></div>${button('+ Nueva rutina', 'mes-nueva-rutina', 'btn-primary btn-small')}</div>
      ${empty('🔁', 'Sin rutinas todavía', 'Una rutina es algo como «tortillas con jamón y queso, los lunes, miércoles y viernes de desayuno». Se guarda una vez y vale para todos los meses.', button('Crear mi primera rutina', 'mes-nueva-rutina', 'btn-primary'))}`;
  }
  return `<div class="section-head"><div><h2>Lo que se repite</h2><p>Se guardan una vez y llenan el calendario de cada mes.</p></div>${button('+ Nueva rutina', 'mes-nueva-rutina', 'btn-primary btn-small')}</div>
    <div class="card">${rutinas.map(rutina => filaDeRutina(state, ui.mes.month, rutina)).join('')}</div>`;
}

function filaDeRutina(state, month, rutina) {
  const fechas = datesForRule(month, rutina.weekdays, rutina.weeks);
  const cuando = describeRule(rutina.weekdays, rutina.weeks);
  const comidas = rutina.slots.map(cap).join(', ');
  const alcance = rutina.scope === 'permanent'
    ? '<span class="pill">todos los meses</span>'
    : `<span class="pill warm">solo ${esc(monthName(rutina.month))}</span>`;
  return `<div class="list-row">
    <div class="list-row-main">
      <div class="list-row-title">${esc(tituloDeRutina(state, rutina))} ${alcance}</div>
      <div class="list-row-sub">${esc(comidas)} · ${esc(cuando)} · ${fechas.length} día(s) en ${esc(monthName(month))}</div>
    </div>
    <div class="inline">
      ${button('Aplicar', 'mes-aplicar-rutina', 'btn-secondary btn-small', `data-id="${rutina.id}"`)}
      ${button('Quitar', 'mes-borrar-rutina', 'btn-quiet btn-small', `data-id="${rutina.id}"`)}
    </div>
  </div>`;
}

function tituloDeRutina(state, rutina) {
  if (rutina.kind === 'outside') return rutina.label || 'Comemos fuera';
  if (rutina.kind === 'order') return rutina.label || 'Pedimos comida';
  return state.recipes.find(item => item.id === rutina.recipeId)?.name || rutina.label || 'Preparación eliminada';
}

// La canasta aparece aquí en pequeño, no como sección propia: lo que importa en
// esta pantalla es si este mes cambia algo, no la lista entera.
function seccionCanasta(ctx) {
  const { state, ui } = ctx;
  const month = ui.mes.month;
  const resumen = monthBasketSummary(state, month);
  const cambios = resumen.cambiados + resumen.quitados + resumen.extras;
  if (!resumen.habituales && !cambios) {
    return `<div class="section-head"><div><h2>La compra de este mes</h2></div></div>
      ${empty('🧺', 'Todavía no has dicho qué se compra en tu casa', 'Se escribe una vez y vale para todos los meses. Después, cada mes solo cambias lo diferente.', button('Escribir mi canasta habitual', 'navigate', 'btn-primary', 'data-page="canasta"'))}`;
  }
  return `<div class="section-head"><div><h2>La compra de este mes</h2><p>${resumen.habituales} alimento(s) habituales.</p></div>${button('Cambios de este mes', 'navigate', 'btn-secondary btn-small', `data-page="canasta" data-month="${month}"`)}</div>
    <div class="card">${cambios
      ? `<p class="plan-cambios">Este mes se aparta de la costumbre en <strong>${cambios}</strong> cosa(s):
          ${resumen.cambiados ? `${resumen.cambiados} con otra cantidad` : ''}${resumen.cambiados && (resumen.quitados || resumen.extras) ? ' · ' : ''}${resumen.quitados ? `${resumen.quitados} que no se compran` : ''}${resumen.quitados && resumen.extras ? ' · ' : ''}${resumen.extras ? `${resumen.extras} extra` : ''}.</p>
         <p class="small muted">Los meses siguientes no se ven afectados.</p>`
      : '<p class="muted">Este mes es igual que siempre. No hay nada que revisar.</p>'}</div>`;
}

/* ── Calendario ────────────────────────────────────────────────────────── */

function renderCalendario(ctx) {
  const { state, ui } = ctx;
  const month = ui.mes.month;
  const { start, end } = monthBounds(month);
  const hueco = (new Date(`${start}T12:00:00`).getDay() + 6) % 7;
  const celdas = dateRange(start, end).map(date => {
    const dentro = date === hoy ? 'hoy' : '';
    return `<div class="month-cell ${dentro}">
      <div class="number">${Number(date.slice(8))}</div>
      ${SLOTS.map(slot => {
        const plan = planFor(state, date, slot);
        // Una merienda vacía no ocupa sitio en la casilla del día. Están las
        // que alguien puso, y el resto se añade desde la comida de al lado.
        if (!plan && esOpcional(slot)) return '';
        const estado = !plan || plan.kind === 'unplanned' ? 'missing' : plan.kind === 'outside' || plan.kind === 'order' ? 'fuera' : '';
        return `<button type="button" class="month-meal ${estado} ${esOpcional(slot) ? 'month-meal-opcional' : ''}" data-action="open-meal" data-date="${date}" data-slot="${slot}" aria-label="${esc(etiquetaDeMomento(slot))} del ${esc(niceDate(date, { day: 'numeric', month: 'long' }))}"><span>${esc(letraDeMomento(slot))}</span> ${esc(plan ? tituloDePlan(plan) : 'Agregar')}</button>`;
      }).join('')}
      ${SLOTS.filter(esOpcional).every(slot => planFor(state, date, slot))
        ? ''
        : `<button type="button" class="month-meal month-meal-merienda" data-action="open-meal" data-date="${date}" data-slot="${SLOTS.filter(esOpcional).find(slot => !planFor(state, date, slot))}" aria-label="Añadir una merienda al ${esc(niceDate(date, { day: 'numeric', month: 'long' }))}">+ merienda</button>`}
    </div>`;
  }).join('');
  return `${barraDeMes(ctx, `<div class="inline">${button('Volver al resumen', 'mes-vista', 'btn-secondary btn-small', 'data-vista="resumen"')}</div>`)}
    ${avisoDeApertura(ctx)}
    <div class="card calendar-card"><div class="calendar-month">
      ${WEEKDAY_SHORT.map(dia => `<div class="day-head">${esc(dia)}</div>`).join('')}
      ${Array.from({ length: hueco }, () => '<div class="month-cell outside"></div>').join('')}
      ${celdas}
    </div></div>
    <div class="inline plan-calendario-pie">
      ${button('+ Nueva rutina', 'mes-nueva-rutina', 'btn-secondary')}
      ${button('Usar el patrón del mes pasado', 'mes-copiar-patron', 'btn-quiet')}
    </div>`;
}

const tituloDePlan = plan => plan.kind === 'recipe' || plan.kind === 'linked'
  ? plan.title
  : ({ outside: 'Fuera de casa', order: 'Pedido', unplanned: 'Sin decidir' }[plan.kind] || 'Sin decidir');

/* ── El recorrido de «Preparar este mes» ───────────────────────────────── */

function renderPaso(ctx) {
  const { ui } = ctx;
  const indice = PASOS.findIndex(paso => paso.id === ui.mes.paso);
  const paso = PASOS[indice];
  const cuerpo = ({
    rutinas: pasoRutinas,
    comparar: pasoComparar,
    salidas: pasoSalidas,
    pendientes: pasoPendientes,
    canasta: pasoCanasta,
    compra: pasoCompra,
    listo: pasoListo
  })[paso.id](ctx);
  const ultimo = paso.id === 'listo';
  return `<section class="plan-paso">
    <div class="plan-paso-head">
      <div class="progress"><span style="width:${Math.round((indice + 1) / PASOS.length * 100)}%"></span></div>
      <div class="between">
        <span class="small muted">Paso ${indice + 1} de ${PASOS.length} · ${esc(monthName(ui.mes.month))}</span>
        ${button('Salir', 'mes-salir-paso', 'btn-quiet btn-small')}
      </div>
      <h2>${esc(paso.pregunta || paso.titulo)}</h2>
    </div>
    ${cuerpo}
    <div class="plan-paso-pie">
      ${indice > 0 && !ultimo ? button('Atrás', 'mes-paso-atras', 'btn-secondary') : '<span></span>'}
      ${ultimo ? button('Terminar', 'mes-salir-paso', 'btn-primary') : button('Continuar', 'mes-paso-siguiente', 'btn-primary')}
    </div>
  </section>`;
}

function pasoRutinas(ctx) {
  const { state, ui } = ctx;
  const rutinas = routinesFor(state, ui.mes.month);
  return `<p class="plan-paso-texto">Estas son las comidas que se repiten en tu casa. Se guardan una vez y llenan el calendario de cada mes; aquí solo compruebas que siguen siendo verdad.</p>
    ${rutinas.length
      ? `<div class="card">${rutinas.map(rutina => filaDeRutina(state, ui.mes.month, rutina)).join('')}</div>
         <div class="inline" style="margin-top:14px">${button('+ Añadir otra', 'mes-nueva-rutina', 'btn-secondary')}${button('Aplicarlas todas a este mes', 'mes-aplicar-todas', 'btn-secondary')}</div>`
      : empty('🔁', 'Todavía no hay ninguna', 'Una rutina es algo como «mangú con salami, los martes y jueves de desayuno». Con dos o tres, el mes entero queda hecho.', `${button('Crear mi primera rutina', 'mes-nueva-rutina', 'btn-primary')}${button('Usar el patrón del mes pasado', 'mes-copiar-patron', 'btn-secondary')}`)}
    ${avisoDeApertura(ctx)}`;
}

// Comparar con el mes pasado no es una estadística: es la forma de acordarse de
// lo que se hizo distinto. «El mes pasado comimos fuera cuatro veces y este
// llevas una» es una frase que hace pensar; dos gráficos, no.
function pasoComparar(ctx) {
  const { state, ui } = ctx;
  const mes = ui.mes.month;
  const anterior = shiftMonth(mes, -1);
  const seOrganizoAntes = Boolean(state.monthPlans?.[anterior]) || state.plans.some(plan => plan.date.slice(0, 7) === anterior);
  if (!seOrganizoAntes) {
    return `<p class="plan-paso-texto">${esc(monthName(anterior))} no llegó a organizarse, así que no hay con qué comparar. Sigue adelante.</p>`;
  }
  const antes = monthProgress(state, anterior);
  const ahora = monthProgress(state, mes);
  const fila = (etiqueta, a, b) => `<tr><td>${esc(etiqueta)}</td><td class="num">${a}</td><td class="num strong">${b}</td></tr>`;

  // Y qué cambia en lo que se compra: los alimentos cuya cantidad no coincide.
  const mapa = lista => new Map(lista.map(linea => [linea.productId, linea]));
  const deAntes = mapa(effectiveBasket(state, anterior));
  const deAhora = mapa(effectiveBasket(state, mes));
  const distintos = [];
  for (const [id, linea] of deAhora) {
    const viejo = deAntes.get(id);
    if (!viejo) distintos.push(`${nombreProducto(state, id)}: nuevo este mes`);
    else if (viejo.quantity !== linea.quantity) distintos.push(`${nombreProducto(state, id)}: ${viejo.quantity === null ? 'sin cantidad' : measure(viejo.quantity, viejo.unit)} → ${linea.quantity === null ? 'sin cantidad' : measure(linea.quantity, linea.unit)}`);
  }
  for (const [id] of deAntes) if (!deAhora.has(id)) distintos.push(`${nombreProducto(state, id)}: este mes no se compra`);

  return `<p class="plan-paso-texto">Así va ${esc(monthName(mes))} comparado con ${esc(monthName(anterior))}.</p>
    <div class="card table-wrap"><table class="data-table">
      <thead><tr><th></th><th class="num">${esc(monthName(anterior).split(' ')[0])}</th><th class="num">${esc(monthName(mes).split(' ')[0])}</th></tr></thead>
      <tbody>
        ${fila('Comidas en casa', antes.encasa, ahora.encasa)}
        ${fila('Fuera de casa', antes.fuera, ahora.fuera)}
        ${antes.pedido || ahora.pedido ? fila('Pedidas', antes.pedido, ahora.pedido) : ''}
        ${fila('Sin decidir', antes.pendientes, ahora.pendientes)}
      </tbody>
    </table></div>
    ${distintos.length
      ? `<div class="section-head"><h3 class="plan-sub">Lo que cambia en la compra</h3></div>
         <div class="card"><ul class="food-list">${distintos.slice(0, 10).map(texto => `<li>${esc(texto)}</li>`).join('')}</ul>${distintos.length > 10 ? `<p class="small muted">Y ${distintos.length - 10} más.</p>` : ''}</div>`
      : '<p class="small muted">En la compra, este mes es igual que el pasado.</p>'}
    ${ahora.pendientes > antes.pendientes && antes.encasa
      ? `<div class="inline" style="margin-top:14px">${button(`Usar el patrón de ${monthName(anterior)}`, 'mes-copiar-patron', 'btn-secondary')}</div>`
      : ''}
    ${avisoDeApertura(ctx)}`;
}

// La lista sale de lo que ya está decidido, y se enseña aquí para que el mes no
// se dé por organizado sin haber mirado lo que va a costar.
function pasoCompra(ctx) {
  const { state, ui } = ctx;
  const { start, end } = monthBounds(ui.mes.month);
  let lista;
  try { lista = shoppingList(state, start, end, 'casa'); }
  catch (error) { return `<p class="plan-paso-texto">No se pudo calcular la lista: ${esc(error.message)}</p>`; }
  const faltan = lista.lines.filter(linea => linea.shortfall > 0);
  if (!faltan.length) {
    return `<div class="card plan-ok"><span class="plan-ok-icono">✓</span><div><strong>No falta nada.</strong><span>Con lo que hay en casa alcanza para ${esc(monthName(ui.mes.month))}.</span></div></div>
      <div class="inline" style="margin-top:14px">${button('Abrir la compra', 'navigate', 'btn-secondary', 'data-page="compra"')}</div>`;
  }
  return `<p class="plan-paso-texto">Esto es lo que haría falta comprar para todo ${esc(monthName(ui.mes.month))}, según tu canasta y lo que ya queda en casa. Todavía no hay que hacer nada: es para que lo veas antes de dar el mes por cerrado.</p>
    <div class="card">${faltan.slice(0, 12).map(linea => {
      const item = state.products.find(row => row.id === linea.productId);
      return `<div class="list-row"><div class="list-row-main"><div class="list-row-title">${esc(item?.name || '')}</div></div><div class="compra-cantidad">${linea.purchaseQuantity === null ? '<span class="pill gray">falta una medida</span>' : `<strong>${esc(measure(linea.purchaseQuantity, linea.purchaseUnit))}</strong>`}</div></div>`;
    }).join('')}</div>
    ${faltan.length > 12 ? `<p class="small muted">Y ${faltan.length - 12} alimento(s) más.</p>` : ''}
    <div class="inline" style="margin-top:14px">${button('Abrir la compra', 'navigate', 'btn-secondary', 'data-page="compra"')}</div>`;
}

// Los domingos son el caso real que pidió el usuario: primer y tercer domingo
// fuera, segundo y cuarto en casa. Los atajos escriben esa regla sin que haya
// que entender qué es un ordinal dentro del mes.
const ATAJOS_SALIDA = [
  { id: 'todos-domingos', etiqueta: 'Todos los domingos', weekdays: [7], weeks: null },
  { id: 'primer-tercer', etiqueta: 'Primer y tercer domingo', weekdays: [7], weeks: [1, 3] },
  { id: 'segundo-cuarto', etiqueta: 'Segundo y cuarto domingo', weekdays: [7], weeks: [2, 4] },
  { id: 'viernes', etiqueta: 'Todos los viernes', weekdays: [5], weeks: null }
];

function pasoSalidas(ctx) {
  const { state, ui } = ctx;
  const month = ui.mes.month;
  const salidas = routinesFor(state, month).filter(rutina => rutina.kind === 'outside' || rutina.kind === 'order');
  const sueltas = [];
  const { start, end } = monthBounds(month);
  for (const date of dateRange(start, end)) for (const slot of SLOTS) {
    const plan = planFor(state, date, slot);
    if (plan && (plan.kind === 'outside' || plan.kind === 'order') && !plan.routineId) sueltas.push({ date, slot, plan });
  }
  sueltas.sort((a, b) => a.date.localeCompare(b.date) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  return `<p class="plan-paso-texto">Marcar una comida fuera de casa la deja resuelta: no aparece como pendiente y no gasta alimentos del menú.</p>
    <div class="card">
      <h3 class="plan-sub">Lo más común</h3>
      <div class="chips">${ATAJOS_SALIDA.map(atajo => `<button type="button" class="chip" data-action="mes-salida-rapida" data-atajo="${atajo.id}">${esc(atajo.etiqueta)}</button>`).join('')}</div>
      <p class="small muted" style="margin-top:12px">Te preguntamos qué comida y si vale solo para ${esc(monthName(month))} o desde ahora siempre.</p>
    </div>
    ${salidas.length ? `<div class="section-head"><h3 class="plan-sub">Reglas guardadas</h3></div><div class="card">${salidas.map(rutina => filaDeRutina(state, month, rutina)).join('')}</div>` : ''}
    ${sueltas.length ? `<div class="section-head"><h3 class="plan-sub">Días sueltos de este mes</h3></div><div class="card">${sueltas.map(item => `<div class="list-row"><div class="list-row-main"><div class="list-row-title">${esc(niceDate(item.date, { weekday: 'long', day: 'numeric', month: 'long' }))}</div><div class="list-row-sub">${esc(etiquetaDeMomento(item.slot))} · ${item.plan.kind === 'outside' ? 'fuera de casa' : 'pedido'}</div></div>${button('Quitar', 'mes-quitar-salida', 'btn-quiet btn-small', `data-id="${item.plan.id}"`)}</div>`).join('')}</div>` : ''}
    ${avisoDeApertura(ctx)}`;
}

const LETRAS_DE_MOMENTO = { desayuno: 'D', 'merienda-manana': 'M↑', almuerzo: 'A', 'merienda-tarde': 'M↓', cena: 'C' };
const letraDeMomento = slot => LETRAS_DE_MOMENTO[slot] || String(slot).charAt(0).toUpperCase();

function pasoPendientes(ctx) {
  const { state, ui } = ctx;
  const month = ui.mes.month;
  const { start, end } = monthBounds(month);
  // Solo se cuentan como pendientes las tres de todos los días. Enseñar
  // sesenta meriendas «sin decidir» convertiría esta lista en una queja.
  const pendientes = [];
  for (const date of dateRange(start, end)) for (const slot of SLOTS_PRINCIPALES) {
    const plan = planFor(state, date, slot);
    if (!plan || plan.kind === 'unplanned') pendientes.push({ date, slot });
  }
  if (!pendientes.length) {
    return `<div class="card plan-ok"><span class="plan-ok-icono">✓</span><div><strong>No queda ningún hueco.</strong><span>Las ${SLOTS_PRINCIPALES.length * dateRange(start, end).length} comidas de ${esc(monthName(month))} están decididas. Las meriendas son aparte: se ponen cuando las hay.</span></div></div>`;
  }
  const tope = ui.mes.verPendientes;
  const mostrados = pendientes.slice(0, tope);
  return `<p class="plan-paso-texto">Quedan <strong>${pendientes.length}</strong> comidas sin decidir. No hace falta llenarlas todas: lo que dejes en blanco sigue estando ahí mañana.</p>
    <div class="card">${mostrados.map(item => `<div class="list-row plan-pendiente">
      <div class="list-row-main">
        <div class="list-row-title">${esc(niceDate(item.date, { weekday: 'long', day: 'numeric', month: 'short' }))}</div>
        <div class="list-row-sub">${esc(etiquetaDeMomento(item.slot))}</div>
      </div>
      <div class="inline">
        ${button('Elegir comida', 'open-meal', 'btn-secondary btn-small', `data-date="${item.date}" data-slot="${item.slot}"`)}
        ${button('Fuera', 'mes-marcar', 'btn-quiet btn-small', `data-date="${item.date}" data-slot="${item.slot}" data-kind="outside"`)}
      </div>
    </div>`).join('')}</div>
    ${pendientes.length > tope ? `<div class="inline" style="margin-top:14px">${button(`Ver ${Math.min(12, pendientes.length - tope)} más`, 'mes-ver-mas-pendientes', 'btn-quiet')}</div>` : ''}
    <div class="inline" style="margin-top:14px">${button('Marcar todos los huecos como «todavía no sabemos»', 'mes-dejar-pendientes', 'btn-quiet btn-small')}</div>`;
}

function pasoCanasta(ctx) {
  const { state, ui } = ctx;
  const month = ui.mes.month;
  const resumen = monthBasketSummary(state, month);
  const lineas = effectiveBasket(state, month);
  const cambiadas = lineas.filter(linea => linea.source !== 'habitual');
  return `<p class="plan-paso-texto">Tu canasta habitual ya está aplicada a ${esc(monthName(month))}. Aquí solo se anota lo que este mes será diferente.</p>
    <div class="card plan-canasta-cifras">
      <div><strong>${resumen.habituales}</strong><span>de siempre</span></div>
      <div><strong>${resumen.cambiados}</strong><span>con otra cantidad</span></div>
      <div><strong>${resumen.quitados}</strong><span>que no se compran</span></div>
      <div><strong>${resumen.extras}</strong><span>extra de ${esc(monthName(month).split(' ')[0])}</span></div>
    </div>
    ${cambiadas.length ? `<div class="card">${cambiadas.map(linea => `<div class="list-row"><div class="list-row-main"><div class="list-row-title">${esc(nombreProducto(state, linea.productId))} <span class="pill warm">${linea.source === 'extra' ? 'solo este mes' : 'cantidad distinta'}</span></div><div class="list-row-sub">${linea.quantity === null ? 'cantidad pendiente' : esc(measure(linea.quantity, linea.unit))}</div></div></div>`).join('')}</div>` : ''}
    <div class="inline" style="margin-top:14px">
      ${button('Cambiar algo de este mes', 'navigate', 'btn-secondary', `data-page="canasta" data-month="${month}"`)}
      ${button('Ver la compra', 'navigate', 'btn-quiet', 'data-page="compra"')}
    </div>`;
}

const nombreProducto = (state, id) => state.products.find(item => item.id === id)?.name || 'Alimento eliminado';

// Los días del mes como fichas, con la inicial del día de la semana debajo: sin
// ella, elegir «los tres viernes que viene mi mamá» obliga a mirar un calendario
// aparte y contar.
function diasDelMes(month) {
  const { start, end } = monthBounds(month);
  return dateRange(start, end).map(date => ({
    date,
    numero: Number(date.slice(8)),
    inicial: WEEKDAY_SHORT[(new Date(`${date}T12:00:00`).getDay() + 6) % 7].slice(0, 1)
  }));
}

function pasoListo(ctx) {
  const { state, ui } = ctx;
  const month = ui.mes.month;
  const progreso = monthProgress(state, month);
  const resumen = monthBasketSummary(state, month);
  const cambios = resumen.cambiados + resumen.quitados + resumen.extras;
  return `<div class="card plan-ok"><span class="plan-ok-icono">✓</span><div><strong>Tu mes está organizado.</strong><span>${esc(monthName(month))}</span></div></div>
    <ul class="plan-lista-final">
      <li><strong>${progreso.encasa}</strong> comidas en casa</li>
      ${progreso.fuera ? `<li><strong>${progreso.fuera}</strong> comidas fuera</li>` : ''}
      ${progreso.pedido ? `<li><strong>${progreso.pedido}</strong> comidas pedidas</li>` : ''}
      <li><strong>${progreso.pendientes}</strong> ${progreso.pendientes === 1 ? 'comida pendiente' : 'comidas pendientes'}</li>
      <li><strong>${cambios}</strong> ${cambios === 1 ? 'cambio' : 'cambios'} en la compra habitual</li>
    </ul>
    <div class="inline" style="margin-top:16px">${button('Ver la compra de este mes', 'navigate', 'btn-primary', 'data-page="compra"')}${button('Ver el calendario', 'mes-vista', 'btn-secondary', 'data-vista="calendario"')}</div>`;
}

/* ── El formulario de una rutina ───────────────────────────────────────── */

// Una sola pantalla con cinco preguntas cortas, y en este orden: qué, cuándo,
// qué días, cuáles de esos días, y hasta cuándo. Ese es el orden en que la
// persona lo piensa, y por eso no hace falta explicar ninguna.
export function modalRutina(ctx, extras = {}) {
  const { state } = ctx;
  const month = extras.month;
  const prefijo = extras.atajo ? ATAJOS_SALIDA.find(item => item.id === extras.atajo) : null;
  const dias = prefijo?.weekdays || [];
  const semanas = prefijo?.weeks || null;
  const tipo = extras.kind || (prefijo ? 'outside' : 'recipe');
  return modal(prefijo ? prefijo.etiqueta : 'Una comida que se repite',
    `En ${monthName(month)} y, si quieres, en los meses siguientes`,
    `<form data-form="rutina" data-month="${esc(month)}" class="modal-body rutina-form">
      <fieldset class="field-group"><legend>¿Qué comen?</legend>
        <div class="radio-fila">
          <label class="radio-pill"><input type="radio" name="kind" value="recipe" ${tipo === 'recipe' ? 'checked' : ''}><span>Una preparación</span></label>
          <label class="radio-pill"><input type="radio" name="kind" value="outside" ${tipo === 'outside' ? 'checked' : ''}><span>Fuera de casa</span></label>
          <label class="radio-pill"><input type="radio" name="kind" value="order" ${tipo === 'order' ? 'checked' : ''}><span>Pedimos comida</span></label>
        </div>
        <label class="field" data-rutina-receta ${tipo === 'recipe' ? '' : 'hidden'}><span>¿Cuál?</span>
          <select name="recipeId">${options(state.recipes.map(item => [item.id, item.name]), '', state.recipes.length ? 'Elegir una preparación' : 'Todavía no hay preparaciones')}</select>
        </label>
      </fieldset>

      <fieldset class="field-group"><legend>¿En qué comida?</legend>
        <div class="chips">${MOMENTOS.map(momento => `<label class="chip-check"><input type="checkbox" name="slots" value="${momento.id}"><span>${esc(momento.etiqueta)}</span></label>`).join('')}</div>
      </fieldset>

      <fieldset class="field-group"><legend>¿Qué días?</legend>
        <div class="segmented segmented-ancho">
          <button type="button" data-action="rutina-modo-dias" data-modo="semana" class="active">Días de la semana</button>
          <button type="button" data-action="rutina-modo-dias" data-modo="sueltos">Días sueltos</button>
        </div>

        <div data-dias-semana>
          <div class="chips dias-semana">${WEEKDAYS.map((dia, indice) => `<label class="chip-check"><input type="checkbox" name="weekdays" value="${dia}" ${dias.includes(dia) ? 'checked' : ''}><span>${esc(WEEKDAY_SHORT[indice])}</span></label>`).join('')}</div>
          <p class="hint" style="margin-top:12px">¿Todos esos días, o solo algunos?</p>
          <div class="radio-fila" style="margin-top:8px">
            <label class="radio-pill"><input type="radio" name="weeks" value="todas" ${semanas ? '' : 'checked'}><span>Todos</span></label>
            <label class="radio-pill"><input type="radio" name="weeks" value="1,3" ${String(semanas) === '1,3' ? 'checked' : ''}><span>1.º y 3.º</span></label>
            <label class="radio-pill"><input type="radio" name="weeks" value="2,4" ${String(semanas) === '2,4' ? 'checked' : ''}><span>2.º y 4.º</span></label>
          </div>
          <p class="hint">«Primer y tercer domingo» son el primer y el tercer domingo que caen en el mes, sean las fechas que sean.</p>
          <label class="field" style="margin-top:14px"><span>Hasta el día (opcional)</span>
            <input type="date" name="hasta" min="${esc(monthBounds(month).start)}" max="${esc(monthBounds(month).end)}">
            <small>Déjalo vacío para todo el mes. Sirve para «solo hasta que vuelva el niño de las vacaciones».</small>
          </label>
        </div>

        <div data-dias-sueltos hidden>
          <p class="hint" style="margin-bottom:10px">Marca los días de ${esc(monthName(month))} que quieras. Esto no crea una costumbre: pone esas comidas y ya.</p>
          <div class="chips dias-mes">${diasDelMes(month).map(({ date, numero, inicial }) =>
            `<label class="chip-check dia-suelto"><input type="checkbox" name="fechas" value="${date}"><span>${numero}<em>${esc(inicial)}</em></span></label>`).join('')}</div>
        </div>
      </fieldset>

      <fieldset class="field-group" data-alcance-rutina><legend>¿Hasta cuándo?</legend>
        <div class="radio-fila">
          <label class="radio-pill"><input type="radio" name="scope" value="month" checked><span>Solo ${esc(monthName(month))}</span></label>
          <label class="radio-pill"><input type="radio" name="scope" value="permanent"><span>Desde ahora, todos los meses</span></label>
        </div>
      </fieldset>

      <fieldset class="field-group"><legend>¿Y si ese día ya tenía algo?</legend>
        <div class="radio-fila">
          <label class="radio-pill"><input type="radio" name="modo" value="vacios" checked><span>Dejarlo como está</span></label>
          <label class="radio-pill"><input type="radio" name="modo" value="reemplazar"><span>Reemplazarlo</span></label>
        </div>
      </fieldset>

      <div class="modal-actions">
        ${button('Cancelar', 'close-modal', 'btn-secondary')}
        <button type="submit" class="btn btn-primary">Guardar y aplicar</button>
      </div>
    </form>`, true);
}

/* ── Acciones ──────────────────────────────────────────────────────────── */

export const MES_ACTIONS = {
  'mes-mover': (el, ctx) => {
    ctx.ui.mes.month = shiftMonth(ctx.ui.mes.month, Number(el.dataset.delta));
    ctx.ui.mes.verPendientes = 12;
    abrirMesSiHaceFalta(ctx, ctx.ui.mes.month);
    ctx.commit('');
  },
  'mes-hoy': (el, ctx) => {
    ctx.ui.mes.month = hoy.slice(0, 7);
    abrirMesSiHaceFalta(ctx, ctx.ui.mes.month);
    ctx.commit('');
  },
  'mes-vista': (el, ctx) => { ctx.ui.mes.vista = el.dataset.vista; ctx.render(); },
  'mes-preparar': (el, ctx) => { ctx.ui.mes.paso = PASOS[0].id; ctx.ui.mes.verPendientes = 12; ctx.render(); },
  'mes-salir-paso': (el, ctx) => { ctx.ui.mes.paso = null; ctx.render(); },
  'mes-paso-siguiente': (el, ctx) => {
    const indice = PASOS.findIndex(paso => paso.id === ctx.ui.mes.paso);
    ctx.ui.mes.paso = PASOS[Math.min(PASOS.length - 1, indice + 1)].id;
    ctx.ui.mes.verPendientes = 12;
    ctx.render();
  },
  'mes-paso-atras': (el, ctx) => {
    const indice = PASOS.findIndex(paso => paso.id === ctx.ui.mes.paso);
    ctx.ui.mes.paso = PASOS[Math.max(0, indice - 1)].id;
    ctx.render();
  },
  'mes-ver-mas-pendientes': (el, ctx) => { ctx.ui.mes.verPendientes += 12; ctx.render(); },
  'mes-nueva-rutina': (el, ctx) => ctx.openModal('rutina', { month: ctx.ui.mes.month }),
  // Cambiar entre «días de la semana» y «días sueltos» sin repintar: repintar
  // borraría lo que ya se hubiera marcado arriba, que es la mitad del formulario.
  'rutina-modo-dias': (el, ctx) => {
    const form = el.closest('form');
    const sueltos = el.dataset.modo === 'sueltos';
    form.querySelector('[data-dias-semana]').hidden = sueltos;
    form.querySelector('[data-dias-sueltos]').hidden = !sueltos;
    // Unas fechas concretas no pueden valer «todos los meses»: el 4 y el 11 de
    // octubre no significan nada en noviembre.
    form.querySelector('[data-alcance-rutina]').hidden = sueltos;
    for (const boton of el.parentElement.querySelectorAll('button')) boton.classList.toggle('active', boton === el);
  },
  'mes-salida-rapida': (el, ctx) => ctx.openModal('rutina', { month: ctx.ui.mes.month, atajo: el.dataset.atajo, kind: 'outside' }),

  'mes-aplicar-rutina': (el, ctx) => {
    const antes = snapshot(ctx.state);
    const resultado = applyRoutine(ctx.state, el.dataset.id, ctx.ui.mes.month, { modo: 'vacios' });
    guardarDeshacer(ctx, antes, resultado);
    ctx.commit(mensajeDeAplicacion(resultado));
  },

  'mes-aplicar-todas': (el, ctx) => {
    const antes = snapshot(ctx.state);
    const resultado = applyRoutines(ctx.state, ctx.ui.mes.month, { modo: 'vacios' });
    guardarDeshacer(ctx, antes, resultado);
    ctx.commit(mensajeDeAplicacion(resultado));
  },

  'mes-borrar-rutina': (el, ctx) => {
    const rutina = ctx.state.mealRoutines.find(item => item.id === el.dataset.id);
    const planes = ctx.state.plans.filter(plan => plan.routineId === el.dataset.id);
    // Quitar la rutina sin tocar las comidas ya puestas es casi siempre lo que
    // se quiere: «ya no comemos esto los lunes» no significa «borra el lunes
    // pasado». Por eso se pregunta en vez de decidirlo nosotros.
    const borrarComidas = planes.length
      ? window.confirm(`«${tituloDeRutina(ctx.state, rutina)}» está puesta en ${planes.length} comida(s). ¿Quitar también esas comidas del calendario?\n\nAceptar: se quitan.\nCancelar: se quedan, pero dejan de repetirse.`)
      : false;
    const antes = snapshot(ctx.state);
    if (borrarComidas) for (const plan of [...planes]) deletePlan(ctx.state, plan.id, true);
    deleteRoutine(ctx.state, el.dataset.id);
    ctx.ui.mes.deshacer = antes;
    ctx.ui.mes.aviso = { tipo: 'rutina', month: ctx.ui.mes.month, titulo: 'Rutina quitada.', detalle: borrarComidas ? `${planes.length} comida(s) salieron del calendario.` : 'Las comidas ya puestas se quedan donde estaban.' };
    ctx.commit('');
  },

  'mes-marcar': (el, ctx) => {
    const existente = planFor(ctx.state, el.dataset.date, el.dataset.slot);
    if (existente) deletePlan(ctx.state, existente.id, true);
    setStatusPlan(ctx.state, el.dataset.date, el.dataset.slot, el.dataset.kind);
    ctx.commit('Comida marcada fuera de casa.');
  },

  'mes-quitar-salida': (el, ctx) => {
    deletePlan(ctx.state, el.dataset.id, true);
    ctx.commit('Esa comida vuelve a estar pendiente.');
  },

  'mes-dejar-pendientes': (el, ctx) => {
    ctx.toast('Los huecos ya quedan así. Puedes volver cuando quieras.');
    ctx.ui.mes.paso = 'canasta';
    ctx.render();
  },

  'mes-copiar-patron': (el, ctx) => {
    const destino = ctx.ui.mes.month;
    const origen = shiftMonth(destino, -1);
    const antes = snapshot(ctx.state);
    const resultado = copyPatternFromMonth(ctx.state, origen, destino);
    if (!resultado.creados.length) {
      ctx.toast(`No hay nada que copiar de ${monthName(origen)}.`, true);
      return;
    }
    ctx.ui.mes.deshacer = antes;
    ctx.ui.mes.aviso = {
      tipo: 'rutina', month: destino,
      titulo: `${resultado.creados.length} comida(s) copiadas de ${monthName(origen)}.`,
      detalle: 'Se copiaron por día de la semana, no por número de fecha. Las salidas y los días especiales del mes pasado no se copian.'
    };
    ctx.commit('');
  },

  'mes-deshacer': (el, ctx) => {
    if (!ctx.ui.mes.deshacer) return;
    restore(ctx.state, ctx.ui.mes.deshacer);
    ctx.ui.mes.deshacer = null;
    ctx.ui.mes.aviso = null;
    ctx.commit('Deshecho.');
  }
};

// Poner una comida en unas fechas concretas, sin crear ninguna rutina.
function ponerEnFechas(ctx, { fechas, slots, kind, recipeId, modo, month }) {
  const { state, ui } = ctx;
  if (modo === 'reemplazar') {
    const ocupadas = fechas.flatMap(date => slots.filter(slot => planFor(state, date, slot))).length;
    if (ocupadas && !window.confirm(`Esto va a reemplazar ${ocupadas} comida(s) que ya estaban puestas. ¿Continuar?`)) return;
  }
  const antes = snapshot(state);
  let puestas = 0, saltadas = 0;
  for (const date of fechas) for (const slot of slots) {
    const existente = planFor(state, date, slot);
    if (existente && modo !== 'reemplazar') { saltadas++; continue; }
    try {
      if (existente) deletePlan(state, existente.id, true);
      if (kind === 'recipe') makeRecipePlan(state, recipeId, date, slot);
      else setStatusPlan(state, date, slot, kind);
      puestas++;
    } catch { saltadas++; }
  }
  ui.mes.deshacer = puestas ? antes : null;
  ui.mes.aviso = {
    tipo: 'rutina', month,
    titulo: `${puestas} comida(s) puestas en ${fechas.length} día(s) sueltos.`,
    detalle: `${saltadas ? `${saltadas} se dejaron como estaban. ` : ''}Esto no se repetirá solo: son días concretos, no una costumbre.`
  };
  ctx.closeModal();
  ctx.commit('');
}

function guardarDeshacer(ctx, antes, resultado) {
  const tocado = (resultado.creados?.length || 0) + (resultado.reemplazados?.length || 0);
  ctx.ui.mes.deshacer = tocado ? antes : null;
}

function mensajeDeAplicacion(resultado) {
  const creados = resultado.creados?.length || 0;
  const saltados = resultado.saltados?.length || 0;
  if (!creados && !saltados) return 'No había ningún día que cubrir este mes.';
  if (!creados) return `Esos días ya tenían algo puesto. No se cambió nada.`;
  return saltados
    ? `${creados} comida(s) puestas. ${saltados} día(s) ya tenían algo y se dejaron como estaban.`
    : `${creados} comida(s) puestas.`;
}

/* ── Formularios ───────────────────────────────────────────────────────── */

export const MES_FORMS = {
  rutina: (form, data, ctx) => {
    const { state, ui } = ctx;
    const month = form.dataset.month;
    const kind = data.get('kind') || 'recipe';
    const slots = [...form.querySelectorAll('[name="slots"]:checked')].map(input => input.value);
    const modo = data.get('modo') === 'reemplazar' ? 'reemplazar' : 'vacios';
    const sueltos = !form.querySelector('[data-dias-sueltos]').hidden;

    if (!slots.length) throw new Error('Marca al menos una comida: desayuno, almuerzo o cena.');
    if (kind === 'recipe' && !data.get('recipeId')) throw new Error('Elige qué preparación se repite, o marca «fuera de casa».');

    // Días sueltos no es una rutina, y guardarlo como tal sería mentir: «el 4, el
    // 11 y el 19» no describe ninguna costumbre que repetir el mes que viene.
    // Se ponen esas comidas y punto.
    if (sueltos) {
      const fechas = [...form.querySelectorAll('[name="fechas"]:checked')].map(input => input.value).sort();
      if (!fechas.length) throw new Error('Marca al menos un día del mes.');
      return ponerEnFechas(ctx, { fechas, slots, kind, recipeId: data.get('recipeId'), modo, month });
    }

    const weekdays = [...form.querySelectorAll('[name="weekdays"]:checked')].map(input => Number(input.value));
    const semanasCrudas = data.get('weeks');
    const weeks = !semanasCrudas || semanasCrudas === 'todas' ? null : semanasCrudas.split(',').map(Number);
    const scope = data.get('scope') === 'permanent' ? 'permanent' : 'month';
    const hasta = String(data.get('hasta') || '') || null;
    if (!weekdays.length) throw new Error('Marca al menos un día de la semana.');

    const fechas = datesForRule(month, weekdays, weeks).filter(date => !hasta || date <= hasta);
    if (!fechas.length) throw new Error('Con esos días y esa fecha final no queda ningún día del mes.');
    if (modo === 'reemplazar') {
      const ocupadas = fechas.flatMap(date => slots.filter(slot => planFor(state, date, slot))).length;
      if (ocupadas && !window.confirm(`Esto va a reemplazar ${ocupadas} comida(s) que ya estaban puestas en ${monthName(month)}. ¿Continuar?`)) return;
    }

    const antes = snapshot(state);
    const rutina = addRoutine(state, {
      kind,
      recipeId: kind === 'recipe' ? data.get('recipeId') : null,
      slots, weekdays, weeks, scope, until: hasta,
      month: scope === 'month' ? month : null
    });
    const resultado = applyRoutine(state, rutina.id, month, { modo, hasta });

    ui.mes.deshacer = antes;
    ui.mes.aviso = {
      tipo: 'rutina', month,
      titulo: `${describeRule(weekdays, weeks)}: ${tituloDeRutina(state, rutina).toLowerCase()}.`,
      detalle: `${resultado.creados.length} comida(s) puestas en ${monthName(month)}${resultado.saltados.length ? `, ${resultado.saltados.length} día(s) se dejaron como estaban` : ''}.${hasta ? ` Hasta el ${niceDate(hasta, { day: 'numeric', month: 'long' })}.` : ''} ${scope === 'permanent' ? 'Se repetirá en los meses siguientes.' : `Vale solo para ${monthName(month)}.`}`
    };
    ctx.closeModal();
    ctx.commit('');
  }
};
