-- =====================================================
-- SKYN3T ACCESS CONTROL - COMPLETE DATABASE SCHEMA
-- Database: master_db
-- Version: 1.0.0
-- PostgreSQL 15+
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Create custom types
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'deleted');
CREATE TYPE permission_risk_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'refunded');
CREATE TYPE device_status AS ENUM ('online', 'offline', 'error', 'maintenance');
CREATE TYPE access_method AS ENUM ('app', 'card', 'fingerprint', 'facial', 'plate', 'qr', 'pin');
CREATE TYPE notification_channel AS ENUM ('email', 'sms', 'whatsapp', 'push', 'in_app');
CREATE TYPE document_type AS ENUM ('id', 'passport', 'driver_license', 'residence_permit', 'other');

-- =====================================================
-- SYSTEM TABLES
-- =====================================================

-- Schema version control
CREATE TABLE schema_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version VARCHAR(20) NOT NULL,
    description TEXT,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    applied_by VARCHAR(100)
);

-- Countries support
CREATE TABLE countries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code CHAR(2) UNIQUE NOT NULL,
    code3 CHAR(3) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    phone_code VARCHAR(10),
    currency_code CHAR(3),
    timezone VARCHAR(50),
    locale VARCHAR(10),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Localization
CREATE TABLE localization (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    locale VARCHAR(10) NOT NULL,
    key VARCHAR(255) NOT NULL,
    value TEXT NOT NULL,
    module VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(locale, key)
);

-- Regional settings
CREATE TABLE regional_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country_id UUID REFERENCES countries(id),
    date_format VARCHAR(20),
    time_format VARCHAR(20),
    currency_format VARCHAR(50),
    decimal_separator CHAR(1),
    thousand_separator CHAR(1),
    first_day_of_week SMALLINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- USER AND AUTHENTICATION TABLES
-- =====================================================

-- Main users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    phone VARCHAR(20),
    phone_verified BOOLEAN DEFAULT false,
    email_verified BOOLEAN DEFAULT false,
    document_type document_type,
    document_number VARCHAR(50),
    birth_date DATE,
    nationality_id UUID REFERENCES countries(id),
    profile_photo_url VARCHAR(500),
    status user_status DEFAULT 'active',
    is_system_user BOOLEAN DEFAULT false,
    last_login_at TIMESTAMP,
    password_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- User sessions
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    refresh_token_hash VARCHAR(255) UNIQUE,
    ip_address INET,
    user_agent TEXT,
    device_fingerprint VARCHAR(255),
    location JSONB,
    expires_at TIMESTAMP NOT NULL,
    refresh_expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Two factor authentication
CREATE TABLE two_factor_auth (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    method VARCHAR(20) NOT NULL, -- totp, sms, email
    secret VARCHAR(255),
    backup_codes TEXT[],
    is_enabled BOOLEAN DEFAULT false,
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Failed login attempts
CREATE TABLE failed_login_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    reason VARCHAR(100),
    attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- IP whitelist/blacklist
CREATE TABLE ip_whitelist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ip_address INET NOT NULL,
    cidr_mask SMALLINT DEFAULT 32,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

CREATE TABLE ip_blacklist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ip_address INET NOT NULL,
    cidr_mask SMALLINT DEFAULT 32,
    reason TEXT,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- =====================================================
-- ROLES AND PERMISSIONS TABLES
-- =====================================================

-- System roles (11 levels)
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    level INT NOT NULL CHECK (level BETWEEN 1 AND 11),
    is_system_role BOOLEAN DEFAULT false,
    is_community_role BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Permissions
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(100) UNIQUE NOT NULL,
    module VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    risk_level permission_risk_level DEFAULT 'low',
    ui_elements JSONB,
    api_endpoints JSONB,
    dependencies JSONB,
    incompatible_with JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Role permissions
CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    granted_by UUID REFERENCES users(id),
    UNIQUE(role_id, permission_id)
);

-- User roles
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    community_id UUID, -- Will reference communities table
    building_id UUID, -- Will reference buildings table
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by UUID REFERENCES users(id),
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(user_id, role_id, community_id, building_id)
);

-- User specific permissions (overrides)
CREATE TABLE user_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    community_id UUID,
    building_id UUID,
    granted BOOLEAN DEFAULT true, -- true = grant, false = revoke
    reason TEXT,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    granted_by UUID REFERENCES users(id),
    expires_at TIMESTAMP,
    UNIQUE(user_id, permission_id, community_id, building_id)
);

-- Permission templates
CREATE TABLE permission_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    template_type VARCHAR(50), -- community, role, user
    permissions JSONB NOT NULL,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Permission inheritance
CREATE TABLE permission_inheritance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_role_id UUID REFERENCES roles(id),
    child_role_id UUID REFERENCES roles(id),
    inherit_all BOOLEAN DEFAULT true,
    excluded_permissions JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(parent_role_id, child_role_id)
);

-- Permission overrides
CREATE TABLE permission_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL, -- user, role, community
    entity_id UUID NOT NULL,
    permission_id UUID REFERENCES permissions(id),
    override_type VARCHAR(20) NOT NULL, -- grant, revoke, modify
    conditions JSONB,
    priority INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Permission changes log
CREATE TABLE permission_changes_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    permission_id UUID REFERENCES permissions(id),
    action VARCHAR(20) NOT NULL, -- grant, revoke, modify
    previous_value JSONB,
    new_value JSONB,
    reason TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    changed_by UUID REFERENCES users(id),
    ip_address INET,
    user_agent TEXT
);

-- Permission approval queue
CREATE TABLE permission_approval_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_type VARCHAR(50) NOT NULL,
    requester_id UUID REFERENCES users(id),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    permission_changes JSONB NOT NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    approver_id UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

-- =====================================================
-- FEATURE FLAGS AND MODULES
-- =====================================================

-- System modules
CREATE TABLE modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    route VARCHAR(100),
    parent_module_id UUID REFERENCES modules(id),
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Module actions
CREATE TABLE module_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id UUID REFERENCES modules(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    http_method VARCHAR(10),
    endpoint VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(module_id, code)
);

-- Feature flags
CREATE TABLE feature_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    is_enabled BOOLEAN DEFAULT false,
    rollout_percentage INT DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
    conditions JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Permission groups
CREATE TABLE permission_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    display_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Permission dependencies
CREATE TABLE permission_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    depends_on_permission_id UUID REFERENCES permissions(id),
    dependency_type VARCHAR(20) DEFAULT 'required', -- required, recommended
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(permission_id, depends_on_permission_id)
);

-- Feature pricing tiers
CREATE TABLE feature_pricing_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    monthly_price DECIMAL(10,2),
    annual_price DECIMAL(10,2),
    features JSONB NOT NULL,
    limits JSONB,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- UI menu items
CREATE TABLE ui_menu_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID REFERENCES ui_menu_items(id),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50),
    route VARCHAR(255),
    component VARCHAR(100),
    required_permissions JSONB,
    display_order INT DEFAULT 0,
    is_visible BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- UI visibility rules
