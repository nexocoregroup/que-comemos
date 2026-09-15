// El asistente escrito. Una conversación que siempre termina en la misma tabla
// de acciones que valida assistant.js: aquí no se toca el estado a mano, no se
// escribe en el almacenamiento y no se ejecuta nada que no esté en ACTION_NAMES.
//
// Tres decisiones gobiernan el archivo entero:
//
//   1. Primero el intérprete de casa. Las frases que la gente escribe de verdad
//      —«compré dos libras de arroz», «quedan tres latas de atún», «qué falta»—
//      se resuelven sin conexión, sin gastar servicio y sin que nada salga del
//      dispositivo. Solo lo que no se reconoce sale, y solo si hay servicio
//      configurado y la persona da permiso.
//   2. Lo que sale, sale pelado. El contexto que viaja son nombres: alimentos,
//      personas, preparaciones y el mes. Nunca las existencias, las compras ni
//      las revisiones: el modelo no necesita saber cuánto arroz hay en casa
//      para entender «agrega dos libras de arroz».
//   3. Un identificador por mensaje. Confirmar lo pendiente reutiliza el mismo,
//      así que tocar «Confirmar» dos veces no registra la compra dos veces.
//
// El panel dibuja HTML y nada más; app.js lo inserta, delega las acciones de
// CHAT_ACTIONS y los envíos de CHAT_FORMS, y guarda el estado en `ui.chat`.

import { ACTION_NAMES, isQuery, runActions, toolSchemas, undoTo } from './assistant.js';
import { capacidad, dictar, pararDictado } from './device.js';
import { AVISO_ENVIO, callProvider, isConfigured } from './providers.js';
import { SLOTS, addDays, monthBounds, todayISO, weekStart } from './model.js';
import { parseLine, parseProductText, parseQuantity } from './text-parse.js';
import { button, cap, esc, fmt, niceDate, notice, unitText } from './ui-kit.js';

/* ── Estado del panel ──────────────────────────────────────────────────── */

export function emptyChat() {
  return { mensajes: [], pendiente: null, deshacer: null, escuchando: false, enviando: false, error: '', errorTitulo: '', pista: '' };
}

// `pendiente` es siempre lo mismo —algo que espera una decisión de la persona—
// con tres formas: 'confirmar' (acciones sensibles con su vista previa),
// 'pregunta' (una duda con opciones) y 'aviso' (el permiso de envío). Tener un
// solo hueco evita que se acumulen dos preguntas sin saber cuál contesta quién.

// El permiso de envío vive en el módulo y no en `ui.chat` a propósito: es «la
// primera vez de cada sesión», así que tiene que morir al recargar la app y no
// viajar dentro del estado del panel.
let permisoDeEnvio = false;
// Lo mismo, pero para el aviso del dictado: cuando quien escucha es el motor del
// navegador, la voz sale hacia sus servidores y eso hay que decirlo. Se dice una
// vez por sesión —repetirlo en cada frase sería ruido— y con el motor del
// teléfono no se dice nunca, porque ahí no sale nada del aparato.
let avisadoDeVozAjena = false;
// Cada dictado lleva su número. Si empieza otro, el anterior deja de escribir en
// el campo aunque su promesa se resuelva tarde: dos dictados pisándose dejarían
// un texto que nadie dijo.
let dictadoActual = 0;
let contador = 0;

// crypto.randomUUID no existe en contextos sin https ni en WebViews viejos. El
// respaldo no tiene que ser criptográfico: solo irrepetible dentro de la sesión.
function nuevoIdentificador() {
  const azar = globalThis.crypto;
  if (azar && typeof azar.randomUUID === 'function') return azar.randomUUID();
  contador += 1;
  return `chat-${Date.now().toString(36)}-${contador}`;
}

// El panel guarda su estado en `ui.chat` y app.js lo pasa como `ctx.chat`. Se
// busca en los dos para que dibujarlo antes de que app.js lo cree no reviente.
function chatDe(ctx) {
  if (ctx.chat) return ctx.chat;
  if (ctx.ui) { ctx.ui.chat = ctx.ui.chat || emptyChat(); ctx.chat = ctx.ui.chat; return ctx.chat; }
  ctx.chat = emptyChat();
  return ctx.chat;
}

function decir(chat, quien, texto, extra = {}) {
  const mensaje = { id: nuevoIdentificador(), quien, texto: String(texto ?? '').trim(), ...extra };
  chat.mensajes.push(mensaje);
  // Una conversación de meses no aporta nada y sí pesa en un teléfono.
  if (chat.mensajes.length > 60) chat.mensajes = chat.mensajes.slice(-60);
  return mensaje;
}

const campoDelChat = () => globalThis.document?.querySelector('[data-form="chat"] [name="mensaje"]') || null;

// Lo que la persona tenga escrito no se pierde porque el panel se vuelva a
// dibujar: se lee del campo antes de cada redibujo propio.
function guardarBorrador(ctx) {
  const campo = campoDelChat();
  if (campo) chatDe(ctx).borrador = campo.value;
}

// Lo dictado se añade a lo que ya hubiera: se dicta en tandas («ah, y también
// dos latas de atún»), y empezar de cero en cada tanda obligaría a repetirlo todo.
const juntar = (...trozos) => trozos.map(trozo => String(trozo ?? '').trim()).filter(Boolean).join(' ');

const valorDe = (data, nombre, form) => {
  if (data && typeof data.get === 'function') return data.get(nombre);
  if (data && typeof data === 'object' && nombre in data) return data[nombre];
  return form?.elements?.[nombre]?.value;
};

/* ── Leer español sin salir de casa ────────────────────────────────────── */

// El texto se analiza sin tildes y en minúscula, pero los nombres se recortan
// del original: la persona escribió «Plátano» y así tiene que llegar a la
// acción. Por eso el mapa cambia una letra por una letra y nunca la longitud:
// los índices de un texto valen para el otro.
const TILDES = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', à: 'a', è: 'e', ì: 'i', ò: 'o', ù: 'u', ñ: 'n' };
const plano = texto => String(texto ?? '').toLowerCase().replace(/[áéíóúüàèìòùñ]/g, letra => TILDES[letra] || letra);
const recorte = (original, inicio, largo) => original.slice(inicio, inicio + largo).trim();

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesActual = () => todayISO().slice(0, 7);
const mesSiguiente = mes => {
  const [ano, numero] = mes.split('-').map(Number);
  return numero === 12 ? `${ano + 1}-01` : `${ano}-${String(numero + 1).padStart(2, '0')}`;
};
// Un mes escrito por su nombre es el que viene, no el que pasó: quien dice «en
// marzo» en septiembre está planificando, no corrigiendo el pasado.
function mesPorNombre(nombre) {
  const indice = MESES.indexOf(nombre === 'setiembre' ? 'septiembre' : nombre);
  if (indice < 0) return null;
  const actual = mesActual(), ano = Number(actual.slice(0, 4)), numero = indice + 1;
  return `${numero >= Number(actual.slice(5, 7)) ? ano : ano + 1}-${String(numero).padStart(2, '0')}`;
}

