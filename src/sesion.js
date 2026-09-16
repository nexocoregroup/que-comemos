// Quién está dentro, y dónde viven sus datos.
//
// ── El problema que resuelve el reparto de cajones ─────────────────────────
//
// Hasta ahora había un solo sitio donde se guardaba todo: `que-comemos-v1`. Con
// cuentas eso deja de servir, y no por elegancia: si María cierra sesión y entra
// Pedro en el mismo teléfono, Pedro vería la despensa de María. No es un fallo
// de presentación, es que estaría mirando lo que compra otra casa.
//
// Así que cada cuenta tiene su propio cajón:
//
//   que-comemos-v1                 ← la casa de este teléfono, sin cuenta.
//                                     Es donde ya están los datos de quien tiene
//                                     la app instalada hoy. No se toca nunca.
//   que-comemos-v1::<id-usuario>   ← la casa de cada cuenta.
//
// Quien lleva dos años usando esto sin cuenta abre la versión nueva y encuentra
// exactamente lo suyo, en su sitio, sin que nadie le pida nada. Si algún día
// crea una cuenta, se le ofrece llevárselo; si no la crea, sigue igual para
// siempre.
//
// ── Y la sesión ───────────────────────────────────────────────────────────
//
// Se guarda aparte de los datos de la casa, porque es de otra naturaleza: los
// datos son de la casa y la sesión es de este teléfono. Llevarse la sesión en un
// respaldo sería meter el token de alguien en un archivo que se manda por
// WhatsApp.

import { STORAGE_KEY } from './storage.js';
import { hayNube, urlLimpia } from './config-nube.js';
import { quienSoy, renovar, salir } from './nube.js';

export const CLAVE_SESION = 'que-comemos-sesion-v1';

// Un minuto de margen antes de que caduque el token. Renovar justo en el
// segundo exacto deja peticiones a medio camino con un token ya muerto.
const MARGEN_MS = 60000;

/* ── Dónde se guarda la casa de quien está dentro ─────────────────────── */

export function cajonDe(usuarioId) {
  const id = String(usuarioId || '').trim();
  return id ? `${STORAGE_KEY}::${id}` : STORAGE_KEY;
}

// El cajón sin cuenta, que es donde está lo de quien ya usaba la app.
export const CAJON_DE_ESTE_TELEFONO = STORAGE_KEY;

/* ── Leer y guardar la sesión ──────────────────────────────────────────── */

export function leerSesion(storage = globalThis.localStorage) {
  try {
    const crudo = storage?.getItem(CLAVE_SESION);
    if (!crudo) return null;
    const leida = JSON.parse(crudo);
    if (!leida?.usuario?.id || !leida?.token) return null;
    return {
      token: String(leida.token),
      refresco: String(leida.refresco || ''),
      caducaEn: Number(leida.caducaEn) || 0,
      usuario: {
        id: String(leida.usuario.id),
        correo: String(leida.usuario.correo || ''),
        nombre: String(leida.usuario.nombre || ''),
        confirmado: Boolean(leida.usuario.confirmado)
      },
      // A qué hogar del servidor pertenece este teléfono, y por dónde iba la
      // sincronización. Vacío mientras no se haya encendido.
      hogarId: String(leida.hogarId || ''),
      sincronizando: Boolean(leida.sincronizando),
      revision: Number(leida.revision) || 0,
      // De qué cajón se copiaron los datos al vincular, para no ofrecerlo dos
      // veces ni copiarlo dos veces.
      vinculadoDe: String(leida.vinculadoDe || '')
    };
  } catch {
    // Una sesión ilegible es una sesión que no hay. Se sigue sin ella en vez de
    // dejar la aplicación sin arrancar.
    return null;
  }
}

export function guardarSesion(sesion, storage = globalThis.localStorage) {
  if (!sesion) return olvidarSesion(storage);
  try { storage?.setItem(CLAVE_SESION, JSON.stringify(sesion)); } catch { /* Sin sitio, la sesión dura lo que dure la app abierta. */ }
  return sesion;
}

