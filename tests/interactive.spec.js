import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { people } from '../src/people.js';
import { MAP_STYLE } from '../src/map.js';

const empty = { type: 'FeatureCollection', features: [] };
const locations = JSON.parse(readFileSync(new URL('./fixtures/people.geojson', import.meta.url), 'utf8'));
const galleryProfiles = readFileSync(new URL('./fixtures/people.js', import.meta.url), 'utf8');
const publishedLocations = JSON.parse(readFileSync(new URL('../public/data/people.geojson', import.meta.url), 'utf8'));
const pipeline = JSON.parse(readFileSync(new URL('../public/data/pipeline.geojson', import.meta.url), 'utf8'));
const firstPersonCoordinates = locations.features.find((feature) => feature.properties.id === 'demo-a').geometry.coordinates;
const routeCoordinates = pipeline.features.flatMap(({ geometry }) =>
  geometry.type === 'LineString' ? geometry.coordinates : geometry.coordinates.flat());

test.beforeEach(async ({ page }) => {
  // Keep gallery coverage independent of the newsroom's current photo availability.
  await page.route('**/src/people.js', (route) => route.fulfill({ contentType: 'text/javascript', body: galleryProfiles }));
  await page.route('**/data/people.geojson', (route) => route.fulfill({ json: locations }));
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

test('desktop overview fits Montana with the intro at lower left and applies local water colors', async ({ page }) => {
  await page.unroute('**/src/people.js');
  await page.unroute('**/data/people.geojson');
  await openMap(page);
  await expect(page.locator('#demo-badge')).toBeHidden();
  for (const person of people) {
    await page.selectOption('#person-picker', person.id);
    await expect(page.locator('#person-name')).toHaveText(person.name);
    const selectedLayer = person.id === 'fort-peck-tribes' ? 'reservation-selected' : 'people-selected-ring';
    await expect.poll(() => page.evaluate((layer) => [...new Set(window.__testMap.queryRenderedFeatures({ layers: [layer] }).map((feature) => feature.properties.id))], selectedLayer)).toEqual([person.id]);
  }
  await page.getByRole('button', { name: 'Reset view' }).click();
  const overview = await page.evaluate(() => {
    const map = window.__testMap;
    const stage = document.querySelector('.map-stage').getBoundingClientRect();
    const panel = document.querySelector('#intro-panel').getBoundingClientRect();
    const corners = [[-116.1, 44.3], [-103.95, 49.1]].map((coordinate) => map.project(coordinate));
    return {
      stateVisible: corners.every((point) => point.x >= 0 && point.x < stage.width && point.y >= 0 && point.y < stage.height),
      introLowerLeft: panel.left - stage.left < 32 && panel.top > stage.top + stage.height / 2 && panel.bottom < stage.bottom,
      easternContext: map.getBounds().getEast() > -103.95,
      water: map.getPaintProperty('water', 'fill-color'),
      waterway: map.getPaintProperty('waterway', 'line-color'),
      minZoom: map.getLayer('waterway').minzoom,
      width: map.getPaintProperty('waterway', 'line-width'),
    };
  });
  expect(overview.stateVisible).toBe(true);
  expect(overview.introLowerLeft).toBe(true);
  expect(overview.easternContext).toBe(true);
  expect(overview.water).toBe('#acd3e5');
  expect(overview.waterway).toBe('#6ba4c1');
  expect(overview.minZoom).toBe(8);
  expect(overview.width).toBe(0.75);
});

for (const width of [1200, 660]) {
  test(`every profile has a named hover indicator at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await page.unroute('**/src/people.js');
    await page.unroute('**/data/people.geojson');
    await openMap(page);
    const canvas = page.locator('.mapboxgl-canvas');
    for (const person of people) {
      const coordinate = person.id === 'fort-peck-tribes' ? [-105.5297091, 48.3675377] :
        publishedLocations.features.find((feature) => feature.properties.id === person.id).geometry.coordinates;
      const point = await page.evaluate((coordinates) => {
        const p = window.__testMap.project(coordinates);
        return { x: p.x, y: p.y };
      }, coordinate);
      await canvas.hover({ position: point });
      await expect(page.getByRole('tooltip')).toContainText(person.name);
      await expect(page.getByRole('tooltip')).toContainText('Click to explore');
      const layer = person.id === 'fort-peck-tribes' ? 'reservation-hover' : 'people-hover';
      await expect.poll(() => page.evaluate((id) => window.__testMap.queryRenderedFeatures({ layers: [id] }).length, layer)).toBeGreaterThan(0);
      await expect(page.locator('#viewer')).toBeHidden();
      expect(await page.getByRole('tooltip').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
      })).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath(`hover-${width}.png`) });
    await page.locator('#story-title').hover();
    await expect(page.getByRole('tooltip')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__testMap.queryRenderedFeatures({ layers: ['people-hover', 'reservation-hover'] }).length)).toBe(0);
  });
}

for (const width of [1200, 390]) {
  test(`Fort Peck reservation replaces its point and opens the profile at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.unroute('**/src/people.js');
    await page.unroute('**/data/people.geojson');
    await openMap(page);
    const canvas = page.locator('.mapboxgl-canvas');
    const point = await page.evaluate(() => {
      const p = window.__testMap.project([-105.5297091, 48.3675377]);
      return { x: p.x, y: p.y };
    });
    await canvas.click({ position: point });
    await expect(page.locator('#person-name')).toHaveText('Fort Peck Tribes');
    await expect.poll(() => page.evaluate(() => window.__testMap.queryRenderedFeatures({ layers: ['reservation-selected'] }).length)).toBeGreaterThan(0);
    const rendered = await page.evaluate(() => {
      const map = window.__testMap;
      const stage = document.querySelector('.map-stage').getBoundingClientRect();
      const viewer = document.querySelector('#viewer').getBoundingClientRect();
      const boundary = map.getSource('reservation')._data.features[0].geometry.coordinates[0];
      return {
        color: map.getPaintProperty('reservation-outline', 'line-color'),
        gap: map.getPaintProperty('reservation-outline', 'line-gap-width'),
        points: map.getSource('people')._data.features.map((feature) => feature.properties.id),
        selectedDots: map.queryRenderedFeatures({ layers: ['people-selected-ring'] }).length,
        visible: boundary.every((coordinate) => {
          const p = map.project(coordinate);
          return p.x >= 0 && p.y >= 0 && p.x <= stage.width && p.y <= stage.height &&
            (innerWidth < 700 ? p.y < viewer.top - stage.top : p.x < viewer.left - stage.left);
        }),
      };
    });
    expect(rendered.color).toBe('#e6ab02');
    expect(rendered.gap).toBe(MAP_STYLE.reservationGap);
    expect(rendered.points).toHaveLength(7);
    expect(rendered.points).not.toContain('fort-peck-tribes');
    expect(rendered.selectedDots).toBe(0);
    expect(rendered.visible).toBe(true);
    await page.getByRole('button', { name: 'Close person details' }).click();
    await expect(canvas).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.__testMap.queryRenderedFeatures({ layers: ['reservation-selected'] }).length)).toBe(0);
  });
}

