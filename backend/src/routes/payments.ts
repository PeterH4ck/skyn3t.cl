// =====================================================
// PAYMENTS ROUTES - SKYN3T ACCESS CONTROL
// =====================================================
// Rutas para gestión de pagos y gastos comunes

import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { validateRequest } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { requirePermission, requireCommunityMembership, requireOwnership } from '../middleware/permissions';
import { criticalOperationRateLimiter, loginRateLimiter } from '../middleware/rateLimiter';
import {
  getPaymentMethods,
  addPaymentMethod,
  processPayment,
  getPaymentHistory,
  getPendingExpenses,
  generateReceipt,
  setupAutoPay,
  paymentWebhook,
  refundPayment,
  getPaymentReport
} from '../controllers/paymentController';

const router = Router();

/**
 * Webhook endpoint (sin autenticación para proveedores externos)
 */
router.post('/webhook/:provider',
  [
    param('provider')
      .isIn(['banco_estado', 'santander', 'bci', 'banco_chile', 'paypal', 'mercadopago'])
      .withMessage('Proveedor de pago inválido'),
    validateRequest
  ],
  paymentWebhook
);

// Aplicar autenticación a todas las demás rutas
router.use(requireAuth);

/**
 * GET /payments/methods
 * Obtener métodos de pago del usuario
 */
router.get('/methods',
  [
    query('community_id').optional().isUUID().withMessage('ID de comunidad inválido'),
    validateRequest
  ],
  getPaymentMethods
);

/**
 * POST /payments/methods
 * Agregar método de pago
 */
router.post('/methods',
  [
    body('type')
      .isIn(['credit_card', 'debit_card', 'bank_transfer', 'digital_wallet'])
      .withMessage('Tipo de método de pago inválido'),
    body('provider')
      .isIn(['banco_estado', 'santander', 'bci', 'banco_chile', 'paypal', 'mercadopago', 'visa', 'mastercard'])
      .withMessage('Proveedor inválido'),
    
    // Validaciones condicionales para tarjetas
    body('card_number')
      .if(body('type').isIn(['credit_card', 'debit_card']))
      .isCreditCard()
      .withMessage('Número de tarjeta inválido'),
    body('expiry_month')
      .if(body('type').isIn(['credit_card', 'debit_card']))
      .isInt({ min: 1, max: 12 })
      .withMessage('Mes de expiración inválido'),
    body('expiry_year')
      .if(body('type').isIn(['credit_card', 'debit_card']))
      .isInt({ min: new Date().getFullYear(), max: new Date().getFullYear() + 20 })
      .withMessage('Año de expiración inválido'),
    body('cardholder_name')
      .if(body('type').isIn(['credit_card', 'debit_card']))
      .isLength({ min: 2, max: 100 })
      .withMessage('Nombre del titular inválido'),
    
    // Validaciones para transferencia bancaria
    body('bank_account')
      .if(body('type').equals('bank_transfer'))
      .isLength({ min: 8, max: 20 })
      .withMessage('Número de cuenta bancaria inválido'),
    body('rut')
      .if(body('type').equals('bank_transfer'))
      .matches(/^\d{7,8}-[\dkK]$/)
      .withMessage('RUT inválido (formato: 12345678-9)'),
    
    // Validaciones para billetera digital
    body('email')
      .if(body('type').equals('digital_wallet'))
      .isEmail()
      .withMessage('Email inválido'),
    
    body('is_default')
      .optional()
      .isBoolean()
      .withMessage('is_default debe ser booleano'),
    validateRequest
  ],
  loginRateLimiter, // Limitar creación de métodos de pago
  addPaymentMethod
);

/**
 * POST /payments/process
 * Procesar pago
 */
