// El asistente no toca los datos. Pide acciones, y las acciones son estas.
//
// Un modelo de lenguaje se equivoca de tres formas que importan aquí: inventa
// identificadores que no existen, entiende «quita el atún» cuando le dijeron
// «quita el atún de este mes», y a veces repite la misma petición dos veces. Las
// tres se resuelven en el mismo sitio y de la misma manera:
//
//   1. Lista blanca. Si la acción no está en esta tabla, no existe. No hay
//      forma de pedir «ejecuta esto» ni de escribir en el almacenamiento.
//   2. Los identificadores no se creen. Un `producto` se resuelve contra el
//      catálogo real por nombre o alias; si hay dos candidatos, la acción no se
//      ejecuta: se devuelve una pregunta.
//   3. Todo pasa por las mismas funciones del modelo que usan los formularios,
//      dentro de una transacción. Si una acción de un grupo falla, no queda
//      nada a medias.
//
// Y una regla que no es técnica: lo que cambia el inventario o borra datos se
// confirma antes, en español, con las cantidades a la vista. Nunca enseñando
// el JSON.

import {
  PRIORITIES, SLOTS, UNITS, addPurchase, archiveProduct, addProduct, baseLines, basketLines,
  correctStock, createReview, duplicateRecipe, findSimilarProducts, generateMonth, inventoryNow,
  makeRecipePlan, mergeProducts, monthBasket, monthDiff, movePlan, copyPlan, openMonthBasket,
  planFor, product, productByName, promoteToBase, removeMonthBasketLine, repeatWeek, restoreProduct,
  saveReview, setAbsence, setBaseBasketLine, setEquivalence, setMonthBasketLine, setStatusPlan,
  shoppingList, snapshot, restore, todayISO, transaction, updateProduct, upsertPerson, upsertRecipe,
  validDate, validMonth, weekStart, deleteRecipe, deletePlan
} from './model.js';
import { normalizeName } from './nombres.js';

const fmt = value => new Intl.NumberFormat('es-DO', { maximumFractionDigits: 3 }).format(Number(value || 0));
const mesActual = () => todayISO().slice(0, 7);

/* ── Resolución de argumentos ──────────────────────────────────────────── */

// Nunca se confía en un identificador que venga de fuera. Si llega un id, tiene
// que existir de verdad; si llega un nombre, se busca. Un nombre que coincide
// con dos alimentos no se resuelve a ojo: se devuelve la duda.
function resolveEntity(list, value, etiqueta) {
  const raw = String(value ?? '').trim();
  if (!raw) return { ok: false, error: `Falta indicar ${etiqueta}.` };
  const byId = list.find(item => item.id === raw);
  if (byId) return { ok: true, value: byId };
  const key = normalizeName(raw);
  const exact = list.filter(item => normalizeName(item.name) === key || (item.aliases || []).some(alias => normalizeName(alias) === key));
  if (exact.length === 1) return { ok: true, value: exact[0] };
  if (exact.length > 1) return { ok: false, ambiguous: exact, error: `Hay varios ${etiqueta} que se llaman «${raw}».` };
  const partial = list.filter(item => normalizeName(item.name).includes(key) && key.length >= 3);
  if (partial.length === 1) return { ok: true, value: partial[0] };
  if (partial.length > 1) return { ok: false, ambiguous: partial, error: `¿Cuál de estos es «${raw}»?` };
  return { ok: false, error: `No encuentro ${etiqueta} que se llame «${raw}».` };
}

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
  comida: value => SLOTS.includes(value) ? { ok: true, value } : { ok: false, error: `«${value}» no es una comida. Usa: ${SLOTS.join(', ')}.` },
  prioridad: value => PRIORITIES.includes(value) ? { ok: true, value } : { ok: false, error: `«${value}» no es una prioridad válida.` },
  base: value => ['menu', 'base', 'mensual'].includes(value) ? { ok: true, value } : { ok: false, error: 'La base debe ser menu, base o mensual.' },
  lista: value => Array.isArray(value) ? { ok: true, value } : { ok: false, error: 'Se esperaba una lista.' },
  booleano: value => ({ ok: true, value: Boolean(value) }),
  producto: (value, state) => resolveEntity(state.products, value, 'un alimento'),
  persona: (value, state) => resolveEntity(state.people, value, 'una persona'),
  preparacion: (value, state) => resolveEntity(state.recipes, value, 'una preparación')
};

