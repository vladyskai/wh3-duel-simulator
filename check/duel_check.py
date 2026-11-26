import math, random
from math import comb

# Times are integers in tenths of a second, so "same instant" is exact.

def hit_p(ma, md_other):
    return min(1.0, max(0.0, (35 + ma - md_other) / 100))

def pmf(k, p, nmax):
    return [0.0] * k + [comb(n - 1, k - 1) * p**k * (1 - p)**(n - k) for n in range(k, nmax + 1)]

def duel_exact(A, B, nmax=1500):
    pA, pB = hit_p(A["ma"], B["md"]), hit_p(B["ma"], A["md"])
    kA, kB = math.ceil(B["hp"] / A["dmg"]), math.ceil(A["hp"] / B["dmg"])
    a, b = A["iv"], B["iv"]                      # tenths of a second
    fA, fB = pmf(kA, pA, nmax), pmf(kB, pB, nmax)
    SB = [0.0] * (nmax + 2)                      # SB[m] = P(N_B > m)
    for m in range(nmax, -1, -1):
        SB[m] = SB[m + 1] + (fB[m + 1] if m + 1 <= nmax else 0.0)
    winA = tie = 0.0
    for n in range(1, nmax + 1):
        if fA[n] == 0.0:
            continue
        t = a * (n - 1)                          # A's n-th swing lands at t
        m = t // b + 1                           # B swings at times <= t
        if m > nmax:
            continue
        winA += fA[n] * SB[m]                    # B not finished by t
        if t % b == 0:                           # B also swings exactly at t
            tie += fA[n] * fB[m]                 # and that swing is B's kill
    # mean duration: E[T] = sum over t of P(T > t) on the swing grid
    return dict(pA=pA, pB=pB, kA=kA, kB=kB, winA=winA, tie=tie, winB=1 - winA - tie)

def duel_sim(A, B, trials=200000, seed=2):
    rng = random.Random(seed)
    pA, pB = hit_p(A["ma"], B["md"]), hit_p(B["ma"], A["md"])
    w = {"A": 0, "B": 0, "tie": 0}
    for _ in range(trials):
        ha, hb, ta, tb = A["hp"], B["hp"], 0, 0
        while ha > 0 and hb > 0:
            t = min(ta, tb)
            sa, sb = ta == t, tb == t
            if sa and rng.random() < pA: hb -= A["dmg"]
            if sb and rng.random() < pB: ha -= B["dmg"]
            if sa: ta += A["iv"]
            if sb: tb += B["iv"]
        w["tie" if ha <= 0 and hb <= 0 else ("A" if hb <= 0 else "B")] += 1
    return {k: round(v / trials, 4) for k, v in w.items()}

A = dict(ma=45, md=25, dmg=25, hp=100, iv=40)
B = dict(ma=30, md=30, dmg=40, hp=120, iv=40)
e = duel_exact(A, B)
print("equal 4.0/4.0 :", round(e["winA"], 4), round(e["tie"], 4), round(e["winB"], 4), "(round-based model: 0.2341 0.0742 0.6917)")
for ia, ib in [(40, 43), (32, 51), (38, 40), (20, 40)]:
    A["iv"], B["iv"] = ia, ib
    e = duel_exact(A, B)
    print(f"A {ia/10}s B {ib/10}s exact:", round(e["winA"], 4), round(e["tie"], 4), round(e["winB"], 4), " sim:", duel_sim(A, B))
