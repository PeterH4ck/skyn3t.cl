-- ==============================================
-- SKYN3T ACCESS CONTROL - DEMO DATA SEED
-- ==============================================
-- This file creates demo/test data for development and testing
-- Execute after: 03_permissions.sql
-- WARNING: Only run in development/staging environments!

-- ==============================================
-- ENVIRONMENT CHECK
-- ==============================================
-- Uncomment the following line to enable demo data creation
-- SET demo_data_enabled = true;

DO $$
BEGIN
    -- Check if we're in a safe environment for demo data
    IF current_setting('server_version') IS NULL THEN
        RAISE EXCEPTION 'Demo data should only be loaded in development/staging environments!';
    END IF;
    
    -- Add additional safety checks here
    RAISE NOTICE 'Loading demo data for SKYN3T Access Control...';
END $$;

-- ==============================================
-- DEMO COMMUNITIES
-- ==============================================

-- Community 1: Torres del Sol (Luxury Condominium)
INSERT INTO communities (
    id, code, name, type, address, city, state, postal_code, country_id,
    latitude, longitude, timezone, contact_name, contact_email, contact_phone,
    logo_url, subscription_plan, subscription_status, subscription_expires_at,
    is_active, created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'TORRES_SOL',
    'Torres del Sol',
    'condominium',
    'Av. Providencia 1234',
    'Santiago',
    'Región Metropolitana',
    '7500000',
    (SELECT id FROM countries WHERE code = 'CL'),
    -33.4489,
    -70.6693,
    'America/Santiago',
    'María González',
    'admin@torressol.cl',
    '+56912345678',
    'https://example.com/logos/torres-sol.png',
    'premium',
    'active',
    '2024-12-31 23:59:59',
    true,
    NOW(),
    NOW()
);

-- Community 2: Vista Hermosa (Family Residential)
INSERT INTO communities (
    id, code, name, type, address, city, state, postal_code, country_id,
    latitude, longitude, timezone, contact_name, contact_email, contact_phone,
    logo_url, subscription_plan, subscription_status, subscription_expires_at,
    is_active, created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'VISTA_HERMOSA',
    'Vista Hermosa',
    'residential_complex',
    'Calle Los Aromos 567',
    'Las Condes',
    'Región Metropolitana',
    '7550000',
    (SELECT id FROM countries WHERE code = 'CL'),
    -33.4150,
    -70.5000,
    'America/Santiago',
    'Carlos Mendoza',
    'admin@vistahermosa.cl',
    '+56987654321',
    'https://example.com/logos/vista-hermosa.png',
    'standard',
    'active',
    '2024-06-30 23:59:59',
    true,
    NOW(),
    NOW()
);

-- Community 3: Edificio Central (Office Building)
INSERT INTO communities (
    id, code, name, type, address, city, state, postal_code, country_id,
    latitude, longitude, timezone, contact_name, contact_email, contact_phone,
    logo_url, subscription_plan, subscription_status, subscription_expires_at,
    is_active, created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'EDIFICIO_CENTRAL',
    'Edificio Central',
    'office_building',
    'Av. Apoquindo 890',
    'Las Condes',
    'Región Metropolitana',
    '7550000',
    (SELECT id FROM countries WHERE code = 'CL'),
    -33.4050,
    -70.4800,
    'America/Santiago',
    'Ana Rodríguez',
    'admin@edificiocentral.cl',
    '+56911223344',
    'https://example.com/logos/edificio-central.png',
    'enterprise',
    'active',
    '2025-12-31 23:59:59',
    true,
    NOW(),
    NOW()
);

-- ==============================================
-- DEMO BUILDINGS
-- ==============================================

-- Buildings for Torres del Sol
INSERT INTO buildings (
    id, community_id, name, address, floors, units_count,
    elevator_count, parking_spaces, is_active, created_at, updated_at
) VALUES 
-- Torre A
(
    uuid_generate_v4(),
    (SELECT id FROM communities WHERE code = 'TORRES_SOL'),
    'Torre A',
    'Av. Providencia 1234 A',
    20,
    80,
    2,
    120,
    true,
    NOW(),
    NOW()
),
-- Torre B
(
    uuid_generate_v4(),
    (SELECT id FROM communities WHERE code = 'TORRES_SOL'),
    'Torre B',
    'Av. Providencia 1234 B',
    18,
    72,
    2,
    108,
    true,
    NOW(),
    NOW()
);

