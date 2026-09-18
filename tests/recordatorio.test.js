// El recordatorio de la cena.
//
// Es el único aviso que manda esta app, y el que obligó a que dejara de ser
// cierta la frase «un permiso en total» que se decía en cinco sitios. Por eso
// estas pruebas vigilan dos cosas a la vez: que el recordatorio haga lo que
// dice, y que no se cuele por el camino ningún permiso que no se necesita.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { addDays, createEmptyState, setStatusPlan, todayISO } from '../src/model.js';
import {
  AVISOS_DE_FABRICA, avisosDe, cenasSinDecidir, guardarAvisos,
  hayAvisosEnEsteAparato, horaEnPalabras, permisoDeAvisos, programarRecordatorio
} from '../src/recordatorio.js';

const leer = (...partes) => readFileSync(resolve(import.meta.dirname, '..', ...partes), 'utf8');

/* Un complemento de mentira, con memoria, para ver qué se programa de verdad.
   Se instala en el global igual que lo hace Capacitor dentro del APK. */
function fingirTelefono({ permiso = 'granted' } = {}) {
  const plugin = {
    programadas: [],
    pedido: 0,
    checkPermissions: async () => ({ display: permiso }),
    requestPermissions: async () => { plugin.pedido += 1; return { display: permiso }; },
    getPending: async () => ({ notifications: plugin.programadas }),
    cancel: async ({ notifications }) => {
      const fuera = new Set(notifications.map(aviso => aviso.id));
      plugin.programadas = plugin.programadas.filter(aviso => !fuera.has(aviso.id));
    },
    schedule: async ({ notifications }) => { plugin.programadas = notifications; }
  };
  globalThis.Capacitor = { Plugins: { LocalNotifications: plugin } };
  return plugin;
}
const quitarTelefono = () => { delete globalThis.Capacitor; };

// Una casa con todas las cenas sin decidir, que es el estado vacío.
const casa = () => createEmptyState();

/* ── Lo que se guarda ──────────────────────────────────────────────────── */

test('viene apagado de fábrica', () => {
  // Es la mitad de la decisión: un aviso que hay que encender es una oferta; uno
  // que hay que apagar es una imposición.
  assert.equal(AVISOS_DE_FABRICA.encendido, false);
  assert.equal(avisosDe(createEmptyState()).encendido, false, 'los avisos vienen encendidos');
});

test('una hora escrita con basura no se guarda a medias', () => {
  // Un recordatorio a las 00:00 por un campo mal leído es peor que no cambiar
  // nada: suena de madrugada y quien lo recibe apaga los avisos para siempre.
  const state = casa();
  state.settings.avisos = { encendido: 'sí', hora: 99, minuto: -3 };
  assert.deepEqual(avisosDe(state), { encendido: true, hora: 18, minuto: 0 });
  assert.equal(horaEnPalabras(avisosDe(state)), '18:00');
});

test('guardar la hora no apaga el interruptor, y al revés', () => {
  const state = casa();
  guardarAvisos(state, { encendido: true });
  guardarAvisos(state, { hora: 20, minuto: 30 });
  assert.deepEqual(avisosDe(state), { encendido: true, hora: 20, minuto: 30 });
});

/* ── Qué se programa ───────────────────────────────────────────────────── */

test('sin teléfono no se programa nada, y se dice', () => {
  quitarTelefono();
  assert.equal(hayAvisosEnEsteAparato(), false, 'el navegador dice que puede avisar');
});

test('apagado, se borra lo que hubiera y no se programa nada', async () => {
  const plugin = fingirTelefono();
  try {
    plugin.programadas = [{ id: 4119, body: 'de antes' }];
    const salida = await programarRecordatorio(casa());
    assert.equal(salida.cuantos, 0);
    assert.deepEqual(plugin.programadas, [], 'quedaron avisos de cuando estaba encendido');
    // Y no se le pregunta nada a nadie: apagado no pide permisos.
    assert.equal(plugin.pedido, 0, 'apagado, la app pidió permiso igualmente');
  } finally { quitarTelefono(); }
});

test('encendido, se programa un aviso por cada cena sin decidir', async () => {
  const plugin = fingirTelefono();
  try {
    const state = casa();
    // A las 23:59 para que ninguno caiga en una hora de hoy que ya pasó.
    guardarAvisos(state, { encendido: true, hora: 23, minuto: 59 });
    const salida = await programarRecordatorio(state);

    assert.equal(salida.ok, true);
    assert.equal(salida.cuantos, 7, 'con la casa vacía son siete cenas sin decidir');
    assert.equal(plugin.programadas.length, 7);
    // Todos inexactos: lo contrario costaría un permiso de alarma que la
    // política de Play mira con lupa y que esta app no necesita.
    assert.ok(plugin.programadas.every(aviso => aviso.isExactNotification === false),
      'algún aviso volvió a pedir alarma exacta');
    // Un identificador por día, o volver a programar duplicaría en vez de pisar.
    assert.equal(new Set(plugin.programadas.map(aviso => aviso.id)).size, 7, 'dos avisos comparten identificador');
    // El de hoy habla de hoy; los demás dicen de qué día son.
    assert.match(plugin.programadas[0].body, /la cena de hoy/);
    assert.match(plugin.programadas[1].body, /la cena del \w+/);
  } finally { quitarTelefono(); }
});

