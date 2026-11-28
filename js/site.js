// The site: one endless canvas. The map runs every step of the model from top to bottom,
// each step's card sits to the left of its band, the stats are in a floating window and the
// model inputs in another. The stage (1 to 5) decides which stats and steps are in play.
import { fightOnce, stageUnits, stageDuel } from './model.js';
import { unitBattle } from './unit.js';
import { unitCardHtml, unitRuleHtml } from './unitcard.js';
import { $, css, pct, sec, num } from './util.js';
import { FIELDS, buildControls, readUnit, scheduleGains, applyStage } from './controls.js';
import { buildLanes, layoutMap } from './maps.js';
import { barsSvg } from './charts.js';
import { makeCanvas } from './canvas.js';

const STAGE_INFO = [
  null,
  { name: 'One attacker', text: 'A swings at B until B falls, and B only defends. A has a melee attack and a damage per hit, B a melee defence and hit points. The answer: how many swings it takes.' },
  { name: 'Time', text: 'A swings once per attack interval. The answer: how long it takes.' },
  { name: 'Both fight', text: 'B strikes back with its own attack, damage and interval, and A gets a defence and hit points. The answer: who lands the killing blow first.' },
  { name: 'Armour', text: 'Armour blocks a random share of the damage of every hit, so the hits needed become random.' },
  { name: 'Armour-piercing', text: 'Part of the damage ignores armour. This is the full one-soldier duel.' },
  { name: 'Units', text: 'Whole units: many soldiers in a formation, of which only the front fights. A simulation with a rule measured in the game.' },
];
const LAST_STAGE = 6;
// The one-soldier part of the page (the map, its cards, the gains) stops at stage 5.
const duelStage = () => Math.min(stage, 5);
const STAGE_KEY = 'wh3-duel-stage';
let stage = 5;
try { const v = Number(localStorage.getItem(STAGE_KEY)); if (v >= 1 && v <= LAST_STAGE) stage = v; } catch { /* first visit */ }

// ---- Where the cards go: to the left of the band they explain, the title card above.
const CARD_W = 820, CARD_GAP = 70, UNIT_W = 900;
// The map is drawn 1.5 times larger than its own units, so its text matches the cards' text.
const MS = 1.5;
const BAND_CARDS = { coin: ['card-1'], dmg: ['card-2'], hits: ['card-3'], swings: ['card-4'], time: ['card-5'], race: ['card-67', 'card-sim'] };
const ALL_CARDS = ['card-title', 'card-unit', ...Object.values(BAND_CARDS).flat()];
let model = null, laid = null;

function layout() {
  if (!model) return;
  // Each band is at least as tall as its cards, so a card never runs into the next band.
  const minH = {};
  for (const [step, ids] of Object.entries(BAND_CARDS)) {
    const els = ids.map($).filter((el) => !el.hidden);
    if (els.length) minH[step] = (els.reduce((h, el) => h + el.offsetHeight, 0) + 24 * (els.length - 1) + 40) / MS;
  }
  const L = layoutMap(model, minH);
  // From here on, everything is in canvas units (map units x MS).
  const bands = {};
  for (const [k, b] of Object.entries(L.bands)) bands[k] = { x0: b.x0 * MS, x1: b.x1 * MS, y0: b.y0 * MS, y1: b.y1 * MS };
  laid = { bands, x0: L.x0 * MS, x1: L.x1 * MS, height: L.height * MS };
  $('wholeworld').innerHTML = L.svg;
  $('wholeworld').setAttribute('transform', `scale(${MS})`);
  const svg = $('mapsvg');
  svg.style.width = laid.x1 + 'px';
  svg.style.height = laid.height + 'px';
  const cx = laid.x0 - CARD_GAP - CARD_W;
  for (const [step, ids] of Object.entries(BAND_CARDS)) {
    let y = laid.bands[step] ? laid.bands[step].y0 : 0;
    for (const id of ids) {
      const el = $(id);
      el.style.left = cx + 'px';
      el.style.top = y + 'px';
      y += el.offsetHeight + 24;
    }
  }
  const t = $('card-title');
  t.style.left = cx + 'px';
  t.style.top = -40 - t.offsetHeight + 'px';
  // The unit card (stage 6) sits to the left of the title card, its top level with it, and
  // runs down beside the step cards (nothing else is in that column).
  const u = $('card-unit');
  u.style.left = cx - CARD_GAP - UNIT_W + 'px';
  u.style.top = t.style.top;
}
let layoutQueued = false;
const scheduleLayout = () => {
  if (layoutQueued) return;
  layoutQueued = true;
  requestAnimationFrame(() => { layoutQueued = false; layout(); });
};

