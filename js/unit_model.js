// Unit against unit: many soldiers per side, everyone fighting at once.
// Three tools, from fastest to most faithful:
//   1. Lanchester's equations: the average fight, as smooth curves.
//   2. A Markov chain on the head counts: the full distribution of outcomes.
//   3. A soldier-by-soldier simulation: the referee for the other two.
//
// unit = the duel's soldier { attack, defence, base, ap, armour, hp, interval }
//        plus { men, splash }  (splash = most soldiers one swing can target, 1 = none)
// opts = { limits, minDamage, targeting: 'stick' | 'spread', stagger: true }
import { hitChance, hitDamage, hitsNeededDist, rollDamage } from './model.js';

// ---- Kill rates ---------------------------------------------------------------------------
// One attacker's kills per second against fresh enemies, when one swing targets m soldiers.
// Each target takes 1/m of the damage (players' description of splash) and rolls its own hit.
// Renewal theory: a kill every a * E[N] seconds, so m kills every a * E[N_m] seconds.
// Also returns cv2, the squared coefficient of variation of the time one attacker needs to kill
// one defender (variance / mean^2), from the law of total variance of the duel model.
export function killStats(att, def, m, opts = {}) {
  const p = hitChance(att.attack, def.defence, opts.limits || null);
  if (p <= 0) return { rate: 0, cv2: 1 };
  const d = hitDamage(att.base / m, att.ap / m, def.armour, !!opts.minDamage);
  const g = hitsNeededDist(def.hp, d);
  let eK = 0, eK2 = 0, tot = 0;
  for (let k = 1; k < g.length; k++) { eK += k * g[k]; eK2 += k * k * g[k]; tot += g[k]; }
  if (tot < 0.999) return { rate: 0, cv2: 1 }; // this attacker can never kill this defender
  eK /= tot; eK2 /= tot;
  const eN = eK / p, vN = (eK * (1 - p) + (eK2 - eK * eK)) / (p * p);
  return { rate: m / ((att.interval / 10) * eN), cv2: vN / (eN * eN) };
}
export const killRate = (att, def, m, opts = {}) => killStats(att, def, m, opts).rate;

// rates[m] for m = 1 .. splash, so the tools can use fewer targets when few enemies are left.
export function killRates(att, def, opts = {}) {
  const r = [0];
  for (let m = 1; m <= Math.max(1, att.splash || 1); m++) r.push(killRate(att, def, m, opts));
  return r;
}
const rateFor = (rates, enemies) => rates[Math.max(1, Math.min(rates.length - 1, enemies))];

// ---- 1. Lanchester ------------------------------------------------------------------------
// dA/dt = -lambda_B * B,  dB/dt = -lambda_A * A   (everyone engaged: the square law)
// Integrated with Runge-Kutta 4 so the splash cap (targets <= enemies left) can be included.
export function lanchester(A, B, opts = {}, rates = null, dt = 0.05, tMax = 3600) {
  const rA = rates ? rates.A : killRates(A, B, opts), rB = rates ? rates.B : killRates(B, A, opts);
  const f = (a, b) => [-rateFor(rB, Math.ceil(a)) * Math.max(0, b), -rateFor(rA, Math.ceil(b)) * Math.max(0, a)];
  let a = A.men, b = B.men, t = 0;
  const series = [{ t: 0, a, b }];
  let next = 1;
  // A side is beaten when less than half a soldier is left: the smooth curves never reach zero
  // in an even fight, but real soldiers come in whole numbers.
  const END = 0.5;
  while (a > END && b > END && t < tMax) {
    const k1 = f(a, b), k2 = f(a + dt / 2 * k1[0], b + dt / 2 * k1[1]);
    const k3 = f(a + dt / 2 * k2[0], b + dt / 2 * k2[1]), k4 = f(a + dt * k3[0], b + dt * k3[1]);
    const na = a + dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    const nb = b + dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    if (na <= END || nb <= END) { // finish where the first side crosses the line
      const sa = na <= END ? (a - END) / (a - na) : Infinity, sb = nb <= END ? (b - END) / (b - nb) : Infinity, s = Math.min(sa, sb);
      const ea = sa === s ? 0 : a + s * (na - a), eb = sb === s ? 0 : b + s * (nb - b);
      a = Math.max(0, ea); b = Math.max(0, eb); t += s * dt;
      break;
    }
    a = na; b = nb; t += dt;
    if (t >= next) { series.push({ t, a, b }); next += 1; }
  }
  series.push({ t, a, b });
  const stalled = t >= tMax;
  // The square law verdict (exact for this ODE when neither side splashes).
  const strengthA = rA[1] * A.men * A.men, strengthB = rB[1] * B.men * B.men;
  return { series, duration: stalled ? Infinity : t, survA: a, survB: b,
    winner: stalled ? 'none' : (b <= 0 && a > 0 ? 'A' : a <= 0 && b > 0 ? 'B' : 'tie'),
    strengthA, strengthB, rA, rB };
}

