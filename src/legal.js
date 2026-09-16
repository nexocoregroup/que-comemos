// Los textos legales, para enseñarlos dentro de la app y sin conexión.
//
// Por qué existe este archivo además de las páginas de `legal/`: Google Play
// exige una dirección web para la política de privacidad y para la eliminación
// de datos, y eso son las páginas HTML. Pero una app que presume de funcionar
// sin conexión no puede mandar a su gente a un enlace que no abre en el campo,
// así que el mismo texto viaja dentro.
//
// ── Dos reglas para editar esto ────────────────────────────────────────────
//
// 1. TEXTO PLANO, SIN ETIQUETAS HTML. Esto se pinta con `esc()`, igual que
//    `onboarding.js`. Un `<strong>` no saldría en negrita: saldría escrito en
//    la pantalla, con sus picos y todo. Para destacar algo, usa comillas
//    angulares o reescribe la frase.
//
// 2. SIN `import`. Este módulo no depende de nada y nada de dentro depende del
//    estado de la app: es un archivo de contenido, y así se queda.
//
// Si cambias algo aquí, cámbialo también en `legal/privacidad.html`,
// `legal/terminos.html` y `legal/eliminar-datos.html`, y sube `actualizado` en
// los cuatro sitios. Son el mismo documento en dos formatos.
//
// ── Lo que pasó una vez y no puede volver a pasar ──────────────────────────
//
// Cuando entraron las cuentas, este archivo se actualizó a medias y las cuatro
// páginas de `legal/` no se tocaron. Durante un día el documento se contradijo a
// sí mismo —una sección decía que la app tenía una puerta a la red y otra, tres
// más abajo, que no tenía ninguna— y las páginas públicas negaban directamente
// una función que la app ya traía. `tests/legal.test.js` existe por eso: revisa
// que ningún texto legal, ni el de aquí ni el de `legal/`, siga afirmando cosas
// que el código ya desmiente.
//
// ── El correo ──────────────────────────────────────────────────────────────
//
// `nexocore.group@gmail.com` es PROVISIONAL, a la espera del buzón oficial de
// NexoCore. Sale público en la ficha de Play Store. Cuando cambie, cambia en
// seis archivos a la vez; para verlos todos:
//
//     grep -rn nexocore.group@gmail.com legal/ src/legal.js docs/

