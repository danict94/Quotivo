const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceExtensions = new Set(['.js', '.cjs', '.mjs', '.jsx', '.ts', '.tsx']);
const excludedDirectories = new Set([
  '.git', '.expo', 'node_modules', 'build', 'dist', 'generated', 'android', 'ios',
]);
const results = [];

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) visit(path.join(directory, entry.name));
      continue;
    }
    if (!entry.isFile() || !sourceExtensions.has(path.extname(entry.name))) continue;
    const filePath = path.join(directory, entry.name);
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).length;
    if (lines > 400) results.push({ filePath, lines });
  }
}

visit(root);
results.sort((a, b) => b.lines - a.lines || a.filePath.localeCompare(b.filePath));
for (const result of results) {
  const severity = result.lines > 600 ? 'FAIL' : 'WARNING';
  console.log(`${severity} ${path.relative(root, result.filePath)}: ${result.lines} righe`);
}
if (results.length === 0) console.log('PASS Nessun file sorgente oltre 400 righe.');
process.exitCode = results.some((result) => result.lines > 600) ? 1 : 0;
