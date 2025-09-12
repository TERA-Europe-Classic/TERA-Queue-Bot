# TERA Queue Bot
Discord bot that displays and tracks TERA queue status for Dungeons and Battlegrounds. The bot now includes its own internal API server to handle queue data from TERA game modules, eliminating dependency on external domains.

## Architecture
- **Internal API Server**: Express.js server running on port 443 (HTTPS) with security hardening
- **Queue Data Management**: In-memory storage with automatic cleanup of stale data
- **TERA Module Integration**: Compatible with TERA game modules that send queue updates
- **Discord Bot**: Fetches data from internal API and displays it via Discord commands
- **Security Features**: Helmet, rate limiting, CORS, API key authentication, HTTPS

## Features
- `!queue` — Fetches current queue data and sends it as an embed.
- `!track` — Posts an embed with the current queue and automatically updates the same message every 30 seconds.

## Prerequisites
- Node.js 18+ (required by discord.js v14 and to have global `fetch`/modern runtime)
- A Discord Bot token
- TERA game with compatible module (optional, for real-time queue updates)

## Discord Bot Setup
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create an application + bot.
2. Under "Bot" settings:
   - Enable the intent: "MESSAGE CONTENT INTENT".
   - (Gateway) Ensure the bot has the following Intents enabled: Guilds, Guild Messages, Message Content.
3. Invite the bot to your server with permissions to read and send messages.

## Local Setup
1. Clone this repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with your configuration:
   ```env
   # Discord Bot Configuration
   DISCORD_TOKEN=your-bot-token-here
   COMMAND_PREFIX=!
   
   # API Server Configuration
   API_PORT=443
   API_BASE_URL=https://localhost:443
   SERVER_NAME=Yurian
   API_KEY=your-secure-api-key-here
   
   # SSL Certificate Paths (optional - fallback to HTTP if not provided)
   SSL_KEY_PATH=./ssl/private.key
   SSL_CERT_PATH=./ssl/certificate.crt
   
   # Security Configuration
   ALLOWED_ORIGINS=https://yourdomain.com,https://anotherdomain.com
   ALLOWED_SERVERS=Yurian,OtherServer
   ALLOWED_IPS=45.152.240.18
   REQUEST_TIMEOUT=30000
   MAX_QUEUE_ENTRIES=100
   LOG_SECURITY_EVENTS=true
   NODE_ENV=production
   ```
4. Start the bot (this will start both the Discord bot and API server):
   ```bash
   npm start
   ```

## TERA Module Setup (Optional)
To receive real-time queue updates from TERA:

1. Copy `config.example.json` to `config.json` and configure:
   ```json
   {
     "api_key": "your-secure-api-key-here",
     "server_name": "Yurian",
     "api_matching_url": "https://localhost:443/api/v1/servers/Yurian/queues"
   }
   ```
   
   **Important**: The `api_key` in `config.json` must match the `API_KEY` in your `.env` file.

2. Use the provided `tera-module.js` in your TERA mod loader.

## API Endpoints
The internal API server provides these RESTful endpoints:

### Public Endpoints (No Authentication Required)
- `GET /health` - Health check
- `GET /api/v1/health` - API health check
- `GET /api/v1/servers/:server/queues` - Get all queue data for a server
- `GET /api/v1/servers/:server/queues/dungeons` - Get dungeon queue data
- `GET /api/v1/servers/:server/queues/battlegrounds` - Get battleground queue data

### Protected Endpoints (Requires API Key)
- `POST /api/v1/servers/:server/queues` - Update queue data (for TERA modules)
- `DELETE /api/v1/servers/:server/queues` - Clear all queue data for a server

### Security Features
- **HTTPS**: All traffic encrypted (port 443)
- **API Key Authentication**: Required for write operations with constant-time comparison
- **CORS Protection**: Configurable allowed origins
- **Helmet Security**: Security headers and CSP
- **Request Logging**: All requests logged with timestamps
- **Input Validation**: Comprehensive validation with Joi schemas
- **Server Whitelisting**: Only allowed server names accepted
- **IP Whitelisting**: All requests restricted to proxy IP (45.152.240.18)
- **Request Timeout**: Configurable request timeout protection
- **Request Fingerprinting**: Unique fingerprinting for security monitoring
- **Security Event Logging**: Detailed logging of security events
- **Data Sanitization**: Automatic sanitization of all input data

## Usage
In any text channel where the bot has access:

- `!queue`
  - The bot replies with an embed containing the latest Dungeon and Battleground queue snapshot.

- `!track`
  - The bot posts an embed and will edit that same message every 30 seconds with fresh data.

## Implementation Notes
- Source code lives in `src/`:
  - `src/index.js` — Discord bot entrypoint, command handling, and API server startup.
  - `src/fetchQueues.js` — Fetch logic from internal API and embed formatting.
  - `src/api.js` — Express API server with security hardening and queue data management.
- Intervals created by `!track` are kept in-memory and cleared on process exit (SIGINT/SIGTERM).
- Queue data is stored in-memory and automatically cleaned up after 5 minutes of inactivity.
- The API server runs on the same process as the Discord bot for simplicity.
- HTTPS server with SSL certificate support (falls back to HTTP if certificates not found).
- Comprehensive security middleware including rate limiting, CORS, and API key authentication.

## Troubleshooting
- If the bot does not respond to commands:
  - Check that the bot is online (console shows `Logged in as <botname>`).
  - Verify Message Content Intent is enabled in the Developer Portal and in code.
  - Ensure the bot has permission to read and send messages in the channel.
- If the API server fails to start:
  - Check that port 443 (or your configured API_PORT) is not in use.
  - Verify your .env configuration is correct.
  - If using HTTPS, ensure SSL certificates are properly configured.
- If queue data is not updating:
  - Ensure the TERA module is properly configured and sending data to the API.
  - Check the API server logs for incoming requests.
  - Verify the config.json file has the correct API URL with `/api/v1/` prefix.
  - Check that the API key matches between `.env` and `config.json`.
- SSL Certificate Issues:
  - Place your SSL certificates in the `./ssl/` directory.
  - Ensure the certificate files are readable by the Node.js process.
  - The server will fall back to HTTP on port 3000 if SSL certificates are not found.

## License
MIT
