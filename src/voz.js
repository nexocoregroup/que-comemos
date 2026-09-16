// El panel de dictado, uno solo para toda la aplicación.
//
// ── Por qué existe este archivo ────────────────────────────────────────────
//
// Había cuatro sitios donde se podía dictar —el asistente, la configuración
// inicial, la entrada rápida y la revisión— y cada uno tenía su propia versión
// de lo mismo: su bandera de «escuchando», su mensaje de error, su botón de
// parar. Cuatro versiones de una misma cosa son cuatro sitios donde arreglar
// cada fallo, y por eso el arreglo llegaba a unos y no a otros: la revisión, por
// ejemplo, no tenía forma de cancelar, y la configuración inicial no enseñaba en
// qué estado iba el micrófono.
//
// Aquí está una sola vez. Cada pantalla dice dónde va el texto; todo lo demás
// —los estados, los botones, el permiso, los fallos, la alternativa de escribir—
// lo lleva este archivo.
//
// ── La regla que manda sobre todas ─────────────────────────────────────────
//
// El micrófono NO se abre solo. Tocar el botón de dictar abre este panel con el
// cuadro de texto listo y el cursor dentro; hablar es el segundo toque, no el
// primero. Parece un toque de más y es al revés: es la diferencia entre una
// función que a veces se lleva la aplicación por delante y una que, cuando falla,
// deja a la persona delante de un cuadro donde puede escribir —o usar el
// micrófono de su propio teclado, que es el mismo motor de Android pero corriendo
// dentro del teclado, donde si se cae se cae el teclado y no esta aplicación.
//
// ── Y la memoria de cómo se ha portado este teléfono ───────────────────────
//
// Un teléfono al que el dictado le falla dos veces seguidas no merece una
// tercera sin avisar. Se lleva la cuenta, y a las dos el panel deja de ofrecer
// el micrófono de la app como primera opción y ofrece escribir. No se quita
// nada: queda el botón de «Probar otra vez el micrófono», y un solo acierto
// vuelve a poner el contador a cero.

import { abrirAjustesDelTelefono, avisoDeVoz, cancelarDictado, capacidad, comprobarDictado, dictar, pararDictado } from './device.js';
import { button, esc } from './ui-kit.js';
import { icono } from './icons.js';

/* ── Lo que este teléfono ha demostrado ────────────────────────────────────

   Vive en su propia clave y no dentro del estado de la casa. Son dos motivos:
   una copia de seguridad llevada a otro teléfono no debe arrastrar el veredicto
   sobre el micrófono del anterior, y esto tiene que poder escribirse desde fuera
   del flujo normal de guardado —justo antes de abrir el micrófono, que es el
   momento en que la aplicación puede morir. */

export const CLAVE_VOZ = 'que-comemos-voz-v1';
const FALLOS_PARA_RENDIRSE = 2;

function memoria(storage = globalThis.localStorage) {
  try {
    const crudo = storage?.getItem(CLAVE_VOZ);
    const leido = crudo ? JSON.parse(crudo) : null;
    return {
      fallos: Number(leido?.fallos) || 0,
      enCurso: Boolean(leido?.enCurso),
      ultimoMotivo: String(leido?.ultimoMotivo || '')
    };
  } catch {
    // Sin almacenamiento —o con basura dentro— se empieza de cero. Que no se
    // pueda recordar cómo fue la vez anterior no puede impedir esta vez.
    return { fallos: 0, enCurso: false, ultimoMotivo: '' };
  }
}

function recordar(cambios, storage = globalThis.localStorage) {
  const antes = memoria(storage);
  const despues = { ...antes, ...cambios };
  try { storage?.setItem(CLAVE_VOZ, JSON.stringify(despues)); } catch { /* Sin sitio, se sigue sin memoria. */ }
  return despues;
}

/* ¿Se llevó el dictado la aplicación por delante la última vez?

   Esta es la única forma honesta de detectarlo desde JavaScript. Justo antes de
   abrir el micrófono se deja escrito «estoy dictando»; al terminar —bien o mal—
   se borra. Si al arrancar la aplicación esa marca sigue puesta, es que entre el
   «voy a dictar» y el «ya terminé» el proceso dejó de existir, y eso solo pasa
   de una manera.

   Funciona aunque la red nativa falle, porque no depende de ella: depende de que
   no se ejecutara el renglón siguiente. */
