# Ollama Chat

A full-featured web interface for Ollama with user authentication, persistent chat history, and theme management. Built with Docker Compose for easy deployment and scalability.

## Features

### 🔐 User Authentication
- **Secure Login System**: JWT-based authentication with bcrypt password hashing
- **Session Management**: Automatic redirect to login for unauthenticated users
- **User Profiles**: Display username and email in the interface
- **Secure Logout**: Clean session termination

### 💬 Chat Interface
- **Multi-Model Support**: Switch between different Ollama models
- **Real-time Messaging**: Instant communication with AI models
- **Markdown Rendering**: Rich text support for AI responses
- **Typing Indicators**: Visual feedback during AI processing
- **Auto-resizing Input**: Textarea that adapts to content

### 📚 Chat Management
- **Persistent History**: All conversations saved to database
- **Chat Organization**: Sidebar with chat history and previews
- **Auto-naming**: Chats automatically named from first message
- **Delete Functionality**: Remove unwanted conversations
- **Message Timestamps**: Track when messages were sent

### 🎨 User Experience
- **Dark/Light Themes**: Toggle between themes with user preference persistence
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Modern UI**: Clean, professional interface with smooth animations
- **Connection Status**: Real-time Ollama connection monitoring

### 🔧 Technical Features
- **Docker Compose Architecture**: Multi-service deployment
- **MySQL Database**: Persistent data storage
- **NGINX Reverse Proxy**: Efficient request routing
- **API-driven**: RESTful backend with Node.js/Express
- **Error Handling**: Comprehensive error management and user feedback

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Node.js API   │    │   MySQL DB      │
│   (Web UI)      │◄──►│   (Port 3001)   │◄──►│   (Port 3307)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         ▲                        ▲                        ▲
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   NGINX Proxy   │    │   Ollama API    │    │   File Storage  │
│   (Port 8090)   │    │   (Port 11435)  │    │   (Volumes)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Prerequisites

- **Docker & Docker Compose**: Latest versions recommended
- **Ollama**: Running instance with models downloaded
- **Available Ports**: 8090 (web), 3001 (API), 3307 (MySQL), 11435 (Ollama)

## Quick Start

### 1. Clone and Setup
```bash
cd /path/to/your/ollama/directory
# Ensure you have the project files in place
```

### 2. Start Services
```bash
docker-compose up -d
```

### 3. Access Application
- **Web Interface**: http://logansserver1511.duckdns.org:8090
- **Login Page**: http://logansserver1511.duckdns.org:8090/login.html
- **API Endpoint**: http://logansserver1511.duckdns.org:3001

## Project Structure

```
ollama/
├── docker-compose.yml          # Multi-service configuration
├── web/
│   ├── index.html             # Main chat interface
│   ├── login.html             # Authentication page
│   └── style.css              # Shared styles
├── api/
│   ├── server.js              # Express.js backend
│   ├── package.json           # Node.js dependencies
│   └── config/
│       └── database.js        # MySQL configuration
└── nginx/
    └── nginx.conf             # Reverse proxy config
```

## Services Overview

### 🌐 Web Frontend (`web/`)
- **Technology**: Vanilla HTML/CSS/JavaScript
- **Features**: Single-page application with authentication
- **Key Components**:
  - `AuthManager`: Handles JWT tokens and user sessions
  - `OllamaChat`: Main chat interface logic
  - Theme management and responsive design

### 🔧 API Backend (`api/`)
- **Technology**: Node.js with Express.js
- **Database**: MySQL with connection pooling
- **Key Endpoints**:
  - `POST /api/auth/login` - User authentication
  - `GET /api/profile` - User profile data
  - `GET /api/chats` - Retrieve user's chat history
  - `POST /api/chats` - Create new chat
  - `POST /api/chats/:id/messages` - Save messages

### 🗄️ Database Schema
```sql
-- Users table
users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(255) UNIQUE,
    email VARCHAR(255),
    password_hash VARCHAR(255),
    theme_preference ENUM('light', 'dark'),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)

-- Chats table
chats (
    id VARCHAR(255) PRIMARY KEY,
    user_id INT,
    name VARCHAR(255),
    model VARCHAR(255),
    last_message TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
)

-- Messages table
messages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    chat_id VARCHAR(255),
    sender ENUM('user', 'ai'),
    content TEXT,
    model VARCHAR(255),
    response_info VARCHAR(255),
    timestamp TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats(id)
)
```

