// The one-soldier duel model. Pure maths, no page code, so it can be tested on its own.
// Times are kept in TENTHS of a second (integers), so "the same instant" is an exact test.
// The game rules and their sources are in docs/game_rules.md.
//
// unit = { attack, defence, base, ap, armour, hp, interval }
//   base     = base weapon damage (armour reduces it)
//   ap       = armour-piercing damage (armour ignores it)
//   armour   = armour value, as in the game (0 = none)
//   hp       = hit points (a whole number)
//   interval = time between swings, in tenths of a second

export const MAX_SWINGS = 3000;
export const MAX_HITS = 1000;

// Step 1: one swing is a weighted coin. Probabilities stay between 0 and 1.
export function hitChance(attack, defence) {
  return Math.min(1, Math.max(0, (35 + attack - defence) / 100));
}

// Step 2: damage of one hit = round(ap) + round(base * (1 - R)), with the armour roll
// R = min(1, U * armour / 100) and U uniform between 0.5 and 1. The game rounds the two
// parts separately, at the end (developer article). There is no minimum damage.
//
// Before rounding, the base part is: 0 with probability q (the roll reached 100%),
// otherwise uniform between lo and hi. Rounding turns that into whole numbers: the value j
// gets the share of [lo, hi] that rounds to j, i.e. the part of [j - 0.5, j + 0.5).
// Returns pmf[d] = P(one hit does exactly d damage), d = 0 .. max.
export function hitDamage(base, ap, armour) {
  const a = Math.max(0, armour) / 100;
  let q = 0, lo = base, hi = base;
  if (a > 0 && base > 0) {
    if (a >= 2) { q = 1; lo = hi = 0; }
    else if (a > 1) { q = 2 * (a - 1) / a; lo = 0; hi = base * (1 - a / 2); }
    else { lo = base * (1 - a); hi = base * (1 - a / 2); }
  }
  const apr = Math.round(ap);
  const pmf = new Float64Array(apr + Math.round(hi) + 2);
  if (q > 0) pmf[apr] += q;
  if (q < 1) {
    if (hi - lo < 1e-9) pmf[apr + Math.round(lo)] += 1 - q; // no spread: one value
    else {
      for (let j = Math.round(lo); j <= Math.round(hi); j++) {
        const len = Math.min(hi, j + 0.5) - Math.max(lo, j - 0.5);
        if (len > 0) pmf[apr + j] += (1 - q) * len / (hi - lo);
      }
    }
  }
  let mean = 0, min = Infinity, max = 0;
  for (let d = 0; d < pmf.length; d++) {
    if (pmf[d] <= 1e-15) continue;
    mean += d * pmf[d]; min = Math.min(min, d); max = d;
  }
  // rawMean = the average before rounding, for the formula on the page.
  const rawMean = ap + (1 - q) * (lo + hi) / 2;
  return { base, ap, armour, q, lo, hi, pmf, mean, rawMean, min, max, zero: pmf[0] };
}

// One random hit, for the simulation: the same rule, rolled.
export function rollDamage(base, ap, armour, rand) {
  const r = Math.min(1, (0.5 + 0.5 * rand()) * Math.max(0, armour) / 100);
  return Math.round(ap) + Math.round(base * (1 - r));
}

// Step 3: hits needed K = the first k with D_1 + ... + D_k >= HP. Returns g[k] = P(K = k).
// Every hit does a whole number of damage, so this is exact: cur[s] is the chance that the
// target has taken exactly s damage after k hits and is still standing (s < HP). Each hit
// moves that chance to s + d with probability pmf[d]; whatever reaches HP or more is
// recorded as P(K = k).
export function hitsNeededDist(hp, dmg, kMax = MAX_HITS) {
  const g = new Float64Array(kMax + 1);
  const HP = Math.max(1, Math.ceil(hp - 1e-9));
  // The damage values that can happen, in two plain number arrays (this loop runs millions
  // of times for a tanky, heavily armoured target, so it is written to be fast).
  const ds = [], ws = [];
  for (let d = 0; d < dmg.pmf.length; d++) if (dmg.pmf[d] > 1e-15) { ds.push(d); ws.push(dmg.pmf[d]); }
  const nv = ds.length, D = Int32Array.from(ds), W = Float64Array.from(ws);
  if (!ds.some((d) => d > 0)) return g; // no hit can ever do damage
  let cur = new Float64Array(HP), nxt = new Float64Array(HP);
  cur[0] = 1;
  for (let k = 1; k <= kMax; k++) {
    nxt.fill(0);
    let dead = 0, left = 0;
    for (let s = 0; s < HP; s++) {
      const m = cur[s];
      if (m < 1e-300) continue;
      for (let i = 0; i < nv; i++) {
        const to = s + D[i];
        if (to >= HP) dead += m * W[i]; else nxt[to] += m * W[i];
      }
    }
    for (let s = 0; s < HP; s++) left += nxt[s];
    g[k] = dead;
    const swap = cur; cur = nxt; nxt = swap;
    if (left < 1e-13) break;
  }
  return g;
}

