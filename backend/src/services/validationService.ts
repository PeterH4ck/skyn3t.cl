import { body, query, param, ValidationChain } from 'express-validator';
import { User } from '../models/User';
import { Community } from '../models/Community';
import { AppError } from '../utils/AppError';

class ValidationService {
  /**
   * Common validation rules
   */
  static get commonRules() {
    return {
      uuid: (field: string) => 
        body(field).isUUID().withMessage(`${field} debe ser un UUID válido`),
      
      email: (field: string = 'email') =>
        body(field).isEmail().withMessage('Email inválido'),
      
      password: (field: string = 'password', min: number = 6) =>
        body(field)
          .isLength({ min })
          .withMessage(`Password debe tener al menos ${min} caracteres`)
          .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
          .withMessage('Password debe contener al menos una mayúscula, una minúscula y un número'),
      
      phone: (field: string = 'phone') =>
        body(field)
          .optional()
          .isMobilePhone('any')
          .withMessage('Número de teléfono inválido'),
      
      name: (field: string, min: number = 2) =>
        body(field)
          .trim()
          .isLength({ min })
          .withMessage(`${field} debe tener al menos ${min} caracteres`)
          .matches(/^[a-zA-ZÀ-ÿ\s]+$/)
          .withMessage(`${field} solo puede contener letras y espacios`),
      
      pagination: () => [
        query('page')
          .optional()
          .isInt({ min: 1 })
          .withMessage('Page debe ser un número mayor a 0'),
        query('limit')
          .optional()
          .isInt({ min: 1, max: 100 })
          .withMessage('Limit debe estar entre 1 y 100')
      ],
      
      dateRange: () => [
        query('date_from')
          .optional()
          .isISO8601()
          .withMessage('date_from debe ser una fecha válida'),
        query('date_to')
          .optional()
          .isISO8601()
          .withMessage('date_to debe ser una fecha válida')
      ]
    };
  }

  /**
   * User validation rules
   */
  static get userValidation() {
    return {
      create: [
        this.commonRules.name('first_name'),
        this.commonRules.name('last_name'),
        this.commonRules.email(),
        body('username')
          .isLength({ min: 3, max: 50 })
          .withMessage('Username debe tener entre 3 y 50 caracteres')
          .matches(/^[a-zA-Z0-9_.-]+$/)
          .withMessage('Username solo puede contener letras, números, puntos, guiones y guiones bajos')
          .custom(async (value) => {
            const user = await User.findOne({ where: { username: value } });
            if (user) {
              throw new Error('Username ya está en uso');
            }
            return true;
          }),
        this.commonRules.password(),
        this.commonRules.phone(),
        body('document_type')
          .optional()
          .isIn(['id', 'passport', 'driver_license', 'residence_permit'])
          .withMessage('Tipo de documento inválido'),
        body('document_number')
          .optional()
          .isLength({ min: 5, max: 20 })
          .withMessage('Número de documento debe tener entre 5 y 20 caracteres'),
        body('birth_date')
          .optional()
          .isISO8601()
          .withMessage('Fecha de nacimiento inválida')
          .custom((value) => {
            const birthDate = new Date(value);
            const today = new Date();
            const age = today.getFullYear() - birthDate.getFullYear();
            if (age < 16 || age > 120) {
              throw new Error('Edad debe estar entre 16 y 120 años');
            }
            return true;
          })
      ],

      update: [
        this.commonRules.name('first_name').optional(),
        this.commonRules.name('last_name').optional(),
        this.commonRules.phone().optional(),
        body('status')
          .optional()
          .isIn(['active', 'inactive', 'suspended'])
          .withMessage('Status inválido'),
        body('document_type')
          .optional()
          .isIn(['id', 'passport', 'driver_license', 'residence_permit'])
          .withMessage('Tipo de documento inválido'),
        body('document_number')
          .optional()
          .isLength({ min: 5, max: 20 })
          .withMessage('Número de documento debe tener entre 5 y 20 caracteres')
      ],

      changePassword: [
        body('current_password')
          .notEmpty()
          .withMessage('Contraseña actual es requerida'),
        this.commonRules.password('new_password'),
        body('confirm_password')
          .custom((value, { req }) => {
            if (value !== req.body.new_password) {
              throw new Error('Las contraseñas no coinciden');
            }
            return true;
          })
      ],

      list: [
        ...this.commonRules.pagination(),
        query('search')
          .optional()
          .isLength({ min: 2 })
          .withMessage('Búsqueda debe tener al menos 2 caracteres'),
        query('status')
          .optional()
          .isIn(['active', 'inactive', 'suspended'])
          .withMessage('Status inválido'),
        query('sort')
          .optional()
          .isIn(['first_name', 'last_name', 'email', 'created_at', 'last_login'])
          .withMessage('Campo de ordenamiento inválido'),
        query('order')
          .optional()
          .isIn(['asc', 'desc'])
          .withMessage('Orden debe ser asc o desc')
      ]
    };
  }

