// The maps: each step of the model drawn as a chain of small pictures joined by labelled
// arrows. The explanations page shows the maps of steps 2, 3 and 4 one at a time. The map
// page shows everything at once (wholeMap), on a canvas that fills the window.
import { css, pct, sec } from './util.js';
import { hitDamage, swingsPmf, MAX_SWINGS, MAX_HITS } from './model.js';

export const PW = 212, PH = 158, GAP = 96, ROW2 = 222;
export const pc = (v) => Math.round(100 * v) + '%';
export const fx = (v) => String(+v.toFixed(2));
const halo = 'paint-order:stroke;stroke:var(--surface);stroke-width:4px;stroke-linejoin:round';
const haloIn = halo.replace('--surface', '--bg');

// One picture. o.xmin..o.xmax is the x range. The vertical axis is real: o.ylab names it and
// every height is a true value on it (a chance, or a chance per small step for a flat block,
// so a block's AREA is its chance). o.yTop = the value at the top of the plot (by default the
// highest data value sits at 85% of it). Optional parts: ticks, lines (dashed), rects (flat
// blocks, height v), spikes (one exact value: an arrow to the top, its chance written beside
// it, because a value with no width cannot be read on the axis), pmf (bars, o.mutedBar(d)
// greys a bar, o.marks = labels above chosen bars), curves (thin lines over the bars).
export function niceStep(x) {
  if (!(x > 1e-12) || !isFinite(x)) return 1; // nothing to scale: one step, never a zero step
  const e = Math.pow(10, Math.floor(Math.log10(x))), m = x / e;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e;
}
export function fmtPct(v) {
  const p = 100 * v;
  return (p === 0 ? '0' : p >= 10 ? p.toFixed(0) : p >= 1 ? String(+p.toFixed(1)) : String(+p.toPrecision(2))) + '%';
}
function panel(px, py, o, col) {
  const L = px + 50, R = px + PW - 14, top = py + 46, base = py + 116;
  const X = (v) => L + ((v - o.xmin) / ((o.xmax - o.xmin) || 1)) * (R - L);
  const t = (x, y, txt, extra = '') => `<text x="${x}" y="${y}" ${extra}>${txt}</text>`;
  const inRange = (d) => d >= o.xmin - 0.5 && d <= o.xmax + 0.5;
  // The highest data value fixes the scale.
  const d0 = Math.max(0, Math.ceil(o.xmin - 0.5)), d1 = Math.floor(o.xmax + 0.5);
  const each = (arr, fn) => { for (let d = d0; d <= Math.min(d1, arr.length - 1); d++) fn(arr[d] || 0, d); };
  let dataMax = 0;
  for (const b of o.rects || []) dataMax = Math.max(dataMax, b.v);
  if (o.pmf) each(o.pmf, (v) => { dataMax = Math.max(dataMax, v); });
  for (const c of o.curves || []) each(c.pmf, (v) => { dataMax = Math.max(dataMax, v); });
  if (o.pmf2) each(o.pmf2, (v) => { dataMax = Math.max(dataMax, v); });
  // At most one bar per pixel: with thousands of values in a picture 180 pixels wide, the
  // values that share a pixel are drawn as one bar, the tallest of them.
  const perPixel = (arr) => {
    const out = new Map();
    each(arr, (v, d) => {
      if (v < 1e-6) return;
      const px = Math.round(X(d)), cur = out.get(px);
      if (!cur || v > cur.v) out.set(px, { v, d });
    });
    return [...out.values()];
  };
  // With an arrow (one exact value) in the picture, the blocks stay lower, so the arrow's
  // chance has room above them.
  const hasSpike = (o.spikes || []).length > 0;
  const yTop = o.yTop || dataMax / (hasSpike ? 0.6 : 0.85) || 1;
  const Y = (v) => base - Math.min(1.05, v / yTop) * (base - top);

  let s = `<rect x="${px}" y="${py}" width="${PW}" height="${PH}" rx="8" style="fill:var(--bg);stroke:${o.final ? col : 'var(--border)'};stroke-width:${o.final ? 2 : 1}px"/>`;
  s += t(px + 12, py + 20, o.title, 'style="fill:var(--text);font-size:12.5px;font-weight:600"');
  // Axes. The vertical one only when something on the picture is read against it.
  s += `<line x1="${L - 4}" x2="${R + 4}" y1="${base}" y2="${base}" style="stroke:var(--muted);opacity:.6"/>`;
  if (dataMax > 0) {
    s += `<line x1="${L - 4}" x2="${L - 4}" y1="${top - 6}" y2="${base}" style="stroke:var(--muted);opacity:.6"/>`;
    const step = niceStep((yTop * 0.95) / 3);
    for (let v = 0, n = 0; v <= yTop * 1.0001 && n < 20; v += step, n++) {
      const y = Y(v);
      s += `<line x1="${L - 7}" x2="${L - 4}" y1="${y}" y2="${y}" style="stroke:var(--muted)"/>`;
      if (v > 0) s += `<line x1="${L - 4}" x2="${R + 4}" y1="${y}" y2="${y}" style="stroke:var(--muted);opacity:.15"/>`;
      s += t(L - 9, y + 3.5, fmtPct(v), 'text-anchor="end" style="fill:var(--muted);font-size:10px"');
    }
    const ym = (top + base) / 2;
    s += t(px + 11, ym, o.ylab || 'chance', `text-anchor="middle" transform="rotate(-90 ${px + 11} ${ym})" style="fill:var(--muted);font-size:10.5px"`);
  }
  // Ticks in order of importance; one that would touch an earlier one is left out.
  const placed = [];
  for (const [v, lab] of o.ticks || []) {
    const x = X(v);
    if (!isFinite(x) || x < L - 6 || x > R + 6 || placed.some((p) => Math.abs(p - x) < 18)) continue;
    placed.push(x);
    s += `<line x1="${x}" x2="${x}" y1="${base}" y2="${base + 4}" style="stroke:var(--muted)"/>`;
    s += t(x, base + 16, lab, 'text-anchor="middle" style="fill:var(--muted);font-size:10.5px"');
  }
  for (const b of o.rects || []) {
    const x1 = X(b.from), x2 = X(b.to), y = Y(b.v);
    s += `<rect x="${x1}" y="${y}" width="${Math.max(2, x2 - x1)}" height="${base - y}" style="fill:${b.muted ? 'var(--muted)' : col};opacity:${b.muted ? 0.3 : 0.85}"/>`;
    // The block's chance: above it, or inside it when an arrow shares the picture (if it fits).
    if (b.label && !hasSpike) s += t((x1 + x2) / 2, y - 5, b.label, `text-anchor="middle" style="fill:var(--text);font-size:10.5px;${haloIn}"`);
    else if (b.label && x2 - x1 >= 26) s += t((x1 + x2) / 2, (y + base) / 2 + 4, b.label, 'text-anchor="middle" style="fill:#fff;font-size:10.5px;font-weight:600"');
  }
  for (const k of o.spikes || []) {
    const x = X(k.at), y = top - 2, right = x < R - 34;
    s += `<line x1="${x}" x2="${x}" y1="${base}" y2="${y + 6}" style="stroke:${col};stroke-width:3px"/><path d="M${x - 5},${y + 8} L${x},${y} L${x + 5},${y + 8} z" style="fill:${col}"/>`;
    if (k.label) s += t(right ? x + 7 : x - 7, y + 10, k.label, `text-anchor="${right ? 'start' : 'end'}" style="fill:var(--text);font-size:10.5px;font-weight:600;${haloIn}"`);
  }
  if (o.pmf) {
    const bw = Math.max(1, Math.min(12, ((R - L) / ((o.xmax - o.xmin) || 1)) * 0.8));
    perPixel(o.pmf).forEach(({ v, d }) => {
      const y = Y(v), grey = o.mutedBar && o.mutedBar(d);
      s += `<rect x="${X(d) - bw / 2}" y="${y}" width="${bw}" height="${base - y}" style="fill:${grey ? 'var(--muted)' : col};opacity:${grey ? 0.35 : 0.85}"><title>${o.tip ? o.tip(d, v) : `${d}: ${pct(v)}`}</title></rect>`;
    });
    for (const m of o.marks || []) {
      const v = o.pmf[m.at] || 0;
      s += t(Math.min(R - 8, Math.max(L + 8, X(m.at))), Y(v) - 5, m.text, `text-anchor="middle" style="fill:var(--text);font-size:10.5px;font-weight:600;${haloIn}"`);
    }
  }
  if (o.pmf2) {
    // A second set of bars in its own colour (the race: both killing-blow times).
    const bw = Math.max(1, Math.min(12, ((R - L) / ((o.xmax - o.xmin) || 1)) * 0.8));
    perPixel(o.pmf2).forEach(({ v, d }) => {
      const y = Y(v);
      s += `<rect x="${X(d) - bw / 2}" y="${y}" width="${bw}" height="${base - y}" style="fill:${o.col2};opacity:.75"/>`;
    });
  }
  for (const c of o.curves || []) {
    // One point per pixel, the highest value in it.
    const byPx = new Map();
    each(c.pmf, (v, d) => { const px = Math.round(X(d)); if (!byPx.has(px) || v > byPx.get(px)) byPx.set(px, v); });
    const pts = [...byPx].map(([px, v]) => `${px},${Y(v).toFixed(1)}`);
    s += `<polyline points="${pts.join(' ')}" style="fill:none;stroke:${c.strong ? col : 'var(--muted)'};stroke-width:${c.strong ? 1.8 : 1}px;opacity:${c.strong ? 0.95 : 0.45}"/>`;
  }
  for (const ln of o.lines || []) {
    const x = X(ln.at);
    if (x < L - 6 || x > R + 6) continue;
    s += `<line x1="${x}" x2="${x}" y1="${top - 4}" y2="${base}" style="stroke:${ln.col || 'var(--muted)'};stroke-dasharray:4 3;stroke-width:1.3px"/>`;
    if (ln.label) s += t(Math.min(R - 10, Math.max(L + 10, x)), top - 8, ln.label, `text-anchor="middle" style="fill:var(--muted);font-size:10px;${haloIn}"`);
  }
  if (o.note) s += t((L + R) / 2, (top + base) / 2, o.note, 'text-anchor="middle" style="fill:var(--muted);font-size:11px"');
  s += t(px + PW / 2, py + PH - 12, o.caption, 'text-anchor="middle" style="fill:var(--muted);font-size:11px"');
  return s;
}

