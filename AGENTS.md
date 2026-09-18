# ¿Qué comemos?

App local-first para que una casa decida a mano qué come y escriba la lista de
la compra delante del estante. Corre igual en el navegador y dentro de un APK de
Capacitor: son los mismos archivos, sin empaquetador.

El repositorio **es público**. Todo lo que se escriba aquí se publica.

## Lo que no se negocia

**Nadie pierde los datos de su casa.** Si cambia la forma de los datos, va una
migración en `src/migrate.js`, idempotente y con prueba. `SCHEMA_VERSION` está en
10 y no se sube a la ligera: `migrate()` devuelve `ok: false` ante una versión
que no conoce, y un teléfono que todavía no se actualizó **rechaza el estado
entero de la casa**, no el campo nuevo.

**La cámara, la lectura de facturas y el micrófono propio se retiraron a
propósito.** No se restauran, ni se «mejoran», ni se reintroducen por la puerta
de atrás de un complemento. No hay prueba automática que vigile el manifiesto
fusionado: se comprueba a mano sobre el APK ya construido, y conviene hacerlo,
porque un artefacto de compilación viejo llegó a reintroducir `RECORD_AUDIO` sin
que nada avisara.

**El manifiesto declara cuatro permisos y ninguno más.** `INTERNET` para las
cuentas; `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED` y `WAKE_LOCK` para el
recordatorio de la cena, que viene apagado y pide el permiso al encenderse.
`SCHEDULE_EXACT_ALARM` lo declara el complemento de notificaciones y este
proyecto lo QUITA con `tools:node="remove"`: no se necesita —los avisos se
programan con `isExactNotification: false`— y la política de Play mira con lupa
los permisos de alarma. Si algún día aparece en el paquete, es que alguien tocó
esa línea.

**Ningún fallo secundario cierra la aplicación.** Hay tres puertas por las que un
error se escapa de cualquier `try` —una acción `async`, un fallo dentro de
`render()`, un oyente del navegador— y `src/fallos.js` está escuchando en las
tres. Un camino nuevo que pueda fallar se envuelve con `protegida()`, o abre una
cuarta puerta que nadie vigila.

**La identidad visual no se improvisa.** Terracota `--clay`, crema `--canvas`,
texto `--ink`, verde salvia `--sage`, y Montserrat, que viaja dentro del
proyecto. Están declarados en `src/theme.css`; un hex suelto en una pantalla se
queda fuera del tema y deja de responder a cualquier cambio posterior.

**Compilar no es probar, y `npm test` en verde tampoco.** Ninguna prueba de este
proyecto ejecuta una pantalla en un navegador. Que las 589 pasen dice que la
lógica está bien, no que algo se vea, ni que un botón responda.

**`android/keystore.properties` no se abre nunca.** Ni para mirar. Google no deja
cambiar la clave de firma una vez publicada la primera versión: si se filtra, no
hay revocación posible. Su contraseña no se pide ni se propone rotar.

**La clave `service_role` de Supabase no entra aquí jamás.** Se salta todas las
políticas de seguridad. `tests/seguridad.test.js` se pone en rojo si aparece —
también si aparece dentro de un JWT—, pero esa prueba es la última red, no el
permiso para acercarse.

## Cómo se construye

No hay empaquetador, y es una decisión, no una carencia. `build.js` copia
`index.html`, `manifest.webmanifest`, `sw.js` y `src/` a `www/`, que es lo que
Capacitor mete en el APK. Los archivos que sirve `server.js` son exactamente los
que viajan dentro de la app nativa.

Consecuencias que hay que tener presentes al tocar código:

- **Un archivo nuevo en `src/` no llega solo al APK sin conexión.** Hay que
  añadirlo a la lista `SHELL` de `sw.js` **y** subir `CACHE` de versión. Sin
  subirla, el trabajador de servicio conserva la copia vieja para siempre y la
  sirve cada vez que falle la red, con los fallos que tuviera el día que se
  guardó.
- **No se importa nada de un CDN.** La política de contenido no lo admite y
  dejaría la app sin poder arrancar sin conexión. Por eso `src/nube.js` habla con
  Supabase por HTTP a mano en vez de usar `@supabase/supabase-js`.

## Comandos

| Qué | Cómo | Notas |
|---|---|---|
| Pruebas | `npm test` | 589, unos 16 s. Sin argumentos: `node --test tests/` con la carpeta como argumento **no** funciona |
| Servidor local | `npm start` | Puerto 4173, o `PORT` |
| Copiar a `www/` | `node build.js` | |
| Preparar el APK | `npm run android` | `build.js` y después `cap sync android` |
| Compilar el APK | ver abajo | |
| Esquema de Supabase | `node supabase/probar-esquema.mjs` | Pide `npm install --no-save embedded-postgres`. Fuera de `npm test` a propósito |

