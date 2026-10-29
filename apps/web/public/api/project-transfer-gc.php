<?php
/** Beget CronTab: /usr/local/bin/php8.3 ~/aeroventa.ru/public_html/api/project-transfer-gc.php */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
// The API PHP entry point is intentionally not included, since it dispatches HTTP actions.
$root = getenv('AEROVENTA_PROJECT_PRIVATE_ROOT') ?: dirname(__DIR__,2).'/.aeroventa-project-uploads';
if (!is_dir($root) || is_link($root)) exit(0);
$deleted = 0;
foreach (scandir($root) ?: [] as $id) {
    if (!preg_match('/^[a-f0-9]{32}$/D',$id) || is_link($root.'/'.$id) || !is_dir($root.'/'.$id)) continue;
    $dir=$root.'/'.$id;$path=$dir.'/state.json';
    $fh=@fopen($path,'c+b');
    if (!$fh || !flock($fh,LOCK_EX|LOCK_NB)) {if($fh)fclose($fh);continue;}
    $state=json_decode((string)stream_get_contents($fh),true);
    if (is_array($state) && time()<(int)($state['expires']??0)) {flock($fh,LOCK_UN);fclose($fh);continue;}
    flock($fh,LOCK_UN);fclose($fh);
    foreach(scandir($dir)?:[] as $file){if($file==='.'||$file==='..')continue;$target=$dir.'/'.$file;if(is_file($target)&&!is_link($target))@unlink($target);}
    if(@rmdir($dir))$deleted++;
}
echo "AEROVENTA cleaned {$deleted} expired uploads\n";
