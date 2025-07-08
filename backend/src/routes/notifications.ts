// =====================================================
// NOTIFICATIONS ROUTES - SKYN3T ACCESS CONTROL
// =====================================================
// Rutas para gestión de notificaciones omnicanal

import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { validateRequest } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { requirePermission, requireCommunityMembership } from '../middleware/permissions';
import { loginRateLimiter, criticalOperationRateLimiter } from '../middleware/rateLimiter';
import {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  sendNotification,
  getNotificationTemplates,
  createNotificationTemplate,
  getUserPreferences,
  updateUserPreferences,
  sendTestNotification,
  getNotificationStats,
  unsubscribe,
  scheduleNotification,
  cancelScheduledNotification,
  getDeliveryStatus
} from '../controllers/notificationController';

const router = Router();

/**
 * Ruta pública para desuscripciones
 */
router.get('/unsubscribe/:token',
  [
    param('token').isLength({ min: 32, max: 128 }).withMessage('Token de desuscripción inválido'),
    query('notification_type').optional().isString().withMessage('Tipo de notificación inválido'),
    query('channel')
      .optional()
      .isIn(['email', 'sms', 'whatsapp', 'push'])
      .withMessage('Canal inválido'),
    validateRequest
  ],
  unsubscribe
);

// Aplicar autenticación a todas las demás rutas
router.use(requireAuth);

/**
 * GET /notifications
 * Obtener notificaciones del usuario
 */
router.get('/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Página debe ser un número positivo'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Límite debe estar entre 1 y 100'),
    query('status')
      .optional()
      .isIn(['unread', 'read', 'archived'])
      .withMessage('Estado inválido'),
    query('type')
      .optional()
      .isIn(['system', 'security', 'financial', 'social', 'maintenance', 'emergency'])
      .withMessage('Tipo inválido'),
    query('community_id').optional().isUUID().withMessage('ID de comunidad inválido'),
    query('unread_only')
      .optional()
      .isBoolean()
      .withMessage('unread_only debe ser booleano'),
    validateRequest
  ],
  getUserNotifications
);

/**
 * PUT /notifications/:id/read
 * Marcar notificación como leída
 */
router.put('/:id/read',
  [
    param('id').isUUID().withMessage('ID de notificación inválido'),
    validateRequest
  ],
  markAsRead
);

/**
 * PUT /notifications/read-all
 * Marcar todas las notificaciones como leídas
 */
router.put('/read-all',
  [
    query('community_id').optional().isUUID().withMessage('ID de comunidad inválido'),
    validateRequest
  ],
  markAllAsRead
);

/**
 * DELETE /notifications/:id
 * Eliminar notificación
 */
router.delete('/:id',
  [
    param('id').isUUID().withMessage('ID de notificación inválido'),
    validateRequest
  ],
  deleteNotification
);

/**
 * POST /notifications/send
 * Enviar notificación
 */
router.post('/send',
  [
    body('recipient_type')
      .isIn(['user', 'community', 'role', 'broadcast'])
      .withMessage('Tipo de destinatario inválido'),
    body('recipient_id')
      .if(body('recipient_type').isIn(['user']))
      .isUUID()
      .withMessage('ID de destinatario requerido para tipo user'),
    body('community_id')
      .if(body('recipient_type').isIn(['community', 'role']))
      .isUUID()
      .withMessage('ID de comunidad requerido'),
    body('role_filter')
      .if(body('recipient_type').equals('role'))
      .isString()
      .withMessage('Filtro de rol requerido'),
    body('type')
      .isIn(['system', 'security', 'financial', 'social', 'maintenance', 'emergency'])
      .withMessage('Tipo de notificación inválido'),
    body('title')
      .isLength({ min: 5, max: 100 })
      .withMessage('Título debe tener entre 5 y 100 caracteres'),
    body('message')
      .isLength({ min: 10, max: 1000 })
      .withMessage('Mensaje debe tener entre 10 y 1000 caracteres'),
    body('channels')
      .optional()
      .isArray()
      .withMessage('Canales debe ser un array'),
    body('channels.*')
      .if(body('channels').exists())
      .isIn(['in_app', 'email', 'sms', 'whatsapp', 'push'])
      .withMessage('Canal inválido'),
    body('priority')
      .optional()
      .isIn(['low', 'normal', 'high', 'urgent'])
      .withMessage('Prioridad inválida'),
    body('schedule_at')
      .optional()
      .isISO8601()
      .withMessage('Fecha de programación inválida'),
    body('template_id')
      .optional()
      .isUUID()
      .withMessage('ID de plantilla inválido'),
    body('action_url')
      .optional()
      .isURL()
      .withMessage('URL de acción inválida'),
    body('expires_at')
      .optional()
      .isISO8601()
      .withMessage('Fecha de expiración inválida'),
    validateRequest
  ],
  requirePermission(['notifications.send', 'admin.notifications']),
  loginRateLimiter, // Limitar envío de notificaciones para evitar spam
  sendNotification
);

