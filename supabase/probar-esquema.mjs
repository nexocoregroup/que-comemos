// Prueba de verdad del esquema: levanta un Postgres real, le mete
// `esquema.sql` y comprueba que un usuario NO puede ver la casa de otro.
//
// ── Por qué existe ────────────────────────────────────────────────────────
//
// `esquema.sql` es la seguridad de verdad del proyecto: es lo único que separa
// los datos de una cuenta de los de otra. El código del teléfono no defiende
// nada —la clave que lleva dentro es pública a propósito—, así que un error en
// esas políticas no se nota hasta que alguien ve la despensa de otra casa.
//
// Leer el SQL no basta. La primera versión de estas políticas parecía correcta y
// no lo era: `hogares_leer` solo dejaba ver las casas donde uno ya era miembro,
// y como la aplicación crea la casa ANTES de apuntarse como miembro, el
// `insert … returning` de PostgREST fallaba y no había forma de crear la primera
// casa de nadie. Eso salió al ejecutarlo, no al leerlo.
//
// ── Cómo se ejecuta ───────────────────────────────────────────────────────
//
//   npm install --no-save embedded-postgres
//   node supabase/probar-esquema.mjs
//
// No va dentro de `npm test` a propósito: se descarga un Postgres entero, y este
// proyecto tiene tres dependencias entre todo. Se corre a mano cuando se toca
// `esquema.sql`, que es casi nunca y siempre con cuidado.
//
// Supabase no está aquí, pero la parte que importa —RLS, las políticas, la
// función `es_miembro`— es Postgres puro. Lo único que hay que imitar es lo que
// Supabase pone alrededor: el esquema `auth`, la tabla `auth.users`, la función
// `auth.uid()` y los papeles `anon` / `authenticated`.

import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..');
const datos = path.join(process.env.TEMP || '.', 'pg-quecomemos');

const pg = new EmbeddedPostgres({
  databaseDir: datos,
  user: 'postgres',
  password: 'postgres',
  port: 54999,
  persistent: false
});

const fallos = [];
const ok = (cond, texto) => { if (!cond) fallos.push(texto); console.log(cond ? `  ok   ${texto}` : `  MAL  ${texto}`); };

