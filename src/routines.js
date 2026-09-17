// Casi todo lo que come una casa se repite: los domingos se come fuera, los
// lunes hay mangú, los viernes se pide. Escribir eso treinta veces al mes es la
// razón por la que nadie llena un calendario de comidas más de una semana.
//
// Una rutina es esa regla escrita una vez. Aplicarla llena los huecos del mes
// respetando lo que ya había: una rutina nunca pisa una decisión que alguien
// tomó a mano, salvo que se le pida expresamente.
//
// Este archivo puede importar del modelo; el modelo no importa de aquí. El
// sentido único evita el ciclo y deja claro quién manda: las rutinas son una
// forma cómoda de escribir comidas, no una parte del motor de inventario.

import {
  SLOTS, SLOTS_PRINCIPALES, dateRange, deletePlan, makeRecipePlan, monthBounds, monthChanges, nextId,
  planFor, setStatusPlan, todayISO, validDate, validMonth, copyPlan
} from './model.js';

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
export const WEEKDAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const WEEKDAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const ROUTINE_KINDS = ['recipe', 'outside', 'order'];

const ORDINALS = ['primer', 'segundo', 'tercer', 'cuarto', 'quinto'];

// Mediodía y no medianoche: a las 00:00 un cambio de horario de verano puede
// devolver el día anterior, y entonces un lunes pasaría a contarse como domingo.
const at = date => new Date(`${date}T12:00:00`);

// ISO: 1 lunes … 7 domingo. `getDay()` cuenta desde el domingo, que es el que
// se sale de la fila.
export function weekdayOf(date) {
  if (!validDate(date)) throw new Error('Elige una fecha válida.');
  const day = at(date).getDay();
  return day === 0 ? 7 : day;
}

// Cuántas veces ha caído ese día de la semana en el mes, contándose a sí mismo:
// el tercer domingo de octubre devuelve 3. Los días 1 a 7 son la primera vez, el
// 8 a 14 la segunda, y así. No depende de la longitud del mes.
export function ordinalInMonth(date) {
  if (!validDate(date)) throw new Error('Elige una fecha válida.');
  return Math.floor((Number(date.slice(8, 10)) - 1) / 7) + 1;
}

// Las fechas de verdad del mes que cumplen la regla.
//
// Se recorre el calendario real, día por día, desde el 1 hasta el último. No se
// suman semanas ni se dan 28 o 30 días por supuestos: un lunes que caiga el 29,
// el 30 o el 31 tiene el mismo derecho a salir que el del día 5, y febrero de un
// año bisiesto tiene un 29 que no se puede perder.
export function datesForRule(month, weekdays, weeks = null) {
  if (!validMonth(month)) throw new Error('Elige un mes válido.');
  const dias = new Set((weekdays || []).map(Number).filter(day => WEEKDAYS.includes(day)));
  if (!dias.size) return [];
  const ordinales = Array.isArray(weeks) && weeks.length ? new Set(weeks.map(Number)) : null;
  const { start, end } = monthBounds(month);
  return dateRange(start, end).filter(date => {
    if (!dias.has(weekdayOf(date))) return false;
    return !ordinales || ordinales.has(ordinalInMonth(date));
  });
}

