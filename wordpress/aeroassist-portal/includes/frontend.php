<?php
/**
 * The portal page: a full-screen light dashboard served on the page that holds [aeroassist_portal].
 */

defined( 'ABSPATH' ) || exit;

add_shortcode(
	'aeroassist_portal',
	function () {
		// The page itself is replaced by the portal template; this only shows if a theme renders it elsewhere.
		return '<p><a href="' . esc_url( aap_portal_url() ) . '">Open the investor and team portal</a></p>';
	}
);

function aap_is_portal_page() {
	$id = (int) get_option( 'aap_page_id' );
	if ( $id && is_page( $id ) ) {
		return true;
	}
	if ( is_singular() ) {
		$post = get_queried_object();
		return $post instanceof WP_Post && has_shortcode( $post->post_content, 'aeroassist_portal' );
	}
	return false;
}

add_action(
	'template_redirect',
	function () {
		if ( ! aap_is_portal_page() ) {
			return;
		}
		if ( is_user_logged_in() && 'needs_2fa' === aap_session_state() ) {
			// Signed in before two-factor applied: sign in again with the second step.
			wp_logout();
			wp_safe_redirect( wp_login_url( aap_portal_url() ) );
			exit;
		}
		nocache_headers();
		header( 'X-Frame-Options: DENY' );
		header( 'X-Content-Type-Options: nosniff' );
		header( 'Referrer-Policy: same-origin' );
		header( 'X-Robots-Tag: noindex, nofollow' );
	}
);

add_filter(
	'template_include',
	function ( $template ) {
		return aap_is_portal_page() ? AAP_DIR . 'templates/portal.php' : $template;
	},
	99
);

/* Keep the portal page out of search engines and sitemaps. */
add_filter(
	'wp_sitemaps_posts_query_args',
	function ( $args ) {
		$id = (int) get_option( 'aap_page_id' );
		if ( $id ) {
			$args['post__not_in'] = array_merge( isset( $args['post__not_in'] ) ? (array) $args['post__not_in'] : array(), array( $id ) );
		}
		return $args;
	}
);

/* Keep-alive while someone is actively using the dashboard (it changes views without reloading). */
add_action(
	'wp_ajax_aap_ping',
	function () {
		check_ajax_referer( 'aap_ping' );
		wp_send_json_success( array( 'ok' => 1 ) );
	}
);

