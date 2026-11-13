import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = path.resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const destination = path.resolve(process.argv[2] || '.test-data/artifact');
const repository = process.env.GITHUB_REPOSITORY;
const commit = process.env.GITHUB_SHA;
const runId = process.env.GITHUB_RUN_ID;
const attempt = Number(process.env.GITHUB_RUN_ATTEMPT);
const workflowRef = process.env.GITHUB_WORKFLOW_REF;
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '') ||
    !/^[a-f0-9]{40}$/.test(commit || '') || !/^\d+$/.test(runId || '') ||
    !Number.isSafeInteger(attempt) || attempt < 1 ||
    workflowRef !== `${repository}/.github/workflows/ci.yml@refs/heads/main`) {
  throw new Error('Packaging requires a main-branch CI run with complete GitHub metadata.');
}
if (destination === source || destination.startsWith(source + path.sep)) {
  throw new Error('Artifact output must be outside public/.');
}
await mkdir(path.dirname(destination), { recursive: true });
await mkdir(destination); // Do not overwrite an existing directory.
const manifest = {
  schema_version: 1,
  artifact_name: 'hangeuldam-static',
  repository,
  commit_sha: commit,
  run_id: runId,
  run_attempt: attempt,
  workflow_ref: workflowRef,
  files: [],
};
let bytes = 0;
async function visit(directory, relative = '') {
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name.startsWith('.') || /[\\\x00-\x1f\x7f]/.test(entry.name)) {
      throw new Error(`Unexpected static filename: ${entry.name}`);
    }
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    const current = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(current, name);
    } else if (entry.isFile() && !(await lstat(current)).isSymbolicLink()) {
      const content = await readFile(current);
      bytes += content.length;
      if (content.length > 80 * 1024 * 1024 || bytes > 400 * 1024 * 1024 || manifest.files.length >= 10000) {
        throw new Error('Static artifact exceeds the size or file count limit.');
      }
      const output = path.join(destination, 'public', name);
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, content);
      manifest.files.push({ path: `public/${name}`, size: content.length, sha256: createHash('sha256').update(content).digest('hex') });
    } else {
      throw new Error(`Only regular static files are allowed: ${name}`);
    }
  }
}
await visit(source);
if (manifest.files.some(file => file.path === 'public/build-info.json')) {
  throw new Error('public/build-info.json is reserved for CI release metadata.');
}
const buildInfo = Buffer.from(JSON.stringify({ schema_version: 1, commit_sha: commit, run_id: runId, run_attempt: attempt }) + '\n');
await writeFile(path.join(destination, 'public/build-info.json'), buildInfo);
manifest.files.push({ path: 'public/build-info.json', size: buildInfo.length, sha256: createHash('sha256').update(buildInfo).digest('hex') });
manifest.files.sort((a, b) => a.path.localeCompare(b.path));
await writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Packaged ${manifest.files.length} static files for ${commit}.`);
