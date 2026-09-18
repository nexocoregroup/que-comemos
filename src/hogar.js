// Quién vive en esta casa y qué evita cada quien.
//
// Es la única parte de la app donde un dato mal puesto puede hacer daño de
// verdad. Todo lo demás se equivoca en libras de arroz; aquí se equivoca en un
// maní. De ahí salen las tres reglas que gobiernan este archivo:
//
// 1. **Nada se inventa.** Si nadie ha dicho si es alergia o manía, la fila se
//    queda sin motivo y lo dice con esas palabras. No hay valor por defecto
//    para el motivo: elegir uno por la persona es exactamente el error que no
//    podemos permitirnos en las dos direcciones —una alergia rebajada a gusto,
//    o un gusto pintado de rojo hasta que nadie mire ya los rojos—.
//
// 2. **Una alergia se ve antes que una preferencia.** No porque sea más
//    urgente de leer, sino porque quien cocina mira la tarjeta tres segundos.
//
// 3. **El avance se guarda solo.** Quien está registrando a cuatro personas va
//    a ser interrumpido: es una casa. Cada toque escribe en el estado y el
//    estado se guarda; cerrar la app a mitad de la tercera ficha y volver
//    mañana devuelve exactamente la tercera ficha a medias.
//
// Lo que aquí NO hay, a propósito: peso, fecha de nacimiento, diagnósticos,
// medicación. La app no los usa para nada, y un dato de salud que no se usa es
// un dato de salud que solo puede filtrarse.

import { CLASES_DE_PERSONA, MOTIVOS_DE_RESTRICCION, activeProducts, esActiva, personasActivas, product, restriccionesDe, setPersonActive, upsertPerson } from './model.js';
import { button, conteo, esc, notice, productDatalist } from './ui-kit.js';
import { icono } from './icons.js';

/* ── Vocabulario ───────────────────────────────────────────────────────── */

// Las edades van entre paréntesis porque la clasificación no se usa para
// calcular nada todavía: sirve para que quien cocina sepa si está sirviendo a
// un niño de seis años o a un adolescente de dieciséis. Pedir la fecha de
// nacimiento para deducirlo sería pedir un dato personal para no usarlo.
export const CLASES = [
  { id: 'adulto', etiqueta: 'Adulto', ayuda: '18 años o más' },
  { id: 'adolescente', etiqueta: 'Adolescente', ayuda: 'De 12 a 17 años' },
  { id: 'nino', etiqueta: 'Niño o niña', ayuda: 'Menos de 12 años' }
];
export const claseDe = id => CLASES.find(item => item.id === id) || CLASES[0];

// `peso` ordena las restricciones en la tarjeta: lo que puede hacer daño va
// primero. `tono` es la clase de CSS, y es lo único que cambia de aspecto.
export const MOTIVOS = [
  { id: 'alergia', etiqueta: 'Alergia', corto: 'Alergia', marca: icono('aviso', { tamano: 16 }), tono: 'alergia', peso: 3, ayuda: 'Le hace daño. La app lo avisa en grande.' },
  { id: 'intolerancia', etiqueta: 'Intolerancia', corto: 'Intolerancia', marca: '!', tono: 'intolerancia', peso: 2, ayuda: 'Le sienta mal, aunque no sea peligroso.' },
  { id: 'preferencia', etiqueta: 'Prefiere evitarlo', corto: 'Lo evita', marca: '·', tono: 'preferencia', peso: 1, ayuda: 'No le gusta o ha decidido no comerlo.' }
];
const SIN_MOTIVO = { id: null, etiqueta: 'Sin decir', corto: 'Sin decir por qué', marca: '?', tono: 'sin-motivo', peso: 2.5, ayuda: 'Está anotado de antes y no dice por qué. La app avisa igual.' };
export const motivoDe = id => MOTIVOS.find(item => item.id === id) || SIN_MOTIVO;

// Un motivo sin decir pesa 2,5: se lee antes que una preferencia, porque podría
// ser una alergia, y después de una alergia confirmada, porque podría no serlo.
export const ordenarRestricciones = filas => [...filas].sort((a, b) => motivoDe(b.motivo).peso - motivoDe(a.motivo).peso);

