// =====================================================
// PERMISSIONS MIDDLEWARE - SKYN3T ACCESS CONTROL
// =====================================================
// Middleware para validar permisos granulares de usuarios
// Implementa RBAC (Role-Based Access Control) con permisos específicos

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { redisClient } from '../config/redis';
import { User, Role, Permission, Community, UserRole, UserPermission } from '../models';

// Extender Request para incluir user
declare global {
  namespace Express {
    interface Request {
      user?: any;
      communityId?: string;
      permissions?: string[];
    }
  }
}

/**
 * Interface para cache de permisos
 */
interface CachedPermissions {
  permissions: string[];
  roles: string[];
  lastUpdated: number;
  communityId?: string;
}

/**
 * Middleware principal para verificar permisos
 */
export function requirePermission(requiredPermission: string | string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Verificar que el usuario esté autenticado
      if (!req.user) {
        throw new AppError('Usuario no autenticado', 401, 'UNAUTHORIZED');
      }

      const userId = req.user.id;
      const communityId = req.communityId || req.headers['x-community-id'] as string;

      // Obtener permisos del usuario
      const userPermissions = await getUserPermissions(userId, communityId);

      // Convertir requiredPermission a array si es string
      const requiredPerms = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];

      // Verificar si el usuario tiene alguno de los permisos requeridos
      const hasPermission = requiredPerms.some(perm => 
        userPermissions.includes(perm) || 
        userPermissions.includes('*') || // Super admin
        userPermissions.includes('admin.*') // Admin general
      );

      if (!hasPermission) {
        logger.warn(`Permission denied for user ${userId}: required ${requiredPerms.join(' OR ')}, has [${userPermissions.join(', ')}]`);
        throw new AppError('Permisos insuficientes', 403, 'INSUFFICIENT_PERMISSIONS', {
          required: requiredPerms,
          userPermissions: userPermissions
        });
      }

      // Agregar permisos al request para uso posterior
      req.permissions = userPermissions;

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware para verificar rol específico
 */
