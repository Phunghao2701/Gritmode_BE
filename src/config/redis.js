import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

let redisClient = null;

export const getRedisClient = () => {
  if (redisClient) return redisClient;

  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    throw new Error('[Redis Error] Biến môi trường REDIS_URL chưa được cấu hình');
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      lazyConnect: false,
      retryStrategy(times) {
        if (times > 5) {
          console.error('[Redis] Max reconnect attempts reached. Unable to connect to Redis server.');
          return null; // Stop retrying
        }
        return Math.min(times * 1000, 3000);
      },
    });

    redisClient.on('connect', () => {
      console.log('✅ [Redis] Connected successfully to Redis server');
    });

    redisClient.on('ready', () => {
      console.log('🚀 [Redis] Client ready to serve cache requests');
    });

    redisClient.on('error', (err) => {
      console.error(`❌ [Redis] Connection error: ${err.message}`);
    });

    redisClient.on('close', () => {
      console.log('ℹ️ [Redis] Connection closed');
    });

    return redisClient;
  } catch (error) {
    console.error(`❌ [Redis] Failed to initialize client: ${error.message}`);
    throw error;
  }
};

export const redis = getRedisClient();
