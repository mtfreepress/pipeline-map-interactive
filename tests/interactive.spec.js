import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const empty = { type: 'FeatureCollection', features: [] };
const locations = JSON.parse(readFileSync(new URL('../public/data/people.geojson', import.meta.url), 'utf8'));
const pipeline = JSON.parse(readFileSync(new URL('../public/data/pipeline.geojson', import.meta.url), 'utf8'));
const firstPersonCoordinates = locations.features.find((feature) => feature.properties.id === 'demo-a').geometry.coordinates;
const routeCoordinates = pipeline.features.flatMap(({ geometry }) =>
  geometry.type === 'LineString' ? geometry.coordinates : geometry.coordinates.flat());

test.beforeEach(async ({ page }) => {
  // Test-only access to inspect actual rendered sources/layers and click their centers.
  // No test globals or hooks are shipped in the application.
  await page.route('**/src/map.js', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('map.touchZoomRotate.disableRotation();',
      'window.__testMap = map; map.touchZoomRotate.disableRotation();');
    await route.fulfill({ response, body });
  });
  // The actual Mapbox renderer and application layers run; only the remote style is replaced.
  await page.route(/https:\/\/[^/]*mapbox\.com\//, async (route) => {
    if (route.request().url().includes('/styles/v1/')) {
      await route.fulfill({ json: {
        version: 8,
        sources: { 'test-water': { type: 'geojson', data: empty } },
        layers: [
          { id: 'local-background', type: 'background', paint: { 'background-color': '#e6e9e1' } },
          { id: 'water', type: 'fill', source: 'test-water', paint: { 'fill-color': '#cccccc' } },
          { id: 'waterway', type: 'line', source: 'test-water', minzoom: 8, paint: { 'line-color': '#cccccc', 'line-width': 0.75 } },
        ],
      } });
    } else await route.fulfill({ json: {} });
  });
});

async function openMap(page) {
  await page.goto('/');
  await expect(page.locator('#reset-map')).toBeEnabled();
  await expect(page.locator('.mapboxgl-canvas')).toHaveCount(1);
}

test('desktop overview fits Montana beside the panel and applies local water colors', async ({ page }) => {
  await openMap(page);
  const overview = await page.evaluate(() => {
    const map = window.__testMap;
    const stage = document.querySelector('.map-stage').getBoundingClientRect();
    const panel = document.querySelector('#intro-panel').getBoundingClientRect();
    const corners = [[-116.1, 44.3], [-103.95, 49.1]].map((coordinate) => map.project(coordinate));
    return {
      stateVisible: corners.every((point) => point.x >= 0 && point.x < panel.left - stage.left && point.y >= 0 && point.y < stage.height),
      easternContext: map.getBounds().getEast() > -103.95,
      water: map.getPaintProperty('water', 'fill-color'),
      waterway: map.getPaintProperty('waterway', 'line-color'),
      minZoom: map.getLayer('waterway').minzoom,
      width: map.getPaintProperty('waterway', 'line-width'),
    };
  });
  expect(overview.stateVisible).toBe(true);
  expect(overview.easternContext).toBe(true);
  expect(overview.water).toBe('#acd3e5');
  expect(overview.waterway).toBe('#6ba4c1');
  expect(overview.minZoom).toBe(8);
  expect(overview.width).toBe(0.75);
});

test('map-point clicks select one persistent ring, keep one map, and return focus on close', async ({ page }) => {
  await openMap(page);
  const canvas = page.locator('.mapboxgl-canvas');
  const point = await page.evaluate((coordinates) => {
    const p = window.__testMap.project(coordinates);
    return { x: p.x, y: p.y };
  }, firstPersonCoordinates);
  await canvas.click({ position: point });
  await expect(page.locator('#person-name')).toHaveText('Demo person A');
  await expect.poll(() => page.evaluate(() => window.__testMap.queryRenderedFeatures({ layers: ['people-selected-ring'] }).map((feature) => feature.properties.id))).toEqual(['demo-a']);
  await page.selectOption('#person-picker', 'demo-c');
  await expect.poll(() => page.evaluate(() => window.__testMap.queryRenderedFeatures({ layers: ['people-selected-ring'] }).map((feature) => feature.properties.id))).toEqual(['demo-c']);
  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect.poll(() => page.evaluate(() => window.__testMap.queryRenderedFeatures({ layers: ['people-selected-ring'] }).length)).toBe(0);
  await canvas.click({ position: point });
  await page.getByRole('button', { name: 'Close person details' }).click();
  await expect(canvas).toBeFocused();
  await expect(canvas).toHaveCount(1);
});