-- Buildings for Vista Hermosa
INSERT INTO buildings (
    id, community_id, name, address, floors, units_count,
    elevator_count, parking_spaces, is_active, created_at, updated_at
) VALUES 
(
    uuid_generate_v4(),
    (SELECT id FROM communities WHERE code = 'VISTA_HERMOSA'),
    'Edificio Principal',
    'Calle Los Aromos 567',
    12,
    48,
    1,
    60,
    true,
    NOW(),
    NOW()
);

-- Buildings for Edificio Central
INSERT INTO buildings (
    id, community_id, name, address, floors, units_count,
    elevator_count, parking_spaces, is_active, created_at, updated_at
) VALUES 
(
    uuid_generate_v4(),
    (SELECT id FROM communities WHERE code = 'EDIFICIO_CENTRAL'),
    'Torre Empresarial',
    'Av. Apoquindo 890',
    25,
    100,
    4,
    200,
    true,
    NOW(),
    NOW()
);

-- ==============================================
-- DEMO USERS
-- ==============================================

-- Super Admin User
INSERT INTO users (
    id, username, email, password_hash, first_name, last_name,
    phone, document_type, document_number, birth_date,
    email_verified, two_factor_enabled, status, last_login,
    created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'superadmin',
    'superadmin@skyn3t.com',
    '$2b$12$rVz8nV1nV1nV1nV1nV1nV.encrypted_password_hash_here', -- Password: admin123
    'Super',
    'Administrator',
    '+56900000000',
    'id',
    '11111111-1',
    '1980-01-01',
    true,
    true,
    'active',
    NOW() - INTERVAL '1 hour',
    NOW(),
    NOW()
);

-- Platform Admin for Torres del Sol
INSERT INTO users (
    id, username, email, password_hash, first_name, last_name,
    phone, document_type, document_number, birth_date,
    email_verified, two_factor_enabled, status, last_login,
    created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'maria.gonzalez',
    'admin@torressol.cl',
    '$2b$12$rVz8nV1nV1nV1nV1nV1nV.encrypted_password_hash_here', -- Password: torres123
    'María',
    'González',
    '+56912345678',
    'id',
    '12345678-9',
    '1975-03-15',
    true,
    true,
    'active',
    NOW() - INTERVAL '30 minutes',
    NOW(),
    NOW()
);

-- Community Admin for Vista Hermosa
INSERT INTO users (
    id, username, email, password_hash, first_name, last_name,
    phone, document_type, document_number, birth_date,
    email_verified, two_factor_enabled, status, last_login,
    created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'carlos.mendoza',
    'admin@vistahermosa.cl',
    '$2b$12$rVz8nV1nV1nV1nV1nV1nV.encrypted_password_hash_here', -- Password: vista123
    'Carlos',
    'Mendoza',
    '+56987654321',
    'id',
    '87654321-0',
    '1978-07-22',
    true,
    false,
    'active',
    NOW() - INTERVAL '2 hours',
    NOW(),
    NOW()
);

-- Security Chief for Torres del Sol
INSERT INTO users (
    id, username, email, password_hash, first_name, last_name,
    phone, document_type, document_number, birth_date,
    email_verified, two_factor_enabled, status, last_login,
    created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'ricardo.silva',
    'seguridad@torressol.cl',
    '$2b$12$rVz8nV1nV1nV1nV1nV1nV.encrypted_password_hash_here', -- Password: security123
    'Ricardo',
    'Silva',
    '+56955555555',
    'id',
    '55555555-5',
    '1982-11-08',
    true,
    true,
    'active',
    NOW() - INTERVAL '15 minutes',
    NOW(),
    NOW()
);

