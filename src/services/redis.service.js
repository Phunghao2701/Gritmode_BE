import { redis } from '../config/redis.js';
import { AppError } from '../errors/app-error.js';

export class RedisService {
  constructor(client = redis) {
    this.client = client;
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
      throw new AppError(503, 'REDIS_UNAVAILABLE', `Redis GET thất bại: ${err.message}`);
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
      throw new AppError(503, 'REDIS_UNAVAILABLE', `Redis SET thất bại: ${err.message}`);
    }
  }

  async del(key) {
    this.assertAvailable('DEL');
    try {
      await this.client.del(key);
      return true;
    } catch (err) {
      throw new AppError(503, 'REDIS_UNAVAILABLE', `Redis DEL thất bại: ${err.message}`);
    }
  }

  async delByPattern(pattern) {
    this.assertAvailable('SCAN');
    try {
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
      throw new AppError(503, 'REDIS_UNAVAILABLE', `Redis SCAN thất bại: ${err.message}`);
    }
  }

  /**
   * Safe Cache-Aside wrapper:
   * Returns cached value if present; otherwise calls fetchFn(), writes to cache and returns.
   * Redis is an optimization layer, so an unavailable Redis must fall back to
   * the source of truth instead of turning a healthy database request into 503.
   */
  async getOrSet(key, fetchFn, ttlSeconds = 1800) {
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

    const freshData = await fetchFn();
    if (freshData !== undefined && freshData !== null && this.isAvailable()) {
      try {
        await this.set(key, freshData, ttlSeconds);
      } catch {
        // The fresh database response is still valid if cache write fails.
      }
    }
    return { data: freshData, isCached: false };
  }
}

export const redisService = new RedisService();
