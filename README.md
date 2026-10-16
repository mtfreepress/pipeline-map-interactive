# Along the route

A static, iframe-ready pipeline map for a news article. Vite builds vanilla JavaScript, Mapbox GL JS, local GeoJSON and a responsive HTML photo viewer. There is one Mapbox map, no backend, database, geocoder or carousel dependency.

The route comes from `pipeline-geometry/BridgerShapefile_20260326.shp`. Eight profiles use newsroom-supplied names and locations; photographs and captions have not been added yet. See [route conversion notes](pipeline-geometry/README.md) for the source projection and GeoJSON export command.

## Local development

Use Node.js 22.12+ (a current supported LTS release is recommended).

```sh
npm install
cp .env.example .env.local
```

Add your Mapbox public browser token to `.env.local`:

```dotenv
VITE_MAPBOX_TOKEN=your_public_browser_token
```

```sh
npm run dev
```

Open the local URL printed by Vite. Without a token, the app shows a clear configuration message; selecting profiles requires the map to load. `.env.local` is ignored by Git. Never commit a newsroom token.

Vite embeds `import.meta.env.VITE_MAPBOX_TOKEN` at **build time**. Restart the development server after changing it and rebuild before publishing. A Mapbox public browser token is client-visible by design; it is not an AWS secret. Restrict the production token to the intended project URLs separately in Mapbox. This project does not change account settings.

## Files to edit

| File | Purpose |
| --- | --- |
| `public/data/pipeline.geojson` | Bridger centerline converted from the supplied shapefile to WGS84 GeoJSON. |
| `public/data/people.geojson` | Five point locations and their source/match metadata. |
| `public/data/fort-peck-reservation.geojson` | Selectable Fort Peck reservation boundary, replacing the tribe’s point marker. |
| `public/data/counties.geojson` | Daniels, Valley and Carter boundaries extracted from `raw-input-atlas-data/mt-counties-100m.geojson`; Valley and Carter open commission profiles. |
| `src/people.js` | Names, location labels, photographs, captions and story metadata. |
| `public/photos/` | Add profile photographs here. The four demo illustrations are retained for gallery tests. |
| `index.html` | Update the page description and any fixed introductory/branding copy. |
| `src/style.css` | Color/typography tokens and responsive layout. |
| `src/map-buttons.js` | Accessible map buttons, nearby-profile groups and the profile chooser. |
| `src/map.js` | `MAP_VIEW` for the opening extent/padding; `MAP_STYLE` for basemap, water, line widths and point radii. |

`src/main.js` coordinates selection, focus and fallbacks. `src/gallery.js` owns the carousel and image lifecycle. `src/data.js` validates local geography. Profile coordinates are stored locally; no geocoding runs in the browser. Panel text sizes are controlled by `--panel-body-size`, `--panel-caption-size` and `--panel-meta-size` in `src/style.css`, including on mobile.

### Map extent, water and basemap

These settings are at the top of `src/map.js`. Changes take effect on page reload in development; rebuild static files for production.

**Opening extent.** `MAP_VIEW.desktopBounds` uses `[[west, south], [east, north]]` longitude/latitude coordinates:

```js
desktopBounds: [[-116.05, 44.36], [-104.04, 49.0]],
mobileBounds: null,
desktopPadding: { top: 32, left: 32, bottom: 32, panelGap: 48 },
```

The 1200 × 700px desktop overview fits Montana with roughly 32px of margin, with a compact intro card at the lower left. Profiles open in the same lower-left panel; selection padding keeps their point or full boundary clear of the panel. The panel width is measured automatically. `panelGap` adds breathing room between the fitted area and the panel; you do not need to add North Dakota to the bounds yourself. Aspect ratio determines how much neighboring geography is visible. These are camera bounds, not a boundary outline or a limit on panning. `null` fits the route instead, which remains the default on mobile. Closing the viewer with **X** or **Escape** restores the configured overview.

