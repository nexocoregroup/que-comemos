# Publicar «¿Qué comemos?» en Google Play

Guía para rellenar Play Console sin tener que pensarlo dos veces. Cada apartado trae **la respuesta exacta** que hay que dar, y por qué esa y no otra.

Todo lo de aquí sale de leer el código de la app, no de suponer. Cuando algo depende de una decisión tuya —el correo público, la cuenta de desarrollador— está marcado.

- **Desarrollador:** NexoCore, República Dominicana
- **Identificador:** `com.nexocore.quecomemos`
- **Categoría sugerida:** Estilo de vida (alternativa razonable: Productividad)
- **Precio:** gratis, sin compras dentro de la app
- **Actualizado:** 15 de septiembre de 2026

Antes de empezar, sustituye `CORREO_DE_CONTACTO` en las cuatro páginas de `legal/` y en `src/legal.js`. Ese mismo correo va en la ficha de la tienda, donde **es público**: lo ve cualquiera que abra la ficha. Conviene que sea un buzón que puedas atender, no tu correo personal de siempre.

---

## 1. Las tres URL que Play te va a pedir

Publica la carpeta `legal/` en GitHub Pages junto con el resto del proyecto. Las rutas quedan así (cambia `USUARIO` por el tuyo):

| Para qué | URL |
|---|---|
| Política de privacidad **(obligatoria)** | `https://USUARIO.github.io/que-comemos/legal/privacidad.html` |
| Eliminación de datos | `https://USUARIO.github.io/que-comemos/legal/eliminar-datos.html` |
| Términos de uso (opcional en Play, útil tenerlos) | `https://USUARIO.github.io/que-comemos/legal/terminos.html` |

Las tres tienen que **abrir sin contraseña y sin redirección rara**. Un revisor las abre; si dan 404, el envío se rechaza. Compruébalas desde el celular, con datos y sin wifi, antes de enviar nada.

> El proyecto ya trae `.nojekyll` y usa rutas relativas, así que las páginas funcionan igual desde la raíz de un dominio o desde una subcarpeta.

---

## 2. Seguridad de los datos (formulario «Data safety»)

El apartado más importante y el que más gente rellena mal. Para esta app es casi todo «no», y **es verdad**: hay una sola función en todo el código capaz de salir a la red (`src/providers.js`), y una prueba automática en `tests/seguridad.test.js` que falla si aparece cualquier otra.

### Las respuestas

| Pregunta | Respuesta | Por qué |
|---|---|---|
| ¿Tu app recopila o comparte alguno de los tipos de datos de usuario requeridos? | **No** | La app no transmite nada fuera del dispositivo. Todo vive en `localStorage`, dentro del teléfono. |
| ¿Recopilas datos? | **No** | No hay cuentas, ni analítica, ni publicidad, ni informes de fallos, ni SDK de terceros. |
| ¿Compartes datos con terceros? | **No** | No hay terceros. No hay servidor propio al que mandar nada. |
| ¿Los datos están cifrados en tránsito? | *No aplica / no se muestra* | Ver abajo. |
| ¿Ofreces una forma de solicitar la eliminación de datos? | *Ver abajo* | |
| ¿La app cumple la política de Familias? | **No aplica** | El público objetivo es 18+ (apartado 4). |

Al responder «No» a la primera pregunta, Play da el formulario por terminado y en la ficha aparece la etiqueta **«No se recopilan datos»**. Es la etiqueta más limpia que da Google, y aquí es legítima.

### Cifrado en tránsito: por qué la pregunta casi no aplica

Esa pregunta es sobre **los datos que la app recoge y manda a algún sitio**. Esta app no manda nada, así que no hay tránsito del que hablar y Play normalmente ni te la enseña.

Si alguna vez tienes que justificarlo ante un revisor, la respuesta corta es esta:

> La aplicación no realiza ninguna petición de red por sí misma. La única salida posible es una dirección de servidor que el propio usuario escribe a mano en una función avanzada desactivada de fábrica. El `networkSecurityConfig` del manifiesto (`android/app/src/main/res/xml/seguridad_de_red.xml`) declara `cleartextTrafficPermitted="false"`, así que **cualquier tráfico sin cifrar está bloqueado a nivel de sistema**: si esa dirección no es `https`, la llamada falla en vez de salir en claro.

### Eliminación de datos

Play enlaza las preguntas de eliminación con la recogida de datos y con la existencia de cuentas. Como aquí no hay ni una cosa ni la otra, **puede que el formulario ni te las muestre**. Según lo que te aparezca:

- **Si te pregunta si la app permite crear una cuenta** (en *Contenido de la app → Eliminación de datos*): responde **No**. No hay registro, ni inicio de sesión, ni contraseñas. Con eso el requisito de «URL de eliminación de cuenta» queda cubierto.
- **Si te deja poner una URL de eliminación de datos igualmente**: ponla. Es la de `legal/eliminar-datos.html`. No cuesta nada y le ahorra la duda al revisor.
- La política de privacidad ya enlaza a esa página, así que la ruta existe aunque el formulario no la pida.

### El micrófono: por qué NO se declara como dato recogido

Aquí es donde se equivoca la gente, así que conviene tenerlo claro y por escrito.

**Por qué el audio no cuenta como «recopilado por la app»:**

Para Google, «recopilar» significa que **la app** saca datos del dispositivo. Esta app no lo hace en ningún momento:

- No graba. No se crea ningún archivo de audio, ni temporal.
- No guarda. No hay audio en `localStorage` ni en ninguna parte.
- No transmite. La app nunca manda audio a ningún servidor.

Lo que hace es pedirle al **reconocedor de voz del propio Android** —el mismo del micrófono del teclado— que le devuelva texto. El audio lo maneja ese servicio del sistema, y la app solo recibe la cadena de texto ya convertida. Un servicio del sistema operativo del usuario no es un «tercero» tuyo en el sentido del formulario.

**Qué hay que declarar de todas formas, para no tener problemas:**

Lo de arriba es correcto, pero declarar «no recojo nada» con `RECORD_AUDIO` en el manifiesto es exactamente el patrón que hace que un revisor mire dos veces. Así que:

1. **Deja la explicación del micrófono en la política de privacidad.** Ya está en `legal/privacidad.html`, y dice la verdad completa: incluido que en los teléfonos sin reconocimiento local, **Android manda el audio a sus servidores** para entenderlo. Eso lo hace Android, no la app, pero ocultarlo sería mentir.
2. **Escribe la nota al revisor** del apartado 7. Es donde se explica en dos líneas para qué está el permiso.
3. **Que el permiso se pida en contexto.** La app solo abre el micrófono cuando la persona toca «Dictar», que es justo lo que Play quiere ver.
4. **Si algún día la app llega a enviar audio** —por ejemplo si se activa de verdad la capacidad `transcribe` de `src/providers.js` hacia un servidor— hay que **volver a este formulario y declararlo**. Ese día la etiqueta «No se recopilan datos» deja de ser cierta.

---

## 3. Clasificación de contenido (IARC)

Es un cuestionario. Se elige categoría y luego se contesta que no a casi todo.

**Categoría:** *Aplicación de referencia, noticias o educativa* → o, si aparece, **«Utilidad, productividad, comunicación u otros»**. Esta app es una herramienta de organización doméstica, no un juego ni contenido social.

**Las respuestas, una por una:**

| Pregunta | Respuesta |
|---|---|
| ¿Contiene violencia? | No |
| ¿Contiene sangre o sangre falsa? | No |
| ¿Contiene contenido sexual o desnudez? | No |
| ¿Contiene lenguaje soez o vulgar? | No |
| ¿Hace referencia a drogas, alcohol o tabaco? | No |
| ¿Contiene juegos de azar o simulaciones de apuestas? | No |
| ¿Permite comprar artículos dentro de la app? | No |
| ¿Muestra anuncios? | No |
| ¿Permite a los usuarios interactuar o comunicarse entre sí? | **No** |
| ¿Permite compartir la ubicación del usuario? | No |
| ¿Permite compartir contenido generado por el usuario con otras personas? | **No** |
| ¿Contiene contenido de miedo o terror? | No |

Las dos marcadas en negrita son las que más se contestan mal. Aquí la respuesta es **no** y es literal: la app no tiene red social, ni chat entre personas, ni forma de publicar nada. El respaldo es un archivo que la persona descarga a su propio teléfono; que después lo mande por WhatsApp si quiere no es una función de la app.

**Resultado esperado:** apto para todo público (*Everyone* / *PEGI 3* / *ESRB Everyone*).

---

## 4. Público objetivo y contenido

**Rango de edad: marca solo «18 años o más».**

Es una herramienta para quien maneja la casa, la compra y el presupuesto. Marcar cualquier grupo por debajo de 18 mete la app en la **política de Familias**, con requisitos extra (revisión adicional, reglas de publicidad, declaraciones de contenido) que no hacen falta y que solo alargan la publicación.

