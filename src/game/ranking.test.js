import test from 'node:test';
import assert from 'node:assert/strict';

import { RANK_URL, RANK_WAIT_MS, parseRank, submitPlay, formatScoreboard } from './ranking.js';

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('parseRank accepts a rank within the total, as whole numbers', () => {
  assert.deepEqual(parseRank({ rank: 37, total: 1204 }), { rank: 37, total: 1204, top: [] });
  assert.deepEqual(parseRank({ rank: 1, total: 1 }), { rank: 1, total: 1, top: [] });
});

test('parseRank refuses anything else', () => {
  for (const bad of [null, undefined, 3, 'x', {}, { rank: 0, total: 5 }, { rank: 6, total: 5 }, { rank: 1.5, total: 5 }, { rank: '2', total: 5 }, { rank: NaN, total: 5 }, { rank: 2, total: Infinity }]) {
    assert.equal(parseRank(bad), null, JSON.stringify(bad));
  }
});

test('submitPlay posts the time as JSON, rounded to the one decimal the screen shows', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return json(200, { rank: 4, total: 9 });
  };
  const r = await submitPlay(42.349, { fetchImpl });
  assert.deepEqual(r, { rank: 4, total: 9, top: [] });
  assert.equal(seen.url, RANK_URL);
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(seen.init.body), { seconds: 42.3 });
});

test('submitPlay gives null, never throws, when the server cannot answer', async () => {
  assert.equal(await submitPlay(5, { fetchImpl: async () => json(503, { error: 'not-configured' }) }), null);
  assert.equal(await submitPlay(5, { fetchImpl: async () => json(429, { error: 'rate' }) }), null);
  assert.equal(await submitPlay(5, { fetchImpl: async () => { throw new TypeError('offline'); } }), null);
  assert.equal(await submitPlay(5, { fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } }) }), null);
  assert.equal(await submitPlay(5, { fetchImpl: async () => json(200, { rank: 9, total: 3 }) }), null, 'a rank beyond the total is not believed');
  assert.equal(await submitPlay(5, { fetchImpl: null }), null);
});

test('submitPlay stops waiting after the timeout and aborts the request', async () => {
  let aborted = false;
  const fetchImpl = (url, init) =>
    new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        aborted = true;
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
  const t0 = Date.now();
  const r = await submitPlay(5, { fetchImpl, timeoutMs: 40 });
  assert.equal(r, null);
  assert.equal(aborted, true);
  assert.ok(Date.now() - t0 < 1000);
});

test('the default wait leaves the score time to build before the score phase', () => {
  assert.ok(RANK_WAIT_MS > 0 && RANK_WAIT_MS <= 1500);
});

test('a time that is not a finite number is never sent', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return json(200, { rank: 1, total: 1 });
  };
  for (const bad of [NaN, Infinity, -1, 'x', undefined]) {
    assert.equal(await submitPlay(bad, { fetchImpl }), null);
  }
  assert.equal(called, false);
});

test('parseRank keeps a believable top list, best first, and drops a bad one', () => {
  assert.deepEqual(parseRank({ rank: 2, total: 9, top: [90.1, 88, 88, 12] }).top, [90.1, 88, 88, 12]);
  const bad = [[1, 2], [5, NaN], [5, -1], ['5'], new Array(6).fill(5), 'x', {}];
  for (const top of bad) assert.deepEqual(parseRank({ rank: 2, total: 9, top }).top, [], JSON.stringify(top));
  assert.deepEqual(parseRank({ rank: 2, total: 9 }).top, []);
});

test('formatScoreboard: no place is the time alone, plain', () => {
  assert.equal(formatScoreboard(42.34, null, 'pt'), '42,3 s');
  assert.equal(formatScoreboard(42.34, null, 'en'), '42.3 s');
});

test('formatScoreboard: with no list, the time large and the place under it, in the page language', () => {
  assert.equal(formatScoreboard(42.34, { rank: 37, total: 1204, top: [] }, 'pt'), '{2.6}42,3 s\n{1.1|0.8}#37 de 1.204');
  assert.equal(formatScoreboard(42.34, { rank: 37, total: 1204, top: [] }, 'en'), '{2.6}42.3 s\n{1.1|0.8}#37 of 1,204');
});

const d = (n, t, a = 0.85) => `{1|${a}}${n}  ${t}`;

test('formatScoreboard: the player on one side, the best 5 times on the other', () => {
  const top = [99, 98, 97, 96, 95];
  const [mine, list] = formatScoreboard(42.3, { rank: 37, total: 1204, top }, 'pt').split('\f');
  assert.equal(mine, '{2.6}42,3 s\n{1.1|0.8}#37 de 1.204');
  assert.equal(list, `{<}${[d(1, '99,0 s'), d(2, '98,0 s'), d(3, '97,0 s'), d(4, '96,0 s'), d(5, '95,0 s')].join('\n')}`);
});

test('formatScoreboard: the player\'s own entry, when in the list, is at full density', () => {
  const top = [99, 98, 97, 96, 95];
  const list = formatScoreboard(97, { rank: 3, total: 50, top }, 'en').split('\f')[1].split('\n');
  assert.equal(list[2], d(3, '97.0 s', 1));
  assert.equal(list.filter((r) => r.includes('{1|1}')).length, 1);
});

test('formatScoreboard: outside the top 5 nobody is marked; a short list is just shorter', () => {
  const three = formatScoreboard(5, { rank: 37, total: 50, top: [9, 8, 7] }, 'en').split('\f')[1].split('\n');
  assert.equal(three.filter((r) => r.includes('{1|1}')).length, 0);
  assert.equal(three.length, 3);
  const one = formatScoreboard(5, { rank: 1, total: 1, top: [5] }, 'en').split('\f')[1];
  assert.equal(one, `{<}${d(1, '5.0 s', 1)}`);
});