// A labelled arrow from one picture to the next, in the same row.
function arrow(x1, x2, y, [l1, l2]) {
  const mid = (x1 + x2) / 2;
  return `<line x1="${x1 + 6}" x2="${x2 - 8}" y1="${y}" y2="${y}" marker-end="url(#maparr)" style="stroke:var(--muted);stroke-width:1.5px"/>
    <text x="${mid}" y="${y - 22}" text-anchor="middle" style="fill:var(--text);font-size:12px;font-weight:600">${l1}</text>
    <text x="${mid}" y="${y - 8}" text-anchor="middle" style="fill:var(--muted);font-size:11px">${l2}</text>`;
}

// Six pictures in two rows of three. arrows = the four in-row arrows (1>2, 2>3, 4>5, 5>6),
// turn = the label of the bend from picture 3 down to picture 4.
export function mapSvg(ps, arrows, turn, aria, col) {
  const cx = (i) => i * (PW + GAP), ay = 77;
  let svg = `<svg viewBox="0 0 ${3 * PW + 2 * GAP} ${ROW2 + PH + 2}" role="img" aria-label="${aria}">
    <defs><marker id="maparr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--muted)"/></marker></defs>`;
  ps.forEach((p, i) => { svg += panel(cx(i % 3), i < 3 ? 0 : ROW2, p, col); });
  svg += arrow(cx(0) + PW, cx(1), ay, arrows[0]) + arrow(cx(1) + PW, cx(2), ay, arrows[1]);
  svg += arrow(cx(0) + PW, cx(1), ROW2 + ay, arrows[2]) + arrow(cx(1) + PW, cx(2), ROW2 + ay, arrows[3]);
  const yMid = PH + (ROW2 - PH) / 2, x3 = cx(2) + PW / 2, x4 = PW / 2;
  svg += `<path d="M${x3},${PH + 2} V${yMid} H${x4} V${ROW2 - 4}" marker-end="url(#maparr)" style="fill:none;stroke:var(--muted);stroke-width:1.5px"/>`;
  svg += `<text x="${(x3 + x4) / 2}" y="${yMid - 6}" text-anchor="middle" style="fill:var(--text);font-size:12px;font-weight:600;${halo}">${turn[0]}</text>`;
  svg += `<text x="${(x3 + x4) / 2}" y="${yMid + 16}" text-anchor="middle" style="fill:var(--muted);font-size:11px;${halo}">${turn[1]}</text>`;
  return svg + '</svg>';
}

