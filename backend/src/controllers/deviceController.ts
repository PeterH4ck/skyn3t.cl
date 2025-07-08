import { Request, Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import { Device } from '../models/Device';
import { DeviceStatus } from '../models/DeviceStatus';
import { DeviceType } from '../models/DeviceType';
import { DeviceCommand } from '../models/DeviceCommand';
import { Community } from '../models/Community';
import { Building } from '../models/Building';
import { AccessPoint } from '../models/AccessPoint';
import { AuditLog } from '../models/AuditLog';
import { cache, cacheKeys, cacheTTL } from '../config/redis';
import { AppError } from '../utils/AppError';
import { getPagination, getPagingData } from '../utils/pagination';
import { deviceService } from '../services/deviceService';
import { websocketService } from '../services/websocketService';
import { logger } from '../utils/logger';

export enum DeviceStatusEnum {
  ONLINE = 'online',
  OFFLINE = 'offline',
  ERROR = 'error',
  MAINTENANCE = 'maintenance'
}

export enum CommandStatus {
  PENDING = 'pending',
  SENT = 'sent',
  ACKNOWLEDGED = 'acknowledged',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout'
}

export enum DeviceCapability {
  DOOR_CONTROL = 'door_control',
  CARD_READER = 'card_reader',
  FACIAL_RECOGNITION = 'facial_recognition',
  FINGERPRINT = 'fingerprint',
  QR_SCANNER = 'qr_scanner',
  CAMERA = 'camera',
  INTERCOM = 'intercom',
  TEMPERATURE_SENSOR = 'temperature_sensor',
  MOTION_SENSOR = 'motion_sensor'
}

export class DeviceController {
  /**
   * Obtener lista de dispositivos con filtros y paginación
   */
  async getDevices(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        page = 1,
        size = 20,
        community_id,
        building_id,
        floor_id,
        status,
        type,
        search,
        capabilities,
        sort_by = 'name',
        sort_order = 'ASC'
      } = req.query;

      const { limit, offset } = getPagination(Number(page), Number(size));

      // Construir condiciones de búsqueda
      const where: any = {};

      if (community_id) {
        where.community_id = community_id;
      } else if (req.communityId) {
        where.community_id = req.communityId;
      }

      if (building_id) {
        where.building_id = building_id;
      }

      if (floor_id) {
        where.floor_id = floor_id;
      }

      if (status) {
        where.status = status;
      }

      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { serial_number: { [Op.iLike]: `%${search}%` } },
          { location: { [Op.iLike]: `%${search}%` } }
        ];
      }

      if (capabilities) {
        const caps = Array.isArray(capabilities) ? capabilities : [capabilities];
        where.capabilities = {
          [Op.contains]: caps
        };
      }

      // Incluir relaciones
      const include = [
        {
          model: DeviceType,
          as: 'deviceType',
          attributes: ['id', 'name', 'category', 'manufacturer', 'communication_protocol']
        },
        {
          model: Community,
          as: 'community',
          attributes: ['id', 'name', 'code']
        },
        {
          model: Building,
          as: 'building',
          attributes: ['id', 'name', 'code'],
          required: false
        },
        {
          model: Floor,
          as: 'floor',
          attributes: ['id', 'floor_number', 'name'],
          required: false
        }
      ];

      // Agregar tipo si se especifica
      if (type) {
        include[0].where = { category: type };
        include[0].required = true;
      }

      const devices = await Device.findAndCountAll({
        where,
        include,
        limit,
        offset,
        order: [[sort_by as string, sort_order as string]],
        distinct: true
      });

      const response = getPagingData(devices, Number(page), limit);

      res.json({
        success: true,
        data: response
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener dispositivo específico con detalles completos
   */
  async getDevice(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { include_status = true, include_commands = false } = req.query;

      // Intentar obtener de caché
      const cacheKey = cacheKeys.device(id);
      let device = await cache.get(cacheKey);

      if (!device) {
        const includeOptions = [
          {
            model: DeviceType,
            as: 'deviceType'
          },
          {
            model: Community,
            as: 'community',
            attributes: ['id', 'name', 'code']
          },
          {
            model: Building,
            as: 'building',
            attributes: ['id', 'name', 'code'],
            required: false
          },
          {
            model: Floor,
            as: 'floor',
            attributes: ['id', 'floor_number', 'name'],
            required: false
          },
          {
            model: AccessPoint,
            as: 'accessPoints',
            attributes: ['id', 'name', 'type', 'is_active'],
            required: false
          }
        ];

        if (include_status === 'true') {
          includeOptions.push({
            model: DeviceStatus,
            as: 'statusHistory',
            limit: 10,
            order: [['recorded_at', 'DESC']],
            required: false
          } as any);
        }

        if (include_commands === 'true') {
          includeOptions.push({
            model: DeviceCommand,
            as: 'commands',
            limit: 20,
            order: [['created_at', 'DESC']],
            include: [{
              model: User,
              as: 'createdBy',
              attributes: ['id', 'username', 'full_name']
            }],
            required: false
          } as any);
        }

        device = await Device.findByPk(id, { include: includeOptions });

        if (!device) {
          throw new AppError('Dispositivo no encontrado', 404);
        }

        // Verificar acceso a la comunidad
        if (req.communityId && device.community_id !== req.communityId) {
          throw new AppError('No tienes acceso a este dispositivo', 403);
        }

        // Guardar en caché (5 minutos)
        await cache.set(cacheKey, device.toJSON(), cacheTTL.short);
      }

      // Obtener estado actual en tiempo real
      const currentStatus = await deviceService.getDeviceCurrentStatus(id);

      res.json({
        success: true,
        data: {
          ...device,
          current_status: currentStatus
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Crear nuevo dispositivo
   */
  async createDevice(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        device_type_id,
        serial_number,
        name,
        location,
        community_id,
        building_id,
        floor_id,
        ip_address,
        mac_address,
        capabilities,
        config
      } = req.body;

      // Verificar que el serial number no exista
      const existingDevice = await Device.findOne({
        where: { serial_number }
      });

      if (existingDevice) {
        throw new AppError('El número de serie ya está registrado', 400);
      }

      // Verificar que la comunidad existe y el usuario tiene acceso
      const community = await Community.findByPk(community_id || req.communityId);
      if (!community) {
        throw new AppError('Comunidad no encontrada', 404);
      }

      // Verificar edificio si se especifica
      if (building_id) {
        const building = await Building.findOne({
          where: {
            id: building_id,
            community_id: community.id
          }
        });

        if (!building) {
          throw new AppError('Edificio no encontrado en esta comunidad', 404);
        }
      }

      // Crear dispositivo
      const device = await Device.create({
        device_type_id,
        serial_number,
        name,
        location,
        community_id: community.id,
        building_id,
        floor_id,
        ip_address,
        mac_address,
        capabilities: capabilities || [],
        config: config || {},
        status: DeviceStatusEnum.OFFLINE,
        installed_by: req.user!.id
      });

      // Registrar estado inicial
      await DeviceStatus.create({
        device_id: device.id,
        status: DeviceStatusEnum.OFFLINE,
        recorded_at: new Date()
      });

      // Registrar en auditoría
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'device.create',
        entity_type: 'device',
        entity_id: device.id,
        new_values: {
          serial_number,
          name,
          location,
          community_id: community.id
        },
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });

      // Inicializar conexión MQTT si está online
      if (ip_address) {
        deviceService.initializeDevice(device.id);
      }

      // Notificar creación via WebSocket
      websocketService.emitToCommunity(
        community.id,
        'device.created',
        {
          device: device.toJSON(),
          timestamp: new Date()
        }
      );

      // Recargar con relaciones
      const createdDevice = await Device.findByPk(device.id, {
        include: ['deviceType', 'community', 'building', 'floor']
      });

      res.status(201).json({
        success: true,
        data: createdDevice,
        message: 'Dispositivo creado exitosamente'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualizar dispositivo
   */
  async updateDevice(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const device = await Device.findByPk(id);
      if (!device) {
        throw new AppError('Dispositivo no encontrado', 404);
      }

      // Verificar acceso a la comunidad
      if (req.communityId && device.community_id !== req.communityId) {
        throw new AppError('No tienes acceso a este dispositivo', 403);
      }

      // Guardar valores anteriores para auditoría
      const oldValues = device.toJSON();

      // Verificar serial number único si se actualiza
      if (updates.serial_number && updates.serial_number !== device.serial_number) {
        const existingDevice = await Device.findOne({
          where: { serial_number: updates.serial_number }
        });
        if (existingDevice) {
          throw new AppError('El número de serie ya está registrado', 400);
        }
      }

      // Actualizar dispositivo
      await device.update(updates);

      // Si se actualiza la configuración MQTT, reinicializar
      if (updates.ip_address || updates.config) {
        await deviceService.reinitializeDevice(device.id);
      }

      // Limpiar caché
      await cache.del(cacheKeys.device(id));
      await cache.del(cacheKeys.deviceStatus(id));

      // Registrar en auditoría
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'device.update',
        entity_type: 'device',
        entity_id: device.id,
        old_values: oldValues,
        new_values: updates,
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });

      // Notificar actualización
      websocketService.emitToCommunity(
        device.community_id,
        'device.updated',
        {
          device_id: device.id,
          changes: updates,
          timestamp: new Date()
        }
      );

      // Recargar con relaciones
      const updatedDevice = await Device.findByPk(device.id, {
        include: ['deviceType', 'community', 'building', 'floor']
      });

      res.json({
        success: true,
        data: updatedDevice,
        message: 'Dispositivo actualizado exitosamente'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Eliminar dispositivo
   */
  async deleteDevice(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const device = await Device.findByPk(id);
      if (!device) {
        throw new AppError('Dispositivo no encontrado', 404);
      }

      // Verificar acceso a la comunidad
      if (req.communityId && device.community_id !== req.communityId) {
        throw new AppError('No tienes acceso a este dispositivo', 403);
      }

      // Verificar que no tenga puntos de acceso activos
      const activeAccessPoints = await AccessPoint.count({
        where: {
          device_id: device.id,
          is_active: true
        }
      });

      if (activeAccessPoints > 0) {
        throw new AppError(
          'No se puede eliminar un dispositivo con puntos de acceso activos',
          400
        );
      }

      // Desconectar del MQTT
      await deviceService.disconnectDevice(device.id);

      // Marcar como inactivo en lugar de eliminar
      device.is_active = false;
      device.status = DeviceStatusEnum.OFFLINE;
      await device.save();

      // Limpiar caché
      await cache.del(cacheKeys.device(id));
      await cache.delPattern(`device:${id}:*`);

      // Registrar en auditoría
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'device.delete',
        entity_type: 'device',
        entity_id: device.id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });

      // Notificar eliminación
      websocketService.emitToCommunity(
        device.community_id,
        'device.deleted',
        {
          device_id: device.id,
          timestamp: new Date()
        }
      );

      res.json({
        success: true,
        message: 'Dispositivo eliminado exitosamente'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener estado actual del dispositivo
   */
  async getDeviceStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const device = await Device.findByPk(id);
      if (!device) {
        throw new AppError('Dispositivo no encontrado', 404);
      }

      // Verificar acceso
      if (req.communityId && device.community_id !== req.communityId) {
        throw new AppError('No tienes acceso a este dispositivo', 403);
      }

      // Obtener estado actual desde el dispositivo
      const currentStatus = await deviceService.getDeviceCurrentStatus(id);

      // Obtener historial reciente
      const statusHistory = await DeviceStatus.findAll({
        where: { device_id: id },
        order: [['recorded_at', 'DESC']],
        limit: 24 // Últimas 24 horas
      });

      // Calcular métricas
      const uptime = await deviceService.calculateUptime(id, 24); // 24 horas
      const lastHeartbeat = device.last_heartbeat;
      const isOnline = currentStatus.status === DeviceStatusEnum.ONLINE;

      res.json({
        success: true,
        data: {
          device_id: id,
          current_status: currentStatus,
          last_heartbeat: lastHeartbeat,
          is_online: isOnline,
          uptime_percentage: uptime,
          status_history: statusHistory,
          capabilities_status: await deviceService.getCapabilitiesStatus(id)
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Enviar comando a dispositivo
   */
  async sendCommand(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { command, parameters = {}, priority = 0, scheduled_at } = req.body;

      const device = await Device.findByPk(id);
      if (!device) {
        throw new AppError('Dispositivo no encontrado', 404);
      }

      // Verificar acceso
      if (req.communityId && device.community_id !== req.communityId) {
        throw new AppError('No tienes acceso a este dispositivo', 403);
      }

      // Verificar que el dispositivo esté online para comandos inmediatos
      if (!scheduled_at && device.status !== DeviceStatusEnum.ONLINE) {
        throw new AppError('El dispositivo no está disponible', 503);
      }

      // Validar comando según capacidades del dispositivo
      const isValidCommand = await deviceService.validateCommand(
        device.id,
        command,
        parameters
      );

      if (!isValidCommand) {
        throw new AppError('Comando no válido para este dispositivo', 400);
      }

      // Crear comando en la base de datos
      const deviceCommand = await DeviceCommand.create({
        device_id: device.id,
        command,
        parameters,
        priority,
        scheduled_at: scheduled_at ? new Date(scheduled_at) : new Date(),
        created_by: req.user!.id,
        status: CommandStatus.PENDING
      });

      // Enviar comando al dispositivo via MQTT
      const result = await deviceService.sendDeviceCommand(
        device.id,
        deviceCommand.id,
        command,
        parameters,
        priority
      );

      // Actualizar estado del comando
      deviceCommand.status = result.success ? CommandStatus.SENT : CommandStatus.FAILED;
      deviceCommand.sent_at = result.success ? new Date() : null;
      deviceCommand.error_message = result.error || null;
      await deviceCommand.save();

      // Registrar en auditoría
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'device.command_sent',
        entity_type: 'device',
        entity_id: device.id,
        new_values: {
          command,
          parameters,
          command_id: deviceCommand.id
        },
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });

      // Notificar via WebSocket
      websocketService.emitToCommunity(
        device.community_id,
        'device.command_sent',
        {
          device_id: device.id,
          command_id: deviceCommand.id,
          command,
          status: deviceCommand.status,
          timestamp: new Date()
        }
      );

      res.json({
        success: true,
        data: {
          command_id: deviceCommand.id,
          status: deviceCommand.status,
          estimated_execution: deviceCommand.scheduled_at,
          message: result.success 
            ? 'Comando enviado exitosamente'
            : 'Error al enviar comando'
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener comandos pendientes y historial
   */
  async getDeviceCommands(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { 
        status,
        page = 1,
        size = 20,
        from_date,
        to_date
      } = req.query;

      const device = await Device.findByPk(id);
      if (!device) {
        throw new AppError('Dispositivo no encontrado', 404);
      }

      // Verificar acceso
      if (req.communityId && device.community_id !== req.communityId) {
        throw new AppError('No tienes acceso a este dispositivo', 403);
      }

      const { limit, offset } = getPagination(Number(page), Number(size));

      const where: any = { device_id: id };

      if (status) {
        where.status = status;
      }

      if (from_date) {
        where.created_at = { [Op.gte]: new Date(from_date as string) };
      }

      if (to_date) {
        where.created_at = {
          ...where.created_at,
          [Op.lte]: new Date(to_date as string)
        };
      }

      const commands = await DeviceCommand.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: 'createdBy',
            attributes: ['id', 'username', 'full_name']
          }
        ],
        limit,
        offset,
        order: [['created_at', 'DESC']]
      });

      const response = getPagingData(commands, Number(page), limit);

      // Obtener estadísticas de comandos
      const stats = await DeviceCommand.findAll({
        where: { device_id: id },
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['status'],
        raw: true
      });

      const commandStats = stats.reduce((acc: any, stat: any) => {
        acc[stat.status] = parseInt(stat.count);
        return acc;
      }, {});

      res.json({
        success: true,
        data: {
          ...response,
          statistics: commandStats
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Realizar diagnóstico del dispositivo
   */
  async diagnoseDevice(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const device = await Device.findByPk(id);
      if (!device) {
        throw new AppError('Dispositivo no encontrado', 404);
      }

      // Verificar acceso
      if (req.communityId && device.community_id !== req.communityId) {
        throw new AppError('No tienes acceso a este dispositivo', 403);
      }

      // Ejecutar diagnóstico completo
      const diagnosticResult = await deviceService.runDiagnostic(device.id);

      // Registrar diagnóstico en auditoría
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'device.diagnostic',
        entity_type: 'device',
        entity_id: device.id,
        new_values: diagnosticResult,
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });

      res.json({
        success: true,
        data: diagnosticResult
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Reiniciar dispositivo
   */
  async restartDevice(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { force = false } = req.body;

      const device = await Device.findByPk(id);
      if (!device) {
        throw new AppError('Dispositivo no encontrado', 404);
      }

      // Verificar acceso
      if (req.communityId && device.community_id !== req.communityId) {
        throw new AppError('No tienes acceso a este dispositivo', 403);
      }

      // Enviar comando de reinicio
      const result = await deviceService.restartDevice(device.id, force);

      // Registrar en auditoría
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'device.restart',
        entity_type: 'device',
        entity_id: device.id,
        new_values: { force },
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });

      // Notificar via WebSocket
      websocketService.emitToCommunity(
        device.community_id,
        'device.restart',
        {
          device_id: device.id,
          timestamp: new Date()
        }
      );

      res.json({
        success: true,
        data: result,
        message: 'Comando de reinicio enviado'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualizar firmware del dispositivo
   */
  async updateFirmware(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { firmware_version, force_update = false } = req.body;

      const device = await Device.findByPk(id);
      if (!device) {
        throw new AppError('Dispositivo no encontrado', 404);
      }

      // Verificar acceso
      if (req.communityId && device.community_id !== req.communityId) {
        throw new AppError('No tienes acceso a este dispositivo', 403);
      }

      // Verificar que el dispositivo esté online
      if (device.status !== DeviceStatusEnum.ONLINE) {
        throw new AppError('El dispositivo debe estar online para actualizar firmware', 400);
      }

      // Iniciar actualización de firmware
      const updateResult = await deviceService.updateDeviceFirmware(
        device.id,
        firmware_version,
        force_update
      );

      // Registrar en auditoría
      await AuditLog.create({
        user_id: req.user!.id,
        action: 'device.firmware_update',
        entity_type: 'device',
        entity_id: device.id,
        new_values: {
          old_version: device.firmware_version,
          new_version: firmware_version,
          force_update
        },
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });

      res.json({
        success: true,
        data: updateResult,
        message: 'Actualización de firmware iniciada'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener logs del dispositivo
   */
  async getDeviceLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const {
        level = 'info',
        from_date,
        to_date,
        limit = 100
      } = req.query;

      const device = await Device.findByPk(id);
      if (!device) {
        throw new AppError('Dispositivo no encontrado', 404);
      }

      // Verificar acceso
      if (req.communityId && device.community_id !== req.communityId) {
        throw new AppError('No tienes acceso a este dispositivo', 403);
      }

      // Obtener logs del dispositivo
      const logs = await deviceService.getDeviceLogs(
        device.id,
        {
          level: level as string,
          from: from_date as string,
          to: to_date as string,
          limit: Number(limit)
        }
      );

      res.json({
        success: true,
        data: {
          device_id: device.id,
          logs,
          total: logs.length
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener estadísticas de dispositivos por comunidad
   */
  async getDeviceStatistics(req: Request, res: Response, next: NextFunction) {
    try {
      const { community_id } = req.query;
      const targetCommunityId = community_id || req.communityId;

      if (!targetCommunityId) {
        throw new AppError('Community ID requerido', 400);
      }

      // Estadísticas básicas
      const totalDevices = await Device.count({
        where: { community_id: targetCommunityId, is_active: true }
      });

      const devicesByStatus = await Device.findAll({
        where: { community_id: targetCommunityId, is_active: true },
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['status'],
        raw: true
      });

      const devicesByType = await Device.findAll({
        where: { community_id: targetCommunityId, is_active: true },
        include: [{
          model: DeviceType,
          as: 'deviceType',
          attributes: ['category']
        }],
        attributes: [
          [sequelize.col('deviceType.category'), 'category'],
          [sequelize.fn('COUNT', sequelize.col('Device.id')), 'count']
        ],
        group: ['deviceType.category'],
        raw: true
      });

      // Calcular uptime promedio
      const avgUptime = await deviceService.calculateCommunityUptime(targetCommunityId);

      // Comandos ejecutados hoy
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const commandsToday = await DeviceCommand.count({
        include: [{
          model: Device,
          as: 'device',
          where: { community_id: targetCommunityId },
          attributes: []
        }],
        where: {
          created_at: { [Op.gte]: today }
        }
      });

      res.json({
        success: true,
        data: {
          total_devices: totalDevices,
          devices_by_status: devicesByStatus,
          devices_by_type: devicesByType,
          average_uptime: avgUptime,
          commands_today: commandsToday,
          last_updated: new Date()
        }
      });

    } catch (error) {
      next(error);
    }
  }
}

export const deviceController = new DeviceController();