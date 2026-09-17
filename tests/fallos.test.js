import test from 'node:test';
import assert from 'node:assert/strict';

// La red global, probada por donde se escapaban los fallos.
//
// El agujero que cierra: una acción declarada `async` —entrar en la cuenta,
// sincronizar, preguntarle algo al teléfono— devuelve una promesa, y el `try`
// que la llama termina antes de que esa promesa falle. El fallo no cae dentro
// del `try`: sale como «promesa rechazada sin recoger», donde hasta ahora no
// había absolutamente nadie.

import { anotar, falloAnterior, fallosRecientes, hayFallos, instalarRed, olvidarFallos, olvidarFalloAnterior, protegida, reiniciarRed } from '../src/fallos.js';

const esperar = () => new Promise(resolver => setTimeout(resolver, 0));

test('un fallo queda apuntado con lo que hace falta para arreglarlo', () => {
  olvidarFallos();
  anotar('accion:chat-escuchar', new TypeError('no es una función'), { pagina: 'hoy' });

  const [fila] = fallosRecientes();
  assert.equal(fila.donde, 'accion:chat-escuchar');
  assert.equal(fila.clase, 'TypeError');
  assert.equal(fila.mensaje, 'no es una función');
  assert.equal(fila.pagina, 'hoy');
  assert.ok(fila.pila.length > 0, 'sin la pila no se sabe de qué archivo salió');
  assert.ok(fila.cuando.includes('T'), 'la hora tiene que estar');
  olvidarFallos();
});

test('el cuaderno no crece sin fin', () => {
  olvidarFallos();
  for (let i = 0; i < 40; i++) anotar('prueba', new Error(`fallo ${i}`));
  const filas = fallosRecientes();
  assert.equal(filas.length, 8, 'ocho fallos son suficientes para entender qué pasó');
  assert.equal(filas[0].mensaje, 'fallo 39', 'el más reciente va primero');
  olvidarFallos();
});

test('anotar nunca lanza, ni con lo más raro que se le pase', () => {
  olvidarFallos();
  for (const raro of [null, undefined, 'texto suelto', 0, { sin: 'nada' }, Symbol('x')]) {
    assert.doesNotThrow(() => anotar('prueba', raro), `anotar lanzó con ${String(raro)}`);
  }
  assert.ok(hayFallos());
  olvidarFallos();
});

/* ── `protegida`: lo que envuelve cada acción del reparto de clics ─────── */

test('una acción que falla no tumba a quien la llamó, y queda apuntada', () => {
  olvidarFallos();
  const avisos = [];
  const rota = protegida('accion:probar', () => { throw new Error('se rompió'); }, fila => avisos.push(fila));

  assert.doesNotThrow(() => rota());
  assert.equal(fallosRecientes()[0].mensaje, 'se rompió');
  assert.equal(avisos.length, 1, 'quien llama tiene que poder decir algo');
  olvidarFallos();
});

// Esta es la que importa: el caso `async`, que es el que se escapaba.
test('una acción async que falla tampoco tumba a nadie', async () => {
  olvidarFallos();
  const avisos = [];
  const rota = protegida('accion:dictar', async () => { throw new Error('el micrófono se rompió'); }, fila => avisos.push(fila));

  await assert.doesNotReject(async () => rota());
  await esperar();

  assert.equal(fallosRecientes()[0].mensaje, 'el micrófono se rompió');
  assert.equal(avisos.length, 1);
  olvidarFallos();
});

test('una acción que va bien devuelve lo suyo y no apunta nada', async () => {
  olvidarFallos();
  assert.equal(protegida('prueba', () => 42)(), 42);
  assert.equal(await protegida('prueba', async () => 'listo')(), 'listo');
  assert.equal(hayFallos(), false, 'lo que funciona no deja rastro');
});

test('si avisar del fallo falla, el fallo sigue quedando apuntado', () => {
  olvidarFallos();
  const rota = protegida('prueba', () => { throw new Error('el de verdad'); }, () => { throw new Error('y el de avisar'); });
  assert.doesNotThrow(() => rota());
  assert.equal(fallosRecientes()[0].mensaje, 'el de verdad', 'el fallo original no puede perderse');
  olvidarFallos();
});

/* ── La red puesta sobre los eventos del navegador ─────────────────────── */

function montarVentana() {
  const oyentes = new Map();
  const antes = { addEventListener: globalThis.addEventListener, console: globalThis.console };
  globalThis.addEventListener = (evento, manejador) => {
    oyentes.set(evento, [...(oyentes.get(evento) || []), manejador]);
  };
  // La consola calla durante estas pruebas: `anotar` escribe ahí a propósito, y
  // no hace falta ver el ruido de un fallo provocado.
  globalThis.console = { ...globalThis.console, error: () => {} };
  return {
    emitir: (evento, datos) => { for (const manejador of oyentes.get(evento) || []) manejador(datos); },
    tiene: evento => (oyentes.get(evento) || []).length > 0,
    restaurar: () => { globalThis.addEventListener = antes.addEventListener; globalThis.console = antes.console; }
  };
}

