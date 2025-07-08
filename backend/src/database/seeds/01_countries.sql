-- =====================================================
-- PAÍSES SEED DATA - SKYN3T ACCESS CONTROL
-- =====================================================
-- Datos iniciales de países para el sistema

-- Insertar países con información completa
INSERT INTO countries (code, name, phone_prefix, currency_code, timezone, is_active) VALUES
-- América del Sur
('CHL', 'Chile', '+56', 'CLP', 'America/Santiago', true),
('ARG', 'Argentina', '+54', 'ARS', 'America/Argentina/Buenos_Aires', true),
('BRA', 'Brasil', '+55', 'BRL', 'America/Sao_Paulo', true),
('COL', 'Colombia', '+57', 'COP', 'America/Bogota', true),
('PER', 'Perú', '+51', 'PEN', 'America/Lima', true),
('URY', 'Uruguay', '+598', 'UYU', 'America/Montevideo', true),
('PRY', 'Paraguay', '+595', 'PYG', 'America/Asuncion', true),
('BOL', 'Bolivia', '+591', 'BOB', 'America/La_Paz', true),
('ECU', 'Ecuador', '+593', 'USD', 'America/Guayaquil', true),
('VEN', 'Venezuela', '+58', 'VES', 'America/Caracas', true),
('GUY', 'Guyana', '+592', 'GYD', 'America/Guyana', true),
('SUR', 'Suriname', '+597', 'SRD', 'America/Paramaribo', true),

-- América del Norte
('USA', 'Estados Unidos', '+1', 'USD', 'America/New_York', true),
('CAN', 'Canadá', '+1', 'CAD', 'America/Toronto', true),
('MEX', 'México', '+52', 'MXN', 'America/Mexico_City', true),

-- América Central y Caribe
('GTM', 'Guatemala', '+502', 'GTQ', 'America/Guatemala', true),
('CRI', 'Costa Rica', '+506', 'CRC', 'America/Costa_Rica', true),
('PAN', 'Panamá', '+507', 'PAB', 'America/Panama', true),
('DOM', 'República Dominicana', '+1809', 'DOP', 'America/Santo_Domingo', true),
('CUB', 'Cuba', '+53', 'CUP', 'America/Havana', true),

-- Europa
('ESP', 'España', '+34', 'EUR', 'Europe/Madrid', true),
('FRA', 'Francia', '+33', 'EUR', 'Europe/Paris', true),
('ITA', 'Italia', '+39', 'EUR', 'Europe/Rome', true),
('DEU', 'Alemania', '+49', 'EUR', 'Europe/Berlin', true),
('GBR', 'Reino Unido', '+44', 'GBP', 'Europe/London', true),
('PRT', 'Portugal', '+351', 'EUR', 'Europe/Lisbon', true),
('NLD', 'Países Bajos', '+31', 'EUR', 'Europe/Amsterdam', true),
('BEL', 'Bélgica', '+32', 'EUR', 'Europe/Brussels', true),
('CHE', 'Suiza', '+41', 'CHF', 'Europe/Zurich', true),
('AUT', 'Austria', '+43', 'EUR', 'Europe/Vienna', true),
('SWE', 'Suecia', '+46', 'SEK', 'Europe/Stockholm', true),
('NOR', 'Noruega', '+47', 'NOK', 'Europe/Oslo', true),
('DNK', 'Dinamarca', '+45', 'DKK', 'Europe/Copenhagen', true),
('FIN', 'Finlandia', '+358', 'EUR', 'Europe/Helsinki', true),
('POL', 'Polonia', '+48', 'PLN', 'Europe/Warsaw', true),
('CZE', 'República Checa', '+420', 'CZK', 'Europe/Prague', true),
('HUN', 'Hungría', '+36', 'HUF', 'Europe/Budapest', true),
('ROU', 'Rumania', '+40', 'RON', 'Europe/Bucharest', true),
('BGR', 'Bulgaria', '+359', 'BGN', 'Europe/Sofia', true),
('GRC', 'Grecia', '+30', 'EUR', 'Europe/Athens', true),
('TUR', 'Turquía', '+90', 'TRY', 'Europe/Istanbul', true),
('RUS', 'Rusia', '+7', 'RUB', 'Europe/Moscow', true),