**Map labels.** `CITY_LABELS` in `src/map.js` limits city labels to Billings, Miles City, Glasgow, Wolf Point, Great Falls, Bozeman, Helena and Kalispell. Other basemap text layers are hidden. The curated city layer uses `MAP_STYLE.labels` (20px Open Sans with a light halo); Mapbox handles collisions among city labels and the space reserved for the interactive buttons. `AREA_LABELS` supplies the interactive Valley County, Carter County and Fort Peck Indian Reservation labels, linked to their boundary profiles. County names have explicit line breaks before “County.” Only available boundaries receive buttons. Area labels can shift slightly to avoid other touch targets; a thin leader connects a shifted label to its geographic anchor.

**Selection and zoom.** Every point selection uses `MAP_STYLE.pointZoom` (9.5). Every county/reservation selection fits the full boundary, whether or not it was already visible. Closing with X or Escape restores the overview. Points within 52px horizontally and vertically are grouped in screen space into a photo button with a count. Opening that button presents each person's name as a separate touch/keyboard target; the geographic coordinates are unchanged. Zooming separates the group when there is enough room.

**Water colors and detail.** The current Light basemap stays in place, with local paint overrides:

```js
water: {
  fillColor: '#acd3e5',       // lakes and other water polygons
  lineColor: '#6ba4c1',       // rivers and streams represented as lines
  waterwayMinZoom: null,     // null keeps the style's visibility threshold
  waterwayWidth: null,       // null keeps its existing zoom-based line widths
},
```

Set `water: null` to keep the basemap's original water styling. To make available waterway lines appear earlier or heavier, try `waterwayMinZoom: 7` and `waterwayWidth: 1`, or use an expression such as:

```js
waterwayWidth: ['interpolate', ['linear'], ['zoom'], 7, 0.7, 12, 1.5, 16, 3],
```

