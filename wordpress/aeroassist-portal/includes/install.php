<?php
/**
 * Activation: roles, tables, private storage and the portal page.
 */

defined( 'ABSPATH' ) || exit;

function aap_activate() {
	aap_install_roles();
	aap_install_tables();
	aap_init_storage();
	aap_file_key();
	if ( false === get_option( 'aap_settings' ) ) {
		add_option( 'aap_settings', aap_default_settings(), '', false );
	}
	aap_install_page();
	update_option( 'aap_db_version', AAP_DB_VERSION, false );
}

function aap_deactivate() {
	// Data, documents and roles are kept. See uninstall.php.
}

function aap_install_roles() {
	foreach ( aap_roles() as $slug => $r ) {
		remove_role( $slug );
		$caps = array(
			'read'       => true,
			'aap_portal' => true,
		);
		if ( 'admin' === $r[0] ) {
			$caps['aap_manage'] = true;
		}
		add_role( $slug, $r[1], $caps );
	}
	aap_sync_admin_cap();
}

/** WordPress administrators manage the portal only while the setting allows it. */
function aap_sync_admin_cap() {
	$admin = get_role( 'administrator' );
	if ( ! $admin ) {
		return;
	}
	if ( aap_setting( 'admins_manage' ) ) {
		$admin->add_cap( 'aap_manage' );
		$admin->add_cap( 'aap_portal' );
	} else {
		$admin->remove_cap( 'aap_manage' );
		$admin->remove_cap( 'aap_portal' );
	}
}

function aap_install_tables() {
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	$c = $wpdb->get_charset_collate();
	dbDelta(
		'CREATE TABLE ' . aap_table( 'docs' ) . " (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  grp varchar(20) NOT NULL,
  user_id bigint(20) unsigned NOT NULL DEFAULT 0,
  category varchar(60) NOT NULL DEFAULT '',
  title varchar(255) NOT NULL DEFAULT '',
  description text NULL,
  doc_date date NULL,
  file_name varchar(255) NOT NULL DEFAULT '',
  stored_name varchar(64) NOT NULL DEFAULT '',
  mime varchar(120) NOT NULL DEFAULT '',
  size bigint(20) unsigned NOT NULL DEFAULT 0,
  sha256 char(64) NOT NULL DEFAULT '',
  uploaded_by bigint(20) unsigned NOT NULL DEFAULT 0,
  created_at datetime NOT NULL,
  updated_at datetime NOT NULL,
  PRIMARY KEY  (id),
  KEY grp (grp),
  KEY user_id (user_id)
) $c;"
	);
	dbDelta(
		'CREATE TABLE ' . aap_table( 'txns' ) . " (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  user_id bigint(20) unsigned NOT NULL,
  tx_date date NULL,
  type varchar(60) NOT NULL DEFAULT '',
  units decimal(18,4) NOT NULL DEFAULT 0,
  amount decimal(18,2) NOT NULL DEFAULT 0,
  note text NULL,
  created_by bigint(20) unsigned NOT NULL DEFAULT 0,
  created_at datetime NOT NULL,
  PRIMARY KEY  (id),
  KEY user_id (user_id)
) $c;"
	);
	dbDelta(
		'CREATE TABLE ' . aap_table( 'log' ) . " (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  user_id bigint(20) unsigned NOT NULL DEFAULT 0,
  doc_id bigint(20) unsigned NOT NULL DEFAULT 0,
  action varchar(20) NOT NULL DEFAULT '',
  detail varchar(255) NOT NULL DEFAULT '',
  ip varchar(64) NOT NULL DEFAULT '',
  ua varchar(255) NOT NULL DEFAULT '',
  created_at datetime NOT NULL,
  PRIMARY KEY  (id),
  KEY user_id (user_id),
  KEY doc_id (doc_id),
  KEY created_at (created_at)
) $c;"
	);
}

function aap_install_page() {
	$id = (int) get_option( 'aap_page_id' );
	if ( $id && get_post( $id ) && 'trash' !== get_post_status( $id ) ) {
		return;
	}
	$existing = get_page_by_path( 'portal' );
	if ( $existing && false !== strpos( $existing->post_content, '[aeroassist_portal' ) ) {
		update_option( 'aap_page_id', $existing->ID, false );
		return;
	}
	$id = wp_insert_post(
		array(
			'post_type'      => 'page',
			'post_status'    => 'publish',
			'post_title'     => 'Investor and team portal',
			'post_name'      => $existing ? 'investor-portal' : 'portal',
			'post_content'   => '[aeroassist_portal]',
			'comment_status' => 'closed',
			'ping_status'    => 'closed',
		)
	);
	if ( $id && ! is_wp_error( $id ) ) {
		update_option( 'aap_page_id', $id, false );
	}
}

/* Upgrade tables after a plugin update. */
add_action(
	'plugins_loaded',
	function () {
		if ( (int) get_option( 'aap_db_version' ) < AAP_DB_VERSION ) {
			aap_install_tables();
			update_option( 'aap_db_version', AAP_DB_VERSION, false );
		}
	}
);
