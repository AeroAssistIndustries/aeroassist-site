# Live theme changes (aeroassist.us, theme "aeroassist")

Made in WordPress → Tools → Theme File Editor on 2026-10-09. The theme itself isn't in this repo.

- `functions.php`: `aa_portal_url()` (the Cloudflare portal address) and redirects from /portal/ and /documents/ to it.
- `functions.php`: a calmer look: same fonts, colours and layout, minus the headline shimmer, glows, scanlines, hover spotlight, flight readouts, clock and race widget; the 3D city is muted. (`functions-pro-look.php.txt` is an earlier, rejected version that changed the font and colours.)
  Switch with `AA_PRO_MODE`: `'preview'` (admins and `?look=pro` only), `'live'` (everyone), `'off'`.
- `page-invest.php`: new investor page (portal sign-in, request access, old access-code form behind a link).
- All page templates: menu item "Company documents" → "Investor and team portal".
- Backups of the original `functions.php` and `page-invest.php` (base64): private WordPress page "Theme backup 2026-10-09".
