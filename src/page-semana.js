// Plan semanal: la pantalla donde se decide qué se come.
//
// Antes era un mes. Noventa y tantas casillas en una cuadrícula de siete
// columnas, que en un teléfono se lee con lupa y en la que cada comida cabía en
// media línea de texto. Servía para mirar el mes de lejos y no servía para lo
// único que se hace de verdad en ella: decidir qué se cena el jueves.
//
// Ahora son siete días, de lunes a domingo, uno debajo de otro y con sus
// comidas escritas enteras. Quien quiera ver dos semanas las pide; quien quiera
// otra semana la busca con las flechas o con «Ir a una fecha». No hay vista de
// mes, y no la hay a propósito: un mes entero es más de lo que una casa decide
// de una sentada, y enseñarlo invita a dejarlo para luego.
//
// Nada se llena solo. Ni una comida se pone sin que alguien la ponga, y las
// semanas que vienen se quedan abiertas hasta que alguien las mire.

import { MOMENTOS, ORIGENES, SLOTS, comidasDecididas, SLOTS_PRINCIPALES, WEEKDAY_SHORT, addDays, dateRange, deletePlan, esOpcional, etiquetaDeMomento, etiquetaDeOrigen, makeRecipePlan, origenDe, planFor, restore, setStatusPlan, snapshot, todayISO, validDate, weekStart, weekdayOf } from './model.js';
import { button, cap, esc, modal, niceDate, notice, options } from './ui-kit.js';
import { icono } from './icons.js';

// La fecha de hoy no se puede guardar en una constante del módulo: se
// calcularía una vez, al abrir la app, y un teléfono que se queda encendido
// pasada la medianoche seguiría pintando el día de ayer. Es una función, y
// cada pintada vuelve a preguntar.
const hoy = () => todayISO();

// Siete o catorce. No hay un tercer número: tres semanas ya es un mes con otro
// nombre, y un mes es justo lo que esta pantalla vino a quitar de en medio.
export const DIAS_POR_VISTA = { una: 7, dos: 14 };

export function emptySemana(inicio = weekStart(hoy())) {
  return {
    // Siempre un lunes. Empezar la semana en el día en que se abrió la app
    // haría que «la semana que viene» significara algo distinto cada día.
    inicio: weekStart(inicio),
    vista: 'una',
    deshacer: null,
    aviso: null,
    // Los días que ya pasaron, plegados. Cerrados por omisión, pero se pueden
    // abrir: mirar atrás para copiar lo que se comió el martes es un uso real
    // de esta pantalla, y esconderlo del todo sería quitar una función.
    verPasados: false
  };
}

const diasDe = ui => dateRange(ui.semana.inicio, addDays(ui.semana.inicio, DIAS_POR_VISTA[ui.semana.vista] - 1));

/* ── Pantalla ──────────────────────────────────────────────────────────── */

export function renderSemana(ctx) {
  const { state, ui } = ctx;
  if (!ui.semana) ui.semana = emptySemana();
  const dias = diasDe(ui);

  /* Los días ya vividos, plegados.

     Un viernes por la tarde se entra a decidir la cena y lo primero que hay que
     pasar son lunes, martes, miércoles y jueves: unos 1.400 px de tarjetas con
     cinco filas tocables cada una que ya no se pueden cambiar. Un domingo por la
     noche, seis días. Y viendo dos semanas, más.

     El lunes de arranque no se toca —la razón está escrita arriba, en
     `emptySemana`, y es buena—: lo que se pliega es lo que ya pasó, y solo
     cuando hoy está dentro de lo que se enseña. Mirando otra semana no hay «ya
     pasó» que valga, y una semana entera del pasado plegada sería una pantalla
     con una sola línea. */
  const ahora = hoy();
  const pasados = dias.filter(date => date < ahora);
  const porDelante = dias.filter(date => date >= ahora);
  const plegarPasados = Boolean(pasados.length && porDelante.length);
  const cuentaPasada = plegarPasados ? comidasDecididas(state, pasados) : null;

  return `${barra(ctx, dias)}
    ${avisoDeCambio(ctx)}
    ${resumenDeLaVista(ctx, dias, comidasDecididas(state, dias))}
    ${plegarPasados ? `<details class="plegable semana-pasados" ${ui.semana.verPasados ? 'open' : ''}>
      <summary data-action="semana-ver-pasados">${esc(diasEnPalabras(pasados))} · ya ${pasados.length === 1 ? 'pasó' : 'pasaron'} · ${cuentaPasada.decididas} de ${cuentaPasada.huecos} decididas</summary>
      <div class="semana-dias">${pasados.map(date => tarjetaDeDia(ctx, date)).join('')}</div>
    </details>` : ''}
    <div class="semana-dias">${(plegarPasados ? porDelante : dias).map(date => tarjetaDeDia(ctx, date)).join('')}</div>
    ${leyendaDeOrigenes(state, dias)}
    <p class="tiny muted semana-pie">Lo que no pongas se queda vacío, y un día vacío no es un error. Las próximas semanas están abiertas hasta que las planifiques.</p>`;
}

