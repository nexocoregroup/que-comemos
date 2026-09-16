# ¿Qué comemos?

Aplicación local para organizar las comidas de una casa y calcular la compra. Los datos viven en el dispositivo y la app funciona entera sin cuenta y sin conexión: sin sesión iniciada no hace ni una llamada a la red. La cuenta es opcional —sirve para recuperar la casa al cambiar de teléfono— y subir los datos a ella es una segunda decisión aparte, con su propio interruptor; las dos vienen apagadas. La interfaz y los datos de demostración están en español dominicano. Las cantidades del ejemplo son datos de prueba, no recomendaciones nutricionales.

**La regla que gobierna el diseño:** lo habitual se escribe **una sola vez**. Cada mes empieza ya preparado y el usuario solo registra las excepciones. Marcar «Arroz» en el catálogo inicial lo registra como alimento y lo pone en la canasta habitual; guardar «mangú con salami, martes y jueves de desayuno» llena todos los martes y jueves reales del mes de una vez.

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
- **Plan mensual** — la pantalla principal. El progreso del mes, las rutinas de la casa y el recorrido de «Preparar este mes».
- **Compra** — una sola lista, una sola cuenta.
- **Más** — todo lo demás, ordenado por la frecuencia real con que hace falta: mi canasta habitual, preparaciones, familia y restricciones, revisar lo que queda, alimentos de la casa, historial, respaldo y ajustes.

El botón **+** tiene cuatro acciones, no once: poner una comida, hablar o dictar, anotar una compra, añadir un alimento.

En computadora, el botón ☰ junto al título retrae o muestra el menú lateral. En celular el menú está oculto: ☰ arriba a la izquierda lo abre y ‹ lo cierra.

## Organizar mi casa

La primera apertura enseña una sola promesa —*organiza una vez lo habitual de tu casa y prepara cada mes cambiando solamente lo diferente*— y un botón: **Organizar mi casa**. Hay un enlace discreto para ver un ejemplo, que no compite con él.

Son cuatro pasos, y se pueden abandonar y retomar:

1. **¿Qué se consume normalmente en tu casa?** Un catálogo de **productos dominicanos** por categorías, con buscador. Es un punto de partida, no una lista completa: *¿No encuentras un alimento? Añadirlo* está siempre a la vista. Nada se marca solo.
2. **¿Falta algo habitual de tu casa?** Lo que no estaba en la lista, escrito o dictado de corrido: *«Tortillas de maíz, queso gouda, jamón de pavo y yogurt de fresa»*. La app lo separa en filas para revisar. No se abre un formulario por producto.
3. **Las cantidades.** Todos los alimentos elegidos en **una sola pantalla editable**. La cantidad puede quedar vacía: el alimento se guarda igual y queda pendiente. Aquí **no** se piden equivalencias, grosores de rueda, existencias iniciales ni unidades de compra; eso se pregunta cuando hace falta de verdad, al confirmar una compra.
4. **Preparar mi primer menú mensual.** Guardar las comidas que se repiten y elegir qué días suelen prepararse, para que la app llene el calendario real del mes.

El recorrido guiado, ahora de cuatro pasos, está en *Más → Ajustes → Cómo funciona*. Ya no se planta delante de la primera pantalla.

## Una sola canasta, y los cambios del mes

Para el usuario existe **una** canasta permanente: **Mi canasta habitual**. Es todo lo que normalmente se compra en esa casa —plátanos, arroz, huevos, salami, jamón, atún, tortillas de maíz, queso—. Se escribe una vez, se usa automáticamente todos los meses y solo se toca cuando el hábito de la casa cambia de verdad:

> «Ahora nuestra situación mejoró y vamos a consumir cangrejo todos los meses.»

Aparte están los **cambios de este mes**: añadir algo solo para ese mes, cambiar una cantidad, quitar algo temporalmente. Al añadir o cambiar algo desde la planificación mensual, la app pregunta:

- `Solo este mes`
- `Desde ahora, todos los meses`

Editar dentro de *Mi canasta habitual* es permanente. Editar dentro de un mes vale solo para ese mes, con la opción secundaria de *Guardar también como habitual*.

