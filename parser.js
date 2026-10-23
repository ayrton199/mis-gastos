import { CURRENCY } from './config.js';

/**
 * Interpreta mensajes cortos sin IA, por ejemplo:
 *   "almuerzo 3.50 pichincha"      → gasto $3,50 en Restaurantes, cuenta Pichincha
 *   "taxi 2,50 ayer"               → gasto $2,50 en Transporte, fecha de ayer
 *   "gasolina 20 lucas"            → gasto $20 en Transporte
 *   "me cayó la quincena 450"      → ingreso $450 en Sueldo
 *   "+80 cachuelo 15/10"           → ingreso $80 en Freelance, 15 de octubre
 */

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Palabras clave → nombre de categoría (las categorías creadas por ti también se reconocen por su nombre)
const CATEGORY_KEYWORDS = {
  'Supermercado': ['super', 'supermercado', 'supermaxi', 'megamaxi', 'mi comisariato', 'comisariato', 'tia', 'aki', 'gran aki', 'super aki', 'santa maria', 'coral', 'coral hipermercados', 'tuti', 'gran tuti', 'mercado', 'feria', 'tienda', 'tiendita', 'abarrotes', 'despensa', 'compras del mes', 'frutas', 'verduras', 'carniceria', 'panaderia', 'pan', 'huevos', 'leche'],
  'Restaurantes': ['almuerzo', 'almorce', 'merienda', 'desayuno', 'cena', 'comida', 'jama', 'restaurante', 'restaurant', 'cafe', 'cafecito', 'cafeteria', 'juan valdez', 'sweet & coffee', 'sweet and coffee', 'encebollado', 'ceviche', 'bolon', 'bolones', 'tigrillo', 'hornado', 'fritada', 'seco de pollo', 'guatita', 'salchipapa', 'salchipapas', 'papipollo', 'pollo', 'pollo asado', 'chifa', 'picanteria', 'menestras del negro', 'kfc', 'mcdonalds', 'burger king', 'pizza', 'hamburguesa', 'sushi', 'helado', 'heladeria', 'bielas', 'biela', 'chelas', 'chela', 'cerveza', 'trago', 'bar', 'rappi', 'pedidosya', 'uber eats', 'delivery', 'empanadas', 'humitas', 'colada', 'cevicheria'],
  'Transporte': ['uber', 'indrive', 'didi', 'cabify', 'taxi', 'carrera', 'bus', 'buseta', 'pasaje', 'pasajes', 'metro', 'metro de quito', 'ecovia', 'trole', 'trolebus', 'metrovia', 'aerovia', 'gasolina', 'gasolina extra', 'gasolina super', 'ecopais', 'diesel', 'combustible', 'tanqueada', 'tanquear', 'primax', 'petroecuador', 'terpel', 'peaje', 'parqueadero', 'parqueo', 'estacionamiento', 'zona azul', 'matricula del carro', 'revision vehicular', 'mecanico', 'lavada del carro', 'vuelo', 'avion', 'pasaje de avion'],
  'Vivienda': ['arriendo', 'alquiler', 'alicuota', 'condominio', 'hipoteca', 'credito de vivienda', 'biess', 'mueble', 'muebles', 'ferreteria', 'kywi', 'ferrisariato', 'sukasa', 'disensa', 'limpieza', 'empleada'],
  'Servicios básicos': ['luz', 'planilla de luz', 'agua', 'planilla de agua', 'internet', 'telefono', 'celular', 'plan', 'plan celular', 'recarga', 'gas', 'tanque de gas', 'cilindro', 'claro', 'movistar', 'tuenti', 'cnt', 'netlife', 'xtrim', 'puntonet', 'tv cable', 'cnel', 'eeq', 'empresa electrica', 'emaap', 'interagua', 'etapa'],
  'Salud': ['farmacia', 'fybeca', 'pharmacys', 'sana sana', 'cruz azul', 'medicinas', 'medicina', 'pastillas', 'remedio', 'doctor', 'medico', 'consulta', 'cita medica', 'dentista', 'odontologo', 'examen', 'examenes', 'laboratorio', 'clinica', 'hospital', 'iess', 'seguro medico', 'optica', 'lentes', 'psicologo'],
  'Entretenimiento': ['cine', 'supercines', 'multicines', 'cinemark', 'concierto', 'entrada', 'entradas', 'farra', 'discoteca', 'karaoke', 'juego', 'juegos', 'steam', 'playstation', 'xbox', 'partido', 'futbol', 'cancha', 'paseo', 'viaje', 'vacaciones', 'playa', 'hotel', 'hostal', 'airbnb'],
  'Compras': ['ropa', 'zapatos', 'zapatillas', 'deportivos', 'camiseta', 'pantalon', 'de prati', 'deprati', 'etafashion', 'rm', 'marathon', 'tventas', 'mall', 'centro comercial', 'mercadolibre', 'mercado libre', 'amazon', 'aliexpress', 'shein', 'temu', 'regalo', 'tecnologia', 'celular nuevo', 'novicompu', 'la ganga', 'artefacta', 'comandato', 'jaher'],
  'Educación': ['universidad', 'colegio', 'escuela', 'pension', 'matricula', 'inscripcion', 'curso', 'clases', 'libro', 'libros', 'utiles', 'utiles escolares', 'uniforme', 'copias', 'deberes'],
  'Suscripciones': ['netflix', 'spotify', 'disney', 'disney+', 'hbo', 'max', 'prime video', 'paramount', 'youtube premium', 'icloud', 'google one', 'chatgpt', 'suscripcion', 'gimnasio', 'gym', 'membresia'],
  'Sueldo': ['sueldo', 'salario', 'quincena', 'rol de pagos', 'decimo', 'decimo tercero', 'decimo cuarto', 'decimotercero', 'decimocuarto', 'utilidades', 'fondos de reserva', 'bono'],
  'Freelance': ['freelance', 'cachuelo', 'cachuelito', 'camello', 'honorarios', 'factura', 'proyecto', 'cliente', 'trabajito'],
  'Inversiones': ['intereses', 'dividendos', 'poliza', 'inversion', 'deposito a plazo', 'acciones', 'cripto', 'ahorro programado'],
};

