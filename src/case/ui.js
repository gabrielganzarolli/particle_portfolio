/**
 * The fixed labels a case page prints around the content — section headings,
 * the hero meta row, the nav and footer. The case prose itself lives in
 * cases.js (English) and cases.pt.js (Portuguese); this is only the furniture.
 *
 * Kept apart from the content files because these strings repeat on every page
 * and would otherwise be retyped five times per language.
 */

export const UI = {
  en: {
    // Hero meta row
    client: 'Client',
    year: 'Year',
    discipline: 'Discipline',
    role: 'Role',
    duration: 'Duration',

    // Section labels
    whatWeDid: 'What I did',
    outcomes: 'Outcomes',
    overview: 'Overview',
    takeaways: (n) => `${n} takeaways`,
    whatMadeItWork: 'What made it work',
    getInTouch: 'Get in touch',
    moreWork: 'More work',

    // Comparison slider, which is operable before any script runs and so needs
    // its accessible names written into the HTML.
    compare: (a, b) => `Compare ${a} and ${b}`,
    compareValue: (a, b) => `50% ${a}, 50% ${b}`,

    // Chrome
    allWork: 'All work',
    backToWork: 'Back to the work',
    home: 'Gabriel Ganzarolli',
    footer: 'Gabriel Ganzarolli — São Paulo',

    // The toggle names the language it switches *to*, not the current one.
    switchTo: 'Português',
    switchToLabel: 'Ver em português',
  },

  pt: {
    client: 'Cliente',
    year: 'Ano',
    discipline: 'Disciplina',
    role: 'Papel',
    duration: 'Duração',

    whatWeDid: 'O que eu fiz',
    outcomes: 'Resultados',
    overview: 'Visão geral',
    takeaways: (n) => (n === 1 ? '1 aprendizado' : `${n} aprendizados`),
    whatMadeItWork: 'O que fez funcionar',
    getInTouch: 'Fale comigo',
    moreWork: 'Mais trabalhos',

    compare: (a, b) => `Comparar ${a} e ${b}`,
    compareValue: (a, b) => `50% ${a}, 50% ${b}`,

    allWork: 'Todos os trabalhos',
    backToWork: 'Voltar para os trabalhos',
    home: 'Gabriel Ganzarolli',
    footer: 'Gabriel Ganzarolli — São Paulo',

    switchTo: 'English',
    switchToLabel: 'View in English',
  },
};

/** The two language codes, in the order the toggle cycles through them. */
export const LANGS = ['en', 'pt'];

/** What goes in `<html lang>` — a bare code is wrong for Brazilian Portuguese. */
export const HTML_LANG = { en: 'en', pt: 'pt-BR' };
