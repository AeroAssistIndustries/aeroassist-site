# Investor and team portal — how to run it

`/portal/` is the one place for company documents, unit-holder reports, K-1s and personal paperwork. Each person signs in with a portal ID and an access code. The $2M raise briefing stays separate at `/invest/` with its own code.

## Who sees what

| Library group | prospect | investor | employee | admin |
| --- | --- | --- | --- | --- |
| company (agency and sales documents) | yes | yes | yes | yes |
| investors (one-pager, diligence checklist, operating-agreement summary, subscription agreement, NDA) | yes | yes | no | yes |
| holders (annual update, financial model, cap table) | no | yes | no | yes |
| team (manuals, policies, handbook, supply and agency contract templates) | no | no | yes | yes |
| admin (consents, templates, raise working documents) | no | no | no | yes |

This is enforced by encryption, not by hiding links. Each group has its own random key, and a person's encrypted sign-in file carries only the keys their role allows. Personal documents are encrypted with a key that only that person's sign-in carries.

## The private folder

Everything that builds the portal lives in a folder named `portal-input` (git ignores it). Keep it safe and backed up; it is not in the repository.

| File | What it is |
| --- | --- |
| `people.csv` | `id,name,role,units,since,invested` (role: prospect, investor, employee, admin; invested = total paid, optional) |
| `library.csv` | `group,category,title,description,date,file`, one row per library document |
| `library/` | the library files themselves |
| `documents.csv` | personal files: `investor,category,title,date,file` (investor = a portal ID, `*`, or `@role`) |
| `transactions.csv` | `id,date,type,units,amount,note`, one row per purchase, gift or transfer (shows on Holdings) |
| `settings.json` | `asOf`, `unitsOutstanding`, `unitPrice` (for indicative values), `priceLabel`, `priceHistory` (the price-per-unit chart), `announcements` (shown on Overview) and `note` |
| `keys.json` | the group keys, made on first build (secret) |
| `codes.csv` | everyone's access codes, made on first build (secret) |

## Common jobs

Run `python3 tools/portal_build.py` after any change (needs `pip install cryptography`), then commit and push `portal/vault/`.

- **Add a person:** add a row to `people.csv`, build, push, and send their ID and code in two separate messages.
- **Add a library document:** put the file in `library/`, add a row to `library.csv`, build, push.
- **Give someone their K-1:** put the file in the folder, add a row to `documents.csv` with their ID, build, push.
- **New code for one person:** delete their row from `codes.csv`, build, push, send the new code.
- **Someone leaves:** delete them from `people.csv`. If they could see documents that matter, also delete their groups from `keys.json` so new keys are made, then build and push. Everyone else keeps their code.

Old encrypted files stay in the repository history, readable only with the keys and codes of that time.

## WordPress (aeroassist.us)

Add a page at `/portal/` using `portal/index.html` as its template and copy `portal/vault/` into the theme. Before the portal script runs, set `window.AA_PORTAL` to the theme's vault URL (ending in `/`). Replace the `/documents/` page with a redirect to `/portal/`. The menu shows "Investor relations" (the raise) and "Investor and team portal", as on the staging site.
