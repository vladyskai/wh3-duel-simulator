import { duel, fightOnce } from './model.js';

const $ = (id) => document.getElementById(id);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const pct = (x) => (100 * x).toFixed(1) + '%';
const sec = (tenths) => (isFinite(tenths) ? (tenths / 10).toFixed(1) + ' s' : 'never');
const FIELDS = ['attack', 'defence', 'damage', 'hp', 'interval'];

// Typeset every formula once (they sit inside the collapsibles).
document.querySelectorAll('[data-tex]').forEach((el) => {
  const tex = el.getAttribute('data-tex');
  if (window.katex) katex.render(tex, el, { displayMode: true, throwOnError: false });
  else el.textContent = tex;
});

function readUnit(side) {
  const u = {};
  for (const f of FIELDS) {
    const input = $(`${side}-${f}`);
    u[f] = +input.value;
    input.nextElementSibling.textContent = f === 'interval' ? (u[f] / 10).toFixed(1) + ' s' : u[f];
  }
  return u;
}

const charts = {};
function barChart(id, datasets, xTitle, xMax, means, linear) {
  const muted = css('--muted');
  const cfg = {
    type: 'bar',
    data: linear ? { datasets } : { labels: datasets.labels, datasets: datasets.sets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: linear
          ? { type: 'linear', min: 0, max: xMax, title: { display: true, text: xTitle, color: muted }, ticks: { color: muted }, grid: { display: false } }
          : { title: { display: true, text: xTitle, color: muted }, ticks: { color: muted, maxTicksLimit: 16 }, grid: { display: false } },
        y: { ticks: { color: muted, callback: (v) => Math.round(v * 100) + '%' }, grid: { color: 'rgba(137,135,129,.18)' } },
      },
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

let state;
function render() {
  const A = readUnit('A'), B = readUnit('B');
  const r = duel(A, B);
  const ca = css('--a'), cb = css('--b');
  state = { A, B, r };

  // Headline result.
  const seg = (w, bg, fg, label) => (w > 0.0005 ? `<div style="width:${100 * w}%;background:${bg};color:${fg}">${w > 0.09 ? label : ''}</div>` : '');
  if (r.nobody) {
    $('winbar').innerHTML = seg(1, 'var(--neutral)', 'var(--muted)', 'Neither soldier can ever hit');
    $('winlegend').innerHTML = '';
    $('duration').textContent = 'The fight never ends.';
  } else {
    $('winbar').innerHTML = seg(r.winA, ca, '#fff', 'A wins ' + pct(r.winA)) + seg(r.tie, 'var(--neutral)', 'var(--muted)', 'Both die ' + pct(r.tie)) + seg(r.winB, cb, '#fff', 'B wins ' + pct(r.winB));
    $('winlegend').innerHTML = `<span><i style="background:${ca}"></i>A wins ${pct(r.winA)}</span><span><i style="background:var(--neutral);outline:1px solid var(--border)"></i>Both die ${pct(r.tie)}</span><span><i style="background:${cb}"></i>B wins ${pct(r.winB)}</span>`;
    $('duration').textContent = `Average fight length: ${sec(r.meanDuration)}`;
  }

  // Step 1 and 2.
  const coin = (p, col, lab) => `<div class="row"><span>${lab}</span><div class="track"><div style="width:${100 * p}%;background:${col}"></div></div><b>${pct(p)}</b></div>`;
  $('coins').className = 'bars';
  $('coins').innerHTML = coin(r.pA, ca, 'A hits B') + coin(r.pB, cb, 'B hits A');
  const blocks = (k, col, lab) => `<div class="row"><span>${lab}</span><div class="track blocks">${Array.from({ length: Math.min(k, 60) }, () => `<span style="background:${col}"></span>`).join('')}</div><b>${k}</b></div>`;
  $('hits').className = 'bars';
  $('hits').innerHTML = blocks(r.kA, ca, 'A must land') + blocks(r.kB, cb, 'B must land');

  // Range shown on the charts: until both units have finished in 99.5% of fights.
  let cA = 0, cB = 0, top = 5;
  for (let n = 1; n < r.fA.length; n++) {
    cA += r.fA[n]; cB += r.fB[n]; top = n;
    if ((cA > 0.995 || r.pA === 0) && (cB > 0.995 || r.pB === 0)) break;
  }
  top = Math.min(Math.max(top, 5), 150);

  // Step 3: swings.
  const labels = [], dA = [], dB = [];
  for (let n = 1; n <= top; n++) { labels.push(n); dA.push(r.fA[n]); dB.push(r.fB[n]); }
  $('swinglegend').innerHTML = `<span><i style="background:${ca}"></i>A: mean ${isFinite(r.meanSwingsA) ? r.meanSwingsA.toFixed(1) : 'never'} swings, sd ${r.sdSwingsA.toFixed(1)}</span><span><i style="background:${cb}"></i>B: mean ${isFinite(r.meanSwingsB) ? r.meanSwingsB.toFixed(1) : 'never'} swings, sd ${r.sdSwingsB.toFixed(1)}</span>`;
  barChart('swingchart', { labels, sets: [
    { label: 'A', data: dA, backgroundColor: ca, borderRadius: 2, categoryPercentage: 0.9, barPercentage: 0.95 },
    { label: 'B', data: dB, backgroundColor: cb, borderRadius: 2, categoryPercentage: 0.9, barPercentage: 0.95 },
  ] }, 'Swing number', null, [[r.meanSwingsA - 1, ca], [r.meanSwingsB - 1, cb]], false);

  // Step 4: time.
  const tA = A.interval * (r.meanSwingsA - 1), tB = B.interval * (r.meanSwingsB - 1);
  const pA = [], pB = [];
  for (let n = 1; n <= top; n++) {
    if (r.fA[n] > 1e-5) pA.push({ x: (A.interval * (n - 1)) / 10, y: r.fA[n] });
    if (r.fB[n] > 1e-5) pB.push({ x: (B.interval * (n - 1)) / 10, y: r.fB[n] });
  }
  const tMax = Math.max(10, (Math.max(A.interval, B.interval) * (top - 1)) / 10);
  $('timelegend').innerHTML = `<span><i style="background:${ca}"></i>A kills at ${sec(tA)} on average</span><span><i style="background:${cb}"></i>B kills at ${sec(tB)} on average</span>`;
  barChart('timechart', [
    { label: 'A', data: pA, backgroundColor: ca, barThickness: 4 },
    { label: 'B', data: pB, backgroundColor: cb, barThickness: 4 },
  ], 'Time (seconds)', tMax, [[tA / 10, ca], [tB / 10, cb]], true);

  $('replay').innerHTML = '';
  $('simtable').innerHTML = '';
}

// One duel on a time axis: filled dot = hit, hollow = miss.
$('one').addEventListener('click', () => {
  const { A, B, r } = state;
  if (r.nobody) { $('replay').textContent = 'Neither soldier can ever hit, so the duel never ends.'; return; }
  const f = fightOnce(A, B);
  const ca = css('--a'), cb = css('--b');
  const W = 760, L = 30, R = 12, end = Math.max(f.duration, 1);
  const x = (t) => L + ((W - L - R) * t) / end;
  let dots = '';
  for (const s of f.swings) {
    if (s.sa) dots += `<circle cx="${x(s.t)}" cy="18" r="5.5" fill="${s.hitA ? ca : 'none'}" stroke="${ca}" stroke-width="1.5"/>`;
    if (s.sb) dots += `<circle cx="${x(s.t)}" cy="44" r="5.5" fill="${s.hitB ? cb : 'none'}" stroke="${cb}" stroke-width="1.5"/>`;
  }
  const last = f.swings[f.swings.length - 1];
  const msg = { A: 'A wins', B: 'B wins', tie: 'Both die at the same instant', none: 'Stopped' }[f.winner];
  $('replay').innerHTML = `<p>Filled dot = hit, hollow = miss. The axis runs from 0 to ${sec(f.duration)}.</p>
    <svg viewBox="0 0 ${W} 62" width="100%" role="img" aria-label="Swings of one duel on a time axis">
      <text x="0" y="22" fill="currentColor" font-size="13">A</text><text x="0" y="48" fill="currentColor" font-size="13">B</text>${dots}</svg>
    <p style="color:var(--text)">${msg} after ${sec(f.duration)}. Hit points left: A ${last.ha}, B ${last.hb}.</p>`;
});

$('many').addEventListener('click', () => {
  const { A, B, r } = state;
  if (r.nobody) { $('simtable').textContent = 'Neither soldier can ever hit, so the duel never ends.'; return; }
  const M = 10000, c = { A: 0, B: 0, tie: 0, none: 0 };
  let sumT = 0;
  for (let i = 0; i < M; i++) { const f = fightOnce(A, B); c[f.winner]++; sumT += f.duration; }
  const row = (lab, s, e) => `<tr><td>${lab}</td><td>${s}</td><td>${e}</td></tr>`;
  $('simtable').innerHTML = `<table><tr><th></th><th>10,000 simulated</th><th>Exact formula</th></tr>
    ${row('A wins', pct(c.A / M), pct(r.winA))}${row('Both die', pct(c.tie / M), pct(r.tie))}${row('B wins', pct(c.B / M), pct(r.winB))}${row('Average length', sec(sumT / M), sec(r.meanDuration))}</table>
    <p class="note">Press again: the simulated column wobbles by about half a point, the exact one never moves.</p>`;
});

document.querySelectorAll('.unit input').forEach((el) => el.addEventListener('input', render));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
render();
