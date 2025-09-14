const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const DUNGEON_XML_PATH = path.join(__dirname, 'DungeonMatching.xml');
const BG_XML_PATH = path.join(__dirname, 'BattleFieldData.xml');
const BG_STR_XML_PATH = path.join(__dirname, 'StrSheet_BattleField-00000.xml');

function loadXmlFile(filePath) {
  const xml = fs.readFileSync(filePath, 'utf8');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
  return parser.parse(xml);
}

function normalizeArray(x) {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

function buildIndex() {
  // Dungeons
  const dDoc = loadXmlFile(DUNGEON_XML_PATH);
  const root = dDoc.DungeonMatching || {};

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

  // Battlegrounds
  const bDoc = loadXmlFile(BG_XML_PATH);
  const bRoot = bDoc.BattleFieldData || {};
  const bListRaw = normalizeArray(bRoot.BattleField);

  // BG String sheet
  let bgStringMap = {};
  try {
    const sDoc = loadXmlFile(BG_STR_XML_PATH);
    const sRoot = sDoc['StrSheet_BattleField'] || {};
    const strings = normalizeArray(sRoot.String);
    bgStringMap = strings.reduce((acc, it) => {
      if (it && it.id != null && it.string != null) acc[String(it.id)] = String(it.string);
      return acc;
    }, {});
  } catch (_) {
    bgStringMap = {};
  }

  const idToBGMeta = {};
  for (const bf of bListRaw) {
    if (!bf || bf.id == null) continue;
    const id = String(bf.id);
    const nameId = bf.name != null ? String(bf.name) : undefined;
    const name = nameId ? (bgStringMap[nameId] || nameId) : id;
    const common = bf.CommonData || {};
    const minLevel = common.minLevel != null ? Number(common.minLevel) : undefined;
    const maxLevel = common.maxLevel != null ? Number(common.maxLevel) : undefined;
    idToBGMeta[id] = { id, nameId, name, minLevel, maxLevel, category: 'battleground' };
  }

  return { idToMeta, idToBGMeta, supportIds: new Set(supportList) };
}

const { idToMeta, idToBGMeta, supportIds } = buildIndex();

function getMeta(id) {
  const key = String(id);
  return idToMeta[key] || idToBGMeta[key];
}

function getName(id) {
  return getMeta(id)?.name || String(id);
}

function getLevel(id) {
  const meta = getMeta(id);
  if (!meta) return Number.POSITIVE_INFINITY;
  if (meta.level != null) return meta.level; // dungeons
  if (meta.minLevel != null) return meta.minLevel; // battlegrounds fallback
  return Number.POSITIVE_INFINITY;
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
  const key = String(id);
  if (idToMeta[key]) { // dungeon -> show [level]
    const lvl = getLevel(id);
    return Number.isFinite(lvl) ? `[${lvl}] ${base}` : base;
  }
  // battlegrounds: no level prefix
  return base;
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