export function comprobarSiElDictadoMatoLaApp(storage = globalThis.localStorage) {
  const antes = memoria(storage);
  if (!antes.enCurso) return null;
  const fallos = antes.fallos + 1;
  recordar({ enCurso: false, fallos, ultimoMotivo: 'cierre' }, storage);
  return {
    fallos,
    rendida: fallos >= FALLOS_PARA_RENDIRSE,
    texto: fallos >= FALLOS_PARA_RENDIRSE
      ? 'La última vez que dictaste, la aplicación se cerró sola. Ha pasado más de una vez en este teléfono, así que voy a dejar de abrir el micrófono por mi cuenta: escribe en el cuadro y usa el micrófono de tu teclado, que va por otro camino. Nada de lo que habías anotado se perdió.'
      : 'La última vez que dictaste, la aplicación se cerró sola. Nada de lo que habías anotado se perdió. Puedes volver a intentarlo, y si vuelve a pasar dejaré de abrir el micrófono por mi cuenta.'
  };
}

export const seRindio = (storage = globalThis.localStorage) => memoria(storage).fallos >= FALLOS_PARA_RENDIRSE;
export const fallosDeVoz = (storage = globalThis.localStorage) => memoria(storage).fallos;
export const olvidarFallosDeVoz = (storage = globalThis.localStorage) => recordar({ fallos: 0, enCurso: false, ultimoMotivo: '' }, storage);

/* ── Dónde va a parar lo que se diga ───────────────────────────────────────

   Cada pantalla se registra aquí con dos funciones: de dónde sale el texto que
   ya había y dónde se escribe el nuevo. El panel no sabe nada más de ellas. */

const DESTINOS = {
  chat: {
    titulo: 'Dictar el mensaje',
    ejemplo: 'Ej. compré 2 libras de arroz',
    campo: '#chat-texto',
    // El campo de la pantalla lleva la última palabra sobre el estado guardado:
    // lo que alguien acaba de teclear y todavía no se ha recogido está ahí y no
    // en `ui`, y abrir el panel no puede borrarlo.
    delCampo: true,
    leer: ctx => ctx.ui.chat?.borrador || '',
    escribir: (ctx, texto) => { if (ctx.ui.chat) ctx.ui.chat.borrador = texto; }
  },
  // Hubo un destino `setup`, para el paso del asistente de entrada que dejaba
  // dictar los alimentos de corrido. Ese paso se quitó: con la ventanita de
  // cada categoría ya no compensaba tener una segunda implementación del mismo
  // dictado, en paralelo a `bulk`. Si vuelve a hacer falta dictar mientras se
  // registra la casa, el camino es abrir `bulk` desde ahí, no rehacer esto.
  bulk: {
    titulo: 'Dictar la lista',
    ejemplo: 'Ej. 30 plátanos, 10 libras de arroz, 4 paquetes de salami',
    campo: '[data-form="bulk-texto"] [name="texto"]',
    delCampo: true,
    leer: ctx => ctx.ui.bulk?.texto || '',
    escribir: (ctx, texto) => { if (ctx.ui.bulk) ctx.ui.bulk.texto = texto; }
  },
  revision: {
    titulo: 'Dictar lo que queda',
    ejemplo: 'Ej. quedan dos libras de arroz, media docena de huevos',
    // Aquí el campo es el buscador, no el sitio de donde sale el texto: la
    // revisión no guarda lo dictado en ningún cuadro, lo reparte entre las
    // casillas de cada alimento. Por eso empieza siempre en blanco.
    campo: '[data-revision-buscar]',
    delCampo: false,
    leer: () => '',
    escribir: () => { /* La revisión no guarda el texto: lo aplica al terminar. */ }
  }
};

export const emptyVoz = () => ({
  destino: '',
  estado: 'quieto',
  texto: '',
  aviso: '',
  error: '',
  errorTitulo: '',
  puedeAjustes: false,
  sesion: 0
});

/* ── Los cuatro estados, dichos en español ─────────────────────────────────
   Lo que se enseña lo manda el motor, no esta pantalla: poner «Escuchando…»
   antes de que el micrófono esté abierto hace que la gente empiece a hablar sola
   y pierda la primera palabra. */