// Negative binomial pmf: P(the k-th hit lands on swing n), built with logarithms.
export function swingsPmf(k, p, nMax = MAX_SWINGS) {
  nMax = Math.min(nMax, MAX_SWINGS);
  const f = new Float64Array(nMax + 1);
  if (p <= 0) return f;
  if (p >= 1) { if (k <= nMax) f[k] = 1; return f; }
  // log P(n), stepped from n to n + 1 with a table of logarithms (one table for all calls).
  // Values below e^-46 (about 1e-20) are left at 0, and once the curve is past its peak and
  // that small, the rest is skipped: it can only get smaller. This is what keeps one duel
  // fast when it blends hundreds of these curves.
  const logq = Math.log(1 - p), peak = k / p;
  let logP = k * Math.log(p);
  for (let n = k; n <= nMax; n++) {
    if (logP > -46) f[n] = Math.exp(logP);
    else if (n > peak) break;
    logP += LOG[n] - LOG[n - k + 1] + logq;
  }
  return f;
}
const LOG = Float64Array.from({ length: MAX_SWINGS + 2 }, (_, n) => Math.log(n));

// Step 4: swings needed is a MIXTURE of negative binomials, weighted by P(K = k).
function swingsDist(g, p, nMax = MAX_SWINGS) {
  const f = new Float64Array(nMax + 1);
  if (p <= 0) return f;
  for (let k = 1; k < g.length && k <= nMax; k++) {
    if (g[k] < 1e-13) continue;
    const nb = swingsPmf(k, p, nMax);
    for (let n = k; n <= nMax; n++) f[n] += g[k] * nb[n];
  }
  return f;
}

function moments(g) {
  let m = 0, m2 = 0, tot = 0;
  for (let k = 1; k < g.length; k++) { m += k * g[k]; m2 += k * k * g[k]; tot += g[k]; }
  if (tot < 0.999) return { mean: Infinity, sd: 0, var: 0 };
  m /= tot; m2 /= tot;
  const v = Math.max(0, m2 - m * m);
  return { mean: m, var: v, sd: Math.sqrt(v) };
}

// P(N > m) for m = 0..nMax, including the chance of never finishing.
function survival(f) {
  const n = f.length - 1;
  let total = 0; for (let i = 0; i <= n; i++) total += f[i];
  const s = new Float64Array(n + 2);
  s[n + 1] = 1 - total;
  for (let m = n; m >= 0; m--) s[m] = s[m + 1] + (m + 1 <= n ? f[m + 1] : 0);
  return { s, total };
}

// P(X wins): X's n-th swing lands at x(n-1); by then Y has swung m(n) times.
function race(fX, x, fY, SY, y, nMax) {
  let win = 0, tie = 0;
  for (let n = 1; n <= nMax; n++) {
    if (!fX[n]) continue;
    const t = x * (n - 1), m = Math.floor(t / y) + 1;
    if (m > nMax) { win += fX[n] * SY[nMax + 1]; continue; }
    win += fX[n] * SY[m];
    if (t % y === 0) tie += fX[n] * fY[m];
  }
  return { win, tie };
}

export function duel(A, B, nMax = MAX_SWINGS) {
  const pA = hitChance(A.attack, B.defence), pB = hitChance(B.attack, A.defence);
  const dA = hitDamage(A.base, A.ap, B.armour), dB = hitDamage(B.base, B.ap, A.armour);
  const gA = hitsNeededDist(B.hp, dA), gB = hitsNeededDist(A.hp, dB);
  const fA = swingsDist(gA, pA, nMax), fB = swingsDist(gB, pB, nMax);
  const { s: SA, total: finA } = survival(fA), { s: SB, total: finB } = survival(fB);
  const a = A.interval, b = B.interval;

  // Step 6: the race, from each side.
  const rA = race(fA, a, fB, SB, b, nMax), rB = race(fB, b, fA, SA, a, nMax);

  // Step 7: duration. E[T] = integral of P(T > t) dt, with P(T > t) = P(T_A > t) P(T_B > t).
  const still = (S, iv, t) => { const j = Math.floor(t / iv) + 1; return S[Math.min(j, nMax + 1)]; };
  let meanT = 0, t = 0;
  const nobody = finA < 1e-6 && finB < 1e-6;
  for (let step = 0; step < 100000 && !nobody; step++) {
    const next = Math.min((Math.floor(t / a) + 1) * a, (Math.floor(t / b) + 1) * b);
    const going = still(SA, a, t) * still(SB, b, t);
    if (going < 1e-10) break;
    meanT += (next - t) * going;
    t = next;
  }

  // Law of total variance: Var(N) = E[K](1-p)/p^2 + Var(K)/p^2, and E[N] = E[K]/p.
  const kA = moments(gA), kB = moments(gB);
  const sw = (k, p) => (p > 0 && isFinite(k.mean)
    ? { mean: k.mean / p, sd: Math.sqrt(k.mean * (1 - p) + k.var) / p }
    : { mean: Infinity, sd: 0 });
  return {
    pA, pB, dA, dB, gA, gB, fA, fB,
    hitsA: kA, hitsB: kB, swingsA: sw(kA, pA), swingsB: sw(kB, pB),
    winA: rA.win, winB: rB.win, tie: rA.tie, neither: (1 - finA) * (1 - finB),
    meanDuration: nobody ? Infinity : meanT,
    nobody,
  };
}