-- Asia
('CHN', 'China', '+86', 'CNY', 'Asia/Shanghai', true),
('JPN', 'Japón', '+81', 'JPY', 'Asia/Tokyo', true),
('KOR', 'Corea del Sur', '+82', 'KRW', 'Asia/Seoul', true),
('IND', 'India', '+91', 'INR', 'Asia/Kolkata', true),
('IDN', 'Indonesia', '+62', 'IDR', 'Asia/Jakarta', true),
('THA', 'Tailandia', '+66', 'THB', 'Asia/Bangkok', true),
('VNM', 'Vietnam', '+84', 'VND', 'Asia/Ho_Chi_Minh', true),
('MYS', 'Malasia', '+60', 'MYR', 'Asia/Kuala_Lumpur', true),
('SGP', 'Singapur', '+65', 'SGD', 'Asia/Singapore', true),
('PHL', 'Filipinas', '+63', 'PHP', 'Asia/Manila', true),
('TWN', 'Taiwán', '+886', 'TWD', 'Asia/Taipei', true),
('HKG', 'Hong Kong', '+852', 'HKD', 'Asia/Hong_Kong', true),
('MAC', 'Macao', '+853', 'MOP', 'Asia/Macau', true),
('ARE', 'Emiratos Árabes Unidos', '+971', 'AED', 'Asia/Dubai', true),
('SAU', 'Arabia Saudí', '+966', 'SAR', 'Asia/Riyadh', true),
('ISR', 'Israel', '+972', 'ILS', 'Asia/Jerusalem', true),
('IRN', 'Irán', '+98', 'IRR', 'Asia/Tehran', true),
('IRQ', 'Irak', '+964', 'IQD', 'Asia/Baghdad', true),
('AFG', 'Afganistán', '+93', 'AFN', 'Asia/Kabul', true),
('PAK', 'Pakistán', '+92', 'PKR', 'Asia/Karachi', true),
('BGD', 'Bangladesh', '+880', 'BDT', 'Asia/Dhaka', true),
('LKA', 'Sri Lanka', '+94', 'LKR', 'Asia/Colombo', true),
('NPL', 'Nepal', '+977', 'NPR', 'Asia/Kathmandu', true),
('BTN', 'Bután', '+975', 'BTN', 'Asia/Thimphu', true),
('MDV', 'Maldivas', '+960', 'MVR', 'Indian/Maldives', true),
('KAZ', 'Kazajistán', '+7', 'KZT', 'Asia/Almaty', true),
('UZB', 'Uzbekistán', '+998', 'UZS', 'Asia/Tashkent', true),
('TKM', 'Turkmenistán', '+993', 'TMT', 'Asia/Ashgabat', true),
('TJK', 'Tayikistán', '+992', 'TJS', 'Asia/Dushanbe', true),
('KGZ', 'Kirguistán', '+996', 'KGS', 'Asia/Bishkek', true),
('MNG', 'Mongolia', '+976', 'MNT', 'Asia/Ulaanbaatar', true),
('PRK', 'Corea del Norte', '+850', 'KPW', 'Asia/Pyongyang', true),
('MMR', 'Myanmar', '+95', 'MMK', 'Asia/Yangon', true),
('LAO', 'Laos', '+856', 'LAK', 'Asia/Vientiane', true),
('KHM', 'Camboya', '+855', 'KHR', 'Asia/Phnom_Penh', true),
('BRN', 'Brunéi', '+673', 'BND', 'Asia/Brunei', true),

