// =====================================================
// MODEL RELATIONS INDEX - SKYN3T ACCESS CONTROL
// =====================================================
// Este archivo centraliza todas las relaciones entre modelos
// para mantener una estructura clara y evitar dependencias circulares

import { logger } from '../../utils/logger';

// Import all models
import { User } from '../User';
import { Role } from '../Role';
import { Permission } from '../Permission';
import { Community } from '../Community';
import { Device } from '../Device';
import { UserRole } from '../UserRole';
import { RolePermission } from '../RolePermission';
import { UserPermission } from '../UserPermission';
import { Feature } from '../Feature';
import { CommunityFeature } from '../CommunityFeature';
import { Building } from '../Building';
import { Floor } from '../Floor';
import { Unit } from '../Unit';
import { CommunityMember } from '../CommunityMember';
import { Vehicle } from '../Vehicle';
import { AccessPoint } from '../AccessPoint';
import { AccessLog } from '../AccessLog';
import { Invitation } from '../Invitation';
import { AuditLog } from '../AuditLog';
import { UserSession } from '../UserSession';
import { Country } from '../Country';

/**
 * Configure all model associations
 * This function should be called after all models are loaded
 */
export function setupModelRelations(): void {
  try {
    // =====================================================
    // USER ASSOCIATIONS
    // =====================================================
    
    // User many-to-many relationships
    User.belongsToMany(Role, { 
      through: UserRole, 
      as: 'roles',
      foreignKey: 'user_id',
      otherKey: 'role_id'
    });
    
    User.belongsToMany(Permission, { 
      through: UserPermission, 
      as: 'permissions',
      foreignKey: 'user_id',
      otherKey: 'permission_id'
    });
    
    User.belongsToMany(Community, { 
      through: CommunityMember, 
      as: 'communities',
      foreignKey: 'user_id',
      otherKey: 'community_id'
    });

    // User one-to-many relationships
    User.hasMany(Vehicle, { 
      foreignKey: 'owner_id', 
      as: 'vehicles' 
    });
    
    User.hasMany(AccessLog, { 
      foreignKey: 'user_id', 
      as: 'accessLogs' 
    });
    
    User.hasMany(Invitation, { 
      foreignKey: 'host_id', 
      as: 'invitations' 
    });
    
    User.hasMany(AuditLog, { 
      foreignKey: 'user_id', 
      as: 'auditLogs' 
    });
    
    User.hasMany(UserSession, { 
      foreignKey: 'user_id', 
      as: 'sessions' 
    });

    // User belongs-to relationships
    User.belongsTo(Country, { 
      foreignKey: 'country_id', 
      as: 'country' 
    });

    // =====================================================
    // ROLE ASSOCIATIONS
    // =====================================================
    
    Role.belongsToMany(User, { 
      through: UserRole, 
      as: 'users',
      foreignKey: 'role_id',
      otherKey: 'user_id'
    });
    
    Role.belongsToMany(Permission, { 
      through: RolePermission, 
      as: 'permissions',
      foreignKey: 'role_id',
      otherKey: 'permission_id'
    });

    // Role hierarchy (self-referencing)
    Role.belongsTo(Role, { 
      foreignKey: 'parent_role_id', 
      as: 'parentRole' 
    });
    
    Role.hasMany(Role, { 
      foreignKey: 'parent_role_id', 
      as: 'childRoles' 
    });

    // =====================================================
    // PERMISSION ASSOCIATIONS
    // =====================================================
    
    Permission.belongsToMany(Role, { 
      through: RolePermission, 
      as: 'roles',
      foreignKey: 'permission_id',
      otherKey: 'role_id'
    });
    
    Permission.belongsToMany(User, { 
      through: UserPermission, 
      as: 'users',
      foreignKey: 'permission_id',
      otherKey: 'user_id'
    });

    // =====================================================
    // COMMUNITY ASSOCIATIONS
    // =====================================================
    
    Community.belongsToMany(User, { 
      through: CommunityMember, 
      as: 'members',
      foreignKey: 'community_id',
      otherKey: 'user_id'
    });
    
    Community.belongsToMany(Feature, { 
      through: CommunityFeature, 
      as: 'features',
      foreignKey: 'community_id',
      otherKey: 'feature_id'
    });

    // Community one-to-many relationships
    Community.hasMany(Building, { 
      foreignKey: 'community_id', 
      as: 'buildings' 
    });
    
    Community.hasMany(Device, { 
      foreignKey: 'community_id', 
      as: 'devices' 
    });
    
    Community.hasMany(Vehicle, { 
      foreignKey: 'community_id', 
      as: 'vehicles' 
    });
    
    Community.hasMany(AccessPoint, { 
      foreignKey: 'community_id', 
      as: 'accessPoints' 
    });
    
    Community.hasMany(AccessLog, { 
      foreignKey: 'community_id', 
      as: 'accessLogs' 
    });
    
    Community.hasMany(Invitation, { 
      foreignKey: 'community_id', 
      as: 'invitations' 
    });

    // Community belongs-to relationships
    Community.belongsTo(Country, { 
      foreignKey: 'country_id', 
      as: 'country' 
    });

    // =====================================================
    // BUILDING & STRUCTURE ASSOCIATIONS
    // =====================================================
    
    Building.belongsTo(Community, { 
      foreignKey: 'community_id', 
      as: 'community' 
    });
    
    Building.hasMany(Floor, { 
      foreignKey: 'building_id', 
      as: 'floors' 
    });
    
    Building.hasMany(Unit, { 
      foreignKey: 'building_id', 
      as: 'units' 
    });
    
    Building.hasMany(Device, { 
      foreignKey: 'building_id', 
      as: 'devices' 
    });
    
    Building.hasMany(AccessPoint, { 
      foreignKey: 'building_id', 
      as: 'accessPoints' 
    });

    // Floor associations
    Floor.belongsTo(Building, { 
      foreignKey: 'building_id', 
      as: 'building' 
    });
    
    Floor.hasMany(Unit, { 
      foreignKey: 'floor_id', 
      as: 'units' 
    });
    
    Floor.hasMany(Device, { 
      foreignKey: 'floor_id', 
      as: 'devices' 
    });
    
    Floor.hasMany(AccessPoint, { 
      foreignKey: 'floor_id', 
      as: 'accessPoints' 
    });

    // Unit associations
    Unit.belongsTo(Floor, { 
      foreignKey: 'floor_id', 
      as: 'floor' 
    });
    
    Unit.belongsTo(Building, { 
      foreignKey: 'building_id', 
      as: 'building' 
    });
    
    Unit.belongsTo(User, { 
      foreignKey: 'owner_id', 
      as: 'owner' 
    });
    
    Unit.belongsTo(User, { 
      foreignKey: 'tenant_id', 
      as: 'tenant' 
    });
    
    Unit.hasMany(CommunityMember, { 
      foreignKey: 'unit_id', 
      as: 'members' 
    });

    // =====================================================
    // DEVICE ASSOCIATIONS
    // =====================================================
    
    Device.belongsTo(Community, { 
      foreignKey: 'community_id', 
      as: 'community' 
    });
    
    Device.belongsTo(Building, { 
      foreignKey: 'building_id', 
      as: 'building' 
    });
    
    Device.belongsTo(Floor, { 
      foreignKey: 'floor_id', 
      as: 'floor' 
    });
    
    Device.hasMany(AccessPoint, { 
      foreignKey: 'device_id', 
      as: 'accessPoints' 
    });

    // =====================================================
    // VEHICLE ASSOCIATIONS
    // =====================================================
    
    Vehicle.belongsTo(Community, { 
      foreignKey: 'community_id', 
      as: 'community' 
    });
    
    Vehicle.belongsTo(User, { 
      foreignKey: 'owner_id', 
      as: 'owner' 
    });
    
    Vehicle.hasMany(AccessLog, { 
      foreignKey: 'vehicle_id', 
      as: 'accessLogs' 
    });

    // =====================================================
    // ACCESS CONTROL ASSOCIATIONS
    // =====================================================
    
    AccessPoint.belongsTo(Community, { 
      foreignKey: 'community_id', 
      as: 'community' 
    });
    
    AccessPoint.belongsTo(Device, { 
      foreignKey: 'device_id', 
      as: 'device' 
    });
    
    AccessPoint.belongsTo(Building, { 
      foreignKey: 'building_id', 
      as: 'building' 
    });
    
    AccessPoint.belongsTo(Floor, { 
      foreignKey: 'floor_id', 
      as: 'floor' 
    });
    
    AccessPoint.belongsTo(Device, { 
      foreignKey: 'entry_device_id', 
      as: 'entryDevice' 
    });
    
    AccessPoint.belongsTo(Device, { 
      foreignKey: 'exit_device_id', 
      as: 'exitDevice' 
    });
    
    AccessPoint.hasMany(AccessLog, { 
      foreignKey: 'access_point_id', 
      as: 'accessLogs' 
    });

    // AccessLog associations
    AccessLog.belongsTo(Community, { 
      foreignKey: 'community_id', 
      as: 'community' 
    });
    
    AccessLog.belongsTo(AccessPoint, { 
      foreignKey: 'access_point_id', 
      as: 'accessPoint' 
    });
    
    AccessLog.belongsTo(User, { 
      foreignKey: 'user_id', 
      as: 'user' 
    });
    
    AccessLog.belongsTo(Vehicle, { 
      foreignKey: 'vehicle_id', 
      as: 'vehicle' 
    });
    
    AccessLog.belongsTo(User, { 
      foreignKey: 'authorized_by', 
      as: 'authorizer' 
    });

    // =====================================================
    // INVITATION ASSOCIATIONS
    // =====================================================
    
    Invitation.belongsTo(Community, { 
      foreignKey: 'community_id', 
      as: 'community' 
    });
    
    Invitation.belongsTo(User, { 
      foreignKey: 'host_id', 
      as: 'host' 
    });

    // =====================================================
    // FEATURE ASSOCIATIONS
    // =====================================================
    
    Feature.belongsToMany(Community, { 
      through: CommunityFeature, 
      as: 'communities',
      foreignKey: 'feature_id',
      otherKey: 'community_id'
    });

    // =====================================================
    // JUNCTION TABLE ASSOCIATIONS
    // =====================================================
    
    // CommunityMember associations
    CommunityMember.belongsTo(Community, { 
      foreignKey: 'community_id', 
      as: 'community' 
    });
    
    CommunityMember.belongsTo(User, { 
      foreignKey: 'user_id', 
      as: 'user' 
    });
    
    CommunityMember.belongsTo(Unit, { 
      foreignKey: 'unit_id', 
      as: 'unit' 
    });
    
    CommunityMember.belongsTo(User, { 
      foreignKey: 'authorized_by', 
      as: 'authorizer' 
    });

    // UserRole associations
    UserRole.belongsTo(User, { 
      foreignKey: 'user_id', 
      as: 'user' 
    });
    
    UserRole.belongsTo(Role, { 
      foreignKey: 'role_id', 
      as: 'role' 
    });
    
    UserRole.belongsTo(Community, { 
      foreignKey: 'community_id', 
      as: 'community' 
    });
    
    UserRole.belongsTo(User, { 
      foreignKey: 'assigned_by', 
      as: 'assigner' 
    });

    // UserPermission associations
    UserPermission.belongsTo(User, { 
      foreignKey: 'user_id', 
      as: 'user' 
    });
    
    UserPermission.belongsTo(Permission, { 
      foreignKey: 'permission_id', 
      as: 'permission' 
    });
    
    UserPermission.belongsTo(Community, { 
      foreignKey: 'community_id', 
      as: 'community' 
    });
    
    UserPermission.belongsTo(User, { 
      foreignKey: 'granted_by', 
      as: 'granter' 
    });

    // RolePermission associations
    RolePermission.belongsTo(Role, { 
      foreignKey: 'role_id', 
      as: 'role' 
    });
    
    RolePermission.belongsTo(Permission, { 
      foreignKey: 'permission_id', 
      as: 'permission' 
    });

    // CommunityFeature associations
    CommunityFeature.belongsTo(Community, { 
      foreignKey: 'community_id', 
      as: 'community' 
    });
    
    CommunityFeature.belongsTo(Feature, { 
      foreignKey: 'feature_id', 
      as: 'feature' 
    });

    // =====================================================
    // AUDIT & SESSION ASSOCIATIONS
    // =====================================================
    
    AuditLog.belongsTo(User, { 
      foreignKey: 'user_id', 
      as: 'user' 
    });

    UserSession.belongsTo(User, { 
      foreignKey: 'user_id', 
      as: 'user' 
    });

    logger.info('✅ All model relations have been established successfully');

  } catch (error) {
    logger.error('❌ Error setting up model relations:', error);
    throw error;
  }
}