  /**
   * Community validation rules
   */
  static get communityValidation() {
    return {
      create: [
        body('name')
          .isLength({ min: 3, max: 200 })
          .withMessage('Nombre debe tener entre 3 y 200 caracteres'),
        body('code')
          .isLength({ min: 3, max: 50 })
          .withMessage('Código debe tener entre 3 y 50 caracteres')
          .matches(/^[A-Z0-9_]+$/)
          .withMessage('Código solo puede contener letras mayúsculas, números y guiones bajos')
          .custom(async (value) => {
            const community = await Community.findOne({ where: { code: value } });
            if (community) {
              throw new Error('Código de comunidad ya está en uso');
            }
            return true;
          }),
        body('type')
          .isIn(['building', 'condominium', 'office_complex', 'mixed_use'])
          .withMessage('Tipo de comunidad inválido'),
        body('address')
          .isLength({ min: 10, max: 500 })
          .withMessage('Dirección debe tener entre 10 y 500 caracteres'),
        body('city')
          .isLength({ min: 2, max: 100 })
          .withMessage('Ciudad debe tener entre 2 y 100 caracteres'),
        body('country_id')
          .isUUID()
          .withMessage('ID de país debe ser un UUID válido'),
        body('timezone')
          .isLength({ min: 5, max: 50 })
          .withMessage('Zona horaria inválida'),
        this.commonRules.email('contact_email').optional(),
        this.commonRules.phone('contact_phone').optional()
      ],

      update: [
        body('name')
          .optional()
          .isLength({ min: 3, max: 200 })
          .withMessage('Nombre debe tener entre 3 y 200 caracteres'),
        body('address')
          .optional()
          .isLength({ min: 10, max: 500 })
          .withMessage('Dirección debe tener entre 10 y 500 caracteres'),
        body('city')
          .optional()
          .isLength({ min: 2, max: 100 })
          .withMessage('Ciudad debe tener entre 2 y 100 caracteres'),
        this.commonRules.email('contact_email').optional(),
        this.commonRules.phone('contact_phone').optional()
      ]
    };
  }

  /**
   * Device validation rules
   */
  static get deviceValidation() {
    return {
      create: [
        body('serial_number')
          .isLength({ min: 5, max: 100 })
          .withMessage('Número de serie debe tener entre 5 y 100 caracteres')
          .matches(/^[A-Z0-9-]+$/)
          .withMessage('Número de serie solo puede contener letras mayúsculas, números y guiones'),
        body('name')
          .isLength({ min: 3, max: 200 })
          .withMessage('Nombre debe tener entre 3 y 200 caracteres'),
        body('device_type_id')
          .isUUID()
          .withMessage('Tipo de dispositivo debe ser un UUID válido'),
        body('location')
          .optional()
          .isLength({ max: 500 })
          .withMessage('Ubicación no puede exceder 500 caracteres'),
        body('ip_address')
          .optional()
          .isIP()
          .withMessage('Dirección IP inválida'),
        body('mac_address')
          .optional()
          .isMACAddress()
          .withMessage('Dirección MAC inválida')
      ],

      command: [
        body('command')
          .isIn(['open_door', 'close_door', 'lock', 'unlock', 'restart', 'status', 'reset'])
          .withMessage('Comando inválido'),
        body('parameters')
          .optional()
          .isObject()
          .withMessage('Parámetros deben ser un objeto'),
        body('priority')
          .optional()
          .isInt({ min: 0, max: 10 })
          .withMessage('Prioridad debe estar entre 0 y 10')
      ]
    };
  }

