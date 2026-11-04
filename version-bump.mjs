// 用法：npm run bump 1.2.3 —— 同步 package.json / manifest.json / versions.json
import { readFileSync, writeFileSync } from 'node:fs';

const target = process.argv[2];
if (!target || !/^\d+\.\d+\.\d+$/.test(target)) {
  console.error('用法: node version-bump.mjs <x.y.z>');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const versions = JSON.parse(readFileSync('versions.json', 'utf8'));

versions[target] = manifest.minAppVersion;
manifest.version = target;
pkg.version = target;

writeFileSync('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
writeFileSync('versions.json', JSON.stringify(versions, null, 2) + '\n');
console.log('bumped to', target);
