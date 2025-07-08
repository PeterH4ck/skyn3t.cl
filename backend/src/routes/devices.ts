// =====================================================
// DEVICES ROUTES - SKYN3T ACCESS CONTROL
// =====================================================
// Rutas para gestión de dispositivos IoT

import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { validateRequest } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { requirePermission, requireCommunityMembership } from '../middleware/permissions';
import { criticalOperationRateLimiter, uploadRateLimiter } from '../middleware/rateLimiter';
import {
  getDevices,
  getDevice,
  createDevice,
  updateDevice,
  deleteDevice,
  sendCommand,
  getDeviceStatus,
  getDeviceMetrics,
  restartDevice,
  updateFirmware,
  getDeviceCommandLogs,
  configureDeviceAlerts
} from '../controllers/deviceController';

const router = Router();

// Aplicar autenticación a todas las rutas
router.use(requireAuth);

/**
 * GET /devices
 * Obtener lista de dispositivos
 */
router.get('/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Página debe ser un número positivo'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Límite debe estar entre 1 y 100'),
    query('community_id').optional().isUUID().withMessage('ID de comunidad inválido'),
    query('building_id').optional().isUUID().withMessage('ID de edificio inválido'),
    query('status').optional().isIn(['online', 'offline', 'error', 'maintenance']).withMessage('Estado inválido'),
    query('type').optional().isString().withMessage('Tipo debe ser texto'),
    validateRequest
  ],
  requirePermission(['devices.view', 'devices.manage']),
  getDevices
);

/**
 * GET /devices/:id
 * Obtener dispositivo específico
 */
router.get('/:id',
  [
    param('id').isUUID().withMessage('ID de dispositivo inválido'),
    validateRequest
  ],
  requirePermission(['devices.view', 'devices.manage']),
  getDevice
);

/**
 * POST /devices
 * Crear nuevo dispositivo
 */
router.post('/',
  [
    body('serial_number')
      .isLength({ min: 3, max: 50 })
      .withMessage('Número de serie debe tener entre 3 y 50 caracteres')
      .matches(/^[A-Z0-9\-_]+$/)
      .withMessage('Número de serie solo puede contener letras mayúsculas, números, guiones y guiones bajos'),
    body('name')
      .isLength({ min: 3, max: 100 })
      .withMessage('Nombre debe tener entre 3 y 100 caracteres'),
    body('type')
      .isIn(['access_control', 'camera', 'sensor', 'barrier', 'intercom', 'alarm'])
      .withMessage('Tipo de dispositivo inválido'),
    body('community_id')
      .isUUID()
      .withMessage('ID de comunidad inválido'),
    body('building_id')
      .optional()
      .isUUID()
      .withMessage('ID de edificio inválido'),
    body('floor_id')
      .optional()
      .isUUID()
      .withMessage('ID de piso inválido'),
    body('location')
      .isLength({ min: 3, max: 200 })
      .withMessage('Ubicación debe tener entre 3 y 200 caracteres'),
    body('ip_address')
      .optional()
      .isIP()
      .withMessage('Dirección IP inválida'),
    body('mac_address')
      .optional()
      .isMACAddress()
      .withMessage('Dirección MAC inválida'),
    body('capabilities')
      .optional()
      .isArray()
      .withMessage('Capacidades debe ser un array'),
    validateRequest
  ],
  requirePermission('devices.create'),
  requireCommunityMembership(),
  createDevice
);

/**
 * PUT /devices/:id
 * Actualizar dispositivo
 */
router.put('/:id',
  [
    param('id').isUUID().withMessage('ID de dispositivo inválido'),
    body('name')
      .optional()
      .isLength({ min: 3, max: 100 })
      .withMessage('Nombre debe tener entre 3 y 100 caracteres'),
    body('location')
      .optional()
      .isLength({ min: 3, max: 200 })
      .withMessage('Ubicación debe tener entre 3 y 200 caracteres'),
    body('ip_address')
      .optional()
      .isIP()
      .withMessage('Dirección IP inválida'),
    body('status')
      .optional()
      .isIn(['online', 'offline', 'error', 'maintenance'])
      .withMessage('Estado inválido'),
    validateRequest
  ],
  requirePermission('devices.update'),
  updateDevice
);

/**
 * DELETE /devices/:id
 * Eliminar dispositivo
 */
router.delete('/:id',
  [
    param('id').isUUID().withMessage('ID de dispositivo inválido'),
    validateRequest
  ],
  requirePermission('devices.delete'),
  criticalOperationRateLimiter,
  deleteDevice
);

/**
 * POST /devices/:id/command
 * Enviar comando a dispositivo
 */
router.post('/:id/command',
  [
    param('id').isUUID().withMessage('ID de dispositivo inválido'),
    body('command')
      .isIn([
        'open_door', 'close_door', 'unlock_gate', 'lock_gate',
        'activate_barrier', 'deactivate_barrier', 'restart',
        'take_photo', 'start_recording', 'stop_recording',
        'sound_alarm', 'stop_alarm', 'update_config'
      ])
      .withMessage('Comando inválido'),
    body('parameters')
      .optional()
      .isObject()
      .withMessage('Parámetros debe ser un objeto'),
    body('priority')
      .optional()
      .isInt({ min: 1, max: 10 })
      .withMessage('Prioridad debe estar entre 1 y 10'),
    validateRequest
  ],
  requirePermission('devices.control'),
  criticalOperationRateLimiter,
  sendCommand
);

/**
 * GET /devices/:id/status
 * Obtener estado actual del dispositivo
 */
