<?php
declare(strict_types=1);
if (!defined('AEROVENTA_EDITOR_ENTRY')) {http_response_code(404);exit;}
/**
 * Owner-only READ-ONLY snapshot of the existing Directus editorial content.
 * Save locally BEFORE importing the 49 accepted Astro baselines. No mutations
 * or tokens in the output; never includes leads, contacts, or private uploads.
 */
function baselineExport(string $method): never {
    if($method!=='GET')respond(405,['error'=>'Экспорт только для чтения']);
    if(!logged()||!ownerAdmin())respond(403,['error'=>'Только администратор может скачать резервную копию']);
    // Directus exposes the actual installed schema; a guessed optional
    // field must not make the owner's pre-import backup fail with HTTP 400.
    // Only these four editorial collections are ever requested.
    $collections=[
        'content'=>'*',
        'content_blocks'=>'*',
        'content_block_map'=>'*',
        'content_categories'=>'*'
    ];
    $result=[];$counts=[];
    foreach($collections as $collection=>$fields){
        $rows=[];$limit=100;
        for($offset=0;$offset<1000;$offset+=$limit){
            $url='/items/'.$collection.'?fields='.$fields.'&limit='.$limit.'&offset='.$offset;
            $response=requestCms('GET',$url);
            if($response['status']!==200)respond(502,['error'=>'Не удалось прочитать коллекцию '.$collection.' целиком']);
            $batch=$response['data']['data']??null;
            if(!is_array($batch)||!array_is_list($batch)||count($batch)>$limit)
                respond(502,['error'=>'Некорректный ответ Directus при экспорте']);
            $rows=array_merge($rows,$batch);
            if(count($batch)<$limit)break;
            if($offset+$limit>=1000)respond(409,['error'=>'Экспорт превышает безопасный предел записей']);
        }
        $result[$collection]=$rows;$counts[$collection]=count($rows);
    }
    $backup=[
        'format'=>'AEROVENTA_DIRECTUS_EDITORIAL_SNAPSHOT_V1',
        'generated_utc'=>gmdate('c'),
        'source'=>'cms.aeroventa.ru / existing authenticated Directus session',
        'read_only'=>true,
        'scope'=>'content,content_blocks,content_block_map,content_categories ONLY',
        'excludes'=>'secrets,users,leads,credentials,files bytes,other VPS services',
        'counts'=>$counts,
        'data'=>$result
    ];
    $json=json_encode($backup,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE|JSON_THROW_ON_ERROR);
    if(!is_string($json)||strlen($json)>12000000)respond(409,['error'=>'Слишком большой экспорт; установка CMS заблокирована']);
    $hash=hash('sha256',$json);
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="AEROVENTA_DIRECTUS_BEFORE_IMPORT_'.gmdate('Ymd_His').'.json"');
    header('X-Content-Type-Options: nosniff');
    header('X-Content-SHA256: '.$hash);
    header('Cache-Control: private, no-store, max-age=0');
    header('Pragma: no-cache');
    header('Content-Length: '.strlen($json));
    echo $json;exit;
}
