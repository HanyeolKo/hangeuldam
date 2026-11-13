import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const target = process.env.FIXTURE_DIR || fileURLToPath(new URL('../.test-data/fixtures/', import.meta.url));
await mkdir(target, { recursive: true });
const { fixtures } = JSON.parse(await readFile(new URL('../tests/fixtures.json', import.meta.url)));
for (const fixture of fixtures) {
  const filename = path.join(target, fixture.file);
  let bytes = await readFile(filename).catch(() => null);
  if (!bytes || createHash('sha256').update(bytes).digest('hex') !== fixture.sha256) {
    const response = await fetch(fixture.source_url);
    if (!response.ok) throw new Error(`${fixture.file}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== fixture.sha256) throw new Error(`${fixture.file}: SHA-256 mismatch`);
    await writeFile(filename, bytes);
  }
  console.log(`${fixture.file}: verified`);
}
