// El armazón de la aplicación: estado, navegación, ventanas y el reparto de
// eventos. Las pantallas viven cada una en su archivo.
//
// La barra tiene cinco secciones: Hoy, Plan semanal, Compra, Mis productos
// habituales y Preparaciones. Son las cinco cosas que se hacen; todo lo que se
// toca una vez y se olvida —la familia, el respaldo, la cuenta— está detrás del
// engranaje, en Ajustes.

import {
  ESTADOS_SIN_COMIDA, MOMENTOS, SLOTS, SLOTS_PRINCIPALES, UNITS, addDays, actualizarHabitual, agregarHabitual, anotarComidaSuelta, copyPlan, createEmptyState, dependents, esOpcional,
  etiquetaDeMomento, exportState, findSimilarProducts, habitualLines, importState, esActiva, isAbsent, makeRecipePlan, mergeProducts, movePlan, nextId,
  personasActivas, planFor, ponerFrecuencia, product, removeHabitualLine, rubroDe,
  resumenDeLista, reutilizarComida, setAbsence, setEquivalence,
  detalleDeOrigen, etiquetaDeOrigen, origenDe, setStatusPlan, sliceStyle, todayISO, updatePlan, updateProduct, upsertRecipe
} from './model.js';
import { clearAll, hasSavedState, loadStateDetailed, saveState } from './storage.js';
import { createDemoState } from './demo.js';
import { LEGAL } from './legal.js';
import { avisosDe, guardarAvisos, horaEnPalabras, programarRecordatorio } from './recordatorio.js';
import { BRAND_MARK } from './brand.js';
import { icono } from './icons.js';
import { avisoDeAlergias } from './avisos.js';
import { TOUR_STEPS, WELCOME } from './onboarding.js';
import { RUBROS, categoriaDelRubro } from './catalog-seed.js';
import { SETUP_ACTIONS, SETUP_FORMS, avanceGuardado, emptySetup, renderSetup } from './setup.js';
import { HOGAR_ACTIONS, HOGAR_FORMS, cuerpoDeFicha, emptyHogar, fichaActiva, renderHogar, tocaConfigurarElHogar } from './hogar.js';
import { BULK_ACTIONS, BULK_FORMS, emptyBulk, renderBulk } from './bulk-entry.js';
import { SEMANA_ACTIONS, SEMANA_FORMS, emptySemana, modalDia, modalIrAFecha, modalPonerEnDias, renderSemana, tituloDePlan } from './page-semana.js';
import { COMPRA_ACTIONS, COMPRA_FORMS, emptyCompra, listaEnCurso, modalPendientes, renderCompra } from './page-compra.js';
import { MAS_ACTIONS, PAGINAS_MAS, TITULOS_MAS, emptyMas, renderMas } from './page-mas.js';
import { anotar, falloAnterior, fallosRecientes, instalarRed, olvidarFalloAnterior, protegida } from './fallos.js';
import { CUENTA_ACTIONS, CUENTA_FORMS, emptyCuenta, renderCuenta, volvimosDeGoogle } from './page-cuenta.js';
import { camposDePreparacion, filaDeAlimento, leerPreparacion, llenarAlimentosDelNombre } from './preparacion.js';
import { CAJON_DE_ESTE_TELEFONO, arrancarSesion, cajonDe, fundirSesion, guardarSesion, olvidarSesion } from './sesion.js';
import { guardarCopiaAntesDeBajar, mereceLaPenaVincular, sincronizar } from './sincronizar.js';
import { hayNube } from './config-nube.js';
import { button, cap, conteo, empty, esc, measure, modal, monthName, niceDate, notice, options, unitText } from './ui-kit.js';

/* ── De qué cajón salen los datos ──────────────────────────────────────────

   Con cuentas ya no hay un solo sitio donde se guarda todo. Cada cuenta tiene el
   suyo y el de este teléfono sigue siendo el de siempre, que es donde está lo de
   quien lleva tiempo usando la app sin registrarse.

   `cajon` es la variable que dice cuál está abierto ahora mismo. Arranca en el
   de este teléfono —así, si alguien abre la app sin sesión o sin internet,
   encuentra lo suyo— y cambia al de la cuenta cuando alguien entra. */
let cajon = CAJON_DE_ESTE_TELEFONO;

const firstRun = !hasSavedState();
let state, loadError = '', migratedFrom = 0;
try { const cargado = loadStateDetailed(undefined, cajon); state = cargado.state; if (cargado.migrated) migratedFrom = cargado.from; }
catch (error) { state = createEmptyState(); loadError = error.message; }

// Abrir otro cajón: se lee lo que haya dentro y se pinta. Nunca se mezcla con lo
// que hubiera abierto antes, que es justamente el punto.
function abrirCajon(cual) {
  cajon = cual;
  // Un cajón vacío es una casa que todavía no existe, y hay que tratarla como
  // tal. `loadStateDetailed` devuelve el ejemplo cuando no encuentra nada
  // guardado —que es lo correcto en el primer arranque de la app—, pero al
  // entrar en una cuenta recién creada eso saldría como una despensa llena de
  // comida que nadie anotó, indistinguible de los datos de otra persona. Así
  // que se abre vacía y se enseña la bienvenida, que es de donde sale el
  // ejemplo si alguien lo pide.
  const habiaAlgo = hasSavedState(undefined, cajon);
  try {
    if (habiaAlgo) {
      const cargado = loadStateDetailed(undefined, cajon);
      state = cargado.state;
      migratedFrom = cargado.migrated ? cargado.from : 0;
    } else {
      state = createEmptyState();
      migratedFrom = 0;
    }
    loadError = '';
  } catch (error) {
    state = createEmptyState();
    loadError = error.message;
    anotar('abrir-cajon', error, { cajon: cual });
  }
  ui.welcome = !habiaAlgo;
  ui.tour = null;
  ui.reviewId = null; ui.modal = null;
  ui.semana = emptySemana(); ui.compra = emptyCompra(); ui.mas = emptyMas();
  // El asistente de la canasta se retoma donde se dejó: lo marcado vive en el
  // estado, así que abrir la app en otro momento —u otro teléfono— devuelve el
  // mismo rubro con las mismas casillas marcadas.
  ui.setup = avanceGuardado(state); ui.bulk = null;
  ui.hogar = emptyHogar();
}
// Una función y no una constante, igual que en page-semana.js y page-mas.js:
// calculada al cargar el módulo, un teléfono que deja la app abierta pasada la
// medianoche seguiría pintando el día de ayer. Y aquí no era solo pintar: el
// atajo de anotar una comida y el campo de fecha de una ausencia nacían con esa
// fecha y la escribían, así que la comida se guardaba en el día equivocado.
const today = () => todayISO();
const SIDEBAR_KEY = 'que-comemos-sidebar-collapsed';
const sidebarInitiallyCollapsed = (() => { try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; } })();

const ui = {
  page: 'hoy',
  modal: null,
  // El asistente de la canasta arranca donde se dejó. `abrirCajon` hace lo
  // mismo al cambiar de cuenta, pero en el arranque normal —sin sesión— no
  // pasa por ahí: el estado se lee arriba del todo y esta es su única puerta.
  setup: avanceGuardado(state), bulk: null,
  hogar: emptyHogar(),
  semana: emptySemana(),
  compra: emptyCompra(),
  mas: emptyMas(),
  reviewId: null,
  cuenta: emptyCuenta(),
  sesion: null,
  sidebarCollapsed: sidebarInitiallyCollapsed, drawerOpen: false,
  welcome: firstRun, tour: null
};


/* ── La cuenta ─────────────────────────────────────────────────────────────

   La cuenta es opcional, y de esa decisión cuelga casi todo lo de aquí abajo.

   Quien no tenga sesión ve primero la pantalla de la cuenta —es lo que pidió la
   fase— pero con una salida abajo: «Seguir sin cuenta en este teléfono». Quien
   la toque no vuelve a verla, y la app trabaja con el cajón de siempre, que es
   donde ya está su despensa. Nadie se queda mirando un formulario de registro
   con sus propios datos al otro lado, y menos un día sin internet. */

const CLAVE_SIN_CUENTA = 'que-comemos-sin-cuenta';
const CLAVE_PKCE = 'que-comemos-google-pkce';
/* Qué cajón estaba abierto cuando caducó la sesión.

   Es la diferencia entre caducar y cerrar sesión, y por eso son dos cosas
   distintas y no una. Quien cierra sesión está diciendo «este teléfono deja de
   ser mío por ahora»: se vuelve al cajón del teléfono y esta clave se borra.
   Quien ve caducar su sesión no ha dicho nada —lo dijo el servidor— y su casa
   tiene que seguir donde estaba.

   Que el cajón se pueda abrir sin sesión no abre ninguna puerta nueva: esos
   datos ya están en este teléfono, sin cifrar, y la app los abre cada vez que
   la sesión es válida. Lo que separa una cuenta de otra del lado del servidor
   son las políticas por fila; del lado del teléfono, que nadie vuelva aquí
   después de cerrar sesión a propósito. */
const CLAVE_CAJON_CADUCADO = 'que-comemos-cajon-caducado';

let sesion = null;
let sinCuenta = (() => { try { return localStorage.getItem(CLAVE_SIN_CUENTA) === '1'; } catch { return false; } })();
let avisoDeSesion = '';
let sesionCaducada = false;

// ¿Hay que enseñar la portada de la cuenta? Solo si las cuentas están
// configuradas en esta compilación; si no lo están, la app se comporta
// exactamente como antes y no menciona nada que no pueda cumplir.
//
// Y nunca por una sesión caducada: ahí la casa está abierta detrás, y cambiarla
// por un formulario de registro es el peor momento que puede vivir alguien con
// esta app. Se pide desde Ajustes → Mi cuenta, cuando la persona quiera.
const tocaPedirCuenta = () => hayNube() && !sesion && !sinCuenta && !sesionCaducada;

const recordarCajonCaducado = valor => {
  try { valor ? localStorage.setItem(CLAVE_CAJON_CADUCADO, valor) : localStorage.removeItem(CLAVE_CAJON_CADUCADO); }
  catch { /* Sin almacenamiento, la sesión caducada dura lo que dure la app abierta. */ }
};
const cajonCaducado = () => { try { return localStorage.getItem(CLAVE_CAJON_CADUCADO) || ''; } catch { return ''; } };

function ponerSesion(nueva) {
  sesion = nueva;
  ui.sesion = nueva;
}

/* ── Subir sin molestar ────────────────────────────────────────────────────

   Guardar es local y sigue siendo instantáneo. Subir se apunta y se hace un
   rato después: quien está anotando la compra toca diez veces seguidas, y diez
   viajes a la red mientras alguien escribe se le notan en la batería y en la
   fluidez de la pantalla.

   Si no hay conexión, la marca se queda puesta y se reintenta al volver. Eso es
   todo lo que hace falta para que la app funcione en un sótano. */

const ESPERA_ANTES_DE_SUBIR_MS = 4000;
let hayCambiosSinSubir = false;
let relojDeSubida = null;

function apuntarParaSubir() {
  if (!sesion?.sincronizando) return;
  hayCambiosSinSubir = true;
  clearTimeout(relojDeSubida);
  relojDeSubida = setTimeout(() => { sincronizarAhora().catch(error => anotar('subir', error)); }, ESPERA_ANTES_DE_SUBIR_MS);
}

async function sincronizarAhora(opciones = {}) {
  if (!sesion?.sincronizando) return { ok: true, resultado: 'apagada' };
  const cuenta = ui.cuenta = ui.cuenta || emptyCuenta();
  const salida = await sincronizar(sesion, state, {
    hayCambiosLocales: opciones.hayCambiosLocales ?? hayCambiosSinSubir
  });

  if (salida.sesion) ponerSesion(salida.sesion);

  if (!salida.ok) {
    // Sin red no es un error que enseñar en rojo: es el estado normal de un
    // teléfono que se movió. Se deja la marca puesta y ya se subirá.
    cuenta.sincronia = { resultado: salida.sinRed ? 'sin-red' : 'error', detalle: salida.sinRed ? '' : (salida.error || '') };
    if (!salida.sinRed) apuntarComoVaLaSincronia(false);
    if (salida.caducada) alCaducarLaSesion();
    return salida;
  }

  /* Un conflicto ya no secuestra la pantalla.

     Esto hacía `ui.page = 'cuenta'` y repintaba, y eso ocurre dentro del
     temporizador de subida o al volver a la app: cuatro segundos después de
     guardar algo, estando en el pasillo del colmado, la pantalla se cambiaba
     sola por «Hay dos versiones de tu casa» y se perdía el sitio. No había un
     «ahora no»: los dos botones reemplazaban una versión entera por la otra.

     La decisión sigue haciendo falta, pero no ahora mismo y no a la fuerza. Se
     queda una franja en el armazón, que se pinta desde `ui.cuenta.conflicto` y
     se va sola cuando se resuelve. */
  if (salida.resultado === 'conflicto') {
    cuenta.conflicto = { estadoServidor: salida.estadoServidor, revisionServidor: salida.revisionServidor, cuando: salida.cuando };
    cuenta.vista = 'conflicto';
    cuenta.sincronia = { resultado: 'error', detalle: 'Hay dos versiones.' };
    render();
    return salida;
  }

  if (salida.resultado === 'bajado' && salida.estado) {
    traerEstadoDeLaNube(salida.estado, salida.revision);
  }
  if (salida.resultado === 'subido' || salida.resultado === 'al-dia') hayCambiosSinSubir = false;
  cuenta.sincronia = { resultado: salida.resultado, detalle: '' };
  apuntarComoVaLaSincronia(true);
  return salida;
}

/* ── Que una sincronización rota no se quede callada ───────────────────────

   El resultado vivía en `ui.cuenta`, o sea en memoria, y se pintaba en un solo
   sitio: una línea gris y diminuta dentro de Ajustes → Mi cuenta. Cerrar y
   volver a abrir la app lo borraba. Así que una casa podía llevar ocho días sin
   subir nada y no decirlo en ninguna parte, mientras la cuenta se ofrecía con
   la promesa de que tus datos te encuentran en otro aparato.

   Ahora la fecha del primer fallo se guarda con los datos —`state.settings` ya
   lleva ahí `lastBackupAt`, y no hace falta subir `SCHEMA_VERSION` para añadir
   una clave—, así que sobrevive al reinicio, y a los dos días sale del rincón.

   «Sin red» no cuenta como fallo: es el estado normal de un teléfono que se
   movió, y el resto del código ya lo trata así. */
const DIAS_PARA_AVISAR_DE_LA_SINCRONIA = 2;

function apuntarComoVaLaSincronia(fueBien) {
  const antes = state.settings?.sincronia || null;
  const ahora = fueBien ? null : { desde: antes?.desde || today(), ultimo: today() };
  if (JSON.stringify(antes) === JSON.stringify(ahora)) return;
  state.settings = { ...(state.settings || {}), sincronia: ahora };
  guardarSiSePuede();
}

function diasSinSubir() {
  const desde = state.settings?.sincronia?.desde;
  if (!desde) return 0;
  const dia = 86400000;
  return Math.max(0, Math.round((new Date(`${today()}T12:00:00`) - new Date(`${desde}T12:00:00`)) / dia));
}

// Traerse la versión del servidor encima de la de este teléfono, guardando antes
// una copia de lo que se tapa.
function traerEstadoDeLaNube(estadoRemoto, revision) {
  try {
    const traido = importState(typeof estadoRemoto === 'string' ? estadoRemoto : JSON.stringify(estadoRemoto));
    guardarCopiaAntesDeBajar(state);
    state = traido;
    saveState(state, undefined, cajon);
    ponerSesion(guardarSesion(fundirSesion(sesion, { revision: Number(revision) || 0 })));
    hayCambiosSinSubir = false;
    ui.reviewId = null; ui.modal = null;
    ui.semana = emptySemana(); ui.compra = emptyCompra(); ui.mas = emptyMas();
    render();
    return true;
  } catch (error) {
    // Un documento del servidor que no pasa la validación no se instala. Es la
    // misma regla que con los respaldos: mejor no traer nada que traer basura
    // encima de lo que funciona.
    anotar('bajar-estado', error);
    return false;
  }
}

/* ── Entrar, salir, borrarse ──────────────────────────────────────────── */

// La casa que había en este teléfono antes de que nadie se registrara. Es lo que
// se ofrece subir al crear una cuenta, y lo que decide si a alguien se le
// pregunta por su hogar o no: quien ya lo tenía escrito no tiene que repetirlo.
function leerElCajonDelTelefono() {
  try { return loadStateDetailed(undefined, CAJON_DE_ESTE_TELEFONO).state; }
  catch { return null; }
}

async function alEntrar(sesionNueva, { nueva = false } = {}) {
  const guardada = guardarSesion(sesionNueva);
  ponerSesion(guardada);
  avisoDeSesion = '';
  sesionCaducada = false;
  recordarCajonCaducado('');
  // Cada cuenta, su cajón. Aquí es donde se garantiza que quien entra no ve la
  // despensa de quien entró antes en este mismo teléfono.
  abrirCajon(cajonDe(guardada.usuario.id));
  ui.cuenta = emptyCuenta();
  ui.cuenta.vista = 'cuenta';
  // Quien acaba de crear su cuenta pasa directo a conocer su hogar: es lo
  // primero que la app necesita saber para servir de algo, y preguntarlo ahora
  // —cuando ya se decidió a registrarse— cuesta menos que perseguirlo después.
  // Quien vuelve a entrar no ve nada de esto, y quien ya tiene gente registrada
  // tampoco: `tocaConfigurarElHogar` mira las dos cosas.
  // La excepción: si en este teléfono ya había una casa montada de antes de
  // registrarse, primero se ofrece subirla. Preguntarle quién vive en su hogar a
  // quien ya lo tiene escrito sería pedirle dos veces lo mismo.
  const hayQueVincular = mereceLaPenaVincular(leerElCajonDelTelefono());
  ui.page = nueva && tocaConfigurarElHogar(state) && !hayQueVincular ? 'hogar' : nueva ? 'cuenta' : 'hoy';
  render();
  // Y si la sincronización estaba encendida de una sesión anterior, se pone al
  // día en segundo plano. Que tarde no puede bloquear la pantalla.
  sincronizarAhora({ hayCambiosLocales: false }).catch(error => anotar('sincronizar-al-entrar', error));
}

/* ── Una sesión que caduca no echa a nadie de su casa ──────────────────────

   Lo que pasaba: el servidor rechaza renovar el token —al volver después de
   semanas, o porque la misma cuenta se usó en dos teléfonos y uno invalidó el
   refresco del otro— y la app llamaba a `alSalirDeLaCuenta`, que vuelve al
   cajón DE ESTE TELÉFONO. Ese cajón está vacío para quien siempre usó la
   cuenta, así que la pantalla se convertía de golpe en «Crear mi cuenta» y seis
   meses de despensa, preparaciones y plan desaparecían de la vista. La frase
   que explicaba que no se había perdido nada estaba escrita en el código y no
   se pintaba jamás: vive en el armazón, y la portada de la cuenta no pinta
   armazón.

   Y sin internet —que es justo cuando más caduca esto— no había forma de volver
   a entrar: la casa quedaba inaccesible en un teléfono que la tiene entera.

   Ahora el cajón abierto se queda abierto y se sigue donde se estaba. Lo único
   que se apaga es la sincronización, que es lo único que de verdad dejó de
   funcionar. Volver a entrar lo pide la persona, desde Ajustes → Mi cuenta,
   cuando tenga red. */
