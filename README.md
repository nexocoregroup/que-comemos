# ¿Qué comemos?

Aplicación local para decidir en familia qué se desayuna, se almuerza y se cena, y para llevar la lista al colmado. Los datos viven en el dispositivo y la app funciona entera sin cuenta y sin conexión: sin sesión iniciada no hace ni una llamada a la red. La cuenta es opcional —sirve para recuperar la casa al cambiar de teléfono— y subir los datos a ella es una segunda decisión aparte, con su propio interruptor; las dos vienen apagadas. La interfaz y los datos de demostración están en español dominicano. Las cantidades del ejemplo son datos de prueba, no recomendaciones nutricionales.

**La regla que gobierna el diseño:** lo que se escribe una vez es **lo que la casa tiene**; lo que se come cada día lo decide una persona, día a día. La familia registra una sola vez quiénes son, qué compra de costumbre y qué sabe preparar. A partir de ahí planifica a mano la semana que viene, o las dos siguientes si prefiere. La app **no propone platos, no copia semanas, no repite comidas y no rellena meses**, y la compra es una lista aparte que no sale del menú.

Hubo una versión que sí hacía todo eso: se guardaban costumbres —«mangú con salami, los lunes de desayuno»— y el mes se llenaba solo. Se retiró. Llenaba el calendario de comidas que nadie había decidido, y revisarlas una por una costaba más que haberlas puesto.

## Ejecutar

Necesitas Node.js 20.11 o posterior. No hay dependencias que instalar.

```powershell
npm start
```

