import test from 'node:test';
import assert from 'node:assert/strict';

// Las cuentas, probadas contra un Supabase de mentira.
//
// ── Qué prueba esto y qué no ──────────────────────────────────────────────
//
// No hay un Supabase de verdad aquí, así que lo que se comprueba es el lado del
// cliente: que las peticiones salen con la forma que manda la especificación de
// GoTrue, que cada código de error se convierte en una frase en español, que una
// sesión sobrevive a un teléfono sin cobertura, y que la sincronización no pisa
// trabajo de nadie.
//
// Lo que NO se prueba aquí es la separación entre cuentas del lado del servidor,
// porque no vive en este código: vive en `supabase/esquema.sql`. Eso tiene su
// propia prueba, `supabase/probar-esquema.mjs`, que levanta un Postgres de
// verdad y comprueba que Pedro no puede ver la casa de María.
//
// El servidor falso de abajo sigue la especificación que hay en
// https://github.com/supabase/auth/blob/master/openapi.yaml, no la memoria de
// nadie: los nombres de los campos, los códigos de error y la forma de las
// respuestas salen de ahí.

import { NUBE } from '../src/config-nube.js';
import {
  cambiarContrasena, canjearCodigo, direccionDeGoogle, entrar, quienSoy,
  recuperarContrasena, registrar, renovar, salir
} from '../src/nube.js';
import {
  CLAVE_SESION, arrancarSesion, cajonDe, cerrarSesion, fundirSesion, guardarSesion,
  leerSesion, revisarConfirmacion, revisarContrasena, revisarCorreo, revisarNombre,
  revisarRegistro, tokenFresco
} from '../src/sesion.js';
import { asegurarHogar, mereceLaPenaVincular, sincronizar, subir, vincular } from '../src/sincronizar.js';
import { CUENTA_ACTIONS, CUENTA_FORMS, emptyCuenta, renderCuenta } from '../src/page-cuenta.js';
import { createEmptyState, addProduct } from '../src/model.js';
import { STORAGE_KEY } from '../src/storage.js';

/* ── El Supabase de mentira ────────────────────────────────────────────── */

const FETCH_ORIGINAL = globalThis.fetch;
const STORAGE_ORIGINAL = globalThis.localStorage;
const URL_PRUEBA = 'https://proyecto-de-prueba.supabase.co';
const CLAVE_PRUEBA = 'eyJhbGciOiJIUzI1NiJ9.clave-anonima-de-prueba.firma';

function montarNube(opciones = {}) {
  NUBE.url = opciones.url === undefined ? URL_PRUEBA : opciones.url;
  NUBE.clave = opciones.clave === undefined ? CLAVE_PRUEBA : opciones.clave;

  const estado = {
    peticiones: [],
    usuarios: new Map(),      // correo → { id, correo, contrasena, nombre, confirmado }
    hogares: new Map(),       // id → { id, estado, revision, creado_por }
    miembros: [],             // { hogar_id, usuario_id, papel }
    confirmacionObligatoria: Boolean(opciones.confirmacionObligatoria),
    siguienteId: 1
  };

  globalThis.fetch = async (url, init = {}) => {
    const ruta = String(url).replace(NUBE.url, '');
    const cuerpo = init.body ? JSON.parse(init.body) : null;
    estado.peticiones.push({ ruta, metodo: init.method || 'GET', cuerpo, cabeceras: init.headers || {} });

    if (opciones.alLlamar) {
      const forzada = await opciones.alLlamar({ ruta, metodo: init.method || 'GET', cuerpo, signal: init.signal });
      if (forzada) return forzada;
    }
    // La clave es obligatoria en todas las llamadas, igual que en el de verdad.
    if (!init.headers?.apikey) return respuesta(401, { error_code: 'no_authorization', msg: 'No API key found in request' });

    return atender(estado, ruta, init.method || 'GET', cuerpo, init.headers);
  };
  return estado;
}

const respuesta = (estado, cuerpo) => new Response(JSON.stringify(cuerpo), {
  status: estado,
  headers: { 'Content-Type': 'application/json' }
});

function sesionDe(usuario) {
  return {
    access_token: `token-de-${usuario.id}`,
    refresh_token: `refresco-de-${usuario.id}`,
    expires_in: 3600,
    token_type: 'bearer',
    user: usuarioDe(usuario)
  };
}
const usuarioDe = usuario => ({
  id: usuario.id,
  email: usuario.correo,
  email_confirmed_at: usuario.confirmado ? '2026-01-01T00:00:00Z' : null,
  user_metadata: { nombre: usuario.nombre }
});
const quienEs = (estado, cabeceras) => {
  const token = String(cabeceras?.Authorization || '').replace('Bearer ', '');
  for (const usuario of estado.usuarios.values()) if (`token-de-${usuario.id}` === token) return usuario;
  return null;
};

