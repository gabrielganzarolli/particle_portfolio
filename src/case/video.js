/**
 * Looping walkthrough videos.
 *
 * The markup already works before this runs: the HTML ships each clip with
 * `autoplay loop muted playsinline` and the native `controls`, so with scripts
 * off the video plays and can still be stopped. What this adds is the quieter
 * custom pause button, playback that only runs while the clip is on screen, and
 * honouring a reduced-motion preference — none of which HTML can express.
 */

const ICON = {
  pause: '<svg viewBox="0 0 12 14" aria-hidden="true"><rect x="0" y="0" width="4" height="14" rx="1"/><rect x="8" y="0" width="4" height="14" rx="1"/></svg>',
  play: '<svg viewBox="0 0 12 14" aria-hidden="true"><path d="M1 0.7 11.2 6.6a.5.5 0 0 1 0 .8L1 13.3A.5.5 0 0 1 0 12.9V1.1A.5.5 0 0 1 1 0.7Z"/></svg>',
};

export function attachVideos(root = document) {
  const videos = Array.from(root.querySelectorAll('.case-video'));
  if (!videos.length) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  for (const video of videos) {
    // Native controls were the no-script answer; from here the custom button is.
    video.controls = false;
    // Playback is driven by the observer below, so the clip is fetched when it
    // is about to be seen rather than all of them at once on load.
    video.removeAttribute('autoplay');

    const holder = document.createElement('div');
    holder.className = 'video-holder';
    video.replaceWith(holder);
    holder.append(video);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'video-toggle';
    holder.append(button);

    const sync = () => {
      const playing = !video.paused;
      button.innerHTML = playing ? ICON.pause : ICON.play;
      button.setAttribute('aria-label', playing ? 'Pause video' : 'Play video');
    };

    // `wanted` is whether the visitor wants this clip running at all, as
    // distinct from whether it happens to be on screen. Without the
    // distinction, pausing a clip and scrolling past it would start it again.
    let wanted = !reducedMotion;

    button.addEventListener('click', () => {
      wanted = video.paused;
      if (wanted) video.play().catch(() => {});
      else video.pause();
      sync();
    });

    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);
    sync();

    if (!('IntersectionObserver' in window)) {
      if (wanted) video.play().catch(() => {});
      continue;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!wanted) return;
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.25 }
    );
    io.observe(video);
  }
}