export const nombreDelAlimento = (state, fila) =>
  fila.productId ? (product(state, fila.productId)?.name || 'Alimento eliminado') : fila.texto;

/* ── Por dónde va la configuración ─────────────────────────────────────── */

// Vive en `state.settings.hogar` y no en la interfaz: tiene que sobrevivir a
// cerrar la app y tiene que viajar a la cuenta con el resto de la casa. Los
// respaldos anteriores a esta versión no lo traen, así que se lee siempre por
// aquí y nunca a pelo.
export const HOGAR_DE_FABRICA = { estado: 'sin-empezar', total: 0, indice: 0, fichas: [], borrador: null };
export const hogarDe = state => ({ ...HOGAR_DE_FABRICA, ...(state?.settings?.hogar || {}) });
export function guardarHogar(state, cambios) {
  if (!state.settings || typeof state.settings !== 'object') state.settings = {};
  state.settings.hogar = { ...hogarDe(state), ...cambios };
  return state.settings.hogar;
}
// ¿Toca ofrecer la configuración guiada? Solo a quien todavía no tiene a nadie
// registrado y nunca la terminó. A quien ya montó su casa no se le vuelve a
// plantar un asistente delante.
export const tocaConfigurarElHogar = state =>
  hogarDe(state).estado !== 'listo' && !(state.people || []).length;

export const emptyHogar = () => ({ ficha: null, error: '', aviso: '' });

// Buscar en la pantalla sin dar por hecho que hay pantalla. Este módulo se
// carga también en las pruebas, donde no existe el documento; y sobre todo: si
// algo deja de estar donde se esperaba, la app tiene que seguir de pie.
const buscar = selector => (typeof document === 'undefined' ? null : document.querySelector(selector));

const fichaVacia = () => ({ id: '', nombre: '', kind: 'adulto', restricciones: [], texto: '', motivo: null, error: '' });

// La ficha editable que sale de una persona ya guardada.
export const fichaDe = persona => ({
  id: persona.id,
  nombre: persona.name,
  kind: CLASES_DE_PERSONA.includes(persona.kind) ? persona.kind : 'adulto',
  restricciones: restriccionesDe(persona).map(fila => ({ ...fila })),
  texto: '', motivo: null, error: ''
});

/* ── El borrador que se está editando ──────────────────────────────────────

   Hay dos sitios donde se edita una persona: el asistente guiado, que es una
   página, y la ventana de «Editar» desde Familia. Son el mismo formulario y las
   mismas acciones; lo único que cambia es dónde vive el borrador.

   En el asistente vive en el estado, porque tiene que sobrevivir a que se cierre
   la app. En la ventana vive en la interfaz, porque cerrarla sin guardar
   significa descartar, y guardar algo que se va a descartar sería mentirle a
   quien pulsó la ×. */

const enVentana = ctx => ctx.ui.modal?.type === 'persona';

export function fichaActiva(ctx) {
  if (enVentana(ctx)) return ctx.ui.hogar?.ficha || fichaVacia();
  return hogarDe(ctx.state).borrador || fichaVacia();
}

function cambiarFicha(ctx, cambios, { pintar = true } = {}) {
  const ficha = { ...fichaActiva(ctx), ...cambios };
  if (enVentana(ctx)) {
    ctx.ui.hogar = ctx.ui.hogar || emptyHogar();
    ctx.ui.hogar.ficha = ficha;
    if (pintar) ctx.render();
    return ficha;
  }
  guardarHogar(ctx.state, { borrador: ficha });
  // `commit` guarda en el cajón de esta cuenta y apunta el cambio para subirlo.
  // Es lo que convierte «se guarda automáticamente» en algo que de verdad
  // sobrevive a cerrar la app.
  if (pintar) ctx.commit('');
  return ficha;
}

/* ── Pintar una restricción ────────────────────────────────────────────── */