-- África
('ZAF', 'Sudáfrica', '+27', 'ZAR', 'Africa/Johannesburg', true),
('EGY', 'Egipto', '+20', 'EGP', 'Africa/Cairo', true),
('NGA', 'Nigeria', '+234', 'NGN', 'Africa/Lagos', true),
('KEN', 'Kenia', '+254', 'KES', 'Africa/Nairobi', true),
('ETH', 'Etiopía', '+251', 'ETB', 'Africa/Addis_Ababa', true),
('GHA', 'Ghana', '+233', 'GHS', 'Africa/Accra', true),
('MAR', 'Marruecos', '+212', 'MAD', 'Africa/Casablanca', true),
('TUN', 'Túnez', '+216', 'TND', 'Africa/Tunis', true),
('DZA', 'Argelia', '+213', 'DZD', 'Africa/Algiers', true),
('LBY', 'Libia', '+218', 'LYD', 'Africa/Tripoli', true),
('SEN', 'Senegal', '+221', 'XOF', 'Africa/Dakar', true),
('CIV', 'Costa de Marfil', '+225', 'XOF', 'Africa/Abidjan', true),
('CMR', 'Camerún', '+237', 'XAF', 'Africa/Douala', true),
('UGA', 'Uganda', '+256', 'UGX', 'Africa/Kampala', true),
('TZA', 'Tanzania', '+255', 'TZS', 'Africa/Dar_es_Salaam', true),
('ZWE', 'Zimbabue', '+263', 'ZWL', 'Africa/Harare', true),
('ZMB', 'Zambia', '+260', 'ZMW', 'Africa/Lusaka', true),
('BWA', 'Botsuana', '+267', 'BWP', 'Africa/Gaborone', true),
('NAM', 'Namibia', '+264', 'NAD', 'Africa/Windhoek', true),
('MOZ', 'Mozambique', '+258', 'MZN', 'Africa/Maputo', true),
('MDG', 'Madagascar', '+261', 'MGA', 'Indian/Antananarivo', true),
('MUS', 'Mauricio', '+230', 'MUR', 'Indian/Mauritius', true),
('SYC', 'Seychelles', '+248', 'SCR', 'Indian/Mahe', true),

-- Oceanía
('AUS', 'Australia', '+61', 'AUD', 'Australia/Sydney', true),
('NZL', 'Nueva Zelanda', '+64', 'NZD', 'Pacific/Auckland', true),
('FJI', 'Fiyi', '+679', 'FJD', 'Pacific/Fiji', true),
('PNG', 'Papúa Nueva Guinea', '+675', 'PGK', 'Pacific/Port_Moresby', true),
('NCL', 'Nueva Caledonia', '+687', 'XPF', 'Pacific/Noumea', true),
('PYF', 'Polinesia Francesa', '+689', 'XPF', 'Pacific/Tahiti', true),
('VUT', 'Vanuatu', '+678', 'VUV', 'Pacific/Efate', true),
('SLB', 'Islas Salomón', '+677', 'SBD', 'Pacific/Guadalcanal', true),
('TON', 'Tonga', '+676', 'TOP', 'Pacific/Tongatapu', true),
('WSM', 'Samoa', '+685', 'WST', 'Pacific/Apia', true),
('KIR', 'Kiribati', '+686', 'AUD', 'Pacific/Tarawa', true),
('TUV', 'Tuvalu', '+688', 'AUD', 'Pacific/Funafuti', true),
('NRU', 'Nauru', '+674', 'AUD', 'Pacific/Nauru', true),
('PLW', 'Palaos', '+680', 'USD', 'Pacific/Palau', true),
('FSM', 'Micronesia', '+691', 'USD', 'Pacific/Pohnpei', true),
('MHL', 'Islas Marshall', '+692', 'USD', 'Pacific/Majuro', true),
('COK', 'Islas Cook', '+682', 'NZD', 'Pacific/Rarotonga', true),
('NIU', 'Niue', '+683', 'NZD', 'Pacific/Niue', true),
('TKL', 'Tokelau', '+690', 'NZD', 'Pacific/Fakaofo', true)

ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    phone_prefix = EXCLUDED.phone_prefix,
    currency_code = EXCLUDED.currency_code,
    timezone = EXCLUDED.timezone,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

-- Actualizar Chile como país principal (ya que el sistema está diseñado para Chile)
UPDATE countries SET 
    name = 'Chile',
    phone_prefix = '+56',
    currency_code = 'CLP',
    timezone = 'America/Santiago',
    is_active = true,
    updated_at = CURRENT_TIMESTAMP
WHERE code = 'CHL';

-- Commit de la transacción
COMMIT;