const ESTADOS = {
  preparando: { texto: 'Preparando el micrófono… espera a que diga «escuchando».', clase: 'preparando' },
  escuchando: { texto: 'Escuchando. Habla normal, sin gritar.', clase: 'escuchando' },
  procesando: { texto: 'Procesando lo que dijiste…', clase: 'procesando' },
  fallo: { texto: 'No pudimos escuchar.', clase: 'fallo' }
};

export const vozDe = ctx => (ctx.ui.voz = ctx.ui.voz || emptyVoz());
const activo = (ctx, destino) => vozDe(ctx).destino === destino;
const trabajando = voz => voz.estado === 'preparando' || voz.estado === 'escuchando' || voz.estado === 'procesando';

/* ── El botón que abre el panel ────────────────────────────────────────────
   No abre el micrófono: abre el panel. Ver arriba, «la regla que manda». */

export function botonDeVoz(ctx, destino, { etiqueta = 'Hablar o escribir' } = {}) {
  if (activo(ctx, destino)) return '';
  return `<button type="button" class="voz-abrir" data-action="voz-abrir" data-destino="${esc(destino)}"
    aria-label="${esc(etiqueta)}" title="${esc(etiqueta)}">${icono('microfono', { tamano: 20 })}</button>`;
}

/* ── El panel ──────────────────────────────────────────────────────────────

   Siempre hay un cuadro de texto, en todos los estados. Es la alternativa
   manual y es lo que sigue funcionando cuando todo lo demás falla; esconderlo
   mientras el micrófono trabaja obligaría a cerrar y volver a abrir para
   escribir una palabra que no se entendió. */

export function panelDeVoz(ctx, destino) {
  if (!activo(ctx, destino)) return '';
  const voz = vozDe(ctx);
  const info = DESTINOS[destino];
  const motor = capacidad('dictar');
  const rendida = seRindio();
  const ocupado = trabajando(voz);

  return `<div class="voz-panel ${ocupado ? 'voz-activa' : ''}" data-voz>
    <div class="voz-cabeza">
      <strong>${esc(info?.titulo || 'Dictar')}</strong>
      <button type="button" class="icon-btn" data-action="voz-cerrar" aria-label="Cerrar el dictado">×</button>
    </div>
    ${dibujarEstado(voz)}
    ${dibujarError(voz)}
    <label class="voz-oculto" for="voz-texto">Lo que quieres decir</label>
    <textarea class="voz-texto" id="voz-texto" name="voz-texto" rows="3" data-voz-texto
      placeholder="${esc(info?.ejemplo || 'Escribe aquí')}"
      enterkeyhint="done" autocapitalize="sentences" spellcheck="true">${esc(voz.texto)}</textarea>
    <p class="voz-pista">${esc(pistaDelTeclado(motor, rendida))}</p>
    <div class="voz-botones">${dibujarBotones(voz, motor, rendida)}</div>
  </div>`;
}

function dibujarEstado(voz) {
  const estado = ESTADOS[voz.estado];
  if (!estado) return '';
  // `role="status"` y `aria-live` para que quien no mira la pantalla se entere
  // de que el micrófono está abierto: sin eso, el indicador solo existe para
  // quien puede verlo.
  return `<p class="voz-estado ${estado.clase}" role="status" aria-live="polite">
    <span class="voz-onda" aria-hidden="true"></span>${esc(estado.texto)}</p>`;
}

function dibujarError(voz) {
  if (!voz.error) return '';
  const ajustes = voz.puedeAjustes
    ? button('Abrir los ajustes del teléfono', 'voz-ajustes', 'btn-secondary btn-small')
    : '';
  return `<div class="notice error voz-aviso"><span>!</span><div>
    <strong>${esc(voz.errorTitulo || 'No pudimos escuchar')}</strong>
    <span>${esc(voz.error)}</span>${ajustes ? `<span class="voz-aviso-accion">${ajustes}</span>` : ''}
  </div></div>`;
}