// La ficha de un alimento que alguien evita. Es lo único de esta pantalla que
// alguien va a leer con prisa, así que lleva el motivo escrito con palabras y
// no solo un color: un semáforo de colores no lo lee quien no distingue rojo de
// verde, y aquí eso no es un detalle de accesibilidad, es el aviso.
export function chipDeRestriccion(state, fila, { quitar = '' } = {}) {
  const motivo = motivoDe(fila.motivo);
  const nombre = nombreDelAlimento(state, fila);
  return `<span class="restriccion restriccion-${motivo.tono}">
    <span class="restriccion-marca" aria-hidden="true">${motivo.marca}</span>
    <span class="restriccion-texto"><strong>${esc(nombre)}</strong><small>${esc(motivo.corto)}${fila.productId ? '' : ' · no está en tu lista todavía'}</small></span>
    ${quitar ? `<button type="button" class="restriccion-quitar" data-action="${esc(quitar)}" data-clave="${esc(claveDeFila(fila))}" aria-label="Quitar ${esc(nombre)}">×</button>` : ''}
  </span>`;
}

// Una fila se identifica por su alimento, que es lo único estable: el índice se
// mueve en cuanto se quita otra.
export const claveDeFila = fila => (fila.productId ? `id:${fila.productId}` : `txt:${String(fila.texto || '')}`);

// Lo que se enseña de una persona en la tarjeta de Familia: las alergias
// primero y en su propia línea, el resto detrás.
export function resumenDeRestricciones(state, persona) {
  const filas = ordenarRestricciones(restriccionesDe(persona));
  if (!filas.length) return '<p class="small muted">No evita ningún alimento.</p>';
  return `<div class="restricciones">${filas.map(fila => chipDeRestriccion(state, fila)).join('')}</div>`;
}

/* ── El formulario de una persona ──────────────────────────────────────── */

// Tres preguntas y ninguna más: cómo se llama, qué edad tiene por encima, y qué
// no come. La tercera es opcional y lo dice.
export function cuerpoDeFicha(ctx, ficha, { prefijo = 'hogar' } = {}) {
  const { state } = ctx;
  const nombre = String(ficha.nombre || '').trim();
  const aQuien = nombre ? esc(nombre) : 'esta persona';
  const filas = ordenarRestricciones(ficha.restricciones || []);
  return `
    <label class="field">
      <span>¿Cómo se llama?</span>
      <input name="nombre" data-hogar-nombre autocomplete="off" required maxlength="40"
        value="${esc(ficha.nombre || '')}" placeholder="Su nombre, o como le llaman en casa">
      <small>Vale el apodo. Es solo para que tú sepas de quién se habla.</small>
    </label>

    <div class="field">
      <span>¿Qué es de la casa?</span>
      <div class="hogar-clases">${CLASES.map(clase => `
        <button type="button" class="hogar-clase ${ficha.kind === clase.id ? 'activa' : ''}"
          data-action="${esc(prefijo)}-clase" data-clase="${clase.id}" aria-pressed="${ficha.kind === clase.id}">
          <strong>${esc(clase.etiqueta)}</strong><small>${esc(clase.ayuda)}</small>
        </button>`).join('')}</div>
    </div>

    <div class="field hogar-evita">
      <span>¿Hay algo que ${aQuien} deba evitar?</span>
      <p class="small muted">Si no hay nada, pasa de largo: esto no es obligatorio.</p>
      ${filas.length ? `<div class="restricciones">${filas.map(fila => chipDeRestriccion(state, fila, { quitar: `${prefijo}-quitar` })).join('')}</div>` : ''}

      <div class="hogar-anadir">
        <label class="field">
          <span class="sr-only">Alimento que debe evitar</span>
          <input name="alimento" data-hogar-alimento list="lista-de-productos" autocomplete="off" maxlength="60"
            value="${esc(ficha.texto || '')}" placeholder="Busca o escribe: maní, leche, mariscos…">
        </label>
        <div class="hogar-motivos" role="group" aria-label="¿Por qué lo evita?">${MOTIVOS.map(motivo => `
          <button type="button" class="hogar-motivo motivo-${motivo.tono} ${ficha.motivo === motivo.id ? 'activo' : ''}"
            data-action="${esc(prefijo)}-motivo" data-motivo="${motivo.id}" aria-pressed="${ficha.motivo === motivo.id}"
            title="${esc(motivo.ayuda)}">${esc(motivo.etiqueta)}</button>`).join('')}</div>
        ${button('Añadir', `${prefijo}-anadir`, 'btn-secondary btn-small')}
      </div>
      ${ficha.error ? `<p class="hogar-error" role="alert">${esc(ficha.error)}</p>` : ''}
      <p class="tiny muted">Si el alimento no está en tu lista todavía, escríbelo igual: se guarda por su nombre y se enlaza solo el día que lo registres.</p>
    </div>
    ${productDatalist(activeProducts(state))}`;
}

