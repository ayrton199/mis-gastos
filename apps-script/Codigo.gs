// ⚠️ Archivo generado por tools/build-apps-script.mjs: no lo edites a mano.
// Cópialo completo en Extensiones → Apps Script de tu Google Sheet.

// ===================== Bot de Telegram para Mis Gastos =====================
// Vive dentro de tu Google Sheet (Extensiones → Apps Script). Cada minuto revisa
// los mensajes nuevos de tu bot y registra los movimientos en la pestaña "Movimientos".
//
// Configuración (una vez):
//   1. Configuración del proyecto → Propiedades del script → agrega TELEGRAM_TOKEN con el token de @BotFather.
//   2. Ejecuta la función "configurar" y acepta los permisos.
//   3. Escríbele /start a tu bot: tu chat queda registrado como el único autorizado.
//   Opcional, para leer fotos de recibos: agrega GEMINI_API_KEY (clave gratis de https://aistudio.google.com/apikey)
//   y vuelve a ejecutar "configurar".

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
  if (props().getProperty('GEMINI_API_KEY')) {
    console.log(`✅ Lectura de recibos activa con el modelo ${elegirModeloGemini_()}.`);
  } else {
    console.log('ℹ️ Sin GEMINI_API_KEY: el bot no leerá fotos (solo el texto que escribas en el pie de la foto).');
  }
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
  '• 📷 Envía la foto de un recibo y lo leo solo. En el pie de la foto puedes indicar la cuenta (ej: pichincha).',
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
  const archivo = archivoDelMensaje_(msg);
  if (archivo) return procesarRecibo_(chatId, archivo, texto);
  if (!texto) return responder_(chatId, 'Solo entiendo texto o fotos de recibos. Ej: almuerzo 3.50 pichincha');
  if (['start', 'ayuda', 'help', 'hola', 'menu'].includes(cmd)) return responder_(chatId, AYUDA);
  if (['saldo', 'saldos'].includes(cmd)) return responder_(chatId, textoSaldos_());
  if (['mes', 'resumen'].includes(cmd)) return responder_(chatId, textoMes_());
  if (cmd === 'deshacer') return responder_(chatId, deshacer_());

  const datos = leerDatos_();
  const borrador = parseMessage(texto, datos);
  if (!borrador) return responder_(chatId, 'No encontré un monto en tu mensaje. Ej: almuerzo 3.50 pichincha\nEscribe ayuda para ver más ejemplos.');

  agregarMovimiento_(borrador);
  responder_(chatId, confirmacion_(borrador, datos));
}

// ---------- Recibos (fotos) con Gemini ----------
function archivoDelMensaje_(msg) {
  if (msg.photo && msg.photo.length) return { fileId: msg.photo[msg.photo.length - 1].file_id, mime: 'image/jpeg' };
  const doc = msg.document;
  if (doc && /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(doc.mime_type || '')) return { fileId: doc.file_id, mime: doc.mime_type };
  return null;
}

function procesarRecibo_(chatId, archivo, pie) {
  const datos = leerDatos_();
  // Si el pie de la foto ya trae el monto, se usa el texto (es lo más preciso)
  const desdeTexto = pie ? parseMessage(pie, datos) : null;
  if (desdeTexto) {
    agregarMovimiento_(desdeTexto);
    return responder_(chatId, confirmacion_(desdeTexto, datos));
  }
  if (!props().getProperty('GEMINI_API_KEY')) {
    return responder_(chatId, 'Para leer fotos falta configurar GEMINI_API_KEY. Mientras tanto, escribe el monto en el pie de la foto. Ej: supermaxi 45,80');
  }

  const info = telegram_('getFile', { file_id: archivo.fileId });
  const token = props().getProperty('TELEGRAM_TOKEN');
  const bytes = UrlFetchApp.fetch(`https://api.telegram.org/file/bot${token}/${info.file_path}`).getBlob().getBytes();
  const r = leerReciboConGemini_(Utilities.base64Encode(bytes), archivo.mime, pie, datos);
  if (!r || !r.es_recibo || !(r.monto > 0)) {
    return responder_(chatId, 'No pude leer un monto en esa imagen. Escríbelo en el pie de la foto. Ej: supermaxi 45,80');
  }

  const hoy = fechaISO_(new Date());
  const tipo = r.tipo === 'ingreso' ? 'ingreso' : 'gasto';
  // La cuenta escrita en el pie ("pichincha") manda sobre lo que adivine Gemini
  const cuentaPie = pie ? findAccount(norm(pie).replace(/\s+/g, ' '), datos.accounts) : null;
  const cuenta = (cuentaPie && cuentaPie.account)
    || datos.accounts.find((a) => a.name === r.cuenta)
    || datos.accounts.find((a) => a.is_default) || datos.accounts[0];
  const categoria = datos.categories.find((c) => c.name === r.categoria && c.kind === tipo)
    || datos.categories.find((c) => c.kind === tipo && c.name.indexOf('Otros') === 0);
  const t = {
    type: tipo,
    amount: Math.round(Math.abs(r.monto) * 100) / 100,
    date: /^\d{4}-\d{2}-\d{2}$/.test(r.fecha || '') && r.fecha <= hoy ? r.fecha : hoy,
    account: cuenta ? cuenta.name : '',
    category: categoria ? categoria.name : '',
    merchant: r.comercio || '',
    description: r.descripcion || '',
  };
  agregarMovimiento_(t);
  responder_(chatId, `🧾 Leí tu recibo:\n${confirmacion_(t, datos)}`);
}

