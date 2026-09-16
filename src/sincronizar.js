// Subir y bajar la casa, sin perder nada por el camino.
//
// ── Qué se sincroniza, y por qué así ───────────────────────────────────────
//
// El estado de esta aplicación es un solo documento JSON: la despensa, las
// comidas, las personas, las rutinas, todo. Podría trocearse en tablas —una fila
// por alimento, otra por comida— y sería lo que hace casi todo el mundo. Aquí se
// sube entero, como un documento, y conviene decir por qué, porque parece la
// opción perezosa y no lo es:
//
//   Los identificadores de esta app son correlativos por aparato:
//   `producto-1`, `comida-7`, y el siguiente sale de `state.seq`. Dos teléfonos
//   de la misma casa inventarían los dos un `producto-5` para cosas distintas.
//   Trocear en filas sin arreglar eso antes no sincroniza: mezcla. Y arreglarlo
//   es cambiar todos los identificadores de todas las casas que ya existen, que
//   es una migración de las que se hacen una vez y con mucho cuidado.
//
//   Hoy no hace falta: no hay invitaciones, así que una casa es un teléfono. El
//   documento entero se sube, se baja y se compara por un número de revisión, y
//   eso es correcto para lo que hay. El día que haya invitaciones, esa migración
//   será lo primero que haya que hacer, y este archivo se reescribe entero.
//
//   Se escribe aquí para que quien llegue entonces no crea que esto era ingenuo.
//
// ── La revisión, que es lo que impide perder trabajo ───────────────────────
//
// Cada hogar del servidor lleva un número que sube en cada guardado. Este
// teléfono recuerda cuál fue el último que vio. Al subir, se pide «cambia la
// fila SOLO si sigue en la revisión que yo vi»; si el servidor contesta que no
// cambió ninguna fila, es que alguien guardó antes y hay dos versiones. Entonces
// no se pisa nada: se dice, y decide una persona.

import { actualizar, insertar, leerTabla, llamarFuncion } from './nube.js';
import { fundirSesion, guardarSesion, tokenFresco } from './sesion.js';
import { SCHEMA_VERSION } from './model.js';

// Antes de traerse la versión del servidor encima de la de este teléfono, lo de
// este teléfono se guarda aquí. Es la misma idea que `que-comemos-antes-de-migrar`:
// el día que la sincronización se equivoque, uno se entera tarde.
export const CLAVE_ANTES_DE_BAJAR = 'que-comemos-antes-de-sincronizar';

/* ── El hogar ──────────────────────────────────────────────────────────────

   Tres tablas, que son las tres del modelo mínimo:

     perfiles  — el usuario: su nombre. El correo y la contraseña los guarda
                 Supabase en su propio sitio; aquí no se copian.
     hogares   — la casa: su nombre, el documento con todo dentro y la revisión.
     miembros  — quién pertenece a qué casa, y con qué papel.

   La tercera parece de más mientras cada casa tenga un solo miembro, y es justo
   la que permite que mañana haya invitaciones sin migrar nada: se añade una fila
   y ya hay dos personas en la misma casa. */