  /**
   * Access validation rules
   */
  static get accessValidation() {
    return {
      authorize: [
        body('access_point_id')
          .isUUID()
          .withMessage('ID de punto de acceso debe ser un UUID válido'),
        body('user_id')
          .optional()
          .isUUID()
          .withMessage('ID de usuario debe ser un UUID válido'),
        body('reason')
          .optional()
          .isLength({ min: 5, max: 500 })
          .withMessage('Razón debe tener entre 5 y 500 caracteres'),
        body('duration_seconds')
          .optional()
          .isInt({ min: 1, max: 3600 })
          .withMessage('Duración debe estar entre 1 y 3600 segundos')
      ],

      logs: [
        ...this.commonRules.pagination(),
        ...this.commonRules.dateRange(),
        query('access_point_id')
          .optional()
          .isUUID()
          .withMessage('ID de punto de acceso debe ser un UUID válido'),
        query('user_id')
          .optional()
          .isUUID()
          .withMessage('ID de usuario debe ser un UUID válido'),
        query('granted')
          .optional()
          .isBoolean()
          .withMessage('Granted debe ser true o false'),
        query('method')
          .optional()
          .isIn(['app', 'card', 'fingerprint', 'facial', 'plate', 'qr', 'pin'])
          .withMessage('Método de acceso inválido')
      ]
    };
  }

  /**
   * Invitation validation rules
   */
  static get invitationValidation() {
    return {
      create: [
        body('guest_name')
          .isLength({ min: 2, max: 200 })
          .withMessage('Nombre del invitado debe tener entre 2 y 200 caracteres'),
        this.commonRules.email('guest_email').optional(),
        this.commonRules.phone('guest_phone').optional(),
        body('valid_from')
          .isISO8601()
          .withMessage('Fecha de inicio inválida'),
        body('valid_until')
          .isISO8601()
          .withMessage('Fecha de fin inválida')
          .custom((value, { req }) => {
            const validFrom = new Date(req.body.valid_from);
            const validUntil = new Date(value);
            if (validUntil <= validFrom) {
              throw new Error('Fecha de fin debe ser posterior a fecha de inicio');
            }
            return true;
          }),
        body('max_uses')
          .optional()
          .isInt({ min: 1, max: 100 })
          .withMessage('Máximo de usos debe estar entre 1 y 100'),
        body('notes')
          .optional()
          .isLength({ max: 1000 })
          .withMessage('Notas no pueden exceder 1000 caracteres')
      ]
    };
  }

