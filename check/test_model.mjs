// Run from the project folder: node check/test_model.mjs
// Part 1: with no armour the model must reproduce the version-2 numbers (check/duel_check.py).
// Part 2: with armour, the exact model must agree with brute-force simulation.
import { duel, fightOnce, seededRandom, hitDamage, hitsNeededDist, rollDamage } from '../js/model.js';

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

console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
process.exit(failed ? 1 : 0);
