import test from 'node:test';
import assert from 'node:assert/strict';

import { SET_KEY, TOP_N, MIN_SECONDS, MAX_SECONDS, RATE_LIMIT, parseSeconds, clientKey, redisConfig, makeRedis, handleRank } from './_rank.js';

const hash = (s) => `h(${s})`;
const randomId = () => 'id1';

// A recorder standing in for Redis: answers each pipeline with `replies`.
function fakeRedis(...replies) {
  const calls = [];
  const fn = async (commands) => {
    calls.push(commands);
    const r = replies.shift();
    if (r instanceof Error) throw r;
    return r;
  };
  fn.calls = calls;
  return fn;
}
const post = (body, headers = { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }) => ({ method: 'POST', body, headers });

test('parseSeconds accepts a plausible time and keeps one decimal', () => {
  assert.equal(parseSeconds({ seconds: 42.3 }), 42.3);
  assert.equal(parseSeconds({ seconds: 42.349 }), 42.3);
  assert.equal(parseSeconds({ seconds: MIN_SECONDS }), MIN_SECONDS);
  assert.equal(parseSeconds({ seconds: MAX_SECONDS }), MAX_SECONDS);
});

test('parseSeconds refuses everything else', () => {
  const bad = [null, undefined, 5, 'x', {}, { seconds: '42' }, { seconds: NaN }, { seconds: Infinity }, { seconds: -3 }, { seconds: 0 }, { seconds: MIN_SECONDS - 0.2 }, { seconds: MAX_SECONDS + 1 }, { seconds: [1] }];
  for (const b of bad) assert.equal(parseSeconds(b), null, JSON.stringify(b));
});

test('clientKey takes the first address of x-forwarded-for, then x-real-ip', () => {
  assert.equal(clientKey({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }), '203.0.113.9');
  assert.equal(clientKey({ 'x-real-ip': '198.51.100.7' }), '198.51.100.7');
  assert.equal(clientKey({}), 'unknown');
  assert.equal(clientKey(undefined), 'unknown');
});

test('redisConfig reads the Vercel KV names, then the Upstash ones, else null', () => {
  assert.deepEqual(redisConfig({ KV_REST_API_URL: 'https://a', KV_REST_API_TOKEN: 't1' }), { url: 'https://a', token: 't1' });
  assert.deepEqual(redisConfig({ UPSTASH_REDIS_REST_URL: 'https://b', UPSTASH_REDIS_REST_TOKEN: 't2' }), { url: 'https://b', token: 't2' });
  assert.equal(redisConfig({ KV_REST_API_URL: 'https://a' }), null);
  assert.equal(redisConfig({}), null);
});

test('makeRedis posts the commands to /pipeline with the bearer token and returns the results', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return { ok: true, status: 200, json: async () => [{ result: 1 }, { result: 'OK' }] };
  };
  const redis = makeRedis({ url: 'https://r.example/', token: 'tok' }, fetchImpl);
  const out = await redis([['INCR', 'k'], ['SET', 'a', 'b']]);
  assert.deepEqual(out, [1, 'OK']);
  assert.equal(seen.url, 'https://r.example/pipeline');
  assert.equal(seen.init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(seen.init.body), [['INCR', 'k'], ['SET', 'a', 'b']]);
});

test('makeRedis throws when Redis answers an error or a bad status', async () => {
  const bad = makeRedis({ url: 'https://r', token: 't' }, async () => ({ ok: true, status: 200, json: async () => [{ error: 'ERR boom' }] }));
  await assert.rejects(() => bad([['X']]), /boom/);
  const down = makeRedis({ url: 'https://r', token: 't' }, async () => ({ ok: false, status: 500, json: async () => ({}) }));
  await assert.rejects(() => down([['X']]), /500/);
});

test('handleRank: only POST', async () => {
  const r = await handleRank({ method: 'GET', body: undefined, headers: {} }, { redis: fakeRedis(), hash, randomId });
  assert.equal(r.status, 405);
  assert.equal(r.headers.Allow, 'POST');
});

