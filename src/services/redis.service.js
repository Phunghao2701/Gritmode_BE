import { redis } from '../config/redis.js';

export class RedisService {
  constructor(client = redis) {
    this.client = client;
  }

  isAvailable() {
    return Boolean(this.client && this.client.status === 'ready');
  }

  async get(key) {
    if (!this.isAvailable()) return null;
    try {
      const data = await this.client.get(key);
      if (!data) return null;
      return JSON.parse(data);
    } catch (err) {
      console.warn(`[RedisService] GET ${key} error:`, err.message);
      return null;
    }
  }

  async set(key, value, ttlSeconds = 3600) {
    if (!this.isAvailable()) return false;
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, serialized);
      }
      return true;
    } catch (err) {
      console.warn(`[RedisService] SET ${key} error:`, err.message);
      return false;
    }
  }

  async del(key) {
    if (!this.isAvailable()) return false;
    try {
      await this.client.del(key);
      return true;
    } catch (err) {
      console.warn(`[RedisService] DEL ${key} error:`, err.message);
      return false;
    }
  }

  async delByPattern(pattern) {
    if (!this.isAvailable()) return false;
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
      console.warn(`[RedisService] delByPattern ${pattern} error:`, err.message);
      return false;
    }
  }

  /**
   * Safe Cache-Aside wrapper:
   * Returns cached value if present; otherwise calls fetchFn(), writes to cache and returns.
   */
  async getOrSet(key, fetchFn, ttlSeconds = 1800) {
    const cached = await this.get(key);
    if (cached !== null) {
      return { data: cached, isCached: true };
    }

    const freshData = await fetchFn();
    if (freshData !== undefined && freshData !== null) {
      await this.set(key, freshData, ttlSeconds);
    }
    return { data: freshData, isCached: false };
  }
}

export const redisService = new RedisService();
