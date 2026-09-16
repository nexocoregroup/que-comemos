// El puente con Supabase, escrito a mano.
//
// ── Por qué no se usa `@supabase/supabase-js` ──────────────────────────────
//
// Este proyecto no tiene empaquetador: los archivos que sirve `server.js` son
// exactamente los que viajan dentro del APK. Meter la biblioteca oficial exigía
// una de tres cosas, y las tres eran peores que escribir esto:
//
//   · Traerla de un CDN. La política de contenido no admite scripts de otro
//     sitio —y esa regla ha salvado cosas—, y además dejaría la app sin poder
//     arrancar sin conexión, que es justo lo contrario de lo que se quiere.
//   · Pegar su versión compilada en `src/`. Son más de cien kilobytes de código
//     que nadie de este proyecto ha leído, en un repositorio donde cada archivo
//     está comentado y se entiende.
//   · Añadir un empaquetador. Es la decisión más cara del proyecto y se tomó al
//     revés a propósito.
//
// Lo que esta aplicación necesita de Supabase es HTTP corriente: seis llamadas
// de autenticación y dos de datos. Eso cabe aquí, se lee en una tarde y se puede
// probar contra un servidor de mentira sin levantar nada.
//
// ── Las reglas de este archivo ─────────────────────────────────────────────
//
//   1. Nada lanza hacia fuera. Todo devuelve `{ ok, datos }` o `{ ok: false,
//      error, codigo, red }`, con `error` ya escrito en español. Quien llama
//      tiene a una persona esperando delante de una pantalla.
//   2. `red: true` marca los fallos que son de conexión y no de la cuenta. Son
//      los únicos que se pueden reintentar solos, y distinguirlos es lo que
//      permite que la app siga funcionando sin internet en vez de acusar a
//      alguien de haberse equivocado de contraseña.
//   3. Ninguna llamada se espera para siempre. Un teléfono con una barra de
//      cobertura deja las peticiones colgadas sin cerrarlas nunca.
//   4. Aquí no se guarda nada ni se decide nada. Este archivo habla con el
//      servidor; quién está dentro de la sesión lo lleva `sesion.js`.

import { NUBE, hayNube, porQueNoHayNube, urlLimpia } from './config-nube.js';

// Quince segundos. Una llamada de autenticación sana tarda menos de uno; si
// tarda más de quince, o la cobertura está para regalar o el servidor está
// caído, y en los dos casos lo que hay que hacer es decirlo y seguir sin red.
const TOPE_MS = 15000;

/* ── Los mensajes ──────────────────────────────────────────────────────────

   Supabase contesta en inglés y con jerga: `invalid_credentials`,
   `email_not_confirmed`, `over_email_send_rate_limit`. Nada de eso se le enseña
   a nadie. Cada código se convierte en una frase que dice qué pasó y qué hacer,
   y el código crudo se guarda aparte para poder diagnosticar. */

const GENERICO = 'No se pudo completar. Prueba otra vez dentro de un momento.';
const SIN_RED = 'No hay conexión ahora mismo. Tus datos siguen aquí en el teléfono; esto se puede hacer cuando vuelva internet.';

const MENSAJES = {
  invalid_credentials: 'El correo o la contraseña no coinciden. Revísalos; si no te acuerdas de la contraseña, abajo puedes pedir una nueva.',
  email_not_confirmed: 'Todavía no has confirmado tu correo. Busca el mensaje que te enviamos —mira también en la carpeta de correo no deseado— y toca el enlace.',
  user_already_exists: 'Ya hay una cuenta con ese correo. Entra con ella, o pide una contraseña nueva si no te acuerdas.',
  email_exists: 'Ya hay una cuenta con ese correo. Entra con ella, o pide una contraseña nueva si no te acuerdas.',
  weak_password: 'Esa contraseña es demasiado fácil de adivinar. Ponle al menos ocho caracteres y mézclalos.',
  over_email_send_rate_limit: 'Se han pedido demasiados correos seguidos. Espera unos minutos y vuelve a intentarlo.',
  over_request_rate_limit: 'Demasiados intentos seguidos. Espera un minuto y prueba otra vez.',
  validation_failed: 'Falta algún dato o alguno no tiene el formato correcto. Revisa lo escrito.',
  email_address_invalid: 'Ese correo no parece un correo. Revísalo.',
  signup_disabled: 'El registro de cuentas nuevas está cerrado en este momento.',
  email_provider_disabled: 'El registro por correo no está activado en el proyecto. Se activa en el panel de Supabase, en Authentication → Providers.',
  provider_disabled: 'Ese proveedor no está activado en el proyecto. Se activa en el panel de Supabase, en Authentication → Providers.',
  bad_jwt: 'Tu sesión ya no vale. Vuelve a entrar.',
  session_not_found: 'Tu sesión ya no vale. Vuelve a entrar.',
  refresh_token_not_found: 'Tu sesión caducó. Vuelve a entrar.',
  refresh_token_already_used: 'Tu sesión caducó. Vuelve a entrar.',
  user_not_found: 'No encontramos esa cuenta.',
  same_password: 'Esa es la misma contraseña que ya tenías. Escribe una distinta.',
  reauthentication_needed: 'Por seguridad, vuelve a entrar antes de hacer este cambio.'
};

