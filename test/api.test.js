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

async function jsonFetch(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : undefined;
  return { response, body };
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

test('health endpoint reports ok', async () => {
  const { response, body } = await jsonFetch('/health');
  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
});

test('queue lifecycle works for a valid authenticated request', async () => {
  queueManager.clearAll();

  const payload = {
    type: 0,
    players: 3,
    instances: ['9025'],
    server: 'Yurian',
    matching_state: 1,
    roles: { TANK: 1, DD: 1, HEAL: 1 }
  };

  const post = await jsonFetch('/api/v1/servers/Yurian/queues', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-api-key'
    },
    body: JSON.stringify(payload)
  });

  assert.equal(post.response.status, 200);
  assert.equal(post.body.success, true);

  const get = await jsonFetch('/api/v1/servers/Yurian/queues');
  assert.equal(get.response.status, 200);
  assert.equal(get.body.data.dungeons.length, 1);
  assert.equal(get.body.data.dungeons[0].queued, 3);
  assert.deepEqual(get.body.data.dungeons[0].roles, { TANK: 1, DD: 1, HEAL: 1 });
});

test('write endpoints reject invalid API keys', async () => {
  const payload = {
    type: 0,
    players: 1,
    instances: ['9025'],
    server: 'Yurian',
    matching_state: 1,
  };

  const result = await jsonFetch('/api/v1/servers/Yurian/queues', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer wrong-key'
    },
    body: JSON.stringify(payload)
  });

  assert.equal(result.response.status, 401);
});

test('type-specific delete clears only the selected queue type', async () => {
  queueManager.clearAll();

  const headers = {
    'content-type': 'application/json',
    authorization: 'Bearer test-api-key'
  };

  await jsonFetch('/api/v1/servers/Yurian/queues', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 0,
      players: 2,
      instances: ['9025'],
      server: 'Yurian',
      matching_state: 1,
      roles: { TANK: 1, DD: 1, HEAL: 0 }
    })
  });

  await jsonFetch('/api/v1/servers/Yurian/queues', {
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

  const del = await jsonFetch('/api/v1/servers/Yurian/queues/dungeons', {
    method: 'DELETE',
    headers: { authorization: 'Bearer test-api-key' }
  });

  assert.equal(del.response.status, 200);

  const get = await jsonFetch('/api/v1/servers/Yurian/queues');
  assert.equal(get.body.data.dungeons.length, 0);
  assert.equal(get.body.data.bgs.length, 1);
});
