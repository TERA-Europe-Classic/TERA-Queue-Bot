const fs = require('fs');
const path = require('path');
const vm = require('vm');

function collectJsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

const root = path.join(__dirname, '..', 'src');
const files = collectJsFiles(root);

for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  try {
    new vm.Script(code, { filename: file });
  } catch (error) {
    console.error(`Syntax error in ${path.relative(process.cwd(), file)}`);
    throw error;
  }
}

console.log(`Syntax OK: ${files.length} files`);
