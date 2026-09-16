import test from 'node:test';
import assert from 'node:assert/strict';
import { abrirAjustesDelTelefono, cancelarDictado, capacidad, comprobarDictado, diagnostico, dictar, estaEscuchando, falloAnterior, olvidarFalloAnterior, pararDictado, permisoDeVoz } from '../src/device.js';

// `device.js` habla con el teléfono a través de `globalThis.Capacitor`, así que
// aquí se le pone delante un complemento falso que la prueba gobierna: emite los
// eventos que se le pidan, en el orden que se le pida. Es la única forma de
// probar un motor de voz sin voz y sin teléfono.

const CAPACITOR_ORIGINAL = globalThis.Capacitor;

function restaurar() {
  if (CAPACITOR_ORIGINAL === undefined) delete globalThis.Capacitor;
  else globalThis.Capacitor = CAPACITOR_ORIGINAL;
}

function montarVoz(opciones = {}) {
  const oyentes = new Map();
  const voz = {
    llamadas: [],
    arranque: null,
    quitados: 0,

    async removeAllListeners() { voz.llamadas.push('removeAllListeners'); oyentes.clear(); },
    async addListener(evento, manejador) {
      voz.llamadas.push(`addListener:${evento}`);
      oyentes.set(evento, [...(oyentes.get(evento) || []), manejador]);
      return {
        remove: async () => {
          voz.quitados += 1;
          oyentes.set(evento, (oyentes.get(evento) || []).filter(otro => otro !== manejador));
        }
      };
    },
    async available() { voz.llamadas.push('available'); return { available: opciones.servicio !== false }; },
    async isOnDeviceRecognitionAvailable() { return { available: Boolean(opciones.local) }; },
    async checkPermissions() { return { speechRecognition: opciones.permiso || 'granted' }; },
    async requestPermissions() { return { speechRecognition: opciones.permisoPedido || opciones.permiso || 'granted' }; },
    async start(argumentos) {
      voz.llamadas.push('start');
      voz.arranque = argumentos;
      // El complemento de verdad, con `partialResults: true`, resuelve esto nada
      // más abrir el micrófono y con la carga vacía. El falso hace lo mismo.
      return opciones.alArrancar ? opciones.alArrancar(voz) || {} : {};
    },
    async stop() { voz.llamadas.push('stop'); opciones.alParar?.(voz); },
    async forceStop() { voz.llamadas.push('forceStop'); },
    async getLastPartialResult() {
      voz.llamadas.push('getLastPartialResult');
      return opciones.ultimoParcial || { available: false, text: '' };
    },
    async isListening() { return { listening: false }; },

    // ── Palancas de la prueba, no del complemento ──
    emitir(evento, datos) { for (const manejador of [...(oyentes.get(evento) || [])]) manejador(datos); },
    cuantos(evento) { return (oyentes.get(evento) || []).length; },
    oyentesPuestos() { let total = 0; for (const lista of oyentes.values()) total += lista.length; return total; }
  };
  globalThis.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { SpeechRecognition: voz } };
  return voz;
}

// Deja correr las promesas pendientes. `dictar` encadena varias esperas antes de
// abrir el micrófono —servicio, permiso, idioma local, oyentes—, y hasta que
// pasan no hay a quién emitirle nada.
const tic = async (veces = 4) => { for (let i = 0; i < veces; i += 1) await new Promise(seguir => setTimeout(seguir, 0)); };

// Un dictado entero de principio a fin, que es lo que hace falta repetir.
async function dictadoCompleto(voz, texto) {
  const promesa = dictar({});
  await tic();
  voz.emitir('listeningState', { state: 'started', reason: 'userStart' });
  voz.emitir('partialResults', { matches: [texto] });
  voz.emitir('listeningState', { state: 'stopped', reason: 'results' });
  return promesa;
}

/* ── Lo que el aparato promete ─────────────────────────────────────────────── */