function alCaducarLaSesion() {
  olvidarSesion();
  ponerSesion(null);
  clearTimeout(relojDeSubida);
  hayCambiosSinSubir = false;
  sesionCaducada = true;
  recordarCajonCaducado(cajon);
  avisoDeSesion = 'Tu sesión caducó y la sincronización quedó apagada. Tus datos siguen enteros en este teléfono: vuelve a entrar cuando tengas internet y se pondrán al día solos.';
  ui.cuenta = emptyCuenta();
  render();
}

function alSalirDeLaCuenta({ silencioso = false } = {}) {
  olvidarSesion();
  ponerSesion(null);
  clearTimeout(relojDeSubida);
  hayCambiosSinSubir = false;
  // Cerrar sesión sí es una decisión, y borra la marca de caducada: quien lo
  // pide está diciendo que este teléfono deja de ser suyo por ahora.
  sesionCaducada = false;
  recordarCajonCaducado('');
  // Se vuelve al cajón de este teléfono. Los datos de la cuenta se quedan en el
  // suyo, intactos, esperando a que vuelva a entrar.
  abrirCajon(CAJON_DE_ESTE_TELEFONO);
  ui.cuenta = emptyCuenta();
  if (!silencioso) { sinCuenta = false; try { localStorage.removeItem(CLAVE_SIN_CUENTA); } catch { /* da igual */ } }
  ui.page = 'hoy';
  render();
  if (!silencioso) toast('Sesión cerrada. Tus datos siguen guardados.');
}

function alBorrarLaCuenta() {
  const id = sesion?.usuario?.id || '';
  olvidarSesion();
  ponerSesion(null);
  clearTimeout(relojDeSubida);
  // El cajón de esa cuenta se va con ella. El de este teléfono no se toca: es de
  // otra persona, o del mismo antes de registrarse, y nadie pidió borrarlo.
  if (id) { try { localStorage.removeItem(cajonDe(id)); } catch { /* ya no estaba */ } }
  sesionCaducada = false;
  recordarCajonCaducado('');
  sinCuenta = false;
  try { localStorage.removeItem(CLAVE_SIN_CUENTA); } catch { /* da igual */ }
  abrirCajon(CAJON_DE_ESTE_TELEFONO);
  ui.cuenta = emptyCuenta();
  ui.page = 'hoy';
  render();
  toast('Cuenta borrada.');
}

// El contexto que necesitan las pantallas de la cuenta: lo de siempre, más las
// puertas hacia el resto de la aplicación. Se pasan como funciones para que
// `page-cuenta.js` no tenga que saber nada de cajones ni de `state`.
function ctxCuenta() {
  return {
    ...ctx(),
    sesion,
    confirmar: mensaje => window.confirm(mensaje),
    seguirSinCuenta: () => {
      sinCuenta = true;
      try { localStorage.setItem(CLAVE_SIN_CUENTA, '1'); } catch { /* se volverá a preguntar, no es grave */ }
      ui.page = 'hoy';
      render();
    },
    ponerSesion: nueva => ponerSesion(nueva),
    alEntrar,
    alSalirDeLaCuenta,
    alBorrarLaCuenta,
    sincronizarAhora,
    traerEstadoDeLaNube,
    datosDeLaCasa: () => state,
    // Lo que hay en el cajón de este teléfono, que es lo que se ofrece vincular
    // después de crear una cuenta.
    datosDelTelefono: leerElCajonDelTelefono,
    abrirEnNavegador: async url => {
      const aparato = globalThis.Capacitor?.Plugins?.Aparato;
      if (aparato?.abrirEnNavegador) {
        const salida = await aparato.abrirEnNavegador({ url }).catch(() => null);
        return Boolean(salida?.abierto);
      }
      // En el navegador de escritorio no hay complemento: se abre una pestaña.
      try { return Boolean(window.open(url, '_blank', 'noopener')); } catch { return false; }
    },
    guardarVerificador: valor => { try { valor ? localStorage.setItem(CLAVE_PKCE, valor) : localStorage.removeItem(CLAVE_PKCE); } catch { /* se pedirá otra vez */ } },
    leerVerificador: () => { try { return localStorage.getItem(CLAVE_PKCE) || ''; } catch { return ''; } }
  };
}

/* ── La vuelta de Google ───────────────────────────────────────────────────
   Dos caminos, porque el sistema puede haber cerrado la app mientras la persona
   escribía su contraseña: si seguía viva, el enlace llega por el complemento
   nada más volver; si la cerró, llega en el arranque. Se mira en los dos
   momentos. */

async function mirarSiVolvimosDeGoogle() {
  const aparato = globalThis.Capacitor?.Plugins?.Aparato;
  let enlace = '';
  if (aparato?.enlaceDeEntrada) {
    const leido = await aparato.enlaceDeEntrada().catch(() => null);
    if (leido?.hay) enlace = String(leido.enlace || '');
  } else if (typeof window !== 'undefined' && /[?&]code=/.test(window.location.search)) {
    // En el navegador la vuelta llega en la propia dirección de la página.
    enlace = window.location.href;
  }
  if (!enlace) return;
  ui.page = 'cuenta';
  const atendido = await volvimosDeGoogle(ctxCuenta(), enlace);
  if (atendido && typeof window !== 'undefined' && window.history?.replaceState) {
    // La dirección se limpia para que un recargar no reintente un código ya
    // gastado y salga un error que no significa nada.
    try { window.history.replaceState({}, '', window.location.pathname); } catch { /* da igual */ }
  }
}

/* ── Atajos de lectura ─────────────────────────────────────────────────── */

const personName = id => state.people.find(person => person.id === id)?.name || 'Persona eliminada';
const productName = id => product(state, id)?.name || 'Alimento eliminado';
// «14 ruedas» no dice nada si no se sabe cómo las cortan en esta casa.
const cutText = (item, amount) => {
  const style = sliceStyle(item?.slice);
  if (!style) return '';
  const word = style.label.toLowerCase();
  return ` ${amount > 0 && amount <= 1 ? word : `${word}s`}`;
};
const stockText = (amount, item) => `${measure(amount, item?.controlUnit || '')}${esc(cutText(item, amount))}`;
// Sin cantidad, solo el nombre. Desde que una preparación puede llevar los
// alimentos sin decir cuánto, pintar la medida a ciegas dejaba «0 · Arroz»
// en la pantalla de quien cocina, que es peor que no decir nada.
// Dentro de una comida se nombra el alimento y nada más. Las cantidades que
// traigan las comidas de antes siguen guardadas —y en el respaldo—, pero no se
// pintan: eran del reparto por raciones, que se retiró, y enseñar un número que
// nadie puede cambiar ni usar es peor que no enseñarlo.
const itemText = item => esc(productName(item.productId));
// El título de una comida lo decide `page-semana.js`, que es quien pinta el
// calendario. Tenerlo escrito dos veces era tenerlo mal en uno de los dos: al
// aparecer las comidas escritas a mano, esta copia las llamaba «Sin decidir».

/* ── Las cinco secciones ───────────────────────────────────────────────────

   Cinco, y las cinco son cosas que una casa abre. La cuarta era «Más», que no
   es un sitio: es un cajón. Dentro estaban los productos habituales y las
   preparaciones, que son de lo que más se toca, escondidas detrás de una
   pantalla que solo es una lista de enlaces.

   El nombre corto es para la barra de abajo del teléfono: ahí caben cinco
   columnas de setenta píxeles, y «Mis productos habituales» no entra en
   setenta píxeles. Es la misma sección con el nombre que cabe, no una
   sección distinta. */
const NAV = [
  ['hoy', 'sol', 'Hoy', 'Hoy'],
  ['semana', 'calendario', 'Plan semanal', 'Semana'],
  ['compra', 'canasta', 'Compra', 'Compra'],
  ['canasta', 'hoja', 'Mis productos habituales', 'Productos'],
  ['preparaciones', 'libro', 'Preparaciones', 'Preparo']
];
const SECCIONES = NAV.map(([id]) => id);

// Cuatro acciones, no once. Las once seguían existiendo en un menú que nadie
// leía entero: quien abre el «+» quiere anotar una cosa concreta, y tener que
// escoger entre once formularios es peor que no tener el botón.
const RAPIDAS = [
  ['rapida-comida', 'plato', 'Poner una comida', 'En el primer hueco que quede hoy'],
  ['open-recipe', 'libro', 'Crear una preparación', 'Un plato que se repite en casa'],
  ['navigate', 'canasta', 'Preparar la compra', 'Lo que hay que llevar del colmado', 'data-page="compra"'],
  // «Añadir un producto» y no «un alimento»: abre exactamente el mismo
  // formulario que «+ Añadir producto» en la sección, que se llama «Productos»
  // en la barra. Tres nombres para lo mismo siembran la duda de si son tres
  // sitios distintos, y esa duda se paga volviendo atrás a comprobarlo, de pie
  // y con una mano. «Alimento» se queda donde de verdad significa comida: lo
  // que evita cada persona y lo que lleva una preparación.
  ['open-product', 'hoja', 'Añadir un producto', 'Uno que no esté todavía']
];

/* El «+» sigue siendo el mismo botón en las cinco secciones, y esa es su virtud:
   no hay que aprender qué significa en cada sitio. Lo que cambia son dos cosas
   que allí no tenían arreglo.

   Una: no se ofrece ir a donde ya estás. En Compra, «Preparar la compra» cerraba
   la hoja y no pasaba nada más, que es la forma más rápida de enseñarle a
   alguien que este botón no responde —y con él se pierden los otros tres—.

   Dos: en Compra, y solo con una lista abierta, «Añadir un alimento» se cambia
   por apuntarlo EN esa lista. El atajo de antes guardaba el alimento en los
   productos habituales sin meterlo en la lista, así que de pie en el colmado se
   salía del súper creyendo que estaba apuntado. La condición de la lista abierta
   no es cosmética: sin lista, `renderCompra` sale por «no tienes ninguna compra
   abierta» y el atajo sería otro botón que no hace nada. */
function rapidasDeAqui() {
  return RAPIDAS
    .filter(([accion, , , , extra = '']) => !(accion === 'navigate' && extra.includes(`data-page="${ui.page}"`)))
    .map(fila => (ui.page === 'compra' && fila[0] === 'open-product' && listaEnCurso(state)
      ? ['compra-ocasional', 'canasta', 'Apuntar algo en esta lista', 'Se te ocurrió delante del estante']
      : fila));
}

