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
  Index,
  Unique
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import { Building } from './Building';
import { Floor } from './Floor';
import { CommunityMember } from './CommunityMember';
import { Invitation } from './Invitation';
import { MaintenanceRequest } from './MaintenanceRequest';

export enum UnitType {
  APARTMENT = 'apartment',
  OFFICE = 'office',
  COMMERCIAL = 'commercial',
  STORAGE = 'storage',
  PARKING = 'parking'
}

export enum OwnershipType {
  OWNED = 'owned',
  RENTED = 'rented'
}

@Table({
  tableName: 'units',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['building_id', 'unit_number']
    },
    {
      fields: ['building_id']
    },
    {
      fields: ['floor_id']
    },
    {
      fields: ['unit_type']
    },
    {
      fields: ['is_occupied']
    }
  ]
})
export class Unit extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => Building)
  @AllowNull(false)
  @Column(DataType.UUID)
  building_id!: string;

  @ForeignKey(() => Floor)
  @Column(DataType.UUID)
  floor_id?: string;

  @AllowNull(false)
  @Column(DataType.STRING(20))
  unit_number!: string;

  @Default(UnitType.APARTMENT)
  @Column(DataType.ENUM(...Object.values(UnitType)))
  unit_type!: UnitType;

  @Column(DataType.DECIMAL(10, 2))
  area_sqm?: number;

  @Column(DataType.INTEGER)
  bedrooms?: number;

  @Column(DataType.INTEGER)
  bathrooms?: number;

  @Default(0)
  @Column(DataType.INTEGER)
  parking_spaces!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  storage_units!: number;

  @Default(OwnershipType.OWNED)
  @Column(DataType.ENUM(...Object.values(OwnershipType)))
  ownership_type!: OwnershipType;

  @Default(false)
  @Column(DataType.BOOLEAN)
  is_occupied!: boolean;

  @Column(DataType.DECIMAL(10, 2))
  monthly_rent?: number;

  @Column(DataType.DECIMAL(10, 2))
  common_expenses_base?: number;

  @Column(DataType.DECIMAL(5, 4))
  common_expenses_percentage?: number;

  @Column(DataType.JSONB)
  amenities?: any;

  @Column(DataType.JSONB)
  layout_coordinates?: any;

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
  @BelongsTo(() => Building)
  building?: Building;

  @BelongsTo(() => Floor)
  floor?: Floor;

  @HasMany(() => CommunityMember, { foreignKey: 'unit_id' })
  members?: CommunityMember[];

  @HasMany(() => Invitation, { foreignKey: 'unit_id' })
  invitations?: Invitation[];

  @HasMany(() => MaintenanceRequest, { foreignKey: 'unit_id' })
  maintenanceRequests?: MaintenanceRequest[];

  // Instance methods
  get fullAddress(): string {
    if (this.building) {
      const floorInfo = this.floor ? ` Piso ${this.floor.floor_number}` : '';
      return `${this.building.name}${floorInfo} - Unidad ${this.unit_number}`;
    }
    return `Unidad ${this.unit_number}`;
  }

  async getActiveMembers(): Promise<CommunityMember[]> {
    return CommunityMember.findAll({
      where: {
        unit_id: this.id,
        is_active: true
      },
      include: ['user']
    });
  }

  async getPrimaryResident(): Promise<CommunityMember | null> {
    return CommunityMember.findOne({
      where: {
        unit_id: this.id,
        is_primary_resident: true,
        is_active: true
      },
      include: ['user']
    });
  }

  async getOwner(): Promise<CommunityMember | null> {
    return CommunityMember.findOne({
      where: {
        unit_id: this.id,
        member_type: 'owner',
        is_active: true
      },
      include: ['user']
    });
  }

  async updateOccupancyStatus(): Promise<void> {
    const activeMembers = await this.getActiveMembers();
    this.is_occupied = activeMembers.length > 0;
    await this.save();
  }

  async calculateCommonExpenses(baseAmount: number): Promise<number> {
    if (this.common_expenses_percentage) {
      return baseAmount * this.common_expenses_percentage;
    }
    return this.common_expenses_base || 0;
  }

  async getMonthlyInvitationsCount(month: Date): Promise<number> {
    const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0);

    return Invitation.count({
      where: {
        unit_id: this.id,
        created_at: {
          $gte: startOfMonth,
          $lte: endOfMonth
        }
      }
    });
  }

  // Static methods
  static async findByBuildingAndNumber(
    buildingId: string,
    unitNumber: string
  ): Promise<Unit | null> {
    return this.findOne({
      where: {
        building_id: buildingId,
        unit_number: unitNumber
      },
      include: ['building', 'floor']
    });
  }

  static async findByBuilding(buildingId: string): Promise<Unit[]> {
    return this.findAll({
      where: { building_id: buildingId },
      include: ['floor'],
      order: [['unit_number', 'ASC']]
    });
  }

  static async findOccupied(buildingId?: string): Promise<Unit[]> {
    const where: any = { is_occupied: true };
    if (buildingId) where.building_id = buildingId;

    return this.findAll({
      where,
      include: ['building', 'floor'],
      order: [['unit_number', 'ASC']]
    });
  }

  static async findVacant(buildingId?: string): Promise<Unit[]> {
    const where: any = { is_occupied: false };
    if (buildingId) where.building_id = buildingId;

    return this.findAll({
      where,
      include: ['building', 'floor'],
      order: [['unit_number', 'ASC']]
    });
  }

  static async getOccupancyStats(buildingId?: string): Promise<{
    total: number;
    occupied: number;
    vacant: number;
    occupancyRate: number;
  }> {
    const where: any = {};
    if (buildingId) where.building_id = buildingId;

    const total = await this.count({ where });
    const occupied = await this.count({ 
      where: { ...where, is_occupied: true } 
    });
    const vacant = total - occupied;
    const occupancyRate = total > 0 ? (occupied / total) * 100 : 0;

    return { total, occupied, vacant, occupancyRate };
  }

  toJSON() {
    const values = super.toJSON() as any;
    values.full_address = this.fullAddress;
    return values;
  }
}
