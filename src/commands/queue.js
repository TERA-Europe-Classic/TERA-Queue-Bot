module.exports = function createQueueCommand({ fetchQueues, buildEmbed, messaging }) {
  return {
    name: 'queue',
    async execute(message) {
      try {
        // Restrict to channel named "bot"
        const channelName = (message && message.channel && message.channel.name) ? String(message.channel.name).toLowerCase() : '';
        if (channelName !== 'bot') {
          await messaging.reply(message, 'Please use this command in #bot channel.');
          return;
        }

        const data = await fetchQueues();
        const embed = buildEmbed(data);
        await messaging.send(message.channel, { embeds: [embed] });
      } catch (err) {
        console.error('queue command failed', err);
      }
    }
  };
};


