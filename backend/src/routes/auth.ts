import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authenticate, optionalAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { body, param } from 'express-validator';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting específico para autenticación
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 intentos por IP
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Demasiados intentos de login. Intenta nuevamente en 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // 3 intentos por IP
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Demasiados intentos de reset de contraseña. Intenta nuevamente en 1 hora.'
  }
});

const twoFALimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 10, // 10 intentos por IP
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Demasiados intentos de 2FA. Intenta nuevamente en 5 minutos.'
  }
});

// Validaciones
const loginValidation = [
  body('username')
    .isLength({ min: 3, max: 100 })
    .withMessage('Username debe tener entre 3 y 100 caracteres')
    .trim(),
  body('password')
    .isLength({ min: 6, max: 100 })
    .withMessage('Password debe tener entre 6 y 100 caracteres'),
  body('remember')
    .optional()
    .isBoolean()
    .withMessage('Remember debe ser boolean'),
  body('two_factor_code')
    .optional()
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('Código 2FA debe ser 6 dígitos')
];

const refreshTokenValidation = [
  body('refresh_token')
    .notEmpty()
    .withMessage('Refresh token es requerido')
    .isJWT()
    .withMessage('Refresh token inválido')
];

const passwordResetRequestValidation = [
  body('email')
    .isEmail()
    .withMessage('Email inválido')
    .normalizeEmail()
];

const passwordResetValidation = [
  body('token')
    .notEmpty()
    .withMessage('Token es requerido')
    .isLength({ min: 32, max: 128 })
    .withMessage('Token inválido'),
  body('password')
    .isLength({ min: 8, max: 100 })
    .withMessage('Password debe tener entre 8 y 100 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password debe contener al menos: 1 minúscula, 1 mayúscula, 1 número y 1 carácter especial')
];

const changePasswordValidation = [
  body('current_password')
    .notEmpty()
    .withMessage('Contraseña actual es requerida'),
  body('new_password')
    .isLength({ min: 8, max: 100 })
    .withMessage('Nueva contraseña debe tener entre 8 y 100 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Nueva contraseña debe contener al menos: 1 minúscula, 1 mayúscula, 1 número y 1 carácter especial')
];

const twoFACodeValidation = [
  body('code')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('Código debe ser 6 dígitos')
];

// ===== RUTAS PÚBLICAS =====

/**
 * @route   POST /auth/login
 * @desc    Autenticar usuario
 * @access  Public
 */
router.post('/login', 
  loginLimiter,
  loginValidation,
  validate,
  authController.login
);

/**
 * @route   POST /auth/refresh
 * @desc    Refrescar token de acceso
 * @access  Public
 */
router.post('/refresh',
  refreshTokenValidation,
  validate,
  authController.refreshToken
);

/**
 * @route   POST /auth/password/reset-request
 * @desc    Solicitar reset de contraseña
 * @access  Public
 */
router.post('/password/reset-request',
  passwordResetLimiter,
  passwordResetRequestValidation,
  validate,
  authController.requestPasswordReset
);

/**
 * @route   POST /auth/password/reset
 * @desc    Resetear contraseña con token
 * @access  Public
 */
router.post('/password/reset',
  passwordResetValidation,
  validate,
  authController.resetPassword
);

/**
 * @route   GET /auth/session
 * @desc    Verificar sesión actual
 * @access  Public (optional auth)
 */
router.get('/session',
  optionalAuth,
  authController.checkSession
);

// ===== RUTAS PROTEGIDAS =====

/**
 * @route   POST /auth/logout
 * @desc    Cerrar sesión
 * @access  Private
 */
router.post('/logout',
  authenticate,
  authController.logout
);

/**
 * @route   POST /auth/password/change
 * @desc    Cambiar contraseña (usuario autenticado)
 * @access  Private
 */
router.post('/password/change',
  authenticate,
  changePasswordValidation,
  validate,
  authController.changePassword
);

// ===== 2FA ROUTES =====

/**
 * @route   POST /auth/2fa/enable
 * @desc    Habilitar autenticación de dos factores
 * @access  Private
 */
router.post('/2fa/enable',
  authenticate,
  authController.enable2FA
);

/**
 * @route   POST /auth/2fa/confirm
 * @desc    Confirmar configuración 2FA
 * @access  Private
 */
router.post('/2fa/confirm',
  authenticate,
  twoFALimiter,
  twoFACodeValidation,
  validate,
  authController.confirm2FA
);

