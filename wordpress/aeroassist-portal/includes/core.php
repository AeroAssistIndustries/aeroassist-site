<?php
/**
 * Shared definitions: roles, library groups, settings, people, documents and the activity log.
 */

defined( 'ABSPATH' ) || exit;

/** Portal roles: WordPress role slug => [portal role, label]. */
function aap_roles() {
	return array(
		'aa_prospect' => array( 'prospect', 'Prospective investor' ),
		'aa_investor' => array( 'investor', 'Unit holder' ),
		'aa_employee' => array( 'employee', 'AeroAssist team' ),
		'aa_admin'    => array( 'admin', 'Portal administrator' ),
	);
}

/** Library groups => portal roles that may open them. */
function aap_groups() {
	return array(
		'company'   => array( 'prospect', 'investor', 'employee', 'admin' ),
		'investors' => array( 'prospect', 'investor', 'admin' ),
		'holders'   => array( 'investor', 'admin' ),
		'team'      => array( 'employee', 'admin' ),
		'admin'     => array( 'admin' ),
	);
}

function aap_group_labels() {
	return array(
		'company'   => 'Company (everyone)',
		'investors' => 'Investors and prospects',
		'holders'   => 'Unit holders only',
		'team'      => 'Team only',
		'admin'     => 'Administrators only',
	);
}

/** Categories for personal documents. */
function aap_personal_categories() {
	return array(
		'tax'          => 'Tax (K-1)',
		'certificates' => 'Certificate',
		'agreements'   => 'Agreement',
		'updates'      => 'Investor update',
		'team'         => 'Employment',
		'other'        => 'Other',
	);
}

function aap_role_labels() {
	return array(
		'prospect' => 'Prospective investor',
		'investor' => 'Unit holder',
		'employee' => 'AeroAssist team',
		'admin'    => 'Administrator',
	);
}

/** File types the portal accepts. */
function aap_allowed_types() {
	return array(
		'pdf'  => 'application/pdf',
		'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		'xls'  => 'application/vnd.ms-excel',
		'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		'doc'  => 'application/msword',
		'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
		'csv'  => 'text/csv',
		'txt'  => 'text/plain',
		'png'  => 'image/png',
		'jpg'  => 'image/jpeg',
		'jpeg' => 'image/jpeg',
	);
}

function aap_table( $name ) {
	global $wpdb;
	return $wpdb->prefix . 'aap_' . $name;
}

/* ------------------------------------------------------------------ settings */

function aap_default_settings() {
	return array(
		'as_of'             => gmdate( 'Y-m-d' ),
		'units_outstanding' => 10000,
		'round_units'       => 1000,
		'round_name'        => 'the $2M round',
		'unit_price'        => 0,
		'price_label'       => '',
		'price_history'     => array(),
		'announcements'     => array(),
		'tax_note'          => '',
		'company_facts'     => array(),
		'note'              => '',
		'about'             => 'AeroAssist Industries designs, fabricates and builds drone-as-first-responder aircraft in Phoenix, Arizona, for police, fire and rescue agencies. Aircraft launch from a dock when a call comes in and stream live video to responders before the first unit arrives. Built under NDAA §848 supply-chain rules; FCC certified and CE marked.',
		'contacts'          => array(
			array( 'Jay Shah', 'Chief Financial Officer', 'Tax documents, statements, access and transfers', 'jay@aeroassist.us' ),
			array( 'Sarvesh Joshi', 'Founder and CEO', 'The business, the round and everything else', 'sarvesh@aeroassist.us' ),
		),
		'links'             => array(
			array( 'Company website', '/' ),
			array( 'The $2M round (investor relations)', '/invest/' ),
		),
		'address'           => 'AeroAssist Industries · 4750 S 44th Pl, Suite E18, Phoenix, AZ 85040',
		'help_email'        => 'jay@aeroassist.us',
		'idle_minutes'      => 30,
		'session_hours'     => 12,
		'require_2fa'       => 1,
		'admins_manage'     => 1,
		'notify_uploads'    => 1,
	);
}

