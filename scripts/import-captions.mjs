import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { profiles as people } from '../src/profiles.js';

const root = fileURLToPath(new URL('../', import.meta.url));

// Quoted commas, escaped quotes, multiline cells, CRLF and spreadsheet BOMs.
export function parseCSV(input) {
  const text = input.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', state = 'start';
  function endCell() { row.push(cell); cell = ''; state = 'start'; }
  function endRow() {
    endCell();
    if (row.some(value => value.trim())) rows.push(row);
    row = [];
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (state === 'quoted') {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else state = 'closed';
      } else cell += c;
      continue;
    }
    if (c === ',') { endCell(); continue; }
    if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
      continue;
    }
    if (state === 'closed') throw new Error('Unexpected text after a closing CSV quote.');
    if (c === '"') {
      if (state !== 'start') throw new Error('Unexpected quote in an unquoted CSV cell.');
      state = 'quoted';
    } else { cell += c; state = 'unquoted'; }
  }
  if (state === 'quoted') throw new Error('Unclosed quoted CSV cell.');
  if (row.length || cell || state !== 'start') endRow();
  return rows;
}

export function importCaptions(csv, profiles = people) {
  const [header, ...rows] = parseCSV(csv);
  if (!header) throw new Error('The captions CSV is empty.');
  const columns = header.map(value => value.trim());
  if (new Set(columns).size !== columns.length) throw new Error('Duplicate CSV column names.');
  const nameIndex = columns.indexOf('name');
  const captionIndex = columns.indexOf('caption');
  if (nameIndex < 0 || captionIndex < 0) throw new Error('CSV must contain name and caption columns.');
  const names = new Map();
  for (const profile of profiles) {
    names.set(profile.name, profile.id);
    names.set(profile.id, profile.id);
  }
  if (profiles.some(profile => profile.id === 'daniels-county')) names.set('Daniels County Images', 'daniels-county');
  const captions = new Map();
  for (const [index, row] of rows.entries()) {
    if (row.length !== columns.length) throw new Error(`CSV record ${index + 2} has ${row.length} cells; expected ${columns.length}. Quote captions containing commas.`);
    const name = row[nameIndex].trim();
    const id = names.get(name);
    if (!id) throw new Error(`Unknown profile name: ${JSON.stringify(name)}. Use an existing profile name or ID.`);
    if (captions.has(id)) throw new Error(`Duplicate caption for ${name} (${id}).`);
    const caption = row[captionIndex].trim();
    if (!caption) throw new Error(`Blank caption for ${name}.`);
    captions.set(id, caption);
  }
  const missing = profiles.filter(profile => !captions.has(profile.id));
  if (missing.length) throw new Error(`Missing captions: ${missing.map(profile => profile.name).join(', ')}.`);
  // Stable output order regardless of spreadsheet sorting. Never include addresses.
  return Object.fromEntries(profiles.map(profile => [profile.id, captions.get(profile.id)]));
}

export async function runImport({ input, output, check = false, profiles = people }) {
  const captions = importCaptions(await readFile(input, 'utf8'), profiles);
  const text = `${JSON.stringify(captions, null, 2)}\n`;
  let previous;
  try { previous = await readFile(output, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (check && previous !== text) throw new Error('Imported captions are out of date. Run npm run captions:import.');
  if (previous === text) return `Captions are up to date (${Object.keys(captions).length} profiles).`;
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, { flag: 'wx' });
    await rename(temporary, output);
  } finally { await rm(temporary, { force: true }); }
  return `Imported captions for ${Object.keys(captions).length} profiles into src/captions.json.`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const paths = args.filter(arg => !arg.startsWith('--'));
    if (paths.length > 1 || args.some(arg => arg.startsWith('--') && arg !== '--check')) {
      throw new Error('Usage: npm run captions:import -- [path/to/captions.csv] [--check]');
    }
    console.log(await runImport({
      input: paths.length ? resolve(paths[0]) : resolve(root, 'map-info-captions.csv'),
      output: resolve(root, 'src/captions.json'),
      check: args.includes('--check'),
    }));
  } catch (error) {
    console.error(`Caption import failed: ${error.message}`);
    process.exitCode = 1;
  }
}
