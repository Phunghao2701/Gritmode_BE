import { redis } from '../config/redis.js';
import { AppError } from '../errors/app-error.js';
import logger from '../utils/logger.js';

const redisFailure = (operation, error) => {
  logger.error(`[redis] ${operation} failed`, error);
  return new AppError(503, 'REDIS_UNAVAILABLE', `Redis ${operation} thất bại`);
};

export class RedisService {
  constructor(client = redis) {
    this.client = client;
    this.inFlightLoads = new Map();
    this.cacheGeneration = 0;
  }

  isAvailable() {
    return Boolean(this.client && this.client.status === 'ready');
  }

  assertAvailable(operation) {
    if (!this.isAvailable()) {
      throw new AppError(503, 'REDIS_UNAVAILABLE', `Redis không khả dụng cho thao tác ${operation}`);
    }
  }

  async get(key) {
    this.assertAvailable('GET');
    try {
      const data = await this.client.get(key);
      if (!data) return null;
      return JSON.parse(data);
    } catch (err) {
      throw redisFailure('GET', err);
    }
  }

  async set(key, value, ttlSeconds = 3600) {
    this.assertAvailable('SET');
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, serialized);
      }
      return true;
    } catch (err) {
      throw redisFailure('SET', err);
    }
  }

  async del(key) {
    this.assertAvailable('DEL');
    try {
      await this.client.del(key);
      return true;
    } catch (err) {
      throw redisFailure('DEL', err);
    }
  }

  async delByPattern(pattern) {
    // Prevent any cache fill that began before this invalidation from writing
    // stale data back after the matching keys have been removed.
    this.cacheGeneration += 1;
    this.assertAvailable('SCAN');
    try {
      // A cache miss can return before its background SET completes. Wait for
      // matching fills before scanning so invalidation cannot be followed by
      // an older request restoring stale data.
      const wildcardIndex = pattern.indexOf('*');
      const keyPrefix = wildcardIndex === -1 ? pattern : pattern.slice(0, wildcardIndex);
      const pendingLoads = [...this.inFlightLoads.entries()]
        .filter(([key]) => key.startsWith(keyPrefix))
        .map(([, entry]) => entry.completionPromise);
      await Promise.allSettled(pendingLoads);

      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys && keys.length > 0) {
          await this.client.del(...keys);
        }
      } while (cursor !== '0');
      return true;
    } catch (err) {
      throw redisFailure('SCAN', err);
    }
  }

  /**
   * Safe Cache-Aside wrapper:
   * Returns cached value if present; otherwise calls fetchFn(), writes to cache and returns.
   * Redis is an optimization layer, so an unavailable Redis must fall back to
   * the source of truth instead of turning a healthy database request into 503.
   */
  async getOrSet(key, fetchFn, ttlSeconds = 1800, { waitForCacheWrite = true } = {}) {
    if (this.isAvailable()) {
      try {
        const cached = await this.get(key);
        if (cached !== null) {
          return { data: cached, isCached: true };
        }
      } catch {
        // Fall through to the source of truth when Redis is unavailable.
      }
    }

    const inFlight = this.inFlightLoads.get(key);
    if (inFlight) {
      const data = await (waitForCacheWrite ? inFlight.completionPromise : inFlight.dataPromise);
      return { data, isCached: false };
    }

    const cacheGeneration = this.cacheGeneration;
    const dataPromise = Promise.resolve().then(fetchFn);
    const completionPromise = dataPromise.then(async (freshData) => {
      if (
        freshData !== undefined &&
        freshData !== null &&
        this.isAvailable() &&
        cacheGeneration === this.cacheGeneration
      ) {
        try {
          await this.set(key, freshData, ttlSeconds);
        } catch {
          // The fresh database response is still valid if cache write fails.
        }
      }
      return freshData;
    });
    const entry = { dataPromise, completionPromise };
    this.inFlightLoads.set(key, entry);
    const clearInFlight = () => {
      if (this.inFlightLoads.get(key) === entry) this.inFlightLoads.delete(key);
    };
    completionPromise.then(clearInFlight, clearInFlight);

    const data = await (waitForCacheWrite ? completionPromise : dataPromise);
    return { data, isCached: false };
  }
}

export const redisService = new RedisService();