let toastTimer;
function toast(message, error = false) {
  const el = document.querySelector('#toast');
  el.textContent = message; el.className = `show${error ? ' error' : ''}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = '', 4200);
}
// Guardar sin repintar. Lo necesita quien va marcando ochenta casillas: cada
// redibujo reemplaza los nodos, el navegador devuelve el desplazamiento a cero y
// el foco se va al cuerpo del documento. Lo que se guarda es lo mismo que
// guardaría `commit`; lo único que no pasa es el repintado.
/* ── Cuando guardar no ocurre ──────────────────────────────────────────────

   `saveState` ya no lanza ni se calla: dice en qué quedó. Lo que falta es que
   alguien lo mire, y sobre todo que se vea. Un aviso flotante de 4,2 segundos
   no sirve para esto: quien está marcando la compra en un pasillo no está
   mirando la pantalla cuando aparece, y el fallo no es de un toque —es de
   todos los que vengan detrás—. Así que es una franja, y no se va hasta que un
   guardado funcione.

   Y con `loadError` puesto no se guarda nada en absoluto: ver más abajo, en
   `pantallaDeDatosIlegibles`. */
let noSePudoGuardar = '';

function guardarSiSePuede() {
  if (loadError) return;
  const salida = saveState(state, undefined, cajon);
  const antes = noSePudoGuardar;
  noSePudoGuardar = salida.ok ? '' : salida.motivo === 'sin-almacen'
    ? 'Este teléfono no deja escribir nada: el almacenamiento de la aplicación está apagado o bloqueado.'
    : 'No cabe más en el almacenamiento de este teléfono.';
  // Un fallo nuevo tiene que pintarse ahora mismo. `guardar()` existe justo
  // para no repintar, así que aquí es la única forma de que la franja aparezca
  // sin esperar a que alguien cambie de pantalla.
  if (noSePudoGuardar !== antes) render();
}

function guardar() {
  guardarSiSePuede();
  apuntarParaSubir();
}

function commit(message) {
  guardarSiSePuede();
  // Cada guardado marca que hay algo que subir. No se sube en el acto: quien
  // está anotando la compra toca diez veces seguidas, y diez viajes a la red
  // mientras alguien escribe es la forma más rápida de gastarle la batería y de
  // que la pantalla se quede pillada.
  apuntarParaSubir();
  render();
  if (message) toast(message);
}

// Lo que un módulo de pantalla necesita para trabajar sin conocer app.js por
// dentro. Se construye en cada llamada porque `state` se reasigna al importar un
// respaldo o al borrar los datos, y una referencia guardada apuntaría al viejo.
function ctx() {
  return {
    state, ui, commit, guardar, toast, anunciar, render, closeModal, openModal,
    // Si la casa se está guardando también en la cuenta. Lo necesitan las
    // pantallas que hablan de dónde viven los datos: varias juraban «no hay
    // cuenta, no hay servidor» con la sincronización encendida, que es la única
    // afirmación categórica y falsa que había en toda la app, y estaba en la
    // pantalla donde alguien decide si necesita bajarse un archivo.
    sincronizando: Boolean(sesion?.sincronizando),
    startTour: () => goTour(0)
  };
}

// La ficha de una persona preguntaba «cuánto come normalmente» y este contexto
// existía para leer esas filas. Ya no se pregunta, así que no se le pasa nada:
// `guardarFicha` conserva lo que la persona tuviera escrito cuando no le llega
// una lista, que es justo lo que hace falta para no borrarlo.
function ctxHogar() {
  return ctx();
}

const TITULOS = { hoy: 'Hoy en casa', semana: 'Plan semanal', compra: 'La compra', setup: 'Organizar mi casa', hogar: 'Mi hogar', legal: 'Privacidad y condiciones', cuenta: 'Mi cuenta', ...TITULOS_MAS };
function pageTitle() { return TITULOS[ui.page] || '¿Qué comemos?'; }

/* ── Antes de empezar ──────────────────────────────────────────────────────

   Google NO exige esta pantalla, y conviene que quede escrito para que nadie la
   defienda con un argumento que no es. El «prominent disclosure» que sí es
   obligatorio se limita a tres cosas —servicios de accesibilidad, ubicación en
   segundo plano y ver qué aplicaciones hay instaladas—, y esta app no usa
   ninguna. Lo que Play sí exige es la política de privacidad enlazada desde la
   ficha y la sección de seguridad de los datos, y las dos ya están.

   Está aquí porque se decidió tenerla, y porque lo que dice es justamente lo
   único que esta app promete: que lo que escribas se queda en tu teléfono. Es
   mejor decirlo en la primera pantalla que esconderlo en un documento.

   Se enseña una vez. Lo que se guarda es cuándo se aceptó y qué versión de los
   documentos estaba delante ese día, que es para lo que sirve una aceptación.

   Y los documentos se leen aquí mismo, sin salir y sin conexión: mandar a
   alguien al navegador para poder entrar en una app que presume de funcionar
   sin internet sería contradecirse en la primera pantalla. */

const CLAVE_ACEPTO = 'que-comemos-acepto-v1';
let acepto = (() => {
  try { return JSON.parse(localStorage.getItem(CLAVE_ACEPTO) || 'null'); }
  catch { return null; }
})();
// Qué documento se está leyendo dentro de la pantalla de aceptar. Vacío es la
// pantalla de aceptar a secas.
let leyendoLegal = '';

const tocaAceptar = () => !acepto;

const DOCUMENTOS_DE_ENTRADA = [['privacidad', 'Aviso de privacidad'], ['terminos', 'Condiciones de uso']];

function renderAceptar() {
  const doc = LEGAL[leyendoLegal];
  if (doc) {
    return `<div class="shell"><main class="main"><div class="entrada">
      ${button('‹ Volver', 'legal-cerrar', 'btn-quiet btn-small')}
      <article class="card documento">
        <h2>${esc(doc.titulo)}</h2>
        <p class="small muted">Última actualización: ${esc(niceDate(LEGAL.actualizado, { day: 'numeric', month: 'long', year: 'numeric' }))}</p>
        ${doc.secciones.map(seccion => `<h3>${esc(seccion.titulo)}</h3>${seccion.parrafos.map(parrafo => `<p>${esc(parrafo)}</p>`).join('')}`).join('')}
      </article>
      <div class="modal-actions entrada-acciones">${button('Aceptar y entrar', 'legal-aceptar', 'btn-primary btn-grande')}</div>
    </div></main></div>`;
  }

  return `<div class="shell"><main class="main"><div class="entrada">
    <div class="entrada-marca">${BRAND_MARK}</div>
    <h2>Antes de empezar</h2>
    <p class="entrada-promesa">Esta app la hace NexoCore y funciona con una idea sencilla: <strong>lo que escribas se queda en tu teléfono</strong>.</p>
    <ul class="entrada-puntos">
      <li>Quiénes comen en tu casa, lo que compras de costumbre y lo que se cocina cada día se guardan aquí dentro, y no salen solos a ninguna parte.</li>
      <li>No hay anuncios, no hay rastreadores y nadie mide lo que haces aquí dentro.</li>
      <li>Si algún día quieres tu casa en dos teléfonos, hay cuenta. Es opcional, y subir tus datos es una segunda decisión con su propio interruptor.</li>
    </ul>
    <div class="entrada-documentos">${DOCUMENTOS_DE_ENTRADA.map(([id, etiqueta]) =>
      `<button type="button" class="entrada-documento" data-action="legal-leer" data-doc="${id}">
        <span>${esc(etiqueta)}</span>${icono('derecha', { tamano: 16 })}
      </button>`).join('')}</div>
    <div class="modal-actions entrada-acciones">${button('Aceptar y entrar', 'legal-aceptar', 'btn-primary btn-grande')}</div>
    <p class="tiny muted">Al entrar aceptas el aviso de privacidad y las condiciones de uso. Puedes volver a leerlos cuando quieras desde Ajustes.</p>
  </div></main></div>`;
}

/* ── Bienvenida y recorrido ────────────────────────────────────────────── */

function renderWelcome() {
  return `<div class="welcome-screen"><div class="welcome-card">
    <span class="welcome-mark">${BRAND_MARK}</span>
    <h1>¿Qué comemos?</h1>
    <p class="welcome-promise">${esc(WELCOME.promise)}</p>
    <div class="welcome-actions">${button('Organizar mi casa', 'welcome-empty', 'btn-primary')}</div>
    <p class="welcome-note"><button type="button" class="enlace" data-action="welcome-demo">Ver un ejemplo primero</button></p>
    <p class="welcome-foot">${esc(WELCOME.foot)}</p>
  </div></div>`;
}

function tourCard() {
  const step = TOUR_STEPS[ui.tour], total = TOUR_STEPS.length, position = ui.tour + 1, last = position === total;
  return `<aside class="tour" role="dialog" aria-label="Recorrido por la aplicación">
    <div class="tour-head"><span class="tour-step">Paso ${position} de ${total}</span><button type="button" class="icon-btn" data-action="tour-skip" aria-label="Cerrar el recorrido">×</button></div>
    <div class="progress"><span style="width:${Math.round(position / total * 100)}%"></span></div>
    <h2>${esc(step.title)}</h2><p>${esc(step.body)}</p>${step.tip ? `<p class="tour-tip">${esc(step.tip)}</p>` : ''}
    <div class="tour-actions">${button('Saltar', 'tour-skip', 'btn-quiet btn-small')}<span class="tour-spacer"></span>${ui.tour ? button('Atrás', 'tour-prev', 'btn-secondary btn-small') : ''}${button(last ? 'Terminar' : 'Siguiente', 'tour-next', 'btn-primary btn-small')}</div>
  </aside>`;
}
function goTour(index) {
  ui.tour = index; ui.page = TOUR_STEPS[index].page; ui.modal = null; ui.drawerOpen = false;
  render();
}

/* ── Armazón ───────────────────────────────────────────────────────────── */

const PAGINAS = {
  hoy: renderToday,
  semana: () => renderSemana(ctx()),
  compra: () => renderCompra(ctx()),
  setup: () => renderSetup(ctx()),
  hogar: () => renderHogar(ctxHogar()),
  cuenta: () => renderCuenta(ctxCuenta())
};
// Lo que vive dentro de Ajustes. `canasta` y `preparaciones` siguen saliendo
// de `page-mas.js` —son pantallas suyas— pero ya no están dentro de nada: son
// dos de las cinco secciones, y por eso se descuentan aquí.
const esPaginaDeAjustes = pagina => pagina === 'cuenta' || (PAGINAS_MAS.includes(pagina) && !SECCIONES.includes(pagina));

/* ¿Toca enseñar el botón de volver a Ajustes en la cabecera?

   Las siete subpantallas de Ajustes escribían su título dos veces: el `<h1>` de
   aquí arriba y, justo debajo, un `<h2>` con el mismo texto al lado de un botón
   «‹ Ajustes». El título se quedó donde estaba y el botón subió aquí, que es
   donde lo pondría cualquier aplicación de teléfono: uno solo, siempre en el
   mismo sitio, para todas.

   `cuenta` se queda fuera y no por descuido: sus pantallas tienen su propia
   navegación por dentro —portada, registro, entrar, recuperar— con su «Atrás»,
   y meterle un segundo botón que sale de todas ellas de golpe sería añadir una
   cuarta forma de volver en vez de quitar una. Unificar «‹ Ajustes», «Atrás» y
   «Cancelar» es una decisión que va con el botón físico del teléfono, no aquí. */
const enSubpantallaDeAjustes = () => esPaginaDeAjustes(ui.page) && ui.page !== 'ajustes' && ui.page !== 'cuenta';

/* Pintar tampoco puede tumbar la aplicación.
 *
 * `render()` reescribe `#app` entero en cada cambio. Si el módulo de una
 * pantalla lanza a mitad de escribir su HTML, antes pasaba esto: la asignación a
 * `innerHTML` no llegaba a ocurrir, la excepción subía hasta quien hubiera
 * llamado a `render()` —a menudo un `catch` que solo enseñaba un `toast`— y la
 * persona se quedaba con la pantalla anterior congelada, tocando botones que ya
 * no respondían porque el estado sí había cambiado.
 *
 * Ahora una pantalla rota se queda en pantalla rota, dicho con esas palabras y
 * con una salida. El resto de la aplicación sigue en pie. */

/* ── No perder el sitio al repintar ────────────────────────────────────────

   Reescribir `#app` entero tiene dos efectos que este archivo ya tenía escritos
   en el comentario de `guardar()`: el navegador devuelve el desplazamiento a
   cero y el foco se va al cuerpo del documento. De pie en el colmado, con
   cuarenta renglones, cada toque costaba volver a buscar por dónde ibas.

   Se arregla en un solo sitio en vez de en cada pantalla: antes de pintar se
   apunta dónde estaba la página y quién tenía el foco, y después se devuelven
   los dos —pero solo si lo que se acaba de pintar es la MISMA pantalla—.
   Cambiar de sección sigue empezando arriba, que es lo que se espera.

   «La misma pantalla» no es solo `ui.page`: dentro de Compra, saltar de
   «Preparar» a «Mi lista» son dos pantallas distintas aunque la sección sea la
   misma, y conservar el desplazamiento de una en la otra deja a cualquiera
   mirando la mitad de una lista que no ha visto empezar. Las que tengan vistas
   por dentro lo dicen aquí; las que no, se identifican por su sección. */
const SENA_DE_PANTALLA = {
  compra: () => ui.compra?.vista || '',
  cuenta: () => ui.cuenta?.vista || ''
};

function senaDePantalla() {
  if (tocaPedirCuenta()) return 'portada-cuenta';
  if (ui.welcome) return 'bienvenida';
  return `${ui.page}|${SENA_DE_PANTALLA[ui.page]?.() || ''}`;
}
let senaAnterior = null;
let ventanaAnterior = '';

/* Cómo volver a encontrar lo que tenía el foco.

   No sirve guardar el nodo: `innerHTML` lo destruye y el que ocupa su sitio es
   otro objeto. Lo que se guarda es cómo volver a nombrarlo, y aquí eso sale
   gratis porque cada botón que hace algo ya lleva su `data-action` y, cuando
   hace falta, su `data-id`. Un campo de texto se nombra por su formulario y su
   `name`, y se le devuelve también dónde tenía el cursor. */
function senaDelFoco() {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;

  const formulario = el.closest?.('[data-form]');
  if (el.name && formulario) {
    let inicio = null, fin = null;
    // `selectionStart` no existe en los campos numéricos ni en los de fecha.
    try { inicio = el.selectionStart; fin = el.selectionEnd; } catch { /* Sin cursor que devolver. */ }
    return { form: formulario.dataset.form, formId: formulario.dataset.id || '', campo: el.name, inicio, fin };
  }
  if (el.id) return { id: el.id };
  if (!el.dataset?.action) return null;
  return {
    accion: el.dataset.action,
    id: el.dataset.id || '', pagina: el.dataset.page || '', vista: el.dataset.vista || ''
  };
}

/* Devolver el foco NO puede mover la página.

   `focus()` a secas desplaza la ventana para enseñar lo que acaba de enfocar, y
   eso aquí sería pelearse consigo mismo: se acaba de restaurar el sitio exacto
   donde estaba la persona y el foco vuelve a un elemento que ya estaba a la
   vista. Sin `preventScroll`, un elemento que quede medio tapado por la barra de
   abajo arrastra la pantalla unos píxeles en cada toque.

   El `autofocus` del HTML recién pintado es el caso contrario y va sin esto: ahí
   sí hay que enseñar el campo que se acaba de abrir. */
const SIN_SALTO = { preventScroll: true };

// Devuelve `true` si encontró a quién dárselo. Quien llama lo necesita para
// saber si le toca al `autofocus` del HTML recién pintado.
function devolverElFoco(sena) {
  if (!sena) return false;
  if (sena.form) {
    const formulario = [...document.querySelectorAll(`[data-form]`)]
      .find(f => f.dataset.form === sena.form && (f.dataset.id || '') === sena.formId);
    const campo = formulario?.querySelector(`[name="${sena.campo.replace(/["\\]/g, '\\$&')}"]`);
    if (!campo) return false;
    campo.focus(SIN_SALTO);
    if (sena.inicio !== null) { try { campo.setSelectionRange(sena.inicio, sena.fin); } catch { /* Da igual. */ } }
    return true;
  }
  if (sena.id) {
    const el = document.getElementById(sena.id);
    if (!el) return false;
    el.focus(SIN_SALTO);
    return true;
  }
  for (const el of document.querySelectorAll('[data-action]')) {
    if (el.dataset.action !== sena.accion) continue;
    if ((el.dataset.id || '') !== sena.id) continue;
    if ((el.dataset.page || '') !== sena.pagina) continue;
    if ((el.dataset.vista || '') !== sena.vista) continue;
    el.focus(SIN_SALTO);
    return true;
  }
  return false;
}

/* ── Decirlo en voz alta ───────────────────────────────────────────────────

   `#toast` es visible y dura 4,2 segundos: sirve para confirmar algo que se
   acaba de guardar, no para ir narrando cada casilla que se marca en un
   pasillo. Un aviso flotante por cada uno de los cuarenta renglones sería ruido
   en la pantalla y tapa el sitio donde está el dedo.

   Así que hay una segunda región viva, invisible y permanente, para lo que solo
   tiene que oírse. Vive en index.html y no dentro de `#app` a propósito: una
   región viva que nace junto a su contenido nunca se dispara, porque el lector
   de pantalla necesita que la región ya estuviera ahí para notar que cambió. */
function anunciar(texto) {
  const region = document.querySelector('#anuncio');
  if (!region || !texto) return;
  // Un texto idéntico al que ya hay no se vuelve a leer. Marcar dos renglones
  // seguidos con el mismo nombre —o marcar y desmarcar uno— diría lo mismo dos
  // veces y la segunda se perdería: se vacía primero, en otro cuadro, para que
  // el cambio sea un cambio de verdad.
  region.textContent = '';
  const escribir = () => { region.textContent = texto; };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(escribir); else escribir();
}

/* Quién abrió la ventana que está abierta.

   Una ventana se cierra y el foco se quedaba en la nada, porque el botón que la
   abrió lo destruyó el repintado. Se apunta antes de abrirla y se le devuelve
   al cerrarla, que es donde la persona estaba mirando. */
let quienAbrioLaVentana = null;

function render() {
  const sitio = window.scrollY;
  const foco = senaDelFoco();
  const pantallaAntes = senaAnterior;
  const ventanaAntes = ventanaAnterior;
  try {
    pintar();
  } catch (error) {
    const fila = anotar('pintar', error, { pagina: ui.page });
    try { pintarLoRoto(fila); } catch { /* Si ni eso se puede, no hay nada más que hacer desde aquí. */ }
    senaAnterior = null; ventanaAnterior = '';
    return;
  }
  senaAnterior = senaDePantalla();
  ventanaAnterior = ui.modal?.type || '';

  // El desplazamiento solo depende de la pantalla de atrás: abrir o cerrar una
  // ventana no puede mover lo que hay debajo, porque al cerrarla hay que
  // aparecer donde se estaba. Cambiar de pantalla sí empieza arriba —antes eso
  // pasaba de rebote, porque vaciar `#app` hacía que el navegador recortara el
  // desplazamiento, y por eso funcionaba unas veces sí y otras no—.
  window.scrollTo(0, senaAnterior === pantallaAntes ? sitio : 0);

  // El foco, en cambio, sí depende de la ventana: si acaba de abrirse una, el
  // botón de detrás sigue existiendo y devolvérselo dejaría el cursor fuera del
  // diálogo. Ahí manda el `autofocus` de la ventana recién pintada.
  if (senaAnterior === pantallaAntes && ventanaAnterior === ventanaAntes && devolverElFoco(foco)) return;
  if (ventanaAnterior && ventanaAnterior !== ventanaAntes) {
    // El primer control de verdad, no la equis: la equis suele ser el primer
    // botón del HTML y empezar ahí es ofrecer «cerrar» a quien acaba de abrir.
    const controles = [...document.querySelectorAll('#modal-root .modal input:not([type="hidden"]):not([disabled]), #modal-root .modal textarea, #modal-root .modal select, #modal-root .modal button')];
    const dentro = document.querySelector('#modal-root [autofocus]')
      || controles.find(el => el.dataset.action !== 'close-modal' && el.dataset.action !== 'cerrar-modal')
      || controles[0];
    dentro?.focus();
    return;
  }
  if (!ventanaAnterior && ventanaAntes && devolverElFoco(quienAbrioLaVentana)) { quienAbrioLaVentana = null; return; }
  document.querySelector('#app [autofocus]')?.focus();
}

// El último recurso: HTML mínimo, sin llamar a ningún módulo de pantalla —que
// es de donde acaba de venir el fallo— y con una salida que siempre funciona.
function pintarLoRoto(fila) {
  const salida = document.querySelector('#app');
  if (!salida) return;
  document.querySelector('#modal-root').innerHTML = '';
  ui.modal = null;
  salida.innerHTML = `<div class="shell"><main class="main"><div class="card" style="margin:24px auto;max-width:560px">
    <h2>Esta pantalla no se pudo dibujar</h2>
    <p>Tus datos están a salvo: esto se rompió al enseñar la pantalla, no al guardar nada.</p>
    <p class="muted small">Detalle técnico: ${esc(fila?.clase || 'Error')} — ${esc(fila?.mensaje || 'sin mensaje')}</p>
    <div class="inline">
      ${button('Volver a Hoy', 'volver-a-hoy', 'btn-primary')}
      ${button('Ver el detalle técnico', 'navigate', 'btn-quiet', 'data-page="ajustes"')}
    </div>
  </div></main></div>`;
}

/* ── Los datos que están y no se pueden leer ───────────────────────────────

   Este estado no quiere decir «tus datos se dañaron». Casi siempre quiere decir
   «este teléfono tiene una versión vieja de la app y la casa viene de una
   nueva»: es el rechazo deliberado que describe AGENTS.md, y la sincronización
   lo fabrica sola —un teléfono de la casa se actualiza y sube la versión nueva,
   el otro todavía no y se la baja—. Los datos siguen enteros en el cajón, byte
   por byte, y se recuperan solos en cuanto se actualice la app.

   Lo que había aquí era lo contrario de eso. Con `loadError` puesto, `state` es
   un estado vacío creado para poder pintar algo, así que debajo de la franja
   roja se pintaba el arranque de casa nueva con su botón grande, «Organizar mi
   casa». Entrar ahí y salir llamaba a `commit()`, que guardaba el estado vacío
   encima. El proyecto había construido la puerta por la que se entra y había
   dejado sin construir la salida: las tres cosas que la pantalla ofrecía
   —traer una copia, borrar los datos, y el botón grande de detrás— destruían
   los bytes, cada una a su manera.

   Ahora esta pantalla es lo único que se pinta, y mientras esté puesta no se
   escribe nada en ese cajón (ver `guardarSiSePuede`). De las tres salidas, la
   primera no toca nada, la segunda se los lleva a un archivo antes de que
   alguien decida, y la tercera dice lo que hace. */
function pantallaDeDatosIlegibles() {
  return `<div class="shell"><main class="main"><div class="card ilegible">
    <h2>Tus datos están aquí, pero esta versión de la app no sabe leerlos</h2>
    <p><strong>No se ha perdido nada.</strong> Lo que escribiste sigue guardado en este teléfono, entero. Lo que pasa es que se guardó con una versión más nueva de la aplicación que esta.</p>
    <p>Lo normal es que esto se arregle solo <strong>actualizando la aplicación</strong>. Si tienes dos teléfonos en la misma casa, es el que ya se actualizó el que escribió esto.</p>
    <div class="inline">
      ${button('Descargar lo que hay guardado', 'descargar-crudo', 'btn-primary')}
    </div>
    <p class="small muted">Esa descarga es una copia literal de lo guardado. Guárdala antes de tocar nada más: con ella, la app nueva puede traerlo todo de vuelta.</p>
    <p class="small muted">Detalle técnico: ${esc(loadError)}</p>
    <div class="modal-actions">
      ${button('Empezar de cero y perder lo guardado', 'clear-demo', 'btn-danger btn-small')}
    </div>
  </div></main></div>`;
}

function pintar() {
  /* El título del documento.

     Dentro del APK no lo lee nadie: un WebView no tiene pestaña ni barra de
     título. Pero esta app corre igual en un navegador, y ahí es lo que se lee en
     la pestaña, en el historial y en un marcador. Es una línea y no cuesta
     nada; lo que no se hace es apoyarse en ella para dar por resuelto que
     cambiar de sección se anuncia, que es otra cosa y se arregla aparte. */
  document.title = ui.page === 'hoy' ? '¿Qué comemos?' : `${pageTitle()} · ¿Qué comemos?`;
  document.body.classList.toggle('menu-open', ui.drawerOpen);
  document.body.classList.toggle('tour-open', ui.tour !== null);
  document.body.classList.toggle('tour-fab', ui.tour !== null && TOUR_STEPS[ui.tour].highlight === 'fab');
  // Antes que nada: unos datos que no se pueden leer no pueden compartir
  // pantalla con una app que se pueda usar, porque usarla los pisa.
  if (loadError) {
    document.querySelector('#app').innerHTML = pantallaDeDatosIlegibles();
    document.querySelector('#modal-root').innerHTML = '';
    return;
  }
  // Y antes que cualquier pantalla de la app, la de aceptar: primero se dice
  // qué hace esta app con lo que escribas, y después se pregunta nada.
  if (tocaAceptar()) {
    document.querySelector('#app').innerHTML = renderAceptar();
    document.querySelector('#modal-root').innerHTML = '';
    return;
  }
  // La portada de la cuenta va antes que la bienvenida: es lo primero que ve
  // quien abre la app sin sesión, y desde ella se decide si se entra o se sigue
  // sin cuenta. Va fuera del armazón porque no es una página más de la app.
  if (tocaPedirCuenta()) {
    document.querySelector('#app').innerHTML = renderCuenta(ctxCuenta());
    document.querySelector('#modal-root').innerHTML = '';
    return;
  }
  if (ui.welcome) {
    document.querySelector('#app').innerHTML = renderWelcome();
    document.querySelector('#modal-root').innerHTML = '';
    return;
  }
  const activa = id => (ui.page === id ? 'active' : '');
  const enAjustes = esPaginaDeAjustes(ui.page) ? 'active' : '';
  const cuerpo = PAGINAS[ui.page] ? PAGINAS[ui.page]() : PAGINAS_MAS.includes(ui.page) ? renderMas(ctx()) : renderToday();
  // El engranaje se dibuja dos veces —en el lateral y arriba en el teléfono—
  // porque tiene que estar a la vista en los dos sitios, y una sola función
  // evita que uno de los dos se quede sin poner al día.
  const engranaje = (clase, etiqueta) => `<button type="button" class="${clase} ${enAjustes}" data-action="navigate" data-page="ajustes" aria-label="Ajustes" title="Ajustes">${icono('ajustes', { tamano: 20 })}${etiqueta}</button>`;
  document.querySelector('#app').innerHTML = `<div class="shell ${ui.sidebarCollapsed ? 'sidebar-collapsed' : ''} ${ui.drawerOpen ? 'drawer-open' : ''}">
    <aside class="sidebar" id="app-sidebar" aria-label="Menú lateral">
      <div class="sidebar-head"><button type="button" class="icon-btn sidebar-close" data-action="close-sidebar" aria-label="Ocultar menú">‹</button><div class="brand"><span class="brand-mark">${BRAND_MARK}</span>¿Qué comemos?</div></div>
      <nav class="nav" aria-label="Navegación principal">${NAV.map(([id, icon, label]) => `<button type="button" class="${activa(id)}"${ui.page === id ? ' aria-current="page"' : ''} data-action="navigate" data-page="${id}"><span class="nav-icon">${icono(icon)}</span>${label}</button>`).join('')}</nav>
      <div class="secondary">${engranaje('', 'Ajustes')}</div>
      <div class="side-foot">Tus datos están solo en este aparato. Guarda una copia de vez en cuando desde Ajustes → Respaldo.</div>
    </aside>
    <button type="button" class="drawer-scrim" data-action="close-sidebar" aria-label="Cerrar menú lateral"></button>
    <main class="main">
      <div class="mobile-brand"><button type="button" class="menu-toggle" data-action="toggle-sidebar" aria-label="${ui.drawerOpen ? 'Ocultar menú' : 'Abrir menú'}" aria-controls="app-sidebar" aria-expanded="${ui.drawerOpen}">${icono('menu', { tamano: 22 })}</button><span class="brand-mark">${BRAND_MARK}</span><span>¿Qué comemos?</span>${engranaje('icon-btn engranaje-movil', '')}</div>
      <header class="topline"><div class="topline-heading"><button type="button" class="menu-toggle desktop-menu-toggle" data-action="toggle-sidebar" aria-label="${ui.sidebarCollapsed ? 'Abrir menú' : 'Ocultar menú'}" aria-controls="app-sidebar" aria-expanded="${!ui.sidebarCollapsed}">${icono('menu', { tamano: 22 })}</button>${enSubpantallaDeAjustes() ? `<button type="button" class="icon-btn volver-a-ajustes" data-action="navigate" data-page="ajustes" aria-label="Volver a Ajustes" title="Volver a Ajustes">${icono('izquierda', { tamano: 20 })}</button>` : ''}<div><p class="eyebrow">${esc(eyebrow())}</p><h1>${esc(pageTitle())}</h1></div></div>${engranaje('icon-btn engranaje-plegado', '')}</header>
      ${noSePudoGuardar ? notice('No pude guardar lo último en este teléfono', `${esc(noSePudoGuardar)} Lo que ves en pantalla <strong>todavía no está a salvo</strong>: si cierras la app, se pierde. ${button('Descargar una copia ahora', 'export', 'btn-primary btn-small')}`, 'error') : ''}
      ${avisoDeSesion ? notice('Sobre tu cuenta', `${esc(avisoDeSesion)} <button type="button" class="enlace" data-action="navigate" data-page="cuenta">Ir a mi cuenta</button>`, 'warn') : ''}
      ${ui.cuenta?.conflicto ? notice('Hay dos versiones de tu casa', 'Se guardaron cambios en este teléfono y en tu cuenta desde la última vez. Decide cuál se queda cuando puedas; mientras tanto no se toca ninguna. <button type="button" class="enlace" data-action="navigate" data-page="cuenta">Ver las dos</button>', 'warn') : ''}
      ${diasSinSubir() >= DIAS_PARA_AVISAR_DE_LA_SINCRONIA ? notice('Tu casa lleva días sin subir a tu cuenta', `Llevamos ${esc(conteo(diasSinSubir(), 'día', 'días'))} sin poder guardar en tu cuenta. Lo de este teléfono está entero; lo que hay en la cuenta es de antes. <button type="button" class="enlace" data-action="navigate" data-page="cuenta">Ir a mi cuenta</button>`, 'warn') : ''}
      ${migratedFrom ? notice('Tus datos se actualizaron al formato nuevo.', 'La canasta que tenías es ahora <strong>tus productos habituales</strong>, y lo que cambiaba en algún mes quedó guardado como cambio de ese mes. Nada se perdió, y lo anterior quedó a salvo por si acaso.') : ''}
      ${loadError ? notice('No se pudieron leer los datos guardados.', `${esc(loadError)} Trae una copia desde Ajustes → Respaldo, o borra los datos para empezar de nuevo.`, 'error') : ''}
      ${state.demo ? `<div class="demo-banner">${icono('chispa')}<div><strong>Estás viendo un ejemplo</strong>Los datos son inventados para que veas cómo funciona; no son recomendaciones de alimentación. Si ya escribiste cosas tuyas encima, dilo aquí y la franja se va sin borrar nada.<div class="inline demo-salidas">${button('Esto ya es mío', 'demo-adoptar', 'btn-secondary btn-small')}${button('Borrar todo y empezar de cero', 'clear-demo', 'btn-danger btn-small')}</div></div></div>` : ''}
      ${cuerpo}
    </main>
    ${ui.modal || ui.page === 'setup' || ui.page === 'hogar' ? '' : `<button type="button" class="fab" data-action="open-quick" aria-label="Anotar algo">${icono('mas', { tamano: 26 })}</button>`}
    <nav class="mobile-nav" aria-label="Navegación principal">${NAV.map(([id, icon, , corto]) => `<button type="button" class="${activa(id)}"${ui.page === id ? ' aria-current="page"' : ''} data-action="navigate" data-page="${id}"><span class="nav-icon">${icono(icon, { tamano: 22 })}</span>${corto}</button>`).join('')}</nav>
  </div>`;
  document.querySelector('#modal-root').innerHTML = ui.modal ? renderModal() : ui.tour === null ? '' : tourCard();
}

const eyebrow = () => (esPaginaDeAjustes(ui.page) && ui.page !== 'ajustes' ? 'Ajustes' : 'Organización de comidas');

/* ── Hoy ───────────────────────────────────────────────────────────────── */

// Esta pantalla no es para quien organiza: es para quien cocina. Tiene que
// decir qué preparar, cuánto, para quién y qué hay que apartar, sin una sola
// palabra de canastas, inventarios ni bases de cálculo.
function renderToday() {
  const sinNada = !state.products.length && !habitualLines(state).length && !state.recipes.length;
  if (sinNada) {
    return `<section class="hero start-hero">
      <div>
        <div class="eyebrow">${esc(niceDate(today()))}</div>
        <h2>Vamos a organizar tu casa</h2>
        <p>Una sola vez: quiénes comen aquí, lo que compras de costumbre y lo que sabes preparar. Desde ahí, decidir la semana es elegir, no escribir.</p>
      </div>
      ${button('Organizar mi casa', 'setup-open', 'btn-secondary')}
    </section>
    <div class="inline" style="margin-top:16px">${button('Ver un ejemplo', 'welcome-demo', 'btn-quiet')}</div>`;
  }
  // El progreso cuenta las tres de todos los días. Las meriendas no: una casa
  // que no merienda no tiene un día incompleto a las diez de la mañana, y
  // decirle que le faltan dos comidas sería reprocharle una costumbre que no
  // tiene. Las que estén puestas se enseñan igual, detrás.
  const hechas = SLOTS_PRINCIPALES.filter(slot => { const plan = planFor(state, today(), slot); return plan && plan.kind !== 'unplanned'; }).length;
  const total = SLOTS_PRINCIPALES.length;
  const meriendas = SLOTS.filter(slot => esOpcional(slot) && planFor(state, today(), slot));
  return `<section class="hero">
      <div>
        <div class="eyebrow">${esc(niceDate(today()))}</div>
        <h2>${hechas === total ? 'Todo listo para hoy' : hechas ? 'Casi listo' : '¿Qué comemos hoy?'}</h2>
        <p>${hechas} de ${total} comidas decididas${meriendas.length ? ` · ${conteo(meriendas.length, 'merienda', 'meriendas')}` : ''}</p>
      </div>
      ${hechas === total ? '' : button('Ver la semana', 'navigate', 'btn-secondary', 'data-page="semana"')}
    </section>
    <div class="grid grid-3">${SLOTS_PRINCIPALES.map(slot => tarjetaDeComida(slot, today())).join('')}</div>
    ${bloqueDeMeriendas(today())}
    ${pieDeHoy()}`;
}

// Las dos meriendas van juntas, debajo de las tres comidas y con menos peso.
// Puestas se leen como lo que son; vacías se ofrecen sin dar la lata, porque
// hay casas que no meriendan y no les falta nada.
function bloqueDeMeriendas(date) {
  const opcionales = SLOTS.filter(esOpcional);
  const puestas = opcionales.filter(slot => planFor(state, date, slot));
  if (!puestas.length) {
    // Sin el « · » entre medias y sin unirlos en una frase corrida: en un
    // teléfono la línea se parte y los dos enlaces quedaban uno encima de otro,
    // de 16 px de alto y sin un píxel de separación. Eran dos meriendas
    // distintas a un error de dedo la una de la otra. Ahora la pregunta es
    // pregunta y cada merienda es una ficha que se toca.
    return `<p class="small muted meriendas-vacias"><span class="meriendas-pregunta">¿Hay merienda hoy?</span>${opcionales.map(slot =>
      `<button type="button" class="enlace ficha-toque" data-action="open-meal" data-date="${date}" data-slot="${slot}">Anotar la ${esc(etiquetaDeMomento(slot).toLocaleLowerCase('es'))}</button>`).join('')}</p>`;
  }
  return `<div class="grid grid-2 meriendas">${opcionales.map(slot => {
    const plan = planFor(state, date, slot);
    if (!plan) {
      return `<article class="card soft merienda-card vacia"><div class="slot">${esc(etiquetaDeMomento(slot))}</div>
        <p class="small muted">Sin anotar. Es opcional.</p>
        ${button('Anotar', 'open-meal', 'btn-quiet btn-small', `data-date="${date}" data-slot="${slot}"`)}</article>`;
    }
    return `<article class="card soft merienda-card"><div class="slot">${esc(etiquetaDeMomento(slot))}</div>
      <div class="meal-title">${esc(tituloDePlan(plan))}</div>
      ${plan.items.length ? queLleva(plan) : ''}
      ${avisoDeAlergias(state, plan.items, plan.participants)}
      ${button('Ver o cambiar', 'open-meal', 'btn-quiet btn-small', `data-date="${date}" data-slot="${slot}"`)}</article>`;
  }).join('')}</div>`;
}

function tarjetaDeComida(slot, date) {
  const plan = planFor(state, date, slot);
  if (!plan) {
    return `<article class="card meal-card"><div class="slot">${esc(etiquetaDeMomento(slot))}</div>
      <div class="meal-body"><div class="meal-title">Todavía sin decidir</div><p class="muted small">Elige una comida o marca que hoy no se cocina.</p></div>
      ${button('Decidir', 'open-meal', 'btn-secondary btn-small', `data-date="${date}" data-slot="${slot}"`)}</article>`;
  }
  // Las tres que no nombran ningún plato. Una comida escrita a mano sí lo
  // nombra, así que no entra aquí: se pinta como cualquier otra.
  if (ESTADOS_SIN_COMIDA.includes(plan.kind)) {
    return `<article class="card meal-card fuera"><div class="slot">${esc(etiquetaDeMomento(slot))}</div>
      <div class="meal-body"><div class="meal-title">${esc(tituloDePlan(plan))}</div><p class="muted small">${plan.kind === 'outside' ? 'Hoy esta comida no se prepara en casa.' : plan.kind === 'order' ? 'Se pedirá fuera.' : 'Esta comida todavía está por decidir.'}</p></div>
      ${button('Cambiar', 'open-meal', 'btn-quiet btn-small', `data-date="${date}" data-slot="${slot}"`)}</article>`;
  }
  return `<article class="card meal-card"><div class="slot">${esc(etiquetaDeMomento(slot))}</div>
    <div class="meal-body">
      <div class="meal-title">${esc(tituloDePlan(plan))}</div>
      <div class="meal-people">${plan.participants.length ? `Para ${plan.participants.map(id => esc(personName(id))).join(', ')}` : 'Para quien coma en casa'}</div>
      ${queLleva(plan)}
      ${plan.note ? `<p class="small nota-cocina"><strong>Nota:</strong> ${esc(plan.note)}</p>` : ''}
      ${avisoDeAlergias(state, plan.items, plan.participants)}
    </div>
    ${button('Ver o cambiar', 'open-meal', 'btn-secondary btn-small', `data-date="${date}" data-slot="${slot}"`)}</article>`;
}

// Lo que se reserva para otro día va en negrita y con su fecha: quien cocina
// tiene que saber que de esas ocho libras, dos no se sirven hoy.
function queLleva(plan) {
  if (plan.kind === 'linked') {
    const origen = state.plans.find(item => item.id === plan.sourceId);
    const apartado = plan.reservedItems || [];
    // Dos maneras de venir de otra comida, y hay que contarlas distinto.
    //
    // Las de antes decían cuánto se apartaba de cada alimento, porque la app
    // llevaba la cuenta de la despensa. Las de ahora dicen «lo que sobre», sin
    // número, porque cuánto sobra lo sabe quien cocinó y no una cuenta.
    // Anunciar «se apartó esto» y no enseñar nada debajo era lo que pasaba
    // antes con las nuevas, y es peor que no decir nada.
    const deDonde = `${esc(origen?.title || 'otra comida')}${origen ? `, del ${esc(niceDate(origen.date, { day: 'numeric', month: 'short' }))}` : ''}`;
    return `<p class="small muted">${apartado.length ? `Se usa la parte que se apartó de ${deDonde}.` : `Es lo que sobre de ${deDonde}.`}</p>
      <ul class="food-list">${apartado.map(fila => {
        const item = origen?.items.find(row => row.id === fila.sourceItemId);
        return item ? `<li>${esc(productName(item.productId))}</li>` : '<li>Reserva sin alimento de origen</li>';
      }).join('')}</ul>
      ${plan.items.length ? `<p class="small strong">Además hay que preparar:</p><ul class="food-list">${plan.items.map(item => `<li>${itemText(item)}</li>`).join('')}</ul>` : ''}`;
  }
  if (!plan.items.length) return '<p class="small muted">Sin alimentos anotados.</p>';
  const filas = plan.items.map(item => `<li><strong>${esc(productName(item.productId))}</strong></li>`).join('');
  const hijos = dependents(state, plan.id);
  return `<ul class="food-list">${filas}</ul>${hijos.length ? `<p class="small muted">De esta comida se vuelve a comer en ${hijos.map(hijo => `${cap(etiquetaDeMomento(hijo.slot))} del ${niceDate(hijo.date, { day: 'numeric', month: 'short' })}`).join(', ')}. Guarda una parte.</p>` : ''}`;
}

function pieDeHoy() {
  const manana = addDays(today(), 1);
  const hayManana = SLOTS.some(slot => planFor(state, manana, slot));
  // El aviso de «hoy toca revisar lo que queda» se fue con el inventario. La
  // app ya no lleva la cuenta de lo que hay en la casa, así que pedir un repaso
  // para afinar un número que no calcula sería pedir trabajo para nada.
  return `${lineaDeCompra()}
    ${hayManana ? `<div class="section-head"><div><h2>Mañana</h2></div>${button('Ver la semana', 'navigate', 'btn-quiet btn-small', 'data-page="semana"')}</div>
      <div class="grid grid-3">${SLOTS.filter(slot => !esOpcional(slot) || planFor(state, manana, slot)).map(slot => {
        const plan = planFor(state, manana, slot);
        return `<div class="card soft"><div class="between"><span class="pill ${esOpcional(slot) ? 'gray' : 'warm'}">${esc(etiquetaDeMomento(slot))}</span></div><h3 style="margin-top:10px">${esc(plan ? tituloDePlan(plan) : 'Sin decidir')}</h3>${plan?.kind === 'linked' ? '<p class="small muted">Es lo que sobre de otra comida.</p>' : ''}</div>`;
      }).join('')}</div>` : ''}`;
}

// Una línea, no una tarjeta: quien abre «Hoy» viene a cocinar, y lo que falta
// comprar es un dato de fondo. Si no falta nada, no se dice nada: un aviso que
// aparece siempre deja de leerse.
// Lo que queda por buscar de la lista que se esté escribiendo. No es una cuenta
// de lo que hace falta —la app no lo sabe—: es lo que hay apuntado y todavía no
// se ha tachado.
function lineaDeCompra() {
  const lista = listaEnCurso(state);
  if (!lista) return '';
  const { total, pendientes } = resumenDeLista(lista);
  if (!total || !pendientes) return '';
  return `<p class="hoy-compra small muted">En tu lista de la compra quedan <strong>${pendientes}</strong> ${pendientes === 1 ? 'cosa' : 'cosas'} por buscar. <button type="button" class="enlace" data-action="navigate" data-page="compra">Ver la lista</button></p>`;
}

/* ── Piezas de formulario compartidas ──────────────────────────────────── */

const unitOptions = selected => options(UNITS.map(unit => [unit, unit]), selected);
/* `productOptions` e `itemRow` vivían aquí y ahora están en
   `preparacion.js`, con el resto del formulario de una preparación. Se
   movieron porque el recorrido inicial también los necesita: tenía su propio
   formulario, sin alimentos, y quien registraba su casa por primera vez
   escribía sus preparaciones a medias sin enterarse. */
const itemRow = (item = {}) => filaDeAlimento(state, item);

// Quien está dado de baja no aparece aquí, salvo que ya estuviera marcado en
// esta comida: una comida de marzo la comió quien la comió, y editarla no puede
// expulsar a nadie por haberse mudado en agosto.
/* ── Avisar con la gravedad que toca ───────────────────────────────────────

   Tres niveles y tres aspectos distintos, porque un maní que manda al hospital
   y una berenjena que no gusta no son el mismo aviso. Cuando todo alarma igual,
   la gente deja de leer y el aviso que importa se pierde entre los otros.

   Ninguno impide guardar. Las tres salidas —cambiar la preparación, cambiar
   quién come, o dejarla porque se hará otra cosa— son los tres controles que ya
   están en pantalla: el selector de arriba, las casillas de las personas, y el
   botón de guardar. */

/* ── ¿Para toda la casa, o solo para algunos? ──────────────────────────────

   Por defecto, para toda la casa: no se pregunta nada. Las casillas de las
   personas solo aparecen si alguien abre la excepción, que es lo que de verdad
   es una excepción.

   Los que estén marcados fuera ese día salen anotados, pero no se descuentan
   solos de lo que se cocina: la olla de arroz no se encoge porque un hijo avise
   a las seis de que come fuera. */

function bloqueDeQuienComeAbierto(ui) {
  return Boolean(ui.modal?.soloAlgunos);
}

/* Los dos lados se pintan siempre, y se alterna cuál está vivo.
   ────────────────────────────────────────────────────────────────────────────
   Antes se pintaba solo uno y cambiar de lado pasaba por `render()`, que
   reconstruye la ventana entera desde el estado. Quien había escrito el nombre
   de la preparación y la nota, y entonces se preguntaba si era para todos, las
   perdía las dos: la ventana volvía en blanco y encima en otra pestaña. Es el
   único sitio de la app donde repintar podía tirar algo escrito —`add-item` y
   `remove-item`, que son sus vecinos, ya tocaban el DOM a mano—.

   `<fieldset disabled>` y no solo `hidden`: los dos lados usan el mismo `name`,
   y un campo escondido con `display:none` se envía igual. Deshabilitado no. Es
   la misma red que `checkPeople` ya usa para quien está marcado fuera.

   `ui.modal.soloAlgunos` se sigue actualizando para que un repintado posterior
   —añadir un alimento, por ejemplo— devuelva la ventana por el lado correcto. */
function bloqueDeQuienCome(name, marcados, date, slot, { abierto } = {}) {
  if (!state.people.length) return '';
  const fuera = personasActivas(state).filter(person => isAbsent(state, date, slot, person.id));
  const apagado = vivo => (vivo ? '' : 'hidden disabled');
  return `<div class="field quien-come" data-quien-come>
    <fieldset data-quien="todos" ${apagado(!abierto)}>
      <p class="small muted">Esta comida es para toda la casa.${fuera.length ? ` Hoy está marcado fuera: ${fuera.map(person => esc(person.name)).join(', ')}.` : ''}</p>
      ${marcados.map(id => `<input type="hidden" name="${esc(name)}" value="${esc(id)}">`).join('')}
      <button type="button" class="enlace" data-action="solo-algunos">¿Esta preparación es solamente para algunas personas?</button>
    </fieldset>
    <fieldset data-quien="algunos" ${apagado(abierto)}>
      <span>¿Quiénes comen de esta preparación?</span>
      ${checkPeople(name, marcados, date, slot)}
      <button type="button" class="enlace" data-action="solo-algunos">Volver a dejarla para toda la casa</button>
    </fieldset>
  </div>`;
}

// Delante de una comida del calendario, la primera pregunta de cualquiera es
// si la puso él. Contestarla en una línea es lo que hace que se atreva a
// cambiarla: quitar algo que viene de una versión anterior de la app no es lo
// mismo que quitar algo que uno mismo escribió el martes.
function lineaDeOrigen(plan) {
  const origen = origenDe(plan);
  return `<p class="origen-linea"><span class="origen-punto origen-${esc(origen)}" aria-hidden="true"></span><strong>${esc(etiquetaDeOrigen(origen))}</strong> · ${esc(detalleDeOrigen(origen))}</p>`;
}

function checkPeople(name, selected, date = null, slot = null) {
  const gente = state.people.filter(person => esActiva(person) || selected.includes(person.id));
  if (!gente.length) return '<p class="muted small">Todavía no hay personas registradas. Puedes seguir sin ellas.</p>';
  return `<div class="checks">${gente.map(person => {
    const ausente = date && isAbsent(state, date, slot, person.id);
    return `<label class="chip-check ${ausente ? 'disabled' : ''}"><input type="checkbox" name="${name}" value="${person.id}" ${selected.includes(person.id) ? 'checked' : ''} ${ausente ? 'disabled' : ''}>${esc(person.name)}${ausente ? ' <span class="muted">(fuera)</span>' : ''}</label>`;
  }).join('')}</div>`;
}

/* ── Ventanas ──────────────────────────────────────────────────────────── */


function renderModal() {
  const m = ui.modal;

  if (m.type === 'quick') {
    return modal('Anotar algo', '', `<div class="quick-grid">${rapidasDeAqui().map(([action, dibujo, titulo, detalle, extra = '']) =>
      `<button type="button" class="quick-item" data-action="${action}" ${extra}><span class="quick-icon">${icono(dibujo, { tamano: 24 })}</span><span class="quick-text"><strong>${esc(titulo)}</strong><span>${esc(detalle)}</span></span></button>`).join('')}</div>`);
  }

  if (m.type === 'compra-pendientes') return modalPendientes(ctx(), m);
  if (m.type === 'ir-a-fecha') return modalIrAFecha(ctx());

  if (m.type === 'poner-en-dias') return modalPonerEnDias(ctx(), m);

  if (m.type === 'dia') return modalDia(ctx(), m);

  if (m.type === 'meal') return modalComida(m);


  /* ── Una preparación ──────────────────────────────────────────────────────

     Cuatro cosas en orden y ninguna escondida: nombre, cuándo se come, qué
     lleva, y la nota de quien cocina.

     Lo que se fue: «¿quiénes la comen normalmente?». Se preguntaba aquí y se
     volvía a preguntar al ponerla en el calendario, y de las dos respuestas la
     buena era siempre la segunda, porque quién come depende del día y no del
     plato. Ahora una preparación es de la casa, y la excepción se marca el día
     que toca.

     Y los alimentos salen del plegable. Estaban dentro de «Más opciones», que
     es exactamente donde no se mira: son lo que convierte una preparación en
     una lista de compra, y esconderlos era esconder para qué sirve todo esto. */
  if (m.type === 'recipe') {
    const recipe = state.recipes.find(item => item.id === m.id);
    const enCasa = personasActivas(state).length;
    return modal(recipe ? 'Editar preparación' : 'Nueva preparación',
      'Con el nombre y cuándo se come ya basta. Lo demás se puede añadir después.',
      `<form data-form="recipe" data-id="${recipe?.id || ''}" class="receta-form">
        ${camposDePreparacion(state, recipe || {})}
        <div class="modal-actions">
          ${recipe ? '' : '<button class="btn btn-secondary" type="submit" name="seguir" value="1">Guardar y añadir otra</button>'}
          <button class="btn btn-primary" type="submit">Guardar</button>
        </div>
      </form>`, true);
  }

  // La ficha de una persona. El cuerpo lo dibuja `hogar.js`: es exactamente el
  // mismo formulario que el de la configuración guiada, y tenerlo dos veces
  // escrito sería tener dos sitios donde olvidarse de preguntar el motivo.
  //
  if (m.type === 'persona') {
    const person = state.people.find(item => item.id === m.id);
    const ficha = fichaActiva(ctxHogar());
    return modal(person ? 'Editar persona' : 'Añadir persona', '', `<form data-form="persona" data-id="${esc(person?.id || '')}">
      ${cuerpoDeFicha(ctxHogar(), ficha, { prefijo: 'hogar' })}
      <div class="modal-actions">${person ? button(esActiva(person) ? 'Ya no vive aquí' : 'Vuelve a vivir aquí', esActiva(person) ? 'hogar-baja' : 'hogar-alta', 'btn-quiet', `data-id="${esc(person.id)}"`) : ''}<button type="submit" class="btn btn-primary">Guardar</button></div></form>`, true);
  }

  if (m.type === 'product') return modalProducto(m);

  if (m.type === 'avanzado-producto') {
    const item = product(state, m.id);
    return modal('Más opciones', item?.name || '', `<div class="opcion-larga">
      <button type="button" class="radio-bloque" data-action="open-equivalence" data-id="${m.id}"><span><strong>Cómo lo compras</strong>Si lo cuentas de una forma y lo compras de otra —ruedas y paquetes, por ejemplo—, aquí se dice cuánto trae cada uno.</span></button>
      <button type="button" class="radio-bloque" data-action="open-merge" data-id="${m.id}"><span><strong>Unir con otro alimento</strong>Si el mismo alimento quedó anotado dos veces con nombres distintos, esto junta las dos fichas en una y le pasa todo su historial.</span></button>
      <button type="button" class="radio-bloque" data-action="archive-product" data-id="${m.id}"><span><strong>Archivar</strong>Deja de aparecer en las listas, pero su historial se conserva entero. Se puede reactivar cuando quieras.</span></button>
    </div>`);
  }

  if (m.type === 'merge') {
    const item = product(state, m.id);
    const parecidos = findSimilarProducts(state, item?.name || '', { limit: 6, threshold: 0.45, exclude: m.id });
    const compatibles = state.products.filter(other => other.id !== m.id && other.controlUnit === item?.controlUnit);
    return modal('Unir con otro alimento', item?.name || '', `<div class="notice warn">${icono('aviso')}<div><strong>Esto no se puede deshacer.</strong>Todo el historial —compras, listas, preparaciones— queda bajo un solo alimento. El otro deja de existir.</div></div>
      ${parecidos.length ? `<p class="small"><strong>Se parecen a este:</strong> ${parecidos.map(row => esc(row.product.name)).join(', ')}.</p>` : ''}
      <form data-form="merge" data-id="${m.id}" class="stack">
        <label class="field"><span>¿Con cuál se une?</span><select name="otro" required>${options(compatibles.map(other => [other.id, other.name]), parecidos[0]?.product.id, 'Elegir un alimento')}</select>
        <small>Solo salen los que se cuentan en <strong>${esc(item?.controlUnit || '')}</strong>: sumar libras con unidades daría un número sin significado.</small></label>
        <label class="field"><span>¿Cuál nombre se queda?</span><select name="conservar">${options([[m.id, `«${item?.name}» (este)`], ['otro', 'El del otro alimento']], m.id)}</select></label>
        <div class="modal-actions"><button type="submit" class="btn btn-danger">Unir los dos</button></div></form>`);
  }

  if (m.type === 'diagnostico') return modalDiagnostico();

  if (m.type === 'equivalence') {
    const item = product(state, m.id);
    return modal('Cómo lo compras', item?.name || '',
      `<p class="muted small">Cuentas este alimento en <strong>${esc(item?.controlUnit || '')}</strong>. Si lo compras de otra forma, dinos cuántas trae cada una y la app hace la cuenta sola.</p>
       <form data-form="equivalence" data-id="${item?.id || ''}" class="stack">
        <label class="field"><span>Lo compro en…</span><select name="unit">${unitOptions(item?.purchaseUnit !== item?.controlUnit ? item.purchaseUnit : UNITS.find(unit => unit !== item?.controlUnit))}</select></label>
        <label class="field"><span>Y cada uno trae… (en ${esc(unitText(item?.controlUnit || '', 2))})</span><input name="factor" type="number" step="any" min="0.001" inputmode="decimal" required placeholder="Ej. 12"></label>
        <div class="modal-actions"><button type="submit" class="btn btn-primary">Guardar</button></div></form>`);
  }

  if (m.type === 'sobras') {
    const source = state.plans.find(item => item.id === m.id);
    return modal('Usar lo que sobró', `${source?.title || ''} · ${niceDate(source.date, { day: 'numeric', month: 'long' })}`,
      `<div class="hint">Elige cuándo se vuelve a comer. <strong>No se pregunta cuánto</strong>: cuánto sobró lo sabes tú, no una cuenta.</div>
       <form data-form="sobras" data-id="${source.id}">
        <div class="form-grid" style="margin-top:15px">
          <label class="field"><span>¿Para qué día?</span><input type="date" name="date" min="${source.date}" value="${addDays(source.date, 1)}" required></label>
          <label class="field"><span>¿Qué comida?</span><select name="slot">${options(SLOTS.map(slot => [slot, etiquetaDeMomento(slot)]), 'almuerzo')}</select></label>
        </div>
        <div class="field" style="margin-top:15px"><span>¿Quiénes se lo comen?</span>${checkPeople('participants', source.participants)}</div>
        <p class="tiny muted" style="margin-top:12px">Queda anotado de dónde viene, y la app avisa antes de dejarte borrar la comida de origen.</p>
        <div class="modal-actions"><button type="submit" class="btn btn-primary">Ponerla</button></div></form>`);
  }

  if (m.type === 'move' || m.type === 'copy') {
    const plan = state.plans.find(item => item.id === m.id);
    return modal(m.type === 'move' ? 'Mover esta comida' : 'Copiar esta comida', tituloDePlan(plan),
      `<form data-form="move-copy" data-id="${plan.id}" data-operation="${m.type}" class="stack">
        <div class="form-grid"><label class="field"><span>¿A qué día?</span><input type="date" name="date" value="${m.type === 'copy' ? addDays(plan.date, 1) : plan.date}" required></label>
        <label class="field"><span>¿Qué comida?</span><select name="slot">${options(SLOTS.map(slot => [slot, etiquetaDeMomento(slot)]), plan.slot)}</select></label></div>
        <div class="modal-actions"><button type="submit" class="btn btn-primary">${m.type === 'move' ? 'Mover' : 'Copiar'}</button></div></form>`);
  }

  if (m.type === 'bulk') return modal('Escribir varios', 'De corrido, como se habla. La app lo separa y tú revisas antes de guardar.', renderBulk({ ...ctx(), bulk: ui.bulk }), true);

  if (m.type === 'absence') return modal('Alguien no come en casa', '',
    `<form data-form="absence" class="stack"><div class="form-grid">
      <label class="field"><span>¿Qué día?</span><input name="date" type="date" value="${m.date || today()}" required></label>
      <label class="field"><span>¿Qué comida?</span><select name="slot">${options(SLOTS.map(slot => [slot, etiquetaDeMomento(slot)]), m.slot || 'almuerzo')}</select></label></div>
      <div class="field"><span>¿Quién?</span>${checkPeople('absent', state.absences.filter(item => item.date === (m.date || today()) && item.slot === (m.slot || 'almuerzo')).map(item => item.personId))}</div>
      <div class="modal-actions"><button type="submit" class="btn btn-primary">Guardar</button></div></form>`);

  if (m.type === 'import') return modal('Traer una copia', 'Reemplaza todo lo que hay ahora.',
    `<form data-form="import" class="stack"><label class="field"><span>Archivo guardado desde ¿Qué comemos?</span><input name="file" type="file" accept=".json,application/json" required></label><div class="modal-actions"><button type="submit" class="btn btn-primary">Traer</button></div></form>`);

  return '';
}


// La ventana de una comida es donde se decide entre «solo hoy» y «todos los
// lunes». Ofrecer las dos cosas aquí es lo que evita tener que tocar dieciocho
// casillas para poner el mismo desayuno.
function comidasReutilizables(date, slot) {
  const desde = addDays(date, -14);
  const orden = SLOTS.indexOf(slot);
  return state.plans
    .filter(plan => ['recipe', 'suelta'].includes(plan.kind))
    .filter(plan => plan.date >= desde && (plan.date < date || (plan.date === date && SLOTS.indexOf(plan.slot) < orden)))
    .sort((a, b) => b.date.localeCompare(a.date) || SLOTS.indexOf(b.slot) - SLOTS.indexOf(a.slot))
    .slice(0, 15);
}

function modalComida(m) {
  const plan = planFor(state, m.date, m.slot);
  const contexto = `${etiquetaDeMomento(m.slot)} · ${niceDate(m.date, { weekday: 'long', day: 'numeric', month: 'long' })}`;
  if (!plan) {
    const opciones = state.recipes.filter(recipe => recipe.uses.includes(m.slot));
    // Sin decir nada, la comida es para toda la casa: se marcan todos los que
    // viven aquí hoy. Quitar a alguien es la excepción, no el trámite.
    const marcados = personasActivas(state).map(person => person.id);
    const anteriores = comidasReutilizables(m.date, m.slot);
    // Se abre por donde se puede contestar. Quien todavía no ha escrito
    // ninguna preparación no puede empezar por un desplegable vacío: empieza
    // escribiendo lo que se come, que es lo que de verdad quiere hacer.
    //
    // `m.modo` existe para cuando la ventana se repinta con un error dentro: sin
    // él, el repintado devolvería la pestaña a su sitio de salida y lo escrito
    // en «Escribirla» quedaría detrás de una pestaña cerrada, justo cuando se
    // acaba de decir que hay algo que corregir ahí.
    const modoInicial = m.modo || (opciones.length ? 'preparacion' : 'escrita');
    const pestana = (id, etiqueta) => `<button type="button" data-action="comida-modo" data-modo="${id}" class="${modoInicial === id ? 'active' : ''}" aria-pressed="${modoInicial === id}">${etiqueta}</button>`;
    const panel = (id, cuerpo) => `<div data-panel="${id}" ${modoInicial === id ? '' : 'hidden'}>${cuerpo}</div>`;
    return modal('¿Qué se come?', contexto, `<form data-form="assign" class="stack">
      <input type="hidden" name="date" value="${m.date}"><input type="hidden" name="slot" value="${m.slot}">
      <div class="segmented segmented-ancho" role="group" aria-label="Cómo se anota esta comida">
        ${pestana('preparacion', 'Una preparación')}${pestana('escrita', 'Escribirla')}${anteriores.length ? pestana('sobro', 'Lo que sobró') : ''}
      </div>
      ${panel('preparacion', opciones.length
        ? `<label class="field"><span>¿Cuál?</span><select name="recipeId" id="assign-recipe">${options(opciones.map(recipe => [recipe.id, recipe.name]), opciones[0]?.id)}</select></label>`
        : `<div class="hint">Todavía no tienes preparaciones para ${esc(etiquetaDeMomento(m.slot).toLocaleLowerCase('es'))}. ${button('Crear una', 'open-recipe', 'btn-secondary btn-small')} O escríbela aquí mismo, en la pestaña de al lado.</div>`)}
      ${panel('escrita', `<label class="field"><span>¿Qué se come?</span><input name="titulo" placeholder="Ej. lo que quedó del sancocho" autocapitalize="sentences" spellcheck="true" maxlength="60" enterkeyhint="done"${m.errorTitulo ? ' aria-invalid="true" aria-describedby="mal-titulo"' : ''}></label>
        ${m.errorTitulo ? `<p class="setup-error" id="mal-titulo" role="alert">${esc(m.errorTitulo)}</p>` : ''}
        <label class="field"><span>Nota para quien cocina (opcional)</span><input name="nota" placeholder="Ej. calentar a fuego lento" autocapitalize="sentences" spellcheck="true"></label>
        <p class="hint">Se anota solo en este día. No entra en tus preparaciones: esas son las que sabes hacer y vas a repetir.</p>`)}
      ${anteriores.length ? panel('sobro', `<label class="field"><span>¿De cuál comida?</span>
        <select name="sobroDe">${options(anteriores.map(item => [item.id, `${item.title} · ${niceDate(item.date, { weekday: 'short', day: 'numeric', month: 'short' })}, ${etiquetaDeMomento(item.slot).toLocaleLowerCase('es')}`]), anteriores[0]?.id)}</select></label>
        <p class="hint">No se pregunta cuánto: cuánto sobró lo sabes tú. Queda anotado de dónde viene, y avisamos antes de borrar esa comida.</p>`) : ''}
      ${bloqueDeQuienCome('participants', marcados, m.date, m.slot, { abierto: bloqueDeQuienComeAbierto(ui) })}
      <div data-choque>${avisoDeAlergias(state, opciones[0]?.items || [], marcados, { conSalidas: true })}</div>
      <button type="submit" class="btn btn-primary">Poner esta comida</button>
      </form>
      <div class="divider"></div>
      <div class="small strong" style="margin-bottom:9px">O marcar que no se cocina</div>
      <div class="inline">${[['outside', 'Comemos fuera'], ['order', 'Pedimos comida'], ['unplanned', 'Todavía no sabemos']].map(([kind, label]) =>
        button(label, 'mark-status', 'btn-secondary btn-small', `data-date="${m.date}" data-slot="${m.slot}" data-kind="${kind}"`)).join('')}</div>
      <p class="small muted" style="margin:12px 0 0">Un día de paseo no se parte en tres: ${button('marcar el día entero fuera', 'mark-day', 'btn-quiet btn-small', `data-date="${m.date}" data-kind="outside"`)}</p>`);
  }
  if (ESTADOS_SIN_COMIDA.includes(plan.kind)) {
    return modal(tituloDePlan(plan), contexto, `${lineaDeOrigen(plan)}
      <p class="muted">Esta comida está resuelta: no cuenta como pendiente y no gasta alimentos.</p>
      <div class="modal-actions">${button('Cambiarla por una comida', 'delete-plan', 'btn-secondary', `data-id="${plan.id}"`)}${button('Quitar la marca', 'delete-plan', 'btn-quiet', `data-id="${plan.id}"`)}</div>`);
  }
  // Cambiar el plato de un solo día. Antes había que quitar la comida y volver a
  // ponerla, que son dos gestos para decir «ese jueves cenamos otra cosa».
  const cambiables = plan.kind === 'recipe'
    ? state.recipes.filter(recipe => recipe.uses.includes(plan.slot) && recipe.id !== plan.recipeId)
    : [];
  return modal(plan.kind === 'linked' ? 'Comida apartada' : 'Esta comida', contexto,
    `${lineaDeOrigen(plan)}
     <div class="hint">Lo que cambies aquí afecta solo a este día.</div>
     ${cambiables.length ? `<form data-form="sustituir" data-id="${plan.id}" class="sustituir-comida">
        <label class="field"><span>Cambiar por otra preparación, solo este día</span>
          <select name="recipeId">${options(cambiables.map(recipe => [recipe.id, recipe.name]), '', 'Elegir otra…')}</select>
        </label>
        <button type="submit" class="btn btn-secondary btn-small">Cambiar solo este día</button>
      </form>` : ''}
     ${plan.kind === 'linked' ? queLleva(plan) : dependents(state, plan.id).length ? `<div class="notice warn">${icono('aviso')}<div><strong>De esta comida se come otro día.</strong>Cocina de más, o guarda una parte antes de servir.</div></div>` : ''}
     <div data-choque>${avisoDeAlergias(state, plan.items, plan.participants, { conSalidas: true })}</div>
     <form data-form="plan" data-id="${plan.id}">
      <div class="form-grid">
        <label class="field"><span>Nombre</span><input name="title" value="${esc(plan.title)}" required></label>
        ${bloqueDeQuienCome('participants', plan.participants, plan.date, plan.slot, { abierto: bloqueDeQuienComeAbierto(ui) || plan.participants.length !== personasActivas(state).length })}
      </div>
      <label class="field" style="margin-top:14px"><span>Nota para quien cocina</span><textarea name="note" placeholder="Ej. dejar una parte para mañana" autocapitalize="sentences" spellcheck="true" enterkeyhint="done">${esc(plan.note || '')}</textarea></label>
      <details class="more" style="margin-top:16px" ${plan.items.length ? 'open' : ''}>
        <summary>${plan.kind === 'linked' ? 'Alimentos que hay que preparar además' : 'Qué lleva esta comida'}</summary>
        <p class="small muted">Sirve para avisarte si alguien de la casa debe evitar alguno. No hace falta decir cuánto.</p>
        <div data-item-list="ingredient">${plan.items.map(item => itemRow(item)).join('')}</div>
        ${button('+ Añadir alimento', 'add-item', 'btn-secondary btn-small', 'data-type="ingredient"')}
      </details>
      <div class="modal-actions"><button type="submit" class="btn btn-primary">Guardar</button></div>
     </form>
     <div class="divider"></div>
     <div class="inline">
       ${/* Desde una comida ya puesta: la ventana de poner en varios días se abre
            con esta preparación y este momento ya elegidos. Lo único que queda
            por marcar son los días, que es lo único que esta comida no sabe. */''}
       ${plan.kind === 'recipe' && plan.recipeId
         ? button('Ponerla otros días', 'semana-poner-en-dias', 'btn-secondary btn-small', `data-receta="${esc(plan.recipeId)}" data-slot="${esc(plan.slot)}" data-kind="recipe"`)
         : ''}
       ${['recipe', 'suelta'].includes(plan.kind) ? button('Usar lo que sobró otro día', 'open-sobras', 'btn-quiet btn-small', `data-id="${plan.id}"`) : ''}
       ${button('Mover', 'open-move', 'btn-quiet btn-small', `data-id="${plan.id}"`)}
       ${plan.kind !== 'linked' ? button('Copiar', 'open-copy', 'btn-quiet btn-small', `data-id="${plan.id}"`) : ''}
       ${button('Quitar', 'delete-plan', 'btn-quiet btn-small', `data-id="${plan.id}"`)}
     </div>
     <div class="small strong" style="margin:17px 0 8px">O cambiarla a</div>
     <div class="inline">${[['outside', 'Comemos fuera'], ['order', 'Pedimos comida'], ['unplanned', 'Todavía no sabemos']].map(([kind, label]) =>
       button(label, 'replace-status', 'btn-quiet btn-small', `data-id="${plan.id}" data-kind="${kind}"`)).join('')}</div>`, true);
}

/* ── La ficha de un producto ───────────────────────────────────────────────

   Tres campos. Aquí había siete, y cuatro de ellos —el consumo del mes, cómo se
   cuenta, de qué grosor se corta y cuántas libras trae el paquete— eran para
   una cuenta que la app ya no hace.

   El rubro no es una categoría técnica: es el sitio donde la persona va a
   buscarlo, el mismo en el que lo marcó al registrarse y el mismo en el que lo
   encuentra al preparar la compra. La nota es para quien va al colmado —«el de
   la bolsa azul»—, no para quien cocina: esa va en la preparación.

   Por dentro el alimento sigue teniendo su unidad y su categoría, que hacen
   falta para escribir una compra. Se heredan del rubro y nadie tiene que
   gestionarlas. */

function modalProducto(m) {
  const item = product(state, m.id);
  const linea = item && state.habitualBasket.lines.find(row => row.productId === item.id);
  const rubro = item ? rubroDe(state, item.id) : 'otros';
  return modal(item ? 'Editar producto' : 'Añadir un producto', item ? '' : 'Con el nombre basta.',
    `<form data-form="product" data-id="${item?.id || ''}" class="stack">
      <label class="field"><span>¿Cómo se llama?</span><input name="name" data-dedup required value="${esc(item?.name || '')}" placeholder="Ej. Plátano maduro" autocomplete="off"></label>
      <div data-dedup-warning></div>
      <label class="field"><span>¿Dónde lo buscas?</span>
        <select name="rubro">${options(RUBROS.map(item => [item.id, item.titulo]), rubro)}</select>
        <small>El grupo en el que aparecerá al preparar la compra.</small></label>
      <label class="field"><span>Una nota para la compra <span class="muted">(si hace falta)</span></span>
        <input name="nota" value="${esc(linea?.nota || '')}" placeholder="Ej. el de la bolsa azul" autocomplete="off" maxlength="60">
        <small>La ve quien va al colmado. Lo de cocinarlo va en la preparación.</small></label>
      ${item ? '' : '<p class="small muted">Entra en tus productos habituales: los que tu casa compra de costumbre. No se apunta ninguna cantidad; eso se decide en cada compra.</p>'}
      <div class="modal-actions"><button type="submit" class="btn btn-primary">Guardar</button></div></form>`);
}

// Sin esta pantalla, un «se me cerró» es imposible de resolver a distancia. Con
// ella, basta con que la persona mande esta lista.
function modalDiagnostico() {
  const instalada = Boolean(globalThis.Capacitor?.isNativePlatform?.());
  const plataforma = instalada ? `Aplicación instalada (${globalThis.Capacitor?.getPlatform?.() || 'android'})` : 'Navegador';
  return modal('Detalle de este aparato', 'Para poder explicar un fallo sin tener el teléfono delante.',
    `<table class="data-table"><tbody>
      <tr><td>Dónde corre</td><td class="num">${esc(plataforma)}</td></tr>
    </tbody></table>
    ${listaDeFallos()}`, true);
}

// Lo que la red global lleva recogido desde que se abrió la aplicación.
//
// Está aquí y no escondido en un archivo de registro porque el único que puede
// contar qué pasó es quien lo tiene en la mano, y «se me cerró» no es un informe
// que nadie pueda seguir. Con esto, la respuesta cabe en una captura de
// pantalla: la clase del error, el mensaje y de dónde salió.
//
// Cuando no se ha roto nada lo dice con una línea, que es la respuesta que hace
// falta cuando se abre esto por curiosidad y no por un problema.
function listaDeFallos() {
  const filas = fallosRecientes();
  if (!filas.length) return '<p class="small muted">No se ha roto nada desde que abriste la aplicación.</p>';
  return `<p class="small muted" style="margin-top:14px">Lo que se ha roto desde que abriste la aplicación. No sale de este teléfono; enséñalo si hace falta explicar un fallo.</p>
    <table class="data-table"><tbody>${filas.map(fila => `<tr>
      <td>${esc(fila.donde)}<div class="small muted">${esc(String(fila.cuando).slice(11, 19))}</div></td>
      <td class="num pending">${esc(fila.clase)}: ${esc(fila.mensaje || 'sin mensaje')}</td>
    </tr>`).join('')}</tbody></table>`;
}

/* ── Utilidades de formulario ──────────────────────────────────────────── */

// Los alimentos que lleva una comida. Solo cuáles: las filas no preguntan
// cuánto, así que aquí no hay ninguna cantidad que leer.
function collectItems(form) {
  return [...form.querySelectorAll('[data-item-row]')]
    .map(row => ({
      id: row.querySelector('[name="itemId"]')?.value || undefined,
      productId: row.querySelector('[name="productId"]')?.value
    }))
    .filter(item => item.productId);
}
// El segundo argumento no es opcional por capricho: sin él, el botón que envió
// el formulario no entra en los datos, y dos botones con el mismo `name` y
// distinto `value` —«guardar a medias» y «terminar»— se vuelven indistinguibles.
const formValues = (form, submitter = null) => new FormData(form, submitter);
/* ── Lo marcado, y lo que está contestado sin casillas ─────────────────────

   Esto leía solo `:checked`, y por eso no se podía poner ni una comida en una
   casa con gente registrada.

   «¿Quiénes comen?» se contesta de dos formas. Abierta, con una casilla por
   persona. Cerrada —que es lo normal, porque una comida es de toda la casa—,
   con un campo oculto por persona y ni una casilla: la respuesta está dada y no
   hay nada que marcar. Leyendo solo lo marcado, esa segunda forma devolvía una
   lista vacía, y `makeRecipePlan` respondía «Selecciona al menos una persona que
   comerá en casa» a quien no había desmarcado a nadie.

   Un campo oculto no es una casilla sin marcar: es una respuesta escrita. */
const selected = (form, name) => [...form.querySelectorAll(`[name="${name}"]`)]
  .filter(input => input.type === 'hidden' || input.checked)
  .map(input => input.value);

function closeModal() {
  ui.modal = null;
  render();
}

/* ── Salir de una ventana sin tirar lo escrito ─────────────────────────────

   Una ventana tiene tres salidas que no son «Guardar»: la equis, un roce fuera
   de la hoja y la tecla Escape. Las tres llamaban directo a `closeModal()`, así
   que media preparación escrita se iba con un roce. En un teléfono, «fuera de la
   hoja» es la franja oscura de arriba, que está justo donde cae el pulgar al
   subir la mano.

   Saber si hay algo escrito no necesita llevar cuentas: el propio DOM guarda con
   qué valor nació cada campo. `defaultValue` y `defaultChecked` son lo que decía
   el HTML al pintarse, y `value` lo que dice ahora. Si difieren, alguien escribió.

   Se pregunta solo cuando hay algo que perder. Cerrar una ventana que no se ha
   tocado no pregunta nada, que es lo más común y no debe estorbar.

   `closeModal()` se queda sin guardia a propósito: lo llaman también los
   guardados que ya terminaron —`terminar()` en page-compra.js, por ejemplo—, y
   ahí preguntar sería absurdo. La guardia va en el gesto, no en el cierre. */
function ventanaConCambios() {
  const raiz = document.querySelector('#modal-root .modal');
  if (!raiz) return false;
  for (const campo of raiz.querySelectorAll('input, textarea, select')) {
    if (campo.type === 'hidden') continue;
    if (campo.type === 'checkbox' || campo.type === 'radio') {
      if (campo.checked !== campo.defaultChecked) return true;
    } else if (campo.tagName === 'SELECT') {
      const porDefecto = [...campo.options].find(opcion => opcion.defaultSelected) || campo.options[0];
      if (porDefecto && campo.value !== porDefecto.value) return true;
    } else if (campo.value !== campo.defaultValue) {
      return true;
    }
  }
  return false;
}

function cerrarVentanaPorGesto() {
  if (ventanaConCambios() && !window.confirm('Se va a cerrar sin guardar lo que escribiste. ¿Cerrar igual?')) return false;
  closeModal();
  return true;
}

function openModal(type, extras = {}) {
  // Antes de pintar: después, el botón que la abrió ya no existe.
  if (!ui.modal) quienAbrioLaVentana = senaDelFoco();
  ui.modal = { type, ...extras };
  render();
}
function sidebarOnMobile() { return window.matchMedia('(max-width: 700px)').matches; }
function closeSidebar() {
  if (sidebarOnMobile()) ui.drawerOpen = false;
  else {
    ui.sidebarCollapsed = true;
    try { localStorage.setItem(SIDEBAR_KEY, '1'); } catch { /* La preferencia es opcional. */ }
  }
  render();
  document.querySelector(sidebarOnMobile() ? '.mobile-brand .menu-toggle' : '.desktop-menu-toggle')?.focus();
}
function toggleSidebar() {
  if (sidebarOnMobile()) ui.drawerOpen = !ui.drawerOpen;
  else {
    ui.sidebarCollapsed = !ui.sidebarCollapsed;
    try { localStorage.setItem(SIDEBAR_KEY, ui.sidebarCollapsed ? '1' : '0'); } catch { /* La preferencia es opcional. */ }
  }
  render();
  document.querySelector(sidebarOnMobile() ? (ui.drawerOpen ? '.sidebar-close' : '.mobile-brand .menu-toggle') : (ui.sidebarCollapsed ? '.desktop-menu-toggle' : '.sidebar-close'))?.focus();
}

// Para el «+»: la comida de hoy que todavía no se ha decidido, o el desayuno.
function proximaComidaLibre() {
  const hora = new Date().getHours();
  const preferida = hora < 10 ? 'desayuno' : hora < 16 ? 'almuerzo' : 'cena';
  const orden = [preferida, ...SLOTS.filter(slot => slot !== preferida)];
  return orden.find(slot => !planFor(state, today(), slot)) || preferida;
}

/* ── Entrar en una sección ─────────────────────────────────────────────────

   Compra tiene dos vistas y siempre abría por la primera, «Preparar la compra»,
   que es el catálogo de habituales. Con una lista ya escrita eso es entrar por
   la puerta de atrás: se va al colmado a mirar lo apuntado, no a apuntar más.

   La decisión se toma al ENTRAR y no en cada pintada, que es la diferencia que
   importa: si se mirara el estado en cada repintado, apuntar el primer producto
   estando en «Preparar» cambiaría la vista debajo del dedo. */
function alEntrarEnUnaSeccion() {
  /* Los pliegues se reinician al entrar.

     Un bloque abierto es una decisión de hace un momento, no una preferencia de
     la casa: se abre para mirar algo y se termina de mirar. Si el estado se
     queda, volver a Preparaciones media hora después enseña la pantalla tal
     como la dejó el último vistazo —tres bloques abiertos y dos cerrados, sin
     que eso signifique nada— y hay que volver a ordenarla a mano.

     Se reinicia al ENTRAR y no al salir, ni en cada pintada: dentro de la
     sección el estado tiene que aguantar, porque añadir o quitar algo repinta y
     cerrar los bloques debajo del dedo sería peor que el problema. */
  if (ui.mas) { ui.mas.rubrosAbiertos = []; ui.mas.recetasAbiertas = []; }
  if (ui.semana) { ui.semana.verPasados = false; ui.semana.verSegundaSemana = false; }
  if (ui.compra) { ui.compra.verHistorial = false; ui.compra.abierto = ''; }

  if (ui.page !== 'compra') return;
  ui.compra.vista = listaEnCurso(state)?.lineas.length ? 'lista' : 'preparar';
}

/* ── Reparto de clics ──────────────────────────────────────────────────── */

// Las acciones de las pantallas son la mitad `async` —todo lo que toca la
// cuenta o la nube lo es—, y una función `async` que falla no cae dentro del
// `try` que la llamó: su promesa se rechaza después, cuando ese `try` ya
// terminó. Por ahí se escapaban. `protegida` engancha los dos casos.
const llamarAccion = (nombre, fn, el, contexto) =>
  protegida(`accion:${nombre}`, fn, fila => toast(mensajeDeFallo(fila), true))(el, contexto);

// Lo que se le dice a la persona cuando algo se rompe por dentro. Nunca se le
// enseña una pila ni un nombre de archivo: eso vive en el detalle técnico.
const mensajeDeFallo = fila =>
  `Algo se rompió al hacer eso y lo dejé como estaba. Puedes seguir usando la app.${fila?.clase ? ` (${fila.clase})` : ''}`;

document.addEventListener('click', event => {
  if (event.target.matches('[data-overlay]')) { cerrarVentanaPorGesto(); return; }
  const el = event.target.closest('[data-action]'); if (!el) return;
  const action = el.dataset.action;
  try {
    if (CUENTA_ACTIONS[action]) { llamarAccion(action, CUENTA_ACTIONS[action], el, ctxCuenta()); return; }

    // Las pantallas que viven en su propio archivo traen sus propias acciones.
    if (SETUP_ACTIONS[action]) {
      llamarAccion(action, SETUP_ACTIONS[action], el, ctx());
      return;
    }
    if (HOGAR_ACTIONS[action]) { llamarAccion(action, HOGAR_ACTIONS[action], el, ctxHogar()); return; }
    if (BULK_ACTIONS[action]) { llamarAccion(action, BULK_ACTIONS[action], el, { ...ctx(), bulk: ui.bulk }); return; }
    if (SEMANA_ACTIONS[action]) { llamarAccion(action, SEMANA_ACTIONS[action], el, ctx()); return; }
    if (COMPRA_ACTIONS[action]) { llamarAccion(action, COMPRA_ACTIONS[action], el, ctx()); return; }
    if (MAS_ACTIONS[action]) { llamarAccion(action, MAS_ACTIONS[action], el, ctx()); return; }

    // Un atajo puede pedir que la app se sitúe antes en la pantalla donde se
    // verá el resultado de lo que se está por escribir.
    if (el.dataset.goto) { ui.page = el.dataset.goto; alEntrarEnUnaSeccion(); }

    if (action === 'navigate') {
      ui.page = el.dataset.page;
      ui.modal = null; ui.drawerOpen = false;
      alEntrarEnUnaSeccion();
      commit('');
      // Cambiar de sección era mudo. Con el foco cayendo al cuerpo del
      // documento, el siguiente deslizamiento empieza arriba y acaba leyendo el
      // título —por accidente, no por diseño—, pero la persona que acaba de
      // tocar una pestaña no recibe nada en el momento de tocarla.
      anunciar(pageTitle());
    }
    // Sin repintar: ver `bloqueDeQuienCome`. Lo escrito en la ventana se queda.
    else if (action === 'solo-algunos') {
      const caja = el.closest('[data-quien-come]');
      if (!caja) return;
      const abrir = el.closest('[data-quien]')?.dataset.quien === 'todos';
      for (const lado of caja.querySelectorAll('[data-quien]')) {
        const vivo = (lado.dataset.quien === 'algunos') === abrir;
        lado.hidden = !vivo;
        lado.disabled = !vivo;
      }
      if (ui.modal) ui.modal.soloAlgunos = abrir;
      const dentro = caja.querySelector('[data-quien]:not([hidden])');
      (dentro?.querySelector('input:not([type="hidden"]):not([disabled])') || dentro?.querySelector('button'))?.focus();
    }
    else if (action === 'open-quick') openModal('quick');
    else if (action === 'comida-modo') {
      const form = el.closest('form');
      for (const pestana of form.parentElement.querySelectorAll('[data-action="comida-modo"]')) {
        const suya = pestana === el;
        pestana.classList.toggle('active', suya);
        pestana.setAttribute('aria-pressed', String(suya));
      }
      for (const caja of form.querySelectorAll('[data-panel]')) caja.hidden = caja.dataset.panel !== el.dataset.modo;
      // Cambiar de pestaña no repinta, pero otra cosa puede repintar después
      // —un error, un guardado— y la ventana se reconstruye desde el estado.
      if (ui.modal) ui.modal.modo = el.dataset.modo;
      form.querySelector(`[data-panel="${el.dataset.modo}"] input, [data-panel="${el.dataset.modo}"] select`)?.focus();
    }
    else if (action === 'rapida-comida') openModal('meal', { date: today(), slot: proximaComidaLibre() });
    else if (action === 'open-bulk') { ui.bulk = emptyBulk(el.dataset.destino || 'habitual'); openModal('bulk'); }
    // «Ver un ejemplo» ahora carga un ejemplo.
    //
    // Esta acción nunca construyó nada: encendía el recorrido y soltaba un aviso
    // afirmando que había un ejemplo delante. El ejemplo nacía en un solo sitio
    // —`loadStateDetailed`, cuando no hay absolutamente nada guardado—, así que
    // funcionaba en el primerísimo arranque de la app y en ningún otro caso. Los
    // tres caminos que llegan aquí con el estado ya vacío son reales: una cuenta
    // recién creada, volver de «Borrar todos mis datos», y salir del asistente
    // sin escribir nada. En los tres se prometía un ejemplo y salían cinco
    // pantallas en blanco, y el recorrido hablaba de «lo que se come cada día»
    // delante de un «Vamos a organizar tu casa».
    else if (action === 'welcome-demo') {
      if (!state.demo) state = createDemoState();
      ui.welcome = false; ui.page = TOUR_STEPS[0].page; ui.tour = 0;
      ui.semana = emptySemana(); ui.compra = emptyCompra(); ui.mas = emptyMas();
      commit('Este es un ejemplo. Puedes borrarlo cuando quieras.');
    }
    // Empezar de cero lleva directo a organizar la casa: es lo único que hay
    // que hacer para que la app sirva, y de ahí sale todo lo demás.
    else if (action === 'welcome-empty') { state = createEmptyState(); ui.welcome = false; ui.tour = null; ui.modal = null; ui.setup = emptySetup(); ui.page = 'setup'; commit(''); }
    // Los tres de la pantalla de entrada. Se guarda cuándo se aceptó y qué
    // versión de los documentos estaba delante ese día: una aceptación sin eso
    // no dice nada, porque los textos se corrigen.
    else if (action === 'legal-leer') { leyendoLegal = el.dataset.doc || ''; render(); }
    else if (action === 'legal-cerrar') { leyendoLegal = ''; render(); }
    else if (action === 'legal-aceptar') {
      acepto = { cuando: new Date().toISOString(), version: LEGAL.actualizado };
      try { localStorage.setItem(CLAVE_ACEPTO, JSON.stringify(acepto)); }
      catch { /* Sin almacenamiento se vuelve a preguntar al abrir. No es grave. */ }
      leyendoLegal = '';
      render();
    }
    else if (action === 'open-tour') { ui.modal = null; goTour(0); }
    else if (action === 'tour-prev') goTour(Math.max(0, ui.tour - 1));
    else if (action === 'tour-next') { if (ui.tour + 1 < TOUR_STEPS.length) goTour(ui.tour + 1); else { ui.tour = null; render(); toast('Listo. Puedes volver a verlo desde Ajustes.'); } }
    else if (action === 'tour-skip') { ui.tour = null; render(); }
    else if (action === 'toggle-sidebar') toggleSidebar();
    else if (action === 'close-sidebar') closeSidebar();
    else if (action === 'close-modal') cerrarVentanaPorGesto();
    else if (action === 'open-meal') openModal('meal', { date: el.dataset.date, slot: el.dataset.slot });
    else if (action === 'open-recipe') openModal('recipe', { id: el.dataset.id });
    else if (action === 'open-product') openModal('product', { id: el.dataset.id });
    else if (action === 'open-equivalence') openModal('equivalence', { id: el.dataset.id });
    else if (action === 'open-merge') openModal('merge', { id: el.dataset.id });
    else if (action === 'open-sobras') openModal('sobras', { id: el.dataset.id });
    else if (action === 'open-move') openModal('move', { id: el.dataset.id });
    else if (action === 'open-copy') openModal('copy', { id: el.dataset.id });
    // Salir del callejón: se escribe la primera preparación y se vuelve aquí.
    else if (action === 'open-absence') openModal('absence');
    else if (action === 'open-import') openModal('import');
    else if (action === 'select-review') { ui.reviewId = el.dataset.id; ui.page = 'revision'; render(); }
    // Quitar uno de los habituales ya no espera a ningún botón de guardar: la
    // pantalla dejó de ser un formulario. Lo que se compró antes no se toca;
    // solo deja de aparecer de aquí en adelante.
    else if (action === 'canasta-quitar') {
      const nombre = productName(el.dataset.id);
      removeHabitualLine(state, el.dataset.id);
      commit(`«${nombre}» sale de tus productos habituales. Las compras que ya se hicieron no cambian.`);
    }
    else if (action === 'mark-status') { setStatusPlan(state, el.dataset.date, el.dataset.slot, el.dataset.kind); ui.modal = null; commit('Comida marcada.'); }
    // «Ese día salimos» es una frase sobre el día, no sobre tres comidas. Lo que
    // ya tuviera plan se respeta salvo que la persona diga que lo reemplace: un
    // paseo por la tarde no borra el desayuno que ya estaba decidido.
    else if (action === 'mark-day') {
      const fecha = el.dataset.date;
      const ocupadas = SLOTS.filter(slot => planFor(state, fecha, slot) && planFor(state, fecha, slot).kind !== 'unplanned');
      const reemplazar = ocupadas.length
        ? window.confirm(`Ese día ya tiene ${conteo(ocupadas.length, 'comida decidida', 'comidas decididas')} (${ocupadas.map(cap).join(', ')}).\n\nAceptar: se cambian también.\nCancelar: se quedan y solo marco las que faltan.`)
        : false;
      let puestas = 0;
      for (const slot of SLOTS) {
        const antes = planFor(state, fecha, slot);
        if (antes && antes.kind !== 'unplanned' && !reemplazar) continue;
        if (antes) deletePlanSeguro(antes.id, true);
        setStatusPlan(state, fecha, slot, el.dataset.kind);
        puestas++;
      }
      ui.modal = null;
      commit(puestas ? `${conteo(puestas, 'comida', 'comidas')} de ese día ${puestas === 1 ? 'quedó' : 'quedaron'} fuera de casa.` : 'Ese día ya estaba decidido entero.');
    }
    else if (action === 'replace-status') {
      const hijos = dependents(state, el.dataset.id);
      if (hijos.length && !window.confirm(`De esta comida se aparta una parte para ${conteo(hijos.length, 'otra comida', 'otras comidas')}. Cambiarla también las quitará. ¿Continuar?`)) return;
      const antigua = state.plans.find(item => item.id === el.dataset.id);
      deletePlanSeguro(antigua.id, true);
      setStatusPlan(state, antigua.date, antigua.slot, el.dataset.kind);
      ui.modal = null; commit('Comida cambiada.');
    }
    else if (action === 'delete-plan') {
      const hijos = dependents(state, el.dataset.id);
      if (hijos.length && !window.confirm(`De esta comida se aparta una parte para ${conteo(hijos.length, 'otra comida', 'otras comidas')}. Si la quitas, esas también se van. ¿Continuar?`)) return;
      deletePlanSeguro(el.dataset.id, true);
      ui.modal = null; commit('Comida quitada.');
    }
    else if (action === 'delete-recipe') {
      if (!window.confirm('¿Quitar esta preparación? Las comidas que ya estén puestas se quedan con sus cantidades.')) return;
      state.recipes = state.recipes.filter(item => item.id !== el.dataset.id);
      commit('Preparación quitada.');
    }
    else if (action === 'add-item') { const lista = el.closest('form').querySelector(`[data-item-list="${el.dataset.type}"]`); lista?.insertAdjacentHTML('beforeend', itemRow()); }
    else if (action === 'remove-item') el.closest('[data-item-row]')?.remove();
    else if (action === 'clear-demo') {
      if (!window.confirm('¿Borrar todos los datos de esta app en este aparato? No se puede deshacer sin una copia guardada.')) return;
      // Borrar de verdad: además del estado, la copia que la app guarda sola al
      // cambiar de versión del esquema —que puede tener todo lo anterior
      // dentro— y los restos de instalaciones viejas. Reemplazar el estado y
      // guardar encima las dejaba todas.
      clearAll();
      state = createEmptyState(); loadError = ''; ui.modal = null; ui.reviewId = null;
      ui.semana = emptySemana(); ui.compra = emptyCompra(); ui.mas = emptyMas();
      ui.page = 'hoy';
      commit('Datos borrados. Ya puedes empezar con los tuyos.');
    }
    // Lo guardado tal cual, sin pasar por `exportState`.
    //
    // Es la única salida de la pantalla de datos ilegibles que no toca nada.
    // `exportState` escribiría el estado que hay en memoria, que en ese momento
    // es uno vacío creado para poder pintar algo: descargarlo sería entregar un
    // archivo en blanco con nombre de respaldo. Lo que hace falta son los bytes
    // del cajón, los mismos que esta versión no sabe leer y la siguiente sí.
    else if (action === 'descargar-crudo') {
      let crudo = '';
      try { crudo = localStorage.getItem(cajon) || ''; } catch { /* Se dirá abajo. */ }
      if (!crudo) { toast('No pude leer lo guardado en este teléfono.', true); return; }
      const blob = new Blob([crudo], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `que-comemos-guardado-${today()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast('Descargado tal cual estaba. Guárdalo fuera de este teléfono.');
    }
    // «Esto ya es mío». Apaga la marca de ejemplo sin borrar nada.
    //
    // Antes la franja del ejemplo tenía un solo botón, «Borrar el ejemplo», y
    // era la misma acción que «Borrar todos mis datos»: vaciaba la aplicación
    // entera, incluido lo que la persona hubiera escrito encima. Quien llevaba
    // meses viendo esa franja la leía como «quitar la etiqueta molesta».
    //
    // Y mientras `demo` siguiera encendido pasaba algo peor y callado:
    // `mereceLaPenaVincular` devuelve false con un estado de ejemplo, así que al
    // registrarse no se ofrecía subir la casa —que ya era real— y encima se
    // aterrizaba en «Mi hogar» a escribir otra vez quién vive aquí.
    else if (action === 'demo-adoptar') {
      state.demo = false;
      commit('Listo. Esto ya es tu casa, no un ejemplo.');
    }
    else if (action === 'export') {
      const blob = new Blob([exportState(state)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `que-comemos-respaldo-${today()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      // Se anota la fecha porque el respaldo automático de Android está
      // apagado a propósito: esta copia es la única red que hay, y la app tiene
      // que poder decir cuándo fue la última en vez de esperar a que se note.
      state.settings = { ...(state.settings || {}), lastBackupAt: today() };
      commit('Copia descargada. Guárdala donde no dependa de este teléfono.');
    }
    else if (action === 'remove-absence') { setAbsence(state, el.dataset.date, el.dataset.slot, el.dataset.id, false); commit('Ausencia quitada.'); }
    // La salida de una pantalla que se rompió al dibujarse.
    else if (action === 'volver-a-hoy') { ui.page = 'hoy'; ui.modal = null; ui.drawerOpen = false; render(); }
  } catch (error) {
    // El mensaje sigue saliendo como siempre —es lo que la persona necesita—,
    // pero ahora además queda apuntado: sin esto, un fallo que se enseña cuatro
    // segundos y desaparece es un fallo que nadie puede arreglar después.
    anotar(`accion:${action}`, error);
    toast(error.message || mensajeDeFallo(null), true);
  }
});

// `deletePlan` vive en model.js; esto solo centraliza el borrado en cascada para
// no repetir la comprobación de comidas dependientes en cada sitio.
function deletePlanSeguro(id, cascade = false) {
  const hijos = cascade ? dependents(state, id) : [];
  for (const hijo of hijos) state.plans = state.plans.filter(plan => plan.id !== hijo.id);
  state.plans = state.plans.filter(plan => plan.id !== id);
}


// Recalcula el aviso sin redibujar la ventana entera: quien está tocando
// casillas perdería el sitio, y las que llevara marcadas volverían a su valor
// de fábrica.
function pintarChoques(form) {
  const caja = form?.querySelector('[data-choque]') || form?.parentElement?.querySelector('[data-choque]');
  if (!caja) return;
  const receta = state.recipes.find(item => item.id === form.querySelector('[name="recipeId"]')?.value);
  const plan = state.plans.find(item => item.id === form.dataset.id);
  const items = receta?.items || plan?.items || [];
  const marcados = [...form.querySelectorAll('[name="participants"]')].filter(input => input.checked || input.type === 'hidden').map(input => input.value);
  caja.innerHTML = avisoDeAlergias(state, items, marcados, { conSalidas: true });
}

/* ── Cambios y escritura ───────────────────────────────────────────────── */

document.addEventListener('change', event => {
  const el = event.target;
  if (el.id === 'assign-recipe') pintarChoques(el.closest('form'));
  // Marcar o desmarcar a alguien cambia el aviso: puede que el choque fuera con
  // esa persona, o puede que aparezca uno nuevo.
  if (el.name === 'participants') pintarChoques(el.closest('form'));
  if (['date', 'slot'].includes(el.name) && el.closest('[data-form="absence"]')) {
    const form = el.closest('form'), date = form.querySelector('[name="date"]').value, slot = form.querySelector('[name="slot"]').value;
    form.querySelectorAll('[name="absent"]').forEach(input => input.checked = isAbsent(state, date, slot, input.value));
  }
  // El grosor solo aparece en lo que se corta; se oculta sin volver a dibujar
  // el formulario para no perder lo ya escrito.

  // Elegir «una preparación» o «fuera de casa» enseña u oculta el selector.
  if (el.name === 'kind' && el.closest('[data-form="poner-en-dias"]')) { const campo = el.form.querySelector('[data-poner-receta]'); if (campo) campo.hidden = el.value !== 'recipe'; }

  // Adónde van las filas de «escribir de corrido» decide el ejemplo que se
  // enseña: con cantidades para una compra, sin ellas para una lista de
  // nombres. Se repinta —guardando antes lo escrito, que es lo que hace
  // `bulk-destino`— porque el marcador de posición no se puede cambiar solo.
  if (el.name === 'destino' && el.closest('[data-form="bulk-texto"]') && BULK_ACTIONS['bulk-destino']) {
    llamarAccion('bulk-destino', BULK_ACTIONS['bulk-destino'], el, { ...ctx(), bulk: ui.bulk });
  }
});

let filtroTimer;
// Un respiro más largo que el de los buscadores: aquí no se filtra nada
// mientras se teclea, se añaden filas debajo, y hacerlo a media palabra —«mangú
// de plá…»— sería ir poniendo y quitando cosas delante de quien escribe.
const ESPERA_ANTES_DE_LEER_EL_NOMBRE_MS = 700;
let relojDeAlimentos;
document.addEventListener('input', event => {
  // Los dos buscadores se comportan igual: filtran mientras se teclea, con un
  // respiro para no repintar por letra, y devuelven el foco y el cursor donde
  // estaban. Antes el del catálogo inicial era un `change`, así que no pasaba
  // nada hasta pulsar Intro o salir del campo.
  /* Lo que ya dice el nombre de la preparación, puesto abajo sin pedirlo.

     «Mangú de plátano maduro con salami» nombra dos alimentos que esta casa ya
     tiene registrados; volver a elegirlos uno por uno en un desplegable es
     escribir dos veces lo mismo, y es la razón por la que las preparaciones se
     guardan sin alimentos —y una preparación sin alimentos no avisa de ninguna
     alergia—.

     No repinta: mover el cursor a media palabra sería peor que el ahorro. Y
     solo añade, nunca quita, aunque el nombre cambie: quitar una fila que
     alguien puso a mano es el error caro. */
  if (event.target.matches('[data-preparacion-nombre]')) {
    const formulario = event.target.closest('form');
    clearTimeout(relojDeAlimentos);
    relojDeAlimentos = setTimeout(() => {
      const puestos = llenarAlimentosDelNombre(state, formulario);
      if (puestos) anunciar(`${conteo(puestos, 'alimento añadido', 'alimentos añadidos')} por el nombre.`);
    }, ESPERA_ANTES_DE_LEER_EL_NOMBRE_MS);
  }

  const buscadores = {
    // `alimento-filtro` apuntaba a una clave que `emptyMas()` no creaba y a un
    // `id` que ninguna pantalla pintaba: era el resto de «Alimentos de la casa»,
    // retirada hace tiempo. En su sitio va el buscador de Mis productos
    // habituales, que es la lista que de verdad hay que poder recorrer.
    'habitual-filtro': valor => { ui.mas.habitualFiltro = valor; },
    'receta-filtro': valor => { ui.mas.recetaFiltro = valor; },
    'compra-buscar': valor => { ui.compra.busqueda = valor; },
    'setup-buscar': valor => { ui.setup.busqueda = valor; }
  };
  const escribir = buscadores[event.target.id];
  if (escribir) {
    const campoId = event.target.id;
    escribir(event.target.value);
    clearTimeout(filtroTimer);
    filtroTimer = setTimeout(() => {
      const pos = event.target.selectionStart;
      render();
      const campo = document.getElementById(campoId);
      if (campo) { campo.focus(); campo.setSelectionRange(pos, pos); }
    }, 160);
    return;
  }
  // Un mismo alimento registrado dos veces parte su inventario en dos, y eso se
  // descubre semanas después, cuando las cuentas no cuadran. Avisar mientras se
  // escribe es mucho más barato que unirlos luego.
  if (event.target.matches('[data-dedup]')) {
    const caja = event.target.form?.querySelector('[data-dedup-warning]');
    if (!caja) return;
    const parecidos = findSimilarProducts(state, event.target.value, { limit: 2, exclude: event.target.form.dataset.id || null });
    caja.innerHTML = parecidos.length
      ? `<div class="notice warn"><span>?</span><div><strong>Ya tienes algo parecido: «${esc(parecidos[0].product.name)}».</strong>Si es el mismo, cierra esto y edítalo desde la lista en vez de crear otro.</div></div>`
      : '';
    return;
  }
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (ui.modal) cerrarVentanaPorGesto();
  else if (ui.drawerOpen) closeSidebar();
  else if (ui.tour !== null) { ui.tour = null; render(); }
});

/* ── El botón de atrás del teléfono ────────────────────────────────────────

   Dentro del APK, atrás cerraba la aplicación desde cualquier sitio: con una
   ventana abierta, con el menú desplegado, en mitad de la compra. Es el gesto
   más usado de Android y aquí significaba «salir», que no es lo que nadie
   espera y encima tira lo que estuviera escrito.

   Ahora deshace por capas, de lo más encima a lo más al fondo. Solo sale de la
   app cuando ya no queda nada que cerrar y se está en Hoy, que es la portada.

   El complemento se pide por el global de Capacitor y no con un `import`: este
   proyecto no tiene empaquetador, y un especificador de paquete no se resuelve
   en el navegador. Es el mismo camino que ya usa `fallos.js`. En el navegador
   `Capacitor` no existe, `?.` corta y no pasa nada —el botón de atrás del
   navegador es otra historia, con su propio historial, y no entra aquí—. */
globalThis.Capacitor?.Plugins?.App?.addListener?.('backButton', protegida('atras', () => {
  if (ui.modal) { cerrarVentanaPorGesto(); return; }
  if (ui.drawerOpen) { closeSidebar(); return; }  // repinta por dentro
  if (ui.tour !== null) { ui.tour = null; render(); return; }
  // Las subpantallas de Ajustes vuelven a Ajustes, no a Hoy: se entró desde ahí.
  if (esPaginaDeAjustes(ui.page) && ui.page !== 'ajustes') { ui.page = 'ajustes'; render(); return; }
  if (ui.page !== 'hoy') { ui.page = 'hoy'; render(); return; }
  globalThis.Capacitor?.Plugins?.App?.exitApp?.();
}));
window.addEventListener('resize', () => { if (ui.drawerOpen && !sidebarOnMobile()) { ui.drawerOpen = false; render(); } });

/* ── Formularios ───────────────────────────────────────────────────────── */

document.addEventListener('submit', async event => {
  const form = event.target.closest('[data-form]'); if (!form) return;
  event.preventDefault();
  const data = formValues(form, event.submitter), kind = form.dataset.form;
  try {
    if (CUENTA_FORMS[kind]) { await CUENTA_FORMS[kind](form, data, ctxCuenta()); return; }
    if (SETUP_FORMS[kind]) { SETUP_FORMS[kind](form, data, ctx()); return; }
    if (HOGAR_FORMS[kind]) { HOGAR_FORMS[kind](form, data, ctxHogar()); return; }
    if (BULK_FORMS[kind]) { await BULK_FORMS[kind](form, data, { ...ctx(), bulk: ui.bulk }); return; }
    if (SEMANA_FORMS[kind]) { SEMANA_FORMS[kind](form, data, ctx()); return; }
    if (COMPRA_FORMS[kind]) { COMPRA_FORMS[kind](form, data, ctx()); return; }

    if (kind === 'recipe') {
      const anterior = state.recipes.find(item => item.id === form.dataset.id);
      const receta = upsertRecipe(state, {
        id: form.dataset.id, ...leerPreparacion(form, data),
        // Esta ventana ya no pregunta cuánto rinde, y lo que no pregunta no lo
        // borra: quien lo escribió cuando se preguntaba lo conserva.
        servings: anterior?.servings ?? null
      });
      // «Guardar y añadir otra» deja la ventana abierta y en blanco. Quien está
      // escribiendo de una sentada las seis comidas de su casa no quiere
      // abrirla, cerrarla y volverla a abrir seis veces.
      const seguir = data.get('seguir') === '1';
      ui.modal = seguir ? { type: 'recipe', id: '' } : null;
      // Se guarda igual sin alimentos: la preparación ya sirve para llenar el
      // calendario. Lo único que no puede hacer es avisar de las alergias, y eso
      // se dice en voz baja en vez de bloquear el guardado.
      const cola = seguir ? ' Escribe la siguiente.' : '';
      const base = receta.items.length
        ? `«${receta.name}» guardada.`
        : `«${receta.name}» guardada. Sin alimentos anotados no puede avisarte de las alergias de la casa.`;
      commit(base + cola);
    }
    else if (kind === 'product') {
      // Un producto nuevo nace ya en los habituales: es el único sitio desde
      // donde se añade, y guardarlo «en el catálogo pero en ninguna lista»
      // dejaba un alimento que no aparecía en ninguna parte.
      const existente = product(state, form.dataset.id);
      const rubro = String(data.get('rubro') || 'otros');
      const nombre = String(data.get('name') || '').trim();
      const nota = String(data.get('nota') || '').trim();
      if (existente) {
        updateProduct(state, existente.id, { name: nombre });
        actualizarHabitual(state, existente.id, { rubro, nota });
      } else {
        agregarHabitual(state, { name: nombre, rubro, nota, category: categoriaDelRubro(rubro), unit: RUBROS.find(item => item.id === rubro)?.unidad, origin: 'manual' });
      }
      ui.modal = null;
      commit(existente ? 'Guardado.' : `«${nombre}» entra en tus productos habituales.`);
    }
    /* La hora del recordatorio de la cena.

       El campo es un `<input type="time">`, así que lo que llega es «18:30» y no
       dos números. Una hora que no se entienda no se guarda a medias: se deja la
       que había, porque un recordatorio a las 00:00 por un campo mal leído es
       peor que no cambiar nada. */
    else if (kind === 'avisos-hora') {
      const [hora, minuto] = String(data.get('hora') || '').split(':').map(Number);
      if (!Number.isInteger(hora) || !Number.isInteger(minuto)) throw new Error('Esa hora no se entiende.');
      guardarAvisos(state, { hora, minuto });
      commit(`Listo. Te aviso a las ${horaEnPalabras(avisosDe(state))}.`);
      programarRecordatorio(state).catch(error => anotar('avisos:hora', error));
    }
    // La frecuencia de compra no se guarda como un valor suelto: se añade un
    // tramo con su fecha de vigencia, y lo anterior a esa fecha no se toca.
    else if (kind === 'frecuencia') {
      const tipo = data.get('tipo');
      const desde = data.get('desde');
      ponerFrecuencia(state, tipo, desde);
      Object.assign(ui.mas, { cambiandoFrecuencia: false, frecuenciaNueva: '', frecuenciaDesde: '' });
      commit(`Desde ${monthName(desde)} la compra es ${tipo === 'quincenal' ? 'quincenal' : 'mensual'}. Los meses anteriores se quedan como estaban.`);
    }
    else if (kind === 'merge') {
      const otro = data.get('otro');
      const conservar = data.get('conservar') === 'otro' ? otro : form.dataset.id;
      const eliminar = conservar === otro ? form.dataset.id : otro;
      const nombres = [productName(conservar), productName(eliminar)];
      if (!window.confirm(`Se unirá «${nombres[1]}» dentro de «${nombres[0]}». Su historial pasa al primero y «${nombres[1]}» deja de existir. Esto no se puede deshacer. ¿Continuar?`)) return;
      mergeProducts(state, conservar, eliminar);
      ui.modal = null;
      commit(`«${nombres[1]}» se unió a «${nombres[0]}».`);
    }
    else if (kind === 'equivalence') { setEquivalence(state, form.dataset.id, data.get('unit'), data.get('factor')); ui.modal = null; commit('Guardado.'); }
    else if (kind === 'assign') {
      const date = data.get('date'), slot = data.get('slot');
      const gente = selected(form, 'participants');
      // Cuál de las tres pestañas está abierta. Se lee del DOM y no de un
      // campo escondido porque cambiar de pestaña no redibuja: lo que está a
      // la vista es la única verdad.
      const modo = form.querySelector('[data-panel]:not([hidden])')?.dataset.panel || 'preparacion';
      if (modo === 'escrita') {
        /* El error, junto al campo que falló y no en un aviso que se va solo.

           Este campo no lleva `required` —y no puede llevarlo: los otros dos
           paneles solo están `hidden`, no deshabilitados, y un campo obligatorio
           escondido bloquea el envío entero sin que el navegador pueda enseñar
           dónde está—. Así que lo comprueba la app, y lo dice donde se escribe.

           Antes esto llegaba hasta el modelo, volvía como excepción y acababa en
           el aviso flotante de abajo: 4,2 segundos, a la altura de la barra fija
           del teléfono y detrás del teclado abierto. Y encima este es el camino
           de quien todavía no tiene ninguna preparación escrita, o sea la
           persona más nueva de la app. */
        const titulo = String(data.get('titulo') || '').trim();
        if (!titulo) {
          ui.modal = { ...ui.modal, modo: 'escrita', errorTitulo: 'Escribe qué se come. Con el nombre basta: «lo que quedó del sancocho» vale.' };
          render();
          document.querySelector('#modal-root [name="titulo"]')?.focus();
          return;
        }
        const puesta = anotarComidaSuelta(state, date, slot, { titulo, nota: data.get('nota'), participants: gente });
        ui.modal = null; commit(`«${puesta.title}» queda anotada solo para ese día.`);
      } else if (modo === 'sobro') {
        const puesta = reutilizarComida(state, data.get('sobroDe'), date, slot, gente);
        ui.modal = null; commit(`Se vuelve a comer «${puesta.title}». No se apunta ninguna cantidad.`);
      } else {
        makeRecipePlan(state, data.get('recipeId'), date, slot, gente);
        ui.modal = null; commit('Comida puesta.');
      }
    }
    /* ── Cambiar el plato de un solo día ────────────────────────────────────

       Se borra la comida y se pone la otra en su sitio, y la nueva nace como
       cambio manual y sin `routineId`: viene de la mano de alguien, no de la
       costumbre. Eso es exactamente lo que hay que dejar escrito, porque es lo
       que impide que la regla se la lleve por delante la próxima vez que se
       aplique, y lo que hace que el calendario pueda seguir diciendo la verdad
       sobre de dónde salió cada cosa. */
    else if (kind === 'sustituir') {
      const plan = state.plans.find(item => item.id === form.dataset.id);
      const receta = state.recipes.find(item => item.id === data.get('recipeId'));
      if (!plan || !receta) throw new Error('Elige por cuál preparación la cambias.');
      // Una comida de la que cuelga una parte apartada para otro día no se
      // sustituye a la ligera: la reserva se quedaría sin de dónde salir.
      if (dependents(state, plan.id).length) throw new Error('De esta comida se aparta una parte para otro día. Quita esa reserva antes de cambiarla.');
      const { date, slot, participants } = plan;
      const antes = plan.title;
      deletePlanSeguro(plan.id);
      makeRecipePlan(state, receta.id, date, slot, participants, null, 'manual');
      ui.modal = null;
      commit(`Ese día se cambia «${antes}» por «${receta.name}». Solo ese día: la costumbre sigue igual.`);
    }
    else if (kind === 'plan') {
      const plan = state.plans.find(item => item.id === form.dataset.id);
      // Lo que ya estaba se queda como estaba. La ventana dejó de preguntar la
      // cantidad, así que leerla del formulario devolvería vacío para todos y
      // guardar una comida vieja le borraría lo que traía escrito.
      const antes = new Map(plan.items.map(item => [item.id, item]));
      const cambios = {
        title: data.get('title'),
        note: data.get('note'),
        participants: selected(form, 'participants'),
        items: collectItems(form).map(item => ({
          ...(antes.get(item.id) || {}), id: item.id || nextId(state, 'alimento'), productId: item.productId
        }))
      };
      updatePlan(state, plan.id, cambios);
      ui.modal = null; commit('Guardado.');
    }
    else if (kind === 'sobras') {
      const puesta = reutilizarComida(state, form.dataset.id, data.get('date'), data.get('slot'), selected(form, 'participants'));
      ui.modal = null;
      commit(`«${puesta.title}» se vuelve a comer el ${niceDate(puesta.date, { weekday: 'long', day: 'numeric', month: 'long' })}.`);
    }
    else if (kind === 'move-copy') {
      if (form.dataset.operation === 'move') movePlan(state, form.dataset.id, data.get('date'), data.get('slot'));
      else copyPlan(state, form.dataset.id, data.get('date'), data.get('slot'));
      ui.modal = null; commit(form.dataset.operation === 'move' ? 'Movida.' : 'Copiada.');
    }
    else if (kind === 'absence') {
      const fecha = data.get('date'), slot = data.get('slot');
      for (const persona of state.people) setAbsence(state, fecha, slot, persona.id, selected(form, 'absent').includes(persona.id));
      ui.modal = null; commit('Guardado.');
    }
    else if (kind === 'import') {
      const archivo = data.get('file');
      if (!archivo?.size) throw new Error('Elige un archivo.');
      const traido = importState(await archivo.text());
      if (!window.confirm('¿Reemplazar todo lo que hay ahora con esta copia?')) return;
      state = traido; loadError = ''; ui.modal = null; ui.reviewId = null;
      ui.semana = emptySemana(); ui.compra = emptyCompra(); ui.mas = emptyMas();
      commit('Copia traída.');
    }
  } catch (error) {
    anotar(`formulario:${form?.dataset?.form || 'desconocido'}`, error);
    toast(error.message || mensajeDeFallo(null), true);
  }
});

/* ── Arranque ──────────────────────────────────────────────────────────── */

// La red, antes que nada: un fallo durante el propio arranque también tiene que
// quedar apuntado, y para eso hay que llegar primero.
instalarRed({
  alFallar: fila => {
    // Un fallo global no interrumpe lo que la persona esté haciendo: se dice y
    // se sigue. Interrumpir sería convertir un tropiezo en un muro.
    try { toast(mensajeDeFallo(fila), true); } catch { /* Sin `#toast` todavía no hay dónde decirlo. */ }
  }
});

falloAnterior()
  .then(fallo => {
    if (!fallo) return;
    // Se apunta en el cuaderno para que salga en el detalle técnico, y se olvida
    // en el teléfono: enseñar el mismo fallo en cada arranque para siempre es
    // ruido, no información.
    anotar('nativo', new Error(`${fallo.clase}: ${fallo.mensaje}`), {
      hilo: fallo.hilo, principal: fallo.principal, pila: fallo.pila
    });
    return olvidarFalloAnterior();
  })
  .catch(error => anotar('arranque:fallo-nativo', error));

/* ── La pantalla de arranque ───────────────────────────────────────────────

   Dos capas, y hacen cosas distintas.

   La de abajo la pinta Android antes de que exista el WebView: es el tema
   `Theme.SplashScreen` de android/app/src/main/res/values/styles.xml, sobre la
   crema de la marca. Sin ella, entre tocar el icono y la primera pintada hay un
   blanco que no es de nadie.

   La de arriba es `#arranque`, en index.html, y es la que se mueve. Se va en
   cuanto hay algo debajo que enseñar — pero no antes de un tiempo mínimo, y eso
   tiene un motivo: la app abre en unos 200 ms, así que sin el mínimo la
   animación arrancaría y se cortaría a la mitad, que se lee como un tirón y no
   como una entrada. Un segundo largo es lo que tarda en completarse el gesto.

   Lo que NO se hace es esperar por esperar. El mínimo cuenta desde que este
   módulo empieza, así que en un teléfono lento donde pintar cueste más de lo
   normal la capa no añade ni un milisegundo: se va en cuanto pueda. */
const ARRANQUE_MINIMO_MS = 1100;
const ABRIO_EN = Date.now();

function quitarElArranque() {
  const capa = document.querySelector('#arranque');
  if (!capa) return;
  const falta = Math.max(0, ARRANQUE_MINIMO_MS - (Date.now() - ABRIO_EN));
  setTimeout(() => {
    capa.classList.add('se-va');
    // Se quita del documento del todo cuando termina de desvanecerse: dejarla
    // transparente encima de la app la seguiría haciendo dueña de los toques.
    setTimeout(() => capa.remove(), 450);
  }, falta);
}

render();
quitarElArranque();

/* El recordatorio se vuelve a programar al abrir, y al dejar la app.

   Al abrir, porque puede haber pasado una semana y los avisos programados se
   habrán agotado. Al dejarla, porque acabas de decidir cenas y los avisos de
   esos días ya no tienen sentido: se caen ahí mismo, mientras la app todavía
   está viva para hacerlo.

   Es lo que permite que el aviso AFIRME —«todavía no has decidido la cena»— en
   vez de preguntar: decidir una cena exige abrir la app, y abrir o cerrar la app
   rehace la lista. Un aviso pendiente es siempre de un día que estaba sin
   decidir la última vez que alguien miró.

   Nada de esto pide permisos ni pregunta nada: con el interruptor apagado,
   `programarRecordatorio` borra lo que hubiera y se va. */
programarRecordatorio(state).catch(error => anotar('avisos:arrancar', error));
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    programarRecordatorio(state).catch(error => anotar('avisos:al-salir', error));
  });
}

