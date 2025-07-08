import { Request, Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import { User, UserStatus } from '../models/User';
import { Role } from '../models/Role';
import { UserRole } from '../models/UserRole';
import { Community } from '../models/Community';
import { CommunityMember } from '../models/CommunityMember';
import { AuditLog } from '../models/AuditLog';
import { cache, cacheKeys, cacheTTL } from '../config/redis';
import { AppError } from '../utils/AppError';
import { uploadService } from '../services/uploadService';
import { emailService } from '../services/emailService';
import { getPagination, getPagingData } from '../utils/pagination';
import crypto from 'crypto';

export class UserController {
  /**
   * Obtener lista de usuarios con paginación y filtros
   */
  async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        page = 1,
        size = 10,
        search,
        status,
        role,
        community_id,
        sort_by = 'created_at',
        sort_order = 'DESC'
      } = req.query;

      const { limit, offset } = getPagination(Number(page), Number(size));

      // Construir condiciones de búsqueda
      const where: any = {};

      if (search) {
        where[Op.or] = [
          { username: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
          { first_name: { [Op.iLike]: `%${search}%` } },
          { last_name: { [Op.iLike]: `%${search}%` } }
        ];
      }

      if (status) {
        where.status = status;
      }

      // Include para roles y comunidades
      const include: any[] = [
        {
          model: Role,
          as: 'roles',
          through: {
            attributes: ['community_id', 'is_active'],
            where: { is_active: true }
          },
          required: false
        }
      ];

      if (community_id) {
        include.push({
          model: Community,
          as: 'communities',
          where: { id: community_id },
          through: {
            attributes: ['member_type', 'is_active'],
            where: { is_active: true }
          },
          required: true
        });
      }

      if (role) {
        include[0].where = { code: role };
        include[0].required = true;
      }

      // Ejecutar consulta
      const users = await User.findAndCountAll({
        where,
        include,
        limit,
        offset,
        order: [[sort_by as string, sort_order as string]],
        distinct: true
      });

      const response = getPagingData(users, Number(page), limit);

      res.json({
        success: true,
        data: response
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener un usuario por ID
   */
  async getUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      // Intentar obtener de caché
      let user = await cache.get(cacheKeys.user(id));

      if (!user) {
        user = await User.findByPk(id, {
          include: [
            {
              model: Role,
              as: 'roles',
              through: {
                attributes: ['community_id', 'valid_from', 'valid_until', 'is_active']
              }
            },
            {
              model: Community,
              as: 'communities',
              through: {
                attributes: ['member_type', 'unit_id', 'valid_from', 'valid_until', 'is_active']
              }
            },
            {
              model: Country,
              as: 'country',
              attributes: ['id', 'code', 'name']
            }
          ]
        });

        if (!user) {
          throw new AppError('Usuario no encontrado', 404);
        }

        // Guardar en caché
        await cache.set(cacheKeys.user(id), user.toJSON(), cacheTTL.medium);
      }

      res.json({
        success: true,
        data: user
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Crear nuevo usuario
   */
  async createUser(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        username,
        email,
        password,
        first_name,
        last_name,
        phone,
        country_id,
        roles,
        communities,
        send_welcome_email = true
      } = req.body;

      // Verificar si el usuario ya existe
      const existingUser = await User.findOne({
        where: {
          [Op.or]: [{ username }, { email }]
        }
      });

      if (existingUser) {
        throw new AppError(
          existingUser.username === username 
            ? 'El nombre de usuario ya está en uso'
            : 'El email ya está registrado',
          400
        );
      }

      // Crear usuario
      const user = await User.create({
        username,
        email,
        password_hash: password, // Se hasheará en el hook
        first_name,
        last_name,
        phone,
        country_id,
        status: UserStatus.ACTIVE
      });

      // Asignar roles si se especifican
      if (roles && Array.isArray(roles)) {
        for (const roleData of roles) {
          await UserRole.create({
            user_id: user.id,
            role_id: roleData.role_id,
            community_id: roleData.community_id,
            assigned_by: req.user!.id
          });
        }
      }

      // Asignar a comunidades si se especifican
      if (communities && Array.isArray(communities)) {
        for (const communityData of communities) {
          await CommunityMember.create({
            community_id: communityData.community_id,
            user_id: user.id,
            member_type: communityData.member_type || 'resident',
            unit_id: communityData.unit_id,
            authorized_by: req.user!.id
          });
        }
      }

      // Enviar email de bienvenida
      if (send_welcome_email) {
        const tempPassword = crypto.randomBytes(8).toString('hex');
        await user.updatePassword(tempPassword);
        
        await emailService.sendWelcomeEmail(
          user.email,
          user.fullName,
          username,
          tempPassword
        );
      }

      // Registrar en auditoría
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'user.create',
        entity_type: 'user',
        entity_id: user.id,
        new_values: {
          username,
          email,
          first_name,
          last_name
        },
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });

      // Recargar con asociaciones
      const createdUser = await User.findByPk(user.id, {
        include: ['roles', 'communities']
      });

      res.status(201).json({
        success: true,
        data: createdUser,
        message: 'Usuario creado exitosamente'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualizar usuario
   */
  async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const user = await User.findByPk(id);
      if (!user) {
        throw new AppError('Usuario no encontrado', 404);
      }

      // Guardar valores anteriores para auditoría
      const oldValues = user.toJSON();

      // Verificar cambios únicos
      if (updates.username && updates.username !== user.username) {
        const existingUsername = await User.findOne({
          where: { username: updates.username }
        });
        if (existingUsername) {
          throw new AppError('El nombre de usuario ya está en uso', 400);
        }
      }

      if (updates.email && updates.email !== user.email) {
        const existingEmail = await User.findOne({
          where: { email: updates.email }
        });
        if (existingEmail) {
          throw new AppError('El email ya está registrado', 400);
        }
      }

      // Actualizar usuario
      await user.update(updates);

      // Si se actualiza el email, marcar como no verificado
      if (updates.email && updates.email !== oldValues.email) {
        user.email_verified = false;
        user.email_verified_at = null;
        await user.save();
        
        // TODO: Enviar email de verificación
      }

      // Actualizar roles si se especifican
      if (updates.roles !== undefined) {
        // Eliminar roles actuales
        await UserRole.destroy({
          where: { user_id: user.id }
        });

        // Asignar nuevos roles
        for (const roleData of updates.roles) {
          await UserRole.create({
            user_id: user.id,
            role_id: roleData.role_id,
            community_id: roleData.community_id,
            assigned_by: req.user!.id
          });
        }
      }

      // Limpiar caché
      await cache.del(cacheKeys.user(id));
      await cache.del(cacheKeys.userPermissions(id));
      await cache.del(cacheKeys.userRoles(id));

      // Registrar en auditoría
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'user.update',
        entity_type: 'user',
        entity_id: user.id,
        old_values: oldValues,
        new_values: updates,
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });

      // Recargar con asociaciones
      const updatedUser = await User.findByPk(user.id, {
        include: ['roles', 'communities']
      });

      res.json({
        success: true,
        data: updatedUser,
        message: 'Usuario actualizado exitosamente'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Eliminar usuario (soft delete)
   */
  async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const user = await User.findByPk(id);
      if (!user) {
        throw new AppError('Usuario no encontrado', 404);
      }

      // No permitir eliminar super admin
      const isSuperAdmin = await user.hasRole('SUPER_ADMIN');
      if (isSuperAdmin) {
        throw new AppError('No se puede eliminar un Super Administrador', 403);
      }

      // No permitir auto-eliminación
      if (user.id === req.user!.id) {
        throw new AppError('No puedes eliminar tu propia cuenta', 403);
      }

      // Cambiar estado a eliminado
      user.status = UserStatus.DELETED;
      user.deleted_at = new Date();
      await user.save();

      // Desactivar todas las membresías
      await CommunityMember.update(
        { is_active: false },
        { where: { user_id: user.id } }
      );

      // Desactivar todos los roles
      await UserRole.update(
        { is_active: false },
        { where: { user_id: user.id } }
      );

      // Invalidar todas las sesiones
      await UserSession.update(
        { is_active: false },
        { where: { user_id: user.id } }
      );

      // Limpiar caché
      await cache.delPattern(`*:${user.id}:*`);

      // Registrar en auditoría
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'user.delete',
        entity_type: 'user',
        entity_id: user.id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });

      res.json({
        success: true,
        message: 'Usuario eliminado exitosamente'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Cambiar estado del usuario
   */
  async changeUserStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status, reason } = req.body;

      const user = await User.findByPk(id);
      if (!user) {
        throw new AppError('Usuario no encontrado', 404);
      }

      const oldStatus = user.status;
      user.status = status;
      await user.save();

      // Si se suspende, invalidar sesiones
      if (status === UserStatus.SUSPENDED) {
        await UserSession.update(
          { is_active: false },
          { where: { user_id: user.id } }
        );
      }

      // Registrar en auditoría
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'user.status_change',
        entity_type: 'user',
        entity_id: user.id,
        old_values: { status: oldStatus },
        new_values: { status, reason },
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });

      res.json({
        success: true,
        message: `Estado del usuario cambiado a ${status}`,
        data: { status }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Subir avatar del usuario
   */
  async uploadAvatar(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const user = await User.findByPk(id);
      if (!user) {
        throw new AppError('Usuario no encontrado', 404);
      }

      if (!req.file) {
        throw new AppError('No se proporcionó ningún archivo', 400);
      }

      // Subir imagen y obtener URL
      const avatarUrl = await uploadService.uploadAvatar(req.file, user.id);

      // Eliminar avatar anterior si existe
      if (user.avatar_url) {
        await uploadService.deleteFile(user.avatar_url);
      }

      // Actualizar usuario
      user.avatar_url = avatarUrl;
      await user.save();

      // Limpiar caché
      await cache.del(cacheKeys.user(id));

      res.json({
        success: true,
        data: { avatar_url: avatarUrl },
        message: 'Avatar actualizado exitosamente'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener permisos efectivos del usuario
   */
  async getUserPermissions(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { community_id } = req.query;

      const user = await User.findByPk(id);
      if (!user) {
        throw new AppError('Usuario no encontrado', 404);
      }

      const permissions = await user.getEffectivePermissions(community_id as string);

      // Agrupar por módulo
      const groupedPermissions = permissions.reduce((acc: any, permission) => {
        if (!acc[permission.module]) {
          acc[permission.module] = [];
        }
        acc[permission.module].push({
          id: permission.id,
          code: permission.code,
          name: permission.name,
          description: permission.description,
          risk_level: permission.risk_level
        });
        return acc;
      }, {});

      res.json({
        success: true,
        data: {
          total: permissions.length,
          grouped: groupedPermissions,
          flat: permissions.map(p => p.code)
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Resetear contraseña del usuario
   */
  async resetUserPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { send_email = true } = req.body;

      const user = await User.findByPk(id);
      if (!user) {
        throw new AppError('Usuario no encontrado', 404);
      }

      // Generar nueva contraseña temporal
      const tempPassword = crypto.randomBytes(8).toString('hex');
      await user.updatePassword(tempPassword);

      // Invalidar sesiones actuales
      await UserSession.update(
        { is_active: false },
        { where: { user_id: user.id } }
      );

      // Enviar email si se solicita
      if (send_email) {
        await emailService.sendPasswordResetByAdmin(
          user.email,
          user.fullName,
          tempPassword
        );
      }

      // Registrar en auditoría
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'user.password_reset_by_admin',
        entity_type: 'user',
        entity_id: user.id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });

      res.json({
        success: true,
        message: send_email 
          ? 'Contraseña reseteada y enviada por email'
          : 'Contraseña reseteada exitosamente',
        data: send_email ? {} : { temp_password: tempPassword }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener actividad reciente del usuario
   */
  async getUserActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { limit = 20 } = req.query;

      const user = await User.findByPk(id);
      if (!user) {
        throw new AppError('Usuario no encontrado', 404);
      }

      // Obtener logs de auditoría
      const auditLogs = await AuditLog.findAll({
        where: { user_id: user.id },
        order: [['created_at', 'DESC']],
        limit: Number(limit)
      });

      // Obtener logs de acceso
      const accessLogs = await AccessLog.scope('withDetails').findAll({
        where: { user_id: user.id },
        order: [['created_at', 'DESC']],
        limit: Number(limit)
      });

      // Obtener sesiones recientes
      const sessions = await UserSession.findAll({
        where: { user_id: user.id },
        order: [['created_at', 'DESC']],
        limit: 5
      });

      res.json({
        success: true,
        data: {
          audit_logs: auditLogs,
          access_logs: accessLogs,
          recent_sessions: sessions
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Exportar usuarios a Excel
   */
  async exportUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const { community_id, format = 'xlsx' } = req.query;

      // Construir query
      const where: any = { status: { [Op.ne]: UserStatus.DELETED } };
      const include: any[] = [
        {
          model: Role,
          as: 'roles',
          attributes: ['code', 'name']
        }
      ];

      if (community_id) {
        include.push({
          model: Community,
          as: 'communities',
          where: { id: community_id },
          attributes: ['name'],
          required: true
        });
      }

      const users = await User.findAll({
        where,
        include,
        order: [['created_at', 'DESC']]
      });

      // Preparar datos para exportar
      const exportData = users.map(user => ({
        ID: user.id,
        Usuario: user.username,
        Email: user.email,
        'Nombre Completo': user.fullName,
        Teléfono: user.phone || '',
        Estado: user.status,
        Roles: user.roles?.map(r => r.name).join(', ') || '',
        'Email Verificado': user.email_verified ? 'Sí' : 'No',
        '2FA Habilitado': user.two_factor_enabled ? 'Sí' : 'No',
        'Último Login': user.last_login ? new Date(user.last_login).toLocaleString('es-CL') : 'Nunca',
        'Fecha Registro': new Date(user.created_at).toLocaleString('es-CL')
      }));

      // Generar archivo
      const buffer = await exportService.generateExcel(exportData, 'Usuarios');

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=usuarios_${Date.now()}.xlsx`);
      res.send(buffer);

    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();