function fechaEscrita(llano) {
  const hoy = todayISO();
  const explicita = llano.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (explicita) return explicita[1];
  if (/\bpasado\s+manana\b/.test(llano)) return addDays(hoy, 2);
  if (/\bmanana\b/.test(llano)) return addDays(hoy, 1);
  if (/\bantier\b|\banteayer\b/.test(llano)) return addDays(hoy, -2);
  if (/\bayer\b/.test(llano)) return addDays(hoy, -1);
  if (/\bhoy\b|\besta\s+noche\b|\beste\s+mediodia\b/.test(llano)) return hoy;
  return null;
}

const ARTICULO = /^(?:de\s+l[oa]s?|del|de\s+la|de|l[oa]s?|el|la|un|una|unos|unas|mis?|nuestr[oa]s?)\s+/;
// Una preposición colgando al final es lo que queda cuando se recorta un trozo
// del medio de la frase. Ningún alimento se llama «arroz de», así que se quita.
const COLGANDO = /\s+(?:de|del|a|al|en|para|con|y|e)$/;
function sinArticulo(texto, llano) {
  let a = texto.trim(), b = llano.trim();
  for (let encontrado = b.match(ARTICULO); encontrado; encontrado = b.match(ARTICULO)) {
    a = a.slice(encontrado[0].length).trim();
    b = b.slice(encontrado[0].length).trim();
  }
  return { texto: a.replace(COLGANDO, ''), llano: b.replace(COLGANDO, '') };
}

// Se busca el trozo sobre el texto sin tildes y se recorta de los dos a la vez,
// sustituyéndolo por un espacio: así el nombre del alimento conserva las tildes
// y las mayúsculas, y las dos cadenas siguen midiendo lo mismo.
function recortarTrozos(texto, llano, reglas) {
  let a = texto, b = llano;
  const efectos = [];
  for (const [expresion, efecto] of reglas) {
    const encontrado = b.match(expresion);
    if (!encontrado) continue;
    const inicio = encontrado.index, fin = inicio + encontrado[0].length;
    a = `${a.slice(0, inicio)} ${a.slice(fin)}`;
    b = `${b.slice(0, inicio)} ${b.slice(fin)}`;
    efectos.push([efecto, encontrado]);
  }
  return { texto: a.replace(/\s+/g, ' ').trim(), llano: b.replace(/\s+/g, ' ').trim(), efectos };
}

// «a la canasta», «este mes», «en octubre»: lo que dice a qué canasta va la
// línea, y que estorba para leer la cantidad y el alimento. Las reglas más
// largas van primero, o «canasta base» se quedaría a medias en «canasta».
// La preposición se recorta junto con el trozo: «quita el atún de este mes»
// tiene que dejar «el atún», no «el atún de».
const MES_DICHO = '(?:(?:de|del|para|en|durante|a)\\s+)?';
const REGLAS_CANASTA = [
  [new RegExp(`\\b${MES_DICHO}(?:la\\s+)?canasta\\s+base\\b`), 'base'],
  [/\b(?:todos\s+los\s+meses|cada\s+mes|siempre)\b/, 'base'],
  [new RegExp(`\\b${MES_DICHO}(?:el\\s+)?mes\\s+que\\s+viene\\b|\\b${MES_DICHO}proximo\\s+mes\\b|\\bmes\\s+entrante\\b`), 'mes-siguiente'],
  [/\b(?:en|para|de|del|a)\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/, 'mes-nombre'],
  [new RegExp(`\\b${MES_DICHO}(?:solo\\s+)?(?:este|ese)\\s+mes\\b`), 'mes-actual'],
  [new RegExp(`\\b${MES_DICHO}(?:la\\s+)?canasta(?:\\s+de(?:l)?(?:\\s+este)?\\s+mes)?\\b`), 'canasta'],
  [new RegExp(`\\b${MES_DICHO}(?:el\\s+)?mes\\b`), 'mes-actual']
];
function leerCanasta(texto, llano) {
  const limpio = recortarTrozos(texto, llano, REGLAS_CANASTA);
  let mes = null, base = false;
  for (const [efecto, encontrado] of limpio.efectos) {
    if (efecto === 'base') base = true;
    else if (efecto === 'mes-actual') mes = mes || mesActual();
    else if (efecto === 'mes-siguiente') mes = mes || mesSiguiente(mesActual());
    else if (efecto === 'mes-nombre') mes = mes || mesPorNombre(encontrado[1]);
  }
  // «a la canasta» a secas es la canasta base: es el hábito de la casa, que es
  // lo que la gente quiere decir cuando no nombra ningún mes.
  return { texto: limpio.texto, llano: limpio.llano, mes: base ? null : mes, base };
}

function periodoEscrito(llano) {
  const hoy = todayISO(), mes = hoy.slice(0, 7), limites = monthBounds(mes);
  if (/\bquincena\b/.test(llano)) {
    return Number(hoy.slice(8)) <= 15 ? { desde: `${mes}-01`, hasta: `${mes}-15` } : { desde: `${mes}-16`, hasta: limites.end };
  }
  if (/\b(?:esta|la|de\s+la)\s+semana\b/.test(llano)) { const inicio = weekStart(hoy); return { desde: inicio, hasta: addDays(inicio, 6) }; }
  if (/\beste\s+mes\b|\bdel\s+mes\b|\bpara\s+el\s+mes\b/.test(llano)) return { desde: limites.start, hasta: limites.end };
  const fecha = fechaEscrita(llano);
  if (fecha) return { desde: fecha, hasta: fecha };
  // Por defecto, de hoy a fin de mes: es el período que tiene sentido cuando
  // alguien pregunta «qué falta» sin decir para cuándo.
  return { desde: hoy, hasta: limites.end };
}

/* ── Los patrones ──────────────────────────────────────────────────────── */
//
// Cada patrón recibe el texto tal cual y su copia sin tildes, y devuelve o bien
// null (no es lo suyo), o bien `{ acciones }`, o bien `{ acciones, duda }`
// cuando reconoce la frase pero le falta un dato que no se puede adivinar.
// El orden importa: las preguntas van antes que las afirmaciones, porque
// «cuánto queda de arroz» lleva dentro «queda … arroz».

function reconocerMenu(texto, llano) {
  const pregunta = /^(?:¿\s*)?(?:dime\s+)?(?:que|cual\s+es\s+el\s+menu)\s+(?:se\s+)?(?:come|comemos|cocina|cocinamos|cocino|preparo|preparamos|cenamos|almorzamos|desayunamos|toca)\b/.test(llano)
    || /^(?:¿\s*)?que\s+hay\s+(?:para|de)\s+(?:comer|cenar|almorzar|desayunar|cena|almuerzo|desayuno)\b/.test(llano)
    || /^(?:ver\s+(?:el\s+)?)?menu\b/.test(llano);
  if (!pregunta) return null;
  const fecha = fechaEscrita(llano);
  return { acciones: [{ action: 'ver_menu', arguments: fecha ? { fecha } : {} }] };
}

