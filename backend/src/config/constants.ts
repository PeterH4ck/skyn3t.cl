// =====================================================
// SKYN3T ACCESS CONTROL - SYSTEM CONSTANTS
// =====================================================

// System Information
export const SYSTEM_NAME = 'SKYN3T Access Control';
export const SYSTEM_VERSION = '2.0.0';
export const API_VERSION = 'v1';

// Authentication
export const AUTH = {
  JWT_EXPIRY: '15m',
  REFRESH_TOKEN_EXPIRY: '7d',
  JWT_EXPIRY_REMEMBER: '7d',
  REFRESH_TOKEN_EXPIRY_REMEMBER: '30d',
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 30 * 60 * 1000, // 30 minutes
  PASSWORD_RESET_EXPIRY: 60 * 60 * 1000, // 1 hour
  EMAIL_VERIFICATION_EXPIRY: 24 * 60 * 60 * 1000, // 24 hours
  TWO_FACTOR_WINDOW: 2,
  SESSION_TIMEOUT: 15 * 60 * 1000, // 15 minutes
  BCRYPT_ROUNDS: 10
};

// Rate Limiting
export const RATE_LIMITS = {
  GLOBAL: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100
  },
  AUTH: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5
  },
  API: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60
  },
  UPLOAD: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10
  }
};

// File Upload
export const UPLOAD = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_AVATAR_SIZE: 2 * 1024 * 1024, // 2MB
  MAX_DOCUMENT_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'image/jpeg', 'image/png'],
  IMAGE_QUALITY: 85,
  THUMBNAIL_SIZE: { width: 200, height: 200 },
  AVATAR_SIZE: { width: 400, height: 400 }
};

// Pagination
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  DEFAULT_SORT: 'created_at',
  DEFAULT_ORDER: 'DESC' as const
};

// Cache TTL (seconds)
export const CACHE_TTL = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  DAY: 86400, // 1 day
  WEEK: 604800, // 1 week
  MONTH: 2592000 // 30 days
};

// WebSocket Events
export const WS_EVENTS = {
  // Connection
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  ERROR: 'error',
  
  // Authentication
  AUTH_SUCCESS: 'auth.success',
  AUTH_ERROR: 'auth.error',
  
  // Permissions
  PERMISSIONS_UPDATED: 'permissions.updated',
  PERMISSION_GRANTED: 'permission.granted',
  PERMISSION_REVOKED: 'permission.revoked',
  
  // Features
  FEATURE_TOGGLED: 'feature.toggled',
  FEATURE_UPDATED: 'feature.updated',
  
  // Access
  ACCESS_GRANTED: 'access.granted',
  ACCESS_DENIED: 'access.denied',
  ACCESS_LOG: 'access.log',
  
  // Devices
  DEVICE_ONLINE: 'device.online',
  DEVICE_OFFLINE: 'device.offline',
  DEVICE_STATUS: 'device.status',
  DEVICE_ALERT: 'device.alert',
  DEVICE_COMMAND: 'device.command',
  
  // Notifications
  NOTIFICATION_NEW: 'notification.new',
  NOTIFICATION_READ: 'notification.read',
  
  // Real-time updates
  ENTITY_CREATED: 'entity.created',
  ENTITY_UPDATED: 'entity.updated',
  ENTITY_DELETED: 'entity.deleted'
};

// MQTT Topics
export const MQTT_TOPICS = {
  // Device topics
  DEVICE_STATUS: 'device/+/status',
  DEVICE_COMMAND: 'device/+/command',
  DEVICE_RESPONSE: 'device/+/response',
  DEVICE_TELEMETRY: 'device/+/telemetry',
  
  // Access topics
  ACCESS_REQUEST: 'access/+/request',
  ACCESS_GRANT: 'access/+/grant',
  ACCESS_DENY: 'access/+/deny',
  
  // System topics
  SYSTEM_HEARTBEAT: 'system/heartbeat',
  SYSTEM_ALERT: 'system/alert',
  SYSTEM_UPDATE: 'system/update'
};

// Device Status
export const DEVICE_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  ERROR: 'error',
  MAINTENANCE: 'maintenance'
};

// Access Methods
export const ACCESS_METHODS = {
  APP: 'app',
  CARD: 'card',
  FINGERPRINT: 'fingerprint',
  FACIAL: 'facial',
  PLATE: 'plate',
  QR: 'qr',
  PIN: 'pin'
};

// User Status
export const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
  DELETED: 'deleted'
};

// Payment Status
export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded'
};

// Notification Channels
export const NOTIFICATION_CHANNELS = {
  EMAIL: 'email',
  SMS: 'sms',
  WHATSAPP: 'whatsapp',
  PUSH: 'push',
  IN_APP: 'in_app'
};

// Risk Levels
export const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

