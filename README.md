# TERA Queue Bot
Discord bot that displays and tracks TERA queue status for Dungeons and Battlegrounds (server: `Yurian`).

It uses the public endpoints:
- `https://tera.digitalsavior.fr/matching/Yurian/dungeon`
- `https://tera.digitalsavior.fr/matching/Yurian/bg`

## Features
- `!queue` — Fetches current queue data and sends it as an embed.
- `!track` — Posts an embed with the current queue and automatically updates the same message every 30 seconds.

## Prerequisites
- Node.js 18+ (required by discord.js v14 and to have global `fetch`/modern runtime)
- A Discord Bot token

## Discord Bot Setup
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create an application + bot.
2. Under "Bot" settings:
   - Enable the intent: "MESSAGE CONTENT INTENT".
   - (Gateway) Ensure the bot has the following Intents enabled: Guilds, Guild Messages, Message Content.
3. Invite the bot to your server with permissions to read and send messages.

## Local Setup
1. Clone this repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and set your bot token:
   ```env
   DISCORD_TOKEN=your-bot-token-here
   # Optional, defaults to '!'
   COMMAND_PREFIX=!
   ```
4. Start the bot:
   ```bash
   npm start
   ```

## Usage
In any text channel where the bot has access:

- `!queue`
  - The bot replies with an embed containing the latest Dungeon and Battleground queue snapshot.

- `!track`
  - The bot posts an embed and will edit that same message every 30 seconds with fresh data.

## Implementation Notes
- Source code lives in `src/`:
  - `src/index.js` — Discord bot entrypoint and command handling.
  - `src/fetchQueues.js` — Fetch logic (via axios) and embed formatting.
- Intervals created by `!track` are kept in-memory and cleared on process exit (SIGINT/SIGTERM).

## Troubleshooting
- If the bot does not respond to commands:
  - Check that the bot is online (console shows `Logged in as <botname>`).
  - Verify Message Content Intent is enabled in the Developer Portal and in code.
  - Ensure the bot has permission to read and send messages in the channel.
- If endpoints are unavailable or fail, the bot will log an error and respond with a short error message.

## License
MIT
