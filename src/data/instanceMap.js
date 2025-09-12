let idToName = {};
try {
  idToName = require('./instances.json');
} catch (_) {
  idToName = {};
}

const BLAST_GROUP = [
  '9087', '9088', '9089', '9071', '9072', '9093', '9094', '9076', '9073'
];

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
  // Special case: specific set of instances represents "Blast from the Past"
  if (asStrings.length === BLAST_GROUP.length) {
    const set = new Set(asStrings);
    const isBlast = BLAST_GROUP.every((id) => set.has(id));
    if (isBlast) return 'Blast from the Past';
  }
  return asStrings.map((id) => resolveInstanceName(id)).join(', ');
}

module.exports = {
  resolveInstanceName,
  resolveInstanceLabels,
};


