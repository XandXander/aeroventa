<?php
declare(strict_types=1);
if (!defined('AEROVENTA_EDITOR_ENTRY')) { http_response_code(404); exit; }
/*
 * AEROVENTA admin -> GitHub Actions release bridge.
 * Credential file MUST live OUTSIDE public_html:
 * aeroventa-admin/private/aeroventa-release-config.php
 * The bridge does not itself write to public_html or the VPS.
 */
function releaseConfig(): ?array {
    $file = dirname(__DIR__) . '/private/aeroventa-release-config.php';
    if (!is_file($file)) return null;
    $raw = require $file;
    if (!is_array($raw)) throw new RuntimeException('Publisher private config invalid');
    $token = $raw['github_actions_token'] ?? null;
    if (!is_string($token) || strlen($token) < 20 || str_contains($token, 'REPLACE')) return null;
    return $raw;
}
/** Directus 11+ stores admin_access on policies, not roles.
 * Both directly assigned user policies and role policies can grant it.
 * Explicit strict true is required; inaccessible/unknown policies fail closed.
 */
function ownerAdmin(): bool {
    $r = requestCms('GET', '/users/me?fields=id,policies.policy.admin_access,role.policies.policy.admin_access');
    if ($r['status'] !== 200 || !is_array($r['data']['data'] ?? null)) return false;
    $user = $r['data']['data'];
    $linked = array_merge(
        is_array($user['policies'] ?? null) ? $user['policies'] : [],
        is_array($user['role']['policies'] ?? null) ? $user['role']['policies'] : []
    );
    foreach ($linked as $access) {
        if (is_array($access) && ($access['policy']['admin_access'] ?? null) === true) return true;
    }
    return false;
}
function githubCall(string $verb, string $route, ?array $body, array $config): array {
    if (!preg_match('#^/(?:repos/XandXander/aeroventa/(?:pulls/12|actions/workflows/pr12-cms-live-publish.yml/dispatches|actions/runs/[0-9]+(?:/(?:jobs|artifacts))?))$#D', $route)) {
        throw new RuntimeException('GitHub endpoint is not on allowlist');
    }
    $ch = curl_init('https://api.github.com' . $route);
    $headers = ['Accept: application/vnd.github+json', 'X-GitHub-Api-Version: 2022-11-28', 'Authorization: Bearer ' . $config['github_actions_token']];
    if ($body !== null) $headers[] = 'Content-Type: application/json';
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_CUSTOMREQUEST=>$verb,
        CURLOPT_HTTPHEADER=>$headers, CURLOPT_USERAGENT=>'AEROVENTA-Owner-Publisher/1.0',
        CURLOPT_CONNECTTIMEOUT=>6, CURLOPT_TIMEOUT=>20, CURLOPT_FOLLOWLOCATION=>false,
        CURLOPT_SSL_VERIFYPEER=>true, CURLOPT_SSL_VERIFYHOST=>2]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_THROW_ON_ERROR));
    $raw = curl_exec($ch); $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch); curl_close($ch);
    if ($raw === false) throw new RuntimeException('GitHub TLS/network error: ' . substr($error, 0, 70));
    $json = json_decode($raw, true);
    return ['status'=>$status, 'data'=>is_array($json) ? $json : []];
}
function ownerSourceSha(array $config): string {
    // The existing implementation is in PR #12; release only from its exact
    // immutable head SHA. Workflow itself is registered on GitHub default main.
    $res = githubCall('GET', '/repos/XandXander/aeroventa/pulls/12', null, $config);
    $pr = $res['data']; $sha = $pr['head']['sha'] ?? '';
    if ($res['status'] !== 200 || ($pr['state'] ?? '') !== 'open' ||
        ($pr['head']['repo']['full_name'] ?? '') !== 'XandXander/aeroventa' ||
        ($pr['head']['ref'] ?? '') !== 'aeroventa/hiend-seo-owner-recovery-2026-10-13' ||
        !is_string($sha) || !preg_match('/^[a-f0-9]{40}$/D', $sha)) {
        throw new RuntimeException('GitHub PR #12 exact release head SHA not verified');
    }
    return $sha;
}
function approvedItem(string $id): array {
    $fields = 'id,path,status,owner_approved_at,robots_index,sitemap_include,title,h1,excerpt,seo_title,seo_description,body_html,body_html_safety_status';
    $r = requestCms('GET', '/items/content/' . rawurlencode($id) . '?fields=' . $fields);
    if ($r['status'] !== 200) errorResponse($r['status']);
    $item = $r['data']['data'] ?? [];
    if (!is_array($item) || ($item['status']??'')!=='published' || empty($item['owner_approved_at']) || ($item['robots_index']??null)!==true || ($item['sitemap_include']??null)!==true) {
        respond(409, ['error'=>'Для выпуска требуется утверждённый индексируемый материал Directus']);
    }
    if (!is_string($item['path']??null) || !preg_match('#^/(?:[a-z0-9-]+/)*$#D', $item['path'])) {
        respond(409, ['error'=>'Небезопасный адрес материала']);
    }
    if (empty($item['h1']) || empty($item['seo_title'])) respond(409,['error'=>'Недостаточно SEO и H1 для выпуска']);
    if (!empty($item['body_html']) && ($item['body_html_safety_status']??'') !== 'reviewed_safe') {
        respond(409, ['error'=>'Основной текст не прошёл проверку безопасности']);
    }
    return $item;
}
function releaseBridge(string $action, string $method): never {
    if ($action === 'release_status' && $method === 'GET') {
        // The return is a run *status*, never a self-declared successful release.
        csrf();
        if (!ownerAdmin()) respond(403,['error'=>'Только владелец может проверять выпуск']);
        $config=releaseConfig();
        if (!$config) respond(503,['error'=>'Публикация не подключена']);
        $id=(int)($_SESSION['aeroventa_release_run_id']??0);
        if ($id<=0) respond(404,['error'=>'Запуск публикации отсутствует']);
        $r=githubCall('GET','/repos/XandXander/aeroventa/actions/runs/'.$id,null,$config);
        if ($r['status']!==200) respond(502,['error'=>'Невозможно получить состояние выпуска от GitHub']);
        $run=$r['data'];
        $state=(string)($run['status']??'unknown');
        $conclusion=$run['conclusion']??null;
        $isLive=!empty($_SESSION['aeroventa_release_go_live']);
        respond(200,['run_id'=>$id,'status'=>$state,'conclusion'=>$conclusion,
            'requested_live'=>$isLive,
            'live_confirmed'=>$isLive && $state==='completed' && $conclusion==='success',
            'preview_ready'=>!$isLive && $state==='completed' && $conclusion==='success',
            'preview_run_id'=>!$isLive ? $id : (int)($_SESSION['aeroventa_preview_run_id']??0),
            'workflow_url'=>'https://github.com/XandXander/aeroventa/actions/runs/'.$id]);
    }
    if ($action === 'publisher_status' && $method === 'GET') {
        // No secrets or private file paths are sent to the browser.
        respond(200, ['configured'=>releaseConfig()!==null,
            'workflow'=>'https://github.com/XandXander/aeroventa/actions/workflows/pr12-cms-live-publish.yml',
            'note'=>'Настройка доступа и утверждение GitHub Environment обязательны. Принятие запроса не означает публикацию.']);
    }
    if ($method !== 'POST' || !in_array($action, ['owner_approve','prepare_release','publish_release'], true)) respond(405,['error'=>'Метод запрещён']);
    csrf();
    if (!ownerAdmin()) respond(403,['error'=>'Утверждение и выпуск доступны только администратору Directus']);
    $config = releaseConfig();
    if (!$config) respond(503,['error'=>'Публикация ещё не активирована: нет защищённого GitHub доступа']);
    $payload = body(); $id = safeId((string)($payload['id']??''));
    if ($action === 'owner_approve') {
        if (($payload['owner_confirmation']??'') !== 'УТВЕРЖДАЮ ПУБЛИКАЦИЮ МАТЕРИАЛА') respond(400,['error'=>'Не получено подтверждение владельца']);
        $read = requestCms('GET','/items/content/'.rawurlencode($id).'?fields=id,path,status,owner_approved_at,h1,seo_title,seo_description,body_html,body_html_safety_status');
        if ($read['status']!==200) errorResponse($read['status']);
        $record=$read['data']['data']??null;
        if (!is_array($record)||($record['status']??'')!=='draft'||($record['owner_approved_at']??null)!==null) respond(409,['error'=>'Материал уже утверждён или не является черновиком']);
        if (empty($record['h1'])||empty($record['seo_title'])||empty($record['seo_description'])) respond(409,['error'=>'Прежде заполните H1 и SEO-описание']);
        if (!empty($record['body_html'])&&($record['body_html_safety_status']??null)!=='reviewed_safe') respond(409,['error'=>'Текст требует отдельной проверки безопасности']);
        // A reviewed page must not contain unverified editorial blocks.
        // Uses the existing content_block_map relation, never a duplicate CMS model.
        $blocks=requestCms('GET','/items/content_block_map?filter%5Bcontent_id%5D%5B_eq%5D='.rawurlencode($id).
            '&fields=id,block_id.id,block_id.fact_checked,block_id.block_type&limit=100');
        if($blocks['status']!==200)errorResponse($blocks['status']);
        $linked=$blocks['data']['data']??[];
        if(!is_array($linked)||count($linked)>80)respond(409,['error'=>'Некорректное количество секций']);
        foreach($linked as $link){
            if(($link['block_id']['fact_checked']??false)!==true)
                respond(409,['error'=>'Нельзя утвердить страницу с непроверенными секциями']);
        }
        $update=requestCms('PATCH','/items/content/'.rawurlencode($id),[
            'status'=>'published','owner_approved_at'=>gmdate('Y-m-d\TH:i:s\Z'),
            'robots_index'=>true,'sitemap_include'=>true
        ]);
        if($update['status']!==200)errorResponse($update['status']);
        respond(200,['approved'=>true,'live'=>false,'message'=>'Материал утверждён в Directus. На рабочем сайте ничего не изменилось. Далее подготовьте проверочную сборку.']);
    }
    $item = approvedItem($id);
    $goLive = $action === 'publish_release';
    if ($goLive && ($payload['owner_confirmation']??'')!=='ПРОВЕРИЛ ПРЕДПРОСМОТР И ПОДТВЕРЖДАЮ') {
        respond(400,['error'=>'Сначала проверьте предварительный выпуск и подтвердите его']);
    }
    $sha = ownerSourceSha($config);
    $previewRun = 0;
    if ($goLive) {
        // Publish only the exact successful preview requested in THIS admin
        // session for THIS item, path and immutable Git source. No implicit
        // rebuild of Directus content is ever authorized.
        if (($_SESSION['aeroventa_preview_item']??null)!==$id ||
            ($_SESSION['aeroventa_preview_path']??null)!==$item['path'] ||
            ($_SESSION['aeroventa_preview_source_sha']??null)!==$sha) {
            respond(409,['error'=>'Для этого материала и версии кода сначала выполните отдельный предпросмотр']);
        }
        $previewRun=(int)($_SESSION['aeroventa_preview_run_id']??0);
        $submitted=(string)($payload['preview_run_id']??'');
        if ($previewRun<=0 && preg_match('/^[1-9][0-9]{5,14}$/D',$submitted)) {
            $previewRun=(int)$submitted;
        }
        if ($previewRun<=0) respond(409,['error'=>'Нет проверяемого номера успешного предпросмотра GitHub; введите номер его запуска']);
        $run=githubCall('GET','/repos/XandXander/aeroventa/actions/runs/'.$previewRun,null,$config);
        $r=$run['data'];
        if ($run['status']!==200 || ($r['conclusion']??null)!=='success' ||
            ($r['status']??null)!=='completed' || ($r['event']??null)!=='workflow_dispatch' ||
            ($r['head']['sha']??$r['head_sha']??null)!==$sha ||
            ($r['head_branch']??null)!=='aeroventa/hiend-seo-owner-recovery-2026-10-13' ||
            ($r['name']??null)!=='AEROVENTA - manually approved CMS-to-live release') {
            respond(409,['error'=>'Указанный GitHub запуск не является успешным предпросмотром текущей версии']);
        }
        $jobs=githubCall('GET','/repos/XandXander/aeroventa/actions/runs/'.$previewRun.'/jobs',null,$config);
        if ($jobs['status']!==200) respond(502,['error'=>'Не удалось проверить состав проверочной сборки']);
        $hasPreview=false;
        foreach (($jobs['data']['jobs']??[]) as $job) {
            if (($job['name']??'')==='preview-build' && ($job['conclusion']??'')==='success') $hasPreview=true;
            if (($job['name']??'')==='publish-to-beget' && ($job['conclusion']??'')!=='skipped') {
                respond(409,['error'=>'Запуск не является отдельной проверочной сборкой']);
            }
        }
        if (!$hasPreview) respond(409,['error'=>'Не подтверждена успешная отдельная проверочная сборка']);
    }
    $dispatch = githubCall('POST', '/repos/XandXander/aeroventa/actions/workflows/pr12-cms-live-publish.yml/dispatches', [
        'ref'=>'aeroventa/hiend-seo-owner-recovery-2026-10-13', 'return_run_details'=>true, 'inputs'=>[
            'approved_paths'=>$item['path'],
            'go_live'=>$goLive?'true':'false',
            'confirm_source_sha'=>$sha,
            'preview_run_id'=>$goLive ? (string)$previewRun : ''
        ]
    ], $config);
    if (!in_array($dispatch['status'],[200,204],true)) {
        error_log('[AEROVENTA Publisher] GitHub workflow dispatch HTTP '.$dispatch['status']);
        respond(502,['error'=>'GitHub не принял запуск выпуска. Сайт не изменён.']);
    }
    $runId=(int)($dispatch['data']['workflow_run_id']??0);
    if (!$goLive) {
        $_SESSION['aeroventa_preview_item']=$id;
        $_SESSION['aeroventa_preview_path']=$item['path'];
        $_SESSION['aeroventa_preview_source_sha']=$sha;
        $_SESSION['aeroventa_preview_run_id']=$runId;
    } else {
        $_SESSION['aeroventa_preview_run_id']=$previewRun;
    }
    if ($runId>0) {
        $_SESSION['aeroventa_release_run_id']=$runId;
        $_SESSION['aeroventa_release_go_live']=$goLive;
    }
    respond(202,['accepted'=>true,'live'=>false,'run_id'=>$runId ?: null,'source_sha'=>$sha,
        'preview_run_id'=>$goLive?$previewRun:$runId,
        'message'=>$goLive?'Запуск публикации принят. Дождитесь подтверждённого результата GitHub Actions и проверки сайта.':'Проверочная Astro-сборка запрошена. Сайт не меняется.',
        'workflow'=>'https://github.com/XandXander/aeroventa/actions/workflows/pr12-cms-live-publish.yml']);
}
