# Pipeline deployment

Prepared for the existing projects.montanafreepress.org stack. No upload or infrastructure change has been performed.

## Target recorded October 9, 2026

| Setting | Value |
| --- | --- |
| Repository | https://github.com/jolness1/pipeline-map-interactive |
| Public URL | https://projects.montanafreepress.org/pipeline/index.html |
| CloudFront distribution | `E1G7ISX2SZFY34` |
| CloudFront domain | `dik2px436sori.cloudfront.net` |
| S3 bucket / region | `projects.montanafreepress.org` / `us-west-2` |
| Project prefix | `pipeline/` (recorded empty October 9) |
| Origin | `projects.montanafreepress.org.s3-website-us-west-2.amazonaws.com` |
| Access model | Public bucket policy; S3 website custom origin; no OAC/OAI |
| Cache behavior | Default behavior only; minimum TTL 0, default 86400, maximum 31536000; compression enabled |
| Frame headers | No response-header policy configured; current 404 has no X-Frame-Options or CSP |

The entry URL was rechecked October 12, 2026: it returns `404 NoSuchKey` through CloudFront, with no X-Frame-Options or CSP header. The AWS configuration above is the October 9 record, not a fresh infrastructure audit. Upload permission and successful 200-response headers still need to be verified at first deployment. Configuration lives in `deployment/target.json`.

Reuse this distribution and its existing website origin. The planning document describes a private REST origin, but that is not what is currently deployed. Do not migrate the shared origin as part of this release. AWS supports OAC with S3 REST origins, not S3 website endpoints: [AWS origin documentation](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html).

## First upload: unfinished app at the actual URL

Use `https://projects.montanafreepress.org/pipeline/index.html` for the first upload and eventual publication. No separate test prefix, distribution, or hostname is needed. The URL is currently unlinked; its contents will still be publicly accessible. No indexing change is required for this trial.

Final photos are **not a prerequisite** for this integration check. All eight profiles currently have empty photo arrays; the app handles them. Test the basemap, route, profile panels and WordPress layout now. Photo loading, captions and gallery interactions need another live check when real photos arrive.

1. Configure the dedicated Mapbox token below.
2. Use Node 22.12+ and the AWS CLI with the intended newsroom AWS profile. Verify identity and inspect the prefix before uploading:

   ```sh
   # If needed, select your existing profile first: export AWS_PROFILE=your-profile
   aws sts get-caller-identity
   aws s3 ls s3://projects.montanafreepress.org/pipeline/ --region us-west-2
   ```

   Confirm the account with the stack owner. If files already exist, follow the rollback/archive instructions before replacing them. Listing does not establish upload permission; apply will stop on an AWS error. The deploy script uses the CLI's configured credentials and region settings.
3. Run the build/check sequence under "Prepare a release", then `npm run deploy:plan -- --invalidate`. Confirm every upload targets `s3://projects.montanafreepress.org/pipeline/` and the invalidation uses distribution `E1G7ISX2SZFY34`. The plan does not check AWS permissions or token validity.
4. Archive the complete build, including its hidden receipt, outside the public prefix. Record the Git revision and any uncommitted changes: a revision alone does not identify a dirty working tree. Deploy with `npm run deploy:apply -- --invalidate`. Wait for the returned CloudFront invalidation to complete before diagnosing stale responses.
5. Verify the standalone URL first using "After first upload". Then paste `deployment/newspack-embed.html` into a draft or staging Newspack story using the actual article template. Save, reopen the editor, and inspect the rendered page, not just the editor preview.
6. Work through the WordPress checks below on desktop and real phones. Record the article URL, browser, viewport, screenshot, console error and failing network request for each issue. Repeat after saving/updating the story to catch sanitization and caching.

Success for this first upload means the real basemap and data load, the embed survives a save, profiles open/close, and the graphic fits and scrolls acceptably in the article. Editorial completion is a later gate.

## Mapbox token setup and limits

The token is intentionally public: this app embeds `VITE_MAPBOX_TOKEN` in its built JavaScript, and browsers send it to Mapbox. A gitignored environment file prevents committing it; it does not conceal the deployed value.

