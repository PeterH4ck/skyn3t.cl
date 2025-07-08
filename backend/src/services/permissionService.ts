// =====================================================
// PERMISSION SERVICE - SKYN3T ACCESS CONTROL
// =====================================================
// Motor de permisos granulares con RBAC y cache distribuido

import { 
  User, Role, Permission, UserRole, UserPermission, RolePermission, 
  Community, CommunityMember 
} from '../models';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { websocketService } from './websocketService';
import { Op } from 'sequelize';

// Interfaces
interface PermissionGrant {
  user_id: string;
  permission_id: string;
  community_id?: string;
  granted: boolean;
  expires_at?: Date;
  reason?: string;
  granted_by: string;
}

interface RoleAssignment {
  user_id: string;
  role_id: string;
  community_id?: string;
  assigned_by: string;
  expires_at?: Date;
}

interface PermissionCheck {
  user_id: string;
  permission: string;
  community_id?: string;
  resource_id?: string;
}

interface EffectivePermissions {
  user_id: string;
  community_id?: string;
  permissions: string[];
  roles: string[];
  inherited_permissions: string[];
  direct_permissions: string[];
  last_calculated: Date;
}

interface PermissionTemplate {
  name: string;
  description: string;
  permissions: string[];
  role_restrictions?: string[];
  community_types?: string[];
}

class PermissionService {
  private static readonly CACHE_TTL = 300; // 5 minutos
  private static readonly CACHE_PREFIX = 'permissions';

  /**
   * Verificar si un usuario tiene un permiso específico
   */
  async hasPermission(check: PermissionCheck): Promise<boolean> {
    try {
      const cacheKey = this.generateCacheKey(check.user_id, check.community_id);
      
      // Intentar obtener del cache
      let permissions = await this.getFromCache(cacheKey);
      
      if (!permissions) {
        // Calcular permisos si no están en cache
        permissions = await this.calculateEffectivePermissions(check.user_id, check.community_id);
        await this.saveToCache(cacheKey, permissions);
      }

      // Verificar permiso específico
      return this.checkPermissionInList(check.permission, permissions.permissions);
    } catch (error) {
      logger.error('Error checking permission:', error);
      return false;
    }
  }

  /**
   * Obtener todos los permisos efectivos de un usuario
   */
  async getUserPermissions(userId: string, communityId?: string): Promise<EffectivePermissions> {
    try {
      const cacheKey = this.generateCacheKey(userId, communityId);
      
      let permissions = await this.getFromCache(cacheKey);
      
      if (!permissions) {
        permissions = await this.calculateEffectivePermissions(userId, communityId);
        await this.saveToCache(cacheKey, permissions);
      }

      return permissions;
    } catch (error) {
      logger.error('Error getting user permissions:', error);
      throw new AppError('Error al obtener permisos', 500, 'PERMISSION_ERROR');
    }
  }

  /**
   * Calcular permisos efectivos de un usuario
   */
  private async calculateEffectivePermissions(userId: string, communityId?: string): Promise<EffectivePermissions> {
    const directPermissions: string[] = [];
    const inheritedPermissions: string[] = [];
    const roles: string[] = [];

    try {
      // 1. Obtener roles del usuario
      const userRoles = await UserRole.findAll({
        where: {
          user_id: userId,
          community_id: communityId || null,
          is_active: true,
          ...(this.isNotExpired())
        },
        include: [{
          model: Role,
          as: 'role',
          attributes: ['id', 'code', 'name', 'level', 'parent_role_id']
        }]
      });

      // 2. Procesar roles y obtener permisos heredados
      for (const userRole of userRoles) {
        if (userRole.role) {
          roles.push(userRole.role.code);
          
          // Obtener permisos del rol
          const rolePermissions = await this.getRolePermissions(userRole.role.id);
          inheritedPermissions.push(...rolePermissions);

          // Obtener permisos de roles padre (herencia)
          const parentPermissions = await this.getParentRolePermissions(userRole.role.id);
          inheritedPermissions.push(...parentPermissions);
        }
      }

      // 3. Obtener permisos directos del usuario
      const userPermissions = await UserPermission.findAll({
        where: {
          user_id: userId,
          community_id: communityId || null,
          granted: true,
          ...(this.isNotExpired())
        },
        include: [{
          model: Permission,
          as: 'permission',
          attributes: ['code']
        }]
      });

      for (const userPerm of userPermissions) {
        if (userPerm.permission) {
          directPermissions.push(userPerm.permission.code);
        }
      }

      // 4. Combinar y deduplicar permisos
      const allPermissions = [...new Set([...directPermissions, ...inheritedPermissions])];

      // 5. Aplicar reglas de negación (permisos con granted: false)
      const deniedPermissions = await this.getDeniedPermissions(userId, communityId);
      const finalPermissions = allPermissions.filter(perm => !deniedPermissions.includes(perm));

      return {
        user_id: userId,
        community_id: communityId,
        permissions: finalPermissions,
        roles: [...new Set(roles)],
        inherited_permissions: [...new Set(inheritedPermissions)],
        direct_permissions: [...new Set(directPermissions)],
        last_calculated: new Date()
      };
    } catch (error) {
      logger.error('Error calculating effective permissions:', error);
      throw error;
    }
  }

