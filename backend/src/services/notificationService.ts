// =====================================================
// NOTIFICATION SERVICE - SKYN3T ACCESS CONTROL
// =====================================================
// Servicio completo de notificaciones omnicanal

import { 
  NotificationLog, NotificationTemplate, UserNotificationPreference,
  User, Community, Role, UserRole
} from '../models';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { emailService } from './emailService';
import { cryptoService } from '../utils/crypto';
import { websocketService } from './websocketService';
import { Op } from 'sequelize';
import nodemailer from 'nodemailer';
import axios from 'axios';

// Interfaces
interface NotificationData {
  sender_id: string;
  recipient_type: 'user' | 'community' | 'role' | 'broadcast';
  recipient_id?: string;
  community_id?: string;
  role_filter?: string;
  type: string;
  title: string;
  message: string;
  channels: string[];
  priority: 'low' | 'normal' | 'high' | 'urgent';
  schedule_at?: Date;
  template_id?: string;
  template_data?: Record<string, any>;
  action_url?: string;
  expires_at?: Date;
}

interface NotificationResult {
  notification_id: string;
  recipients_count: number;
  channels_used: string[];
  estimated_delivery: Date;
  scheduled: boolean;
}

interface TestNotificationData {
  user_id: string;
  channel: string;
  template?: NotificationTemplate;
  test_data: Record<string, any>;
}

interface DeliveryStatus {
  notification_id: string;
  total_recipients: number;
  delivered: number;
  failed: number;
  pending: number;
  by_channel: Record<string, {
    sent: number;
    delivered: number;
    failed: number;
  }>;
}

interface NotificationStats {
  total_sent: number;
  total_delivered: number;
  total_failed: number;
  delivery_rate: number;
  by_type: Record<string, number>;
  by_channel: Record<string, number>;
  recent_activity: Array<{
    date: string;
    sent: number;
    delivered: number;
  }>;
}

interface ChannelProvider {
  name: string;
  send(recipient: string, subject: string, content: string, metadata?: any): Promise<any>;
  verifyDelivery(messageId: string): Promise<boolean>;
}

class NotificationService {
  private channels: Map<string, ChannelProvider> = new Map();
  private templates: Map<string, NotificationTemplate> = new Map();

  constructor() {
    this.initializeChannels();
  }

  /**
   * Inicializar proveedores de canales
   */
  private initializeChannels() {
    this.channels.set('email', new EmailChannelProvider());
    this.channels.set('sms', new SMSChannelProvider());
    this.channels.set('whatsapp', new WhatsAppChannelProvider());
    this.channels.set('push', new PushChannelProvider());
  }

  /**
   * Enviar notificación
   */
  async sendNotification(data: NotificationData): Promise<NotificationResult> {
    try {
      logger.info(`Sending notification: ${data.type} to ${data.recipient_type}`);

      // Si está programada, guardar para procesamiento posterior
      if (data.schedule_at && data.schedule_at > new Date()) {
        return await this.scheduleNotificationInternal(data);
      }

      // Obtener destinatarios
      const recipients = await this.getRecipients(data);
      
      if (recipients.length === 0) {
        logger.warn('No recipients found for notification');
        return {
          notification_id: '',
          recipients_count: 0,
          channels_used: [],
          estimated_delivery: new Date(),
          scheduled: false
        };
      }

      // Procesar plantilla si se especifica
      let processedTitle = data.title;
      let processedMessage = data.message;

      if (data.template_id) {
        const template = await this.getTemplate(data.template_id);
        if (template) {
          processedTitle = this.processTemplate(template.subject_template, data.template_data || {});
          processedMessage = this.processTemplate(template.body_template, data.template_data || {});
        }
      }

      // Enviar a cada destinatario
      const results = [];
      for (const recipient of recipients) {
        const notificationId = await this.sendToRecipient({
          ...data,
          title: processedTitle,
          message: processedMessage,
          recipient_id: recipient.id
        });
        results.push(notificationId);
      }

      return {
        notification_id: results[0] || '',
        recipients_count: recipients.length,
        channels_used: data.channels,
        estimated_delivery: new Date(Date.now() + 30000), // 30 segundos estimado
        scheduled: false
      };
    } catch (error) {
      logger.error('Error sending notification:', error);
      throw new AppError('Error al enviar notificación', 500, 'NOTIFICATION_ERROR');
    }
  }

