import { CURRENCY, LOCALE } from './config.js';
import * as store from './store.js';
import { parseMessage } from './parser.js';
import { icon, hydrateIcons, countUp, enableRipple, lineChart, donut } from './ui.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => iso(new Date());
const fmt = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY });
const money = (n) => fmt.format(n);
const compact = (n) => (n >= 1000 ? `$${(n / 1000).toLocaleString(LOCALE, { maximumFractionDigits: 1 })}k` : `$${Math.round(n)}`);
const monthName = (m, opts = { month: 'long', year: 'numeric' }) => new Date(`${m}-15T12:00`).toLocaleDateString('es', opts);
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const shiftMonth = (m, k) => { const [y, mo] = m.split('-').map(Number); return iso(new Date(y, mo - 1 + k, 1)).slice(0, 7); };

const PALETTE = ['#ff5c00', '#00c3d9', '#ffa94d', '#34d399', '#fbbf24', '#fb7185', '#60a5fa', '#f97316', '#a3e635', '#94a3b8'];
const VIEW_TITLES = { resumen: 'Resumen', movimientos: 'Movimientos', cuentas: 'Cuentas', categorias: 'Categorías' };

const state = { transactions: [], accounts: [], categories: [], view: 'resumen', month: today().slice(0, 7), range: 'mes', type: '' };

hydrateIcons();
enableRipple();

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 3000);
}

async function busy(fn) {
  $('#loading').hidden = false;
  try {
    return await fn();
  } catch (err) {
    if (err instanceof store.AuthError) showGate('login', 'Tu sesión expiró. Vuelve a entrar.');
    throw err;
  } finally {
    $('#loading').hidden = true;
  }
}

// ---------- Tema (oscuro por defecto) ----------
function applyTheme(theme, animate) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('gastos.theme', theme); } catch { /* modo privado */ }
  $('meta[name="theme-color"]').content = theme === 'dark' ? '#061f30' : '#eef2f7';
  const next = theme === 'dark' ? 'sun' : 'moon';
  $$('[data-theme-toggle]').forEach((b) => {
    const holder = b.querySelector('.theme-toggle-icon') || b;
    holder.innerHTML = icon(next);
    if (animate) { b.classList.add('spin'); setTimeout(() => b.classList.remove('spin'), 450); }
  });
  $$('.theme-label').forEach((l) => (l.textContent = theme === 'dark' ? 'Tema claro' : 'Tema oscuro'));
  if (animate && !$('#app').hidden) renderSummary();
}
$$('[data-theme-toggle]').forEach((b) => b.addEventListener('click', () =>
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true)));
applyTheme(document.documentElement.dataset.theme || 'dark', false);

// ---------- Modo privado (saldos borrosos) ----------
function applyPrivacy(on) {
  document.documentElement.toggleAttribute('data-private', on);
  try { localStorage.setItem('gastos.private', on ? '1' : '0'); } catch { /* modo privado */ }
  const b = $('#btn-privacy');
  b.innerHTML = icon(on ? 'eyeOff' : 'eye');
  b.title = on ? 'Mostrar saldos' : 'Ocultar saldos';
  b.setAttribute('aria-label', b.title);
  b.classList.toggle('on', on);
}
$('#btn-privacy').addEventListener('click', () => applyPrivacy(!document.documentElement.hasAttribute('data-private')));
applyPrivacy(document.documentElement.hasAttribute('data-private'));

// ---------- Entrada y configuración ----------
function showGate(step, msg = '') {
  $('#app').hidden = true;
  $('#gate').hidden = false;
  $('#gate-login').hidden = step !== 'login';
  $('#gate-sheet').hidden = step !== 'sheet';
  $('#gate-msg').textContent = msg;
}

