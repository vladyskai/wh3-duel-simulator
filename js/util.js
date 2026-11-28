// Small helpers shared by both pages.
export const $ = (id) => document.getElementById(id);
export const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const pct = (x) => (100 * x).toFixed(1) + '%';
export const sec = (tenths) => (isFinite(tenths) ? (tenths / 10).toFixed(1) + ' s' : 'never');
export const num = (x, d = 1) => (isFinite(x) ? x.toFixed(d) : 'never');
