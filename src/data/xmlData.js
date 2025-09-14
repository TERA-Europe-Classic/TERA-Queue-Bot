const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const XML_PATH = path.join(__dirname, 'DungeonMatching.xml');

function loadXml() {
  const xml = fs.readFileSync(XML_PATH, 'utf8');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
  return parser.parse(xml);
}

function normalizeArray(x) {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

function buildIndex() {
  const doc = loadXml();
  const root = doc.DungeonMatching || {};

  const dungeonsRaw = normalizeArray(root.Dungeon);
  const support = root.SupportMatching || {};
  const supportList = normalizeArray(support.MatchingDungeon).map((d) => String(d.id));

  const idToMeta = {};
  for (const d of dungeonsRaw) {
    const id = String(d.id);
    const name = String(d.name);
    const level = Number(d.dungeonLevel);
    const minLevel = Number(d.dungeonMinLevel);
    const maxLevel = Number(d.dungeonMaxLevel);
    const ilvl = Number(d.minItemLevel);
    const inSupport = supportList.includes(id);
    const category = level >= 60 && (ilvl && Number.isFinite(ilvl) ? ilvl : 0) >= 138 ? 'endgame' : (inSupport ? 'leveling' : (level >= 60 ? 'endgame' : 'leveling'));

    idToMeta[id] = { id, name, level, minLevel, maxLevel, ilvl, category };
  }

  // Add SupportMatching group meta (Blast from the Past, id=9999) if present
  if (support && String(support.id)) {
    const sid = String(support.id);
    const minLevel = Number(support.dungeonMinLevel);
    const maxLevel = Number(support.dungeonMaxLevel);
    const level = Number.isFinite(minLevel) ? minLevel : undefined;
    const ilvl = 0; // UI/queue grouping only
    idToMeta[sid] = {
      id: sid,
      name: 'Blast from the Past',
      level: level,
      minLevel: minLevel,
      maxLevel: maxLevel,
      ilvl,
      category: 'leveling',
    };
  }

  return { idToMeta, supportIds: new Set(supportList) };
}

const { idToMeta, supportIds } = buildIndex();

function getMeta(id) {
  return idToMeta[String(id)];
}

function getName(id) {
  return getMeta(id)?.name || String(id);
}

function getLevel(id) {
  return getMeta(id)?.level ?? Number.POSITIVE_INFINITY;
}

function getItemLevel(id) {
  const v = getMeta(id)?.ilvl;
  return Number.isFinite(v) ? v : Number.POSITIVE_INFINITY;
}

function getCategory(id) {
  const c = getMeta(id)?.category;
  return c ? String(c).toLowerCase() : undefined;
}

function getDisplayName(id, includeLevel = false) {
  const base = getName(id);
  if (!includeLevel) return base;
  const lvl = getLevel(id);
  return Number.isFinite(lvl) ? `[${lvl}] ${base}` : base;
}

function resolveNames(ids, includeLevel = false) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  return ids.map((id) => getDisplayName(id, includeLevel));
}

module.exports = {
  getMeta,
  getName,
  getLevel,
  getItemLevel,
  getCategory,
  getDisplayName,
  resolveNames,
  supportIds,
};


