/**
 * Looping walkthrough videos.
 *
 * The markup already works before this runs: the HTML ships each clip with
 * `autoplay loop muted playsinline` and a poster, so with scripts off the clip
 * plays. What this adds is playback that only runs while the clip is on screen,
 * and honouring a reduced-motion preference — neither of which HTML can say.
 *
 * There is no visible control, by request. That makes the two rules below the
 * only thing standing between a visitor and motion they did not ask for, so
 * they are worth keeping: nothing plays under `prefers-reduced-motion: reduce`,
 * and nothing plays off screen.
 */

export function attachVideos(root = document) {
  const videos = Array.from(root.querySelectorAll('.case-video'));
  if (!videos.length) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  for (const video of videos) {
    if (reducedMotion) {
      video.removeAttribute('autoplay');
      video.pause();
      continue; // poster only, for as long as the preference holds
    }

    // Playback is driven by the observer below, so a clip is fetched when it is
    // about to be seen rather than all of them together on load.
    video.removeAttribute('autoplay');

    if (!('IntersectionObserver' in window)) {
      video.play().catch(() => {});
      continue;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.25 }
    );
    io.observe(video);
  }
}
