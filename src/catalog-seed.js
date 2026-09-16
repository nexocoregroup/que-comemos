// Catálogo de arranque. No llena la casa con nada —ni existencias, ni canasta,
// ni menú—: lo único que evita es teclear desde cero los mismos ochenta
// alimentos que hay en cualquier despensa dominicana. Quien empieza elige de
// esta lista lo que de verdad compra y sigue; el resto no existe hasta que
// alguien lo pida.
//
// Los alias son la mitad útil del archivo. El mismo alimento llega escrito de
// cinco formas distintas según quién lo escriba: dictado sin tildes, en plural,
// con el nombre de la otra punta del país, o abreviado a diez caracteres como
// se anota en una lista de mandado a la carrera («plat mad», «huevo bla»). Sin
// los alias, cada una de esas formas crearía un producto nuevo y el inventario
// quedaría repartido en cuatro fichas del mismo arroz. La comparación
// normaliza, así que aquí se escriben todos en minúsculas.

// Categorías, en el orden en que se muestran al elegir productos habituales.
export const CATEGORIES = [
  { id: 'viveres',   label: 'Víveres',              emoji: '🍠' },
  { id: 'granos',    label: 'Arroz, pastas y granos', emoji: '🍚' },
  { id: 'carnes',    label: 'Carnes',               emoji: '🥩' },
  { id: 'embutidos', label: 'Embutidos',            emoji: '🌭' },
  { id: 'mar',       label: 'Pescados y enlatados', emoji: '🐟' },
  { id: 'lacteos',   label: 'Huevos y lácteos',     emoji: '🥚' },
  { id: 'panes',     label: 'Panes y cereales',     emoji: '🍞' },
  { id: 'frutas',    label: 'Frutas',               emoji: '🍌' },
  { id: 'vegetales', label: 'Vegetales',            emoji: '🥬' },
  { id: 'condimentos', label: 'Condimentos y aceites', emoji: '🧂' },
  { id: 'bebidas',   label: 'Bebidas',              emoji: '🧃' },
  { id: 'limpieza',  label: 'Limpieza',             emoji: '🧽' },
  { id: 'higiene',   label: 'Higiene',              emoji: '🧼' },
  { id: 'otros',     label: 'Otros',                emoji: '📦' }
];

// Los ocho rubros con los que se registra la canasta base, en el orden en que
// se preguntan.
//
// No sustituyen a las categorías de arriba: las agrupan. Un alimento sigue
// guardando su categoría fina —«embutidos», «mar», «higiene»— porque es la que
// usan la ficha del alimento, los filtros de «Alimentos de la casa» y los
// respaldos que ya existen; cambiarla dejaría huérfano lo que la gente ya tiene
// guardado. El rubro es solo cómo se enseñan al registrarlos por primera vez.
//
// `unidad` es la medida que se le sugiere a un alimento escrito a mano en ese
// rubro, cuando no hay nada mejor de dónde sacarla. Es una sugerencia, no una
// decisión: se puede cambiar después desde la ficha del alimento.
//
// Toda categoría tiene que estar en exactamente un rubro. Si no, sus alimentos
// no aparecerían en ninguna pantalla y nadie podría marcarlos. Hay una prueba
// que lo comprueba, porque es el fallo que no se ve mirando.
export const RUBROS = [
  { id: 'viveres',   titulo: 'Víveres',                    emoji: '🍠', categorias: ['viveres'],    unidad: 'lb' },
  { id: 'granos',    titulo: 'Arroz, granos y pastas',     emoji: '🍚', categorias: ['granos'],     unidad: 'lb' },
  { id: 'proteinas', titulo: 'Carnes y proteínas',         emoji: '🥩', categorias: ['carnes', 'embutidos', 'mar'], unidad: 'lb' },
  { id: 'lacteos',   titulo: 'Lácteos y derivados',        emoji: '🥚', categorias: ['lacteos'],    unidad: 'unidad' },
  { id: 'frutas',    titulo: 'Frutas',                     emoji: '🍌', categorias: ['frutas'],     unidad: 'unidad' },
  { id: 'vegetales', titulo: 'Vegetales',                  emoji: '🥬', categorias: ['vegetales'],  unidad: 'lb' },
  { id: 'desayunos', titulo: 'Desayunos y meriendas',      emoji: '🍞', categorias: ['panes'],      unidad: 'paquete' },
  { id: 'otros',     titulo: 'Otros productos habituales', emoji: '📦', categorias: ['condimentos', 'bebidas', 'limpieza', 'higiene', 'otros'], unidad: 'unidad' }
];

