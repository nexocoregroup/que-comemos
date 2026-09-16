// El asistente no toca los datos. Pide acciones, y las acciones son estas.
//
// Un modelo de lenguaje se equivoca de cuatro formas que importan aquí: inventa
// identificadores que no existen, confunde «este mes» con «siempre», a veces
// repite la misma petición dos veces, y se atreve con frases que no entendió.
// Las cuatro se resuelven en el mismo sitio y de la misma manera:
//
//   1. Lista blanca. Si la acción no está en esta tabla, no existe. No hay
//      forma de pedir «ejecuta esto» ni de escribir en el almacenamiento.
//   2. Los identificadores no se creen. Un `producto` se resuelve contra el
//      catálogo real por nombre o alias; si hay dos candidatos, la acción no se
//      ejecuta: se devuelve una pregunta.
//   3. Cada acción declara su **alcance**: si lo que hace vale para un día,
//      para un mes o desde ahora y para siempre. El alcance se enseña antes de
//      ejecutar, y si es amplio —más de un día, o cualquier cosa permanente—
//      hay que confirmarlo. Confundir «solo en octubre» con «todos los meses»
//      es el peor error que puede cometer esta app: reescribe la costumbre de
//      una casa sin que nadie lo haya pedido. Por eso son dos acciones
//      distintas, con dos nombres distintos, y ninguna adivina la otra.
//   4. Todo pasa por las mismas funciones del modelo que usan los formularios,
//      dentro de una transacción. Si una acción de un grupo falla, no queda
//      nada a medias.
//
// Y una regla que no es técnica: lo que cambia el inventario, borra datos o
// cambia una costumbre se confirma antes, en español, con las cantidades y las
// fechas a la vista. Nunca enseñando el JSON.

import {
  BASES, MOTIVOS_DE_RESTRICCION, PRIORITIES, SLOTS, SLOTS_PRINCIPALES, UNITS, addProduct, addPurchase, archiveProduct, basisLabel,
  copyPlan, correctStock, createReview, deletePlan, deleteRecipe, duplicateRecipe, effectiveBasket,
  etiquetaDeMomento, findSimilarProducts, generateMonth, habitualLines, inventoryNow, linkPendingRestrictions, makeRecipePlan, mergeProducts,
  monthBasketSummary, monthChanges, movePlan, planFor, product, productByName, promoteToHabitual,
  removeHabitualLine, removeMonthChange, repeatWeek, restore, restoreProduct, restriccionesDe, saveReview, setAbsence,
  setEquivalence, setHabitualLine, setMonthChange, setStatusPlan, shoppingList, snapshot, todayISO,
  transaction, updateProduct, upsertPerson, upsertRecipe, validDate, validMonth, weekStart
} from './model.js';
import {
  addRoutine, applyRoutine, applyRoutines, copyPatternFromMonth, datesForRule, deleteRoutine,
  describeRule, detachPlanFromRoutine, monthProgress, openMonth, routinesFor
} from './routines.js';
import { normalizeName } from './nombres.js';