CREATE TABLE ui_visibility_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ui_element VARCHAR(100) NOT NULL,
    element_type VARCHAR(50), -- menu, button, section, field
    visibility_conditions JSONB NOT NULL,
    applies_to_roles JSONB,
    applies_to_permissions JSONB,
    priority INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- COMMUNITY AND BUILDINGS
-- =====================================================

-- Communities (main tenant)
CREATE TABLE communities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    legal_name VARCHAR(300),
    tax_id VARCHAR(50),
    type VARCHAR(50), -- residential, commercial, mixed
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country_id UUID REFERENCES countries(id),
    phone VARCHAR(20),
    email VARCHAR(255),
    website VARCHAR(255),
    logo_url VARCHAR(500),
    primary_color VARCHAR(7),
    secondary_color VARCHAR(7),
    timezone VARCHAR(50),
    locale VARCHAR(10),
    currency_code CHAR(3),
    subscription_tier_id UUID REFERENCES feature_pricing_tiers(id),
    subscription_status VARCHAR(20) DEFAULT 'trial',
    subscription_expires_at TIMESTAMP,
    max_users INT DEFAULT 100,
    max_buildings INT DEFAULT 1,
    max_units INT DEFAULT 100,
    max_devices INT DEFAULT 10,
    storage_quota_gb INT DEFAULT 10,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Community settings
CREATE TABLE community_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    setting_key VARCHAR(100) NOT NULL,
    setting_value JSONB,
    setting_type VARCHAR(50),
    is_encrypted BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, setting_key)
);

-- Community hierarchy
CREATE TABLE community_hierarchy (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES community_hierarchy(id),
    level_type VARCHAR(50) NOT NULL, -- division, department, area
    name VARCHAR(200) NOT NULL,
    code VARCHAR(50),
    display_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Community roles (11 levels per community)
CREATE TABLE community_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id),
    custom_name VARCHAR(100),
    custom_permissions JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, role_id)
);

-- Community custom roles
CREATE TABLE community_custom_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    base_role_id UUID REFERENCES roles(id),
    permissions JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Community features
CREATE TABLE community_features (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    feature_flag_id UUID REFERENCES feature_flags(id),
    is_enabled BOOLEAN DEFAULT true,
    custom_config JSONB,
    enabled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    enabled_by UUID REFERENCES users(id),
    expires_at TIMESTAMP,
    UNIQUE(community_id, feature_flag_id)
);

-- Community permission settings
CREATE TABLE community_permission_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id),
    is_enabled BOOLEAN DEFAULT true,
    custom_config JSONB,
    applies_to_roles JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, permission_id)
);

-- Buildings
CREATE TABLE buildings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    address TEXT,
    floors_count INT DEFAULT 1,
    units_count INT DEFAULT 0,
    construction_year INT,
    building_type VARCHAR(50),
    amenities JSONB,
    emergency_contact_name VARCHAR(200),
    emergency_contact_phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, code)
);

-- Floors
CREATE TABLE floors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    building_id UUID REFERENCES buildings(id) ON DELETE CASCADE,
    floor_number INT NOT NULL,
    name VARCHAR(100),
    units_count INT DEFAULT 0,
    layout_image_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(building_id, floor_number)
);

-- Units (apartments/offices)
CREATE TABLE units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    building_id UUID REFERENCES buildings(id) ON DELETE CASCADE,
    floor_id UUID REFERENCES floors(id),
    unit_number VARCHAR(20) NOT NULL,
    unit_type VARCHAR(50), -- apartment, office, commercial, storage
    area_sqm DECIMAL(10,2),
    bedrooms INT,
    bathrooms INT,
    parking_spaces INT DEFAULT 0,
    storage_units INT DEFAULT 0,
    ownership_type VARCHAR(20), -- owned, rented
    is_occupied BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(building_id, unit_number)
);

-- Unit permission settings
CREATE TABLE unit_permission_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id),
    is_enabled BOOLEAN DEFAULT true,
    custom_config JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(unit_id, permission_id)
);

-- Common areas
CREATE TABLE common_areas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    building_id UUID REFERENCES buildings(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    area_type VARCHAR(50), -- pool, gym, meeting_room, etc
    capacity INT,
    requires_booking BOOLEAN DEFAULT false,
    booking_rules JSONB,
    equipment JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Community members
CREATE TABLE community_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES units(id),
    member_type VARCHAR(50), -- owner, tenant, family, staff
    relationship VARCHAR(50), -- spouse, child, parent, etc
    move_in_date DATE,
    move_out_date DATE,
    is_primary_resident BOOLEAN DEFAULT false,
    emergency_contact BOOLEAN DEFAULT false,
    vehicle_limit INT DEFAULT 2,
    guest_limit_per_day INT DEFAULT 5,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, user_id)
);

-- Emergency contacts
CREATE TABLE emergency_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_member_id UUID REFERENCES community_members(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    relationship VARCHAR(50),
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Announcements
CREATE TABLE announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    building_id UUID REFERENCES buildings(id),
    title VARCHAR(300) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(50),
    priority VARCHAR(20) DEFAULT 'normal',
    target_audience JSONB, -- specific units, floors, buildings
    attachments JSONB,
    publish_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Amenities booking
CREATE TABLE amenities_booking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    common_area_id UUID REFERENCES common_areas(id) ON DELETE CASCADE,
    booked_by UUID REFERENCES users(id),
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    guests_count INT DEFAULT 0,
    purpose TEXT,
    status VARCHAR(20) DEFAULT 'confirmed',
    cancellation_reason TEXT,
    cancelled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(common_area_id, booking_date, start_time, end_time)
);

-- =====================================================
-- STAFF AND WORKERS
-- =====================================================

-- Staff members
CREATE TABLE staff_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    employee_id VARCHAR(50),
    department VARCHAR(100),
    position VARCHAR(100),
    hire_date DATE,
    contract_type VARCHAR(50),
    work_schedule JSONB,
    hourly_rate DECIMAL(10,2),
    monthly_salary DECIMAL(10,2),
    emergency_contact_name VARCHAR(200),
    emergency_contact_phone VARCHAR(20),
    certifications JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, user_id)
);

-- Staff credentials
CREATE TABLE staff_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_member_id UUID REFERENCES staff_members(id) ON DELETE CASCADE,
    credential_type VARCHAR(50), -- badge, uniform, keys
    credential_number VARCHAR(100),
    issued_date DATE,
    expiry_date DATE,
    photo_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Staff shifts