// Cuando el servidor no manda `error_code` —las versiones viejas no lo mandan—
// queda el texto. Se reconocen los que tienen consejo propio.
const PORELTEXTO = [
  [/invalid login credentials/i, 'invalid_credentials'],
  [/email not confirmed/i, 'email_not_confirmed'],
  [/already registered|already exists/i, 'user_already_exists'],
  [/password should be at least|weak password/i, 'weak_password'],
  [/rate limit|too many requests/i, 'over_request_rate_limit'],
  [/signups not allowed|signup is disabled/i, 'signup_disabled']
];

function codigoDe(cuerpo, estado) {
  const directo = String(cuerpo?.error_code || cuerpo?.error || '').trim();
  if (directo && MENSAJES[directo]) return directo;
  const texto = String(cuerpo?.msg || cuerpo?.error_description || cuerpo?.message || '');
  for (const [patron, codigo] of PORELTEXTO) if (patron.test(texto)) return codigo;
  if (directo) return directo;
  return `http_${estado}`;
}

function mensajeDe(codigo, estado) {
  if (MENSAJES[codigo]) return MENSAJES[codigo];
  if (estado === 401 || estado === 403) return 'Tu sesión ya no vale. Vuelve a entrar.';
  if (estado === 404) return 'No encontramos eso. Puede que se haya borrado desde otro teléfono.';
  if (estado === 409) return 'Alguien cambió esto antes que tú. Vuelve a abrirlo para ver lo último.';
  if (estado >= 500) return 'El servidor no está respondiendo bien ahora mismo. Prueba otra vez en un rato; tus datos siguen aquí en el teléfono.';
  return GENERICO;
}

/* ── La llamada ────────────────────────────────────────────────────────────

   Todo pasa por aquí: una sola puerta de salida a la red en toda la aplicación.
   Eso no es estilo, es lo que hace comprobable la afirmación «esta app solo
   habla con tu proyecto de Supabase y con nadie más». */

async function llamar(ruta, { metodo = 'GET', cuerpo = null, token = null, cabeceras = {}, tope = TOPE_MS } = {}) {
  if (!hayNube()) return { ok: false, codigo: 'sin_configurar', error: porQueNoHayNube(), red: false };

  const reloj = new AbortController();
  const id = setTimeout(() => reloj.abort(), tope);
  let respuesta;
  try {
    respuesta = await fetch(`${urlLimpia()}${ruta}`, {
      method: metodo,
      signal: reloj.signal,
      headers: {
        apikey: NUBE.clave,
        // Sin sesión se usa la clave anónima como portador, que es lo que espera
        // Supabase y lo que hace que las políticas de seguridad vean «nadie».
        Authorization: `Bearer ${token || NUBE.clave}`,
        ...(cuerpo === null ? {} : { 'Content-Type': 'application/json' }),
        ...cabeceras
      },
      body: cuerpo === null ? undefined : JSON.stringify(cuerpo)
    });
  } catch (error) {
    // Aquí caen las dos cosas que no son culpa de nadie: no hay internet, y el
    // servidor tardó más de lo que estamos dispuestos a esperar.
    const abortado = error?.name === 'AbortError';
    return {
      ok: false,
      red: true,
      codigo: abortado ? 'sin_respuesta' : 'sin_red',
      error: abortado ? 'El servidor tardó demasiado en contestar. Tus datos siguen aquí en el teléfono; prueba otra vez en un momento.' : SIN_RED
    };
  } finally {
    clearTimeout(id);
  }

  const texto = await respuesta.text().catch(() => '');
  let cuerpoLeido = null;
  if (texto) { try { cuerpoLeido = JSON.parse(texto); } catch { cuerpoLeido = null; } }

  if (!respuesta.ok) {
    const codigo = codigoDe(cuerpoLeido, respuesta.status);
    return {
      ok: false,
      red: respuesta.status >= 500,
      codigo,
      estado: respuesta.status,
      error: mensajeDe(codigo, respuesta.status),
      // El texto crudo del servidor, para el detalle técnico. No se enseña.
      detalle: String(cuerpoLeido?.msg || cuerpoLeido?.error_description || cuerpoLeido?.message || texto).slice(0, 300)
    };
  }
  return { ok: true, datos: cuerpoLeido, cabeceras: respuesta.headers, estado: respuesta.status };
}

