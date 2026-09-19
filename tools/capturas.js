// Las capturas de pantalla de la ficha de Google Play.
//
//   npm start              (en otra terminal, o ya corriendo)
//   npm run capturas
//   npm run capturas -- --explorar        para ver qué botones ofrece cada pantalla
//
// Play las quiere de 1080×1920. La app está pensada para un teléfono, así que
// no se puede abrir una ventana de 1080 px de ancho y fotografiarla: saldría la
// disposición de una tableta. Lo que se hace es decirle a Chrome que es un
// teléfono de 360×640 con una pantalla de tres puntos por píxel, que es
// exactamente lo que tiene un teléfono de verdad. La foto sale a 1080×1920 y
// nítida, sin agrandar nada.
//
// Chrome se conduce por su protocolo de depuración. Node 24 ya trae WebSocket,
// así que esto no añade ninguna dependencia al proyecto.
//
// Datos: se usa el ejemplo que la propia app sabe crear —el botón «Ver un
// ejemplo»—, nunca los datos de nadie. Una ficha de tienda con la casa de una
// persona real dentro es una filtración, no una captura.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PROJECT = resolve(import.meta.dirname, '..');
const DESTINO = join(PROJECT, 'tienda', 'capturas');
const ORIGEN = process.env.CAPTURAS_URL || 'http://localhost:4173/';
const EXPLORAR = process.argv.includes('--explorar');

const ANCHO = 360, ALTO = 640, PUNTOS = 3;

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].find(ruta => ruta && existsSync(ruta));
if (!CHROME) throw new Error('No encontré Chrome. Pon su ruta en tools/capturas.js.');

const esperar = ms => new Promise(listo => setTimeout(listo, ms));

/* ── Las seis pantallas ───────────────────────────────────────────────────

   Cada una dice cómo llegar. `hacer` corre dentro de la página y devuelve
   cuando la pantalla está puesta; `reposo` es lo que se le da a la app para
   pintar y para que terminen las transiciones antes de la foto. */

const ir = pagina => `document.querySelector('[data-action="navigate"][data-page="${pagina}"]')?.click()`;

// Rellena las casillas de la revisión para que se vea lo que la pantalla hace:
// restar. Vacía no enseña nada, y «la resta hecha» es justo la idea que hay que
// contar. Una lista con todo pendiente no enseña nada: lo que hay que ver es
// que lo comprado se tacha y baja al final, así que se marcan un par de líneas.
const MARCAR_COMPRADO = `
  const tachar = [...document.querySelectorAll('[data-action="compra-tachar"]')].slice(0, 2);
  for (const boton of tachar) { boton.click(); await new Promise(r => setTimeout(r, 250)); }
  return tachar.length;`;