Abre [http://localhost:4173](http://localhost:4173). Para usar otro puerto en PowerShell:

```powershell
$env:PORT=4174
npm start
```

Las pruebas:

```powershell
npm test
```

## Las cuatro pantallas

La navegación tiene cuatro destinos, y solo cuatro. Antes tenía siete, y cuatro de ellos —Productos y datos, Personas, Preparaciones, Revisión— competían de tú a tú con la pantalla del día. Ninguna casa abre la app para editar una ficha de producto.

- **Hoy** — para quien cocina. El desayuno, el almuerzo y la cena con sus cantidades, para quién es cada cosa, qué hay que apartar para otro día y la nota de quien organizó. Nada de configuraciones ni de cálculos.
- **Plan mensual** — la pantalla principal. El progreso del mes, lo que falta por decidir, los días que no se cocina en casa, y el calendario para tocarlo.
- **Compra** — la lista de un viaje al colmado: se prepara desde los productos habituales y se va tachando.
- **Más** — todo lo demás, ordenado por la frecuencia real con que hace falta: mis productos habituales, preparaciones, familia y restricciones, alimentos de la casa, historial, respaldo y ajustes.

El botón **+** tiene cuatro acciones, no once: poner una comida, crear una preparación, preparar la compra, añadir un alimento.

En computadora, el botón ☰ junto al título retrae o muestra el menú lateral. En celular el menú está oculto: ☰ arriba a la izquierda lo abre y ‹ lo cierra.

## Organizar mi casa

La primera apertura enseña una sola promesa —*organiza una vez lo habitual de tu casa y decide con calma qué se come esta semana*— y un botón: **Organizar mi casa**. Hay un enlace discreto para ver un ejemplo, que no compite con él.

Son cinco pasos, se pueden abandonar y retomar, y en **ninguno se pide una cantidad**:

1. **Mi hogar.** Cuántas personas comen en casa y, de cada una, el nombre, si es adulto, adolescente o niño, y qué debe evitar si aplica. Nada más: no se pregunta el peso, ni la fecha de nacimiento, ni nada médico. Es la misma ficha que la de *Familia*, no una segunda escrita aparte.
2. **Productos habituales.** *Selecciona lo que normalmente compras para tu casa. No tienes que indicar cantidades.* Un catálogo de **productos dominicanos** recorrido **rubro por rubro**, ocho pantallas seguidas en la misma posición, con Atrás y Continuar y sin nada que arrastrar de lado. No hay mínimo: si esta casa no compra vegetales frescos, pasa de largo. *¿No encuentras un alimento? Añadirlo* está siempre a la vista y pide **solo el nombre**.
3. **Cómo compramos.** Mensual o quincenal. Sirve para saber cuándo toca la próxima lista y qué días cubre; **no divide cantidades ni lleva cuentas**. Se cambia cuando se quiera desde *Más → Ajustes → Organización de compra*, y cada cambio vale desde el mes que se le diga en adelante: lo que ya pasó no se reescribe.
4. **Comidas habituales.** Nombre, en qué momentos se come, y una nota opcional para quien cocina. Se escriben varias seguidas: al guardar, el formulario queda en blanco para la siguiente. Qué lleva cada plato y cuánto rinde se añade después, si se quiere, desde *Más → Preparaciones* —y editar una comida desde aquí **no** le borra lo que allí se escribió—.
5. **Ver mi casa.** Lo registrado, línea por línea, con un enlace de vuelta a cada paso. El calendario empieza vacío y lo dice: se llena poniendo comidas, y eso se hace cuando se sabe qué se quiere comer. Se puede terminar y completar las preparaciones después.

Eran siete. Los dos que se fueron —*«¿cuánto se compra al mes?»* y *«cómo se reparte entre las dos quincenas»*— pedían un número que la casa no tiene por qué saber, y lo pedían justo después de marcar los alimentos: quien marcaba ciento cincuenta se encontraba con ciento cincuenta casillas de cantidad antes de poder terminar. El reparto entre quincenas no desapareció de la app; está en *Más → Ajustes → Organización de compra* para quien lo quiera.

El recorrido está también en *Más → Organizar mi casa*. Ya no se planta delante de la primera pantalla, y volver a pasar por él no borra nada: lo ya guardado aparece marcado, lo que una pantalla no pregunta no lo toca, y los cambios de cada mes ni se rozan.

## Mis productos habituales

Un **catálogo de nombres agrupados por rubro**: todo lo que normalmente se compra en esa casa —plátanos, arroz, huevos, salami, jamón, atún, tortillas de maíz, queso—. Se escribe una vez y sirve para no tener que acordarse de todo de cero cada vez que se escribe una lista.

**No lleva cantidades del mes.** La cantidad se decide en el supermercado, delante del estante, y se escribe en la lista de esa compra. Un alimento habitual sin ninguna cantidad es un alimento habitual perfectamente válido, y así entran todos los del recorrido inicial.

Hubo cantidades mensuales, y siguen guardadas en los teléfonos que las escribieron: eran la base de la compra calculada. **Ya no se usan para nada.** Se conservan como historial —con la fecha desde la que valía cada una— y no se piden en ningún sitio. Lo que sigue tal cual es cuándo cambia el hábito de la casa:

> «Ahora nuestra situación mejoró y vamos a consumir cangrejo todos los meses.»

Aparte están los **cambios de este mes**: añadir algo solo para ese mes, cambiar una cantidad, quitar algo temporalmente. Al añadir o cambiar algo desde la planificación mensual, la app pregunta:

- `Solo este mes`
- `Desde ahora, todos los meses`

Editar dentro de *Mis productos habituales* es permanente. Editar dentro de un mes vale solo para ese mes, con la opción secundaria de *Guardar también como habitual*.

**Por dentro, un mes guarda diferencias, no una copia.** En una versión antigua cada mes guardaba su lista completa, y eso tenía dos consecuencias malas: entrar en un mes escribía datos sin que nadie lo pidiera, y un extra de octubre podía acabar pareciendo parte del hábito. Hoy entrar en un mes no escribe nada, y un producto añadido solo para octubre **no** vuelve a aparecer en noviembre. Su identidad sí se conserva, porque puede estar atada a compras, revisiones e inventario: para el usuario aparece como **«extra de octubre»**, no como una entrada de un catálogo global.

Pasar un cambio a habitual es siempre **explícito y por alimento**. Es lo que separa «este mes compré más pollo» de «en esta casa ahora se come más pollo».

**Cada línea guarda su historia, no una cantidad.** «Noventa tazas de arroz desde julio, ciento veinte desde septiembre» son dos tramos de la misma línea, y cada mes lee el que le tocaba. Se escribió así cuando la app calculaba la compra, porque corregir hoy una cantidad cambiaba también lo que la app decía de julio, y julio ya se compró. La estructura se conserva —los datos están ahí y la migración no los toca— aunque hoy no alimente ninguna cuenta.

En la práctica:

- Corregir una cantidad **vale desde el mes en curso**. Los meses que ya pasaron se quedan con lo que se compró entonces.
- Si lo que pasó es que estaba **mal escrito**, la app lo ofrece justo después de guardar: «corregir también los meses anteriores». Alcanza hasta donde empezó el dato equivocado, y ni un mes más.
- Se puede fechar hacia adelante: «desde noviembre son 120». Este mes no cambia, y la lista lo enseña como lo que viene.
- **Quitar algo también lleva fecha.** Dejar de comprar pollo desde hoy no borra los meses en que sí se compró.


## Planificar a mano

La pantalla de *Plan mensual* tiene dos caras. El **resumen** dice cuánto hay decidido, qué falta, qué días no se cocina en casa y quién no come. El **calendario** es el mes entero, y cada comida se toca para cambiarla.

Poner una comida es elegir el día y el momento. Para no tener que tocar treinta casillas hay **una sola ayuda**, y no adivina nada:

> **Poner una comida en varios días** → una preparación → en qué comida del día → se marcan los días.

Se marcan los siete de la semana que viene, o los catorce de las dos siguientes —hay atajos para las dos cosas—, o los tres viernes que viene tu mamá. Se ponen esos días y **ninguno más**: no se guarda ninguna costumbre y no vuelve a ejecutarse nunca. Todo se puede deshacer.

Las cinco casillas del día son desayuno, merienda de mañana, almuerzo, merienda de tarde y cena. **Las dos meriendas son opcionales**: no cuentan como hueco y un día sin merienda está completo igual. Hay casas que no meriendan y decirles que les falta algo sería reprocharles una costumbre que no tienen.

Una preparación se guarda una vez y se reutiliza cualquier día sin volver a escribirla. Guarda su nombre, en qué momentos suele comerse y una nota para quien cocina. Los alimentos que lleva son **opcionales** —sirven para avisar de una restricción— y sus cantidades también. Las porciones no se piden.

### Meses de 28, 29, 30 y 31 días

Los días salen del **calendario real del mes**: no se dan 28 ni 30 por supuestos, y ningún día 29, 30 o 31 se queda fuera. Febrero de año bisiesto incluido.

### Comidas fuera de casa

Cada comida puede estar en uno de cuatro estados: **en casa**, **fuera**, **pediremos comida**, o **todavía no sabemos**. Marcar una comida fuera la deja **resuelta**: no cuenta como pendiente y se ve en el calendario. Se puede marcar una comida suelta, un día entero, o varios días a la vez con la misma ventana de arriba.

### De dónde vino cada comida

Cada comida del calendario dice quién la puso. Hoy solo hay dos respuestas —*Cambio manual*, *Excepción*—, pero se conservan otras tres —*Rutina*, *Mes anterior*, *Sugerida*— porque hay comidas guardadas con ellas en teléfonos reales, de cuando la app llenaba el calendario sola. Borrarlas dejaría a esas comidas sin poder decir de dónde vinieron.

## La compra

Una lista para **un viaje al colmado**, no un inventario. La app no sabe lo que
queda en la despensa y no lo calcula: decide la persona.

*Preparar la compra* enseña tus productos habituales agrupados por rubros, con
buscador. Se toca uno, se dice cuánto llevar **esta vez** —«maíz en lata → 2
latas»— y entra en la lista. Que algo esté entre los habituales no significa que
hoy haga falta: el catálogo está ahí para no tener que acordarse de todo, no
para llenar la lista solo. También se puede apuntar algo que no está en la
lista, y entonces pregunta si es solo de esta compra o pasa a las de siempre.

*Mi lista* pone lo pendiente arriba. Un toque marca comprado, la línea se tacha
y baja al final; se puede desmarcar. Si la lista pedía 2 latas y solo había 1,
se anota 1 comprada y queda 1 pendiente. Al terminar se guarda con su fecha, lo
que se pidió y lo que se trajo, y se abre una lista nueva vacía para el próximo
viaje. Mensual, quincenal o un viaje extra a media semana: no hay que esperar a
que toque.

### Lo que la app dejó de hacer

Hubo una versión que calculaba la compra:

> lo que tu casa consume al mes + lo que cambia este mes − lo que ya queda en casa

Con su libro de existencias, su pantalla de «¿cuánto queda?» y su cálculo desde
el menú. Se retiró entero. Obligaba a mantener un inventario al día para que la
cuenta saliera, y una casa no lleva inventario: mira la nevera y decide.

Lo que se escribió con aquella versión **no se borró**. El historial se lee tal
cual, con un aviso encima que dice lo que es: cantidades anotadas entonces, que
no dicen lo que hay hoy en la despensa. La pantalla de las revisiones viejas
sigue accesible y en solo lectura; unir dos alimentos repetidos y corregir un
conteo a mano siguen existiendo dentro de *Funciones avanzadas*, porque quien
tenga aquellos datos puede necesitar arreglarlos.


### Una sola puerta de salida a la red

La app tiene exactamente un destino: el proyecto de Supabase que presta el servicio de cuentas. Nada más. No hay analítica, ni informes de fallos, ni SDK de terceros, ni ninguna dirección que se pueda configurar. `tests/seguridad.test.js` falla si aparece una segunda salida o si cambia la dirección de esta.

**Sin sesión iniciada esa puerta ni se abre.** Al arrancar, la app mira si hay una sesión guardada en el teléfono y, si no la hay, se detiene ahí sin tocar la red: quien no crea cuenta usa la app entera en modo avión. Crear la cuenta es una decisión, y subir los datos de la casa a ella es otra distinta, con su propio interruptor; las dos vienen apagadas.

Hubo un asistente que entendía frases —«pon tortillas los lunes de desayuno»— y un dictado por micrófono. Los dos se retiraron con la reestructura, y con ellos el complemento nativo de reconocimiento y el permiso `RECORD_AUDIO`: **la app ya no pide el micrófono**. Los campos de texto siguen admitiendo el teclado del teléfono, que trae su propio micrófono; eso lo pone el teclado y no esta app.

Antes de aquello hubo incluso una opción para conectar un servidor propio de modelo. Se quitó porque no llegaba a funcionar y porque obligaba a escribir en la política de privacidad un «salvo que tú configures un servidor» que dejaba la promesa en manos de una casilla que nadie entendía.

### Qué protege esta app, y qué no

No hay servidor propio ni pagos, y la cuenta la opera Supabase con la contraseña cifrada fuera del alcance de la app: buena parte del catálogo habitual de ataques no tiene dónde agarrarse. Lo que sí tiene superficie es el HTML que se dibuja con texto del usuario, dentro de un WebView que lleva al lado el puente de Capacitor. Por eso todo texto se escapa antes de llegar a la pantalla, y `tests/seguridad.test.js` mete un ataque en cada campo escribible y dibuja las 22 pantallas comprobando que no sale sin escapar en ninguna.

Además: el respaldo automático de Android está **apagado** (`allowBackup="false"` y `dataExtractionRules`), porque encendido sube el almacenamiento de la app a la cuenta de Google del dueño. La contrapartida es que perder el teléfono sin copia es perderlo todo, así que la app avisa en «Más» cuando hace más de un mes que no guardas una.

La política de contenido de `index.html` bloquea scripts de otros sitios, `eval` y cualquier salida a un `http://`. **No es una muralla**, y el comentario del archivo lo dice: `script-src` lleva `'unsafe-inline'` a la fuerza porque Capacitor inyecta su puente como script en línea y sin eso la app no arranca dentro del APK.

Lo que ninguna app puede evitar: que alguien coja el teléfono desbloqueado, o que el teléfono esté rooteado. Contra eso protege el PIN. Cifrar el almacenamiento sería teatro: la clave tendría que viajar dentro del propio APK.

## Respaldos y migración

Sin cuenta, los datos se guardan en `localStorage` **solo en ese navegador y dispositivo**. Con cuenta y con el interruptor de sincronizar encendido, suben al servidor para poder bajarlos en otro teléfono; las dos cosas vienen apagadas. *Más → Respaldo* escribe un JSON; traerlo de vuelta reemplaza los datos actuales.

El esquema va por la **versión 10**. Un respaldo de cualquier versión anterior se convierte al importarlo y al cargarlo, en cadena. Cada paso está escrito y comentado en `src/migrate.js`; estos son los dos primeros y el último:

- **v1 → v2.** Los productos pasan a la ficha de catálogo. La categoría queda en «otros» y el origen en «manual»: **no se adivinan**, porque adivinar llenaría la app de etiquetas que nadie eligió.
- **v2 → v3.** La canasta base pasa a ser **la canasta habitual**. Cada mes que tuviera canasta propia se convierte en **diferencias** contra ella: lo que tenía otra cantidad queda como cambio, lo que no estaba en la base queda como extra, lo que faltaba queda como quitado, y lo que era idéntico **no se guarda** —porque no era una excepción—. No se inventan rutinas a partir del historial. Las facturas guardadas salen del estado vivo; siguen en el respaldo previo.
- **v9 → v10.** Se cae el andamio de la conversión anterior. Aquella les puso a las reglas hermanas un `grupoId` para recordar que se habían escrito de una sentada, porque las pantallas de entonces las enseñaban juntas. Ahora se añade, se edita, se pausa y se borra **una regla cada vez**, así que el campo no lo lee nadie y se quita. No se pierde nada: no decía qué preparación, ni qué momento, ni qué días —eso lo dice la regla—, solo con cuáles se había tecleado a la vez.
- **v8 → v9.** La app deja de calcular la compra y pasa a ayudar a decidir la comida. Cada línea de la canasta dice a qué **rubro** pertenece y su cantidad deja de ser obligatoria —la que hubiera escrita se conserva con sus fechas, porque con ella se calcularon compras que ya se cerraron—. Una **regla de repetición** pasa a unir una preparación con **un** momento: las que cubrían varios se parten en una por momento y las comidas que habían puesto se reasignan a la que les toca por su momento. Y aparece dónde guardar las **listas de compra**, que nacen vacías: una lista es una salida concreta al supermercado, no un inventario, y las compras ya anotadas son historial.

El respaldo de los datos de prueba de antes de esa conversión está congelado en `tests/fixtures/`, con su huella en `SUMAS-v8.txt`. Se comprueba desde fuera con `sha256sum -c SUMAS-v8.txt` y desde dentro con `tests/respaldo-v8.test.js`, que además exige que migrarlo no pierda ni un registro.

Compras, revisiones, correcciones, preparaciones, personas, planes, ausencias, identificadores y el contador de secuencia se conservan intactos. La migración es **idempotente**: ejecutarla dos veces da exactamente lo mismo.

**Se migra primero y se valida después.** Si la conversión dejara algo incoherente, se rechaza y lo guardado **no se toca**. Antes de escribir la versión nueva, la anterior se copia a `que-comemos-antes-de-migrar`: ocupa el doble durante una temporada, y perder la despensa de una casa cuesta más.

Actualizar el APK conserva los datos: es el mismo almacenamiento. **Desinstalar y reinstalar los borra** — guarda una copia antes.

## Abrirla en el celular

El servidor escucha en todas las interfaces, así que otro equipo de la red puede abrirla en `http://IP-DE-TU-PC:PUERTO`. Windows pregunta la primera vez si permite conexiones entrantes.

Sobre `http` en una IP local el navegador **no** considera el sitio contexto seguro: no registra el trabajador de servicio, así que no hay instalación ni modo sin conexión. Para eso hace falta **https**; el manifiesto, el ícono y el trabajador ya están listos.

### Publicar en GitHub Pages

Todas las rutas son relativas, así que funciona igual desde la raíz de un dominio o desde `usuario.github.io/que-comemos/`. El archivo `.nojekyll` evita que GitHub procese los archivos.

```powershell
git remote add origin https://github.com/USUARIO/que-comemos.git
git push -u origin main
```

Luego `Settings → Pages`, rama `main`, carpeta raíz. Con el plan gratuito, Pages solo funciona en repositorios públicos: el código queda a la vista, los datos de la casa no —cada navegador guarda los suyos.

### Compilar el APK

El APK no depende de ningún dominio ni de internet: los archivos viajan adentro. Hace falta instalar dos cosas que no vienen con Node:

```powershell
winget install EclipseAdoptium.Temurin.21.JDK
winget install Google.AndroidStudio
```

Abre Android Studio una vez para que descargue el SDK, y ciérralo. Después, **la primera vez**, instala el andamiaje de Capacitor, que es lo que envuelve la app web dentro del APK:

```powershell
npm install
npm run android
cd android
.\gradlew assembleDebug
```

El archivo queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

La primera compilación tarda bastante más, porque Gradle baja sus dependencias. Las siguientes van rápido.

#### Si Gradle falla con «Unable to establish loopback connection»

No es Gradle ni es el proyecto: es la carpeta temporal de Windows. Java abre su canal interno con un **socket de dominio Unix** creado en `%TEMP%`, y en algunas máquinas ese `connect` devuelve `Invalid argument` aunque el controlador `afunix` esté activo y el socket se cree bien. El síntoma engaña, porque `gradlew --version` funciona —no necesita ese canal— y solo falla al compilar de verdad.

Se comprueba en diez segundos: si `Selector.open()` revienta con el temporal por defecto y funciona apuntando a otra carpeta, es esto. La solución es decirle a Java dónde poner ese socket:

```powershell
mkdir C:\gtmp
$env:GRADLE_OPTS = '-Djdk.net.unixdomain.tmpdir=C:\gtmp'
.\gradlew assembleDebug
```

Cambiar `TEMP` y `TMP` a una ruta corta también sirve. Lo que **no** sirve es `java.io.tmpdir`: esa propiedad no controla dónde se crea ese socket, y es el primer sitio donde uno mira.

Para no repetirlo en cada sesión, ponlo en las variables de entorno del usuario, o en `android/gradle.properties` con `org.gradle.jvmargs` —pero ojo, esa ruta es de tu máquina y no debería viajar en el repositorio.

El APK bajó de golpe al quitar la lectura de facturas: los modelos de OCR de ML Kit pesaban unos 10 MB por arquitectura y ya no viajan dentro.

`npm run android` copia el casco web a `www/` y lo lleva al proyecto de Android. **Hay que ejecutarlo después de cada cambio**: el APK no se actualiza solo. Está firmado con la clave de depuración; para Play Store hacen falta una clave propia y `assembleRelease`.

Dentro del APK la app no registra el trabajador de servicio: los archivos ya están en el dispositivo y un caché viejo podría seguir mostrando la versión anterior.

### Publicar en Play Store

Play Store no acepta APK desde 2021: pide un **AAB**, y reparte por dispositivo. Cada usuario descarga solo su arquitectura, así que el peso deja de ser un problema — el AAB universal ronda los 27 MB y lo que se descarga es bastante menos.

Tres cosas hacen falta, y dos ya están montadas.

**1. La clave de firma (la tienes que crear tú).** Copia `android/keystore.properties.example` a `android/keystore.properties` y sigue las instrucciones de dentro. En resumen:

```powershell
cd android
keytool -genkeypair -v -keystore que-comemos.jks -alias que-comemos -keyalg RSA -keysize 2048 -validity 10000
```

**Google no deja cambiar esa clave una vez publicada la primera versión.** Si pierdes el `.jks` o su contraseña, no puedes volver a actualizar tu propia app: hay que publicarla de cero con otro identificador, y quien ya la tenía no recibe la actualización. Guarda una copia en un sitio que sobreviva a que se te dañe la computadora.

El `.jks` y el `keystore.properties` están en `.gitignore`. Si el archivo no existe la compilación sigue funcionando, y solo deja el paquete sin firmar: así nadie que clone el proyecto se queda sin poder compilar por no tener una clave que no debería tener.

**2. Minificación: ya activada.** `minifyEnabled` y `shrinkResources` quitan el código y los recursos que nadie usa. `android/app/proguard-rules.pro` conserva a mano lo que se resuelve por reflexión —los complementos de Capacitor y el puente con el WebView—: si el minificador los borrara, el fallo no aparecería al compilar sino al abrir la app ya publicada.

Se usa `proguard-android.txt` y no la variante `-optimize` a propósito: optimizar reordena código y esta app está llena de cosas que se buscan por su nombre. El ahorro extra no compensa el riesgo.

**3. Sube la versión en cada publicación.** `versionCode`, en `android/app/build.gradle`, tiene que crecer con cada subida; Play Store rechaza un número repetido.

```powershell
npm run android
cd android
.\gradlew bundleRelease
```

El `.aab` queda en `android/app/build/outputs/bundle/release/`.

**Antes de publicar, prueba el release en un teléfono de verdad.** Un fallo de minificación solo aparece ahí, nunca al compilar: `.\gradlew assembleRelease` e instala ese APK.

## Línea gráfica

El isotipo es un anillo abierto por abajo con un signo de pregunta dentro y el punto en la abertura. El original vive en `identidad visual/isotipo.png` y es la única fuente: todo lo demás se genera con `npm run brand`, que escribe diecisiete archivos. **No hay ninguna versión redibujada a mano, y no la debe haber**: el trazo del signo es orgánico y a cualquier reconstrucción con arcos se le nota.

Por eso la marca viaja como imagen y no como SVG. Si aparece el vector original conviene sustituirlo. Mientras tanto, `tools/brand-assets.js` rasteriza cada tamaño desde el original de 1080 px.

En la cabecera la marca va suelta, sin recuadro, al lado del nombre. El fondo crema lleno queda solo para los íconos de la app.

La tipografía es **Montserrat** y viaja dentro del proyecto, en `src/fonts/`. Cargarla desde Google Fonts ataba la app a tener internet, que es justo lo que no queremos dentro del APK.

La identidad usa **terracota** (`#A04B22`) para navegación y acciones, **crema** (`#FBF7F1`) de fondo, **tinta oscura** (`#342A24`) para el texto y **salvia** (`#5F6947`) solo para estados favorables. La intención es evocar una mesa familiar y mantener la lectura tranquila.

Esta elección es una hipótesis de diseño, no una afirmación de que un color provoque hambre o funcione igual para todas las familias. Un [experimento con etiquetas alimentarias](https://pubmed.ncbi.nlm.nih.gov/23444895/) encontró que el verde puede sugerir salud; esa no es la función de esta app. Un [estudio de asociaciones entre color y emoción](https://doi.org/10.1002/col.22171) vinculó naranjas y amarillos con emociones relativamente positivas. Otro [experimento](https://doi.org/10.1007/s00426-017-0880-8) mostró que saturación y brillo influyen junto con el matiz, y un [estudio en 30 países](https://www.psychologicalscience.org/journals/psychological-science/0956797620948810/) encontró diferencias culturales. Por eso el acento cálido es moderado. La pareja terracota/blanco tiene un contraste de 5,96:1, por encima del [mínimo WCAG AA de 4,5:1](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
## Límites de esta versión

- **La sincronización entre dispositivos está sin probar en uso real.** El código de la cuenta y del sincronizado existe y tiene pruebas, pero nadie lo ha usado todavía con dos teléfonos de verdad. Viene apagada.
- **La lectura de facturas por fotografía se eliminó.** No funcionaba lo bastante bien y arrastraba los modelos de OCR dentro del APK. Con ella se fueron el complemento de cámara, el de sistema de archivos, el de reconocimiento de texto y los permisos de cámara y de galería.
- **La app no propone nada.** No elige platos, no copia semanas, no repite comidas y no rellena meses. Si el calendario está vacío es porque nadie lo ha llenado, y así se queda.
- **La pantalla del mes sigue siendo mensual.** La decisión de producto es planificar una semana o dos; la ventana de «poner en varios días» ya deja marcar siete o catorce, pero la vista de semana propiamente dicha está pendiente.
- Las cantidades habituales de Familia son un dato de consulta y no se aplican solas: hay que pedirlas, y lo que traen es la suma de las personas que la preparación cubre, sin ajustar por quién falta ese día.
- El grosor de rueda es una etiqueta, no un factor: cambiarlo no recalcula ninguna equivalencia guardada.
- Los tramos de los productos habituales guardan desde cuándo vale cada cantidad, y nada más.
- Las equivalencias no se infieren y las unidades incompatibles no se convierten. Sin la equivalencia, la compra avisa de que la lista está incompleta en vez de dar un número equivocado.
- La lista de la compra no mira ningún período: es la de este viaje al colmado.
- **Las reglas antiguas se conservan como dato y no las enseña ninguna pantalla.** Están en el respaldo y en la migración; decidir si se muestran o se borran es de una fase siguiente.
- **La app no tiene voz propia.** Se retiraron el asistente, el chat y el dictado, con el complemento nativo de reconocimiento y el permiso `RECORD_AUDIO`. Los campos de texto siguen admitiendo el micrófono del teclado del teléfono, que no es cosa de esta app.
- Los alimentos creados desde los habituales o desde un texto nacen sin cantidad y sin existencias, que es lo correcto: la app no lleva la cuenta de lo que hay en casa.

## Estructura del proyecto

**Dominio (puro, sin DOM ni almacenamiento — por eso las pruebas corren en Node a secas)**

- `src/model.js` — reglas de catálogo, productos habituales, cambios del mes, menú, listas de compra y el historial del inventario retirado. También el calendario: los días de la semana, el progreso de un mes y las fechas reales de cada mes. `transaction()` da el todo-o-nada que usan las uniones de alimentos.
- `src/nombres.js` — normalización y parecido de nombres. Vive aparte porque lo necesitan el modelo, la migración (que no puede importar el modelo sin crear un ciclo) y la entrada de texto de corrido.
- `src/migrate.js` — conversión entre versiones del esquema. No importa el modelo a propósito: una migración tiene que poder leer datos cuyas reglas ya no son las de hoy.
- `src/text-parse.js` — el intérprete de español dominicano que separa una lista escrita de corrido. Determinista, sin red.
- `src/catalog-seed.js` — los productos dominicanos con sus alias.

**Interfaz**

- `src/app.js` — el armazón: estado, navegación, ventanas y reparto de eventos. Las pantallas viven en sus propios archivos.
- `src/page-mes.js` — Plan mensual: el resumen, el calendario y la ventana de poner una comida en varios días.
- `src/page-compra.js` — la compra.
- `src/page-mas.js` — «Más» y sus pantallas: productos habituales, preparaciones, familia, alimentos, historial, respaldo y ajustes.
- `src/ui-kit.js` — escapado, formato y los envoltorios de HTML que se repiten. Aquí y no en `app.js` porque los módulos de pantalla también los necesitan, y tener dos versiones de `esc` es la forma más fácil de que a una se le olvide escapar algo.
- `src/setup.js` — «Organizar mi casa».
- `src/bulk-entry.js` — escribir varios alimentos de corrido.
- `src/storage.js` — lectura y escritura locales, con la migración y su respaldo previo.
- `src/onboarding.js` — texto de la bienvenida y del recorrido. **Se dibuja con `esc()`: no admite etiquetas HTML.**
- `src/demo.js` — datos de ejemplo: una casa con doce días planificados a mano, sus productos habituales sin cantidades y una lista de compra a medio escribir.

**Estilos.** Se cargan en orden y las reglas posteriores ganan a igual especificidad: `styles.css` → `sidebar.css` → `onboarding.css` → `quick-add.css` → `calendar.css` → `theme.css` → `setup.css` → `bulk.css` → `plan.css` → `cuenta.css` → `hogar.css` → `sistema.css`. `quick-add.css` documenta el reparto de capas: barra inferior 20, botón **+** 25, modal 30, recorrido 35, aviso 50.

**Empaquetado.** `build.js` copia el casco a `www/` — es todo el «build» que hay. `sw.js` guarda ese casco para abrir sin conexión; **si añades un archivo a `src/`, añádelo a su lista y sube la versión del caché**. Hay una prueba que lo comprueba. `capacitor.config.json` y `android/` son el envoltorio nativo.

**Pruebas.** `tests/` — modelo, productos habituales, migración, parser, pantallas, seguridad y módulos. `tests/respaldo-v10.test.js` abre una casa congelada de la versión 10 del esquema —con sus reglas antiguas, sus comidas y su período cerrado— y comprueba que no se pierde un solo registro y que **ninguna regla vuelve a poner una comida**. `tests/modules.test.js` es la red de seguridad del refactor: lee las importaciones de cada módulo y comprueba que apuntan a algo que existe, carga cada módulo de verdad en Node, y verifica que no queda ningún nombre del modelo anterior ni ningún resto de la lectura de facturas ni de la voz.

**No queda ninguna dependencia de producción.** La última era el complemento de reconocimiento de voz, y se fue con el dictado. `npm start` y `npm test` funcionan sin instalar nada; `npm install` solo hace falta para compilar el APK, y lo que instala es el andamiaje de Capacitor.

```powershell
npm install    # solo antes de compilar el APK por primera vez
```
