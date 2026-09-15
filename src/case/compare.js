/**
 * Drag and keyboard behaviour for the before/after comparison.
 *
 * The markup is already in the HTML (see renderHtml.js) — this only attaches
 * behaviour. With scripts disabled the control still renders at its resting
 * 50%, both images are visible and both carry alt text, so nothing is lost
 * except the dragging.
 *
 * On accessibility, which matters more than usual given what the case is about:
 *   - the handle is a real focusable button with role="slider" and live
 *     aria-valuenow, so it is announced and operable without a mouse
 *   - arrow keys move it, Shift multiplies the step, Home/End jump to an end
 *   - below 720px the slider is replaced by both images stacked with visible
 *     labels, because dragging on a phone hides half the screen behind a thumb
 */

const clamp = (v) => (v < 0 ? 0 : v > 100 ? 100 : v);

export function attachCompare(root = document) {
  const frame = root.querySelector('.compare-frame');
  if (!frame) return;

  const handle = frame.querySelector('.compare-handle');
  const labelBefore = frame.querySelector('.compare-tag.is-before')?.textContent ?? 'Before';
  const labelAfter = frame.querySelector('.compare-tag.is-after')?.textContent ?? 'After';
  if (!handle) return;

  let pct = 50;

  function apply() {
    // A single custom property drives the clip and the handle together, so the
    // two can never drift apart.
    frame.style.setProperty('--pos', `${pct}%`);
    // `pct` is the divider position from the left, which is also how much of
    // the "before" image is showing.
    const n = Math.round(pct);
    handle.setAttribute('aria-valuenow', String(n));
    handle.setAttribute(
      'aria-valuetext',
      `${n}% ${labelBefore.toLowerCase()}, ${100 - n}% ${labelAfter.toLowerCase()}`
    );
  }

  function setFromClientX(clientX) {
    const r = frame.getBoundingClientRect();
    if (!r.width) return;
    pct = clamp(((clientX - r.left) / r.width) * 100);
    apply();
  }

  let dragging = false;

  frame.addEventListener('pointerdown', (e) => {
    dragging = true;
    frame.setPointerCapture(e.pointerId);
    setFromClientX(e.clientX);
    handle.focus({ preventScroll: true });
  });

  frame.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    // Only with a button held: pointermove fires on hover too.
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      dragging = false;
      return;
    }
    setFromClientX(e.clientX);
  });

  const stop = (e) => {
    if (!dragging) return;
    dragging = false;
    if (e.pointerId != null && frame.hasPointerCapture?.(e.pointerId)) {
      frame.releasePointerCapture(e.pointerId);
    }
  };
  frame.addEventListener('pointerup', stop);
  frame.addEventListener('pointercancel', stop);

  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 2;
    let next = pct;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = pct - step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = pct + step;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 100;
    else return;

    e.preventDefault();
    pct = clamp(next);
    apply();
  });
}
