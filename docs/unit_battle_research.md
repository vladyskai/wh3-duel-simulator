# Unit against unit: what is known before building the stage

Research of 2026-11-27. Game data: patch 9.0.5, read from the game's own tables.

## The question

In a fight between two units, how many soldiers are fighting at each moment, and who fights whom?

## What the game's tables say

Table `_kv_rules` (the battle rule values, 276 rows; it also holds the 35 / 8 / 90 of the hit chance):

| Key | Value | Reading |
|---|---|---|
| `melee_hit_chance_base` / `_min` / `_max` | 35 / 8 / 90 | confirms the hit chance formula and its limits |
| `entity_action_attack_formed_combat_distance` | 2.5 | distance (metres) at which a soldier in formation attacks. ASSUMPTION: centre to centre |
| `max_range_for_attack_mode_local_attack` | 3 | a soldier looks for a target within 3 m |
| `melee_outnumbered_defence_penalty` | 1 | a melee defence penalty when outnumbered. ASSUMPTION: per extra attacker |
| `melee_defence_direction_penalty_coefficient_flank` / `_rear` | 0.6 / 0.3 | melee defence is multiplied by 0.6 from the flank, 0.3 from behind |
| `melee_defence_formed_attack_bonus` | 5 | a bonus tied to fighting in formation |
| `charge_decay_duration` | 13 | the charge bonus fades over 13 seconds |
| `melee_attack_interval` | 4 | the default attack interval (each weapon has its own) |

There is NO key for "how many soldiers may attack one enemy" or for a number of fighting ranks.
So the game does not use a fixed number: who fights is decided by positions (distance and facing).

Table `_kv_fatigue`: fighting adds 19 fatigue points per second (ASSUMPTION on the unit of
time), the levels start at 2,800 (active), 6,600 (winded), 12,600 (tired), 18,000 (very tired),
27,000 (exhausted). A fresh unit reaches "winded" after about 6 minutes of fighting, so a fight
of 2 minutes is barely touched by fatigue. The stat penalties per level are in another table,
not read yet.

## Sizes (Swordsmen)

Soldier radius 0.65 m. Formation spacing 1.48 m side to side, 1.6 m front to back. Default depth
6 ranks, so 120 soldiers stand 20 wide. Weapon length 1 m. Each attack hits 1 target (no splash).

Estimate from these numbers (not measured): two front ranks in contact stand about 1.3 m apart.
A front-rank soldier has 3 enemies within 2.5 m (the one in front and one on each side). His own
second rank is about 2.9 m from the enemy front rank, out of reach. So the estimate is:
**only the front rank fights, one opponent each, about 20 duels side by side for 120 against 120**.
This is an estimate from geometry. The game also lets soldiers break formation and fill gaps.

## What the mod's log records (checked in the code and in an archived log)

Every 2 seconds, one row per unit: soldiers alive and at start, health as a share of the unit's
total (2 decimals), formation width in metres, position, bearing, in melee yes/no, moving, routing.
Enough to draw the casualty curve of a fight. Limit: the health share has only 2 decimals.

## Test units

- The Laboratory (sliders for unit size and combat rules) was a Total War: WARHAMMER II mode
  (free update of December 2017). No source shows it in WARHAMMER III.
