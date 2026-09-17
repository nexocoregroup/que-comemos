# Publicar «¿Qué comemos?» en Google Play

Guía para rellenar Play Console sin tener que pensarlo dos veces. Cada apartado trae **la respuesta exacta** que hay que dar, y por qué esa y no otra.

Todo lo de aquí sale de leer el código de la app, no de suponer. Cuando algo depende de una decisión tuya —el correo público, la cuenta de desarrollador— está marcado.

- **Desarrollador:** NexoCore, República Dominicana
- **Identificador:** `com.nexocore.quecomemos`
- **Categoría sugerida:** Estilo de vida (alternativa razonable: Productividad)
- **Precio:** gratis, sin compras dentro de la app
- **Actualizado:** 16 de septiembre de 2026
- **Correo de contacto:** `nexocore.group@gmail.com` — **provisional**

Ese correo ya está escrito en las cuatro páginas de `legal/` y en `src/legal.js`, y va también en la ficha de la tienda, donde **es público**: lo ve cualquiera que abra la ficha. Está marcado como provisional a la espera del buzón oficial de NexoCore; cuando cambie, cambia en seis archivos a la vez:

```bash
grep -rn nexocore.group@gmail.com legal/ src/legal.js docs/
```

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

El apartado más importante y el que más gente rellena mal.

> **Esta sección se reescribió el 16 de septiembre de 2026.** Antes decía que la app no tenía cuentas ni código de red, y daba por buena la etiqueta «No se recopilan datos». Eso dejó de ser cierto el día que entraron las cuentas de Supabase, y durante un tiempo esta guía te habría hecho declararle a Google algo falso. **Ya no: lee lo de abajo, no lo que recuerdes de antes.**

### Lo que la app hace hoy, que es lo que hay que declarar

Son **dos interruptores distintos**, los dos apagados de fábrica, y de ellos depende todo lo demás:

1. **Crear una cuenta.** Opcional. La app funciona entera sin ella, y sin sesión guardada **no hace ni una llamada a la red**. Al crearla se guardan tu correo, tu nombre y tu contraseña cifrada en Supabase.
2. **Encender la sincronización.** Opcional y aparte. Solo entonces la casa —despensa, menú, compras, personas de la casa y lo que evita cada quien— se guarda además en la cuenta.

Nada se comparte con terceros en ningún caso. Supabase es el **encargado del tratamiento**, no un tercero con el que se comparten datos: presta el servicio de base de datos y no los usa para nada suyo.

### Las respuestas

| Pregunta | Respuesta | Por qué |
|---|---|---|
| ¿Tu app recopila o comparte alguno de los tipos de datos de usuario requeridos? | **Sí** | Con cuenta se recoge correo y nombre; con sincronización, además el contenido de la casa. |
| ¿Compartes datos con terceros? | **No** | No se ceden a nadie. Supabase es encargado del tratamiento, no un destinatario. |
| ¿Los datos están cifrados en tránsito? | **Sí** | HTTPS siempre, y `networkSecurityConfig` bloquea el tráfico sin cifrar a nivel de sistema. |
| ¿Ofreces una forma de solicitar la eliminación de datos? | **Sí** | La URL de `legal/eliminar-datos.html`, con el camino 3 dedicado a borrar la cuenta. |
| ¿La app permite crear una cuenta? | **Sí** | Y por eso la URL de eliminación de cuenta es **obligatoria**. |
| ¿La app cumple la política de Familias? | **No aplica** | El público objetivo es 18+ (apartado 4). |

La ficha ya **no** llevará la etiqueta «No se recopilan datos». Era la más limpia que da Google, y sostenerla hoy sería motivo de retirada.

### Los tipos de datos, uno por uno

Para cada uno, Play pregunta si se **recoge**, si se **comparte**, si es **obligatorio** y para qué. Aquí van las cuatro respuestas de cada uno:

| Tipo de dato | ¿Se recoge? | ¿Se comparte? | ¿Obligatorio? | Propósito |
|---|---|---|---|---|
| **Información personal → Dirección de correo** | Sí, solo si crea cuenta | No | **Opcional** | Gestión de la cuenta |
| **Información personal → Nombre** | Sí, solo si crea cuenta | No | **Opcional** | Gestión de la cuenta |
| **Información personal → Otra información** (las personas de la casa y sus nombres) | Sí, solo si sincroniza | No | **Opcional** | Funciones de la app |
| **Salud y forma física → Información de salud** (alergias e intolerancias anotadas) | Sí, solo si sincroniza | No | **Opcional** | Funciones de la app |
| **Otros → Otros datos generados por el usuario** (despensa, menú, compras, historial) | Sí, solo si sincroniza | No | **Opcional** | Funciones de la app |

Marca siempre **«Los usuarios pueden elegir si se recopilan estos datos»**: es literalmente cierto, porque tanto la cuenta como la sincronización se encienden a mano y vienen apagadas.

