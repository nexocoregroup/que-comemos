import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AVISO_ENVIO, CAPABILITIES, CONFIG_KEY, ESPERAS, callProvider, describeConfig, isConfigured, readConfig, writeConfig } from '../src/providers.js';

// Un localStorage de mentira, igual que el de model.test.js: la configuración
// del servicio se guarda en el dispositivo y hay que poder probarla sin
// navegador.
function almacenamiento(inicial = {}) {
  const memoria = new Map(Object.entries(inicial));
  return { memoria, getItem: clave => memoria.get(clave) ?? null, setItem: (clave, valor) => memoria.set(clave, valor) };
}

// Una red de mentira. Recibe una respuesta o una lista de respuestas —la última
// se repite— y apunta cada llamada para poder revisar la dirección, el método y
// las cabeceras.
function red(respuestas) {
  const cola = Array.isArray(respuestas) ? [...respuestas] : [respuestas];
  const falso = async (url, init) => {
    falso.llamadas.push({ url, init });
    const siguiente = cola.length > 1 ? cola.shift() : cola[0];
    return typeof siguiente === 'function' ? siguiente(url, init) : siguiente;
  };
  falso.llamadas = [];
  globalThis.fetch = falso;
  return falso;
}
const respuestaOk = datos => ({ ok: true, status: 200, json: async () => datos });
const respuestaError = status => ({ ok: false, status, json: async () => ({}) });
// Cuenta los intentos sin esperar de verdad: probar una espera de segundo y
// medio no puede costar segundo y medio.
function reloj() {
  const esperas = [];
  return { esperas, pausa: async ms => { esperas.push(ms); } };
}

const SERVICIO = { baseUrl: 'https://mi-servicio.ejemplo', enabled: { transcribe: true, chat: true }, provider: 'backend' };
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });

test('la configuración por defecto no tiene dirección, ni token, ni capacidades activas', () => {
  const config = readConfig(almacenamiento());
  assert.equal(config.baseUrl, '');
  assert.equal(config.token, '');
  assert.deepEqual(config.enabled, { transcribe: false, chat: false });
  // Por defecto apunta al backend propio, no al simulador: nadie debería
  // encontrarse con respuestas inventadas sin haberlas pedido.
  assert.equal(config.provider, 'backend');
  assert.equal(readConfig(undefined).baseUrl, '', 'sin almacenamiento tampoco revienta');
});

test('una configuración ilegible se lee como si no hubiera nada', () => {
  const guardado = almacenamiento({ [CONFIG_KEY]: '{esto no es json' });
  assert.deepEqual(readConfig(guardado), readConfig(almacenamiento()));
});

test('escribir la configuración la limpia: barra final, espacios y valores raros', () => {
  const guardado = almacenamiento();
  const escrita = writeConfig({ baseUrl: '  https://mi-servicio.ejemplo/// ', token: ' abc ', enabled: { chat: 'sí', transcribe: true, inventada: true }, provider: 'otro' }, guardado);
  assert.equal(escrita.baseUrl, 'https://mi-servicio.ejemplo');
  assert.equal(escrita.token, 'abc');
  assert.deepEqual(escrita.enabled, { transcribe: true, chat: false }, 'solo el booleano verdadero activa; «sí» no es true');
  assert.equal(escrita.provider, 'backend');
  assert.deepEqual(readConfig(guardado), escrita, 'lo que se guarda es lo que se vuelve a leer');
});

test('isConfigured es falso sin dirección, aunque la capacidad esté activada', () => {
  const activadas = { transcribe: true, chat: true };
  assert.equal(isConfigured('chat', { baseUrl: '', enabled: activadas }), false);
  assert.equal(isConfigured('chat', { ...SERVICIO, enabled: { ...activadas, chat: false } }), false);
  assert.equal(isConfigured('chat', SERVICIO), true);
  assert.equal(isConfigured('inventada', SERVICIO), false);
  // El simulador no configura nada: responde, pero con datos falsos.
  assert.equal(isConfigured('chat', { baseUrl: '', enabled: activadas, provider: 'mock' }), false);
});

test('el simulador no toca la red y marca cada respuesta como simulada', async () => {
  const falso = red(respuestaOk({ texto: 'real' }));
  const config = { ...SERVICIO, provider: 'mock' };
  for (const capacidad of CAPABILITIES) {
    const resultado = await callProvider(capacidad, { audio: 'xxx' }, { config });
    assert.equal(resultado.ok, true);
    assert.equal(resultado.provider, 'mock');
    assert.equal(resultado.data.simulated, true, 'quien lo consuma tiene que poder avisar al usuario');
    const textos = JSON.stringify(resultado.data);
    assert.ok(textos.includes('[simulado]'), `${capacidad} se ve simulado además de estar marcado`);
  }
  assert.equal(falso.llamadas.length, 0, 'el simulador existe justamente para no gastar servicio');
  const primera = await callProvider('transcribe', {}, { config });
  primera.data.texto = 'manoseado';
  assert.equal((await callProvider('transcribe', {}, { config })).data.texto, '[simulado] dos libras de arroz');
});

