const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const https = require('https');
const fs = require('fs');
const path = require('path');
const Joi = require('joi');
const crypto = require('crypto');

class QueueManager {
  constructor() {
    this.queues = {
      dungeons: [],
      bgs: []
    };
    this.lastUpdated = new Date();
  }

  updateQueue(queueData) {
    const { type, players, instances, server, matching_state } = queueData;
    
    // Determine queue type: 0 = dungeons, 1 = battlegrounds
    const queueType = type === 0 ? 'dungeons' : 'bgs';
    
    if (matching_state === 1) {
      // Queue is active - add or update
      const existingIndex = this.queues[queueType].findIndex(q => 
        q.server === server && q.instances.join(',') === instances.join(',')
      );
      
      const queueEntry = {
        server,
        players,
        instances,
        matching_state,
        queued: players,
        lastSeen: new Date()
      };
      
      if (existingIndex >= 0) {
        this.queues[queueType][existingIndex] = queueEntry;
      } else {
        this.queues[queueType].push(queueEntry);
      }
    } else {
      // Queue is inactive - remove matching entries
      this.queues[queueType] = this.queues[queueType].filter(q => 
        !(q.server === server && q.instances.join(',') === instances.join(','))
      );
    }
    
    this.lastUpdated = new Date();
  }

  getQueues() {
    // Clean up old entries (older than 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    Object.keys(this.queues).forEach(type => {
      this.queues[type] = this.queues[type].filter(q => q.lastSeen > fiveMinutesAgo);
    });

    return {
      dungeons: this.queues.dungeons,
      bgs: this.queues.bgs,
      lastUpdated: this.lastUpdated
    };
  }

  clearAll() {
    this.queues = {
      dungeons: [],
      bgs: []
    };
    this.lastUpdated = new Date();
  }
}

const queueManager = new QueueManager();

// Security configuration
const SECURITY_CONFIG = {
  // Allowed server names (whitelist)
  ALLOWED_SERVERS: process.env.ALLOWED_SERVERS ? process.env.ALLOWED_SERVERS.split(',') : ['Yurian'],
  
  // IP whitelist for write operations (optional)
  ALLOWED_IPS: process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',') : null,
  
  // Request timeout in milliseconds
  REQUEST_TIMEOUT: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
  
  // Maximum queue entries per server
  MAX_QUEUE_ENTRIES: parseInt(process.env.MAX_QUEUE_ENTRIES) || 100,
  
  // Security event logging
  LOG_SECURITY_EVENTS: process.env.LOG_SECURITY_EVENTS === 'true'
};

// Security event logger
const logSecurityEvent = (event, req, details = {}) => {
  if (!SECURITY_CONFIG.LOG_SECURITY_EVENTS) return;
  
  const timestamp = new Date().toISOString();
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || 'Unknown';
  
  console.log(`[SECURITY] ${timestamp} - ${event}`, {
    ip,
    userAgent,
    path: req.path,
    method: req.method,
    ...details
  });
};

// Input validation schemas
const queueDataSchema = Joi.object({
  type: Joi.number().integer().min(0).max(1).required(),
  players: Joi.number().integer().min(0).max(1000).required(),
  instances: Joi.array().items(Joi.string().max(50)).max(20).required(),
  server: Joi.string().max(50).required(),
  matching_state: Joi.number().integer().min(0).max(1).required()
});

const serverNameSchema = Joi.string().max(50).pattern(/^[a-zA-Z0-9_-]+$/);