test('una cena decidida se cae de la lista de avisos', async () => {
  const plugin = fingirTelefono();
  try {
    const state = casa();
    guardarAvisos(state, { encendido: true, hora: 23, minuto: 59 });
    // Comer fuera también es decidir: lo que se avisa es la indecisión.
    setStatusPlan(state, todayISO(), 'cena', 'outside');
    setStatusPlan(state, addDays(todayISO(), 1), 'cena', 'order');

    assert.equal(cenasSinDecidir(state), 5, 'decidir una cena no la quita de la cuenta');
    const salida = await programarRecordatorio(state);
    assert.equal(salida.cuantos, 5);
    assert.ok(!plugin.programadas.some(aviso => /la cena de hoy/.test(aviso.body)),
      'la cena de hoy ya estaba decidida y se avisa igual');
  } finally { quitarTelefono(); }
});

test('sin permiso no se programa, y no se miente diciendo que sí', async () => {
  fingirTelefono({ permiso: 'denied' });
  try {
    const state = casa();
    guardarAvisos(state, { encendido: true });
    const salida = await programarRecordatorio(state);
    assert.equal(salida.ok, false);
    assert.equal(salida.motivo, 'sin-permiso');
    assert.equal(salida.cuantos, 0);
    assert.equal(await permisoDeAvisos(), 'no');
  } finally { quitarTelefono(); }
});

test('volver a programar pisa lo anterior en vez de acumularlo', async () => {
  const plugin = fingirTelefono();
  try {
    const state = casa();
    guardarAvisos(state, { encendido: true, hora: 23, minuto: 59 });
    await programarRecordatorio(state);
    await programarRecordatorio(state);
    await programarRecordatorio(state);
    assert.equal(plugin.programadas.length, 7, 'los avisos se van acumulando en cada pasada');
  } finally { quitarTelefono(); }
});

/* ── Los permisos, que es lo que esto costó ────────────────────────────── */

test('el manifiesto declara cuatro permisos, y quita el de alarma exacta', () => {
  const manifiesto = leer('android', 'app', 'src', 'main', 'AndroidManifest.xml');

  for (const permiso of ['INTERNET', 'POST_NOTIFICATIONS']) {
    assert.ok(manifiesto.includes(`android.permission.${permiso}`), `falta ${permiso}`);
  }
  /* `SCHEDULE_EXACT_ALARM` lo declara el complemento de notificaciones por su
     cuenta y este manifiesto lo quita. Sirve para que un aviso salte al segundo,
     que a un recordatorio de «piensa la cena» no le hace ninguna falta, y la
     política de Play mira con lupa los permisos de alarma: el hermano
     `USE_EXACT_ALARM` solo se admite a despertadores, temporizadores y
     calendarios, y a los demás no les deja publicar.

     Quitarlo es seguro porque el complemento cae solo en la alarma inexacta
     —está leído en su código, no supuesto— pero además todos los avisos van con
     `isExactNotification: false`, que es la prueba de arriba. */
  assert.match(manifiesto, /SCHEDULE_EXACT_ALARM"\s+tools:node="remove"/,
    'volvió el permiso de alarma exacta al paquete');
  assert.ok(manifiesto.includes('xmlns:tools='), 'sin el espacio de nombres, el `tools:node` no hace nada');
});

test('los textos legales dejaron de prometer un solo permiso', () => {
  // Era verdad y dejó de serlo. Que un texto legal siga diciéndolo es
  // exactamente lo que `tests/legal.test.js` existe para impedir, y esta prueba
  // es la mitad concreta de eso.
  for (const archivo of [['src', 'legal.js'], ['legal', 'privacidad.html'], ['legal', 'index.html']]) {
    const texto = leer(...archivo);
    assert.ok(!/un permiso en total/i.test(texto), `${archivo.join('/')} sigue prometiendo un permiso en total`);
    assert.ok(!/[Pp]ide un solo permiso/.test(texto), `${archivo.join('/')} sigue prometiendo un solo permiso`);
  }
  // Y lo que sí hay que seguir diciendo, porque es lo que de verdad importa:
  // que el aviso lo prepara el propio teléfono y no sale de él.
  const privacidad = leer('legal', 'privacidad.html');
  assert.match(privacidad, /lo prepara tu propio teléfono/i, 'ya no se dice de dónde sale el aviso');
  assert.match(privacidad, /SCHEDULE_EXACT_ALARM/, 'ya no se dice qué permiso NO se pide');
});

test('el aviso se prepara en el teléfono: no hay segunda puerta a la red', () => {
  // El recordatorio no puede convertirse en la excusa para abrir un servidor de
  // notificaciones. Es local, y el módulo no sabe llamar a ninguna parte.
  const codigo = leer('src', 'recordatorio.js');
  assert.ok(!/fetch\(|XMLHttpRequest|firebase|fcm/i.test(codigo),
    'el recordatorio abrió una puerta a la red');
});
