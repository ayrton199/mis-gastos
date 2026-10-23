// Genera apps-script/Codigo.gs (el archivo que se pega en Apps Script) a partir de
// parser.js (el mismo intérprete de la app web) + apps-script/bot.js.
// Uso: node tools/build-apps-script.mjs
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const { CURRENCY } = await import(new URL('config.js', root));

const parser = read('parser.js')
  .replace(/^import .*\n/m, `const CURRENCY = '${CURRENCY}';\n`)
  .replace(/^export /gm, '');

const out = [
  '// ⚠️ Archivo generado por tools/build-apps-script.mjs: no lo edites a mano.',
  '// Cópialo completo en Extensiones → Apps Script de tu Google Sheet.',
  '',
  read('apps-script/bot.js'),
  '',
  '// ===================== Intérprete de mensajes (copiado de parser.js) =====================',
  parser,
].join('\n');

fs.writeFileSync(new URL('apps-script/Codigo.gs', root), out);
console.log(`apps-script/Codigo.gs generado (${out.split('\n').length} líneas)`);