function leerReciboConGemini_(base64, mime, pie, datos) {
  const gastos = datos.categories.filter((c) => c.kind === 'gasto').map((c) => c.name);
  const ingresos = datos.categories.filter((c) => c.kind === 'ingreso').map((c) => c.name);
  const cuentas = datos.accounts.map((a) => a.name);
  const prompt = [
    `Hoy es ${fechaISO_(new Date())}. Extrae el movimiento de este recibo, factura o comprobante (Ecuador, montos en dólares).`,
    'Usa el TOTAL pagado (con IVA y propina), no subtotales. Si no ves el año, usa el actual. Si no hay fecha, usa hoy.',
    `Categorías de gasto: ${gastos.join(', ')}. Categorías de ingreso: ${ingresos.join(', ')}.`,
    `Cuentas: ${cuentas.join(', ')}. Elige la cuenta solo si hay una pista clara (banco o tarjeta del comprobante, o el pie de foto); si no, deja cuenta vacía.`,
    pie ? `Pie de foto del usuario: "${pie}"` : '',
    'Un comprobante de transferencia o depósito recibido es un ingreso; una compra o pago es un gasto.',
    'Si la imagen no es un recibo ni comprobante, marca es_recibo = false.',
  ].filter(Boolean).join('\n');

  const body = {
    contents: [{ parts: [{ inline_data: { mime_type: mime, data: base64 } }, { text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          es_recibo: { type: 'BOOLEAN' },
          tipo: { type: 'STRING', enum: ['gasto', 'ingreso'] },
          monto: { type: 'NUMBER' },
          fecha: { type: 'STRING', description: 'AAAA-MM-DD' },
          comercio: { type: 'STRING' },
          descripcion: { type: 'STRING', description: 'Breve, en español' },
          categoria: { type: 'STRING', enum: gastos.concat(ingresos) },
          cuenta: { type: 'STRING', enum: [''].concat(cuentas) },
        },
        required: ['es_recibo', 'tipo', 'monto', 'fecha', 'comercio', 'descripcion', 'categoria', 'cuenta'],
      },
    },
  };

  let modelo = elegirModeloGemini_();
  for (let intento = 0; intento < 2; intento++) {
    const res = UrlFetchApp.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true,
      headers: { 'x-goog-api-key': props().getProperty('GEMINI_API_KEY') },
    });
    const code = res.getResponseCode();
    const json = JSON.parse(res.getContentText() || '{}');
    if (code === 200) {
      const parte = json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts;
      const texto = parte && parte.map((p) => p.text || '').join('');
      return texto ? JSON.parse(texto) : null;
    }
    if (code === 404 && intento === 0) {
      // El modelo guardado dejó de existir: se elige otro y se reintenta
      props().deleteProperty('GEMINI_MODEL_AUTO');
      modelo = elegirModeloGemini_();
      continue;
    }
    if (code === 429) throw new Error('se alcanzó el límite gratuito de Gemini por ahora; intenta en un rato o escribe el monto en el pie de la foto');
    throw new Error(`Gemini (${code}): ${(json.error && json.error.message) || 'error desconocido'}`);
  }
  return null;
}

/** Elige un modelo "flash" disponible para tu clave (o el de la propiedad GEMINI_MODEL, si la defines). */
function elegirModeloGemini_() {
  const fijo = props().getProperty('GEMINI_MODEL') || props().getProperty('GEMINI_MODEL_AUTO');
  if (fijo) return fijo;
  const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': props().getProperty('GEMINI_API_KEY') }, muteHttpExceptions: true,
  });
  const json = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() !== 200) throw new Error(`Gemini: ${(json.error && json.error.message) || 'clave inválida'}`);
  const flash = (json.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0)
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /flash/.test(n) && !/(image|tts|audio|live|embedding)/.test(n));
  // Preferir los estables; si no hay, cualquiera "flash"
  const estables = flash.filter((n) => !/(lite|thinking|exp|preview|8b)/.test(n));
  const candidatos = estables.length ? estables : flash;
  // Versión más nueva primero (gemini-3.5-flash antes que gemini-2.5-flash)
  const version = (n) => Number((n.match(/(\d+(\.\d+)?)/) || [0, 0])[1]);
  candidatos.sort((a, b) => version(b) - version(a) || a.length - b.length);
  if (!candidatos.length) throw new Error('No encontré un modelo Gemini "flash" disponible para tu clave.');
  props().setProperty('GEMINI_MODEL_AUTO', candidatos[0]);
  return candidatos[0];
}

function confirmacion_(t, datos) {
  const cat = datos.categories.find((c) => c.name === t.category);
  return [
    `✅ ${t.type === 'gasto' ? 'Gasto' : 'Ingreso'} registrado`,
    `${t.type === 'gasto' ? '−' : '+'}${dinero_(t.amount)} · ${cat ? cat.icon + ' ' : ''}${t.category || 'Sin categoría'}`,
    t.merchant ? `🏪 ${t.merchant}` : null,
    `📅 ${t.date} · 🏦 ${t.account}`,
    t.description ? `📝 ${t.description}` : null,
    'Escribe deshacer si algo está mal.',
  ].filter(Boolean).join('\n');
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


// ===================== Intérprete de mensajes (copiado de parser.js) =====================
const CURRENCY = 'USD';

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
function parseMessage(raw, { accounts, categories }) {
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
