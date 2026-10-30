#!/usr/bin/env node
/**
 * Reproducible site-scoped AEROVENTA admin installer artifact.
 * Deliberately does NOT package any live private configuration or public site.
 */
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, cp, rm, stat, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { readAcceptedBlueprint } from './pr12-cms-blueprint-decode.mjs';
import { tmpdir } from 'node:os';
const root=path.resolve(process.env.AEROVENTA_ADMIN_SOURCE_ROOT||'admin/aeroventa-admin');
const out=path.resolve(process.env.AEROVENTA_ADMIN_OUTPUT||'release_out/AEROVENTA_ADMIN_CANONICAL_INSTALL.zip');
const files=[
 'public_html/.htaccess',
 'public_html/index.php',
 'public_html/release-bridge.php',
 'public_html/reviewed-preview.php',
 'public_html/baseline-import.php',
 'public_html/assets/app.js',
 'public_html/assets/app.css',
 'public_html/assets/logo-header-color.svg',
 'public_html/assets/symbol-color.svg',
 'private/accepted-site-cms-blueprint-v1.json',
];
const sha=b=>createHash('sha256').update(b).digest('hex');
const source=String(process.env.GITHUB_SHA||'').match(/^[a-f0-9]{40}$/)?.[0]||null;
function run(exe,args,cwd){const r=spawnSync(exe,args,{cwd,encoding:'utf8',timeout:90000});if(r.status!==0)throw Error(`${exe} failed: ${(r.stderr||r.stdout).slice(0,700)}`);return r.stdout}
if(process.argv.includes('--self-test')){
 if(files.length!==10||files.some(p=>p.includes('..') || (!p.startsWith('public_html/') && p!=='private/accepted-site-cms-blueprint-v1.json')))throw Error('unsafe source allowlist');
 console.log('AEROVENTA_ADMIN_PACKAGER_SELF_TEST_PASS');process.exit(0);
}
const work=await mkdtemp(path.join(tmpdir(),'aeroventa-admin-package-'));
try{
  const rows=[];
  for(const relative of files){
    const abs=path.resolve(root,relative);
    if(!abs.startsWith(root+path.sep))throw Error('path escapes admin');
    const bytes=relative==='private/accepted-site-cms-blueprint-v1.json'?await readAcceptedBlueprint():await readFile(abs);
    if(bytes.length===0||bytes.length>(relative.endsWith('.json')?2_800_000:120000))throw Error('unsafe file size '+relative);
    if(/\.(?:php|js|css)$/.test(relative)){
      const txt=bytes.toString('utf8');
      if(/gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(txt))
        throw Error('Potential embedded credential in '+relative);
    }
    const target=path.join(work,relative);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);
    rows.push({path:relative,bytes:bytes.length,sha256:sha(bytes)});
  }
  // No implicit packing: any extra file is intentionally excluded, including all /private.
  const manifest={format:'AEROVENTA_BRANDED_ADMIN_RELEASE_V1',source_sha:source,
    target:'Beget isolated aeroventa-admin, allowed public_html and one nonsecret private blueprint',does_not_modify:['aeroventa.ru','n8n','Directus schema','private/aeroventa-release-config.php'],
    files:rows};
  await writeFile(path.join(work,'MANIFEST_SHA256.json'),JSON.stringify(manifest,null,2)+'\n');
  const instructions=`AEROVENTA — УСТАНОВКА ЕДИНОГО КОМПЛЕКТА АДМИНКИ\n\n1. Создайте резервную копию ВСЕЙ существующей папки aeroventa-admin, включая private и public_html.\n2. Распакуйте ZIP в существующую папку aeroventa-admin, заменяя только public_html/* и добавляя private/accepted-site-cms-blueprint-v1.json из манифеста.\n3. НЕ удаляйте и НЕ заменяйте aeroventa-admin/private/aeroventa-release-config.php; новый токен, FTP, CMS не создаются.\n4. Откройте https://admin.aeroventa.ru/, войдите, выберите Перенос сайта и выполните единую пакетную миграцию 49 страниц.\n5. Первый выпуск — только после просмотра именно утверждённого Astro-кандидата и подтверждения владельца.\n6. При проблеме восстановите только сохранённую папку aeroventa-admin из резервной копии; не меняйте aeroventa.ru.\n\nВНИМАНИЕ: импорт запускается явной кнопкой владельца, при установке файлов он НЕ происходит и не является подтверждением публикации на Beget.\n`;
  await writeFile(path.join(work,'INSTALL_ADMIN_RU.txt'),instructions);
  await mkdir(path.dirname(out),{recursive:true});
  // Explicit list, fixed order, normalized timestamps for repeatable byte-level artifact.
  const names=[...files,'MANIFEST_SHA256.json','INSTALL_ADMIN_RU.txt'];
  run('zip',['-q','-X','-D','-0',out,...names],work);
  run('unzip',['-tqq',out],work);
  const zip=await readFile(out);
  console.log(JSON.stringify({verdict:'PASS',package:out,sha256:sha(zip),bytes:zip.length,entries:names.length,source_sha:source},null,2));
}finally{await rm(work,{recursive:true,force:true})}
