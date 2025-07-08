-- =====================================================
-- INITIAL SCHEMA MIGRATION - SKYN3T ACCESS CONTROL
-- =====================================================
-- Migración inicial que crea todas las tablas del sistema

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- =====================================================
-- PAÍSES
-- =====================================================
CREATE TABLE IF NOT EXISTS countries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(3) NOT NULL UNIQUE, -- ISO 3166-1 alpha-3
    name VARCHAR(100) NOT NULL,
    phone_prefix VARCHAR(10),
    currency_code VARCHAR(3),
    timezone VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- COMUNIDADES
-- =====================================================
CREATE TABLE IF NOT EXISTS communities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('building', 'condominium', 'office', 'residential')),
    address TEXT NOT NULL,
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country_id UUID REFERENCES countries(id),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    timezone VARCHAR(50) DEFAULT 'America/Santiago',
    contact_name VARCHAR(200),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(20),
    rut VARCHAR(12),
    logo_url TEXT,
    website_url TEXT,
    settings JSONB DEFAULT '{}',
    subscription_plan VARCHAR(50) DEFAULT 'basic',
    subscription_status VARCHAR(20) DEFAULT 'active',
    subscription_expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    updated_by UUID
);

-- =====================================================
-- USUARIOS
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    document_type VARCHAR(20) CHECK (document_type IN ('id', 'passport', 'rut', 'other')),
    document_number VARCHAR(50),
    birth_date DATE,
    avatar_url TEXT,
    country_id UUID REFERENCES countries(id),
    language VARCHAR(5) DEFAULT 'es',
    timezone VARCHAR(50) DEFAULT 'America/Santiago',
    
    -- Configuraciones de seguridad
    email_verified BOOLEAN DEFAULT false,
    email_verification_token VARCHAR(255),
    email_verified_at TIMESTAMP,
    phone_verified BOOLEAN DEFAULT false,
    phone_verification_token VARCHAR(10),
    phone_verified_at TIMESTAMP,
    
    -- Autenticación de dos factores
    two_factor_enabled BOOLEAN DEFAULT false,
    two_factor_secret TEXT,
    two_factor_backup_codes TEXT[],
    two_factor_methods VARCHAR(50)[] DEFAULT ARRAY['totp'],
    
    -- Seguridad de contraseña
    password_changed_at TIMESTAMP,
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    
    -- Login tracking
    last_login_at TIMESTAMP,
    last_login_ip INET,
    
    -- Estados
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    created_by UUID,
    updated_by UUID,
    deleted_by UUID
);

