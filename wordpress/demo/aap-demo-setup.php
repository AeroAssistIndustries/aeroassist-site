<?php
/**
 * Plugin Name: AeroAssist Portal demo data
 * Description: Fills a test site with made-up people, figures and sample documents. Never install on the live site.
 *
 * Run once: visit /wp-admin/?aap_demo_setup=1 as an administrator, or call aap_demo_setup() from WP-CLI.
 */

defined( 'ABSPATH' ) || exit;

/** A one-page PDF with a title and a few lines of text. */
function aap_demo_pdf( $title, array $lines ) {
	$esc  = function ( $s ) {
		return str_replace( array( '\\', '(', ')' ), array( '\\\\', '\\(', '\\)' ), $s );
	};
	$text = "BT /F1 22 Tf 72 720 Td (" . $esc( $title ) . ") Tj ET\n";
	$text .= "BT /F1 11 Tf 0.55 0.39 0.13 rg 72 696 Td (DEMO - sample document with made-up content) Tj ET\n";
	$y = 660;
	foreach ( $lines as $l ) {
		$text .= "BT /F1 12 Tf 72 $y Td (" . $esc( $l ) . ") Tj ET\n";
		$y    -= 20;
	}
	$text .= "BT /F1 9 Tf 0.5 0.5 0.5 rg 72 60 Td (AeroAssist Industries - investor and team portal demo) Tj ET\n";
	$objs = array(
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
		'<< /Length ' . strlen( $text ) . " >>\nstream\n" . $text . "endstream",
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
	);
	$pdf  = "%PDF-1.4\n";
	$offs = array();
	foreach ( $objs as $i => $o ) {
		$offs[] = strlen( $pdf );
		$pdf   .= ( $i + 1 ) . " 0 obj\n$o\nendobj\n";
	}
	$xref = strlen( $pdf );
	$pdf .= "xref\n0 " . ( count( $objs ) + 1 ) . "\n0000000000 65535 f \n";
	foreach ( $offs as $o ) {
		$pdf .= sprintf( "%010d 00000 n \n", $o );
	}
	return $pdf . "trailer\n<< /Size " . ( count( $objs ) + 1 ) . " /Root 1 0 R >>\nstartxref\n$xref\n%%EOF\n";
}

