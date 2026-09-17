// Un mismo alimento se escribe de cinco formas distintas según quién y dónde lo
// escriba: «Plátano», «platano», «Plátanos maduros», «PLAT MAD 6 UND». Si la app
// los guarda como productos separados, la misma cosa aparece dos veces en la
// lista de la compra y nadie entiende por qué.
//
// Normalizar es lo único que permite darse cuenta de que son el mismo. Vive en
// su propio archivo porque lo necesitan tanto el modelo (para avisar de un
// duplicado al crear) como la migración (que no puede importar el modelo sin
// crear un ciclo) y la entrada de texto de corrido.
//
// Y vive aquí **una sola vez**. Hubo un tiempo en que `text-parse.js` tenía su
// propia versión, más cuidadosa, y esta otra más basta: la de aquí convertía
// «galletas dulces» en «galleta dulz», así que quien escribía «galleta dulce»
// no encontraba la que ya tenía guardada y se le creaba un alimento repetido.
// Dos gramáticas para decidir si dos nombres son el mismo alimento es una
// gramática de más.

// Quitar la tilde también convierte la «ñ» en «n». Es a propósito: quien dicta
// la compra escribe «pina» tan a menudo como «piña», y los dos tienen que
// llegar al mismo alimento.
const sinTildes = texto => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const plano = texto => sinTildes(texto).toLocaleLowerCase('es');
export const palabras = texto => String(texto ?? '').trim().split(/\s+/).filter(Boolean);

// Palabras que terminan en «s» sin ser plural. Las de tres letras o menos ya
// quedan fuera por tamaño («mes», «gas», «dos»).
const INVARIABLES = new Set(['anis', 'pais', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'cuscus']);
// Los plurales que no siguen la regla son poquísimos y todos de cocina: no vale
// la pena un diccionario entero para «nueces».
const IRREGULARES = { nueces: 'nuez', maices: 'maíz', arroces: 'arroz', raices: 'raíz', peces: 'pez', luces: 'luz' };
// Consonantes con las que una palabra española puede terminar. Deciden qué
// pierde un plural en -es: «panes» es «pan» porque «pan» termina bien, pero
// «tomates» es «tomate», no «tomat» —y «dulces» es «dulce», no «dulz».
const FINALES = 'nlrdzjxs';
const ACENTO = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' };

// Devuelve el singular conservando las tildes, porque el mismo cálculo sirve
// para el nombre que se enseña («Jamón») y para el que se compara («jamon»).
export function singular(palabra) {
  const base = plano(palabra);
  if (IRREGULARES[base]) return IRREGULARES[base];
  if (base.length <= 3 || INVARIABLES.has(base) || !base.endsWith('s')) return palabra;
  if (!base.endsWith('es') || !FINALES.includes(base.at(-3))) return palabra.slice(0, -1);
  const raiz = palabra.slice(0, -2);
  // El plural en -es le quita la tilde al singular agudo: «jamones» es «jamón».
  // Solo en palabras largas, porque «panes» sí es «pan».
  return raiz.replace(/^(..+)([aeiou])n$/, (todo, inicio, vocal) => inicio + ACENTO[vocal] + 'n');
}

// El nombre que se enseña: una sola mayúscula al principio. El resto en
// minúscula a propósito, para que «ARROZ» y «Arroz» se vean igual en la lista.
export function presentar(texto) {
  const nombre = palabras(String(texto ?? '').toLocaleLowerCase('es')).map(singular).join(' ');
  return nombre ? nombre[0].toLocaleUpperCase('es') + nombre.slice(1) : '';
}

// Minúsculas, sin tildes, sin puntuación, sin plurales y con los espacios
// colapsados. Es la clave con la que se compara; nunca lo que se le muestra al
// usuario, que sigue viendo lo que él escribió.
export function normalizeName(texto) {
  return palabras(String(texto ?? '').replace(/[^\p{L}\p{N}\s]/gu, ' '))
    .map(palabra => plano(singular(plano(palabra))))
    .filter(Boolean)
    .join(' ');
}

// Distancia de edición con dos filas en vez de la matriz completa: aquí se
// compara contra el catálogo entero en cada tecla, y una matriz por candidato
// se nota en un teléfono.
function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

// 0 a 1. Se mide sobre el nombre ya normalizado, así que «Plátano» y «platanos»
// llegan aquí siendo la misma cadena y puntúan 1 sin gastar una comparación.
export function similarity(a, b) {
  const left = normalizeName(a), right = normalizeName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const longest = Math.max(left.length, right.length);
  return Math.max(0, 1 - editDistance(left, right) / longest);
}

// «Plátano» dentro de «Plátano maduro» no es un error de escritura: son dos
// alimentos que pueden convivir. Pero conviene avisar, porque muchas veces sí
// es la misma cosa escrita con más o menos detalle.
export function containsWords(a, b) {
  const left = normalizeName(a).split(' ').filter(Boolean);
  const right = normalizeName(b).split(' ').filter(Boolean);
  if (!left.length || !right.length) return false;
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  return short.every(word => long.includes(word));
}