// Lo que se dice debajo del cuadro. Cambia según lo que este teléfono pueda
// hacer, porque un consejo que no aplica es peor que ninguno.
function pistaDelTeclado(motor, rendida) {
  if (rendida) return 'El micrófono de la aplicación ha fallado en este teléfono. Escribe aquí, o toca el 🎤 de tu teclado: ese va por otro camino y suele funcionar.';
  if (!motor.ok) return 'Este aparato no ofrece dictado dentro de la aplicación. Escribe aquí, o toca el 🎤 de tu teclado.';
  return 'Escribe, o toca el 🎤 de tu teclado. También puedes usar el micrófono de la aplicación.';
}

/* Los cuatro botones que pide la fase, y ninguno más de los que caben.

   Cuáles se ven depende del momento, porque enseñar «Detener» cuando no hay
   nada que detener es enseñar un botón que no hace nada, y de esos ya venía
   sobrada esta pantalla. */

function dibujarBotones(voz, motor, rendida) {
  if (trabajando(voz)) {
    return [
      voz.estado === 'procesando' ? '' : button('Detener', 'voz-detener', 'btn-secondary'),
      button('Cancelar', 'voz-cancelar', 'btn-quiet'),
      button('Escribir en su lugar', 'voz-escribir', 'btn-quiet btn-small')
    ].filter(Boolean).join('');
  }

  // Tres etiquetas para el mismo botón, porque en cada momento se está
  // ofreciendo una cosa distinta:
  //
  //   · Sin fallos: hablar, que es lo que se vino a hacer.
  //   · Tras un fallo suelto: intentarlo otra vez, que casi siempre sale.
  //   · Con el micrófono desahuciado: sigue estando —quitarlo sería decidir por
  //     la persona que su teléfono no tiene arreglo—, pero pequeño y apagado, y
  //     con el nombre puesto, para que nadie lo toque esperando que esta vez sí.
  const hablar = !motor.ok
    ? ''
    : rendida
      ? button('Probar otra vez el micrófono de la app', 'voz-hablar', 'btn-quiet btn-small')
      : voz.estado === 'fallo'
        ? button('Intentar nuevamente', 'voz-hablar', 'btn-secondary')
        : button(`${icono('microfono', { tamano: 17 })}Hablar`, 'voz-hablar', 'btn-secondary');

  // Tras un fallo, «Escribir en su lugar» quita el recuadro rojo y deja el
  // cursor dentro del cuadro. No es el mismo botón de antes disfrazado: ahí
  // sirve para salir del error sin tener que leerlo dos veces.
  const escribir = voz.estado === 'fallo' ? button('Escribir en su lugar', 'voz-escribir', 'btn-quiet') : '';

  return `${hablar}${escribir}
    ${button('Usar este texto', 'voz-usar', 'btn-primary')}
    ${button('Cancelar', 'voz-cerrar', 'btn-quiet')}`;
}

/* ── Las acciones ──────────────────────────────────────────────────────────

   Ninguna de estas puede lanzar hacia fuera. `app.js` ya tiene una red debajo,
   pero una función que se apoya en la red de otro acaba dependiendo de que esa
   red siga ahí. */

