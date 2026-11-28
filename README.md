# WH3 duel simulator

Who wins a melee duel between two single soldiers in Total War: WARHAMMER III, computed exactly from their stats instead of simulating the fight.

**Try it: https://vladyskai.github.io/wh3-duel-simulator/**

The site is one endless canvas: drag to move, scroll or pinch to zoom. A map runs every step of the model from top to bottom, one column per soldier, as chains of small pictures joined by labelled arrows. Beside each step sits a card explaining it, with a chart and the maths under a "Formula" toggle. The model comes in five stages, from one soldier swinging at a defender who never strikes back (stage 1) to the full duel with armour and armour-piercing damage (stage 5), and a "Model inputs" window lists the numbers each stage really needs and the stats they come from. The stats are in a floating window that stays on screen, and everything follows them at once. Five real units can be loaded with one click (Zombies, Goblins with spears, Empire Swordsmen, Grave Guard and Chaos Chosen), with the stats of one soldier from the game's own tables (patch 9.0.5). A built-in simulator fights the same duel thousands of times so you can see the exact answer and the brute-force answer agree.

## What the model covers (version 3)

1. **Hit chance**: 35 + melee attack minus the enemy's melee defence, as a percentage, kept between 0% and 100%.
2. **Damage of one hit**: armour-piercing damage in full, plus base damage reduced by a random armour roll (between half and all of the armour value, capped at 100%). The game rounds the two parts separately, and there is no minimum damage.
3. **Hits needed**: keep adding hits until they reach the enemy's hit points. With armour this is a distribution, computed exactly because every hit does a whole number of damage.
4. **Swings needed**: a mixture of negative binomial distributions (swings until the k-th hit), one per possible number of hits.
5. **Attack interval**: each soldier swings at t = 0 and then once per interval.
6. **The race**: the exact chance that A wins, that B wins, or that both die at the same instant.
7. **Fight length**: the average time until the first killing blow.

The damage rules come from Creative Assembly's own article, [Feature Focus #2: Damage](https://www.totalwar.com/news/feature-focus-2-damage-part-1) (2023). What the model uses and what it leaves out is in [docs/game_rules.md](docs/game_rules.md).

## Stage 6: unit against unit (a simulation)

Stage 6 turns each side into a whole unit: soldiers and a width in files. It is not exact maths. `js/unit.js` plays the fight many times, swing by swing, with a rule measured in the game (112 logged fights, `docs/unit_battle_research.md`):

- **Who fights:** about one soldier per file plus a few at the ends, fewer once the units get small. The size of a deep unit does not change it.
- **Who is hit:** a random soldier among the first 1.5 x files soldiers (the front rank and half of the second).
- **Each swing** hits and hurts as in the one-soldier duel.

It reports who wins, how long the fight lasts, and what the winner has left: soldiers, health, health per survivor. Left out: morale, charge, fatigue, experience, flank and rear attacks, splash attacks, terrain. Against the game's fights the winner is right every time, the length within 20%, the winner's soldiers within 25% (usually too few).

## The fuller model (saved)

A later version is saved on the branch [`full-model`](https://github.com/vladyskai/wh3-duel-simulator/tree/full-model) (tag `v6-full-model`). It adds the game's hit chance limits, a 1 damage minimum (not confirmed by the developer), and a second page for unit against unit fights (splash attacks, front lines, Lanchester's equations, a Markov chain and a soldier-by-soldier simulation). It does not round damage. To run it: `git checkout full-model`.

## Run it locally

Double-click `Start simulator.bat` (Windows). It starts a small local server and opens the page; close its window to stop it. On any system:

```
python serve.py
```

Then open http://localhost:8766. The page uses JavaScript modules, so opening `index.html` directly does not work. `serve.py` tells the browser not to keep old copies of the files, so a reload always gets the newest version (a plain `python -m http.server` lets the browser mix old and new files after an update). The formula library loads from a CDN; without an internet connection the formulas show as plain text and everything else works.

## Tests

```
node check/test_model.mjs
node check/test_unit.mjs
node check/unit_rule_check.mjs --test
```

With no armour the tests check the exact model against the numbers of `check/duel_check.py` (the Python version of version 2). With armour they check the damage of one hit against worked examples, the damage and hits-needed distributions against 200,000 simulated hits, and whole duels against 100,000 simulated duels per case, fight length included.

## Rules that keep the page from freezing

The page once froze on unusual stats (an endless loop, and drawings of many megabytes). These rules, and the tests behind them, are there so it does not happen again:

- **Every loop has a limit that does not depend on the data being "normal".** A loop that fills a list or steps along an axis also counts its turns and stops at a fixed number.
- **A picture never draws more than one bar or point per pixel**, however many values it covers.
- **Work that can be long is cut into pieces or given a time budget**: the win chance gains are computed one duel at a time, and the simulation stops after about one second.
- **The model follows at most 1,000 hits and 3,000 swings.** Past that, the page says so in words ("over 1000 hits") instead of drawing empty pictures.
- **The unit simulation has a time budget** (a quick answer of 60 fights at once, the full 1,000 after the sliders rest, each cut off after a fixed number of milliseconds) and every fight ends after an hour of game time at the latest. `check/test_unit.mjs` runs 150 random pairs of units against that.
- **`node check/test_model.mjs` must pass before a change is kept.** Part 5 draws the map, the charts and the gains for the case that froze the page, for every stat at each end of its slider, and for hundreds of random duels in all five stages. Each must finish in under 2 seconds, and no drawing may pass 1 MB. A new special case in the code needs a new case there.

## Layout

| Path | What it is |
|---|---|
| `index.html` | the site: one endless canvas with the map, the step cards and the floating stats window |
| `css/style.css` | the look, light and dark |
| `js/model.js` | the model: pure maths, no page code |
| `js/site.js` | the page: places the cards next to the map, draws everything, the simulator |
| `js/maps.js` | the map: chains of small pictures joined by labelled arrows |
| `js/charts.js` | the bar charts of the step cards, drawn as SVG so they stay sharp at any zoom |
| `js/canvas.js` | drag, zoom and jump for the canvas |
| `js/units.js` | the five real units: their game stats, where they come from, and their pictures |
| `js/controls.js` | the stat sliders (remembered in the browser) |
| `js/util.js` | small shared helpers |
| `check/` | tests and the Python reference |
| `docs/game_rules.md` | the game rules the model uses, with sources |
