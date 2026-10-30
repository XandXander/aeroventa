<?php
declare(strict_types=1);
if (!defined('AEROVENTA_EDITOR_ENTRY')) {http_response_code(404);exit;}
/*
 * Owner-only REAL Astro review from the immutable GitHub preview artifact.
 * HTML and image resources are derived from the reviewed package, never from
 * a mutable CMS draft. GitHub PAT is NOT forwarded to redirect hosts.
 * Cache lives under private/, outside public_html.
 */
function reviewedZip(array $config, int $runId): string {
    $cache=dirname(__DIR__).'/private/.aeroventa-review-cache';
    if(!is_dir($cache) && !@mkdir($cache,0700,true) && !is_dir($cache))
        throw new RuntimeException('Private review cache is not writable');
    $name=$cache.'/review-'.$runId.'.zip';
    if(is_file($name) && filesize($name)>100 && filesize($name)<55000000) return $name;
    $data=githubCall('GET','/repos/XandXander/aeroventa/actions/runs/'.$runId.'/artifacts',null,$config);
    if($data['status']!==200)respond(502,['error'=>'Артефакт проверки недоступен']);
    $artifact=null;
    foreach(($data['data']['artifacts']??[]) as $entry){
        if(($entry['name']??'')==='AEROVENTA_PREDEPLOY_VERIFIED_CANDIDATE_AND_ROLLBACK' &&
            empty($entry['expired']) && is_numeric($entry['id']??null)){$artifact=(int)$entry['id'];break;}
    }
    if(!$artifact)respond(409,['error'=>'Нет проверенного артефакта указанного запуска']);
    $head=[];
    $ch=curl_init('https://api.github.com/repos/XandXander/aeroventa/actions/artifacts/'.$artifact.'/zip');
    curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_HEADER=>true,CURLOPT_FOLLOWLOCATION=>false,
        CURLOPT_HTTPHEADER=>['Accept: application/vnd.github+json','X-GitHub-Api-Version: 2022-11-28',
            'Authorization: Bearer '.$config['github_actions_token']],
        CURLOPT_USERAGENT=>'AEROVENTA-Owner-Review/1.0',CURLOPT_CONNECTTIMEOUT=>7,
        CURLOPT_TIMEOUT=>25,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2]);
    $first=curl_exec($ch);$status=(int)curl_getinfo($ch,CURLINFO_RESPONSE_CODE);
    $headerSize=(int)curl_getinfo($ch,CURLINFO_HEADER_SIZE);curl_close($ch);
    if(!is_string($first)||$status!==302)respond(502,['error'=>'GitHub не выдал подписанную ссылку на архив']);
    $rawHeaders=substr($first,0,$headerSize);
    if(!preg_match('/^Location:\s*(\S+)\s*$/mi',$rawHeaders,$match))
        respond(502,['error'=>'Ответ GitHub не содержит URL артефакта']);
    $url=$match[1];$parsed=parse_url($url);
    $host=strtolower((string)($parsed['host']??''));
    if(($parsed['scheme']??'')!=='https' || !preg_match('~(^|\\.)githubusercontent\\.com$|(^|\\.)blob\\.core\\.windows\\.net$~D',$host))
        respond(502,['error'=>'Небезопасный адрес скачивания артефакта']);
    $buffer='';
    $download=curl_init($url);
    curl_setopt_array($download,[CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>7,
        CURLOPT_TIMEOUT=>40,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,
        CURLOPT_USERAGENT=>'AEROVENTA-Owner-Review/1.0',
        CURLOPT_WRITEFUNCTION=>static function($ch,string $chunk)use(&$buffer):int{
            if(strlen($buffer)+strlen($chunk)>50000000)return 0;
            $buffer.=$chunk;return strlen($chunk);
        }]);
    $ok=curl_exec($download);$code=(int)curl_getinfo($download,CURLINFO_RESPONSE_CODE);curl_close($download);
    if($ok===false||$code!==200||strlen($buffer)<100||substr($buffer,0,2)!=='PK')
        respond(502,['error'=>'Не удалось получить проверочный ZIP']);
    // Actions artifacts are themselves ZIP containers. The uploaded payload
    // is AEROVENTA_REVIEWED_CANDIDATE_AND_ROLLBACK.zip inside that container.
    $temp=$name.'.'.bin2hex(random_bytes(5));
    if(file_put_contents($temp,$buffer,LOCK_EX)!==strlen($buffer))throw new RuntimeException('Cache write failed');
    @chmod($temp,0600);
    if(!class_exists('ZipArchive'))throw new RuntimeException('PHP ZipArchive is required');
    $outer=new ZipArchive();
    if($outer->open($temp)!==true)throw new RuntimeException('Invalid GitHub artifact ZIP');
    try{
        $inner=$outer->getFromName('AEROVENTA_REVIEWED_CANDIDATE_AND_ROLLBACK.zip');
        if(!is_string($inner)||strlen($inner)<100||strlen($inner)>50000000||substr($inner,0,2)!=='PK')
            throw new RuntimeException('Reviewed immutable package missing inside GitHub artifact');
    }finally{$outer->close();}
    $nested=$temp.'.inner';
    if(file_put_contents($nested,$inner,LOCK_EX)!==strlen($inner))throw new RuntimeException('Nested ZIP write failed');
    @chmod($nested,0600);
    if(!rename($nested,$name))throw new RuntimeException('Cache activation failed');
    @unlink($temp);
    return $name;
}
function reviewedPreview(string $action,string $method): never {
    if($method!=='GET')respond(405,['error'=>'Неверный метод']);
    if(!logged()||!ownerAdmin())respond(403,['error'=>'Предпросмотр доступен только владельцу']);
    $runId=(int)($_GET['run_id']??0);
    if($runId<100000||$runId>999999999999999)respond(400,['error'=>'Неверный ID сборки']);
    $id=safeId((string)($_GET['id']??''));
    $config=releaseConfig();if(!$config)respond(503,['error'=>'GitHub не подключён']);
    $item=approvedItem($id);
    $sha=ownerSourceSha($config);
    $run=githubCall('GET','/repos/XandXander/aeroventa/actions/runs/'.$runId,null,$config);
    $info=$run['data']??[];
    if($run['status']!==200||($info['status']??null)!=='completed'||
       ($info['conclusion']??null)!=='success'||($info['event']??null)!=='workflow_dispatch'||
       ($info['head_sha']??null)!==$sha||($info['head_branch']??null)!=='aeroventa/hiend-seo-owner-recovery-2026-10-13'||
       ($info['name']??null)!=='AEROVENTA - manually approved CMS-to-live release')
        respond(409,['error'=>'Это не успешная проверочная сборка текущей версии']);
    $jobs=githubCall('GET','/repos/XandXander/aeroventa/actions/runs/'.$runId.'/jobs',null,$config);
    if($jobs['status']!==200)respond(502,['error'=>'Не удалось проверить состав GitHub jobs']);
    $preview=false;$live=false;
    foreach(($jobs['data']['jobs']??[]) as $job){
        if(($job['name']??'')==='preview-build'&&($job['conclusion']??'')==='success')$preview=true;
        if(($job['name']??'')==='publish-to-beget'&&($job['conclusion']??'')==='success')$live=true;
    }
    if(!$preview||$live)respond(409,['error'=>'Указан не проверочный запуск']);
    if(!class_exists('ZipArchive'))respond(503,['error'=>'На хостинге нужен PHP ZipArchive']);
    $zip=new ZipArchive();$file=reviewedZip($config,$runId);
    if($zip->open($file)!==true)respond(502,['error'=>'Архив повреждён']);
    try{
        $manifestRaw=$zip->getFromName('manifest.json');
        $lockRaw=$zip->getFromName('cms-approved-lock.json');
        $manifest=is_string($manifestRaw)?json_decode($manifestRaw,true):null;
        $lock=is_string($lockRaw)?json_decode($lockRaw,true):null;
        if(!is_array($manifest)||!is_array($lock)||($manifest['source_sha']??null)!==$sha||
            ($lock['source_sha']??null)!==$sha||!in_array($item['path'],$manifest['approved_paths']??[],true))
            respond(409,['error'=>'Артефакт не соответствует этой утверждённой странице']);
        $route=ltrim($item['path'],'/');$name=$route.'index.html';
        if($action==='reviewed_media'){
            $name=(string)($_GET['file']??'');
            if(!preg_match('~^cms-media/[a-f0-9]{64}\\.(?:png|jpe?g|webp|avif)$~D',$name))
                respond(400,['error'=>'Неверное изображение']);
            $media=null;foreach(($manifest['media']??[]) as $m)if(($m['path']??'')===$name){$media=$m;break;}
            if(!is_array($media))respond(404,['error'=>'Фотография не принадлежит пакету']);
            $raw=$zip->getFromName($name);
            if(!is_string($raw)||strlen($raw)!==(int)$media['bytes_after']||
                !hash_equals((string)$media['sha256_after'],hash('sha256',$raw)))
                respond(502,['error'=>'Контрольная сумма изображения не совпадает']);
            $images=@getimagesizefromstring($raw);
            if(!$images||!in_array(($images['mime']??''),['image/jpeg','image/png','image/webp','image/avif'],true))
                respond(415,['error'=>'Неизвестный тип изображения']);
            header('Content-Type: '.$images['mime']);header('Cache-Control: private, no-store');
            echo $raw;exit;
        }
        $row=null;foreach(($manifest['files']??[]) as $entry)if(($entry['path']??'')===$name){$row=$entry;break;}
        if(!is_array($row))respond(404,['error'=>'В этом выпуске страница не менялась']);
        $html=$zip->getFromName($name);
        if(!is_string($html)||!hash_equals((string)$row['sha256_after'],hash('sha256',$html)))
            respond(502,['error'=>'Контрольная сумма Astro-страницы не совпадает']);
        $rewrite=static function(array $m)use($runId,$id):string {
            $attribute=$m[1];$quote=$m[2];$path=$m[3];
            if(str_starts_with($path,'cms-media/')){
                $link='/index.php?action=reviewed_media&amp;run_id='.$runId.'&amp;id='.rawurlencode($id).
                    '&amp;file='.rawurlencode($path);
            }else{$link='https://aeroventa.ru/'.$path;}
            return $attribute.'='.$quote.$link.$quote;
        };
        // All references to existing approved CSS/scripts/photos use the live
        // origin; only new SHA-addressed media are served from this verified ZIP.
        $pattern="~\\b(src|href)=([\"'])/(?!/)([^\"']+)\\2~i";
        $html=preg_replace_callback($pattern,$rewrite,$html)??$html;
        header('Content-Type: text/html; charset=UTF-8');
        header("Content-Security-Policy: default-src 'none'; style-src 'self' 'unsafe-inline' https://aeroventa.ru; img-src 'self' data: https://aeroventa.ru; font-src 'self' https://aeroventa.ru; script-src 'self' https://aeroventa.ru; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'");
        header('X-Robots-Tag: noindex, nofollow, noarchive');
        header('Cache-Control: private, no-store');
        echo $html;exit;
    }finally{$zip->close();}
}