test('real map loads without runtime errors; gallery loads on demand and wraps', async ({ page }) => {
  const errors = [];
  const photos = new Set();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    if (request.url().includes('/photos/')) photos.add(request.url().split('/').pop());
  });
  await openMap(page);
  expect(photos.size).toBe(0);
  await expect(page.locator('#viewer')).toBeHidden();
  await page.selectOption('#person-picker', 'demo-a');
  await expect(page.locator('#viewer')).toBeFocused();
  await expect(page.locator('#photo-frame img')).toBeVisible();
  await expect.poll(() => photos.size).toBe(3);
  expect(photos.has('demo-home.svg')).toBe(false);
  await expect(page.locator('#photo-count')).toHaveText('1 / 4');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#photo-count')).toHaveText('4 / 4');
  await page.getByRole('button', { name: 'Next photograph' }).click();
  await expect(page.locator('#photo-count')).toHaveText('1 / 4');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#photo-count')).toHaveText('2 / 4');
  await expect.poll(() => photos.has('demo-home.svg')).toBe(true);
  await page.locator('#reset-map').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#photo-count')).toHaveText('2 / 4');
  await page.locator('#viewer').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#viewer')).toBeHidden();
  await expect(page.locator('#person-picker')).toBeFocused();
  await page.selectOption('#person-picker', 'demo-b');
  await expect(page.locator('#carousel-controls')).toBeHidden();
  await page.selectOption('#person-picker', 'demo-c');
  await expect(page.locator('#person-description')).toBeHidden();
  await expect(page.locator('#photo-caption-block')).toBeHidden();
  await page.selectOption('#person-picker', 'demo-d');
  await expect(page.locator('#photo-message')).toHaveText('No photographs available for this profile.');
  await page.selectOption('#person-picker', 'demo-a');
  await expect(page.locator('#photo-count')).toHaveText('1 / 4');
  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect(page.locator('#viewer')).toBeHidden();
  await expect(page.locator('.mapboxgl-canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('current image must finish before preloading; stale selection cannot overwrite another profile', async ({ page }) => {
  let release;
  const delayed = new Promise((resolve) => { release = resolve; });
  const requests = [];
  page.on('request', (request) => { if (request.url().includes('/photos/')) requests.push(request.url()); });
  await page.route('**/photos/demo-portrait.svg', async (route) => { await delayed; await route.continue(); });
  await openMap(page);
  await page.selectOption('#person-picker', 'demo-a');
  await expect(page.locator('#photo-frame')).toHaveAttribute('aria-busy', 'true');
  expect(requests).toHaveLength(1);
  await page.selectOption('#person-picker', 'demo-b');
  await expect(page.locator('#photo-frame img')).toBeVisible();
  release();
  await expect(page.locator('#photo-frame img')).toHaveAttribute('src', './photos/demo-home.svg');
  await expect(page.locator('#person-name')).toHaveText('Demo person B');
  expect(requests.some((url) => /demo-(landscape|detail)/.test(url))).toBe(false);
});

test('failed photo retains caption and allows navigation', async ({ page }) => {
  await page.route('**/photos/demo-portrait.svg', (route) => route.fulfill({ status: 404 }));
  await openMap(page);
  await page.selectOption('#person-picker', 'demo-a');
  await expect(page.locator('#photo-message')).toContainText('could not be loaded');
  await expect(page.locator('#photo-caption')).toContainText('Demo portrait');
  await page.getByRole('button', { name: 'Next photograph' }).click();
  await expect(page.locator('#photo-frame img')).toBeVisible();
});

