require('dotenv').config();
const { fetchQueues, buildEmbed } = require('./fetchQueues');
const { createApiServer } = require('./api');
const { createClient } = require('./discord/client');
const MessagingService = require('./services/messagingService');
const TrackingService = require('./services/trackingService');
const createQueueCommand = require('./commands/queue');
const createTrackCommand = require('./commands/track');
const createClearCommand = require('./commands/clear');

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = process.env.COMMAND_PREFIX || '!';
const API_PORT = process.env.API_PORT || 3000;

if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

// Start the API server
const apiServer = createApiServer(API_PORT);

process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection]', reason);
  // Don't exit the process for unhandled rejections
  // Log the error and continue running
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  // For uncaught exceptions, we should still exit gracefully
  // but give time for cleanup
  console.log('Shutting down gracefully due to uncaught exception...');
  stopAll();
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

const client = createClient();

const messaging = new MessagingService(client);
const tracking = new TrackingService(messaging, buildEmbed);

// Connection health monitoring
let connectionHealthCheck = null;
const startHealthCheck = () => {
  if (connectionHealthCheck) return;
  
  connectionHealthCheck = setInterval(() => {
    if (!client.isReady()) {
      console.warn('Discord client is not ready, attempting to reconnect...');
      client.login(TOKEN).catch(err => {
        console.error('Health check reconnection failed:', err);
      });
    }
  }, 30000); // Check every 30 seconds
};

const stopHealthCheck = () => {
  if (connectionHealthCheck) {
    clearInterval(connectionHealthCheck);
    connectionHealthCheck = null;
  }
};

// If the tracked message is deleted, stop updating
client.on('messageDelete', (deletedMessage) => {
  tracking.stopByMessageId(deletedMessage.id);
});

// ready event - start health monitoring
client.once('clientReady', () => {
  console.log('Discord client is ready');
  startHealthCheck();
});

// Command registry
const commands = new Map();
const queueCommand = createQueueCommand({ fetchQueues, buildEmbed, messaging });
const trackCommand = createTrackCommand({ fetchQueues, buildEmbed, messaging, tracking });
const clearCommand = createClearCommand({ messaging });
commands.set(queueCommand.name, queueCommand);
commands.set(trackCommand.name, trackCommand);
commands.set(clearCommand.name, clearCommand);

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const [command, ...args] = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = command.toLowerCase();

    const handler = commands.get(cmd);
    if (!handler) {
      await message.reply(`Unknown command. Try: \`${PREFIX}queue\`, \`${PREFIX}track\`, or \`${PREFIX}clear bg|dg\`.`);
      return;
    }

    // pass the rest of args to command handler
    await handler.execute(message, args);
  } catch (outerErr) {
    console.error('Unexpected error while processing a command.', outerErr);
  }
});

function stopAll() {
  stopHealthCheck();
  tracking.stopAll();
}

process.on('SIGINT', () => { stopAll(); process.exit(0); });
process.on('SIGTERM', () => { stopAll(); process.exit(0); });

client.login(TOKEN);