  /**
   * Obtener permisos de un rol
   */
  private async getRolePermissions(roleId: string): Promise<string[]> {
    try {
      const rolePermissions = await RolePermission.findAll({
        where: { role_id: roleId },
        include: [{
          model: Permission,
          as: 'permission',
          attributes: ['code']
        }]
      });

      return rolePermissions.map((rp: any) => rp.permission?.code).filter(Boolean);
    } catch (error) {
      logger.error('Error getting role permissions:', error);
      return [];
    }
  }

  /**
   * Obtener permisos de roles padre (herencia)
   */
  private async getParentRolePermissions(roleId: string): Promise<string[]> {
    try {
      const permissions: string[] = [];
      const processedRoles = new Set<string>();

      async function processRole(currentRoleId: string): Promise<void> {
        if (processedRoles.has(currentRoleId)) return;
        processedRoles.add(currentRoleId);

        const role = await Role.findByPk(currentRoleId, {
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
            permissions.push(...role.permissions.map((p: any) => p.code));
          }

          // Procesar rol padre recursivamente
          if (role.parentRole) {
            await processRole(role.parentRole.id);
          }
        }
      }

      await processRole(roleId);
      return [...new Set(permissions)];
    } catch (error) {
      logger.error('Error getting parent role permissions:', error);
      return [];
    }
  }

  /**
   * Obtener permisos denegados
   */
  private async getDeniedPermissions(userId: string, communityId?: string): Promise<string[]> {
    try {
      const deniedPermissions = await UserPermission.findAll({
        where: {
          user_id: userId,
          community_id: communityId || null,
          granted: false, // Permisos explícitamente denegados
          ...(this.isNotExpired())
        },
        include: [{
          model: Permission,
          as: 'permission',
          attributes: ['code']
        }]
      });

      return deniedPermissions.map((up: any) => up.permission?.code).filter(Boolean);
    } catch (error) {
      logger.error('Error getting denied permissions:', error);
      return [];
    }
  }

  /**
   * Asignar permiso directo a usuario
   */
  async grantPermission(grant: PermissionGrant): Promise<void> {
    try {
      // Verificar que el permiso existe
      const permission = await Permission.findByPk(grant.permission_id);
      if (!permission) {
        throw new AppError('Permiso no encontrado', 404, 'PERMISSION_NOT_FOUND');
      }

      // Verificar si ya existe el permiso
      const existing = await UserPermission.findOne({
        where: {
          user_id: grant.user_id,
          permission_id: grant.permission_id,
          community_id: grant.community_id || null
        }
      });

      if (existing) {
        // Actualizar permiso existente
        await existing.update({
          granted: grant.granted,
          expires_at: grant.expires_at,
          reason: grant.reason,
          granted_by: grant.granted_by,
          updated_at: new Date()
        });
      } else {
        // Crear nuevo permiso
        await UserPermission.create({
          user_id: grant.user_id,
          permission_id: grant.permission_id,
          community_id: grant.community_id,
          granted: grant.granted,
          expires_at: grant.expires_at,
          reason: grant.reason,
          granted_by: grant.granted_by
        });
      }

      // Invalidar cache
      await this.invalidateUserCache(grant.user_id, grant.community_id);

      // Emitir evento en tiempo real
      websocketService.emitToUser(grant.user_id, 'permissions.updated', {
        action: grant.granted ? 'granted' : 'revoked',
        permission: permission.code,
        community_id: grant.community_id
      });

      logger.info(`Permission ${grant.granted ? 'granted' : 'revoked'}: ${permission.code} for user ${grant.user_id}`);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Error granting permission:', error);
      throw new AppError('Error al asignar permiso', 500, 'PERMISSION_GRANT_ERROR');
    }
  }