**Por dentro, un mes guarda diferencias, no una copia.** En la versión anterior cada mes guardaba su lista completa, y eso tenía dos consecuencias malas: abrir un mes escribía datos sin que nadie lo pidiera, y un extra de octubre podía acabar pareciendo parte del hábito. Ahora abrir un mes no escribe ninguna canasta, y un producto añadido solo para octubre **no** vuelve a aparecer en noviembre. Su identidad sí se conserva, porque puede estar atada a compras, revisiones e inventario: para el usuario aparece como **«extra de octubre»**, no como una entrada de un catálogo global.

Pasar un cambio a habitual es siempre **explícito y por alimento**. Es lo que separa «este mes compré más pollo» de «en esta casa ahora se come más pollo».

**Cada línea de la canasta guarda su historia, no una cantidad.** «Noventa tazas de arroz desde julio, ciento veinte desde septiembre» son dos tramos de la misma línea, y cada mes lee el que le tocaba. Antes había una sola cantidad: corregirla hoy cambiaba también lo que la app decía de julio, y julio ya se compró. Con eso, la pantalla que existe para acordarte de lo que hiciste distinto —«Y en la compra cambia esto»— era precisamente la que no podía verlo, porque al recalcular el mes anterior con la cantidad de hoy los dos meses salían iguales.

En la práctica:

- Corregir una cantidad **vale desde el mes en curso**. Los meses que ya pasaron se quedan con lo que se compró entonces.
- Si lo que pasó es que estaba **mal escrito**, la app lo ofrece justo después de guardar: «corregir también los meses anteriores». Alcanza hasta donde empezó el dato equivocado, y ni un mes más.
- Se puede fechar hacia adelante: «desde noviembre son 120». Este mes no cambia, y la canasta lo enseña como lo que viene.
- **Quitar algo también lleva fecha.** Dejar de comprar pollo desde hoy no borra los meses en que sí se compró.

## Rutinas: la idea central

Organizar un mes tocando noventa y tres casillas no lo hace nadie, y por eso nadie lo hacía. La unidad de trabajo ya no es la casilla: es la costumbre.

> Plátano maduro con huevo · desayuno · lunes, miércoles, viernes y sábado · todo el mes

Con una sola acción se llenan todos esos desayunos. Al guardar una rutina se elige:

- **Qué**: una preparación, «comemos fuera» o «pedimos comida».
- **En qué comida**: desayuno, almuerzo, cena, o varias.
- **Qué días de la semana**: los siete, como fichas que se tocan.
- **Cuáles de esos días**: todos, o solo el 1.º y 3.º, o el 2.º y 4.º.
- **Hasta cuándo**: solo este mes, o desde ahora todos los meses.
- **Y si ese día ya tenía algo**: dejarlo como está, o reemplazarlo —con confirmación.

El *1.º y 3.º* es el ordinal de ese día de la semana **dentro del mes**, no la semana del calendario. Así «primer y tercer domingo, almuerzo fuera» cae siempre donde debe, sean las fechas que sean.

Al editar una comida que viene de una rutina, la app pregunta **¿qué quieres cambiar?**: solo esta fecha, esta y todas las siguientes, o toda la rutina. Suponerlo destruiría el trabajo de alguien sin avisar.

Toda aplicación masiva se puede **deshacer**.

### Meses de 28, 29, 30 y 31 días

Las fechas salen del **calendario real del mes**. No se copia por número de día, no se cubren solo los primeros 28, y ningún día 29, 30 o 31 se queda fuera. Febrero de 28 y febrero de 29 en año bisiesto están cubiertos y comprobados: hay una verificación a fuerza bruta sobre 108 meses (2024–2032, 3288 fechas) que confirma que los siete días de la semana cubren cada mes entero, sin huecos ni repeticiones.

### Apertura automática de un mes

Entrar por primera vez en un mes nuevo no enseña un calendario en blanco. La app aplica la canasta habitual, aplica las rutinas permanentes sobre las fechas reales del mes, y avisa:

> Octubre está preparado con la rutina habitual de tu casa. Revisa lo que será diferente este mes.

Lo que **no** hace: copiar las excepciones del mes anterior, ni los cumpleaños, ni las salidas puntuales. Esas fueron decisiones de aquel mes. Si el mes anterior se organizó a mano y sin rutinas, se ofrece **Usar el patrón del mes pasado**, que copia **por día de la semana** —el lunes 5 de octubre va al lunes 2 de noviembre—, no por número de fecha.