/* ── La sesión, al arrancar ────────────────────────────────────────────────

   Va después del primer `render()` a propósito. Recuperar la sesión puede querer
   hablar con el servidor —para renovar el token— y eso tarda; hacerlo antes de
   pintar dejaría a alguien mirando una pantalla en blanco mientras su teléfono
   busca cobertura. Así la app aparece entera y la sesión se acomoda encima.

   Y si no hay internet, no pasa nada: `arrancarSesion` devuelve
   'dentro-sin-red', que significa «esta persona sigue siendo quien es y sus
   datos están aquí». La aplicación funciona igual. */

arrancarSesion()
  .then(async arranque => {
    if (arranque.estado === 'dentro' || arranque.estado === 'dentro-sin-red') {
      ponerSesion(arranque.sesion);
      abrirCajon(cajonDe(arranque.sesion.usuario.id));
      if (arranque.aviso) avisoDeSesion = arranque.aviso;
      render();
      if (arranque.estado === 'dentro') {
        await sincronizarAhora({ hayCambiosLocales: false }).catch(error => anotar('sincronizar-al-arrancar', error));
      }
    } else {
      // Sin sesión. Si la anterior caducó —no se cerró— la casa de esa cuenta
      // sigue en este teléfono y es donde estaba la persona: se vuelve a abrir
      // ahí en vez de enseñarle un formulario de registro encima de un cajón
      // vacío. Ver `alCaducarLaSesion`.
      const guardado = cajonCaducado();
      if (guardado && hasSavedState(undefined, guardado)) {
        sesionCaducada = true;
        abrirCajon(guardado);
        avisoDeSesion = arranque.aviso || 'Tu sesión caducó y la sincronización está apagada. Tus datos siguen enteros en este teléfono: vuelve a entrar cuando tengas internet.';
      } else if (arranque.aviso) {
        avisoDeSesion = arranque.aviso;
      }
      if (sesionCaducada || arranque.aviso) render();
    }
    await mirarSiVolvimosDeGoogle();
  })
  .catch(error => anotar('arranque:sesion', error));

