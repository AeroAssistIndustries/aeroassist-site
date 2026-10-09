# AeroAssist portal on Cloudflare: setup

The investor and team portal runs at **portal.aeroassist.us** as one Cloudflare Worker. It has no connection to WordPress, GoDaddy or any outside sign-in service.

| Piece | Cloudflare product | What it holds |
| --- | --- | --- |
| The app | Worker `aeroassist-portal` | Pages, API, permission checks |
| Database | D1 `aeroassist-portal` | People, hashed passwords, encrypted authenticator secrets, sessions, documents list, transactions, settings, activity log |
| Files | R2 bucket `aeroassist-portal-files` | Every document, encrypted (AES-256-GCM) before it is stored |
| Secrets | Worker secrets | `FILE_KEY` (the encryption key) and `BOOTSTRAP_CODE` (first sign-in only) |

**Cost.** The Workers Paid plan is $5 a month. It's needed because secure password checks use more processing time than the free plan allows. D1 and R2 fit well inside the included free amounts for a portal this size. R2 asks for a payment method even on the free amount.

## One-time setup (about 20 minutes, all in the Cloudflare dashboard)

1. **Plan.** Go to Workers & Pages → Plans and choose **Workers Paid**.
2. **Database.**
   - Go to Storage & Databases → **D1** → Create database, and name it `aeroassist-portal`.
   - Open its **Console** tab, paste all of [`schema.sql`](schema.sql), and click **Execute**.
   - Copy the **Database ID** and send it to Claude. It isn't a secret. Claude puts it in `wrangler.toml`.
3. **File storage.** Go to Storage & Databases → **R2** → Create bucket, and name it `aeroassist-portal-files`. Leave public access **off**.
4. **Make the secrets.**
   - Open https://aeroassistindustries.github.io/aeroassist-site/portal-cf/tools/keygen.html. It makes `FILE_KEY` and `BOOTSTRAP_CODE` in your browser and sends nothing anywhere.
   - Save `FILE_KEY` in your password manager. If it's lost, the documents can't be decrypted.
5. **Deploy from GitHub.**
   - Go to Workers & Pages → Create → **Import a repository**. Choose `AeroAssistIndustries/aeroassist-site`, and set the **Root directory** to `portal-cf`.
   - Keep the deploy command `npx wrangler deploy`, then click **Deploy**.
   - Every change Claude pushes to GitHub now deploys by itself.
6. **Add the secrets.**
   - Go to Workers & Pages → `aeroassist-portal` → Settings → **Variables and Secrets**.
   - Add `FILE_KEY` and `BOOTSTRAP_CODE`, both as type **Secret**.
7. **Web address.**
   - In the same Settings, go to **Domains & Routes** → Add → **Custom domain**, and enter `portal.aeroassist.us`.
   - Cloudflare creates the DNS record and certificate itself.
8. **First administrator.**
   - Open https://portal.aeroassist.us/#first-run and enter the `BOOTSTRAP_CODE`, your name and the email you'll sign in with.
   - Choose a password, scan the QR code with your authenticator app, and **save the recovery codes**.
   - Then delete the `BOOTSTRAP_CODE` secret in Cloudflare.
9. **Jay.** Go to People → Add a person, and choose Jay with the role **Administrator**. Copy the one-time link and send it to him.
10. **Documents.** Go to **Import** and choose the zip of the old `portal-input` folder (from *AeroAssist_Portal_Private_Setup.zip*). The 29 library documents and the settings are uploaded and encrypted. Delete the zip afterwards.
11. **Website.**
    - Point the "Investor and team portal" menu link on aeroassist.us to `https://portal.aeroassist.us`.
    - Deactivate and delete the AeroAssist Portal WordPress plugin; it isn't used any more.
    - If you added a Cloudflare "Under Attack" or bot challenge for the site, leave `portal.aeroassist.us` out of it, or the sign-in page will be challenged too.

## Everyday jobs

| Job | Where |
| --- | --- |
| Add an investor, prospect or team member | **People → Add a person**. Copy the one-time link and text or email it to them. They choose their own password and set up an authenticator app. The link works once and lasts 7 days. |
| Someone forgot their password | Open their name in **People**, click **Forgot password: reset it**, and send them the new link. |
| Someone lost their phone | Open their name in **People**, click **Reset two-factor (lost phone)**, and send them the new link to set up the new phone. |
| Upload a K-1 | Open their name in **People** → Personal documents, choose Tax (K-1), and upload. Or use **Manage documents** with "One person". |
| Upload a report for all unit holders | **Manage documents**, audience "Unit holders only" |
| Record a purchase, transfer or distribution | **Transactions**, or the person's page |
| Change the unit price, announcements, tax note or company facts | **Settings** |
| See who opened what | **Activity log**, with filters and **Export CSV** |
| Someone leaves | Open their name in **People** and click **Switch off access**. They are signed out at once, and their records are kept. |

## Security in brief

- **Sign-in.** Everyone has their own email, password and authenticator code. A password alone never opens anything, and a new authenticator can only be set up from a one-time link.
- **Passwords and codes.** Passwords are stored with PBKDF2-SHA256 plus a secret key. Recovery codes are stored as keyed hashes. Authenticator secrets are encrypted.
- **Sessions.** Sign-ins last at most 12 hours, with sign-out after 30 minutes of inactivity (adjustable in Settings). Unfinished sign-ins expire after 10 minutes.
- **Brute-force limits.** Wrong passwords and codes are rate-limited per person and per address. Attackers can't learn which emails have accounts, and one person's mistakes can't lock anyone else out.
- **Documents.** Each one is checked against the person's role on every open, then logged. Files are encrypted at rest with a key that only the Worker holds.
- **Browser protections.** A strict content security policy, no framing, no caching of private pages, and cross-site request protection.
- **Remaining risk.** Anyone with full access to the Cloudflare account can change the Worker. Protect that account with two-factor and keep its members to Sarvesh and Jay.

## For developers

```bash
npm i -g wrangler
wrangler d1 execute aeroassist-portal --local --file schema.sql
printf 'FILE_KEY=...\nBOOTSTRAP_CODE=...\n' > .dev.vars
wrangler dev
```
