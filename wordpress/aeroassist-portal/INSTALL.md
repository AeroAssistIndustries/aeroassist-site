# AeroAssist Portal: install and run guide

The plugin turns aeroassist.us into the investor and team portal:

- every person has their own WordPress account and password, plus two-factor;
- roles decide what each person sees;
- K-1s and other documents are stored encrypted, outside the public website;
- every view and download is logged.

Jay manages everything from **wp-admin → AeroAssist Portal**. There are no CSV files, build scripts or access codes any more.

| Who | Sees |
| --- | --- |
| Prospective investor | Company documents, investor documents (one-pager, NDA, subscription agreement, diligence checklist) |
| Unit holder | Everything above, plus unit-holder reports, financial model, cap table, their own K-1s, certificates and capital account |
| AeroAssist team | Company documents, team manuals, policies and contract templates, their own employment documents |
| Portal administrator (Jay, Sarvesh) | Everything, plus People, Documents, Transactions, Activity log and Settings |

## Requirements

- WordPress 6.4 or later. Tested on 7.1.3.
- PHP 7.4 or later. libsodium is built in.
- The free **Two-Factor** plugin. This is the established plugin maintained by WordPress.org contributors. The portal stays switched off until it is active.
- Reliable outgoing email, because sign-in codes and invitations go by email. Use an SMTP plugin such as WP Mail SMTP, connected to the aeroassist.us Google Workspace or Microsoft 365 mailbox.

## Install (developer, about 30 minutes)

1. **Back up** the site, including files and the database.
2. **Install Two-Factor.** Go to Plugins → Add New, search for "Two-Factor", then install and activate it.
3. **Set up email.** Install WP Mail SMTP, connect it to the company mailbox and send a test email. Two-factor codes and invitations depend on this working.
4. **Make a private folder above the website.** In GoDaddy's File Manager, create `aeroassist-private` next to `public_html`, not inside it. Then add this line to `wp-config.php`, above the line that says *That's all, stop editing*:
   ```php
   define( 'AAP_STORAGE_DIR', '/home/YOUR-ACCOUNT/aeroassist-private' );
   ```
   If you skip this step, the plugin tries the same spot automatically. If it can't write there, it falls back to a randomly named folder inside `wp-content`, protected by `.htaccess`. That fallback still works, because the files are encrypted, but it is the second-best option.