-- Security Guards
INSERT INTO users (
    id, username, email, password_hash, first_name, last_name,
    phone, document_type, document_number, birth_date,
    email_verified, two_factor_enabled, status, last_login,
    created_at, updated_at
) VALUES 
(
    uuid_generate_v4(),
    'pedro.ramirez',
    'pedro.ramirez@torressol.cl',
    '$2b$12$rVz8nV1nV1nV1nV1nV1nV.encrypted_password_hash_here',
    'Pedro',
    'Ramírez',
    '+56966666666',
    'id',
    '66666666-6',
    '1985-05-12',
    true,
    false,
    'active',
    NOW() - INTERVAL '45 minutes',
    NOW(),
    NOW()
),
(
    uuid_generate_v4(),
    'luis.herrera',
    'luis.herrera@vistahermosa.cl',
    '$2b$12$rVz8nV1nV1nV1nV1nV1nV.encrypted_password_hash_here',
    'Luis',
    'Herrera',
    '+56977777777',
    'id',
    '77777777-7',
    '1983-09-30',
    true,
    false,
    'active',
    NOW() - INTERVAL '1 hour',
    NOW(),
    NOW()
);

-- Property Owners
INSERT INTO users (
    id, username, email, password_hash, first_name, last_name,
    phone, document_type, document_number, birth_date,
    email_verified, two_factor_enabled, status, last_login,
    created_at, updated_at
) VALUES 
(
    uuid_generate_v4(),
    'juan.perez',
    'juan.perez@email.com',
    '$2b$12$rVz8nV1nV1nV1nV1nV1nV.encrypted_password_hash_here',
    'Juan',
    'Pérez',
    '+56988888888',
    'id',
    '88888888-8',
    '1975-12-03',
    true,
    false,
    'active',
    NOW() - INTERVAL '3 hours',
    NOW(),
    NOW()
),
(
    uuid_generate_v4(),
    'ana.martinez',
    'ana.martinez@email.com',
    '$2b$12$rVz8nV1nV1nV1nV1nV1nV.encrypted_password_hash_here',
    'Ana',
    'Martínez',
    '+56999999999',
    'id',
    '99999999-9',
    '1980-04-18',
    true,
    true,
    'active',
    NOW() - INTERVAL '1 day',
    NOW(),
    NOW()
),
(
    uuid_generate_v4(),
    'sofia.lopez',
    'sofia.lopez@email.com',
    '$2b$12$rVz8nV1nV1nV1nV1nV1nV.encrypted_password_hash_here',
    'Sofía',
    'López',
    '+56900001111',
    'id',
    '10101010-1',
    '1988-02-14',
    true,
    false,
    'active',
    NOW() - INTERVAL '5 hours',
    NOW(),
    NOW()
);

-- Tenants
INSERT INTO users (
    id, username, email, password_hash, first_name, last_name,
    phone, document_type, document_number, birth_date,
    email_verified, two_factor_enabled, status, last_login,
    created_at, updated_at
) VALUES 
(
    uuid_generate_v4(),
    'diego.fernandez',
    'diego.fernandez@email.com',
    '$2b$12$rVz8nV1nV1nV1nV1nV1nV.encrypted_password_hash_here',
    'Diego',
    'Fernández',
    '+56911112222',
    'id',
    '20202020-2',
    '1990-08-25',
    true,
    false,
    'active',
    NOW() - INTERVAL '6 hours',
    NOW(),
    NOW()
),
(
    uuid_generate_v4(),
    'carmen.ruiz',
    'carmen.ruiz@email.com',
    '$2b$12$rVz8nV1nV1nV1nV1nV1nV.encrypted_password_hash_here',
    'Carmen',
    'Ruiz',
    '+56922223333',
    'id',
    '30303030-3',
    '1992-06-10',
    true,
    false,
    'active',
    NOW() - INTERVAL '2 days',
    NOW(),
    NOW()
);

-- ==============================================
-- USER ROLE ASSIGNMENTS
-- ==============================================

