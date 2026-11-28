// Candidate rule for the unit stage, tested against the measured 20 v 20 fights.
// Each side has n soldiers with their own health. At any moment F soldiers of a side are
// fighting: F = min(width cap, c * own^a * other^b). They are the unit's front soldiers, and
// they are also the ones who can be hit. Each fighter swings every 4.3 s at a random enemy
// front soldier. A dead soldier is replaced from the rest of the unit.
import { rollDamage, seededRandom } from 'file:///C:/Users/vlady/Desktop/wh3-duel-simulator/js/model.js';
const U = { p: 0.35, base: 21, ap: 7, armour: 30, hp: 69, iv: 43 };
function fight(law, n, rand, stopAt = 2) {
  const A = Array.from({ length: n }, () => U.hp), B = Array.from({ length: n }, () => U.hp); // front = the first F of each list
  let t = 0;
  const step = 5; // half-second steps: each fighter swings with chance step/iv per step
  while (A.length > stopAt && B.length > stopAt) {
    t += step;
    const fa = Math.max(1, Math.min(A.length, Math.round(law(A.length, B.length)))), fb = Math.max(1, Math.min(B.length, Math.round(law(B.length, A.length))));
    let dmgToB = [], dmgToA = [];
    for (let i = 0; i < fa; i++) if (rand() < step / U.iv && rand() < U.p) dmgToB.push(rollDamage(U.base, U.ap, U.armour, rand));
    for (let i = 0; i < fb; i++) if (rand() < step / U.iv && rand() < U.p) dmgToA.push(rollDamage(U.base, U.ap, U.armour, rand));
    for (const d of dmgToB) { const k = Math.floor(rand() * Math.min(fb, B.length)); B[k] -= d; if (B[k] <= 0) B.splice(k, 1); if (!B.length) break; }
    for (const d of dmgToA) { const k = Math.floor(rand() * Math.min(fa, A.length)); A[k] -= d; if (A[k] <= 0) A.splice(k, 1); if (!A.length) break; }
  }
  return { a: A.length, b: B.length, t: t / 10 };
}
const q = (arr, p) => arr[Math.floor(p * (arr.length - 1))];
const laws = {
  'pairs only: F = min(20, own, other)': (o, e) => Math.min(20, o, e),
  'fitted: F = min(19.5, 0.54 own^0.63 other^0.28)': (o, e) => Math.min(19.5, 0.54 * o ** 0.63 * e ** 0.28),
};
console.log('measured, 36 fights 20 v 20: about 267 s to 2 left; winner left: 25% 13, median 19, 75% 27');
for (const [name, law] of Object.entries(laws)) {
  const rand = seededRandom(9), N = 3000, surv = [], times = [];
  for (let i = 0; i < N; i++) { const r = fight(law, 120, rand); surv.push(Math.max(r.a, r.b)); times.push(r.t); }
  surv.sort((x, y) => x - y); times.sort((x, y) => x - y);
  console.log(name.padEnd(50), '| seconds: median', q(times, .5).toFixed(0), '| winner left: 25%', q(surv, .25), 'median', q(surv, .5), '75%', q(surv, .75));
}
