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
  ForeignKey,
  Scopes,
  BeforeCreate
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import { Community } from './Community';
import { User } from './User';
import crypto from 'crypto';

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  USED = 'used',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled'
}

@Scopes(() => ({
  active: {
    where: {
      is_active: true
    }
  },
  valid: {
    where: {
      is_active: true,
      valid_until: {
        [Op.gt]: new Date()
      }
    }
  },
  byHost: (hostId: string) => ({
    where: {
      host_id: hostId
    }
  }),
  byCommunity: (communityId: string) => ({
    where: {
      community_id: communityId
    }
  }),
  withHost: {
    include: [{
      model: User,
      as: 'host',
      attributes: ['id', 'username', 'first_name', 'last_name', 'email']
    }]
  },
  recent: {
    order: [['created_at', 'DESC']],
    limit: 20
  }
}))
@Table({
  tableName: 'invitations',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['access_code']
    },
    {
      fields: ['host_id']
    },
    {
      fields: ['community_id', 'created_at']
    },
    {
      fields: ['guest_email']
    }
  ]
})
export class Invitation extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => Community)
  @AllowNull(false)
  @Column(DataType.UUID)
  community_id!: string;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  host_id!: string;

  @AllowNull(false)
  @Column(DataType.STRING(200))
  guest_name!: string;

  @Column(DataType.STRING(255))
  guest_email?: string;

  @Column(DataType.STRING(20))
  guest_phone?: string;

  @Column(DataType.STRING(50))
  guest_document?: string;

  @Column(DataType.TEXT)
  purpose?: string;

  @Unique
  @Column(DataType.STRING(20))
  access_code!: string;

  @Column(DataType.STRING(500))
  qr_code_url?: string;

  @Default(['qr'])
  @Column(DataType.JSONB)
  access_methods!: string[];

  @Default(() => new Date())
  @Column(DataType.DATE)
  valid_from!: Date;

  @AllowNull(false)
  @Column(DataType.DATE)
  valid_until!: Date;

  @Default(1)
  @Column(DataType.INTEGER)
  max_uses!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  current_uses!: number;

  @Column(DataType.JSONB)
  vehicle_info?: any;

  @Default({})
  @Column(DataType.JSONB)
  metadata!: any;

  @Default(true)
  @Column(DataType.BOOLEAN)
  is_active!: boolean;

  @Default(InvitationStatus.PENDING)
  @Column(DataType.ENUM(...Object.values(InvitationStatus)))
  status!: InvitationStatus;

  @Column(DataType.DATE)
  created_at!: Date;

  @Column(DataType.DATE)
  updated_at!: Date;

  // Asociaciones
  @BelongsTo(() => Community)
  community?: Community;

  @BelongsTo(() => User)
  host?: User;

  // Hooks
  @BeforeCreate
  static async generateAccessCode(invitation: Invitation) {
    if (!invitation.access_code) {
      // Generar código único de 8 caracteres
      let code: string;
      let exists = true;
      
      while (exists) {
        code = crypto.randomBytes(4).toString('hex').toUpperCase();
        const existing = await Invitation.findOne({
          where: { access_code: code }
        });
        exists = !!existing;
      }
      
      invitation.access_code = code!;
    }
  }

  // Métodos de instancia
  isValid(): boolean {
    const now = new Date();
    return (
      this.is_active &&
      this.status !== InvitationStatus.CANCELLED &&
      now >= this.valid_from &&
      now <= this.valid_until &&
      this.current_uses < this.max_uses
    );
  }

  canBeUsed(): boolean {
    return this.isValid() && this.status !== InvitationStatus.EXPIRED;
  }

  async use(): Promise<boolean> {
    if (!this.canBeUsed()) {
      return false;
    }

    this.current_uses += 1;
    
    if (this.current_uses >= this.max_uses) {
      this.status = InvitationStatus.USED;
    }
    
    await this.save();
    return true;
  }

  async cancel(reason?: string): Promise<void> {
    this.status = InvitationStatus.CANCELLED;
    this.is_active = false;
    
    if (reason) {
      this.metadata.cancellation_reason = reason;
      this.metadata.cancelled_at = new Date();
    }
    
    await this.save();
  }

  async extend(hours: number): Promise<void> {
    const newValidUntil = new Date(this.valid_until);
    newValidUntil.setHours(newValidUntil.getHours() + hours);
    
    this.valid_until = newValidUntil;
    await this.save();
  }

  getShareableLink(): string {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return `${baseUrl}/invitation/${this.access_code}`;
  }

  getQRData(): object {
    return {
      type: 'invitation',
      code: this.access_code,
      host: this.host_id,
      guest: this.guest_name,
      valid_until: this.valid_until,
      community: this.community_id
    };
  }

  hasVehicleAccess(): boolean {
    return this.vehicle_info && this.vehicle_info.license_plate;
  }

  hasGPSAccess(): boolean {
    return this.access_methods.includes('gps');
  }

  // Métodos estáticos
  static async findByCode(code: string): Promise<Invitation | null> {
    return this.scope('withHost').findOne({
      where: { 
        access_code: code.toUpperCase(),
        is_active: true
      }
    });
  }

  static async getActiveInvitations(hostId: string): Promise<Invitation[]> {
    return this.scope(['valid', { method: ['byHost', hostId] }]).findAll({
      order: [['created_at', 'DESC']]
    });
  }

  static async expireOldInvitations(): Promise<number> {
    const result = await this.update(
      { 
        status: InvitationStatus.EXPIRED,
        is_active: false
      },
      {
        where: {
          valid_until: {
            [Op.lt]: new Date()
          },
          status: {
            [Op.notIn]: [InvitationStatus.EXPIRED, InvitationStatus.CANCELLED]
          }
        }
      }
    );

    return result[0];
  }

  static async getUsageStats(communityId: string, startDate?: Date, endDate?: Date): Promise<any> {
    const where: any = { community_id: communityId };
    
    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at[Op.gte] = startDate;
      if (endDate) where.created_at[Op.lte] = endDate;
    }

    const invitations = await this.findAll({ where });

    return {
      total: invitations.length,
      pending: invitations.filter(i => i.status === InvitationStatus.PENDING).length,
      accepted: invitations.filter(i => i.status === InvitationStatus.ACCEPTED).length,
      used: invitations.filter(i => i.status === InvitationStatus.USED).length,
      expired: invitations.filter(i => i.status === InvitationStatus.EXPIRED).length,
      cancelled: invitations.filter(i => i.status === InvitationStatus.CANCELLED).length,
      totalUses: invitations.reduce((sum, inv) => sum + inv.current_uses, 0),
      averageUsesPerInvitation: invitations.length > 0 
        ? invitations.reduce((sum, inv) => sum + inv.current_uses, 0) / invitations.length 
        : 0
    };
  }

  // Configuración por defecto
  static readonly DEFAULT_DURATION_HOURS = 24;
  static readonly MAX_DURATION_HOURS = 168; // 7 días
  static readonly DEFAULT_MAX_USES = 1;
}