export function requireRole(requiredRole: string | string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AppError('Usuario no autenticado', 401, 'UNAUTHORIZED');
      }

      const userId = req.user.id;
      const communityId = req.communityId || req.headers['x-community-id'] as string;

      const userRoles = await getUserRoles(userId, communityId);
      const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

      const hasRole = requiredRoles.some(role => 
        userRoles.includes(role) ||
        userRoles.includes('SUPER_ADMIN') // Super admin tiene todos los roles
      );

      if (!hasRole) {
        logger.warn(`Role check failed for user ${userId}: required ${requiredRoles.join(' OR ')}, has [${userRoles.join(', ')}]`);
        throw new AppError('Rol insuficiente', 403, 'INSUFFICIENT_ROLE', {
          required: requiredRoles,
          userRoles: userRoles
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware para verificar ownership (propietario del recurso)
 */
export function requireOwnership(resourceField: string = 'user_id') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AppError('Usuario no autenticado', 401, 'UNAUTHORIZED');
      }

      const userId = req.user.id;
      
      // Buscar el campo en params, body o query
      const resourceOwnerId = req.params[resourceField] || 
                             req.body[resourceField] || 
                             req.query[resourceField];

      // Si no se encuentra el campo, intentar con campos comunes
      const ownerId = resourceOwnerId || 
                     req.params.userId || 
                     req.params.id ||
                     req.body.userId;

      if (!ownerId) {
        throw new AppError('No se pudo determinar el propietario del recurso', 400, 'RESOURCE_OWNER_NOT_FOUND');
      }

      // Verificar si es el propietario o tiene permisos administrativos
      if (ownerId !== userId) {
        const userPermissions = await getUserPermissions(userId, req.communityId);
        const hasAdminAccess = userPermissions.includes('*') || 
                              userPermissions.includes('admin.*') ||
                              userPermissions.includes('users.manage_all');

        if (!hasAdminAccess) {
          throw new AppError('Solo el propietario del recurso puede acceder', 403, 'OWNERSHIP_REQUIRED');
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware para verificar membresía en comunidad
 */
export function requireCommunityMembership() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AppError('Usuario no autenticado', 401, 'UNAUTHORIZED');
      }

      const userId = req.user.id;
      const communityId = req.communityId || req.headers['x-community-id'] as string;

      if (!communityId) {
        throw new AppError('ID de comunidad requerido', 400, 'COMMUNITY_ID_REQUIRED');
      }

      const isMember = await isUserCommunityMember(userId, communityId);
      
      if (!isMember) {
        throw new AppError('Usuario no es miembro de esta comunidad', 403, 'NOT_COMMUNITY_MEMBER');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware para verificar múltiples condiciones
 */
export function requireAny(...middlewares: any[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    let lastError: any;
    
    for (const middleware of middlewares) {
      try {
        await new Promise<void>((resolve, reject) => {
          middleware(req, res, (err: any) => {
            if (err) reject(err);
            else resolve();
          });
        });
        // Si llega aquí, el middleware pasó
        return next();
      } catch (error) {
        lastError = error;
        continue;
      }
    }
    
    // Si ningún middleware pasó, usar el último error
    next(lastError || new AppError('No cumple con ninguna condición requerida', 403, 'CONDITIONS_NOT_MET'));
  };
}

/**
 * Obtener permisos de usuario con cache
 */
async function getUserPermissions(userId: string, communityId?: string): Promise<string[]> {
  const cacheKey = `permissions:${userId}:${communityId || 'global'}`;
  const cacheTTL = 300; // 5 minutos

  try {
    // Intentar obtener del cache
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      const parsedCache: CachedPermissions = JSON.parse(cached);
      // Verificar si el cache no ha expirado (adicional al TTL de Redis)
      if (Date.now() - parsedCache.lastUpdated < 300000) { // 5 minutos
        return parsedCache.permissions;
      }
    }
  } catch (cacheError) {
    logger.warn('Cache miss for permissions:', cacheError);
  }

  // Obtener permisos de la base de datos
  const permissions = await calculateUserPermissions(userId, communityId);

  try {
    // Guardar en cache
    const cacheData: CachedPermissions = {
      permissions,
      roles: await getUserRoles(userId, communityId),
      lastUpdated: Date.now(),
      communityId
    };
    await redisClient.setex(cacheKey, cacheTTL, JSON.stringify(cacheData));
  } catch (cacheError) {
    logger.warn('Failed to cache permissions:', cacheError);
  }

  return permissions;
}

/**
 * Calcular permisos efectivos de usuario
 */
async function calculateUserPermissions(userId: string, communityId?: string): Promise<string[]> {
  const permissionsSet = new Set<string>();

  try {
    // 1. Obtener permisos directos del usuario
    const directPermissions = await UserPermission.findAll({
      where: {
        user_id: userId,
        community_id: communityId || null,
        granted: true,
        ...(communityId ? {} : { community_id: null }) // Para permisos globales
      },
      include: [{
        model: Permission,
        as: 'permission',
        attributes: ['code']
      }]
    });

    directPermissions.forEach((up: any) => {
      if (up.permission?.code) {
        permissionsSet.add(up.permission.code);
      }
    });

    // 2. Obtener permisos a través de roles
    const userRoles = await UserRole.findAll({
      where: {
        user_id: userId,
        community_id: communityId || null,
        is_active: true
      },
      include: [{
        model: Role,
        as: 'role',
        include: [{
          model: Permission,
          as: 'permissions',
          attributes: ['code']
        }]
      }]
    });

    userRoles.forEach((ur: any) => {
      if (ur.role?.permissions) {
        ur.role.permissions.forEach((permission: any) => {
          if (permission.code) {
            permissionsSet.add(permission.code);
          }
        });
      }
    });

    // 3. Aplicar herencia de roles (roles padre)
    const roleIds = userRoles.map((ur: any) => ur.role_id);
    if (roleIds.length > 0) {
      const inheritedPermissions = await getInheritedPermissions(roleIds);
      inheritedPermissions.forEach(perm => permissionsSet.add(perm));
    }

    return Array.from(permissionsSet);
  } catch (error) {
    logger.error('Error calculating user permissions:', error);
    return [];
  }
}

/**
 * Obtener permisos heredados de roles padre
 */
async function getInheritedPermissions(roleIds: string[]): Promise<string[]> {
  const permissionsSet = new Set<string>();
  const processedRoles = new Set<string>();

  async function processRole(roleId: string) {
    if (processedRoles.has(roleId)) return;
    processedRoles.add(roleId);

    const role = await Role.findByPk(roleId, {
      include: [
        {
          model: Permission,
          as: 'permissions',
          attributes: ['code']
        },
        {
          model: Role,
          as: 'parentRole',
          attributes: ['id']
        }
      ]
    });

    if (role) {
      // Agregar permisos del rol actual
      if (role.permissions) {
        role.permissions.forEach((perm: any) => {
          if (perm.code) permissionsSet.add(perm.code);
        });
      }

      // Procesar rol padre recursivamente
      if (role.parentRole?.id) {
        await processRole(role.parentRole.id);
      }
    }
  }

  // Procesar todos los roles
  for (const roleId of roleIds) {
    await processRole(roleId);
  }

  return Array.from(permissionsSet);
}

/**
 * Obtener roles de usuario
 */
async function getUserRoles(userId: string, communityId?: string): Promise<string[]> {
  try {
    const userRoles = await UserRole.findAll({
      where: {
        user_id: userId,
        community_id: communityId || null,
        is_active: true
      },
      include: [{
        model: Role,
        as: 'role',
        attributes: ['code']
      }]
    });

    return userRoles.map((ur: any) => ur.role?.code).filter(Boolean);
  } catch (error) {
    logger.error('Error getting user roles:', error);
    return [];
  }
}

/**
 * Verificar si usuario es miembro de comunidad
 */
async function isUserCommunityMember(userId: string, communityId: string): Promise<boolean> {
  try {
    const membership = await UserRole.findOne({
      where: {
        user_id: userId,
        community_id: communityId,
        is_active: true
      }
    });

    return !!membership;
  } catch (error) {
    logger.error('Error checking community membership:', error);
    return false;
  }
}

/**
 * Invalidar cache de permisos de usuario
 */
export async function invalidateUserPermissionsCache(userId: string, communityId?: string): Promise<void> {
  try {
    const pattern = communityId 
      ? `permissions:${userId}:${communityId}`
      : `permissions:${userId}:*`;
    
    if (communityId) {
      await redisClient.del(`permissions:${userId}:${communityId}`);
    } else {
      // Invalidar todos los caches de permisos del usuario
      const keys = await redisClient.keys(`permissions:${userId}:*`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    }
    
    logger.info(`Permissions cache invalidated for user ${userId}`);
  } catch (error) {
    logger.warn('Failed to invalidate permissions cache:', error);
  }
}

/**
 * Middleware de desarrollo para omitir validación de permisos
 */
export function devBypassPermissions() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'development' && process.env.BYPASS_PERMISSIONS === 'true') {
      logger.warn('⚠️ DEVELOPMENT MODE: Bypassing permission checks');
      return next();
    }
    next();
  };
}

// Exportar funciones auxiliares
export {
  getUserPermissions,
  getUserRoles,
  isUserCommunityMember,
  calculateUserPermissions
};