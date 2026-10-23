// Capa de datos: tu Google Sheet es la base de datos.
import { GOOGLE_CLIENT_ID } from './config.js';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

const TOKEN_KEY = 'gastos.token';
const SHEET_KEY = 'gastos.sheet';

// ---------- Esquema de la hoja ----------
const SCHEMA = {
  // Origen: "web" o "telegram" (el bot de Apps Script escribe en estas mismas columnas)
  Movimientos: ['ID', 'Fecha', 'Tipo', 'Monto', 'Cuenta', 'Cuenta destino', 'Categoría', 'Comercio', 'Descripción', 'Origen', 'Registrado'],
  Cuentas: ['ID', 'Nombre', 'Banco', 'Tipo', 'Saldo inicial', 'Color', 'Predeterminada'],
  'Categorías': ['ID', 'Nombre', 'Tipo', 'Color', 'Ícono'],
};
// Columnas calculadas por fórmulas de Sheets (la app nunca las escribe)
const FORMULA_COLUMNS = {
  Movimientos: { col: 'L', formula: '={"Mes"; ARRAYFORMULA(IF(B2:B="",, TEXT(B2:B, "yyyy-mm")))}' },
  Cuentas: {
    col: 'H',
    formula: '={"Saldo actual"; MAP(B2:B, E2:E, LAMBDA(n, s, IF(n="",, s'
      + ' + SUMIFS(Movimientos!D:D, Movimientos!E:E, n, Movimientos!C:C, "ingreso")'
      + ' - SUMIFS(Movimientos!D:D, Movimientos!E:E, n, Movimientos!C:C, "gasto")'
      + ' - SUMIFS(Movimientos!D:D, Movimientos!E:E, n, Movimientos!C:C, "transferencia")'
      + ' + SUMIFS(Movimientos!D:D, Movimientos!F:F, n, Movimientos!C:C, "transferencia"))))}',
  },
};
const SUMMARY_TAB = 'Resumen mensual';
const SUMMARY_FORMULAS = [
  ['A1', '=QUERY(Movimientos!A1:L, "select L, sum(D) where C = \'ingreso\' or C = \'gasto\' group by L pivot C order by L desc label L \'Mes\'", 1)'],
  ['F1', '=QUERY(Movimientos!A1:L, "select L, G, sum(D) where C = \'gasto\' group by L, G order by L desc, sum(D) desc label L \'Mes\', G \'Categoría\', sum(D) \'Gastado\'", 1)'],
];

const DEFAULT_CATEGORIES = [
  ['Supermercado', 'gasto', '#22a06b', '🛒'], ['Restaurantes', 'gasto', '#e2683c', '🍽️'],
  ['Transporte', 'gasto', '#4f7cff', '🚗'], ['Vivienda', 'gasto', '#8e5cd9', '🏠'],
  ['Servicios básicos', 'gasto', '#0aa2c0', '💡'], ['Salud', 'gasto', '#d64570', '💊'],
  ['Entretenimiento', 'gasto', '#f2a516', '🎬'], ['Compras', 'gasto', '#c2557a', '🛍️'],
  ['Educación', 'gasto', '#3b8ea5', '📚'], ['Suscripciones', 'gasto', '#6d6af0', '🔁'],
  ['Otros gastos', 'gasto', '#8a8f98', '•'], ['Sueldo', 'ingreso', '#22a06b', '💼'],
  ['Freelance', 'ingreso', '#4f7cff', '🧑‍💻'], ['Inversiones', 'ingreso', '#f2a516', '📈'],
  ['Otros ingresos', 'ingreso', '#8a8f98', '•'],
];

export class AuthError extends Error {}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const storage = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* modo privado */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* modo privado */ } },
};

// ---------- Sesión con Google ----------
let tokenClient;
export function hasClientId() { return Boolean(GOOGLE_CLIENT_ID); }

export function currentToken() {
  const t = storage.get(TOKEN_KEY);
  return t && t.exp > Date.now() + 60_000 ? t.token : null;
}