// Date Formats
export const DATE_FORMATS = {
  DATE: 'YYYY-MM-DD',
  TIME: 'HH:mm:ss',
  DATETIME: 'YYYY-MM-DD HH:mm:ss',
  DISPLAY_DATE: 'DD/MM/YYYY',
  DISPLAY_DATETIME: 'DD/MM/YYYY HH:mm'
};

// Regex Patterns
export const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[\d\s-()]+$/,
  USERNAME: /^[a-zA-Z0-9_-]{3,30}$/,
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  CHILEAN_RUT: /^\d{1,2}\.\d{3}\.\d{3}[-][0-9kK]{1}$/,
  PLATE_NUMBER: /^[A-Z]{2,4}[\s-]?\d{2,4}$/
};

// Error Codes
export const ERROR_CODES = {
  // Authentication errors (1000-1099)
  INVALID_CREDENTIALS: 'E1000',
  ACCOUNT_LOCKED: 'E1001',
  TOKEN_EXPIRED: 'E1002',
  TOKEN_INVALID: 'E1003',
  UNAUTHORIZED: 'E1004',
  TWO_FACTOR_REQUIRED: 'E1005',
  TWO_FACTOR_INVALID: 'E1006',
  
  // Permission errors (1100-1199)
  PERMISSION_DENIED: 'E1100',
  ROLE_NOT_FOUND: 'E1101',
  INSUFFICIENT_PRIVILEGES: 'E1102',
  
  // Validation errors (1200-1299)
  VALIDATION_ERROR: 'E1200',
  INVALID_INPUT: 'E1201',
  MISSING_REQUIRED_FIELD: 'E1202',
  DUPLICATE_ENTRY: 'E1203',
  
  // Resource errors (1300-1399)
  RESOURCE_NOT_FOUND: 'E1300',
  RESOURCE_ALREADY_EXISTS: 'E1301',
  RESOURCE_LOCKED: 'E1302',
  
  // System errors (1400-1499)
  INTERNAL_ERROR: 'E1400',
  DATABASE_ERROR: 'E1401',
  CACHE_ERROR: 'E1402',
  EXTERNAL_SERVICE_ERROR: 'E1403',
  
  // Rate limit errors (1500-1599)
  RATE_LIMIT_EXCEEDED: 'E1500',
  QUOTA_EXCEEDED: 'E1501'
};

// HTTP Status Messages
export const HTTP_MESSAGES = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable'
};

// System Roles (Level 1-11)
export const SYSTEM_ROLES = {
  SUPER_ADMIN: { code: 'SUPER_ADMIN', level: 1 },
  SYSTEM_ADMIN: { code: 'SYSTEM_ADMIN', level: 2 },
  FINANCIAL_ADMIN: { code: 'FINANCIAL_ADMIN', level: 3 },
  HARDWARE_ADMIN: { code: 'HARDWARE_ADMIN', level: 4 },
  SECURITY_ADMIN: { code: 'SECURITY_ADMIN', level: 5 },
  AUDIT_ADMIN: { code: 'AUDIT_ADMIN', level: 6 },
  OPERATIONS_MANAGER: { code: 'OPERATIONS_MANAGER', level: 7 },
  COMMUNITY_MANAGER: { code: 'COMMUNITY_MANAGER', level: 8 },
  SUPPORT_SUPERVISOR: { code: 'SUPPORT_SUPERVISOR', level: 9 },
  SUPPORT_AGENT: { code: 'SUPPORT_AGENT', level: 10 },
  REPORT_VIEWER: { code: 'REPORT_VIEWER', level: 11 }
};

// Community Roles (Level 1-11)
export const COMMUNITY_ROLES = {
  COMMUNITY_ADMIN: { code: 'COMMUNITY_ADMIN', level: 1 },
  BOARD_PRESIDENT: { code: 'BOARD_PRESIDENT', level: 2 },
  TREASURER: { code: 'TREASURER', level: 3 },
  BOARD_MEMBER: { code: 'BOARD_MEMBER', level: 4 },
  SECURITY_CHIEF: { code: 'SECURITY_CHIEF', level: 5 },
  SECURITY_GUARD: { code: 'SECURITY_GUARD', level: 6 },
  MAINTENANCE_CHIEF: { code: 'MAINTENANCE_CHIEF', level: 7 },
  STAFF: { code: 'STAFF', level: 8 },
  OWNER: { code: 'OWNER', level: 9 },
  TENANT: { code: 'TENANT', level: 10 },
  AUTHORIZED_PERSON: { code: 'AUTHORIZED_PERSON', level: 11 }
};

// Default Settings
export const DEFAULT_SETTINGS = {
  TIMEZONE: 'America/Santiago',
  LANGUAGE: 'es',
  CURRENCY: 'CLP',
  DATE_FORMAT: 'DD/MM/YYYY',
  TIME_FORMAT: 'HH:mm',
  FIRST_DAY_OF_WEEK: 1, // Monday
  DECIMAL_SEPARATOR: ',',
  THOUSAND_SEPARATOR: '.'
};