#!/usr/bin/env python3
r"""Summarise the fights between Swordsmen VARIANTS (test pack of 2026-11-28).

  python check\variants_report.py <log> [first line to read]

Variants (all with the Swordsmen's weapon, armour 30, attack interval 4.3 s):
  sw    120 soldiers, 69 health, attack 32, defence 32
  s60    60 soldiers            s160  160 soldiers
  elite attack 47, defence 47   tough 138 health
One line per group of equal fights, then the detail a rule must reproduce:
  fighters   = health the OTHER side loses per second / what one fighting soldier of this side
               deals per second against that enemy in the duel model. Deep phase only: both
               sides still have half their soldiers or more, first 20 s left out.
  wounds     = health missing from the LIVING soldiers of a side in the deep phase.
"""
import re
import statistics as st
import sys
from collections import defaultdict

import analyze_fights as A

UNITS = {
    "sw": dict(men=120, hp=69, ma=32, md=32),
    "s60": dict(men=60, hp=69, ma=32, md=32),
    "s160": dict(men=160, hp=69, ma=32, md=32),
    "elite": dict(men=120, hp=69, ma=47, md=47),
    "tough": dict(men=120, hp=138, ma=32, md=32),
    "first": dict(men=120, hp=69, ma=32, md=32),
}
MEAN_DMG = 7 + 21 * (1 - 0.75 * 0.30)
END = re.compile(r"END t=[\d.]+ case (\d+) (\d+)v(\d+) both=(\w+)(?: ctl=(\w+))? lasted=([\d.]+) P_men=(\d+) P_hp=([\d.]+) E_men=(\d+) E_hp=([\d.]+) winner=(\w+)(?: pu=(\w+) eu=(\w+))?")


def dps(att, dfn):
    """Health per second one fighting soldier of att deals to dfn (duel model, no 8%-90% limits)."""
    p = min(1.0, max(0.0, (35 + att["ma"] - dfn["md"]) / 100))
    return p * MEAN_DMG / 4.3


def deep(f, P, E, win=20):
    rp, re_ = f["P"], f["E"]
    if not rp or not re_:
        return None
    t0 = next((r[0] for r in rp if r[4]), rp[0][0])
    end = min(rp[-1][0], re_[-1][0])
    hp_p, hp_e = P["men"] * P["hp"], E["men"] * E["hp"]
    fp, fe, wp, we, t = [], [], [], [], t0 + win
    while t + win <= end:
        p0, p1, e0, e1 = A.at(rp, t), A.at(rp, t + win), A.at(re_, t), A.at(re_, t + win)
        if p0[1] < P["men"] / 2 or e0[1] < E["men"] / 2:
            break
        fp.append((e0[2] - e1[2]) * hp_e / win / dps(P, E))
        fe.append((p0[2] - p1[2]) * hp_p / win / dps(E, P))
        wp.append(p0[1] * P["hp"] - p0[2] * hp_p)
        we.append(e0[1] * E["hp"] - e0[2] * hp_e)
        t += win
    if not fp:
        return None
    return st.mean(fp), st.mean(fe), st.mean(wp), st.mean(we)


def main():
    lines = open(sys.argv[1], encoding="utf-8", errors="replace").read().splitlines()
    start = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    lines = lines[start - 1:]
    # fights that ran side by side write " lane=<n>" at the end of each line: read each lane apart
    lane_of = re.compile(r" lane=(\d+)\s*$")
    by_lane = defaultdict(list)
    for l in lines:
        m = lane_of.search(l)
        by_lane[m.group(1) if m else "-"].append(l)
    ends, fights = [], []
    for lane in sorted(by_lane):
        ll = by_lane[lane]
        e = [m for m in (END.search(l) for l in ll if "END t=" in l) if m]
        fs = [f for f in A.fights(ll) if f["label"].startswith("case ")]
        if lane == "-" and not e:
            continue
        ends += e
        fights += fs[:len(e)]
    paired = sorted(zip(fights, ends), key=lambda fm: int(fm[1].group(1)))
    groups, order = defaultdict(list), []
    for f, m in paired:
        pu, eu = m.group(12) or "first", m.group(13) or "first"
        key = (pu, eu, int(m.group(2)), int(m.group(3)))
        if key not in groups:
            order.append(key)
        P, E = UNITS[pu], UNITS[eu]
        pm, em = int(m.group(7)), int(m.group(9))
        php, ehp = float(m.group(8)), float(m.group(10))
        win_p = pm > em
        w_men, w_hp, W = (pm, php, P) if win_p else (em, ehp, E)
        groups[key].append(dict(d=deep(f, P, E), lasted=float(m.group(6)), win_p=win_p, w_men=w_men,
                                w_hp=w_hp * 100, per=w_hp * W["men"] * W["hp"] / max(1, w_men), w_share=w_men / W["men"] * 100))
    print(f"{len(fights)} fights read, {len(ends)} finished\n")
    print("ours v enemy (files)        | n | wins ours-enemy | seconds | winner: soldiers left          | % of its soldiers | % of its health | health per survivor")
    for key in order:
        g = groups[key]
        wp = sum(1 for x in g if x["win_p"])
        print(f"{key[0]:5s} v {key[1]:5s} ({key[2]:2d} v {key[3]:2d})     | {len(g)} | {wp} - {len(g) - wp}           | {st.mean(x['lasted'] for x in g):6.0f}  | {str(sorted(x['w_men'] for x in g)):30s} | {st.mean(x['w_share'] for x in g):5.0f}             | {st.mean(x['w_hp'] for x in g):5.1f}           | {st.mean(x['per'] for x in g):4.0f}")
    print("\ndeep phase (both sides at half their soldiers or more)")
    print("ours v enemy (files)        | fighters ours / enemy | wounds on the living, ours / enemy | hit chance ours / enemy (duel model)")
    for key in order:
        ds = [x["d"] for x in groups[key] if x["d"]]
        if not ds:
            print(f"{key[0]:5s} v {key[1]:5s} ({key[2]:2d} v {key[3]:2d})     | no deep phase long enough")
            continue
        P, E = UNITS[key[0]], UNITS[key[1]]
        print(f"{key[0]:5s} v {key[1]:5s} ({key[2]:2d} v {key[3]:2d})     | {st.mean(d[0] for d in ds):5.1f} / {st.mean(d[1] for d in ds):5.1f}         | {st.mean(d[2] for d in ds):6.0f} / {st.mean(d[3] for d in ds):6.0f}                    | {35 + P['ma'] - E['md']}% / {35 + E['ma'] - P['md']}%")


if __name__ == "__main__":
    main()
