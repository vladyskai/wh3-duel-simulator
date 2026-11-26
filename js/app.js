import { duel, fightOnce, GAME_LIMITS } from './model.js';

const $ = (id) => document.getElementById(id);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const pct = (x) => (100 * x).toFixed(1) + '%';
const sec = (tenths) => (isFinite(tenths) ? (tenths / 10).toFixed(1) + ' s' : 'never');
const num = (x, d = 1) => (isFinite(x) ? x.toFixed(d) : 'never');

// The controls, built once for both units. Interval is stored in tenths of a second.
const FIELDS = [
  { key: 'attack', label: 'Melee attack', min: 0, max: 100 },
  { key: 'defence', label: 'Melee defence', min: 0, max: 100 },
  { key: 'base', label: 'Base damage', min: 0, max: 200 },
  { key: 'ap', label: 'Armour-piercing', min: 0, max: 200 },
  { key: 'armour', label: 'Armour', min: 0, max: 200 },
  { key: 'hp', label: 'Hit points', min: 1, max: 500 },
  { key: 'interval', label: 'Attack interval', min: 20, max: 60, show: (v) => (v / 10).toFixed(1) + ' s' },
];
const DEFAULTS = {
  A: { attack: 45, defence: 25, base: 20, ap: 5, armour: 30, hp: 100, interval: 40 },
  B: { attack: 30, defence: 30, base: 30, ap: 10, armour: 50, hp: 120, interval: 43 },
};
for (const side of ['A', 'B']) {
  const box = document.querySelector(`.unit[data-side="${side}"] .ctls`);
  box.innerHTML = FIELDS.map((f) => `<div class="ctl"><label for="${side}-${f.key}">${f.label}</label>
    <input type="range" id="${side}-${f.key}" min="${f.min}" max="${f.max}" step="1" value="${DEFAULTS[side][f.key]}"><output></output></div>`).join('');
}

// Typeset every formula once (they sit inside the collapsibles).
document.querySelectorAll('[data-tex]').forEach((el) => {
  const tex = el.getAttribute('data-tex');
  if (window.katex) katex.render(tex, el, { displayMode: true, throwOnError: false });
  else el.textContent = tex;
});

function readUnit(side) {
  const u = {};
  for (const f of FIELDS) {
    const input = $(`${side}-${f.key}`);
    u[f.key] = +input.value;
    input.nextElementSibling.textContent = f.show ? f.show(u[f.key]) : u[f.key];
  }
  return u;
}

const charts = {};
function barChart(id, data, xTitle, means, opts = {}) {
  const muted = css('--muted');
  const xScale = opts.linear
    ? { type: 'linear', min: 0, max: opts.xMax, title: { display: true, text: xTitle, color: muted }, ticks: { color: muted }, grid: { display: false } }
    : { title: { display: true, text: xTitle, color: muted }, ticks: { color: muted, maxTicksLimit: 16 }, grid: { display: false } };
  const cfg = {
    type: 'bar',
    data,
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false } },
      scales: { x: xScale, y: { ticks: { color: muted, callback: (v) => Math.round(v * 100) + '%' }, grid: { color: 'rgba(137,135,129,.18)' } } },
    },
    plugins: [{
      id: 'means',
      afterDatasetsDraw(c) {
        const x = c.scales.x, y = c.scales.y, g = c.ctx;
        for (const [v, col] of means) {
          if (!isFinite(v)) continue;
          const px = x.getPixelForValue(v);
          if (px < x.left || px > x.right) continue;
          g.save(); g.strokeStyle = col; g.setLineDash([5, 4]); g.lineWidth = 1.5;
          g.beginPath(); g.moveTo(px, y.top); g.lineTo(px, y.bottom); g.stroke(); g.restore();
        }
      },
    }],
  };
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart($(id), cfg);
}