test('una respuesta correcta devuelve ok, los datos y el tiempo que tardó', async () => {
  red(respuestaOk({ texto: 'dos libras de arroz', confianza: 0.9 }));
  const resultado = await callProvider('transcribe', { audio: 'AAAA', mimeType: 'audio/webm', idioma: 'es-DO' }, { config: SERVICIO });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.provider, 'backend');
  assert.equal(resultado.data.texto, 'dos libras de arroz');
  assert.equal(resultado.data.simulated, undefined, 'lo real no se marca como simulado');
  assert.ok(Number.isFinite(resultado.ms));
});

test('un 401 no se reintenta', async () => {
  const falso = red(respuestaError(401));
  const { esperas, pausa } = reloj();
  const resultado = await callProvider('chat', {}, { config: SERVICIO, retries: 2, pausa });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.code, 'no-autorizado');
  assert.equal(resultado.retryable, false);
  assert.equal(resultado.error, 'El servicio rechazó la petición (clave no válida).');
  assert.equal(falso.llamadas.length, 1, 'una clave vencida va a fallar igual tres veces');
  assert.deepEqual(esperas, []);
});

test('un 400 no se reintenta', async () => {
  const falso = red(respuestaError(400));
  const resultado = await callProvider('transcribe', {}, { config: SERVICIO, retries: 2, pausa: reloj().pausa });
  assert.equal(resultado.code, 'peticion-invalida');
  assert.equal(resultado.retryable, false);
  assert.equal(falso.llamadas.length, 1);
});

test('un 503 se reintenta con espera creciente y termina en fallo', async () => {
  const falso = red(respuestaError(503));
  const { esperas, pausa } = reloj();
  const resultado = await callProvider('chat', {}, { config: SERVICIO, retries: 2, pausa });
  assert.equal(falso.llamadas.length, 3, 'el intento original y los dos reintentos');
  assert.deepEqual(esperas, ESPERAS, 'medio segundo y luego segundo y medio');
  assert.equal(resultado.ok, false);
  assert.equal(resultado.code, 'servicio-caido');
  assert.equal(resultado.retryable, true, 'agotados los reintentos sigue siendo algo que puede salir bien después');
  // Por defecto es un solo reintento: dos llamadas en total.
  const otra = red(respuestaError(503));
  await callProvider('chat', {}, { config: SERVICIO, pausa });
  assert.equal(otra.llamadas.length, 2);
});

test('un 429 se reintenta y la segunda vez puede salir bien', async () => {
  const falso = red([respuestaError(429), respuestaOk({ respuesta: 'listo', acciones: [] })]);
  const resultado = await callProvider('chat', { mensajes: [] }, { config: SERVICIO, pausa: reloj().pausa });
  assert.equal(falso.llamadas.length, 2);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.data.respuesta, 'listo');
});

test('el tiempo de espera aborta y devuelve un error en español', async () => {
  const falso = red((url, init) => new Promise((_, falla) => {
    init.signal.addEventListener('abort', () => falla(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })));
  }));
  const resultado = await callProvider('transcribe', { audio: 'AAAA' }, { config: SERVICIO, timeoutMs: 20, pausa: reloj().pausa });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.code, 'tiempo-agotado');
  assert.equal(resultado.error, 'El servicio tardó demasiado. Inténtalo otra vez o escríbelo a mano.');
  assert.equal(resultado.retryable, false, 'repetir algo que ya tardó demasiado solo duplica la espera');
  assert.equal(falso.llamadas.length, 1);
});

test('un signal ya abortado corta antes de llamar a la red', async () => {
  const falso = red(respuestaOk({ texto: 'no debería llegar aquí' }));
  const controlador = new AbortController();
  controlador.abort();
  const resultado = await callProvider('transcribe', {}, { config: SERVICIO, signal: controlador.signal });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.code, 'cancelado');
  assert.equal(falso.llamadas.length, 0);
});

test('cancelar a mitad de camino se distingue de que el servicio tarde', async () => {
  const controlador = new AbortController();
  red((url, init) => new Promise((_, falla) => {
    init.signal.addEventListener('abort', () => falla(new Error('abortado')));
    setTimeout(() => controlador.abort(), 5);
  }));
  const resultado = await callProvider('chat', {}, { config: SERVICIO, signal: controlador.signal, timeoutMs: 5000 });
  assert.equal(resultado.code, 'cancelado');
  assert.equal(resultado.error, 'Se canceló la petición.');
});

test('la dirección y las cabeceras se arman bien, con token', async () => {
  const falso = red(respuestaOk({ respuesta: '', acciones: [] }));
  const payload = { mensajes: [{ rol: 'persona', contenido: 'qué hay de cena' }] };
  await callProvider('chat', payload, { config: { ...SERVICIO, baseUrl: 'https://mi-servicio.ejemplo/', token: 'abc' } });
  const [llamada] = falso.llamadas;
  assert.equal(llamada.url, 'https://mi-servicio.ejemplo/chat', 'la barra final no duplica la del camino');
  assert.equal(llamada.init.method, 'POST');
  assert.equal(llamada.init.headers['Content-Type'], 'application/json');
  assert.equal(llamada.init.headers.Authorization, 'Bearer abc');
  assert.deepEqual(JSON.parse(llamada.init.body), payload);
});