5. **Upload the plugin.** Go to Plugins → Add New → Upload Plugin, choose `aeroassist-portal.zip`, then Activate. This creates the four roles, three database tables and a page at **/portal/**.
6. **Move the encryption key into wp-config.php.** Open AeroAssist Portal → Settings → Security. Copy the `define( 'AAP_FILE_KEY', '…' );` line into `wp-config.php` and save a copy in the company password manager. Without this key the documents cannot be decrypted. Don't change the key after documents have been uploaded.
7. **Check the Security panel.** Every row should show **OK**. If the document folder row says the web server is serving it, fix step 4.
8. **Exclude the portal from caching.** In GoDaddy caching, a cache plugin or Cloudflare, bypass the cache for:
   - `/portal/*`
   - `/wp-login.php`
   - `/wp-admin/*`

   The plugin already sends no-cache headers, but a misconfigured page cache is the most common way a private page leaks.
9. **Add menu links and a redirect.** Link "Investor and team portal" to `/portal/`. Redirect the old `/documents/` page to `/portal/`. The $2M briefing at `/invest/` stays as it is.

## First-day setup (Jay and Sarvesh)

1. **Give yourselves access.** Under Users, make Jay's account and Sarvesh's account **Portal administrator**. If Sarvesh needs to manage the site too, he can keep his WordPress Administrator role instead. Each of you then signs out and signs in again; an email code is required from now on.
2. **Set up an authenticator app.** Each of you goes to Profile → Two-Factor Options, adds an authenticator app (1Password, Google Authenticator or similar), and prints backup codes.
3. **Import the old portal's private folder.** Open AeroAssist Portal → **Import** and upload a zip of the `portal-input` folder.
   - This imports the 29 library documents, the settings, and anyone in `people.csv` who has an `email` column. Test accounts are skipped.
   - Running it again skips anything already imported.
   - Afterwards, **delete the zip and every copy of portal-input**, because it holds the documents unencrypted.
   - If the zip is bigger than the upload limit shown on the page, ask the developer to raise `upload_max_filesize` and `post_max_size` in GoDaddy's PHP settings. Alternatively, upload the folder by SFTP above `public_html` and use the folder option, which only a site administrator can see.
4. **Add people.** Go to People → Add a person and enter their name, email, role, and optionally units, paid-in and holder-since. They get an email with a link to choose a password. At every sign-in they get a one-time code by email until they add an authenticator app.
5. **Lock down administrator access.** Once Jay and Sarvesh both have the Portal administrator role, a site administrator unticks *WordPress administrators can manage the portal* in Settings. After that, the web developer's admin account can't open K-1s from these screens.

## Everyday jobs (Jay)

| Job | Where |
| --- | --- |
| Add an investor, prospect or team member | People → Add a person |
| Upload someone's K-1 | People → their name → *Add a personal document*. Choose Tax (K-1), pick the file and tick *Email them*. The email only says a document is ready and never attaches the file. |
| Upload a report for all unit holders | Documents → Add to the library → Unit holders only |
| Record a purchase, transfer or distribution | People → their name → *Record a transaction*, or use the Transactions page. Tick the box to update their units and paid-in. |
| Change the unit price, price history, announcements, tax note or company facts | Settings |
| See who opened what | Activity log, with filters by person, type and date, and an **Export CSV** button |
| Someone lost their phone | People → their name → **Reset two-factor**. They go back to email codes. |
| Someone forgot their password | They use "Forgot your password?" on the sign-in page, or you click **Email a new password link**. |
| Someone leaves, or a prospect should lose access | People → their name → **Remove portal access**. They are signed out at once. Their documents and history are kept. |
| Replace or remove a document | Documents → Edit |

## Security built in

- **Accounts.** Each person has their own account and password, and a WordPress-standard password reset.
- **Two-factor.**
  - Two-factor is required for everyone with portal access and for every WordPress administrator. People without an authenticator app get an email code automatically.
  - A session that never passed two-factor (for example, one started before the portal was installed) is refused and has to sign in again.
  - Application passwords are disabled for portal users, so the API can't be used to skip two-factor.
- **Document storage.**
  - Documents are stored outside the web root and encrypted with libsodium. Files have random names, and no unencrypted copy is ever written to disk; the zip download is built in memory.
  - Documents are sent only after the sign-in, two-factor, role and link checks pass.
  - File responses are `no-store`, `nosniff` and `noindex`. Only PDFs and images open in the browser; everything else downloads.
  - Uploads must be PDF, Office, CSV, text or an image, and the file's contents must match its name. A PHP file renamed to .pdf is rejected.
- **Sessions.** People are signed out after 30 minutes without activity, checked on the server. Sessions last at most 12 hours.
- **Investors and the team** never see wp-admin, apart from their own profile page for two-factor settings.
- **Portal administrators**:
  - can't edit WordPress administrators or other portal administrators;
  - can't change the security settings;
  - can't install plugins.
- **Activity log.** Sign-ins, failed sign-ins, views, downloads, refusals and every administrator change are recorded with the time, person and IP address.
- **Uninstalling** the plugin deletes nothing unless `AAP_DELETE_DATA_ON_UNINSTALL` is set to true in `wp-config.php`.

**What it can't protect against.** Anyone with full server or database access, or a WordPress administrator able to install code, can in principle reach the documents. Keep administrator accounts to the minimum, give each one two-factor, and keep the encryption key in `wp-config.php` and the password manager only.

### Using Wordfence instead of Two-Factor

Wordfence doesn't tell other plugins whether a session passed two-factor. To use it instead:

1. In Wordfence → Login Security → Settings, require 2FA for the four Portal roles and for Administrator.
2. Add `define( 'AAP_TRUST_WORDFENCE_2FA', true );` to `wp-config.php`.

Until both are done, the portal stays off. The Two-Factor plugin needs neither step and is the recommended choice.

## Testing checklist after go-live

- [ ] Sign in at /portal/ as a test unit holder. The password is accepted, an email code arrives, and the dashboard opens.
- [ ] The unit holder sees their own K-1 and no team or administrator documents.
- [ ] A test prospect sees only company and investor documents, and no "My investment" page.
- [ ] Open a document after signing out: you are sent to the sign-in page.
- [ ] Activity log shows those views and downloads.
- [ ] Settings → Security rows all show OK.
- [ ] Remove the test accounts.
