-- ==============================================
-- SKYN3T ACCESS CONTROL - ROLES SEED DATA
-- ==============================================
-- This file creates all system roles with proper hierarchy
-- Execute after: 01_countries.sql

-- ==============================================
-- CLEANUP EXISTING DATA (Development only)
-- ==============================================
-- TRUNCATE roles CASCADE;

-- ==============================================
-- SYSTEM ROLES HIERARCHY
-- ==============================================
-- Level 1 (Highest): SUPER_ADMIN
-- Level 2: PLATFORM_ADMIN  
-- Level 3: COMMUNITY_ADMIN
-- Level 4: BUILDING_ADMIN
-- Level 5: SECURITY_CHIEF
-- Level 6: SECURITY_GUARD
-- Level 7: FACILITY_MANAGER
-- Level 8: MAINTENANCE_STAFF
-- Level 9: OWNER
-- Level 10: TENANT
-- Level 11 (Lowest): VISITOR

-- ==============================================
-- SUPER ADMIN (Level 1)
-- ==============================================
INSERT INTO roles (
    id, code, name, description, level, 
    color, icon, is_system, is_active, 
    created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'SUPER_ADMIN',
    'Super Administrator',
    'Platform super administrator with complete system access across all communities',
    1,
    '#FF0000',
    'crown',
    true,
    true,
    NOW(),
    NOW()
);

-- ==============================================
-- PLATFORM ADMIN (Level 2)
-- ==============================================
INSERT INTO roles (
    id, code, name, description, level, 
    color, icon, is_system, is_active, 
    created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'PLATFORM_ADMIN',
    'Platform Administrator',
    'Platform administrator with access to multiple communities and system management',
    2,
    '#FF4500',
    'settings',
    true,
    true,
    NOW(),
    NOW()
);

-- ==============================================
-- COMMUNITY ADMIN (Level 3)
-- ==============================================
INSERT INTO roles (
    id, code, name, description, level, 
    color, icon, is_system, is_active, 
    created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'COMMUNITY_ADMIN',
    'Community Administrator',
    'Complete administrative access within a specific community',
    3,
    '#FF6600',
    'shield-check',
    true,
    true,
    NOW(),
    NOW()
);

-- ==============================================
-- BUILDING ADMIN (Level 4)
-- ==============================================
INSERT INTO roles (
    id, code, name, description, level, 
    color, icon, is_system, is_active, 
    created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'BUILDING_ADMIN',
    'Building Administrator',
    'Administrative access limited to specific buildings within a community',
    4,
    '#FF8800',
    'building',
    true,
    true,
    NOW(),
    NOW()
);

-- ==============================================
-- SECURITY CHIEF (Level 5)
-- ==============================================
INSERT INTO roles (
    id, code, name, description, level, 
    color, icon, is_system, is_active, 
    created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'SECURITY_CHIEF',
    'Security Chief',
    'Head of security operations with access control management privileges',
    5,
    '#FFA500',
    'shield',
    true,
    true,
    NOW(),
    NOW()
);

-- ==============================================
-- SECURITY GUARD (Level 6)
-- ==============================================
INSERT INTO roles (
    id, code, name, description, level, 
    color, icon, is_system, is_active, 
    created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'SECURITY_GUARD',
    'Security Guard',
    'Security personnel with monitoring and basic access control capabilities',
    6,
    '#FFB366',
    'eye',
    true,
    true,
    NOW(),
    NOW()
);

-- ==============================================
-- FACILITY MANAGER (Level 7)
-- ==============================================
INSERT INTO roles (
    id, code, name, description, level, 
    color, icon, is_system, is_active, 
    created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'FACILITY_MANAGER',
    'Facility Manager',
    'Facility management with access to building systems and maintenance coordination',
    7,
    '#FFCC00',
    'wrench',
    true,
    true,
    NOW(),
    NOW()
);

-- ==============================================
-- MAINTENANCE STAFF (Level 8)
-- ==============================================
INSERT INTO roles (
    id, code, name, description, level, 
    color, icon, is_system, is_active, 
    created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'MAINTENANCE_STAFF',
    'Maintenance Staff',
    'Maintenance personnel with limited system access for work orders and basic facilities',
    8,
    '#FFD700',
    'tool',
    true,
    true,
    NOW(),
    NOW()
);

-- ==============================================
-- OWNER (Level 9)
-- ==============================================
INSERT INTO roles (
    id, code, name, description, level, 
    color, icon, is_system, is_active, 
    created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'OWNER',
    'Property Owner',
    'Property owner with access to owned units and community features',
    9,
    '#32CD32',
    'home',
    true,
    true,
    NOW(),
    NOW()
);

-- ==============================================
-- TENANT (Level 10)
-- ==============================================
INSERT INTO roles (
    id, code, name, description, level, 
    color, icon, is_system, is_active, 
    created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'TENANT',
    'Tenant',
    'Property tenant with limited access to rented units and basic community features',
    10,
    '#4CAF50',
    'key',
    true,
    true,
    NOW(),
    NOW()
);

-- ==============================================
-- VISITOR (Level 11)
-- ==============================================
INSERT INTO roles (
    id, code, name, description, level, 
    color, icon, is_system, is_active, 
    created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'VISITOR',
    'Visitor',
    'Temporary visitor with very limited access, typically granted by residents',
    11,
    '#90EE90',
    'user-check',
    true,
    true,
    NOW(),
    NOW()
);

-- ==============================================
-- SPECIAL ROLES
-- ==============================================

-- Emergency Services
INSERT INTO roles (
    id, code, name, description, level, 
    color, icon, is_system, is_active, 
    created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'EMERGENCY_SERVICES',
    'Emergency Services',
    'Emergency services personnel (Police, Fire, Medical) with override access',
    1,
    '#DC143C',
    'plus-circle',
    true,
    true,
    NOW(),
    NOW()
);