async function start() {
  if (!store.hasClientId()) return showGate('none', 'Falta configurar GOOGLE_CLIENT_ID en config.js.');
  if (!store.currentToken()) return showGate('login');
  if (!store.getSheetId()) return showGate('sheet');
  try {
    const title = await busy(() => store.ensureSchema());
    $('#sheet-link').title = title;
    $('#sheet-link').href = store.sheetUrl();
    $('#settings-sheet').textContent = title;
    $('#gate').hidden = true;
    $('#app').hidden = false;
    await reload();
  } catch (err) {
    if (!(err instanceof store.AuthError)) showGate('sheet', err.message);
  }
}

$('#btn-login').onclick = async () => {
  try {
    await store.signIn();
    start();
  } catch (err) { $('#gate-msg').textContent = err.message; }
};
$('#gate-sheet').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = store.sheetIdFromUrl($('#sheet-url').value);
  if (!id) return ($('#gate-msg').textContent = 'Ese enlace no parece de Google Sheets.');
  store.setSheetId(id);
  start();
});
const openSettings = () => { $('#settings-sheet').href = store.sheetUrl(); $('#dlg-settings').showModal(); };
$('#btn-settings').onclick = openSettings;
$('#btn-settings-m').onclick = openSettings;
$('#btn-change-sheet').onclick = () => { $('#dlg-settings').close(); $('#sheet-url').value = ''; showGate('sheet'); };
$('#btn-logout').onclick = () => { store.signOut(); $('#dlg-settings').close(); showGate('login'); };
$('#btn-refresh').onclick = () => reload().then(() => toast('Datos actualizados desde la hoja'));

async function reload() {
  Object.assign(state, await busy(() => store.loadAll()));
  render();
}
async function save(fn, okMsg) {
  await busy(fn);
  toast(okMsg);
  await reload();
}

// ---------- Cálculos ----------
function balances() {
  return state.accounts.map((a) => {
    let balance = a.initial_balance;
    for (const t of state.transactions) {
      if (t.account === a.name) balance += t.type === 'ingreso' ? t.amount : -t.amount;
      if (t.type === 'transferencia' && t.to_account === a.name) balance += t.amount;
    }
    return { ...a, balance };
  });
}
const catInfo = (name) => state.categories.find((c) => c.name === name) ?? { name: name || 'Sin categoría', color: '#94a3b8', icon: '•' };
const sorted = (list) => [...list].sort((a, b) => b.date.localeCompare(a.date) || String(b.created).localeCompare(String(a.created)));
const sum = (list, type) => list.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
const inMonth = (m) => state.transactions.filter((t) => t.date.startsWith(m));

