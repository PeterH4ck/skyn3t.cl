import { createClient } from 'redis';
import { logger } from '../utils/logger';

// Configuración del cliente Redis
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  password: process.env.REDIS_PASSWORD,
  socket: {
    connectTimeout: 10000,
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        logger.error('Redis: Max reconnection attempts reached');
        return new Error('Max reconnection attempts reached');
      }
      const delay = Math.min(retries * 100, 3000);
      logger.info(`Redis: Reconnecting in ${delay}ms...`);
      return delay;
    }
  }
});

// Manejo de eventos
redisClient.on('connect', () => {
  logger.info('Redis: Connecting...');
});

redisClient.on('ready', () => {
  logger.info('✅ Redis: Connected and ready');
});

redisClient.on('error', (error) => {
  logger.error('Redis error:', error);
});

redisClient.on('reconnecting', () => {
  logger.warn('Redis: Reconnecting...');
});

// Funciones auxiliares para caché
export const cache = {
  // Obtener valor
  async get(key: string): Promise<any> {
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  },

  // Establecer valor con TTL opcional
  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const stringValue = JSON.stringify(value);
      if (ttl) {
        await redisClient.setEx(key, ttl, stringValue);
      } else {
        await redisClient.set(key, stringValue);
      }
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
    }
  },

  // Eliminar valor
  async del(key: string): Promise<void> {
    try {
      await redisClient.del(key);
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
    }
  },

  // Eliminar múltiples valores por patrón
  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
    } catch (error) {
      logger.error(`Cache delete pattern error for ${pattern}:`, error);
    }
  },

  // Verificar si existe una clave
  async exists(key: string): Promise<boolean> {
    try {
      const result = await redisClient.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  },

  // Incrementar contador
  async incr(key: string, ttl?: number): Promise<number> {
    try {
      const value = await redisClient.incr(key);
      if (ttl && value === 1) {
        await redisClient.expire(key, ttl);
      }
      return value;
    } catch (error) {
      logger.error(`Cache incr error for key ${key}:`, error);
      return 0;
    }
  },

  // Establecer TTL
  async expire(key: string, ttl: number): Promise<void> {
    try {
      await redisClient.expire(key, ttl);
    } catch (error) {
      logger.error(`Cache expire error for key ${key}:`, error);
    }
  }
};

// Claves de caché predefinidas
export const cacheKeys = {
  // Usuarios
  user: (id: string) => `user:${id}`,
  userByEmail: (email: string) => `user:email:${email}`,
  userByUsername: (username: string) => `user:username:${username}`,
  userPermissions: (userId: string, communityId?: string) => 
    communityId ? `permissions:${userId}:${communityId}` : `permissions:${userId}`,
  userRoles: (userId: string, communityId?: string) => 
    communityId ? `roles:${userId}:${communityId}` : `roles:${userId}`,
  userSessions: (userId: string) => `sessions:${userId}`,

  // Comunidades
  community: (id: string) => `community:${id}`,
  communityFeatures: (communityId: string) => `features:${communityId}`,
  communityMembers: (communityId: string) => `members:${communityId}`,
  communityDevices: (communityId: string) => `devices:${communityId}`,

  // Permisos y roles
  role: (id: string) => `role:${id}`,
  rolePermissions: (roleId: string) => `role:permissions:${roleId}`,
  permission: (id: string) => `permission:${id}`,
  permissionTree: () => 'permissions:tree',

  // Dispositivos
  device: (id: string) => `device:${id}`,
  deviceStatus: (deviceId: string) => `device:status:${deviceId}`,
  deviceHeartbeat: (deviceId: string) => `device:heartbeat:${deviceId}`,

  // Accesos
  accessPoint: (id: string) => `access:point:${id}`,
  accessLog: (id: string) => `access:log:${id}`,
  activeAccess: (userId: string) => `access:active:${userId}`,

  // Invitaciones
  invitation: (code: string) => `invitation:${code}`,
  invitationById: (id: string) => `invitation:id:${id}`,

  // Rate limiting
  rateLimit: (key: string) => `rate:${key}`,
  loginAttempts: (identifier: string) => `login:attempts:${identifier}`,

  // Sesiones y tokens
  session: (sessionId: string) => `session:${sessionId}`,
  refreshToken: (token: string) => `refresh:${token}`,
  passwordReset: (token: string) => `reset:${token}`,
  emailVerification: (token: string) => `verify:${token}`,

  // WebSocket
  socketUser: (socketId: string) => `socket:user:${socketId}`,
  userSockets: (userId: string) => `user:sockets:${userId}`,

  // Estadísticas
  stats: (type: string, date: string) => `stats:${type}:${date}`,
  metrics: (communityId: string, metric: string) => `metrics:${communityId}:${metric}`
};

// TTL predefinidos (en segundos)
export const cacheTTL = {
  short: 60, // 1 minuto
  medium: 300, // 5 minutos
  long: 3600, // 1 hora
  day: 86400, // 1 día
  week: 604800, // 1 semana
  month: 2592000 // 30 días
};

export { redisClient };