const PANTALLAS = [
  {
    archivo: '1-hoy.png',
    titulo: 'Hoy — lo que se come, y la nota de quien cocina',
    // Un poco abajo: el rótulo del día ya se entendió, y así entran el desayuno
    // entero y el principio del almuerzo, que es lo que hay que enseñar.
    hacer: ir('hoy'),
    desplazar: 150
  },
  {
    archivo: '2-plan-semanal.png',
    titulo: 'Plan semanal — siete días, uno debajo de otro',
    // Sin bajar: esta es la que enseña la cabecera de la app, y una cabecera
    // cortada por la mitad es lo primero que se nota en una ficha de tienda.
    hacer: ir('semana'),
    desplazar: 0
  },
  {
    archivo: '3-poner-en-dias.png',
    titulo: 'Una comida en varios días — se marcan y se ponen',
    // Con una preparación elegida y los siete días siguientes ya marcados, que
    // es lo que hay que enseñar: una ventana vacía no explica nada a quien
    // todavía no sabe para qué sirve. El desplazamiento baja dentro de la
    // ventana —no de la página— hasta las casillas de los días.
    hacer: `${ir('semana')};
      await new Promise(r => setTimeout(r, 400));
      document.querySelector('[data-action="semana-poner-en-dias"]')?.click();
      await new Promise(r => setTimeout(r, 500));
      const receta = document.querySelector('[data-form="poner-en-dias"] [name="recipeId"]');
      if (receta) {
        const opcion = [...receta.options].find(o => o.value);
        if (opcion) { receta.value = opcion.value; receta.dispatchEvent(new Event('change', { bubbles: true })); }
      }
      await new Promise(r => setTimeout(r, 300));
      document.querySelector('[data-action="poner-dias-atajo"][data-cuantos="7"]')?.click();`,
    desplazar: 430
  },
  {
    archivo: '4-compra.png',
    titulo: 'Preparar la compra — tus productos, por rubros',
    // Hasta el buscador y el primer rubro. Más abajo se pierde de vista que
    // esto se puede buscar, que es la mitad de para qué sirve la pantalla.
    hacer: ir('compra'),
    desplazar: 430
  },
  {
    archivo: '5-mi-lista.png',
    titulo: 'Mi lista — lo pendiente arriba, lo comprado tachado',
    hacer: `${ir('compra')};
      await new Promise(r => setTimeout(r, 400));
      [...document.querySelectorAll('[data-action="compra-vista"]')]
        .find(b => /mi lista/i.test(b.textContent))?.click();
      await new Promise(r => setTimeout(r, 500));
      ${MARCAR_COMPRADO}`,
    // Lo que esta captura tiene que enseñar son las dos mitades a la vez: un
    // renglón por buscar arriba y, debajo, «Ya en el carrito» con lo tachado.
    // Bajar hasta el final enseña solo la segunda.
    desplazar: 640
  },
  {
    archivo: '6-habituales.png',
    titulo: 'Mis productos habituales — se marcan una sola vez',
    hacer: ir('canasta'),
    desplazar: 500
  }
];

/* ── El conductor ─────────────────────────────────────────────────────── */

const perfil = mkdtempSync(join(tmpdir(), 'capturas-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${perfil}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--hide-scrollbars', 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });

// El puerto lo dice Chrome por el error estándar al arrancar; pedirle uno fijo
// falla si otra cosa lo tiene tomado.
const puerto = await new Promise((listo, falla) => {
  let texto = '';
  const plazo = setTimeout(() => falla(new Error(`Chrome no dijo su puerto en 20 s.\n${texto}`)), 20000);
  chrome.stderr.on('data', trozo => {
    texto += trozo;
    const encontrado = texto.match(/ws:\/\/127\.0\.0\.1:(\d+)\//);
    if (encontrado) { clearTimeout(plazo); listo(encontrado[1]); }
  });
  chrome.on('exit', codigo => { clearTimeout(plazo); falla(new Error(`Chrome se cerró (${codigo}).\n${texto}`)); });
});

const objetivos = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json();
const pagina = objetivos.find(o => o.type === 'page');
const socket = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise(listo => socket.addEventListener('open', listo, { once: true }));

let siguiente = 0;
const pendientes = new Map();
socket.addEventListener('message', evento => {
  const mensaje = JSON.parse(evento.data);
  if (mensaje.id && pendientes.has(mensaje.id)) {
    const { listo, falla } = pendientes.get(mensaje.id);
    pendientes.delete(mensaje.id);
    mensaje.error ? falla(new Error(mensaje.error.message)) : listo(mensaje.result);
  }
});
const cdp = (method, params = {}) => new Promise((listo, falla) => {
  const id = ++siguiente;
  pendientes.set(id, { listo, falla });
  socket.send(JSON.stringify({ id, method, params }));
});

const correr = async expresion => {
  const salida = await cdp('Runtime.evaluate', {
    expression: `(async () => { ${expresion} })()`,
    awaitPromise: true, returnByValue: true
  });
  if (salida.exceptionDetails) throw new Error(salida.exceptionDetails.exception?.description || 'falló dentro de la página');
  return salida.result.value;
};

try {
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', {
    width: ANCHO, height: ALTO, deviceScaleFactor: PUNTOS, mobile: true
  });

  await cdp('Page.navigate', { url: ORIGEN });
  await esperar(2500);

  // Una instalación nueva no abre en la bienvenida: abre en la pantalla de
  // cuenta, que es lo primero que se pregunta. Se pasa de largo por el mismo
  // sitio por el que pasa cualquiera que no quiera cuenta, y entonces sí sale
  // el ejemplo.
  const camino = [];
  for (const accion of ['cuenta-sin-cuenta', 'welcome-demo']) {
    const pulsado = await correr(`
      const boton = document.querySelector('[data-action="${accion}"]');
      if (boton) { boton.click(); return true; }
      return false;`);
    camino.push(`${accion}: ${pulsado ? 'sí' : 'no estaba'}`);
    await esperar(1400);
  }
  console.log(`arranque → ${camino.join(', ')}`);

  // Quitarle al ejemplo lo que solo tiene sentido dentro de la app: el cartel
  // de «estás viendo un ejemplo» y los «· ejemplo» pegados a cada nombre. Los
  // datos siguen siendo inventados; lo que se quita es el andamio.
  await correr(`
    const clave = 'que-comemos-v1';
    const crudo = localStorage.getItem(clave);
    if (crudo) {
      localStorage.setItem(clave, crudo.split(' · ejemplo').join('').replace('"demo":true', '"demo":false'));
    }
    return true;`);
  await cdp('Page.reload');
  await esperar(2500);

  mkdirSync(DESTINO, { recursive: true });

  for (const pantalla of PANTALLAS) {
    // El desplazamiento es del documento, no de la pantalla: sin esto, cada
    // captura hereda lo que había bajado la anterior y los títulos salen
    // cortados por la mitad.
    await correr(`document.scrollingElement.scrollTop = 0; return true;`);
    await correr(pantalla.hacer);
    await esperar(900);

    // Los avisos flotantes duran 4,2 s y no son parte de ninguna pantalla:
    // salen porque acabamos de tocar algo. Esperar por ellos alarga esto casi
    // medio minuto, así que se apagan.
    await correr(`
      const aviso = document.querySelector('#toast');
      if (aviso) aviso.className = '';
      return true;`);

    if (pantalla.desplazar) {
      // Un modal abierto se desplaza él, no la página de detrás.
      const hastaDonde = await correr(`
        const modal = document.querySelector('.modal-body, .modal');
        const caja = modal && modal.scrollHeight > modal.clientHeight ? modal : document.scrollingElement;
        caja.scrollTop = ${pantalla.desplazar};
        return caja.scrollTop;`);
      if (hastaDonde === 0 && pantalla.desplazar > 0) console.log(`   aviso: ${pantalla.archivo} no se pudo desplazar`);
      await esperar(400);
    }

    if (EXPLORAR) {
      const botones = await correr(`
        return [...document.querySelectorAll('[data-action], [data-page], [data-goto]')]
          .map(el => el.dataset.action + (el.dataset.page ? ' page=' + el.dataset.page : '') + (el.dataset.pagina ? ' pagina=' + el.dataset.pagina : '') + '  «' + el.textContent.trim().slice(0, 40) + '»')
          .slice(0, 40);`);
      console.log(`\n── ${pantalla.archivo} ──`);
      for (const boton of botones) console.log('   ' + boton);
      continue;
    }

    const foto = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(join(DESTINO, pantalla.archivo), Buffer.from(foto.data, 'base64'));
    console.log(`   ${pantalla.archivo}  ${ANCHO * PUNTOS}×${ALTO * PUNTOS}  ${pantalla.titulo}`);
  }

  if (!EXPLORAR) console.log(`\nseis capturas en tienda/capturas/`);
} finally {
  socket.close();
  chrome.kill();
  try { rmSync(perfil, { recursive: true, force: true }); } catch { /* Windows a veces lo tiene tomado un segundo más. */ }
}