-- =====================================================
-- ROLES
-- =====================================================
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 11),
    parent_role_id UUID REFERENCES roles(id),
    color VARCHAR(7) DEFAULT '#007bff',
    icon VARCHAR(50),
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- PERMISOS
-- =====================================================
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(100) NOT NULL UNIQUE,
    module VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    risk_level VARCHAR(20) DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    ui_elements TEXT[] DEFAULT ARRAY[]::TEXT[],
    api_endpoints TEXT[] DEFAULT ARRAY[]::TEXT[],
    dependencies TEXT[] DEFAULT ARRAY[]::TEXT[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- FEATURES
-- =====================================================
CREATE TABLE IF NOT EXISTS features (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    subscription_plans TEXT[] DEFAULT ARRAY[]::TEXT[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- EDIFICIOS
-- =====================================================
CREATE TABLE IF NOT EXISTS buildings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    code VARCHAR(20),
    address TEXT,
    floors_count INTEGER DEFAULT 0,
    units_count INTEGER DEFAULT 0,
    construction_year INTEGER,
    total_area DECIMAL(10, 2),
    elevator_count INTEGER DEFAULT 0,
    parking_spots INTEGER DEFAULT 0,
    amenities TEXT[] DEFAULT ARRAY[]::TEXT[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- PISOS
-- =====================================================
CREATE TABLE IF NOT EXISTS floors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    name VARCHAR(100),
    units_count INTEGER DEFAULT 0,
    area DECIMAL(10, 2),
    floor_plan_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(building_id, number)
);

-- =====================================================
-- UNIDADES
-- =====================================================
CREATE TABLE IF NOT EXISTS units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    floor_id UUID REFERENCES floors(id),
    unit_number VARCHAR(20) NOT NULL,
    unit_type VARCHAR(50) CHECK (unit_type IN ('apartment', 'house', 'office', 'commercial', 'parking', 'storage')),
    area DECIMAL(10, 2),
    bedrooms INTEGER,
    bathrooms INTEGER,
    parking_spots INTEGER DEFAULT 0,
    storage_units INTEGER DEFAULT 0,
    balcony BOOLEAN DEFAULT false,
    owner_id UUID REFERENCES users(id),
    tenant_id UUID REFERENCES users(id),
    rental_price DECIMAL(12, 2),
    monthly_fee DECIMAL(12, 2),
    is_occupied BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(building_id, unit_number)
);

-- =====================================================
-- DISPOSITIVOS
-- =====================================================
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    serial_number VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('access_control', 'camera', 'sensor', 'barrier', 'intercom', 'alarm')),
    model VARCHAR(100),
    manufacturer VARCHAR(100),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    building_id UUID REFERENCES buildings(id),
    floor_id UUID REFERENCES floors(id),
    location TEXT NOT NULL,
    ip_address INET,
    mac_address MACADDR,
    port INTEGER,
    firmware_version VARCHAR(50),
    hardware_version VARCHAR(50),
    installation_date DATE,
    last_maintenance DATE,
    warranty_expires DATE,
    
    -- Estado y configuración
    status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'error', 'maintenance')),
    last_heartbeat TIMESTAMP,
    last_error TEXT,
    last_error_time TIMESTAMP,
    capabilities TEXT[] DEFAULT ARRAY[]::TEXT[],
    configuration JSONB DEFAULT '{}',
    
    -- Métricas
    uptime_percentage DECIMAL(5, 2) DEFAULT 0,
    command_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

-- =====================================================
-- PUNTOS DE ACCESO
-- =====================================================
CREATE TABLE IF NOT EXISTS access_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    building_id UUID REFERENCES buildings(id),
    floor_id UUID REFERENCES floors(id),
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) CHECK (type IN ('door', 'gate', 'barrier', 'turnstile', 'elevator')),
    location TEXT,
    direction VARCHAR(20) CHECK (direction IN ('in', 'out', 'both')),
    entry_device_id UUID REFERENCES devices(id),
    exit_device_id UUID REFERENCES devices(id),
    is_emergency_exit BOOLEAN DEFAULT false,
    anti_passback_enabled BOOLEAN DEFAULT false,
    access_methods TEXT[] DEFAULT ARRAY['card', 'pin', 'facial', 'qr']::TEXT[],
    operating_hours JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- VEHÍCULOS
-- =====================================================
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    license_plate VARCHAR(20) NOT NULL,
    make VARCHAR(50),
    model VARCHAR(50),
    year INTEGER,
    color VARCHAR(30),
    vehicle_type VARCHAR(30) CHECK (vehicle_type IN ('car', 'motorcycle', 'truck', 'van', 'bicycle')),
    parking_spot VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, license_plate)
);

-- =====================================================
-- TABLAS DE RELACIÓN
-- =====================================================

-- Usuarios - Roles
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP,
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    removed_by UUID REFERENCES users(id),
    removed_at TIMESTAMP,
    UNIQUE(user_id, role_id, community_id)
);

-- Roles - Permisos
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(role_id, permission_id)
);

-- Usuarios - Permisos (permisos directos)
CREATE TABLE IF NOT EXISTS user_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    granted BOOLEAN DEFAULT true,
    expires_at TIMESTAMP,
    reason TEXT,
    granted_by UUID REFERENCES users(id),
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_by UUID REFERENCES users(id),
    revoked_at TIMESTAMP,
    UNIQUE(user_id, permission_id, community_id)
);

-- Comunidades - Features
CREATE TABLE IF NOT EXISTS community_features (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT true,
    configuration JSONB DEFAULT '{}',
    enabled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    enabled_by UUID REFERENCES users(id),
    UNIQUE(community_id, feature_id)
);

