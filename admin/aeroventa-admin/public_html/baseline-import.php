<?php
declare(strict_types=1);
if (!defined('AEROVENTA_EDITOR_ENTRY')) { http_response_code(404); exit; }
/**
 * Owner-only, idempotent, per-page import of already accepted Astro content.
 * No changes to aeroventa.ru. Existing draft fields, manual blocks, images and
 * page approval states are NEVER overwritten. An interrupted import resumes.
 */
function baselinePlan(): array {
    $file=dirname(__DIR__).'/private/accepted-site-cms-blueprint-v1.json';
    if(!is_file($file) || filesize($file)>3000000) respond(503,['error'=>'Нет проверенного реестра принятого сайта']);
    $plan=json_decode((string)file_get_contents($file),true);
    if(!is_array($plan)||($plan['format']??'')!=='AEROVENTA_OWNER_ACCEPTED_CMS_BASELINE_V1'||
        ($plan['summary']['canonical_pages']??null)!==49||
        ($plan['origin_source_sha']??'')!=='afc1cc10d75a1f434c51e173128d93f9b09e041a')
        respond(503,['error'=>'Неверный исходный реестр CMS']);
    return $plan;
}
/** Preserve Directus response semantics without exposing records or credentials. */
function baselineDirectusFailure(string $stage, array $response): never {
    $http=(int)($response['status']??0);
    $code=$response['data']['errors'][0]['extensions']['code']??'';
    if(!is_string($code)||!preg_match('/^[A-Z_]{2,48}$/D',$code))$code='UNKNOWN';
    error_log('[AEROVENTA baseline import] '. $stage.' HTTP '.$http.' '.$code);
    respond($http===403?403:502,['error'=>'Directus: '.$stage.' (HTTP '.$http.'; '.$code.'). Черновики сохранены.']);
}

/**
 * Read-only full post-import reconciliation. Requires the ALREADY EXISTING
 * owner Directus session, never the deliberately limited Actions Build Reader.
 * Compares structural keys only; preserves and counts manual text changes.
 */