Abrir un mes es idempotente: entrar dos veces no duplica nada, y nunca toca la canasta habitual.

## Comidas fuera de casa

Cada comida puede estar en uno de cuatro estados: **en casa**, **fuera**, **pediremos comida**, o **todavía no sabemos**. Marcar una comida fuera la deja **resuelta**: no cuenta como pendiente, se ve en el calendario y no genera alimentos en los cálculos que salen del menú.

Se puede aplicar a una comida, a un día entero, a todos los domingos, al primer y tercer domingo, al segundo y cuarto, o a cualquier combinación de días de la semana; y valer solo para ese mes o guardarse como rutina permanente. Si normalmente comen fuera el primer y tercer domingo pero este mes también salen el cuarto, ese cuarto domingo se marca como excepción **sin alterar la rutina**.

## Preparar este mes

La pantalla de *Plan mensual* abre con el progreso, el desglose por comida y dos botones: **Preparar este mes** y **Ver calendario**. El recorrido de preparar son cinco pantallas cortas, una pregunta cada una:

1. **Lo que se repite** — comprobar las rutinas, o crear la primera.
2. **Comidas fuera** — los atajos de domingos y viernes, y los días sueltos.
3. **Lo que falta** — solo los huecos, no las noventa y tres casillas. Lo que se deje en blanco sigue ahí mañana.
4. **La compra del mes** — qué será diferente este mes.
5. **Listo** — «Tu mes está organizado», con el resumen: comidas en casa, fuera, pendientes y cambios en la compra.

## La compra

Una sola pantalla y una sola cuenta:

> lo que tu casa consume al mes + lo que cambia este mes − lo que ya queda en casa

La versión anterior abría con tres botones —Menú, Canasta base, Este mes— y obligaba a elegir una «base de cálculo» antes de ver un solo alimento. Eso es una pregunta de programador.

Cada línea dice de dónde sale: de siempre, con la cantidad cambiada este mes, o extra de este mes. Debajo, plegados, quedan lo que ya alcanza en casa, lo que se anota a mano sin seguimiento —detergente, servilletas— y el historial.

Calcular **desde el menú** sigue existiendo, dentro de *Opciones avanzadas* y con su explicación al lado: suma los alimentos de las comidas planificadas, lo que es más exacto para quien planifica comida por comida y peor si deja huecos. **Las dos cuentas no se suman nunca**: el mismo arroz saldría contado dos veces, una por estar en la canasta y otra por estar dentro de una preparación.

Las comidas fuera de casa afectan al cálculo que sale del menú, porque esas comidas no tienen alimentos. Al calcular desde la canasta **se avisan pero no se descuentan**: almorzar fuera dos domingos no hace que la casa gaste menos detergente, y recortar «a ojo» dejaría la compra corta.

## La revisión: ¿cuánto queda?

La pregunta es **¿cuánto queda?**, no «¿cuánto se consumió?». La diferencia parece pequeña y no lo es: lo primero se contesta abriendo la nevera y mirando; lo segundo obliga a recordar toda la semana y a restar de cabeza. La app hace la resta:

> Había 8 plátanos. Quedan 2. Se consumieron 6.

Se puede revisar solo lo relevante, buscar un alimento, guardar a medias, terminar, corregir después y dictar varias cantidades de corrido. Quien prefiera el método de antes tiene el interruptor de arriba.

No ocupa una pestaña principal: aparece como tarea del día en *Hoy* y en *Compra* el día que toca, configurable en *Más → Ajustes*.

## Lo que mueve y lo que no mueve el inventario

El inventario es un **libro de movimientos**, no un número que se edita. Lo mueven tres cosas y solo tres: las **compras confirmadas** (suman), las **revisiones confirmadas** (restan) y las **correcciones de conteo** (ajustan en cualquier dirección).

Planificar comidas no descuenta nada. La lista sugerida no cambia nada. Abrir un mes no cambia nada. Eso es lo que permite corregir una revisión vieja y que todos los saldos posteriores se recalculen solos.

## El asistente

Es una comodidad, no un requisito: todo lo que hace se puede hacer a mano desde las pantallas. Entiende frases como «pon tortillas con jamón y queso todos los lunes, miércoles y viernes de desayuno», «este mes no comeremos en casa ningún domingo» o «quedan dos plátanos, diez huevos y media libra de queso».

