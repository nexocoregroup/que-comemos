// Genera los diecisiete archivos de ícono de la app a partir de un solo
// original: `identidad visual/isotipo.png`. Se recorta, se escala y se compone;
// nada se vuelve a dibujar. El trazo del signo de pregunta es orgánico y a
// cualquier reconstrucción con arcos se le nota, así que manda el original.
//
// Después de cambiar el isotipo:  npm run brand
//
// El lector y el escritor de PNG están en `png.js`, que es de donde los toma
// también el generador del gráfico de la tienda.
import { join, resolve } from 'node:path';
import { bordes, readPNG, resample, writePNG } from './png.js';

const PROJECT = resolve(import.meta.dirname, '..');
const CREAM = [0xfb, 0xf7, 0xf1];

// --- el isotipo, recortado a su contenido y centrado en un lienzo cuadrado ---
const source = readPNG(join(PROJECT, 'identidad visual', 'isotipo.png'));
const caja = bordes(source);
// Cuadrado, no estirado: el isotipo es más alto que ancho por el punto de abajo.
const side = Math.max(caja.width, caja.height);
const padX = Math.round((side - caja.width) / 2), padY = Math.round((side - caja.height) / 2);
const mark = Buffer.alloc(side * side * 4);
for (let y = 0; y < caja.height; y++) {
  source.rgba.copy(mark, ((y + padY) * side + padX) * 4, ((y + caja.minY) * source.width + caja.minX) * 4, ((y + caja.minY) * source.width + caja.maxX + 1) * 4);
}
console.log(`isotipo: recorte de ${caja.width}×${caja.height} centrado en un lienzo de ${side}×${side}`);

function compose(size, fraction, background, shape = 'none') {
  const inner = Math.round(size * fraction);
  const glyph = resample(mark, side, side, inner, inner);
  const out = Buffer.alloc(size * size * 4);
  if (background) {
    const radius = size / 2, center = (size - 1) / 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (shape === 'circle' && Math.hypot(x - center, y - center) > radius - 0.5) continue;
      const d = (y * size + x) * 4;
      out[d] = background[0]; out[d + 1] = background[1]; out[d + 2] = background[2]; out[d + 3] = 255;
    }
  }
  const offset = Math.round((size - inner) / 2);
  for (let y = 0; y < inner; y++) for (let x = 0; x < inner; x++) {
    const s = (y * inner + x) * 4, d = ((y + offset) * size + (x + offset)) * 4;
    const a = glyph[s + 3] / 255;
    if (!a) continue;
    const base = out[d + 3] / 255;
    const alpha = a + base * (1 - a);
    for (let c = 0; c < 3; c++) out[d + c] = Math.round((glyph[s + c] * a + out[d + c] * base * (1 - a)) / alpha);
    out[d + 3] = Math.round(alpha * 255);
  }
  return { width: size, height: size, rgba: out };
}

const save = (relative, image) => { writePNG(join(PROJECT, relative), image); console.log(`   ${relative}  ${image.width}×${image.height}`); };
const ANDROID = 'android/app/src/main/res';

console.log('marca suelta, para la cabecera de la app y el favicon:');
save('src/isotipo.png', compose(192, 1, null));

console.log('íconos de la app instalada, en crema como se presenta la marca:');
for (const size of [192, 512]) save(`src/icon-${size}.png`, compose(size, 0.56, CREAM));

// Ícono adaptable de Android: el lienzo mide 108dp y solo los 72dp centrales
// están garantizados. Al 48 % ninguna máscara —círculo, cuadrado redondeado,
// gota— le corta nada a la marca.
console.log('android, capa delantera del ícono adaptable:');
for (const [density, size] of [['mdpi', 108], ['hdpi', 162], ['xhdpi', 216], ['xxhdpi', 324], ['xxxhdpi', 432]]) {
  save(`${ANDROID}/drawable-${density}/ic_launcher_foreground.png`, compose(size, 0.48, null));
}

console.log('android, ícono plano para versiones anteriores a la 26:');
for (const [density, size] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  save(`${ANDROID}/mipmap-${density}/ic_launcher.png`, compose(size, 0.62, CREAM));
  save(`${ANDROID}/mipmap-${density}/ic_launcher_round.png`, compose(size, 0.62, CREAM, 'circle'));
}