function baselineVerify(array $plan): never {
    if(!ownerAdmin()) respond(403,['error'=>'Проверка доступна только владельцу']);
    $r=requestCms('GET','/items/content?fields=id,path,status,owner_approved_at,robots_index,sitemap_include&limit=100&sort=path');
    if($r['status']!==200)baselineDirectusFailure('проверка сохранённых страниц',$r);
    $records=$r['data']['data']??null;
    if(!is_array($records)||count($records)>=100)respond(409,['error'=>'Неполный список материалов Directus']);
    $byPath=[];$ids=[];$issues=[];
    foreach($records as $row){
        $p=$row['path']??null;$id=$row['id']??null;
        if(!is_string($p)||!is_string($id)||isset($byPath[$p])||isset($ids[$id])){
            $issues[]='Некорректный или повторяющийся адрес/ID записи';
            continue;
        }
        $byPath[$p]=$row;$ids[$id]=true;
    }
    $links=[];$seenLinks=[];
    // Existing relation collection, already used by the installed editor.
    // Bounded read-only pagination; stable sort avoids page overlap.
    for($offset=0;$offset<2000;$offset+=100){
        $r=requestCms('GET','/items/content_block_map?fields=id,content_id,sort,block_id.id,block_id.block_type,block_id.data,block_id.fact_checked&limit=100&sort=id&offset='.$offset);
        if($r['status']!==200)baselineDirectusFailure('проверка связей секций',$r);
        $part=$r['data']['data']??null;
        if(!is_array($part)||count($part)>100)respond(502,['error'=>'Неверная страница связей Directus']);
        foreach($part as $link){
            $linkId=$link['id']??null;
            if(!is_scalar($linkId)||isset($seenLinks[(string)$linkId])){ $issues[]='Повторяющаяся связь секции';continue; }
            $seenLinks[(string)$linkId]=true;
            $contentId=$link['content_id']??null;
            if(is_array($contentId))$contentId=$contentId['id']??null;
            if(!is_string($contentId)){$issues[]='Связь без ID материала';continue;}
            $links[$contentId][]=$link;
        }
        if(count($part)<100)break;
        if($offset===1900)respond(409,['error'=>'Превышен безопасный лимит секций']);
    }
    $verifiedPages=0;$verifiedBlocks=0;$verifiedFields=0;$editedFields=0;$otherBlocks=0;
    $expectedPaths=[];
    foreach($plan['pages'] as $page){
        $path=$page['path']??null;
        if(!is_string($path)){ $issues[]='Исходный реестр повреждён';continue; }
        $expectedPaths[$path]=true;
        $item=$byPath[$path]??null;
        if(!is_array($item)){ $issues[]='Нет страницы: '.$path;continue;}
        if(($item['status']??null)!=='draft'||($item['owner_approved_at']??null)!==null||
           ($item['robots_index']??null)!==false||($item['sitemap_include']??null)!==false){
            $issues[]='Нарушена защита черновика: '.$path;continue;
        }
        $actual=$links[$item['id']]??[];
        $sections=[];$invalid=false;
        foreach($actual as $row){
            $block=$row['block_id']??null;
            if(!is_array($block)||!is_string($block['id']??null)){$invalid=true;break;}
            if(($block['block_type']??null)!=='dom_fields'){$otherBlocks++;continue;}
            $data=$block['data']??null;
            $fields=$data['fields']??null;
            $key=is_array($fields)?($fields[0]['key']??null):null;
            if(!is_array($data)||($data['version']??null)!==1||($data['page']??null)!==$path||
               !is_string($key)||isset($sections[$key])){$invalid=true;break;}
            $sections[$key]=$fields;
        }
        if($invalid){$issues[]='Повреждена или дублирована секция: '.$path;continue;}
        $pageBlocks=0;$pageFields=0;
        foreach(($page['blocks']??[]) as $original){
            $expected=$original['data']['fields']??null;
            $first=is_array($expected)?($expected[0]['key']??null):null;
            if(!is_string($first)||!array_key_exists($first,$sections)){
                $issues[]='Нет исходной секции: '.$path;$invalid=true;break;
            }
            $now=$sections[$first];
            if(!is_array($now)||count($now)!==count($expected)){
                $issues[]='Состав секции отличается: '.$path;$invalid=true;break;
            }
            foreach($expected as $i=>$field){
                if(($now[$i]['key']??null)!==($field['key']??null)||
                   ($now[$i]['node']??null)!==($field['node']??null)||
                   ($now[$i]['kind']??null)!==($field['kind']??null)||
                   ($now[$i]['attribute']??null)!==($field['attribute']??null)||
                   ($now[$i]['source_sha256']??null)!==($field['source_sha256']??null)){
                    $issues[]='Исходный DOM-контракт изменён: '.$path;$invalid=true;break;
                }
                if(($now[$i]['value']??null)!==($field['value']??null))$editedFields++;
                $pageFields++;
            }
            if($invalid)break;
            $pageBlocks++;
        }
        if($invalid)continue;
        if(count($sections)!==$pageBlocks){
            $issues[]='Лишние исходные секции: '.$path;continue;
        }
        $verifiedPages++;$verifiedBlocks+=$pageBlocks;$verifiedFields+=$pageFields;
    }
    foreach($byPath as $path=>$item)if(!isset($expectedPaths[$path]))$issues[]='Дополнительный CMS-маршрут: '.$path;
    if($verifiedPages!==49||$verifiedFields!==(int)$plan['summary']['fields'])$issues[]='Неполный перенос 49 страниц / 2342 полей';
    $complete=count($issues)===0;
    respond(200,[
        'complete'=>$complete,'canonical_pages'=>49,'verified_pages'=>$verifiedPages,
        'expected_fields'=>(int)$plan['summary']['fields'],'verified_fields'=>$verifiedFields,
        'verified_sections'=>$verifiedBlocks,'preserved_editor_changes'=>$editedFields,
        'additional_editor_blocks'=>$otherBlocks,'directus_records'=>count($byPath),
        'issues'=>array_slice(array_values(array_unique($issues)),0,12),
        'read_only'=>true,'public_site_changed'=>false
    ]);
}

