// Demo profiles. The pipeline route is sourced separately from pipeline-geometry/.
// Coordinates belong in public/data/people.geojson, linked by the same stable id.
export const story = {
  demo: true,
  title: 'Along the route',
  subtitle: 'Bridger pipeline · People and places along the route.',
  dataNote: 'Bridger route · Demo people & images',
};

export const people = [
  {
    id: 'demo-a',
    name: 'Demo person A',
    location: 'Demo location A',
    description: 'A portrait, a place, and a few details from along the route.',
    photos: [
      { src: './photos/demo-portrait.svg', alt: 'Demo illustration of a human silhouette against hills.', caption: 'Demo portrait — a face along the route.', credit: 'Demo image' },
      { src: './photos/demo-landscape.svg', alt: 'Demo illustration of rolling hills and open fields.', caption: 'Demo landscape — the surrounding hills and open fields.', credit: 'Demo image' },
      { src: './photos/demo-home.svg', alt: 'Demo illustration of a house in an open landscape.', caption: 'Demo home — a sense of place.' },
      { src: './photos/demo-detail.svg', alt: 'Demo illustration of a fence and grasses.', credit: 'Demo image' },
    ],
  },
  {
    id: 'demo-b',
    name: 'Demo person B',
    location: 'Demo location B',
    description: 'A place along the route.',
    photos: [{ src: './photos/demo-home.svg', alt: 'Demo illustration of a house in an open landscape.', caption: 'Demo home — a sense of place.' }],
  },
  {
    id: 'demo-c',
    name: 'Demo person C',
    location: 'Demo location C',
    photos: [
      { src: './photos/demo-landscape.svg', alt: 'Demo illustration of rolling hills and open fields.' },
      { src: './photos/demo-detail.svg', alt: 'Demo illustration of a fence and grasses.', caption: 'Demo detail — a closer look.' },
    ],
  },
  {
    id: 'demo-d',
    name: 'Demo person D',
    location: 'Demo location D',
    description: 'Another stop along the route.',
    photos: [],
  },
];
