// Las pantallas de la cuenta.
//
// ── La decisión que gobierna este archivo ─────────────────────────────────
//
// La cuenta es opcional. La pantalla de sesión es lo primero que se ve, con todo
// lo que hay que ofrecer, pero abajo lleva «Seguir sin cuenta en este teléfono»,
// y eso no es un adorno: quien lleva dos años usando esta app tiene su despensa
// dentro, y una actualización no puede dejarle mirando un formulario de registro
// con sus propios datos al otro lado. Menos todavía si ese día no hay internet.
//
// Y tener cuenta no significa subir nada. Entrar sirve para poder recuperar la
// casa si se pierde el teléfono; que los datos viajen al servidor es una segunda
// decisión, con su interruptor y su explicación, y hasta que alguien lo encienda
// esta aplicación sigue sin mandar a ninguna parte lo que se cocina en su casa.
//
// ── Y la regla de siempre ─────────────────────────────────────────────────
//
// Ninguna de estas acciones puede tumbar la aplicación, y ninguna puede dejar a
// nadie mirando una pantalla que no dice en qué va. Cada llamada a la red tiene
// su estado de carga, su mensaje en español y su salida.

import { VUELTA_DE_GOOGLE, hayNube, porQueNoHayNube } from './config-nube.js';
import { canjearCodigo, direccionDeGoogle, entrar, recuperarContrasena, registrar, reenviarConfirmacion } from './nube.js';
import {
  arrancarSesion, cerrarSesion, fundirSesion, guardarSesion, leerSesion,
  revisarConfirmacion, revisarContrasena, revisarCorreo, revisarNombre, revisarRegistro,
  volverAquiDespuesDelCorreo
} from './sesion.js';
import {
  borrarCuenta, guardarCopiaAntesDeBajar, mereceLaPenaVincular,
  quedarseConLoDeAqui, sincronizar, vincular
} from './sincronizar.js';
import { BRAND_MARK } from './brand.js';
import { button, esc, notice } from './ui-kit.js';

export const emptyCuenta = () => ({
  vista: 'portada',   // portada · registro · entrar · recuperar · confirmar · cuenta · conflicto
  cargando: '',       // qué se está esperando ahora mismo, para el botón que toca
  error: '',
  aviso: '',
  errores: {},        // por campo, para poder ponerlo debajo del que falló
  correo: '',         // se conserva al pasar de una vista a otra: reescribirlo cansa
  nombre: '',
  conflicto: null,
  verificador: ''     // el secreto de PKCE mientras Google contesta
});

const cuentaDe = ctx => (ctx.ui.cuenta = ctx.ui.cuenta || emptyCuenta());
const sesionDe = ctx => ctx.ui.sesion || null;
const cargando = (cuenta, cual) => cuenta.cargando === cual;

// Un botón que sabe esperar. Mientras su acción está en marcha se queda
// deshabilitado y lo dice, porque un botón que no responde y no explica nada
// invita a tocarlo cinco veces, y cinco registros seguidos es un problema de
// verdad.
function botonDeEspera(etiqueta, esperando, accion, clase = 'btn-primary', extra = '') {
  return `<button type="${accion ? 'button' : 'submit'}" class="btn ${clase}" ${accion ? `data-action="${accion}"` : ''}
    ${esperando ? 'disabled aria-busy="true"' : ''} ${extra}>
    ${esperando ? `<span class="cuenta-girando" aria-hidden="true"></span>` : ''}${esc(esperando ? 'Un momento…' : etiqueta)}</button>`;
}

const campo = (nombre, etiqueta, tipo, valor, error, extra = '') => `
  <label class="field ${error ? 'field-mal' : ''}">
    <span>${esc(etiqueta)}</span>
    <input name="${esc(nombre)}" type="${esc(tipo)}" value="${esc(valor || '')}"
      ${error ? `aria-invalid="true" aria-describedby="mal-${esc(nombre)}"` : ''} ${extra}>
    ${error ? `<small class="cuenta-mal" id="mal-${esc(nombre)}">${esc(error)}</small>` : ''}
  </label>`;

