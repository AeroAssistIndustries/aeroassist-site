<?php
/**
 * One-time import from the old static portal's private folder (portal-input): the library,
 * settings, and any people (with emails), personal documents and transactions.
 * Accepts a zip upload or a folder on the server. Safe to run twice: duplicates are skipped.
 */

defined( 'ABSPATH' ) || exit;

function aap_screen_import() {
	aap_head( 'Import', 'Bring in the old portal’s private folder (<code>portal-input</code>). Run it once after installing; running it again skips anything already imported.' );
	// phpcs:ignore WordPress.Security.NonceVerification
	$report = get_transient( 'aap_import_report_' . get_current_user_id() );
	if ( $report ) {
		delete_transient( 'aap_import_report_' . get_current_user_id() );
		echo '<div class="aap-card"><h2>Import results</h2><ul class="aap-report">';
		foreach ( $report as $line ) {
			echo '<li>' . esc_html( $line ) . '</li>';
		}
		echo '</ul></div>';
	}
	echo '<div class="aap-cards"><div class="aap-card"><h2>From a zip file</h2><form method="post" enctype="multipart/form-data" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" class="aap-form">';
	wp_nonce_field( 'aap_import' );
	echo '<input type="hidden" name="action" value="aap_import">';
	echo '<p><label>Zip of the portal-input folder<br><input type="file" name="file" accept=".zip"></label> <span class="aap-muted">Up to ' . esc_html( size_format( wp_max_upload_size() ) ) . '.</span></p>';
	if ( current_user_can( 'manage_options' ) ) {
		echo '<p><label>…or a folder already on the server (e.g. uploaded by SFTP, outside public_html)<br><input type="text" name="folder" class="large-text code" placeholder="' . esc_attr( dirname( untrailingslashit( ABSPATH ) ) . '/portal-input' ) . '"></label></p>';
	}
	echo '<fieldset><legend><strong>What to import</strong></legend>';
	foreach ( array(
		'library'  => array( 'Library documents (library.csv and library/)', true ),
		'settings' => array( 'Settings (settings.json: unit price, history, announcements, company facts, tax note)', true ),
		'people'   => array( 'People (people.csv — rows need an email column; people without one are skipped)', true ),
		'personal' => array( 'Personal documents and transactions for those people (documents.csv, transactions.csv)', true ),
		'skiptest' => array( 'Skip test accounts (IDs containing TEST)', true ),
		'invite'   => array( 'Email imported people a link to choose their password', false ),
	) as $k => $o ) {
		echo '<label><input type="checkbox" name="' . esc_attr( $k ) . '" value="1"' . checked( $o[1], true, false ) . '> ' . esc_html( $o[0] ) . '</label><br>';
	}
	echo '</fieldset>';
	submit_button( 'Import', 'primary', 'submit', false );
	echo '</form></div><div class="aap-card"><h2>Notes</h2><ul class="aap-report">';
	echo '<li>The old access codes (codes.csv) and group keys (keys.json) are not used: everyone gets a real account with their own password and two-factor.</li>';
	echo '<li>Personal documents shared with a whole role (<code>@investor</code>, <code>@employee</code>) become library documents for that audience.</li>';
	echo '<li>After importing, delete the zip and any server copy of portal-input. It contains documents in the clear.</li>';
	echo '</ul></div></div></div>';
}

