/* Los iconos de la aplicación.
 *
 * Antes eran emoji. Un emoji lo dibuja el sistema operativo, no nosotros: el
 * mismo ☀️ sale amarillo y con relieve en un teléfono, plano y naranja en otro,
 * y azul en Windows. Puestos uno al lado del otro en la barra de abajo —un sol
 * amarillo, un cuadro gris, una canasta marrón y tres puntos— no parecen partes
 * de la misma aplicación, porque literalmente no los dibujó la misma mano.
 *
 * Estos sí. Todos viven en la misma retícula de 24×24, con el mismo grosor de
 * trazo y las mismas esquinas redondeadas, y ninguno trae color propio: heredan
 * el del texto que los acompaña con `currentColor`. Así el icono de una fila
 * activa se pone terracota y el de una inactiva se apaga, sin dibujar dos
 * versiones de nada.
 *
 * Cómo se usa:
 *
 *     import { icono } from './icons.js';
 *     `<button>${icono('canasta')} Compra</button>`
 *
 * El tamaño se pide en píxeles y por defecto son 20, que es lo que pide la
 * mayoría de los sitios donde aparecen. El SVG sale con `aria-hidden` puesto
 * porque al lado siempre hay una palabra: un lector de pantalla que anunciara
 * «imagen, canasta» antes de «Compra» estaría diciendo la misma cosa dos veces.
 * Cuando el icono va solo —el botón de cerrar, el de menú— quien lo llama pone
 * el `aria-label` en el botón, no aquí.
 */

// El trazo es 1.7 y no 2: a 20 px un trazo de 2 empasta los iconos que tienen
// dos líneas cerca —el libro, el chip— y los convierte en manchas. A 1.7 se
// siguen leyendo y siguen teniendo cuerpo.
const TRAZO = 1.7;

// Los que se dibujan con relleno en vez de contorno. Son los que sin relleno no
// se verían: un punto de 1 px de radio con contorno es un anillo vacío.
const RELLENO = 'fill="currentColor" stroke="none"';