test('sin token no se manda la cabecera de autorización', async () => {
  const falso = red(respuestaOk({ texto: '' }));
  await callProvider('transcribe', null, { config: SERVICIO });
  const [llamada] = falso.llamadas;
  assert.equal(llamada.url, 'https://mi-servicio.ejemplo/transcribe');
  assert.equal('Authorization' in llamada.init.headers, false, 'una cabecera vacía es peor que ninguna');
  assert.equal(llamada.init.body, '{}', 'sin datos se manda un objeto vacío, no «null»');
});

test('ningún mensaje de error lleva el token ni el base64 de la grabación', async () => {
  const TOKEN = 'token-secretisimo-123';
  const AUDIO = `GkXfo59ChoEBQveBAULygQRC${'A'.repeat(300)}`;
  const config = { ...SERVICIO, token: TOKEN };
  const payload = { audio: AUDIO, mimeType: 'audio/webm', idioma: 'es-DO' };
  const soplon = () => new Error(`falló ${TOKEN} enviando ${AUDIO}`);
  const escenarios = [
    // Un servicio que devuelve de vuelta lo que le mandaron, cabecera incluida.
    { ok: false, status: 401, json: async () => ({ detalle: `${TOKEN} ${AUDIO}` }) },
    { ok: false, status: 500, json: async () => ({ detalle: AUDIO }) },
    { ok: true, status: 200, json: async () => { throw soplon(); } },
    () => { throw soplon(); }
  ];
  for (const escenario of escenarios) {
    red(escenario);
    const resultado = await callProvider('transcribe', payload, { config, retries: 0 });
    assert.equal(resultado.ok, false);
    const todo = JSON.stringify(resultado);
    assert.equal(todo.includes(TOKEN), false, `el token se coló: ${resultado.error}`);
    assert.equal(todo.includes('GkXfo59ChoEB'), false, `la grabación se coló: ${resultado.error}`);
    assert.ok(/[áéíóúñ¿]|El servicio|No hay/.test(resultado.error), 'y el mensaje sigue siendo español legible');
  }
});

test('sin dirección configurada no se toca la red', async () => {
  const falso = red(respuestaOk({}));
  const resultado = await callProvider('chat', {}, { config: { enabled: { chat: true } } });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.code, 'sin-configurar');
  assert.equal(resultado.retryable, false);
  assert.equal(falso.llamadas.length, 0);
});

test('una capacidad inventada se rechaza sin tocar la red', async () => {
  const falso = red(respuestaOk({}));
  const resultado = await callProvider('traducir', {}, { config: SERVICIO });
  assert.equal(resultado.code, 'capacidad-desconocida');
  assert.equal(falso.llamadas.length, 0);
});

test('una respuesta que no es JSON, o que no es un objeto, se avisa sin inventar', async () => {
  red({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } });
  const rota = await callProvider('chat', {}, { config: SERVICIO });
  assert.equal(rota.ok, false);
  assert.equal(rota.code, 'respuesta-invalida');
  red(respuestaOk('dos libras de arroz'));
  const suelta = await callProvider('transcribe', {}, { config: SERVICIO });
  assert.equal(suelta.code, 'respuesta-invalida', 'un texto suelto no es la forma acordada');
});

test('cada capacidad tiene su aviso antes de que algo salga del dispositivo', () => {
  assert.deepEqual(Object.keys(AVISO_ENVIO), CAPABILITIES);
  for (const capacidad of CAPABILITIES) {
    const aviso = AVISO_ENVIO[capacidad];
    assert.deepEqual(Object.keys(aviso).sort(), ['cancelar', 'confirmar', 'detalle', 'titulo']);
    for (const valor of Object.values(aviso)) assert.ok(valor.length > 3, 'ningún texto del aviso puede quedar vacío');
    assert.ok(/sale|salir|enviar|envía/i.test(aviso.detalle), 'el aviso dice que algo sale del dispositivo');
  }
});

test('describeConfig cuenta en español lo que hay configurado', () => {
  assert.match(describeConfig({}), /Sin servicio configurado/);
  assert.match(describeConfig({ provider: 'mock' }), /inventadas/);
  const completo = describeConfig({ ...SERVICIO, token: 'abc', enabled: { transcribe: true, chat: false } });
  assert.match(completo, /mi-servicio\.ejemplo/);
  assert.match(completo, /con token de sesión/);
  assert.equal(completo.includes('abc'), false, 'se dice que hay token, no cuál es');
  assert.match(completo, /Activo para: transcribir/);
  assert.match(completo, /Sin activar: conversar/);
  assert.match(describeConfig({ baseUrl: 'http://192.168.1.9:8787', enabled: {} }), /sin cifrar/);
  assert.equal(/sin cifrar/.test(describeConfig({ baseUrl: 'http://localhost:8787', enabled: {} })), false, 'en el propio equipo no hay red que espiar');
});
