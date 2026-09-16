import test from 'node:test';
import assert from 'node:assert/strict';

// El panel de dictado, probado contra los criterios de aceptación de la fase.
//
// Cada prueba de aquí abajo nombra el criterio que comprueba. No están por
// simetría: la que más importa —«abrir el panel no abre el micrófono»— es la que
// cierra el camino por el que la aplicación se cerraba, y una sola línea mal
// puesta en `renderChat` la volvería a abrir sin que nadie se enterara.

import {
  VOZ_ACTIONS, botonDeVoz, comprobarSiElDictadoMatoLaApp, emptyVoz,
  fallosDeVoz, olvidarFallosDeVoz, panelDeVoz, seRindio
} from '../src/voz.js';

/* ── El teléfono de mentira ────────────────────────────────────────────── */

const CAPACITOR_ORIGINAL = globalThis.Capacitor;
const DOCUMENT_ORIGINAL = globalThis.document;
const STORAGE_ORIGINAL = globalThis.localStorage;

// Un almacén en memoria. `voz.js` recuerda ahí cómo se ha portado el micrófono
// de este teléfono, y cada prueba necesita empezar sin memoria.
function montarAlmacen() {
  const datos = new Map();
  globalThis.localStorage = {
    getItem: clave => (datos.has(clave) ? datos.get(clave) : null),
    setItem: (clave, valor) => datos.set(clave, String(valor)),
    removeItem: clave => datos.delete(clave)
  };
  return datos;
}

// El DOM mínimo que el panel toca: busca su cuadro de texto para leerlo y para
// escribir en él lo que se va oyendo.
function montarDocumento(campos = {}) {
  const hechos = new Map();
  for (const [selector, valor] of Object.entries(campos)) {
    hechos.set(selector, { value: valor, focos: 0, focus() { this.focos += 1; }, setSelectionRange() {} });
  }
  globalThis.document = { querySelector: selector => hechos.get(selector) || null };
  return hechos;
}

function montarVoz(opciones = {}) {
  const oyentes = new Map();
  const voz = {
    llamadas: [],
    async removeAllListeners() { voz.llamadas.push('removeAllListeners'); oyentes.clear(); },
    async addListener(evento, manejador) {
      voz.llamadas.push(`addListener:${evento}`);
      oyentes.set(evento, [...(oyentes.get(evento) || []), manejador]);
      return { remove: async () => oyentes.set(evento, (oyentes.get(evento) || []).filter(otro => otro !== manejador)) };
    },
    async available() { return { available: opciones.servicio !== false }; },
    async isOnDeviceRecognitionAvailable() { return { available: Boolean(opciones.local) }; },
    async checkPermissions() { return { speechRecognition: opciones.permiso || 'granted' }; },
    async requestPermissions() {
      // Una promesa que la prueba decide cuándo resolver: así se puede cancelar
      // justo mientras el cartel del sistema está en pantalla, que es el
      // momento en que antes no había nada a lo que agarrarse.
      if (opciones.permisoDiferido) return new Promise(resolver => { voz.concederPermiso = () => resolver({ speechRecognition: opciones.permisoPedido || 'granted' }); });
      return { speechRecognition: opciones.permisoPedido || opciones.permiso || 'granted' };
    },
    async start(argumentos) { voz.llamadas.push('start'); voz.arranque = argumentos; return {}; },
    async stop() { voz.llamadas.push('stop'); },
    async getLastPartialResult() { return { available: false, text: '' }; },
    emitir(evento, datos) { for (const manejador of [...(oyentes.get(evento) || [])]) manejador(datos); }
  };
  globalThis.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    Plugins: { SpeechRecognition: voz, ...(opciones.aparato ? { Aparato: opciones.aparato } : {}) }
  };
  return voz;
}

function restaurar() {
  if (CAPACITOR_ORIGINAL === undefined) delete globalThis.Capacitor; else globalThis.Capacitor = CAPACITOR_ORIGINAL;
  if (DOCUMENT_ORIGINAL === undefined) delete globalThis.document; else globalThis.document = DOCUMENT_ORIGINAL;
  if (STORAGE_ORIGINAL === undefined) delete globalThis.localStorage; else globalThis.localStorage = STORAGE_ORIGINAL;
}

