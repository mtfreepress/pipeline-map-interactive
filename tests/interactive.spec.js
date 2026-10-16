import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { people } from '../src/people.js';
import { MAP_STYLE, CITY_LABELS } from '../src/map.js';

const empty = { type: 'FeatureCollection', features: [] };
const locations = JSON.parse(readFileSync(new URL('./fixtures/people.geojson', import.meta.url), 'utf8'));
const galleryProfiles = readFileSync(new URL('./fixtures/people.js', import.meta.url), 'utf8');
const publishedLocations = JSON.parse(readFileSync(new URL('../public/data/people.geojson', import.meta.url), 'utf8'));

test.beforeEach(async ({ page }) => {
  // Keep gallery coverage independent of the newsroom's current photo availability.
  await page.route('**/src/people.js', (route) => route.fulfill({ contentType: 'text/javascript', body: galleryProfiles }));
  await page.route('**/data/people.geojson', (route) => route.fulfill({ json: locations }));
  // Test-only access to inspect actual rendered sources/layers and click their centers.
  // No test globals or hooks are shipped in the application.
  await page.route('**/src/map.js', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace("container: 'map',", "container: 'map', localFontFamily: 'Arial',").replace('map.touchZoomRotate.disableRotation();',
      'window.__testMap = map; map.touchZoomRotate.disableRotation();');
    await route.fulfill({ response, body });
  });
  // The actual Mapbox renderer and application layers run; only the remote style is replaced.
  await page.route(/https:\/\/[^/]*mapbox\.com\//, async (route) => {
    if (route.request().url().includes('/styles/v1/')) {
      await route.fulfill({ json: {
        version: 8,
        glyphs: 'https://api.mapbox.com/fonts/v1/mapbox/{fontstack}/{range}.pbf',
        sources: {
          'test-water': { type: 'geojson', data: empty },
          'test-places': { type: 'geojson', data: { type: 'FeatureCollection', features: [
            { type: 'Feature', properties: { name: 'Glasgow' }, geometry: { type: 'Point', coordinates: [-106.63, 48.19] } },
            { type: 'Feature', properties: { name: 'Circle' }, geometry: { type: 'Point', coordinates: [-105.59, 47.41] } },
          ] } },
        },
        layers: [
          { id: 'local-background', type: 'background', paint: { 'background-color': '#e6e9e1' } },
          { id: 'water', type: 'fill', source: 'test-water', paint: { 'fill-color': '#cccccc' } },
          { id: 'settlement-label', type: 'symbol', source: 'test-places', layout: { 'text-field': ['get', 'name'], 'text-size': 12 } },
          { id: 'state-label', type: 'symbol', source: 'test-water', layout: { 'text-field': ['get', 'name'], 'text-size': 14 } },
          { id: 'waterway', type: 'line', source: 'test-water', minzoom: 8, paint: { 'line-color': '#cccccc', 'line-width': 0.75 } },
        ],
      } });
    } else await route.fulfill({ json: {} });
  });
});

async function openMap(page) {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(window.__testMap?.getLayer('people-hit-area')))).toBe(true);
  await expect(page.locator('.mapboxgl-canvas')).toHaveCount(1);
}

async function selectProfile(page, id) {
  if (await page.locator('#viewer').isVisible()) await page.getByRole('button', { name: 'Close person details' }).click();
  const direct = page.locator(`.map-buttons [data-profile-id="${id}"]`);
  if (await direct.count()) {
    await direct.click();
  } else {
    await page.locator(`.map-buttons [data-profile-ids*="${id}"]`).click();
    await page.locator(`.profile-choice[data-profile-id="${id}"]`).click();
  }
}

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
  await selectProfile(page, 'demo-a');
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
  await page.locator('.mapboxgl-canvas').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#photo-count')).toHaveText('2 / 4');
  await page.locator('#viewer').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#viewer')).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.activeElement?.matches('.map-photo-button, .mapboxgl-canvas'))).toBe(true);
  await selectProfile(page, 'demo-b');
  await expect(page.locator('#carousel-controls')).toBeHidden();
  await selectProfile(page, 'demo-c');
  await expect(page.locator('#person-description')).toBeHidden();
  await expect(page.locator('#photo-caption-block')).toBeHidden();
  await selectProfile(page, 'demo-d');
  await expect(page.locator('#photo-message')).toHaveText('No photographs available for this profile.');
  await selectProfile(page, 'demo-a');
  await expect(page.locator('#photo-count')).toHaveText('1 / 4');
  await page.getByRole('button', { name: 'Close person details' }).click();
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
  await selectProfile(page, 'demo-a');
  await expect(page.locator('#photo-frame')).toHaveAttribute('aria-busy', 'true');
  expect(requests).toHaveLength(1);
  await selectProfile(page, 'demo-b');
  await expect(page.locator('#photo-frame img')).toBeVisible();
  release();
  await expect(page.locator('#photo-frame img')).toHaveAttribute('src', './photos/demo-home.svg');
  await expect(page.locator('#person-name')).toHaveText('Demo person B');
  expect(requests.some((url) => /demo-(landscape|detail)/.test(url))).toBe(false);
});

