// The stat controls: a slider, a number field and a value gain per stat, for both units.
// Both pages build them the same way into '.unit[data-side] .ctls' boxes. The values are
// remembered in this browser (localStorage), so the explanations page and the map page
// always show the same duel.
import { $ } from './util.js';
import { statGains, stageDuel } from './model.js';
import { UNITS, unitIcon } from './units.js';

// The controls, built once for both units. Interval is stored in tenths of a second.
export const FIELDS = [
  // from = the first stage of the model in which that side's stat counts.
  { key: 'attack', label: 'Melee attack', min: 0, max: 100, from: { A: 1, B: 3 } },
  { key: 'defence', label: 'Melee defence', min: 0, max: 100, from: { A: 3, B: 1 } },
  { key: 'base', label: 'Base damage', min: 0, max: 200, from: { A: 1, B: 3 } },
  { key: 'ap', label: 'Armour-piercing', min: 0, max: 200, from: { A: 5, B: 5 } },
  { key: 'armour', label: 'Armour', min: 0, max: 200, from: { A: 4, B: 4 } },
  { key: 'hp', label: 'Hit points', min: 1, max: 500, from: { A: 3, B: 1 } },
  { key: 'interval', label: 'Attack interval (s)', min: 20, max: 60, scale: 10, from: { A: 2, B: 3 } },
  // The unit itself (stage 6). unit = not a stat of one soldier: no value gain is computed.
  // free = not part of a real unit's stats: loading a unit leaves it alone.
  { key: 'men', label: 'Soldiers', min: 1, max: 300, from: { A: 6, B: 6 }, unit: true },
  { key: 'files', label: 'Width (files)', min: 1, max: 100, from: { A: 6, B: 6 }, unit: true, free: true },
];
export const DEFAULTS = {
  A: { attack: 45, defence: 25, base: 20, ap: 5, armour: 30, hp: 100, interval: 40, men: 120, files: 20 },
  B: { attack: 30, defence: 30, base: 30, ap: 10, armour: 50, hp: 120, interval: 43, men: 120, files: 20 },
};
export const LIMITS = Object.fromEntries(FIELDS.map((f) => [f.key, { min: f.min, max: f.max }]));
const STORE = 'wh3-duel-stats';
const shown = (f, v) => (f.scale ? (v / f.scale).toFixed(1) : String(v));

// The saved stats, each one checked: anything missing or out of range falls back to the default.
function startValues() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE)); } catch { saved = null; }
  const out = { A: {}, B: {} };
  for (const side of ['A', 'B']) {
    for (const f of FIELDS) {
      const v = saved && saved[side] ? Number(saved[side][f.key]) : NaN;
      out[side][f.key] = Number.isInteger(v) && v >= f.min && v <= f.max ? v : DEFAULTS[side][f.key];
    }
  }
  return out;
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify({ A: readUnit('A'), B: readUnit('B') })); } catch { /* private mode: not remembered */ }
}

// Each stat: a slider, a number field (the same value, typed), and its value gain.
// The interval's slider counts tenths, its number field shows seconds.
// Put a whole set of stats on one side's sliders and number fields.
function setSide(side, stats) {
  for (const f of FIELDS) {
    if (stats[f.key] === undefined) continue;   // a real unit has no width of its own
    $(`${side}-${f.key}`).value = stats[f.key];
    $(`${side}-${f.key}-n`).value = shown(f, stats[f.key]);
  }
}
// Which real unit the side's stats match exactly (null = custom stats).
const matching = (side) => { const u = readUnit(side); return UNITS.find((x) => FIELDS.every((f) => f.free || x.stats[f.key] === u[f.key])) || null; };
// The unit squares beside "Unit A" and "Unit B": the one in use is pressed, and the line
// under the title names it (or says the stats are custom).
function showUnits() {
  for (const side of ['A', 'B']) {
    const m = matching(side);
    document.querySelectorAll(`.unitpick[data-side="${side}"] button`).forEach((b) => b.setAttribute('aria-pressed', String(!!m && b.dataset.unit === m.id)));
    const line = document.querySelector(`.unitname[data-side="${side}"]`);
    if (line) line.textContent = m ? `${m.name}, ${m.faction}, ${m.rank}, ${m.cost} gold, ${m.stats.men} soldiers: the game's stats for one soldier` : "Custom stats: pick a unit to load the game's stats";
  }
}