const rectOf = (el) => ({ x0: el.offsetLeft, y0: el.offsetTop, x1: el.offsetLeft + el.offsetWidth, y1: el.offsetTop + el.offsetHeight });
const union = (...rs) => ({ x0: Math.min(...rs.map((r) => r.x0)), y0: Math.min(...rs.map((r) => r.y0)), x1: Math.max(...rs.map((r) => r.x1)), y1: Math.max(...rs.map((r) => r.y1)) });
// A jump shows the step's card and the top of its band, readable on a laptop.
function jumpRect(key) {
  if (key === 'start') return union(rectOf($('card-title')), rectOf($('card-1')));
  if (key === 'unit') {
    if ($('card-unit').hidden) return null;
    const u = rectOf($('card-unit'));
    return { ...u, y1: Math.min(u.y1, u.y0 + 1000) };   // the top of the card: the result
  }
  const b = laid.bands[key];
  if (!b) return null;
  const cards = BAND_CARDS[key].map($).filter((el) => !el.hidden).map(rectOf);
  return union(...cards, { x0: b.x0, y0: b.y0, x1: b.x1, y1: Math.min(b.y1, b.y0 + 900) });
}
const bounds = () => union(...ALL_CARDS.map($).filter((el) => !el.hidden).map(rectOf), { x0: laid.x0, y0: 0, x1: laid.x1, y1: laid.height });

const stats = $('stats'), inputs = $('inputs');
const canvas = makeCanvas($('canvas'), $('world'), {
  bounds,
  insets: () => ({
    left: stats.hidden ? 0 : stats.offsetLeft + stats.offsetWidth,
    right: inputs.hidden ? 0 : window.innerWidth - inputs.offsetLeft,
    top: 56,
  }),
});

// Typeset every formula once (they sit inside the "Formula" toggles).
document.querySelectorAll('[data-tex]').forEach((el) => {
  const tex = el.getAttribute('data-tex');
  if (window.katex) katex.render(tex, el, { displayMode: true, throwOnError: false });
  else el.textContent = tex;
});
const tex = (s) => (window.katex ? katex.renderToString(s, { throwOnError: false }) : s);

// Index range [1, top] that holds 99.5% of the distributions.
function span(fs, cap) {
  const c = fs.map(() => 0), t = fs.map(() => 0);
  for (let i = 1; i < fs[0].length; i++) {
    fs.forEach((f, j) => { c[j] += f[i]; if (!t[j] && c[j] > 0.995) t[j] = i; });
    if (t.every(Boolean)) break;
  }
  return Math.min(Math.max(...t, 5), cap);
}

