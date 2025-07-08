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
  BeforeCreate,
  BeforeUpdate
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import { Community } from './Community';
import { User } from './User';
import { AccessLog } from './AccessLog';
import { Country } from './Country';

export enum VehicleType {
  CAR = 'car',
  MOTORCYCLE = 'motorcycle',
  TRUCK = 'truck',
  VAN = 'van',
  BUS = 'bus',
  BICYCLE = 'bicycle',
  OTHER = 'other'
}

@Scopes(() => ({
  active: {
    where: {
      is_active: true
    }
  },
  byCommunity: (communityId: string) => ({
    where: {
      community_id: communityId
    }
  }),
  byOwner: (ownerId: string) => ({
    where: {
      owner_id: ownerId
    }
  }),
  withOwner: {
    include: [{
      model: User,
      as: 'owner',
      attributes: ['id', 'username', 'first_name', 'last_name', 'email']
    }]
  },
  withAccessLogs: {
    include: [{
      model: AccessLog,
      as: 'accessLogs',
      limit: 10,
      order: [['created_at', 'DESC']]
    }]
  }
}))
@Table({
  tableName: 'vehicles',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['community_id', 'license_plate']
    },
    {
      fields: ['owner_id']
    },
    {
      fields: ['license_plate']
    }
  ]
})
export class Vehicle extends Model {
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
  owner_id!: string;

  @AllowNull(false)
  @Column(DataType.STRING(20))
  license_plate!: string;

  @Column(DataType.STRING(50))
  brand?: string;

  @Column(DataType.STRING(50))
  model?: string;

  @Column(DataType.STRING(30))
  color?: string;

  @Column(DataType.INTEGER)
  year?: number;

  @Default(VehicleType.CAR)
  @Column(DataType.ENUM(...Object.values(VehicleType)))
  type!: VehicleType;

  @Column(DataType.STRING(500))
  photo_url?: string;

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

  @BelongsTo(() => User)
  owner?: User;

  @HasMany(() => AccessLog)
  accessLogs?: AccessLog[];

  // Hooks
  @BeforeCreate
  @BeforeUpdate
  static normalizeLicensePlate(vehicle: Vehicle) {
    if (vehicle.license_plate) {
      // Normalizar placa: mayúsculas, sin espacios ni guiones
      vehicle.license_plate = vehicle.license_plate
        .toUpperCase()
        .replace(/[\s-]/g, '');
    }
  }

  // Métodos de instancia
  getFormattedPlate(): string {
    // Formato chileno: BBBB99 o BB999
    const plate = this.license_plate;
    
    if (plate.length === 6) {
      // BBBB99 -> BB-BB-99
      return `${plate.slice(0, 2)}-${plate.slice(2, 4)}-${plate.slice(4)}`;
    } else if (plate.length === 5) {
      // BB999 -> BB-999
      return `${plate.slice(0, 2)}-${plate.slice(2)}`;
    }
    
    return plate;
  }

  async getLastAccess(): Promise<AccessLog | null> {
    return AccessLog.findOne({
      where: { vehicle_id: this.id },
      order: [['created_at', 'DESC']]
    });
  }

  async getAccessCount(startDate?: Date, endDate?: Date): Promise<number> {
    const where: any = { vehicle_id: this.id };
    
    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at[Op.gte] = startDate;
      if (endDate) where.created_at[Op.lte] = endDate;
    }
    
    return AccessLog.count({ where });
  }

  async checkBlacklist(): Promise<boolean> {
    // TODO: Implementar verificación contra lista negra
    return false;
  }

  isExpired(): boolean {
    // Verificar si el vehículo tiene fecha de expiración en metadata
    if (this.metadata?.expires_at) {
      return new Date() > new Date(this.metadata.expires_at);
    }
    return false;
  }

  // Métodos estáticos
  static async findByPlate(licensePlate: string, communityId?: string): Promise<Vehicle | null> {
    const normalizedPlate = licensePlate.toUpperCase().replace(/[\s-]/g, '');
    
    const where: any = { license_plate: normalizedPlate };
    if (communityId) {
      where.community_id = communityId;
    }
    
    return this.findOne({ where });
  }

  static async getOwnerVehicles(ownerId: string, communityId?: string): Promise<Vehicle[]> {
    const where: any = { owner_id: ownerId, is_active: true };
    if (communityId) {
      where.community_id = communityId;
    }
    
    return this.findAll({
      where,
      order: [['created_at', 'DESC']]
    });
  }

  static async validatePlateFormat(plate: string, countryCode: string = 'CL'): boolean {
    const patterns: Record<string, RegExp> = {
      CL: /^[A-Z]{2}[A-Z]{2}[0-9]{2}$|^[A-Z]{2}[0-9]{3}$/, // Chile
      AR: /^[A-Z]{3}[0-9]{3}$|^[A-Z]{2}[0-9]{3}[A-Z]{2}$/, // Argentina
      BR: /^[A-Z]{3}[0-9]{1}[A-Z]{1}[0-9]{2}$|^[A-Z]{3}[0-9]{4}$/, // Brasil
    };
    
    const pattern = patterns[countryCode];
    if (!pattern) return false;
    
    const normalizedPlate = plate.toUpperCase().replace(/[\s-]/g, '');
    return pattern.test(normalizedPlate);
  }

  // Información de vehículos común en Chile
  static readonly COMMON_BRANDS = [
    'Chevrolet', 'Nissan', 'Suzuki', 'Toyota', 'Hyundai', 
    'Kia', 'Mazda', 'Mitsubishi', 'Ford', 'Volkswagen',
    'Peugeot', 'Renault', 'Honda', 'Subaru', 'BMW',
    'Mercedes-Benz', 'Audi', 'Volvo', 'Jeep', 'RAM'
  ];

  static readonly COMMON_COLORS = {
    white: 'Blanco',
    black: 'Negro',
    gray: 'Gris',
    silver: 'Plata',
    red: 'Rojo',
    blue: 'Azul',
    green: 'Verde',
    yellow: 'Amarillo',
    brown: 'Café',
    orange: 'Naranjo'
  };
}