Gradle no arranca en esta máquina con la carpeta temporal por omisión: falla al
crear su socket de dominio Unix, y el mensaje no menciona la carpeta. Desde
`android/`, y con `C:\gtmp` creada:

```bash
GRADLE_OPTS='-Djdk.net.unixdomain.tmpdir=C:\gtmp' TMP='C:\gtmp' TEMP='C:\gtmp' ./gradlew.bat assembleRelease --no-daemon
```

## Trampas

**`android/app/src/main/assets/public/` es un espejo de `src/`.** Lo genera
`cap sync`, lo ignora `android/.gitignore`, y está en el disco. Una búsqueda por
el proyecto devuelve cada resultado dos veces, y una edición ahí no hace nada:
el siguiente `cap sync` la borra. El código vive en `src/`.

**Los finales de línea están mezclados, archivo por archivo.** Con CRLF:
`src/model.js`, `src/migrate.js`, `src/setup.js`, `src/plan.css`,
`src/sistema.css`, `index.html`, `README.md`. El resto, LF. Una sustitución de
varias líneas escrita con `\n` no encuentra nada en los primeros, y una que
normalice sin restaurar reescribe el archivo entero y ahoga el diff real.

**Un `data-action` sin su entrada en el objeto de acciones no lanza nada.** No
hay excepción ni pantalla roja: se pulsa y no pasa nada. Ya ocurrió tres veces, y
`tests/nada-suelto.test.js` existe justo por eso. Lo mismo con `data-form` y con
los nombres de ventana que despacha `app.js`.

**`icono('loquesea')` devuelve cadena vacía si el nombre no existe.** Es
deliberado —ningún dibujo puede dejar una pantalla en blanco— y por eso un nombre
mal escrito deja un hueco silencioso. `tests/iconos.test.js` lo caza leyendo el
código fuente.

**`src/app.js` no se puede importar en Node**: toca `document` al cargarse. Toda
lógica que merezca prueba tiene que vivir fuera de él —`src/avisos.js` salió de
ahí por esto—. Las pruebas que hablan de `app.js` lo leen como texto.

**Los `heredoc` de Bash y `node -e` se comen las barras invertidas y las
comillas invertidas.** Cualquier script con expresiones regulares o plantillas se
escribe con la herramienta de escritura de archivos, no por la línea de comandos.
En este proyecto ya ha costado tres arreglos.

**`gh` no está autenticado aquí.** Para la API de GitHub: `git credential fill`
con `username=nexocoregroup` **y** `path=nexocoregroup/que-comemos.git`, y el
token al encabezado `Authorization`.

## Convenciones

- **Todo en español**: código, comentarios, nombres de función, mensajes de
  error, mensajes de commit. Los mensajes que ve una persona van escritos para
  alguien que está de pie en un pasillo del supermercado.
- **Los comentarios explican el porqué, no el qué**, y muy en particular por qué
  algo se retiró. Varias pruebas quitan los comentarios antes de mirar el
  código, precisamente porque ahí se nombra a propósito lo que ya no existe.
- **Todo texto escrito por una persona pasa por `esc()` antes de llegar al
  HTML.** Dentro del APK ese HTML corre en un WebView con el puente de Capacitor
  al lado: un nombre de alimento sin escapar es ejecución de código.
- **Las fechas son texto `YYYY-MM-DD`**, y cuando hay que convertirlas a `Date`
  se anclan a `T12:00:00`. A medianoche, un huso horario cambia el día.
- **`todayISO()` se llama dentro de la función**, no al cargar el módulo. Un
  teléfono encendido toda la noche pintaba el día de ayer, en tres pantallas.
- **Las pruebas guardianas se respetan.** Siete de ellas leen el código fuente en
  vez de ejecutarlo. Cuando una se pone en rojo, casi siempre tiene razón; y
  cuando no la tiene, se arregla la aserción por su motivo real, nunca
  debilitándola hasta que pase.

## Archivos anidados

- [`supabase/AGENTS.md`](supabase/AGENTS.md) — el esquema y las políticas por
  fila: lo único que separa los datos de una cuenta de los de otra.

## Lo que este archivo no cubre

No hay `AGENTS.md` en `src/`, `tests/` ni `android/`: lo más caro de cada uno
está resumido arriba, pero el detalle sigue viviendo en los comentarios de
cabecera de `src/migrate.js`, `src/hogar.js`, `src/nube.js`, `src/fallos.js` y de
cada archivo de `tests/`. Vale la pena leerlos antes de tocar esas carpetas.

Esto es contexto, no configuración: se lee y se sigue, pero nada lo aplica a la
fuerza. Lo que tenga que cumplirse siempre va en un hook o en los permisos.