  /**
   * Maintenance request validation rules
   */
  static get maintenanceValidation() {
    return {
      create: [
        body('category')
          .isIn(['plumbing', 'electrical', 'hvac', 'appliance', 'structural', 'cleaning', 'landscaping', 'security', 'other'])
          .withMessage('Categoría inválida'),
        body('priority')
          .optional()
          .isIn(['low', 'normal', 'high', 'urgent', 'emergency'])
          .withMessage('Prioridad inválida'),
        body('title')
          .isLength({ min: 5, max: 300 })
          .withMessage('Título debe tener entre 5 y 300 caracteres'),
        body('description')
          .isLength({ min: 10, max: 2000 })
          .withMessage('Descripción debe tener entre 10 y 2000 caracteres'),
        body('location')
          .optional()
          .isLength({ max: 500 })
          .withMessage('Ubicación no puede exceder 500 caracteres'),
        body('scheduled_date')
          .optional()
          .isISO8601()
          .withMessage('Fecha programada inválida'),
        body('estimated_cost')
          .optional()
          .isFloat({ min: 0 })
          .withMessage('Costo estimado debe ser un número positivo')
      ],

      update: [
        body('status')
          .optional()
          .isIn(['pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'on_hold'])
          .withMessage('Estado inválido'),
        body('assigned_to')
          .optional()
          .isUUID()
          .withMessage('Asignado a debe ser un UUID válido'),
        body('completion_notes')
          .optional()
          .isLength({ max: 2000 })
          .withMessage('Notas de finalización no pueden exceder 2000 caracteres'),
        body('actual_cost')
          .optional()
          .isFloat({ min: 0 })
          .withMessage('Costo real debe ser un número positivo'),
        body('satisfaction_rating')
          .optional()
          .isInt({ min: 1, max: 5 })
          .withMessage('Calificación debe estar entre 1 y 5')
      ]
    };
  }

  /**
   * Financial validation rules
   */
  static get financialValidation() {
    return {
      payment: [
        body('amount')
          .isFloat({ min: 0.01 })
          .withMessage('Monto debe ser mayor a 0'),
        body('currency')
          .isIn(['CLP', 'USD', 'EUR'])
          .withMessage('Moneda inválida'),
        body('payment_method')
          .isIn(['bank_transfer', 'credit_card', 'debit_card', 'paypal', 'cash'])
          .withMessage('Método de pago inválido'),
        body('description')
          .optional()
          .isLength({ max: 500 })
          .withMessage('Descripción no puede exceder 500 caracteres')
      ],

      expense: [
        body('description')
          .isLength({ min: 5, max: 300 })
          .withMessage('Descripción debe tener entre 5 y 300 caracteres'),
        body('amount')
          .isFloat({ min: 0.01 })
          .withMessage('Monto debe ser mayor a 0'),
        body('category')
          .isIn(['administration', 'maintenance', 'utilities', 'security', 'cleaning', 'insurance', 'other'])
          .withMessage('Categoría inválida'),
        body('due_date')
          .isISO8601()
          .withMessage('Fecha de vencimiento inválida')
      ]
    };
  }

  /**
   * Custom validators
   */
  static customValidators = {
    /**
     * Check if user exists and is active
     */
    userExists: (field: string = 'user_id') =>
      body(field)
        .isUUID()
        .withMessage(`${field} debe ser un UUID válido`)
        .custom(async (value) => {
          const user = await User.findByPk(value);
          if (!user) {
            throw new Error('Usuario no encontrado');
          }
          if (user.status !== 'active') {
            throw new Error('Usuario no está activo');
          }
          return true;
        }),

    /**
     * Check if community exists and is active
     */
    communityExists: (field: string = 'community_id') =>
      body(field)
        .isUUID()
        .withMessage(`${field} debe ser un UUID válido`)
        .custom(async (value) => {
          const community = await Community.findByPk(value);
          if (!community) {
            throw new Error('Comunidad no encontrada');
          }
          if (!community.is_active) {
            throw new Error('Comunidad no está activa');
          }
          return true;
        }),

    /**
     * Validate Chilean RUT
     */
    chileanRUT: (field: string) =>
      body(field)
        .optional()
        .matches(/^[0-9]+-[0-9kK]{1}$/)
        .withMessage('RUT inválido')
        .custom((value) => {
          if (!value) return true;
          
          const [num, dv] = value.split('-');
          let suma = 0;
          let multiplicador = 2;
          
          for (let i = num.length - 1; i >= 0; i--) {
            suma += parseInt(num[i]) * multiplicador;
            multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
          }
          
          const resto = suma % 11;
          const dvCalculado = resto === 0 ? '0' : resto === 1 ? 'k' : (11 - resto).toString();
          
          if (dv.toLowerCase() !== dvCalculado) {
            throw new Error('RUT inválido');
          }
          
          return true;
        }),

    /**
     * Validate time format (HH:MM)
     */
    timeFormat: (field: string) =>
      body(field)
        .optional()
        .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
        .withMessage(`${field} debe tener formato HH:MM`),

    /**
     * Validate file upload
     */
    fileUpload: (allowedTypes: string[], maxSize: number = 5) =>
      body('file')
        .custom((value, { req }) => {
          if (!req.file) {
            throw new Error('Archivo es requerido');
          }
          
          if (!allowedTypes.includes(req.file.mimetype)) {
            throw new Error(`Tipo de archivo no permitido. Permitidos: ${allowedTypes.join(', ')}`);
          }
          
          const maxSizeBytes = maxSize * 1024 * 1024; // Convert MB to bytes
          if (req.file.size > maxSizeBytes) {
            throw new Error(`Archivo muy grande. Máximo: ${maxSize}MB`);
          }
          
          return true;
        })
  };

  /**
   * Sanitize input data
   */
  static sanitizeInput(data: any): any {
    if (typeof data === 'string') {
      return data.trim().replace(/[<>]/g, '');
    }
    
    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeInput(item));
    }
    
    if (typeof data === 'object' && data !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        sanitized[key] = this.sanitizeInput(value);
      }
      return sanitized;
    }
    
    return data;
  }

  /**
   * Validate and sanitize request body
   */
  static validateAndSanitize = (validationRules: ValidationChain[]) => {
    return [
      ...validationRules,
      (req: any, res: any, next: any) => {
        req.body = this.sanitizeInput(req.body);
        next();
      }
    ];
  };
}

export { ValidationService };