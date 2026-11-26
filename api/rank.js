// POST /api/rank  { "seconds": 42.3 }  ->  { "rank": 37, "total": 1204 }
// A Vercel function: the thin adapter around api/_rank.js. It needs the Redis
// the Vercel storage integration (Upstash) adds to the environment; without it
// the answer is 503 and the game just shows the time. See docs/ranking-setup.md.
import { createHash, randomUUID } from 'node:crypto';

import { handleRank, makeRedis, redisConfig } from './_rank.js';

const config = redisConfig(process.env);
const redis = config ? makeRedis(config) : null;
// Only a hash of the address is ever stored, and only for the hour of the limit.
const salt = process.env.RANK_SALT || 'ship';
const hash = (s) => createHash('sha256').update(`${salt}:${s}`).digest('hex').slice(0, 24);

export default async function handler(req, res) {
  const { status, body, headers } = await handleRank(
    { method: req.method, body: req.body, headers: req.headers },
    { redis, hash, randomId: randomUUID }
  );
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers ?? {})) res.setHeader(k, v);
  res.status(status).json(body);
}
