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
  BelongsToMany,
  HasMany,
  ForeignKey,
  Scopes
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import { Country } from './Country';
import { User } from './User';
import { CommunityMember } from './CommunityMember';
import { Feature } from './Feature';
import { CommunityFeature } from './CommunityFeature';
import { Building } from './Building';
import { Device } from './Device';
import { Vehicle } from './Vehicle';
import { AccessPoint } from './AccessPoint';
import { AccessLog } from './AccessLog';
import { Invitation } from './Invitation';

export enum CommunityType {
  BUILDING = 'building',
  CONDOMINIUM = 'condominium',
  OFFICE = 'office',
  INDUSTRIAL = 'industrial',
  GATED_COMMUNITY = 'gated_community'
}

@Scopes(() => ({
  active: {
    where: {
      is_active: true
    }
  },
  withFeatures: {
    include: [{
      model: Feature,
      as: 'features',
      through: {
        attributes: ['enabled', 'custom_settings', 'valid_from', 'valid_until']
      }
    }]
  },
  withMembers: {
    include: [{
      model: User,
      as: 'members',
      through: {
        attributes: ['member_type', 'unit_id', 'valid_from', 'valid_until', 'is_active']
      }
    }]
  },
  withBuildings: {
    include: [{
      model: Building,
      as: 'buildings',
      include: [{
        model: Floor,
        as: 'floors',
        include: [{
          model: Unit,
          as: 'units'
        }]
      }]
    }]
  },
  withStats: {
    attributes: {
      include: [
        [sequelize.literal('(SELECT COUNT(*) FROM community_members WHERE community_id = "Community"."id" AND is_active = true)'), 'active_members_count'],
        [sequelize.literal('(SELECT COUNT(*) FROM buildings WHERE community_id = "Community"."id" AND is_active = true)'), 'buildings_count'],
        [sequelize.literal('(SELECT COUNT(*) FROM devices WHERE community_id = "Community"."id" AND status = \'online\')'), 'online_devices_count']
      ]
    }
  }
}))
@Table({
  tableName: 'communities',
  timestamps: true,
  underscored: true
})
export class Community extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(50))
  code!: string;

  @AllowNull(false)
  @Column(DataType.STRING(200))
  name!: string;

  @AllowNull(false)
  @Column(DataType.ENUM(...Object.values(CommunityType)))
  type!: CommunityType;

  @ForeignKey(() => Country)
  @AllowNull(false)
  @Column(DataType.UUID)
  country_id!: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  address!: string;

  @AllowNull(false)
  @Column(DataType.STRING(100))
  city!: string;

  @Column(DataType.STRING(100))
  state?: string;

  @Column(DataType.STRING(20))
  postal_code?: string;

  @Column(DataType.DECIMAL(10, 8))
  latitude?: number;

  @Column(DataType.DECIMAL(11, 8))
  longitude?: number;

  @AllowNull(false)
  @Column(DataType.STRING(50))
  timezone!: string;

  @Column(DataType.STRING(200))
  contact_name?: string;

  @Column(DataType.STRING(255))
  contact_email?: string;

  @Column(DataType.STRING(20))
  contact_phone?: string;

  @Column(DataType.STRING(500))
  logo_url?: string;

  @Default({})
  @Column(DataType.JSONB)
  settings!: any;

  @Default({})
  @Column(DataType.JSONB)
  metadata!: any;

  @Column(DataType.UUID)
  subscription_plan_id?: string;

  @Column(DataType.DATE)
  subscription_expires_at?: Date;

  @Default(true)
  @Column(DataType.BOOLEAN)
  is_active!: boolean;

  @Column(DataType.DATE)
  created_at!: Date;

  @Column(DataType.DATE)
  updated_at!: Date;

  // Asociaciones
  @BelongsTo(() => Country)
  country?: Country;

  @BelongsToMany(() => User, () => CommunityMember)
  members?: User[];

  @BelongsToMany(() => Feature, () => CommunityFeature)
  features?: Feature[];

  @HasMany(() => Building)
  buildings?: Building[];

  @HasMany(() => Device)
  devices?: Device[];

  @HasMany(() => Vehicle)
  vehicles?: Vehicle[];

  @HasMany(() => AccessPoint)
  accessPoints?: AccessPoint[];

  @HasMany(() => AccessLog)
  accessLogs?: AccessLog[];

  @HasMany(() => Invitation)
  invitations?: Invitation[];

  @HasMany(() => CommunityMember)
  communityMembers?: CommunityMember[];

  @HasMany(() => CommunityFeature)
  communityFeatures?: CommunityFeature[];

  // Métodos de instancia
  async hasFeature(featureCode: string): Promise<boolean> {
    const features = await CommunityFeature.findOne({
      where: {
        community_id: this.id
      },
      include: [{
        model: Feature,
        as: 'feature',
        where: {
          code: featureCode
        }
      }]
    });

    return features ? features.enabled : false;
  }

  async enableFeature(featureId: string, settings?: any): Promise<void> {
    await CommunityFeature.upsert({
      community_id: this.id,
      feature_id: featureId,
      enabled: true,
      custom_settings: settings || {}
    });
  }

  async disableFeature(featureId: string): Promise<void> {
    await CommunityFeature.update(
      { enabled: false },
      {
        where: {
          community_id: this.id,
          feature_id: featureId
        }
      }
    );
  }

  async getEnabledFeatures(): Promise<Feature[]> {
    const communityFeatures = await CommunityFeature.findAll({
      where: {
        community_id: this.id,
        enabled: true
      },
      include: [{
        model: Feature,
        as: 'feature'
      }]
    });

    return communityFeatures.map(cf => cf.feature!).filter(f => f);
  }

  async getMemberCount(type?: string): Promise<number> {
    const where: any = {
      community_id: this.id,
      is_active: true
    };

    if (type) {
      where.member_type = type;
    }

    return CommunityMember.count({ where });
  }

  async getActiveDeviceCount(): Promise<number> {
    return Device.count({
      where: {
        community_id: this.id,
        status: 'online'
      }
    });
  }

  async getMonthlyRevenue(): Promise<number> {
    // TODO: Implementar cálculo de ingresos mensuales
    return 0;
  }

  async getOccupancyRate(): Promise<number> {
    // TODO: Implementar cálculo de tasa de ocupación
    return 0;
  }

  getSetting(key: string, defaultValue?: any): any {
    return this.settings[key] || defaultValue;
  }

  async updateSetting(key: string, value: any): Promise<void> {
    this.settings[key] = value;
    await this.save();
  }

  async updateSettings(settings: Record<string, any>): Promise<void> {
    this.settings = { ...this.settings, ...settings };
    await this.save();
  }

  isSubscriptionActive(): boolean {
    if (!this.subscription_expires_at) return true;
    return new Date() < new Date(this.subscription_expires_at);
  }

  getDaysUntilSubscriptionExpires(): number {
    if (!this.subscription_expires_at) return Infinity;
    const now = new Date();
    const expires = new Date(this.subscription_expires_at);
    const diffTime = expires.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // Métodos estáticos
  static async findByCode(code: string): Promise<Community | null> {
    return this.findOne({ where: { code } });
  }

  static async getActiveCommunitiesByCountry(countryId: string): Promise<Community[]> {
    return this.scope('active').findAll({
      where: { country_id: countryId },
      order: [['name', 'ASC']]
    });
  }

  static async searchByName(query: string): Promise<Community[]> {
    return this.findAll({
      where: {
        name: {
          [Op.iLike]: `%${query}%`
        },
        is_active: true
      },
      limit: 10,
      order: [['name', 'ASC']]
    });
  }

  static async getCommunitiesWithExpiringSubscriptions(days: number = 30): Promise<Community[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return this.findAll({
      where: {
        subscription_expires_at: {
          [Op.between]: [new Date(), futureDate]
        },
        is_active: true
      },
      order: [['subscription_expires_at', 'ASC']]
    });
  }

  // Configuración por defecto para nuevas comunidades
  static readonly DEFAULT_SETTINGS = {
    access: {
      max_failed_attempts: 5,
      lockout_duration: 30, // minutos
      require_2fa_for_admins: true,
      allow_qr_access: true,
      allow_facial_recognition: false,
      anti_passback_enabled: true
    },
    financial: {
      currency: 'CLP',
      payment_due_day: 5,
      late_fee_percentage: 1.5,
      payment_reminder_days: [7, 3, 1],
      allow_partial_payments: true
    },
    notifications: {
      default_channels: ['email', 'in_app'],
      quiet_hours_start: '22:00',
      quiet_hours_end: '08:00',
      emergency_override_quiet_hours: true
    },
    invitations: {
      default_duration_hours: 24,
      max_uses_per_invitation: 1,
      require_vehicle_info: true,
      auto_approve: false
    },
    devices: {
      heartbeat_interval: 60, // segundos
      offline_threshold: 300, // segundos
      maintenance_reminder_days: 90
    }
  };
}