const DIBUJOS = {

  /* ── Navegación ───────────────────────────────────────────────────────── */

  sol: `<circle cx="12" cy="12" r="4.1"/>
    <path d="M12 2.4V5M12 19v2.6M2.4 12H5M19 12h2.6M5.1 5.1 7 7M17 17l1.9 1.9M18.9 5.1 17 7M7 17l-1.9 1.9"/>`,

  calendario: `<rect x="3.2" y="5.2" width="17.6" height="15.6" rx="3"/>
    <path d="M8 2.6v5M16 2.6v5M3.2 10.4h17.6"/>
    <circle cx="8.3" cy="14.8" r="1" ${RELLENO}/>
    <circle cx="12" cy="14.8" r="1" ${RELLENO}/>
    <circle cx="15.7" cy="14.8" r="1" ${RELLENO}/>`,

  canasta: `<path d="M3.4 8.8h17.2l-1.7 9.9a2.4 2.4 0 0 1-2.4 2H7.5a2.4 2.4 0 0 1-2.4-2Z"/>
    <path d="M8.4 8.8V7a3.6 3.6 0 0 1 7.2 0v1.8"/>
    <path d="M9.9 12.6v4M14.1 12.6v4"/>`,

  puntos: `<circle cx="5.2" cy="12" r="1.7" ${RELLENO}/>
    <circle cx="12" cy="12" r="1.7" ${RELLENO}/>
    <circle cx="18.8" cy="12" r="1.7" ${RELLENO}/>`,

  /* ── Las acciones del botón «+» ───────────────────────────────────────── */

  plato: `<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.2"/>`,

  libro: `<path d="M12 7.1C10.3 5.6 7.9 5 4.7 5.2a.9.9 0 0 0-.9.9v11.4a.9.9 0 0 0 .9.9c3 .2 5.6.7 7.3 2.1"/>
    <path d="M12 7.1c1.7-1.5 4.1-2.1 7.3-1.9a.9.9 0 0 1 .9.9v11.4a.9.9 0 0 1-.9.9c-3 .2-5.6.7-7.3 2.1"/>
    <path d="M12 7.1v13.4"/>`,

  hoja: `<path d="M4.8 19.2C4.2 10.8 10.2 4.8 20 4.8c.5 8.6-5.6 14.8-15.2 14.4Z"/>
    <path d="M4.8 19.2c2.8-2.9 6-5.9 9.9-7.9"/>`,

  /* ── Gente y tiempo ───────────────────────────────────────────────────── */

  persona: `<circle cx="12" cy="8" r="3.7"/><path d="M4.8 20.4a7.6 7.6 0 0 1 14.4 0"/>`,

  personas: `<circle cx="9.2" cy="8.4" r="3.3"/>
    <path d="M2.8 20.2a6.5 6.5 0 0 1 12.8 0"/>
    <circle cx="17.8" cy="10.2" r="2.4"/>
    <path d="M16.6 15.6a5 5 0 0 1 4.6 4.6"/>`,

  reloj: `<circle cx="12" cy="12" r="8.6"/><path d="M12 6.9V12l3.5 2.1"/>`,

  repetir: `<path d="M4.2 10.4A8.2 8.2 0 0 1 19.3 7.9"/>
    <path d="M19.8 3.6v4.6h-4.6"/>
    <path d="M19.8 13.6a8.2 8.2 0 0 1-15.1 2.5"/>
    <path d="M4.2 20.4v-4.6h4.6"/>`,

  /* ── Ajustes y estado ─────────────────────────────────────────────────── */

  ajustes: `<path d="M3.6 7.6h16.8M3.6 16.4h16.8"/>
    <circle cx="9" cy="7.6" r="2.5"/><circle cx="15" cy="16.4" r="2.5"/>`,

  chip: `<rect x="7.6" y="7.6" width="8.8" height="8.8" rx="1.8"/>
    <path d="M10 3.4v4.2M14 3.4v4.2M10 16.4v4.2M14 16.4v4.2M3.4 10h4.2M3.4 14h4.2M16.4 10h4.2M16.4 14h4.2"/>`,

  descargar: `<path d="M12 3.6v11.2"/><path d="M7.7 10.5 12 14.8l4.3-4.3"/>
    <path d="M4.2 16.6v2.2a1.8 1.8 0 0 0 1.8 1.8h12a1.8 1.8 0 0 0 1.8-1.8v-2.2"/>`,

  candado: `<rect x="4.4" y="10.4" width="15.2" height="10.2" rx="2.6"/>
    <path d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8"/>`,

  aviso: `<path d="M12 3.6 21.6 20.2H2.4Z"/><path d="M12 9.6v4.4"/>
    <circle cx="12" cy="17.4" r="1.1" ${RELLENO}/>`,

  chispa: `<path d="M12 2.8 13.9 10.1 21.2 12 13.9 13.9 12 21.2 10.1 13.9 2.8 12 10.1 10.1Z"/>`,

  /* ── Señales de siempre ───────────────────────────────────────────────── */

  visto: `<path d="M4.6 12.8 9.6 17.8 19.4 6.4"/>`,
  cerrar: `<path d="M6.3 6.3 17.7 17.7M17.7 6.3 6.3 17.7"/>`,
  menu: `<path d="M4 7h16M4 12h16M4 17h16"/>`,
  mas: `<path d="M12 5v14M5 12h14"/>`,
  derecha: `<path d="M4.4 12h15.2M13.5 5.9 19.6 12l-6.1 6.1"/>`,
  izquierda: `<path d="M19.6 12H4.4M10.5 18.1 4.4 12l6.1-6.1"/>`,
  arriba: `<path d="M12 19.6V4.4M5.9 10.5 12 4.4l6.1 6.1"/>`,
  abajo: `<path d="M12 4.4v15.2M18.1 13.5 12 19.6l-6.1-6.1"/>`,
  desplegar: `<path d="M6.4 9.4 12 15l5.6-5.6"/>`,
  deshacer: `<path d="M3.8 5.6v5.6h5.6"/><path d="M6.1 16.4a7.9 7.9 0 1 0-2.1-5.2"/>`,

  /* ── Las categorías de alimentos ──────────────────────────────────────── */

  viveres: `<path d="M15.2 4.4c3.2 0 5 2.4 4.4 5.6-.6 3-1 4.4-2.4 6.4-1.7 2.4-4.7 3.2-7.6 2.4-3-.8-5.8-3.2-5.8-6.4 0-2.9 2.3-4.5 4.8-5.3 2.1-.7 3.9-2.7 6.6-2.7Z"/>
    <circle cx="10.2" cy="11.2" r=".9" ${RELLENO}/>
    <circle cx="14.4" cy="14.4" r=".9" ${RELLENO}/>`,

  granos: `<path d="M3.2 11.9h17.6a8.8 8.8 0 0 1-17.6 0Z"/>
    <path d="M8.6 20.8h6.8"/>
    <path d="M9.4 8.6c-.8-1 -.6-2.2.3-3M14.3 8.4c-.8-1.2-.5-2.6.6-3.5"/>`,

  // Un corte, no un muslo: el hueso del muslo obliga a dibujar dos nudos de
  // 2 px que a tamaño de lista se juntan en un borrón. El corte es una forma
  // sola con su veta dentro, y eso sí aguanta 18 px.
  carnes: `<path d="M6.8 6.6c3-2.7 8.4-3.1 11.4-.6 3.1 2.5 3.3 7.2.8 10.2-2.5 3.1-7.2 3.7-10.5 1.4-3.4-2.4-4.4-8.4-1.7-11Z"/>
    <path d="M10.9 10.8c1.9-.7 3.8.2 4.6 1.9"/>`,

  embutidos: `<rect x="4" y="9.2" width="16" height="5.6" rx="2.8" transform="rotate(-45 12 12)"/>
    <path d="M4.6 19.4 6.3 17.7M17.7 6.3l1.7-1.7"/>`,

  // El cuerpo es una elipse y no una lente: con las dos puntas afiladas el
  // dibujo se leía como un ojo. Con la cola pegada a un óvalo, es un pez.
  mar: `<ellipse cx="14.2" cy="12" rx="6.2" ry="5.2"/>
    <path d="M8 12 3.2 8.2v7.6Z"/>
    <circle cx="17.4" cy="10.4" r=".95" ${RELLENO}/>`,

  lacteos: `<path d="M12 3.6c3.4 0 6.2 5 6.2 9.1a6.2 6.2 0 0 1-12.4 0c0-4.1 2.8-9.1 6.2-9.1Z"/>`,

  panes: `<path d="M4.2 12.6a4 4 0 0 1 2.2-7.4h11.2a4 4 0 0 1 2.2 7.4v4.8a2.4 2.4 0 0 1-2.4 2.4H6.6a2.4 2.4 0 0 1-2.4-2.4Z"/>
    <path d="M9.6 12.4v6.6M14.4 12.4v6.6"/>`,

  frutas: `<path d="M12 8.4c-1-.9-2.2-1.4-3.6-1.4-2.9 0-4.8 2.4-4.8 5.8 0 3.9 3.2 8 5.8 8 1 0 1.8-.5 2.6-.5s1.6.5 2.6.5c2.6 0 5.8-4.1 5.8-8 0-3.4-1.9-5.8-4.8-5.8-1.4 0-2.6.5-3.6 1.4Z"/>
    <path d="M12 8.4V5.2M12 5.2c0-1.4 1.2-2.6 2.8-2.6"/>`,

  vegetales: `<path d="M4.8 19.2C4.2 10.8 10.2 4.8 20 4.8c.5 8.6-5.6 14.8-15.2 14.4Z"/>
    <path d="M4.8 19.2c2.8-2.9 6-5.9 9.9-7.9"/>`,

  condimentos: `<path d="M7.6 9.2h8.8l1 9.4a2.2 2.2 0 0 1-2.2 2.4H8.8a2.2 2.2 0 0 1-2.2-2.4Z"/>
    <path d="M8.8 9.2V6.8a3.2 3.2 0 0 1 6.4 0v2.4"/>
    <circle cx="10.6" cy="13.6" r=".85" ${RELLENO}/>
    <circle cx="13.4" cy="13.6" r=".85" ${RELLENO}/>
    <circle cx="12" cy="16.6" r=".85" ${RELLENO}/>`,

  bebidas: `<path d="M6.4 4.4h11.2l-1.4 15a1.8 1.8 0 0 1-1.8 1.6H9.6a1.8 1.8 0 0 1-1.8-1.6Z"/>
    <path d="M6.9 10.2h10.2"/>
    <path d="M13.6 4.4 15.8 1.8"/>`,

  limpieza: `<path d="M9.4 9.6h7.2a2 2 0 0 1 2 2.2l-.7 7a2.4 2.4 0 0 1-2.4 2.2h-5a2.4 2.4 0 0 1-2.4-2.2l-.7-7a2 2 0 0 1 2-2.2Z"/>
    <path d="M11.4 9.6V5.4a2 2 0 0 1 2-2h1.4"/>
    <path d="M5.2 6.2h2.4M4.4 10h2M5.6 13.8h2"/>`,

  higiene: `<path d="M12 3.4c3.6 4 6.4 7.2 6.4 10.6a6.4 6.4 0 0 1-12.8 0c0-3.4 2.8-6.6 6.4-10.6Z"/>
    <path d="M9.2 14.6a2.8 2.8 0 0 0 2.8 2.8"/>`,

  otros: `<path d="M12 3.4 20.4 7.9v8.2L12 20.6 3.6 16.1V7.9Z"/>
    <path d="M3.6 7.9 12 12.4l8.4-4.5M12 12.4v8.2"/>`
};