function createApiServer(port = 443) {
  const app = express();
  
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));
  
  // CORS configuration
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  // Request timeout middleware
  app.use((req, res, next) => {
    req.setTimeout(SECURITY_CONFIG.REQUEST_TIMEOUT, () => {
      logSecurityEvent('REQUEST_TIMEOUT', req);
      res.status(408).end();
    });
    next();
  });
  
  // Helper to normalize IPv6-mapped IPv4 and loopback
  const normalizeIP = (ip) => {
    if (!ip) return ip;
    const v4mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (v4mapped) return v4mapped[1];
    if (ip === '::1') return '127.0.0.1';
    return ip;
  };

  // IP whitelist middleware for all requests
  const ipWhitelistMiddleware = (req, res, next) => {
    if (!SECURITY_CONFIG.ALLOWED_IPS) return next();

    const clientIPRaw = req.ip || req.connection.remoteAddress;
    const clientIP = normalizeIP(clientIPRaw);
    const allowedList = SECURITY_CONFIG.ALLOWED_IPS.map(x => normalizeIP(String(x).trim()));

    const isAllowed = allowedList.some(allowedIP => {
      if (!allowedIP) return false;
      if (allowedIP.includes('/')) {
        return clientIP.startsWith(allowedIP.split('/')[0]);
      }
      return clientIP === allowedIP;
    });

    if (!isAllowed) {
      logSecurityEvent('IP_BLOCKED', req, { clientIP, allowedIPs: allowedList });
      return res.status(403).end();
    }

    next();
  };
  
  // Apply IP whitelist to all requests
  app.use(ipWhitelistMiddleware);
  
  // Request fingerprinting middleware
  app.use((req, res, next) => {
    const fingerprint = crypto.createHash('sha256')
      .update(req.ip + req.get('User-Agent') + req.get('Accept-Language'))
      .digest('hex')
      .substring(0, 16);
    
    req.fingerprint = fingerprint;
    next();
  });
  
  // API key validation middleware with enhanced security
  const validateApiKey = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const expectedApiKey = process.env.API_KEY;
    
    if (!expectedApiKey) {
      logSecurityEvent('API_KEY_NOT_CONFIGURED', req);
      return res.status(401).end();
    }
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logSecurityEvent('INVALID_AUTH_HEADER', req);
      return res.status(401).end();
    }
    
    const providedKey = authHeader.substring(7);
    
    // Constant-time comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(providedKey, 'utf8'),
      Buffer.from(expectedApiKey, 'utf8')
    );
    
    if (!isValid) {
      logSecurityEvent('INVALID_API_KEY', req, { 
        fingerprint: req.fingerprint,
        keyLength: providedKey.length 
      });
      return res.status(401).end();
    }
    
    next();
  };
  
  // Input validation middleware
  const validateInput = (schema) => {
    return (req, res, next) => {
      const { error, value } = schema.validate(req.body, { 
        abortEarly: false,
        stripUnknown: true 
      });
      
      if (error) {
        logSecurityEvent('VALIDATION_ERROR', req, { 
          errors: error.details.map(d => d.message),
          fingerprint: req.fingerprint 
        });
        return res.status(400).end();
      }
      
      req.body = value; // Use sanitized data
      next();
    };
  };
  
  // Server name validation middleware
  const validateServerName = (req, res, next) => {
    const serverName = req.params.server;
    const { error } = serverNameSchema.validate(serverName);
    
    if (error) {
      logSecurityEvent('INVALID_SERVER_NAME', req, { 
        serverName,
        fingerprint: req.fingerprint 
      });
      return res.status(400).end();
    }
    
    if (!SECURITY_CONFIG.ALLOWED_SERVERS.includes(serverName)) {
      logSecurityEvent('UNAUTHORIZED_SERVER', req, { 
        serverName,
        allowedServers: SECURITY_CONFIG.ALLOWED_SERVERS,
        fingerprint: req.fingerprint 
      });
      return res.status(403).end();
    }
    
    next();
  };
  
  // Request logging middleware
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`);
    next();
  });
  
  // API v1 routes
  const v1Router = express.Router();
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime()
    });
  });
  
  // API v1 routes
  v1Router.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  });
  
  // Get all queues for a server
  v1Router.get('/servers/:server/queues', validateServerName, (req, res) => {
    const { server } = req.params;
    const queues = queueManager.getQueues();
    
    res.json({
      server,
      data: queues,
      timestamp: new Date().toISOString()
    });
  });
  
  // Get specific queue type for a server
  v1Router.get('/servers/:server/queues/:type', validateServerName, (req, res) => {
    const { server, type } = req.params;
    const queues = queueManager.getQueues();
    
    if (type === 'dungeons') {
      res.json({
        server,
        type: 'dungeons',
        data: queues.dungeons,
        timestamp: new Date().toISOString()
      });
    } else if (type === 'battlegrounds') {
      res.json({
        server,
        type: 'battlegrounds', 
        data: queues.bgs,
        timestamp: new Date().toISOString()
      });
    } else {
      logSecurityEvent('INVALID_QUEUE_TYPE', req, { type, fingerprint: req.fingerprint });
      res.status(400).end();
    }
  });
  
  // Update queue data (requires API key)
  v1Router.post('/servers/:server/queues', 
    validateApiKey, 
    validateServerName,
    validateInput(queueDataSchema),
    (req, res) => {
      const { server } = req.params;
      const queueData = req.body;
      
      // Additional server name validation in body
      if (queueData.server !== server) {
        logSecurityEvent('SERVER_NAME_MISMATCH', req, { 
          urlServer: server, 
          bodyServer: queueData.server,
          fingerprint: req.fingerprint 
        });
        return res.status(400).end();
      }
      
      queueManager.updateQueue(queueData);
      res.json({ 
        success: true, 
        server,
        timestamp: new Date().toISOString() 
      });
    }
  );
  
  // Clear all queues for a server (requires API key)
  v1Router.delete('/servers/:server/queues', 
    validateApiKey, 
    validateServerName,
    (req, res) => {
      const { server } = req.params;
      queueManager.clearAll();
      res.json({ 
        success: true, 
        message: `All queues cleared for server: ${server}`,
        timestamp: new Date().toISOString()
      });
    }
  );
  
  // Mount API v1 routes
  app.use('/api/v1', v1Router);
  
  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error('API Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });
  
  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });
  
  // Create HTTPS server
  const createHttpsServer = () => {
    const sslKeyPath = process.env.SSL_KEY_PATH || './ssl/private.key';
    const sslCertPath = process.env.SSL_CERT_PATH || './ssl/certificate.crt';
    
    try {
      const privateKey = fs.readFileSync(sslKeyPath, 'utf8');
      const certificate = fs.readFileSync(sslCertPath, 'utf8');
      
      const credentials = {
        key: privateKey,
        cert: certificate
      };
      
      return https.createServer(credentials, app);
    } catch (error) {
      console.error('Failed to load SSL certificates:', error.message);
      console.log(`Falling back to HTTP server on port 3000`);
      return null;
    }
  };
  
  const server = createHttpsServer();
  
  if (server) {
    server.listen(port, () => {
      console.log(`🔒 HTTPS API server running on port ${port}`);
      console.log(`📊 API endpoints available at: https://localhost:${port}/api/v1/`);
    });
  } else {
    // Fallback to HTTP if SSL certificates not available
    app.listen(3000, () => {
      console.log(`⚠️  HTTP API server running on port ${port} (SSL certificates not found)`);
      console.log(`📊 API endpoints available at: http://localhost:3000/api/v1/`);
    });
  }
  
  return app;
}

module.exports = {
  createApiServer,
  queueManager
};