const listar = items => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`);
const plural = name => (name.endsWith('s') ? name : `${name}s`);
const capitalizar = text => (text ? text[0].toLocaleUpperCase('es') + text.slice(1) : text);

// «Primer y tercer domingo», «Todos los lunes y miércoles». Es el texto que ve
// quien no quiere aprenderse qué significa `weeks: [1, 3]`.
export function describeRule(weekdays, weeks) {
  const dias = [...new Set((weekdays || []).map(Number).filter(day => WEEKDAYS.includes(day)))].sort((a, b) => a - b);
  if (!dias.length) return 'Sin días';
  const nombres = dias.map(day => WEEKDAY_LABELS[day - 1].toLocaleLowerCase('es'));
  const ordinales = Array.isArray(weeks) && weeks.length ? [...new Set(weeks.map(Number))].sort((a, b) => a - b) : null;
  if (!ordinales) {
    if (dias.length === 7) return 'Todos los días';
    return capitalizar(`todos los ${listar(nombres.map(plural))}`);
  }
  return capitalizar(`${listar(ordinales.map(week => ORDINALS[week - 1] || `${week}.º`))} ${listar(nombres)}`);
}

/* ── Escribir y leer rutinas ───────────────────────────────────────────── */

/* ── Una regla, un momento ─────────────────────────────────────────────────

   Una regla une UNA preparación con UN momento del día y unos días o semanas.

   La ficha de la preparación dice en qué momentos **puede** comerse: el mangú
   con salami vale de desayuno y de cena. La regla dice cuándo **se pone**: los
   lunes de desayuno. Son dos cosas distintas y confundirlas es lo que hacía
   imposible lo que una casa pide constantemente —cambiar el desayuno de los
   lunes sin tocar la cena de los viernes—, porque una sola regla arrastraba los
   dos momentos y editar uno movía el otro.

   Ahora son reglas independientes: cada una se añade, se edita, se pausa y se
   borra sola. Una preparación puede tener las que haga falta.

   `momento` es el campo que manda. `slots` se sigue escribiendo —siempre con un
   solo elemento— porque hay pantallas que lo leen; es un eco, no una lista. */

const momentosPedidos = (fields, previous) => {
  const crudos = 'momento' in fields && fields.momento ? [fields.momento]
    : 'slots' in fields ? fields.slots
      : (previous?.momento ? [previous.momento] : previous?.slots) || [];
  const marcados = new Set(crudos);
  return SLOTS.filter(slot => marcados.has(slot));
};

// Todas las reglas de una preparación. Una preparación puede tener varias, y
// son independientes: «mangú los lunes en el desayuno» y «mangú los viernes en
// la cena» no se estorban.
export const reglasDePreparacion = (state, recipeId) =>
  (state.mealRoutines || []).filter(regla => regla.kind === 'recipe' && regla.recipeId === recipeId);

export const regla = (state, id) => (state.mealRoutines || []).find(item => item.id === id) || null;

/* ── Pausar una regla ──────────────────────────────────────────────────────

   Pausar no es borrar y por eso existen las dos. «Este mes no desayunamos
   mangú, pero en octubre volvemos» es pausar: la regla se queda escrita con sus
   días y su preparación, deja de poner comidas, y se reanuda con un toque.
   Borrarla obligaría a escribirla otra vez de memoria.

   Las comidas que ya puso no se tocan. Pausar mira hacia delante. */
export function pausarRegla(state, id, pausada = true) {
  const item = regla(state, id);
  if (!item) throw new Error('Regla no encontrada.');
  item.active = !pausada;
  item.updatedAt = todayISO();
  return item;
}

function normalizeRoutine(state, fields, previous = null) {
  const kind = ROUTINE_KINDS.includes(fields.kind) ? fields.kind : previous?.kind;
  if (!ROUTINE_KINDS.includes(kind)) throw new Error('Elige si la rutina es una preparación, comer fuera o pedir.');
  const recipeId = 'recipeId' in fields ? fields.recipeId || null : previous?.recipeId ?? null;
  if (kind === 'recipe' && !state.recipes.some(item => item.id === recipeId)) throw new Error('Selecciona la preparación de la rutina.');
  const slots = momentosPedidos(fields, previous);
  if (!slots.length) throw new Error('Selecciona al menos una comida del día.');
  const weekdays = [...new Set((('weekdays' in fields ? fields.weekdays : previous?.weekdays) || []).map(Number))].filter(day => WEEKDAYS.includes(day)).sort((a, b) => a - b);
  if (!weekdays.length) throw new Error('Selecciona al menos un día de la semana.');
  const rawWeeks = 'weeks' in fields ? fields.weeks : previous?.weeks;
  // Una lista vacía y «todas las semanas» son lo mismo, y guardar las dos formas
  // obligaría a comprobar las dos en cada lectura.
  const weeks = Array.isArray(rawWeeks) && rawWeeks.length
    ? [...new Set(rawWeeks.map(Number))].filter(week => Number.isInteger(week) && week >= 1 && week <= 5).sort((a, b) => a - b)
    : null;
  if (Array.isArray(rawWeeks) && rawWeeks.length && !weeks.length) throw new Error('Las semanas del mes van de la primera a la quinta.');
  const scope = ['permanent', 'month'].includes(fields.scope) ? fields.scope : previous?.scope || 'permanent';
  const month = scope === 'month' ? ('month' in fields ? fields.month : previous?.month) : null;
  if (scope === 'month' && !validMonth(month)) throw new Error('Elige el mes de la rutina.');
  // Desde cuándo vale, y hasta cuándo. Las dos son fechas de verdad y no meses,
  // porque «los martes a partir del 15» es una frase que una casa dice.
  //
  // `desde` es lo que permite escribir hoy una costumbre que empieza el mes que
  // viene sin que se meta en lo que queda de este. Sin ella, la única forma de
  // decirlo era esperar a que llegara el mes, que es justo lo que esta pantalla
  // existe para evitar.
  const desde = ('desde' in fields ? fields.desde : previous?.desde) || null;
  if (desde && !validDate(desde)) throw new Error('Elige desde qué día vale la rutina.');
  const until = ('until' in fields ? fields.until : previous?.until) || null;
  if (until && !validDate(until)) throw new Error('Elige una fecha final válida.');
  if (desde && until && desde > until) throw new Error('La fecha de inicio no puede ser posterior a la del final.');
  const label = String(('label' in fields ? fields.label : previous?.label) || '').trim() || describeRule(weekdays, weeks);
  const active = 'active' in fields ? Boolean(fields.active) : previous?.active ?? true;
  return { momentos: slots, comunes: { kind, recipeId: kind === 'recipe' ? recipeId : null, weekdays, weeks, scope, month: month || null, desde, until, label, active } };
}

// Escribir una regla por momento. Quien pide tres momentos de una sentada
// —«los domingos comemos fuera: desayuno, almuerzo y cena»— escribe tres
// reglas independientes, no una que valga para tres cosas. Se devuelven todas.
export function addRoutines(state, fields) {
  const { momentos, comunes } = normalizeRoutine(state, fields);
  const date = todayISO();
  return momentos.map(momento => {
    const nueva = { id: nextId(state, 'regla'), momento, slots: [momento], ...comunes, createdAt: date, updatedAt: date };
    state.mealRoutines.push(nueva);
    return nueva;
  });
}

// La primera de las que escribió. La ventana de una regla pide un solo momento,
// así que casi siempre es la única.
export function addRoutine(state, fields) {
  return addRoutines(state, fields)[0];
}

// Editar cambia esta regla y ninguna más. Cambiarle el momento a la del lunes no
// puede tocar la del viernes: son dos costumbres distintas de la misma casa.
//
// De los momentos que lleguen se usa el primero. La ventana pide uno solo; que
// aquí se acepte una lista es por los caminos viejos que todavía la mandan.
export function updateRoutine(state, id, fields) {
  const anterior = regla(state, id);
  if (!anterior) throw new Error('Rutina no encontrada.');
  const { momentos, comunes } = normalizeRoutine(state, fields, anterior);
  Object.assign(anterior, comunes, { momento: momentos[0], slots: [momentos[0]], updatedAt: todayISO() });
  return anterior;
}

/* ── Borrar una rutina ─────────────────────────────────────────────────────

   Qué pasa con las comidas que ya puso no lo puede decidir este archivo. Hay
   dos respuestas razonables y dependen de por qué se borra:

    · `conservar` — la casa deja de repetirlo, pero lo que ya está escrito en el
      calendario se queda. Es lo que hay que hacer con los días que ya pasaron:
      se comieron, y borrarlos sería reescribir lo que pasó.
    · `quitar` — se borran también las comidas futuras. Es lo que espera quien
      dice «esto ya no se hace en esta casa» antes de que llegue el mes.

   `desde` acota el borrado: por defecto solo se quitan las de hoy en adelante,
   porque quitar las de la semana pasada no deshace ninguna cena. */

export function deleteRoutine(state, id, { comidas = 'conservar', desde = todayISO() } = {}) {
  const before = state.mealRoutines.length;
  state.mealRoutines = state.mealRoutines.filter(item => item.id !== id);
  if (before === state.mealRoutines.length) return false;

  const suyas = state.plans.filter(plan => plan.routineId === id);
  const quitadas = [];
  if (comidas === 'quitar') {
    for (const plan of [...suyas]) {
      if (desde && plan.date < desde) continue;
      // Una comida de la que cuelga otra cosa no se puede tirar sin más:
      // `deletePlan` lo comprueba y lanza. Si no se deja, se conserva, que es
      // mejor que un dato roto.
      try { deletePlan(state, plan.id); quitadas.push(plan.id); }
      catch { /* se queda, y abajo se le suelta la marca como a las demás */ }
    }
  }
  for (const plan of state.plans) if (plan.routineId === id) plan.routineId = null;
  return { borrada: true, conservadas: suyas.length - quitadas.length, quitadas: quitadas.length };
}

// Si la regla alcanza ese mes: su alcance lo incluye, no había terminado antes
// de que empezara, y ya había entrado en vigor. No mira si está en pausa: eso lo
// deciden las dos funciones de abajo, porque no quieren lo mismo.
function alcanzaElMes(routine, month, start, end) {
  if (routine.scope === 'month' && routine.month !== month) return false;
  if (routine.until && routine.until < start) return false;
  return !(routine.desde && routine.desde > end);
}

// Las que van a poner comidas. Una regla en pausa no está aquí: eso es lo que
// significa pausarla.
export function routinesFor(state, month) {
  if (!validMonth(month)) throw new Error('Elige un mes válido.');
  const { start, end } = monthBounds(month);
  return state.mealRoutines.filter(routine => routine.active !== false && alcanzaElMes(routine, month, start, end));
}

/* ── Las reglas de un mes, para enseñarlas ─────────────────────────────────

   Aquí sí entran las que están en pausa, y tienen que entrar: una regla pausada
   que desapareciera de la pantalla no se podría reanudar nunca, y quien la pausó
   pensaría que la borró.

   El orden es el de la casa: por momento del día y, dentro de cada momento, por
   el primer día de la semana en que cae. «Los lunes desayunamos mangú, los
   viernes cenamos pollo». */
export function reglasDelMes(state, month) {
  if (!validMonth(month)) throw new Error('Elige un mes válido.');
  const { start, end } = monthBounds(month);
  return (state.mealRoutines || [])
    .filter(routine => alcanzaElMes(routine, month, start, end))
    .sort((a, b) =>
      SLOTS.indexOf(a.momento) - SLOTS.indexOf(b.momento)
      || Math.min(...(a.weekdays?.length ? a.weekdays : [8])) - Math.min(...(b.weekdays?.length ? b.weekdays : [8]))
      || String(a.label || '').localeCompare(String(b.label || '')));
}

/* ── Llevar una costumbre nueva a los meses que ya estaban abiertos ────────

   Abrir un mes le pasa las rutinas permanentes por encima una sola vez. Eso
   deja un hueco: quien preparó noviembre en octubre y hoy escribe «los martes,
   pollo» esperaba que noviembre se enterara, y noviembre no se enteraba, porque
   su único momento de escuchar ya había pasado.

   No se aplica a meses que ya pasaron: una costumbre nueva no reescribe cenas
   que ya se comieron. */

export function mesesAbiertosDesde(state, month) {
  if (!validMonth(month)) throw new Error('Elige un mes válido.');
  return Object.keys(state.monthPlans || {})
    .filter(mes => validMonth(mes) && mes > month)
    .sort();
}

export function extenderAMesesAbiertos(state, routineId, mesDeOrigen, options = {}) {
  const routine = state.mealRoutines.find(item => item.id === routineId);
  if (!routine) throw new Error('Rutina no encontrada.');
  const out = { meses: [], creados: [], saltados: [], reemplazados: [] };
  if (routine.scope !== 'permanent') return out;
  for (const mes of mesesAbiertosDesde(state, mesDeOrigen)) {
    if (!routinesFor(state, mes).some(item => item.id === routineId)) continue;
    const resultado = applyRoutine(state, routineId, mes, options);
    if (!resultado.creados.length && !resultado.reemplazados.length) continue;
    out.meses.push(mes);
    out.creados.push(...resultado.creados);
    out.saltados.push(...resultado.saltados);
    out.reemplazados.push(...resultado.reemplazados);
  }
  return out;
}

// Cuántas comidas de esos meses se pisarían al extender. Se pregunta antes de
// reemplazar nada, que es lo que pide el encargo: rellenar huecos sin avisar,
// pisar decisiones solo con permiso.
export function ocupadasEnMesesAbiertos(state, routineId, mesDeOrigen) {
  const routine = regla(state, routineId);
  if (!routine || routine.scope !== 'permanent') return [];
  const ocupadas = [];
  for (const mes of mesesAbiertosDesde(state, mesDeOrigen)) {
    if (!routinesFor(state, mes).some(item => item.id === routine.id)) continue;
    for (const date of datesForRule(mes, routine.weekdays, routine.weeks)) {
      if (routine.desde && date < routine.desde) continue;
      if (routine.until && date > routine.until) continue;
      const plan = planFor(state, date, routine.momento);
      if (plan) ocupadas.push({ mes, date, slot: routine.momento, titulo: plan.title || plan.kind });
    }
  }
  return ocupadas;
}

export function routinePlans(state, routineId, { from = null } = {}) {
  return state.plans
    .filter(plan => plan.routineId === routineId && (!from || plan.date >= from))
    .sort((a, b) => a.date.localeCompare(b.date) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
}

// Cambiar una comida suelta no puede cambiar la regla. Al soltar la marca, esa
// comida deja de moverse cuando la rutina se reaplique o se borre, que es justo
// lo que espera quien tocó un solo domingo.
export function detachPlanFromRoutine(state, planId) {
  const plan = state.plans.find(item => item.id === planId);
  if (!plan) throw new Error('Comida no encontrada.');
  plan.routineId = null;
  return plan;
}

/* ── Aplicar rutinas a un mes ──────────────────────────────────────────── */

export function applyRoutine(state, routineId, month, options = {}) {
  const routine = regla(state, routineId);
  if (!routine) throw new Error('Rutina no encontrada.');
  return aplicarRegla(state, routine, month, options);
}

function aplicarRegla(state, routine, month, options = {}) {
  if (!validMonth(month)) throw new Error('Elige un mes válido.');
  if (routine.scope === 'month' && routine.month !== month) throw new Error(`Esta rutina es solo de ${routine.month}.`);
  const modo = options.modo === 'reemplazar' ? 'reemplazar' : 'vacios';
  const hasta = [routine.until, options.hasta].filter(Boolean).sort()[0] || null;
  // De las dos fechas de inicio manda la más tardía: la de la regla dice desde
  // cuándo la casa hace esto, y la de la llamada acota una aplicación concreta.
  const desde = [routine.desde, options.desde].filter(Boolean).sort().pop() || null;

  const creados = [], saltados = [], reemplazados = [];
  for (const date of datesForRule(month, routine.weekdays, routine.weeks)) {
    if (desde && date < desde) continue;
    if (hasta && date > hasta) continue;
    for (const slot of SLOTS) {
      if (!routine.slots.includes(slot)) continue;
      const existing = planFor(state, date, slot);
      let antes = null, devolver = null;
      if (existing) {
        if (modo !== 'reemplazar') { saltados.push({ date, slot, motivo: 'ya tenía plan' }); continue; }
        antes = existing.title || existing.kind;
        // Una preparación de la que cuelga una comida reservada no se sustituye
        // a la ligera: quitarla dejaría esa reserva sin de dónde salir.
        devolver = { plan: structuredClone(existing), index: state.plans.indexOf(existing) };
        try { deletePlan(state, existing.id); }
        catch { saltados.push({ date, slot, motivo: 'hay una comida reservada que depende de esta' }); continue; }
      }
      try {
        const plan = routine.kind === 'recipe'
          ? makeRecipePlan(state, routine.recipeId, date, slot, null, routine.id)
          : setStatusPlan(state, date, slot, routine.kind, routine.id);
        creados.push(plan.id);
        if (antes !== null) reemplazados.push({ date, slot, antes });
      } catch (error) {
        // Ya se había quitado la comida que había y la nueva no se pudo poner.
        // Dejar el hueco sería perder una decisión que alguien tomó por una
        // rutina que ni siquiera cabía ahí, así que se devuelve donde estaba.
        if (devolver) state.plans.splice(devolver.index, 0, devolver.plan);
        saltados.push({ date, slot, motivo: error.message });
      }
    }
  }
  return { creados, saltados, reemplazados };
}

export function applyRoutines(state, month, options = {}) {
  const out = { creados: [], saltados: [], reemplazados: [] };
  // Una por una y no por grupos: recorrer los grupos aplicaría cada regla
  // tantas veces como hermanas tenga.
  for (const routine of routinesFor(state, month)) {
    const result = aplicarRegla(state, routine, month, options);
    out.creados.push(...result.creados);
    out.saltados.push(...result.saltados);
    out.reemplazados.push(...result.reemplazados);
  }
  return out;
}

// Abrir un mes es un gesto de una sola vez: se marca como abierto y se le pasan
// las rutinas permanentes por encima, llenando solo los huecos.
//
// No copia nada del mes anterior. Ni las excepciones de la canasta —eran
// excepciones de aquel mes, no una costumbre nueva— ni las comidas sueltas.
// Y no toca la canasta habitual: abrir noviembre no es cambiar lo que la casa
// come de siempre.
export function openMonth(state, month) {
  if (!validMonth(month)) throw new Error('Elige un mes válido.');
  // Volver a entrar en un mes ya abierto no puede rehacerle nada: quien borró un
  // domingo a mano lo borró para siempre, no hasta la próxima vez que mire.
  if (state.monthPlans[month]) return { yaAbierto: true, resumen: monthProgress(state, month) };
  state.monthPlans[month] = { month, openedAt: todayISO(), preparedAt: null, summary: null };
  const creados = [];
  for (const routine of routinesFor(state, month)) {
    if (routine.scope !== 'permanent') continue;
    creados.push(...aplicarRegla(state, routine, month, { modo: 'vacios' }).creados);
  }
  return { yaAbierto: false, resumen: monthProgress(state, month), creados };
}

// Repetir el mes pasado, pero por día de la semana y no por número de fecha: el
// lunes 5 de octubre se parece al lunes 2 de noviembre, no al 5, que es jueves.
// Se copia el patrón de preparaciones y nada más: un «comemos fuera» del día 12
// fue de aquel día, y las comidas reservadas dependen de una preparación
// concreta que en el mes nuevo no existe.
export function copyPatternFromMonth(state, from, to) {
  if (!validMonth(from) || !validMonth(to)) throw new Error('Elige dos meses válidos.');
  if (from === to) throw new Error('Elige dos meses distintos.');
  const destino = new Map();
  const { start, end } = monthBounds(to);
  for (const date of dateRange(start, end)) destino.set(`${weekdayOf(date)}-${ordinalInMonth(date)}`, date);

  const creados = [], saltados = [];
  const origen = state.plans
    .filter(plan => plan.date.slice(0, 7) === from && plan.kind === 'recipe')
    .sort((a, b) => a.date.localeCompare(b.date) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  for (const plan of origen) {
    const date = destino.get(`${weekdayOf(plan.date)}-${ordinalInMonth(plan.date)}`);
    // Un quinto lunes no tiene dónde caer en un mes que solo tiene cuatro.
    if (!date) { saltados.push({ date: plan.date, slot: plan.slot, motivo: 'ese día no existe en el mes nuevo' }); continue; }
    if (planFor(state, date, plan.slot)) { saltados.push({ date, slot: plan.slot, motivo: 'ya tenía plan' }); continue; }
    try {
      const copia = copyPlan(state, plan.id, date, plan.slot);
      // Traída del mes pasado, y así se dirá en el calendario: es la diferencia
      // entre «esto lo decidí yo» y «esto venía de antes y puedo cambiarlo».
      copia.origen = 'mes-anterior';
      creados.push(copia.id);
    }
    catch (error) { saltados.push({ date, slot: plan.slot, motivo: error.message }); }
  }
  return { creados, saltados };
}

// Cuánto le falta al mes. Una comida fuera o pedida está decidida: no es un
// hueco. Contarla como pendiente empujaría a planificar un almuerzo que ya se
// sabe que nadie va a cocinar.
export function monthProgress(state, month) {
  if (!validMonth(month)) throw new Error('Elige un mes válido.');
  const { start, end } = monthBounds(month);
  const fechas = dateRange(start, end);
  const dias = fechas.length;
  // El progreso cuenta lo que una casa espera resolver todos los días. Las
  // meriendas suman cuando están puestas, pero no restan cuando no lo están:
  // un mes sin ninguna merienda anotada está al cien por cien, porque hay casas
  // que no meriendan y no les falta nada.
  const huecos = dias * SLOTS_PRINCIPALES.length;
  let encasa = 0, fuera = 0, pedido = 0, pendientes = 0, meriendas = 0;
  for (const date of fechas) for (const slot of SLOTS) {
    const plan = planFor(state, date, slot);
    const opcional = !SLOTS_PRINCIPALES.includes(slot);
    if (!plan || plan.kind === 'unplanned') { if (!opcional) pendientes += 1; continue; }
    if (opcional) { meriendas += 1; continue; }
    if (plan.kind === 'outside') { fuera += 1; continue; }
    if (plan.kind === 'order') { pedido += 1; continue; }
    encasa += 1;
  }
  return {
    month, dias, huecos, encasa, fuera, pedido, pendientes, meriendas,
    porcentaje: huecos ? Math.round(((huecos - pendientes) / huecos) * 100) : 0,
    cambiosCanasta: monthChanges(state, month).changes.length
  };
}
