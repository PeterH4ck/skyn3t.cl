import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  Unique,
  AllowNull,
  BelongsTo,
  HasMany,
  ForeignKey,
  Scopes,
  BeforeCreate,
  BeforeUpdate
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import { Community } from './Community';
import { Building } from './Building';
import { Floor } from './Floor';
import { AccessPoint } from './AccessPoint';
import { DeviceCommand } from './DeviceCommand';
import { DeviceHeartbeat } from './DeviceHeartbeat';

export enum DeviceType {
  LPR = 'lpr',
  RFID = 'rfid',
  BIOMETRIC = 'biometric',
  QR = 'qr',
  MOBILE = 'mobile',
  CONTROLLER = 'controller'
}

export enum DeviceStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  MAINTENANCE = 'maintenance',
  ERROR = 'error'
}

@Scopes(() => ({
  online: {
    where: {
      status: DeviceStatus.ONLINE
    }
  },
  offline: {
    where: {
      status: DeviceStatus.OFFLINE
    }
  },
  byCommunity: (communityId: string) => ({
    where: {
      community_id: communityId
    }
  }),
  byType: (type: DeviceType) => ({
    where: {
      type: type
    }
  }),
  withLocation: {
    include: [
      {
        model: Building,
        as: 'building',
        attributes: ['id', 'name', 'code']
      },
      {
        model: Floor,
        as: 'floor',
        attributes: ['id', 'floor_number', 'name']
      }
    ]
  },
  withHeartbeat: {
    include: [{
      model: DeviceHeartbeat,
      as: 'heartbeats',
      limit: 1,
      order: [['created_at', 'DESC']]
    }]
  }
}))
@Table({
  tableName: 'devices',
  timestamps: true,
  underscored: true
})
export class Device extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => Community)
  @AllowNull(false)
  @Column(DataType.UUID)
  community_id!: string;

  @AllowNull(false)
  @Column(DataType.STRING(100))
  code!: string;

  @AllowNull(false)
  @Column(DataType.STRING(200))
  name!: string;

  @AllowNull(false)
  @Column(DataType.ENUM(...Object.values(DeviceType)))
  type!: DeviceType;

  @Default(DeviceStatus.OFFLINE)
  @Column(DataType.ENUM(...Object.values(DeviceStatus)))
  status!: DeviceStatus;

  @Column(DataType.STRING(100))
  model?: string;

  @Column(DataType.STRING(100))
  manufacturer?: string;

  @Column(DataType.STRING(100))
  serial_number?: string;

  @Column(DataType.STRING(50))
  firmware_version?: string;

  @Column(DataType.INET)
  ip_address?: string;

  @Column(DataType.STRING(17))
  mac_address?: string;

  @Column(DataType.TEXT)
  location?: string;

  @ForeignKey(() => Building)
  @Column(DataType.UUID)
  building_id?: string;

  @ForeignKey(() => Floor)
  @Column(DataType.UUID)
  floor_id?: string;

  @Column(DataType.DATE)
  last_heartbeat?: Date;

  @Default({})
  @Column(DataType.JSONB)
  configuration!: any;

  @Default({})
  @Column(DataType.JSONB)
  metadata!: any;

  @Default(true)
  @Column(DataType.BOOLEAN)
  is_active!: boolean;

  @Column(DataType.DATE)
  created_at!: Date;

  @Column(DataType.DATE)
  updated_at!: Date;

  // Asociaciones
  @BelongsTo(() => Community)
  community?: Community;

  @BelongsTo(() => Building)
  building?: Building;

  @BelongsTo(() => Floor)
  floor?: Floor;

  @HasMany(() => AccessPoint)
  accessPoints?: AccessPoint[];

  @HasMany(() => DeviceCommand)
  commands?: DeviceCommand[];

  @HasMany(() => DeviceHeartbeat)
  heartbeats?: DeviceHeartbeat[];

  // Hooks
  @BeforeCreate
  @BeforeUpdate
  static async generateUniqueCode(device: Device) {
    if (!device.code && device.community_id) {
      const count = await Device.count({
        where: { community_id: device.community_id }
      });
      device.code = `DEV-${device.type.toUpperCase()}-${(count + 1).toString().padStart(4, '0')}`;
    }
  }

  // Métodos de instancia
  isOnline(): boolean {
    if (!this.last_heartbeat) return false;
    
    const heartbeatThreshold = this.getHeartbeatThreshold();
    const now = new Date();
    const lastHeartbeat = new Date(this.last_heartbeat);
    const diffSeconds = (now.getTime() - lastHeartbeat.getTime()) / 1000;
    
    return diffSeconds <= heartbeatThreshold;
  }

  getHeartbeatThreshold(): number {
    // Obtener threshold de configuración o usar default
    const communitySettings = this.configuration?.heartbeat_threshold;
    const defaultThreshold = 300; // 5 minutos
    
    return communitySettings || defaultThreshold;
  }

  async updateStatus(newStatus: DeviceStatus, reason?: string): Promise<void> {
    const oldStatus = this.status;
    this.status = newStatus;
    
    if (reason) {
      this.metadata.last_status_change = {
        from: oldStatus,
        to: newStatus,
        reason: reason,
        timestamp: new Date()
      };
    }
    
    await this.save();
  }

  async sendCommand(command: string, parameters?: any): Promise<DeviceCommand> {
    const deviceCommand = await DeviceCommand.create({
      device_id: this.id,
      command: command,
      parameters: parameters || {},
      status: 'pending'
    });

    // TODO: Enviar comando por MQTT
    // mqttService.publish(`device/${this.id}/command`, {
    //   id: deviceCommand.id,
    //   command: command,
    //   parameters: parameters
    // });

    return deviceCommand;
  }

  async recordHeartbeat(data?: any): Promise<void> {
    this.last_heartbeat = new Date();
    
    if (this.status === DeviceStatus.OFFLINE) {
      this.status = DeviceStatus.ONLINE;
    }
    
    await this.save();

    // Registrar heartbeat detallado
    await DeviceHeartbeat.create({
      device_id: this.id,
      timestamp: new Date(),
      data: data || {}
    });
  }

  getConfiguration(key: string, defaultValue?: any): any {
    return this.configuration[key] || defaultValue;
  }

  async updateConfiguration(key: string, value: any): Promise<void> {
    this.configuration[key] = value;
    await this.save();
  }

  async updateConfigurationBatch(config: Record<string, any>): Promise<void> {
    this.configuration = { ...this.configuration, ...config };
    await this.save();
  }

  getMQTTTopic(suffix?: string): string {
    const base = `skyn3t/${this.community_id}/device/${this.id}`;
    return suffix ? `${base}/${suffix}` : base;
  }

  canBeControlledBy(userId: string): boolean {
    // TODO: Implementar lógica de permisos
    return true;
  }

  // Métodos estáticos
  static async findByCode(communityId: string, code: string): Promise<Device | null> {
    return this.findOne({
      where: {
        community_id: communityId,
        code: code
      }
    });
  }

  static async getOnlineDevices(communityId: string): Promise<Device[]> {
    return this.scope(['online', { method: ['byCommunity', communityId] }]).findAll();
  }

  static async getOfflineDevices(communityId: string): Promise<Device[]> {
    const devices = await this.scope({ method: ['byCommunity', communityId] }).findAll();
    
    return devices.filter(device => !device.isOnline());
  }

  static async getDevicesByType(communityId: string, type: DeviceType): Promise<Device[]> {
    return this.scope([
      { method: ['byCommunity', communityId] },
      { method: ['byType', type] }
    ]).findAll();
  }

  static async updateOfflineStatuses(): Promise<number> {
    const devices = await this.findAll({
      where: {
        status: DeviceStatus.ONLINE
      }
    });

    let updatedCount = 0;

    for (const device of devices) {
      if (!device.isOnline()) {
        await device.updateStatus(DeviceStatus.OFFLINE, 'No heartbeat received');
        updatedCount++;
      }
    }

    return updatedCount;
  }

  // Configuración por tipo de dispositivo
  static readonly DEFAULT_CONFIG = {
    [DeviceType.LPR]: {
      confidence_threshold: 0.85,
      capture_mode: 'motion',
      resolution: '1920x1080',
      fps: 15
    },
    [DeviceType.RFID]: {
      read_distance: 5,
      frequency: '125kHz',
      anti_collision: true
    },
    [DeviceType.BIOMETRIC]: {
      fingerprint_quality: 500,
      face_recognition: true,
      liveness_detection: true
    },
    [DeviceType.QR]: {
      scan_interval: 100,
      error_correction: 'M',
      auto_focus: true
    },
    [DeviceType.CONTROLLER]: {
      relay_count: 4,
      input_count: 4,
      wiegand_enabled: true
    }
  };
}