// Run from the project folder: node check/test_model.mjs
// Expected numbers come from check/duel_check.py (exact formula and 200,000 simulated duels).
import { duel, fightOnce, seededRandom } from '../js/model.js';

let failed = 0;
function near(label, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: got ${got.toFixed(4)}, want ${want.toFixed(4)} (tol ${tol})`);
}

const A = { attack: 45, defence: 25, damage: 25, hp: 100, interval: 40 };
const B = { attack: 30, defence: 30, damage: 40, hp: 120, interval: 40 };

// Equal intervals must give the old round-based numbers exactly.
let r = duel(A, B);
near('equal 4.0/4.0 A wins', r.winA, 0.234119, 1e-5);
near('equal 4.0/4.0 tie', r.tie, 0.074226, 1e-5);
near('equal 4.0/4.0 B wins', r.winB, 0.691655, 1e-5);

const cases = [[40, 43, 0.3088, 0.0, 0.6912], [32, 51, 0.5447, 0.0, 0.4553], [38, 40, 0.3083, 0.0, 0.6916], [20, 40, 0.6552, 0.0610, 0.2839]];
for (const [ia, ib, wa, t, wb] of cases) {
  r = duel({ ...A, interval: ia }, { ...B, interval: ib });
  near(`${ia / 10}s/${ib / 10}s A wins`, r.winA, wa, 1e-4);
  near(`${ia / 10}s/${ib / 10}s tie`, r.tie, t, 1e-4);
  near(`${ia / 10}s/${ib / 10}s B wins`, r.winB, wb, 1e-4);

  // The simulation must agree with the exact answer, duration included.
  const rand = seededRandom(ia * 1000 + ib), M = 100000;
  let wA = 0, ti = 0, sumT = 0;
  for (let i = 0; i < M; i++) { const f = fightOnce({ ...A, interval: ia }, { ...B, interval: ib }, rand); if (f.winner === 'A') wA++; if (f.winner === 'tie') ti++; sumT += f.duration; }
  near(`${ia / 10}s/${ib / 10}s simulated A wins`, wA / M, r.winA, 0.006);
  near(`${ia / 10}s/${ib / 10}s simulated tie`, ti / M, r.tie, 0.004);
  near(`${ia / 10}s/${ib / 10}s simulated mean duration (tenths)`, sumT / M, r.meanDuration, r.meanDuration * 0.01);
}

console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
process.exit(failed ? 1 : 0);
