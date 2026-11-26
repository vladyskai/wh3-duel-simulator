// Run from the project folder: node check/test_model.mjs
// Part 1: with no armour the model must reproduce the version-2 numbers (check/duel_check.py).
// Part 2: with armour, the exact model must agree with brute-force simulation.
import { duel, fightOnce, seededRandom, hitDamage, hitsNeededDist, rollDamage, hitChance, GAME_LIMITS } from '../js/model.js';

let failed = 0;
function near(label, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: got ${got.toFixed(4)}, want ${want.toFixed(4)} (tol ${+tol.toFixed(4)})`);
}

function simulate(A, B, M, seed, opts = {}) {
  const rand = seededRandom(seed);
  let wA = 0, wB = 0, ti = 0, sumT = 0, ended = 0;
  for (let i = 0; i < M; i++) {
    const f = fightOnce(A, B, rand, opts);
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

// ---- Part 2a: the distribution of hits needed, against simulated hits
for (const [hp, base, ap, armour] of [[120, 25, 5, 60], [100, 30, 0, 150], [200, 20, 10, 250], [77, 13, 2, 35]]) {
  const d = hitDamage(base, ap, armour), g = hitsNeededDist(hp, d);
  let mean = 0; for (let k = 1; k < g.length; k++) mean += k * g[k];
  const rand = seededRandom(hp * 7 + armour), M = 200000;
  let sum = 0, meanD = 0;
  for (let i = 0; i < M; i++) { let s = 0, k = 0; while (s < hp - 1e-9) { const x = rollDamage(base, ap, armour, rand); s += x; meanD += x; k++; } sum += k; }
  near(`hits needed, hp ${hp} base ${base} ap ${ap} armour ${armour}: mean K`, mean, sum / M, 0.01 * mean);
}
near('mean damage, base 30 armour 60 ap 5', hitDamage(30, 5, 60).mean, 5 + 30 * (1 - 0.45), 1e-9);

// ---- Part 2b: whole duels with armour, exact against 100,000 simulated
const cases = [
  ['light armour', { attack: 45, defence: 25, base: 20, ap: 5, armour: 30, hp: 100, interval: 40 }, { attack: 30, defence: 30, base: 30, ap: 10, armour: 50, hp: 120, interval: 43 }],
  ['heavy armour v AP', { attack: 40, defence: 35, base: 10, ap: 25, armour: 100, hp: 150, interval: 45 }, { attack: 35, defence: 30, base: 40, ap: 0, armour: 20, hp: 110, interval: 38 }],
  ['armour above 100 (capped)', { attack: 30, defence: 40, base: 35, ap: 5, armour: 150, hp: 200, interval: 40 }, { attack: 40, defence: 30, base: 45, ap: 5, armour: 40, hp: 160, interval: 40 }],
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

// ---- Part 3: hit chance limits
near('limits: 35 + 90 - 0 = 125% capped to 90%', hitChance(90, 0, GAME_LIMITS), 0.90, 1e-12);
near('limits: 35 + 0 - 90 = -55% raised to 8%', hitChance(0, 90, GAME_LIMITS), 0.08, 1e-12);
near('limits: 50% stays 50%', hitChance(45, 30, GAME_LIMITS), 0.50, 1e-12);
near('no limits: 125% capped to 100%', hitChance(90, 0, null), 1, 1e-12);
near('no limits: -55% raised to 0%', hitChance(0, 90, null), 0, 1e-12);
near('custom limits 20 to 60: 125% to 60%', hitChance(90, 0, { lo: 20, hi: 60 }), 0.60, 1e-12);
{ // limits 0 to 100 must change nothing
  const e1 = duel(A0, B0), e2 = duel(A0, B0, { limits: { lo: 0, hi: 100 } });
  near('limits 0 to 100 equal no limits', e2.winA, e1.winA, 1e-12);
}
const limCases = [
  ['hopeless attacker gets 8%', { attack: 0, defence: 80, base: 30, ap: 10, armour: 20, hp: 100, interval: 40 }, { attack: 60, defence: 50, base: 20, ap: 5, armour: 40, hp: 150, interval: 42 }, { limits: GAME_LIMITS }],
  ['custom limits 30 to 40', { attack: 45, defence: 25, base: 20, ap: 5, armour: 30, hp: 100, interval: 40 }, { attack: 30, defence: 30, base: 30, ap: 10, armour: 50, hp: 120, interval: 43 }, { limits: { lo: 30, hi: 40 } }],
];
limCases.forEach(([name, A, B, opts], idx) => {
  const e = duel(A, B, opts), s = simulate(A, B, 100000, 2000 + idx, opts);
  near(`${name}: A wins`, e.winA, s.winA, 0.006);
  near(`${name}: B wins`, e.winB, s.winB, 0.006);
  near(`${name}: mean length (tenths)`, e.meanDuration, s.meanT, 0.015 * s.meanT);
});
{ // without limits the hopeless attacker has 0% to hit and can never win, with them it sometimes can
  const off = duel(limCases[0][1], limCases[0][2]).winA, on = duel(limCases[0][1], limCases[0][2], limCases[0][3]).winA;
  near('hopeless attacker without limits never wins', off, 0, 1e-12);
  const ok = on > 0.001; if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} hopeless attacker with limits wins sometimes: ${(100 * on).toFixed(2)}%`);
}