function reconocerExistencias(texto, llano) {
  // «cuánto queda de arroz» y «cuánto arroz queda» son la misma pregunta dicha
  // en los dos órdenes en que se dice de verdad.
  const cola = llano.match(/^((?:¿\s*)?cuant[oa]s?\s+(?:me\s+|nos\s+)?(?:queda|quedan|tengo|tenemos|hay)\s+)(.+?)\s*\??$/);
  if (cola) {
    const alimento = sinArticulo(recorte(texto, cola[1].length, cola[2].length), cola[2]);
    return { acciones: [{ action: 'consultar_existencias', arguments: alimento.texto ? { producto: alimento.texto } : {} }] };
  }
  const medio = llano.match(/^((?:¿\s*)?cuant[oa]s?\s+)(.+?)(\s+(?:me\s+|nos\s+)?(?:queda|quedan|tengo|tenemos|hay)\s*\??)$/);
  if (medio) {
    const alimento = sinArticulo(recorte(texto, medio[1].length, medio[2].length), medio[2]);
    return { acciones: [{ action: 'consultar_existencias', arguments: alimento.texto ? { producto: alimento.texto } : {} }] };
  }
  if (/^(?:¿\s*)?(?:que|cuales)\s+(?:existencias|inventario)\b/.test(llano) || /^(?:¿\s*)?que\s+(?:hay|tengo|tenemos)\s+en\s+casa\b/.test(llano)) {
    return { acciones: [{ action: 'consultar_existencias', arguments: {} }] };
  }
  return null;
}

function reconocerLista(texto, llano) {
  const pregunta = /\bque\s+(?:me\s+|nos\s+)?(?:falta|faltan|hace\s+falta)\b/.test(llano)
    || /\bque\s+(?:hay|tengo|tenemos|debo|debemos)\s+(?:que\s+)?comprar\b/.test(llano)
    || /\blista\s+de\s+(?:la\s+)?compra\b|\blista\s+del?\s+mercado\b/.test(llano)
    || /^(?:¿\s*)?que\s+compr(?:o|amos)\b/.test(llano);
  if (!pregunta) return null;
  const periodo = periodoEscrito(llano);
  const base = /\bsegun\s+el\s+menu\b|\bdel\s+menu\b/.test(llano) ? 'menu' : null;
  return { acciones: [{ action: 'calcular_lista', arguments: { desde: periodo.desde, hasta: periodo.hasta, ...(base ? { base } : {}) } }] };
}

const VERBO_COMIDA = { cenar: 'cena', cena: 'cena', almorzar: 'almuerzo', almuerza: 'almuerzo', desayunar: 'desayuno', desayuna: 'desayuno' };
function reconocerAusencia(texto, llano) {
  const encontrado = llano.match(/^((?:¿\s*)?)(.{2,40}?)\s+no\s+(?:va\s+a\s+|van\s+a\s+)?(cenar|cena|almorzar|almuerza|desayunar|desayuna|come|comen|comera|comeran)\b(.*)$/);
  if (!encontrado) return null;
  const resto = encontrado[4] || '';
  const fecha = fechaEscrita(llano);
  // «no come arroz» es una restricción, no una ausencia. Para que sea ausencia
  // la frase tiene que decir dónde o cuándo: «en casa», o un día.
  if (!/\ben\s+casa\b/.test(resto) && !fecha) return null;
  const nombrado = resto.match(/\b(desayuno|almuerzo|cena)\b/);
  const comida = VERBO_COMIDA[encontrado[3]] || (nombrado ? nombrado[1] : null);
  const persona = recorte(texto, encontrado[1].length, encontrado[2].length);
  const argumentos = { persona, fecha: fecha || todayISO(), ...(comida ? { comida } : {}) };
  const accion = { action: 'registrar_ausencia', arguments: argumentos };
  // «no come en casa mañana» no dice qué comida, y las tres no son lo mismo:
  // se pregunta en vez de elegir una.
  if (comida) return { acciones: [accion] };
  return { acciones: [accion], duda: { pregunta: `¿En qué comida no come ${persona} en casa?`, campo: 'comida', opciones: SLOTS.map(slot => ({ id: slot, nombre: cap(slot) })) } };
}

function reconocerRestriccion(texto, llano) {
  const partido = llano.match(/^((?:¿\s*)?(?:a\s+)?)(.{2,40}?)\s+(?:no\s+puede\s+comer|no\s+come|no\s+le\s+cae\s+bien|es\s+alergic[oa]\s+a(?:l)?|tiene\s+alergia\s+a(?:l)?|no\s+le\s+damos)\s+(.+)$/);
  if (!partido) return null;
  const persona = recorte(texto, partido[1].length, partido[2].length);
  const alimento = sinArticulo(texto.slice(texto.length - partido[3].length), partido[3]);
  if (!persona || !alimento.texto) return null;
  return { acciones: [{ action: 'agregar_restriccion', arguments: { persona, alimento: alimento.texto } }] };
}

function reconocerRestante(texto, llano) {
  // «de los 30 plátanos quedan 12»: el primer número es lo que había y no hace
  // falta; lo que se registra es lo que queda.
  const comparada = llano.match(/^((?:de\s+)(?:l[oa]s\s+)?(?:[\d.,]+\s+)?)(.+?)\s+(?:me\s+|nos\s+)?qued[ao]n?\s+(.+)$/);
  if (comparada) {
    const queda = parseQuantity(comparada[3]);
    const alimento = sinArticulo(recorte(texto, comparada[1].length, comparada[2].length), comparada[2]);
    if (queda !== null && alimento.texto) return { acciones: [{ action: 'registrar_restante', arguments: { producto: alimento.texto, queda } }] };
  }
  // «quedan 3 latas de atún»: el resto de la frase ya es una línea de producto,
  // así que la lee el mismo intérprete que las listas dictadas.
  const suelta = llano.match(/^((?:¿\s*)?(?:solo\s+|ya\s+solo\s+)?(?:me\s+|nos\s+)?qued[ao]n?\s+)(.+)$/);
  if (!suelta) return null;
  const fila = parseLine(texto.slice(suelta[1].length));
  if (!fila || fila.quantity === null || fila.name.length <= 1) return null;
  return { acciones: [{ action: 'registrar_restante', arguments: { producto: fila.name, queda: fila.quantity } }] };
}