const INCOME_HINTS = ['ingreso', 'me pagaron', 'me pago', 'me cayo', 'me cayeron', 'me depositaron', 'me transfirieron', 'me devolvieron', 'recibi', 'cobre', 'gane', 'venta', 'vendi', 'sueldo', 'salario', 'quincena', 'rol de pagos', 'decimo', 'utilidades', 'cachuelo', 'honorarios', 'reembolso', 'devolucion'];
// Se quitan siempre de la descripción
const DROP = new Set(['gaste', 'pague', 'compre', 'me', 'pagaron', 'pago', 'cayo', 'cayeron', 'depositaron', 'transfirieron', 'devolvieron', 'recibi', 'cobre', 'gane', 'gasto', 'ingreso', 'hoy', 'ayer', 'anteayer', 'plata', 'pesos', 'dolares', 'dolar', 'usd', 'verdes', 'lucas', 'luca', 'ctvs', 'ctv', 'centavos', 'mil', 'k', 'millon', 'millones', 'palo', 'palos']);
// Se quitan solo al inicio o al final ("planilla de luz" conserva el "de")
const CONNECTORS = new Set(['en', 'con', 'de', 'del', 'por', 'el', 'la', 'los', 'las', 'un', 'una', 'para', 'al', 'y', 'a', 'mi', 'tarjeta', 'cuenta']);

const hasPhrase = (text, phrase) => new RegExp(`(^|[^a-z0-9&+])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9&+])`).test(text);

function parseAmount(text) {
  // "3.50" "3,50" "$3.50" "20 lucas" "15 dolares" "50 ctvs" "1.200" "2k" "1,5 millones"
  const re = /(^|\s)([+-]?)\$?\s?(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d{1,2})?)\s?(k|mil|lucas?|verdes?|dolar(?:es)?|usd|ctvs?|centavos?|millon(?:es)?|palos?)?(?=[\s.,!?]|$)/;
  const m = text.match(re);
  if (!m) return null;
  let [, , sign, num, unit] = m;
  // Separador de miles si hay grupos de 3 dígitos; si no, coma/punto decimal
  const value = /^\d{1,3}([.,]\d{3})+$/.test(num) ? Number(num.replace(/[.,]/g, '')) : Number(num.replace(',', '.'));
  let mult = 1;
  if (/^(millon|palo)/.test(unit)) mult = 1000000;
  else if (/^(k|mil)$/.test(unit)) mult = 1000;
  else if (/^(ctv|centavo)/.test(unit)) mult = 0.01;
  // En Ecuador "5 lucas" son 5 dólares; en Chile, 5.000 pesos
  else if (/^luca/.test(unit) && CURRENCY === 'CLP') mult = 1000;
  return { amount: Math.round(value * mult * 100) / 100, sign, match: m[0] };
}

