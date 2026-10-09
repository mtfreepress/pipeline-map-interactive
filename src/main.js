import 'mapbox-gl/dist/mapbox-gl.css';
import './style.css';
import { people, story } from './people.js';
import { createGallery } from './gallery.js';
import { fetchGeoJSON, validateLocations, validatePipeline, validateReservation, validateCounties } from './data.js';

const viewer = document.querySelector('#viewer');
const intro = document.querySelector('#intro-panel');
const announcement = document.querySelector('#announcement');
const gallery = createGallery(viewer);
const metadata = new Map();
const notices = new Map();
let routeMap;
let selectedId = null;
let returnFocus;

document.title = `${story.title} · Pipeline interactive`;

function notice(key, text) {
  if (text) notices.set(key, text);
  else notices.delete(key);
  const element = document.querySelector('#map-status');
  element.replaceChildren(...[...notices.values()].map((value) => {
    const paragraph = document.createElement('p');
    paragraph.textContent = value;
    return paragraph;
  }));
  element.hidden = !notices.size;
}

function optionalText(selector, value) {
  const element = viewer.querySelector(selector);
  element.textContent = value || '';
  element.hidden = !value;
}

function selectPerson(id, origin) {
  if (!id) { closeViewer(false); return; }
  selectedId = id;
  returnFocus = origin;
  const person = metadata.get(id) || {
    name: 'Profile unavailable',
    description: 'Details for this location are not available yet. Please explore another person.',
    photos: [],
  };
  optionalText('#person-name', person.name || 'Unnamed profile');
  optionalText('#person-location', person.location);
  optionalText('#person-description', person.description);
  document.querySelector('#app').classList.add('has-selection');
  viewer.hidden = false;
  intro.hidden = true;
  gallery.show(person);
  viewer.querySelector('.viewer-content').scrollTop = 0;
  routeMap?.select(id);
  viewer.focus({ preventScroll: true });
  announcement.textContent = `${person.name || 'Profile'} selected. Details are open.`;
}

function closeViewer(restoreFocus = true) {
  selectedId = null;
  gallery.clear();
  document.querySelector('#app').classList.remove('has-selection');
  viewer.hidden = true;
  intro.hidden = false;
  routeMap?.select(null);
  routeMap?.resetView();
  announcement.textContent = 'Person details closed.';
  if (restoreFocus) (returnFocus?.isConnected ? returnFocus : document.querySelector('.mapboxgl-canvas'))?.focus({ preventScroll: true });
}

document.querySelector('#close-viewer').addEventListener('click', () => closeViewer());
viewer.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { event.preventDefault(); closeViewer(); }
});

async function start() {
  notice('loading', 'Loading route and profiles…');
  for (const person of people) {
    if (!person || typeof person.id !== 'string' || !person.id.trim() || metadata.has(person.id)) {
      notice('metadata', 'Some profiles are unavailable because their data is incomplete.');
      continue;
    }
    metadata.set(person.id, person);
  }
  const [routeResult, peopleResult, reservationResult, countiesResult] = await Promise.allSettled([
    fetchGeoJSON('./data/pipeline.geojson', validatePipeline),
    fetchGeoJSON('./data/people.geojson', validateLocations),
    fetchGeoJSON('./data/fort-peck-reservation.geojson', validateReservation),
    fetchGeoJSON('./data/counties.geojson', validateCounties),
  ]);
  notice('loading', '');
  const locations = peopleResult.status === 'fulfilled' ? peopleResult.value : { type: 'FeatureCollection', features: [] };
  const reservation = reservationResult.status === 'fulfilled' ? reservationResult.value : { type: 'FeatureCollection', features: [] };
  const counties = countiesResult.status === 'fulfilled' ? countiesResult.value : { type: 'FeatureCollection', features: [] };
  if (countiesResult.status === 'rejected') {
    console.error('County boundaries could not load:', countiesResult.reason);
    notice('counties', 'County boundaries could not be loaded.');
  }
  if (reservationResult.status === 'rejected') {
    console.error('Reservation boundary could not load:', reservationResult.reason);
    notice('reservation', 'The Fort Peck reservation boundary could not be loaded.');
  }
  if (peopleResult.status === 'rejected') {
    console.error('Person locations could not load:', peopleResult.reason);
    notice('locations', 'Person locations could not load.');
  }
  const ids = new Set([...metadata.keys(), ...[...locations.features, ...reservation.features, ...counties.features].map((feature) => feature.properties.id).filter(Boolean)]);
  if (!ids.size) {
    notice('empty', 'No person profiles are available yet. You can still explore the route.');
    intro.querySelector('h2').textContent = 'Follow the route.';
    intro.querySelector('p').textContent = 'Person profiles will appear here when they are available.';
  } else if (!locations.features.length && !reservation.features.length && !counties.features.some((feature) => feature.properties.id)) {
    notice('locations', 'No person locations are available on the map yet.');
  } else if (!metadata.size) {
    notice('empty', 'Person details are not available yet. The route and location points remain available.');
  }
  if (routeResult.status === 'rejected') {
    console.error('Pipeline data could not load:', routeResult.reason);
    notice('route', 'The pipeline route could not be loaded. Please try reloading.');
  }
  const token = import.meta.env.VITE_MAPBOX_TOKEN?.trim();
  if (!token) {
    notice('map', 'Map unavailable: no Mapbox token is configured. Set VITE_MAPBOX_TOKEN in .env.local, then restart the development server or rebuild.');
    return;
  }
  if (routeResult.status === 'rejected') return;
  notice('map', 'Loading map…');
  try {
    const { createRouteMap } = await import('./map.js');
    routeMap = createRouteMap({
      token, pipeline: routeResult.value, locations, reservation, counties, profiles: people,
      onSelect: selectPerson,
      onStatus: (text) => notice('map', text),
    });
    routeMap.select(selectedId, false);
  } catch (error) {
    console.error('Map initialization failed:', error instanceof Error ? error.name : 'Unknown error');
    notice('map', 'The map could not start. Your browser needs WebGL enabled and a working connection.');
  }
}

start().catch(() => {
  notice('loading', '');
  notice('startup', 'The interactive could not load. Please try reloading the page.');
});