test('failed photo retains caption and allows navigation', async ({ page }) => {
  await page.route('**/photos/demo-portrait.svg', (route) => route.fulfill({ status: 404 }));
  await openMap(page);
  await selectProfile(page, 'demo-a');
  await expect(page.locator('#photo-message')).toContainText('could not be loaded');
  await expect(page.locator('#photo-caption')).toContainText('Demo portrait');
  await page.getByRole('button', { name: 'Next photograph' }).click();
  await expect(page.locator('#photo-frame img')).toBeVisible();
});

test('failed pipeline shows a readable error without stale menu instructions', async ({ page }) => {
  await page.route('**/data/pipeline.geojson', (route) => route.fulfill({ status: 503 }));
  await page.goto('/');
  await expect(page.locator('#map-status')).toContainText('pipeline route could not be loaded');
  await expect(page.locator('#map-status')).not.toContainText('menu');
});

test('empty people and unmatched profile ids have readable fallbacks', async ({ page }) => {
  await page.route('**/data/counties.geojson', (route) => route.fulfill({ status: 503 }));
  await page.route('**/data/fort-peck-reservation.geojson', (route) => route.fulfill({ status: 503 }));
  await page.route('**/src/people.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: 'export const people=[]; export const story={demo:true,title:"Test route",subtitle:"Test",dataNote:"Synthetic test"};',
  }));
  await page.route('**/data/people.geojson', (route) => route.fulfill({ json: empty }));
  await openMap(page);
  await expect(page.locator('.explore-controls')).toHaveCount(0);
  await expect(page.locator('#map-status')).toContainText('No person profiles');
  await page.unroute('**/data/people.geojson');
  await page.route('**/data/people.geojson', (route) => route.fulfill({ json: locations }));
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(window.__testMap?.getLayer('people-hit-area')))).toBe(true);
  await selectProfile(page, 'demo-a');
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
  await expect(frame.locator('.explore-controls, #person-picker, #reset-map')).toHaveCount(0);
  expect(failed).toEqual([]);
});


test('only the requested places are labeled; areas are labeled interactive buttons', async ({ page }) => {
  await openMap(page);
  await expect(page.locator('.map-legend')).toHaveText('Pipeline');
  expect(await page.evaluate(() => window.__testMap.getLayoutProperty('settlement-label', 'visibility'))).toBe('none');
  expect(await page.evaluate(() => window.__testMap.getLayoutProperty('state-label', 'visibility'))).toBe('none');
  const filter = await page.evaluate(() => window.__testMap.getFilter('city-labels'));
  expect(filter[2]).toEqual(CITY_LABELS);
  await expect.poll(() => page.evaluate(() => [...new Set(window.__testMap.queryRenderedFeatures({ layers: ['city-labels'] }).map(f => f.properties.name))])).toEqual(['Glasgow']);
  await expect(page.locator('.county-button[data-profile-id="valley-county-commission"] > span').first()).toHaveText('Valley\nCounty');
  await expect(page.locator('.county-button[data-profile-id="carter-county-commission"] > span').first()).toHaveText('Carter\nCounty');
  await expect(page.locator('.reservation-button')).toContainText('Fort Peck Indian\nReservation');
  await expect(page.locator('.viewer-header .eyebrow')).toHaveCount(0);
});