// ---- 2. Markov chain on the head counts ---------------------------------------------------
// The plain chain: state (i, j) = soldiers alive, one B dies at rate lambda_A * i, one A dies at
// rate lambda_B * j. Its waiting times are exponential (memoryless), far more random than real
// kills, so it makes fights look closer than they are.
// The correction (Erlang stages): each soldier is worth c steps, each step exponential at c times
// the rate. A kill then takes the same average time but its variance shrinks by c. c is chosen
// as 1 / cv2 of the real time to kill, so the chain's randomness matches the duel model's.
// stages = false gives the plain chain (c = 1).
const STATE_CAP = 1.5e6;
export function markov(A, B, opts = {}, rates = null, stages = true) {
  const rA = rates ? rates.A : killRates(A, B, opts), rB = rates ? rates.B : killRates(B, A, opts);
  let cA = 1, cB = 1;
  if (stages) { // B's soldiers are killed by A: their stage count comes from A's kill-time spread
    const sA = killStats(A, B, Math.max(1, Math.min(A.splash || 1, B.men)), opts);
    const sB = killStats(B, A, Math.max(1, Math.min(B.splash || 1, A.men)), opts);
    cB = Math.max(1, Math.min(400, Math.round(1 / sA.cv2)));
    cA = Math.max(1, Math.min(400, Math.round(1 / sB.cv2)));
    while ((A.men * cA + 1) * (B.men * cB + 1) > STATE_CAP && (cA > 1 || cB > 1)) {
      if (cA * A.men >= cB * B.men && cA > 1) cA = Math.max(1, Math.floor(cA * 0.8)); else cB = Math.max(1, Math.floor(cB * 0.8));
    }
  }
  const X = A.men * cA, Y = B.men * cB, W = Y + 1;
  const prob = new Float64Array((X + 1) * (Y + 1));
  prob[X * W + Y] = 1;
  const survA = new Float64Array(A.men + 1), survB = new Float64Array(B.men + 1);
  let meanT = 0, stuck = 0;
  for (let s = X + Y; s >= 1; s--) {
    for (let x = Math.min(X, s); x >= 0; x--) {
      const y = s - x;
      if (y < 0 || y > Y) continue;
      const P = prob[x * W + y];
      if (!P) continue;
      const i = Math.ceil(x / cA), j = Math.ceil(y / cB); // soldiers alive
      if (x === 0) { survB[j] += P; continue; }
      if (y === 0) { survA[i] += P; continue; }
      const toB = rateFor(rA, j) * i * cB, toA = rateFor(rB, i) * j * cA, r = toB + toA;
      if (r <= 0) { stuck += P; continue; }
      meanT += P / r; // the average stay in this state is 1 / r
      prob[x * W + y - 1] += P * toB / r;
      prob[(x - 1) * W + y] += P * toA / r;
    }
  }
  let winA = 0, winB = 0, eA = 0, eB = 0;
  for (let i = 1; i <= A.men; i++) { winA += survA[i]; eA += i * survA[i]; }
  for (let j = 1; j <= B.men; j++) { winB += survB[j]; eB += j * survB[j]; }
  return { winA, winB, stuck, survA, survB, meanSurvA: winA ? eA / winA : 0, meanSurvB: winB ? eB / winB : 0,
    meanDuration: stuck > 1e-9 ? Infinity : meanT, rA, rB, cA, cB };
}