-- Miembros de Comunidad
CREATE TABLE IF NOT EXISTS community_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES units(id),
    member_type VARCHAR(20) CHECK (member_type IN ('owner', 'tenant', 'resident', 'visitor', 'staff')),
    move_in_date DATE,
    move_out_date DATE,
    is_primary_resident BOOLEAN DEFAULT false,
    emergency_contact JSONB DEFAULT '{}',
    notes TEXT,
    authorized_by UUID REFERENCES users(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, user_id, unit_id)
);

-- =====================================================
-- LOGS Y AUDITORÍA
-- =====================================================

-- Logs de Acceso
CREATE TABLE IF NOT EXISTS access_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    access_point_id UUID REFERENCES access_points(id),
    device_id UUID REFERENCES devices(id),
    user_id UUID REFERENCES users(id),
    vehicle_id UUID REFERENCES vehicles(id),
    access_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    access_method VARCHAR(20) CHECK (access_method IN ('card', 'pin', 'facial', 'qr', 'manual', 'emergency')),
    direction VARCHAR(10) CHECK (direction IN ('in', 'out')),
    granted BOOLEAN NOT NULL,
    denial_reason VARCHAR(100),
    photo_url TEXT,
    facial_match_score DECIMAL(3, 2),
    response_time_ms INTEGER,
    authorized_by UUID REFERENCES users(id),
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}'
);

-- Logs de Auditoría
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100),
    resource_id UUID,
    old_values JSONB,
    new_values JSONB,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sesiones de Usuario
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token TEXT NOT NULL UNIQUE,
    ip_address INET,
    user_agent TEXT,
    device_fingerprint TEXT,
    location JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP
);

-- =====================================================
-- INVITACIONES
-- =====================================================
CREATE TABLE IF NOT EXISTS invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guest_name VARCHAR(200),
    guest_email VARCHAR(255),
    guest_phone VARCHAR(20),
    guest_document VARCHAR(50),
    visit_date DATE,
    start_time TIME,
    end_time TIME,
    access_points UUID[] DEFAULT ARRAY[]::UUID[],
    vehicle_license_plate VARCHAR(20),
    purpose TEXT,
    special_instructions TEXT,
    qr_code TEXT UNIQUE,
    pin_code VARCHAR(10),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'used', 'expired', 'cancelled')),
    used_at TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- SISTEMA FINANCIERO
-- =====================================================

-- Gastos Comunes
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    building_id UUID REFERENCES buildings(id),
    description TEXT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'CLP',
    period VARCHAR(7), -- YYYY-MM
    due_date DATE NOT NULL,
    category VARCHAR(50),
    is_mandatory BOOLEAN DEFAULT true,
    payment_reference VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'partially_paid', 'paid', 'overdue', 'cancelled')),
    paid_amount DECIMAL(12, 2) DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Métodos de Pago
CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('credit_card', 'debit_card', 'bank_transfer', 'digital_wallet')),
    provider VARCHAR(50) NOT NULL,
    token TEXT NOT NULL,
    masked_details VARCHAR(100),
    bank_account VARCHAR(50),
    rut VARCHAR(12),
    email VARCHAR(255),
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transacciones
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    community_id UUID REFERENCES communities(id),
    expense_id UUID REFERENCES expenses(id),
    payment_method_id UUID NOT NULL REFERENCES payment_methods(id),
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'CLP',
    description TEXT,
    installments INTEGER DEFAULT 1,
    external_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded')),
    gateway_response JSONB DEFAULT '{}',
    error_message TEXT,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pagos
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    community_id UUID REFERENCES communities(id),
    expense_id UUID REFERENCES expenses(id),
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'CLP',
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    receipt_number VARCHAR(100),
    receipt_url TEXT,
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('completed', 'refunded', 'disputed')),
    refund_amount DECIMAL(12, 2) DEFAULT 0,
    refund_reason TEXT,
    refunded_at TIMESTAMP,
    refunded_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- SISTEMA DE NOTIFICACIONES
-- =====================================================

