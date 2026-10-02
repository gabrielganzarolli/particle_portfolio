/**
 * The language switch on the home page.
 *
 * Unlike a case page, this one reloads when switched. The particle field
 * rasterises each phrase to a texture when it is constructed and exposes no way
 * to replace them, so making the hero read TRABALHOS instead of WORK means
 * building the field again. Reloading does that with no new surface area in the
 * most delicate file in the project — and the choice is stored first, so the
 * page comes back already in the right language.
 *
 * Nothing reloads on arrival: main.js reads the stored language before it
 * builds anything, so a returning visitor is never shown the wrong one.
 */

import { HOME_PT } from './home.pt.js';

const KEY = 'gg-lang';

export function storedLang() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'pt' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

/** The English copy is the HTML, so it is read off the page rather than listed twice. */
function captureEnglish() {
  const out = {};
  for (const el of document.querySelectorAll('[data-i18n]')) out[el.dataset.i18n] = el.innerHTML;
  out.title = document.title;
  out.description = document.querySelector('meta[name="description"]')?.content ?? '';
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
  if (lang === 'pt') apply(HOME_PT, 'pt');
}

export function attachHomeToggle(current) {
  const button = document.querySelector('[data-lang-toggle]');
  if (!button) return;

  const english = captureEnglish();
  button.textContent = current === 'pt' ? 'English' : 'Português';

  button.addEventListener('click', () => {
    const next = current === 'pt' ? 'en' : 'pt';
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage is unavailable, so a reload would come back in the old
      // language and look like the button is broken. Switch the text in place
      // instead and leave the particles saying what they said.
      apply(next === 'pt' ? HOME_PT : english, next);
      current = next;
      button.textContent = next === 'pt' ? 'English' : 'Português';
      return;
    }
    location.reload();
  });
}