function contexto(extra = {}) {
  const ctx = {
    ui: { voz: emptyVoz(), chat: { borrador: '' }, setup: { texto: '' }, bulk: { texto: '' } },
    pintados: 0,
    usados: [],
    render() { ctx.pintados += 1; },
    alUsarLaVoz: (destino, texto) => ctx.usados.push([destino, texto]),
    ...extra
  };
  return ctx;
}

const elemento = destino => ({ dataset: { destino } });
const esperar = () => new Promise(resolver => setTimeout(resolver, 0));

/* ── Criterio: presionar «Hablar o dictar» nunca cierra la aplicación ──── */

// El primer toque no abre el micrófono. Es la regla de la que cuelga toda la
// fase: si el micrófono no se abre solo, el camino que mataba el proceso no se
// recorre sin que alguien lo pida a conciencia, y si aun así se rompe, ya hay un
// cuadro de texto delante donde seguir trabajando.
test('abrir el panel de dictado no abre el micrófono', async () => {
  montarAlmacen();
  montarDocumento({ '[data-voz-texto]': '' });
  const voz = montarVoz();
  try {
    const ctx = contexto();
    VOZ_ACTIONS['voz-abrir'](elemento('chat'), ctx);
    await esperar();

    assert.equal(ctx.ui.voz.destino, 'chat', 'el panel debería quedar abierto sobre el chat');
    assert.equal(ctx.ui.voz.estado, 'quieto', 'el panel no puede nacer escuchando');
    assert.ok(!voz.llamadas.includes('start'), 'abrir el panel NO puede llamar a start()');
  } finally { restaurar(); }
});

test('el panel abierto siempre trae un cuadro para escribir, pase lo que pase', () => {
  montarAlmacen();
  montarDocumento({ '[data-voz-texto]': '' });
  montarVoz();
  try {
    const ctx = contexto();
    for (const estado of ['quieto', 'preparando', 'escuchando', 'procesando', 'fallo']) {
      ctx.ui.voz = { ...emptyVoz(), destino: 'chat', estado, error: estado === 'fallo' ? 'No se oyó nada.' : '' };
      const html = panelDeVoz(ctx, 'chat');
      assert.ok(html.includes('data-voz-texto'), `en «${estado}» no hay dónde escribir`);
      assert.ok(html.includes('<textarea'), `en «${estado}» el cuadro no es un textarea`);
    }
  } finally { restaurar(); }
});

test('el panel de una pantalla no se dibuja en las otras tres', () => {
  montarAlmacen();
  montarDocumento({});
  montarVoz();
  try {
    const ctx = contexto();
    ctx.ui.voz.destino = 'bulk';
    assert.notEqual(panelDeVoz(ctx, 'bulk'), '', 'el panel debería salir donde se abrió');
    for (const otro of ['chat', 'setup', 'revision']) {
      assert.equal(panelDeVoz(ctx, otro), '', `el panel no debería salir también en «${otro}»`);
    }
  } finally { restaurar(); }
});

/* ── Criterio: los cuatro estados y los cuatro botones ─────────────────── */

test('los cuatro estados se enseñan con palabras, no con códigos', () => {
  montarAlmacen();
  montarDocumento({});
  montarVoz();
  try {
    const ctx = contexto();
    const dichos = {
      preparando: 'Preparando el micrófono',
      escuchando: 'Escuchando',
      procesando: 'Procesando',
      fallo: 'No pudimos escuchar'
    };
    for (const [estado, dicho] of Object.entries(dichos)) {
      ctx.ui.voz = { ...emptyVoz(), destino: 'chat', estado };
      const html = panelDeVoz(ctx, 'chat');
      assert.ok(html.includes(dicho), `el estado «${estado}» debería decir «${dicho}»`);
      assert.ok(html.includes('role="status"'), `el estado «${estado}» no se anuncia a quien no mira la pantalla`);
    }
  } finally { restaurar(); }
});