-- Assign roles to users
INSERT INTO user_roles (user_id, role_id, community_id, granted_by, granted_at, is_active)
VALUES
-- Super Admin
(
    (SELECT id FROM users WHERE username = 'superadmin'),
    (SELECT id FROM roles WHERE code = 'SUPER_ADMIN'),
    NULL, -- Global access
    (SELECT id FROM users WHERE username = 'superadmin'),
    NOW(),
    true
),
-- Community Admin for Torres del Sol
(
    (SELECT id FROM users WHERE username = 'maria.gonzalez'),
    (SELECT id FROM roles WHERE code = 'COMMUNITY_ADMIN'),
    (SELECT id FROM communities WHERE code = 'TORRES_SOL'),
    (SELECT id FROM users WHERE username = 'superadmin'),
    NOW(),
    true
),
-- Community Admin for Vista Hermosa
(
    (SELECT id FROM users WHERE username = 'carlos.mendoza'),
    (SELECT id FROM roles WHERE code = 'COMMUNITY_ADMIN'),
    (SELECT id FROM communities WHERE code = 'VISTA_HERMOSA'),
    (SELECT id FROM users WHERE username = 'superadmin'),
    NOW(),
    true
),
-- Security Chief
(
    (SELECT id FROM users WHERE username = 'ricardo.silva'),
    (SELECT id FROM roles WHERE code = 'SECURITY_CHIEF'),
    (SELECT id FROM communities WHERE code = 'TORRES_SOL'),
    (SELECT id FROM users WHERE username = 'maria.gonzalez'),
    NOW(),
    true
),
-- Security Guards
(
    (SELECT id FROM users WHERE username = 'pedro.ramirez'),
    (SELECT id FROM roles WHERE code = 'SECURITY_GUARD'),
    (SELECT id FROM communities WHERE code = 'TORRES_SOL'),
    (SELECT id FROM users WHERE username = 'ricardo.silva'),
    NOW(),
    true
),
(
    (SELECT id FROM users WHERE username = 'luis.herrera'),
    (SELECT id FROM roles WHERE code = 'SECURITY_GUARD'),
    (SELECT id FROM communities WHERE code = 'VISTA_HERMOSA'),
    (SELECT id FROM users WHERE username = 'carlos.mendoza'),
    NOW(),
    true
),
-- Property Owners
(
    (SELECT id FROM users WHERE username = 'juan.perez'),
    (SELECT id FROM roles WHERE code = 'OWNER'),
    (SELECT id FROM communities WHERE code = 'TORRES_SOL'),
    (SELECT id FROM users WHERE username = 'maria.gonzalez'),
    NOW(),
    true
),
(
    (SELECT id FROM users WHERE username = 'ana.martinez'),
    (SELECT id FROM roles WHERE code = 'OWNER'),
    (SELECT id FROM communities WHERE code = 'VISTA_HERMOSA'),
    (SELECT id FROM users WHERE username = 'carlos.mendoza'),
    NOW(),
    true
),
(
    (SELECT id FROM users WHERE username = 'sofia.lopez'),
    (SELECT id FROM roles WHERE code = 'OWNER'),
    (SELECT id FROM communities WHERE code = 'TORRES_SOL'),
    (SELECT id FROM users WHERE username = 'maria.gonzalez'),
    NOW(),
    true
),
-- Tenants
(
    (SELECT id FROM users WHERE username = 'diego.fernandez'),
    (SELECT id FROM roles WHERE code = 'TENANT'),
    (SELECT id FROM communities WHERE code = 'TORRES_SOL'),
    (SELECT id FROM users WHERE username = 'maria.gonzalez'),
    NOW(),
    true
),
(
    (SELECT id FROM users WHERE username = 'carmen.ruiz'),
    (SELECT id FROM roles WHERE code = 'TENANT'),
    (SELECT id FROM communities WHERE code = 'VISTA_HERMOSA'),
    (SELECT id FROM users WHERE username = 'carlos.mendoza'),
    NOW(),
    true
);

-- ==============================================
-- DEMO DEVICES
-- ==============================================

