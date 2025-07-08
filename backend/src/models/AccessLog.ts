import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  AllowNull,
  BelongsTo,
  ForeignKey,
  Scopes
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import { Community } from './Community';
import { AccessPoint } from './AccessPoint';
import { User } from './User';
import { Vehicle } from './Vehicle';

export enum AccessMethod {
  QR = 'qr',
  RFID = 'rfid',
  FINGERPRINT = 'fingerprint',
  FACIAL = 'facial',
  LPR = 'lpr',
  APP = 'app',
  MANUAL = 'manual'
}

export enum AccessDirection {
  ENTRY = 'entry',
  EXIT = 'exit'
}

@Scopes(() => ({
  byCommunity: (communityId: string) => ({
    where: {
      community_id: communityId
    }
  }),
  byUser: (userId: string) => ({
    where: {
      user_id: userId
    }
  }),
  byDate: (startDate: Date, endDate: Date) => ({
    where: {
      created_at: {
        [Op.between]: [startDate, endDate]
      }
    }
  }),
  authorized: {
    where: {
      authorized: true
    }
  },
  denied: {
    where: {
      authorized: false
    }
  },
  withDetails: {
    include: [
      {
        model: AccessPoint,
        as: 'accessPoint',
        attributes: ['id', 'code', 'name', 'type']
      },
      {
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'first_name', 'last_name', 'email']
      },
      {
        model: Vehicle,
        as: 'vehicle',
        attributes: ['id', 'license_plate', 'brand', 'model', 'color']
      },
      {
        model: User,
        as: 'authorizer',
        attributes: ['id', 'username', 'first_name', 'last_name']
      }
    ]
  }
}))
@Table({
  tableName: 'access_logs',
  timestamps: false,
  underscored: true,
  indexes: [
    {
      fields: ['community_id', 'created_at']
    },
    {
      fields: ['user_id', 'created_at']
    },
    {
      fields: ['access_point_id', 'created_at']
    },
    {
      fields: ['vehicle_id']
    }
  ]
})
export class AccessLog extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => Community)
  @AllowNull(false)
  @Column(DataType.UUID)
  community_id!: string;

  @ForeignKey(() => AccessPoint)
  @Column(DataType.UUID)
  access_point_id?: string;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  user_id?: string;

  @ForeignKey(() => Vehicle)
  @Column(DataType.UUID)
  vehicle_id?: string;

  @AllowNull(false)
  @Column(DataType.ENUM(...Object.values(AccessMethod)))
  access_method!: AccessMethod;

  @AllowNull(false)
  @Column(DataType.ENUM(...Object.values(AccessDirection)))
  direction!: AccessDirection;

  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  authorized!: boolean;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  authorized_by?: string;

  @Column(DataType.TEXT)
  denial_reason?: string;

  @Column(DataType.STRING(500))
  photo_url?: string;

  @Column(DataType.DECIMAL(3, 1))
  temperature?: number; // Para control COVID

  @Default({})
  @Column(DataType.JSONB)
  metadata!: any;

  @Default(() => new Date())
  @Column(DataType.DATE)
  created_at!: Date;

  // Asociaciones
  @BelongsTo(() => Community)
  community?: Community;

  @BelongsTo(() => AccessPoint)
  accessPoint?: AccessPoint;

  @BelongsTo(() => User, 'user_id')
  user?: User;

  @BelongsTo(() => Vehicle)
  vehicle?: Vehicle;

  @BelongsTo(() => User, 'authorized_by')
  authorizer?: User;

  // Métodos de instancia
  getFormattedTime(): string {
    return new Date(this.created_at).toLocaleString('es-CL', {
      timeZone: 'America/Santiago',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  isHighRisk(): boolean {
    // Temperatura alta (COVID)
    if (this.temperature && this.temperature >= 37.5) return true;
    
    // Acceso denegado múltiples veces
    if (!this.authorized && this.metadata?.failed_attempts > 3) return true;
    
    // Horario inusual
    const hour = new Date(this.created_at).getHours();
    if (hour >= 2 && hour <= 5) return true;
    
    return false;
  }

  getDurationInside(): number | null {
    if (this.direction !== AccessDirection.ENTRY) return null;
    
    // TODO: Buscar log de salida correspondiente
    return null;
  }

  // Métodos estáticos
  static async createAccessLog(data: {
    community_id: string;
    access_point_id?: string;
    user_id?: string;
    vehicle_id?: string;
    access_method: AccessMethod;
    direction: AccessDirection;
    authorized: boolean;
    authorized_by?: string;
    denial_reason?: string;
    photo_url?: string;
    temperature?: number;
    metadata?: any;
  }): Promise<AccessLog> {
    const log = await this.create(data);

    // TODO: Emitir evento por WebSocket
    // websocketService.emit(`community.${data.community_id}.access`, {
    //   type: 'new_access',
    //   data: log.toJSON()
    // });

    // TODO: Verificar alertas (anti-passback, blacklist, etc.)
    
    return log;
  }

  static async getRecentAccess(communityId: string, limit: number = 10): Promise<AccessLog[]> {
    return this.scope([
      { method: ['byCommunity', communityId] },
      'withDetails'
    ]).findAll({
      order: [['created_at', 'DESC']],
      limit
    });
  }

  static async getUserLastAccess(userId: string): Promise<AccessLog | null> {
    return this.scope([
      { method: ['byUser', userId] },
      'withDetails'
    ]).findOne({
      order: [['created_at', 'DESC']]
    });
  }

  static async checkAntiPassback(userId: string, accessPointId: string): Promise<boolean> {
    const lastAccess = await this.findOne({
      where: {
        user_id: userId,
        authorized: true
      },
      order: [['created_at', 'DESC']]
    });

    if (!lastAccess) return true; // Primera vez, permitir

    // Si el último acceso fue entrada y ahora es entrada de nuevo, denegar
    if (lastAccess.direction === AccessDirection.ENTRY && 
        lastAccess.access_point_id === accessPointId) {
      
      // Verificar si ha pasado suficiente tiempo (ej: 30 segundos)
      const timeDiff = Date.now() - new Date(lastAccess.created_at).getTime();
      if (timeDiff < 30000) {
        return false; // Anti-passback activado
      }
    }

    return true;
  }

  static async getDailyStats(communityId: string, date: Date): Promise<any> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const logs = await this.findAll({
      where: {
        community_id: communityId,
        created_at: {
          [Op.between]: [startOfDay, endOfDay]
        }
      }
    });

    const stats = {
      total: logs.length,
      entries: logs.filter(l => l.direction === AccessDirection.ENTRY).length,
      exits: logs.filter(l => l.direction === AccessDirection.EXIT).length,
      authorized: logs.filter(l => l.authorized).length,
      denied: logs.filter(l => !l.authorized).length,
      byMethod: {} as Record<string, number>,
      byHour: Array(24).fill(0),
      uniqueUsers: new Set(logs.filter(l => l.user_id).map(l => l.user_id)).size,
      uniqueVehicles: new Set(logs.filter(l => l.vehicle_id).map(l => l.vehicle_id)).size
    };

    // Estadísticas por método
    for (const method of Object.values(AccessMethod)) {
      stats.byMethod[method] = logs.filter(l => l.access_method === method).length;
    }

    // Estadísticas por hora
    logs.forEach(log => {
      const hour = new Date(log.created_at).getHours();
      stats.byHour[hour]++;
    });

    return stats;
  }
}