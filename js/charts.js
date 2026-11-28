// Bar charts drawn as SVG, so they stay sharp at any zoom of the canvas.
// series = [{ col, pts: [[x, chance], ...] }] drawn side by side at each x.
// xMin..xMax = the x range (whole numbers get half a step of room on each side).
// means = [[x, col]] dashed lines. barW = a fixed bar width in pixels (for the time chart).
import { niceStep, fmtPct } from './maps.js';

export function barsSvg({ series, xMin, xMax, xLabel, means = [], barW = 0, xFmt = String, width = 680, height = 260, aria = '' }) {
  const L = 54, R = 14, T = 14, B = 44, pw = width - L - R, ph = height - T - B;
  let yMax = 0;
  for (const s of series) for (const [, y] of s.pts) yMax = Math.max(yMax, y);
  const yTop = (yMax || 1) / 0.9;
  const X = (v) => L + ((v - xMin) / ((xMax - xMin) || 1)) * pw;
  const Y = (v) => T + ph - (v / yTop) * ph;
  const t = (x, y, txt, st, extra = '') => `<text x="${x}" y="${y}" ${extra} style="${st}">${txt}</text>`;
  let s = '';
  // Vertical axis: gridlines and chance labels.
  const ys = niceStep(yTop / 4);
  for (let v = 0, n = 0; v <= yTop + 1e-12 && n < 40; v += ys, n++) {
    s += `<line x1="${L}" x2="${L + pw}" y1="${Y(v)}" y2="${Y(v)}" style="stroke:var(--muted);opacity:${v === 0 ? 0.6 : 0.15}"/>`;
    s += t(L - 8, Y(v) + 4, fmtPct(v), 'fill:var(--muted);font-size:12px', 'text-anchor="end"');
  }
  s += t(14, T + ph / 2, 'chance', 'fill:var(--muted);font-size:12px', `text-anchor="middle" transform="rotate(-90 14 ${T + ph / 2})"`);
  // Horizontal axis: about eight labels, at whole steps.
  const xs = Math.max(1, niceStep((xMax - xMin) / 8));
  for (let v = Math.ceil(xMin / xs) * xs, n = 0; v <= xMax && n < 40; v += xs, n++) {
    s += `<line x1="${X(v)}" x2="${X(v)}" y1="${T + ph}" y2="${T + ph + 5}" style="stroke:var(--muted)"/>`;
    s += t(X(v), T + ph + 19, xFmt(v), 'fill:var(--muted);font-size:12px', 'text-anchor="middle"');
  }
  s += t(L + pw / 2, height - 6, xLabel, 'fill:var(--muted);font-size:12.5px', 'text-anchor="middle"');
  // Bars, the series side by side.
  const n = series.length;
  const bw = barW || Math.max(1, Math.min(18, (pw / ((xMax - xMin) || 1)) * 0.85 / n));
  series.forEach((ser, j) => {
    for (const [x, y] of ser.pts) {
      if (y < 1e-6 || x < xMin || x > xMax) continue;
      const cx = X(x) + (barW ? 0 : (j - (n - 1) / 2) * bw);
      s += `<rect x="${cx - bw / 2}" y="${Y(y)}" width="${bw}" height="${T + ph - Y(y)}" rx="${bw > 6 ? 2 : 0}" style="fill:${ser.col};opacity:${barW ? 0.8 : 1}"><title>${xFmt(x)}: ${(100 * y).toFixed(1)}%</title></rect>`;
    }
  });
  for (const [v, col] of means) {
    if (!isFinite(v) || v < xMin || v > xMax) continue;
    s += `<line x1="${X(v)}" x2="${X(v)}" y1="${T}" y2="${T + ph}" style="stroke:${col};stroke-dasharray:5 4;stroke-width:1.6px"/>`;
  }
  return `<svg class="chartsvg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${aria}">${s}</svg>`;
}
