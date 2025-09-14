const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const Joi = require('joi');
const crypto = require('crypto');
const { getItemLevel, getLevel, supportIds } = require('./data/xmlData');

class QueueManager {
  constructor() {
    this.queues = {
      dungeons: new Map(),
      bgs: new Map()
    };
    this.lastUpdated = new Date();
    this.sortedDungeonKeys = [];
  }

  // Simple add/subtract counting per instance
  // matching_state === 1 → add `players` to queued for each instance
  // matching_state === 0 → subtract `players` from queued for each instance
  updateQueue(queueData) {
    const { type, players, instances, server, matching_state } = queueData;
    
    // Determine queue type: 0 = dungeons, 1 = battlegrounds
    const queueType = type === 0 ? 'dungeons' : 'bgs';
    
    // Normalize Blast from the Past: replace classic group (from XML) with 9999, keep others
    const BLAST_GROUP = Array.from(supportIds || []);
    const incoming = (instances || []).map(String);
    const hasClassicSubset = BLAST_GROUP.every(id => incoming.includes(id));
    const DEBUG_BFP = process.env.DEBUG_BFP === 'true';
    let normalized = incoming;
    if (hasClassicSubset) {
      const classicSet = new Set(BLAST_GROUP);
      normalized = incoming.filter(id => !classicSet.has(id));
      normalized.push('9999');
    }

    // Track each instance separately (including 9999 if present)
    normalized.forEach(instance => {
      const key = `${server}:${instance}`;
      const current = this.queues[queueType].get(key) || 0;

      if (matching_state === 1) {
        this.queues[queueType].set(key, current + Number(players || 0));
      } else {
        const newValue = Math.max(0, current - Number(players || 0));
        if (newValue > 0) {
          this.queues[queueType].set(key, newValue);
        } else {
          this.queues[queueType].delete(key);
        }
      }
    });
    
    this.lastUpdated = new Date();

    // Recompute cached sorted order for dungeons after each update
    this._recomputeDungeonOrder();
  }

  _recomputeDungeonOrder() {
    const keys = Array.from(this.queues.dungeons.keys());
    keys.sort((a, b) => {
      const ia = a.split(':')[1];
      const ib = b.split(':')[1];
      const iaIlvl = getItemLevel(ia);
      const ibIlvl = getItemLevel(ib);
      if (iaIlvl !== ibIlvl) return iaIlvl - ibIlvl; // sort by item level requirement
      const la = getLevel(ia);
      const lb = getLevel(ib);
      if (la !== lb) return la - lb; // tie-break by character level
      // Tie-break by instance id for stability
      return String(ia).localeCompare(String(ib));
    });
    this.sortedDungeonKeys = keys;
  }

  getQueues() {
    const mapEntryToObj = (key, queued) => {
      const [server, instance] = key.split(':');
      return {
        server,
        instances: [instance],
        queued,
        lastSeen: this.lastUpdated
      };
    };

    const dungeons = this.sortedDungeonKeys
      .filter((key) => this.queues.dungeons.has(key))
      .map((key) => mapEntryToObj(key, this.queues.dungeons.get(key)));

    const bgs = Array.from(this.queues.bgs.entries()).map(([key, queued]) => mapEntryToObj(key, queued));

    return {
      dungeons,
      bgs,
      lastUpdated: this.lastUpdated
    };
  }

  clearAll() {
    this.queues = {
      dungeons: new Map(),
      bgs: new Map()
    };
    this.lastUpdated = new Date();
    this.sortedDungeonKeys = [];
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

function createApiServer(port = 3000) {
  const app = express();
  
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
  
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  app.use((req, res, next) => {
    req.setTimeout(SECURITY_CONFIG.REQUEST_TIMEOUT, () => {
      logSecurityEvent('REQUEST_TIMEOUT', req);
      res.status(408).end();
    });
    next();
  });
  
  const normalizeIP = (ip) => {
    if (!ip) return ip;
    const v4mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (v4mapped) return v4mapped[1];
    if (ip === '::1') return '127.0.0.1';
    return ip;
  };

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
  
  app.use(ipWhitelistMiddleware);
  
  app.use((req, res, next) => {
    const fingerprint = crypto.createHash('sha256')
      .update(req.ip + req.get('User-Agent') + req.get('Accept-Language'))
      .digest('hex')
      .substring(0, 16);
    
    req.fingerprint = fingerprint;
    next();
  });
  
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
  
  // No per-request logging in production
  
  const v1Router = express.Router();
  
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime()
    });
  });
  
  v1Router.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  });
  
  v1Router.get('/servers/:server/queues', validateServerName, (req, res) => {
    const { server } = req.params;
    const queues = queueManager.getQueues();
    
    res.json({
      server,
      data: queues,
      timestamp: new Date().toISOString()
    });
  });
  
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
  
  app.use('/api/v1', v1Router);
  
  app.use((err, req, res, next) => {
    console.error('API Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });
  
  app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });
  
  // Start HTTP server only
  app.listen(port, () => {});
  
  return app;
}

module.exports = {
  createApiServer,
  queueManager
};
