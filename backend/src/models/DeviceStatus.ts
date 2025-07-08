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
  Index
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import { Device, DeviceStatus as DeviceStatusEnum } from './Device';

@Table({
  tableName: 'device_status',
  timestamps: false,
  underscored: true,
  indexes: [
    {
      fields: ['device_id', 'recorded_at']
    },
    {
      fields: ['recorded_at']
    },
    {
      fields: ['status']
    }
  ]
})
export class DeviceStatus extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => Device)
  @AllowNull(false)
  @Column(DataType.UUID)
  device_id!: string;

  @AllowNull(false)
  @Column(DataType.ENUM(...Object.values(DeviceStatusEnum)))
  status!: DeviceStatusEnum;

  @Column(DataType.DECIMAL(5, 2))
  cpu_usage?: number;

  @Column(DataType.DECIMAL(5, 2))
  memory_usage?: number;

  @Column(DataType.DECIMAL(5, 2))
  disk_usage?: number;

  @Column(DataType.DECIMAL(5, 2))
  temperature?: number;

  @Column(DataType.BIGINT)
  uptime_seconds?: number;

  @Default(0)
  @Column(DataType.INTEGER)
  error_count!: number;

  @Column(DataType.TEXT)
  last_error?: string;

  @Column(DataType.JSONB)
  metrics?: {
    network?: {
      bytes_sent?: number;
      bytes_received?: number;
      packets_sent?: number;
      packets_received?: number;
    };
    hardware?: {
      firmware_version?: string;
      serial_number?: string;
      model?: string;
    };
    performance?: {
      response_time_ms?: number;
      success_rate?: number;
      commands_processed?: number;
    };
    custom?: Record<string, any>;
  };

  @Default(new Date())
  @Column(DataType.DATE)
  recorded_at!: Date;

  // Associations
  @BelongsTo(() => Device)
  device?: Device;

  // Instance methods
  get uptimeFormatted(): string {
    if (!this.uptime_seconds) return '0s';

    const days = Math.floor(this.uptime_seconds / 86400);
    const hours = Math.floor((this.uptime_seconds % 86400) / 3600);
    const minutes = Math.floor((this.uptime_seconds % 3600) / 60);
    const seconds = this.uptime_seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(' ');
  }

  get isHealthy(): boolean {
    return this.status === DeviceStatusEnum.ONLINE && 
           (this.cpu_usage || 0) < 90 &&
           (this.memory_usage || 0) < 90 &&
           (this.temperature || 0) < 70;
  }

  get alertLevel(): 'normal' | 'warning' | 'critical' {
    if (this.status === DeviceStatusEnum.ERROR || 
        (this.temperature || 0) > 80 ||
        (this.cpu_usage || 0) > 95 ||
        (this.memory_usage || 0) > 95) {
      return 'critical';
    }

    if (this.status === DeviceStatusEnum.OFFLINE ||
        (this.temperature || 0) > 70 ||
        (this.cpu_usage || 0) > 80 ||
        (this.memory_usage || 0) > 80 ||
        this.error_count > 0) {
      return 'warning';
    }

    return 'normal';
  }

  // Static methods
  static async getLatestByDevice(deviceId: string): Promise<DeviceStatus | null> {
    return this.findOne({
      where: { device_id: deviceId },
      order: [['recorded_at', 'DESC']]
    });
  }

  static async getHistoryByDevice(
    deviceId: string,
    hours: number = 24
  ): Promise<DeviceStatus[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    return this.findAll({
      where: {
        device_id: deviceId,
        recorded_at: {
          $gte: since
        }
      },
      order: [['recorded_at', 'ASC']]
    });
  }

  static async getAverageMetrics(
    deviceId: string,
    hours: number = 24
  ): Promise<{
    avgCpuUsage: number;
    avgMemoryUsage: number;
    avgTemperature: number;
    uptimePercentage: number;
  }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const result = await this.findAll({
      where: {
        device_id: deviceId,
        recorded_at: {
          $gte: since
        }
      },
      attributes: [
        [this.sequelize!.fn('AVG', this.sequelize!.col('cpu_usage')), 'avgCpuUsage'],
        [this.sequelize!.fn('AVG', this.sequelize!.col('memory_usage')), 'avgMemoryUsage'],
        [this.sequelize!.fn('AVG', this.sequelize!.col('temperature')), 'avgTemperature'],
        [this.sequelize!.fn('COUNT', this.sequelize!.col('id')), 'totalRecords']
      ],
      raw: true
    });

    const onlineRecords = await this.count({
      where: {
        device_id: deviceId,
        recorded_at: {
          $gte: since
        },
        status: DeviceStatusEnum.ONLINE
      }
    });

    const data = result[0] as any;
    const uptimePercentage = data.totalRecords > 0 
      ? (onlineRecords / data.totalRecords) * 100 
      : 0;

    return {
      avgCpuUsage: parseFloat(data.avgCpuUsage || '0'),
      avgMemoryUsage: parseFloat(data.avgMemoryUsage || '0'),
      avgTemperature: parseFloat(data.avgTemperature || '0'),
      uptimePercentage
    };
  }

  static async getDevicesWithIssues(): Promise<DeviceStatus[]> {
    return this.findAll({
      where: {
        $or: [
          { status: DeviceStatusEnum.ERROR },
          { status: DeviceStatusEnum.OFFLINE },
          { cpu_usage: { $gt: 90 } },
          { memory_usage: { $gt: 90 } },
          { temperature: { $gt: 70 } },
          { error_count: { $gt: 0 } }
        ]
      },
      include: ['device'],
      order: [['recorded_at', 'DESC']]
    });
  }

  static async cleanup(daysToKeep: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    
    const deletedCount = await this.destroy({
      where: {
        recorded_at: {
          $lt: cutoffDate
        }
      }
    });

    return deletedCount;
  }

  toJSON() {
    const values = super.toJSON() as any;
    values.uptime_formatted = this.uptimeFormatted;
    values.is_healthy = this.isHealthy;
    values.alert_level = this.alertLevel;
    return values;
  }
}