| Pregunta | Respuesta |
|---|---|
| ¿Qué grupos de edad son tu público objetivo? | **18 años o más**, solo ese |
| ¿Tu app está diseñada para niños? | **No** |
| ¿Podría atraer a niños sin quererlo? | **No** |
| ¿Quieres que aparezca en la sección Familias? | **No** |

Cuida que la ficha acompañe a esa respuesta: nada de personajes infantiles, colores de caramelo ni lenguaje de dibujos animados en el ícono ni en las capturas. La identidad de la app —terracota, crema, una mesa de casa— ya va por ahí, así que no hay nada que cambiar.

La política de privacidad dice que **la app no está dirigida a menores de 13 años y no recoge datos de nadie**. Las dos frases son coherentes con marcar 18+.

---

## 5. Declaración de permisos

La app pide **dos permisos y ninguno más**. Hay una prueba (`tests/seguridad.test.js`) que falla si alguno de los otros se cuela en el manifiesto.

| Permiso | Para qué | ¿Hay que declararlo aparte? |
|---|---|---|
| `INTERNET` | Nada, de fábrica. Solo lo usa el servidor opcional que el usuario escribe a mano. | No. Es un permiso normal, no sensible. |
| `RECORD_AUDIO` | Dictar en vez de escribir. | **No hay formulario de declaración.** Ver abajo. |

**Sobre el micrófono.** `RECORD_AUDIO` **no** está en la lista de permisos sensibles que obligan a llenar un formulario de declaración en Play Console —esa lista es SMS, registro de llamadas, acceso a todos los archivos, accesibilidad, alarmas exactas, ubicación en segundo plano y poco más—. Aun así, es un permiso que se mira con lupa, así que ten la explicación lista y ponla donde se pueda:

> El micrófono se usa únicamente para dictar texto en lugar de escribirlo. Se activa solo cuando la persona pulsa el botón «Dictar». La app no graba, no almacena ni transmite audio: el reconocimiento lo realiza el motor de voz de Android y la app únicamente recibe el texto resultante. Toda la funcionalidad está disponible escribiendo a mano; el permiso se puede denegar y la app sigue completa.

**Sobre `<queries>`.** El manifiesto declara un `<queries>` con el intent `android.speech.RecognitionService`. Es lo correcto y **no necesita declaración**: no se usa `QUERY_ALL_PACKAGES`, que sí la necesitaría. Está ahí porque desde Android 11 el sistema esconde qué apps hay instaladas, y sin eso el teléfono no encuentra su propio motor de voz.

---

## 6. Anuncios

| Pregunta | Respuesta |
|---|---|
| ¿Tu app contiene anuncios? | **No** |

Sin matices. No hay redes de publicidad, ni banners, ni anuncios con recompensa, ni contenido patrocinado. Si respondes «sí» por error, Play pone la etiqueta «Contiene anuncios» en la ficha y hay que pedir que la quiten.

---

## 7. Acceso a la app

**Respuesta: «Todas las funciones están disponibles sin restricciones de acceso».**

No hay usuario, ni contraseña, ni código, ni nada que darle al revisor. Marca esa opción y no rellenes credenciales.

**Ojo con dónde va la explicación.** Al marcar «sin restricciones», Play normalmente **no te da ningún campo de texto libre**: el hueco para instrucciones solo aparece si declaras que hay acceso restringido. Así que no busques dónde pegar esto durante el envío. Ten el texto guardado y úsalo cuando haga falta:

- Si el formulario **sí** te ofrece un campo de instrucciones o comentarios, pégalo ahí.
- Si Google te escribe pidiendo aclaraciones sobre el micrófono o sobre el permiso de internet —que es el motivo más probable de una consulta en esta app—, esta es la respuesta, ya redactada.
- Si alguna vez tienes que apelar un rechazo, lo mismo.

**Este es el texto que contesta el «no pudimos probar la función del micrófono»** (1.157 caracteres):

