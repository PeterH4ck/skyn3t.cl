// backend/src/utils/AppError.ts
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(message: string, statusCode: number = 500, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

// backend/src/utils/logger.ts
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const logDir = process.env.LOG_DIR || 'logs';

// Formato personalizado
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    
    return msg;
  })
);

// Transporte para archivos con rotación
const fileRotateTransport = new DailyRotateFile({
  filename: path.join(logDir, 'application-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: logFormat
});

// Transporte para errores
const errorFileRotateTransport = new DailyRotateFile({
  filename: path.join(logDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  level: 'error',
  format: logFormat
});

// Crear logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    fileRotateTransport,
    errorFileRotateTransport
  ]
});

// En desarrollo, también log a consola
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// backend/src/utils/pagination.ts
export interface PaginationParams {
  page: number;
  size: number;
}

export interface PaginationResult {
  limit: number;
  offset: number;
}

export interface PagingData<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export const getPagination = (page: number, size: number): PaginationResult => {
  const limit = size;
  const offset = (page - 1) * limit;
  
  return { limit, offset };
};

export const getPagingData = <T>(
  data: { rows: T[]; count: number },
  page: number,
  limit: number
): PagingData<T> => {
  const { count: total, rows: items } = data;
  const pages = Math.ceil(total / limit);
  const hasNext = page < pages;
  const hasPrev = page > 1;

  return {
    items,
    total,
    page,
    size: limit,
    pages,
    hasNext,
    hasPrev
  };
};

// backend/src/utils/permissions.ts
import { User } from '../models/User';
import { cache, cacheKeys, cacheTTL } from '../config/redis';

export async function checkUserPermission(
  userId: string,
  permissionCode: string,
  communityId?: string
): Promise<boolean> {
  // Intentar obtener de caché
  const cacheKey = cacheKeys.userPermissions(userId, communityId);
  let permissions = await cache.get(cacheKey);

  if (!permissions) {
    // Obtener de base de datos
    const user = await User.findByPk(userId);
    if (!user) return false;

    const userPermissions = await user.getEffectivePermissions(communityId);
    permissions = userPermissions.map(p => p.code);

    // Guardar en caché
    await cache.set(cacheKey, permissions, cacheTTL.medium);
  }

  return permissions.includes(permissionCode);
}

export async function checkUserRole(
  userId: string,
  roleCode: string,
  communityId?: string
): Promise<boolean> {
  const user = await User.findByPk(userId);
  if (!user) return false;

  return user.hasRole(roleCode, communityId);
}

// backend/src/utils/crypto.ts
import crypto from 'crypto';

const algorithm = 'aes-256-gcm';
const secretKey = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  
  const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

export function generateRandomToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// backend/src/utils/validators.ts
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone);
}

export function isValidChileanRUT(rut: string): boolean {
  if (!rut || rut.length < 8) return false;
  
  const cleanRUT = rut.replace(/[.-]/g, '');
  const body = cleanRUT.slice(0, -1);
  const dv = cleanRUT.slice(-1).toUpperCase();
  
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

export function isValidLicensePlate(plate: string, countryCode: string = 'CL'): boolean {
  const patterns: Record<string, RegExp> = {
    CL: /^[A-Z]{2}[A-Z]{2}[0-9]{2}$|^[A-Z]{2}[0-9]{3}$/, // Chile: BBBB99 o BB999
    AR: /^[A-Z]{3}[0-9]{3}$|^[A-Z]{2}[0-9]{3}[A-Z]{2}$/, // Argentina
    BR: /^[A-Z]{3}[0-9]{1}[A-Z]{1}[0-9]{2}$|^[A-Z]{3}[0-9]{4}$/, // Brasil
  };
  
  const pattern = patterns[countryCode];
  if (!pattern) return false;
  
  return pattern.test(plate.toUpperCase());
}

// backend/src/utils/dates.ts
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import 'dayjs/locale/es';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('es');

export function formatDate(date: Date | string, format: string = 'DD/MM/YYYY'): string {
  return dayjs(date).format(format);
}

export function formatDateTime(date: Date | string, timezone: string = 'America/Santiago'): string {
  return dayjs(date).tz(timezone).format('DD/MM/YYYY HH:mm:ss');
}

export function getStartOfDay(date: Date = new Date()): Date {
  return dayjs(date).startOf('day').toDate();
}

export function getEndOfDay(date: Date = new Date()): Date {
  return dayjs(date).endOf('day').toDate();
}

export function addDays(date: Date, days: number): Date {
  return dayjs(date).add(days, 'day').toDate();
}

export function diffInDays(date1: Date, date2: Date): number {
  return dayjs(date1).diff(dayjs(date2), 'day');
}

export function isExpired(date: Date | string): boolean {
  return dayjs().isAfter(dayjs(date));
}

// backend/src/utils/cronJobs.ts
import cron from 'node-cron';
import { logger } from './logger';
import { Device } from '../models/Device';

export function startCronJobs() {
  // Actualizar estado de dispositivos offline cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    try {
      const updatedCount = await Device.updateOfflineStatuses();
      logger.info(`Updated ${updatedCount} devices to offline status`);
    } catch (error) {
      logger.error('Error updating device statuses:', error);
    }
  });

  // Limpiar sesiones expiradas cada hora
  cron.schedule('0 * * * *', async () => {
    try {
      // TODO: Implementar limpieza de sesiones
      logger.info('Cleaning expired sessions...');
    } catch (error) {
      logger.error('Error cleaning sessions:', error);
    }
  });

  // Generar gastos comunes el día 25 de cada mes
  cron.schedule('0 0 25 * *', async () => {
    try {
      // TODO: Implementar generación de gastos comunes
      logger.info('Generating monthly common expenses...');
    } catch (error) {
      logger.error('Error generating common expenses:', error);
    }
  });

  logger.info('✅ Cron jobs initialized');
}