Antes de tocar nada muestra una pantalla que dice **«Entendí lo siguiente»**: cada acción por separado, con sus cantidades, nombres y fechas reales, y una línea que dice hasta dónde llega —un día, un mes, o desde ahora y todos los meses— con los días concretos que toca. De ahí salen tres caminos: **Confirmar**, **Corregir** —que devuelve la frase al campo para arreglarle lo que esté mal, sin volver a dictarla entera— y **Cancelar**.

Se confirma **todo lo que cambia datos**, sin excepción. Antes se confirmaba solo lo amplio y el resto se hacía enseñando un «deshacer». Con el teclado delante eso casi funciona, porque quien escribe ve lo que escribió; dictando no, porque entre lo que alguien dice y lo que la app entendió hay un paso que nadie ve. Deshacer sirve para arrepentirse, no para enterarse. Consultar no cambia nada y por eso no se confirma.

Lo que la frase no dijo se pregunta, y solo eso: «todos los viernes» no elige por su cuenta entre cuatro días y para siempre. Lo que la frase sí dijo no se vuelve a preguntar. Y las dudas que solo se descubren intentándolo —«ya tienes algo parecido», «no hay preparaciones de cena»— salen **antes** de la confirmación, porque descubrirlas después de que alguien diga que sí convierte la confirmación en un trámite que no significa nada.

Lo que no hace nunca: ejecutar código, escribir directamente en el almacenamiento, inventar alimentos o cantidades, cambiar rutinas permanentes en silencio, confundir «este mes» con «todos los meses», pisar comidas existentes sin confirmar, ni **tocar un período ya cerrado** —eso se lee tal como quedó; para corregirlo hay que reabrirlo a mano desde Más → Historial—.

## Dictar: lo hace el teléfono

El reconocimiento de voz es el de Android, **dentro del aparato**. No hace falta cuenta, ni clave, ni servidor, y no cuesta dinero.

Este fue un error de diseño corregido: la primera versión mandaba la voz a un servidor que el usuario tenía que montar. Una casa corriente no despliega un servidor, y pedirlo convertía una función útil en una que nadie iba a usar.

**Lo que la app no promete:** que funcione sin conexión en cualquier teléfono. El reconocimiento local depende del aparato y del paquete de idioma instalado, así que se comprueba de verdad con `isOnDeviceRecognitionAvailable()` antes de decirlo. Donde no exista, Android usa su ruta de siempre, que sí necesita conexión, y la app lo dice.

*Más → Ajustes → Detalle técnico de este aparato* enseña qué complemento tiene ese teléfono y cuál no. Es lo que permite resolver un «no me funciona» sin tener el teléfono delante.

Escribir a mano funciona siempre, en todos los campos, con o sin micrófono.

### Una sola puerta de salida a la red

La app tiene exactamente un destino: el proyecto de Supabase que presta el servicio de cuentas. Nada más. No hay analítica, ni informes de fallos, ni SDK de terceros, ni ninguna dirección que se pueda configurar. `tests/seguridad.test.js` falla si aparece una segunda salida o si cambia la dirección de esta.

**Sin sesión iniciada esa puerta ni se abre.** Al arrancar, la app mira si hay una sesión guardada en el teléfono y, si no la hay, se detiene ahí sin tocar la red: quien no crea cuenta usa la app entera en modo avión. Crear la cuenta es una decisión, y subir los datos de la casa a ella es otra distinta, con su propio interruptor; las dos vienen apagadas.

Hubo además una opción para conectar un servidor propio de modelo y que la asistente entendiera lenguaje totalmente libre. Se quitó por dos razones. La primera es que **no llegaba a funcionar**: la interfaz guardaba la dirección sin activar la capacidad, así que quien la escribía no conseguía nada y no sabía por qué. La segunda es que obligaba a escribir en la política de privacidad un «salvo que tú configures un servidor» que dejaba la promesa en manos de una casilla que nadie entendía.

Lo que queda es más honesto y más simple: la app reconoce las formas de frase que reconoce, aquí dentro, y **lo que no entiende lo dice** en vez de mandarlo fuera. Para lenguaje realmente libre haría falta un modelo grande, que no cabe en la aplicación.

