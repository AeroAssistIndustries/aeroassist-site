# Investor and team portal — how to run it

`/portal/` is the single front door for prospective investors, unit holders and the AeroAssist team. Each person signs in once with a portal ID and an access code. Their role decides what opens:

| Role | Raise briefing | Document library | Holder reports | Own documents |
| --- | --- | --- | --- | --- |
| prospect | yes | yes | no | yes |
| investor | yes | yes | yes | yes (K-1s, certificates) |
| employee | no | yes | no | yes (HR papers) |
| admin | yes | yes | yes | yes |

The briefing (`/invest/`) and library (`/docs/`) open already unlocked from the portal, with a "Back to your portal" button. Their old shared codes still work, so nobody who already has one is locked out. Every file is encrypted and opens only in the person's browser; there is no server or database.

## Add or update people (CFO)

1. Make a folder named `portal-input` in the site folder. Git ignores it, so nothing in it is published.
2. `people.csv`:

   ```
   id,name,role,units,since
   AA-0001,First Last,investor,125,2023-04-01
   AA-0101,First Last,employee,,
   ```

3. `documents.csv` lists personal and shared files. `investor` is a portal ID, `*` for everyone, or `@employee` / `@investor` / `@prospect` / `@admin` for a whole role:

   ```
   investor,category,title,date,file
   AA-0001,tax,2025 Schedule K-1,2026-03-15,k1/AA-0001-2025.pdf
   @investor,updates,Investor update — October 2026,2026-11-15,updates/2026-10.pdf
   @employee,team,Employee handbook,2026-10-01,hr/handbook.pdf
   ```

   Categories: `tax`, `agreements`, `certificates`, `updates`, `team`, `other`.

4. `settings.json` holds the shared-area codes (keep it private):

   ```
   {"rooms": {"briefing": "<investor page code>", "library": "<library code>", "holders": "<unit-holder code>"},
    "asOf": "2026-12-31", "unitsOutstanding": 10000, "note": "Message shown to everyone"}
   ```

   Add `"roleRooms": {"employee": ["briefing", "library"]}` to change what a role opens.

5. Run `python3 tools/portal_build.py` (needs `pip install cryptography`). It rebuilds `portal/vault/` and writes each person's code to `portal-input/codes.csv`.
6. Commit and push `portal/vault/` only.
7. Send each person their ID and code in two separate messages.

Codes are kept on rebuild. To rotate one, delete that person's row from `codes.csv`, rebuild, push and send the new code. To remove someone, delete them from `people.csv` and rebuild. Old files stay in the repository history but open only with the old code.

**Limits to know.** The library and holder reports are each locked with one shared code, which the portal hands to everyone whose role includes them. Hiding the library's internal manuals from investors, or retiring the old shared codes, needs those files re-encrypted under new codes.

## WordPress (aeroassist.us)

Install it the same way as `/invest/` and `/documents/`: a page at `/portal/` using `portal/index.html` as its template, with `portal/vault/` copied into the theme. Before the portal script runs, set `window.AA_PORTAL` to the theme's vault URL (ending in `/`) and `window.AA_PORTAL_LINKS = {briefing: "/invest/", library: "/documents/"}`. Replace the menu's "Investor relations" and "Company documents" items with one "Investor and team portal" item, as on the staging site.
