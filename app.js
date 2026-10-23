import { CURRENCY, LOCALE } from './config.js';
import * as store from './store.js';
import { parseMessage } from './parser.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toLocaleDateString('sv-SE');
const fmt = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY });
const money = (n) => fmt.format(n);

const state = { transactions: [], accounts: [], categories: [], view: 'resumen' };

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 3000);
}

/** Ejecuta una operación con la hoja mostrando "cargando"; si la sesión expiró, vuelve a la pantalla de entrada. */
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
    $('#sheet-link').textContent = `📄 ${title}`;
    $('#sheet-link').href = store.sheetUrl();
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
$('#btn-settings').onclick = () => {
  $('#settings-sheet').href = store.sheetUrl();
  $('#settings-sheet').textContent = $('#sheet-link').textContent;
  $('#dlg-settings').showModal();
};
$('#btn-change-sheet').onclick = () => {
  $('#dlg-settings').close();
  $('#sheet-url').value = '';
  showGate('sheet');
};
$('#btn-logout').onclick = () => {
  store.signOut();
  $('#dlg-settings').close();
  showGate('login');
};
$('#btn-refresh').onclick = () => reload().then(() => toast('Datos actualizados desde la hoja'));

async function reload() {
  Object.assign(state, await busy(() => store.loadAll()));
  render();
}

/** Guarda en la hoja y recarga los datos. */
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
const catInfo = (name) => state.categories.find((c) => c.name === name) ?? { name: name || 'Sin categoría', color: '#8a8f98', icon: '•' };
const sorted = (list) => [...list].sort((a, b) => b.date.localeCompare(a.date) || String(b.created).localeCompare(String(a.created)));

