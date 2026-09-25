import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

let redisClient = null;

export const getRedisClient = () => {
  if (redisClient) return redisClient;

  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.warn('[Redis] REDIS_URL not configured. Running without Redis cache.');
    return null;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      lazyConnect: false,
      retryStrategy(times) {
        if (times > 5) {
          console.warn('[Redis] Max reconnect attempts reached. Redis caching temporarily disabled.');
          return null; // Stop retrying
        }
        return Math.min(times * 1000, 3000);
      },
    });

    redisClient.on('connect', () => {
      console.log('✅ [Redis] Connected successfully to Upstash Redis');
    });

    redisClient.on('ready', () => {
      console.log('🚀 [Redis] Client ready to serve cache requests');
    });

    redisClient.on('error', (err) => {
      console.warn(`⚠️ [Redis] Connection warning: ${err.message}`);
    });

    redisClient.on('close', () => {
      console.log('ℹ️ [Redis] Connection closed');
    });

    return redisClient;
  } catch (error) {
    console.error(`❌ [Redis] Failed to initialize client: ${error.message}`);
    return null;
  }
};

export const redis = getRedisClient();