add_action( 'admin_post_aap_import', 'aap_handle_import' );
function aap_handle_import() {
	aap_check( 'aap_import' );
	@set_time_limit( 300 ); // phpcs:ignore
	$opts = array();
	foreach ( array( 'library', 'settings', 'people', 'personal', 'skiptest', 'invite' ) as $k ) {
		$opts[ $k ] = (bool) aap_post( $k );
	}
	$src    = null;
	$folder = trim( sanitize_text_field( aap_post( 'folder' ) ) );
	$file   = aap_uploaded_file();
	if ( is_wp_error( $file ) ) {
		aap_flash( esc_html( $file->get_error_message() ), 'error' );
		aap_back( 'aap-import' );
	}
	if ( $file ) {
		$src = aap_import_source_zip( $_FILES['file']['tmp_name'] ); // phpcs:ignore -- validated by aap_uploaded_file(); PHP deletes it after the request.
	} elseif ( $folder ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			aap_flash( 'Only a site administrator can import from a server folder. Upload a zip instead.', 'error' );
			aap_back( 'aap-import' );
		}
		$src = aap_import_source_dir( $folder );
	}
	if ( ! $src || is_wp_error( $src ) ) {
		aap_flash( $src ? esc_html( $src->get_error_message() ) : 'Choose a zip file or enter a folder.', 'error' );
		aap_back( 'aap-import' );
	}
	$report = aap_import( $src, $opts );
	aap_log( 'import', 0, substr( implode( '; ', array_slice( $report, 0, 3 ) ), 0, 250 ) );
	set_transient( 'aap_import_report_' . get_current_user_id(), $report, 600 );
	aap_back( 'aap-import' );
}

/** A reader over a zip: returns a callable(relative path) => bytes|false. */
function aap_import_source_zip( $path ) {
	if ( ! class_exists( 'ZipArchive' ) ) {
		return new WP_Error( 'aap_zip', 'This server cannot open zip files. Upload the folder by SFTP and use the folder option.' );
	}
	$zip = new ZipArchive();
	if ( true !== $zip->open( $path ) ) {
		return new WP_Error( 'aap_zip', 'That zip file could not be opened.' );
	}
	$prefix = null;
	for ( $i = 0; $i < $zip->numFiles; $i++ ) { // phpcs:ignore WordPress.NamingConventions.ValidVariableName
		$n = $zip->getNameIndex( $i );
		if ( preg_match( '#^(.*?)(people|library)\.csv$#', $n, $m ) && false === strpos( $m[1], '..' ) ) {
			$prefix = $m[1];
			break;
		}
	}
	if ( null === $prefix ) {
		return new WP_Error( 'aap_zip', 'No people.csv or library.csv found in the zip.' );
	}
	return function ( $rel ) use ( $zip, $prefix ) {
		$rel = ltrim( str_replace( '\\', '/', $rel ), '/' );
		if ( false !== strpos( $rel, '..' ) ) {
			return false;
		}
		return $zip->getFromName( $prefix . $rel );
	};
}

function aap_import_source_dir( $dir ) {
	$real = realpath( $dir );
	if ( ! $real || ! is_dir( $real ) || ( ! is_file( "$real/people.csv" ) && ! is_file( "$real/library.csv" ) ) ) {
		return new WP_Error( 'aap_dir', 'That folder was not found, or has no people.csv or library.csv.' );
	}
	return function ( $rel ) use ( $real ) {
		$p = realpath( $real . '/' . ltrim( $rel, '/' ) );
		if ( ! $p || 0 !== strpos( $p, $real . DIRECTORY_SEPARATOR ) || ! is_file( $p ) ) {
			return false;
		}
		return file_get_contents( $p ); // phpcs:ignore
	};
}

function aap_import_csv( $text ) {
	if ( false === $text || '' === $text ) {
		return array();
	}
	$text = preg_replace( '/^\xEF\xBB\xBF/', '', $text );
	$fh   = fopen( 'php://temp', 'r+' ); // phpcs:ignore
	fwrite( $fh, $text ); // phpcs:ignore
	rewind( $fh );
	$head = fgetcsv( $fh, 0, ',', '"', '\\' );
	$rows = array();
	if ( ! $head ) {
		return $rows;
	}
	$head = array_map( 'trim', $head );
	while ( ( $r = fgetcsv( $fh, 0, ',', '"', '\\' ) ) !== false ) { // phpcs:ignore
		if ( array( null ) === $r ) {
			continue;
		}
		$row = array();
		foreach ( $head as $i => $k ) {
			$row[ $k ] = isset( $r[ $i ] ) ? trim( $r[ $i ] ) : '';
		}
		$rows[] = $row;
	}
	fclose( $fh ); // phpcs:ignore
	return $rows;
}

