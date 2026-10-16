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

// Caption review: temporary demo illustrations; replace with final newsroom photographs.
// Captions copied from map-info-captions.csv; Daniels County is the second Fladager image.
// Temporary slideshow review: preserve the supplied captions and append missing demos.
function demoPhotos(photos) {
  const demos = [
    ['portrait', 'a human silhouette'],
    ['landscape', 'hills and fields'],
    ['home', 'a house in an open landscape'],
    ['detail', 'a fence and grasses'],
  ];
  return [...photos, ...demos
    .filter(([name]) => !photos.some(photo => photo.src === `./photos/demo-${name}.svg`))
    .map(([name, description]) => ({
      src: `./photos/demo-${name}.svg`,
      alt: `Placeholder illustration of ${description}; final photograph pending.`,
      caption: photos[0].caption,
      credit: 'Demo image · Final photograph pending',
    }))];
}

export const people = [
  {
    id: 'valley-county-commission',
    name: 'Valley County Commission',
    location: 'Glasgow, MT',
    photos: demoPhotos([
      {
        src: "./photos/demo-landscape.svg",
        alt: "Placeholder illustration of hills and fields; final photograph pending.",
        caption: "Valley County would receive annual tax revenue from the Bridger Pipeline, which could help repair roads and bridges, or invest in other community services.",
        credit: "Demo image · Final photograph pending",
      },
    ]),
  },
  {
    id: 'kleeman',
    name: 'Kent and Kim Kleeman',
    location: 'Peerless, MT',
    photos: demoPhotos([
      {
        src: "./photos/demo-portrait.svg",
        alt: "Placeholder illustration of a human silhouette; final photograph pending.",
        caption: "Kent Kleeman runs cattle and raises pigs just up the road from where Jerry Arnold farms. Kleeman says money from the easement would help him and wife Kim pay down debt they owe on the ranch.",
        credit: "Demo image · Final photograph pending",
      },
    ]),
  },
  {
    id: 'thielen',
    name: 'Bob and Missy Thielen',
    location: 'Plevna, MT',
    photos: demoPhotos([
      {
        src: "./photos/demo-portrait.svg",
        alt: "Placeholder illustration of a human silhouette; final photograph pending.",
        caption: "Bob and Missy Thielen's ranch is just outside Baker, Montana. Thielen says he trusts the company. He also has questions. “What is the benefit to the American people?” he said.",
        credit: "Demo image · Final photograph pending",
      },
    ]),
  },
  {
    id: 'jerry-arnold',
    name: 'Jerry Arnold',
    location: 'Opheim, MT',
    photos: demoPhotos([
      {
        src: "./photos/demo-portrait.svg",
        alt: "Placeholder illustration of a human silhouette; final photograph pending.",
        caption: "Jerry Arnold farms grain near the U.S.-Canada Border in Montana. He hopes Bridger Pipeline will bring some financial relief.",
        credit: "Demo image · Final photograph pending",
      },
    ]),
  },
  {
    id: 'carter-county-commission',
    name: 'Carter County Commission',
    location: 'Ekalaka, MT',
    photos: demoPhotos([
      {
        src: "./photos/demo-landscape.svg",
        alt: "Placeholder illustration of hills and fields; final photograph pending.",
        caption: "Carter County commissioners say existing pipeline infrastructure covers the vast majority of the county’s property taxes.",
        credit: "Demo image · Final photograph pending",
      },
    ]),
  },
  {
    id: 'mike-kjos',
    name: 'Mike Kjos',
    location: 'Fairview, MT',
    photos: demoPhotos([
      {
        src: "./photos/demo-portrait.svg",
        alt: "Placeholder illustration of a human silhouette; final photograph pending.",
        caption: "Mike Kjos farms northwest of Fairview, Montana, where pipelines already run through his property. He wants landowners to be treated fairly during negotiations with Bridger.",
        credit: "Demo image · Final photograph pending",
      },
    ]),
  },
  {
    id: 'fort-peck-tribes',
    name: 'Fort Peck Tribes',
    location: 'Fort Peck Reservation, MT',
    photos: demoPhotos([
      {
        src: "./photos/demo-landscape.svg",
        alt: "Placeholder illustration of hills and fields; final photograph pending.",
        caption: "Bridger Pipeline's preferred route skirts the Fort Peck Reservation boundary to the north, coming within two miles of the reservation. Tribal leaders say a spill could put thousands of people’s drinking water at risk.",
        credit: "Demo image · Final photograph pending",
      },
    ]),
  },
  {
    id: 'fladager',
    name: 'Tammi and Curtis Fladager',
    location: 'Peerless, MT',
    photos: demoPhotos([
      {
        src: "./photos/demo-portrait.svg",
        alt: "Placeholder illustration of a human silhouette; final photograph pending.",
        caption: "Tammi Fladager, Daniels County commissioner, said a project like Bridger Pipeline would provide a much-needed economic boon for eastern Montana.",
        credit: "Demo image · Final photograph pending",
      },
      {
        src: "./photos/demo-landscape.svg",
        alt: "Placeholder illustration of hills and fields; final photograph pending.",
        caption: "Daniels County is home to roughly 1,600 people, 11% of whom live in poverty, according to U.S. Census data. County Commissioner Tammi Fladager said Bridger Pipeline could provide financial opportunity.",
        credit: "Demo image · Final photograph pending",
      },
    ]),
  },
];
