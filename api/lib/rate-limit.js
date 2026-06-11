const buckets = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_HITS = 12;

function prune(now) {
  for (const [key, entry] of buckets.entries()) {
    if (now - entry.start > WINDOW_MS) {
      buckets.delete(key);
    }
  }
}

function isRateLimited(key) {
  const now = Date.now();
  prune(now);

  const entry = buckets.get(key);
  if (!entry || now - entry.start > WINDOW_MS) {
    buckets.set(key, { start: now, count: 1 });
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_HITS;
}

module.exports = { isRateLimited };
