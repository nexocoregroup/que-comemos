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
//
// Y revisarlo son tres preguntas, no siete pantallas: con qué empieza el mes,
// en qué se va a salir de lo normal, y si se da por bueno. Cada comida del
// calendario dice además de dónde salió —de una rutina, del mes pasado, de una
// excepción o de la mano de alguien—, que es lo que hace falta saber para
// atreverse a cambiarla.

import { MOMENTOS, ORIGENES, SLOTS, SLOTS_PRINCIPALES, dateRange, deletePlan, effectiveBasket, esOpcional, etiquetaDeMomento, etiquetaDeOrigen, makeRecipePlan, momentoDe, monthBasketSummary, monthBounds, origenDe, planFor, restore, setStatusPlan, shoppingList, snapshot, todayISO } from './model.js';
import { WEEKDAY_SHORT, WEEKDAYS, addRoutine, applyRoutine, applyRoutines, copyPatternFromMonth, datesForRule, deleteRoutine, describeRule, extenderAMesesAbiertos, monthProgress, ocupadasEnMesesAbiertos, openMonth, routinesFor, updateRoutine } from './routines.js';
import { button, cap, empty, esc, measure, modal, monthName, niceDate, notice, options, shiftMonth } from './ui-kit.js';

const hoy = todayISO();