/* ── La tabla de acciones ──────────────────────────────────────────────── */
//
// `kind`:  'consulta'  → no cambia nada, no pide confirmación, no necesita deshacer
//          'cambio'    → reversible; se ejecuta y se ofrece deshacer
//          'sensible'  → toca el inventario, borra o reescribe algo; confirma antes
//
// `describe` es lo que ve el usuario antes de confirmar. En español, con las
// cantidades y los nombres reales, nunca el JSON.

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

  /* Canastas */
  ver_canasta_base: {
    kind: 'consulta', args: {},
    describe: () => 'Ver la canasta base.',
    run: state => baseLines(state).map(line => ({ nombre: product(state, line.productId)?.name, cantidad: line.quantity, unidad: line.unit, prioridad: line.priority }))
  },
  ver_canasta_mes: {
    kind: 'consulta', args: { mes: { type: 'mes', required: false } },
    describe: a => `Ver la canasta de ${a.mes || mesActual()}.`,
    run: (state, a) => basketLines(state, a.mes || mesActual()).map(line => ({ nombre: product(state, line.productId)?.name, cantidad: line.quantity, unidad: line.unit }))
  },
  comparar_mes_con_base: {
    kind: 'consulta', args: { mes: { type: 'mes' } },
    describe: a => `Ver en qué se aparta ${a.mes} de la canasta base.`,
    run: (state, a) => {
      const diff = monthDiff(state, a.mes);
      const nombre = line => product(state, line.productId)?.name;
      return {
        abierto: diff.open,
        agregados: diff.added.map(nombre), quitados: diff.removed.map(nombre),
        cambiados: diff.changed.map(row => ({ nombre: nombre(row.line), mes: row.line.quantity, base: row.base.quantity, unidad: row.line.unit }))
      };
    }
  },
  agregar_a_base: {
    kind: 'cambio', args: { producto: { type: 'producto' }, cantidad: { type: 'numero' }, unidad: { type: 'unidad' }, prioridad: { type: 'prioridad', required: false } },
    describe: a => `Poner ${fmt(a.cantidad)} ${a.unidad} de ${a.producto.name} al mes en la canasta base. Afecta a los meses que abras a partir de ahora.`,
    run: (state, a) => setBaseBasketLine(state, a.producto.id, a.cantidad, a.unidad, a.prioridad)
  },
  quitar_de_base: {
    kind: 'sensible', args: { producto: { type: 'producto' } },
    describe: a => `Quitar ${a.producto.name} de la canasta base. Deja de ser parte del hábito de la casa.`,
    run: (state, a) => { setBaseBasketLine(state, a.producto.id, ''); return { ok: true }; }
  },
  abrir_mes: {
    kind: 'cambio', args: { mes: { type: 'mes' } },
    describe: a => `Crear la canasta de ${a.mes} copiando la canasta base.`,
    run: (state, a) => ({ mes: a.mes, lineas: openMonthBasket(state, a.mes).lines.length })
  },
  agregar_a_mes: {
    kind: 'cambio', args: { mes: { type: 'mes', required: false }, producto: { type: 'producto' }, cantidad: { type: 'numero' }, unidad: { type: 'unidad' } },
    describe: a => `Poner ${fmt(a.cantidad)} ${a.unidad} de ${a.producto.name} solo en la canasta de ${a.mes || mesActual()}. No cambia la canasta base.`,
    run: (state, a) => setMonthBasketLine(state, a.mes || mesActual(), a.producto.id, a.cantidad, a.unidad)
  },
  quitar_de_mes: {
    kind: 'cambio', args: { mes: { type: 'mes', required: false }, producto: { type: 'producto' } },
    describe: a => `Quitar ${a.producto.name} de la canasta de ${a.mes || mesActual()}. Sigue estando en la canasta base y en los demás meses.`,
    run: (state, a) => ({ quitado: removeMonthBasketLine(state, a.mes || mesActual(), a.producto.id) })
  },
  aplicar_mes_a_base: {
    kind: 'sensible', args: { mes: { type: 'mes' }, productos: { type: 'lista' } },
    describe: (a, state) => `Pasar a la canasta base ${a.productos.length} cambio(s) de ${a.mes}: ${a.productos.map(id => product(state, id)?.name || id).join(', ')}. Afectará a todos los meses que abras después.`,
    run: (state, a) => ({ aplicados: promoteToBase(state, a.mes, a.productos) })
  },

  /* Personas */
  crear_persona: {
    kind: 'cambio', args: { nombre: { type: 'texto' }, tipo: { type: 'texto', required: false } },
    describe: a => `Registrar a ${a.nombre} como parte de la casa.`,
    run: (state, a) => ({ id: upsertPerson(state, { name: a.nombre, kind: a.tipo, restrictions: [], habitual: [] }).id })
  },
  agregar_restriccion: {
    kind: 'cambio', args: { persona: { type: 'persona' }, alimento: { type: 'texto' } },
    describe: a => `${a.persona.name} no puede comer ${a.alimento}.`,
    // Si el alimento todavía no existe se guarda por nombre y se enlaza cuando
    // aparezca. Obligar a crear el producto antes es el orden invertido que
    // hace que nadie termine de registrar a su familia.
    run: (state, a) => {
      const match = productByName(state, a.alimento);
      const person = state.people.find(item => item.id === a.persona.id);
      if (match) { if (!person.restrictions.includes(match.id)) person.restrictions.push(match.id); return { enlazado: true, nombre: match.name }; }
      person.pendingRestrictions = [...new Set([...(person.pendingRestrictions || []), a.alimento])];
      return { enlazado: false, nombre: a.alimento };
    }
  },
  registrar_ausencia: {
    kind: 'cambio', args: { persona: { type: 'persona' }, fecha: { type: 'fecha' }, comida: { type: 'comida' }, ausente: { type: 'booleano', required: false } },
    describe: a => `${a.persona.name} ${a.ausente === false ? 'vuelve a comer' : 'no come'} en casa el ${a.fecha} en la ${a.comida}.`,
    run: (state, a) => { setAbsence(state, a.fecha, a.comida, a.persona.id, a.ausente !== false); return { ok: true }; }
  },
  cantidad_habitual: {
    kind: 'cambio', args: { persona: { type: 'persona' }, producto: { type: 'producto' }, cantidad: { type: 'numero' }, unidad: { type: 'unidad' } },
    describe: a => `${a.persona.name} come normalmente ${fmt(a.cantidad)} ${a.unidad} de ${a.producto.name}.`,
    run: (state, a) => {
      const person = state.people.find(item => item.id === a.persona.id);
      const habitual = (person.habitual || []).filter(row => row.productId !== a.producto.id);
      habitual.push({ productId: a.producto.id, quantity: a.cantidad, unit: a.unidad });
      return upsertPerson(state, { id: person.id, name: person.name, restrictions: person.restrictions, pendingRestrictions: person.pendingRestrictions, habitual });
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
      return { id: upsertRecipe(state, { name: a.nombre, uses: a.comidas, items, covers: [] }).id };
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
    describe: a => `Ver lo que hay planificado para el ${a.fecha || 'día de hoy'}.`,
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
    describe: a => `Poner «${a.preparacion.name}» en la ${a.comida} del ${a.fecha}.`,
    run: (state, a) => ({ id: makeRecipePlan(state, a.preparacion.id, a.fecha, a.comida).id })
  },
  copiar_comida: {
    kind: 'cambio', args: { desde: { type: 'fecha' }, comidaDesde: { type: 'comida' }, hasta: { type: 'fecha' }, comidaHasta: { type: 'comida', required: false } },
    describe: a => `Copiar la ${a.comidaDesde} del ${a.desde} al ${a.hasta}.`,
    run: (state, a) => {
      const plan = planFor(state, a.desde, a.comidaDesde);
      if (!plan) throw new Error(`No hay nada planificado en la ${a.comidaDesde} del ${a.desde}.`);
      return { id: copyPlan(state, plan.id, a.hasta, a.comidaHasta || a.comidaDesde).id };
    }
  },
  mover_comida: {
    kind: 'cambio', args: { desde: { type: 'fecha' }, comidaDesde: { type: 'comida' }, hasta: { type: 'fecha' }, comidaHasta: { type: 'comida', required: false } },
    describe: a => `Mover la ${a.comidaDesde} del ${a.desde} al ${a.hasta}.`,
    run: (state, a) => {
      const plan = planFor(state, a.desde, a.comidaDesde);
      if (!plan) throw new Error(`No hay nada planificado en la ${a.comidaDesde} del ${a.desde}.`);
      movePlan(state, plan.id, a.hasta, a.comidaHasta || a.comidaDesde);
      return { ok: true };
    }
  },
  marcar_comida: {
    kind: 'cambio', args: { fecha: { type: 'fecha' }, comida: { type: 'comida' }, estado: { type: 'texto' } },
    describe: a => `Marcar la ${a.comida} del ${a.fecha} como ${({ outside: 'fuera de casa', order: 'pedir comida', unplanned: 'sin planificar' })[a.estado] || a.estado}.`,
    run: (state, a) => {
      const existing = planFor(state, a.fecha, a.comida);
      if (existing) deletePlan(state, existing.id, true);
      return { id: setStatusPlan(state, a.fecha, a.comida, a.estado).id };
    }
  },
  repetir_semana: {
    kind: 'sensible', args: { fecha: { type: 'fecha' } },
    describe: a => `Repetir la semana del ${a.fecha} en el resto del mes. Solo llena las comidas que estén vacías.`,
    run: (state, a) => repeatWeek(state, weekStart(a.fecha), a.fecha.slice(0, 7))
  },
  proponer_mes: {
    kind: 'sensible', args: { mes: { type: 'mes' } },
    describe: a => `Proponer las comidas vacías de ${a.mes} con tus preparaciones. No toca las que ya están decididas.`,
    run: (state, a) => generateMonth(state, a.mes)
  },

  /* Compras */
  calcular_lista: {
    kind: 'consulta', args: { desde: { type: 'fecha' }, hasta: { type: 'fecha' }, base: { type: 'base', required: false } },
    describe: a => `Calcular qué falta del ${a.desde} al ${a.hasta}.`,
    run: (state, a) => {
      const list = shoppingList(state, a.desde, a.hasta, a.base || 'mensual');
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
    describe: (a, state) => {
      const stock = inventoryNow(state)[a.producto.id] || 0;
      const delta = a.cantidad - stock;
      return `Corregir ${a.producto.name}: de ${fmt(stock)} a ${fmt(a.cantidad)} ${a.producto.controlUnit} (${delta >= 0 ? '+' : ''}${fmt(delta)}).`;
    },
    run: (state, a) => ({ id: correctStock(state, a.producto.id, a.cantidad, a.motivo).id })
  }
};

const archivarResumen = item => ({ id: item.id, nombre: item.name, archivado: item.archived });

export const ACTION_NAMES = Object.keys(ACTIONS);
export const isQuery = name => ACTIONS[name]?.kind === 'consulta';
export const needsConfirmation = name => ACTIONS[name]?.kind === 'sensible';

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
      errors.push(`Falta «${key}».`);
      continue;
    }
    const check = TYPES[rule.type](raw, state);
    if (check.ok) { resolved[key] = check.value; continue; }
    if (check.ambiguous) questions.push({ campo: key, pregunta: check.error, opciones: check.ambiguous.map(item => ({ id: item.id, nombre: item.name })) });
    else errors.push(check.error);
  }
  // Un argumento de más no es un error, pero tampoco se pasa: lo que no está en
  // el esquema no llega a la función.
  const extra = Object.keys(args).filter(key => !(key in spec.args));
  if (errors.length || questions.length) return { ok: false, errors, questions, extra };
  return { ok: true, args: resolved, kind: spec.kind, extra };
}

