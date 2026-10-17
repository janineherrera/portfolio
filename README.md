# Personal Portfolio — Split-Screen Developer Hero

A zero-dependency, responsive personal portfolio website built from plain HTML, CSS and
vanilla JavaScript. The landing page uses a split-screen hero: a light-gray introduction
panel on the left and a black portrait panel on the right, divided by a bold diagonal edge.

```
.
├── index.html                     all markup + content, clearly annotated
├── Dockerfile                     validate → nginx, 2 stages
├── docker-compose.yml             local preview + optional TLS profile
├── .dockerignore
├── robots.txt
├── README.md
├── nginx/
│   ├── default.conf               http server block
│   ├── tls.conf                   https variant (opt-in compose profile)
│   └── snippets/
│       └── security-headers.conf  CSP, nosniff, referrer, permissions
├── tools/
│   └── validate.mjs               dependency-free static-site checks
└── assets/
    ├── css/styles.css             design tokens first, then components
    ├── js/main.js                 nav, scroll spy, reveals, parallax
    └── img/
        ├── portrait-placeholder.svg   ← replace with your portrait
        └── favicon.svg                ← replace with your monogram
```

No build step, no bundler, no runtime dependencies. Open `index.html` in a browser, or
serve the folder:

```bash
npx serve .          # or: python -m http.server 8000
```

---

## 0. Running it in Docker

```bash
docker compose up --build            # http://localhost:8080
docker compose down
```

Or without compose:

```bash
docker build -t portfolio .
docker run --rm -p 8080:80 portfolio
```

The image is a two-stage build:

| Stage | Base | Job |
| --- | --- | --- |
| `validate` | `node:22-alpine` | Runs `tools/validate.mjs` — a broken reference or duplicate id fails the build |
| `serve` | `nginx:stable-alpine` | Serves the validated files with gzip, cache headers and a strict CSP |

The final image contains only `index.html`, `robots.txt` and `assets/` — nothing else.

### Local validation without Docker

The same checks run standalone, which is the faster inner loop:

```bash
node tools/validate.mjs                      # always-on checks
node tools/validate.mjs --check-placeholders=1   # also fail on leftover demo content
```

### What the nginx config gives you

* gzip for text/SVG/JSON; `Cache-Control: no-cache` on HTML (redeploys land
  immediately) and `immutable, max-age=1y` on `/assets/`.
* A strict CSP with **no** `unsafe-inline`. The single inline script in `<head>` is
  allowed by its own sha256 hash (base64 form — a hex digest is *not* accepted).
  If you edit that script, regenerate the hash; the one-liner is in
  `nginx/snippets/security-headers.conf`. A mismatch degrades gracefully: the reveal
  animations stop, all content stays visible.
* `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy`. HSTS ships commented out in `default.conf` and
  enabled in `tls.conf` — enable it only once you are really serving HTTPS.

### Deploying over TLS

```bash
mkdir certs                      # fullchain.pem + privkey.pem (never committed)
docker compose --profile tls up -d
```

`certs/` is in both `.gitignore`-style exclusions and `.dockerignore`, so private keys
can never reach the image or version control.

### Deploying somewhere else

The image is a plain static server, so any static host works with no Docker at all —
GitHub Pages, Netlify, Cloudflare Pages, S3 + CloudFront. Point them at the repository
root and they will serve `index.html` directly.

---

## 1. Replace the placeholder content

Everything you need to change is marked with an `✏️  EDIT` comment in `index.html`.
Search for that string to jump straight to each spot.

| What | Where |
| --- | --- |
| Page title, meta description, OG tags, canonical URL, JSON-LD | `index.html` → `<head>` |
| Monogram initials + brand name/role | `index.html` → `.brand` (header **and** footer) |
| Greeting, name, role, intro paragraph | `index.html` → `.hero__intro` |
| Email address (`mailto:`) | `.social` tiles + `.contact__intro .btn` + `.contact__links` |
| GitHub / LinkedIn URLs | `.social` tiles + `.contact__links` + the JSON-LD block |
| Portrait image | `.hero__portrait img` → `src` |
| About copy + fact list | `.about` |
| Skills groups | `.skills` |
| Projects | `.cards` |

> A longer name is fine — it wraps, and `.hero__name` has `overflow-wrap: break-word`
> so it never forces a horizontal scrollbar. If you use a much longer name, drop
> `--hero-name-size` in `styles.css` a step so it stays clear of the diagonal.