export function olvidarSesion(storage = globalThis.localStorage) {
  try { storage?.removeItem(CLAVE_SESION); } catch { /* Nada que borrar. */ }
  return null;
}

// Mezclar sin perder lo que no venía en la respuesta del servidor: renovar el
// token no puede borrar a qué hogar pertenece este teléfono.
export function fundirSesion(anterior, nueva) {
  return {
    ...(anterior || {}),
    ...nueva,
    usuario: nueva.usuario || anterior?.usuario || null
  };
}

/* ── El token, siempre fresco ──────────────────────────────────────────────

   Aquí está lo que hace que la sesión aguante: el token de acceso dura una hora,
   el de refresco semanas. Quien abre la app el jueves después de haberla cerrado
   el lunes tiene el de acceso caducado y el de refresco bueno, y no tiene por
   qué enterarse de nada.

   Lo que devuelve importa tanto como el token:

     { ok: true, token, sesion }                 — se puede hablar con el servidor
     { ok: false, sinRed: true, sesion }         — no hay internet, PERO la sesión
                                                   sigue siendo válida: la app
                                                   trabaja con los datos locales
     { ok: false, caducada: true }               — hay que volver a entrar

   Esa segunda línea es toda la diferencia entre una app que se puede usar en la
   cocina del sótano y una que no. */

export async function tokenFresco(sesion, storage = globalThis.localStorage) {
  if (!sesion?.token) return { ok: false, caducada: true };
  const ahoraMs = Date.now();
  const caducaMs = (Number(sesion.caducaEn) || 0) * 1000;
  if (caducaMs - MARGEN_MS > ahoraMs) return { ok: true, token: sesion.token, sesion };

  if (!sesion.refresco) return { ok: false, caducada: true };
  const renovada = await renovar(sesion.refresco);
  if (renovada.ok) {
    const fundida = fundirSesion(sesion, renovada.sesion);
    guardarSesion(fundida, storage);
    return { ok: true, token: fundida.token, sesion: fundida };
  }
  // Si lo que falló fue la red, la sesión NO se tira. El token estará vencido
  // para hablar con el servidor, pero quien abrió la app sigue siendo quien es y
  // sus datos siguen en este teléfono.
  if (renovada.red) return { ok: false, sinRed: true, sesion, error: renovada.error };
  return { ok: false, caducada: true, error: renovada.error };
}

/* ── Arrancar ──────────────────────────────────────────────────────────────

   Lo que pasa al abrir la aplicación. Nunca deja a nadie fuera por no haber
   internet: si hay sesión guardada, se entra con ella y ya se renovará cuando
   haya cobertura. */

export async function arrancarSesion(storage = globalThis.localStorage) {
  if (!hayNube()) return { estado: 'sin-configurar', sesion: null };
  const guardada = leerSesion(storage);
  if (!guardada) return { estado: 'fuera', sesion: null };

  const fresco = await tokenFresco(guardada, storage);
  if (fresco.ok) {
    // Se aprovecha para traer el usuario actualizado: si confirmó el correo
    // desde la computadora, aquí es donde la app se entera.
    const quien = await quienSoy(fresco.token);
    if (quien.ok && quien.usuario) {
      const fundida = fundirSesion(fresco.sesion, { usuario: quien.usuario });
      guardarSesion(fundida, storage);
      return { estado: 'dentro', sesion: fundida };
    }
    return { estado: 'dentro', sesion: fresco.sesion };
  }
  if (fresco.sinRed) return { estado: 'dentro-sin-red', sesion: guardada, aviso: fresco.error };

  // Caducada de verdad. Se borra la sesión pero NO los datos: la casa sigue en
  // su cajón, esperando a que quien sea vuelva a entrar.
  olvidarSesion(storage);
  return { estado: 'fuera', sesion: null, aviso: 'Tu sesión caducó. Vuelve a entrar; tus datos siguen aquí.' };
}