export const VOZ_ACTIONS = {
  'voz-abrir': (el, ctx) => {
    const voz = vozDe(ctx);
    const destino = el.dataset.destino;
    const info = DESTINOS[destino];
    if (!info) return;
    Object.assign(voz, emptyVoz(), { destino, texto: textoDePartida(ctx, info) });
    // Se comprueba en segundo plano si este teléfono entiende la voz sin salir
    // a la red, para poder avisar antes de abrir el micrófono y no después.
    comprobarDictado({ idioma: 'es-DO' }).catch(() => { /* No saberlo no impide nada. */ });
    ctx.render();
    enfocarCuadro();
  },

  'voz-cerrar': (el, ctx) => {
    const voz = vozDe(ctx);
    guardarLoEscrito(ctx, voz);
    apagar(voz);
    voz.destino = '';
    ctx.render();
  },

  // «Escribir en su lugar»: cierra el micrófono pero deja el panel abierto con
  // lo que hubiera oído. Lo que se dijo a medias no se tira nunca.
  'voz-escribir': (el, ctx) => {
    const voz = vozDe(ctx);
    guardarLoEscrito(ctx, voz);
    apagar(voz);
    voz.estado = 'quieto';
    voz.error = '';
    voz.errorTitulo = '';
    ctx.render();
    enfocarCuadro();
  },

  'voz-usar': (el, ctx) => {
    const voz = vozDe(ctx);
    guardarLoEscrito(ctx, voz);
    apagar(voz);
    const destino = voz.destino;
    const texto = voz.texto;
    voz.destino = '';
    const info = DESTINOS[destino];
    info?.escribir(ctx, texto);
    // Quien se registró puede querer hacer algo más que guardar el texto —la
    // revisión lo aplica a las cantidades—, y eso lo resuelve la pantalla.
    ctx.alUsarLaVoz?.(destino, texto);
    ctx.render();
    enfocar(info?.campo);
  },

  'voz-detener': (el, ctx) => {
    const voz = vozDe(ctx);
    voz.estado = 'procesando';
    ctx.render();
    // Parar cierra el micrófono y se queda con lo dicho. No es cancelar.
    Promise.resolve(pararDictado()).catch(() => { /* Parar no puede fallar hacia fuera. */ });
  },

  'voz-cancelar': (el, ctx) => {
    const voz = vozDe(ctx);
    apagar(voz);
    voz.estado = 'quieto';
    voz.aviso = '';
    ctx.render();
    enfocarCuadro();
  },

  'voz-ajustes': (el, ctx) => {
    abrirAjustesDelTelefono()
      .then(salida => {
        if (salida.ok) return;
        const voz = vozDe(ctx);
        voz.error = 'No pude abrir los ajustes desde aquí. Búscalos en el teléfono: Ajustes → Aplicaciones → ¿Qué comemos? → Permisos → Micrófono.';
        voz.puedeAjustes = false;
        ctx.render();
      })
      .catch(() => { /* Que no se abran los ajustes no rompe nada. */ });
  },

  'voz-hablar': (el, ctx) => { escuchar(ctx).catch(() => { /* `escuchar` ya se protege sola. */ }); }
};

// Con qué texto se abre el panel. Lo que hay escrito en la pantalla manda sobre
// lo que hay guardado en `ui`: entre lo uno y lo otro puede haber palabras que
// alguien acaba de teclear y que todavía no se han recogido, y abrir el panel no
// puede hacerlas desaparecer.
function textoDePartida(ctx, info) {
  if (info.delCampo && typeof document !== 'undefined') {
    const campo = document.querySelector(info.campo);
    if (campo && typeof campo.value === 'string') return campo.value;
  }
  return info.leer(ctx) || '';
}

// El cuadro es el único sitio donde la persona escribe, y lo que escriba tiene
// que sobrevivir a cada redibujo. Se recoge del DOM antes de tocar nada.
function guardarLoEscrito(ctx, voz) {
  const cuadro = typeof document !== 'undefined' ? document.querySelector('[data-voz-texto]') : null;
  if (cuadro) voz.texto = cuadro.value;
}

function apagar(voz) {
  voz.sesion += 1;
  Promise.resolve(cancelarDictado()).catch(() => { /* Cerrar el micrófono no puede fallar hacia fuera. */ });
}

function enfocar(selector) {
  if (!selector || typeof document === 'undefined') return;
  const campo = document.querySelector(selector);
  if (!campo?.focus) return;
  campo.focus();
  if (campo.setSelectionRange) {
    try { campo.setSelectionRange(campo.value.length, campo.value.length); } catch { /* Los campos que no son de texto no llevan cursor. */ }
  }
}

const enfocarCuadro = () => enfocar('[data-voz-texto]');

/* ── Escuchar de verdad ────────────────────────────────────────────────────

   Todo lo de aquí abajo es lo que pasa DESPUÉS de que alguien haya tocado
   «Hablar» a conciencia. Nunca se llega hasta aquí solo. */

