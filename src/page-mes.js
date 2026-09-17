// Plan mensual: la pantalla donde se decide qué se come.
//
// Aquí hubo una máquina. Se escribía una costumbre —«mangú los lunes de
// desayuno»— y la app llenaba dieciocho desayunos de un golpe; al entrar en
// octubre por primera vez, el mes se montaba solo. Era cómodo y era el problema:
// el calendario se llenaba de comidas que nadie había decidido, y revisarlas una
// por una costaba más que haberlas puesto.
//
// Ahora no se llena nada solo. La persona pone lo que quiere comer, el día que
// quiere comerlo. Para no tener que tocar treinta casillas hay una sola ayuda, y
// no adivina nada: se elige una preparación, se marcan los días —los siete de la
// semana que viene, o los catorce de las dos siguientes— y se ponen esos. Nada
// más. Lo que no se toca, se queda vacío, y un día vacío no es un error.
//
// La pantalla tiene dos caras: el resumen, que dice cuánto hay decidido y qué
// falta, y el calendario, que es el mes entero para tocarlo. Cada comida dice de
// dónde salió, que es lo que hace falta saber para atreverse a cambiarla.

import { MOMENTOS, ORIGENES, SLOTS, SLOTS_PRINCIPALES, WEEKDAY_SHORT, dateRange, deletePlan, esOpcional, etiquetaDeMomento, etiquetaDeOrigen, makeRecipePlan, monthBounds, monthProgress, origenDe, planFor, restore, setStatusPlan, snapshot, todayISO, weekdayOf } from './model.js';
import { button, empty, esc, modal, monthName, niceDate, notice, options, shiftMonth } from './ui-kit.js';
import { icono } from './icons.js';

const hoy = todayISO();

export function emptyMes(month = hoy.slice(0, 7)) {
  return { month, vista: 'resumen', deshacer: null, aviso: null, verPendientes: 12 };
}

/* ── Pantalla ──────────────────────────────────────────────────────────── */

export function renderMes(ctx) {
  const { ui } = ctx;
  if (!ui.mes) ui.mes = emptyMes();
  return ui.mes.vista === 'calendario' ? renderCalendario(ctx) : renderResumen(ctx);
}

function barraDeMes(ctx, extra = '') {
  const { ui } = ctx;
  return `<div class="toolbar plan-barra"><div class="inline">
    ${button(icono('izquierda', { tamano: 18 }), 'mes-mover', 'btn-secondary btn-small btn-flecha', 'data-delta="-1" aria-label="Mes anterior"')}
    <div class="strong plan-mes-nombre">${esc(monthName(ui.mes.month))}</div>
    ${button(icono('derecha', { tamano: 18 }), 'mes-mover', 'btn-secondary btn-small btn-flecha', 'data-delta="1" aria-label="Mes siguiente"')}
    ${ui.mes.month === hoy.slice(0, 7) ? '' : button('Este mes', 'mes-hoy', 'btn-quiet btn-small')}
  </div>${extra}</div>`;
}

// Lo último que se hizo, dicho en voz alta y con su botón de deshacer. Poner
// catorce cenas de una vez sin que la pantalla diga nada deja a cualquiera
// mirando el calendario a ver si pasó algo.
function avisoDeCambio(ctx) {
  const { ui } = ctx;
  const aviso = ui.mes.aviso;
  if (!aviso || aviso.month !== ui.mes.month) return '';
  const deshacer = ui.mes.deshacer ? `<div class="inline" style="margin-top:10px">${button('Deshacer', 'mes-deshacer', 'btn-quiet btn-small')}</div>` : '';
  return notice(aviso.titulo, `${esc(aviso.detalle)}${deshacer}`, aviso.tono || '');
}

