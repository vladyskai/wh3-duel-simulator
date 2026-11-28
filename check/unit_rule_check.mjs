// The unit rule of js/unit.js against the 60 clean fights measured in the game on 2026-11-28
// (docs/unit_battle_research.md). Fights are stopped at 2 soldiers, like the game tests.
//
//   node check/unit_rule_check.mjs            the table
//   node check/unit_rule_check.mjs --test     also fail (exit 1) when the rule drifts too far
import { unitBattle, unitFight, UNIT_RULE } from '../js/unit.js';
import { seededRandom } from '../js/model.js';

const SW = { attack: 32, defence: 32, base: 21, ap: 7, armour: 30, hp: 69, interval: 43, men: 120, files: 20 };
const U = {
  sw: SW, s60: { ...SW, men: 60 }, s160: { ...SW, men: 160 },
  elite: { ...SW, attack: 47, defence: 47 }, tough: { ...SW, hp: 138 },
};
// measured: [ours, enemy, files ours, files enemy, share won by ours, seconds, winner's soldiers (mean), winner's health % (mean), health per survivor, wounds on the living (mean of both sides)]
const M = [
  ['sw', 'sw', 20, 20, 0.5, 283, 17, 8.8, 40, 778],
  ['s60', 's60', 20, 20, 0.5, 142, 21, 20.4, 40, 740],
  ['s160', 's160', 20, 20, 0.5, 377, 16, 6.5, 38, 823],
  ['s60', 's60', 10, 10, 0.5, 213, 15, 14.2, 39, 410],
  ['s160', 's160', 40, 40, 0.5, 217, 25, 7.4, 32, 1370],
  ['tough', 'tough', 20, 20, 0.5, 471, 25, 10.1, 66, 2189],
  ['sw', 's60', 20, 20, 1, 121, 88, 63.5, 60, 708],
  ['s160', 's60', 20, 20, 1, 118, 129, 72.6, 62, 686],
  ['s160', 'sw', 20, 20, 1, 245, 72, 35.9, 55, 797],
  ['elite', 'sw', 20, 20, 1, 170, 86, 59.5, 57, 718],
  ['tough', 'sw', 20, 20, 1, 250, 84, 53.4, 106, null],
];

function wounds(A, B, seed) {      // health missing from the living, while both have half their soldiers (after 20 s)
  const rand = seededRandom(seed);
  let s = 0, n = 0;
  for (let i = 0; i < 60; i++) {
    unitFight(A, B, rand, (t, ma, ha, mb, hb) => {
      if (t > 20 && t % 5 === 0 && ma >= A.men / 2 && mb >= B.men / 2) { s += (ma * A.hp - ha) + (mb * B.hp - hb); n += 2; }
    }, 2);
  }
  return s / n;
}

const test = process.argv.includes('--test');
let bad = 0;
console.log('rule:', JSON.stringify(UNIT_RULE));
console.log('ours v enemy (files)      | won by ours   | seconds      | winner soldiers | winner health % | health/survivor | wounds on the living');
console.log('                          | game   rule   | game  rule   | game   rule     | game   rule     | game   rule     | game   rule');
for (const [a, b, fa, fb, win, sec, men, hp, per, w] of M) {
  const A = { ...U[a], files: fa }, B = { ...U[b], files: fb };
  const r = unitBattle(A, B, { runs: 600, seed: 7, budgetMs: 60000, stopAt: 2, curve: false });
  const mirror = a === b && fa === fb;
  const side = mirror ? null : r.sideA;
  // a mirror fight: the winner is whoever won, so pool both sides
  const wmen = mirror ? (r.sideA.men.mean * r.sideA.wins + r.sideB.men.mean * r.sideB.wins) / (r.sideA.wins + r.sideB.wins) : side.men.mean;
  const whp = mirror ? (r.sideA.health.mean * r.sideA.wins + r.sideB.health.mean * r.sideB.wins) / (r.sideA.wins + r.sideB.wins) * 100 : side.health.mean * 100;
  const wper = whp / 100 * A.men * A.hp / wmen;
  const ww = w == null ? null : wounds(A, B, 3);
  const f = (x, n = 0) => (x == null ? '   -' : x.toFixed(n).padStart(4));
  console.log(`${a.padEnd(5)} v ${b.padEnd(5)} (${String(fa).padStart(2)} v ${String(fb).padStart(2)})   | ${f(win, 2)}   ${f(r.pA, 2)}   | ${f(sec)}  ${f(r.seconds.median)}   | ${f(men)}   ${f(wmen)}     | ${f(hp, 1)}   ${f(whp, 1)}     | ${f(per)}   ${f(wper)}     | ${f(w)}   ${f(ww)}`);
  if (test) {
    const off = (x, y, tol) => Math.abs(x - y) > tol * Math.max(Math.abs(y), 1e-9);
    if (off(r.seconds.median, sec, 0.25)) { bad++; console.log('   FAIL seconds more than 25% off'); }
    if (!mirror && Math.abs(r.pA - win) > 0.02) { bad++; console.log('   FAIL the winner'); }
    if (!mirror && off(wmen, men, 0.25)) { bad++; console.log('   FAIL winner soldiers more than 25% off'); }
  }
}
if (test) { console.log(bad ? `${bad} FAILED` : 'ALL OK'); process.exit(bad ? 1 : 0); }
