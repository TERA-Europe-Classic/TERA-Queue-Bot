const { retryable } = require('../utils/retry');

class MessagingService {
  constructor(discordClient, options = {}) {
    this.client = discordClient;
    this.retryOptions = { retries: 3, ...options.retryOptions };
  }

  async send(channel, payload) {
    return retryable(() => channel.send(payload), this.retryOptions).catch((err) => {
      console.error('MessagingService.send failed', err);
      return undefined;
    });
  }

  async reply(message, content) {
    return retryable(() => message.reply(content), this.retryOptions).catch((err) => {
      console.error('MessagingService.reply failed', err);
      return undefined;
    });
  }

  async edit(message, payload) {
    return retryable(() => message.edit(payload), this.retryOptions).catch((err) => {
      console.error('MessagingService.edit failed', err);
      return undefined;
    });
  }
}

module.exports = MessagingService;