-- Delivery Personnel
INSERT INTO roles (
    id, code, name, description, level, 
    color, icon, is_system, is_active, 
    created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'DELIVERY',
    'Delivery Personnel',
    'Delivery and service providers with temporary access to common areas',
    11,
    '#FFE4B5',
    'truck',
    true,
    true,
    NOW(),
    NOW()
);

-- Guest/Family Member
INSERT INTO roles (
    id, code, name, description, level, 
    color, icon, is_system, is_active, 
    created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'GUEST',
    'Guest',
    'Registered guest or family member with extended access granted by residents',
    10,
    '#DDA0DD',
    'users',
    true,
    true,
    NOW(),
    NOW()
);

-- Service Provider
INSERT INTO roles (
    id, code, name, description, level, 
    color, icon, is_system, is_active, 
    created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'SERVICE_PROVIDER',
    'Service Provider',
    'Regular service providers (cleaning, gardening, etc.) with scheduled access',
    9,
    '#F0E68C',
    'briefcase',
    true,
    true,
    NOW(),
    NOW()
);

-- ==============================================
-- ROLE FEATURES MAPPING
-- ==============================================
-- Define which features each role can access

-- Create role_features junction table data
-- Super Admin has access to all features
INSERT INTO role_features (role_id, feature_id, granted, created_at)
SELECT 
    r.id,
    f.id,
    true,
    NOW()
FROM roles r
CROSS JOIN features f
WHERE r.code = 'SUPER_ADMIN';

-- Platform Admin has access to most features except super admin functions
INSERT INTO role_features (role_id, feature_id, granted, created_at)
SELECT 
    r.id,
    f.id,
    true,
    NOW()
FROM roles r
CROSS JOIN features f
WHERE r.code = 'PLATFORM_ADMIN'
AND f.code NOT IN ('system.super_admin', 'system.platform_management');

-- Community Admin has access to community management features
INSERT INTO role_features (role_id, feature_id, granted, created_at)
SELECT 
    r.id,
    f.id,
    true,
    NOW()
FROM roles r
CROSS JOIN features f
WHERE r.code = 'COMMUNITY_ADMIN'
AND f.code IN (
    'community.management',
    'users.management',
    'access.management',
    'financial.management',
    'devices.management',
    'reports.community',
    'notifications.send'
);

-- ==============================================
-- ROLE HIERARCHY RELATIONSHIPS
-- ==============================================
-- Define parent-child relationships between roles

-- Platform Admin inherits from Community Admin
INSERT INTO role_hierarchy (parent_role_id, child_role_id, created_at)
SELECT 
    parent.id,
    child.id,
    NOW()
FROM roles parent, roles child
WHERE parent.code = 'PLATFORM_ADMIN' 
AND child.code = 'COMMUNITY_ADMIN';

-- Community Admin inherits from Building Admin
INSERT INTO role_hierarchy (parent_role_id, child_role_id, created_at)
SELECT 
    parent.id,
    child.id,
    NOW()
FROM roles parent, roles child
WHERE parent.code = 'COMMUNITY_ADMIN' 
AND child.code = 'BUILDING_ADMIN';

-- Building Admin inherits from Security Chief
INSERT INTO role_hierarchy (parent_role_id, child_role_id, created_at)
SELECT 
    parent.id,
    child.id,
    NOW()
FROM roles parent, roles child
WHERE parent.code = 'BUILDING_ADMIN' 
AND child.code = 'SECURITY_CHIEF';

-- Security Chief inherits from Security Guard
INSERT INTO role_hierarchy (parent_role_id, child_role_id, created_at)
SELECT 
    parent.id,
    child.id,
    NOW()
FROM roles parent, roles child
WHERE parent.code = 'SECURITY_CHIEF' 
AND child.code = 'SECURITY_GUARD';

-- ==============================================
-- ROLE PERMISSIONS SUMMARY
-- ==============================================
-- This is a reference of what each role should be able to do:

/*
SUPER_ADMIN:
- Complete system access
- Manage all communities
- System configuration
- User management across platform
- Financial oversight across all communities

PLATFORM_ADMIN:
- Multi-community access
- Community creation/management
- Platform-wide reports
- System monitoring
- User support across communities

COMMUNITY_ADMIN:
- Complete community management
- User management within community
- Financial management
- Device configuration
- Access control policies

BUILDING_ADMIN:
- Building-specific management
- Unit assignments
- Building access control
- Local user management

SECURITY_CHIEF:
- Security policy configuration
- Guard schedule management
- Access log review
- Incident management

SECURITY_GUARD:
- Access monitoring
- Manual access control
- Incident reporting
- Visitor management

FACILITY_MANAGER:
- Maintenance coordination
- Work order management
- Facility systems access
- Vendor management

MAINTENANCE_STAFF:
- Work order access
- Basic facility systems
- Equipment status reporting

OWNER:
- Own unit access
- Community features access
- Guest management
- Financial account access

TENANT:
- Assigned unit access
- Limited community features
- Basic account management

VISITOR:
- Temporary access only
- No management functions
- Limited to granted areas
*/

-- ==============================================
-- DATA VALIDATION
-- ==============================================
-- Verify all roles were created
SELECT 
    code,
    name,
    level,
    is_active,
    created_at
FROM roles 
ORDER BY level, code;

-- ==============================================
-- NOTES
-- ==============================================
-- 1. Role levels determine hierarchy (lower number = higher privilege)
-- 2. Colors are used for UI display and visual identification
-- 3. Icons follow Lucide React icon naming convention
-- 4. is_system = true means role cannot be deleted
-- 5. Role inheritance allows automatic permission propagation
-- 6. Each role should have appropriate default permissions assigned