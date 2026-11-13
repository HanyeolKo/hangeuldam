// Package the pinned, patched Studio build without duplicating the common WASM.
import { cp, readFile, readdir, rm, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/vendor-studio.mjs /absolute/path/to/dist');
await readFile(path.join(source, 'index.html')); // Validate the input before replacing owned output.
const destination = path.join(root, 'public/studio');
await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
const digest = data => createHash('sha256').update(data).digest('hex');
const commonHash = digest(await readFile(path.join(root, 'public/vendor/rhwp_bg.wasm')));
const assets = path.join(destination, 'assets');
const names = await readdir(assets);
const duplicate = names.find(name => /^rhwp_bg-.*\.wasm$/.test(name));
if (!duplicate || digest(await readFile(path.join(assets, duplicate))) !== commonHash) throw new Error('Studio/core WASM mismatch');
let replaced = 0;
for (const name of names.filter(name => name.endsWith('.js'))) {
  const filename = path.join(assets, name), sourceText = await readFile(filename, 'utf8');
  if (sourceText.includes(duplicate)) {
    replaced += sourceText.split(duplicate).length - 1;
    await writeFile(filename, sourceText.replaceAll(duplicate, '../../vendor/rhwp_bg.wasm'));
  }
}
if (replaced !== 2) throw new Error(`Unexpected WASM reference count: ${replaced}`);
await rm(path.join(assets, duplicate));
await mkdir(path.join(root, 'vendor-sources'), { recursive: true });
await writeFile(path.join(root, 'vendor-sources/packaging.json'), JSON.stringify({
  sharedWasm: 'public/vendor/rhwp_bg.wasm', sha256: commonHash, replacedReferences: replaced,
  operation: 'Only equivalent WASM URLs were changed. See scripts/vendor-studio.mjs.',
}, null, 2) + '\n');
console.log('Studio copied; common WASM verified and shared.');