test('cada momento ofrece los botones que en ese momento sirven', () => {
  montarAlmacen();
  montarDocumento({});
  montarVoz();
  try {
    const ctx = contexto();
    const dibujar = estado => {
      ctx.ui.voz = { ...emptyVoz(), destino: 'chat', estado, error: estado === 'fallo' ? 'No se oyó nada.' : '' };
      return panelDeVoz(ctx, 'chat');
    };

    const escuchando = dibujar('escuchando');
    assert.ok(escuchando.includes('voz-detener'), 'escuchando falta «Detener»');
    assert.ok(escuchando.includes('voz-cancelar'), 'escuchando falta «Cancelar»');
    assert.ok(escuchando.includes('voz-escribir'), 'escuchando falta «Escribir en su lugar»');

    // Procesando ya no se puede detener: el micrófono está cerrado y el motor
    // está digiriendo. Un botón que no hace nada es peor que ninguno.
    const procesando = dibujar('procesando');
    assert.ok(!procesando.includes('voz-detener'), 'procesando no debería ofrecer «Detener»');
    assert.ok(procesando.includes('voz-cancelar'), 'procesando falta «Cancelar»');

    const fallo = dibujar('fallo');
    assert.ok(fallo.includes('Intentar nuevamente'), 'tras un fallo falta «Intentar nuevamente»');
    assert.ok(fallo.includes('voz-escribir'), 'tras un fallo falta «Escribir en su lugar»');
    assert.ok(fallo.includes('voz-hablar'), 'tras un fallo no se puede volver a intentar');
  } finally { restaurar(); }
});

/* ── Criterio: rechazar el permiso no cierra la aplicación ─────────────── */

test('un permiso denegado deja un aviso y un camino a los ajustes, no un cierre', async () => {
  montarAlmacen();
  montarDocumento({ '[data-voz-texto]': '' });
  montarVoz({ permiso: 'denied', permisoPedido: 'denied', aparato: { async abrirAjustes() { return { abierto: true }; } } });
  try {
    const ctx = contexto();
    VOZ_ACTIONS['voz-abrir'](elemento('chat'), ctx);
    VOZ_ACTIONS['voz-hablar'](elemento('chat'), ctx);
    await esperar();
    await esperar();

    assert.equal(ctx.ui.voz.estado, 'fallo', 'el panel debería quedarse en «no pudimos escuchar»');
    assert.ok(/permiso del micrófono/i.test(ctx.ui.voz.error), `el aviso debería hablar del permiso, y decía: ${ctx.ui.voz.error}`);
    assert.equal(ctx.ui.voz.puedeAjustes, true, 'un permiso denegado tiene que ofrecer abrir los ajustes');
    assert.ok(panelDeVoz(ctx, 'chat').includes('voz-ajustes'), 'el botón de los ajustes no se dibuja');
    // Y sigue habiendo dónde escribir: rechazar el permiso no deja a nadie sin
    // poder anotar la compra.
    assert.ok(panelDeVoz(ctx, 'chat').includes('data-voz-texto'));
  } finally { restaurar(); }
});

test('sin el complemento de ajustes el consejo se da a mano, y no se rompe nada', async () => {
  montarAlmacen();
  montarDocumento({ '[data-voz-texto]': '' });
  montarVoz({ permiso: 'denied', permisoPedido: 'denied' });
  try {
    const ctx = contexto();
    ctx.ui.voz = { ...emptyVoz(), destino: 'chat', estado: 'fallo', error: 'x', puedeAjustes: true };
    VOZ_ACTIONS['voz-ajustes'](elemento('chat'), ctx);
    await esperar();
    await esperar();
    assert.ok(/Ajustes → Aplicaciones/.test(ctx.ui.voz.error), 'debería quedar el camino escrito a mano');
    assert.equal(ctx.ui.voz.puedeAjustes, false, 'el botón que no funciona no debería seguir ahí');
  } finally { restaurar(); }
});

/* ── Criterio: cancelar no deja el micrófono activo ────────────────────── */

// El agujero que había: entre tocar «Hablar» y que el micrófono se abra hay tres
// preguntas al teléfono, y una de ellas saca un cartel del sistema. Durante ese
// rato no existía ninguna sesión que cancelar, así que quien tocaba Cancelar
// veía abrirse el micrófono un segundo después, contra su voluntad.
test('cancelar mientras se pide el permiso impide que el micrófono llegue a abrirse', async () => {
  montarAlmacen();
  montarDocumento({ '[data-voz-texto]': '' });
  const voz = montarVoz({ permiso: 'prompt', permisoDiferido: true });
  try {
    const ctx = contexto();
    VOZ_ACTIONS['voz-abrir'](elemento('chat'), ctx);
    VOZ_ACTIONS['voz-hablar'](elemento('chat'), ctx);
    await esperar();

    assert.ok(typeof voz.concederPermiso === 'function', 'la prueba debería estar esperando en el cartel del permiso');
    assert.ok(!voz.llamadas.includes('start'), 'el micrófono no debería haberse abierto todavía');

    // Cancelar aquí, con el cartel del sistema todavía en pantalla.
    VOZ_ACTIONS['voz-cancelar'](elemento('chat'), ctx);
    // Y ahora la persona concede el permiso: el dictado ya estaba cancelado.
    voz.concederPermiso();
    await esperar();
    await esperar();
    await esperar();

    assert.ok(!voz.llamadas.includes('start'), 'tras cancelar, el micrófono NO puede abrirse');
    assert.equal(ctx.ui.voz.estado, 'quieto');
  } finally { restaurar(); }
});

