import { body, param, query, ValidationChain } from 'express-validator';
import { REGEX_PATTERNS } from '../config/constants';

// Common validators
export const validators = {
  // ID validators
  uuid: (field: string): ValidationChain => 
    param(field).isUUID().withMessage(`${field} must be a valid UUID`),
  
  uuidBody: (field: string): ValidationChain =>
    body(field).isUUID().withMessage(`${field} must be a valid UUID`),

  // String validators
  requiredString: (field: string, min = 1, max = 255): ValidationChain =>
    body(field)
      .trim()
      .notEmpty().withMessage(`${field} is required`)
      .isLength({ min, max }).withMessage(`${field} must be between ${min} and ${max} characters`),

  optionalString: (field: string, max = 255): ValidationChain =>
    body(field)
      .optional()
      .trim()
      .isLength({ max }).withMessage(`${field} must be less than ${max} characters`),

  // Email validator
  email: (field = 'email'): ValidationChain =>
    body(field)
      .trim()
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Must be a valid email')
      .normalizeEmail(),

  // Password validator
  password: (field = 'password'): ValidationChain =>
    body(field)
      .notEmpty().withMessage('Password is required')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(REGEX_PATTERNS.PASSWORD)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),

  // Phone validator
  phone: (field = 'phone'): ValidationChain =>
    body(field)
      .optional()
      .trim()
      .matches(REGEX_PATTERNS.PHONE)
      .withMessage('Must be a valid phone number'),

  // Username validator
  username: (field = 'username'): ValidationChain =>
    body(field)
      .trim()
      .notEmpty().withMessage('Username is required')
      .matches(REGEX_PATTERNS.USERNAME)
      .withMessage('Username must be 3-30 characters and contain only letters, numbers, underscores, and hyphens'),

  // Date validators
  date: (field: string): ValidationChain =>
    body(field)
      .notEmpty().withMessage(`${field} is required`)
      .isISO8601().withMessage(`${field} must be a valid date`),

  optionalDate: (field: string): ValidationChain =>
    body(field)
      .optional()
      .isISO8601().withMessage(`${field} must be a valid date`),

  // Number validators
  integer: (field: string, min?: number, max?: number): ValidationChain => {
    let validator = body(field)
      .notEmpty().withMessage(`${field} is required`)
      .isInt().withMessage(`${field} must be an integer`);
    
    if (min !== undefined) {
      validator = validator.isInt({ min }).withMessage(`${field} must be at least ${min}`);
    }
    if (max !== undefined) {
      validator = validator.isInt({ max }).withMessage(`${field} must be at most ${max}`);
    }
    
    return validator;
  },

  decimal: (field: string, decimals = 2): ValidationChain =>
    body(field)
      .notEmpty().withMessage(`${field} is required`)
      .isDecimal({ decimal_digits: `0,${decimals}` })
      .withMessage(`${field} must be a decimal with maximum ${decimals} decimal places`),

  // Boolean validator
  boolean: (field: string): ValidationChain =>
    body(field)
      .optional()
      .isBoolean().withMessage(`${field} must be a boolean`),

  // Array validators
  array: (field: string, min = 0): ValidationChain =>
    body(field)
      .isArray({ min }).withMessage(`${field} must be an array with at least ${min} items`),

  arrayOfStrings: (field: string): ValidationChain =>
    body(field)
      .isArray().withMessage(`${field} must be an array`)
      .custom((values) => values.every((v: any) => typeof v === 'string'))
      .withMessage(`${field} must contain only strings`),

  arrayOfUUIDs: (field: string): ValidationChain =>
    body(field)
      .isArray().withMessage(`${field} must be an array`)
      .custom((values) => values.every((v: any) => 
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
      ))
      .withMessage(`${field} must contain only valid UUIDs`),

  // JSON validator
  json: (field: string): ValidationChain =>
    body(field)
      .optional()
      .isJSON().withMessage(`${field} must be valid JSON`),

  // Enum validator
  enum: (field: string, values: string[]): ValidationChain =>
    body(field)
      .notEmpty().withMessage(`${field} is required`)
      .isIn(values).withMessage(`${field} must be one of: ${values.join(', ')}`),

  optionalEnum: (field: string, values: string[]): ValidationChain =>
    body(field)
      .optional()
      .isIn(values).withMessage(`${field} must be one of: ${values.join(', ')}`),

  // Pagination validators
  page: (): ValidationChain =>
    query('page')
      .optional()
      .isInt({ min: 1 }).withMessage('Page must be a positive integer'),

  limit: (): ValidationChain =>
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),

  sort: (allowedFields: string[]): ValidationChain =>
    query('sort')
      .optional()
      .custom((value) => {
        const field = value.replace(/^-/, '');
        return allowedFields.includes(field);
      })
      .withMessage(`Sort field must be one of: ${allowedFields.join(', ')}`),

  // Search validator
  search: (): ValidationChain =>
    query('search')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 }).withMessage('Search term must be between 1 and 100 characters'),

  // Chilean RUT validator
  rut: (field = 'rut'): ValidationChain =>
    body(field)
      .optional()
      .trim()
      .matches(REGEX_PATTERNS.CHILEAN_RUT)
      .withMessage('Must be a valid Chilean RUT')
      .custom((value) => validateRUT(value))
      .withMessage('Invalid RUT'),

  // License plate validator
  licensePlate: (field = 'plate_number'): ValidationChain =>
    body(field)
      .trim()
      .notEmpty().withMessage('License plate is required')
      .matches(REGEX_PATTERNS.PLATE_NUMBER)
      .withMessage('Must be a valid license plate number')
};