router.post('/process',
  [
    body('amount')
      .isFloat({ min: 100, max: 50000000 }) // Min $100 CLP, Max $50M CLP
      .withMessage('Monto debe estar entre $100 y $50.000.000 CLP'),
    body('currency')
      .optional()
      .isIn(['CLP', 'USD', 'EUR'])
      .withMessage('Moneda no soportada'),
    body('payment_method_id')
      .isUUID()
      .withMessage('ID de método de pago inválido'),
    body('community_id')
      .isUUID()
      .withMessage('ID de comunidad requerido'),
    body('expense_id')
      .optional()
      .isUUID()
      .withMessage('ID de gasto inválido'),
    body('description')
      .isLength({ min: 5, max: 200 })
      .withMessage('Descripción debe tener entre 5 y 200 caracteres'),
    body('installments')
      .optional()
      .isInt({ min: 1, max: 36 })
      .withMessage('Cuotas debe estar entre 1 y 36'),
    validateRequest
  ],
  requireCommunityMembership(),
  criticalOperationRateLimiter,
  processPayment
);

/**
 * GET /payments/history
 * Obtener historial de pagos del usuario
 */
router.get('/history',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Página debe ser un número positivo'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Límite debe estar entre 1 y 100'),
    query('community_id').optional().isUUID().withMessage('ID de comunidad inválido'),
    query('status')
      .optional()
      .isIn(['pending', 'completed', 'failed', 'refunded'])
      .withMessage('Estado inválido'),
    query('from_date').optional().isISO8601().withMessage('Fecha de inicio inválida'),
    query('to_date').optional().isISO8601().withMessage('Fecha de fin inválida'),
    query('expense_id').optional().isUUID().withMessage('ID de gasto inválido'),
    validateRequest
  ],
  getPaymentHistory
);

/**
 * GET /payments/expenses/pending
 * Obtener gastos comunes pendientes de pago
 */
router.get('/expenses/pending',
  [
    query('community_id')
      .notEmpty()
      .isUUID()
      .withMessage('ID de comunidad requerido'),
    validateRequest
  ],
  requireCommunityMembership(),
  getPendingExpenses
);

/**
 * GET /payments/:payment_id/receipt
 * Generar y descargar recibo de pago
 */
router.get('/:payment_id/receipt',
  [
    param('payment_id').isUUID().withMessage('ID de pago inválido'),
    validateRequest
  ],
  requireOwnership('user_id'), // Solo el propietario puede descargar su recibo
  generateReceipt
);

/**
 * POST /payments/autopay
 * Configurar pago automático
 */
router.post('/autopay',
  [
    body('community_id')
      .isUUID()
      .withMessage('ID de comunidad requerido'),
    body('payment_method_id')
      .isUUID()
      .withMessage('ID de método de pago requerido'),
    body('auto_pay_day')
      .optional()
      .isInt({ min: 1, max: 28 })
      .withMessage('Día de auto-pago debe estar entre 1 y 28'),
    body('enabled')
      .optional()
      .isBoolean()
      .withMessage('Enabled debe ser booleano'),
    validateRequest
  ],
  requireCommunityMembership(),
  setupAutoPay
);

/**
 * POST /payments/:payment_id/refund
 * Solicitar reembolso de pago
 */
router.post('/:payment_id/refund',
  [
    param('payment_id').isUUID().withMessage('ID de pago inválido'),
    body('reason')
      .isLength({ min: 10, max: 500 })
      .withMessage('Razón del reembolso debe tener entre 10 y 500 caracteres'),
    body('amount')
      .optional()
      .isFloat({ min: 100 })
      .withMessage('Monto de reembolso debe ser mayor a $100'),
    validateRequest
  ],
  requirePermission(['payments.refund', 'admin.payments']),
  criticalOperationRateLimiter,
  refundPayment
);

/**
 * GET /payments/reports
 * Obtener reporte de pagos (solo admins)
 */