CREATE TABLE staff_shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_member_id UUID REFERENCES staff_members(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_minutes INT DEFAULT 0,
    location VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Staff attendance
CREATE TABLE staff_attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_member_id UUID REFERENCES staff_members(id) ON DELETE CASCADE,
    shift_id UUID REFERENCES staff_shifts(id),
    check_in_time TIMESTAMP,
    check_in_location POINT,
    check_in_photo_url VARCHAR(500),
    check_out_time TIMESTAMP,
    check_out_location POINT,
    check_out_photo_url VARCHAR(500),
    total_hours DECIMAL(4,2),
    overtime_hours DECIMAL(4,2),
    status VARCHAR(20), -- present, absent, late, early_leave
    notes TEXT,
    verified_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Staff permissions
CREATE TABLE staff_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_member_id UUID REFERENCES staff_members(id) ON DELETE CASCADE,
    access_level VARCHAR(50),
    allowed_areas JSONB,
    restricted_areas JSONB,
    time_restrictions JSONB,
    special_permissions JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Staff evaluations
CREATE TABLE staff_evaluations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_member_id UUID REFERENCES staff_members(id) ON DELETE CASCADE,
    evaluation_period_start DATE,
    evaluation_period_end DATE,
    overall_rating INT CHECK (overall_rating BETWEEN 1 AND 5),
    punctuality_rating INT CHECK (punctuality_rating BETWEEN 1 AND 5),
    performance_rating INT CHECK (performance_rating BETWEEN 1 AND 5),
    attitude_rating INT CHECK (attitude_rating BETWEEN 1 AND 5),
    comments TEXT,
    goals_next_period TEXT,
    evaluated_by UUID REFERENCES users(id),
    evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Household workers
CREATE TABLE household_workers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    worker_type VARCHAR(50), -- maid, nanny, driver, gardener
    agency_name VARCHAR(200),
    agency_contact VARCHAR(20),
    insurance_policy_number VARCHAR(100),
    insurance_expiry_date DATE,
    background_check_date DATE,
    background_check_status VARCHAR(20),
    special_skills JSONB,
    languages_spoken JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Household worker schedule
CREATE TABLE household_worker_schedule (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_worker_id UUID REFERENCES household_workers(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
    day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME,
    end_time TIME,
    is_recurring BOOLEAN DEFAULT true,
    specific_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Family members
CREATE TABLE family_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    primary_member_id UUID REFERENCES community_members(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    relationship VARCHAR(50) NOT NULL,
    is_minor BOOLEAN DEFAULT false,
    guardian_consent BOOLEAN DEFAULT false,
    guardian_consent_date TIMESTAMP,
    special_needs TEXT,
    medical_conditions TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(primary_member_id, user_id)
);

-- Authorized persons
CREATE TABLE authorized_persons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_member_id UUID REFERENCES community_members(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    name VARCHAR(200) NOT NULL,
    document_type document_type,
    document_number VARCHAR(50),
    phone VARCHAR(20),
    email VARCHAR(255),
    relationship VARCHAR(100),
    authorization_type VARCHAR(50), -- permanent, temporary, emergency
    valid_from DATE,
    valid_until DATE,
    access_permissions JSONB,
    photo_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Person photos
CREATE TABLE person_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_type VARCHAR(50) NOT NULL, -- user, staff, worker, visitor
    person_id UUID NOT NULL,
    photo_type VARCHAR(50), -- profile, document, facial_recognition
    photo_url VARCHAR(500) NOT NULL,
    facial_encoding JSONB,
    is_primary BOOLEAN DEFAULT false,
    is_verified BOOLEAN DEFAULT false,
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Approval workflow
CREATE TABLE approval_workflow (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_type VARCHAR(50) NOT NULL,
    community_id UUID REFERENCES communities(id),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    steps JSONB NOT NULL,
    auto_approve_conditions JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Approval history
CREATE TABLE approval_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID REFERENCES approval_workflow(id),
    request_type VARCHAR(50),
    request_id UUID NOT NULL,
    step_number INT,
    approver_id UUID REFERENCES users(id),
    action VARCHAR(20), -- approved, rejected, returned
    comments TEXT,
    action_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Service providers
CREATE TABLE service_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    company_name VARCHAR(300) NOT NULL,
    tax_id VARCHAR(50),
    service_type VARCHAR(100),
    contact_name VARCHAR(200),
    contact_phone VARCHAR(20),
    contact_email VARCHAR(255),
    address TEXT,
    contract_start_date DATE,
    contract_end_date DATE,
    monthly_fee DECIMAL(10,2),
    payment_terms VARCHAR(100),
    insurance_policy_number VARCHAR(100),
    insurance_expiry_date DATE,
    rating DECIMAL(2,1),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contractor insurance
CREATE TABLE contractor_insurance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_provider_id UUID REFERENCES service_providers(id) ON DELETE CASCADE,
    insurance_type VARCHAR(100),
    policy_number VARCHAR(100),
    insurance_company VARCHAR(200),
    coverage_amount DECIMAL(12,2),
    effective_date DATE,
    expiry_date DATE,
    document_url VARCHAR(500),
    is_verified BOOLEAN DEFAULT false,
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Background checks
CREATE TABLE background_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_type VARCHAR(50) NOT NULL,
    person_id UUID NOT NULL,
    check_type VARCHAR(50), -- criminal, credit, employment
    provider_name VARCHAR(200),
    reference_number VARCHAR(100),
    status VARCHAR(20),
    result VARCHAR(20), -- clear, flagged, pending
    details JSONB,
    document_url VARCHAR(500),
    performed_at TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- INVITATIONS SYSTEM
-- =====================================================

-- Invitations
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inviter_id UUID REFERENCES users(id),
    community_id UUID REFERENCES communities(id),
    unit_id UUID REFERENCES units(id),
    guest_name VARCHAR(200) NOT NULL,
    guest_email VARCHAR(255),
    guest_phone VARCHAR(20),
    guest_document_number VARCHAR(50),
    invitation_type VARCHAR(50), -- single, recurring, event
    valid_from TIMESTAMP NOT NULL,
    valid_until TIMESTAMP NOT NULL,
    access_code VARCHAR(20) UNIQUE,
    qr_code_url VARCHAR(500),
    status VARCHAR(20) DEFAULT 'pending',
    max_uses INT DEFAULT 1,
    current_uses INT DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMP,
    cancelled_by UUID REFERENCES users(id)
);

-- Invitation templates
CREATE TABLE invitation_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    template_type VARCHAR(50),
    default_duration_hours INT DEFAULT 24,
    default_access_methods JSONB,
    default_access_areas JSONB,
    message_template TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Invitation access methods
CREATE TABLE invitation_access_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invitation_id UUID REFERENCES invitations(id) ON DELETE CASCADE,
    access_method access_method NOT NULL,
    method_data JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invitation responses
CREATE TABLE invitation_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invitation_id UUID REFERENCES invitations(id) ON DELETE CASCADE,
    response_status VARCHAR(20), -- accepted, declined, maybe
    response_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    guest_message TEXT,
    updated_guest_name VARCHAR(200),
    updated_guest_phone VARCHAR(20)
);

-- Invitation vehicles
CREATE TABLE invitation_vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invitation_id UUID REFERENCES invitations(id) ON DELETE CASCADE,
    plate_number VARCHAR(20) NOT NULL,
    vehicle_brand VARCHAR(50),
    vehicle_model VARCHAR(50),
    vehicle_color VARCHAR(30),
    vehicle_type VARCHAR(30),
    photo_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invitation vehicle photos
CREATE TABLE invitation_vehicle_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invitation_vehicle_id UUID REFERENCES invitation_vehicles(id) ON DELETE CASCADE,
    photo_type VARCHAR(50), -- plate, front, side, back
    photo_url VARCHAR(500) NOT NULL,
    ocr_extracted_plate VARCHAR(20),
    ocr_confidence DECIMAL(3,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invitation access logs
CREATE TABLE invitation_access_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invitation_id UUID REFERENCES invitations(id),
    access_point_id UUID, -- Will reference access_points
    access_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    access_method access_method,
    vehicle_plate VARCHAR(20),
    photo_url VARCHAR(500),
    location POINT,
    granted BOOLEAN DEFAULT true,
    denial_reason VARCHAR(100)
);

-- Invitation limits
CREATE TABLE invitation_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    role_id UUID REFERENCES roles(id),
    unit_type VARCHAR(50),
    daily_limit INT DEFAULT 5,
    weekly_limit INT DEFAULT 20,
    monthly_limit INT DEFAULT 50,
    simultaneous_limit INT DEFAULT 3,
    advance_days_limit INT DEFAULT 30,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Recurring invitations
CREATE TABLE recurring_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    base_invitation_id UUID REFERENCES invitations(id),
    recurrence_pattern VARCHAR(20), -- daily, weekly, monthly
    recurrence_interval INT DEFAULT 1,
    days_of_week INT[], -- 0-6 for weekly
    day_of_month INT, -- for monthly
    end_date DATE,
    occurrences_count INT DEFAULT 0,
    max_occurrences INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invitation schedules
CREATE TABLE invitation_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invitation_id UUID REFERENCES invitations(id) ON DELETE CASCADE,
    day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Blacklisted guests
CREATE TABLE blacklisted_guests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    document_number VARCHAR(50),
    name VARCHAR(200),
    phone VARCHAR(20),
    email VARCHAR(255),
    reason TEXT NOT NULL,
    photo_url VARCHAR(500),
    blacklisted_by UUID REFERENCES users(id),
    blacklisted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Invitation notifications
CREATE TABLE invitation_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invitation_id UUID REFERENCES invitations(id) ON DELETE CASCADE,
    notification_type VARCHAR(50), -- created, reminder, expired, used
    channel notification_channel,
    recipient VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending',
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- ACCESS CONTROL AND HARDWARE
-- =====================================================

-- Device types
CREATE TABLE device_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50), -- access, camera, sensor, alarm
    manufacturer VARCHAR(100),
    model VARCHAR(100),
    communication_protocol VARCHAR(50),
    supported_features JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Devices
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    device_type_id UUID REFERENCES device_types(id),
    serial_number VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    location VARCHAR(500),
    building_id UUID REFERENCES buildings(id),
    floor_id UUID REFERENCES floors(id),
    ip_address INET,
    mac_address MACADDR,
    firmware_version VARCHAR(50),
    last_heartbeat TIMESTAMP,
    status device_status DEFAULT 'offline',
    config JSONB,
    is_active BOOLEAN DEFAULT true,
    installed_at TIMESTAMP,
    installed_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Device status
CREATE TABLE device_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    status device_status NOT NULL,
    cpu_usage DECIMAL(5,2),
    memory_usage DECIMAL(5,2),
    disk_usage DECIMAL(5,2),
    temperature DECIMAL(5,2),
    uptime_seconds BIGINT,
    error_count INT DEFAULT 0,
    last_error TEXT,
    metrics JSONB,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Device controllers
CREATE TABLE device_controllers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    controller_type VARCHAR(50),
    ip_address INET,
    port INT,
    max_devices INT DEFAULT 32,
    connected_devices INT DEFAULT 0,
    is_master BOOLEAN DEFAULT false,
    status device_status DEFAULT 'offline',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Access points
CREATE TABLE access_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    building_id UUID REFERENCES buildings(id),
    device_id UUID REFERENCES devices(id),
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50), -- door, gate, barrier, elevator
    direction VARCHAR(20), -- in, out, both
    location VARCHAR(500),
    floor_id UUID REFERENCES floors(id),
    is_emergency_exit BOOLEAN DEFAULT false,
    anti_passback_enabled BOOLEAN DEFAULT false,
    interlock_group VARCHAR(50),
    schedule_id UUID,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Access rules
CREATE TABLE access_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    rule_type VARCHAR(50), -- always, schedule, conditional
    priority INT DEFAULT 0,
    conditions JSONB,
    actions JSONB,
    valid_from TIMESTAMP,
    valid_until TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Access logs
CREATE TABLE access_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    access_point_id UUID REFERENCES access_points(id),
    user_id UUID REFERENCES users(id),
    access_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    access_method access_method NOT NULL,
    direction VARCHAR(10), -- in, out
    granted BOOLEAN NOT NULL,
    denial_reason VARCHAR(100),
    operator_id UUID REFERENCES users(id),
    vehicle_plate VARCHAR(20),
    photo_url VARCHAR(500),
    facial_match_score DECIMAL(3,2),
    temperature DECIMAL(4,1),
    device_id UUID REFERENCES devices(id),
    response_time_ms INT,
    INDEX idx_access_logs_time (access_time DESC),
    INDEX idx_access_logs_user (user_id, access_time DESC)
);

