// =====================================================
// RATE LIMITER MIDDLEWARE - SKYN3T ACCESS CONTROL
// =====================================================
// Implementa rate limiting avanzado con diferentes estrategias
// y múltiples niveles de protección

import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';

// Configuraciones de rate limiting
const RATE_LIMIT_CONFIG = {
  // Rate limits generales
  GLOBAL: {
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 1000, // requests por ventana
    skipSuccessfulRequests: false
  },
  
  // Rate limits para autenticación
  AUTH: {
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10, // intentos por ventana
    skipSuccessfulRequests: true
  },
  
  // Rate limits para login
  LOGIN: {
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // intentos por ventana
    skipSuccessfulRequests: true,
    blockDuration: 15 * 60 * 1000 // 15 minutos de bloqueo
  },
  
  // Rate limits para registro
  REGISTER: {
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 3, // registros por hora por IP
    skipSuccessfulRequests: false
  },
  
  // Rate limits para reset de contraseña
  PASSWORD_RESET: {
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 3, // resets por hora
    skipSuccessfulRequests: true
  },
  
  // Rate limits para 2FA
  TWO_FA: {
    windowMs: 5 * 60 * 1000, // 5 minutos
    max: 5, // intentos por ventana
    skipSuccessfulRequests: true
  },
  
  // Rate limits para APIs
  API: {
    windowMs: 60 * 1000, // 1 minuto
    max: 100, // requests por minuto
    skipSuccessfulRequests: false
  },
  
  // Rate limits para operaciones críticas
  CRITICAL: {
    windowMs: 60 * 1000, // 1 minuto
    max: 10, // operaciones por minuto
    skipSuccessfulRequests: false
  },
  
  // Rate limits para uploads
  UPLOAD: {
    windowMs: 60 * 1000, // 1 minuto
    max: 20, // uploads por minuto
    skipSuccessfulRequests: false
  }
};

// Crear instancias de Rate Limiter Redis
const createRedisRateLimiter = (config: any, keyPrefix: string) => {
  return new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: `rl_${keyPrefix}`,
    points: config.max,
    duration: Math.floor(config.windowMs / 1000),
    blockDuration: config.blockDuration ? Math.floor(config.blockDuration / 1000) : undefined,
    execEvenly: true
  });
};

// Rate limiters específicos
const loginLimiter = createRedisRateLimiter(RATE_LIMIT_CONFIG.LOGIN, 'login');
const registerLimiter = createRedisRateLimiter(RATE_LIMIT_CONFIG.REGISTER, 'register');
const passwordResetLimiter = createRedisRateLimiter(RATE_LIMIT_CONFIG.PASSWORD_RESET, 'password_reset');
const twoFaLimiter = createRedisRateLimiter(RATE_LIMIT_CONFIG.TWO_FA, 'two_fa');
const criticalLimiter = createRedisRateLimiter(RATE_LIMIT_CONFIG.CRITICAL, 'critical');
const uploadLimiter = createRedisRateLimiter(RATE_LIMIT_CONFIG.UPLOAD, 'upload');

/**
 * Rate limiter general usando express-rate-limit
 */