### Qué protege esta app, y qué no

No hay servidor propio ni pagos, y la cuenta la opera Supabase con la contraseña cifrada fuera del alcance de la app: buena parte del catálogo habitual de ataques no tiene dónde agarrarse. Lo que sí tiene superficie es el HTML que se dibuja con texto del usuario, dentro de un WebView que lleva al lado el puente de Capacitor. Por eso todo texto se escapa antes de llegar a la pantalla, y `tests/seguridad.test.js` mete un ataque en cada campo escribible y dibuja las 22 pantallas comprobando que no sale sin escapar en ninguna.

Además: el respaldo automático de Android está **apagado** (`allowBackup="false"` y `dataExtractionRules`), porque encendido sube el almacenamiento de la app a la cuenta de Google del dueño. La contrapartida es que perder el teléfono sin copia es perderlo todo, así que la app avisa en «Más» cuando hace más de un mes que no guardas una.

La política de contenido de `index.html` bloquea scripts de otros sitios, `eval` y cualquier salida a un `http://`. **No es una muralla**, y el comentario del archivo lo dice: `script-src` lleva `'unsafe-inline'` a la fuerza porque Capacitor inyecta su puente como script en línea y sin eso la app no arranca dentro del APK.

Lo que ninguna app puede evitar: que alguien coja el teléfono desbloqueado, o que el teléfono esté rooteado. Contra eso protege el PIN. Cifrar el almacenamiento sería teatro: la clave tendría que viajar dentro del propio APK.

## Respaldos y migración

Los datos se guardan en `localStorage` **solo en ese navegador y dispositivo**, sin sincronización. *Más → Respaldo* escribe un JSON; traerlo de vuelta reemplaza los datos actuales.

El esquema va por la **versión 3**. Un respaldo de la versión 1 o de la 2 se convierte al importarlo y al cargarlo, en cadena:

- **v1 → v2.** Los productos pasan a la ficha de catálogo. La categoría queda en «otros» y el origen en «manual»: **no se adivinan**, porque adivinar llenaría la app de etiquetas que nadie eligió.
- **v2 → v3.** La canasta base pasa a ser **la canasta habitual**. Cada mes que tuviera canasta propia se convierte en **diferencias** contra ella: lo que tenía otra cantidad queda como cambio, lo que no estaba en la base queda como extra, lo que faltaba queda como quitado, y lo que era idéntico **no se guarda** —porque no era una excepción—. No se inventan rutinas a partir del historial. Las facturas guardadas salen del estado vivo; siguen en el respaldo previo.

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

Abre Android Studio una vez para que descargue el SDK, y ciérralo. Después, **la primera vez**, instala el complemento nativo de voz, que es el que mete el reconocimiento de Android dentro del APK:

```powershell
npm install
npm run android
cd android
.\gradlew assembleDebug
```

El archivo queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

La primera compilación tarda bastante más, porque Gradle baja las bibliotecas de voz. Las siguientes van rápido.

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
- Una rutina reparte por día de la semana. No sabe de feriados, de visitas ni de que en diciembre se come distinto: eso se resuelve como excepción del mes.
- Las cantidades habituales de Familia no se aplican solas: hay que pedirlas, y lo que traen es la suma de las personas que la preparación cubre, sin ajustar por quién falta ese día.
- El grosor de rueda es una etiqueta, no un factor: cambiarlo no recalcula ninguna equivalencia guardada.
- La canasta se reparte por días del período y nada más.
- Las equivalencias no se infieren y las unidades incompatibles no se convierten. Sin la equivalencia, la compra avisa de que la lista está incompleta en vez de dar un número equivocado.
- La lista para un período futuro usa las existencias de hoy hasta que registres consumo real.
- El dictado es de la **aplicación instalada**; en el navegador se usa el del navegador, que necesita conexión.
- El reconocimiento de voz dentro del aparato depende del teléfono y del paquete de idioma. La app lo comprueba antes de prometerlo.
- El asistente entiende frases por su forma. Para lenguaje totalmente libre haría falta un modelo que no cabe en la aplicación.
- Los alimentos creados desde la canasta o desde un texto **nacen con cero existencias**: la primera lista de compra pedirá de más si ya tenías cosas en casa. Se arregla con una corrección de conteo.