// Index range [1, top] that holds 99.5% of both distributions.
function span(f1, f2, cap) {
  let c1 = 0, c2 = 0, t1 = 0, t2 = 0;
  for (let i = 1; i < f1.length; i++) { c1 += f1[i]; c2 += f2[i]; if (!t1 && c1 > 0.995) t1 = i; if (!t2 && c2 > 0.995) t2 = i; if (t1 && t2) break; }
  return Math.min(Math.max(t1, t2, 5), cap);
}

// Hit chance limits. Unticked = none. An invalid pair keeps the last valid one and says why.
let lastLimits = { ...GAME_LIMITS };
function readLimits() {
  const on = $('lim-on').checked;
  $('lim-fields').hidden = !on;
  const loEl = $('lim-lo'), hiEl = $('lim-hi');
  const lo = loEl.value.trim() === '' ? NaN : +loEl.value, hi = hiEl.value.trim() === '' ? NaN : +hiEl.value;
  let err = '';
  const bad = (x) => !Number.isFinite(x) || x < 0 || x > 100;
  if (bad(lo) || bad(hi)) err = 'Enter a percentage between 0 and 100 in both boxes.';
  else if (lo > hi) err = 'The lowest limit cannot be above the highest.';
  loEl.setAttribute('aria-invalid', String(!!err && (bad(lo) || lo > hi)));
  hiEl.setAttribute('aria-invalid', String(!!err && (bad(hi) || lo > hi)));
  $('lim-err').textContent = err ? err + ` Still using ${lastLimits.lo}% to ${lastLimits.hi}%.` : '';
  if (!err) lastLimits = { lo, hi };
  return on ? lastLimits : null;
}
$('lim-reset').addEventListener('click', () => {
  $('lim-lo').value = GAME_LIMITS.lo; $('lim-hi').value = GAME_LIMITS.hi;
  render();
});
$('lim-on').addEventListener('change', render);
$('min-on').addEventListener('change', render);
['lim-lo', 'lim-hi'].forEach((id) => $(id).addEventListener('input', render));