function barra(ctx, dias) {
  const { ui } = ctx;
  const estaSemana = ui.semana.inicio === weekStart(hoy());
  return `<div class="toolbar semana-barra">
    <div class="inline semana-mover">
      ${button(icono('izquierda', { tamano: 18 }), 'semana-mover', 'btn-secondary btn-small btn-flecha', 'data-delta="-1" aria-label="Semana anterior"')}
      <div class="strong semana-rango">${esc(rangoEnPalabras(dias))}</div>
      ${button(icono('derecha', { tamano: 18 }), 'semana-mover', 'btn-secondary btn-small btn-flecha', 'data-delta="1" aria-label="Semana siguiente"')}
    </div>
    <div class="inline semana-controles">
      ${estaSemana ? '' : button('Esta semana', 'semana-hoy', 'btn-quiet btn-small')}
      <div class="segmented semana-vista" role="group" aria-label="Cuántos días se ven">
        <button type="button" data-action="semana-vista" data-vista="una" class="${ui.semana.vista === 'una' ? 'active' : ''}" aria-pressed="${ui.semana.vista === 'una'}">7 días</button>
        <button type="button" data-action="semana-vista" data-vista="dos" class="${ui.semana.vista === 'dos' ? 'active' : ''}" aria-pressed="${ui.semana.vista === 'dos'}">Ver dos semanas</button>
      </div>
      ${button('Ir a una fecha', 'semana-ir-a-fecha', 'btn-quiet btn-small')}
      ${button('Poner en varios días', 'semana-poner-en-dias', 'btn-secondary btn-small')}
    </div>
  </div>`;
}

// «Del 14 al 20 de septiembre», y no dos fechas completas seguidas: el mes se
// dice una sola vez cuando es el mismo, y el año solo cuando no es el de hoy.
//
// La semana que cambia de año necesita los dos. «Del 29 dic al 4 de enero de
// 2026» se lee como si el 29 de diciembre fuera de 2026, y es de 2025: el año
// del final se derrama hacia atrás sobre una fecha que no le pertenece.
function rangoEnPalabras(dias) {
  const primero = dias[0], ultimo = dias[dias.length - 1];
  const anoDeHoy = hoy().slice(0, 4);
  const cruzaDeAno = primero.slice(0, 4) !== ultimo.slice(0, 4);
  const otroAno = cruzaDeAno || primero.slice(0, 4) !== anoDeHoy || ultimo.slice(0, 4) !== anoDeHoy;
  const mismoMes = primero.slice(0, 7) === ultimo.slice(0, 7);
  const fin = { day: 'numeric', month: 'long', ...(otroAno ? { year: 'numeric' } : {}) };
  if (mismoMes) return `Del ${Number(primero.slice(8))} al ${niceDate(ultimo, fin)}`;
  const inicio = { day: 'numeric', month: 'short', ...(cruzaDeAno ? { year: 'numeric' } : {}) };
  return `Del ${niceDate(primero, inicio)} al ${niceDate(ultimo, fin)}`;
}

