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

Open the local URL printed by Vite. Without a token, the app shows a clear configuration message and still allows the profiles to be explored. `.env.local` is ignored by Git. Never commit a newsroom token.

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
| `src/map.js` | `MAP_VIEW` for the opening extent/padding; `MAP_STYLE` for basemap, water, line widths and point radii. |

`src/main.js` coordinates selection, focus and fallbacks. `src/gallery.js` owns the carousel and image lifecycle. `src/data.js` validates local geography. Profile coordinates are stored locally; no geocoding runs in the browser. Panel text sizes are controlled by `--panel-body-size`, `--panel-caption-size` and `--panel-meta-size` in `src/style.css`, including on mobile.

### Map extent, water and basemap

These settings are at the top of `src/map.js`. Changes take effect on page reload in development; rebuild static files for production.

**Opening extent.** `MAP_VIEW.desktopBounds` uses `[[west, south], [east, north]]` longitude/latitude coordinates:

```js
desktopBounds: [[-116.1, 44.3], [-103.95, 49.1]],
mobileBounds: null,
desktopPadding: { top: 66, left: 48, bottom: 60, panelGap: 48 },
```

The desktop overview loosely encloses Montana across the full map, with a compact intro card at the lower left. Profiles open in the same lower-left panel; selection padding keeps their point or full boundary clear of the panel. The panel width is measured automatically. `panelGap` adds breathing room between the fitted area and the panel; you do not need to add North Dakota to the bounds yourself. Aspect ratio determines how much neighboring geography is visible. These are camera bounds, not a boundary outline or a limit on panning. `null` fits the route instead, which remains the default on mobile. **Reset view** restores the configured overview.

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

Fort Peck Tribes uses the Polygon/MultiPolygon boundary in `public/data/fort-peck-reservation.geojson` instead of a point. The loader links its features to `fort-peck-tribes` while retaining the supplied properties. The boundary has two parallel `#e6ab02` strokes, controlled by `MAP_STYLE.reservationColor`, `reservationWidth` and `reservationGap`. Clicking its interior or outline opens the profile; point markers take priority when hit areas overlap. Selection thickens the boundary and fits it into the visible map area when necessary. If the boundary fails to load, the other points and all profiles remain available.

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

This coordinate is also a synthetic example. Choose the precision of published locations with the people and editorial team. Overlapping locations can always be selected separately through the accessible menu.

### Editorial metadata and photographs

Export the `people` array in `src/people.js`:

```js
export const people = [{
  id: 'person-a',
  name: 'Person Name',
  location: 'Editorial location label',
  description: 'Optional short contextual text.',
  photos: [{
    src: './photos/person-a-01.webp',
    alt: 'A useful description of the photograph.',
    caption: 'Optional caption.',
    credit: 'Optional photo credit.',
  }],
}];
```

Photograph URLs resolve relative to the document, so `./photos/...` works from `/pipeline/index.html`. Put files directly in `public/photos/`; Vite copies this directory to `dist/photos/`. Use descriptive alt text for every image. Preprocess newsroom photos to approximately 1,200–1,600 pixels on the long edge, preferably WebP. Images are contained rather than cropped; portrait and landscape photographs both work. There is no transformation service.

Optional descriptions, locations, captions and credits are omitted when absent. One photograph hides the carousel controls/count. Zero photographs displays a text fallback. Unknown person ids display an unavailable-profile message and preserve the selected location. Malformed/failed location data leaves available editorial profiles accessible in the menu. Failed route data produces a clear message; the app does not pretend to show a valid route.

The visible story header/footer have been removed; `story.title` still supplies the browser title. Update the HTML meta description when the scope changes. Retain the `story` export alongside `people`. The route already uses the supplied Bridger geometry.

## Reader experience and accessibility

- Montana is fitted on desktop with the intro card at the lower left; open profiles reuse the same lower-left panel. Mobile fits the full route. No person is selected initially.
- Circle layers represent people; a larger selected point and an outlined ring provide a persistent selection that does not depend only on color. Invisible 44-pixel-diameter hit areas make tapping easier.
- Hover over a point to enlarge it and see its name with a “Click to explore” prompt. Hovering over Fort Peck or the Valley/Carter commission areas shades the boundary and shows the profile name. Points take priority over boundaries, and Fort Peck takes priority where it overlaps Valley County. Daniels County is an outline only. Tooltips clear when the pointer leaves, the map moves, or a profile is selected.
- Select a map point or use the native **Explore a profile** menu. The menu gives keyboard and screen-reader users access to the same profiles without navigating a map canvas.
- Selection opens the HTML viewer, resets the gallery to its first photograph, and moves focus to the labeled viewer. Closing or pressing Escape within the viewer returns focus to the initiating menu or map canvas.
- Previous/next buttons and left/right keys **inside the viewer** wrap at both ends. There are no global arrow-key handlers or required swipe gestures.
- **Reset view** closes the panel and restores the configured overview. Selecting someone else reuses the same viewer and map. Empty-map clicks leave the profile open.
- Rotation and pitch are disabled. Cooperative gestures reduce accidental map movement in an article. Mapbox attribution remains visible. Reduced-motion preferences disable application camera animation.

