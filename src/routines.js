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
  SLOTS, dateRange, deletePlan, makeRecipePlan, monthBounds, monthChanges, nextId,
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

function normalizeRoutine(state, fields, previous = null) {
  const kind = ROUTINE_KINDS.includes(fields.kind) ? fields.kind : previous?.kind;
  if (!ROUTINE_KINDS.includes(kind)) throw new Error('Elige si la rutina es una preparación, comer fuera o pedir.');
  const recipeId = 'recipeId' in fields ? fields.recipeId || null : previous?.recipeId ?? null;
  if (kind === 'recipe' && !state.recipes.some(item => item.id === recipeId)) throw new Error('Selecciona la preparación de la rutina.');
  const slots = [...new Set(('slots' in fields ? fields.slots : previous?.slots) || [])].filter(slot => SLOTS.includes(slot));
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
  const until = ('until' in fields ? fields.until : previous?.until) || null;
  if (until && !validDate(until)) throw new Error('Elige una fecha final válida.');
  const label = String(('label' in fields ? fields.label : previous?.label) || '').trim() || describeRule(weekdays, weeks);
  const active = 'active' in fields ? Boolean(fields.active) : previous?.active ?? true;
  return { kind, recipeId: kind === 'recipe' ? recipeId : null, slots, weekdays, weeks, scope, month: month || null, until, label, active };
}

export function addRoutine(state, fields) {
  const date = todayISO();
  const routine = { id: nextId(state, 'rutina'), ...normalizeRoutine(state, fields), createdAt: date, updatedAt: date };
  state.mealRoutines.push(routine);
  return routine;
}

export function updateRoutine(state, id, fields) {
  const routine = state.mealRoutines.find(item => item.id === id);
  if (!routine) throw new Error('Rutina no encontrada.');
  Object.assign(routine, normalizeRoutine(state, fields, routine), { updatedAt: todayISO() });
  return routine;
}

// Borrar la regla no borra las comidas que ya puso: están escritas en el
// calendario y alguien puede contar con ellas. Solo se les quita la marca, para
// que no queden apuntando a una rutina que ya no existe.
export function deleteRoutine(state, id) {
  const before = state.mealRoutines.length;
  state.mealRoutines = state.mealRoutines.filter(item => item.id !== id);
  if (before === state.mealRoutines.length) return false;
  for (const plan of state.plans) if (plan.routineId === id) plan.routineId = null;
  return true;
}

export function routinesFor(state, month) {
  if (!validMonth(month)) throw new Error('Elige un mes válido.');
  const { start } = monthBounds(month);
  return state.mealRoutines.filter(routine => {
    if (!routine.active) return false;
    if (routine.scope === 'month' && routine.month !== month) return false;
    // Una rutina que terminó antes de que empezara el mes ya no pinta nada aquí.
    return !(routine.until && routine.until < start);
  });
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
  const routine = state.mealRoutines.find(item => item.id === routineId);
  if (!routine) throw new Error('Rutina no encontrada.');
  if (!validMonth(month)) throw new Error('Elige un mes válido.');
  if (routine.scope === 'month' && routine.month !== month) throw new Error(`Esta rutina es solo de ${routine.month}.`);
  const modo = options.modo === 'reemplazar' ? 'reemplazar' : 'vacios';
  const hasta = [routine.until, options.hasta].filter(Boolean).sort()[0] || null;

  const creados = [], saltados = [], reemplazados = [];
  for (const date of datesForRule(month, routine.weekdays, routine.weeks)) {
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
  for (const routine of routinesFor(state, month)) {
    const result = applyRoutine(state, routine.id, month, options);
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
    creados.push(...applyRoutine(state, routine.id, month, { modo: 'vacios' }).creados);
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
    try { creados.push(copyPlan(state, plan.id, date, plan.slot).id); }
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
  const huecos = dias * SLOTS.length;
  let encasa = 0, fuera = 0, pedido = 0, pendientes = 0;
  for (const date of fechas) for (const slot of SLOTS) {
    const plan = planFor(state, date, slot);
    if (!plan || plan.kind === 'unplanned') { pendientes += 1; continue; }
    if (plan.kind === 'outside') { fuera += 1; continue; }
    if (plan.kind === 'order') { pedido += 1; continue; }
    encasa += 1;
  }
  return {
    month, dias, huecos, encasa, fuera, pedido, pendientes,
    porcentaje: huecos ? Math.round(((huecos - pendientes) / huecos) * 100) : 0,
    cambiosCanasta: monthChanges(state, month).changes.length
  };
}
