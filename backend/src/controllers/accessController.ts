import { Request, Response, NextFunction } from 'express';
import { AccessLog } from '../models/AccessLog';
import { AccessPoint } from '../models/AccessPoint';
import { User } from '../models/User';
import { Device } from '../models/Device';
import { Community } from '../models/Community';
import { Vehicle } from '../models/Vehicle';
import { Invitation } from '../models/Invitation';
import { AuditLog } from '../models/AuditLog';
import { AntiPassback } from '../models/AntiPassback';
import { mqttService } from '../services/mqttService';
import { websocketService } from '../services/websocketService';
import { cache, cacheKeys, cacheTTL } from '../config/redis';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { Op, fn, col, literal } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';

export class AccessController {
  /**
   * Listar logs de acceso con filtros avanzados
   */
  async getAccessLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        page = 1,
        limit = 50,
        community_id,
        access_point_id,
        user_id,
        granted,
        method,
        from,
        to,
        vehicle_plate,
        search,
        sort = 'access_time',
        order = 'desc'
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);
      const whereConditions: any = {};

      // Filtros
      if (community_id) whereConditions.community_id = community_id;
      if (access_point_id) whereConditions.access_point_id = access_point_id;
      if (user_id) whereConditions.user_id = user_id;
      if (granted !== undefined) whereConditions.granted = granted === 'true';
      if (method) whereConditions.access_method = method;
      if (vehicle_plate) whereConditions.vehicle_plate = { [Op.iLike]: `%${vehicle_plate}%` };

      // Rango de fechas
      if (from || to) {
        whereConditions.access_time = {};
        if (from) whereConditions.access_time[Op.gte] = new Date(from as string);
        if (to) whereConditions.access_time[Op.lte] = new Date(to as string);
      }

      // Búsqueda global
      if (search) {
        whereConditions[Op.or] = [
          { vehicle_plate: { [Op.iLike]: `%${search}%` } },
          { denial_reason: { [Op.iLike]: `%${search}%` } },
          { '$user.first_name$': { [Op.iLike]: `%${search}%` } },
          { '$user.last_name$': { [Op.iLike]: `%${search}%` } },
          { '$access_point.name$': { [Op.iLike]: `%${search}%` } }
        ];
      }

      // Verificar permisos multi-tenant
      if (!req.user?.hasPermission('access.logs.view.all')) {
        const userCommunities = await req.user!.getCommunities();
        const communityIds = userCommunities.map(c => c.id);
        whereConditions.community_id = { [Op.in]: communityIds };
      }

      const { count, rows: accessLogs } = await AccessLog.findAndCountAll({
        where: whereConditions,
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'username', 'first_name', 'last_name', 'avatar_url'],
            required: false
          },
          {
            model: AccessPoint,
            as: 'accessPoint',
            attributes: ['id', 'name', 'type', 'location', 'direction'],
            include: [
              {
                model: Device,
                as: 'device',
                attributes: ['id', 'name', 'serial_number']
              }
            ]
          },
          {
            model: Community,
            as: 'community',
            attributes: ['id', 'name', 'code']
          },
          {
            model: Vehicle,
            as: 'vehicle',
            attributes: ['id', 'plate_number', 'brand', 'model', 'color'],
            required: false
          }
        ],
        order: [[sort as string, order as string]],
        limit: Number(limit),
        offset,
        distinct: true
      });

      // Calcular estadísticas del período
      const stats = await this.calculateAccessStats(whereConditions);

      res.json({
        success: true,
        data: {
          access_logs: accessLogs,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total: count,
            pages: Math.ceil(count / Number(limit)),
            has_next: offset + Number(limit) < count,
            has_prev: Number(page) > 1
          },
          statistics: stats
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener log de acceso específico
   */
  async getAccessLog(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const accessLog = await AccessLog.findByPk(id, {
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'username', 'first_name', 'last_name', 'email', 'avatar_url']
          },
          {
            model: AccessPoint,
            as: 'accessPoint',
            include: [
              {
                model: Device,
                as: 'device',
                attributes: ['id', 'name', 'serial_number', 'device_type']
              }
            ]
          },
          {
            model: Community,
            as: 'community',
            attributes: ['id', 'name', 'code', 'timezone']
          },
          {
            model: Vehicle,
            as: 'vehicle',
            required: false
          },
          {
            model: User,
            as: 'authorizer',
            attributes: ['id', 'username', 'first_name', 'last_name'],
            required: false
          }
        ]
      });

      if (!accessLog) {
        throw new AppError('Log de acceso no encontrado', 404);
      }

      // Verificar permisos
      if (!req.user?.hasPermission('access.logs.view', accessLog.community_id)) {
        throw new AppError('Sin permisos para ver este log', 403);
      }

      // Obtener logs relacionados (mismo usuario, mismo punto de acceso, misma fecha)
      const relatedLogs = await AccessLog.findAll({
        where: {
          [Op.or]: [
            { user_id: accessLog.user_id },
            { access_point_id: accessLog.access_point_id }
          ],
          access_time: {
            [Op.between]: [
              new Date(new Date(accessLog.access_time).getTime() - 3600000), // 1 hora antes
              new Date(new Date(accessLog.access_time).getTime() + 3600000)  // 1 hora después
            ]
          },
          id: { [Op.ne]: accessLog.id }
        },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'first_name', 'last_name']
          },
          {
            model: AccessPoint,
            as: 'accessPoint',
            attributes: ['id', 'name']
          }
        ],
        order: [['access_time', 'ASC']],
        limit: 10
      });

      res.json({
        success: true,
        data: {
          access_log: accessLog,
          related_logs: relatedLogs
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Crear log de acceso (usado por dispositivos y sistema)
   */
  async createAccessLog(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        access_point_id,
        user_id,
        access_method,
        direction = 'in',
        granted = true,
        denial_reason,
        vehicle_plate,
        photo_url,
        facial_match_score,
        temperature,
        device_id,
        operator_id,
        metadata = {}
      } = req.body;

      // Verificar que el punto de acceso existe
      const accessPoint = await AccessPoint.findByPk(access_point_id, {
        include: [{ model: Community, as: 'community' }]
      });

      if (!accessPoint) {
        throw new AppError('Punto de acceso no encontrado', 404);
      }

      // Verificar permisos
      if (!req.user?.hasPermission('access.logs.create', accessPoint.community_id)) {
        throw new AppError('Sin permisos para crear logs en esta comunidad', 403);
      }

      // Verificar anti-passback si está habilitado
      if (accessPoint.anti_passback_enabled && user_id) {
        const antiPassbackViolation = await this.checkAntiPassback(
          user_id, 
          accessPoint.id, 
          direction,
          accessPoint.community_id
        );

        if (antiPassbackViolation) {
          throw new AppError('Violación de anti-passback detectada', 400);
        }
      }

      // Verificar interlock si existe
      if (accessPoint.interlock_group) {
        const interlockViolation = await this.checkInterlock(
          accessPoint.interlock_group,
          accessPoint.id
        );

        if (interlockViolation) {
          throw new AppError('Violación de interlock detectada', 400);
        }
      }

      // Crear log de acceso
      const accessLog = await AccessLog.create({
        access_point_id,
        user_id,
        access_method,
        direction,
        granted,
        denial_reason,
        vehicle_plate,
        photo_url,
        facial_match_score,
        temperature,
        device_id,
        operator_id: operator_id || req.user!.id,
        response_time_ms: metadata.response_time_ms,
        community_id: accessPoint.community_id,
        access_time: new Date()
      });

      // Actualizar anti-passback si el acceso fue concedido
      if (granted && user_id && accessPoint.anti_passback_enabled) {
        await this.updateAntiPassback(
          user_id,
          accessPoint.community_id,
          accessPoint.id,
          direction
        );
      }

      // Enviar notificación en tiempo real
      websocketService.emitToCommunity(accessPoint.community_id, 'access.new', {
        access_log: accessLog,
        access_point: accessPoint,
        timestamp: new Date().toISOString()
      });

      // Registrar en auditoría
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'access.log_created',
        entity_type: 'access_log',
        entity_id: accessLog.id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        metadata: {
          access_point_id,
          granted,
          access_method,
          direction
        }
      });

      res.status(201).json({
        success: true,
        message: 'Log de acceso creado exitosamente',
        data: { access_log: accessLog }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Autorizar acceso manual (override)
   */
  async authorizeAccess(req: Request, res: Response, next: NextFunction) {
    try {
      const { access_point_id, user_id, reason, duration_seconds = 30 } = req.body;

      // Verificar permisos especiales
      if (!req.user?.hasPermission('access.manual.authorize')) {
        throw new AppError('Sin permisos para autorizar acceso manual', 403);
      }

      const accessPoint = await AccessPoint.findByPk(access_point_id, {
        include: [
          {
            model: Device,
            as: 'device'
          },
          {
            model: Community,
            as: 'community'
          }
        ]
      });

      if (!accessPoint) {
        throw new AppError('Punto de acceso no encontrado', 404);
      }

      // Verificar que el usuario existe
      let user = null;
      if (user_id) {
        user = await User.findByPk(user_id);
        if (!user) {
          throw new AppError('Usuario no encontrado', 404);
        }
      }

      // Enviar comando al dispositivo para abrir
      if (accessPoint.device && accessPoint.device.status === 'online') {
        await mqttService.sendCommand(accessPoint.device.serial_number, {
          command: 'open_door',
          parameters: {
            duration: duration_seconds,
            manual_override: true,
            authorized_by: req.user!.id
          },
          timestamp: new Date().toISOString()
        });
      }

      // Crear log de acceso manual
      const accessLog = await AccessLog.create({
        access_point_id,
        user_id,
        access_method: 'manual',
        direction: 'in',
        granted: true,
        operator_id: req.user!.id,
        community_id: accessPoint.community_id,
        access_time: new Date(),
        metadata: {
          manual_override: true,
          reason,
          duration_seconds
        }
      });

      // Registrar en auditoría
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'access.manual_authorized',
        entity_type: 'access_point',
        entity_id: accessPoint.id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        metadata: {
          target_user_id: user_id,
          reason,
          duration_seconds,
          access_log_id: accessLog.id
        }
      });

      // Notificar en tiempo real
      websocketService.emitToCommunity(accessPoint.community_id, 'access.manual_authorized', {
        access_point: accessPoint,
        authorizer: req.user,
        user: user,
        reason,
        timestamp: new Date().toISOString()
      });

      res.json({
        success: true,
        message: 'Acceso autorizado exitosamente',
        data: {
          access_log_id: accessLog.id,
          expires_at: new Date(Date.now() + duration_seconds * 1000)
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Denegar acceso y bloquear temporalmente
   */
  async denyAccess(req: Request, res: Response, next: NextFunction) {
    try {
      const { access_point_id, user_id, reason, duration_minutes = 30 } = req.body;

      // Verificar permisos
      if (!req.user?.hasPermission('access.deny')) {
        throw new AppError('Sin permisos para denegar acceso', 403);
      }

      const accessPoint = await AccessPoint.findByPk(access_point_id);
      if (!accessPoint) {
        throw new AppError('Punto de acceso no encontrado', 404);
      }

      // Crear log de acceso denegado
      const accessLog = await AccessLog.create({
        access_point_id,
        user_id,
        access_method: 'manual',
        direction: 'in',
        granted: false,
        denial_reason: reason,
        operator_id: req.user!.id,
        community_id: accessPoint.community_id,
        access_time: new Date()
      });

      // Bloquear temporalmente si se especifica usuario
      if (user_id && duration_minutes > 0) {
        const blockKey = `access_blocked:${user_id}:${access_point_id}`;
        await cache.set(
          blockKey,
          JSON.stringify({
            blocked_by: req.user!.id,
            reason,
            blocked_at: new Date().toISOString()
          }),
          duration_minutes * 60
        );
      }

      // Registrar en auditoría
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'access.denied',
        entity_type: 'access_point',
        entity_id: accessPoint.id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        metadata: {
          target_user_id: user_id,
          reason,
          duration_minutes,
          access_log_id: accessLog.id
        }
      });

      res.json({
        success: true,
        message: 'Acceso denegado exitosamente',
        data: {
          access_log_id: accessLog.id,
          blocked_until: duration_minutes > 0 ? 
            new Date(Date.now() + duration_minutes * 60 * 1000) : null
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener estadísticas de acceso
   */
  async getAccessStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { 
        community_id, 
        from = new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 horas atrás
        to = new Date(),
        group_by = 'hour'
      } = req.query;

      // Verificar permisos
      if (!req.user?.hasPermission('access.stats.view', community_id as string)) {
        throw new AppError('Sin permisos para ver estadísticas', 403);
      }

      const whereConditions: any = {
        access_time: {
          [Op.between]: [new Date(from as string), new Date(to as string)]
        }
      };

      if (community_id) {
        whereConditions.community_id = community_id;
      }

      // Estadísticas generales
      const [totalAccesses, grantedAccesses, deniedAccesses] = await Promise.all([
        AccessLog.count({ where: whereConditions }),
        AccessLog.count({ where: { ...whereConditions, granted: true } }),
        AccessLog.count({ where: { ...whereConditions, granted: false } })
      ]);

      // Accesos por método
      const accessesByMethod = await AccessLog.findAll({
        where: whereConditions,
        attributes: [
          'access_method',
          [fn('COUNT', col('id')), 'count']
        ],
        group: ['access_method'],
        raw: true
      });

      // Accesos por punto de acceso
      const accessesByPoint = await AccessLog.findAll({
        where: whereConditions,
        attributes: [
          [col('access_point.name'), 'access_point_name'],
          [fn('COUNT', col('access_logs.id')), 'count']
        ],
        include: [
          {
            model: AccessPoint,
            as: 'accessPoint',
            attributes: []
          }
        ],
        group: ['access_point.id', 'access_point.name'],
        raw: true
      });

      // Accesos por hora/día según agrupación
      let timeFormat = '%Y-%m-%d %H:00:00';
      if (group_by === 'day') timeFormat = '%Y-%m-%d';
      if (group_by === 'minute') timeFormat = '%Y-%m-%d %H:%M:00';

      const accessesByTime = await AccessLog.findAll({
        where: whereConditions,
        attributes: [
          [fn('DATE_TRUNC', group_by, col('access_time')), 'time_period'],
          [fn('COUNT', col('id')), 'count'],
          [fn('SUM', literal('CASE WHEN granted THEN 1 ELSE 0 END')), 'granted_count'],
          [fn('SUM', literal('CASE WHEN granted THEN 0 ELSE 1 END')), 'denied_count']
        ],
        group: [fn('DATE_TRUNC', group_by, col('access_time'))],
        order: [[fn('DATE_TRUNC', group_by, col('access_time')), 'ASC']],
        raw: true
      });

      // Top usuarios
      const topUsers = await AccessLog.findAll({
        where: whereConditions,
        attributes: [
          [col('user.first_name'), 'first_name'],
          [col('user.last_name'), 'last_name'],
          [fn('COUNT', col('access_logs.id')), 'count']
        ],
        include: [
          {
            model: User,
            as: 'user',
            attributes: []
          }
        ],
        group: ['user.id', 'user.first_name', 'user.last_name'],
        order: [[fn('COUNT', col('access_logs.id')), 'DESC']],
        limit: 10,
        raw: true
      });

      const successRate = totalAccesses > 0 ? 
        Math.round((grantedAccesses / totalAccesses) * 100 * 100) / 100 : 0;

      res.json({
        success: true,
        data: {
          summary: {
            total_accesses: totalAccesses,
            granted_accesses: grantedAccesses,
            denied_accesses: deniedAccesses,
            success_rate: successRate,
            period: {
              from: from,
              to: to
            }
          },
          accesses_by_method: accessesByMethod,
          accesses_by_point: accessesByPoint,
          accesses_by_time: accessesByTime,
          top_users: topUsers
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Exportar logs de acceso
   */
  async exportAccessLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const { format = 'csv', ...filters } = req.query;

      // Verificar permisos
      if (!req.user?.hasPermission('access.logs.export')) {
        throw new AppError('Sin permisos para exportar logs', 403);
      }

      // Construir filtros (similar a getAccessLogs)
      const whereConditions: any = {};
      
      if (filters.community_id) whereConditions.community_id = filters.community_id;
      if (filters.from || filters.to) {
        whereConditions.access_time = {};
        if (filters.from) whereConditions.access_time[Op.gte] = new Date(filters.from as string);
        if (filters.to) whereConditions.access_time[Op.lte] = new Date(filters.to as string);
      }

      const accessLogs = await AccessLog.findAll({
        where: whereConditions,
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['username', 'first_name', 'last_name']
          },
          {
            model: AccessPoint,
            as: 'accessPoint',
            attributes: ['name', 'type', 'location']
          },
          {
            model: Community,
            as: 'community',
            attributes: ['name']
          }
        ],
        order: [['access_time', 'DESC']],
        limit: 10000 // Limitar para evitar exports muy grandes
      });

      if (format === 'csv') {
        // Generar CSV
        const csvHeader = 'Fecha,Hora,Usuario,Punto de Acceso,Método,Dirección,Concedido,Razón Denegación,Placa,Comunidad\n';
        const csvRows = accessLogs.map(log => {
          const date = new Date(log.access_time);
          return [
            date.toISOString().split('T')[0],
            date.toTimeString().split(' ')[0],
            log.user ? `${log.user.first_name} ${log.user.last_name}` : 'N/A',
            log.accessPoint?.name || 'N/A',
            log.access_method,
            log.direction,
            log.granted ? 'Sí' : 'No',
            log.denial_reason || '',
            log.vehicle_plate || '',
            log.community?.name || ''
          ].join(',');
        }).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=access_logs_${Date.now()}.csv`);
        res.send(csvHeader + csvRows);
      } else {
        // Formato JSON
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=access_logs_${Date.now()}.json`);
        res.json({
          export_date: new Date().toISOString(),
          total_records: accessLogs.length,
          filters: filters,
          data: accessLogs
        });
      }

      // Registrar exportación en auditoría
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'access.logs_exported',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        metadata: {
          format,
          filters,
          record_count: accessLogs.length
        }
      });

    } catch (error) {
      next(error);
    }
  }

  // Métodos privados auxiliares

  private async calculateAccessStats(whereConditions: any) {
    const [total, granted, denied] = await Promise.all([
      AccessLog.count({ where: whereConditions }),
      AccessLog.count({ where: { ...whereConditions, granted: true } }),
      AccessLog.count({ where: { ...whereConditions, granted: false } })
    ]);

    const successRate = total > 0 ? Math.round((granted / total) * 100 * 100) / 100 : 0;

    return {
      total_accesses: total,
      granted_accesses: granted,
      denied_accesses: denied,
      success_rate: successRate
    };
  }

  private async checkAntiPassback(
    userId: string, 
    accessPointId: string, 
    direction: string,
    communityId: string
  ): Promise<boolean> {
    const antiPassback = await AntiPassback.findOne({
      where: {
        user_id: userId,
        area: communityId // Usar comunidad como área
      }
    });

    if (!antiPassback) return false;

    // Lógica anti-passback: no puede salir si no ha entrado, no puede entrar si ya está dentro
    if (direction === 'out' && !antiPassback.is_inside) return true;
    if (direction === 'in' && antiPassback.is_inside) return true;

    return false;
  }

  private async updateAntiPassback(
    userId: string,
    communityId: string,
    accessPointId: string,
    direction: string
  ): Promise<void> {
    const isInside = direction === 'in';

    await AntiPassback.upsert({
      user_id: userId,
      area: communityId,
      last_direction: direction,
      last_access_time: new Date(),
      access_point_id: accessPointId,
      is_inside: isInside
    });
  }

  private async checkInterlock(interlockGroup: string, currentAccessPointId: string): Promise<boolean> {
    // Verificar si hay otros puntos de acceso abiertos en el mismo grupo
    const openDoors = await cache.get(`interlock:${interlockGroup}`);
    
    if (openDoors) {
      const openList = JSON.parse(openDoors);
      // Si hay puertas abiertas y no es la misma puerta actual
      return openList.length > 0 && !openList.includes(currentAccessPointId);
    }

    return false;
  }
}

export const accessController = new AccessController();