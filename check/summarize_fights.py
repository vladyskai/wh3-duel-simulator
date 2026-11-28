#!/usr/bin/env python3
r"""Summarise every queued fight of a test log: one line per group of equal cases.

  python check\summarize_fights.py <log> [first line to read]

Uses analyze_fights.py for the reading. "Fighters" = health lost per second by the OTHER side,
divided by what one fighting soldier deals per second in the duel model, averaged over the
part of the fight where both units still have 60 soldiers or more (first 20 s left out).
"""
import re
import sys
from collections import defaultdict

import analyze_fights as A

END = re.compile(r"END t=[\d.]+ case (\d+) (\d+)v(\d+) both=(\w+)(?: ctl=(\w+))? lasted=([\d.]+) P_men=(\d+) P_hp=([\d.]+) E_men=(\d+) E_hp=([\d.]+) winner=(\w+)")


def steady(f, win=20):
    P, E = f["P"], f["E"]
    if not P or not E:
        return None
    t0 = next((r[0] for r in P if r[4]), P[0][0])
    end = min(P[-1][0], E[-1][0])
    fp, fe, t = [], [], t0 + win
    while t + win <= end:
        p0, p1, e0, e1 = A.at(P, t), A.at(P, t + win), A.at(E, t), A.at(E, t + win)
        if min(p0[1], e0[1]) < 60:
            break
        fp.append((e0[2] - e1[2]) * A.HP / win / A.DPS)
        fe.append((p0[2] - p1[2]) * A.HP / win / A.DPS)
        t += win
    if not fp:
        return None
    return sum(fp) / len(fp), sum(fe) / len(fe)


def main():
    lines = open(sys.argv[1], encoding="utf-8", errors="replace").read().splitlines()
    start = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    lines = lines[start - 1:]
    ends = [END.search(l) for l in lines if "END t=" in l]
    ends = [m for m in ends if m]
    fights = [f for f in A.fights(lines) if f["label"].startswith("case ")]
    groups = defaultdict(list)
    for f, m in zip(fights, ends):
        st = steady(f)
        key = (int(m.group(2)), int(m.group(3)), m.group(4), m.group(5) or "enemy")
        groups[key].append(dict(st=st, lasted=float(m.group(6)), pm=int(m.group(7)), php=float(m.group(8)),
                                em=int(m.group(9)), ehp=float(m.group(10)), win=m.group(11)))
    print(f"{len(fights)} fights read, {len(ends)} finished")
    print("ours v enemy  both  control | n | fighters ours / enemy | seconds to 2 left | wins ours-enemy | winner's soldiers left")
    for key in sorted(groups):
        g = groups[key]
        sts = [x["st"] for x in g if x["st"]]
        fp = sum(s[0] for s in sts) / len(sts) if sts else float("nan")
        fe = sum(s[1] for s in sts) / len(sts) if sts else float("nan")
        wp = sum(1 for x in g if x["win"] == "P")
        left = sorted(max(x["pm"], x["em"]) for x in g)
        print(f"{key[0]:4d} v {key[1]:<4d}   {key[2]:5s} {key[3]:6s} | {len(g):2d} | {fp:6.1f} / {fe:5.1f}       | {sum(x['lasted'] for x in g) / len(g):7.1f}           | {wp:2d} - {len(g) - wp:<2d}         | {left}")


if __name__ == "__main__":
    main()