/**
 * GET /notifications/templates
 * Obtener plantillas de notificación
 */
router.get('/templates',
  [
    query('category')
      .optional()
      .isIn(['system', 'security', 'financial', 'social', 'maintenance', 'emergency'])
      .withMessage('Categoría inválida'),
    query('community_id').optional().isUUID().withMessage('ID de comunidad inválido'),
    validateRequest
  ],
  requirePermission(['notifications.view_templates', 'admin.notifications']),
  getNotificationTemplates
);

/**
 * POST /notifications/templates
 * Crear plantilla de notificación
 */
router.post('/templates',
  [
    body('name')
      .isLength({ min: 3, max: 100 })
      .withMessage('Nombre debe tener entre 3 y 100 caracteres'),
    body('category')
      .isIn(['system', 'security', 'financial', 'social', 'maintenance', 'emergency'])
      .withMessage('Categoría inválida'),
    body('subject_template')
      .isLength({ min: 5, max: 200 })
      .withMessage('Plantilla de asunto debe tener entre 5 y 200 caracteres'),
    body('body_template')
      .isLength({ min: 10, max: 5000 })
      .withMessage('Plantilla de cuerpo debe tener entre 10 y 5000 caracteres'),
    body('variables')
      .optional()
      .isArray()
      .withMessage('Variables debe ser un array'),
    body('supported_channels')
      .isArray({ min: 1 })
      .withMessage('Debe especificar al menos un canal soportado'),
    body('supported_channels.*')
      .isIn(['in_app', 'email', 'sms', 'whatsapp', 'push'])
      .withMessage('Canal soportado inválido'),
    body('community_id')
      .optional()
      .isUUID()
      .withMessage('ID de comunidad inválido'),
    body('is_global')
      .optional()
      .isBoolean()
      .withMessage('is_global debe ser booleano'),
    validateRequest
  ],
  requirePermission(['notifications.manage_templates', 'admin.notifications']),
  createNotificationTemplate
);

/**
 * GET /notifications/preferences
 * Obtener preferencias de notificación del usuario
 */
router.get('/preferences',
  [
    query('community_id').optional().isUUID().withMessage('ID de comunidad inválido'),
    validateRequest
  ],
  getUserPreferences
);

/**
 * PUT /notifications/preferences
 * Actualizar preferencias de notificación
 */
router.put('/preferences',
  [
    body('preferences')
      .isArray({ min: 1 })
      .withMessage('Debe especificar al menos una preferencia'),
    body('preferences.*.notification_type')
      .isIn(['system', 'security', 'financial', 'social', 'maintenance', 'emergency'])
      .withMessage('Tipo de notificación inválido'),
    body('preferences.*.channel')
      .isIn(['in_app', 'email', 'sms', 'whatsapp', 'push'])
      .withMessage('Canal inválido'),
    body('preferences.*.enabled')
      .isBoolean()
      .withMessage('enabled debe ser booleano'),
    body('preferences.*.quiet_hours_start')
      .optional()
      .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage('Hora de inicio silencioso inválida (formato HH:MM)'),
    body('preferences.*.quiet_hours_end')
      .optional()
      .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage('Hora de fin silencioso inválida (formato HH:MM)'),
    body('community_id')
      .optional()
      .isUUID()
      .withMessage('ID de comunidad inválido'),
    validateRequest
  ],
  updateUserPreferences
);

/**
 * POST /notifications/test
 * Enviar notificación de prueba
 */
router.post('/test',
  [
    body('channel')
      .isIn(['email', 'sms', 'whatsapp', 'push'])
      .withMessage('Canal de prueba inválido'),
    body('template_id')
      .optional()
      .isUUID()
      .withMessage('ID de plantilla inválido'),
    validateRequest
  ],
  loginRateLimiter, // Limitar tests para evitar spam
  sendTestNotification
);

/**
 * GET /notifications/stats
 * Obtener estadísticas de notificaciones
 */
router.get('/stats',
  [
    query('community_id').optional().isUUID().withMessage('ID de comunidad inválido'),
    query('period')
      .optional()
      .isIn(['7d', '30d', '90d'])
      .withMessage('Período inválido'),
    validateRequest
  ],
  getNotificationStats
);

/**
 * POST /notifications/schedule
 * Programar notificación
 */
router.post('/schedule',
  [
    body('schedule_at')
      .isISO8601()
      .withMessage('Fecha de programación requerida')
      .custom((value) => {
        if (new Date(value) <= new Date()) {
          throw new Error('La fecha debe ser futura');
        }
        return true;
      }),
    body('repeat_pattern')
      .optional()
      .isIn(['daily', 'weekly', 'monthly', 'yearly'])
      .withMessage('Patrón de repetición inválido'),
    body('repeat_until')
      .optional()
      .isISO8601()
      .withMessage('Fecha de fin de repetición inválida'),
    body('title')
      .isLength({ min: 5, max: 100 })
      .withMessage('Título debe tener entre 5 y 100 caracteres'),
    body('message')
      .isLength({ min: 10, max: 1000 })
      .withMessage('Mensaje debe tener entre 10 y 1000 caracteres'),
    body('recipient_type')
      .isIn(['user', 'community', 'role', 'broadcast'])
      .withMessage('Tipo de destinatario inválido'),
    validateRequest
  ],
  requirePermission(['notifications.schedule', 'admin.notifications']),
  scheduleNotification
);

