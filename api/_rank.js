// The ranking's server side, without the Vercel and Node specifics so it can be
// tested in plain Node (api/rank.js is the thin adapter). The files here start
// with an underscore, which Vercel does not publish as endpoints.
//
// Storage is one Redis sorted set: a member per play (a random id), scored by
// the play's time in seconds. A play's place is 1 plus the number of plays with
// a strictly longer time, so equal times share a place. The answer also carries
// the TOP_N best times (the times only). Redis is reached over
// the Upstash REST API with fetch (no dependency).

export const SET_KEY = 'ship:times';
export const MIN_SECONDS = 0.5; // nobody survives less than this
export const MAX_SECONDS = 3600; // nor, in practice, more than an hour
export const RATE_LIMIT = 200; // plays accepted per address per window
export const RATE_WINDOW_S = 3600;
export const TOP_N = 10; // the best times sent back with the place

/** The time as one decimal, or null when it is not a believable duration. */
export function parseSeconds(body) {
  if (!body || typeof body !== 'object') return null;
  const s = body.seconds;
  if (typeof s !== 'number' || !Number.isFinite(s)) return null;
  const t = Number(s.toFixed(1));
  if (t < MIN_SECONDS || t > MAX_SECONDS) return null;
  return t;
}

/** The caller's address as the proxy reports it; only ever used hashed. */
export function clientKey(headers) {
  const h = headers ?? {};
  const forwarded = h['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  const real = h['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim();
  return 'unknown';
}

/** The REST endpoint and token the Vercel storage integration puts in the environment. */
export function redisConfig(env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

/** `redis(commands)` runs a pipeline and resolves to the result of each command. */
export function makeRedis({ url, token }, fetchImpl = globalThis.fetch) {
  return async (commands) => {
    const res = await fetchImpl(`${url.replace(/\/+$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
    });
    if (!res.ok) throw new Error(`redis ${res.status}`);
    const out = await res.json();
    if (!Array.isArray(out)) throw new Error('redis: unexpected answer');
    return out.map((r) => {
      if (r && r.error) throw new Error(`redis: ${r.error}`);
      return r.result;
    });
  };
}

/**
 * One request in, `{ status, body, headers? }` out.
 * deps: redis (a function from makeRedis, or null when not configured),
 *       hash (string -> opaque string), randomId (-> string).
 */
export async function handleRank({ method, body, headers }, { redis, hash, randomId }) {
  if (method !== 'POST') return { status: 405, body: { error: 'method' }, headers: { Allow: 'POST' } };
  if (!redis) return { status: 503, body: { error: 'not-configured' } };
  const seconds = parseSeconds(body);
  if (seconds === null) return { status: 400, body: { error: 'time' } };

  try {
    // At most RATE_LIMIT plays an hour per address; Redis only ever holds a hash of it.
    const limitKey = `rl:${hash(clientKey(headers))}`;
    const [count] = await redis([['INCR', limitKey], ['EXPIRE', limitKey, String(RATE_WINDOW_S), 'NX']]);
    if (count > RATE_LIMIT) return { status: 429, body: { error: 'rate' } };

    const s = String(seconds);
    const [, longer, total, best] = await redis([
      ['ZADD', SET_KEY, s, randomId()],
      ['ZCOUNT', SET_KEY, `(${s}`, '+inf'],
      ['ZCARD', SET_KEY],
      ['ZREVRANGE', SET_KEY, '0', String(TOP_N - 1), 'WITHSCORES'],
    ]);
    // WITHSCORES answers [id, score, id, score, ...]: only the times go out, never an id.
    const top = [];
    for (let i = 1; i < (best ?? []).length; i += 2) top.push(Number(best[i]));
    return { status: 200, body: { rank: longer + 1, total, top } };
  } catch {
    return { status: 502, body: { error: 'storage' } };
  }
}