-- Access operators
CREATE TABLE access_operators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    access_log_id UUID REFERENCES access_logs(id),
    operator_id UUID REFERENCES users(id) NOT NULL,
    action VARCHAR(50), -- authorized, denied, override
    reason TEXT,
    operator_photo_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Access methods configuration
CREATE TABLE access_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    method access_method NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    config JSONB,
    priority INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, method)
);

-- Visitor registry
CREATE TABLE visitor_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    unit_id UUID REFERENCES units(id),
    visitor_name VARCHAR(200) NOT NULL,
    document_type document_type,
    document_number VARCHAR(50),
    phone VARCHAR(20),
    email VARCHAR(255),
    company VARCHAR(200),
    purpose TEXT,
    host_id UUID REFERENCES users(id),
    check_in_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    check_out_time TIMESTAMP,
    vehicle_plate VARCHAR(20),
    visitor_photo_url VARCHAR(500),
    document_photo_url VARCHAR(500),
    items_carried TEXT,
    badge_number VARCHAR(50),
    created_by UUID REFERENCES users(id)
);

-- Vehicles
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID REFERENCES users(id),
    community_id UUID REFERENCES communities(id),
    plate_number VARCHAR(20) NOT NULL,
    brand VARCHAR(50),
    model VARCHAR(50),
    year INT,
    color VARCHAR(30),
    type VARCHAR(30), -- car, motorcycle, truck, bus
    parking_spot VARCHAR(20),
    tag_number VARCHAR(50),
    insurance_company VARCHAR(100),
    insurance_policy VARCHAR(100),
    insurance_expiry DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, plate_number)
);

-- Vehicle tags
CREATE TABLE vehicle_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
    tag_number VARCHAR(50) UNIQUE NOT NULL,
    tag_type VARCHAR(20), -- rfid, uhf, nfc
    issued_date DATE,
    expiry_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- License plates (for LPR)
