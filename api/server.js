const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Database connection
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'ollama_user',
    password: process.env.DB_PASSWORD || 'ollama_pass',
    database: process.env.DB_NAME || 'ollama_chat',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'ollama_jwt_secret_key_2025';

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Routes

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// User Registration
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }

        // Check if user already exists
        const [existingUsers] = await pool.execute(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existingUsers.length > 0) {
            return res.status(409).json({ error: 'Username or email already exists' });
        }

        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Create user
        const [result] = await pool.execute(
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
            [username, email, passwordHash]
        );

        // Generate JWT token
        const token = jwt.sign(
            { userId: result.insertId, username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'User created successfully',
            token,
            user: {
                id: result.insertId,
                username,
                email,
                theme_preference: 'light'
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// User Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Find user
        const [users] = await pool.execute(
            'SELECT id, username, email, password_hash, theme_preference FROM users WHERE username = ? OR email = ?',
            [username, username]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users[0];

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                theme_preference: user.theme_preference
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user profile
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const [users] = await pool.execute(
            'SELECT id, username, email, theme_preference FROM users WHERE id = ?',
            [req.user.userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: users[0] });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update user theme preference
app.patch('/api/profile/theme', authenticateToken, async (req, res) => {
    try {
        const { theme } = req.body;

        if (!theme || !['light', 'dark'].includes(theme)) {
            return res.status(400).json({ error: 'Valid theme (light/dark) is required' });
        }

        await pool.execute(
            'UPDATE users SET theme_preference = ? WHERE id = ?',
            [theme, req.user.userId]
        );

        res.json({ message: 'Theme preference updated', theme });
    } catch (error) {
        console.error('Theme update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user's chats
app.get('/api/chats', authenticateToken, async (req, res) => {
    try {
        const [chats] = await pool.execute(`
            SELECT 
                c.id, c.name, c.model, c.created_at, c.updated_at,
                (SELECT content FROM messages WHERE chat_id = c.id ORDER BY timestamp DESC LIMIT 1) as last_message
            FROM chats c 
            WHERE c.user_id = ? 
            ORDER BY c.updated_at DESC
        `, [req.user.userId]);

        res.json({ chats });
    } catch (error) {
        console.error('Get chats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get specific chat with messages
app.get('/api/chats/:chatId', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;

        // Get chat details
        const [chats] = await pool.execute(
            'SELECT * FROM chats WHERE id = ? AND user_id = ?',
            [chatId, req.user.userId]
        );

        if (chats.length === 0) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        // Get messages
        const [messages] = await pool.execute(
            'SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC',
            [chatId]
        );

        res.json({
            chat: chats[0],
            messages
        });
    } catch (error) {
        console.error('Get chat error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create new chat
app.post('/api/chats', authenticateToken, async (req, res) => {
    try {
        const { id, name, model } = req.body;

        if (!id || !name || !model) {
            return res.status(400).json({ error: 'Chat ID, name, and model are required' });
        }

        await pool.execute(
            'INSERT INTO chats (id, user_id, name, model) VALUES (?, ?, ?, ?)',
            [id, req.user.userId, name, model]
        );

        res.status(201).json({ message: 'Chat created successfully' });
    } catch (error) {
        console.error('Create chat error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update chat
app.patch('/api/chats/:chatId', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Chat name is required' });
        }

        const [result] = await pool.execute(
            'UPDATE chats SET name = ? WHERE id = ? AND user_id = ?',
            [name, chatId, req.user.userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        res.json({ message: 'Chat updated successfully' });
    } catch (error) {
        console.error('Update chat error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete chat
app.delete('/api/chats/:chatId', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;

        const [result] = await pool.execute(
            'DELETE FROM chats WHERE id = ? AND user_id = ?',
            [chatId, req.user.userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        res.json({ message: 'Chat deleted successfully' });
    } catch (error) {
        console.error('Delete chat error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add message to chat
app.post('/api/chats/:chatId/messages', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { sender, content, model, response_info } = req.body;

        if (!sender || !content) {
            return res.status(400).json({ error: 'Sender and content are required' });
        }

        // Verify chat belongs to user
        const [chats] = await pool.execute(
            'SELECT id FROM chats WHERE id = ? AND user_id = ?',
            [chatId, req.user.userId]
        );

        if (chats.length === 0) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        // Add message
        await pool.execute(
            'INSERT INTO messages (chat_id, sender, content, model, response_info) VALUES (?, ?, ?, ?, ?)',
            [chatId, sender, content, model || null, response_info || null]
        );

        // Update chat timestamp
        await pool.execute(
            'UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [chatId]
        );

        res.status(201).json({ message: 'Message added successfully' });
    } catch (error) {
        console.error('Add message error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Ollama Chat API server running on port ${PORT}`);
    console.log(`Database: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await pool.end();
    process.exit(0);
});
