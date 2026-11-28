// Candidate rules for the unit fight, each compared with the same numbers margin_data.py
// prints from the logged fights (even 20 v 20, Swordsmen, 120 soldiers, stop at 2 left).
//
//   node check/margin_sim.mjs
//
// A rule = (how many soldiers of a side fight) + (which enemy soldier a hit lands on).
// Every rule is first calibrated: its swing rate is scaled until the health a side loses per
// 20 s, while both units have 60+ soldiers, equals the measured 722. So the rules differ only
// in WHO is hit and in how the fighters change with the numbers, not in raw speed.
import { rollDamage, seededRandom } from '../js/model.js';

const U = { p: 0.35, base: 21, ap: 7, armour: 30, hp: 69, iv: 4.3 };
const MEN = 120, DT = 0.5, TARGET_RATE = 722;

// fighters of a side
const LAWS = {
  pairs: (o, e) => Math.min(20, o, e),
  fitted: (o, e) => Math.min(19.5, 0.54 * o ** 0.63 * e ** 0.28),
};
// which soldier of the defending unit (array d, front first) a hit lands on. fd = its fighters
const TARGETS = {
  front: (d, fd, rand) => Math.floor(rand() * Math.min(d.length, Math.max(1, Math.ceil(fd)))),
  focus: (d, fd) => { let k = 0; const n = Math.min(d.length, Math.max(1, Math.ceil(fd))); for (let i = 1; i < n; i++) if (d[i] < d[k]) k = i; return k; },
  spread: (g) => (d, fd, rand) => Math.floor(rand() * Math.min(d.length, g)),
  all: (d, fd, rand) => Math.floor(rand() * d.length),
  zone: (k) => (d, fd, rand) => Math.floor(rand() * Math.min(d.length, Math.max(1, Math.ceil(k * fd)))),
};

function fight(rule, scale, rand, rec) {
  const A = Array.from({ length: MEN }, () => U.hp), B = Array.from({ length: MEN }, () => U.hp);
  const sum = (x) => { let s = 0; for (const v of x) s += v; return s; };
  let t = 0, ha = MEN * U.hp, hb = MEN * U.hp;
  const strike = (att, def, hdef) => {
    const f = rule.law(att.length, def.length) * (rule.lead ? (att.length / def.length) ** rule.lead : 1);
    const fd = rule.law(def.length, att.length);
    const mean = f * scale * DT / U.iv;            // expected swings this step
    let swings = Math.floor(mean) + (rand() < mean - Math.floor(mean) ? 1 : 0);
    let lost = 0;
    while (swings-- > 0 && def.length) {
      if (rand() >= U.p) continue;
      const k = rule.target(def, fd, rand);
      const dmg = Math.min(def[k], rollDamage(U.base, U.ap, U.armour, rand));
      def[k] -= dmg; lost += dmg;
      if (def[k] <= 0) def.splice(k, 1);
    }
    return lost;
  };
  while (A.length > 2 && B.length > 2) {
    t += DT;
    // both sides strike on the state at the start of the step (copies of the counts are inside law())
    const la = A.length, lb = B.length;
    const lostB = strike(A, B), lostA = (la && lb) ? strike(B, A) : 0;
    ha -= lostA; hb -= lostB;
    if (rec && Number.isInteger(t)) rec(t, A.length, ha, B.length, hb);
  }
  return { t, am: A.length, bm: B.length, ha, hb };
}

const q = (xs, p) => [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))];
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