> **La fila de salud es la que hay que declarar sí o sí.** La app deja anotar que alguien de la casa tiene alergia o intolerancia a un alimento, y eso es información de salud aunque lo escriba otra persona. Si se sincroniza, sale del teléfono. Omitirla porque «es solo una etiqueta de comida» es exactamente el tipo de omisión que retira una app.

### Cifrado en tránsito

Ahora sí aplica, y la respuesta es **sí**. Si un revisor pide justificarlo:

> Toda la comunicación de la aplicación va por HTTPS contra un único destino: el proyecto de Supabase que presta el servicio de cuentas. La aplicación no tiene ningún otro cliente de red, y una prueba automatizada (`tests/seguridad.test.js`) falla si aparece una segunda salida o si cambia la dirección de esta. Además, el `networkSecurityConfig` del manifiesto (`android/app/src/main/res/xml/seguridad_de_red.xml`) declara `cleartextTrafficPermitted="false"` y solo confía en las autoridades del sistema, de modo que cualquier tráfico sin cifrar quedaría bloqueado a nivel de sistema. Sin sesión iniciada la aplicación no realiza ninguna petición: funciona por completo contra el almacenamiento local del dispositivo.

### Eliminación de datos y de cuenta

Como la app **sí** permite crear una cuenta, esto pasó de opcional a **obligatorio**. En *Contenido de la app → Eliminación de datos*:

- **¿La app permite crear una cuenta?** → **Sí**.
- **URL donde se solicita la eliminación de la cuenta** → la de `legal/eliminar-datos.html`. Google exige que esa página se pueda abrir **sin iniciar sesión**, y esta cumple: es una página pública.
- Esa página explica los tres caminos, y el **camino 3** es el de la cuenta: *Más → Mi cuenta → Borrar mi cuenta*, inmediato, sin formulario y sin espera.
- También ofrece un correo de respaldo para quien ya no pueda entrar a la app. Google valora que exista esa salida.
- **Qué se borra y qué se conserva:** se borra todo —correo, nombre, contraseña, la casa guardada— y no se conserva nada. Si el formulario pide detallar retención, la respuesta es que no hay retención.


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

### El micrófono: ya no se pide

Hubo un dictado, y con él el permiso `RECORD_AUDIO` y un `<queries>` para
encontrar el motor de reconocimiento de Android. **Se retiraron los tres** al
quitarle a la app la voz propia. Los campos de texto siguen admitiendo el
micrófono del teclado del teléfono, que lo pone el teclado y no esta app: no hay
permiso que pedir ni nada que declarar.

Queda escrito aquí porque la instrucción de siempre sigue en pie: **si algún día
la app llegara a enviar audio —o cualquier otra cosa que no esté en la tabla de
arriba— hay que volver a este formulario y declararlo.** Ya pasó una vez con las
cuentas y la declaración se quedó vieja durante semanas; que no vuelva a pasar.

---

## 5. Declaración de permisos

La app pide **un permiso y ninguno más**. Hay una prueba (`tests/seguridad.test.js`) que falla si alguno de los otros se cuela en el manifiesto.

| Permiso | Para qué | ¿Hay que declararlo aparte? |
|---|---|---|
| `INTERNET` | La cuenta, que es opcional. Sin sesión iniciada no se hace ni una llamada. | No. Es un permiso normal, no sensible. |


**Sobre `INTERNET`, si alguien pregunta.** Es un permiso normal: Play no lo cuestiona y no hay formulario que llenar. La respuesta, si hace falta darla: **se usa únicamente para la cuenta, que es opcional**. Sin sesión iniciada la app no hace ninguna petición y funciona por completo en modo avión. El destino es uno solo —el proyecto de Supabase que presta el servicio de cuentas— y una prueba automatizada falla si aparece un segundo. La política de privacidad lo explica con esas mismas palabras, en su propia sección, en vez de esconderlo.

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
- Si Google te escribe pidiendo aclaraciones sobre el permiso de internet —que es el motivo más probable de una consulta en esta app—, esta es la respuesta, ya redactada.
- Si alguna vez tienes que apelar un rechazo, lo mismo.

**Este es el texto para cuando Google pregunte cómo probar la app** (unos 900 caracteres):

```
La app funciona sin cuenta, sin registro y sin conexión. No hacen falta
credenciales: al abrirla, toque "Ver un ejemplo" para cargar datos de
demostración y recorrer todas las pantallas.

Sobre el permiso de INTERNET: se usa unicamente para la cuenta, que es
opcional. Sin sesion iniciada la app no realiza ninguna peticion de red y
funciona por completo en modo avion. La app tiene un unico destino de red
—el proyecto de Supabase que presta el servicio de cuentas— y una prueba
automatizada falla si aparece un segundo.

Los datos se guardan en el almacenamiento local del dispositivo. Solo salen
de el si el usuario crea una cuenta y ademas activa la sincronizacion, que
son dos acciones separadas y desactivadas de fabrica. No hay analitica, ni
publicidad, ni informes de fallos, ni SDK de terceros.
```