/* ── Pintar ───────────────────────────────────────────────────────────────── */

export function renderCuenta(ctx) {
  const cuenta = cuentaDe(ctx);
  const sesion = sesionDe(ctx);
  if (sesion) return vistaCuenta(ctx, cuenta, sesion);
  if (cuenta.vista === 'conflicto') return vistaConflicto(ctx, cuenta);
  return `<section class="cuenta">${
    cuenta.vista === 'registro' ? vistaRegistro(cuenta)
    : cuenta.vista === 'entrar' ? vistaEntrar(cuenta)
    : cuenta.vista === 'recuperar' ? vistaRecuperar(cuenta)
    : cuenta.vista === 'confirmar' ? vistaConfirmar(cuenta)
    : vistaPortada(cuenta)
  }</section>`;
}

// La portada. Es lo primero que ve alguien que abre la app sin sesión, así que
// dice qué es esto antes de pedir nada.
function vistaPortada(cuenta) {
  const configurada = hayNube();
  return `
    <div class="cuenta-marca">
      <span class="cuenta-logo">${BRAND_MARK}</span>
      <h2>¿Qué comemos?</h2>
      <p>Organiza una vez lo habitual de tu casa y prepara cada mes cambiando solamente lo diferente.</p>
    </div>
    ${cuenta.error ? notice('No se pudo', esc(cuenta.error), 'error') : ''}
    ${cuenta.aviso ? notice('Aviso', esc(cuenta.aviso), 'warn') : ''}
    ${configurada ? `
      <div class="cuenta-acciones">
        ${botonDeEspera('Continuar con Google', cargando(cuenta, 'google'), 'cuenta-google', 'btn-secondary btn-grande cuenta-google')}
        ${botonDeEspera('Registrarme con correo', false, 'cuenta-ir-registro', 'btn-primary btn-grande')}
        ${button('Ya tengo una cuenta', 'cuenta-ir-entrar', 'btn-quiet btn-grande')}
        ${button('Recuperar mi contraseña', 'cuenta-ir-recuperar', 'btn-quiet btn-small')}
      </div>`
      : notice('Las cuentas todavía no están activadas', esc(porQueNoHayNube()), 'warn')}

    <div class="cuenta-sin">
      ${button('Seguir sin cuenta en este teléfono', 'cuenta-sin-cuenta', 'btn-quiet')}
      <p class="tiny muted">Todo funciona igual sin cuenta: la app guarda en este teléfono, como siempre. La cuenta sirve para poder recuperar tu casa si lo pierdes o lo cambias.</p>
    </div>`;
}

function vistaRegistro(cuenta) {
  const mal = cuenta.errores || {};
  return `
    ${cabecera('Crear mi cuenta', 'Con esto podrás recuperar tu casa si cambias de teléfono.')}
    ${cuenta.error ? notice('No se pudo crear la cuenta', esc(cuenta.error), 'error') : ''}
    <form data-form="cuenta-registro" class="stack" novalidate>
      ${campo('nombre', 'Tu nombre', 'text', cuenta.nombre, mal.nombre, 'autocomplete="name" autocapitalize="words" enterkeyhint="next"')}
      ${campo('correo', 'Tu correo electrónico', 'email', cuenta.correo, mal.correo, 'autocomplete="email" autocapitalize="none" spellcheck="false" enterkeyhint="next"')}
      ${campo('contrasena', 'Una contraseña', 'password', '', mal.contrasena, 'autocomplete="new-password" enterkeyhint="next"')}
      ${campo('confirmacion', 'Repite la contraseña', 'password', '', mal.confirmacion, 'autocomplete="new-password" enterkeyhint="done"')}
      <p class="tiny muted">Al menos ocho caracteres. No hace falta que sea rara: una frase que recuerdes es mejor que una palabra con símbolos.</p>
      <div class="cuenta-acciones">
        ${botonDeEspera('Crear mi cuenta', cargando(cuenta, 'registro'), '', 'btn-primary btn-grande')}
        ${button('Atrás', 'cuenta-ir-portada', 'btn-quiet')}
      </div>
    </form>`;
}

