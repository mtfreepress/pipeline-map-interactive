import { existsSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import { parseEnv } from 'node:util';

// Never silently use the developer's .env.local token for a release.
if (!process.env.VITE_MAPBOX_TOKEN && !existsSync('.env.production.local')) {
  throw new Error('Set VITE_MAPBOX_TOKEN in the build environment or create .env.production.local with the production public token.');
}
const token = process.env.VITE_MAPBOX_TOKEN || parseEnv(readFileSync('.env.production.local', 'utf8')).VITE_MAPBOX_TOKEN;
if (!token?.startsWith('pk.') || token.includes('placeholder')) {
  throw new Error('A production public Mapbox token (pk.) is required.');
}
await build({ mode: 'production', define: { 'import.meta.env.VITE_MAPBOX_TOKEN': JSON.stringify(token) } });
const files = {};
function inventory(directory, prefix = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const relative = prefix + entry.name;
    if (entry.isDirectory()) inventory(`${directory}/${entry.name}`, `${relative}/`);
    else files[relative] = createHash('sha256').update(readFileSync(`${directory}/${entry.name}`)).digest('hex');
  }
}
inventory('dist');
// Local release receipt: never uploaded, contains no token.
writeFileSync('dist/.production-build.json', JSON.stringify({ builtAt: new Date().toISOString(), files }, null, 2));
console.log('Production build ready. Preview dist/ before applying the deployment plan.');