// ---- The stage: which elements show, which stats count.
function showStage() {
  document.querySelectorAll('[data-from], [data-upto]').forEach((el) => {
    const from = Number(el.dataset.from || 1), upto = Number(el.dataset.upto || LAST_STAGE);
    el.hidden = stage < from || stage > upto;
  });
  document.querySelectorAll('.stagebtns button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.stage) === stage)));
  $('stagedesc').innerHTML = `<b>Stage ${stage}: ${STAGE_INFO[stage].name}.</b> ${STAGE_INFO[stage].text}`;
  $('stageline').innerHTML = `Model stage ${stage} of ${LAST_STAGE}: <b>${STAGE_INFO[stage].name}</b>. ${STAGE_INFO[stage].text}`;
  for (const o of $('jump').options) o.hidden = (o.value === 'time' && stage < 2) || (o.value === 'race' && stage < 3) || (o.value === 'unit' && stage < 6);
  applyStage(stage);
}
document.querySelectorAll('.stagebtns button').forEach((b) => b.addEventListener('click', () => {
  stage = Number(b.dataset.stage);
  try { localStorage.setItem(STAGE_KEY, String(stage)); } catch { /* not remembered */ }
  showStage();
  render();
}));

let state;
function render() {
  const raw = { A: readUnit('A'), B: readUnit('B') };
  const ds = duelStage();
  const [A, B] = stageUnits(raw.A, raw.B, ds);
  const r = stageDuel(ds)(raw.A, raw.B);
  const ca = css('--a'), cb = css('--b'), two = stage >= 3;
  state = { A, B, r, raw, stage: ds };
  scheduleGains({ A: raw.A, B: raw.B, r, stage: ds });
  if (stage >= 6) scheduleUnits(raw.A, raw.B);

  // The answer of this stage: in the stats window and on the title card.
  const solo = `A needs ${num(r.swingsA.mean)} swings on average${stage === 2 ? `, ${sec(r.meanDuration)}` : ''} to bring B down`;
  $('stats-result').innerHTML = !two ? `<b style="color:var(--a)">${num(r.swingsA.mean)} swings${stage === 2 ? `, ${sec(r.meanDuration)}` : ''}</b>`
    : r.nobody ? 'nobody can win'
      : `<b style="color:var(--a)">A ${pct(r.winA)}</b> <span>both ${pct(r.tie)}</span> <b style="color:var(--b)">B ${pct(r.winB)}</b>`;
  const seg = (w, bg, fg, label) => (w > 0.0005 ? `<div style="width:${100 * w}%;background:${bg};color:${fg}">${w > 0.09 ? label : ''}</div>` : '');
  if (!two) {
    $('duration').textContent = isFinite(r.swingsA.mean) ? solo + '.' : 'A can never bring B down.';
  } else if (r.nobody) {
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
  $('coins').innerHTML = coin(r.pA, ca, 'A hits B') + (two ? coin(r.pB, cb, 'B hits A') : '');

  // The charts of the cards: both units from stage 3, A alone before.
  const sides = two ? [['A', ca], ['B', cb]] : [['A', ca]];
  const pts = (pmf, lo, hi) => { const out = []; for (let v = lo; v <= hi; v++) out.push([v, pmf[v] || 0]); return out; };
  const legend = (fn) => sides.map(([s, c]) => `<span><i style="background:${c}"></i>${fn(s)}</span>`).join('');
  const dOf = (s) => (s === 'A' ? r.dA : r.dB);
  const dLo = Math.min(...sides.map(([s]) => dOf(s).min)), dHi = Math.max(...sides.map(([s]) => dOf(s).max));
  $('dmglegend').innerHTML = legend((s) => { const d = dOf(s); return `${s} on ${s === 'A' ? 'B' : 'A'}: ${d.min === d.max ? `always ${d.min}` : `${d.min} to ${d.max}`} per hit, ${num(d.mean, 2)} on average${d.q > 0 ? `, ${pct(d.q)} of hits lose all their base damage` : ''}`; });
  $('dmgchart').innerHTML = barsSvg({ series: sides.map(([s, c]) => ({ col: c, pts: pts(dOf(s).pmf, dLo, dHi) })),
    xMin: dLo - 0.5, xMax: dHi + 0.5, xLabel: 'Damage of one hit', means: sides.map(([s, c]) => [dOf(s).mean, c]), aria: 'Chance of each damage value for one hit' });
  const gOf = (s) => (s === 'A' ? r.gA : r.gB), fOf = (s) => (s === 'A' ? r.fA : r.fB);
  const hOf = (s) => (s === 'A' ? r.hitsA : r.hitsB), wOf = (s) => (s === 'A' ? r.swingsA : r.swingsB);
  const kTop = span(sides.map(([s]) => gOf(s)), 150);
  $('hitlegend').innerHTML = legend((s) => (stage <= 3 ? `${s}: always ${num(hOf(s).mean, 0)} hits` : `${s}: ${num(hOf(s).mean)} hits on average, sd ${num(hOf(s).sd, 2)}`));
  $('hitchart').innerHTML = barsSvg({ series: sides.map(([s, c]) => ({ col: c, pts: pts(gOf(s), 1, kTop) })),
    xMin: 0.5, xMax: kTop + 0.5, xLabel: 'Hits needed', means: sides.map(([s, c]) => [hOf(s).mean, c]), aria: 'Chance of needing k hits' });
  const top = span(sides.map(([s]) => fOf(s)), 150);
  $('swinglegend').innerHTML = legend((s) => `${s}: mean ${num(wOf(s).mean)} swings, sd ${num(wOf(s).sd)}`);
  $('swingchart').innerHTML = barsSvg({ series: sides.map(([s, c]) => ({ col: c, pts: pts(fOf(s), 1, top) })),
    xMin: 0.5, xMax: top + 0.5, xLabel: 'Swing number', means: sides.map(([s, c]) => [wOf(s).mean, c]), aria: 'Chance of finishing on each swing' });
  if (stage >= 2) {
    const iv = (s) => (s === 'A' ? A.interval : B.interval);
    const tMean = (s) => iv(s) * (wOf(s).mean - 1);
    const tp = (s) => { const out = [], f = fOf(s); for (let n = 1; n <= top; n++) if (f[n] > 1e-5) out.push([(iv(s) * (n - 1)) / 10, f[n]]); return out; };
    const tMax = Math.max(10, (Math.max(...sides.map(([s]) => iv(s))) * (top - 1)) / 10);
    $('timelegend').innerHTML = legend((s) => `${s} kills at ${sec(tMean(s))} on average`);
    $('timechart').innerHTML = barsSvg({ series: sides.map(([s, c]) => ({ col: c, pts: tp(s) })),
      xMin: 0, xMax: tMax, barW: 4, xLabel: 'Time (seconds)', means: sides.map(([s, c]) => [tMean(s) / 10, c]), aria: 'Chance of landing the killing blow at each moment' });
  }

  $('inputs-body').innerHTML = inputsHtml(raw.A, raw.B, r);
  model = buildLanes(state, ds);
  layout();
  $('replay').innerHTML = '';
  $('simtable').innerHTML = '';
}

// ---- The model inputs: the numbers the model really needs, and the stats they come from.
function inputsHtml(A, B, r) {
  const two = stage >= 3, sides = two ? ['A', 'B'] : ['A'];
  const rows = [];
  const row = (sym, val, from, what) => rows.push(`<tr><td>${tex(sym)}</td><td class="v">${val}</td><td>${from}<div class="what">${what}</div></td></tr>`);
  for (const s of sides) {
    const att = s === 'A' ? A : B, def = s === 'A' ? B : A, o = s === 'A' ? 'B' : 'A', p = s === 'A' ? r.pA : r.pB;
    row(`p_${s}`, pct(p), `35 + ${s}'s attack ${att.attack} &minus; ${o}'s defence ${def.defence}`, `the chance that one swing of ${s} hits`);
    if (stage <= 3) {
      const D = att.base, K = D > 0 ? Math.ceil(def.hp / D) : '&infin;';
      const lo = D > 0 ? (K - 1) * D + 1 : 0, hi = D > 0 ? K * D : 0;
      row(`K_${s}`, K, `&lceil;${o}'s hit points ${def.hp} / ${s}'s damage ${D}&rceil;`, D > 0 ? `hits needed. Any hit points from ${lo} to ${hi} give the same K, so the same fight` : 'no damage: never');
    } else {
      row(`B_${s}`, att.base, `${s}'s base damage`, 'needed as it is');
      if (stage >= 5) row(`\\mathrm{AP}_${s}`, att.ap, `${s}'s armour-piercing damage`, 'needed as it is');
      row(`\\mathrm{Armour}_${o}`, def.armour, `${o}'s armour`, `only counts against ${s}'s base damage`);
      row(`\\mathrm{HP}_${o}`, def.hp, `${o}'s hit points`, 'needed as it is');
    }
  }
  if (stage === 2) row('a', sec(A.interval), "A's attack interval", 'only stretches the time scale');
  if (two) {
    row('a / b', (A.interval / B.interval).toFixed(3), `${sec(A.interval)} / ${sec(B.interval)}`, 'the only part of the two intervals that decides who wins');
    row('a', sec(A.interval), "A's attack interval", 'only needed for the fight length (the time scale)');
  }
  if (stage >= 6) {
    for (const s of ['A', 'B']) {
      const u = s === 'A' ? A : B;
      row(`n_${s}`, u.men, `${s}'s soldiers`, 'how many soldiers the unit has');
      row(`w_${s}`, u.files, `${s}'s width in files`, 'sets how many soldiers fight and how many can be hit');
    }
  }
  const used = FIELDS.reduce((n, f) => n + (stage >= f.from.A ? 1 : 0) + (stage >= f.from.B ? 1 : 0), 0);
  const nums = rows.length, winner = two ? nums - 1 : nums;
  $('inputs-count').textContent = `${used} stats → ${nums} numbers`;
  const notes = [
    `Melee attack and melee defence only count through their difference, so ${two ? 'four stats become two hit chances' : 'two stats become one hit chance'}.`,
    stage <= 3 ? 'With a fixed damage, hit points and damage only count through K, the number of hits it takes.'
      : 'With armour the damage is random, so hit points, damage and armour no longer merge into one number: K becomes a whole distribution, built from all of them.',
    two ? `Who wins depends only on the ratio a / b of the two attack intervals (the tests check it), so ${winner} numbers decide the winner. The interval a itself only sets how long the fight lasts.` : '',
    stage <= 2 ? 'Everything about the swings needed comes from just p and K: N follows the negative binomial NB(K, p).' : '',
  ].filter(Boolean);
  return `<p class="note">The game uses <b>${used} stats</b> at this stage. The model really needs <b>${nums} numbers</b>: the rest of each stat is absorbed on the way.</p>
    <table class="inputs-table"><tr><th>number</th><th>value</th><th>made from</th></tr>${rows.join('')}</table>
    <ul class="note">${notes.map((n) => `<li>${n}</li>`).join('')}</ul>`;
}

// ---- Stage 6: the unit fight. A quick answer at once (a few fights, a few milliseconds), the
// full one when the sliders have been still for a moment. Both have a time budget, so a
// slow pair of units gives fewer fights, never a frozen page.
let unitTimer = 0, unitSeed = 1;
function showUnits(A, B, opts) {
  const r = unitBattle(A, B, { seed: unitSeed, ...opts });
  $('unitresult').innerHTML = unitCardHtml(r, css('--a'), css('--b'));
  $('stats-result').innerHTML = `<span>units:</span> <b style="color:var(--a)">A ${pct(r.pA)}</b> <b style="color:var(--b)">B ${pct(r.pB)}</b>`;
}
function scheduleUnits(A, B) {
  showUnits(A, B, { runs: 60, budgetMs: 30 });
  clearTimeout(unitTimer);
  unitTimer = setTimeout(() => showUnits(A, B, { runs: 1000, budgetMs: 400 }), 200);
}
$('unitrule').innerHTML = unitRuleHtml();
$('unit-again').addEventListener('click', () => { unitSeed++; showUnits(state.raw.A, state.raw.B, { runs: 1000, budgetMs: 400 }); });

// Redraw at most once per frame, however fast a slider moves.
let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; render(); });
}
const reset = buildControls(schedule);
$('stats-reset').addEventListener('click', reset);

