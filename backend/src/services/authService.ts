// =====================================================
// AUTH SERVICE - SKYN3T ACCESS CONTROL
// =====================================================
// Servicio de autenticación completo con 2FA, rate limiting y seguridad avanzada

import { User, UserSession, AuditLog, Community, Role } from '../models';
import { cryptoService } from '../utils/crypto';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { emailService } from './emailService';
import { Op } from 'sequelize';
import speakeasy from 'speakeasy';

// Interfaces
interface LoginCredentials {
  username: string;
  password: string;
  two_factor_code?: string;
  remember?: boolean;
  device_info?: DeviceInfo;
}

interface DeviceInfo {
  user_agent: string;
  ip_address: string;
  device_fingerprint?: string;
  location?: {
    country?: string;
    city?: string;
    timezone?: string;
  };
}

interface LoginResult {
  user: any;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  two_factor_required?: boolean;
  two_factor_methods?: string[];
}

interface RegisterData {
  username: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone?: string;
  community_code?: string;
  invitation_token?: string;
}

interface PasswordResetData {
  email: string;
  new_password: string;
  reset_token: string;
}

interface TwoFactorSetup {
  secret: string;
  qr_code: string;
  backup_codes: string[];
}

class AuthService {
  private static readonly MAX_LOGIN_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION = 15 * 60; // 15 minutos
  private static readonly SESSION_DURATION = 7 * 24 * 60 * 60; // 7 días
  private static readonly PASSWORD_RESET_EXPIRY = 60 * 60; // 1 hora