// «Lunes a jueves», o «Lunes» cuando es uno solo. Los días de la semana y no las
// fechas: quien mira esta línea el viernes piensa en días, no en números.
function diasEnPalabras(dias) {
  const nombre = date => niceDate(date, { weekday: 'long' });
  if (dias.length === 1) return cap(nombre(dias[0]));
  return `${cap(nombre(dias[0]))} a ${nombre(dias[dias.length - 1])}`;
}

function resumenDeLaVista(ctx, dias, cuenta) {
  if (!cuenta.decididas) {
    return `<div class="card soft semana-resumen"><p class="muted">Estos ${dias.length} días están en blanco. Toca cualquier comida para ponerla; las meriendas son opcionales y no cuentan.</p></div>`;
  }
  return `<div class="card soft semana-resumen">
    <p><strong>${cuenta.decididas} de ${cuenta.huecos}</strong> comidas decididas${cuenta.pendientes ? `, ${cuenta.pendientes} por decidir` : '. No queda ningún hueco'}${cuenta.meriendas ? ` · ${cuenta.meriendas} merienda(s) anotadas` : ''}.</p>
    <p class="tiny muted">Cuentan el desayuno, el almuerzo y la cena. Las meriendas se ponen cuando las hay: un día sin merienda está completo igual.</p>
  </div>`;
}

/* ── Un día ────────────────────────────────────────────────────────────── */

function tarjetaDeDia(ctx, date) {
  const { state } = ctx;
  const ahora = hoy();
  const esHoy = date === ahora;
  const pasado = date < ahora;
  const meriendas = SLOTS.filter(esOpcional);
  const libre = meriendas.find(slot => !planFor(state, date, slot));

  return `<section class="card semana-dia ${esHoy ? 'es-hoy' : ''} ${pasado ? 'ya-paso' : ''}">
    <header class="between semana-dia-cabecera">
      <div>
        <span class="semana-dia-semana">${esc(WEEKDAY_SHORT[weekdayOf(date) - 1])}</span>
        <h2 class="semana-dia-titulo">${esc(niceDate(date, { day: 'numeric', month: 'long' }))}</h2>
      </div>
      ${esHoy ? '<span class="pill warm">Hoy</span>' : ''}
      <button type="button" class="icon-btn" data-action="semana-abrir-dia" data-date="${date}" aria-label="Más cosas del ${esc(niceDate(date, { weekday: 'long', day: 'numeric', month: 'long' }))}">${icono('puntos', { tamano: 18 })}</button>
    </header>
    <div class="semana-momentos">
      ${SLOTS.map(slot => filaDeMomento(ctx, date, slot)).join('')}
    </div>
    ${libre ? `<button type="button" class="enlace semana-anadir-merienda" data-action="open-meal" data-date="${date}" data-slot="${libre}">+ Anotar una merienda</button>` : ''}
  </section>`;
}

function filaDeMomento(ctx, date, slot) {
  const { state } = ctx;
  const plan = planFor(state, date, slot);
  // Una merienda vacía no ocupa una fila. Están las que alguien puso, y para el
  // resto hay un solo enlace al pie del día: cinco filas de las que dos dicen
  // «sin decidir» para siempre convierten la pantalla en una lista de reproches.
  if (!plan && esOpcional(slot)) return '';
  const origen = plan ? origenDe(plan) : null;
  return `<button type="button" class="semana-momento ${plan ? '' : 'vacio'} ${plan?.kind === 'outside' || plan?.kind === 'order' ? 'fuera' : ''}" data-action="open-meal" data-date="${date}" data-slot="${slot}">
    <span class="semana-momento-nombre">${esc(etiquetaDeMomento(slot))}</span>
    <span class="semana-momento-texto">${esc(tituloDePlan(plan))}${plan?.note ? `<em>${esc(plan.note)}</em>` : ''}</span>
    <span class="semana-momento-marca" aria-hidden="true">${plan ? (origen ? `<span class="origen-punto origen-${esc(origen)}" title="${esc(etiquetaDeOrigen(origen))}"></span>` : '') : '+'}</span>
  </button>`;
}