test('failed pipeline keeps profiles usable', async ({ page }) => {
  await page.route('**/data/pipeline.geojson', (route) => route.fulfill({ status: 503 }));
  await page.goto('/');
  await expect(page.locator('#map-status')).toContainText('pipeline route could not be loaded');
  await page.selectOption('#person-picker', 'demo-b');
  await expect(page.locator('#photo-frame img')).toBeVisible();
});

test('empty people and unmatched profile ids have readable fallbacks', async ({ page }) => {
  await page.route('**/src/people.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: 'export const people=[]; export const story={demo:true,title:"Test route",subtitle:"Test",dataNote:"Synthetic test"};',
  }));
  await page.route('**/data/people.geojson', (route) => route.fulfill({ json: empty }));
  await openMap(page);
  await expect(page.locator('#person-picker')).toBeDisabled();
  await expect(page.locator('#map-status')).toContainText('No person profiles');
  await page.unroute('**/data/people.geojson');
  await page.reload();
  await expect(page.locator('#reset-map')).toBeEnabled();
  await page.selectOption('#person-picker', 'demo-a');
  await expect(page.locator('#person-name')).toHaveText('Profile unavailable');
});

test('missing token and production assets work inside a subdirectory iframe', async ({ page }) => {
  const failed = [];
  page.on('response', (response) => { if (response.status() >= 400) failed.push(response.url()); });
  await page.goto('http://127.0.0.1:4176/article');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#map-status')).toContainText('no Mapbox token');
  await frame.locator('#person-picker').selectOption('demo-a');
  await expect(frame.locator('#photo-frame img')).toBeVisible();
  expect(await frame.locator('#photo-frame img').evaluate((img) => img.currentSrc)).toContain('/pipeline/photos/');
  await expect(frame.locator('#photo-count')).toHaveText('1 / 4');
  expect(failed).toEqual([]);
});

for (const [width, height] of [[320, 640], [375, 667], [390, 844], [768, 700], [900, 650], [1440, 900], [390, 480], [900, 400]]) {
  test(`panel fits a ${width}×${height} iframe viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await openMap(page);
    await page.selectOption('#person-picker', 'demo-a');
    await expect(page.locator('#photo-frame img')).toBeVisible();
    const sizing = await page.evaluate(() => {
      const panel = document.querySelector('#viewer').getBoundingClientRect();
      const stage = document.querySelector('.map-stage').getBoundingClientRect();
      const close = document.querySelector('#close-viewer').getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
        fits: panel.left >= 0 && panel.right <= innerWidth && panel.top >= stage.top && panel.bottom <= stage.bottom,
        mapAbove: panel.top - stage.top,
        mapHeight: stage.height,
        touchTarget: close.width >= 44 && close.height >= 44,
        closeUnobscured: document.elementFromPoint(close.x + close.width / 2, close.y + close.height / 2)?.closest('#close-viewer') !== null,
      };
    });
    expect(sizing.overflow).toBe(false);
    expect(sizing.fits).toBe(true);
    expect(sizing.touchTarget).toBe(true);
    expect(sizing.closeUnobscured).toBe(true);
    if (width < 700) expect(sizing.mapAbove).toBeGreaterThan(sizing.mapHeight * 0.3);
    if (width < 700) {
      // Opening from overview must keep the complete supplied route above the mobile card.
      const routeVisible = await page.evaluate((coordinates) => {
        const stage = document.querySelector('.map-stage').getBoundingClientRect();
        const card = document.querySelector('#viewer').getBoundingClientRect();
        return coordinates.every((coordinate) => {
          const point = window.__testMap.project(coordinate);
          return point.y >= 0 && point.y < card.top - stage.top && point.x >= 0 && point.x <= stage.width;
        });
      }, routeCoordinates);
      expect(routeVisible).toBe(true);
    }
    await page.getByRole('button', { name: 'Next photograph' }).click();
    await expect(page.locator('#photo-count')).toHaveText('2 / 4');
    await expect(page.locator('#photo-frame img')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`viewport-${width}-${height}.png`) });
  });
}
