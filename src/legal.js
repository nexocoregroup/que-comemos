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
// El correo de contacto va como marcador a propósito: no se inventó ninguna
// dirección. Antes de publicar hay que sustituirlo aquí y en las cuatro
// páginas de `legal/`. Para encontrarlos todos de una vez:
//
//     grep -rn CORREO_DE_CONTACTO legal/ src/legal.js docs/

export const LEGAL = {
  actualizado: '2026-09-15',

  privacidad: {
    titulo: 'Aviso de privacidad',
    secciones: [
      {
        titulo: 'En corto',
        parrafos: [
          'Todo lo que escribes en esta app se queda guardado en tu teléfono.',
          'No hay cuentas, no hay que registrarse y no hay un servidor nuestro. Nosotros, los que hicimos la app, no recibimos nada: ni tus comidas, ni tu despensa, ni tus compras, ni quiénes viven en tu casa, ni cuánto usas la app.',
          'No se puede pedir lo que no se tiene. Si quieres borrar tus datos, los borras tú desde el teléfono y se acabaron.'
        ]
      },
      {
        titulo: 'Quién hace esta app',
        parrafos: [
          'NexoCore, República Dominicana. La aplicación se llama «¿Qué comemos?» y en Google Play aparece con el identificador com.nexocore.quecomemos.',
          'Para cualquier cosa de este aviso, escríbenos a CORREO_DE_CONTACTO.'
        ]
      },
      {
        titulo: 'Qué se guarda y dónde',
        parrafos: [
          'La app guarda lo que tú escribes en ella: los alimentos de tu casa y sus cantidades, las comidas que planificas, tus rutinas y tus notas, las personas de la casa con el nombre que tú les pongas y sus restricciones si las anotas, tus compras, tus revisiones de «cuánto queda» y el historial que sale de ahí.',
          'Todo eso vive en el almacenamiento local del navegador dentro de tu propio teléfono. Es el mismo teléfono donde instalaste la app, y nada más.',
          'No se copia a la nube, no se sincroniza con otro aparato y no viaja a ninguna parte. Si abres la app en otro teléfono, ahí empiezas de cero: son dos almacenes distintos que no se hablan.',
          'La copia automática de Android está apagada a propósito. Android suele subir solo los datos de las aplicaciones a la cuenta de Google del dueño del teléfono; en esta app eso está desactivado, para que tu despensa no acabe en un servidor sin que nadie lo pidiera.',
          'El precio de esa decisión hay que decirlo claro: si pierdes el teléfono sin haber guardado una copia, se pierde todo. Por eso existe Más → Respaldo, y por eso la app insiste en que la uses.'
        ]
      },
      {
        titulo: 'Qué NO recogemos',
        parrafos: [
          'Esta es la lista completa de lo que el desarrollador recibe de ti: nada. Ni un dato.',
          'Sin cuentas: no hay registro, ni correo, ni contraseña, ni inicio de sesión.',
          'Sin analítica: no medimos cuánta gente abre la app, ni qué pantallas usa, ni cuánto tiempo pasa dentro.',
          'Sin publicidad y sin rastreadores: no hay anuncios, ni píxeles, ni identificadores de publicidad.',
          'Sin informes de fallos: si la app se rompe, no nos enteramos.',
          'Sin SDK de terceros: no hay librerías de otras empresas metidas dentro recogiendo datos por su cuenta.',
          'No es una promesa suelta. En el código de la app hay una sola función capaz de salir a internet, la del servidor opcional que se explica más abajo, y hay una prueba automática que falla si aparece cualquier otra.'
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
          'La app comprueba de verdad cuál de los dos casos es el tuyo antes de abrir el micrófono, en lugar de suponerlo. La respuesta para tu teléfono está en Más → Ajustes → Detalle de este aparato.',
          'Cuando ese audio sale del teléfono, lo que pase con él ya depende de Google y de los ajustes de voz de tu propio teléfono, no de esta app.',
          'Si usas la app desde un navegador en vez de instalada, el dictado lo hace el navegador, que también necesita conexión y manda la voz a sus servidores. Ahí la app te lo avisa en pantalla antes de abrir el micrófono.',
          'Y si prefieres no usar nada de esto: escribir a mano funciona siempre, en todos los campos. Puedes negar el permiso de micrófono y la app sigue completa.'
        ]
      },
      {
        titulo: 'El permiso de internet',
        parrafos: [
          'La app pide el permiso de internet, y conviene explicar por qué, porque suena peor de lo que es.',
          'La app no hace ninguna llamada a internet por su cuenta. Funciona entera sin conexión: los alimentos, la canasta, el menú, la compra y el inventario salen todos de tu propio teléfono.',
          'Ese permiso está ahí para una función opcional, apagada de fábrica, que casi nadie va a usar: en Funciones avanzadas, una persona con conocimientos técnicos puede escribir a mano la dirección de un servidor suyo para que el asistente entienda frases más libres.',
          'Esa dirección la escribe la persona. Nosotros no ponemos ninguna, y no hay ninguna dirección nuestra dentro de la app.',
          'Si nunca escribes una dirección ahí, no sale ni un byte de tu teléfono. Si la escribes, lo que salga va a tu propio servidor, no a nosotros, y lo que ese servidor haga con lo que recibe es responsabilidad de quien lo puso.',
          'Antes de mandar nada por ahí, la app te enseña un aviso diciendo exactamente qué va a salir, y no sale nada hasta que tú lo confirmes. La app solo acepta direcciones cifradas: el tráfico sin cifrar está bloqueado.'
        ]
      },
      {
        titulo: 'El respaldo lo guardas tú',
        parrafos: [
          'En Más → Respaldo puedes escribir una copia de tus datos. Es un archivo que se descarga a tu teléfono y que tú guardas donde quieras.',
          'La app no sube ese archivo a ningún sitio. Una vez descargado, esa copia es tuya y su cuidado también: si la mandas por chat o la subes a una nube, esos datos van a donde tú los mandes.',
          'La dirección del servidor opcional y su clave no se incluyen en el respaldo, para que una copia llevada a otro teléfono no arrastre la configuración del primero.'
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
          'Hay dos caminos y los dos los haces tú, desde tu teléfono.',
          'Desde dentro de la app: Más → Respaldo → Borrar todos mis datos. Te pide confirmación y borra lo de tu casa: alimentos, comidas, personas, compras y revisiones.',
          'Desinstalando la app: al desinstalarla, Android se lleva por delante todo su almacenamiento. Es el camino que no deja nada. También puedes hacerlo sin desinstalar, desde los ajustes de Android, en Aplicaciones, ¿Qué comemos?, Almacenamiento, Borrar datos.',
          'Los dos son inmediatos y no se pueden deshacer. Guarda una copia antes si la quieres.'
        ]
      },
      {
        titulo: 'No hay nada que pedirnos',
        parrafos: [
          'En las apps con cuenta, uno le escribe a la empresa para que le enseñe sus datos o se los borre. Aquí eso no aplica, y es una buena noticia.',
          'Como no hay cuentas ni servidor, nosotros no tenemos ningún dato tuyo: no podemos enseñártelos, ni corregirlos, ni exportarlos, ni borrarlos, porque nunca los tuvimos. Todo eso lo haces tú directamente en el teléfono, que es donde están.',
          'Si aun así quieres preguntarnos algo sobre este aviso, escribe a CORREO_DE_CONTACTO y te contestamos.'
        ]
      },
      {
        titulo: 'Menores de edad',
        parrafos: [
          'Esta app es una herramienta de organización doméstica pensada para adultos que manejan la casa. No está dirigida a menores de 13 años y no tiene contenido pensado para niños.',
          'Dicho eso, la app no recoge datos de nadie, sea la edad que sea. No hay forma de que un menor nos entregue información, porque no hay forma de que nadie nos entregue información.',
          'Si un adulto anota en la app el nombre de un niño de la casa y lo que no puede comer, ese dato se queda en el teléfono de esa familia, igual que todo lo demás.'
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
          'Si un cambio futuro hiciera que la app empezara a recoger algo, que hoy no es el caso, se diría aquí con todas las letras y se avisaría dentro de la app antes de que pasara.'
        ]
      },
      {
        titulo: 'Dónde aplica y con qué ley',
        parrafos: [
          'La app la desarrolla NexoCore, en la República Dominicana, y este aviso se rige por las leyes dominicanas.',
          'La República Dominicana tiene la Ley No. 172-13, sobre protección de datos personales, promulgada el 13 de diciembre de 2013, que protege los datos personales de las personas y su derecho a decidir sobre su propia información.',
          'El diseño de esta app va en esa misma dirección por la vía más simple que hay: no recogemos datos personales, así que no hay tratamiento, ni transferencia, ni cesión a terceros de la que hablar. Los datos de tu casa se quedan bajo tu control, en tu aparato.',
          'Esto describe lo que la app hace. No es una declaración de certificación ni de conformidad con ninguna norma, y no pretende serlo.'
        ]
      },
      {
        titulo: 'Contacto',
        parrafos: [
          'Si algo de esto no te queda claro, o crees que la app hace algo distinto a lo que aquí dice, queremos saberlo.',
          'CORREO_DE_CONTACTO',
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
          'La app es gratis, sirve para organizar las comidas y la compra de tu casa, y funciona en tu teléfono sin mandarle nada a nadie.',
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
          'Funciona entera en tu teléfono, sin cuenta y sin conexión. Todo lo que guarda se queda ahí, como se explica en el aviso de privacidad.'
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
          'Lo que escribes en la app es tuyo. No te lo pedimos, no lo recibimos y no reclamamos ningún derecho sobre eso.',
          'Ahora, como todo vive en tu teléfono, hacer copias te toca a ti. Es importante que lo entiendas antes, no después.',
          'Si desinstalas la app, los datos se van con ella. Si pierdes, vendes o se te daña el teléfono, los datos se pierden con él. Si borras los datos de la app desde los ajustes de Android, se borran.',
          'La copia automática de Android está apagada a propósito, para que tus datos no se suban a la nube sin que nadie lo pida. Eso significa que tampoco vuelven solos en un teléfono nuevo.',
          'Por eso Más → Respaldo existe y por eso la app insiste. Guarda una copia de vez en cuando, y guárdala en un sitio que sobreviva al teléfono.',
          'Actualizar la app desde la tienda sí conserva los datos: es el mismo almacenamiento.'
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
        titulo: 'El servidor opcional',
        parrafos: [
          'La app trae una función avanzada, apagada de fábrica, donde una persona con conocimientos técnicos puede conectar un servidor propio para que el asistente entienda frases más libres.',
          'Nadie la necesita: la app está completa sin eso.',
          'Si la usas, ese servidor es tuyo. Tú lo montas, tú lo pagas, tú respondes por lo que haga con lo que reciba. Nosotros no proveemos ningún servidor, no tenemos acceso al tuyo y no respondemos por él ni por lo que cueste.',
          'Antes de mandar nada por ahí, la app te enseña qué va a salir y espera que lo confirmes.'
        ]
      },
      {
        titulo: 'El dictado depende de tu teléfono',
        parrafos: [
          'Poder dictar en vez de escribir depende del reconocedor de voz de tu propio Android y del idioma que tenga descargado. En unos teléfonos entiende sin conexión y en otros necesita internet.',
          'Eso no lo controlamos nosotros, así que no te lo prometemos: la app comprueba qué puede hacer tu teléfono y te lo dice en Más → Ajustes → Detalle de este aparato.',
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
          'CORREO_DE_CONTACTO',
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
          'No hay que pedirle permiso a nadie ni escribirle a nadie. Los datos están en tu teléfono, así que los borras tú, ahí mismo, y se acabó.',
          'Hay dos caminos, y los dos son inmediatos.'
        ]
      },
      {
        titulo: 'Por qué esta página dice esto y no otra cosa',
        parrafos: [
          'Casi todas las apps piden una cuenta, guardan tus datos en su servidor y tienen un formulario para pedir que los borren.',
          '«¿Qué comemos?» no funciona así. No hay cuentas, no hay registro, no hay servidor nuestro y no recibimos ningún dato tuyo. Todo lo que escribes se guarda dentro de tu propio teléfono.',
          'Eso cambia la respuesta a esta pregunta: no tenemos nada tuyo que borrar, y por eso no hay ningún formulario que llenar ni ninguna solicitud que esperar. El botón de borrar lo tienes tú, en la mano.'
        ]
      },
      {
        titulo: 'Camino 1: borrar desde dentro de la app',
        parrafos: [
          'Abre la app y toca Más, abajo a la derecha. Entra en Respaldo.',
          'Si quieres conservar una copia, toca primero «Guardar una copia»: se descarga un archivo a tu teléfono.',
          'Toca «Borrar todos mis datos» y confirma.',
          'Esto borra lo de tu casa: los alimentos, las cantidades, la canasta habitual, las comidas planificadas, las rutinas, las personas, las compras, las revisiones y el historial. La app queda como recién instalada.',
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
        titulo: 'Una nota si vienes de una versión anterior',
        parrafos: [
          'Cuando la app cambia el formato en que guarda las cosas, antes de convertir nada deja a un lado una copia de lo que había, por si la conversión saliera mal. Es una red de seguridad, se queda en tu teléfono igual que el resto y nunca sale de ahí.',
          'El botón de dentro de la app borra los datos de tu casa. Si quieres que no quede absolutamente nada, incluida esa copia de seguridad interna, usa el camino 2: desinstalar la app, o borrar los datos desde los ajustes de Android.'
        ]
      },
      {
        titulo: 'Qué se borra con cada camino',
        parrafos: [
          'Los dos caminos borran los alimentos y cantidades, la canasta habitual, las comidas y rutinas, las personas de la casa, las compras, las revisiones y el historial.',
          'Solo el camino 2 borra además la copia interna de seguridad de formatos anteriores, la dirección del servidor propio si configuraste uno, y las preferencias de la pantalla.',
          'Ninguno de los dos borra el archivo de respaldo que descargaste tú: ese es tuyo y está donde tú lo pusiste. Ni la app ni Android lo tocan. Si quieres deshacerte de él, bórralo tú del teléfono, del correo o de donde lo hayas guardado.'
        ]
      },
      {
        titulo: 'Cuánto tarda y qué se puede deshacer',
        parrafos: [
          'Los dos caminos son inmediatos. No hay un plazo de espera ni un periodo de gracia, porque no hay nada que esperar: el borrado ocurre en tu teléfono en ese momento.',
          'No se puede deshacer, y no podemos recuperarlo nosotros, porque nunca tuvimos una copia. Lo único que devuelve tus datos es un respaldo que hayas guardado antes, que puedes volver a cargar desde Más → Respaldo.'
        ]
      },
      {
        titulo: 'Y si me escribes pidiendo que borre mis datos',
        parrafos: [
          'Te vamos a contestar lo mismo que dice esta página, porque es la verdad: no tenemos datos tuyos. Ni tu nombre, ni tu correo, ni tu despensa, ni nada.',
          'No hay una base de datos donde buscarte. Lo que hay es tu teléfono, y ahí mandas tú.',
          'Aun así, si tienes dudas o algo no te cuadra, escríbenos y te ayudamos a hacerlo: CORREO_DE_CONTACTO'
        ]
      }
    ]
  }
};