// Validation schemas for common operations
export const validationSchemas = {
  // Authentication
  login: [
    body('username').trim().notEmpty().withMessage('Username or email is required'),
    body('password').notEmpty().withMessage('Password is required'),
    validators.boolean('remember')
  ],

  register: [
    validators.email(),
    validators.username(),
    validators.password(),
    validators.requiredString('first_name', 1, 100),
    validators.requiredString('last_name', 1, 100),
    validators.phone(),
    validators.optionalString('document_number', 50)
  ],

  changePassword: [
    body('current_password').notEmpty().withMessage('Current password is required'),
    validators.password('new_password'),
    body('confirm_password')
      .notEmpty().withMessage('Password confirmation is required')
      .custom((value, { req }) => value === req.body.new_password)
      .withMessage('Passwords do not match')
  ],

  forgotPassword: [
    validators.email()
  ],

  resetPassword: [
    body('token').notEmpty().withMessage('Reset token is required'),
    validators.password('password'),
    body('confirm_password')
      .notEmpty().withMessage('Password confirmation is required')
      .custom((value, { req }) => value === req.body.password)
      .withMessage('Passwords do not match')
  ],

  // User management
  createUser: [
    validators.email(),
    validators.username(),
    validators.password(),
    validators.requiredString('first_name', 1, 100),
    validators.requiredString('last_name', 1, 100),
    validators.phone(),
    validators.optionalString('document_number', 50),
    validators.arrayOfUUIDs('role_ids').optional(),
    validators.uuidBody('community_id').optional()
  ],

  updateUser: [
    validators.uuid('id'),
    validators.email().optional(),
    validators.username().optional(),
    validators.optionalString('first_name', 100),
    validators.optionalString('last_name', 100),
    validators.phone(),
    validators.optionalString('document_number', 50),
    validators.optionalEnum('status', ['active', 'inactive', 'suspended'])
  ],

  // Community management
  createCommunity: [
    validators.requiredString('code', 1, 50),
    validators.requiredString('name', 1, 200),
    validators.enum('type', ['building', 'condominium', 'office', 'industrial', 'gated_community']),
    validators.uuidBody('country_id'),
    validators.requiredString('address'),
    validators.requiredString('city', 1, 100),
    validators.requiredString('timezone', 1, 50),
    validators.email('contact_email').optional(),
    validators.phone('contact_phone')
  ],

  // Pagination
  pagination: [
    validators.page(),
    validators.limit(),
    query('order').optional().isIn(['ASC', 'DESC']).withMessage('Order must be ASC or DESC')
  ]
};

// Helper function to validate Chilean RUT
function validateRUT(rut: string): boolean {
  if (!rut) return false;

  // Clean RUT
  const cleanRUT = rut.replace(/\./g, '').replace('-', '');
  const body = cleanRUT.slice(0, -1);
  const dv = cleanRUT.slice(-1).toUpperCase();

  // Calculate verification digit
  let sum = 0;
  let multiplier = 2;

  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const expectedDV = 11 - (sum % 11);
  const calculatedDV = expectedDV === 11 ? '0' : expectedDV === 10 ? 'K' : expectedDV.toString();

  return dv === calculatedDV;
}

// Export individual validator functions for custom use
export const validateEmail = (email: string): boolean => {
  return REGEX_PATTERNS.EMAIL.test(email);
};

export const validatePhone = (phone: string): boolean => {
  return REGEX_PATTERNS.PHONE.test(phone);
};

export const validateUsername = (username: string): boolean => {
  return REGEX_PATTERNS.USERNAME.test(username);
};

export const validatePassword = (password: string): boolean => {
  return REGEX_PATTERNS.PASSWORD.test(password);
};

export const validatePlateNumber = (plate: string): boolean => {
  return REGEX_PATTERNS.PLATE_NUMBER.test(plate);
};