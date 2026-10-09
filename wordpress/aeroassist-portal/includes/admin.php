<?php
/**
 * wp-admin screens for the CFO: People, Documents, Transactions, Activity log, Settings.
 * Every change checks the aap_manage capability and a nonce.
 */

defined( 'ABSPATH' ) || exit;

/* ------------------------------------------------------------------ menu */

add_action(
	'admin_menu',
	function () {
		add_menu_page( 'AeroAssist Portal', 'AeroAssist Portal', 'aap_manage', 'aap-people', 'aap_screen_people', 'dashicons-lock', 3 );
		add_submenu_page( 'aap-people', 'People', 'People', 'aap_manage', 'aap-people', 'aap_screen_people' );
		add_submenu_page( 'aap-people', 'Documents', 'Documents', 'aap_manage', 'aap-documents', 'aap_screen_documents' );
		add_submenu_page( 'aap-people', 'Transactions', 'Transactions', 'aap_manage', 'aap-transactions', 'aap_screen_transactions' );
		add_submenu_page( 'aap-people', 'Activity log', 'Activity log', 'aap_manage', 'aap-log', 'aap_screen_log' );
		add_submenu_page( 'aap-people', 'Settings', 'Settings', 'aap_manage', 'aap-settings', 'aap_screen_settings' );
		add_submenu_page( 'aap-people', 'Import', 'Import', 'aap_manage', 'aap-import', 'aap_screen_import' );
	}
);

add_action(
	'admin_enqueue_scripts',
	function ( $hook ) {
		if ( false !== strpos( $hook, 'aap-' ) ) {
			wp_enqueue_style( 'aap-admin', AAP_URL . 'assets/admin.css', array(), AAP_VERSION );
		}
	}
);

/* A clear warning wherever an administrator looks, until two-factor is on. */
add_action(
	'admin_notices',
	function () {
		if ( ! current_user_can( 'aap_manage' ) ) {
			return;
		}
		if ( aap_setting( 'require_2fa' ) && '' === aap_twofa_plugin() ) {
			echo '<div class="notice notice-error"><p><strong>AeroAssist Portal is switched off:</strong> two-factor sign-in is required but no two-factor plugin is active. Install and activate the free <a href="' . esc_url( admin_url( 'plugin-install.php?s=two-factor&tab=search&type=term' ) ) . '">Two-Factor</a> plugin (or Wordfence Login Security).</p></div>';
		}
		if ( ! aap_storage_dir() || ! is_dir( aap_storage_dir() ) ) {
			echo '<div class="notice notice-error"><p><strong>AeroAssist Portal:</strong> the private document folder is missing. Open <a href="' . esc_url( admin_url( 'admin.php?page=aap-settings' ) ) . '">Portal settings</a>.</p></div>';
		}
	}
);

/* Add a "Portal" link in the toolbar for managers. */
add_action(
	'admin_bar_menu',
	function ( $bar ) {
		if ( current_user_can( 'aap_manage' ) ) {
			$bar->add_node(
				array(
					'id'    => 'aap-open',
					'title' => 'Open portal',
					'href'  => aap_portal_url(),
				)
			);
		}
	},
	80
);

/* ------------------------------------------------------------------ helpers */

function aap_flash( $msg, $type = 'success' ) {
	$all   = get_transient( 'aap_flash_' . get_current_user_id() );
	$all   = is_array( $all ) ? $all : array();
	$all[] = array( $msg, $type );
	set_transient( 'aap_flash_' . get_current_user_id(), $all, 120 );
}

function aap_show_flash() {
	$all = get_transient( 'aap_flash_' . get_current_user_id() );
	if ( is_array( $all ) ) {
		foreach ( $all as $f ) {
			printf( '<div class="notice notice-%s is-dismissible"><p>%s</p></div>', esc_attr( $f[1] ), wp_kses_post( $f[0] ) );
		}
		delete_transient( 'aap_flash_' . get_current_user_id() );
	}
}

function aap_back( $page, $args = array() ) {
	wp_safe_redirect( add_query_arg( array_merge( array( 'page' => $page ), $args ), admin_url( 'admin.php' ) ) );
	exit;
}

/** Verify a form post: capability + nonce. */
function aap_check( $action ) {
	if ( ! current_user_can( 'aap_manage' ) ) {
		wp_die( 'You do not have permission to manage the portal.', 403 );
	}
	check_admin_referer( $action );
	$state = aap_session_state();
	if ( 'ok' !== $state && ! ( in_array( $state, array( 'no_plugin', 'needs_setup' ), true ) && current_user_can( 'manage_options' ) ) ) {
		wp_die( 'needs_setup' === $state ? 'Turn on two-factor for your account first (Wordfence → Login Security), then try again.' : 'Sign in again with two-factor to manage the portal.', 403 );
	}
}

/* Portal admin screens need a two-factor session too (site administrators may set up before 2FA exists). */
add_action(
	'admin_init',
	function () {
		// phpcs:ignore WordPress.Security.NonceVerification
		$page = isset( $_GET['page'] ) ? sanitize_key( $_GET['page'] ) : '';
		if ( 0 !== strpos( $page, 'aap-' ) || ! current_user_can( 'aap_manage' ) ) {
			return;
		}
		$state = aap_session_state();
		if ( 'needs_2fa' === $state ) {
			wp_logout();
			wp_safe_redirect( wp_login_url( admin_url( 'admin.php?page=' . $page ) ) );
			exit;
		}
		if ( 'no_plugin' === $state && ! current_user_can( 'manage_options' ) ) {
			wp_die( 'The portal is switched off until two-factor sign-in is active. Ask a site administrator to install the Two-Factor plugin.', 503 );
		}
		if ( 'needs_setup' === $state && ! current_user_can( 'manage_options' ) ) {
			wp_die( 'Turn on two-factor for your account first: <a href="' . esc_url( aap_twofa_setup_url() ) . '">set up an authenticator app</a>.', 403 );
		}
	}
);

function aap_post( $key, $default = '' ) {
	// phpcs:ignore WordPress.Security.NonceVerification
	return isset( $_POST[ $key ] ) ? wp_unslash( $_POST[ $key ] ) : $default;
}

function aap_head( $title, $sub = '' ) {
	echo '<div class="wrap aap-wrap"><h1 class="wp-heading-inline">' . esc_html( $title ) . '</h1>';
	echo ' <a class="page-title-action" href="' . esc_url( aap_portal_url() ) . '" target="_blank" rel="noopener">Open portal ↗</a>';
	if ( $sub ) {
		echo '<p class="aap-sub">' . wp_kses_post( $sub ) . '</p>';
	}
	echo '<hr class="wp-header-end">';
	aap_show_flash();
}

function aap_role_select( $name, $current, $id = '' ) {
	echo '<select name="' . esc_attr( $name ) . '"' . ( $id ? ' id="' . esc_attr( $id ) . '"' : '' ) . '>';
	foreach ( aap_role_labels() as $k => $label ) {
		printf( '<option value="%s"%s>%s</option>', esc_attr( $k ), selected( $current, $k, false ), esc_html( $label ) );
	}
	echo '</select>';
}

function aap_people_select( $name, $current = 0, $required = true ) {
	echo '<select name="' . esc_attr( $name ) . '"' . ( $required ? ' required' : '' ) . '><option value="">Choose a person…</option>';
	foreach ( aap_portal_users() as $u ) {
		printf( '<option value="%d"%s>%s (%s)</option>', (int) $u->ID, selected( $current, $u->ID, false ), esc_html( $u->display_name ), esc_html( aap_portal_id( $u->ID ) ) );
	}
	echo '</select>';
}

function aap_download_counts() {
	global $wpdb;
	$rows = $wpdb->get_results( 'SELECT doc_id, COUNT(*) AS n FROM ' . aap_table( 'log' ) . " WHERE action IN ('view','download','zip') GROUP BY doc_id" );
	$out  = array();
	foreach ( $rows as $r ) {
		$out[ (int) $r->doc_id ] = (int) $r->n;
	}
	return $out;
}

function aap_dl_link( $doc, $label = 'Open' ) {
	return '<a href="' . esc_url( aap_file_url( $doc->id, 'application/pdf' === $doc->mime ) ) . '" target="_blank" rel="noopener">' . esc_html( $label ) . '</a>';
}

function aap_size( $n ) {
	return $n >= 1048576 ? round( $n / 1048576, 1 ) . ' MB' : max( 1, round( $n / 1024 ) ) . ' KB';
}

/** Users that a portal manager may edit: portal users only, never other WordPress roles. */
function aap_editable_user( $user_id ) {
	$u = get_userdata( $user_id );
	return ( $u && aap_is_portal_user( $u ) ) ? $u : null;
}

/** Whether the current manager may change this person's name, email or role. */
function aap_can_edit_account( $u ) {
	if ( current_user_can( 'edit_users' ) && current_user_can( 'edit_user', $u->ID ) ) {
		return true;
	}
	// Portal administrators can change investors, prospects and the team only: never another
	// administrator, a super admin, an account with no role here, or anyone with another WordPress role.
	$roles = (array) $u->roles;
	if ( ! $roles || is_super_admin( $u->ID ) || user_can( $u, 'aap_manage' ) || user_can( $u, 'edit_users' ) ) {
		return false;
	}
	return ! array_diff( $roles, array_keys( aap_roles() ) );
}

/* ------------------------------------------------------------------ People */

