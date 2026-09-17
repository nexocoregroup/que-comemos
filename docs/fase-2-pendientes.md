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

### B3 · Organización de compra — **Fase 3**

`Ajustes → Preferencias de la aplicación → Organización de compra`. Lo único que
queda ahí es la **frecuencia** (mensual o quincenal), que hoy solo dice cuándo
toca la próxima lista. La pantalla tiene más marco que contenido.

### B4 · El historial del inventario retirado — **Fase 3**

Tres pantallas viven de datos que ya no se producen, todas dentro de Ajustes:
*Historial → Períodos cerrados*, *Lo que revisaste antes*, y *Funciones
avanzadas → Corregir un conteo viejo*. Son honestas —dicen que hablan de datos
antiguos—, pero la pregunta sigue siendo si merecen sitio en el menú o basta con
que los datos estén en el respaldo.

### B5 · Una comida escrita a mano no se puede volver a usar sin reescribirla

Es a propósito: el catálogo de preparaciones es lo que la casa **sabe hacer**, y
llenarlo de cosas que pasaron un jueves haría ilegible la lista que más se mira.
Pero si alguien escribe «sancocho de la vecina» tres semanas seguidas, lo
escribe tres veces.

**Posible remedio para la Fase 3:** al escribir una comida a mano, ofrecer —una
sola vez, y sin marcarlo por defecto— «guardarla también en mis preparaciones».

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
`actualizarLineaDeLista`, `reabrirLista`, `cierresDe`, `CLASES_DE_COMIDA` y,
desde que se retiró la cantidad del mes, `setMonthChange`, `removeMonthChange`,
`promoteToHabitual` y `monthBasketSummary`.

Esas cuatro últimas se quedan a propósito: son las que leen y escriben los
cambios de mes que siguen guardados, y las pruebas que las usan
—`baskets.test.js`, `migrate.test.js`— son justo las que comprueban que un
respaldo viejo se abre sin perder nada. Borrarlas obligaría a borrar esas
pruebas, que es lo contrario de lo que hay que hacer.

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
- **La sincronización sigue sin probarse con dos aparatos de verdad.**
- **Las seis capturas de la tienda hay que rehacerlas.** El generador
  (`tools/capturas.js`) ya está puesto al día —la 2 es el plan semanal, la 3 la
  ventana de poner en varios días, la 6 entra directo a los habituales—, pero los
  PNG de `tienda/capturas/` siguen siendo los viejos. Hace falta `npm start`
  levantado y Chrome instalado: `npm run capturas`.
