#!/usr/bin/env python3
r"""Read zz_duel_test_log.txt (the test pack's log) and turn each fight into numbers.

For every fight (from a "GO" line to the next "MARK"/"SETUP" or the end): the health each unit
loses per second, divided by what ONE fighting soldier deals per second in the duel model,
= the number of soldiers effectively fighting. Swordsmen against Swordsmen (test pack stats).

  python check\analyze_fights.py <log> [first line to read, default 1]
"""
import re
import sys

MEN, HP1 = 120, 69
HP = MEN * HP1
P_HIT = 0.35
MEAN_DMG = 7 + 21 * (1 - 0.75 * 0.30)      # AP 7 + base 21 against 30 armour (average block 22.5%)
DPS = P_HIT * MEAN_DMG / 4.3               # health per second from one fighting soldier
ROW = re.compile(r"ROW t=([\d.]+) side=(.) .* men=(\d+)/\d+ hp=([\d.]+) width=([\d.]+) .* melee=(\d)")


def fights(lines):
    cur, label, setup = None, "?", ""
    for l in lines:
        if "new battle session" in l or "END t=" in l:   # a new battle, or the queue ended this fight (the units respawn next)
            if cur:
                yield cur
                cur = None
        elif "MARK t=" in l:
            label = l.split("MARK t=", 1)[1].split(" ", 1)[1].strip()
        elif "SETUP t=" in l:
            setup = l.split("SETUP t=", 1)[1].strip()
            if cur:
                yield cur
                cur = None
        elif "GO t=" in l:
            if cur:
                yield cur
            cur = {"label": label, "setup": setup, "go": float(re.search(r"GO t=([\d.]+)", l).group(1)),
                   "both": "both=true" in l, "P": [], "E": []}
        elif cur:
            m = ROW.search(l)
            if m:
                cur[m.group(2)].append((float(m.group(1)), int(m.group(3)), float(m.group(4)), float(m.group(5)), int(m.group(6))))
    if cur:
        yield cur


def at(rows, t):
    return min(rows, key=lambda r: abs(r[0] - t))


def report(f, win=20):
    P, E = f["P"], f["E"]
    if not P or not E:
        return
    t0 = next((r[0] for r in P if r[4]), P[0][0])
    end = min(P[-1][0], E[-1][0])
    print(f"\n=== {f['label']}   (both attack: {f['both']})")
    print(f"    {f['setup'][:150]}")
    print(f"    contact at t={t0:.0f}, rows until t={end:.0f} ({end - t0:.0f} s of fighting), width logged {P[0][3]:.1f} / {E[0][3]:.1f} m")
    print("    seconds   soldiers P / E | fighters of P | fighters of E")
    steady_p, steady_e = [], []
    t = t0
    while t + win <= end:
        p0, p1, e0, e1 = at(P, t), at(P, t + win), at(E, t), at(E, t + win)
        fp = (e0[2] - e1[2]) * HP / win / DPS      # damage on E comes from P's fighters
        fe = (p0[2] - p1[2]) * HP / win / DPS
        deep = min(p0[1], e0[1]) >= 60
        if deep and t > t0:                         # steady state: skip the first window, both units still deep
            steady_p.append(fp); steady_e.append(fe)
        print(f"    {t - t0:3.0f}-{t - t0 + win:3.0f}   {p0[1]:4d} / {e0[1]:4d}    | {fp:6.1f}        | {fe:6.1f}" + ("" if deep else "   (a unit below 60)"))
        t += win
    if steady_p:
        print(f"    steady state (both 60+, first {win} s left out): fighters of P {sum(steady_p) / len(steady_p):.1f}, of E {sum(steady_e) / len(steady_e):.1f}, both {(sum(steady_p) + sum(steady_e)) / (2 * len(steady_p)):.1f}")
    p0, e0 = at(P, t0), at(E, t0)
    p1, e1 = at(P, t0 + 10), at(E, t0 + 10)
    print(f"    first 10 s: fighters of P {(e0[2] - e1[2]) * HP / 10 / DPS:.1f}, of E {(p0[2] - p1[2]) * HP / 10 / DPS:.1f}")
    pl, el = P[-1], E[-1]
    print(f"    last row: P {pl[1]} soldiers, {pl[2] * 100:.2f}% health | E {el[1]} soldiers, {el[2] * 100:.2f}% health")


def main():
    lines = open(sys.argv[1], encoding="utf-8", errors="replace").read().splitlines()
    start = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    print(f"duel model: hit chance {P_HIT:.2f}, mean damage {MEAN_DMG:.2f}, one fighting soldier deals {DPS:.3f} health/s")
    for f in fights(lines[start - 1:]):
        report(f)


if __name__ == "__main__":
    main()
