// Texto de la bienvenida de primer arranque y del recorrido guiado. Aquí solo
// vive el contenido; el dibujo lo hace app.js con sus propios ayudantes, igual
// que el resto de las pantallas. Cada paso indica en qué página se explica, y
// el recorrido lleva la app hasta ahí para que se vea la pantalla real detrás.

export const WELCOME = {
  promise: 'Planifica el desayuno, el almuerzo y la cena de la casa, compra según lo que realmente queda y anota lo que se consumió.',
  points: [
    ['Un menú', 'por semana o por mes, con las cantidades de cada comida y para quién es.'],
    ['Una lista de compra', 'que sale del menú y le resta lo que ya tienes en casa.'],
    ['Un inventario', 'que solo se mueve cuando confirmas una compra o una revisión.']
  ],
  note: 'Los dos caminos empiezan con un recorrido corto por la app. Puedes saltarlo cuando quieras.',
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
    page: 'menu',
    title: 'El menú, por semana o por mes',
    body: 'Toca cualquier comida del calendario para asignarle una preparación, cambiar las cantidades de esa fecha, moverla, copiarla o marcarla como fuera de casa, pedido o sin planificar.',
    tip: 'Abajo hay dos atajos: repetir esta semana en el resto del mes, o pedir una propuesta para el mes completo.'
  },
  {
    page: 'catalogo',
    title: 'Preparaciones: lo que se repite en casa',
    body: 'Guarda aquí las comidas habituales con sus alimentos principales, cuánto lleva cada uno, a quién cubre y las variantes por persona. Desde el menú se copian a cualquier fecha.',
    tip: 'Cambiar una preparación del catálogo no toca las comidas ya asignadas: cada fecha conserva su nombre y sus cantidades.'
  },
  {
    page: 'personas',
    title: 'Quiénes comen en casa',
    body: 'Registra a cada persona, los alimentos que no puede comer y sus cantidades habituales. También puedes marcar ausencias por fecha y comida cuando alguien no come en casa.',
    tip: 'Con las restricciones y las ausencias puestas, la propuesta automática deja de ofrecer comidas incompatibles.'
  },
  {
    page: 'productos',
    title: 'Los productos que quieres controlar',
    body: 'Cada alimento tiene dos unidades: la de control, con la que cuentas lo que hay en casa, y la de compra, con la que lo compras en el colmado o el supermercado.',
    tip: 'Si cuentas y compras en la misma unidad —el huevo, por ejemplo— no hay nada más que configurar.'
  },
  {
    page: 'productos',
    title: 'Cuando contar y comprar no usan la misma medida',
    body: 'El salami lo cuentas por ruedas pero lo compras por paquetes. Dile a la app cuántas ruedas trae un paquete: eso es una equivalencia, y se configura con el botón Equivalencia de cada producto.',
    tip: 'La app nunca adivina una conversión. Sin la equivalencia te avisa de que la lista está incompleta, en vez de darte un número equivocado.'
  },
  {
    page: 'compras',
    title: 'La compra sale del menú',
    body: 'Eliges una quincena o unas fechas y la app calcula lo que hace falta: lo que pide el menú menos lo que ya tienes. Revisas la lista y confirmas con las cantidades que realmente compraste.',
    tip: 'La lista sugerida no cambia nada. Solo la compra confirmada aumenta las existencias.'
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
    body: 'Un buen orden para empezar: crea tus productos, añade a las personas de la casa, guarda dos o tres preparaciones y arma la primera semana del menú.',
    tip: 'Puedes volver a abrir este recorrido cuando quieras desde Productos y datos → Cómo funciona.'
  }
];