  /**
   * Revocar permiso de usuario
   */
  async revokePermission(userId: string, permissionId: string, communityId?: string, revokedBy?: string): Promise<void> {
    try {
      const userPermission = await UserPermission.findOne({
        where: {
          user_id: userId,
          permission_id: permissionId,
          community_id: communityId || null
        }
      });

      if (userPermission) {
        await userPermission.update({
          granted: false,
          revoked_by: revokedBy,
          revoked_at: new Date()
        });
      }

      // Invalidar cache
      await this.invalidateUserCache(userId, communityId);

      const permission = await Permission.findByPk(permissionId);
      websocketService.emitToUser(userId, 'permissions.updated', {
        action: 'revoked',
        permission: permission?.code,
        community_id: communityId
      });

      logger.info(`Permission revoked: ${permission?.code} for user ${userId}`);
    } catch (error) {
      logger.error('Error revoking permission:', error);
      throw new AppError('Error al revocar permiso', 500, 'PERMISSION_REVOKE_ERROR');
    }
  }

  /**
   * Asignar rol a usuario
   */
  async assignRole(assignment: RoleAssignment): Promise<void> {
    try {
      // Verificar que el rol existe
      const role = await Role.findByPk(assignment.role_id);
      if (!role) {
        throw new AppError('Rol no encontrado', 404, 'ROLE_NOT_FOUND');
      }

      // Verificar si ya existe la asignación
      const existing = await UserRole.findOne({
        where: {
          user_id: assignment.user_id,
          role_id: assignment.role_id,
          community_id: assignment.community_id || null
        }
      });

      if (existing) {
        // Actualizar asignación existente
        await existing.update({
          is_active: true,
          expires_at: assignment.expires_at,
          assigned_by: assignment.assigned_by,
          updated_at: new Date()
        });
      } else {
        // Crear nueva asignación
        await UserRole.create({
          user_id: assignment.user_id,
          role_id: assignment.role_id,
          community_id: assignment.community_id,
          is_active: true,
          expires_at: assignment.expires_at,
          assigned_by: assignment.assigned_by
        });
      }

      // Invalidar cache
      await this.invalidateUserCache(assignment.user_id, assignment.community_id);

      // Emitir evento
      websocketService.emitToUser(assignment.user_id, 'role.assigned', {
        role: role.code,
        community_id: assignment.community_id
      });

      logger.info(`Role assigned: ${role.code} to user ${assignment.user_id}`);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Error assigning role:', error);
      throw new AppError('Error al asignar rol', 500, 'ROLE_ASSIGNMENT_ERROR');
    }
  }

  /**
   * Remover rol de usuario
   */
  async removeRole(userId: string, roleId: string, communityId?: string, removedBy?: string): Promise<void> {
    try {
      const userRole = await UserRole.findOne({
        where: {
          user_id: userId,
          role_id: roleId,
          community_id: communityId || null
        }
      });

      if (userRole) {
        await userRole.update({
          is_active: false,
          removed_by: removedBy,
          removed_at: new Date()
        });
      }

      // Invalidar cache
      await this.invalidateUserCache(userId, communityId);

      const role = await Role.findByPk(roleId);
      websocketService.emitToUser(userId, 'role.removed', {
        role: role?.code,
        community_id: communityId
      });

      logger.info(`Role removed: ${role?.code} from user ${userId}`);
    } catch (error) {
      logger.error('Error removing role:', error);
      throw new AppError('Error al remover rol', 500, 'ROLE_REMOVAL_ERROR');
    }
  }

  /**
   * Obtener jerarquía de permisos para un usuario
   */
  async getPermissionHierarchy(userId: string, communityId?: string): Promise<any> {
    try {
      const effective = await this.getUserPermissions(userId, communityId);
      
      // Organizar permisos por módulo y acción
      const hierarchy: { [module: string]: { [action: string]: any } } = {};

      for (const permCode of effective.permissions) {
        const parts = permCode.split('.');
        if (parts.length >= 2) {
          const module = parts[0];
          const action = parts.slice(1).join('.');

          if (!hierarchy[module]) {
            hierarchy[module] = {};
          }

          hierarchy[module][action] = {
            code: permCode,
            source: effective.direct_permissions.includes(permCode) ? 'direct' : 'inherited',
            risk_level: await this.getPermissionRiskLevel(permCode)
          };
        }
      }

      return {
        user_id: userId,
        community_id: communityId,
        roles: effective.roles,
        hierarchy,
        total_permissions: effective.permissions.length,
        last_calculated: effective.last_calculated
      };
    } catch (error) {
      logger.error('Error getting permission hierarchy:', error);
      throw new AppError('Error al obtener jerarquía de permisos', 500, 'HIERARCHY_ERROR');
    }
  }