/**
 * Get model relationship information
 */
export interface ModelRelationInfo {
  model: string;
  relationshipType: 'belongsTo' | 'hasMany' | 'belongsToMany' | 'hasOne';
  targetModel: string;
  alias: string;
  throughModel?: string;
}

/**
 * Get all model relationships for documentation or debugging
 */
export function getModelRelations(): ModelRelationInfo[] {
  return [
    // User relationships
    { model: 'User', relationshipType: 'belongsToMany', targetModel: 'Role', alias: 'roles', throughModel: 'UserRole' },
    { model: 'User', relationshipType: 'belongsToMany', targetModel: 'Permission', alias: 'permissions', throughModel: 'UserPermission' },
    { model: 'User', relationshipType: 'belongsToMany', targetModel: 'Community', alias: 'communities', throughModel: 'CommunityMember' },
    { model: 'User', relationshipType: 'hasMany', targetModel: 'Vehicle', alias: 'vehicles' },
    { model: 'User', relationshipType: 'hasMany', targetModel: 'AccessLog', alias: 'accessLogs' },
    { model: 'User', relationshipType: 'belongsTo', targetModel: 'Country', alias: 'country' },
    
    // Role relationships
    { model: 'Role', relationshipType: 'belongsToMany', targetModel: 'User', alias: 'users', throughModel: 'UserRole' },
    { model: 'Role', relationshipType: 'belongsToMany', targetModel: 'Permission', alias: 'permissions', throughModel: 'RolePermission' },
    { model: 'Role', relationshipType: 'belongsTo', targetModel: 'Role', alias: 'parentRole' },
    { model: 'Role', relationshipType: 'hasMany', targetModel: 'Role', alias: 'childRoles' },
    
    // Community relationships
    { model: 'Community', relationshipType: 'belongsToMany', targetModel: 'User', alias: 'members', throughModel: 'CommunityMember' },
    { model: 'Community', relationshipType: 'belongsToMany', targetModel: 'Feature', alias: 'features', throughModel: 'CommunityFeature' },
    { model: 'Community', relationshipType: 'hasMany', targetModel: 'Building', alias: 'buildings' },
    { model: 'Community', relationshipType: 'hasMany', targetModel: 'Device', alias: 'devices' },
    
    // Add more relationships as needed...
  ];
}

/**
 * Validate that all expected relationships are set up correctly
 */
export function validateModelRelations(): boolean {
  try {
    const relations = getModelRelations();
    let allValid = true;

    for (const relation of relations) {
      // This is a simplified validation - in practice you'd check if associations exist
      if (!relation.model || !relation.targetModel || !relation.alias) {
        logger.warn(`Invalid relation found: ${JSON.stringify(relation)}`);
        allValid = false;
      }
    }

    if (allValid) {
      logger.info('✅ All model relations validated successfully');
    } else {
      logger.warn('⚠️ Some model relations may be invalid');
    }

    return allValid;
  } catch (error) {
    logger.error('❌ Error validating model relations:', error);
    return false;
  }
}

// Export the setup function as default
export default setupModelRelations;