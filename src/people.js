// Profiles and locations supplied by the newsroom. The pipeline route is sourced separately.
// Points belong in public/data/people.geojson, linked by the same stable id.
// County commissions use public/data/counties.geojson instead of points.
// Fort Peck Tribes uses public/data/fort-peck-reservation.geojson instead of a point.
export const story = {
  demo: false,
  title: 'Along the route',
  subtitle: 'Bridger pipeline · People and places along the route.',
  dataNote: 'Bridger route · Locations from Census geocoding and newsroom-supplied coordinates',
};

export const people = [
  {
    id: 'valley-county-commission',
    name: 'Valley County Commission',
    location: 'Glasgow, MT',
    photos: [],
  },
  {
    id: 'kleeman',
    name: 'Kent and Kim Kleeman',
    location: 'Peerless, MT',
    photos: [],
  },
  {
    id: 'thielen',
    name: 'Bob and Missy Thielen',
    location: 'Plevna, MT',
    photos: [],
  },
  {
    id: 'jerry-arnold',
    name: 'Jerry Arnold',
    location: 'Opheim, MT',
    photos: [],
  },
  {
    id: 'carter-county-commission',
    name: 'Carter County Commission',
    location: 'Ekalaka, MT',
    photos: [],
  },
  {
    id: 'mike-kjos',
    name: 'Mike Kjos',
    location: 'Fairview, MT',
    photos: [],
  },
  {
    id: 'fort-peck-tribes',
    name: 'Fort Peck Tribes',
    location: 'Fort Peck Reservation, MT',
    photos: [],
  },
  {
    id: 'fladager',
    name: 'Tammi and Curtis Fladager',
    location: 'Peerless, MT',
    photos: [],
  },
];