-- Plantillas de Notificación
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    category VARCHAR(50) DEFAULT 'general',
    subject_template TEXT NOT NULL,
    body_template TEXT NOT NULL,
    variables TEXT[] DEFAULT ARRAY[]::TEXT[],
    supported_channels TEXT[] DEFAULT ARRAY['in_app', 'email']::TEXT[],
    community_id UUID REFERENCES communities(id),
    is_global BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Logs de Notificaciones
CREATE TABLE IF NOT EXISTS notification_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID REFERENCES users(id),
    recipient_id UUID REFERENCES users(id),
    recipient_type VARCHAR(20) CHECK (recipient_type IN ('user', 'community', 'role', 'broadcast')),
    community_id UUID REFERENCES communities(id),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    channels TEXT[] NOT NULL,
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    action_url TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'read', 'archived', 'deleted')),
    read_at TIMESTAMP,
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    expires_at TIMESTAMP,
    delivery_results JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Preferencias de Notificación
CREATE TABLE IF NOT EXISTS user_notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    community_id UUID REFERENCES communities(id),
    notification_type VARCHAR(50) NOT NULL,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('in_app', 'email', 'sms', 'whatsapp', 'push')),
    enabled BOOLEAN DEFAULT true,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, community_id, notification_type, channel)
);

-- =====================================================
-- COMANDOS DE DISPOSITIVOS
-- =====================================================
CREATE TABLE IF NOT EXISTS device_commands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    command VARCHAR(100) NOT NULL,
    parameters JSONB DEFAULT '{}',
    priority INTEGER DEFAULT 1 CHECK (priority BETWEEN 1 AND 10),
    status VARCHAR(20) DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'executing', 'completed', 'failed', 'timeout')),
    result JSONB DEFAULT '{}',
    error_message TEXT,
    issued_by UUID REFERENCES users(id),
    community_id UUID REFERENCES communities(id),
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP,
    executed_at TIMESTAMP,
    completed_at TIMESTAMP,
    execution_time_ms INTEGER
);

-- =====================================================
-- ÍNDICES PARA OPTIMIZACIÓN
-- =====================================================

-- Índices de usuarios
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_country ON users(country_id);

-- Índices de comunidades
CREATE INDEX IF NOT EXISTS idx_communities_code ON communities(code);
CREATE INDEX IF NOT EXISTS idx_communities_active ON communities(is_active);
CREATE INDEX IF NOT EXISTS idx_communities_country ON communities(country_id);

