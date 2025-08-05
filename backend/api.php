<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}

class Database {
    private $host = 'mysql_instance';
    private $dbname = 'cs499_capstone_db';
    private $username = 'cs499user';
    private $password = 'cs499password';
    private $pdo;
    
    public function __construct() {
        try {
            $this->pdo = new PDO(
                "mysql:host={$this->host};dbname={$this->dbname};charset=utf8mb4",
                $this->username,
                $this->password,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
                ]
            );
        } catch (PDOException $e) {
            die(json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]));
        }
    }
    
    public function getConnection() {
        return $this->pdo;
    }
    
    public function initTables() {
        $queries = [
            "CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                theme VARCHAR(10) DEFAULT 'light',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )",
            "CREATE TABLE IF NOT EXISTS chats (
                id VARCHAR(50) PRIMARY KEY,
                user_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                model VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )",
            "CREATE TABLE IF NOT EXISTS messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                chat_id VARCHAR(50) NOT NULL,
                sender ENUM('user', 'ai') NOT NULL,
                content TEXT NOT NULL,
                model VARCHAR(100),
                response_info VARCHAR(50),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
            )"
        ];
        
        foreach ($queries as $query) {
            $this->pdo->exec($query);
        }
    }
}

class AuthController {
    private $db;
    
    public function __construct($database) {
        $this->db = $database->getConnection();
    }
    
    public function register($data) {
        $username = trim($data['username'] ?? '');
        $email = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';
        
        // Validation
        if (empty($username) || empty($email) || empty($password)) {
            return ['error' => 'All fields are required'];
        }
        
        if (strlen($username) < 3) {
            return ['error' => 'Username must be at least 3 characters'];
        }
        
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['error' => 'Invalid email format'];
        }
        
        if (strlen($password) < 6) {
            return ['error' => 'Password must be at least 6 characters'];
        }
        
        // Check if user exists
        $stmt = $this->db->prepare("SELECT id FROM users WHERE username = ? OR email = ?");
        $stmt->execute([$username, $email]);
        if ($stmt->fetch()) {
            return ['error' => 'Username or email already exists'];
        }
        
        // Create user
        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $this->db->prepare("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)");
        
        try {
            $stmt->execute([$username, $email, $passwordHash]);
            $userId = $this->db->lastInsertId();
            
            return [
                'success' => true,
                'user' => [
                    'id' => $userId,
                    'username' => $username,
                    'email' => $email,
                    'theme' => 'light'
                ]
            ];
        } catch (PDOException $e) {
            return ['error' => 'Registration failed'];
        }
    }
    
    public function login($data) {
        $username = trim($data['username'] ?? '');
        $password = $data['password'] ?? '';
        
        if (empty($username) || empty($password)) {
            return ['error' => 'Username and password are required'];
        }
        
        // Find user by username or email
        $stmt = $this->db->prepare("SELECT * FROM users WHERE username = ? OR email = ?");
        $stmt->execute([$username, $username]);
        $user = $stmt->fetch();
        
        if (!$user || !password_verify($password, $user['password_hash'])) {
            return ['error' => 'Invalid credentials'];
        }
        
        return [
            'success' => true,
            'user' => [
                'id' => $user['id'],
                'username' => $user['username'],
                'email' => $user['email'],
                'theme' => $user['theme']
            ]
        ];
    }
    
    public function updateTheme($userId, $theme) {
        $stmt = $this->db->prepare("UPDATE users SET theme = ? WHERE id = ?");
        $stmt->execute([$theme, $userId]);
        
        return ['success' => true];
    }
}

class ChatController {
    private $db;
    
    public function __construct($database) {
        $this->db = $database->getConnection();
    }
    
    public function getUserChats($userId) {
        $stmt = $this->db->prepare("
            SELECT c.*, 
                   (SELECT content FROM messages WHERE chat_id = c.id ORDER BY timestamp DESC LIMIT 1) as last_message
            FROM chats c 
            WHERE c.user_id = ? 
            ORDER BY c.updated_at DESC
        ");
        $stmt->execute([$userId]);
        $chats = $stmt->fetchAll();
        
        foreach ($chats as &$chat) {
            $stmt = $this->db->prepare("
                SELECT sender, content, model, response_info, timestamp 
                FROM messages 
                WHERE chat_id = ? 
                ORDER BY timestamp ASC
            ");
            $stmt->execute([$chat['id']]);
            $chat['messages'] = $stmt->fetchAll();
        }
        
        return $chats;
    }
    
    public function saveChat($userId, $chatData) {
        // Insert or update chat
        $stmt = $this->db->prepare("
            INSERT INTO chats (id, user_id, name, model, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE 
            name = VALUES(name), updated_at = VALUES(updated_at)
        ");
        $stmt->execute([
            $chatData['id'],
            $userId,
            $chatData['name'],
            $chatData['model'],
            $chatData['createdAt'],
            $chatData['updatedAt']
        ]);
        
        // Clear existing messages for this chat
        $stmt = $this->db->prepare("DELETE FROM messages WHERE chat_id = ?");
        $stmt->execute([$chatData['id']]);
        
        // Insert messages
        if (!empty($chatData['messages'])) {
            $stmt = $this->db->prepare("
                INSERT INTO messages (chat_id, sender, content, model, response_info, timestamp) 
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            
            foreach ($chatData['messages'] as $message) {
                $stmt->execute([
                    $chatData['id'],
                    $message['sender'],
                    $message['content'],
                    $message['model'] ?? null,
                    $message['responseInfo'] ?? null,
                    $message['timestamp']
                ]);
            }
        }
        
        return ['success' => true];
    }
    
    public function deleteChat($userId, $chatId) {
        // Verify ownership
        $stmt = $this->db->prepare("SELECT user_id FROM chats WHERE id = ?");
        $stmt->execute([$chatId]);
        $chat = $stmt->fetch();
        
        if (!$chat || $chat['user_id'] != $userId) {
            return ['error' => 'Chat not found or access denied'];
        }
        
        $stmt = $this->db->prepare("DELETE FROM chats WHERE id = ?");
        $stmt->execute([$chatId]);
        
        return ['success' => true];
    }
}

// Initialize database and create tables
$database = new Database();
$database->initTables();

$authController = new AuthController($database);
$chatController = new ChatController($database);

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['REQUEST_URI'];
$input = json_decode(file_get_contents('php://input'), true);

// Route handling
if ($method === 'POST' && strpos($path, '/api/register') !== false) {
    echo json_encode($authController->register($input));
} elseif ($method === 'POST' && strpos($path, '/api/login') !== false) {
    echo json_encode($authController->login($input));
} elseif ($method === 'POST' && strpos($path, '/api/theme') !== false) {
    echo json_encode($authController->updateTheme($input['userId'], $input['theme']));
} elseif ($method === 'GET' && strpos($path, '/api/chats') !== false) {
    $userId = $_GET['userId'] ?? 0;
    echo json_encode($chatController->getUserChats($userId));
} elseif ($method === 'POST' && strpos($path, '/api/chats') !== false) {
    echo json_encode($chatController->saveChat($input['userId'], $input['chat']));
} elseif ($method === 'DELETE' && strpos($path, '/api/chats') !== false) {
    $chatId = $_GET['chatId'] ?? '';
    $userId = $_GET['userId'] ?? 0;
    echo json_encode($chatController->deleteChat($userId, $chatId));
} else {
    http_response_code(404);
    echo json_encode(['error' => 'Endpoint not found']);
}
?>
