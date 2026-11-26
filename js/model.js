// The one-soldier duel model. Pure maths, no page code, so it can be tested on its own.
// Times are kept in TENTHS of a second (integers), so "the same instant" is an exact test.

export const MAX_SWINGS = 3000;

// Step 1: one swing is a weighted coin. Probabilities stay between 0 and 1.
export function hitChance(attack, defence) {
  return Math.min(1, Math.max(0, (35 + attack - defence) / 100));
}

// Step 2: hits needed is a fixed whole number.
export function hitsNeeded(hp, damage) {
  return Math.ceil(hp / damage);
}

// Step 3: negative binomial. f[n] = P(the k-th hit lands on swing n).
// Built with logarithms so that p^k never underflows to zero.
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

// S[m] = P(N > m), the chance of still needing swings after m of them.
function survival(f) {
  const n = f.length - 1;
  const s = new Float64Array(n + 2);
  for (let m = n; m >= 0; m--) s[m] = s[m + 1] + (m + 1 <= n ? f[m + 1] : 0);
  return s;
}

// unit = { attack, defence, damage, hp, interval }  (interval in tenths of a second)
export function duel(A, B, nMax = MAX_SWINGS) {
  const pA = hitChance(A.attack, B.defence);
  const pB = hitChance(B.attack, A.defence);
  const kA = hitsNeeded(B.hp, A.damage);
  const kB = hitsNeeded(A.hp, B.damage);
  const a = A.interval, b = B.interval;
  const fA = swingsPmf(kA, pA, nMax), fB = swingsPmf(kB, pB, nMax);
  const SA = survival(fA), SB = survival(fB);

  // Step 5: the race. A's n-th swing lands at t = a(n-1). By then B has swung m(n) times.
  let winA = 0, tie = 0;
  for (let n = 1; n <= nMax; n++) {
    if (!fA[n]) continue;
    const t = a * (n - 1);
    const m = Math.floor(t / b) + 1;
    if (m > nMax) continue;
    winA += fA[n] * SB[m];
    if (t % b === 0) tie += fA[n] * fB[m];
  }

  // Step 6: duration. E[T] = integral of P(T > t) dt, with P(T > t) = P(T_A > t) P(T_B > t).
  const still = (S, iv, t) => { const j = Math.floor(t / iv) + 1; return j > nMax ? 0 : S[j]; };
  let meanT = 0, t = 0;
  for (let step = 0; step < 50000; step++) {
    const next = Math.min((Math.floor(t / a) + 1) * a, (Math.floor(t / b) + 1) * b);
    const going = still(SA, a, t) * still(SB, b, t);
    if (going < 1e-10) break;
    meanT += (next - t) * going;
    t = next;
  }

  const nobody = pA === 0 && pB === 0;
  return {
    pA, pB, kA, kB, fA, fB,
    meanSwingsA: pA > 0 ? kA / pA : Infinity,
    meanSwingsB: pB > 0 ? kB / pB : Infinity,
    sdSwingsA: pA > 0 ? Math.sqrt(kA * (1 - pA)) / pA : 0,
    sdSwingsB: pB > 0 ? Math.sqrt(kB * (1 - pB)) / pB : 0,
    winA, tie, winB: 1 - winA - tie,
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
    if (hitA) hb -= A.damage;
    if (hitB) ha -= B.damage;
    swings.push({ t, sa, sb, hitA, hitB, ha: Math.max(0, ha), hb: Math.max(0, hb) });
    if (sa) ta += A.interval;
    if (sb) tb += B.interval;
    if (ha <= 0 || hb <= 0) {
      return { winner: ha <= 0 && hb <= 0 ? 'tie' : hb <= 0 ? 'A' : 'B', duration: t, swings };
    }
  }
  return { winner: 'none', duration: Infinity, swings };
}

// A small seeded generator so tests give the same answer every run.
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