-- Índices de dispositivos
CREATE INDEX IF NOT EXISTS idx_devices_community ON devices(community_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_serial ON devices(serial_number);
CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(ip_address);

-- Índices de logs de acceso (particionados por fecha)
CREATE INDEX IF NOT EXISTS idx_access_logs_time ON access_logs(access_time DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_community ON access_logs(community_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_user ON access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_device ON access_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_granted ON access_logs(granted);

-- Índices de auditoría
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Índices de roles y permisos
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_community ON user_roles(community_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON user_roles(is_active);

-- Índices de permisos
CREATE INDEX IF NOT EXISTS idx_permissions_code ON permissions(code);
CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module);

-- Índices de notificaciones
CREATE INDEX IF NOT EXISTS idx_notification_logs_recipient ON notification_logs(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_community ON notification_logs(community_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created ON notification_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status);

-- Índices de pagos
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_community ON payments(community_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

-- Índices de sesiones
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

-- =====================================================
-- TRIGGERS PARA TIMESTAMPS AUTOMÁTICOS
-- =====================================================

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a todas las tablas con updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_communities_updated_at BEFORE UPDATE ON communities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_buildings_updated_at BEFORE UPDATE ON buildings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_floors_updated_at BEFORE UPDATE ON floors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON units
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_community_members_updated_at BEFORE UPDATE ON community_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invitations_updated_at BEFORE UPDATE ON invitations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FUNCIONES AUXILIARES
-- =====================================================

-- Función para generar código QR único para invitaciones
CREATE OR REPLACE FUNCTION generate_invitation_qr()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.qr_code IS NULL THEN
        NEW.qr_code = encode(gen_random_bytes(16), 'hex');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_invitation_qr_trigger BEFORE INSERT ON invitations
    FOR EACH ROW EXECUTE FUNCTION generate_invitation_qr();

-- =====================================================
-- PERMISOS Y SEGURIDAD
-- =====================================================

-- Habilitar Row Level Security en tablas sensibles
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- Crear rol para aplicación
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'skyn3t_app') THEN
        CREATE ROLE skyn3t_app LOGIN PASSWORD 'change_me_in_production';
    END IF;
END
$$;

-- Otorgar permisos necesarios
GRANT USAGE ON SCHEMA public TO skyn3t_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO skyn3t_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO skyn3t_app;

-- =====================================================
-- COMENTARIOS EN TABLAS
-- =====================================================

COMMENT ON TABLE users IS 'Usuarios del sistema con autenticación y perfil completo';
COMMENT ON TABLE communities IS 'Comunidades/condominios que usan el sistema';
COMMENT ON TABLE devices IS 'Dispositivos IoT para control de acceso';
COMMENT ON TABLE access_logs IS 'Registro de todos los intentos de acceso';
COMMENT ON TABLE audit_logs IS 'Registro de auditoría de todas las acciones del sistema';
COMMENT ON TABLE payments IS 'Registro de pagos realizados por usuarios';
COMMENT ON TABLE notification_logs IS 'Registro de notificaciones enviadas';

-- =====================================================
-- DATOS INICIALES BÁSICOS
-- =====================================================

-- Insertar Chile como país por defecto
INSERT INTO countries (code, name, phone_prefix, currency_code, timezone) 
VALUES ('CHL', 'Chile', '+56', 'CLP', 'America/Santiago')
ON CONFLICT (code) DO NOTHING;

-- Roles básicos del sistema
INSERT INTO roles (code, name, description, level, is_system) VALUES
('SUPER_ADMIN', 'Super Administrador', 'Acceso completo al sistema', 1, true),
('COMMUNITY_ADMIN', 'Administrador de Comunidad', 'Administra una comunidad específica', 2, true),
('BUILDING_ADMIN', 'Administrador de Edificio', 'Administra un edificio específico', 3, true),
('SECURITY_GUARD', 'Guardia de Seguridad', 'Control de acceso y seguridad', 4, true),
('MAINTENANCE', 'Mantenimiento', 'Personal de mantenimiento', 5, true),
('OWNER', 'Propietario', 'Propietario de unidad', 6, true),
('TENANT', 'Arrendatario', 'Arrendatario de unidad', 7, true),
('RESIDENT', 'Residente', 'Residente autorizado', 8, true),
('VISITOR', 'Visitante', 'Visitante temporal', 9, true),
('GUEST', 'Invitado', 'Invitado ocasional', 10, true),
('DELIVERY', 'Delivery/Reparto', 'Personal de reparto', 11, true)
ON CONFLICT (code) DO NOTHING;

-- Features básicas del sistema
INSERT INTO features (code, name, description, category) VALUES
('facial_recognition', 'Reconocimiento Facial', 'Control de acceso por reconocimiento facial', 'security'),
('license_plate_ocr', 'OCR Patentes', 'Reconocimiento automático de patentes', 'security'),
('visitor_management', 'Gestión de Visitantes', 'Sistema completo de invitaciones y visitantes', 'access'),
('payment_integration', 'Integración de Pagos', 'Pagos online de gastos comunes', 'financial'),
('mobile_app', 'Aplicación Móvil', 'App móvil para residentes', 'mobile'),
('emergency_alerts', 'Alertas de Emergencia', 'Sistema de alertas y notificaciones de emergencia', 'security'),
('maintenance_requests', 'Solicitudes de Mantenimiento', 'Sistema de tickets de mantenimiento', 'maintenance'),
('community_chat', 'Chat Comunitario', 'Chat entre residentes', 'social'),
('package_management', 'Gestión de Paquetes', 'Control de encomiendas y paquetes', 'logistics'),
('analytics_reports', 'Reportes y Analytics', 'Reportes avanzados y analytics', 'reporting')
ON CONFLICT (code) DO NOTHING;

-- Commit de la transacción
COMMIT;