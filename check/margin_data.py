#!/usr/bin/env python3
r"""What the logged fights say about the winner's margin (even 20 v 20 fights, both attack).

  python check\margin_data.py <log> [<log> ...]

Prints four things, each with the number a rule simulation must reproduce
(check\margin_sim.mjs prints the same four for each candidate rule):
  A. the end of the fight: the winner's soldiers, health, and health per living soldier
  B. health per living soldier while the unit shrinks (how wounds are spread)
  C. the lead (difference between the sides) at fixed points of the fight
  D. the noise of the damage per 20 s window while both units are deep, and whether
     one window's advantage carries over to the next
"""
import re
import statistics as st
import sys

import analyze_fights as A

HP1, MEN = 69, 120
HP = HP1 * MEN
END = re.compile(r"END t=[\d.]+ case (\d+) (\d+)v(\d+) both=(\w+)(?: ctl=(\w+))? lasted=([\d.]+) P_men=(\d+) P_hp=([\d.]+) E_men=(\d+) E_hp=([\d.]+) winner=(\w+)")


def load(paths):
    out = []
    for p in paths:
        lines = open(p, encoding="utf-8", errors="replace").read().splitlines()
        ends = [m for m in (END.search(l) for l in lines if "END t=" in l) if m]
        fs = [f for f in A.fights(lines) if f["label"].startswith("case ")]
        for f, m in zip(fs, ends):
            if m.group(2) == "20" and m.group(3) == "20" and m.group(4) == "true" and f["P"] and f["E"]:
                f["end"] = dict(pm=int(m.group(7)), php=float(m.group(8)), em=int(m.group(9)), ehp=float(m.group(10)), lasted=float(m.group(6)))
                out.append(f)
    return out


def q(xs, p):
    xs = sorted(xs)
    return xs[int(p * (len(xs) - 1))]


def series(f):
    """Per second from first contact: (t, P men, P health, E men, E health), health in points."""
    P, E = f["P"], f["E"]
    t0 = next((r[0] for r in P if r[4]), P[0][0])
    e_by_t = {round(r[0]): r for r in E}
    rows = []
    for r in P:
        e = e_by_t.get(round(r[0]))
        if e and r[0] >= t0:
            rows.append((r[0] - t0, r[1], r[2] * HP, e[1], e[2] * HP))
    return rows


def main():
    fs = load(sys.argv[1:])
    print(f"{len(fs)} even 20 v 20 fights, both attack")

    # ---- A. the end
    wm, wh, per, lm = [], [], [], []
    for f in fs:
        e = f["end"]
        w = (e["pm"], e["php"]) if e["pm"] > e["em"] else (e["em"], e["ehp"])
        wm.append(w[0]); wh.append(w[1] * 100); per.append(w[1] * HP / w[0])
    print("\nA. THE END (one side at 2 soldiers)")
    print(f"   winner's soldiers left      25% {q(wm, .25)}  median {q(wm, .5)}  75% {q(wm, .75)}   mean {st.mean(wm):.1f}")
    print(f"   winner's health left, %     25% {q(wh, .25):.1f}  median {q(wh, .5):.1f}  75% {q(wh, .75):.1f}   mean {st.mean(wh):.1f}")
    print(f"   health per living soldier   25% {q(per, .25):.0f}  median {q(per, .5):.0f}  75% {q(per, .75):.0f}   (a fresh soldier has {HP1})")
    print(f"   seconds                     median {q([f['end']['lasted'] for f in fs], .5):.0f}")

    # ---- B. health per living soldier against soldiers alive (both sides pooled)
    print("\nB. WOUNDS WHILE THE UNIT SHRINKS (both sides of every fight)")
    print("   soldiers alive | health per living soldier | health missing from the living, whole unit")
    bins = {}
    for f in fs:
        for _, pm, ph, em, eh in series(f):
            for m, h in ((pm, ph), (em, eh)):
                if m > 0:
                    bins.setdefault(min(m // 10 * 10, 110), []).append((h / m, m * HP1 - h))
    for b in sorted(bins, reverse=True):
        v = bins[b]
        print(f"   {b:3d}-{b + 9:3d}        | {st.mean(x[0] for x in v):5.1f}                     | {st.mean(x[1] for x in v):6.0f}")

    # ---- C. the lead at fixed points: when both sides together have lost N soldiers / H health
    print("\nC. THE LEAD DURING THE FIGHT (absolute difference between the sides)")
    print("   soldiers lost by both | lead in soldiers: mean, 75% | lead in health points: mean | seconds")
    for lost in (20, 40, 80, 120, 160, 200, 220):
        dm, dh, ts = [], [], []
        for f in fs:
            for t, pm, ph, em, eh in series(f):
                if 2 * MEN - pm - em >= lost:
                    dm.append(abs(pm - em)); dh.append(abs(ph - eh)); ts.append(t)
                    break
        if dm:
            print(f"   {lost:4d}  (n={len(dm):2d})          | {st.mean(dm):5.1f}  {q(dm, .75):3d}               | {st.mean(dh):6.0f}                    | {st.mean(ts):4.0f}")
    print("   health lost by both, % of both units | lead in health points: mean, 75%")
    for share in (0.2, 0.4, 0.6, 0.8, 0.9):
        dh = []
        for f in fs:
            for t, pm, ph, em, eh in series(f):
                if 2 * HP - ph - eh >= share * 2 * HP:
                    dh.append(abs(ph - eh))
                    break
        if dh:
            print(f"   {share * 100:3.0f}  (n={len(dh):2d})                           | {st.mean(dh):6.0f}  {q(dh, .75):6.0f}")

    # ---- D. noise of the damage per 20 s window, both units 60+
    print("\nD. DAMAGE PER 20 s WINDOW WHILE BOTH UNITS HAVE 60+ SOLDIERS (first 20 s left out)")
    dmg, pairs, diffs = [], [], []
    for f in fs:
        s = series(f)
        by_t = {round(r[0]): r for r in s}
        prev = None
        t = 20
        while t + 20 in by_t and t in by_t:
            a, b = by_t[t], by_t[t + 20]
            if min(a[1], a[3]) < 60:
                break
            dp, de = a[2] - b[2], a[4] - b[4]      # health lost by P, by E in the window
            dmg += [dp, de]
            d = de - dp                             # P's advantage in this window
            diffs.append(d)
            if prev is not None:
                pairs.append((prev, d))
            prev = d
            t += 20
    m, sd = st.mean(dmg), st.pstdev(dmg)
    print(f"   {len(dmg)} side-windows: mean {m:.0f} health, standard deviation {sd:.0f}")
    hits = m / 23.28
    print(f"   independent hits would give: about {hits:.1f} hits of 23.3, standard deviation {23.3 * (hits * 0.65) ** 0.5:.0f} (fixed swing rhythm) to {23.3 * hits ** 0.5:.0f} (random rhythm)")
    print(f"   advantage of one side per window: standard deviation {st.pstdev(diffs):.0f}")
    if len(pairs) > 5:
        xs, ys = [p[0] for p in pairs], [p[1] for p in pairs]
        mx, my = st.mean(xs), st.mean(ys)
        r = sum((x - mx) * (y - my) for x, y in pairs) / (sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys)) ** 0.5
        print(f"   does a window's advantage carry into the next window? correlation {r:+.2f} over {len(pairs)} pairs (0 = no memory; chance alone gives about +-{2 / len(pairs) ** 0.5:.2f})")


if __name__ == "__main__":
    main()
