# Game rules used by the model, and where they come from

Checked 2026-11-27. The main source is Creative Assembly's own article, so these rules come from the
developer, not from players.

## Sources

| Source | Who | What it covers |
|---|---|---|
| [FEATURE FOCUS #2: Damage (Part 1)](https://www.totalwar.com/news/feature-focus-2-damage-part-1), 13 July 2023, also on the [CA community site](https://community.creative-assembly.com/total-war/total-war-warhammer/blogs/6-feature-focus-2-damage-part-1) | Creative Assembly (developer), Warhammer III | hit chance, the armour roll, rounding, resistances |
| [FEATURE FOCUS #1: Elevation](https://www.totalwar.com/news/feature-focus-1-elevation), May 2023 | Creative Assembly | height (not used by the model yet) |
| [Armour (character stat)](https://totalwarwarhammer.fandom.com/wiki/Armour_(character_stat)) and [Combat](https://totalwarwarhammer.fandom.com/wiki/Combat), fandom wiki | players | the same armour rule, average values |

The article promised a Part 2 (explosions, vortexes, splash attacks of large monsters and Lords, game ticks).
As of 2026-11-27 it does not exist: the CA community blog list has only Feature Focus #1 and #2, and a web
search finds no Part 2. The Reddit thread
[How much damage resistance does armour actually do](https://www.reddit.com/r/totalwar/comments/wf1tnu/how_much_damage_resistance_does_armour_actually_do/)
could not be opened (Reddit refuses automated readers).

## The rules (developer article, in the order the game applies them)

1. **Hit chance** = 35 + melee attack (+ bonus vs infantry or large, + charge bonus) minus the defender's
   melee defence, in percent. The final chance never goes above 90% or below 8%. The game draws a whole
   number from 1 to 100 and the swing hits if the number is at most the hit chance. With whole-number stats
   this is exactly a coin with p = chance / 100.
   (Flank attacks multiply the defender's melee defence by 0.6, rear attacks by 0.3. Not in the model.)
2. **Damage has two parts**: base damage, which armour reduces, and armour-piercing (AP) damage, which
   armour ignores. Bonuses (vs infantry, charge) are added to both parts in the same ratio as the weapon's
   own base/AP split. Not in the model yet.
3. **The armour roll**: on each hit the defender reduces the BASE part by a percentage between half its
   armour value and its full armour value. A roll above 100% acts as 100%. At 100% the base part does no
   damage at all, and the article says there is no minimum for it.
4. **Resistances** (physical, missile, spell, fire, ward save) are added together, capped at 90% in total,
   and reduce the damage after armour. Not in the model.
5. **Rounding**: the game computes with six decimals and rounds only at the very end, when the damage is
   applied. The base part and the AP part are rounded SEPARATELY (the article's example: 12.123 base
   becomes 12, 48.285 AP becomes 48, the hit does 60).
6. **Overkill is lost**: damage beyond what the target has left goes nowhere (no carry-over to the next
   soldier).

## Not confirmed by the developer

- **A minimum of 1 damage per hit**: the developer article never mentions it (it says only that the base part
  has no minimum). A pasted claim (2026-11-27) said the minimum applies to the total after ward save, citing
  the Reddit thread above and the developer article. The developer article does not say that. The model does
  NOT use a minimum (user decision, 2026-11-27: "redo the model without the minimum of 1 damage").
- **How a tie at exactly .5 rounds**: the article does not say. The model rounds half up (JavaScript
  `Math.round`). With whole-number stats only the armour roll gives fractions, and a roll landing exactly
  on .5 has probability zero in the model.

## What the model uses (version 3)

- Hit chance: rule 1 without the bonuses, flanking and the 8%/90% limits.
- Damage of one hit: `round(AP) + round(base x (1 - R))`, `R = min(1, U x armour / 100)`, U uniform between
  0.5 and 1. No resistances, no minimum.
- Because every hit does a whole number of damage, the hits needed can be computed exactly, with no grid.

Worked example (from the pasted claim): base 9, AP 1.

- Armour 200: R = 1 on every roll, the base part is 0, the hit does 1 (no minimum needed).
- Armour 100: the base part is uniform between 0 and 4.5, rounded: 0 with chance 1/9, and 1, 2, 3, 4 with
  chance 2/9 each (5 only on the single exact lowest roll, chance zero). Adding the AP: the hit does 1 to 5,
  never 6 in practice. The pasted claim said 1 to 6: the 6 needs that single exact roll.
- Rounding each part or rounding the total gives the same answer while the AP part is a whole number
  (round(AP + x) = AP + round(x)). It differs only when bonuses make the AP part fractional: 2.4 base and
  1.4 AP give 2 + 1 = 3 rounded per part, but 4 if the total 3.8 were rounded.
