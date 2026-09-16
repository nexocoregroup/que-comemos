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
// Un paso puede pedir `highlight`, que app.js convierte en una clase del body.
// Solo lo usa el botón +, que comparte esquina con la tarjeta.

export const WELCOME = {
  promise: 'Organiza una vez lo habitual de tu casa y prepara cada mes cambiando solamente lo diferente.',
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
    body: 'Aquí se organiza el mes entero de una sentada. En vez de tocar noventa casillas, guardas lo que se repite —«mangú con salami, martes y jueves de desayuno»— y el calendario se llena solo, con los días reales del mes.',
    tip: 'El mes siguiente se abre ya preparado con esas mismas costumbres. Solo revisas lo que será diferente.'
  },
  {
    page: 'compra',
    title: 'La compra',
    body: 'Una sola lista: lo que tu casa consume al mes, más lo que cambie este mes, menos lo que ya queda en casa. No hay que planificar el menú para que salga.',
    tip: 'Solo la compra que anotas después de ir al colmado mueve las existencias. La lista sugerida no cambia nada.'
  },
  {
    page: 'mas',
    highlight: 'fab',
    title: 'Más, y el botón +',
    body: 'En «Más» está todo lo que no se usa a diario: tu canasta habitual, las preparaciones, la familia, la revisión de lo que queda, el respaldo. Y el botón + de la esquina anota una comida, una compra o un alimento sin cambiar de pantalla.',
    tip: 'Puedes volver a ver esto cuando quieras desde Más → Ajustes → Cómo funciona.'
  }
];