```
La app funciona sin cuenta, sin registro y sin conexión. No hacen falta
credenciales: al abrirla, toque "Ver un ejemplo" para cargar datos de
demostración y recorrer todas las pantallas.

Sobre el permiso de micrófono (RECORD_AUDIO): se usa solo para dictar texto
en lugar de escribirlo, y únicamente cuando el usuario pulsa el botón
"Dictar". La app no graba, no almacena ni transmite audio; el reconocimiento
lo hace el motor de voz de Android y la app recibe solo el texto. Para
probarlo: botón + (abajo a la derecha) -> "Hablar o dictar".

Toda la funcionalidad está disponible escribiendo a mano. El permiso se puede
denegar y la app sigue siendo completamente utilizable.

Sobre el permiso de INTERNET: la app no realiza ninguna petición de red por
sí misma. El permiso existe para una función avanzada, desactivada de
fábrica, en la que el propio usuario puede escribir la dirección de un
servidor suyo (Más -> Ajustes -> Detalle de este aparato). Sin configurarla,
no sale ningún dato del dispositivo.

Todos los datos se guardan en el almacenamiento local del dispositivo. No hay
servidor del desarrollador y no se recopila ningún dato del usuario.
```

---

## 8. Ficha de la tienda, lista para copiar y pegar

### Nombre de la app (máximo 30 caracteres)

```
¿Qué comemos?
```

*13 caracteres.* Si prefieres que se entienda de qué va desde el buscador, esta alternativa cabe igual:

```
¿Qué comemos? Menú y compra
```

*27 caracteres.*

### Descripción breve (máximo 80 caracteres)

```
Organiza lo habitual de tu casa y cada mes revisa solo lo que será diferente.
```

*77 caracteres.* Es la frase que sale bajo el nombre en los resultados, así que dice la idea completa de la app en una línea.

### Descripción completa (máximo 4000 caracteres)

```
Organizar las comidas de una casa no falla por falta de ganas. Falla porque
hay que llenar noventa y tres casillas al mes, y eso no lo hace nadie dos
veces.

¿Qué comemos? parte de otra idea: lo habitual de tu casa se escribe UNA vez.
Cada mes empieza ya preparado, y tú solo revisas lo que va a ser diferente.


LO QUE SE ESCRIBE UNA SOLA VEZ

Tu canasta habitual: lo que normalmente se compra en tu casa. Plátanos, arroz,
huevos, salami, atún, queso. Se escribe una vez y se usa todos los meses.

Tus rutinas: "plátano maduro con huevo, desayuno, lunes miércoles viernes y
sábado". Con una sola acción se llenan todos esos desayunos del mes, sobre las
fechas reales del calendario.

Cuando el hábito de la casa cambia de verdad, cambias la canasta. Lo demás es
la excepción de ese mes, y se queda en ese mes.


CUATRO PANTALLAS, NI UNA MÁS

HOY, para quien cocina. El desayuno, el almuerzo y la cena con sus cantidades,
para quién es cada cosa y qué hay que apartar. Nada de configuraciones.

PLAN MENSUAL. El progreso del mes y el recorrido de "Preparar este mes": cinco
pantallas cortas, una pregunta cada una.

LA COMPRA. Una sola lista y una sola cuenta: lo que tu casa consume al mes,
más lo que cambia este mes, menos lo que ya queda en casa. Cada línea dice de
dónde sale.

MÁS. Todo lo demás, ordenado por la frecuencia real con que hace falta.


¿CUÁNTO QUEDA? (NO "¿CUÁNTO SE CONSUMIÓ?")

La diferencia parece pequeña y no lo es. Lo primero se contesta abriendo la
nevera y mirando. Lo segundo obliga a recordar toda la semana y restar de
cabeza. La app hace la resta: había 8 plátanos, quedan 2, se consumieron 6.


COMIDAS FUERA DE CASA

Marcar una comida fuera la deja resuelta: no cuenta como pendiente y no genera
alimentos. Se puede aplicar a un día, a todos los domingos, al primer y tercer
domingo, o a lo que haga falta. Y valer solo para ese mes o quedarse como
rutina.


HABLAR EN VEZ DE ESCRIBIR

Se puede dictar: "quedan dos plátanos, diez huevos y media libra de queso". El
reconocimiento de voz es el de tu propio Android, el mismo del micrófono del
teclado. Escribir a mano funciona siempre, con micrófono o sin él.


TUS DATOS SE QUEDAN EN TU TELÉFONO

Esto no es un eslogan, es cómo está hecha:

- Sin cuentas. Sin registro, sin correo, sin contraseña.
- Sin conexión. Funciona completa en modo avión.
- Sin anuncios, sin analítica, sin rastreadores.
- El desarrollador no recibe ningún dato tuyo. Ninguno.
- La copia automática de Android está desactivada a propósito: tu despensa no
  se sube a la nube.

Como todo vive en tu teléfono, las copias te tocan a ti: Más, Respaldo, y
guardas el archivo donde quieras.


HECHA PARA UNA CASA DOMINICANA

El catálogo inicial son productos dominicanos, con sus nombres y sus alias. La
app habla como se habla aquí.


LO QUE ESTA APP NO ES

No es una app de nutrición. Las cantidades que ves son las que tú escribiste, y
las del ejemplo son datos inventados para enseñarte cómo funciona. No son
recomendaciones nutricionales ni consejo médico: para eso, un profesional de la
salud.

No sincroniza entre dispositivos, y no lo promete.


Gratis, sin compras dentro de la app.

NexoCore, República Dominicana.
```

