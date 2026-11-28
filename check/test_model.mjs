// Run from the project folder: node check/test_model.mjs
// Part 1: with no armour the model must reproduce the version-2 numbers (check/duel_check.py).
// Part 2: with armour, the exact model must agree with brute-force simulation.
// Part 3: the stat value gains (which slider is worth the most).
// Part 4: the stages, from one attacker to the full model.
import { duel, fightOnce, seededRandom, hitDamage, hitsNeededDist, rollDamage, statGains, stageDuel, swingsPmf } from '../js/model.js';

let failed = 0;
function near(label, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: got ${got.toFixed(4)}, want ${want.toFixed(4)} (tol ${+tol.toFixed(4)})`);
}

function simulate(A, B, M, seed) {
  const rand = seededRandom(seed);
  let wA = 0, wB = 0, ti = 0, sumT = 0, ended = 0;
  for (let i = 0; i < M; i++) {
    const f = fightOnce(A, B, rand);
    if (f.winner === 'A') wA++; else if (f.winner === 'B') wB++; else if (f.winner === 'tie') ti++;
    if (isFinite(f.duration)) { sumT += f.duration; ended++; }
  }
  return { winA: wA / M, winB: wB / M, tie: ti / M, meanT: sumT / Math.max(1, ended) };
}

// ---- Part 1: version 2 reproduced (armour 0, ap 0)
const A0 = { attack: 45, defence: 25, base: 25, ap: 0, armour: 0, hp: 100, interval: 40 };
const B0 = { attack: 30, defence: 30, base: 40, ap: 0, armour: 0, hp: 120, interval: 40 };
let r = duel(A0, B0);
near('v2 equal 4.0/4.0 A wins', r.winA, 0.234119, 1e-5);
near('v2 equal 4.0/4.0 tie', r.tie, 0.074226, 1e-5);
near('v2 equal 4.0/4.0 B wins', r.winB, 0.691655, 1e-5);
for (const [ia, ib, wa, t, wb] of [[40, 43, 0.3088, 0.0, 0.6912], [32, 51, 0.5447, 0.0, 0.4553], [20, 40, 0.6552, 0.0610, 0.2839]]) {
  r = duel({ ...A0, interval: ia }, { ...B0, interval: ib });
  near(`v2 ${ia / 10}s/${ib / 10}s A wins`, r.winA, wa, 1e-4);
  near(`v2 ${ia / 10}s/${ib / 10}s tie`, r.tie, t, 1e-4);
  near(`v2 ${ia / 10}s/${ib / 10}s B wins`, r.winB, wb, 1e-4);
}

// ---- Part 2a: damage of one hit, worked by hand (docs/game_rules.md)
// Base 9, AP 1, armour 100: the base part is uniform on [0, 4.5], rounded per part.
let d = hitDamage(9, 1, 100);
near('9 base 1 AP v 100 armour: P(1 damage) = 1/9', d.pmf[1], 1 / 9, 1e-12);
for (const v of [2, 3, 4, 5]) near(`9 base 1 AP v 100 armour: P(${v} damage) = 2/9`, d.pmf[v], 2 / 9, 1e-12);
near('9 base 1 AP v 100 armour: P(6 damage) = 0', d.pmf[6] || 0, 0, 1e-12);
near('9 base 1 AP v 200 armour: always 1 damage', hitDamage(9, 1, 200).pmf[1], 1, 1e-12);
near('30 base 0 AP v 200 armour: always 0 damage (no minimum)', hitDamage(30, 0, 200).pmf[0], 1, 1e-12);
near('no armour: 25 base 5 AP always does 30', hitDamage(25, 5, 0).pmf[30], 1, 1e-12);

// ---- Part 2b: damage of one hit and hits needed, against simulated hits
for (const [hp, base, ap, armour] of [[120, 25, 5, 60], [100, 30, 0, 150], [200, 20, 10, 250], [77, 13, 2, 35], [100, 9, 1, 100]]) {
  const dm = hitDamage(base, ap, armour), g = hitsNeededDist(hp, dm);
  const rand = seededRandom(hp * 7 + armour), M = 200000;
  const kCount = new Float64Array(g.length), dCount = new Float64Array(dm.pmf.length + 1);
  for (let i = 0; i < M; i++) {
    let s = 0, k = 0;
    while (s < hp) { const x = rollDamage(base, ap, armour, rand); s += x; k++; if (k === 1) dCount[x]++; }
    kCount[Math.min(k, g.length - 1)]++;
  }
  let worstD = 0, worstK = 0;
  for (let v = 0; v < dm.pmf.length; v++) worstD = Math.max(worstD, Math.abs(dm.pmf[v] - dCount[v] / M));
  for (let k = 1; k < g.length; k++) worstK = Math.max(worstK, Math.abs(g[k] - kCount[k] / M));
  const tag = `hp ${hp} base ${base} ap ${ap} armour ${armour}`;
  near(`${tag}: worst gap, damage pmf v simulated`, worstD, 0, 0.004);
  near(`${tag}: worst gap, hits-needed pmf v simulated`, worstK, 0, 0.004);
}

// ---- Part 2c: whole duels with armour, exact against 100,000 simulated
const cases = [
  ['light armour', { attack: 45, defence: 25, base: 20, ap: 5, armour: 30, hp: 100, interval: 40 }, { attack: 30, defence: 30, base: 30, ap: 10, armour: 50, hp: 120, interval: 43 }],
  ['heavy armour v AP', { attack: 40, defence: 35, base: 10, ap: 25, armour: 100, hp: 150, interval: 45 }, { attack: 35, defence: 30, base: 40, ap: 0, armour: 20, hp: 110, interval: 38 }],
  ['armour above 100 (capped)', { attack: 30, defence: 40, base: 35, ap: 5, armour: 150, hp: 200, interval: 40 }, { attack: 40, defence: 30, base: 45, ap: 5, armour: 40, hp: 160, interval: 40 }],
  ['close fight, same interval (ties possible)', { attack: 40, defence: 30, base: 25, ap: 8, armour: 40, hp: 100, interval: 40 }, { attack: 38, defence: 32, base: 30, ap: 4, armour: 30, hp: 105, interval: 40 }],
  ['one side cannot hurt', { attack: 30, defence: 30, base: 50, ap: 0, armour: 30, hp: 100, interval: 40 }, { attack: 30, defence: 30, base: 40, ap: 0, armour: 220, hp: 100, interval: 40 }],
];
cases.forEach(([name, A, B], idx) => {
  const e = duel(A, B), s = simulate(A, B, 100000, 1000 + idx);
  near(`${name}: A wins`, e.winA, s.winA, 0.006);
  near(`${name}: B wins`, e.winB, s.winB, 0.006);
  near(`${name}: both die`, e.tie, s.tie, 0.004);
  near(`${name}: total probability`, e.winA + e.winB + e.tie + e.neither, 1, 1e-6);
  near(`${name}: mean length (tenths)`, e.meanDuration, s.meanT, 0.015 * s.meanT);
});

// ---- Part 3: stat value gains
// Each gain must be exactly the change in that unit's win chance after one step.
{
  const A = cases[0][1], B = cases[0][2], r0 = duel(A, B), g = statGains(A, B, r0);
  near('gain of +1 attack for A = direct difference', g.A.attack, duel({ ...A, attack: A.attack + 1 }, B).winA - r0.winA, 1e-12);
  near('gain of 0.1 s faster for B = direct difference', g.B.interval, duel(A, { ...B, interval: B.interval - 1 }).winB - r0.winB, 1e-12);
  near('gain of +1 armour for B = direct difference', g.B.armour, duel(A, { ...B, armour: B.armour + 1 }).winB - r0.winB, 1e-12);
  const lim = { attack: { min: 0, max: A.attack } };
  near('a step past the slider end is not possible (null)', g.A.attack !== null && statGains(A, B, r0, lim).A.attack === null ? 0 : 1, 0, 0);
}
// Thresholds, no armour: B has 120 HP. 26 to 27 damage keeps 5 hits needed (gain exactly 0),
// 29 to 30 drops it from 5 hits to 4 (a jump).
{
  const B = { ...B0 };
  near('no armour, 26 -> 27 damage v 120 HP: still 5 hits, gain 0', statGains({ ...A0, base: 26 }, B).A.base, 0, 1e-12);
  const jump = statGains({ ...A0, base: 29 }, B).A.base;
  near('no armour, 29 -> 30 damage v 120 HP: 5 hits -> 4, gain above 5 points', jump > 0.05 ? 1 : 0, 1, 0);
}

// ---- Part 4: the stages
{
  const A = { attack: 45, defence: 25, base: 20, ap: 5, armour: 30, hp: 100, interval: 40 };
  const B = { attack: 30, defence: 30, base: 30, ap: 10, armour: 50, hp: 120, interval: 43 };
  near('stage 5 = the full model', stageDuel(5)(A, B).winA, duel(A, B).winA, 1e-15);
  near('stage 4 = armour, no AP', stageDuel(4)(A, B).winA, duel({ ...A, ap: 0 }, { ...B, ap: 0 }).winA, 1e-15);
  near('stage 3 = no armour and no AP (the version-2 model)', stageDuel(3)(A, B).winA, duel({ ...A, armour: 0, ap: 0 }, { ...B, armour: 0, ap: 0 }).winA, 1e-15);
  // Stage 1: B never strikes back, so N_A is a plain negative binomial NB(K, p) with K = ceil(HP / D).
  const r1 = stageDuel(1)(A, B), K = Math.ceil(B.hp / A.base), p = (35 + A.attack - B.defence) / 100, nb = swingsPmf(K, p);
  let worst = 0;
  for (let n = 1; n < 200; n++) worst = Math.max(worst, Math.abs(r1.fA[n] - nb[n]));
  near('stage 1: swings needed = NB(ceil(HP/D), p)', worst, 0, 1e-12);
  near('stage 1: A always wins in the end', r1.winA, 1, 1e-9);
  near('stage 1: mean swings = K / p', r1.swingsA.mean, K / p, 1e-9);
  near("stage 1: B's stats that are off change nothing", stageDuel(1)(A, { ...B, attack: 99, base: 99, armour: 200 }).winA, r1.winA, 1e-15);
  // Stage 2: the fight length is A's time to kill, a (E[N] - 1).
  near('stage 2: mean time = interval x (E[N] - 1)', stageDuel(2)(A, B).meanDuration, A.interval * (K / p - 1), 1e-6);
  // Stage 3 and up: who wins depends on the two intervals only through their ratio.
  near('stage 3: who wins depends only on a / b', stageDuel(3)(A, B).winA, stageDuel(3)({ ...A, interval: 80 }, { ...B, interval: 86 }).winA, 1e-12);
}

// ---- Part 5: the maps always finish (a page that never stops drawing freezes the browser)
{
  // The map code reads colours from the page; give it a stand-in outside the browser.
  globalThis.document ??= { documentElement: {} };
  globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '#888' });
  const { buildLanes, layoutMap } = await import('../js/maps.js');
  const { stageUnits } = await import('../js/model.js');
  const draw = (A, B, stage) => { const t = Date.now(), r = stageDuel(stage)(A, B), [a, b] = stageUnits(A, B, stage); layoutMap(buildLanes({ A: a, B: b, r }, stage), {}); return Date.now() - t; };
  // The case that froze the page (2026-11-27): 195 armour blocks almost every hit, so the
  // enemy practically never falls within the 1,000 hits the model follows.
  const ms = draw({ attack: 32, defence: 32, base: 21, ap: 7, armour: 30, hp: 69, interval: 43 }, { attack: 5, defence: 6, base: 16, ap: 2, armour: 195, hp: 77, interval: 43 }, 4);
  near('map of a fight that needs over 1,000 hits: drawn in under 2 s', ms < 2000 ? 0 : 1, 0, 0);
  // Random and extreme stats, every stage.
  const rand = seededRandom(11);
  const pick = (lo, hi, edge) => { const u = rand(); if (u < 0.15) return lo; if (u < 0.3) return hi; if (edge && u < 0.45) return edge[Math.floor(rand() * edge.length)]; return lo + Math.floor(rand() * (hi - lo + 1)); };
  const unit = () => ({ attack: pick(0, 100), defence: pick(0, 100), base: pick(0, 200, [1, 2, 3]), ap: pick(0, 200, [0, 1]), armour: pick(0, 200, [100, 190, 195, 199]), hp: pick(1, 500), interval: pick(20, 60) });
  let worst = 0;
  for (let i = 0; i < 300; i++) worst = Math.max(worst, draw(unit(), unit(), 1 + (i % 5)));
  near('300 random duels, every stage: each map drawn in under 2 s', worst < 2000 ? 0 : 1, 0, 0);

  // Every stat at each end of its slider, one at a time and all together, every stage.
  // The ends are where the special cases live (no damage, no hit chance, full block).
  const ENDS = { attack: [0, 100], defence: [0, 100], base: [0, 200], ap: [0, 200], armour: [0, 200], hp: [1, 500], interval: [20, 60] };
  const mid = { attack: 30, defence: 30, base: 20, ap: 5, armour: 40, hp: 100, interval: 40 };
  let worstEnd = 0, cases = 0;
  for (let stage = 1; stage <= 5; stage++) {
    for (const key of Object.keys(ENDS)) for (const v of ENDS[key]) {
      worstEnd = Math.max(worstEnd, draw({ ...mid, [key]: v }, mid, stage), draw(mid, { ...mid, [key]: v }, stage)); cases += 2;
    }
    for (const pickEnd of [0, 1]) {
      const all = Object.fromEntries(Object.entries(ENDS).map(([k, e]) => [k, e[pickEnd]]));
      worstEnd = Math.max(worstEnd, draw(all, all, stage), draw(all, mid, stage), draw(mid, all, stage)); cases += 3;
    }
  }
  near(`${cases} slider-end duels, every stage: each map drawn in under 2 s`, worstEnd < 2000 ? 0 : 1, 0, 0);

  // The rest of one redraw: the win chance gains (14 duels) and the charts of the cards.
  const { barsSvg } = await import('../js/charts.js');
  let worstRest = 0, biggest = 0;
  for (let i = 0; i < 100; i++) {
    const A = unit(), B = unit(), stage = 1 + (i % 5), t = Date.now();
    const r = stageDuel(stage)(A, B);
    statGains(A, B, r, null, stageDuel(stage));
    for (const [pa, pb] of [[r.dA.pmf, r.dB.pmf], [r.gA, r.gB], [r.fA, r.fB]]) {
      const pts = (f) => Array.from(f.slice(0, 151), (y, x) => [x, y]);
      biggest = Math.max(biggest, barsSvg({ series: [{ col: '#888', pts: pts(pa) }, { col: '#999', pts: pts(pb) }], xMin: 0.5, xMax: 150.5, xLabel: 'x', means: [[NaN, '#888'], [Infinity, '#999']] }).length);
    }
    // Charts must also survive nonsense: no data, an empty range, endless numbers.
    barsSvg({ series: [{ col: '#888', pts: [] }], xMin: 0, xMax: 0, xLabel: 'x' });
    barsSvg({ series: [{ col: '#888', pts: [[1, NaN], [2, Infinity]] }], xMin: 0, xMax: Infinity, xLabel: 'x' });
    worstRest = Math.max(worstRest, Date.now() - t);
  }
  near('100 random duels: gains and charts in under 2 s each', worstRest < 2000 ? 0 : 1, 0, 0);
  near('a chart never grows past 200 KB', biggest < 200000 ? 0 : 1, 0, 0);

  // No drawing may be huge: a map of several megabytes is what froze the page the first time.
  let bigMap = 0;
  for (let i = 0; i < 100; i++) {
    const A = unit(), B = unit(), stage = 1 + (i % 5), r = stageDuel(stage)(A, B), [a, b] = stageUnits(A, B, stage);
    bigMap = Math.max(bigMap, layoutMap(buildLanes({ A: a, B: b, r }, stage), {}).svg.length);
  }
  near('a map never grows past 1 MB', bigMap < 1e6 ? 0 : 1, 0, 0);
}

console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
process.exit(failed ? 1 : 0);
