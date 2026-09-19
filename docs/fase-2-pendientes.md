# Lo que la Fase 2 dejó para la Fase 3

La Fase 2 cambió **la experiencia principal**: cinco secciones y un engranaje en
vez de cuatro pantallas y un cajón, una semana en vez de un mes, y un registro
inicial que termina poniendo comidas en vez de enseñando un resumen.

Esto es lo que queda, y lo que se cerró de la lista de la fase anterior.

---

## A. Lo que la Fase 2 cerró de `fase-1-pendientes.md`

| Pendiente de la Fase 1 | Cómo quedó |
|---|---|
| **A1 · Plan mensual sigue siendo mensual** | **Cerrado.** `src/page-mes.js` se borró. `src/page-semana.js` enseña 7 días de lunes a domingo, 14 con «Ver dos semanas», flechas de una semana e «Ir a una fecha». No queda ninguna cuadrícula mensual. |
| **C1 · ¿Se enseñan las reglas antiguas?** | **Decidido: no.** Se conservan como dato en el respaldo y en la migración, y ninguna pantalla las lee. Lo que sí se conserva es el origen de cada comida, para que una que diga «Rutina» siga pudiendo decirlo. |
| **C4 · ¿Vista de semana?** | **Cerrado.** Es la pantalla principal. |
| **«Alimentos de la casa»** (no estaba en la lista, lo pidió la Fase 2) | **Retirada.** Editar un producto se hace desde su fila en *Mis productos habituales*; archivar y restaurar, desde *Ajustes → Funciones avanzadas*. |

---

## B. Lo que sigue abierto

### B1 y B2 · La cantidad del mes — **cerrados**

Los dos eran la misma cosa vista desde dos sitios: la vista «Cambios de este
mes» y el campo «consumo del mes» de la ficha del producto. **Decidido: se
quita.** Lo que se hizo:

| Dónde | Cómo quedó |
|---|---|
| *Mis productos habituales* | Una lista de nombres agrupada por rubro. Ni un campo, ni un botón de guardar: se añade y se quita en el acto |
| La vista «Cambios de este mes» | Retirada. Lo que este mes hay que comprar y no es de siempre se apunta en *Compra*, que ya es una lista manual |
| La ficha de un producto | Tres campos: nombre, en qué rubro se busca y una nota para quien haga la compra. Ni medidas, ni grosor del corte, ni equivalencias |
| «¿Dónde entra este alimento?» | Retirado. Un producto nuevo entra en los habituales, que es el único sitio desde donde se añade |
| *Escribirlos de corrido* | Sin columna de cantidad y sin el destino «solo para un mes». La columna vuelve cuando el destino es una compra que ya se hizo: ahí la cantidad es un hecho |
| `corregirHaciaAtras` | Borrada del modelo. Era el escape del aviso «guardado desde este mes», y sin cantidades que corregir no le quedaba nada que hacer |

**Lo que no se tocó:** las cantidades escritas siguen en `habitualBasket`, en el
respaldo y en los meses cerrados, que se calcularon con ellas. Quitar un
producto de la lista escribe un tramo de baja desde este mes; los anteriores
siguen diciendo lo que dijeron. Lo defiende `tests/sin-cantidades.test.js`.

### B3 · Organización de compra — **cerrado a medias, y a propósito**

La pantalla se queda, con la frecuencia y su historial. Lo que se fue es la
mentira que contaba: decía que de ahí salían «los períodos que ves en la
pantalla de la compra», y la compra no enseña ningún período. Ahora dice lo que
es: un dato de la casa, que no divide cantidades, no calcula listas y no impide
abrir una compra cualquier día.

Sigue teniendo más marco que contenido. **Eso es una decisión tuya**, no un
fallo: si quieres que la frecuencia deje de existir como pantalla, se quita en
diez minutos y el dato se conserva.

### B4 · El historial del inventario retirado — **cerrado**

De las tres pantallas, dos se quedan como lectura y la tercera se fue:

| Pantalla | Cómo quedó |
|---|---|
| *Historial → Períodos cerrados* | Se queda. Es la fotografía de un mes que se cerró, con su aviso de que esas cifras no están comprobadas |
| *Lo que revisaste antes* | Se queda, **solo lectura**. Se fueron el botón «Corregir», los dos modos de contar, el alcance, el buscador y los campos donde se escribía |
| *Funciones avanzadas → Corregir un conteo viejo* | **Retirada**, junto con «Corregir lo que hay» dentro de las opciones de un alimento |

