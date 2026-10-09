=== AeroAssist Portal ===
Contributors: aeroassist
Requires at least: 6.4
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.0.2
License: GPLv2 or later

Investor and team portal for AeroAssist Industries.

== Description ==

* Personal WordPress accounts with the roles Prospective investor, Unit holder, AeroAssist team and Portal administrator.
* Two-factor sign-in through the Two-Factor plugin. People without an authenticator app get email codes automatically, and nobody can skip the second step.
* Documents are encrypted (libsodium) and stored outside the web root. They are sent only after a sign-in and role check, and every view and download is logged.
* Personal documents such as K-1s, certificates and agreements, plus capital accounts with TVPI and DPI, transactions and a PDF statement.
* wp-admin screens for People, Documents, Transactions, Activity log (with CSV export), Settings and a one-time Import from the old static portal.
* A full-screen light dashboard at /portal/ that looks the same whatever the theme.

See INSTALL.md for installation and day-to-day use.

== Changelog ==

= 1.0.2 =
* Sign in through WordPress's own login page (fixes sign-in with Wordfence and GoDaddy's login screen).
* Portal page is never cached by plugins, the host or Cloudflare.

= 1.0.1 =
* Works with Wordfence Login Security two-factor, alone or alongside Two-Factor.
* Send-a-test-email button in Settings.

= 1.0.0 =
* First release.
