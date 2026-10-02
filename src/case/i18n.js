/**
 * The language switch on a case page.
 *
 * The page ships in English. The Portuguese version of the same page was
 * rendered at build time and sits in a JSON script tag, so switching is a
 * swap of already-finished markup rather than anything assembled here — the
 * browser never builds a sentence.
 *
 * If this module fails to load the page stays in English and stays readable;
 * the button is the only thing that stops working.
 */

const KEY = 'gg-lang';

/** The language the visitor last chose, if they have been here before. */
export function storedLang() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'pt' || v === 'en' ? v : null;
  } catch {
    return null; // private mode, or storage disabled
  }
}

function remember(lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* the switch still works for this page view */
  }
}

const setMeta = (name, value) => {
  const el = document.querySelector(`meta[name="${name}"]`);
  if (el && value) el.setAttribute('content', value);
};

/**
 * Attach the switch. `onSwap` runs after new markup is in place, so the caller
 * can rebind whatever was observing the old nodes.
 */
export function attachLangToggle({ onSwap } = {}) {
  const button = document.querySelector('[data-lang-toggle]');
  const payload = document.getElementById('i18n-pt');
  const target = document.getElementById('case');
  if (!button || !payload || !target) return; // untranslated page: no switch to offer

  let pt;
  try {
    pt = JSON.parse(payload.textContent);
  } catch {
    button.remove(); // a switch that cannot switch is worse than none
    return;
  }

  // The English page is already on screen; keep it rather than shipping it twice.
  const en = { ...pt.en, html: target.innerHTML };
  const versions = { en, pt };
  let current = 'en';

  function show(lang) {
    const v = versions[lang];
    if (!v || lang === current) return;

    target.innerHTML = v.html;
    document.documentElement.lang = v.lang;
    document.title = v.title;
    setMeta('description', v.description);

    for (const el of document.querySelectorAll('[data-i18n]')) {
      const label = v.ui?.[el.dataset.i18n];
      if (label) el.textContent = label;
    }

    // The button names where it goes, not where you are.
    button.textContent = v.ui?.switchTo ?? button.textContent;

    current = lang;
    remember(lang);
    onSwap?.(target);
  }

  button.addEventListener('click', () => show(current === 'en' ? 'pt' : 'en'));

  // A returning visitor who chose Portuguese gets it without touching anything.
  const preferred = storedLang();
  if (preferred && preferred !== current) show(preferred);
}
