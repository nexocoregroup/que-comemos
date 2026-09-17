# Entrega de las tres fases

Este documento es el cierre de las tres fases: qué se pidió, qué quedó hecho, qué
encontré roto por el camino, cómo probarlo tú mismo en local, y qué APK es la
buena.

**Versión entregada:** 3.0 (`versionCode` 5) · `com.nexocore.quecomemos`
**Pruebas:** 587, todas en verde (`node --test tests/*.test.js`)

---

## 1. Matriz de requisitos

Estado: **HECHO** · **PARCIAL** · **PENDIENTE**. La evidencia es un archivo y una
línea, o una prueba que falla si eso deja de ser verdad.

### Fase 1 — Reestructuración del producto y migración

| # | Requisito | Estado | Evidencia |
|---|---|---|---|
| 1.1 | Planes manuales por fecha y momento: desayuno, merienda de mañana, almuerzo, merienda de tarde, cena; meriendas opcionales | HECHO | `src/model.js` `SLOTS`/`MOMENTOS`; `esOpcional()`; `tests/momentos.test.js` |
| 1.2 | Una preparación se reutiliza cualquier día sin volver a registrarla; conserva nombre, momentos y nota | HECHO | `src/model.js` `makeRecipePlan`; `tests/plan-semanal.test.js` |
| 1.3 | Los alimentos de una preparación son opcionales y sirven para avisar de restricciones | HECHO | `src/avisos.js:42`; `tests/alergias.test.js` (12 pruebas) |
| 1.4 | Sin porciones ni cantidades obligatorias en una preparación | HECHO | `src/app.js` `itemRow()` no tiene campo de cantidad; `tests/sin-cantidades.test.js` |
| 1.5 | Fuera de la lógica viva: calendario mensual automático, rutinas, copia del mes anterior, sugerencias, compra calculada | HECHO | `src/page-mes.js` y `src/routines.js` borrados en la Fase 1; `tests/textos-retirados.test.js` |
| 1.6 | Los planes escritos no se borran; los anteriores siguen consultables en sus fechas | HECHO | `tests/respaldo-v10.test.js` (11 pruebas sobre una casa v10 congelada) |
| 1.7 | Una regla antigua nunca rellena días futuros | HECHO | Comprobado a mano: 12 semanas hacia adelante con la casa vieja cargada, 24 planes antes y 24 después |
| 1.8 | Productos habituales: catálogo de nombres por rubro, sin cantidad mensual | HECHO | `src/page-mas.js` `renderCanasta`; `tests/sin-cantidades.test.js` |
| 1.9 | Las cantidades de una compra concreta, separadas del dato histórico mensual | HECHO | `linea.cantidad` / `linea.comprada` en la lista; `tramos[].quantity` en la canasta, que ya no se enseña |
| 1.10 | Cuentas, sesiones, familia, sincronización y respaldos se conservan | HECHO | `src/sesion.js`, `src/sincronizar.js`, `src/page-cuenta.js` intactos |
| 1.11 | Migraciones seguras e idempotentes | HECHO | Migrar dos veces el respaldo congelado da JSON idéntico; `tests/migrate.test.js` |
| 1.12 | Fuera el asistente, el chat, el dictado y el diagnóstico de micrófono | HECHO | Archivos borrados en la Fase 1; `tests/seguridad.test.js` |
| 1.13 | El APK no trae el complemento de reconocimiento ni pide `RECORD_AUDIO` | HECHO | `AndroidManifest.xml` declara solo `INTERNET`; comprobado en el APK firmado |

### Fase 2 — Experiencia principal y planificación manual