function aap_screen_people() {
	// phpcs:ignore WordPress.Security.NonceVerification
	$edit = isset( $_GET['edit'] ) ? absint( $_GET['edit'] ) : 0;
	if ( $edit ) {
		aap_screen_person( $edit );
		return;
	}
	aap_head( 'People', 'Everyone with a portal sign-in. Each person gets their own account with two-factor; their role decides what they can see.' );
	$users = aap_portal_users();
	$out   = max( 1, (int) aap_setting( 'units_outstanding' ) );
	$price = (float) aap_setting( 'unit_price' );
	echo '<div class="aap-cards"><div class="aap-card"><h2>Add a person</h2>';
	echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" class="aap-form">';
	wp_nonce_field( 'aap_person_save' );
	echo '<input type="hidden" name="action" value="aap_person_save">';
	echo '<p><label>Full name<br><input type="text" name="name" required class="regular-text"></label></p>';
	echo '<p><label>Email<br><input name="email" type="email" required class="regular-text"></label></p>';
	echo '<p><label>Role<br>';
	aap_role_select( 'role', 'investor' );
	echo '</label></p>';
	echo '<div class="aap-row"><p><label>Units<br><input name="units" type="number" step="any" min="0" class="small-text"></label></p><p><label>Paid-in ($)<br><input name="invested" type="number" step="any" min="0"></label></p><p><label>Holder since<br><input name="since" type="date"></label></p></div>';
	echo '<p><label><input type="checkbox" name="invite" value="1" checked> Email them a link to choose their password</label></p>';
	submit_button( 'Add person', 'primary', 'submit', false );
	echo '</form></div></div>';

	echo '<h2>Everyone (' . count( $users ) . ')</h2><table class="widefat striped aap-table"><thead><tr><th>Portal ID</th><th>Name</th><th>Email</th><th>Role</th><th>Two-factor</th><th>Last sign-in</th><th class="num">Units</th><th class="num">Ownership</th><th class="num">Paid-in</th><th class="num">Value</th></tr></thead><tbody>';
	foreach ( $users as $u ) {
		$h    = aap_holder( $u );
		$last = (int) get_user_meta( $u->ID, 'aap_last_signin', true );
		$tf   = aap_twofa_status( $u->ID );
		printf(
			'<tr><td><code>%s</code></td><td><a href="%s"><strong>%s</strong></a></td><td>%s</td><td>%s</td><td><span class="aap-pill %s">%s</span></td><td>%s</td><td class="num">%s</td><td class="num">%s</td><td class="num">%s</td><td class="num">%s</td></tr>',
			esc_html( aap_portal_id( $u->ID ) ),
			esc_url( admin_url( 'admin.php?page=aap-people&edit=' . $u->ID ) ),
			esc_html( $u->display_name ),
			esc_html( $u->user_email ),
			esc_html( aap_role_labels()[ aap_role( $u ) ] . ( in_array( 'administrator', (array) $u->roles, true ) ? ' (WordPress admin)' : '' ) ),
			false !== stripos( $tf, 'app' ) ? 'good' : ( false !== stripos( $tf, 'not' ) || false !== stripos( $tf, 'no ' ) ? 'warn' : '' ),
			esc_html( $tf ),
			$last ? esc_html( get_date_from_gmt( gmdate( 'Y-m-d H:i:s', $last ), 'M j, Y g:i a' ) ) : '<span class="aap-muted">Never</span>',
			$h['units'] ? esc_html( number_format( $h['units'] ) ) : '—',
			$h['units'] ? esc_html( number_format( $h['units'] / $out * 100, 2 ) ) . '%' : '—',
			$h['invested'] ? esc_html( aap_money( $h['invested'] ) ) : '—',
			$h['units'] && $price ? esc_html( aap_money( $h['units'] * $price ) ) : '—'
		);
	}
	if ( ! $users ) {
		echo '<tr><td colspan="10">Nobody yet. Add someone above, or use Import to bring in the existing portal.</td></tr>';
	}
	echo '</tbody></table></div>';
}

function aap_screen_person( $user_id ) {
	global $wpdb;
	$u = aap_editable_user( $user_id );
	if ( ! $u ) {
		aap_head( 'Person not found' );
		echo '<p>That person does not have portal access. <a href="' . esc_url( admin_url( 'admin.php?page=aap-people' ) ) . '">Back to People</a></p></div>';
		return;
	}
	$h       = aap_holder( $u );
	$role    = aap_role( $u );
	$can_acc = aap_can_edit_account( $u );
	$post    = esc_url( admin_url( 'admin-post.php' ) );
	aap_head( $u->display_name, '<a href="' . esc_url( admin_url( 'admin.php?page=aap-people' ) ) . '">← People</a> · Portal ID <code>' . esc_html( aap_portal_id( $u->ID ) ) . '</code> · ' . esc_html( aap_role_labels()[ $role ] ) );

	echo '<div class="aap-cards">';
	// Details.
	echo '<div class="aap-card"><h2>Details</h2><form method="post" action="' . $post . '" class="aap-form">'; // phpcs:ignore WordPress.Security.EscapeOutput
	wp_nonce_field( 'aap_person_save' );
	echo '<input type="hidden" name="action" value="aap_person_save"><input type="hidden" name="user_id" value="' . (int) $u->ID . '">';
	if ( $can_acc ) {
		echo '<p><label>Full name<br><input type="text" name="name" required class="regular-text" value="' . esc_attr( $u->display_name ) . '"></label></p>';
		echo '<p><label>Email<br><input name="email" type="email" required class="regular-text" value="' . esc_attr( $u->user_email ) . '"></label></p>';
		echo '<p><label>Role<br>';
		aap_role_select( 'role', $role );
		echo '</label></p>';
	} else {
		echo '<p class="aap-muted">Name, email and role for WordPress administrators are changed under Users by a site administrator.</p>';
	}
	echo '<div class="aap-row"><p><label>Units<br><input name="units" type="number" step="any" min="0" class="small-text" value="' . esc_attr( $h['units'] ? $h['units'] + 0 : '' ) . '"></label></p>';
	echo '<p><label>Paid-in ($)<br><input name="invested" type="number" step="any" min="0" value="' . esc_attr( $h['invested'] ? $h['invested'] + 0 : '' ) . '"></label></p>';
	echo '<p><label>Holder since<br><input name="since" type="date" value="' . esc_attr( $h['since'] ) . '"></label></p></div>';
	echo '<p><label>Title (team members, optional)<br><input type="text" name="title" class="regular-text" value="' . esc_attr( $h['title'] ) . '"></label></p>';
	echo '<p><label>Portal ID<br><input type="text" name="portal_id" class="regular-text" value="' . esc_attr( aap_portal_id( $u->ID ) ) . '" pattern="[A-Za-z0-9-]{2,24}"></label></p>';
	submit_button( 'Save details', 'primary', 'submit', false );
	echo '</form></div>';

	// Access.
	$last    = (int) get_user_meta( $u->ID, 'aap_last_signin', true );
	$invited = (int) get_user_meta( $u->ID, 'aap_invited', true );
	echo '<div class="aap-card"><h2>Sign-in and access</h2><table class="aap-kv">';
	echo '<tr><th>Username</th><td><code>' . esc_html( $u->user_login ) . '</code></td></tr>';
	echo '<tr><th>Two-factor</th><td>' . esc_html( aap_twofa_status( $u->ID ) ) . '</td></tr>';
	echo '<tr><th>Last sign-in</th><td>' . ( $last ? esc_html( get_date_from_gmt( gmdate( 'Y-m-d H:i:s', $last ), 'M j, Y g:i a' ) ) : 'Never' ) . '</td></tr>';
	echo '<tr><th>Invitation</th><td>' . ( $invited ? 'Sent ' . esc_html( get_date_from_gmt( gmdate( 'Y-m-d H:i:s', $invited ), 'M j, Y' ) ) : 'Not sent' ) . '</td></tr>';
	echo '<tr><th>Signed in now</th><td>' . count( WP_Session_Tokens::get_instance( $u->ID )->get_all() ) . ' session(s)</td></tr></table>';
	if ( $can_acc ) {
		foreach ( array(
			'aap_person_invite' => array( 'Email a new password link', 'button', 'They choose a new password; their current one keeps working until then.' ),
			'aap_person_2fa'    => array( 'Reset two-factor', 'button', 'Use if they lost their phone. They go back to email codes until they set up an app again.' ),
			'aap_person_logout' => array( 'Sign them out everywhere', 'button', '' ),
			'aap_person_remove' => array( 'Remove portal access', 'button aap-danger', 'Signs them out at once and removes their role. Their documents and history are kept.' ),
		) as $act => $b ) {
			echo '<form method="post" action="' . $post . '" class="aap-inline"' . ( 'aap_person_remove' === $act ? ' onsubmit="return confirm(\'Remove portal access for this person? They are signed out immediately.\')"' : '' ) . '>'; // phpcs:ignore WordPress.Security.EscapeOutput
			wp_nonce_field( $act . '_' . $u->ID );
			echo '<input type="hidden" name="action" value="' . esc_attr( $act ) . '"><input type="hidden" name="user_id" value="' . (int) $u->ID . '">';
			echo '<button class="' . esc_attr( $b[1] ) . '">' . esc_html( $b[0] ) . '</button>' . ( $b[2] ? ' <span class="aap-muted">' . esc_html( $b[2] ) . '</span>' : '' ) . '</form>';
		}
	}
	echo '</div></div>';

	// Personal documents.
	$docs   = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . aap_table( 'docs' ) . " WHERE grp = 'personal' AND user_id = %d ORDER BY doc_date DESC, id DESC", $u->ID ) );
	$counts = aap_download_counts();
	echo '<h2>Personal documents</h2><p class="aap-muted">Only ' . esc_html( $u->display_name ) . ' and portal administrators can open these.</p>';
	aap_personal_upload_form( $u->ID );
	aap_doc_table( $docs, $counts, false );

	// Transactions.
	echo '<h2>Transactions</h2>';
	aap_txn_form( $u->ID );
	aap_txn_table( aap_transactions( $u->ID ), false );

	// Activity.
	$log = $wpdb->get_results( $wpdb->prepare( 'SELECT l.*, d.title FROM ' . aap_table( 'log' ) . ' l LEFT JOIN ' . aap_table( 'docs' ) . ' d ON d.id = l.doc_id WHERE l.user_id = %d ORDER BY l.id DESC LIMIT 25', $u->ID ) );
	echo '<h2>Recent activity</h2>';
	aap_log_table( $log, false );
	echo '<p><a href="' . esc_url( admin_url( 'admin.php?page=aap-log&person=' . $u->ID ) ) . '">Full activity for this person →</a></p></div>';
}

