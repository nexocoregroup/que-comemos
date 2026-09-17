// La casa de ejemplo: lo que ve alguien que abre la app por primera vez.
//
// Tiene que enseñar lo que la app hace, y la app hace tres cosas: guardar
// quiénes son, guardar lo que se prepara y lo que se compra siempre, y dejar
// escrito qué se come cada día. Nada se llena solo, así que el ejemplo tampoco
// puede fingir que sí: las comidas de abajo están puestas una por una, que es
// exactamente lo que hará quien use la app.
//
// Se planifican doce días desde hoy —una semana y media— en vez del mes entero.
// Un calendario completo daría la impresión de que hay que llenarlo todo antes
// de empezar, y es justo al revés: se planifica lo que se sabe y lo demás
// espera.

import { addDays, addProduct, agregarALista, agregarHabitual, anotarComidaSuelta, crearLista, createEmptyState, makeRecipePlan, reutilizarComida, setEquivalence, setStatusPlan, todayISO, upsertPerson, upsertRecipe } from './model.js';

export function createDemoState() {
  const state = createEmptyState();
  state.demo = true;
  const add = (name, controlUnit, purchaseUnit = controlUnit, category = 'otros') => addProduct(state, { name, controlUnit, purchaseUnit, category, origin: 'catalogo' }).id;
  const platano = add('Plátano maduro', 'unidad', 'unidad', 'viveres');
  const huevo = add('Huevo', 'unidad', 'unidad', 'lacteos');
  const arroz = add('Arroz', 'taza', 'lb', 'granos');
  const carne = add('Carne', 'lb', 'lb', 'carnes');
  const salami = add('Salami', 'rueda', 'paquete', 'embutidos');
  const jamon = add('Jamón', 'rebanada', 'paquete', 'embutidos');
  const atun = add('Atún', 'lata', 'lata', 'mar');
  const pan = add('Pan', 'rebanada', 'paquete', 'panes');
  setEquivalence(state, salami, 'paquete', 16);
  setEquivalence(state, jamon, 'paquete', 12);
  setEquivalence(state, pan, 'paquete', 12);

  const ana = upsertPerson(state, { name: 'Ana · ejemplo', restrictions: [], habitual: [] }).id;
  const luis = upsertPerson(state, { name: 'Luis · ejemplo', restrictions: [], habitual: [] }).id;
  const nina = upsertPerson(state, { name: 'Niña · ejemplo', restrictions: [], habitual: [{ productId: huevo, quantity: 2, unit: 'unidad' }] }).id;
  const nino = upsertPerson(state, { name: 'Niño · ejemplo', restrictions: [], habitual: [{ productId: salami, quantity: 4, unit: 'rueda' }] }).id;

  // Las preparaciones del ejemplo llevan alimentos porque así se ve para qué
  // sirven —avisar de una restricción, recordar qué hace falta—, pero ninguna
  // lleva porciones: no son obligatorias y el ejemplo no debe sugerir que lo
  // sean.
  const recipe = (name, uses, items, note = '') => upsertRecipe(state, { name, uses, items, note }).id;
  const eggsHam = recipe('Huevos con jamón', ['desayuno', 'cena'], [
    { productId: huevo, quantity: 4, unit: 'unidad' }, { productId: jamon, quantity: 4, unit: 'rebanada' }
  ]);
  const riceMeat = recipe('Arroz con carne', ['almuerzo', 'cena'], [
    { productId: arroz, quantity: 3, unit: 'taza' }, { productId: carne, quantity: 1, unit: 'lb' }
  ], 'Preparar el arroz y la carne para quienes comen en casa.');
  const plantain = recipe('Plátano maduro con acompañamientos', ['desayuno', 'cena'], [
    { productId: platano, quantity: 1, unit: 'unidad' },
    { productId: huevo, quantity: 2, unit: 'unidad', personId: nina },
    { productId: salami, quantity: 4, unit: 'rueda', personId: nino }
  ], 'Ejemplo: guardar la mitad del plátano para el desayuno siguiente.');
  const tunaRice = recipe('Arroz con atún', ['almuerzo', 'cena'], [
    { productId: arroz, quantity: 2, unit: 'taza' }, { productId: atun, quantity: 2, unit: 'lata' }
  ]);
  const sandwich = recipe('Sándwich de jamón', ['desayuno', 'cena'], [
    { productId: pan, quantity: 4, unit: 'rebanada' }, { productId: jamon, quantity: 4, unit: 'rebanada' }
  ]);
  const merienda = recipe('Fruta y galletas', ['merienda-manana', 'merienda-tarde'], [], 'Lo que haya. La merienda es opcional: hay días que nadie meriendo.');

  /* ── Doce días puestos a mano ────────────────────────────────────────────

     Ni todos los desayunos son iguales ni están todas las casillas llenas, y
     las dos cosas son a propósito. Un ejemplo perfecto enseña una app que nadie
     tiene; lo que se parece a una casa es esto: la mayoría de los días
     resueltos, un domingo fuera, dos meriendas anotadas y unos cuantos huecos
     que todavía no se han decidido. */

  const hoy = todayISO();
  const dia = n => addDays(hoy, n);
  const poner = (recetaId, n, slot) => makeRecipePlan(state, recetaId, dia(n), slot, null, null, 'manual');

  // El hueco del día siguiente no es un olvido: lo llena más abajo lo que sobra
  // de la cena de hoy.
  const desayunos = [plantain, null, sandwich, plantain, eggsHam, plantain, sandwich, eggsHam, plantain, sandwich];
  desayunos.forEach((receta, n) => { if (receta) poner(receta, n, 'desayuno'); });

  const almuerzos = [riceMeat, tunaRice, riceMeat, riceMeat, tunaRice, null, riceMeat, tunaRice, riceMeat, null, riceMeat];
  almuerzos.forEach((receta, n) => { if (receta) poner(receta, n, 'almuerzo'); });

  const cenas = [plantain, sandwich, eggsHam, null, sandwich, riceMeat, plantain, null, sandwich];
  // El hueco del cuarto día tampoco es un olvido: ahí va la comida escrita a mano.
  cenas.forEach((receta, n) => { if (receta) poner(receta, n, 'cena'); });

  // Dos meriendas y nada más: son opcionales y un día sin merienda está
  // completo igual. Ponerlas los doce días haría creer lo contrario.
  poner(merienda, 1, 'merienda-tarde');
  poner(merienda, 4, 'merienda-manana');

  // Un día que no se cocina en casa, marcado como lo que es: una excepción de
  // ese día, no una costumbre que vuelva sola el mes que viene.
  setStatusPlan(state, dia(5), 'almuerzo', 'outside', null, 'excepcion');

  // Lo que sobra de una comida y se come otro día. No se apunta cuánto: eso lo
  // sabe quien cocinó, y la app dejó de llevar la cuenta de la despensa.
  const cena = state.plans.find(plan => plan.date === dia(0) && plan.slot === 'cena');
  reutilizarComida(state, cena.id, dia(1), 'desayuno', [nina, nino]);

  // Y una comida escrita a mano: lo que se come un día suelto y no está en el
  // catálogo de la casa porque no se va a repetir.
  anotarComidaSuelta(state, dia(3), 'cena', {
    titulo: 'Lo que quedó del sancocho de la vecina · ejemplo',
    nota: 'Calentar a fuego lento y echarle un poco de agua.'
  });

  /* ── Lo que esta casa compra siempre ─────────────────────────────────────

     Un catálogo de nombres por rubro, sin cantidades del mes. La cantidad se
     decide en el supermercado, delante del estante, y no un martes de hace tres
     meses: por eso ninguno de estos lleva número. */

  const habitual = (productId, rubro) => agregarHabitual(state, { productId, rubro });
  habitual(arroz, 'granos');
  habitual(huevo, 'lacteos');
  habitual(carne, 'proteinas');
  habitual(platano, 'viveres');
  habitual(salami, 'proteinas');
  habitual(atun, 'proteinas');
  habitual(pan, 'desayunos');

  // Y una lista a medio escribir, que es como se encuentra una lista de verdad:
  // tres cosas apuntadas con la cantidad de esta vez, ninguna tachada todavía.
  const lista = crearLista(state, { fecha: hoy, nombre: 'La compra del sábado · ejemplo' });
  agregarALista(state, lista.id, { productId: arroz, cantidad: 5, unidad: 'lb' });
  agregarALista(state, lista.id, { productId: huevo, cantidad: 30, unidad: 'unidad' });
  agregarALista(state, lista.id, { productId: salami, cantidad: 1, unidad: 'paquete' });

  state.manualItems.push({ id: `otro-${++state.seq}`, name: 'Detergente · ejemplo', quantity: '', done: false });
  return state;
}
