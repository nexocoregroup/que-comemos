# ¿Qué comemos?

Aplicación local para organizar las comidas de una casa y calcular la compra. Los datos viven en el dispositivo; no hay cuentas ni servidor. La interfaz y los datos de demostración están en español dominicano. Las cantidades del ejemplo son datos de prueba, no recomendaciones nutricionales.

**La regla que gobierna el diseño:** una información se escribe **una sola vez** y la app la reutiliza donde haga falta. Marcar «Arroz» en el catálogo inicial lo registra en el catálogo, lo pone en la canasta base y lo pone en la canasta del mes. Tres sitios, un toque.

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

En computadora, el botón ☰ junto al título retrae o muestra el menú lateral. En celular el menú está oculto: ☰ arriba a la izquierda lo abre y ‹ lo cierra. Las cuatro secciones principales siguen abajo.

## Preparar mi casa

La primera apertura ofrece dos caminos. **Ver el ejemplo** carga datos de demostración con su aviso y abre el recorrido. **Empezar desde cero** abre **Preparar mi casa**, un proceso de cinco pasos que se puede abandonar y retomar en cualquier momento; también está siempre en *Ajustes → Preparar mi casa*.

1. **La casa.** Cuántos adultos y cuántos niños. Los nombres y lo que cada quien evita son opcionales y no detienen nada. Una restricción se puede escribir por nombre aunque ese alimento todavía no exista: queda pendiente y se enlaza sola en cuanto aparezca.
2. **Por dónde empezar.** Cuatro vías, todas disponibles: elegir de una lista *(recomendada)*, dictar o escribir la compra, fotografiar facturas, o empezar a mano.
3. **Los alimentos.** Un catálogo de **166 productos dominicanos** en catorce categorías, con buscador. Nada se marca solo: el catálogo no llena la despensa, solo ahorra escribir los nombres. **Marcar los más habituales** selecciona de golpe los de una categoría.
4. **Las cantidades.** Todos los alimentos elegidos en **una sola pantalla editable**, no un formulario por alimento. La cantidad se puede dejar vacía: el alimento se guarda igual y queda pendiente.
5. **El resultado.** La canasta escrita y la compra de la primera quincena, sin haber creado una sola persona, preparación ni comida del menú.

El recorrido guiado de doce pasos sigue disponible en *Ajustes → Cómo funciona*.

## Las dos canastas

Esta es la distinción central de la aplicación.

**La canasta base** es el hábito: lo que la casa consume en un mes corriente. Se escribe una vez y se reutiliza. Cada línea lleva su cantidad, su unidad y con qué frecuencia falta (nunca falta / casi siempre / de vez en cuando).

**La canasta de cada mes** es lo que pasa ese mes en concreto. Nace como **copia** de la base al abrirla, y a partir de ahí las dos viven separadas:

- Quitar el atún de septiembre **no** lo quita del hábito ni de octubre.
- Agregar algo extraordinario en septiembre **no** aparece en octubre.
- Cambiar la base **no** reescribe los meses ya abiertos: un mes cerrado se queda como quedó.
- Pasar un cambio del mes a la base es siempre **explícito y por alimento**, desde *Ver y pasar a la base*. Es lo que separa «este mes compré más pollo» de «en esta casa ahora se come más pollo».

Cada mes guarda su lista completa, no las diferencias. Las diferencias se calculan comparando; guardarlas ataría el pasado a una base que todavía puede cambiar.

En pantalla, las líneas que se apartan de la base se marcan: *«este mes 99 lb, normalmente 12 lb»*.

## Cuatro formas de meter datos

El botón **+** flotante está en Hoy, Menú, Compras y Revisión. Arriba, las cuatro formas de meter muchas cosas de una vez; lo de siempre —un formulario por concepto— queda en **Más opciones**.

### Dictar o escribir varios productos

Acepta un párrafo de corrido y lo separa en filas revisables:

> Compramos 30 plátanos maduros, 10 libras de arroz, 4 paquetes de salami, 30 huevos, 6 latas de atún y detergente.

→ seis filas, con *detergente* conservado y marcado **pendiente de cantidad** en vez de descartado.

