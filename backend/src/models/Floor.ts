// Floor.ts
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
  Scopes
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import { Building } from './Building';
import { Unit } from './Unit';

@Scopes(() => ({
  withBuilding: {
    include: [{
      model: Building,
      as: 'building'
    }]
  },
  withUnits: {
    include: [{
      model: Unit,
      as: 'units',
      order: [['unit_number', 'ASC']]
    }]
  }
}))
@Table({
  tableName: 'floors',
  timestamps: true,
  underscored: true
})
export class Floor extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => Building)
  @AllowNull(false)
  @Column(DataType.UUID)
  building_id!: string;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  floor_number!: number;

  @Column(DataType.STRING(100))
  name?: string;

  @Default(0)
  @Column(DataType.INTEGER)
  units_count!: number;

  @Column(DataType.STRING(500))
  layout_image_url?: string;

  @Column(DataType.DATE)
  created_at!: Date;

  // Asociaciones
  @BelongsTo(() => Building)
  building?: Building;

  @HasMany(() => Unit, { foreignKey: 'floor_id' })
  units?: Unit[];

  // Métodos
  async getOccupiedUnits(): Promise<number> {
    return await Unit.count({
      where: { 
        floor_id: this.id,
        is_occupied: true 
      }
    });
  }

  get displayName(): string {
    if (this.name) {
      return `${this.name} (Piso ${this.floor_number})`;
    }
    return `Piso ${this.floor_number}`;
  }
}