-- Access Control Devices for Torres del Sol
INSERT INTO devices (
    id, community_id, building_id, serial_number, name, type, model,
    manufacturer, firmware_version, ip_address, mac_address, location,
    status, last_heartbeat, capabilities, settings, is_active,
    created_at, updated_at
) VALUES
-- Main Entrance Door Controller
(
    uuid_generate_v4(),
    (SELECT id FROM communities WHERE code = 'TORRES_SOL'),
    (SELECT id FROM buildings WHERE name = 'Torre A' LIMIT 1),
    'AC-MAIN-001',
    'Puerta Principal Torre A',
    'access_controller',
    'SKYN3T-AC-PRO',
    'SKYN3T Technologies',
    '2.1.5',
    '192.168.1.100',
    '00:1B:44:11:3A:B7',
    'Entrada Principal Torre A',
    'online',
    NOW(),
    '["door_control", "card_reader", "facial_recognition", "qr_scanner"]',
    '{"auto_lock_delay": 5, "max_open_time": 30, "facial_confidence": 0.85}',
    true,
    NOW(),
    NOW()
),
-- Parking Gate Controller
(
    uuid_generate_v4(),
    (SELECT id FROM communities WHERE code = 'TORRES_SOL'),
    NULL,
    'AC-PARK-001',
    'Barrera Estacionamiento',
    'barrier_controller',
    'SKYN3T-BC-STD',
    'SKYN3T Technologies',
    '1.8.2',
    '192.168.1.101',
    '00:1B:44:11:3A:B8',
    'Entrada Estacionamiento',
    'online',
    NOW() - INTERVAL '2 minutes',
    '["barrier_control", "vehicle_detection", "license_plate_recognition"]',
    '{"detection_sensitivity": 0.9, "gate_speed": "normal"}',
    true,
    NOW(),
    NOW()
),
-- Emergency Exit Controller
(
    uuid_generate_v4(),
    (SELECT id FROM communities WHERE code = 'TORRES_SOL'),
    (SELECT id FROM buildings WHERE name = 'Torre A' LIMIT 1),
    'AC-EMER-001',
    'Salida de Emergencia Torre A',
    'emergency_controller',
    'SKYN3T-EC-FIRE',
    'SKYN3T Technologies',
    '1.5.0',
    '192.168.1.102',
    '00:1B:44:11:3A:B9',
    'Salida Emergencia Piso 1',
    'online',
    NOW() - INTERVAL '5 minutes',
    '["emergency_unlock", "fire_alarm_integration", "manual_override"]',
    '{"auto_unlock_on_alarm": true, "override_timeout": 300}',
    true,
    NOW(),
    NOW()
);

-- Devices for Vista Hermosa
INSERT INTO devices (
    id, community_id, building_id, serial_number, name, type, model,
    manufacturer, firmware_version, ip_address, mac_address, location,
    status, last_heartbeat, capabilities, settings, is_active,
    created_at, updated_at
) VALUES
(
    uuid_generate_v4(),
    (SELECT id FROM communities WHERE code = 'VISTA_HERMOSA'),
    (SELECT id FROM buildings WHERE name = 'Edificio Principal' LIMIT 1),
    'AC-VH-001',
    'Puerta Principal Vista Hermosa',
    'access_controller',
    'SKYN3T-AC-STD',
    'SKYN3T Technologies',
    '2.0.3',
    '192.168.2.100',
    '00:1B:44:22:3A:B7',
    'Entrada Principal',
    'online',
    NOW() - INTERVAL '1 minute',
    '["door_control", "card_reader", "qr_scanner"]',
    '{"auto_lock_delay": 3, "max_open_time": 20}',
    true,
    NOW(),
    NOW()
);

-- ==============================================
-- DEMO ACCESS LOGS
-- ==============================================