for (const width of [1200, 390]) {
  test(`every point and area consistently focuses its geometry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.unroute('**/src/people.js');
    await page.unroute('**/data/people.geojson');
    await openMap(page);
    const original = await page.evaluate(() => ({ zoom: window.__testMap.getZoom(), center: window.__testMap.getCenter().toArray() }));
    for (const person of people) {
      await selectProfile(page, person.id);
      await expect(page.locator('#person-name')).toHaveText(person.name);
      const point = publishedLocations.features.find(f => f.properties.id === person.id);
      if (point) {
        await expect.poll(() => page.evaluate(() => window.__testMap.getZoom())).toBeCloseTo(MAP_STYLE.pointZoom, 5);
      } else {
        const source = person.id === 'fort-peck-tribes' ? 'reservation' : 'counties';
        await expect.poll(() => page.evaluate(({ id, source }) => {
          const map = window.__testMap;
          const stage = document.querySelector('.map-viewport');
          const features = map.getSource(source)._data.features.filter(f => f.properties.id === id);
          return features.every(({ geometry }) => {
            const coords = geometry.type === 'Polygon' ? geometry.coordinates.flat() : geometry.coordinates.flat(2);
            return coords.every(coordinate => {
              const p = map.project(coordinate);
              return p.x >= 0 && p.x <= stage.clientWidth && p.y >= 0 && p.y <= stage.clientHeight;
            });
          });
        }, { id: person.id, source })).toBe(true);
        expect(await page.evaluate(() => window.__testMap.getZoom())).toBeGreaterThan(original.zoom);
      }
      await page.getByRole('button', { name: 'Close person details' }).click();
      await expect.poll(() => page.evaluate(() => window.__testMap.getZoom())).toBeCloseTo(original.zoom, 5);
      await expect(page.locator('#viewer')).toBeHidden();
    }
  });
}

for (const [width, height] of [[1200, 700], [1024, 768], [820, 1180], [768, 1024], [660, 760], [320, 568], [375, 667], [390, 844], [390, 480], [320, 460], [900, 400]]) {
  test(`map and photo panel fit together at ${width}×${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    // Exercise the wrapped header with a real, long profile name and gallery photos.
    await page.route('**/src/people.js', (route) => route.fulfill({
      contentType: 'text/javascript',
      body: galleryProfiles.replace('Demo person A', 'Tammi and Curtis Fladager'),
    }));
    await openMap(page);
    await page.screenshot({ path: testInfo.outputPath('overview.png') });
    await selectProfile(page, 'demo-a');
    await expect(page.locator('#photo-frame img')).toBeVisible();
    const sizes = await page.evaluate(() => {
      const app = document.querySelector('#app').getBoundingClientRect();
      const map = document.querySelector('.map-viewport').getBoundingClientRect();
      const panel = document.querySelector('.profile-panel').getBoundingClientRect();
      const image = document.querySelector('#photo-frame').getBoundingClientRect();
      const next = document.querySelector('#next-photo').getBoundingClientRect();
      const close = document.querySelector('#close-viewer').getBoundingClientRect();
      return {
        appWidth: app.width, appHeight: app.height, mapHeight: map.height,
        noPageScroll: document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth,
        panelFits: panel.bottom <= app.bottom + 1 && panel.left >= 0 && panel.right <= app.right,
        stacked: panel.top >= map.bottom,
        zoomClear: document.querySelector('.mapboxgl-ctrl-group').getBoundingClientRect().left >= panel.right,
        zoomPosition: (() => {
          const zoom = document.querySelector('.mapboxgl-ctrl-group').getBoundingClientRect();
          return innerWidth >= 900
            ? zoom.right > map.right - 30 && zoom.top < map.top + 30
            : zoom.left < map.left + 30 && zoom.bottom <= map.bottom && zoom.bottom > map.bottom - 60;
        })(),
        imageVisible: image.top >= panel.top && image.bottom <= panel.bottom,
        controlsVisible: [close, next].every(r => document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button')),
      };
    });
    expect(sizes.appWidth).toBeLessThanOrEqual(1200);
    if (width >= 900) expect(sizes.appHeight).toBeLessThanOrEqual(700);
    else expect(sizes.appHeight).toBe(height);
    expect(sizes.noPageScroll).toBe(true);
    expect(sizes.panelFits).toBe(true);
    expect(sizes.zoomPosition).toBe(true);
    expect(sizes.mapHeight).toBeGreaterThan(150);
    if (width >= 900) expect(sizes.zoomClear).toBe(true);
    if (width < 900) {
      expect(sizes.stacked).toBe(true);
      expect(sizes.imageVisible).toBe(true);
      expect(sizes.controlsVisible).toBe(true);
    }
    await page.getByRole('button', { name: 'Next photograph' }).click();
    await expect(page.locator('#photo-count')).toHaveText('2 / 4');
    await expect(page.locator('#photo-frame img')).toBeVisible();
    await expect(page.locator('#photo-frame img')).toHaveCSS('object-fit', 'cover');
    await page.screenshot({ path: testInfo.outputPath('selected.png') });
  });
}

test.describe('touch input', () => {
  test.use({ hasTouch: true, isMobile: true });

test('nearby profiles have separate large choices and work with touch and keyboard', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.unroute('**/src/people.js');
  await page.unroute('**/data/people.geojson');
  await openMap(page);
  const group = page.locator('.map-photo-button[data-profile-ids*="kleeman"][data-profile-ids*="fladager"]');
  await expect(group).toBeVisible();
  const size = await group.boundingBox();
  expect(size.width).toBeGreaterThanOrEqual(44);
  expect(size.height).toBeGreaterThanOrEqual(44);
  await group.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Choose a profile' })).toBeVisible();
  for (const id of ['kleeman', 'fladager']) {
    const choice = page.locator(`.profile-choice[data-profile-id="${id}"]`);
    await expect(choice).toBeVisible();
    expect((await choice.boundingBox()).height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: testInfo.outputPath('nearby-profiles.png') });
  await page.keyboard.press('Escape');
  await expect(group).toBeFocused();
  await expect(page.getByRole('dialog')).toBeHidden();
  await group.tap();
  await page.locator('.profile-choice[data-profile-id="fladager"]').tap();
  await expect(page.locator('#person-name')).toHaveText('Tammi and Curtis Fladager');
  for (const id of ['kleeman', 'fladager']) {
    await selectProfile(page, id);
    await expect(page.locator('#person-name')).toHaveText(people.find(person => person.id === id).name);
  }
});

});

