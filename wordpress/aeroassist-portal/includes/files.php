<?php
/**
 * Sends documents to signed-in people who are allowed to see them, and logs every one.
 */

defined( 'ABSPATH' ) || exit;

add_action( 'admin_post_aap_file', 'aap_serve_file' );
add_action( 'admin_post_aap_zip', 'aap_serve_zip' );
add_action( 'admin_post_nopriv_aap_file', 'aap_require_signin' );
add_action( 'admin_post_nopriv_aap_zip', 'aap_require_signin' );

function aap_require_signin() {
	wp_safe_redirect( aap_login_url() );
	exit;
}

function aap_deny( $message, $code = 403 ) {
	nocache_headers();
	status_header( $code );
	header( 'Content-Type: text/html; charset=utf-8' );
	echo '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>AeroAssist portal</title><div style="font:16px/1.5 system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:0 20px;color:#0b1220"><h1 style="font-size:22px">' . esc_html( $message ) . '</h1><p><a href="' . esc_url( aap_portal_url() ) . '">Back to the portal</a></p></div>';
	exit;
}

/** Common checks for every file request. */
function aap_file_gate() {
	if ( ! is_user_logged_in() ) {
		aap_require_signin();
	}
	if ( ! isset( $_GET['_wpnonce'] ) || ! wp_verify_nonce( sanitize_key( $_GET['_wpnonce'] ), 'aap_file' ) ) {
		aap_deny( 'This link has expired. Go back to the portal and open the document again.' );
	}
	if ( ! aap_is_portal_user() ) {
		aap_deny( 'Your account does not have portal access.' );
	}
	$state = aap_session_state();
	if ( 'no_plugin' === $state ) {
		aap_deny( 'Documents are unavailable until two-factor sign-in is switched on for the portal.', 503 );
	}
	if ( 'needs_setup' === $state ) {
		aap_deny( 'Turn on two-factor sign-in first, then open the document again.' );
	}
	if ( 'needs_2fa' === $state ) {
		wp_logout();
		wp_safe_redirect( aap_login_url() );
		exit;
	}
}

function aap_send_headers( $mime, $name, $inline, $length ) {
	nocache_headers();
	header( 'Cache-Control: private, no-store, max-age=0' );
	header( 'X-Content-Type-Options: nosniff' );
	header( 'X-Frame-Options: SAMEORIGIN' );
	header( 'Referrer-Policy: no-referrer' );
	header( 'X-Robots-Tag: noindex, nofollow' );
	header( 'Content-Type: ' . $mime );
	header( 'Content-Length: ' . $length );
	$ascii = preg_replace( '/[^A-Za-z0-9._-]+/', '_', $name );
	header( sprintf( 'Content-Disposition: %s; filename="%s"; filename*=UTF-8\'\'%s', $inline ? 'inline' : 'attachment', $ascii, rawurlencode( $name ) ) );
}

function aap_serve_file() {
	aap_file_gate();
	$doc  = aap_get_doc( isset( $_GET['doc'] ) ? absint( $_GET['doc'] ) : 0 ); // phpcs:ignore WordPress.Security.NonceVerification
	$user = wp_get_current_user();
	if ( ! $doc || ! aap_can_view_doc( $user, $doc ) ) {
		aap_log( 'denied', $doc ? $doc->id : 0, 'not allowed' );
		aap_deny( 'That document is not available to you.', 404 );
	}
	$data = aap_read_file( $doc->stored_name );
	if ( false === $data ) {
		aap_log( 'error', $doc->id, 'file missing or unreadable' );
		aap_deny( 'This document could not be opened. Please let the CFO know.', 500 );
	}
	// phpcs:ignore WordPress.Security.NonceVerification
	$inline = ! empty( $_GET['view'] ) && in_array( $doc->mime, array( 'application/pdf', 'image/png', 'image/jpeg' ), true );
	aap_log( $inline ? 'view' : 'download', $doc->id, 'personal' === $doc->grp && (int) $doc->user_id !== $user->ID ? 'admin access to a personal document' : '' );
	aap_send_headers( $doc->mime, $doc->file_name, $inline, strlen( $data ) );
	echo $data; // phpcs:ignore WordPress.Security.EscapeOutput
	exit;
}

/** All of the signed-in person's own documents in one zip. */
function aap_serve_zip() {
	aap_file_gate();
	$user = wp_get_current_user();
	list( $mine ) = aap_docs_for( $user );
	if ( ! $mine ) {
		aap_deny( 'You have no personal documents yet.', 404 );
	}
	// Built in memory so no unencrypted copy ever touches the disk.
	$files = array();
	foreach ( $mine as $doc ) {
		$data = aap_read_file( $doc->stored_name );
		if ( false === $data ) {
			continue;
		}
		$name = $doc->file_name ? $doc->file_name : sanitize_file_name( $doc->title );
		while ( isset( $files[ $name ] ) ) {
			$name = '1_' . $name;
		}
		$files[ $name ] = $data;
		aap_log( 'zip', $doc->id );
	}
	$out = aap_zip_in_memory( $files );
	aap_send_headers( 'application/zip', 'AeroAssist_My_Documents.zip', false, strlen( $out ) );
	echo $out; // phpcs:ignore WordPress.Security.EscapeOutput
	exit;
}