// ---------- Navegación ----------
function showView(view) {
  state.view = view;
  $$('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  $('#view-title').textContent = VIEW_TITLES[view];
  $('#month-switch').hidden = view !== 'resumen' && view !== 'categorias';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  render();
}
$$('[data-view]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
document.addEventListener('click', (e) => { const g = e.target.closest('[data-goto]'); if (g) showView(g.dataset.goto); });

$('#month-prev').onclick = () => { state.month = shiftMonth(state.month, -1); render(); };
$('#month-next').onclick = () => { state.month = shiftMonth(state.month, 1); render(); };

function render() {
  $('#month-label').textContent = capitalize(monthName(state.month));
  fillFilterSelects();
  if (state.view === 'resumen') renderSummary();
  if (state.view === 'movimientos') renderTransactions();
  if (state.view === 'cuentas') renderAccounts();
  if (state.view === 'categorias') renderCategories();
}

// ---------- Resumen ----------
function trend(el, now, before, higherIsGood) {
  if (!before) { el.className = 'trend neutral'; el.textContent = now ? 'nuevo' : ''; return; }
  const pct = Math.round(((now - before) / before) * 100);
  const good = higherIsGood ? pct >= 0 : pct <= 0;
  el.className = `trend ${good ? 'good' : 'bad'}`;
  el.innerHTML = `${icon(pct >= 0 ? 'up' : 'down')}${Math.abs(pct)}%`;
}

function renderSummary() {
  const list = inMonth(state.month);
  const prev = inMonth(shiftMonth(state.month, -1));
  const ing = sum(list, 'ingreso'), gas = sum(list, 'gasto');
  const accs = balances();

  countUp($('#s-balance'), ing - gas, money);
  countUp($('#s-ingresos'), ing, money);
  countUp($('#s-gastos'), gas, money);
  countUp($('#s-total'), accs.reduce((s, a) => s + a.balance, 0), money);
  trend($('#t-ingresos'), ing, sum(prev, 'ingreso'), true);
  trend($('#t-gastos'), gas, sum(prev, 'gasto'), false);
  $('#t-cuentas').textContent = `${accs.length} cuenta${accs.length === 1 ? '' : 's'}`;
  // Días transcurridos del mes (completo si es un mes pasado)
  const [yy, mm] = state.month.split('-').map(Number);
  const curMonth = today().slice(0, 7);
  const days = state.month === curMonth ? new Date().getDate() : state.month < curMonth ? new Date(yy, mm, 0).getDate() : 0;
  countUp($('#s-diario'), days ? gas / days : 0, money);
  $('#t-diario').textContent = days ? `${days} día${days === 1 ? '' : 's'}` : '';

  const saved = ing > 0 ? Math.round(((ing - gas) / ing) * 100) : 0;
  $('#hero-badge').textContent = ing > 0 ? `${saved >= 0 ? 'Ahorro' : 'Déficit'} ${Math.abs(saved)}%` : monthName(state.month, { month: 'short' });
  $('#hero-bar-fill').style.width = `${ing > 0 ? Math.min(100, (gas / ing) * 100) : gas > 0 ? 100 : 0}%`;
  $('#hero-foot').textContent = ing > 0 ? `Gastaste ${Math.round((gas / ing) * 100)}% de tus ingresos` : (gas > 0 ? 'Sin ingresos registrados este mes' : 'Aún no hay movimientos este mes');

  renderLineChart();
  renderDonut(list);

  $('#account-list').innerHTML = accs.length ? accs.map((a, i) => `
    <div class="acc-row" style="--i:${i}">
      <span class="emoji-tile" style="--c:${esc(a.color)};color:${esc(a.color)}">${icon('wallet')}</span>
      <div class="meta"><b>${esc(a.name)}</b><small>${esc(a.bank)}</small></div>
      <span class="amount ${a.balance < 0 ? 'neg' : ''}">${money(a.balance)}</span>
    </div>`).join('') : '<div class="empty">Crea tu primera cuenta</div>';

  const recent = sorted(state.transactions).slice(0, 6);
  $('#recent').innerHTML = recent.length ? recent.map(txRow).join('') : `<div class="empty">${icon('sparkle')}Registra tu primer movimiento arriba</div>`;
  bindTxRows($('#recent'));
}

function renderLineChart() {
  let labels, tipLabels, gastos, ingresos;
  if (state.range === 'mes') {
    const [y, m] = state.month.split('-').map(Number);
    const isCurrent = state.month === today().slice(0, 7);
    const days = isCurrent ? new Date().getDate() : new Date(y, m, 0).getDate();
    labels = Array.from({ length: days }, (_, i) => String(i + 1));
    tipLabels = labels.map((d) => `${d} de ${monthName(state.month, { month: 'long' })}`);
    gastos = Array(days).fill(0); ingresos = Array(days).fill(0);
    for (const t of inMonth(state.month)) {
      const d = Number(t.date.slice(8, 10)) - 1;
      if (d >= days) continue;
      if (t.type === 'gasto') gastos[d] += t.amount;
      if (t.type === 'ingreso') ingresos[d] += t.amount;
    }
    // Acumulado: cuánto llevas gastado/ganado en el mes hasta cada día
    for (let i = 1; i < days; i++) { gastos[i] += gastos[i - 1]; ingresos[i] += ingresos[i - 1]; }
    $('#chart-sub').textContent = `Acumulado de ${monthName(state.month, { month: 'long' })}`;
  } else {
    const n = state.range === '6m' ? 6 : 12;
    const months = Array.from({ length: n }, (_, i) => shiftMonth(state.month, i - n + 1));
    labels = months.map((m) => monthName(m, { month: 'short' }).replace('.', ''));
    tipLabels = months.map((m) => monthName(m));
    gastos = months.map((m) => sum(inMonth(m), 'gasto'));
    ingresos = months.map((m) => sum(inMonth(m), 'ingreso'));
    $('#chart-sub').textContent = `Últimos ${n} meses`;
  }
  const css = getComputedStyle(document.documentElement);
  lineChart($('#line-chart'), {
    labels, tipLabels, format: money, compact,
    series: [
      { key: 'ingresos', name: 'Ingresos', values: ingresos, color: css.getPropertyValue('--chart-ingresos').trim() },
      { key: 'gastos', name: 'Gastos', values: gastos, color: css.getPropertyValue('--chart-gastos').trim() },
    ],
  });
}
$('#chart-range').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-range]');
  if (!b) return;
  state.range = b.dataset.range;
  $$('#chart-range button').forEach((x) => x.classList.toggle('active', x === b));
  renderLineChart();
});
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => state.view === 'resumen' && !$('#app').hidden && renderLineChart(), 200); });

