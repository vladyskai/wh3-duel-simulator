// The one-soldier duel model. Pure maths, no page code, so it can be tested on its own.
// Times are kept in TENTHS of a second (integers), so "the same instant" is an exact test.
//
// unit = { attack, defence, base, ap, armour, hp, interval }
//   base     = base weapon damage (armour reduces it)
//   ap       = armour-piercing damage (armour ignores it)
//   armour   = armour value, as in the game (0 = none)
//   interval = time between swings, in tenths of a second

export const MAX_SWINGS = 3000;
export const MAX_HITS = 1000;
const GRID = 4000; // cells used to track accumulated damage when it is random

// Step 1: one swing is a weighted coin. Probabilities stay between 0 and 1.
export function hitChance(attack, defence) {
  return Math.min(1, Math.max(0, (35 + attack - defence) / 100));
}

// Step 2: damage of one hit = ap + base * (1 - R), with the armour roll
// R = min(1, U * armour / 100) and U uniform between 0.5 and 1.
// Described as: with probability q the base part is fully blocked (0),
// otherwise the base part is uniform between lo and hi.
export function hitDamage(base, ap, armour) {
  const a = Math.max(0, armour) / 100;
  let q = 0, lo = base, hi = base;
  if (a > 0 && base > 0) {
    if (a >= 2) { q = 1; lo = hi = 0; }
    else if (a > 1) { q = 2 * (a - 1) / a; lo = 0; hi = base * (1 - a / 2); }
    else { lo = base * (1 - a); hi = base * (1 - a / 2); }
  }
  const mean = ap + (1 - q) * (lo + hi) / 2;
  return { base, ap, q, lo, hi, min: ap + (q > 0 ? 0 : lo), max: ap + (q < 1 ? hi : 0), mean };
}

// One random hit, for the simulation.
export function rollDamage(base, ap, armour, rand) {
  const r = Math.min(1, (0.5 + 0.5 * rand()) * Math.max(0, armour) / 100);
  return ap + base * (1 - r);
}

// Step 3: hits needed K = the first k with D_1 + ... + D_k >= HP. Returns g[k] = P(K = k).
// Exact when the damage is fixed. Otherwise the accumulated damage is tracked on a grid:
// each hit moves the probability mass right by the hit's damage, and the mass that reaches
// HP is recorded as P(K = k).
export function hitsNeededDist(hp, dmg, kMax = MAX_HITS) {
  const g = new Float64Array(kMax + 1);
  const fixed = dmg.q >= 1 || dmg.hi - dmg.lo < 1e-9;
  if (fixed) {
    const d = dmg.q >= 1 ? dmg.ap : dmg.ap + dmg.lo;
    if (d > 0) { const k = Math.ceil(hp / d - 1e-12); if (k <= kMax) g[k] = 1; }
    return g;
  }
  const h = hp / GRID;
  let cur = new Float64Array(GRID); cur[0] = 1;
  const apC = dmg.ap / h, loC = (dmg.ap + dmg.lo) / h, hiC = (dmg.ap + dmg.hi) / h;
  for (let k = 1; k <= kMax; k++) {
    const diff = new Float64Array(GRID + 1);
    const nxt = new Float64Array(GRID);
    let dead = 0;
    for (let i = 0; i < GRID; i++) {
      const m = cur[i];
      if (m < 1e-300) continue;
      if (dmg.q > 0) { // base fully blocked: a point shift by ap
        const w = m * dmg.q, j = i + apC, j0 = Math.floor(j), f = j - j0;
        if (j0 >= GRID) dead += w;
        else { nxt[j0] += w * (1 - f); if (j0 + 1 >= GRID) dead += w * f; else nxt[j0 + 1] += w * f; }
      }
      const w = m * (1 - dmg.q); // armour roll: uniform between ap + lo and ap + hi
      if (w <= 0) continue;
      const a = i + loC, b = i + hiC;
      if (a >= GRID) { dead += w; continue; }
      const dens = w / (b - a);
      if (b > GRID) dead += dens * (b - GRID);
      addRange(diff, nxt, a, Math.min(b, GRID), dens);
    }
    let run = 0, left = 0;
    for (let i = 0; i < GRID; i++) { run += diff[i]; nxt[i] += run; left += nxt[i]; }
    g[k] = dead;
    cur = nxt;
    if (left < 1e-12) break;
  }
  return g;
}

// Spread `dens` (mass per cell) over the continuous cell range [a, b):
// whole cells through the difference array, the two partial end cells directly.
function addRange(diff, cells, a, b, dens) {
  const ia = Math.floor(a), ib = Math.floor(b);
  if (ia === ib) { cells[ia] += dens * (b - a); return; }
  cells[ia] += dens * (ia + 1 - a);
  if (ib > ia + 1) { diff[ia + 1] += dens; diff[ib] -= dens; }
  if (ib < cells.length) cells[ib] += dens * (b - ib);
}

// Negative binomial pmf: P(the k-th hit lands on swing n), built with logarithms.
export function swingsPmf(k, p, nMax = MAX_SWINGS) {
  const f = new Float64Array(nMax + 1);
  if (p <= 0) return f;
  if (p >= 1) { if (k <= nMax) f[k] = 1; return f; }
  let logP = k * Math.log(p);
  for (let n = k; n <= nMax; n++) {
    f[n] = Math.exp(logP);
    logP += Math.log(n / (n - k + 1)) + Math.log(1 - p);
  }
  return f;
}

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

// The brute-force check: fight one duel swing by swing.
export function fightOnce(A, B, rand = Math.random) {
  const pA = hitChance(A.attack, B.defence), pB = hitChance(B.attack, A.defence);
  let ha = A.hp, hb = B.hp, ta = 0, tb = 0;
  const swings = [];
  for (let i = 0; i < 20000; i++) {
    const t = Math.min(ta, tb), sa = ta === t, sb = tb === t;
    const hitA = sa && rand() < pA, hitB = sb && rand() < pB;
    let dmgA = 0, dmgB = 0;
    if (hitA) { dmgA = rollDamage(A.base, A.ap, B.armour, rand); hb -= dmgA; }
    if (hitB) { dmgB = rollDamage(B.base, B.ap, A.armour, rand); ha -= dmgB; }
    swings.push({ t, sa, sb, hitA, hitB, dmgA, dmgB, ha: Math.max(0, ha), hb: Math.max(0, hb) });
    if (sa) ta += A.interval;
    if (sb) tb += B.interval;
    if (ha <= 1e-9 || hb <= 1e-9) {
      const da = ha <= 1e-9, db = hb <= 1e-9;
      return { winner: da && db ? 'tie' : db ? 'A' : 'B', duration: t, swings };
    }
  }
  return { winner: 'none', duration: Infinity, swings };
}

// A small seeded generator so tests give the same answer every run.
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