This controls how existing features are drawn. Mapbox's water geometry is simplified and filtered by zoom; its Streets v8 `waterway` data starts around zoom 7. A statewide overview is usually farther out. Lowering a style layer's threshold cannot restore streams or shoreline detail absent from those tiles, and other style filters/opacity expressions can still affect visibility. More geographic detail at statewide scale would require a separate hydrography source, such as a local GeoJSON layer. See [Mapbox's water and waterway data reference](https://docs.mapbox.com/data/tilesets/reference/mapbox-streets-v8/).

**Basemap choices.** Edit `MAP_STYLE.basemap`. These [Mapbox classic styles](https://docs.mapbox.com/map-styles/guides/classic-styles/) can be used directly:

| Style | URL | Appearance |
| --- | --- | --- |
| Light (current) | `mapbox://styles/mapbox/light-v11` | Quiet, light background for the route. |
| Outdoors | `mapbox://styles/mapbox/outdoors-v12` | Terrain, trails and natural features. |
| Streets | `mapbox://styles/mapbox/streets-v12` | More prominent roads and place context. |
| Dark | `mapbox://styles/mapbox/dark-v11` | Dark background. |
| Satellite | `mapbox://styles/mapbox/satellite-v9` | Imagery without labels. |
| Satellite Streets | `mapbox://styles/mapbox/satellite-streets-v12` | Imagery with roads and labels. |

Water overrides only affect exposed vector water layers. They cannot recolor water photographed in satellite imagery. Existing route colors are unchanged when you switch basemaps; check contrast on the chosen style. A custom Studio style uses `mapbox://styles/YOUR_USERNAME/YOUR_STYLE_ID`. Local paint overrides do not modify or publish the account's saved style.

Mapbox also offers `mapbox://styles/mapbox/standard` and `mapbox://styles/mapbox/standard-satellite`. These use imported basemaps with configuration properties and layer slots, rather than the classic layer-editing approach above. Moving this app to Standard would also require adapting water configuration and route ordering. For Standard, the equivalent water setting is `map.setConfigProperty('basemap', 'colorWater', '#acd3e5')`, and `show3dObjects: false` keeps its 3D objects off. Satellite imagery itself still cannot be selectively recolored. See [Standard configuration](https://docs.mapbox.com/map-styles/reference/standard/) and [style configuration differences](https://docs.mapbox.com/mapbox-gl-js/guides/styles/set-a-style/).

### Pipeline GeoJSON

The route accepts a GeoJSON `Feature` or `FeatureCollection` containing `LineString` and/or `MultiLineString` geometries. Coordinates must be numeric **[longitude, latitude]** in WGS84 decimal degrees. The route must contain at least one line, with at least two positions per line. The viewport fits all route features. This regional map assumes a route that does not cross the antimeridian.

```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "properties": { "name": "Synthetic example only" },
    "geometry": {
      "type": "LineString",
      "coordinates": [[-110.28, 47.06], [-109.79, 46.87]]
    }
  }]
}
```

### Person locations

The Kleeman, Thielen, Kjos and Fladager points use the supplied exact Census address matches. Valley County Commission, Jerry Arnold and Carter County Commission use manually supplied coordinates. Valley County's manual point supersedes its non-exact Census result; Carter County's manual point replaces its unmatched address. Jerry Arnold's point identifies the supplied location on Heckner Road, not a geocoded numbered address. Manual latitude/longitude pairs have been reversed into GeoJSON's longitude/latitude order. `locationSource` records `census` or `manual`; Census points also retain `geocodeMatch`.

Fort Peck Tribes uses the Polygon/MultiPolygon boundary in `public/data/fort-peck-reservation.geojson` instead of a point. The loader links its features to `fort-peck-tribes` while retaining the supplied properties. The boundary has two parallel `#e6ab02` strokes, controlled by `MAP_STYLE.reservationColor`, `reservationWidth` and `reservationGap`. Clicking its interior or outline opens the profile; point markers take priority when hit areas overlap. Selection thickens the boundary and always fits it into the visible map area. If the boundary fails to load, profiles with other available geometry remain usable.

`public/data/people.geojson` is a `FeatureCollection` of `Point` features. Each needs a unique, nonempty **string** `properties.id` matching the metadata. A top-level feature `id` is optional; it is normalized from `properties.id`. Keep identifiers stable as names or photographs change.

```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "id": "person-a",
    "properties": { "id": "person-a" },
    "geometry": { "type": "Point", "coordinates": [-109.81, 46.89] }
  }]
}
```

This coordinate is also a synthetic example. Choose the precision of published locations with the people and editorial team. Nearby points share a counted photo button; its chooser lets readers select each person by name.

### Editorial metadata and photographs

Export the `people` array in `src/people.js`:

```js
export const people = [{
  id: 'person-a',
  name: 'Person Name',
  location: 'Editorial location label',
  description: 'Optional short contextual text.',
  photos: [{
    src: './photos/person-a-01.webp', // Small panel preview
    fullSrc: './photos/person-a-01-large.webp', // Optional; fetched only when enlarged
    alt: 'A useful description of the photograph.',
    caption: 'Optional caption.',
    credit: 'Optional photo credit.',
  }],
}];
```

Photograph URLs resolve relative to the document, so `./photos/...` works from `/pipeline/index.html`. Put files directly in `public/photos/`; Vite copies this directory to `dist/photos/`. Use descriptive alt text for every image. Preprocess newsroom photos to approximately 1,200–1,600 pixels on the long edge, preferably WebP. Landscape previews fill the frame with a centered crop; portrait previews fit without cropping and are centered with blank space on either side. The enlarged viewer always shows the full image; portrait and landscape photographs both work without changing the header dimensions. The expand control opens a keyboard-accessible viewer covering the entire interactive, including inside an iframe, without requiring fullscreen permission. Use the enlarged viewer’s arrows or keyboard Left/Right keys to move through photographs, wrapping at either end. Its counter, caption, and underlying preview stay synchronized. Close with × or Escape to return to the same photograph. There is no transformation service.

Optional descriptions, locations, captions and credits are omitted when absent. One photograph hides the carousel controls/count. Zero photographs displays a text fallback. Unknown person ids display an unavailable-profile message and preserve the selected location. Malformed/failed location data displays a status message; profiles with other available geometry remain clickable. Failed route data produces a clear message; the app does not pretend to show a valid route.

The visible story header/footer have been removed; `story.title` still supplies the browser title. Update the HTML meta description when the scope changes. Retain the `story` export alongside `people`. The route already uses the supplied Bridger geometry.

## Reader experience and accessibility

- The only legend entry is Pipeline. Raised photo buttons, count badges, and area-name buttons with a small camera icon identify the interactive features without relying on hover or a legend.
- Photo buttons have 44 × 44px targets. Nearby-profile choices are at least 48px tall. Native buttons support Tab, Enter and Space, with visible focus outlines and descriptive accessible names.
- Nearby point groups open a nonmodal chooser. Escape or its close button dismisses it and returns focus to the initiating button. Selecting a name opens that profile and zooms to its point.
- Clicking an area interior or its label opens the same county/reservation profile. Point targets take priority over areas, and Fort Peck takes priority where it overlaps Valley County. Daniels County remains a noninteractive context outline.
- Selection opens one reusable viewer, resets its gallery to the first photograph, and moves focus to it. X or Escape closes the viewer, clears the selection, resets the overview, and restores focus to the initiating button or map canvas.
- Previous/next buttons and left/right keys inside the viewer wrap at both ends. There are no global gallery key handlers or required swipe gestures.
- Reduced-motion preferences disable camera animation. Rotation and pitch are disabled; cooperative map gestures and visible Mapbox attribution are retained.

### Responsive panels and iframe sizing

The desktop graphic's maximum size is 1200 × 700px. At 900px and wider, its height scales with width (7:12), capped by 700px and the available viewport height. The directions and photo viewer share a southwest panel; zoom controls sit at the top right on desktop and bottom left on mobile. The desktop overview extent is unchanged; selected areas leave space above their geometry for the controls.

Below 900px, including portrait tablets, the map and panel stack within the full dynamic viewport height, without a 700px cap. Before selection the map takes the remaining space above a compact introduction. With a profile open, the map receives roughly 40% of the height (at least 160px), and the photo panel receives the rest. The preview height grows with the viewport. The redundant “Along the route” heading is removed from the photo viewer. The profile name, photo and 44px gallery controls fit together on typical phone screens. Long captions/descriptions scroll within the panel, while the map and close button stay available. Landscape tablets at least 900px wide use the wide layout. The breakpoint is based on space for the content, not device detection.

Open `/embed.html` for the responsive iframe preview. The parent article must set the iframe height; the app cannot determine how much space surrounding article content occupies. The following markup caps the embed to the host viewport and the desktop maximum:

```html
<style>
  .pipeline-embed {
    display: block; width: 100%; max-width: 1200px;
    height: min(700px, 100svh, 58.333vw);
    margin: 0 auto; border: 0;
  }
  @media (max-width: 899px) {
    .pipeline-embed { height: 100dvh; }
  }
</style>
<iframe
  class="pipeline-embed"
  src="https://projects.montanafreepress.org/pipeline/index.html"
  title="Pipeline route and people living nearby"
  loading="lazy" width="1200" height="700"
></iframe>
```

The host URL is the verified deployment target; the pipeline prefix is currently empty and publication is pending. The browser suite checks phones down to 320 × 568px, short phone viewports, portrait tablets and landscape/desktop layouts. It exercises real Mapbox rendering with a local basemap fixture and synthetic gallery images. Verify the actual publishing iframe, live basemap and final newsroom photographs before publication.

### Image loading

Optional `fullSrc` provides a separate large photograph for the enlarged viewer; it is fetched only when the reader opens that photograph and is never included in neighbor preloading. When omitted, the viewer reuses `src`. Captions and credits remain visible in the enlarged viewer.

Startup fetches local geography and metadata but no gallery images. Selecting a profile creates only its current image, using asynchronous decoding. After that image loads successfully, the carousel preloads its next and previous neighbors at low fetch priority (one neighbor for a two-photo profile). Navigation repeats this bounded strategy using normal browser caching. Data-saving connections skip adjacent preloading when the browser exposes that preference. Stale image callbacks cannot replace a newer selection or start preloading for a closed viewer. In-flight browser requests may finish after closing; they are not a custom image cache.

## Build and local preview

```sh
npm run build
npm run preview
```

`dist/` contains the static HTML, bundled JS/CSS, local GeoJSON and photographs. `vite.config.js` uses `base: './'`; document-relative data/photo paths work at a subdirectory URL. Serve the app over HTTP(S), not `file://`. Mapbox JS is loaded once in a separate chunk only when a token and valid route are present. Its CSS is imported through the npm build. The Mapbox renderer is the largest dependency; no frontend framework, external font or image library is included.

With the locked dependency versions, the Mapbox chunk is approximately 519 kB gzipped and application JavaScript is approximately 5 kB gzipped. A token-enabled build emits Vite's large-chunk advisory for Mapbox; it still succeeds. A build without a token can omit the map chunk entirely, so adding a token after building always requires a fresh build.

### Browser verification

```sh
npx playwright install chromium
npm test
```

Playwright is a development-only dependency. Tests run a local Vite server with a fake token and intercept Mapbox network traffic to serve a minimal local style. They exercise the **real Mapbox renderer**, local layers, selection, galleries, loading/error cases and responsive sizing without an external account or billable map requests. A missing-token case is tested separately. This is not a substitute for checking the actual Mapbox light style with your own restricted token before publication. No production token is supplied in this repository.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the inspected AWS target, production build, upload plan, rollback, and Newspack iframe setup.

### Hosting notes

The intended target is an existing S3/CloudFront setup under `s3://<bucket>/pipeline/`. When separately authorized, upload the **contents** of `dist/` into that prefix, preserving subdirectories, and serve `/pipeline/index.html`. No server process or SPA route rewriting is required. The output includes all project-owned assets; the live basemap still needs Mapbox network access and a valid public token.

Before publication:

1. Editorially verify the supplied profiles and locations, and add photographs and captions when available. Configure the public token's allowed project URLs separately in Mapbox, and check its use from the final iframe.
2. Build with the production token. Serve HTML as `text/html`, JS as `text/javascript`, CSS as `text/css`, GeoJSON as `application/geo+json` or `application/json`, WebP as `image/webp`, and SVG as `image/svg+xml`.
3. Give hashed `assets/` files long immutable caching. Keep `index.html`, GeoJSON and photographs on a shorter cache policy, or use new photo filenames when replacing images. Local GeoJSON and photo names are not content-hashed. Invalidate updated non-hashed CloudFront paths as needed.
4. Verify the host's response headers allow the intended WordPress/Newspack site to frame the project (`frame-ancestors` and any `X-Frame-Options` policy). If adding a CSP, allow the Mapbox endpoints and blob workers required by your installed Mapbox version. Test the real embed rather than guessing a restrictive policy.
5. Check Mapbox attribution, mobile controls, keyboard operation, failed-image states and console/network errors with the final token and data.

The application creates exactly one Mapbox `Map`. Selecting people, navigating photographs and resetting the route do not create another map. Local data and preprocessed images avoid extra API services. Mapbox and hosting usage still depend on article traffic and account plans; this project does not configure cloud accounts or billing.

Implementation references: [Mapbox map options](https://docs.mapbox.com/mapbox-gl-js/api/map/), [Mapbox camera padding](https://docs.mapbox.com/mapbox-gl-js/api/properties/) and [Vite relative base paths](https://vite.dev/guide/build#relative-base).
