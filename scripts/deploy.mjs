import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.some(arg => !['--apply', '--invalidate'].includes(arg))) throw new Error('Usage: npm run deploy:plan -- [--apply] [--invalidate]');
const apply = args.includes('--apply');
const target = JSON.parse(readFileSync('deployment/target.json', 'utf8'));
if (!/^[a-z0-9][a-z0-9.-]+$/.test(target.bucket) || target.prefix !== 'pipeline') {
  throw new Error('Expected an S3 bucket and the dedicated pipeline prefix.');
}
const receipt = JSON.parse(readFileSync('dist/.production-build.json', 'utf8'));
// CloudFront compresses application/json, but not application/geo+json.
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.geojson': 'application/json', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.avif': 'image/avif', '.woff2': 'font/woff2' };
const currentFiles = [];
function inventory(directory, prefix = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const relative = prefix + entry.name;
    if (relative === '.production-build.json') continue;
    if (entry.isDirectory()) inventory(`${directory}/${entry.name}`, `${relative}/`);
    else if (entry.isFile()) currentFiles.push(relative);
    else throw new Error(`Unexpected build entry: ${relative}`);
  }
}
inventory('dist');
// Older receipts may include Finder metadata; it is never a deployable asset.
const receiptFiles = Object.keys(receipt.files).filter(file => file.split('/').at(-1) !== '.DS_Store');
if (currentFiles.length !== receiptFiles.length) throw new Error('Build files changed. Run build:production again.');
const files = currentFiles.sort((a, b) => (a === 'index.html') - (b === 'index.html') || a.localeCompare(b));
if (!files.includes('index.html') || !files.some(file => file.startsWith('assets/'))) throw new Error('Incomplete production build.');
const commands = files.map(file => {
  const extension = file.slice(file.lastIndexOf('.')).toLowerCase();
  if (!/^(index\.html|embed\.html|assets\/[\w.-]+|(?:data|photos)\/[\w./-]+)$/.test(file) || file.split('/').includes('..') || !types[extension]) {
    throw new Error(`Unexpected public file: ${file}`);
  }
  const hash = createHash('sha256').update(readFileSync(`dist/${file}`)).digest('hex');
  if (hash !== receipt.files[file]) throw new Error(`Build changed since production build: ${file}`);
  const cache = file.startsWith('assets/') ? 'public,max-age=31536000,immutable' : 'public,max-age=300,must-revalidate';
  return ['s3', 'cp', `dist/${file}`, `s3://${target.bucket}/${target.prefix}/${file}`, '--content-type', types[extension], '--cache-control', cache, '--only-show-errors'];
});
if (args.includes('--invalidate')) commands.push(['cloudfront', 'create-invalidation', '--distribution-id', target.distributionId, '--paths', '/pipeline/index.html', '/pipeline/embed.html', '/pipeline/data/*', '/pipeline/photos/*']);
console.log(`${apply ? 'Uploading' : 'PLAN ONLY'}: ${files.length} files; entry document last; existing assets retained.`);
for (const command of commands) {
  console.log(['aws', ...command].map(arg => JSON.stringify(arg)).join(' '));
  if (apply) {
    const result = spawnSync('aws', command, { stdio: 'inherit', env: { ...process.env, AWS_PAGER: '' } });
    if (result.error || result.status !== 0) throw new Error('AWS operation failed; stopping before further uploads.');
  }
}
console.log(`${apply ? 'Uploaded' : 'Planned target'}: ${target.url}`);