// Esta prueba va la primera a propósito: comprueba el arranque en frío, cuando
// nadie le ha preguntado todavía al teléfono si entiende sin conexión.
test('mientras nadie lo haya comprobado, no se promete que el dictado funcione sin conexión', async t => {
  const voz = montarVoz({ local: false });
  t.after(restaurar);

  const antes = capacidad('dictar');
  assert.equal(antes.ok, true);
  assert.equal(antes.local, null, 'todavía no se sabe, y «no se sabe» no es «no»');
  assert.ok(!/no necesita conexión/i.test(antes.detalle), 'no se promete lo que no se ha comprobado');

  const comprobado = await comprobarDictado({ idioma: 'es-DO' });
  assert.equal(comprobado.local, false);
  assert.equal(comprobado.permiso, 'granted');
  assert.equal(capacidad('dictar').local, false);
  assert.match(capacidad('dictar').detalle, /necesita conexión para entender la voz/i);
  assert.equal(voz.llamadas.includes('available'), true);
});

test('en un teléfono que sí entiende sin conexión, se dice y se le pide al motor', async t => {
  const voz = montarVoz({ local: true });
  t.after(restaurar);

  await comprobarDictado({ idioma: 'es-DO' });
  assert.match(capacidad('dictar').detalle, /no necesita conexión/i);

  const resultado = await dictadoCompleto(voz, 'treinta plátanos maduros');
  assert.equal(resultado.ok, true);
  assert.equal(resultado.local, true);
  assert.equal(voz.arranque.useOnDeviceRecognition, true);
});

test('si el teléfono no trae el idioma dentro, no se pide el reconocimiento local', async t => {
  const voz = montarVoz({ local: false });
  t.after(restaurar);

  await dictadoCompleto(voz, 'diez libras de arroz');
  // Pedirlo a ciegas hace que el complemento rechace el arranque entero con
  // `UNSUPPORTED_LOCALE`: preguntar antes es lo que evita ese fallo.
  assert.equal(voz.arranque.useOnDeviceRecognition, false);
});

test('en un aparato sin dictado se dice, y nada revienta hacia fuera', async t => {
  globalThis.Capacitor = { isNativePlatform: () => false, Plugins: {} };
  t.after(restaurar);

  const resultado = await dictar({});
  assert.equal(resultado.ok, false);
  assert.match(resultado.error, /micrófono del teclado/i);
  // Escribir a mano tiene que seguir siendo posible: de aquí nunca sale una
  // excepción que tumbe la pantalla donde se escribe.
  await assert.doesNotReject(() => pararDictado());
  await assert.doesNotReject(() => cancelarDictado());
});

/* ── Permisos ──────────────────────────────────────────────────────────────── */

test('con el permiso concedido se abre el micrófono en modo parcial y sin ventana del sistema', async t => {
  const voz = montarVoz({ local: true, alArrancar: motor => motor.emitir('listeningState', { state: 'started', reason: 'userStart' }) });
  t.after(restaurar);

  const estados = [];
  const promesa = dictar({ idioma: 'es-DO', onEstado: estado => estados.push(estado) });
  await tic();

  assert.equal((await permisoDeVoz()).ok, true);
  assert.equal(voz.arranque.partialResults, true, 'sin parciales no hay texto en pantalla mientras se habla');
  assert.equal(voz.arranque.popup, false, 'la app enseña su propio indicador');
  assert.equal(voz.arranque.language, 'es-DO');
  assert.ok(estados.includes('escuchando'), 'la interfaz tiene que poder decir «escuchando…»');

  voz.emitir('partialResults', { matches: ['seis latas de atún'] });
  voz.emitir('listeningState', { state: 'stopped', reason: 'results' });
  const resultado = await promesa;
  assert.equal(resultado.ok, true);
  assert.ok(estados.includes('procesando'));
});

test('si se niega el permiso se explica qué hacer y no se abre el micrófono', async t => {
  const voz = montarVoz({ permiso: 'denied' });
  t.after(restaurar);

  const permiso = await permisoDeVoz();
  assert.equal(permiso.ok, false);
  assert.equal(permiso.motivo, 'denegado', 'denegado no es lo mismo que no haber podido preguntar');

  const resultado = await dictar({});
  assert.equal(resultado.ok, false);
  assert.match(resultado.error, /permiso del micrófono/i);
  assert.match(resultado.error, /ajustes del teléfono|a mano/i, 'un aviso sin salida no sirve');
  assert.equal(voz.llamadas.includes('start'), false, 'sin permiso no se abre nada');
});

test('no poder preguntar por el permiso se distingue de que lo nieguen', async t => {
  const voz = montarVoz({});
  voz.checkPermissions = async () => { throw new Error('bridge not ready'); };
  t.after(restaurar);

  const permiso = await permisoDeVoz();
  assert.equal(permiso.ok, false);
  assert.equal(permiso.motivo, 'error');
  assert.match(permiso.detalle, /cerrar y abrir la aplicación|a mano/i);
});

