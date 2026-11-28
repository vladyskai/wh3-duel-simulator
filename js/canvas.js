// The endless canvas: a "world" element (page elements and drawings, positioned in world
// units = pixels at zoom 1) moved and scaled inside a box that fills the window.
// Drag to move, mouse wheel or two-finger pinch to zoom around the pointer.
// Keys: + and - zoom, 0 shows everything, arrows move.
// Dragging starts anywhere except on something you can use (buttons, sliders, links, the
// "Formula" toggles), so the cards can be read and used in place.
const INTERACTIVE = 'input, button, select, textarea, a, summary, label, [data-nodrag]';

export function makeCanvas(box, world, { bounds, insets = () => ({ left: 0, top: 0 }) } = {}) {
  const view = { k: 1, x: 0, y: 0 };
  let anim = 0;
  const apply = () => {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
    // The dotted background moves and scales with the world.
    box.style.backgroundSize = `${40 * view.k}px ${40 * view.k}px`;
    box.style.backgroundPosition = `${view.x}px ${view.y}px`;
  };
  function zoomAt(cx, cy, f) {
    cancelAnimationFrame(anim);
    const k = Math.min(4, Math.max(0.02, view.k * f));
    f = k / view.k;
    view.x = cx - (cx - view.x) * f; view.y = cy - (cy - view.y) * f; view.k = k;
    apply();
  }
  const centre = () => [box.clientWidth / 2, box.clientHeight / 2];

  // Bring a world rectangle {x0, y0, x1, y1} into view, at most at zoom maxK, beside the
  // floating windows (insets). Glides there unless animate is false.
  function showRect(r, { maxK = 1, animate = true } = {}) {
    const ins = insets(), cw = box.clientWidth, ch = box.clientHeight;
    const aw = cw - ins.left - (ins.right || 0) - 32, ah = ch - ins.top - 24;
    if (aw <= 0 || ah <= 0) return false;
    const w = r.x1 - r.x0, h = r.y1 - r.y0;
    if (!(w > 0 && h > 0) || ![r.x0, r.y0, w, h].every(Number.isFinite)) return false;
    const k = Math.max(0.02, Math.min(maxK, aw / w, ah / h));
    const to = { k, x: ins.left + 16 + (aw - w * k) / 2 - r.x0 * k, y: ins.top + 12 + (ah - h * k) / 2 - r.y0 * k };
    cancelAnimationFrame(anim);
    if (!animate) { Object.assign(view, to); apply(); return true; }
    const from = { ...view }, t0 = performance.now(), dur = 450;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur), e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      // Zoom glides evenly in proportion (log scale), the position follows it.
      view.k = from.k * (to.k / from.k) ** e;
      view.x = from.x + (to.x - from.x) * e;
      view.y = from.y + (to.y - from.y) * e;
      apply();
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
    return true;
  }
  const fit = () => showRect(bounds(), { maxK: 4 });

  const pts = new Map();
  const rel = (e) => { const r = box.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  box.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [x, y] = rel(e);
    zoomAt(x, y, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  box.addEventListener('pointerdown', (e) => {
    if (e.target.closest(INTERACTIVE)) return;
    cancelAnimationFrame(anim);
    try { box.setPointerCapture(e.pointerId); } catch { /* no capture: dragging still works inside the box */ }
    pts.set(e.pointerId, rel(e));
    box.classList.add('dragging');
  });
  box.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const now = rel(e), prev = pts.get(e.pointerId);
    if (pts.size === 1) {
      view.x += now[0] - prev[0]; view.y += now[1] - prev[1]; apply();
    } else if (pts.size === 2) {
      // Two fingers: zoom by the change in their distance, around their midpoint.
      const [o] = [...pts.entries()].filter(([id]) => id !== e.pointerId).map(([, v]) => v);
      const d0 = Math.hypot(prev[0] - o[0], prev[1] - o[1]), d1 = Math.hypot(now[0] - o[0], now[1] - o[1]);
      if (d0 > 0) zoomAt((now[0] + o[0]) / 2, (now[1] + o[1]) / 2, d1 / d0);
    }
    pts.set(e.pointerId, now);
  });
  const end = (e) => { pts.delete(e.pointerId); if (!pts.size) box.classList.remove('dragging'); };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    const step = 80;
    if (e.key === '+' || e.key === '=') zoomAt(...centre(), 1.25);
    else if (e.key === '-') zoomAt(...centre(), 0.8);
    else if (e.key === '0') fit();
    else if (e.key === 'ArrowLeft') { view.x += step; apply(); }
    else if (e.key === 'ArrowRight') { view.x -= step; apply(); }
    else if (e.key === 'ArrowUp') { view.y += step; apply(); }
    else if (e.key === 'ArrowDown') { view.y -= step; apply(); }
    else return;
    e.preventDefault();
  });
  apply();
  return { showRect, fit, zoomIn: () => zoomAt(...centre(), 1.4), zoomOut: () => zoomAt(...centre(), 1 / 1.4) };
}
