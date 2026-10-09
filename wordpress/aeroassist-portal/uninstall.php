<?php
/**
 * Uninstall. Documents (including K-1s) are NOT deleted unless wp-config.php sets
 * define( 'AAP_DELETE_DATA_ON_UNINSTALL', true ); — so removing the plugin by mistake loses nothing.
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

if ( ! defined( 'AAP_DELETE_DATA_ON_UNINSTALL' ) || ! AAP_DELETE_DATA_ON_UNINSTALL ) {
	return;
}

global $wpdb;
$dir = defined( 'AAP_STORAGE_DIR' ) && AAP_STORAGE_DIR ? AAP_STORAGE_DIR : get_option( 'aap_storage_dir' );
if ( $dir && is_dir( $dir ) ) {
	foreach ( glob( rtrim( $dir, '/' ) . '/*.bin' ) as $f ) {
		wp_delete_file( $f );
	}
}
foreach ( array( 'docs', 'txns', 'log' ) as $t ) {
	$wpdb->query( 'DROP TABLE IF EXISTS ' . $wpdb->prefix . 'aap_' . $t ); // phpcs:ignore
}
foreach ( array( 'aap_settings', 'aap_file_key', 'aap_storage_dir', 'aap_page_id', 'aap_db_version' ) as $o ) {
	delete_option( $o );
}
foreach ( array( 'aa_prospect', 'aa_investor', 'aa_employee', 'aa_admin' ) as $r ) {
	remove_role( $r );
}
