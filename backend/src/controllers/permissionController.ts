import { Request, Response, NextFunction } from 'express';
import { Permission } from '../models/Permission';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { UserPermission } from '../models/UserPermission';
import { RolePermission } from '../models/RolePermission';
import { AuditLog } from '../models/AuditLog';
import { cache, cacheKeys, cacheTTL } from '../config/redis';
import { AppError } from '../utils/AppError';
import { websocketService } from '../services/websocketService';
import { sequelize } from '../config/database';

export class PermissionController {
  /**
   * Obtener árbol de permisos para UI con checkboxes
   */
  async getPermissionTree(req: Request, res: Response, next: NextFunction) {
    try {
      // Intentar obtener de caché
      let permissionTree = await cache.get(cacheKeys.permissionTree());

      if (!permissionTree) {
        permissionTree = await Permission.getPermissionTree();
        
        // Guardar en caché
        await cache.set(
          cacheKeys.permissionTree(),
          permissionTree,
          cacheTTL.long
        );
      }

      res.json({
        success: true,
        data: permissionTree
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener todos los permisos con filtros
   */
  async getPermissions(req: Request, res: Response, next: NextFunction) {
    try {
      const { module, risk_level, search } = req.query;

      const where: any = {};

      if (module) {
        where.module = module;
      }

      if (risk_level) {
        where.risk_level = risk_level;
      }

      if (search) {
        where[Op.or] = [
          { code: { [Op.iLike]: `%${search}%` } },
          { name: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const permissions = await Permission.findAll({
        where,
        order: [['module', 'ASC'], ['name', 'ASC']]
      });

      res.json({
        success: true,
        data: permissions
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener permisos de un rol
   */
  async getRolePermissions(req: Request, res: Response, next: NextFunction) {
    try {
      const { roleId } = req.params;

      const role = await Role.findByPk(roleId);
      if (!role) {
        throw new AppError('Rol no encontrado', 404);
      }

      // Obtener permisos del rol
      const permissions = await role.getPermissions();

      // Obtener permisos heredados si tiene rol padre
      let inheritedPermissions: Permission[] = [];
      if (role.parent_role_id) {
        inheritedPermissions = await role.getInheritedPermissions();
      }

      // Organizar respuesta
      const response = {
        role: {
          id: role.id,
          code: role.code,
          name: role.name,
          level: role.level
        },
        permissions: {
          direct: permissions.map(p => ({
            id: p.id,
            code: p.code,
            name: p.name,
            module: p.module,
            risk_level: p.risk_level
          })),
          inherited: inheritedPermissions.filter(
            ip => !permissions.find(p => p.id === ip.id)
          ).map(p => ({
            id: p.id,
            code: p.code,
            name: p.name,
            module: p.module,
            risk_level: p.risk_level
          })),
          all: [...new Set([...permissions, ...inheritedPermissions])].map(p => p.code)
        }
      };

      res.json({
        success: true,
        data: response
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualizar permisos de un rol (checkboxes)
   */
  async updateRolePermissions(req: Request, res: Response, next: NextFunction) {
    try {
      const { roleId } = req.params;
      const { permissions, reason } = req.body;

      if (!Array.isArray(permissions)) {
        throw new AppError('Los permisos deben ser un array', 400);
      }

      const role = await Role.findByPk(roleId);
      if (!role) {
        throw new AppError('Rol no encontrado', 404);
      }

      // Verificar que no se modifiquen roles del sistema sin ser super admin
      if (role.is_system && !(await req.user!.hasRole('SUPER_ADMIN'))) {
        throw new AppError('No tienes permisos para modificar roles del sistema', 403);
      }

      // Obtener permisos actuales
      const currentPermissions = await RolePermission.findAll({
        where: { role_id: roleId }
      });

      const currentPermissionIds = currentPermissions.map(rp => rp.permission_id);
      const newPermissionIds = permissions;

      // Calcular cambios
      const toAdd = newPermissionIds.filter((id: string) => !currentPermissionIds.includes(id));
      const toRemove = currentPermissionIds.filter(id => !newPermissionIds.includes(id));

      // Iniciar transacción
      const transaction = await sequelize.transaction();

      try {
        // Eliminar permisos removidos
        if (toRemove.length > 0) {
          await RolePermission.destroy({
            where: {
              role_id: roleId,
              permission_id: toRemove
            },
            transaction
          });
        }

        // Agregar nuevos permisos
        if (toAdd.length > 0) {
          const newRolePermissions = toAdd.map((permissionId: string) => ({
            role_id: roleId,
            permission_id: permissionId,
            granted: true
          }));

          await RolePermission.bulkCreate(newRolePermissions, { transaction });
        }

        // Confirmar transacción
        await transaction.commit();

        // Limpiar caché de todos los usuarios con este rol
        const usersWithRole = await UserRole.findAll({
          where: { role_id: roleId }
        });

        for (const userRole of usersWithRole) {
          await cache.del(cacheKeys.userPermissions(userRole.user_id));
          await cache.del(cacheKeys.userRoles(userRole.user_id));
        }

        // Limpiar caché del rol
        await cache.del(cacheKeys.rolePermissions(roleId));

        // Registrar en auditoría
        await AuditLog.create({
          user_id: req.user!.id,
          action: 'role.permissions.update',
          entity_type: 'role',
          entity_id: roleId,
          old_values: { permissions: currentPermissionIds },
          new_values: { permissions: newPermissionIds, reason },
          metadata: {
            added: toAdd.length,
            removed: toRemove.length
          },
          ip_address: req.ip,
          user_agent: req.headers['user-agent']
        });

        // Notificar cambios por WebSocket
        websocketService.emitToRole(roleId, 'permissions.updated', {
          role_id: roleId,
          added: toAdd,
          removed: toRemove,
          timestamp: new Date()
        });

        res.json({
          success: true,
          message: 'Permisos actualizados exitosamente',
          data: {
            added: toAdd.length,
            removed: toRemove.length
          }
        });

      } catch (error) {
        await transaction.rollback();
        throw error;
      }

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener permisos directos de un usuario
   */
  async getUserPermissions(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;
      const { community_id } = req.query;

      const user = await User.findByPk(userId);
      if (!user) {
        throw new AppError('Usuario no encontrado', 404);
      }

      // Obtener permisos directos
      const where: any = { user_id: userId };
      if (community_id) {
        where.community_id = community_id;
      }

      const userPermissions = await UserPermission.findAll({
        where,
        include: [{
          model: Permission,
          as: 'permission'
        }]
      });

      // Obtener permisos de roles
      const rolePermissions = await user.getEffectivePermissions(community_id as string);

      // Organizar respuesta
      const response = {
        user: {
          id: user.id,
          username: user.username,
          full_name: user.fullName
        },
        permissions: {
          direct: userPermissions.map(up => ({
            id: up.permission!.id,
            code: up.permission!.code,
            name: up.permission!.name,
            module: up.permission!.module,
            granted: up.granted,
            valid_from: up.valid_from,
            valid_until: up.valid_until
          })),
          from_roles: rolePermissions.filter(
            rp => !userPermissions.find(up => up.permission_id === rp.id)
          ).map(p => ({
            id: p.id,
            code: p.code,
            name: p.name,
            module: p.module
          })),
          all: [...new Set([
            ...userPermissions.filter(up => up.granted).map(up => up.permission!.code),
            ...rolePermissions.map(p => p.code)
          ])]
        }
      };

      res.json({
        success: true,
        data: response
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualizar permisos directos de un usuario
   */
  async updateUserPermissions(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;
      const { permissions, community_id, reason } = req.body;

      const user = await User.findByPk(userId);
      if (!user) {
        throw new AppError('Usuario no encontrado', 404);
      }

      // Obtener permisos actuales directos
      const where: any = { user_id: userId };
      if (community_id) {
        where.community_id = community_id;
      }

      const currentPermissions = await UserPermission.findAll({ where });
      const currentPermissionIds = currentPermissions.map(up => up.permission_id);

      // Iniciar transacción
      const transaction = await sequelize.transaction();

      try {
        // Eliminar todos los permisos actuales
        await UserPermission.destroy({ where, transaction });

        // Crear nuevos permisos
        if (permissions && permissions.length > 0) {
          const newUserPermissions = permissions.map((perm: any) => ({
            user_id: userId,
            permission_id: perm.permission_id,
            community_id: community_id,
            granted: perm.granted !== false,
            granted_by: req.user!.id,
            reason: reason,
            valid_from: perm.valid_from || new Date(),
            valid_until: perm.valid_until
          }));

          await UserPermission.bulkCreate(newUserPermissions, { transaction });
        }

        await transaction.commit();

        // Limpiar caché
        await cache.del(cacheKeys.userPermissions(userId, community_id));
        await cache.del(cacheKeys.user(userId));

        // Registrar en auditoría
        await AuditLog.create({
          user_id: req.user!.id,
          action: 'user.permissions.update',
          entity_type: 'user',
          entity_id: userId,
          old_values: { permissions: currentPermissionIds },
          new_values: { permissions: permissions.map((p: any) => p.permission_id), reason },
          metadata: { community_id },
          ip_address: req.ip,
          user_agent: req.headers['user-agent']
        });

        // Notificar al usuario
        websocketService.emitToUser(userId, 'permissions.updated', {
          user_id: userId,
          community_id,
          timestamp: new Date()
        });

        res.json({
          success: true,
          message: 'Permisos de usuario actualizados exitosamente'
        });

      } catch (error) {
        await transaction.rollback();
        throw error;
      }

    } catch (error) {
      next(error);
    }
  }

  /**
   * Vista previa de cambios de permisos
   */
  async previewPermissionChanges(req: Request, res: Response, next: NextFunction) {
    try {
      const { type, target_id, permissions, community_id } = req.body;

      if (!['role', 'user'].includes(type)) {
        throw new AppError('Tipo inválido. Debe ser "role" o "user"', 400);
      }

      let affectedUsers: any[] = [];
      let currentPermissions: string[] = [];
      let newPermissions = permissions || [];

      if (type === 'role') {
        // Obtener usuarios con este rol
        const userRoles = await UserRole.findAll({
          where: {
            role_id: target_id,
            is_active: true,
            ...(community_id ? { community_id } : {})
          },
          include: [{
            model: User,
            as: 'user'
          }]
        });

        affectedUsers = userRoles.map(ur => ({
          id: ur.user!.id,
          username: ur.user!.username,
          full_name: ur.user!.fullName
        }));

        // Obtener permisos actuales del rol
        const role = await Role.findByPk(target_id);
        if (role) {
          const rolePerms = await role.getPermissions();
          currentPermissions = rolePerms.map(p => p.code);
        }
      } else {
        // Usuario específico
        const user = await User.findByPk(target_id);
        if (user) {
          affectedUsers = [{
            id: user.id,
            username: user.username,
            full_name: user.fullName
          }];

          const userPerms = await user.getEffectivePermissions(community_id);
          currentPermissions = userPerms.map(p => p.code);
        }
      }

      // Obtener detalles de permisos nuevos
      const permissionDetails = await Permission.findAll({
        where: { id: newPermissions }
      });

      // Calcular cambios
      const newPermCodes = permissionDetails.map(p => p.code);
      const added = newPermCodes.filter(code => !currentPermissions.includes(code));
      const removed = currentPermissions.filter(code => !newPermCodes.includes(code));

      res.json({
        success: true,
        data: {
          affected_users: affectedUsers,
          changes: {
            added: added.length,
            removed: removed.length,
            added_permissions: added,
            removed_permissions: removed
          },
          risk_analysis: {
            high_risk_added: permissionDetails.filter(
              p => p.risk_level === 'high' || p.risk_level === 'critical'
            ).length,
            total_permissions: newPermCodes.length
          }
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener historial de cambios de permisos
   */
  async getPermissionHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { type, id } = req.params;
      const { limit = 20 } = req.query;

      const where: any = {
        entity_type: type,
        entity_id: id,
        action: {
          [Op.in]: ['role.permissions.update', 'user.permissions.update']
        }
      };

      const history = await AuditLog.findAll({
        where,
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'first_name', 'last_name']
        }],
        order: [['created_at', 'DESC']],
        limit: Number(limit)
      });

      res.json({
        success: true,
        data: history
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Crear plantilla de permisos
   */
  async createPermissionTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, description, permissions, category } = req.body;

      // TODO: Implementar modelo PermissionTemplate
      
      res.json({
        success: true,
        message: 'Plantilla creada exitosamente'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Aplicar plantilla de permisos
   */
  async applyPermissionTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const { templateId } = req.params;
      const { target_type, target_id } = req.body;

      // TODO: Implementar aplicación de plantillas

      res.json({
        success: true,
        message: 'Plantilla aplicada exitosamente'
      });

    } catch (error) {
      next(error);
    }
  }
}

export const permissionController = new PermissionController();