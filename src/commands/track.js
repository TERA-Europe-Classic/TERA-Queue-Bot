module.exports = function createTrackCommand({ fetchQueues, buildEmbed, messaging, tracking }) {
  return {
    name: 'track',
    async execute(message) {
      try {
        const data = await fetchQueues();
        const embed = buildEmbed(data);
        const sent = await messaging.send(message.channel, { embeds: [embed] });
        if (!sent) return;

        tracking.start(sent, fetchQueues);
        await messaging.reply(message, 'Tracking this message. It will update every 30 seconds.').catch(() => {});
      } catch (err) {
        console.error('track command failed', err);
      }
    }
  };
};


