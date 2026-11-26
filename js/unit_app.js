import { GAME_LIMITS } from './model.js';
import { killRates, lanchester, markov, simulateUnits } from './unit_model.js';

const $ = (id) => document.getElementById(id);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const pct = (x) => (100 * x).toFixed(1) + '%';
const secs = (s) => (isFinite(s) ? s.toFixed(1) + ' s' : 'never');
const SIM_RUNS = 400;

const FIELDS = [
  { key: 'men', label: 'Soldiers', min: 1, max: 200 },
  { key: 'attack', label: 'Melee attack', min: 0, max: 100 },
  { key: 'defence', label: 'Melee defence', min: 0, max: 100 },
  { key: 'base', label: 'Base damage', min: 0, max: 400 },
  { key: 'ap', label: 'Armour-piercing', min: 0, max: 400 },
  { key: 'armour', label: 'Armour', min: 0, max: 200 },
  { key: 'hp', label: 'Hit points each', min: 1, max: 6000 },
  { key: 'interval', label: 'Attack interval', min: 20, max: 60, show: (v) => (v / 10).toFixed(1) + ' s' },
  { key: 'splash', label: 'Targets per swing', min: 1, max: 10 },
];
const DEFAULTS = {
  A: { men: 100, attack: 40, defence: 30, base: 25, ap: 5, armour: 30, hp: 100, interval: 40, splash: 1 },
  B: { men: 90, attack: 45, defence: 35, base: 25, ap: 5, armour: 30, hp: 100, interval: 40, splash: 1 },
};
for (const side of ['A', 'B']) {
  document.querySelector(`.unit[data-side="${side}"] .ctls`).innerHTML = FIELDS.map((f) => `<div class="ctl"><label for="${side}-${f.key}">${f.label}</label>
    <input type="range" id="${side}-${f.key}" min="${f.min}" max="${f.max}" step="1" value="${DEFAULTS[side][f.key]}"><output></output></div>`).join('');
}
document.querySelectorAll('[data-tex]').forEach((el) => {
  const tex = el.getAttribute('data-tex');
  if (window.katex) katex.render(tex, el, { displayMode: true, throwOnError: false }); else el.textContent = tex;
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
function drawChart(id, cfg) { if (charts[id]) charts[id].destroy(); charts[id] = new Chart($(id), cfg); }
const axis = (title, extra = {}) => ({ title: { display: true, text: title, color: css('--muted') }, ticks: { color: css('--muted') }, grid: { color: 'rgba(137,135,129,.18)' }, ...extra });

let current = null, simJob = 0, sim = null;

function render() {
  const A = readUnit('A'), B = readUnit('B');
  const opts = { limits: $('lim-on').checked ? GAME_LIMITS : null, minDamage: $('min-on').checked, targeting: $('targeting').value };
  const rates = { A: killRates(A, B, opts), B: killRates(B, A, opts) };
  const ln = lanchester(A, B, opts, rates), mk = markov(A, B, opts, rates), mk1 = markov(A, B, opts, rates, false);
  current = { A, B, opts, rates, ln, mk, mk1 };
  sim = null;
  const ca = css('--a'), cb = css('--b');

  // Headline: the corrected Markov chain.
  const seg = (w, bg, fg, label) => (w > 0.0005 ? `<div style="width:${100 * w}%;background:${bg};color:${fg}">${w > 0.09 ? label : ''}</div>` : '');
  if (mk.stuck > 0.999) {
    $('winbar').innerHTML = seg(1, 'var(--neutral)', 'var(--muted)', 'Neither unit can ever kill the other');
    $('winlegend').innerHTML = ''; $('duration').textContent = 'The fight never ends.';
  } else {
    $('winbar').innerHTML = seg(mk.winA, ca, '#fff', 'A wins ' + pct(mk.winA)) + seg(mk.winB, cb, '#fff', 'B wins ' + pct(mk.winB)) + seg(mk.stuck, 'var(--neutral)', 'var(--muted)', 'Never ends');
    const left = (w, n) => (w >= 0.0005 ? `, with ${n.toFixed(1)} soldiers left on average` : '');
    $('winlegend').innerHTML = `<span><i style="background:${ca}"></i>A wins ${pct(mk.winA)}${left(mk.winA, mk.meanSurvA)}</span><span><i style="background:${cb}"></i>B wins ${pct(mk.winB)}${left(mk.winB, mk.meanSurvB)}</span>`;
    $('duration').textContent = `Average fight length: ${secs(mk.meanDuration)} (Markov chain with stages; the table compares all three tools)`;
  }

  // Step 1: kill rates and square-law strength.
  const r1 = (lab, r, col, n) => `<div class="row"><span>${lab}</span><div class="sub" style="margin:0;color:var(--text)">${r > 0 ? `${r.toFixed(4)} kills per second: one kill every ${secs(1 / r)}` : 'can never kill'}. Strength λ·N² = ${(r * n * n).toFixed(1)}</div></div>`;
  $('rates').innerHTML = r1('Each A soldier', rates.A[1], ca, A.men) + r1('Each B soldier', rates.B[1], cb, B.men)
    + (A.splash > 1 || B.splash > 1 ? '<p class="note">With splash, the rate shown is for one target per swing. The tools use the rate for as many targets as the swing can reach.</p>' : '');

  // Step 3 note on stages.
  $('stagesnote').textContent = `Here: each A soldier counts as ${mk.cA} stage${mk.cA > 1 ? 's' : ''} and each B soldier as ${mk.cB}. The plain chain (c = 1) would say A wins ${pct(mk1.winA)} instead of ${pct(mk.winA)}.`;

  drawCurves(); drawSurvivors(); drawTable();
  startSim();
}

function drawCurves() {
  const { ln } = current, ca = css('--a'), cb = css('--b');
  const lnA = ln.series.map((s) => ({ x: s.t, y: s.a })), lnB = ln.series.map((s) => ({ x: s.t, y: s.b }));
  const ds = [
    { label: 'A (Lanchester)', data: lnA, borderColor: ca, backgroundColor: ca, borderWidth: 2, pointRadius: 0 },
    { label: 'B (Lanchester)', data: lnB, borderColor: cb, backgroundColor: cb, borderWidth: 2, pointRadius: 0 },
  ];
  if (sim && sim.done > 0) {
    // Array.from, not .map: a Float64Array's map can only hold numbers, not points
    const pts = (arr) => Array.from(arr.subarray(0, sim.len), (v, s) => ({ x: s, y: v / sim.done }));
    ds.push({ label: 'A (simulation average)', data: pts(sim.curveA), borderColor: ca, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0 });
    ds.push({ label: 'B (simulation average)', data: pts(sim.curveB), borderColor: cb, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0 });
  }
  const tEnd = Math.max(isFinite(ln.duration) ? ln.duration : 0, sim && sim.done ? sim.len : 0, 10);
  $('curvelegend').innerHTML = `<span><i style="background:${ca}"></i>A</span><span><i style="background:${cb}"></i>B</span><span>Solid: Lanchester</span><span>Dashed: simulation average${sim && sim.done ? ` (${sim.done} fights)` : ''}</span>`;
  drawChart('curvechart', { type: 'line', data: { datasets: ds }, options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } },
    scales: { x: axis('Time (seconds)', { type: 'linear', min: 0, max: Math.ceil(Math.min(tEnd, 3600)) , grid: { display: false } }), y: axis('Soldiers alive', { min: 0 }) } } });
}

