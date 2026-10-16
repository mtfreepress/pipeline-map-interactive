import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { planPhotos, importPhotos } from './import-photos.mjs';
const exec = promisify(execFile);
const profiles = [{ id: 'fladager', name: 'Fladager' }];

test('maps the known filename spelling and sorts numerically', () => {
  const plan = planPhotos(['fladger-10.jpg', 'fladger-2.jpg', '.DS_Store', 'fladger-1.jpg'], profiles);
  assert.deepEqual(plan.map(photo => photo.key), ['fladager-1', 'fladager-2', 'fladager-10']);
});

test('rejects unknown IDs, duplicate order, malformed names and missing profiles', () => {
  for (const [files, error] of [
    [['unknown-1.jpg'], /Unknown profile/],
    [['fladager-1.jpg', 'fladger-01.png'], /Duplicate/],
    [['fladger-0.jpg'], /Invalid photo number/],
    [['fladger.jpg'], /Unexpected photo filename/],
    [[], /No photographs/],
  ]) assert.throws(() => planPhotos(files, profiles), error);
});

test('creates separate WebP sizes without touching originals and preserves manifest on a failed import', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'photo-import-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = join(dir, 'originals');
  const output = join(dir, 'processed');
  const manifestPath = join(dir, 'photos.json');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(input);
  const source = join(input, 'fladger-1.jpg');
  await exec('magick', ['-size', '2400x1200', 'gradient:navy-white', source]);
  const original = await readFile(source);
  const args = { input, output, manifestPath, profileList: profiles,
    details: { 'fladager-1': { alt: 'A blue gradient.', credit: 'Test credit' } }, log() {} };
  await importPhotos(args);
  assert.deepEqual(await readFile(source), original);
  const text = await readFile(manifestPath, 'utf8');
  const [photo] = JSON.parse(text).fladager;
  assert.equal(photo.width, 800);
  assert.equal(photo.height, 400);
  assert.equal(photo.fullWidth, 1600);
  assert.equal(photo.fullHeight, 800);
  assert.equal(photo.credit, 'Test credit');
  assert.equal((await readdir(output)).length, 2);
  assert.notEqual(photo.src, photo.fullSrc);
  await importPhotos(args);
  assert.equal(await readFile(manifestPath, 'utf8'), text);
  await writeFile(join(input, 'fladager-2.jpg'), 'broken image');
  args.details['fladager-2'] = { alt: 'Broken test image.', credit: '' };
  await assert.rejects(importPhotos(args));
  assert.equal(await readFile(manifestPath, 'utf8'), text);
  assert.deepEqual(await readFile(source), original);
});