function aap_settings() {
	$s = get_option( 'aap_settings', array() );
	return wp_parse_args( is_array( $s ) ? $s : array(), aap_default_settings() );
}

function aap_setting( $key ) {
	$s = aap_settings();
	return isset( $s[ $key ] ) ? $s[ $key ] : null;
}

function aap_update_settings( array $changes ) {
	$s = array_merge( aap_settings(), $changes );
	update_option( 'aap_settings', $s, false );
	return $s;
}

/* ------------------------------------------------------------------ people */

/**
 * The portal role of a user: prospect, investor, employee, admin, or '' for no access.
 *
 * @param WP_User|int|null $user User.
 */
function aap_role( $user = null ) {
	$user = $user ? ( $user instanceof WP_User ? $user : get_userdata( $user ) ) : wp_get_current_user();
	if ( ! $user || ! $user->exists() ) {
		return '';
	}
	if ( user_can( $user, 'aap_manage' ) ) {
		return 'admin';
	}
	foreach ( aap_roles() as $slug => $r ) {
		if ( in_array( $slug, (array) $user->roles, true ) ) {
			return $r[0];
		}
	}
	return '';
}

/** WordPress role slug for a portal role. */
function aap_wp_role( $portal_role ) {
	foreach ( aap_roles() as $slug => $r ) {
		if ( $r[0] === $portal_role ) {
			return $slug;
		}
	}
	return '';
}

function aap_is_portal_user( $user = null ) {
	return '' !== aap_role( $user );
}

function aap_user_groups( $role ) {
	$out = array();
	foreach ( aap_groups() as $g => $roles ) {
		if ( in_array( $role, $roles, true ) ) {
			$out[] = $g;
		}
	}
	return $out;
}

/** Every user with portal access (portal roles plus anyone who manages the portal). */
function aap_portal_users() {
	$users = get_users(
		array(
			'role__in' => array_merge( array_keys( aap_roles() ), array( 'administrator' ) ),
			'orderby'  => 'display_name',
		)
	);
	return array_values( array_filter( $users, 'aap_is_portal_user' ) );
}

/** Portal ID for a user, created on first use (AA-0001, AA-0002, …). */
function aap_portal_id( $user_id ) {
	$id = get_user_meta( $user_id, 'aap_id', true );
	if ( $id ) {
		return $id;
	}
	$id = aap_next_portal_id();
	update_user_meta( $user_id, 'aap_id', $id );
	return $id;
}

function aap_next_portal_id() {
	global $wpdb;
	$ids = $wpdb->get_col( $wpdb->prepare( "SELECT meta_value FROM {$wpdb->usermeta} WHERE meta_key = %s", 'aap_id' ) );
	$max = 0;
	foreach ( $ids as $v ) {
		if ( preg_match( '/^AA-(\d+)$/', $v, $m ) ) {
			$max = max( $max, (int) $m[1] );
		}
	}
	return sprintf( 'AA-%04d', $max + 1 );
}

function aap_find_user_by_portal_id( $portal_id ) {
	$users = get_users(
		array(
			'meta_key'   => 'aap_id', // phpcs:ignore WordPress.DB.SlowDBQuery
			'meta_value' => strtoupper( trim( $portal_id ) ), // phpcs:ignore WordPress.DB.SlowDBQuery
			'number'     => 1,
		)
	);
	return $users ? $users[0] : null;
}

/** Holding details for a user. */
function aap_holder( $user ) {
	$u = $user instanceof WP_User ? $user : get_userdata( $user );
	return array(
		'name'     => $u->display_name,
		'email'    => $u->user_email,
		'units'    => (float) get_user_meta( $u->ID, 'aap_units', true ),
		'since'    => (string) get_user_meta( $u->ID, 'aap_since', true ),
		'invested' => (float) get_user_meta( $u->ID, 'aap_invested', true ),
		'title'    => (string) get_user_meta( $u->ID, 'aap_title', true ),
	);
}

