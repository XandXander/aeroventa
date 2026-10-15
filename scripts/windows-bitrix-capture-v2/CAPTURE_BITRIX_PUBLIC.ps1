param([switch]$SelfTest)
# AEROVENTA public Bitrix GET-only capture. Windows PowerShell 5.1; no login, no mutation.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
$pathsFile=Join-Path $root 'routes.txt'
if(!(Test-Path -LiteralPath $pathsFile)){throw "routes.txt is missing"}
$routes=@(Get-Content -LiteralPath $pathsFile -Encoding UTF8 | Where-Object { $_ -match '^/' })
if($routes.Count -ne 29){throw "Expected exactly 29 routes, found $($routes.Count)"}
if($routes -notcontains '/'){throw "Home route missing"}
if(@($routes | Select-Object -Unique).Count -ne 29){throw "Duplicate route found"}
if($SelfTest){Write-Host "SELFTEST PASS: 29 unique public HTML routes, no request sent.";exit 0}
$stamp=Get-Date -Format 'yyyyMMdd_HHmmss'
$work=Join-Path $root ("CAPTURE_WORK_"+$stamp)
$diag=Join-Path $work 'diagnostics'
New-Item -ItemType Directory -Path $diag -Force | Out-Null
$script:base='https://aeroventa.ru'
$script:curlPath=$null
$records=New-Object 'System.Collections.Generic.List[object]'
$issues=New-Object 'System.Collections.Generic.List[object]'
$media=New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
$expectedPdf='/upload/medialibrary/fa1/fa1b840c9474c6030bf2ccb0c725c3e4.pdf'
$limitHtml=3000000
$limitMedia=12582912
$maxMedia=400
$exitCode=0
$connectOkay=$false
$rootHtmlFile=Join-Path $work 'raw\html\002.html'
function Save-Fetch {
  param([string]$Url,[string]$Dest,[int]$MaxSize,[string]$Code)
  $parentDir=Split-Path -Parent $Dest
  New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
  $errFile=Join-Path $diag ($Code+'.stderr.txt')
  $args=@('--silent','--show-error','--fail','--location','--max-redirs','3','--connect-timeout','7','--max-time','18','--retry','0','--max-filesize',[string]$MaxSize,'--proto','=https','--proto-redir','=https','--output',$Dest,'--write-out','%{http_code}|%{url_effective}|%{size_download}','--header','User-Agent: AEROVENTA-Owner-Public-Source-Capture/2.0',$Url)
  $prior=$ErrorActionPreference
  try {
    $ErrorActionPreference='Continue'
    $answer=@(& $script:curlPath @args 2> $errFile)
    $statusCode=$LASTEXITCODE
  } finally {$ErrorActionPreference=$prior}
  $metadata=[string]($answer -join '')
  $stderrText=''
  if(Test-Path -LiteralPath $errFile){$stderrText=[string](Get-Content -LiteralPath $errFile -Raw -ErrorAction SilentlyContinue)}
  if($statusCode -ne 0 -or !(Test-Path -LiteralPath $Dest)){
    throw ("curl_exit="+$statusCode+" metadata="+$metadata+" stderr="+$stderrText.Trim())
  }
  $m=[regex]::Match($metadata,'^(\d{3})\|(https://[^|]+)\|(\d+)$')
  if(!$m.Success){throw "Unexpected curl status: $metadata"}
  $http=[int]$m.Groups[1].Value
  $effective=[uri]$m.Groups[2].Value
  if($http -ne 200){throw "HTTP "+$http}
  if($effective.Scheme -ne 'https' -or $effective.Host -notin @('aeroventa.ru','www.aeroventa.ru')){throw "Redirect left authorized website"}
  $length=(Get-Item -LiteralPath $Dest).Length
  if($length -lt 20 -or $length -gt $MaxSize){throw "Invalid file length "+$length}
  return [pscustomobject]@{http=$http;bytes=$length;sha256=(Get-FileHash -LiteralPath $Dest -Algorithm SHA256).Hash.ToLowerInvariant();final_url=$effective.AbsoluteUri}
}
function Add-MediaRefs {
  param([string]$Html)
  $pattern='(?i)\b(?:src|href|data-src)\s*=\s*["'']([^"'']+)["'']'
  $baseUri=[uri]$script:base
  foreach($m in [regex]::Matches($Html,$pattern)){
    $raw=[string]$m.Groups[1].Value
    if($raw.StartsWith('data:') -or $raw.StartsWith('javascript:')){continue}
    try{$u=[uri]::new($baseUri,$raw)}catch{continue}
    if($u.Scheme -ne 'https' -or $u.Host -notin @('aeroventa.ru','www.aeroventa.ru')){continue}
    $p=[uri]::UnescapeDataString($u.AbsolutePath)
    if(!$p.StartsWith('/upload/') -or $p -match '\.\.|\\|:' -or $p -notmatch '(?i)\.(jpg|jpeg|png|webp|gif|svg|pdf)$'){continue}
    [void]$media.Add($p)
  }
  foreach($m in [regex]::Matches($Html,'(?i)\bsrcset\s*=\s*["'']([^"'']+)["'']')){
    foreach($part in ($m.Groups[1].Value -split ',')){
      $raw=($part.Trim() -split '\s+')[0]
      try{$u=[uri]::new($baseUri,$raw)}catch{continue}
      if($u.Scheme -ne 'https' -or $u.Host -notin @('aeroventa.ru','www.aeroventa.ru')){continue}
      $p=[uri]::UnescapeDataString($u.AbsolutePath)
      if($p.StartsWith('/upload/') -and $p -notmatch '\.\.|\\|:' -and $p -match '(?i)\.(jpg|jpeg|png|webp|gif|svg|pdf)$'){[void]$media.Add($p)}
    }
  }
}
function Log-Issue {
  param([string]$Path,[string]$Message)
  $issues.Add([pscustomobject]@{path=$Path;error=$Message.Substring(0,[Math]::Min($Message.Length,600))})|Out-Null
  Write-Host ("FAIL "+$Path+" : "+$Message.Substring(0,[Math]::Min($Message.Length,160)))
}
Write-Host "AEROVENTA source capture V2 -- public GET requests only"
Write-Host "Checking current website transport BEFORE scanning 29 pages..."
try{
  $cmd=Get-Command curl.exe -ErrorAction Stop
  $script:curlPath=$cmd.Source
}catch{Log-Issue 'curl.exe' 'Windows curl.exe not installed or inaccessible';$exitCode=2}
if($script:curlPath){
  foreach($hostName in @('aeroventa.ru','www.aeroventa.ru')){
    $probeUrl='https://'+$hostName+'/'
    try{
      $response=Save-Fetch -Url $probeUrl -Dest $rootHtmlFile -MaxSize $limitHtml -Code ('PROBE_'+$hostName)
      $html=[IO.File]::ReadAllText($rootHtmlFile)
      if($html -notmatch '(?i)<html\b'){throw 'GET returned non-HTML'}
      $script:base='https://'+$hostName
      $connectOkay=$true
      Write-Host ("PROBE PASS: "+$probeUrl+" bytes="+$response.bytes)
      break
    }catch{Log-Issue $probeUrl ([string]$_.Exception.Message)}
  }
}
if(!$connectOkay){
  Write-Host "STOP: Public Bitrix is unreachable using curl.exe. Skipping all 29 requests."
  $exitCode=2
}else{
  $i=0
  foreach($route in $routes){
    $i++
    $dest=Join-Path $work ('raw\html\'+('{0:D3}' -f $i)+'.html')
    try{
      if($route -eq '/'){
        Copy-Item -LiteralPath $rootHtmlFile -Destination $dest -Force
        $response=[pscustomobject]@{http=200;bytes=(Get-Item $dest).Length;sha256=(Get-FileHash $dest -Algorithm SHA256).Hash.ToLowerInvariant();final_url=$script:base+'/'}
      }else{
        $response=Save-Fetch -Url ($script:base+$route) -Dest $dest -MaxSize $limitHtml -Code ('HTML_'+('{0:D3}' -f $i))
      }
      $html=[IO.File]::ReadAllText($dest)
      if($html -notmatch '(?i)<html\b'){throw 'GET did not produce an HTML document'}
      Add-MediaRefs $html
      $records.Add([pscustomobject]@{kind='HTML';path=$route;file=('raw/html/'+('{0:D3}' -f $i)+'.html');bytes=$response.bytes;sha256=$response.sha256;final_url=$response.final_url})|Out-Null
      Write-Host ("HTML "+$i+"/29 OK "+$route)
    }catch{
      Log-Issue $route ([string]$_.Exception.Message)
      $exitCode=2
    }
  }
  [void]$media.Add($expectedPdf)
  if($media.Count -gt $maxMedia){
    Log-Issue 'MEDIA' ("Too many distinct referenced assets: "+$media.Count)
    $exitCode=2
  }else{
    $n=0
    foreach($urlPath in @($media | Sort-Object)){
      $n++
      $dest=Join-Path $work ('raw\media'+$urlPath.Replace('/','\'))
      try{
        $response=Save-Fetch -Url ($script:base+$urlPath) -Dest $dest -MaxSize $limitMedia -Code ('MEDIA_'+('{0:D4}' -f $n))
        $records.Add([pscustomobject]@{kind='MEDIA';path=$urlPath;file=('raw/media'+$urlPath);bytes=$response.bytes;sha256=$response.sha256;final_url=$response.final_url})|Out-Null
        Write-Host ("MEDIA "+$n+"/"+$media.Count+" OK "+$urlPath)
      }catch{Log-Issue $urlPath ([string]$_.Exception.Message);$exitCode=2}
    }
  }
}
$htmlCaptured=@($records | Where-Object {$_.kind -eq 'HTML'}).Count
$mediaCaptured=@($records | Where-Object {$_.kind -eq 'MEDIA'}).Count
$status='INCOMPLETE_SOURCE_CAPTURE'
if($connectOkay -and $htmlCaptured -eq 29 -and $mediaCaptured -eq $media.Count -and $issues.Count -eq 0){$status='SOURCE_BYTES_CAPTURED'}
$report=[ordered]@{
  status=$status
  read_only=$true
  run_at=(Get-Date).ToString('o')
  website=$script:base
  html_expected=29
  html_captured=$htmlCaptured
  media_expected=$media.Count
  media_captured=$mediaCaptured
  errors=@($issues)
  files=@($records)
  caveat='Current public website capture; not proof of the sealed 2026-08-16 Bitrix backup.'
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $work 'capture-report.json') -Encoding UTF8
$zipName='AEROVENTA_BITRIX_PUBLIC_RETURN_'+$stamp+'.zip'
$zipPath=Join-Path $root $zipName
try{
  Compress-Archive -Path (Join-Path $work '*') -DestinationPath $zipPath -CompressionLevel Optimal -Force
  Write-Host ("RESULT "+$status+" | HTML "+$htmlCaptured+"/29 | MEDIA "+$mediaCaptured+"/"+$media.Count)
  Write-Host ("Attach ZIP: "+$zipPath)
}catch{
  Write-Host ("ERROR building ZIP: "+[string]$_.Exception.Message)
  $exitCode=3
}
if($status -ne 'SOURCE_BYTES_CAPTURED'){$exitCode=2}
exit $exitCode