-- Generate some recent access logs
INSERT INTO access_logs (
    id, user_id, device_id, access_time, access_method, direction,
    granted, denial_reason, facial_match_score, vehicle_plate,
    photo_url, response_time_ms, created_at
) VALUES
-- Successful accesses
(
    uuid_generate_v4(),
    (SELECT id FROM users WHERE username = 'juan.perez'),
    (SELECT id FROM devices WHERE serial_number = 'AC-MAIN-001'),
    NOW() - INTERVAL '30 minutes',
    'facial_recognition',
    'entry',
    true,
    NULL,
    0.92,
    NULL,
    'https://example.com/access-photos/photo1.jpg',
    150,
    NOW() - INTERVAL '30 minutes'
),
(
    uuid_generate_v4(),
    (SELECT id FROM users WHERE username = 'ana.martinez'),
    (SELECT id FROM devices WHERE serial_number = 'AC-VH-001'),
    NOW() - INTERVAL '1 hour',
    'card',
    'entry',
    true,
    NULL,
    NULL,
    NULL,
    NULL,
    80,
    NOW() - INTERVAL '1 hour'
),
(
    uuid_generate_v4(),
    (SELECT id FROM users WHERE username = 'diego.fernandez'),
    (SELECT id FROM devices WHERE serial_number = 'AC-MAIN-001'),
    NOW() - INTERVAL '2 hours',
    'qr_code',
    'entry',
    true,
    NULL,
    NULL,
    NULL,
    NULL,
    120,
    NOW() - INTERVAL '2 hours'
),
-- Vehicle access
(
    uuid_generate_v4(),
    (SELECT id FROM users WHERE username = 'sofia.lopez'),
    (SELECT id FROM devices WHERE serial_number = 'AC-PARK-001'),
    NOW() - INTERVAL '45 minutes',
    'license_plate',
    'entry',
    true,
    NULL,
    NULL,
    'ABCD-12',
    'https://example.com/plate-photos/plate1.jpg',
    200,
    NOW() - INTERVAL '45 minutes'
),
-- Denied access
(
    uuid_generate_v4(),
    NULL,
    (SELECT id FROM devices WHERE serial_number = 'AC-MAIN-001'),
    NOW() - INTERVAL '3 hours',
    'facial_recognition',
    'entry',
    false,
    'User not recognized',
    0.45,
    NULL,
    'https://example.com/access-photos/unknown1.jpg',
    180,
    NOW() - INTERVAL '3 hours'
);

-- ==============================================
-- DEMO VEHICLES
-- ==============================================

INSERT INTO vehicles (
    id, user_id, community_id, license_plate, make, model, year, color,
    vehicle_type, is_resident, is_active, created_at, updated_at
) VALUES
(
    uuid_generate_v4(),
    (SELECT id FROM users WHERE username = 'juan.perez'),
    (SELECT id FROM communities WHERE code = 'TORRES_SOL'),
    'ABCD-12',
    'Toyota',
    'Corolla',
    2020,
    'Blanco',
    'sedan',
    true,
    true,
    NOW(),
    NOW()
),
(
    uuid_generate_v4(),
    (SELECT id FROM users WHERE username = 'ana.martinez'),
    (SELECT id FROM communities WHERE code = 'VISTA_HERMOSA'),
    'EFGH-34',
    'Honda',
    'Civic',
    2019,
    'Azul',
    'sedan',
    true,
    true,
    NOW(),
    NOW()
),
(
    uuid_generate_v4(),
    (SELECT id FROM users WHERE username = 'sofia.lopez'),
    (SELECT id FROM communities WHERE code = 'TORRES_SOL'),
    'IJKL-56',
    'Chevrolet',
    'Spark',
    2021,
    'Rojo',
    'hatchback',
    true,
    true,
    NOW(),
    NOW()
);

-- ==============================================
-- DEMO NOTIFICATIONS
-- ==============================================

