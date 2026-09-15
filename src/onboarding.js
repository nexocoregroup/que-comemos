// Texto de la bienvenida de primer arranque y del recorrido guiado. Aquí solo
// vive el contenido; el dibujo lo hace app.js con sus propios ayudantes, igual
// que el resto de las pantallas. Cada paso indica en qué página se explica, y
// el recorrido lleva la app hasta ahí para que se vea la pantalla real detrás.
//
// Un paso puede pedir `highlight`, que app.js convierte en una clase del body.
// Por ahora solo lo usa el botón +, que el recorrido esconde el resto del
// tiempo porque comparte esquina con la tarjeta.

export const WELCOME = {
  promise: 'Planifica el desayuno, el almuerzo y la cena de la casa, compra según lo que realmente queda y anota lo que se consumió.',
  points: [
    ['Un menú', 'por semana o por mes, con las cantidades de cada comida y para quién es.'],
    ['Una lista de compra', 'que sale del menú, o de la canasta que tu casa consume cada mes, menos lo que ya tienes.'],
    ['Un inventario', 'que solo se mueve cuando confirmas una compra o una revisión.']
  ],
  note: '«Ver el ejemplo» abre un recorrido por la app con datos de prueba. «Empezar desde cero» va directo a lo único que hace falta: escribir lo que tu casa consume en un mes. El recorrido queda a mano para después.',
  foot: 'Los datos se guardan solo en este navegador y dispositivo. No hay cuentas ni sincronización: exporta un respaldo antes de cambiar de equipo.'
};

