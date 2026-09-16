import { addDays, addProduct, addPurchase, createEmptyState, linkPlan, makeRecipePlan, setEquivalence, setHabitualBasket, setMonthChange, todayISO, upsertPerson, upsertRecipe } from './model.js';
import { addRoutine, applyRoutine, openMonth } from './routines.js';

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
  // El cuarto argumento era «quiénes la comen normalmente». Esa pregunta ya no
  // existe: una preparación es de la casa. Se sigue aceptando y se ignora para
  // no tener que reescribir las diez llamadas de abajo por un dato muerto.
  const recipe = (name, uses, items, unused = [], note = '') => upsertRecipe(state, { name, uses, items, note }).id;
  const eggsHam = recipe('Huevos con jamón', ['desayuno', 'cena'], [
    { productId: huevo, quantity: 4, unit: 'unidad' }, { productId: jamon, quantity: 4, unit: 'rebanada' }
  ], [ana, luis]);
  const riceMeat = recipe('Arroz con carne', ['almuerzo', 'cena'], [
    { productId: arroz, quantity: 3, unit: 'taza' }, { productId: carne, quantity: 1, unit: 'lb' }
  ], [ana, luis, nina, nino], 'Preparar el arroz y la carne para quienes comen en casa.');
  const plantain = recipe('Plátano maduro con acompañamientos', ['desayuno', 'cena'], [
    { productId: platano, quantity: 1, unit: 'unidad' },
    { productId: huevo, quantity: 2, unit: 'unidad', personId: nina },
    { productId: salami, quantity: 4, unit: 'rueda', personId: nino }
  ], [nina, nino], 'Ejemplo: guardar la mitad del plátano para el desayuno siguiente.');
  const tunaRice = recipe('Arroz con atún', ['almuerzo', 'cena'], [
    { productId: arroz, quantity: 2, unit: 'taza' }, { productId: atun, quantity: 2, unit: 'lata' }
  ], [ana, luis]);
  const sandwich = recipe('Sándwich de jamón', ['desayuno', 'cena'], [
    { productId: pan, quantity: 4, unit: 'rebanada' }, { productId: jamon, quantity: 4, unit: 'rebanada' }
  ], [ana, luis]);
  const today = todayISO();
  makeRecipePlan(state, eggsHam, today, 'desayuno');
  makeRecipePlan(state, riceMeat, today, 'almuerzo');
  const dinner = makeRecipePlan(state, plantain, today, 'cena');
  linkPlan(state, dinner.id, addDays(today, 1), 'desayuno', { [dinner.items.find(item => item.productId === platano).id]: 0.5 }, [], [nina, nino]);
  makeRecipePlan(state, tunaRice, addDays(today, 1), 'almuerzo');
  makeRecipePlan(state, sandwich, addDays(today, 1), 'cena');
  makeRecipePlan(state, sandwich, addDays(today, 2), 'desayuno');
  makeRecipePlan(state, riceMeat, addDays(today, 2), 'almuerzo');
  state.opening = { [platano]: 8, [huevo]: 6, [arroz]: 2, [carne]: 1, [salami]: 0, [jamon]: 0, [atun]: 2, [pan]: 0 };
  addPurchase(state, { date: today, lines: [{ productId: salami, quantity: 1, unit: 'paquete' }, { productId: jamon, quantity: 1, unit: 'paquete' }] });
  state.manualItems.push({ id: `otro-${++state.seq}`, name: 'Detergente · ejemplo', quantity: '', done: false });
  // La canasta habitual del ejemplo: lo que esta casa compra todos los meses.
  setHabitualBasket(state, [
    { productId: arroz, quantity: 90, unit: 'taza', priority: 'obligatorio' },
    { productId: huevo, quantity: 60, unit: 'unidad', priority: 'obligatorio' },
    { productId: carne, quantity: 8, unit: 'lb' },
    { productId: platano, quantity: 40, unit: 'unidad', priority: 'obligatorio' },
    { productId: salami, quantity: 4, unit: 'paquete' },
    { productId: atun, quantity: 8, unit: 'lata', priority: 'ocasional' }
  ]);
  // Dos rutinas, que es lo que el ejemplo tiene que enseñar de verdad: una
  // comida y unos días de la semana llenan el mes entero de una vez. Sin esto,
  // quien abre el ejemplo ve un calendario con tres días puestos y no entiende
  // de dónde salió la idea.
  const mes = today.slice(0, 7);
  const desayunos = addRoutine(state, {
    kind: 'recipe', recipeId: plantain, slots: ['desayuno'],
    weekdays: [1, 3, 5, 6], weeks: null, scope: 'permanent'
  });
  const domingos = addRoutine(state, {
    kind: 'outside', slots: ['almuerzo'],
    weekdays: [7], weeks: [1, 3], scope: 'permanent', label: 'Almuerzo fuera'
  });
  applyRoutine(state, desayunos.id, mes, { modo: 'vacios' });
  applyRoutine(state, domingos.id, mes, { modo: 'vacios' });
  // Y un extra de este mes, para que se vea que existe la excepción y que no
  // contamina los meses siguientes.
  setMonthChange(state, mes, carne, { quantity: 12, unit: 'lb' });
  openMonth(state, mes);
  return state;
}