function renderDonut(list) {
  const byCat = {};
  for (const t of list.filter((t) => t.type === 'gasto')) byCat[t.category] = (byCat[t.category] ?? 0) + t.amount;
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  // Más de 6 categorías: el resto se agrupa en "Otras"
  const top = entries.slice(0, 6);
  if (entries.length > 6) top.push(['Otras', entries.slice(6).reduce((s, e) => s + e[1], 0)]);
  const items = top.map(([name, value], i) => {
    const c = catInfo(name);
    return { name: name || 'Sin categoría', value, icon: esc(name === 'Otras' ? '➕' : c.icon), color: name === 'Otras' ? '#94a3b8' : (state.categories.find((x) => x.name === name) ? c.color : PALETTE[i % PALETTE.length]) };
  });
  $('#donut-sub').textContent = monthName(state.month, { month: 'long' });
  if (!items.length) {
    $('#donut').innerHTML = `<svg viewBox="0 0 200 200"><circle class="track" r="76" cx="100" cy="100"/></svg><div class="donut-center"><strong>$0</strong><span>sin gastos</span></div>`;
    $('#donut-legend').innerHTML = '<div class="empty">Sin gastos este mes</div>';
    return;
  }
  donut($('#donut'), $('#donut-legend'), items, { format: money, centerLabel: 'gastado' });
}

// Ejemplos clicables para el registro rápido
const HINTS = ['almuerzo 3.50', 'taxi 2,50 ayer', 'supermaxi 45,80 pichincha', 'me cayó la quincena 450'];
$('#quick-hints').innerHTML = HINTS.map((h) => `<button type="button">${h}</button>`).join('');
$('#quick-hints').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $('#quick-text').value = b.textContent;
  $('#quick-text').focus();
});
$('#quick').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#quick-text').value.trim();
  if (!text) return;
  const draft = parseMessage(text, state);
  if (!draft) return toast('No encontré un monto. Ej: almuerzo 3.50 pichincha');
  $('#quick-text').value = '';
  openTx(null, draft);
});

