// Copy helpers. Pure.
export function formatTime(seconds, lang) {
  const n = seconds.toFixed(1);
  return `${lang === 'pt' ? n.replace('.', ',') : n} s`;
}

export function exitLabel(lang) {
  return lang === 'pt' ? 'Voltar ao nome' : 'Back to the name';
}
