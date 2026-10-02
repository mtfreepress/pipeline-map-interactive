import mapboxgl from 'mapbox-gl';

// Opening/reset view: [[west, south], [east, north]], in longitude/latitude.
// null fits the pipeline instead. Right padding reserves space for the desktop panel.
export const MAP_VIEW = {
  desktopBounds: [[-116.1, 44.3], [-103.95, 49.1]],
  mobileBounds: null,
  desktopPadding: { top: 66, left: 48, bottom: 60, panelGap: 48 },
};

// Basemap, water appearance, line widths and point sizes live here.
export const MAP_STYLE = {
  basemap: 'mapbox://styles/mapbox/light-v11',
  water: {
    fillColor: '#acd3e5',
    lineColor: '#6ba4c1',
    // null preserves the basemap default. Lower minZoom shows available lines sooner;
    // it cannot add waterways missing from the underlying tiles at that zoom.
    waterwayMinZoom: null,
    waterwayWidth: null, // CSS pixels, or a Mapbox zoom expression (see README).
  },
  routeWidth: 4,
  casingWidth: 7,
  pointRadius: 6,
  selectedRadius: 10,
  hitRadius: 22,
  duration: 350,
};

function styleWater(map) {
  const water = MAP_STYLE.water;
  if (!water) return;
  // Classic styles expose these source layers. Skip missing layers (e.g. satellite).
  // Mapbox Standard uses imported-style configuration instead; see README.
  for (const layer of map.getStyle().layers || []) {
    if (layer.type === 'fill' && (layer['source-layer'] === 'water' || layer.id === 'water')) {
      if (water.fillColor != null) map.setPaintProperty(layer.id, 'fill-color', water.fillColor);
    }
    if (layer.type === 'line' && (layer['source-layer'] === 'waterway' || layer.id === 'waterway')) {
      if (water.lineColor != null) map.setPaintProperty(layer.id, 'line-color', water.lineColor);
      if (water.waterwayMinZoom != null) {
        map.setLayerZoomRange(layer.id, water.waterwayMinZoom, layer.maxzoom ?? 24);
      }
      if (water.waterwayWidth != null) map.setPaintProperty(layer.id, 'line-width', water.waterwayWidth);
    }
  }
}