test('un teléfono sin reconocimiento de voz lo dice en vez de intentarlo igual', async t => {
  const voz = montarVoz({ servicio: false });
  t.after(restaurar);

  const resultado = await dictar({});
  assert.equal(resultado.ok, false);
  assert.match(resultado.error, /no trae reconocimiento de voz/i);
  assert.equal(voz.llamadas.includes('start'), false);
  // Que el complemento esté colgado de `window` no prueba que el servicio exista.
  assert.equal(voz.llamadas.includes('available'), true);
});

/* ── El fallo original, escrito como prueba ────────────────────────────────── */

test('el oyente de parciales sigue puesto después de arrancar y hasta el resultado', async t => {
  // Esta es la regresión del fallo que rompía el dictado en el APK. Con
  // `partialResults: true` el complemento resuelve `start()` nada más abrir el
  // micrófono, con la carga vacía; el código de antes leía ahí el resultado, lo
  // encontraba vacío, informaba «No entendí nada» y retiraba el oyente en el
  // `finally`. Todo lo que la persona dijera después caía en el vacío.
  const voz = montarVoz({ local: true, alArrancar: motor => motor.emitir('listeningState', { state: 'started', reason: 'userStart' }) });
  t.after(restaurar);

  const oido = [];
  const promesa = dictar({ onParcial: trozo => oido.push(trozo) });
  await tic();

  assert.equal(voz.llamadas.includes('start'), true, 'el micrófono ya se abrió y `start()` ya resolvió');
  assert.equal(voz.cuantos('partialResults'), 1, 'y aun así el oyente sigue puesto');

  voz.emitir('partialResults', { matches: ['treinta plátanos'] });
  voz.emitir('partialResults', { matches: ['treinta plátanos y diez libras de arroz'] });
  assert.deepEqual(oido, ['treinta plátanos', 'treinta plátanos y diez libras de arroz'],
    'lo que se dice después de arrancar es justo lo que antes se perdía');

  voz.emitir('listeningState', { state: 'stopped', reason: 'results' });
  const resultado = await promesa;
  assert.equal(resultado.ok, true);
  assert.equal(resultado.texto, 'treinta plátanos y diez libras de arroz');
  assert.equal(resultado.parcial, false, 'el motor lo dio por final antes de cerrar');
  assert.equal(voz.cuantos('partialResults'), 0, 'y al terminar sí se retira');
});

/* ── Cómo acaba cada sesión ────────────────────────────────────────────────── */

test('lo que se va oyendo llega a la pantalla antes de que termine el dictado', async t => {
  const voz = montarVoz({ local: true });
  t.after(restaurar);

  const oido = [];
  const promesa = dictar({ onParcial: trozo => oido.push(trozo) });
  await tic();
  voz.emitir('partialResults', { matches: ['cuatro paquetes'] });
  assert.deepEqual(oido, ['cuatro paquetes'], 'el parcial se entrega en el momento, no al final');

  // Cuando el complemento acumula tandas, manda el acumulado: si no, la segunda
  // tanda borraría la primera en el cuadro de texto.
  voz.emitir('partialResults', { matches: ['de salami'], accumulatedText: 'cuatro paquetes de salami' });
  assert.equal(oido.at(-1), 'cuatro paquetes de salami');

  voz.emitir('listeningState', { state: 'stopped', reason: 'results' });
  assert.equal((await promesa).texto, 'cuatro paquetes de salami');
});

test('parar a mano devuelve lo que se llevaba oído', async t => {
  const voz = montarVoz({
    local: true,
    // Parar cierra el micrófono y el motor avisa de que se detuvo.
    alParar: motor => motor.emitir('listeningState', { state: 'stopped', reason: 'userStop' })
  });
  t.after(restaurar);

  const promesa = dictar({});
  await tic();
  voz.emitir('partialResults', { matches: ['treinta huevos'] });
  await pararDictado();

  const resultado = await promesa;
  assert.equal(resultado.ok, true, 'parar no es cancelar: lo dicho se queda');
  assert.equal(resultado.texto, 'treinta huevos');
  assert.equal(resultado.parcial, true, 'nadie confirmó que fuera el final, y eso se dice');
  assert.equal(voz.oyentesPuestos(), 0);
});

