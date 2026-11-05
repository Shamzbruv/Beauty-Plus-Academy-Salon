<?php
declare(strict_types=1);
// Keep the PHP hosting entrypoint and explicitly route the owner studio.
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-cache, max-age=0, must-revalidate');
if ($path === '/admin' || $path === '/admin/') {
    require __DIR__ . '/admin/index.html';
    return;
}
require __DIR__ . '/index.html';
