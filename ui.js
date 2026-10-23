// Íconos, gráficos SVG y animaciones de la interfaz.

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  wallet: '<path d="M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 6v12a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-3"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><path d="M7.5 7.5h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M9.9 5.2A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.9 3.9M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  sheet: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/>',
  chevronL: '<path d="m15 18-6-6 6-6"/>',
  chevronR: '<path d="m9 18 6-6-6-6"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  income: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  expense: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  transfer: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  dollar: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  telegram: '<path d="m22 3-9.5 18-2.5-8-8-2.5z"/><path d="m22 3-12 10"/>',
};

export const icon = (name) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;

/** Rellena todos los elementos con data-icon="nombre" (antes de su texto). */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]:not([data-icon-done])').forEach((el) => {
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));
    el.dataset.iconDone = '1';
  });
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (t) => 1 - Math.pow(1 - t, 3);

/** Anima un número desde su valor anterior hasta el nuevo. */
export function countUp(el, value, format) {
  const from = el._value ?? 0;
  el._value = value;
  cancelAnimationFrame(el._raf);
  if (reducedMotion() || from === value) { el.textContent = format(value); return; }
  const start = performance.now();
  const dur = 750;
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    el.textContent = format(from + (value - from) * ease(t));
    if (t < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

/** Onda al presionar botones (efecto "ripple"). */
export function enableRipple() {
  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.btn, .fab, .pills button, .side-nav button, .bottom-nav button');
    if (!btn || reducedMotion()) return;
    const r = btn.getBoundingClientRect();
    const s = document.createElement('span');
    const size = Math.max(r.width, r.height) * 2;
    s.className = 'ripple';
    s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    btn.appendChild(s);
    setTimeout(() => s.remove(), 600);
  });
}

// ---------- Gráfico de línea ----------
/** Curva suave monótona (Fritsch–Carlson): nunca se pasa por encima ni por debajo de los datos reales. */
function smoothPath(pts) {
  const n = pts.length;
  if (n < 2) return n ? `M${pts[0][0]},${pts[0][1]}` : '';
  const m = [];
  for (let i = 0; i < n - 1; i++) m.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
  const t = [m[0], ...m.slice(1).map((v, i) => (m[i] * v <= 0 ? 0 : (m[i] + v) / 2)), m[n - 2]];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], dx = (x1 - x0) / 3;
    d += ` C${x0 + dx},${y0 + t[i] * dx} ${x1 - dx},${y1 - t[i + 1] * dx} ${x1},${y1}`;
  }
  return d;
}

function niceMax(v) {
  if (v <= 0) return 10;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * exp;
}

/**
 * series: [{ key, name, values[], color }] — labels[] para el eje X, tipLabels[] para la burbuja.
 */