/** Everything the dashboard shows the signed-in person. */
function aap_portal_data( WP_User $user ) {
	$s    = aap_settings();
	$role = aap_role( $user );
	list( $mine, $lib ) = aap_docs_for( $user );
	$doc = function ( $d, $is_mine ) {
		return array(
			'id'    => (int) $d->id,
			'title' => $d->title,
			'date'  => $d->doc_date ? $d->doc_date : '',
			'size'  => (int) $d->size,
			'type'  => $d->mime,
			'name'  => $d->file_name,
			'cat'   => $is_mine ? $d->category : ( $d->category ? $d->category : 'Documents' ),
			'desc'  => (string) $d->description,
			'group' => $is_mine ? '' : $d->grp,
			'url'   => aap_file_url( $d->id ),
			'view'  => aap_file_url( $d->id, true ),
		);
	};
	$txns = array_map(
		function ( $t ) {
			return array(
				'date'   => $t->tx_date ? $t->tx_date : '',
				'type'   => $t->type,
				'units'  => (float) $t->units,
				'amount' => (float) $t->amount,
				'note'   => (string) $t->note,
			);
		},
		aap_transactions( $user->ID )
	);
	$links = array();
	foreach ( (array) $s['links'] as $l ) {
		if ( ! empty( $l[0] ) && ! empty( $l[1] ) ) {
			$links[] = array( $l[0], 0 === strpos( $l[1], '/' ) ? home_url( $l[1] ) : esc_url_raw( $l[1] ) );
		}
	}
	$data = array(
		'id'               => aap_portal_id( $user->ID ),
		'role'             => $role,
		'holder'           => aap_holder( $user ),
		'unitsOutstanding' => (int) $s['units_outstanding'],
		'roundUnits'       => (int) $s['round_units'],
		'roundName'        => (string) $s['round_name'],
		'unitPrice'        => (float) $s['unit_price'],
		'priceLabel'       => (string) $s['price_label'],
		'priceHistory'     => array_values( (array) $s['price_history'] ),
		'announcements'    => array_values( (array) $s['announcements'] ),
		'taxNote'          => (string) $s['tax_note'],
		'company'          => array_values( (array) $s['company_facts'] ),
		'about'            => (string) $s['about'],
		'contacts'         => array_values( (array) $s['contacts'] ),
		'links'            => $links,
		'address'          => (string) $s['address'],
		'asOf'             => (string) $s['as_of'],
		'note'             => (string) $s['note'],
		'idleMinutes'      => max( 5, (int) $s['idle_minutes'] ),
		'twofa'            => aap_twofa_status( $user->ID ),
		'docs'             => array_map(
			function ( $d ) use ( $doc ) {
				return $doc( $d, true );
			},
			$mine
		),
		'lib'              => array_map(
			function ( $d ) use ( $doc ) {
				return $doc( $d, false );
			},
			$lib
		),
		'transactions'     => $txns,
		'urls'             => array(
			'logout'  => html_entity_decode( wp_logout_url( aap_portal_url( array( 'signed_out' => 1 ) ) ) ),
			'idle'    => html_entity_decode( wp_logout_url( aap_portal_url( array( 'signed_out' => 'idle' ) ) ) ),
			'zip'     => aap_nonce_url( add_query_arg( 'action', 'aap_zip', admin_url( 'admin-post.php' ) ), 'aap_file' ),
			'ping'    => aap_nonce_url( add_query_arg( 'action', 'aap_ping', admin_url( 'admin-ajax.php' ) ), 'aap_ping' ),
			'profile' => aap_twofa_setup_url(),
			'vendor'  => AAP_URL . 'assets/vendor/',
			'home'    => home_url( '/' ),
			'privacy' => get_privacy_policy_url(),
		),
	);
	if ( 'admin' === $role ) {
		$data['roster'] = array();
		foreach ( aap_portal_users() as $p ) {
			$h                = aap_holder( $p );
			$last             = (int) get_user_meta( $p->ID, 'aap_last_signin', true );
			$data['roster'][] = array(
				'id'       => aap_portal_id( $p->ID ),
				'name'     => $p->display_name,
				'role'     => aap_role( $p ),
				'units'    => $h['units'],
				'invested' => $h['invested'],
				'twofa'    => aap_twofa_status( $p->ID ),
				'last'     => $last ? gmdate( 'Y-m-d', $last ) : '',
				'edit'     => admin_url( 'admin.php?page=aap-people&edit=' . $p->ID ),
			);
		}
		$data['activity'] = aap_recent_activity( 12 );
		$data['manage']   = array(
			'people'    => admin_url( 'admin.php?page=aap-people' ),
			'documents' => admin_url( 'admin.php?page=aap-documents' ),
			'txns'      => admin_url( 'admin.php?page=aap-transactions' ),
			'log'       => admin_url( 'admin.php?page=aap-log' ),
			'settings'  => admin_url( 'admin.php?page=aap-settings' ),
		);
	}
	return $data;
}

function aap_recent_activity( $limit ) {
	global $wpdb;
	$rows = $wpdb->get_results(
		$wpdb->prepare(
			'SELECT l.*, d.title FROM ' . aap_table( 'log' ) . ' l LEFT JOIN ' . aap_table( 'docs' ) . " d ON d.id = l.doc_id WHERE l.action IN ('view','download','zip','signin','signin_failed','denied') ORDER BY l.id DESC LIMIT %d",
			$limit
		)
	);
	$out = array();
	foreach ( $rows as $r ) {
		$u     = $r->user_id ? get_userdata( $r->user_id ) : null;
		$out[] = array(
			'when'   => get_date_from_gmt( $r->created_at, 'Y-m-d H:i' ),
			'who'    => $u ? $u->display_name : 'Unknown',
			'action' => $r->action,
			'doc'    => (string) $r->title,
		);
	}
	return $out;
}
