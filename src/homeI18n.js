/**
 * The language switch on the home page.
 *
 * The switch happens in place: the copy fades out, changes and fades back in,
 * and the particle field re-forms its phrase in the new language (main.js
 * registers that part with onHomeSwitch). If the field never started, there is
 * nothing to re-form and the page falls back to reloading, which rebuilds it in
 * the stored language.
 *
 * Nothing reloads on arrival: main.js reads the stored language before it
 * builds anything, so a returning visitor is never shown the wrong one.
 */

import { HOME_PT } from './home.pt.js';

const KEY = 'gg-lang';

// Same timings as the case pages' switch (src/case/i18n.js).
const OUT_MS = 180;
const IN_MS = 320;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let switchHandler = null;

/** main.js hands over the particle side of the switch once the field exists. */
export function onHomeSwitch(fn) {
  switchHandler = fn;
}

/**
 * Fade the copy out, run `change` while it is invisible, fade it back in.
 * Under reduced motion the change is simply made.
 */
function crossfade(change, ready = Promise.resolve()) {
  const root = document.documentElement;
  if (reducedMotion) {
    return ready.then(change);
  }
  return new Promise((resolve) => {
    root.classList.add('lang-swapping', 'lang-out');
    // The copy comes back once it has fully faded and the particles are ready
    // to re-form, so the words and the phrase change together.
    Promise.all([new Promise((r) => setTimeout(r, OUT_MS)), ready]).then(() => {
      change();
      requestAnimationFrame(() => {
        root.classList.remove('lang-out');
        setTimeout(() => {
          root.classList.remove('lang-swapping');
          resolve();
        }, IN_MS);
      });
    });
  });
}

export function storedLang() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'pt' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

/**
 * The English copy is the HTML, so it is read off the page rather than listed
 * twice. Read once, before anything is translated: a visitor who arrives in
 * Portuguese has the page translated on load, and reading it afterwards would
 * hand back the Portuguese as "English".
 */
let english = null;
function captureEnglish() {
  if (english) return english;
  const out = {};
  for (const el of document.querySelectorAll('[data-i18n]')) out[el.dataset.i18n] = el.innerHTML;
  out.title = document.title;
  out.description = document.querySelector('meta[name="description"]')?.content ?? '';
  english = out;
  return out;
}

function apply(strings, lang) {
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const v = strings[el.dataset.i18n];
    if (v !== undefined) el.innerHTML = v;
  }
  if (strings.title) document.title = strings.title;
  const meta = document.querySelector('meta[name="description"]');
  if (meta && strings.description) meta.setAttribute('content', strings.description);
  document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
}

/**
 * Put the page into `lang` without touching storage or reloading. Called by
 * main.js on load, before the particle field is built.
 */
export function applyHomeLang(lang) {
  captureEnglish();
  if (lang === 'pt') apply(HOME_PT, 'pt');
}

export function attachHomeToggle(current) {
  const button = document.querySelector('[data-lang-toggle]');
  if (!button) return;

  captureEnglish();
  button.textContent = current === 'pt' ? 'English' : 'Português';

  let busy = false;
  button.addEventListener('click', async () => {
    if (busy) return;
    const next = current === 'pt' ? 'en' : 'pt';
    let stored = true;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      stored = false;
    }

    // Without the field there is no phrase to re-form in place, so a reload
    // rebuilds the page in the stored language. Without storage a reload would
    // come back in the old language, so the copy switches in place instead and
    // the particles keep saying what they said.
    if (!switchHandler && stored) {
      location.reload();
      return;
    }

    busy = true;
    current = next;
    const ready = Promise.resolve(switchHandler?.(next)).catch(() => {});
    await crossfade(() => {
      apply(next === 'pt' ? HOME_PT : english, next);
      button.textContent = next === 'pt' ? 'English' : 'Português';
    }, ready);
    busy = false;
  });
}
