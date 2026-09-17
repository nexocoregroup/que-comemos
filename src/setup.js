// «Organizar mi casa»: cinco pasos, de principio a fin.
//
// Quién come en esta casa, qué se compra de costumbre, cada cuánto se compra,
// qué se cocina, y una vista de cómo quedó todo. Un camino y se recorre entero.
//
// Eran siete y son cinco. Los dos que se fueron —«¿cuánto se compra al mes?» y
// «cómo se reparte entre las dos quincenas»— pedían un número que la casa no
// tiene por qué saber, y lo pedían en el peor momento: quien marcaba ciento
// cincuenta alimentos se encontraba después con ciento cincuenta casillas de
// cantidad, una detrás de otra, antes de poder terminar. Ahí se abandona.
//
// Cuatro reglas gobiernan el archivo:
//
// 1. Aquí no se pide ni una cantidad. Ninguna pantalla de este recorrido tiene
//    dónde escribir cuánto se compra de algo, y hay una prueba que lo vigila
//    paso por paso. Cuánto llevar se decide en la lista de cada compra, que es
//    cuando de verdad se sabe.
// 2. Una cosa se escribe una vez. Marcar «Arroz» lo registra en el catálogo y
//    lo pone en los productos habituales. No se vuelve a pedir en otro sitio.
// 3. Volver a pasar por aquí no borra nada. Lo que ya estaba guardado se
//    precarga a la vista, lo que esta pantalla no pregunta no lo toca —una
//    preparación editada desde aquí conserva sus alimentos y sus porciones—, y
//    los cambios de cada mes ni se rozan: este archivo no llama a nada que
//    escriba en `monthOverrides`.
// 4. Se puede parar y retomar en cualquier punto. Cada toque escribe el avance,
//    y salir guarda lo marcado de verdad, no solo el borrador.

import { RUBROS, SEED_PRODUCTS, categoriaDelRubro, rubroDeCategoria, rubroPorIndice, seedByRubro } from './catalog-seed.js';
import {
  FRECUENCIAS, MOMENTOS, UNITS, addProduct, deleteRecipe, etiquetaDeMomento, frecuenciaDe, habitualLines,
  historialDeFrecuencia, personasActivas, ponerFrecuencia, product, productByName,
  setHabitualBasket, todayISO, upsertRecipe
} from './model.js';
// La ficha de una persona se dibuja en un solo sitio, y ese sitio es `hogar.js`.
// Aquí solo se enseña el resumen de lo que ya está guardado y se abre esa misma
// ventana: dos formularios de persona serían dos sitios donde olvidarse de
// preguntar si un alimento es alergia o manía.
import { claseDe, resumenDeRestricciones } from './hogar.js';
import { normalizeName } from './text-parse.js';
import { button, esc, monthName, notice, options } from './ui-kit.js';
import { icono, iconoDeCategoria } from './icons.js';

// Los pasos se llaman por su nombre y no por su número. Los números cambian
// cada vez que se añade uno en medio, y un `setup.paso === 4` repartido por el
// archivo es la forma más rápida de que al insertar un paso se rompa otro sin
// que salte ninguna prueba.
export const PASO = {
  personas: 1, alimentos: 2, compra: 3, preparaciones: 4, casa: 5
};

export const PASOS = [
  { id: PASO.personas, titulo: 'Mi hogar', corto: 'Hogar' },
  { id: PASO.alimentos, titulo: 'Productos habituales', corto: 'Productos' },
  { id: PASO.compra, titulo: 'Cómo compramos', corto: 'Compra' },
  { id: PASO.preparaciones, titulo: 'Comidas habituales', corto: 'Comidas' },
  { id: PASO.casa, titulo: 'Ver mi casa', corto: 'Mi casa' }
];

/* ── Dos pasos que se fueron ───────────────────────────────────────────────

   Eran siete y son cinco. Los que faltan son «¿cuánto se compra al mes?» y
   «cómo se reparte entre las dos quincenas», y los dos se fueron por la misma
   razón: pedían un número que la casa no tiene por qué saber.

   Quien marcaba ciento cincuenta alimentos se encontraba después con ciento
   cincuenta casillas de cantidad, una detrás de otra, antes de poder terminar.
   Ahí es exactamente donde se abandona. Y el número no hacía falta para lo que
   la app tiene que hacer: una lista de compra se escribe a mano cada vez, y lo
   único que se necesita recordar es qué compra esta casa, no cuánto.

   El reparto entre quincenas se retiró después, y por la misma razón: partía
   en dos trozos una cantidad del mes que ya no se usa para nada.

   Los cinco pasos se enseñan siempre. Ya no hay ninguno condicional, así que la
   cuenta de «paso 3 de 5» no depende de lo que se haya contestado antes. */
export const pasosDe = () => PASOS;

// La numeración cambió al quitar esos dos, y hay gente con el avance guardado a
// medias en la numeración vieja. Sin esta tabla, quien lo dejó en el paso 5 de
// entonces volvería al paso 5 de ahora, que es el último, y se encontraría el
// resumen de una casa que todavía no ha terminado de registrar.
const ESQUEMA_DE_PASOS = 2;
const PASO_DE_ANTES = { 0: 0, 1: PASO.personas, 2: PASO.alimentos, 3: PASO.compra, 4: PASO.preparaciones, 5: PASO.preparaciones, 6: PASO.preparaciones, 7: PASO.casa };
const posicionDe = (setup, paso) => pasosDe(setup).findIndex(item => item.id === paso);
const saltarA = (setup, desde, direccion) => {
  const visibles = pasosDe(setup);
  const indice = visibles.findIndex(item => item.id === desde);
  const destino = visibles[Math.min(visibles.length - 1, Math.max(0, indice + direccion))];
  return destino ? destino.id : desde;
};

// El paso 0 no es un paso: es la pantalla que promete una sola cosa antes de
// pedir nada. Por eso no cuenta en la barra ni lleva número.
export const emptySetup = () => ({
  paso: 0,
  esquema: ESQUEMA_DE_PASOS,
  precargado: false,
  rubro: 0,            // cuál de los ocho rubros se está preguntando (0…7)
  elegidos: [],        // todos los nombres marcados, del catálogo o escritos
  propios: [],         // [{ nombre, unidad, categoria, origen }] los que no estaban
  cantidades: {},      // nombre → { cantidad, unidad, yaGuardada }
  busqueda: '',
  anadiendo: false,    // ¿está abierta la ventanita de «añadir un alimento»?
  nombreNuevo: '',
  errorNuevo: '',
  frecuencia: null,   // 'mensual' | 'quincenal', se pregunta en el paso de la compra
  personas: null,     // cuántas comen en casa; null es «todavía no lo ha dicho»
  // La preparación que se está escribiendo en el paso 4. No se guarda entre
  // sesiones —un nombre a medio teclear no hace falta mañana—; las que se
  // guardan de verdad están en `state.recipes` desde que se pulsa Guardar.
  preparacion: null,
  guardados: 0
});

const fichaVacia = () => ({ id: '', nombre: '', momentos: [], nota: '', error: '' });

/* ── El avance se guarda solo ──────────────────────────────────────────────

   Registrar la canasta de una casa son ocho pantallas, y nadie las hace de una
   sentada sin que le hablen, le llamen o se le acabe la batería. Hasta ahora lo
   marcado vivía solo en memoria: cerrar la app antes de llegar a las cantidades
   tiraba el trabajo entero sin decir nada.

   Ahora cada toque escribe en `state.settings.canasta`, que es estado de la
   casa y por tanto se guarda en el cajón de esta cuenta y viaja con ella. Se
   guardan los campos que costó rellenar y ninguno más: lo que está a medio
   buscar o la ventanita abierta no hacen falta mañana. */

