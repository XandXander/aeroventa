<?php
declare(strict_types=1);
/* AEROVENTA: private project files by direct same-origin email transport.
   Never publish uploads in the document root, never forward to a third party. */
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
function respond(int $status,string $error=''): never {
  http_response_code($status);
  echo json_encode($error===''?['ok'=>true,'status'=>'mta_accepted_not_delivered']:['ok'=>false,'error'=>$error],JSON_UNESCAPED_UNICODE);
  exit;
}
if(($_SERVER['REQUEST_METHOD']??'')!=='POST'){header('Allow: POST');respond(405,'method_not_allowed');}
if(!str_starts_with(strtolower((string)($_SERVER['CONTENT_TYPE']??'')),'multipart/form-data;'))respond(415,'multipart_required');
$origin=trim((string)($_SERVER['HTTP_ORIGIN']??''));
$referer=trim((string)($_SERVER['HTTP_REFERER']??''));
if($origin===''&&$referer==='')respond(403,'origin_required');
foreach([$origin,$referer] as $url){
  if($url==='')continue;
  $parsed=parse_url($url);
  if($parsed===false||!in_array(strtolower((string)($parsed['host']??'')),['aeroventa.ru','www.aeroventa.ru','staging.aeroventa.ru'],true)
    ||strtolower((string)($parsed['scheme']??''))!=='https'||(isset($parsed['port'])&&(int)$parsed['port']!==443))respond(403,'origin_rejected');
}
if(isset($_SERVER['HTTP_SEC_FETCH_SITE'])&&!in_array($_SERVER['HTTP_SEC_FETCH_SITE'],['same-origin','none'],true))respond(403,'cross_site_rejected');
if((int)($_SERVER['CONTENT_LENGTH']??0)>12582912)respond(413,'request_too_large');
function field(string $key,int $max,bool $required=false): string {
  $v=$_POST[$key]??'';
  if(!is_string($v))respond(422,'invalid_field');
  $v=trim(str_replace(["\r","\n","\0"],' ',$v));
  if(($required&&$v==='')||(function_exists('mb_strlen')?mb_strlen($v,'UTF-8'):strlen($v))>$max)respond(422,'invalid_field');
  return $v;
}
$name=field('name',80,true);
$contact=field('contact',160,true);
$task=field('task',3000,true);
$source=field('source_page',300);
$trap=field('website',100);
if($trap!=='')respond(422,'invalid_submission');
if(($_POST['consent']??'')!=='on')respond(422,'consent_required');
$started=field('started_at',20,true);
if(preg_match('/^[0-9]+$/D',$started)!==1)respond(422,'invalid_start');
$elapsed=(int)floor(microtime(true)*1000)-(int)$started;
if($elapsed<900||$elapsed>86400000)respond(422,'invalid_start');
$email=filter_var($contact,FILTER_VALIDATE_EMAIL);
if($email===false){
  $digits=preg_replace('/\D/','',$contact);
  if(!preg_match('/^\+?[0-9 ()\t.\-]+$/D',$contact)||strlen((string)$digits)<10||strlen((string)$digits)>15)respond(422,'invalid_contact');
}
$to=trim((string)getenv('AEROVENTA_LEAD_TO'));
$from=trim((string)getenv('AEROVENTA_LEAD_FROM'));
if(strcasecmp($to,'office@aeroventa.ru')!==0||filter_var($from,FILTER_VALIDATE_EMAIL)===false||
  strtolower(substr(strrchr($from,'@')?:'',1))!=='aeroventa.ru')respond(503,'mailbox_unconfigured');