CREATE TABLE license_plates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plate_number VARCHAR(20) NOT NULL,
    country_id UUID REFERENCES countries(id),
    state_province VARCHAR(50),
    plate_type VARCHAR(50),
    confidence_score DECIMAL(3,2),
    last_seen TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_plate_number (plate_number)
);

-- Vehicle colors
CREATE TABLE vehicle_colors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(50) NOT NULL,
    hex_color VARCHAR(7),
    display_order INT DEFAULT 0
);

-- Vehicle brands
CREATE TABLE vehicle_brands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    logo_url VARCHAR(500),
    country_id UUID REFERENCES countries(id),
    is_active BOOLEAN DEFAULT true
);

-- Vehicle models
CREATE TABLE vehicle_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand_id UUID REFERENCES vehicle_brands(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    vehicle_type VARCHAR(30),
    year_from INT,
    year_to INT,
    UNIQUE(brand_id, name)
);

-- Plate formats
CREATE TABLE plate_formats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country_id UUID REFERENCES countries(id),
    format_regex VARCHAR(255) NOT NULL,
    description TEXT,
    example VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Biometric data
CREATE TABLE biometric_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    biometric_type VARCHAR(20), -- fingerprint, facial, iris
    template_data TEXT, -- encrypted biometric template
    quality_score INT,
    device_id UUID REFERENCES devices(id),
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Facial encodings
CREATE TABLE facial_encodings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    encoding JSONB NOT NULL, -- 128D face encoding vector
    photo_url VARCHAR(500),
    quality_score DECIMAL(3,2),
    confidence_threshold DECIMAL(3,2) DEFAULT 0.6,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_primary BOOLEAN DEFAULT false
);

-- RFID cards
CREATE TABLE rfid_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    card_number VARCHAR(50) UNIQUE NOT NULL,
    card_type VARCHAR(20), -- mifare, hid, em
    facility_code VARCHAR(20),
    issued_date DATE,
    expiry_date DATE,
    is_active BOOLEAN DEFAULT true,
    is_lost BOOLEAN DEFAULT false,
    deactivated_at TIMESTAMP,
    deactivated_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- QR codes
CREATE TABLE qr_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL, -- user, invitation, package
    entity_id UUID NOT NULL,
    code VARCHAR(100) UNIQUE NOT NULL,
    qr_data JSONB,
    valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP,
    max_uses INT DEFAULT 1,
    current_uses INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mobile devices
CREATE TABLE mobile_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_uuid VARCHAR(100) UNIQUE NOT NULL,
    device_name VARCHAR(100),
    device_type VARCHAR(50), -- ios, android
    device_model VARCHAR(100),
    os_version VARCHAR(50),
    app_version VARCHAR(50),
    push_token VARCHAR(500),
    bluetooth_mac MACADDR,
    is_trusted BOOLEAN DEFAULT false,
    last_seen TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- GPS zones
CREATE TABLE gps_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    zone_type VARCHAR(50), -- entry, parking, restricted
    center_point POINT NOT NULL,
    radius_meters INT NOT NULL,
    polygon POLYGON,
    altitude_min INT,
    altitude_max INT,
    schedule_id UUID,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Incidents
CREATE TABLE incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    incident_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20), -- low, medium, high, critical
    title VARCHAR(300) NOT NULL,
    description TEXT,
    location VARCHAR(500),
    reported_by UUID REFERENCES users(id),
    assigned_to UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'open',
    resolution TEXT,
    resolved_at TIMESTAMP,
    attachments JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Maintenance requests
CREATE TABLE maintenance_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    unit_id UUID REFERENCES units(id),
    category VARCHAR(50),
    priority VARCHAR(20) DEFAULT 'normal',
    title VARCHAR(300) NOT NULL,
    description TEXT,
    location VARCHAR(500),
    requested_by UUID REFERENCES users(id),
    assigned_to UUID REFERENCES users(id),
    scheduled_date DATE,
    completed_date DATE,
    status VARCHAR(20) DEFAULT 'pending',
    cost DECIMAL(10,2),
    vendor_id UUID REFERENCES service_providers(id),
    photos JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Delivery authorizations
CREATE TABLE delivery_authorizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id UUID REFERENCES units(id),
    recipient_id UUID REFERENCES users(id),
    delivery_company VARCHAR(200),
    tracking_number VARCHAR(100),
    expected_date DATE,
    package_description TEXT,
    authorization_code VARCHAR(20),
    authorized_by UUID REFERENCES users(id),
    received_by UUID REFERENCES users(id),
    received_at TIMESTAMP,
    signature_url VARCHAR(500),
    photo_url VARCHAR(500),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Blacklist community
CREATE TABLE blacklist_community (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    person_type VARCHAR(50), -- visitor, worker, vehicle
    identifier VARCHAR(100) NOT NULL, -- document, plate, etc
    name VARCHAR(200),
    reason TEXT NOT NULL,
    evidence JSONB,
    reported_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    blacklisted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Device commands queue
CREATE TABLE device_commands_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES devices(id),
    command VARCHAR(100) NOT NULL,
    parameters JSONB,
    priority INT DEFAULT 0,
    scheduled_at TIMESTAMP,
    sent_at TIMESTAMP,
    acknowledged_at TIMESTAMP,
    completed_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending',
    retry_count INT DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Device heartbeat
CREATE TABLE device_heartbeat (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    heartbeat_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    response_time_ms INT,
    status device_status,
    metrics JSONB
);

-- Anti passback
CREATE TABLE anti_passback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    area VARCHAR(100) NOT NULL,
    last_direction VARCHAR(10) NOT NULL, -- in, out
    last_access_time TIMESTAMP NOT NULL,
    access_point_id UUID REFERENCES access_points(id),
    is_inside BOOLEAN DEFAULT false,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, area)
);

-- Interlock rules
CREATE TABLE interlock_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    rule_name VARCHAR(200) NOT NULL,
    door_group VARCHAR(100) NOT NULL,
    max_open_doors INT DEFAULT 1,
    doors JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Emergency procedures
CREATE TABLE emergency_procedures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    procedure_type VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    trigger_conditions JSONB,
    actions JSONB NOT NULL,
    notification_list JSONB,
    is_active BOOLEAN DEFAULT true,
    last_triggered TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- FINANCIAL TABLES
-- =====================================================

-- Bank configurations
CREATE TABLE bank_configurations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_code VARCHAR(20) UNIQUE NOT NULL,
    bank_name VARCHAR(100) NOT NULL,
    country_id UUID REFERENCES countries(id),
    api_base_url VARCHAR(500),
    api_version VARCHAR(20),
    auth_method VARCHAR(50), -- oauth2, api_key, certificate
    supported_operations JSONB,
    rate_limits JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bank accounts