function baselineImport(string $action,string $method): never {
    if(!ownerAdmin())respond(403,['error'=>'Импорт разрешён только владельцу-администратору Directus']);
    $plan=baselinePlan();
    if($action==='baseline_verify' && $method==='GET')baselineVerify($plan);
    if($action==='baseline_status' && $method==='GET'){
        respond(200,['available'=>true,'pages'=>49,'fields'=>$plan['summary']['fields'],
            'unchanged_public_site'=>true,'reimport'=>'resume_safe','source_sha'=>$plan['origin_source_sha']]);
    }
    if($action!=='baseline_import_page'||$method!=='POST')respond(405,['error'=>'Недопустимое действие']);
    csrf();$input=body();
    if(($input['owner_confirmation']??'')!=='ПЕРЕНЕСТИ ПРИНЯТЫЙ САЙТ В ЧЕРНОВИКИ')
        respond(400,['error'=>'Нужно прямое подтверждение переноса принятого содержания']);
    $index=$input['index']??null;
    if(!is_int($index)||$index<0||$index>=49)respond(400,['error'=>'Недопустимый номер страницы']);
    $item=$plan['pages'][$index];$path=$item['path'];
    if(!is_string($path)||!preg_match('~^/(?:[a-z0-9-]+/)*$~D',$path))
        respond(409,['error'=>'Недопустимый путь в реестре']);
    $look=requestCms('GET','/items/content?filter%5Bpath%5D%5B_eq%5D='.rawurlencode($path).'&fields=id,path,status,owner_approved_at&limit=2');
    if($look['status']!==200)baselineDirectusFailure('поиск исходной страницы',$look);
    $matches=$look['data']['data']??[];
    if(!is_array($matches)||count($matches)>1)respond(409,['error'=>'Обнаружен неоднозначный адрес страницы']);
    $created=false;
    if(count($matches)===0){
        // New retained public URL: create a NON-INDEXABLE, nonapproved DRAFT.
        // Only source-verified factual metadata; never guess commercial claims.
        $h1=trim((string)($item['h1']??''));
        $seo=$item['seo']??[];
        $title=trim((string)($seo['og_title']??$h1));
        if($h1===''||$title===''||strlen($title)>240||strlen($h1)>240)
            respond(409,['error'=>'Нельзя создать непроверенную страницу без корректного H1']);
        $type='page';
        if(str_starts_with($path,'/portfolio/obekt/'))$type='project';
        elseif(str_starts_with($path,'/blog/detail/'))$type='article';
        elseif(in_array($path,['/almaznoe-burenie/','/montazh-ventiliacii/'],true))$type='service';
        $parts=explode('/',trim($path,'/'));$slug=end($parts) ?: 'home';
        // V11/V12 live Directus content.business_role is NOT NULL with no default.
        // The original 29 drafts already had it; this route is the FIRST new
        // record (page 22), hence earlier imports passed and POST now 400s.
        // Reuse only previously installed, source-proven business roles.
        $businessRole='PRIMARY_COMMERCIAL';
        if(str_starts_with($path,'/portfolio/obekt/'))$businessRole='CORE_VENTILATION_CASE';
        elseif($path==='/privacy/')$businessRole='CORE_TRUST';
        $new=['status'=>'draft','content_type'=>$type,'path'=>$path,'slug'=>$slug,
            'business_role'=>$businessRole,
            'title'=>$title,'h1'=>$h1,'seo_title'=>$title,'seo_description'=>(string)($seo['seo_description']??''),
            'owner_approved_at'=>null,'robots_index'=>false,'robots_follow'=>true,
            'sitemap_include'=>false,'knowledge_allowed'=>false,'ai_origin'=>false,
            'body_html_safety_status'=>'not_applicable',
            'migration_evidence'=>['origin'=>'OWNER_ACCEPTED_ASTRO_SOURCE_AND_LIVE','source_sha'=>$plan['origin_source_sha'],
                'review_required'=>true]];
        $create=requestCms('POST','/items/content',$new);
        if(!in_array($create['status'],[200,201],true))baselineDirectusFailure('создание черновика',$create);
        $record=$create['data']['data']??null;
        if(!is_array($record)||!is_string($record['id']??null))respond(502,['error'=>'Directus не подтвердил создание черновика']);
        $created=true;
    }else{
        $record=$matches[0];
        if(($record['status']??'')!=='draft'||($record['owner_approved_at']??null)!==null)
            respond(409,['error'=>'Автоматический импорт запрещён для утверждённой страницы']);
    }
    $id=(string)$record['id'];
    $maps=requestCms('GET','/items/content_block_map?filter%5Bcontent_id%5D%5B_eq%5D='.rawurlencode($id).
        '&fields=id,sort,block_id.id,block_id.block_type,block_id.data,block_id.fact_checked&limit=100&sort=sort');
    if($maps['status']!==200)baselineDirectusFailure('чтение секций',$maps);
    $current=$maps['data']['data']??[];
    if(!is_array($current)||count($current)>=100)respond(409,['error'=>'Слишком много связанных секций']);
    $existing=[];$next=0;
    foreach($current as $m){
        $next=max($next,((int)($m['sort']??0))+1);
        if(($m['block_id']['block_type']??null)==='dom_fields'){
            $data=$m['block_id']['data']??null;
            if(($data['page']??null)!==$path || ($data['version']??null)!==1)
                respond(409,['error'=>'Несовместимая ранее импортированная секция']);
            $key=$data['fields'][0]['key']??null;
            if(!is_string($key)||isset($existing[$key]))respond(409,['error'=>'Дублированные поля CMS']);
            $existing[$key]=$m; // preserve any manual changes inside the block
        }
    }
    $added=0;$preserved=0;
    foreach($item['blocks'] as $block){
        $data=$block['data'];$key=$data['fields'][0]['key']??null;
        if(!is_string($key)||!preg_match('/^[a-f0-9]{24}$/D',$key))respond(409,['error'=>'Неверный ключ исходной секции']);
        if(isset($existing[$key])){
            $same=$existing[$key]['block_id']['data']??[];
            $keys1=array_column($same['fields']??[],'key');$keys2=array_column($data['fields'],'key');
            if($keys1!==$keys2)respond(409,['error'=>'Схема секции конфликтует с реестром']);
            $preserved++;continue;
        }
        $createdBlock=requestCms('POST','/items/content_blocks',[
            'block_type'=>'dom_fields','data'=>$data,'fact_checked'=>true]);
        if(!in_array($createdBlock['status'],[200,201],true))baselineDirectusFailure('создание секции',$createdBlock);
        $blockId=$createdBlock['data']['data']['id']??null;
        if(!is_string($blockId))respond(502,['error'=>'Не подтверждён ID секции']);
        $link=requestCms('POST','/items/content_block_map',['content_id'=>$id,'block_id'=>$blockId,'sort'=>$next++]);
        if(!in_array($link['status'],[200,201],true)){
            requestCms('DELETE','/items/content_blocks/'.rawurlencode($blockId));
            baselineDirectusFailure('привязка секции',$link);
        }
        $added++;
    }
    respond(200,['ok'=>true,'path'=>$path,'index'=>$index,'total'=>49,'new_content_record'=>$created,
        'new_blocks'=>$added,'preserved_blocks'=>$preserved,'live_changed'=>false]);
}