| # | Requisito | Estado | Evidencia |
|---|---|---|---|
| 2.1 | Cinco secciones exactas, en orden: Hoy · Plan semanal · Compra · Mis productos habituales · Preparaciones | HECHO | `src/app.js` `NAV`; `tests/pages.test.js` |
| 2.2 | Sin «Más» y sin «Plan mensual» | HECHO | `tests/textos-retirados.test.js` |
| 2.3 | Productos y Preparaciones abren sus pantallas existentes, sin copias | HECHO | Las dos entran por `renderMas`, el mismo módulo de siempre |
| 2.4 | Engranaje visible que abre Ajustes, en móvil y en escritorio | HECHO | `src/app.js` `engranaje()`; comprobado a 375 px y en escritorio |
| 2.5 | Ajustes agrupa los seis destinos pedidos | HECHO | `src/page-mas.js` `renderAjustes`; `tests/pages.test.js` |
| 2.6 | «Alimentos de la casa» retirada como ficha técnica y como segunda vía | HECHO | Editar se hace desde la fila del producto; archivar y unir, desde Funciones avanzadas |
| 2.7 | Registro inicial de cinco pasos, escrito para esta versión | HECHO | `src/setup.js` `PASO`; recorrido entero comprobado a mano |
| 2.8 | Paso 2 por rubros y sin cantidades | HECHO | Comprobado: los ocho rubros, 16 productos marcados, cero campos numéricos |
| 2.9 | Sin paso «cuándo se repiten», sin días fijos, sin rutinas | HECHO | `tests/canasta.test.js`; `tests/frecuencia.test.js` |
| 2.10 | El avance se guarda y se puede retroceder sin perder lo escrito | HECHO | `CAMPOS_GUARDADOS` en `src/setup.js`; `tests/canasta.test.js` |
| 2.11 | Plan semanal: 7 días de lunes a domingo, 14 con «Ver dos semanas» | HECHO | `src/page-semana.js` `DIAS_POR_VISTA`; `tests/plan-semanal.test.js` |
| 2.12 | Nunca una cuadrícula de mes | HECHO | `src/page-mes.js` borrado; `tests/plan-semanal.test.js` |
| 2.13 | Avanzar y retroceder por semanas, también al pasado; «Ir a una fecha» | HECHO | Comprobado: 12 semanas hacia adelante y una fecha de agosto |
| 2.14 | Cuatro maneras de anotar una comida, y estados sin comida | HECHO | `CLASES_DE_COMIDA` en `src/model.js` |
| 2.15 | «Usar lo que sobró» sin pedir porciones ni calcular existencias | HECHO | La ventana solo pide fecha, momento y quién come: cero campos numéricos |
| 2.16 | Cambiar un día no altera los demás | HECHO | Comprobado a mano: cambiar el almuerzo de mañana dejó los otros 5 planes idénticos |
| 2.17 | Nada se sugiere, se copia ni se rellena por una regla vieja | HECHO | 12 semanas futuras en blanco con la casa vieja cargada |
| 2.18 | Hoy: lo planificado y las notas; «Sin decidir» no es un error; meriendas aparte | HECHO | `src/app.js` `tarjetaDeComida`; `tests/momentos.test.js` |
| 2.19 | «Cómo funciona»: recorrido de seis pasos, salteable y repetible desde Ajustes | HECHO | `src/onboarding.js` `TOUR_STEPS` |

### Fase 3 — Compra manual, limpieza y auditoría