export const rubroPorIndice = indice => RUBROS[Math.min(RUBROS.length - 1, Math.max(0, Number(indice) || 0))];

// `controlUnit` es cómo se cuenta el alimento en casa y `purchaseUnit` cómo lo
// despachan en el colmado: no siempre coinciden, y esa diferencia es justo la
// que la app tiene que preguntar una vez —el salami se cuenta en ruedas pero se
// compra entero, el ajo se cuenta por cabezas y se pesa—, el día que haga falta
// para una compra y no el primer día.
export const SEED_PRODUCTS = [
  { name: 'Plátano maduro', category: 'viveres', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['platano maduro', 'plátanos maduros', 'plat mad', 'maduros'], common: true },
  { name: 'Plátano verde', category: 'viveres', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['platano verde', 'plátanos verdes', 'plat ver', 'verdes'], common: true },
  { name: 'Guineo verde', category: 'viveres', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['guineos verdes', 'guineo ver', 'guin ver', 'guineitos'], common: false },
  { name: 'Yuca', category: 'viveres', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['yucas', 'yuca criolla', 'yuc crio', 'yuca fresca'], common: true },
  { name: 'Yautía', category: 'viveres', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['yautia', 'yautias', 'yautía blanca', 'yaut bla'], common: false },
  { name: 'Batata', category: 'viveres', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['batatas', 'batata mameya', 'bat mam', 'boniato'], common: false },
  { name: 'Papa', category: 'viveres', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['papas', 'patata', 'papa blanca', 'pap blanc'], common: true },
  { name: 'Ñame', category: 'viveres', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['name', 'ñames', 'name de agua', 'nam agua'], common: false },
  { name: 'Auyama', category: 'viveres', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['auyamas', 'calabaza', 'ahuyama', 'auyama lb'], common: true },
  { name: 'Mapuey', category: 'viveres', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['mapueyes', 'mapuey morado', 'map mor', 'mapuei'], common: false },
  { name: 'Rulo', category: 'viveres', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['rulos', 'platano rulo', 'plat rulo', 'rulo verde'], common: false },

  { name: 'Arroz', category: 'granos', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['arroz blanco', 'arroz selecto', 'arroz sel', 'aroz'], common: true },
  { name: 'Habichuelas rojas', category: 'granos', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['habichuela roja', 'habichuelas coloradas', 'frijoles rojos', 'hab rojas'], common: true },
  { name: 'Habichuelas negras', category: 'granos', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['habichuela negra', 'frijoles negros', 'habichuelas prietas', 'hab negras'], common: true },
  { name: 'Habichuelas blancas', category: 'granos', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['habichuela blanca', 'frijoles blancos', 'habichuelas de sopa', 'hab blancas'], common: false },
  { name: 'Habichuelas pintas', category: 'granos', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['habichuela pinta', 'frijoles pintos', 'habichuelas rosadas', 'hab pintas'], common: false },
  { name: 'Guandules', category: 'granos', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['gandules', 'guandul', 'guandules verdes', 'guand ver'], common: true },
  { name: 'Lentejas', category: 'granos', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['lenteja', 'lentejas secas', 'lent secas', 'lenteja lb'], common: false },
  { name: 'Garbanzos', category: 'granos', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['garbanzo', 'garbanzos secos', 'garb secos', 'garbanzo lb'], common: false },
  { name: 'Espaguetis', category: 'granos', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['espagueti', 'spaghetti', 'espagueti largo', 'espag larg'], common: true },
  { name: 'Coditos', category: 'granos', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['codito', 'macarrones', 'pasta codito', 'codit pasta'], common: false },
  { name: 'Fideos', category: 'granos', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['fideo', 'fideos finos', 'fid finos', 'cabello de angel'], common: false },
  { name: 'Harina de maíz', category: 'granos', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['harina de maiz', 'harina maiz', 'har maiz', 'maiz molido'], common: false },
  { name: 'Harina de trigo', category: 'granos', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['harina blanca', 'har trigo', 'harina panadera', 'harina de pan'], common: false },
  { name: 'Fécula de maíz', category: 'granos', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['maicena', 'fecula de maiz', 'almidon de maiz', 'fec maiz'], common: false },

  { name: 'Pollo', category: 'carnes', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['pollo entero', 'pollo fresco', 'poll ent', 'pollos'], common: true },
  { name: 'Muslos de pollo', category: 'carnes', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['muslo de pollo', 'muslos', 'musl pollo', 'muslo pollo'], common: true },
  { name: 'Pechuga de pollo', category: 'carnes', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['pechuga', 'pechugas de pollo', 'pech pollo', 'pechuga deshuesada'], common: false },
  { name: 'Alitas de pollo', category: 'carnes', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['alita de pollo', 'alitas', 'alit pollo', 'alas de pollo'], common: false },
  { name: 'Carne molida', category: 'carnes', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['molida', 'carne molida de res', 'carn molida', 'res molida'], common: true },
  { name: 'Bistec de res', category: 'carnes', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['bistec', 'bistek', 'bist res', 'bisteces'], common: false },
  { name: 'Res para guisar', category: 'carnes', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['carne de res', 'res guisada', 'res guis', 'carne para guisar'], common: false },
  { name: 'Cerdo', category: 'carnes', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['carne de cerdo', 'puerco', 'cerd lb', 'carne de puerco'], common: true },
  { name: 'Chuleta de cerdo', category: 'carnes', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['chuleta', 'chuletas', 'chul cerdo', 'chuleta ahumada'], common: false },
  { name: 'Costillas de cerdo', category: 'carnes', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['costilla de cerdo', 'costillas', 'cost cerdo', 'costilla de puerco'], common: false },
  { name: 'Chicharrón de cerdo', category: 'carnes', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['chicharron', 'chicharrones', 'chich cerdo', 'chicharron de puerco'], common: false },
  { name: 'Hígado de res', category: 'carnes', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['higado', 'higado de res', 'hig res', 'higados'], common: false },

  // El salami es el caso que obligó a separar las dos unidades: se compra
  // entero y se consume en ruedas, y cuántas ruedas salen depende del grosor
  // con que corte cada casa.
  { name: 'Salami', category: 'embutidos', controlUnit: 'rueda', purchaseUnit: 'paquete', aliases: ['salamis', 'salami industrial', 'salami ind', 'salami de res'], common: true },
  { name: 'Jamón', category: 'embutidos', controlUnit: 'rebanada', purchaseUnit: 'paquete', aliases: ['jamon', 'jamones', 'jamon cocido', 'jam coc'], common: true },
  { name: 'Salchicha', category: 'embutidos', controlUnit: 'unidad', purchaseUnit: 'lata', aliases: ['salchichas', 'salchicha en lata', 'salch lata', 'salchichas viena'], common: true },
  { name: 'Mortadela', category: 'embutidos', controlUnit: 'rebanada', purchaseUnit: 'paquete', aliases: ['mortadelas', 'mortadela de pollo', 'mort pollo', 'mortadela rebanada'], common: false },
  { name: 'Salchichón', category: 'embutidos', controlUnit: 'rueda', purchaseUnit: 'paquete', aliases: ['salchichon', 'salchichones', 'salchichon industrial', 'salch chon'], common: false },
  { name: 'Longaniza', category: 'embutidos', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['longanizas', 'longaniza criolla', 'long crio', 'longaniza de cerdo'], common: false },
  { name: 'Chorizo', category: 'embutidos', controlUnit: 'unidad', purchaseUnit: 'paquete', aliases: ['chorizos', 'chorizo espanol', 'chor esp', 'chorizo curado'], common: false },
  { name: 'Tocineta', category: 'embutidos', controlUnit: 'rebanada', purchaseUnit: 'paquete', aliases: ['tocinetas', 'bacon', 'tocineta ahumada', 'tocin ahum'], common: false },
  { name: 'Jamón de pavo', category: 'embutidos', controlUnit: 'rebanada', purchaseUnit: 'paquete', aliases: ['jamon de pavo', 'jamon pavo', 'jam pavo', 'pavo rebanado'], common: false },
  { name: 'Salami de pollo', category: 'embutidos', controlUnit: 'rueda', purchaseUnit: 'paquete', aliases: ['salami pollo', 'sal pollo', 'salami de ave', 'salami blanco'], common: false },
  { name: 'Pepperoni', category: 'embutidos', controlUnit: 'rueda', purchaseUnit: 'paquete', aliases: ['peperoni', 'pepperonis', 'pepperoni rebanado', 'pepper reb'], common: false },

  { name: 'Atún', category: 'mar', controlUnit: 'lata', purchaseUnit: 'lata', aliases: ['atun', 'atunes', 'atun en agua', 'atun lom'], common: true },
  { name: 'Sardinas', category: 'mar', controlUnit: 'lata', purchaseUnit: 'lata', aliases: ['sardina', 'sardinas en salsa', 'sard tom', 'sardina en aceite'], common: true },
  { name: 'Bacalao', category: 'mar', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['bacalao seco', 'bacalaos', 'bacal seco', 'bacalao salado'], common: false },
  { name: 'Arenque', category: 'mar', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['arenques', 'arenque ahumado', 'aren ahum', 'arenque salado'], common: false },
  { name: 'Filete de pescado', category: 'mar', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['filete pescado', 'filetes de pescado', 'fil pesc', 'pescado en filete'], common: false },
  { name: 'Chillo', category: 'mar', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['chillos', 'pargo', 'chillo entero', 'chill ent'], common: false },
  { name: 'Mero', category: 'mar', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['meros', 'mero en rueda', 'mer rued', 'mero fresco'], common: false },
  { name: 'Carite', category: 'mar', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['carites', 'carite en rueda', 'car rued', 'carite fresco'], common: false },
  { name: 'Camarones', category: 'mar', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['camaron', 'camarones pelados', 'cam pel', 'camarones congelados'], common: false },
  { name: 'Salmón', category: 'mar', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['salmon', 'salmones', 'salmon fresco', 'salm fres'], common: false },
  { name: 'Calamares', category: 'mar', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['calamar', 'calamares en anillo', 'calam anil', 'calamar fresco'], common: false },
  { name: 'Carne enlatada', category: 'mar', controlUnit: 'lata', purchaseUnit: 'lata', aliases: ['jamonilla', 'carne en lata', 'carne enlat', 'jamoneta'], common: false },

  // Los huevos se venden por cartón pero en casa se cuentan de uno en uno, que
  // es como se gastan: contar cartones obligaría a hablar en fracciones para
  // decir que quedan tres.
  { name: 'Huevos', category: 'lacteos', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['huevo', 'huevos blancos', 'huevo bla', 'carton de huevos'], common: true },
  { name: 'Leche', category: 'lacteos', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['leche entera', 'leche de caja', 'lech ent', 'leche liquida'], common: true },
  { name: 'Leche en polvo', category: 'lacteos', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['leche polvo', 'lech polvo', 'polvo de leche', 'leche en polvo entera'], common: false },
  { name: 'Leche evaporada', category: 'lacteos', controlUnit: 'lata', purchaseUnit: 'lata', aliases: ['evaporada', 'lech evap', 'leche evap', 'evaporada en lata'], common: false },
  { name: 'Leche condensada', category: 'lacteos', controlUnit: 'lata', purchaseUnit: 'lata', aliases: ['condensada', 'lech cond', 'leche cond', 'leche condensada azucarada'], common: false },
  { name: 'Queso de freír', category: 'lacteos', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['queso de freir', 'queso freir', 'q freir', 'queso frito'], common: true },
  { name: 'Queso rallado', category: 'lacteos', controlUnit: 'taza', purchaseUnit: 'paquete', aliases: ['queso rayado', 'q rallado', 'ques rall', 'queso en polvo'], common: false },
  { name: 'Queso amarillo', category: 'lacteos', controlUnit: 'rebanada', purchaseUnit: 'paquete', aliases: ['queso cheddar', 'q amarillo', 'ques amar', 'queso en lonjas'], common: false },
  { name: 'Queso de hoja', category: 'lacteos', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['queso hoja', 'ques hoja', 'queso blanco', 'queso del campo'], common: false },
  { name: 'Mantequilla', category: 'lacteos', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['mantequillas', 'mantequilla con sal', 'mant sal', 'manteq'], common: true },
  { name: 'Margarina', category: 'lacteos', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['margarinas', 'margarina vegetal', 'marg veg', 'margar'], common: false },
  // En el colmado y en la casa se dice «yogurt», con t. Se escribe así y «yogur»
  // queda de alias, no al revés. Los sabores entran como alias del mismo
  // alimento: quien compra el de fresa no lleva otra cosa, lleva yogurt.
  { name: 'Yogurt', category: 'lacteos', controlUnit: 'unidad', purchaseUnit: 'paquete', aliases: ['yogur', 'yogures', 'yoghurt', 'yogurt natural', 'yogurt de fresa', 'yogur de fresa', 'yog nat'], common: true },
  { name: 'Queso gouda', category: 'lacteos', controlUnit: 'rebanada', purchaseUnit: 'paquete', aliases: ['gouda', 'queso guda', 'ques gouda', 'gouda en lonjas'], common: false },
  { name: 'Crema de leche', category: 'lacteos', controlUnit: 'lata', purchaseUnit: 'lata', aliases: ['crema leche', 'nata', 'crem leche', 'crema espesa'], common: false },

  { name: 'Pan', category: 'panes', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['panes', 'pan de agua', 'pan agua', 'pan corriente'], common: true },
  { name: 'Pan de sándwich', category: 'panes', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['pan de sandwich', 'pan sandwich', 'pan de molde', 'pan sand'], common: false },
  { name: 'Pan sobao', category: 'panes', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['pan sobado', 'panes sobao', 'pan sob', 'sobao'], common: false },
  { name: 'Pan integral', category: 'panes', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['pan de trigo integral', 'pan integ', 'pan int', 'panes integrales'], common: false },
  { name: 'Galletas de soda', category: 'panes', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['galleta de soda', 'galletas soda', 'gall soda', 'soda en paquete'], common: true },
  { name: 'Galletas dulces', category: 'panes', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['galleta dulce', 'galletas de leche', 'gall dulc', 'galletitas'], common: false },
  { name: 'Avena', category: 'panes', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['avena en hojuelas', 'hojuelas de avena', 'aven hoj', 'avenas'], common: false },
  { name: 'Cereal', category: 'panes', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['cereales', 'hojuelas de maiz', 'cer maiz', 'cereal de desayuno'], common: false },
  { name: 'Casabe', category: 'panes', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['casabes', 'casabe de yuca', 'casab yuca', 'torta de casabe'], common: false },
  // Eran un solo «Tortillas» con las dos clases metidas en los alias, y así el
  // que come las de maíz y el que come las de harina llevaban la cuenta en la
  // misma ficha. Son dos compras distintas, en estantes distintos y a precios
  // distintos: van separadas. Ningún alias dice solo «tortilla», porque a secas
  // no se sabe cuál de las dos es y adivinar sería peor que preguntar.
  { name: 'Tortillas de maíz', category: 'panes', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['tortilla de maiz', 'tortillas de maiz', 'tort maiz', 'tortillas mexicanas'], common: false },
  { name: 'Tortillas de harina', category: 'panes', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['tortilla de harina', 'tortillas de harina', 'tort harina', 'tortilla de trigo'], common: false },

  { name: 'Guineo', category: 'frutas', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['guineos', 'banana', 'platano fruta', 'guin mad'], common: true },
  { name: 'Lechosa', category: 'frutas', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['papaya', 'lechosas', 'lechoza', 'lech fruta'], common: false },
  { name: 'Piña', category: 'frutas', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['pina', 'piñas', 'pina fresca', 'pin fres'], common: false },
  { name: 'Naranja', category: 'frutas', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['naranjas', 'naranja dulce', 'naran dul', 'naranja de jugo'], common: false },
  { name: 'Limón', category: 'frutas', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['limon', 'limones', 'limon criollo', 'lim crio'], common: true },
  { name: 'Mango', category: 'frutas', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['mangos', 'mango banilejo', 'mang ban', 'mangos maduros'], common: false },
  { name: 'Aguacate', category: 'frutas', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['aguacates', 'avocado', 'aguac', 'aguacate criollo'], common: false },
  { name: 'Chinola', category: 'frutas', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['maracuya', 'chinolas', 'parcha', 'chinol'], common: false },
  { name: 'Sandía', category: 'frutas', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['sandia', 'patilla', 'sandias', 'melon de agua'], common: false },
  { name: 'Melón', category: 'frutas', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['melon', 'melones', 'melon cantalupo', 'melo cant'], common: false },
  { name: 'Manzana', category: 'frutas', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['manzanas', 'manzana roja', 'manz roja', 'manzana verde'], common: false },
  { name: 'Uvas', category: 'frutas', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['uva', 'uvas rojas', 'uv rojas', 'uva verde'], common: false },
  { name: 'Coco', category: 'frutas', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['cocos', 'coco seco', 'coc seco', 'coco verde'], common: false },

  { name: 'Cebolla', category: 'vegetales', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['cebollas', 'cebolla roja', 'ceb roja', 'cebolla blanca'], common: true },
  // El ajo se cuenta por cabezas y se despacha por peso: la equivalencia entre
  // las dos la pone cada quien, porque una cabeza no pesa igual todo el año.
  { name: 'Ajo', category: 'vegetales', controlUnit: 'unidad', purchaseUnit: 'lb', aliases: ['ajos', 'cabeza de ajo', 'ajo criollo', 'aj crio'], common: true },
  { name: 'Ají cubanela', category: 'vegetales', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['aji cubanela', 'cubanela', 'ajies cubanela', 'aji cub'], common: true },
  { name: 'Ají gustoso', category: 'vegetales', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['aji gustoso', 'ajicito', 'ajies gustosos', 'aji gust'], common: false },
  { name: 'Tomate', category: 'vegetales', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['tomates', 'tomate de ensalada', 'tom ensa', 'tomate fresco'], common: true },
  { name: 'Zanahoria', category: 'vegetales', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['zanahorias', 'zanahoria fresca', 'zanah fres', 'zanaoria'], common: false },
  { name: 'Repollo', category: 'vegetales', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['repollos', 'col', 'repollo blanco', 'repoll bla'], common: false },
  { name: 'Lechuga', category: 'vegetales', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['lechugas', 'lechuga americana', 'lechug amer', 'lechuga fresca'], common: false },
  { name: 'Pepino', category: 'vegetales', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['pepinos', 'pepino fresco', 'pepin fres', 'pepino de ensalada'], common: false },
  { name: 'Tayota', category: 'vegetales', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['chayote', 'tayotas', 'tayot', 'tallota'], common: false },
  { name: 'Berenjena', category: 'vegetales', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['berenjenas', 'berenjena morada', 'beren mor', 'berejena'], common: false },
  { name: 'Molondrón', category: 'vegetales', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['molondrones', 'okra', 'quimbombo', 'molond'], common: false },
  { name: 'Cilantro ancho', category: 'vegetales', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['culantro', 'cilantro ancho', 'recao', 'cil ancho'], common: true },
  { name: 'Cilantro', category: 'vegetales', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['cilantrico', 'cilantro fino', 'cil fino', 'cilantros'], common: false },
  { name: 'Maíz enlatado', category: 'vegetales', controlUnit: 'lata', purchaseUnit: 'lata', aliases: ['maiz dulce', 'maiz en lata', 'maiz enlat', 'maiz en grano'], common: false },
  { name: 'Petit pois', category: 'vegetales', controlUnit: 'lata', purchaseUnit: 'lata', aliases: ['petipua', 'guisantes', 'arvejas', 'petit poi'], common: false },

  { name: 'Aceite', category: 'condimentos', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['aceite vegetal', 'aceite de soya', 'aceit veg', 'aceite comestible'], common: true },
  { name: 'Aceite de oliva', category: 'condimentos', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['aceite oliva', 'aceit oliv', 'oliva extra virgen', 'aceite de oliva virgen'], common: false },
  { name: 'Sal', category: 'condimentos', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['sal de mesa', 'sal refinada', 'sal fina', 'sal yodada'], common: true },
  { name: 'Azúcar', category: 'condimentos', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['azucar', 'azucar blanca', 'azuc blanc', 'azucar refinada'], common: true },
  { name: 'Azúcar morena', category: 'condimentos', controlUnit: 'lb', purchaseUnit: 'lb', aliases: ['azucar morena', 'azucar crema', 'azuc mor', 'azucar parda'], common: false },
  { name: 'Vinagre', category: 'condimentos', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['vinagre blanco', 'vinag blan', 'vinagres', 'vinagre de manzana'], common: false },
  { name: 'Salsa de tomate', category: 'condimentos', controlUnit: 'lata', purchaseUnit: 'lata', aliases: ['salsa tomate', 'pasta de tomate', 'sals tom', 'tomate en salsa'], common: true },
  { name: 'Sazón', category: 'condimentos', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['sazon', 'sazon completo', 'saz compl', 'sazonador'], common: true },
  { name: 'Adobo', category: 'condimentos', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['adobo completo', 'adobo en polvo', 'adob compl', 'adobos'], common: false },
  { name: 'Orégano', category: 'condimentos', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['oregano', 'oregano seco', 'oreg moli', 'oregano en polvo'], common: false },
  { name: 'Cubitos', category: 'condimentos', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['cubito', 'caldo en cubo', 'cub pollo', 'cubito de pollo'], common: false },
  { name: 'Mayonesa', category: 'condimentos', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['mayonesas', 'salsa mayonesa', 'mayon', 'mayonesa en pote'], common: false },
  { name: 'Kétchup', category: 'condimentos', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['ketchup', 'catsup', 'salsa ketchup', 'ketch'], common: false },
  { name: 'Salsa china', category: 'condimentos', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['salsa de soya', 'soya liquida', 'sals china', 'salsa soya'], common: false },
  { name: 'Bija', category: 'condimentos', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['achiote', 'bija molida', 'color de comida', 'bij mol'], common: false },
  { name: 'Leche de coco', category: 'condimentos', controlUnit: 'lata', purchaseUnit: 'lata', aliases: ['coco en lata', 'lech coco', 'crema de coco', 'leche coco'], common: false },

  { name: 'Agua', category: 'bebidas', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['agua potable', 'botellon de agua', 'agua purificada', 'agua bot'], common: true },
  { name: 'Café', category: 'bebidas', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['cafe', 'cafe molido', 'caf moli', 'cafe en polvo'], common: true },
  { name: 'Jugo', category: 'bebidas', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['jugos', 'jugo de naranja', 'jug nara', 'nectar de fruta'], common: false },
  { name: 'Refresco', category: 'bebidas', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['refrescos', 'soda', 'gaseosa', 'refres'], common: false },
  { name: 'Malta', category: 'bebidas', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['maltas', 'malta morena', 'malt mor', 'malta en botella'], common: false },
  { name: 'Jugo en polvo', category: 'bebidas', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['refresco en polvo', 'jug polvo', 'sobre de jugo', 'jugo instantaneo'], common: false },
  { name: 'Té', category: 'bebidas', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['te en bolsitas', 'bolsitas de te', 'te verde', 'te negro'], common: false },
  { name: 'Chocolate en barra', category: 'bebidas', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['chocolate de agua', 'chocolate en bola', 'choc barra', 'cacao en barra'], common: false },
  { name: 'Cerveza', category: 'bebidas', controlUnit: 'unidad', purchaseUnit: 'paquete', aliases: ['cervezas', 'cerveza en botella', 'cerv bot', 'birra'], common: false },
  { name: 'Ron', category: 'bebidas', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['rones', 'ron anejo', 'ron blanco', 'ron bot'], common: false },

  { name: 'Detergente', category: 'limpieza', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['detergente en polvo', 'jabon de lavar', 'deterg polvo', 'det polvo'], common: true },
  { name: 'Jabón de cuaba', category: 'limpieza', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['jabon de cuaba', 'cuaba', 'jab cuaba', 'jabon azul'], common: true },
  { name: 'Cloro', category: 'limpieza', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['cloro liquido', 'blanqueador', 'lejia', 'clor liq'], common: true },
  { name: 'Suavizante', category: 'limpieza', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['suavizante de tela', 'suaviz tela', 'suavizantes', 'ablandador de ropa'], common: false },
  { name: 'Lavaplatos', category: 'limpieza', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['lavaplatos liquido', 'jabon de fregar', 'lavapl liq', 'fregador'], common: false },
  { name: 'Esponja', category: 'limpieza', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['esponjas', 'esponja de fregar', 'espon fregar', 'esponjilla'], common: false },
  { name: 'Desinfectante', category: 'limpieza', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['desinfectante de piso', 'limpiador de piso', 'desinf piso', 'desinfectantes'], common: false },
  { name: 'Papel toalla', category: 'limpieza', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['toalla de papel', 'papel absorbente', 'pap toalla', 'papel de cocina'], common: false },
  { name: 'Fundas de basura', category: 'limpieza', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['funda de basura', 'bolsas de basura', 'fund basura', 'fundas plasticas'], common: false },
  { name: 'Suape', category: 'limpieza', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['mapo', 'trapeador', 'suape de piso', 'suap piso'], common: false },
  { name: 'Ambientador', category: 'limpieza', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['ambientadores', 'aromatizante', 'ambient spray', 'desodorante ambiental'], common: false },
  { name: 'Insecticida', category: 'limpieza', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['insecticidas', 'mata insectos', 'spray de insectos', 'insect spray'], common: false },

  { name: 'Papel higiénico', category: 'higiene', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['papel higienico', 'papel de bano', 'papel sanitario', 'pap higie'], common: true },
  { name: 'Jabón de baño', category: 'higiene', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['jabon de bano', 'jabon de tocador', 'jab bano', 'jabon de barra'], common: true },
  { name: 'Pasta dental', category: 'higiene', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['crema dental', 'pasta de dientes', 'past dent', 'pasta dientes'], common: true },
  { name: 'Cepillo de dientes', category: 'higiene', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['cepillo dental', 'cepillos de dientes', 'cep dental', 'cepillo de boca'], common: false },
  { name: 'Champú', category: 'higiene', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['champu', 'shampoo', 'chanpu', 'sham pelo'], common: false },
  { name: 'Acondicionador', category: 'higiene', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['acondicionadores', 'crema de peinar', 'acond pelo', 'acondicionador de pelo'], common: false },
  { name: 'Desodorante', category: 'higiene', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['desodorantes', 'antitranspirante', 'desod barra', 'desodorante en barra'], common: false },
  { name: 'Toallas sanitarias', category: 'higiene', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['toalla sanitaria', 'toallas femeninas', 'toall sanit', 'toallitas femeninas'], common: false },
  { name: 'Pañales', category: 'higiene', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['panales', 'pañal', 'panales desechables', 'pañ desech'], common: false },
  { name: 'Enjuague bucal', category: 'higiene', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['enjuague de boca', 'enju bucal', 'enjuagues bucales', 'antiseptico bucal'], common: false },
  { name: 'Alcohol', category: 'higiene', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['alcohol de 70', 'alcohol isopropilico', 'alcoh 70', 'alcohol antiseptico'], common: false },

  // El gas entra aquí y no en bebidas ni en limpieza porque se compra con la
  // misma vuelta del mes y se acaba igual de sorpresa que el arroz.
  { name: 'Gas de cocina', category: 'otros', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['gas licuado', 'bombona de gas', 'cilindro de gas', 'gas glp'], common: true },
  { name: 'Fósforos', category: 'otros', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['fosforos', 'cerillas', 'fosf cocina', 'cajita de fosforos'], common: false },
  { name: 'Velas', category: 'otros', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['vela', 'velones', 'velas de luz', 'vel luz'], common: false },
  { name: 'Papel aluminio', category: 'otros', controlUnit: 'unidad', purchaseUnit: 'unidad', aliases: ['papel de aluminio', 'aluminio', 'pap alum', 'papel plata'], common: false },
  { name: 'Servilletas', category: 'otros', controlUnit: 'paquete', purchaseUnit: 'paquete', aliases: ['servilleta', 'servilletas de papel', 'serv papel', 'servilletas de mesa'], common: false }
];

export const seedByCategory = id => SEED_PRODUCTS.filter(item => item.category === id);

// Los alimentos de un rubro, en el orden de sus categorías: dentro de «Carnes y
// proteínas» van primero las carnes, después los embutidos y al final lo del
// mar, que es como se recorre un colmado y no como lo ordenaría el alfabeto.
export const seedByRubro = id => (RUBROS.find(item => item.id === id)?.categorias || []).flatMap(seedByCategory);

// Dónde se guarda un alimento escrito a mano dentro de un rubro: en la primera
// de sus categorías. Es lo que hace que «Fresa», escrita en Frutas, quede en
// Frutas y no en un cajón de sobras.
export const categoriaDelRubro = id => (RUBROS.find(item => item.id === id)?.categorias || ['otros'])[0];

// El rubro donde vive una categoría. Sirve para decirle a quien escribe «Arroz»
// estando en Frutas dónde estaba ya ese alimento, en vez de crear otro.
export const rubroDeCategoria = categoria => RUBROS.find(item => item.categorias.includes(categoria)) || null;
