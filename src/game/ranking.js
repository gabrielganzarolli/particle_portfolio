// The ranking, as the browser sees it: send the time of a play to /api/rank
// (api/rank.js) and get back its place among all the plays. Anything that goes
// wrong (no server, not configured, slow, over the limit, a garbled answer)
// gives null, and the score screen shows the time alone, as it did before.
import { formatTime } from './text.js';

export const RANK_URL = '/api/rank';
// Waited for the place, from the crash: the score text is built meanwhile, and
// the score phase starts 1.5 s after the crash.
export const RANK_WAIT_MS = 1200;

export const TOP_N = 10;

/**
 * `{ rank, total, top }` as whole numbers with rank within total, else null.
 * `top` is the best times, best first; anything unbelievable in it gives [].
 */
export function parseRank(json) {
  if (!json || typeof json !== 'object') return null;
  const { rank, total } = json;
  if (!Number.isInteger(rank) || !Number.isInteger(total)) return null;
  if (rank < 1 || rank > total) return null;
  const t = json.top;
  const ok = Array.isArray(t) && t.length <= TOP_N && t.every((x, i) => Number.isFinite(x) && x > 0 && (i === 0 || x <= t[i - 1]));
  return { rank, total, top: ok ? t : [] };
}

/**
 * Send one play's time. Resolves to `{ rank, total }`, or null on any failure.
 * The time goes with the one decimal the score screen shows.
 */
export async function submitPlay(seconds, { fetchImpl = globalThis.fetch, timeoutMs = RANK_WAIT_MS, url = RANK_URL } = {}) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return null;
  if (typeof fetchImpl !== 'function') return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seconds: Number(seconds.toFixed(1)) }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return parseRank(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The whole score screen, as particle text with a hierarchy: the time large,
 * the place under it, then the best times in two columns (1 to 5
 * down the left, 6 to 10 down the right) with the player's own entry, when it
 * is among them, at full density. Rows are split by "\n", the cells of a row
 * by "\t", and "{scale|alpha}" sizes and dims a cell (see rasterizeRows in
 * textTargets.js). With no place it is the time alone.
 */
export function formatScoreboard(seconds, rank, lang) {
  const time = formatTime(seconds, lang);
  if (!rank) return time;
  const nf = new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US');
  // Size carries the hierarchy and density only nudges it: with bloom, a dense
  // large line saturates into a blob and a sparse small one dissolves.
  const rows = [`{1.8}${time}`, `{1|0.8}#${nf.format(rank.rank)} ${lang === 'pt' ? 'de' : 'of'} ${nf.format(rank.total)}`];
  const top = rank.top ?? [];
  if (top.length > 0) {
    // Entry rank.rank - 1 is the player's own when the time is in the list.
    const mine = top[rank.rank - 1] === Number(seconds.toFixed(1)) ? rank.rank - 1 : -1;
    // Two columns (1 to 5 on the left, 6 to 10 on the right). Every row has all
    // the columns, empty cells included, so they line up.
    const cols = Math.min(2, top.length);
    const per = Math.ceil(top.length / cols);
    const cell = (i) => (i < top.length ? `{1|${i === mine ? 1 : 0.85}}${i + 1}  ${formatTime(top[i], lang)}` : '');
    rows.push('{0.35}');
    for (let r = 0; r < per; r++) rows.push(Array.from({ length: cols }, (_, c) => cell(r + c * per)).join('\t'));
  }
  return rows.join('\n');
}
