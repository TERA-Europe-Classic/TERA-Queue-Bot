const axios = require('axios');

// Internal API endpoints - these will be served by our own Express server
const API_BASE_URL = process.env.API_BASE_URL || 'https://localhost:443';
const SERVER_NAME = process.env.SERVER_NAME || 'Yurian';

const DUNGEON_URL = `${API_BASE_URL}/api/v1/servers/${SERVER_NAME}/queues/dungeons`;
const BG_URL = `${API_BASE_URL}/api/v1/servers/${SERVER_NAME}/queues/battlegrounds`;

async function fetchQueues() {
  try {
    const axiosConfig = {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000, // 5 second timeout
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: process.env.NODE_ENV === 'production' // Only reject in production
      })
    };
    
    const [dungeonRes, bgRes] = await Promise.all([
      axios.get(DUNGEON_URL, axiosConfig),
      axios.get(BG_URL, axiosConfig)
    ]);

    return {
      dungeons: dungeonRes.data?.data ?? [],
      bgs: bgRes.data?.data ?? [],
      raw: {
        dungeons: dungeonRes.data,
        bgs: bgRes.data,
      },
    };
  } catch (e) {
    throw new Error(`Failed to fetch queues: ${e.message}`);
  }
}

function pickNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sumQueued(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((acc, it) => {
    const q = pickNumber(it?.queued ?? it?.players ?? it?.count);
    return acc + (q ?? 0);
  }, 0);
}

function formatList(items) {
  if (!Array.isArray(items) || items.length === 0) return '`No data`';

  // Build a neat table-like list in a code block, truncated to fit field limits.
  const rows = items.map((it) => {
    if (typeof it === 'string') return it;
    const name = String(it.name || it.queue || it.id || it.code || 'Unknown');
    const queued = pickNumber(it.queued ?? it.players ?? it.count);
    const wait = it.avgWait || it.average || it.wait || null;
    const qty = queued !== undefined ? queued.toString() : '-';
    const waitTxt = wait ? String(wait) : '';

    // Fixed-width left column for name, then qty, then optional wait
    const left = name.length > 28 ? name.slice(0, 27) + '…' : name;
    const padded = left.padEnd(30, ' ');
    return `${padded} ${qty}${waitTxt ? `  (${waitTxt})` : ''}`;
  });

  let body = rows.join('\n');
  // Keep within ~950 chars to leave room for backticks
  if (body.length > 950) body = body.slice(0, 947) + '…';
  return '```\n' + body + '\n```';
}

function dynamicColor(totalQueued) {
  // green if active, blue if moderate, grey if low
  if (totalQueued >= 50) return 0x2ecc71; // green
  if (totalQueued >= 10) return 0x3498db; // blue
  return 0x95a5a6; // gray
}

function buildEmbed(data) {
  const { dungeons, bgs } = data;
  const totalD = sumQueued(dungeons);
  const totalB = sumQueued(bgs);
  const total = totalD + totalB;
  const now = new Date();

  return {
    color: dynamicColor(total),
    author: {
      name: 'TERA Queue — Yurian',
    },
    timestamp: now.toISOString(),
    fields: [
      { name: `🏰 Dungeons — Total: ${totalD}`, value: formatList(dungeons), inline: false },
      { name: `⚔️ Battlegrounds — Total: ${totalB}`, value: formatList(bgs), inline: false },
    ],
    footer: { text: 'Use !track to auto-update' },
  };
}

module.exports = {
  fetchQueues,
  buildEmbed,
};