function drawSurvivors() {
  const { A, B, mk } = current, ca = css('--a'), cb = css('--b');
  const n = Math.max(A.men, B.men), labels = [], dA = [], dB = [], sA = [], sB = [];
  for (let k = 1; k <= n; k++) {
    labels.push(k); dA.push(k <= A.men ? mk.survA[k] : 0); dB.push(k <= B.men ? mk.survB[k] : 0);
    if (sim && sim.done) { sA.push(k <= A.men ? sim.survA[k] / sim.done : 0); sB.push(k <= B.men ? sim.survB[k] / sim.done : 0); }
  }
  const ds = [
    { type: 'bar', label: 'A wins with k left (chain)', data: dA, backgroundColor: ca, categoryPercentage: 0.9, barPercentage: 1 },
    { type: 'bar', label: 'B wins with k left (chain)', data: dB, backgroundColor: cb, categoryPercentage: 0.9, barPercentage: 1 },
  ];
  if (sim && sim.done) {
    ds.push({ type: 'line', label: 'A (simulation)', data: sA, borderColor: ca, borderDash: [4, 3], borderWidth: 1.5, pointRadius: 0, tension: 0.2 });
    ds.push({ type: 'line', label: 'B (simulation)', data: sB, borderColor: cb, borderDash: [4, 3], borderWidth: 1.5, pointRadius: 0, tension: 0.2 });
  }
  $('survlegend').innerHTML = `<span><i style="background:${ca}"></i>A wins with k soldiers left</span><span><i style="background:${cb}"></i>B wins with k left</span><span>Bars: Markov chain</span><span>Dashed: simulation (noisy, ${sim && sim.done ? sim.done : 0} fights)</span>`;
  drawChart('survchart', { data: { labels, datasets: ds }, options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } },
    scales: { x: axis('Survivors of the winning side', { grid: { display: false }, ticks: { color: css('--muted'), maxTicksLimit: 20 } }), y: axis('Probability', { ticks: { color: css('--muted'), callback: (v) => (100 * v).toFixed(1) + '%' } }) } } });
}

