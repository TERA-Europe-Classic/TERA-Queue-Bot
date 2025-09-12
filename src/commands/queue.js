module.exports = function createQueueCommand({ fetchQueues, buildEmbed, messaging }) {
  return {
    name: 'queue',
    async execute(message) {
      try {
        const data = await fetchQueues();
        const embed = buildEmbed(data);
        await messaging.send(message.channel, { embeds: [embed] });
      } catch (err) {
        console.error('queue command failed', err);
      }
    }
  };
};