// ---------- Filas de movimientos ----------
function signedAmount(t) {
  if (t.type === 'transferencia') return `<span class="amount">${money(t.amount)}</span>`;
  return `<span class="amount ${t.type === 'gasto' ? 'neg' : 'pos'}">${t.type === 'gasto' ? '−' : '+'}${money(t.amount)}</span>`;
}
const txTitle = (t) => (t.type === 'transferencia' ? `Transferencia a ${t.to_account}` : (t.merchant || t.description || t.category || 'Movimiento'));
function txRow(t, i = 0) {
  const c = catInfo(t.category);
  const tile = t.type === 'transferencia' ? `<span class="emoji-tile" style="--c:var(--cyan);color:var(--cyan)">${icon('transfer')}</span>`
    : `<span class="emoji-tile" style="--c:${esc(c.color)}">${esc(c.icon)}</span>`;
  const detail = [t.type === 'transferencia' ? '' : (t.category || 'Sin categoría'), t.account].filter(Boolean).join(' · ');
  return `<div class="tx-row" data-id="${esc(t.id)}" style="--i:${Math.min(i, 12)}">
    ${tile}
    <div class="meta"><b>${esc(txTitle(t))}${t.source === 'telegram' ? `<span class="badge">${icon('telegram')}Telegram</span>` : ''}</b>
      <small>${esc(detail)}${t.merchant && t.description ? ` · ${esc(t.description)}` : ''}</small></div>
    ${signedAmount(t)}
  </div>`;
}
function bindTxRows(root) {
  $$('.tx-row', root).forEach((el) => el.onclick = () => openTx(state.transactions.find((t) => t.id === el.dataset.id)));
}

// ---------- Movimientos ----------
function fillFilterSelects() {
  const keepA = $('#f-account').value, keepC = $('#f-category').value;
  $('#f-account').innerHTML = '<option value="">Todas las cuentas</option>' +
    state.accounts.map((a) => `<option value="${esc(a.name)}">${esc(a.name)}</option>`).join('');
  $('#f-category').innerHTML = '<option value="">Todas las categorías</option>' +
    state.categories.map((c) => `<option value="${esc(c.name)}">${esc(c.icon)} ${esc(c.name)}</option>`).join('');
  $('#f-account').value = keepA; $('#f-category').value = keepC;
}
['#f-q', '#f-account', '#f-category', '#f-from', '#f-to'].forEach((s) =>
  $(s).addEventListener(s === '#f-q' ? 'input' : 'change', renderTransactions));
$('#f-type').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-type]');
  if (!b) return;
  state.type = b.dataset.type;
  $$('#f-type button').forEach((x) => x.classList.toggle('active', x === b));
  renderTransactions();
});

function dayLabel(date) {
  const t = today();
  const y = iso(new Date(Date.now() - 86_400_000));
  if (date === t) return 'Hoy';
  if (date === y) return 'Ayer';
  return new Date(`${date}T12:00`).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' });
}

function renderTransactions() {
  const q = $('#f-q').value.trim().toLowerCase();
  const acc = $('#f-account').value, cat = $('#f-category').value;
  const from = $('#f-from').value, to = $('#f-to').value;
  const rows = sorted(state.transactions).filter((t) =>
    (!q || `${t.description} ${t.merchant} ${t.category}`.toLowerCase().includes(q))
    && (!state.type || t.type === state.type)
    && (!acc || t.account === acc || t.to_account === acc)
    && (!cat || t.category === cat)
    && (!from || t.date >= from) && (!to || t.date <= to));

  $('#tx-summary').innerHTML = rows.length
    ? `<span><b>${rows.length}</b> movimientos</span><span>Ingresos <b class="pos">${money(sum(rows, 'ingreso'))}</b></span><span>Gastos <b class="neg">${money(sum(rows, 'gasto'))}</b></span>`
    : '';
  const groups = Object.groupBy(rows, (t) => t.date);
  let i = 0;
  $('#tx-groups').innerHTML = Object.entries(groups).map(([date, list]) => {
    const net = sum(list, 'ingreso') - sum(list, 'gasto');
    return `<div class="card day-group">
      <div class="day-head"><span>${esc(dayLabel(date))}</span><span class="${net < 0 ? 'neg' : net > 0 ? 'pos' : ''}">${net ? (net > 0 ? '+' : '−') + money(Math.abs(net)) : ''}</span></div>
      ${list.map((t) => txRow(t, i++)).join('')}
    </div>`;
  }).join('');
  $('#tx-empty').hidden = rows.length > 0;
  bindTxRows($('#tx-groups'));
}