function vistaEntrar(cuenta) {
  const mal = cuenta.errores || {};
  return `
    ${cabecera('Entrar en mi cuenta', '')}
    ${cuenta.error ? notice('No se pudo entrar', esc(cuenta.error), 'error') : ''}
    ${cuenta.aviso ? notice('Aviso', esc(cuenta.aviso), 'warn') : ''}
    <form data-form="cuenta-entrar" class="stack" novalidate>
      ${campo('correo', 'Tu correo electrónico', 'email', cuenta.correo, mal.correo, 'autocomplete="email" autocapitalize="none" spellcheck="false" enterkeyhint="next"')}
      ${campo('contrasena', 'Tu contraseña', 'password', '', mal.contrasena, 'autocomplete="current-password" enterkeyhint="go"')}
      <div class="cuenta-acciones">
        ${botonDeEspera('Entrar', cargando(cuenta, 'entrar'), '', 'btn-primary btn-grande')}
        ${button('No me acuerdo de mi contraseña', 'cuenta-ir-recuperar', 'btn-quiet btn-small')}
        ${button('Atrás', 'cuenta-ir-portada', 'btn-quiet')}
      </div>
    </form>`;
}

function vistaRecuperar(cuenta) {
  const mal = cuenta.errores || {};
  return `
    ${cabecera('Recuperar mi contraseña', 'Te mandamos un enlace al correo para poner una nueva.')}
    ${cuenta.error ? notice('No se pudo', esc(cuenta.error), 'error') : ''}
    ${cuenta.aviso ? notice('Mira tu correo', esc(cuenta.aviso)) : ''}
    <form data-form="cuenta-recuperar" class="stack" novalidate>
      ${campo('correo', 'Tu correo electrónico', 'email', cuenta.correo, mal.correo, 'autocomplete="email" autocapitalize="none" spellcheck="false" enterkeyhint="go"')}
      <div class="cuenta-acciones">
        ${botonDeEspera('Mandarme el enlace', cargando(cuenta, 'recuperar'), '', 'btn-primary btn-grande')}
        ${button('Atrás', 'cuenta-ir-portada', 'btn-quiet')}
      </div>
    </form>`;
}

// El estado que más desconcierta si no se explica: la cuenta existe, pero hasta
// que no se toque el enlace del correo no se puede entrar.
function vistaConfirmar(cuenta) {
  return `
    ${cabecera('Confirma tu correo', '')}
    ${notice('Te mandamos un mensaje', `Ábrelo desde este teléfono y toca el enlace. Si no aparece en unos minutos, mira en la carpeta de correo no deseado: es donde suele caer el primero.`)}
    ${cuenta.error ? notice('No se pudo', esc(cuenta.error), 'error') : ''}
    ${cuenta.aviso ? notice('Hecho', esc(cuenta.aviso)) : ''}
    <p class="muted">Lo mandamos a <strong>${esc(cuenta.correo)}</strong>.</p>
    <div class="cuenta-acciones">
      ${botonDeEspera('Volver a mandarlo', cargando(cuenta, 'reenviar'), 'cuenta-reenviar', 'btn-secondary')}
      ${button('Ya lo confirmé, entrar', 'cuenta-ir-entrar', 'btn-primary btn-grande')}
      ${button('Atrás', 'cuenta-ir-portada', 'btn-quiet')}
    </div>`;
}

/* ── Con sesión ───────────────────────────────────────────────────────── */

