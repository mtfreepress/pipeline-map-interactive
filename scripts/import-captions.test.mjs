import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importCaptions, parseCSV, runImport } from './import-captions.mjs';

const profiles = [
  { id: 'jerry-arnold', name: 'Jerry Arnold' },
  { id: 'daniels-county', name: 'Daniels County' },
];
const csv = 'name,address,caption\r\nJerry Arnold,Private address,"A comma, a ""quote"", and\na second line."\r\nDaniels County Images,,County caption.\r\n';

test('spreadsheet CSV preserves punctuation and multiline captions, strips BOM, and omits addresses', () => {
  assert.deepEqual(importCaptions(`\uFEFF${csv}`, profiles), {
    'jerry-arnold': 'A comma, a "quote", and\na second line.',
    'daniels-county': 'County caption.',
  });
});

test('profile IDs and canonical county names also work, in any row/column order', () => {
  const result = importCaptions('caption,name\nCounty,Daniels County\nJerry,jerry-arnold', profiles);
  assert.deepEqual(Object.keys(result), ['jerry-arnold', 'daniels-county']);
  assert.equal(result['jerry-arnold'], 'Jerry');
});

test('rejects ambiguous or incomplete imports', () => {
  for (const [source, message] of [
    ['', /empty/],
    ['name,address\nJerry Arnold,Address', /name and caption/],
    ['name,caption,caption\nJerry Arnold,A,B', /Duplicate CSV column/],
    ['name,caption\nJerry Arnld,Caption', /Unknown profile/],
    ['name,caption\nJerry Arnold,', /Blank caption/],
    ['name,caption\nJerry Arnold,Caption', /Missing captions: Daniels County/],
    ['name,caption\nJerry Arnold,A\njerry-arnold,B', /Duplicate caption/],
    ['name,caption\nJerry Arnold,Unquoted,comma', /expected 2/],
  ]) assert.throws(() => importCaptions(source, profiles), message);
});

test('rejects malformed quotes and handles empty cells and blank lines', () => {
  assert.throws(() => parseCSV('name,caption\nJerry,"unfinished'), /Unclosed/);
  assert.throws(() => parseCSV('name,caption\nJerry,"finished"extra'), /Unexpected text/);
  assert.throws(() => parseCSV('name,caption\nJerry,un"quoted'), /Unexpected quote/);
  assert.deepEqual(parseCSV('a,b,c\n\n"one",,"three"\n'), [['a', 'b', 'c'], ['one', '', 'three']]);
});

test('check mode and failed imports leave the previous output intact; importing is repeatable', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'pipeline-captions-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = join(dir, 'captions.csv');
  const output = join(dir, 'captions.json');
  await writeFile(input, csv);
  await writeFile(output, 'previous output');
  await assert.rejects(runImport({ input, output, profiles, check: true }), /out of date/);
  assert.equal(await readFile(output, 'utf8'), 'previous output');
  await runImport({ input, output, profiles });
  const imported = await readFile(output, 'utf8');
  assert.match(await runImport({ input, output, profiles }), /up to date/);
  assert.match(await runImport({ input, output, profiles, check: true }), /up to date/);
  await writeFile(input, 'name,caption\nUnknown,Caption');
  await assert.rejects(runImport({ input, output, profiles }), /Unknown profile/);
  assert.equal(await readFile(output, 'utf8'), imported);
  await assert.rejects(runImport({ input: join(dir, 'missing.csv'), output, profiles }), /ENOENT/);
  assert.equal(await readFile(output, 'utf8'), imported);
});
