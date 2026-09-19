// «Compramos 30 plátanos maduros, 10 libras de arroz y detergente» es como se
// dicta la compra en una cocina, no en un formulario. Este módulo traduce esa
// frase a filas sin preguntarle nada a nadie y sin salir a internet: la app
// tiene que seguir sirviendo en una casa sin datos, y ningún servicio caído
// puede dejar a la familia sin su lista. Por eso todo aquí es determinista: el
// mismo texto da siempre las mismas filas.
//
// Regla de la casa ante la duda: ni se inventa ni se descarta. Lo que no se
// entendió queda anotado en `pending` y la fila se conserva igual, porque
// perder el producto es mucho peor que dejar un hueco que se llena en un toque.

// Decidir si dos nombres son el mismo alimento se hace en un solo sitio, y ese
// sitio es `nombres.js`. Este módulo se limita a leer palabras; que además
// tuviera su propia idea del plural español era pedir que un día discreparan.
import { normalizeName, palabras, plano, presentar } from './nombres.js';
export { normalizeName };

// Las unidades del modelo, copiadas a propósito en vez de importadas: este
// módulo es puro —solo texto— y arrastrar model.js metería el estado de la casa
// en algo que únicamente lee palabras.
export const UNITS = ['unidad', 'lb', 'taza', 'lata', 'paquete', 'rueda', 'rebanada'];

const round = value => Math.round((value + Number.EPSILON) * 1000) / 1000;
// Las frases se guardan escritas y se parten aquí para poder leerlas de un
// vistazo arriba. Las más largas primero: «no compramos» tiene que ganarle a
// «no», o se quedaría a medias.
const frases = lista => lista.map(frase => frase.split(' ')).sort((a, b) => b.length - a.length);

const NUMEROS = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100, ciento: 100
};
const PARTES = { medio: 0.5, media: 0.5, medios: 0.5, medias: 0.5, mitad: 0.5, cuarto: 0.25, cuartos: 0.25 };
const DIGITOS = /^\d+(?:[.,]\d+)?$/;
const QUEBRADO = /^(\d+)\/(\d+)$/;
const DOCENA = /^docenas?$/;

// Lee la cantidad que abre el texto y dice cuántas fichas se comió, que es lo
// que necesita el resto del parser para saber dónde empieza el nombre.
function leerCantidad(fichas) {
  const primera = fichas[0] || '';
  let valor = null, usadas = 1, deducida = true;
  if (DIGITOS.test(primera)) { valor = Number(primera.replace(',', '.')); deducida = false; }
  else if (QUEBRADO.test(primera)) { const [, arriba, abajo] = primera.match(QUEBRADO); valor = Number(arriba) / Number(abajo); }
  else if (primera in NUMEROS) valor = NUMEROS[primera];
  else if (primera in PARTES) valor = PARTES[primera];
  else if (DOCENA.test(primera)) { valor = 1; usadas = 0; }
  else return { value: null, used: 0, deduced: false, docena: false };
  // «un cuarto» es un cuarto, no un uno seguido de vaya a saber qué.
  if ((primera === 'un' || primera === 'una') && fichas[1] in PARTES) { valor = PARTES[fichas[1]]; usadas = 2; }
  // «dos y medio»: esta «y» une un número con su fracción, no dos productos.
  else if (fichas[usadas] === 'y' && fichas[usadas + 1] in PARTES) { valor += PARTES[fichas[usadas + 1]]; usadas += 2; deducida = true; }
  // Una docena no es una unidad de medida: es un doce escrito en una palabra.
  const docena = DOCENA.test(fichas[usadas] || '');
  if (docena) { valor *= 12; usadas += 1; }
  return { value: round(valor), used: usadas, deduced: deducida || docena, docena };
}

// Solo mira el principio del texto, que es donde se dice la cantidad al hablar
// («30 huevos», nunca «huevos 30»). Devuelve null cuando no hay ninguna.
export const parseQuantity = texto => leerCantidad(palabras(plano(texto))).value;