export function buildControls(onChange) {
  const start = startValues();
  const changed = () => { save(); showUnits(); onChange(); };
  for (const side of ['A', 'B']) {
    // The unit squares go into the side's title, the name line just under it.
    const title = document.querySelector(`.unit[data-side="${side}"] h2`);
    title.insertAdjacentHTML('beforeend', `<span class="unitpick" data-side="${side}" role="group" aria-label="Load a real unit's stats for ${side}">${UNITS.map((u) =>
      `<button type="button" data-unit="${u.id}" aria-pressed="false" title="${u.name} (${u.faction}, ${u.rank}): MA ${u.stats.attack}, MD ${u.stats.defence}, damage ${u.stats.base} + ${u.stats.ap} AP, armour ${u.stats.armour}, ${u.stats.hp} HP, every ${u.stats.interval / 10} s">${unitIcon(u)}</button>`).join('')}</span>`);
    title.insertAdjacentHTML('afterend', `<p class="unitname" data-side="${side}"></p>`);
    title.querySelectorAll('.unitpick button').forEach((b) => b.addEventListener('click', () => {
      setSide(side, UNITS.find((u) => u.id === b.dataset.unit).stats);
      changed();
    }));
    const box = document.querySelector(`.unit[data-side="${side}"] .ctls`);
    box.innerHTML = FIELDS.map((f) => {
      const s = f.scale || 1, v = start[side][f.key];
      return `<div class="ctl"><label for="${side}-${f.key}" id="${side}-${f.key}-l">${f.label}</label>
      <input type="range" id="${side}-${f.key}" min="${f.min}" max="${f.max}" step="1" value="${v}">
      <input type="number" id="${side}-${f.key}-n" aria-label="${f.label}, typed" min="${f.min / s}" max="${f.max / s}" step="${1 / s}" value="${shown(f, v)}">
      <span class="gain" id="${side}-${f.key}-g"></span></div>`;
    }).join('');
    for (const f of FIELDS) {
      const range = $(`${side}-${f.key}`), field = $(`${side}-${f.key}-n`), s = f.scale || 1;
      range.addEventListener('input', () => { field.value = shown(f, +range.value); changed(); });
      // Typing: follow the field while the number is valid, tidy it up when the field is left.
      field.addEventListener('input', () => {
        const v = Math.round(parseFloat(field.value) * s);
        if (Number.isFinite(v) && v >= f.min && v <= f.max) { range.value = v; changed(); }
      });
      field.addEventListener('change', () => {
        let v = Math.round(parseFloat(field.value) * s);
        if (!Number.isFinite(v)) v = +range.value;
        v = Math.min(f.max, Math.max(f.min, v));
        range.value = v; field.value = shown(f, v); changed();
      });
    }
  }
  showUnits();
  return () => { // reset to the defaults
    for (const side of ['A', 'B']) setSide(side, DEFAULTS[side]);
    changed();
  };
}

export function readUnit(side) {
  const u = {};
  for (const f of FIELDS) u[f.key] = +$(`${side}-${f.key}`).value;
  return u;
}

// Value gains: one more point of each stat (0.1 s faster for the interval), and how much
// that raises the unit's own win chance. The best stat of each unit gets the full unit
// colour, the others fade towards grey in proportion. Computed just after the sliders stop,
// because with 500 HP and heavy armour one duel can take ~0.1 s and this needs 14 of them.
let gainTimer = 0;
export function scheduleGains(state) {
  clearTimeout(gainTimer);
  gainRun++; // drops a calculation still under way for older stats
  gainTimer = setTimeout(() => computeGains(state, gainRun), 120);
}
// The 14 duels are computed one at a time, giving the page a turn between them, so a
// heavy set of stats never blocks it for more than one duel. A newer change cancels the run.
let gainRun = 0;
async function computeGains(state, run) {
  const { A, B, r } = state;
  if (state.stage < 3) return; // nobody wins or loses yet: no gains to show
  const duelFn = stageDuel(state.stage), g = { A: {}, B: {} };
  for (const side of ['A', 'B']) {
    for (const f of FIELDS) {
      if (f.unit) continue;
      const one = statGains(A, B, r, LIMITS, duelFn, side, f.key);
      g[side][f.key] = one[side][f.key];
      await new Promise((done) => setTimeout(done, 0));
      if (run !== gainRun) return;
    }
  }
  showGains(g);
}
function showGains(g) {
  for (const side of ['A', 'B']) {
    const vals = FIELDS.filter((f) => !f.unit).map((f) => g[side][f.key]).filter((x) => x !== null);
    const best = Math.max(0, ...vals);
    for (const f of FIELDS) {
      if (f.unit) continue;
      const x = g[side][f.key], span = $(`${side}-${f.key}-g`), range = $(`${side}-${f.key}`);
      const share = x !== null && best >= 0.0005 ? Math.max(0, x) / best : 0; // below 0.05 points: all grey
      const col = `color-mix(in srgb, var(--${side.toLowerCase()}) ${Math.round(100 * share)}%, var(--muted))`;
      range.style.accentColor = col;
      span.style.color = share > 0 ? col : 'var(--muted)';
      span.classList.toggle('best', share > 0.999);
      const step = f.key === 'interval' ? '0.1 s faster' : '+1 ' + f.label.toLowerCase();
      if (x === null) { span.textContent = 'max'; span.title = 'Already at the end of the slider'; continue; }
      span.textContent = (x >= 0 ? '+' : '') + (100 * x).toFixed(1);
      span.title = `${step}: ${side}'s win chance changes by ${(x >= 0 ? '+' : '') + (100 * x).toFixed(2)} points`;
    }
  }
}


// Show only the stats the stage uses. The hidden ones keep their values and change nothing.
// Up to stage 3 there is no armour, so "base damage" is simply the damage per hit.
export function applyStage(stage) {
  for (const side of ['A', 'B']) {
    for (const f of FIELDS) $(`${side}-${f.key}`).closest('.ctl').hidden = stage < f.from[side];
    $(`${side}-base-l`).textContent = stage <= 3 ? 'Damage per hit' : 'Base damage';
  }
  document.querySelectorAll('.ctls-head span:nth-child(4)').forEach((el) => { el.textContent = stage >= 3 ? '+1 gain' : ''; });
  document.querySelectorAll('.ctl .gain').forEach((el) => { if (stage < 3) { el.textContent = ''; el.title = ''; } });
  if (stage < 3) for (const side of ['A', 'B']) for (const f of FIELDS) $(`${side}-${f.key}`).style.accentColor = '';
}
