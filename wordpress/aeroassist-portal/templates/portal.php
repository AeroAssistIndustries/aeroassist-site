<?php
/**
 * Standalone portal page (no theme header or footer, so the dashboard looks the same on any theme).
 */

defined( 'ABSPATH' ) || exit;

$aap_user  = wp_get_current_user();
$aap_state = aap_session_state();
$aap_role  = aap_role( $aap_user );
$aap_ok    = 'ok' === $aap_state && $aap_role;
$aap_icon  = get_site_icon_url( 64 );
$aap_icon  = $aap_icon ? $aap_icon : AAP_URL . 'assets/mark.png';
// phpcs:ignore WordPress.Security.NonceVerification
$aap_out = isset( $_GET['signed_out'] ) ? sanitize_key( $_GET['signed_out'] ) : '';
?><!doctype html>
<html lang="en-US">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="same-origin">
<title>Investor and team portal — AeroAssist Industries</title>
<link rel="icon" href="<?php echo esc_url( $aap_icon ); ?>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="<?php echo esc_url( AAP_URL . 'assets/portal.css?v=' . AAP_VERSION ); ?>">
<style>.ip{--mark:url(<?php echo esc_url( AAP_URL . 'assets/mark.png' ); ?>)}</style>
</head>
<body class="aap-body">
<a class="ip-skip" href="#ipMain">Skip to content</a>
<?php if ( $aap_ok ) : ?>
<div class="ip" id="ptApp">
	<header class="ip-top">
		<div class="ip-brand"><span class="ip-mark" aria-hidden="true"></span><span><b>AeroAssist Industries</b><i>Investor portal</i></span></div>
		<div class="ip-user">
			<span class="ip-asof" id="dbAsOf"></span>
			<span class="ip-av" id="dbAv" aria-hidden="true">A</span>
			<span class="ip-who"><b id="dbName">Welcome</b><i id="dbRole">Portal</i></span>
			<a class="ip-out" id="ptOut" href="<?php echo esc_url( wp_logout_url( aap_portal_url( array( 'signed_out' => 1 ) ) ) ); ?>">Sign out</a>
		</div>
	</header>
	<div class="ip-body">
		<nav class="ip-nav" id="dbNav" aria-label="Portal sections"></nav>
		<main class="ip-main" id="ipMain">
			<div class="ip-head">
				<div><p class="ip-k" id="dbKicker"></p><h1 id="dbTitle">Overview</h1></div>
				<div class="ip-actions" id="dbActions"></div>
			</div>
			<p class="ip-note" id="dbNote" hidden></p>
			<div id="dbView" class="ip-view"><p class="ip-empty">Loading…</p></div>
			<footer class="ip-foot">
				<p>Figures are company records and unaudited; your subscription and operating agreements control. Indicative values use the current round price per unit and are not an appraisal, a tax valuation, or an offer to buy or sell units.</p>
				<p><?php echo esc_html( aap_setting( 'address' ) ); ?> · <a href="<?php echo esc_url( home_url( '/' ) ); ?>">aeroassist.us</a><?php if ( get_privacy_policy_url() ) : ?> · <a href="<?php echo esc_url( get_privacy_policy_url() ); ?>">Privacy</a><?php endif; ?></p>
			</footer>
		</main>
	</div>