const UNIDADES = {
  libra: 'lb', libras: 'lb', lb: 'lb', lbs: 'lb',
  unidad: 'unidad', unidades: 'unidad', und: 'unidad', u: 'unidad',
  lata: 'lata', latas: 'lata', enlatado: 'lata', enlatados: 'lata',
  paquete: 'paquete', paquetes: 'paquete', funda: 'paquete', fundas: 'paquete', bolsa: 'paquete',
  bolsas: 'paquete', caja: 'paquete', cajas: 'paquete', pack: 'paquete', packs: 'paquete',
  taza: 'taza', tazas: 'taza',
  rueda: 'rueda', ruedas: 'rueda', rodaja: 'rueda', rodajas: 'rueda',
  rebanada: 'rebanada', rebanadas: 'rebanada', lonja: 'rebanada', lonjas: 'rebanada', tajada: 'rebanada', tajadas: 'rebanada'
};
// El colmado vende en kilos y el modelo controla en libras. Convertir y avisar
// es distinto de inventar: el número sale de una equivalencia fija, pero quien
// lee la fila tiene derecho a saber que no escribió eso.
const PESOS = {
  kilo: 2.20462, kilos: 2.20462, kg: 2.20462, kgs: 2.20462, kilogramo: 2.20462, kilogramos: 2.20462,
  gramo: 0.00220462, gramos: 0.00220462, g: 0.00220462, gr: 0.00220462, grs: 0.00220462,
  onza: 0.0625, onzas: 0.0625, oz: 0.0625
};

// Lo que se dice antes de nombrar el producto y no aporta nada a la fila.
const MULETILLAS = frases([
  'hay que comprar', 'para este mes', 'para el mes', 'este mes', 'del mes', 'hace falta',
  'compramos', 'compremos', 'compre', 'compro', 'compra', 'comprar', 'agregame', 'agregar', 'agrega',
  'anademe', 'anadir', 'anade', 'ponme', 'poner', 'pon', 'necesitamos', 'necesito', 'falta',
  'tambien', 'ademas', 'que', 'y', 'e'
]);
// Quien dicta también dice lo que NO quiere. Esa fila se conserva marcada: la
// pantalla necesita saber que ese alimento se mencionó para quitarlo.
const NEGACIONES = frases([
  'no vamos a comprar', 'no hay que comprar', 'no vamos a llevar', 'no compramos', 'no compremos',
  'no compres', 'no comprar', 'nada de', 'quitale', 'quitar', 'quita', 'sacar', 'saca',
  'eliminar', 'elimina', 'sin', 'no'
]);
// «un» y «una» no están: ahí son la cantidad, no un artículo.
const ARTICULOS = frases(['de la', 'de los', 'de las', 'del', 'de', 'el', 'la', 'los', 'las', 'unos', 'unas']);

function saltarPrefijos(fichas, prefijos, desde) {
  let i = desde;
  for (let sigue = true; sigue;) {
    sigue = false;
    for (const frase of prefijos) if (frase.every((palabra, n) => fichas[i + n] === palabra)) { i += frase.length; sigue = true; break; }
  }
  return i;
}