/* ── La configuración guiada ───────────────────────────────────────────── */

export function renderHogar(ctx) {
  const hogar = hogarDe(ctx.state);
  if (hogar.estado === 'contando') return pantallaCuantos(hogar);
  if (hogar.estado === 'fichas') return pantallaFicha(ctx, hogar);
  if (hogar.estado === 'listo') return pantallaFinal(ctx);
  return pantallaInicio();
}

// La pantalla que promete una cosa antes de pedir nada. El texto es el que se
// pidió, palabra por palabra: dice para qué sirve contestar.
function pantallaInicio() {
  return `<section class="hogar hogar-inicio">
    <p class="eyebrow">Tu hogar</p>
    <h2 class="hogar-promesa">Vamos a conocer tu hogar. Esto nos ayudará a organizar las comidas y advertirte sobre alimentos que alguien debe evitar.</h2>
    <p class="muted">Son dos preguntas por persona y se tarda un minuto. Puedes salir cuando quieras: lo que lleves escrito se guarda solo.</p>
    <div class="pantalla-acciones">
      ${button('Empezar', 'hogar-empezar', 'btn-primary btn-grande')}
      ${button('Ahora no', 'hogar-salir', 'btn-quiet')}
    </div>
  </section>`;
}

function pantallaCuantos(hogar) {
  const total = Math.min(20, Math.max(1, Number(hogar.total) || 1));
  return `<section class="hogar">
    <div class="hogar-head"><div><p class="eyebrow">Tu hogar</p><h2>¿Cuántas personas viven en tu hogar?</h2></div></div>
    <p class="muted">Cuéntate a ti también. Si vives solo, deja el uno.</p>
    <form data-form="hogar-cuantos" class="hogar-contador">
      ${button('−', 'hogar-menos', 'hogar-paso', 'aria-label="Una persona menos"')}
      <label class="hogar-numero"><span class="sr-only">Personas que viven en el hogar</span>
        <input name="total" type="number" inputmode="numeric" min="1" max="20" value="${total}" required></label>
      ${button('+', 'hogar-mas', 'hogar-paso', 'aria-label="Una persona más"')}
      <button type="submit" class="btn btn-primary">Continuar</button>
    </form>
    <p class="tiny muted">Puedes añadir o quitar personas después, desde Ajustes → Familia y restricciones.</p>
    <div class="pantalla-acciones">${button('Salir', 'hogar-salir', 'btn-quiet btn-small')}</div>
  </section>`;
}

// Las fichas se enseñan todas, siempre: es lo que convierte «faltan tres» en
// algo que se ve en vez de algo que hay que recordar. La que se está llenando
// va marcada; las hechas llevan su nombre; las que faltan, su número.
function tiraDeFichas(ctx, hogar) {
  const total = Math.max(hogar.total, hogar.fichas.length, hogar.indice + 1);
  const casillas = [];
  for (let i = 0; i < total; i++) {
    const persona = ctx.state.people.find(item => item.id === hogar.fichas[i]);
    const estado = i === hogar.indice ? 'ahora' : persona ? 'hecha' : 'pendiente';
    casillas.push(`<li class="hogar-ficha-mini ${estado}" ${i === hogar.indice ? 'aria-current="step"' : ''}>
      <span class="hogar-ficha-num" aria-hidden="true">${persona ? '✓' : i + 1}</span>
      <span class="hogar-ficha-nombre">${persona ? esc(persona.name) : `Persona ${i + 1}`}</span>
    </li>`);
  }
  return `<ol class="hogar-tira">${casillas.join('')}</ol>`;
}

