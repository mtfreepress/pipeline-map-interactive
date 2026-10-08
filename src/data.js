// Reject malformed geography before it reaches Mapbox's worker.
function validCoordinate(value) {
  return Array.isArray(value) && value.length >= 2 &&
    Number.isFinite(value[0]) && Number.isFinite(value[1]) &&
    Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}

function featureCollection(data) {
  if (data?.type === 'Feature') return { type: 'FeatureCollection', features: [data] };
  if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) return data;
  throw new Error('Expected a GeoJSON Feature or FeatureCollection.');
}

export function validatePipeline(data) {
  const collection = featureCollection(data);
  if (!collection.features.length) throw new Error('The pipeline has no features.');
  for (const feature of collection.features) {
    const geometry = feature?.geometry;
    const lines = geometry?.type === 'LineString' ? [geometry.coordinates] :
      geometry?.type === 'MultiLineString' ? geometry.coordinates : null;
    if (!Array.isArray(lines) || !lines.length || lines.some((line) =>
      !Array.isArray(line) || line.length < 2 || !line.every(validCoordinate))) {
      throw new Error('Pipeline geometry must contain valid LineString or MultiLineString coordinates.');
    }
  }
  return collection;
}

export function validateLocations(data) {
  const collection = featureCollection(data);
  const ids = new Set();
  const features = collection.features.map((feature) => {
    const id = feature?.properties?.id;
    if (typeof id !== 'string' || !id.trim() || ids.has(id) ||
      feature?.geometry?.type !== 'Point' || !validCoordinate(feature.geometry.coordinates)) {
      throw new Error('Every person location needs a unique string properties.id and valid Point coordinates.');
    }
    ids.add(id);
    return { ...feature, id };
  });
  return { ...collection, features };
}

function validateBoundaries(data) {
  const collection = featureCollection(data);
  if (!collection.features.length) throw new Error('The boundary collection has no features.');
  const features = collection.features.map((feature) => {
    const geometry = feature?.geometry;
    const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] :
      geometry?.type === 'MultiPolygon' ? geometry.coordinates : null;
    if (!Array.isArray(polygons) || !polygons.length || polygons.some((polygon) =>
      !Array.isArray(polygon) || !polygon.length || polygon.some((ring) =>
        !Array.isArray(ring) || ring.length < 4 || !ring.every(validCoordinate) ||
        ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]))) {
      throw new Error('Boundary geometry must contain valid closed Polygon or MultiPolygon rings.');
    }
    return feature;
  });
  return { ...collection, features };
}

export function validateReservation(data) {
  const collection = validateBoundaries(data);
  return { ...collection, features: collection.features.map((feature) => ({
    ...feature, properties: { ...feature.properties, id: 'fort-peck-tribes' },
  })) };
}

export function validateCounties(data) {
  const collection = validateBoundaries(data);
  const ids = new Set();
  for (const feature of collection.features) {
    const id = feature.properties?.id;
    if (id != null) {
      if (typeof id !== 'string' || !id.trim() || ids.has(id)) {
        throw new Error('Interactive counties need unique string profile IDs.');
      }
      ids.add(id);
    }
  }
  return collection;
}

export async function fetchGeoJSON(path, validate) {
  const response = await fetch(path, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status}).`);
  return validate(await response.json());
}
