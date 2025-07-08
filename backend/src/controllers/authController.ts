import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { User } from '../models/User';
import { UserSession } from '../models/UserSession';
import { AuditLog } from '../models/AuditLog';
import { authService } from '../services/authService';
import { cache, cacheKeys, cacheTTL } from '../config/redis';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { emailService } from '../services/emailService';
import crypto from 'crypto';

export class AuthController {
  /**
   * Login de usuario
   */
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { username, password, remember = false } = req.body;
      const ip = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'] || '';

      // Buscar usuario por username o email
      let user = await User.findByUsername(username);
      if (!user) {
        user = await User.findByEmail(username);
      }

      if (!user) {
        throw new AppError('Credenciales inválidas', 401);
      }

      // Verificar si el usuario está bloqueado
      if (user.isLocked()) {
        throw new AppError('Cuenta bloqueada temporalmente por múltiples intentos fallidos', 423);
      }

      // Verificar contraseña
      const isValidPassword = await user.validatePassword(password);
      if (!isValidPassword) {
        await user.incrementFailedAttempts();
        throw new AppError('Credenciales inválidas', 401);
      }

      // Verificar estado del usuario
      if (user.status !== 'active') {
        throw new AppError('Cuenta inactiva o suspendida', 403);
      }

      // Verificar 2FA si está habilitado
      if (user.two_factor_enabled && !req.body.two_factor_code) {
        return res.status(200).json({
          requires_2fa: true,
          user_id: user.id
        });
      }

      if (user.two_factor_enabled && req.body.two_factor_code) {
        const verified = speakeasy.totp.verify({
          secret: user.two_factor_secret!,
          encoding: 'base32',
          token: req.body.two_factor_code,
          window: 2
        });

        if (!verified) {
          throw new AppError('Código de verificación inválido', 401);
        }
      }

      // Registrar login exitoso
      await user.recordLogin(ip);

      // Obtener roles y permisos
      const roles = await user.getRolesByCommunity();
      const permissions = await user.getEffectivePermissions();

      // Generar tokens
      const tokenPayload = {
        id: user.id,
        username: user.username,
        email: user.email,
        roles: roles.map(r => r.code),
        permissions: permissions.map(p => p.code)
      };

      const accessToken = jwt.sign(
        tokenPayload,
        process.env.JWT_SECRET!,
        { expiresIn: remember ? '7d' : '15m' }
      );

      const refreshToken = jwt.sign(
        { id: user.id },
        process.env.JWT_REFRESH_SECRET!,
        { expiresIn: remember ? '30d' : '7d' }
      );

      // Crear sesión
      const session = await UserSession.create({
        user_id: user.id,
        token_hash: crypto.createHash('sha256').update(accessToken).digest('hex'),
        refresh_token_hash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
        ip_address: ip,
        user_agent: userAgent,
        expires_at: new Date(Date.now() + (remember ? 7 * 24 * 60 * 60 * 1000 : 15 * 60 * 1000)),
        refresh_expires_at: new Date(Date.now() + (remember ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000))
      });

      // Guardar en caché
      await cache.set(
        cacheKeys.session(session.id),
        { user_id: user.id, roles: roles.map(r => r.code) },
        cacheTTL.day
      );

      // Registrar en auditoría
      await AuditLog.create({
        user_id: user.id,
        action: 'user.login',
        ip_address: ip,
        user_agent: userAgent,
        metadata: {
          username: user.username,
          remember,
          session_id: session.id
        }
      });

      // Determinar redirect según rol principal
      const primaryRole = roles[0]?.code || 'USER';
      let redirect = '/dashboard';
      
