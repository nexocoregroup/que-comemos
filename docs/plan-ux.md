# Plan de la auditoría de UX, por fases

Sale de [`auditoria-ux.md`](auditoria-ux.md): 51 hallazgos en pie tras la
refutación. Varios son **el mismo problema visto por dos lentes** —el formulario
que se borra aparece en «flujos» y en «formularios», el botón de atrás en
«consistencia» y en «flujos»—, así que aquí van agrupados por causa y no por
pantalla. Quedan **38 trabajos distintos** repartidos en cinco fases.

El orden no es por gravedad. Es por **qué le pasa a la persona si no se arregla**:
primero lo que le quita trabajo hecho, después lo que le estorba en la tarea que
más repite, y al final lo que solo se ve.

Cada fase se puede soltar sola. Ninguna depende de una posterior.

---

## Fase 1 · Que no se pierda lo que ya hiciste

**Cinco trabajos.** Es la única fase donde la app hace daño: aquí no se trata de
que algo se vea mal, sino de que algo que la persona escribió o decidió
desaparece. Va primera por eso, aunque no sea la más visible.

| # | Qué | Dónde | Esfuerzo |
|---|---|---|---|
| 1.1 | Tocar «¿es solo para algunas personas?» borra todo lo escrito en la ventana | `app.js:1238` | bajo |
| 1.2 | Escape o un roce fuera de la hoja descartan lo escrito sin preguntar | ventanas de `app.js` | medio |
| 1.3 | El botón de atrás de Android cierra la app desde cualquier pantalla | toda la app en el APK | medio |
| 1.4 | «Terminar la compra» cierra sin preguntar y sin vuelta atrás | `page-compra.js` | bajo |
| 1.5 | «Quitar» borra un renglón sin preguntar, sin aviso y sin deshacer | `page-compra.js` | bajo |

**1.1 es el más feo y el más barato.** `solo-algunos` llama a `render()` sin leer
antes el formulario, y `render()` reconstruye la ventana entera desde el estado.
Todo lo tecleado se va. Los otros dos módulos del proyecto ya resolvieron esto
—`guardarLoEscrito` en `bulk-entry.js:506`, `leerDelFormulario` en `hogar.js:391`—
y solo hay que aplicar el mismo patrón.

**1.3 necesita una dependencia nueva**, `@capacitor/app`, que hoy no está
instalada. Es la única cosa de todo el plan que añade algo al APK. El oyente
deshace por capas: ventana abierta → cerrarla; cajón abierto → cerrarlo;
recorrido abierto → cerrarlo; sección distinta de Hoy → volver a Hoy; y solo
entonces salir.

**1.4 y 1.5 tienen la red ya construida en el proyecto**: el modelo sabe reabrir
una compra cerrada, y el Plan semanal ya tiene «Deshacer» con `snapshot`/`restore`.
Es usar lo que hay.

**Cómo se sabe que está lista:** escribes media preparación, tocas el enlace de
«solo algunas personas», y lo escrito sigue ahí. Pulsas atrás con una ventana
abierta y se cierra la ventana, no la app. Borras un renglón y puedes deshacerlo.

---

## Fase 2 · Que el colmado funcione

**Seis trabajos.** La compra es la única tarea que se hace **de pie, con una mano
y el carrito en la otra**, y es la peor servida de las cuatro. Debajo de casi
todo hay una sola causa, que el propio código tiene diagnosticada por escrito en
`app.js:407`: **`render()` reescribe `#app` entero en cada toque**, así que la
lista vuelve al principio, el foco se va al documento y no se anuncia nada.

| # | Qué | Esfuerzo |
|---|---|---|
| 2.1 | Conservar el desplazamiento al repintar, cuando la pantalla no cambió | medio |
| 2.2 | Marcar y desmarcar sin repintar la pantalla entera | medio |
| 2.3 | Una región viva permanente, y devolver el foco donde estaba | medio |
| 2.4 | Poder añadir algo desde «Mi lista», sin cruzar a la otra pestaña | bajo |
| 2.5 | «Mi lista» agrupada por rubro, que el modelo ya guarda en cada renglón | medio |
| 2.6 | Al abrir Compra con una lista en curso, enseñar la lista y no el catálogo | bajo |

**2.1 y 2.3 son piezas compartidas**: arreglan de una vez las tres listas largas
de la app y buena parte de la accesibilidad, porque cinco de los siete hallazgos
de esa dimensión son la misma raíz. El patrón existe ya en el proyecto
—`pintarMomento` en `setup.js:940`— pero solo se aplicó en el asistente inicial.

**2.5 no inventa datos**: cada renglón ya lleva su rubro guardado y hoy se tira.
Con 40 renglones, «Mi lista» son 154 botones sin una sola cabecera.

