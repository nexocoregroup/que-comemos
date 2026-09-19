// El recordatorio de la cena.
//
// Es el único aviso que esta app manda, y está apagado de fábrica. Se enciende
// desde Ajustes → Avisos, y solo entonces se pide el permiso del teléfono:
// pedirlo al abrir la app, antes de que nadie sepa para qué sirve, es lo que
// Android desaconseja por escrito y lo que hace que la gente diga que no.
//
// ── Lo que avisa, y por qué se puede afirmar ───────────────────────────────
//
// «Todavía no has decidido la cena de hoy» es una frase que afirma algo, y una
// notificación local se programa por adelantado: nadie ejecuta código a las
// seis de la tarde para comprobar si sigue siendo cierta. Aquí sí se puede
// afirmar, y por una razón concreta: decidir una cena exige abrir la app, y
// abrir la app vuelve a programar los avisos. Así que un aviso pendiente es
// siempre de un día que estaba sin decidir la última vez que alguien miró.
//
// Por eso se programan varios días de golpe —hasta siete— y se saltan los que
// ya están resueltos. Quien no abra la app en cuatro días recibe sus cuatro
// avisos, que es justo cuando hacen falta.
//
// ── Alarmas inexactas, a propósito ─────────────────────────────────────────
//
// `isExactNotification: false` en todos. Que el aviso llegue unos minutos
// después de la hora es exactamente igual de útil, y la alternativa cuesta un
// permiso de alarma que Google mira con lupa. El manifiesto además quita el que
// el complemento declara por su cuenta; está explicado allí.

import { SLOTS_PRINCIPALES, addDays, planFor, todayISO } from './model.js';

// Cuántos días por delante se dejan programados. Siete es una semana: quien
// vuelve antes los rehace, y quien no vuelve en siete días tiene un problema
// distinto que un recordatorio no resuelve.
const DIAS_POR_DELANTE = 7;

// El identificador de cada aviso se calcula a partir del día, no de un contador,
// para que volver a programar pise el anterior en vez de duplicarlo.
const ID_BASE = 4100;
const idDelDia = date => ID_BASE + Number(String(date).replaceAll('-', '').slice(4));

export const AVISOS_DE_FABRICA = { encendido: false, hora: 18, minuto: 0 };

export function avisosDe(state) {
  const guardado = state?.settings?.avisos;
  if (!guardado || typeof guardado !== 'object') return { ...AVISOS_DE_FABRICA };
  const hora = Number(guardado.hora);
  const minuto = Number(guardado.minuto);
  return {
    encendido: Boolean(guardado.encendido),
    hora: Number.isInteger(hora) && hora >= 0 && hora <= 23 ? hora : AVISOS_DE_FABRICA.hora,
    minuto: Number.isInteger(minuto) && minuto >= 0 && minuto <= 59 ? minuto : AVISOS_DE_FABRICA.minuto
  };
}

export function guardarAvisos(state, cambios) {
  if (!state.settings || typeof state.settings !== 'object') state.settings = {};
  state.settings.avisos = { ...avisosDe(state), ...cambios };
  return state.settings.avisos;
}

