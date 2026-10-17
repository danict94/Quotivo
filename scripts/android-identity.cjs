const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const variantName = process.argv[process.argv.indexOf('--variant') + 1];
const variants = require(path.join(root, 'app-variants.json'));
if (!['stable', 'dev'].includes(variantName) || !variants[variantName]) throw new Error('Use --variant stable or --variant dev.');
for (const [name, variant] of Object.entries(variants)) {
  for (const field of ['name', 'slug', 'androidPackage', 'scheme']) if (typeof variant[field] !== 'string' || !variant[field]) throw new Error(`Invalid ${field} for ${name}.`);
}
if (variants.stable.androidPackage === variants.dev.androidPackage || variants.stable.scheme === variants.dev.scheme) throw new Error('Dev and Stable identities must differ.');
const appJson = require(path.join(root, 'app.json')).expo;
if (appJson.android?.package || appJson.ios?.bundleIdentifier || appJson.name || appJson.slug || appJson.scheme) throw new Error('Identity must not be duplicated in app.json.');
const result = spawnSync(process.execPath, [path.join(root, 'node_modules', 'expo', 'bin', 'cli'), 'config', '--json'], { cwd: root, env: { ...process.env, APP_VARIANT: variantName }, encoding: 'utf8' });
if (result.status !== 0) throw new Error(`Expo config failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
const expo = JSON.parse(result.stdout);
const expected = variants[variantName];
const actual = { name: expo.name, slug: expo.slug, androidPackage: expo.android?.package, scheme: Array.isArray(expo.scheme) ? expo.scheme[0] : expo.scheme };
for (const field of Object.keys(expected)) if (actual[field] !== expected[field]) throw new Error(`Expo ${field} mismatch: expected ${expected[field]}, got ${actual[field] ?? 'missing'}.`);
if (expo.ios?.bundleIdentifier !== expected.androidPackage || expo.extra?.buildVariant !== variantName) throw new Error('Expo derived iOS identity or build variant mismatch.');
process.stdout.write(JSON.stringify({ variant: variantName, ...expected, version: expo.version, versionCode: expo.android?.versionCode }));