function pantallaFicha(ctx, hogar) {
  const ficha = hogar.borrador || fichaVacia();
  const total = Math.max(hogar.total, hogar.fichas.length, hogar.indice + 1);
  const ultima = hogar.indice >= total - 1;
  return `<section class="hogar">
    <div class="hogar-head">
      <div><p class="eyebrow">Persona ${hogar.indice + 1} de ${total}</p><h2>${ficha.id ? 'Revisa esta persona' : 'Cuéntame de esta persona'}</h2></div>
      ${button('Salir', 'hogar-salir', 'btn-quiet btn-small')}
    </div>
    ${tiraDeFichas(ctx, hogar)}
    <form data-form="hogar-ficha" class="hogar-cuerpo">
      ${cuerpoDeFicha(ctx, ficha, { prefijo: 'hogar' })}
      <div class="hogar-pie">
        ${hogar.indice > 0 ? button('Atrás', 'hogar-atras', 'btn-quiet') : '<span></span>'}
        <div class="inline">
          ${button('Saltar esta', 'hogar-saltar', 'btn-quiet btn-small')}
          <button type="submit" class="btn btn-primary">${ultima ? 'Guardar y terminar' : 'Guardar y seguir'}</button>
        </div>
      </div>
    </form>
    <p class="tiny muted">Lo que escribes se guarda solo. Si cierras la app, vuelves justo aquí.</p>
  </section>`;
}

function pantallaFinal(ctx) {
  const { state } = ctx;
  const gente = personasActivas(state);
  const conAlergia = gente.filter(persona => restriccionesDe(persona).some(fila => fila.motivo === 'alergia'));
  return `<section class="hogar hogar-final">
    <div class="hogar-head"><div><p class="eyebrow">Tu hogar</p><h2>Listo. Tu hogar quedó así.</h2></div></div>
    ${gente.length
      ? `<div class="grid grid-2">${gente.map(persona => `<article class="card hogar-tarjeta">
          <div class="between"><h3>${esc(persona.name)}</h3><span class="pill gray">${esc(claseDe(persona.kind).etiqueta)}</span></div>
          ${resumenDeRestricciones(state, persona)}
        </article>`).join('')}</div>`
      : `<p class="muted">No quedó nadie registrado. Puedes hacerlo cuando quieras desde Ajustes → Familia y restricciones.</p>`}
    ${conAlergia.length
      ? notice('Las alergias quedan avisadas', `Si una comida lleva algo que ${conAlergia.map(persona => esc(persona.name)).join(' o ')} no puede comer, la app no te deja guardarla sin decírtelo.`, 'warn')
      : ''}
    <p class="muted">Las comidas se preparan para toda la casa. Cuando alguien no coma, se marca ese día y ya.</p>
    <p class="hogar-siguiente"><strong>Lo siguiente son tus productos habituales:</strong> lo que normalmente compras para tu casa. Se pregunta rubro por rubro, sin pedirte cantidades, y se tarda unos minutos.</p>
    <div class="pantalla-acciones">
      ${button('Continuar', 'setup-open', 'btn-primary btn-grande')}
      ${button('Ahora no', 'hogar-terminar', 'btn-quiet')}
      ${button('Ver mi familia', 'navigate', 'btn-quiet', 'data-page="familia"')}
    </div>
  </section>`;
}

/* ── Guardar una ficha ─────────────────────────────────────────────────── */

// Lee el formulario que esté en pantalla y lo mezcla con el borrador. Se lee del
// DOM y no del evento porque el nombre y el alimento se escriben sin enviar
// nada: quien escribe «Sofía» y pulsa «Alergia» no puede perder «Sofía».
function leerDelFormulario(ctx, ficha) {
  const raiz = buscar('[data-form="hogar-ficha"]') || buscar('[data-form="persona"]');
  if (!raiz) return ficha;
  return {
    ...ficha,
    nombre: raiz.querySelector('[data-hogar-nombre]')?.value ?? ficha.nombre,
    texto: raiz.querySelector('[data-hogar-alimento]')?.value ?? ficha.texto
  };
}

