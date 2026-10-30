<?php
declare(strict_types=1);

// AEROVENTA Editor v1 — isolated web app for Beget PHP hosting.
// No Directus extensions, Docker, GitHub secrets or Beget production-site writes.
const CMS_URL = 'https://cms.aeroventa.ru';
const MAX_FIELD_LENGTH = ['title' => 240, 'h1' => 240, 'excerpt' => 1600,
    'seo_title' => 240, 'seo_description' => 480,
    'og_title' => 240, 'og_description' => 480,
    'canonical_override' => 240, 'schema_type' => 48];

if (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') {
    // Must not accept credentials over an insecure connection.
    http_response_code(403);
    header('Content-Type: text/plain; charset=UTF-8');
    echo 'HTTPS required. Configure SSL for the isolated admin subdomain.';
    exit;
}
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_secure', '1');
ini_set('session.gc_maxlifetime', '3600');
session_name('av_editor_sid');
session_set_cookie_params(['lifetime'=>0, 'path'=>'/', 'secure'=>true,
    'httponly'=>true, 'samesite'=>'Strict']);
session_start();
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header('Cache-Control: no-store, max-age=0');
header("Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'");
if (!isset($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));

function respond(int $code, array $data): never {
    http_response_code($code);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}
function body(): array {
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 90000) respond(413, ['error'=>'Слишком большой запрос']);
    $json = file_get_contents('php://input');
    $data = json_decode($json ?: '{}', true);
    if (!is_array($data)) respond(400, ['error'=>'Некорректный запрос']);
    return $data;
}
function csrf(): void {
    $given = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($given) || !hash_equals($_SESSION['csrf'], $given)) {
        respond(403, ['error'=>'Сессия истекла. Обновите страницу.']);
    }
}
function cms(string $method, string $route, ?array $payload = null, ?string $token = null): array {
    if (!function_exists('curl_init')) throw new RuntimeException('На хостинге необходимо включить PHP cURL');
    $ch = curl_init(CMS_URL . $route);
    $headers = ['Accept: application/json'];
    if ($payload !== null) $headers[] = 'Content-Type: application/json';
    if ($token !== null) $headers[] = 'Authorization: Bearer ' . $token;
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 18,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_USERAGENT => 'AEROVENTA-Editor/1.0',
    ]);
    if ($payload !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_THROW_ON_ERROR));
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    if ($raw === false) throw new RuntimeException('Нет защищённого соединения с Directus: ' . substr($error,0,100));
    $decoded = json_decode($raw, true);
    return ['status'=>$code, 'data'=>is_array($decoded) ? $decoded : []];
}
function logged(): bool { return !empty($_SESSION['access']) && !empty($_SESSION['refresh']); }
function refresh(): bool {
    if (empty($_SESSION['refresh'])) return false;
    $answer = cms('POST', '/auth/refresh', [
        'refresh_token'=>(string)$_SESSION['refresh'], 'mode'=>'json'
    ]);
    $data = $answer['data']['data'] ?? [];
    if ($answer['status'] !== 200 || empty($data['access_token']) || empty($data['refresh_token'])) return false;
    $_SESSION['access'] = $data['access_token'];
    $_SESSION['refresh'] = $data['refresh_token'];
    $_SESSION['expires'] = time() + max(15, intdiv((int)($data['expires'] ?? 60000),1000) - 30);
    return true;
}
function requestCms(string $method, string $route, ?array $data = null): array {
    if (!logged()) respond(401, ['error'=>'Требуется вход']);
    if (time() >= (int)($_SESSION['expires'] ?? 0) && !refresh()) {
        unset($_SESSION['access'],$_SESSION['refresh']);
        respond(401, ['error'=>'Сессия истекла. Войдите снова.']);
    }
    $out = cms($method,$route,$data,(string)$_SESSION['access']);
    if ($out['status'] === 401) {
        if (!refresh()) {unset($_SESSION['access'],$_SESSION['refresh']); respond(401,['error'=>'Войдите снова']);}
        $out = cms($method,$route,$data,(string)$_SESSION['access']);
    }
    return $out;
}
const SAFE_BODY_MARKER = '<!-- AEROVENTA_EDITOR_SAFE_BODY_V1 -->';
function compiledBody(string $raw): ?string {
    if (strlen($raw)>60000) respond(400,['error'=>'Текст статьи превышает 60 000 байт']);
    $raw = str_replace(["\r\n","\r"],"\n",$raw);
    $html=[]; $list=false;
    foreach (explode("\n",$raw) as $line) {
        $line=trim($line);
        if($line==='') {if($list){$html[]='</ul>';$list=false;}continue;}
        $txt=$line;
        $tag='p';
        if(str_starts_with($line,'### ')) {$tag='h3';$txt=substr($line,4);}
        elseif(str_starts_with($line,'## ')) {$tag='h2';$txt=substr($line,3);}
        elseif(str_starts_with($line,'- ')) {$tag='li';$txt=substr($line,2);}
        $safe=htmlspecialchars($txt,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
        if($tag==='li'&&!$list){$html[]='<ul>';$list=true;}
        if($tag!=='li'&&$list){$html[]='</ul>';$list=false;}
        $html[]='<'.$tag.'>'.$safe.'</'.$tag.'>';
    }
    if($list)$html[]='</ul>';
    return $html ? SAFE_BODY_MARKER."\n".implode("\n",$html) : null;
}
function decodedBody(?string $html): array {
    if(!$html) return ['body_source'=>'','body_editor_supported'=>true];
    if(!str_starts_with($html,SAFE_BODY_MARKER)) return ['body_source'=>'','body_editor_supported'=>false];
    $text=str_replace(SAFE_BODY_MARKER,'',$html);
    $text=preg_replace('~<h2>(.*?)</h2>~su','## $1',$text);
    $text=preg_replace('~<h3>(.*?)</h3>~su','### $1',$text);
    $text=preg_replace('~<li>(.*?)</li>~su','- $1',$text);
    $text=preg_replace('~</?(?:p|ul)>~u','',$text);
    $text=trim(strip_tags($text));
    $text=preg_replace('/\n{2,}/u', "\n", $text);
    return ['body_source'=>html_entity_decode($text,ENT_QUOTES|ENT_HTML5,'UTF-8'),'body_editor_supported'=>true];
}
function normalizeRecord(array $item): array {
    $core=array_intersect_key($item, array_flip([
        'id','path','title','h1','content_type','excerpt','seo_title','seo_description',
        'status','owner_approved_at','published_at','updated_at_public',
        'slug','og_title','og_description','hero_file','og_image','schema_type','canonical_override',
        'body_html','body_html_safety_status'
    ]));
    return $core+decodedBody($item['body_html']??null);
}
function safeId(string $id): string {
    if (!preg_match('/^[a-f0-9-]{36}$/i',$id)) respond(400,['error'=>'Некорректный ID']);
    return $id;
}
function resetAuth(): void {
    unset($_SESSION['access'],$_SESSION['refresh'],$_SESSION['expires']);
}
function errorResponse(int $code): never {
    if ($code === 403) respond(403,['error'=>'Недостаточно прав в Directus']);
    if ($code === 404) respond(404,['error'=>'Материал не найден']);
    if ($code === 401) {resetAuth(); respond(401,['error'=>'Войдите снова']);}
    respond(502,['error'=>'Directus недоступен или вернул ошибку (HTTP '.$code.')']);
}

define('AEROVENTA_EDITOR_ENTRY', true);
require_once __DIR__ . '/release-bridge.php';
require_once __DIR__ . '/reviewed-preview.php';
require_once __DIR__ . '/baseline-import.php';

$action = (string)($_GET['action'] ?? '');
try {
    if ($action !== '') {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if ($action === 'session' && $method === 'GET') {
            respond(200, ['authenticated'=>logged(), 'csrf'=>$_SESSION['csrf']]);
        }
        if ($action === 'login' && $method === 'POST') {
            csrf();
            $input = body();
            $now = time();
            if ($now < (int)($_SESSION['login_locked_until'] ?? 0)) respond(429,['error'=>'Слишком много попыток входа. Попробуйте позже.']);
            $email = trim((string)($input['email'] ?? ''));
            $password = (string)($input['password'] ?? '');
            $otp = trim((string)($input['otp'] ?? ''));
            if (!filter_var($email,FILTER_VALIDATE_EMAIL) || strlen($password) < 1 || strlen($password)>4096) respond(400,['error'=>'Проверьте данные для входа']);
            $data = ['email'=>$email,'password'=>$password,'mode'=>'json'];
            if ($otp!=='') $data['otp']=$otp;
            $out = cms('POST','/auth/login',$data);
            $info = $out['data']['data'] ?? [];
            if ($out['status'] !== 200 || !is_array($info) || empty($info['access_token']) || empty($info['refresh_token'])) {
                $attempts = (int)($_SESSION['login_attempts'] ?? 0) + 1;
                $_SESSION['login_attempts'] = $attempts;
                if ($attempts >= 5) {$_SESSION['login_locked_until']=$now+300; $_SESSION['login_attempts']=0;}
                respond(401,['error'=>'Не удалось войти. Проверьте логин, пароль и одноразовый код.']);
            }
            session_regenerate_id(true);
            $_SESSION['csrf']=bin2hex(random_bytes(32));
            $_SESSION['access']=$info['access_token'];
            $_SESSION['refresh']=$info['refresh_token'];
            $_SESSION['expires']=time()+max(15,intdiv((int)($info['expires']??60000),1000)-30);
            unset($_SESSION['login_attempts'],$_SESSION['login_locked_until']);
            respond(200,['authenticated'=>true,'csrf'=>$_SESSION['csrf']]);
        }
        if ($action === 'logout' && $method === 'POST') {
            csrf();
            if (!empty($_SESSION['refresh'])) {
                try {cms('POST','/auth/logout',['mode'=>'json','refresh_token'=>$_SESSION['refresh']]);} catch (Throwable $e) { /* local logout remains valid */ }
            }
            resetAuth();
            session_regenerate_id(true);
            $_SESSION['csrf']=bin2hex(random_bytes(32));
            respond(200,['authenticated'=>false,'csrf'=>$_SESSION['csrf']]);
        }
        if (!logged()) respond(401,['error'=>'Войдите для просмотра данных']);
        if(in_array($action,['reviewed_preview','reviewed_media'],true))reviewedPreview($action,$method);
        if(in_array($action,['baseline_status','baseline_import_page'],true))baselineImport($action,$method);
        if (in_array($action,['publisher_status','owner_approve','prepare_release','publish_release','release_status'],true)) {
            releaseBridge($action,$method);
        }
        if ($action === 'dashboard' && $method === 'GET') {
            $r = requestCms('GET','/items/content?fields=id,path,slug,title,h1,excerpt,seo_title,seo_description,og_title,og_description,hero_file,og_image,schema_type,canonical_override,body_html,body_html_safety_status,status,owner_approved_at,content_type&limit=100&sort=path');
            if ($r['status']!==200) errorResponse($r['status']);
            $items = $r['data']['data'] ?? [];
            if (!is_array($items)) respond(502,['error'=>'Неверный ответ Directus']);
            if (count($items)>=100) respond(409,['error'=>'Достигнут лимит 100 записей. Требуется постраничный просмотр.']);
            respond(200,['items'=>array_map('normalizeRecord',$items), 'publishingEnabled'=>false]);
        }
        if ($action === 'categories' && $method === 'GET') {
            $r=requestCms('GET','/items/content_categories?fields=id,name,slug,path,description,status,category_type,seo_title,seo_description,robots_index&limit=100&sort=path');
            if ($r['status']!==200) errorResponse($r['status']);
            $rows=$r['data']['data']??[];
            if(!is_array($rows) || count($rows)>=100)respond(409,['error'=>'Не удалось полностью загрузить разделы']);
            respond(200,['items'=>$rows]);
        }
        if ($action === 'create_category' && $method === 'POST') {
            csrf();$input=body();
            $slug=trim((string)($input['slug']??''));
            $name=trim((string)($input['name']??''));
            if(!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D',$slug)||strlen($slug)>60||strlen($slug)<3 ||
                strlen($name)<3 || strlen($name)>160)respond(400,['error'=>'Введите название и латинский адрес раздела']);
            $path='/blog/'.$slug.'/';
            $existing=requestCms('GET','/items/content_categories?filter%5Bpath%5D%5B_eq%5D='.rawurlencode($path).'&fields=id&limit=1');
            if($existing['status']!==200) errorResponse($existing['status']);
            if(!empty($existing['data']['data']))respond(409,['error'=>'Раздел с этим адресом уже есть']);
            $r=requestCms('POST','/items/content_categories',[
                'status'=>'draft','name'=>$name,'slug'=>$slug,'path'=>$path,
                'category_type'=>'article_hub','description'=>null,'robots_index'=>false
            ]);
            if(!in_array($r['status'],[200,201],true))errorResponse($r['status']);
            respond(201,['ok'=>true,'id'=>$r['data']['data']['id']??null,'message'=>'Раздел создан как черновик. На сайте его пока нет.']);
        }
        if ($action === 'upload_image' && $method === 'POST') {
            csrf();
            $file = $_FILES['image'] ?? null;
            if (!is_array($file) || ($file['error'] ?? -1) !== UPLOAD_ERR_OK) {
                respond(400, ['error'=>'Не удалось получить изображение. Проверьте лимит PHP на хостинге.']);
            }
            $tmp=$file['tmp_name']??'';
            $size=(int)($file['size']??0);
            if (!is_string($tmp)||!is_uploaded_file($tmp)||$size<100||$size>12*1024*1024) {
                respond(413,['error'=>'Допустима фотография от 100 байт до 12 МБ']);
            }
            if (!function_exists('finfo_open') || !function_exists('getimagesize')) {
                respond(503,['error'=>'Проверка изображений недоступна на PHP-хостинге']);
            }
            $info = getimagesize($tmp);
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mime = finfo_file($finfo, $tmp);
            finfo_close($finfo);
            $extByMime=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp','image/avif'=>'avif'];
            if (!$info || !isset($extByMime[$mime]) || ($info['mime']??'')!==$mime) {
                respond(415,['error'=>'Нужен настоящий JPG, PNG, WebP или AVIF. SVG запрещён.']);
            }
            if ($info[0]>9000 || $info[1]>9000 || $info[0]<32 || $info[1]<32) {
                respond(415,['error'=>'Неподдерживаемые размеры изображения']);
            }
            // Validate current session/refresh without exposing Directus credentials.
            $me=requestCms('GET','/users/me?fields=id');
            if ($me['status']!==200)errorResponse($me['status']);
            $upload=curl_init(CMS_URL.'/files');
            curl_setopt_array($upload,[
                CURLOPT_RETURNTRANSFER=>true, CURLOPT_POST=>true,
                CURLOPT_HTTPHEADER=>['Accept: application/json','Authorization: Bearer '.(string)$_SESSION['access']],
                CURLOPT_POSTFIELDS=>['file'=>new CURLFile($tmp,$mime,'aeroventa-'.bin2hex(random_bytes(6)).'.'.$extByMime[$mime])],
                CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>90,
                CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,
                CURLOPT_FOLLOWLOCATION=>false,CURLOPT_USERAGENT=>'AEROVENTA-Editor/1.0']);
            $raw=curl_exec($upload);
            $status=(int)curl_getinfo($upload,CURLINFO_RESPONSE_CODE);
            curl_close($upload);
            if ($raw===false || !in_array($status,[200,201],true)) {
                respond(502,['error'=>'Directus не принял изображение. Проверьте доступ редактора к медиатеке.']);
            }
            $uploaded=json_decode($raw,true);
            $id=$uploaded['data']['id']??null;
            if(!is_string($id)||!preg_match('/^[a-f0-9-]{36}$/i',$id))respond(502,['error'=>'Directus не подтвердил ID нового файла']);
            respond(201,['ok'=>true,'id'=>$id,'message'=>'Изображение загружено в Directus. Публичный сайт не изменён.']);
        }
        // Authenticated thumbnail proxy: keeps Directus bearer token server-side.
        // No public/media URL or token is exposed to the browser or production.
        if($action==='media_thumb' && $method==='GET'){
            if(!logged())respond(401,['error'=>'Требуется вход']);
            $id=safeId((string)($_GET['id']??''));
            $me=requestCms('GET','/users/me?fields=id');
            if($me['status']!==200)errorResponse($me['status']);
            $file=requestCms('GET','/files/'.rawurlencode($id).'?fields=id,type,filesize');
            if($file['status']!==200)errorResponse($file['status']);
            if(!in_array(($file['data']['data']['type']??''),['image/jpeg','image/png','image/webp','image/avif'],true))
                respond(415,['error'=>'Недопустимый тип фотографии']);
            $ch=curl_init(CMS_URL.'/assets/'.rawurlencode($id).'?width=480&height=340&fit=contain&format=webp');
            curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,
                CURLOPT_HTTPHEADER=>['Authorization: Bearer '.(string)$_SESSION['access'],'Accept: image/webp'],
                CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>25,CURLOPT_FOLLOWLOCATION=>false,
                CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,
                CURLOPT_USERAGENT=>'AEROVENTA-Editor-Thumbnail/1.0']);
            $bytes=curl_exec($ch);$http=(int)curl_getinfo($ch,CURLINFO_RESPONSE_CODE);
            $mime=(string)curl_getinfo($ch,CURLINFO_CONTENT_TYPE);curl_close($ch);
            if($http!==200||!is_string($bytes)||strlen($bytes)<20||strlen($bytes)>3500000 ||
                !str_starts_with($mime,'image/webp')||substr($bytes,0,4)!=='RIFF'||substr($bytes,8,4)!=='WEBP')
                respond(502,['error'=>'Фотография не получена из Directus']);
            header('Content-Type: image/webp');header('Content-Length: '.strlen($bytes));echo $bytes;exit;
        }
        if ($action === 'media' && $method === 'GET') {
            $r=requestCms('GET','/files?fields=id,filename_download,type,filesize,uploaded_on&limit=50&sort=-uploaded_on');
            if ($r['status'] !== 200) errorResponse($r['status']);
            $rows=$r['data']['data']??[];
            if(!is_array($rows))respond(502,['error'=>'Некорректный ответ']);
            respond(200,['items'=>array_map(static fn($x)=>array_intersect_key($x,array_flip(['id','filename_download','type','filesize','uploaded_on'])),$rows)]);
        }
        if ($action === 'create_article' && $method === 'POST') {
            csrf();$input=body();
            $slug=trim((string)($input['slug']??''));
            $title=trim((string)($input['title']??''));
            if(!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D',$slug)||strlen($slug)>80||strlen($slug)<3 ||
                strlen($title)<5||strlen($title)>240)respond(400,['error'=>'Название и латинский адрес статьи обязательны']);
            $path='/blog/detail/'.$slug.'/';
            $existing=requestCms('GET','/items/content?filter%5Bpath%5D%5B_eq%5D='.rawurlencode($path).'&fields=id&limit=1');
            if($existing['status']!==200)errorResponse($existing['status']);
            if(!empty($existing['data']['data']))respond(409,['error'=>'Статья с таким адресом уже существует']);
            $r=requestCms('POST','/items/content',[
                'status'=>'draft','content_type'=>'article','path'=>$path,'slug'=>$slug,
                'title'=>$title,'h1'=>$title,'seo_title'=>$title,
                'business_role'=>'VENTILATION_AUTHORITY',
                'body_html'=>null,'body_html_safety_status'=>'not_applicable',
                'owner_approved_at'=>null,'robots_index'=>false,'robots_follow'=>true,
                'sitemap_include'=>false,'knowledge_allowed'=>false,'ai_origin'=>false,
                'fact_check_status'=>'pending','duplicate_check_status'=>'pending',
                'cannibalization_check_status'=>'pending'
            ]);
            if(!in_array($r['status'],[200,201],true))errorResponse($r['status']);
            respond(201,['ok'=>true,'id'=>$r['data']['data']['id']??null,'message'=>'Статья создана как неиндексируемый черновик. На сайте её пока нет.']);
        }
        // Existing Directus content_blocks + content_block_map. No duplicate CMS model.
        // All mutations affect only an unapproved draft; production is untouched.
        if ($action === 'blocks' && $method === 'GET') {
            $id=safeId((string)($_GET['id']??''));
            $item=requestCms('GET','/items/content/'.rawurlencode($id).'?fields=id,path,status,owner_approved_at');
            if ($item['status']!==200)errorResponse($item['status']);
            $r=requestCms('GET','/items/content_block_map?filter%5Bcontent_id%5D%5B_eq%5D='.rawurlencode($id).
                '&fields=id,sort,block_id.id,block_id.block_type,block_id.data,block_id.fact_checked&sort=sort&limit=100');
            if ($r['status']!==200)errorResponse($r['status']);
            $rows=$r['data']['data']??[];
            if(!is_array($rows))respond(502,['error'=>'Не удалось получить секции']);
            respond(200,['blocks'=>$rows,'editable'=>($item['data']['data']['status']??'')==='draft'&&($item['data']['data']['owner_approved_at']??null)===null]);
        }
        if (in_array($action,['block_add','block_update','block_remove','block_approve','block_move'],true) && $method==='POST') {
            csrf();$input=body();$id=safeId((string)($input['content_id']??''));
            $item=requestCms('GET','/items/content/'.rawurlencode($id).'?fields=id,path,status,owner_approved_at');
            if($item['status']!==200)errorResponse($item['status']);
            $row=$item['data']['data']??[];
            if(($row['status']??'')!=='draft'||($row['owner_approved_at']??null)!==null)
                respond(409,['error'=>'Секции можно изменять только до утверждения материала']);
            $maps=requestCms('GET','/items/content_block_map?filter%5Bcontent_id%5D%5B_eq%5D='.rawurlencode($id).
                '&fields=id,sort,block_id.id,block_id.block_type,block_id.data,block_id.fact_checked&limit=100&sort=sort');
            if($maps['status']!==200)errorResponse($maps['status']);
            $all=$maps['data']['data']??[];
            if(!is_array($all)||count($all)>100)respond(409,['error'=>'Неверный состав секций']);
            $mapId=(int)($input['map_id']??0);$existing=null;
            foreach($all as $m){if((int)($m['id']??0)===$mapId){$existing=$m;break;}}
            if($action!=='block_add' && !$existing)respond(404,['error'=>'Секция не найдена на этой странице']);
            if(in_array($action,['block_add','block_update'],true)) {
                $kind=$action==='block_add'?(string)($input['block_type']??''):(string)($existing['block_id']['block_type']??'');
                if(!in_array($kind,['text','cards','gallery','cta','dom_fields'],true))respond(400,['error'=>'Недопустимый тип секции']);
                if($kind==='dom_fields' && $action==='block_add')respond(403,['error'=>'Импортированные элементы создаются только из принятого сайта']);
                $data=$input['data']??null;
                if(!is_array($data)||array_is_list($data))respond(400,['error'=>'Некорректное содержимое секции']);
                $validText=static fn($v,int $max):bool=>is_string($v)&&trim($v)!==''&&strlen($v)<=$max&&!preg_match('/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]/',$v);
                $validPath=static fn($v,bool $image=false):bool=>is_string($v)&&
                    ($image ? (bool)preg_match('~^[a-f0-9-]{36}$~iD',$v) ||
                        (bool)preg_match('~^/(?:evidence|brand|upload|cms-media)/[a-zA-Z0-9/_-]+\\.(?:png|jpe?g|webp|avif)$~iD',$v)
                        : (bool)preg_match('~^/[a-zA-Z0-9/_./-]*$~D',$v) && !str_contains($v,'..'));
                $ok=false;
                if($kind==='text')$ok=$validText($data['heading']??null,240)&&$validText($data['text']??null,8000);
                if($kind==='cta')$ok=$validText($data['label']??null,160)&&$validPath($data['href']??null)&&
                    (!isset($data['heading'])||$validText($data['heading'],240));
                if(in_array($kind,['cards','gallery'],true)) {
                    $items=$data['items']??null;$ok=is_array($items)&&array_is_list($items)&&count($items)>0&&count($items)<=24&&
                         (!isset($data['heading'])||$validText($data['heading'],240));
                    if($ok)foreach($items as $entry){
                        if(!is_array($entry)||!$validText($entry['title']??null,240)||!$validPath($entry['image']??null,true)||
                            (isset($entry['alt'])&&!$validText($entry['alt'],350))||
                            ($kind==='cards'&&(!$validPath($entry['href']??null)||(isset($entry['text'])&&!$validText($entry['text'],1000))))){$ok=false;break;}
                    }
                }
                if($kind==='dom_fields') {
                    // Immutable Astro baseline/selector may never be edited via UI.
                    // The only writable property of each element is its value.
                    $old=$existing['block_id']['data']??null;
                    $nf=$data['fields']??null;$of=$old['fields']??null;
                    $ok=is_array($old)&&is_array($of)&&is_array($nf)&&count($of)===count($nf)&&
                        count($nf)>0&&count($nf)<=20&&($data['page']??null)===($old['page']??null)&&
                        ($data['version']??null)===1;
                    if($ok)foreach($nf as $i=>$f){
                        if(!is_array($f)||!isset($of[$i])||!is_array($of[$i])){$ok=false;break;}
                        $copy=$f;unset($copy['value']);$original=$of[$i];unset($original['value']);
                        $value=$f['value']??null;
                        $kind=(string)($f['kind']??'');
                        $limit=$kind==='text'?24000:($kind==='alt'?350:2048);
                        $required=$kind==='text'&&preg_match('~/h1\[[0-9]+\]$~D',(string)($f['node']??''));
                        // Clear optional text/alt without deleting the element.
                        // Never clear a page H1, media URL or navigation link.
                        if($copy!=$original||!in_array($kind,['text','alt','media','link'],true)||
                            !is_string($value)||strlen($value)>$limit||
                            (($required||$kind==='media'||$kind==='link')&&trim($value)==='')||
                            preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/',$value)){$ok=false;break;}
                        if(($f['kind']??null)==='media'){
                            $value=$f['value'];
                            if(preg_match('/^[0-9a-f-]{36}$/iD',$value)){
                                $file=requestCms('GET','/files/'.rawurlencode($value).'?fields=id,type');
                                if($file['status']!==200||!in_array($file['data']['data']['type']??null,['image/jpeg','image/png','image/webp','image/avif'],true)){$ok=false;break;}
                            }elseif(!preg_match('~^/(?:[a-zA-Z0-9/_-]+)\.(?:png|jpe?g|webp|avif)$~iD',$value)||str_contains($value,'..')){$ok=false;break;}
                        }
                        if(($f['kind']??null)==='link'&&(!str_starts_with($f['value'],'/')||str_starts_with($f['value'],'//')||
                           str_contains($f['value'],'..')||str_contains($f['value'],'\\')||
                           strpbrk($f['value'],"\r\n\"'<>")!==false)){$ok=false;break;}
                    }
                }
                if(!$ok)respond(422,['error'=>'Проверьте заполнение и адреса изображений секции']);
                if($kind==='cards'||$kind==='gallery')foreach($data['items'] as $entry){
                    if(preg_match('/^[a-f0-9-]{36}$/i',(string)$entry['image'])){
                        $file=requestCms('GET','/files/'.rawurlencode($entry['image']).'?fields=id,type');
                        if($file['status']!==200)errorResponse($file['status']);
                        if(!in_array(($file['data']['data']['type']??null),['image/jpeg','image/png','image/webp','image/avif'],true))
                            respond(422,['error'=>'Изображение не является допустимой фотографией']);
                    }
                }
                if($action==='block_add'){
                    if(count($all)>=80)respond(409,['error'=>'Лимит секций страницы']);
                    $b=requestCms('POST','/items/content_blocks',['block_type'=>$kind,'data'=>$data,'fact_checked'=>false]);
                    if(!in_array($b['status'],[200,201],true))errorResponse($b['status']);
                    $new=(string)($b['data']['data']['id']??'');
                    if(!preg_match('/^[a-f0-9-]{36}$/i',$new))respond(502,['error'=>'Новая секция не получила ID']);
                    $next=0;foreach($all as $m)$next=max($next,(int)($m['sort']??0)+1);
                    $link=requestCms('POST','/items/content_block_map',['content_id'=>$id,'block_id'=>$new,'sort'=>$next]);
                    if(!in_array($link['status'],[200,201],true)){
                        requestCms('DELETE','/items/content_blocks/'.rawurlencode($new));
                        respond(502,['error'=>'Не удалось привязать секцию к странице, откат создания запрошен']);
                    }
                    respond(201,['ok'=>true,'message'=>'Секция добавлена в черновик']);
                }
                if(($existing['block_id']['data']??null)!==($input['before']??null))
                    respond(409,['error'=>'Секция изменена другим редактором. Обновите страницу']);
                $result=requestCms('PATCH','/items/content_blocks/'.rawurlencode((string)$existing['block_id']['id']),
                    ['data'=>$data,'fact_checked'=>false]);
                if($result['status']!==200)errorResponse($result['status']);
                respond(200,['ok'=>true,'message'=>'Секция сохранена. Перед публикацией подтвердите проверку фактов']);
            }
            if($action==='block_approve') {
                if(!ownerAdmin())respond(403,['error'=>'Проверить факты может только владелец']);
                if(($input['owner_confirmation']??'')!=='ФАКТЫ ПРОВЕРЕНЫ')respond(422,['error'=>'Нет явного подтверждения']);
                $result=requestCms('PATCH','/items/content_blocks/'.rawurlencode((string)$existing['block_id']['id']),['fact_checked'=>true]);
                if($result['status']!==200)errorResponse($result['status']);
                respond(200,['ok'=>true,'message'=>'Секция проверена владельцем; сайт не опубликован']);
            }
            if($action==='block_remove') {
                if(($existing['block_id']['block_type']??'')==='dom_fields')respond(409,['error'=>'Исходные элементы нельзя удалить через отвязку; измените их содержание']);
                if(($input['owner_confirmation']??'')!=='ОТВЯЗАТЬ СЕКЦИЮ')respond(422,['error'=>'Отсутствует подтверждение удаления секции со страницы']);
                $result=requestCms('DELETE','/items/content_block_map/'.$mapId);
                if(!in_array($result['status'],[200,204],true))errorResponse($result['status']);
                respond(200,['ok'=>true,'message'=>'Секция отвязана от черновика; данные блока не удалены']);
            }
            if($action==='block_move'){
                if(($existing['block_id']['block_type']??'')==='dom_fields')respond(409,['error'=>'Порядок исходных секций определяется принятым Astro-шаблоном']);
                $direction=(string)($input['direction']??'');if(!in_array($direction,['up','down'],true))respond(400,['error'=>'Некорректный порядок']);
                $sorted=$all;usort($sorted,static fn($a,$b)=>(int)$a['sort']<=>(int)$b['sort']);
                $index=null;foreach($sorted as $i=>$m)if((int)$m['id']===$mapId){$index=$i;break;}
                $other=$index===null?null:($sorted[$index+($direction==='up'?-1:1)]??null);
                if(!$other)respond(200,['ok'=>true,'message'=>'Секция уже на краю списка']);
                $swap=requestCms('PATCH','/items/content_block_map/'.$mapId,['sort'=>(int)$other['sort']]);
                if($swap['status']!==200)errorResponse($swap['status']);
                $swapBack=requestCms('PATCH','/items/content_block_map/'.(int)$other['id'],['sort'=>(int)$existing['sort']]);
                if($swapBack['status']!==200)respond(502,['error'=>'Порядок изменён частично, обновите список']);
                respond(200,['ok'=>true,'message'=>'Порядок секций изменён']);
            }
        }
        if ($action === 'save' && $method === 'POST') {
            csrf();
            $input=body();
            $id=safeId((string)($input['id']??''));
            $changes=$input['changes']??[];
            if (!is_array($changes)||!$changes) respond(400,['error'=>'Изменений нет']);
            $allowed=array_merge(array_keys(MAX_FIELD_LENGTH),['hero_file','og_image','body_source']);
            foreach ($changes as $k=>$v) {
                if(!in_array($k,$allowed,true))respond(400,['error'=>'Недопустимое поле']);
                if($k==='body_source'){
                    if(!is_string($v)||strlen($v)>60000)respond(400,['error'=>'Недопустимый текст статьи']);
                } elseif(in_array($k,['hero_file','og_image'],true)) {
                    if(!is_null($v) && (!is_string($v) || !preg_match('/^[a-f0-9-]{36}$/i',$v)))
                        respond(400,['error'=>'Недопустимый файл']);
                } else if(!is_string($v)||(function_exists('mb_strlen') ? mb_strlen($v) : strlen($v))>MAX_FIELD_LENGTH[$k]) {
                    respond(400,['error'=>'Некорректное поле или длина текста']);
                }
            }
            if(array_key_exists('canonical_override',$changes)){
                $canonical=(string)$changes['canonical_override'];
                if($canonical!=='' && !preg_match('~^https://aeroventa\.ru/(?:[a-z0-9-]+/)*$~D',$canonical))
                    respond(422,['error'=>'Canonical допускается только на существующем домене aeroventa.ru']);
                $changes['canonical_override']=$canonical===''?null:$canonical;
            }
            if(array_key_exists('schema_type',$changes) && !in_array($changes['schema_type'],
                ['WebPage','Article','NewsArticle','Service','FAQPage','AboutPage','ContactPage','CollectionPage'],true))
                respond(422,['error'=>'Недопустимый тип структурированных данных']);
            foreach(['hero_file','og_image'] as $key) {
                if(!array_key_exists($key,$changes) || $changes[$key]===null)continue;
                $file=requestCms('GET','/files/'.rawurlencode($changes[$key]).'?fields=id,type');
                if($file['status']!==200)errorResponse($file['status']);
                if(!in_array(($file['data']['data']['type']??''),['image/jpeg','image/png','image/webp','image/avif'],true))
                    respond(400,['error'=>'Можно выбрать только фотографию']);
            }
            $before=$input['before']??[];
            if (!is_array($before)) respond(400,['error'=>'Недействительная версия страницы']);
            $fields='id,path,status,owner_approved_at,body_html,body_html_safety_status,'.implode(',',array_diff($allowed,['body_source']));
            $read=requestCms('GET','/items/content/'.rawurlencode($id).'?fields='.$fields);
            if($read['status']!==200)errorResponse($read['status']);
            $current=$read['data']['data']??null;
            if(!is_array($current)||($current['status']??'')!=='draft'||($current['owner_approved_at']??null)!==null)
                respond(409,['error'=>'Редактировать можно только неутверждённый черновик']);
            if(($current['path']??'')!==($before['path']??'')) respond(409,['error'=>'Адрес материала изменился']);
            // Optimistic readback; safe to refuse stale drafts (not an atomic CAS).
            foreach($changes as $key=>$value) {
                if($key==='body_source') {
                    if(!decodedBody($current['body_html']??null)['body_editor_supported'])respond(409,['error'=>'Исходное HTML этой страницы требует специального редактора']);
                    if(($current['body_html']??null)!==($before['body_html']??null))respond(409,['error'=>'Текст изменился, обновите страницу']);
                    if(($before['body_source']??'')!==decodedBody($current['body_html']??null)['body_source'])respond(409,['error'=>'Текст изменился в Directus']);
                    continue;
                }
                if(!array_key_exists($key,$before)||($before[$key]??null)!==($current[$key]??null))
                    respond(409,['error'=>'Материал изменён в Directus. Обновите его перед сохранением.']);
            }
            if(array_key_exists('body_source',$changes)){
                $compiled=compiledBody($changes['body_source']);
                unset($changes['body_source']);
                $changes['body_html']=$compiled;
                $changes['body_html_safety_status']=$compiled===null?'not_applicable':'reviewed_safe';
            }
            $update=requestCms('PATCH','/items/content/'.rawurlencode($id),$changes);
            if($update['status']!==200)errorResponse($update['status']);
            respond(200,['ok'=>true,'message'=>'Черновик сохранён в Directus. Сайт не опубликован.']);
        }
        respond(404,['error'=>'Операция не найдена']);
    }
} catch (Throwable $e) {
    error_log('[AEROVENTA-Editor] '.$e->getMessage());
    respond(502,['error'=>'Не удалось связаться с Directus. Публичный сайт не затронут.']);
}
header('Content-Type: text/html; charset=UTF-8');
?><!doctype html>
<html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="light">
<title>AEROVENTA — управление содержимым</title><link rel="icon" type="image/svg+xml" href="/assets/symbol-color.svg"><link rel="stylesheet" href="/assets/app.css"></head>
<body><div id="app" aria-live="polite"><div class="boot"><img class="boot-logo" src="/assets/logo-header-color.svg" alt="AEROVENTA.RU"><p>Загрузка AEROVENTA Editor</p></div></div>
<script src="/assets/app.js" defer></script></body></html>
