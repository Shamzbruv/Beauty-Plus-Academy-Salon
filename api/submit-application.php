<?php
// Replaced by authenticated owner records and database-validated public requests.
// This legacy endpoint must not accept unauthenticated assertions that a payment succeeded.
declare(strict_types=1);
header('Content-Type: application/json');
http_response_code(410);
echo json_encode(['ok' => false, 'error' => 'Please refresh the website and use the current request form.']);
