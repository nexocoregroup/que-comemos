// El gráfico de cabecera de la ficha de Google Play: 1024×500, obligatorio.
//
//   npm run tienda
//
// No sale de redimensionar el logotipo, porque el logotipo es vertical
// (1080×1350) y el formato pedido es apaisado: estirado quedaría diminuto en
// medio de dos franjas de crema vacías. Lo que se hace es separarlo en sus dos
// piezas —la marca y el nombre— y volver a montarlas en horizontal. Las piezas
// son las del original; aquí no se dibuja nada nuevo.
//
// Dónde parte: el logotipo tiene una única franja de filas sin tinta entre la
// marca y el nombre. Se busca en vez de escribirla a mano, para que cambiar el
// original no obligue a venir a corregir dos números.
import { join, resolve } from 'node:path';
import { aAltura, bordes, lienzo, pegar, readPNG, recortar, writePNG } from './png.js';

const PROJECT = resolve(import.meta.dirname, '..');
const CREMA = [0xfb, 0xf7, 0xf1];

const ANCHO = 1024;
const ALTO = 500;

// La marca ocupa poco más de la mitad del alto. Por encima se come el aire que
// hace que la miniatura respire; por debajo deja de leerse a dos centímetros,
// que es el tamaño al que se ve casi siempre.
const ALTO_DE_LA_MARCA = Math.round(ALTO * 0.52);

// La separación entre la marca y el nombre, en proporción al alto de la marca.
// Menos y se tocan; más y dejan de leerse como una sola cosa.
const SEPARACION = 0.28;

const fuente = readPNG(join(PROJECT, 'identidad visual', 'logotipo.png'));

/* ── Partir el logotipo por su hueco ──────────────────────────────────── */

const filasConTinta = [];
for (let y = 0; y < fuente.height; y++) {
  let n = 0;
  for (let x = 0; x < fuente.width; x++) if (fuente.rgba[(y * fuente.width + x) * 4 + 3] > 8) n++;
  filasConTinta.push(n);
}
const primera = filasConTinta.findIndex(n => n > 0);
const ultima = filasConTinta.length - 1 - [...filasConTinta].reverse().findIndex(n => n > 0);
if (primera < 0) throw new Error('El logotipo no tiene nada visible.');

const huecos = [];
let inicio = null;
for (let y = primera; y <= ultima; y++) {
  if (filasConTinta[y] === 0) { if (inicio === null) inicio = y; }
  else if (inicio !== null) { huecos.push({ desde: inicio, hasta: y - 1, alto: y - inicio }); inicio = null; }
}
// El hueco bueno es el más alto: los demás, si aparecen, son los que dejan las
// tildes o los signos de interrogación sueltos.
const corte = huecos.sort((a, b) => b.alto - a.alto)[0];
if (!corte) throw new Error('No se encontró el hueco entre la marca y el nombre: ¿cambió el logotipo?');
console.log(`el logotipo parte por las filas ${corte.desde}–${corte.hasta}`);

const marca = recortar(fuente, bordes(fuente, 8, primera, corte.desde));
const nombre = recortar(fuente, bordes(fuente, 8, corte.hasta + 1, ultima + 1));
console.log(`   marca  ${marca.width}×${marca.height}`);
console.log(`   nombre ${nombre.width}×${nombre.height}`);

/* ── Montarlas en horizontal ──────────────────────────────────────────── */

// El nombre conserva su tamaño relativo a la marca. Si se escala cada pieza por
// su cuenta, la proporción entre ambas deja de ser la de la identidad y se nota
// aunque no se sepa decir por qué.
const escala = ALTO_DE_LA_MARCA / marca.height;
const marcaGrande = aAltura(marca, ALTO_DE_LA_MARCA);
const nombreGrande = aAltura(nombre, Math.round(nombre.height * escala));

const separacion = Math.round(ALTO_DE_LA_MARCA * SEPARACION);
const anchoTotal = marcaGrande.width + separacion + nombreGrande.width;
if (anchoTotal > ANCHO * 0.82) {
  // Play recorta los lados en algunas pantallas. Si el conjunto pasa del 82 %
  // del ancho, algo se saldrá, y es mejor enterarse aquí que en la tienda.
  throw new Error(`El conjunto mide ${anchoTotal} px y no cabe con margen en ${ANCHO}.`);
}

const x = Math.round((ANCHO - anchoTotal) / 2);
const banner = lienzo(ANCHO, ALTO, CREMA);
pegar(banner, marcaGrande, x, Math.round((ALTO - marcaGrande.height) / 2));
pegar(banner, nombreGrande, x + marcaGrande.width + separacion, Math.round((ALTO - nombreGrande.height) / 2));

/* ── Comprobar antes de guardar ───────────────────────────────────────── */

// Play rechaza el gráfico si trae transparencia. Como el lienzo es opaco y
// `pegar` solo mezcla, no debería haberla nunca; se comprueba igual, porque el
// rechazo llega días después y sin explicar cuál de las trece imágenes falló.
let transparentes = 0;
for (let i = 0; i < ANCHO * ALTO; i++) if (banner.rgba[i * 4 + 3] !== 255) transparentes++;
if (transparentes) throw new Error(`Quedaron ${transparentes} píxeles con transparencia; Play lo rechazaría.`);

// Los bordes tienen que ser crema limpio: es la otra cosa que se recorta.
const margen = Math.round(ANCHO * 0.06);
for (const [px, py] of [[margen, margen], [ANCHO - margen, margen], [margen, ALTO - margen], [ANCHO - margen, ALTO - margen]]) {
  const d = (py * ANCHO + px) * 4;
  if (banner.rgba[d] !== CREMA[0] || banner.rgba[d + 1] !== CREMA[1] || banner.rgba[d + 2] !== CREMA[2]) {
    throw new Error(`Hay tinta a ${margen} px del borde, en (${px}, ${py}). Play recorta ahí.`);
  }
}

const destino = 'tienda/grafico-destacado-1024x500.png';
// Sin canal alfa, no solo sin píxeles transparentes: es lo que pide la ficha, y
// la diferencia no se ve mirando la imagen.
writePNG(join(PROJECT, destino), banner, { sinAlfa: true });
console.log(`\n${destino}  ${ANCHO}×${ALTO}, 24 bits sin canal alfa, márgenes limpios`);
console.log(`conjunto de ${anchoTotal} px centrado, ${Math.round(anchoTotal / ANCHO * 100)} % del ancho`);