export const horaEnPalabras = ({ hora, minuto }) =>
  `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;

/* ── El complemento, si está ───────────────────────────────────────────────

   En el navegador no existe, y eso no es un fallo: es que el navegador no es un
   teléfono. Todo lo de aquí abajo se rinde en silencio cuando no lo encuentra, y
   la pantalla de Ajustes lo dice con palabras en vez de dejar un interruptor que
   no hace nada. */
const complemento = () => globalThis.Capacitor?.Plugins?.LocalNotifications || null;

export const hayAvisosEnEsteAparato = () => Boolean(complemento());

// ¿Nos deja el teléfono avisar? Devuelve 'si', 'no' o 'sin-aparato'.
export async function permisoDeAvisos() {
  const plugin = complemento();
  if (!plugin) return 'sin-aparato';
  try {
    const { display } = await plugin.checkPermissions();
    return display === 'granted' ? 'si' : 'no';
  } catch { return 'no'; }
}

// Pedirlo. Solo se llama desde el interruptor, nunca al arrancar.
export async function pedirPermisoDeAvisos() {
  const plugin = complemento();
  if (!plugin) return 'sin-aparato';
  try {
    const { display } = await plugin.requestPermissions();
    return display === 'granted' ? 'si' : 'no';
  } catch { return 'no'; }
}

/* ── Programar ─────────────────────────────────────────────────────────────

   Se borra lo pendiente y se vuelve a poner, siempre. Es más simple que llevar
   la cuenta de qué cambió, y es lo correcto: el estado de la casa manda, y
   cualquier otra cosa sería una segunda verdad que se puede desincronizar. */
export async function programarRecordatorio(state) {
  const plugin = complemento();
  if (!plugin) return { ok: false, motivo: 'sin-aparato', cuantos: 0 };

  try {
    const pendientes = await plugin.getPending();
    const mios = (pendientes?.notifications || []).filter(aviso => Number(aviso.id) >= ID_BASE);
    if (mios.length) await plugin.cancel({ notifications: mios.map(aviso => ({ id: aviso.id })) });
  } catch { /* Si no se pueden listar, se sigue: programar pisa por id. */ }

  const avisos = avisosDe(state);
  if (!avisos.encendido) return { ok: true, motivo: 'apagado', cuantos: 0 };
  if (await permisoDeAvisos() !== 'si') return { ok: false, motivo: 'sin-permiso', cuantos: 0 };

  const hoy = todayISO();
  const ahora = new Date();
  const notifications = [];
  for (let i = 0; i < DIAS_POR_DELANTE; i += 1) {
    const dia = addDays(hoy, i);
    if (yaEstaDecidida(state, dia)) continue;
    const cuando = new Date(`${dia}T12:00:00`);
    cuando.setHours(avisos.hora, avisos.minuto, 0, 0);
    // La hora de hoy que ya pasó no se programa: saldría en el acto, y un aviso
    // que llega en el mismo segundo en que enciendes el interruptor no es un
    // recordatorio, es un susto.
    if (cuando <= ahora) continue;
    notifications.push({
      id: idDelDia(dia),
      title: '¿Qué comemos?',
      body: i === 0
        ? 'Todavía no has decidido la cena de hoy.'
        : `Todavía no has decidido la cena del ${diaEnPalabras(dia)}.`,
      schedule: { at: cuando, allowWhileIdle: false },
      // Ver la cabecera: sin esto, el complemento intenta una alarma exacta.
      isExactNotification: false
    });
  }

  if (!notifications.length) return { ok: true, motivo: 'nada-que-avisar', cuantos: 0 };
  try {
    await plugin.schedule({ notifications });
    return { ok: true, motivo: '', cuantos: notifications.length };
  } catch (error) {
    return { ok: false, motivo: 'no-se-pudo', cuantos: 0, detalle: String(error?.message || '') };
  }
}

// Una cena decidida es cualquier cosa puesta que no sea «todavía sin decidir»
// —comer fuera y pedir también cuentan: son decisiones—.
function yaEstaDecidida(state, date) {
  const plan = planFor(state, date, 'cena');
  return Boolean(plan && plan.kind !== 'unplanned');
}

const diaEnPalabras = date =>
  new Intl.DateTimeFormat('es-DO', { weekday: 'long' }).format(new Date(`${date}T12:00:00`));

// Para que la pantalla pueda decir cuántas cenas quedan por decidir sin repetir
// la cuenta por su cuenta.
export function cenasSinDecidir(state) {
  const hoy = todayISO();
  let cuantas = 0;
  for (let i = 0; i < DIAS_POR_DELANTE; i += 1) {
    if (!yaEstaDecidida(state, addDays(hoy, i))) cuantas += 1;
  }
  return cuantas;
}

// `SLOTS_PRINCIPALES` se importa para que quede escrito de dónde sale «cena» y
// para que esta línea se ponga en rojo el día que los momentos del día cambien
// de nombre. No es decoración: es la única referencia entre este archivo y el
// modelo, y sin ella el aviso apuntaría a un momento que ya no existe.
if (!SLOTS_PRINCIPALES.includes('cena')) {
  throw new Error('El recordatorio apunta a la cena y ese momento ya no existe.');
}