function run(name, rule, N = 1500) {
  // calibrate the speed on the deep phase
  let scale = 1;
  for (let pass = 0; pass < 3; pass++) {
    const rand = seededRandom(5 + pass); let lost = 0, secs = 0;
    for (let i = 0; i < 150; i++) {
      let prev = null;
      fight(rule, scale, rand, (t, am, ha, bm, hb) => {
        if (t > 20 && Math.min(am, bm) >= 60 && prev) { lost += (prev[0] - ha) + (prev[1] - hb); secs += 2; }
        prev = [ha, hb];
      });
    }
    scale *= TARGET_RATE / (lost / secs * 20);
  }
  const rand = seededRandom(11);
  const wm = [], wh = [], per = [], secs = [], pool = [], late = [];
  const lead = { 80: [], 160: [], 200: [] }, leadH = { 80: [], 160: [], 200: [] };
  for (let i = 0; i < N; i++) {
    const seen = {};
    const r = fight(rule, scale, rand, (t, am, ha, bm, hb) => {
      for (const [m, h] of [[am, ha], [bm, hb]]) {
        if (m >= 60 && m < 100) pool.push(m * U.hp - h);
        if (m >= 10 && m < 20) late.push(h / m);
      }
      for (const L of [80, 160, 200]) if (!seen[L] && 2 * MEN - am - bm >= L) { seen[L] = 1; lead[L].push(Math.abs(am - bm)); leadH[L].push(Math.abs(ha - hb)); }
    });
    const w = r.am > r.bm ? [r.am, r.ha] : [r.bm, r.hb];
    wm.push(w[0]); wh.push(w[1] / (MEN * U.hp) * 100); per.push(w[1] / w[0]); secs.push(r.t);
  }
  console.log(name.padEnd(46) + '|' + `${q(secs, .5).toFixed(0)}`.padStart(5) + ' | ' + `${q(wm, .25)}, ${q(wm, .5)}, ${q(wm, .75)}`.padEnd(11) + '| ' + `${q(wh, .5).toFixed(1)}`.padStart(5) + ' | ' + `${q(per, .5).toFixed(0)}`.padStart(4) + '    | ' + `${mean(pool).toFixed(0)}`.padStart(5) + ' | ' + `${mean(late).toFixed(0)}`.padStart(4) + '   | ' + `${mean(lead[80]).toFixed(1)}  ${mean(lead[160]).toFixed(1)}  ${mean(lead[200]).toFixed(1)}`.padEnd(15) + ' | ' + `${mean(leadH[80]).toFixed(0)} ${mean(leadH[160]).toFixed(0)} ${mean(leadH[200]).toFixed(0)}`);
}

console.log('rule'.padEnd(46) + '| sec  | winner men | hp %  | hp/man  | pool  | hp/man | lead in soldiers | lead in health');
console.log(''.padEnd(46) + '|      | 25, 50, 75 | median| at end  | 60-99 | 10-19  | at 80 160 200    | at 80 160 200 lost');
console.log('MEASURED (42 fights)'.padEnd(46) + '|  258 | 11, 19, 25 |   8.0 |   41    |   889 |   41   | 4.1  7.1  9.9    | 245 388 499');
const T = TARGETS;
const rules = [
  ['pairs, hit a random front soldier', { law: LAWS.pairs, target: T.front }],
  ['fitted, hit a random front soldier', { law: LAWS.fitted, target: T.front }],
  ['1. fitted, hits FOCUS on the most hurt', { law: LAWS.fitted, target: T.focus }],
  ['3. fitted, hits spread over the first 30', { law: LAWS.fitted, target: T.spread(30) }],
  ['3. fitted, hits spread over the first 40', { law: LAWS.fitted, target: T.spread(40) }],
  ['3. fitted, hits spread over the first 60', { law: LAWS.fitted, target: T.spread(60) }],
  ['3. fitted, hits spread over the whole unit', { law: LAWS.fitted, target: T.all }],
  ['3. fitted, hit zone = 1.5 x the fighters', { law: LAWS.fitted, target: T.zone(1.5) }],
  ['3. fitted, hit zone = 1.75 x the fighters', { law: LAWS.fitted, target: T.zone(1.75) }],
  ['3. fitted, hit zone = 2 x the fighters', { law: LAWS.fitted, target: T.zone(2) }],
  ['2. fitted, front, leader +: (own/other)^0.25', { law: LAWS.fitted, target: T.front, lead: 0.25 }],
  ['2. fitted, front, leader +: (own/other)^0.5', { law: LAWS.fitted, target: T.front, lead: 0.5 }],
  ['2+3. fitted, first 40, (own/other)^0.25', { law: LAWS.fitted, target: T.spread(40), lead: 0.25 }],
  ['2+3. fitted, first 40, (own/other)^0.5', { law: LAWS.fitted, target: T.spread(40), lead: 0.5 }],
];
for (const [n, r] of rules) run(n, r);