add_action( 'admin_post_aap_person_save', 'aap_handle_person_save' );
function aap_handle_person_save() {
	aap_check( 'aap_person_save' );
	$uid   = absint( aap_post( 'user_id', 0 ) );
	$name  = sanitize_text_field( aap_post( 'name' ) );
	$email = sanitize_email( aap_post( 'email' ) );
	$role  = sanitize_key( aap_post( 'role' ) );
	if ( $role && ! isset( aap_role_labels()[ $role ] ) ) {
		wp_die( 'Unknown role.' );
	}
	if ( $uid ) {
		$u = aap_editable_user( $uid );
		if ( ! $u ) {
			wp_die( 'That person cannot be edited here.' );
		}
		if ( aap_can_edit_account( $u ) && $name && $email ) {
			if ( ! is_email( $email ) ) {
				aap_flash( 'That email address does not look right.', 'error' );
				aap_back( 'aap-people', array( 'edit' => $uid ) );
			}
			$other = get_user_by( 'email', $email );
			if ( $other && $other->ID !== $u->ID ) {
				aap_flash( 'Another account already uses that email.', 'error' );
				aap_back( 'aap-people', array( 'edit' => $uid ) );
			}
			$parts = explode( ' ', $name, 2 );
			wp_update_user(
				array(
					'ID'           => $uid,
					'display_name' => $name,
					'first_name'   => $parts[0],
					'last_name'    => isset( $parts[1] ) ? $parts[1] : '',
					'user_email'   => $email,
				)
			);
			if ( $role && $role !== aap_role( $u ) ) {
				$u->set_role( aap_wp_role( $role ) );
				WP_Session_Tokens::get_instance( $uid )->destroy_all();
				aap_flash( 'Role changed; they were signed out so the new access applies at their next sign-in.', 'info' );
			}
		}
	} else {
		if ( ! $name || ! is_email( $email ) ) {
			aap_flash( 'A name and a valid email are required.', 'error' );
			aap_back( 'aap-people' );
		}
		if ( get_user_by( 'email', $email ) ) {
			$existing = get_user_by( 'email', $email );
			if ( ! aap_is_portal_user( $existing ) && ! array_diff( (array) $existing->roles, array( 'subscriber' ) ) ) {
				// An existing subscriber (e.g. a newsletter account) gets portal access.
				$existing->set_role( aap_wp_role( $role ? $role : 'prospect' ) );
				$uid = $existing->ID;
			} else {
				aap_flash( 'Someone with that email already has an account.', 'error' );
				aap_back( 'aap-people' );
			}
		} else {
			$login = strtolower( $email );
			if ( strlen( $login ) > 60 || username_exists( $login ) ) {
				$login = sanitize_user( strtok( $email, '@' ), true ) . wp_rand( 100, 999 );
			}
			$parts = explode( ' ', $name, 2 );
			$uid   = wp_insert_user(
				array(
					'user_login'   => $login,
					'user_email'   => $email,
					'user_pass'    => wp_generate_password( 32, true, true ),
					'display_name' => $name,
					'first_name'   => $parts[0],
					'last_name'    => isset( $parts[1] ) ? $parts[1] : '',
					'role'         => aap_wp_role( $role ? $role : 'prospect' ),
				)
			);
			if ( is_wp_error( $uid ) ) {
				aap_flash( 'Could not add them: ' . esc_html( $uid->get_error_message() ), 'error' );
				aap_back( 'aap-people' );
			}
			update_user_meta( $uid, 'show_admin_bar_front', 'false' );
		}
		aap_portal_id( $uid );
		aap_log( 'person_add', 0, $name . ' as ' . $role );
	}
	foreach ( array( 'units', 'invested' ) as $k ) {
		$v = aap_post( $k, null );
		if ( null !== $v ) {
			update_user_meta( $uid, 'aap_' . $k, '' === $v ? '' : (float) $v );
		}
	}
	$since = aap_clean_date( aap_post( 'since' ) );
	update_user_meta( $uid, 'aap_since', $since ? $since : '' );
	if ( null !== aap_post( 'title', null ) ) {
		update_user_meta( $uid, 'aap_title', sanitize_text_field( aap_post( 'title' ) ) );
	}
	$pid = strtoupper( preg_replace( '/[^A-Za-z0-9-]/', '', aap_post( 'portal_id' ) ) );
	if ( $pid && $pid !== aap_portal_id( $uid ) ) {
		$taken = aap_find_user_by_portal_id( $pid );
		if ( $taken && $taken->ID !== $uid ) {
			aap_flash( 'Portal ID ' . esc_html( $pid ) . ' is already used by someone else.', 'error' );
		} else {
			update_user_meta( $uid, 'aap_id', $pid );
		}
	}
	if ( ! absint( aap_post( 'user_id', 0 ) ) ) {
		if ( aap_post( 'invite' ) ) {
			$sent = aap_send_invite( $uid );
			aap_flash( $sent && ! is_wp_error( $sent ) ? 'Added. An email with a link to choose their password is on its way.' : 'Added, but the invitation email could not be sent. Check the site can send email, then use "Email a new password link".', $sent && ! is_wp_error( $sent ) ? 'success' : 'warning' );
		} else {
			aap_flash( 'Added. Use "Email a new password link" when you are ready for them to sign in.' );
		}
	} else {
		aap_log( 'person_edit', 0, get_userdata( $uid )->display_name );
		aap_flash( 'Saved.' );
	}
	aap_back( 'aap-people', array( 'edit' => $uid ) );
}

foreach ( array( 'aap_person_invite', 'aap_person_2fa', 'aap_person_logout', 'aap_person_remove' ) as $aap_act ) {
	add_action( 'admin_post_' . $aap_act, 'aap_handle_person_action' );
}
function aap_handle_person_action() {
	$act = sanitize_key( aap_post( 'action' ) );
	$uid = absint( aap_post( 'user_id', 0 ) );
	aap_check( $act . '_' . $uid );
	$u = aap_editable_user( $uid );
	if ( ! $u || ! aap_can_edit_account( $u ) ) {
		wp_die( 'That person cannot be changed here.' );
	}
	switch ( $act ) {
		case 'aap_person_invite':
			$sent = aap_send_invite( $u );
			aap_flash( $sent && ! is_wp_error( $sent ) ? 'Password link sent to ' . esc_html( $u->user_email ) . '.' : 'The email could not be sent. Check the site can send email (an SMTP plugin is recommended).', $sent && ! is_wp_error( $sent ) ? 'success' : 'error' );
			break;
		case 'aap_person_2fa':
			foreach ( array( '_two_factor_enabled_providers', '_two_factor_provider', '_two_factor_totp_key', '_two_factor_backup_codes', '_two_factor_totp_last_successful_login' ) as $k ) {
				delete_user_meta( $uid, $k );
			}
			WP_Session_Tokens::get_instance( $uid )->destroy_all();
			aap_log( 'twofa_reset', 0, $u->display_name );
			aap_flash( 'Two-factor reset. They will get an email code at their next sign-in and can set up a new app from Help and security.' );
			break;
		case 'aap_person_logout':
			WP_Session_Tokens::get_instance( $uid )->destroy_all();
			aap_flash( 'Signed out everywhere.' );
			break;
		case 'aap_person_remove':
			if ( $uid === get_current_user_id() ) {
				aap_flash( 'You cannot remove your own access.', 'error' );
				break;
			}
			WP_Session_Tokens::get_instance( $uid )->destroy_all();
			foreach ( array_keys( aap_roles() ) as $r ) {
				$u->remove_role( $r );
			}
			if ( ! $u->roles ) {
				$u->set_role( '' );
			}
			aap_log( 'access_removed', 0, $u->display_name );
			aap_flash( esc_html( $u->display_name ) . ' no longer has portal access and has been signed out. Their records are kept; add them again to restore access.' );
			aap_back( 'aap-people' );
	}
	aap_back( 'aap-people', array( 'edit' => $uid ) );
}

/* ------------------------------------------------------------------ Documents */