export const tituloDePlan = plan => {
  if (!plan) return 'Sin decidir';
  if (['recipe', 'suelta', 'linked'].includes(plan.kind)) return plan.title || 'Sin nombre';
  return { outside: 'Fuera de casa', order: 'Pedimos comida', unplanned: 'Todavía no sabemos' }[plan.kind] || 'Sin decidir';
};

/* ── De dónde salió cada comida ────────────────────────────────────────────

   Un color y una palabra. El color cabe en la fila de un momento, donde no
   cabe una frase; la palabra vale para la leyenda, que es donde se lee.

   Solo se nombran los orígenes que hay en los días a la vista. Tres de los
   cinco ya no los produce nadie —«rutina», «mes anterior» y «sugerida» son de
   cuando la app llenaba el calendario sola— y anunciarlos en una semana que
   no los tiene sería prometer algo que la app dejó de hacer. */

function leyendaDeOrigenes(state, dias) {
  const presentes = new Set();
  for (const date of dias) for (const slot of SLOTS) {
    const plan = planFor(state, date, slot);
    if (plan) presentes.add(origenDe(plan));
  }
  const lista = ORIGENES.filter(origen => presentes.has(origen.id));
  if (!lista.length) return '';
  return `<div class="origen-leyenda">${lista.map(origen =>
    `<span class="origen-chip origen-${esc(origen.id)}" title="${esc(origen.detalle)}"><span class="origen-punto origen-${esc(origen.id)}" aria-hidden="true"></span>${esc(origen.etiqueta)}</span>`
  ).join('')}</div>`;
}

/* ── Avisos ────────────────────────────────────────────────────────────── */

// Lo último que se hizo, dicho en voz alta y con su botón de deshacer. Vaciar un
// día sin que la pantalla diga nada deja a cualquiera mirando a ver qué pasó.
function avisoDeCambio(ctx) {
  const { ui } = ctx;
  const aviso = ui.semana.aviso;
  if (!aviso) return '';
  const deshacer = ui.semana.deshacer ? `<div class="inline" style="margin-top:10px">${button('Deshacer', 'semana-deshacer', 'btn-quiet btn-small')}</div>` : '';
  return notice(aviso.titulo, `${esc(aviso.detalle)}${deshacer}`, aviso.tono || '');
}

/* ── Un día entero ─────────────────────────────────────────────────────────

   Hay cosas que se deciden por días enteros —«el domingo 12 comemos donde mi
   mamá»— y hacerlo comida por comida es repetir tres veces el mismo gesto. */

export function modalDia(ctx, extras = {}) {
  const { state } = ctx;
  const date = extras.date;
  const puestas = SLOTS.filter(slot => planFor(state, date, slot));
  const ausencias = state.absences.filter(item => item.date === date);
  const nombre = personId => state.people.find(persona => persona.id === personId)?.name || 'Alguien';
  return modal(niceDate(date, { weekday: 'long', day: 'numeric', month: 'long' }),
    'Lo que hagas aquí vale solo para este día.',
    `<div class="inline">
      ${button('Todo el día fuera de casa', 'semana-dia-fuera', 'btn-secondary btn-small', `data-date="${date}"`)}
      ${puestas.length ? button('Vaciar el día', 'semana-dia-vaciar', 'btn-quiet btn-small', `data-date="${date}"`) : ''}
    </div>
    <p class="tiny muted" style="margin-top:10px">«Todo el día fuera» marca el desayuno, el almuerzo y la cena; las meriendas se quedan como estén, porque son opcionales.</p>
    ${ausencias.length ? `<div class="divider"></div>
      <p class="small strong">No comen en casa este día</p>
      <ul class="food-list">${ausencias.map(item => `<li>${esc(nombre(item.personId))} · ${esc(etiquetaDeMomento(item.slot))}</li>`).join('')}</ul>
      <p class="tiny muted">Se marca dentro de cada comida, y <strong>no cambia lo que se cocina</strong>.</p>` : ''}`);
}