### Portrait

Drop your photo at `assets/img/portrait.jpg` (or `.png`/`.webp`) and point the `src`
at it. Two cases:

* **Transparent-background cutout (recommended, matches the reference)** — keep
  `object-fit: contain` in `.hero__portrait img`. Nothing else to change.
* **Regular photograph** — switch to `object-fit: cover` and tune `object-position`
  (e.g. `50% 20%`). The figure is cropped at the bottom of the hero, like the reference.

The placeholder SVG is a stylized silhouette so the page never shows a broken image.
Delete `portrait-placeholder.svg` once your own asset is in place, and update the
`og:image` meta tag too.

### Adding a project

Copy any `<article class="card reveal">…</article>` block and edit the contents. The
`card__media--a…d` modifier classes give each card a distinct tone; reuse or add new ones.

### Adding a skill group

Copy a whole `<section class="skill-group reveal">…</section>` block. Keep the
`aria-labelledby` on the heading pointing at that block's own `id`.

---

## 2. Retheming

All colours, type, spacing and the diagonal geometry live in the `:root` block at the
top of `assets/css/styles.css`:

```css
:root {
  --c-panel:      #D8D8D8;  /* left hero panel   */
  --c-black:      #050505;  /* right hero panel */
  --c-ink:        #050505;
  --c-muted:      #858585;
  --c-tile:       #CBCBCB;  /* social tiles     */

  --hero-diag-top:    62%;  /* where the diagonal meets the top edge    */
  --hero-diag-bottom: 44%;  /* …and the bottom edge (higher = shallower) */
  --hero-name-size:   clamp(2.9rem, 6.2vw, 5.75rem);
}
```

Change `--hero-diag-top` / `--hero-diag-bottom` to reshape the diagonal without
touching any layout rules. Raise both numbers together to make the cut shallower.
Keep `diag-top` at or above ~58% and `diag-bottom` at or above ~42%, otherwise the
boundary will start crossing the top-right navigation or clip the intro copy.

Fonts load from Google Fonts (Inter) with a system-font fallback stack, so the page
still looks right if the network request fails or is blocked. To self-host, drop the
`.woff2` files in `assets/fonts/` and replace the `<link>` with an `@font-face` rule.

---

## 3. Responsive behaviour

| Breakpoint | Layout |
| --- | --- |
| `> 880px` | Split-screen hero with the diagonal divider; horizontal nav; hamburger hidden |
| `881px` – `1024px` (tablet) | Same split, typography and portrait scale down via `clamp()` |
| `<= 880px` | Hero stacks into a single column (gray intro above black portrait) keeping the diagonal as an angled divider; nav collapses into a full-screen menu |

`overflow-x: hidden` on `body` guards against stray horizontal scroll on very narrow
screens. Normal browser zoom is never disabled, and the meta viewport allows it.

---

## 4. Accessibility & quality notes

* Semantic landmarks: `header` / `nav` / `main` / `section` / `footer`, one `h1`,
  ordered headings, `aria-labelledby` on every section.
* Skip-to-content link, visible `:focus-visible` outline on all interactive elements.
* Every social tile is a real link with a descriptive `aria-label`; external links use
  `target="_blank" rel="noopener noreferrer"` and announce "(opens in a new tab)".
* Decorative colour panels are `aria-hidden`; the sprite of icons is `aria-hidden`.
* `prefers-reduced-motion` disables smooth scrolling, reveal animations and the
  portrait parallax, and reveals all content immediately.
* Reveal animations only hide content when JS is running (`.js` class set in `<head>`),
  so nothing is invisible if scripts fail.
* Light/dark meta colour scheme, descriptive title and meta description, canonical URL,
  Open Graph tags and JSON-LD `Person` structured data for SEO basics.

## 5. Browser support

Current Chrome, Edge, Firefox and Safari. Uses `clip-path`, `aspect-ratio`,
`svh`/`dvh` units, `IntersectionObserver` and `backdrop-filter`, all with graceful
fallbacks.

## 6. Out of scope for v1

No CMS, no auth, no backend contact form, no blog or analytics dashboard. To add a
working contact form later, point the `#contact` button at a form service
(Formspree, Netlify Forms, etc.).