#!/usr/bin/env node
/**
 * AEROVENTA bounded, explicitly authorized manual restore of one successful
 * selective release. Requires its immutable preview and deployment receipt.
 * Never changes a different site, schema, shared VPS or private configuration.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const sha=b=>createHash('sha256').update(b).digest('hex');
const root=path.resolve('release_out/approved-astro');
const fileOK=/^(?:(?:[a-z0-9-]+\/)*index\.html|sitemap\.xml)$/;
const idOK=/^[a-f0-9]{12}-[a-f0-9]{8}$/;
function validate(m,r,e){
 if(!m||m.format!=='aeroventa-astro-selective-approved-release-v1'||m.mode!=='REVIEW_ONLY_NO_DEPLOY')
   throw Error('Unrecognized immutable release manifest');
 if(!r||r.format!=='aeroventa-ftp-transaction-receipt-v1'||r.status!=='DEPLOY_PASS')
   throw Error('A successful original deployment receipt is required');
 if(!/^[a-f0-9]{40}$/.test(m.source_sha)||m.source_sha!==r.sha||
    e.AEROVENTA_RESTORE_SOURCE_SHA!==r.sha)throw Error('Source/receipt SHA mismatch');
 if(!idOK.test(String(r.release_id))||!r.release_id.startsWith(r.sha.slice(0,12)))
   throw Error('Invalid exact original release id');
 if(e.AEROVENTA_LIVE_ARMED!=='YES_EXPLICIT_OWNER_APPROVAL'||
    e.AEROVENTA_ROLLBACK_CONFIRM!=='ВОССТАНОВИТЬ ПРЕДЫДУЩИЙ ВЫПУСК')
   throw Error('Separate owner-authorized restoration gate missing');
 if(e.BEGET_FTP_SCOPED!=='aeroventa.ru'||e.BEGET_FTP_ROOT!=='/public_html'||
    !e.BEGET_FTP_HOST||!e.BEGET_FTP_USER||!e.BEGET_FTP_PASSWORD)
   throw Error('Site-scoped FTPS not verified');
 if(!Array.isArray(m.files)||m.files.length<1||m.files.length>16||
    new Set(m.files.map(x=>x.path)).size!==m.files.length)throw Error('Unsafe restore file list');
 for(const row of m.files){
   if(!fileOK.test(String(row.path||''))||
      ![row.sha256_before,row.sha256_after].every(x=>/^[a-f0-9]{64}$/.test(String(x)))||
      !r.paths?.some(x=>x.path===row.path&&x.status==='DEPLOYED_VERIFIED'&&x.sha256===row.sha256_after))
      throw Error('Path was not successfully published by original release: '+String(row.path));
 }
 return {release_id:r.release_id,source_sha:r.sha,rows:m.files};
}
async function main(){
 const m=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
 const r=JSON.parse(await readFile('release_out/deploy-receipt.json','utf8'));
 const checked=validate(m,r,process.env);
 const {Client}=await import('basic-ftp');
 const ftp=new Client(30000);
 const scratch=await mkdtemp(path.join(tmpdir(),'aeroventa-restore-'));
 const restoreId='restore-'+randomUUID().slice(0,8);
 const restoreRoot='/__aeroventa_releases/'+checked.release_id+'/manual-'+restoreId;
 const selected=[];const applied=[];
 const report={format:'AEROVENTA_MANUAL_RESTORE_RECEIPT_V1',source_sha:checked.source_sha,
   release_id:checked.release_id,restore_id:restoreId,status:'STARTED',paths:[]};
 const download=async(remote,local,expected)=>{
   await ftp.downloadTo(local,remote);
   const data=await readFile(local);
   if(sha(data)!==expected)throw Error('SHA256 drift at '+remote);
   return data;
 };
 const verifyHttp=async(row,expected,newMissing=false)=>{
   const url=new URL('/'+(row.path.endsWith('index.html')?row.path.slice(0,-10):row.path),'https://aeroventa.ru');
   url.searchParams.set('_avrestore',restoreId);
   for(let i=0;i<4;i++){
     try{
       const response=await fetch(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
       if(newMissing?response.status===404:response.status===200&&sha(Buffer.from(await response.arrayBuffer()))===expected)
         return;
     }catch{}
     await new Promise(resolve=>setTimeout(resolve,1200));
   }
   throw Error('Public HTTP restore readback failed: '+row.path);
 };
 try{
   await ftp.access({host:process.env.BEGET_FTP_HOST,port:Number(process.env.BEGET_FTP_PORT||21),
     user:process.env.BEGET_FTP_USER,password:process.env.BEGET_FTP_PASSWORD,secure:true});
   const ls=await ftp.list('/');
   if(!ls.some(x=>x.name==='public_html'&&x.isDirectory))throw Error('Wrong FTP site scope');
   for(const row of checked.rows){
     const key=sha(row.path).slice(0,16);
     const dest='/public_html/'+row.path;
     const current=path.join(scratch,'current-'+key);
     const original=path.join(scratch,'original-'+key);
     await download(dest,current,row.sha256_after);
     if(row.is_new===true){
       if(row.bytes_before!==0||row.sha256_before!==sha(Buffer.alloc(0)))
         throw Error('Unsafe new-route rollback identity');
       await writeFile(original,Buffer.alloc(0));
     }else{
       const previous='/__aeroventa_releases/'+checked.release_id+'/backup/'+row.path;
       await download(previous,original,row.sha256_before);
     }
     const redo=restoreRoot+'/redo/'+row.path;
     await ftp.ensureDir(path.posix.dirname(redo));
     await ftp.uploadFrom(current,redo);
     const checkRedo=path.join(scratch,'redo-'+key);
     await download(redo,checkRedo,row.sha256_after);
     const stage=restoreRoot+'/original/'+row.path;
     if(row.is_new!==true){
       await ftp.ensureDir(path.posix.dirname(stage));
       await ftp.uploadFrom(original,stage);
       const checkStage=path.join(scratch,'stage-'+key);
       await download(stage,checkStage,row.sha256_before);
     }
     selected.push({row,dest,redo,stage});
   }
   // No production write occurs until every current and original file, plus
   // the private redo copy, has matched the immutable original manifest.
   for(const entry of selected){
     if(entry.row.is_new===true)await ftp.remove(entry.dest);
     else await ftp.rename(entry.stage,entry.dest);
     applied.push(entry);
     await verifyHttp(entry.row,entry.row.sha256_before,entry.row.is_new===true);
     report.paths.push({path:entry.row.path,status:'RESTORED_HTTP_SHA256_VERIFIED'});
   }
   report.status='RESTORE_PASS';
 }catch(error){
   report.status='RESTORE_FAILED_REDO_ATTEMPTED';report.error=String(error.message||error);
   // Revert only changes made during this restore attempt. The saved redo
   // files are exact hashes of the previously published approved candidate.
   for(const entry of applied.reverse()){
     try{
       if(entry.row.is_new===true)await ftp.ensureDir(path.posix.dirname(entry.dest));
       await ftp.rename(entry.redo,entry.dest);
       const local=path.join(scratch,'after-redo-'+sha(entry.row.path).slice(0,16));
       await download(entry.dest,local,entry.row.sha256_after);
       await verifyHttp(entry.row,entry.row.sha256_after);
       report.paths.push({path:entry.row.path,status:'RESTORE_REDO_VERIFIED'});
     }catch(e){
       report.status='CRITICAL_RESTORE_REDO_FAILED';
       report.paths.push({path:entry.row.path,status:'CRITICAL',error:String(e.message)});
     }
   }
   throw error;
 }finally{
   await mkdir(root,{recursive:true});
   await writeFile(path.join(root,'manual-restore-receipt.json'),JSON.stringify(report,null,2)+'\n');
   ftp.close();
   await rm(scratch,{recursive:true,force:true});
 }
 console.log('AEROVENTA_MANUAL_RESTORE_PASS '+checked.release_id+' files='+selected.length);
}
if(process.argv.includes('--self-test')){
 const source='a'.repeat(40),p='blog/detail/example/index.html';
 const m={format:'aeroventa-astro-selective-approved-release-v1',mode:'REVIEW_ONLY_NO_DEPLOY',
   source_sha:source,files:[{path:p,is_new:false,sha256_before:'b'.repeat(64),sha256_after:'c'.repeat(64)}]};
 const r={format:'aeroventa-ftp-transaction-receipt-v1',status:'DEPLOY_PASS',
   sha:source,release_id:'a'.repeat(12)+'-12345678',
   paths:[{path:p,status:'DEPLOYED_VERIFIED',sha256:'c'.repeat(64)}]};
 const e={AEROVENTA_RESTORE_SOURCE_SHA:source,AEROVENTA_LIVE_ARMED:'YES_EXPLICIT_OWNER_APPROVAL',
   AEROVENTA_ROLLBACK_CONFIRM:'ВОССТАНОВИТЬ ПРЕДЫДУЩИЙ ВЫПУСК',
   BEGET_FTP_SCOPED:'aeroventa.ru',BEGET_FTP_ROOT:'/public_html',
   BEGET_FTP_HOST:'localhost',BEGET_FTP_USER:'dummy',BEGET_FTP_PASSWORD:'dummy'};
 validate(m,r,e);
 try{validate({...m,files:[{...m.files[0],path:'../index.php'}]},r,e);throw Error('Path escape accepted');}
 catch(err){if(err.message==='Path escape accepted')throw err;}
 try{validate(m,{...r,status:'STARTED'},e);throw Error('Failed deploy accepted');}
 catch(err){if(err.message==='Failed deploy accepted')throw err;}
 console.log('AEROVENTA_MANUAL_RESTORE_SELF_TEST_PASS (offline; no FTPS writes)');
}else main().catch(e=>{console.error('AEROVENTA_MANUAL_RESTORE_BLOCKED: '+e.message);process.exitCode=1});
