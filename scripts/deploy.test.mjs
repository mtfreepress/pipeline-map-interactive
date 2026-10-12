import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('./deploy.mjs', import.meta.url));
function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'pipeline-deploy-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  for (const dir of ['deployment', 'dist/assets', 'dist/data', 'bin']) mkdirSync(join(cwd, dir), { recursive: true });
  writeFileSync(join(cwd, 'deployment/target.json'), JSON.stringify({ bucket: 'example-bucket', prefix: 'pipeline', distributionId: 'EXAMPLE', url: 'https://example.org/pipeline/index.html' }));
  const files = {};
  for (const [file, content] of Object.entries({ 'index.html': '<script src="./assets/app-123.js"></script>', 'assets/app-123.js': 'app', 'data/pipeline.geojson': '{}' })) {
    writeFileSync(join(cwd, 'dist', file), content);
    files[file] = createHash('sha256').update(content).digest('hex');
  }
  writeFileSync(join(cwd, 'dist/.production-build.json'), JSON.stringify({ files }));
  writeFileSync(join(cwd, 'bin/aws'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$AWS_TEST_LOG"\ncase "$*" in *assets*) exit "${AWS_TEST_FAIL:-0}";; esac\n', { mode: 0o755 });
  const env = { ...process.env, PATH: `${cwd}/bin:${process.env.PATH}`, AWS_TEST_LOG: `${cwd}/aws.log` };
  return { cwd, env, run: (args = [], extraEnv = {}) => spawnSync(process.execPath, [script, ...args], { cwd, env: { ...env, ...extraEnv }, encoding: 'utf8' }) };
}
test('plan is read-only, uploads entry last, preserves assets and assigns cache/MIME metadata', t => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PLAN ONLY/);
  assert.match(result.stdout, /application\/json/);
  assert.doesNotMatch(result.stdout, /application\/geo\+json/);
  assert.match(result.stdout, /31536000,immutable/);
  assert.match(result.stdout, /300,must-revalidate/);
  assert.ok(result.stdout.indexOf('dist/index.html') > result.stdout.indexOf('dist/assets/'));
  assert.doesNotMatch(result.stdout, /--delete|production-build\.json/);
  assert.throws(() => readFileSync(f.env.AWS_TEST_LOG));
});
test('apply uses only pipeline keys and stops before publishing HTML when an asset upload fails', t => {
  const f = fixture(t);
  const result = f.run(['--apply'], { AWS_TEST_FAIL: '1' });
  assert.notEqual(result.status, 0);
  const log = readFileSync(f.env.AWS_TEST_LOG, 'utf8');
  assert.match(log, /s3:\/\/example-bucket\/pipeline\/assets\//);
  assert.doesNotMatch(log, /index.html/);
});
test('apply uploads HTML last and invalidates only project mutable paths', t => {
  const f = fixture(t);
  const result = f.run(['--apply', '--invalidate']);
  assert.equal(result.status, 0, result.stderr);
  const lines = readFileSync(f.env.AWS_TEST_LOG, 'utf8').trim().split('\n');
  assert.match(lines.at(-2), /dist\/index.html/);
  assert.match(lines.at(-1), /create-invalidation/);
  assert.match(lines.at(-1), /\/pipeline\/data\/\*/);
  assert.doesNotMatch(lines.at(-1), /assets/);
});
test('changed build and unexpected extra files are rejected before any AWS call', t => {
  const f = fixture(t);
  writeFileSync(join(f.cwd, 'dist/index.html'), 'changed');
  assert.notEqual(f.run(['--apply']).status, 0);
  writeFileSync(join(f.cwd, 'dist/secrets.txt'), 'unexpected');
  assert.notEqual(f.run(['--apply']).status, 0);
  assert.throws(() => readFileSync(f.env.AWS_TEST_LOG));
});
test('Finder metadata is never uploaded, including files recorded in older receipts', t => {
  for (const recorded of [false, true]) {
    const f = fixture(t);
    const receiptPath = join(f.cwd, 'dist/.production-build.json');
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    for (const file of ['.DS_Store', 'data/.DS_Store']) {
      writeFileSync(join(f.cwd, 'dist', file), 'Finder metadata');
      if (recorded) receipt.files[file] = createHash('sha256').update('older metadata').digest('hex');
    }
    writeFileSync(receiptPath, JSON.stringify(receipt));
    const result = f.run(['--apply']);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(readFileSync(f.env.AWS_TEST_LOG, 'utf8'), /DS_Store/);
    assert.match(readFileSync(f.env.AWS_TEST_LOG, 'utf8'), /index.html/);
  }
});
test('production build refuses developer fallback and embeds only the explicit production token', t => {
  const f = fixture(t);
  const buildScript = fileURLToPath(new URL('./build-production.mjs', import.meta.url));
  writeFileSync(join(f.cwd, '.env.local'), 'VITE_MAPBOX_TOKEN=pk.development-fixture\n');
  writeFileSync(join(f.cwd, 'index.html'), '<html><script type="module" src="./main.js"></script></html>');
  writeFileSync(join(f.cwd, 'main.js'), 'document.body.textContent = import.meta.env.VITE_MAPBOX_TOKEN;');
  mkdirSync(join(f.cwd, 'public/data'), { recursive: true });
  writeFileSync(join(f.cwd, 'public/.DS_Store'), 'Finder metadata');
  writeFileSync(join(f.cwd, 'public/data/.DS_Store'), 'Finder metadata');
  const build = () => spawnSync(process.execPath, [buildScript], { cwd: f.cwd, env: { ...process.env, VITE_MAPBOX_TOKEN: '' }, encoding: 'utf8' });
  assert.notEqual(build().status, 0);
  writeFileSync(join(f.cwd, '.env.production.local'), 'VITE_MAPBOX_TOKEN=pk.production-fixture\n');
  const result = build();
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(readFileSync(join(f.cwd, 'dist/.production-build.json'), 'utf8'));
  assert.ok(Object.keys(receipt.files).every(file => !file.endsWith('.DS_Store')));
  const javascript = Object.keys(receipt.files).filter(file => file.endsWith('.js')).map(file => readFileSync(join(f.cwd, 'dist', file), 'utf8')).join('');
  assert.match(javascript, /pk.production-fixture/);
  assert.doesNotMatch(javascript, /pk.development-fixture/);
  assert.equal(f.run().status, 0);
});