test('resizing an open profile keeps a single map and stays inside the viewport', async ({ page }) => {
  await openMap(page);
  await selectProfile(page, 'demo-a');
  for (const [width, height] of [[390, 700], [768, 1024], [1024, 768], [1200, 700]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => {
      const panel = document.querySelector('#viewer').getBoundingClientRect();
      return panel.bottom <= innerHeight && panel.right <= innerWidth;
    })).toBe(true);
    await expect(page.locator('#person-name')).toHaveText('Demo person A');
    await expect(page.locator('.mapboxgl-canvas')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.__testMap.getZoom())).toBeCloseTo(MAP_STYLE.pointZoom, 5);
  }
});

test('embed breaks out of a centered article column on desktop and fits the viewport', async ({ page }) => {
  await page.goto('http://127.0.0.1:4176/pipeline/embed.html');
  // Simulate more-specific frontend theme rules that override the embed's CSS.
  await page.addStyleTag({ content: `
    @media (min-width: 900px) {
      body .article-column iframe { width: 100%; max-width: 100%; margin: 32px 0; }
    }
  ` });
  for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    const expectedWidth = width >= 900 ? Math.min(width - 32, 1200) : Math.min(width, 677);
    if (width >= 900) await expect(page.locator('iframe')).toHaveCSS('margin-top', '0px');
    await expect.poll(() => page.locator('iframe').evaluate(el => el.clientWidth)).toBe(expectedWidth);
    expect(await page.locator('iframe').evaluate(el => el.clientHeight)).toBeLessThanOrEqual(width >= 900 ? Math.min(height, 700) : height);
    const bounds = await page.locator('iframe').evaluate(el => {
      const { left, right } = el.getBoundingClientRect();
      return { left, right, pageWidth: document.documentElement.scrollWidth };
    });
    expect(bounds.left).toBeCloseTo((width - expectedWidth) / 2, 0);
    expect(bounds.right).toBeLessThanOrEqual(width);
    expect(bounds.pageWidth).toBeLessThanOrEqual(width);
  }
});

