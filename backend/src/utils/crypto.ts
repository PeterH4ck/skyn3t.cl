// =====================================================
// CRYPTO UTILITIES - SKYN3T ACCESS CONTROL
// =====================================================
// Utilidades de criptografía y seguridad para el sistema

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { logger } from './logger';

// Configuración de encriptación
const ENCRYPTION_CONFIG = {
  algorithm: 'aes-256-gcm',
  keyLength: 32,
  ivLength: 16,
  tagLength: 16,
  saltLength: 32,
  iterations: 100000
};

// Configuración de JWT
const JWT_CONFIG = {
  algorithm: 'HS256' as const,
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
  issuer: 'skyn3t-access-control',
  audience: 'skyn3t-users'
};

/**
 * Interface para datos encriptados
 */
export interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
  salt?: string;
}

/**
 * Interface para payload JWT
 */
export interface JWTPayload {
  userId: string;
  username: string;
  email: string;
  roles: string[];
  communityId?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

/**
 * Clase principal para operaciones criptográficas
 */
export class CryptoService {
  private static instance: CryptoService;
  private encryptionKey: Buffer;

  private constructor() {
    // Inicializar clave de encriptación desde variable de entorno
    const key = process.env.ENCRYPTION_KEY;
    if (!key || key.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
    }
    this.encryptionKey = Buffer.from(key.slice(0, 32), 'utf8');
  }

  public static getInstance(): CryptoService {
    if (!CryptoService.instance) {
      CryptoService.instance = new CryptoService();
    }
    return CryptoService.instance;
  }

  /**
   * Generar hash seguro de contraseña
   */
  async hashPassword(password: string): Promise<string> {
    try {
      const saltRounds = 12;
      return await bcrypt.hash(password, saltRounds);
    } catch (error) {
      logger.error('Error hashing password:', error);
      throw new Error('Error al procesar contraseña');
    }
  }

  /**
   * Verificar contraseña contra hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      logger.error('Error verifying password:', error);
      return false;
    }
  }

  /**
   * Encriptar datos sensibles
   */
  encrypt(text: string, useRandomKey = false): EncryptedData {
    try {
      const iv = crypto.randomBytes(ENCRYPTION_CONFIG.ivLength);
      let key = this.encryptionKey;
      let salt: Buffer | undefined;

      // Usar clave derivada si se especifica
      if (useRandomKey) {
        salt = crypto.randomBytes(ENCRYPTION_CONFIG.saltLength);
        key = crypto.pbkdf2Sync(
          this.encryptionKey, 
          salt, 
          ENCRYPTION_CONFIG.iterations, 
          ENCRYPTION_CONFIG.keyLength, 
          'sha256'
        );
      }

      const cipher = crypto.createCipher(ENCRYPTION_CONFIG.algorithm, key);
      cipher.setAAD(Buffer.from('skyn3t-additional-data'));

      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const tag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        salt: salt?.toString('hex')
      };
    } catch (error) {
      logger.error('Error encrypting data:', error);
      throw new Error('Error al encriptar datos');
    }
  }

  /**
   * Desencriptar datos
   */
  decrypt(encryptedData: EncryptedData): string {
    try {
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const tag = Buffer.from(encryptedData.tag, 'hex');
      let key = this.encryptionKey;

      // Usar clave derivada si hay salt
      if (encryptedData.salt) {
        const salt = Buffer.from(encryptedData.salt, 'hex');
        key = crypto.pbkdf2Sync(
          this.encryptionKey,
          salt,
          ENCRYPTION_CONFIG.iterations,
          ENCRYPTION_CONFIG.keyLength,
          'sha256'
        );
      }

      const decipher = crypto.createDecipher(ENCRYPTION_CONFIG.algorithm, key);
      decipher.setAAD(Buffer.from('skyn3t-additional-data'));
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Error decrypting data:', error);
      throw new Error('Error al desencriptar datos');
    }
  }