test('unavailable reservation leaves the other points and Fort Peck profile usable', async ({ page }) => {
  await page.unroute('**/src/people.js');
  await page.unroute('**/data/people.geojson');
  await page.route('**/data/fort-peck-reservation.geojson', (route) => route.fulfill({ status: 503 }));
  await openMap(page);
  await expect(page.locator('#map-status')).toContainText('Fort Peck reservation boundary could not be loaded');
  await page.selectOption('#person-picker', 'fort-peck-tribes');
  await expect(page.locator('#person-name')).toHaveText('Fort Peck Tribes');
  await page.selectOption('#person-picker', 'kleeman');
  await expect(page.locator('#person-name')).toHaveText('Kent and Kim Kleeman');
  await expect.poll(() => page.evaluate(() => window.__testMap.queryRenderedFeatures({ layers: ['people-selected-ring'] }).map((feature) => feature.properties.id))).toEqual(['kleeman']);
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
  await page.route('**/data/fort-peck-reservation.geojson', (route) => route.fulfill({ status: 503 }));
  await page.route('**/src/people.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: 'export const people=[]; export const story={demo:true,title:"Test route",subtitle:"Test",dataNote:"Synthetic test"};',
  }));
  await page.route('**/data/people.geojson', (route) => route.fulfill({ json: empty }));
  await openMap(page);
  await expect(page.locator('#person-picker')).toBeDisabled();
  await expect(page.locator('#map-status')).toContainText('No person profiles');
  await page.unroute('**/data/people.geojson');
  await page.route('**/data/people.geojson', (route) => route.fulfill({ json: locations }));
  await page.reload();
  await expect(page.locator('#reset-map')).toBeEnabled();
  await page.selectOption('#person-picker', 'demo-a');
  await expect(page.locator('#person-name')).toHaveText('Profile unavailable');
});

test('missing token and production assets work inside a subdirectory iframe', async ({ page }) => {
  await page.unroute('**/data/people.geojson');
  const failed = [];
  page.on('response', (response) => { if (response.status() >= 400) failed.push(response.url()); });
  await page.goto('http://127.0.0.1:4176/article');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#map-status')).toContainText('no Mapbox token');
  await expect(frame.locator('#demo-badge')).toBeHidden();
  await expect(frame.locator('#person-picker option')).toHaveCount(9);
  expect([...publishedLocations.features.map((feature) => feature.properties.id), 'fort-peck-tribes'].sort()).toEqual(people.map((person) => person.id).sort());
  for (const person of people) {
    await frame.locator('#person-picker').selectOption(person.id);
    await expect(frame.locator('#person-name')).toHaveText(person.name);
    await expect(frame.locator('#person-location')).toHaveText(person.location);
    await expect(frame.locator('#photo-message')).toHaveText('No photographs available for this profile.');
    await expect(frame.locator('#carousel-controls')).toBeHidden();
  }
  expect(failed).toEqual([]);
});

test('embed preview caps desktop and mobile widths and shrinks to a phone', async ({ page }) => {
  await page.goto('http://127.0.0.1:4176/pipeline/embed.html');
  for (const [viewport, width, height] of [[1440, 1200, 800], [680, 660, 760], [390, 390, 760]]) {
    await page.setViewportSize({ width: viewport, height: 900 });
    await expect.poll(() => page.locator('iframe').evaluate((el) => ({ width: el.clientWidth, height: el.clientHeight }))).toEqual({ width, height });
    await expect(page.frameLocator('iframe').locator('#story-title')).toHaveText('Along the route');
  }
});

for (const [width, height] of [[1200, 800], [660, 760], [320, 640], [375, 667], [390, 844], [768, 700], [900, 650], [1440, 900], [390, 480], [900, 400]]) {
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