test('un silencio se cuenta como silencio y se explica qué hacer', async t => {
  const voz = montarVoz({ local: true });
  t.after(restaurar);

  const promesa = dictar({});
  await tic();
  voz.emitir('listeningState', { state: 'stopped', reason: 'silence' });

  const resultado = await promesa;
  assert.equal(resultado.ok, false);
  assert.match(resultado.error, /no se oyó nada/i);
  assert.match(resultado.error, /a mano|micrófono/i);
  assert.equal(voz.oyentesPuestos(), 0, 'una sesión sin texto tampoco deja oyentes colgando');
});

test('un error después de haber oído algo no borra lo oído', async t => {
  const voz = montarVoz({ local: true });
  t.after(restaurar);

  const promesa = dictar({});
  await tic();
  voz.emitir('partialResults', { matches: ['diez libras de arroz'] });
  voz.emitir('error', { code: 'NETWORK', message: 'Network error', sessionId: 1 });

  const resultado = await promesa;
  assert.equal(resultado.ok, true, 'lo único que la persona llegó a decir no se tira');
  assert.equal(resultado.texto, 'diez libras de arroz');
  assert.equal(resultado.parcial, true);
  assert.match(resultado.aviso, /conexión/i);
  assert.ok(!/NETWORK/.test(resultado.aviso), 'al usuario no se le enseñan códigos crudos');
});

test('un error sin nada oído se traduce a una frase que sirve', async t => {
  const voz = montarVoz({ local: true });
  t.after(restaurar);

  const promesa = dictar({});
  await tic();
  voz.emitir('error', { code: 'INSUFFICIENT_PERMISSIONS', message: 'Insufficient permissions', sessionId: 1 });

  const resultado = await promesa;
  assert.equal(resultado.ok, false);
  assert.match(resultado.error, /permiso del micrófono/i);
  assert.ok(!/INSUFFICIENT/.test(resultado.error));
});

test('si el evento de parciales se pierde, el último parcial guardado salva la frase', async t => {
  const voz = montarVoz({ local: true, ultimoParcial: { available: true, text: 'seis latas de atún' } });
  t.after(restaurar);

  const promesa = dictar({});
  await tic();
  // Ni un solo `partialResults`: el motor cierra la sesión sin haber avisado.
  voz.emitir('listeningState', { state: 'stopped', reason: 'results' });

  const resultado = await promesa;
  assert.equal(resultado.ok, true);
  assert.equal(resultado.texto, 'seis latas de atún');
  assert.equal(resultado.parcial, true);
  assert.equal(voz.llamadas.includes('getLastPartialResult'), true);
});

/* ── Reintentos y limpieza ─────────────────────────────────────────────────── */

test('dos dictados seguidos funcionan igual y no acumulan oyentes', async t => {
  const voz = montarVoz({ local: true });
  t.after(restaurar);

  const primero = await dictadoCompleto(voz, 'treinta plátanos maduros');
  assert.equal(primero.ok, true);
  assert.equal(primero.texto, 'treinta plátanos maduros');
  assert.equal(voz.oyentesPuestos(), 0);

  const promesa = dictar({});
  await tic();
  assert.equal(voz.cuantos('partialResults'), 1, 'el segundo dictado no hereda el oyente del primero');
  assert.equal(voz.cuantos('listeningState'), 1);
  voz.emitir('partialResults', { matches: ['diez libras de arroz'] });
  voz.emitir('listeningState', { state: 'stopped', reason: 'results' });

  const segundo = await promesa;
  assert.equal(segundo.ok, true);
  assert.equal(segundo.texto, 'diez libras de arroz');
  assert.equal(voz.oyentesPuestos(), 0);
  // Antes de poner los suyos, cada sesión barre lo que hubiera quedado.
  assert.equal(voz.llamadas.filter(nombre => nombre === 'removeAllListeners').length >= 2, true);
});

test('cerrar el modal mientras escucha para el motor y no deja oyentes', async t => {
  const voz = montarVoz({ local: true });
  t.after(restaurar);

  const promesa = dictar({});
  await tic();
  voz.emitir('partialResults', { matches: ['cuatro paquetes de salami'] });
  assert.equal(voz.cuantos('partialResults'), 1);

  await cancelarDictado();

  const resultado = await promesa;
  assert.equal(resultado.ok, false, 'cerrar la pantalla no es terminar de dictar');
  assert.equal(resultado.cancelado, true);
  assert.equal(resultado.texto, 'cuatro paquetes de salami', 'se devuelve por si a quien llama le sirve');
  assert.equal(voz.oyentesPuestos(), 0, 'ni un oyente vivo apuntando a una pantalla cerrada');
  assert.equal(voz.llamadas.includes('stop'), true, 'y el micrófono queda cerrado');
});