/** Abre la ventana de Google para entrar (debe llamarse desde un clic). */
export function signIn() {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) return reject(new Error('No se pudo cargar el inicio de sesión de Google. Revisa tu conexión.'));
    tokenClient ??= google.accounts.oauth2.initTokenClient({ client_id: GOOGLE_CLIENT_ID, scope: SCOPES, callback: () => {} });
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(new Error(resp.error_description || resp.error));
      storage.set(TOKEN_KEY, { token: resp.access_token, exp: Date.now() + resp.expires_in * 1000 });
      resolve();
    };
    tokenClient.error_callback = (err) => reject(new Error(err.message || 'Inicio de sesión cancelado'));
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

export function signOut() {
  const token = currentToken();
  if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {});
  storage.del(TOKEN_KEY);
}

async function request(url, options = {}) {
  const token = currentToken();
  if (!token) throw new AuthError('Tu sesión expiró');
  const res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
  if (res.status === 401) { storage.del(TOKEN_KEY); throw new AuthError('Tu sesión expiró'); }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || `Error ${res.status}`;
    if (res.status === 403 || res.status === 404) throw new Error(`Sin acceso a la hoja: ${msg}`);
    throw new Error(msg);
  }
  return data;
}
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// ---------- Hoja configurada ----------
export function sheetIdFromUrl(text) {
  const m = String(text).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/) || String(text).trim().match(/^([a-zA-Z0-9-_]{30,})$/);
  return m ? m[1] : null;
}
export const getSheetId = () => storage.get(SHEET_KEY);
export const setSheetId = (id) => storage.set(SHEET_KEY, id);
export const sheetUrl = () => `https://docs.google.com/spreadsheets/d/${getSheetId()}/edit`;

const base = () => `${SHEETS}/${getSheetId()}`;
let tabIds = {};

const A1 = (tab, range) => `'${tab}'!${range}`;

// En hojas con coma decimal (español), las fórmulas separan argumentos con ";" en vez de ","
let argSeparator = ',';
const localizeFormula = (f) => (argSeparator === ','
  ? f
  : f.split('"').map((part, i) => (i % 2 ? part : part.replaceAll(',', argSeparator))).join('"'));
// Evita que Sheets interprete como fórmula un texto que empieza con = + - @
const safe = (v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v ?? '');