**Cómo se sabe que está lista:** con una lista de 40 renglones, tachas el número
30 y la pantalla no se mueve. Un lector de pantalla dice que se marcó. Apuntas
algo nuevo sin salir de la lista.

---

## Fase 3 · Llegar a lo que vienes a hacer

**Nueve trabajos.** Es lo que viste tú en el teléfono, y resultó ser más ancho de
lo que parecía: la app no tiene una regla de dónde va la acción principal, y eso
se paga en cinco pantallas.

| # | Qué | Esfuerzo |
|---|---|---|
| 3.1 | Un solo patrón de plegado para toda la app, y aplicarlo a los ocho rubros | medio |
| 3.2 | «+ Añadir producto» arriba y con el mismo peso que en Preparaciones | bajo |
| 3.3 | Buscador en «Mis productos habituales» | bajo |
| 3.4 | «+ Algo que no está en la lista» justo debajo del buscador, no al fondo | bajo |
| 3.5 | Ajustes como índice de filas, sin repetir el texto que hay detrás | medio |
| 3.6 | Anular el alto mínimo de las tarjetas de comida en el teléfono | bajo |
| 3.7 | Plan semanal: los días ya pasados, plegados | medio |
| 3.8 | El «+» flotante cambia según la sección, y no ofrece ir donde ya estás | medio |
| 3.9 | Unificar las dos funciones gemelas que pintan la misma lista de habituales | medio |

**3.1 es la decisión de fondo.** Hoy hay **tres** patrones de plegado: `<details
class="plegable">` en Compra y el registro, un `<button aria-expanded>` con estado
en `ui.mas` en Preparaciones, y nada en Productos. Hay que elegir uno. El
`<details>` nativo es el mejor candidato: el navegador ya resuelve teclado y
lector de pantalla, y no obliga a repintar la pantalla al abrir —que es
justamente lo que hace mal el de Preparaciones—.

**3.2 no sale gratis con 3.1.** Con los ocho rubros cerrados, el botón sigue
siendo el último elemento de la pantalla. Hay que moverlo.

**3.8 incluye un botón que hoy no hace nada**: en Compra, el atajo «Preparar la
compra» navega a la sección en la que ya estás.

**Cómo se sabe que está lista:** entras en cualquiera de las cinco secciones y la
acción principal se ve sin desplazar. Hoy, en Productos, está a 1.929 px.

---

## Fase 4 · Que la app no mienta sobre tus datos

**Ocho trabajos.** Aquí no hay nada roto a la vista: hay cosas que la app afirma y
no son ciertas, y dos sitios donde la única salida que ofrece destruye lo que
intentas salvar.

| # | Qué | Esfuerzo |
|---|---|---|
| 4.1 | Datos ilegibles: una salida que no los destruya | medio |
| 4.2 | Sesión caducada: explicarlo, en vez de convertirse en la pantalla de registro | medio |
| 4.3 | «Ver un ejemplo» carga el ejemplo siempre, no solo el primer día | bajo |
| 4.4 | «Borrar el ejemplo» no borra lo que la persona escribió encima | bajo |
| 4.5 | Quitar los textos que juran «no hay cuenta, no hay servidor» con la nube encendida | bajo |
| 4.6 | Una sincronización que falla deja de contarse como éxito | bajo |
| 4.7 | Una sincronización que lleva días fallando lo dice fuera de Ajustes | medio |
| 4.8 | Un conflicto se resuelve viendo las dos versiones, sin salir de donde estabas | medio |

**4.1 y 4.2 son los dos graves.** En el primero, cuando lo guardado no se puede
leer, la app pinta el arranque de casa nueva y todas las salidas que ofrece
escriben encima. En el segundo, al caducar la sesión la casa desaparece de la
pantalla sin una palabra —y el aviso que lo explicaría está escrito en el código
pero no se pinta nunca—.

**Cómo se sabe que está lista:** ninguna pantalla afirma algo sobre tus datos que
no se pueda comprobar, y de ningún estado roto se sale perdiéndolos.

---

## Fase 5 · Acabado

**Diez trabajos**, todos leves y casi todos de esfuerzo bajo. Van juntos al final
porque ninguno cambia lo que se puede hacer con la app, solo cuánto cuesta.

- Cambiar de sección se anuncia, y el título del documento cambia
- Anotar una alergia deja de hacerse a ciegas
- Los 35 conteos «1 comida(s)» pasan a hablar como una persona
- La misma cosa deja de llamarse producto, alimento y cosa según la pantalla
- El título no se escribe dos veces en las siete subpantallas de Ajustes
- Jerarquía real de encabezados en Productos y Preparaciones
- Un anillo de foco que se vea
- Los errores de las ventanas salen junto al campo que falló
- El alimento de una preparación deja de elegirse en un desplegable de 70
- El historial de compras enseña el resto en vez de anunciarlo y no llevar a nada