// ---------- Modal de movimiento ----------
const dlgTx = $('#dlg-tx');
const formTx = $('#form-tx');
let editingTx = null;

function updateTxForm() {
  const type = formTx.type.value;
  formTx.classList.toggle('is-transfer', type === 'transferencia');
  $('#lbl-account').textContent = type === 'transferencia' ? 'Cuenta origen' : 'Cuenta';
  const keep = formTx.category.value;
  formTx.category.innerHTML = '<option value="">Sin categoría</option>' + state.categories
    .filter((c) => c.kind === type).map((c) => `<option value="${esc(c.name)}">${esc(c.icon)} ${esc(c.name)}</option>`).join('');
  formTx.category.value = keep;
}
$('#tx-type').addEventListener('change', updateTxForm);

function openTx(tx = null, draft = null) {
  if (!state.accounts.length) return toast('Primero crea una cuenta');
  editingTx = tx;
  const accOpts = state.accounts.map((a) => `<option value="${esc(a.name)}">${esc(a.name)} · ${esc(a.bank)}</option>`).join('');
  formTx.account.innerHTML = accOpts;
  formTx.to_account.innerHTML = accOpts;
  const data = tx || draft || {};
  const def = state.accounts.find((a) => a.is_default) || state.accounts[0];
  formTx.type.value = data.type || 'gasto';
  updateTxForm();
  formTx.amount.value = data.amount ?? '';
  formTx.date.value = data.date || today();
  formTx.account.value = data.account || def.name;
  formTx.to_account.value = data.to_account || state.accounts.find((a) => a.name !== formTx.account.value)?.name || '';
  formTx.category.value = data.category || '';
  formTx.merchant.value = data.merchant || '';
  formTx.description.value = data.description || '';
  $('#tx-title').textContent = tx ? 'Editar movimiento' : draft ? 'Revisa y guarda' : 'Nuevo movimiento';
  $('#tx-delete').hidden = !tx;
  $('#tx-error').textContent = '';
  dlgTx.showModal();
  if (!tx && !draft) formTx.amount.focus();
}

function validate(t) {
  if (!(t.amount > 0)) return 'El monto debe ser mayor a 0';
  if (!t.date) return 'Elige una fecha';
  if (!t.account) return 'Selecciona una cuenta';
  if (t.type === 'transferencia' && (!t.to_account || t.to_account === t.account)) return 'Elige una cuenta de destino distinta';
  return null;
}

formTx.addEventListener('submit', async (e) => {
  e.preventDefault();
  const t = { ...Object.fromEntries(new FormData(formTx)), source: editingTx?.source, created: editingTx?.created };
  t.amount = Number(t.amount);
  const error = validate(t);
  if (error) return ($('#tx-error').textContent = error);
  try {
    dlgTx.close();
    await save(() => (editingTx ? store.updateTransaction(editingTx.id, t) : store.createTransaction(t)),
      editingTx ? 'Movimiento actualizado' : 'Movimiento registrado ✓');
  } catch (err) { if (!(err instanceof store.AuthError)) toast(err.message); }
});
$('#tx-delete').onclick = async () => {
  if (!confirm('¿Eliminar este movimiento?')) return;
  dlgTx.close();
  try { await save(() => store.deleteTransaction(editingTx.id), 'Movimiento eliminado'); }
  catch (err) { if (!(err instanceof store.AuthError)) toast(err.message); }
};
$('#btn-new').onclick = () => openTx();
$('#btn-fab').onclick = () => openTx();

// ---------- Colores (cuentas y categorías) ----------
function swatches(container, input, current) {
  const colors = PALETTE.includes(current) || !current ? PALETTE : [current, ...PALETTE];
  input.value = current || PALETTE[0];
  container.innerHTML = colors.map((c) => `<button type="button" style="--c:${c}" data-c="${c}" class="${c === input.value ? 'on' : ''}" aria-label="Color ${c}"></button>`).join('');
  container.onclick = (e) => {
    const b = e.target.closest('button[data-c]');
    if (!b) return;
    input.value = b.dataset.c;
    $$('button', container).forEach((x) => x.classList.toggle('on', x === b));
  };
}