/* ── Autenticación ─────────────────────────────────────────────────────────
   Contra `/auth/v1`, que es GoTrue. Los nombres de los campos vienen de su
   especificación, no de la memoria de nadie. */

// Crear la cuenta.
//
// Ojo a la forma de la respuesta, que es la parte que más confunde: si el
// proyecto exige confirmar el correo, esto devuelve el usuario SIN sesión, y no
// es un error —es que hay que ir a mirar el correo—. Si no la exige, devuelve
// sesión y se entra directo. Los dos casos son buenos y hay que distinguirlos.
// `volverA` es a dónde lleva el enlace del correo de confirmación después de
// validarlo. Decirlo aquí no es opcional aunque el servidor tenga un valor por
// omisión: ese valor —el «Site URL» del panel— viene de fábrica apuntando a
// `http://localhost:3000`, y quien tocara el enlace desde su teléfono acabaría
// en una página que no existe. La cuenta quedaría confirmada igual, porque eso
// pasa en el servidor antes de la redirección, pero la persona vería un error
// del navegador y daría por hecho que falló.
//
// No está en el `openapi.yaml` de GoTrue, pero es lo que hace el cliente
// oficial: `redirectTo` se convierte en `?redirect_to=` sobre la propia
// dirección de la llamada (auth-js, src/lib/fetch.ts).
export async function registrar({ correo, contrasena, nombre, volverA = '' }) {
  const salida = await llamar(`/auth/v1/signup${volverA ? `?redirect_to=${encodeURIComponent(volverA)}` : ''}`, {
    metodo: 'POST',
    cuerpo: { email: correo, password: contrasena, data: { nombre: String(nombre || '').trim() } }
  });
  if (!salida.ok) return salida;

  const datos = salida.datos || {};
  if (datos.access_token) return { ok: true, sesion: sesionDesde(datos), haceFaltaConfirmar: false };
  return { ok: true, sesion: null, haceFaltaConfirmar: true, usuario: usuarioDesde(datos) };
}

export async function entrar({ correo, contrasena }) {
  const salida = await llamar('/auth/v1/token?grant_type=password', {
    metodo: 'POST',
    cuerpo: { email: correo, password: contrasena }
  });
  if (!salida.ok) return salida;
  return { ok: true, sesion: sesionDesde(salida.datos) };
}

// Renovar antes de que caduque. El token de acceso dura una hora; el de
// refresco, semanas. Esto es lo que hace que «la sesión siga ahí» después de
// cerrar y abrir la app tres días después.
export async function renovar(refresco) {
  const salida = await llamar('/auth/v1/token?grant_type=refresh_token', {
    metodo: 'POST',
    cuerpo: { refresh_token: refresco }
  });
  if (!salida.ok) return salida;
  return { ok: true, sesion: sesionDesde(salida.datos) };
}

export async function salir(token) {
  // Da igual lo que conteste: la sesión local se borra de todas formas. Que el
  // servidor no se entere de que alguien cerró sesión es molesto; que alguien
  // toque «Cerrar sesión» y se quede dentro porque no había cobertura es
  // inaceptable.
  const salida = await llamar('/auth/v1/logout', { metodo: 'POST', token });
  return { ok: true, avisado: salida.ok };
}

export async function recuperarContrasena(correo, volverA) {
  // Contesta 200 exista o no exista la cuenta, a propósito: así nadie puede
  // usar esta pantalla para averiguar qué correos están registrados.
  const ruta = volverA ? `/auth/v1/recover?redirect_to=${encodeURIComponent(volverA)}` : '/auth/v1/recover';
  return llamar(ruta, { metodo: 'POST', cuerpo: { email: correo } });
}

export async function cambiarContrasena(token, contrasena) {
  const salida = await llamar('/auth/v1/user', { metodo: 'PUT', token, cuerpo: { password: contrasena } });
  if (!salida.ok) return salida;
  return { ok: true, usuario: usuarioDesde(salida.datos) };
}

export async function quienSoy(token) {
  const salida = await llamar('/auth/v1/user', { token });
  if (!salida.ok) return salida;
  return { ok: true, usuario: usuarioDesde(salida.datos) };
}

// Reenviar el correo de confirmación, para quien lo borró sin querer.
export async function reenviarConfirmacion(correo) {
  return llamar('/auth/v1/resend', { metodo: 'POST', cuerpo: { type: 'signup', email: correo } });
}

/* ── Google ────────────────────────────────────────────────────────────────

   Aquí no se llama a nada: se construye la dirección a la que hay que mandar a
   la persona, y quien llama la abre en el navegador del teléfono.

   Tiene que ser el navegador del sistema y no el WebView de la app, y no es un
   capricho: Google rechaza desde 2021 los inicios de sesión hechos dentro de un
   WebView incrustado, con el error `disallowed_useragent`. Es una medida suya
   contra las apps que espían la contraseña de quien entra, y no hay forma de
   esquivarla ni conviene que la haya.

   Se usa PKCE: se manda un resumen del secreto en la ida, y el secreto entero
   en la vuelta. Así, aunque otra aplicación del teléfono consiga interceptar el
   enlace de vuelta, sin el secreto no puede canjear el código por una sesión. */

