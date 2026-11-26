# WH3 duel simulator

Who wins a melee duel between two single soldiers in Total War: WARHAMMER III, computed exactly from their stats instead of simulating the fight.

**Try it: https://vladyskai.github.io/wh3-duel-simulator/**

The page explains each step of the model with a chart, and keeps the maths under a "Formula" collapsible. A built-in simulator fights the same duel thousands of times so you can see the exact answer and the brute-force answer agree.

## What the model covers (version 2)

1. **Hit chance**: 35 + melee attack minus the enemy's melee defence, as a percentage, kept between 0% and 100%.
2. **Hits needed**: the enemy's hit points divided by the damage per hit, rounded up.
3. **Swings needed**: the negative binomial distribution (swings until the k-th hit).
4. **Attack interval**: each soldier swings at t = 0 and then once per interval.
5. **The race**: the exact chance that A wins, that B wins, or that both die at the same instant.
6. **Fight length**: the average time until the first killing blow.

This is a deliberately small version, kept simple for study.

## The fuller model (saved)

A later version is saved on the branch [`full-model`](https://github.com/vladyskai/wh3-duel-simulator/tree/full-model) (tag `v6-full-model`). It adds armour and armour-piercing damage, the game's hit chance limits, a 1 damage minimum, and a second page for unit against unit fights (splash attacks, front lines, Lanchester's equations, a Markov chain and a soldier-by-soldier simulation). To run it: `git checkout full-model`.

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

The tests check the exact model against the numbers of `check/duel_check.py` (the Python version) and against 100,000 simulated duels per case, fight length included.

## Layout

| Path | What it is |
|---|---|
| `index.html` | the page |
| `css/style.css` | the look, light and dark |
| `js/model.js` | the model: pure maths, no page code |
| `js/app.js` | sliders, charts and the simulator |
| `check/` | tests and the Python reference |
