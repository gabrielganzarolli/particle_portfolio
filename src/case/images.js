// Every image under src/images, resolved to its final hashed URL at build time.
// Going through Vite rather than a public/ folder matters here: case pages live
// at /work/*.html while assets land in /assets, and `base: './'` means a
// hand-written relative path would resolve differently per page depth. The
// bundler works the correct path out for each entry.
const FILES = import.meta.glob('../images/**/*.{png,jpg,jpeg,webp,avif}', {
  eager: true,
  import: 'default',
});

// Basename -> URL, so a case can name "03-spin-and-draws.png" and still resolve
// after that file is re-encoded as .jpg or .webp. Case briefs specify canonical
// filenames; how a given asset ends up encoded is a build concern, and the two
// shouldn't be coupled.
const BY_BASENAME = new Map(
  Object.entries(FILES).map(([path, url]) => {
    const noExt = path.replace(/^\.\.\/images\//, '').replace(/\.[^./]+$/, '');
    return [noExt, url];
  })
);

/**
 * Resolve one image for a case, or null if that file has not been added yet.
 *
 * Returning null rather than throwing is deliberate: a case can be published
 * with only some of its imagery in place, and dropping the remaining files into
 * src/images/<slug>/ makes them appear with no code change. Missing files are
 * listed once in the console during development.
 */
export function imageUrl(slug, file) {
  return BY_BASENAME.get(`${slug}/${file.replace(/\.[^./]+$/, '')}`) ?? null;
}

export function reportMissing(slug, images) {
  if (!import.meta.env.DEV) return;
  const missing = images.filter((i) => !imageUrl(slug, i.src)).map((i) => i.src);
  if (missing.length) {
    console.info(
      `[case:${slug}] ${missing.length} image(s) not yet added to src/images/${slug}/:\n  ` +
        missing.join('\n  ')
    );
  }
}