El intérprete es **100 % determinista y funciona sin conexión**: entiende números en dígitos y en palabras, fracciones (*media docena* → 6), los sinónimos dominicanos de cada unidad (*funda*, *lonja*, *rodaja*), convierte kilos y onzas a libras avisando de que convirtió, y distingue cuándo una « y » separa dos productos de cuándo forma parte del nombre (*arroz y habichuelas* no se parte). Lo que no entiende lo deja **pendiente**; nunca inventa una cantidad.

Antes de guardar siempre hay una pantalla de revisión: nombre, cantidad, unidad, categoría y qué hacer con cada fila (incluir, crear nuevo, unir con uno existente, ignorar). Si algo se parece a un producto que ya existe, la fila lo dice y propone unirlos.

Hay un botón de micrófono: en la app instalada usa el reconocimiento de Android, **dentro del aparato y sin conexión**; en el navegador usa el del navegador, que sí pasa por sus servidores y la app lo avisa. Lo dictado se **añade** a lo que ya hubiera escrito, para poder dictar en varias tandas, y **no se ejecuta solo**: queda en el campo para leerlo y corregirlo antes de enviar.

### El asistente

Conversación por texto, en las cuatro pantallas principales. Entiende sin conexión un conjunto definido de frases: *«agrega 12 libras de arroz a la canasta»*, *«registra que compré ocho plátanos»*, *«de los ocho plátanos quedan dos»*, *«cuánto queda de arroz»*, *«qué falta para la compra»*, *«Sofía no puede comer maní»*, *«Sofía no cena en casa mañana»*, *«qué se cocina mañana»*, *«este mes no compres atún»*. Para frases libres hace falta un servicio configurado (ver más abajo).

Arquitectura, que es donde está lo importante:

- **Lista blanca.** Solo existen las acciones de la tabla de `src/assistant.js`. No hay forma de pedir «ejecuta esto» ni de escribir en el almacenamiento.
- **No se confía en ningún identificador que venga de fuera.** Un alimento se resuelve por nombre o alias contra el catálogo real. Si el nombre encaja con dos, **no se adivina**: se devuelve una pregunta con las opciones.
- **Todo pasa por las mismas funciones que usan los formularios**, dentro de una transacción. Si una acción de un grupo falla, no queda nada a medias: ni siquiera las que habían salido bien.
- **Idempotencia.** Cada mensaje lleva su identificador; mandar dos veces «compré ocho plátanos» deja ocho, no dieciséis.
- **Confirmación previa** para todo lo que toca el inventario, borra o reescribe: se enseña en español, con nombres y cantidades reales. *«Registrar una compra de 8 unidades de Plátano maduro. Esto aumentará tus existencias.»* Nunca el JSON.
- **Deshacer** en todo lo reversible, y un registro de actividad en español.

Al asistente en la nube se le manda **solo** los nombres de alimentos, personas y preparaciones, y el mes actual. Nunca existencias, compras ni revisiones.

### Fotos de facturas

Se fotografían facturas de meses anteriores para **aprender la canasta**, no para tocar el inventario. El sistema busca lo que se repite entre facturas, dice en cuántas apareció cada alimento y propone una cantidad mensual usando la **mediana** —no la media, porque una compra grande puntual no debe inflar el hábito—. Toda cantidad exige confirmación.

Una factura antigua **nunca** modifica las existencias de hoy. Si es reciente, la app pregunta expresamente si se usa solo para aprender o también se registra como compra. Por defecto: solo aprender.

Las líneas se revisan siempre antes de guardar, con el texto tal como salió impreso a la vista (`PLAT MAD 6 UND`) para poder comprobar la lectura. Una lectura de confianza baja se resalta y nunca arranca marcada para incluir.

**La lectura la hace el teléfono**, con ML Kit dentro del aparato: sin servidor, sin clave y sin que la foto salga de ahí. El texto crudo que devuelve lo interpreta `src/receipt-parse.js`, que conoce cómo son los tiques dominicanos —precios al final, `2 X SALAMI`, `ARROZ SELECTO 5LB`, el ITBIS y el total que no son productos—.

**En el navegador esto no existe**: es de la aplicación instalada. Ahí la pantalla lo dice y ofrece escribir o dictar las líneas.

### A mano