function reconocerQuitar(texto, llano) {
  const encontrado = llano.match(/^((?:¿\s*)?(?:quita(?:me|le)?|quitar|saca(?:me)?|sacar|elimina(?:me)?|eliminar|borra(?:me)?|no\s+compres|no\s+compremos|no\s+compramos|no\s+vamos\s+a\s+comprar|no\s+lleves|no\s+llevemos)\s+)(.+)$/);
  if (!encontrado) return null;
  const canasta = leerCanasta(texto.slice(encontrado[1].length), encontrado[2]);
  const alimento = sinArticulo(canasta.texto, canasta.llano);
  if (!alimento.texto) return null;
  // Quitar de la canasta base es otra cosa y no se hace por descuido: solo
  // cuando la frase dice «base». Adivinarlo al revés borraría el hábito de la
  // casa cuando alguien solo quería saltarse un mes.
  if (canasta.base) return { acciones: [{ action: 'quitar_de_base', arguments: { producto: alimento.texto } }] };
  return { acciones: [{ action: 'quitar_de_mes', arguments: { ...(canasta.mes ? { mes: canasta.mes } : {}), producto: alimento.texto } }] };
}

function reconocerArchivar(texto, llano) {
  const encontrado = llano.match(/^((?:¿\s*)?(?:archiva(?:me)?|archivar|guarda\s+en\s+archivo|da\s+de\s+baja\s+a?)\s+)(.+)$/);
  if (!encontrado) return null;
  const alimento = sinArticulo(recorte(texto, encontrado[1].length, encontrado[2].length), encontrado[2]);
  if (!alimento.texto) return null;
  return { acciones: [{ action: 'archivar_producto', arguments: { producto: alimento.texto } }] };
}

function reconocerCompra(texto, llano) {
  const encontrado = llano.match(/(?:^|\s)(?:acabo\s+de\s+comprar|compre|compro|compramos|compraron|compraste)\b/);
  if (!encontrado) return null;
  // Se le pasa la frase desde el verbo, porque parseProductText ya sabe que
  // «compré» es muletilla y no producto.
  const desde = encontrado.index + (encontrado[0].startsWith(' ') ? 1 : 0);
  const leido = parseProductText(texto.slice(desde));
  const lineas = leido.lines
    .filter(fila => !fila.negated && fila.name.length > 1 && fila.quantity !== null && fila.unit)
    .map(fila => ({ producto: fila.name, cantidad: fila.quantity, unidad: fila.unit }));
  if (!lineas.length) return null;
  const fecha = fechaEscrita(llano);
  return { acciones: [{ action: 'registrar_compra', arguments: { lineas, ...(fecha ? { fecha } : {}) } }] };
}

function reconocerCanasta(texto, llano) {
  // Se limpia primero lo que dice a qué canasta va, porque tanto «este mes pon
  // 40 lb de arroz» como «pon 40 lb de arroz este mes» son la misma frase.
  const canasta = leerCanasta(texto, llano);
  const encontrado = canasta.llano.match(/^((?:¿\s*)?(?:agrega(?:me|le)?|agregar|anade(?:me|le)?|anadir|pon(?:me|le)?|poner|mete(?:me)?|meter|suma(?:me)?|sumar|apunta(?:me)?|anota(?:me)?|incluye|necesito|necesitamos|compra(?:me)?|hay\s+que\s+comprar)\s+)(.+)$/);
  if (!encontrado) return null;
  const fila = parseLine(canasta.texto.slice(encontrado[1].length));
  if (!fila || fila.quantity === null || !fila.unit || fila.name.length <= 1) return null;
  const comun = { producto: fila.name, cantidad: fila.quantity, unidad: fila.unit };
  if (canasta.mes) return { acciones: [{ action: 'agregar_a_mes', arguments: { mes: canasta.mes, ...comun } }] };
  return { acciones: [{ action: 'agregar_a_base', arguments: comun }] };
}

const PATRONES = [
  reconocerMenu, reconocerExistencias, reconocerLista, reconocerAusencia, reconocerRestriccion,
  reconocerRestante, reconocerQuitar, reconocerArchivar, reconocerCompra, reconocerCanasta
];

// Exportado por el panel a través de `enviar`: devuelve `{ acciones, duda }` o
// null. Nunca inventa un nombre de acción: todas salen escritas de un patrón, y
// aun así se comprueban contra ACTION_NAMES antes de ejecutarse.
export function interpretar(texto) {
  const limpio = String(texto ?? '').trim();
  if (!limpio) return null;
  const llano = plano(limpio);
  for (const patron of PATRONES) {
    const leido = patron(limpio, llano);
    if (leido && leido.acciones?.length && leido.acciones.every(peticion => ACTION_NAMES.includes(peticion.action))) return leido;
  }
  return null;
}

/* ── Enseñar el resultado en español ───────────────────────────────────── */

const ESTADO_COMIDA = { outside: 'fuera de casa', order: 'pedir comida', unplanned: 'sin planificar', 'sin plan': 'todavía sin decidir' };
const cantidadTexto = (valor, unidad) => `${fmt(valor)} ${unitText(unidad, Number(valor))}`;
const lista = filas => filas.join('\n');

// El usuario nunca ve JSON. Cada consulta se cuenta con palabras; lo que no
// tenga forma conocida devuelve vacío y se queda con el resumen de la acción.
function describirResultado(accion, resultado, argumentos = {}) {
  if (!resultado) return '';
  if (accion === 'consultar_existencias') {
    if (Array.isArray(resultado)) {
      const conAlgo = resultado.filter(fila => Number(fila.cantidad) > 0);
      if (!conAlgo.length) return 'No hay existencias anotadas todavía.';
      const filas = conAlgo.slice(0, 15).map(fila => `• ${fila.nombre}: ${cantidadTexto(fila.cantidad, fila.unidad)}`);
      return lista([...filas, conAlgo.length > 15 ? `y ${conAlgo.length - 15} alimento(s) más.` : '']).trim();
    }
    return `De ${resultado.nombre} ${Number(resultado.cantidad) === 1 ? 'queda' : 'quedan'} ${cantidadTexto(resultado.cantidad, resultado.unidad)}.`;
  }
  if (accion === 'calcular_lista') {
    // El período se dice siempre, porque la lista depende entera de él y quien
    // pregunta «qué falta» no escribió ninguna fecha.
    const corto = { day: 'numeric', month: 'long' };
    const periodo = argumentos.desde && argumentos.hasta ? `Del ${niceDate(argumentos.desde, corto)} al ${niceDate(argumentos.hasta, corto)}` : 'En ese período';
    const filas = resultado.lineas || [];
    if (!filas.length) return `${periodo} no hace falta comprar nada: alcanza con lo que hay en casa.`;
    const texto = filas.slice(0, 25).map(fila => fila.porComprar === null
      ? `• ${fila.nombre}: falta la equivalencia para saber cuánto comprar.`
      : `• ${cantidadTexto(fila.porComprar, fila.unidad)} de ${fila.nombre}. ${fila.porque}`);
    const cola = resultado.pendientes ? `\n${resultado.pendientes} alimento(s) esperan una equivalencia; complétala en su ficha.` : '';
    return `${periodo} hace falta comprar:\n${lista(texto)}${filas.length > 25 ? `\ny ${filas.length - 25} más.` : ''}${cola}`;
  }
  if (accion === 'ver_menu' && Array.isArray(resultado)) {
    return lista(resultado.map(fila => `${cap(fila.comida)}: ${fila.titulo || ESTADO_COMIDA[fila.estado] || fila.estado}`));
  }
  if ((accion === 'ver_canasta_base' || accion === 'ver_canasta_mes') && Array.isArray(resultado)) {
    if (!resultado.length) return 'Esa canasta está vacía.';
    return lista(resultado.slice(0, 30).map(fila => `• ${cantidadTexto(fila.cantidad, fila.unidad)} de ${fila.nombre}`));
  }
  if (accion === 'listar_productos' && Array.isArray(resultado)) {
    if (!resultado.length) return 'Todavía no hay alimentos en el catálogo.';
    return `Alimentos: ${resultado.slice(0, 40).map(fila => fila.nombre).join(', ')}${resultado.length > 40 ? ` y ${resultado.length - 40} más` : ''}.`;
  }
  if (accion === 'buscar_producto') {
    if (resultado.encontrado) return `Sí, «${resultado.encontrado.nombre}» está en el catálogo.`;
    if (resultado.parecidos?.length) return `No lo encontré. Parecidos: ${resultado.parecidos.map(fila => fila.nombre).join(', ')}.`;
    return 'No encontré nada parecido en el catálogo.';
  }
  if (accion === 'comparar_mes_con_base') {
    const partes = [];
    if (resultado.agregados?.length) partes.push(`De más: ${resultado.agregados.join(', ')}.`);
    if (resultado.quitados?.length) partes.push(`De menos: ${resultado.quitados.join(', ')}.`);
    if (resultado.cambiados?.length) partes.push(`Cambiados: ${resultado.cambiados.map(fila => `${fila.nombre} (${fmt(fila.mes)} en vez de ${fmt(fila.base)} ${fila.unidad})`).join(', ')}.`);
    return partes.length ? lista(partes) : 'Ese mes es igual que la canasta base.';
  }
  return '';
}

