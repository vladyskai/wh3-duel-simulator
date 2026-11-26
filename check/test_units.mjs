// Run from the project folder: node check/test_units.mjs
// Part 1 proves the soldier-by-soldier simulation: one soldier each, no stagger, must equal the exact duel.
// Part 2 checks the Markov chain and Lanchester on their own terms.
// Part 3 MEASURES how far the two fast tools are from the simulation (they are approximations).
import { duel, seededRandom, GAME_LIMITS } from '../js/model.js';
import { simulateMany, markov, lanchester, killRates } from '../js/unit_model.js';

let failed = 0;
function near(label, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: got ${got.toFixed(4)}, want ${want.toFixed(4)} (tol ${+tol.toFixed(4)})`);
}
const soldier = (o) => ({ attack: 40, defence: 30, base: 25, ap: 5, armour: 30, hp: 100, interval: 40, men: 1, splash: 1, ...o });

// ---- Part 1: the unit simulation reduces to the duel
const duels = [
  [soldier({}), soldier({ attack: 30, defence: 35, base: 35, ap: 0, armour: 50, hp: 120, interval: 43 }), {}],
  [soldier({ interval: 20 }), soldier({ attack: 35, base: 40, ap: 0, armour: 0, interval: 40 }), {}],
  [soldier({ attack: 0, base: 30, ap: 0 }), soldier({ defence: 60, base: 3, ap: 0, armour: 220, hp: 10 }), { minDamage: true, limits: GAME_LIMITS }],
];
duels.forEach(([A, B, o], i) => {
  const e = duel(A, B, o);
  for (const targeting of ['stick', 'spread']) {
    const s = simulateMany(A, B, { ...o, targeting, stagger: false }, 60000, seededRandom(10 + i));
    near(`duel ${i + 1} (${targeting}) A wins`, s.winA, e.winA, 0.008);
    near(`duel ${i + 1} (${targeting}) both die`, s.tie, e.tie, 0.005);
    near(`duel ${i + 1} (${targeting}) mean length (s)`, s.meanDuration, e.meanDuration / 10, 0.02 * e.meanDuration / 10);
  }
});

// ---- Part 2: the fast tools on their own terms
{
  const U = soldier({ men: 40 });
  const m = markov(U, U);
  near('Markov: identical units, A wins', m.winA, 0.5, 1e-9);
  near('Markov: probabilities add to 1', m.winA + m.winB + m.stuck, 1, 1e-9);
  const l = lanchester(U, U);
  near('Lanchester: identical units end level', l.survA - l.survB, 0, 1e-6);
}
{ // square law: lA A^2 - lB B^2 stays constant, so A ends at sqrt(A0^2 - (lB/lA)(B0^2 - 0.5^2))
  const A = soldier({ men: 100 }), B = soldier({ men: 80, attack: 45 });
  const l = lanchester(A, B), rA = l.rA[1], rB = l.rB[1];
  const want = Math.sqrt(A.men ** 2 - (rB / rA) * (B.men ** 2 - 0.25));
  near('Lanchester: square-law survivors', l.survA, want, 0.05);
  const m = markov(A, B), m1 = markov(A, B, {}, null, false);
  near('Markov: probabilities add to 1 (unequal)', m.winA + m.winB + m.stuck, 1, 1e-9);
  near('Markov plain: probabilities add to 1', m1.winA + m1.winB + m1.stuck, 1, 1e-9);
  const U = soldier({ men: 30 });
  near('Markov with stages: identical units, A wins', markov(U, U).winA, 0.5, 1e-9);
}

// ---- Part 2b: frontage
{
  const A = soldier({ men: 100 }), B = soldier({ men: 80, attack: 45 });
  const deep = (U, r) => ({ ...U, ranks: r });
  // ranks 1 and no ranks field are the same thing; a front wider than the unit changes nothing
  near('frontage: ranks 1 = everyone fights (chain)', markov(deep(A, 1), deep(B, 1)).winA, markov(A, B).winA, 1e-12);
  const s0 = simulateMany(A, B, { targeting: 'stick' }, 300, seededRandom(7));
  const s1 = simulateMany(deep(A, 1), deep(B, 1), { targeting: 'stick' }, 300, seededRandom(7));
  near('frontage: ranks 1 = everyone fights (simulation, same seed, identical)', s1.winA, s0.winA, 0);
  near('frontage: ranks 1 = everyone fights (simulation, same length)', s1.meanDuration, s0.meanDuration, 0);
  // linear law: with both fronts full, lA FA A - lB FB B stays constant
  const An = deep(A, 20), Bn = deep(B, 16); // fronts of 5 and 5
  const l = lanchester(An, Bn), rA = l.rA[1], rB = l.rB[1];
  near('frontage: fronts are 5 and 5', l.FA + l.FB, 10, 0);
  if (l.winner === 'A') near('linear law: A survivors (fronts full until the end, so within 3)', l.survA, A.men - (rB * 5 / (rA * 5)) * B.men, 3);
  else { failed++; console.log('FAIL linear law: expected A to win, A has more men and the same front'); }
  const m = markov(An, Bn);
  near('frontage: chain probabilities add to 1', m.winA + m.winB + m.stuck, 1, 1e-9);
  // square law says B wins (better soldiers, 80 v 100 is enough), linear law says A (numbers count only linearly)
  const sq = l.square.A > l.square.B ? 'A' : 'B', lin = l.linear.A > l.linear.B ? 'A' : 'B';
  console.log(`info square-law favourite ${sq}, linear-law favourite ${lin}, Lanchester with fronts of 5: ${l.winner}`);
}

// ---- Part 3: how good are the fast tools? (measured, printed, not asserted)
const fights = [
  ['equal 60 v 60', soldier({ men: 60 }), soldier({ men: 60 })],
  ['100 v 80, B better', soldier({ men: 100 }), soldier({ men: 80, attack: 45, defence: 35 })],
  ['120 v 90 armour v AP', soldier({ men: 120, base: 30, ap: 2, armour: 60 }), soldier({ men: 90, base: 10, ap: 22, armour: 20, hp: 90 })],
  ['monster 1 v 30 (splash 5)', soldier({ men: 1, hp: 3000, base: 200, ap: 150, armour: 60, splash: 5, interval: 40 }), soldier({ men: 30, hp: 90, base: 20, ap: 8 })],
];
fights.push(['100 v 90, B better', soldier({ men: 100 }), soldier({ men: 90, attack: 45, defence: 35 })]);
fights.push(['monster 1 v 20 (splash 5)', soldier({ men: 1, hp: 3000, base: 200, ap: 150, armour: 60, splash: 5 }), soldier({ men: 20, hp: 90, base: 20, ap: 8 })]);
fights.push(['100 v 80 B better, fronts 20', soldier({ men: 100, ranks: 5 }), soldier({ men: 80, attack: 45, defence: 35, ranks: 4 })]);
fights.push(['120 v 90, 6 ranks each', soldier({ men: 120, ranks: 6 }), soldier({ men: 90, attack: 45, defence: 35, ranks: 6 })]);
fights.push(['160 v 120, fronts 20', soldier({ men: 160, ranks: 8 }), soldier({ men: 120, attack: 50, defence: 40, ranks: 6 })]);
fights.push(['monster 1 v 30, B 6 ranks', soldier({ men: 1, hp: 3000, base: 200, ap: 150, armour: 60, splash: 5 }), soldier({ men: 30, hp: 90, base: 20, ap: 8, ranks: 6 })]);
console.log('\nfight                       | P(A wins): sim stick  spread | chain stages  plain | Lanch | length s: sim stick spread | chain  Lanch');
for (const [name, A, B] of fights) {
  const rates = { A: killRates(A, B), B: killRates(B, A) };
  let t0 = Date.now();
  const mk = markov(A, B, {}, rates), mk1 = markov(A, B, {}, rates, false), ln = lanchester(A, B, {}, rates);
  const fastMs = Date.now() - t0;
  t0 = Date.now();
  const st = simulateMany(A, B, { targeting: 'stick' }, 1000, seededRandom(99));
  const sp = simulateMany(A, B, { targeting: 'spread' }, 1000, seededRandom(98));
  const simMs = Date.now() - t0;
  const winL = ln.winner === 'A' ? 100 : ln.winner === 'B' ? 0 : 50;
  const P = (x) => (100 * x).toFixed(1).padStart(6) + '%';
  console.log(`${name.padEnd(27)} | ${P(st.winA)}${P(sp.winA)} | ${P(mk.winA)}${P(mk1.winA)} | ${String(winL).padStart(4)}% | ${st.meanDuration.toFixed(1).padStart(8)}${sp.meanDuration.toFixed(1).padStart(7)} | ${mk.meanDuration.toFixed(1).padStart(6)}${ln.duration.toFixed(1).padStart(7)}   (stages ${mk.cA}/${mk.cB}; fast tools ${fastMs} ms, 2000 simulated fights ${simMs} ms)`);
}

console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
process.exit(failed ? 1 : 0);
