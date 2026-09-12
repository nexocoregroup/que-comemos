# ¿Qué comemos?

Aplicación web local para planificar desayuno, almuerzo y cena, calcular compras según el menú y registrar el consumo real de la casa. La interfaz y los datos de demostración están en español. Las cantidades del ejemplo son datos de prueba, no recomendaciones nutricionales.

## Ejecutar

Necesitas Node.js 20.11 o posterior. No hay dependencias que instalar.

```powershell
cd "C:\Users\Jose Manuel Diaz\Documents\Proyectos NexoCore\Claude\que-comemos"
npm start
```

Abre [http://localhost:4173](http://localhost:4173) en ese mismo equipo. Para usar otro puerto en PowerShell:

```powershell
$env:PORT=4174
npm start
```

En computadora, el botón ☰ junto al título retrae o muestra el menú lateral. En celular, el menú está oculto por defecto: toca ☰ arriba a la izquierda para abrirlo y ‹ para cerrarlo. Las cuatro secciones principales siguen disponibles abajo. Para comprobar el diseño desde una computadora, abre las herramientas de desarrollo del navegador, activa el modo dispositivo (`Ctrl+Shift+M`) y elige un ancho cercano a 390 px.

## Abrirla en el celular

El servidor escucha en todas las interfaces, así que otro equipo de la misma red puede abrirla en `http://IP-DE-TU-PC:PUERTO`. La primera vez, Windows pregunta si permite que Node acepte conexiones entrantes; hay que decir que sí para la red privada.

Sobre `http` en una IP de la red local el navegador **no** considera el sitio un contexto seguro: no registra el trabajador de servicio, así que no hay instalación ni modo sin conexión. El celular puede añadir un acceso directo a la pantalla de inicio, pero abre dentro del navegador y necesita la computadora encendida.

Para instalarla de verdad —ícono propio, sin barra del navegador y funcionando sin conexión— hay que servirla por **https**. El manifiesto, el ícono y el trabajador de servicio ya están listos: en cuanto la app viva en un dominio con https, Chrome en Android ofrece **Instalar aplicación**. Para un `.apk` firmado se envuelve esa misma app instalada con Bubblewrap o una Trusted Web Activity.

Cada dispositivo guarda sus propios datos: la computadora y el celular no comparten nada. Para pasar los datos de uno a otro, exporta el respaldo e impórtalo del otro lado.

### Publicar en GitHub Pages

Todas las rutas del proyecto son relativas, así que la app funciona igual servida desde la raíz de un dominio o desde una subcarpeta como `usuario.github.io/que-comemos/`. El archivo `.nojekyll` evita que GitHub procese los archivos antes de servirlos.

Crea un repositorio vacío en GitHub, súbelo y activa Pages desde `Settings → Pages`, eligiendo la rama `main` y la carpeta raíz:

```powershell
git remote add origin https://github.com/USUARIO/que-comemos.git
git push -u origin main
```

Con el plan gratuito de GitHub, Pages solo funciona en repositorios públicos. El código queda a la vista, pero no los datos de la casa: cada navegador guarda los suyos y nunca salen del dispositivo.

### Compilar el APK

El proyecto lleva un envoltorio de Capacitor que mete la app dentro de una aplicación de Android. El APK resultante no depende de ningún dominio ni de que haya internet: los archivos viajan adentro.

Hace falta instalar dos cosas que no vienen con Node:

```powershell
winget install EclipseAdoptium.Temurin.21.JDK
winget install Google.AndroidStudio
```

Abre Android Studio una vez para que descargue el SDK, y cierra. Después, desde la carpeta del proyecto:

```powershell
npm run android
cd android
.\gradlew assembleDebug
```

El archivo queda en `android/app/build/outputs/apk/debug/app-debug.apk`. Pásalo al celular y ábrelo; Android pedirá permiso para instalar desde esa fuente.

`npm run android` hace dos cosas: `build.js` copia el casco web a `www/`, y `cap sync` lo lleva dentro del proyecto de Android. Hay que ejecutarlo después de cada cambio en la app; el APK no se actualiza solo.

El APK está firmado con la clave de depuración que genera Android. Sirve para instalarlo en casa, pero no para publicarlo en Play Store: eso pide una clave propia y `assembleRelease`.

Una excepción a lo de «no necesita internet»: **Montserrat se carga de Google Fonts**. Sin conexión la app abre y funciona igual, solo cambia la letra por la del sistema. Para que sea completamente autónoma habría que guardar la tipografía dentro del proyecto.

Dentro del APK la app no registra el trabajador de servicio: los archivos ya están en el dispositivo, y un caché viejo podría seguir mostrando la versión anterior después de actualizar.

## Línea gráfica

El isotipo es un plato abierto con un signo de pregunta dentro y el punto en la boca del plato. Vive en dos formas: `src/logo.svg`, el ícono terracota con el signo en crema que se usa como favicon, y `src/brand.js`, el mismo trazo sin fondo que hereda el color de su contenedor y se inserta en la cabecera de la barra lateral y del móvil. Al cambiar la geometría hay que tocar los dos archivos.

La tipografía es **Montserrat**, cargada desde Google Fonts en `index.html`. Sin conexión el navegador usa el respaldo de sistema declarado en `src/theme.css`; la app sigue funcionando, solo cambia la letra. Montserrat es más ancha que la pila anterior, así que `theme.css` suaviza el interletrado negativo de los títulos y recorta el de las etiquetas en mayúscula.

La identidad usa **terracota anaranjada** (`#A04B22`) para navegación y acciones, **crema** (`#FBF7F1`) como fondo, **tinta oscura** (`#342A24`) para el texto y **salvia** (`#5F6947`) solo para estados favorables de existencias o revisión. La intención es evocar una mesa familiar y mantener la lectura tranquila durante la planificación diaria. Los colores de advertencia y error conservan un significado distinto.

Esta elección es una hipótesis de diseño, no una afirmación de que un color provoque hambre o funcione igual para todas las familias. Un [experimento con etiquetas alimentarias](https://pubmed.ncbi.nlm.nih.gov/23444895/) encontró que el verde puede sugerir salud; esa no es la función principal de esta app. Un [estudio de asociaciones entre color y emoción](https://doi.org/10.1002/col.22171) vinculó los naranjas y amarillos con emociones relativamente positivas. Otro [experimento](https://doi.org/10.1007/s00426-017-0880-8) mostró que saturación y brillo influyen junto con el matiz, y un [estudio en 30 países](https://www.psychologicalscience.org/journals/psychological-science/0956797620948810/) encontró diferencias culturales. Por eso el acento cálido es moderado y se usa con fondos claros. Para la legibilidad, la pareja terracota/blanco tiene una relación de contraste de 5,96:1, por encima del [mínimo WCAG AA de 4,5:1 para texto normal](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Los tonos están centralizados en `src/theme.css` para poder ajustarlos tras probarlos en casa.

Para ejecutar las pruebas:

```powershell
npm test
```

## Cómo empezar

La primera apertura muestra una **pantalla de bienvenida** con dos caminos: **Ver el ejemplo**, que carga datos de demostración identificados con un aviso, o **Empezar desde cero**, que deja la app vacía. Los dos abren un **recorrido de nueve pasos** que lleva la app a cada sección mientras la explica, para que se vea la pantalla real detrás de la tarjeta. Cubre las siete pantallas y la diferencia entre unidad de control y unidad de compra. Se salta con **Saltar** o con la tecla Escape, y se vuelve a abrir desde **Productos y datos → Cómo funciona**.

La bienvenida solo aparece mientras no haya nada guardado en este navegador. Con los datos de demostración puedes probar la preparación de hoy, una porción reservada para mañana, las compras y una revisión de consumo. Para pasar a tus datos, usa **Borrar ejemplos** y confirma. Antes de borrar o cambiar de navegador, usa **Productos y datos → Exportar respaldo**.

1. En **Productos y datos**, crea alimentos con su unidad de control y de compra. Configura equivalencias solo cuando las conozcas; por ejemplo, cuántas ruedas de salami contiene un paquete.
2. En **Personas**, agrega quiénes comen en casa, restricciones, cantidades habituales y ausencias por fecha y comida.
3. En **Preparaciones**, guarda comidas habituales con alimentos principales, cantidades, personas cubiertas, variantes y notas.
4. En **Menú**, asigna comidas, cambia cantidades por fecha, mueve o copia, repite una semana o genera una propuesta mensual. Puedes marcar comidas fuera de casa, pedidos y comidas sin planificar. Para cocinar una vez y servir después, abre una comida y usa **Reservar para otra comida**.
5. En **Compras**, elige quincena o fechas, revisa la lista sugerida y confirma la compra real con las cantidades adquiridas. La sugerencia no aumenta las existencias. Los productos de **Otros productos que faltan** son una lista manual aparte.
6. En **Revisión**, abre una revisión: la tabla carga los productos disponibles automáticamente. Escribe cuánto se consumió, incluso **0** cuando no hubo consumo. Puedes guardar pendiente, confirmar, corregir una revisión confirmada o corregir el conteo de existencias.

El menú **no descuenta existencias**. Solo las compras confirmadas, revisiones confirmadas y correcciones modifican los saldos. Una preparación compartida se cuenta en la fecha en que se prepara; la parte reservada no vuelve a contarse al servirla. Cuando faltan comidas o equivalencias, Compras muestra avisos de lista incompleta.

## Almacenamiento y límites de esta versión

Los datos se guardan en `localStorage` **solo en ese navegador y dispositivo**. La app funciona en pantallas de celular, pero **no sincroniza** datos entre dispositivos. Exporta un JSON como respaldo e impórtalo desde Productos y datos para recuperarlos. Importar reemplaza los datos locales actuales. No hay cuentas ni servidor de datos.

La propuesta mensual usa reglas de repetición sencillas y solo preparaciones del catálogo. Puede dejar comidas sin opción compatible. Las cantidades habituales de Personas son referencias editables; no se aplican automáticamente a una preparación. Las equivalencias no se infieren y las unidades incompatibles no se convierten. La lista sugerida para un período futuro usa las existencias actuales hasta que registres consumo real mediante una revisión.

## Estructura para continuar el desarrollo

- `src/model.js`: datos y reglas de menú, equivalencias, compras e inventario por movimientos.
- `src/demo.js`: datos de ejemplo.
- `src/storage.js`: lectura y escritura local.
- `src/app.js`: pantallas e interacciones.
- `src/styles.css`: diseño adaptable.
- `src/sidebar.css`: menú lateral plegable y panel móvil.
- `src/theme.css`: colores, tipografía y acabados de la identidad visual.
- `src/brand.js`: isotipo en línea para las cabeceras.
- `src/logo.svg`: isotipo con fondo, usado como favicon.
- `src/onboarding.js`: texto de la bienvenida y de los pasos del recorrido.
- `src/onboarding.css`: bienvenida y tarjeta del recorrido.
- `manifest.webmanifest`: nombre, ícono y modo de la app instalada.
- `sw.js`: trabajador de servicio; guarda el casco para abrir sin conexión.
- `src/icon-192.png`: ícono de la app, rasterizado desde `logo.svg`. Para tamaños mayores el manifiesto usa el propio SVG, que el navegador escala sin perder nitidez.
- `build.js`: copia el casco web a `www/` para empaquetarlo. Es todo el «build» que hay.
- `capacitor.config.json`: identificador y nombre de la aplicación de Android.
- `android/`: proyecto nativo generado por Capacitor. Solo está retocado el ícono, que es un vector con las mismas curvas de `logo.svg`, y el color de la pantalla de arranque. Si lo regeneras con `npx cap add android` pierdes esos dos cambios.

Las únicas dependencias del proyecto son las de Capacitor, y solo sirven para compilar el APK. La app web no usa ninguna: `npm start` y `npm test` funcionan sin instalar nada.
- `tests/model.test.js`: pruebas de reglas centrales.
- `server.js`: servidor estático local sin dependencias.

Para añadir cuentas y sincronización más adelante, sustituye `src/storage.js` por un adaptador de API y conserva las reglas de `src/model.js` con pruebas. El formato actual del respaldo es `version: 1`; una futura migración deberá leer esa versión antes de cambiar la estructura.