export function emptyMes(month = hoy.slice(0, 7)) {
  // `base` recuerda cuál de las tres salidas del primer bloque —conservar,
  // copiar o ajustar— eligió la persona, para poder marcarla con un visto.
  return { month, vista: 'resumen', bloque: null, base: null, deshacer: null, aviso: null, verPendientes: 12 };
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
  if (ui.mes.bloque) return renderBloque(ctx);
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
  const cerrado = state.monthPlans?.[month]?.preparedAt || null;
  const sinNada = !rutinas.length && !progreso.encasa && !progreso.fuera;

  const cabecera = `<section class="plan-cabecera card">
    <div class="plan-cifra">
      <div class="plan-porcentaje">${progreso.porcentaje}<span>%</span></div>
      <div class="progress plan-progreso"><span style="width:${progreso.porcentaje}%"></span></div>
      <p class="plan-resumen-texto">${resumenEnPalabras(progreso)}</p>
    </div>
    <div class="plan-acciones">
      ${button(cerrado ? 'Volver a revisarlo' : 'Preparar este mes', 'mes-preparar', 'btn-primary')}
      ${button('Ver calendario', 'mes-vista', 'btn-secondary', 'data-vista="calendario"')}
    </div>
    ${cerrado ? `<p class="tiny muted plan-cerrado">Lo diste por bueno el ${esc(niceDate(cerrado, { day: 'numeric', month: 'long' }))}. Puedes seguir cambiándolo cuando quieras.</p>` : ''}
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
  // La vigencia se dice cuando la hay. Una rutina que empieza en dos semanas y
  // aquí se ve igual que las demás es una rutina que parece rota.
  const vigencia = [
    rutina.desde ? `desde el ${niceDate(rutina.desde, { day: 'numeric', month: 'short' })}` : '',
    rutina.until ? `hasta el ${niceDate(rutina.until, { day: 'numeric', month: 'short' })}` : ''
  ].filter(Boolean).join(' ');
  return `<div class="list-row">
    <div class="list-row-main">
      <div class="list-row-title">${esc(tituloDeRutina(state, rutina))} ${alcance}</div>
      <div class="list-row-sub">${esc(comidas)} · ${esc(cuando)} · ${fechas.length} día(s) en ${esc(monthName(month))}${vigencia ? ` · ${esc(vigencia)}` : ''}</div>
    </div>
    <div class="inline">
      ${button('Editar', 'open-routine', 'btn-secondary btn-small', `data-id="${rutina.id}"`)}
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
    ${avisoDeApertura(ctx)}
    <div class="card calendar-card"><div class="calendar-month">
      ${WEEKDAY_SHORT.map(dia => `<div class="day-head">${esc(dia)}</div>`).join('')}
      ${Array.from({ length: hueco }, () => '<div class="month-cell outside"></div>').join('')}
      ${celdas}
    </div></div>
    ${leyendaDeOrigenes()}
    <p class="tiny muted">Toca una comida para cambiarla, o el número del día para verlo entero.</p>
    <div class="inline plan-calendario-pie">
      ${button('+ Nueva rutina', 'mes-nueva-rutina', 'btn-secondary')}
      ${button('Traer el menú del mes pasado', 'mes-copiar-patron', 'btn-quiet')}
    </div>`;
}

const tituloDePlan = plan => plan.kind === 'recipe' || plan.kind === 'linked'
  ? plan.title
  : ({ outside: 'Fuera de casa', order: 'Pedido', unplanned: 'Sin decidir' }[plan.kind] || 'Sin decidir');

/* ── Preparar el mes: tres bloques ─────────────────────────────────────────

   Eran siete pantallas. Siete son más de las que nadie recuerda haber
   empezado, y a la cuarta ya no se sabe si se está organizando el mes o
   rellenando un formulario. Lo peor no era la cantidad: era que varias
   preguntaban lo mismo desde otro ángulo. «Qué se repite» y «en qué se parece
   al mes pasado» son la misma pregunta —con qué empieza este mes— y «la
   canasta» y «la lista» son la misma respuesta.

   Quedan tres, que son las tres cosas que una casa decide de verdad: con qué
   empieza el mes, en qué se va a salir de lo normal, y si se da por bueno.

   Ninguno de los tres bloquea nada. Se cierra el mes con huecos si hace falta:
   un hueco es una comida que todavía no se ha decidido, no un error. */

export const BLOQUES = [
  { id: 'base', titulo: 'La base del mes', pregunta: '¿Con qué empieza este mes?' },
  { id: 'excepciones', titulo: 'Lo que será distinto', pregunta: '¿Qué días se salen de lo normal?' },
  { id: 'confirmar', titulo: 'Revisar y cerrar', pregunta: '¿Lo damos por bueno?' }
];

function renderBloque(ctx) {
  const { ui } = ctx;
  const indice = Math.max(0, BLOQUES.findIndex(bloque => bloque.id === ui.mes.bloque));
  const bloque = BLOQUES[indice];
  const cuerpo = ({ base: bloqueBase, excepciones: bloqueExcepciones, confirmar: bloqueConfirmar })[bloque.id](ctx);
  const ultimo = indice === BLOQUES.length - 1;
  return `<section class="plan-bloque">
    <div class="plan-bloque-head">
      <div class="progress"><span style="width:${Math.round((indice + 1) / BLOQUES.length * 100)}%"></span></div>
      <div class="between">
        <span class="small muted">Bloque ${indice + 1} de ${BLOQUES.length} · ${esc(monthName(ui.mes.month))}</span>
        ${button('Salir', 'mes-salir-bloque', 'btn-quiet btn-small')}
      </div>
      <h2>${esc(bloque.pregunta)}</h2>
      <p class="small muted plan-bloque-pasos">${BLOQUES.map((item, i) =>
        `<span class="${i === indice ? 'strong' : ''}">${i + 1}. ${esc(item.titulo)}</span>`).join(' → ')}</p>
    </div>
    ${cuerpo}
    <div class="plan-bloque-pie">
      ${indice > 0 ? button('Atrás', 'mes-bloque-atras', 'btn-secondary') : '<span></span>'}
      ${ultimo ? button('Finalizar', 'mes-finalizar', 'btn-primary') : button('Continuar', 'mes-bloque-siguiente', 'btn-primary')}
    </div>
  </section>`;
}

/* ── De dónde salió cada comida ────────────────────────────────────────── */

// Un color y una palabra. El color vale para el calendario, donde no cabe una
// frase; la palabra vale para todo lo demás, que es donde de verdad se lee.
const puntoDeOrigen = origen => `<span class="origen-punto origen-${esc(origen)}" aria-hidden="true"></span>`;
const chipDeOrigen = origen => `<span class="origen-chip origen-${esc(origen)}">${puntoDeOrigen(origen)}${esc(etiquetaDeOrigen(origen))}</span>`;

function leyendaDeOrigenes() {
  return `<div class="origen-leyenda">${ORIGENES.map(origen =>
    `<span class="origen-chip origen-${esc(origen.id)}" title="${esc(origen.detalle)}">${puntoDeOrigen(origen.id)}${esc(origen.etiqueta)}</span>`).join('')}</div>`;
}

function planesDelMes(state, month) {
  const { start, end } = monthBounds(month);
  return state.plans
    .filter(plan => plan.date >= start && plan.date <= end && plan.kind !== 'unplanned')
    .sort((a, b) => a.date.localeCompare(b.date) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
}

function cuentasPorOrigen(state, month) {
  const cuentas = new Map(ORIGENES.map(origen => [origen.id, 0]));
  for (const plan of planesDelMes(state, month)) {
    const origen = origenDe(plan);
    cuentas.set(origen, (cuentas.get(origen) || 0) + 1);
  }
  return cuentas;
}

// «40 de tus rutinas, 12 del mes pasado, 3 que pusiste tú» contesta de un
// vistazo la pregunta que frena a todo el mundo delante de un calendario lleno:
// ¿esto lo decidí yo, o venía de antes?
function resumenDeOrigenes(cuentas, month) {
  const total = [...cuentas.values()].reduce((suma, valor) => suma + valor, 0);
  if (!total) {
    return `<div class="card soft"><p class="muted">${esc(monthName(month))} está en blanco todavía. En cuanto guardes una rutina, o traigas el patrón del mes pasado, se llena solo.</p></div>`;
  }
  return `<div class="card origen-resumen">
    <h3 class="plan-sub">Ya hay ${total} comida(s) puestas, y esto las puso</h3>
    <ul class="origen-lista">${ORIGENES.filter(origen => cuentas.get(origen.id)).map(origen =>
      `<li>${puntoDeOrigen(origen.id)}<strong>${cuentas.get(origen.id)}</strong> <span>${esc(origen.detalle.toLocaleLowerCase('es'))}</span></li>`).join('')}</ul>
    <p class="tiny muted">En el calendario cada comida lleva ese mismo color, y al abrir un día te lo dice con todas las letras.</p>
  </div>`;
}

/* ── Bloque 1: la base del mes ─────────────────────────────────────────── */

function bloqueBase(ctx) {
  const { state, ui } = ctx;
  const month = ui.mes.month;
  const rutinas = routinesFor(state, month);
  const permanentes = rutinas.filter(rutina => rutina.scope === 'permanent');
  const anterior = shiftMonth(month, -1);
  const seOrganizoAntes = Boolean(state.monthPlans?.[anterior]) || state.plans.some(plan => plan.date.slice(0, 7) === anterior);

  return `<p class="plan-bloque-texto">${esc(monthName(month))} no empieza en blanco. Ya tiene lo que tu casa come de costumbre; aquí solo compruebas que sigue siendo verdad y decides qué traer del mes pasado. <strong>No hay que escribir el menú otra vez.</strong></p>
    ${resumenDeOrigenes(cuentasPorOrigen(state, month), month)}

    <div class="section-head"><div><h3 class="plan-sub">Lo que se repite en tu casa</h3><p class="small muted">Se guarda una vez y llena el calendario de todos los meses.</p></div>${button('+ Añadir otra', 'mes-nueva-rutina', 'btn-secondary btn-small')}</div>
    ${rutinas.length
      ? `<div class="card">${rutinas.map(rutina => filaDeRutina(state, month, rutina)).join('')}</div>
         <div class="inline" style="margin-top:12px">${button('Aplicarlas todas a este mes', 'mes-aplicar-todas', 'btn-secondary btn-small')}</div>
         ${permanentes.length ? '' : '<p class="small muted">Ninguna es permanente todavía: todas valen solo para este mes. Al crearlas puedes marcar «desde ahora, todos los meses» y entonces cada mes nuevo se abre ya con ellas.</p>'}`
      : empty('🔁', 'Todavía no hay ninguna', 'Una rutina es algo como «mangú con salami, los martes y jueves de desayuno». Con dos o tres, el mes entero queda hecho.', button('Crear mi primera rutina', 'mes-nueva-rutina', 'btn-primary'))}

    ${bloqueMesAnterior(ctx, anterior, seOrganizoAntes)}
    ${avisoDeApertura(ctx)}`;
}

// Conservar, copiar o ajustar. Las tres están escritas como tres botones y no
// como un párrafo que las insinúe: quien abre esto quiere elegir, no leer.
function bloqueMesAnterior(ctx, anterior, seOrganizoAntes) {
  const { state, ui } = ctx;
  const month = ui.mes.month;
  if (!seOrganizoAntes) {
    return `<div class="section-head"><h3 class="plan-sub">Del mes pasado</h3></div>
      <div class="card"><p class="muted">${esc(monthName(anterior))} no llegó a organizarse, así que no hay nada que traer. Con las rutinas de arriba basta para empezar.</p></div>`;
  }
  const antes = monthProgress(state, anterior);
  const ahora = monthProgress(state, month);
  const elegida = ui.mes.base;
  const opcion = (id, action, extra, titulo, detalle) => `<button type="button" class="radio-bloque ${elegida === id ? 'elegida' : ''}" data-action="${action}" ${extra}>
    <span><strong>${esc(titulo)}${elegida === id ? ' ✓' : ''}</strong>${esc(detalle)}</span></button>`;

  return `<div class="section-head"><div><h3 class="plan-sub">Del mes pasado</h3><p class="small muted">En ${esc(monthName(anterior))} hubo ${antes.encasa} comida(s) en casa${antes.fuera ? `, ${antes.fuera} fuera` : ''}${antes.pedido ? ` y ${antes.pedido} pedida(s)` : ''}. ${esc(monthName(month))} lleva ${ahora.encasa} en casa y ${ahora.pendientes} sin decidir.</p></div></div>
    <div class="opcion-larga">
      ${opcion('conservar', 'mes-conservar', '', 'Dejarlo como está', 'Lo que ya está puesto se queda. Puedes seguir y decidir el resto sobre la marcha.')}
      ${opcion('copiar', 'mes-copiar-patron', '', `Traer el menú de ${monthName(anterior)}`, 'Se copian las preparaciones por día de la semana, no por número de fecha, y solo en los días que estén libres. Las salidas y los pedidos del mes pasado no se copian: eran de aquel mes.')}
      ${opcion('ajustar', 'mes-vista', 'data-vista="calendario"', 'Ajustarlo día por día', 'Abre el calendario. Cada comida dice de dónde vino y se cambia tocándola.')}
    </div>
    ${cambiosEnLaCompra(state, anterior, month)}`;
}

// Qué cambia en lo que se compra. No es una estadística: es la forma de
// acordarse de lo que se hizo distinto.
function cambiosEnLaCompra(state, anterior, month) {
  const mapa = lista => new Map(lista.map(linea => [linea.productId, linea]));
  const deAntes = mapa(effectiveBasket(state, anterior));
  const deAhora = mapa(effectiveBasket(state, month));
  const distintos = [];
  for (const [id, linea] of deAhora) {
    const viejo = deAntes.get(id);
    if (!viejo) distintos.push(`${nombreProducto(state, id)}: nuevo este mes`);
    else if (viejo.quantity !== linea.quantity) distintos.push(`${nombreProducto(state, id)}: ${viejo.quantity === null ? 'sin cantidad' : measure(viejo.quantity, viejo.unit)} → ${linea.quantity === null ? 'sin cantidad' : measure(linea.quantity, linea.unit)}`);
  }
  for (const [id] of deAntes) if (!deAhora.has(id)) distintos.push(`${nombreProducto(state, id)}: este mes no se compra`);
  if (!distintos.length) return '<p class="small muted" style="margin-top:14px">En la compra, este mes es igual que el pasado.</p>';
  return `<div class="section-head"><h3 class="plan-sub">Y en la compra cambia esto</h3></div>
    <div class="card"><ul class="food-list">${distintos.slice(0, 10).map(texto => `<li>${esc(texto)}</li>`).join('')}</ul>${distintos.length > 10 ? `<p class="small muted">Y ${distintos.length - 10} más.</p>` : ''}</div>`;
}

/* ── Bloque 2: lo que será distinto ────────────────────────────────────── */

// Los domingos son el caso real que pidió el usuario: primer y tercer domingo
// fuera, segundo y cuarto en casa. Los atajos escriben esa regla sin que haya
// que entender qué es un ordinal dentro del mes.
const ATAJOS_SALIDA = [
  { id: 'todos-domingos', etiqueta: 'Todos los domingos', weekdays: [7], weeks: null },
  { id: 'primer-tercer', etiqueta: 'Primer y tercer domingo', weekdays: [7], weeks: [1, 3] },
  { id: 'segundo-cuarto', etiqueta: 'Segundo y cuarto domingo', weekdays: [7], weeks: [2, 4] },
  { id: 'viernes', etiqueta: 'Todos los viernes', weekdays: [5], weeks: null }
];

function bloqueExcepciones(ctx) {
  const { state, ui } = ctx;
  const month = ui.mes.month;
  const reglas = routinesFor(state, month).filter(rutina => rutina.kind === 'outside' || rutina.kind === 'order');
  const { start, end } = monthBounds(month);

  const sueltas = [];
  const puntuales = [];
  for (const plan of planesDelMes(state, month)) {
    const origen = origenDe(plan);
    if ((plan.kind === 'outside' || plan.kind === 'order') && !plan.routineId) sueltas.push(plan);
    else if (origen === 'manual' && plan.kind !== 'outside' && plan.kind !== 'order') puntuales.push(plan);
  }
  const ausencias = state.absences
    .filter(item => item.date >= start && item.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));

  return `<p class="plan-bloque-texto">Lo normal ya está puesto. Aquí se anota lo que este mes <strong>no</strong> va a ser normal: los días que no se come en casa, los que se pide, la comida en familia fuera, la fecha especial, o el día que se cocina otra cosa.</p>

    <div class="card">
      <h3 class="plan-sub">Días que no se cocina en casa</h3>
      <p class="small muted">Comer fuera, una comida en familia en casa de alguien, o pedir. Marcarlo deja esa comida resuelta: no aparece como pendiente y no gasta alimentos del menú.</p>
      <div class="chips">${ATAJOS_SALIDA.map(atajo =>
        `<button type="button" class="chip" data-action="mes-salida-rapida" data-atajo="${atajo.id}">${esc(atajo.etiqueta)}</button>`).join('')}
        <button type="button" class="chip" data-action="mes-fechas-sueltas">Fechas concretas…</button></div>
      <p class="tiny muted" style="margin-top:10px">Te preguntamos qué comida y si vale solo para ${esc(monthName(month))} o desde ahora siempre. «Primer y tercer domingo» son los que caigan en el mes, sean las fechas que sean.</p>
    </div>

    ${reglas.length ? `<div class="section-head"><h3 class="plan-sub">Reglas guardadas</h3></div>
      <div class="card">${reglas.map(rutina => filaDeRutina(state, month, rutina)).join('')}</div>` : ''}

    ${sueltas.length ? `<div class="section-head"><h3 class="plan-sub">Días sueltos de este mes</h3></div>
      <div class="card">${sueltas.map(plan => filaDeExcepcion(plan, button('Quitar', 'mes-quitar-salida', 'btn-quiet btn-small', `data-id="${plan.id}"`))).join('')}</div>` : ''}

    <div class="section-head"><div><h3 class="plan-sub">Días que se cocina otra cosa</h3><p class="small muted">Las comidas de este mes que pusiste tú a mano, distintas de lo que dice la rutina.</p></div>${button('Abrir el calendario', 'mes-vista', 'btn-secondary btn-small', 'data-vista="calendario"')}</div>
    <div class="card">${puntuales.length
      ? puntuales.slice(0, 10).map(plan => filaDeExcepcion(plan, button('Abrir', 'open-meal', 'btn-quiet btn-small', `data-date="${plan.date}" data-slot="${plan.slot}"`))).join('') + (puntuales.length > 10 ? `<p class="small muted">Y ${puntuales.length - 10} más. Están todas en el calendario.</p>` : '')
      : '<p class="muted">Todavía ninguno. Toca cualquier día del calendario para cambiar solo ese día; lo demás se queda como está.</p>'}</div>

    ${bloqueAusencias(state, ausencias)}
    ${avisoDeApertura(ctx)}`;
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
function bloqueAusencias(state, ausencias) {
  const nombre = personId => state.people.find(person => person.id === personId)?.name || 'Alguien';
  return `<div class="section-head"><div><h3 class="plan-sub">Alguien que no come en casa</h3><p class="small muted">Se marca al abrir la comida de ese día. Queda anotado, y <strong>no cambia lo que se cocina</strong>: una olla de arroz no se achica porque un hijo avise a las seis.</p></div></div>
    <div class="card">${ausencias.length
      ? ausencias.slice(0, 10).map(item => `<div class="list-row">
          <div class="list-row-main">
            <div class="list-row-title">${esc(nombre(item.personId))}</div>
            <div class="list-row-sub">${esc(niceDate(item.date, { weekday: 'long', day: 'numeric', month: 'long' }))} · ${esc(etiquetaDeMomento(item.slot))}</div>
          </div>${button('Abrir ese día', 'mes-abrir-dia', 'btn-quiet btn-small', `data-date="${item.date}"`)}</div>`).join('') + (ausencias.length > 10 ? `<p class="small muted">Y ${ausencias.length - 10} más.</p>` : '')
      : '<p class="muted">Nadie marcado fuera este mes.</p>'}</div>`;
}

/* ── Bloque 3: revisar y cerrar ────────────────────────────────────────── */

function bloqueConfirmar(ctx) {
  const { state, ui } = ctx;
  const month = ui.mes.month;
  const progreso = monthProgress(state, month);
  const resumen = monthBasketSummary(state, month);
  const cambios = resumen.cambiados + resumen.quitados + resumen.extras;

  return `<p class="plan-bloque-texto">Esto es ${esc(monthName(month))} tal y como queda. Puedes cerrarlo aunque falten comidas por decidir: lo que dejes en blanco sigue estando ahí mañana.</p>

    <div class="card plan-cabecera">
      <div class="plan-cifra">
        <div class="plan-porcentaje">${progreso.porcentaje}<span>%</span></div>
        <div class="progress plan-progreso"><span style="width:${progreso.porcentaje}%"></span></div>
        <p class="plan-resumen-texto">${resumenEnPalabras(progreso)}</p>
      </div>
    </div>
    <ul class="plan-lista-final">
      <li><strong>${progreso.encasa}</strong> comidas en casa</li>
      ${progreso.fuera ? `<li><strong>${progreso.fuera}</strong> comidas fuera</li>` : ''}
      ${progreso.pedido ? `<li><strong>${progreso.pedido}</strong> comidas pedidas</li>` : ''}
      ${progreso.meriendas ? `<li><strong>${progreso.meriendas}</strong> ${progreso.meriendas === 1 ? 'merienda anotada' : 'meriendas anotadas'} <span class="muted">(${progreso.meriendas === 1 ? 'es opcional' : 'son opcionales'})</span></li>` : ''}
      <li><strong>${progreso.pendientes}</strong> ${progreso.pendientes === 1 ? 'comida sin decidir' : 'comidas sin decidir'}</li>
    </ul>

    ${bloquePendientes(ctx, progreso)}
    ${bloqueCanasta(ctx, resumen, cambios)}
    ${bloqueCompra(ctx)}`;
}

// Los huecos son un aviso, nunca una puerta cerrada. Y solo cuentan las tres
// comidas de todos los días: enseñar sesenta meriendas «sin decidir»
// convertiría esta lista en una queja.
function bloquePendientes(ctx, progreso) {
  const { state, ui } = ctx;
  const month = ui.mes.month;
  const { start, end } = monthBounds(month);
  const pendientes = [];
  for (const date of dateRange(start, end)) for (const slot of SLOTS_PRINCIPALES) {
    const plan = planFor(state, date, slot);
    if (!plan || plan.kind === 'unplanned') pendientes.push({ date, slot });
  }
  if (!pendientes.length) {
    return `<div class="card plan-ok"><span class="plan-ok-icono">✓</span><div><strong>No queda ningún hueco.</strong><span>Las ${progreso.huecos} comidas de ${esc(monthName(month))} están decididas. Las meriendas van aparte: se ponen cuando las hay, y un día sin merienda está completo igual.</span></div></div>`;
  }
  const tope = ui.mes.verPendientes;
  return `<div class="notice"><span>·</span><div><strong>Quedan ${pendientes.length} comida(s) sin decidir.</strong>No hace falta llenarlas para cerrar el mes. Las meriendas no cuentan: un día sin merienda está completo.</div></div>
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

function bloqueCanasta(ctx, resumen, cambios) {
  const { state, ui } = ctx;
  const month = ui.mes.month;
  const cambiadas = effectiveBasket(state, month).filter(linea => linea.source !== 'habitual');
  return `<div class="section-head"><div><h3 class="plan-sub">Lo que cambia en la compra de este mes</h3><p class="small muted">Tu canasta habitual ya está aplicada. Aquí solo se anota lo que ${esc(monthName(month))} tendrá de diferente, y no toca los demás meses.</p></div>${button('Cambiar algo', 'navigate', 'btn-secondary btn-small', `data-page="canasta" data-month="${month}"`)}</div>
    <div class="card plan-canasta-cifras">
      <div><strong>${resumen.habituales}</strong><span>de siempre</span></div>
      <div><strong>${resumen.cambiados}</strong><span>con otra cantidad</span></div>
      <div><strong>${resumen.quitados}</strong><span>que no se compran</span></div>
      <div><strong>${resumen.extras}</strong><span>solo de ${esc(monthName(month).split(' ')[0])}</span></div>
    </div>
    ${cambios && cambiadas.length ? `<div class="card">${cambiadas.slice(0, 8).map(linea =>
      `<div class="list-row"><div class="list-row-main"><div class="list-row-title">${esc(nombreProducto(state, linea.productId))} <span class="pill warm">${linea.source === 'extra' ? 'solo este mes' : 'cantidad distinta'}</span></div><div class="list-row-sub">${linea.quantity === null ? 'cantidad pendiente' : esc(measure(linea.quantity, linea.unit))}</div></div></div>`).join('')}${cambiadas.length > 8 ? `<p class="small muted">Y ${cambiadas.length - 8} más.</p>` : ''}</div>` : ''}`;
}

// La lista sale de lo que ya está decidido, y se enseña aquí para que el mes no
// se dé por organizado sin haber mirado lo que va a costar.
function bloqueCompra(ctx) {
  const { state, ui } = ctx;
  const { start, end } = monthBounds(ui.mes.month);
  let lista;
  try { lista = shoppingList(state, start, end, 'casa'); }
  catch (error) {
    return `<div class="section-head"><h3 class="plan-sub">La compra</h3></div>
      <div class="card"><p class="muted">No se pudo calcular la lista: ${esc(error.message)}</p></div>`;
  }
  const faltan = lista.lines.filter(linea => linea.shortfall > 0);
  const abrir = `<div class="inline" style="margin-top:12px">${button('Abrir la compra de este mes', 'navigate', 'btn-primary', 'data-page="compra"')}</div>`;
  if (!faltan.length) {
    return `<div class="section-head"><h3 class="plan-sub">La compra</h3></div>
      <div class="card plan-ok"><span class="plan-ok-icono">✓</span><div><strong>No falta nada.</strong><span>Con lo que hay en casa alcanza para ${esc(monthName(ui.mes.month))}.</span></div></div>${abrir}`;
  }
  return `<div class="section-head"><div><h3 class="plan-sub">La compra</h3><p class="small muted">Lo que haría falta comprar para todo ${esc(monthName(ui.mes.month))}, según tu canasta y lo que ya queda en casa.</p></div></div>
    <div class="card">${faltan.slice(0, 12).map(linea => {
      const item = state.products.find(row => row.id === linea.productId);
      return `<div class="list-row"><div class="list-row-main"><div class="list-row-title">${esc(item?.name || '')}</div></div><div class="compra-cantidad">${linea.purchaseQuantity === null ? '<span class="pill gray">falta una medida</span>' : `<strong>${esc(measure(linea.purchaseQuantity, linea.purchaseUnit))}</strong>`}</div></div>`;
    }).join('')}${faltan.length > 12 ? `<p class="small muted">Y ${faltan.length - 12} alimento(s) más.</p>` : ''}</div>${abrir}`;
}

const nombreProducto = (state, id) => state.products.find(item => item.id === id)?.name || 'Alimento eliminado';

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
    inicial: WEEKDAY_SHORT[(new Date(`${date}T12:00:00`).getDay() + 6) % 7].slice(0, 1)
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

/* ── El formulario de una rutina ───────────────────────────────────────── */

// Una sola pantalla con cinco preguntas cortas, y en este orden: qué, cuándo,
// qué días, cuáles de esos días, y hasta cuándo. Ese es el orden en que la
// persona lo piensa, y por eso no hace falta explicar ninguna.
export function modalRutina(ctx, extras = {}) {
  const { state } = ctx;
  const month = extras.month;
  const editando = extras.id ? (state.mealRoutines || []).find(item => item.id === extras.id) : null;
  const prefijo = extras.atajo ? ATAJOS_SALIDA.find(item => item.id === extras.atajo) : null;

  /* ── Lo que ya se sabe no se vuelve a preguntar ──────────────────────────

     Tres puertas llevan aquí y cada una trae algo en la mano: editar una rutina
     que ya existe, «ponerla en el calendario» desde una preparación —que trae
     la preparación—, y «hacerla rutina» desde una comida del calendario —que
     trae la preparación y el momento—. Antes esas dos últimas mandaban el dato
     y el formulario no lo miraba: se abría en blanco y había que volver a
     elegir lo que se acababa de elegir.

     El orden de precedencia es el natural: lo que se está editando manda sobre
     lo que llega de la puerta, y eso manda sobre el valor por defecto. */

  const dias = editando?.weekdays || prefijo?.weekdays || [];
  const semanas = editando?.weeks || prefijo?.weeks || null;
  const receta = editando?.recipeId || extras.receta || '';
  const momentos = editando?.slots || (extras.slot ? [extras.slot] : []);
  const tipo = editando?.kind || extras.kind || (receta ? 'recipe' : prefijo ? 'outside' : 'recipe');
  const hastaValor = editando?.until || '';
  const desdeValor = editando?.desde || '';
  // «Fechas concretas» entra directamente por la pestaña de días sueltos: quien
  // la eligió ya dijo que no quiere una costumbre, sino unos días. Editar una
  // rutina nunca entra por ahí: una rutina, por definición, no es días sueltos.
  const sueltos = Boolean(extras.sueltos) && !editando;

  /* ── El alcance por defecto ──────────────────────────────────────────────

     «Desde ahora, todos los meses», porque una rutina es una costumbre: quien
     abre este formulario está diciendo lo que se hace en su casa, no lo que va
     a pasar en octubre. «Solo este mes» queda para la excepción, que es lo que
     de verdad se marca de vez en cuando.

     Las fechas sueltas son la excepción de la excepción y se quedan en el mes:
     «el 4 y el 19» no describe ninguna costumbre. */
  const alcance = editando?.scope || (sueltos ? 'month' : 'permanent');

  // Sin una sola preparación escrita, el desplegable decía «Todavía no hay
  // preparaciones» y ahí se acababa el camino. Ahora se sale por donde había que
  // salir: se escribe la preparación y se vuelve aquí con ella ya elegida.
  const sinPreparaciones = !state.recipes.length;

  return modal(editando ? 'Editar la rutina' : prefijo ? prefijo.etiqueta : sueltos ? 'Fechas concretas' : 'Una comida que se repite',
    editando ? `${describeRule(editando.weekdays, editando.weeks)} · lo que cambies aquí vale para la regla entera`
      : `En ${monthName(month)} y, si quieres, en los meses siguientes`,
    `<form data-form="rutina" data-month="${esc(month)}" data-id="${esc(editando?.id || '')}" class="modal-body rutina-form">
      <fieldset class="field-group"><legend>¿Qué comen?</legend>
        <div class="radio-fila">
          <label class="radio-pill"><input type="radio" name="kind" value="recipe" ${tipo === 'recipe' ? 'checked' : ''}><span>Una preparación</span></label>
          <label class="radio-pill"><input type="radio" name="kind" value="outside" ${tipo === 'outside' ? 'checked' : ''}><span>Fuera de casa</span></label>
          <label class="radio-pill"><input type="radio" name="kind" value="order" ${tipo === 'order' ? 'checked' : ''}><span>Pedimos comida</span></label>
        </div>
        <label class="field" data-rutina-receta ${tipo === 'recipe' ? '' : 'hidden'}><span>¿Cuál?</span>
          <select name="recipeId">${options(state.recipes.map(item => [item.id, item.name]), receta, state.recipes.length ? 'Elegir una preparación' : 'Todavía no hay preparaciones')}</select>
          ${sinPreparaciones
            ? `<small>Aún no has escrito ninguna. <button type="button" class="enlace" data-action="rutina-primera-preparacion" data-month="${esc(month)}">Escribir la primera</button> y vuelves aquí.</small>`
            : ''}
        </label>
      </fieldset>

      <fieldset class="field-group"><legend>¿En qué comida?</legend>
        <div class="chips">${MOMENTOS.map(momento => `<label class="chip-check"><input type="checkbox" name="slots" value="${momento.id}" ${momentos.includes(momento.id) ? 'checked' : ''}><span>${esc(momento.etiqueta)}</span></label>`).join('')}</div>
      </fieldset>

      <fieldset class="field-group"><legend>¿Qué días?</legend>
        ${editando ? '' : `<div class="segmented segmented-ancho">
          <button type="button" data-action="rutina-modo-dias" data-modo="semana" class="${sueltos ? '' : 'active'}">Días de la semana</button>
          <button type="button" data-action="rutina-modo-dias" data-modo="sueltos" class="${sueltos ? 'active' : ''}">Días sueltos</button>
        </div>`}

        <div data-dias-semana ${sueltos ? 'hidden' : ''}>
          <div class="chips dias-semana">${WEEKDAYS.map((dia, indice) => `<label class="chip-check"><input type="checkbox" name="weekdays" value="${dia}" ${dias.includes(dia) ? 'checked' : ''}><span>${esc(WEEKDAY_SHORT[indice])}</span></label>`).join('')}</div>
          <p class="hint" style="margin-top:12px">¿Todos esos días, o solo algunos?</p>
          <div class="radio-fila" style="margin-top:8px">
            <label class="radio-pill"><input type="radio" name="weeks" value="todas" ${semanas ? '' : 'checked'}><span>Todos</span></label>
            <label class="radio-pill"><input type="radio" name="weeks" value="1,3" ${String(semanas) === '1,3' ? 'checked' : ''}><span>1.º y 3.º</span></label>
            <label class="radio-pill"><input type="radio" name="weeks" value="2,4" ${String(semanas) === '2,4' ? 'checked' : ''}><span>2.º y 4.º</span></label>
          </div>
          <p class="hint">«Primer y tercer domingo» son el primer y el tercer domingo que caen en el mes, sean las fechas que sean.</p>
          <div class="rutina-vigencia">
            <label class="field"><span>Desde el día (opcional)</span>
              <input type="date" name="desde" value="${esc(desdeValor)}">
              <small>Para escribir hoy algo que empieza más adelante.</small>
            </label>
            <label class="field"><span>Hasta el día (opcional)</span>
              <input type="date" name="hasta" value="${esc(hastaValor)}">
              <small>Para «solo hasta que vuelva el niño de las vacaciones».</small>
            </label>
          </div>
        </div>

        <div data-dias-sueltos ${sueltos ? '' : 'hidden'}>
          <p class="hint" style="margin-bottom:10px">Marca los días de ${esc(monthName(month))} que quieras. Esto no crea una costumbre: pone esas comidas y ya.</p>
          <div class="chips dias-mes">${diasDelMes(month).map(({ date, numero, inicial }) =>
            `<label class="chip-check dia-suelto"><input type="checkbox" name="fechas" value="${date}"><span>${numero}<em>${esc(inicial)}</em></span></label>`).join('')}</div>
        </div>
      </fieldset>

      <fieldset class="field-group" data-alcance-rutina ${sueltos ? 'hidden' : ''}><legend>¿Hasta cuándo?</legend>
        <div class="radio-fila">
          <label class="radio-pill"><input type="radio" name="scope" value="permanent" ${alcance === 'permanent' ? 'checked' : ''}><span>Desde ahora, todos los meses</span></label>
          <label class="radio-pill"><input type="radio" name="scope" value="month" ${alcance === 'month' ? 'checked' : ''}><span>Solo ${esc(monthName(month))}</span></label>
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
        <button type="submit" class="btn btn-primary">${editando ? 'Guardar los cambios' : 'Guardar y aplicar'}</button>
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
  'mes-vista': (el, ctx) => {
    ctx.ui.mes.vista = el.dataset.vista;
    // Salir al calendario es salir del recorrido: si el bloque se queda puesto,
    // se vuelve a pintar él y el botón parece roto.
    if (el.dataset.vista === 'calendario') ctx.ui.mes.bloque = null;
    ctx.render();
  },
  'mes-preparar': (el, ctx) => { ctx.ui.mes.bloque = BLOQUES[0].id; ctx.ui.mes.verPendientes = 12; ctx.render(); },
  'mes-salir-bloque': (el, ctx) => { ctx.ui.mes.bloque = null; ctx.render(); },
  'mes-bloque-siguiente': (el, ctx) => {
    const indice = BLOQUES.findIndex(bloque => bloque.id === ctx.ui.mes.bloque);
    ctx.ui.mes.bloque = BLOQUES[Math.min(BLOQUES.length - 1, indice + 1)].id;
    ctx.ui.mes.verPendientes = 12;
    ctx.render();
  },
  'mes-bloque-atras': (el, ctx) => {
    const indice = BLOQUES.findIndex(bloque => bloque.id === ctx.ui.mes.bloque);
    ctx.ui.mes.bloque = BLOQUES[Math.max(0, indice - 1)].id;
    ctx.render();
  },

  // Cerrar el mes no cierra nada: deja escrito el día en que se dio por bueno.
  // Los huecos que queden siguen ahí y se pueden llenar mañana, que es la razón
  // por la que este botón no comprueba nada antes de dejarte terminar.
  'mes-finalizar': (el, ctx) => {
    const month = ctx.ui.mes.month;
    const ficha = ctx.state.monthPlans?.[month];
    if (ficha) ficha.preparedAt = todayISO();
    ctx.ui.mes.bloque = null;
    ctx.ui.mes.vista = 'resumen';
    const pendientes = monthProgress(ctx.state, month).pendientes;
    ctx.commit(pendientes
      ? `${monthName(month)} queda organizado. Las ${pendientes} comida(s) sin decidir siguen ahí cuando quieras.`
      : `${monthName(month)} queda organizado.`);
  },

  // «Dejarlo como está» no hace nada, y por eso mismo tiene que decir algo: sin
  // respuesta, quien lo toca no sabe si lo tocó.
  'mes-conservar': (el, ctx) => {
    ctx.ui.mes.base = 'conservar';
    ctx.toast('Este mes se queda con lo que ya tiene.');
    ctx.render();
  },

  'mes-fechas-sueltas': (el, ctx) => ctx.openModal('rutina', { month: ctx.ui.mes.month, sueltos: true, kind: 'outside' }),
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
      tipo: 'rutina', month: ctx.ui.mes.month,
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
    // Y de las que se quitan, solo las que están por venir. Borrar el lunes
    // pasado no deshace ninguna cena: la casa ya comió eso, y el historial de la
    // compra cuenta con ello.
    const porVenir = planes.filter(plan => plan.date >= hoy);
    const borrarComidas = porVenir.length
      ? window.confirm(`«${tituloDeRutina(ctx.state, rutina)}» está puesta en ${planes.length} comida(s), ${porVenir.length} de hoy en adelante.\n\nAceptar: se quitan las que están por venir.\nCancelar: se quedan todas, pero dejan de repetirse.\n\nLas que ya pasaron no se tocan en ningún caso.`)
      : false;
    const antes = snapshot(ctx.state);
    const salida = deleteRoutine(ctx.state, el.dataset.id, { comidas: borrarComidas ? 'quitar' : 'conservar', desde: hoy });
    ctx.ui.mes.deshacer = antes;
    ctx.ui.mes.aviso = {
      tipo: 'rutina', month: ctx.ui.mes.month, titulo: 'Rutina quitada.',
      detalle: salida.quitadas
        ? `${salida.quitadas} comida(s) salieron del calendario. Las ${salida.conservadas} que ya habían pasado se quedan donde estaban.`
        : 'Las comidas ya puestas se quedan donde estaban; solo dejan de repetirse.'
    };
    ctx.commit('');
  },

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

  'mes-copiar-patron': (el, ctx) => {
    const destino = ctx.ui.mes.month;
    const origen = shiftMonth(destino, -1);
    const antes = snapshot(ctx.state);
    const resultado = copyPatternFromMonth(ctx.state, origen, destino);
    if (!resultado.creados.length) {
      const ocupados = resultado.saltados.filter(item => item.motivo === 'ya tenía plan').length;
      ctx.toast(ocupados
        ? `Esos días ya tenían algo puesto: no se cambió nada. ${monthName(destino)} ya está tan lleno como ${monthName(origen)}.`
        : `No hay ninguna preparación que copiar de ${monthName(origen)}.`, true);
      return;
    }
    ctx.ui.mes.base = 'copiar';
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
      // Unas fechas concretas no describen ninguna costumbre: son la excepción
      // de este mes, y así se marcan para que el calendario lo diga.
      if (kind === 'recipe') makeRecipePlan(state, recipeId, date, slot, null, null, 'excepcion');
      else setStatusPlan(state, date, slot, kind, null, 'excepcion');
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
    const desde = String(data.get('desde') || '') || null;
    if (!weekdays.length) throw new Error('Marca al menos un día de la semana.');

    const fechas = datesForRule(month, weekdays, weeks).filter(date => (!hasta || date <= hasta) && (!desde || date >= desde));
    const editandoId = form.dataset.id || '';
    // Editando se permite que el mes que se está mirando quede sin ninguna
    // fecha: cambiar la regla a «los martes desde noviembre» es legítimo aunque
    // octubre se quede vacío. Creando no, porque no se vería pasar nada.
    if (!fechas.length && !editandoId) throw new Error('Con esos días y esas fechas no queda ningún día del mes.');
    if (modo === 'reemplazar') {
      const ocupadas = fechas.flatMap(date => slots.filter(slot => planFor(state, date, slot))).length;
      if (ocupadas && !window.confirm(`Esto va a reemplazar ${ocupadas} comida(s) que ya estaban puestas en ${monthName(month)}. ¿Continuar?`)) return;
    }

    const antes = snapshot(state);
    const campos = {
      kind,
      recipeId: kind === 'recipe' ? data.get('recipeId') : null,
      slots, weekdays, weeks, scope, desde, until: hasta,
      month: scope === 'month' ? month : null
    };

    /* ── Editar cambia la regla, y la regla manda sobre lo ya puesto ────────

       Antes «editar toda la rutina» solo reescribía las comidas que ya estaban
       en el calendario: los días nuevos no aparecían y los que dejaban de tocar
       se quedaban ahí. La regla y lo que se veía se iban separando cada vez que
       alguien la tocaba.

       Ahora se suelta lo que la regla ya no cubre —soltar y no borrar, porque
       una comida escrita es una decisión de alguien— y se vuelve a aplicar. */
    const rutina = editandoId ? updateRoutine(state, editandoId, campos) : addRoutine(state, campos);
    let liberadas = 0;
    if (editandoId) {
      const vigentes = new Set(fechas.flatMap(date => slots.map(slot => `${date}|${slot}`)));
      for (const plan of state.plans) {
        if (plan.routineId !== rutina.id) continue;
        if (plan.date.slice(0, 7) !== month) continue;
        if (vigentes.has(`${plan.date}|${plan.slot}`)) continue;
        plan.routineId = null;
        liberadas++;
      }
    }
    const resultado = applyRoutine(state, rutina.id, month, { modo, hasta, desde });

    // Y los meses futuros que ya estaban abiertos. Sin esto, quien preparó
    // noviembre en octubre escribía una costumbre que noviembre no llegaba a
    // oír: su único momento de escuchar fue el día en que se abrió.
    let futuros = { meses: [], creados: [] };
    if (scope === 'permanent') {
      const pisaria = ocupadasEnMesesAbiertos(state, rutina.id, month);
      const permiso = !pisaria.length || modo !== 'reemplazar'
        || window.confirm(`En los meses que ya tienes preparados hay ${pisaria.length} comida(s) puestas en esos mismos días. ¿Reemplazarlas también?`);
      futuros = extenderAMesesAbiertos(state, rutina.id, month, { modo: permiso ? modo : 'vacios' });
    }

    ui.mes.deshacer = antes;
    ui.mes.aviso = {
      tipo: 'rutina', month,
      titulo: `${describeRule(weekdays, weeks)}: ${tituloDeRutina(state, rutina).toLowerCase()}.`,
      detalle: [
        `${resultado.creados.length} comida(s) ${editandoId ? 'al día' : 'puestas'} en ${monthName(month)}`,
        resultado.saltados.length ? `${resultado.saltados.length} día(s) se dejaron como estaban` : '',
        liberadas ? `${liberadas} dejaron de seguir la rutina y se quedan donde estaban` : '',
        desde ? `Desde el ${niceDate(desde, { day: 'numeric', month: 'long' })}` : '',
        hasta ? `hasta el ${niceDate(hasta, { day: 'numeric', month: 'long' })}` : '',
        futuros.meses.length ? `Y ${futuros.creados.length} en ${futuros.meses.map(mes => monthName(mes)).join(' y ')}, que ya tenías preparados` : '',
        scope === 'permanent' ? 'Se repetirá en los meses siguientes.' : `Vale solo para ${monthName(month)}.`
      ].filter(Boolean).join('. ').replace(/\.\./g, '.')
    };
    ctx.closeModal();
    ctx.commit('');
  }
};
