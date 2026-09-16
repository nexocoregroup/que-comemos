# Activar las cuentas

Todo el código de las cuentas está hecho y probado. Lo único que falta es un
proyecto de Supabase, y ese no lo puedo crear yo: hace falta una cuenta a tu
nombre, con tu correo y tu contraseña.

Son cuatro pasos y unos veinte minutos. Mientras no los hagas, la aplicación
funciona exactamente como hasta ahora —todo en el teléfono, sin cuenta y sin
red— y no menciona nada de esto por ninguna pantalla.

---

## Paso 1 · Crear el proyecto (5 minutos)

1. Entra en <https://supabase.com> y crea una cuenta. El plan gratuito sobra
   para esto: da 500 MB de base de datos y 50 000 usuarios activos al mes.
2. **New project**. Rellena:
   - **Name**: `que-comemos`
   - **Database Password**: pulsa **Generate a password** y **guárdala en tu
     gestor de contraseñas**. No la vas a necesitar para la app, pero es la
     única forma de entrar a la base de datos por fuera y Supabase no la vuelve
     a enseñar.
   - **Region**: `East US (North Virginia)` es la más cercana a República
     Dominicana de las gratuitas.
3. Espera a que termine de montarse (un par de minutos).

## Paso 2 · Crear las tablas (2 minutos)

1. En el panel, menú lateral → **SQL Editor** → **New query**.
2. Abre el archivo `supabase/esquema.sql` de este proyecto, cópialo **entero** y
   pégalo ahí.
3. **Run**.
4. Abajo tiene que salir una tabla con tres filas y `true` en las tres:

   | tabla | seguridad_por_fila_activa |
   |---|---|
   | perfiles | true |
   | hogares | true |
   | miembros | true |

   **Si alguna dice `false`, para y avísame.** Eso significa que la separación
   entre cuentas no está puesta, y sin ella una cuenta podría ver los datos de
   otra.

## Paso 3 · Copiar las dos claves a la app (2 minutos)

1. Panel → **Project Settings** (el engranaje) → **API**.
2. Copia estos dos valores:
   - **Project URL** — algo como `https://abcdefghijklm.supabase.co`
   - **anon public** (o **Publishable key**) — una cadena larga que empieza por
     `eyJ` o por `sb_publishable_`
3. Pégalos en `src/config-nube.js`:

   ```js
   export const NUBE = {
     url: 'https://abcdefghijklm.supabase.co',
     clave: 'eyJhbGciOi…'
   };
   ```

> **La otra clave, la de abajo, NO.** En esa misma pantalla hay una
> `service_role` (o `secret`). Esa se salta todas las protecciones: quien la
> tenga puede leer y borrar los datos de cualquier casa. No la pongas en este
> archivo, ni en el repositorio, ni en el APK. Hay una prueba automática
> (`npm test`) que se pone en rojo si aparece, pero más vale no llegar ahí.

## Paso 4 · Los correos (3 minutos)

Panel → **Authentication** → **Providers** → **Email**:

- **Enable Email provider**: encendido.
- **Confirm email**: decídelo tú.
  - **Encendido** (lo que viene de fábrica): más seguro, pero quien se registre
    tiene que ir a su correo antes de poder entrar. La app ya lo maneja: enseña
    una pantalla que lo explica y un botón para reenviar el mensaje.
  - **Apagado**: se entra directo al registrarse. Más cómodo para probar.

Panel → **Authentication** → **URL Configuration** → **Redirect URLs**, añade:

```
quecomemos://cuenta
```

Ese es el enlace por el que el navegador devuelve a la aplicación después de
identificarse. Tiene que decir exactamente lo mismo en tres sitios, y si uno
falla la pantalla se queda esperando para siempre:

1. Aquí, en el panel de Supabase.
2. `VUELTA_DE_GOOGLE` en `src/config-nube.js`.
3. El `intent-filter` de `android/app/src/main/AndroidManifest.xml`.

> El correo de fábrica de Supabase sirve para probar pero **está limitado a unos
> pocos mensajes por hora**. Antes de publicar en Play Store hay que conectar un
> servicio de correo propio en **Project Settings → Authentication → SMTP**
> (Resend y Brevo tienen planes gratuitos suficientes); si no, quien se registre
> un día con tráfico no recibirá nada y no sabrá por qué.

