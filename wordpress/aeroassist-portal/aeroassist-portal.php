<?php
/**
 * Plugin Name:       AeroAssist Portal
 * Description:       Investor and team portal for AeroAssist Industries: personal sign-ins with two-factor, role-based documents, K-1s, capital accounts and a download log.
 * Version:           1.0.1
 * Requires at least: 6.4
 * Requires PHP:      7.4
 * Author:            AeroAssist Industries
 * License:           GPL-2.0-or-later
 * Text Domain:       aeroassist-portal
 */

defined( 'ABSPATH' ) || exit;

define( 'AAP_VERSION', '1.0.1' );
define( 'AAP_DB_VERSION', 1 );
define( 'AAP_FILE', __FILE__ );
define( 'AAP_DIR', plugin_dir_path( __FILE__ ) );
define( 'AAP_URL', plugin_dir_url( __FILE__ ) );

require_once AAP_DIR . 'includes/core.php';
require_once AAP_DIR . 'includes/storage.php';
require_once AAP_DIR . 'includes/install.php';
require_once AAP_DIR . 'includes/auth.php';
require_once AAP_DIR . 'includes/files.php';
require_once AAP_DIR . 'includes/frontend.php';
if ( is_admin() ) {
	require_once AAP_DIR . 'includes/admin.php';
	require_once AAP_DIR . 'includes/import.php';
}

register_activation_hook( __FILE__, 'aap_activate' );
register_deactivation_hook( __FILE__, 'aap_deactivate' );