function vistaCuenta(ctx, cuenta, sesion) {
  const sincronizando = Boolean(sesion.sincronizando);
  const ofrecerVincular = sincronizando && !sesion.vinculadoDe && mereceLaPenaVincular(ctx.datosDelTelefono?.());
  return `<section class="cuenta cuenta-dentro">
    ${cuenta.error ? notice('No se pudo', esc(cuenta.error), 'error') : ''}
    ${cuenta.aviso ? notice('Listo', esc(cuenta.aviso)) : ''}

    <div class="card cuenta-ficha">
      <div class="cuenta-quien">
        <span class="cuenta-inicial" aria-hidden="true">${esc((sesion.usuario.nombre || sesion.usuario.correo || '?').trim().charAt(0).toUpperCase())}</span>
        <div>
          <strong>${esc(sesion.usuario.nombre || 'Sin nombre')}</strong>
          <span class="muted">${esc(sesion.usuario.correo)}</span>
          ${sesion.usuario.confirmado ? '' : '<span class="pill gray">Correo sin confirmar</span>'}
        </div>
      </div>
    </div>

    <div class="card">
      <h3>Guardar mi casa en la cuenta</h3>
      <p class="muted">Hoy tus datos están solo en este teléfono. Si lo enciendes, la despensa, las comidas y las personas de tu casa se guardan también en tu cuenta, cifradas en el viaje, y vuelven solas si cambias de teléfono.</p>
      <p class="tiny muted">Mientras esté apagado no sale nada de aquí. Puedes apagarlo cuando quieras; lo que ya se haya subido se borra al borrar la cuenta.</p>
      <div class="cuenta-interruptor">
        ${botonDeEspera(
          sincronizando ? 'Apagar la sincronización' : 'Encender la sincronización',
          cargando(cuenta, 'sincronizar'),
          sincronizando ? 'cuenta-apagar-sync' : 'cuenta-encender-sync',
          sincronizando ? 'btn-quiet' : 'btn-primary'
        )}
        <span class="pill ${sincronizando ? '' : 'gray'}">${sincronizando ? 'Encendida' : 'Apagada'}</span>
      </div>
      ${sincronizando ? estadoDeLaSincronizacion(ctx, sesion) : ''}
      ${ofrecerVincular ? `<div class="cuenta-vincular">${notice(
        'Lo que ya tenías en este teléfono',
        'Hay una casa montada aquí desde antes de crear la cuenta. ¿La subo a tu cuenta? No se duplica nada: se copia tal cual está.'
      )}${botonDeEspera('Subir lo de este teléfono', cargando(cuenta, 'vincular'), 'cuenta-vincular', 'btn-secondary')}</div>` : ''}
    </div>

    <div class="card">
      <h3>Esta sesión</h3>
      <div class="cuenta-acciones">
        ${botonDeEspera('Cerrar sesión', cargando(cuenta, 'salir'), 'cuenta-salir', 'btn-secondary')}
      </div>
      <p class="tiny muted">Cerrar sesión no borra nada. Tu casa se queda donde está y la vuelves a ver al entrar.</p>
    </div>

    <div class="card cuenta-peligro">
      <h3>Borrar mi cuenta</h3>
      <p class="muted">Se borra la cuenta y todo lo que tenga guardado en el servidor, sin vuelta atrás. Lo de este teléfono se borra también.</p>
      <div class="cuenta-acciones">
        ${botonDeEspera('Borrar mi cuenta para siempre', cargando(cuenta, 'borrar'), 'cuenta-borrar', 'btn-quiet cuenta-borrar-btn')}
      </div>
    </div>
  </section>`;
}

function estadoDeLaSincronizacion(ctx, sesion) {
  const estado = ctx.ui.cuenta?.sincronia || null;
  if (!estado) return `<p class="tiny muted cuenta-estado">Revisión ${esc(String(sesion.revision || 0))}.</p>`;
  const dicho = {
    'al-dia': 'Todo al día.',
    subido: 'Subido lo de este teléfono.',
    bajado: 'Traído lo que había en tu cuenta.',
    'sin-red': 'Sin conexión ahora mismo. Se sube solo cuando vuelva.',
    error: 'No se pudo sincronizar la última vez.'
  }[estado.resultado] || '';
  return `<p class="tiny muted cuenta-estado ${esc(estado.resultado)}">${esc(dicho)}${estado.detalle ? ` ${esc(estado.detalle)}` : ''}</p>`;
}

