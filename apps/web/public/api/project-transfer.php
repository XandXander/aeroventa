<?php
/** AEROVENTA 75 MiB private, resumable project handoff. PHP >= 8.1. */
declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '0');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header('Cache-Control: private, no-store, max-age=0');
const AV_MAX_BYTES = 78643200; // 75 MiB per complete project
const AV_MAX_FILES = 20;
const AV_MAX_CHUNK = 2097152; // 2 MiB per raw request, below existing 12 MiB post_max_size
const AV_PENDING_TTL = 86400;
const AV_COMPLETE_TTL = 1209600; // 14 days
const AV_MAX_STORAGE = 2147483648; // 2 GiB shared capacity budget
const AV_MIN_FREE_DISK = 536870912; // preserve 512 MiB account free space

function av_reply(int $code, string $error = '', array $extra = []): never {
    header('Content-Type: application/json; charset=UTF-8');
    http_response_code($code);
    echo json_encode(['ok' => $error === '', ...($error === '' ? [] : ['error' => $error]), ...$extra], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function av_root(): string {
    // Keep uploads outside public_html while using the writable site directory.
    // Beget denies PHP writes to /home/x/xanders despite allowing /home/x/xanders/aeroventa.ru.
    $siteDir = dirname(__DIR__, 2); // /home/x/xanders/aeroventa.ru
    $path = getenv('AEROVENTA_PROJECT_PRIVATE_ROOT') ?: $siteDir.'/.aeroventa-project-uploads';
    $webroot = realpath(dirname(__DIR__));
    if (!is_dir($path)) {
        $old = umask(0077);
        $created = @mkdir($path, 0700, true);
        umask($old);
        if (!$created && !is_dir($path)) av_reply(503, 'private_storage_unavailable');
    }
    $real = realpath($path);
    if (!$real || is_link($path) || ($webroot && ($real === $webroot || str_starts_with($real, $webroot.'/')))) av_reply(503, 'unsafe_storage_path');
    if (!is_writable($real)) av_reply(503, 'private_storage_unavailable');
    return $real;
}
function av_security(bool $write = true): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { header('Allow: POST'); av_reply(405, 'method_not_allowed'); }
    if (!$write) return;
    $origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    $referer = (string)($_SERVER['HTTP_REFERER'] ?? '');
    if ($origin === '' && $referer === '') av_reply(403, 'origin_required');
    foreach ([$origin, $referer] as $u) {
        if ($u === '') continue;
        $p = parse_url($u);
        if ($p === false || strtolower((string)($p['scheme'] ?? '')) !== 'https' ||
            !in_array(strtolower((string)($p['host'] ?? '')), ['aeroventa.ru','www.aeroventa.ru'], true) ||
            (isset($p['port']) && (int)$p['port'] !== 443)) av_reply(403, 'origin_rejected');
    }
    if (isset($_SERVER['HTTP_SEC_FETCH_SITE']) && !in_array($_SERVER['HTTP_SEC_FETCH_SITE'], ['same-origin', 'none'], true)) av_reply(403, 'cross_site_rejected');
}
function av_text(mixed $s, int $max, bool $required = true): string {
    if (!is_string($s)) av_reply(422, 'invalid_field');
    $s = trim(str_replace(["\r", "\n", "\0"], ' ', $s));
    if (($required && $s === '') || (function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen($s)) > $max) av_reply(422, 'invalid_field');
    return $s;
}
function av_session(string $id, string $token, string $root): array {
    if (!preg_match('/^[a-f0-9]{32}$/D', $id) || !preg_match('/^[a-f0-9]{64}$/D', $token)) av_reply(403, 'invalid_session');
    $dir = $root.'/'.$id;
    if (!is_dir($dir) || is_link($dir)) av_reply(404, 'upload_not_found');
    $fh = @fopen($dir.'/state.json', 'c+b');
    if (!$fh || !flock($fh, LOCK_EX)) av_reply(503, 'session_lock_failed');
    rewind($fh);
    $raw = stream_get_contents($fh);
    $st = json_decode((string)$raw, true);
    if (!is_array($st) || !hash_equals((string)($st['token_hash'] ?? ''), hash('sha256', $token))) {
        flock($fh, LOCK_UN); fclose($fh); av_reply(403, 'upload_access_denied');
    }
    if (time() >= (int)($st['expires'] ?? 0)) { flock($fh, LOCK_UN); fclose($fh); av_reply(410, 'upload_expired'); }
    return [$dir, $st, $fh];
}
function av_save($fh, array $st): void {
    $bytes = json_encode($st, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    rewind($fh);
    if (!ftruncate($fh, 0) || fwrite($fh, $bytes) !== strlen($bytes) || !fflush($fh)) av_reply(503, 'state_write_failed');
}
function av_unlock($fh): void { flock($fh, LOCK_UN); fclose($fh); }
function av_delete_dir(string $dir): void {
    if (is_link($dir) || !is_dir($dir)) return;
    foreach (scandir($dir) ?: [] as $name) {
        if ($name === '.' || $name === '..') continue;
        $path = $dir.'/'.$name;
        // This storage never contains nested folders or user-controlled paths.
        if (is_file($path) && !is_link($path)) @unlink($path);
    }
    @rmdir($dir);
}
function av_gc(string $root): array {
    $removed = 0; $allocated = 0; $pendingForIp = [];
    foreach (scandir($root) ?: [] as $id) {
        if (!preg_match('/^[a-f0-9]{32}$/D', $id)) continue;
        $dir = $root.'/'.$id;
        if (!is_dir($dir) || is_link($dir)) continue;
        $fh = @fopen($dir.'/state.json', 'c+b');
        if (!$fh || !flock($fh, LOCK_EX | LOCK_NB)) { if ($fh) fclose($fh); continue; }
        $st = json_decode((string)stream_get_contents($fh), true);
        $exp = (int)($st['expires'] ?? 0);
        if ($exp <= time()) { av_unlock($fh); av_delete_dir($dir); $removed++; continue; }
        $allocated += (int)($st['total'] ?? 0);
        if (($st['phase'] ?? '') === 'pending') {
            $key = (string)($st['ip_hash'] ?? '');
            $pendingForIp[$key] = ($pendingForIp[$key] ?? 0) + 1;
        }
        av_unlock($fh);
    }
    return ['removed' => $removed, 'reserved' => $allocated, 'pending_by_ip' => $pendingForIp];
}
function av_validate_file(string $path, string $ext): bool {
    $first = @file_get_contents($path, false, null, 0, 256);
    if (!is_string($first) || $first === '') return false;
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($path);
    return match ($ext) {
        'pdf' => str_starts_with($first, '%PDF-'),
        'png' => str_starts_with($first, "\x89PNG\r\n\x1a\n"),
        'jpg','jpeg' => str_starts_with($first, "\xff\xd8\xff"),
        'webp' => str_starts_with($first, 'RIFF') && substr($first,8,4) === 'WEBP',
        'gif' => str_starts_with($first, 'GIF87a') || str_starts_with($first, 'GIF89a'),
        'bmp' => str_starts_with($first, 'BM'),
        'tif','tiff' => str_starts_with($first, "II\x2a\x00") || str_starts_with($first, "MM\x00\x2a"),
        'dwg' => preg_match('/^AC10[0-9]{2}/', $first) === 1,
        'dxf' => preg_match('/^\s*0\r?\nSECTION/i', $first) === 1 || str_starts_with($first, "AutoCAD Binary DXF\r\n\x1a\0"),
        'ifc' => str_contains(strtoupper($first), 'ISO-10303-21'),
        'zip','docx','xlsx' => str_starts_with($first, "PK\x03\x04") && class_exists('ZipArchive') && av_zip_check($path),
        '7z' => str_starts_with($first, "7z\xbc\xaf\x27\x1c"),
        'rar' => str_starts_with($first, "Rar!\x1a\x07"),
        'xls','doc','rvt' => str_starts_with($first, "\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1") || ($ext==='rvt' && str_starts_with($first,'PK')),
        default => false
    };
}
function av_zip_check(string $path): bool {
    $z = new ZipArchive();
    if ($z->open($path) !== true) return false;
    $valid = $z->numFiles <= 2500; $expanded = 0;
    for ($i=0; $valid && $i<$z->numFiles; $i++) {
        $entry = $z->statIndex($i);
        if (!is_array($entry)) { $valid = false; break; }
        $name = (string)($entry['name'] ?? '');
        $expanded += (int)($entry['size'] ?? 0);
        if ($expanded > 2147483648 || str_contains($name, '\\') || str_starts_with($name, '/') ||
            preg_match('~(^|/)\.\.(?:/|$)~', $name) || (($entry['encryption_method'] ?? 0) !== 0)) $valid = false;
    }
    $z->close(); return $valid;
}

$action = (string)($_GET['action'] ?? '');
if ($action === 'health') {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') av_reply(405, 'method_not_allowed');
    $root = av_root();
    if (disk_free_space($root) < AV_MIN_FREE_DISK) av_reply(507, 'insufficient_storage');
    if (!class_exists(finfo::class)) av_reply(503, 'file_validation_unavailable');
    $to=trim((string)getenv('AEROVENTA_LEAD_TO'));
    $from=trim((string)getenv('AEROVENTA_LEAD_FROM'));
    if (strcasecmp($to,'office@aeroventa.ru')!==0 || !filter_var($from,FILTER_VALIDATE_EMAIL) ||
       strtolower(substr(strrchr($from,'@')?:'',1))!=='aeroventa.ru') av_reply(503, 'mailbox_unconfigured');
    av_reply(200, '', ['service'=>'aeroventa-private-project-upload','max_mib'=>75,'chunk_mib'=>2,
        'zip_enabled'=>class_exists(ZipArchive::class),'private_storage'=>true]);
}
if ($action === 'download') {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') av_reply(405, 'method_not_allowed');
    $token = (string)($_GET['t'] ?? '');
    if (!preg_match('/^[a-f0-9]{64}$/D', $token)) av_reply(403, 'invalid_download_token');
    $root = av_root();
    // Do not allow token to function as session id; find matching completed secret hash.
    $dir = null; $st = null; $fh = null;
    foreach (scandir($root) ?: [] as $id) {
        if (!preg_match('/^[a-f0-9]{32}$/D', $id) || !is_dir($root.'/'.$id)) continue;
        $statePath = $root.'/'.$id.'/state.json';
        $raw = @file_get_contents($statePath);
        $candidate = json_decode((string)$raw, true);
        if (!is_array($candidate) || ($candidate['phase'] ?? '') !== 'complete' || time() >= (int)($candidate['expires'] ?? 0)) continue;
        if (hash_equals((string)($candidate['share_hash'] ?? ''), hash('sha256', $token))) { $dir=$root.'/'.$id; $st=$candidate; break; }
    }
    if ($dir === null) av_reply(404, 'download_not_found');
    header('Content-Security-Policy: default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'; frame-ancestors \'none\'');
    if (!isset($_GET['file'])) {
        header('Content-Type: text/html; charset=UTF-8');
        $escape = static fn(string $t): string => htmlspecialchars($t, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        echo '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>AEROVENTA — документация</title><style>body{font:16px system-ui,sans-serif;margin:8vh auto;max-width:730px;padding:0 24px;color:#233746}h1{font-weight:500}a{color:#12628b}li{padding:12px 0}small{color:#6b7986}</style><h1>Документация AEROVENTA</h1><p>Ссылки действуют 14 дней после передачи проекта.</p><ul>';
        foreach ($st['files'] as $i=>$f) echo '<li><a rel="noreferrer" href="?action=download&amp;t='.$escape($token).'&amp;file='.$i.'">'.$escape((string)$f['name']).'</a> <small>('.number_format((int)$f['size']/1048576, 2, ',', ' ').' МБ)</small></li>';
        echo '</ul></html>';exit;
    }
    $index = filter_var((string)$_GET['file'], FILTER_VALIDATE_INT);
    if ($index === false || $index < 0 || !isset($st['files'][$index])) av_reply(404, 'file_not_found');
    $f=$st['files'][$index]; $path=$dir.'/part-'.$index.'.dat';
    if (!is_file($path) || is_link($path) || filesize($path) !== (int)$f['size']) av_reply(404, 'file_not_found');
    $fn = (string)$f['name'];
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="project-'.$index.'.'.$f['ext'].'"; filename*=UTF-8\'\''.rawurlencode($fn));
    header('Content-Length: '.(string)filesize($path));
    header('Content-Transfer-Encoding: binary');
    while (ob_get_level()) ob_end_clean();
    $stream=fopen($path,'rb');
    if ($stream) { fpassthru($stream); fclose($stream); }
    exit;
}

av_security();
if (($_SERVER['CONTENT_LENGTH'] ?? 0) > 3 * 1024 * 1024) av_reply(413, 'request_too_large');
$root=av_root();
if ($action === 'init') {
    $input=json_decode((string)file_get_contents('php://input'),true);
    if (!is_array($input)) av_reply(422,'invalid_json');
    if (!empty($input['website']) || ($input['consent'] ?? false) !== true) av_reply(422,'invalid_submission');
    $started=(int)($input['started_at']??0);
    $age=(int)round(microtime(true)*1000)-$started;
    if ($age<900 || $age>86400000) av_reply(422,'invalid_start');
    $name=av_text($input['name']??null,80);
    $contact=av_text($input['contact']??null,160);
    $task=av_text($input['task']??null,3000);
    $source=av_text($input['source_page']??'/',300,false);
    if (!filter_var($contact,FILTER_VALIDATE_EMAIL)) {
        $digits=preg_replace('/\D/', '', $contact);
        if (!preg_match('/^\+?[0-9 ()\t.\-]+$/D',$contact) || strlen((string)$digits)<10 || strlen((string)$digits)>15) av_reply(422,'invalid_contact');
    }
    $incoming=$input['files']??null;
    if (!is_array($incoming) || count($incoming)<1 || count($incoming)>AV_MAX_FILES) av_reply(422,'file_count_invalid');
    $allowed=['pdf','dwg','dxf','zip','jpg','jpeg','png','webp','gif','bmp','tif','tiff','ifc','doc','docx','xls','xlsx','7z','rar','rvt'];
    $files=[]; $total=0;
    foreach ($incoming as $item) {
        if (!is_array($item)) av_reply(422,'invalid_file');
        $fn=av_text($item['name']??null,140);
        if (str_contains($fn,'/') || str_contains($fn,'\\') || str_contains($fn,'..')) av_reply(422,'invalid_filename');
        $ext=strtolower((string)pathinfo($fn,PATHINFO_EXTENSION));
        if (!in_array($ext,$allowed,true)) av_reply(415,'file_type_rejected');
        $size=$item['size']??null;
        if (!is_int($size) || $size<1 || $size>AV_MAX_BYTES) av_reply(413,'invalid_file_size');
        $total += $size;
        if ($total>AV_MAX_BYTES) av_reply(413,'files_too_large');
        $files[]=['name'=>$fn,'size'=>$size,'ext'=>$ext,'offset'=>0,'sha256'=>''];
    }
    $stats=av_gc($root);
    $ipHash=hash('sha256',(string)($_SERVER['REMOTE_ADDR']??'').getenv('AEROVENTA_PROJECT_SALT'));
    if (($stats['pending_by_ip'][$ipHash]??0)>=3 || $stats['reserved']+$total>AV_MAX_STORAGE || disk_free_space($root)<($total+AV_MIN_FREE_DISK)) av_reply(429,'storage_capacity_or_rate_limit');
    $id=bin2hex(random_bytes(16));$token=bin2hex(random_bytes(32));
    $dir=$root.'/'.$id;
    $old=umask(0077);$created=@mkdir($dir,0700);umask($old);
    if (!$created) av_reply(503,'session_create_failed');
    $st=['version'=>1,'phase'=>'pending','created'=>time(),'expires'=>time()+AV_PENDING_TTL,
        'ip_hash'=>$ipHash,'token_hash'=>hash('sha256',$token),'name'=>$name,'contact'=>$contact,
        'task'=>$task,'source'=>$source,'files'=>$files,'total'=>$total];
    $fh=fopen($dir.'/state.json','c+b');
    if (!$fh || !flock($fh, LOCK_EX)) av_reply(503,'session_create_failed');
    av_save($fh,$st);av_unlock($fh);
    av_reply(201,'',['id'=>$id,'token'=>$token,'offsets'=>array_fill(0,count($files),0),'expires_in'=>AV_PENDING_TTL]);
}
$id=(string)($_SERVER['HTTP_X_AV_UPLOAD_ID']??'');
$token=(string)($_SERVER['HTTP_X_AV_UPLOAD_TOKEN']??'');
[$dir,$st,$fh]=av_session($id,$token,$root);
if ($action==='status') {
    $offs=array_map(static fn($f)=>(int)$f['offset'],$st['files']);
    av_unlock($fh);av_reply(200,'',['offsets'=>$offs,'phase'=>$st['phase']]);
}
if ($action==='chunk') {
    if (($st['phase']??'')!=='pending') {av_unlock($fh);av_reply(409,'upload_already_complete');}
    $idx=filter_var($_SERVER['HTTP_X_AV_FILE_INDEX']??'', FILTER_VALIDATE_INT);
    $offset=filter_var($_SERVER['HTTP_X_AV_OFFSET']??'', FILTER_VALIDATE_INT);
    $length=(int)($_SERVER['CONTENT_LENGTH']??-1);
    if ($idx===false || $offset===false || $idx<0 || !isset($st['files'][$idx]) || $offset<0 ||
        $length<1 || $length>AV_MAX_CHUNK || $offset+$length>(int)$st['files'][$idx]['size']) {av_unlock($fh);av_reply(422,'invalid_chunk');}
    if ((int)$st['files'][$idx]['offset']!==$offset) { $expected=$st['files'][$idx]['offset']; av_unlock($fh);av_reply(409,'offset_mismatch',['offset'=>$expected]); }
    $claimedHash=(string)($_SERVER['HTTP_X_AV_SHA256']??'');
    $bytes=file_get_contents('php://input');
    if (!is_string($bytes) || strlen($bytes)!==$length || !preg_match('/^[a-f0-9]{64}$/D',$claimedHash) || !hash_equals($claimedHash,hash('sha256',$bytes))) {av_unlock($fh);av_reply(422,'chunk_integrity_failed');}
    if (disk_free_space($root)<AV_MIN_FREE_DISK) {av_unlock($fh);av_reply(507,'insufficient_storage');}
    $path=$dir.'/part-'.$idx.'.dat';$part=fopen($path,'c+b');
    if (!$part || fseek($part,$offset)!==0 || fwrite($part,$bytes)!==$length || !fflush($part)) {if($part)fclose($part);av_unlock($fh);av_reply(503,'chunk_write_failed');}
    fclose($part);
    $st['files'][$idx]['offset']=$offset+$length;
    av_save($fh,$st);av_unlock($fh);
    av_reply(200,'',['offset'=>$offset+$length]);
}
if ($action==='finish') {
    if (($st['phase']??'')==='complete') {av_unlock($fh);av_reply(200,'',['status'=>'already_accepted']);}
    foreach($st['files'] as $i=>$f) {
        $path=$dir.'/part-'.$i.'.dat';
        if ((int)$f['offset'] !== (int)$f['size'] || !is_file($path) || filesize($path)!==(int)$f['size']) {av_unlock($fh);av_reply(409,'upload_incomplete');}
        if (!av_validate_file($path,(string)$f['ext'])) {av_unlock($fh);av_reply(415,'file_type_rejected');}
    }
    $to=trim((string)getenv('AEROVENTA_LEAD_TO'));
    $from=trim((string)getenv('AEROVENTA_LEAD_FROM'));
    if (strcasecmp($to,'office@aeroventa.ru')!==0 || !filter_var($from,FILTER_VALIDATE_EMAIL) ||
        strtolower(substr(strrchr($from,'@')?:'',1))!=='aeroventa.ru') {av_unlock($fh);av_reply(503,'mailbox_unconfigured');}
    $share=bin2hex(random_bytes(32));
    $link='https://aeroventa.ru/api/project-transfer.php?action=download&t='.$share;
    $lines=['Проектная документация AEROVENTA (защищённая загрузка)',
      'Имя: '.$st['name'],'Контакт: '.$st['contact'],'Задача: '.$st['task'],
      'Страница: '.$st['source'],'Размер: '.number_format($st['total']/1048576,2,'.','').' MiB',
      'Файлы:'];
    foreach($st['files'] as $f) $lines[]='- '.$f['name'].' ('.number_format($f['size']/1048576,2,'.','').' MiB)';
    $lines[]='';$lines[]='Защищённая ссылка для скачивания (действительна 14 дней):';$lines[]=$link;
    $lines[]='';$lines[]='Не пересылайте ссылку посторонним. Файлы не вложены в письмо.';
    $body=implode("\n",$lines);
    $headers=['From: AEROVENTA Website <'.$from.'>', 'Reply-To: '.$from,
      'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: 8bit', 'X-AEROVENTA-Source: private-project-upload'];
    $subject='=?UTF-8?B?'.base64_encode('AEROVENTA: документация проекта (ссылка)').'?=';
    $ok=@mail($to,$subject,$body,implode("\r\n",$headers));
    if (!$ok) {av_unlock($fh);av_reply(503,'mail_delivery_unavailable');}
    $st['phase']='complete';$st['share_hash']=hash('sha256',$share);$st['expires']=time()+AV_COMPLETE_TTL;
    foreach($st['files'] as $i=>$_) $st['files'][$i]['sha256']=hash_file('sha256',$dir.'/part-'.$i.'.dat');
    av_save($fh,$st);av_unlock($fh);
    av_reply(200,'',['status'=>'mta_accepted_not_delivered']);
}
av_unlock($fh);av_reply(404,'unknown_action');