  /**
   * Enviar notificación a un destinatario específico
   */
  private async sendToRecipient(data: NotificationData & { recipient_id: string }): Promise<string> {
    try {
      // Crear registro de notificación
      const notification = await NotificationLog.create({
        sender_id: data.sender_id,
        recipient_id: data.recipient_id,
        recipient_type: 'user',
        community_id: data.community_id,
        type: data.type,
        title: data.title,
        message: data.message,
        channels: data.channels,
        priority: data.priority,
        action_url: data.action_url,
        expires_at: data.expires_at,
        status: 'pending',
        created_at: new Date()
      });

      // Obtener preferencias del usuario
      const preferences = await this.getUserPreferences(data.recipient_id, data.community_id);
      
      // Filtrar canales según preferencias
      const enabledChannels = this.filterChannelsByPreferences(data.channels, preferences, data.type);

      // Enviar por cada canal habilitado
      const deliveryResults = [];
      for (const channel of enabledChannels) {
        try {
          const result = await this.sendViaChannel(channel, data, data.recipient_id);
          deliveryResults.push({ channel, success: true, result });
        } catch (error) {
          logger.error(`Failed to send via ${channel}:`, error);
          deliveryResults.push({ channel, success: false, error: error.message });
        }
      }

      // Actualizar estado de la notificación
      const successfulChannels = deliveryResults.filter(r => r.success);
      const newStatus = successfulChannels.length > 0 ? 'sent' : 'failed';
      
      await notification.update({
        status: newStatus,
        sent_at: newStatus === 'sent' ? new Date() : null,
        delivery_results: deliveryResults
      });

      // Enviar notificación in-app en tiempo real si está incluida
      if (data.channels.includes('in_app')) {
        websocketService.emitToUser(data.recipient_id, 'notification.new', {
          id: notification.id,
          type: data.type,
          title: data.title,
          message: data.message,
          priority: data.priority,
          action_url: data.action_url,
          created_at: notification.created_at
        });
      }

      return notification.id;
    } catch (error) {
      logger.error('Error sending to recipient:', error);
      throw error;
    }
  }

  /**
   * Enviar a través de un canal específico
   */
  private async sendViaChannel(channel: string, data: NotificationData, recipientId: string): Promise<any> {
    const provider = this.channels.get(channel);
    if (!provider) {
      throw new Error(`Channel provider not found: ${channel}`);
    }

    // Obtener información del destinatario
    const user = await User.findByPk(recipientId, {
      attributes: ['email', 'phone', 'first_name', 'last_name']
    });

    if (!user) {
      throw new Error('Recipient not found');
    }

    let recipient = '';
    switch (channel) {
      case 'email':
        recipient = user.email;
        break;
      case 'sms':
      case 'whatsapp':
        recipient = user.phone;
        break;
      case 'push':
        recipient = recipientId; // Se usa el ID para push notifications
        break;
    }

    if (!recipient) {
      throw new Error(`No ${channel} address for recipient`);
    }

    // Verificar horarios silenciosos
    const canSend = await this.checkQuietHours(recipientId, channel, data.community_id);
    if (!canSend) {
      throw new Error('Quiet hours active for recipient');
    }

    // Enviar mediante el proveedor
    return await provider.send(recipient, data.title, data.message, {
      priority: data.priority,
      action_url: data.action_url,
      user_name: `${user.first_name} ${user.last_name}`
    });
  }

  /**
   * Obtener destinatarios según el tipo
   */
  private async getRecipients(data: NotificationData): Promise<User[]> {
    switch (data.recipient_type) {
      case 'user':
        if (!data.recipient_id) return [];
        const user = await User.findByPk(data.recipient_id);
        return user ? [user] : [];

      case 'community':
        if (!data.community_id) return [];
        return await this.getCommunityMembers(data.community_id);

      case 'role':
        if (!data.community_id || !data.role_filter) return [];
        return await this.getUsersByRole(data.community_id, data.role_filter);

      case 'broadcast':
        return await this.getAllActiveUsers();

      default:
        return [];
    }
  }