function vistaConflicto(ctx, cuenta) {
  const conflicto = cuenta.conflicto || {};
  return `<section class="cuenta">
    ${cabecera('Hay dos versiones de tu casa', 'Una en este teléfono y otra en tu cuenta. No voy a tapar ninguna sin que me digas cuál.')}
    ${notice('Qué pasó', 'Se guardaron cambios en los dos sitios desde la última vez que se sincronizaron. Elige con cuál te quedas; antes de reemplazar nada guardo una copia de la otra, por si acaso.', 'warn')}
    <div class="cuenta-acciones">
      ${botonDeEspera('Quedarme con lo de este teléfono', cargando(cuenta, 'conflicto-aqui'), 'cuenta-conflicto-aqui', 'btn-primary btn-grande')}
      ${botonDeEspera('Traer lo que hay en mi cuenta', cargando(cuenta, 'conflicto-alla'), 'cuenta-conflicto-alla', 'btn-secondary btn-grande')}
    </div>
    <p class="tiny muted">Lo de tu cuenta se guardó ${esc(conflicto.cuando ? new Date(conflicto.cuando).toLocaleString('es-DO') : 'en otro momento')}.</p>
  </section>`;
}

const cabecera = (titulo, bajo) => `<div class="cuenta-cabecera"><h2>${esc(titulo)}</h2>${bajo ? `<p class="muted">${esc(bajo)}</p>` : ''}</div>`;

/* ── Acciones ─────────────────────────────────────────────────────────────

   Ninguna lanza. Las que salen a la red ponen su estado de carga antes y lo
   quitan siempre, incluso cuando lo que vuelve es un fallo. */