// A map builder returns its six pictures and its arrows; mapSvg or the whole map lays them out.
const spec = (ps, arrows, turn, aria, col, short) => ({ ps, arrows, turn, aria, col, short });
const range = (d) => (d.min === d.max ? `always ${d.min}` : `${d.min} to ${d.max}`);

// Step 2: from the armour roll U to the damage of one hit D.
// A flat block's height is the chance per small step of the x axis (per 0.1, per 1% or per
// damage point), so width (in steps) x height = its chance. That is what a density is.
export function mapDamage(att, def, col) {
  const B = att.base, ap = Math.round(att.ap), a = Math.max(0, def.armour) / 100;
  // q = the chance that U x armour/100 reaches 100%: those hits lose all their base damage.
  const q = a <= 1 ? 0 : a >= 2 ? 1 : (2 * (a - 1)) / a;
  const lo = B * (1 - Math.min(a, 1)), hi = B * (1 - a / 2);
  const per1 = a > 0 ? 0.02 / a : 0; // U x a is spread over 50a steps of 1%: 1/(50a) each
  const stick = (v) => `arrow ${pc(v)}`;

  // 1. U: 5 steps of 0.1, 20% each.
  const p1 = { title: '1. Armour roll U', ylab: 'chance per 0.1', xmin: 0, xmax: 1, ticks: [[0.5, '0.5'], [1, '1'], [0, '0']],
    rects: [{ from: 0.5, to: 1, v: 0.2 }], caption: 'area: 5 steps of 0.1 × 20% = 100%' };
  // 2. U x armour/100
  const p2 = { title: '2. U × armour/100', ylab: 'chance per 1%', xmin: 0, xmax: Math.max(1, a), caption: '', ticks: [[0, '0%'], [1, '100%']] };
  if (a === 0) { p2.spikes = [{ at: 0, label: '100%' }]; p2.caption = 'always exactly 0%: no armour'; }
  else {
    p2.ticks = [[0.5 * a, pc(0.5 * a)], [a, pc(a)], [0, '0%'], [1, '100%']];
    p2.rects = [];
    if (0.5 * a < 1) p2.rects.push({ from: 0.5 * a, to: Math.min(a, 1), v: per1, label: q > 0 ? pc(1 - q) : '' });
    if (a > 1) p2.rects.push({ from: Math.max(1, 0.5 * a), to: a, v: per1, muted: true, label: pc(q) });
    p2.lines = a > 1 ? [{ at: 1 }] : [];
    p2.caption = `area: ${fx(50 * a)} steps × ${fmtPct(per1)} = 100%`;
  }
  // 3. R = min(1, U x armour/100)
  const p3 = { title: '3. Blocked share R', ylab: 'chance per 1%', xmin: 0, xmax: 1, ticks: [[0, '0%'], [1, '100%']], rects: [], spikes: [] };
  if (a === 0) { p3.spikes.push({ at: 0, label: '100%' }); p3.caption = 'always exactly 0%'; }
  else {
    if (q < 1) { p3.rects.push({ from: 0.5 * a, to: Math.min(a, 1), v: per1, label: q > 0 ? pc(1 - q) : '' }); p3.ticks.unshift([0.5 * a, pc(0.5 * a)], [Math.min(a, 1), pc(Math.min(a, 1))]); }
    if (q > 0) p3.spikes.push({ at: 1, label: pc(q) });
    p3.caption = q >= 1 ? 'always exactly 100%' : q > 0 ? `block ${pc(1 - q)} + ${stick(q)} = 100%` : `area: ${fx(50 * a)} steps × ${fmtPct(per1)} = 100%`;
  }
  // 4. B(1 - R), still a real number: spread over hi - lo damage points.
  const p4 = { title: '4. Base part B(1 − R)', ylab: 'chance per 1 damage', xmin: 0, xmax: Math.max(1, B), ticks: [[0, '0'], [B, fx(B)]], rects: [], spikes: [] };
  if (B === 0) { p4.spikes.push({ at: 0, label: '100%' }); p4.caption = 'always exactly 0: no base damage'; }
  else if (a === 0) { p4.spikes.push({ at: B, label: '100%' }); p4.caption = `always exactly ${fx(B)}: nothing blocked`; }
  else {
    const perD = q < 1 ? (1 - q) / (hi - lo) : 0;
    if (q < 1) { p4.rects.push({ from: lo, to: hi, v: perD, label: q > 0 ? pc(1 - q) : '' }); p4.ticks.unshift([lo, fx(lo)], [hi, fx(hi)]); }
    if (q > 0) p4.spikes.push({ at: 0, label: pc(q) });
    p4.caption = q >= 1 ? 'always exactly 0' : q > 0 ? `block ${pc(1 - q)} + ${stick(q)} = 100%` : `area: ${fx(hi - lo)} points × ${fmtPct(perD)} = 100%`;
  }
  // 5. rounded base part, 6. plus the armour-piercing part = the damage of one hit
  const r5 = hitDamage(B, 0, def.armour), r6 = hitDamage(B, att.ap, def.armour);
  const p5 = { title: '5. Rounded base part', xmin: 0, xmax: Math.max(1, B), pmf: r5.pmf, tip: (v, w) => `${v} damage: ${pct(w)}`,
    ticks: [[r5.min, String(r5.min)], [r5.max, String(r5.max)], [0, '0'], [B, fx(B)]], caption: `${range(r5)}: bar heights add to 100%` };
  const p6 = { title: '6. Damage of one hit D', final: true, xmin: 0, xmax: Math.max(1, ap + B), pmf: r6.pmf, tip: (v, w) => `${v} damage: ${pct(w)}`,
    ticks: [[r6.min, String(r6.min)], [r6.max, String(r6.max)], [0, '0'], [ap, String(ap)]],
    lines: r6.min === r6.max ? [] : [{ at: r6.mean, col, label: `avg ${r6.mean.toFixed(2)}` }],
    caption: r6.min === r6.max ? `${range(r6)} per hit` : `${range(r6)} per hit, ${r6.mean.toFixed(2)} on average` };

  // Every picture of a random quantity shows its average, as a dashed line (not the ones
  // that hold a single exact value).
  const meanR = a <= 0 ? 0 : a <= 1 ? 0.75 * a : a >= 2 ? 1 : ((1 - q) * (0.5 * a + 1)) / 2 + q;
  const avg = (pic, at, label, spread) => { if (spread) (pic.lines ||= []).push({ at, col, label: `avg ${label}` }); };
  avg(p1, 0.75, '0.75', true);
  avg(p2, 0.75 * a, pc(0.75 * a), a > 0);
  avg(p3, meanR, pc(meanR), a > 0 && q < 1);
  avg(p4, B * (1 - meanR), fx(B * (1 - meanR)), B > 0 && a > 0 && q < 1);
  avg(p5, r5.mean, r5.mean.toFixed(2), r5.min !== r5.max);

  return spec([p1, p2, p3, p4, p5, p6], [
    ['× armour/100', a === 0 ? '× 0 (no armour)' : `× ${fx(a)}`],
    ['cap at 100%', 'min(1, ·)'],
    ['round', 'to whole numbers'],
    ['+ round(AP)', `+${ap}, shifts right`],
  ], [`base × (1 − R) = ${fx(B)} × (1 − R)`, 'the picture flips: a big block leaves a small base part'],
  'Six pictures from the armour roll to the damage of one hit', col, ['base × (1 − R)', `${fx(B)} × (1 − R), the picture flips`]);
}