router.get('/reports',
  [
    query('community_id')
      .notEmpty()
      .isUUID()
      .withMessage('ID de comunidad requerido'),
    query('period')
      .optional()
      .isIn(['current_month', 'last_month', 'current_year', 'last_year', 'custom'])
      .withMessage('Período inválido'),
    query('format')
      .optional()
      .isIn(['json', 'pdf', 'excel'])
      .withMessage('Formato inválido'),
    query('include_charts')
      .optional()
      .isBoolean()
      .withMessage('include_charts debe ser booleano'),
    validateRequest
  ],
  requirePermission(['financial.reports', 'admin.financial']),
  getPaymentReport
);

/**
 * Rutas administrativas (requieren permisos especiales)
 */

/**
 * GET /payments/admin/transactions
 * Ver todas las transacciones (admin)
 */
router.get('/admin/transactions',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Página debe ser un número positivo'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Límite debe estar entre 1 y 100'),
    query('community_id').optional().isUUID().withMessage('ID de comunidad inválido'),
    query('status')
      .optional()
      .isIn(['pending', 'completed', 'failed', 'refunded'])
      .withMessage('Estado inválido'),
    query('user_id').optional().isUUID().withMessage('ID de usuario inválido'),
    query('from_date').optional().isISO8601().withMessage('Fecha de inicio inválida'),
    query('to_date').optional().isISO8601().withMessage('Fecha de fin inválida'),
    validateRequest
  ],
  requirePermission('admin.payments'),
  async (req, res, next) => {
    try {
      // Implementar lógica para ver todas las transacciones
      res.json({
        success: true,
        data: {
          transactions: [],
          pagination: {},
          stats: {}
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /payments/admin/transactions/:id/status
 * Cambiar estado de transacción (admin)
 */
router.put('/admin/transactions/:id/status',
  [
    param('id').isUUID().withMessage('ID de transacción inválido'),
    body('status')
      .isIn(['pending', 'completed', 'failed', 'refunded'])
      .withMessage('Estado inválido'),
    body('reason')
      .isLength({ min: 10, max: 500 })
      .withMessage('Razón debe tener entre 10 y 500 caracteres'),
    validateRequest
  ],
  requirePermission('admin.payments'),
  criticalOperationRateLimiter,
  async (req, res, next) => {
    try {
      // Implementar lógica para cambiar estado
      res.json({
        success: true,
        message: 'Estado de transacción actualizado'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /payments/admin/bulk-notify
 * Enviar notificación masiva de pagos pendientes
 */
router.post('/admin/bulk-notify',
  [
    body('community_id')
      .isUUID()
      .withMessage('ID de comunidad requerido'),
    body('expense_id')
      .optional()
      .isUUID()
      .withMessage('ID de gasto inválido'),
    body('notification_type')
      .isIn(['reminder', 'overdue', 'final_notice'])
      .withMessage('Tipo de notificación inválido'),
    body('custom_message')
      .optional()
      .isLength({ min: 10, max: 1000 })
      .withMessage('Mensaje personalizado debe tener entre 10 y 1000 caracteres'),
    validateRequest
  ],
  requirePermission('admin.notifications'),
  async (req, res, next) => {
    try {
      // Implementar lógica para notificaciones masivas
      res.json({
        success: true,
        message: 'Notificaciones enviadas exitosamente',
        data: {
          sent_count: 0,
          failed_count: 0
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /payments/stats
 * Estadísticas de pagos del usuario
 */
router.get('/stats',
  [
    query('community_id').optional().isUUID().withMessage('ID de comunidad inválido'),
    query('period')
      .optional()
      .isIn(['7d', '30d', '90d', '1y'])
      .withMessage('Período inválido'),
    validateRequest
  ],
  async (req, res, next) => {
    try {
      // Implementar estadísticas personales
      res.json({
        success: true,
        data: {
          total_paid: 0,
          pending_amount: 0,
          payment_count: 0,
          average_payment: 0,
          on_time_percentage: 100,
          preferred_method: null,
          monthly_trend: []
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;