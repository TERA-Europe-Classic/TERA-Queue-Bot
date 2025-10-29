const axios = require('axios');
const { resolveNames, getItemLevel, getLevel, getCategory } = require('./data/xmlData');

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
      playersTotals: dungeonRes.data?.playersTotals ? dungeonRes.data.playersTotals : undefined,
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

function formatList(items, nameWidth = null) {
  if (!Array.isArray(items) || items.length === 0) return '`no queues`';

  // First pass: collect all display names and calculate dynamic width based on active items
  const processedItems = items.map((it) => {
    if (typeof it === 'string') return { isString: true, content: it };
    const names = resolveNames(it?.instances, true);
    const displayNames = names.length > 0 ? names : [String(it.name || it.queue || it.id || it.code || 'Unknown')];
    const queued = pickNumber(it.queued ?? it.players ?? it.count);
    const wait = it.avgWait || it.average || it.wait || null;
    const qty = queued !== undefined ? queued.toString() : '-';
    const waitTxt = wait ? String(wait) : '';
    const rolesTxt = it.roles ? ` [🛡️:${it.roles.TANK || 0} ⚔️:${it.roles.DD || 0} 🪄:${it.roles.HEAL || 0}]` : '';
    
    return {
      displayNames,
      qty,
      waitTxt,
      rolesTxt,
      isString: false
    };
  });

  // Calculate width: use provided width, or calculate from this section's items
  const MAX_LINE_WIDTH = 75; // Safe limit for Discord code blocks
  const QTY_WIDTH = 3;
  const WAIT_WIDTH = 8;
  const ROLE_TEXT_LENGTH = 30; // Approximate length of role count text [🛡️:XX ⚔️:XX ✨:XX]
  const SPACING_AFTER_NAME = 2; // Space between name and qty
  const SPACING_AFTER_QTY = 1; // Space between qty and wait/roles
  
  let NAME_WIDTH;
  if (nameWidth !== null) {
    // Use provided global width
    NAME_WIDTH = nameWidth;
  } else {
    // Calculate from this section's items
    const allNames = processedItems
      .filter(item => !item.isString)
      .flatMap(item => item.displayNames);
    const maxNameLength = allNames.length > 0 ? Math.max(...allNames.map(n => n.length)) : 0;
    
    // Calculate available width for name (worst case: with wait time)
    const worstCaseWidth = SPACING_AFTER_NAME + QTY_WIDTH + SPACING_AFTER_QTY + WAIT_WIDTH + ROLE_TEXT_LENGTH;
    const availableNameWidth = MAX_LINE_WIDTH - worstCaseWidth;
    NAME_WIDTH = Math.min(maxNameLength, availableNameWidth);
  }

  // Second pass: format using calculated width
  const rows = processedItems.flatMap((item) => {
    if (item.isString) return item.content;
    
    return item.displayNames.map((name) => {
      // Truncate name to fit in calculated width
      const truncatedName = name.length > NAME_WIDTH ? name.slice(0, NAME_WIDTH - 1) + '…' : name;
      const paddedName = truncatedName.padEnd(NAME_WIDTH, ' ');
      
      // Format quantity with fixed width
      const paddedQty = item.qty.padEnd(QTY_WIDTH, ' ');
      
      // Format wait time with fixed width
      const waitDisplay = item.waitTxt ? `(${item.waitTxt})` : '';
      const paddedWait = waitDisplay.padEnd(WAIT_WIDTH, ' ');
      
      // Build the line with spacing - extra padding between name and qty
      const spaceAfterName = '  '; // Two spaces for better readability
      const spaceAfterQty = waitDisplay ? ' ' : '';
      return `${paddedName}${spaceAfterName}${paddedQty}${spaceAfterQty}${waitDisplay ? paddedWait : ''}${item.rolesTxt}`;
    });
  });

  let body = rows.join('\n');
  // Keep within ~1900 chars to leave room for backticks
  if (body.length > 1900) body = body.slice(0, 1897) + '…';
  return '```\n' + body + '\n```';
}

function sortByIlvlThenLevelThenId(items) {
  return [...items].sort((a, b) => {
    const ia = String((a.instances && a.instances[0]) || a.id || a.code || '');
    const ib = String((b.instances && b.instances[0]) || b.id || b.code || '');
    const aIlvl = getItemLevel(ia);
    const bIlvl = getItemLevel(ib);
    if (aIlvl !== bIlvl) return aIlvl - bIlvl;
    const aLvl = getLevel(ia);
    const bLvl = getLevel(ib);
    if (aLvl !== bLvl) return aLvl - bLvl;
    return ia.localeCompare(ib);
  });
}