CREATE TABLE bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    bank_configuration_id UUID REFERENCES bank_configurations(id),
    account_number VARCHAR(50) NOT NULL,
    account_type VARCHAR(50),
    account_holder VARCHAR(300),
    currency_code CHAR(3),
    current_balance DECIMAL(15,2),
    available_balance DECIMAL(15,2),
    is_primary BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    last_sync TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, bank_configuration_id, account_number)
);

-- Bank credentials (encrypted)
CREATE TABLE bank_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE CASCADE,
    credential_type VARCHAR(50), -- api_key, certificate, oauth_token
    encrypted_value TEXT NOT NULL,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bank API logs
CREATE TABLE bank_api_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_account_id UUID REFERENCES bank_accounts(id),
    api_method VARCHAR(100),
    request_data JSONB,
    response_data JSONB,
    status_code INT,
    error_message TEXT,
    execution_time_ms INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment gateways
CREATE TABLE payment_gateways (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gateway_code VARCHAR(50) UNIQUE NOT NULL,
    gateway_name VARCHAR(100) NOT NULL,
    gateway_type VARCHAR(50), -- bank, card, wallet, crypto
    supported_currencies JSONB,
    supported_countries JSONB,
    transaction_fee_percentage DECIMAL(5,3),
    transaction_fee_fixed DECIMAL(10,2),
    monthly_fee DECIMAL(10,2),
    api_version VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment gateway transactions
CREATE TABLE payment_gateway_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gateway_id UUID REFERENCES payment_gateways(id),
    community_id UUID REFERENCES communities(id),
    transaction_id VARCHAR(100) UNIQUE NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    currency_code CHAR(3) NOT NULL,
    status payment_status DEFAULT 'pending',
    gateway_response JSONB,
    fee_amount DECIMAL(10,2),
    net_amount DECIMAL(15,2),
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment routing rules
CREATE TABLE payment_routing_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    rule_name VARCHAR(200) NOT NULL,
    priority INT DEFAULT 0,
    conditions JSONB NOT NULL,
    gateway_preference_order JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment retry queue
CREATE TABLE payment_retry_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_payment_id UUID NOT NULL,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    next_retry_at TIMESTAMP,
    last_error TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PayPal transactions
CREATE TABLE paypal_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    paypal_order_id VARCHAR(100) UNIQUE,
    paypal_capture_id VARCHAR(100),
    amount DECIMAL(15,2) NOT NULL,
    currency_code CHAR(3) NOT NULL,
    payer_email VARCHAR(255),
    payer_name VARCHAR(200),
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment fees
CREATE TABLE payment_fees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_method VARCHAR(50) NOT NULL,
    country_id UUID REFERENCES countries(id),
    percentage_fee DECIMAL(5,3),
    fixed_fee DECIMAL(10,2),
    min_fee DECIMAL(10,2),
    max_fee DECIMAL(10,2),
    effective_from DATE,
    effective_to DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment reconciliation multi
CREATE TABLE payment_reconciliation_multi (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    reconciliation_date DATE NOT NULL,
    bank_account_id UUID REFERENCES bank_accounts(id),
    total_transactions INT,
    matched_transactions INT,
    unmatched_transactions INT,
    total_amount DECIMAL(15,2),
    matched_amount DECIMAL(15,2),
    discrepancy_amount DECIMAL(15,2),
    status VARCHAR(20) DEFAULT 'pending',
    reconciled_by UUID REFERENCES users(id),
    reconciled_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bank health status
CREATE TABLE bank_health_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_configuration_id UUID REFERENCES bank_configurations(id),
    status VARCHAR(20) DEFAULT 'unknown',
    last_check TIMESTAMP,
    response_time_ms INT,
    success_rate_24h DECIMAL(5,2),
    error_count_24h INT,
    last_error TEXT,
    next_check TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- ANALYTICS AND REPORTING
-- =====================================================

-- Analytics dashboards
CREATE TABLE analytics_dashboards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    dashboard_type VARCHAR(50),
    layout JSONB,
    filters JSONB,
    is_default BOOLEAN DEFAULT false,
    is_public BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Analytics widgets
CREATE TABLE analytics_widgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dashboard_id UUID REFERENCES analytics_dashboards(id) ON DELETE CASCADE,
    widget_type VARCHAR(50) NOT NULL,
    title VARCHAR(200),
    data_source VARCHAR(100),
    query JSONB,
    visualization_type VARCHAR(50),
    config JSONB,
    position JSONB,
    refresh_interval INT, -- seconds
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Analytics KPIs
CREATE TABLE analytics_kpis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    kpi_code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    calculation_method JSONB,
    target_value DECIMAL(15,2),
    unit VARCHAR(20),
    frequency VARCHAR(20), -- daily, weekly, monthly
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, kpi_code)
);

-- Analytics reports
CREATE TABLE analytics_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    report_type VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    parameters JSONB,
    output_format VARCHAR(20), -- pdf, excel, csv
    file_url VARCHAR(500),
    generated_by UUID REFERENCES users(id),
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

-- Analytics scheduled reports
CREATE TABLE analytics_scheduled_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_template_id UUID NOT NULL,
    community_id UUID REFERENCES communities(id),
    name VARCHAR(200) NOT NULL,
    schedule_cron VARCHAR(50),
    recipients JSONB,
    parameters JSONB,
    last_run TIMESTAMP,
    next_run TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Data visualizations
CREATE TABLE data_visualizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    name VARCHAR(200) NOT NULL,
    viz_type VARCHAR(50),
    data_query TEXT,
    config JSONB,
    is_public BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Metric thresholds
CREATE TABLE metric_thresholds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kpi_id UUID REFERENCES analytics_kpis(id),
    threshold_type VARCHAR(20), -- min, max, range
    warning_value DECIMAL(15,2),
    critical_value DECIMAL(15,2),
    notification_channels JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Metric history
CREATE TABLE metric_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kpi_id UUID REFERENCES analytics_kpis(id),
    value DECIMAL(15,2) NOT NULL,
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_metric_history_kpi_time (kpi_id, period_start DESC)
);

-- Benchmark data
CREATE TABLE benchmark_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_type VARCHAR(100) NOT NULL,
    industry VARCHAR(50),
    region VARCHAR(50),
    percentile_25 DECIMAL(15,2),
    percentile_50 DECIMAL(15,2),
    percentile_75 DECIMAL(15,2),
    percentile_90 DECIMAL(15,2),
    sample_size INT,
    period VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ML predictions
CREATE TABLE ml_predictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_name VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID NOT NULL,
    prediction_type VARCHAR(50),
    predicted_value JSONB,
    confidence_score DECIMAL(3,2),
    features_used JSONB,
    predicted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actual_value JSONB,
    feedback_received_at TIMESTAMP
);

-- Trend analysis
CREATE TABLE trend_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    metric_type VARCHAR(100) NOT NULL,
    period VARCHAR(20),
    trend_direction VARCHAR(20), -- increasing, decreasing, stable
    change_percentage DECIMAL(10,2),
    significance_level DECIMAL(3,2),
    analysis_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- COMMUNICATION AND FEEDBACK
-- =====================================================