try {
  console.log('Iniciando Postgres…');
  await pg.initialise();
  await pg.start();
  // La base se crea en UTF8 a la fuerza: por omisión hereda la página de
  // códigos de Windows y el esquema, que está comentado en español con flechas
  // y guiones largos, no cabe ahí.
  const raizDb = pg.getPgClient();
  await raizDb.connect();
  await raizDb.query("create database quecomemos with encoding 'UTF8' template template0 lc_collate 'C' lc_ctype 'C'");
  await raizDb.end();
  const db = pg.getPgClient('quecomemos');
  await db.connect();
  await db.query("set client_encoding to 'UTF8'");

  // ── Lo que Supabase pone alrededor ──────────────────────────────────────
  await db.query(`

    create schema if not exists auth;
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text,
      raw_user_meta_data jsonb default '{}'::jsonb
    );
    -- Así lo hace Supabase: el identificador sale del token, que PostgREST deja
    -- en una variable de sesión. Aquí se pone a mano para poder actuar como una
    -- persona o como otra.
    create or replace function auth.uid() returns uuid
      language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
    -- Supabase da esto por omisión a los dos papeles; sin ello, las políticas no
    -- pueden ni llamar a auth.uid() y todo falla con «permission denied».
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant select on auth.users to anon, authenticated;
  `);

  // ── El esquema de verdad, tal cual se le va a dar al usuario ────────────
  const esquema = fs.readFileSync(path.join(raiz, 'supabase', 'esquema.sql'), 'utf8');
  await db.query(esquema);
  console.log('Esquema aplicado sin errores.\n');

  // ── Dos personas ────────────────────────────────────────────────────────
  const maria = (await db.query(`insert into auth.users (email, raw_user_meta_data) values ('maria@ejemplo.com', '{"nombre":"María"}') returning id`)).rows[0].id;
  const pedro = (await db.query(`insert into auth.users (email, raw_user_meta_data) values ('pedro@ejemplo.com', '{"nombre":"Pedro"}') returning id`)).rows[0].id;

  // El disparador tuvo que crearles el perfil solo.
  const perfiles = (await db.query('select id, nombre from public.perfiles order by nombre')).rows;
  ok(perfiles.length === 2, 'el disparador crea el perfil al registrarse');
  ok(perfiles.some(p => p.nombre === 'María'), 'el perfil toma el nombre de los metadatos');

  // Actuar como alguien: se cambia al papel `authenticated` y se fija el sub.
  const como = async (quien, sql, valores) => {
    await db.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', quien]);
    await db.query('set local role authenticated');
    try { return await db.query(sql, valores); }
    catch (e) { console.log('    (error sql):', e.message); throw e; }
    finally { await db.query('reset role').catch(() => {}); }
  };

  await db.query('begin');

  // María se crea su casa, como haría la app.
  await db.query('begin');
  const hogarMaria = (await como(maria, `insert into public.hogares (nombre, creado_por, estado, revision) values ('Mi casa', $1, '{"secreto":"la despensa de María"}'::jsonb, 0) returning id`, [maria])).rows[0].id;
  await como(maria, `insert into public.miembros (hogar_id, usuario_id, papel) values ($1, $2, 'dueño')`, [hogarMaria, maria]);
  await db.query('commit');

  // ── LA PRUEBA QUE IMPORTA ───────────────────────────────────────────────
  await db.query('begin');
  const loQueVeMaria = await como(maria, 'select id, estado from public.hogares', []);
  ok(loQueVeMaria.rows.length === 1, 'María ve su casa');

  const loQueVePedro = await como(pedro, 'select id, estado from public.hogares', []);
  ok(loQueVePedro.rows.length === 0, 'Pedro NO ve la casa de María');

  const perfilesDePedro = await como(pedro, 'select id from public.perfiles', []);
  ok(perfilesDePedro.rows.length === 1 && perfilesDePedro.rows[0].id === pedro, 'Pedro solo ve su propio perfil');

  const miembrosDePedro = await como(pedro, 'select * from public.miembros', []);
  ok(miembrosDePedro.rows.length === 0, 'Pedro no ve quién vive en la casa de María');
  await db.query('commit');

  // Pedro intenta colarse en la casa de María sabiendo su identificador.
  await db.query('begin');
  let colado = false;
  try {
    await como(pedro, `insert into public.miembros (hogar_id, usuario_id, papel) values ($1, $2, 'miembro')`, [hogarMaria, pedro]);
    colado = true;
  } catch { colado = false; }
  await db.query('rollback');
  ok(!colado, 'Pedro NO puede apuntarse a la casa de María aunque sepa su identificador');

  // Pedro intenta escribir en la casa de María.
  await db.query('begin');
  const escrito = await como(pedro, `update public.hogares set estado = '{"pisado":true}'::jsonb where id = $1 returning id`, [hogarMaria]);
  ok(escrito.rows.length === 0, 'Pedro NO puede escribir en la casa de María');
  await db.query('rollback');

  // El guardado condicionado por revisión, que es lo que evita perder trabajo.
  await db.query('begin');
  const primera = await como(maria, `update public.hogares set estado = '{"v":1}'::jsonb, revision = 1 where id = $1 and revision = 0 returning revision`, [hogarMaria]);
  ok(primera.rows.length === 1, 'el guardado con la revisión correcta pasa');
  const segunda = await como(maria, `update public.hogares set estado = '{"v":2}'::jsonb, revision = 1 where id = $1 and revision = 0 returning revision`, [hogarMaria]);
  ok(segunda.rows.length === 0, 'el guardado con una revisión vieja NO pisa nada');
  await db.query('commit');

  // Sin sesión no se ve nada, que es lo que le pasaría a alguien con solo la
  // clave pública y sin haber entrado.
  await db.query('begin');
  await db.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', '']);
  await db.query('set local role anon');
  let sinSesion = -1;
  try { sinSesion = (await db.query('select id from public.hogares')).rows.length; } catch { sinSesion = -1; }
  await db.query('reset role').catch(() => {});
  ok(sinSesion === -1 || sinSesion === 0, 'sin sesión no se ve ninguna casa (ni por permisos ni por políticas)');
  await db.query('rollback');

  // Columnas que no se pueden tocar.
  await db.query('begin');
  let cambioDueno = false;
  try {
    await como(maria, `update public.hogares set creado_por = $1 where id = $2`, [pedro, hogarMaria]);
    cambioDueno = true;
  } catch { cambioDueno = false; }
  await db.query('rollback');
  ok(!cambioDueno, 'nadie puede cambiar de quién es una casa');

  // Borrar la cuenta.
  await db.query('begin');
  await db.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', maria]);
  await db.query('set local role authenticated');
  await db.query('select public.borrar_mi_cuenta()');
  await db.query('reset role');
  const quedan = (await db.query('select id from auth.users where id = $1', [maria])).rows.length;
  const casasQueQuedan = (await db.query('select id from public.hogares where id = $1', [hogarMaria])).rows.length;
  ok(quedan === 0, 'borrar_mi_cuenta borra al usuario');
  ok(casasQueQuedan === 0, 'y se lleva su casa por delante');
  await db.query('commit');

  await db.end();
} catch (error) {
  console.error('\nERROR:', error.message);
  fallos.push(error.message);
} finally {
  try { await pg.stop(); } catch { /* ya estaba parado */ }
}

console.log(fallos.length ? `\n${fallos.length} FALLO(S)` : '\nTodo correcto.');
process.exit(fallos.length ? 1 : 0);