// Añadir un alimento a la lista de lo que alguien evita. Las dos cosas son
// obligatorias —cuál y por qué— y por eso el error dice cuál de las dos falta,
// en vez de un «revisa el formulario» que no ayuda a nadie.
function anadirRestriccion(ctx) {
  const ficha = leerDelFormulario(ctx, fichaActiva(ctx));
  const texto = String(ficha.texto || '').trim();
  if (!texto) return cambiarFicha(ctx, { ...ficha, error: 'Escribe primero qué alimento hay que evitar.' });
  if (!MOTIVOS_DE_RESTRICCION.includes(ficha.motivo)) {
    return cambiarFicha(ctx, { ...ficha, error: 'Falta decir por qué: ¿alergia, intolerancia, o simplemente lo evita?' });
  }
  const yaEsta = (ficha.restricciones || []).some(fila =>
    nombreDelAlimento(ctx.state, fila).trim().toLocaleLowerCase('es') === texto.toLocaleLowerCase('es'));
  if (yaEsta) return cambiarFicha(ctx, { ...ficha, texto: '', error: `«${texto}» ya estaba anotado.` });
  return cambiarFicha(ctx, {
    ...ficha,
    restricciones: [...(ficha.restricciones || []), { productId: null, texto, motivo: ficha.motivo }],
    texto: '', motivo: null, error: ''
  });
}

// Guardar de verdad. `upsertPerson` normaliza y enlaza por su cuenta: el texto
// que coincida con un alimento de la casa deja de ser texto y pasa a apuntar al
// alimento, sin que aquí haya que saber nada de eso.
function guardarFicha(ctx, ficha, habitual) {
  const nombre = String(ficha.nombre || '').trim();
  if (!nombre) throw new Error('Escribe el nombre de la persona.');
  return upsertPerson(ctx.state, {
    id: ficha.id || undefined,
    name: nombre,
    kind: ficha.kind,
    restricciones: ficha.restricciones || [],
    // «Cuánto come normalmente» solo viaja cuando el formulario la traía. El
    // asistente no la pregunta, y guardar desde él no puede borrar lo que
    // alguien escribió en la ventana de Familia.
    habitual: Array.isArray(habitual) ? habitual : (ctx.state.people.find(item => item.id === ficha.id)?.habitual || [])
  });
}

/* ── Acciones ──────────────────────────────────────────────────────────── */

