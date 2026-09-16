-- El esquema de «¿Qué comemos?» en Supabase.
--
-- Esto se pega entero en el panel de Supabase, en SQL Editor → New query → Run.
-- Se puede volver a ejecutar las veces que haga falta sin romper nada: todo va
-- con `if not exists` o con `create or replace`.
--
-- ── Lo que hay que entender antes de tocarlo ──────────────────────────────
--
-- La clave pública que viaja dentro del APK no da permisos. Lo único que hace es
-- decir «soy esta aplicación»; qué puede leer y escribir cada persona lo deciden
-- las políticas de seguridad por fila (RLS) que hay más abajo, y las aplica
-- Postgres, no el teléfono. Da igual que alguien desmonte el APK, saque la clave
-- y llame a la API a mano: seguirá viendo exactamente su casa y ninguna otra.
--
-- Por eso este archivo es la parte de seguridad de verdad del proyecto. Si algo
-- de aquí se desactiva, deja de haber separación entre cuentas aunque el código
-- del teléfono esté perfecto.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Las tres tablas del modelo mínimo
-- ────────────────────────────────────────────────────────────────────────────

-- El usuario. El correo y la contraseña NO se copian aquí: viven en `auth.users`,
-- que es de Supabase, con la contraseña cifrada y fuera del alcance de esta
-- aplicación. Aquí solo va el nombre, que es lo que la app enseña.
create table if not exists public.perfiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nombre     text not null default '',
  creado_en  timestamptz not null default now()
);

