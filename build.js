// Copia el casco web a www/, que es la carpeta que Capacitor empaqueta dentro
// del APK. No hay bundler: son los mismos archivos que sirve server.js, así que
// la app nativa y la web corren exactamente el mismo código.
import { cp, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname);
const out = join(root, 'www');
const assets = ['index.html', 'manifest.webmanifest', 'sw.js', 'src'];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const asset of assets) await cp(join(root, asset), join(out, asset), { recursive: true });
console.log(`www/ listo: ${assets.join(', ')}`);