/**
 * @route   POST /auth/2fa/disable
 * @desc    Deshabilitar 2FA
 * @access  Private
 */
router.post('/2fa/disable',
  authenticate,
  [
    body('password')
      .notEmpty()
      .withMessage('Contraseña es requerida para deshabilitar 2FA')
  ],
  validate,
  authController.disable2FA
);

/**
 * @route   POST /auth/2fa/backup-codes
 * @desc    Regenerar códigos de respaldo 2FA
 * @access  Private
 */
router.post('/2fa/backup-codes',
  authenticate,
  [
    body('password')
      .notEmpty()
      .withMessage('Contraseña es requerida')
  ],
  validate,
  authController.regenerateBackupCodes
);

/**
 * @route   POST /auth/2fa/verify-backup
 * @desc    Verificar código de respaldo 2FA
 * @access  Private
 */
router.post('/2fa/verify-backup',
  authenticate,
  twoFALimiter,
  [
    body('backup_code')
      .isLength({ min: 8, max: 8 })
      .withMessage('Código de respaldo debe ser 8 caracteres')
  ],
  validate,
  authController.verifyBackupCode
);

// ===== SESSION MANAGEMENT =====

/**
 * @route   GET /auth/sessions
 * @desc    Listar sesiones activas del usuario
 * @access  Private
 */
router.get('/sessions',
  authenticate,
  authController.getUserSessions
);

/**
 * @route   DELETE /auth/sessions/:sessionId
 * @desc    Terminar sesión específica
 * @access  Private
 */
router.delete('/sessions/:sessionId',
  authenticate,
  [
    param('sessionId')
      .isUUID()
      .withMessage('Session ID debe ser UUID válido')
  ],
  validate,
  authController.terminateSession
);

/**
 * @route   DELETE /auth/sessions
 * @desc    Terminar todas las sesiones (excepto la actual)
 * @access  Private
 */
router.delete('/sessions',
  authenticate,
  authController.terminateAllSessions
);

// ===== DEVICE MANAGEMENT =====

/**
 * @route   GET /auth/devices
 * @desc    Listar dispositivos registrados del usuario
 * @access  Private
 */
router.get('/devices',
  authenticate,
  authController.getUserDevices
);

/**
 * @route   POST /auth/devices/register
 * @desc    Registrar nuevo dispositivo
 * @access  Private
 */
router.post('/devices/register',
  authenticate,
  [
    body('device_name')
      .isLength({ min: 1, max: 100 })
      .withMessage('Nombre del dispositivo es requerido'),
    body('device_type')
      .isIn(['ios', 'android', 'web', 'desktop'])
      .withMessage('Tipo de dispositivo inválido'),
    body('device_uuid')
      .isUUID()
      .withMessage('UUID del dispositivo debe ser válido'),
    body('push_token')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Push token muy largo')
  ],
  validate,
  authController.registerDevice
);

/**
 * @route   DELETE /auth/devices/:deviceId
 * @desc    Eliminar dispositivo registrado
 * @access  Private
 */
router.delete('/devices/:deviceId',
  authenticate,
  [
    param('deviceId')
      .isUUID()
      .withMessage('Device ID debe ser UUID válido')
  ],
  validate,
  authController.removeDevice
);

// ===== SECURITY LOGS =====

/**
 * @route   GET /auth/security/logs
 * @desc    Obtener logs de seguridad del usuario
 * @access  Private
 */
router.get('/security/logs',
  authenticate,
  authController.getSecurityLogs
);

/**
 * @route   GET /auth/security/failed-attempts
 * @desc    Obtener intentos fallidos de login
 * @access  Private
 */
router.get('/security/failed-attempts',
  authenticate,
  authController.getFailedLoginAttempts
);

// ===== ACCOUNT VERIFICATION =====

/**
 * @route   POST /auth/email/verify
 * @desc    Enviar email de verificación
 * @access  Private
 */
router.post('/email/verify',
  authenticate,
  authController.sendEmailVerification
);

/**
 * @route   GET /auth/email/confirm/:token
 * @desc    Confirmar email con token
 * @access  Public
 */
router.get('/email/confirm/:token',
  [
    param('token')
      .isLength({ min: 32, max: 128 })
      .withMessage('Token inválido')
  ],
  validate,
  authController.confirmEmail
);

// ===== HEALTH CHECK =====

/**
 * @route   GET /auth/health
 * @desc    Health check del servicio de auth
 * @access  Public
 */
router.get('/health',
  authController.healthCheck
);

export default router;