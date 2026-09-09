import { imageUrl } from './images.js';

/**
 * Before/after comparison with a draggable divider.
 *
 * Both images are stacked; the "after" one is revealed by a clip that follows
 * the divider. The two files must share an aspect ratio — the container's
 * height comes from the "before" image, and a mismatched "after" would be
 * letterboxed or cropped against it.
 *
 * On the accessibility of this control, which matters more than usual given
 * what the case is about:
 *   - the handle is a real focusable element with role="slider" and live
 *     aria-valuenow, so it is announced and operable without a mouse
 *   - arrow keys move it, Home/End jump to either end
 *   - both images carry alt text; the comparison is not the only way to see
 *     them, since below 720px the slider is replaced by both images stacked
 *     with visible labels (handled in CSS)
 */

const clamp = (v) => (v < 0 ? 0 : v > 100 ? 100 : v);

export function buildCompare(slug, spec) {
  if (!spec) return null;

  const beforeUrl = imageUrl(slug, spec.before);
  const afterUrl = imageUrl(slug, spec.after);
  if (!beforeUrl || !afterUrl) return null;

  const labelBefore = spec.labelBefore ?? 'Before';
  const labelAfter = spec.labelAfter ?? 'After';

  const fig = document.createElement('figure');
  fig.className = 'compare reveal';

  const frame = document.createElement('div');
  frame.className = 'compare-frame';

  // "Before" sits underneath and defines the box's height.
  const imgBefore = document.createElement('img');
  imgBefore.className = 'compare-img';
  imgBefore.src = beforeUrl;
  imgBefore.alt = `${spec.alt ?? ''} — ${labelBefore.toLowerCase()}`.trim();
  imgBefore.decoding = 'async';
  frame.appendChild(imgBefore);

  // "After" is clipped to the divider position.
  const afterWrap = document.createElement('div');
  afterWrap.className = 'compare-after';
  const imgAfter = document.createElement('img');
  imgAfter.className = 'compare-img';
  imgAfter.src = afterUrl;
  imgAfter.alt = `${spec.alt ?? ''} — ${labelAfter.toLowerCase()}`.trim();
  imgAfter.decoding = 'async';
  afterWrap.appendChild(imgAfter);
  frame.appendChild(afterWrap);

  const tagBefore = document.createElement('span');
  tagBefore.className = 'compare-tag is-before';
  tagBefore.textContent = labelBefore;
  frame.appendChild(tagBefore);

  const tagAfter = document.createElement('span');
  tagAfter.className = 'compare-tag is-after';
  tagAfter.textContent = labelAfter;
  frame.appendChild(tagAfter);

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'compare-handle';
  handle.setAttribute('role', 'slider');
  handle.setAttribute('aria-label', `Compare ${labelBefore.toLowerCase()} and ${labelAfter.toLowerCase()}`);
  handle.setAttribute('aria-valuemin', '0');
  handle.setAttribute('aria-valuemax', '100');
  handle.setAttribute('aria-orientation', 'horizontal');
  frame.appendChild(handle);

  fig.appendChild(frame);
  if (spec.caption) {
    const cap = document.createElement('figcaption');
    cap.textContent = spec.caption;
    fig.appendChild(cap);
  }

  // --- behaviour ---------------------------------------------------------
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
  apply();

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

  return fig;
}
