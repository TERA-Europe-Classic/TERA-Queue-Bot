const test = require('node:test');
const assert = require('assert/strict');

process.env.API_KEY = 'test-api-key';
process.env.ALLOWED_SERVERS = 'Yurian';
process.env.ALLOWED_IPS = '';
process.env.NODE_ENV = 'test';

const { createApiServer, queueManager } = require('../src/api');

let app;
let server;
let baseUrl;

function freshFetchQueuesModule() {
  delete require.cache[require.resolve('../src/fetchQueues')];
  return require('../src/fetchQueues');
}

test.before(async () => {
  queueManager.clearAll();
  app = createApiServer(0);
  server = app.server;
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('fetchQueues reads dungeon and battleground data from the internal API', async () => {
  queueManager.clearAll();

  const headers = {
    'content-type': 'application/json',
    authorization: 'Bearer test-api-key'
  };

  await fetch(`${baseUrl}/api/v1/servers/Yurian/queues`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 0,
      players: 3,
      instances: ['9025'],
      server: 'Yurian',
      matching_state: 1,
      roles: { TANK: 1, DD: 1, HEAL: 1 }
    })
  });

  await fetch(`${baseUrl}/api/v1/servers/Yurian/queues`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 1,
      players: 10,
      instances: ['5'],
      server: 'Yurian',
      matching_state: 1
    })
  });

  process.env.API_BASE_URL = baseUrl;
  process.env.SERVER_NAME = 'Yurian';

  const { fetchQueues, buildEmbed } = freshFetchQueuesModule();
  const result = await fetchQueues();

  assert.equal(result.dungeons.length, 1);
  assert.equal(result.bgs.length, 1);

  const embed = buildEmbed(result);
  assert.equal(embed.fields.length, 3);
  assert.match(embed.fields[0].name, /Dungeons/);
  assert.match(embed.fields[2].name, /Battlegrounds/);
});
