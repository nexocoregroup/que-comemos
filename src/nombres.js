// Un mismo alimento se escribe de cinco formas distintas según quién y dónde lo
// escriba: «Plátano», «platano», «Plátanos maduros», «PLAT MAD 6 UND». Si la app
// los guarda como productos separados, el inventario se parte en pedazos y las
// cuentas dejan de cuadrar sin que nadie entienda por qué.
//
// Normalizar es lo único que permite darse cuenta de que son el mismo. Vive en
// su propio archivo porque lo necesitan tanto el modelo (para avisar de un
// duplicado al crear) como la migración (que no puede importar el modelo sin
// crear un ciclo) y la entrada de texto de corrido.

const TILDES = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n', à: 'a', è: 'e', ì: 'i', ò: 'o', ù: 'u' };

// Plural español a ojo de buen cubero. No es morfología completa —«lápices» o
// «regímenes» quedan fuera— pero cubre lo que aparece en una lista de compra,
// que es de lo que trata esta app.
export function singular(word) {
  if (word.length <= 3) return word;
  if (word.endsWith('ces')) return `${word.slice(0, -3)}z`;
  if (word.endsWith('es') && /[rnldjsxz]es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

// Minúsculas, sin tildes, sin puntuación, sin plurales y con los espacios
// colapsados. Es la clave con la que se compara; nunca lo que se le muestra al
// usuario, que sigue viendo lo que él escribió.
export function normalizeName(value) {
  return String(value ?? '')
    .toLocaleLowerCase('es')
    .replace(/[áéíóúüñàèìòù]/g, char => TILDES[char] || char)
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
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
