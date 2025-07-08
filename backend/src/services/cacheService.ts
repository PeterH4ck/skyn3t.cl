import Redis from 'ioredis';
import { logger } from '../utils/logger';

class CacheService {
  private redis: Redis;
  private isConnected: boolean = false;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: 0,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      logger.info('Redis connected');
      this.isConnected = true;
    });

    this.redis.on('error', (error) => {
      logger.error('Redis error:', error);
      this.isConnected = false;
    });

    this.redis.on('close', () => {
      logger.warn('Redis connection closed');
      this.isConnected = false;
    });

    this.redis.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });
  }

  /**
   * Set a value in cache with optional TTL
   */
  async set(
    key: string, 
    value: any, 
    ttlSeconds?: number
  ): Promise<boolean> {
    try {
      if (!this.isConnected) {
        logger.warn('Redis not connected, skipping cache set');
        return false;
      }

      const serializedValue = JSON.stringify(value);
      
      if (ttlSeconds) {
        await this.redis.setex(key, ttlSeconds, serializedValue);
      } else {
        await this.redis.set(key, serializedValue);
      }

      return true;

    } catch (error) {
      logger.error('Cache set error:', { key, error });
      return false;
    }
  }

  /**
   * Get a value from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    try {
      if (!this.isConnected) {
        return null;
      }

      const value = await this.redis.get(key);
      
      if (value === null) {
        return null;
      }

      return JSON.parse(value) as T;

    } catch (error) {
      logger.error('Cache get error:', { key, error });
      return null;
    }
  }

  /**
   * Delete a key from cache
   */
  async del(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      const result = await this.redis.del(key);
      return result > 0;

    } catch (error) {
      logger.error('Cache delete error:', { key, error });
      return false;
    }
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      const result = await this.redis.exists(key);
      return result === 1;

    } catch (error) {
      logger.error('Cache exists error:', { key, error });
      return false;
    }
  }

  /**
   * Set expiration for a key
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      const result = await this.redis.expire(key, ttlSeconds);
      return result === 1;

    } catch (error) {
      logger.error('Cache expire error:', { key, error });
      return false;
    }
  }

  /**
   * Increment a numeric value
   */
  async incr(key: string, ttlSeconds?: number): Promise<number> {
    try {
      if (!this.isConnected) {
        return 0;
      }

      const result = await this.redis.incr(key);
      
      if (ttlSeconds && result === 1) {
        await this.redis.expire(key, ttlSeconds);
      }

      return result;

    } catch (error) {
      logger.error('Cache incr error:', { key, error });
      return 0;
    }
  }

  /**
   * Get multiple keys at once
   */
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    try {
      if (!this.isConnected || keys.length === 0) {
        return [];
      }

      const values = await this.redis.mget(...keys);
      
      return values.map(value => {
        if (value === null) return null;
        try {
          return JSON.parse(value) as T;
        } catch {
          return null;
        }
      });

    } catch (error) {
      logger.error('Cache mget error:', { keys, error });
      return [];
    }
  }

  /**
   * Set multiple key-value pairs
   */
  async mset(keyValuePairs: Record<string, any>): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      const serializedPairs: string[] = [];
      
      for (const [key, value] of Object.entries(keyValuePairs)) {
        serializedPairs.push(key, JSON.stringify(value));
      }

      await this.redis.mset(...serializedPairs);
      return true;

    } catch (error) {
      logger.error('Cache mset error:', { keyValuePairs, error });
      return false;
    }
  }

  /**
   * Clear all keys matching a pattern
   */
  async clearPattern(pattern: string): Promise<number> {
    try {
      if (!this.isConnected) {
        return 0;
      }

      const keys = await this.redis.keys(pattern);
      
      if (keys.length === 0) {
        return 0;
      }

      const result = await this.redis.del(...keys);
      return result;

    } catch (error) {
      logger.error('Cache clearPattern error:', { pattern, error });
      return 0;
    }
  }

  /**
   * Add item to a set
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      if (!this.isConnected) {
        return 0;
      }

      return await this.redis.sadd(key, ...members);

    } catch (error) {
      logger.error('Cache sadd error:', { key, members, error });
      return 0;
    }
  }

  /**
   * Get all members of a set
   */
  async smembers(key: string): Promise<string[]> {
    try {
      if (!this.isConnected) {
        return [];
      }

      return await this.redis.smembers(key);

    } catch (error) {
      logger.error('Cache smembers error:', { key, error });
      return [];
    }
  }

  /**
   * Remove item from set
   */
  async srem(key: string, ...members: string[]): Promise<number> {
    try {
      if (!this.isConnected) {
        return 0;
      }

      return await this.redis.srem(key, ...members);

    } catch (error) {
      logger.error('Cache srem error:', { key, members, error });
      return 0;
    }
  }

  /**
   * Add item to sorted set with score
   */
  async zadd(key: string, score: number, member: string): Promise<number> {
    try {
      if (!this.isConnected) {
        return 0;
      }

      return await this.redis.zadd(key, score, member);

    } catch (error) {
      logger.error('Cache zadd error:', { key, score, member, error });
      return 0;
    }
  }

  /**
   * Get range from sorted set
   */
  async zrange(
    key: string, 
    start: number, 
    stop: number, 
    withScores: boolean = false
  ): Promise<string[]> {
    try {
      if (!this.isConnected) {
        return [];
      }

      if (withScores) {
        return await this.redis.zrange(key, start, stop, 'WITHSCORES');
      } else {
        return await this.redis.zrange(key, start, stop);
      }

    } catch (error) {
      logger.error('Cache zrange error:', { key, start, stop, error });
      return [];
    }
  }

  /**
   * Push item to list
   */
  async lpush(key: string, ...values: string[]): Promise<number> {
    try {
      if (!this.isConnected) {
        return 0;
      }

      return await this.redis.lpush(key, ...values);

    } catch (error) {
      logger.error('Cache lpush error:', { key, values, error });
      return 0;
    }
  }

  /**
   * Pop item from list
   */
  async lpop(key: string): Promise<string | null> {
    try {
      if (!this.isConnected) {
        return null;
      }

      return await this.redis.lpop(key);

    } catch (error) {
      logger.error('Cache lpop error:', { key, error });
      return null;
    }
  }

  /**
   * Get list length
   */
  async llen(key: string): Promise<number> {
    try {
      if (!this.isConnected) {
        return 0;
      }

      return await this.redis.llen(key);

    } catch (error) {
      logger.error('Cache llen error:', { key, error });
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    connected: boolean;
    memoryUsage?: string;
    connectedClients?: number;
    totalCommands?: number;
    keyspaceHits?: number;
    keyspaceMisses?: number;
    hitRatio?: number;
  }> {
    try {
      if (!this.isConnected) {
        return { connected: false };
      }

      const info = await this.redis.info('stats memory clients');
      const lines = info.split('\r\n');
      const stats: any = { connected: true };

      lines.forEach(line => {
        const [key, value] = line.split(':');
        switch (key) {
          case 'used_memory_human':
            stats.memoryUsage = value;
            break;
          case 'connected_clients':
            stats.connectedClients = parseInt(value);
            break;
          case 'total_commands_processed':
            stats.totalCommands = parseInt(value);
            break;
          case 'keyspace_hits':
            stats.keyspaceHits = parseInt(value);
            break;
          case 'keyspace_misses':
            stats.keyspaceMisses = parseInt(value);
            break;
        }
      });

      if (stats.keyspaceHits && stats.keyspaceMisses) {
        const total = stats.keyspaceHits + stats.keyspaceMisses;
        stats.hitRatio = (stats.keyspaceHits / total) * 100;
      }

      return stats;

    } catch (error) {
      logger.error('Cache stats error:', error);
      return { connected: false };
    }
  }

  /**
   * Flush all cache
   */
  async flushAll(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      await this.redis.flushall();
      return true;

    } catch (error) {
      logger.error('Cache flush error:', error);
      return false;
    }
  }

  /**
   * Cache wrapper for functions
   */
  async wrap<T>(
    key: string,
    fn: () => Promise<T>,
    ttlSeconds: number = 300
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    
    if (cached !== null) {
      return cached;
    }

    // Execute function and cache result
    const result = await fn();
    await this.set(key, result, ttlSeconds);
    
    return result;
  }
}

export const cacheService = new CacheService();

// Cache key builders
export const cacheKeys = {
  user: (id: string) => `user:${id}`,
  userPermissions: (userId: string, communityId?: string) => 
    `user:${userId}:permissions${communityId ? `:${communityId}` : ''}`,
  community: (id: string) => `community:${id}`,
  device: (id: string) => `device:${id}`,
  deviceStatus: (id: string) => `device:${id}:status`,
  session: (token: string) => `session:${token}`,
  rateLimit: (key: string) => `rate_limit:${key}`,
  accessPoint: (id: string) => `access_point:${id}`,
  invitation: (id: string) => `invitation:${id}`,
  maintenanceRequest: (id: string) => `maintenance:${id}`,
  userRoles: (userId: string, communityId?: string) => 
    `user:${userId}:roles${communityId ? `:${communityId}` : ''}`
};