// El formulario de una preparación, escrito una sola vez.
//
// Había dos. El del recorrido inicial preguntaba el nombre, los momentos y la
// nota; el de la sección Preparaciones preguntaba además qué alimentos lleva. O
// sea que quien registraba su casa por primera vez —la persona a la que más le
// costaría volver— escribía sus preparaciones a medias y sin enterarse, y los
// avisos de alergia de esa casa no funcionaban hasta que alguien volviera a
// abrirlas una por una.
//
// Dos formularios para la misma cosa son dos sitios donde olvidarse de
// preguntar algo. Es el mismo motivo por el que la ficha de una persona se
// dibuja solo en `hogar.js` y el recorrido la reutiliza; esto hace lo mismo con
// la preparación.
//
// Lo que este módulo NO hace es guardar: devuelve campos. Quien los reciba los
// mete en su propio `<form>` con su propio `data-form`, porque el recorrido
// guarda y se queda donde está, y la ventana guarda y se cierra. Los nombres de
// los campos sí son los mismos, y por eso `leerPreparacion` los lee igual desde
// los dos sitios.

import { MOMENTOS, alimentosEnElTexto, product, rubroDe } from './model.js';
import { RUBROS } from './catalog-seed.js';
import { button, esc } from './ui-kit.js';
import { icono } from './icons.js';

/* ── El desplegable de alimentos ───────────────────────────────────────────

   Agrupado por rubro y ordenado por nombre dentro de cada uno. Plano y en orden
   de alta, setenta alimentos son una lista a pantalla completa por la que hay
   que bajar a dedo, y se repite por cada alimento de la preparación. */
export function opcionesDeAlimento(state, elegido) {
  const porRubro = new Map(RUBROS.map(rubro => [rubro.id, []]));
  for (const item of state.products.filter(fila => !fila.archived)) {
    const rubro = rubroDe(state, item.id);
    (porRubro.get(rubro) || porRubro.get('otros')).push(item);
  }
  const grupos = [...porRubro]
    .filter(([, items]) => items.length)
    .map(([rubro, items]) => {
      const dentro = items
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'))
        .map(item => `<option value="${esc(item.id)}"${item.id === elegido ? ' selected' : ''}>${esc(item.name)}</option>`)
        .join('');
      return `<optgroup label="${esc(RUBROS.find(fila => fila.id === rubro)?.titulo || rubro)}">${dentro}</optgroup>`;
    })
    .join('');
  return `<option value=""${elegido ? '' : ' selected'}>Elegir un alimento</option>${grupos}`;
}

/* La fila de un alimento: el alimento y nada más.

   Una casa apunta «locrio: arroz, pollo, aceitunas» mucho antes de saber
   cuántas tazas, y muchas veces no lo sabe nunca. Lo que lleva sirve para
   avisar de las alergias, y para eso el nombre basta. Cuánto se compra se
   escribe en la compra, delante del estante, que es donde se sabe. */
export function filaDeAlimento(state, item = {}) {
  return `<div class="item-row item-row-simple" data-item-row><input type="hidden" name="itemId" value="${esc(item.id || '')}">
    <label class="field"><span>Alimento</span><select name="productId" required>${opcionesDeAlimento(state, item.productId || '')}</select></label>
    <button type="button" class="btn btn-quiet remove-item" data-action="remove-item" aria-label="Quitar alimento">${icono('cerrar', { tamano: 18 })}</button></div>`;
}

/* ── Los campos ────────────────────────────────────────────────────────────

   `receta` puede ser una de verdad —se está editando— o el borrador que el
   recorrido guarda entre pintada y pintada, que tiene la misma forma pero
   todavía no existe en el estado. */
/* El ejemplo del nombre es corto a propósito. Decía «Ej. Mangú de plátano
   maduro con salami» y en un teléfono de 375 px el campo lo cortaba justo en
   «con sal» —medido: 329 px de texto en 279 de hueco—, así que se leía como
   otra receta y con un ingrediente que nadie registra como producto.

   Lo que el marcador tiene que hacer es nombrar alimentos que de verdad estén
   en el catálogo, para que el autorrelleno se vea funcionar a la primera. La
   lección no se pierde por acortarlo: la da la ayuda de debajo, que se ve
   entera porque no vive dentro de una caja de ancho fijo.

   Esa ayuda tampoco dice ya «di de qué es». Pedía una construcción —«mangú DE
   plátano maduro»— y quien la lee de pie en la cocina no sabe qué se le está
   pidiendo. Ahora pide el alimento principal y sus acompañantes, que es lo
   mismo dicho con las palabras de lo que se come. */