  /**
   * Generar token JWT de acceso
   */
  generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>): string {
    try {
      const secretKey = process.env.JWT_SECRET;
      if (!secretKey) {
        throw new Error('JWT_SECRET not configured');
      }

      const tokenPayload: JWTPayload = {
        ...payload,
        iss: JWT_CONFIG.issuer,
        aud: JWT_CONFIG.audience
      };

      return jwt.sign(tokenPayload, secretKey, {
        algorithm: JWT_CONFIG.algorithm,
        expiresIn: JWT_CONFIG.accessTokenExpiry
      });
    } catch (error) {
      logger.error('Error generating access token:', error);
      throw new Error('Error al generar token de acceso');
    }
  }

  /**
   * Generar token JWT de refresh
   */
  generateRefreshToken(userId: string): string {
    try {
      const secretKey = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
      if (!secretKey) {
        throw new Error('JWT refresh secret not configured');
      }

      return jwt.sign(
        { 
          userId, 
          type: 'refresh',
          iss: JWT_CONFIG.issuer,
          aud: JWT_CONFIG.audience
        },
        secretKey,
        {
          algorithm: JWT_CONFIG.algorithm,
          expiresIn: JWT_CONFIG.refreshTokenExpiry
        }
      );
    } catch (error) {
      logger.error('Error generating refresh token:', error);
      throw new Error('Error al generar refresh token');
    }
  }

  /**
   * Verificar y decodificar token JWT
   */
  verifyToken(token: string, isRefreshToken = false): JWTPayload {
    try {
      const secretKey = isRefreshToken 
        ? (process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET)
        : process.env.JWT_SECRET;

      if (!secretKey) {
        throw new Error('JWT secret not configured');
      }

      const decoded = jwt.verify(token, secretKey, {
        algorithms: [JWT_CONFIG.algorithm],
        issuer: JWT_CONFIG.issuer,
        audience: JWT_CONFIG.audience
      }) as JWTPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expirado');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Token inválido');
      } else {
        logger.error('Error verifying token:', error);
        throw new Error('Error al verificar token');
      }
    }
  }

  /**
   * Generar secreto para 2FA
   */
  generate2FASecret(userEmail: string, serviceName = 'SKYN3T Access Control'): {
    secret: string;
    qrCodeUrl: string;
    backupCodes: string[];
  } {
    try {
      const secret = speakeasy.generateSecret({
        name: userEmail,
        issuer: serviceName,
        length: 32
      });

      const qrCodeUrl = speakeasy.otpauthURL({
        secret: secret.base32,
        label: userEmail,
        issuer: serviceName,
        encoding: 'base32'
      });

      // Generar códigos de respaldo
      const backupCodes = this.generateBackupCodes(8);

      return {
        secret: secret.base32,
        qrCodeUrl,
        backupCodes
      };
    } catch (error) {
      logger.error('Error generating 2FA secret:', error);
      throw new Error('Error al generar secreto 2FA');
    }
  }

  /**
   * Generar QR code para 2FA
   */
  async generate2FAQRCode(qrCodeUrl: string): Promise<string> {
    try {
      return await qrcode.toDataURL(qrCodeUrl);
    } catch (error) {
      logger.error('Error generating QR code:', error);
      throw new Error('Error al generar código QR');
    }
  }

  /**
   * Verificar código 2FA
   */
  verify2FACode(secret: string, token: string, window = 2): boolean {
    try {
      return speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token,
        window
      });
    } catch (error) {
      logger.error('Error verifying 2FA code:', error);
      return false;
    }
  }

  /**
   * Generar códigos de respaldo para 2FA
   */
  private generateBackupCodes(count: number): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${code.slice(0, 4)}-${code.slice(4, 8)}`);
    }
    return codes;
  }

  /**
   * Generar token seguro aleatorio
   */
  generateSecureToken(length = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generar UUID v4
   */
  generateUUID(): string {
    return crypto.randomUUID();
  }

  /**
   * Generar hash SHA-256
   */
  sha256Hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generar hash HMAC
   */
  hmacHash(data: string, secret: string, algorithm = 'sha256'): string {
    return crypto.createHmac(algorithm, secret).update(data).digest('hex');
  }

  /**
   * Verificar integridad de datos con HMAC
   */
  verifyHMAC(data: string, signature: string, secret: string, algorithm = 'sha256'): boolean {
    const expectedSignature = this.hmacHash(data, secret, algorithm);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Generar clave de API segura
   */
  generateApiKey(): { key: string; hash: string } {
    const key = `sk_${crypto.randomBytes(16).toString('hex')}`;
    const hash = this.sha256Hash(key);
    return { key, hash };
  }

  /**
   * Enmascarar datos sensibles para logs
   */
  maskSensitiveData(data: string, visibleChars = 4): string {
    if (data.length <= visibleChars * 2) {
      return '*'.repeat(data.length);
    }
    
    const start = data.slice(0, visibleChars);
    const end = data.slice(-visibleChars);
    const middle = '*'.repeat(data.length - (visibleChars * 2));
    
    return `${start}${middle}${end}`;
  }

  /**
   * Validar fortaleza de contraseña
   */
  validatePasswordStrength(password: string): {
    isValid: boolean;
    score: number;
    feedback: string[];
  } {
    const feedback: string[] = [];
    let score = 0;

    // Longitud mínima
    if (password.length >= 8) {
      score += 1;
    } else {
      feedback.push('La contraseña debe tener al menos 8 caracteres');
    }

    // Mayúsculas y minúsculas
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
      score += 1;
    } else {
      feedback.push('Debe incluir mayúsculas y minúsculas');
    }

    // Números
    if (/\d/.test(password)) {
      score += 1;
    } else {
      feedback.push('Debe incluir al menos un número');
    }

    // Caracteres especiales
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      score += 1;
    } else {
      feedback.push('Debe incluir caracteres especiales');
    }

    // Longitud extendida
    if (password.length >= 12) {
      score += 1;
    }

    // Patrones comunes (reducir score)
    const commonPatterns = [
      /123456/,
      /password/i,
      /qwerty/i,
      /admin/i,
      /letmein/i
    ];

    if (commonPatterns.some(pattern => pattern.test(password))) {
      score -= 2;
      feedback.push('Evita usar patrones comunes o palabras obvias');
    }

    return {
      isValid: score >= 3,
      score: Math.max(0, Math.min(5, score)),
      feedback
    };
  }

  /**
   * Generar firma digital para documentos
   */
  signDocument(documentData: string, privateKey?: string): string {
    try {
      const key = privateKey || process.env.DOCUMENT_SIGNING_KEY || this.encryptionKey.toString('hex');
      return this.hmacHash(documentData, key, 'sha256');
    } catch (error) {
      logger.error('Error signing document:', error);
      throw new Error('Error al firmar documento');
    }
  }

  /**
   * Verificar firma digital de documento
   */
  verifyDocumentSignature(documentData: string, signature: string, publicKey?: string): boolean {
    try {
      const key = publicKey || process.env.DOCUMENT_SIGNING_KEY || this.encryptionKey.toString('hex');
      return this.verifyHMAC(documentData, signature, key, 'sha256');
    } catch (error) {
      logger.error('Error verifying document signature:', error);
      return false;
    }
  }
}

// Singleton instance
export const cryptoService = CryptoService.getInstance();

// Funciones de conveniencia
export const hashPassword = (password: string) => cryptoService.hashPassword(password);
export const verifyPassword = (password: string, hash: string) => cryptoService.verifyPassword(password, hash);
export const encrypt = (text: string) => cryptoService.encrypt(text);
export const decrypt = (data: EncryptedData) => cryptoService.decrypt(data);
export const generateAccessToken = (payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>) => 
  cryptoService.generateAccessToken(payload);
export const generateRefreshToken = (userId: string) => cryptoService.generateRefreshToken(userId);
export const verifyToken = (token: string, isRefresh = false) => cryptoService.verifyToken(token, isRefresh);
export const generateSecureToken = (length?: number) => cryptoService.generateSecureToken(length);
export const generateUUID = () => cryptoService.generateUUID();

// Exportar constantes útiles
export const CRYPTO_CONSTANTS = {
  MIN_PASSWORD_LENGTH: 8,
  RECOMMENDED_PASSWORD_LENGTH: 12,
  TOKEN_EXPIRY: {
    ACCESS: '15m',
    REFRESH: '7d',
    RESET: '1h',
    VERIFICATION: '24h'
  },
  HASH_ROUNDS: 12
} as const;