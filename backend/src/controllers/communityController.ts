import { Request, Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import { Community, CommunityType } from '../models/Community';
import { CommunityFeature } from '../models/CommunityFeature';
import { CommunityMember } from '../models/CommunityMember';
import { Feature } from '../models/Feature';
import { User } from '../models/User';
import { Building } from '../models/Building';
import { Country } from '../models/Country';
import { AuditLog } from '../models/AuditLog';
import { cache, cacheKeys, cacheTTL } from '../config/redis';
import { AppError } from '../utils/AppError';
import { websocketService } from '../services/websocketService';
import { getPagination, getPagingData } from '../utils/pagination';
import { sequelize } from '../config/database';

export class CommunityController {
  /**
   * Obtener lista de comunidades
   */
  async getCommunities(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        page = 1,
        size = 10,
        search,
        type,
        country_id,
        is_active = true,
        sort_by = 'name',
        sort_order = 'ASC'
      } = req.query;

      const { limit, offset } = getPagination(Number(page), Number(size));

      // Construir condiciones
      const where: any = {};

      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { code: { [Op.iLike]: `%${search}%` } },
          { city: { [Op.iLike]: `%${search}%` } }
        ];
      }

      if (type) {
        where.type = type;
      }

      if (country_id) {
        where.country_id = country_id;
      }

      where.is_active = is_active === 'true';

      // Consulta con estadísticas
      const communities = await Community.findAndCountAll({
        where,
        include: [
          {
            model: Country,
            as: 'country',
            attributes: ['id', 'code', 'name']
          }
        ],
        attributes: {
          include: [
            [
              sequelize.literal(`(
                SELECT COUNT(*) 
                FROM community_members 
                WHERE community_id = "Community"."id" 
                AND is_active = true
              )`),
              'members_count'
            ],
            [
              sequelize.literal(`(
                SELECT COUNT(*) 
                FROM buildings 
                WHERE community_id = "Community"."id" 
                AND is_active = true
              )`),
              'buildings_count'
            ],
            [
              sequelize.literal(`(
                SELECT COUNT(*) 
                FROM devices 
                WHERE community_id = "Community"."id" 
                AND status = 'online'
              )`),
              'online_devices_count'
            ]
          ]
        },
        limit,
        offset,
        order: [[sort_by as string, sort_order as string]],
        distinct: true
      });

      const response = getPagingData(communities, Number(page), limit);

      res.json({
        success: true,
        data: response
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener comunidad por ID
   */
  async getCommunity(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      let community = await cache.get(cacheKeys.community(id));

      if (!community) {
        community = await Community.findByPk(id, {
          include: [
            {
              model: Country,
              as: 'country'
            },
            {
              model: Feature,
              as: 'features',
              through: {
                attributes: ['enabled', 'custom_settings', 'valid_from', 'valid_until']
              }
            }
          ]
        });

        if (!community) {
          throw new AppError('Comunidad no encontrada', 404);
        }

        await cache.set(cacheKeys.community(id), community.toJSON(), cacheTTL.medium);
      }

      // Obtener estadísticas adicionales
      const stats = {
        members_count: await community.getMemberCount(),
        active_devices: await community.getActiveDeviceCount(),
        monthly_revenue: await community.getMonthlyRevenue(),
        occupancy_rate: await community.getOccupancyRate()
      };

      res.json({
        success: true,
        data: {
          ...community.toJSON(),
          stats
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Crear nueva comunidad
   */
  async createCommunity(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        code,
        name,
        type,
        country_id,
        address,
        city,
        state,
        postal_code,
        latitude,
        longitude,
        contact_name,
        contact_email,
        contact_phone,
        settings,
        features
      } = req.body;

      // Verificar código único
      const existingCommunity = await Community.findByCode(code);
      if (existingCommunity) {
        throw new AppError('El código de comunidad ya existe', 400);
      }

      // Obtener timezone del país
      const country = await Country.findByPk(country_id);
      if (!country) {
        throw new AppError('País no encontrado', 404);
      }

      // Iniciar transacción
      const transaction = await sequelize.transaction();

      try {
        // Crear comunidad
        const community = await Community.create({
          code,
          name,
          type,
          country_id,
          address,
          city,
          state,
          postal_code,
          latitude,
          longitude,
          timezone: country.timezone,
          contact_name,
          contact_email,
          contact_phone,
          settings: {
            ...Community.DEFAULT_SETTINGS,
            ...settings
          }
        }, { transaction });

        // Asignar features si se especifican
        if (features && Array.isArray(features)) {
          for (const featureId of features) {
            await CommunityFeature.create({
              community_id: community.id,
              feature_id: featureId,
              enabled: true,
              enabled_by: req.user!.id
            }, { transaction });
          }
        } else {
          // Asignar features básicas por defecto
          const coreFeatures = await Feature.getByCategory('core' as any);
          for (const feature of coreFeatures) {
            await CommunityFeature.create({
              community_id: community.id,
              feature_id: feature.id,
              enabled: true,
              enabled_by: req.user!.id
            }, { transaction });
          }
        }

        // Crear edificio principal por defecto
        await Building.create({
          community_id: community.id,
          code: 'PRINCIPAL',
          name: 'Edificio Principal',
          floors_count: 1,
          units_count: 0
        }, { transaction });

        await transaction.commit();

        // Registrar en auditoría
        await AuditLog.create({
          user_id: req.user!.id,
          action: 'community.create',
          entity_type: 'community',
          entity_id: community.id,
          new_values: {
            code,
            name,
            type
          },
          ip_address: req.ip,
          user_agent: req.headers['user-agent']
        });

        // Recargar con asociaciones
        const createdCommunity = await Community.findByPk(community.id, {
          include: ['country', 'features']
        });

        res.status(201).json({
          success: true,
          data: createdCommunity,
          message: 'Comunidad creada exitosamente'
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
   * Actualizar comunidad
   */
  async updateCommunity(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const community = await Community.findByPk(id);
      if (!community) {
        throw new AppError('Comunidad no encontrada', 404);
      }

      const oldValues = community.toJSON();

      // Verificar cambios únicos
      if (updates.code && updates.code !== community.code) {
        const existingCode = await Community.findByCode(updates.code);
        if (existingCode) {
          throw new AppError('El código de comunidad ya existe', 400);
        }
      }

      // Actualizar comunidad
      await community.update(updates);

      // Limpiar caché
      await cache.del(cacheKeys.community(id));

      // Registrar en auditoría
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'community.update',
        entity_type: 'community',
        entity_id: community.id,
        old_values: oldValues,
        new_values: updates,
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });

      // Notificar cambios
      websocketService.emitToCommunity(id, 'community.updated', {
        community_id: id,
        changes: Object.keys(updates),
        timestamp: new Date()
      });

      res.json({
        success: true,
        data: community,
        message: 'Comunidad actualizada exitosamente'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Gestionar features de la comunidad
   */
  async manageCommunityFeatures(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { features } = req.body; // Array de { feature_id, enabled, custom_settings }

      const community = await Community.findByPk(id);
      if (!community) {
        throw new AppError('Comunidad no encontrada', 404);
      }

      const transaction = await sequelize.transaction();

      try {
        // Obtener features actuales
        const currentFeatures = await CommunityFeature.findAll({
          where: { community_id: id }
        });

        // Procesar cambios
        for (const featureUpdate of features) {
          const existing = currentFeatures.find(
            cf => cf.feature_id === featureUpdate.feature_id
          );

          if (existing) {
            // Actualizar feature existente
            await existing.update({
              enabled: featureUpdate.enabled,
              custom_settings: featureUpdate.custom_settings || {},
              enabled_by: req.user!.id
            }, { transaction });
          } else {
            // Crear nueva feature
            await CommunityFeature.create({
              community_id: id,
              feature_id: featureUpdate.feature_id,
              enabled: featureUpdate.enabled,
              custom_settings: featureUpdate.custom_settings || {},
              enabled_by: req.user!.id
            }, { transaction });
          }
        }

        await transaction.commit();

        // Limpiar caché
        await cache.del(cacheKeys.communityFeatures(id));

        // Obtener features actualizadas
        const updatedFeatures = await community.getEnabledFeatures();

        // Notificar cambios
        websocketService.emitToCommunity(id, 'features.updated', {
          community_id: id,
          features: updatedFeatures.map(f => f.code),
          timestamp: new Date()
        });

        res.json({
          success: true,
          data: updatedFeatures,
          message: 'Features actualizadas exitosamente'
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
   * Obtener miembros de la comunidad
   */
  async getCommunityMembers(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const {
        page = 1,
        size = 20,
        member_type,
        search,
        unit_id,
        is_active = true
      } = req.query;

      const { limit, offset } = getPagination(Number(page), Number(size));

      const where: any = {
        community_id: id,
        is_active: is_active === 'true'
      };

      if (member_type) {
        where.member_type = member_type;
      }

      if (unit_id) {
        where.unit_id = unit_id;
      }

      const userWhere: any = {};
      if (search) {
        userWhere[Op.or] = [
          { first_name: { [Op.iLike]: `%${search}%` } },
          { last_name: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const members = await CommunityMember.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: 'user',
            where: userWhere,
            attributes: ['id', 'username', 'first_name', 'last_name', 'email', 'phone', 'avatar_url']
          },
          {
            model: Unit,
            as: 'unit',
            attributes: ['id', 'unit_number', 'building_id']
          }
        ],
        limit,
        offset,
        order: [['created_at', 'DESC']],
        distinct: true
      });

      const response = getPagingData(members, Number(page), limit);

      res.json({
        success: true,
        data: response
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Agregar miembro a la comunidad
   */
  async addCommunityMember(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const {
        user_id,
        member_type,
        unit_id,
        relationship,
        valid_until
      } = req.body;

      const community = await Community.findByPk(id);
      if (!community) {
        throw new AppError('Comunidad no encontrada', 404);
      }

      // Verificar si ya es miembro
      const existingMember = await CommunityMember.findOne({
        where: {
          community_id: id,
          user_id: user_id,
          is_active: true
        }
      });

      if (existingMember) {
        throw new AppError('El usuario ya es miembro de esta comunidad', 400);
      }

      // Crear membresía
      const member = await CommunityMember.create({
        community_id: id,
        user_id: user_id,
        member_type: member_type,
        unit_id: unit_id,
        relationship: relationship,
        authorized_by: req.user!.id,
        valid_until: valid_until
      });

      // Registrar en auditoría
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'community.member.add',
        entity_type: 'community',
        entity_id: id,
        new_values: {
          user_id,
          member_type,
          unit_id
        },
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });

      // Notificar al usuario agregado
      websocketService.emitToUser(user_id, 'community.joined', {
        community_id: id,
        community_name: community.name,
        member_type,
        timestamp: new Date()
      });

      res.status(201).json({
        success: true,
        data: member,
        message: 'Miembro agregado exitosamente'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener estadísticas de la comunidad
   */
  async getCommunityStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { start_date, end_date } = req.query;

      const community = await Community.findByPk(id);
      if (!community) {
        throw new AppError('Comunidad no encontrada', 404);
      }

      // Estadísticas generales
      const generalStats = {
        total_members: await community.getMemberCount(),
        owners: await community.getMemberCount('owner'),
        tenants: await community.getMemberCount('tenant'),
        staff: await community.getMemberCount('staff'),
        active_devices: await community.getActiveDeviceCount(),
        occupancy_rate: await community.getOccupancyRate(),
        monthly_revenue: await community.getMonthlyRevenue()
      };

      // Estadísticas de acceso
      const accessStats = await AccessLog.getDailyStats(
        id,
        start_date ? new Date(start_date as string) : new Date()
      );

      // Estadísticas de invitaciones
      const invitationStats = await Invitation.getUsageStats(
        id,
        start_date ? new Date(start_date as string) : undefined,
        end_date ? new Date(end_date as string) : undefined
      );

      res.json({
        success: true,
        data: {
          general: generalStats,
          access: accessStats,
          invitations: invitationStats
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Exportar datos de la comunidad
   */
  async exportCommunityData(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { format = 'xlsx', include = ['members', 'units', 'devices'] } = req.query;

      const community = await Community.findByPk(id);
      if (!community) {
        throw new AppError('Comunidad no encontrada', 404);
      }

      // TODO: Implementar exportación de datos

      res.json({
        success: true,
        message: 'Funcionalidad en desarrollo'
      });

    } catch (error) {
      next(error);
    }
  }
}

export const communityController = new CommunityController();