  /**
   * Obtener miembros de una comunidad
   */
  private async getCommunityMembers(communityId: string): Promise<User[]> {
    const users = await User.findAll({
      include: [
        {
          model: Community,
          as: 'communities',
          where: { id: communityId },
          through: { where: { is_active: true } }
        }
      ]
    });

    return users;
  }

  /**
   * Obtener usuarios por rol en una comunidad
   */
  private async getUsersByRole(communityId: string, roleCode: string): Promise<User[]> {
    const users = await User.findAll({
      include: [
        {
          model: Role,
          as: 'roles',
          where: { code: roleCode },
          through: { 
            where: { 
              community_id: communityId,
              is_active: true 
            } 
          }
        }
      ]
    });

    return users;
  }

  /**
   * Obtener todos los usuarios activos
   */
  private async getAllActiveUsers(): Promise<User[]> {
    return await User.findAll({
      where: { is_active: true }
    });
  }

  /**
   * Programar notificación
   */
  async scheduleNotification(data: NotificationData & {
    repeat_pattern?: string;
    repeat_until?: Date;
  }): Promise<any> {
    try {
      // Guardar notificación programada
      const scheduledId = cryptoService.generateUUID();
      const cacheKey = `scheduled_notification:${scheduledId}`;
      
      await redisClient.setex(cacheKey, 86400 * 365, JSON.stringify(data)); // 1 año max

      // Si tiene patrón de repetición, crear trabajos recurrentes
      if (data.repeat_pattern) {
        await this.createRecurringNotification(scheduledId, data);
      }

      return {
        scheduled_id: scheduledId,
        schedule_at: data.schedule_at,
        repeat_pattern: data.repeat_pattern,
        repeat_until: data.repeat_until
      };
    } catch (error) {
      logger.error('Error scheduling notification:', error);
      throw new AppError('Error al programar notificación', 500, 'SCHEDULE_ERROR');
    }
  }

  /**
   * Programar notificación (método interno)
   */
  private async scheduleNotificationInternal(data: NotificationData): Promise<NotificationResult> {
    const scheduledId = cryptoService.generateUUID();
    const cacheKey = `scheduled_notification:${scheduledId}`;
    
    await redisClient.setex(cacheKey, 86400 * 30, JSON.stringify(data)); // 30 días

    return {
      notification_id: scheduledId,
      recipients_count: 0, // Se calculará al momento de envío
      channels_used: data.channels,
      estimated_delivery: data.schedule_at!,
      scheduled: true
    };
  }

  /**
   * Cancelar notificación programada
   */
  async cancelScheduledNotification(scheduledId: string, userId: string): Promise<boolean> {
    try {
      const cacheKey = `scheduled_notification:${scheduledId}`;
      const data = await redisClient.get(cacheKey);
      
      if (!data) return false;
      
      const notificationData = JSON.parse(data);
      
      // Verificar permisos (solo el creador o admin puede cancelar)
      if (notificationData.sender_id !== userId) {
        // Aquí se podría verificar si es admin
        return false;
      }

      await redisClient.del(cacheKey);
      return true;
    } catch (error) {
      logger.error('Error canceling scheduled notification:', error);
      return false;
    }
  }

