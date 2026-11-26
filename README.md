# WH3 duel simulator

Who wins a melee duel between two single soldiers in Total War: WARHAMMER III, computed exactly from their stats instead of simulating the fight.

The page explains each step of the model with a chart, and keeps the maths under a "Formula" collapsible. A built-in simulator fights the same duel thousands of times so you can see the exact answer and the brute-force answer agree.

## What the model covers (version 3)

1. **Hit chance**: 35 + melee attack minus the enemy's melee defence, as a percentage (kept between 0% and 100%).
2. **Damage per hit**: armour-piercing damage always lands. Armour blocks a random share of the base damage on each hit, between half and all of the armour value as a percentage, capped at 100%.
3. **Hits needed**: the number of random hits that add up to the enemy's hit points, computed as a distribution.
4. **Swings needed**: a mixture of negative binomial distributions, one per possible number of hits.
5. **Attack interval**: each soldier swings at t = 0 and then once per interval.
6. **The race**: the exact chance that A wins, that B wins, or that both die at the same instant.
7. **Fight length**: the average time until the first killing blow.

The armour rule is how the player community describes the game. It has not been checked against the engine yet.

Not covered yet: the game's 8% to 90% hit chance clamp, charge, bonus vs large or vs infantry, morale, more than one soldier per unit.

## Run it locally

The page uses JavaScript modules, so it needs a small local web server (opening `index.html` directly does not work):

```
python -m http.server 8766
```

Then open http://localhost:8766. The formula and chart libraries load from a CDN, so an internet connection is needed.

## Tests

```
node check/test_model.mjs
```

The tests check that the model with no armour reproduces the earlier version exactly, and that with armour it matches 100,000 simulated duels per case. `check/duel_check.py` is the original Python version of the model without armour.

## Layout

| Path | What it is |
|---|---|
| `index.html` | the page |
| `css/style.css` | the look, light and dark |
| `js/model.js` | the model: pure maths, no page code |
| `js/app.js` | sliders, charts and the simulator |
| `check/` | tests and the Python reference |
