# Lo que la Fase 1 dejó para las fases 2 y 3

La Fase 1 retiró **lógica**: la generación automática de comidas, las rutinas
permanentes, la copia del mes anterior, las sugerencias, el cálculo de la compra
y la voz propia de la aplicación. Lo que no retiró —a propósito— son las
pantallas que quedaron a medio sentido. Esta es la lista, para que ninguna se
quede rondando sin que nadie sepa que está ahí.

La regla que se siguió: **no queda ninguna ruta activa que ejecute un cálculo
retirado.** Lo que queda son huecos visuales, textos que sobran y decisiones que
no le corresponden a quien programa.

---

## A. Pantallas que perdieron su razón de ser

### A1 · Plan mensual sigue siendo mensual — **Fase 2**

La decisión de producto dice que la persona planifica **una semana o, si
prefiere, dos**. La pantalla sigue organizada por meses.

Lo que ya funciona: la ventana *Poner una comida en varios días* trae atajos
para marcar los 7 y los 14 días siguientes, que es planificar una semana o dos
sin cambiar de pantalla, y la lista de «sin decidir» empieza en hoy.

Lo que falta: una vista de semana de verdad —siete columnas, cinco filas— y que
el resumen hable de «esta semana» antes que del mes. La barra de navegación
conserva el nombre *Plan mensual*, que no se toca.

### A2 · «Cambios de este mes», dentro de Mis productos habituales — **Fase 2**

`src/page-mas.js`, vista `cambios`. Es el presupuesto mensual por alimento:
«este mes 12 libras de carne en vez de 8». Servía para la compra calculada, que
ya no existe. Hoy se puede escribir y no cambia nada en ninguna parte.

Decisión pendiente: se retira la pantalla y los datos se quedan como historial,
o se reconvierte en «cosas que este mes hay que comprar aunque no sean de
siempre», que sí tiene sentido en una lista manual.

### A3 · Organización de compra — **Fase 2**

`src/page-mas.js` → *Ajustes* → *Organización de compra*. El reparto entre
quincenas ya se retiró en esta fase, porque era cálculo. Lo que queda es la
**frecuencia** (mensual o quincenal), que hoy solo dice cuándo toca la próxima
lista y qué días cubre. Se conserva, pero la pantalla quedó con más marco que
contenido.

### A4 · La ficha del alimento pide todavía «consumo del mes» — **Fase 2**

Es la cantidad mensual: dato histórico que ya no alimenta nada. Además tiene una
trampa heredada: **borrar esa cantidad da de baja el alimento de los
habituales**, porque `setHabitualLine` lee una cantidad vacía como una baja. Por
el recorrido inicial no se puede llegar a eso —ahí se usa `agregarHabitual`, que
sí protege—, pero desde la ficha sí.

Decisión pendiente: quitar el campo de la ficha, o separar «quitar de mis
habituales» en un botón propio y dejar que la cantidad se pueda vaciar sin
consecuencias.

### A5 · El historial del inventario retirado — **Fase 3**

Tres pantallas viven de datos que ya no se producen:

- *Más → Historial → Períodos cerrados* — las fotografías de cuando se calculaba
  la compra. No se produce ninguna nueva.
- *Más → Lo que revisaste antes* — el archivo de solo lectura de las revisiones
  de despensa.
- *Más → Funciones avanzadas → Corregir un conteo viejo* — la herramienta para
  arreglar una cifra de entonces.

Las tres son honestas: dicen que hablan de datos antiguos. La pregunta de la
Fase 3 es si siguen mereciendo sitio en el menú o si basta con que los datos
estén en el respaldo.

---

## B. Datos que se conservan y hoy no los enseña nadie

Ninguno se borró —la migración no toca nada de esto— y ninguno alimenta ya una
cuenta viva:

| Dato | Qué era | Quién lo lee hoy |
|---|---|---|
| `state.mealRoutines` | Las reglas de repetición | **Nadie.** Solo el respaldo y la migración |
| `state.monthPlans` | Qué meses se «abrieron» | Nadie |
| `state.closedPeriods` | Los períodos cerrados | *Más → Historial* |
| `settings.compra.reparto` | El reparto entre quincenas | Nadie, desde esta fase |
| `habitualBasket.lines[].tramos[].quantity` | Las cantidades del mes | Se ven en la ficha del alimento (A4) |
| `state.opening`, `purchases`, `reviews`, `corrections` | El inventario por movimientos | Las pantallas de A5 |
| `state.activity` | Lo que anotaba el asistente | Nadie. Queda siempre vacío |