test('cancelar con el micrófono abierto lo cierra y retira los oyentes', async () => {
  montarAlmacen();
  montarDocumento({ '[data-voz-texto]': '' });
  const voz = montarVoz();
  try {
    const ctx = contexto();
    VOZ_ACTIONS['voz-abrir'](elemento('chat'), ctx);
    VOZ_ACTIONS['voz-hablar'](elemento('chat'), ctx);
    await esperar();
    await esperar();
    assert.ok(voz.llamadas.includes('start'), 'el micrófono debería estar abierto');

    VOZ_ACTIONS['voz-cancelar'](elemento('chat'), ctx);
    await esperar();
    await esperar();
    assert.ok(voz.llamadas.includes('stop'), 'cancelar tiene que cerrar el micrófono');
    assert.equal(ctx.ui.voz.estado, 'quieto');
  } finally { restaurar(); }
});

/* ── Criterio: conservar el último texto parcial ───────────────────────── */

test('lo que se alcanzó a oír antes de un fallo no se tira', async () => {
  montarAlmacen();
  const campos = montarDocumento({ '[data-voz-texto]': '' });
  const voz = montarVoz();
  try {
    const ctx = contexto();
    VOZ_ACTIONS['voz-abrir'](elemento('chat'), ctx);
    VOZ_ACTIONS['voz-hablar'](elemento('chat'), ctx);
    await esperar();
    await esperar();

    voz.emitir('partialResults', { accumulatedText: 'compré dos libras de arroz' });
    // Y justo ahí el motor se rompe.
    voz.emitir('error', { code: 'CLIENT', message: 'se cortó' });
    await esperar();
    await esperar();

    assert.match(ctx.ui.voz.texto, /compré dos libras de arroz/, 'lo oído a medias tenía que sobrevivir al fallo');
    assert.equal(campos.get('[data-voz-texto]').value, 'compré dos libras de arroz', 'y tenía que quedar escrito en el cuadro');
  } finally { restaurar(); }
});

test('lo que ya estaba escrito no se pisa: lo dictado se añade detrás', async () => {
  montarAlmacen();
  montarDocumento({ '[data-voz-texto]': 'arroz', '#chat-texto': 'arroz' });
  const voz = montarVoz();
  try {
    const ctx = contexto();
    VOZ_ACTIONS['voz-abrir'](elemento('chat'), ctx);
    assert.equal(ctx.ui.voz.texto, 'arroz', 'el panel debería abrirse con lo que ya había escrito');

    VOZ_ACTIONS['voz-hablar'](elemento('chat'), ctx);
    await esperar();
    await esperar();
    voz.emitir('partialResults', { accumulatedText: 'y habichuelas' });
    voz.emitir('listeningState', { state: 'stopped', reason: 'results' });
    await esperar();
    await esperar();

    assert.equal(ctx.ui.voz.texto, 'arroz y habichuelas');
  } finally { restaurar(); }
});

/* ── Criterio: se puede volver a intentar después de un error ──────────── */

test('después de un fallo se puede volver a intentar, y la segunda vez funciona', async () => {
  montarAlmacen();
  montarDocumento({ '[data-voz-texto]': '' });
  const voz = montarVoz();
  try {
    const ctx = contexto();
    VOZ_ACTIONS['voz-abrir'](elemento('chat'), ctx);

    VOZ_ACTIONS['voz-hablar'](elemento('chat'), ctx);
    await esperar(); await esperar();
    voz.emitir('error', { code: 'NO_MATCH', message: 'nada' });
    await esperar(); await esperar();
    assert.equal(ctx.ui.voz.estado, 'fallo');
    assert.equal(fallosDeVoz(), 1, 'el fallo debería quedar contado');

    // Y otra vez, ahora con suerte.
    VOZ_ACTIONS['voz-hablar'](elemento('chat'), ctx);
    await esperar(); await esperar();
    voz.emitir('partialResults', { accumulatedText: 'dos panes' });
    voz.emitir('listeningState', { state: 'stopped', reason: 'results' });
    await esperar(); await esperar();

    assert.equal(ctx.ui.voz.estado, 'quieto');
    assert.equal(ctx.ui.voz.texto, 'dos panes');
    assert.equal(ctx.ui.voz.error, '', 'el error anterior tenía que desaparecer');
    assert.equal(fallosDeVoz(), 0, 'un acierto borra la mala fama del teléfono');
  } finally { restaurar(); }
});

