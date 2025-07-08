import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { UserSession } from '../models/UserSession';
import { cache, cacheKeys } from '../config/redis';
import { logger } from '../utils/logger';
import crypto from 'crypto';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  user?: User;
  communityId?: string;
  permissions?: string[];
}

export class WebSocketService {
  private io: SocketIOServer;
  private userSockets: Map<string, Set<string>> = new Map();

  constructor(io: SocketIOServer) {
    this.io = io;
    this.setupMiddleware();
    this.setupEventHandlers();
  }

  /**
   * Configurar middleware de autenticación
   */
  private setupMiddleware() {
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.substring(7);

        if (!token) {
          return next(new Error('No se proporcionó token de autenticación'));
        }

        // Verificar JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

        // Verificar sesión
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const session = await UserSession.findOne({
          where: {
            token_hash: tokenHash,
            is_active: true
          }
        });

        if (!session || new Date() > new Date(session.expires_at)) {
          return next(new Error('Sesión inválida o expirada'));
        }

        // Obtener usuario
        const user = await User.findActiveById(decoded.id);
        if (!user) {
          return next(new Error('Usuario no encontrado'));
        }

        // Asignar datos al socket
        socket.userId = user.id;
        socket.user = user;
        socket.permissions = decoded.permissions || [];
        socket.communityId = socket.handshake.query.communityId as string;

        // Registrar socket del usuario
        this.addUserSocket(user.id, socket.id);

        next();
      } catch (error) {
        logger.error('WebSocket authentication error:', error);
        next(new Error('Error de autenticación'));
      }
    });
  }

  /**
   * Configurar manejadores de eventos
   */
  private setupEventHandlers() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      logger.info(`Usuario ${socket.userId} conectado via WebSocket (${socket.id})`);

      // Unir a rooms
      this.joinUserRooms(socket);

      // Eventos del cliente
      socket.on('join:community', (communityId: string) => {
        this.handleJoinCommunity(socket, communityId);
      });

      socket.on('leave:community', (communityId: string) => {
        this.handleLeaveCommunity(socket, communityId);
      });

      socket.on('subscribe:entity', (data: { type: string; id: string }) => {
        this.handleSubscribeEntity(socket, data);
      });

      socket.on('unsubscribe:entity', (data: { type: string; id: string }) => {
        this.handleUnsubscribeEntity(socket, data);
      });

      // Heartbeat
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });

      // Desconexión
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
  }

  /**
   * Unir usuario a sus rooms
   */
  private async joinUserRooms(socket: AuthenticatedSocket) {
    // Room personal del usuario
    socket.join(`user:${socket.userId}`);

    // Room de la comunidad si está especificada
    if (socket.communityId) {
      const isMember = await socket.user!.isMemberOfCommunity(socket.communityId);
      if (isMember) {
        socket.join(`community:${socket.communityId}`);
      }
    }

    // Rooms de roles
    const roles = await socket.user!.getRolesByCommunity(socket.communityId);
    for (const role of roles) {
      socket.join(`role:${role.id}`);
    }
  }

  /**
   * Manejar unión a comunidad
   */
  private async handleJoinCommunity(socket: AuthenticatedSocket, communityId: string) {
    try {
      const isMember = await socket.user!.isMemberOfCommunity(communityId);
      if (!isMember) {
        socket.emit('error', { message: 'No eres miembro de esta comunidad' });
        return;
      }

      socket.join(`community:${communityId}`);
      socket.communityId = communityId;
      socket.emit('joined:community', { communityId });

    } catch (error) {
      logger.error('Error joining community:', error);
      socket.emit('error', { message: 'Error al unirse a la comunidad' });
    }
  }

  /**
   * Manejar salida de comunidad
   */
  private handleLeaveCommunity(socket: AuthenticatedSocket, communityId: string) {
    socket.leave(`community:${communityId}`);
    if (socket.communityId === communityId) {
      socket.communityId = undefined;
    }
    socket.emit('left:community', { communityId });
  }

  /**
   * Suscribirse a cambios de una entidad
   */
  private handleSubscribeEntity(socket: AuthenticatedSocket, data: { type: string; id: string }) {
    const room = `${data.type}:${data.id}`;
    socket.join(room);
    socket.emit('subscribed:entity', data);
  }

  /**
   * Desuscribirse de una entidad
   */
  private handleUnsubscribeEntity(socket: AuthenticatedSocket, data: { type: string; id: string }) {
    const room = `${data.type}:${data.id}`;
    socket.leave(room);
    socket.emit('unsubscribed:entity', data);
  }

  /**
   * Manejar desconexión
   */
  private handleDisconnect(socket: AuthenticatedSocket) {
    logger.info(`Usuario ${socket.userId} desconectado (${socket.id})`);
    
    if (socket.userId) {
      this.removeUserSocket(socket.userId, socket.id);
    }
  }

  /**
   * Agregar socket de usuario
   */
  private addUserSocket(userId: string, socketId: string) {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);
    
    // También guardar en Redis para multi-servidor
    cache.set(`socket:user:${socketId}`, userId, 86400); // 24 horas
  }

  /**
   * Remover socket de usuario
   */
  private removeUserSocket(userId: string, socketId: string) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }
    
    // Remover de Redis
    cache.del(`socket:user:${socketId}`);
  }

  // ===== MÉTODOS PÚBLICOS PARA EMITIR EVENTOS =====

  /**
   * Emitir a un usuario específico
   */
  emitToUser(userId: string, event: string, data: any) {
    this.io.to(`user:${userId}`).emit(event, data);
    
    logger.debug(`Emitted ${event} to user ${userId}`, { data });
  }

  /**
   * Emitir a múltiples usuarios
   */
  emitToUsers(userIds: string[], event: string, data: any) {
    userIds.forEach(userId => {
      this.emitToUser(userId, event, data);
    });
  }

  /**
   * Emitir a una comunidad
   */
  emitToCommunity(communityId: string, event: string, data: any) {
    this.io.to(`community:${communityId}`).emit(event, data);
    
    logger.debug(`Emitted ${event} to community ${communityId}`, { data });
  }

  /**
   * Emitir a un rol
   */
  emitToRole(roleId: string, event: string, data: any) {
    this.io.to(`role:${roleId}`).emit(event, data);
    
    logger.debug(`Emitted ${event} to role ${roleId}`, { data });
  }

  /**
   * Emitir a una entidad específica
   */
  emitToEntity(entityType: string, entityId: string, event: string, data: any) {
    this.io.to(`${entityType}:${entityId}`).emit(event, data);
    
    logger.debug(`Emitted ${event} to ${entityType}:${entityId}`, { data });
  }

  /**
   * Broadcast global (usar con precaución)
   */
  broadcast(event: string, data: any) {
    this.io.emit(event, data);
    
    logger.info(`Broadcasted ${event} to all clients`, { data });
  }

  /**
   * Emitir actualización de permisos
   */
  emitPermissionsUpdate(userId: string, permissions: string[]) {
    this.emitToUser(userId, 'permissions.updated', {
      permissions,
      timestamp: new Date()
    });
  }

  /**
   * Emitir cambio de features
   */
  emitFeatureToggle(communityId: string, feature: string, enabled: boolean) {
    this.emitToCommunity(communityId, 'feature.toggled', {
      feature,
      enabled,
      timestamp: new Date()
    });
  }

  /**
   * Emitir nuevo acceso
   */
  emitAccessLog(communityId: string, accessLog: any) {
    this.emitToCommunity(communityId, 'access.new', {
      access: accessLog,
      timestamp: new Date()
    });
  }

  /**
   * Emitir alerta de dispositivo
   */
  emitDeviceAlert(communityId: string, deviceId: string, alert: any) {
    this.emitToCommunity(communityId, 'device.alert', {
      device_id: deviceId,
      alert,
      timestamp: new Date()
    });
  }

  /**
   * Emitir actualización de estado de dispositivo
   */
  emitDeviceStatus(communityId: string, deviceId: string, status: string) {
    this.emitToCommunity(communityId, 'device.status', {
      device_id: deviceId,
      status,
      timestamp: new Date()
    });
  }

  /**
   * Obtener usuarios conectados
   */
  getConnectedUsers(): string[] {
    return Array.from(this.userSockets.keys());
  }

  /**
   * Verificar si un usuario está conectado
   */
  isUserConnected(userId: string): boolean {
    return this.userSockets.has(userId) && this.userSockets.get(userId)!.size > 0;
  }

  /**
   * Obtener número de conexiones de un usuario
   */
  getUserConnectionCount(userId: string): number {
    return this.userSockets.get(userId)?.size || 0;
  }

  /**
   * Forzar desconexión de un usuario
   */
  async disconnectUser(userId: string, reason?: string) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('force.disconnect', { reason });
          socket.disconnect(true);
        }
      });
    }
  }
}

// Instancia singleton (se inicializa en server.ts)
export let websocketService: WebSocketService;