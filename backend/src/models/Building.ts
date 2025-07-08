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
  Scopes,
  DefaultScope
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import { Community } from './Community';
import { Floor } from './Floor';
import { Unit } from './Unit';
import { AccessPoint } from './AccessPoint';
import { Device } from './Device';

@DefaultScope(() => ({
  attributes: {
    exclude: ['deleted_at']
  }
}))
@Scopes(() => ({
  withCommunity: {
    include: [{
      model: Community,
      as: 'community'
    }]
  },
  withFloors: {
    include: [{
      model: Floor,
      as: 'floors',
      include: [{
        model: Unit,
        as: 'units'
      }]
    }]
  },
  withDevices: {
    include: [{
      model: Device,
      as: 'devices',
      where: { is_active: true }
    }]
  },
  active: {
    where: {
      is_active: true
    }
  }
}))
@Table({
  tableName: 'buildings',
  timestamps: true,
  paranoid: true,
  underscored: true
})
export class Building extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => Community)
  @AllowNull(false)
  @Column(DataType.UUID)
  community_id!: string;

  @AllowNull(false)
  @Column(DataType.STRING(50))
  code!: string;

  @AllowNull(false)
  @Column(DataType.STRING(200))
  name!: string;

  @Column(DataType.TEXT)
  address?: string;

  @Default(1)
  @Column(DataType.INTEGER)
  floors_count!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  units_count!: number;

  @Column(DataType.INTEGER)
  construction_year?: number;

  @Column(DataType.STRING(50))
  building_type?: string;

  @Default({})
  @Column(DataType.JSONB)
  amenities!: any;

  @Column(DataType.STRING(200))
  emergency_contact_name?: string;

  @Column(DataType.STRING(20))
  emergency_contact_phone?: string;

  @Default(true)
  @Column(DataType.BOOLEAN)
  is_active!: boolean;

  @Column(DataType.DATE)
  created_at!: Date;

  @Column(DataType.DATE)
  updated_at!: Date;

  @Column(DataType.DATE)
  deleted_at?: Date;

  // Asociaciones
  @BelongsTo(() => Community)
  community?: Community;

  @HasMany(() => Floor, { foreignKey: 'building_id' })
  floors?: Floor[];

  @HasMany(() => Unit, { foreignKey: 'building_id' })
  units?: Unit[];

  @HasMany(() => AccessPoint, { foreignKey: 'building_id' })
  accessPoints?: AccessPoint[];

  @HasMany(() => Device, { foreignKey: 'building_id' })
  devices?: Device[];

  // Métodos de instancia
  async getOccupancyRate(): Promise<number> {
    const totalUnits = await Unit.count({
      where: { building_id: this.id }
    });

    if (totalUnits === 0) return 0;

    const occupiedUnits = await Unit.count({
      where: { 
        building_id: this.id,
        is_occupied: true 
      }
    });

    return Math.round((occupiedUnits / totalUnits) * 100 * 100) / 100;
  }

  async getTotalDevices(): Promise<number> {
    return await Device.count({
      where: { 
        building_id: this.id,
        is_active: true 
      }
    });
  }

  async getOnlineDevices(): Promise<number> {
    return await Device.count({
      where: { 
        building_id: this.id,
        is_active: true,
        status: 'online'
      }
    });
  }

  async getActiveFloors(): Promise<Floor[]> {
    return await Floor.findAll({
      where: { building_id: this.id },
      include: [{
        model: Unit,
        as: 'units'
      }],
      order: [['floor_number', 'ASC']]
    });
  }

  // Métodos estáticos
  static async findByCommunity(communityId: string): Promise<Building[]> {
    return this.scope(['active', 'withFloors']).findAll({
      where: { community_id: communityId },
      order: [['name', 'ASC']]
    });
  }

  static async findByCode(communityId: string, code: string): Promise<Building | null> {
    return this.findOne({
      where: { 
        community_id: communityId,
        code: code 
      }
    });
  }

  toJSON() {
    const values = super.toJSON() as any;
    delete values.deleted_at;
    return values;
  }
}