// ---------- Navegación ----------
$('#tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-view]');
  if (!btn) return;
  state.view = btn.dataset.view;
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b === btn));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${state.view}`));
  render();
});

function render() {
  fillFilterSelects();
  if (state.view === 'resumen') renderSummary();
  if (state.view === 'movimientos') renderTransactions();
  if (state.view === 'cuentas') renderAccounts();
  if (state.view === 'categorias') renderCategories();
}

// ---------- Resumen ----------
$('#month').value = today().slice(0, 7);
$('#month').addEventListener('change', renderSummary);

function renderSummary() {
  const month = $('#month').value || today().slice(0, 7);
  const inMonth = state.transactions.filter((t) => t.date.startsWith(month));
  const ingresos = inMonth.filter((t) => t.type === 'ingreso').reduce((s, t) => s + t.amount, 0);
  const gastos = inMonth.filter((t) => t.type === 'gasto').reduce((s, t) => s + t.amount, 0);
  $('#s-ingresos').textContent = money(ingresos);
  $('#s-gastos').textContent = money(gastos);
  $('#s-balance').textContent = money(ingresos - gastos);
  $('#s-balance').className = ingresos - gastos >= 0 ? 'pos' : 'neg';
  const accs = balances();
  $('#s-total').textContent = money(accs.reduce((s, a) => s + a.balance, 0));

  const byCat = {};
  for (const t of inMonth.filter((t) => t.type === 'gasto')) byCat[t.category] = (byCat[t.category] ?? 0) + t.amount;
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...cats.map((c) => c[1]), 1);
  $('#by-category').innerHTML = cats.length ? cats.map(([name, total]) => {
    const c = catInfo(name);
    return `<div class="row">
      <span class="name">${esc(c.icon)} ${esc(c.name)}</span>
      <div class="track"><div class="fill" style="width:${(total / max) * 100}%;background:${esc(c.color)}"></div></div>
      <span class="val">${money(total)}</span>
    </div>`;
  }).join('') : '<div class="empty">Sin gastos este mes</div>';

  const months = [];
  const [y, m] = month.split('-').map(Number);
  for (let i = 5; i >= 0; i--) months.push(new Date(y, m - 1 - i, 1).toLocaleDateString('sv-SE').slice(0, 7));
  const series = months.map((mm) => {
    const list = state.transactions.filter((t) => t.date.startsWith(mm));
    return {
      month: mm,
      ingresos: list.filter((t) => t.type === 'ingreso').reduce((s, t) => s + t.amount, 0),
      gastos: list.filter((t) => t.type === 'gasto').reduce((s, t) => s + t.amount, 0),
    };
  });
  const mmax = Math.max(...series.flatMap((s) => [s.ingresos, s.gastos]), 1);
  const monthName = (mm) => new Date(`${mm}-15T12:00`).toLocaleDateString('es', { month: 'short' });
  $('#monthly').innerHTML = series.map((s) => `
    <div class="col" title="${s.month}: +${money(s.ingresos)} / −${money(s.gastos)}">
      <div class="pair">
        <div class="b i" style="height:${(s.ingresos / mmax) * 100}%"></div>
        <div class="b g" style="height:${(s.gastos / mmax) * 100}%"></div>
      </div>
      <span class="lbl">${monthName(s.month)}</span>
    </div>`).join('');

  $('#account-balances').innerHTML = accs.map((a) => `
    <div class="acc-row">
      <span class="dot" style="background:${esc(a.color)}"></span>
      <div class="meta">${esc(a.name)}<small>${esc(a.bank)}</small></div>
      <span class="amount ${a.balance < 0 ? 'neg' : ''}">${money(a.balance)}</span>
    </div>`).join('');

  const recent = sorted(state.transactions).slice(0, 6);
  $('#recent').innerHTML = recent.length ? recent.map(txRow).join('') : '<div class="empty">Registra tu primer movimiento</div>';
  $$('#recent .tx-row').forEach((el) => el.onclick = () => openTx(state.transactions.find((t) => t.id === el.dataset.id)));
}

function signedAmount(t) {
  if (t.type === 'transferencia') return `<span class="amount">${money(t.amount)}</span>`;
  return `<span class="amount ${t.type === 'gasto' ? 'neg' : 'pos'}">${t.type === 'gasto' ? '−' : '+'}${money(t.amount)}</span>`;
}
const txTitle = (t) => (t.type === 'transferencia' ? `Transferencia → ${t.to_account}` : (t.merchant || t.description || t.category || 'Movimiento'));
function txRow(t) {
  const c = catInfo(t.category);
  const icon = t.type === 'transferencia' ? '↔️' : c.icon;
  return `<div class="tx-row" data-id="${esc(t.id)}">
    <span class="icon" style="background:${esc(c.color)}22">${esc(icon)}</span>
    <div class="meta">${esc(txTitle(t))}<small>${esc(t.date)} · ${esc(t.account)}</small></div>
    ${signedAmount(t)}
  </div>`;
}

// ---------- Movimientos ----------
function fillFilterSelects() {
  const keepA = $('#f-account').value, keepC = $('#f-category').value;
  $('#f-account').innerHTML = '<option value="">Todas las cuentas</option>' +
    state.accounts.map((a) => `<option value="${esc(a.name)}">${esc(a.name)} · ${esc(a.bank)}</option>`).join('');
  $('#f-category').innerHTML = '<option value="">Todas las categorías</option>' +
    state.categories.map((c) => `<option value="${esc(c.name)}">${esc(c.icon)} ${esc(c.name)}</option>`).join('');
  $('#f-account').value = keepA; $('#f-category').value = keepC;
}
['#f-q', '#f-type', '#f-account', '#f-category', '#f-from', '#f-to'].forEach((s) =>
  $(s).addEventListener(s === '#f-q' ? 'input' : 'change', renderTransactions));

function renderTransactions() {
  const q = $('#f-q').value.trim().toLowerCase();
  const type = $('#f-type').value, acc = $('#f-account').value, cat = $('#f-category').value;
  const from = $('#f-from').value, to = $('#f-to').value;
  const rows = sorted(state.transactions).filter((t) =>
    (!q || `${t.description} ${t.merchant}`.toLowerCase().includes(q))
    && (!type || t.type === type)
    && (!acc || t.account === acc || t.to_account === acc)
    && (!cat || t.category === cat)
    && (!from || t.date >= from) && (!to || t.date <= to));
  $('#tx-table tbody').innerHTML = rows.map((t) => {
    const c = catInfo(t.category);
    return `<tr data-id="${esc(t.id)}">
      <td>${esc(t.date)}</td>
      <td class="desc">${esc(txTitle(t))}${t.merchant && t.description ? `<small style="display:block;color:var(--muted)">${esc(t.description)}</small>` : ''}</td>
      <td>${t.category ? `<span class="tag">${esc(c.icon)} ${esc(t.category)}</span>` : ''}</td>
      <td>${esc(t.account)}${t.to_account ? ` → ${esc(t.to_account)}` : ''}</td>
      <td class="r">${signedAmount(t)}</td>
      <td>${/^https:\/\//.test(t.receipt) ? `<a href="${esc(t.receipt)}" target="_blank" rel="noopener" title="Ver recibo" data-stop>🧾</a>` : ''}</td>
    </tr>`;
  }).join('');
  $('#tx-empty').hidden = rows.length > 0;
  $$('#tx-table tbody tr').forEach((el) => el.onclick = (e) => {
    if (!e.target.closest('[data-stop]')) openTx(state.transactions.find((t) => t.id === el.dataset.id));
  });
}

// ---------- Modal de movimiento ----------
const dlgTx = $('#dlg-tx');
const formTx = $('#form-tx');
let editingTx = null;
let receiptUrl = '';

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

function showReceipt(url) {
  receiptUrl = url || '';
  $('#tx-receipt').hidden = !receiptUrl;
  $('#tx-receipt').href = receiptUrl || '#';
  $('#btn-attach').textContent = receiptUrl ? '📎 Cambiar recibo' : '📎 Adjuntar foto del recibo';
}

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
  showReceipt(tx?.receipt);
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
  const t = { ...Object.fromEntries(new FormData(formTx)), receipt: receiptUrl, created: editingTx?.created };
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
$('#btn-new-2').onclick = () => openTx();

$('#btn-attach').onclick = () => $('#receipt-file').click();
$('#receipt-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const btn = $('#btn-attach');
  btn.disabled = true; btn.textContent = '⏳ Subiendo a tu Drive…';
  try { showReceipt(await store.uploadReceipt(file)); }
  catch (err) { $('#tx-error').textContent = err.message; showReceipt(receiptUrl); }
  finally { btn.disabled = false; }
});

// ---------- Registro rápido ----------
$('#quick').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#quick-text').value.trim();
  if (!text) return;
  const draft = parseMessage(text, state);
  if (!draft) return toast('No encontré un monto. Ej: almuerzo 3.50 pichincha');
  $('#quick-text').value = '';
  openTx(null, draft);
});

// ---------- Cuentas ----------
const TYPE_LABEL = { corriente: 'Cuenta corriente', ahorro: 'Cuenta de ahorros', credito: 'Tarjeta de crédito', efectivo: 'Efectivo', inversion: 'Inversión' };
function renderAccounts() {
  const byBank = Object.groupBy(balances(), (a) => a.bank || 'Sin banco');
  $('#banks').innerHTML = Object.entries(byBank).map(([bank, accs]) => `
    <div class="bank-group">
      <h3><span>🏦 ${esc(bank)}</span><span class="amount">${money(accs.reduce((s, a) => s + a.balance, 0))}</span></h3>
      <div class="acc-grid">${accs.map((a) => `
        <div class="card acc-card" style="--c:${esc(a.color)}" data-id="${esc(a.id)}">
          <div>${esc(a.name)}${a.is_default ? '<span class="badge">predeterminada</span>' : ''}</div>
          <div class="bal ${a.balance < 0 ? 'neg' : ''}">${money(a.balance)}</div>
          <small>${esc(TYPE_LABEL[a.type] || a.type)}</small>
        </div>`).join('')}
      </div>
    </div>`).join('') || '<div class="empty">Crea tu primera cuenta</div>';
  $$('.acc-card').forEach((el) => el.onclick = () => openAccount(state.accounts.find((a) => a.id === el.dataset.id)));
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
  formAcc.color.value = a?.color || '#4f7cff';
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
$('#btn-new-account').onclick = () => openAccount();

// ---------- Categorías ----------
function renderCategories() {
  for (const kind of ['gasto', 'ingreso']) {
    $(`#cat-${kind}`).innerHTML = state.categories.filter((c) => c.kind === kind).map((c) =>
      `<button class="cat-chip" style="--c:${esc(c.color)}" data-id="${esc(c.id)}">${esc(c.icon)} ${esc(c.name)}</button>`).join('');
  }
  $$('.cat-chip').forEach((el) => el.onclick = () => openCategory(state.categories.find((c) => c.id === el.dataset.id)));
}
const dlgCat = $('#dlg-category'), formCat = $('#form-category');
let editingCat = null;
function openCategory(c = null) {
  editingCat = c;
  formCat.name.value = c?.name || '';
  formCat.kind.value = c?.kind || 'gasto';
  formCat.icon.value = c?.icon || '';
  formCat.color.value = c?.color || '#4f7cff';
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
$('#btn-new-category').onclick = () => openCategory();

$$('[data-close]').forEach((b) => b.onclick = () => b.closest('dialog').close());

start();