// Which stat is worth the most? Raise one stat of one unit by one step (one point, or
// 0.1 s faster for the interval) and see how much that unit's chance to win changes.
// `r0` is duel(A, B) already computed. `limits[key] = { min, max }` stops at the slider ends
// (null = that step is not possible). The answer is in win-chance points: 0.008 = +0.8%.
export const IMPROVE = { attack: 1, defence: 1, base: 1, ap: 1, armour: 1, hp: 1, interval: -1 };
export function statGains(A, B, r0 = duel(A, B), limits = null, run = duel, onlySide = null, onlyKey = null) {
  const out = { A: {}, B: {} };
  for (const side of ['A', 'B']) {
    const u = side === 'A' ? A : B;
    for (const key of Object.keys(IMPROVE)) {
      if ((onlySide && side !== onlySide) || (onlyKey && key !== onlyKey)) continue;
      const v = u[key] + IMPROVE[key];
      if (limits && limits[key] && (v < limits[key].min || v > limits[key].max)) { out[side][key] = null; continue; }
      const r = side === 'A' ? run({ ...A, [key]: v }, B) : run(A, { ...B, [key]: v });
      out[side][key] = side === 'A' ? r.winA - r0.winA : r.winB - r0.winB;
    }
  }
  return out;
}

// The model in stages, from the simplest to the full one. Each stage switches stats on;
// the ones still off are set so that they change nothing.
//   1. One attacker: A swings at B until B falls. A: melee attack, damage per hit.
//      B: melee defence, hit points. B never strikes back.
//   2. Time: A swings once per attack interval.
//   3. Both fight: B strikes back (B's attack, damage, interval; A's defence, hit points).
//   4. Armour: armour blocks a random share of the damage.
//   5. Armour-piercing damage: part of the damage ignores armour (the full model).
export const STAGES = 5;   // stages of the one-soldier duel. Stage 6 (units) is js/unit.js
export function stageUnits(A, B, stage) {
  const a = { ...A }, b = { ...B };
  if (stage < 5) { a.ap = 0; b.ap = 0; }
  if (stage < 4) { a.armour = 0; b.armour = 0; }
  if (stage < 3) { b.attack = -1000; b.base = 0; } // B never hits and never hurts
  return [a, b];
}
export const stageDuel = (stage) => (A, B) => duel(...stageUnits(A, B, stage));

// The brute-force check: fight one duel swing by swing.
export function fightOnce(A, B, rand = Math.random, keep = true) {
  const pA = hitChance(A.attack, B.defence), pB = hitChance(B.attack, A.defence);
  let ha = A.hp, hb = B.hp, ta = 0, tb = 0;
  const swings = [];
  for (let i = 0; i < 20000; i++) {
    const t = Math.min(ta, tb), sa = ta === t, sb = tb === t;
    const hitA = sa && rand() < pA, hitB = sb && rand() < pB;
    let dmgA = 0, dmgB = 0;
    if (hitA) { dmgA = rollDamage(A.base, A.ap, B.armour, rand); hb -= dmgA; }
    if (hitB) { dmgB = rollDamage(B.base, B.ap, A.armour, rand); ha -= dmgB; }
    if (keep) swings.push({ t, sa, sb, hitA, hitB, dmgA, dmgB, ha: Math.max(0, ha), hb: Math.max(0, hb) });
    if (sa) ta += A.interval;
    if (sb) tb += B.interval;
    if (ha <= 0 || hb <= 0) {
      const da = ha <= 0, db = hb <= 0;
      return { winner: da && db ? 'tie' : db ? 'A' : 'B', duration: t, swings, ha: Math.max(0, ha), hb: Math.max(0, hb) };
    }
  }
  return { winner: 'none', duration: Infinity, swings, ha, hb };
}

// A small seeded generator so tests give the same answer every run.
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