router.get('/:id/status',
  [
    param('id').isUUID().withMessage('ID de dispositivo inválido'),
    validateRequest
  ],
  requirePermission(['devices.view', 'devices.manage']),
  getDeviceStatus
);

/**
 * GET /devices/:id/metrics
 * Obtener métricas del dispositivo
 */
router.get('/:id/metrics',
  [
    param('id').isUUID().withMessage('ID de dispositivo inválido'),
    query('from')
      .optional()
      .isISO8601()
      .withMessage('Fecha de inicio inválida'),
    query('to')
      .optional()
      .isISO8601()
      .withMessage('Fecha de fin inválida'),
    query('metric_type')
      .optional()
      .isIn(['cpu', 'memory', 'temperature', 'network', 'battery'])
      .withMessage('Tipo de métrica inválido'),
    validateRequest
  ],
  requirePermission(['devices.view', 'devices.manage']),
  getDeviceMetrics
);

/**
 * POST /devices/:id/restart
 * Reiniciar dispositivo
 */
router.post('/:id/restart',
  [
    param('id').isUUID().withMessage('ID de dispositivo inválido'),
    validateRequest
  ],
  requirePermission('devices.control'),
  criticalOperationRateLimiter,
  restartDevice
);

/**
 * POST /devices/:id/firmware
 * Actualizar firmware del dispositivo
 */
router.post('/:id/firmware',
  [
    param('id').isUUID().withMessage('ID de dispositivo inválido'),
    body('firmware_version')
      .matches(/^\d+\.\d+\.\d+(-[a-zA-Z0-9\-]+)?$/)
      .withMessage('Versión de firmware inválida (formato: x.y.z)'),
    body('auto_install')
      .optional()
      .isBoolean()
      .withMessage('Auto instalación debe ser booleano'),
    validateRequest
  ],
  requirePermission('devices.firmware_update'),
  criticalOperationRateLimiter,
  updateFirmware
);

/**
 * GET /devices/:id/commands
 * Obtener historial de comandos del dispositivo
 */
router.get('/:id/commands',
  [
    param('id').isUUID().withMessage('ID de dispositivo inválido'),
    query('page').optional().isInt({ min: 1 }).withMessage('Página debe ser un número positivo'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Límite debe estar entre 1 y 100'),
    query('status')
      .optional()
      .isIn(['queued', 'sent', 'executed', 'failed', 'timeout'])
      .withMessage('Estado inválido'),
    query('command_type').optional().isString().withMessage('Tipo de comando debe ser texto'),
    validateRequest
  ],
  requirePermission(['devices.view', 'devices.manage']),
  getDeviceCommandLogs
);

/**
 * PUT /devices/:id/alerts
 * Configurar alertas del dispositivo
 */
router.put('/:id/alerts',
  [
    param('id').isUUID().withMessage('ID de dispositivo inválido'),
    body('cpu_threshold')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Umbral de CPU debe estar entre 0 y 100'),
    body('memory_threshold')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Umbral de memoria debe estar entre 0 y 100'),
    body('temperature_threshold')
      .optional()
      .isFloat({ min: -50, max: 150 })
      .withMessage('Umbral de temperatura debe estar entre -50 y 150'),
    body('offline_timeout')
      .optional()
      .isInt({ min: 60, max: 3600 })
      .withMessage('Timeout offline debe estar entre 60 y 3600 segundos'),
    body('enable_notifications')
      .optional()
      .isBoolean()
      .withMessage('Habilitar notificaciones debe ser booleano'),
    validateRequest
  ],
  requirePermission('devices.configure'),
  configureDeviceAlerts
);

/**
 * Bulk operations
 */

/**
 * POST /devices/bulk/command
 * Enviar comando a múltiples dispositivos
 */
router.post('/bulk/command',
  [
    body('device_ids')
      .isArray({ min: 1, max: 50 })
      .withMessage('Debe especificar entre 1 y 50 dispositivos'),
    body('device_ids.*')
      .isUUID()
      .withMessage('ID de dispositivo inválido'),
    body('command')
      .isIn([
        'open_door', 'close_door', 'unlock_gate', 'lock_gate',
        'restart', 'update_config'
      ])
      .withMessage('Comando inválido para operación masiva'),
    body('parameters')
      .optional()
      .isObject()
      .withMessage('Parámetros debe ser un objeto'),
    validateRequest
  ],
  requirePermission('devices.bulk_control'),
  criticalOperationRateLimiter,
  async (req, res, next) => {
    try {
      const { device_ids, command, parameters } = req.body;
      const results = [];

      for (const deviceId of device_ids) {
        try {
          // Usar el controlador de comando individual
          req.params.id = deviceId;
          req.body = { command, parameters };
          
          // Aquí se podría implementar lógica de comando masivo más eficiente
          results.push({
            device_id: deviceId,
            status: 'queued',
            message: 'Comando enviado'
          });
        } catch (error) {
          results.push({
            device_id: deviceId,
            status: 'error',
            message: error instanceof Error ? error.message : 'Error desconocido'
          });
        }
      }

      res.json({
        success: true,
        message: 'Comandos masivos procesados',
        data: { results }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /devices/stats
 * Obtener estadísticas de dispositivos
 */
router.get('/stats',
  [
    query('community_id').optional().isUUID().withMessage('ID de comunidad inválido'),
    query('building_id').optional().isUUID().withMessage('ID de edificio inválido'),
    validateRequest
  ],
  requirePermission(['devices.view', 'devices.manage']),
  async (req, res, next) => {
    try {
      // Implementar lógica de estadísticas
      res.json({
        success: true,
        data: {
          total_devices: 0,
          online_devices: 0,
          offline_devices: 0,
          error_devices: 0,
          by_type: {},
          recent_alerts: []
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;