function parseDate(text) {
  const d = new Date();
  // Formato manual (sin Intl) para que funcione igual en el navegador y en Google Apps Script
  const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  if (hasPhrase(text, 'anteayer')) { d.setDate(d.getDate() - 2); return { date: iso(d), match: 'anteayer' }; }
  if (hasPhrase(text, 'ayer')) { d.setDate(d.getDate() - 1); return { date: iso(d), match: 'ayer' }; }
  const m = text.match(/(^|\s)(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?=\s|$)/);
  if (m) {
    const [, , day, month, y] = m;
    const year = y ? (y.length === 2 ? 2000 + Number(y) : Number(y)) : d.getFullYear();
    const date = new Date(year, Number(month) - 1, Number(day));
    if (date.getMonth() === Number(month) - 1) return { date: iso(date), match: m[0].trim() };
  }
  return { date: iso(d), match: null };
}

function findAccount(text, accounts) {
  let best = null;
  for (const a of accounts) {
    const bank = norm(a.bank || '');
    const candidates = [norm(a.name), bank, bank.replace(/^(banco|cooperativa|coop\.?)\s+(de\s+|del\s+)?/, '')]
      .filter((c) => c.length >= 3);
    for (const c of candidates) {
      if (hasPhrase(text, c) && (!best || c.length > best.match.length)) best = { account: a, match: c };
    }
  }
  if (!best && /(^|\s)(cash|efectivo)(\s|$)/.test(text)) {
    const cash = accounts.find((a) => norm(a.name).includes('efectivo') || norm(a.bank).includes('efectivo'));
    if (cash) best = { account: cash, match: 'efectivo' };
  }
  return best;
}

function findCategory(text, type, allCategories) {
  const categories = allCategories.filter((c) => c.kind === type);
  let best = null;
  for (const c of categories) {
    const words = [norm(c.name), ...(CATEGORY_KEYWORDS[c.name] ?? [])];
    for (const w of words) {
      if (hasPhrase(text, w) && (!best || w.length > best.len)) best = { category: c, len: w.length };
    }
  }
  return best?.category ?? categories.find((c) => c.name.startsWith('Otros')) ?? null;
}

/** Devuelve un borrador de movimiento, o null si el texto no trae un monto. */
export function parseMessage(raw, { accounts, categories }) {
  const original = raw.trim();
  const text = norm(original).replace(/\s+/g, ' ');

  const date = parseDate(text);
  const withoutDate = date.match ? text.replace(date.match, ' ') : text;
  const amount = parseAmount(withoutDate);
  if (!amount || !(amount.amount > 0)) return null;

  const type = amount.sign === '+' || INCOME_HINTS.some((h) => hasPhrase(text, h)) ? 'ingreso' : 'gasto';
  const acc = findAccount(text, accounts);
  const defaultAccount = accounts.find((a) => a.is_default) ?? accounts[0];
  const category = findCategory(text, type, categories);

  // La descripción son las palabras que quedan del mensaje original (con sus tildes)
  const drop = new Set([...DROP, ...(acc ? acc.match.split(' ') : [])]);
  const key = (w) => norm(w).replace(/[^a-z0-9&/.,+$-]/g, '');
  const words = original.split(/\s+/).filter((w) => {
    const n = key(w);
    if (!n || drop.has(n)) return false;
    if (date.match && date.match.split(' ').includes(n)) return false;
    if (/^[+-]?\$?\d/.test(n)) return false;
    return true;
  });
  while (words.length && CONNECTORS.has(key(words[0]))) words.shift();
  while (words.length && CONNECTORS.has(key(words[words.length - 1]))) words.pop();
  const description = words.join(' ');

  return {
    type,
    amount: amount.amount,
    date: date.date,
    description: description ? description[0].toUpperCase() + description.slice(1) : '',
    merchant: '',
    category: category?.name ?? '',
    account: acc?.account.name ?? defaultAccount?.name ?? '',
  };
}