Todos los formularios de siempre siguen intactos, en **Más opciones** y en sus pantallas.

## La revisión: ¿cuánto queda?

El modo normal pregunta **cuánto queda**, que es lo que se puede mirar abriendo la nevera, y la app calcula el consumo. *Había 8 → quedan 2 → se consumió 6.* El interruptor de arriba cambia a **lo consumido** para quien prefiera el método anterior.

Un campo vacío es «todavía no lo he mirado», no «no queda nada»: queda **pendiente**. El 0 hay que escribirlo. Si dices que queda más de lo que la app tiene contado, no se descuenta nada: se avisa y se ofrece una corrección de existencias.

## Lo que mueve y lo que no mueve el inventario

Ni el menú ni la canasta descuentan nada: los dos son previsiones. El inventario es un libro de movimientos y solo lo mueven:

- la **apertura** (lo que había al crear el alimento, se pregunta una vez),
- las **compras confirmadas** (+),
- las **revisiones confirmadas** (−),
- las **correcciones de conteo** (±).

Una preparación compartida se cuenta el día en que se prepara; la parte reservada no vuelve a contarse al servirla.

## El resto de la aplicación es opcional

Menú, preparaciones y personas están ahí, pero **no hacen falta para comprar**. Con la canasta sola la app ya sirve.

- **Personas**: quién come, qué evita, cuánto come normalmente y ausencias por fecha y comida. Se pueden registrar **aunque no haya un solo alimento creado**.
- **Preparaciones**: comidas habituales con sus alimentos, personas cubiertas y variantes. *Traer cantidades habituales* suma las de las personas que cubre y llena la lista de una vez.
- **Menú**: asignar, mover, copiar, repetir una semana o proponer un mes. Con el menú vacío se abre en vista de **semana**, no de mes: noventa casillas vacías se leen como una tarea enorme. En celular la semana es una agenda vertical y el mes reduce cada comida a su inicial. En ninguna de las dos hay que arrastrar de lado.
- **Compras**: quincena o fechas, con tres bases excluyentes (abajo).

## Las tres bases de la compra

El interruptor de Compras elige **una**, y solo una —sumarlas contaría dos veces el mismo arroz:

| Base | De dónde sale |
|---|---|
| **Menú** | Lo que piden las comidas planificadas del período |
| **Canasta base** | El hábito de la casa, prorrateado por días |
| **Este mes** | La canasta del mes que toca, prorrateada por días |

La base elegida **se conserva durante todo el flujo**: la lista sugerida, el formulario de confirmación y la compra guardada usan la misma. Cada compra deja escrito con qué base se calculó, y la pantalla de confirmación lo dice.

Un período que cruza dos meses se prorratea **por tramos**: del 28 de septiembre al 12 de octubre son 3 días de septiembre sobre 30 y 12 de octubre sobre 31, cada tramo contra la canasta de su propio mes. La pantalla desglosa el reparto.

## El catálogo de alimentos

Cada alimento tiene nombre, nombre normalizado, alias, categoría, unidad de control, unidad de compra, equivalencias, grosor cuando aplica, estado y de dónde salió (manual, catálogo, factura, asistente, compra, canasta, texto).

**Duplicados.** Al escribir un nombre parecido a uno que ya existe, la app avisa: *«Encontramos un producto parecido: "Plátano maduro". ¿Quieres usarlo o crear uno diferente?»*. «Plátano», «platano», «Plátanos» y «plátanos maduros» se reconocen como el mismo. Un mismo alimento registrado dos veces parte su inventario en dos, y eso se descubre semanas después, cuando las cuentas no cuadran.

**Archivar** esconde el alimento de los selectores sin borrar su historial: las compras y revisiones donde aparece siguen siendo ciertas.

**Unir** dos alimentos suma sus existencias y junta todo su historial. Exige que se cuenten en la **misma unidad** —sumar libras con unidades daría un número sin significado— y no se puede deshacer, así que pide confirmación escrita.

**Unidades y equivalencias.** El salami se cuenta en ruedas y se compra en paquetes: la equivalencia se escribe en la misma ficha. La app **nunca adivina** una conversión; sin la equivalencia avisa de que la lista está incompleta en vez de dar un número equivocado.

