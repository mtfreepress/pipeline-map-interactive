import mapboxgl from 'mapbox-gl';
import { createMapButtons } from './map-buttons.js';

export const COMPACT_QUERY = '(max-width: 899px)';
export const CITY_LABELS = ['Billings', 'Miles City', 'Glasgow', 'Wolf Point', 'Great Falls', 'Bozeman', 'Helena', 'Kalispell'];
const AREA_LABELS = [
  { id: 'daniels-county', name: 'Daniels\nCounty', coordinates: [-105.35, 48.8] },
  { id: 'valley-county-commission', name: 'Valley\nCounty', coordinates: [-107.05, 48.4] },
  { id: 'carter-county-commission', name: 'Carter\nCounty', coordinates: [-104.5, 45.4] },
  { id: 'fort-peck-tribes', name: 'Fort Peck Indian\nReservation', coordinates: [-105.45, 48.05] },
];

// Opening/reset view: [[west, south], [east, north]], in longitude/latitude.
// null fits the pipeline instead. Selection padding clears the southwest profile panel.
export const MAP_VIEW = {
  desktopBounds: [[-116.05, 44.36], [-104.04, 49.0]],
  mobileBounds: null,
  desktopPadding: { top: 32, left: 32, bottom: 32, panelGap: 48 },
};

// Basemap, water appearance, line widths and camera settings live here.
export const MAP_STYLE = {
  basemap: 'mapbox://styles/mapbox/light-v11',
  labels: {
    font: ['Open Sans Regular', 'Arial Unicode MS Regular'],
    size: 20,
    color: '#495650',
    haloColor: '#fffefa',
    haloWidth: 1.5,
  },
  water: {
    fillColor: '#acd3e5',
    lineColor: '#6ba4c1',
    // null preserves the basemap default. Lower minZoom shows available lines sooner;
    // it cannot add waterways missing from the underlying tiles at that zoom.
    waterwayMinZoom: null,
    waterwayWidth: null, // CSS pixels, or a Mapbox zoom expression (see README).
  },
  routeWidth: 5,
  casingWidth: 8,
  countyColor: '#7d8984',
  countyWidth: 1.5,
  reservationColor: '#e6ab02',
  reservationWidth: 1.5,
  reservationGap: 0,
  pointZoom: 9.5,
  duration: 850,
};

// Gentle acceleration and deceleration, shared by profile and overview moves.
const cameraEasing = (t) => t * t * (3 - 2 * t);

function labelLayout() {
  return {
    'text-font': MAP_STYLE.labels.font,
    'text-size': MAP_STYLE.labels.size,
    'text-letter-spacing': 0,
    'text-transform': 'none',
  };
}

function labelPaint() {
  return {
    'text-color': MAP_STYLE.labels.color,
    'text-halo-color': MAP_STYLE.labels.haloColor,
    'text-halo-width': MAP_STYLE.labels.haloWidth,
  };
}

function styleLabels(map) {
  const layers = map.getStyle().layers;
  const places = layers.find((layer) => layer.type === 'symbol' && layer.id.includes('settlement'));
  // Replace the basemap's zoom-dependent place hierarchy with one explicit list.
  for (const layer of layers) {
    if (layer.type === 'symbol' && layer.layout?.['text-field']) map.setLayoutProperty(layer.id, 'visibility', 'none');
  }
  if (!places) return;
  map.addLayer({
    id: 'city-labels', type: 'symbol', source: places.source,
    ...(places['source-layer'] ? { 'source-layer': places['source-layer'] } : {}),
    filter: ['match', ['coalesce', ['get', 'name_en'], ['get', 'name']], CITY_LABELS, true, false],
    layout: {
      ...labelLayout(), 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
      'text-variable-anchor': ['top', 'bottom', 'left', 'right', 'top-right', 'top-left', 'bottom-right', 'bottom-left'], 'text-radial-offset': 1,
      'text-padding': 5,
    },
    paint: labelPaint(),
  });
}

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