// `results` llega en el mismo orden en que se pidieron las acciones, así que
// cada resultado se cuenta con los argumentos que lo produjeron.
function resumenLegible(acciones, resultado) {
  const partes = (resultado.results || []).map((fila, indice) => describirResultado(fila.action, fila.result, acciones[indice]?.arguments || {})).filter(Boolean);
  if (acciones.every(peticion => isQuery(peticion.action))) return partes.join('\n\n') || 'No encontré nada que enseñarte.';
  return [resultado.summary, ...partes].filter(Boolean).join('\n\n');
}

/* ── Ejecutar ──────────────────────────────────────────────────────────── */

// Qué argumentos acepta cada acción, sacado de la misma tabla que valida. Sirve
// para contestar una pregunta —«¿cuál de estos arroces?»— poniendo la respuesta
// en las acciones que de verdad tienen ese campo, sin tocar las demás.
// La forma es la del contrato de docs/backend.md —nombre, descripcion,
// parametros— porque es la misma lista que se le manda al backend.
const CAMPOS = new Map(toolSchemas().map(herramienta => [herramienta.nombre, Object.keys(herramienta.parametros.properties)]));

function ejecutar(ctx, acciones, requestId, confirmado = false) {
  const chat = chatDe(ctx);
  const seguras = acciones.filter(peticion => ACTION_NAMES.includes(peticion.action));
  if (!seguras.length) { decir(chat, 'app', 'Eso no es algo que esta app sepa hacer.'); ctx.render(); return; }
  let resultado;
  try { resultado = runActions(ctx.state, seguras, { requestId, confirmed: confirmado }); }
  catch (error) { chat.pendiente = null; decir(chat, 'app', `No pude hacerlo: ${error.message}`); ctx.render(); return; }

  if (!resultado.ok && resultado.needsConfirmation) {
    // Lo sensible se enseña entero y en español antes de tocar nada. El mismo
    // requestId viaja con lo pendiente: es lo que impide que confirmar dos
    // veces registre la compra dos veces.
    chat.pendiente = { tipo: 'confirmar', acciones: seguras, requestId, preview: resultado.preview || [] };
    ctx.render();
    return;
  }
  const duda = resultado.questions?.[0];
  if (!resultado.ok && (duda || resultado.question)) {
    chat.pendiente = {
      tipo: 'pregunta', acciones: seguras, requestId,
      pregunta: duda?.pregunta || resultado.question,
      // Sin campo no hay forma de reintentar sola la respuesta, así que las
      // opciones se enseñan como texto y no como botones que no harían nada.
      campo: duda?.campo || null,
      opciones: duda?.opciones || resultado.options || []
    };
    ctx.render();
    return;
  }
  if (!resultado.ok) {
    chat.pendiente = null;
    decir(chat, 'app', (resultado.errors || []).join(' ') || resultado.summary || 'No pude hacerlo.');
    ctx.render();
    return;
  }

  chat.pendiente = null;
  if (resultado.repeated) { decir(chat, 'app', 'Eso ya estaba hecho: no lo repetí.'); ctx.render(); return; }
  const mensaje = decir(chat, 'app', resumenLegible(seguras, resultado), { resumen: resultado.summary });
  // Deshacer devuelve el estado entero a como estaba, así que solo se ofrece
  // sobre el último cambio: un botón viejo se llevaría por delante lo que se
  // hizo después.
  chat.deshacer = resultado.undo ? { estado: resultado.undo, mensaje: mensaje.id, resumen: resultado.summary } : null;
  if (seguras.every(peticion => isQuery(peticion.action))) ctx.render();
  else ctx.commit(resultado.summary);
}

/* ── Salir de casa: solo cuando hace falta y con permiso ───────────────── */

// Lo único que sale del dispositivo. Nombres para entender la frase y el mes
// para situarla; ni existencias, ni compras, ni revisiones, ni el estado
// entero. Si mañana hace falta algo más, se añade aquí y se explica por qué.
function contextoMinimo(state) {
  return {
    mes: mesActual(),
    alimentos: (state.products || []).filter(item => !item.archived).map(item => item.name),
    personas: (state.people || []).map(item => item.name),
    preparaciones: (state.recipes || []).map(item => item.name)
  };
}

// La conversación como la espera el backend: la persona es «persona» y el panel
// «asistente», y tiene que empezar por la persona.
function conversacionPara(chat) {
  const filas = chat.mensajes
    .filter(mensaje => mensaje.texto)
    .slice(-12)
    .map(mensaje => ({ rol: mensaje.quien === 'persona' ? 'persona' : 'asistente', contenido: mensaje.texto }));
  while (filas.length && filas[0].rol !== 'persona') filas.shift();
  return filas;
}