let state;
function render() {
  const A = readUnit('A'), B = readUnit('B');
  const limits = readLimits();
  const opts = { limits, minDamage: $('min-on').checked };
  const r = duel(A, B, opts);
  const ca = css('--a'), cb = css('--b');
  state = { A, B, r, opts };

  // Headline result.
  const seg = (w, bg, fg, label) => (w > 0.0005 ? `<div style="width:${100 * w}%;background:${bg};color:${fg}">${w > 0.09 ? label : ''}</div>` : '');
  if (r.nobody) {
    $('winbar').innerHTML = seg(1, 'var(--neutral)', 'var(--muted)', 'Neither soldier can ever kill the other');
    $('winlegend').innerHTML = '';
    $('duration').textContent = 'The fight never ends.';
  } else {
    $('winbar').innerHTML = seg(r.winA, ca, '#fff', 'A wins ' + pct(r.winA)) + seg(r.tie, 'var(--neutral)', 'var(--muted)', 'Both die ' + pct(r.tie)) + seg(r.winB, cb, '#fff', 'B wins ' + pct(r.winB));
    $('winlegend').innerHTML = `<span><i style="background:${ca}"></i>A wins ${pct(r.winA)}</span><span><i style="background:var(--neutral);outline:1px solid var(--border)"></i>Both die ${pct(r.tie)}</span><span><i style="background:${cb}"></i>B wins ${pct(r.winB)}</span>`;
    $('duration').textContent = `Average fight length: ${sec(r.meanDuration)}`;
  }

  // Step 1: the coin.
  const coin = (p, col, lab) => `<div class="row"><span>${lab}</span><div class="track"><div style="width:${100 * p}%;background:${col}"></div></div><b>${pct(p)}</b></div>`;
  $('coins').innerHTML = coin(r.pA, ca, 'A hits B') + coin(r.pB, cb, 'B hits A');

  // Step 2: damage per hit, on a shared scale.
  const scale = Math.max(r.dA.max, r.dB.max, 1);
  const dmgRow = (d, col, lab) => {
    const sure = d.min, w = (x) => (100 * x) / scale;
    return `<div class="row"><span>${lab}</span><div class="track dmg">
      <div class="solid" style="width:${w(sure)}%;background:${col}"></div>
      <div class="striped" style="left:${w(sure)}%;width:${w(d.max - sure)}%;--c:${col}"></div>
      <div class="tick" style="left:${w(d.mean)}%"></div></div>
      <b>${num(d.mean)}</b></div>
      <div class="sub">${lab}: ${num(d.min)} to ${num(d.max)} per hit, ${num(d.mean)} on average${d.blocked > 0 ? `, ${pct(d.blocked)} of hits lose all their base damage` : ''}${d.floored > 0 ? `, ${pct(d.floored)} are raised to the 1 damage minimum` : ''}</div>`;
  };
  $('damage').innerHTML = dmgRow(r.dA, ca, 'A on B') + dmgRow(r.dB, cb, 'B on A');

  // Step 3: hits needed.
  const kTop = span(r.gA, r.gB, 150);
  const kLab = [], kA = [], kB = [];
  for (let k = 1; k <= kTop; k++) { kLab.push(k); kA.push(r.gA[k]); kB.push(r.gB[k]); }
  $('hitlegend').innerHTML = `<span><i style="background:${ca}"></i>A: ${num(r.hitsA.mean)} hits on average, sd ${num(r.hitsA.sd, 2)}</span><span><i style="background:${cb}"></i>B: ${num(r.hitsB.mean)} hits on average, sd ${num(r.hitsB.sd, 2)}</span>`;
  barChart('hitchart', { labels: kLab, datasets: [
    { label: 'A', data: kA, backgroundColor: ca, borderRadius: 2, categoryPercentage: 0.9, barPercentage: 0.95 },
    { label: 'B', data: kB, backgroundColor: cb, borderRadius: 2, categoryPercentage: 0.9, barPercentage: 0.95 },
  ] }, 'Hits needed', [[r.hitsA.mean - 1, ca], [r.hitsB.mean - 1, cb]]);

  // Step 4: swings needed.
  const top = span(r.fA, r.fB, 150);
  const labels = [], dA = [], dB = [];
  for (let n = 1; n <= top; n++) { labels.push(n); dA.push(r.fA[n]); dB.push(r.fB[n]); }
  $('swinglegend').innerHTML = `<span><i style="background:${ca}"></i>A: mean ${num(r.swingsA.mean)} swings, sd ${num(r.swingsA.sd)}</span><span><i style="background:${cb}"></i>B: mean ${num(r.swingsB.mean)} swings, sd ${num(r.swingsB.sd)}</span>`;
  barChart('swingchart', { labels, datasets: [
    { label: 'A', data: dA, backgroundColor: ca, borderRadius: 2, categoryPercentage: 0.9, barPercentage: 0.95 },
    { label: 'B', data: dB, backgroundColor: cb, borderRadius: 2, categoryPercentage: 0.9, barPercentage: 0.95 },
  ] }, 'Swing number', [[r.swingsA.mean - 1, ca], [r.swingsB.mean - 1, cb]]);

  // Step 5: time.
  const tA = A.interval * (r.swingsA.mean - 1), tB = B.interval * (r.swingsB.mean - 1);
  const pA = [], pB = [];
  for (let n = 1; n <= top; n++) {
    if (r.fA[n] > 1e-5) pA.push({ x: (A.interval * (n - 1)) / 10, y: r.fA[n] });
    if (r.fB[n] > 1e-5) pB.push({ x: (B.interval * (n - 1)) / 10, y: r.fB[n] });
  }
  const tMax = Math.max(10, (Math.max(A.interval, B.interval) * (top - 1)) / 10);
  $('timelegend').innerHTML = `<span><i style="background:${ca}"></i>A kills at ${sec(tA)} on average</span><span><i style="background:${cb}"></i>B kills at ${sec(tB)} on average</span>`;
  barChart('timechart', { datasets: [
    { label: 'A', data: pA, backgroundColor: ca, barThickness: 4 },
    { label: 'B', data: pB, backgroundColor: cb, barThickness: 4 },
  ] }, 'Time (seconds)', [[tA / 10, ca], [tB / 10, cb]], { linear: true, xMax: tMax });

  $('replay').innerHTML = '';
  $('simtable').innerHTML = '';
}