/* ── Poner una comida en varios días ───────────────────────────────────────

   La única ayuda que la app da para no tocar una casilla cada vez, y no
   adivina nada: se elige qué, en qué momento, y se marcan los días a mano.
   Se ponen esos y ninguno más. No se guarda ninguna costumbre y no vuelve a
   ejecutarse nunca.

   Los días que ofrece son los que están en pantalla —siete o catorce—, no los
   de un mes: hablar de días que no se ven obliga a recordar en qué semana
   cae cada número. */

export function modalPonerEnDias(ctx, extras = {}) {
  const { state, ui } = ctx;
  const dias = diasDe(ui);
  const receta = extras.receta || '';
  const momento = extras.slot || '';
  const tipo = extras.kind || 'recipe';
  const sinPreparaciones = !state.recipes.length;

  return modal('Poner una comida en varios días',
    `Los días que marques de estos ${dias.length}, y solo esos. No se repetirá sola.`,
    `<form data-form="poner-en-dias" class="modal-body dias-form">
      <fieldset class="field-group"><legend>¿Qué comen?</legend>
        <div class="radio-fila">
          <label class="radio-pill"><input type="radio" name="kind" value="recipe" ${tipo === 'recipe' ? 'checked' : ''}><span>Una preparación</span></label>
          <label class="radio-pill"><input type="radio" name="kind" value="outside" ${tipo === 'outside' ? 'checked' : ''}><span>Fuera de casa</span></label>
          <label class="radio-pill"><input type="radio" name="kind" value="order" ${tipo === 'order' ? 'checked' : ''}><span>Pedimos comida</span></label>
        </div>
        <label class="field" data-poner-receta ${tipo === 'recipe' ? '' : 'hidden'}><span>¿Cuál?</span>
          <select name="recipeId">${options(state.recipes.map(item => [item.id, item.name]), receta, state.recipes.length ? 'Elegir una preparación' : 'Todavía no hay preparaciones')}</select>
          ${sinPreparaciones
            ? `<small>Aún no has escrito ninguna. Ve a <strong>Preparaciones</strong> y escribe la primera.</small>`
            : ''}
        </label>
      </fieldset>

      <fieldset class="field-group"><legend>¿En qué comida?</legend>
        <div class="chips">${MOMENTOS.map(item => `<label class="chip-check"><input type="radio" name="momento" value="${item.id}" ${momento === item.id ? 'checked' : ''}><span>${esc(item.etiqueta)}</span></label>`).join('')}</div>
        <p class="hint">Una sola. Si esta preparación también se come en otro momento, se vuelve a entrar aquí y se marcan esos días: así el mangú puede estar los lunes de desayuno y los viernes de cena sin que se mezclen.</p>
      </fieldset>

      <fieldset class="field-group"><legend>¿Qué días?</legend>
        <div class="inline dias-atajos">
          ${button('Toda la semana', 'poner-dias-atajo', 'btn-quiet btn-small', 'data-cuantos="7"')}
          ${dias.length > 7 ? button('Las dos semanas', 'poner-dias-atajo', 'btn-quiet btn-small', 'data-cuantos="14"') : ''}
          ${button('Quitar la marca a todos', 'poner-dias-atajo', 'btn-quiet btn-small', 'data-cuantos="0"')}
        </div>
        <div class="chips dias-mes" style="margin-top:12px">${dias.map(date =>
          `<label class="chip-check dia-suelto ${weekdayOf(date) >= 6 ? 'finde' : ''}"><input type="checkbox" name="fechas" value="${date}"><span>${Number(date.slice(8))}<em>${esc(WEEKDAY_SHORT[weekdayOf(date) - 1].slice(0, 1))}</em></span></label>`).join('')}</div>
        <p class="hint" style="margin-top:12px">Son los días que estás viendo. Para otros, cierra esta ventana y muévete de semana.</p>
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

// Poner una comida en unas fechas concretas. Es lo único que escribe comidas de
// varias en varias, y lo hace con las fechas que una persona marcó una por una.
function ponerEnFechas(ctx, { fechas, slots, kind, recipeId, modo }) {
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
      if (kind === 'recipe') makeRecipePlan(state, recipeId, date, slot, null, null, 'manual');
      else setStatusPlan(state, date, slot, kind, null, 'manual');
      puestas++;
    } catch { saltadas++; }
  }
  ui.semana.deshacer = puestas ? antes : null;
  ui.semana.aviso = {
    titulo: `${puestas} comida(s) puestas en ${fechas.length} día(s).`,
    detalle: `${saltadas ? `${saltadas} se dejaron como estaban. ` : ''}Esto no se repetirá solo: son los días que marcaste, y ninguno más.`
  };
  ctx.closeModal();
  ctx.commit('');
}

/* ── Ir a una fecha ────────────────────────────────────────────────────────

   Sin abrir un mes. Quien busca «la semana del cumpleaños» sabe la fecha; lo
   que no quiere es contar semanas hacia adelante con una flecha. */

export function modalIrAFecha(ctx) {
  const { ui } = ctx;
  return modal('Ir a una fecha', 'Te llevo a la semana en que cae ese día.',
    `<form data-form="ir-a-fecha" class="stack">
      <label class="field"><span>¿Qué día?</span>
        <input type="date" name="fecha" value="${esc(ui.semana?.inicio || hoy())}" required>
      </label>
      <div class="modal-actions">
        ${button('Cancelar', 'close-modal', 'btn-secondary')}
        <button type="submit" class="btn btn-primary">Ir</button>
      </div>
    </form>`);
}

/* ── Acciones ──────────────────────────────────────────────────────────── */

export const SEMANA_ACTIONS = {
  'semana-mover': (el, ctx) => {
    // Una semana cada vez, aunque se estén viendo dos: quien mira del 14 al 27
    // y pulsa «siguiente» espera empezar el 21, no el 28. Saltarse siete días
    // esconde una semana entera sin decirlo.
    ctx.ui.semana.inicio = addDays(ctx.ui.semana.inicio, 7 * Number(el.dataset.delta));
    ctx.ui.semana.aviso = null;
    ctx.render();
  },
  // El navegador abre y cierra el `<details>`; esto solo apunta en qué quedó,
  // porque el siguiente repintado reconstruye la pantalla desde el estado y se
  // llevaría el atributo `open`. Al llegar aquí todavía vale el valor viejo.
  'semana-ver-pasados': (el, ctx) => { ctx.ui.semana.verPasados = !el.closest('details')?.open; },
  'semana-hoy': (el, ctx) => {
    ctx.ui.semana.inicio = weekStart(hoy());
    ctx.ui.semana.aviso = null;
    ctx.render();
  },
  'semana-vista': (el, ctx) => {
    ctx.ui.semana.vista = el.dataset.vista === 'dos' ? 'dos' : 'una';
    ctx.render();
  },
  'semana-ir-a-fecha': (el, ctx) => ctx.openModal('ir-a-fecha'),
  'semana-poner-en-dias': (el, ctx) => ctx.openModal('poner-en-dias', {
    // Entrando desde una comida del calendario llega con su preparación y su
    // momento ya elegidos: lo que ya se dijo no se vuelve a preguntar.
    receta: el.dataset.receta || '',
    slot: el.dataset.slot || '',
    kind: el.dataset.kind || ''
  }),

  // Marcar o desmarcar los N primeros días de los que están a la vista. Es un
  // atajo de la casilla, no una regla: lo que deja escrito son las casillas
  // marcadas, y desde ahí se quita o se añade a mano lo que haga falta.
  'poner-dias-atajo': (el, ctx) => {
    const cuantos = Number(el.dataset.cuantos);
    const casillas = [...document.querySelectorAll('[data-form="poner-en-dias"] [name="fechas"]')];
    // De hoy en adelante, para no llenar días que ya pasaron. Pero solo cuando
    // hoy cae dentro de lo que se está mirando: en una semana pasada, «de hoy
    // en adelante» no es ningún día, y el botón se quedaba sin hacer nada y sin
    // decir por qué. Ahí se marcan los días de esa semana, que es lo que la
    // persona está viendo y lo único que puede querer decir.
    const ahora = hoy();
    const ultimo = casillas.at(-1)?.value || '';
    const dentro = ctx.ui.semana.inicio <= ahora && ahora <= ultimo;
    const desde = dentro ? ahora : ctx.ui.semana.inicio;
    const elegibles = casillas.filter(casilla => casilla.value >= desde).slice(0, cuantos);
    for (const casilla of casillas) casilla.checked = elegibles.includes(casilla);
  },
  'semana-abrir-dia': (el, ctx) => ctx.openModal('dia', { date: el.dataset.date }),

  // Un día entero fuera de casa son las tres de siempre. Las meriendas se
  // quedan como estén: son opcionales, y borrar una que alguien puso a mano
  // sería pasarle por encima.
  'semana-dia-fuera': (el, ctx) => {
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
      } catch { /* una comida de la que cuelga otra se queda donde está */ }
    }
    ctx.ui.semana.deshacer = puestas ? antes : null;
    ctx.ui.semana.aviso = puestas ? {
      titulo: `${niceDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}: todo el día fuera de casa.`,
      detalle: `${puestas} comida(s) marcadas. Las meriendas se quedaron como estaban.`
    } : null;
    ctx.closeModal();
    ctx.commit(puestas ? '' : 'Ese día ya estaba fuera de casa.');
  },

  'semana-dia-vaciar': (el, ctx) => {
    const date = el.dataset.date;
    const planes = SLOTS.map(slot => planFor(ctx.state, date, slot)).filter(Boolean);
    if (!planes.length) return;
    if (!window.confirm(`Se van a quitar ${planes.length} comida(s) del ${niceDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}. ¿Continuar?`)) return;
    const antes = snapshot(ctx.state);
    for (const plan of planes) { try { deletePlan(ctx.state, plan.id, true); } catch { /* la vinculada la sostiene otra comida */ } }
    ctx.ui.semana.deshacer = antes;
    ctx.ui.semana.aviso = null;
    ctx.closeModal();
    ctx.commit('Día vaciado.');
  },

  'semana-deshacer': (el, ctx) => {
    if (!ctx.ui.semana.deshacer) return;
    restore(ctx.state, ctx.ui.semana.deshacer);
    ctx.ui.semana.deshacer = null;
    ctx.ui.semana.aviso = null;
    ctx.commit('Deshecho.');
  }
};

export const SEMANA_FORMS = {
  'poner-en-dias': (form, data, ctx) => {
    const kind = data.get('kind') || 'recipe';
    const momento = String(data.get('momento') || '');
    const modo = data.get('modo') === 'reemplazar' ? 'reemplazar' : 'vacios';

    if (!momento) throw new Error('Elige en qué comida del día: desayuno, merienda, almuerzo o cena.');
    if (kind === 'recipe' && !data.get('recipeId')) throw new Error('Elige qué preparación se pone, o marca «fuera de casa».');

    const fechas = [...form.querySelectorAll('[name="fechas"]:checked')].map(input => input.value).sort();
    if (!fechas.length) throw new Error('Marca al menos un día.');

    return ponerEnFechas(ctx, { fechas, slots: [momento], kind, recipeId: data.get('recipeId'), modo });
  },
  'ir-a-fecha': (form, data, ctx) => {
    const fecha = String(data.get('fecha') || '');
    if (!validDate(fecha)) throw new Error('Elige un día del calendario.');
    ctx.ui.semana.inicio = weekStart(fecha);
    ctx.ui.semana.aviso = null;
    ctx.closeModal();
    ctx.commit(`Semana del ${niceDate(fecha, { day: 'numeric', month: 'long' })}.`);
  }
};