/* ── Criterio: desactivar el inicio automático si sigue siendo inestable ─ */

test('a los dos fallos el panel deja de ofrecer el micrófono como primera opción', async () => {
  montarAlmacen();
  montarDocumento({ '[data-voz-texto]': '' });
  const voz = montarVoz();
  try {
    const ctx = contexto();
    VOZ_ACTIONS['voz-abrir'](elemento('chat'), ctx);

    for (let intento = 0; intento < 2; intento++) {
      VOZ_ACTIONS['voz-hablar'](elemento('chat'), ctx);
      await esperar(); await esperar();
      voz.emitir('error', { code: 'CLIENT', message: 'se cortó' });
      await esperar(); await esperar();
    }

    assert.equal(seRindio(), true, 'dos fallos seguidos deberían bastar para rendirse');
    const html = panelDeVoz(ctx, 'chat');
    assert.ok(html.includes('voz-hablar'), 'tiene que seguir pudiéndose intentar: el teléfono no queda desahuciado para siempre');
    assert.ok(html.includes('Probar otra vez el micrófono de la app'), 'el micrófono pasa a ser la opción secundaria, con su nombre puesto');
    assert.ok(!html.includes('🎤 Hablar'), 'ya no debería ser el botón principal');
    assert.ok(/micrófono de tu teclado|🎤 de tu teclado/.test(html), 'debería apuntar al micrófono del teclado');

    olvidarFallosDeVoz();
    assert.equal(seRindio(), false, 'y tiene que poder olvidarse');
  } finally { restaurar(); }
});

/* ── La prueba de que el dictado se llevó la aplicación por delante ────── */

// Esto funciona aunque la red nativa de Java no llegue a instalarse: no depende
// de recoger nada, depende de que el renglón siguiente no se ejecutara.
test('un cierre en mitad del dictado se detecta al arrancar la vez siguiente', async () => {
  const datos = montarAlmacen();
  montarDocumento({ '[data-voz-texto]': '' });
  montarVoz();
  try {
    const ctx = contexto();
    VOZ_ACTIONS['voz-abrir'](elemento('chat'), ctx);
    VOZ_ACTIONS['voz-hablar'](elemento('chat'), ctx);
    await esperar();

    // Aquí la aplicación muere: la marca se queda puesta.
    const marca = JSON.parse(datos.get('que-comemos-voz-v1'));
    assert.equal(marca.enCurso, true, 'debería haber quedado la marca de «estoy dictando»');

    const cierre = comprobarSiElDictadoMatoLaApp();
    assert.ok(cierre, 'el arranque siguiente tendría que darse cuenta');
    assert.equal(cierre.fallos, 1);
    assert.match(cierre.texto, /se cerró sola/);
    assert.match(cierre.texto, /se perdió/, 'hay que decir que los datos están a salvo');

    // Y no se cuenta dos veces: la marca se limpia al leerla.
    assert.equal(comprobarSiElDictadoMatoLaApp(), null);
  } finally { restaurar(); }
});

test('un dictado que termina bien no deja marca de cierre', async () => {
  montarAlmacen();
  montarDocumento({ '[data-voz-texto]': '' });
  const voz = montarVoz();
  try {
    const ctx = contexto();
    VOZ_ACTIONS['voz-abrir'](elemento('chat'), ctx);
    VOZ_ACTIONS['voz-hablar'](elemento('chat'), ctx);
    await esperar(); await esperar();
    voz.emitir('partialResults', { accumulatedText: 'arroz' });
    voz.emitir('listeningState', { state: 'stopped', reason: 'results' });
    await esperar(); await esperar();

    assert.equal(comprobarSiElDictadoMatoLaApp(), null, 'un dictado normal no puede acusarse de un cierre');
  } finally { restaurar(); }
});