// Qué icono le toca a cada categoría de alimentos. Se guarda aquí y no en
// catalog-seed.js a propósito: el catálogo describe qué come una casa, y eso no
// debería cambiar porque cambie un dibujo.
export const ICONO_DE_CATEGORIA = {
  viveres: 'viveres', granos: 'granos', carnes: 'carnes', embutidos: 'embutidos',
  mar: 'mar', lacteos: 'lacteos', panes: 'panes', frutas: 'frutas',
  vegetales: 'vegetales', condimentos: 'condimentos', bebidas: 'bebidas',
  limpieza: 'limpieza', higiene: 'higiene', otros: 'otros',
  // Los rubros del registro inicial agrupan categorías y reusan sus dibujos.
  proteinas: 'carnes', desayunos: 'panes'
};

/* ── Pintar ───────────────────────────────────────────────────────────────── */

/**
 * Devuelve el SVG de un icono, listo para meter en una plantilla.
 *
 * Un nombre que no existe devuelve cadena vacía en vez de reventar. Es a
 * propósito: un icono es adorno al lado de una palabra, y ninguna pantalla de
 * esta app puede quedarse en blanco porque alguien escribiera mal el nombre de
 * un dibujo.
 */
export function icono(nombre, { tamano = 20, clase = '' } = {}) {
  const dibujo = DIBUJOS[nombre];
  if (!dibujo) return '';
  return `<svg class="ico${clase ? ` ${clase}` : ''}" width="${tamano}" height="${tamano}" viewBox="0 0 24 24"` +
    ` fill="none" stroke="currentColor" stroke-width="${TRAZO}" stroke-linecap="round" stroke-linejoin="round"` +
    ` aria-hidden="true" focusable="false">${dibujo}</svg>`;
}

/** El icono de una categoría de alimentos, o el de «otros» si no se reconoce. */
export const iconoDeCategoria = (id, opciones) =>
  icono(ICONO_DE_CATEGORIA[id] || 'otros', opciones);

/** Los nombres disponibles. La usan las pruebas y la hoja de contacto. */
export const nombresDeIconos = () => Object.keys(DIBUJOS);
