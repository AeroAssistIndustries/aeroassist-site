<?php
/**
 * Sign-in rules: two-factor for every portal user, short sessions, idle sign-out,
 * no wp-admin for investors and team, a branded sign-in page and a sign-in log.
 */

defined( 'ABSPATH' ) || exit;

/** True when the user only has portal roles (no other WordPress role such as editor). */
function aap_portal_only( $user ) {
	if ( ! $user || ! $user->exists() || user_can( $user, 'aap_manage' ) ) {
		return false;
	}
	$roles = (array) $user->roles;
	return $roles && ! array_diff( $roles, array_keys( aap_roles() ) );
}

/* ------------------------------------------------------------------ two-factor */

/*
 * With the Two-Factor plugin, anyone with portal access who has not set up an authenticator
 * app gets a one-time code by email at every sign-in. Nobody can skip the second step.
 */
add_filter(
	'two_factor_enabled_providers_for_user',
	function ( $enabled, $user_id ) {
		$privileged = user_can( $user_id, 'manage_options' ) || user_can( $user_id, 'edit_users' ) || user_can( $user_id, 'promote_users' );
		if ( aap_setting( 'require_2fa' ) && ( aap_is_portal_user( $user_id ) || $privileged ) && empty( $enabled ) ) {
			$enabled = array( 'Two_Factor_Email' );
		}
		return $enabled;
	},
	20,
	2
);

/**
 * State of the current session: 'ok', 'signed_out', 'no_plugin' (two-factor is required but no
 * two-factor plugin is active) or 'needs_2fa' (signed in without the second step, e.g. before
 * the portal was installed).
 */
function aap_session_state() {
	if ( ! is_user_logged_in() ) {
		return 'signed_out';
	}
	if ( ! aap_setting( 'require_2fa' ) ) {
		return 'ok';
	}
	$p = aap_twofa_plugin();
	if ( '' === $p ) {
		return 'no_plugin';
	}
	if ( 'two-factor' === $p ) {
		// Fail closed: a Two-Factor version that cannot report on the session is treated as missing.
		if ( ! method_exists( 'Two_Factor_Core', 'is_current_user_session_two_factor' ) ) {
			return 'no_plugin';
		}
		return Two_Factor_Core::is_current_user_session_two_factor() ? 'ok' : 'needs_2fa';
	}
	// Wordfence does not mark sessions, so it is trusted only once the site owner confirms
	// in wp-config.php that Wordfence requires 2FA for the portal roles.
	return ( defined( 'AAP_TRUST_WORDFENCE_2FA' ) && AAP_TRUST_WORDFENCE_2FA ) ? 'ok' : 'no_plugin';
}

/* App passwords would bypass two-factor, so nobody with portal access (admins included) can use them. */
add_filter(
	'wp_is_application_passwords_available_for_user',
	function ( $available, $user ) {
		return aap_is_portal_user( $user ) ? false : $available;
	},
	10,
	2
);

/* ------------------------------------------------------------------ sessions */

add_filter(
	'auth_cookie_expiration',
	function ( $length, $user_id ) {
		if ( aap_is_portal_user( $user_id ) ) {
			return max( 1, (int) aap_setting( 'session_hours' ) ) * HOUR_IN_SECONDS;
		}
		return $length;
	},
	99,
	2
);

add_filter(
	'attach_session_information',
	function ( $info ) {
		$info['aap_seen'] = time();
		return $info;
	}
);

/* Sign out after a period without activity. */
add_action(
	'init',
	function () {
		if ( ! is_user_logged_in() ) {
			return;
		}
		$uid = get_current_user_id();
		if ( ! aap_is_portal_user( $uid ) ) {
			return;
		}
		$token = wp_get_session_token();
		if ( ! $token ) {
			return;
		}
		$manager = WP_Session_Tokens::get_instance( $uid );
		$session = $manager->get( $token );
		if ( ! $session ) {
			return;
		}
		$now  = time();
		$seen = isset( $session['aap_seen'] ) ? (int) $session['aap_seen'] : $now;
		$idle = max( 5, (int) aap_setting( 'idle_minutes' ) ) * MINUTE_IN_SECONDS;
		if ( $now - $seen > $idle ) {
			$manager->destroy( $token );
			wp_clear_auth_cookie();
			wp_set_current_user( 0 );
			aap_log( 'timeout', 0, '', $uid );
			if ( ! wp_doing_ajax() && ! ( defined( 'REST_REQUEST' ) && REST_REQUEST ) && ! wp_doing_cron() ) {
				wp_safe_redirect( aap_portal_url( array( 'signed_out' => 'idle' ) ) );
				exit;
			}
			return;
		}
		// phpcs:ignore WordPress.Security.NonceVerification
		$heartbeat = wp_doing_ajax() && isset( $_POST['action'] ) && 'heartbeat' === $_POST['action'];
		if ( ! $heartbeat && ( $now - $seen >= 30 || ! isset( $session['aap_seen'] ) ) ) {
			$session['aap_seen'] = $now;
			$manager->update( $token, $session );
		}
	},
	1
);

/* ------------------------------------------------------------------ where people land */

add_filter(
	'login_redirect',
	function ( $redirect, $requested, $user ) {
		if ( $user instanceof WP_User && aap_is_portal_user( $user ) ) {
			$has_portal_role = (bool) array_intersect( (array) $user->roles, array_keys( aap_roles() ) );
			$default         = ! $requested || admin_url() === $requested || admin_url( '/' ) === $requested;
			if ( aap_portal_only( $user ) || ( $has_portal_role && $default ) ) {
				return ( $requested && 0 === strpos( $requested, aap_portal_url() ) ) ? $requested : aap_portal_url();
			}
		}
		return $redirect;
	},
	99,
	3
);

