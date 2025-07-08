import { Sequelize } from 'sequelize-typescript';
import { logger } from '../utils/logger';
import path from 'path';

// Importar modelos
import { User } from '../models/User';
import { Role } from '../models/Role';
import { Permission } from '../models/Permission';
import { Community } from '../models/Community';
import { Device } from '../models/Device';
import { UserRole } from '../models/UserRole';
import { RolePermission } from '../models/RolePermission';
import { UserPermission } from '../models/UserPermission';
import { Feature } from '../models/Feature';
import { CommunityFeature } from '../models/CommunityFeature';
import { Building } from '../models/Building';
import { Floor } from '../models/Floor';
import { Unit } from '../models/Unit';
import { CommunityMember } from '../models/CommunityMember';
import { Vehicle } from '../models/Vehicle';
import { AccessPoint } from '../models/AccessPoint';
import { AccessLog } from '../models/AccessLog';
import { Invitation } from '../models/Invitation';
import { AuditLog } from '../models/AuditLog';
import { UserSession } from '../models/UserSession';
import { Country } from '../models/Country';

// Configuración de Sequelize
const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'master_db',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  logging: process.env.NODE_ENV === 'development' ? 
    (sql: string) => logger.debug(sql) : false,
  pool: {
    max: 20,
    min: 5,
    acquire: 60000,
    idle: 10000
  },
  dialectOptions: {
    ssl: process.env.DB_SSL === 'true' ? {
      require: true,
      rejectUnauthorized: false
    } : false
  },
  models: [
    User,
    Role,
    Permission,
    Community,
    Device,
    UserRole,
    RolePermission,
    UserPermission,
    Feature,
    CommunityFeature,
    Building,
    Floor,
    Unit,
    CommunityMember,
    Vehicle,
    AccessPoint,
    AccessLog,
    Invitation,
    AuditLog,
    UserSession,
    Country
  ],
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true
  }
});

