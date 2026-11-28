// Unit against unit: many soldiers per side. A SIMULATION, not exact maths: the rule below was
// measured in the game (docs/unit_battle_research.md), and each fight is played swing by swing.
//
// unit = the duel stats (attack, defence, base, ap, armour, hp, interval) plus
//   men   = soldiers in the unit
//   files = soldiers side by side in the formation (its width)
//
// THE RULE (every number is a fit to logged fights of Empire Swordsmen and four variants):
//   1. WHO FIGHTS. Not every soldier swings. A side has
//        swingers = min( cap(width), SHRINK * own^OWN * other^OTHER )
//      cap(width) = CAP_BASE + CAP_FILE * files: a little under one soldier per file plus a few
//      at the ends. The second term takes over when the units get small: fewer soldiers reach an enemy.
//   2. UNEVEN WIDTHS. The wider side cannot use its whole front: it counts as at most the
//      narrow side's width + WRAP_WIDE files. The narrow side is wrapped, so its flank files
//      fight too: it counts as its width + WRAP_NARROW files, at most the wide side's width.
//   3. WHO IS HIT. A hit lands on a random soldier among the first ZONE * files soldiers of the
//      unit: the front rank and half of the second (the game's wounds are spread that wide). A dead soldier is replaced
//      from behind at once.
//   4. Each swinger swings once per attack interval. A swing hits and hurts exactly as in the
//      one-soldier duel (hit chance from attack and defence, damage against armour).
// LEFT OUT: charge, fatigue, morale and routing, experience, flank and rear attacks, weapons
// that hit several soldiers, the bonus against infantry or large targets, terrain.
import { hitChance, rollDamage, seededRandom } from './model.js';

export const UNIT_RULE = {
  CAP_BASE: 3.5, CAP_FILE: 0.84,          // swingers of a deep unit against its width
  SHRINK: 0.585, OWN: 0.63, OTHER: 0.28,   // swingers of small units
  WRAP_WIDE: 18, WRAP_NARROW: 10,         // files, for uneven widths (from 6 fights: rough)
  ZONE: 1.5,                                // soldiers that can be hit, per file of their unit
};
export const MAX_MEN = 400;               // per unit, for the page's limits
export const MAX_UNIT_SECONDS = 3600;     // a fight is cut off here and counts as a draw
const DT = 5;                             // step, in tenths of a second

const cap = (files) => UNIT_RULE.CAP_BASE + UNIT_RULE.CAP_FILE * files;

// Swingers of the side with `own` soldiers and `wOwn` files against `other` soldiers, `wOther` files.
export function swingers(own, other, wOwn, wOther) {
  if (own <= 0 || other <= 0) return 0;
  const R = UNIT_RULE;
  const eff = wOwn > wOther ? Math.min(wOwn, wOther + R.WRAP_WIDE) : Math.min(wOwn + R.WRAP_NARROW, Math.max(wOwn, wOther));
  return Math.max(1, Math.min(own, cap(eff), R.SHRINK * own ** R.OWN * other ** R.OTHER));
}

const clean = (u) => ({
  ...u,
  men: Math.max(1, Math.min(MAX_MEN, Math.round(u.men || 1))),
  files: Math.max(1, Math.min(MAX_MEN, Math.round(u.files || 1))),
  interval: Math.max(1, u.interval),
  hp: Math.max(1, Math.round(u.hp)),
});

// One fight to the last soldier. `record(t, menA, healthA, menB, healthB)` is called once a second.
// stopAt = soldiers at which the fight ends (0 = to the death; the game tests stopped at 2).
export function unitFight(A0, B0, rand = Math.random, record = null, stopAt = 0) {
  const A = clean(A0), B = clean(B0);
  const a = new Array(A.men).fill(A.hp), b = new Array(B.men).fill(B.hp);
  const pA = hitChance(A.attack, B.defence), pB = hitChance(B.attack, A.defence);
  let ha = A.men * A.hp, hb = B.men * B.hp, t = 0;
  // Swings come at a steady rhythm: each side keeps the fraction of a swing it has not used yet
  // (carry), starting at a random point of its rhythm so neither side always swings first.
  const carry = { A: rand(), B: rand() };
  const strike = (U, V, def, p, sw, who) => {
    carry[who] += sw * DT / U.interval;
    let n = Math.floor(carry[who]), lost = 0;
    carry[who] -= n;
    const zone = Math.max(1, Math.ceil(UNIT_RULE.ZONE * V.files));
    while (n-- > 0 && def.length) {
      if (rand() >= p) continue;
      const k = Math.floor(rand() * Math.min(def.length, zone));
      const d = Math.min(def[k], rollDamage(U.base, U.ap, V.armour, rand));
      def[k] -= d; lost += d;
      if (def[k] <= 0) def.splice(k, 1);
    }
    return lost;
  };
  const limit = MAX_UNIT_SECONDS * 10;
  while (a.length > stopAt && b.length > stopAt && t < limit) {
    t += DT;
    // both sides strike on the numbers at the start of the step, so neither gets the first blow
    const sa = swingers(a.length, b.length, A.files, B.files), sb = swingers(b.length, a.length, B.files, A.files);
    hb -= strike(A, B, b, pA, sa, 'A');
    ha -= strike(B, A, a, pB, sb, 'B');              // B's swingers were counted before A struck
    if (record && t % 10 === 0) record(t / 10, a.length, ha, b.length, hb);
  }
  const winner = a.length > b.length ? 'A' : b.length > a.length ? 'B' : 'tie';
  return { winner, seconds: t / 10, menA: a.length, menB: b.length, healthA: ha, healthB: hb, cut: t >= limit };
}

