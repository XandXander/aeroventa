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
function baselineImport(string $action,string $method): never {
    if(!ownerAdmin())respond(403,['error'=>'Импорт разрешён только владельцу-администратору Directus']);
    $plan=baselinePlan();
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
    if($look['status']!==200)errorResponse($look['status']);
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
        $new=['status'=>'draft','content_type'=>$type,'path'=>$path,'slug'=>$slug,
            'title'=>$title,'h1'=>$h1,'seo_title'=>$title,'seo_description'=>(string)($seo['seo_description']??''),
            'owner_approved_at'=>null,'robots_index'=>false,'robots_follow'=>true,
            'sitemap_include'=>false,'knowledge_allowed'=>false,'ai_origin'=>false,
            'body_html_safety_status'=>'not_applicable',
            'migration_evidence'=>['origin'=>'OWNER_ACCEPTED_ASTRO_SOURCE_AND_LIVE','source_sha'=>$plan['origin_source_sha'],
                'review_required'=>true]];
        $create=requestCms('POST','/items/content',$new);
        if(!in_array($create['status'],[200,201],true))errorResponse($create['status']);
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
    if($maps['status']!==200)errorResponse($maps['status']);
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
        if(!in_array($createdBlock['status'],[200,201],true))errorResponse($createdBlock['status']);
        $blockId=$createdBlock['data']['data']['id']??null;
        if(!is_string($blockId))respond(502,['error'=>'Не подтверждён ID секции']);
        $link=requestCms('POST','/items/content_block_map',['content_id'=>$id,'block_id'=>$blockId,'sort'=>$next++]);
        if(!in_array($link['status'],[200,201],true)){
            requestCms('DELETE','/items/content_blocks/'.rawurlencode($blockId));
            errorResponse($link['status']);
        }
        $added++;
    }
    respond(200,['ok'=>true,'path'=>$path,'index'=>$index,'total'=>49,'new_content_record'=>$created,
        'new_blocks'=>$added,'preserved_blocks'=>$preserved,'live_changed'=>false]);
}