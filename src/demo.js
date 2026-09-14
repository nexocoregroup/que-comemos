import { addDays, addProduct, addPurchase, createEmptyState, linkPlan, setBasket, makeRecipePlan, setEquivalence, todayISO, upsertPerson, upsertRecipe } from './model.js';

export function createDemoState() {
  const state = createEmptyState();
  state.demo = true;
  const add = (name, controlUnit, purchaseUnit = controlUnit) => addProduct(state, { name, controlUnit, purchaseUnit }).id;
  const platano = add('Plátano maduro', 'unidad');
  const huevo = add('Huevo', 'unidad');
  const arroz = add('Arroz', 'taza', 'lb');
  const carne = add('Carne', 'lb');
  const salami = add('Salami', 'rueda', 'paquete');
  const jamon = add('Jamón', 'rebanada', 'paquete');
  const atun = add('Atún', 'lata');
  const pan = add('Pan', 'rebanada', 'paquete');
  setEquivalence(state, salami, 'paquete', 16);
  setEquivalence(state, jamon, 'paquete', 12);
  setEquivalence(state, pan, 'paquete', 12);
  const ana = upsertPerson(state, { name: 'Ana · ejemplo', restrictions: [], habitual: [] }).id;
  const luis = upsertPerson(state, { name: 'Luis · ejemplo', restrictions: [], habitual: [] }).id;
  const nina = upsertPerson(state, { name: 'Niña · ejemplo', restrictions: [], habitual: [{ productId: huevo, quantity: 2, unit: 'unidad' }] }).id;
  const nino = upsertPerson(state, { name: 'Niño · ejemplo', restrictions: [], habitual: [{ productId: salami, quantity: 4, unit: 'rueda' }] }).id;
  const recipe = (name, uses, items, covers = [], note = '') => upsertRecipe(state, { name, uses, items, covers, note }).id;
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
  // Una canasta de ejemplo para ver la otra forma de comprar: sin planificar el
  // menú, a partir de lo que la casa consume en un mes corriente.
  setBasket(state, [
    { productId: arroz, quantity: 90, unit: 'taza' },
    { productId: huevo, quantity: 60, unit: 'unidad' },
    { productId: carne, quantity: 8, unit: 'lb' },
    { productId: platano, quantity: 40, unit: 'unidad' },
    { productId: salami, quantity: 4, unit: 'paquete' },
    { productId: atun, quantity: 8, unit: 'lata' }
  ]);
  return state;
}
