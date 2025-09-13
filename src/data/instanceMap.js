let idToName = {};
try {
  idToName = require('./instances.json');
} catch (_) {
  idToName = {};
}

const BLAST_GROUP = [
  '9087', '9088', '9089', '9071', '9072', '9093', '9094', '9076', '9073'
];

const DEBUG_BFP = process.env.DEBUG_BFP === 'true';

function resolveInstanceName(id) {
  const key = String(id);
  const value = idToName[key];
  if (!value) return key;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.name) return String(value.name);
  return key;
}

function resolveInstanceLabels(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  const asStrings = ids.map((x) => String(x));
  if (DEBUG_BFP) console.log('[instanceMap] Input IDs:', asStrings);
  // Special case: if all classic IDs are present, label as Blast from the Past
  {
    const set = new Set(asStrings);
    const isBlast = BLAST_GROUP.every((id) => set.has(id));
    if (isBlast) {
      if (DEBUG_BFP) console.log('[instanceMap] Detected Blast from the Past', asStrings);
      return 'Blast from the Past';
    }
    if (DEBUG_BFP) console.log('[instanceMap] Not BFTP, ids=', asStrings);
  }
  return asStrings.map((id) => resolveInstanceName(id)).join(', ');
}

module.exports = {
  resolveInstanceName,
  resolveInstanceLabels,
};


