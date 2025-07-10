<?php
/**
 * SKYN3T - Check Session para PostgreSQL Docker
 * Versión: 3.0.0
 * Compatible con UUIDs y sistema de roles multinivel
 */

session_start();
header('Content-Type: application/json');
header('Cache-Control: no-cache, no-store, must-revalidate');

// Configuración de base de datos PostgreSQL Docker
define('DB_HOST', 'localhost');
define('DB_PORT', '5432');
define('DB_NAME', 'master_db');
define('DB_USER', 'postgres');
define('DB_PASS', 'postgres123');
define('SESSION_TIMEOUT', 3600); // 1 hora

/**
 * Conectar a PostgreSQL Docker
 */
function getDBConnection() {
    static $pdo = null;

    if ($pdo === null) {
        try {
            $dsn = "pgsql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME;
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false
            ]);
        } catch (PDOException $e) {
            return null;
        }
    }

    return $pdo;
}

/**
 * Determinar redirección según rol
 */
function getRedirectByRole($roleCode, $roleLevel) {
    switch ($roleCode) {
        case 'SUPER_ADMIN':
        case 'SYSTEM_ADMIN':
            return '/dashboard/admin.html';

        case 'COMMUNITY_MANAGER':
            return '/dashboard/manager.html';

        default:
            // Para roles personalizados, usar nivel
            if ($roleLevel <= 3) {
                return '/dashboard/admin.html';
            } elseif ($roleLevel <= 7) {
                return '/dashboard/manager.html';
            } else {
                return '/dashboard/user.html';
            }
    }
}

/**
 * Verificar y validar sesión completa
 */
function validateSession() {
    // Verificar variables de sesión básicas
    if (!isset($_SESSION['user_id']) ||
        !isset($_SESSION['session_token']) ||
        !isset($_SESSION['authenticated']) ||
        $_SESSION['authenticated'] !== true) {
        return false;
    }

    // Verificar timeout de sesión
    if (isset($_SESSION['login_time'])) {
        $sessionAge = time() - $_SESSION['login_time'];
        if ($sessionAge > SESSION_TIMEOUT) {
            return false;
        }
    } else {
        return false;
    }

    // Verificar IP por seguridad (opcional pero recomendado)
    if (isset($_SESSION['ip_address'])) {
        $currentIP = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        if ($_SESSION['ip_address'] !== $currentIP) {
            // IP diferente - posible secuestro de sesión
            return false;
        }
    }

    // Verificar sesión en base de datos
    try {
        $pdo = getDBConnection();
        if (!$pdo) {
            return false;
        }

        $stmt = $pdo->prepare("
            SELECT us.id, us.expires_at,
                   u.id as user_id, u.username, u.email, u.first_name, u.last_name, u.status,
                   r.code as role_code, r.name as role_name, r.level as role_level
            FROM user_sessions us
            JOIN users u ON us.user_id = u.id
            LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = true
            LEFT JOIN roles r ON ur.role_id = r.id AND r.is_active = true
            WHERE us.session_token = :token
              AND us.user_id = :user_id
              AND us.expires_at > NOW()
              AND us.is_active = true
              AND u.status = 'active'
              AND u.deleted_at IS NULL
            ORDER BY r.level ASC
            LIMIT 1
        ");

        $stmt->execute([
            'token' => $_SESSION['session_token'],
            'user_id' => $_SESSION['user_id']
        ]);

        $sessionData = $stmt->fetch();

        if (!$sessionData) {
            return false;
        }

        // Actualizar datos de sesión si han cambiado
        if ($sessionData['role_code'] !== ($_SESSION['role_code'] ?? '')) {
            $_SESSION['role_code'] = $sessionData['role_code'];
            $_SESSION['role_name'] = $sessionData['role_name'];
            $_SESSION['role_level'] = $sessionData['role_level'];
        }

        // Renovar tiempo de sesión
        $_SESSION['login_time'] = time();

        // Extender sesión en base de datos
        $stmt = $pdo->prepare("
            UPDATE user_sessions
            SET expires_at = NOW() + INTERVAL ':timeout seconds',
                last_activity = NOW()
            WHERE session_token = :token AND user_id = :user_id
        ");

        $stmt->execute([
            'timeout' => SESSION_TIMEOUT,
            'token' => $_SESSION['session_token'],
            'user_id' => $_SESSION['user_id']
        ]);

        return $sessionData;

    } catch (Exception $e) {
        error_log("Session validation error: " . $e->getMessage());
        return false;
    }
}

/**
 * Limpiar sesión completamente
 */
function cleanupSession() {
    // Limpiar sesión de base de datos si existe token
    if (isset($_SESSION['session_token']) && isset($_SESSION['user_id'])) {
        try {
            $pdo = getDBConnection();
            if ($pdo) {
                $stmt = $pdo->prepare("
                    UPDATE user_sessions
                    SET is_active = false,
                        ended_at = NOW()
                    WHERE session_token = :token AND user_id = :user_id
                ");

                $stmt->execute([
                    'token' => $_SESSION['session_token'],
                    'user_id' => $_SESSION['user_id']
                ]);
            }
        } catch (Exception $e) {
            error_log("Session cleanup error: " . $e->getMessage());
        }
    }

    // Limpiar variables de sesión
    $_SESSION = array();

    // Destruir cookie de sesión
    if (ini_get("session.use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params["path"], $params["domain"],
            $params["secure"], $params["httponly"]
        );
    }

    // Destruir sesión
    session_destroy();
}

// ==========================================
// PROCESAMIENTO PRINCIPAL
// ==========================================

try {
    // Validar sesión
    $sessionData = validateSession();

    if ($sessionData) {
        // Sesión válida
        $redirect = getRedirectByRole($sessionData['role_code'], $sessionData['role_level']);

        echo json_encode([
            'authenticated' => true,
            'user' => [
                'id' => $sessionData['user_id'],
                'username' => $sessionData['username'],
                'email' => $sessionData['email'],
                'first_name' => $sessionData['first_name'],
                'last_name' => $sessionData['last_name'],
                'role_code' => $sessionData['role_code'],
                'role_name' => $sessionData['role_name'],
                'role_level' => $sessionData['role_level']
            ],
            'session' => [
                'token' => $_SESSION['session_token'],
                'login_time' => $_SESSION['login_time'] ?? null,
                'ip_address' => $_SESSION['ip_address'] ?? null
            ],
            'redirect' => $redirect,
            'permissions' => [
                'is_admin' => in_array($sessionData['role_code'], ['SUPER_ADMIN', 'SYSTEM_ADMIN']),
                'is_manager' => in_array($sessionData['role_code'], ['SUPER_ADMIN', 'SYSTEM_ADMIN', 'COMMUNITY_MANAGER']),
                'level' => $sessionData['role_level']
            ]
        ]);
    } else {
        // Sesión inválida - limpiar todo
        cleanupSession();

        echo json_encode([
            'authenticated' => false,
            'message' => 'Sesión inválida o expirada',
            'redirect' => '/login/index_login.html'
        ]);
    }

} catch (Exception $e) {
    error_log("Check session error: " . $e->getMessage());

    // En caso de error, limpiar sesión por seguridad
    cleanupSession();

    http_response_code(500);
    echo json_encode([
        'authenticated' => false,
        'error' => 'Error del sistema',
        'redirect' => '/login/index_login.html'
    ]);
}
?>