      if (['SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(primaryRole)) {
        redirect = '/admin/dashboard';
      } else if (primaryRole === 'COMMUNITY_ADMIN') {
        redirect = '/community/dashboard';
      } else if (['OWNER', 'TENANT'].includes(primaryRole)) {
        redirect = '/resident/dashboard';
      }

      res.json({
        success: true,
        message: 'Login exitoso',
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            full_name: user.fullName,
            avatar_url: user.avatar_url,
            email_verified: user.email_verified
          },
          roles: roles.map(r => ({
            code: r.code,
            name: r.name,
            level: r.level
          })),
          permissions: permissions.map(p => p.code),
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: remember ? 604800 : 900, // segundos
          redirect
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Logout de usuario
   */
  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const sessionId = req.session?.id;
      const userId = req.user?.id;

      if (sessionId) {
        // Invalidar sesión
        await UserSession.update(
          { is_active: false },
          { where: { id: sessionId } }
        );

        // Eliminar de caché
        await cache.del(cacheKeys.session(sessionId));
      }

      // Registrar en auditoría
      if (userId) {
        await AuditLog.create({
          user_id: userId,
          action: 'user.logout',
          ip_address: req.ip,
          user_agent: req.headers['user-agent'] || '',
          metadata: { session_id: sessionId }
        });
      }

      res.json({
        success: true,
        message: 'Logout exitoso',
        redirect: '/login'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Refrescar token
   */
  async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { refresh_token } = req.body;

      if (!refresh_token) {
        throw new AppError('Refresh token requerido', 400);
      }

      // Verificar refresh token
      const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET!) as any;
      
      // Buscar sesión
      const refreshTokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');
      const session = await UserSession.findOne({
        where: {
          refresh_token_hash: refreshTokenHash,
          is_active: true
        }
      });

      if (!session || new Date() > new Date(session.refresh_expires_at)) {
        throw new AppError('Refresh token inválido o expirado', 401);
      }

      // Obtener usuario
      const user = await User.findActiveById(decoded.id);
      if (!user) {
        throw new AppError('Usuario no encontrado', 404);
      }

      // Obtener roles y permisos actualizados
      const roles = await user.getRolesByCommunity();
      const permissions = await user.getEffectivePermissions();

      // Generar nuevo access token
      const tokenPayload = {
        id: user.id,
        username: user.username,
        email: user.email,
        roles: roles.map(r => r.code),
        permissions: permissions.map(p => p.code)
      };

      const newAccessToken = jwt.sign(
        tokenPayload,
        process.env.JWT_SECRET!,
        { expiresIn: '15m' }
      );

      // Actualizar sesión
      session.token_hash = crypto.createHash('sha256').update(newAccessToken).digest('hex');
      session.expires_at = new Date(Date.now() + 15 * 60 * 1000);
      session.last_activity = new Date();
      await session.save();

      res.json({
        success: true,
        data: {
          access_token: newAccessToken,
          expires_in: 900
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Verificar sesión actual
   */
  async checkSession(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;

      if (!user) {
        return res.json({
          authenticated: false
        });
      }

      // Obtener roles y permisos
      const roles = await user.getRolesByCommunity();
      const permissions = await user.getEffectivePermissions();

      res.json({
        authenticated: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          full_name: user.fullName,
          avatar_url: user.avatar_url,
          email_verified: user.email_verified,
          roles: roles.map(r => ({
            code: r.code,
            name: r.name
          })),
          permissions: permissions.map(p => p.code)
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Habilitar 2FA
   */
  async enable2FA(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;

      // Generar secreto
      const secret = speakeasy.generateSecret({
        length: 32,
        name: `SKYN3T (${user.email})`,
        issuer: 'SKYN3T Access Control'
      });

      // Guardar secreto temporalmente
      await cache.set(
        `2fa_setup:${user.id}`,
        secret.base32,
        cacheTTL.medium
      );

      // Generar QR
      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

      res.json({
        success: true,
        data: {
          secret: secret.base32,
          qr_code: qrCodeUrl
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Confirmar 2FA
   */
  async confirm2FA(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { code } = req.body;

      // Obtener secreto temporal
      const secret = await cache.get(`2fa_setup:${user.id}`);
      if (!secret) {
        throw new AppError('Sesión de configuración 2FA expirada', 400);
      }

      // Verificar código
      const verified = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token: code,
        window: 2
      });

      if (!verified) {
        throw new AppError('Código inválido', 400);
      }

      // Guardar secreto en usuario
      user.two_factor_enabled = true;
      user.two_factor_secret = secret;
      await user.save();

      // Eliminar secreto temporal
      await cache.del(`2fa_setup:${user.id}`);

      // Generar códigos de respaldo
      const backupCodes = Array.from({ length: 8 }, () => 
        crypto.randomBytes(4).toString('hex')
      );

      // Guardar códigos de respaldo (hasheados)
      await cache.set(
        `2fa_backup:${user.id}`,
        backupCodes.map(code => 
          crypto.createHash('sha256').update(code).digest('hex')
        ),
        cacheTTL.month
      );

      res.json({
        success: true,
        message: '2FA habilitado exitosamente',
        data: {
          backup_codes: backupCodes
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Deshabilitar 2FA
   */
  async disable2FA(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { password } = req.body;

      // Verificar contraseña
      const isValid = await user.validatePassword(password);
      if (!isValid) {
        throw new AppError('Contraseña incorrecta', 401);
      }

      // Deshabilitar 2FA
      user.two_factor_enabled = false;
      user.two_factor_secret = null;
      await user.save();

      // Eliminar códigos de respaldo
      await cache.del(`2fa_backup:${user.id}`);

      res.json({
        success: true,
        message: '2FA deshabilitado exitosamente'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Solicitar restablecimiento de contraseña
   */
  async requestPasswordReset(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;

      const user = await User.findByEmail(email);
      if (!user) {
        // No revelar si el email existe o no
        return res.json({
          success: true,
          message: 'Si el email existe, recibirás instrucciones para restablecer tu contraseña'
        });
      }

      // Generar token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

      // Guardar token en caché (válido por 1 hora)
      await cache.set(
        cacheKeys.passwordReset(resetTokenHash),
        user.id,
        cacheTTL.long
      );

      // Enviar email
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
      await emailService.sendPasswordResetEmail(user.email, user.fullName, resetUrl);

      // Registrar en auditoría
      await AuditLog.create({
        user_id: user.id,
        action: 'user.password_reset_requested',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        metadata: { email }
      });

      res.json({
        success: true,
        message: 'Si el email existe, recibirás instrucciones para restablecer tu contraseña'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Restablecer contraseña
   */
  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { token, password } = req.body;

      // Verificar token
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const userId = await cache.get(cacheKeys.passwordReset(tokenHash));

      if (!userId) {
        throw new AppError('Token inválido o expirado', 400);
      }

      // Buscar usuario
      const user = await User.findByPk(userId);
      if (!user) {
        throw new AppError('Usuario no encontrado', 404);
      }

      // Actualizar contraseña
      await user.updatePassword(password);

      // Eliminar token
      await cache.del(cacheKeys.passwordReset(tokenHash));

      // Invalidar todas las sesiones del usuario
      await UserSession.update(
        { is_active: false },
        { where: { user_id: user.id } }
      );

      // Registrar en auditoría
      await AuditLog.create({
        user_id: user.id,
        action: 'user.password_reset',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || ''
      });

      res.json({
        success: true,
        message: 'Contraseña restablecida exitosamente'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Cambiar contraseña (usuario autenticado)
   */
  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { current_password, new_password } = req.body;

      // Verificar contraseña actual
      const isValid = await user.validatePassword(current_password);
      if (!isValid) {
        throw new AppError('Contraseña actual incorrecta', 401);
      }

      // Actualizar contraseña
      await user.updatePassword(new_password);

      // Registrar en auditoría
      await AuditLog.create({
        user_id: user.id,
        action: 'user.password_changed',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || ''
      });

      res.json({
        success: true,
        message: 'Contraseña actualizada exitosamente'
      });

    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();