export const HOGAR_ACTIONS = {
  // Entrar a la configuración guiada desde donde sea.
  'hogar-open': (el, ctx) => {
    ctx.ui.modal = null;
    ctx.ui.page = 'hogar';
    const hogar = hogarDe(ctx.state);
    // Volver a entrar después de haberla terminado es empezar de nuevo, pero
    // sin borrar a nadie: las fichas viejas se quedan y se añaden las que falten.
    if (hogar.estado === 'listo' || hogar.estado === 'sin-empezar') {
      guardarHogar(ctx.state, { estado: 'sin-empezar', indice: 0, borrador: null });
    }
    ctx.commit('');
  },
  'hogar-empezar': (el, ctx) => {
    const gente = ctx.state.people.filter(esActiva);
    guardarHogar(ctx.state, { estado: 'contando', total: Math.max(1, gente.length || 1) });
    ctx.commit('');
  },
  'hogar-mas': (el, ctx) => ajustarTotal(ctx, 1),
  'hogar-menos': (el, ctx) => ajustarTotal(ctx, -1),

  'hogar-clase': (el, ctx) => {
    const ficha = leerDelFormulario(ctx, fichaActiva(ctx));
    cambiarFicha(ctx, { ...ficha, kind: CLASES_DE_PERSONA.includes(el.dataset.clase) ? el.dataset.clase : 'adulto' });
  },
  'hogar-motivo': (el, ctx) => {
    const ficha = leerDelFormulario(ctx, fichaActiva(ctx));
    // Tocar un motivo siempre lo elige, nunca lo quita. Un interruptor aquí
    // sería una trampa: quien vuelve a tocar «Alergia» para confirmarla la
    // estaría apagando, y el aviso que creyó dejar puesto no existiría.
    // Cambiar de idea se hace tocando otro de los tres.
    const motivo = el.dataset.motivo;
    if (!MOTIVOS_DE_RESTRICCION.includes(motivo)) return;
    cambiarFicha(ctx, { ...ficha, motivo, error: '' });
    // Elegir el motivo no decía nada, y la pantalla se repinta entera: quien no
    // la ve no tenía forma de saber si el toque entró. El desplazamiento y el
    // foco ya los conserva `render()`; lo que faltaba era decirlo.
    ctx.anunciar?.(`${el.textContent.trim()}, elegido.`);
  },
  'hogar-anadir': (el, ctx) => { anadirRestriccion(ctx); },
  'hogar-quitar': (el, ctx) => {
    const ficha = leerDelFormulario(ctx, fichaActiva(ctx));
    cambiarFicha(ctx, { ...ficha, restricciones: (ficha.restricciones || []).filter(fila => claveDeFila(fila) !== el.dataset.clave), error: '' });
  },

  'hogar-atras': (el, ctx) => {
    const hogar = hogarDe(ctx.state);
    const indice = Math.max(0, hogar.indice - 1);
    const persona = ctx.state.people.find(item => item.id === hogar.fichas[indice]);
    guardarHogar(ctx.state, { indice, borrador: persona ? fichaDe(persona) : fichaVacia() });
    ctx.commit('');
  },
  'hogar-saltar': (el, ctx) => { avanzar(ctx, null); },
  'hogar-salir': (el, ctx) => {
    // Salir no descarta nada: el borrador se queda escrito donde estaba.
    ctx.ui.page = 'hoy';
    ctx.commit('');
    ctx.toast('Guardado. Puedes retomarlo desde Ajustes → Familia.');
  },
  'hogar-terminar': (el, ctx) => {
    guardarHogar(ctx.state, { estado: 'listo', borrador: null });
    ctx.ui.page = 'hoy';
    ctx.commit('');
  },

  // Desde Familia: añadir, editar y dar de baja sin pasar por el asistente.
  'hogar-editar': (el, ctx) => {
    const persona = ctx.state.people.find(item => item.id === el.dataset.id);
    ctx.ui.hogar = ctx.ui.hogar || emptyHogar();
    ctx.ui.hogar.ficha = persona ? fichaDe(persona) : fichaVacia();
    ctx.openModal('persona', { id: persona?.id || '' });
  },
  'hogar-baja': (el, ctx) => {
    const persona = setPersonActive(ctx.state, el.dataset.id, false);
    cerrarLaFicha(ctx);
    ctx.commit(`${persona.name} ya no cuenta para las comidas nuevas. Lo de antes se queda como estaba.`);
  },
  'hogar-alta': (el, ctx) => {
    const persona = setPersonActive(ctx.state, el.dataset.id, true);
    cerrarLaFicha(ctx);
    ctx.commit(`${persona.name} vuelve a contar para las comidas.`);
  }
};

// Al dar a «Guardar» con un alimento a medio escribir pasan dos cosas distintas
// según lo que falte, y ninguna de las dos es tirar lo escrito:
//
//  · Si ya se eligió el motivo, se añade y se sigue en la misma ficha. Es lo que
//    quiere quien escribió «maní», tocó «Alergia» y pulsó Intro sin ver el botón
//    de al lado.
//  · Si no se eligió, se dice qué falta y se queda todo en pantalla.
//
// Devuelve `true` cuando se ha ocupado del asunto y no hay que guardar todavía.
function quedabaAlgoPorAnadir(ctx, verbo) {
  const ficha = leerDelFormulario(ctx, fichaActiva(ctx));
  if (!String(ficha.texto || '').trim()) { cambiarFicha(ctx, { ...ficha, error: '' }, { pintar: false }); return false; }
  if (!MOTIVOS_DE_RESTRICCION.includes(ficha.motivo)) {
    cambiarFicha(ctx, { ...ficha, error: `Te queda «${String(ficha.texto).trim()}» sin añadir. Di si es alergia, intolerancia o algo que evita, o borra el campo antes de ${verbo}.` });
    return true;
  }
  anadirRestriccion(ctx);
  ctx.toast('Alimento añadido. Ahora sí puedes continuar.');
  return true;
}