export const globalRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.GLOBAL.windowMs,
  max: RATE_LIMIT_CONFIG.GLOBAL.max,
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Demasiadas solicitudes, intente nuevamente más tarde',
    retryAfter: Math.ceil(RATE_LIMIT_CONFIG.GLOBAL.windowMs / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip} on ${req.path}`);
    res.status(429).json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Demasiadas solicitudes, intente nuevamente más tarde',
      retryAfter: Math.ceil(RATE_LIMIT_CONFIG.GLOBAL.windowMs / 1000)
    });
  },
  skip: (req: Request) => {
    // Omitir rate limiting para health checks
    return req.path === '/health' || req.path === '/api/health';
  }
});

/**
 * Rate limiter para APIs
 */
export const apiRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.API.windowMs,
  max: RATE_LIMIT_CONFIG.API.max,
  message: {
    error: 'API_RATE_LIMIT_EXCEEDED',
    message: 'Límite de API excedido',
    retryAfter: Math.ceil(RATE_LIMIT_CONFIG.API.windowMs / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Usar user ID si está autenticado, sino IP
    return req.user?.id || req.ip;
  }
});

/**
 * Crear middleware para rate limiter Redis personalizado
 */
function createRedisRateLimitMiddleware(
  rateLimiter: RateLimiterRedis, 
  keyGenerator: (req: Request) => string,
  errorCode: string = 'RATE_LIMIT_EXCEEDED'
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = keyGenerator(req);
      await rateLimiter.consume(key);
      next();
    } catch (rejRes: any) {
      const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
      
      logger.warn(`Rate limit exceeded for key: ${keyGenerator(req)} on ${req.path}`);
      
      res.set('Retry-After', String(secs));
      res.status(429).json({
        success: false,
        error: errorCode,
        message: 'Límite de velocidad excedido',
        retryAfter: secs,
        remainingPoints: rejRes.remainingPoints || 0,
        totalHits: rejRes.totalHits || 0
      });
    }
  };
}

/**
 * Rate limiter para login
 */
export const loginRateLimiter = createRedisRateLimitMiddleware(
  loginLimiter,
  (req: Request) => `login_${req.ip}_${req.body?.username || req.body?.email || 'unknown'}`,
  'LOGIN_RATE_LIMIT_EXCEEDED'
);

/**
 * Rate limiter para registro
 */
export const registerRateLimiter = createRedisRateLimitMiddleware(
  registerLimiter,
  (req: Request) => `register_${req.ip}`,
  'REGISTER_RATE_LIMIT_EXCEEDED'
);

/**
 * Rate limiter para reset de contraseña
 */
export const passwordResetRateLimiter = createRedisRateLimitMiddleware(
  passwordResetLimiter,
  (req: Request) => `password_reset_${req.body?.email || req.ip}`,
  'PASSWORD_RESET_RATE_LIMIT_EXCEEDED'
);

/**
 * Rate limiter para 2FA
 */
export const twoFaRateLimiter = createRedisRateLimitMiddleware(
  twoFaLimiter,
  (req: Request) => `two_fa_${req.user?.id || req.ip}`,
  'TWO_FA_RATE_LIMIT_EXCEEDED'
);

/**
 * Rate limiter para operaciones críticas
 */
export const criticalOperationRateLimiter = createRedisRateLimitMiddleware(
  criticalLimiter,
  (req: Request) => `critical_${req.user?.id || req.ip}`,
  'CRITICAL_OPERATION_RATE_LIMIT_EXCEEDED'
);

/**
 * Rate limiter para uploads
 */
export const uploadRateLimiter = createRedisRateLimitMiddleware(
  uploadLimiter,
  (req: Request) => `upload_${req.user?.id || req.ip}`,
  'UPLOAD_RATE_LIMIT_EXCEEDED'
);

/**
 * Rate limiter dinámico basado en el tipo de usuario
 */
export function createDynamicRateLimiter(baseConfig: any) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      let multiplier = 1;
      
      // Ajustar límites según el tipo de usuario
      if (req.user) {
        const userRoles = req.user.roles || [];
        
        if (userRoles.includes('SUPER_ADMIN')) {
          multiplier = 10; // Admins tienen 10x más límite
        } else if (userRoles.includes('COMMUNITY_ADMIN')) {
          multiplier = 5; // Admins de comunidad tienen 5x más
        } else if (userRoles.includes('PREMIUM_USER')) {
          multiplier = 3; // Usuarios premium tienen 3x más
        }
      }
      
      const adjustedConfig = {
        ...baseConfig,
        max: Math.floor(baseConfig.max * multiplier)
      };
      
      const limiter = rateLimit({
        windowMs: adjustedConfig.windowMs,
        max: adjustedConfig.max,
        keyGenerator: (req: Request) => req.user?.id || req.ip,
        message: {
          error: 'DYNAMIC_RATE_LIMIT_EXCEEDED',
          message: 'Límite personalizado excedido',
          maxRequests: adjustedConfig.max,
          retryAfter: Math.ceil(adjustedConfig.windowMs / 1000)
        }
      });
      
      limiter(req, res, next);
    } catch (error) {
      logger.error('Error in dynamic rate limiter:', error);
      next();
    }
  };
}

/**
 * Rate limiter basado en geolocalización
 */
export function createGeoRateLimiter(suspiciousCountries: string[] = []) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userIP = req.ip;
      const userAgent = req.get('User-Agent') || '';
      
      // Detectar patrones sospechosos
      let suspiciousActivity = false;
      
      // Check for suspicious user agents
      const suspiciousUAs = ['bot', 'crawler', 'spider', 'scraper'];
      if (suspiciousUAs.some(ua => userAgent.toLowerCase().includes(ua))) {
        suspiciousActivity = true;
      }
      
      // Check for rapid requests from same IP
      const recentRequestsKey = `geo_requests_${userIP}`;
      const recentRequests = await redisClient.incr(recentRequestsKey);
      await redisClient.expire(recentRequestsKey, 60); // 1 minuto
      
      if (recentRequests > 100) { // Más de 100 requests por minuto
        suspiciousActivity = true;
      }
      
      if (suspiciousActivity) {
        logger.warn(`Suspicious activity detected from IP: ${userIP}, UA: ${userAgent}`);
        
        // Aplicar rate limit más estricto
        const strictLimiter = createRedisRateLimitMiddleware(
          createRedisRateLimiter({ windowMs: 60000, max: 10 }, 'suspicious'),
          () => `suspicious_${userIP}`,
          'SUSPICIOUS_ACTIVITY_DETECTED'
        );
        
        return strictLimiter(req, res, next);
      }
      
      next();
    } catch (error) {
      logger.error('Error in geo rate limiter:', error);
      next();
    }
  };
}

/**
 * Rate limiter para endpoints específicos
 */
export function createEndpointRateLimiter(endpoint: string, config: any) {
  const limiter = createRedisRateLimiter(config, `endpoint_${endpoint}`);
  
  return createRedisRateLimitMiddleware(
    limiter,
    (req: Request) => `${endpoint}_${req.user?.id || req.ip}`,
    `${endpoint.toUpperCase()}_RATE_LIMIT_EXCEEDED`
  );
}

/**
 * Middleware para logging de rate limiting
 */
export function rateLimitLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    
    res.send = function(data: any) {
      if (res.statusCode === 429) {
        logger.warn('Rate limit triggered:', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
          method: req.method,
          userId: req.user?.id,
          timestamp: new Date().toISOString()
        });
      }
      return originalSend.call(this, data);
    };
    
    next();
  };
}

/**
 * Función para resetear rate limits (para testing o emergencias)
 */
export async function resetRateLimit(key: string): Promise<void> {
  try {
    const patterns = [
      `rl_login:${key}`,
      `rl_register:${key}`,
      `rl_password_reset:${key}`,
      `rl_two_fa:${key}`,
      `rl_critical:${key}`,
      `rl_upload:${key}`
    ];
    
    for (const pattern of patterns) {
      await redisClient.del(pattern);
    }
    
    logger.info(`Rate limits reset for key: ${key}`);
  } catch (error) {
    logger.error('Error resetting rate limits:', error);
  }
}

/**
 * Obtener estadísticas de rate limiting
 */
export async function getRateLimitStats(key: string): Promise<any> {
  try {
    const stats = await Promise.all([
      loginLimiter.get(key),
      registerLimiter.get(key),
      passwordResetLimiter.get(key),
      twoFaLimiter.get(key),
      criticalLimiter.get(key),
      uploadLimiter.get(key)
    ]);
    
    return {
      login: stats[0],
      register: stats[1],
      passwordReset: stats[2],
      twoFa: stats[3],
      critical: stats[4],
      upload: stats[5]
    };
  } catch (error) {
    logger.error('Error getting rate limit stats:', error);
    return null;
  }
}

// Exportar configuraciones para uso en otros módulos
export { RATE_LIMIT_CONFIG };