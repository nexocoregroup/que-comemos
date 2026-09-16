// Un lector y un escritor de PNG, y lo justo para escalar y recortar.
//
// Están aquí porque el proyecto no tiene dependencias y no hacía falta añadir
// ninguna: un PNG de color verdadero son líneas de píxeles comprimidas con
// zlib y cinco filtros posibles. Vivían dentro de `brand-assets.js`; salieron
// cuando el generador del gráfico de la tienda necesitó lo mismo, porque tener
// dos copias de un decodificador es tener una que se arregla y otra que no.
//
// Todo se mueve en imágenes `{ width, height, rgba }`, con el alfa sin
// premultiplicar.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { dirname } from 'node:path';

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

export function readPNG(path) {
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

// `sinAlfa` guarda en color verdadero de 24 bits en vez de 32. Importa para
// Google Play, que pide las capturas y el gráfico de cabecera «sin canal alfa»:
// una imagen opaca guardada con alfa sigue teniendo el canal, y ahí es donde
// una ficha se cae por algo que no se ve. Si queda algún píxel transparente se
// para, porque aplanarlo contra un color inventado sería peor que avisar.
export function writePNG(path, { width, height, rgba }, { sinAlfa = false } = {}) {
  const canales = sinAlfa ? 3 : 4;
  const stride = width * canales;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    if (!sinAlfa) {
      rgba.copy(raw, y * (stride + 1) + 1, y * width * 4, (y + 1) * width * 4);
      continue;
    }
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4, d = y * (stride + 1) + 1 + x * 3;
      if (rgba[s + 3] !== 255) throw new Error(`No se puede guardar sin alfa: el píxel (${x}, ${y}) es transparente.`);
      raw[d] = rgba[s]; raw[d + 1] = rgba[s + 1]; raw[d + 2] = rgba[s + 2];
    }
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
  ihdr[8] = 8; ihdr[9] = sinAlfa ? 2 : 6;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

// Escalado por caja con alfa premultiplicado. Sin premultiplicar, los píxeles
// transparentes del borde aportan su color al promedio y dejan una orla.
export function resample(src, sw, sh, dw, dh) {
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

// Los bordes del recorte de una imagen: la caja más pequeña que contiene todo
// lo que se ve. `umbral` es el alfa por debajo del cual un píxel se considera
// vacío; ocho de doscientos cincuenta y cinco deja fuera la niebla del
// antialias sin comerse nada del trazo.
export function bordes({ width, height, rgba }, umbral = 8, desde = 0, hasta = null) {
  const fin = hasta ?? height;
  let minX = width, minY = fin, maxX = -1, maxY = -1;
  for (let y = desde; y < fin; y++) for (let x = 0; x < width; x++) {
    if (rgba[(y * width + x) * 4 + 3] > umbral) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error('La imagen está vacía en ese tramo.');
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

// Saca un rectángulo a su propia imagen.
export function recortar({ width, rgba }, { minX, minY, width: cw, height: ch }) {
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    rgba.copy(out, y * cw * 4, ((y + minY) * width + minX) * 4, ((y + minY) * width + minX + cw) * 4);
  }
  return { width: cw, height: ch, rgba: out };
}

// Pega `pieza` sobre `lienzo` en (x, y), mezclando por alfa. El lienzo manda:
// lo que se salga por un borde se recorta en vez de dar la vuelta.
export function pegar(lienzo, pieza, x, y) {
  for (let py = 0; py < pieza.height; py++) {
    const ly = y + py;
    if (ly < 0 || ly >= lienzo.height) continue;
    for (let px = 0; px < pieza.width; px++) {
      const lx = x + px;
      if (lx < 0 || lx >= lienzo.width) continue;
      const s = (py * pieza.width + px) * 4, d = (ly * lienzo.width + lx) * 4;
      const a = pieza.rgba[s + 3] / 255;
      if (!a) continue;
      const base = lienzo.rgba[d + 3] / 255;
      const alpha = a + base * (1 - a);
      for (let c = 0; c < 3; c++) {
        lienzo.rgba[d + c] = Math.round((pieza.rgba[s + c] * a + lienzo.rgba[d + c] * base * (1 - a)) / alpha);
      }
      lienzo.rgba[d + 3] = Math.round(alpha * 255);
    }
  }
  return lienzo;
}

// Un lienzo de color liso y opaco.
export function lienzo(width, height, [r, g, b]) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255;
  }
  return { width, height, rgba };
}

// Escala una imagen a una altura dada, conservando la proporción.
export function aAltura(img, altura) {
  const ancho = Math.max(1, Math.round(img.width * (altura / img.height)));
  return { width: ancho, height: altura, rgba: resample(img.rgba, img.width, img.height, ancho, altura) };
}