### Responsive panels and iframe sizing

At 700px and wider, directions and selected profiles share one 350–420px panel anchored southwest, with the profile menu and reset button inside it. The graphic is capped at 1200px wide. The story header and footer have been removed. Controls and metadata use 18px text, captions 22px, and body copy 24px, with larger headings.

Below 700px, the shared panel flows **below** the map. The map stays 400–560px tall (70% of the viewport within that range), and long profiles expand naturally with page scrolling rather than scrolling inside a card. Opening a profile brings its header into view. On desktop, long profile content scrolls inside the panel while its heading, close button and menu stay available. A `ResizeObserver` handles resizing between layouts and keeps selected geography visible.

The embed is designed for widths up to 1200px on desktop and 660px on mobile, and shrinks to narrower phone screens. Open `/embed.html` for a responsive preview (800px tall on desktop, 760px on mobile). The parent article must give the iframe a height. On desktop the app fills that viewport; on mobile the iframe scrolls vertically to show the map and the full profile below it. It does not automatically resize the parent page. Use a descriptive iframe `title`, and provide the essential reporting in the article as well. Example markup to adapt in Newspack:

```html
<style>
  .pipeline-embed { display: block; width: 100%; max-width: 1200px; height: 800px; margin: 0 auto; border: 0; }
  @media (max-width: 699px) {
    .pipeline-embed { max-width: 660px; height: 760px; }
  }
</style>
<iframe
  class="pipeline-embed"
  src="https://projects.montanafreepress.org/pipeline/index.html"
  title="Pipeline route and people living nearby"
  loading="lazy"
  width="1200"
  height="800"
></iframe>
```

The host URL above is illustrative; nothing is deployed by this repository. Check the actual article at 320, 375/390, 660, 768/900 and 1200px widths and at short iframe heights. The browser suite also checks these viewport sizes. Very short embeds force readers to scroll the photo panel more; use at least 560px height when the article layout permits. Verify the final embed with keyboard navigation, VoiceOver or another screen reader, and the actual production photos.

### Image loading

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

## Deployment notes — no deployment is performed

The intended target is an existing S3/CloudFront setup under `s3://<bucket>/pipeline/`. When separately authorized, upload the **contents** of `dist/` into that prefix, preserving subdirectories, and serve `/pipeline/index.html`. No server process or SPA route rewriting is required. The output includes all project-owned assets; the live basemap still needs Mapbox network access and a valid public token.

Before publication:

1. Editorially verify the supplied profiles and locations, and add photographs and captions when available. Configure the public token's allowed project URLs separately in Mapbox, and check its use from the final iframe.
2. Build with the production token. Serve HTML as `text/html`, JS as `text/javascript`, CSS as `text/css`, GeoJSON as `application/geo+json` or `application/json`, WebP as `image/webp`, and SVG as `image/svg+xml`.
3. Give hashed `assets/` files long immutable caching. Keep `index.html`, GeoJSON and photographs on a shorter cache policy, or use new photo filenames when replacing images. Local GeoJSON and photo names are not content-hashed. Invalidate updated non-hashed CloudFront paths as needed.
4. Verify the host's response headers allow the intended WordPress/Newspack site to frame the project (`frame-ancestors` and any `X-Frame-Options` policy). If adding a CSP, allow the Mapbox endpoints and blob workers required by your installed Mapbox version. Test the real embed rather than guessing a restrictive policy.
5. Check Mapbox attribution, mobile controls, keyboard operation, failed-image states and console/network errors with the final token and data.

The application creates exactly one Mapbox `Map`. Selecting people, navigating photographs and resetting the route do not create another map. Local data and preprocessed images avoid extra API services. Mapbox and hosting usage still depend on article traffic and account plans; this project does not configure cloud accounts or billing.

Implementation references: [Mapbox map options](https://docs.mapbox.com/mapbox-gl-js/api/map/), [Mapbox camera padding](https://docs.mapbox.com/mapbox-gl-js/api/properties/) and [Vite relative base paths](https://vite.dev/guide/build#relative-base).