test('después de cancelar, el siguiente dictado arranca limpio', async t => {
  const voz = montarVoz({ local: true });
  t.after(restaurar);

  const cancelado = dictar({});
  await tic();
  await cancelarDictado();
  assert.equal((await cancelado).cancelado, true);

  const resultado = await dictadoCompleto(voz, 'treinta huevos');
  assert.equal(resultado.ok, true);
  assert.equal(resultado.texto, 'treinta huevos');
  assert.equal(voz.cuantos('partialResults'), 0);
});

/* ── El respaldo del navegador, para probar en la computadora ──────────────── */

const VOZ_DEL_NAVEGADOR_ORIGINAL = globalThis.SpeechRecognition;

function restaurarNavegador() {
  if (VOZ_DEL_NAVEGADOR_ORIGINAL === undefined) delete globalThis.SpeechRecognition;
  else globalThis.SpeechRecognition = VOZ_DEL_NAVEGADOR_ORIGINAL;
}

function montarVozDelNavegador() {
  const creados = [];
  class MotorFalso {
    constructor() { this.parado = false; this.abortado = false; creados.push(this); }
    start() { this.onstart?.(); }
    stop() { this.parado = true; }
    abort() { this.abortado = true; }
    // Palanca de la prueba: así habla la persona.
    decir(texto, final = false) { this.onresult?.({ results: [{ 0: { transcript: texto }, isFinal: final }] }); }
    get suelto() { return !this.onresult && !this.onerror && !this.onend; }
  }
  globalThis.SpeechRecognition = MotorFalso;
  globalThis.Capacitor = { isNativePlatform: () => false, Plugins: {} };
  return creados;
}

test('en el navegador, un error tampoco borra lo que se llegó a decir', async t => {
  const motores = montarVozDelNavegador();
  t.after(restaurar);
  t.after(restaurarNavegador);

  const oido = [];
  const promesa = dictar({ onParcial: trozo => oido.push(trozo) });
  await tic(1);
  const motor = motores[0];
  motor.decir('treinta plátanos maduros');
  motor.onerror({ error: 'network' });

  const resultado = await promesa;
  assert.equal(resultado.ok, true);
  assert.equal(resultado.origen, 'navegador');
  assert.equal(resultado.texto, 'treinta plátanos maduros');
  assert.equal(resultado.parcial, true);
  assert.deepEqual(oido, ['treinta plátanos maduros']);
  assert.equal(motor.suelto, true, 'no queda ningún manejador escribiendo en una pantalla cerrada');
});

test('en el navegador se puede parar a mano y cerrar la pantalla', async t => {
  const motores = montarVozDelNavegador();
  t.after(restaurar);
  t.after(restaurarNavegador);

  const primera = dictar({});
  await tic(1);
  motores[0].decir('diez libras de arroz', true);
  await pararDictado();
  assert.equal(motores[0].parado, true);
  motores[0].onend();
  const parada = await primera;
  assert.equal(parada.ok, true);
  assert.equal(parada.texto, 'diez libras de arroz');
  assert.equal(parada.parcial, false, 'el navegador sí marcó ese trozo como final');

  const segunda = dictar({});
  await tic(1);
  motores[1].decir('seis latas de atún');
  await cancelarDictado();
  const cancelada = await segunda;
  assert.equal(cancelada.ok, false);
  assert.equal(cancelada.cancelado, true);
  assert.equal(motores[1].abortado, true);
  assert.equal(motores[1].suelto, true);
});

/* ── Diagnóstico ───────────────────────────────────────────────────────────── */

