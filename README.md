# WH3 duel simulator

Who wins a melee duel between two single soldiers in Total War: WARHAMMER III, computed exactly from their stats instead of simulating the fight.

**Try it: https://vladyskai.github.io/wh3-duel-simulator/**

The page explains each step of the model with a chart, and keeps the maths under a "Formula" collapsible. A built-in simulator fights the same duel thousands of times so you can see the exact answer and the brute-force answer agree.

## What the model covers (version 4)

1. **Hit chance**: 35 + melee attack minus the enemy's melee defence, as a percentage, kept between 0% and 100%. A checkbox applies the game's limits instead (8% to 90% by default, both editable, with a button to restore the defaults).
2. **Damage per hit**: armour-piercing damage always lands. Armour blocks a random share of the base damage on each hit, between half and all of the armour value as a percentage, capped at 100%. A checkbox applies a minimum of 1 damage per hit that lands.
3. **Hits needed**: the number of random hits that add up to the enemy's hit points, computed as a distribution.
4. **Swings needed**: a mixture of negative binomial distributions, one per possible number of hits.
5. **Attack interval**: each soldier swings at t = 0 and then once per interval.
6. **The race**: the exact chance that A wins, that B wins, or that both die at the same instant.
7. **Fight length**: the average time until the first killing blow.

The armour rule, the 8% to 90% limits and the 1 damage minimum are how players describe the game. None of them has been checked against the engine yet, which is why the last two are optional.

Not covered yet: charge, bonus vs large or vs infantry, morale, more than one soldier per unit.

## Unit against unit (version 5, `unit.html`)

Many soldiers per side, everyone fighting at once, with splash (one swing can target several soldiers and splits its damage between them, as players describe the game's `splash_attack_max_attacks`). Three tools:

1. **Lanchester's equations**: the average fight as smooth curves, and the square law (strength = kill rate x soldiers squared).
2. **A Markov chain on the head counts**: the odds of every ending. Each soldier counts as several Erlang stages so the chain's randomness matches the real time to kill (the plain memoryless chain is shown for comparison).
3. **A soldier-by-soldier simulation**: the referee. With one soldier per side and no stagger it reproduces the duel model exactly.

How soldiers pick their targets is not documented, so the page offers two rules: keep the target until it dies, or hit a random enemy each swing. Frontage, morale and charge are not modelled yet.

Measured accuracy of the fast tools against the simulation (`node check/test_units.mjs`): the corrected chain gets the favourite right and usually lands within the gap between the two targeting rules, but it overestimates fight length by about 30% in close fights. Lanchester calls close fights with false certainty and fails with very few soldiers (a single monster).

## Run it locally

The page uses JavaScript modules, so it needs a small local web server (opening `index.html` directly does not work):

```
python -m http.server 8766
```

Then open http://localhost:8766. The formula and chart libraries load from a CDN, so an internet connection is needed.

## Tests

```
node check/test_model.mjs
node check/test_units.mjs
```

The tests check that the model with no armour reproduces the earlier version exactly, and that with armour it matches 100,000 simulated duels per case. `check/duel_check.py` is the original Python version of the model without armour.

## Layout

| Path | What it is |
|---|---|
| `index.html` | the page |
| `css/style.css` | the look, light and dark |
| `js/model.js` | the model: pure maths, no page code |
| `js/app.js` | sliders, charts and the simulator |
| `unit.html`, `js/unit_model.js`, `js/unit_app.js` | the unit page and its three tools |
| `check/` | tests and the Python reference |