  /**
   * Autenticar usuario
   */
  async login(credentials: LoginCredentials): Promise<LoginResult> {
    try {
      // 1. Validar rate limiting
      await this.checkRateLimit(credentials.username, credentials.device_info?.ip_address);

      // 2. Buscar usuario
      const user = await this.findUserByCredentials(credentials.username);
      if (!user) {
        await this.recordFailedAttempt(credentials.username, credentials.device_info?.ip_address, 'USER_NOT_FOUND');
        throw new AppError('Credenciales inválidas', 401, 'INVALID_CREDENTIALS');
      }

      // 3. Verificar si está bloqueado
      if (user.locked_until && user.locked_until > new Date()) {
        throw new AppError('Cuenta bloqueada temporalmente', 423, 'ACCOUNT_LOCKED', {
          locked_until: user.locked_until
        });
      }

      // 4. Verificar contraseña
      const isPasswordValid = await cryptoService.verifyPassword(credentials.password, user.password_hash);
      if (!isPasswordValid) {
        await this.recordFailedAttempt(credentials.username, credentials.device_info?.ip_address, 'INVALID_PASSWORD');
        await this.incrementFailedAttempts(user.id);
        throw new AppError('Credenciales inválidas', 401, 'INVALID_CREDENTIALS');
      }

      // 5. Verificar si necesita 2FA
      if (user.two_factor_enabled) {
        if (!credentials.two_factor_code) {
          return {
            user: null,
            access_token: '',
            refresh_token: '',
            expires_in: 0,
            two_factor_required: true,
            two_factor_methods: user.two_factor_methods || ['totp']
          };
        }

        const is2FAValid = await this.verify2FA(user.id, credentials.two_factor_code);
        if (!is2FAValid) {
          await this.recordFailedAttempt(credentials.username, credentials.device_info?.ip_address, 'INVALID_2FA');
          throw new AppError('Código de autenticación inválido', 401, 'INVALID_2FA_CODE');
        }
      }

      // 6. Login exitoso - resetear intentos fallidos
      await this.resetFailedAttempts(user.id);
      await this.clearRateLimit(credentials.username, credentials.device_info?.ip_address);

      // 7. Generar tokens
      const tokens = await this.generateAuthTokens(user, credentials.remember || false);

      // 8. Crear sesión
      const session = await this.createUserSession(user.id, {
        ...credentials.device_info,
        refresh_token: tokens.refresh_token
      });

      // 9. Actualizar último login
      await user.update({
        last_login_at: new Date(),
        last_login_ip: credentials.device_info?.ip_address,
        failed_login_attempts: 0,
        locked_until: null
      });

      // 10. Registrar auditoría
      await this.logAuditEvent(user.id, 'LOGIN_SUCCESS', {
        ip_address: credentials.device_info?.ip_address,
        user_agent: credentials.device_info?.user_agent,
        session_id: session.id
      });

      // 11. Obtener datos completos del usuario
      const userWithRoles = await this.getUserWithRoles(user.id);

      logger.info(`Successful login for user ${user.id} (${user.username})`);

      return {
        user: userWithRoles,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in
      };

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Login error:', error);
      throw new AppError('Error interno del servidor', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Refrescar token de acceso
   */
  async refreshToken(refreshToken: string, deviceInfo?: DeviceInfo): Promise<{
    access_token: string;
    expires_in: number;
  }> {
    try {
      // 1. Verificar refresh token
      const decoded = cryptoService.verifyToken(refreshToken, true);
      
      // 2. Buscar sesión activa
      const session = await UserSession.findOne({
        where: {
          user_id: decoded.userId,
          refresh_token: refreshToken,
          is_active: true,
          expires_at: { [Op.gt]: new Date() }
        }
      });

      if (!session) {
        throw new AppError('Sesión inválida o expirada', 401, 'INVALID_SESSION');
      }

      // 3. Buscar usuario
      const user = await User.findByPk(decoded.userId);
      if (!user || !user.is_active) {
        throw new AppError('Usuario no encontrado o inactivo', 401, 'USER_INACTIVE');
      }

      // 4. Generar nuevo access token
      const userWithRoles = await this.getUserWithRoles(user.id);
      const newAccessToken = cryptoService.generateAccessToken({
        userId: user.id,
        username: user.username,
        email: user.email,
        roles: userWithRoles.roles.map((r: any) => r.code)
      });

      // 5. Actualizar última actividad de la sesión
      await session.update({
        last_activity: new Date(),
        ip_address: deviceInfo?.ip_address || session.ip_address
      });

      return {
        access_token: newAccessToken,
        expires_in: 15 * 60 // 15 minutos
      };

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Token refresh error:', error);
      throw new AppError('Error al refrescar token', 401, 'TOKEN_REFRESH_ERROR');
    }
  }

  /**
   * Logout de usuario
   */
  async logout(userId: string, refreshToken?: string, logoutAll = false): Promise<void> {
    try {
      if (logoutAll) {
        // Invalidar todas las sesiones del usuario
        await UserSession.update(
          { is_active: false, ended_at: new Date() },
          { where: { user_id: userId, is_active: true } }
        );

        // Limpiar cache de permisos
        const cachePattern = `permissions:${userId}:*`;
        const keys = await redisClient.keys(cachePattern);
        if (keys.length > 0) {
          await redisClient.del(...keys);
        }

        await this.logAuditEvent(userId, 'LOGOUT_ALL_SESSIONS');
      } else if (refreshToken) {
        // Invalidar sesión específica
        await UserSession.update(
          { is_active: false, ended_at: new Date() },
          { where: { user_id: userId, refresh_token: refreshToken } }
        );

        await this.logAuditEvent(userId, 'LOGOUT', { refresh_token: refreshToken });
      }

      logger.info(`User ${userId} logged out${logoutAll ? ' (all sessions)' : ''}`);
    } catch (error) {
      logger.error('Logout error:', error);
      throw new AppError('Error al cerrar sesión', 500, 'LOGOUT_ERROR');
    }
  }

  /**
   * Registrar nuevo usuario
   */
  async register(data: RegisterData): Promise<{ user: any; verification_required: boolean }> {
    try {
      // 1. Verificar si el usuario ya existe
      const existingUser = await User.findOne({
        where: {
          [Op.or]: [
            { username: data.username },
            { email: data.email }
          ]
        }
      });

      if (existingUser) {
        if (existingUser.username === data.username) {
          throw new AppError('El nombre de usuario ya está en uso', 409, 'USERNAME_EXISTS');
        } else {
          throw new AppError('El email ya está registrado', 409, 'EMAIL_EXISTS');
        }
      }

      // 2. Validar fortaleza de contraseña
      const passwordValidation = cryptoService.validatePasswordStrength(data.password);
      if (!passwordValidation.isValid) {
        throw new AppError('Contraseña muy débil', 400, 'WEAK_PASSWORD', {
          feedback: passwordValidation.feedback
        });
      }

      // 3. Hash de la contraseña
      const passwordHash = await cryptoService.hashPassword(data.password);

      // 4. Crear usuario
      const user = await User.create({
        username: data.username,
        email: data.email,
        password_hash: passwordHash,
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone,
        email_verification_token: cryptoService.generateSecureToken(32),
        email_verified: false,
        is_active: true,
        created_at: new Date()
      });

      // 5. Procesar invitación si existe
      if (data.invitation_token) {
        await this.processInvitation(user.id, data.invitation_token);
      }

      // 6. Enviar email de verificación
      const verificationSent = await this.sendEmailVerification(user.id);

      // 7. Registrar auditoría
      await this.logAuditEvent(user.id, 'USER_REGISTERED', {
        email: data.email,
        community_code: data.community_code
      });

      logger.info(`New user registered: ${user.id} (${user.username})`);

      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          email_verified: user.email_verified
        },
        verification_required: verificationSent
      };

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Registration error:', error);
      throw new AppError('Error al registrar usuario', 500, 'REGISTRATION_ERROR');
    }
  }

  /**
   * Verificar email
   */
  async verifyEmail(token: string): Promise<void> {
    try {
      const user = await User.findOne({
        where: {
          email_verification_token: token,
          email_verified: false
        }
      });

      if (!user) {
        throw new AppError('Token de verificación inválido o expirado', 400, 'INVALID_VERIFICATION_TOKEN');
      }

      await user.update({
        email_verified: true,
        email_verification_token: null,
        email_verified_at: new Date()
      });

      await this.logAuditEvent(user.id, 'EMAIL_VERIFIED');

      logger.info(`Email verified for user ${user.id}`);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Email verification error:', error);
      throw new AppError('Error al verificar email', 500, 'EMAIL_VERIFICATION_ERROR');
    }
  }

  /**
   * Solicitar reset de contraseña
   */
  async requestPasswordReset(email: string): Promise<void> {
    try {
      const user = await User.findOne({ where: { email } });
      if (!user) {
        // Por seguridad, no revelar si el email existe
        return;
      }

      const resetToken = cryptoService.generateSecureToken(32);
      const expiresAt = new Date(Date.now() + AuthService.PASSWORD_RESET_EXPIRY * 1000);

      await user.update({
        password_reset_token: resetToken,
        password_reset_expires: expiresAt
      });

      // Enviar email de reset
      await emailService.sendPasswordResetEmail(user.email, resetToken, user.first_name);

      await this.logAuditEvent(user.id, 'PASSWORD_RESET_REQUESTED');

      logger.info(`Password reset requested for user ${user.id}`);
    } catch (error) {
      logger.error('Password reset request error:', error);
      throw new AppError('Error al solicitar reset de contraseña', 500, 'PASSWORD_RESET_REQUEST_ERROR');
    }
  }

  /**
   * Resetear contraseña
   */
  async resetPassword(data: PasswordResetData): Promise<void> {
    try {
      const user = await User.findOne({
        where: {
          email: data.email,
          password_reset_token: data.reset_token,
          password_reset_expires: { [Op.gt]: new Date() }
        }
      });

      if (!user) {
        throw new AppError('Token de reset inválido o expirado', 400, 'INVALID_RESET_TOKEN');
      }

      // Validar nueva contraseña
      const passwordValidation = cryptoService.validatePasswordStrength(data.new_password);
      if (!passwordValidation.isValid) {
        throw new AppError('Contraseña muy débil', 400, 'WEAK_PASSWORD', {
          feedback: passwordValidation.feedback
        });
      }

      // Hash nueva contraseña
      const passwordHash = await cryptoService.hashPassword(data.new_password);

      await user.update({
        password_hash: passwordHash,
        password_reset_token: null,
        password_reset_expires: null,
        password_changed_at: new Date()
      });

      // Invalidar todas las sesiones activas
      await UserSession.update(
        { is_active: false, ended_at: new Date() },
        { where: { user_id: user.id, is_active: true } }
      );

      await this.logAuditEvent(user.id, 'PASSWORD_RESET_COMPLETED');

      logger.info(`Password reset completed for user ${user.id}`);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Password reset error:', error);
      throw new AppError('Error al resetear contraseña', 500, 'PASSWORD_RESET_ERROR');
    }
  }

  /**
   * Configurar 2FA
   */
  async setup2FA(userId: string): Promise<TwoFactorSetup> {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
      }

      if (user.two_factor_enabled) {
        throw new AppError('2FA ya está habilitado', 400, '2FA_ALREADY_ENABLED');
      }

      const setup = cryptoService.generate2FASecret(user.email);
      const qrCode = await cryptoService.generate2FAQRCode(setup.qrCodeUrl);

      // Guardar secreto temporalmente (se confirma después)
      const tempKey = `2fa_setup:${userId}`;
      await redisClient.setex(tempKey, 600, JSON.stringify({ // 10 minutos
        secret: setup.secret,
        backup_codes: setup.backupCodes
      }));

      return {
        secret: setup.secret,
        qr_code: qrCode,
        backup_codes: setup.backupCodes
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('2FA setup error:', error);
      throw new AppError('Error al configurar 2FA', 500, '2FA_SETUP_ERROR');
    }
  }

