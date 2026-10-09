<?php
declare(strict_types=1);
// AEROVENTA direct Beget mail transport; no n8n, Directus or external API.
// Configure both addresses ONLY after the Beget domain mailbox exists and is verified.
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
function answer(int $code, string $error = ''): never {
    http_response_code($code);
    echo json_encode($error === '' ? ['ok' => true] : ['ok' => false, 'error' => $error], JSON_UNESCAPED_UNICODE);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    answer(405, 'method_not_allowed');
}
if (!preg_match('~^application/json(?:\s*;|$)~i', (string)($_SERVER['CONTENT_TYPE'] ?? ''))) answer(415, 'json_required');
$origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
$referer = trim((string)($_SERVER['HTTP_REFERER'] ?? ''));
if ($origin === '' && $referer === '') answer(403, 'origin_required');
foreach ([$origin, $referer] as $url) {
    if ($url === '') continue;
    $parsed = parse_url($url);
    if ($parsed === false || !in_array(strtolower((string)($parsed['host'] ?? '')), ['aeroventa.ru', 'www.aeroventa.ru'], true)
        || strtolower((string)($parsed['scheme'] ?? '')) !== 'https'
        || (isset($parsed['port']) && $parsed['port'] !== 443)) answer(403, 'origin_rejected');
}
if (isset($_SERVER['HTTP_SEC_FETCH_SITE']) && !in_array($_SERVER['HTTP_SEC_FETCH_SITE'], ['same-origin', 'none'], true)) answer(403, 'cross_site_rejected');
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 12000) answer(413, 'request_too_large');
$raw = file_get_contents('php://input');
if (!is_string($raw) || strlen($raw) > 12000) answer(413, 'request_too_large');
try { $data = json_decode($raw, true, 16, JSON_THROW_ON_ERROR); }
catch (JsonException $e) { answer(400, 'invalid_json'); }
if (!is_array($data) || array_is_list($data)) answer(400, 'invalid_json');
function field(array $data, string $key, int $max, bool $required = false, bool $multiline = false): string {
    $v = $data[$key] ?? '';
    if (!is_string($v)) answer(422, 'invalid_field');
    $v = trim(str_replace("\0", '', $v));
    if (!$multiline) $v = str_replace(["\r", "\n"], ' ', $v);
    if ($required && $v === '') answer(422, 'required_field');
    $n = function_exists('mb_strlen') ? mb_strlen($v, 'UTF-8') : strlen($v);
    if ($n > $max) answer(422, 'field_too_long');
    return $v;
}
$name = field($data, 'name', 80, true);
$contact = field($data, 'contact', 160, true);
$task = field($data, 'task', 4000, true, true);
$company = field($data, 'company', 160);
$source = field($data, 'source_page', 300);
$service = field($data, 'object_service', 120);
$project = field($data, 'project_status', 30);
$case = field($data, 'case_context', 300);
$context = field($data, 'consultant_summary', 800, false, true);
$campaign = field($data, 'campaign_context', 400);
$intent = field($data, 'lead_intent', 120);
$honeypot = field($data, 'website', 200);
// A bot trap returns success without sending any message.
if ($honeypot !== '') answer(200);
$email = filter_var($contact, FILTER_VALIDATE_EMAIL);
if ($email === false) {
    if (!preg_match('/^\+?[0-9 ()\t.\-]+$/D', $contact)) answer(422, 'contact_invalid');
    $digits = preg_replace('/\D/', '', $contact);
    if ($digits === null || strlen($digits) < 10 || strlen($digits) > 15) answer(422, 'contact_invalid');
}
if (($data['consent'] ?? null) !== true) answer(422, 'consent_required');
$started = $data['started_at'] ?? null;
if (!is_int($started) && !is_float($started)) answer(422, 'invalid_start');
$now = (int)floor(microtime(true) * 1000);
$elapsed = $now - (int)$started;
if ($elapsed < 900) answer(422, 'submission_too_fast');
if ($elapsed > 86400000) answer(422, 'submission_expired');
$destination = trim((string)getenv('AEROVENTA_LEAD_TO'));
$sender = trim((string)getenv('AEROVENTA_LEAD_FROM'));
$validDomain = static function (string $addr): bool {
    if (filter_var($addr, FILTER_VALIDATE_EMAIL) === false) return false;
    return strtolower((string)substr(strrchr($addr, '@'), 1)) === 'aeroventa.ru';
};
if (!$validDomain($destination) || !$validDomain($sender)) answer(503, 'mailbox_unconfigured');
// Fail closed when rate limiting is unavailable. Atomic per-IP rolling 10m window.
$ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
$rateKey = substr(hash('sha256', __FILE__ . '|' . $ip), 0, 40);
$rateFile = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'aeroventa-lead-' . $rateKey . '.json';
$handle = @fopen($rateFile, 'c+');
if ($handle === false || !flock($handle, LOCK_EX)) answer(503, 'temporarily_unavailable');
$decoded = json_decode(stream_get_contents($handle) ?: '[]', true);
$events = is_array($decoded) ? array_values(array_filter($decoded, static fn($v) => is_array($v) && is_int($v['t'] ?? null) && $v['t'] >= time()-600)) : [];
if (count($events) >= 6) {
    flock($handle, LOCK_UN); fclose($handle); answer(429, 'rate_limited');
}
$fingerprint = hash('sha256', $contact . "\n" . $task . "\n" . $source);
foreach ($events as $event) {
    if (hash_equals((string)($event['h'] ?? ''), $fingerprint) && (time() - $event['t']) < 90) {
        flock($handle, LOCK_UN); fclose($handle); answer(409, 'duplicate_submission');
    }
}
$events[] = ['t' => time(), 'h' => $fingerprint];
rewind($handle); ftruncate($handle, 0);
$written = fwrite($handle, json_encode($events));
$flushed = fflush($handle);
flock($handle, LOCK_UN); fclose($handle);
if ($written === false || !$flushed) answer(503, 'temporarily_unavailable');
$body = implode("\n", [
    'Заявка с сайта AEROVENTA', '',
    'Имя: '.$name,
    'Контакт: '.$contact,
    'Компания: '.($company ?: '—'), '',
    'Задача:', $task, '',
    'Страница: '.$source,
    'Тип объекта / услуга: '.$service,
    'Статус проекта: '.$project,
    'Контекст кейса: '.$case,
    'Намерение: '.$intent,
    'Контекст консультанта:', $context,
    'Источник кампании: '.$campaign, '',
    'Согласие: подтверждено посетителем',
]);
$headers = [
    'From: AEROVENTA Website <'.$sender.'>',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'X-AEROVENTA-Source: web-form',
];
if ($email !== false) $headers[] = 'Reply-To: '.$email;
$subject = '=?UTF-8?B?'.base64_encode('Новая заявка AEROVENTA').'?=';
if (!@mail($destination, $subject, $body, implode("\r\n", $headers))) answer(503, 'delivery_unavailable');
// mail() reports local MTA acceptance, not recipient inbox delivery.
answer(200);
