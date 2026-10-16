import { readdir, readFile, writeFile, mkdir, mkdtemp, copyFile, rename, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { profiles } from '../src/profiles.js';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
export const settings = { preview: 800, full: 1600, previewQuality: 80, fullQuality: 85, version: 1 };
const aliases = { fladger: 'fladager' };

export function planPhotos(filenames, profileList = profiles) {
  const ids = new Set(profileList.map(profile => profile.id));
  const seen = new Set();
  const plan = [];
  for (const filename of filenames) {
    if (filename.startsWith('.')) continue;
    const match = /^([a-z0-9-]+)-(\d+)\.(jpe?g|png|tiff?|webp)$/i.exec(filename);
    if (!match) throw new Error(`Unexpected photo filename: ${filename}. Use profile-id-number.jpg.`);
    const id = aliases[match[1]] || match[1];
    if (!ids.has(id)) throw new Error(`Unknown profile ID in ${filename}: ${id}`);
    const order = Number(match[2]);
    if (!Number.isSafeInteger(order) || order < 1) throw new Error(`Invalid photo number: ${filename}`);
    const key = `${id}-${order}`;
    if (seen.has(key)) throw new Error(`Duplicate photo order for ${key}.`);
    seen.add(key);
    plan.push({ filename, id, order, key });
  }
  const missing = [...ids].filter(id => !plan.some(photo => photo.id === id));
  if (missing.length) throw new Error(`No photographs for: ${missing.join(', ')}`);
  return plan.sort((a, b) => a.id.localeCompare(b.id) || a.order - b.order);
}

export async function importPhotos({ input, output, manifestPath, details, profileList = profiles, log = console.log }) {
  const plan = planPhotos(await readdir(input), profileList);
  for (const photo of plan) {
    if (!details[photo.key]?.alt?.trim()) throw new Error(`Add descriptive alt text for ${photo.key} in src/photo-details.json.`);
  }
  const { stdout: version } = await exec('magick', ['-version']);
  const scratch = await mkdtemp(join(tmpdir(), 'pipeline-photos-'));
  const manifest = Object.fromEntries(profileList.map(profile => [profile.id, []]));
  let originalBytes = 0, previewBytes = 0, fullBytes = 0;
  const outputs = [];
  try {
    for (const photo of plan) {
      const source = join(input, photo.filename);
      const original = await readFile(source);
      originalBytes += original.length;
      // Changing an original or conversion settings produces a fresh browser-cache URL.
      const hash = createHash('sha256').update(original).update(JSON.stringify(settings)).update(version).digest('hex').slice(0, 12);
      const stem = `${photo.key}-${hash}`;
      const preview = `${stem}-preview.webp`;
      const full = `${stem}-full.webp`;
      log(`Processing ${photo.filename}${photo.filename.startsWith('fladger-') ? ' → fladager' : ''}`);
      const cached = await Promise.all([preview, full].map(filename =>
        stat(join(output, filename)).then(info => info.isFile()).catch(() => false)));
      if (cached.every(Boolean)) {
        for (const filename of [preview, full]) await copyFile(join(output, filename), join(scratch, filename));
      } else {
        await exec('magick', [
          `${source}[0]`, '-auto-orient', '-colorspace', 'sRGB', '-strip',
          '(', '+clone', '-resize', `${settings.preview}x${settings.preview}>`, '-quality', String(settings.previewQuality),
          '-define', 'webp:method=6', '-write', join(scratch, preview), '+delete', ')',
          '-resize', `${settings.full}x${settings.full}>`, '-quality', String(settings.fullQuality),
          '-define', 'webp:method=6', join(scratch, full),
        ]);
      }
      const { stdout: dimensions } = await exec('magick', ['identify', '-format', '%w %h\n', join(scratch, preview), join(scratch, full)]);
      const [[width, height], [fullWidth, fullHeight]] = dimensions.trim().split('\n').map(line => line.split(' ').map(Number));
      let credit = details[photo.key].credit;
      if (credit === undefined) {
        const { stdout } = await exec('magick', ['identify', '-format', '%[EXIF:Artist]', source]);
        credit = stdout.trim();
      }
      // All processing completes before the manifest is replaced. Originals are read only.
      if (createHash('sha256').update(await readFile(source)).digest('hex') !== createHash('sha256').update(original).digest('hex')) {
        throw new Error(`Original changed during processing: ${photo.filename}. Run the import again.`);
      }
      manifest[photo.id].push({
        id: photo.key,
        src: `./photos/processed/${preview}`,
        fullSrc: `./photos/processed/${full}`,
        width, height, fullWidth, fullHeight,
        alt: details[photo.key].alt.trim(),
        ...(credit ? { credit } : {}),
      });
      previewBytes += (await stat(join(scratch, preview))).size;
      fullBytes += (await stat(join(scratch, full))).size;
      outputs.push(preview, full);
    }
    await mkdir(output, { recursive: true });
    for (const filename of outputs) await copyFile(join(scratch, filename), join(output, filename));
    const temporaryManifest = `${manifestPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryManifest, JSON.stringify(manifest, null, 2) + '\n');
      await rename(temporaryManifest, manifestPath);
    } finally { await rm(temporaryManifest, { force: true }); }
  } finally { await rm(scratch, { recursive: true, force: true }); }
  return { photos: plan.length, originalBytes, previewBytes, fullBytes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || args.some(arg => arg.startsWith('--'))) throw new Error('Usage: npm run photos:import -- [source-directory]');
    const result = await importPhotos({
      input: args.length ? resolve(args[0]) : join(root, 'pictures-pipeline-story'),
      output: join(root, 'public/photos/processed'),
      manifestPath: join(root, 'src/photos.json'),
      details: JSON.parse(await readFile(join(root, 'src/photo-details.json'), 'utf8')),
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Photo import failed: ${error.message}`);
    process.exitCode = 1;
  }
}