const fmt = value => new Intl.NumberFormat('es-DO', { maximumFractionDigits: 3 }).format(Number(value || 0));
const mesActual = () => todayISO().slice(0, 7);
const mesTexto = mes => new Intl.DateTimeFormat('es-DO', { month: 'long', year: 'numeric' }).format(new Date(`${mes}-01T12:00:00`));
const fechaTexto = fecha => new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${fecha}T12:00:00`));

// Las fechas que toca un cambio se enseñan siempre, porque «todos los viernes»
// no dice nada hasta que se ve que son cinco días concretos. Se cortan a seis:
// una lista de treinta fechas no la lee nadie.
function fechasTexto(fechas) {
  if (!fechas.length) return '';
  const dias = fechas.map(fecha => Number(fecha.slice(8, 10)));
  const visibles = dias.slice(0, 6).join(', ');
  return dias.length > 6 ? `${visibles} y ${dias.length - 6} más` : visibles;
}

/* ── Resolución de argumentos ──────────────────────────────────────────── */

// Nunca se confía en un identificador que venga de fuera. Si llega un id, tiene
// que existir de verdad; si llega un nombre, se busca. Un nombre que coincide
// con dos alimentos no se resuelve a ojo: se devuelve la duda.
function resolveEntity(list, value, etiqueta, clave = 'name') {
  const raw = String(value ?? '').trim();
  if (!raw) return { ok: false, error: `Falta indicar ${etiqueta}.` };
  const byId = list.find(item => item.id === raw);
  if (byId) return { ok: true, value: byId };
  const key = normalizeName(raw);
  const exact = list.filter(item => normalizeName(item[clave]) === key || (item.aliases || []).some(alias => normalizeName(alias) === key));
  if (exact.length === 1) return { ok: true, value: exact[0] };
  if (exact.length > 1) return { ok: false, ambiguous: exact, error: `Hay varios ${etiqueta} que se llaman «${raw}».`, clave };
  const partial = list.filter(item => normalizeName(item[clave]).includes(key) && key.length >= 3);
  if (partial.length === 1) return { ok: true, value: partial[0] };
  if (partial.length > 1) return { ok: false, ambiguous: partial, error: `¿Cuál de estos es «${raw}»?`, clave };
  return { ok: false, error: `No encuentro ${etiqueta} que se llame «${raw}».` };
}

// Escribir la canasta es el único sitio donde un alimento que no existe todavía
// no es un error: quien dice «desde ahora compramos cangrejo» está nombrando
// algo que aún no está en el catálogo, y obligarle a registrarlo antes es el
// orden invertido que hace que nadie termine de escribir su canasta. Aun así no
// se crea a la callada: viene marcado como nuevo, se enseña en la confirmación
// y solo se registra al ejecutar.
function resolveAlimento(state, value) {
  const found = resolveEntity(state.products, value, 'un alimento');
  if (found.ok || found.ambiguous) return found;
  const nombre = String(value ?? '').trim();
  if (!nombre) return found;
  const similar = findSimilarProducts(state, nombre, { limit: 3 });
  // Partir el inventario de un alimento en dos por una tilde es de los errores
  // más caros de deshacer, así que un parecido muy alto se pregunta.
  if (similar.length && similar[0].score >= 0.85) {
    return { ok: false, ambiguous: similar.map(fila => fila.product), error: `¿Te refieres a «${similar[0].product.name}»?` };
  }
  return { ok: true, value: { nuevo: true, name: nombre } };
}

// El id del alimento, registrándolo si era nuevo. Solo se llama desde `run`:
// validar o describir una acción jamás puede escribir en el estado.
function idDelAlimento(state, alimento, unidad) {
  if (!alimento.nuevo) return alimento.id;
  if (!UNITS.includes(unidad)) throw new Error(`Dime en qué se cuenta «${alimento.name}»: ${UNITS.join(', ')}.`);
  return addProduct(state, { name: alimento.name, controlUnit: unidad, purchaseUnit: unidad, origin: 'asistente' }).id;
}

const listaDe = (value, permitidos) => [...new Set((Array.isArray(value) ? value : [value]).map(item => (typeof item === 'number' ? item : String(item ?? '').trim())))]
  .filter(item => permitidos.includes(item));

const TYPES = {
  texto: value => {
    const text = String(value ?? '').trim();
    return text ? { ok: true, value: text } : { ok: false, error: 'Falta un texto.' };
  },
  numero: value => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? { ok: true, value: n } : { ok: false, error: `«${value}» no es una cantidad válida.` };
  },
  fecha: value => validDate(value) ? { ok: true, value } : { ok: false, error: `«${value}» no es una fecha válida (usa 2026-09-15).` },
  mes: value => validMonth(value) ? { ok: true, value } : { ok: false, error: `«${value}» no es un mes válido (usa 2026-09).` },
  unidad: value => UNITS.includes(value) ? { ok: true, value } : { ok: false, error: `«${value}» no es una unidad. Usa: ${UNITS.join(', ')}.` },
  comida: value => SLOTS.includes(value) ? { ok: true, value } : { ok: false, error: `«${value}» no es un momento del día. Usa: ${SLOTS.map(etiquetaDeMomento).join(', ')}.` },
  prioridad: value => PRIORITIES.includes(value) ? { ok: true, value } : { ok: false, error: `«${value}» no es una prioridad válida.` },
  base: value => BASES.includes(value) ? { ok: true, value } : { ok: false, error: `La compra se calcula con ${BASES.join(' o ')}.` },
  lista: value => Array.isArray(value) ? { ok: true, value } : { ok: false, error: 'Se esperaba una lista.' },
  booleano: value => ({ ok: true, value: Boolean(value) }),
  producto: (value, state) => resolveEntity(state.products, value, 'un alimento'),
  alimento: (value, state) => resolveAlimento(state, value),
  persona: (value, state) => resolveEntity(state.people, value, 'una persona'),
  preparacion: (value, state) => resolveEntity(state.recipes, value, 'una preparación'),
  rutina: (value, state) => resolveEntity(state.mealRoutines, value, 'una rutina', 'label'),
  comidas: value => {
    const list = listaDe(value, SLOTS);
    return list.length ? { ok: true, value: list } : { ok: false, error: `Dime en qué momentos: ${SLOTS.map(etiquetaDeMomento).join(', ')}.` };

  },
  // ISO: 1 lunes … 7 domingo, como en routines.js. Un solo sitio decide qué
  // número es cada día y aquí solo se comprueba que esté dentro.
  dias: value => {
    const list = listaDe((Array.isArray(value) ? value : [value]).map(Number), [1, 2, 3, 4, 5, 6, 7]).sort((a, b) => a - b);
    return list.length ? { ok: true, value: list } : { ok: false, error: 'Dime qué días de la semana (1 lunes … 7 domingo).' };
  },
  semanas: value => {
    const list = listaDe((Array.isArray(value) ? value : [value]).map(Number), [1, 2, 3, 4, 5]).sort((a, b) => a - b);
    return list.length ? { ok: true, value: list } : { ok: false, error: 'Las semanas del mes van de la primera a la quinta.' };
  },
  tipoRutina: value => ['preparacion', 'fuera', 'pedido'].includes(value)
    ? { ok: true, value }
    : { ok: false, error: 'La rutina es una preparación, comer fuera o pedir comida.' },
  // Este es el argumento que separa las dos verdades de la app. No tiene valor
  // por omisión a propósito: si la frase no lo dijo, se pregunta.
  alcanceRutina: value => ['mes', 'siempre'].includes(value)
    ? { ok: true, value }
    : { ok: false, error: '¿Es solo para este mes o desde ahora, todos los meses?' }
};

/* ── El alcance ────────────────────────────────────────────────────────── */
//
// La pregunta que la persona tiene derecho a ver contestada antes de que se
// toque nada: ¿esto vale para un día, para un mes, o para siempre?

const SIN_ALCANCE = { tipo: 'ninguno', texto: '', fechas: [], mes: null };
const deUnDia = fecha => ({ tipo: 'fecha', texto: `Solo el ${fechaTexto(fecha)}`, fechas: [fecha], mes: fecha.slice(0, 7) });
const deUnMes = (mes, fechas = []) => ({ tipo: 'mes', texto: `Solo en ${mesTexto(mes)}`, fechas, mes });
const deSiempre = (fechas = [], mes = null) => ({ tipo: 'permanente', texto: 'Desde ahora, todos los meses', fechas, mes });

const ORDEN_ALCANCE = { ninguno: 0, fecha: 1, mes: 2, permanente: 3 };
const masAmplio = (a, b) => (ORDEN_ALCANCE[b.tipo] > ORDEN_ALCANCE[a.tipo] ? b : a);

/* ── La tabla de acciones ──────────────────────────────────────────────── */
//
// `kind`:     'consulta'  → no cambia nada, no pide confirmación, no necesita deshacer
//             'cambio'    → reversible; se ejecuta y se ofrece deshacer
//             'sensible'  → toca el inventario, borra o reescribe algo; confirma antes
//
// `alcance`   dice hasta dónde llega el cambio. Lo amplio confirma siempre.
// `revisa`    devuelve un motivo para no ejecutar, antes de llegar a `run`.
// `confirmaSi` obliga a confirmar aunque el alcance sea corto (registrar un
//             alimento nuevo, pisar una comida que ya estaba puesta).
// `describe`  es lo que ve el usuario antes de confirmar. En español, con las
//             cantidades, los nombres y las fechas reales, nunca el JSON.

export const ACTIONS = {
  /* Productos */
  buscar_producto: {
    kind: 'consulta', args: { texto: { type: 'texto' } },
    describe: a => `Buscar «${a.texto}» en el catálogo.`,
    run: (state, a) => {
      const exact = productByName(state, a.texto);
      const similar = findSimilarProducts(state, a.texto, { limit: 5, threshold: 0.5 });
      return { encontrado: exact ? { id: exact.id, nombre: exact.name } : null, parecidos: similar.map(row => ({ id: row.product.id, nombre: row.product.name, puntuacion: row.score })) };
    }
  },
  listar_productos: {
    kind: 'consulta', args: { categoria: { type: 'texto', required: false }, incluirArchivados: { type: 'booleano', required: false } },
    describe: () => 'Listar los alimentos del catálogo.',
    run: (state, a) => state.products
      .filter(item => (a.incluirArchivados || !item.archived) && (!a.categoria || item.category === a.categoria))
      .map(item => ({ id: item.id, nombre: item.name, categoria: item.category, unidad: item.controlUnit, archivado: item.archived }))
  },
  consultar_existencias: {
    kind: 'consulta', args: { producto: { type: 'producto', required: false } },
    describe: a => a.producto ? `Ver cuánto queda de ${a.producto.name}.` : 'Ver las existencias de la casa.',
    run: (state, a) => {
      const stock = inventoryNow(state);
      if (a.producto) return { nombre: a.producto.name, cantidad: stock[a.producto.id] || 0, unidad: a.producto.controlUnit };
      return state.products.filter(item => !item.archived).map(item => ({ nombre: item.name, cantidad: stock[item.id] || 0, unidad: item.controlUnit }));
    }
  },
  crear_producto: {
    kind: 'cambio',
    args: { nombre: { type: 'texto' }, unidad: { type: 'unidad' }, unidadCompra: { type: 'unidad', required: false }, categoria: { type: 'texto', required: false }, existencias: { type: 'numero', required: false } },
    describe: a => `Registrar «${a.nombre}», contado en ${a.unidad}${a.existencias ? `, con ${fmt(a.existencias)} en casa` : ''}.`,
    // Un duplicado no se crea a la callada: si ya hay algo muy parecido, la
    // acción para y pregunta. Partir el inventario de un alimento en dos es de
    // los errores más caros de deshacer.
    run: (state, a) => {
      const similar = findSimilarProducts(state, a.nombre, { limit: 3 });
      if (similar.length && similar[0].score >= 0.85) {
        return { pregunta: `Encontramos un producto parecido: «${similar[0].product.name}». ¿Quieres usarlo o crear uno diferente?`, opciones: similar.map(row => ({ id: row.product.id, nombre: row.product.name })) };
      }
      const item = addProduct(state, { name: a.nombre, controlUnit: a.unidad, purchaseUnit: a.unidadCompra || a.unidad, category: a.categoria, opening: a.existencias, origin: 'asistente' });
      return { id: item.id, nombre: item.name };
    }
  },
  editar_producto: {
    kind: 'cambio', args: { producto: { type: 'producto' }, nombre: { type: 'texto', required: false }, unidadCompra: { type: 'unidad', required: false }, categoria: { type: 'texto', required: false } },
    describe: a => `Cambiar la ficha de ${a.producto.name}.`,
    run: (state, a) => updateProduct(state, a.producto.id, {
      ...(a.nombre ? { name: a.nombre } : {}), ...(a.unidadCompra ? { purchaseUnit: a.unidadCompra } : {}), ...(a.categoria ? { category: a.categoria } : {})
    })
  },
  archivar_producto: {
    kind: 'cambio', args: { producto: { type: 'producto' } },
    describe: a => `Archivar ${a.producto.name}. Deja de ofrecerse, pero su historial se conserva.`,
    run: (state, a) => archivarResumen(archiveProduct(state, a.producto.id))
  },
  reactivar_producto: {
    kind: 'cambio', args: { producto: { type: 'producto' } },
    describe: a => `Volver a ofrecer ${a.producto.name}.`,
    run: (state, a) => archivarResumen(restoreProduct(state, a.producto.id))
  },
  unir_productos: {
    kind: 'sensible', args: { conservar: { type: 'producto' }, unir: { type: 'producto' } },
    describe: a => `Unir «${a.unir.name}» dentro de «${a.conservar.name}». Se suman sus existencias y su historial, y «${a.unir.name}» deja de existir. Esto no se puede deshacer desde aquí.`,
    run: (state, a) => ({ id: mergeProducts(state, a.conservar.id, a.unir.id).id })
  },
  configurar_equivalencia: {
    kind: 'cambio', args: { producto: { type: 'producto' }, unidad: { type: 'unidad' }, equivale: { type: 'numero' } },
    describe: a => `1 ${a.unidad} de ${a.producto.name} equivale a ${fmt(a.equivale)} ${a.producto.controlUnit}.`,
    run: (state, a) => { setEquivalence(state, a.producto.id, a.unidad, a.equivale); return { ok: true }; }
  },

  /* Mi canasta habitual — lo que la casa compra todos los meses */
  ver_canasta_habitual: {
    kind: 'consulta', args: {},
    describe: () => 'Ver mi canasta habitual.',
    run: state => habitualLines(state).map(line => ({ nombre: product(state, line.productId)?.name, cantidad: line.quantity, unidad: line.unit, prioridad: line.priority }))
  },
  agregar_a_habitual: {
    kind: 'cambio',
    args: { producto: { type: 'alimento' }, cantidad: { type: 'numero' }, unidad: { type: 'unidad' }, prioridad: { type: 'prioridad', required: false } },
    alcance: () => deSiempre(),
    revisa: a => (a.cantidad > 0 ? null : 'Para la canasta habitual hace falta una cantidad mayor que cero.'),
    // Registrar un alimento que no existía es un efecto de más: se enseña y se
    // confirma, para que nadie descubra un «cangrejo» en su catálogo sin saber
    // de dónde salió.
    confirmaSi: a => Boolean(a.producto.nuevo),
    describe: a => `${a.producto.nuevo ? `Registrar «${a.producto.name}» como alimento nuevo y p` : 'P'}oner ${fmt(a.cantidad)} ${a.unidad} de ${a.producto.name} al mes en mi canasta habitual. Desde ahora, todos los meses.`,
    run: (state, a) => setHabitualLine(state, idDelAlimento(state, a.producto, a.unidad), a.cantidad, a.unidad, a.prioridad)
  },
  quitar_de_habitual: {
    kind: 'sensible', args: { producto: { type: 'producto' } },
    alcance: () => deSiempre(),
    describe: a => `Quitar ${a.producto.name} de mi canasta habitual. Deja de comprarse todos los meses.`,
    run: (state, a) => ({ quitado: removeHabitualLine(state, a.producto.id) })
  },

  /* Cambios de un mes — excepciones que no tocan la costumbre */
  ver_canasta_del_mes: {
    kind: 'consulta', args: { mes: { type: 'mes', required: false } },
    alcance: a => deUnMes(a.mes || mesActual()),
    describe: a => `Ver la canasta de ${mesTexto(a.mes || mesActual())}, con los cambios de ese mes ya aplicados.`,
    run: (state, a) => effectiveBasket(state, a.mes || mesActual()).map(line => ({
      nombre: product(state, line.productId)?.name, cantidad: line.quantity, unidad: line.unit, origen: line.source
    }))
  },
  ver_cambios_del_mes: {
    kind: 'consulta', args: { mes: { type: 'mes', required: false } },
    alcance: a => deUnMes(a.mes || mesActual()),
    describe: a => `Ver en qué se aparta ${mesTexto(a.mes || mesActual())} de mi canasta habitual.`,
    run: (state, a) => {
      const mes = a.mes || mesActual();
      const resumen = monthBasketSummary(state, mes);
      return {
        mes, resumen,
        cambios: monthChanges(state, mes).changes.map(cambio => ({
          nombre: product(state, cambio.productId)?.name,
          cantidad: cambio.quantity, unidad: cambio.unit,
          quitado: cambio.removed, extra: cambio.extra
        }))
      };
    }
  },
  cambiar_solo_este_mes: {
    kind: 'cambio',
    args: { mes: { type: 'mes', required: false }, producto: { type: 'alimento' }, cantidad: { type: 'numero' }, unidad: { type: 'unidad', required: false } },
    alcance: a => deUnMes(a.mes || mesActual()),
    revisa: (a, state) => (a.producto.nuevo && !a.unidad ? `Dime en qué se cuenta «${a.producto.name}»: ${UNITS.join(', ')}.` : null),
    confirmaSi: a => Boolean(a.producto.nuevo),
    describe: a => `${a.producto.nuevo ? `Registrar «${a.producto.name}» como alimento nuevo y p` : 'P'}oner ${fmt(a.cantidad)} ${a.unidad || ''} de ${a.producto.name} solo en ${mesTexto(a.mes || mesActual())}. Mi canasta habitual no cambia.`.replace(/\s+/g, ' '),
    run: (state, a) => setMonthChange(state, a.mes || mesActual(), idDelAlimento(state, a.producto, a.unidad), {
      quantity: a.cantidad, ...(a.unidad ? { unit: a.unidad } : {})
    })
  },
  quitar_solo_este_mes: {
    kind: 'cambio', args: { mes: { type: 'mes', required: false }, producto: { type: 'producto' } },
    alcance: a => deUnMes(a.mes || mesActual()),
    describe: a => `No comprar ${a.producto.name} en ${mesTexto(a.mes || mesActual())}. Sigue en mi canasta habitual y en los demás meses.`,
    run: (state, a) => setMonthChange(state, a.mes || mesActual(), a.producto.id, { removed: true })
  },
  volver_a_lo_habitual: {
    kind: 'cambio', args: { mes: { type: 'mes', required: false }, producto: { type: 'producto' } },
    alcance: a => deUnMes(a.mes || mesActual()),
    describe: a => `Deshacer el cambio de ${a.producto.name} en ${mesTexto(a.mes || mesActual())}: vuelve a lo habitual.`,
    run: (state, a) => ({ quitado: removeMonthChange(state, a.mes || mesActual(), a.producto.id) })
  },
  pasar_a_habitual: {
    kind: 'sensible', args: { mes: { type: 'mes' }, productos: { type: 'lista' } },
    alcance: () => deSiempre(),
    describe: (a, state) => `Pasar a mi canasta habitual ${a.productos.length} cambio(s) de ${mesTexto(a.mes)}: ${a.productos.map(valor => {
      const found = resolveEntity(state.products, valor, 'un alimento');
      return found.ok ? found.value.name : String(valor);
    }).join(', ')}. Desde ahora se compran todos los meses.`,
    run: (state, a) => {
      const ids = a.productos.map(valor => {
        const found = resolveEntity(state.products, valor, 'un alimento');
        if (!found.ok) throw new Error(found.error);
        return found.value.id;
      });
      return { aplicados: promoteToHabitual(state, a.mes, ids) };
    }
  },

  /* Rutinas de comida */
  ver_rutinas: {
    kind: 'consulta', args: { mes: { type: 'mes', required: false } },
    describe: a => `Ver las rutinas de comida que valen en ${mesTexto(a.mes || mesActual())}.`,
    run: (state, a) => {
      const mes = a.mes || mesActual();
      return routinesFor(state, mes).map(rutina => ({
        id: rutina.id, etiqueta: rutina.label, regla: describeRule(rutina.weekdays, rutina.weeks),
        comidas: rutina.slots, alcance: rutina.scope === 'permanent' ? 'siempre' : 'mes',
        que: rutina.kind === 'recipe' ? state.recipes.find(item => item.id === rutina.recipeId)?.name : rutina.kind,
        fechas: datesForRule(mes, rutina.weekdays, rutina.weeks)
      }));
    }
  },
  crear_rutina: {
    kind: 'cambio',
    args: {
      tipo: { type: 'tipoRutina' },
      preparacion: { type: 'preparacion', required: false },
      comidas: { type: 'comidas' },
      dias: { type: 'dias' },
      semanas: { type: 'semanas', required: false },
      // Sin valor por omisión y con pregunta propia: el alcance es lo único que
      // esta acción no puede adivinar sin arriesgarse a cambiar una costumbre.
      alcance: { type: 'alcanceRutina', pregunta: '¿Esta rutina es solo para este mes, o desde ahora y todos los meses?' },
      mes: { type: 'mes', required: false },
      hasta: { type: 'fecha', required: false },
      etiqueta: { type: 'texto', required: false }
    },
    alcance: a => {
      const mes = a.mes || mesActual();
      const fechas = datesForRule(mes, a.dias, a.semanas || null);
      return a.alcance === 'siempre' ? deSiempre(fechas, mes) : deUnMes(mes, fechas);
    },
    // Una rutina de preparación sin preparación no se puede escribir, y la
    // preparación no se inventa: se crea en su pantalla, con sus alimentos.
    revisa: a => (a.tipo === 'preparacion' && !a.preparacion ? 'Dime qué preparación se repite. Si todavía no existe, créala primero con sus alimentos.' : null),
    describe: (a, state) => {
      const mes = a.mes || mesActual();
      const fechas = datesForRule(mes, a.dias, a.semanas || null);
      const cabeza = a.alcance === 'siempre' ? 'Desde ahora, todos los meses' : `Solo en ${mesTexto(mes)}`;
      const cola = fechas.length
        ? ` En ${mesTexto(mes)} son ${fechas.length} día(s): ${fechasTexto(fechas)}.`
        : ` En ${mesTexto(mes)} no cae ningún día de esos.`;
      return `${cabeza}: ${queHaceLaRutina(a)} en ${comidasTexto(a.comidas)}, ${describeRule(a.dias, a.semanas || null).toLocaleLowerCase('es')}.${cola} Solo se llenan las comidas que estén vacías.`;
    },
    run: (state, a) => {
      const mes = a.mes || mesActual();
      const rutina = addRoutine(state, {
        kind: { preparacion: 'recipe', fuera: 'outside', pedido: 'order' }[a.tipo],
        recipeId: a.preparacion?.id || null,
        slots: a.comidas, weekdays: a.dias, weeks: a.semanas || null,
        scope: a.alcance === 'siempre' ? 'permanent' : 'month',
        month: a.alcance === 'siempre' ? null : mes,
        until: a.hasta || null,
        label: a.etiqueta || ''
      });
      // Crear la regla y no aplicarla dejaría un mes vacío con una promesa
      // escrita en otra pantalla. Se aplica al mes que toca, sin pisar nada.
      const aplicado = applyRoutine(state, rutina.id, mes, { modo: 'vacios' });
      return {
        id: rutina.id, etiqueta: rutina.label, mes,
        fechas: datesForRule(mes, rutina.weekdays, rutina.weeks),
        creados: aplicado.creados.length, saltados: aplicado.saltados
      };
    }
  },
  eliminar_rutina: {
    kind: 'sensible', args: { rutina: { type: 'rutina' } },
    alcance: (a, state) => (a.rutina.scope === 'permanent' ? deSiempre() : deUnMes(a.rutina.month || mesActual())),
    describe: a => `Borrar la rutina «${a.rutina.label}». Las comidas que ya puso se quedan escritas; lo que deja de pasar es que se repita sola.`,
    run: (state, a) => ({ borrada: deleteRoutine(state, a.rutina.id) })
  },
  aplicar_rutinas: {
    kind: 'cambio', args: { mes: { type: 'mes', required: false } },
    alcance: (a, state) => {
      const mes = a.mes || mesActual();
      return deUnMes(mes, [...new Set(routinesFor(state, mes).flatMap(rutina => datesForRule(mes, rutina.weekdays, rutina.weeks)))].sort());
    },
    describe: (a, state) => {
      const mes = a.mes || mesActual();
      const rutinas = routinesFor(state, mes);
      if (!rutinas.length) return `No hay ninguna rutina que valga en ${mesTexto(mes)}.`;
      return `Pasar ${rutinas.length} rutina(s) por ${mesTexto(mes)}: ${rutinas.map(rutina => rutina.label).join(', ')}. Solo se llenan las comidas vacías.`;
    },
    run: (state, a) => {
      const resultado = applyRoutines(state, a.mes || mesActual(), { modo: 'vacios' });
      return { creados: resultado.creados.length, saltados: resultado.saltados.length };
    }
  },
  copiar_rutina_de_mes: {
    kind: 'cambio', args: { desde: { type: 'mes' }, hasta: { type: 'mes' } },
    alcance: a => deUnMes(a.hasta),
    describe: a => `Copiar en ${mesTexto(a.hasta)} el patrón de comidas de ${mesTexto(a.desde)}, por día de la semana. No se copian las comidas fuera de casa ni las pedidas, y no se pisa nada de lo que ya haya.`,
    run: (state, a) => {
      const resultado = copyPatternFromMonth(state, a.desde, a.hasta);
      return { creados: resultado.creados.length, saltados: resultado.saltados.length };
    }
  },
  abrir_mes: {
    kind: 'cambio', args: { mes: { type: 'mes' } },
    alcance: a => deUnMes(a.mes),
    describe: a => `Abrir ${mesTexto(a.mes)} y pasarle las rutinas de siempre. No copia los cambios de otros meses ni toca mi canasta habitual.`,
    run: (state, a) => {
      const abierto = openMonth(state, a.mes);
      return { mes: a.mes, yaAbierto: abierto.yaAbierto, creados: abierto.creados?.length || 0, resumen: abierto.resumen };
    }
  },
  ver_avance_mes: {
    kind: 'consulta', args: { mes: { type: 'mes', required: false } },
    describe: a => `Ver cómo va ${mesTexto(a.mes || mesActual())}.`,
    run: (state, a) => monthProgress(state, a.mes || mesActual())
  },

  /* Personas */
  crear_persona: {
    kind: 'cambio', args: { nombre: { type: 'texto' }, tipo: { type: 'texto', required: false } },
    describe: a => `Registrar a ${a.nombre} como parte de la casa.`,
    run: (state, a) => ({ id: upsertPerson(state, { name: a.nombre, kind: a.tipo, restrictions: [], habitual: [] }).id })
  },
  agregar_restriccion: {
    kind: 'cambio', args: { persona: { type: 'persona' }, alimento: { type: 'texto' }, motivo: { type: 'texto', required: false } },
    describe: a => `${a.persona.name} no puede comer ${a.alimento}.`,
    // Si el alimento todavía no existe se guarda por nombre y se enlaza cuando
    // aparezca. Obligar a crear el producto antes es el orden invertido que
    // hace que nadie termine de registrar a su familia.
    //
    // El motivo llega solo si la frase lo decía. Dictar «Sofía no puede comer
    // maní» no dice si es alergia o manía, y el asistente no lo va a adivinar:
    // la fila queda sin motivo y se completa desde Más → Familia.
    run: (state, a) => {
      const match = productByName(state, a.alimento);
      const person = state.people.find(item => item.id === a.persona.id);
      const motivo = MOTIVOS_DE_RESTRICCION.includes(a.motivo) ? a.motivo : null;
      person.restricciones = [...restriccionesDe(person), { productId: match?.id || null, texto: match ? '' : a.alimento, motivo }];
      linkPendingRestrictions(state, person);
      return { enlazado: Boolean(match), nombre: match ? match.name : a.alimento };
    }
  },
  registrar_ausencia: {
    kind: 'cambio', args: { persona: { type: 'persona' }, fecha: { type: 'fecha' }, comida: { type: 'comida' }, ausente: { type: 'booleano', required: false } },
    alcance: a => deUnDia(a.fecha),
    describe: a => `${a.persona.name} ${a.ausente === false ? 'vuelve a comer' : 'no come'} en casa el ${fechaTexto(a.fecha)} en la ${a.comida}.`,
    run: (state, a) => { setAbsence(state, a.fecha, a.comida, a.persona.id, a.ausente !== false); return { ok: true }; }
  },
  cantidad_habitual: {
    kind: 'cambio', args: { persona: { type: 'persona' }, producto: { type: 'producto' }, cantidad: { type: 'numero' }, unidad: { type: 'unidad' } },
    describe: a => `${a.persona.name} come normalmente ${fmt(a.cantidad)} ${a.unidad} de ${a.producto.name}.`,
    run: (state, a) => {
      const person = state.people.find(item => item.id === a.persona.id);
      const habitual = (person.habitual || []).filter(row => row.productId !== a.producto.id);
      habitual.push({ productId: a.producto.id, quantity: a.cantidad, unit: a.unidad });
      return upsertPerson(state, { id: person.id, name: person.name, habitual });
    }
  },

  /* Preparaciones */
  crear_preparacion: {
    kind: 'cambio', args: { nombre: { type: 'texto' }, comidas: { type: 'lista' }, alimentos: { type: 'lista' } },
    describe: a => `Crear la preparación «${a.nombre}» con ${a.alimentos.length} alimento(s).`,
    run: (state, a) => {
      const items = a.alimentos.map(row => {
        const found = resolveEntity(state.products, row.producto ?? row.productId ?? row.nombre, 'un alimento');
        if (!found.ok) throw new Error(found.error);
        return { productId: found.value.id, quantity: row.cantidad ?? row.quantity, unit: row.unidad ?? row.unit };
      });
      return { id: upsertRecipe(state, { name: a.nombre, uses: a.comidas, items }).id };
    }
  },
  duplicar_preparacion: {
    kind: 'cambio', args: { preparacion: { type: 'preparacion' } },
    describe: a => `Duplicar «${a.preparacion.name}».`,
    run: (state, a) => ({ id: duplicateRecipe(state, a.preparacion.id).id })
  },
  eliminar_preparacion: {
    kind: 'sensible', args: { preparacion: { type: 'preparacion' } },
    describe: a => `Eliminar «${a.preparacion.name}» del catálogo. Las comidas ya asignadas conservan sus cantidades.`,
    run: (state, a) => { deleteRecipe(state, a.preparacion.id); return { ok: true }; }
  },

  /* Menú */
  ver_menu: {
    kind: 'consulta', args: { fecha: { type: 'fecha', required: false } },
    describe: a => `Ver lo que hay planificado para el ${a.fecha ? fechaTexto(a.fecha) : 'día de hoy'}.`,
    run: (state, a) => {
      const date = a.fecha || todayISO();
      return SLOTS.map(slot => {
        const plan = planFor(state, date, slot);
        return { comida: slot, titulo: plan?.title || null, estado: plan?.kind || 'sin plan' };
      });
    }
  },
  asignar_comida: {
    kind: 'cambio', args: { preparacion: { type: 'preparacion' }, fecha: { type: 'fecha' }, comida: { type: 'comida' } },
    alcance: a => deUnDia(a.fecha),
    describe: a => `Poner «${a.preparacion.name}» en la ${a.comida} del ${fechaTexto(a.fecha)}.`,
    run: (state, a) => ({ id: makeRecipePlan(state, a.preparacion.id, a.fecha, a.comida).id })
  },
  // «Cambia solamente la cena de mañana»: una comida y nada más. Si esa comida
  // la había puesto una rutina, se le quita la marca en vez de tocar la regla:
  // cambiar un jueves no puede cambiar todos los jueves.
  cambiar_solo_esta_comida: {
    kind: 'cambio',
    args: { fecha: { type: 'fecha' }, comida: { type: 'comida' }, preparacion: { type: 'preparacion', required: false }, estado: { type: 'texto', required: false } },
    alcance: a => deUnDia(a.fecha),
    confirmaSi: (a, state) => Boolean(planFor(state, a.fecha, a.comida)),
    describe: (a, state) => {
      const habia = planFor(state, a.fecha, a.comida);
      const antes = habia ? ` En vez de ${habia.title ? `«${habia.title}»` : ESTADO_DICHO[habia.kind] || 'lo que hay'}.` : '';
      const nuevo = a.preparacion ? `poner «${a.preparacion.name}»` : a.estado ? ESTADO_DICHO[a.estado] || a.estado : 'cambiarla';
      return `Cambiar solo la ${a.comida} del ${fechaTexto(a.fecha)}: ${nuevo}.${antes} La rutina no cambia: los demás días se quedan como están.`;
    },
    run: (state, a) => {
      const habia = planFor(state, a.fecha, a.comida);
      if (!a.preparacion && !a.estado) {
        const posibles = state.recipes.filter(receta => receta.uses.includes(a.comida));
        // Sin preparaciones guardadas no hay nada que ofrecer, y fingir una
        // lista vacía sería dejar a la persona mirando una pregunta sin
        // respuestas posibles.
        if (!posibles.length) {
          return { pregunta: `Todavía no tienes preparaciones para la ${a.comida}. Créala en su pantalla y te la pongo, o dime «${a.comida} fuera de casa».`, campo: null, opciones: [] };
        }
        return {
          pregunta: `¿Qué pongo en la ${a.comida} del ${fechaTexto(a.fecha)}? Cambio solo esa comida; la rutina se queda igual.`,
          campo: 'preparacion',
          opciones: posibles.slice(0, 12).map(receta => ({ id: receta.id, nombre: receta.name }))
        };
      }
      // Soltarla de la rutina antes de borrarla deja constancia de que ese día
      // se decidió a mano, aunque después se vuelva a aplicar la rutina.
      if (habia) { detachPlanFromRoutine(state, habia.id); deletePlan(state, habia.id, true); }
      const plan = a.preparacion
        ? makeRecipePlan(state, a.preparacion.id, a.fecha, a.comida)
        : setStatusPlan(state, a.fecha, a.comida, a.estado);
      return { id: plan.id, reemplazo: Boolean(habia) };
    }
  },
  copiar_comida: {
    kind: 'cambio', args: { desde: { type: 'fecha' }, comidaDesde: { type: 'comida' }, hasta: { type: 'fecha' }, comidaHasta: { type: 'comida', required: false } },
    alcance: a => deUnDia(a.hasta),
    describe: a => `Copiar la ${a.comidaDesde} del ${fechaTexto(a.desde)} al ${fechaTexto(a.hasta)}.`,
    run: (state, a) => {
      const plan = planFor(state, a.desde, a.comidaDesde);
      if (!plan) throw new Error(`No hay nada planificado en la ${a.comidaDesde} del ${a.desde}.`);
      return { id: copyPlan(state, plan.id, a.hasta, a.comidaHasta || a.comidaDesde).id };
    }
  },
  mover_comida: {
    kind: 'cambio', args: { desde: { type: 'fecha' }, comidaDesde: { type: 'comida' }, hasta: { type: 'fecha' }, comidaHasta: { type: 'comida', required: false } },
    alcance: a => deUnDia(a.hasta),
    describe: a => `Mover la ${a.comidaDesde} del ${fechaTexto(a.desde)} al ${fechaTexto(a.hasta)}.`,
    run: (state, a) => {
      const plan = planFor(state, a.desde, a.comidaDesde);
      if (!plan) throw new Error(`No hay nada planificado en la ${a.comidaDesde} del ${a.desde}.`);
      movePlan(state, plan.id, a.hasta, a.comidaHasta || a.comidaDesde);
      return { ok: true };
    }
  },
  marcar_comida: {
    kind: 'cambio', args: { fecha: { type: 'fecha' }, comida: { type: 'comida' }, estado: { type: 'texto' } },
    alcance: a => deUnDia(a.fecha),
    describe: a => `Marcar la ${a.comida} del ${fechaTexto(a.fecha)} como ${ESTADO_DICHO[a.estado] || a.estado}.`,
    run: (state, a) => {
      const existing = planFor(state, a.fecha, a.comida);
      if (existing) deletePlan(state, existing.id, true);
      return { id: setStatusPlan(state, a.fecha, a.comida, a.estado).id };
    }
  },
  repetir_semana: {
    kind: 'sensible', args: { fecha: { type: 'fecha' } },
    alcance: a => deUnMes(a.fecha.slice(0, 7)),
    describe: a => `Repetir la semana del ${fechaTexto(a.fecha)} en el resto del mes. Solo llena las comidas que estén vacías.`,
    run: (state, a) => repeatWeek(state, weekStart(a.fecha), a.fecha.slice(0, 7))
  },
  proponer_mes: {
    kind: 'sensible', args: { mes: { type: 'mes' } },
    alcance: a => deUnMes(a.mes),
    describe: a => `Proponer las comidas vacías de ${mesTexto(a.mes)} con tus preparaciones. No toca las que ya están decididas.`,
    run: (state, a) => generateMonth(state, a.mes)
  },

  /* Compras */
  calcular_lista: {
    kind: 'consulta', args: { desde: { type: 'fecha' }, hasta: { type: 'fecha' }, base: { type: 'base', required: false } },
    describe: a => `Calcular qué falta del ${fechaTexto(a.desde)} al ${fechaTexto(a.hasta)}, contando con ${basisLabel(a.base || 'casa')}.`,
    run: (state, a) => {
      const list = shoppingList(state, a.desde, a.hasta, a.base || 'casa');
      return {
        base: list.basis,
        lineas: list.lines.filter(line => line.shortfall > 0).map(line => ({
          nombre: product(state, line.productId)?.name,
          necesario: line.need, disponible: line.available,
          porComprar: line.purchaseQuantity, unidad: line.purchaseUnit,
          // Explicar por qué se pide esa cantidad es la mitad del valor: sin
          // eso el usuario solo puede creerse el número o desconfiar de él.
          porque: `Hacen falta ${fmt(line.need)} y hay ${fmt(line.available)}.`
        })),
        pendientes: list.pending.length
      };
    }
  },
  registrar_compra: {
    kind: 'sensible', args: { lineas: { type: 'lista' }, fecha: { type: 'fecha', required: false } },
    alcance: a => deUnDia(a.fecha || todayISO()),
    describe: (a, state) => `Registrar una compra de ${a.lineas.map(row => {
      const found = resolveEntity(state.products, row.producto ?? row.productId ?? row.nombre, 'un alimento');
      return `${fmt(row.cantidad ?? row.quantity)} ${row.unidad ?? row.unit ?? ''} de ${found.ok ? found.value.name : row.producto}`;
    }).join(', ')}. Esto aumentará tus existencias.`,
    run: (state, a) => {
      const lines = a.lineas.map(row => {
        const found = resolveEntity(state.products, row.producto ?? row.productId ?? row.nombre, 'un alimento');
        if (!found.ok) throw new Error(found.error);
        return { productId: found.value.id, quantity: row.cantidad ?? row.quantity, unit: row.unidad ?? row.unit ?? found.value.purchaseUnit };
      });
      return { id: addPurchase(state, { date: a.fecha, lines, basis: 'asistente' }).id };
    }
  },
  agregar_otro_producto: {
    kind: 'cambio', args: { nombre: { type: 'texto' }, cantidad: { type: 'texto', required: false } },
    describe: a => `Anotar «${a.nombre}» en la lista de otros productos.`,
    run: (state, a) => {
      state.seq += 1;
      const item = { id: `otro-${state.seq}`, name: a.nombre, quantity: a.cantidad || '', done: false };
      state.manualItems.push(item);
      return { id: item.id };
    }
  },

  /* Revisiones */
  abrir_revision: {
    kind: 'cambio', args: { fecha: { type: 'fecha', required: false } },
    describe: a => `Abrir una revisión de existencias con fecha ${a.fecha || todayISO()}.`,
    run: (state, a) => ({ id: createReview(state, a.fecha || todayISO(), 'restante').id })
  },
  registrar_restante: {
    kind: 'sensible', args: { producto: { type: 'producto' }, queda: { type: 'numero' }, revision: { type: 'texto', required: false } },
    alcance: () => deUnDia(todayISO()),
    describe: (a, state) => {
      const stock = inventoryNow(state)[a.producto.id] || 0;
      return `Anotar que quedan ${fmt(a.queda)} ${a.producto.controlUnit} de ${a.producto.name}. La app tiene contadas ${fmt(stock)}, así que registrará un consumo de ${fmt(Math.max(0, stock - a.queda))}. Esto baja tus existencias.`;
    },
    run: (state, a) => {
      const review = a.revision
        ? state.reviews.find(item => item.id === a.revision)
        : [...state.reviews].reverse().find(item => item.status === 'draft') || createReview(state, todayISO(), 'restante');
      if (!review) throw new Error('No encuentro esa revisión.');
      const inputs = Object.fromEntries(review.productIds.map(id => [id, review.remaining?.[id] ?? '']));
      inputs[a.producto.id] = a.queda;
      saveReview(state, review.id, inputs, false, 'restante');
      return { revision: review.id, consumido: review.consumed[a.producto.id] };
    }
  },
  confirmar_revision: {
    kind: 'sensible', args: { revision: { type: 'texto', required: false } },
    describe: () => 'Confirmar la revisión abierta. El consumo se descuenta de las existencias, una sola vez.',
    run: (state, a) => {
      const review = a.revision ? state.reviews.find(item => item.id === a.revision) : [...state.reviews].reverse().find(item => item.status === 'draft');
      if (!review) throw new Error('No hay ninguna revisión pendiente.');
      const inputs = Object.fromEntries(review.productIds.map(id => [id, review.mode === 'restante' ? review.remaining?.[id] ?? '' : review.consumed?.[id] ?? '']));
      saveReview(state, review.id, inputs, true);
      return { revision: review.id };
    }
  },
  corregir_existencias: {
    kind: 'sensible', args: { producto: { type: 'producto' }, cantidad: { type: 'numero' }, motivo: { type: 'texto', required: false } },
    alcance: () => deUnDia(todayISO()),
    describe: (a, state) => {
      const stock = inventoryNow(state)[a.producto.id] || 0;
      const delta = a.cantidad - stock;
      return `Corregir ${a.producto.name}: de ${fmt(stock)} a ${fmt(a.cantidad)} ${a.producto.controlUnit} (${delta >= 0 ? '+' : ''}${fmt(delta)}).`;
    },
    run: (state, a) => ({ id: correctStock(state, a.producto.id, a.cantidad, a.motivo).id })
  }
};

const ESTADO_DICHO = { outside: 'comer fuera de casa', order: 'pedir comida', unplanned: 'dejarla sin planificar' };
const archivarResumen = item => ({ id: item.id, nombre: item.name, archivado: item.archived });
const queHaceLaRutina = a => (a.tipo === 'preparacion' ? `«${a.preparacion.name}»` : a.tipo === 'pedido' ? 'pedir comida' : 'comer fuera de casa');
const comidasTexto = comidas => {
  if (comidas.length === SLOTS.length) return 'los cinco momentos del día';
  if (comidas.length === SLOTS_PRINCIPALES.length && SLOTS_PRINCIPALES.every(slot => comidas.includes(slot))) return 'las tres comidas';
  return comidas.map(slot => `${slot.startsWith('merienda') || slot === 'cena' ? 'la' : 'el'} ${etiquetaDeMomento(slot).toLocaleLowerCase('es')}`).join(' y ');
};

// Las dos únicas respuestas posibles a «¿este mes o siempre?», escritas como se
// dicen. Se ofrecen como botones: una pregunta de alcance no se contesta
// escribiendo, porque escribiendo se vuelve a poder decir algo ambiguo.
export const OPCIONES_DE_ALCANCE = [
  { id: 'mes', nombre: 'Solo este mes' },
  { id: 'siempre', nombre: 'Desde ahora, todos los meses' }
];

export const ACTION_NAMES = Object.keys(ACTIONS);
export const isQuery = name => ACTIONS[name]?.kind === 'consulta';

/* ── Validación ────────────────────────────────────────────────────────── */

export function validateAction(state, name, args = {}) {
  const spec = ACTIONS[name];
  // Lo primero y lo más importante: si no está en la tabla, no existe. Da igual
  // lo convincente que suene el nombre que haya inventado el modelo.
  if (!spec) return { ok: false, errors: [`«${name}» no es una acción que esta app sepa hacer.`] };
  const resolved = {}, errors = [], questions = [];
  for (const [key, rule] of Object.entries(spec.args)) {
    const raw = args[key];
    if (raw === undefined || raw === null || raw === '') {
      if (rule.required === false) continue;
      // Un argumento con pregunta propia no es un error: es una duda. Se
      // devuelve para que la pantalla la enseñe con sus botones, en vez de
      // plantarle a la persona un «falta alcance» que no significa nada.
      if (rule.pregunta) questions.push({ campo: key, pregunta: rule.pregunta, opciones: rule.type === 'alcanceRutina' ? OPCIONES_DE_ALCANCE : [] });
      else errors.push(`Falta «${key}».`);
      continue;
    }
    const check = TYPES[rule.type](raw, state);
    if (check.ok) { resolved[key] = check.value; continue; }
    if (check.ambiguous) questions.push({ campo: key, pregunta: check.error, opciones: check.ambiguous.map(item => ({ id: item.id, nombre: item[check.clave || 'name'] })) });
    else errors.push(check.error);
  }
  // Un argumento de más no es un error, pero tampoco se pasa: lo que no está en
  // el esquema no llega a la función.
  const extra = Object.keys(args).filter(key => !(key in spec.args));
  if (!errors.length && !questions.length) {
    const motivo = spec.revisa?.(resolved, state);
    if (motivo) errors.push(motivo);
  }
  if (errors.length || questions.length) return { ok: false, errors, questions, extra };
  return { ok: true, args: resolved, kind: spec.kind, alcance: alcanceSeguro(spec, resolved, state), extra };
}

// El alcance se calcula sobre argumentos ya resueltos, pero se llama al dibujar
// y al confirmar: si un mes raro hiciera reventar el cálculo, la pantalla se
// quedaría en blanco por un adorno. Sin alcance se sigue; sin confirmación, no.
function alcanceSeguro(spec, args, state) {
  if (!spec.alcance) return SIN_ALCANCE;
  try { return spec.alcance(args, state) || SIN_ALCANCE; }
  catch { return SIN_ALCANCE; }
}

export function describeAction(state, name, args) {
  const check = validateAction(state, name, args);
  if (!check.ok) return check.questions?.length ? check.questions[0].pregunta : check.errors.join(' ');
  return ACTIONS[name].describe(check.args, state);
}

// ¿Para una fecha, para el mes o para siempre? Se contesta antes de ejecutar,
// siempre, y es lo que la pantalla enseña junto a la vista previa.
export function scopeOf(state, name, args = {}) {
  const check = validateAction(state, name, args);
  return check.ok ? check.alcance : SIN_ALCANCE;
}

// Lo amplio se confirma: más de un día tocado, o cualquier cosa que valga desde
// ahora y para siempre. Lo demás se hace y se ofrece deshacer.
export function needsConfirmation(state, name, args = {}) {
  const check = validateAction(state, name, args);
  if (!check.ok) return false;
  const spec = ACTIONS[name];
  if (spec.kind === 'sensible') return true;
  if (spec.confirmaSi?.(check.args, state)) return true;
  return check.alcance.tipo === 'permanente' || check.alcance.fechas.length > 1;
}

/* ── Ejecución ─────────────────────────────────────────────────────────── */

const TOCAN_EXISTENCIAS = ['registrar_compra', 'registrar_restante', 'confirmar_revision', 'corregir_existencias'];

// Un grupo de acciones entra entero o no entra. Y si ya se ejecutó una petición
// con el mismo identificador, no se repite: mandar dos veces «registra que
// compré ocho plátanos» no puede dejar dieciséis.
export function runActions(state, requests, { requestId = null, confirmed = false } = {}) {
  const list = Array.isArray(requests) ? requests : [requests];
  if (requestId) {
    const previous = state.activity.find(entry => entry.requestId === requestId);
    if (previous) return { ok: true, repeated: true, results: previous.results, summary: previous.summary, alcance: previous.alcance || SIN_ALCANCE, undo: null };
  }

  const checks = list.map(request => ({ request, check: validateAction(state, request.action, request.arguments || {}) }));
  const bad = checks.filter(row => !row.check.ok);
  if (bad.length) {
    return {
      ok: false,
      errors: bad.flatMap(row => row.check.errors || []),
      questions: bad.flatMap(row => row.check.questions || []),
      summary: 'No pude hacerlo: ' + bad.flatMap(row => row.check.errors || row.check.questions.map(q => q.pregunta)).join(' ')
    };
  }

  // El alcance del grupo es el más amplio de los suyos: si una sola acción vale
  // para siempre, el grupo entero vale para siempre.
  const alcance = checks.reduce((mayor, row) => masAmplio(mayor, row.check.alcance), SIN_ALCANCE);
  const sensitive = checks.filter(row => row.check.kind === 'sensible');
  const aparte = checks.filter(row => ACTIONS[row.request.action].confirmaSi?.(row.check.args, state));
  // Varias acciones que tocan el inventario a la vez se confirman aunque cada
  // una por separado fuera menor: el riesgo está en el conjunto.
  const touchesStock = checks.filter(row => TOCAN_EXISTENCIAS.includes(row.request.action));
  const amplio = alcance.tipo === 'permanente' || alcance.fechas.length > 1;
  if (!confirmed && (sensitive.length || aparte.length || touchesStock.length > 1 || amplio)) {
    const preview = checks.map(row => ACTIONS[row.request.action].describe(row.check.args, state));
    return { ok: false, needsConfirmation: true, preview, alcance, summary: preview.join(' ') };
  }

  const before = snapshot(state);
  let results;
  try {
    results = transaction(state, () => checks.map(row => ({
      action: row.request.action,
      result: ACTIONS[row.request.action].run(state, row.check.args)
    })));
  } catch (error) {
    return { ok: false, errors: [error.message], alcance, summary: `No pude hacerlo: ${error.message}` };
  }

  // Una consulta no es un cambio: no se registra ni se puede deshacer.
  const changed = checks.some(row => row.check.kind !== 'consulta');
  const summary = checks.filter(row => row.check.kind !== 'consulta').map(row => ACTIONS[row.request.action].describe(row.check.args, before)).join(' ') || 'Consulta.';
  // Una pregunta devuelta por `run` —un duplicado detectado, o una comida sin
  // decidir— no es un cambio hecho: es una decisión que le toca al usuario.
  const pregunta = results.find(row => row.result?.pregunta);
  if (pregunta) {
    restore(state, before);
    return { ok: false, question: pregunta.result.pregunta, campo: pregunta.result.campo || null, options: pregunta.result.opciones, alcance, summary: pregunta.result.pregunta };
  }

  if (changed) {
    state.activity.push({ id: `act-${state.activity.length + 1}`, requestId, date: todayISO(), actions: list.map(item => item.action), summary, alcance, results });
    state.activity = state.activity.slice(-200);
  }
  // Deshacer es devolver el estado a como estaba. Solo se ofrece cuando hubo
  // cambio y ninguna acción del grupo es de las que no se pueden revertir bien.
  const reversible = changed && !checks.some(row => row.request.action === 'unir_productos');
  return { ok: true, results, summary, alcance, undo: reversible ? before : null };
}

export function undoTo(state, saved) {
  if (!saved) throw new Error('Esta acción no se puede deshacer.');
  restore(state, saved);
  return state;
}

// Las herramientas tal como se le describen a un modelo. Se generan de la misma
// tabla que valida, así que no pueden desincronizarse: si una acción no existe
// aquí, tampoco se puede ejecutar.
//
// La forma —nombre, descripcion, parametros— viene de cuando esto se le mandaba
// a un servicio externo. Esa opción se quitó: la app no habla con ningún
// servidor. La lista se conserva porque es lo que usa el intérprete para saber
// qué campos admite cada acción, y porque es la única descripción en castellano
// de lo que la asistente puede y no puede hacer. Que no se desincronice de la
// tabla de acciones lo comprueba una prueba, y hace falta: un desajuste aquí no
// rompe nada visiblemente, solo deja acciones inalcanzables.
const SOBRE = {
  "buscar_producto": "Busca un alimento en el catálogo de la casa y devuelve los parecidos.",
  "listar_productos": "Lista los alimentos del catálogo, opcionalmente de una categoría.",
  "consultar_existencias": "Dice cuánto queda de un alimento, o de todos.",
  "crear_producto": "Registra un alimento nuevo en el catálogo.",
  "editar_producto": "Cambia el nombre, la unidad de compra o la categoría de un alimento.",
  "archivar_producto": "Deja de ofrecer un alimento sin borrar su historial.",
  "reactivar_producto": "Vuelve a ofrecer un alimento archivado.",
  "unir_productos": "Une dos alimentos duplicados en uno solo. No se puede deshacer.",
  "configurar_equivalencia": "Dice cuántas unidades de control trae una unidad de compra.",
  "ver_canasta_habitual": "Devuelve mi canasta habitual: lo que la casa compra todos los meses.",
  "agregar_a_habitual": "Pone o corrige un alimento en mi canasta habitual, desde ahora y todos los meses. NO se usa para un mes suelto.",
  "quitar_de_habitual": "Quita un alimento de mi canasta habitual: deja de comprarse todos los meses.",
  "ver_canasta_del_mes": "Devuelve la canasta real de un mes, con los cambios de ese mes ya aplicados.",
  "ver_cambios_del_mes": "Dice en qué se aparta un mes de mi canasta habitual.",
  "cambiar_solo_este_mes": "Cambia o agrega un alimento SOLO en un mes, sin tocar mi canasta habitual.",
  "quitar_solo_este_mes": "Marca que un alimento no se compra en un mes, sin quitarlo de mi canasta habitual.",
  "volver_a_lo_habitual": "Deshace el cambio de un alimento en un mes y lo devuelve a lo habitual.",
  "pasar_a_habitual": "Convierte los cambios de un mes en costumbre: pasan a mi canasta habitual.",
  "ver_rutinas": "Lista las rutinas de comida que valen en un mes, con sus fechas.",
  "crear_rutina": "Crea una rutina de comida: una preparación, comer fuera o pedir, en unos días de la semana. Hay que decir si es solo de ese mes o desde ahora, todos los meses.",
  "eliminar_rutina": "Borra una rutina de comida. Las comidas que ya puso se quedan escritas.",
  "aplicar_rutinas": "Pasa las rutinas de un mes por el calendario, llenando solo las comidas vacías.",
  "copiar_rutina_de_mes": "Copia el patrón de comidas de un mes a otro, por día de la semana.",
  "abrir_mes": "Abre un mes y le pasa las rutinas de siempre.",
  "ver_avance_mes": "Dice cuántas comidas del mes están decididas y cuántas faltan.",
  "crear_persona": "Registra a una persona que come en la casa.",
  "agregar_restriccion": "Anota un alimento que una persona no puede comer.",
  "registrar_ausencia": "Marca que una persona no come en casa en una fecha y comida.",
  "cantidad_habitual": "Anota cuánto come normalmente una persona de un alimento.",
  "crear_preparacion": "Crea una comida habitual con sus alimentos principales.",
  "duplicar_preparacion": "Hace una copia de una preparación existente.",
  "eliminar_preparacion": "Borra una preparación del catálogo.",
  "ver_menu": "Dice qué hay planificado para una fecha.",
  "asignar_comida": "Pone una preparación en una fecha y comida del menú.",
  "cambiar_solo_esta_comida": "Cambia una sola comida de un solo día sin tocar la rutina que la puso.",
  "copiar_comida": "Copia una comida del menú a otra fecha.",
  "mover_comida": "Mueve una comida del menú a otra fecha.",
  "marcar_comida": "Marca una comida como fuera de casa, pedida o sin planificar.",
  "repetir_semana": "Copia una semana del menú al resto del mes.",
  "proponer_mes": "Rellena las comidas vacías de un mes con las preparaciones guardadas.",
  "calcular_lista": "Calcula qué falta comprar en un período y explica por qué.",
  "registrar_compra": "Registra una compra ya hecha. Aumenta las existencias.",
  "agregar_otro_producto": "Anota algo en la lista suelta de otros productos.",
  "abrir_revision": "Abre una revisión de existencias.",
  "registrar_restante": "Anota cuánto queda de un alimento; la app calcula lo consumido.",
  "confirmar_revision": "Confirma la revisión abierta y descuenta el consumo.",
  "corregir_existencias": "Ajusta las existencias de un alimento a la cantidad real."
};

const JSON_TIPO = {
  texto: () => ({ type: 'string' }),
  numero: () => ({ type: 'number', minimum: 0 }),
  fecha: () => ({ type: 'string', description: 'Fecha en formato AAAA-MM-DD' }),
  mes: () => ({ type: 'string', description: 'Mes en formato AAAA-MM' }),
  unidad: () => ({ type: 'string', enum: UNITS }),
  comida: () => ({ type: 'string', enum: SLOTS }),
  prioridad: () => ({ type: 'string', enum: PRIORITIES }),
  base: () => ({ type: 'string', enum: BASES }),
  lista: () => ({ type: 'array', items: { type: 'object' } }),
  booleano: () => ({ type: 'boolean' }),
  producto: () => ({ type: 'string', description: 'Nombre del alimento tal como lo dijo la persona' }),
  alimento: () => ({ type: 'string', description: 'Nombre del alimento tal como lo dijo la persona; si no existe todavía, se registra al confirmar' }),
  persona: () => ({ type: 'string', description: 'Nombre de la persona' }),
  preparacion: () => ({ type: 'string', description: 'Nombre de la preparación' }),
  rutina: () => ({ type: 'string', description: 'Nombre de la rutina' }),
  comidas: () => ({ type: 'array', items: { type: 'string', enum: SLOTS } }),
  dias: () => ({ type: 'array', items: { type: 'integer', minimum: 1, maximum: 7 }, description: 'Días de la semana: 1 lunes … 7 domingo' }),
  semanas: () => ({ type: 'array', items: { type: 'integer', minimum: 1, maximum: 5 }, description: 'Ordinal del día dentro del mes: [1,3] es «primer y tercer»' }),
  tipoRutina: () => ({ type: 'string', enum: ['preparacion', 'fuera', 'pedido'] }),
  alcanceRutina: () => ({ type: 'string', enum: ['mes', 'siempre'], description: '«mes» = solo ese mes; «siempre» = desde ahora, todos los meses' })
};

export function toolSchemas() {
  return ACTION_NAMES.map(name => {
    const spec = ACTIONS[name];
    const entradas = Object.entries(spec.args);
    return {
      nombre: name,
      descripcion: SOBRE[name] || name.replace(/_/g, ' '),
      parametros: {
        properties: Object.fromEntries(entradas.map(([clave, regla]) => [clave, JSON_TIPO[regla.type]()])),
        required: entradas.filter(([, regla]) => regla.required !== false).map(([clave]) => clave)
      }
    };
  });
}