/* Investors, prospects and the team use the portal, not wp-admin (their profile page stays open for two-factor settings). */
function aap_keep_out_of_admin() {
	if ( wp_doing_ajax() || ! aap_portal_only( wp_get_current_user() ) ) {
		return;
	}
	global $pagenow;
	if ( in_array( $pagenow, array( 'profile.php', 'admin-post.php' ), true ) ) {
		return;
	}
	wp_safe_redirect( aap_portal_url() );
	exit;
}
// admin_menu runs before WordPress's own "not allowed" check for admin pages; admin_init covers the rest.
add_action( 'admin_menu', 'aap_keep_out_of_admin', 0 );
add_action( 'admin_init', 'aap_keep_out_of_admin', 0 );

add_action(
	'admin_notices',
	function () {
		global $pagenow;
		if ( 'profile.php' === $pagenow && aap_portal_only( wp_get_current_user() ) ) {
			echo '<div class="notice notice-info"><p><strong>AeroAssist portal.</strong> Use the <em>Two-Factor Options</em> section below to add an authenticator app (recommended) or print backup codes. <a href="' . esc_url( aap_portal_url() ) . '">Back to the portal</a></p></div>';
		}
	}
);

/* Keep the profile page minimal for portal-only users. */
add_action(
	'admin_head-profile.php',
	function () {
		if ( aap_portal_only( wp_get_current_user() ) ) {
			echo '<style>#adminmenumain,#wpadminbar .ab-top-menu>li:not(#wp-admin-bar-my-account),.user-rich-editing-wrap,.user-syntax-highlighting-wrap,.user-admin-color-wrap,.user-comment-shortcuts-wrap,.user-admin-bar-front-wrap,.user-language-wrap,.user-url-wrap,.user-description-wrap,.user-profile-picture,#application-passwords-section,h2:has(+.form-table .user-rich-editing-wrap){display:none!important}#wpcontent{margin-left:0!important;padding:0 24px}</style>';
		}
	}
);

add_filter(
	'show_admin_bar',
	function ( $show ) {
		return aap_portal_only( wp_get_current_user() ) ? false : $show;
	}
);

/* ------------------------------------------------------------------ sign-in log */

add_action(
	'wp_login',
	function ( $login, $user ) {
		if ( aap_is_portal_user( $user ) ) {
			aap_log( 'signin', 0, '', $user->ID );
			update_user_meta( $user->ID, 'aap_last_signin', time() );
		}
	},
	10,
	2
);

add_action(
	'wp_login_failed',
	function ( $username ) {
		$u = get_user_by( 'login', $username );
		if ( ! $u ) {
			$u = get_user_by( 'email', $username );
		}
		if ( $u && aap_is_portal_user( $u ) ) {
			aap_log( 'signin_failed', 0, 'wrong password', $u->ID );
		}
	}
);

add_action(
	'wp_logout',
	function ( $user_id = 0 ) {
		if ( $user_id && aap_is_portal_user( $user_id ) ) {
			aap_log( 'signout', 0, '', $user_id );
		}
	}
);

/* ------------------------------------------------------------------ branded sign-in page */

add_action(
	'login_enqueue_scripts',
	function () {
		wp_enqueue_style( 'aap-login', AAP_URL . 'assets/login.css', array(), AAP_VERSION );
		wp_add_inline_style( 'aap-login', '.login h1 a{background-image:url(' . esc_url( AAP_URL . 'assets/mark.png' ) . ')}' );
	}
);
add_filter(
	'login_headerurl',
	function () {
		return aap_portal_url();
	}
);
add_filter(
	'login_headertext',
	function () {
		return 'AeroAssist Industries';
	}
);
add_action(
	'login_footer',
	function () {
		echo '<p class="aap-login-help">Investor and team portal · Need access? Email <a href="mailto:' . esc_attr( aap_setting( 'help_email' ) ) . '">' . esc_html( aap_setting( 'help_email' ) ) . '</a></p>';
	}
);

/* ------------------------------------------------------------------ invitations */

/** Email a person a link to choose their password. */
function aap_send_invite( $user ) {
	$user = $user instanceof WP_User ? $user : get_userdata( $user );
	$key  = get_password_reset_key( $user );
	if ( is_wp_error( $key ) ) {
		return $key;
	}
	$link  = network_site_url( 'wp-login.php?action=rp&key=' . $key . '&login=' . rawurlencode( $user->user_login ), 'login' );
	$first = strtok( $user->display_name, ' ' );
	$body  = "Hello $first,\n\n"
		. "You now have a sign-in for the AeroAssist Industries investor and team portal, where you'll find your documents"
		. ( 'investor' === aap_role( $user ) ? ', K-1s and capital account' : '' ) . ".\n\n"
		. "1. Choose your password here (the link works once and expires in 24 hours):\n$link\n\n"
		. '2. Sign in at ' . aap_portal_url() . "\n   Your username is: {$user->user_login}\n\n"
		. "3. Each time you sign in we'll email you a one-time code. You can switch to an authenticator app from the portal's Help and security page.\n\n"
		. 'Questions? Reply to ' . aap_setting( 'help_email' ) . ".\n\nAeroAssist Industries\n";
	$sent = wp_mail( $user->user_email, 'Your AeroAssist portal sign-in', $body );
	update_user_meta( $user->ID, 'aap_invited', time() );
	return $sent;
}