**Grosor.** Lo que se cuenta en ruedas o rebanadas lleva el grosor con que se corta en casa: fina (2–3 mm), mediana (4–5 mm), gruesa (6–8 mm). No convierte cantidades: deja escrito qué significa una rueda *aquí*, que es lo que hace comparable el conteo de una semana con el de la siguiente.

## Voz y cámara: lo hace el teléfono

Dictar y leer facturas **no necesitan servidor, ni cuenta, ni clave, ni conexión, ni cuestan dinero**. Los motores viajan dentro del APK y corren en el aparato.

| Función | Cómo | Qué necesita |
|---|---|---|
| **Dictar** en vez de escribir | Reconocimiento de voz nativo de Android | Permiso de micrófono |
| **Leer una factura** de una foto | ML Kit Text Recognition de Google, en el aparato | Permiso de cámara |

Ni la voz ni las fotos salen del teléfono. No hay nada que configurar: *Ajustes → Voz y cámara* no pide datos, **dice qué puede tu aparato en concreto**, que es la única respuesta útil cuando algo no funciona.

La primera versión de esto mandaba las dos cosas a un servidor que el usuario tenía que montar. Era un error de diseño: esta app es para una casa corriente, y una casa corriente no despliega un servidor. Pedirlo convertía dos funciones útiles en dos funciones que nadie iba a usar.

**En el navegador** el dictado usa el reconocimiento del propio navegador —que sí pasa por sus servidores, y la app lo avisa— y la lectura de facturas no existe: es de la aplicación instalada. En los dos casos queda escribir a mano, que funciona siempre.

### Lo único que sí necesitaría un servidor

**Entender frases libres.** La app reconoce sin conexión un buen puñado de frases por su forma —agregar a la canasta, registrar una compra, cuánto queda, quién no come, qué se cocina— y las va listando en la sección del asistente. Para lenguaje *totalmente* libre haría falta un modelo grande, que no cabe dentro de la aplicación.

Eso es opcional y está plegado en *Ajustes → Conectar un servicio propio*. Y si algún día se conecta, **lo natural es un solo servidor para todos los usuarios, no uno por familia**:

- `docs/backend.md` — el contrato exacto de las tres rutas, con el JSON de ida y vuelta.
- `backend/ejemplo-worker.js` — un Cloudflare Worker completo contra la API de Anthropic.
- `.env.example` — las variables, comentadas, sin secretos.

**Ninguna clave vive dentro de la aplicación.** Irían dentro del APK y cualquiera podría extraerlas. `.env` está en `.gitignore`.

## Respaldos y migración

Los datos se guardan en `localStorage` **solo en ese navegador y dispositivo**, sin sincronización. *Ajustes → Exportar respaldo* escribe un JSON; importarlo reemplaza los datos actuales.

El esquema va por la **versión 2**. Un respaldo de la versión 1 se convierte al importarlo y al cargarlo:

- Los productos pasan a la ficha de catálogo. La categoría queda en «otros» y el origen en «manual»: **no se adivinan**, porque adivinar llenaría la app de etiquetas que nadie eligió.
- La canasta que hubiera se convierte en **canasta base**, y el mes corriente se abre con una copia.
- Identificadores, referencias, existencias y el contador de secuencia se conservan intactos.

**Se migra primero y se valida después.** Si la conversión dejara algo incoherente, se rechaza y lo guardado **no se toca**. Antes de escribir la versión nueva, la anterior se copia a `que-comemos-antes-de-migrar`: ocupa el doble durante una temporada, y perder la despensa de una casa cuesta más.

Actualizar el APK conserva los datos: es el mismo almacenamiento. **Desinstalar y reinstalar los borra** — exporta un respaldo antes.

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

Abre Android Studio una vez para que descargue el SDK, y ciérralo. Después, **la primera vez**, instala los complementos nativos —voz, cámara, sistema de archivos y lectura de texto—, que son los que meten esos motores dentro del APK:

```powershell
npm install
npm run android
cd android
.\gradlew assembleDebug
```

El archivo queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

La primera compilación con los complementos tarda bastante más: Gradle baja ML Kit y las bibliotecas de cámara y voz. Las siguientes van rápido. Si el APK crece unos cuantos megas, es eso.

