"""Deterministic fixture staging ZIP; exclude host auth and bind every file to source."""
import hashlib,json,re,subprocess,sys,zipfile
from pathlib import Path

def seal(dist,target,sha):
    assert re.fullmatch('[0-9a-f]{40}',sha)
    assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==sha
    assert (dist/'index.html').is_file() and (dist/'404.html').is_file()
    files=[]
    for p in sorted(dist.rglob('*')):
        if not p.is_file():continue
        assert not p.is_symlink(),str(p)
        rel=p.relative_to(dist).as_posix()
        if any(s in {'.htaccess','.htpasswd','.git','node_modules'} or s.startswith('.env') for s in p.relative_to(dist).parts):continue
        if p.suffix.lower() in {'.md','.csv','.log','.zip','.dpapi','.ts','.astro','.yaml','.yml'}:continue
        b=p.read_bytes()
        if p.suffix=='.html' and not re.search(r'http-equiv=["\']refresh',b.decode(),re.I):
            if rel!='404.html':assert 'name="aeroventa:source" content="'+sha+'"' in b.decode(),rel
            assert re.search(r'name="robots"\s+content="noindex',b.decode()),rel
        files.append({'path':rel,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
    assert (dist/'robots.txt').read_text().strip()=='User-agent: *\nDisallow: /'
    assert '<loc>' not in (dist/'sitemap.xml').read_text()
    marker=json.dumps({'source_sha':sha,'mode':'fixture-staging-only','release':'HOLD','installed_staging_sha':'NOT_ASSERTED'},indent=2).encode()
    files.append({'path':'aeroventa-build.json','bytes':len(marker),'sha256':hashlib.sha256(marker).hexdigest()})
    manifest={'source_sha':sha,'mode':'fixture-staging-only','release':'HOLD','runtime_files':files,
              'guards':['Preserve existing staging .htaccess and .htpasswd','Never install over production Bitrix','No Directus-backed build or recipient receipt claimed','Deployment requires separate Owner authorization'],
              'gates':{'staging_verified':False,'owner_accepted':False,'production_verified':False}}
    mb=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
    target.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
        for item in files+[{'path':'AEROVENTA_STAGE_MANIFEST.json'}]:
            b=mb if item['path']=='AEROVENTA_STAGE_MANIFEST.json' else marker if item['path']=='aeroventa-build.json' else (dist/item['path']).read_bytes()
            info=zipfile.ZipInfo(item['path'],date_time=(2026,10,27,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
            z.writestr(info,b,compresslevel=6)
    with zipfile.ZipFile(target) as z:
        assert z.testzip() is None
        assert len(z.namelist())==len(files)+1
        for item in files:
            b=z.read(item['path']);assert len(b)==item['bytes'] and hashlib.sha256(b).hexdigest()==item['sha256'],item['path']
        assert json.loads(z.read('AEROVENTA_STAGE_MANIFEST.json'))==manifest
    return {'files':files,'zip_sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'zip_bytes':target.stat().st_size,'crc':'PASS','reextracted_payload_hashes':'PASS','preserve_existing_staging_auth':True,'internal_manifest':'AEROVENTA_STAGE_MANIFEST.json'}
if __name__=='__main__':print(json.dumps(seal(Path(sys.argv[1]),Path(sys.argv[2]),sys.argv[3])))