// The distribution of a sum of two independent whole numbers: the convolution.
function convolve(x, y) {
  const z = new Float64Array(x.length + y.length - 1);
  for (let i = 0; i < x.length; i++) {
    if (x[i] < 1e-15) continue;
    for (let j = 0; j < y.length; j++) if (y[j] > 0) z[i + j] += x[i] * y[j];
  }
  return z;
}

// Step 3: from one hit D to the hits needed K.
export function mapHits(d, g, hp, col) {
  if (d.max === 0) return { note: 'This unit can never do damage, so no number of hits is ever enough.', pic: { note: 'never enough', caption: 'no hit does any damage' } };
  const cdf = new Float64Array(g.length);
  for (let k = 1; k < g.length; k++) cdf[k] = cdf[k - 1] + g[k];
  // The model follows up to MAX_HITS hits. If the enemy is still standing after them in most
  // fights, the pictures would be empty: say how many hits it would take instead.
  if (cdf[g.length - 1] < 0.5) {
    const about = d.mean > 0 ? Math.round(hp / d.mean) : Infinity;
    return { note: `More than ${MAX_HITS} hits needed.`, pic: { note: `over ${MAX_HITS} hits`, caption: isFinite(about) ? `about ${about.toLocaleString('en')} on average` : 'no hit does any damage' } };
  }
  let km = 1; while (km < g.length - 1 && cdf[km] < 0.5) km++;
  const k1 = Math.max(1, km - 1), ks = [k1, k1 + 1, k1 + 2];
  // The total damage after k hits: k copies of D convolved. Past the hit points = dead.
  const pmfD = d.pmf.slice(0, d.max + 1);
  let S = pmfD;
  for (let k = 2; k <= k1; k++) S = convolve(S, pmfD);
  const sums = [S, convolve(S, pmfD)];
  sums.push(convolve(sums[1], pmfD));
  const lo = Math.floor(Math.min(k1 * d.min, hp) * 0.85), hi = Math.max(ks[2] * d.max, hp);
  const totals = ks.map((k, i) => ({
    title: `${i + 2}. Total after ${k} hit${k > 1 ? 's' : ''}`, xmin: lo, xmax: hi, pmf: sums[i], mutedBar: (s) => s < hp,
    tip: (s, w) => `${s} damage in total: ${pct(w)}`,
    ticks: [[hp, String(hp)], [lo, String(lo)], [hi, String(hi)]],
    lines: [{ at: hp - 0.5, label: `HP ${hp}` }, ...(d.min === d.max ? [] : [{ at: k * d.mean, col }])],
    caption: `avg ${fx(k * d.mean)}, ${pct(cdf[k])} past HP: P(K ≤ ${k})`,
  }));
  // Which k to show in the last two pictures.
  let kEnd = ks[2] + 2; while (kEnd < g.length - 1 && cdf[kEnd] < 0.995) kEnd++;
  let kStart = ks[0]; while (kStart > 1 && g[kStart - 1] > 0.002) kStart--;
  kStart = Math.max(1, Math.min(kStart, ks[0] - 1));
  const kTicks = [[ks[0], String(ks[0])], [ks[2], String(ks[2])], [ks[1], String(ks[1])], [kStart, String(kStart)], [kEnd, String(kEnd)]];
  const p1 = { title: '1. One hit D', xmin: 0, xmax: Math.max(1, d.max), pmf: d.pmf, tip: (v, w) => `${v} damage: ${pct(w)}`,
    ticks: [[d.min, String(d.min)], [d.max, String(d.max)], [0, '0']], caption: `${range(d)} per hit` };
  const p5 = { title: '5. Dead by hit k: P(K ≤ k)', xmin: kStart, xmax: kEnd, pmf: cdf, yTop: 1 / 0.85, mutedBar: (k) => !ks.includes(k),
    tip: (k, w) => `dead by hit ${k}: ${pct(w)}`, ticks: kTicks,
    marks: ks.map((k) => ({ at: k, text: pc(cdf[k]) })), caption: 'climbs from 0% to 100%' };
  let meanK = 0, sumK = 0; for (let k = 1; k < g.length; k++) { meanK += k * g[k]; sumK += g[k]; }
  meanK /= sumK || 1;
  const spreadK = g.filter((v) => v > 1e-9).length > 1;
  const p6 = { title: '6. Hits needed K', final: true, xmin: kStart, xmax: kEnd, pmf: g, lines: spreadK ? [{ at: meanK, col, label: `avg ${meanK.toFixed(2)}` }] : [], mutedBar: (k) => k !== ks[1],
    tip: (k, w) => `exactly ${k} hits: ${pct(w)}`, ticks: kTicks, marks: [{ at: ks[1], text: pct(g[ks[1]]) }],
    caption: `P(K = ${ks[1]}) = ${pct(cdf[ks[1]])} − ${pct(cdf[ks[0]])}` };
  return spec([p1, ...totals.slice(0, 2), totals[2], p5, p6], [
    [`add up ${k1} hit${k1 > 1 ? 's' : ''}`, `${k1} copies of D, convolved`],
    ['+1 hit', 'convolve with D once more'],
    ['share past the HP', 'one bar per total'],
    ['take differences', 'P(K ≤ k) − P(K ≤ k−1)'],
  ], ['+1 hit', 'convolve with D once more: the pile moves right and spreads'],
  'Six pictures from the damage of one hit to the hits needed', col, ['+1 hit', 'convolve with D once more']);
}

