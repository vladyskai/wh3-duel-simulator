// Tests of the unit-against-unit simulation (js/unit.js).   node check/test_unit.mjs
// The comparison with the game's logged fights is check/unit_rule_check.mjs --test.
import { unitBattle, unitFight, swingers, MAX_MEN, MAX_UNIT_SECONDS } from '../js/unit.js';
import { duel, seededRandom } from '../js/model.js';

let failed = 0;
const check = (label, ok, extra = '') => { if (!ok) failed++; console.log((ok ? 'ok   ' : 'FAIL ') + label + (extra ? ': ' + extra : '')); };
const SW = { attack: 32, defence: 32, base: 21, ap: 7, armour: 30, hp: 69, interval: 43, men: 120, files: 20 };

// ---- the rule itself
check('swingers follow the width: 20 files of a deep unit', Math.abs(swingers(120, 120, 20, 20) - 20.3) < 0.01, String(swingers(120, 120, 20, 20)));
check('swingers do not depend on the size of a deep unit', swingers(160, 160, 20, 20) === swingers(120, 120, 20, 20));
check('swingers fall when the units are small', swingers(30, 30, 20, 20) < 14 && swingers(30, 30, 20, 20) > 10);
check('never more swingers than soldiers, never fewer than one', swingers(3, 100, 20, 20) <= 3 && swingers(1, 200, 20, 20) === 1);
check('a wider unit has more swingers than the narrow one it wraps', swingers(120, 120, 40, 10) > swingers(120, 120, 10, 40));
check('the wrapped narrow unit has more swingers than against its own width', swingers(120, 120, 10, 40) > swingers(120, 120, 10, 10));
check('no enemy, no swingers', swingers(100, 0, 20, 20) === 0 && swingers(0, 100, 20, 20) === 0);

// ---- one fight
const f = unitFight(SW, SW, seededRandom(1));
check('a fight to the death leaves one side with nobody', (f.menA === 0) !== (f.menB === 0) || f.winner === 'tie');
check('health left is never negative and never above the start', f.healthA >= 0 && f.healthB >= 0 && f.healthA <= 120 * 69 && f.healthB <= 120 * 69);
check('the loser has no health left', (f.winner === 'A' ? f.healthB : f.healthA) === 0);
let lastA = 1e9, lastB = 1e9, mono = true, rows = 0;
unitFight(SW, SW, seededRandom(2), (t, ma, ha, mb, hb) => { rows++; if (ha > lastA || hb > lastB) mono = false; lastA = ha; lastB = hb; });
check('health only ever goes down during a fight', mono && rows > 100);

// ---- many fights
const even = unitBattle(SW, SW, { runs: 2000, seed: 3, budgetMs: 60000, curve: false });
check('a mirror fight is even (within 3 standard errors)', Math.abs(even.pA - 0.5) < 3 * even.error + 0.01, `${even.pA.toFixed(3)} +- ${even.error.toFixed(3)}`);
check('the shares add up to 1', Math.abs(even.pA + even.pB + even.pTie - 1) < 1e-9);
check('the histogram of the winner\'s soldiers adds up to the wins', Math.abs(even.sideA.hist.reduce((s, x) => s + x, 0) - even.pA) < 1e-9);
const again = unitBattle(SW, SW, { runs: 300, seed: 3, budgetMs: 60000, curve: false }), same = unitBattle(SW, SW, { runs: 300, seed: 3, budgetMs: 60000, curve: false });
check('the same seed gives the same answer', again.pA === same.pA && again.seconds.median === same.seconds.median);
const strong = unitBattle({ ...SW, attack: 47, defence: 47 }, SW, { runs: 300, seed: 4, budgetMs: 60000, curve: false });
check('+15 attack and defence wins every time and keeps most of its soldiers', strong.pA === 1 && strong.sideA.men.median > 70);
const more = unitBattle({ ...SW, men: 160 }, SW, { runs: 300, seed: 5, budgetMs: 60000, curve: false });
check('160 soldiers beat 120 at the same width', more.pA > 0.99);
const wide = unitBattle({ ...SW, files: 40 }, { ...SW, files: 10 }, { runs: 300, seed: 6, budgetMs: 60000, curve: false });
check('40 files beat 10 files (the game: 6 of 6)', wide.pA > 0.99);
const course = unitBattle(SW, SW, { runs: 200, seed: 7, budgetMs: 60000 }).course;
check('the average course starts near full strength and falls', course.length > 10 && course[0].a > 110 && course[course.length - 1].a < course[0].a);

// ---- one soldier against one soldier: close to the exact duel (the unit fight swings at random
// moments, the duel on a fixed rhythm, so only roughly)
const A1 = { attack: 45, defence: 25, base: 20, ap: 5, armour: 30, hp: 100, interval: 40, men: 1, files: 1 };
const B1 = { attack: 30, defence: 30, base: 30, ap: 10, armour: 50, hp: 120, interval: 43, men: 1, files: 1 };
const one = unitBattle(A1, B1, { runs: 6000, seed: 8, budgetMs: 60000, curve: false }), exact = duel(A1, B1);
check('1 soldier v 1 soldier is close to the exact duel (within 4 points)', Math.abs(one.pA - exact.winA) < 0.04, `${one.pA.toFixed(3)} against ${exact.winA.toFixed(3)}`);

// ---- it cannot freeze: any stats, bounded time
let worst = 0, bad = 0;
const rnd = seededRandom(99), pick = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const any = () => ({ attack: pick(0, 100), defence: pick(0, 100), base: pick(0, 200), ap: pick(0, 200), armour: pick(0, 200), hp: pick(1, 500), interval: pick(20, 60), men: pick(1, 300), files: pick(1, 100) });
for (let i = 0; i < 150; i++) {
  const t0 = Date.now();
  const r = unitBattle(any(), any(), { runs: 1000, budgetMs: 100, seed: i });
  const ms = Date.now() - t0;
  worst = Math.max(worst, ms);
  if (!(r.runs >= 20) || !isFinite(r.pA) || !isFinite(r.seconds.median) || Math.abs(r.pA + r.pB + r.pTie - 1) > 1e-9 || r.sideA.hist.length > MAX_MEN + 1) bad++;
}
check('150 random pairs of units: every answer is whole', bad === 0, `${bad} bad`);
check('150 random pairs of units: none takes more than 3 seconds', worst < 3000, `worst ${worst} ms`);
const stuck = unitBattle({ ...SW, attack: 0, defence: 100, men: 300 }, { ...SW, attack: 0, defence: 100, men: 300 }, { runs: 1000, budgetMs: 100 });
check('units that cannot hit each other: a draw after an hour of game time, not a hang', stuck.pTie === 1 && stuck.cut === stuck.runs && stuck.seconds.median === MAX_UNIT_SECONDS);

console.log('\n' + (failed ? `${failed} FAILED` : 'ALL OK'));
process.exit(failed ? 1 : 0);
