const axios = require('axios');

module.exports = function createClearCommand({ messaging }) {
  return {
    name: 'clear',
    async execute(message, args = []) {
      try {
        const suffix = (args[0] || '').toLowerCase();
        if (suffix !== 'bg' && suffix !== 'dg') {
          await messaging.reply(message, 'Usage: clear bg|dg');
          return;
        }

        const type = suffix === 'bg' ? 'battlegrounds' : 'dungeons';
        const baseUrl = process.env.API_BASE_URL || 'https://localhost:443';
        const server = process.env.SERVER_NAME || 'Yurian';
        const url = `${baseUrl}/api/v1/servers/${server}/queues/${type}`;

        const headers = { Authorization: `Bearer ${process.env.API_KEY}` };
        await axios.delete(url, { headers, timeout: 5000, httpsAgent: new (require('https').Agent)({ rejectUnauthorized: process.env.NODE_ENV === 'production' }) });

        await messaging.reply(message, `Cleared ${suffix.toUpperCase()} queues.`);
      } catch (err) {
        console.error('clear command failed', err);
        await messaging.reply(message, 'Failed to clear queues.');
      }
    }
  };
};




