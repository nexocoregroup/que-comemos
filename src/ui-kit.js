// Los ladrillos con que se dibuja todo: escapado, formato de números y fechas,
// y los cuatro o cinco envoltorios de HTML que se repiten en cada pantalla.
//
// Están aquí y no en app.js porque las pantallas nuevas —la configuración
// inicial, el plan del mes, el asistente— también los necesitan, y tener
// dos versiones de `esc` es la forma más fácil de que a una se le olvide escapar
// algo. Ninguna de estas funciones sabe nada del estado: reciben lo que pintan.

import { icono } from './icons.js';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const fmt = value => new Intl.NumberFormat('es-DO', { maximumFractionDigits: 3 }).format(Number(value || 0));
export const cap = value => String(value || '').charAt(0).toUpperCase() + String(value || '').slice(1);
export const niceDate = (date, options = { weekday: 'long', day: 'numeric', month: 'long' }) => new Intl.DateTimeFormat('es-DO', options).format(new Date(`${date}T12:00:00`));
export const monthName = month => cap(new Intl.DateTimeFormat('es-DO', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`)));
export const shiftMonth = (month, delta) => {
  const d = new Date(`${month}-01T12:00:00`);
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const PLURALS = { unidad: 'unidades', taza: 'tazas', lata: 'latas', paquete: 'paquetes', rueda: 'ruedas', rebanada: 'rebanadas' };
export const unitText = (unit, amount) => (amount > 0 && amount <= 1 ? unit : PLURALS[unit] || unit);
export const measure = (amount, unit) => `${fmt(amount)} ${esc(unitText(unit, amount))}`;

export const button = (label, action, cls = 'btn-secondary', attrs = '') => `<button type="button" class="btn ${cls}" data-action="${action}" ${attrs}>${label}</button>`;

// El dibujo de un aviso depende de su tono. Antes los tres —el informativo, el
// de cuidado y el de error— enseñaban la misma estrellita, que es lo mismo que
// no enseñar nada: si el icono no cambia, no informa.
const ICONO_DE_TONO = { warn: 'aviso', error: 'aviso' };
export const notice = (title, detail, tone = '') => `<div class="notice ${tone}">${icono(ICONO_DE_TONO[tone] || 'chispa')}<div><strong>${title}</strong>${detail ? `<span>${detail}</span>` : ''}</div></div>`;

// `dibujo` es el nombre de un icono de icons.js, no un emoji. Es grande porque
// en una pantalla vacía el dibujo es lo único que hay antes del texto.
export const empty = (dibujo, title, text, action = '') => `<div class="empty"><span class="empty-ico">${icono(dibujo, { tamano: 34 })}</span><h3>${title}</h3><p>${text}</p>${action}</div>`;
export const modal = (title, subtitle, body, wide = false) => `<div class="modal-overlay" data-overlay><div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div><button type="button" class="icon-btn" data-action="close-modal" aria-label="Cerrar">${icono('cerrar', { tamano: 18 })}</button></div>${body}</div></div>`;
export const options = (values, selected, placeholder = '') => `${placeholder ? `<option value="">${placeholder}</option>` : ''}${values.map(([value, label]) => `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`).join('')}`;

// El buscador de alimentos. Un `input` con `datalist` en vez de un `select`
// porque quien está llenando su primera canasta todavía no tiene nada que
// elegir: escribe el nombre y el alimento se registra solo al guardar. Y quien
// ya tiene catálogo recibe las sugerencias sin cambiar de campo.
//
// El `datalist` lo dibuja `productDatalist` una vez por formulario; aquí solo se
// apunta a él. Funciona con teclado y con lector de pantalla sin nada añadido:
// es un campo de texto de toda la vida.
export const productField = (value = '', { name = 'name', label = 'Alimento', required = true, listId = 'lista-de-productos', placeholder = 'Ej. Arroz', extra = '' } = {}) =>
  `<label class="field product-field"><span>${esc(label)}</span><input name="${esc(name)}" list="${esc(listId)}" autocomplete="off" ${required ? 'required' : ''} value="${esc(value)}" placeholder="${esc(placeholder)}" ${extra}></label>`;

// Se ofrecen los activos primero y los archivados al final, marcados: siguen
// existiendo en el historial, pero no deben ser lo primero que se sugiere.
export const productDatalist = (products, id = 'lista-de-productos') => {
  const activos = products.filter(item => !item.archived);
  const archivados = products.filter(item => item.archived);
  return `<datalist id="${esc(id)}">${[...activos, ...archivados].map(item => `<option value="${esc(item.name)}">${item.archived ? 'archivado' : esc(item.category || '')}</option>`).join('')}</datalist>`;
};