  /**
   * Enviar notificación de prueba
   */
  async sendTestNotification(data: TestNotificationData): Promise<any> {
    try {
      const user = await User.findByPk(data.user_id);
      if (!user) {
        throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
      }

      let title = 'Notificación de Prueba - SKYN3T';
      let message = 'Esta es una notificación de prueba para verificar la configuración.';

      if (data.template) {
        title = this.processTemplate(data.template.subject_template, data.test_data);
        message = this.processTemplate(data.template.body_template, data.test_data);
      }

      const provider = this.channels.get(data.channel);
      if (!provider) {
        throw new AppError('Canal no soportado', 400, 'UNSUPPORTED_CHANNEL');
      }

      let recipient = '';
      switch (data.channel) {
        case 'email':
          recipient = user.email;
          break;
        case 'sms':
        case 'whatsapp':
          recipient = user.phone;
          break;
        case 'push':
          recipient = user.id;
          break;
      }

      const result = await provider.send(recipient, title, message, {
        test: true,
        user_name: `${user.first_name} ${user.last_name}`
      });

      return {
        success: true,
        channel: data.channel,
        recipient: recipient,
        sent_at: new Date(),
        provider_response: result
      };
    } catch (error) {
      logger.error('Error sending test notification:', error);
      throw error;
    }
  }

  /**
   * Obtener preferencias de usuario
   */
  async getUserPreferences(userId: string, communityId?: string): Promise<UserNotificationPreference[]> {
    return await UserNotificationPreference.findAll({
      where: {
        user_id: userId,
        community_id: communityId || null
      }
    });
  }

  /**
   * Crear preferencias por defecto
   */
  async createDefaultPreferences(userId: string, communityId?: string): Promise<UserNotificationPreference[]> {
    const defaultPrefs = [
      { type: 'system', channel: 'in_app', enabled: true },
      { type: 'system', channel: 'email', enabled: true },
      { type: 'security', channel: 'in_app', enabled: true },
      { type: 'security', channel: 'email', enabled: true },
      { type: 'security', channel: 'sms', enabled: false },
      { type: 'financial', channel: 'in_app', enabled: true },
      { type: 'financial', channel: 'email', enabled: true },
      { type: 'social', channel: 'in_app', enabled: true },
      { type: 'social', channel: 'email', enabled: false },
      { type: 'maintenance', channel: 'in_app', enabled: true },
      { type: 'emergency', channel: 'in_app', enabled: true },
      { type: 'emergency', channel: 'email', enabled: true },
      { type: 'emergency', channel: 'sms', enabled: true }
    ];

    const preferences = [];
    for (const pref of defaultPrefs) {
      const preference = await UserNotificationPreference.create({
        user_id: userId,
        community_id: communityId,
        notification_type: pref.type,
        channel: pref.channel,
        enabled: pref.enabled
      });
      preferences.push(preference);
    }

    return preferences;
  }

  /**
   * Obtener estadísticas de notificaciones
   */
  async getNotificationStats(options: {
    user_id?: string;
    community_id?: string;
    start_date: Date;
    end_date: Date;
  }): Promise<NotificationStats> {
    try {
      const where: any = {
        created_at: {
          [Op.between]: [options.start_date, options.end_date]
        }
      };

      if (options.user_id) where.recipient_id = options.user_id;
      if (options.community_id) where.community_id = options.community_id;

      const notifications = await NotificationLog.findAll({
        where,
        attributes: ['status', 'type', 'channels', 'created_at']
      });

      const totalSent = notifications.length;
      const totalDelivered = notifications.filter(n => n.status === 'delivered').length;
      const totalFailed = notifications.filter(n => n.status === 'failed').length;
      const deliveryRate = totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0;

      // Agrupar por tipo
      const byType = notifications.reduce((acc: any, n) => {
        acc[n.type] = (acc[n.type] || 0) + 1;
        return acc;
      }, {});

      // Agrupar por canal
      const byChannel = notifications.reduce((acc: any, n) => {
        n.channels.forEach((channel: string) => {
          acc[channel] = (acc[channel] || 0) + 1;
        });
        return acc;
      }, {});

      // Actividad reciente (por día)
      const recentActivity = this.calculateDailyActivity(notifications);

      return {
        total_sent: totalSent,
        total_delivered: totalDelivered,
        total_failed: totalFailed,
        delivery_rate: deliveryRate,
        by_type: byType,
        by_channel: byChannel,
        recent_activity: recentActivity
      };
    } catch (error) {
      logger.error('Error getting notification stats:', error);
      throw new AppError('Error al obtener estadísticas', 500, 'STATS_ERROR');
    }
  }

