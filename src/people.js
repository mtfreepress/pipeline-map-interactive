import captions from './captions.json' with { type: 'json' };
import photographs from './photos.json' with { type: 'json' };
import { profiles } from './profiles.js';

export const story = {
  demo: false,
  title: 'Along the route',
  subtitle: 'Bridger pipeline · People and places along the route.',
  dataNote: 'Bridger route · Locations from Census geocoding and newsroom-supplied coordinates',
};

// Importers own the generated manifests; profile captions stay shared across photos.
export const people = profiles.map(profile => ({
  ...profile,
  photos: (photographs[profile.id] || []).map(photo => ({
    ...photo,
    caption: captions[profile.id],
  })),
}));
