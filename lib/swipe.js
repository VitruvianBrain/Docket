// iOS-style swipe actions for list rows (touch only). Swipe left = trailing actions, swipe right = leading actions.
// A long swipe runs the outermost action, exactly like Mail.
const W = 84;
let openRow = null;

export function attachSwipe(wrap, cell, { leading = [], trailing = [] }, build) {
  const underL = build.under('l', leading);
  const underR = build.under('r', trailing);
  wrap.prepend(underL, underR);
  const maxL = leading.length * W, maxR = trailing.length * W;
  let sx = 0, sy = 0, base = 0, x = 0, locked = null, moved = false;

  function set(px, animate) {
    x = px;
    cell.style.transition = animate ? 'transform .28s cubic-bezier(.2,.8,.2,1)' : 'none';
    cell.style.transform = px ? `translateX(${px}px)` : '';
    underL.style.width = px > 0 ? px + 'px' : '0';
    underR.style.width = px < 0 ? -px + 'px' : '0';
  }
  wrap.__close = () => { set(0, true); if (openRow === wrap) openRow = null; };

  async function run(action, dir) {
    set(dir * wrap.offsetWidth, true);
    await new Promise(r => setTimeout(r, 180));
    await action.fn();
    set(0, false);
  }
  underL.addEventListener('click', e => { const i = [...underL.children].indexOf(e.target.closest('button')); if (i >= 0) run(leading[i], 1); });
  underR.addEventListener('click', e => { const i = [...underR.children].indexOf(e.target.closest('button')); if (i >= 0) run(trailing[i], -1); });

  cell.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    if (openRow && openRow !== wrap) openRow.__close();
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; base = x; locked = null; moved = false;
  }, { passive: true });

  cell.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if (!locked && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (locked !== 'x') return;
    e.preventDefault();
    moved = true;
    let px = base + dx;
    if (px > 0 && !leading.length) px = 0;
    if (px < 0 && !trailing.length) px = 0;
    set(px, false);
  }, { passive: false });

  cell.addEventListener('touchend', () => {
    if (locked !== 'x') return;
    const full = wrap.offsetWidth * 0.55;
    if (x < -full && trailing.length) return run(trailing[trailing.length - 1], -1);
    if (x > full && leading.length) return run(leading[0], 1);
    if (x < -W * 0.5 && trailing.length) { set(-maxR, true); openRow = wrap; return; }
    if (x > W * 0.5 && leading.length) { set(maxL, true); openRow = wrap; return; }
    set(0, true);
    if (openRow === wrap) openRow = null;
  });

  // A tap while a row is open closes it instead of opening the article; a swipe never counts as a tap.
  wrap.addEventListener('click', e => {
    if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
    if (x !== 0 && cell.contains(e.target)) { e.preventDefault(); e.stopPropagation(); wrap.__close(); }
  }, true);
}
