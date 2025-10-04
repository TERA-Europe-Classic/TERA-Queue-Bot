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

  client.on('error', (err) => {
    console.error('[discord.js:error]', err);
    // Don't crash on Discord client errors
  });
  
  client.on('warn', (info) => console.warn('[discord.js:warn]', info));
  client.on('rateLimit', (info) => console.warn('[discord.js:rateLimit]', info));
  
  client.on('shardError', (error, shardId) => {
    console.error(`[discord.js:shardError] shard ${shardId}`, error);
    // Attempt to reconnect on shard errors
    setTimeout(() => {
      if (client.readyAt === null) {
        console.log('Attempting to reconnect Discord client...');
        client.login(process.env.DISCORD_TOKEN).catch(err => {
          console.error('Failed to reconnect Discord client:', err);
        });
      }
    }, 5000);
  });
  
  client.on('shardDisconnect', (event, shardId) => {
    console.warn(`[discord.js:shardDisconnect] shard ${shardId}`, event && event.code);
    // Attempt to reconnect on disconnect
    setTimeout(() => {
      if (client.readyAt === null) {
        console.log('Attempting to reconnect Discord client after disconnect...');
        client.login(process.env.DISCORD_TOKEN).catch(err => {
          console.error('Failed to reconnect Discord client:', err);
        });
      }
    }, 5000);
  });

  return client;
}

module.exports = {
  createClient
};