> Ese bloque va sin tildes a propósito: algunos formularios de Play maltratan los acentos al pegarlos.

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

Tus productos habituales: lo que normalmente se compra en tu casa. Plátanos,
arroz, huevos, salami, atún, queso. Se marcan una vez, sin pedirte cantidades, y
están ahí cada vez que preparas una compra.

Tus comidas habituales: "plátano maduro con huevo", "arroz con carne", "mangú
con salami". Nombre, en qué momentos se comen y una nota para quien cocina. Se
escriben una vez y se reutilizan cualquier día, sin volver a escribirlas.

Lo que se come cada día lo decides tú, el día que quieras. La app no propone
platos ni rellena el calendario por su cuenta.


CUATRO PANTALLAS, NI UNA MÁS

HOY, para quien cocina. El desayuno, el almuerzo y la cena con sus cantidades,
para quién es cada cosa y qué hay que apartar. Nada de configuraciones.

PLAN MENSUAL. El progreso del mes, lo que falta por decidir y el calendario
entero. Para no tocar treinta casillas: eliges una preparación, marcas los días
—los siete de la semana que viene, o los catorce de las dos siguientes— y se
ponen esos. Ninguno más.

LA COMPRA. La lista de un viaje al colmado. Tus productos habituales están ahí
agrupados por rubros para no tener que acordarte de todo: tocas lo que hace
falta esta vez, dices cuánto, y vas tachando en el supermercado. Si pediste 2 y
solo había 1, se anota 1 y queda 1 pendiente.

MÁS. Todo lo demás, ordenado por la frecuencia real con que hace falta.


LO QUE ESTA APP NO HACE

No lleva inventario de tu despensa. No calcula cuánto tienes que comprar. No
propone platos, no copia semanas, no repite comidas y no rellena meses. No
cuenta calorías ni propone dietas. Decides tú qué se come y qué entra en la
lista; lo que hace la app es acordarse por ti de lo que esta casa compra de
costumbre y de lo que sabe preparar.


COMIDAS FUERA DE CASA

Marcar una comida fuera la deja resuelta: no cuenta como pendiente. Se puede
aplicar a una comida, a un día entero, o a varios días de una vez con la misma
ventana de arriba.



TUS DATOS SE QUEDAN EN TU TELÉFONO, SALVO QUE TÚ DIGAS OTRA COSA

Esto no es un eslogan, es cómo está hecha:

- La cuenta es opcional. La app entera funciona sin registrarse: sin correo,
  sin contraseña y sin una sola llamada a la red.
- Subir los datos es una segunda decisión aparte, con su propio interruptor.
  Sirve para recuperar tu casa al cambiar de teléfono, y viene apagada. Si la
  enciendes, tus datos se guardan en un servidor para que puedas bajarlos.
- Sin anuncios, sin analítica, sin rastreadores. Nunca.
- La copia automática de Android está desactivada a propósito.

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
| Correo de contacto **(público)** | `nexocore.group@gmail.com` |
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
| **Gráfico de cabecera 1024×500** | `tienda/grafico-destacado-1024x500.png` | **Listo.** Lo genera `npm run tienda`, que parte el logotipo por su hueco y monta las dos piezas en horizontal. Comprueba solo que no queda transparencia y que los márgenes están limpios. Se sube tal cual. |
| **Seis capturas de teléfono** | `tienda/capturas/` | **Listas.** Las genera `npm run capturas`: conduce un Chrome sin perfil por las seis pantallas, con el ejemplo de la propia app y nunca con datos de nadie. 1080×1920, 24 bits sin alfa. |
| Original de la marca | `identidad visual/isotipo.png` y `logotipo.png` (1080×1350) | Es la fuente para todo lo demás. |

### Las huellas del certificado

Las pide Google Cloud Console al configurar «Entrar con Google», y las enseña la Play Console cuando la app está publicada. **No son secretas**: identifican la clave, no la contienen. Lo secreto es el `.jks` y su contraseña.

```
SHA-1    DA:8F:9B:9C:50:31:E7:78:B4:EC:B0:59:5E:90:8D:11:EC:B3:92:88
SHA-256  48:7F:F7:2A:F9:52:5F:B9:2A:D6:5C:03:C8:B8:5C:BF:C5:6D:72:96:64:9E:B3:FE:BE:D0:33:8D:39:64:71:5C
```

Se vuelven a sacar en cualquier momento con:

```powershell
$bt = Get-ChildItem "$env:LOCALAPPDATA\Android\Sdk\build-tools" -Directory | Sort-Object Name -Descending | Select-Object -First 1
& "$($bt.FullName)\apksigner.bat" verify --print-certs entrega\que-comemos-1.0-release.apk
```

> Si activas **la firma de aplicaciones de Play** —que es lo recomendado—, Google genera su propia clave final y la huella que ven los servicios de Google es la de **ellos**, no esta. La de aquí pasa a ser la «clave de subida». Cuando configures «Entrar con Google», copia la huella que te enseñe la Play Console en *Configuración → Integridad de la aplicación*, no esta, o el inicio de sesión fallará sin decir por qué.

### Lo que hay que crear

**1. Las seis capturas, y por qué esas.** Las genera `npm run capturas`; el orden es el del archivo y cada una tiene una idea sola:

1. **Hoy** — el desayuno y el almuerzo con sus cantidades. Es lo que la gente va a ver todos los días.
2. **Plan mensual** — el progreso del mes y lo que falta por decidir.
3. **Poner una comida en varios días** — con los siete días siguientes ya marcados. Es la única ayuda que la app da para no tocar treinta casillas, y por eso se enseña con algo marcado en vez de un formulario en blanco.
4. **Preparar la compra** — los productos habituales por rubros, con el buscador.
5. **Mi lista** — lo pendiente arriba y lo comprado tachado al final.
6. **Mis productos habituales** — lo que se marca una sola vez.

Para rehacerlas hay que tener el servidor en marcha (`npm start`). Si cambia el orden de una pantalla y la captura sale en otro sitio, se ajusta `desplazar` en `tools/capturas.js`, que es la única cosa de ahí que depende de cómo esté puesta la app hoy.

**2. Capturas de tableta — 7 y 10 pulgadas. Opcionales, recomendadas.**

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

Instala ese APK en un teléfono y recorre la app entera, sobre todo el inicio de sesión con Google y el respaldo, que son lo que se resuelve por reflexión y lo que el minificador podría tumbar.

**6. Las páginas legales publicadas y abriendo. Hecho.** Están en <https://nexocoregroup.github.io/que-comemos/legal/>, servidas por GitHub Pages desde `main`. Ojo con eso: Pages publica `main`, así que un texto corregido en una rama no está publicado hasta que la rama se fusiona. Apartado 1.

**7. El correo de contacto decidido y sustituido.** En `legal/privacidad.html`, `legal/terminos.html`, `legal/eliminar-datos.html`, `legal/index.html`, `src/legal.js` y la ficha de la tienda.

**8. El gráfico de cabecera y las capturas. Hecho.** `npm run tienda` y `npm run capturas`. Están en `tienda/`. Lo único que queda del apartado 9 son las capturas de tableta, que son opcionales. Apartado 9.

### Ya está hecho, no hay que tocarlo

- **Minificación y reglas de ProGuard** — `minifyEnabled` y `shrinkResources` activados, con `proguard-rules.pro` conservando a mano lo que se resuelve por reflexión.
- **`targetSdk 36`, `minSdk 24`** — al día con lo que Play exige.
- **Respaldo automático desactivado** — `allowBackup="false"`, `fullBackupContent="false"` y `dataExtractionRules`. Es lo que impide que Android suba la despensa a la cuenta de Google del dueño del teléfono sin que nadie lo pida.
- **Tráfico sin cifrar bloqueado** — `networkSecurityConfig` con `cleartextTrafficPermitted="false"` y solo las autoridades del sistema.
- **Permisos al mínimo** — dos, con una prueba que falla si entra un tercero.
- **Ícono de 512×512** — `src/icon-512.png`.

---

## Esto no es asesoría legal

Los textos de `legal/` y las respuestas de esta guía son **plantillas honestas escritas a partir de lo que la app hace de verdad**, leyendo el código: dónde se guardan los datos, qué permisos pide, qué sale a la red y qué no. No son un documento redactado por un abogado y no sustituyen a uno.

Antes de publicar, conviene que un abogado los revise. **Y ahora hace más falta que antes**, porque la app ya no es puramente local: tiene cuentas y sincronización opcionales, y eso mete en juego un encargado del tratamiento (Supabase), un dato de salud (las alergias anotadas) y un derecho de supresión que hay que poder atender.

Ese día ya llegó una vez y la documentación no se enteró: las cuentas entraron el 15 de septiembre de 2026 y estas páginas siguieron diciendo «no hay cuentas ni servidor» hasta el 16. **La regla, escrita para la próxima vez:** si una versión añade, quita o cambia algo de lo que sale del teléfono, se reescriben `legal/`, `src/legal.js`, el README y este documento **en el mismo commit**, no después. `tests/legal.test.js` existe para que eso no dependa de que alguien se acuerde.

Si lo que cambia es solo la app y no lo que hace con los datos, esto sigue valiendo. Actualiza la fecha y sigue.
