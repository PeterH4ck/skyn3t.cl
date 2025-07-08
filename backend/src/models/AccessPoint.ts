import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  AllowNull,
  BelongsTo,
  HasMany,
  ForeignKey,
  Index
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import { Community } from './Community';
import { Building } from './Building';
import { Floor } from './Floor';
import { Device } from './Device';
import { AccessLog } from './AccessLog';

export enum AccessPointType {
  DOOR = 'door',
  GATE = 'gate',
  BARRIER = 'barrier',
  ELEVATOR = 'elevator',
  TURNSTILE = 'turnstile'
}

export enum AccessDirection {
  IN = 'in',
  OUT = 'out',
  BOTH = 'both'
}

@Table({
  tableName: 'access_points',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['community_id']
    },
    {
      fields: ['building_id']
    },
    {
      fields: ['device_id']
    },
    {
      fields: ['is_active']
    }
  ]
})
export class AccessPoint extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => Community)
  @AllowNull(false)
  @Column(DataType.UUID)
  community_id!: string;

  @ForeignKey(() => Building)
  @Column(DataType.UUID)
  building_id?: string;

  @ForeignKey(() => Floor)
  @Column(DataType.UUID)
  floor_id?: string;

  @ForeignKey(() => Device)
  @Column(DataType.UUID)
  device_id?: string;

  @AllowNull(false)
  @Column(DataType.STRING(200))
  name!: string;

  @Default(AccessPointType.DOOR)
  @Column(DataType.ENUM(...Object.values(AccessPointType)))
  type!: AccessPointType;

  @Default(AccessDirection.BOTH)
  @Column(DataType.ENUM(...Object.values(AccessDirection)))
  direction!: AccessDirection;

  @Column(DataType.STRING(500))
  location?: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  is_emergency_exit!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  anti_passback_enabled!: boolean;

  @Column(DataType.STRING(50))
  interlock_group?: string;

  @Column(DataType.UUID)
  schedule_id?: string;

  @Column(DataType.JSONB)
  access_methods?: {
    card?: boolean;
    facial?: boolean;
    qr?: boolean;
    pin?: boolean;
    biometric?: boolean;
    manual?: boolean;
  };

  @Column(DataType.JSONB)
  configuration?: {
    unlock_duration?: number; // seconds
    auto_lock?: boolean;
    door_sensor?: boolean;
    camera_enabled?: boolean;
    two_person_rule?: boolean;
    visitor_escort_required?: boolean;
  };

  @Column(DataType.JSONB)
  operating_hours?: {
    monday?: { start: string; end: string; enabled: boolean };
    tuesday?: { start: string; end: string; enabled: boolean };
    wednesday?: { start: string; end: string; enabled: boolean };
    thursday?: { start: string; end: string; enabled: boolean };
    friday?: { start: string; end: string; enabled: boolean };
    saturday?: { start: string; end: string; enabled: boolean };
    sunday?: { start: string; end: string; enabled: boolean };
  };

  @Default(true)
  @Column(DataType.BOOLEAN)
  is_active!: boolean;

  @Column(DataType.DATE)
  created_at!: Date;

  @Column(DataType.DATE)
  updated_at!: Date;

  // Associations
  @BelongsTo(() => Community)
  community?: Community;

  @BelongsTo(() => Building)
  building?: Building;

  @BelongsTo(() => Floor)
  floor?: Floor;

  @BelongsTo(() => Device)
  device?: Device;

  @HasMany(() => AccessLog, { foreignKey: 'access_point_id' })
  accessLogs?: AccessLog[];

  // Instance methods
  get fullLocation(): string {
    const parts = [];
    if (this.building?.name) parts.push(this.building.name);
    if (this.floor?.name) parts.push(this.floor.name);
    if (this.location) parts.push(this.location);
    return parts.join(' - ') || this.name;
  }

  async isCurrentlyOperational(): Promise<boolean> {
    if (!this.is_active) return false;

    // Check device status if connected
    if (this.device) {
      await this.device.reload();
      if (this.device.status !== 'online') return false;
    }

    // Check operating hours
    if (this.operating_hours) {
      const now = new Date();
      const dayName = now.toLocaleLowerCase() as keyof typeof this.operating_hours;
      const todayHours = this.operating_hours[dayName];

      if (todayHours && !todayHours.enabled) return false;

      if (todayHours && todayHours.start && todayHours.end) {
        const currentTime = now.toTimeString().slice(0, 5);
        if (currentTime < todayHours.start || currentTime > todayHours.end) {
          return false;
        }
      }
    }

    return true;
  }

  async getAccessStats(days: number = 30): Promise<{
    totalAccesses: number;
    grantedAccesses: number;
    deniedAccesses: number;
    successRate: number;
    uniqueUsers: number;
  }> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const totalAccesses = await AccessLog.count({
      where: {
        access_point_id: this.id,
        access_time: { $gte: since }
      }
    });

    const grantedAccesses = await AccessLog.count({
      where: {
        access_point_id: this.id,
        access_time: { $gte: since },
        granted: true
      }
    });

    const uniqueUsers = await AccessLog.count({
      where: {
        access_point_id: this.id,
        access_time: { $gte: since }
      },
      distinct: true,
      col: 'user_id'
    });

    const deniedAccesses = totalAccesses - grantedAccesses;
    const successRate = totalAccesses > 0 ? (grantedAccesses / totalAccesses) * 100 : 0;

    return {
      totalAccesses,
      grantedAccesses,
      deniedAccesses,
      successRate,
      uniqueUsers
    };
  }

  async getRecentAccessLogs(limit: number = 50): Promise<AccessLog[]> {
    return AccessLog.findAll({
      where: { access_point_id: this.id },
      include: ['user'],
      order: [['access_time', 'DESC']],
      limit
    });
  }

  async sendUnlockCommand(durationSeconds?: number): Promise<boolean> {
    if (!this.device) {
      throw new Error('No device connected to this access point');
    }

    const duration = durationSeconds || this.configuration?.unlock_duration || 5;
    
    // This would integrate with the device service
    // For now, return true as placeholder
    return true;
  }

  // Static methods
  static async findByCommunity(communityId: string): Promise<AccessPoint[]> {
    return this.findAll({
      where: { community_id: communityId },
      include: ['building', 'floor', 'device'],
      order: [['name', 'ASC']]
    });
  }

  static async findByBuilding(buildingId: string): Promise<AccessPoint[]> {
    return this.findAll({
      where: { building_id: buildingId },
      include: ['floor', 'device'],
      order: [['name', 'ASC']]
    });
  }

  static async findOperational(communityId?: string): Promise<AccessPoint[]> {
    const where: any = { is_active: true };
    if (communityId) where.community_id = communityId;

    const accessPoints = await this.findAll({
      where,
      include: ['device']
    });

    // Filter by operational status
    const operational = [];
    for (const point of accessPoints) {
      if (await point.isCurrentlyOperational()) {
        operational.push(point);
      }
    }

    return operational;
  }

  static async findByDevice(deviceId: string): Promise<AccessPoint | null> {
    return this.findOne({
      where: { device_id: deviceId },
      include: ['community', 'building', 'floor']
    });
  }

  toJSON() {
    const values = super.toJSON() as any;
    values.full_location = this.fullLocation;
    return values;
  }
}