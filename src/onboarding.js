// El texto de la bienvenida y del recorrido opcional.
//
// Aquí solo vive el contenido; el dibujo lo hace app.js. Cada paso dice en qué
// página se explica, y el recorrido lleva la app hasta ahí para que se vea la
// pantalla de verdad detrás de la tarjeta.
//
// Antes esto eran doce pasos. Doce pasos no los termina nadie: quien acaba de
// instalar una app quiere usarla, no asistir a una clase. Ahora son cuatro, uno
// por destino, y se ofrecen como «Cómo funciona» desde Ajustes en vez de
// plantarse delante de la primera pantalla. Lo que antes explicaba el recorrido
// —qué es una equivalencia, qué significa una rueda— ahora se pregunta en el
// momento en que hace falta y donde hace falta.
//
// Y ninguno promete que algo se llene solo. Lo prometía el del plan mensual,
// cuando la app aplicaba rutinas; hoy el calendario lo llena una persona.
//
// Un paso puede pedir `highlight`, que app.js convierte en una clase del body.
// Solo lo usa el botón +, que comparte esquina con la tarjeta.

export const WELCOME = {
  promise: 'Organiza una vez lo habitual de tu casa y decide con calma qué se come esta semana.',
  foot: 'Todo se guarda en este aparato. Puedes crear una cuenta para no perderlo si cambias de teléfono, o seguir sin cuenta y guardar una copia de vez en cuando.'
};

export const TOUR_STEPS = [
  {
    page: 'hoy',
    title: 'Hoy',
    body: 'Lo primero que se ve cada día: el desayuno, el almuerzo y la cena, con las cantidades, para quién es y la nota de quien cocina. Está pensada para quien va a cocinar, no para quien organiza.',
    tip: 'Si alguien te ayuda en la casa, esta es la única pantalla que necesita abrir.'
  },
  {
    page: 'mes',
    title: 'Plan mensual',
    body: 'Aquí decides qué se come. Para no tocar treinta casillas: eliges una preparación, marcas los días que quieras —los siete de la semana que viene, o los catorce de las dos siguientes— y se ponen esos.',
    tip: 'La app no elige por ti ni rellena el mes sola. Lo que no marques se queda vacío, y un día vacío no es un error.'
  },
  {
    page: 'compra',
    title: 'La compra',
    body: 'Una lista para un viaje al colmado. Tus productos habituales están ahí para no tener que acordarte de todo: tocas lo que hace falta esta vez y dices cuánto llevas.',
    tip: 'Aquí no se echan cuentas ni se sabe lo que queda en tu despensa: decides tú qué entra en la lista y en qué cantidad.'
  },
  {
    page: 'mas',
    highlight: 'fab',
    title: 'Más, y el botón +',
    body: 'En «Más» está todo lo que no se usa a diario: tus productos habituales, las preparaciones, la familia, el respaldo. Y el botón + de la esquina pone una comida, crea una preparación, prepara la compra o añade un alimento sin cambiar de pantalla.',
    tip: 'Puedes volver a ver esto cuando quieras desde Más → Ajustes → Cómo funciona.'
  }
];
