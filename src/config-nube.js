// Dónde vive la cuenta. Dos valores, y ninguno de los dos es un secreto.
//
// ── Por qué esto puede estar dentro del APK ────────────────────────────────
//
// Supabase da dos claves a cada proyecto y la diferencia entre ellas es toda la
// seguridad de este archivo:
//
//   · La clave **anónima** (`anon`, o «publishable») está hecha para viajar
//     dentro de aplicaciones. No abre nada por sí sola: lo único que hace es
//     identificar al proyecto. Quien la tenga puede llamar a la API, y lo que
//     consiga depende enteramente de las políticas de seguridad por fila que
//     hay escritas en la base de datos —«solo ves los hogares de los que eres
//     miembro»—, no de tener o no tener la clave. Es esta la que va aquí.
//
//   · La clave **de servicio** (`service_role`, o «secret») se salta todas esas
//     políticas. Quien la tenga puede leer y borrar los datos de cualquier casa.
//     Esa NO entra aquí, ni en este repositorio, ni en el APK, ni en ningún
//     sitio que salga de tu computadora. Su sitio es un servidor tuyo, si algún
//     día hace falta uno, y hoy no hace falta ninguno.
//
// Hay una prueba en `tests/seguridad.test.js` que se pone roja si una clave de
// servicio aparece en cualquier archivo del cliente. Es la única forma de que un
// pegado por descuido no llegue a publicarse.
//
// ── Qué escribir aquí ─────────────────────────────────────────────────────
//
// Los dos valores salen del panel de Supabase, en Project Settings → API. Los
// pasos completos, con capturas de qué botón tocar, están en `docs/supabase.md`.
//
// Mientras estén vacíos, la aplicación funciona exactamente como antes: todo en
// este teléfono, sin cuenta y sin red. No se rompe nada; simplemente no ofrece
// iniciar sesión, y lo dice.

export const NUBE = {
  // Ej. 'https://abcdefghijklm.supabase.co'
  url: '',
  // La clave anónima. Es larga y empieza por 'eyJ' o por 'sb_publishable_'.
  clave: ''
};

// El esquema del enlace con el que Google devuelve a la aplicación después de
// identificarte. Tiene que coincidir con tres sitios, o el viaje de vuelta se
// pierde y la pantalla se queda esperando para siempre:
//
//   1. El `intent-filter` de `android/app/src/main/AndroidManifest.xml`.
//   2. La lista de «Redirect URLs» del panel de Supabase.
//   3. Esta línea.
//
// Se deja escrito aquí para que los tres se puedan comparar de un vistazo.
export const VUELTA_DE_GOOGLE = 'quecomemos://cuenta';

/* ── Está configurado, o no lo está ────────────────────────────────────────

   No hay término medio y conviene que no lo haya: media configuración produce
   errores de red raros a las dos semanas, cuando ya nadie se acuerda de qué
   tocó. Aquí se comprueba de una vez y la aplicación se comporta en
   consecuencia, diciéndolo. */

export function hayNube() {
  return Boolean(urlLimpia() && String(NUBE.clave || '').trim());
}

// Sin la barra final, que es de donde salen las rutas con doble barra.
export function urlLimpia() {
  const url = String(NUBE.url || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  // Solo `https`. Un `http://` aquí mandaría la contraseña de alguien en claro
  // por el wifi de su casa, y además Android lo bloquea de todas formas
  // (`seguridad_de_red.xml`), así que fallaría de una manera mucho más confusa.
  if (!/^https:\/\//i.test(url)) return '';
  return url;
}

// El servidor al que se permite hablar, para la política de contenido y para la
// prueba que vigila que no se hable con ningún otro.
export function servidorDeLaNube() {
  const url = urlLimpia();
  if (!url) return '';
  try { return new URL(url).origin; } catch { return ''; }
}

// Lo que se le dice a quien abre la app con esto a medio configurar. Se dice
// entero: «no se pudo conectar» sin más manda a alguien a mirar su wifi durante
// media hora cuando lo que falta es pegar dos líneas en un archivo.
export function porQueNoHayNube() {
  if (hayNube()) return '';
  if (!String(NUBE.url || '').trim() && !String(NUBE.clave || '').trim()) {
    return 'Las cuentas todavía no están configuradas en esta compilación. Mientras tanto la app funciona entera en este teléfono, como siempre. Para activarlas hay que poner la dirección del proyecto y su clave pública en src/config-nube.js; los pasos están en docs/supabase.md.';
  }
  if (!urlLimpia()) return 'La dirección del proyecto en src/config-nube.js está vacía o no empieza por https://. Revísala en docs/supabase.md.';
  return 'Falta la clave pública del proyecto en src/config-nube.js. Revísala en docs/supabase.md.';
}