function aap_demo_setup() {
	global $wpdb;
	if ( ! function_exists( 'aap_add_document' ) ) {
		return 'AeroAssist Portal is not active.';
	}
	if ( get_option( 'aap_demo_done' ) ) {
		return 'Demo data already added.';
	}
	$admin_id = get_current_user_id();
	aap_update_settings(
		array(
			'as_of'             => gmdate( 'Y-m-d' ),
			'units_outstanding' => 10000,
			'round_units'       => 1000,
			'round_name'        => 'the current round',
			'unit_price'        => 150,
			'price_label'       => 'Demo figures only. These are not AeroAssist’s actual round terms.',
			'price_history'     => array(
				array( 'date' => '2023-04-01', 'price' => 40, 'label' => 'Seed (demo)' ),
				array( 'date' => '2025-06-01', 'price' => 90, 'label' => 'Bridge (demo)' ),
				array( 'date' => '2026-10-01', 'price' => 150, 'label' => 'Current round (demo)' ),
			),
			'announcements'     => array(
				array( 'date' => gmdate( 'Y-m-d' ), 'title' => 'Q3 unit holder report is posted', 'body' => 'Revenue, deliveries and the hiring plan for the quarter. Find it under Updates. (Demo announcement.)' ),
				array( 'date' => gmdate( 'Y-m-d', strtotime( '-20 days' ) ), 'title' => 'The new portal is live', 'body' => 'Holdings, K-1s, reports and company documents are now in one place, with one sign-in for each person.' ),
			),
			'tax_note'          => 'K-1s for tax year 2026 are expected by March 15, 2027. You will see them here as soon as they are issued. (Demo.)',
			'company_facts'     => array( array( 'Founded', '2022' ), array( 'Headquarters', 'Phoenix, Arizona' ), array( 'Units outstanding', '10,000 (demo)' ), array( 'Price per unit', '$150 (demo)' ) ),
			'note'              => 'Demo portal: the people, figures and documents here are made up.',
			'contacts'          => array(
				array( 'Jordan Avery', 'CFO (demo)', 'Tax documents, statements, access and transfers', 'jordan@example.com' ),
				array( 'Casey Morgan', 'CEO (demo)', 'The business and everything else', 'casey@example.com' ),
			),
			'help_email'        => 'jordan@example.com',
			'require_2fa'       => defined( 'AAP_DEMO_KEEP_2FA' ) && AAP_DEMO_KEEP_2FA ? 1 : 0,
		)
	);

	$people = array(
		'alex'   => array( 'Alex Rivera', 'alex@example.com', 'aa_investor', 120, '2023-04-01', 5800 ),
		'morgan' => array( 'Morgan Lee', 'morgan@example.com', 'aa_investor', 60, '2025-06-01', 5400 ),
		'priya'  => array( 'Priya Shah', 'priya@example.com', 'aa_prospect', 0, '', 0 ),
		'sam'    => array( 'Sam Chen', 'sam@example.com', 'aa_employee', 0, '', 0 ),
		'jordan' => array( 'Jordan Avery', 'jordan@example.com', 'aa_admin', 0, '', 0 ),
	);
	$ids = array();
	$n   = 0;
	foreach ( $people as $login => $p ) {
		$uid = username_exists( $login );
		if ( ! $uid ) {
			$parts = explode( ' ', $p[0] );
			$uid   = wp_insert_user(
				array(
					'user_login'   => $login,
					'user_email'   => $p[1],
					'user_pass'    => 'demo',
					'display_name' => $p[0],
					'first_name'   => $parts[0],
					'last_name'    => $parts[1],
					'role'         => $p[2],
				)
			);
		}
		$ids[ $login ] = $uid;
		update_user_meta( $uid, 'aap_id', sprintf( 'AA-D%03d', ++$n ) );
		update_user_meta( $uid, 'aap_units', $p[3] );
		update_user_meta( $uid, 'aap_since', $p[4] );
		update_user_meta( $uid, 'aap_invested', $p[5] );
		update_user_meta( $uid, 'aap_last_signin', time() - wp_rand( 3600, 86400 * 9 ) );
		update_user_meta( $uid, 'show_admin_bar_front', 'false' );
	}
	update_user_meta( $ids['sam'], 'aap_title', 'Flight operations lead' );

	$d    = function ( $days ) {
		return gmdate( 'Y-m-d', strtotime( "-$days days" ) );
	};
	$docs = array(
		array( 'company', 'Agencies and sales', 'Product overview', 'The aircraft, the dock and how a call is answered.', $d( 30 ) ),
		array( 'company', 'Agencies and sales', 'Agency case study', 'A sample department’s first ninety days.', $d( 6 ) ),
		array( 'company', 'Agencies and sales', 'Compliance statement', 'Supply-chain and certification summary.', $d( 45 ) ),
		array( 'investors', 'Raise and investing', 'Investor one-pager', 'The company and the round on one page.', $d( 9 ) ),
		array( 'investors', 'Raise and investing', 'Subscription agreement (sample)', 'How units are purchased.', $d( 9 ) ),
		array( 'investors', 'Raise and investing', 'Due diligence checklist', 'What investors usually ask for.', $d( 40 ) ),
		array( 'holders', 'Unit holder reports', 'Q3 2026 unit holder report', 'Quarterly results and outlook.', $d( 2 ) ),
		array( 'holders', 'Unit holder reports', '2025 annual update', 'The year in review.', $d( 200 ) ),
		array( 'holders', 'Unit holder reports', 'Cap table summary', 'Units outstanding before and after the round.', $d( 9 ) ),
		array( 'team', 'Operations', 'Flight safety manual', 'Preflight, weather limits and emergencies.', $d( 60 ) ),
		array( 'team', 'People and HR', 'Employee handbook', 'Pay, time off and conduct.', $d( 90 ) ),
		array( 'team', 'Operations', 'Information security policy', 'Devices, access and incident response.', $d( 12 ) ),
		array( 'admin', 'Governance and admin', 'Written consent template', 'Manager and member consents.', $d( 15 ) ),
		array( 'admin', 'Governance and admin', 'Raise tracker export', 'Pipeline snapshot.', $d( 3 ) ),
	);
	$doc_ids = array();
	foreach ( $docs as $x ) {
		$id = aap_add_document(
			array( 'grp' => $x[0], 'user_id' => 0, 'category' => $x[1], 'title' => $x[2], 'description' => $x[3], 'doc_date' => $x[4], 'file_name' => sanitize_title( $x[2] ) . '.pdf' ),
			aap_demo_pdf( $x[2], array( $x[3], '', 'This is placeholder text for the portal demo.' ) )
		);
		$doc_ids[] = $id;
	}
	$personal = array(
		array( 'alex', 'tax', '2025 Schedule K-1', $d( 200 ) ),
		array( 'alex', 'certificates', 'Unit confirmation, 100 units', '2023-04-01' ),
		array( 'alex', 'agreements', 'Subscription agreement, signed', $d( 5 ) ),
		array( 'morgan', 'tax', '2025 Schedule K-1', $d( 200 ) ),
		array( 'morgan', 'certificates', 'Unit confirmation, 60 units', '2025-06-01' ),
		array( 'sam', 'team', 'Offer letter', $d( 120 ) ),
	);
	foreach ( $personal as $x ) {
		$doc_ids[] = aap_add_document(
			array( 'grp' => 'personal', 'user_id' => $ids[ $x[0] ], 'category' => $x[1], 'title' => $x[2], 'description' => '', 'doc_date' => $x[3], 'file_name' => sanitize_title( $x[2] ) . '.pdf' ),
			aap_demo_pdf( $x[2], array( 'Prepared for ' . $people[ $x[0] ][0] . ' (made-up person).', '', 'No real tax or personal information.' ) )
		);
	}
	$tx = array(
		array( 'alex', '2023-04-01', 'Purchase', 100, 4000, 'Seed round (demo)' ),
		array( 'alex', $d( 5 ), 'Purchase', 20, 1800, 'Bridge allocation (demo)' ),
		array( 'alex', $d( 60 ), 'Distribution', 0, 600, 'Tax distribution (demo)' ),
		array( 'morgan', '2025-06-01', 'Purchase', 60, 5400, 'Bridge round (demo)' ),
	);
	foreach ( $tx as $t ) {
		$wpdb->insert( aap_table( 'txns' ), array( 'user_id' => $ids[ $t[0] ], 'tx_date' => $t[1], 'type' => $t[2], 'units' => $t[3], 'amount' => $t[4], 'note' => $t[5], 'created_by' => $admin_id, 'created_at' => current_time( 'mysql', true ) ) );
	}
	// Some activity for the log.
	$events = array( array( 'alex', 'signin', 0 ), array( 'alex', 'view', $doc_ids[14] ), array( 'alex', 'download', $doc_ids[6] ), array( 'morgan', 'signin', 0 ), array( 'morgan', 'view', $doc_ids[17] ), array( 'priya', 'signin', 0 ), array( 'priya', 'view', $doc_ids[3] ), array( 'sam', 'signin', 0 ), array( 'sam', 'download', $doc_ids[9] ), array( 'priya', 'signin_failed', 0 ) );
	$t = time() - 86400 * 3;
	foreach ( $events as $e ) {
		$t += wp_rand( 900, 9000 );
		$wpdb->insert( aap_table( 'log' ), array( 'user_id' => $ids[ $e[0] ], 'doc_id' => $e[2], 'action' => $e[1], 'detail' => '', 'ip' => '203.0.113.' . wp_rand( 2, 250 ), 'ua' => 'Demo browser', 'created_at' => gmdate( 'Y-m-d H:i:s', $t ) ) );
	}
	update_option( 'aap_demo_done', 1, false );
	return 'Demo data added. Sign in as alex, morgan, priya, sam or jordan with the password demo.';
}

add_action(
	'admin_init',
	function () {
		// phpcs:ignore WordPress.Security.NonceVerification
		if ( isset( $_GET['aap_demo_setup'] ) && current_user_can( 'manage_options' ) ) {
			wp_die( esc_html( aap_demo_setup() ) );
		}
	}
);