function renderResumen(ctx) {
  const { state, ui } = ctx;
  const month = ui.mes.month;
  const progreso = monthProgress(state, month);
  const enBlanco = !progreso.encasa && !progreso.fuera && !progreso.pedido && !progreso.meriendas;

  const cabecera = `<section class="plan-cabecera card">
    <div class="plan-cifra">
      <div class="plan-porcentaje">${progreso.porcentaje}<span>%</span></div>
      <div class="progress plan-progreso"><span style="width:${progreso.porcentaje}%"></span></div>
      <p class="plan-resumen-texto">${resumenEnPalabras(progreso)}</p>
    </div>
    <div class="plan-acciones">
      ${button('Poner una comida en varios días', 'mes-poner-en-dias', 'btn-primary')}
      ${button('Ver calendario', 'mes-vista', 'btn-secondary', 'data-vista="calendario"')}
    </div>
  </section>`;

  if (enBlanco) {
    return `${barraDeMes(ctx)}${avisoDeCambio(ctx)}${cabecera}
      ${empty('calendario', `${monthName(month)} está en blanco`,
        'Elige una preparación, marca los días en que la quieres comer y se ponen esos. Puedes hacerlo para la semana que viene, para las dos siguientes o para el mes entero: lo que no marques se queda vacío.',
        `${button('Empezar a planificar', 'mes-poner-en-dias', 'btn-primary')}${button('Ver calendario', 'mes-vista', 'btn-secondary', 'data-vista="calendario"')}`)}`;
  }

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

  return `${barraDeMes(ctx)}${avisoDeCambio(ctx)}${cabecera}${desglose}
    ${listaDePendientes(ctx, progreso)}
    ${seccionSalidas(ctx)}
    ${seccionAusencias(ctx)}`;
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

/* ── Calendario ────────────────────────────────────────────────────────── */

function renderCalendario(ctx) {
  const { state, ui } = ctx;
  const month = ui.mes.month;
  const { start, end } = monthBounds(month);
  const hueco = weekdayOf(start) - 1;
  const celdas = dateRange(start, end).map(date => {
    const dentro = date === hoy ? 'hoy' : '';
    return `<div class="month-cell ${dentro}">
      <button type="button" class="number" data-action="mes-abrir-dia" data-date="${date}" aria-label="Abrir el ${esc(niceDate(date, { weekday: 'long', day: 'numeric', month: 'long' }))}">${Number(date.slice(8))}</button>
      ${SLOTS.map(slot => {
        const plan = planFor(state, date, slot);
        // Una merienda vacía no ocupa sitio en la casilla del día. Están las
        // que alguien puso, y el resto se añade desde la comida de al lado.
        if (!plan && esOpcional(slot)) return '';
        const estado = !plan || plan.kind === 'unplanned' ? 'missing' : plan.kind === 'outside' || plan.kind === 'order' ? 'fuera' : '';
        const origen = plan ? origenDe(plan) : null;
        return `<button type="button" class="month-meal ${estado} ${esOpcional(slot) ? 'month-meal-opcional' : ''}" ${origen ? `data-origen="${origen}"` : ''} data-action="open-meal" data-date="${date}" data-slot="${slot}" aria-label="${esc(etiquetaDeMomento(slot))} del ${esc(niceDate(date, { day: 'numeric', month: 'long' }))}${origen ? `. ${esc(etiquetaDeOrigen(origen))}` : ''}"><span>${esc(letraDeMomento(slot))}</span> ${esc(plan ? tituloDePlan(plan) : 'Agregar')}</button>`;
      }).join('')}
      ${SLOTS.filter(esOpcional).every(slot => planFor(state, date, slot))
        ? ''
        : `<button type="button" class="month-meal month-meal-merienda" data-action="open-meal" data-date="${date}" data-slot="${SLOTS.filter(esOpcional).find(slot => !planFor(state, date, slot))}" aria-label="Añadir una merienda al ${esc(niceDate(date, { day: 'numeric', month: 'long' }))}">+ merienda</button>`}
    </div>`;
  }).join('');
  return `${barraDeMes(ctx, `<div class="inline">${button('Volver al resumen', 'mes-vista', 'btn-secondary btn-small', 'data-vista="resumen"')}</div>`)}
    ${avisoDeCambio(ctx)}
    <div class="card calendar-card"><div class="calendar-month">
      ${WEEKDAY_SHORT.map(dia => `<div class="day-head">${esc(dia)}</div>`).join('')}
      ${Array.from({ length: hueco }, () => '<div class="month-cell outside"></div>').join('')}
      ${celdas}
    </div></div>
    ${leyendaDeOrigenes(new Set(planesDelMes(state, month).map(origenDe)))}
    <p class="tiny muted">Toca una comida para cambiarla, o el número del día para verlo entero.</p>
    <div class="inline plan-calendario-pie">
      ${button('Poner una comida en varios días', 'mes-poner-en-dias', 'btn-secondary')}
    </div>`;
}

const tituloDePlan = plan => plan.kind === 'recipe' || plan.kind === 'linked'
  ? plan.title
  : ({ outside: 'Fuera de casa', order: 'Pedido', unplanned: 'Sin decidir' }[plan.kind] || 'Sin decidir');

/* ── De dónde salió cada comida ────────────────────────────────────────── */

// Un color y una palabra. El color vale para el calendario, donde no cabe una
// frase; la palabra vale para todo lo demás, que es donde de verdad se lee.
const puntoDeOrigen = origen => `<span class="origen-punto origen-${esc(origen)}" aria-hidden="true"></span>`;
const chipDeOrigen = origen => `<span class="origen-chip origen-${esc(origen)}">${puntoDeOrigen(origen)}${esc(etiquetaDeOrigen(origen))}</span>`;

// La leyenda enseña los orígenes que de verdad hay en este mes. Dos de los
// cinco —«rutina» y «sugerida»— ya no los produce nadie: son de cuando la app
// llenaba el calendario sola, y siguen existiendo para que una comida guardada
// entonces pueda seguir diciendo de dónde vino. Enseñarlos en la leyenda de un
// mes que no los tiene sería prometer algo que la app ya no hace.
function leyendaDeOrigenes(presentes = null) {
  const lista = presentes ? ORIGENES.filter(origen => presentes.has(origen.id)) : ORIGENES;
  if (!lista.length) return '';
  return `<div class="origen-leyenda">${lista.map(origen =>
    `<span class="origen-chip origen-${esc(origen.id)}" title="${esc(origen.detalle)}">${puntoDeOrigen(origen.id)}${esc(origen.etiqueta)}</span>`).join('')}</div>`;
}

function planesDelMes(state, month) {
  const { start, end } = monthBounds(month);
  return state.plans
    .filter(plan => plan.date >= start && plan.date <= end && plan.kind !== 'unplanned')
    .sort((a, b) => a.date.localeCompare(b.date) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
}

/* ── Los días que no se cocina en casa ─────────────────────────────────── */

function seccionSalidas(ctx) {
  const { state, ui } = ctx;
  const salidas = planesDelMes(state, ui.mes.month).filter(plan => plan.kind === 'outside' || plan.kind === 'order');
  return `<div class="section-head"><div><h2>Días que no se cocina en casa</h2><p class="small muted">Comer fuera, una comida en casa de alguien, o pedir. Marcarlo deja esa comida resuelta: deja de contar como pendiente.</p></div></div>
    <div class="card">${salidas.length
      ? salidas.slice(0, 10).map(plan => filaDeExcepcion(plan, button('Quitar', 'mes-quitar-salida', 'btn-quiet btn-small', `data-id="${plan.id}"`))).join('')
        + (salidas.length > 10 ? `<p class="small muted">Y ${salidas.length - 10} más. Están todas en el calendario.</p>` : '')
      : '<p class="muted">Ninguno este mes. Se marca abriendo el día en el calendario, o desde la lista de comidas sin decidir.</p>'}</div>`;
}

function filaDeExcepcion(plan, acciones = '') {
  const origen = origenDe(plan);
  return `<div class="list-row">
    <div class="list-row-main">
      <div class="list-row-title">${esc(niceDate(plan.date, { weekday: 'long', day: 'numeric', month: 'long' }))} ${chipDeOrigen(origen)}</div>
      <div class="list-row-sub">${esc(etiquetaDeMomento(plan.slot))} · ${esc(tituloDePlan(plan))}</div>
    </div>${acciones}</div>`;
}

// Que alguien no coma en casa un día es una excepción de las personas, no de la
// comida, y por eso vive aquí y no dentro del plato. Y anotarla no encoge la
// olla: se cocina lo mismo y sobra, que es lo que pasa en una casa de verdad.
function seccionAusencias(ctx) {
  const { state, ui } = ctx;
  const { start, end } = monthBounds(ui.mes.month);
  const ausencias = state.absences
    .filter(item => item.date >= start && item.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  const nombre = personId => state.people.find(person => person.id === personId)?.name || 'Alguien';
  return `<div class="section-head"><div><h2>Alguien que no come en casa</h2><p class="small muted">Se marca al abrir la comida de ese día. Queda anotado, y <strong>no cambia lo que se cocina</strong>: una olla de arroz no se achica porque un hijo avise a las seis.</p></div></div>
    <div class="card">${ausencias.length
      ? ausencias.slice(0, 10).map(item => `<div class="list-row">
          <div class="list-row-main">
            <div class="list-row-title">${esc(nombre(item.personId))}</div>
            <div class="list-row-sub">${esc(niceDate(item.date, { weekday: 'long', day: 'numeric', month: 'long' }))} · ${esc(etiquetaDeMomento(item.slot))}</div>
          </div>${button('Abrir ese día', 'mes-abrir-dia', 'btn-quiet btn-small', `data-date="${item.date}"`)}</div>`).join('')
        + (ausencias.length > 10 ? `<p class="small muted">Y ${ausencias.length - 10} más.</p>` : '')
      : '<p class="muted">Nadie marcado fuera este mes.</p>'}</div>`;
}

/* ── Lo que falta por decidir ──────────────────────────────────────────────

   Los huecos son un aviso, nunca una puerta cerrada. Y solo cuentan las tres
   comidas de todos los días: enseñar sesenta meriendas «sin decidir»
   convertiría esta lista en una queja. */

function listaDePendientes(ctx, progreso) {
  const { state, ui } = ctx;
  const month = ui.mes.month;
  const { start, end } = monthBounds(month);
  // Desde hoy, no desde el día 1. Un almuerzo del martes pasado no está «sin
  // decidir»: está comido. Enseñarlo con un botón para elegirlo es pedirle a
  // alguien que planifique hacia atrás, y entierra lo que sí hay que decidir.
  const desde = start > hoy ? start : hoy;
  const pendientes = [];
  if (end >= desde) for (const date of dateRange(desde, end)) for (const slot of SLOTS_PRINCIPALES) {
    const plan = planFor(state, date, slot);
    if (!plan || plan.kind === 'unplanned') pendientes.push({ date, slot });
  }
  if (!pendientes.length) {
    const pasado = end < hoy;
    return `<div class="card plan-ok"><span class="plan-ok-icono">✓</span><div><strong>${pasado ? esc(monthName(month)) + ' ya pasó.' : 'No queda ningún hueco.'}</strong><span>${pasado ? 'Lo que quedó sin anotar se queda como está: no hay nada que decidir hacia atrás.' : `Lo que queda de ${esc(monthName(month))} está decidido. Las meriendas van aparte: se ponen cuando las hay, y un día sin merienda está completo igual.`}</span></div></div>`;
  }
  const tope = ui.mes.verPendientes;
  return `<div class="section-head"><div><h2>Sin decidir, de hoy en adelante</h2><p class="small muted">No hace falta llenarlas. Un día en blanco sigue estando en blanco mañana, y las meriendas no cuentan.</p></div></div>
    <div class="card">${pendientes.slice(0, tope).map(item => `<div class="list-row plan-pendiente">
      <div class="list-row-main">
        <div class="list-row-title">${esc(niceDate(item.date, { weekday: 'long', day: 'numeric', month: 'short' }))}</div>
        <div class="list-row-sub">${esc(etiquetaDeMomento(item.slot))}</div>
      </div>
      <div class="inline">
        ${button('Elegir comida', 'open-meal', 'btn-secondary btn-small', `data-date="${item.date}" data-slot="${item.slot}"`)}
        ${button('Fuera', 'mes-marcar', 'btn-quiet btn-small', `data-date="${item.date}" data-slot="${item.slot}" data-kind="outside"`)}
      </div>
    </div>`).join('')}</div>
    ${pendientes.length > tope ? `<div class="inline" style="margin-top:12px">${button(`Ver ${Math.min(12, pendientes.length - tope)} más`, 'mes-ver-mas-pendientes', 'btn-quiet btn-small')}</div>` : ''}`;
}

const LETRAS_DE_MOMENTO = { desayuno: 'D', 'merienda-manana': 'M↑', almuerzo: 'A', 'merienda-tarde': 'M↓', cena: 'C' };
const letraDeMomento = slot => LETRAS_DE_MOMENTO[slot] || String(slot).charAt(0).toUpperCase();

// Los días del mes como fichas, con la inicial del día de la semana debajo: sin
// ella, elegir «los tres viernes que viene mi mamá» obliga a mirar un calendario
// aparte y contar.
function diasDelMes(month) {
  const { start, end } = monthBounds(month);
  return dateRange(start, end).map(date => ({
    date,
    numero: Number(date.slice(8)),
    inicial: WEEKDAY_SHORT[weekdayOf(date) - 1].slice(0, 1),
    finde: weekdayOf(date) >= 6
  }));
}

/* ── Un día entero ─────────────────────────────────────────────────────────

   Desde el calendario se podía tocar una comida, pero no el día. Y hay cosas
   que se deciden por días enteros —«el domingo 12 comemos donde mi mamá»— que
   obligaban a repetir el mismo gesto tres veces, una por comida.

   Esta ventana enseña el día completo, dice de dónde salió cada comida con
   todas sus letras, y deja marcar el día entero de una vez. */

export function modalDia(ctx, extras = {}) {
  const { state } = ctx;
  const date = extras.date;
  const puestas = SLOTS.filter(slot => planFor(state, date, slot));
  return modal(niceDate(date, { weekday: 'long', day: 'numeric', month: 'long' }), 'Toca una comida para cambiarla. Lo que hagas aquí vale solo para este día.',
    `<div class="dia-momentos">${SLOTS.map(slot => {
      const plan = planFor(state, date, slot);
      const opcional = esOpcional(slot);
      return `<button type="button" class="dia-momento ${plan ? '' : 'vacio'}" data-action="open-meal" data-date="${date}" data-slot="${slot}">
        <span class="dia-momento-letra" aria-hidden="true">${esc(letraDeMomento(slot))}</span>
        <span class="dia-momento-texto">
          <strong>${esc(etiquetaDeMomento(slot))}</strong>
          <span>${plan ? esc(tituloDePlan(plan)) : (opcional ? 'Sin merienda — es opcional' : 'Sin decidir')}</span>
        </span>
        ${plan ? chipDeOrigen(origenDe(plan)) : ''}
      </button>`;
    }).join('')}</div>
    <div class="divider"></div>
    <div class="inline">
      ${button('Todo el día fuera de casa', 'mes-dia-fuera', 'btn-secondary btn-small', `data-date="${date}"`)}
      ${puestas.length ? button('Vaciar el día', 'mes-dia-vaciar', 'btn-quiet btn-small', `data-date="${date}"`) : ''}
    </div>
    <p class="tiny muted" style="margin-top:10px">«Todo el día fuera» marca el desayuno, el almuerzo y la cena; las meriendas se quedan como estén, porque son opcionales.</p>`);
}

/* ── Poner una comida en varios días ───────────────────────────────────────

   La única ayuda que queda, y hace exactamente lo que dice: pone lo que se le
   diga en los días que se le marquen. No adivina, no propone, no se guarda
   ninguna costumbre y no vuelve a ejecutarse nunca. Marcar el 6, 7, 8, 9, 10,
   11 y 12 es planificar la semana que viene; marcar catorce es planificar dos.

   Tres preguntas cortas, y en el orden en que se piensan: qué, en qué comida,
   y qué días. */

export function modalPonerEnDias(ctx, extras = {}) {
  const { state } = ctx;
  const month = extras.month;
  const receta = extras.receta || '';
  const momento = extras.slot || '';
  const tipo = extras.kind || (receta ? 'recipe' : 'recipe');
  const sinPreparaciones = !state.recipes.length;

  return modal('Poner una comida en varios días',
    `Los días que marques de ${monthName(month)}, y solo esos. No se repetirá sola.`,
    `<form data-form="poner-en-dias" data-month="${esc(month)}" class="modal-body rutina-form">
      <fieldset class="field-group"><legend>¿Qué comen?</legend>
        <div class="radio-fila">
          <label class="radio-pill"><input type="radio" name="kind" value="recipe" ${tipo === 'recipe' ? 'checked' : ''}><span>Una preparación</span></label>
          <label class="radio-pill"><input type="radio" name="kind" value="outside" ${tipo === 'outside' ? 'checked' : ''}><span>Fuera de casa</span></label>
          <label class="radio-pill"><input type="radio" name="kind" value="order" ${tipo === 'order' ? 'checked' : ''}><span>Pedimos comida</span></label>
        </div>
        <label class="field" data-poner-receta ${tipo === 'recipe' ? '' : 'hidden'}><span>¿Cuál?</span>
          <select name="recipeId">${options(state.recipes.map(item => [item.id, item.name]), receta, state.recipes.length ? 'Elegir una preparación' : 'Todavía no hay preparaciones')}</select>
          ${sinPreparaciones
            ? `<small>Aún no has escrito ninguna. <button type="button" class="enlace" data-action="poner-primera-preparacion" data-month="${esc(month)}">Escribir la primera</button> y vuelves aquí.</small>`
            : ''}
        </label>
      </fieldset>

      <fieldset class="field-group"><legend>¿En qué comida?</legend>
        <div class="chips">${MOMENTOS.map(item => `<label class="chip-check"><input type="radio" name="momento" value="${item.id}" ${momento === item.id ? 'checked' : ''}><span>${esc(item.etiqueta)}</span></label>`).join('')}</div>
        <p class="hint">Una sola. Si esta preparación también se come en otro momento, se vuelve a entrar aquí y se marcan esos días: así el mangú puede estar los lunes de desayuno y los viernes de cena sin que se mezclen.</p>
      </fieldset>

      <fieldset class="field-group"><legend>¿Qué días?</legend>
        <div class="inline dias-atajos">
          ${button('Los 7 próximos', 'poner-dias-atajo', 'btn-quiet btn-small', 'data-cuantos="7"')}
          ${button('Los 14 próximos', 'poner-dias-atajo', 'btn-quiet btn-small', 'data-cuantos="14"')}
          ${button('Quitar la marca a todos', 'poner-dias-atajo', 'btn-quiet btn-small', 'data-cuantos="0"')}
        </div>
        <div class="chips dias-mes" style="margin-top:12px">${diasDelMes(month).map(({ date, numero, inicial, finde }) =>
          `<label class="chip-check dia-suelto ${finde ? 'finde' : ''}"><input type="checkbox" name="fechas" value="${date}"><span>${numero}<em>${esc(inicial)}</em></span></label>`).join('')}</div>
        <p class="hint" style="margin-top:12px">«Los 7 próximos» marca desde hoy si el mes es el de hoy, y desde el día 1 si estás mirando otro.</p>
      </fieldset>

      <fieldset class="field-group"><legend>¿Y si ese día ya tenía algo?</legend>
        <div class="radio-fila">
          <label class="radio-pill"><input type="radio" name="modo" value="vacios" checked><span>Dejarlo como está</span></label>
          <label class="radio-pill"><input type="radio" name="modo" value="reemplazar"><span>Reemplazarlo</span></label>
        </div>
      </fieldset>

      <div class="modal-actions">
        ${button('Cancelar', 'close-modal', 'btn-secondary')}
        <button type="submit" class="btn btn-primary">Ponerlas</button>
      </div>
    </form>`, true);
}

/* ── Acciones ──────────────────────────────────────────────────────────── */

export const MES_ACTIONS = {
  'mes-mover': (el, ctx) => {
    ctx.ui.mes.month = shiftMonth(ctx.ui.mes.month, Number(el.dataset.delta));
    ctx.ui.mes.verPendientes = 12;
    ctx.commit('');
  },
  'mes-hoy': (el, ctx) => {
    ctx.ui.mes.month = hoy.slice(0, 7);
    ctx.ui.mes.verPendientes = 12;
    ctx.commit('');
  },
  'mes-vista': (el, ctx) => {
    ctx.ui.mes.vista = el.dataset.vista;
    ctx.render();
  },

  'mes-poner-en-dias': (el, ctx) => ctx.openModal('poner-en-dias', {
    month: ctx.ui.mes.month,
    // Entrando desde una preparación llega con ella puesta; desde una comida
    // del calendario, con su momento también. Lo que ya se eligió no se vuelve
    // a preguntar.
    receta: el.dataset.receta || '',
    slot: el.dataset.slot || '',
    kind: el.dataset.kind || ''
  }),

  // Marcar o desmarcar los N primeros días. Es un atajo de la casilla, no una
  // regla: lo que deja escrito son las casillas marcadas, y desde ahí se quita
  // o se añade a mano lo que haga falta.
  'poner-dias-atajo': (el, ctx) => {
    const cuantos = Number(el.dataset.cuantos);
    const casillas = [...document.querySelectorAll('[data-form="poner-en-dias"] [name="fechas"]')];
    const desde = ctx.ui.mes.month === hoy.slice(0, 7) ? hoy : `${ctx.ui.mes.month}-01`;
    const elegibles = casillas.filter(casilla => casilla.value >= desde).slice(0, cuantos);
    for (const casilla of casillas) casilla.checked = elegibles.includes(casilla);
  },

  'mes-abrir-dia': (el, ctx) => ctx.openModal('dia', { date: el.dataset.date }),

  // Un día entero fuera de casa son las tres de siempre. Las meriendas se
  // quedan como estén: son opcionales, y borrar una que alguien puso a mano
  // sería pasarle por encima.
  'mes-dia-fuera': (el, ctx) => {
    const date = el.dataset.date;
    const antes = snapshot(ctx.state);
    let puestas = 0;
    for (const slot of SLOTS_PRINCIPALES) {
      const existente = planFor(ctx.state, date, slot);
      if (existente && (existente.kind === 'outside' || existente.kind === 'order')) continue;
      try {
        if (existente) deletePlan(ctx.state, existente.id, true);
        setStatusPlan(ctx.state, date, slot, 'outside', null, 'excepcion');
        puestas++;
      } catch { /* una comida de la que cuelga otra reservada se queda donde está */ }
    }
    ctx.ui.mes.deshacer = puestas ? antes : null;
    ctx.ui.mes.aviso = puestas ? {
      month: ctx.ui.mes.month,
      titulo: `${niceDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}: todo el día fuera de casa.`,
      detalle: `${puestas} comida(s) marcadas. Las meriendas se quedaron como estaban.`
    } : null;
    ctx.closeModal();
    ctx.commit(puestas ? '' : 'Ese día ya estaba fuera de casa.');
  },

  'mes-dia-vaciar': (el, ctx) => {
    const date = el.dataset.date;
    const planes = SLOTS.map(slot => planFor(ctx.state, date, slot)).filter(Boolean);
    if (!planes.length) return;
    if (!window.confirm(`Se van a quitar ${planes.length} comida(s) del ${niceDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}. ¿Continuar?`)) return;
    const antes = snapshot(ctx.state);
    for (const plan of planes) { try { deletePlan(ctx.state, plan.id, true); } catch { /* la reservada la sostiene otra comida */ } }
    ctx.ui.mes.deshacer = antes;
    ctx.ui.mes.aviso = null;
    ctx.closeModal();
    ctx.commit('Día vaciado.');
  },

  'mes-ver-mas-pendientes': (el, ctx) => { ctx.ui.mes.verPendientes += 12; ctx.render(); },

  'mes-marcar': (el, ctx) => {
    const existente = planFor(ctx.state, el.dataset.date, el.dataset.slot);
    if (existente) deletePlan(ctx.state, existente.id, true);
    setStatusPlan(ctx.state, el.dataset.date, el.dataset.slot, el.dataset.kind, null, 'excepcion');
    ctx.commit('Comida marcada fuera de casa.');
  },

  'mes-quitar-salida': (el, ctx) => {
    deletePlan(ctx.state, el.dataset.id, true);
    ctx.commit('Esa comida vuelve a estar pendiente.');
  },

  'mes-deshacer': (el, ctx) => {
    if (!ctx.ui.mes.deshacer) return;
    restore(ctx.state, ctx.ui.mes.deshacer);
    ctx.ui.mes.deshacer = null;
    ctx.ui.mes.aviso = null;
    ctx.commit('Deshecho.');
  }
};

// Poner una comida en unas fechas concretas. Es lo único que escribe comidas de
// varias en varias, y lo hace con las fechas que una persona marcó una por una.
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
      // Lo puso una persona, para esos días. Así se marca y así lo dirá el
      // calendario: «Cambio manual», que es exactamente lo que fue.
      if (kind === 'recipe') makeRecipePlan(state, recipeId, date, slot, null, null, 'manual');
      else setStatusPlan(state, date, slot, kind, null, 'manual');
      puestas++;
    } catch { saltadas++; }
  }
  ui.mes.deshacer = puestas ? antes : null;
  ui.mes.aviso = {
    month,
    titulo: `${puestas} comida(s) puestas en ${fechas.length} día(s).`,
    detalle: `${saltadas ? `${saltadas} se dejaron como estaban. ` : ''}Esto no se repetirá solo: son los días que marcaste, y ninguno más.`
  };
  ctx.closeModal();
  ctx.commit('');
}

/* ── Formularios ───────────────────────────────────────────────────────── */

export const MES_FORMS = {
  'poner-en-dias': (form, data, ctx) => {
    const month = form.dataset.month;
    const kind = data.get('kind') || 'recipe';
    const momento = String(data.get('momento') || '');
    const modo = data.get('modo') === 'reemplazar' ? 'reemplazar' : 'vacios';

    if (!momento) throw new Error('Elige en qué comida del día: desayuno, merienda, almuerzo o cena.');
    if (kind === 'recipe' && !data.get('recipeId')) throw new Error('Elige qué preparación se pone, o marca «fuera de casa».');

    const fechas = [...form.querySelectorAll('[name="fechas"]:checked')].map(input => input.value).sort();
    if (!fechas.length) throw new Error('Marca al menos un día del mes.');

    return ponerEnFechas(ctx, { fechas, slots: [momento], kind, recipeId: data.get('recipeId'), modo, month });
  }
};