-- Suggestions complaints
CREATE TABLE suggestions_complaints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    type VARCHAR(20) NOT NULL, -- suggestion, complaint
    category VARCHAR(50),
    title VARCHAR(300) NOT NULL,
    description TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'normal',
    status VARCHAR(20) DEFAULT 'open',
    submitted_by UUID REFERENCES users(id),
    is_anonymous BOOLEAN DEFAULT false,
    assigned_to UUID REFERENCES users(id),
    resolution TEXT,
    resolved_at TIMESTAMP,
    satisfaction_rating INT CHECK (satisfaction_rating BETWEEN 1 AND 5),
    attachments JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Suggestion categories
CREATE TABLE suggestion_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    color VARCHAR(7),
    sla_hours INT DEFAULT 48,
    auto_assign_to UUID REFERENCES users(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Suggestion status
CREATE TABLE suggestion_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suggestion_id UUID REFERENCES suggestions_complaints(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL,
    notes TEXT,
    changed_by UUID REFERENCES users(id),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Suggestion responses
CREATE TABLE suggestion_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suggestion_id UUID REFERENCES suggestions_complaints(id) ON DELETE CASCADE,
    response_text TEXT NOT NULL,
    is_public BOOLEAN DEFAULT true,
    responded_by UUID REFERENCES users(id),
    responded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Suggestion votes
CREATE TABLE suggestion_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suggestion_id UUID REFERENCES suggestions_complaints(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    vote_type VARCHAR(10), -- up, down
    voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(suggestion_id, user_id)
);

-- Satisfaction surveys
CREATE TABLE satisfaction_surveys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    survey_type VARCHAR(50),
    title VARCHAR(300) NOT NULL,
    description TEXT,
    questions JSONB NOT NULL,
    target_audience JSONB,
    start_date DATE,
    end_date DATE,
    is_anonymous BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- NPS scores
CREATE TABLE nps_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    user_id UUID REFERENCES users(id),
    score INT NOT NULL CHECK (score BETWEEN 0 AND 10),
    feedback TEXT,
    category VARCHAR(20), -- promoter, passive, detractor
    survey_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Complaint escalations
CREATE TABLE complaint_escalations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    complaint_id UUID REFERENCES suggestions_complaints(id),
    escalated_to UUID REFERENCES users(id),
    escalation_level INT DEFAULT 1,
    reason TEXT,
    escalated_by UUID REFERENCES users(id),
    escalated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Resolution SLA
CREATE TABLE resolution_sla (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    category_id UUID REFERENCES suggestion_categories(id),
    priority VARCHAR(20),
    response_time_hours INT DEFAULT 24,
    resolution_time_hours INT DEFAULT 72,
    escalation_time_hours INT DEFAULT 48,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mass communications
CREATE TABLE mass_communications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    title VARCHAR(300) NOT NULL,
    message TEXT NOT NULL,
    message_type VARCHAR(20), -- info, urgent, alert
    target_audience JSONB NOT NULL,
    channels JSONB NOT NULL,
    scheduled_at TIMESTAMP,
    sent_at TIMESTAMP,
    sent_by UUID REFERENCES users(id),
    total_recipients INT,
    status VARCHAR(20) DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Communication templates
CREATE TABLE communication_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    template_code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(50),
    subject VARCHAR(500),
    body_html TEXT,
    body_text TEXT,
    variables JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, template_code)
);

-- Communication segments
CREATE TABLE communication_segments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    criteria JSONB NOT NULL,
    member_count INT DEFAULT 0,
    last_updated TIMESTAMP,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Communication channels
CREATE TABLE communication_channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    channel notification_channel NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    config JSONB,
    cost_per_message DECIMAL(10,4),
    daily_limit INT,
    monthly_limit INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, channel)
);

-- Communication schedule
CREATE TABLE communication_schedule (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    communication_id UUID REFERENCES mass_communications(id),
    scheduled_time TIMESTAMP NOT NULL,
    time_zone VARCHAR(50),
    recurrence_pattern VARCHAR(50),
    end_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Communication recipients
CREATE TABLE communication_recipients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    communication_id UUID REFERENCES mass_communications(id),
    user_id UUID REFERENCES users(id),
    channel notification_channel,
    recipient_address VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending',
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    opened_at TIMESTAMP,
    clicked_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Communication delivery status
CREATE TABLE communication_delivery_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_id UUID REFERENCES communication_recipients(id),
    status VARCHAR(20) NOT NULL,
    status_details TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Communication interactions
CREATE TABLE communication_interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_id UUID REFERENCES communication_recipients(id),
    interaction_type VARCHAR(50), -- open, click, reply, unsubscribe
    interaction_data JSONB,
    ip_address INET,
    user_agent TEXT,
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Communication preferences
CREATE TABLE communication_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    channel notification_channel,
    category VARCHAR(50),
    is_enabled BOOLEAN DEFAULT true,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    frequency VARCHAR(20), -- immediate, daily, weekly
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, channel, category)
);

-- Broadcast permissions
CREATE TABLE broadcast_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID REFERENCES roles(id),
    can_send_to_all BOOLEAN DEFAULT false,
    can_send_urgent BOOLEAN DEFAULT false,
    max_recipients_per_message INT,
    max_messages_per_day INT,
    allowed_channels JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- AUDIT AND SECURITY
-- =====================================================

-- Audit log
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    user_id UUID REFERENCES users(id),
    ip_address INET,
    user_agent TEXT,
    session_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_entity (entity_type, entity_id, created_at DESC),
    INDEX idx_audit_user (user_id, created_at DESC)
);

-- System metrics
CREATE TABLE system_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,4),
    metric_unit VARCHAR(20),
    tags JSONB,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_metrics_name_time (metric_name, recorded_at DESC)
);

-- Notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(300),
    message TEXT,
    data JSONB,
    channel notification_channel DEFAULT 'in_app',
    priority VARCHAR(20) DEFAULT 'normal',
    read_at TIMESTAMP,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notifications_user (user_id, created_at DESC)
);

-- Documents
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    document_type VARCHAR(50),
    name VARCHAR(300) NOT NULL,
    file_path VARCHAR(500),
    file_size BIGINT,
    mime_type VARCHAR(100),
    checksum VARCHAR(64),
    is_encrypted BOOLEAN DEFAULT false,
    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    INDEX idx_documents_entity (entity_type, entity_id)
);

-- User features
CREATE TABLE user_features (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    feature_flag_id UUID REFERENCES feature_flags(id),
    is_enabled BOOLEAN DEFAULT true,
    enabled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    UNIQUE(user_id, feature_flag_id)
);

-- Subscription plans
CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    pricing_tier_id UUID REFERENCES feature_pricing_tiers(id),
    billing_cycle VARCHAR(20), -- monthly, annual
    price DECIMAL(10,2),
    currency_code CHAR(3),
    features JSONB,
    limits JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Community subscriptions
CREATE TABLE community_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    subscription_plan_id UUID REFERENCES subscription_plans(id),
    status VARCHAR(20) DEFAULT 'active',
    start_date DATE NOT NULL,
    end_date DATE,
    next_billing_date DATE,
    payment_method VARCHAR(50),
    auto_renew BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMP
);

