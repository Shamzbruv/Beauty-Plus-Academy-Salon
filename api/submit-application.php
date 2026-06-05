<?php
declare(strict_types=1);

header('Content-Type: application/json');

function jsonResponse(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function resendRequest(array $payload, string $idempotencyKey): array
{
    // The API key should ideally be stored in an environment variable or secure config file
    $apiKey = 're_J8gX3FL2_Ngqtn6jRv3MUFoPpa8tmQioi';
    
    if (empty($apiKey)) {
        throw new RuntimeException('RESEND_API_KEY is missing or invalid.');
    }

    $url = 'https://api.resend.com/emails';
    $requestBody = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);

    $attempt = 0;
    $delayMs = 500;

    while (++$attempt <= 3) {
        $responseHeaders = [];

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_POSTFIELDS => $requestBody,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $apiKey,
                'Content-Type: application/json',
                'User-Agent: beautyplus-admissions/1.0',
                'Idempotency-Key: ' . $idempotencyKey,
            ],
            CURLOPT_HEADERFUNCTION => static function ($ch, string $header) use (&$responseHeaders): int {
                $length = strlen($header);
                $parts = explode(':', $header, 2);
                if (count($parts) === 2) {
                    $responseHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
                }
                return $length;
            },
        ]);

        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            if ($attempt === 3) {
                throw new RuntimeException('Transport failure: ' . $curlError);
            }
            usleep($delayMs * 1000);
            $delayMs *= 2;
            continue;
        }

        $body = json_decode($raw, true);
        if ($status >= 200 && $status < 300) {
            return is_array($body) ? $body : ['ok' => true];
        }

        $errorName = $body['name'] ?? null;
        $retryAfter = isset($responseHeaders['retry-after']) ? (int) $responseHeaders['retry-after'] : null;

        $retryable =
            $status >= 500 ||
            $errorName === 'rate_limit_exceeded';

        if (!$retryable || $attempt === 3) {
            throw new RuntimeException(sprintf(
                'Resend failed: HTTP %d %s (Details: %s)',
                $status,
                $errorName ?? 'unknown_error',
                $body['message'] ?? 'No message'
            ));
        }

        $sleepMs = $retryAfter ? $retryAfter * 1000 : $delayMs;
        usleep($sleepMs * 1000);
        $delayMs *= 2;
    }

    throw new RuntimeException('Unexpected retry loop exit');
}

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        jsonResponse(405, ['ok' => false, 'error' => 'Method not allowed']);
    }

    $submissionId = preg_replace('/[^a-zA-Z0-9_-]/', '', $_POST['submission_id'] ?? '') ?: bin2hex(random_bytes(8));
    $clientEmail  = filter_var($_POST['client_email'] ?? $_POST['email'] ?? '', FILTER_VALIDATE_EMAIL);
    $applicantName = htmlspecialchars($_POST['applicant_name'] ?? $_POST['name'] ?? 'Applicant');
    
    $isTuition = filter_var($_POST['is_tuition'] ?? false, FILTER_VALIDATE_BOOLEAN);
    $isBooking = filter_var($_POST['is_booking'] ?? false, FILTER_VALIDATE_BOOLEAN);
    $hasPdf = !empty($_FILES['pdf_document']['tmp_name']);

    if (!$isTuition && !$isBooking && !$hasPdf) {
        throw new RuntimeException('PDF document was not uploaded.');
    }

    if ($isBooking) {
        $emailBodyText = "Service: " . htmlspecialchars($_POST['service'] ?? '') . "\n";
        $emailBodyText .= "Date: " . htmlspecialchars($_POST['date'] ?? '') . "\n";
        $emailBodyText .= "Time: " . htmlspecialchars($_POST['time'] ?? '') . "\n";
        $emailBodyText .= "Deposit Paid: JMD $" . htmlspecialchars($_POST['depositPaid'] ?? '0') . "\n";
        $emailBodyText .= "Transaction ID: " . htmlspecialchars($_POST['transactionId'] ?? '') . "\n";
        $emailBodyText .= "Phone: " . htmlspecialchars($_POST['phone'] ?? '') . "\n";
        $emailBodyText .= "Notes: " . htmlspecialchars($_POST['notes'] ?? '') . "\n";
    } else {
        $emailBodyText = htmlspecialchars($_POST['message'] ?? 'Please find the completed registration application attached as a PDF.');
    }

    $attachments = [];
    if ($hasPdf) {
        if (($_FILES['pdf_document']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new RuntimeException('PDF document upload failed.');
        }

        $tmpName = $_FILES['pdf_document']['tmp_name'];
        if (!is_uploaded_file($tmpName)) {
            throw new RuntimeException('Upload provenance check failed.');
        }

        $pdfContent = file_get_contents($tmpName);
        if ($pdfContent === false) {
            throw new RuntimeException('Failed to read uploaded PDF.');
        }
        
        $base64Pdf = base64_encode($pdfContent);
        $attachments[] = [
            'filename' => "application-{$submissionId}.pdf",
            'content'  => $base64Pdf,
        ];
    }

    if ($isBooking) {
        $subject = "Salon Appointment Booking - {$applicantName}";
        $htmlContent = "<p>{$applicantName} has paid a deposit for a new salon appointment.</p><p><strong>Booking Details:</strong><br/>" . nl2br($emailBodyText) . "</p>";
    } else {
        $subject = $isTuition ? "Tuition Payment Received - {$applicantName}" : "New Application (Paid) - {$applicantName}";
        $htmlContent = $isTuition 
            ? "<p>{$applicantName} has submitted a new tuition payment.</p><p><strong>Details:</strong><br/>" . nl2br($emailBodyText) . "</p>"
            : "<p>{$applicantName} has submitted a new application.</p><p><strong>Message:</strong><br/>" . nl2br($emailBodyText) . "</p><p>The completed application and payment details are attached as a PDF.</p>";
    }

    $payload = [
        // Note: You may want to change this to your actual verified domain in Resend later
        'from' => 'Beauty Plus Academy <admissions@beautyplusacademyandsalon.com>',
        'to' => ['forresterpetagay30@gmail.com', $clientEmail], // Send to both admin and applicant
        'reply_to' => [$clientEmail], // Applicant's email so you can reply to them
        'subject' => $subject,
        'html' => $htmlContent,
    ];

    if (!empty($attachments)) {
        $payload['attachments'] = $attachments;
    }

    // Send the email via Resend
    resendRequest($payload, "application/{$submissionId}");

    jsonResponse(200, [
        'ok' => true,
        'submission_id' => $submissionId,
        'message' => 'Application submitted and email sent successfully via Resend.'
    ]);
} catch (Throwable $e) {
    jsonResponse(422, ['ok' => false, 'error' => $e->getMessage()]);
}