| # | Requisito | Estado | Evidencia |
|---|---|---|---|
| 3.1 | «Preparar la compra»: habituales por rubros, con búsqueda | HECHO | `src/page-compra.js` `vistaPreparar`. **El buscador estaba muerto y se arregló**: `src/app.js`, mapa `buscadores` |
| 3.2 | Tocar lo que hace falta esta vez, con cantidad opcional | HECHO | `COMPRA_FORMS['compra-poner']` |
| 3.3 | Producto ocasional: solo esta compra, o también a los habituales | HECHO | `bloqueOcasional`; `src/model.js` `agregarOcasional` |
| 3.4 | «Mi lista»: pendientes arriba, comprados tachados abajo | HECHO | `vistaLista`; `tests/compra-lista.test.js` |
| 3.5 | Un toque marca y otro desmarca | HECHO | `marcarComprado`; `tests/compra-lista.test.js` |
| 3.6 | Cada renglón permite «Editar cantidad» | HECHO | **Nuevo en esta fase.** `renglon()` + `COMPRA_FORMS['compra-cantidad']` |
| 3.7 | Compra parcial: 2 pedidas, 1 comprada, 1 pendiente | HECHO | `anotarComprado` + `pendienteDe`; comprobado a mano |
| 3.8 | Al cerrar con pendientes se pregunta si pasan a la próxima o solo al historial | HECHO | **Nuevo.** `modalPendientes` + `trasladarPendientes` |
| 3.9 | Se guardan fecha, cantidad pedida y cantidad comprada | HECHO | `lista.fecha`, `lista.cerradaEl`, `linea.cantidad`, `linea.comprada` |
| 3.10 | La siguiente lista empieza vacía salvo lo que se decidió trasladar | HECHO | `terminar()` en `src/page-compra.js`; dos pruebas nuevas |
| 3.11 | La frecuencia no calcula, no divide y no impide salir otro día | HECHO | `tests/compra-lista.test.js`; `tests/frecuencia.test.js` |
| 3.12 | El menú planificado no añade productos a la lista | HECHO | Ningún código de plan llama a `agregarALista` |
| 3.13 | Limpieza de los diez restos | HECHO | Ver el apartado 3 |
| 3.14 | Sin enlaces rotos | HECHO | Cruzadas las 110 acciones y las trece rutas contra sus manejadores |
| 3.15 | Alergias: con alimentos avisa; sin alimentos no afirma que sea segura | HECHO | `src/avisos.js` + `tests/alergias.test.js` |
| 3.16 | Auditoría de principio a fin con cuenta nueva | HECHO | Los diez pasos, comprobados en el navegador. Ver el apartado 4 |
| 3.17 | Auditoría con una cuenta vieja | HECHO | Casa v10 congelada cargada en el navegador |
| 3.18 | Semanas a caballo de dos meses y de dos años | HECHO | `tests/fechas.test.js`. **Había un fallo de rótulo y se arregló** |
| 3.19 | Febrero en año normal y bisiesto | HECHO | `tests/fechas.test.js` |
| 3.20 | Móvil y escritorio | HECHO | Comprobado a 375 px y en escritorio, sin desbordes |
| 3.21 | APK sin micrófono ni complemento retirado | HECHO | Ver el apartado 5 |

---

## 2. Lo que encontré roto, y arreglé

Ninguna de estas siete la pediste: salieron auditando.

1. **El buscador de «Preparar la compra» no hacía nada.** El campo estaba
   dibujado y ningún manejador lo escuchaba: se tecleaba y la lista no se
   movía. Una línea en el mapa de buscadores de `src/app.js`.
2. **Tachar un renglón pisaba lo que se había anotado a mano.** Quien apuntaba
   «traje una de dos latas» y después tachaba el renglón se encontraba con dos
   en el historial: una compra que no ocurrió. `marcarComprado` ya no
   sobrescribe una cantidad escrita.
3. **La semana que cruza de año se rotulaba mal.** «Del 29 dic al 4 de enero de
   2026»: el 29 de diciembre es de 2025, y el año del final se derramaba hacia
   atrás sobre una fecha que no era suya.
4. **«Toda la semana» no marcaba nada en una semana pasada.** El atajo arrancaba
   siempre desde hoy, y en una semana que ya pasó no hay ningún día «de hoy en
   adelante»: el botón no hacía nada y no decía por qué.
5. **La fecha de hoy se calculaba una vez al cargar la app.** Un teléfono que se
   queda encendido pasada la medianoche seguía pintando el día de ayer: la
   píldora «Hoy» en el día equivocado y «Esta semana» llevando a la anterior.
   Pasaba en tres pantallas.
6. **Tres puertas seguían escribiendo en el libro de existencias.** «Corregir un
   conteo viejo», «Corregir lo que hay» dentro de un alimento, y «Corregir»
   sobre una revisión terminada. Escribir ahí no arregla nada —no alimenta
   ninguna pantalla—; lo único que hacía era afirmar, con un botón, que la app
   sabe lo que hay en tu despensa.
7. **Quince textos prometían funciones retiradas**, dos de ellos publicados en
   Google Play. La lista entera está en el apartado 3.