$files=$_FILES['documents']??null;
if(!is_array($files)||!isset($files['name'])||!is_array($files['name']))respond(422,'files_required');
$count=count($files['name']);
if($count<1||$count>3)respond(422,'file_count_invalid');
$allowed=['pdf','dwg','dxf','zip','jpg','jpeg','png'];
$parts=[];$names=[];$fileHashes=[];$total=0;
if(!class_exists(finfo::class))respond(503,'file_validation_unavailable');
$mime=new finfo(FILEINFO_MIME_TYPE);
for($i=0;$i<$count;$i++){
  $error=$files['error'][$i]??UPLOAD_ERR_NO_FILE;
  $size=$files['size'][$i]??0;
  $tmp=$files['tmp_name'][$i]??'';
  $original=$files['name'][$i]??'';
  if($error!==UPLOAD_ERR_OK||!is_int($size)||$size<=0||$size>4194304||
    !is_string($tmp)||!is_uploaded_file($tmp)||!is_string($original))respond(422,'invalid_file');
  $total+=$size;
  if($total>8388608)respond(413,'files_too_large');
  $ext=strtolower(pathinfo($original,PATHINFO_EXTENSION));
  if(!in_array($ext,$allowed,true))respond(415,'file_type_rejected');
  $actual=(string)$mime->file($tmp);
  $first=file_get_contents($tmp,false,null,0,48);
  if(!is_string($first)||$first==='')respond(415,'file_type_rejected');
  $valid=match($ext){
    'pdf'=>$actual==='application/pdf'&&str_starts_with($first,'%PDF-'),
    'png'=>$actual==='image/png'&&str_starts_with($first,"\x89PNG\r\n\x1a\n"),
    'jpg','jpeg'=>$actual==='image/jpeg'&&str_starts_with($first,"\xff\xd8\xff"),
    'zip'=>in_array($actual,['application/zip','application/x-zip','application/octet-stream'],true)&&str_starts_with($first,"PK\x03\x04"),
    'dwg'=>preg_match('/^AC10[0-9]{2}/',$first)===1,
    'dxf'=>in_array($actual,['text/plain','application/dxf','application/octet-stream'],true)&&preg_match('/^\s*0\r?\nSECTION/i',$first)===1,
    default=>false
  };
  if(!$valid)respond(415,'file_type_rejected');
  if($ext==='zip'){
    if(!class_exists(ZipArchive::class))respond(503,'zip_validation_unavailable');
    $zip=new ZipArchive();
    if($zip->open($tmp)!==true)respond(415,'zip_invalid');
    if($zip->numFiles>120){$zip->close();respond(415,'zip_entry_limit');}
    $expanded=0;
    for($j=0;$j<$zip->numFiles;$j++){
      $st=$zip->statIndex($j);
      if(!is_array($st)||preg_match('~(^/|(^|/)\.\.(/|$)|\\\\)~',(string)($st['name']??''))||
        (($st['encryption_method']??0)!==0)){$zip->close();respond(415,'zip_invalid');}
      $expanded+=(int)($st['size']??0);
      if($expanded>33554432){$zip->close();respond(415,'zip_expansion_limit');}
    }
    $zip->close();
  }
  $safeName=preg_replace('/[^\p{L}\p{N} ._()\-]/u','_',substr($original,0,100));
  $names[]=$safeName?:'project-file';
  $bytes=file_get_contents($tmp);
  if(!is_string($bytes)||strlen($bytes)!==$size)respond(503,'file_read_failed');
  $fileHashes[]=hash('sha256',$bytes);
  $parts[]=['name'=>sprintf('project-%02d.%s',$i+1,$ext),'mime'=>$actual,'encoded'=>chunk_split(base64_encode($bytes),76,"\r\n")];
}
$ip=(string)($_SERVER['REMOTE_ADDR']??'');
$rateFile=sys_get_temp_dir().DIRECTORY_SEPARATOR.'aeroventa-project-'.substr(hash('sha256',__FILE__.'|'.$ip),0,40).'.json';
$h=@fopen($rateFile,'c+');
if($h===false||!flock($h,LOCK_EX))respond(503,'rate_unavailable');
$events=json_decode(stream_get_contents($h)?:'[]',true);
$events=is_array($events)?array_values(array_filter($events,static fn($e)=>is_array($e)&&is_int($e['t']??null)&&$e['t']>=time()-600)):[];
if(count($events)>=3){flock($h,LOCK_UN);fclose($h);respond(429,'rate_limited');}
$fp=hash('sha256',$contact."\n".$task."\n".implode('|',$names)."\n".implode('|',$fileHashes));
foreach($events as $event){
  if(($event['h']??'')===$fp&&time()-$event['t']<120){flock($h,LOCK_UN);fclose($h);respond(409,'duplicate_submission');}
}
$events[]=['t'=>time(),'h'=>$fp];
rewind($h);ftruncate($h,0);
$written=fwrite($h,json_encode($events));
$flushed=fflush($h);
if($written===false||!$flushed){flock($h,LOCK_UN);fclose($h);respond(503,'rate_unavailable');}
// Serialize send/retry under the existing lock. Only an accepted message
// remains deduplicated; revised file bytes are a distinct submission.
$boundary='AVPROJECT'.bin2hex(random_bytes(18));
$text=implode("\n",['Проектная документация AEROVENTA','Имя: '.$name,'Контакт: '.$contact,
  'Задача: '.$task,'Страница: '.$source,'Файлы: '.implode(', ',$names),
  'Внимание: принятие локальным MTA не подтверждает доставку адресату.']);
$body="--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n".
  chunk_split(base64_encode($text),76,"\r\n");
foreach($parts as $part){
  $body.="--$boundary\r\nContent-Type: ".$part['mime']."; name=\"".$part['name']."\"\r\n".
    "Content-Disposition: attachment; filename=\"".$part['name']."\"\r\n".
    "Content-Transfer-Encoding: base64\r\n\r\n".$part['encoded'];
}
$body.="--$boundary--\r\n";
$headers=['From: AEROVENTA Website <'.$from.'>','MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="'.$boundary.'"','X-AEROVENTA-Source: project-upload'];
if($email!==false)$headers[]='Reply-To: '.$email;
$subject='=?UTF-8?B?'.base64_encode('AEROVENTA: документация проекта').'?=';
$accepted=@mail($to,$subject,$body,implode("\r\n",$headers));
if(!$accepted){
  array_pop($events);
  rewind($h);ftruncate($h,0);fwrite($h,json_encode($events));fflush($h);
}
flock($h,LOCK_UN);fclose($h);
if(!$accepted)respond(503,'delivery_unavailable');
respond(200);