// Dar de baja desde dentro de la ventana la cierra: lo que se estuviera
// escribiendo en ese momento ya no tiene dónde ir, y dejarla abierta con un
// borrador que no se va a guardar es prometer algo que no se cumple.
function cerrarLaFicha(ctx) {
  if (!ctx.ui.modal) return;
  if (ctx.ui.hogar) ctx.ui.hogar.ficha = null;
  ctx.ui.modal = null;
}

function ajustarTotal(ctx, delta) {
  const campo = buscar('[data-form="hogar-cuantos"] [name="total"]');
  const actual = Number(campo?.value) || hogarDe(ctx.state).total || 1;
  guardarHogar(ctx.state, { total: Math.min(20, Math.max(1, actual + delta)) });
  ctx.commit('');
}

// Pasar a la siguiente ficha. `personaId` es quién quedó guardado en la actual,
// o `null` si se saltó.
function avanzar(ctx, personaId) {
  const hogar = hogarDe(ctx.state);
  const fichas = [...hogar.fichas];
  fichas[hogar.indice] = personaId;
  const total = Math.max(hogar.total, fichas.length);
  const indice = hogar.indice + 1;
  if (indice >= total) {
    guardarHogar(ctx.state, { estado: 'listo', fichas, indice: hogar.indice, borrador: null });
    ctx.commit('');
    return;
  }
  const siguiente = ctx.state.people.find(item => item.id === fichas[indice]);
  guardarHogar(ctx.state, { fichas, indice, borrador: siguiente ? fichaDe(siguiente) : fichaVacia() });
  ctx.commit('');
}

export const HOGAR_FORMS = {
  'hogar-cuantos': (form, data, ctx) => {
    const total = Math.min(20, Math.max(1, Math.round(Number(data.get('total')) || 1)));
    const hogar = hogarDe(ctx.state);
    // Si ya había gente registrada —porque se vuelve a pasar por aquí— las
    // primeras fichas se estrenan con ellos y no se duplica a nadie.
    const yaEstaban = ctx.state.people.filter(esActiva).map(persona => persona.id);
    const fichas = Array.from({ length: total }, (unused, i) => hogar.fichas[i] ?? yaEstaban[i] ?? null);
    const primera = ctx.state.people.find(item => item.id === fichas[0]);
    guardarHogar(ctx.state, { estado: 'fichas', total, indice: 0, fichas, borrador: primera ? fichaDe(primera) : fichaVacia() });
    ctx.commit('');
    buscar('[data-hogar-nombre]')?.focus();
  },

  'hogar-ficha': (form, data, ctx) => {
    if (quedabaAlgoPorAnadir(ctx, 'seguir')) return;
    const ficha = fichaActiva(ctx);
    if (!String(ficha.nombre || '').trim()) {
      cambiarFicha(ctx, { ...ficha, error: 'Escribe el nombre de esta persona, o toca «Saltar esta».' });
      return;
    }
    const persona = guardarFicha(ctx, ficha);
    avanzar(ctx, persona.id);
  },

  // El mismo formulario, desde la ventana de Familia.
  'persona': (form, data, ctx) => {
    if (quedabaAlgoPorAnadir(ctx, 'guardar')) return;
    const ficha = fichaActiva(ctx);
    // Las cantidades habituales las sabe leer app.js, que es quien dibuja esas
    // filas. Si la ventana no las trae, no se tocan.
    const persona = guardarFicha(ctx, ficha, ctx.leerHabitual ? ctx.leerHabitual(form) : undefined);
    if (ctx.ui.hogar) ctx.ui.hogar.ficha = null;
    ctx.closeModal();
    const sinMotivo = restriccionesDe(persona).filter(fila => !fila.motivo).length;
    ctx.commit(sinMotivo
      ? `Guardado. Queda${sinMotivo === 1 ? '' : 'n'} ${conteo(sinMotivo, 'alimento', 'alimentos')} sin decir por qué se evita${sinMotivo === 1 ? '' : 'n'}.`
      : 'Guardado.');
  }
};