---

## Google (opcional, y es el paso largo)

El botón «Continuar con Google» está implementado entero: PKCE, apertura en el
navegador del sistema y vuelta por el enlace de la app. Lo que falta es
puramente configuración externa, en dos paneles que no son míos.

**El código no puede funcionar sin esto, y no es un fallo de la app.** Si lo
dejas sin configurar, el botón dará el error que devuelva Supabase —«Unsupported
provider»— traducido a «Ese proveedor no está activado en el proyecto».

### a) En Google Cloud

1. <https://console.cloud.google.com> → crea un proyecto.
2. **APIs y servicios** → **Pantalla de consentimiento de OAuth**:
   - Tipo **Externo**.
   - Nombre de la app, tu correo de asistencia, tu correo de contacto.
   - Mientras esté en «Prueba», solo entran los correos que añadas a mano en
     **Usuarios de prueba**. Para que entre cualquiera hay que **publicar** la
     pantalla, y eso puede pedir verificación de Google si pides permisos
     sensibles. Esta app solo pide correo y nombre, que no lo son.
3. **Credenciales** → **Crear credenciales** → **ID de cliente de OAuth** →
   **Aplicación web** (sí, web: quien recibe la vuelta es Supabase, no el
   teléfono).
4. En **URI de redireccionamiento autorizados**, pega exactamente:

   ```
   https://TU-PROYECTO.supabase.co/auth/v1/callback
   ```

   Sustituyendo `TU-PROYECTO` por lo tuyo. Sale en Supabase →
   **Authentication** → **Providers** → **Google**, en el recuadro «Callback URL».
5. Guarda el **ID de cliente** y el **Secreto de cliente**.

### b) En Supabase

**Authentication** → **Providers** → **Google** → encender, pegar el ID y el
secreto, **Save**.

> El secreto de Google va **en el panel de Supabase**, no en la app. El teléfono
> nunca lo ve: quien habla con Google es el servidor de Supabase.

### Si decides no hacerlo

Dímelo y quito el botón de la portada en una línea. Es mejor no tenerlo que
tenerlo dando un error que nadie entiende.

---

## Comprobar que quedó bien

```bash
npm test
node build.js && npx cap sync android
cd android && ./gradlew clean assembleDebug
```

Instala el APK y:

1. **Registro** — «Registrarme con correo». Pon un correo tuyo de verdad. Si
   dejaste la confirmación encendida, te llevará a la pantalla que dice que
   mires el correo.
2. **Sesión persistente** — cierra la app del todo (deslizar para quitarla de
   recientes) y ábrela. Tienes que seguir dentro.
3. **Sin internet** — pon el teléfono en modo avión y abre la app. Tiene que
   abrir y dejarte usarla entera.
4. **Separación de cuentas** — anota un alimento con un nombre raro, cierra
   sesión, regístrate con otro correo. Ese alimento **no puede aparecer**.
5. **Recuperar contraseña** — «Recuperar mi contraseña» con tu correo. Tiene que
   llegarte el enlace.
6. **Borrar cuenta** — Más → Mi cuenta → Borrar mi cuenta. En el panel de
   Supabase, **Authentication → Users**, esa cuenta tiene que haber desaparecido.

### Y una comprobación que vale la pena hacer una vez

En el **SQL Editor**, esto tiene que devolver **cero filas**. Si devuelve
alguna, hay una tabla sin protección y hay que pararlo todo:

```sql
select tablename
from pg_tables
where schemaname = 'public'
  and rowsecurity = false;
```

---

## Qué cuesta esto

El plan gratuito de Supabase aguanta de sobra: 50 000 usuarios activos al mes,
500 MB de base de datos y 5 GB de tráfico. La casa de una familia ocupa unos
200 KB, así que caben miles.

Lo único que hay que saber: **los proyectos gratuitos se pausan solos si nadie
los usa durante una semana**. Se reactivan desde el panel con un botón, pero si
eso pasa con gente usando la app, verán «El servidor no está respondiendo bien
ahora mismo» —y seguirán pudiendo usar la app entera, porque sus datos están en
el teléfono—. Con usuarios de verdad, el plan de pago (25 USD/mes) quita esa
pausa.
