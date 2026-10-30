#!/usr/bin/env node
/**
 * AEROVENTA selective live FTP deployment.
 * Must be run ONLY in a manually approved GitHub Environment after passing
 * source/HTML/visual and owner gates. Never run against the account-wide FTP.
 * Backups/staging sit OUTSIDE public_html on the same site-scoped FTP account.
 * No PHP/.htaccess, deletions or other projects. New SHA-addressed CMS images
 * are uploaded BEFORE HTML; old media is never overwritten.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const digest = b => createHash('sha256').update(b).digest('hex');
const env = process.env;
const HTML_ROOT = '/public_html';
const fileRe = /^(?:(?:[a-z0-9-]+\/)*index\.html|sitemap\.xml)$/;
const mediaRe=/^cms-media\/([a-f0-9]{64})\.(?:png|jpe?g|webp|avif)$/;
const privateRoot = '/__aeroventa_releases';
const root = path.resolve('release_out/approved-astro');
function preflight(m) {
 if(env.AEROVENTA_LIVE_ARMED!=='YES_EXPLICIT_OWNER_APPROVAL')throw Error('Live release is not armed');
 if(env.BEGET_FTP_SCOPED!=='aeroventa.ru')throw Error('FTP must be confined to aeroventa.ru site directory');
 if(env.BEGET_FTP_ROOT!==HTML_ROOT)throw Error('Unexpected FTP document root');
 if(!env.BEGET_FTP_HOST||!env.BEGET_FTP_USER||!env.BEGET_FTP_PASSWORD)throw Error('Missing dedicated Beget FTPS credentials');
 if(!env.GITHUB_SHA || env.OWNER_APPROVED_GITHUB_SHA!==env.GITHUB_SHA)throw Error('Owner has not approved the exact GitHub source SHA');
 if(!m || m.mode!=='REVIEW_ONLY_NO_DEPLOY'||m.format!=='aeroventa-astro-selective-approved-release-v1')throw Error('Untrusted release manifest');
 if(m.source_sha!==env.GITHUB_SHA)throw Error('Manifest is not from the approved source SHA');
 if(!Array.isArray(m.files)||m.files.length<1||m.files.length>16)throw Error('Release size blocked');
 const names=m.files.map(x=>x.path);
 if(new Set(names).size!==names.length||names.some(x=>typeof x!=='string'||!fileRe.test(x)))throw Error('Unsafe or duplicated release filename');
 const newArticles=m.files.filter(x=>x.is_new===true);
 if(newArticles.length){
   if(newArticles.some(x=>!x.path.startsWith('blog/detail/')||
       !x.path.endsWith('/index.html')||
       x.path.split('/').length!==4||
       x.bytes_before!==0||
       x.sha256_before!==digest(Buffer.alloc(0))))
       throw Error('Unsafe new article rollout');
   if(!m.approved_paths?.includes('/blog/')||!m.files.some(x=>x.path==='blog/index.html')||
      !m.files.some(x=>x.path==='sitemap.xml'&&x.is_sitemap))
       throw Error('New route requires linked blog and exact sitemap in same release');
 }

 if(m.files.some(x=>![x.sha256_before,x.sha256_after].every(y=>/^[a-f0-9]{64}$/.test(String(y||'')))))throw Error('Invalid SHA256 manifest');
 if(m.media!==undefined){
   if(!Array.isArray(m.media)||m.media.length>100)throw Error('Invalid CMS media array');
   const names=m.media.map(x=>x.path);
   if(new Set(names).size!==names.length||m.media.some(x=>{
     const match=mediaRe.exec(String(x.path||''));
     return !match||match[1]!==x.sha256_after||!Number.isSafeInteger(x.bytes_after)||
       x.bytes_after<100||x.bytes_after>18*1024*1024;
   }))throw Error('Unsafe media or checksum path');
 }

 return m;
}
async function main(){
 const manifest=preflight(JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8')));
 const ftpModule=await import('basic-ftp');
 const ftp=new ftpModule.Client(30000);
 ftp.ftp.verbose=false;
 const tempDir=await mkdtemp(path.join(tmpdir(),'aeroventa-ftp-release-'));
 const releaseId=env.GITHUB_SHA.slice(0,12)+'-'+randomUUID().slice(0,8);
 const staged=[];const published=[];
 const report={format:'aeroventa-ftp-transaction-receipt-v1',sha:env.GITHUB_SHA,release_id:releaseId,paths:[],status:'STARTED'};
 try{
   await ftp.access({host:env.BEGET_FTP_HOST,port:Number(env.BEGET_FTP_PORT||21),user:env.BEGET_FTP_USER,password:env.BEGET_FTP_PASSWORD,secure:true});
   // An isolated FTP account must expose exactly the one site's public_html.
   const siteList=await ftp.list('/');
   if(!siteList.some(x=>x.name==='public_html'&&x.isDirectory))throw Error('Site-scoped FTP root missing public_html');
   const staging=privateRoot+'/'+releaseId;
   // Check every original *before* uploading or touching any live file.
   for(const row of manifest.files){
     const existing=path.join(tempDir,'old-'+digest(row.path).slice(0,12)+'.html');
     const remote=HTML_ROOT+'/'+row.path;
     if(row.is_new===true){
       try{await ftp.downloadTo(existing,remote);throw Error('New article already exists on FTP: '+row.path)}
       catch(e){
         if(String(e?.code)!=='550')throw e; // A missing file only. All other FTP faults abort.
       }
       await writeFile(existing,Buffer.alloc(0));
     }else{
       await ftp.downloadTo(existing,remote);
     }
     const original=await readFile(existing);
     if(digest(original)!==row.sha256_before)throw Error('Live FTP baseline drift; safe abort for '+row.path);
     const proposed=await readFile(path.join(root,row.path));
     if(digest(proposed)!==row.sha256_after || proposed.equals(original))
       throw Error('Candidate verification failed '+row.path);
     // Backups and candidate staged under a site-private directory, not webroot.
     const remoteBackup=staging+'/backup/'+row.path;
     const remoteStage=staging+'/candidate/'+row.path;
     await ftp.ensureDir(path.posix.dirname(remoteBackup));
     await ftp.uploadFrom(existing,remoteBackup);
     await ftp.ensureDir(path.posix.dirname(remoteStage));
     await ftp.uploadFrom(path.join(root,row.path),remoteStage);
     const backCheck=path.join(tempDir,'verify-back-'+digest(row.path).slice(0,12));
     const candCheck=path.join(tempDir,'verify-new-'+digest(row.path).slice(0,12));
     await ftp.downloadTo(backCheck,remoteBackup);
     await ftp.downloadTo(candCheck,remoteStage);
     if(digest(await readFile(backCheck))!==row.sha256_before || digest(await readFile(candCheck))!==row.sha256_after)throw Error('Uploaded private staging verification failed');
     staged.push({row,remote,remoteBackup,remoteStage});
   }
   // Verify safe overwrite semantics on private probe, never on an existing
   // production file. If this FTP server disallows rename-overwrite, abort.
   const probeDir=privateRoot+'/'+releaseId+'/probe';
   await ftp.ensureDir(probeDir);
   const probeA=path.join(tempDir,'probe-a'),probeB=path.join(tempDir,'probe-b');
   await writeFile(probeA,'AEROVENTA_RENAME_PROBE_A');
   await writeFile(probeB,'AEROVENTA_RENAME_PROBE_B');
   await ftp.uploadFrom(probeA,probeDir+'/from.txt');
   await ftp.uploadFrom(probeB,probeDir+'/to.txt');
   try{
     await ftp.rename(probeDir+'/from.txt',probeDir+'/to.txt');
     const probeCheck=path.join(tempDir,'probe-check');
     await ftp.downloadTo(probeCheck,probeDir+'/to.txt');
     if((await readFile(probeCheck,'utf8'))!=='AEROVENTA_RENAME_PROBE_A')throw Error('FTP rename did not overwrite atomically');
   }catch(e){throw Error('Atomic FTP rename-overwrite not proven: '+e.message);}
   // Immutable new media files are verified BEFORE any HTML change.
   // If a later HTML upload fails, unused media may remain; no existing file
   // is deleted or overwritten. Such orphaned files are not publicly linked.
   if((manifest.media||[]).length){
     await ftp.ensureDir(HTML_ROOT+'/cms-media');
     const existingNames=new Set((await ftp.list(HTML_ROOT+'/cms-media')).map(x=>x.name));
     for(const file of manifest.media){
       const remote=HTML_ROOT+'/'+file.path;
       const local=path.join(root,file.path);
       const bytes=await readFile(local);
       if(digest(bytes)!==file.sha256_after||bytes.length!==file.bytes_after)
         throw Error('CMS media bytes drift '+file.path);
       const basename=path.posix.basename(file.path);
       if(existingNames.has(basename)){
         const present=path.join(tempDir,'present-'+basename);
         await ftp.downloadTo(present,remote);
         if(digest(await readFile(present))!==file.sha256_after)
           throw Error('SHA-addressed CMS image collision '+file.path);
         report.paths.push({path:file.path,status:'MEDIA_ALREADY_PRESENT_HASH_VERIFIED'});
         continue;
       }
       const stagedMedia=staging+'/candidate/'+file.path;
       await ftp.ensureDir(path.posix.dirname(stagedMedia));
       await ftp.uploadFrom(local,stagedMedia);
       const checkMedia=path.join(tempDir,'staged-'+basename);
       await ftp.downloadTo(checkMedia,stagedMedia);
       if(digest(await readFile(checkMedia))!==file.sha256_after)
         throw Error('Private staged image checksum failed '+file.path);
       await ftp.rename(stagedMedia,remote);
       const imageUrl=new URL('/'+file.path,'https://aeroventa.ru');
       imageUrl.searchParams.set('_avrelease',releaseId);
       let readback=false;
       for(let i=0;i<4;i++){
         try{
           const res=await fetch(imageUrl,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
           if(res.status===200&&digest(Buffer.from(await res.arrayBuffer()))===file.sha256_after){readback=true;break}
         }catch{}
         await new Promise(resolve=>setTimeout(resolve,1200));
       }
       if(!readback)throw Error('Public image readback mismatch: '+file.path);
       report.paths.push({path:file.path,sha256:file.sha256_after,status:'NEW_MEDIA_VERIFIED'});
     }
   }
   // Every write is single-file atomic rename, never bulk directory upload.
   for(const entry of staged){
     if(entry.row.is_new===true)await ftp.ensureDir(path.posix.dirname(entry.remote));
     await ftp.rename(entry.remoteStage,entry.remote);
     published.push(entry);
     const url=new URL('/'+entry.row.path.replace(/index\.html$/,''),'https://aeroventa.ru');
     url.searchParams.set('_avrelease',releaseId);
     let verified=false;
     for(let i=0;i<4;i++){
       try{
         const res=await fetch(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
         if(res.status===200&&digest(Buffer.from(await res.arrayBuffer()))===entry.row.sha256_after){verified=true;break;}
       }catch{/* readback retry */}
       await new Promise(resolve=>setTimeout(resolve,1200));
     }
     if(!verified)throw Error('Public readback mismatch after updating '+entry.row.path);
     report.paths.push({path:entry.row.path,sha256:entry.row.sha256_after,status:'DEPLOYED_VERIFIED'});
   }
   report.status='DEPLOY_PASS';
 }catch(error){
   report.status='DEPLOY_FAILED_ROLLBACK_ATTEMPTED';
   report.error=String(error?.message||error);
   // Restore *only* files changed in this run, in reverse order, from the
   // already verified site-private backup. Never delete the live destination.
   for(const entry of published.reverse()){
     try{
       if(entry.row.is_new===true){
         const current=path.join(tempDir,'current-new-'+digest(entry.row.path).slice(0,12));
         await ftp.downloadTo(current,entry.remote);
         if(digest(await readFile(current))!==entry.row.sha256_after)
           throw Error('New article changed since release; deletion blocked');
         await ftp.remove(entry.remote);
         report.paths.push({path:entry.row.path,status:'NEW_ARTICLE_ROLLBACK_REMOVED'});
       }else{
         await ftp.rename(entry.remoteBackup,entry.remote);
         const confirm=path.join(tempDir,'rollback-'+digest(entry.row.path).slice(0,12));
         await ftp.downloadTo(confirm,entry.remote);
         if(digest(await readFile(confirm))!==entry.row.sha256_before)
           throw Error('Rollback checksum mismatch');
         report.paths.push({path:entry.row.path,status:'ROLLBACK_VERIFIED'});
       // FTP readback alone is not proof of public restoration.
       const restorePath='/'+entry.row.path.replace(/index\\.html$/,'');
       const restoredUrl=new URL(restorePath,'https://aeroventa.ru');
       restoredUrl.searchParams.set('_avrollback',releaseId);
       let recovered=false;
       for(let check=0;check<4;check++){
         try{
           const response=await fetch(restoredUrl,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
           if(entry.row.is_new===true && response.status===404)recovered=true;
           if(entry.row.is_new!==true && response.status===200 &&
              digest(Buffer.from(await response.arrayBuffer()))===entry.row.sha256_before)recovered=true;
           if(recovered)break;
         }catch{}
         await new Promise(resolve=>setTimeout(resolve,1200));
       }
       if(!recovered)throw Error('Public HTTP rollback readback mismatch '+entry.row.path);
       }
     }catch(rollbackError){
       report.paths.push({path:entry.row.path,status:'CRITICAL_ROLLBACK_UNVERIFIED',error:String(rollbackError.message)});
       report.status='CRITICAL_MANUAL_RESTORE_REQUIRED';
     }
   }
   throw error;
 }finally{
   await writeFile(path.join(root,'deploy-receipt.json'),JSON.stringify(report,null,2)+'\n');
   ftp.close(); await rm(tempDir,{recursive:true,force:true});
 }
 console.log('AEROVENTA_DEPLOY_PASS '+releaseId+' files='+report.paths.length);
}
if(process.argv.includes('--self-test')){
 const old={format:'aeroventa-astro-selective-approved-release-v1',mode:'REVIEW_ONLY_NO_DEPLOY',source_sha:'a'.repeat(40),files:[{path:'blog/detail/test/index.html',sha256_before:'b'.repeat(64),sha256_after:'c'.repeat(64)}]};
 const saved={...env};Object.assign(env,{AEROVENTA_LIVE_ARMED:'YES_EXPLICIT_OWNER_APPROVAL',BEGET_FTP_SCOPED:'aeroventa.ru',BEGET_FTP_ROOT:'/public_html',BEGET_FTP_HOST:'localhost',BEGET_FTP_USER:'dummy',BEGET_FTP_PASSWORD:'dummy',GITHUB_SHA:'a'.repeat(40),OWNER_APPROVED_GITHUB_SHA:'a'.repeat(40)});
 preflight(old);
 try{preflight({...old,files:[{...old.files[0],path:'../index.php'}]});throw Error('Traversal accepted');}catch(e){if(e.message==='Traversal accepted')throw e;}
 try{preflight({...old,source_sha:'0'.repeat(40)});throw Error('Wrong SHA accepted');}catch(e){if(e.message==='Wrong SHA accepted')throw e;}
 Object.keys(env).forEach(k=>{if(!(k in saved))delete env[k]});Object.assign(env,saved);
 console.log('AEROVENTA_FTPS_SELF_TEST_PASS (no FTP/network connection)');
} else {
 main().catch(e=>{console.error('AEROVENTA_DEPLOY_BLOCKED: '+e.message);process.exitCode=1});
}