export const CUENTA_ACTIONS = {
  'cuenta-ir-portada': (el, ctx) => irA(ctx, 'portada'),
  'cuenta-ir-registro': (el, ctx) => irA(ctx, 'registro'),
  'cuenta-ir-entrar': (el, ctx) => irA(ctx, 'entrar'),
  'cuenta-ir-recuperar': (el, ctx) => irA(ctx, 'recuperar'),

  // Seguir sin cuenta: la app se abre con el cajón de este teléfono, que es
  // donde ya está lo de quien lleva tiempo usándola.
  'cuenta-sin-cuenta': (el, ctx) => {
    ctx.seguirSinCuenta();
  },

  'cuenta-google': async (el, ctx) => {
    const cuenta = cuentaDe(ctx);
    esperar(ctx, cuenta, 'google');
    try {
      const { url, verificador } = await direccionDeGoogle(VUELTA_DE_GOOGLE);
      // El secreto tiene que sobrevivir a que la app se vaya a segundo plano
      // mientras la persona escribe su contraseña en el navegador; si viviera
      // solo en memoria, volver sería imposible.
      cuenta.verificador = verificador;
      ctx.guardarVerificador?.(verificador);
      const abierto = await ctx.abrirEnNavegador(url);
      if (!abierto) {
        fallar(ctx, cuenta, 'No pude abrir el navegador para identificarte con Google. Puedes registrarte con tu correo.');
        return;
      }
      // Se deja el estado de carga puesto: la persona está fuera de la app y al
      // volver tiene que ver que seguimos esperando su vuelta.
      ctx.render();
    } catch (error) {
      fallar(ctx, cuenta, 'No se pudo empezar el inicio de sesión con Google. Prueba con tu correo.');
    }
  },

  'cuenta-reenviar': async (el, ctx) => {
    const cuenta = cuentaDe(ctx);
    esperar(ctx, cuenta, 'reenviar');
    const salida = await reenviarConfirmacion(cuenta.correo, volverAquiDespuesDelCorreo(VUELTA_DE_GOOGLE));
    cuenta.cargando = '';
    if (salida.ok) { cuenta.aviso = 'Mandado otra vez. Puede tardar un par de minutos.'; cuenta.error = ''; }
    else cuenta.error = salida.error;
    ctx.render();
  },

  'cuenta-salir': async (el, ctx) => {
    const cuenta = cuentaDe(ctx);
    if (!ctx.confirmar('¿Cerrar sesión? Tus datos se quedan guardados; los vuelves a ver al entrar.')) return;
    esperar(ctx, cuenta, 'salir');
    await cerrarSesion(sesionDe(ctx));
    ctx.alSalirDeLaCuenta();
  },

  'cuenta-encender-sync': async (el, ctx) => {
    const cuenta = cuentaDe(ctx);
    if (!ctx.confirmar('A partir de ahora, la despensa, las comidas y las personas de tu casa se guardarán también en tu cuenta. ¿Seguimos?')) return;
    esperar(ctx, cuenta, 'sincronizar');
    const encendida = guardarSesion(fundirSesion(sesionDe(ctx), { sincronizando: true }));
    ctx.ponerSesion(encendida);
    const salida = await ctx.sincronizarAhora({ hayCambiosLocales: true });
    cuenta.cargando = '';
    if (!salida.ok && !salida.sinRed) cuenta.error = salida.error || 'No se pudo encender la sincronización.';
    else cuenta.aviso = salida.sinRed ? 'Encendida. Se subirá en cuanto haya conexión.' : 'Encendida y al día.';
    ctx.render();
  },

  'cuenta-apagar-sync': async (el, ctx) => {
    const cuenta = cuentaDe(ctx);
    if (!ctx.confirmar('¿Dejar de guardar tu casa en la cuenta? Lo que ya esté subido se queda ahí hasta que borres la cuenta.')) return;
    const apagada = guardarSesion(fundirSesion(sesionDe(ctx), { sincronizando: false }));
    ctx.ponerSesion(apagada);
    cuenta.aviso = 'Apagada. Desde ahora no sale nada de este teléfono.';
    cuenta.error = '';
    ctx.render();
  },

  'cuenta-vincular': async (el, ctx) => {
    const cuenta = cuentaDe(ctx);
    esperar(ctx, cuenta, 'vincular');
    const salida = await vincular(sesionDe(ctx), ctx.datosDelTelefono());
    cuenta.cargando = '';
    if (salida.ok) {
      ctx.ponerSesion(salida.sesion);
      cuenta.aviso = 'Subido. Lo que tenías en este teléfono ya está en tu cuenta.';
      cuenta.error = '';
    } else if (salida.ocupada) {
      cuenta.error = `${salida.error} Si de verdad quieres reemplazarla, apaga y enciende la sincronización después de traerte lo que hay.`;
    } else {
      cuenta.error = salida.error || 'No se pudo subir.';
    }
    ctx.render();
  },

  'cuenta-conflicto-aqui': async (el, ctx) => {
    const cuenta = cuentaDe(ctx);
    esperar(ctx, cuenta, 'conflicto-aqui');
    const salida = await quedarseConLoDeAqui(sesionDe(ctx), ctx.datosDeLaCasa(), cuenta.conflicto?.revisionServidor || 0);
    cuenta.cargando = '';
    if (salida.ok) { ctx.ponerSesion(salida.sesion); cuenta.conflicto = null; cuenta.vista = 'cuenta'; cuenta.aviso = 'Listo. Tu cuenta tiene ahora lo de este teléfono.'; }
    else cuenta.error = salida.error || 'No se pudo guardar.';
    ctx.render();
  },

  'cuenta-conflicto-alla': (el, ctx) => {
    const cuenta = cuentaDe(ctx);
    const estado = cuenta.conflicto?.estadoServidor;
    if (!estado) { cuenta.error = 'No llegó la versión de tu cuenta. Prueba otra vez.'; ctx.render(); return; }
    // La copia primero. Si esto no cabe, no se baja: tapar sin red de seguridad
    // es exactamente lo que no se puede hacer aquí.
    if (!guardarCopiaAntesDeBajar(ctx.datosDeLaCasa())) {
      cuenta.error = 'No hay espacio en el teléfono para guardar una copia de seguridad antes de reemplazar. Libera algo y vuelve a intentarlo.';
      ctx.render();
      return;
    }
    const traido = ctx.traerEstadoDeLaNube(estado, cuenta.conflicto.revisionServidor);
    cuenta.conflicto = null;
    cuenta.vista = 'cuenta';
    cuenta.aviso = traido ? 'Traído lo de tu cuenta. Lo que había en este teléfono quedó guardado por si acaso.' : '';
    cuenta.error = traido ? '' : 'Lo que había en tu cuenta no se pudo leer. No se ha tocado nada de este teléfono.';
    ctx.render();
  },

  'cuenta-borrar': async (el, ctx) => {
    const cuenta = cuentaDe(ctx);
    if (!ctx.confirmar('Se va a borrar tu cuenta y todo lo que tenga guardado, en el servidor y en este teléfono. No se puede deshacer. ¿Seguro?')) return;
    if (!ctx.confirmar('Última vez: esto no tiene vuelta atrás. ¿Borrar la cuenta?')) return;
    esperar(ctx, cuenta, 'borrar');
    const salida = await borrarCuenta(sesionDe(ctx));
    cuenta.cargando = '';
    if (!salida.ok) {
      cuenta.error = salida.sinRed
        ? 'No hay conexión para borrar la cuenta en el servidor. Hazlo con internet, para que se borre de verdad en los dos sitios.'
        : (salida.error || 'No se pudo borrar la cuenta.');
      ctx.render();
      return;
    }
    ctx.alBorrarLaCuenta();
  }
};

