import redis from "../config/redis.js";
import logger from "./logger.js";

const CACHE_ENVELOPE_VERSION = 1;
const DEFAULT_FRESH_TTL_SECONDS = 30 * 60;
const DEFAULT_STALE_TTL_SECONDS = 7 * 24 * 60 * 60;

const toPositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const defaultFreshTtlSeconds = toPositiveInteger(
  process.env.CACHE_FRESH_TTL_SECONDS,
  DEFAULT_FRESH_TTL_SECONDS
);
const defaultStaleTtlSeconds = Math.max(
  defaultFreshTtlSeconds,
  toPositiveInteger(process.env.CACHE_STALE_TTL_SECONDS, DEFAULT_STALE_TTL_SECONDS)
);

const isTestRuntime = () => (
  process.env.NODE_ENV === "test"
  || process.env.NODE_TEST_CONTEXT !== undefined
  || process.execArgv.includes("--test")
);

const isCacheDisabled = () => (
  process.env.CACHE_ENABLED === "false"
  || !process.env.REDIS_URL
  || isTestRuntime()
);

const normalizeCacheOptions = (options) => {
  if (typeof options === "number") {
    const ttlSeconds = toPositiveInteger(options, defaultFreshTtlSeconds);
    return { freshTtlSeconds: ttlSeconds, staleTtlSeconds: ttlSeconds };
  }

  const freshTtlSeconds = toPositiveInteger(
    options?.freshTtlSeconds,
    defaultFreshTtlSeconds
  );
  const staleTtlSeconds = Math.max(
    freshTtlSeconds,
    toPositiveInteger(options?.staleTtlSeconds, defaultStaleTtlSeconds)
  );

  return { freshTtlSeconds, staleTtlSeconds };
};

// Generate a deterministic key regardless of parameter declaration order.
export const buildCacheKey = (name, params = {}, namespace = "trending") => {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  const suffix = entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join(":");
  return suffix ? `${namespace}:${name}:${suffix}` : `${namespace}:${name}`;
};

export const createCache = ({
  client,
  cacheLogger = logger,
  now = () => Date.now(),
  disabled = () => false,
} = {}) => {
  const inFlight = new Map();

  const refresh = (key, fetchFn, cacheOptions) => {
    if (inFlight.has(key)) return inFlight.get(key);

    const refreshPromise = Promise.resolve()
      .then(fetchFn)
      .then(async (data) => {
        const payload = JSON.stringify({
          version: CACHE_ENVELOPE_VERSION,
          cachedAt: now(),
          data,
        });

        try {
          await client.set(key, payload, "EX", cacheOptions.staleTtlSeconds);
        } catch (err) {
          cacheLogger.error(`Ghi cache Redis thất bại cho key "${key}"`, err);
        }

        return data;
      })
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, refreshPromise);
    return refreshPromise;
  };

  const getOrSetCache = async (key, fetchFn, options) => {
    if (disabled()) return fetchFn();

    const cacheOptions = normalizeCacheOptions(options);

    try {
      const cached = await client.get(key);
      if (cached) {
        const parsed = JSON.parse(cached);

        // Backward compatibility for values written before the SWR envelope.
        if (parsed?.version !== CACHE_ENVELOPE_VERSION || !("data" in parsed)) {
          return parsed;
        }

        const ageSeconds = Math.max(0, now() - Number(parsed.cachedAt || 0)) / 1000;
        if (ageSeconds <= cacheOptions.freshTtlSeconds) return parsed.data;

        // Serve stale immediately and refresh without blocking this request.
        void refresh(key, fetchFn, cacheOptions).catch((err) => {
          cacheLogger.error(`Làm mới cache Redis thất bại cho key "${key}"`, err);
        });
        return parsed.data;
      }
    } catch (err) {
      cacheLogger.error(`Đọc cache Redis thất bại cho key "${key}"`, err);
    }

    // Coalesce concurrent cold misses so only one expensive query runs.
    return refresh(key, fetchFn, cacheOptions);
  };

  return { getOrSetCache };
};

const defaultCache = createCache({
  client: redis,
  disabled: isCacheDisabled,
});

// Fresh for 30 minutes by default. Afterwards stale data is returned immediately
// while one background refresh updates it. The stale fallback survives seven days.
export const getOrSetCache = defaultCache.getOrSetCache;