*3.178 caracteres, por debajo del límite de 4.000.* Queda sitio de sobra si quieres añadir algo; cuenta los caracteres antes de pegar, porque Play corta sin avisar.

### Otros campos de la ficha

| Campo | Valor |
|---|---|
| Categoría | Estilo de vida |
| Etiquetas | organización del hogar, lista de compras, planificador de comidas |
| Correo de contacto **(público)** | `CORREO_DE_CONTACTO` |
| Sitio web | la del repositorio o `https://USUARIO.github.io/que-comemos/` (opcional) |
| Teléfono | déjalo vacío: una vez puesto, es público |
| Política de privacidad | `https://USUARIO.github.io/que-comemos/legal/privacidad.html` |

---

## 9. Recursos gráficos

### Lo que ya existe en el proyecto

| Recurso | Dónde está | Estado |
|---|---|---|
| **Ícono 512×512** | `src/icon-512.png` | **Listo.** Ya mide exactamente 512×512, con el fondo crema de la marca. Se sube tal cual. |
| Íconos de la app instalada | `android/app/src/main/res/mipmap-*/` y `drawable-*/` | Listos, los genera `npm run brand`. No se suben a Play: viajan dentro del AAB. |
| Original de la marca | `identidad visual/isotipo.png` y `logotipo.png` (1080×1350) | Es la fuente para todo lo demás. |

### Lo que hay que crear

**1. Gráfico de cabecera — 1024×500 px. Obligatorio.**

No existe y **no sale de redimensionar nada**: los originales son verticales (1080×1350) y el formato pedido es apaisado. Hay que componerlo: fondo crema `#FBF7F1`, el isotipo a la izquierda o centrado, el nombre en terracota `#A04B22`, y aire alrededor.

- PNG o JPEG, sin transparencia, 15 MB como máximo.
- **Nada de texto pequeño ni pegado a los bordes:** Play lo recorta en algunos sitios y le superpone el botón de reproducir si algún día añades vídeo. Deja el tercio central libre de texto importante.
- Que se entienda en miniatura. Se ve a 2 cm de ancho más veces que a tamaño completo.

**2. Capturas de pantalla de teléfono — de 2 a 8. Obligatorias (mínimo 2).**

No existe ninguna. Recomendación: **6**, una por idea.

- Formato: PNG de 24 bits (sin canal alfa) o JPEG.
- Tamaño recomendado: **1080×1920** (vertical, 9:16).
- Lado menor mínimo 320 px, mayor máximo 3840 px, y la proporción no puede pasar de 2:1.
- Se sacan de un teléfono real o del emulador, con los datos de ejemplo cargados para que no salgan pantallas vacías.

Las seis que cuentan la historia, en este orden:

1. **Hoy** — el desayuno, el almuerzo y la cena con sus cantidades. Es lo que la gente va a ver todos los días.
2. **Plan mensual** — el progreso del mes y las rutinas de la casa.
3. **El modal de una rutina** — «lunes, miércoles, viernes y sábado» con las fichas de los días. Es la idea central de la app.
4. **La compra** — la lista con el origen de cada línea.
5. **¿Cuánto queda?** — la revisión, con la resta hecha.
6. **Mi canasta habitual** — lo que se escribe una sola vez.

Si les pones un texto encima, que sea corto y en la tipografía de la marca. Y que la captura siga viéndose: una captura tapada por un rótulo no enseña la app.

**3. Capturas de tableta — 7 y 10 pulgadas. Opcionales, recomendadas.**

Sin ellas, Play puede marcar la ficha como no optimizada para pantallas grandes y mostrar un aviso a quien la abra desde una tableta. La app es responsive, así que sacarlas es barato: el emulador con un perfil de tableta y las mismas seis pantallas.

---

## 10. Lo que falta antes de poder subir

Por orden, y con lo que ya está hecho marcado.

**1. La cuenta de desarrollador de Google Play.** Pago único de 25 USD. La verificación de identidad tarda: se hace primero, no el día que quieres publicar.