export function camposDePreparacion(state, receta = {}) {
  const momentos = receta.uses || [];
  const items = receta.items || [];
  return `<label class="field"><span>¿Cómo se llama?</span>
      <input name="nombre" data-preparacion-nombre required autocomplete="off" maxlength="60"
        value="${esc(receta.name || '')}" placeholder="Ej. Plátano maduro con salami" enterkeyhint="done">
      <small>Pon el <strong>alimento principal</strong> y sus <strong>acompañantes</strong>: «plátano maduro con salami», «arroz con pollo». Con eso, los alimentos de abajo se llenan solos.</small>
    </label>

    <div class="field">
      <span>¿En cuáles momentos suelen comerla? Puedes marcar más de uno.</span>
      <div class="checks receta-momentos">${MOMENTOS.map(momento => `<label class="chip-check"><input type="checkbox" name="momentos" value="${momento.id}" ${momentos.includes(momento.id) ? 'checked' : ''}><span>${esc(momento.etiqueta)}</span></label>`).join('')}</div>
      <small>El mangú con salami, por ejemplo, suele estar en Desayuno y en Cena.</small>
    </div>

    <div class="field">
      <span>¿Qué alimentos lleva? <span class="muted">(opcional)</span></span>
      <p class="small muted">Se llenan solos con lo que diga el nombre, y se pueden cambiar. Sirven para avisarte si alguien de la casa debe evitar alguno. No hace falta decir cuánto, ni anotar la sal, el agua, el aceite ni los condimentos.</p>
      <div data-item-list="receta">${items.map(item => filaDeAlimento(state, item)).join('')}</div>
      <div class="inline">${button('+ Añadir alimento', 'add-item', 'btn-secondary btn-small', 'data-type="receta"')}</div>
    </div>

    <label class="field"><span>Nota para quien cocina <span class="muted">(opcional)</span></span>
      <textarea name="nota" maxlength="140" placeholder="Ej. guardar lo que sobre para el desayuno del día siguiente" autocapitalize="sentences" spellcheck="true" enterkeyhint="done">${esc(receta.note || '')}</textarea>
    </label>`;
}

/* ── Llenar los alimentos con lo que dice el nombre ────────────────────────

   Se llama desde el oyente de teclas, así que toca el DOM a mano y no repinta:
   repintar mientras alguien escribe el nombre le movería el cursor.

   Solo AÑADE. Nunca quita una fila, aunque el nombre haya cambiado y el
   alimento ya no se nombre: quitar lo que otra persona puso a mano es el error
   caro, y dejar una fila de más se arregla con un toque en la equis. Por eso
   tampoco importa que acierte siempre.

   Devuelve cuántas filas añadió, que es lo que hace falta para decirlo en voz
   alta sin tener que contar dos veces. */
export function llenarAlimentosDelNombre(state, formulario) {
  if (!formulario) return 0;
  const nombre = formulario.querySelector('[data-preparacion-nombre]')?.value || '';
  const lista = formulario.querySelector('[data-item-list="receta"]');
  if (!lista) return 0;

  const puestos = new Set([...lista.querySelectorAll('[name="productId"]')].map(campo => campo.value).filter(Boolean));
  const vacias = [...lista.querySelectorAll('[data-item-row]')]
    .filter(fila => !fila.querySelector('[name="productId"]')?.value);

  let anadidos = 0;
  for (const item of alimentosEnElTexto(state, nombre)) {
    if (puestos.has(item.id)) continue;
    puestos.add(item.id);
    // Una fila en blanco que ya estuviera ahí se aprovecha antes de crear otra:
    // si no, tocar «+ Añadir alimento» y escribir después dejaría un hueco.
    const hueca = vacias.shift();
    if (hueca) hueca.querySelector('[name="productId"]').value = item.id;
    else lista.insertAdjacentHTML('beforeend', filaDeAlimento(state, { productId: item.id }));
    anadidos += 1;
  }
  return anadidos;
}

/* ── Leer lo que se escribió ───────────────────────────────────────────────

   Los dos formularios se leen igual porque los campos se llaman igual. Lo que
   cambia después —guardar y cerrar, o guardar y quedarse— lo decide quien
   llama. */
export function leerPreparacion(formulario, datos) {
  /* Dos concesiones, y las dos tienen motivo.

     El formulario puede no llegar: el recorrido inicial se prueba llamando a sus
     envíos con `null` y una pantalla fingida, que es como se comprueba sin
     navegador. Se busca entonces en el documento, que es lo que hacía el
     manejador de antes.

     Y `datos` puede ser un `Map` en vez de un `FormData`, por lo mismo. Un `Map`
     no tiene `getAll`, así que se pregunta antes de usarlo en vez de dar por
     hecho de qué clase es lo que llega. */
  const raiz = formulario || (typeof document === 'undefined' ? null : document);
  const momentos = typeof datos.getAll === 'function'
    ? datos.getAll('momentos').map(String)
    : [].concat(datos.get('momentos') || []).map(String);

  return {
    name: String(datos.get('nombre') ?? raiz?.querySelector('[data-preparacion-nombre]')?.value ?? '').trim(),
    uses: momentos,
    note: String(datos.get('nota') || '').trim(),
    items: [...(raiz?.querySelectorAll('[data-item-row]') || [])]
      .map(fila => ({
        id: fila.querySelector('[name="itemId"]')?.value || undefined,
        productId: fila.querySelector('[name="productId"]')?.value
      }))
      .filter(item => item.productId)
  };
}

// Para las pantallas que enseñan una preparación ya guardada.
export const nombreDelAlimento = (state, id) => product(state, id)?.name || 'Producto eliminado';