// Step 4: from the hits needed K and the hit chance p to the swings needed N.
export function mapSwings(g, f, p, col) {
  let kAny = 0; for (let k = 1; k < g.length; k++) if (g[k] > 0) { kAny = k; break; }
  if (p <= 0 || !kAny) return { note: 'This unit never hits, or never does damage, so it never finishes the other one.', pic: { note: 'never finishes', caption: 'no hit, or no damage' } };
  let total = 0; for (let k = 1; k < g.length; k++) total += g[k];
  if (total < 0.5) return { note: `It practically never finishes within ${MAX_HITS} hits.`, pic: { note: 'practically never', caption: `needs over ${MAX_HITS} hits` } };
  // The three most likely numbers of hits, in order. With one possible k, its neighbours show weight 0.
  const order = [];
  for (let k = 1; k < g.length; k++) if (g[k] > 1e-9) order.push(k);
  order.sort((x, y) => g[y] - g[x]);
  const ks = order.slice(0, 3);
  // Fill up to three with the next numbers. Start from a real number, so this always ends.
  for (let k = (ks.length ? ks[0] : kAny) + 1, n = 0; ks.length < 3 && n < 10; k++, n++) if (!ks.includes(k)) ks.push(k);
  ks.sort((x, y) => x - y);
  // x range: from the first possible swing to where 99.5% of the fights are over.
  let nStart = kAny, nEnd = nStart, c = 0;
  for (let n = 1; n < f.length; n++) { c += f[n]; if (c > 0.995) { nEnd = n; break; } }
  nEnd = Math.min(MAX_SWINGS, Math.max(nEnd, Math.ceil(ks[2] / p) + 2));
  nStart = Math.max(0, nStart - 1);
  const nb = (k) => swingsPmf(k, p, nEnd);
  let fMax = 0; for (let n = nStart; n <= nEnd; n++) fMax = Math.max(fMax, f[n]);
  let kEnd = ks[2] + 1, cg = 0; for (let k = 1; k < g.length; k++) { cg += g[k]; if (cg > 0.995) { kEnd = Math.max(kEnd, k); break; } }
  const kStart = Math.max(1, Math.min(ks[0] - 1, kAny));
  const nTicks = (extra) => [...extra, [nStart, String(nStart)], [nEnd, String(nEnd)]];
  const p1 = { title: '1. Hits needed K', xmin: kStart, xmax: kEnd, pmf: g, mutedBar: (k) => !ks.includes(k),
    tip: (k, w) => `exactly ${k} hits: ${pct(w)}`, ticks: [...ks.map((k) => [k, String(k)]), [kStart, String(kStart)], [kEnd, String(kEnd)]],
    marks: ks.map((k) => ({ at: k, text: pc(g[k]) })), caption: 'the weights of the mixture' };
  const pieces = ks.map((k, i) => ({
    title: `${i + 2}. Swings for ${k} hits`, xmin: nStart, xmax: nEnd, pmf: nb(k), tip: (n, w) => `${k}th hit on swing ${n}: ${pct(w)}`,
    ticks: nTicks([[Math.round(k / p), String(Math.round(k / p))]]), lines: [{ at: k / p, col, label: `avg ${fx(k / p)}` }],
    caption: `negative binomial, weight ${pct(g[k] || 0)}`,
  }));
  // The weighted pieces, on the scale of the final curve so their sizes compare.
  const curves = [];
  const heavy = [];
  for (let k = 1; k < g.length; k++) if (g[k] > 1e-4) heavy.push(k);
  heavy.sort((x, y) => g[y] - g[x]).splice(60);
  for (const k of heavy) curves.push({ pmf: nb(k).map((v) => v * g[k]), strong: ks.includes(k) });
  curves.sort((x, y) => x.strong - y.strong); // the three strong lines on top
  const p5 = { title: '5. Each piece × its weight', xmin: nStart, xmax: nEnd, yTop: fMax / 0.85, curves,
    ticks: nTicks([]), caption: curves.length === 1 ? 'only one possible k' : `${curves.length} pieces, coloured = 2 to 4` };
  let mean = 0; for (let n = 1; n < f.length; n++) mean += n * f[n];
  const p6 = { title: '6. Swings needed N', final: true, xmin: nStart, xmax: nEnd, pmf: f, yTop: fMax / 0.85,
    tip: (n, w) => `finished on swing ${n}: ${pct(w)}`, ticks: nTicks([[Math.round(mean), String(Math.round(mean))]]),
    lines: [{ at: mean, col, label: `avg ${mean.toFixed(1)}` }], caption: 'the mixture: all pieces added' };
  return spec([p1, ...pieces, p5, p6], [
    [`k = ${ks[0]}`, `swings until hit ${ks[0]}, p = ${pc(p)}`],
    [`k = ${ks[1]}`, 'same coin, one more hit'],
    ['× P(K = k)', 'shrink each piece by its weight'],
    ['add them up', 'one curve for all k'],
  ], [`k = ${ks[2]}`, 'one negative binomial for every possible k, these are the three most likely'],
  'Six pictures from the hits needed to the swings needed', col, [`k = ${ks[2]}`, 'the next most likely k']);
}