  /**
   * Confirmar configuración 2FA
   */
  async confirm2FA(userId: string, code: string): Promise<{ backup_codes: string[] }> {
    try {
      const tempKey = `2fa_setup:${userId}`;
      const setupData = await redisClient.get(tempKey);
      
      if (!setupData) {
        throw new AppError('Configuración 2FA expirada', 400, '2FA_SETUP_EXPIRED');
      }

      const { secret, backup_codes } = JSON.parse(setupData);

      // Verificar código
      const isValid = cryptoService.verify2FACode(secret, code);
      if (!isValid) {
        throw new AppError('Código inválido', 400, 'INVALID_2FA_CODE');
      }

      // Guardar configuración en usuario
      const user = await User.findByPk(userId);
      await user!.update({
        two_factor_secret: cryptoService.encrypt(secret).encrypted,
        two_factor_enabled: true,
        two_factor_backup_codes: backup_codes.map(code => cryptoService.sha256Hash(code))
      });

      // Limpiar datos temporales
      await redisClient.del(tempKey);

      await this.logAuditEvent(userId, '2FA_ENABLED');

      logger.info(`2FA enabled for user ${userId}`);

      return { backup_codes };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('2FA confirmation error:', error);
      throw new AppError('Error al confirmar 2FA', 500, '2FA_CONFIRM_ERROR');
    }
  }

