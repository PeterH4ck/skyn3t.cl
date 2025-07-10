<?php
/**
 * Login Debug - CORREGIDO para $_SERVER
 * Compatible con PHP 7.4 y FreePBX
 */

// Configuración de depuración
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', '/tmp/skyn3t_debug.log');

// Iniciar buffer de salida
ob_start();

try {
    // Configurar headers
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Pragma: no-cache');
    header('Expires: 0');

    // CORREGIR: Verificar que $_SERVER['REQUEST_METHOD'] existe
    $requestMethod = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'UNKNOWN';

    error_log("DEBUG: Iniciando login_debug.php");
    error_log("DEBUG: REQUEST_METHOD = " . $requestMethod);

    if ($requestMethod === 'POST') {
        // Obtener input
        $rawInput = file_get_contents('php://input');
        error_log("DEBUG: Raw input = " . $rawInput);

        $input = json_decode($rawInput, true);
        error_log("DEBUG: Decoded input = " . print_r($input, true));

        $username = isset($input['username']) ? trim($input['username']) : '';
        $password = isset($input['password']) ? trim($input['password']) : '';

        error_log("DEBUG: Username = $username, Password length = " . strlen($password));

        // Validaciones básicas
        if (empty($username) || empty($password)) {
            $response = [
                'success' => false,
                'error' => 'Usuario y contraseña requeridos',
                'debug' => 'Empty credentials'
            ];
            error_log("DEBUG: Empty credentials");
        } else {
            // Probar conexión PostgreSQL
            try {
                $pdo = new PDO('pgsql:host=localhost;port=5432;dbname=master_db', 'postgres', 'postgres123', [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
                ]);

                error_log("DEBUG: PostgreSQL connection OK");

                // Buscar usuario
                $stmt = $pdo->prepare("SELECT id, username, email, password_hash FROM users WHERE username = :username LIMIT 1");
                $stmt->execute(['username' => $username]);
                $user = $stmt->fetch();

                error_log("DEBUG: User query executed, found: " . ($user ? 'YES' : 'NO'));

                if ($user) {
                    error_log("DEBUG: Found user hash: " . $user['password_hash']);
                    error_log("DEBUG: Attempting password_verify with: " . $password);

                    // Verificar contraseña
                    $passwordMatch = password_verify($password, $user['password_hash']);
                    error_log("DEBUG: password_verify result: " . ($passwordMatch ? 'TRUE' : 'FALSE'));

                    if ($passwordMatch) {
                        // Login exitoso
                        session_start();
                        $_SESSION['user_id'] = $user['id'];
                        $_SESSION['username'] = $user['username'];
                        $_SESSION['authenticated'] = true;

                        $response = [
                            'success' => true,
                            'message' => 'Login exitoso',
                            'user' => [
                                'id' => $user['id'],
                                'username' => $user['username']
                            ],
                            'redirect' => '/dashboard/admin.html',
                            'debug' => 'Authentication successful'
                        ];
                        error_log("DEBUG: Login successful for " . $username);
                    } else {
                        $response = [
                            'success' => false,
                            'error' => 'Credenciales incorrectas',
                            'debug' => 'Password verification failed - hash mismatch'
                        ];
                        error_log("DEBUG: Password verification failed - hash mismatch");
                    }
                } else {
                    $response = [
                        'success' => false,
                        'error' => 'Usuario no encontrado',
                        'debug' => 'User not found in database'
                    ];
                    error_log("DEBUG: User not found");
                }

            } catch (PDOException $e) {
                $response = [
                    'success' => false,
                    'error' => 'Error de base de datos',
                    'debug' => $e->getMessage()
                ];
                error_log("DEBUG: Database error: " . $e->getMessage());
            }
        }

    } else {
        // GET request
        $response = [
            'status' => 'ready',
            'method' => $requestMethod,
            'message' => 'Login endpoint ready',
            'php_version' => PHP_VERSION,
            'timestamp' => date('Y-m-d H:i:s'),
            'server_info' => [
                'host' => $_SERVER['HTTP_HOST'] ?? 'unknown',
                'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown'
            ]
        ];
        error_log("DEBUG: GET request processed");
    }

    // Limpiar buffer
    ob_clean();

    // Enviar respuesta
    echo json_encode($response, JSON_PRETTY_PRINT);
    error_log("DEBUG: Response sent: " . json_encode($response));

} catch (Exception $e) {
    ob_clean();

    $errorResponse = [
        'success' => false,
        'error' => 'Error interno',
        'debug' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine()
    ];

    error_log("DEBUG: Exception caught: " . $e->getMessage());

    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($errorResponse);
} finally {
    ob_end_flush();
}
?>