// ---- The whole map, flowing from top to bottom ----
// One column per attacker: "A hits B" on the left, "B hits A" on the right (from stage 3).
// Each column runs the steps of the model downwards, one picture per row. The stats come in
// as pills on the outer side, joined to the arrow that uses them. The two columns meet in
// the race at the bottom. Which pictures appear depends on the stage of the model.
export const VGAP = 92, CG = 230, XA = 0, XB = PW + CG, OUT = 520; // OUT: room for the stat pills, and left of them the band titles
export const STEP_TITLES = {
  coin: 'Step 1: one swing', dmg: 'Step 2: damage of one hit', hits: 'Step 3: hits needed',
  swings: 'Step 4: swings needed', time: 'Step 5: time', race: 'Steps 6 and 7: the race and the result',
};
const noNum = (t) => t.replace(/^\d+\.\s*/, '');

// A stat, drawn as a pill beside its column, with a dashed line to the arrow that uses it.
function sideChip(cx, ay, left, text, col) {
  const w = Math.round(text.length * 6.7 + 24), h = 26;
  const x = left ? XA - 40 - w : XB + PW + 40;
  const xe = left ? x + w : x;
  return `<line x1="${xe}" x2="${cx}" y1="${ay}" y2="${ay}" style="stroke:${col};stroke-dasharray:3 3;stroke-width:1.3px"/>
    <rect x="${x}" y="${ay - h / 2}" width="${w}" height="${h}" rx="13" style="fill:var(--surface);stroke:${col};stroke-width:1.5px"/>
    <text x="${x + w / 2}" y="${ay + 4.5}" text-anchor="middle" style="fill:var(--text);font-size:12px;font-weight:600">${text}</text>`;
}
// A downward arrow with its two labels: to the right of the arrow in column A, to the left in
// column B, so both sets of labels sit in the space between the columns.
function downArrow(cx, y1, y2, [l1, l2], right) {
  const ym = (y1 + y2) / 2, tx = right ? cx + 12 : cx - 12, anchor = right ? 'start' : 'end';
  return `<line x1="${cx}" x2="${cx}" y1="${y1 + 4}" y2="${y2 - 8}" marker-end="url(#maparr)" style="stroke:var(--muted);stroke-width:1.5px"/>
    <text x="${tx}" y="${ym - 4}" text-anchor="${anchor}" style="fill:var(--text);font-size:12px;font-weight:600">${l1}</text>
    <text x="${tx}" y="${ym + 12}" text-anchor="${anchor}" style="fill:var(--muted);font-size:11px">${l2}</text>`;
}

// T = interval x (N - 1), kept in tenths of a second, one bar per possible moment.
function timeOf(f, iv) {
  let n0 = 0, n1 = 0, c = 0, mean = 0;
  for (let n = 1; n < f.length; n++) {
    if (!n0 && f[n] > 1e-6) n0 = n;
    c += f[n]; mean += f[n] * iv * (n - 1);
    if (!n1 && c > 0.995) n1 = n;
  }
  if (!n0) return { pmf: new Float64Array(1), t0: 0, t1: 0, mean: Infinity, never: true };
  if (!n1) n1 = f.length - 1;
  const pmf = new Float64Array(iv * (n1 - 1) + 1);
  for (let n = n0; n <= n1; n++) pmf[iv * (n - 1)] = f[n];
  return { pmf, t0: iv * (n0 - 1), t1: iv * (n1 - 1), mean: mean / Math.max(c, 1e-12), never: false };
}
const secTicks = (t0, t1, extra = []) => [...extra, [t0, `${fx(t0 / 10)} s`], [t1, `${fx(t1 / 10)} s`]];
// From the first possible value to where 99.5% of the chance is used up.
function pmfRange(f) {
  let a = 0, b = 0, c = 0;
  for (let n = 1; n < f.length; n++) { if (!a && f[n] > 1e-6) a = n; c += f[n]; if (c > 0.995) { b = n; break; } }
  return [Math.max(0, (a || 1) - 1), Math.max(b, (a || 1) + 2)];
}

function resultPanel(px, py, r, ca, cb) {
  const t = (x, y, txt, st) => `<text x="${x}" y="${y}" style="${st}">${txt}</text>`;
  let s = `<rect x="${px}" y="${py}" width="${PW}" height="${PH}" rx="8" style="fill:var(--bg);stroke:var(--text);stroke-width:2px"/>`;
  s += t(px + 12, py + 20, 'Result', 'fill:var(--text);font-size:12.5px;font-weight:600');
  if (r.nobody) return s + t(px + 12, py + 80, 'neither can ever kill the other', 'fill:var(--muted);font-size:12px');
  const bx = px + 12, bw = PW - 24;
  let x = bx;
  for (const [w, c] of [[r.winA, ca], [r.tie, 'var(--muted)'], [r.winB, cb]]) {
    s += `<rect x="${x}" y="${py + 34}" width="${Math.max(0, w * bw)}" height="22" style="fill:${c};opacity:${c === ca || c === cb ? 0.9 : 0.4}"/>`;
    x += w * bw;
  }
  s += t(px + 12, py + 80, `A wins ${pct(r.winA)}`, `fill:${ca};font-size:13px;font-weight:600`);
  s += t(px + 12, py + 99, `both die ${pct(r.tie)}`, 'fill:var(--muted);font-size:13px');
  s += t(px + 12, py + 118, `B wins ${pct(r.winB)}`, `fill:${cb};font-size:13px;font-weight:600`);
  s += t(px + 12, py + PH - 12, `average length ${sec(r.meanDuration)}`, 'fill:var(--muted);font-size:11px');
  return s;
}