function atender(estado, ruta, metodo, cuerpo, cabeceras) {
  /* ── GoTrue ── */
  if (ruta === '/auth/v1/signup' && metodo === 'POST') {
    if (estado.usuarios.has(cuerpo.email)) return respuesta(422, { error_code: 'user_already_exists', msg: 'User already registered' });
    if (String(cuerpo.password || '').length < 6) return respuesta(422, { error_code: 'weak_password', msg: 'Password should be at least 6 characters' });
    const usuario = {
      id: `usuario-${estado.siguienteId++}`,
      correo: cuerpo.email,
      contrasena: cuerpo.password,
      nombre: cuerpo.data?.nombre || '',
      confirmado: !estado.confirmacionObligatoria
    };
    estado.usuarios.set(cuerpo.email, usuario);
    // Con confirmación obligatoria devuelve el usuario SIN sesión, que es el
    // caso que más confunde y el que hay que distinguir bien.
    return respuesta(200, estado.confirmacionObligatoria ? usuarioDe(usuario) : sesionDe(usuario));
  }

  if (ruta.startsWith('/auth/v1/token') && metodo === 'POST') {
    if (ruta.includes('grant_type=password')) {
      const usuario = estado.usuarios.get(cuerpo.email);
      if (!usuario || usuario.contrasena !== cuerpo.password) return respuesta(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      if (!usuario.confirmado) return respuesta(400, { error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
      return respuesta(200, sesionDe(usuario));
    }
    if (ruta.includes('grant_type=refresh_token')) {
      for (const usuario of estado.usuarios.values()) {
        if (`refresco-de-${usuario.id}` === cuerpo.refresh_token) return respuesta(200, sesionDe(usuario));
      }
      return respuesta(400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
    }
    if (ruta.includes('grant_type=pkce')) {
      const usuario = estado.usuarios.get(cuerpo.auth_code);
      if (!usuario || cuerpo.code_verifier !== 'secreto-bueno') return respuesta(400, { error_code: 'validation_failed', msg: 'invalid code verifier' });
      return respuesta(200, sesionDe(usuario));
    }
  }

  if (ruta.startsWith('/auth/v1/recover') && metodo === 'POST') return respuesta(200, {});
  if (ruta === '/auth/v1/logout' && metodo === 'POST') return respuesta(204, {});
  if (ruta === '/auth/v1/resend' && metodo === 'POST') return respuesta(200, {});

  if (ruta === '/auth/v1/user') {
    const usuario = quienEs(estado, cabeceras);
    if (!usuario) return respuesta(401, { error_code: 'bad_jwt', msg: 'invalid JWT' });
    if (metodo === 'PUT') { usuario.contrasena = cuerpo.password || usuario.contrasena; return respuesta(200, usuarioDe(usuario)); }
    return respuesta(200, usuarioDe(usuario));
  }

  /* ── PostgREST ── */
  const usuario = quienEs(estado, cabeceras);
  if (ruta.startsWith('/rest/v1/')) {
    if (!usuario) return respuesta(401, { message: 'JWT expired' });

    if (ruta.startsWith('/rest/v1/miembros')) {
      if (metodo === 'POST') { estado.miembros.push(cuerpo); return respuesta(201, [cuerpo]); }
      // Las políticas del servidor de verdad filtran por usuario; el falso hace
      // lo mismo para que el cliente vea la misma forma de respuesta.
      return respuesta(200, estado.miembros.filter(fila => fila.usuario_id === usuario.id));
    }
    if (ruta.startsWith('/rest/v1/perfiles')) {
      if (metodo === 'POST') return respuesta(201, [cuerpo]);
      return respuesta(200, []);
    }
    if (ruta.startsWith('/rest/v1/hogares')) {
      if (metodo === 'POST') {
        const hogar = { id: `hogar-${estado.siguienteId++}`, ...cuerpo, revision: 0 };
        estado.hogares.set(hogar.id, hogar);
        return respuesta(201, [hogar]);
      }
      const id = ruta.match(/id=eq\.([^&]+)/)?.[1];
      const hogar = estado.hogares.get(id);
      if (metodo === 'PATCH') {
        const esperada = Number(ruta.match(/revision=eq\.(\d+)/)?.[1]);
        // Aquí está el guardado condicionado: si la revisión no encaja, se
        // contesta 200 con CERO filas, igual que PostgREST.
        if (!hogar || (Number.isFinite(esperada) && hogar.revision !== esperada)) return respuesta(200, []);
        Object.assign(hogar, cuerpo);
        return respuesta(200, [hogar]);
      }
      return respuesta(200, hogar ? [hogar] : []);
    }
    if (ruta.startsWith('/rest/v1/rpc/borrar_mi_cuenta')) {
      estado.usuarios.delete(usuario.correo);
      return respuesta(204, {});
    }
  }
  return respuesta(404, { message: 'no existe' });
}

function montarAlmacen() {
  const datos = new Map();
  globalThis.localStorage = {
    get length() { return datos.size; },
    key: i => [...datos.keys()][i] ?? null,
    getItem: clave => (datos.has(clave) ? datos.get(clave) : null),
    setItem: (clave, valor) => datos.set(clave, String(valor)),
    removeItem: clave => datos.delete(clave)
  };
  return datos;
}

function restaurar() {
  globalThis.fetch = FETCH_ORIGINAL;
  if (STORAGE_ORIGINAL === undefined) delete globalThis.localStorage; else globalThis.localStorage = STORAGE_ORIGINAL;
  NUBE.url = '';
  NUBE.clave = '';
}

/* ── Validaciones ──────────────────────────────────────────────────────── */

test('las validaciones hablan en español y dicen qué arreglar', () => {
  assert.match(revisarNombre(''), /Escribe tu nombre/);
  assert.match(revisarNombre('a'), /muy corto/);
  assert.equal(revisarNombre('José Manuel'), '');

  assert.match(revisarCorreo(''), /Escribe tu correo/);
  assert.match(revisarCorreo('josemanuel'), /nombre@ejemplo\.com/);
  assert.match(revisarCorreo('jose@manuel'), /nombre@ejemplo\.com/);
  assert.equal(revisarCorreo('jose@ejemplo.com'), '');

  assert.match(revisarContrasena('corta'), /al menos 8/);
  assert.match(revisarContrasena('aaaaaaaa'), /mismo carácter repetido/);
  assert.equal(revisarContrasena('arroz con habichuelas'), '');

  assert.match(revisarConfirmacion('unaclave1', 'otraclave1'), /no son iguales/);
  assert.equal(revisarConfirmacion('unaclave1', 'unaclave1'), '');

  const { errores, vale } = revisarRegistro({ nombre: '', correo: 'mal', contrasena: '123', confirmacion: '456' });
  assert.equal(vale, false);
  assert.equal(Object.values(errores).filter(Boolean).length, 4, 'los cuatro campos tenían que protestar a la vez');
});

/* ── Registro y entrada ────────────────────────────────────────────────── */

test('registrarse sin confirmación obligatoria entra directo', async t => {
  const nube = montarNube();
  montarAlmacen();
  t.after(restaurar);

  const salida = await registrar({ correo: 'maria@ejemplo.com', contrasena: 'arroz con habichuelas', nombre: 'María' });
  assert.equal(salida.ok, true);
  assert.equal(salida.haceFaltaConfirmar, false);
  assert.equal(salida.sesion.usuario.correo, 'maria@ejemplo.com');
  assert.equal(salida.sesion.usuario.nombre, 'María', 'el nombre tiene que viajar en `data`');
  assert.ok(salida.sesion.token, 'sin token no hay sesión');
  assert.ok(salida.sesion.caducaEn > Math.floor(Date.now() / 1000), 'la caducidad se guarda como momento absoluto');

  const peticion = nube.peticiones.find(p => p.ruta === '/auth/v1/signup');
  assert.equal(peticion.cuerpo.data.nombre, 'María');
  assert.equal(peticion.cabeceras.apikey, CLAVE_PRUEBA);
});

test('registrarse con confirmación obligatoria NO es un error: es ir a mirar el correo', async t => {
  montarNube({ confirmacionObligatoria: true });
  montarAlmacen();
  t.after(restaurar);

  const salida = await registrar({ correo: 'pedro@ejemplo.com', contrasena: 'arroz con habichuelas', nombre: 'Pedro' });
  assert.equal(salida.ok, true, 'esto NO es un fallo');
  assert.equal(salida.haceFaltaConfirmar, true);
  assert.equal(salida.sesion, null);
});

test('cada error del servidor se convierte en una frase que se puede enseñar', async t => {
  const nube = montarNube();
  montarAlmacen();
  t.after(restaurar);
  nube.usuarios.set('maria@ejemplo.com', { id: 'u1', correo: 'maria@ejemplo.com', contrasena: 'arroz con habichuelas', nombre: 'María', confirmado: true });

  const repetido = await registrar({ correo: 'maria@ejemplo.com', contrasena: 'otra cosa larga', nombre: 'Otra' });
  assert.equal(repetido.ok, false);
  assert.match(repetido.error, /Ya hay una cuenta con ese correo/);
  assert.ok(!/error|invalid|exists/i.test(repetido.error), `se coló jerga en inglés: ${repetido.error}`);

  const floja = await registrar({ correo: 'nueva@ejemplo.com', contrasena: '123', nombre: 'X' });
  assert.match(floja.error, /demasiado fácil de adivinar/);

  const mala = await entrar({ correo: 'maria@ejemplo.com', contrasena: 'no es' });
  assert.equal(mala.ok, false);
  assert.equal(mala.codigo, 'invalid_credentials');
  assert.match(mala.error, /correo o la contraseña no coinciden/);
});

test('sin confirmar el correo, entrar lleva a la pantalla que lo explica', async t => {
  const nube = montarNube({ confirmacionObligatoria: true });
  montarAlmacen();
  t.after(restaurar);
  await registrar({ correo: 'pedro@ejemplo.com', contrasena: 'arroz con habichuelas', nombre: 'Pedro' });

  const salida = await entrar({ correo: 'pedro@ejemplo.com', contrasena: 'arroz con habichuelas' });
  assert.equal(salida.ok, false);
  assert.equal(salida.codigo, 'email_not_confirmed');
  assert.match(salida.error, /correo no deseado/, 'hay que decir dónde suele caer ese mensaje');
  assert.ok(nube.usuarios.has('pedro@ejemplo.com'));
});

test('recuperar la contraseña no revela si esa cuenta existe', async t => {
  const nube = montarNube();
  montarAlmacen();
  t.after(restaurar);

  const conCuenta = await recuperarContrasena('maria@ejemplo.com', 'quecomemos://cuenta');
  const sinCuenta = await recuperarContrasena('nadie@ejemplo.com', 'quecomemos://cuenta');
  assert.equal(conCuenta.ok, true);
  assert.equal(sinCuenta.ok, true, 'contestar distinto delataría qué correos están registrados');

  const peticion = nube.peticiones.find(p => p.ruta.startsWith('/auth/v1/recover'));
  assert.match(peticion.ruta, /redirect_to=quecomemos%3A%2F%2Fcuenta/, 'el enlace de vuelta tiene que viajar');
});

/* ── Sin red ───────────────────────────────────────────────────────────── */

test('sin internet se dice que no hay internet, no que la contraseña esté mal', async t => {
  montarNube({ alLlamar: async () => { throw new TypeError('Failed to fetch'); } });
  montarAlmacen();
  t.after(restaurar);

  const salida = await entrar({ correo: 'maria@ejemplo.com', contrasena: 'arroz con habichuelas' });
  assert.equal(salida.ok, false);
  assert.equal(salida.red, true, 'marcarlo como fallo de red es lo que permite reintentar solo');
  assert.match(salida.error, /No hay conexión/);
  assert.match(salida.error, /siguen aquí en el teléfono/, 'hay que tranquilizar sobre los datos');
});

test('un servidor que no contesta se deja de esperar en vez de colgar la app', async t => {
  montarNube({
    alLlamar: ({ signal }) => new Promise((resolver, rechazar) => {
      // No contesta nunca; solo reacciona cuando el cliente se cansa.
      signal?.addEventListener('abort', () => rechazar(Object.assign(new Error('abortado'), { name: 'AbortError' })));
    })
  });
  montarAlmacen();
  t.after(restaurar);
  t.mock.timers.enable({ apis: ['setTimeout'] });

  const promesa = entrar({ correo: 'maria@ejemplo.com', contrasena: 'arroz con habichuelas' });
  for (let i = 0; i < 6; i += 1) { await new Promise(seguir => setImmediate(seguir)); }
  t.mock.timers.tick(15001);
  for (let i = 0; i < 6; i += 1) { await new Promise(seguir => setImmediate(seguir)); }

  const salida = await promesa;
  assert.equal(salida.ok, false);
  assert.equal(salida.red, true);
  assert.match(salida.error, /tardó demasiado/);
});

test('sin configurar, la app lo dice y no intenta llamar a nadie', async t => {
  const nube = montarNube({ url: '', clave: '' });
  montarAlmacen();
  t.after(restaurar);

  const salida = await entrar({ correo: 'maria@ejemplo.com', contrasena: 'arroz con habichuelas' });
  assert.equal(salida.ok, false);
  assert.equal(salida.codigo, 'sin_configurar');
  assert.match(salida.error, /docs\/supabase\.md/, 'hay que decir dónde están los pasos');
  assert.equal(nube.peticiones.length, 0, 'no puede salir ni una petición sin configuración');
});

/* ── La sesión aguanta ─────────────────────────────────────────────────── */

test('la sesión sobrevive a cerrar y abrir la app', async t => {
  const nube = montarNube();
  const datos = montarAlmacen();
  t.after(restaurar);
  nube.usuarios.set('maria@ejemplo.com', { id: 'u1', correo: 'maria@ejemplo.com', contrasena: 'arroz con habichuelas', nombre: 'María', confirmado: true });

  const entrada = await entrar({ correo: 'maria@ejemplo.com', contrasena: 'arroz con habichuelas' });
  guardarSesion(entrada.sesion);
  assert.ok(datos.get(CLAVE_SESION), 'la sesión tiene que quedar escrita');

  // Y aquí se cierra la app y se vuelve a abrir.
  const arranque = await arrancarSesion();
  assert.equal(arranque.estado, 'dentro');
  assert.equal(arranque.sesion.usuario.correo, 'maria@ejemplo.com');
});

test('un token caducado se renueva solo, sin que nadie se entere', async t => {
  const nube = montarNube();
  montarAlmacen();
  t.after(restaurar);
  nube.usuarios.set('maria@ejemplo.com', { id: 'u1', correo: 'maria@ejemplo.com', contrasena: 'x'.repeat(10), nombre: 'María', confirmado: true });
  const entrada = await entrar({ correo: 'maria@ejemplo.com', contrasena: 'x'.repeat(10) });

  // Se envejece a mano, como si el teléfono hubiera estado apagado dos días.
  const vieja = { ...entrada.sesion, caducaEn: Math.floor(Date.now() / 1000) - 10, hogarId: 'hogar-7', revision: 4 };
  guardarSesion(vieja);

  const fresco = await tokenFresco(vieja);
  assert.equal(fresco.ok, true);
  assert.ok(fresco.sesion.caducaEn > Math.floor(Date.now() / 1000), 'el token nuevo tiene que durar');
  assert.equal(fresco.sesion.hogarId, 'hogar-7', 'renovar no puede borrar a qué casa pertenece este teléfono');
  assert.equal(fresco.sesion.revision, 4, 'ni por dónde iba la sincronización');
});

// Esta es la que sostiene «la app no queda inutilizable si pierde internet».
test('sin internet, una sesión válida sigue valiendo y la app sigue abierta', async t => {
  montarNube();
  montarAlmacen();
  t.after(restaurar);

  const vieja = {
    token: 'token-viejo', refresco: 'refresco-bueno',
    caducaEn: Math.floor(Date.now() / 1000) - 10,
    usuario: { id: 'u1', correo: 'maria@ejemplo.com', nombre: 'María', confirmado: true }
  };
  guardarSesion(vieja);
  // Y ahora se va la cobertura.
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };

  const arranque = await arrancarSesion();
  assert.equal(arranque.estado, 'dentro-sin-red', 'no haber red NO puede echar a nadie de su cuenta');
  assert.equal(arranque.sesion.usuario.correo, 'maria@ejemplo.com');
  assert.ok(leerSesion(), 'y la sesión guardada no se puede tirar');
});

test('un refresco rechazado de verdad sí cierra la sesión, pero no borra los datos', async t => {
  montarNube();
  const datos = montarAlmacen();
  t.after(restaurar);
  datos.set(cajonDe('u1'), JSON.stringify(createEmptyState()));
  guardarSesion({
    token: 'token-viejo', refresco: 'refresco-que-ya-no-vale',
    caducaEn: Math.floor(Date.now() / 1000) - 10,
    usuario: { id: 'u1', correo: 'maria@ejemplo.com', nombre: 'María', confirmado: true }
  });

  const arranque = await arrancarSesion();
  assert.equal(arranque.estado, 'fuera');
  assert.equal(leerSesion(), null);
  assert.match(arranque.aviso, /tus datos siguen aquí/i);
  assert.ok(datos.get(cajonDe('u1')), 'los datos de la casa NO se tocan al caducar la sesión');
});

test('cerrar sesión deja fuera aunque el servidor no conteste', async t => {
  montarNube({ alLlamar: async () => { throw new TypeError('Failed to fetch'); } });
  montarAlmacen();
  t.after(restaurar);
  guardarSesion({ token: 't', refresco: 'r', caducaEn: 9999999999, usuario: { id: 'u1', correo: 'm@e.com', nombre: 'M', confirmado: true } });

  await cerrarSesion(leerSesion());
  assert.equal(leerSesion(), null, 'quien toca «cerrar sesión» en un sótano tiene que quedar fuera igual');
});

/* ── Un cajón por cuenta ───────────────────────────────────────────────── */

test('cada cuenta guarda en su propio cajón, y el del teléfono no se toca', () => {
  assert.equal(cajonDe(''), STORAGE_KEY, 'sin cuenta se usa el de siempre');
  assert.equal(cajonDe('u1'), `${STORAGE_KEY}::u1`);
  assert.notEqual(cajonDe('u1'), cajonDe('u2'), 'dos cuentas no pueden compartir cajón');
  assert.ok(cajonDe('u1').startsWith(STORAGE_KEY), 'el prefijo es lo que permite borrarlos todos después');
});

/* ── El hogar y la sincronización ──────────────────────────────────────── */

async function dentro(nube, correo = 'maria@ejemplo.com') {
  nube.usuarios.set(correo, { id: `u-${correo}`, correo, contrasena: 'x'.repeat(10), nombre: 'María', confirmado: true });
  const entrada = await entrar({ correo, contrasena: 'x'.repeat(10) });
  return guardarSesion(entrada.sesion);
}

test('la primera vez se crean el perfil, la casa y la fila de miembro', async t => {
  const nube = montarNube();
  montarAlmacen();
  t.after(restaurar);
  const sesion = await dentro(nube);

  const casa = await asegurarHogar(sesion);
  assert.equal(casa.ok, true);
  assert.equal(casa.nuevo, true);
  assert.ok(casa.hogarId);
  assert.equal(nube.miembros.length, 1, 'la relación usuario-hogar es el modelo mínimo que se pidió');
  assert.equal(nube.miembros[0].papel, 'dueño');
  assert.equal(leerSesion().hogarId, casa.hogarId, 'la casa tiene que quedar apuntada en la sesión');

  // Y la segunda vez no crea otra.
  const otraVez = await asegurarHogar(leerSesion());
  assert.equal(otraVez.nuevo, false);
  assert.equal(otraVez.hogarId, casa.hogarId);
  assert.equal(nube.hogares.size, 1, 'no puede crear una casa nueva en cada arranque');
});

test('subir y bajar mantiene la casa al día', async t => {
  const nube = montarNube();
  montarAlmacen();
  t.after(restaurar);
  let sesion = await dentro(nube);
  sesion = guardarSesion(fundirSesion(sesion, { sincronizando: true }));

  const estado = createEmptyState();
  addProduct(estado, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' });

  const primera = await sincronizar(leerSesion(), estado, { hayCambiosLocales: true });
  assert.equal(primera.ok, true);
  assert.equal(primera.resultado, 'subido');

  const alDia = await sincronizar(leerSesion(), estado, { hayCambiosLocales: false });
  assert.equal(alDia.resultado, 'al-dia');

  // Otro teléfono guarda algo.
  const hogar = [...nube.hogares.values()][0];
  hogar.estado = { ...estado, marca: 'desde otro teléfono' };
  hogar.revision += 1;

  const bajada = await sincronizar(leerSesion(), estado, { hayCambiosLocales: false });
  assert.equal(bajada.resultado, 'bajado');
  assert.equal(bajada.estado.marca, 'desde otro teléfono');
});

// La prueba que impide perder trabajo.
test('si los dos lados cambiaron, no se pisa nada: se avisa', async t => {
  const nube = montarNube();
  montarAlmacen();
  t.after(restaurar);
  let sesion = await dentro(nube);
  sesion = guardarSesion(fundirSesion(sesion, { sincronizando: true }));

  const estado = createEmptyState();
  await sincronizar(leerSesion(), estado, { hayCambiosLocales: true });

  // Otro teléfono sube algo…
  const hogar = [...nube.hogares.values()][0];
  hogar.estado = { marca: 'lo de allá' };
  hogar.revision += 1;

  // …y aquí también se había cambiado algo.
  const choque = await sincronizar(leerSesion(), estado, { hayCambiosLocales: true });
  assert.equal(choque.ok, true);
  assert.equal(choque.resultado, 'conflicto');
  assert.equal(choque.estadoServidor.marca, 'lo de allá', 'hay que traer la otra versión para poder elegir');
  assert.equal(hogar.estado.marca, 'lo de allá', 'lo del servidor NO se puede haber pisado');
});

test('el guardado condicionado impide sobrescribir a ciegas', async t => {
  const nube = montarNube();
  montarAlmacen();
  t.after(restaurar);
  const sesion = await dentro(nube);
  const casa = await asegurarHogar(sesion);

  const primera = await subir(leerSesion(), { v: 1 });
  assert.equal(primera.ok, true);
  assert.equal(primera.revision, 1);

  // Alguien mueve la revisión por detrás.
  nube.hogares.get(casa.hogarId).revision = 9;

  const segunda = await subir(leerSesion(), { v: 2 });
  assert.equal(segunda.ok, false);
  assert.equal(segunda.conflicto, true);
  assert.equal(nube.hogares.get(casa.hogarId).estado.v, 1, 'el intento fallido no puede haber escrito nada');
});

test('sincronizar apagada no manda absolutamente nada', async t => {
  const nube = montarNube();
  montarAlmacen();
  t.after(restaurar);
  const sesion = await dentro(nube);
  const antes = nube.peticiones.length;

  const salida = await sincronizar(sesion, createEmptyState(), { hayCambiosLocales: true });
  assert.equal(salida.resultado, 'apagada');
  assert.equal(nube.peticiones.length, antes, 'con la sincronización apagada no puede salir ni una petición');
});

/* ── Vincular lo que ya había ──────────────────────────────────────────── */

test('solo se ofrece vincular cuando hay algo que vincular', () => {
  assert.equal(mereceLaPenaVincular(null), false);
  assert.equal(mereceLaPenaVincular(createEmptyState()), false, 'subir la nada es ruido');
  const conCosas = createEmptyState();
  addProduct(conCosas, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' });
  assert.equal(mereceLaPenaVincular(conCosas), true);
  assert.equal(mereceLaPenaVincular({ ...conCosas, demo: true }), false, 'el ejemplo no es de nadie');
});

test('vincular sube lo del teléfono una sola vez', async t => {
  const nube = montarNube();
  montarAlmacen();
  t.after(restaurar);
  const sesion = await dentro(nube);

  const local = createEmptyState();
  addProduct(local, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' });

  const salida = await vincular(sesion, local);
  assert.equal(salida.ok, true);
  assert.equal(salida.sesion.vinculadoDe, 'este-telefono', 'la marca es lo que impide ofrecerlo dos veces');
  assert.equal(salida.sesion.sincronizando, true);
  const hogar = [...nube.hogares.values()][0];
  assert.equal(hogar.estado.products.length, 1);
  assert.equal(nube.hogares.size, 1, 'vincular no puede crear una casa de más');
});

// «Evita duplicaciones durante esa importación»: lo peligroso no es duplicar
// filas —se sube un documento entero— sino tapar una casa que ya tenía datos.
test('vincular se niega a tapar una casa que ya tenía datos', async t => {
  const nube = montarNube();
  montarAlmacen();
  t.after(restaurar);
  const sesion = await dentro(nube);
  const casa = await asegurarHogar(sesion);
  nube.hogares.get(casa.hogarId).estado = { marca: 'lo que ya había en la cuenta' };
  nube.hogares.get(casa.hogarId).revision = 3;

  const local = createEmptyState();
  addProduct(local, { name: 'Arroz', controlUnit: 'lb', purchaseUnit: 'lb' });

  const salida = await vincular(leerSesion(), local);
  assert.equal(salida.ok, false);
  assert.equal(salida.ocupada, true);
  assert.equal(nube.hogares.get(casa.hogarId).estado.marca, 'lo que ya había en la cuenta', 'no puede haberla tocado');
});

/* ── Google ────────────────────────────────────────────────────────────── */

test('el viaje a Google lleva PKCE y vuelve por el enlace de la app', async t => {
  montarNube();
  montarAlmacen();
  t.after(restaurar);

  const { url, verificador } = await direccionDeGoogle('quecomemos://cuenta');
  assert.match(url, /^https:\/\/proyecto-de-prueba\.supabase\.co\/auth\/v1\/authorize\?/);
  const parametros = new URL(url).searchParams;
  assert.equal(parametros.get('provider'), 'google');
  assert.equal(parametros.get('redirect_to'), 'quecomemos://cuenta');
  assert.equal(parametros.get('code_challenge_method'), 's256');
  assert.ok(parametros.get('code_challenge'), 'sin el reto, cualquiera que intercepte el enlace entra');
  assert.notEqual(parametros.get('code_challenge'), verificador, 'lo que viaja es el resumen, no el secreto');
  assert.ok(verificador.length >= 40, 'el secreto tiene que ser largo');
  assert.ok(!/[+/=]/.test(parametros.get('code_challenge')), 'el reto va en base64url, sin caracteres que rompan una URL');
});

test('la vuelta de Google se canjea por una sesión, y con el secreto equivocado no', async t => {
  const nube = montarNube();
  montarAlmacen();
  t.after(restaurar);
  nube.usuarios.set('codigo-bueno', { id: 'u-google', correo: 'maria@gmail.com', contrasena: '', nombre: 'María G', confirmado: true });

  const malo = await canjearCodigo('codigo-bueno', 'secreto-equivocado');
  assert.equal(malo.ok, false);

  const bueno = await canjearCodigo('codigo-bueno', 'secreto-bueno');
  assert.equal(bueno.ok, true);
  assert.equal(bueno.sesion.usuario.correo, 'maria@gmail.com');
  assert.equal(bueno.sesion.usuario.nombre, 'María G');
});

/* ── Las pantallas ─────────────────────────────────────────────────────── */

function contextoCuenta(extra = {}) {
  const ctx = {
    ui: { cuenta: emptyCuenta(), sesion: null },
    pintados: 0,
    render() { ctx.pintados += 1; },
    confirmar: () => true,
    seguirSinCuenta: () => { ctx.siguio = true; },
    ponerSesion: s => { ctx.ui.sesion = s; },
    alEntrar: async s => { ctx.entro = s; },
    alSalirDeLaCuenta: () => { ctx.salio = true; },
    alBorrarLaCuenta: () => { ctx.borro = true; },
    sincronizarAhora: async () => ({ ok: true, resultado: 'al-dia' }),
    traerEstadoDeLaNube: () => true,
    datosDeLaCasa: () => createEmptyState(),
    datosDelTelefono: () => createEmptyState(),
    abrirEnNavegador: async url => { ctx.abrio = url; return true; },
    guardarVerificador: () => {},
    leerVerificador: () => '',
    ...extra
  };
  return ctx;
}

test('la portada ofrece las cinco cosas que se pidieron, y la salida sin cuenta', async t => {
  montarNube();
  montarAlmacen();
  t.after(restaurar);

  const html = renderCuenta(contextoCuenta());
  assert.match(html, /Continuar con Google/);
  assert.match(html, /Registrarme con correo/);
  assert.match(html, /Ya tengo una cuenta/);
  assert.match(html, /Recuperar mi contraseña/);
  assert.match(html, /¿Qué comemos\?/, 'falta el nombre de la app');
  assert.match(html, /<img class="brand-glyph"/, 'falta el logo');
  assert.match(html, /Seguir sin cuenta en este teléfono/, 'sin esta salida, un usuario de hoy se queda fuera de sus propios datos');
});

test('sin configurar, la portada lo dice en vez de ofrecer botones que no funcionan', async t => {
  montarNube({ url: '', clave: '' });
  montarAlmacen();
  t.after(restaurar);

  const html = renderCuenta(contextoCuenta());
  assert.ok(!html.includes('Continuar con Google'), 'no se puede ofrecer lo que no está configurado');
  assert.match(html, /todavía no están configuradas/);
  assert.match(html, /Seguir sin cuenta/, 'la salida tiene que seguir estando');
});

test('el registro enseña cada error pegado a su campo, sin salir a la red', async t => {
  const nube = montarNube();
  montarAlmacen();
  t.after(restaurar);
  const ctx = contextoCuenta();
  ctx.ui.cuenta.vista = 'registro';

  const datos = new Map([['nombre', ''], ['correo', 'esto-no-es-un-correo'], ['contrasena', '123'], ['confirmacion', '456']]);
  await CUENTA_FORMS['cuenta-registro']({}, datos, ctx);

  assert.equal(nube.peticiones.length, 0, 'lo que se puede comprobar aquí no se pregunta al servidor');
  const html = renderCuenta(ctx);
  assert.match(html, /Escribe tu nombre/);
  assert.match(html, /nombre@ejemplo\.com/);
  assert.match(html, /al menos 8/);
  assert.match(html, /no son iguales/);
  assert.match(html, /aria-invalid="true"/, 'los lectores de pantalla también tienen que enterarse');
});

test('mientras se espera al servidor, el botón lo dice y no se puede tocar dos veces', async t => {
  montarNube({ alLlamar: () => new Promise(() => {}) });
  montarAlmacen();
  t.after(restaurar);
  const ctx = contextoCuenta();
  ctx.ui.cuenta.vista = 'entrar';

  const datos = new Map([['correo', 'maria@ejemplo.com'], ['contrasena', 'arroz con habichuelas']]);
  CUENTA_FORMS['cuenta-entrar']({}, datos, ctx);
  await new Promise(seguir => setImmediate(seguir));

  const html = renderCuenta(ctx);
  assert.match(html, /aria-busy="true"/, 'sin esto se toca cinco veces y salen cinco intentos');
  assert.match(html, /disabled/);
  assert.match(html, /Un momento…/);
});

test('con sesión se ve la cuenta, el interruptor de sincronizar y el borrado', async t => {
  montarNube();
  montarAlmacen();
  t.after(restaurar);
  const ctx = contextoCuenta();
  ctx.ui.sesion = { usuario: { id: 'u1', correo: 'maria@ejemplo.com', nombre: 'María', confirmado: true }, sincronizando: false, revision: 0 };

  const html = renderCuenta(ctx);
  assert.match(html, /maria@ejemplo\.com/);
  assert.match(html, /Encender la sincronización/);
  assert.match(html, /Apagada/, 'hay que decir en qué estado está');
  assert.match(html, /no sale nada de aquí/, 'y qué significa que esté apagada');
  assert.match(html, /Cerrar sesión/);
  assert.match(html, /Borrar mi cuenta/);
});

test('cerrar sesión pregunta antes, y borrar la cuenta pregunta dos veces', async t => {
  montarNube();
  montarAlmacen();
  t.after(restaurar);

  let preguntas = 0;
  const ctx = contextoCuenta({ confirmar: () => { preguntas += 1; return false; } });
  ctx.ui.sesion = { token: 't', usuario: { id: 'u1', correo: 'm@e.com', nombre: 'M', confirmado: true } };

  await CUENTA_ACTIONS['cuenta-salir']({}, ctx);
  assert.equal(preguntas, 1);
  assert.equal(ctx.salio, undefined, 'decir que no tiene que dejar todo como estaba');

  preguntas = 0;
  await CUENTA_ACTIONS['cuenta-borrar']({}, ctx);
  assert.equal(preguntas, 1, 'si dice que no a la primera, no hay segunda');
  assert.equal(ctx.borro, undefined);
});

test('«Seguir sin cuenta» no toca la red ni la sesión', async t => {
  const nube = montarNube();
  montarAlmacen();
  t.after(restaurar);
  const ctx = contextoCuenta();

  CUENTA_ACTIONS['cuenta-sin-cuenta']({}, ctx);
  assert.equal(ctx.siguio, true);
  assert.equal(nube.peticiones.length, 0);
  assert.equal(leerSesion(), null);
});

test('ninguna acción de la cuenta lanza hacia fuera, ni con el servidor roto', async t => {
  montarNube({ alLlamar: async () => { throw new Error('servidor hecho trizas'); } });
  montarAlmacen();
  t.after(restaurar);

  for (const nombre of Object.keys(CUENTA_ACTIONS)) {
    const ctx = contextoCuenta();
    ctx.ui.sesion = { token: 't', usuario: { id: 'u1', correo: 'm@e.com', nombre: 'M', confirmado: true }, sincronizando: true };
    ctx.ui.cuenta.conflicto = { estadoServidor: createEmptyState(), revisionServidor: 2 };
    await assert.doesNotReject(async () => {
      await CUENTA_ACTIONS[nombre]({ dataset: {} }, ctx);
      await new Promise(seguir => setImmediate(seguir));
    }, `la acción «${nombre}» lanzó hacia fuera`);
  }
});
