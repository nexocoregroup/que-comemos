// El texto de la bienvenida y del recorrido opcional.
//
// Aquí solo vive el contenido; el dibujo lo hace app.js. Cada paso dice en qué
// página se explica, y el recorrido lleva la app hasta ahí para que se vea la
// pantalla de verdad detrás de la tarjeta.
//
// Antes esto eran doce pasos. Doce pasos no los termina nadie: quien acaba de
// instalar una app quiere usarla, no asistir a una clase. Ahora son seis, uno
// por sitio al que se va de verdad, y se ofrecen como «Cómo funciona» desde
// Ajustes en vez de plantarse delante de la primera pantalla. Lo que antes
// explicaba el recorrido —qué es una equivalencia, qué significa una rueda—
// ahora se pregunta en el momento en que hace falta y donde hace falta.
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
    title: 'Una sola vez: tu casa',
    body: 'Lo primero es un recorrido de cinco pasos que se hace una vez: quiénes comen en casa, qué se compra de costumbre, cada cuánto se hace la compra, qué sabes preparar, y un primer plan de siete o catorce días. Se puede dejar a medias y seguir otro día.',
    tip: 'Está en Ajustes → Organizar mi casa, y volver a pasar por él no borra nada de lo que ya escribiste.'
  },
  {
    page: 'hoy',
    title: 'Hoy',
    body: 'Lo primero que se ve cada día: el desayuno, el almuerzo y la cena, con qué lleva cada comida, para quién es y la nota de quien cocina. Está pensada para quien va a cocinar, no para quien organiza.',
    tip: 'Un momento sin nada puesto dice «sin decidir», y no es un error. Las meriendas son aparte: si no hay, no falta nada.'
  },
  {
    page: 'semana',
    title: 'Plan semanal',
    body: 'Siete días, de lunes a domingo, uno debajo de otro. Se toca una comida y se elige: una preparación guardada, algo escrito a mano para ese día, o lo que sobró de otra comida. También se puede decir que se come fuera, que se pedirá, o dejarla sin decidir.',
    tip: '«Ver dos semanas» enseña catorce días. Las flechas mueven de semana y «Ir a una fecha» te lleva a la que quieras. No hay vista de mes: la app no rellena el calendario por ti.'
  },
  {
    page: 'canasta',
    title: 'Mis productos habituales',
    body: 'Lo que tu casa compra de costumbre, agrupado por rubros. Se marca una vez y sirve para no acordarte de todo de cero cada vez que escribes una lista. No lleva cantidades del mes: cuánto llevas lo decides en el supermercado.',
    tip: 'Que algo esté aquí no significa que hoy haga falta. Es una lista para acordarse, no una compra.'
  },
  {
    page: 'preparaciones',
    title: 'Preparaciones',
    body: 'Las comidas que sabes hacer: nombre, en qué momentos se comen y una nota para quien cocina. Los alimentos que llevan son opcionales, y sirven para avisarte si chocan con lo que alguien de la casa evita.',
    tip: 'Una preparación se guarda una vez y se pone en el calendario las veces que quieras, sin volver a escribirla.'
  },
  {
    page: 'compra',
    highlight: 'fab',
    title: 'La compra, en dos vistas',
    body: 'En «Preparar la compra» están tus productos habituales por rubros: tocas lo que hace falta esta vez y dices cuánto llevas. En «Mi lista» está lo que queda por buscar arriba y lo comprado tachado abajo. Si pediste dos y solo había una, se anota una y queda una pendiente.',
    tip: 'Al terminar, si algo se quedó sin conseguir, se pregunta si pasa a la próxima lista o se queda solo en el historial. Puedes volver a ver esto desde Ajustes → Cómo funciona.'
  }
];
