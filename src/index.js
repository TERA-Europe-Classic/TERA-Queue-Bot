require('dotenv').config();
const { fetchQueues, buildEmbed } = require('./fetchQueues');
const { createApiServer } = require('./api');
const { createClient } = require('./discord/client');
const MessagingService = require('./services/messagingService');
const TrackingService = require('./services/trackingService');
const createQueueCommand = require('./commands/queue');
const createTrackCommand = require('./commands/track');

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = process.env.COMMAND_PREFIX || '!';
const API_PORT = process.env.API_PORT || 443;

if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

// Start the API server
const apiServer = createApiServer(API_PORT);

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

const client = createClient();

const messaging = new MessagingService(client);
const tracking = new TrackingService(messaging, buildEmbed);

// If the tracked message is deleted, stop updating
client.on('messageDelete', (deletedMessage) => {
  tracking.stopByMessageId(deletedMessage.id);
});

// ready event intentionally silent
client.once('clientReady', () => {});

// Command registry
const commands = new Map();
const queueCommand = createQueueCommand({ fetchQueues, buildEmbed, messaging });
const trackCommand = createTrackCommand({ fetchQueues, buildEmbed, messaging, tracking });
commands.set(queueCommand.name, queueCommand);
commands.set(trackCommand.name, trackCommand);

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const [command, ...args] = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = command.toLowerCase();

    const handler = commands.get(cmd);
    if (!handler) {
      await message.reply(`Unknown command. Try: \`${PREFIX}queue\` or \`${PREFIX}track\`.`);
      return;
    }

    await handler.execute(message);
  } catch (outerErr) {
    console.error('Unexpected error while processing a command.', outerErr);
  }
});

function stopAll() {
  tracking.stopAll();
}

process.on('SIGINT', () => { stopAll(); process.exit(0); });
process.on('SIGTERM', () => { stopAll(); process.exit(0); });

client.login(TOKEN);