function aap_personal_upload_form( $user_id = 0 ) {
	echo '<div class="aap-card aap-upload"><h3>Add a personal document (K-1, certificate, agreement)</h3><form method="post" enctype="multipart/form-data" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" class="aap-form">';
	wp_nonce_field( 'aap_doc_upload' );
	echo '<input type="hidden" name="action" value="aap_doc_upload"><input type="hidden" name="grp" value="personal">';
	if ( $user_id ) {
		echo '<input type="hidden" name="user_id" value="' . (int) $user_id . '"><input type="hidden" name="back" value="person">';
	} else {
		echo '<p><label>Person<br>';
		aap_people_select( 'user_id' );
		echo '</label></p>';
	}
	echo '<div class="aap-row"><p><label>Type<br><select name="category">';
	foreach ( aap_personal_categories() as $k => $l ) {
		printf( '<option value="%s">%s</option>', esc_attr( $k ), esc_html( $l ) );
	}
	echo '</select></label></p><p class="aap-grow"><label>Title<br><input type="text" name="title" required class="large-text" placeholder="2025 Schedule K-1"></label></p><p><label>Date<br><input name="doc_date" type="date" value="' . esc_attr( current_time( 'Y-m-d' ) ) . '"></label></p></div>';
	echo '<p><label>File<br><input type="file" name="file" required></label> <span class="aap-muted">Up to ' . esc_html( size_format( wp_max_upload_size() ) ) . '. PDF, Word, Excel, CSV or image.</span></p>';
	echo '<p><label><input type="checkbox" name="notify" value="1" checked> Email them that a new document is in their portal (the email has no attachment)</label></p>';
	submit_button( 'Upload', 'primary', 'submit', false );
	echo '</form></div>';
}

function aap_doc_table( $docs, $counts, $show_owner, $show_group = false ) {
	echo '<table class="widefat striped aap-table"><thead><tr>' . ( $show_owner ? '<th>Person</th>' : '' ) . ( $show_group ? '<th>Who can see it</th>' : '' ) . '<th>Title</th><th>Type</th><th>Date</th><th class="num">Size</th><th class="num">Opened</th><th>Added</th><th></th></tr></thead><tbody>';
	foreach ( $docs as $d ) {
		$owner = $show_owner ? get_userdata( $d->user_id ) : null;
		$cat   = 'personal' === $d->grp ? ( isset( aap_personal_categories()[ $d->category ] ) ? aap_personal_categories()[ $d->category ] : $d->category ) : $d->category;
		echo '<tr>';
		if ( $show_owner ) {
			echo '<td>' . ( $owner ? '<a href="' . esc_url( admin_url( 'admin.php?page=aap-people&edit=' . $owner->ID ) ) . '">' . esc_html( $owner->display_name ) . '</a>' : '<span class="aap-muted">Deleted account #' . (int) $d->user_id . '</span>' ) . '</td>';
		}
		if ( $show_group ) {
			echo '<td>' . esc_html( aap_group_labels()[ $d->grp ] ) . '</td>';
		}
		printf(
			'<td><strong>%s</strong>%s</td><td>%s</td><td>%s</td><td class="num">%s</td><td class="num">%d</td><td>%s</td><td class="aap-actions">%s · <a href="%s">Edit</a></td></tr>',
			esc_html( $d->title ),
			$d->description ? '<br><span class="aap-muted">' . esc_html( wp_trim_words( $d->description, 18 ) ) . '</span>' : '',
			esc_html( $cat ),
			esc_html( $d->doc_date ? mysql2date( 'M j, Y', $d->doc_date ) : '—' ),
			esc_html( aap_size( $d->size ) ),
			isset( $counts[ (int) $d->id ] ) ? (int) $counts[ (int) $d->id ] : 0,
			esc_html( get_date_from_gmt( $d->created_at, 'M j, Y' ) ),
			aap_dl_link( $d ), // phpcs:ignore WordPress.Security.EscapeOutput
			esc_url( admin_url( 'admin.php?page=aap-documents&doc=' . $d->id ) )
		);
	}
	if ( ! $docs ) {
		echo '<tr><td colspan="9">None yet.</td></tr>';
	}
	echo '</tbody></table>';
}

function aap_screen_documents() {
	global $wpdb;
	// phpcs:ignore WordPress.Security.NonceVerification
	$doc_id = isset( $_GET['doc'] ) ? absint( $_GET['doc'] ) : 0;
	if ( $doc_id ) {
		aap_screen_doc( $doc_id );
		return;
	}
	aap_head( 'Documents', 'Files are encrypted and stored outside the public website. People only see what their role allows, and every open is logged.' );
	$t        = aap_table( 'docs' );
	$cats     = $wpdb->get_col( "SELECT DISTINCT category FROM $t WHERE grp <> 'personal' AND category <> '' ORDER BY category" );
	$counts   = aap_download_counts();
	echo '<div class="aap-cards"><div class="aap-card aap-upload"><h3>Add to the library</h3><form method="post" enctype="multipart/form-data" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" class="aap-form">';
	wp_nonce_field( 'aap_doc_upload' );
	echo '<input type="hidden" name="action" value="aap_doc_upload">';
	echo '<div class="aap-row"><p><label>Who can see it<br><select name="grp" required>';
	foreach ( aap_group_labels() as $g => $l ) {
		printf( '<option value="%s"%s>%s</option>', esc_attr( $g ), selected( $g, 'holders', false ), esc_html( $l ) );
	}
	echo '</select></label></p><p><label>Category<br><input type="text" name="category" list="aapCats" placeholder="Unit holder reports" required></label></p><p><label>Date<br><input name="doc_date" type="date" value="' . esc_attr( current_time( 'Y-m-d' ) ) . '"></label></p></div>';
	echo '<datalist id="aapCats">';
	foreach ( $cats as $c ) {
		echo '<option value="' . esc_attr( $c ) . '">';
	}
	echo '</datalist>';
	echo '<p><label>Title<br><input type="text" name="title" required class="large-text"></label></p>';
	echo '<p><label>Short description (optional)<br><input type="text" name="description" class="large-text"></label></p>';
	echo '<p><label>File<br><input type="file" name="file" required></label> <span class="aap-muted">Up to ' . esc_html( size_format( wp_max_upload_size() ) ) . '.</span></p>';
	submit_button( 'Upload', 'primary', 'submit', false );
	echo '</form></div>';
	aap_personal_upload_form();
	echo '</div>';

	echo '<p class="aap-muted"><strong>Who sees what:</strong> Company → everyone · Investors and prospects → prospects, unit holders, admins · Unit holders only → unit holders, admins · Team only → employees, admins · Administrators only → admins.</p>';
	foreach ( aap_group_labels() as $g => $label ) {
		$docs = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $t WHERE grp = %s ORDER BY category, doc_date DESC, id DESC", $g ) );
		echo '<h2>' . esc_html( $label ) . ' <span class="aap-count">' . count( $docs ) . '</span></h2>';
		aap_doc_table( $docs, $counts, false );
	}
	$docs = $wpdb->get_results( "SELECT * FROM $t WHERE grp = 'personal' ORDER BY doc_date DESC, id DESC" );
	echo '<h2>Personal documents <span class="aap-count">' . count( $docs ) . '</span></h2>';
	aap_doc_table( $docs, $counts, true );
	echo '</div>';
}

function aap_screen_doc( $doc_id ) {
	$d = aap_get_doc( $doc_id );
	if ( ! $d ) {
		aap_head( 'Document not found' );
		echo '</div>';
		return;
	}
	aap_head( 'Edit document', '<a href="' . esc_url( admin_url( 'admin.php?page=aap-documents' ) ) . '">← Documents</a>' );
	$post = esc_url( admin_url( 'admin-post.php' ) );
	echo '<div class="aap-cards"><div class="aap-card"><form method="post" enctype="multipart/form-data" action="' . $post . '" class="aap-form">'; // phpcs:ignore WordPress.Security.EscapeOutput
	wp_nonce_field( 'aap_doc_update_' . $d->id );
	echo '<input type="hidden" name="action" value="aap_doc_update"><input type="hidden" name="doc" value="' . (int) $d->id . '">';
	if ( 'personal' === $d->grp ) {
		echo '<input type="hidden" name="grp" value="personal">';
		echo '<p><label>Person<br>';
		aap_people_select( 'user_id', (int) $d->user_id );
		echo '</label></p><p><label>Type<br><select name="category">';
		foreach ( aap_personal_categories() as $k => $l ) {
			printf( '<option value="%s"%s>%s</option>', esc_attr( $k ), selected( $d->category, $k, false ), esc_html( $l ) );
		}
		echo '</select></label></p>';
	} else {
		echo '<p><label>Who can see it<br><select name="grp">';
		foreach ( aap_group_labels() as $g => $l ) {
			printf( '<option value="%s"%s>%s</option>', esc_attr( $g ), selected( $d->grp, $g, false ), esc_html( $l ) );
		}
		echo '</select></label></p><p><label>Category<br><input type="text" name="category" value="' . esc_attr( $d->category ) . '" required></label></p>';
	}
	echo '<p><label>Title<br><input type="text" name="title" class="large-text" required value="' . esc_attr( $d->title ) . '"></label></p>';
	echo '<p><label>Description<br><input type="text" name="description" class="large-text" value="' . esc_attr( $d->description ) . '"></label></p>';
	echo '<p><label>Date<br><input name="doc_date" type="date" value="' . esc_attr( $d->doc_date ) . '"></label></p>';
	echo '<p><label>Replace the file (optional)<br><input type="file" name="file"></label><br><span class="aap-muted">Current: ' . esc_html( $d->file_name ) . ' · ' . esc_html( aap_size( $d->size ) ) . ' · SHA-256 ' . esc_html( substr( $d->sha256, 0, 16 ) ) . '… · ' . aap_dl_link( $d ) . '</span></p>'; // phpcs:ignore WordPress.Security.EscapeOutput
	submit_button( 'Save', 'primary', 'submit', false );
	echo '</form></div><div class="aap-card"><h2>Delete</h2><p>Removes the document and its encrypted file. The activity log keeps the record of who opened it.</p><form method="post" action="' . $post . '" onsubmit="return confirm(\'Delete this document permanently?\')">'; // phpcs:ignore WordPress.Security.EscapeOutput
	wp_nonce_field( 'aap_doc_delete_' . $d->id );
	echo '<input type="hidden" name="action" value="aap_doc_delete"><input type="hidden" name="doc" value="' . (int) $d->id . '"><button class="button aap-danger">Delete document</button></form></div></div></div>';
}

