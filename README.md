# AeroAssist Industries website — v4 (staging)

Multi-page redesign of aeroassist.us, built to match the AeroHome design system:
silver-and-gold finish, a live daytime hero render (traffic and search-and-rescue calls),
dropdown menus, and the NDAA / FAA / FCC / CE compliance strip.

Pages: `index.html` (home), `solutions.html`, `platform.html`, `operations.html`, `deploy.html`, `trust.html`, `funding.html`, `resources.html`,
`company.html`, `faq.html`, `contact.html`, `privacy.html`, `terms.html`, `404.html`.
Shared files: `assets/aa.css`, `assets/aa.js`, `images/`.

3D pages (self-contained, three.js r147 from jsDelivr):
- `lineup/` — the aircraft lineup in 3D: interactive studio (assembled, exploded, step-by-step builder with "Watch it build"),
  a "What's the job?" picker, white-background product sections with studio renders, and a comparison table.
  Linked from `products.html`. Renders in `lineup/img/` carry the AeroAssist mark on the airframe.
- `3d-viewer/` — the full-screen 3D design viewer.
- `aircraft.js` in each folder is the shared procedural model library (keep the two copies in sync).

This is a staging copy: every page carries `noindex` and `robots.txt` blocks crawlers.
The production site at aeroassist.us is unchanged.

All hero, console and dispatch data on the site is simulated.