const CAMPOS_GUARDADOS = ['paso', 'esquema', 'precargado', 'rubro', 'elegidos', 'propios', 'cantidades', 'texto', 'frecuencia', 'personas', 'guardados'];

export function guardarAvance(ctx) {
  const setup = ctx.ui.setup;
  if (!setup) return null;
  if (!ctx.state.settings || typeof ctx.state.settings !== 'object') ctx.state.settings = {};
  ctx.state.settings.canasta = Object.fromEntries(CAMPOS_GUARDADOS.map(campo => [campo, structuredClone(setup[campo])]));
  // Guardar sin repintar: marcar ochenta casillas repintando ochenta veces es
  // exactamente lo que le quitaba el sitio al pulgar.
  if (typeof ctx.guardar === 'function') ctx.guardar();
  return ctx.state.settings.canasta;
}

export function avanceGuardado(state) {
  const guardado = state?.settings?.canasta;
  if (!guardado || typeof guardado !== 'object' || Array.isArray(guardado)) return null;
  const setup = { ...emptySetup(), ...guardado };
  // Un respaldo traído a mano puede venir con cualquier cosa escrita aquí. Se
  // recorta a lo que las pantallas saben pintar, en vez de confiar.
  // El 0 es la portada y no está en `PASOS`. De ahí en adelante, un número que
  // no corresponda a ningún paso —porque se quitó alguno entre una versión y
  // otra— cae al último que sí existe y no a una pantalla en blanco.
  const guardadoEnPaso = Math.max(0, Number(setup.paso) || 0);
  // Lo guardado con la numeración de antes se traduce; lo guardado con la de
  // ahora se respeta. Sin el sello de esquema no habría forma de distinguirlas:
  // un 5 significaba «reparto» y ahora significa «ver mi casa», que son los dos
  // extremos del recorrido.
  //
  // El sello se lee de lo guardado y no de `setup`, que es lo guardado encima de
  // los valores de fábrica: `emptySetup()` ya trae el sello nuevo, así que
  // preguntárselo a la mezcla decía siempre que sí y no traducía nunca.
  const traducido = Number(guardado.esquema) === ESQUEMA_DE_PASOS
    ? guardadoEnPaso
    : PASO_DE_ANTES[guardadoEnPaso] ?? PASO.casa;
  setup.esquema = ESQUEMA_DE_PASOS;
  setup.paso = traducido === 0 || PASOS.some(paso => paso.id === traducido)
    ? traducido
    : Math.min(traducido, PASOS[PASOS.length - 1].id);
  setup.rubro = Math.min(RUBROS.length - 1, Math.max(0, Number(setup.rubro) || 0));
  setup.elegidos = (Array.isArray(setup.elegidos) ? setup.elegidos : []).map(String);
  setup.propios = (Array.isArray(setup.propios) ? setup.propios : []).filter(item => item && item.nombre);
  setup.cantidades = setup.cantidades && typeof setup.cantidades === 'object' ? setup.cantidades : {};
  setup.anadiendo = false;
  setup.frecuencia = FRECUENCIAS.includes(setup.frecuencia) ? setup.frecuencia : null;
  setup.personas = Number(setup.personas) > 0 ? Math.min(20, Math.round(Number(setup.personas))) : null;
  return setup;
}

export function olvidarAvance(state) {
  if (state?.settings) delete state.settings.canasta;
}

const ETIQUETA_UNIDAD = { unidad: 'unidades', lb: 'libras', taza: 'tazas', lata: 'latas', paquete: 'paquetes', rueda: 'ruedas', rebanada: 'rebanadas' };
const unidades = elegida => options(UNITS.map(unidad => [unidad, ETIQUETA_UNIDAD[unidad] || unidad]), elegida);
const unidadValida = unidad => (UNITS.includes(unidad) ? unidad : null);

// El catálogo indexado por nombre normalizado: es la comparación que usa el
// modelo, así que «TORTILLAS DE MAIZ» y «tortilla de maíz» caen en la misma
// casilla y no se crea el mismo alimento dos veces.
const POR_CLAVE = new Map();
for (const semilla of SEED_PRODUCTS) {
  POR_CLAVE.set(normalizeName(semilla.name), semilla);
  for (const alias of semilla.aliases) if (!POR_CLAVE.has(normalizeName(alias))) POR_CLAVE.set(normalizeName(alias), semilla);
}
const semillaPorNombre = nombre => POR_CLAVE.get(normalizeName(nombre)) || null;

/* ── Pantalla inicial ──────────────────────────────────────────────────── */

