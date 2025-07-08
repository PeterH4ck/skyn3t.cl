-- ==============================================
-- SKYN3T ACCESS CONTROL - PERMISSIONS SEED DATA
-- ==============================================
-- This file creates all system permissions organized by modules
-- Execute after: 02_roles.sql

-- ==============================================
-- CLEANUP EXISTING DATA (Development only)
-- ==============================================
-- TRUNCATE permissions CASCADE;

-- ==============================================
-- SYSTEM MODULE PERMISSIONS
-- ==============================================

-- System Administration
INSERT INTO permissions (id, code, module, action, name, description, risk_level, ui_elements, api_endpoints, is_active, created_at, updated_at) VALUES
(uuid_generate_v4(), 'system.super_admin', 'system', 'super_admin', 'Super Administrator Access', 'Complete system administration privileges', 'critical', '["admin_panel", "system_config"]', '["/admin/**"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'system.platform_management', 'system', 'platform_management', 'Platform Management', 'Manage platform-wide settings and configurations', 'critical', '["platform_settings"]', '["/admin/platform/**"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'system.monitoring', 'system', 'monitoring', 'System Monitoring', 'Access to system monitoring and health metrics', 'medium', '["monitoring_dashboard"]', '["/admin/monitoring/**", "/metrics/**"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'system.logs', 'system', 'logs', 'System Logs Access', 'View and manage system logs', 'medium', '["logs_viewer"]', '["/admin/logs/**"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'system.backup', 'system', 'backup', 'System Backup Management', 'Manage system backups and recovery', 'high', '["backup_management"]', '["/admin/backup/**"]', true, NOW(), NOW());

-- ==============================================
-- AUTHENTICATION MODULE PERMISSIONS
-- ==============================================

INSERT INTO permissions (id, code, module, action, name, description, risk_level, ui_elements, api_endpoints, is_active, created_at, updated_at) VALUES
(uuid_generate_v4(), 'auth.login', 'auth', 'login', 'Login Access', 'Ability to authenticate into the system', 'low', '["login_form"]', '["/auth/login"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'auth.2fa_enable', 'auth', '2fa_enable', 'Enable 2FA', 'Enable two-factor authentication', 'medium', '["2fa_setup"]', '["/auth/2fa/**"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'auth.password_reset', 'auth', 'password_reset', 'Password Reset', 'Reset user passwords', 'medium', '["password_reset"]', '["/auth/password/**"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'auth.session_management', 'auth', 'session_management', 'Session Management', 'Manage user sessions and tokens', 'high', '["session_manager"]', '["/auth/sessions/**"]', true, NOW(), NOW());

-- ==============================================
-- USER MODULE PERMISSIONS
-- ==============================================

-- User Management
INSERT INTO permissions (id, code, module, action, name, description, risk_level, ui_elements, api_endpoints, is_active, created_at, updated_at) VALUES
(uuid_generate_v4(), 'users.view', 'users', 'view', 'View Users', 'View user profiles and basic information', 'low', '["user_list", "user_profile"]', '["/users", "/users/*"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'users.create', 'users', 'create', 'Create Users', 'Create new user accounts', 'medium', '["user_create_form"]', '["/users POST"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'users.update', 'users', 'update', 'Update Users', 'Modify existing user information', 'medium', '["user_edit_form"]', '["/users/* PUT"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'users.delete', 'users', 'delete', 'Delete Users', 'Delete or deactivate user accounts', 'high', '["user_delete_button"]', '["/users/* DELETE"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'users.roles_manage', 'users', 'roles_manage', 'Manage User Roles', 'Assign and modify user roles', 'high', '["role_assignment"]', '["/users/*/roles/**"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'users.permissions_manage', 'users', 'permissions_manage', 'Manage User Permissions', 'Assign specific permissions to users', 'critical', '["permission_assignment"]', '["/users/*/permissions/**"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'users.profile_update', 'users', 'profile_update', 'Update Own Profile', 'Update own user profile information', 'low', '["profile_edit"]', '["/users/me PUT"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'users.avatar_upload', 'users', 'avatar_upload', 'Upload Avatar', 'Upload and manage user avatars', 'low', '["avatar_upload"]', '["/users/*/avatar POST"]', true, NOW(), NOW());

-- ==============================================
-- COMMUNITY MODULE PERMISSIONS
-- ==============================================

INSERT INTO permissions (id, code, module, action, name, description, risk_level, ui_elements, api_endpoints, is_active, created_at, updated_at) VALUES
(uuid_generate_v4(), 'communities.view', 'communities', 'view', 'View Communities', 'View community information and details', 'low', '["community_list", "community_profile"]', '["/communities", "/communities/*"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'communities.create', 'communities', 'create', 'Create Communities', 'Create new residential communities', 'critical', '["community_create_form"]', '["/communities POST"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'communities.update', 'communities', 'update', 'Update Communities', 'Modify community settings and information', 'high', '["community_edit_form"]', '["/communities/* PUT"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'communities.delete', 'communities', 'delete', 'Delete Communities', 'Delete or deactivate communities', 'critical', '["community_delete_button"]', '["/communities/* DELETE"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'communities.members_manage', 'communities', 'members_manage', 'Manage Community Members', 'Add, remove, and manage community members', 'medium', '["member_management"]', '["/communities/*/members/**"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'communities.settings_manage', 'communities', 'settings_manage', 'Manage Community Settings', 'Configure community-specific settings', 'high', '["community_settings"]', '["/communities/*/settings/**"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'communities.features_manage', 'communities', 'features_manage', 'Manage Community Features', 'Enable/disable community features', 'high', '["feature_management"]', '["/communities/*/features/**"]', true, NOW(), NOW());

-- ==============================================
-- ACCESS CONTROL MODULE PERMISSIONS
-- ==============================================

INSERT INTO permissions (id, code, module, action, name, description, risk_level, ui_elements, api_endpoints, is_active, created_at, updated_at) VALUES
(uuid_generate_v4(), 'access.doors.open', 'access', 'doors.open', 'Open Doors', 'Open access control doors and gates', 'medium', '["door_control_button"]', '["/devices/*/command POST"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'access.doors.lock', 'access', 'doors.lock', 'Lock Doors', 'Lock access control doors and gates', 'high', '["door_lock_button"]', '["/devices/*/command POST"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'access.emergency_override', 'access', 'emergency_override', 'Emergency Access Override', 'Override access controls in emergency situations', 'critical', '["emergency_override"]', '["/access/emergency/**"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'access.manual_authorize', 'access', 'manual_authorize', 'Manual Authorization', 'Manually authorize access for individuals', 'medium', '["manual_auth_button"]', '["/access/authorize POST"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'access.logs.view', 'access', 'logs.view', 'View Access Logs', 'View access attempt logs and history', 'low', '["access_logs"]', '["/access/logs"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'access.logs.export', 'access', 'logs.export', 'Export Access Logs', 'Export access logs for analysis', 'medium', '["logs_export_button"]', '["/access/logs/export"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'access.points.configure', 'access', 'points.configure', 'Configure Access Points', 'Configure access control points and devices', 'high', '["access_point_config"]', '["/access/points/** PUT"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'access.schedules.manage', 'access', 'schedules.manage', 'Manage Access Schedules', 'Create and manage access schedules', 'medium', '["schedule_management"]', '["/access/schedules/**"]', true, NOW(), NOW());

-- ==============================================
-- DEVICE MODULE PERMISSIONS
-- ==============================================

INSERT INTO permissions (id, code, module, action, name, description, risk_level, ui_elements, api_endpoints, is_active, created_at, updated_at) VALUES
(uuid_generate_v4(), 'devices.view', 'devices', 'view', 'View Devices', 'View device status and information', 'low', '["device_list", "device_status"]', '["/devices", "/devices/*"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'devices.control', 'devices', 'control', 'Control Devices', 'Send commands to IoT devices', 'medium', '["device_controls"]', '["/devices/*/command POST"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'devices.configure', 'devices', 'configure', 'Configure Devices', 'Configure device settings and parameters', 'high', '["device_config"]', '["/devices/* PUT"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'devices.add', 'devices', 'add', 'Add Devices', 'Register new devices to the system', 'high', '["device_add_form"]', '["/devices POST"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'devices.remove', 'devices', 'remove', 'Remove Devices', 'Remove devices from the system', 'high', '["device_remove_button"]', '["/devices/* DELETE"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'devices.maintenance', 'devices', 'maintenance', 'Device Maintenance', 'Perform maintenance operations on devices', 'medium', '["maintenance_panel"]', '["/devices/*/maintenance/**"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'devices.firmware_update', 'devices', 'firmware_update', 'Update Device Firmware', 'Update device firmware and software', 'high', '["firmware_update"]', '["/devices/*/firmware POST"]', true, NOW(), NOW());

-- ==============================================
-- FINANCIAL MODULE PERMISSIONS
-- ==============================================

INSERT INTO permissions (id, code, module, action, name, description, risk_level, ui_elements, api_endpoints, is_active, created_at, updated_at) VALUES
(uuid_generate_v4(), 'financial.view', 'financial', 'view', 'View Financial Data', 'View financial transactions and reports', 'low', '["financial_dashboard"]', '["/financial/**"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'financial.transactions.create', 'financial', 'transactions.create', 'Create Transactions', 'Create new financial transactions', 'medium', '["transaction_form"]', '["/financial/transactions POST"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'financial.transactions.approve', 'financial', 'transactions.approve', 'Approve Transactions', 'Approve pending financial transactions', 'high', '["approve_button"]', '["/financial/transactions/*/approve POST"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'financial.expenses.manage', 'financial', 'expenses.manage', 'Manage Expenses', 'Create and manage community expenses', 'medium', '["expense_management"]', '["/financial/expenses/**"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'financial.payments.process', 'financial', 'payments.process', 'Process Payments', 'Process resident payments and dues', 'high', '["payment_processing"]', '["/financial/payments/**"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'financial.reports.generate', 'financial', 'reports.generate', 'Generate Financial Reports', 'Generate financial reports and statements', 'medium', '["report_generator"]', '["/financial/reports/**"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'financial.budgets.manage', 'financial', 'budgets.manage', 'Manage Budgets', 'Create and manage community budgets', 'high', '["budget_management"]', '["/financial/budgets/**"]', true, NOW(), NOW());

-- ==============================================
-- NOTIFICATION MODULE PERMISSIONS
-- ==============================================

INSERT INTO permissions (id, code, module, action, name, description, risk_level, ui_elements, api_endpoints, is_active, created_at, updated_at) VALUES
(uuid_generate_v4(), 'notifications.view', 'notifications', 'view', 'View Notifications', 'View received notifications', 'low', '["notification_list"]', '["/notifications"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'notifications.send', 'notifications', 'send', 'Send Notifications', 'Send notifications to users', 'medium', '["notification_compose"]', '["/notifications/send POST"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'notifications.broadcast', 'notifications', 'broadcast', 'Broadcast Notifications', 'Send mass notifications to community', 'high', '["broadcast_panel"]', '["/notifications/broadcast POST"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'notifications.templates.manage', 'notifications', 'templates.manage', 'Manage Notification Templates', 'Create and manage notification templates', 'medium', '["template_management"]', '["/notifications/templates/**"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'notifications.emergency', 'notifications', 'emergency', 'Emergency Notifications', 'Send emergency alerts and notifications', 'critical', '["emergency_alert"]', '["/notifications/emergency POST"]', true, NOW(), NOW());

-- ==============================================
-- REPORTING MODULE PERMISSIONS
-- ==============================================

INSERT INTO permissions (id, code, module, action, name, description, risk_level, ui_elements, api_endpoints, is_active, created_at, updated_at) VALUES
(uuid_generate_v4(), 'reports.view', 'reports', 'view', 'View Reports', 'View system and community reports', 'low', '["reports_dashboard"]', '["/reports"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'reports.generate', 'reports', 'generate', 'Generate Reports', 'Generate custom reports', 'medium', '["report_generator"]', '["/reports/generate POST"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'reports.export', 'reports', 'export', 'Export Reports', 'Export reports in various formats', 'medium', '["export_button"]', '["/reports/*/export"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'reports.analytics', 'reports', 'analytics', 'View Analytics', 'Access advanced analytics and insights', 'low', '["analytics_dashboard"]', '["/reports/analytics/**"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'reports.community', 'reports', 'community', 'Community Reports', 'Generate community-specific reports', 'low', '["community_reports"]', '["/reports/community/**"]', true, NOW(), NOW());

-- ==============================================
-- VISITOR MODULE PERMISSIONS
-- ==============================================

INSERT INTO permissions (id, code, module, action, name, description, risk_level, ui_elements, api_endpoints, is_active, created_at, updated_at) VALUES
(uuid_generate_v4(), 'visitors.register', 'visitors', 'register', 'Register Visitors', 'Register new visitors for access', 'low', '["visitor_registration"]', '["/visitors POST"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'visitors.approve', 'visitors', 'approve', 'Approve Visitors', 'Approve visitor access requests', 'medium', '["visitor_approval"]', '["/visitors/*/approve POST"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'visitors.track', 'visitors', 'track', 'Track Visitors', 'Monitor visitor access and location', 'medium', '["visitor_tracking"]', '["/visitors/*/track"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'visitors.logs', 'visitors', 'logs', 'View Visitor Logs', 'View visitor access history', 'low', '["visitor_logs"]', '["/visitors/logs"]', true, NOW(), NOW());

-- ==============================================
-- MAINTENANCE MODULE PERMISSIONS
-- ==============================================

INSERT INTO permissions (id, code, module, action, name, description, risk_level, ui_elements, api_endpoints, is_active, created_at, updated_at) VALUES
(uuid_generate_v4(), 'maintenance.requests.view', 'maintenance', 'requests.view', 'View Maintenance Requests', 'View maintenance requests and work orders', 'low', '["maintenance_requests"]', '["/maintenance/requests"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'maintenance.requests.create', 'maintenance', 'requests.create', 'Create Maintenance Requests', 'Create new maintenance requests', 'low', '["request_form"]', '["/maintenance/requests POST"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'maintenance.requests.assign', 'maintenance', 'requests.assign', 'Assign Maintenance Requests', 'Assign work orders to maintenance staff', 'medium', '["assignment_panel"]', '["/maintenance/requests/*/assign POST"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'maintenance.schedule', 'maintenance', 'schedule', 'Maintenance Scheduling', 'Schedule maintenance activities', 'medium', '["schedule_management"]', '["/maintenance/schedule/**"]', true, NOW(), NOW());

-- ==============================================
-- SECURITY MODULE PERMISSIONS
-- ==============================================

INSERT INTO permissions (id, code, module, action, name, description, risk_level, ui_elements, api_endpoints, is_active, created_at, updated_at) VALUES
(uuid_generate_v4(), 'security.incidents.view', 'security', 'incidents.view', 'View Security Incidents', 'View security incidents and alerts', 'medium', '["incident_list"]', '["/security/incidents"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'security.incidents.create', 'security', 'incidents.create', 'Create Security Incidents', 'Report new security incidents', 'medium', '["incident_form"]', '["/security/incidents POST"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'security.patrol.manage', 'security', 'patrol.manage', 'Manage Security Patrols', 'Schedule and manage security patrols', 'medium', '["patrol_management"]', '["/security/patrols/**"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'security.cameras.view', 'security', 'cameras.view', 'View Security Cameras', 'Access security camera feeds', 'high', '["camera_viewer"]', '["/security/cameras/**"]', true, NOW(), NOW());

-- ==============================================
-- VEHICLE MODULE PERMISSIONS
-- ==============================================

INSERT INTO permissions (id, code, module, action, name, description, risk_level, ui_elements, api_endpoints, is_active, created_at, updated_at) VALUES
(uuid_generate_v4(), 'vehicles.register', 'vehicles', 'register', 'Register Vehicles', 'Register resident and visitor vehicles', 'low', '["vehicle_registration"]', '["/vehicles POST"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'vehicles.access', 'vehicles', 'access', 'Vehicle Access Control', 'Control vehicle access to parking areas', 'medium', '["vehicle_access"]', '["/vehicles/*/access POST"]', true, NOW(), NOW()),
(uuid_generate_v4(), 'vehicles.tracking', 'vehicles', 'tracking', 'Vehicle Tracking', 'Track vehicle movements and parking', 'medium', '["vehicle_tracking"]', '["/vehicles/tracking/**"]', true, NOW(), NOW());

-- ==============================================
-- ROLE-PERMISSION ASSIGNMENTS
-- ==============================================
-- Assign permissions to roles based on their level and responsibilities

-- Super Admin gets all permissions
INSERT INTO role_permissions (role_id, permission_id, granted, created_at)
SELECT 
    r.id as role_id,
    p.id as permission_id,
    true as granted,
    NOW() as created_at
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SUPER_ADMIN';

-- Platform Admin gets most permissions except super admin specific
INSERT INTO role_permissions (role_id, permission_id, granted, created_at)
SELECT 
    r.id as role_id,
    p.id as permission_id,
    true as granted,
    NOW() as created_at
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'PLATFORM_ADMIN'
AND p.code NOT LIKE 'system.super_admin%';

-- Community Admin gets community management permissions
INSERT INTO role_permissions (role_id, permission_id, granted, created_at)
SELECT 
    r.id as role_id,
    p.id as permission_id,
    true as granted,
    NOW() as created_at
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'COMMUNITY_ADMIN'
AND (
    p.module IN ('communities', 'users', 'access', 'financial', 'devices', 'notifications', 'reports', 'visitors', 'maintenance', 'security', 'vehicles')
    AND p.code NOT LIKE 'system.%'
    AND p.risk_level IN ('low', 'medium', 'high')
);

-- Building Admin gets building-level permissions
INSERT INTO role_permissions (role_id, permission_id, granted, created_at)
SELECT 
    r.id as role_id,
    p.id as permission_id,
    true as granted,
    NOW() as created_at
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'BUILDING_ADMIN'
AND (
    p.module IN ('users', 'access', 'devices', 'visitors', 'maintenance', 'security', 'vehicles')
    AND p.risk_level IN ('low', 'medium')
    AND p.code NOT LIKE 'system.%'
    AND p.code NOT LIKE '%.delete'
);

-- Security Chief gets security-related permissions
INSERT INTO role_permissions (role_id, permission_id, granted, created_at)
SELECT 
    r.id as role_id,
    p.id as permission_id,
    true as granted,
    NOW() as created_at
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SECURITY_CHIEF'
AND (
    p.module IN ('access', 'security', 'visitors', 'vehicles', 'devices')
    AND p.risk_level IN ('low', 'medium', 'high')
);

-- Security Guard gets basic security permissions
INSERT INTO role_permissions (role_id, permission_id, granted, created_at)
SELECT 
    r.id as role_id,
    p.id as permission_id,
    true as granted,
    NOW() as created_at
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SECURITY_GUARD'
AND (
    p.module IN ('access', 'security', 'visitors')
    AND p.risk_level IN ('low', 'medium')
    AND p.action IN ('view', 'manual_authorize', 'register', 'track', 'create', 'open')
);

-- Owner gets resident-level permissions
INSERT INTO role_permissions (role_id, permission_id, granted, created_at)
SELECT 
    r.id as role_id,
    p.id as permission_id,
    true as granted,
    NOW() as created_at
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'OWNER'
AND (
    (p.module = 'access' AND p.action IN ('doors.open', 'logs.view'))
    OR (p.module = 'financial' AND p.action = 'view')
    OR (p.module = 'visitors' AND p.action IN ('register', 'approve'))
    OR (p.module = 'vehicles' AND p.action IN ('register', 'access'))
    OR (p.module = 'maintenance' AND p.action IN ('requests.view', 'requests.create'))
    OR (p.module = 'notifications' AND p.action = 'view')
    OR (p.module = 'users' AND p.action = 'profile_update')
);

-- Tenant gets basic resident permissions
INSERT INTO role_permissions (role_id, permission_id, granted, created_at)
SELECT 
    r.id as role_id,
    p.id as permission_id,
    true as granted,
    NOW() as created_at
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'TENANT'
AND (
    (p.module = 'access' AND p.action = 'doors.open')
    OR (p.module = 'visitors' AND p.action = 'register')
    OR (p.module = 'vehicles' AND p.action = 'register')
    OR (p.module = 'maintenance' AND p.action IN ('requests.view', 'requests.create'))
    OR (p.module = 'notifications' AND p.action = 'view')
    OR (p.module = 'users' AND p.action = 'profile_update')
);

-- Visitor gets minimal permissions
INSERT INTO role_permissions (role_id, permission_id, granted, created_at)
SELECT 
    r.id as role_id,
    p.id as permission_id,
    true as granted,
    NOW() as created_at
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'VISITOR'
AND p.code IN ('access.doors.open', 'notifications.view');

-- ==============================================
-- DATA VALIDATION
-- ==============================================
-- Count permissions by module
SELECT 
    module,
    COUNT(*) as permission_count,
    COUNT(CASE WHEN risk_level = 'low' THEN 1 END) as low_risk,
    COUNT(CASE WHEN risk_level = 'medium' THEN 1 END) as medium_risk,
    COUNT(CASE WHEN risk_level = 'high' THEN 1 END) as high_risk,
    COUNT(CASE WHEN risk_level = 'critical' THEN 1 END) as critical_risk
FROM permissions 
GROUP BY module 
ORDER BY module;

-- Count role-permission assignments
SELECT 
    r.name as role_name,
    COUNT(rp.permission_id) as assigned_permissions
FROM roles r
LEFT JOIN role_permissions rp ON r.id = rp.role_id
GROUP BY r.id, r.name
ORDER BY r.level;

-- ==============================================
-- NOTES
-- ==============================================
-- 1. Permission codes follow pattern: module.action or module.resource.action
-- 2. Risk levels: low, medium, high, critical
-- 3. UI elements array contains frontend component identifiers
-- 4. API endpoints array contains REST API patterns
-- 5. Higher privilege roles inherit permissions from lower privilege roles
-- 6. Emergency services role has special override permissions
