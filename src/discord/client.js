const { Client, GatewayIntentBits, Partials } = require('discord.js');

function createClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });

  client.on('error', (err) => console.error('[discord.js:error]', err));
  client.on('warn', (info) => console.warn('[discord.js:warn]', info));
  client.on('rateLimit', (info) => console.warn('[discord.js:rateLimit]', info));
  client.on('shardError', (error, shardId) => console.error(`[discord.js:shardError] shard ${shardId}`, error));
  client.on('shardDisconnect', (event, shardId) => console.warn(`[discord.js:shardDisconnect] shard ${shardId}`, event && event.code));

  return client;
}

module.exports = {
  createClient
};