// Lee un solo fragmento ya separado. Devuelve null cuando después de limpiar no
// quedó nada: un «compramos» suelto no es un producto.
export function parseLine(texto) {
  const raw = String(texto ?? '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const originales = palabras(raw);
  const fichas = originales.map(plano);
  const trasMuletillas = saltarPrefijos(fichas, MULETILLAS, 0);
  const trasNegacion = saltarPrefijos(fichas, NEGACIONES, trasMuletillas);
  const negated = trasNegacion > trasMuletillas;
  let i = saltarPrefijos(fichas, MULETILLAS, trasNegacion);
  const inicio = i;
  const cantidad = leerCantidad(fichas.slice(i));
  i += cantidad.used;
  let unit = null, peso = null, palabraPeso = '';
  if (cantidad.docena) unit = 'unidad';
  else if (UNIDADES[fichas[i]]) { unit = UNIDADES[fichas[i]]; i += 1; }
  else if (PESOS[fichas[i]]) { peso = PESOS[fichas[i]]; palabraPeso = originales[i]; unit = 'lb'; i += 1; }
  // La red de seguridad de la tabla de sinónimos: una unidad que el modelo no
  // conoce vale menos que ninguna, porque la compra no sabría qué hacer con ella.
  if (unit && !UNITS.includes(unit)) unit = null;
  i = saltarPrefijos(fichas, ARTICULOS, i);
  const name = presentar(originales.slice(i).join(' '));
  let quantity = cantidad.value;
  const avisos = [];
  if (peso !== null && quantity !== null) {
    const escrito = originales.slice(inicio, inicio + cantidad.used).join(' ');
    quantity = round(quantity * peso);
    avisos.push(`Se convirtió «${escrito} ${palabraPeso}» a ${quantity} lb.`);
  }
  // Una cantidad sin unidad escrita es lo que se cuenta: «30 huevos» son 30
  // unidades. Deducirlo no es inventarlo, pero sí baja la confianza. Sin
  // cantidad no se deduce nada: «detergente» solo quedaría con una unidad falsa.
  const implicita = unit === null && quantity !== null && name !== '';
  if (implicita) { unit = 'unidad'; avisos.push('Sin unidad escrita: se contó por unidades.'); }
  const pending = [];
  if (quantity === null) { pending.push('quantity'); avisos.push('No se entendió la cantidad.'); }
  if (unit === null) { pending.push('unit'); avisos.push('No se entendió la unidad.'); }
  if (name.length <= 1) avisos.push('No se entendió el nombre del alimento.');
  if (!name && quantity === null && unit === null) return null;
  return {
    raw,
    name,
    normalized: normalizeName(name),
    quantity,
    unit,
    pending,
    confidence: pending.length || name.length <= 1 ? 'baja' : (cantidad.deduced || implicita || peso !== null ? 'media' : 'alta'),
    warning: avisos.join(' ') || null,
    negated
  };
}

// La coma entre dos dígitos es un decimal dominicano («2,5 libras»): partir ahí
// convertiría dos libras y media en dos productos. El punto solo separa cuando
// lo sigue un espacio, que es justo lo que un decimal nunca tiene.
const FUERTES = /[;\n\r]+|\.\s+|(?<!\d),|,(?!\d)/;
const FRACCION = /^(medios?|medias?|mitad|cuartos?)\b/;

const tieneCantidad = texto => {
  const fichas = palabras(plano(texto));
  return leerCantidad(fichas.slice(saltarPrefijos(fichas, MULETILLAS, 0))).value !== null;
};

// La «y» es el separador traicionero: une productos («atún y detergente») y
// también forma nombres («arroz y habichuelas»). Se parte solo cuando algún
// lado trae cantidad, porque entonces el de la izquierda ya es un producto
// completo y lo que sigue es otro. Si ninguno de los dos la trae, la «y» está
// dentro del nombre.
function partirPorY(texto) {
  const conectores = /\s+[ye]\s+/gi;
  for (let encontrado; (encontrado = conectores.exec(texto));) {
    const izquierda = texto.slice(0, encontrado.index);
    const derecha = texto.slice(encontrado.index + encontrado[0].length);
    if (FRACCION.test(plano(derecha).trim())) continue;
    if (tieneCantidad(izquierda) || tieneCantidad(derecha)) return [izquierda, ...partirPorY(derecha)];
  }
  return [texto];
}

// El texto completo, dictado de corrido, convertido en filas. Lo que no dejó
// nada al limpiarlo va a `ignored` en vez de colarse como una fila vacía.
export function parseProductText(texto) {
  const lines = [], ignored = [];
  for (const trozo of String(texto ?? '').split(FUERTES)) {
    for (const fragmento of partirPorY(trozo || '')) {
      const fila = parseLine(fragmento);
      if (fila) lines.push(fila);
      else if (fragmento.trim()) ignored.push(fragmento.trim());
    }
  }
  return { lines, ignored };
}