function formatDungeonSections(items, nameWidth = null) {
  if (!Array.isArray(items) || items.length === 0) {
    return { endTxt: '`no queues`', lvlTxt: '`no queues`', endCount: 0, lvlCount: 0 };
  }

  const withCat = items.map((it) => {
    const id = String((it.instances && it.instances[0]) || it.id || it.code || '');
    const category = getCategory(id) || 'leveling';
    return { ...it, _id: id, _category: category };
  });

  const endgame = sortByIlvlThenLevelThenId(withCat.filter((x) => x._category === 'endgame'));
  const leveling = sortByIlvlThenLevelThenId(withCat.filter((x) => x._category !== 'endgame'));

  const endTxt = endgame.length ? formatList(endgame, nameWidth) : '`none`';
  const lvlTxt = leveling.length ? formatList(leveling, nameWidth) : '`none`';

  return { endTxt, lvlTxt, endCount: sumQueued(endgame), lvlCount: sumQueued(leveling) };
}

function dynamicColor(totalQueued) {
  // green if active, blue if moderate, grey if low
  if (totalQueued >= 50) return 0x2ecc71; // green
  if (totalQueued >= 10) return 0x3498db; // blue
  return 0x95a5a6; // gray
}

function buildEmbed(data) {
  const { dungeons, bgs, playersTotals, roles } = data;
  
  // Calculate global width across ALL sections (dungeons endgame, leveling, and battlegrounds)
  const MAX_LINE_WIDTH = 75;
  const QTY_WIDTH = 3;
  const WAIT_WIDTH = 8;
  const ROLE_TEXT_LENGTH = 30;
  const SPACING_AFTER_NAME = 1;
  const SPACING_AFTER_QTY = 1;
  const worstCaseWidth = SPACING_AFTER_NAME + QTY_WIDTH + SPACING_AFTER_QTY + WAIT_WIDTH + ROLE_TEXT_LENGTH;
  const availableNameWidth = MAX_LINE_WIDTH - worstCaseWidth;
  
  // Collect all names from all active sections
  const allSectionNames = [];
  
  // Dungeons (endgame and leveling)
  if (Array.isArray(dungeons) && dungeons.length > 0) {
    dungeons.forEach(item => {
      const names = resolveNames(item?.instances, true);
      if (names.length > 0) {
        allSectionNames.push(...names);
      }
    });
  }
  
  // Battlegrounds
  if (Array.isArray(bgs) && bgs.length > 0) {
    bgs.forEach(item => {
      const names = resolveNames(item?.instances, false); // BGs don't use level prefix
      if (names.length > 0) {
        allSectionNames.push(...names);
      }
    });
  }
  
  // Calculate global max name length
  const globalMaxNameLength = allSectionNames.length > 0 ? Math.max(...allSectionNames.map(n => n.length)) : 0;
  // Use global width if we have items, otherwise use available width as default
  const globalNameWidth = allSectionNames.length > 0 
    ? Math.min(globalMaxNameLength, availableNameWidth)
    : availableNameWidth;
  
  // Use global width for all sections
  const { endTxt, lvlTxt, endCount, lvlCount } = formatDungeonSections(dungeons, globalNameWidth);
  const totalDQueues = endCount + lvlCount;
  const totalBQueues = sumQueued(bgs);
  const totalPlayersD = playersTotals?.dungeons ?? totalDQueues;
  const totalPlayersB = playersTotals?.bgs ?? totalBQueues;
  const totalPlayers = totalPlayersD + totalPlayersB;
  const now = new Date();

  return {
    color: dynamicColor(totalPlayers),
    timestamp: now.toISOString(),
    fields: [
      { name: `🏰 Dungeons — Endgame: ${endCount}`, value: endTxt, inline: false },
      { name: `🏰 Dungeons — Leveling: ${lvlCount}`, value: lvlTxt, inline: false },
      { name: `⚔️ Battlegrounds — Players: ${totalPlayersB}`, value: formatList(bgs, globalNameWidth), inline: false },
    ],
    footer: { text: 'Use !track to auto-update' },
  };
}

module.exports = {
  fetchQueues,
  buildEmbed,
};