for (const width of [320, 390, 768, 1200]) {
  test(`map buttons have unobscured touch targets at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 700 });
    await page.unroute('**/src/people.js');
    await page.unroute('**/data/people.geojson');
    await openMap(page);
    const targets = await page.locator('.map-buttons button:not([hidden])').evaluateAll(buttons => buttons.map(button => {
      const rect = button.getBoundingClientRect();
      return {
        id: button.getAttribute('aria-label'), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        width: rect.width, height: rect.height,
        clear: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('button') === button,
      };
    }));
    for (const target of targets) {
      expect(target.width, target.id).toBeGreaterThanOrEqual(44);
      expect(target.height, target.id).toBeGreaterThanOrEqual(44);
      expect(target.clear, target.id).toBe(true);
      for (const other of targets.filter(item => item !== target)) {
        expect(target.left < other.right && target.right > other.left && target.top < other.bottom && target.bottom > other.top,
          `${target.id} overlaps ${other.id}`).toBe(false);
      }
    }
    await page.screenshot({ path: testInfo.outputPath('published-overview.png') });
  });
}

for (const width of [390, 1200]) {
  test(`photos preserve header layout and enlarge within the embed at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 700 });
    await page.route('**/src/people.js', route => route.fulfill({
      contentType: 'text/javascript',
      body: galleryProfiles.replace("src: './photos/demo-portrait.svg'", "src: './photos/demo-portrait.svg', fullSrc: './photos/portrait-large.svg'"),
    }));
    let largeRequests = 0;
    await page.route('**/photos/portrait-large.svg', async route => {
      largeRequests++;
      await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1200"><rect width="600" height="1200" fill="teal"/></svg>' });
    });
    await openMap(page);
    await selectProfile(page, 'demo-a');
    const expand = page.getByRole('button', { name: 'Enlarge photograph', exact: true });
    await expect(expand).toBeVisible();
    const header = await page.locator('.viewer-header').boundingBox();
    const frame = await page.locator('#photo-frame').boundingBox();
    await expect(page.locator('#photo-frame img')).toHaveCSS('object-fit', 'cover');
    expect(largeRequests).toBe(0);
    await expand.click();
    const dialog = page.getByRole('dialog', { name: 'Enlarged photograph', exact: true });
    await expect(dialog.locator('img')).toBeVisible();
    expect(largeRequests).toBe(1);
    const app = await page.locator('#app').boundingBox();
    expect(await dialog.boundingBox()).toEqual(app);
    await page.screenshot({ path: testInfo.outputPath('enlarged.png') });
    const close = page.getByRole('button', { name: 'Close enlarged photograph' });
    await expect(close).toBeFocused();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement.closest('#photo-lightbox') !== null || document.activeElement === document.body)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(expand).toBeFocused();
    await expect(page.locator('#viewer')).toBeVisible();
    await expand.click();
    await close.click();
    await page.getByRole('button', { name: 'Next photograph' }).click();
    await expect(expand).toBeVisible();
    expect(await page.locator('.viewer-header').boundingBox()).toEqual(header);
    expect(await page.locator('#photo-frame').boundingBox()).toEqual(frame);
    await selectProfile(page, 'demo-d');
    await expect(expand).toBeHidden();
  });
}

test('enlarged photo failure keeps a working close control', async ({ page }) => {
  await page.route('**/src/people.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: galleryProfiles.replace("src: './photos/demo-portrait.svg'", "src: './photos/demo-portrait.svg', fullSrc: './photos/missing-large.svg'"),
  }));
  await page.route('**/photos/missing-large.svg', route => route.fulfill({ status: 404 }));
  await openMap(page);
  await selectProfile(page, 'demo-a');
  await page.getByRole('button', { name: 'Enlarge photograph', exact: true }).click();
  await expect(page.locator('#lightbox-message')).toContainText('could not be loaded');
  await page.getByRole('button', { name: 'Close enlarged photograph' }).click();
  await expect(page.locator('#viewer')).toBeVisible();
});