function sugerirFormulario(llano) {
  if (/\bcompr/.test(llano)) return { etiqueta: 'Anotar una compra', accion: 'open-purchase', datos: { goto: 'compras' } };
  if (/\bqueda|\bconsum|\brevis/.test(llano)) return { etiqueta: 'Abrir una revisión', accion: 'open-new-review', datos: { goto: 'revision' } };
  if (/\bno\s+(?:puede|come|cena|almuerza|desayuna)\b|\bpersona\b/.test(llano)) return { etiqueta: 'Editar una persona', accion: 'open-person' };
  if (/\bcanasta\b|\bmes\b/.test(llano)) return { etiqueta: 'Abrir la canasta del mes', accion: 'open-basket', datos: { goto: 'compras' } };
  return { etiqueta: 'Registrar un alimento', accion: 'open-product' };
}

function responderSinEntender(ctx, texto) {
  const chat = chatDe(ctx);
  const llano = plano(texto);
  decir(chat, 'app', [
    'No entendí esa frase. Sin servicio configurado solo reconozco algunas maneras de decir las cosas:',
    '«compré 2 lb de arroz», «quedan 3 latas de atún», «agrega 5 lb de arroz a la canasta»,',
    '«Sofía no puede comer maní», «qué falta comprar», «qué se cocina hoy», «cuánto queda de arroz».'
  ].join(' '), { acciones: [{ etiqueta: 'Escribir varios productos de corrido', accion: 'open-bulk' }, sugerirFormulario(llano)] });
  ctx.render();
}

async function preguntarAlServicio(ctx, texto, requestId) {
  const chat = chatDe(ctx);
  chat.enviando = true;
  chat.error = '';
  chat.errorTitulo = '';
  ctx.render();
  let respuesta;
  try {
    respuesta = await callProvider('chat', { mensajes: conversacionPara(chat), herramientas: toolSchemas(), contexto: contextoMinimo(ctx.state) });
  } catch {
    // callProvider promete no lanzar por red, pero si algo se rompe aquí el
    // borrador no se pierde: vuelve al campo tal como se escribió.
    respuesta = { ok: false, error: 'No se pudo hablar con el servicio.' };
  }
  chat.enviando = false;
  if (!respuesta.ok) {
    chat.error = respuesta.error || 'No se pudo hablar con el servicio.';
    chat.borrador = texto;
    ctx.render();
    return;
  }
  const dicho = String(respuesta.data?.respuesta || '').trim();
  if (dicho) decir(chat, 'app', dicho);
  const acciones = (Array.isArray(respuesta.data?.acciones) ? respuesta.data.acciones : [])
    .filter(peticion => peticion && ACTION_NAMES.includes(peticion.action))
    .map(peticion => ({ action: peticion.action, arguments: peticion.arguments && typeof peticion.arguments === 'object' ? peticion.arguments : {} }));
  if (!acciones.length) {
    if (!dicho) decir(chat, 'app', 'El servicio respondió, pero sin nada que hacer.');
    ctx.render();
    return;
  }
  ejecutar(ctx, acciones, requestId);
}

function enviar(ctx, texto, requestId) {
  const chat = chatDe(ctx);
  const leido = interpretar(texto);
  if (leido) {
    if (leido.duda) {
      chat.pendiente = { tipo: 'pregunta', acciones: leido.acciones, requestId, pregunta: leido.duda.pregunta, campo: leido.duda.campo, opciones: leido.duda.opciones };
      ctx.render();
      return;
    }
    ejecutar(ctx, leido.acciones, requestId);
    return;
  }
  if (!isConfigured('chat')) { responderSinEntender(ctx, texto); return; }
  // Nada sale del dispositivo sin que se diga con todas las letras qué sale y
  // sin que la persona lo autorice. Una vez por sesión, no una vez y para
  // siempre: al recargar la app se vuelve a preguntar.
  if (!permisoDeEnvio) {
    chat.pendiente = { tipo: 'aviso', texto, requestId };
    ctx.render();
    return;
  }
  return preguntarAlServicio(ctx, texto, requestId);
}

/* ── Dibujo ────────────────────────────────────────────────────────────── */

const EJEMPLOS = ['Compré 2 lb de arroz y 3 latas de atún', '¿Qué falta comprar?', '¿Qué se cocina hoy?', 'Quedan 4 latas de atún'];
const atributos = datos => Object.entries(datos || {}).map(([clave, valor]) => `data-${esc(clave)}="${esc(valor)}"`).join(' ');

function dibujarMensaje(chat, mensaje, orden) {
  const botones = (mensaje.acciones || []).map(accion => button(esc(accion.etiqueta), accion.accion, 'btn-secondary btn-small', atributos(accion.datos))).join('');
  const deshacer = chat.deshacer?.mensaje === mensaje.id ? button('↺ Deshacer', 'chat-deshacer', 'btn-quiet btn-small') : '';
  return `<div class="chat-fila ${mensaje.quien === 'persona' ? 'mia' : 'suya'}" style="order:${orden}">
    <p class="chat-burbuja">${esc(mensaje.texto)}</p>
    ${botones || deshacer ? `<div class="chat-botones">${botones}${deshacer}</div>` : ''}
  </div>`;
}

function dibujarPendiente(pendiente) {
  if (!pendiente) return '';
  if (pendiente.tipo === 'aviso') {
    return `<div class="chat-aviso">${notice(esc(AVISO_ENVIO.chat.titulo), esc(AVISO_ENVIO.chat.detalle), 'warn')}
      <div class="chat-botones">${button(esc(AVISO_ENVIO.chat.confirmar), 'chat-permiso-si', 'btn-primary btn-small')}${button(esc(AVISO_ENVIO.chat.cancelar), 'chat-permiso-no', 'btn-secondary btn-small')}</div></div>`;
  }
  if (pendiente.tipo === 'confirmar') {
    return `<div class="chat-aparte chat-confirma">
      <p class="chat-titulin">Esto cambia tus datos. ¿Lo hago?</p>
      <ul class="chat-previa">${(pendiente.preview || []).map(linea => `<li>${esc(linea)}</li>`).join('')}</ul>
      <div class="chat-botones">${button('Confirmar', 'chat-confirmar', 'btn-primary btn-small')}${button('Cancelar', 'chat-cancelar', 'btn-secondary btn-small')}</div></div>`;
  }
  const opciones = pendiente.opciones || [];
  const elegibles = pendiente.campo && opciones.length;
  return `<div class="chat-aparte chat-duda">
    <p class="chat-titulin">${esc(pendiente.pregunta || '¿Cuál de estos?')}</p>
    ${elegibles
      ? `<div class="chat-botones">${opciones.map(opcion => button(esc(opcion.nombre ?? opcion.id), 'chat-opcion', 'btn-secondary btn-small', `data-id="${esc(opcion.id)}" data-nombre="${esc(opcion.nombre ?? opcion.id)}"`)).join('')}${button('Cancelar', 'chat-cancelar', 'btn-quiet btn-small')}</div>`
      : `${opciones.length ? `<p class="chat-nota">${esc(opciones.map(opcion => opcion.nombre ?? opcion.id).join(', '))}</p>` : ''}<div class="chat-botones">${button('Entendido', 'chat-cancelar', 'btn-secondary btn-small')}</div>`}
  </div>`;
}