/* ── Formularios ──────────────────────────────────────────────────────── */

export const CUENTA_FORMS = {
  'cuenta-registro': async (form, data, ctx) => {
    const cuenta = cuentaDe(ctx);
    const campos = {
      nombre: String(data.get('nombre') || ''),
      correo: String(data.get('correo') || '').trim(),
      contrasena: String(data.get('contrasena') || ''),
      confirmacion: String(data.get('confirmacion') || '')
    };
    cuenta.nombre = campos.nombre;
    cuenta.correo = campos.correo;

    const { errores, vale } = revisarRegistro(campos);
    cuenta.errores = errores;
    if (!vale) { cuenta.error = ''; ctx.render(); enfocarLoMalo(); return; }

    esperar(ctx, cuenta, 'registro');
    const salida = await registrar({
      correo: campos.correo,
      contrasena: campos.contrasena,
      nombre: campos.nombre,
      volverA: volverAquiDespuesDelCorreo(VUELTA_DE_GOOGLE)
    });
    cuenta.cargando = '';
    if (!salida.ok) { cuenta.error = salida.error; ctx.render(); return; }

    cuenta.error = '';
    cuenta.errores = {};
    if (salida.haceFaltaConfirmar) { cuenta.vista = 'confirmar'; ctx.render(); return; }
    await ctx.alEntrar(salida.sesion, { nueva: true });
  },

  'cuenta-entrar': async (form, data, ctx) => {
    const cuenta = cuentaDe(ctx);
    const correo = String(data.get('correo') || '').trim();
    const contrasena = String(data.get('contrasena') || '');
    cuenta.correo = correo;
    cuenta.errores = { correo: revisarCorreo(correo), contrasena: contrasena ? '' : 'Escribe tu contraseña.' };
    if (cuenta.errores.correo || cuenta.errores.contrasena) { cuenta.error = ''; ctx.render(); enfocarLoMalo(); return; }

    esperar(ctx, cuenta, 'entrar');
    const salida = await entrar({ correo, contrasena });
    cuenta.cargando = '';
    if (!salida.ok) {
      cuenta.error = salida.error;
      // Si lo que falta es confirmar el correo, se lleva a esa pantalla, que es
      // la que explica qué hacer, en vez de dejar un error rojo sin salida.
      if (salida.codigo === 'email_not_confirmed') { cuenta.vista = 'confirmar'; cuenta.error = ''; }
      ctx.render();
      return;
    }
    cuenta.error = '';
    cuenta.errores = {};
    await ctx.alEntrar(salida.sesion, { nueva: false });
  },

  'cuenta-recuperar': async (form, data, ctx) => {
    const cuenta = cuentaDe(ctx);
    const correo = String(data.get('correo') || '').trim();
    cuenta.correo = correo;
    cuenta.errores = { correo: revisarCorreo(correo) };
    if (cuenta.errores.correo) { cuenta.error = ''; ctx.render(); enfocarLoMalo(); return; }

    esperar(ctx, cuenta, 'recuperar');
    const salida = await recuperarContrasena(correo, volverAquiDespuesDelCorreo(VUELTA_DE_GOOGLE));
    cuenta.cargando = '';
    cuenta.errores = {};
    if (!salida.ok) { cuenta.error = salida.error; ctx.render(); return; }
    cuenta.error = '';
    // Se dice igual exista o no la cuenta: el servidor contesta lo mismo a
    // propósito, para que esta pantalla no sirva para averiguar qué correos
    // están registrados.
    cuenta.aviso = `Si hay una cuenta con ${correo}, ya va en camino un enlace para poner una contraseña nueva. Puede tardar un par de minutos, y a veces cae en correo no deseado.`;
    ctx.render();
  }
};