test('el diagnóstico guarda el código del fallo y el motor, nunca lo que se dijo', async t => {
  const voz = montarVoz({ local: false });
  t.after(restaurar);

  const promesa = dictar({ idioma: 'es-DO' });
  await tic();
  voz.emitir('partialResults', { matches: ['treinta plátanos maduros'] });
  voz.emitir('error', { code: 'RECOGNIZER_BUSY', message: 'RecognitionService busy', sessionId: 7 });
  await promesa;

  const parte = diagnostico();
  assert.equal(parte.plataforma, 'Aplicación instalada (android)');
  assert.equal(parte.complementos.SpeechRecognition, true);
  assert.equal(parte.voz.reconocimientoLocal, false);
  assert.equal(parte.voz.escuchando, false);
  assert.equal(parte.voz.ultimoMotor.origen, 'telefono');
  assert.equal(parte.voz.ultimoMotor.idioma, 'es-DO');
  assert.equal(parte.voz.ultimoError.codigo, 'RECOGNIZER_BUSY');

  const entero = JSON.stringify(parte);
  assert.ok(!/plátanos/i.test(entero), 'el diagnóstico no guarda ni audio ni lo que se dictó');
  // Y la cámara y las facturas ya no existen en este archivo.
  assert.equal(parte.leerFoto, undefined);
  assert.equal(parte.camara, undefined);
  assert.equal(capacidad('leer-foto').ok, false);
});


/* ── Que ninguna pregunta al teléfono se quede colgada ─────────────────────

   Este era el otro fallo que dejaba la aplicación inservible al dictar, y el
   único de los dos que era nuestro.

   `isOnDeviceRecognitionAvailable()` resuelve su promesa desde dentro de un
   `RecognitionSupportCallback` de Android. Un teléfono cuyo servicio de voz
   está roto o ausente —que es justo el teléfono que hay que sobrevivir— no llama
   a ese callback nunca. Sin tope, la promesa se quedaba colgada para siempre, y
   con ella la persona: «Preparando el micrófono…» sin nada que tocar, porque
   parar no hace nada con el micrófono todavía sin abrir.

   Las dos pruebas de abajo adelantan el reloj en vez de esperar los seis
   segundos de verdad. `setImmediate` para soltar las microtareas, porque
   `setTimeout` está fingido y no se puede usar para eso. */

const soltar = async (veces = 8) => { for (let i = 0; i < veces; i += 1) await new Promise(seguir => setImmediate(seguir)); };

// Una promesa que no se resuelve jamás: lo que devuelve un complemento cuyo
// servicio nativo acepta la llamada y no vuelve.
const nuncaContesta = () => new Promise(() => {});

test('una pregunta que el teléfono no contesta se rinde en vez de colgarse', async t => {
  const voz = montarVoz({ local: true });
  voz.isOnDeviceRecognitionAvailable = nuncaContesta;
  t.after(restaurar);
  t.mock.timers.enable({ apis: ['setTimeout'] });

  const promesa = comprobarDictado({ idioma: 'es-DO' });
  await soltar();
  t.mock.timers.tick(6001);
  await soltar();

  const salida = await promesa;
  assert.equal(salida.ok, true, 'que no conteste esa pregunta no impide dictar');
  assert.equal(salida.local, null, 'sin respuesta es «no se sabe», que no es «no»');
});

