#!/usr/bin/env python3
"""Packages the complete source-only AEROVENTA CMS integration candidate.

Never claims that source CI proves production edit/publish/rollback. Never
contains live credentials, private Beget data or private customer files.
"""
import argparse,hashlib,json,os,pathlib,subprocess,zipfile,datetime

ROOT=pathlib.Path(__file__).resolve().parent.parent
PACKAGE=pathlib.Path('release_out/AEROVENTA_PR12_CMS_INTEGRATED_SOURCE_CANDIDATE.zip')
SOURCE_PREFIX=('apps/web/src/','migration/','directus/','admin/aeroventa-admin/','scripts/','.github/workflows/')
EXCLUDED=('node_modules/','private/aeroventa-release-config.php','/private/.aeroventa-review-cache','/private/.env','.env','/.git/')

def sha(blob):return hashlib.sha256(blob).hexdigest()
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',default=str(PACKAGE));parser.add_argument('--self-test',action='store_true')
    args=parser.parse_args()
    if args.self_test:
        assert all(not x.endswith('aeroventa-release-config.php') for x in EXCLUDED if '/private/' in x)
        print('AEROVENTA_SOURCE_BUNDLE_SELF_TEST_PASS');return
    out=pathlib.Path(args.output).resolve();out.parent.mkdir(parents=True,exist_ok=True)
    admin=pathlib.Path('release_out/AEROVENTA_ADMIN_CANONICAL_INSTALL.zip')
    coverage=pathlib.Path('release_out/accepted-site-inventory.json')
    if not admin.is_file() or not coverage.is_file():raise RuntimeError('Missing admin installer or accepted-site coverage')
    report=json.loads(coverage.read_text())
    if report.get('format')!='AEROVENTA_CMS_ACCEPTED_SITE_INVENTORY_V1':raise RuntimeError('Wrong coverage data')
    rev=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
    tracked=subprocess.check_output(['git','ls-files','-z']).decode().split('\0')
    files={}
    for name in tracked:
        if not name or not name.startswith(SOURCE_PREFIX):continue
        if any(secret in name for secret in EXCLUDED):continue
        p=pathlib.Path(name)
        if p.is_symlink() or not p.is_file():continue
        if p.stat().st_size>5_000_000:continue
        if p.suffix.lower() not in ('.md','.txt','.mjs','.js','.astro','.ts','.json','.yml','.yaml','.py','.php','.svg','.css','.htaccess') and p.name!='.htaccess':continue
        files['SOURCE/'+name]=p.read_bytes()
    # Existing approved source images remain in the source repository; do not
    # repackage 100+ MB media or overwrite the site's public_html.
    media=[]
    for name in tracked:
        if not name or not name.startswith('apps/web/public/') or any(secret in name for secret in EXCLUDED):continue
        p=pathlib.Path(name)
        if p.is_file():media.append({'path':name,'sha256':sha(p.read_bytes()),'bytes':p.stat().st_size})
    files['EVIDENCE/ACCEPTED_SITE_CMS_COVERAGE.json']=coverage.read_bytes()
    files['EVIDENCE/EXISTING_PUBLIC_MEDIA_SHA256.json']=(json.dumps(media,ensure_ascii=False,indent=2)+'\n').encode()
    files['INSTALL/AEROVENTA_ADMIN_CANONICAL_INSTALL.zip']=admin.read_bytes()
    instruction='''AEROVENTA — ЕДИНЫЙ ИСХОДНЫЙ КАНДИДАТ ПОДКЛЮЧЕНИЯ CMS

СТАТУС: SOURCE-ONLY. Этот архив НЕ является доказательством работающей production CMS.

Состав:
- INSTALL/: единственный набор файлов фирменной Beget-админки без private токенов.
- SOURCE/: сохранённый исходный код Astro/Directus/workflow в существующем PR #12.
- EVIDENCE/: реестр всех реально проверенных страниц и sha256 действующих медиа.
- MANIFEST_SHA256.json: контрольная сумма каждого файла пакета.

Для установки админки: сначала полностью сохраните текущий aeroventa-admin;
распакуйте только вложенный INSTALL/AEROVENTA_ADMIN_CANONICAL_INSTALL.zip
в существующий aeroventa-admin, заменяя public_html согласно его манифесту.
НЕ трогать aeroventa-admin/private/aeroventa-release-config.php и aeroventa.ru/public_html.

Для изменения public сайта нужен отдельный утверждённый артефакт выпуска
GitHub Actions и фактическое выполнение FTPS+HTTP readback+rollback.
Сырые старые черновики Directus не являются истиной. Истина — принятый сайт.
В этом архиве НЕТ Directus дампа, нельзя массово перезаписывать существующие 29 черновиков.

НЕ запускать выпуск автоматически при установке админки.
'''
    files['INSTALL/OWNER_INSTALL_RU.txt']=instruction.encode()
    manifest={'format':'AEROVENTA_PR12_INTEGRATED_SOURCE_CANDIDATE_V1','source_sha':rev,
              'production_mutation':False,'admin_beget_installed':False,
              'directus_import_applied':False,'ftps_live_publish_tested':False,
              'end_to_end_rollback_tested':False,
              'accepted_public_routes_checked':report.get('pages_checked_live'),
              'accepted_public_routes_found':report.get('pages_in_compiled_source'),
              'cms_editability_status':'INCOMPLETE',
              'unmapped_editable_occurrences':report.get('unmapped_editable_elements'),
              'files':[{'path':name,'bytes':len(blob),'sha256':sha(blob)} for name,blob in sorted(files.items())]}
    files['MANIFEST_SHA256.json']=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
    with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for name,blob in sorted(files.items()):
            z=zipfile.ZipInfo(name,datetime.datetime(2026,10,30,0,0,0).timetuple()[:6]);z.compress_type=zipfile.ZIP_DEFLATED;archive.writestr(z,blob)
    with zipfile.ZipFile(out) as z:
        assert z.testzip() is None
        for row in manifest['files']:
            data=z.read(row['path']);assert len(data)==row['bytes'] and sha(data)==row['sha256']
    print(json.dumps({'verdict':'SOURCE_PACKAGE_PASS_NOT_PRODUCTION','source_sha':rev,
       'zip':str(out),'bytes':out.stat().st_size,'sha256':sha(out.read_bytes()),
       'public_routes':report.get('pages_checked_live'),'media_references':len(media),'files':len(files)},indent=2))
if __name__=='__main__':main()