**Las reglas antiguas son el caso más incómodo**: están guardadas, no las enseña
ninguna pantalla, y hay comidas en el calendario que dicen *«Rutina»* sin que se
pueda ir a ver cuál. O se enseñan en algún sitio de solo lectura, o se ofrece
borrarlas. Decidirlo es de la Fase 2.

### Exportaciones del modelo que hoy solo usan las pruebas

No estorban y ninguna es un cálculo retirado, pero conviene tenerlas apuntadas:
`WEEKDAY_LABELS`, `monthExtras`, `addPurchase`, `createReview`,
`actualizarLineaDeLista`, `reabrirLista`, `cierresDe`. Las dos de compras y
revisiones sirven para montar en las pruebas una casa con inventario, que es lo
que necesitan las pantallas de A5.

---

## C. Decisiones que no puede tomar quien programa

1. **¿Se enseñan las reglas antiguas en algún sitio, o se ofrece borrarlas?**
2. **¿Se conserva la frecuencia de compra (mensual/quincenal)?** Hoy solo sirve
   de recordatorio; no divide nada.
3. **¿El historial del inventario sigue en el menú, o basta con el respaldo?**
4. **¿Vista de semana en la Fase 2, o se deja mensual?**
5. **Las seis capturas de la tienda hay que rehacerlas.** Los archivos de
   `tienda/capturas/` siguen con los nombres viejos (`3-rutina.png`,
   `5-cuanto-queda.png`, `6-canasta.png`) y enseñan pantallas que ya no existen.
   El generador (`tools/capturas.js`) ya está puesto al día —la captura 3 pasa a
   ser la ventana de poner una comida en varios días—; falta correr
   `npm run capturas` con `npm start` levantado y Chrome instalado.

---

## D. Riesgos anotados, que no son de esta fase

- **La sincronización no compara versiones de esquema antes de subir.** Un
  teléfono con el esquema viejo puede sobrescribir el blob del servidor escrito
  por uno nuevo; y al revés, un teléfono viejo que baje datos nuevos los rechaza
  **en silencio** (se anota el fallo, no se avisa al usuario). Esta fase **no
  subió la versión del esquema**, así que no añade riesgo nuevo, pero el hueco
  sigue ahí para cuando haga falta subirla.
- **`BACKUP_KEY` es una sola ranura.** Migrar otra vez sobrescribe la copia
  anterior. Es lo que se quiere casi siempre, pero conviene saberlo.
- **La sincronización entre dos teléfonos sigue sin probarse en uso real.** El
  código existe y tiene pruebas; nadie la ha usado con dos aparatos de verdad.

---

## E. Por qué esta fase NO subió la versión del esquema

`SCHEMA_VERSION` sigue en **10**, y es una decisión, no un olvido.

La reestructura no cambia la forma de ningún dato: los planes, las
preparaciones, los productos habituales y las listas guardan exactamente lo
mismo que guardaban. Lo único que cambia es qué código los lee, y eso no se
apunta en el disco.

Marcar las reglas antiguas con un campo del tipo `historica: true` habría sido
escribir en los datos un hecho sobre el **código**. No defiende de nada: si un
día alguien reintrodujera la generación, ignoraría ese campo igual que ignoraría
cualquier otro. Lo que sí defiende es una prueba, y por eso la defensa está en
`tests/respaldo-v10.test.js`, que abre una casa congelada de la versión 10 —con
sus cinco reglas, sus veinticuatro comidas, su período cerrado y sus dos listas—
y comprueba que **no se pierde un solo registro y que ninguna regla vuelve a
poner una comida**.

El beneficio de no subirla es concreto: un teléfono con la versión anterior
instalada puede seguir sincronizando con uno actualizado. Subirla habría roto
eso en silencio, que es exactamente el riesgo descrito en D.