const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1) + 0.5))] : 0);

// Many fights. Stops after `runs` fights or `budgetMs` milliseconds, whichever comes first
// (never fewer than 20 fights), so the page cannot freeze on a slow pair of units.
export function unitBattle(A, B, { runs = 400, seed = 1, budgetMs = 250, stopAt = 0, curve = true } = {}) {
  const rand = seededRandom(seed);
  const cA = clean(A), cB = clean(B);
  const out = { runs: 0, winA: 0, winB: 0, tie: 0, cut: 0, A: cA, B: cB };
  const left = { A: [], B: [] }, health = { A: [], B: [] }, secs = [];
  const sum = { n: [], a: [], b: [], ha: [], hb: [] };   // average course of the fight, per 5 seconds
  const t0 = Date.now();
  while (out.runs < runs && (out.runs < 20 || Date.now() - t0 < budgetMs)) {
    const r = unitFight(cA, cB, rand, curve ? (t, ma, ha, mb, hb) => {
      if (t % 5) return;
      const i = t / 5;
      sum.n[i] = (sum.n[i] || 0) + 1; sum.a[i] = (sum.a[i] || 0) + ma; sum.b[i] = (sum.b[i] || 0) + mb;
      sum.ha[i] = (sum.ha[i] || 0) + ha; sum.hb[i] = (sum.hb[i] || 0) + hb;
    } : null, stopAt);
    out.runs++;
    if (r.cut) out.cut++;
    if (r.winner === 'A') { out.winA++; left.A.push(r.menA); health.A.push(r.healthA / (cA.men * cA.hp)); }
    else if (r.winner === 'B') { out.winB++; left.B.push(r.menB); health.B.push(r.healthB / (cB.men * cB.hp)); }
    else out.tie++;
    secs.push(r.seconds);
  }
  const n = out.runs;
  const side = (k, U) => {
    const m = [...left[k]].sort((x, y) => x - y), h = [...health[k]].sort((x, y) => x - y);
    const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
    const hist = new Array(U.men + 1).fill(0);
    for (const x of m) hist[x] += 1 / n;             // share of ALL fights that end with x soldiers of this side
    return { wins: m.length, men: { q25: quantile(m, 0.25), median: quantile(m, 0.5), q75: quantile(m, 0.75), mean: mean(m) },
      health: { median: quantile(h, 0.5), mean: mean(h) }, perSurvivor: mean(m) > 0 ? mean(h) * U.men * U.hp / mean(m) : 0, hist };
  };
  secs.sort((x, y) => x - y);
  out.pA = out.winA / n; out.pB = out.winB / n; out.pTie = out.tie / n;
  out.sideA = side('A', cA); out.sideB = side('B', cB);
  out.seconds = { q25: quantile(secs, 0.25), median: quantile(secs, 0.5), q75: quantile(secs, 0.75) };
  // the average course: soldiers and health of both sides every 5 seconds, over the fights still going
  out.course = [];
  for (let i = 1; i < sum.n.length; i++) {
    if (!sum.n[i] || sum.n[i] < n * 0.5) break;      // stop where half of the fights are over
    out.course.push({ t: i * 5, a: sum.a[i] / sum.n[i], b: sum.b[i] / sum.n[i], ha: sum.ha[i] / sum.n[i], hb: sum.hb[i] / sum.n[i] });
  }
  // the chance error of a share measured over n fights (one standard error)
  out.error = Math.sqrt(Math.max(out.pA * (1 - out.pA), 1e-9) / n);
  return out;
}
