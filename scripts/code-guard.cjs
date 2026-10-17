const { spawnSync } = require('node:child_process');
const path = require('node:path');

const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const checks = ['code:lines', 'code:duplicates', 'code:cycles', 'code:dead'];
let failed = false;

for (const check of checks) {
  console.log(`\n> ${check}`);
  const result = spawnSync(process.execPath, [npmCli, 'run', check], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}

process.exitCode = failed ? 1 : 0;
