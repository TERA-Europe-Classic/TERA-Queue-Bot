const assert = require('assert/strict');

async function main() {
  process.env.API_KEY = process.env.API_KEY || 'ci-test-key';
  process.env.ALLOWED_SERVERS = process.env.ALLOWED_SERVERS || 'Yurian';
  process.env.ALLOWED_IPS = '';
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';

  const { createApiServer, queueManager } = require('../src/api');
  const { createClient } = require('../src/discord/client');
  const { buildEmbed } = require('../src/fetchQueues');

  queueManager.clearAll();

  const app = createApiServer(0);
  const server = app.server;
  assert.ok(server, 'API server should expose the underlying http server');

  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const healthResponse = await fetch(`${baseUrl}/health`);
  assert.equal(healthResponse.status, 200, 'health endpoint should respond');

  const payload = {
    type: 0,
    players: 3,
    instances: ['9025'],
    server: 'Yurian',
    matching_state: 1,
    roles: { TANK: 1, DD: 1, HEAL: 1 }
  };

  const postResponse = await fetch(`${baseUrl}/api/v1/servers/Yurian/queues`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.API_KEY}`
    },
    body: JSON.stringify(payload)
  });
  assert.equal(postResponse.status, 200, 'queue update should succeed');

  const queuesResponse = await fetch(`${baseUrl}/api/v1/servers/Yurian/queues`);
  assert.equal(queuesResponse.status, 200, 'queue read should succeed');
  const queuesJson = await queuesResponse.json();
  assert.equal(queuesJson.data.dungeons.length, 1, 'startup sanity should see one dungeon queue');

  const embed = buildEmbed({
    dungeons: queuesJson.data.dungeons,
    bgs: [],
    playersTotals: queuesJson.data.playersTotals,
  });
  assert.equal(embed.fields.length, 3, 'embed should render expected sections');

  const client = createClient();
  assert.equal(typeof client.login, 'function', 'discord client should be creatable without logging in');
  client.destroy();

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  console.log('Startup sanity passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