// One duel on a time axis: filled dot = hit, hollow = miss.
$('one').addEventListener('click', () => {
  const { A, B, r } = state;
  if (r.nobody) { $('replay').textContent = 'Neither soldier can ever kill the other, so the duel never ends.'; return; }
  const f = fightOnce(A, B);
  const ca = css('--a'), cb = css('--b');
  const end0 = f.swings[f.swings.length - 1];
  const verdict = { A: 'A wins', B: 'B wins', tie: 'Both die at the same instant', none: 'Stopped after 20,000 swings, nobody down' }[f.winner];
  if (f.swings.length > 600) { // too many swings to draw one dot each
    $('replay').innerHTML = `<p style="color:var(--text)">${verdict}${isFinite(f.duration) ? ` after ${sec(f.duration)}` : ''}. This fight took ${f.swings.length.toLocaleString('en')} rounds of swings, too many to draw one by one. Hit points left: A ${end0.ha}, B ${end0.hb}.</p>`;
    return;
  }
  const W = 760, L = 30, R = 12, end = Math.max(f.duration, 1);
  const x = (t) => L + ((W - L - R) * t) / end;
  let dots = '';
  for (const s of f.swings) {
    if (s.sa) dots += `<circle cx="${x(s.t)}" cy="18" r="5.5" fill="${s.hitA ? ca : 'none'}" stroke="${ca}" stroke-width="1.5"><title>${s.hitA ? `A hits for ${s.dmgA}` : 'A misses'}</title></circle>`;
    if (s.sb) dots += `<circle cx="${x(s.t)}" cy="44" r="5.5" fill="${s.hitB ? cb : 'none'}" stroke="${cb}" stroke-width="1.5"><title>${s.hitB ? `B hits for ${s.dmgB}` : 'B misses'}</title></circle>`;
  }
  const last = f.swings[f.swings.length - 1];
  const msg = { A: 'A wins', B: 'B wins', tie: 'Both die at the same instant', none: 'Stopped' }[f.winner];
  $('replay').innerHTML = `<p>Filled dot = hit, hollow = miss. Hover a dot to see the damage. The axis runs from 0 to ${sec(f.duration)}.</p>
    <svg viewBox="0 0 ${W} 62" width="100%" role="img" aria-label="Swings of one duel on a time axis">
      <text x="0" y="22" fill="currentColor" font-size="13">A</text><text x="0" y="48" fill="currentColor" font-size="13">B</text>${dots}</svg>
    <p style="color:var(--text)">${msg} after ${sec(f.duration)}. Hit points left: A ${last.ha}, B ${last.hb}.</p>`;
});
$('many').addEventListener('click', () => {
  const { A, B, r } = state;
  if (r.nobody) { $('simtable').textContent = 'Neither soldier can ever kill the other, so the duel never ends.'; return; }
  // Up to 10,000 duels, but never more than about one second of work: very long fights
  // (thousands of swings each) would otherwise freeze the page.
  const c = { A: 0, B: 0, tie: 0, none: 0 }, t0 = performance.now();
  let sumT = 0, ended = 0, M = 0, leftA = 0, leftB = 0;
  while (M < 10000 && (M % 50 !== 0 || performance.now() - t0 < 1000)) {
    const f = fightOnce(A, B, Math.random, false);
    c[f.winner]++; M++;
    if (f.winner === 'A') leftA += f.ha;
    if (f.winner === 'B') leftB += f.hb;
    if (isFinite(f.duration)) { sumT += f.duration; ended++; }
  }
  const count = M.toLocaleString('en');
  const row = (lab, s, e) => `<tr><td>${lab}</td><td>${s}</td><td>${e}</td></tr>`;
  $('simtable').innerHTML = `<table><tr><th></th><th>${count} simulated</th><th>Exact formula</th></tr>
    ${row('A wins', pct(c.A / M), pct(r.winA))}${row('Both die', pct(c.tie / M), pct(r.tie))}${row('B wins', pct(c.B / M), pct(r.winB))}${row('Average length', sec(sumT / Math.max(1, ended)), sec(r.meanDuration))}${row(`A's hit points left when A wins`, c.A ? `${num(leftA / c.A)} of ${A.hp}` : 'A never won', 'simulation only')}${row(`B's hit points left when B wins`, c.B ? `${num(leftB / c.B)} of ${B.hp}` : 'B never won', 'simulation only')}</table>
    <p class="note">${M < 10000 ? `These fights are very long, so the simulation stopped after one second, at ${count} duels. ` : ''}Press again: the simulated column wobbles${M < 10000 ? '' : ' by about half a point'}, the exact one never moves.</p>`;
});