Las tres eran escrituras sobre un libro que no alimenta ninguna pantalla. Lo
único que hacían era afirmar, con un botón, que la app sabe lo que hay en tu
despensa. Los datos siguen enteros en el respaldo.

### B5 · Una comida escrita a mano no se puede volver a usar sin reescribirla

Es a propósito: el catálogo de preparaciones es lo que la casa **sabe hacer**, y
llenarlo de cosas que pasaron un jueves haría ilegible la lista que más se mira.
Pero si alguien escribe «sancocho de la vecina» tres semanas seguidas, lo
escribe tres veces.

**Posible remedio:** al escribir una comida a mano, ofrecer —una sola vez, y sin
marcarlo por defecto— «guardarla también en mis preparaciones».

**Sigue abierto después de la Fase 3, a propósito.** No estaba en lo que
pediste, y añadir una casilla al camino más corto de la app —escribir una comida
en dos segundos— es exactamente el tipo de cosa que hay que decidir mirándola,
no de paso. Queda aquí para cuando quieras.

---

## C. Datos que se conservan y hoy no los enseña nadie

Sin cambios respecto a la Fase 1, más uno nuevo:

| Dato | Quién lo lee hoy |
|---|---|
| `state.mealRoutines` | Nadie. Solo el respaldo y la migración |
| `state.monthPlans` | Nadie |
| `state.closedPeriods` | *Ajustes → Historial* |
| `settings.compra.reparto` | Nadie |
| `habitualBasket.lines[].tramos[].quantity` | Nadie. Ninguna pantalla la enseña ni la pide |
| `state.monthOverrides` (los cambios de un mes) | Nadie. Se conservan enteros; la vista que los enseñaba se retiró |
| `state.opening`, `purchases`, `reviews`, `corrections` | Las pantallas de B4 |
| `state.activity` | Nadie. Queda siempre vacío |
| **`plans[].reservedItems`** con cantidades | **Nuevo.** Solo las comidas vinculadas de versiones anteriores lo traen. Se lee y se pinta; las nuevas nacen con la lista vacía |

Exportaciones del modelo que hoy solo usan las pruebas: `WEEKDAYS`,
`WEEKDAY_LABELS`, `monthExtras`, `addPurchase`, `createReview`,
`actualizarLineaDeLista`, `reabrirLista`, `cierresDe`, `CLASES_DE_COMIDA`,
`setMonthChange`, `removeMonthChange`, `promoteToHabitual`,
`monthBasketSummary` y, desde la Fase 3, `saveReview`, `correctReview`,
`correctStock` y `setReviewScope`.

Se quedan a propósito. Son las que leen y escriben los datos antiguos que
siguen guardados, y las pruebas que las usan —`baskets.test.js`,
`migrate.test.js`, `respaldo-v10.test.js`— son justo las que comprueban que un
respaldo viejo se abre sin perder nada. Borrarlas obligaría a borrar esas
pruebas, que es lo contrario de lo que hay que hacer.

Lo que sí desapareció es el camino para llamarlas desde la app: ninguna
pantalla las alcanza. Eso lo defiende `tests/textos-retirados.test.js`.

---

## D. Riesgos anotados

- **`SCHEMA_VERSION` sigue en 10.** La Fase 2 **añadió un sexto valor a
  `plan.kind`** (`'suelta'`) y una forma nueva de `linked` (con `reservedItems`
  vacío), pero **no cambió la forma de ningún dato existente** y `importState`
  nunca validó `kind` contra una lista blanca. Un teléfono con la versión
  anterior que reciba una comida `suelta` la pintaría como «Sin decidir» —el
  título está ahí, pero su `planTitle` no conocía ese tipo—. No se pierde nada, y
  se arregla actualizando la app. **Si eso te parece demasiado, dilo y subo el
  esquema**: el precio es que los teléfonos sin actualizar dejan de poder bajar
  los datos.
- **La sincronización sigue sin probarse con dos aparatos de verdad.** Sigue
  abierto después de la Fase 3, y es lo único que no puedo cerrar yo.
- ~~Las seis capturas de la tienda hay que rehacerlas.~~ **Hecho en la Fase 3**:
  `npm run capturas` regeneró las seis y las cuatro viejas se borraron. Falta
  subirlas a Play Console, que eso lo tienes que hacer tú.