// One duel on a time axis: filled dot = hit, hollow = miss.
$('one').addEventListener('click', () => {
  const { A, B, r, opts } = state;
  if (r.nobody) { $('replay').textContent = 'Neither soldier can ever kill the other, so the duel never ends.'; return; }
  const f = fightOnce(A, B, Math.random, opts);
  const ca = css('--a'), cb = css('--b');
  const W = 760, L = 30, R = 12, end = Math.max(f.duration, 1);
  const x = (t) => L + ((W - L - R) * t) / end;
  let dots = '';
  for (const s of f.swings) {
    if (s.sa) dots += `<circle cx="${x(s.t)}" cy="18" r="5.5" fill="${s.hitA ? ca : 'none'}" stroke="${ca}" stroke-width="1.5"><title>${s.hitA ? `A hits for ${s.dmgA.toFixed(1)}` : 'A misses'}</title></circle>`;
    if (s.sb) dots += `<circle cx="${x(s.t)}" cy="44" r="5.5" fill="${s.hitB ? cb : 'none'}" stroke="${cb}" stroke-width="1.5"><title>${s.hitB ? `B hits for ${s.dmgB.toFixed(1)}` : 'B misses'}</title></circle>`;
  }
  const last = f.swings[f.swings.length - 1];
  const msg = { A: 'A wins', B: 'B wins', tie: 'Both die at the same instant', none: 'Stopped' }[f.winner];
  $('replay').innerHTML = `<p>Filled dot = hit, hollow = miss. Hover a dot to see the damage. The axis runs from 0 to ${sec(f.duration)}.</p>
    <svg viewBox="0 0 ${W} 62" width="100%" role="img" aria-label="Swings of one duel on a time axis">
      <text x="0" y="22" fill="currentColor" font-size="13">A</text><text x="0" y="48" fill="currentColor" font-size="13">B</text>${dots}</svg>
    <p style="color:var(--text)">${msg} after ${sec(f.duration)}. Hit points left: A ${last.ha.toFixed(1)}, B ${last.hb.toFixed(1)}.</p>`;
});

$('many').addEventListener('click', () => {
  const { A, B, r, opts } = state;
  if (r.nobody) { $('simtable').textContent = 'Neither soldier can ever kill the other, so the duel never ends.'; return; }
  const M = 10000, c = { A: 0, B: 0, tie: 0, none: 0 };
  let sumT = 0, ended = 0;
  for (let i = 0; i < M; i++) { const f = fightOnce(A, B, Math.random, opts); c[f.winner]++; if (isFinite(f.duration)) { sumT += f.duration; ended++; } }
  const row = (lab, s, e) => `<tr><td>${lab}</td><td>${s}</td><td>${e}</td></tr>`;
  $('simtable').innerHTML = `<table><tr><th></th><th>10,000 simulated</th><th>Exact formula</th></tr>
    ${row('A wins', pct(c.A / M), pct(r.winA))}${row('Both die', pct(c.tie / M), pct(r.tie))}${row('B wins', pct(c.B / M), pct(r.winB))}${row('Average length', sec(sumT / Math.max(1, ended)), sec(r.meanDuration))}</table>
    <p class="note">Press again: the simulated column wobbles by about half a point, the exact one never moves.</p>`;
});

document.querySelectorAll('.unit input').forEach((el) => el.addEventListener('input', render));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
render();