`npm run android` copia el casco web a `www/` y lo lleva al proyecto de Android. **Hay que ejecutarlo después de cada cambio**: el APK no se actualiza solo. Está firmado con la clave de depuración; para Play Store hacen falta una clave propia y `assembleRelease`.

Dentro del APK la app no registra el trabajador de servicio: los archivos ya están en el dispositivo y un caché viejo podría seguir mostrando la versión anterior.

## Línea gráfica

El isotipo es un anillo abierto por abajo con un signo de pregunta dentro y el punto en la abertura. El original vive en `identidad visual/isotipo.png` y es la única fuente: todo lo demás se genera con `npm run brand`, que escribe diecisiete archivos. **No hay ninguna versión redibujada a mano, y no la debe haber**: el trazo del signo es orgánico y a cualquier reconstrucción con arcos se le nota.

Por eso la marca viaja como imagen y no como SVG. Si aparece el vector original conviene sustituirlo. Mientras tanto, `tools/brand-assets.js` rasteriza cada tamaño desde el original de 1080 px.

En la cabecera la marca va suelta, sin recuadro, al lado del nombre. El fondo crema lleno queda solo para los íconos de la app.

La tipografía es **Montserrat** y viaja dentro del proyecto, en `src/fonts/`. Cargarla desde Google Fonts ataba la app a tener internet, que es justo lo que no queremos dentro del APK.

La identidad usa **terracota** (`#A04B22`) para navegación y acciones, **crema** (`#FBF7F1`) de fondo, **tinta oscura** (`#342A24`) para el texto y **salvia** (`#5F6947`) solo para estados favorables. La intención es evocar una mesa familiar y mantener la lectura tranquila.