  /**
   * Obtener nivel de riesgo de un permiso
   */
  private async getPermissionRiskLevel(permissionCode: string): Promise<string> {
    try {
      const permission = await Permission.findOne({
        where: { code: permissionCode },
        attributes: ['risk_level']
      });

      return permission?.risk_level || 'low';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Aplicar plantilla de permisos
   */
  async applyPermissionTemplate(userId: string, templateName: string, communityId?: string, appliedBy?: string): Promise<void> {
    try {
      const template = await this.getPermissionTemplate(templateName);
      if (!template) {
        throw new AppError('Plantilla no encontrada', 404, 'TEMPLATE_NOT_FOUND');
      }

      // Obtener IDs de permisos
      const permissions = await Permission.findAll({
        where: {
          code: { [Op.in]: template.permissions }
        }
      });

      // Aplicar cada permiso
      for (const permission of permissions) {
        await this.grantPermission({
          user_id: userId,
          permission_id: permission.id,
          community_id: communityId,
          granted: true,
          reason: `Template: ${templateName}`,
          granted_by: appliedBy || 'system'
        });
      }

      logger.info(`Permission template '${templateName}' applied to user ${userId}`);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Error applying permission template:', error);
      throw new AppError('Error al aplicar plantilla', 500, 'TEMPLATE_APPLICATION_ERROR');
    }
  }

  /**
   * Obtener plantilla de permisos
   */
  private async getPermissionTemplate(name: string): Promise<PermissionTemplate | null> {
    // Aquí se podrían cargar plantillas desde BD o archivo de configuración
    const templates: { [key: string]: PermissionTemplate } = {
      'basic_resident': {
        name: 'Residente Básico',
        description: 'Permisos básicos para residentes',
        permissions: [
          'access.doors.own_building',
          'financial.view_own_statements',
          'notifications.receive',
          'profile.manage_own'
        ]
      },
      'building_admin': {
        name: 'Administrador de Edificio',
        description: 'Permisos para administrar un edificio',
        permissions: [
          'access.doors.building_all',
          'users.view_building',
          'financial.view_building',
          'devices.view_building',
          'reports.generate_building'
        ]
      },
      'community_admin': {
        name: 'Administrador de Comunidad',
        description: 'Permisos completos para la comunidad',
        permissions: [
          'access.*',
          'users.*',
          'financial.*',
          'devices.*',
          'reports.*',
          'permissions.manage'
        ]
      }
    };

    return templates[name] || null;
  }

  /**
   * Verificar permiso con wildcard
   */
  private checkPermissionInList(permission: string, userPermissions: string[]): boolean {
    // Verificar permiso exacto
    if (userPermissions.includes(permission)) {
      return true;
    }

    // Verificar wildcards
    if (userPermissions.includes('*')) {
      return true; // Super admin
    }

    // Verificar wildcards de módulo (ej: "users.*")
    const parts = permission.split('.');
    for (let i = parts.length - 1; i > 0; i--) {
      const wildcardPerm = parts.slice(0, i).join('.') + '.*';
      if (userPermissions.includes(wildcardPerm)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Métodos de cache
   */
  private generateCacheKey(userId: string, communityId?: string): string {
    return `${PermissionService.CACHE_PREFIX}:${userId}:${communityId || 'global'}`;
  }

  private async getFromCache(key: string): Promise<EffectivePermissions | null> {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.warn('Cache read error:', error);
      return null;
    }
  }

  private async saveToCache(key: string, permissions: EffectivePermissions): Promise<void> {
    try {
      await redisClient.setex(key, PermissionService.CACHE_TTL, JSON.stringify(permissions));
    } catch (error) {
      logger.warn('Cache write error:', error);
    }
  }

  private async invalidateUserCache(userId: string, communityId?: string): Promise<void> {
    try {
      if (communityId) {
        const key = this.generateCacheKey(userId, communityId);
        await redisClient.del(key);
      } else {
        // Invalidar todas las comunidades del usuario
        const pattern = `${PermissionService.CACHE_PREFIX}:${userId}:*`;
        const keys = await redisClient.keys(pattern);
        if (keys.length > 0) {
          await redisClient.del(...keys);
        }
      }
    } catch (error) {
      logger.warn('Cache invalidation error:', error);
    }
  }

  /**
   * Limpiar permisos expirados
   */
  async cleanupExpiredPermissions(): Promise<void> {
    try {
      const now = new Date();

      // Limpiar permisos de usuario expirados
      await UserPermission.update(
        { granted: false, expired_at: now },
        {
          where: {
            expires_at: { [Op.lt]: now },
            granted: true
          }
        }
      );

      // Limpiar roles expirados
      await UserRole.update(
        { is_active: false, expired_at: now },
        {
          where: {
            expires_at: { [Op.lt]: now },
            is_active: true
          }
        }
      );

      logger.info('Expired permissions cleaned up');
    } catch (error) {
      logger.error('Error cleaning up expired permissions:', error);
    }
  }

  /**
   * Condición para verificar que no esté expirado
   */
  private isNotExpired() {
    return {
      [Op.or]: [
        { expires_at: null },
        { expires_at: { [Op.gt]: new Date() } }
      ]
    };
  }
}

export const permissionService = new PermissionService();