export async function asegurarHogar(sesion, storage = globalThis.localStorage) {
  const fresco = await tokenFresco(sesion, storage);
  if (!fresco.ok) return { ok: false, sinRed: Boolean(fresco.sinRed), caducada: Boolean(fresco.caducada), error: fresco.error };
  const token = fresco.token;
  let actual = fresco.sesion;

  // ¿Ya pertenece a alguna?
  const miembros = await leerTabla('miembros', `usuario_id=eq.${actual.usuario.id}&select=hogar_id,papel&limit=1`, token);
  if (!miembros.ok) return { ok: false, sinRed: Boolean(miembros.red), error: miembros.error };

  const encontrado = (miembros.datos || [])[0];
  if (encontrado?.hogar_id) {
    const guardada = guardarSesion(fundirSesion(actual, { hogarId: String(encontrado.hogar_id) }), storage);
    return { ok: true, hogarId: String(encontrado.hogar_id), sesion: guardada, nuevo: false };
  }

  // No pertenece a ninguna: se le crea la suya. El perfil primero, porque la
  // casa apunta a él.
  const perfil = await insertar('perfiles', {
    id: actual.usuario.id,
    nombre: actual.usuario.nombre || actual.usuario.correo.split('@')[0]
  }, token);
  // Que el perfil ya existiera no es un problema: significa que esto se quedó a
  // medias la vez anterior y ahora se termina.
  if (!perfil.ok && perfil.codigo !== 'http_409') {
    return { ok: false, sinRed: Boolean(perfil.red), error: perfil.error };
  }

  const hogar = await insertar('hogares', {
    nombre: 'Mi casa',
    creado_por: actual.usuario.id,
    estado: null,
    revision: 0
  }, token);
  if (!hogar.ok) return { ok: false, sinRed: Boolean(hogar.red), error: hogar.error };

  const miembro = await insertar('miembros', {
    hogar_id: hogar.datos.id,
    usuario_id: actual.usuario.id,
    papel: 'dueño'
  }, token);
  if (!miembro.ok) return { ok: false, sinRed: Boolean(miembro.red), error: miembro.error };

  const guardada = guardarSesion(fundirSesion(actual, { hogarId: String(hogar.datos.id), revision: 0 }), storage);
  return { ok: true, hogarId: String(hogar.datos.id), sesion: guardada, nuevo: true };
}

/* ── Bajar ─────────────────────────────────────────────────────────────── */

export async function bajar(sesion, storage = globalThis.localStorage) {
  const fresco = await tokenFresco(sesion, storage);
  if (!fresco.ok) return { ok: false, sinRed: Boolean(fresco.sinRed), caducada: Boolean(fresco.caducada), error: fresco.error };
  if (!fresco.sesion.hogarId) return { ok: false, error: 'Todavía no hay una casa creada en tu cuenta.' };

  const leido = await leerTabla('hogares', `id=eq.${fresco.sesion.hogarId}&select=estado,revision,actualizado_en&limit=1`, fresco.token);
  if (!leido.ok) return { ok: false, sinRed: Boolean(leido.red), error: leido.error };

  const fila = (leido.datos || [])[0];
  if (!fila) return { ok: false, error: 'Esa casa ya no existe en el servidor.' };
  return {
    ok: true,
    estado: fila.estado || null,
    revision: Number(fila.revision) || 0,
    cuando: fila.actualizado_en || null,
    sesion: fresco.sesion
  };
}

/* ── Subir ─────────────────────────────────────────────────────────────────

   El guardado condicionado. `revision=eq.N` es lo que convierte esto en seguro:
   o la fila sigue donde la dejamos y se actualiza, o no se toca nada. */

export async function subir(sesion, estado, storage = globalThis.localStorage) {
  const fresco = await tokenFresco(sesion, storage);
  if (!fresco.ok) return { ok: false, sinRed: Boolean(fresco.sinRed), caducada: Boolean(fresco.caducada), error: fresco.error };
  const actual = fresco.sesion;
  if (!actual.hogarId) return { ok: false, error: 'Todavía no hay una casa creada en tu cuenta.' };

  const esperada = Number(actual.revision) || 0;
  const salida = await actualizar(
    'hogares',
    `id=eq.${actual.hogarId}&revision=eq.${esperada}`,
    { estado, revision: esperada + 1, actualizado_en: new Date().toISOString() },
    fresco.token
  );
  if (!salida.ok) return { ok: false, sinRed: Boolean(salida.red), error: salida.error };

  if (!salida.filas.length) {
    // Ni una fila cambiada: la revisión del servidor ya no es la que vimos.
    // Alguien guardó antes —el mismo usuario desde otro teléfono— y aquí no se
    // pisa nada sin preguntar.
    return { ok: false, conflicto: true, error: 'Hay una versión más nueva en tu cuenta, guardada desde otro teléfono. Antes de subir lo de aquí hay que decidir con cuál te quedas.' };
  }

  const revision = Number(salida.filas[0].revision) || esperada + 1;
  const guardada = guardarSesion(fundirSesion(actual, { revision }), storage);
  return { ok: true, revision, sesion: guardada };
}