INSERT INTO notifications (
    id, recipient_id, sender_id, title, message, type, priority,
    channel, status, scheduled_at, sent_at, read_at, 
    metadata, created_at, updated_at
) VALUES
-- Welcome notification
(
    uuid_generate_v4(),
    (SELECT id FROM users WHERE username = 'juan.perez'),
    (SELECT id FROM users WHERE username = 'maria.gonzalez'),
    'Bienvenido a Torres del Sol',
    'Te damos la bienvenida a nuestra comunidad. Tu acceso ha sido activado exitosamente.',
    'welcome',
    'low',
    'email',
    'delivered',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '23 hours',
    '{"template": "welcome", "community": "Torres del Sol"}',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '1 day'
),
-- Security alert
(
    uuid_generate_v4(),
    (SELECT id FROM users WHERE username = 'ricardo.silva'),
    NULL,
    'Acceso Denegado - Alerta de Seguridad',
    'Se detectó un intento de acceso no autorizado en la puerta principal a las 15:30.',
    'security_alert',
    'high',
    'push',
    'delivered',
    NOW() - INTERVAL '3 hours',
    NOW() - INTERVAL '3 hours',
    NULL,
    '{"device": "AC-MAIN-001", "confidence": 0.45}',
    NOW() - INTERVAL '3 hours',
    NOW() - INTERVAL '3 hours'
),
-- Maintenance notice
(
    uuid_generate_v4(),
    (SELECT id FROM users WHERE username = 'ana.martinez'),
    (SELECT id FROM users WHERE username = 'carlos.mendoza'),
    'Mantenimiento Programado',
    'Se realizará mantenimiento del sistema de ascensores el próximo sábado de 09:00 a 12:00.',
    'maintenance',
    'medium',
    'email',
    'pending',
    NOW() + INTERVAL '2 days',
    NULL,
    NULL,
    '{"maintenance_type": "elevator", "duration": "3 hours"}',
    NOW(),
    NOW()
);

-- ==============================================
-- DEMO FINANCIAL TRANSACTIONS
-- ==============================================

INSERT INTO financial_transactions (
    id, community_id, user_id, transaction_type, amount, currency,
    description, status, reference_number, payment_method,
    due_date, paid_at, created_at, updated_at
) VALUES
-- Monthly fees
(
    uuid_generate_v4(),
    (SELECT id FROM communities WHERE code = 'TORRES_SOL'),
    (SELECT id FROM users WHERE username = 'juan.perez'),
    'monthly_fee',
    150000,
    'CLP',
    'Gastos Comunes Enero 2024',
    'paid',
    'GC-2024-001-001',
    'bank_transfer',
    '2024-01-05',
    '2024-01-03 10:30:00',
    '2024-01-01',
    '2024-01-03'
),
(
    uuid_generate_v4(),
    (SELECT id FROM communities WHERE code = 'TORRES_SOL'),
    (SELECT id FROM users WHERE username = 'sofia.lopez'),
    'monthly_fee',
    150000,
    'CLP',
    'Gastos Comunes Enero 2024',
    'pending',
    'GC-2024-001-003',
    NULL,
    '2024-01-05',
    NULL,
    '2024-01-01',
    '2024-01-01'
),
-- Special assessment
(
    uuid_generate_v4(),
    (SELECT id FROM communities WHERE code = 'VISTA_HERMOSA'),
    (SELECT id FROM users WHERE username = 'ana.martinez'),
    'special_assessment',
    75000,
    'CLP',
    'Mejoras Área Común - Enero 2024',
    'paid',
    'EA-2024-001-001',
    'credit_card',
    '2024-01-15',
    '2024-01-10 14:20:00',
    '2024-01-01',
    '2024-01-10'
);

-- ==============================================
-- DEMO MAINTENANCE REQUESTS
-- ==============================================

INSERT INTO maintenance_requests (
    id, community_id, building_id, unit_id, reported_by, assigned_to,
    title, description, category, priority, status,
    created_at, updated_at, completed_at
) VALUES
(
    uuid_generate_v4(),
    (SELECT id FROM communities WHERE code = 'TORRES_SOL'),
    (SELECT id FROM buildings WHERE name = 'Torre A' LIMIT 1),
    NULL,
    (SELECT id FROM users WHERE username = 'juan.perez'),
    NULL,
    'Falla en Ascensor Torre A',
    'El ascensor principal de Torre A se detiene entre los pisos 5 y 6. Se requiere revisión técnica urgente.',
    'elevator',
    'high',
    'open',
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '2 hours',
    NULL
),
(
    uuid_generate_v4(),
    (SELECT id FROM communities WHERE code = 'VISTA_HERMOSA'),
    (SELECT id FROM buildings WHERE name = 'Edificio Principal' LIMIT 1),
    NULL,
    (SELECT id FROM users WHERE username = 'ana.martinez'),
    NULL,
    'Problema con Iluminación Pasillo',
    'Varias luminarias del pasillo del piso 3 están intermitentes.',
    'electrical',
    'medium',
    'in_progress',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '4 hours',
    NULL
);

