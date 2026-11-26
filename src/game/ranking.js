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

/** The line the particles spell on the score screen. */
export function formatScore(seconds, rank, lang) {
  const time = formatTime(seconds, lang);
  if (!rank) return time;
  const nf = new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US');
  return `${time}  ·  #${nf.format(rank.rank)} ${lang === 'pt' ? 'de' : 'of'} ${nf.format(rank.total)}`;
}

/**
 * The whole score screen: the line above, then the best times in two columns
 * (1 to 5 down the left, 6 to 10 down the right). Rows are split by "\n" and
 * the cells of a row by "\t", which the particle text raster lays out. With no
 * top list it is the one line alone.
 */
export function formatScoreboard(seconds, rank, lang) {
  const head = formatScore(seconds, rank, lang);
  const top = rank?.top ?? [];
  if (top.length === 0) return head;
  const half = Math.ceil(top.length / 2);
  const cell = (i) => (i < top.length ? `${i + 1}  ${formatTime(top[i], lang)}` : '');
  const rows = [];
  for (let r = 0; r < half; r++) rows.push(`${cell(r)}\t${cell(r + half)}`.replace(/\t$/, ''));
  return [head, ...rows].join('\n');
}
