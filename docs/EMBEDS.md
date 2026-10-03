# Platform embeds and metadata: what works and what doesn't

Every saved link gets a **snapshot** (stored in `resources.metadata`, images
copied into R2) so cards keep rendering when the original changes or
disappears. Live embeds are layered on top of the snapshot and always
click-to-load (or mount only when scrolled into view).

| Platform | Metadata source | Inline playback | Pause on "another video started" |
| --- | --- | --- | --- |
| YouTube | oEmbed (+ Data API with `YOUTUBE_API_KEY`) | `youtube-nocookie` iframe behind a poster facade | Yes, IFrame API `pauseVideo` via `postMessage` |
| Instagram | Meta oEmbed with `META_OEMBED_TOKEN`, else OG tags (often a login wall) | `instagram.com/<kind>/<code>/embed/captioned/` iframe | No: the iframe is reset to its poster |
| X | `publish.twitter.com/oembed` (unauthenticated) | Official `widgets.js` (dark theme) | No: the embed is re-rendered |
| GitHub | REST API (`GITHUB_TOKEN` optional) | n/a (README rendered on demand) | n/a |
| Pinterest | OG tags | `assets.pinterest.com/ext/embed.html` iframe on request | No: reset to the image |
| Generic link | OG / Twitter card / `<title>` / favicon / JSON-LD | n/a | n/a |

## Instagram

- Public posts and reels embed through `instagram.com/p/<code>/embed`.
  Private or deleted posts render Instagram's own "unavailable" frame, and a
  cross-origin iframe can't report that reliably. We combine a 12 s load
  timeout with a manual **Embed not working?** button, which sets
  `embed_status = unavailable`. A metadata refresh that gets a 404 sets the
  same flag.
- Without a Meta app token (`app_id|client_token`), metadata is usually just
  "Instagram". Use **Override metadata** in the detail drawer or **Upload
  thumbnail** (e.g. a screenshot). Custom thumbnails survive refreshes.
- Playback can't be paused programmatically, so "one video at a time" resets
  the iframe.

## YouTube

- Reliable. Title, channel and thumbnail come from oEmbed. Published date,
  duration and description need `YOUTUBE_API_KEY`.
- If the owner disabled embedding, oEmbed returns 401/403 and the resource is
  marked `embed_status = unavailable`.
- The facade loads nothing from YouTube until you press play. Players far
  off-screen (more than 1200px) go back to their poster.

## X (Twitter)

- oEmbed and `widgets.js` are official and need no auth, but engagement
  counts and media details aren't in oEmbed (they need the paid API).
- The snapshot stores text, author, date and the sanitized oEmbed HTML.
  Deleted posts render from the snapshot. When `widgets.js` can't render a
  post, the card falls back to the snapshot.

## GitHub

- Unauthenticated API calls are limited to 60 requests/hour per IP. Set
  `GITHUB_TOKEN` (no scopes needed for public repos).
- The README is fetched lazily when you press **Show README**. GitHub renders
  it to HTML, we sanitize it (`sanitize-html` allowlist) and make relative
  links and images absolute.

## Pinterest

- There is no stable public metadata API. OG tags work for most public pins.
- `pin.it` short links are followed (max 3 redirects) and canonicalized to
  `pinterest.com/pin/<id>`.

## Generic links

- Some sites block bots or need JavaScript to render. Those fall back to a
  plain link card with **Retry**.
- We send a descriptive user agent, fetch only on add or refresh, and never
  crawl.
- All fetches go through `lib/server/ssrf.ts`: http(s) only, default ports,
  no credentials in the URL, private/loopback/link-local/CGNAT ranges blocked
  on every connection (including redirects), at most 3 redirects, an 8 s
  timeout, a 2 MB body cap and a content-type check.

## Share sheet

- Web Share Target works on Android in the installed PWA, not in iOS Safari.
  On iOS, use a Shortcut that posts to `/api/v1/capture` with a personal
  token (Settings → Personal tokens).