/* ------------------------------------------------------------------ documents */

function aap_get_doc( $id ) {
	global $wpdb;
	return $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . aap_table( 'docs' ) . ' WHERE id = %d', $id ) );
}

/** Whether a user may open a document. */
function aap_can_view_doc( $user, $doc ) {
	$role = aap_role( $user );
	if ( ! $role || ! $doc ) {
		return false;
	}
	$uid = $user instanceof WP_User ? $user->ID : (int) $user;
	if ( 'personal' === $doc->grp ) {
		return (int) $doc->user_id === $uid || 'admin' === $role;
	}
	$groups = aap_groups();
	return isset( $groups[ $doc->grp ] ) && in_array( $role, $groups[ $doc->grp ], true );
}

/** Documents a user can see: [ personal[], library[] ]. Admins see only their own personal documents here. */
function aap_docs_for( $user ) {
	global $wpdb;
	$role   = aap_role( $user );
	$t      = aap_table( 'docs' );
	$mine   = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $t WHERE grp = 'personal' AND user_id = %d ORDER BY doc_date DESC, id DESC", $user->ID ) );
	$groups = aap_user_groups( $role );
	$lib    = array();
	if ( $groups ) {
		$in  = implode( ',', array_fill( 0, count( $groups ), '%s' ) );
		$lib = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $t WHERE grp IN ($in) ORDER BY doc_date DESC, id DESC", $groups ) ); // phpcs:ignore WordPress.DB.PreparedSQL
	}
	return array( $mine, $lib );
}

function aap_transactions( $user_id ) {
	global $wpdb;
	return $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . aap_table( 'txns' ) . ' WHERE user_id = %d ORDER BY tx_date DESC, id DESC', $user_id ) );
}

/* ------------------------------------------------------------------ activity log */

function aap_ip() {
	$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
	return substr( $ip, 0, 64 );
}

/**
 * Record an event. Actions: view, download, zip, signin, signin_failed, signout, timeout,
 * upload, replace, delete, person_add, person_edit, access_removed, twofa_reset, settings, import.
 */
function aap_log( $action, $doc_id = 0, $detail = '', $user_id = null ) {
	global $wpdb;
	$wpdb->insert(
		aap_table( 'log' ),
		array(
			'user_id'    => null === $user_id ? get_current_user_id() : (int) $user_id,
			'doc_id'     => (int) $doc_id,
			'action'     => substr( $action, 0, 20 ),
			'detail'     => substr( (string) $detail, 0, 255 ),
			'ip'         => aap_ip(),
			'ua'         => isset( $_SERVER['HTTP_USER_AGENT'] ) ? substr( sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ), 0, 255 ) : '',
			'created_at' => current_time( 'mysql', true ),
		)
	);
}

/* ------------------------------------------------------------------ two-factor */

/** Which established two-factor plugin is active: 'two-factor', 'wordfence', or ''. Two-Factor wins when both are. */
function aap_twofa_plugin() {
	if ( class_exists( 'Two_Factor_Core' ) ) {
		return 'two-factor';
	}
	return aap_has_wordfence() ? 'wordfence' : '';
}

function aap_has_wordfence() {
	return defined( 'WORDFENCE_LS_VERSION' ) || class_exists( '\WordfenceLS\Controller_WordfenceLS' );
}

/**
 * Whether a user has turned on Wordfence two-factor (an authenticator app). Wordfence then asks
 * for the code at every sign-in. Fails closed: false whenever this can't be confirmed.
 */