  /**
   * Deshabilitar 2FA
   */
  async disable2FA(userId: string, password: string): Promise<void> {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
      }

      // Verificar contraseña actual
      const isPasswordValid = await cryptoService.verifyPassword(password, user.password_hash);
      if (!isPasswordValid) {
        throw new AppError('Contraseña incorrecta', 401, 'INVALID_PASSWORD');
      }

      await user.update({
        two_factor_enabled: false,
        two_factor_secret: null,
        two_factor_backup_codes: null
      });

      await this.logAuditEvent(userId, '2FA_DISABLED');

      logger.info(`2FA disabled for user ${userId}`);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('2FA disable error:', error);
      throw new AppError('Error al deshabilitar 2FA', 500, '2FA_DISABLE_ERROR');
    }
  }

  /**
   * Verificar código 2FA
   */
  private async verify2FA(userId: string, code: string): Promise<boolean> {
    try {
      const user = await User.findByPk(userId);
      if (!user || !user.two_factor_enabled || !user.two_factor_secret) {
        return false;
      }

      // Intentar con secreto TOTP
      const decryptedSecret = cryptoService.decrypt({
        encrypted: user.two_factor_secret,
        iv: '', // Se necesitaría guardar estos valores
        tag: ''
      });

      const isValidTOTP = cryptoService.verify2FACode(decryptedSecret, code);
      if (isValidTOTP) {
        return true;
      }

      // Intentar con códigos de respaldo
      if (user.two_factor_backup_codes) {
        const codeHash = cryptoService.sha256Hash(code);
        const isValidBackup = user.two_factor_backup_codes.includes(codeHash);
        
        if (isValidBackup) {
          // Remover código usado
          const updatedCodes = user.two_factor_backup_codes.filter(c => c !== codeHash);
          await user.update({ two_factor_backup_codes: updatedCodes });
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error('2FA verification error:', error);
      return false;
    }
  }

  /**
   * Métodos auxiliares privados
   */
  private async findUserByCredentials(identifier: string): Promise<User | null> {
    return await User.findOne({
      where: {
        [Op.or]: [
          { username: identifier },
          { email: identifier }
        ],
        is_active: true
      }
    });
  }

  private async generateAuthTokens(user: User, remember: boolean) {
    const userWithRoles = await this.getUserWithRoles(user.id);
    
    const accessToken = cryptoService.generateAccessToken({
      userId: user.id,
      username: user.username,
      email: user.email,
      roles: userWithRoles.roles.map((r: any) => r.code)
    });

    const refreshToken = cryptoService.generateRefreshToken(user.id);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 15 * 60 // 15 minutos
    };
  }

  private async createUserSession(userId: string, deviceInfo: any) {
    return await UserSession.create({
      user_id: userId,
      refresh_token: deviceInfo.refresh_token,
      ip_address: deviceInfo.ip_address,
      user_agent: deviceInfo.user_agent,
      device_fingerprint: deviceInfo.device_fingerprint,
      location: deviceInfo.location,
      is_active: true,
      expires_at: new Date(Date.now() + AuthService.SESSION_DURATION * 1000),
      created_at: new Date()
    });
  }

  private async getUserWithRoles(userId: string) {
    return await User.findByPk(userId, {
      include: [
        {
          model: Role,
          as: 'roles',
          attributes: ['id', 'code', 'name', 'level']
        }
      ],
      attributes: { exclude: ['password_hash', 'two_factor_secret'] }
    });
  }

  private async checkRateLimit(identifier: string, ipAddress?: string): Promise<void> {
    const keys = [
      `login_attempts:${identifier}`,
      `login_attempts_ip:${ipAddress}`
    ].filter(Boolean);

    for (const key of keys) {
      const attempts = await redisClient.get(key);
      if (attempts && parseInt(attempts) >= AuthService.MAX_LOGIN_ATTEMPTS) {
        throw new AppError('Demasiados intentos de login', 429, 'TOO_MANY_ATTEMPTS');
      }
    }
  }

  private async recordFailedAttempt(identifier: string, ipAddress?: string, reason?: string): Promise<void> {
    const keys = [
      `login_attempts:${identifier}`,
      `login_attempts_ip:${ipAddress}`
    ].filter(Boolean);

    for (const key of keys) {
      await redisClient.incr(key);
      await redisClient.expire(key, AuthService.LOCKOUT_DURATION);
    }
  }

  private async clearRateLimit(identifier: string, ipAddress?: string): Promise<void> {
    const keys = [
      `login_attempts:${identifier}`,
      `login_attempts_ip:${ipAddress}`
    ].filter(Boolean);

    await Promise.all(keys.map(key => redisClient.del(key)));
  }

  private async incrementFailedAttempts(userId: string): Promise<void> {
    const user = await User.findByPk(userId);
    if (!user) return;

    const attempts = (user.failed_login_attempts || 0) + 1;
    const updates: any = { failed_login_attempts: attempts };

    if (attempts >= AuthService.MAX_LOGIN_ATTEMPTS) {
      updates.locked_until = new Date(Date.now() + AuthService.LOCKOUT_DURATION * 1000);
    }

    await user.update(updates);
  }

  private async resetFailedAttempts(userId: string): Promise<void> {
    await User.update(
      { failed_login_attempts: 0, locked_until: null },
      { where: { id: userId } }
    );
  }

  private async sendEmailVerification(userId: string): Promise<boolean> {
    try {
      const user = await User.findByPk(userId);
      if (!user || !user.email_verification_token) return false;

      await emailService.sendEmailVerification(
        user.email, 
        user.email_verification_token, 
        user.first_name
      );
      return true;
    } catch (error) {
      logger.error('Failed to send verification email:', error);
      return false;
    }
  }

  private async processInvitation(userId: string, invitationToken: string): Promise<void> {
    // Implementar lógica de procesamiento de invitaciones
    // Esta función conectaría al usuario con una comunidad
  }

  private async logAuditEvent(userId: string, action: string, metadata?: any): Promise<void> {
    try {
      await AuditLog.create({
        user_id: userId,
        action,
        resource: 'auth',
        metadata: metadata || {},
        ip_address: metadata?.ip_address,
        user_agent: metadata?.user_agent,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to log audit event:', error);
    }
  }
}

export const authService = new AuthService();