-- La casa. `estado` es el documento entero de la aplicación —despensa, comidas,
-- personas, rutinas—, y `revision` es el número que sube en cada guardado y que
-- permite detectar que dos teléfonos escribieron sobre lo mismo.
create table if not exists public.hogares (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null default 'Mi casa',
  creado_por      uuid not null references auth.users (id) on delete cascade,
  estado          jsonb,
  revision        bigint not null default 0,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

-- Quién pertenece a qué casa.
--
-- Con una sola persona por casa esta tabla parece de más, y es justo al revés:
-- es la que hace que mañana se puedan añadir invitaciones sin migrar nada.
-- Invitar será insertar una fila aquí. Hoy no hay interfaz para eso a propósito,
-- pero el sitio donde irá ya existe y las políticas ya cuentan con él.
create table if not exists public.miembros (
  hogar_id    uuid not null references public.hogares (id) on delete cascade,
  usuario_id  uuid not null references auth.users (id) on delete cascade,
  papel       text not null default 'miembro' check (papel in ('dueño', 'miembro')),
  creado_en   timestamptz not null default now(),
  primary key (hogar_id, usuario_id)
);

-- Buscar «de qué casa soy» es lo primero que hace la app al entrar.
create index if not exists miembros_por_usuario on public.miembros (usuario_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Quién es miembro de qué
-- ────────────────────────────────────────────────────────────────────────────

-- Esta función existe para romper una recursión. La política de `hogares`
-- necesita preguntar por `miembros`, y si esa pregunta pasara a su vez por las
-- políticas de `miembros`, Postgres se metería en un bucle y fallaría con
-- «infinite recursion detected in policy».
--
-- `security definer` hace que la consulta de dentro corra con los permisos del
-- dueño de la función y, por tanto, sin pasar por RLS. Es seguro porque lo único
-- que puede contestar es «sí» o «no» sobre el usuario que está preguntando:
-- `auth.uid()` lo pone Supabase a partir del token y no se puede falsear desde
-- el teléfono.
create or replace function public.es_miembro(hogar uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.miembros
    where hogar_id = hogar
      and usuario_id = auth.uid()
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Las políticas por fila
-- ────────────────────────────────────────────────────────────────────────────

alter table public.perfiles enable row level security;
alter table public.hogares  enable row level security;
alter table public.miembros enable row level security;

-- Nadie entra por la puerta de atrás: sin sesión, `auth.uid()` es nulo y ninguna
-- política de abajo se cumple.

-- Perfiles: cada quien, el suyo.
drop policy if exists perfiles_leer on public.perfiles;
create policy perfiles_leer on public.perfiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists perfiles_crear on public.perfiles;
create policy perfiles_crear on public.perfiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists perfiles_cambiar on public.perfiles;
create policy perfiles_cambiar on public.perfiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Hogares: solo los de las casas de las que uno es miembro.
--
-- Esta es la política que responde al criterio «los datos de un usuario no
-- aparecen en otra cuenta». No hay ninguna otra defensa detrás, y no hace falta.
--
-- El `creado_por = auth.uid()` no es un permiso de más: es lo que hace que crear
-- una casa funcione. La aplicación crea la casa y solo DESPUÉS se apunta como
-- miembro, y entre esos dos pasos no es miembro de nada; sin esta condición, el
-- `insert ... returning` de PostgREST —que necesita poder LEER la fila que
-- acaba de escribir— falla con «new row violates row-level security policy» y
-- no hay forma de crear la primera casa de nadie.
--
-- Esto se descubrió ejecutando el esquema contra un Postgres de verdad. Leyendo
-- el SQL parecía correcto.
drop policy if exists hogares_leer on public.hogares;
create policy hogares_leer on public.hogares
  for select to authenticated
  using (creado_por = auth.uid() or public.es_miembro(id));

-- Crear: solo a nombre propio. Sin el `with check`, alguien podría crear casas
-- firmadas por otra persona.
drop policy if exists hogares_crear on public.hogares;
create policy hogares_crear on public.hogares
  for insert to authenticated
  with check (creado_por = auth.uid());

drop policy if exists hogares_cambiar on public.hogares;
create policy hogares_cambiar on public.hogares
  for update to authenticated
  using (public.es_miembro(id))
  with check (public.es_miembro(id));

-- Borrar la casa solo la persona que la creó.
drop policy if exists hogares_borrar on public.hogares;
create policy hogares_borrar on public.hogares
  for delete to authenticated
  using (creado_por = auth.uid());

-- Miembros: uno ve las filas de las casas donde está.
drop policy if exists miembros_leer on public.miembros;
create policy miembros_leer on public.miembros
  for select to authenticated
  using (usuario_id = auth.uid() or public.es_miembro(hogar_id));

-- Apuntarse a una casa solo si la acaba de crear uno mismo. Sin esta condición,
-- cualquiera podría insertarse en la casa de otro con solo saber su
-- identificador, y eso sería exactamente el fallo que las políticas de arriba
-- pretenden evitar.
--
-- Cuando existan las invitaciones, esta política crecerá con un «…o hay una
-- invitación válida a mi nombre». Es el único sitio que habrá que tocar.
drop policy if exists miembros_crear on public.miembros;
create policy miembros_crear on public.miembros
  for insert to authenticated
  with check (
    usuario_id = auth.uid()
    and exists (
      select 1 from public.hogares
      where hogares.id = miembros.hogar_id
        and hogares.creado_por = auth.uid()
    )
  );

-- Salirse de una casa, sí. Echar a otro, todavía no: eso llegará con las
-- invitaciones y con la interfaz que lo acompañe.
drop policy if exists miembros_borrar on public.miembros;
create policy miembros_borrar on public.miembros
  for delete to authenticated
  using (usuario_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Qué columnas se pueden tocar
-- ────────────────────────────────────────────────────────────────────────────

-- Las políticas dicen QUÉ FILAS; esto dice QUÉ COLUMNAS. Sin ello, un cliente
-- podría cambiar `creado_por` y firmar su casa con el nombre de otra persona, o
-- reescribir `id`. Ninguna de las dos cosas tiene sentido, así que no se permite.
revoke all on public.hogares  from anon, authenticated;
revoke all on public.perfiles from anon, authenticated;
revoke all on public.miembros from anon, authenticated;

grant select, insert, delete on public.hogares to authenticated;
grant update (nombre, estado, revision, actualizado_en) on public.hogares to authenticated;

grant select, insert on public.perfiles to authenticated;
grant update (nombre) on public.perfiles to authenticated;

grant select, insert, delete on public.miembros to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Borrar la cuenta
-- ────────────────────────────────────────────────────────────────────────────

-- Google Play exige que se pueda borrar la cuenta desde dentro de la aplicación.
-- Un cliente no puede borrar de `auth.users` por su cuenta —haría falta la clave
-- de servicio, que no está en el APK ni debe estarlo—, así que lo hace esta
-- función, que solo sabe hacer una cosa: borrar a quien la llama.
--
-- Aunque alguien la invocara a mano con la clave pública, sin una sesión válida
-- `auth.uid()` es nulo y la función se niega; y con una sesión válida solo puede
-- borrarse a sí mismo. No hay forma de pasarle el identificador de otra persona
-- porque no recibe ninguno.
--
-- El borrado arrastra en cascada el perfil, las filas de miembro y las casas
-- creadas por esa persona, que es lo que significa borrar la cuenta.
create or replace function public.borrar_mi_cuenta()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
begin
  if yo is null then
    raise exception 'Hace falta una sesión iniciada para borrar la cuenta.';
  end if;
  delete from auth.users where id = yo;
end;
$$;

revoke all on function public.borrar_mi_cuenta() from public, anon;
grant execute on function public.borrar_mi_cuenta() to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. El perfil se crea solo
-- ────────────────────────────────────────────────────────────────────────────

-- Quien entra con Google nunca pasa por la pantalla de registro de la app, así
-- que nadie llega a crear su fila de `perfiles`. Este disparador la crea en el
-- momento en que Supabase da de alta al usuario, venga por donde venga.
create or replace function public.crear_perfil_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'nombre',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_al_registrarse();

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Comprobación
-- ────────────────────────────────────────────────────────────────────────────

-- Al terminar, esto tiene que devolver `true` en las tres filas. Si alguna dice
-- `false`, la separación entre cuentas NO está puesta y no conviene seguir.
select
  relname as tabla,
  relrowsecurity as seguridad_por_fila_activa
from pg_class
where relname in ('perfiles', 'hogares', 'miembros')
  and relnamespace = 'public'::regnamespace;