function dibujarEstado(chat) {
  const partes = [];
  if (chat.escuchando) {
    // `role="status"` para que quien navega escuchando se entere de que el
    // micrófono está abierto: sin eso, el indicador solo existe para quien mira.
    partes.push(`<div class="chat-aparte chat-estado escuchando" role="status" aria-live="polite"><span class="chat-onda" aria-hidden="true"></span>
      <span>Escuchando… habla y después revisa lo que quedó escrito.</span>${button('Parar', 'chat-parar', 'btn-quiet btn-small')}</div>`);
  }
  if (chat.enviando) {
    partes.push(`<div class="chat-aparte chat-estado pensando"><span class="chat-puntos" aria-hidden="true"><i></i><i></i><i></i></span><span>Pensando…</span></div>`);
  }
  // La pista es para lo que quedó a medias: se dice, pero sin el recuadro rojo
  // de un error, porque el texto sí llegó y sí sirve.
  if (chat.pista) partes.push(`<p class="chat-pista-suave">${esc(chat.pista)}</p>`);
  if (chat.error) partes.push(`<div class="chat-aviso">${notice(esc(chat.errorTitulo || 'No se pudo enviar'), esc(chat.error), 'error')}</div>`);
  return partes.join('');
}

export function renderChat(ctx) {
  const chat = chatDe(ctx);
  const mensajes = chat.mensajes.map((mensaje, indice) => dibujarMensaje(chat, mensaje, -indice)).join('');
  const vacio = `<div class="chat-vacio" style="order:1">
    <p>Escribe lo que pasó en la cocina y yo lo anoto. Antes de tocar tus existencias te enseño qué voy a hacer.</p>
    <div class="chat-chips">${EJEMPLOS.map(frase => `<button type="button" class="chat-chip" data-action="chat-sugerencia" data-texto="${esc(frase)}">${esc(frase)}</button>`).join('')}</div>
  </div>`;
  // El pie va con el orden más bajo para quedar siempre debajo del último
  // mensaje, sin importar cuántos haya.
  const pie = `<div class="chat-pie" style="order:-9999">${dibujarPendiente(chat.pendiente)}${dibujarEstado(chat)}</div>`;
  // Quién puede escuchar lo decide device.js, que ya elige entre el motor del
  // teléfono y el del navegador. Aquí solo se pregunta si hay alguno: repetir
  // esa decisión sería tener dos versiones de la misma verdad.
  const motor = capacidad('dictar');
  const dictado = motor.ok
    ? (chat.escuchando
      ? `<button type="button" class="chat-icono escuchando" data-action="chat-parar" aria-label="Dejar de escuchar">■</button>`
      : `<button type="button" class="chat-icono" data-action="chat-escuchar" aria-label="Dictar el mensaje">🎤</button>`)
    : '';
  return `<div class="chat-scrim" data-overlay data-action="chat-cerrar" aria-hidden="true"></div>
  <aside class="chat-panel" role="dialog" aria-modal="true" aria-label="Asistente de la casa">
    <header class="chat-head">
      <div><strong>Asistente</strong><span>Entiende frases sueltas; lo que cambie tus datos te lo pregunta antes.</span></div>
      <div class="chat-head-botones">${chat.mensajes.length ? button('Limpiar', 'chat-limpiar', 'btn-quiet btn-small') : ''}<button type="button" class="icon-btn" data-action="chat-cerrar" aria-label="Cerrar el asistente">×</button></div>
    </header>
    <div class="chat-mensajes" role="log" aria-live="polite">${pie}${mensajes}${chat.mensajes.length ? '' : vacio}</div>
    <form class="chat-escribe" data-form="chat" autocomplete="off">
      <label class="chat-oculto" for="chat-texto">Escribe tu mensaje</label>
      <input class="chat-campo" id="chat-texto" name="mensaje" type="text" value="${esc(chat.borrador || '')}"
        placeholder="Ej. compré 2 lb de arroz" enterkeyhint="send" autocomplete="off" autocapitalize="sentences">
      ${dictado}
      <button type="submit" class="chat-icono chat-enviar" aria-label="Enviar el mensaje">↑</button>
    </form>
    ${motor.ok ? '' : `<p class="chat-pista">${esc(motor.detalle)} Tócalo y habla: escribe en este campo igual que el teclado.</p>`}
  </aside>`;
}

/* ── Acciones del panel ────────────────────────────────────────────────── */

// El aviso del motor del navegador. Se dice entero: «pasa por sus servidores»
// es exactamente lo que pasa, y quien lo lee tiene que poder decidir si prefiere
// escribir. En la aplicación de Android no aparece nunca.
const AVISO_VOZ_AJENA = 'Aviso: aquí el dictado lo hace el navegador, así que tu voz sí sale hacia sus servidores. En la aplicación de Android la escucha el propio teléfono y no sale del aparato.';