</div>
<script>window.AAP=<?php echo wp_json_encode( aap_portal_data( $aap_user ), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT ); ?>;</script>
<script src="<?php echo esc_url( AAP_URL . 'assets/portal.js?v=' . AAP_VERSION ); ?>"></script>
<?php else : ?>
<div class="ip ip-auth">
	<main class="ip-auth-card" id="ipMain">
		<div class="ip-brand"><span class="ip-mark" aria-hidden="true"></span><span><b>AeroAssist Industries</b><i>Investor and team portal</i></span></div>
		<?php if ( is_user_logged_in() && ! $aap_role ) : ?>
			<h1>No portal access</h1>
			<p class="ip-lead">You're signed in as <?php echo esc_html( $aap_user->display_name ); ?>, but this account doesn't have access to the portal. If you think it should, email <a href="mailto:<?php echo esc_attr( aap_setting( 'help_email' ) ); ?>"><?php echo esc_html( aap_setting( 'help_email' ) ); ?></a>.</p>
			<p><a class="ip-btn" href="<?php echo esc_url( wp_logout_url( aap_portal_url( array( 'signed_out' => 1 ) ) ) ); ?>">Sign out</a></p>
		<?php elseif ( is_user_logged_in() && 'needs_setup' === $aap_state ) : ?>
			<h1>Turn on two-factor</h1>
			<p class="ip-lead">One more step before your documents open: protect your account with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password or similar). It takes about a minute.</p>
			<p><a class="ip-btn pri" href="<?php echo esc_url( aap_twofa_setup_url() ); ?>">Set up an authenticator app</a></p>
			<p class="ip-fine">Scan the QR code with the app, enter the 6-digit code to confirm, and save the recovery codes somewhere safe. Then come back to <a href="<?php echo esc_url( aap_portal_url() ); ?>">the portal</a>. Questions? Email <a href="mailto:<?php echo esc_attr( aap_setting( 'help_email' ) ); ?>"><?php echo esc_html( aap_setting( 'help_email' ) ); ?></a>.</p>
			<p><a class="ip-btn" href="<?php echo esc_url( wp_logout_url( aap_portal_url( array( 'signed_out' => 1 ) ) ) ); ?>">Sign out</a></p>
		<?php elseif ( is_user_logged_in() && 'no_plugin' === $aap_state ) : ?>
			<h1>Almost ready</h1>
			<p class="ip-lead">The portal is switched off until two-factor sign-in is active on this site.</p>
			<?php if ( current_user_can( 'activate_plugins' ) ) : ?>
				<p class="ip-msg err">Install and activate the free <strong>Two-Factor</strong> plugin (or Wordfence Login Security), then reload this page. <a href="<?php echo esc_url( admin_url( 'plugin-install.php?s=two-factor&tab=search&type=term' ) ); ?>">Install Two-Factor</a></p>
			<?php else : ?>
				<p class="ip-msg">Please check back shortly, or email <?php echo esc_html( aap_setting( 'help_email' ) ); ?>.</p>
			<?php endif; ?>
			<p><a class="ip-btn" href="<?php echo esc_url( wp_logout_url( aap_portal_url( array( 'signed_out' => 1 ) ) ) ); ?>">Sign out</a></p>
		<?php else : ?>
			<h1>Sign in</h1>
			<p class="ip-lead">Unit holders, prospective investors and the AeroAssist team sign in here for capital accounts, K-1s, company documents and reports.</p>
			<?php if ( 'idle' === $aap_out ) : ?>
				<p class="ip-msg" role="status">You were signed out after <?php echo (int) aap_setting( 'idle_minutes' ); ?> minutes without activity.</p>
			<?php elseif ( $aap_out ) : ?>
				<p class="ip-msg" role="status">You're signed out.</p>
			<?php endif; ?>
			<form class="ip-form" method="post" action="<?php echo esc_url( site_url( 'wp-login.php', 'login_post' ) ); ?>">
				<label for="ipUser">Email or username</label>
				<input id="ipUser" name="log" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" required>
				<label for="ipPass">Password</label>
				<input id="ipPass" name="pwd" type="password" autocomplete="current-password" required>
				<input type="hidden" name="redirect_to" value="<?php echo esc_url( aap_portal_url() ); ?>">
				<button class="ip-btn pri" type="submit">Continue</button>
			</form>
			<p class="ip-fine"><a href="<?php echo esc_url( wp_lostpassword_url( aap_portal_url() ) ); ?>">Forgot your password?</a></p>
			<p class="ip-fine">After your password we'll ask for a one-time code from your email or authenticator app. Need access? Email <a href="mailto:<?php echo esc_attr( aap_setting( 'help_email' ) ); ?>"><?php echo esc_html( aap_setting( 'help_email' ) ); ?></a>.</p>
		<?php endif; ?>
		<p class="ip-fine ip-back"><a href="<?php echo esc_url( home_url( '/' ) ); ?>">← aeroassist.us</a></p>
	</main>
</div>
<?php endif; ?>
</body>
</html>