Y una cosa que no es un fallo pero lo parecía: **los avisos de alergia vivían en
`app.js`**, el único archivo que ninguna prueba puede ejecutar. Es lo único de
esta app que puede hacerle daño a alguien y no tenía una sola prueba detrás.
Ahora está en `src/avisos.js` con doce pruebas.

---

## 3. La limpieza, una por una

| Función retirada | Qué quedaba | Cómo quedó |
|---|---|---|
| Plan mensual / calendario de mes | Una captura publicada en Play, un texto legal y la descripción de la tienda | Capturas regeneradas, textos corregidos |
| Rutinas y repeticiones | Textos legales que las presentaban como dato vigente; un icono sin uso | Reescritos en pasado; icono borrado |
| Sugerencias y copia de semanas | Nada activo | — |
| Cantidad habitual al mes | El campo de la ficha y la vista «Cambios de este mes» | Retirados |
| Reparto entre quincenas | El README decía que seguía en Ajustes | Corregido |
| Compra calculada | Cuatro frases que prometían que la lista descuenta lo contado | Retiradas con la pantalla que las enseñaba |
| Inventario y «cuánto queda» | **Tres controles que escribían**, y las ramas de rellenar una revisión | Retirados. La revisión vieja se lee y no se toca |
| Fichas «Alimentos de la casa» | Nada activo | — |
| Sidebar «Más» | Un comentario en el manifiesto de Android | Corregido |
| Dictado y micrófono | Nada. Un solo permiso: `INTERNET` | — |

Los datos de todo eso **siguen guardados**: rutinas, planes de mes, períodos
cerrados, revisiones y cantidades mensuales viajan en el respaldo y se leen
donde había pantalla para leerlos. Lo que se retiró son las puertas para
escribirlos.

---

## 4. Cómo probarlo tú en local

```bash
npm test
```

587 pruebas. Después:

```bash
npm start
```

Abre `http://localhost:4173`.

### A. Cuenta nueva, los diez pasos

1. **Empezar de cero.** Si ya tenías datos, borra el sitio (F12 → Application →
   Clear site data) o abre una ventana privada.
2. *Seguir sin cuenta en este teléfono* → *Organizar mi casa* → *Vamos*.
3. **Paso 1 · Mi hogar**: pon 1 persona, dale a *Llenar*, escribe un nombre y
   una alergia —por ejemplo **Maní**—, y guarda.
4. **Paso 2 · Productos**: marca dos o tres de cada rubro y ve dando
   *Continuar*. Son ocho rubros. **Comprueba que en ningún momento te piden una
   cantidad.**
5. **Paso 3 · Cómo compramos**: elige *Quincenal*. Lee la frase: dice que no
   divide cantidades, no calcula nada y no te impide salir otro día.
6. **Paso 4 · Preparaciones**: escribe «Mangú con salami» marcando *Desayuno* y
   *Cena*, guarda, y escribe «Arroz con pollo» en *Almuerzo*. **No te piden
   porciones ni cuánto rinde.**
7. **Paso 5 · Crear mi primer plan**: elige **7 días**. Despliega las primeras
   comidas y elige una preparación en cada una. El contador va diciendo «N de 21
   comidas puestas». **Termina sin llenarlas todas**: tiene que dejarte.
8. **Hoy**: mira el desayuno. Debajo tiene que salir **«No se puede comprobar —
   esta preparación no tiene alimentos anotados»**. Eso es lo que queríamos: la
   app no dice que sea segura, dice que no ha mirado.
9. **Cambiar un día**: *Plan semanal* → toca el almuerzo de mañana → cambia el
   nombre a «Sancocho» y guarda. Los otros días no se mueven.
10. **Usar lo que sobró**: abre el sancocho → *Usar lo que sobró otro día* →
    elige pasado mañana y *Almuerzo*. **No te pide ninguna cantidad.**
11. **La semana que viene**: flecha «›». Tiene que estar **en blanco**. Nada se
    copia y nada se sugiere.

### B. La compra, con las dos latas de maíz

12. *Compra* → *Preparar una compra*.
13. *+ Algo que no está en la lista* → «Maíz en lata», cantidad **2**, medida
    *latas*, y marca **También a mis habituales**.
