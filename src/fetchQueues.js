const axios = require('axios');

const DUNGEON_URL = 'https://tera.digitalsavior.fr/matching/Yurian/dungeon';
const BG_URL = 'https://tera.digitalsavior.fr/matching/Yurian/bg';

async function fetchQueues() {
  try {
    const [dungeonRes, bgRes] = await Promise.all([
      axios.get(DUNGEON_URL, { headers: { 'Content-Type': 'application/json' } }),
      axios.get(BG_URL, { headers: { 'Content-Type': 'application/json' } })
    ]);

    return {
      dungeons: dungeonRes.data?.dungeons ?? [],
      bgs: bgRes.data?.bgs ?? [],
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
      icon_url: 'https://static.wikia.nocookie.net/tera_gamepedia/images/6/6a/TERA_Icon.png',
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
