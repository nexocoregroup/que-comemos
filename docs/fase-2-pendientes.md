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

### B1 · «Cambios de este mes», dentro de Mis productos habituales — **Fase 3**

`src/page-mas.js`, vista `cambios`. Es el presupuesto mensual por alimento:
«este mes 12 libras de carne en vez de 8». Servía para la compra calculada, que
se retiró en la Fase 1. Hoy se puede escribir y no cambia nada en ninguna parte.

**Decisión pendiente:** se retira la vista y los datos se quedan como historial,
o se reconvierte en «cosas que este mes hay que comprar aunque no sean de
siempre», que sí tiene sentido en una lista manual.

### B2 · La ficha de un producto sigue preguntando la cantidad del mes — **Fase 3**

Al editar un producto desde su fila en los habituales se abre el mismo
formulario de siempre, que incluye «consumo del mes». Es un dato histórico que
ya no alimenta nada, y **borrarlo da de baja el alimento de los habituales**
porque `setHabitualLine` lee una cantidad vacía como una baja.

**Decisión pendiente:** quitar el campo, o separar «quitar de mis habituales» en
un botón propio y dejar que la cantidad se pueda vaciar sin consecuencias.

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
| `habitualBasket.lines[].tramos[].quantity` | La ficha del producto (B2) |
| `state.opening`, `purchases`, `reviews`, `corrections` | Las pantallas de B4 |
| `state.activity` | Nadie. Queda siempre vacío |
| **`plans[].reservedItems`** con cantidades | **Nuevo.** Solo las comidas vinculadas de versiones anteriores lo traen. Se lee y se pinta; las nuevas nacen con la lista vacía |

Exportaciones del modelo que hoy solo usan las pruebas: `WEEKDAY_LABELS`,
`monthExtras`, `addPurchase`, `createReview`, `actualizarLineaDeLista`,
`reabrirLista`, `cierresDe`, `CLASES_DE_COMIDA`.

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
