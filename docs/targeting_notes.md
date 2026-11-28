# Notes: how soldiers pick and keep targets (unverified)

Saved 2026-11-27 for future reference. Everything below comes from two AI-generated answers the user pasted.
Neither cites a developer source for these points (their links go to Quora, Reddit and YouTube). Creative
Assembly's damage article (see game_rules.md) does not cover targeting. Treat every point as an ASSUMPTION
until the game files or a developer source confirm it.

## Claims, summarised

**Keeping a target**
- A soldier keeps its target until one of them dies, is knocked down, or moves out of weapon reach.
- After each swing the engine first checks whether the current target is still valid, and only then looks
  for a new one.

**What makes a soldier change target**
- The target dies or is knocked down (common against cavalry and monsters).
- Pushing and collisions move the target out of reach. The soldier then takes whoever is closest.
- A new order (move, guard mode, attack another unit) clears the soldiers' targets.
- A charge into the flank or rear: hit reactions can reset targeting toward the closer threat.

**Warhammer specifically (free-swing combat, no matched 1v1 animations except sync kills)**
- Soldiers seem to switch targets more often than in the historical titles.
- Between swings a soldier may switch to an enemy that comes closer inside its forward attack cone.
- Several soldiers can swing at the same enemy at the same time.
- Only a limited number of small soldiers fit around a monster or Lord. Once that ring is full, the rest
  wait until a space opens.

**Pairing in general**
- Unit orders set which enemy unit to fight. Each soldier then picks the nearest enemy within weapon reach
  in front of it. Collision spacing lines up front ranks against whoever is physically closest.
- Large entities hit an arc (splash) and damage a capped number of entities in it. The cap is in the game
  data: `melee_weapons.splash_attack_max_attacks` and `splash_attack_target_size`.

## The modelling choice (user, 2026-11-27)

- The simplest model: a soldier keeps its target once it has chosen one, until that target dies.
- In principle two or more soldiers can pick the same enemy soldier, so a model should allow that and
  not force one-to-one pairs.
- The game files might settle the question. Not checked yet.