Esta elección es una hipótesis de diseño, no una afirmación de que un color provoque hambre o funcione igual para todas las familias. Un [experimento con etiquetas alimentarias](https://pubmed.ncbi.nlm.nih.gov/23444895/) encontró que el verde puede sugerir salud; esa no es la función de esta app. Un [estudio de asociaciones entre color y emoción](https://doi.org/10.1002/col.22171) vinculó naranjas y amarillos con emociones relativamente positivas. Otro [experimento](https://doi.org/10.1007/s00426-017-0880-8) mostró que saturación y brillo influyen junto con el matiz, y un [estudio en 30 países](https://www.psychologicalscience.org/journals/psychological-science/0956797620948810/) encontró diferencias culturales. Por eso el acento cálido es moderado. La pareja terracota/blanco tiene un contraste de 5,96:1, por encima del [mínimo WCAG AA de 4,5:1](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

## Límites de esta versión

- **No sincroniza** entre dispositivos. No hay cuentas ni servidor de datos.
- La propuesta mensual usa reglas de repetición sencillas y solo preparaciones del catálogo; puede dejar comidas sin opción compatible.
- Las cantidades habituales de Personas no se aplican solas: hay que pedirlas, y lo que traen es la suma de las personas que la preparación cubre, sin ajustar por quién falta ese día.
- El grosor es una etiqueta, no un factor: cambiarlo no recalcula ninguna equivalencia guardada.
- La canasta se reparte por días y nada más: no sabe de ausencias, de visitas ni de que en diciembre se come distinto.
- Las equivalencias no se infieren y las unidades incompatibles no se convierten.
- La lista para un período futuro usa las existencias de hoy hasta que registres consumo real.
- El análisis de hábitos entre meses necesita facturas leídas y aprobadas: escribir las líneas a mano llena el catálogo y la canasta, pero no cuenta como un mes.
- La lectura de facturas y el dictado sin conexión son de la **aplicación instalada**; en el navegador no están.
- El reconocimiento de voz dentro del aparato depende del teléfono. Donde no exista, Android cae a su ruta de siempre, que sí usa conexión.
- Los alimentos creados desde la canasta o desde un texto **nacen con cero existencias**: la primera lista de compra pedirá de más si ya tenías cosas en casa. Se arregla con una corrección de conteo, o registrando la apertura al crear el alimento a mano.

## Estructura del proyecto

**Dominio (puro, sin DOM ni almacenamiento — por eso las pruebas corren en Node a secas)**

- `src/model.js` — reglas de catálogo, canastas, menú, compras, revisiones e inventario por movimientos. `transaction()` da el todo-o-nada que usan el asistente y las uniones.
- `src/nombres.js` — normalización y parecido de nombres. Vive aparte porque lo necesitan el modelo, la migración (que no puede importar el modelo sin crear un ciclo) y la lectura de facturas.
- `src/migrate.js` — conversión entre versiones del esquema. No importa el modelo a propósito: una migración tiene que poder leer datos cuyas reglas ya no son las de hoy.
- `src/text-parse.js` — el intérprete de español dominicano. Determinista, sin red.
- `src/invoices.js` — emparejamiento contra el catálogo, frecuencias entre meses y propuesta de canasta.
- `src/assistant.js` — la tabla de acciones permitidas, su validación y su ejecución transaccional.
- `src/catalog-seed.js` — los 166 productos dominicanos con sus alias, incluidas abreviaturas de factura.

**Interfaz**

- `src/app.js` — el casco: enruta pantallas, delega acciones y formularios.
- `src/ui-kit.js` — escapado, formato y los envoltorios de HTML que se repiten. Aquí y no en `app.js` porque los módulos de pantalla también los necesitan, y tener dos versiones de `esc` es la forma más fácil de que a una se le olvide escapar algo.
- `src/setup.js` — «Preparar mi casa».
- `src/chat-ui.js` — el asistente y su intérprete local.
- `src/bulk-entry.js` — escribir o dictar varios productos.
- `src/invoice-ui.js` — captura y revisión de facturas.
- `src/invoice-store.js` — las imágenes, en IndexedDB. Borrar la imagen **no** borra los productos aprobados: son datos distintos con vidas distintas.
- `src/device.js` — el puente con lo que el teléfono sabe hacer solo: voz, cámara y lectura de texto. No importa ni un paquete de npm: Capacitor deja los complementos en `window.Capacitor.Plugins` y se leen de ahí, que además es la comprobación de disponibilidad más honesta que hay.
- `src/receipt-parse.js` — convierte el texto crudo de una factura en líneas de producto. Determinista, corre en Node y por eso se puede probar sin teléfono.
- `src/providers.js` — transporte HTTP hacia el backend opcional. No sabe nada del dominio.
- `src/storage.js` — lectura y escritura locales, con la migración y su respaldo previo.
- `src/onboarding.js` — texto de la bienvenida y del recorrido. **Se dibuja con `esc()`: no admite etiquetas HTML.**
- `src/demo.js` — datos de ejemplo.

**Estilos.** Se cargan en orden y las reglas posteriores ganan a igual especificidad: `styles.css` → `sidebar.css` → `onboarding.css` → `quick-add.css` → `calendar.css` → `theme.css` → `setup.css` → `chat.css` → `bulk.css` → `invoice.css`. `quick-add.css` documenta el reparto de capas: barra inferior 20, botón **+** 25, modal 30, recorrido 35, aviso 50.

**Empaquetado.** `build.js` copia el casco a `www/` — es todo el «build» que hay. `sw.js` guarda ese casco para abrir sin conexión; **si añades un archivo a `src/`, añádelo a su lista y sube la versión del caché**. `capacitor.config.json` y `android/` son el envoltorio nativo.

**Pruebas.** `tests/` — modelo, canastas, migración, asistente, parser, facturas y proveedores.

Las dependencias son las de Capacitor y cuatro complementos nativos —voz, cámara, sistema de archivos y lectura de texto—, y **solo hacen falta para compilar el APK**: meten código nativo dentro de la aplicación. La app web no importa ninguno, así que `npm start` y `npm test` siguen funcionando sin instalar nada.

```powershell
npm install    # solo antes de compilar el APK por primera vez
```

Para añadir cuentas y sincronización, sustituye `src/storage.js` por un adaptador de API y conserva `src/model.js` con sus pruebas. Al cambiar el esquema: sube `SCHEMA_VERSION` en `src/migrate.js` y añade el paso a `STEPS`. Para un campo nuevo dentro de la misma versión basta declararlo en `OPTIONAL_V2`, o los respaldos anteriores dejan de abrir.