export function lineChart(container, { labels, tipLabels, series, format, compact }) {
  const W = Math.max(container.clientWidth, 280);
  const H = container.clientHeight || 240;
  const pad = { l: 46, r: 12, t: 16, b: 28 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(...series.flatMap((s) => s.values), 0) * 1.1);
  const n = labels.length;
  const x = (i) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v) => pad.t + ih - (v / max) * ih;

  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const gy = pad.t + ih - f * ih;
    return `<line x1="${pad.l}" x2="${W - pad.r}" y1="${gy}" y2="${gy}" class="grid"/>
      <text x="${pad.l - 8}" y="${gy + 4}" class="axis y" text-anchor="end">${compact(max * f)}</text>`;
  }).join('');
  const every = Math.ceil(n / Math.max(2, Math.floor(iw / 46)));
  const xl = labels.map((l, i) => (i % every === 0 || i === n - 1)
    ? `<text x="${x(i)}" y="${H - 8}" class="axis" text-anchor="middle">${l}</text>` : '').join('');

  const paths = series.map((s) => {
    const pts = s.values.map((v, i) => [x(i), y(v)]);
    const line = smoothPath(pts);
    const area = `${line} L${x(n - 1)},${pad.t + ih} L${x(0)},${pad.t + ih} Z`;
    return `<defs><linearGradient id="g-${s.key}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${s.color}" stop-opacity=".35"/><stop offset="100%" stop-color="${s.color}" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${area}" fill="url(#g-${s.key})" class="area"/>
      <path d="${line}" stroke="${s.color}" class="line" data-line/>`;
  }).join('');

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${grid}${xl}${paths}
      <line class="guide" y1="${pad.t}" y2="${pad.t + ih}" opacity="0"/>
      ${series.map((s) => `<circle r="5" class="dot" fill="${s.color}" opacity="0" data-dot="${s.key}"/>`).join('')}
      <rect x="${pad.l}" y="0" width="${iw}" height="${H}" fill="transparent" class="hit"/>
    </svg><div class="tip" hidden></div>`;

  if (!reducedMotion()) {
    container.querySelectorAll('[data-line]').forEach((p) => {
      const len = p.getTotalLength();
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
      requestAnimationFrame(() => { p.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.3,.7,.2,1)'; p.style.strokeDashoffset = '0'; });
    });
  }

  const svg = container.querySelector('svg');
  const tip = container.querySelector('.tip');
  const guide = svg.querySelector('.guide');
  const show = (clientX) => {
    const r = svg.getBoundingClientRect();
    const px = (clientX - r.left) * (W / r.width);
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / iw) * (n - 1))));
    guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i)); guide.setAttribute('opacity', '1');
    series.forEach((s) => {
      const d = svg.querySelector(`[data-dot="${s.key}"]`);
      d.setAttribute('cx', x(i)); d.setAttribute('cy', y(s.values[i])); d.setAttribute('opacity', '1');
    });
    tip.hidden = false;
    tip.innerHTML = `<b>${tipLabels[i]}</b>${series.map((s) => `<span><i style="background:${s.color}"></i>${s.name}: ${format(s.values[i])}</span>`).join('')}`;
    const top = Math.min(...series.map((s) => y(s.values[i])));
    const left = (x(i) / W) * r.width;
    tip.style.left = `${Math.max(70, Math.min(r.width - 70, left))}px`;
    tip.style.top = `${(top / H) * r.height}px`;
  };
  const hide = () => {
    tip.hidden = true; guide.setAttribute('opacity', '0');
    svg.querySelectorAll('[data-dot]').forEach((d) => d.setAttribute('opacity', '0'));
  };
  svg.addEventListener('pointermove', (e) => show(e.clientX));
  svg.addEventListener('pointerdown', (e) => show(e.clientX));
  svg.addEventListener('pointerleave', hide);
}

// ---------- Dona ----------
/** items: [{ name, value, color, icon }]. Al pasar el mouse por un segmento o por la leyenda, el centro muestra el detalle. */
export function donut(container, legend, items, { format, centerLabel }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const R = 76, C = 2 * Math.PI * R, gap = items.length > 1 ? 3 : 0;
  let acc = 0;
  const segs = items.map((it, k) => {
    const len = Math.max(0, (it.value / total) * C - gap);
    const seg = `<circle class="seg" data-k="${k}" r="${R}" cx="100" cy="100" stroke="${it.color}"
      stroke-dasharray="0 ${C}" data-dash="${len} ${C - len}" stroke-dashoffset="${-acc}"/>`;
    acc += (it.value / total) * C;
    return seg;
  }).join('');
  container.innerHTML = `<svg viewBox="0 0 200 200"><circle class="track" r="${R}" cx="100" cy="100"/>
      <g transform="rotate(-90 100 100)">${segs}</g></svg>
    <div class="donut-center"><strong></strong><span></span></div>`;

  const strong = container.querySelector('.donut-center strong');
  const span = container.querySelector('.donut-center span');
  const reset = () => { strong.textContent = format(total); span.textContent = centerLabel; };
  reset();

  legend.innerHTML = items.map((it, k) => `
    <div class="lg-row" data-k="${k}" style="--c:${it.color};--i:${k}">
      <span class="lg-ico">${it.icon}</span>
      <span class="lg-name">${it.name}</span>
      <span class="lg-val">${format(it.value)}</span>
      <span class="lg-pct">${Math.round((it.value / total) * 100)}%</span>
      <div class="lg-bar"><div style="width:${(it.value / items[0].value) * 100}%"></div></div>
    </div>`).join('');

  const focus = (k) => {
    container.querySelectorAll('.seg').forEach((s) => s.classList.toggle('dim', k !== null && s.dataset.k !== String(k)));
    legend.querySelectorAll('.lg-row').forEach((r) => r.classList.toggle('on', r.dataset.k === String(k)));
    if (k === null) return reset();
    strong.textContent = `${Math.round((items[k].value / total) * 100)}%`;
    span.textContent = items[k].name;
  };
  [...container.querySelectorAll('.seg'), ...legend.querySelectorAll('.lg-row')].forEach((el) => {
    el.addEventListener('pointerenter', () => focus(Number(el.dataset.k)));
    el.addEventListener('pointerleave', () => focus(null));
  });

  const draw = () => container.querySelectorAll('.seg').forEach((s) => s.setAttribute('stroke-dasharray', s.dataset.dash));
  if (reducedMotion()) draw(); else requestAnimationFrame(() => requestAnimationFrame(draw));
}