export const CHAT_ACTIONS = {
  // Cerrar el panel cierra también el micrófono: dejarlo abierto detrás de una
  // pantalla cerrada es lo último que debe hacer una app con el micrófono.
  'chat-cerrar': (el, ctx) => { guardarBorrador(ctx); callarMicrofono(chatDe(ctx)); ctx.closeModal?.(); },
  'chat-limpiar': (el, ctx) => {
    const chat = chatDe(ctx);
    guardarBorrador(ctx);
    chat.mensajes = []; chat.pendiente = null; chat.deshacer = null; chat.error = ''; chat.errorTitulo = ''; chat.pista = '';
    ctx.render();
  },
  'chat-sugerencia': (el, ctx) => { chatDe(ctx).borrador = el.dataset.texto || ''; ctx.render(); },
  'chat-confirmar': (el, ctx) => {
    const chat = chatDe(ctx);
    const pendiente = chat.pendiente;
    if (pendiente?.tipo !== 'confirmar') return;
    guardarBorrador(ctx);
    chat.pendiente = null;
    ejecutar(ctx, pendiente.acciones, pendiente.requestId, true);
  },
  'chat-cancelar': (el, ctx) => {
    const chat = chatDe(ctx);
    if (!chat.pendiente) return;
    guardarBorrador(ctx);
    const era = chat.pendiente.tipo;
    chat.pendiente = null;
    if (era === 'confirmar') decir(chat, 'app', 'Lo dejé como estaba: no cambié nada.');
    ctx.render();
  },
  'chat-opcion': (el, ctx) => {
    const chat = chatDe(ctx);
    const pendiente = chat.pendiente;
    if (pendiente?.tipo !== 'pregunta' || !pendiente.campo) return;
    guardarBorrador(ctx);
    const campo = pendiente.campo, valor = el.dataset.id;
    // La respuesta se pone en las acciones que de verdad tienen ese campo, no
    // en todas: un grupo puede traer una consulta que no lo acepta.
    const acciones = pendiente.acciones.map(peticion => (CAMPOS.get(peticion.action) || []).includes(campo)
      ? { ...peticion, arguments: { ...peticion.arguments, [campo]: valor } }
      : peticion);
    chat.pendiente = null;
    decir(chat, 'persona', el.dataset.nombre || valor);
    // Se reutiliza el mismo requestId, pero sin dar por confirmado: una acción
    // sensible sigue teniendo que enseñarse antes de ejecutarse.
    ejecutar(ctx, acciones, pendiente.requestId);
  },
  'chat-deshacer': (el, ctx) => {
    const chat = chatDe(ctx);
    if (!chat.deshacer) return;
    guardarBorrador(ctx);
    try { undoTo(ctx.state, chat.deshacer.estado); }
    catch (error) { chat.error = error.message; ctx.render(); return; }
    chat.deshacer = null;
    chat.pendiente = null;
    decir(chat, 'app', 'Listo, lo dejé como estaba antes.');
    ctx.commit('Se deshizo el último cambio.');
  },
  'chat-permiso-si': (el, ctx) => {
    const chat = chatDe(ctx);
    const pendiente = chat.pendiente;
    if (pendiente?.tipo !== 'aviso') return;
    guardarBorrador(ctx);
    permisoDeEnvio = true;
    chat.pendiente = null;
    return preguntarAlServicio(ctx, pendiente.texto, pendiente.requestId);
  },
  'chat-permiso-no': (el, ctx) => {
    const chat = chatDe(ctx);
    const pendiente = chat.pendiente;
    if (pendiente?.tipo !== 'aviso') return;
    // Lo escrito no se pierde por decir que no: vuelve al campo para poder
    // cambiarlo o pasarlo a un formulario.
    chat.borrador = pendiente.texto;
    chat.pendiente = null;
    decir(chat, 'app', 'No lo envié. Ahí lo dejé escrito por si quieres cambiarlo o anotarlo a mano.');
    ctx.render();
  },
  'chat-escuchar': async (el, ctx) => {
    const chat = chatDe(ctx);
    guardarBorrador(ctx);
    const motor = capacidad('dictar');
    if (!motor.ok) { avisarDeVoz(chat, 'No se puede dictar aquí', motor.detalle); ctx.render(); return; }
    if (motor.origen === 'navegador' && !avisadoDeVozAjena) { avisadoDeVozAjena = true; decir(chat, 'app', AVISO_VOZ_AJENA); }
    // Lo que ya estuviera escrito es el punto de partida, no algo que se pisa.
    const base = chat.borrador || '';
    const sesion = ++dictadoActual;
    chat.escuchando = true;
    chat.error = '';
    chat.errorTitulo = '';
    chat.pista = '';
    ctx.render();
    const oido = await dictar({
      onParcial: trozo => {
        if (sesion !== dictadoActual) return;
        chat.borrador = juntar(base, trozo);
        // El parcial se escribe en el campo vivo en vez de redibujar el panel
        // entero: un redibujo por palabra parpadea y le roba el foco al campo.
        const campo = campoDelChat();
        if (campo) campo.value = chat.borrador;
      }
    });
    if (sesion !== dictadoActual) return;
    chat.escuchando = false;
    if (oido.ok) {
      chat.borrador = juntar(base, oido.texto);
      // `parcial` es lo que alcanzó a oír antes de cortarse. Se usa igual —tirarlo
      // obligaría a repetir la frase entera— pero se dice que quedó a medias.
      chat.pista = oido.parcial ? 'Eso fue lo que alcancé a oír antes de que se cortara: míralo antes de enviarlo.' : '';
    } else {
      // Un fallo del micrófono no borra nada: lo que se oyó a medias sigue en el
      // campo, y el motivo viene de device.js ya escrito en español.
      avisarDeVoz(chat, 'No se pudo dictar', oido.error);
    }
    // Y termina aquí a propósito: no se envía ni se ejecuta nada. El texto queda
    // en el campo para leerlo y corregirlo, porque un «compré diez» oído como
    // «compré cien» movería el inventario sin que nadie lo hubiera visto.
    ctx.render();
    const campo = campoDelChat();
    // El foco vuelve al campo con el cursor al final: lo siguiente que toca es
    // repasar lo dictado, y así se corrige sin buscar dónde tocar.
    if (campo) { campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length); }
  },
  'chat-parar': (el, ctx) => {
    const chat = chatDe(ctx);
    // Parar solo cierra el micrófono. Lo que se oyó hasta ahí lo devuelve
    // `dictar` al resolverse y se queda escrito: parar no es cancelar.
    guardarBorrador(ctx);
    pararDictado();
    chat.escuchando = false;
    ctx.render();
  }
};

function avisarDeVoz(chat, titulo, detalle) {
  chat.errorTitulo = titulo;
  chat.error = detalle;
  chat.escuchando = false;
}

// Cierra el micrófono y da por vencido el dictado en curso: lo que llegue
// después ya no tiene dónde escribirse sin pisar lo que la persona hizo luego.
function callarMicrofono(chat) {
  if (!chat.escuchando) return;
  dictadoActual += 1;
  pararDictado();
  chat.escuchando = false;
}

/* ── Envío del formulario ──────────────────────────────────────────────── */

const AFIRMA = /^(?:si|sip|claro|dale|ok|okey|correcto|confirmo|confirma|confirmalo|hazlo|adelante|exacto|asi es|eso es)\b/;
const NIEGA = /^(?:no|nop|cancela|cancelar|mejor no|dejalo|olvidalo|para)\b/;

export const CHAT_FORMS = {
  chat: (form, data, ctx) => {
    const chat = chatDe(ctx);
    const texto = String(valorDe(data, 'mensaje', form) ?? '').trim();
    // Enviar cierra el micrófono: lo que llegara tarde volvería a llenar un
    // campo que la persona acaba de vaciar al enviar.
    callarMicrofono(chat);
    chat.error = '';
    chat.errorTitulo = '';
    chat.pista = '';
    chat.borrador = '';
    if (!texto) { ctx.render(); return; }
    const llano = plano(texto);
    // Quien está mirando una confirmación y escribe «sí» está contestando a la
    // confirmación, no empezando otra cosa.
    if (chat.pendiente?.tipo === 'confirmar' && (AFIRMA.test(llano) || NIEGA.test(llano))) {
      const pendiente = chat.pendiente;
      decir(chat, 'persona', texto);
      chat.pendiente = null;
      if (NIEGA.test(llano)) { decir(chat, 'app', 'Lo dejé como estaba: no cambié nada.'); ctx.render(); return; }
      ejecutar(ctx, pendiente.acciones, pendiente.requestId, true);
      return;
    }
    // Un mensaje nuevo reemplaza la duda anterior: dejarla viva confundiría
    // qué se está confirmando.
    chat.pendiente = null;
    decir(chat, 'persona', texto);
    return enviar(ctx, texto, nuevoIdentificador());
  }
};