test('handleRank: 503 when no storage is configured', async () => {
  const r = await handleRank(post({ seconds: 10 }), { redis: null, hash, randomId });
  assert.deepEqual(r, { status: 503, body: { error: 'not-configured' } });
});

test('handleRank: 400 for a time that is not believable, and nothing is stored', async () => {
  const redis = fakeRedis();
  for (const body of [undefined, {}, { seconds: 'x' }, { seconds: 0 }, { seconds: 99999 }]) {
    const r = await handleRank(post(body), { redis, hash, randomId });
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  assert.equal(redis.calls.length, 0);
});

test('handleRank: counts the plays, stores one, and answers the rank among all of them', async () => {
  // rate-limit pipeline [INCR, EXPIRE]; then [ZADD, ZCOUNT greater, ZCARD]
  const redis = fakeRedis([1, 1], [1, 36, 1204, ['a', '90.1', 'b', '88']]);
  const r = await handleRank(post({ seconds: 42.3 }), { redis, hash, randomId });
  assert.deepEqual(r, { status: 200, body: { rank: 37, total: 1204, top: [90.1, 88] } });
  assert.deepEqual(redis.calls[0], [['INCR', 'rl:h(203.0.113.9)'], ['EXPIRE', 'rl:h(203.0.113.9)', '3600', 'NX']]);
  assert.deepEqual(redis.calls[1], [['ZADD', SET_KEY, '42.3', 'id1'], ['ZCOUNT', SET_KEY, '(42.3', '+inf'], ['ZCARD', SET_KEY], ['ZREVRANGE', SET_KEY, '0', String(TOP_N - 1), 'WITHSCORES']]);
});

test('handleRank: the best time so far is rank 1; equal times share a rank', async () => {
  const first = await handleRank(post({ seconds: 20 }), { redis: fakeRedis([1, 1], [1, 0, 1, ['x', '20']]), hash, randomId });
  assert.deepEqual(first.body, { rank: 1, total: 1, top: [20] });
  // two others already had exactly 20.0: nobody is strictly better, so rank 1 of 3
  const tie = await handleRank(post({ seconds: 20 }), { redis: fakeRedis([1, 1], [1, 0, 3, ['x', '20', 'y', '20', 'z', '20']]), hash, randomId });
  assert.deepEqual(tie.body, { rank: 1, total: 3, top: [20, 20, 20] });
});

test('handleRank: 429 over the hourly limit, and nothing is stored', async () => {
  const redis = fakeRedis([RATE_LIMIT + 1, 0]);
  const r = await handleRank(post({ seconds: 42.3 }), { redis, hash, randomId });
  assert.equal(r.status, 429);
  assert.equal(redis.calls.length, 1);
  const ok = await handleRank(post({ seconds: 42.3 }), { redis: fakeRedis([RATE_LIMIT, 0], [1, 0, 1, ['x', '42.3']]), hash, randomId });
  assert.equal(ok.status, 200, 'exactly the limit is still allowed');
});

test('handleRank: 502 when storage fails, with no detail about it', async () => {
  const r = await handleRank(post({ seconds: 42.3 }), { redis: fakeRedis(new Error('secret url leaked')), hash, randomId });
  assert.deepEqual(r, { status: 502, body: { error: 'storage' } });
});

test('handleRank: Redis only ever sees a hash of the address, never the address', async () => {
  const redis = fakeRedis([1, 1], [1, 0, 1, ['x', '10']]);
  await handleRank(post({ seconds: 10 }, { 'x-forwarded-for': '198.51.100.7' }), { redis, hash: () => 'opaque', randomId });
  assert.ok(!JSON.stringify(redis.calls).includes('198.51.100.7'));
  assert.equal(redis.calls[0][0][1], 'rl:opaque');
});

test('handleRank: the top carries only times, never the ids of the plays', async () => {
  const redis = fakeRedis([1, 1], [1, 0, 2, ['secret-id-1', '50.5', 'secret-id-2', '49']]);
  const r = await handleRank(post({ seconds: 49 }), { redis, hash, randomId });
  assert.ok(!JSON.stringify(r.body).includes('secret-id'));
  assert.deepEqual(r.body.top, [50.5, 49]);
});
