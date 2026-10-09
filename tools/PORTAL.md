# Investor portal — how to run it

The portal at `/portal/` gives each unit holder a personal sign-in (investor ID + access code) to see their units, K-1s, agreements and company updates. Every file is encrypted; it opens only in the investor's browser with their own code. There is no server or database.

## Add or update investors (CFO)

1. Make a folder named `portal-input` in the site folder (git ignores it, so nothing in it is ever published unencrypted).
2. In it, create `investors.csv`:

   ```
   id,name,units,since
   AA-0001,First Last,125,2023-04-01
   ```

3. Put each PDF in the folder and list it in `documents.csv`. Use an investor ID to give a file to one person, or `*` to give it to everyone:

   ```
   investor,category,title,date,file
   AA-0001,tax,2025 Schedule K-1,2026-03-15,k1/AA-0001-2025.pdf
   *,updates,Investor update — October 2026,2026-11-15,updates/2026-10.pdf
   ```

   Categories: `tax`, `agreements`, `certificates`, `updates`, `other`.

4. Optional `settings.json`: `{"asOf": "2026-12-31", "unitsOutstanding": 10000, "note": "Message shown to every investor"}`.
5. Run `python3 tools/portal_build.py` (needs `pip install cryptography`). It rebuilds `portal/vault/` and writes each investor's access code to `portal-input/codes.csv`.
6. Commit and push `portal/vault/` only.
7. Send each investor their ID and code in two separate messages.

Codes are kept on rebuild. To rotate one, delete that investor's row from `codes.csv`, rebuild, push and send the new code. Old files stay in the repository history but open only with the old code.

## WordPress (aeroassist.us)

Install it the same way as `/invest/` and `/documents/`: a page at `/portal/` using `portal/index.html` as its template, with `portal/vault/` copied into the theme. Set `window.AA_PORTAL` to the theme's vault URL (ending in `/`) before the portal script runs.