export const TOUR_STEPS = [
  {
    page: 'hoy',
    title: 'Hoy en casa',
    body: 'Lo primero que ves cada día: las tres comidas con sus cantidades, para quién es cada cosa y la nota de quien cocina. Más abajo queda un vistazo a mañana.',
    tip: 'Cuando una comida ya está decidida, aquí sale lista para cocinar sin abrir nada más.'
  },
  {
    page: 'hoy',
    highlight: 'fab',
    title: 'El botón + lo abre todo',
    body: 'Ahí abajo a la derecha. Está en Hoy, Menú, Compras y Revisión, y abre los mismos formularios que viven en Ajustes: un producto, una preparación, una persona, una compra, una revisión, una corrección de existencias o una ausencia.',
    tip: 'Existe para que anotar algo no te obligue a cambiar de sección. Casi todos los atajos te dejan donde estabas; solo la revisión y la compra te llevan a su pantalla, porque es ahí donde se ve el resultado.'
  },
  {
    page: 'menu',
    title: 'El menú, por semana o por mes',
    body: 'Toca cualquier comida del calendario para asignarle una preparación, cambiar las cantidades de esa fecha, moverla, copiarla o marcarla como fuera de casa, pedido o sin planificar. En el celular la semana se lee como una agenda, un día debajo de otro, y el mes reduce cada comida a su inicial para que quepan los treinta días sin arrastrar de lado.',
    tip: 'Abajo hay dos atajos para llenarlo rápido: repetir esta semana en el resto del mes, o pedir una propuesta para el mes completo.'
  },
  {
    page: 'catalogo',
    title: 'Preparaciones: lo que se repite en casa',
    body: 'Guarda aquí las comidas habituales con sus alimentos principales, cuánto lleva cada uno, a quién cubre y las variantes por persona. Desde el menú se copian a cualquier fecha. Si las personas de la casa ya tienen cantidades habituales guardadas, «Traer cantidades habituales» las suma y te llena la lista de alimentos de una vez.',
    tip: 'Cambiar una preparación del catálogo no toca las comidas ya asignadas: cada fecha conserva su nombre y sus cantidades.'
  },
  {
    page: 'personas',
    title: 'Quiénes comen en casa',
    body: 'Registra a cada persona, los alimentos que no puede comer y cuánto come normalmente. Esas cantidades habituales quedan guardadas y no hay que volver a escribirlas: se traen a una preparación con un toque. También puedes marcar ausencias por fecha y comida cuando alguien no come en casa.',
    tip: 'Con las restricciones y las ausencias puestas, la propuesta automática deja de ofrecer comidas incompatibles.'
  },
  {
    page: 'productos',
    title: 'Los alimentos de la casa',
    body: 'Aquí vive la ficha completa de cada alimento: el nombre, en qué unidad lo cuentas, cuánto se consume al mes, cuánto hay en casa y cómo se compra. La canasta del mes es esta misma lista vista de otra forma, con solo la columna del mes, para llenar muchos de golpe. Escribas donde escribas, es el mismo dato: no son dos registros.',
    tip: 'Lo que tienes se pregunta una sola vez, al crear el producto, porque es el punto de partida del inventario. De ahí en adelante solo lo mueven las compras, las revisiones y las correcciones de conteo.'
  },
  {
    page: 'productos',
    title: 'Cuando contar y comprar no usan la misma medida',
    body: 'El salami lo cuentas por ruedas pero lo compras por paquetes. En el mismo formulario del producto despliega «Lo compro en otra medida» y escribe cuántas ruedas trae un paquete: eso es una equivalencia, y no hay que ir a otra pantalla a ponerla.',
    tip: 'La app nunca adivina una conversión. Sin la equivalencia te avisa de que la lista está incompleta, en vez de darte un número equivocado.'
  },
  {
    page: 'productos',
    title: 'Una rueda no mide lo mismo en dos casas',
    body: 'Lo que cuentas por ruedas o rebanadas lleva además el grosor con que se corta en tu casa: fina de 2 a 3 mm, mediana de 4 a 5, gruesa de 6 a 8. El campo solo aparece cuando la unidad lo pide.',
    tip: 'No convierte cantidades; de eso se encarga la equivalencia. Lo que hace es dejar escrito qué significa una rueda aquí, que es lo que permite comparar el conteo de una semana con el de la siguiente.'
  },
  {
    page: 'compras',
    title: 'La compra sale del menú',
    body: 'Eliges una quincena o unas fechas y la app calcula lo que hace falta: lo que pide el menú menos lo que ya tienes. Revisas la lista y confirmas con las cantidades que realmente compraste.',
    tip: 'La lista sugerida no cambia nada. Solo la compra confirmada aumenta las existencias.'
  },
  {
    page: 'compras',
    title: 'O sale de la canasta del mes',
    body: 'Si tu casa consume casi lo mismo todos los meses, escríbelo una sola vez en la canasta y cambia arriba a «Canasta». La lista sale de ahí, sin planificar el menú día por día. Escribes el nombre y la cantidad y ya: los alimentos que no existan se registran solos, no hay que crearlos aparte. Para no teclearla entera, «Llenarla con lo que compré un mes» suma las compras confirmadas de ese mes.',
    tip: 'Cada línea de la canasta es el alimento que ya viste en la pantalla anterior; aquí solo se escribe su consumo del mes. Se escribe por mes completo, y al comprar por quincena la app pide la mitad. Las dos bases no se suman: o el menú, o la canasta.'
  },
  {
    page: 'revision',
    title: 'La revisión cierra el círculo',
    body: 'Cada cierto tiempo abres una revisión y escribes cuánto se consumió de cada producto. Un campo vacío queda pendiente; escribe 0 si no se consumió nada.',
    tip: 'Planificar no descuenta nada. El inventario solo lo mueven las compras confirmadas, las revisiones confirmadas y las correcciones de conteo.'
  },
  {
    page: 'hoy',
    title: 'Eso es todo',
    body: 'Un buen orden para empezar: crea tus productos con lo que ya tienes en casa, añade a las personas, guarda dos o tres preparaciones y arma la primera semana del menú. Todo eso cabe en el botón +.',
    tip: 'Puedes volver a abrir este recorrido cuando quieras desde Productos y datos → Cómo funciona.'
  }
];
