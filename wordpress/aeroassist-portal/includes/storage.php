<?php
/**
 * Private document storage.
 *
 * Files are kept outside the public web folder when possible (AAP_STORAGE_DIR, or a folder next
 * to the WordPress folder), are encrypted at rest with libsodium (XSalsa20-Poly1305) and are given
 * random names. They are only ever sent by aap_serve_file() after a sign-in and role check.
 */

defined( 'ABSPATH' ) || exit;

/** The storage folder (no trailing slash). */
function aap_storage_dir() {
	if ( defined( 'AAP_STORAGE_DIR' ) && AAP_STORAGE_DIR ) {
		return untrailingslashit( AAP_STORAGE_DIR );
	}
	$saved = get_option( 'aap_storage_dir' );
	if ( $saved ) {
		return untrailingslashit( $saved );
	}
	return '';
}

/** Choose and create a storage folder on activation. */
function aap_init_storage() {
	if ( aap_storage_dir() && is_dir( aap_storage_dir() ) ) {
		aap_protect_dir( aap_storage_dir() );
		return aap_storage_dir();
	}
	$candidates = array(
		dirname( untrailingslashit( ABSPATH ) ) . '/aeroassist-private',  // next to public_html: not reachable from the web.
		WP_CONTENT_DIR . '/aeroassist-private-' . wp_generate_password( 12, false, false ), // fallback inside wp-content.
	);
	foreach ( $candidates as $dir ) {
		if ( is_dir( $dir ) || @wp_mkdir_p( $dir ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors
			if ( wp_is_writable( $dir ) ) {
				aap_protect_dir( $dir );
				if ( ! defined( 'AAP_STORAGE_DIR' ) ) {
					update_option( 'aap_storage_dir', $dir, false );
				}
				return $dir;
			}
		}
	}
	return '';
}

/** Deny web access in case the folder is ever inside the web root (Apache, LiteSpeed, IIS). */
function aap_protect_dir( $dir ) {
	$files = array(
		'.htaccess'  => "# AeroAssist Portal private storage\n<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\nOptions -Indexes\n",
		'index.php'  => "<?php\n// Silence.\nhttp_response_code( 403 );\n",
		'web.config' => "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<configuration><system.webServer><authorization><deny users=\"*\" /></authorization></system.webServer></configuration>\n",
	);
	foreach ( $files as $name => $body ) {
		if ( ! file_exists( "$dir/$name" ) ) {
			@file_put_contents( "$dir/$name", $body ); // phpcs:ignore
		}
	}
}

/** Whether the storage folder sits inside the public WordPress folder. */
function aap_storage_in_webroot() {
	$dir  = wp_normalize_path( aap_storage_dir() );
	$root = wp_normalize_path( untrailingslashit( ABSPATH ) );
	return $dir && 0 === strpos( $dir . '/', $root . '/' );
}

/* ------------------------------------------------------------------ encryption key */

/** The 32-byte file key: AAP_FILE_KEY in wp-config.php (base64), or one kept in the database. */
function aap_file_key() {
	if ( defined( 'AAP_FILE_KEY' ) && AAP_FILE_KEY ) {
		$k = base64_decode( AAP_FILE_KEY, true );
		if ( $k && SODIUM_CRYPTO_SECRETBOX_KEYBYTES === strlen( $k ) ) {
			return $k;
		}
	}
	$saved = get_option( 'aap_file_key' );
	if ( $saved ) {
		$k = base64_decode( $saved, true );
		if ( $k && SODIUM_CRYPTO_SECRETBOX_KEYBYTES === strlen( $k ) ) {
			return $k;
		}
	}
	$k = random_bytes( SODIUM_CRYPTO_SECRETBOX_KEYBYTES );
	add_option( 'aap_file_key', base64_encode( $k ), '', false );
	return base64_decode( get_option( 'aap_file_key' ) );
}

function aap_key_in_config() {
	return defined( 'AAP_FILE_KEY' ) && AAP_FILE_KEY && base64_decode( AAP_FILE_KEY, true );
}

function aap_encrypt( $plain ) {
	$nonce = random_bytes( SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
	return 'AAP1' . $nonce . sodium_crypto_secretbox( $plain, $nonce, aap_file_key() );
}

function aap_decrypt( $blob ) {
	if ( 'AAP1' !== substr( $blob, 0, 4 ) ) {
		return false;
	}
	$nonce = substr( $blob, 4, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
	$ct    = substr( $blob, 4 + SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
	return sodium_crypto_secretbox_open( $ct, $nonce, aap_file_key() );
}

/* ------------------------------------------------------------------ files */

/**
 * Check a file name against its contents (bytes in memory). Returns [ext, mime] or WP_Error.
 */
function aap_check_bytes( $name, $data ) {
	$ext   = strtolower( pathinfo( $name, PATHINFO_EXTENSION ) );
	$types = aap_allowed_types();
	if ( ! isset( $types[ $ext ] ) ) {
		return new WP_Error( 'aap_type', 'That file type is not allowed. Use PDF, Word, Excel, PowerPoint, CSV, text or an image.' );
	}
	if ( in_array( $ext, array( 'csv', 'txt' ), true ) ) {
		// Plain text: refuse anything that looks like markup or a script.
		return preg_match( '/<\?php|<script|<html|\x00/i', substr( $data, 0, 65536 ) ) ? new WP_Error( 'aap_type', 'The file contents do not match its name.' ) : array( $ext, $types[ $ext ] );
	}
	$real = '';
	if ( function_exists( 'finfo_open' ) ) {
		$fi   = finfo_open( FILEINFO_MIME_TYPE );
		$real = (string) finfo_buffer( $fi, $data );
	}
	$magic = array(
		'pdf'  => '%PDF',
		'png'  => "\x89PNG",
		'jpg'  => "\xFF\xD8\xFF",
		'jpeg' => "\xFF\xD8\xFF",
		'xlsx' => "PK\x03\x04",
		'docx' => "PK\x03\x04",
		'pptx' => "PK\x03\x04",
		'xls'  => "\xD0\xCF\x11\xE0",
		'doc'  => "\xD0\xCF\x11\xE0",
	);
	$head_ok = 0 === strncmp( $data, $magic[ $ext ], strlen( $magic[ $ext ] ) );
	$mime_ok = '' === $real || $real === $types[ $ext ]
		|| ( in_array( $ext, array( 'xlsx', 'docx', 'pptx' ), true ) && in_array( $real, array( 'application/zip', 'application/octet-stream' ), true ) )
		|| ( in_array( $ext, array( 'xls', 'doc' ), true ) && in_array( $real, array( 'application/CDFV2', 'application/x-ole-storage', 'application/octet-stream', 'application/vnd.ms-office', 'application/vnd.ms-excel', 'application/msword' ), true ) );
	if ( ! $head_ok || ! $mime_ok ) {
		return new WP_Error( 'aap_type', 'The file contents do not match its name.' );
	}
	return array( $ext, $types[ $ext ] );
}

/**
 * Encrypt bytes and store them under a random name. Nothing is written in the clear.
 * Returns [stored name, size, sha256] or WP_Error.
 */
function aap_store_bytes( $data ) {
	$dir = aap_storage_dir();
	if ( ! $dir || ! is_dir( $dir ) ) {
		$dir = aap_init_storage();
	}
	if ( ! $dir ) {
		return new WP_Error( 'aap_storage', 'The private storage folder is missing or not writable. See AeroAssist Portal → Settings.' );
	}
	$stored = bin2hex( random_bytes( 16 ) ) . '.bin';
	if ( false === file_put_contents( "$dir/$stored", aap_encrypt( $data ), LOCK_EX ) ) { // phpcs:ignore
		return new WP_Error( 'aap_write', 'Could not write to the private storage folder.' );
	}
	return array( $stored, strlen( $data ), hash( 'sha256', $data ) );
}

function aap_read_file( $stored ) {
	if ( ! preg_match( '/^[a-f0-9]{32}\.bin$/', $stored ) ) {
		return false;
	}
	$path = aap_storage_dir() . '/' . $stored;
	if ( ! is_file( $path ) ) {
		return false;
	}
	return aap_decrypt( file_get_contents( $path ) ); // phpcs:ignore
}

function aap_delete_file( $stored ) {
	if ( preg_match( '/^[a-f0-9]{32}\.bin$/', $stored ) ) {
		$path = aap_storage_dir() . '/' . $stored;
		if ( is_file( $path ) ) {
			wp_delete_file( $path );
		}
	}
}

/**
 * Add a document from bytes in memory. $fields: grp, user_id, category, title, description, doc_date, file_name.
 * Returns the new document ID or WP_Error.
 */
function aap_add_document( array $fields, $data ) {
	global $wpdb;
	$name  = sanitize_file_name( $fields['file_name'] );
	$check = aap_check_bytes( $name, $data );
	if ( is_wp_error( $check ) ) {
		return $check;
	}
	$stored = aap_store_bytes( $data );
	if ( is_wp_error( $stored ) ) {
		return $stored;
	}
	$now = current_time( 'mysql', true );
	$ok  = $wpdb->insert(
		aap_table( 'docs' ),
		array(
			'grp'         => $fields['grp'],
			'user_id'     => 'personal' === $fields['grp'] ? (int) $fields['user_id'] : 0,
			'category'    => substr( sanitize_text_field( $fields['category'] ), 0, 60 ),
			'title'       => substr( sanitize_text_field( $fields['title'] ), 0, 255 ),
			'description' => sanitize_textarea_field( isset( $fields['description'] ) ? $fields['description'] : '' ),
			'doc_date'    => aap_clean_date( isset( $fields['doc_date'] ) ? $fields['doc_date'] : '' ),
			'file_name'   => $name,
			'stored_name' => $stored[0],
			'mime'        => $check[1],
			'size'        => $stored[1],
			'sha256'      => $stored[2],
			'uploaded_by' => get_current_user_id(),
			'created_at'  => $now,
			'updated_at'  => $now,
		)
	);
	if ( ! $ok ) {
		aap_delete_file( $stored[0] );
		return new WP_Error( 'aap_db', 'Could not save the document record.' );
	}
	return (int) $wpdb->insert_id;
}

/** Build a zip (stored, uncompressed) entirely in memory: [ name => bytes ]. */
function aap_zip_in_memory( array $files ) {
	$out     = '';
	$central = '';
	$time    = ( ( (int) gmdate( 'H' ) ) << 11 ) | ( ( (int) gmdate( 'i' ) ) << 5 ) | ( (int) ( gmdate( 's' ) / 2 ) );
	$date    = ( ( (int) gmdate( 'Y' ) - 1980 ) << 9 ) | ( ( (int) gmdate( 'n' ) ) << 5 ) | (int) gmdate( 'j' );
	foreach ( $files as $name => $data ) {
		$crc   = crc32( $data );
		$len   = strlen( $data );
		$nlen  = strlen( $name );
		$off   = strlen( $out );
		$out  .= pack( 'VvvvvvVVVvv', 0x04034b50, 20, 0x0800, 0, $time, $date, $crc, $len, $len, $nlen, 0 ) . $name . $data;
		$central .= pack( 'VvvvvvvVVVvvvvvVV', 0x02014b50, 20, 20, 0x0800, 0, $time, $date, $crc, $len, $len, $nlen, 0, 0, 0, 0, 0, $off ) . $name;
	}
	return $out . $central . pack( 'VvvvvVVv', 0x06054b50, 0, 0, count( $files ), count( $files ), strlen( $central ), strlen( $out ), 0 );
}

function aap_clean_date( $d ) {
	$d = trim( (string) $d );
	return preg_match( '/^\d{4}-\d{2}-\d{2}$/', $d ) ? $d : null;
}