Create a new token named `pipeline-web` in the [Mapbox token dashboard](https://console.mapbox.com/account/access-tokens/), separate from development. Use a public `pk.` token with **only `styles:read` and `fonts:read`** for the current GL JS basemap. The project's GeoJSON is served by S3, not Mapbox's Datasets API. Do not enable secret scopes. See [Mapbox's security recommendations](https://docs.mapbox.com/help/dive-deeper/how-to-use-mapbox-securely/) and [token API scope configuration](https://docs.mapbox.com/api/accounts/tokens/).

Set the allowed URL to **`https://projects.montanafreepress.org`**. Do not use the unrestricted default token. Wildcards and IP addresses are unsupported. Matching includes subpaths and subdomains of an allowed host; this is not an exact application identity check. Restrictions are best-effort abuse mitigation, not a guarantee: non-browser clients can forge referrer headers. See [Mapbox URL restrictions](https://docs.mapbox.com/accounts/guides/tokens/).

For this iframe architecture, requests originate in the projects-host document. The WordPress article host, CloudFront hostname and `api.mapbox.com` do not need to be added just to display this embed. Confirm the actual `Referer` on Mapbox requests in browser DevTools.

Do not add `/pipeline/` to the allowlist without changing and testing the app's referrer policy: the browser default sends only the origin on cross-origin requests, omitting the path. Keep that default for this deployment. A dedicated app hostname would separate this map from other projects on the shared host if stronger isolation becomes necessary. See [browser referrer policies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy).

Other sites could also embed this public app and generate legitimate requests from its allowed host. If that becomes a concern, a response-header CSP `frame-ancestors` allowlist can restrict who embeds it. Scope any such change to `/pipeline/*` and include all actual production/staging ancestor origins; do not change the shared distribution policy blindly. This directive requires an HTTP header, not a meta tag, and does not prevent direct visits or token copying. See [frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).

Monitor this token's usage in Mapbox Statistics during and after the trial. If abused, create a replacement, rebuild, deploy/invalidate, verify, then revoke the old token; urgent revocation may interrupt cached or open copies. Usage monitoring is not a spending cap. See [Mapbox token analytics and rotation](https://docs.mapbox.com/help/dive-deeper/how-to-use-mapbox-securely/).

## Prepare a release

1. For editorial publication, add final photos, captions, credits and alt text in `src/people.js`. Skip this for the first integration upload. Demo SVG photos are fixtures and are not referenced by the real profiles.
2. Set `VITE_MAPBOX_TOKEN=pk.…` in **`.env.production.local`** (gitignored), or supply it through the build process environment. Do not paste the token into committed files. The production build refuses to fall back to `.env.local`. It checks the token's format, not its scopes, restrictions or validity. An existing shell `VITE_MAPBOX_TOKEN` overrides the file; remove that override if you intend to use the file.
3. Run:

```sh
npm ci
npx playwright install chromium # first setup, or after a Playwright browser-version change
npm test
npm run test:deployment
npm run build:production
npm run preview
```

`dist/` is the deployable output; `base: './'` preserves `/pipeline/` paths. Production builds produce a local `.production-build.json` receipt containing file hashes, never the token. Preview the exact output before upload. A URL-restricted token may reject localhost: verify the layout with the development token separately, and verify production Mapbox requests at the final host after upload. Do not broaden production restrictions just to preview locally.

## Review and upload

```sh
npm run deploy:plan
# After reviewing the target and preview:
npm run deploy:apply
# For immediate refresh, including edited data or same-name photos:
npm run deploy:apply -- --invalidate
```

The plan makes no AWS calls. Apply uses your existing AWS CLI credentials (`AWS_PROFILE` is supported). It uploads only the reviewed build to the configured `pipeline/` prefix, with explicit MIME types and cache metadata, and publishes `index.html` last. It rejects altered/unrecognized build files. No bucket, policy, distribution or ACL changes are made.

GeoJSON is uploaded as `application/json` so it qualifies for CloudFront automatic compression; `application/geo+json` is not on its compression list. After upload, check an actual GET response with `Accept-Encoding: gzip` for `Content-Encoding: gzip` (or `br` when supported). Vite’s gzip numbers are estimates, not precompressed upload artifacts. See [CloudFront compression requirements](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/ServingCompressedFiles.html).

Hashed JS/CSS receives `public,max-age=31536000,immutable`. HTML, data and photos receive `public,max-age=300,must-revalidate`; short photo caching allows newsroom corrections to stable filenames. If moving to long-lived photo caching later, version filenames on replacement. CloudFront's existing minimum TTL of zero allows these origin cache headers to work; see [AWS cache behavior settings](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior.html).

**Do not use `sync --delete` for routine publication.** Keep old hashed assets available for readers with cached HTML. This workflow re-uploads files to ensure metadata is applied and never deletes remote objects. Retire obsolete files separately after old builds are no longer needed. Uploads are sequential, not an atomic release: version photo/data filenames when an update must coexist with older HTML.

Optional invalidation covers `/pipeline/index.html`, `/pipeline/embed.html`, `/pipeline/data/*`, and `/pipeline/photos/*`, since unchanged file names can remain cached. It does not invalidate other projects or hashed assets. Old assets are preserved for rollback.

## Newspack iframe

Use [deployment/newspack-embed.html](deployment/newspack-embed.html) as the copyable snippet. Use the explicit `/pipeline/index.html` URL. `public/embed.html` is a local/hosted preview, not the URL to put in the article (which would nest two iframes).

Use the newsroom-approved iframe block or Custom HTML method. If WordPress removes the style element, put the `.pipeline-embed` CSS in approved theme/custom CSS and assign that class to the iframe. Keep lazy loading and a meaningful title. The app document must send a referrer on its Mapbox requests; `no-referrer` or `same-origin` on that document can break URL restrictions. The iframe attribute controls the navigation request and is not a substitute for checking the child document’s outgoing requests. No camera, location or other iframe permissions are needed.

At viewport widths of 900px and above, the iframe breaks out of a centered article column, up to 1200px wide, with at least 16px of viewport space on each side. The `left: 50%` / `translateX(-50%)` rule centers it on the article column; `max-width: none` releases the usual iframe width constraint. Desktop width, max-width and margin use narrowly scoped `!important` declarations because the published theme overrides the normal embed rules. This assumes the article column is centered on the page and its ancestors do not clip overflow. An offset/sidebar layout or an ancestor with `overflow: hidden`/`clip` needs a theme-level wide block or wrapper adjustment. `public/embed.html` previews the breakout inside a centered 677px column. Desktop height is capped at 700px. Below 900px, the host CSS caps the frame to the phone's small viewport height. The child app responds to its actual iframe width; mobile stays within the article column. Check the real theme/container: a fixed-height block or a narrow article column may need its own height rule. Inside an iframe, viewport units refer to the iframe; the **parent** sizing rule is what limits the whole graphic to the phone screen. Space occupied by a sticky article header is additional; subtract its known height from the parent CSS if needed.

## WordPress integration checks

The iframe isolates the app's internal styles and scripts, but WordPress still controls its wrapper, dimensions and whether it may load.

| Symptom/check | Inspect and act |
| --- | --- |
| Embed disappears after saving | Inspect saved block markup for a removed iframe/style/class. Use the newsroom-approved embed method; move CSS to approved theme/custom CSS if stripped. |
| Standalone works, article frame is blocked | Read console errors. Check the parent page's CSP `frame-src`, the app's `frame-ancestors`/X-Frame-Options headers, and any added iframe `sandbox`. A sandbox can block scripts or change origin behavior. |
| Frame loads, basemap fails | Inspect the Mapbox response status and request `Referer`. Diagnose token/referrer errors before broadening the allowlist. Check child CSP and worker errors too. |
| Too short, clipped, or horizontally overflowing | Inspect computed iframe width/height and theme wrappers. Test the real article column, wide/full-width blocks, and 375–430px phones in portrait/landscape. Current desktop height uses the page viewport width, not article-column width. |
| Scroll or touch feels trapped | Scroll into and past the map, pan/zoom, open a profile, scroll the panel and close it. Check sticky headers, browser chrome and keyboard focus. |
| Works in editor, fails on rendered page | Compare saved markup and console/network results on the actual frontend. Where possible, test a logged-out staging page with the same optimization, consent and caching settings as publication. A logged-in draft alone cannot certify these. |
| Old version survives update | Check both CloudFront and WordPress/page caches. App invalidation does not purge the article's HTML or CSS cache. |

If photos remain absent, mark gallery/caption checks as pending, not passed. Automated fixtures exercise that UI but do not verify real photo files in the hosted article.

## After first upload

```sh
curl -I https://projects.montanafreepress.org/pipeline/index.html
curl -I https://projects.montanafreepress.org/pipeline/data/pipeline.geojson
```

Also inspect one generated asset URL from `dist/index.html` and, once available, a real photo. Check 200 status, MIME type, intended Cache-Control and no iframe-blocking headers. If an earlier 404 is cached, use the targeted invalidation option. Do not add a shared response-header policy without checking its impact on existing projects.

Verify the standalone URL and a staging Newspack story in Safari/iOS, Chrome/Android and desktop: basemap/token success, no missing files, responsive panel, close/reset, keyboard and touch controls, readable captions, lazy photo loading, and attribution. Check a separate page on an unapproved origin that makes its own Mapbox request with this token receives 403, using a fresh/uncached request. Embedding the allowed app from another site is not that negative test: its requests still originate inside the allowed app. Local browser tests use a fixture basemap, so they cannot certify production Mapbox restrictions or Safari behavior.

## Review validation (October 12, 2026)

The five deployment-script tests pass. The public entry URL still returns 404. Browser tests could not run because the required Playwright Chromium executable is absent; install it with the setup command above, then rerun `npm test`. No production token validation, upload, live WordPress check, or infrastructure change was performed during this review.

## Rollback and publication record

Before replacing a live build, archive its entire `dist/` (including the hidden production receipt) outside the public prefix. Restore that directory and run `deploy:plan`, then `deploy:apply -- --invalidate`. Rebuilding an old commit is another option, with the same production token configuration. Keeping old assets avoids breaking cached older HTML.

Record the published Git revision, publication time, archive location and Newspack article URL here after launch. The AWS target is recorded above; editorial publication remains pending token confirmation, final editorial/photo content, an upload, and the live iframe/browser checks. The first unfinished upload needs the token, upload and integration checks, but not final photos. Check Mapbox/AWS account usage and current pricing at launch; this workflow adds no application server or new distribution.