// ---- Toolbar.
$('jump').addEventListener('change', (e) => {
  const r = e.target.value && laid ? jumpRect(e.target.value) : null;
  if (r) canvas.showRect(r);
  e.target.value = '';
  e.target.blur();
});
$('w-fit').addEventListener('click', canvas.fit);
$('w-in').addEventListener('click', canvas.zoomIn);
$('w-out').addEventListener('click', canvas.zoomOut);
function toast(text) {
  const t = $('toast');
  t.textContent = text; t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 6000);
}
$('w-full').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else throw new Error('no full screen');
  } catch {
    // Some windows (an embedded preview, some browsers) refuse it: say so instead of doing nothing.
    toast('This window does not allow full screen. In a normal browser tab, press F11.');
  }
});
document.addEventListener('fullscreenchange', () => {
  $('w-full').textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
});

// ---- The two floating windows: drag them by their title bar, hide them, show them again.
// Their place and whether they are shown are remembered in this browser.
function floatingWindow(panel, head, key, { onShow = () => {} } = {}) {
  const save = () => { try { localStorage.setItem(key, JSON.stringify({ x: panel.offsetLeft, y: panel.offsetTop, hidden: panel.hidden })); } catch { /* not remembered */ } };
  const move = (x, y) => {
    panel.style.left = Math.max(0, Math.min(window.innerWidth - 80, x)) + 'px';
    panel.style.top = Math.max(0, Math.min(window.innerHeight - 40, y)) + 'px';
  };
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(key)); } catch { /* first visit */ }
  let drag = null;
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    drag = { dx: e.clientX - panel.offsetLeft, dy: e.clientY - panel.offsetTop };
    try { head.setPointerCapture(e.pointerId); } catch { /* still works */ }
  });
  head.addEventListener('pointermove', (e) => { if (drag) move(e.clientX - drag.dx, e.clientY - drag.dy); });
  const end = () => { if (drag) { drag = null; save(); } };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
  window.addEventListener('resize', () => move(panel.offsetLeft, panel.offsetTop));
  const setHidden = (h) => { panel.hidden = h; onShow(!h); save(); };
  return { saved, move, setHidden };
}
const statsWin = floatingWindow(stats, $('stats-head'), 'wh3-duel-map-ui', { onShow: (v) => { $('stats-show').hidden = v; } });
if (statsWin.saved) { statsWin.move(statsWin.saved.x, statsWin.saved.y); stats.hidden = !!statsWin.saved.hidden; $('stats-show').hidden = !stats.hidden; }
$('stats-hide').addEventListener('click', () => statsWin.setHidden(true));
$('stats-show').addEventListener('click', () => statsWin.setHidden(false));
const inputsWin = floatingWindow(inputs, $('inputs-head'), 'wh3-duel-inputs-ui', { onShow: (v) => $('w-inputs').setAttribute('aria-pressed', String(v)) });
inputsWin.move(...(inputsWin.saved ? [inputsWin.saved.x, inputsWin.saved.y] : [window.innerWidth - 472, 64]));
if (inputsWin.saved && !inputsWin.saved.hidden) inputsWin.setHidden(false);
$('w-inputs').addEventListener('click', () => inputsWin.setHidden(!inputs.hidden));
$('inputs-hide').addEventListener('click', () => inputsWin.setHidden(true));

// ---- First drawing. When a card changes height (a "Formula" opened, a simulation shown,
// the fonts loaded), its band is stretched again so nothing overlaps.
for (const id of ALL_CARDS) $(id).style.width = CARD_W + 'px';
$('card-unit').style.width = UNIT_W + 'px';
showStage();
render();
const ro = new ResizeObserver(scheduleLayout);
for (const id of ALL_CARDS) ro.observe($(id));
let started = false;
const startView = () => { if (!started && laid && canvas.showRect(jumpRect('start'), { animate: false })) started = true; };
startView();
new ResizeObserver(startView).observe($('canvas'));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
