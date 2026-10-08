import mapboxgl from 'mapbox-gl';

// Opening/reset view: [[west, south], [east, north]], in longitude/latitude.
// null fits the pipeline instead. Selection padding clears the southwest profile panel.
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
  pointRadius: 8,
  selectedRadius: 10,
  hitRadius: 22,
  countyColor: '#7d8984',
  countyWidth: 1.5,
  reservationColor: '#e6ab02',
  reservationWidth: 1.5,
  reservationGap: 0,
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

export function createRouteMap({ token, pipeline, locations, reservation, counties, profiles, onSelect, onStatus, onReady }) {
  const stage = document.querySelector('.map-viewport');
  const panel = document.querySelector('.profile-panel');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = matchMedia('(max-width: 699px)');
  const colors = getComputedStyle(document.documentElement);
  const bounds = new mapboxgl.LngLatBounds();
  for (const feature of pipeline.features) {
    const lines = feature.geometry.type === 'LineString' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    lines.forEach((line) => line.forEach((coordinate) => bounds.extend(coordinate)));
  }
  const areaBounds = new Map();
  for (const feature of [...reservation.features, ...counties.features]) {
    const id = feature.properties.id;
    if (!id) continue;
    const boundary = areaBounds.get(id) || new mapboxgl.LngLatBounds();
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    polygons.forEach((polygon) => polygon.forEach((ring) => ring.forEach((coordinate) => boundary.extend(coordinate))));
    areaBounds.set(id, boundary);
  }
  let selectedId = null;
  let ready = false;
  let overview = true;
  let hoveredId = null;
  const profileNames = new Map(profiles.map((person) => [person.id, person.name]));
  const tooltip = document.createElement('div');
  tooltip.className = 'map-tooltip';
  tooltip.hidden = true;
  tooltip.setAttribute('role', 'tooltip');
  const tooltipName = document.createElement('strong');
  const tooltipHint = document.createElement('span');
  tooltipHint.textContent = 'Click to explore';
  tooltip.append(tooltipName, tooltipHint);
  stage.append(tooltip);

  function overviewBounds() {
    return (narrow.matches ? MAP_VIEW.mobileBounds : MAP_VIEW.desktopBounds) ?? bounds;
  }

  function padding(forSelection = false) {
    if (narrow.matches) return { top: 110, left: 24, right: 24, bottom: 36 };
    const { top, left, bottom, panelGap } = MAP_VIEW.desktopPadding;
    return {
      top, bottom, right: left,
      left: forSelection ? panel.getBoundingClientRect().width + panelGap : left,
    };
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
  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
  map.getCanvas().setAttribute('aria-label', 'Pipeline map. Use arrow keys to pan and plus or minus to zoom. Select profiles using the Explore a profile menu.');

  const loadTimeout = window.setTimeout(() => {
    if (!ready) onStatus('The map is taking longer than expected. Check your connection or try reloading. Profiles are still available using the menu.');
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
    map.addSource('counties', { type: 'geojson', data: counties });
    map.addSource('reservation', { type: 'geojson', data: reservation });
    // Keep basemap text above the route for geographic context.
    const firstLabel = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
    map.addLayer({
      id: 'county-hit-area', type: 'fill', source: 'counties', filter: ['has', 'id'],
      paint: { 'fill-opacity': 0 },
    }, firstLabel);
    map.addLayer({
      id: 'county-outline', type: 'line', source: 'counties',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': MAP_STYLE.countyColor, 'line-width': MAP_STYLE.countyWidth, 'line-opacity': 0.7 },
    }, firstLabel);
    map.addLayer({
      id: 'county-hover', type: 'fill', source: 'counties', filter: ['==', ['get', 'id'], ''],
      paint: { 'fill-color': MAP_STYLE.countyColor, 'fill-opacity': 0.15 },
    }, firstLabel);
    map.addLayer({
      id: 'county-selected', type: 'line', source: 'counties', filter: ['==', ['get', 'id'], ''],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': pointColor, 'line-width': 3 },
    }, firstLabel);
    map.addLayer({
      id: 'reservation-hit-area', type: 'fill', source: 'reservation',
      paint: { 'fill-opacity': 0 },
    }, firstLabel);
    // A transparent gap creates two parallel strokes along the polygon boundary.
    map.addLayer({
      id: 'reservation-outline', type: 'line', source: 'reservation',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': MAP_STYLE.reservationColor, 'line-width': MAP_STYLE.reservationWidth, 'line-gap-width': MAP_STYLE.reservationGap },
    }, firstLabel);
    map.addLayer({
      id: 'reservation-hover', type: 'fill', source: 'reservation', filter: ['==', ['get', 'id'], ''],
      paint: { 'fill-color': MAP_STYLE.reservationColor, 'fill-opacity': 0.18 },
    }, firstLabel);
    map.addLayer({
      id: 'reservation-selected', type: 'line', source: 'reservation', filter: ['==', ['get', 'id'], ''],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': MAP_STYLE.reservationColor, 'line-width': MAP_STYLE.reservationWidth + 1, 'line-gap-width': MAP_STYLE.reservationGap },
    }, firstLabel);
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
      id: 'people-hover', type: 'circle', source: 'people', filter: ['==', ['get', 'id'], ''],
      paint: { 'circle-radius': MAP_STYLE.pointRadius + 4, 'circle-color': '#ffffff', 'circle-stroke-width': 3, 'circle-stroke-color': pointColor },
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
    function featureAt(point) {
      // Choose the nearest center when generous touch areas overlap.
      // Points take priority over the reservation interior underneath them.
      const nearest = map.queryRenderedFeatures(point, { layers: ['people-hit-area'] }).map((feature) => {
        const screen = map.project(feature.geometry.coordinates);
        return { feature, distance: Math.hypot(screen.x - point.x, screen.y - point.y) };
      }).sort((a, b) => a.distance - b.distance)[0]?.feature;
      return nearest ?? map.queryRenderedFeatures(point, { layers: ['reservation-hit-area', 'reservation-outline'] })[0]
        ?? map.queryRenderedFeatures(point, { layers: ['county-hit-area'] })[0];
    }
    map.on('click', (event) => {
      const feature = featureAt(event.point);
      clearHover();
      if (feature) onSelect(feature.properties.id, map.getCanvas());
    });
    map.on('mousemove', (event) => {
      if (map.isMoving()) return;
      const feature = featureAt(event.point);
      if (!feature) { clearHover(); return; }
      const id = feature.properties.id;
      if (hoveredId !== id) {
        hoveredId = id;
        const filter = ['==', ['get', 'id'], id];
        map.setFilter('people-hover', filter);
        map.setFilter('reservation-hover', filter);
        map.setFilter('county-hover', filter);
        tooltipName.textContent = profileNames.get(id) || 'Explore this location';
      }
      map.getCanvas().style.cursor = 'pointer';
      tooltip.hidden = false;
      // Keep the label within the iframe, including markers near its edges.
      tooltip.style.left = `${Math.max(12, Math.min(event.point.x + 18, stage.clientWidth - tooltip.offsetWidth - 12))}px`;
      const top = event.point.y - tooltip.offsetHeight - 18;
      tooltip.style.top = `${Math.max(12, Math.min(top < 12 ? event.point.y + 18 : top, stage.clientHeight - tooltip.offsetHeight - 12))}px`;
    });
    map.getCanvas().addEventListener('mouseleave', clearHover);
    ready = true;
    select(selectedId, false);
    if (!selectedId) resetView(false);
    onStatus('');
    onReady();
  });

  function clearHover() {
    tooltip.hidden = true;
    map.getCanvas().style.cursor = '';
    if (!hoveredId) return;
    hoveredId = null;
    map.setFilter('people-hover', ['==', ['get', 'id'], '']);
    map.setFilter('reservation-hover', ['==', ['get', 'id'], '']);
    map.setFilter('county-hover', ['==', ['get', 'id'], '']);
  }

  function resetView(animate = true) {
    overview = true;
    map.fitBounds(overviewBounds(), {
      padding: padding(), retainPadding: false,
      duration: animate && !reducedMotion.matches ? MAP_STYLE.duration : 0,
      maxZoom: 12,
    });
  }

  function keepSelectedVisible(animate = true) {
    const boundary = areaBounds.get(selectedId);
    if (boundary && !boundary.isEmpty()) {
      const safe = padding(true);
      const corners = [boundary.getNorthWest(), boundary.getSouthEast()].map((corner) => map.project(corner));
      if (corners.some((point) => point.x < safe.left || point.x > stage.clientWidth - safe.right ||
        point.y < safe.top || point.y > stage.clientHeight - safe.bottom)) {
        map.fitBounds(boundary, {
          padding: safe, retainPadding: false, maxZoom: 12,
          duration: animate && !reducedMotion.matches ? MAP_STYLE.duration : 0,
        });
      }
      return;
    }
    const feature = locations.features.find((item) => item.properties.id === selectedId);
    if (!feature) return;
    const point = map.project(feature.geometry.coordinates);
    const safe = padding(true);
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
    clearHover();
    selectedId = id;
    if (!ready) return;
    const filter = ['==', ['get', 'id'], id ?? ''];
    map.setFilter('people-selected-ring', filter);
    map.setFilter('people-selected', filter);
    map.setFilter('reservation-selected', filter);
    map.setFilter('county-selected', filter);
    if (id) {
      overview = false;
      keepSelectedVisible(animate);
    }
  }

  map.on('movestart', (event) => { clearHover(); if (event.originalEvent) overview = false; });
  // Handles iframe resizing and a panel changing size after image/text updates.
  let resizeFrame;
  let wasNarrow = narrow.matches;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      map.resize();
      if (!ready) return;
      // Refit when switching layouts so the desktop extent does not crop the
      // route on a phone. Resizing within a layout preserves the reader's zoom.
      if (wasNarrow !== narrow.matches) {
        wasNarrow = narrow.matches;
        resetView(false);
      }
      if (selectedId) keepSelectedVisible(false);
      else if (overview) resetView(false);
    });
  });
  observer.observe(stage);
  observer.observe(panel);

  return { select, resetView };
}