## Estructura del proyecto

**Dominio (puro, sin DOM ni almacenamiento — por eso las pruebas corren en Node a secas)**

- `src/model.js` — reglas de catálogo, canasta habitual, cambios del mes, menú, compras, revisiones e inventario por movimientos. `transaction()` da el todo-o-nada que usan el asistente y las uniones.
- `src/routines.js` — las rutinas de comida y el calendario real de cada mes: qué fechas cumplen una regla, aplicar una rutina, abrir un mes, copiar el patrón del mes anterior y medir el progreso. Importa el modelo; el modelo no lo importa a él, para no crear un ciclo.
- `src/nombres.js` — normalización y parecido de nombres. Vive aparte porque lo necesitan el modelo, la migración (que no puede importar el modelo sin crear un ciclo) y la entrada de texto de corrido.
- `src/migrate.js` — conversión entre versiones del esquema. No importa el modelo a propósito: una migración tiene que poder leer datos cuyas reglas ya no son las de hoy.
- `src/text-parse.js` — el intérprete de español dominicano. Determinista, sin red.
- `src/assistant.js` — la tabla de acciones permitidas, su validación y su ejecución transaccional.
- `src/catalog-seed.js` — los productos dominicanos con sus alias.

**Interfaz**

- `src/app.js` — el armazón: estado, navegación, ventanas y reparto de eventos. Las pantallas viven en sus propios archivos.
- `src/page-mes.js` — Plan mensual: el resumen, el calendario, las rutinas y el recorrido de preparar el mes.
- `src/page-compra.js` — la compra.
- `src/page-mas.js` — «Más» y sus pantallas: canasta habitual, preparaciones, familia, revisión, alimentos, historial, respaldo y ajustes.
- `src/ui-kit.js` — escapado, formato y los envoltorios de HTML que se repiten. Aquí y no en `app.js` porque los módulos de pantalla también los necesitan, y tener dos versiones de `esc` es la forma más fácil de que a una se le olvide escapar algo.
- `src/setup.js` — «Organizar mi casa».
- `src/chat-ui.js` — el asistente y su intérprete local.
- `src/bulk-entry.js` — escribir o dictar varios alimentos.
- `src/device.js` — el puente con el reconocimiento de voz del teléfono. No importa ni un paquete de npm: Capacitor deja los complementos en `window.Capacitor.Plugins` y se leen de ahí, que además es la comprobación de disponibilidad más honesta que hay.
- `src/storage.js` — lectura y escritura locales, con la migración y su respaldo previo.
- `src/onboarding.js` — texto de la bienvenida y del recorrido. **Se dibuja con `esc()`: no admite etiquetas HTML.**
- `src/demo.js` — datos de ejemplo, con dos rutinas y un extra del mes para que se vea la idea.

**Estilos.** Se cargan en orden y las reglas posteriores ganan a igual especificidad: `styles.css` → `sidebar.css` → `onboarding.css` → `quick-add.css` → `calendar.css` → `theme.css` → `setup.css` → `chat.css` → `bulk.css` → `plan.css`. `quick-add.css` documenta el reparto de capas: barra inferior 20, botón **+** 25, modal 30, recorrido 35, aviso 50.

**Empaquetado.** `build.js` copia el casco a `www/` — es todo el «build» que hay. `sw.js` guarda ese casco para abrir sin conexión; **si añades un archivo a `src/`, añádelo a su lista y sube la versión del caché**. Hay una prueba que lo comprueba. `capacitor.config.json` y `android/` son el envoltorio nativo.

**Pruebas.** `tests/` — modelo, canastas, rutinas, migración, asistente, parser, dictado, pantallas, seguridad y módulos. `tests/modules.test.js` es la red de seguridad del refactor: lee las importaciones de cada módulo y comprueba que apuntan a algo que existe, carga cada módulo de verdad en Node, y verifica que no queda ningún nombre del modelo anterior ni ningún resto de la lectura de facturas.

La única dependencia nativa es el complemento de reconocimiento de voz, y **solo hace falta para compilar el APK**: mete código nativo dentro de la aplicación. La app web no importa ninguno, así que `npm start` y `npm test` siguen funcionando sin instalar nada.

```powershell
npm install    # solo antes de compilar el APK por primera vez
```