/* ── La vuelta de Google ───────────────────────────────────────────────────

   El navegador devuelve a la app por el enlace `quecomemos://cuenta?code=…`.
   `app.js` recoge ese enlace y llama aquí. */

export async function volvimosDeGoogle(ctx, enlace) {
  const cuenta = cuentaDe(ctx);
  let parametros;
  try { parametros = new URL(enlace).searchParams; }
  catch { return false; }

  const error = parametros.get('error_description') || parametros.get('error');
  if (error) {
    fallar(ctx, cuenta, `Google no completó el inicio de sesión: ${error}. Puedes entrar con tu correo.`);
    return true;
  }
  const codigo = parametros.get('code');
  if (!codigo) return false;

  const verificador = cuenta.verificador || ctx.leerVerificador?.() || '';
  if (!verificador) {
    fallar(ctx, cuenta, 'Se perdió el hilo del inicio de sesión con Google. Vuelve a tocar «Continuar con Google».');
    return true;
  }

  esperar(ctx, cuenta, 'google');
  const salida = await canjearCodigo(codigo, verificador);
  cuenta.cargando = '';
  cuenta.verificador = '';
  ctx.guardarVerificador?.('');
  if (!salida.ok) { cuenta.error = salida.error; ctx.render(); return true; }
  await ctx.alEntrar(salida.sesion, { nueva: false });
  return true;
}

/* ── Piezas pequeñas ──────────────────────────────────────────────────── */

function irA(ctx, vista) {
  const cuenta = cuentaDe(ctx);
  cuenta.vista = vista;
  cuenta.error = '';
  cuenta.aviso = '';
  cuenta.errores = {};
  cuenta.cargando = '';
  ctx.render();
}

function esperar(ctx, cuenta, cual) {
  cuenta.cargando = cual;
  cuenta.error = '';
  ctx.render();
}

function fallar(ctx, cuenta, mensaje) {
  cuenta.cargando = '';
  cuenta.error = mensaje;
  ctx.render();
}

// El foco al primer campo que falló: si no, en un teléfono el error queda fuera
// de la pantalla y parece que el botón no hizo nada.
function enfocarLoMalo() {
  if (typeof document === 'undefined') return;
  const campo = document.querySelector('.cuenta [aria-invalid="true"]');
  campo?.focus?.();
  campo?.scrollIntoView?.({ block: 'center' });
}

export { arrancarSesion, leerSesion, revisarContrasena, revisarConfirmacion, revisarCorreo, revisarNombre, sincronizar };