export function describeAction(state, name, args) {
  const check = validateAction(state, name, args);
  if (!check.ok) return check.questions?.length ? check.questions[0].pregunta : check.errors.join(' ');
  return ACTIONS[name].describe(check.args, state);
}

/* ── Ejecución ─────────────────────────────────────────────────────────── */

// Un grupo de acciones entra entero o no entra. Y si ya se ejecutó una petición
// con el mismo identificador, no se repite: mandar dos veces «registra que
// compré ocho plátanos» no puede dejar dieciséis.
export function runActions(state, requests, { requestId = null, confirmed = false } = {}) {
  const list = Array.isArray(requests) ? requests : [requests];
  if (requestId) {
    const previous = state.activity.find(entry => entry.requestId === requestId);
    if (previous) return { ok: true, repeated: true, results: previous.results, summary: previous.summary, undo: null };
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

  const sensitive = checks.filter(row => row.check.kind === 'sensible');
  // Varias acciones que tocan el inventario a la vez se confirman aunque cada
  // una por separado fuera menor: el riesgo está en el conjunto.
  const touchesStock = checks.filter(row => ['registrar_compra', 'registrar_restante', 'confirmar_revision', 'corregir_existencias'].includes(row.request.action));
  if (!confirmed && (sensitive.length || touchesStock.length > 1)) {
    return {
      ok: false, needsConfirmation: true,
      preview: checks.map(row => ACTIONS[row.request.action].describe(row.check.args, state)),
      summary: checks.map(row => ACTIONS[row.request.action].describe(row.check.args, state)).join(' ')
    };
  }

  const before = snapshot(state);
  let results;
  try {
    results = transaction(state, () => checks.map(row => ({
      action: row.request.action,
      result: ACTIONS[row.request.action].run(state, row.check.args)
    })));
  } catch (error) {
    return { ok: false, errors: [error.message], summary: `No pude hacerlo: ${error.message}` };
  }

  // Una consulta no es un cambio: no se registra ni se puede deshacer.
  const changed = checks.some(row => row.check.kind !== 'consulta');
  const summary = checks.filter(row => row.check.kind !== 'consulta').map(row => ACTIONS[row.request.action].describe(row.check.args, before)).join(' ') || 'Consulta.';
  // Una pregunta devuelta por `run` —un duplicado detectado, por ejemplo— no es
  // un cambio hecho: es una decisión que le toca al usuario.
  const pregunta = results.find(row => row.result?.pregunta);
  if (pregunta) { restore(state, before); return { ok: false, question: pregunta.result.pregunta, options: pregunta.result.opciones, summary: pregunta.result.pregunta }; }

  if (changed) {
    state.activity.push({ id: `act-${state.activity.length + 1}`, requestId, date: todayISO(), actions: list.map(item => item.action), summary, results });
    state.activity = state.activity.slice(-200);
  }
  // Deshacer es devolver el estado a como estaba. Solo se ofrece cuando hubo
  // cambio y ninguna acción del grupo es de las que no se pueden revertir bien.
  const reversible = changed && !checks.some(row => row.request.action === 'unir_productos');
  return { ok: true, results, summary, undo: reversible ? before : null };
}

export function undoTo(state, saved) {
  if (!saved) throw new Error('Esta acción no se puede deshacer.');
  restore(state, saved);
  return state;
}

// Las herramientas tal como se le describen a un modelo. Se genera de la misma
// tabla que valida, así que no pueden desincronizarse: si una acción no existe
// aquí, tampoco se puede ejecutar.
export function toolSchemas() {
  return ACTION_NAMES.map(name => ({
    name,
    kind: ACTIONS[name].kind,
    arguments: Object.fromEntries(Object.entries(ACTIONS[name].args).map(([key, rule]) => [key, { type: rule.type, required: rule.required !== false }]))
  }));
}