async function escuchar(ctx) {
  const voz = vozDe(ctx);
  const info = DESTINOS[voz.destino];
  if (!info) return;

  guardarLoEscrito(ctx, voz);
  const base = voz.texto || '';
  const mia = ++voz.sesion;

  const motor = capacidad('dictar');
  if (!motor.ok) {
    fallar(ctx, voz, 'No se puede dictar aquí', motor.detalle, false);
    return;
  }

  const aviso = avisoDeVoz();
  voz.aviso = aviso || '';
  voz.estado = 'preparando';
  voz.error = '';
  voz.errorTitulo = '';
  voz.puedeAjustes = false;
  ctx.render();

  // La marca de «estoy dictando» se pone justo antes de abrir el micrófono y se
  // quita pase lo que pase. Si la aplicación muere en medio, la marca se queda,
  // y al arrancar la siguiente vez eso es la prueba de que el dictado se la
  // llevó por delante. Ver `comprobarSiElDictadoMatoLaApp`.
  recordar({ enCurso: true });

  let oido;
  try {
    oido = await dictar({
      idioma: 'es-DO',
      onParcial: trozo => {
        if (mia !== voz.sesion) return;
        voz.texto = juntar(base, trozo);
        // Lo que se va oyendo se escribe en el cuadro vivo. Redibujar el panel
        // entero por cada palabra parpadea, roba el foco y deja el dedo sin
        // saber dónde estaba el botón de parar.
        const cuadro = typeof document !== 'undefined' ? document.querySelector('[data-voz-texto]') : null;
        if (cuadro) { cuadro.value = voz.texto; cuadro.scrollTop = cuadro.scrollHeight; }
      },
      onEstado: estado => {
        if (mia !== voz.sesion || estado === 'listo') return;
        voz.estado = estado;
        ctx.render();
      }
    });
  } catch (error) {
    // `dictar` promete no lanzar, pero esta es la función que no puede permitirse
    // creerse esa promesa: si se rompiera, la marca de «estoy dictando» se
    // quedaría puesta y la próxima vez la app se acusaría de un cierre que no
    // hubo.
    oido = { ok: false, error: 'No se pudo escuchar. Prueba otra vez, o escríbelo a mano.' };
  }

  recordar({ enCurso: false });
  if (mia !== voz.sesion) return;

  if (oido.cancelado) {
    voz.estado = 'quieto';
    if (oido.texto) voz.texto = juntar(base, oido.texto);
    ctx.render();
    return;
  }

  if (oido.ok) {
    // Un acierto borra la mala fama del teléfono: si el micrófono funciona,
    // funciona, y seguir tratándolo como roto sería castigarlo por el pasado.
    recordar({ fallos: 0, ultimoMotivo: '' });
    voz.texto = juntar(base, oido.texto);
    voz.estado = 'quieto';
    voz.error = '';
    voz.errorTitulo = '';
    // `parcial` es lo que alcanzó a oír antes de cortarse. Se usa igual —tirarlo
    // obligaría a repetir la frase entera— pero se dice que quedó a medias.
    voz.aviso = oido.aviso || (oido.parcial ? 'Eso fue lo que alcancé a oír antes de que se cortara. Míralo antes de usarlo.' : voz.aviso);
    ctx.render();
    enfocarCuadro();
    return;
  }

  // Un fallo del micrófono no borra nada: lo que se oyera a medias sigue en el
  // cuadro, y el motivo viene de device.js ya escrito en español.
  if (oido.texto) voz.texto = juntar(base, oido.texto);
  anotarFallo(oido);
  fallar(ctx, voz, 'No pudimos escuchar', oido.error, oido.motivo === 'denegado');
}

// Solo cuentan como fallo del teléfono los que lo son. Que alguien cancele, o
// que no dijera nada, no dice nada malo del micrófono.
function anotarFallo(oido) {
  if (oido.cancelado) return;
  const memo = memoria();
  recordar({ fallos: memo.fallos + 1, ultimoMotivo: oido.motivo || 'error' });
}

function fallar(ctx, voz, titulo, detalle, ofrecerAjustes) {
  voz.estado = 'fallo';
  voz.errorTitulo = titulo;
  voz.error = detalle || 'No se pudo escuchar. Prueba otra vez, o escríbelo a mano.';
  voz.puedeAjustes = Boolean(ofrecerAjustes);
  ctx.render();
  // El foco va al cuadro y no al botón de reintentar: después de un fallo, lo
  // que casi siempre se quiere es escribirlo y seguir con la vida.
  enfocarCuadro();
}

// Lo que ya estuviera escrito es el punto de partida, no algo que se pisa.
function juntar(base, añadido) {
  const antes = String(base || '').trim();
  const nuevo = String(añadido || '').trim();
  if (!antes) return nuevo;
  if (!nuevo) return antes;
  return `${antes} ${nuevo}`;
}
