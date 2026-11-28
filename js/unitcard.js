// The card of stage 6: unit against unit. Draws the result of js/unit.js (many simulated
// fights) as numbers, a bar and two pictures. Every loop here runs over a fixed, small number
// of points (at most one bar per soldier count, 400 at the most), so it cannot freeze.
import { UNIT_RULE, swingers } from './unit.js';
import { pct, num } from './util.js';
import { barsSvg } from './charts.js';
import { hitChance } from './model.js';

const W = 680, H = 250;

// The average course of the fight: soldiers of both sides against time.
function courseSvg(course, A, B, ca, cb) {
  if (course.length < 2) return '';
  const L = 54, R = 14, T = 14, Bm = 44, pw = W - L - R, ph = H - T - Bm;
  const tMax = course[course.length - 1].t, yMax = Math.max(A.men, B.men);
  const X = (t) => L + (t / tMax) * pw, Y = (v) => T + ph - (v / yMax) * ph;
  let s = '';
  const yStep = yMax <= 20 ? 5 : yMax <= 60 ? 10 : yMax <= 150 ? 20 : yMax <= 300 ? 50 : 100;
  for (let v = 0; v <= yMax; v += yStep) {
    s += `<line x1="${L}" x2="${L + pw}" y1="${Y(v)}" y2="${Y(v)}" style="stroke:var(--muted);opacity:${v === 0 ? 0.6 : 0.15}"/>`;
    s += `<text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" style="fill:var(--muted);font-size:12px">${v}</text>`;
  }
  const tStep = tMax <= 60 ? 10 : tMax <= 150 ? 20 : tMax <= 400 ? 50 : tMax <= 900 ? 100 : 500;
  for (let v = 0; v <= tMax; v += tStep) {
    s += `<line x1="${X(v)}" x2="${X(v)}" y1="${T + ph}" y2="${T + ph + 5}" style="stroke:var(--muted)"/>`;
    s += `<text x="${X(v)}" y="${T + ph + 19}" text-anchor="middle" style="fill:var(--muted);font-size:12px">${v}</text>`;
  }
  s += `<text x="${L + pw / 2}" y="${H - 6}" text-anchor="middle" style="fill:var(--muted);font-size:12.5px">Time (seconds)</text>`;
  s += `<text x="14" y="${T + ph / 2}" text-anchor="middle" transform="rotate(-90 14 ${T + ph / 2})" style="fill:var(--muted);font-size:12px">soldiers alive</text>`;
  const line = (key, start, col) => `<polyline fill="none" style="stroke:${col};stroke-width:2.4px" points="${[[0, start], ...course.map((p) => [p.t, p[key]])].map(([t, v]) => `${X(t).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/>`;
  s += line('a', A.men, ca) + line('b', B.men, cb);
  return `<svg class="chartsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Soldiers alive on both sides during the average fight">${s}</svg>`;
}

// r = the answer of unitBattle(A, B). Returns the inner HTML of the card's result box.
export function unitCardHtml(r, ca, cb) {
  const { A, B } = r;
  const seg = (w, bg, fg, label) => (w > 0.0005 ? `<div style="width:${100 * w}%;background:${bg};color:${fg}">${w > 0.09 ? label : ''}</div>` : '');
  const bar = seg(r.pA, ca, '#fff', 'A wins ' + pct(r.pA)) + seg(r.pTie, 'var(--neutral)', 'var(--muted)', 'Draw ' + pct(r.pTie)) + seg(r.pB, cb, '#fff', 'B wins ' + pct(r.pB));
  const pA = hitChance(A.attack, B.defence), pB = hitChance(B.attack, A.defence);
  const sA = swingers(A.men, B.men, A.files, B.files), sB = swingers(B.men, A.men, B.files, A.files);
  const ranks = (U) => Math.ceil(U.men / U.files);
  const side = (S, U) => (S.wins ? [
    `${S.men.median} of ${U.men} <span class="what">(half of its wins end between ${S.men.q25} and ${S.men.q75})</span>`,
    `${pct(S.health.mean)} of the unit's health`,
    `${num(S.perSurvivor, 0)} of ${U.hp} per surviving soldier`,
  ] : ['never wins', '', '']);
  const a = side(r.sideA, A), b = side(r.sideB, B);
  const row = (label, x, y) => `<tr><td>${label}</td><td>${x}</td><td>${y}</td></tr>`;
  const table = `<table class="unit-table"><tr><th></th><th style="color:${ca}">Unit A</th><th style="color:${cb}">Unit B</th></tr>
    ${row('Soldiers, formation', `${A.men}, ${A.files} wide, ${ranks(A)} ranks`, `${B.men}, ${B.files} wide, ${ranks(B)} ranks`)}
    ${row('Soldiers fighting at the start', num(sA), num(sB))}
    ${row('Chance that one swing hits', pct(pA), pct(pB))}
    ${row('Wins', pct(r.pA), pct(r.pB))}
    ${row('Soldiers left when it wins', a[0], b[0])}
    ${row('Health left when it wins', a[1], b[1])}
    ${row('Health of the survivors', a[2], b[2])}</table>`;
  // winner's soldiers left: one bar per soldier count, grouped so there are never more than ~80 bars
  const top = Math.max(A.men, B.men), group = Math.max(1, Math.ceil(top / 80));
  const bins = (hist) => { const out = []; for (let v = 0; v <= top; v += group) { let y = 0; for (let k = v; k < v + group && k < hist.length; k++) y += hist[k]; out.push([v + (group - 1) / 2, y]); } return out; };
  const hist = barsSvg({ series: [{ col: ca, pts: bins(r.sideA.hist) }, { col: cb, pts: bins(r.sideB.hist) }], xMin: -0.5, xMax: top + 0.5,
    xLabel: `Soldiers the winner has left${group > 1 ? ` (bars of ${group})` : ''}`, means: [[r.sideA.wins ? r.sideA.men.mean : NaN, ca], [r.sideB.wins ? r.sideB.men.mean : NaN, cb]],
    aria: 'Chance of each number of soldiers left for the winner' });
  const cut = r.cut ? `<p class="note">${r.cut} of ${r.runs} fights were still going after an hour of game time and count as a draw: these units can barely hurt each other.</p>` : '';
  return `<div class="winbar">${bar}</div>
    <p class="duration">Half of the fights last between ${num(r.seconds.q25, 0)} and ${num(r.seconds.q75, 0)} seconds (middle one: ${num(r.seconds.median, 0)} s). From ${r.runs} simulated fights, so a share can be off by up to about ${num(100 / Math.sqrt(r.runs), 0)} points.</p>
    ${cut}${table}
    <h4>The average fight</h4>
    <div class="legend"><span><i style="background:${ca}"></i>soldiers of A</span><span><i style="background:${cb}"></i>soldiers of B</span><span>averaged over all fights, shown until half of them are over</span></div>
    ${courseSvg(r.course, A, B, ca, cb)}
    <h4>How many soldiers the winner keeps</h4>
    <div class="legend"><span><i style="background:${ca}"></i>A wins with that many left</span><span><i style="background:${cb}"></i>B wins with that many left</span><span>all bars together add up to 100%</span></div>
    ${hist}`;
}

// The rule in words, with its numbers (one place, so the page always shows what the model does).
export function unitRuleHtml() {
  const R = UNIT_RULE;
  return `<ol class="note">
      <li><b>Who fights.</b> Not every soldier swings. A side has min(${R.CAP_BASE} + ${R.CAP_FILE} &times; files, ${R.SHRINK} &times; own<sup>${R.OWN}</sup> &times; other<sup>${R.OTHER}</sup>) soldiers swinging: a little under one per file plus a few at the ends, and fewer once the units get small.</li>
      <li><b>Uneven widths.</b> The wider side counts as at most the narrow side's width + ${R.WRAP_WIDE} files. The narrow side is wrapped, so it counts as its width + ${R.WRAP_NARROW} files.</li>
      <li><b>Who is hit.</b> A hit lands on a random soldier among the first ${R.ZONE} &times; files soldiers: the front rank and half of the second. A dead soldier is replaced from behind at once.</li>
      <li><b>Each swing</b> hits and hurts exactly as in the one-soldier duel of stage 5.</li>
    </ol>`;
}