## Configuration

### Environment Variables
The application uses the following default configurations:

- **MySQL**: `ollama_user:ollama_pass@logansserver1511.duckdns.org:3307/ollama_chat`
- **JWT Secret**: Auto-generated on startup
- **Ollama URL**: `http://ollama:11435`

### Docker Compose Services

1. **ollama/ollama**: AI model serving
2. **nginx:alpine**: Web server and reverse proxy  
3. **mysql:8.0**: Database server
4. **Node.js API**: Custom authentication and chat management

## Usage Guide

### First Time Setup
1. **Start Services**: `docker-compose up -d`
2. **Access Application**: Navigate to http://logansserver1511.duckdns.org:8090
3. **Login**: Use demo/demo123 or create new user
4. **Select Model**: Choose from available Ollama models
5. **Start Chatting**: Begin your AI conversation

### Managing Chats
- **New Chat**: Click "+" button in sidebar
- **Switch Chats**: Click on any chat in history
- **Delete Chat**: Click "×" button on chat item
- **Auto-naming**: Chats automatically named from first message

### Theme Management
- **Toggle Theme**: Click 🌙/☀️ button in sidebar header
- **Persistence**: Theme preference saved to user profile
- **System Support**: Automatic dark/light mode detection

## API Reference

### Authentication
```javascript
// Login
POST /api/auth/login
Content-Type: application/json
{
  "username": "demo",
  "password": "demo123"
}

// Get Profile
GET /api/profile
Authorization: Bearer <jwt-token>
```

### Chat Management
```javascript
// Get Chats
GET /api/chats
Authorization: Bearer <jwt-token>

// Create Chat
POST /api/chats
Authorization: Bearer <jwt-token>
{
  "id": "chat_unique_id",
  "name": "Chat Name",
  "model": "llama2"
}

// Add Message
POST /api/chats/:id/messages
Authorization: Bearer <jwt-token>
{
  "sender": "user",
  "content": "Hello AI",
  "model": "llama2"
}
```

## Development

### Local Development
```bash
# Backend development
cd api/
npm install
npm run dev

# Frontend development
# Serve web/ directory with any static server
python -m http.server 8080 # Example
```

### Adding New Features
1. **Frontend**: Modify `web/index.html` and related files
2. **Backend**: Add routes in `api/server.js`
3. **Database**: Update schema in MySQL
4. **Testing**: Verify with demo user account

## Troubleshooting

### Common Issues

**Connection Problems**
- Verify Ollama is running: `docker ps | grep ollama`
- Check port availability: `netstat -tlnp | grep :8090`
- Review Docker logs: `docker-compose logs`

**Authentication Issues**
- Clear browser localStorage
- Verify JWT token format
- Check API server logs

**Database Issues**
- Verify MySQL container health
- Check database credentials
- Review connection pool settings

### Logs and Debugging
```bash
# View all service logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f api
docker-compose logs -f nginx
docker-compose logs -f mysql
```

## Security Considerations

- **Password Security**: bcrypt hashing with salt rounds
- **JWT Tokens**: Secure token generation and validation
- **Input Sanitization**: XSS protection in frontend
- **CORS Configuration**: Proper cross-origin handling
- **Database Security**: Parameterized queries to prevent injection

## Performance Tips

- **Database Indexing**: Optimized queries on user_id and chat_id
- **Connection Pooling**: Efficient database connections
- **Static Asset Caching**: NGINX configuration for optimal delivery
- **Lazy Loading**: Chat messages loaded on demand
- **Response Compression**: GZIP compression enabled

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit pull request

## License

This project is open source and available under the [MIT License](LICENSE).

## Support

For issues, questions, or contributions:
- Create an issue in the repository
- Check existing documentation
- Review Docker Compose logs for debugging

---

**Built with ❤️ for the Ollama community**