/** Read one uploaded file from $_FILES['file']. Returns [bytes, name] or WP_Error/null when none. */
function aap_uploaded_file() {
	// phpcs:disable WordPress.Security.NonceVerification
	if ( empty( $_FILES['file'] ) || ! isset( $_FILES['file']['error'] ) || UPLOAD_ERR_NO_FILE === $_FILES['file']['error'] ) {
		return null;
	}
	$f = $_FILES['file']; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
	// phpcs:enable
	if ( UPLOAD_ERR_OK !== $f['error'] ) {
		return new WP_Error( 'aap_upload', in_array( $f['error'], array( UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE ), true ) ? 'The file is larger than this server accepts (' . size_format( wp_max_upload_size() ) . ').' : 'The upload failed. Please try again.' );
	}
	if ( ! is_uploaded_file( $f['tmp_name'] ) ) {
		return new WP_Error( 'aap_upload', 'The upload failed. Please try again.' );
	}
	return array( file_get_contents( $f['tmp_name'] ), sanitize_file_name( wp_unslash( $f['name'] ) ) ); // phpcs:ignore
}

add_action( 'admin_post_aap_doc_upload', 'aap_handle_doc_upload' );
function aap_handle_doc_upload() {
	aap_check( 'aap_doc_upload' );
	$grp  = sanitize_key( aap_post( 'grp' ) );
	$uid  = absint( aap_post( 'user_id', 0 ) );
	$back = 'person' === aap_post( 'back' ) && $uid ? array( 'aap-people', array( 'edit' => $uid ) ) : array( 'aap-documents', array() );
	if ( 'personal' !== $grp && ! isset( aap_groups()[ $grp ] ) ) {
		wp_die( 'Unknown audience.' );
	}
	if ( 'personal' === $grp && ! aap_editable_user( $uid ) ) {
		aap_flash( 'Choose the person this document belongs to.', 'error' );
		aap_back( $back[0], $back[1] );
	}
	$cat = sanitize_text_field( aap_post( 'category' ) );
	if ( 'personal' === $grp && ! isset( aap_personal_categories()[ $cat ] ) ) {
		$cat = 'other';
	}
	$file = aap_uploaded_file();
	if ( ! $file || is_wp_error( $file ) ) {
		aap_flash( $file ? $file->get_error_message() : 'Choose a file to upload.', 'error' );
		aap_back( $back[0], $back[1] );
	}
	$id = aap_add_document(
		array(
			'grp'         => $grp,
			'user_id'     => $uid,
			'category'    => $cat,
			'title'       => aap_post( 'title' ),
			'description' => aap_post( 'description' ),
			'doc_date'    => aap_post( 'doc_date' ),
			'file_name'   => $file[1],
		),
		$file[0]
	);
	if ( is_wp_error( $id ) ) {
		aap_flash( esc_html( $id->get_error_message() ), 'error' );
		aap_back( $back[0], $back[1] );
	}
	aap_log( 'upload', $id, 'personal' === $grp ? 'for ' . get_userdata( $uid )->display_name : $grp );
	$msg = 'Uploaded and encrypted.';
	if ( 'personal' === $grp && aap_post( 'notify' ) ) {
		$u     = get_userdata( $uid );
		$title = sanitize_text_field( aap_post( 'title' ) );
		$sent  = wp_mail(
			$u->user_email,
			'A new document is in your AeroAssist portal',
			'Hello ' . strtok( $u->display_name, ' ' ) . ",\n\nA new document, \"" . $title . "\", has been added to your AeroAssist Industries portal.\n\nSign in to view it: " . aap_portal_url() . "\n\nFor your security we never attach documents to email.\n\nAeroAssist Industries\n"
		);
		$msg .= $sent ? ' ' . esc_html( $u->display_name ) . ' has been emailed.' : ' The notification email could not be sent.';
	}
	aap_flash( $msg );
	aap_back( $back[0], $back[1] );
}

add_action( 'admin_post_aap_doc_update', 'aap_handle_doc_update' );
function aap_handle_doc_update() {
	global $wpdb;
	$id = absint( aap_post( 'doc', 0 ) );
	aap_check( 'aap_doc_update_' . $id );
	$d = aap_get_doc( $id );
	if ( ! $d ) {
		wp_die( 'Document not found.' );
	}
	$grp = 'personal' === $d->grp ? 'personal' : sanitize_key( aap_post( 'grp' ) );
	if ( 'personal' !== $grp && ! isset( aap_groups()[ $grp ] ) ) {
		wp_die( 'Unknown audience.' );
	}
	$uid = 'personal' === $grp ? absint( aap_post( 'user_id', 0 ) ) : 0;
	if ( 'personal' === $grp && ! aap_editable_user( $uid ) ) {
		wp_die( 'Choose a person.' );
	}
	$cat = sanitize_text_field( aap_post( 'category' ) );
	if ( 'personal' === $grp && ! isset( aap_personal_categories()[ $cat ] ) ) {
		$cat = 'other';
	}
	$fields = array(
		'grp'         => $grp,
		'user_id'     => $uid,
		'category'    => substr( $cat, 0, 60 ),
		'title'       => substr( sanitize_text_field( aap_post( 'title' ) ), 0, 255 ),
		'description' => sanitize_textarea_field( aap_post( 'description' ) ),
		'doc_date'    => aap_clean_date( aap_post( 'doc_date' ) ),
		'updated_at'  => current_time( 'mysql', true ),
	);
	$file = aap_uploaded_file();
	if ( is_wp_error( $file ) ) {
		aap_flash( esc_html( $file->get_error_message() ), 'error' );
		aap_back( 'aap-documents', array( 'doc' => $id ) );
	}
	if ( $file ) {
		$check = aap_check_bytes( $file[1], $file[0] );
		$saved = is_wp_error( $check ) ? $check : aap_store_bytes( $file[0] );
		if ( is_wp_error( $saved ) ) {
			aap_flash( esc_html( $saved->get_error_message() ), 'error' );
			aap_back( 'aap-documents', array( 'doc' => $id ) );
		}
		$fields = array_merge(
			$fields,
			array(
				'file_name' => $file[1],
				'stored_name' => $saved[0],
				'size'      => $saved[1],
				'sha256'    => $saved[2],
				'mime'      => $check[1],
			)
		);
	}
	$wpdb->update( aap_table( 'docs' ), $fields, array( 'id' => $id ) );
	if ( $file ) {
		aap_delete_file( $d->stored_name );
		aap_log( 'replace', $id, $file[1] );
	}
	aap_flash( 'Saved.' );
	aap_back( 'aap-documents', array( 'doc' => $id ) );
}

add_action( 'admin_post_aap_doc_delete', 'aap_handle_doc_delete' );
function aap_handle_doc_delete() {
	global $wpdb;
	$id = absint( aap_post( 'doc', 0 ) );
	aap_check( 'aap_doc_delete_' . $id );
	$d = aap_get_doc( $id );
	if ( $d ) {
		aap_delete_file( $d->stored_name );
		$wpdb->delete( aap_table( 'docs' ), array( 'id' => $id ) );
		aap_log( 'delete', $id, $d->title );
		aap_flash( 'Deleted “' . esc_html( $d->title ) . '”.' );
	}
	aap_back( 'aap-documents' );
}

/* ------------------------------------------------------------------ Transactions */

function aap_txn_types() {
	return array( 'Purchase', 'Subscription', 'Transfer in', 'Transfer out', 'Gift', 'Distribution', 'Return of capital', 'Repurchase', 'Adjustment' );
}

function aap_txn_form( $user_id = 0 ) {
	echo '<div class="aap-card aap-upload"><h3>Record a transaction</h3><form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" class="aap-form">';
	wp_nonce_field( 'aap_txn_add' );
	echo '<input type="hidden" name="action" value="aap_txn_add">';
	if ( $user_id ) {
		echo '<input type="hidden" name="user_id" value="' . (int) $user_id . '"><input type="hidden" name="back" value="person">';
	} else {
		echo '<p><label>Person<br>';
		aap_people_select( 'user_id' );
		echo '</label></p>';
	}
	echo '<div class="aap-row"><p><label>Date<br><input name="tx_date" type="date" required value="' . esc_attr( current_time( 'Y-m-d' ) ) . '"></label></p><p><label>Type<br><select name="type">';
	foreach ( aap_txn_types() as $t ) {
		echo '<option>' . esc_html( $t ) . '</option>';
	}
	echo '</select></label></p><p><label>Units<br><input name="units" type="number" step="any" class="small-text"></label></p><p><label>Amount ($)<br><input name="amount" type="number" step="any"></label></p></div>';
	echo '<p><label>Note (shown to them)<br><input type="text" name="note" class="large-text"></label></p>';
	echo '<p><label><input type="checkbox" name="adjust" value="1" checked> Update their units and paid-in to match (adds for purchases, subscriptions, transfers in and gifts; subtracts units for transfers out and repurchases)</label></p>';
	submit_button( 'Add transaction', 'primary', 'submit', false );
	echo '</form></div>';
}