// One column: a list of rows { step, pic, arrow: [l1, l2] into this picture, chip }.
// A null pic keeps a row empty, so both columns line up when one of them stops early.
function laneRows(side, state, stage) {
  const { A, B, r } = state;
  const att = side === 'A' ? A : B, def = side === 'A' ? B : A, other = side === 'A' ? 'B' : 'A';
  const col = css(side === 'A' ? '--a' : '--b');
  const d = side === 'A' ? r.dA : r.dB, g = side === 'A' ? r.gA : r.gB, f = side === 'A' ? r.fA : r.fB;
  const p = side === 'A' ? r.pA : r.pB;
  const rows = [];
  const add = (step, pic, arrow, chip = null) => rows.push({ step, pic, arrow, chip });
  const pad = (step, n) => { for (let i = 0; i < n; i++) add(step, null, null); };

  // Step 1: one swing, a weighted coin.
  add('coin', { title: 'One swing', xmin: -0.7, xmax: 1.7, pmf: [1 - p, p], yTop: 1 / 0.85, mutedBar: (v) => v === 0,
    ticks: [[0, 'miss'], [1, 'hit']], marks: [{ at: 0, text: pc(1 - p) }, { at: 1, text: pc(p) }], tip: (v, w) => `${v ? 'hit' : 'miss'}: ${pct(w)}`,
    caption: `hit chance p = ${pc(p)}` }, ['every swing', 'hit or miss'], `p = (35 + ${att.attack} − ${def.defence}) / 100`);

  // Step 2: the damage of one hit.
  if (stage <= 3) {
    const D = Math.round(att.base);
    add('dmg', { title: 'Damage of one hit D', xmin: 0, xmax: Math.max(1, D) * 1.25, spikes: [{ at: D, label: '100%' }],
      ticks: [[0, '0'], [D, String(D)]], caption: `always ${D}: no armour yet` }, ['on a hit', 'the hit does its damage'], `${side}'s damage per hit ${D}`);
  } else {
    const dm = mapDamage(att, def, col);
    let ps = dm.ps.map((x) => ({ ...x, title: noNum(x.title) }));
    const arrows = [['on a hit', 'the armour roll'], dm.arrows[0], dm.arrows[1], dm.short || dm.turn, dm.arrows[2], dm.arrows[3]];
    // Stage 4 has no armour-piercing part: the rounded base part is the damage itself.
    if (stage === 4) ps = ps.slice(0, 5).map((x, i) => (i === 4 ? { ...x, title: 'Damage of one hit D', caption: d.min === d.max ? `always ${d.min} per hit` : `${d.min} to ${d.max} per hit, ${d.mean.toFixed(2)} on average`,
      lines: d.min === d.max ? [] : [{ at: d.mean, col, label: `avg ${d.mean.toFixed(2)}` }] } : x));
    const chips = { 1: `${other}'s armour ${def.armour}`, 3: `${side}'s base damage ${att.base}`, 5: `${side}'s armour-piercing ${att.ap}` };
    ps.forEach((x, i) => add('dmg', x, arrows[i], chips[i] || null));
  }

  // Step 3: the hits needed.
  if (stage <= 3) {
    const D = Math.round(att.base);
    if (D <= 0) add('hits', { title: 'Hits needed K', note: 'never enough', caption: 'no hit does any damage' }, ['hits needed', ''], `${other}'s hit points ${def.hp}`);
    else {
      const K = Math.ceil(def.hp / D);
      add('hits', { title: 'Hits needed K', xmin: 0, xmax: K * 1.3 + 1, spikes: [{ at: K, label: '100%' }], ticks: [[0, '0'], [K, String(K)]],
        caption: `always ${K}: no armour, no luck` }, ['⌈HP / D⌉', `⌈${def.hp} / ${D}⌉ = ${K}`], `${other}'s hit points ${def.hp}`);
    }
  } else {
    const hs = mapHits(d, g, def.hp, col);
    if (hs.note) { add('hits', { title: 'Hits needed K', ...hs.pic }, ['hits needed', ''], `${other}'s hit points ${def.hp}`); pad('hits', 4); }
    else {
      const arrows = [hs.arrows[0], hs.arrows[1], hs.short || hs.turn, hs.arrows[2], hs.arrows[3]];
      hs.ps.slice(1).forEach((x, i) => add('hits', { ...x, title: noNum(x.title) }, arrows[i], i === 0 ? `${other}'s hit points ${def.hp}` : null));
    }
  }

  // Step 4: the swings needed.
  const lastStep = stage === 1;
  if (stage <= 3) {
    const K = g.findIndex((v) => v > 0.5);
    if (p <= 0 || K < 1) add('swings', { title: 'Swings needed N', note: 'never finishes', caption: 'no hit, or no damage' }, ['swings needed', '']);
    else {
      const [n0, n1] = pmfRange(f);
      let mean = 0; for (let n = 1; n < f.length; n++) mean += n * f[n];
      add('swings', { title: 'Swings needed N', final: lastStep, xmin: n0, xmax: n1, pmf: f, tip: (n, w) => `hit ${K} on swing ${n}: ${pct(w)}`,
        ticks: [[Math.round(mean), String(Math.round(mean))], [n0, String(n0)], [n1, String(n1)]], lines: [{ at: mean, col, label: `avg ${mean.toFixed(1)}` }],
        caption: `negative binomial: K = ${K}, p = ${pc(p)}` }, [`until hit ${K}`, `flip the coin, p = ${pc(p)}`]);
    }
  } else {
    const sw = mapSwings(g, f, p, col);
    if (sw.note) { add('swings', { title: 'Swings needed N', ...sw.pic }, ['swings needed', '']); pad('swings', 4); }
    else {
      const arrows = [sw.arrows[0], sw.arrows[1], sw.short || sw.turn, sw.arrows[2], sw.arrows[3]];
      sw.ps.slice(1).forEach((x, i) => add('swings', { ...x, title: noNum(x.title), final: lastStep && i === 4 }, arrows[i]));
    }
  }

  // Step 5: the time of the killing blow.
  if (stage >= 2) {
    const T = timeOf(f, att.interval), s = fx(att.interval / 10);
    add('time', T.never ? { title: 'Time of the killing blow T', note: 'never', caption: 'this soldier never kills' }
      : { title: 'Time of the killing blow T', final: stage === 2, xmin: T.t0, xmax: Math.max(T.t1, T.t0 + 1), pmf: T.pmf, tip: (t, w) => `killing blow at ${fx(t / 10)} s: ${pct(w)}`,
        ticks: secTicks(T.t0, T.t1, [[T.mean, sec(T.mean)]]), lines: [{ at: T.mean, col, label: `avg ${sec(T.mean)}` }],
        caption: 'when this soldier lands the last blow' }, ['× interval', `T = ${s} s × (N − 1)`], `${side}'s attack interval ${s} s`);
    rows.time = T;
  }
  return { side, col, rows };
}