export const LEGAL = {
  actualizado: '2026-09-16',

  privacidad: {
    titulo: 'Aviso de privacidad',
    secciones: [
      {
        titulo: 'En corto',
        parrafos: [
          'Todo lo que escribes en esta app se queda guardado en tu teléfono.',
          'Puedes usarla sin cuenta, y entonces no sale nada de tu teléfono: la app no llama a ninguna parte. También puedes crear una cuenta, que sirve para recuperar tu casa si cambias de aparato.',
          'Tener cuenta no significa subir tus datos. Guardar la casa en la cuenta es una segunda decisión, con su propio interruptor en Más → Mi cuenta, y mientras esté apagado no viaja nada.',
          'No hay analítica, ni publicidad, ni rastreadores: nadie mide cuánto usas la app ni qué haces dentro, ni con cuenta ni sin ella.',
          'Si enciendes la sincronización, tu casa se guarda en tu cuenta. Más abajo se dice exactamente dónde queda y quién puede llegar a ella, sin adornos.'
        ]
      },
      {
        titulo: 'Quién hace esta app',
        parrafos: [
          'NexoCore, República Dominicana. La aplicación se llama «¿Qué comemos?» y en Google Play aparece con el identificador com.nexocore.quecomemos.',
          'Para cualquier cosa de este aviso, escríbenos a nexocore.group@gmail.com.'
        ]
      },
      {
        titulo: 'Qué se guarda y dónde',
        parrafos: [
          'La app guarda lo que tú escribes en ella: los alimentos de tu casa y sus cantidades, las comidas que planificas, tus rutinas y tus notas, las personas de la casa con el nombre que tú les pongas, tus compras, tus revisiones de «cuánto queda» y el historial que sale de ahí.',
          'De cada persona de la casa se guardan tres cosas y ninguna más: el nombre o apodo que tú elijas, si es adulto, adolescente o niño, y los alimentos que evita con el motivo que tú marques —alergia, intolerancia, o simplemente que lo evita—. Marcar una alergia es hablar de salud, y por eso conviene decirlo con todas las letras: esa palabra la escribes tú, se guarda igual que todo lo demás, y si enciendes la sincronización viaja a tu cuenta con el resto de tu casa.',
          'Lo que la app no te pide, y no debes escribir en ella, es el peso de nadie, su fecha de nacimiento, un diagnóstico o una medicación. No los necesita para nada, y lo que no se guarda no se puede perder.',
          'Todo eso vive en el almacenamiento local del navegador dentro de tu propio teléfono. Es el mismo teléfono donde instalaste la app, y nada más.',
          'Con la sincronización apagada —que es como viene— no se copia a ninguna parte. Si abres la app en otro teléfono, ahí empiezas de cero.',
          'Si la enciendes, ese mismo contenido se guarda además en tu cuenta, en servidores de Supabase, y vuelve solo cuando entras desde otro teléfono. Puedes apagarla cuando quieras, y borrar la cuenta borra lo que hubiera subido.',
          'La copia automática de Android está apagada a propósito. Android suele subir solo los datos de las aplicaciones a la cuenta de Google del dueño del teléfono; en esta app eso está desactivado, para que tu despensa no acabe en un servidor sin que nadie lo pidiera.',
          'El precio de esa decisión hay que decirlo claro: si no usas cuenta y pierdes el teléfono sin haber guardado una copia, se pierde todo. Por eso existe Más → Respaldo, y por eso la app insiste en que la uses.'
        ]
      },
      {
        titulo: 'Qué no recogemos, y qué sí — sin medias verdades',
        parrafos: [
          'Con la sincronización apagada, que es como viene, esta es la lista completa de lo que el desarrollador recibe de ti: nada. Ni un dato.',
          'Con la sincronización encendida hay que decirlo entero, porque media verdad aquí sería una mentira. Tu casa se guarda en una base de datos de Supabase que administra NexoCore. Está configurada para que cada cuenta solo pueda leer la suya, y eso protege a unos usuarios de otros de verdad. Pero quienes administramos esa base somos nosotros, así que el acceso técnico existe: no podemos decirte que nos resulte imposible leer lo que subes, porque no lo es.',
          'Lo que sí podemos decirte, y es lo que nos comprometemos a cumplir: no lo hacemos, no hay ningún proceso que recorra esos datos, no se los damos a nadie y no se usan para nada que no sea devolverte tu casa cuando entras desde otro teléfono. Y si prefieres que esa posibilidad ni siquiera exista, deja la sincronización apagada: entonces tus datos no salen del teléfono y no hay nada que leer.',
          'Tampoco está cifrado de extremo a extremo, y conviene saber la diferencia. Lo que subes viaja cifrado por el camino, pero se guarda tal cual en la base de datos. Cifrarlo de punta a punta se puede hacer y tiene un precio que hay que aceptar antes: quien olvide la contraseña perdería sus datos, porque ya nadie podría recuperarlos. Si algún día se hace, se dirá aquí.',
          'Si creas una cuenta, lo único que se guarda de ti como persona es tu correo, tu nombre y tu contraseña cifrada, y eso lo guarda Supabase, que es quien opera el servicio de cuentas.',
          'Sin analítica: no medimos cuánta gente abre la app, ni qué pantallas usa, ni cuánto tiempo pasa dentro.',
          'Sin publicidad y sin rastreadores: no hay anuncios, ni píxeles, ni identificadores de publicidad.',
          'Sin informes de fallos: si la app se rompe, no nos enteramos.',
          'Sin SDK de terceros: no hay librerías de otras empresas metidas dentro recogiendo datos por su cuenta.',
          'No es una promesa suelta. La app tiene una sola puerta de salida a la red, y solo sabe hablar con el proyecto de Supabase que guarda tu cuenta. Hay una prueba automática que se pone en rojo el día que alguien abra una segunda o le ponga otra dirección.'
        ]
      },
      {
        titulo: 'El micrófono y el dictado',
        parrafos: [
          'La app pide permiso de micrófono por una sola razón: para que puedas dictar en vez de escribir.',
          'El micrófono se abre solo cuando tú tocas el botón de dictar. Nunca antes, nunca de fondo, nunca mientras la app está cerrada.',
          'La app no graba, no guarda y no envía audio por su cuenta. No queda ningún archivo de voz en tu teléfono ni en ningún otro lado.',
          'Quien entiende lo que dices es el reconocedor de voz del propio Android, el mismo del micrófono del teclado. La app solo recibe el texto ya convertido.',
          'Y aquí viene la parte que hay que decir completa. Ese reconocedor funciona de dos maneras, y cuál te toca depende de tu teléfono. Si tu teléfono entiende la voz por sí solo y tiene descargado el paquete de español, todo pasa dentro del aparato y tu voz no sale de ahí. Si tu teléfono no lo trae, Android hace lo que hace siempre en ese caso: manda el audio a sus servidores para entenderlo, y por eso ahí el dictado necesita conexión. Eso lo hace Android, no nosotros, pero pasa igual y tienes derecho a saberlo.',
          'La app le pregunta a tu teléfono cuál de los dos casos es el suyo, y si el audio va a salir te lo dice en pantalla antes de abrir el micrófono. No lo supone: lo comprueba cada vez. Así que si no ves ningún aviso, es que en tu teléfono la voz se queda dentro.',
          'Puedes ver la respuesta para tu aparato, con calma, en Más → Ajustes → Detalle de este aparato.',
          'Cuando Android manda ese audio a sus servidores, lo que pase con él ya depende de Google y de los ajustes de voz de tu propio teléfono, no de esta app.',
          'Si usas la app desde un navegador en vez de instalada, el dictado lo hace el navegador, que necesita conexión y manda la voz a sus servidores. Ahí también te avisamos antes de abrir el micrófono.',
          'Y si prefieres no usar nada de esto: escribir a mano funciona siempre, en todos los campos. Puedes negar el permiso de micrófono y la app sigue completa.'
        ]
      },
      {
        titulo: 'El permiso de internet, y cuándo se usa de verdad',
        parrafos: [
          'La app pide el permiso de internet y lo usa para una sola cosa: las cuentas. Ni una más.',
          'Sin cuenta, la app no llama a ninguna parte. Ni al abrirse, ni al guardar, ni de fondo. Los alimentos, la canasta, el menú, la compra y el inventario salen todos de tu propio teléfono, y puedes usarla el mes completo en modo avión.',
          'Esto no es una promesa de buena fe, es cómo está escrito: al arrancar, la app mira si hay una sesión guardada en este teléfono, y si no la hay se detiene ahí mismo, sin tocar la red.',
          'Si creas una cuenta, la app habla con un sitio y solo con uno: el proyecto de Supabase donde viven las cuentas. Ahí van tu correo y tu contraseña al registrarte y al entrar, y ahí va tu casa solo si además enciendes la sincronización.',
          'No hay ninguna otra puerta de salida a la red, y hay una prueba automática que se pone en rojo el día que alguien abra una segunda o le cambie la dirección a esta.',
          'Ninguna analítica, ningún informe de fallos, ninguna publicidad y ninguna librería de terceros llamando a su casa. Esas puertas no existen, y la misma prueba las vigila.'
        ]
      },
      {
        titulo: 'El respaldo lo guardas tú',
        parrafos: [
          'En Más → Respaldo puedes escribir una copia de tus datos. Es un archivo que se descarga a tu teléfono y que tú guardas donde quieras.',
          'La app no sube ese archivo a ningún sitio. Una vez descargado, esa copia es tuya y su cuidado también: si la mandas por chat o la subes a una nube, esos datos van a donde tú los mandes.',
          'El respaldo lleva lo de tu casa y nada más: alimentos, cantidades, comidas, personas, compras y revisiones. No lleva identificadores tuyos ni nada que te señale a ti.'
        ]
      },
      {
        titulo: 'Permisos que la app no pide',
        parrafos: [
          'Vale la pena decir también lo que no está: no pide cámara, no pide galería ni fotos, no pide ubicación, no pide contactos, no pide teléfono ni llamadas, y no pide acceso a los archivos de tu teléfono.',
          'Son dos permisos en total, micrófono e internet, y ninguno más. Hay una prueba automática que falla si alguno de los otros se cuela.'
        ]
      },
      {
        titulo: 'Cómo borrar tus datos',
        parrafos: [
          'Todos los caminos los recorres tú, desde tu teléfono, sin pedirle permiso a nadie ni esperar a que nadie apruebe nada.',
          'Lo del teléfono, desde dentro de la app: Más → Respaldo → Borrar todos mis datos. Te pide confirmación y borra todo lo que la app guardó: alimentos, comidas, personas, compras, revisiones, la copia interna de seguridad y tus preferencias de pantalla.',
          'Lo del teléfono, desinstalando: al desinstalar la app, Android se lleva por delante todo su almacenamiento, incluida la caché del sistema. También puedes hacerlo sin desinstalar, desde los ajustes de Android, en Aplicaciones, ¿Qué comemos?, Almacenamiento, Borrar datos.',
          'La cuenta, si llegaste a crear una: Más → Mi cuenta → Borrar mi cuenta. Eso borra de una vez tu cuenta y todo lo que hubiera subido —tu correo, tu nombre y la casa que tuvieras guardada— y borra además lo que quede en este teléfono.',
          'Todos son inmediatos y no se pueden deshacer. Guarda una copia antes si la quieres.'
        ]
      },
      {
        titulo: 'Tus derechos, y por qué casi todos los ejerces tú solo',
        parrafos: [
          'En las apps con cuenta, uno le escribe a la empresa para que le enseñe sus datos, los corrija, se los lleve o se los borre. Aquí no hace falta esperar a nadie, porque los botones los tienes tú.',
          'Verlos y corregirlos: están en la app, en tus propias pantallas, y se cambian ahí mismo.',
          'Llevártelos: Más → Respaldo escribe un archivo con todo lo tuyo, se descarga a tu teléfono y es tuyo.',
          'Borrarlos: Más → Respaldo → Borrar todos mis datos para lo del teléfono, y Más → Mi cuenta → Borrar mi cuenta para lo de la cuenta, que se lleva las dos cosas de una vez.',
          'Si nunca creaste una cuenta, no tenemos absolutamente nada tuyo y no hay nada que pedirnos. Si la creaste, lo que hay es tu correo, tu nombre y la casa que hayas subido, y el botón para borrarlo está en la app.',
          'Si prefieres escribirnos, o algo de esto no te cuadra, escribe a nexocore.group@gmail.com y te contestamos.'
        ]
      },
      {
        titulo: 'Menores de edad',
        parrafos: [
          'Esta app es una herramienta de organización doméstica pensada para adultos que manejan la casa. No está dirigida a menores de 13 años y no tiene contenido pensado para niños.',
          'La app no le pide datos personales a quien la usa, y la cuenta está pensada para que la cree el adulto que organiza la casa, no un menor.',
          'Si un adulto anota el nombre de un niño de la casa y lo que no puede comer, ese dato se queda en el teléfono de esa familia. Si ese adulto enciende la sincronización, viaja a su cuenta junto con el resto de la casa, y conviene que lo sepa antes de encenderla.'
        ]
      },
      {
        titulo: 'Esto no es consejo de alimentación ni médico',
        parrafos: [
          'La app enseña cantidades de alimentos para organizar la casa y calcular la compra. Eso es todo lo que hace.',
          'Las cantidades que ves salen de lo que tú misma escribiste, y las del ejemplo son datos inventados para que veas cómo funciona. No son recomendaciones nutricionales, ni dietas, ni consejo médico. Para eso hay que hablar con un profesional de la salud.'
        ]
      },
      {
        titulo: 'Cambios en este aviso',
        parrafos: [
          'Si algún día cambiamos esto, la versión nueva se publica en la misma dirección de siempre y con su fecha de actualización arriba. No hay versiones escondidas en otro lado.',
          'Si un cambio futuro hiciera que la app recogiera algo más de lo que dice esta página, se escribiría aquí con todas las letras y se avisaría dentro de la app antes de que pasara.'
        ]
      },
      {
        titulo: 'Dónde aplica y con qué ley',
        parrafos: [
          'La app la desarrolla NexoCore, en la República Dominicana, y este aviso se rige por las leyes dominicanas.',
          'La República Dominicana tiene la Ley No. 172-13, sobre protección de datos personales, promulgada el 13 de diciembre de 2013, que protege los datos personales de las personas y su derecho a decidir sobre su propia información.',
          'Sin cuenta no se recoge ningún dato personal, así que no hay tratamiento del que hablar: los datos de tu casa se quedan en tu aparato, bajo tu control.',
          'Si creas una cuenta, entonces sí hay un tratamiento y hay que nombrarlo con sus nombres. El responsable es NexoCore. El encargado es Supabase, que opera los servidores donde viven las cuentas y, si la enciendes, la sincronización. No hay ninguna otra empresa en medio, no se cede a terceros y no se usa para nada distinto de devolverte tu casa cuando entras desde otro teléfono.',
          'Esto describe lo que la app hace. No es una declaración de certificación ni de conformidad con ninguna norma, y no pretende serlo.'
        ]
      },
      {
        titulo: 'Contacto',
        parrafos: [
          'Si algo de esto no te queda claro, o crees que la app hace algo distinto a lo que aquí dice, queremos saberlo.',
          'nexocore.group@gmail.com',
          'NexoCore, República Dominicana.'
        ]
      }
    ]
  },

  terminos: {
    titulo: 'Términos de uso',
    secciones: [
      {
        titulo: 'En corto',
        parrafos: [
          'La app es gratis, sirve para organizar las comidas y la compra de tu casa, y funciona entera en tu teléfono sin cuenta y sin conexión.',
          'La cuenta es opcional y existe para una sola cosa: recuperar tu casa si cambias de aparato.',
          'Los datos son tuyos y las copias también: guárdalas tú. La app hace cuentas con lo que tú escribes; no te dice qué debes comer.'
        ]
      },
      {
        titulo: 'De qué estamos hablando',
        parrafos: [
          'Estos términos son el acuerdo entre tú, que usas la aplicación «¿Qué comemos?», y NexoCore, en la República Dominicana, que la hizo.',
          'Al instalar o usar la app aceptas lo que dice aquí. Si algo no te parece bien, no la uses: es así de simple, y no pasa nada.'
        ]
      },
      {
        titulo: 'Qué hace la app',
        parrafos: [
          'Sirve para organizar las comidas de una casa y calcular la compra del mes. Te deja escribir una sola vez lo habitual de tu casa y luego, cada mes, solo revisar lo que va a ser diferente.',
          'Funciona entera en tu teléfono, sin cuenta y sin conexión. Si quieres, puedes crear una cuenta para recuperar tu casa al cambiar de aparato: es opcional, viene apagada y se explica con detalle en el aviso de privacidad.'
        ]
      },
      {
        titulo: 'Es gratis y se usa tal como está',
        parrafos: [
          'La app no cuesta nada, no tiene anuncios, no tiene compras dentro y no tiene suscripción.',
          'La entregamos tal como está, con lo que hace hoy. Hacemos lo posible para que funcione bien, pero no podemos prometerte que nunca falle, que funcione igual en todos los teléfonos del mundo, ni que esté disponible para siempre.'
        ]
      },
      {
        titulo: 'Esto no es consejo de alimentación ni médico',
        parrafos: [
          'La app organiza cantidades de comida para que la casa se planifique y la compra salga bien. Nada más que eso.',
          'Las cantidades que ves son las que tú escribiste, y las del ejemplo son inventadas para enseñarte cómo funciona. No son dietas, ni recomendaciones nutricionales, ni consejo médico.',
          'Si hay una condición de salud, una alergia, un embarazo o cualquier cosa que dependa de lo que se come, eso se habla con un profesional de la salud. La app no sustituye a nadie ahí, y no debe usarse como si lo hiciera.'
        ]
      },
      {
        titulo: 'Tus datos son tuyos, y las copias también',
        parrafos: [
          'Lo que escribes en la app es tuyo. No te lo pedimos, no lo recibimos si no enciendes la sincronización, y no reclamamos ningún derecho sobre eso en ningún caso.',
          'Sin cuenta, todo vive en tu teléfono y hacer copias te toca a ti. Es importante que lo entiendas antes, no después.',
          'Si desinstalas la app, los datos se van con ella. Si pierdes, vendes o se te daña el teléfono, los datos se pierden con él. Si borras los datos de la app desde los ajustes de Android, se borran.',
          'La copia automática de Android está apagada a propósito, para que tus datos no se suban a la nube sin que nadie lo pida. Eso significa que tampoco vuelven solos en un teléfono nuevo.',
          'Por eso Más → Respaldo existe y por eso la app insiste. Guarda una copia de vez en cuando, y guárdala en un sitio que sobreviva al teléfono.',
          'Con cuenta y sincronización encendida hay además una copia en tu cuenta, y esa sí vuelve sola al entrar desde otro teléfono. Aun así, guarda respaldos: una cuenta no sustituye a una copia que tengas tú en la mano.',
          'Actualizar la app desde la tienda sí conserva los datos: es el mismo almacenamiento.'
        ]
      },
      {
        titulo: 'La cuenta, si decides crearla',
        parrafos: [
          'Crear una cuenta es opcional y sirve para recuperar tu casa al cambiar de teléfono. Guardar la casa en esa cuenta es además una segunda decisión, con su propio interruptor en Más → Mi cuenta, y viene apagada.',
          'Cuando creas una cuenta te comprometes a dar un correo que sea tuyo, a cuidar tu contraseña y a no usar la cuenta de otra persona.',
          'Podemos cerrar o suspender una cuenta que se use para algo ilegal o para atacar el servicio. Fuera de eso, la cuenta es tuya y la borras tú cuando quieras, desde Más → Mi cuenta → Borrar mi cuenta.',
          'El servicio de cuentas lo opera Supabase. No podemos prometerte que esté disponible siempre, y por eso la app funciona entera sin él: si un día no se puede entrar, tu casa sigue en tu teléfono y no deja de servir.'
        ]
      },
      {
        titulo: 'Lo que no debes hacer con la app',
        parrafos: [
          'No hay mucho que prohibir aquí, pero conviene decirlo: no la uses para nada ilegal, no la distribuyas haciéndola pasar por tuya, no la publiques en otra tienda como si fuera otra app, y no quites ni cambies las marcas, los nombres o los avisos legales para redistribuirla.',
          'El nombre «¿Qué comemos?», la marca NexoCore y el diseño gráfico de la app son nuestros. Usar la app no te da derecho sobre ellos.'
        ]
      },
      {
        titulo: 'La asistente vive aquí dentro',
        parrafos: [
          'La asistente entiende las frases aquí dentro, en tu teléfono, reconociéndolas por su forma. Por eso entiende unas cuantas maneras de decir las cosas y no cualquier frase suelta. Cuando no entiende algo, te dice lo que sí sabe hacer y te lleva a la pantalla que toca: no manda tu frase a ningún lado para que otro la interprete.',
          'Todo lo que la asistente hace se puede hacer también a mano, en su pantalla. Es una comodidad, no un requisito.'
        ]
      },
      {
        titulo: 'El dictado depende de tu teléfono',
        parrafos: [
          'Poder dictar en vez de escribir depende del reconocedor de voz de tu propio Android y del idioma que tenga descargado. En unos teléfonos entiende sin conexión y en otros necesita internet.',
          'Eso no lo controlamos nosotros, así que no te lo prometemos: la app le pregunta a tu teléfono qué puede hacer y, si al dictar el audio va a salir del aparato, te lo dice antes de abrir el micrófono. La respuesta para tu teléfono está en Más → Ajustes → Detalle de este aparato.',
          'Escribir a mano funciona siempre, en todos los campos, con micrófono o sin él.'
        ]
      },
      {
        titulo: 'Hasta dónde respondemos',
        parrafos: [
          'Dicho en palabras normales: la app te ayuda a organizarte, pero las decisiones de tu casa las tomas tú.',
          'No respondemos por pérdidas de datos, compras mal calculadas, comida de más o de menos, ni daños que salgan de usar la app o de no poder usarla. En particular, no respondemos si pierdes tus datos por desinstalar la app, por perder el teléfono o por no haber guardado una copia.',
          'Esto vale en la medida en que la ley lo permita. Si la ley dominicana te reconoce algún derecho como consumidor que no se puede quitar por contrato, ese derecho sigue siendo tuyo y este texto no lo toca.'
        ]
      },
      {
        titulo: 'Cambios en la app y en estos términos',
        parrafos: [
          'La app puede cambiar: se le añaden cosas, se le quitan otras. Si una versión futura cambiara algo importante de lo que dice aquí, la versión nueva de estos términos se publica en la misma dirección de siempre, con su fecha arriba.',
          'Seguir usando la app después de un cambio es aceptarlo. Si no lo aceptas, puedes desinstalarla, y tus datos se van contigo.'
        ]
      },
      {
        titulo: 'Qué ley aplica',
        parrafos: [
          'Estos términos se rigen por las leyes de la República Dominicana. Cualquier desacuerdo se ve ante los tribunales dominicanos competentes.',
          'Si alguna parte de este texto no valiera legalmente, el resto sigue valiendo igual.'
        ]
      },
      {
        titulo: 'Contacto',
        parrafos: [
          'Dudas, quejas o algo que no cuadra:',
          'nexocore.group@gmail.com',
          'NexoCore, República Dominicana.'
        ]
      }
    ]
  },

  eliminar: {
    titulo: 'Cómo eliminar tus datos',
    secciones: [
      {
        titulo: 'En corto',
        parrafos: [
          'No hay que pedirle permiso a nadie ni escribirle a nadie. Los borras tú, desde tu teléfono, y se acabó.',
          'Hay tres caminos y los tres son inmediatos: dos para lo que está guardado en el teléfono, y uno para la cuenta, si llegaste a crear una.'
        ]
      },
      {
        titulo: 'Por qué esta página dice esto y no otra cosa',
        parrafos: [
          'Casi todas las apps piden una cuenta, guardan tus datos en su servidor y tienen un formulario para pedir que los borren, con su plazo y su espera.',
          '«¿Qué comemos?» funciona al revés. Se usa entera sin cuenta, y quien no crea una cuenta no nos entrega absolutamente nada: sus datos están en su teléfono y ahí manda él.',
          'Quien sí crea una cuenta tiene guardados un correo, un nombre y —solo si encendió la sincronización— su casa, en el proyecto de Supabase que administra NexoCore. Para eso existe el tercer camino de esta página, que lo borra todo de una vez.',
          'En los dos casos el botón lo tienes tú, en la mano: no hay formulario que llenar ni solicitud que esperar.'
        ]
      },
      {
        titulo: 'Camino 1: borrar desde dentro de la app',
        parrafos: [
          'Abre la app y toca Más, abajo a la derecha. Entra en Respaldo.',
          'Si quieres conservar una copia, toca primero «Guardar una copia»: se descarga un archivo a tu teléfono.',
          'Toca «Borrar todos mis datos» y confirma.',
          'Esto borra todo lo que la app guardó en tu teléfono: los alimentos, las cantidades, la canasta habitual, las comidas planificadas, las rutinas, las personas, las compras, las revisiones, el historial, la copia interna de seguridad y tus preferencias de pantalla. La app queda como recién instalada.',
          'Úsalo cuando quieras empezar de cero pero seguir usando la app.'
        ]
      },
      {
        titulo: 'Camino 2: desinstalar la app',
        parrafos: [
          'Si quieres una copia, guárdala antes desde Más → Respaldo. Después de este paso no hay vuelta atrás.',
          'Mantén pulsado el ícono de «¿Qué comemos?», elige Desinstalar y confirma.',
          'Al desinstalar, Android elimina todo el almacenamiento de la app. No queda nada en el teléfono.',
          'Si prefieres no desinstalarla, consigues lo mismo desde los ajustes de Android, en Aplicaciones, ¿Qué comemos?, Almacenamiento, Borrar datos.'
        ]
      },
      {
        titulo: 'Camino 3: borrar tu cuenta y lo que hayas subido',
        parrafos: [
          'Este camino solo hace falta si creaste una cuenta. Si nunca la creaste, no hay ninguna cuenta tuya que borrar y con los dos caminos de arriba ya está todo.',
          'Si quieres una copia, guárdala antes desde Más → Respaldo. Después de este paso no hay vuelta atrás.',
          'Abre la app, toca Más, entra en Mi cuenta y toca «Borrar mi cuenta». Confirma.',
          'Eso borra de una vez la cuenta entera: tu correo, tu nombre, la contraseña, la casa que tuvieras guardada y el registro de que existías. Y borra además lo que quede en este teléfono, para que no te quedes con media cosa.',
          'Lo hace el servidor en ese momento. No hay plazo de espera, ni revisión, ni nadie que lo apruebe.',
          'Si no recuerdas la contraseña, pídela de nuevo desde la pantalla de entrar: te llega un correo para ponerte una nueva, entras y borras la cuenta tú.',
          'Y si de plano no puedes entrar a la app —perdiste el teléfono, ya no tienes acceso al correo— escríbenos a nexocore.group@gmail.com desde una dirección que podamos relacionar con tu cuenta y la borramos nosotros.'
        ]
      },
      {
        titulo: '¿En qué se diferencian los dos caminos del teléfono? En casi nada',
        parrafos: [
          'El botón de dentro de la app borra todas las claves que la app escribe, una por una, y eso incluye la copia interna de seguridad: cuando la app cambia el formato en que guarda las cosas, antes de convertir nada deja a un lado una copia de lo que había, por si la conversión saliera mal. Esa copia también se va.',
          'Lo único que desinstalar se lleva además es lo que guarda el sistema, no la app: la caché del navegador interno de Android y cualquier resto suelto que deje el sistema operativo. No son datos de tu casa, pero si quieres que no quede absolutamente nada, ese es el camino.',
          'Dicho corto: para borrar los datos del teléfono, cualquiera de los dos sirve. Ninguno de los dos toca la cuenta: para eso está el camino 3.'
        ]
      },
      {
        titulo: 'Qué se borra con cada camino',
        parrafos: [
          'Los caminos 1 y 2 borran lo que está en el teléfono: los alimentos y cantidades, la canasta habitual, las comidas y rutinas, las personas de la casa, las compras, las revisiones, el historial, la copia interna de seguridad y las preferencias de la pantalla.',
          'Solo desinstalar borra además la caché del navegador interno de Android, y solo desinstalar quita la app del teléfono: con el botón de dentro, la app se queda instalada y lista para empezar de cero.',
          'El camino 3 borra lo que está en la cuenta —correo, nombre, contraseña y la casa que hubieras subido— y también lo del teléfono.',
          'Ninguno de los tres borra el archivo de respaldo que descargaste tú: ese es tuyo y está donde tú lo pusiste. Ni la app ni Android lo tocan. Si quieres deshacerte de él, bórralo tú del teléfono, del correo o de donde lo hayas guardado.'
        ]
      },
      {
        titulo: 'Cuánto tarda y qué se puede deshacer',
        parrafos: [
          'Los tres caminos son inmediatos. No hay un plazo de espera ni un periodo de gracia: el borrado ocurre en el momento en que confirmas.',
          'No se puede deshacer, y no podemos recuperarlo nosotros. Lo único que devuelve tus datos es un respaldo que hayas guardado antes, que puedes volver a cargar desde Más → Respaldo.'
        ]
      },
      {
        titulo: 'Y si me escribes pidiendo que borre mis datos',
        parrafos: [
          'Si nunca creaste una cuenta, te vamos a contestar lo mismo que dice esta página, porque es la verdad: no tenemos ningún dato tuyo. Ni tu nombre, ni tu correo, ni tu despensa. No hay una base de datos donde buscarte; lo que hay es tu teléfono, y ahí mandas tú.',
          'Si creaste una cuenta, sí podemos borrarla, y lo hacemos. Escríbenos desde una dirección que podamos relacionar con ella. Aun así, el camino rápido es el de la propia app: Más → Mi cuenta → Borrar mi cuenta, que es inmediato y no depende de que nadie conteste.',
          'Para cualquiera de los dos casos: nexocore.group@gmail.com'
        ]
      }
    ]
  }
};