  /**
   * Obtener estado de entrega
   */
  async getDeliveryStatus(notificationId: string): Promise<DeliveryStatus | null> {
    try {
      const notification = await NotificationLog.findByPk(notificationId);
      if (!notification) return null;

      // Para notificaciones masivas, se necesitaría una lógica más compleja
      return {
        notification_id: notificationId,
        total_recipients: 1,
        delivered: notification.status === 'delivered' ? 1 : 0,
        failed: notification.status === 'failed' ? 1 : 0,
        pending: notification.status === 'pending' ? 1 : 0,
        by_channel: {
          email: { sent: 0, delivered: 0, failed: 0 },
          sms: { sent: 0, delivered: 0, failed: 0 },
          whatsapp: { sent: 0, delivered: 0, failed: 0 },
          push: { sent: 0, delivered: 0, failed: 0 }
        }
      };
    } catch (error) {
      logger.error('Error getting delivery status:', error);
      return null;
    }
  }

  /**
   * Verificar token de desuscripción
   */
  async verifyUnsubscribeToken(token: string): Promise<any> {
    try {
      const cacheKey = `unsubscribe_token:${token}`;
      const data = await redisClient.get(cacheKey);
      
      if (!data) return null;
      
      return JSON.parse(data);
    } catch (error) {
      logger.error('Error verifying unsubscribe token:', error);
      return null;
    }
  }

  /**
   * Métodos auxiliares privados
   */
  private async getTemplate(templateId: string): Promise<NotificationTemplate | null> {
    // Verificar cache primero
    if (this.templates.has(templateId)) {
      return this.templates.get(templateId)!;
    }

    const template = await NotificationTemplate.findByPk(templateId);
    if (template) {
      this.templates.set(templateId, template);
    }

    return template;
  }

  private processTemplate(template: string, data: Record<string, any>): string {
    let processed = template;
    
    // Reemplazar variables del tipo {{variable}}
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      processed = processed.replace(regex, String(data[key] || ''));
    });

    return processed;
  }

  private filterChannelsByPreferences(
    channels: string[], 
    preferences: UserNotificationPreference[], 
    notificationType: string
  ): string[] {
    if (preferences.length === 0) return channels; // Sin preferencias, permitir todos

    const enabledChannels = preferences
      .filter(p => p.notification_type === notificationType && p.enabled)
      .map(p => p.channel);

    return channels.filter(channel => enabledChannels.includes(channel));
  }

  private async checkQuietHours(userId: string, channel: string, communityId?: string): Promise<boolean> {
    // Obtener preferencias de horarios silenciosos
    const preferences = await UserNotificationPreference.findOne({
      where: {
        user_id: userId,
        community_id: communityId || null,
        channel: channel
      }
    });

    if (!preferences || !preferences.quiet_hours_start || !preferences.quiet_hours_end) {
      return true; // Sin horarios silenciosos configurados
    }

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    // Verificar si está en horario silencioso
    if (preferences.quiet_hours_start <= preferences.quiet_hours_end) {
      // Horario normal (ej: 22:00 - 08:00)
      return currentTime < preferences.quiet_hours_start || currentTime > preferences.quiet_hours_end;
    } else {
      // Horario que cruza medianoche (ej: 22:00 - 08:00)
      return currentTime > preferences.quiet_hours_end && currentTime < preferences.quiet_hours_start;
    }
  }

  private async createRecurringNotification(scheduledId: string, data: any): Promise<void> {
    // Implementar lógica de recurrencia
    // Esto podría usar un job scheduler como Bull o Agenda
  }

  private calculateDailyActivity(notifications: any[]): Array<{date: string; sent: number; delivered: number}> {
    const activity: { [date: string]: { sent: number; delivered: number } } = {};

    notifications.forEach(n => {
      const date = n.created_at.toISOString().split('T')[0];
      if (!activity[date]) {
        activity[date] = { sent: 0, delivered: 0 };
      }
      activity[date].sent += 1;
      if (n.status === 'delivered') {
        activity[date].delivered += 1;
      }
    });

    return Object.entries(activity).map(([date, data]) => ({
      date,
      sent: data.sent,
      delivered: data.delivered
    }));
  }
}

