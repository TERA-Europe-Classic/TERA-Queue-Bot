class TrackingService {
  constructor(messagingService, buildEmbed) {
    this.messaging = messagingService;
    this.buildEmbed = buildEmbed;
    this.trackers = new Map(); // messageId -> intervalId
  }

  stopByMessageId(messageId) {
    if (this.trackers.has(messageId)) {
      clearInterval(this.trackers.get(messageId));
      this.trackers.delete(messageId);
    }
  }

  stopAll() {
    for (const [, id] of this.trackers) clearInterval(id);
    this.trackers.clear();
  }

  start(message, fetchQueues, intervalMs = 60_000) {
    const intervalId = setInterval(async () => {
      try {
        const updated = await fetchQueues();
        const newEmbed = this.buildEmbed(updated);
        const edited = await this.messaging.edit(message, { embeds: [newEmbed] });
        if (!edited) {
          // Stop if we cannot edit (deleted or permission issues)
          this.stopByMessageId(message.id);
        }
      } catch (e) {
        console.error('Tracking update failed:', e);
      }
    }, intervalMs);

    this.trackers.set(message.id, intervalId);
    return intervalId;
  }
}

module.exports = TrackingService;