function aap_wordfence_2fa_active( $user_id ) {
	static $cache = array();
	$user_id = (int) $user_id;
	if ( ! $user_id || ! aap_has_wordfence() ) {
		return false;
	}
	if ( isset( $cache[ $user_id ] ) ) {
		return $cache[ $user_id ];
	}
	$active = false;
	if ( class_exists( '\WordfenceLS\Controller_Users' ) && method_exists( '\WordfenceLS\Controller_Users', 'shared' ) ) {
		$c = \WordfenceLS\Controller_Users::shared();
		$u = get_userdata( $user_id );
		if ( $u && method_exists( $c, 'has_2fa_active' ) ) {
			$cache[ $user_id ] = (bool) $c->has_2fa_active( $u );
			return $cache[ $user_id ];
		}
	}
	global $wpdb;
	foreach ( array_unique( array( $wpdb->base_prefix, $wpdb->prefix ) ) as $prefix ) {
		$t = $prefix . 'wfls_2fa_secrets';
		if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $t ) ) === $t ) {
			$active = (bool) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM $t WHERE user_id = %d", $user_id ) ); // phpcs:ignore WordPress.DB.PreparedSQL
			break;
		}
	}
	$cache[ $user_id ] = $active;
	return $active;
}

/** Where a person sets up or changes their second factor. */
function aap_twofa_setup_url() {
	if ( aap_has_wordfence() && ! class_exists( 'Two_Factor_Core' ) ) {
		return admin_url( 'admin.php?page=WFLS' );
	}
	return admin_url( 'profile.php#two-factor-options' );
}

/** Human description of a user's second factor. */
function aap_twofa_status( $user_id ) {
	if ( aap_wordfence_2fa_active( $user_id ) ) {
		return 'Authenticator app (Wordfence)';
	}
	$p = aap_twofa_plugin();
	if ( 'two-factor' === $p ) {
		$stored = get_user_meta( $user_id, '_two_factor_enabled_providers', true );
		$stored = is_array( $stored ) ? $stored : array();
		if ( in_array( 'Two_Factor_Totp', $stored, true ) && get_user_meta( $user_id, '_two_factor_totp_key', true ) ) {
			return 'Authenticator app';
		}
		if ( in_array( 'Two_Factor_Email', $stored, true ) ) {
			return 'Email code';
		}
		return aap_setting( 'require_2fa' ) ? 'Email code (default)' : 'Not set up';
	}
	if ( 'wordfence' === $p ) {
		return 'Not set up';
	}
	return 'No 2FA plugin';
}

/**
 * WordPress's own sign-in page, returning to the portal. Signing in there (rather than through a
 * form on the portal page) keeps Wordfence, Two-Factor, captchas and host login screens working.
 */
function aap_login_url() {
	// GoDaddy Managed WordPress hides the username/password form behind this flag; elsewhere it is ignored.
	return add_query_arg( 'wpaas-standard-login', '1', wp_login_url( aap_portal_url() ) );
}

/**
 * Sign out, then sign in again on the password + code form, returning to $return. Used when a
 * session skipped two-factor (e.g. GoDaddy's one-click login). Unescaped; escape when printing.
 */
function aap_reauth_url( $return ) {
	$login = add_query_arg(
		array(
			'wpaas-standard-login' => '1',
			'redirect_to'          => rawurlencode( $return ),
		),
		site_url( 'wp-login.php', 'login' )
	);
	return html_entity_decode( wp_logout_url( $login ) );
}

function aap_portal_url( $args = array() ) {
	$page = (int) get_option( 'aap_page_id' );
	$url  = $page ? get_permalink( $page ) : home_url( '/portal/' );
	return $args ? add_query_arg( $args, $url ) : $url;
}

function aap_file_url( $doc_id, $view = false ) {
	$args = array(
		'action' => 'aap_file',
		'doc'    => (int) $doc_id,
	);
	if ( $view ) {
		$args['view'] = 1;
	}
	return aap_nonce_url( add_query_arg( $args, admin_url( 'admin-post.php' ) ), 'aap_file' );
}

/** Like wp_nonce_url() but unescaped (for JSON and redirects; escape when printing). */
function aap_nonce_url( $url, $action ) {
	return add_query_arg( '_wpnonce', wp_create_nonce( $action ), $url );
}

function aap_money( $n ) {
	return ( $n < 0 ? '-$' : '$' ) . number_format( abs( round( (float) $n ) ) );
}