function drawTable() {
  const { ln, mk, mk1 } = current;
  const lnWin = ln.winner === 'A' ? 'A, certainly' : ln.winner === 'B' ? 'B, certainly' : ln.winner === 'tie' ? 'a draw' : 'never ends';
  const s = sim && sim.done ? sim : null;
  const cell = (v) => `<td>${v}</td>`;
  $('compare').innerHTML = `<tr><th></th><th>Simulation${s ? ` (${s.done} fights)` : ''}</th><th>Markov chain</th><th>Plain chain</th><th>Lanchester</th></tr>
    <tr><td>A wins</td>${cell(s ? pct(s.A / s.done) : '...')}${cell(pct(mk.winA))}${cell(pct(mk1.winA))}${cell(lnWin)}</tr>
    <tr><td>B wins</td>${cell(s ? pct(s.B / s.done) : '...')}${cell(pct(mk.winB))}${cell(pct(mk1.winB))}${cell('')}</tr>
    <tr><td>Average length</td>${cell(s ? secs(s.sumT / Math.max(1, s.ended)) : '...')}${cell(secs(mk.meanDuration))}${cell(secs(mk1.meanDuration))}${cell(secs(ln.duration))}</tr>`;
}

// The simulation runs in small slices so the page stays responsive, and restarts on every change.
function startSim() {
  const job = ++simJob, { A, B, opts } = current;
  sim = { done: 0, A: 0, B: 0, sumT: 0, ended: 0, survA: new Float64Array(A.men + 1), survB: new Float64Array(B.men + 1), curveA: new Float64Array(3601), curveB: new Float64Array(3601), len: 0 };
  $('simstatus').textContent = 'Simulating...';
  const slice = () => {
    if (job !== simJob) return;
    const t0 = performance.now();
    while (sim.done < SIM_RUNS && performance.now() - t0 < 30) {
      const f = simulateUnits(A, B, opts);
      sim.done++;
      if (f.winner === 'A') { sim.A++; sim.survA[f.survA]++; }
      if (f.winner === 'B') { sim.B++; sim.survB[f.survB]++; }
      if (isFinite(f.duration)) { sim.sumT += f.duration; sim.ended++; }
      const last = f.samples.length - 1, end = f.samples[last];
      sim.len = Math.max(sim.len, Math.min(3601, last + 2));
      for (let s = 0; s < 3601; s++) { const smp = s < last ? f.samples[s] : end; sim.curveA[s] += smp.a; sim.curveB[s] += smp.b; }
    }
    drawTable();
    if (sim.done >= SIM_RUNS) {
      $('simstatus').textContent = `Simulation: ${sim.done} fights with the rule "${$('targeting').selectedOptions[0].text}". With this many fights its percentages wobble by about 2 points.`;
      drawCurves(); drawSurvivors();
    } else { $('simstatus').textContent = `Simulating... ${sim.done} of ${SIM_RUNS} fights`; setTimeout(slice, 0); }
  };
  setTimeout(slice, 120);
}

let pending = 0;
const schedule = () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(render); };
document.querySelectorAll('.unit input, #lim-on, #min-on, #targeting').forEach((el) => el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', schedule));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
render();