export async function direccionDeGoogle(vuelta) {
  const verificador = secretoParaPKCE();
  const reto = await resumenSHA256(verificador);
  const parametros = new URLSearchParams({
    provider: 'google',
    redirect_to: vuelta,
    code_challenge: reto,
    code_challenge_method: 's256'
  });
  return { url: `${urlLimpia()}/auth/v1/authorize?${parametros}`, verificador };
}

// La vuelta: se cambia el código por una sesión de verdad.
export async function canjearCodigo(codigo, verificador) {
  const salida = await llamar('/auth/v1/token?grant_type=pkce', {
    metodo: 'POST',
    cuerpo: { auth_code: codigo, code_verifier: verificador }
  });
  if (!salida.ok) return salida;
  return { ok: true, sesion: sesionDesde(salida.datos) };
}

function secretoParaPKCE() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function resumenSHA256(texto) {
  const datos = new TextEncoder().encode(texto);
  const resumen = await globalThis.crypto.subtle.digest('SHA-256', datos);
  return base64url(new Uint8Array(resumen));
}

function base64url(bytes) {
  let binario = '';
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* ── Datos ─────────────────────────────────────────────────────────────────
   Contra `/rest/v1`, que es PostgREST. Lo que se puede leer y escribir lo
   deciden las políticas por fila de la base de datos, no este archivo: aunque
   alguien reescribiera todo esto, seguiría sin poder ver la casa de otro. */

export async function leerTabla(tabla, consulta, token) {
  return llamar(`/rest/v1/${tabla}?${consulta}`, { token });
}

export async function insertar(tabla, fila, token) {
  const salida = await llamar(`/rest/v1/${tabla}`, {
    metodo: 'POST',
    token,
    cuerpo: fila,
    // Sin esto PostgREST contesta vacío y no se sabe qué identificador puso.
    cabeceras: { Prefer: 'return=representation' }
  });
  if (!salida.ok) return salida;
  return { ok: true, datos: Array.isArray(salida.datos) ? salida.datos[0] : salida.datos };
}

export async function actualizar(tabla, consulta, cambios, token) {
  const salida = await llamar(`/rest/v1/${tabla}?${consulta}`, {
    metodo: 'PATCH',
    token,
    cuerpo: cambios,
    cabeceras: { Prefer: 'return=representation' }
  });
  if (!salida.ok) return salida;
  // Cero filas devueltas no es un error de HTTP: es que la condición no encajó
  // con nada. Es así como se entera esta app de que alguien guardó antes.
  return { ok: true, filas: Array.isArray(salida.datos) ? salida.datos : [] };
}

export async function borrar(tabla, consulta, token) {
  return llamar(`/rest/v1/${tabla}?${consulta}`, { metodo: 'DELETE', token });
}

// Llamar a una función guardada en la base de datos. Se usa para borrar la
// cuenta: eso no lo puede hacer un cliente por su cuenta —haría falta la clave
// de servicio, que no está aquí ni debe estarlo—, así que lo hace una función
// del servidor que solo sabe borrarse a sí misma.
export async function llamarFuncion(nombre, argumentos, token) {
  return llamar(`/rest/v1/rpc/${nombre}`, { metodo: 'POST', token, cuerpo: argumentos || {} });
}

/* ── Traducir lo que contesta el servidor ──────────────────────────────── */

function sesionDesde(datos) {
  const ahora = Math.floor(Date.now() / 1000);
  return {
    token: String(datos?.access_token || ''),
    refresco: String(datos?.refresh_token || ''),
    // `expires_at` viene en algunas respuestas y en otras no; `expires_in`
    // siempre. Se guarda el momento absoluto porque es lo que se puede comparar
    // después de tener el teléfono apagado dos días.
    caducaEn: Number(datos?.expires_at) || ahora + (Number(datos?.expires_in) || 3600),
    usuario: usuarioDesde(datos?.user)
  };
}

function usuarioDesde(datos) {
  if (!datos?.id) return null;
  return {
    id: String(datos.id),
    correo: String(datos.email || ''),
    // El nombre puede venir de tres sitios según cómo se creara la cuenta: de lo
    // que escribió la persona al registrarse, o de lo que mandó Google.
    nombre: String(datos.user_metadata?.nombre || datos.user_metadata?.full_name || datos.user_metadata?.name || '').trim(),
    confirmado: Boolean(datos.email_confirmed_at || datos.confirmed_at)
  };
}