test('sin almacenamiento el panel sigue funcionando', () => {
  // Un WebView con el almacenamiento bloqueado no puede dejar a nadie sin poder
  // dictar ni escribir: la memoria es una ayuda, no un requisito.
  globalThis.localStorage = {
    getItem() { throw new Error('bloqueado'); },
    setItem() { throw new Error('bloqueado'); },
    removeItem() { throw new Error('bloqueado'); }
  };
  montarDocumento({ '[data-voz-texto]': '' });
  montarVoz();
  try {
    assert.equal(seRindio(), false);
    assert.equal(fallosDeVoz(), 0);
    assert.equal(comprobarSiElDictadoMatoLaApp(), null);
    const ctx = contexto();
    VOZ_ACTIONS['voz-abrir'](elemento('chat'), ctx);
    assert.equal(ctx.ui.voz.destino, 'chat');
  } finally { restaurar(); }
});

/* ── Que el texto acabe donde tiene que acabar ─────────────────────────── */

test('«Usar este texto» lo deja en la pantalla que lo pidió y cierra el panel', () => {
  montarAlmacen();
  montarDocumento({ '[data-voz-texto]': 'dos libras de arroz', '#chat-texto': '' });
  montarVoz();
  try {
    const ctx = contexto();
    ctx.ui.voz = { ...emptyVoz(), destino: 'chat' };
    VOZ_ACTIONS['voz-usar'](elemento('chat'), ctx);

    assert.equal(ctx.ui.chat.borrador, 'dos libras de arroz');
    assert.equal(ctx.ui.voz.destino, '', 'el panel debería cerrarse al usar el texto');
  } finally { restaurar(); }
});

test('la revisión no guarda el texto en un campo: lo reparte entre las casillas', () => {
  montarAlmacen();
  montarDocumento({ '[data-voz-texto]': 'quedan dos libras de arroz' });
  montarVoz();
  try {
    const ctx = contexto();
    ctx.ui.voz = { ...emptyVoz(), destino: 'revision' };
    VOZ_ACTIONS['voz-usar'](elemento('revision'), ctx);

    assert.deepEqual(ctx.usados, [['revision', 'quedan dos libras de arroz']]);
  } finally { restaurar(); }
});

test('cerrar el panel no tira lo que se hubiera escrito', () => {
  montarAlmacen();
  montarDocumento({ '[data-voz-texto]': 'medio a escribir' });
  montarVoz();
  try {
    const ctx = contexto();
    ctx.ui.voz = { ...emptyVoz(), destino: 'chat' };
    VOZ_ACTIONS['voz-cerrar'](elemento('chat'), ctx);
    assert.equal(ctx.ui.voz.texto, 'medio a escribir', 'lo escrito debería seguir ahí al reabrir');
  } finally { restaurar(); }
});

/* ── El botón que abre el panel ────────────────────────────────────────── */

test('el botón de abrir desaparece mientras el panel está abierto', () => {
  montarAlmacen();
  montarDocumento({});
  montarVoz();
  try {
    const ctx = contexto();
    assert.ok(botonDeVoz(ctx, 'chat').includes('voz-abrir'), 'debería haber botón cuando el panel está cerrado');
    ctx.ui.voz.destino = 'chat';
    assert.equal(botonDeVoz(ctx, 'chat'), '', 'con el panel abierto, el botón sobra');
  } finally { restaurar(); }
});

test('ninguna acción del panel lanza hacia fuera, ni con el complemento roto', async () => {
  montarAlmacen();
  montarDocumento({ '[data-voz-texto]': '' });
  // Un complemento que falla en todo lo que se le pida.
  globalThis.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    Plugins: {
      SpeechRecognition: new Proxy({}, { get: () => () => { throw new Error('complemento roto'); } }),
      Aparato: new Proxy({}, { get: () => () => { throw new Error('complemento roto'); } })
    }
  };
  try {
    const ctx = contexto();
    for (const nombre of Object.keys(VOZ_ACTIONS)) {
      ctx.ui.voz = { ...emptyVoz(), destino: 'chat' };
      await assert.doesNotReject(async () => {
        VOZ_ACTIONS[nombre](elemento('chat'), ctx);
        await esperar();
      }, `la acción «${nombre}» lanzó hacia fuera`);
    }
    await esperar();
  } finally { restaurar(); }
});