- No Workshop mod was found that clearly removes fatigue and charge for testing.
- The game has the unit attributes `fatigue_immune` and `unbreakable`, and the charge bonus is a
  plain column of the unit table. A small pack of our own can add a test copy of a unit with
  charge bonus 0, immune to fatigue and unbreakable. Not built: it needs the user's go-ahead
  (it would be one more pack of ours in the game's data folder).

## Sources

- Game tables `_kv_rules`, `_kv_fatigue`, `land_units`, `battle_entities`, `unit_spacings`,
  `melee_weapons`, `unit_attributes` (patch 9.0.5).
- The Laboratory FAQ, Creative Assembly: https://www.totalwar.com/?p=2264
- PC Gamer on the Laboratory (WARHAMMER II): https://www.pcgamer.com/total-war-warhammer-2s-laboratory-is-a-boss-fight-for-your-cpu

## The test pack (built 2026-11-27)

`zz_duel_test_units.pack` (type Mod, in the game's data folder; source and builder in the mod
project: `mod_source\duel_test\`, `tools\build_duel_test_pack.py`, `tools\check_duel_test_script.py`).
While ticked in the launcher:

- Empire Swordsmen: charge bonus 0, immune to fatigue, unbreakable. Nothing else changed.
- A battle script holds the enemy still (takes its units from the AI), writes
  `zz_duel_test_log.txt` next to the game (one row per unit per second: soldiers, health with
  4 decimals, width, position, in melee), and adds console commands (Lua Console, Shift+F3):
  `duel_setup(player_files, enemy_files, gap_m)`, `duel_go()`, `duel_go(true)`,
  `duel_hold(false)`, `duel_status()`, `duel_mark("text")`.

Not proven in the game yet: taking an AI unit under script control, the teleport with a width,
the attack order from the script. Each failure is written to the log as a `FAILED ...` line.

## Test cases (Swordsmen against Swordsmen, flat map, one unit each, no Lord)

Before each: `duel_mark("case N")`, then the setup line, then `duel_go(true)`. Let it run to the end.

| Case | Setup | What it shows |
|---|---|---|
| 1 | `duel_setup(20, 20)` | the baseline: 20 wide against 20 wide |
| 2 | `duel_setup(10, 10)` | half the width: if only the front fights, the kill rate halves |
| 3 | `duel_setup(40, 40)` | double the width, 3 ranks: the kill rate doubles if the front rule holds |
| 4 | `duel_setup(40, 10)` | wide against narrow: do the overlapping soldiers wrap around and join in |
| 5 | `duel_setup(20, 20)` then `duel_go()` | only we attack, the enemy stands: does a standing unit fight back the same |

## Fight 1 (2026-11-27): 20 wide against 20 wide, both attack. Log: `docs/battle_logs/fight1_20v20_2026-11-27.txt`

The script worked in the game: no FAILED line, the enemy was held, both units were placed and
ordered. The unit card showed "Unbreakable" and stayed "Fresh" to the end.

Duel model for one Swordsman hitting another: hit chance 35%, mean damage 23.28, one swing per
4.3 s, so 1.894 health per second per fighting soldier. Measured health lost per second, divided
by that, gives the number of soldiers effectively fighting:

| Seconds after contact | Soldiers (ours / enemy) | Fighters, ours | Fighters, enemy |
|---|---|---|---|
| 0 to 20 | 120 / 120 | 24.4 | 18.8 |
| 20 to 40 | 115 / 115 | 13.9 | 19.7 |
| 40 to 60 | 108 / 108 | 20.4 | 22.0 |
| 60 to 80 | 102 / 99 | 19.5 | 13.1 |
| 80 to 100 | 93 / 85 | 21.5 | 18.7 |
| 100 to 120 | 80 / 73 | 20.0 | 19.5 |
| 120 to 140 | 65 / 62 | 15.2 | 21.2 |
| 180 to 200 | 37 / 49 | 12.7 | 11.5 |
| 240 to 260 | 19 / 24 | 3.7 | 5.0 |
| 300 to 320 | 8 / 14 | 2.4 | 3.1 |

- While both units had 60 soldiers or more (the first 140 s), the average was 19.5 fighters per
  side. The formation was 20 wide. This matches "only the front rank fights, one opponent each".
- After 120 s the living soldiers averaged 59 health of 69. If the 20 in front are damaged and
  the rest untouched, the front ones average about 37: consistent with the same picture.
- Below about 3 ranks the number of fighters falls faster than the soldier count (19 against 24
  soldiers: only 4 to 5 fighting). The end of a fight is slower than the front-line rule says.
- Result: ours down to 1 soldier at 333 s after contact, the enemy had 12 left (5% of its health,
  34 health per living soldier on average).

One fight only: the width scaling and the overlap (fights 2 to 4) are not measured yet.

## The night batches (2026-11-28): 52 fights run by script, Swordsmen against Swordsmen

Run by Claude in the game (Crossroads - Multiplayer, no Lords, unlimited time, difficulty
Normal, AI stats slider in the middle). The test script's queue respawned both units before
each fight, placed them almost touching (front ranks 3 m apart), and stopped each fight when
one side was down to 2 soldiers. Logs: `docs/battle_logs/`. Tools: `check/analyze_fights.py`,
`check/summarize_fights.py`. No `FAILED` line in any log.

The ground is flat: 35 height samples over the 40 x 60 m fight area all read 577.31.

### Fighters follow the width of the formation

"Fighters" = the health one side loses per second, divided by what one fighting soldier deals
in the duel model (1.894 health/s), while both units still have 60 soldiers or more.

| Formation, ours v enemy | Fights | Fighters, ours / enemy | Seconds until one side has 2 left | Wins, ours - enemy | Winner's soldiers left |
|---|---|---|---|---|---|
| 10 v 10 | 3 | 12.2 / 11.9 | 378 | 2 - 1 | 12, 15, 30 |
| 20 v 20 (batch 1) | 8 | 19.6 / 19.8 | 269 | 2 - 6 | 6 to 37 |
| 20 v 20 (batch 2, enemy under script control) | 10 | 19.2 / 19.2 | 270 | 5 - 5 | 10 to 39 |
| 20 v 20 (both under script control) | 10 | 19.7 / 19.2 | 266 | 6 - 4 | 3 to 31 |
| 20 v 20 (neither under script control) | 6 | 19.3 / 19.3 | 253 | 3 - 3 | 10 to 42 |
| 30 v 30 | 2 | 25.8 / 26.5 | 219 | 1 - 1 | 24, 32 |
| 40 v 40 | 3 | 33.8 / 30.8 | 140 | 2 - 1 | 36, 38, 46 |
| 40 v 10 | 3 | 24.6 / 18.9 | 202 | 3 - 0 | 24, 35, 63 |
| 10 v 40 | 3 | 19.1 / 25.8 | 184 | 0 - 3 | 56, 57, 60 |
| 20 v 20, only ours ordered to attack | 2 | 18.5 / 17.6 | 273 | 1 - 1 | 13, 24 |

- Fighters per side against the width: 10 wide 12, 20 wide 19.5, 30 wide 26, 40 wide 32.
  A straight line fits: fighters = 5.4 + 0.68 x width. So not one fighter per file: a narrow
  formation gets a few extra (its ends), a wide one gets fewer than its width.
- The fight is even: over all 44 even fights with both attacking, ours won 21 and the enemy 23.
  The early run of enemy wins in the 20 v 20 group (8 of the first 10) was chance: the same
  setting repeated gave 5 - 5. Script control makes no difference (6 - 4, 5 - 5, 3 - 3).
- A unit that is only attacked fights back the same (18.5 / 17.6 fighters).
- Wide beats narrow, every time (6 of 6), keeping 24 to 63 soldiers. With 40 against 10 files
  the wide unit has about 25 fighters and the narrow one about 19: the narrow unit's flanks are
  wrapped, so more of its soldiers fight too, but the wide unit still deals about 30% more.

### How the fighters fall as the units shrink (20 v 20 fights, 20 s windows)

Rows: a side's own soldiers. Columns: the other side's soldiers. Cells: that side's fighters.

| own \ other | 0-19 | 20-39 | 40-59 | 60-79 | 80-99 | 100+ |
|---|---|---|---|---|---|---|
| 0-19 | 4.4 | 6.0 | | | | |
| 20-39 | 8.8 | 12.0 | 13.8 | | | |
| 40-59 | | 15.9 | 16.6 | 15.9 | | |
| 60-79 | | | 19.1 | 19.1 | 18.4 | |
| 80-99 | | | | 19.9 | 19.1 | 19.0 |
| 100+ | | | | | 21.7 | 20.0 |

- With 60 or more on both sides the fighters stay at the width (about 19 to 20).
- Below that they fall with BOTH sides' numbers. A rough fit for 20 wide:
  fighters = min(19.5, 0.54 x own^0.63 x other^0.28).
- The side that is ahead has more fighters than the side behind (15.9 against 13.8, 8.8 against
  6.0), so a lead grows.

### What a simple rule gets right and wrong (`check/unit_rule_sim.mjs`)

| | Seconds to 2 left (median) | Winner's soldiers left (quartiles) |
|---|---|---|
| Measured, 20 v 20, both attack | 260 | 11, 19, 27 |
| Rule "pairs only": 20 duels side by side, a dead soldier replaced at once | 255 | 6, 9, 14 |
| Rule "fitted fighters" (the fit above) | 308 | 8, 13, 19 |

The length of the fight is within about 5% to 20% of the measurement. The winner's margin is
not: in the game the winner keeps about twice as many soldiers as the pairs rule gives. The real
fight is more decisive than either rule. NOT explained yet. Candidates, none tested: who gets hit
(damage may concentrate on fewer soldiers than "a random front soldier"), the outnumbered and
flank defence penalties of the rule table, soldiers arriving in the front already hurt.

### The three candidates, tested (2026-11-28, `check/margin_data.py`, `check/margin_sim.mjs`)

No new fights: the 42 even 20 v 20 logs already hold health AND soldiers every second, which
is enough. Every rule in the simulation is first scaled to the measured speed (722 health lost
per side per 20 s while both units have 60+ soldiers), so rules differ only in who is hit.

| | Seconds | Winner's soldiers (quartiles) | Winner's health | Health per survivor | Health missing from the living (60 to 99 alive) | Lead in health at 80 / 160 / 200 soldiers lost |
|---|---|---|---|---|---|---|
| Measured | 258 | 11, 19, 25 | 8.0% | 41 | 889 | 245 / 388 / 499 |
| Fitted fighters, hit a random front soldier | 303 | 7, 12, 17 | 8.3% | 58 | 526 | 251 / 366 / 483 |
| 1. Hits focus on the most hurt front soldier | 314 | 8, 12, 17 | 9.7% | 67 | 26 | 235 / 366 / 506 |
| 3. Hits spread over the first 30 soldiers | 278 | 11, 17, 24 | 6.8% | 34 | 790 | 259 / 385 / 491 |
| 3. Hits spread over the first 40 soldiers | 270 | 11, 18, 25 | 6.7% | 31 | 1051 | 268 / 386 / 476 |
| 3. Hit zone = 1.75 x the fighters (shrinks with the unit) | 288 | 8, 13, 18 | 7.5% | 48 | 920 | 265 / 375 / 483 |
| 2. The side ahead deals more, (own/other)^0.25 | 262 | 14, 21, 28 | 15.3% | 59 | 525 | 280 / 526 / 825 |

- **The fight is NOT more decisive in health.** The winner keeps 8.0% of its health, and the
  plain rule gives 8.3%. The lead in health during the fight matches too. The gap was in the
  COUNT of soldiers: the game's survivors carry more wounds (41 health each, not 58), so the
  same health is spread over more living soldiers. The sentence above ("the real fight is more
  decisive") was wrong.
- **Candidate 1 (hits concentrate): rejected.** The living soldiers of a deep unit miss about
  890 health together. Concentrated hits would leave about 26. The truth is the opposite.
- **Candidate 3 (wounded soldiers beyond the fighters): confirmed.** 890 health missing is what
  about 30 to 35 soldiers in the hit zone give, against 19.5 fighters. The logs cannot tell
  whether hits land on the second rank or hurt soldiers change places with fresh ones.
- **Candidate 2 (outnumbered / flank penalties): rejected as an extra effect.** Any bonus for
  the side ahead, on top of the measured fighters, makes the health lead far too large (825
  against 499). What exists of it is already inside the fitted fighters.
- **The noise is plain.** Damage per 20 s window: one side's advantage has a standard deviation
  of 153, which is 108 per side, and independent hits give 105 to 130. A window's advantage
  does not carry into the next one (correlation -0.03 over 201 pairs).
- **Still open: the shape late in the fight.** A fixed zone of 30 gets the soldiers right but
  too many wounds at the end (34 per survivor against 41). A zone that shrinks with the unit
  gets the wounds right but too few soldiers (13 against 19). No single simple zone fits both.

### Swordsmen variants: unit size, strong against weak (2026-11-28, 60 clean fights)

Test pack: four other Empire units become Swordsmen with ONE thing changed (same weapon, armour,
animations, spacing): `s60` 60 soldiers, `s160` 160 soldiers, `elite` 47 attack and 47 defence,
`tough` 138 health. 20 units against 20, 12 fights at a time in 12 lanes 90 m apart, every lane's
ground flat (35 heights each, all 577.31). Log: `docs/battle_logs/zz_duel_test_log_2026-11-28_variants_clean.txt`,
report: `check/variants_report.py`. No `FAILED` line. Greatswords have no splash attack in the
game's weapon table (one target per swing), and the variants use the Swordsmen's sword anyway.

EXPERIENCE WAS A HIDDEN VARIABLE (found by the user on the unit cards): units earn ranks from
kills and keep them through the script's respawns. Each rank adds the same amount of melee attack
and melee defence. The pack now raises every rank threshold out of reach. A first run of 30
fights WITH experience is kept apart (`..._variants_lanes_with_experience.txt`): against the
clean run its winners kept up to 15% fewer soldiers (tough v sw: 62 to 78 against 79 to 92).
All 52 fights of the night batches had experience on. Their even mirror fights compare to the
clean control like this: 260 s against 283 s, winner's health 8.0% against 8.8%, health per
survivor 41 against 40, wounds on the living 889 against 778. Treat the night numbers as good
to about 10%.

| Ours v enemy (files) | n | Wins | Seconds | Winner's soldiers left | Winner's health | Health per survivor | Fighters ours / enemy | Wounds on the living ours / enemy |
|---|---|---|---|---|---|---|---|---|
| sw v sw (20 v 20) | 6 | 3 - 3 | 283 | 11 to 32 | 8.8% | 40 | 18.8 / 18.1 | 806 / 750 |
| s60 v s60 (20 v 20) | 6 | 4 - 2 | 142 | 11 to 29 | 20.4% | 40 | 17.6 / 15.9 | 756 / 724 |
| s160 v s160 (20 v 20) | 5 | 2 - 3 | 377 | 3 to 34 | 6.5% | 38 | 17.9 / 19.5 | 807 / 839 |
| s60 v s60 (10 v 10) | 4 | 3 - 1 | 213 | 8 to 23 | 14.2% | 39 | 10.9 / 10.8 | 393 / 427 |
| s160 v s160 (40 v 40) | 4 | 3 - 1 | 217 | 14 to 30 | 7.4% | 32 | 33.8 / 34.4 | 1409 / 1332 |
| tough v tough (20 v 20) | 5 | 2 - 3 | 471 | 11 to 50 | 10.1% | 66 | 21.4 / 21.9 | 2204 / 2174 |
| sw v s60 (20 v 20) | 5 | 5 - 0 | 121 | 83 to 91 | 63.5% | 60 | 18.2 / 15.1 | 714 / 701 |
| s160 v s60 (20 v 20) | 4 | 4 - 0 | 118 | 126 to 131 | 72.6% | 62 | 19.1 / 15.9 | 688 / 684 |
| s160 v sw (20 v 20) | 5 | 5 - 0 | 245 | 69 to 78 | 35.9% | 55 | 19.1 / 18.4 | 806 / 788 |
| elite v sw (20 v 20) | 6 | 6 - 0 | 170 | 82 to 90 | 59.5% | 57 | 19.2 / 21.9 | 684 / 752 |
| sw v elite (20 v 20) | 4 | 0 - 4 | 183 | 80 to 86 | 58.0% | 57 | 21.3 / 17.6 | 804 / 664 |
| tough v sw (20 v 20) | 6 | 6 - 0 | 250 | 79 to 92 | 53.4% | 106 | 19.2 / 19.8 | 1710 / 739 |

- **Fighters follow the width, not the size of the unit.** 20 wide: 18 to 19 fighters with 60,
  120 or 160 soldiers. 10 wide: 11. 40 wide: 34. Only a unit 3 ranks deep falls a little short (16).
- **Wounds follow the width too.** About 40 health per file at 10, 20 and 40 wide, whatever the
  unit's size. One fighter being worn down alone would carry about 23 (69 health) or 58 (138
  health). Measured: 41 and 110 per file. That is 1.8 to 1.9 times as much in both cases:
  the hits are spread over about two soldiers per file, the first two ranks.
- **The duel model's hit chance holds between unequal units.** With 50% against 20% from the
  formula, both sides come out at the usual 18 to 22 fighters. The weak side lands slightly
  more than the formula says, the strong side slightly less (about a tenth).
- **Twice the health is worth twice the soldiers, roughly.** tough v sw ends like a unit with
  the same total health: 70% of the soldiers and 53% of the health left.
- **More soldiers at the same width win by depth, not by more fighters.** 120 against 60: the
  bigger unit loses 32 soldiers to kill 58. 160 against 60: 31 to kill 58. 160 against 120: 88
  to kill 118. Fighters stay near the width for the bigger unit while the smaller one thins.
- **The winner of an even fight keeps a similar NUMBER of soldiers at every size** (medians 15
  to 26 with 60, 120 or 160 per side), with about 40 health each.

### The rule built into the simulator (stage 6, `js/unit.js`)

- Swingers of a side = min(3.5 + 0.84 x files, 0.585 x own^0.63 x other^0.28). These are real
  swings: about a sixth of the damage is lost on soldiers who had little health left, which is
  why the number is higher than the "fighters" above (those count damage that landed).
- Uneven widths: the wider side counts as at most the narrow side's width + 18 files, the narrow
  side as its width + 10 files (6 fights, rough).
- A hit lands on a random soldier among the first 1.5 x files soldiers. Tied to the WIDTH, not
  to the shrinking number of swingers: that is what keeps the winner's soldier count right.
- Swings come at a steady rhythm (one per attack interval per swinger).

`node check/unit_rule_check.mjs` prints the rule against the 11 measured match-ups:

| Match-up | Seconds, game / rule | Winner's soldiers, game / rule | Winner's health, game / rule | Wounds on the living, game / rule |
|---|---|---|---|---|
| sw v sw | 283 / 278 | 17 / 17 | 8.8% / 7.0% | 778 / 779 |
| s60 v s60 | 142 / 168 | 21 / 14 | 20.4% / 10.9% | 740 / 774 |
| s160 v s160 | 377 / 352 | 16 / 18 | 6.5% / 6.1% | 823 / 779 |
| s60 v s60, 10 wide | 213 / 230 | 15 / 11 | 14.2% / 10.3% | 410 / 393 |
| s160 v s160, 40 wide | 217 / 234 | 25 / 23 | 7.4% / 6.6% | 1370 / 1520 |
| tough v tough | 471 / 525 | 25 / 16 | 10.1% / 5.7% | 2189 / 1787 |
| sw v s60 | 121 / 119 | 88 / 78 | 63.5% / 55.9% | 708 / 774 |
| s160 v s60 | 118 / 116 | 129 / 117 | 72.6% / 66.0% | 686 / 764 |
| s160 v sw | 245 / 239 | 72 / 59 | 35.9% / 29.6% | 797 / 782 |
| elite v sw | 170 / 165 | 86 / 85 | 59.5% / 61.5% | 718 / 742 |
| tough v sw | 250 / 235 | 84 / 75 | 53.4% / 51.1% | |

Known misses: the 60-soldier mirror (too slow, too few survivors), the tough mirror (too few
survivors), and the winner of an uneven fight keeps 10 to 20% too few soldiers. The mirror
groups have 4 to 6 fights each, so part of that is the game's own chance.

### Limits of these measurements

- One unit type (Swordsmen, charge 0, no fatigue, unbreakable), unit scale Ultra (120 soldiers).
- Small groups: 2 or 3 fights for 10, 30 and 40 wide and for the uneven widths.
- Each fight stops at 2 soldiers left. The two earlier fights run to the last soldier took
  about 330 s: the last two soldiers alone take about a minute.
- The "fighters" number assumes the duel model's damage per soldier is right. A wrong hit chance
  or damage would shift every number by the same factor, not their ratios.
