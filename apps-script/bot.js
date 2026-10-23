// ===================== Bot de Telegram para Mis Gastos =====================
// Vive dentro de tu Google Sheet (Extensiones → Apps Script). Cada minuto revisa
// los mensajes nuevos de tu bot y registra los movimientos en la pestaña "Movimientos".
//
// Configuración (una vez):
//   1. Configuración del proyecto → Propiedades del script → agrega TELEGRAM_TOKEN con el token de @BotFather.
//   2. Ejecuta la función "configurar" y acepta los permisos.
//   3. Escríbele /start a tu bot: tu chat queda registrado como el único autorizado.

const TAB_MOVIMIENTOS = 'Movimientos';
const MOV_HEADERS = ['ID', 'Fecha', 'Tipo', 'Monto', 'Cuenta', 'Cuenta destino', 'Categoría', 'Comercio', 'Descripción', 'Origen', 'Registrado'];

const props = () => PropertiesService.getScriptProperties();

function configurar() {
  const token = props().getProperty('TELEGRAM_TOKEN');
  if (!token) throw new Error('Falta la propiedad TELEGRAM_TOKEN (Configuración del proyecto → Propiedades del script).');
  const me = telegram_('getMe');
  telegram_('deleteWebhook'); // el bot funciona revisando mensajes, no con webhook

  const headers = hoja_(TAB_MOVIMIENTOS).getRange(1, 1, 1, MOV_HEADERS.length).getValues()[0];
  if (MOV_HEADERS.some((h, i) => headers[i] !== h)) {
    throw new Error('La pestaña Movimientos no tiene el formato esperado. Abre primero la app web una vez para que la prepare.');
  }

  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'revisarMensajes')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('revisarMensajes').timeBased().everyMinutes(1).create();

  const tz = Session.getScriptTimeZone();
  console.log(`✅ Bot @${me.username} listo. Escríbele /start desde Telegram.`);
  if (tz !== 'America/Guayaquil') console.warn(`La zona horaria del proyecto es ${tz}. Cámbiala a America/Guayaquil en Configuración del proyecto para que "hoy" y "ayer" sean correctos.`);
}

/** Se ejecuta cada minuto: procesa los mensajes que llegaron desde la última revisión. */
function revisarMensajes() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const offset = Number(props().getProperty('TELEGRAM_OFFSET') || 0);
    const updates = telegram_('getUpdates', { offset, timeout: 0, allowed_updates: ['message'] });
    for (const u of updates) {
      props().setProperty('TELEGRAM_OFFSET', String(u.update_id + 1)); // primero, para no repetir si algo falla
      if (!u.message) continue;
      try {
        procesarMensaje_(u.message);
      } catch (err) {
        console.error(err);
        responder_(u.message.chat.id, `⚠️ No pude registrar eso: ${err.message}`);
      }
    }
  } finally {
    lock.releaseLock();
  }
}

const AYUDA = [
  '📒 Mis Gastos',
  '',
  '• Escribe un gasto: almuerzo 3.50 pichincha · taxi 2,50 ayer · gasolina 20 lucas',
  '• Ingresos: me cayó la quincena 450, o con + adelante: +80 cachuelo',
  '• Fecha opcional: ayer, anteayer o 15/10. Cuenta opcional: nombre de la cuenta o del banco.',
  '',
  'saldo → saldos de tus cuentas',
  'mes → resumen del mes',
  'deshacer → borra el último movimiento que enviaste',
].join('\n');

function procesarMensaje_(msg) {
  const chatId = String(msg.chat.id);
  const texto = String(msg.text || msg.caption || '').trim();
  const dueno = props().getProperty('TELEGRAM_CHAT_ID');

  if (!dueno) {
    if (texto.startsWith('/start')) {
      props().setProperty('TELEGRAM_CHAT_ID', chatId);
      return responder_(chatId, `✅ Listo, este chat quedó registrado como el tuyo.\n\n${AYUDA}`);
    }
    return; // nadie registrado todavía: solo /start
  }
  if (chatId !== dueno) return; // ignora a cualquier otra persona

  const cmd = normalizar_(texto).replace(/^\//, '');
  if (!texto) return responder_(chatId, 'Solo entiendo texto. Ej: almuerzo 3.50 pichincha');
  if (['start', 'ayuda', 'help', 'hola', 'menu'].includes(cmd)) return responder_(chatId, AYUDA);
  if (['saldo', 'saldos'].includes(cmd)) return responder_(chatId, textoSaldos_());
  if (['mes', 'resumen'].includes(cmd)) return responder_(chatId, textoMes_());
  if (cmd === 'deshacer') return responder_(chatId, deshacer_());

  const datos = leerDatos_();
  const borrador = parseMessage(texto, datos);
  if (!borrador) return responder_(chatId, 'No encontré un monto en tu mensaje. Ej: almuerzo 3.50 pichincha\nEscribe ayuda para ver más ejemplos.');

  agregarMovimiento_(borrador);
  const cat = datos.categories.find((c) => c.name === borrador.category);
  const signo = borrador.type === 'gasto' ? '−' : '+';
  responder_(chatId, [
    `✅ ${borrador.type === 'gasto' ? 'Gasto' : 'Ingreso'} registrado`,
    `${signo}${dinero_(borrador.amount)} · ${cat ? cat.icon + ' ' : ''}${borrador.category || 'Sin categoría'}`,
    `📅 ${borrador.date} · 🏦 ${borrador.account}`,
    borrador.description ? `📝 ${borrador.description}` : null,
    'Escribe deshacer si algo está mal.',
  ].filter(Boolean).join('\n'));
}

// ---------- Hoja ----------
function hoja_(nombre) {
  const sh = SpreadsheetApp.getActive().getSheetByName(nombre);
  if (!sh) throw new Error(`No existe la pestaña "${nombre}". Abre primero la app web una vez.`);
  return sh;
}

function filas_(nombre, columnas) {
  const sh = hoja_(nombre);
  const n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, columnas).getValues().filter((r) => r[0] !== '') : [];
}