// ---- 3. Soldier-by-soldier simulation -----------------------------------------------------
// Every soldier swings once per attack interval. With stagger on, each soldier's first swing is
// at a random moment inside its first interval (a real unit does not swing in unison).
// Swings at the same instant resolve together, as in the duel.
export function simulateUnits(A, B, opts = {}, rand = Math.random, sampleDt = 1, tMax = 3600) {
  const lim = opts.limits || null, md = !!opts.minDamage, stick = (opts.targeting || 'stick') === 'stick';
  const stagger = opts.stagger !== false;
  const side = (U, E) => {
    const n = U.men, hp = new Float64Array(n).fill(U.hp);
    const alive = Array.from({ length: n }, (_, i) => i), pos = Int32Array.from(alive);
    const off = Array.from({ length: n }, () => (stagger ? rand() * U.interval : 0));
    const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => off[x] - off[y]);
    return { U, n, hp, alive, pos, off, order, ptr: 0, cycle: 0, target: new Int32Array(n).fill(-1),
      p: hitChance(U.attack, E.defence, lim) };
  };
  const SA = side(A, B), SB = side(B, A);
  const nextTime = (S) => S.off[S.order[S.ptr]] + S.cycle * S.U.interval;
  const advance = (S) => { S.ptr++; if (S.ptr === S.n) { S.ptr = 0; S.cycle++; } };
  const remove = (S, x) => { const k = S.pos[x]; const last = S.alive.pop(); if (last !== x) { S.alive[k] = last; S.pos[last] = k; } S.pos[x] = -1; };

  const swing = (S, E, x) => {
    if (E.alive.length === 0) return;
    const m = Math.min(S.U.splash || 1, E.alive.length);
    let primary = stick ? S.target[x] : -1;
    if (primary < 0 || E.pos[primary] < 0) { primary = E.alive[Math.floor(rand() * E.alive.length)]; S.target[x] = primary; }
    const targets = [primary];
    while (targets.length < m) { // other soldiers in the hit area: distinct, at random
      const y = E.alive[Math.floor(rand() * E.alive.length)];
      if (!targets.includes(y)) targets.push(y);
    }
    for (const y of targets) {
      if (rand() < S.p) E.hp[y] -= rollDamage(S.U.base / m, S.U.ap / m, E.U.armour, rand, md);
    }
  };

  const samples = [{ t: 0, a: SA.n, b: SB.n }];
  let nextSample = sampleDt, t = 0;
  while (SA.alive.length && SB.alive.length) {
    // Compare times in tenths exactly as computed: converting to seconds and back can change the
    // last bit of a float, and then no soldier would match the current moment (an endless loop).
    const tt = Math.min(nextTime(SA), nextTime(SB));
    t = tt / 10;
    if (t > tMax) { t = Infinity; break; }
    while (nextSample < t) { samples.push({ t: nextSample, a: SA.alive.length, b: SB.alive.length }); nextSample += sampleDt; }
    const batchA = [], batchB = [];
    while (nextTime(SA) === tt) { batchA.push(SA.order[SA.ptr]); advance(SA); }
    while (nextTime(SB) === tt) { batchB.push(SB.order[SB.ptr]); advance(SB); }
    if (!batchA.length && !batchB.length) throw new Error('simulation clock did not advance'); // never silently spin
    for (const x of batchA) if (SA.pos[x] >= 0) swing(SA, SB, x);
    for (const x of batchB) if (SB.pos[x] >= 0) swing(SB, SA, x);
    for (const S of [SA, SB]) for (let k = S.alive.length - 1; k >= 0; k--) { const y = S.alive[k]; if (S.hp[y] <= 1e-9) remove(S, y); }
  }
  samples.push({ t, a: SA.alive.length, b: SB.alive.length });
  const a = SA.alive.length, b = SB.alive.length;
  return { winner: a && !b ? 'A' : b && !a ? 'B' : !a && !b ? 'tie' : 'none', duration: t, survA: a, survB: b, samples };
}

// Many simulated fights, summarised. Alive counts are averaged on a 1-second grid.
export function simulateMany(A, B, opts, runs, rand = Math.random) {
  const res = { A: 0, B: 0, tie: 0, none: 0, sumT: 0, ended: 0, survA: new Float64Array(A.men + 1), survB: new Float64Array(B.men + 1) };
  const G = 3601, curveA = new Float64Array(G), curveB = new Float64Array(G);
  let longest = 0;
  for (let r = 0; r < runs; r++) {
    const f = simulateUnits(A, B, opts, rand);
    res[f.winner]++;
    if (isFinite(f.duration)) { res.sumT += f.duration; res.ended++; }
    if (f.winner === 'A') res.survA[f.survA]++;
    if (f.winner === 'B') res.survB[f.survB]++;
    // samples[s] is the count at second s; after the last one the counts stay at the end state
    const last = f.samples.length - 1, end = f.samples[last];
    longest = Math.max(longest, last);
    for (let s = 0; s < G; s++) { const smp = s < last ? f.samples[s] : end; curveA[s] += smp.a; curveB[s] += smp.b; }
  }
  const len = Math.min(G, longest + 2);
  return { runs, winA: res.A / runs, winB: res.B / runs, tie: res.tie / runs, none: res.none / runs,
    meanDuration: res.ended ? res.sumT / res.ended : Infinity,
    meanSurvA: res.A ? res.survA.reduce((s, c, i) => s + c * i, 0) / res.A : 0,
    meanSurvB: res.B ? res.survB.reduce((s, c, i) => s + c * i, 0) / res.B : 0,
    survA: res.survA, survB: res.survB,
    curve: Array.from({ length: len }, (_, s) => ({ t: s, a: curveA[s] / runs, b: curveB[s] / runs })) };
}