// ---------- Cuentas ----------
const TYPE_LABEL = { corriente: 'Cuenta corriente', ahorro: 'Cuenta de ahorros', credito: 'Tarjeta de crédito', efectivo: 'Efectivo', inversion: 'Inversión' };
function renderAccounts() {
  const accs = balances();
  const month = today().slice(0, 7);
  const byBank = Object.groupBy(accs, (a) => a.bank || 'Sin banco');
  let i = 0;
  $('#banks').innerHTML = Object.entries(byBank).map(([bank, list]) => `
    <div class="bank-group">
      <div class="bank-head"><h2>🏦 ${esc(bank)}</h2><span class="amount">${money(list.reduce((s, a) => s + a.balance, 0))}</span></div>
      <div class="acc-grid">${list.map((a) => {
        const n = state.transactions.filter((t) => t.date.startsWith(month) && (t.account === a.name || t.to_account === a.name)).length;
        return `<div class="card acc-card" style="--c:${esc(a.color)};animation:rise .45s both;animation-delay:${i++ * 60}ms" data-id="${esc(a.id)}">
          <div class="acc-name">${esc(a.name)}${a.is_default ? '<span class="badge">predeterminada</span>' : ''}</div>
          <div class="bal ${a.balance < 0 ? 'neg' : ''}" data-count="${a.balance}">$0</div>
          <small>${esc(TYPE_LABEL[a.type] || a.type)} · ${n} mov. este mes</small>
        </div>`;
      }).join('')}</div>
    </div>`).join('') + `<button class="add-card" id="btn-new-account">${icon('plus')}Nueva cuenta</button>`;
  $$('.acc-card').forEach((el) => {
    el.onclick = () => openAccount(state.accounts.find((a) => a.id === el.dataset.id));
    const b = $('.bal', el);
    countUp(b, Number(b.dataset.count), money);
  });
  $('#btn-new-account').onclick = () => openAccount();
}

const dlgAcc = $('#dlg-account'), formAcc = $('#form-account');
let editingAcc = null;
function openAccount(a = null) {
  editingAcc = a;
  $('#bank-list').innerHTML = [...new Set(state.accounts.map((x) => x.bank).filter(Boolean))].map((b) => `<option value="${esc(b)}">`).join('');
  formAcc.name.value = a?.name || '';
  formAcc.bank.value = a?.bank || '';
  formAcc.type.value = a?.type || 'ahorro';
  formAcc.initial_balance.value = a?.initial_balance ?? 0;
  swatches($('#acc-swatches'), formAcc.color, a?.color || PALETTE[state.accounts.length % PALETTE.length]);
  formAcc.is_default.checked = Boolean(a?.is_default);
  $('#account-title').textContent = a ? 'Editar cuenta' : 'Nueva cuenta';
  $('#account-delete').hidden = !a;
  $('#account-error').textContent = '';
  dlgAcc.showModal();
}
formAcc.addEventListener('submit', async (e) => {
  e.preventDefault();
  const a = { ...Object.fromEntries(new FormData(formAcc)), id: editingAcc?.id, is_default: formAcc.is_default.checked };
  if (!a.name.trim()) return ($('#account-error').textContent = 'El nombre es obligatorio');
  if (state.accounts.some((x) => x.name.trim().toLowerCase() === a.name.trim().toLowerCase() && x.id !== a.id)) {
    return ($('#account-error').textContent = 'Ya existe una cuenta con ese nombre');
  }
  dlgAcc.close();
  try { await save(() => store.saveAccount(a, state), 'Cuenta guardada'); }
  catch (err) { if (!(err instanceof store.AuthError)) toast(err.message); }
});
$('#account-delete').onclick = async () => {
  const used = state.transactions.filter((t) => t.account === editingAcc.name || t.to_account === editingAcc.name).length;
  if (used) return ($('#account-error').textContent = `La cuenta tiene ${used} movimientos. Elimínalos o muévelos primero.`);
  if (!confirm('¿Eliminar esta cuenta?')) return;
  dlgAcc.close();
  try { await save(() => store.deleteAccount(editingAcc.id), 'Cuenta eliminada'); }
  catch (err) { if (!(err instanceof store.AuthError)) toast(err.message); }
};