> **Compruébalo antes de contar con la fecha:** desde hace un tiempo Google exige a las **cuentas personales nuevas** hacer una prueba cerrada con un mínimo de participantes durante un número de días seguidos antes de poder publicar en producción. Las cuentas de organización tienen otro camino, pero piden un número D-U-N-S. El requisito exacto cambia cada tanto, así que míralo en la Play Console del día en que abras la cuenta y **cuenta ese tiempo en el plan**.

**2. La clave de firma. No existe todavía.** Es el paso que no se puede deshacer.

```powershell
cd android
keytool -genkeypair -v -keystore que-comemos.jks -alias que-comemos -keyalg RSA -keysize 2048 -validity 10000
```

Después, copia `android/keystore.properties.example` a `android/keystore.properties` y rellena los cuatro valores. El `build.gradle` ya está preparado para leerlo: si el archivo existe, firma; si no, deja el paquete sin firmar y no rompe la compilación.

> **Google no deja cambiar esa clave una vez publicada la primera versión.** Si pierdes el `.jks` o su contraseña, no puedes actualizar tu propia app nunca más: hay que publicarla de cero con otro identificador, y quien ya la tuviera no recibe la actualización. Guarda una copia en un sitio que sobreviva a que se te dañe la computadora. El `.jks` y el `keystore.properties` están en `.gitignore` a propósito.

**3. `versionCode`.** Ahora mismo está en `1` en `android/app/build.gradle`, con `versionName "1.0"`. Para la primera subida está bien. **A partir de ahí tiene que crecer con cada publicación**: Play rechaza un número repetido, y el error aparece al subir, no al compilar.

**4. El AAB.** Play no acepta APK desde 2021.

```powershell
npm run android
cd android
.\gradlew bundleRelease
```

El archivo queda en `android/app/build/outputs/bundle/release/`.

**5. Probar el release en un teléfono de verdad.** No es opcional. La versión de publicación lleva minificación activada (`minifyEnabled`, `shrinkResources`), y un fallo de minificación **solo aparece ahí**, nunca al compilar:

```powershell
cd android
.\gradlew assembleRelease
```

Instala ese APK en un teléfono y recorre la app entera, sobre todo el dictado, que es lo que se resuelve por reflexión y lo que el minificador podría tumbar.

**6. Las páginas legales publicadas y abriendo.** Apartado 1.

**7. El correo de contacto decidido y sustituido.** En `legal/privacidad.html`, `legal/terminos.html`, `legal/eliminar-datos.html`, `legal/index.html`, `src/legal.js` y la ficha de la tienda.

**8. El gráfico de cabecera y las capturas.** Apartado 9.

### Ya está hecho, no hay que tocarlo

- **Minificación y reglas de ProGuard** — `minifyEnabled` y `shrinkResources` activados, con `proguard-rules.pro` conservando a mano lo que se resuelve por reflexión.
- **`targetSdk 36`, `minSdk 24`** — al día con lo que Play exige.
- **Respaldo automático desactivado** — `allowBackup="false"`, `fullBackupContent="false"` y `dataExtractionRules`. Es lo que sostiene la frase «tus datos no salen del teléfono».
- **Tráfico sin cifrar bloqueado** — `networkSecurityConfig` con `cleartextTrafficPermitted="false"` y solo las autoridades del sistema.
- **Permisos al mínimo** — dos, con una prueba que falla si entra un tercero.
- **Ícono de 512×512** — `src/icon-512.png`.

---

## Esto no es asesoría legal

Los textos de `legal/` y las respuestas de esta guía son **plantillas honestas escritas a partir de lo que la app hace de verdad**, leyendo el código: dónde se guardan los datos, qué permisos pide, qué sale a la red y qué no. No son un documento redactado por un abogado y no sustituyen a uno.

Antes de publicar, conviene que un abogado los revise. Y hay un momento en que esa revisión deja de ser recomendable y pasa a ser necesaria: **el día que la app deje de ser puramente local**. Si alguna versión futura añade cuentas, sincronización, un servidor propio, analítica, publicidad o cualquier envío de datos a un tercero, casi todo lo de estas páginas deja de ser cierto y **hay que reescribirlo antes de publicar esa versión**, no después. La etiqueta «No se recopilan datos» de Play también deja de serlo, y sostenerla cuando ya no es verdad es motivo de retirada de la app.

Si lo que cambia es solo la app y no lo que hace con los datos, esto sigue valiendo. Actualiza la fecha y sigue.