// ---- Part 4: the minimum of 1 damage per hit
{
  const d = hitDamage(30, 0, 220, true); // armour 220 blocks everything: every hit raised to 1
  near('min damage: armour 220, no AP, every hit does 1', d.mean, 1, 1e-12);
  near('min damage: share raised to 1', d.floored, 1, 1e-12);
  const d2 = hitDamage(2, 0, 150, true); // base part from 0 to 0.5, plus 2/3 fully blocked: all raised to 1
  near('min damage: weak hit into heavy armour always 1', d2.mean, 1, 1e-12);
  const d3 = hitDamage(4, 0.5, 100, true); // 0.5 + uniform(0, 2): a quarter of the roll is below 1
  near('min damage: share raised (exact 1/4)', d3.floored, 0.25, 1e-12);
  near('min damage: mean (exact 0.25 x 1 + 0.75 x 1.75)', d3.mean, 0.25 * 1 + 0.75 * 1.75, 1e-12);
  near('min damage off: same hit mean', hitDamage(4, 0.5, 100, false).mean, 1.5, 1e-12);
  near('min damage changes nothing when every hit is above 1', duel(A0, B0, { minDamage: true }).winA, duel(A0, B0).winA, 1e-12);
  // hits needed against simulation, minimum on
  for (const [hp, base, ap, armour] of [[40, 4, 0.5, 100], [30, 3, 0, 150], [25, 30, 0, 220]]) {
    const dd = hitDamage(base, ap, armour, true), g = hitsNeededDist(hp, dd);
    let mean = 0; for (let k = 1; k < g.length; k++) mean += k * g[k];
    const rand = seededRandom(hp * 13 + armour), M = 100000;
    let sum = 0;
    for (let i = 0; i < M; i++) { let s = 0, k = 0; while (s < hp - 1e-9) { s += rollDamage(base, ap, armour, rand, true); k++; } sum += k; }
    near(`min damage: hits needed, hp ${hp} base ${base} ap ${ap} armour ${armour}`, mean, sum / M, 0.01 * mean);
  }
}
const minCases = [
  ['min damage turns a hopeless fight', { attack: 40, defence: 30, base: 30, ap: 0, armour: 100, hp: 8, interval: 40 }, { attack: 30, defence: 30, base: 3, ap: 0, armour: 220, hp: 10, interval: 40 }, { minDamage: true }],
  ['min damage with limits', { attack: 0, defence: 40, base: 5, ap: 0, armour: 20, hp: 60, interval: 38 }, { attack: 0, defence: 60, base: 12, ap: 0, armour: 160, hp: 6, interval: 42 }, { minDamage: true, limits: GAME_LIMITS }],
];
near('without the minimum, A cannot hurt B at all', duel(minCases[0][1], minCases[0][2]).winA, 0, 1e-12);
minCases.forEach(([name, A, B, opts], idx) => {
  const e = duel(A, B, opts), s = simulate(A, B, 100000, 3000 + idx, opts);
  near(`${name}: A wins`, e.winA, s.winA, 0.006);
  near(`${name}: B wins`, e.winB, s.winB, 0.006);
  near(`${name}: total probability`, e.winA + e.winB + e.tie + e.neither, 1, 1e-6);
  near(`${name}: mean length (tenths)`, e.meanDuration, s.meanT, 0.015 * s.meanT);
});

console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
process.exit(failed ? 1 : 0);