/* ── La reconciliación ─────────────────────────────────────────────────────

   Lo que se llama al arrancar, al volver la conexión y después de guardar.
   Cuatro desenlaces y ninguno pierde nada:

     'al-dia'      — los dos lados van iguales.
     'subido'      — lo de este teléfono era más nuevo y ya está arriba.
     'bajado'      — el servidor tenía algo que aquí no estaba.
     'conflicto'   — los dos cambiaron. Decide una persona. */

export async function sincronizar(sesion, estadoLocal, { hayCambiosLocales = false, storage = globalThis.localStorage } = {}) {
  if (!sesion?.sincronizando) return { ok: true, resultado: 'apagada' };

  const casa = await asegurarHogar(sesion, storage);
  if (!casa.ok) return { ok: false, ...casa };

  const remoto = await bajar(casa.sesion, storage);
  if (!remoto.ok) return { ok: false, ...remoto };

  const conocida = Number(casa.sesion.revision) || 0;
  const servidorAvanzo = remoto.revision > conocida;
  const vacioArriba = !remoto.estado;

  // Arriba no hay nada todavía: este teléfono estrena la casa.
  if (vacioArriba) {
    const subida = await subir(casa.sesion, estadoLocal, storage);
    return subida.ok
      ? { ok: true, resultado: 'subido', revision: subida.revision, sesion: subida.sesion }
      : { ok: false, ...subida };
  }

  if (servidorAvanzo && hayCambiosLocales) {
    return {
      ok: true,
      resultado: 'conflicto',
      revisionServidor: remoto.revision,
      estadoServidor: remoto.estado,
      cuando: remoto.cuando,
      sesion: casa.sesion
    };
  }

  if (servidorAvanzo) {
    return { ok: true, resultado: 'bajado', estado: remoto.estado, revision: remoto.revision, sesion: casa.sesion };
  }

  if (hayCambiosLocales) {
    const subida = await subir(casa.sesion, estadoLocal, storage);
    if (subida.ok) return { ok: true, resultado: 'subido', revision: subida.revision, sesion: subida.sesion };
    // La carrera de última hora: entre que se leyó y se escribió, alguien subió.
    if (subida.conflicto) return { ok: true, resultado: 'conflicto', sesion: casa.sesion, estadoServidor: remoto.estado, revisionServidor: remoto.revision };
    return { ok: false, ...subida };
  }

  return { ok: true, resultado: 'al-dia', revision: remoto.revision, sesion: casa.sesion };
}

/* ── Resolver un conflicto ─────────────────────────────────────────────────

   Las dos salidas guardan antes una copia de lo que se va a tapar. Es barato y
   es lo único que convierte «me equivoqué de botón» en algo reversible. */

export async function quedarseConLoDeAqui(sesion, estadoLocal, revisionServidor, storage = globalThis.localStorage) {
  const conRevision = fundirSesion(sesion, { revision: Number(revisionServidor) || 0 });
  guardarSesion(conRevision, storage);
  return subir(conRevision, estadoLocal, storage);
}

export function guardarCopiaAntesDeBajar(estadoLocal, storage = globalThis.localStorage) {
  try {
    storage?.setItem(CLAVE_ANTES_DE_BAJAR, JSON.stringify({
      cuando: new Date().toISOString(),
      estado: estadoLocal
    }));
    return true;
  } catch {
    // Sin sitio para la copia no se baja a ciegas: quien llama lo mira.
    return false;
  }
}

