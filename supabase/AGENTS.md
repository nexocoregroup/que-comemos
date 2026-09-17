# supabase/

**Un error aquí no se ve ejecutando la aplicación.** No hay pantalla roja, ni
excepción, ni prueba en rojo: la app sigue funcionando exactamente igual, solo
que enseñando la casa de otra cuenta. Esta carpeta es la seguridad de verdad del
proyecto, y es la única parte de él cuyo fallo es silencioso por diseño.

La clave que viaja dentro del APK **es pública a propósito** y no concede
permisos: solo dice «soy esta aplicación». Quién puede leer y escribir qué lo
deciden las políticas por fila de `esquema.sql`, y las aplica Postgres. Desmontar
el APK y llamar a la API a mano no da acceso a nada. Por eso ninguna defensa del
lado del teléfono cuenta aquí, y por eso no tiene sentido «arreglar» un problema
de acceso escondiendo la clave.

## Leer el SQL no basta

La primera versión de estas políticas parecía correcta y no lo era. `hogares_leer`
solo dejaba ver las casas donde uno ya era miembro; como la aplicación crea la
casa **antes** de apuntarse como miembro, el `insert … returning` de PostgREST
—que necesita releer la fila que acaba de escribir— fallaba con «new row violates
row-level security policy», y no había forma de crear la primera casa de nadie.
Eso salió al ejecutarlo, no al leerlo.

Después de tocar `esquema.sql`, **córrelo**:

```bash
npm install --no-save embedded-postgres
node supabase/probar-esquema.mjs
```

Levanta un Postgres de verdad, le mete el esquema entero y comprueba que un
usuario no ve la casa de otro. Está fuera de `npm test` a propósito: se descarga
un Postgres completo y este proyecto tiene tres dependencias en total.

## Invariantes

**Todo tiene que poder ejecutarse dos veces.** El archivo se pega entero en el
panel de Supabase, y se vuelve a pegar cada vez que cambia algo. Una tabla va con
`create table if not exists`, una función con `create or replace`, y una política
con su `drop policy if exists` justo encima. Un `create policy` suelto rompe la
siguiente pegada con «policy already exists», a mitad del archivo, dejando el
esquema aplicado a medias.

**`es_miembro` tiene que seguir siendo `security definer`.** La política de
`hogares` pregunta por `miembros`; si esa pregunta pasara a su vez por las
políticas de `miembros`, Postgres entra en bucle y falla con «infinite recursion
detected in policy». Es seguro porque la función solo contesta sí o no sobre
`auth.uid()`, que lo pone Supabase a partir del token y no se puede falsear desde
el teléfono. Lo mismo vale para `borrar_mi_cuenta()` y
`crear_perfil_al_registrarse()`: ninguna recibe un identificador ajeno, y ahí está
su seguridad.

**El `creado_por = auth.uid()` de `hogares_leer` no sobra.** Parece un permiso de
más junto a `es_miembro(id)`, y es lo único que permite crear la primera casa de
una cuenta. Quitarlo por limpieza deja a todo usuario nuevo sin poder registrar su
hogar.

**Las políticas dicen qué filas; los `grant`, qué columnas.** Son dos capas
distintas y hay que tocar las dos. Una columna nueva que la app escriba tiene que
entrar en `grant update (…) on public.hogares`, o el guardado falla con un error
de permisos que no se parece en nada a su causa. Los `revoke all` de arriba están
para que añadir una columna no la deje escribible por descuido: sin ellos, un
cliente podría reescribir `creado_por` y firmar su casa con el nombre de otra
persona.

**`miembros_crear` solo deja apuntarse a una casa recién creada por uno mismo.**
Aflojar ese `with check` permite que cualquiera se inserte en la casa de otro con
solo conocer su identificador, que es exactamente el fallo que todo lo demás
intenta evitar. Cuando existan las invitaciones, esta política crecerá con un «…o
hay una invitación válida a mi nombre»; es el único sitio que habrá que tocar.

**La clave `service_role` (o `secret`) no entra en el repositorio, ni en
`src/config-nube.js`, ni en el APK.** Se salta todas las políticas de esta
carpeta. En `src/config-nube.js` va la `anon public` y nada más.

## Cambiar el esquema no lo despliega

`esquema.sql` es un archivo del repositorio. Nada lo aplica solo. Mientras alguien
no lo pegue en **SQL Editor → New query → Run** del panel de Supabase, la base de
datos real sigue con las políticas de antes, y un agente puede dar por arreglado
algo que no lo está en ningún sitio donde importe.

Al terminar, la consulta del final del archivo tiene que devolver `true` en las
tres filas. Si alguna dice `false`, la separación entre cuentas no está puesta y
no se sigue.

Y una vez, en el SQL Editor, esto tiene que devolver cero filas:

```sql
select tablename from pg_tables where schemaname = 'public' and rowsecurity = false;
```

## Huecos declarados

- **La sincronización entre dos teléfonos nunca se ha probado de verdad.** El
  código existe y `revision` está pensada para detectar que dos aparatos
  escribieron sobre lo mismo, pero ese camino no se ha ejercitado con dos
  dispositivos reales. No se da por bueno.
- `probar-esquema.mjs` imita lo que Supabase pone alrededor de Postgres —el
  esquema `auth`, `auth.users`, `auth.uid()` y los papeles `anon` y
  `authenticated`—. La parte que comprueba es Postgres puro; lo que Supabase haga
  por encima no está cubierto.
- La puesta en marcha desde cero, las claves, el correo y Google están en
  [`docs/supabase.md`](../docs/supabase.md). No se repiten aquí.