/** Crea las pestañas, encabezados, fórmulas y datos iniciales si faltan. Devuelve el nombre de la hoja. */
export async function ensureSchema() {
  const meta = await request(`${base()}?fields=properties(title,locale),sheets.properties(sheetId,title)`);
  const locale = (meta.properties.locale || 'en_US').replace('_', '-');
  argSeparator = new Intl.NumberFormat(locale).format(1.5).includes(',') ? ';' : ',';
  const existing = Object.fromEntries(meta.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
  const tabs = [...Object.keys(SCHEMA), SUMMARY_TAB];

  const headers = await request(`${base()}/values:batchGet?${new URLSearchParams(
    tabs.filter((t) => t in existing && t in SCHEMA).map((t) => ['ranges', A1(t, '1:2')]),
  )}`).then((r) => Object.fromEntries((r.valueRanges ?? []).map((v) => [v.range.split('!')[0].replace(/'/g, ''), v.values ?? []])));

  const requests = [];
  for (const tab of Object.keys(SCHEMA)) {
    if (!(tab in existing)) continue;
    const rows = headers[tab] ?? [];
    const matches = SCHEMA[tab].every((h, i) => rows[0]?.[i] === h);
    // Una pestaña con otro formato y con datos se conserva renombrada; si está vacía, se reutiliza
    if (!matches && rows.length > 1) {
      requests.push({ updateSheetProperties: { properties: { sheetId: existing[tab], title: `${tab} (antiguo)` }, fields: 'title' } });
      delete existing[tab];
    }
  }
  for (const tab of tabs) {
    if (!(tab in existing)) requests.push({ addSheet: { properties: { title: tab, gridProperties: { frozenRowCount: 1 } } } });
  }
  if (requests.length) await request(`${base()}:batchUpdate`, json('POST', { requests }));

  const meta2 = await request(`${base()}?fields=sheets.properties(sheetId,title)`);
  tabIds = Object.fromEntries(meta2.sheets.map((s) => [s.properties.title, s.properties.sheetId]));

  // Encabezados y fórmulas (siempre se reescriben: son la estructura, no tus datos)
  await request(`${base()}/values:batchClear`, json('POST', { ranges: [A1(SUMMARY_TAB, 'A:Z')] }));
  await request(`${base()}/values:batchUpdate`, json('POST', {
    valueInputOption: 'USER_ENTERED',
    data: [
      ...Object.entries(SCHEMA).map(([tab, cols]) => ({ range: A1(tab, 'A1'), values: [cols] })),
      ...Object.entries(FORMULA_COLUMNS).map(([tab, { col, formula }]) => ({ range: A1(tab, `${col}1`), values: [[localizeFormula(formula)]] })),
      ...SUMMARY_FORMULAS.map(([cell, f]) => ({ range: A1(SUMMARY_TAB, cell), values: [[localizeFormula(f)]] })),
    ],
  }));

  // Formato: encabezados en negrita, fechas y montos legibles
  const fmt = (tab, startCol, endCol, numberFormat) => ({
    repeatCell: {
      range: { sheetId: tabIds[tab], startRowIndex: 1, startColumnIndex: startCol, endColumnIndex: endCol },
      cell: { userEnteredFormat: { numberFormat } }, fields: 'userEnteredFormat.numberFormat',
    },
  });
  const money = { type: 'CURRENCY', pattern: '"$"#,##0.00' };
  await request(`${base()}:batchUpdate`, json('POST', {
    requests: [
      ...[...Object.keys(SCHEMA), SUMMARY_TAB].map((tab) => ({
        repeatCell: { range: { sheetId: tabIds[tab], endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' },
      })),
      fmt('Movimientos', 1, 2, { type: 'DATE', pattern: 'yyyy-mm-dd' }),
      fmt('Movimientos', 3, 4, money),
      fmt('Cuentas', 4, 5, money),
      fmt('Cuentas', 7, 8, money),
      fmt(SUMMARY_TAB, 1, 3, money),
      fmt(SUMMARY_TAB, 7, 8, money),
    ],
  }));

  // Datos iniciales
  const data = await loadAll();
  if (!data.categories.length) {
    await appendRows('Categorías', DEFAULT_CATEGORIES.map(([n, k, c, i]) => [newId(), n, k, c, i]));
  }
  if (!data.accounts.length) {
    await appendRows('Cuentas', [[newId(), 'Efectivo', 'Efectivo', 'efectivo', 0, '#22a06b', 'sí']]);
  }
  return meta.properties.title;
}

// ---------- Lectura ----------
const serialToISO = (v) => {
  if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000).toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // dd/mm/aaaa escrito a mano
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s;
};
const num = (v) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')) || 0);

export async function loadAll() {
  const params = new URLSearchParams([
    ['ranges', A1('Movimientos', 'A2:K')], ['ranges', A1('Cuentas', 'A2:G')], ['ranges', A1('Categorías', 'A2:E')],
    ['valueRenderOption', 'UNFORMATTED_VALUE'], ['dateTimeRenderOption', 'SERIAL_NUMBER'],
  ]);
  const [mov, acc, cat] = (await request(`${base()}/values:batchGet?${params}`)).valueRanges.map((r) => r.values ?? []);
  return {
    transactions: mov.map((r, i) => ({
      row: i + 2, id: String(r[0] ?? ''), date: serialToISO(r[1]), type: String(r[2] ?? '').toLowerCase(), amount: num(r[3]),
      account: r[4] ?? '', to_account: r[5] ?? '', category: r[6] ?? '', merchant: r[7] ?? '', description: r[8] ?? '',
      source: r[9] || 'web', created: r[10] ?? '',
    })).filter((t) => t.id && t.date && t.amount > 0),
    accounts: acc.map((r, i) => ({
      row: i + 2, id: String(r[0] ?? ''), name: String(r[1] ?? ''), bank: String(r[2] ?? ''), type: r[3] || 'corriente',
      initial_balance: num(r[4]), color: r[5] || '#4f7cff', is_default: /^(s[ií]|si|true|x|1)$/i.test(String(r[6] ?? '')),
    })).filter((a) => a.id && a.name),
    categories: cat.map((r, i) => ({
      row: i + 2, id: String(r[0] ?? ''), name: String(r[1] ?? ''), kind: String(r[2] ?? '').toLowerCase(), color: r[3] || '#8a8f98', icon: r[4] || '•',
    })).filter((c) => c.id && c.name && ['gasto', 'ingreso'].includes(c.kind)),
  };
}

// ---------- Escritura ----------
async function appendRows(tab, rows) {
  const width = SCHEMA[tab].length;
  const end = String.fromCharCode(64 + width);
  // OVERWRITE escribe en las filas vacías siguientes, que ya tienen el formato de fecha y moneda
  await request(`${base()}/values/${encodeURIComponent(A1(tab, `A:${end}`))}:append?valueInputOption=USER_ENTERED&insertDataOption=OVERWRITE`,
    json('POST', { values: rows.map((r) => r.map(safe)) }));
}

/** Busca la fila actual de un ID (por si la hoja se editó a mano desde la última carga). */
async function findRow(tab, id) {
  const r = await request(`${base()}/values/${encodeURIComponent(A1(tab, 'A:A'))}`);
  const idx = (r.values ?? []).findIndex((v) => String(v[0]) === String(id));
  if (idx < 1) throw new Error('No encontré ese registro en la hoja; recarga la página.');
  return idx + 1;
}

async function updateRow(tab, id, values) {
  const row = await findRow(tab, id);
  const end = String.fromCharCode(64 + SCHEMA[tab].length);
  await request(`${base()}/values/${encodeURIComponent(A1(tab, `A${row}:${end}${row}`))}?valueInputOption=USER_ENTERED`,
    json('PUT', { values: [values.map(safe)] }));
}

async function deleteRow(tab, id) {
  const row = await findRow(tab, id);
  await request(`${base()}:batchUpdate`, json('POST', {
    requests: [{ deleteDimension: { range: { sheetId: tabIds[tab], dimension: 'ROWS', startIndex: row - 1, endIndex: row } } }],
  }));
}

const txRow = (id, t, created) => [id, t.date, t.type, Number(t.amount), t.account, t.type === 'transferencia' ? t.to_account : '',
  t.type === 'transferencia' ? '' : t.category, t.merchant || '', t.description || '', t.source || 'web', created];
const nowText = () => new Date().toLocaleString('sv-SE').slice(0, 16);

export const createTransaction = (t) => appendRows('Movimientos', [txRow(newId(), t, nowText())]);
export const updateTransaction = (id, t) => updateRow('Movimientos', id, txRow(id, t, t.created || nowText()));
export const deleteTransaction = (id) => deleteRow('Movimientos', id);

const accountRow = (id, a) => [id, a.name.trim(), a.bank.trim(), a.type, Number(a.initial_balance) || 0, a.color, a.is_default ? 'sí' : ''];
const categoryRow = (id, c) => [id, c.name.trim(), c.kind, c.color, c.icon || '•'];

/** Cambia un nombre en todas las filas de Movimientos que lo usan (columnas por letra). */
async function renameInTransactions(transactions, columns, from, to) {
  if (from === to) return;
  const data = [];
  for (const t of transactions) {
    for (const [col, key] of columns) {
      if (t[key] === from) data.push({ range: A1('Movimientos', `${col}${t.row}`), values: [[safe(to)]] });
    }
  }
  if (data.length) await request(`${base()}/values:batchUpdate`, json('POST', { valueInputOption: 'USER_ENTERED', data }));
}

async function clearOtherDefaults(accounts, keepId) {
  const data = accounts.filter((a) => a.is_default && a.id !== keepId).map((a) => ({ range: A1('Cuentas', `G${a.row}`), values: [['']] }));
  if (data.length) await request(`${base()}/values:batchUpdate`, json('POST', { valueInputOption: 'USER_ENTERED', data }));
}

export async function saveAccount(a, { accounts, transactions }) {
  const id = a.id || newId();
  if (a.is_default) await clearOtherDefaults(accounts, id);
  if (a.id) {
    const old = accounts.find((x) => x.id === a.id);
    await updateRow('Cuentas', id, accountRow(id, a));
    await renameInTransactions(transactions, [['E', 'account'], ['F', 'to_account']], old.name, a.name.trim());
  } else {
    await appendRows('Cuentas', [accountRow(id, a)]);
  }
}
export const deleteAccount = (id) => deleteRow('Cuentas', id);

export async function saveCategory(c, { categories, transactions }) {
  if (c.id) {
    const old = categories.find((x) => x.id === c.id);
    await updateRow('Categorías', c.id, categoryRow(c.id, c));
    await renameInTransactions(transactions, [['G', 'category']], old.name, c.name.trim());
  } else {
    await appendRows('Categorías', [categoryRow(newId(), c)]);
  }
}
export const deleteCategory = (id) => deleteRow('Categorías', id);
