import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { UserSession } from '../models/UserSession';
import { cache, cacheKeys } from '../config/redis';
import { AppError } from '../utils/AppError';
import crypto from 'crypto';

// Extender tipos de Express
declare global {
  namespace Express {
    interface Request {
      user?: User;
      session?: UserSession;
      permissions?: string[];
      communityId?: string;
    }
  }
}

interface JWTPayload {
  id: string;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
  iat?: number;
  exp?: number;
}

/**
 * Middleware para autenticar requests con JWT
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Obtener token del header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Token no proporcionado', 401);
    }

    const token = authHeader.substring(7);

    // Verificar token
    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError('Token expirado', 401);
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError('Token inválido', 401);
      }
      throw error;
    }

    // Verificar sesión
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    let session = await cache.get(cacheKeys.session(tokenHash));

    if (!session) {
      // Buscar en base de datos
      const dbSession = await UserSession.findOne({
        where: {
          token_hash: tokenHash,
          is_active: true
        }
      });

      if (!dbSession || new Date() > new Date(dbSession.expires_at)) {
        throw new AppError('Sesión inválida o expirada', 401);
      }

      // Guardar en caché
      session = dbSession;
      await cache.set(cacheKeys.session(tokenHash), session, 300); // 5 minutos
    }

    // Obtener usuario
    let user = await cache.get(cacheKeys.user(decoded.id));
    
    if (!user) {
      user = await User.findActiveById(decoded.id);
      if (!user) {
        throw new AppError('Usuario no encontrado', 401);
      }
      
      // Guardar en caché
      await cache.set(cacheKeys.user(decoded.id), user.toJSON(), 300);
    } else {
      // Rehidratar instancia del modelo
      user = User.build(user);
    }

    // Obtener community_id si viene en headers o query
    const communityId = req.headers['x-community-id'] as string || 
                       req.query.community_id as string;

    // Verificar membresía si se especifica community_id
    if (communityId) {
      const isMember = await user.isMemberOfCommunity(communityId);
      if (!isMember) {
        throw new AppError('No eres miembro de esta comunidad', 403);
      }
      req.communityId = communityId;
    }

    // Adjuntar al request
    req.user = user;
    req.session = session;
    req.permissions = decoded.permissions;

    // Actualizar última actividad
    await UserSession.update(
      { last_activity: new Date() },
      { where: { id: session.id } }
    );

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware para verificar permisos específicos
 */
export const requirePermission = (...permissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AppError('No autenticado', 401);
      }

      const hasPermission = await req.user.hasAnyPermission(
        permissions,
        req.communityId
      );

      if (!hasPermission) {
        throw new AppError(
          `Permisos insuficientes. Se requiere: ${permissions.join(' o ')}`,
          403
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware para verificar todos los permisos especificados
 */
export const requireAllPermissions = (...permissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AppError('No autenticado', 401);
      }

      const hasAllPermissions = await req.user.hasAllPermissions(
        permissions,
        req.communityId
      );

      if (!hasAllPermissions) {
        throw new AppError(
          `Permisos insuficientes. Se requieren todos: ${permissions.join(', ')}`,
          403
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware para verificar roles específicos
 */
export const requireRole = (...roles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AppError('No autenticado', 401);
      }

      const userRoles = await req.user.getRolesByCommunity(req.communityId);
      const userRoleCodes = userRoles.map(r => r.code);

      const hasRole = roles.some(role => userRoleCodes.includes(role));

      if (!hasRole) {
        throw new AppError(
          `Rol insuficiente. Se requiere: ${roles.join(' o ')}`,
          403
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware para verificar que el usuario es super admin
 */
export const requireSuperAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('No autenticado', 401);
    }

    const hasRole = await req.user.hasRole('SUPER_ADMIN');
    
    if (!hasRole) {
      throw new AppError('Se requiere rol de Super Administrador', 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware para verificar que el usuario es admin de la comunidad
 */
export const requireCommunityAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('No autenticado', 401);
    }

    if (!req.communityId) {
      throw new AppError('Community ID requerido', 400);
    }

    const hasRole = await req.user.hasRole('COMMUNITY_ADMIN', req.communityId);
    
    if (!hasRole) {
      throw new AppError('Se requiere rol de Administrador de Comunidad', 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware opcional de autenticación (no falla si no hay token)
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    // Usar el middleware de autenticación normal
    await authenticate(req, res, next);
  } catch (error) {
    // Ignorar errores de autenticación
    next();
  }
};

/**
 * Middleware para refrescar token si está próximo a expirar
 */
export const refreshTokenIfNeeded = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = jwt.decode(token) as JWTPayload;

    if (!decoded || !decoded.exp) {
      return next();
    }

    // Si quedan menos de 5 minutos, generar nuevo token
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = decoded.exp - now;

    if (timeUntilExpiry < 300 && req.user) { // 5 minutos
      const newToken = jwt.sign(
        {
          id: req.user.id,
          username: req.user.username,
          email: req.user.email,
          roles: decoded.roles,
          permissions: decoded.permissions
        },
        process.env.JWT_SECRET!,
        { expiresIn: '15m' }
      );

      // Actualizar sesión con nuevo token
      if (req.session) {
        req.session.token_hash = crypto.createHash('sha256').update(newToken).digest('hex');
        req.session.expires_at = new Date(Date.now() + 15 * 60 * 1000);
        await req.session.save();
      }

      // Enviar nuevo token en header
      res.setHeader('X-New-Token', newToken);
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware para verificar feature habilitado en la comunidad
 */
export const requireFeature = (featureCode: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.communityId) {
        throw new AppError('Community ID requerido', 400);
      }

      const community = await Community.findByPk(req.communityId);
      if (!community) {
        throw new AppError('Comunidad no encontrada', 404);
      }

      const hasFeature = await community.hasFeature(featureCode);
      if (!hasFeature) {
        throw new AppError(
          `Esta funcionalidad no está habilitada para tu comunidad`,
          403
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware para rate limiting por usuario
 */
export const userRateLimit = (
  windowMs: number,
  maxRequests: number
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next();
      }

      const key = cacheKeys.rateLimit(`user:${req.user.id}:${req.path}`);
      const requests = await cache.incr(key, Math.floor(windowMs / 1000));

      if (requests > maxRequests) {
        throw new AppError(
          'Demasiadas solicitudes. Por favor intenta más tarde.',
          429
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};