---

## Lo que este plan NO propone

Conviene dejarlo escrito, porque son cosas que un ojo externo pediría y que aquí
serían un error:

- **Nada de lo retirado vuelve**: ni cantidades automáticas, ni sugerencias de
  comida, ni plan mensual, ni inventario, ni micrófono. Los escépticos tumbaron
  las propuestas que iban por ahí.
- **No se toca la identidad visual.** Terracota, crema, tinta, salvia y Montserrat
  se quedan como están.
- **No se mete un empaquetador ni un framework.** Todo lo de arriba se hace con
  lo que el proyecto ya tiene.
- **`styles.css` no se reescribe.** Sigue minificada y con la paleta vieja debajo;
  las correcciones siguen viviendo en `sistema.css`, que es la regla de la casa.

## Una advertencia sobre las pruebas

Ninguna prueba de este proyecto ejecuta una pantalla, así que **`npm test` en
verde no dice nada de casi nada de este plan**. Lo que sí se puede hacer, y hay
que hacer, es lo que ya se hizo con la fecha de hoy: cuando un arreglo se pueda
vigilar leyendo el código fuente, dejar una prueba guardiana que lo vigile —y
comprobar que muerde devolviéndole el fallo a propósito, porque una guardia
escrita a la medida de lo que se acaba de arreglar puede no proteger de nada.

---

## Lo que se hizo, y en qué se apartó del plan

Las cinco fases están ejecutadas. Lo que sigue es lo que NO salió como decía
este documento, porque un plan que se lee después de hacerlo solo vale si dice
dónde se equivocó.

**2.2 no se hizo como estaba escrito, se hizo más.** El plan decía «marcar sin
repintar la pantalla entera». Se hizo eso, y además se quitó la tarjeta «Ya en
el carrito»: era adonde saltaba el renglón al tacharlo, así que cada marca
movía la lista debajo del dedo. El escéptico había avisado de que eso es un
cambio de comportamiento visible y que había que decidirlo aparte y no colarlo
dentro del arreglo del foco. Se decidió: los renglones se quedan donde están y
lo que decía la tarjeta lo dice un contador.

**3.5 se hizo contra una refutación, y con la corrección que esa refutación
pedía.** El crítico tumbó «Ajustes como índice» diciendo que dejar filas
desnudas con título y flecha convierte «Funciones avanzadas» en una puerta
opaca para quien entra ahí una vez cada varios meses. Tiene razón, y por eso
cada fila lleva debajo una línea que dice qué hay detrás y cuánto hay: «4
personas en casa», «Compra mensual — una vez al mes», «Medidas de compra, unir
dos alimentos, archivar y restaurar». No son filas desnudas.

**3.9 se hizo a la mitad, y la mitad que se hizo es la que valía.** El
escéptico tumbó unificar las dos funciones que pintan los rubros: el gesto no
es el mismo —en Productos se pliega, en Compra se toca para añadir— y
unificarlas habría sido igualar la forma sin mirar la función. Lo que sí era
una copia de verdad, el icono y la separación escritos dos veces con dos
nombres, se escribe una vez.

**El apartado 2 de la fase 5 ya estaba hecho.** «Anotar una alergia deja de
hacerse a ciegas» era, según el propio crítico, el mismo defecto raíz que el
repintado completo, y eso lo arregló la fase 2 para toda la app. Lo único que
quedaba era el anuncio, que son dos líneas.

**Lo que no está probado.** Sigue sin estarlo lo mismo que antes, y conviene
que se lea junto a lo de arriba:

- El botón de atrás de Android (1.3) solo existe dentro del APK. En el
  navegador `Capacitor` es `undefined` y el oyente no se registra.
- La sesión caducada (4.2), el conflicto de dos versiones (4.8) y la
  sincronización fallando días (4.7) se comprobaron manipulando el
  almacenamiento a mano y leyendo el código. Con un servidor de verdad, y con
  dos teléfonos de verdad, no.
- La sincronización entre dos teléfonos nunca se ha probado con dos teléfonos.

Y sigue en pie la advertencia del final: `npm test` en verde no dice casi nada
de este plan. Lo que se pudo vigilar leyendo el código quedó en guardias —las
de `tests/llegar.test.js`, `tests/no-mentir.test.js` y `tests/acabado.test.js`
son de aquí—, y una de ellas encontró cuatro paréntesis de plural que el
barrido a mano no vio. El resto se comprobó en el navegador, pantalla por
pantalla, y está dicho en cada commit.
