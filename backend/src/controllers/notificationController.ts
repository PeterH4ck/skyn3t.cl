import { Request, Response, NextFunction } from 'express';
import { Op, Transaction } from 'sequelize';
import { Notification } from '../models/Notification';
import { NotificationTemplate } from '../models/NotificationTemplate';
import { CommunicationPreference } from '../models/CommunicationPreference';
import { MassCommunication } from '../models/MassCommunication';
import { CommunicationRecipient } from '../models/CommunicationRecipient';
import { CommunicationSegment } from '../models/CommunicationSegment';
import { User } from '../models/User';
import { Community } from '../models/Community';
import { CommunityMember } from '../models/CommunityMember';
import { sequelize } from '../config/database';
import { cache, cacheKeys, cacheTTL } from '../config/redis';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { notificationService } from '../services/notificationService';
import { emailService } from '../services/emailService';
import { smsService } from '../services/smsService';
import { whatsappService } from '../services/whatsappService';
import { pushService } from '../services/pushService';
import { auditLog } from '../utils/auditLog';
import { websocketService } from '../services/websocketService';
import { Queue } from 'bull';
import cron from 'node-cron';

export class NotificationController {
  /**
   * Obtener notificaciones del usuario
   */
  async getUserNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const {
        page = 1,
        limit = 20,
        read_status,
        type,
        priority,
        from_date,
        to_date
      } = req.query;

      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
      const whereClause: any = { user_id: user.id };

      if (read_status !== undefined) {
        whereClause.read_at = read_status === 'read' ? { [Op.ne]: null } : null;
      }
      if (type) whereClause.type = type;
      if (priority) whereClause.priority = priority;
      if (from_date || to_date) {
        whereClause.created_at = {};
        if (from_date) whereClause.created_at[Op.gte] = new Date(from_date as string);
        if (to_date) whereClause.created_at[Op.lte] = new Date(to_date as string);
      }

      const { rows: notifications, count } = await Notification.findAndCountAll({
        where: whereClause,
        order: [['created_at', 'DESC']],
        limit: parseInt(limit as string),
        offset,
        attributes: {
          exclude: ['user_id']
        }
      });

      // Contar no leídas
      const unreadCount = await Notification.count({
        where: {
          user_id: user.id,
          read_at: null
        }
      });