/* ── Vincular lo que ya había en el teléfono ───────────────────────────────

   «Después de crear una cuenta, ofrece vincular y sincronizar los datos
   existentes. Evita duplicaciones durante esa importación.»

   Como se sube el documento entero, no hay filas que se puedan duplicar: o se
   copia una vez, o no se copia. Las duplicaciones posibles son de otro tipo y
   son dos, y las dos se cierran aquí:

     · Ofrecerlo dos veces y copiarlo dos veces. Se marca en la sesión con
       `vinculadoDe` en cuanto se hace, y no se vuelve a preguntar.
     · Tapar con lo del teléfono una casa que YA tenía datos en el servidor
       —porque la cuenta se usó antes en otro aparato—. Eso no es duplicar, es
       borrar, y por eso `vincular` se niega a hacerlo: devuelve `ocupada` y
       quien llama pregunta. */

export function mereceLaPenaVincular(estadoLocal) {
  if (!estadoLocal || estadoLocal.demo) return false;
  // Lo que cuenta como «aquí hay trabajo hecho». Un estado recién creado tiene
  // todo esto vacío, y ofrecer subir la nada es ruido.
  const cuenta = (estadoLocal.products?.length || 0)
    + (estadoLocal.people?.length || 0)
    + (estadoLocal.recipes?.length || 0)
    + (estadoLocal.plans?.length || 0)
    + (estadoLocal.habitualBasket?.lines?.length || 0);
  return cuenta > 0;
}

export async function vincular(sesion, estadoLocal, { forzar = false, storage = globalThis.localStorage } = {}) {
  if (!estadoLocal) return { ok: false, error: 'No hay datos en este teléfono que vincular.' };
  if (Number(estadoLocal.version) !== SCHEMA_VERSION) {
    return { ok: false, error: 'Los datos de este teléfono son de una versión distinta. Abre la app una vez sin cuenta para que se actualicen y vuelve a intentarlo.' };
  }

  const casa = await asegurarHogar(sesion, storage);
  if (!casa.ok) return { ok: false, ...casa };

  const remoto = await bajar(casa.sesion, storage);
  if (!remoto.ok) return { ok: false, ...remoto };

  if (remoto.estado && !forzar) {
    return {
      ok: false,
      ocupada: true,
      estadoServidor: remoto.estado,
      revisionServidor: remoto.revision,
      cuando: remoto.cuando,
      error: 'Tu cuenta ya tiene una casa guardada, seguramente desde otro teléfono. Subir lo de aquí encima la reemplazaría.'
    };
  }

  const conRevision = fundirSesion(casa.sesion, { revision: remoto.revision });
  const subida = await subir(conRevision, estadoLocal, storage);
  if (!subida.ok) return { ok: false, ...subida };

  const marcada = guardarSesion(fundirSesion(subida.sesion, {
    sincronizando: true,
    vinculadoDe: 'este-telefono'
  }), storage);
  return { ok: true, sesion: marcada, revision: subida.revision };
}

/* ── Borrar la cuenta ──────────────────────────────────────────────────────

   Un cliente no puede borrar usuarios: para eso haría falta la clave de
   servicio, que no está en el APK ni debe estarlo. Así que lo hace una función
   guardada dentro de la base de datos que solo sabe hacer una cosa —borrar a
   quien la llama— y que por tanto no sirve de nada aunque alguien la invoque a
   mano con la clave pública.

   Lo de este teléfono lo borra quien llama, después, y no depende de que esto
   salga bien: alguien que pide borrar su cuenta sin cobertura tiene derecho a
   que al menos desaparezca de su teléfono. */

export async function borrarCuenta(sesion, storage = globalThis.localStorage) {
  const fresco = await tokenFresco(sesion, storage);
  if (!fresco.ok) return { ok: false, sinRed: Boolean(fresco.sinRed), caducada: Boolean(fresco.caducada), error: fresco.error };

  const salida = await llamarFuncion('borrar_mi_cuenta', {}, fresco.token);
  if (!salida.ok) return { ok: false, sinRed: Boolean(salida.red), error: salida.error };
  return { ok: true };
}