// Una promesa, un botón. La opción de ver un ejemplo va plegada debajo para que
// se pueda mirar sin salir de aquí y sin competir con lo que hay que pulsar.
// El número de pasos se cuenta, no se escribe a mano.
//
// Decía «Ocho pasos cortos» y era verdad cuando se escribió: entonces había
// ocho, y uno de ellos era un paso propio para meter los alimentos de corrido.
// Ese paso se quitó después —escribirlos de corrido es ahora un enlace dentro
// del paso de los alimentos, que es donde hace falta— y el texto se quedó como
// estaba, y además había un paso que solo se le enseñaba a quien compraba por
// quincenas: a quien compra una vez al mes se le prometían ocho pasos y veía
// seis.
//
// Escrito a mano vuelve a pasar la próxima vez que se toque un paso. Contado,
// no. Hay una prueba que lo vigila.
const EN_LETRA = ['cero', 'Un', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve'];

function pantallaInicio(setup) {
  const llevaEmpezado = Boolean(setup?.elegidos?.length);
  const cuantos = pasosDe(setup).length;
  return `<section class="setup setup-inicio">
    <p class="eyebrow">Organizar mi casa</p>
    <p class="setup-camino">${EN_LETRA[cuantos] || cuantos} pasos cortos: quiénes comen aquí, lo que compras normalmente, cada cuánto compras, las comidas de costumbre, y una vista de cómo quedó tu casa.</p>
    <h2 class="setup-promesa">Vamos a registrar lo que tu casa come y compra de costumbre. <strong>No hace falta indicar cantidades de nada.</strong></h2>
    <div class="pantalla-acciones">${button(llevaEmpezado ? 'Seguir donde lo dejé' : 'Empezar', 'setup-empezar', 'btn-primary btn-grande')}</div>
    ${llevaEmpezado ? `<p class="small muted">Llevas ${setup.elegidos.length} producto(s) marcados.</p>` : ''}
    <details class="plegable setup-ejemplo">
      <summary>¿Qué son los productos habituales?</summary>
      <p class="muted">Lo que esta casa siempre compra: arroz, huevos, salami, plátanos, detergente. Se marca una vez y sirve de recordatorio cada vez que hay que escribir la lista del supermercado, para no tener que acordarse de todo desde cero.</p>
      <p class="muted">No es un inventario y no lleva cuentas: <strong>cuánto llevar lo decides en la lista de cada compra</strong>, que es cuando de verdad se sabe.</p>
    </details>
    <p class="tiny muted setup-nota">Se puede salir en cualquier momento. Lo que marques se guarda solo.</p>
  </section>`;
}

/* ── Paso 1: la canasta base, rubro por rubro ──────────────────────────────

   Antes esto era una sola pantalla con una tira de catorce categorías que había
   que arrastrar de lado. Esa tira tenía tres problemas a la vez: no se ve
   cuántas quedan, la lista salta bajo el dedo al cambiar de pestaña, y en un
   teléfono las últimas categorías están escondidas fuera de la pantalla, así
   que sencillamente no se visitan.

   Ahora son ocho pantallas seguidas, cada una en el mismo sitio, y se avanza
   con Continuar. La posición no cambia nunca: lo único que cambia es la lista
   de en medio. */

function pantallaDeRubro(setup) {
  const rubro = rubroPorIndice(setup.rubro);
  const elegidos = new Set(setup.elegidos.map(normalizeName));
  const marcado = nombre => elegidos.has(normalizeName(nombre));
  const busqueda = normalizeName(setup.busqueda || '');
  const delRubro = seedByRubro(rubro.id);
  const lista = busqueda
    ? delRubro.filter(item => normalizeName(item.name).includes(busqueda) || item.aliases.some(alias => normalizeName(alias).includes(busqueda)))
    : delRubro;
  // Los que escribió la propia casa van al final, justo encima del botón de
  // añadir: es donde estaba el dedo cuando los escribió, y así el que acaba de
  // añadirse se ve sin tener que buscarlo.
  const tuyos = setup.propios.filter(item => item.categoria === categoriaDelRubro(rubro.id));
  const enEsteRubro = [...delRubro.map(item => item.name), ...tuyos.map(item => item.nombre)].filter(marcado).length;
  const primero = setup.rubro === 0;
  const ultimo = setup.rubro >= RUBROS.length - 1;

  return `<p class="setup-rubro" role="status" aria-live="polite">
      <span class="setup-rubro-emoji">${iconoDeCategoria(rubro.id, { tamano: 22 })}</span>
      Categoría ${setup.rubro + 1} de ${RUBROS.length} — <strong>${esc(rubro.titulo)}</strong>
    </p>
    <div class="progress setup-rubro-progreso"><span style="width:${Math.round((setup.rubro + 1) / RUBROS.length * 100)}%"></span></div>

    <p class="pantalla-intro">Selecciona lo que normalmente compras para tu casa. <strong>No tienes que indicar cantidades.</strong> Marca los que quieras: si esta categoría no la compras, pasa de largo.</p>

    ${delRubro.length > 12 ? `<div class="setup-buscador">
      <label class="field setup-search"><span class="sr-only">Buscar dentro de ${esc(rubro.titulo)}</span>
        <input type="search" id="setup-buscar" value="${esc(setup.busqueda)}" placeholder="Buscar en ${esc(rubro.titulo.toLocaleLowerCase('es'))}…" autocomplete="off" aria-label="Buscar dentro de ${esc(rubro.titulo)}">
      </label>
      ${setup.busqueda ? button('Ver todo', 'setup-limpiar-busqueda', 'btn-quiet') : ''}
    </div>` : ''}

    <div class="setup-lista">${lista.map(item => fichaAlimento(item.name, item.controlUnit, marcado(item.name))).join('')
      || `<p class="muted">Nada de este rubro coincide con «${esc(setup.busqueda)}». Puedes añadirlo aquí abajo.</p>`}</div>

    ${tuyos.length ? `<p class="setup-tuyos-titulo">Añadidos por ti</p>
      <div class="setup-lista setup-tuyos">${tuyos.map(item => fichaAlimento(item.nombre, item.unidad, marcado(item.nombre))).join('')}</div>` : ''}

    <div class="setup-falta">
      ${setup.anadiendo
        ? ventanitaDeAnadir(setup, rubro)
        : `<button type="button" class="enlace" data-action="setup-falta">¿No encuentras un alimento? Añadirlo</button>
           <button type="button" class="enlace" data-action="open-bulk" data-destino="habitual">${icono('hoja', { tamano: 16 })}Escribirlos de corrido</button>`}
    </div>

    <div class="modal-actions setup-actions">
      ${button(primero ? 'Salir' : 'Atrás', primero ? 'setup-salir' : 'setup-rubro-atras', 'btn-quiet')}
      <span class="tour-spacer"></span>
      <span class="pill ${enEsteRubro ? '' : 'gray'}" data-setup-total role="status" aria-live="polite">${textoMarcados(setup.elegidos.length)}</span>
      ${button(ultimo ? 'Continuar' : 'Continuar', 'setup-rubro-seguir', 'btn-primary', 'data-setup-seguir')}
    </div>`;
}

const textoMarcados = total => `${total} marcado${total === 1 ? '' : 's'} en total`;

function fichaAlimento(nombre, unidad, marcado) {
  return `<label class="chip-check setup-ficha ${marcado ? 'marcado' : ''}">
    <input type="checkbox" data-action="setup-marcar" data-setup-marca data-nombre="${esc(nombre)}" ${marcado ? 'checked' : ''}>
    <span class="setup-ficha-texto">${esc(nombre)}<span class="tiny">${esc(ETIQUETA_UNIDAD[unidad] || unidad || 'unidad')}</span></span>
  </label>`;
}

// La ventanita de añadir. Pide el nombre y nada más: la medida se sugiere sola
// según el rubro y se puede cambiar después, y preguntarla aquí sería un
// segundo campo entre alguien y el alimento que ya sabe que compra.
//
// Se abre dentro de la propia categoría, no encima de la pantalla, por una
// razón práctica: aquí no se puede perder el sitio. Quien la cierra sigue
// exactamente donde estaba, con lo marcado intacto.
function ventanitaDeAnadir(setup, rubro) {
  return `<form data-form="setup-nuevo" class="setup-ventanita" aria-label="Añadir un alimento a ${esc(rubro.titulo)}">
    <p class="setup-ventanita-titulo">Añadir a ${esc(rubro.titulo)}</p>
    <label class="field"><span class="sr-only">Nombre del alimento</span>
      <input name="nombre" data-setup-nuevo value="${esc(setup.nombreNuevo || '')}" placeholder="Ej. Fresa" autocomplete="off" maxlength="40" enterkeyhint="done">
    </label>
    ${setup.errorNuevo ? `<p class="setup-error" role="alert">${esc(setup.errorNuevo)}</p>` : ''}
    <div class="inline setup-ventanita-acciones">
      <button type="submit" class="btn btn-primary btn-small">Añadir</button>
      ${button('Cancelar', 'setup-cancelar-nuevo', 'btn-quiet btn-small')}
    </div>
    <p class="tiny muted">Solo el nombre. Queda marcado en ${esc(rubro.titulo.toLocaleLowerCase('es'))} y se mide en ${esc(ETIQUETA_UNIDAD[rubro.unidad] || rubro.unidad)} mientras no digas otra cosa.</p>
  </form>`;
}


/* ── Paso 3: cada cuánto se hace la compra ─────────────────────────────────

   Dos opciones y nada más. No se pregunta el día, ni el presupuesto, ni quién
   va: lo único que la app necesita saber es en cuántas veces se parte la lista,
   porque de ahí salen uno o dos períodos de compra al mes. */

function pasoFrecuencia(ctx, setup) {
  // Solo se enseña marcada una opción que alguien haya elegido de verdad. La
  // app se comporta como mensual mientras nadie diga nada, pero pintar
  // «Mensual» ya marcada sería contestar por el usuario una pregunta que
  // acabamos de hacerle, y dejarle pulsar Continuar sin haber decidido.
  const yaSeDijo = historialDeFrecuencia(ctx.state).length > 0;
  const elegida = setup.frecuencia || (yaSeDijo ? frecuenciaDe(ctx.state, todayISO().slice(0, 7)) : '');
  const opcion = (id, titulo, detalle) => `<button type="button" class="setup-opcion ${elegida === id ? 'activa' : ''}"
      data-action="setup-frecuencia" data-frecuencia="${id}" aria-pressed="${elegida === id}">
      <strong>${esc(titulo)}</strong><small>${esc(detalle)}</small></button>`;
  return `<p class="pantalla-intro">Sirve para saber cuándo toca la próxima lista y qué días cubre. <strong>No divide cantidades ni lleva cuentas de nada</strong>: lo que lleves en cada compra lo decides tú al escribir la lista.</p>
    <div class="setup-opciones">
      ${opcion('quincenal', 'Quincenal', 'Dos compras: del 1 al 15 y del 16 al último día del mes.')}
      ${opcion('mensual', 'Mensual', 'Una sola compra que cubre el mes completo.')}
    </div>
    <p class="tiny muted">Las quincenas son del 1 al 15 y del 16 al final del mes, sea de 28, 30 o 31 días. No son períodos de catorce días.</p>
    <p class="tiny muted">Puedes cambiarlo cuando quieras desde Más → Ajustes → Organización de compra, y elegir desde qué mes entra en vigencia. Lo que ya pasó no se reescribe: cada cambio vale desde el mes que le digas en adelante.</p>

    <div class="modal-actions setup-actions">
      ${button('Atrás', 'setup-atras', 'btn-quiet')}
      <span class="tour-spacer"></span>
      ${button('Continuar', 'setup-siguiente', 'btn-primary', elegida ? '' : 'disabled')}
    </div>`;
}



// Los números de esta pantalla son cantidades de comida, no dinero: «2.5» se
// lee mal y «2,5» aún peor dentro de un campo numérico, que espera el punto.

/* ── Paso 5: ver mi casa ───────────────────────────────────────────────────

   El último paso no pide nada. Enseña lo que quedó escrito y dice qué falta
   para que el calendario se llene solo, que son dos cosas distintas y conviene
   no mezclarlas: lo que falta por registrar y lo que falta por decidir.

   Antes esto se llamaba «tu primer mes» y prometía un mes ya montado. Lo
   prometía porque en aquel recorrido se decían los días de repetición dentro de
   cada preparación. Ahora eso no se pregunta aquí —tiene su propio flujo, y no
   es de esta etapa—, así que la casa termina de registrarse con el calendario
   vacío. Decirlo es obligatorio: alguien que acaba de registrar su casa entera
   y abre el mes esperando encontrarlo hecho merece saberlo antes de abrirlo, no
   después. */

function pasoCasa(ctx, setup) {
  const { state } = ctx;
  const mes = todayISO().slice(0, 7);
  const gente = personasActivas(state);
  const habituales = habitualLines(state);
  const recetas = state.recipes;
  const sinMomentos = recetas.filter(receta => !receta.uses.length).length;
  const faltanPersonas = Math.max(0, Math.min(20, Number(setup.personas) || 0) - gente.length);
  // La frecuencia se mira donde de verdad está escrita y no solo en el borrador
  // de este recorrido: quien la contestó hace tres meses y vuelve a pasar por
  // aquí no puede leer «sin decidir» sobre algo que ya decidió.
  const frecuencia = setup.frecuencia
    || (historialDeFrecuencia(state).length ? frecuenciaDe(state, mes) : null);

  const cuenta = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;
  const linea = (paso, titulo, detalle, completo) => `<div class="list-row setup-repaso ${completo ? 'listo' : 'pendiente'}">
    <div class="list-row-main">
      <div class="list-row-title">${esc(titulo)}</div>
      <div class="list-row-sub">${esc(detalle)}</div>
    </div>
    ${button('Cambiar', 'setup-ir', 'btn-quiet btn-small', `data-paso="${paso}"`)}
  </div>`;

  return `<p class="pantalla-intro">Esto es lo que quedó escrito. Se escribe una vez: a partir de ahora todos los meses parten de aquí y solo anotas lo diferente.</p>

    <div class="card setup-repasos">
      ${linea(PASO.personas, 'Mi hogar', faltanPersonas
        ? `${cuenta(gente.length, 'persona registrada', 'personas registradas')} · ${cuenta(faltanPersonas, 'queda', 'quedan')} por llenar`
        : cuenta(gente.length, 'persona', 'personas'), gente.length > 0 && !faltanPersonas)}
      ${linea(PASO.alimentos, 'Productos habituales', cuenta(habituales.length, 'producto', 'productos'), habituales.length > 0)}
      ${linea(PASO.compra, 'Cómo compramos', frecuencia === 'quincenal' ? 'Dos compras al mes' : frecuencia === 'mensual' ? 'Una compra al mes' : 'Sin decidir', Boolean(frecuencia))}
      ${linea(PASO.preparaciones, 'Comidas habituales', sinMomentos
        ? `${cuenta(recetas.length, 'preparación', 'preparaciones')} · ${cuenta(sinMomentos, 'sin momentos', 'sin momentos')}`
        : cuenta(recetas.length, 'preparación', 'preparaciones'), recetas.length > 0 && !sinMomentos)}
    </div>

    ${notice('Tu calendario empieza vacío, y así se queda hasta que tú lo llenes.',
      recetas.length
        ? `Tienes ${cuenta(recetas.length, 'preparación escrita', 'preparaciones escritas')}. En Plan mensual eliges una, marcas los días en que la quieres comer —los siete de la semana que viene, por ejemplo— y se ponen esos. La aplicación no decide por ti.`
        : 'Todavía no hay ninguna preparación escrita. Puedes volver atrás y escribir dos o tres, o hacerlo después desde Más → Preparaciones.')}

    <p class="tiny muted setup-nota">Puedes terminar ahora y completar las preparaciones cuando quieras. Nada de esto se pierde, y volver a pasar por aquí no borra lo que ya escribiste ni los cambios de ningún mes.</p>

    <div class="modal-actions setup-actions">
      ${button('Atrás', 'setup-atras', 'btn-quiet')}
      <span class="tour-spacer"></span>
      ${button('Terminar', 'setup-terminar', 'btn-primary btn-grande')}
    </div>`;
}


/* ── Paso 1: quiénes comen en esta casa ────────────────────────────────────

   Esto no se preguntaba aquí, y hacía falta: la app avisa de alergias, reparte
   porciones y cuenta cuánta gente come, y sin nadie registrado no puede hacer
   ninguna de las tres. Quien entraba sin cuenta llegaba al final del asistente
   con la casa vacía.

   No se escribe un segundo formulario de personas. La ficha —nombre, qué es de
   la casa, qué debe evitar y por qué— es exactamente la misma que la del
   asistente del hogar y la de Familia: se abre con `hogar-editar` y la dibuja
   `cuerpoDeFicha`. Un solo sitio donde se edita una persona significa un solo
   sitio donde acordarse de preguntar el motivo de una alergia. */

function pasoPersonas(ctx, setup) {
  const { state } = ctx;
  const gente = personasActivas(state);
  const total = Math.min(20, Math.max(1, Number(setup.personas) || gente.length || 1));
  const filas = Math.max(total, gente.length);
  const faltan = Math.max(0, total - gente.length);

  const fila = (indice) => {
    const persona = gente[indice];
    if (!persona) {
      return `<div class="list-row setup-persona pendiente">
        <div class="list-row-main">
          <div class="list-row-title">Persona ${indice + 1}</div>
          <div class="list-row-sub">Sin llenar</div>
        </div>
        ${button('Llenar', 'hogar-editar', 'btn-secondary btn-small', 'data-id=""')}
      </div>`;
    }
    return `<div class="list-row setup-persona">
      <div class="list-row-main">
        <div class="list-row-title">${esc(persona.name)} <span class="pill gray">${esc(claseDe(persona.kind).etiqueta)}</span></div>
        ${resumenDeRestricciones(state, persona)}
      </div>
      ${button('Editar', 'hogar-editar', 'btn-quiet btn-small', `data-id="${esc(persona.id)}"`)}
    </div>`;
  };

  return `<p class="pantalla-intro">Cuéntate a ti también. Con el nombre basta para empezar, y si alguien debe evitar algún alimento se anota aquí mismo.</p>

    <form data-form="setup-personas" class="hogar-contador">
      ${button('−', 'setup-personas-menos', 'hogar-paso', 'aria-label="Una persona menos"')}
      <label class="hogar-numero"><span class="sr-only">Personas que comen en casa</span>
        <input name="total" data-setup-personas type="number" inputmode="numeric" min="1" max="20" value="${total}" required></label>
      ${button('+', 'setup-personas-mas', 'hogar-paso', 'aria-label="Una persona más"')}
    </form>

    <div class="card setup-personas">${Array.from({ length: filas }, (unused, i) => fila(i)).join('')}</div>

    ${faltan
      ? notice(`${faltan === 1 ? 'Falta una persona' : `Faltan ${faltan} personas`} por llenar.`, 'Puedes seguir igual y anotarlas después desde Más → Familia y restricciones. Mientras no estén, la app no sabrá avisarte de lo que esa persona debe evitar.')
      : ''}

    <p class="tiny muted setup-nota">No te preguntamos el peso, ni la fecha de nacimiento, ni nada médico: la app no lo usa para nada.</p>

    <div class="modal-actions setup-actions">
      <span class="tour-spacer"></span>
      ${button('Continuar', 'setup-siguiente', 'btn-primary')}
    </div>`;
}

/* ── Paso 4: las comidas habituales ────────────────────────────────────────

   Nombre, en qué momentos se come, y una nota para quien cocina si hace falta.
   Nada más, y es a propósito.

   Aquí se abría la ventana completa de una preparación —la misma de «Nueva
   preparación»—, con sus alimentos, sus cantidades, cuánto rinde y qué días se
   repite. Se hizo así para no tener dos formularios de la misma cosa, que es un
   buen principio, y aun así estaba mal: quien está registrando su casa no
   quiere describir seis platos, quiere nombrarlos. Con la ventana completa,
   escribir las seis comidas de una familia eran treinta campos.

   Lo que esta pantalla no pregunta, tampoco lo borra: al editar desde aquí una
   preparación que ya tenía alimentos y porciones, esos se conservan intactos.
   La ventana completa sigue existiendo en Más → Preparaciones, para quien
   quiera decir qué lleva cada plato.

   Los días de repetición no se preguntan aquí todavía. Enseñar la casilla y no
   tener detrás el flujo que la hace valer sería peor que no enseñarla. */

function pasoPreparaciones(ctx, setup) {
  const { state } = ctx;
  const ficha = setup.preparacion || fichaVacia();
  const editando = Boolean(ficha.id);
  const marcado = id => ficha.momentos.includes(id);

  const fila = receta => `<div class="list-row">
    <div class="list-row-main">
      <div class="list-row-title">${esc(receta.name)}</div>
      <div class="list-row-sub">${receta.uses.length
        ? esc(receta.uses.map(etiquetaDeMomento).join(' · '))
        : '<span class="muted">sin momentos: no saldrá en el calendario</span>'}${receta.note ? ' · con nota' : ''}</div>
    </div>
    <div class="inline">
      ${button('Editar', 'setup-preparacion-editar', 'btn-quiet btn-small', `data-id="${esc(receta.id)}"`)}
      ${button('Quitar', 'setup-quitar-preparacion', 'btn-quiet btn-small', `data-id="${esc(receta.id)}"`)}
    </div>
  </div>`;

  return `<p class="pantalla-intro">Escribe las comidas que se cocinan de costumbre en tu casa. Con el nombre y en qué momentos se comen basta: qué lleva cada una y cuánto rinde se añade después, si quieres, desde Más → Preparaciones.</p>

    <form data-form="setup-preparacion" class="setup-preparacion card">
      <label class="field">
        <span>¿Cómo se llama?</span>
        <input name="nombre" data-setup-preparacion-nombre autocomplete="off" maxlength="60"
          value="${esc(ficha.nombre)}" placeholder="Ej. Mangú con salami" enterkeyhint="done">
      </label>

      <div class="field">
        <span>¿En qué momentos se come?</span>
        <div class="chips setup-momentos">${MOMENTOS.map(momento => `
          <label class="chip-check"><input type="checkbox" name="momentos" value="${momento.id}" ${marcado(momento.id) ? 'checked' : ''}><span>${esc(momento.etiqueta)}</span></label>`).join('')}</div>
        <small>Una misma comida puede estar en varios: el mangú con salami suele ser desayuno y cena.</small>
      </div>

      <label class="field">
        <span>Nota para quien cocina <span class="muted">(opcional)</span></span>
        <input name="nota" autocomplete="off" maxlength="140" value="${esc(ficha.nota)}" placeholder="Ej. El agua bien caliente">
      </label>

      ${ficha.error ? `<p class="setup-error" role="alert">${esc(ficha.error)}</p>` : ''}

      <div class="inline setup-preparacion-acciones">
        <button type="submit" class="btn btn-primary">${editando ? 'Guardar los cambios' : 'Guardar y añadir otra'}</button>
        ${editando ? button('Cancelar', 'setup-preparacion-nueva', 'btn-quiet') : ''}
      </div>
    </form>

    ${state.recipes.length
      ? `<div class="card">${state.recipes.map(fila).join('')}</div>`
      : notice('Todavía no has escrito ninguna.',
          'Puedes seguir sin escribir ninguna y hacerlo después. Lo único que pasa mientras tanto es que el calendario del mes se llena a mano, día por día.')}

    <div class="modal-actions setup-actions">
      ${button('Atrás', 'setup-atras', 'btn-quiet')}
      <span class="tour-spacer"></span>
      ${button('Continuar', 'setup-siguiente', 'btn-primary')}
    </div>`;
}

/* ── Armazón ───────────────────────────────────────────────────────────── */

function barra(setup) {
  const visibles = pasosDe(setup);
  const posicion = posicionDe(setup, setup.paso);
  return `<div class="setup-steps" role="list" aria-label="Progreso">
    ${visibles.map((item, indice) => `<div class="setup-step ${indice === posicion ? 'now' : indice < posicion ? 'done' : ''}" role="listitem" ${indice === posicion ? 'aria-current="step"' : ''}>
      <span class="setup-dot" aria-hidden="true">${indice < posicion ? '✓' : indice + 1}</span><span class="setup-label">${esc(item.corto)}</span></div>`).join('')}
  </div><div class="progress setup-progress"><span style="width:${Math.round((posicion + 1) / visibles.length * 100)}%"></span></div>`;
}

export function renderSetup(ctx) {
  const setup = ctx.ui.setup;
  if (!setup || setup.paso === 0) return pantallaInicio(setup);

  const cuerpo = setup.paso === PASO.personas ? pasoPersonas(ctx, setup)
    : setup.paso === PASO.alimentos ? pantallaDeRubro(setup)
    : setup.paso === PASO.compra ? pasoFrecuencia(ctx, setup)
    : setup.paso === PASO.preparaciones ? pasoPreparaciones(ctx, setup)
    : pasoCasa(ctx, setup);

  const visibles = pasosDe(setup);
  const posicion = posicionDe(setup, setup.paso);
  const actual = PASOS.find(item => item.id === setup.paso) || PASOS[0];

  return `<section class="setup">
    <div class="setup-head">
      <div><p class="eyebrow">Paso ${posicion + 1} de ${visibles.length}</p><h2>${esc(actual.titulo)}</h2></div>
      ${setup.paso === PASO.casa ? '' : button('Salir', 'setup-salir', 'btn-quiet btn-small')}
    </div>
    ${barra(setup)}
    <div class="setup-body">${cuerpo}</div>
  </section>`;
}

/* ── Guardado ──────────────────────────────────────────────────────────── */

// Una cosa se escribe una vez: el alimento se crea en el catálogo con lo que el
// catálogo dominicano ya sabe de él —categoría, unidades, alias— y su línea
// entra en la canasta habitual. No hay que repetirlo en ningún otro sitio.
//
// Se escribe con `setHabitualBasket` y no línea a línea con `setHabitualLine`
// porque `setHabitualLine` lee una cantidad vacía como una baja y borra la
// línea, y aquí las cantidades pendientes son legítimas y frecuentes: quien
// sabe que compra arroz todos los meses no sabe todavía cuántas libras. La
// lista que se manda lleva delante las líneas que ya había y no se tocan, así
// que guardar añade y corrige, nunca sustituye la canasta entera.
export function guardarEnLaCanasta(state, filas) {
  const previas = habitualLines(state);
  const nuevas = [];
  for (const fila of filas) {
    const nombre = String(fila.nombre || '').trim();
    if (!nombre) continue;
    const semilla = semillaPorNombre(nombre);
    const unidad = unidadValida(fila.unidad);
    let item = productByName(state, nombre);
    if (!item) {
      item = addProduct(state, {
        // El nombre bueno es el del catálogo cuando lo escrito era un alias:
        // «plat mad» se guarda como «Plátano maduro».
        name: semilla?.name || nombre,
        controlUnit: unidad || semilla?.controlUnit || 'unidad',
        purchaseUnit: semilla?.purchaseUnit || unidad || 'unidad',
        // El rubro donde se escribió manda sobre el cajón de sobras: «Fresa»,
        // escrita en Frutas, se guarda en Frutas.
        category: semilla?.category || fila.categoria || 'otros',
        aliases: semilla?.aliases || [],
        origin: semilla ? 'catalogo' : fila.origen === 'texto' ? 'texto' : 'manual'
      });
    }
    if (nuevas.some(linea => linea.productId === item.id)) continue;
    const anterior = previas.find(linea => linea.productId === item.id);
    // La línea guardada, esté dentro de la canasta ahora mismo o dada de baja.
    // Se mira solo para heredar la unidad: volver a marcar algo que se había
    // dejado de comprar no puede cambiarle la medida con la que se contó todos
    // los meses anteriores.
    const guardada = state.habitualBasket.lines.find(row => row.productId === item.id);
    const unidadDeAntes = anterior?.unit
      || [...(guardada?.tramos || [])].reverse().find(tramo => !tramo.fuera)?.unit;
    // Tres casos distintos, y confundirlos borra datos:
    //
    //  · Sin el campo `cantidad` —el recorrido guiado, que ya no las pregunta—
    //    se deja la que hubiera. Marcar otra vez el arroz no puede tirar las 25
    //    libras que alguien escribió el mes pasado.
    //  · Con el campo vacío o en cero se guarda pendiente: es «todavía no sé» o
    //    «no lo compro», y un cero no es un consumo.
    //  · Con un número, ese número.
    const sinDecirNada = !('cantidad' in fila);
    const vacia = fila.cantidad === '' || fila.cantidad === null || fila.cantidad === undefined || Number(fila.cantidad) === 0;
    nuevas.push({
      id: anterior?.id,
      productId: item.id,
      quantity: sinDecirNada ? (anterior ? anterior.quantity : null) : vacia ? null : fila.cantidad,
      unit: unidad || unidadDeAntes || item.controlUnit,
      priority: anterior?.priority || (semilla?.common ? 'obligatorio' : 'frecuente')
    });
  }
  const intactas = previas.filter(linea => !nuevas.some(nueva => nueva.productId === linea.productId));
  setHabitualBasket(state, [...intactas, ...nuevas]);
  if (!state.settings) state.settings = { reviewWeekday: 5, onboarded: false };
  state.settings.onboarded = true;
  return nuevas.length;
}

/* ── De lo marcado a la canasta ────────────────────────────────────────────

   Antes esto leía el DOM: la pantalla de las cantidades tenía una fila por
   alimento y se recogía al enviar el formulario. Sin esa pantalla, lo marcado
   ya está en `setup.elegidos` desde el toque —se escribe ahí y se guarda en el
   acto—, así que basta con traducirlo a filas.

   Ninguna fila lleva cantidad, y eso no es lo mismo que llevarla vacía: una
   cantidad vacía significaría «no sé cuánto» y borraría la que alguien tuviera
   escrita de antes. Sin el campo, `guardarEnLaCanasta` deja la que había. */

function filasDeLoMarcado(state, setup) {
  const propios = new Map(setup.propios.map(item => [normalizeName(item.nombre), item]));
  const yaEnLaLista = new Set(state.habitualBasket.lines.map(linea => linea.productId));
  return setup.elegidos.map(nombre => {
    const propio = propios.get(normalizeName(nombre));
    const semilla = semillaPorNombre(nombre);
    const fila = {
      nombre,
      categoria: propio?.categoria || semilla?.category || '',
      origen: propio?.origen || (semilla ? 'catalogo' : 'manual')
    };
    // La unidad se manda solo para lo que hay que registrar por primera vez.
    //
    // Un alimento que ya está en la lista tiene la suya escrita, y esta pantalla
    // no la pregunta: mandarle la del catálogo le cambiaba el salami de
    // «paquetes» a «ruedas» —el catálogo lo cuenta en ruedas y lo compra por
    // paquetes— sin que nadie lo pidiera, y eso le abría un tramo nuevo en su
    // historial solo por haber vuelto a pasar por aquí.
    const item = productByName(state, nombre);
    if (!item || !yaEnLaLista.has(item.id)) fila.unidad = propio?.unidad || semilla?.controlUnit;
    return fila;
  });
}

function guardarLoMarcado(ctx) {
  const setup = ctx.ui.setup;
  const filas = filasDeLoMarcado(ctx.state, setup);
  if (!filas.length) return 0;
  const guardados = guardarEnLaCanasta(ctx.state, filas);
  setup.guardados = guardados;
  return guardados;
}


// Lo que esté escrito en la pantalla que se deja, sea cual sea. Antes esto era
// un par de `if (paso === 2)` repetidos en tres acciones, y cada paso nuevo
// obligaba a acordarse de los tres.
function recordarLoEscrito(ctx) {
  const paso = ctx.ui.setup?.paso;
  if (paso === PASO.personas) recordarPersonas(ctx);
}

// El número que se esté viendo, venga de los botones o de haberlo tecleado.
function recordarPersonas(ctx) {
  const escrito = document.querySelector('[data-setup-personas]')?.value;
  const total = Math.round(Number(escrito));
  if (Number.isFinite(total) && total > 0) ctx.ui.setup.personas = Math.min(20, total);
}

function ajustarPersonas(ctx, delta) {
  const setup = ctx.ui.setup;
  recordarPersonas(ctx);
  const actual = Number(setup.personas) || personasActivas(ctx.state).length || 1;
  setup.personas = Math.min(20, Math.max(1, actual + delta));
  guardarAvance(ctx);
  ctx.render();
}

// Lo que ya está guardado se enseña marcado y con su cantidad escrita. Es la
// única forma de que volver a pasar por el asistente no pise en silencio lo que
// costó escribir la primera vez: se ve antes de tocarlo.
function precargar(ctx) {
  const setup = ctx.ui.setup;
  if (setup.precargado) return;
  setup.precargado = true;
  for (const linea of habitualLines(ctx.state)) {
    const item = product(ctx.state, linea.productId);
    if (!item) continue;
    const semilla = semillaPorNombre(item.name);
    setup.cantidades[item.name] = { cantidad: linea.quantity === null ? '' : linea.quantity, unidad: linea.unit, yaGuardada: true };
    const nombre = semilla?.name || item.name;
    setup.elegidos = [...new Set([...setup.elegidos, nombre])];
    if (!semilla) {
      setup.propios = [...setup.propios.filter(propio => normalizeName(propio.nombre) !== normalizeName(item.name)),
        { nombre: item.name, unidad: linea.unit, categoria: item.category || 'otros', origen: 'manual', reconocido: item.name }];
    }
  }
}

/* ── Marcar sin que la pantalla salte ──────────────────────────────────────
   Marcar veinte casillas redibujando la pantalla veinte veces es lo que hacía
   perder el sitio al pulgar: cada redibujo reemplaza los nodos, el navegador
   vuelve el desplazamiento a cero y el foco se va al cuerpo del documento.

   La solución es no redibujar. `setup-marcar` escribe en `ui.setup.elegidos`
   —que es lo que se leerá al guardar y lo que pintará el próximo redibujo, si
   llega—, guarda el avance sin pintar, y después toca a mano las dos cosas que
   se ven: la clase de la ficha y el contador de arriba. Ningún nodo se crea ni
   se destruye, así que ni el desplazamiento ni el foco se mueven.

   Los redibujos que sí ocurren —cambiar de rubro, buscar, abrir la ventanita—
   son los que cambian la lista entera, y ahí empezar por arriba es lo
   correcto. */

function refrescarContadores(ctx) {
  const setup = ctx.ui.setup;
  const total = document.querySelector('[data-setup-total]');
  if (total) {
    total.textContent = textoMarcados(setup.elegidos.length);
    total.classList.toggle('gray', !setup.elegidos.length);
  }
}

const pintarFicha = (casilla, marcado) => casilla.closest('.setup-ficha')?.classList.toggle('marcado', marcado);

/* ── Acciones ──────────────────────────────────────────────────────────── */

export const SETUP_ACTIONS = {
  'setup-open': (el, ctx) => {
    ctx.ui.setup = ctx.ui.setup || emptySetup();
    ctx.ui.page = 'setup';
    ctx.ui.modal = null;
    ctx.render();
  },
  'setup-empezar': (el, ctx) => {
    ctx.ui.setup = ctx.ui.setup || emptySetup();
    precargar(ctx);
    ctx.ui.setup.paso = PASOS[0].id;
    guardarAvance(ctx);
    ctx.render();
  },
  'setup-salir': (el, ctx) => {
    recordarLoEscrito(ctx);
    // Salir no descarta nada, y desde que no hay paso de cantidades tampoco deja
    // lo marcado a medio camino: la portada promete que lo que marques se guarda
    // solo, y eso solo es verdad si lo marcado llega a la canasta. Volver a
    // entrar lo encuentra marcado, y quitarlo se hace desde Más → Canasta.
    guardarLoMarcado(ctx);
    guardarAvance(ctx);
    ctx.ui.page = 'hoy';
    ctx.commit('Guardado. Puedes retomarlo desde Más → Organizar mi casa.');
  },
  'setup-atras': (el, ctx) => {
    const setup = ctx.ui.setup;
    recordarLoEscrito(ctx);
    // Volver al paso de los alimentos devuelve el último rubro, no el primero:
    // es donde estaba quien pulsó «Atrás».
    setup.paso = saltarA(setup, setup.paso, -1);
    if (setup.paso === PASO.alimentos) setup.rubro = RUBROS.length - 1;
    guardarAvance(ctx);
    ctx.render();
  },
  'setup-siguiente': (el, ctx) => {
    const setup = ctx.ui.setup;
    recordarLoEscrito(ctx);
    setup.paso = saltarA(setup, setup.paso, 1);
    guardarAvance(ctx);
    ctx.render();
  },

  // Paso 3: cada cuánto se compra.
  //
  // La primera vez entra en vigencia desde el mes en curso: no hay pasado que
  // proteger todavía. Cambiarla después se hace desde Ajustes, y ahí sí se
  // pregunta desde cuándo.
  'setup-frecuencia': (el, ctx) => {
    const setup = ctx.ui.setup;
    if (!FRECUENCIAS.includes(el.dataset.frecuencia)) return;
    setup.frecuencia = el.dataset.frecuencia;
    ponerFrecuencia(ctx.state, setup.frecuencia, todayISO().slice(0, 7));
    guardarAvance(ctx);
    ctx.commit('');
  },


  /* ── Paso 1: los ocho rubros ─────────────────────────────────────────── */

  'setup-rubro-atras': (el, ctx) => {
    const setup = ctx.ui.setup;
    setup.rubro = Math.max(0, setup.rubro - 1);
    // Lo marcado no se toca al retroceder: eso es lo que se estaba comprobando.
    Object.assign(setup, { busqueda: '', anadiendo: false, nombreNuevo: '', errorNuevo: '' });
    guardarAvance(ctx);
    ctx.render();
  },
  // Se puede continuar sin marcar nada. Hay casas que no compran vegetales
  // frescos, y obligarlas a marcar algo para pasar sería pedirles que mientan.
  'setup-rubro-seguir': (el, ctx) => {
    const setup = ctx.ui.setup;
    Object.assign(setup, { busqueda: '', anadiendo: false, nombreNuevo: '', errorNuevo: '' });
    if (setup.rubro < RUBROS.length - 1) {
      setup.rubro += 1;
      guardarAvance(ctx);
      ctx.render();
      return;
    }
    // Último rubro: aquí es donde lo marcado deja de ser un borrador y pasa a
    // ser la lista de productos habituales de la casa. Antes esto ocurría al
    // enviar la pantalla de las cantidades, que ya no existe.
    setup.paso = PASO.compra;
    const guardados = guardarLoMarcado(ctx);
    guardarAvance(ctx);
    ctx.commit(guardados
      ? `${guardados} producto(s) habituales guardados. Las cantidades no hacen falta: se deciden en cada lista.`
      : 'Sin productos marcados por ahora. Puedes volver cuando quieras.');
  },
  'setup-limpiar-busqueda': (el, ctx) => {
    ctx.ui.setup.busqueda = '';
    ctx.render();
  },

  // La ventanita de añadir un alimento, dentro de la propia categoría.
  'setup-falta': (el, ctx) => {
    Object.assign(ctx.ui.setup, { anadiendo: true, nombreNuevo: '', errorNuevo: '' });
    ctx.render();
    document.querySelector('[data-setup-nuevo]')?.focus();
  },
  'setup-cancelar-nuevo': (el, ctx) => {
    Object.assign(ctx.ui.setup, { anadiendo: false, nombreNuevo: '', errorNuevo: '' });
    ctx.render();
  },

  'setup-marcar': (el, ctx) => {
    const setup = ctx.ui.setup;
    const nombre = el.dataset.nombre;
    const clave = normalizeName(nombre);
    setup.elegidos = el.checked
      ? [...new Set([...setup.elegidos, nombre])]
      : setup.elegidos.filter(item => normalizeName(item) !== clave);
    // Se guarda en cada toque, y sin repintar: quien está marcando veinte
    // casillas no puede perder el sitio, y tampoco lo marcado si cierra la app.
    guardarAvance(ctx);
    pintarFicha(el, el.checked);
    refrescarContadores(ctx);
  },

  /* ── Paso 1: cuántas personas comen en casa ──────────────────────────── */

  'setup-personas-mas': (el, ctx) => ajustarPersonas(ctx, 1),
  'setup-personas-menos': (el, ctx) => ajustarPersonas(ctx, -1),

  /* ── Paso 4: las comidas habituales ──────────────────────────────────── */

  // Traer una que ya existe al formulario de arriba. Solo se cargan los tres
  // campos que esta pantalla sabe pintar; lo demás sigue guardado y se devuelve
  // intacto al guardar.
  'setup-preparacion-editar': (el, ctx) => {
    const receta = ctx.state.recipes.find(item => item.id === el.dataset.id);
    if (!receta) return;
    ctx.ui.setup.preparacion = { id: receta.id, nombre: receta.name, momentos: [...receta.uses], nota: receta.note || '', error: '' };
    ctx.render();
    document.querySelector('[data-setup-preparacion-nombre]')?.focus();
  },
  'setup-preparacion-nueva': (el, ctx) => {
    ctx.ui.setup.preparacion = fichaVacia();
    ctx.render();
    document.querySelector('[data-setup-preparacion-nombre]')?.focus();
  },

  // Quitar aquí es quitar del todo, y se pregunta: la preparación puede llevar
  // diez minutos escrita o llevar puesta en veinte días del calendario.
  'setup-quitar-preparacion': (el, ctx) => {
    const receta = ctx.state.recipes.find(item => item.id === el.dataset.id);
    if (!receta) return;
    const puestas = ctx.state.plans.filter(plan => plan.recipeId === receta.id).length;
    const aviso = puestas
      ? `«${receta.name}» está puesta en ${puestas} comida(s) del calendario. Quitarla de aquí no las borra, pero dejarán de poder repetirse. ¿Quitarla?`
      : `¿Quitar «${receta.name}»?`;
    if (!window.confirm(aviso)) return;
    deleteRecipe(ctx.state, receta.id);
    ctx.commit(`«${receta.name}» quitada.`);
  },

  /* ── Paso 5: volver a un paso desde el repaso ────────────────────────── */

  'setup-ir': (el, ctx) => {
    const destino = Number(el.dataset.paso);
    if (!PASOS.some(paso => paso.id === destino)) return;
    const setup = ctx.ui.setup;
    recordarLoEscrito(ctx);
    setup.paso = destino;
    // Volver a los productos devuelve el primer rubro y no el último: quien
    // pulsa «Cambiar» ahí viene a repasarlos, no a salir de ellos.
    if (destino === PASO.alimentos) setup.rubro = 0;
    guardarAvance(ctx);
    ctx.render();
  },

  'setup-terminar': (el, ctx) => {
    // Lo marcado ya se guardó al salir de los productos; esto es la red por si
    // alguien volvió atrás, cambió algo y llegó hasta aquí sin volver a pasar.
    guardarLoMarcado(ctx);
    olvidarAvance(ctx.state);
    ctx.ui.setup = null;
    ctx.ui.page = 'hoy';
    ctx.commit('Tu casa está registrada. Lo que falte lo completas cuando quieras.');
  }
};

/* ── Formularios ───────────────────────────────────────────────────────── */

export const SETUP_FORMS = {
  /* ── Añadir un alimento que no está en la lista ──────────────────────────

     Nombre y un toque en «Añadir». Nada más, y nunca se sale de la categoría.

     Lo único que esto hace con cabeza es no crear dos veces el mismo alimento:
     si lo escrito ya existe —en el catálogo dominicano o en la casa— se marca
     el que hay y se dice dónde estaba, en vez de fabricar un duplicado que
     partiría el inventario en dos fichas del mismo arroz. */
  'setup-nuevo': (form, data, ctx) => {
    const setup = ctx.ui.setup;
    const rubro = rubroPorIndice(setup.rubro);
    const escrito = String(data.get('nombre') ?? document.querySelector('[data-setup-nuevo]')?.value ?? '').trim();
    setup.nombreNuevo = escrito;

    if (escrito.length < 2) {
      setup.errorNuevo = 'Escribe el nombre del alimento.';
      ctx.render();
      document.querySelector('[data-setup-nuevo]')?.focus();
      return;
    }

    const clave = normalizeName(escrito);
    const yaMarcado = setup.elegidos.some(item => normalizeName(item) === clave);
    const semilla = semillaPorNombre(escrito);
    const existente = productByName(ctx.state, escrito);
    const propio = setup.propios.find(item => normalizeName(item.nombre) === clave);
    const nombre = semilla?.name || existente?.name || propio?.nombre || escrito;

    if (!propio && !semilla && !existente) {
      // Un alimento nuevo de verdad. La medida sale del rubro donde se escribió
      // —libras en las carnes, unidades en las frutas— y se puede cambiar
      // después desde la ficha del alimento.
      setup.propios = [...setup.propios, {
        nombre: escrito,
        unidad: unidadValida(rubro.unidad) || 'unidad',
        categoria: categoriaDelRubro(rubro.id),
        origen: 'manual'
      }];
    }

    setup.elegidos = [...new Set([...setup.elegidos, nombre])];
    Object.assign(setup, { anadiendo: false, nombreNuevo: '', errorNuevo: '' });
    guardarAvance(ctx);
    ctx.render();

    // Dónde quedó. Si estaba en otro rubro hay que decirlo, o quien lo escribió
    // se quedará buscándolo en esta pantalla.
    const suyo = semilla?.category || existente?.category || propio?.categoria || categoriaDelRubro(rubro.id);
    const donde = rubroDeCategoria(suyo);
    if (yaMarcado) ctx.toast(`«${nombre}» ya estaba marcado.`);
    else if (donde && donde.id !== rubro.id) ctx.toast(`«${nombre}» ya estaba en ${donde.titulo}: queda marcado ahí.`);
    else ctx.toast(`«${nombre}» añadido a ${rubro.titulo} y marcado.`);
  },

  /* ── Paso 4: una comida habitual ─────────────────────────────────────────

     Nombre y momentos. La nota es opcional y lo dice.

     Lo delicado está en la última línea: al editar una preparación que ya
     existe se le devuelven sus alimentos y sus porciones tal como estaban.
     `upsertRecipe` reescribe la ficha entera con lo que se le pase, así que sin
     eso, corregirle el nombre a una preparación desde aquí le borraría en
     silencio los ocho alimentos que alguien anotó en la ventana completa. */
  'setup-preparacion': (form, data, ctx) => {
    const setup = ctx.ui.setup;
    const anteriorId = setup.preparacion?.id || '';
    const nombre = String(data.get('nombre') ?? document.querySelector('[data-setup-preparacion-nombre]')?.value ?? '').trim();
    const momentos = typeof data.getAll === 'function' ? data.getAll('momentos').map(String) : [].concat(data.get('momentos') || []).map(String);
    const nota = String(data.get('nota') || '').trim();
    setup.preparacion = { id: anteriorId, nombre, momentos, nota, error: '' };

    if (nombre.length < 2) {
      setup.preparacion.error = 'Escribe cómo se llama la comida.';
      ctx.render();
      document.querySelector('[data-setup-preparacion-nombre]')?.focus();
      return;
    }
    if (!momentos.length) {
      setup.preparacion.error = 'Marca en qué momentos se come: es lo que la coloca en el calendario.';
      ctx.render();
      return;
    }

    const anterior = anteriorId ? ctx.state.recipes.find(item => item.id === anteriorId) : null;
    upsertRecipe(ctx.state, {
      id: anterior?.id,
      name: nombre,
      uses: momentos,
      note: nota,
      items: anterior?.items || [],
      servings: anterior?.servings ?? null
    });
    // En blanco y lista para la siguiente: es lo que permite escribir las seis
    // comidas de una casa de una sentada.
    setup.preparacion = fichaVacia();
    guardarAvance(ctx);
    ctx.commit(anterior ? `«${nombre}» actualizada.` : `«${nombre}» guardada. Escribe la siguiente.`);
  },

  /* ── Paso 1: quiénes comen en casa ───────────────────────────────────── */

  'setup-personas': (form, data, ctx) => {
    recordarPersonas(ctx);
    ctx.ui.setup.paso = saltarA(ctx.ui.setup, PASO.personas, 1);
    guardarAvance(ctx);
    ctx.render();
  }
};