/** Store bytes as a document (encrypted straight from memory), skipping exact duplicates. */
function aap_import_doc( $bytes, array $fields ) {
	global $wpdb;
	$sha = hash( 'sha256', $bytes );
	$dup = $wpdb->get_var( $wpdb->prepare( 'SELECT id FROM ' . aap_table( 'docs' ) . ' WHERE sha256 = %s AND grp = %s AND user_id = %d AND title = %s', $sha, $fields['grp'], 'personal' === $fields['grp'] ? (int) $fields['user_id'] : 0, $fields['title'] ) );
	if ( $dup ) {
		return 'dup';
	}
	return aap_add_document( $fields, $bytes );
}

function aap_import( callable $src, array $o ) {
	global $wpdb;
	$r     = array();
	$pcats = aap_personal_categories();

	if ( $o['settings'] ) {
		$json = $src( 'settings.json' );
		$j    = $json ? json_decode( $json, true ) : null;
		if ( is_array( $j ) ) {
			$c = array();
			$str = function ( $v ) {
				return is_scalar( $v ) ? sanitize_text_field( (string) $v ) : '';
			};
			foreach ( array( 'asOf' => 'as_of', 'priceLabel' => 'price_label', 'taxNote' => 'tax_note', 'note' => 'note' ) as $from => $to ) {
				if ( isset( $j[ $from ] ) ) {
					$c[ $to ] = $str( $j[ $from ] );
				}
			}
			foreach ( array( 'unitsOutstanding' => 'units_outstanding', 'unitPrice' => 'unit_price' ) as $from => $to ) {
				if ( isset( $j[ $from ] ) && is_numeric( $j[ $from ] ) ) {
					$c[ $to ] = (float) $j[ $from ];
				}
			}
			if ( isset( $j['priceHistory'] ) && is_array( $j['priceHistory'] ) ) {
				$c['price_history'] = array();
				foreach ( $j['priceHistory'] as $p ) {
					if ( is_array( $p ) && isset( $p['date'], $p['price'] ) && aap_clean_date( $str( $p['date'] ) ) && is_numeric( $p['price'] ) ) {
						$c['price_history'][] = array( 'date' => $str( $p['date'] ), 'price' => (float) $p['price'], 'label' => isset( $p['label'] ) ? $str( $p['label'] ) : '' );
					}
				}
			}
			if ( isset( $j['announcements'] ) && is_array( $j['announcements'] ) ) {
				$c['announcements'] = array();
				foreach ( $j['announcements'] as $a ) {
					if ( is_array( $a ) ) {
						$c['announcements'][] = array( 'date' => isset( $a['date'] ) ? $str( $a['date'] ) : '', 'title' => isset( $a['title'] ) ? $str( $a['title'] ) : '', 'body' => isset( $a['body'] ) ? $str( $a['body'] ) : '' );
					}
				}
			}
			if ( isset( $j['companyFacts'] ) && is_array( $j['companyFacts'] ) ) {
				$c['company_facts'] = array();
				foreach ( $j['companyFacts'] as $f ) {
					if ( is_array( $f ) && count( $f ) >= 2 ) {
						$c['company_facts'][] = array( $str( $f[0] ), $str( $f[1] ) );
					}
				}
			}
			// The old test-setup note is not for the live portal.
			if ( isset( $c['note'] ) && false !== stripos( $c['note'], 'test' ) ) {
				$c['note'] = '';
			}
			aap_update_settings( $c );
			$r[] = 'Settings: imported ' . count( $c ) . ' values (unit price, price history, announcements, company facts…).';
		} else {
			$r[] = 'Settings: no settings.json found.';
		}
	}

	if ( $o['library'] ) {
		$n    = 0;
		$skip = 0;
		$miss = array();
		foreach ( aap_import_csv( $src( 'library.csv' ) ) as $d ) {
			if ( ! isset( aap_groups()[ $d['group'] ] ) ) {
				$miss[] = $d['title'] . ' (unknown group)';
				continue;
			}
			$bytes = $src( $d['file'] );
			if ( false === $bytes ) {
				$miss[] = $d['title'];
				continue;
			}
			$id = aap_import_doc(
				$bytes,
				array(
					'grp'         => $d['group'],
					'user_id'     => 0,
					'category'    => isset( $d['category'] ) ? $d['category'] : 'Documents',
					'title'       => $d['title'],
					'description' => isset( $d['description'] ) ? $d['description'] : '',
					'doc_date'    => isset( $d['date'] ) ? $d['date'] : '',
					'file_name'   => basename( $d['file'] ),
				)
			);
			if ( 'dup' === $id ) {
				++$skip;
			} elseif ( is_wp_error( $id ) ) {
				$miss[] = $d['title'] . ': ' . $id->get_error_message();
			} else {
				++$n;
			}
		}
		$r[] = "Library: added $n, skipped $skip already imported" . ( $miss ? '; problems: ' . implode( ', ', $miss ) : '' ) . '.';
	}

	$by_id = array(); // old portal ID => user ID.
	if ( $o['people'] ) {
		$added = 0;
		$found = 0;
		$skipped = array();
		foreach ( aap_import_csv( $src( 'people.csv' ) ) as $p ) {
			$pid = strtoupper( preg_replace( '/\s+/', '', $p['id'] ) );
			if ( $o['skiptest'] && false !== strpos( $pid, 'TEST' ) ) {
				continue;
			}
			$role = strtolower( $p['role'] );
			if ( ! isset( aap_role_labels()[ $role ] ) ) {
				$skipped[] = "$pid (unknown role)";
				continue;
			}
			// Match on email only: a portal ID alone could belong to a different account here.
			$u = ( ! empty( $p['email'] ) && is_email( $p['email'] ) ) ? get_user_by( 'email', $p['email'] ) : null;
			if ( $u ) {
				++$found;
				if ( ! aap_is_portal_user( $u ) && ! array_diff( (array) $u->roles, array( 'subscriber' ) ) ) {
					$u->set_role( aap_wp_role( $role ) );
				}
			} else {
				if ( empty( $p['email'] ) || ! is_email( $p['email'] ) ) {
					$skipped[] = $pid . ' ' . $p['name'] . ' (no email)';
					continue;
				}
				$parts = explode( ' ', $p['name'], 2 );
				$login = strtolower( $p['email'] );
				$uid   = wp_insert_user(
					array(
						'user_login'   => strlen( $login ) <= 60 && ! username_exists( $login ) ? $login : sanitize_user( strtok( $p['email'], '@' ), true ) . wp_rand( 100, 999 ),
						'user_email'   => $p['email'],
						'user_pass'    => wp_generate_password( 32, true, true ),
						'display_name' => $p['name'],
						'first_name'   => $parts[0],
						'last_name'    => isset( $parts[1] ) ? $parts[1] : '',
						'role'         => aap_wp_role( $role ),
					)
				);
				if ( is_wp_error( $uid ) ) {
					$skipped[] = "$pid ({$uid->get_error_message()})";
					continue;
				}
				$u = get_userdata( $uid );
				update_user_meta( $uid, 'show_admin_bar_front', 'false' );
				++$added;
				if ( $o['invite'] ) {
					aap_send_invite( $u );
				}
			}
			if ( ! get_user_meta( $u->ID, 'aap_id', true ) && ! aap_find_user_by_portal_id( $pid ) ) {
				update_user_meta( $u->ID, 'aap_id', $pid );
			}
			foreach ( array( 'units', 'invested', 'since', 'title' ) as $k ) {
				if ( isset( $p[ $k ] ) && '' !== $p[ $k ] ) {
					update_user_meta( $u->ID, 'aap_' . $k, in_array( $k, array( 'units', 'invested' ), true ) ? (float) $p[ $k ] : sanitize_text_field( $p[ $k ] ) );
				}
			}
			$by_id[ $pid ] = $u->ID;
		}
		$r[] = "People: added $added, matched $found existing" . ( $skipped ? '; skipped ' . implode( ', ', $skipped ) : '' ) . '.';
	}

	if ( $o['personal'] ) {
		$n    = 0;
		$lib  = 0;
		$skip = 0;
		$miss = array();
		$role_to_group = array(
			'*'          => 'company',
			'@investor'  => 'holders',
			'@employee'  => 'team',
			'@prospect'  => 'investors',
			'@admin'     => 'admin',
		);
		$seen_role_docs = array();
		foreach ( aap_import_csv( $src( 'documents.csv' ) ) as $d ) {
			$who   = trim( $d['investor'] );
			$cat   = strtolower( $d['category'] );
			$bytes = $src( $d['file'] );
			if ( false === $bytes ) {
				$miss[] = $d['title'];
				continue;
			}
			if ( isset( $role_to_group[ strtolower( $who ) ] ) ) {
				// Shared with a whole role: one library document for that audience (admins already see every group).
				$key = $d['title'] . '|' . hash( 'sha256', $bytes );
				if ( '@admin' === strtolower( $who ) && isset( $seen_role_docs[ $key ] ) ) {
					continue;
				}
				$seen_role_docs[ $key ] = 1;
				$fields = array(
					'grp'       => $role_to_group[ strtolower( $who ) ],
					'category'  => 'updates' === $cat ? 'Unit holder reports' : ( isset( $pcats[ $cat ] ) ? $pcats[ $cat ] : 'Documents' ),
					'counter'   => 'lib',
				);
			} else {
				$uid = isset( $by_id[ strtoupper( $who ) ] ) ? $by_id[ strtoupper( $who ) ] : 0;
				if ( ! $uid ) {
					continue; // Person not in this import (e.g. a test account, or no email): never guess by ID.
				}
				$fields = array(
					'grp'      => 'personal',
					'user_id'  => $uid,
					'category' => isset( $pcats[ $cat ] ) ? $cat : 'other',
					'counter'  => 'personal',
				);
			}
			$id = aap_import_doc(
				$bytes,
				array_merge(
					array(
						'user_id'     => 0,
						'title'       => $d['title'],
						'description' => '',
						'doc_date'    => $d['date'],
						'file_name'   => basename( $d['file'] ),
					),
					$fields
				)
			);
			if ( 'dup' === $id ) {
				++$skip;
			} elseif ( is_wp_error( $id ) ) {
				$miss[] = $d['title'] . ': ' . $id->get_error_message();
			} elseif ( 'lib' === $fields['counter'] ) {
				++$lib;
			} else {
				++$n;
			}
		}
		$r[] = "Personal documents: added $n, plus $lib shared with a whole role as library documents; skipped $skip already imported" . ( $miss ? '; problems: ' . implode( ', ', $miss ) : '' ) . '.';

		$t = 0;
		foreach ( aap_import_csv( $src( 'transactions.csv' ) ) as $x ) {
			$pid = strtoupper( trim( $x['id'] ) );
			$uid = isset( $by_id[ $pid ] ) ? $by_id[ $pid ] : 0;
			if ( ! $uid ) {
				continue;
			}
			$exists = $wpdb->get_var( $wpdb->prepare( 'SELECT id FROM ' . aap_table( 'txns' ) . ' WHERE user_id = %d AND tx_date = %s AND type = %s AND amount = %f', $uid, $x['date'], $x['type'], (float) $x['amount'] ) );
			if ( $exists ) {
				continue;
			}
			$wpdb->insert(
				aap_table( 'txns' ),
				array(
					'user_id'    => $uid,
					'tx_date'    => aap_clean_date( $x['date'] ),
					'type'       => sanitize_text_field( $x['type'] ),
					'units'      => (float) $x['units'],
					'amount'     => (float) $x['amount'],
					'note'       => sanitize_textarea_field( $x['note'] ),
					'created_by' => get_current_user_id(),
					'created_at' => current_time( 'mysql', true ),
				)
			);
			++$t;
		}
		$r[] = "Transactions: added $t.";
	}
	return $r;
}
