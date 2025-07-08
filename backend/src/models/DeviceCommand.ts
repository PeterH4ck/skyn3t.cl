// DeviceCommand.ts
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
  Scopes,
  BeforeCreate
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import { Device } from './Device';
import { User } from './User';

export enum CommandStatus {
  PENDING = 'pending',
  SENT = 'sent',
  ACKNOWLEDGED = 'acknowledged',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout'
}

@Scopes(() => ({
  withDevice: {
    include: [{
      model: Device,
      as: 'device'
    }]
  },
  withCreatedBy: {
    include: [{
      model: User,
      as: 'createdBy',
      attributes: ['id', 'first_name', 'last_name']
    }]
  },
  pending: {
    where: {
      status: CommandStatus.PENDING
    }
  },
  failed: {
    where: {
      status: CommandStatus.FAILED
    }
  },
  completed: {
    where: {
      status: CommandStatus.COMPLETED
    }
  }
}))
@Table({
  tableName: 'device_commands_queue',
  timestamps: true,
  underscored: true
})
export class DeviceCommand extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => Device)
  @Column(DataType.UUID)
  device_id?: string;

  @AllowNull(false)
  @Column(DataType.STRING(100))
  command!: string;

  @Default({})
  @Column(DataType.JSONB)
  parameters!: any;

  @Default(0)
  @Column(DataType.INTEGER)
  priority!: number;

  @Column(DataType.DATE)
  scheduled_at?: Date;

  @Column(DataType.DATE)
  sent_at?: Date;

  @Column(DataType.DATE)
  acknowledged_at?: Date;

  @Column(DataType.DATE)
  completed_at?: Date;

  @Default(CommandStatus.PENDING)
  @Column(DataType.ENUM(...Object.values(CommandStatus)))
  status!: CommandStatus;

  @Default(0)
  @Column(DataType.INTEGER)
  retry_count!: number;

  @Column(DataType.TEXT)
  error_message?: string;

  @Column(DataType.JSONB)
  response_data?: any;

  @Column(DataType.DATE)
  created_at!: Date;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  created_by?: string;

  // Asociaciones
  @BelongsTo(() => Device)
  device?: Device;

  @BelongsTo(() => User)
  createdBy?: User;

  // Hooks
  @BeforeCreate
  static setScheduledAt(command: DeviceCommand) {
    if (!command.scheduled_at) {
      command.scheduled_at = new Date();
    }
  }

  // Métodos de instancia
  async markAsSent(): Promise<void> {
    this.status = CommandStatus.SENT;
    this.sent_at = new Date();
    await this.save();
  }

  async markAsAcknowledged(): Promise<void> {
    this.status = CommandStatus.ACKNOWLEDGED;
    this.acknowledged_at = new Date();
    await this.save();
  }

  async markAsCompleted(responseData?: any): Promise<void> {
    this.status = CommandStatus.COMPLETED;
    this.completed_at = new Date();
    if (responseData) {
      this.response_data = responseData;
    }
    await this.save();
  }

  async markAsFailed(errorMessage: string): Promise<void> {
    this.status = CommandStatus.FAILED;
    this.error_message = errorMessage;
    this.retry_count += 1;
    await this.save();
  }

  async retry(): Promise<void> {
    if (this.retry_count < 3) { // Max 3 reintentos
      this.status = CommandStatus.PENDING;
      this.scheduled_at = new Date(Date.now() + (this.retry_count * 30000)); // Backoff exponencial
      this.error_message = null;
      await this.save();
    }
  }

  isExpired(): boolean {
    if (!this.scheduled_at) return false;
    const expiryTime = new Date(this.scheduled_at.getTime() + (5 * 60 * 1000)); // 5 minutos
    return new Date() > expiryTime;
  }

  // Métodos estáticos
  static async getPendingCommands(deviceId?: string): Promise<DeviceCommand[]> {
    const where: any = { status: CommandStatus.PENDING };
    if (deviceId) where.device_id = deviceId;

    return this.findAll({
      where,
      order: [['priority', 'DESC'], ['created_at', 'ASC']]
    });
  }

  static async getNextCommand(deviceId: string): Promise<DeviceCommand | null> {
    return this.findOne({
      where: {
        device_id: deviceId,
        status: CommandStatus.PENDING,
        scheduled_at: {
          [Op.lte]: new Date()
        }
      },
      order: [['priority', 'DESC'], ['created_at', 'ASC']]
    });
  }

  static async cleanupExpiredCommands(): Promise<number> {
    const expiredTime = new Date(Date.now() - (10 * 60 * 1000)); // 10 minutos
    
    const expiredCommands = await this.findAll({
      where: {
        status: CommandStatus.PENDING,
        created_at: {
          [Op.lt]: expiredTime
        }
      }
    });

    for (const command of expiredCommands) {
      await command.markAsFailed('Command timeout');
    }

    return expiredCommands.length;
  }
}