function aap_txn_table( $rows, $show_person ) {
	echo '<table class="widefat striped aap-table"><thead><tr>' . ( $show_person ? '<th>Person</th>' : '' ) . '<th>Date</th><th>Type</th><th class="num">Units</th><th class="num">Amount</th><th>Note</th><th></th></tr></thead><tbody>';
	foreach ( $rows as $t ) {
		$p = $show_person ? get_userdata( $t->user_id ) : null;
		echo '<tr>';
		if ( $show_person ) {
			echo '<td>' . ( $p ? '<a href="' . esc_url( admin_url( 'admin.php?page=aap-people&edit=' . $p->ID ) ) . '">' . esc_html( $p->display_name ) . '</a>' : '—' ) . '</td>';
		}
		printf( '<td>%s</td><td>%s</td><td class="num">%s</td><td class="num">%s</td><td>%s</td><td>', esc_html( $t->tx_date ? mysql2date( 'M j, Y', $t->tx_date ) : '—' ), esc_html( $t->type ), (float) $t->units ? esc_html( rtrim( rtrim( number_format( (float) $t->units, 4 ), '0' ), '.' ) ) : '—', (float) $t->amount ? esc_html( aap_money( $t->amount ) ) : '—', esc_html( $t->note ) );
		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" onsubmit="return confirm(\'Delete this transaction? Units and paid-in are not changed.\')">';
		wp_nonce_field( 'aap_txn_delete_' . $t->id );
		echo '<input type="hidden" name="action" value="aap_txn_delete"><input type="hidden" name="id" value="' . (int) $t->id . '"><button class="button-link aap-danger-link">Delete</button></form></td></tr>';
	}
	if ( ! $rows ) {
		echo '<tr><td colspan="7">None recorded.</td></tr>';
	}
	echo '</tbody></table>';
}

function aap_screen_transactions() {
	global $wpdb;
	aap_head( 'Transactions', 'Purchases, transfers, gifts and distributions. Each person sees their own on “My investment” and in their statement.' );
	aap_txn_form();
	$rows = $wpdb->get_results( 'SELECT * FROM ' . aap_table( 'txns' ) . ' ORDER BY tx_date DESC, id DESC' );
	echo '<h2>All transactions <span class="aap-count">' . count( $rows ) . '</span></h2>';
	aap_txn_table( $rows, true );
	echo '</div>';
}

add_action( 'admin_post_aap_txn_add', 'aap_handle_txn_add' );
function aap_handle_txn_add() {
	global $wpdb;
	aap_check( 'aap_txn_add' );
	$uid  = absint( aap_post( 'user_id', 0 ) );
	$back = 'person' === aap_post( 'back' ) ? array( 'aap-people', array( 'edit' => $uid ) ) : array( 'aap-transactions', array() );
	if ( ! aap_editable_user( $uid ) ) {
		aap_flash( 'Choose a person.', 'error' );
		aap_back( $back[0], $back[1] );
	}
	$type   = sanitize_text_field( aap_post( 'type' ) );
	$units  = (float) aap_post( 'units', 0 );
	$amount = (float) aap_post( 'amount', 0 );
	$wpdb->insert(
		aap_table( 'txns' ),
		array(
			'user_id'    => $uid,
			'tx_date'    => aap_clean_date( aap_post( 'tx_date' ) ),
			'type'       => substr( $type, 0, 60 ),
			'units'      => $units,
			'amount'     => $amount,
			'note'       => sanitize_textarea_field( aap_post( 'note' ) ),
			'created_by' => get_current_user_id(),
			'created_at' => current_time( 'mysql', true ),
		)
	);
	if ( aap_post( 'adjust' ) ) {
		$cur_u = (float) get_user_meta( $uid, 'aap_units', true );
		$cur_p = (float) get_user_meta( $uid, 'aap_invested', true );
		if ( in_array( $type, array( 'Purchase', 'Subscription', 'Transfer in', 'Gift' ), true ) ) {
			update_user_meta( $uid, 'aap_units', $cur_u + $units );
			if ( in_array( $type, array( 'Purchase', 'Subscription' ), true ) ) {
				update_user_meta( $uid, 'aap_invested', $cur_p + $amount );
			}
			if ( ! get_user_meta( $uid, 'aap_since', true ) && aap_clean_date( aap_post( 'tx_date' ) ) ) {
				update_user_meta( $uid, 'aap_since', aap_clean_date( aap_post( 'tx_date' ) ) );
			}
		} elseif ( in_array( $type, array( 'Transfer out', 'Repurchase' ), true ) ) {
			update_user_meta( $uid, 'aap_units', max( 0, $cur_u - abs( $units ) ) );
		}
	}
	aap_log( 'transaction', 0, $type . ' for ' . get_userdata( $uid )->display_name );
	aap_flash( 'Transaction recorded.' );
	aap_back( $back[0], $back[1] );
}

add_action( 'admin_post_aap_txn_delete', 'aap_handle_txn_delete' );
function aap_handle_txn_delete() {
	global $wpdb;
	$id = absint( aap_post( 'id', 0 ) );
	aap_check( 'aap_txn_delete_' . $id );
	$wpdb->delete( aap_table( 'txns' ), array( 'id' => $id ) );
	aap_flash( 'Transaction deleted. Check their units and paid-in on their People page.' );
	wp_safe_redirect( wp_get_referer() ? wp_get_referer() : admin_url( 'admin.php?page=aap-transactions' ) );
	exit;
}

/* ------------------------------------------------------------------ Activity log */

function aap_log_labels() {
	return array(
		'view'           => 'Viewed',
		'download'       => 'Downloaded',
		'zip'            => 'Downloaded (zip)',
		'signin'         => 'Signed in',
		'signin_failed'  => 'Failed sign-in',
		'signout'        => 'Signed out',
		'timeout'        => 'Timed out',
		'denied'         => 'Refused',
		'upload'         => 'Uploaded',
		'replace'        => 'Replaced file',
		'delete'         => 'Deleted',
		'person_add'     => 'Added person',
		'person_edit'    => 'Edited person',
		'access_removed' => 'Removed access',
		'twofa_reset'    => 'Reset two-factor',
		'transaction'    => 'Recorded transaction',
		'settings'       => 'Changed settings',
		'import'         => 'Imported',
		'error'          => 'Error',
	);
}

function aap_log_table( $rows, $show_person = true ) {
	$labels = aap_log_labels();
	echo '<table class="widefat striped aap-table"><thead><tr><th>When</th>' . ( $show_person ? '<th>Person</th>' : '' ) . '<th>Action</th><th>Document</th><th>Detail</th><th>IP address</th></tr></thead><tbody>';
	foreach ( $rows as $r ) {
		$u = $show_person && $r->user_id ? get_userdata( $r->user_id ) : null;
		echo '<tr><td>' . esc_html( get_date_from_gmt( $r->created_at, 'M j, Y g:i:s a' ) ) . '</td>';
		if ( $show_person ) {
			echo '<td>' . ( $u ? esc_html( $u->display_name ) : '—' ) . '</td>';
		}
		printf( '<td>%s</td><td>%s</td><td>%s</td><td><code>%s</code></td></tr>', esc_html( isset( $labels[ $r->action ] ) ? $labels[ $r->action ] : $r->action ), esc_html( isset( $r->title ) && $r->title ? $r->title : ( $r->doc_id ? '#' . $r->doc_id : '' ) ), esc_html( $r->detail ), esc_html( $r->ip ) );
	}
	if ( ! $rows ) {
		echo '<tr><td colspan="6">Nothing recorded yet.</td></tr>';
	}
	echo '</tbody></table>';
}

function aap_log_query( $args, $limit = 0, $offset = 0 ) {
	global $wpdb;
	$where = array( '1=1' );
	$vals  = array();
	if ( ! empty( $args['person'] ) ) {
		$where[] = 'l.user_id = %d';
		$vals[]  = (int) $args['person'];
	}
	if ( ! empty( $args['type'] ) ) {
		$map     = array(
			'files'  => "l.action IN ('view','download','zip')",
			'signin' => "l.action IN ('signin','signin_failed','signout','timeout')",
			'admin'  => "l.action IN ('upload','replace','delete','person_add','person_edit','access_removed','twofa_reset','transaction','settings','import')",
			'denied' => "l.action IN ('denied','signin_failed','error')",
		);
		$where[] = isset( $map[ $args['type'] ] ) ? $map[ $args['type'] ] : '1=1';
	}
	if ( ! empty( $args['from'] ) ) {
		$where[] = 'l.created_at >= %s';
		$vals[]  = get_gmt_from_date( $args['from'] . ' 00:00:00' );
	}
	if ( ! empty( $args['to'] ) ) {
		$where[] = 'l.created_at <= %s';
		$vals[]  = get_gmt_from_date( $args['to'] . ' 23:59:59' );
	}
	$sql = 'SELECT l.*, d.title FROM ' . aap_table( 'log' ) . ' l LEFT JOIN ' . aap_table( 'docs' ) . ' d ON d.id = l.doc_id WHERE ' . implode( ' AND ', $where ) . ' ORDER BY l.id DESC';
	if ( $limit ) {
		$sql   .= ' LIMIT %d OFFSET %d';
		$vals[] = $limit;
		$vals[] = $offset;
	}
	return $wpdb->get_results( $vals ? $wpdb->prepare( $sql, $vals ) : $sql ); // phpcs:ignore WordPress.DB.PreparedSQL
}

function aap_log_args() {
	// phpcs:disable WordPress.Security.NonceVerification
	return array(
		'person' => isset( $_GET['person'] ) ? absint( $_GET['person'] ) : 0,
		'type'   => isset( $_GET['type'] ) ? sanitize_key( $_GET['type'] ) : '',
		'from'   => isset( $_GET['from'] ) ? aap_clean_date( sanitize_text_field( wp_unslash( $_GET['from'] ) ) ) : '',
		'to'     => isset( $_GET['to'] ) ? aap_clean_date( sanitize_text_field( wp_unslash( $_GET['to'] ) ) ) : '',
	);
	// phpcs:enable
}

function aap_screen_log() {
	$args = aap_log_args();
	// phpcs:ignore WordPress.Security.NonceVerification
	$paged = isset( $_GET['paged'] ) ? max( 1, absint( $_GET['paged'] ) ) : 1;
	aap_head( 'Activity log', 'Every sign-in, document view and download, and every change made here. Entries cannot be edited or deleted from these screens.' );
	echo '<form method="get" class="aap-filters"><input type="hidden" name="page" value="aap-log">';
	aap_people_select( 'person', $args['person'], false );
	echo '<select name="type"><option value="">All activity</option>';
	foreach ( array(
		'files'  => 'Document views and downloads',
		'signin' => 'Sign-ins and sign-outs',
		'denied' => 'Refusals and failures',
		'admin'  => 'Changes by administrators',
	) as $k => $l ) {
		printf( '<option value="%s"%s>%s</option>', esc_attr( $k ), selected( $args['type'], $k, false ), esc_html( $l ) );
	}
	echo '</select> <label>From <input type="date" name="from" value="' . esc_attr( $args['from'] ) . '"></label> <label>To <input type="date" name="to" value="' . esc_attr( $args['to'] ) . '"></label> <button class="button">Filter</button> ';
	echo '<a class="button" href="' . esc_url( wp_nonce_url( add_query_arg( array_merge( array( 'action' => 'aap_log_export' ), array_filter( $args ) ), admin_url( 'admin-post.php' ) ), 'aap_log_export' ) ) . '">Export CSV</a></form>';
	$rows = aap_log_query( $args, 101, ( $paged - 1 ) * 100 );
	$more = count( $rows ) > 100;
	aap_log_table( array_slice( $rows, 0, 100 ) );
	echo '<p>';
	if ( $paged > 1 ) {
		echo '<a class="button" href="' . esc_url( add_query_arg( 'paged', $paged - 1 ) ) . '">← Newer</a> ';
	}
	if ( $more ) {
		echo '<a class="button" href="' . esc_url( add_query_arg( 'paged', $paged + 1 ) ) . '">Older →</a>';
	}
	echo '</p></div>';
}

add_action(
	'admin_post_aap_log_export',
	function () {
		aap_check( 'aap_log_export' );
		$rows   = aap_log_query( aap_log_args() );
		$labels = aap_log_labels();
		nocache_headers();
		header( 'Content-Type: text/csv; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename="aeroassist-portal-activity-' . gmdate( 'Y-m-d' ) . '.csv"' );
		$out = fopen( 'php://output', 'w' );
		fputcsv( $out, array( 'When (site time)', 'Person', 'Portal ID', 'Action', 'Document', 'Detail', 'IP address', 'Browser' ) );
		foreach ( $rows as $r ) {
			$u = $r->user_id ? get_userdata( $r->user_id ) : null;
			$cells = array( get_date_from_gmt( $r->created_at, 'Y-m-d H:i:s' ), $u ? $u->display_name : '', $u ? aap_portal_id( $u->ID ) : '', isset( $labels[ $r->action ] ) ? $labels[ $r->action ] : $r->action, $r->title, $r->detail, $r->ip, $r->ua );
			// Neutralise spreadsheet formulas.
			$cells = array_map(
				function ( $c ) {
					$c = (string) $c;
					return preg_match( '/^[=+\-@\t\r]/', $c ) ? "'" . $c : $c;
				},
				$cells
			);
			fputcsv( $out, $cells );
		}
		fclose( $out ); // phpcs:ignore
		exit;
	}
);

/* ------------------------------------------------------------------ Settings */

function aap_lines_to_rows( $text, $cols ) {
	$rows = array();
	foreach ( preg_split( '/\r\n|\r|\n/', (string) $text ) as $line ) {
		if ( '' === trim( $line ) ) {
			continue;
		}
		$parts = array_map( 'trim', explode( '|', $line, $cols ) );
		$rows[] = array_pad( array_map( 'sanitize_text_field', $parts ), $cols, '' );
	}
	return $rows;
}

function aap_rows_to_lines( $rows ) {
	return implode( "\n", array_map( function ( $r ) { return implode( ' | ', (array) $r ); }, (array) $rows ) ); // phpcs:ignore
}

function aap_screen_settings() {
	$s = aap_settings();
	aap_head( 'Settings' );
	$ph = array_map(
		function ( $p ) {
			return array( $p['date'], $p['price'], isset( $p['label'] ) ? $p['label'] : '' );
		},
		(array) $s['price_history']
	);
	$an = array_map(
		function ( $a ) {
			return array( $a['date'], $a['title'], $a['body'] );
		},
		(array) $s['announcements']
	);
	echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" class="aap-form aap-settings">';
	wp_nonce_field( 'aap_settings_save' );
	echo '<input type="hidden" name="action" value="aap_settings_save">';
	echo '<div class="aap-cards"><div class="aap-card"><h2>Units and values</h2>';
	echo '<div class="aap-row"><p><label>Records as of<br><input type="date" name="as_of" value="' . esc_attr( $s['as_of'] ) . '"></label></p><p><label>Units outstanding<br><input type="number" step="any" min="1" name="units_outstanding" value="' . esc_attr( $s['units_outstanding'] ) . '"></label></p><p><label>Price per unit ($)<br><input type="number" step="any" min="0" name="unit_price" value="' . esc_attr( $s['unit_price'] ) . '"></label></p></div>';
	echo '<p><label>Price note (shown under the capital account)<br><input type="text" name="price_label" class="large-text" value="' . esc_attr( $s['price_label'] ) . '"></label></p>';
	echo '<div class="aap-row"><p><label>Units being offered in the current round<br><input type="number" step="any" min="0" name="round_units" value="' . esc_attr( $s['round_units'] ) . '"></label><br><span class="aap-muted">Used for “ownership after the round”. 0 hides it.</span></p><p class="aap-grow"><label>Round name<br><input type="text" name="round_name" class="regular-text" value="' . esc_attr( $s['round_name'] ) . '"></label></p></div>';
	echo '<p><label>Price history (one per line: date | price | label)<br><textarea name="price_history" rows="4" class="large-text code">' . esc_textarea( aap_rows_to_lines( $ph ) ) . '</textarea></label></p>';
	echo '</div><div class="aap-card"><h2>What people see</h2>';
	echo '<p><label>Note at the top of every page (optional)<br><input type="text" name="note" class="large-text" value="' . esc_attr( $s['note'] ) . '"></label></p>';
	echo '<p><label>Announcements (one per line: date | title | text)<br><textarea name="announcements" rows="5" class="large-text">' . esc_textarea( aap_rows_to_lines( $an ) ) . '</textarea></label></p>';
	echo '<p><label>Tax note for unit holders (K-1 timing)<br><input type="text" name="tax_note" class="large-text" value="' . esc_attr( $s['tax_note'] ) . '"></label></p>';
	echo '<p><label>Company at a glance (one per line: label | value)<br><textarea name="company_facts" rows="6" class="large-text">' . esc_textarea( aap_rows_to_lines( $s['company_facts'] ) ) . '</textarea></label></p>';
	echo '<p><label>About the company<br><textarea name="about" rows="3" class="large-text">' . esc_textarea( $s['about'] ) . '</textarea></label></p>';
	echo '<p><label>Contacts (one per line: name | title | what to ask about | email)<br><textarea name="contacts" rows="3" class="large-text">' . esc_textarea( aap_rows_to_lines( $s['contacts'] ) ) . '</textarea></label></p>';
	echo '<p><label>Links (one per line: label | URL or /path)<br><textarea name="links" rows="3" class="large-text">' . esc_textarea( aap_rows_to_lines( $s['links'] ) ) . '</textarea></label></p>';
	echo '<div class="aap-row"><p class="aap-grow"><label>Address line<br><input type="text" name="address" class="large-text" value="' . esc_attr( $s['address'] ) . '"></label></p><p><label>Help email<br><input name="help_email" type="email" value="' . esc_attr( $s['help_email'] ) . '"></label></p></div>';
	echo '</div><div class="aap-card"><h2>Security</h2>';
	$dis = current_user_can( 'manage_options' ) ? '' : ' disabled';
	echo '<p><label><input type="checkbox" name="require_2fa" value="1" ' . checked( $s['require_2fa'], 1, false ) . $dis . '> Require two-factor for everyone with portal access</label><br><span class="aap-muted">With the Two-Factor plugin, anyone without an authenticator app gets an emailed code at each sign-in.' . ( $dis ? ' Only a site administrator can change the security settings.' : '' ) . '</span></p>'; // phpcs:ignore WordPress.Security.EscapeOutput
	echo '<div class="aap-row"><p><label>Sign out after inactivity (minutes)<br><input type="number" min="5" max="240" name="idle_minutes" value="' . esc_attr( $s['idle_minutes'] ) . '"' . $dis . '></label></p><p><label>Longest session (hours)<br><input type="number" min="1" max="72" name="session_hours" value="' . esc_attr( $s['session_hours'] ) . '"' . $dis . '></label></p></div>'; // phpcs:ignore WordPress.Security.EscapeOutput
	if ( current_user_can( 'manage_options' ) ) {
		echo '<p><label><input type="checkbox" name="admins_manage" value="1" ' . checked( $s['admins_manage'], 1, false ) . '> WordPress administrators can manage the portal and see every document</label><br><span class="aap-muted">Untick once Jay and Sarvesh have the Portal administrator role, so a web developer’s admin account cannot open K-1s through these screens.</span></p>';
	}
	aap_security_status();
	echo '</div></div>';
	submit_button( 'Save settings' );
	echo '</form>';
	$me = wp_get_current_user();
	echo '<div class="aap-card" style="max-width:640px"><h2>Test email</h2><p>Two-factor codes and invitations go by email. Send yourself a test before switching two-factor on.</p><form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
	wp_nonce_field( 'aap_test_email' );
	echo '<input type="hidden" name="action" value="aap_test_email"><button class="button">Send a test email to ' . esc_html( $me->user_email ) . '</button></form></div></div>';
}

add_action(
	'admin_post_aap_test_email',
	function () {
		if ( ! current_user_can( 'aap_manage' ) ) {
			wp_die( 'Not allowed.', 403 );
		}
		check_admin_referer( 'aap_test_email' );
		$err = '';
		$catch = function ( $e ) use ( &$err ) {
			$err = $e->get_error_message();
		};
		add_action( 'wp_mail_failed', $catch );
		$me = wp_get_current_user();
		$ok = wp_mail( $me->user_email, 'AeroAssist portal test email', "This is a test from the AeroAssist portal on " . home_url( '/' ) . ".\n\nIf it arrived in your inbox (not spam), sign-in codes and invitations will reach people too.\n" );
		aap_flash( $ok ? 'Test email sent to ' . esc_html( $me->user_email ) . '. Check that it arrived in the inbox, not spam.' : 'WordPress could not send the email' . ( $err ? ': ' . esc_html( $err ) : '' ) . '. Set up an SMTP plugin before switching on two-factor.', $ok ? 'success' : 'error' );
		aap_back( 'aap-settings' );
	}
);

function aap_security_status() {
	$dir    = aap_storage_dir();
	$web    = aap_storage_in_webroot();
	$tf     = aap_twofa_plugin();
	$probe  = $web ? aap_probe_storage() : 'n/a';
	$rows   = array(
		array( 'Two-factor plugin', aap_twofa_panel_text() ),

		array( 'Document folder', $dir ? '<code>' . esc_html( $dir ) . '</code>' : aap_bad_pill() . 'Not set' ),
		array( 'Outside the public website', $dir ? ( $web ? aap_warn_pill() . 'No — it is inside the WordPress folder. Files are still encrypted and blocked by .htaccess' . ( 'blocked' === $probe ? ' (checked: blocked).' : ( 'open' === $probe ? ' — but the web server is serving it! Set AAP_STORAGE_DIR (below).' : '.' ) ) . ' Best: set AAP_STORAGE_DIR in wp-config.php to a folder above public_html.' : aap_ok_pill() . 'Yes' ) : '—' ),
		array( 'Encryption at rest', aap_ok_pill() . 'libsodium XSalsa20-Poly1305, random file names' ),
		array( 'Encryption key', aap_key_in_config() ? aap_ok_pill() . 'In wp-config.php (AAP_FILE_KEY)' : aap_warn_pill() . 'Stored in the database. ' . ( current_user_can( 'manage_options' ) ? 'For stronger separation add this line to wp-config.php, above “That’s all, stop editing”:<br><code class="aap-key">define( \'AAP_FILE_KEY\', \'' . esc_html( get_option( 'aap_file_key' ) ) . '\' );</code><br>Keep a copy somewhere safe — without it the documents cannot be decrypted.' : 'A site administrator can move it into wp-config.php from this page.' ) ),
		array( 'Email', 'Invitations and one-time codes are sent by email. Use an SMTP plugin (e.g. WP Mail SMTP with your Google Workspace or Microsoft 365) so they arrive reliably.' ),
	);
	echo '<table class="aap-kv">';
	foreach ( $rows as $r ) {
		echo '<tr><th>' . esc_html( $r[0] ) . '</th><td>' . wp_kses( $r[1], array( 'code' => array( 'class' => array() ), 'br' => array(), 'span' => array( 'class' => array() ) ) ) . '</td></tr>';
	}
	echo '</table>';
}

function aap_ok_pill() {
	return '<span class="aap-pill good">OK</span> ';
}
function aap_warn_pill() {
	return '<span class="aap-pill warn">Check</span> ';
}
function aap_bad_pill() {
	return '<span class="aap-pill bad">Missing</span> ';
}

function aap_twofa_panel_text() {
	$tf = aap_twofa_plugin();
	if ( 'two-factor' === $tf ) {
		return aap_ok_pill() . 'Two-Factor is active: anyone without an authenticator app gets an email code at each sign-in.' . ( aap_has_wordfence() ? ' Wordfence two-factor also counts: people who turned it on there are not asked twice.' : '' );
	}
	if ( 'wordfence' === $tf ) {
		$me = get_current_user_id();
		return ( aap_wordfence_2fa_active( $me ) ? aap_ok_pill() : aap_warn_pill() ) . 'Wordfence Login Security is active. Each person must turn on an authenticator app in Wordfence before the portal opens for them (Wordfence has no email codes). In Wordfence → Login Security → Settings, enable 2FA for Administrator and the four Portal roles. For email codes instead, also install the free Two-Factor plugin.';
	}
	return aap_bad_pill() . 'None active. Install the free Two-Factor plugin (or Wordfence Login Security).';
}

/** If storage is inside the web root, check over HTTP that the web server refuses to serve it. */
function aap_probe_storage() {
	$cached = get_transient( 'aap_probe' );
	if ( $cached ) {
		return $cached;
	}
	$dir  = aap_storage_dir();
	$name = 'probe-' . wp_generate_password( 8, false ) . '.txt';
	@file_put_contents( "$dir/$name", 'aap-probe' ); // phpcs:ignore
	$rel = ltrim( str_replace( wp_normalize_path( untrailingslashit( realpath( ABSPATH ) ) ), '', wp_normalize_path( realpath( $dir ) ) ), '/' );
	$res = wp_remote_get( site_url( $rel . '/' . $name ), array( 'timeout' => 5, 'sslverify' => false ) );
	wp_delete_file( "$dir/$name" );
	$state = is_wp_error( $res ) ? 'unknown' : ( 'aap-probe' === trim( wp_remote_retrieve_body( $res ) ) ? 'open' : 'blocked' );
	set_transient( 'aap_probe', $state, HOUR_IN_SECONDS );
	return $state;
}

add_action( 'admin_post_aap_settings_save', 'aap_handle_settings_save' );
function aap_handle_settings_save() {
	aap_check( 'aap_settings_save' );
	$ph = array();
	foreach ( aap_lines_to_rows( aap_post( 'price_history' ), 3 ) as $r ) {
		if ( aap_clean_date( $r[0] ) && is_numeric( str_replace( array( '$', ',' ), '', $r[1] ) ) ) {
			$ph[] = array(
				'date'  => $r[0],
				'price' => (float) str_replace( array( '$', ',' ), '', $r[1] ),
				'label' => $r[2],
			);
		}
	}
	$an = array();
	foreach ( aap_lines_to_rows( aap_post( 'announcements' ), 3 ) as $r ) {
		$an[] = array(
			'date'  => aap_clean_date( $r[0] ) ? $r[0] : '',
			'title' => $r[1],
			'body'  => $r[2],
		);
	}
	$changes = array(
		'as_of'             => aap_clean_date( aap_post( 'as_of' ) ) ? aap_post( 'as_of' ) : gmdate( 'Y-m-d' ),
		'units_outstanding' => max( 1, (float) aap_post( 'units_outstanding', 10000 ) ),
		'unit_price'        => max( 0, (float) aap_post( 'unit_price', 0 ) ),
		'price_label'       => sanitize_text_field( aap_post( 'price_label' ) ),
		'round_units'       => max( 0, (float) aap_post( 'round_units', 0 ) ),
		'round_name'        => sanitize_text_field( aap_post( 'round_name' ) ),
		'price_history'     => $ph,
		'note'              => sanitize_text_field( aap_post( 'note' ) ),
		'announcements'     => $an,
		'tax_note'          => sanitize_text_field( aap_post( 'tax_note' ) ),
		'company_facts'     => aap_lines_to_rows( aap_post( 'company_facts' ), 2 ),
		'about'             => sanitize_textarea_field( aap_post( 'about' ) ),
		'contacts'          => aap_lines_to_rows( aap_post( 'contacts' ), 4 ),
		'links'             => array_map(
			function ( $r ) {
				return array( $r[0], 0 === strpos( $r[1], '/' ) ? '/' . ltrim( sanitize_text_field( $r[1] ), '/' ) : esc_url_raw( $r[1] ) );
			},
			aap_lines_to_rows( aap_post( 'links' ), 2 )
		),
		'address'           => sanitize_text_field( aap_post( 'address' ) ),
		'help_email'        => sanitize_email( aap_post( 'help_email' ) ),
	);
	if ( current_user_can( 'manage_options' ) ) {
		$changes['require_2fa']   = aap_post( 'require_2fa' ) ? 1 : 0;
		$changes['idle_minutes']  = min( 240, max( 5, absint( aap_post( 'idle_minutes', 30 ) ) ) );
		$changes['session_hours'] = min( 72, max( 1, absint( aap_post( 'session_hours', 12 ) ) ) );
		$changes['admins_manage'] = aap_post( 'admins_manage' ) ? 1 : 0;
		if ( ! $changes['admins_manage'] && ! array_filter(
			get_users( array( 'role' => 'aa_admin' ) ),
			function ( $u ) {
				return true;
			}
		) ) {
			$changes['admins_manage'] = 1;
			aap_flash( 'Kept administrator access on: give at least one person the Portal administrator role first.', 'warning' );
		}
	}
	aap_update_settings( $changes );
	aap_sync_admin_cap();
	aap_log( 'settings' );
	aap_flash( 'Settings saved.' );
	if ( current_user_can( 'aap_manage' ) ) {
		aap_back( 'aap-settings' );
	}
	wp_safe_redirect( admin_url() );
	exit;
}