/**
 * DELETE /notifications/scheduled/:id
 * Cancelar notificación programada
 */
router.delete('/scheduled/:id',
  [
    param('id').isUUID().withMessage('ID de notificación programada inválido'),
    validateRequest
  ],
  requirePermission(['notifications.schedule', 'admin.notifications']),
  cancelScheduledNotification
);

/**
 * GET /notifications/:id/delivery
 * Obtener estado de entrega de notificación
 */
router.get('/:id/delivery',
  [
    param('id').isUUID().withMessage('ID de notificación inválido'),
    validateRequest
  ],
  requirePermission(['notifications.view_delivery', 'admin.notifications']),
  getDeliveryStatus
);

/**
 * Rutas administrativas
 */

/**
 * GET /notifications/admin/overview
 * Vista general de notificaciones (admin)
 */
router.get('/admin/overview',
  [
    query('community_id').optional().isUUID().withMessage('ID de comunidad inválido'),
    query('period')
      .optional()
      .isIn(['today', 'week', 'month'])
      .withMessage('Período inválido'),
    validateRequest
  ],
  requirePermission('admin.notifications'),
  async (req, res, next) => {
    try {
      // Implementar vista general administrativa
      res.json({
        success: true,
        data: {
          total_sent: 0,
          total_delivered: 0,
          total_failed: 0,
          delivery_rate: 0,
          by_channel: {},
          recent_failures: [],
          popular_templates: []
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /notifications/admin/broadcast
 * Enviar notificación masiva (admin)
 */
router.post('/admin/broadcast',
  [
    body('title')
      .isLength({ min: 5, max: 100 })
      .withMessage('Título debe tener entre 5 y 100 caracteres'),
    body('message')
      .isLength({ min: 10, max: 1000 })
      .withMessage('Mensaje debe tener entre 10 y 1000 caracteres'),
    body('target')
      .isIn(['all_users', 'community', 'role', 'custom'])
      .withMessage('Objetivo de difusión inválido'),
    body('community_ids')
      .if(body('target').isIn(['community', 'custom']))
      .isArray({ min: 1 })
      .withMessage('Debe especificar al menos una comunidad'),
    body('role_filter')
      .if(body('target').equals('role'))
      .isString()
      .withMessage('Filtro de rol requerido'),
    body('channels')
      .isArray({ min: 1 })
      .withMessage('Debe especificar al menos un canal'),
    body('priority')
      .isIn(['low', 'normal', 'high', 'urgent'])
      .withMessage('Prioridad inválida'),
    validateRequest
  ],
  requirePermission('admin.broadcast'),
  criticalOperationRateLimiter,
  async (req, res, next) => {
    try {
      // Implementar lógica de difusión masiva
      res.json({
        success: true,
        message: 'Difusión masiva iniciada',
        data: {
          broadcast_id: 'uuid',
          estimated_recipients: 0,
          estimated_completion: new Date()
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /notifications/admin/templates
 * Gestionar plantillas (admin)
 */
router.get('/admin/templates',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Página debe ser un número positivo'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Límite debe estar entre 1 y 100'),
    query('category').optional().isString().withMessage('Categoría debe ser texto'),
    query('search').optional().isString().withMessage('Búsqueda debe ser texto'),
    validateRequest
  ],
  requirePermission('admin.templates'),
  async (req, res, next) => {
    try {
      // Implementar gestión de plantillas
      res.json({
        success: true,
        data: {
          templates: [],
          pagination: {},
          stats: {
            total_templates: 0,
            active_templates: 0,
            most_used: []
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /notifications/admin/templates/:id
 * Actualizar plantilla (admin)
 */
router.put('/admin/templates/:id',
  [
    param('id').isUUID().withMessage('ID de plantilla inválido'),
    body('name')
      .optional()
      .isLength({ min: 3, max: 100 })
      .withMessage('Nombre debe tener entre 3 y 100 caracteres'),
    body('subject_template')
      .optional()
      .isLength({ min: 5, max: 200 })
      .withMessage('Plantilla de asunto debe tener entre 5 y 200 caracteres'),
    body('body_template')
      .optional()
      .isLength({ min: 10, max: 5000 })
      .withMessage('Plantilla de cuerpo debe tener entre 10 y 5000 caracteres'),
    body('is_active')
      .optional()
      .isBoolean()
      .withMessage('is_active debe ser booleano'),
    validateRequest
  ],
  requirePermission('admin.templates'),
  async (req, res, next) => {
    try {
      // Implementar actualización de plantilla
      res.json({
        success: true,
        message: 'Plantilla actualizada exitosamente'
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;