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
  ForeignKey
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import { Community } from './Community';
import { MaintenanceRequest } from './MaintenanceRequest';

export enum ServiceType {
  PLUMBING = 'plumbing',
  ELECTRICAL = 'electrical',
  HVAC = 'hvac',
  CLEANING = 'cleaning',
  LANDSCAPING = 'landscaping',
  SECURITY = 'security',
  GENERAL_MAINTENANCE = 'general_maintenance',
  PEST_CONTROL = 'pest_control',
  APPLIANCE_REPAIR = 'appliance_repair',
  OTHER = 'other'
}

@Table({
  tableName: 'service_providers',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['community_id']
    },
    {
      fields: ['service_type']
    },
    {
      fields: ['is_active']
    }
  ]
})
export class ServiceProvider extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => Community)
  @AllowNull(false)
  @Column(DataType.UUID)
  community_id!: string;

  @AllowNull(false)
  @Column(DataType.STRING(300))
  company_name!: string;

  @Column(DataType.STRING(50))
  tax_id?: string;

  @AllowNull(false)
  @Column(DataType.ENUM(...Object.values(ServiceType)))
  service_type!: ServiceType;

  @Column(DataType.STRING(200))
  contact_name?: string;

  @Column(DataType.STRING(20))
  contact_phone?: string;

  @Column(DataType.STRING(255))
  contact_email?: string;

  @Column(DataType.TEXT)
  address?: string;

  @Column(DataType.DATE)
  contract_start_date?: Date;

  @Column(DataType.DATE)
  contract_end_date?: Date;

  @Column(DataType.DECIMAL(10, 2))
  monthly_fee?: number;

  @Column(DataType.STRING(100))
  payment_terms?: string;

  @Column(DataType.STRING(100))
  insurance_policy_number?: string;

  @Column(DataType.DATE)
  insurance_expiry_date?: Date;

  @Column(DataType.DECIMAL(2, 1))
  rating?: number;

  @Column(DataType.JSONB)
  services_offered?: string[];

  @Column(DataType.JSONB)
  availability?: {
    monday?: { start: string; end: string; available: boolean };
    tuesday?: { start: string; end: string; available: boolean };
    wednesday?: { start: string; end: string; available: boolean };
    thursday?: { start: string; end: string; available: boolean };
    friday?: { start: string; end: string; available: boolean };
    saturday?: { start: string; end: string; available: boolean };
    sunday?: { start: string; end: string; available: boolean };
    emergency_contact?: string;
  };

  @Column(DataType.TEXT)
  notes?: string;

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

  @HasMany(() => MaintenanceRequest, { foreignKey: 'vendor_id' })
  maintenanceRequests?: MaintenanceRequest[];

  // Instance methods
  get isInsuranceValid(): boolean {
    if (!this.insurance_expiry_date) return false;
    return new Date() < this.insurance_expiry_date;
  }

  get isContractActive(): boolean {
    const now = new Date();
    
    if (this.contract_start_date && now < this.contract_start_date) {
      return false;
    }
    
    if (this.contract_end_date && now > this.contract_end_date) {
      return false;
    }
    
    return this.is_active;
  }

  async updateRating(): Promise<void> {
    // Calculate average rating from maintenance requests
    const requests = await MaintenanceRequest.findAll({
      where: { 
        vendor_id: this.id,
        satisfaction_rating: { $ne: null }
      },
      attributes: ['satisfaction_rating']
    });

    if (requests.length > 0) {
      const totalRating = requests.reduce((sum, req) => sum + (req.satisfaction_rating || 0), 0);
      this.rating = totalRating / requests.length;
      await this.save();
    }
  }

  static async findByCommunity(communityId: string): Promise<ServiceProvider[]> {
    return this.findAll({
      where: { 
        community_id: communityId,
        is_active: true 
      },
      order: [['company_name', 'ASC']]
    });
  }

  static async findByServiceType(
    communityId: string, 
    serviceType: ServiceType
  ): Promise<ServiceProvider[]> {
    return this.findAll({
      where: { 
        community_id: communityId,
        service_type: serviceType,
        is_active: true 
      },
      order: [['rating', 'DESC'], ['company_name', 'ASC']]
    });
  }
}