// Al volver la conexión se reintenta lo que quedara sin subir. Es la otra mitad
// de «funciona sin internet»: no basta con no romperse, hay que ponerse al día
// solo cuando se pueda, sin que nadie tenga que acordarse de nada.
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('online', () => {
    if (!sesion?.sincronizando) return;
    sincronizarAhora().catch(error => anotar('sincronizar-al-volver-la-red', error));
  });

  // Y al volver a la app: es cuando llega el enlace de vuelta de Google, y
  // también el momento en que conviene mirar si otro teléfono cambió algo.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    mirarSiVolvimosDeGoogle().catch(error => anotar('vuelta-de-google', error));
    if (sesion?.sincronizando) sincronizarAhora({ hayCambiosLocales: hayCambiosSinSubir }).catch(error => anotar('sincronizar-al-volver', error));
  });
}

// El trabajador de servicio permite instalar la app y abrirla sin conexión. El
// navegador solo lo acepta en contexto seguro (https o localhost); sobre http en
// una IP de la red local lo ignora y la app sigue funcionando como página.
//
// Dentro del APK no se registra: ahí los archivos ya viajan en la aplicación, y
// un caché viejo podría seguir sirviendo la versión anterior tras actualizarla.
if ('serviceWorker' in navigator && !globalThis.Capacitor) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* Sin contexto seguro no hay instalación; no es un error de la app. */ }));
}