14. Pasa a *Mi lista*. Escribe **1** en «¿cuánto?» y dale a *Anotar*. El renglón
    dice «2 latas · se trajo 1 lata, faltan 1 lata».
15. *Editar cantidad* → pon **3** → *Guardar*. Ahora dice 3 y sigue habiendo 1
    traída.
16. Toca el renglón para **tacharlo**: la cantidad anotada **no cambia**. Tócalo
    otra vez para **destacharlo**.
17. Vuelve a anotar **1** y dale a *Terminar la compra*. Sale la ventana
    **«Quedaron cosas sin conseguir»** con las dos respuestas.
18. Elige **Pasarlas a la próxima compra**. La lista nueva trae **2 latas** —lo
    que falta de 3, no las 3— y la compra cerrada sigue diciendo «pedidas 3,
    traídas 1».

### C. Una casa vieja

19. Con la app abierta, pega esto en la consola del navegador (F12):

```js
const viejo = await (await fetch('/tests/fixtures/estado-v10-completo.json')).json();
localStorage.setItem('que-comemos-v1', JSON.stringify(viejo));
location.reload();
```

20. Es una casa de la versión 10, con 24 comidas puestas, 5 rutinas, un período
    cerrado y dos listas de compra. Comprueba: *Plan semanal* → *Ir a una fecha*
    → **12 de agosto de 2026**. Las comidas de entonces están ahí.
21. Ahora vuelve a *Esta semana* y avanza con la flecha «›» diez o doce veces.
    **Todas las semanas futuras están en blanco**: ninguna de las cinco rutinas
    rellena nada.
22. *Ajustes → Historial*: el período cerrado y la revisión de agosto se leen
    enteros. La revisión **no tiene ningún campo donde escribir** y no hay botón
    de corregir.

### D. Fechas y teléfono

23. *Plan semanal* → *Ir a una fecha* → **29 de diciembre de 2025**. El rótulo
    tiene que decir **«Del 29 dic de 2025 al 4 de enero de 2026»**, con los dos
    años.
24. Prueba también **28 de febrero de 2028** (bisiesto): la semana tiene que
    traer el 29.
25. Estrecha la ventana a 375 px. La barra de abajo enseña las cinco secciones y
    el engranaje sube arriba. Ninguna pantalla se desborda de lado.

---

## 5. El APK

`entrega/que-comemos-3.0-release.apk` · versión 3.0 (`versionCode` 5), firmada
con el certificado de NexoCore.

Comprobado sobre el APK ya firmado:

- El manifiesto declara **un solo permiso: `INTERNET`**.
- **No aparece `RECORD_AUDIO`** en ninguna parte del binario.
- **No hay ningún complemento de reconocimiento de voz** empaquetado.

Para instalarla: pásala al teléfono y ábrela; Android pedirá permiso para
instalar de fuera de Play la primera vez.

---

## 6. Lo que queda abierto

Esto no es deuda escondida: es lo que sé que falta y por qué.

1. **La sincronización entre dos teléfonos sigue sin probarse de verdad.** El
   código está, la cuenta funciona, pero nunca se ha visto una casa viajar de un
   aparato a otro. **No lo doy por bueno** hasta que se pruebe con dos teléfonos
   reales.
2. **La ficha de Google Play hay que volver a subirla**: las capturas nuevas
   están en `tienda/capturas/` y los textos en `docs/play-store.md`, pero
   subirlos a Play Console lo tienes que hacer tú.
3. **Cuatro funciones del modelo solo las usan las pruebas**: `setMonthChange`,
   `removeMonthChange`, `promoteToHabitual` y `monthBasketSummary`. Se quedan a
   propósito: son las que leen los cambios de mes que siguen guardados, y las
   pruebas que las usan son justo las que comprueban que un respaldo viejo se
   abre sin perder nada.
4. **`src/app.js` sigue sin poder ejecutarse en una prueba.** Son 110 KB que
   solo se leen como texto. Los avisos de alergia ya salieron de ahí; el resto
   —el despachador de acciones y los modales— sigue dependiendo de que alguien
   abra la app y mire.