      res.json({
        success: true,
        data: {
          notifications: notifications.map(notification => ({
            id: notification.id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            data: notification.data,
            priority: notification.priority,
            channel: notification.channel,
            read_at: notification.read_at,
            sent_at: notification.sent_at,
            created_at: notification.created_at,
            is_read: !!notification.read_at
          })),
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total: count,
            pages: Math.ceil(count / parseInt(limit as string)),
            unread_count: unreadCount
          }
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Marcar notificación como leída
   */
  async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const { notificationId } = req.params;
      const user = req.user!;

      const notification = await Notification.findOne({
        where: {
          id: notificationId,
          user_id: user.id
        }
      });

      if (!notification) {
        throw new AppError('Notificación no encontrada', 404);
      }

      if (!notification.read_at) {
        notification.read_at = new Date();
        await notification.save();

        // Actualizar contador en tiempo real
        const unreadCount = await Notification.count({
          where: {
            user_id: user.id,
            read_at: null
          }
        });

        // Emitir actualización por WebSocket
        websocketService.emitToUser(user.id, 'notification.read', {
          notification_id: notificationId,
          unread_count: unreadCount
        });
      }

      res.json({
        success: true,
        message: 'Notificación marcada como leída'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Marcar todas las notificaciones como leídas
   */
  async markAllAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;

      await Notification.update(
        { read_at: new Date() },
        {
          where: {
            user_id: user.id,
            read_at: null
          }
        }
      );

      // Emitir actualización por WebSocket
      websocketService.emitToUser(user.id, 'notifications.all_read', {
        unread_count: 0
      });

      res.json({
        success: true,
        message: 'Todas las notificaciones marcadas como leídas'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Eliminar notificación
   */
  async deleteNotification(req: Request, res: Response, next: NextFunction) {
    try {
      const { notificationId } = req.params;
      const user = req.user!;

      const deleted = await Notification.destroy({
        where: {
          id: notificationId,
          user_id: user.id
        }
      });

      if (!deleted) {
        throw new AppError('Notificación no encontrada', 404);
      }

      res.json({
        success: true,
        message: 'Notificación eliminada'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener preferencias de comunicación del usuario
   */
  async getCommunicationPreferences(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;

      const preferences = await CommunicationPreference.findAll({
        where: { user_id: user.id }
      });

      // Crear estructura por canal y categoría
      const structuredPreferences: any = {};
      const channels = ['email', 'sms', 'whatsapp', 'push', 'in_app'];
      const categories = [
        'access_notifications',
        'payment_reminders',
        'community_announcements',
        'maintenance_alerts',
        'security_alerts',
        'financial_statements',
        'emergency_notifications'
      ];

      channels.forEach(channel => {
        structuredPreferences[channel] = {};
        categories.forEach(category => {
          // Buscar preferencia existente
          const pref = preferences.find(p => p.channel === channel && p.category === category);
          structuredPreferences[channel][category] = {
            enabled: pref ? pref.is_enabled : true, // Default habilitado
            frequency: pref ? pref.frequency : 'immediate',
            quiet_hours_start: pref ? pref.quiet_hours_start : null,
            quiet_hours_end: pref ? pref.quiet_hours_end : null
          };
        });
      });

      res.json({
        success: true,
        data: {
          preferences: structuredPreferences,
          available_channels: channels,
          available_categories: categories
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualizar preferencias de comunicación
   */
  async updateCommunicationPreferences(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { preferences } = req.body;

      const transaction = await sequelize.transaction();

      try {
        // Eliminar preferencias existentes
        await CommunicationPreference.destroy({
          where: { user_id: user.id },
          transaction
        });

        // Crear nuevas preferencias
        const preferencesToCreate: any[] = [];

        Object.keys(preferences).forEach(channel => {
          Object.keys(preferences[channel]).forEach(category => {
            const pref = preferences[channel][category];
            preferencesToCreate.push({
              user_id: user.id,
              channel,
              category,
              is_enabled: pref.enabled,
              frequency: pref.frequency || 'immediate',
              quiet_hours_start: pref.quiet_hours_start || null,
              quiet_hours_end: pref.quiet_hours_end || null
            });
          });
        });

        await CommunicationPreference.bulkCreate(preferencesToCreate, { transaction });

        await transaction.commit();

        // Registrar en auditoría
        await auditLog.create({
          user_id: user.id,
          action: 'communication_preferences.updated',
          entity_type: 'user',
          entity_id: user.id,
          metadata: { updated_preferences: Object.keys(preferences) },
          ip_address: req.ip
        });

        res.json({
          success: true,
          message: 'Preferencias actualizadas exitosamente'
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
   * Enviar notificación individual
   */
  async sendNotification(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        user_id,
        type,
        title,
        message,
        data = {},
        channels = ['in_app'],
        priority = 'normal',
        template_id,
        template_variables = {},
        scheduled_at
      } = req.body;

      const sender = req.user!;

      // Verificar permisos
      if (!await sender.hasPermission('notifications.send')) {
        throw new AppError('Sin permisos para enviar notificaciones', 403);
      }

      // Buscar usuario destinatario
      const recipient = await User.findByPk(user_id);
      if (!recipient) {
        throw new AppError('Usuario destinatario no encontrado', 404);
      }

      let finalMessage = message;
      let finalTitle = title;

      // Si se usa template, procesarlo
      if (template_id) {
        const template = await NotificationTemplate.findByPk(template_id);
        if (!template) {
          throw new AppError('Plantilla no encontrada', 404);
        }

        finalTitle = notificationService.processTemplate(template.subject || '', template_variables);
        finalMessage = notificationService.processTemplate(template.body_text || '', template_variables);
      }

      // Enviar notificación
      const notificationResult = await notificationService.sendNotification({
        userId: user_id,
        type,
        title: finalTitle,
        message: finalMessage,
        data,
        channels,
        priority,
        scheduledAt: scheduled_at ? new Date(scheduled_at) : undefined
      });

      // Registrar en auditoría
      await auditLog.create({
        user_id: sender.id,
        action: 'notification.sent',
        entity_type: 'notification',
        entity_id: notificationResult.notificationId,
        metadata: {
          recipient_id: user_id,
          channels,
          type
        },
        ip_address: req.ip
      });

      res.json({
        success: true,
        message: 'Notificación enviada exitosamente',
        data: {
          notification_id: notificationResult.notificationId,
          channels_sent: notificationResult.channelsSent,
          scheduled: !!scheduled_at
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Enviar comunicación masiva
   */
  async sendMassCommunication(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        community_id,
        title,
        message,
        message_type = 'info',
        target_audience = {},
        channels = ['email'],
        template_id,
        template_variables = {},
        scheduled_at,
        segment_id
      } = req.body;

      const sender = req.user!;

      // Verificar permisos
      if (!await sender.hasPermission('communications.send', community_id)) {
        throw new AppError('Sin permisos para enviar comunicaciones masivas', 403);
      }

      const transaction = await sequelize.transaction();

      try {
        // Crear registro de comunicación masiva
        const massCommunication = await MassCommunication.create({
          community_id,
          title,
          message,
          message_type,
          target_audience,
          channels,
          template_id,
          template_variables,
          scheduled_at: scheduled_at ? new Date(scheduled_at) : null,
          sent_by: sender.id,
          status: scheduled_at ? 'scheduled' : 'sending'
        }, { transaction });

        // Obtener destinatarios
        let recipients: User[] = [];

        if (segment_id) {
          // Usar segmento predefinido
          const segment = await CommunicationSegment.findByPk(segment_id);
          if (!segment) {
            throw new AppError('Segmento no encontrado', 404);
          }
          recipients = await notificationService.getSegmentRecipients(segment);
        } else {
          // Obtener destinatarios basado en criterios
          recipients = await notificationService.getTargetAudience(community_id, target_audience);
        }

        // Crear registros de destinatarios
        const recipientRecords = recipients.map(user => ({
          communication_id: massCommunication.id,
          user_id: user.id,
          channels: JSON.stringify(channels),
          status: 'pending'
        }));

        await CommunicationRecipient.bulkCreate(recipientRecords, { transaction });

        // Actualizar contador total
        massCommunication.total_recipients = recipients.length;
        await massCommunication.save({ transaction });

        await transaction.commit();

        // Si no está programado, enviar inmediatamente
        if (!scheduled_at) {
          await notificationService.processMassCommunication(massCommunication.id);
        }

        // Registrar en auditoría
        await auditLog.create({
          user_id: sender.id,
          action: 'mass_communication.created',
          entity_type: 'mass_communication',
          entity_id: massCommunication.id,
          metadata: {
            community_id,
            recipients_count: recipients.length,
            channels,
            scheduled: !!scheduled_at
          },
          ip_address: req.ip
        });

        res.json({
          success: true,
          message: scheduled_at ? 'Comunicación programada exitosamente' : 'Comunicación enviándose',
          data: {
            communication_id: massCommunication.id,
            total_recipients: recipients.length,
            channels,
            scheduled_at: scheduled_at || null,
            estimated_completion: scheduled_at ? null : 
              new Date(Date.now() + (recipients.length * 2000)) // Estimación 2 seg por destinatario
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
   * Obtener estado de comunicación masiva
   */
  async getMassCommunicationStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { communicationId } = req.params;
      const user = req.user!;

      const communication = await MassCommunication.findByPk(communicationId, {
        include: [{
          model: Community,
          as: 'community'
        }]
      });

      if (!communication) {
        throw new AppError('Comunicación no encontrada', 404);
      }

      // Verificar permisos
      if (!await user.hasPermission('communications.view', communication.community_id)) {
        throw new AppError('Sin acceso a esta comunicación', 403);
      }

      // Obtener estadísticas de entrega
      const deliveryStats = await CommunicationRecipient.findAll({
        where: { communication_id: communicationId },
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['status'],
        raw: true
      });

      const stats: any = {};
      deliveryStats.forEach((stat: any) => {
        stats[stat.status] = parseInt(stat.count);
      });

      // Calcular métricas adicionales
      const totalSent = (stats.sent || 0) + (stats.delivered || 0) + (stats.failed || 0);
      const successRate = totalSent > 0 ? ((stats.delivered || 0) / totalSent * 100).toFixed(2) : '0.00';

      res.json({
        success: true,
        data: {
          communication: {
            id: communication.id,
            title: communication.title,
            message_type: communication.message_type,
            status: communication.status,
            total_recipients: communication.total_recipients,
            channels: communication.channels,
            scheduled_at: communication.scheduled_at,
            sent_at: communication.sent_at,
            created_at: communication.created_at
          },
          delivery_stats: {
            pending: stats.pending || 0,
            sending: stats.sending || 0,
            sent: stats.sent || 0,
            delivered: stats.delivered || 0,
            failed: stats.failed || 0,
            total_sent: totalSent,
            success_rate: parseFloat(successRate)
          }
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener plantillas de notificación
   */
  async getNotificationTemplates(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const { category, is_active } = req.query;
      const user = req.user!;

      // Verificar permisos
      if (!await user.hasPermission('notifications.templates.view', communityId)) {
        throw new AppError('Sin permisos para ver plantillas', 403);
      }

      const whereClause: any = { community_id: communityId };
      if (category) whereClause.category = category;
      if (is_active !== undefined) whereClause.is_active = is_active === 'true';

      const templates = await NotificationTemplate.findAll({
        where: whereClause,
        order: [['category', 'ASC'], ['name', 'ASC']]
      });

      res.json({
        success: true,
        data: {
          templates: templates.map(template => ({
            id: template.id,
            template_code: template.template_code,
            name: template.name,
            category: template.category,
            subject: template.subject,
            body_html: template.body_html,
            body_text: template.body_text,
            variables: template.variables,
            is_active: template.is_active,
            created_at: template.created_at
          }))
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Crear plantilla de notificación
   */
  async createNotificationTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const {
        template_code,
        name,
        category,
        subject,
        body_html,
        body_text,
        variables = [],
        is_active = true
      } = req.body;

      const user = req.user!;

      // Verificar permisos
      if (!await user.hasPermission('notifications.templates.create', communityId)) {
        throw new AppError('Sin permisos para crear plantillas', 403);
      }

      // Verificar que el código no exista
      const existingTemplate = await NotificationTemplate.findOne({
        where: {
          community_id: communityId,
          template_code
        }
      });

      if (existingTemplate) {
        throw new AppError('Ya existe una plantilla con este código', 409);
      }

      const template = await NotificationTemplate.create({
        community_id: communityId,
        template_code,
        name,
        category,
        subject,
        body_html,
        body_text,
        variables,
        is_active,
        created_by: user.id
      });

      res.json({
        success: true,
        message: 'Plantilla creada exitosamente',
        data: { template_id: template.id }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualizar plantilla de notificación
   */
  async updateNotificationTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const { templateId } = req.params;
      const updateData = req.body;
      const user = req.user!;

      const template = await NotificationTemplate.findByPk(templateId);
      if (!template) {
        throw new AppError('Plantilla no encontrada', 404);
      }

      // Verificar permisos
      if (!await user.hasPermission('notifications.templates.update', template.community_id)) {
        throw new AppError('Sin permisos para actualizar plantillas', 403);
      }

      await template.update(updateData);

      res.json({
        success: true,
        message: 'Plantilla actualizada exitosamente'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Probar plantilla de notificación
   */
  async testNotificationTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const { templateId } = req.params;
      const { test_variables = {}, test_channel = 'email' } = req.body;
      const user = req.user!;

      const template = await NotificationTemplate.findByPk(templateId);
      if (!template) {
        throw new AppError('Plantilla no encontrada', 404);
      }

      // Verificar permisos
      if (!await user.hasPermission('notifications.templates.test', template.community_id)) {
        throw new AppError('Sin permisos para probar plantillas', 403);
      }

      // Procesar plantilla con variables de prueba
      const processedSubject = notificationService.processTemplate(
        template.subject || '', 
        test_variables
      );
      const processedBody = notificationService.processTemplate(
        template.body_text || '', 
        test_variables
      );

      // Enviar notificación de prueba
      const testResult = await notificationService.sendTestNotification({
        userId: user.id,
        channel: test_channel,
        subject: processedSubject,
        body: processedBody,
        template: template
      });

      res.json({
        success: true,
        message: 'Plantilla enviada como prueba',
        data: {
          processed_subject: processedSubject,
          processed_body: processedBody,
          test_result: testResult
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener segmentos de comunicación
   */
  async getCommunicationSegments(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const user = req.user!;

      // Verificar permisos
      if (!await user.hasPermission('communications.segments.view', communityId)) {
        throw new AppError('Sin permisos para ver segmentos', 403);
      }

      const segments = await CommunicationSegment.findAll({
        where: { community_id: communityId },
        order: [['name', 'ASC']]
      });

      res.json({
        success: true,
        data: {
          segments: segments.map(segment => ({
            id: segment.id,
            name: segment.name,
            description: segment.description,
            criteria: segment.criteria,
            member_count: segment.member_count,
            last_updated: segment.last_updated,
            created_at: segment.created_at
          }))
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Crear segmento de comunicación
   */
  async createCommunicationSegment(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const { name, description, criteria } = req.body;
      const user = req.user!;

      // Verificar permisos
      if (!await user.hasPermission('communications.segments.create', communityId)) {
        throw new AppError('Sin permisos para crear segmentos', 403);
      }

      // Calcular miembros del segmento
      const memberCount = await notificationService.calculateSegmentSize(communityId, criteria);

      const segment = await CommunicationSegment.create({
        community_id: communityId,
        name,
        description,
        criteria,
        member_count: memberCount,
        last_updated: new Date(),
        created_by: user.id
      });

      res.json({
        success: true,
        message: 'Segmento creado exitosamente',
        data: {
          segment_id: segment.id,
          member_count: memberCount
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener estadísticas de comunicaciones
   */
  async getCommunicationStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const { period = '30d' } = req.query;
      const user = req.user!;

      // Verificar permisos
      if (!await user.hasPermission('communications.stats.view', communityId)) {
        throw new AppError('Sin permisos para ver estadísticas', 403);
      }

      const stats = await notificationService.getCommunicationStats(communityId, period as string);

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancelar comunicación programada
   */
  async cancelScheduledCommunication(req: Request, res: Response, next: NextFunction) {
    try {
      const { communicationId } = req.params;
      const user = req.user!;

      const communication = await MassCommunication.findByPk(communicationId);
      if (!communication) {
        throw new AppError('Comunicación no encontrada', 404);
      }

      // Verificar permisos
      if (!await user.hasPermission('communications.cancel', communication.community_id)) {
        throw new AppError('Sin permisos para cancelar comunicaciones', 403);
      }

      if (communication.status !== 'scheduled') {
        throw new AppError('Solo se pueden cancelar comunicaciones programadas', 400);
      }

      communication.status = 'cancelled';
      await communication.save();

      // Cancelar trabajo programado
      await notificationService.cancelScheduledCommunication(communicationId);

      res.json({
        success: true,
        message: 'Comunicación cancelada exitosamente'
      });

    } catch (error) {
      next(error);
    }
  }
}

export const notificationController = new NotificationController();