// Definir asociaciones
export function setupAssociations() {
  // User associations
  User.belongsToMany(Role, { through: UserRole, as: 'roles' });
  User.belongsToMany(Permission, { through: UserPermission, as: 'permissions' });
  User.belongsToMany(Community, { through: CommunityMember, as: 'communities' });
  User.hasMany(Vehicle, { foreignKey: 'owner_id', as: 'vehicles' });
  User.hasMany(AccessLog, { foreignKey: 'user_id', as: 'accessLogs' });
  User.hasMany(Invitation, { foreignKey: 'host_id', as: 'invitations' });
  User.hasMany(AuditLog, { foreignKey: 'user_id', as: 'auditLogs' });
  User.hasMany(UserSession, { foreignKey: 'user_id', as: 'sessions' });
  User.belongsTo(Country, { foreignKey: 'country_id', as: 'country' });

  // Role associations
  Role.belongsToMany(User, { through: UserRole, as: 'users' });
  Role.belongsToMany(Permission, { through: RolePermission, as: 'permissions' });
  Role.belongsTo(Role, { foreignKey: 'parent_role_id', as: 'parentRole' });
  Role.hasMany(Role, { foreignKey: 'parent_role_id', as: 'childRoles' });

  // Permission associations
  Permission.belongsToMany(Role, { through: RolePermission, as: 'roles' });
  Permission.belongsToMany(User, { through: UserPermission, as: 'users' });

  // Community associations
  Community.belongsToMany(User, { through: CommunityMember, as: 'members' });
  Community.belongsToMany(Feature, { through: CommunityFeature, as: 'features' });
  Community.hasMany(Building, { foreignKey: 'community_id', as: 'buildings' });
  Community.hasMany(Device, { foreignKey: 'community_id', as: 'devices' });
  Community.hasMany(Vehicle, { foreignKey: 'community_id', as: 'vehicles' });
  Community.hasMany(AccessPoint, { foreignKey: 'community_id', as: 'accessPoints' });
  Community.hasMany(AccessLog, { foreignKey: 'community_id', as: 'accessLogs' });
  Community.hasMany(Invitation, { foreignKey: 'community_id', as: 'invitations' });
  Community.belongsTo(Country, { foreignKey: 'country_id', as: 'country' });

  // Building associations
  Building.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });
  Building.hasMany(Floor, { foreignKey: 'building_id', as: 'floors' });
  Building.hasMany(Unit, { foreignKey: 'building_id', as: 'units' });
  Building.hasMany(Device, { foreignKey: 'building_id', as: 'devices' });
  Building.hasMany(AccessPoint, { foreignKey: 'building_id', as: 'accessPoints' });

  // Floor associations
  Floor.belongsTo(Building, { foreignKey: 'building_id', as: 'building' });
  Floor.hasMany(Unit, { foreignKey: 'floor_id', as: 'units' });
  Floor.hasMany(Device, { foreignKey: 'floor_id', as: 'devices' });
  Floor.hasMany(AccessPoint, { foreignKey: 'floor_id', as: 'accessPoints' });

  // Unit associations
  Unit.belongsTo(Floor, { foreignKey: 'floor_id', as: 'floor' });
  Unit.belongsTo(Building, { foreignKey: 'building_id', as: 'building' });
  Unit.belongsTo(User, { foreignKey: 'owner_id', as: 'owner' });
  Unit.belongsTo(User, { foreignKey: 'tenant_id', as: 'tenant' });
  Unit.hasMany(CommunityMember, { foreignKey: 'unit_id', as: 'members' });

  // Device associations
  Device.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });
  Device.belongsTo(Building, { foreignKey: 'building_id', as: 'building' });
  Device.belongsTo(Floor, { foreignKey: 'floor_id', as: 'floor' });
  Device.hasMany(AccessPoint, { foreignKey: 'device_id', as: 'accessPoints' });

  // Vehicle associations
  Vehicle.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });
  Vehicle.belongsTo(User, { foreignKey: 'owner_id', as: 'owner' });
  Vehicle.hasMany(AccessLog, { foreignKey: 'vehicle_id', as: 'accessLogs' });

  // AccessPoint associations
  AccessPoint.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });
  AccessPoint.belongsTo(Device, { foreignKey: 'device_id', as: 'device' });
  AccessPoint.belongsTo(Building, { foreignKey: 'building_id', as: 'building' });
  AccessPoint.belongsTo(Floor, { foreignKey: 'floor_id', as: 'floor' });
  AccessPoint.belongsTo(Device, { foreignKey: 'entry_device_id', as: 'entryDevice' });
  AccessPoint.belongsTo(Device, { foreignKey: 'exit_device_id', as: 'exitDevice' });
  AccessPoint.hasMany(AccessLog, { foreignKey: 'access_point_id', as: 'accessLogs' });

  // AccessLog associations
  AccessLog.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });
  AccessLog.belongsTo(AccessPoint, { foreignKey: 'access_point_id', as: 'accessPoint' });
  AccessLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
  AccessLog.belongsTo(Vehicle, { foreignKey: 'vehicle_id', as: 'vehicle' });
  AccessLog.belongsTo(User, { foreignKey: 'authorized_by', as: 'authorizer' });

  // Invitation associations
  Invitation.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });
  Invitation.belongsTo(User, { foreignKey: 'host_id', as: 'host' });

  // Feature associations
  Feature.belongsToMany(Community, { through: CommunityFeature, as: 'communities' });

  // CommunityMember associations
  CommunityMember.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });
  CommunityMember.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
  CommunityMember.belongsTo(Unit, { foreignKey: 'unit_id', as: 'unit' });
  CommunityMember.belongsTo(User, { foreignKey: 'authorized_by', as: 'authorizer' });

  // UserRole associations
  UserRole.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
  UserRole.belongsTo(Role, { foreignKey: 'role_id', as: 'role' });
  UserRole.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });
  UserRole.belongsTo(User, { foreignKey: 'assigned_by', as: 'assigner' });

  // UserPermission associations
  UserPermission.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
  UserPermission.belongsTo(Permission, { foreignKey: 'permission_id', as: 'permission' });
  UserPermission.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });
  UserPermission.belongsTo(User, { foreignKey: 'granted_by', as: 'granter' });

  // AuditLog associations
  AuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

  // UserSession associations
  UserSession.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

  logger.info('✅ Database associations established');
}

// Inicializar asociaciones
setupAssociations();

export { sequelize };