function leerDatos_() {
  return {
    accounts: filas_('Cuentas', 7).map((r) => ({
      id: String(r[0]), name: String(r[1]), bank: String(r[2]), initial_balance: Number(r[4]) || 0,
      is_default: /^(s[ií]|si|true|x|1)$/i.test(String(r[6])),
    })),
    categories: filas_('Categorías', 5).map((r) => ({ id: String(r[0]), name: String(r[1]), kind: String(r[2]).toLowerCase(), icon: String(r[4] || '') })),
  };
}

function movimientos_() {
  return filas_(TAB_MOVIMIENTOS, MOV_HEADERS.length).map((r) => ({
    id: String(r[0]), date: r[1] instanceof Date ? fechaISO_(r[1]) : String(r[1]), type: String(r[2]).toLowerCase(),
    amount: Number(r[3]) || 0, account: String(r[4]), to_account: String(r[5]), category: String(r[6]), description: String(r[8]), source: String(r[9]),
  }));
}

/** Evita que Sheets interprete como fórmula un texto que empieza con = + - @ */
const seguro_ = (v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v);

function agregarMovimiento_(t) {
  const sh = hoja_(TAB_MOVIMIENTOS);
  // Primera fila vacía según la columna ID (la columna "Mes" tiene una fórmula que llega hasta abajo)
  const ids = sh.getRange('A:A').getValues();
  let fila = ids.length;
  while (fila > 1 && ids[fila - 1][0] === '') fila--;
  fila += 1;
  if (fila > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 100);
  const [y, m, d] = t.date.split('-').map(Number);
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const registrado = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  sh.getRange(fila, 1, 1, MOV_HEADERS.length).setValues([[
    id, new Date(y, m - 1, d), t.type, t.amount, seguro_(t.account), '', seguro_(t.category),
    seguro_(t.merchant || ''), seguro_(t.description || ''), 'telegram', registrado,
  ]]);
}

function deshacer_() {
  const sh = hoja_(TAB_MOVIMIENTOS);
  const n = sh.getLastRow();
  if (n < 2) return 'No hay movimientos para deshacer.';
  const valores = sh.getRange(2, 1, n - 1, MOV_HEADERS.length).getValues();
  for (let i = valores.length - 1; i >= 0; i--) {
    if (valores[i][9] === 'telegram') {
      sh.deleteRow(i + 2);
      return `🗑️ Eliminado: ${dinero_(Number(valores[i][3]))} ${valores[i][8] || valores[i][6]}`;
    }
  }
  return 'No hay movimientos enviados desde Telegram para deshacer.';
}

function textoSaldos_() {
  const { accounts } = leerDatos_();
  const movs = movimientos_();
  let total = 0;
  const lineas = accounts.map((a) => {
    let saldo = a.initial_balance;
    for (const t of movs) {
      if (t.account === a.name) saldo += t.type === 'ingreso' ? t.amount : -t.amount;
      if (t.type === 'transferencia' && t.to_account === a.name) saldo += t.amount;
    }
    total += saldo;
    return `• ${a.name}${a.bank && a.bank !== a.name ? ` (${a.bank})` : ''}: ${dinero_(saldo)}`;
  });
  return ['🏦 Saldos', ...lineas, `Total: ${dinero_(total)}`].join('\n');
}

function textoMes_() {
  const mes = fechaISO_(new Date()).slice(0, 7);
  const movs = movimientos_().filter((t) => t.date.startsWith(mes));
  const suma = (tipo) => movs.filter((t) => t.type === tipo).reduce((s, t) => s + t.amount, 0);
  const porCat = {};
  movs.filter((t) => t.type === 'gasto').forEach((t) => { porCat[t.category || 'Sin categoría'] = (porCat[t.category || 'Sin categoría'] || 0) + t.amount; });
  const top = Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, v]) => `• ${c}: ${dinero_(v)}`);
  return [
    `📊 Resumen de ${mes}`,
    `Ingresos: ${dinero_(suma('ingreso'))}`,
    `Gastos: ${dinero_(suma('gasto'))}`,
    `Balance: ${dinero_(suma('ingreso') - suma('gasto'))}`,
    ...(top.length ? ['', 'Más gastado:', ...top] : []),
  ].join('\n');
}

// ---------- Utilidades ----------
function telegram_(metodo, datos) {
  const token = props().getProperty('TELEGRAM_TOKEN');
  const r = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(datos || {}), muteHttpExceptions: true,
  });
  const json = JSON.parse(r.getContentText());
  if (!json.ok) throw new Error(`Telegram (${metodo}): ${json.description}`);
  return json.result;
}

function responder_(chatId, texto) {
  telegram_('sendMessage', { chat_id: chatId, text: texto });
}

function normalizar_(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function fechaISO_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function dinero_(n) {
  const [ent, dec] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 ? '-' : ''}$${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}
