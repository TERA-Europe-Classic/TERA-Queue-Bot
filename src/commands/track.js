const {PermissionsBitField} = require('discord.js');

module.exports = function createTrackCommand({fetchQueues, buildEmbed, messaging, tracking}) {
    return {
        name: 'track',
        async execute(message) {
            // check if user has permission to manage channels
            if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
                await messaging.reply(message, 'You do not have permission to use this command.');
                throw new Error(`User ${message.author.tag} attempted to use track command without permission.`);
            }

            try {
                const data = await fetchQueues();
                const embed = buildEmbed(data);
                const sent = await messaging.send(message.channel, {embeds: [embed]});
                if (!sent) return;

                tracking.start(sent, fetchQueues, 10_000);
                await messaging.reply(message, 'Tracking this message. It will update every 10 seconds.').catch(() => {
                });
            } catch (err) {
                console.error('track command failed', err);
            }
        }
    };
};