// The heavy part (every picture's numbers), done once per change of the stats or the stage.
export function buildLanes(state, stage) {
  return { stage, state, lanes: (stage >= 3 ? ['A', 'B'] : ['A']).map((s) => laneRows(s, state, stage)) };
}

// The light part: positions. minH[step] = the height a band must at least have (its card's).
// Returns the drawing and where each band sits, so the cards can go beside their bands.
export function layoutMap(model, minH = {}) {
  const { stage, state, lanes } = model;
  const ca = css('--a'), cb = css('--b');
  const two = lanes.length === 2, x1 = (two ? XB + PW : XA + PW) + OUT, x0 = XA - OUT;
  const steps = ['coin', 'dmg', 'hits', 'swings', ...(stage >= 2 ? ['time'] : [])];
  const rowY = [], bands = {};
  let y = 130, bg = '', s = '';
  for (const step of steps) {
    const y0 = y;
    y += 70;
    lanes[0].rows.forEach((row, i) => { if (row.step === step) { rowY[i] = y; y += PH + VGAP; } });
    y += 40 - VGAP;
    const y1 = Math.max(y, y0 + (minH[step] || 0));
    bands[step] = { y0, y1, x0, x1 };
    y = y1 + 44;
  }
  // The column headers, then each column's pictures, arrows and stat pills.
  for (const lane of lanes) {
    const x = lane.side === 'A' ? XA : XB, cx = x + PW / 2, left = lane.side === 'A';
    const other = lane.side === 'A' ? 'B' : 'A';
    s += `<rect x="${x}" y="0" width="${PW}" height="80" rx="10" style="fill:var(--surface);stroke:${lane.col};stroke-width:2px"/>
      <text x="${cx}" y="38" text-anchor="middle" style="fill:${lane.col};font-size:26px;font-weight:700">${lane.side} hits ${other}</text>
      <text x="${cx}" y="62" text-anchor="middle" style="fill:var(--muted);font-size:13px">${two ? `${lane.side} attacks, ${other} defends` : 'B only defends'}</text>`;
    let prevBottom = 80;
    lane.rows.forEach((row, i) => {
      if (!row.pic) return;
      const py = rowY[i];
      if (row.arrow) {
        s += downArrow(cx, prevBottom, py, row.arrow, left);
        if (row.chip) s += sideChip(cx, (prevBottom + py) / 2, left, row.chip, lane.col);
      }
      s += panel(x, py, row.pic, lane.col);
      prevBottom = py + PH;
    });
    lane.bottom = prevBottom;
  }
  // Bands behind the columns, titled like the steps.
  for (const step of steps) {
    const b = bands[step];
    bg += `<rect x="${x0}" y="${b.y0}" width="${x1 - x0}" height="${b.y1 - b.y0}" rx="16" style="fill:var(--neutral);opacity:.45"/>
      <text x="${x0 + 20}" y="${b.y0 + 36}" style="fill:var(--text);font-size:21px;font-weight:700">${STEP_TITLES[step]}</text>`;
  }
  // The race and the result, under both columns.
  if (two) {
    const y0 = y, rx = (XA + XB + PW) / 2 - PW / 2, ry = y0 + 110, rcx = rx + PW / 2;
    const tA = lanes[0].rows.time, tB = lanes[1].rows.time;
    const tMax = Math.max(tA.never ? 0 : tA.t1, tB.never ? 0 : tB.t1, 10);
    for (const lane of lanes) {
      const cx = (lane.side === 'A' ? XA : XB) + PW / 2, ex = rcx + (lane.side === 'A' ? -30 : 30), ym = ry - 40;
      s += `<path d="M${cx},${lane.bottom + 4} V${ym} H${ex} V${ry - 8}" marker-end="url(#maparr)" style="fill:none;stroke:${lane.side === 'A' ? ca : cb};stroke-width:1.8px"/>
        <text x="${cx + (lane.side === 'A' ? 10 : -10)}" y="${ym - 10}" text-anchor="${lane.side === 'A' ? 'start' : 'end'}" style="fill:var(--text);font-size:12px;font-weight:600">${lane.side}'s time T</text>`;
    }
    s += panel(rx, ry, { title: 'The race', xmin: 0, xmax: tMax, pmf: tA.pmf, pmf2: tB.pmf, col2: cb, ticks: secTicks(0, tMax),
      caption: 'the first killing blow wins', lines: [...(tA.never ? [] : [{ at: tA.mean, col: ca }]), ...(tB.never ? [] : [{ at: tB.mean, col: cb }])] }, ca);
    const resY = ry + PH + VGAP;
    s += downArrow(rcx, ry + PH, resY, ['who strikes first', 'a tie when both land together'], true);
    s += resultPanel(rx, resY, state.r, ca, cb);
    const y1 = Math.max(resY + PH + 50, y0 + (minH.race || 0));
    bands.race = { y0, y1, x0, x1 };
    bg += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="16" style="fill:var(--neutral);opacity:.45"/>
      <text x="${x0 + 20}" y="${y0 + 36}" style="fill:var(--text);font-size:21px;font-weight:700">${STEP_TITLES.race}</text>`;
    y = y1;
  }
  return { svg: (bg + s).replaceAll('url(#maparr)', 'url(#wmarr)'), bands, x0, x1, height: y };
}