/**
 * Proveedores de canales
 */
class EmailChannelProvider implements ChannelProvider {
  name = 'Email';

  async send(recipient: string, subject: string, content: string, metadata?: any): Promise<any> {
    try {
      // Usar el emailService existente
      await emailService.sendEmail({
        to: recipient,
        subject: subject,
        text: content,
        html: this.formatHtmlContent(content, metadata)
      });

      return { messageId: `email_${Date.now()}`, status: 'sent' };
    } catch (error) {
      logger.error('Email send error:', error);
      throw error;
    }
  }

  async verifyDelivery(messageId: string): Promise<boolean> {
    // Implementar verificación de entrega con el proveedor de email
    return true;
  }

  private formatHtmlContent(content: string, metadata?: any): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
          <h2 style="color: #333;">SKYN3T Access Control</h2>
        </div>
        <div style="padding: 20px;">
          <p>${content}</p>
          ${metadata?.action_url ? `<a href="${metadata.action_url}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Ver más</a>` : ''}
        </div>
        <div style="background-color: #f8f9fa; padding: 10px; text-align: center; font-size: 12px; color: #666;">
          <p>© 2024 SKYN3T Access Control. Todos los derechos reservados.</p>
        </div>
      </div>
    `;
  }
}

class SMSChannelProvider implements ChannelProvider {
  name = 'SMS';

  async send(recipient: string, subject: string, content: string, metadata?: any): Promise<any> {
    try {
      // Usar Twilio u otro proveedor SMS
      const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

      if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
        throw new Error('Twilio credentials not configured');
      }

      // Limitar mensaje SMS a 160 caracteres
      const smsContent = content.length > 160 ? content.substring(0, 157) + '...' : content;

      // En producción se usaría la librería de Twilio
      // const client = twilio(twilioAccountSid, twilioAuthToken);
      // const message = await client.messages.create({
      //   body: smsContent,
      //   from: twilioPhoneNumber,
      //   to: recipient
      // });

      return { messageId: `sms_${Date.now()}`, status: 'sent' };
    } catch (error) {
      logger.error('SMS send error:', error);
      throw error;
    }
  }

  async verifyDelivery(messageId: string): Promise<boolean> {
    return true;
  }
}

class WhatsAppChannelProvider implements ChannelProvider {
  name = 'WhatsApp';

  async send(recipient: string, subject: string, content: string, metadata?: any): Promise<any> {
    try {
      // Usar WhatsApp Business API
      const whatsappApiUrl = process.env.WHATSAPP_API_URL;
      const whatsappApiToken = process.env.WHATSAPP_API_TOKEN;

      if (!whatsappApiUrl || !whatsappApiToken) {
        throw new Error('WhatsApp API credentials not configured');
      }

      const response = await axios.post(`${whatsappApiUrl}/messages`, {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'text',
        text: { body: content }
      }, {
        headers: {
          'Authorization': `Bearer ${whatsappApiToken}`,
          'Content-Type': 'application/json'
        }
      });

      return { messageId: response.data.messages[0].id, status: 'sent' };
    } catch (error) {
      logger.error('WhatsApp send error:', error);
      throw error;
    }
  }

  async verifyDelivery(messageId: string): Promise<boolean> {
    return true;
  }
}

class PushChannelProvider implements ChannelProvider {
  name = 'Push Notification';

  async send(recipient: string, subject: string, content: string, metadata?: any): Promise<any> {
    try {
      // Enviar push notification usando WebSocket
      websocketService.emitToUser(recipient, 'push.notification', {
        title: subject,
        body: content,
        priority: metadata?.priority || 'normal',
        action_url: metadata?.action_url
      });

      return { messageId: `push_${Date.now()}`, status: 'sent' };
    } catch (error) {
      logger.error('Push notification send error:', error);
      throw error;
    }
  }

  async verifyDelivery(messageId: string): Promise<boolean> {
    return true;
  }
}

export const notificationService = new NotificationService();