export function createRouteMap({ token, pipeline, locations, reservation, counties, profiles, onSelect, onStatus }) {
  const stage = document.querySelector('.map-viewport');
  const panel = document.querySelector('.profile-panel');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = matchMedia(COMPACT_QUERY);
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
  let mapButtons;
  let lastSize;
  let layoutTransition = false;
  const stageSize = () => `${stage.clientWidth}:${stage.clientHeight}`;
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
    if (narrow.matches) return { top: 66, left: 48, right: 48, bottom: 36 };
    const { top, left, bottom, panelGap } = MAP_VIEW.desktopPadding;
    return {
      top: forSelection ? Math.max(top, 76) : top, bottom, right: left,
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
  map.getCanvas().setAttribute('aria-label', 'Pipeline map. Use arrow keys to pan and plus or minus to zoom. Select a point or highlighted area to explore a profile.');

  const loadTimeout = window.setTimeout(() => {
    if (!ready) onStatus('The map is taking longer than expected. Check your connection or try reloading.');
  }, 15000);
  map.on('error', () => {
    // Avoid logging request URLs containing the public token.
    onStatus('Some map content could not load. Check your connection and Mapbox token settings.');
  });

  map.on('load', () => {
    clearTimeout(loadTimeout);
    styleWater(map);
    styleLabels(map);
    const routeColor = colors.getPropertyValue('--route').trim();
    const pointColor = colors.getPropertyValue('--point').trim();
    map.addSource('pipeline', { type: 'geojson', data: pipeline });
    map.addSource('counties', { type: 'geojson', data: counties });
    map.addSource('reservation', { type: 'geojson', data: reservation });
    // Keep basemap text above the route for geographic context.
    const firstLabel = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
    map.addLayer({
      id: 'county-hit-area', type: 'fill', source: 'counties', filter: ['has', 'id'],
      paint: { 'fill-color': pointColor, 'fill-opacity': 0.045 },
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
      paint: { 'fill-color': MAP_STYLE.reservationColor, 'fill-opacity': 0.06 },
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
    function featureAt(point) {
      // Point profiles are represented exclusively by the visible camera buttons.
      return map.queryRenderedFeatures(point, { layers: ['reservation-hit-area', 'reservation-outline'] })[0]
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
    mapButtons = createMapButtons({
      map, stage, locations, names: profileNames, onSelect,
      areas: AREA_LABELS.filter((area) => areaBounds.has(area.id)),
      onHover: (id) => {
        const filter = ['==', ['get', 'id'], id || ''];
        map.setFilter('county-hover', filter);
        map.setFilter('reservation-hover', filter);
      },
    });
    ready = true;
    select(selectedId, false);
    if (!selectedId) resetView(false);
    onStatus('');
  });

  function clearHover() {
    tooltip.hidden = true;
    map.getCanvas().style.cursor = '';
    if (!hoveredId) return;
    hoveredId = null;
    map.setFilter('reservation-hover', ['==', ['get', 'id'], '']);
    map.setFilter('county-hover', ['==', ['get', 'id'], '']);
  }

  function resetView(animate = true) {
    overview = true;
    if (layoutTransition) return;
    map.resize();
    lastSize = stageSize();
    map.fitBounds(overviewBounds(), {
      padding: padding(), retainPadding: false,
      duration: animate && !reducedMotion.matches ? MAP_STYLE.duration : 0,
      easing: cameraEasing,
      maxZoom: 12,
    });
  }

  function focusSelection(animate = true) {
    const safe = padding(true);
    const duration = animate && !reducedMotion.matches ? MAP_STYLE.duration : 0;
    const boundary = areaBounds.get(selectedId);
    if (boundary && !boundary.isEmpty()) {
      // Always frame an area, even if it was already visible in the overview.
      map.fitBounds(boundary, { padding: safe, retainPadding: false, maxZoom: 10, duration, easing: cameraEasing });
      return;
    }
    const feature = locations.features.find((item) => item.properties.id === selectedId);
    if (!feature) return;
    map.easeTo({
      center: feature.geometry.coordinates, zoom: MAP_STYLE.pointZoom,
      padding: safe, retainPadding: false, duration, easing: cameraEasing,
    });
  }

  function select(id, animate = true) {
    clearHover();
    selectedId = id;
    if (!ready) return;
    map.resize();
    lastSize = stageSize();
    mapButtons.select(id);
    const filter = ['==', ['get', 'id'], id ?? ''];
    map.setFilter('reservation-selected', filter);
    map.setFilter('county-selected', filter);
    if (id) {
      overview = false;
      if (!layoutTransition) focusSelection(animate);
    }
  }

  map.on('movestart', (event) => { clearHover(); if (event.originalEvent) overview = false; });
  // Handles iframe resizing and a panel changing size after image/text updates.
  let resizeFrame;
  let wasNarrow = narrow.matches;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (lastSize === stageSize()) return;
      lastSize = stageSize();
      map.resize();
      if (!ready || layoutTransition) return;
      // Refit when switching layouts so the desktop extent does not crop the
      // route on a phone. Resizing within a layout preserves the reader's zoom.
      if (wasNarrow !== narrow.matches) {
        wasNarrow = narrow.matches;
        resetView(false);
      }
      if (selectedId) focusSelection(false);
      else if (overview) resetView(false);
    });
  });
  observer.observe(stage);

  return {
    select,
    resetView,
    beginLayoutTransition() {
      layoutTransition = true;
      map.stop();
    },
    endLayoutTransition() {
      layoutTransition = false;
      map.resize();
      lastSize = stageSize();
      wasNarrow = narrow.matches;
      if (!ready) return;
      if (selectedId) focusSelection();
      else if (overview) resetView();
    },
  };
}