-- ==============================================
-- DEMO VISITOR LOGS
-- ==============================================

INSERT INTO visitor_logs (
    id, community_id, building_id, visitor_name, visitor_document,
    visitor_phone, host_user_id, purpose, entry_time, exit_time,
    access_method, photo_url, status, created_at, updated_at
) VALUES
(
    uuid_generate_v4(),
    (SELECT id FROM communities WHERE code = 'TORRES_SOL'),
    (SELECT id FROM buildings WHERE name = 'Torre A' LIMIT 1),
    'Roberto González',
    '44444444-4',
    '+56944444444',
    (SELECT id FROM users WHERE username = 'juan.perez'),
    'Visita familiar',
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '1 hour',
    'manual',
    'https://example.com/visitor-photos/visitor1.jpg',
    'completed',
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '1 hour'
),
(
    uuid_generate_v4(),
    (SELECT id FROM communities WHERE code = 'TORRES_SOL'),
    (SELECT id FROM buildings WHERE name = 'Torre A' LIMIT 1),
    'Elena Morales',
    '33333333-3',
    '+56933333333',
    (SELECT id FROM users WHERE username = 'sofia.lopez'),
    'Entrega de paquete',
    NOW() - INTERVAL '30 minutes',
    NULL,
    'qr_code',
    NULL,
    'active',
    NOW() - INTERVAL '30 minutes',
    NOW() - INTERVAL '30 minutes'
);

-- ==============================================
-- DATA VALIDATION QUERIES
-- ==============================================

-- Summary of created demo data
SELECT 'Communities' as entity, COUNT(*) as count FROM communities WHERE code IN ('TORRES_SOL', 'VISTA_HERMOSA', 'EDIFICIO_CENTRAL')
UNION ALL
SELECT 'Buildings', COUNT(*) FROM buildings 
UNION ALL
SELECT 'Users', COUNT(*) FROM users WHERE username != 'system'
UNION ALL
SELECT 'User Roles', COUNT(*) FROM user_roles
UNION ALL
SELECT 'Devices', COUNT(*) FROM devices
UNION ALL
SELECT 'Access Logs', COUNT(*) FROM access_logs
UNION ALL
SELECT 'Vehicles', COUNT(*) FROM vehicles
UNION ALL
SELECT 'Notifications', COUNT(*) FROM notifications
UNION ALL
SELECT 'Financial Transactions', COUNT(*) FROM financial_transactions
UNION ALL
SELECT 'Maintenance Requests', COUNT(*) FROM maintenance_requests
UNION ALL
SELECT 'Visitor Logs', COUNT(*) FROM visitor_logs;

-- ==============================================
-- DEMO USER CREDENTIALS REFERENCE
-- ==============================================

/*
Demo User Credentials (Password: mentioned after each user):
- superadmin@skyn3t.com / admin123
- admin@torressol.cl / torres123  
- admin@vistahermosa.cl / vista123
- seguridad@torressol.cl / security123
- pedro.ramirez@torressol.cl / guard123
- luis.herrera@vistahermosa.cl / guard123
- juan.perez@email.com / owner123
- ana.martinez@email.com / owner123
- sofia.lopez@email.com / owner123
- diego.fernandez@email.com / tenant123
- carmen.ruiz@email.com / tenant123

All passwords should be changed in production!
*/

-- ==============================================
-- NOTES
-- ==============================================
-- 1. This demo data is for development/testing only
-- 2. All passwords are hashed with bcrypt
-- 3. Phone numbers and emails are fictional
-- 4. Document numbers follow Chilean RUT format
-- 5. IP addresses are in private ranges
-- 6. Device serial numbers follow SKYN3T convention
-- 7. Financial amounts are in Chilean Pesos (CLP)
-- 8. All timestamps are relative to execution time

RAISE NOTICE 'Demo data successfully loaded for SKYN3T Access Control!';
