// Genera los diecisiete archivos de ícono de la app a partir de un solo
// original: `identidad visual/isotipo.png`. Se recorta, se escala y se compone;
// nada se vuelve a dibujar. El trazo del signo de pregunta es orgánico y a
// cualquier reconstrucción con arcos se le nota, así que manda el original.
//
// Después de cambiar el isotipo:  npm run brand
//
// Lleva dentro un lector y un escritor de PNG porque el proyecto no tiene
// dependencias y no hacía falta añadir ninguna: un PNG de color verdadero son
// líneas de píxeles comprimidas con zlib y cinco filtros posibles.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';

const PROJECT = resolve(import.meta.dirname, '..');
const CREAM = [0xfb, 0xf7, 0xf1];
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function readPNG(path) {
  const file = readFileSync(path);
  if (!file.subarray(0, 8).equals(SIGNATURE)) throw new Error(`${path} no es un PNG.`);
  let offset = 8, header = null;
  const data = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const body = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], colorType: body[9], interlace: body[12] };
    if (type === 'IDAT') data.push(body);
    offset += 12 + length;
  }
  if (header.depth !== 8) throw new Error(`Profundidad de ${header.depth} bits no soportada.`);
  if (header.interlace) throw new Error('PNG entrelazado no soportado.');
  const channels = CHANNELS[header.colorType];
  const raw = inflateSync(Buffer.concat(data));
  const stride = header.width * channels;
  const pixels = Buffer.alloc(header.height * stride);
  // Cada línea empieza con su tipo de filtro y se reconstruye a partir del
  // píxel anterior (a), el de arriba (b) y el de arriba a la izquierda (c).
  for (let y = 0; y < header.height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[y * stride + x] = value & 0xff;
    }
  }
  // Todo se normaliza a RGBA para no repetir casos más adelante.
  const rgba = Buffer.alloc(header.width * header.height * 4);
  for (let i = 0; i < header.width * header.height; i++) {
    const s = i * channels, d = i * 4;
    if (channels === 4) { rgba[d] = pixels[s]; rgba[d + 1] = pixels[s + 1]; rgba[d + 2] = pixels[s + 2]; rgba[d + 3] = pixels[s + 3]; }
    else if (channels === 3) { rgba[d] = pixels[s]; rgba[d + 1] = pixels[s + 1]; rgba[d + 2] = pixels[s + 2]; rgba[d + 3] = 255; }
    else if (channels === 2) { rgba[d] = rgba[d + 1] = rgba[d + 2] = pixels[s]; rgba[d + 3] = pixels[s + 1]; }
    else { rgba[d] = rgba[d + 1] = rgba[d + 2] = pixels[s]; rgba[d + 3] = 255; }
  }
  return { width: header.width, height: header.height, rgba };
}

function writePNG(path, { width, height, rgba }) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'ascii');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

// Escalado por caja con alfa premultiplicado. Sin premultiplicar, los píxeles
// transparentes del borde aportan su color al promedio y dejan una orla.
function resample(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  const xr = sw / dw, yr = sh / dh;
  for (let dy = 0; dy < dh; dy++) {
    const y0 = Math.floor(dy * yr), y1 = Math.min(sh, Math.max(y0 + 1, Math.ceil((dy + 1) * yr)));
    for (let dx = 0; dx < dw; dx++) {
      const x0 = Math.floor(dx * xr), x1 = Math.min(sw, Math.max(x0 + 1, Math.ceil((dx + 1) * xr)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * sw + x) * 4, alpha = src[i + 3] / 255;
        r += src[i] * alpha; g += src[i + 1] * alpha; b += src[i + 2] * alpha; a += src[i + 3]; n++;
      }
      const d = (dy * dw + dx) * 4, mean = a / n;
      out[d + 3] = Math.round(mean);
      if (mean > 0.5) {
        const k = 255 / mean;
        out[d] = Math.min(255, Math.round(r / n * k));
        out[d + 1] = Math.min(255, Math.round(g / n * k));
        out[d + 2] = Math.min(255, Math.round(b / n * k));
      }
    }
  }
  return out;
}

// --- el isotipo, recortado a su contenido y centrado en un lienzo cuadrado ---
const source = readPNG(join(PROJECT, 'identidad visual', 'isotipo.png'));
let minX = source.width, minY = source.height, maxX = -1, maxY = -1;
for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
  if (source.rgba[(y * source.width + x) * 4 + 3] > 8) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}
const cw = maxX - minX + 1, ch = maxY - minY + 1;
// Cuadrado, no estirado: el isotipo es más alto que ancho por el punto de abajo.
const side = Math.max(cw, ch), padX = Math.round((side - cw) / 2), padY = Math.round((side - ch) / 2);
const mark = Buffer.alloc(side * side * 4);
for (let y = 0; y < ch; y++) {
  source.rgba.copy(mark, ((y + padY) * side + padX) * 4, ((y + minY) * source.width + minX) * 4, ((y + minY) * source.width + maxX + 1) * 4);
}
console.log(`isotipo: recorte de ${cw}×${ch} centrado en un lienzo de ${side}×${side}`);

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