test('un dictado contra un complemento mudo termina con una frase que enseñar', async t => {
  const voz = montarVoz();
  // Ni el servicio ni el permiso contestan: el teléfono está completamente mudo.
  voz.available = nuncaContesta;
  voz.checkPermissions = nuncaContesta;
  voz.requestPermissions = nuncaContesta;
  t.after(restaurar);
  t.mock.timers.enable({ apis: ['setTimeout'] });

  const promesa = dictar({ idioma: 'es-DO' });
  // Un tope por cada pregunta que no contesta.
  for (let i = 0; i < 4; i += 1) { await soltar(); t.mock.timers.tick(90001); }
  await soltar();

  const salida = await promesa;
  assert.equal(salida.ok, false);
  assert.ok(salida.error.length > 20, 'tiene que haber una frase en español que enseñar');
  assert.ok(!/undefined|null|\[object/.test(salida.error), `el aviso no puede traer jerga: ${salida.error}`);
});

/* ── Que un permiso se explique según por qué falló ────────────────────── */

test('el permiso que no se puede consultar da una frase, no una excepción', async t => {
  const voz = montarVoz();
  voz.checkPermissions = async () => { throw new Error('el puente se rompió'); };
  t.after(restaurar);

  const salida = await permisoDeVoz();
  assert.equal(salida.ok, false);
  assert.equal(salida.motivo, 'error');
  assert.ok(/mano|ajustes/i.test(salida.detalle), 'tiene que ofrecer una salida');
});

test('un permiso denegado se distingue de un permiso que no se pudo preguntar', async t => {
  montarVoz({ permiso: 'denied', permisoPedido: 'denied' });
  t.after(restaurar);

  const salida = await permisoDeVoz();
  assert.equal(salida.ok, false);
  assert.equal(salida.motivo, 'denegado', 'los dos casos llevan a consejos distintos');
});

/* ── Los ajustes del teléfono ──────────────────────────────────────────── */

test('sin el complemento Aparato, abrir los ajustes dice que no se pudo', async t => {
  montarVoz();
  t.after(restaurar);
  const salida = await abrirAjustesDelTelefono();
  assert.equal(salida.ok, false);
  assert.equal(salida.motivo, 'no-disponible');
});

test('con el complemento Aparato, los ajustes se abren', async t => {
  montarVoz();
  globalThis.Capacitor.Plugins.Aparato = { async abrirAjustes() { return { abierto: true }; } };
  t.after(restaurar);
  assert.equal((await abrirAjustesDelTelefono()).ok, true);
});

test('un complemento Aparato que lanza no rompe nada', async t => {
  montarVoz();
  globalThis.Capacitor.Plugins.Aparato = { async abrirAjustes() { throw new Error('roto'); } };
  t.after(restaurar);
  const salida = await abrirAjustesDelTelefono();
  assert.equal(salida.ok, false);
  assert.equal(salida.motivo, 'fallo');
});

/* ── El fallo nativo de la vez anterior ────────────────────────────────── */

test('el fallo que mató la aplicación se lee al arrancar la siguiente', async t => {
  montarVoz();
  let olvidado = false;
  globalThis.Capacitor.Plugins.Aparato = {
    async ultimoFallo() {
      return {
        hay: true, cuando: 1700000000000, clase: 'java.lang.NullPointerException',
        mensaje: 'Attempt to invoke virtual method on a null object reference',
        hilo: 'Binder:1234_2', principal: false, pila: 'at app.capgo.speechrecognition…'
      };
    },
    async olvidarFallo() { olvidado = true; }
  };
  t.after(restaurar);

  const fallo = await falloAnterior();
  assert.equal(fallo.clase, 'java.lang.NullPointerException');
  assert.equal(fallo.principal, false, 'saber si murió el hilo principal es la mitad del diagnóstico');
  assert.ok(fallo.pila.length > 0);

  await olvidarFalloAnterior();
  assert.equal(olvidado, true, 'enseñar el mismo fallo en cada arranque para siempre es ruido');
});

test('sin fallo apuntado no se inventa ninguno', async t => {
  montarVoz();
  globalThis.Capacitor.Plugins.Aparato = { async ultimoFallo() { return { hay: false }; } };
  t.after(restaurar);
  assert.equal(await falloAnterior(), null);
});

test('sin el complemento Aparato tampoco pasa nada', async t => {
  montarVoz();
  t.after(restaurar);
  assert.equal(await falloAnterior(), null);
  await assert.doesNotReject(() => olvidarFalloAnterior());
});

/* ── El micrófono no se queda abierto por detrás ───────────────────────── */

test('estaEscuchando dice la verdad antes, durante y después', async t => {
  const voz = montarVoz();
  t.after(restaurar);

  assert.equal(estaEscuchando(), false);
  const promesa = dictar({ idioma: 'es-DO' });
  await tic();
  assert.equal(estaEscuchando(), true, 'con el micrófono abierto tiene que decirlo');

  voz.emitir('listeningState', { state: 'stopped', reason: 'results' });
  await promesa;
  assert.equal(estaEscuchando(), false, 'y al cerrarse, también');
});

test('cancelar antes de que el micrófono se abra impide que se abra', async t => {
  const voz = montarVoz({ permiso: 'prompt' });
  let conceder;
  voz.requestPermissions = () => new Promise(resolver => { conceder = () => resolver({ speechRecognition: 'granted' }); });
  t.after(restaurar);

  const promesa = dictar({ idioma: 'es-DO' });
  await tic();
  assert.ok(typeof conceder === 'function', 'la prueba debería estar esperando en el permiso');
  assert.ok(!voz.llamadas.includes('start'), 'el micrófono no debería haberse abierto todavía');

  await cancelarDictado();
  conceder();
  const salida = await promesa;

  assert.ok(!voz.llamadas.includes('start'), 'tras cancelar, el micrófono NO puede abrirse');
  assert.equal(salida.ok, false);
  assert.equal(salida.cancelado, true);
});