export function createRouteMap({ token, pipeline, locations, onSelect, onStatus, onReady }) {
  const stage = document.querySelector('.map-stage');
  const viewer = document.querySelector('#viewer');
  const intro = document.querySelector('#intro-panel');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = matchMedia('(max-width: 699px)');
  const colors = getComputedStyle(document.documentElement);
  const bounds = new mapboxgl.LngLatBounds();
  for (const feature of pipeline.features) {
    const lines = feature.geometry.type === 'LineString' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    lines.forEach((line) => line.forEach((coordinate) => bounds.extend(coordinate)));
  }
  let selectedId = null;
  let ready = false;
  let overview = true;

  function overviewBounds() {
    return (narrow.matches ? MAP_VIEW.mobileBounds : MAP_VIEW.desktopBounds) ?? bounds;
  }

  function padding() {
    const panel = viewer.hidden ? intro : viewer;
    const rect = stage.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    if (narrow.matches) {
      return { top: 60, left: 32, right: 32, bottom: Math.min(Math.max(0, rect.height - 80), panelRect.height + 50) };
    }
    const { top, left, bottom, panelGap } = MAP_VIEW.desktopPadding;
    return { top, left, bottom, right: Math.min(rect.width * 0.55, panelRect.width + panelGap) };
  }

  const map = new mapboxgl.Map({
    container: 'map',
    accessToken: token,
    style: MAP_STYLE.basemap,
    projection: 'mercator',
    bounds: overviewBounds(),
    fitBoundsOptions: { padding: padding(), retainPadding: false, duration: 0 },
    pitch: 0,
    bearing: 0,
    minZoom: 2,
    maxZoom: 16,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    cooperativeGestures: true,
    attributionControl: true,
    renderWorldCopies: false,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left');
  map.getCanvas().setAttribute('aria-label', 'Pipeline map. Use arrow keys to pan and plus or minus to zoom. Select profiles using the Explore a person menu above.');

  const loadTimeout = window.setTimeout(() => {
    if (!ready) onStatus('The map is taking longer than expected. Check your connection or try reloading. Profiles are still available above.');
  }, 15000);
  map.on('error', () => {
    // Avoid logging request URLs containing the public token.
    onStatus('Some map content could not load. Check your connection and Mapbox token settings. You can still explore profiles using the menu.');
  });

  map.on('load', () => {
    clearTimeout(loadTimeout);
    styleWater(map);
    const routeColor = colors.getPropertyValue('--route').trim();
    const pointColor = colors.getPropertyValue('--point').trim();
    const selectedColor = colors.getPropertyValue('--selected').trim();
    map.addSource('pipeline', { type: 'geojson', data: pipeline });
    map.addSource('people', { type: 'geojson', data: locations, promoteId: 'id' });
    // Keep basemap text above the route for geographic context.
    const firstLabel = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
    map.addLayer({
      id: 'pipeline-casing', type: 'line', source: 'pipeline',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': MAP_STYLE.casingWidth, 'line-opacity': 0.9 },
    }, firstLabel);
    map.addLayer({
      id: 'pipeline-route', type: 'line', source: 'pipeline',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': routeColor, 'line-width': MAP_STYLE.routeWidth },
    }, firstLabel);
    map.addLayer({
      id: 'people-points', type: 'circle', source: 'people',
      paint: { 'circle-radius': MAP_STYLE.pointRadius, 'circle-color': '#ffffff', 'circle-stroke-width': 2.5, 'circle-stroke-color': pointColor },
    });
    map.addLayer({
      id: 'people-selected-ring', type: 'circle', source: 'people', filter: ['==', ['get', 'id'], ''],
      paint: { 'circle-radius': MAP_STYLE.selectedRadius + 4, 'circle-color': '#ffffff', 'circle-stroke-width': 2, 'circle-stroke-color': pointColor },
    });
    map.addLayer({
      id: 'people-selected', type: 'circle', source: 'people', filter: ['==', ['get', 'id'], ''],
      paint: { 'circle-radius': MAP_STYLE.selectedRadius, 'circle-color': selectedColor },
    });
    map.addLayer({
      id: 'people-hit-area', type: 'circle', source: 'people',
      paint: { 'circle-radius': MAP_STYLE.hitRadius, 'circle-opacity': 0 },
    });
    map.on('click', 'people-hit-area', (event) => {
      // Choose the nearest center when generous touch areas overlap.
      const nearest = event.features.map((feature) => {
        const screen = map.project(feature.geometry.coordinates);
        return { feature, distance: Math.hypot(screen.x - event.point.x, screen.y - event.point.y) };
      }).sort((a, b) => a.distance - b.distance)[0]?.feature;
      if (nearest) onSelect(nearest.properties.id, map.getCanvas());
    });
    map.on('mouseenter', 'people-hit-area', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'people-hit-area', () => { map.getCanvas().style.cursor = ''; });
    ready = true;
    select(selectedId, false);
    if (!selectedId) resetView(false);
    onStatus('');
    onReady();
  });

  function resetView(animate = true) {
    overview = true;
    map.fitBounds(overviewBounds(), {
      padding: padding(), retainPadding: false,
      duration: animate && !reducedMotion.matches ? MAP_STYLE.duration : 0,
      maxZoom: 12,
    });
  }

  function keepSelectedVisible(animate = true) {
    const feature = locations.features.find((item) => item.properties.id === selectedId);
    if (!feature) return;
    const point = map.project(feature.geometry.coordinates);
    const safe = padding();
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const targetX = Math.max(safe.left, Math.min(width - safe.right, point.x));
    const targetY = Math.max(safe.top, Math.min(height - safe.bottom, point.y));
    if (Math.abs(targetX - point.x) < 1 && Math.abs(targetY - point.y) < 1) return;
    // Pan only as much as needed; keep the reader's zoom and route context.
    map.panBy([point.x - targetX, point.y - targetY], {
      duration: animate && !reducedMotion.matches ? MAP_STYLE.duration : 0,
    });
  }

  function select(id, animate = true) {
    selectedId = id;
    if (!ready) return;
    const filter = ['==', ['get', 'id'], id ?? ''];
    map.setFilter('people-selected-ring', filter);
    map.setFilter('people-selected', filter);
    if (id) {
      // Opening the mobile card from the overview should not cover the lower route.
      // Once the reader has moved the map, preserve their chosen zoom instead.
      const fromOverview = overview;
      overview = false;
      if (fromOverview && narrow.matches) {
        map.fitBounds(overviewBounds(), {
          padding: padding(), retainPadding: false,
          duration: animate && !reducedMotion.matches ? MAP_STYLE.duration : 0,
          maxZoom: 12,
        });
      } else keepSelectedVisible(animate);
    }
  }

  map.on('movestart', (event) => { if (event.originalEvent) overview = false; });
  // Handles iframe resizing and a panel changing size after image/text updates.
  let resizeFrame;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      map.resize();
      if (!ready) return;
      if (selectedId) keepSelectedVisible(false);
      else if (overview) resetView(false);
    });
  });
  observer.observe(stage);
  observer.observe(viewer);
  observer.observe(intro);

  return { select, resetView };
}