-- Permission propagation queue
CREATE TABLE permission_propagation_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    change_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    changes JSONB NOT NULL,
    priority INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    processed_at TIMESTAMP,
    error_message TEXT,
    retry_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- User indexes
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_document ON users(document_type, document_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_status ON users(status) WHERE deleted_at IS NULL;

-- Permission indexes
CREATE INDEX idx_permissions_module_action ON permissions(module, action);
CREATE INDEX idx_user_permissions_lookup ON user_permissions(user_id, permission_id, community_id);
CREATE INDEX idx_role_permissions_lookup ON role_permissions(role_id, permission_id);

-- Community indexes
CREATE INDEX idx_communities_active ON communities(is_active) WHERE is_active = true;
CREATE INDEX idx_community_members_lookup ON community_members(community_id, user_id) WHERE is_active = true;

-- Access log indexes
CREATE INDEX idx_access_logs_point_time ON access_logs(access_point_id, access_time DESC);
CREATE INDEX idx_access_logs_granted ON access_logs(granted, access_time DESC);

-- Device indexes
CREATE INDEX idx_devices_community ON devices(community_id) WHERE is_active = true;
CREATE INDEX idx_devices_status ON devices(status) WHERE is_active = true;

-- Financial indexes
CREATE INDEX idx_payment_transactions_date ON payment_gateway_transactions(created_at DESC);
CREATE INDEX idx_payment_status ON payment_gateway_transactions(status) WHERE status = 'pending';

-- =====================================================
-- TRIGGERS AND FUNCTIONS
-- =====================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update trigger to tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_communities_updated_at BEFORE UPDATE ON communities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_permissions_updated_at BEFORE UPDATE ON permissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add more triggers as needed for other tables...

-- =====================================================
-- INITIAL DATA
-- =====================================================

-- Insert default countries
INSERT INTO countries (code, code3, name, phone_code, currency_code, timezone, locale) VALUES
('CL', 'CHL', 'Chile', '+56', 'CLP', 'America/Santiago', 'es_CL'),
('US', 'USA', 'United States', '+1', 'USD', 'America/New_York', 'en_US'),
('MX', 'MEX', 'Mexico', '+52', 'MXN', 'America/Mexico_City', 'es_MX'),
('AR', 'ARG', 'Argentina', '+54', 'ARS', 'America/Buenos_Aires', 'es_AR'),
('CO', 'COL', 'Colombia', '+57', 'COP', 'America/Bogota', 'es_CO');

-- Insert system roles (11 levels)
INSERT INTO roles (code, name, level, is_system_role) VALUES
('SUPER_ADMIN', 'Super Administrator', 1, true),
('SYSTEM_ADMIN', 'System Administrator', 2, true),
('FINANCIAL_ADMIN', 'Financial Administrator', 3, true),
('HARDWARE_ADMIN', 'Hardware Administrator', 4, true),
('SECURITY_ADMIN', 'Security Administrator', 5, true),
('AUDIT_ADMIN', 'Audit Administrator', 6, true),
('OPERATIONS_MANAGER', 'Operations Manager', 7, true),
('COMMUNITY_MANAGER', 'Community Manager', 8, true),
('SUPPORT_SUPERVISOR', 'Support Supervisor', 9, true),
('SUPPORT_AGENT', 'Support Agent', 10, true),
('REPORT_VIEWER', 'Report Viewer', 11, true);

-- Insert community roles (11 levels)
INSERT INTO roles (code, name, level, is_community_role) VALUES
('COMMUNITY_ADMIN', 'Community Administrator', 1, true),
('BOARD_PRESIDENT', 'Board President', 2, true),
('TREASURER', 'Treasurer', 3, true),
('BOARD_MEMBER', 'Board Member', 4, true),
('SECURITY_CHIEF', 'Security Chief', 5, true),
('SECURITY_GUARD', 'Security Guard', 6, true),
('MAINTENANCE_CHIEF', 'Maintenance Chief', 7, true),
('STAFF', 'Staff Member', 8, true),
('OWNER', 'Property Owner', 9, true),
('TENANT', 'Tenant', 10, true),
('AUTHORIZED_PERSON', 'Authorized Person', 11, true);

-- Insert base permissions
INSERT INTO permissions (code, module, action, name, risk_level) VALUES
-- Access permissions
('access.doors.open', 'access', 'doors.open', 'Open Doors', 'low'),
('access.doors.emergency', 'access', 'doors.emergency', 'Emergency Door Override', 'critical'),
('access.visitors.authorize', 'access', 'visitors.authorize', 'Authorize Visitors', 'medium'),
('access.visitors.blacklist', 'access', 'visitors.blacklist', 'Blacklist Visitors', 'high'),
('access.logs.view', 'access', 'logs.view', 'View Access Logs', 'low'),
('access.logs.export', 'access', 'logs.export', 'Export Access Logs', 'medium'),

-- User management permissions
('users.create', 'users', 'create', 'Create Users', 'high'),
('users.update', 'users', 'update', 'Update Users', 'high'),
('users.delete', 'users', 'delete', 'Delete Users', 'critical'),
('users.view', 'users', 'view', 'View Users', 'low'),
('users.permissions.manage', 'users', 'permissions.manage', 'Manage User Permissions', 'critical'),

-- Financial permissions
('financial.view', 'financial', 'view', 'View Financial Data', 'medium'),
('financial.pay', 'financial', 'pay', 'Make Payments', 'high'),
('financial.reports', 'financial', 'reports', 'Generate Financial Reports', 'medium'),
('financial.approve', 'financial', 'approve', 'Approve Transactions', 'critical'),

-- Device management permissions
('devices.view', 'devices', 'view', 'View Devices', 'low'),
('devices.control', 'devices', 'control', 'Control Devices', 'high'),
('devices.configure', 'devices', 'configure', 'Configure Devices', 'critical'),
('devices.maintenance', 'devices', 'maintenance', 'Device Maintenance', 'high');

-- Create default admin user (password: admin)
INSERT INTO users (email, username, password_hash, first_name, last_name, status, is_system_user) VALUES
('admin@system.local', 'admin', '$2b$10$YKqFgVHwJrYVtGPXBkjjCeY9Q1yJvRv2X3.JK4fKJSeASPM8ECVTK', 'System', 'Administrator', 'active', true);

-- Schema version
INSERT INTO schema_versions (version, description, applied_by) VALUES
('1.0.0', 'Initial complete schema for SKYN3T Access Control System', 'System');

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON DATABASE master_db IS 'SKYN3T Access Control System - Complete Database';
COMMENT ON TABLE users IS 'System users including residents, staff, and administrators';
COMMENT ON TABLE permissions IS 'Granular permissions for system actions';
COMMENT ON TABLE communities IS 'Multi-tenant communities/properties';
COMMENT ON TABLE devices IS 'IoT devices for access control';
COMMENT ON TABLE access_logs IS 'Complete audit trail of all access events';