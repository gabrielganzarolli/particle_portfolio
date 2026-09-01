export function createOverlay({ reducedMotion, coarsePointer }) {
  const hint = document.querySelector('.hint');
  if (!hint) return;

  if (reducedMotion) hint.textContent = 'Reduced motion — animation held still';
  else if (coarsePointer) hint.textContent = 'Tap the name';
  else hint.textContent = 'Hover the name';
}

export function hidePreloader() {
  const el = document.querySelector('.preloader');
  if (!el) return;
  el.classList.add('is-hidden');

  // transitionend alone never fires in a hidden tab or under reduced motion, so
  // the node would linger forever. Whichever comes first wins.
  const remove = () => el.remove();
  el.addEventListener('transitionend', remove, { once: true });
  setTimeout(remove, 1000);
}

export function showFatal(message) {
  hidePreloader();
  const el = document.createElement('div');
  el.className = 'fatal';
  el.textContent = message;
  document.body.appendChild(el);
}