test('la red recoge los errores sueltos y las promesas rechazadas', () => {
  reiniciarRed();
  const ventana = montarVentana();
  const avisos = [];
  try {
    assert.equal(instalarRed({ alFallar: fila => avisos.push(fila) }), true);
    assert.ok(ventana.tiene('error'), 'falta la red de los errores');
    assert.ok(ventana.tiene('unhandledrejection'), 'falta la red de las promesas');

    ventana.emitir('error', { error: new Error('desde un temporizador'), filename: 'src/sincronizar.js', lineno: 12 });
    ventana.emitir('unhandledrejection', { reason: new Error('desde la nube') });

    const filas = fallosRecientes();
    assert.equal(filas.length, 2);
    assert.equal(filas[0].donde, 'promesa');
    assert.equal(filas[0].mensaje, 'desde la nube');
    assert.equal(filas[1].donde, 'pantalla');
    assert.equal(filas[1].archivo, 'src/sincronizar.js');
    assert.equal(filas[1].linea, 12);
    assert.equal(avisos.length, 2, 'la aplicación tiene que enterarse de los dos');
  } finally { ventana.restaurar(); reiniciarRed(); }
});

test('un recurso que no carga no se cuenta como fallo de la aplicación', () => {
  reiniciarRed();
  const ventana = montarVentana();
  try {
    instalarRed({});
    // Así llega una imagen que no cargó: sin `error` y sin `message`.
    ventana.emitir('error', { target: { tagName: 'IMG' } });
    assert.equal(hayFallos(), false, 'una imagen rota no es un fallo de la app');
  } finally { ventana.restaurar(); reiniciarRed(); }
});

test('la red no se pone dos veces', () => {
  reiniciarRed();
  const ventana = montarVentana();
  try {
    assert.equal(instalarRed({}), true);
    assert.equal(instalarRed({}), false, 'ponerla dos veces duplicaría cada fallo');
  } finally { ventana.restaurar(); reiniciarRed(); }
});

test('si avisar del fallo falla, la red aguanta', () => {
  reiniciarRed();
  const ventana = montarVentana();
  try {
    instalarRed({ alFallar: () => { throw new Error('avisar se rompió'); } });
    assert.doesNotThrow(() => ventana.emitir('unhandledrejection', { reason: new Error('el de verdad') }));
    assert.equal(fallosRecientes()[0].mensaje, 'el de verdad');
  } finally { ventana.restaurar(); reiniciarRed(); }
});

/* ── El fallo nativo de la vez anterior ────────────────────────────────────

   Lo que el guardián de Android dejó apuntado cuando la aplicación se cerró
   entera. No es un fallo de una función: es el que no dejó proceso vivo donde
   apuntarlo, y por eso hay que ir a buscarlo al arrancar el siguiente. */

const CAPACITOR_ORIGINAL = globalThis.Capacitor;
const CONSOLA_ORIGINAL = globalThis.console;

// Un teléfono de mentira con el complemento que se le quiera poner dentro. La
// consola calla: `anotar` escribe ahí a propósito y aquí el fallo es provocado.
function montarAparato(aparato) {
  globalThis.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: aparato ? { Aparato: aparato } : {} };
  globalThis.console = { ...CONSOLA_ORIGINAL, error: () => {} };
}

function desmontarAparato() {
  if (CAPACITOR_ORIGINAL === undefined) delete globalThis.Capacitor;
  else globalThis.Capacitor = CAPACITOR_ORIGINAL;
  globalThis.console = CONSOLA_ORIGINAL;
  olvidarFallos();
}

test('el fallo que mató la aplicación se lee al arrancar la siguiente', async t => {
  let olvidado = false;
  montarAparato({
    async ultimoFallo() {
      return {
        hay: true, cuando: 1700000000000, clase: 'java.lang.NullPointerException',
        mensaje: 'Attempt to invoke virtual method on a null object reference',
        hilo: 'Binder:1234_2', principal: false, pila: 'at com.nexocore.quecomemos…'
      };
    },
    async olvidarFallo() { olvidado = true; }
  });
  t.after(desmontarAparato);

  const fallo = await falloAnterior();
  assert.equal(fallo.clase, 'java.lang.NullPointerException');
  assert.equal(fallo.principal, false, 'saber si murió el hilo principal es la mitad del diagnóstico');
  assert.ok(fallo.pila.length > 0);

  await olvidarFalloAnterior();
  assert.equal(olvidado, true, 'enseñar el mismo fallo en cada arranque para siempre es ruido');
});

test('sin fallo apuntado no se inventa ninguno', async t => {
  montarAparato({ async ultimoFallo() { return { hay: false }; } });
  t.after(desmontarAparato);
  assert.equal(await falloAnterior(), null);
});

test('sin el complemento Aparato tampoco pasa nada', async t => {
  montarAparato(null);
  t.after(desmontarAparato);
  assert.equal(await falloAnterior(), null);
  await assert.doesNotReject(() => olvidarFalloAnterior());
});

// Un guardián roto no puede llevarse por delante el arranque de la aplicación:
// es el último sitio donde se puede permitir un fallo sin red debajo.
test('un complemento Aparato que lanza no rompe el arranque', async t => {
  montarAparato({
    async ultimoFallo() { throw new Error('el guardián se rompió'); },
    async olvidarFallo() { throw new Error('y al olvidar también'); }
  });
  t.after(desmontarAparato);

  assert.equal(await falloAnterior(), null, 'un guardián roto no puede inventarse un fallo');
  await assert.doesNotReject(() => olvidarFalloAnterior());
  // Y lo que se rompió queda apuntado, que es de lo que va este archivo.
  assert.equal(fallosRecientes()[0].donde, 'telefono');
});