// ---------- Categorías ----------
function renderCategories() {
  const list = inMonth(state.month);
  let i = 0;
  for (const kind of ['gasto', 'ingreso']) {
    const cats = state.categories.filter((c) => c.kind === kind).map((c) => ({ ...c, total: list.filter((t) => t.type === kind && t.category === c.name).reduce((s, t) => s + t.amount, 0) }));
    const max = Math.max(...cats.map((c) => c.total), 1);
    $(`#cat-${kind}`).innerHTML = cats.sort((a, b) => b.total - a.total).map((c) => `
      <div class="card cat-card" style="--c:${esc(c.color)};animation:rise .45s both;animation-delay:${i++ * 35}ms" data-id="${esc(c.id)}">
        <div class="top"><span class="emoji-tile" style="--c:${esc(c.color)}">${esc(c.icon)}</span>
          <div class="meta"><b>${esc(c.name)}</b><small>${c.total ? `<span class="amount">${money(c.total)}</span>` : 'Sin movimientos'} en ${monthName(state.month, { month: 'long' })}</small></div></div>
        <div class="mini-bar"><div style="width:${(c.total / max) * 100}%"></div></div>
      </div>`).join('') + `<button class="add-card" data-new-cat="${kind}">${icon('plus')}Nueva categoría</button>`;
  }
  $$('.cat-card').forEach((el) => el.onclick = () => openCategory(state.categories.find((c) => c.id === el.dataset.id)));
  $$('[data-new-cat]').forEach((b) => b.onclick = () => openCategory(null, b.dataset.newCat));
}
const dlgCat = $('#dlg-category'), formCat = $('#form-category');
let editingCat = null;
function openCategory(c = null, kind = 'gasto') {
  editingCat = c;
  formCat.name.value = c?.name || '';
  formCat.kind.value = c?.kind || kind;
  formCat.icon.value = c?.icon || '';
  swatches($('#cat-swatches'), formCat.color, c?.color || PALETTE[state.categories.length % PALETTE.length]);
  $('#category-title').textContent = c ? 'Editar categoría' : 'Nueva categoría';
  $('#category-delete').hidden = !c;
  $('#category-error').textContent = '';
  dlgCat.showModal();
}
formCat.addEventListener('submit', async (e) => {
  e.preventDefault();
  const c = { ...Object.fromEntries(new FormData(formCat)), id: editingCat?.id };
  if (!c.name.trim()) return ($('#category-error').textContent = 'El nombre es obligatorio');
  if (state.categories.some((x) => x.name.trim().toLowerCase() === c.name.trim().toLowerCase() && x.id !== c.id)) {
    return ($('#category-error').textContent = 'Ya existe una categoría con ese nombre');
  }
  dlgCat.close();
  try { await save(() => store.saveCategory(c, state), 'Categoría guardada'); }
  catch (err) { if (!(err instanceof store.AuthError)) toast(err.message); }
});
$('#category-delete').onclick = async () => {
  if (!confirm('¿Eliminar esta categoría? Los movimientos conservarán el nombre, pero sin color ni ícono.')) return;
  dlgCat.close();
  try { await save(() => store.deleteCategory(editingCat.id), 'Categoría eliminada'); }
  catch (err) { if (!(err instanceof store.AuthError)) toast(err.message); }
};

$$('[data-close]').forEach((b) => b.onclick = () => b.closest('dialog').close());
// Cerrar un diálogo tocando fuera de él
$$('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

start();
