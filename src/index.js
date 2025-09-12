require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { fetchQueues, buildEmbed } = require('./fetchQueues');
const { createApiServer } = require('./api');

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = process.env.COMMAND_PREFIX || '!';
const API_PORT = process.env.API_PORT || 443;

if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

// Start the API server
const apiServer = createApiServer(API_PORT);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// messageId -> intervalId
const trackers = new Map();

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const [command, ...args] = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = command.toLowerCase();

  if (cmd === 'queue') {
    try {
      const data = await fetchQueues();
      const embed = buildEmbed(data);
      await message.channel.send({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      await message.channel.send(`Error: ${err.message}`);
    }
  } else if (cmd === 'track') {
    try {
      const data = await fetchQueues();
      const embed = buildEmbed(data);
      const msg = await message.channel.send({ embeds: [embed] });

      if (trackers.has(msg.id)) {
        clearInterval(trackers.get(msg.id));
      }

      const intervalId = setInterval(async () => {
        try {
          const updated = await fetchQueues();
          const newEmbed = buildEmbed(updated);
          await msg.edit({ embeds: [newEmbed] });
        } catch (e) {
          console.error('Track update failed:', e);
          await msg.edit({ content: `Error updating: ${e.message}`, embeds: [] });
        }
      }, 30_000);

      trackers.set(msg.id, intervalId);
      await message.reply('Tracking this message. It will update every 30 seconds.');
    } catch (err) {
      console.error(err);
      await message.channel.send(`Error: ${err.message}`);
    }
  }
});

function stopAll() {
  for (const [, id] of trackers) clearInterval(id);
  trackers.clear();
}

process.on('SIGINT', () => {
  console.log('SIGINT received. Cleaning up...');
  stopAll();
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Cleaning up...');
  stopAll();
  process.exit(0);
});

client.login(TOKEN);