/* ── Cerrar sesión ─────────────────────────────────────────────────────────

   Se avisa al servidor si se puede, y se borra la sesión de este teléfono
   siempre. Lo segundo no depende de lo primero: alguien que toca «Cerrar
   sesión» en un sótano sin cobertura tiene que quedar fuera igualmente.

   Los datos de su cajón se quedan. Cerrar sesión no es borrar la cuenta, y
   quien vuelva a entrar mañana espera encontrar su despensa donde la dejó. */

export async function cerrarSesion(sesion, storage = globalThis.localStorage) {
  if (sesion?.token) await salir(sesion.token).catch(() => ({ ok: true }));
  olvidarSesion(storage);
  return { ok: true };
}

/* ── Validaciones, en español y antes de salir a la red ───────────────────

   Comprobar aquí lo que se puede comprobar aquí no es desconfiar del servidor:
   es no hacer esperar tres segundos a alguien para decirle que se le olvidó la
   arroba. */

export const MINIMO_CONTRASENA = 8;

export function revisarNombre(valor) {
  const nombre = String(valor || '').trim();
  if (!nombre) return 'Escribe tu nombre.';
  if (nombre.length < 2) return 'Ese nombre es muy corto.';
  if (nombre.length > 60) return 'Ese nombre es demasiado largo.';
  return '';
}

export function revisarCorreo(valor) {
  const correo = String(valor || '').trim();
  if (!correo) return 'Escribe tu correo electrónico.';
  // Ni una sola arroba, o espacios por medio, o nada después del punto. No se
  // intenta validar un correo con una expresión regular perfecta —no existe—,
  // solo cazar lo que es claramente un error de tecleo.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) return 'Ese correo no parece un correo. Revísalo: tiene que ser algo como nombre@ejemplo.com.';
  if (correo.length > 254) return 'Ese correo es demasiado largo.';
  return '';
}

export function revisarContrasena(valor) {
  const contrasena = String(valor || '');
  if (!contrasena) return 'Escribe una contraseña.';
  if (contrasena.length < MINIMO_CONTRASENA) return `La contraseña necesita al menos ${MINIMO_CONTRASENA} caracteres. Cuantos más, mejor.`;
  if (contrasena.length > 72) return 'La contraseña no puede pasar de 72 caracteres.';
  // Una contraseña que es solo el mismo carácter repetido pasa el mínimo de
  // ocho y no protege nada.
  if (/^(.)\1+$/.test(contrasena)) return 'Esa contraseña es el mismo carácter repetido. Mézclalo un poco.';
  return '';
}

export function revisarConfirmacion(contrasena, confirmacion) {
  if (!String(confirmacion || '')) return 'Repite la contraseña.';
  if (String(contrasena) !== String(confirmacion)) return 'Las dos contraseñas no son iguales. Míralas otra vez.';
  return '';
}

// Todo el formulario de una vez, para poder pintar cada error junto a su campo.
export function revisarRegistro({ nombre, correo, contrasena, confirmacion }) {
  const errores = {
    nombre: revisarNombre(nombre),
    correo: revisarCorreo(correo),
    contrasena: revisarContrasena(contrasena),
    confirmacion: revisarConfirmacion(contrasena, confirmacion)
  };
  return { errores, vale: Object.values(errores).every(error => !error) };
}

/* ── El correo de vuelta ───────────────────────────────────────────────────
   A dónde manda Supabase a quien toca el enlace de «recuperar contraseña». En
   el teléfono es el enlace propio de la app; en el navegador, la propia página. */

export function volverAquiDespuesDelCorreo(esquema) {
  if (esquema) return esquema;
  if (typeof globalThis.location?.origin === 'string' && globalThis.location.origin.startsWith('http')) {
    return globalThis.location.origin;
  }
  return urlLimpia();
}
