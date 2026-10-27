"""Offline final-scope evidence: exact baseline parity, source titles and original bytes.
This never claims deployed HTTP semantics, Directus content approval or inbox receipt.
"""
import argparse, csv, hashlib, json, re, subprocess, struct
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit, unquote

ROOT=Path(__file__).resolve().parents[1]
BASE_SHA='a10c14f86d5cc0b046226e530b5cb46ca030ca17'
def digest(b): return hashlib.sha256(b).hexdigest()
def norm(s): return ' '.join(s.split())
class Document(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.title=[]; self.headings=[]; self.main=[]; self.meta={}; self.canonical=None
        self.links=[]; self.images=[]; self.ids=set(); self.schemas=[]; self.stack=[]
        self.in_main=0; self.in_h1=0; self.in_title=False; self.script=None; self.script_text=[]
        self.feed(text)
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if a.get('id'): self.ids.add(a['id'])
        if tag=='main': self.in_main+=1
        if tag=='title': self.in_title=True
        if tag=='h1': self.in_h1+=1; self.headings.append([])
        if tag=='meta': self.meta[a.get('name') or a.get('property')]=a.get('content')
        if tag=='link' and a.get('rel')=='canonical': self.canonical=a.get('href')
        if tag=='a' and a.get('href'): self.links.append(a['href'])
        if tag=='img': self.images.append(a)
        if tag in ('script','style'): self.script=tag; self.script_type=a.get('type'); self.script_text=[]
    def handle_startendtag(self,tag,attrs): self.handle_starttag(tag,attrs)
    def handle_endtag(self,tag):
        if tag=='main': self.in_main-=1
        if tag=='h1': self.in_h1-=1
        if tag=='title': self.in_title=False
        if tag in ('script','style') and self.script:
            if self.script_type=='application/ld+json': self.schemas.append(json.loads(''.join(self.script_text)))
            self.script=None
    def handle_data(self,data):
        if self.script: self.script_text.append(data); return
        if self.in_title: self.title.append(data)
        if self.in_h1: self.headings[-1].append(data)
        if self.in_main: self.main.append(data)
    def snapshot(self):
        return {'title':norm(''.join(self.title)),'description':self.meta.get('description'),
                'canonical':self.canonical,'h1':[norm(''.join(h)) for h in self.headings],
                'json_ld':self.schemas,'main_text_sha256':digest(norm(' '.join(self.main)).encode()),
                'main_image_paths':sorted({i.get('src') for i in self.images if i.get('src','').startswith(('/evidence/','/upload/'))})}

def documents(dist):
    result={}
    for p in sorted(dist.rglob('index.html')):
        s=p.read_text()
        if re.search(r'http-equiv=["\']refresh',s,re.I): continue
        route='/'+p.parent.relative_to(dist).as_posix().strip('./')+'/'
        route=route.replace('//','/')
        result[route]=Document(s)
    return result

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--dist',default='apps/web/dist');ap.add_argument('--snapshot');ap.add_argument('--output',default='FINAL_CONTRACT_QA.json');args=ap.parse_args()
    dist=Path(args.dist).resolve();docs=documents(dist)
    if args.snapshot:
        Path(args.snapshot).write_text(json.dumps({'source_sha':BASE_SHA,'pages':{r:d.snapshot() for r,d in docs.items()}},ensure_ascii=False,indent=2)+'\n');print('BASELINE',len(docs));return
    failures=[];checks=[]
    def check(ok,label,**evidence):
        checks.append({'check':label,'pass':bool(ok),**evidence})
        if not ok: failures.append(label)
    baseline=json.loads((ROOT/'docs/recovery/baseline-contract-20261027.json').read_text())
    check(baseline['source_sha']==BASE_SHA and len(baseline['pages'])==49,'49-page exact baseline source')
    check(set(docs)==set(baseline['pages']),'49 substantive routes preserved',count=len(docs))
    for route,d in docs.items():
        check(d.snapshot()==baseline['pages'].get(route),'SEO/H1/JSON-LD/main copy/photos unchanged: '+route)
        check('noindex' in (d.meta.get('robots') or ''),'Staging noindex: '+route)
        for name in ('og:title','og:description','og:image','og:image:alt','twitter:image','twitter:image:alt'):
            check(bool(d.meta.get(name)),name+': '+route)
        check(d.meta.get('og:image')==d.meta.get('twitter:image'),'OG/Twitter same image: '+route)
        image=urlsplit(d.meta.get('og:image','')).path
        check((dist/image.lstrip('/')).is_file(),'Local contextual social image: '+route,image=image)
    old=json.loads((ROOT/'migration/legacy-page-source-index.json').read_text())
    retained=[x for x in old if x['path'].startswith('/blog/detail/')]
    check(len(retained)==11,'11 retained article title/H1 locks')
    for x in retained:
        d=docs.get(x['path'])
        # Preserve the already implemented Owner correction from 7fedfbb5/JG-06.
        # Restoring the rejected 'Нтфф' typo would itself violate protected scope.
        expected_title=x['title'];expected_h1=x['h1']
        if x['path']=='/blog/detail/ntff-polisan/':
            expected_title='НТФФ «Полисан» — монтаж вентиляции | AEROVENTA';expected_h1='НТФФ «Полисан»'
        check(d is not None and d.snapshot()['title']==expected_title and d.snapshot()['h1']==[expected_h1], 'Retained title + H1: '+x['path'],historical_exact=x['path']!='/blog/detail/ntff-polisan/',approved_correction_commit='7fedfbb5605fe696ddc2826384125dad6d8cc224' if x['path']=='/blog/detail/ntff-polisan/' else None)
    routes=json.loads((ROOT/'migration/route-contract.json').read_text());rules=(dist/'.htaccess').read_text()
    html200=[r for r in routes if r['http_outcome']==200 and not r['path'].startswith('/upload/')]
    check(len(html200)==29 and all(r['path'] in docs for r in html200),'29 retained route destinations and canonicals',http_execution='NOT_CLAIMED; hosting file is a reference, not included in staging ZIP')
    for r in html200: check(docs[r['path']].canonical=='https://aeroventa.ru'+r['path'],'Retained canonical: '+r['path'])
    check(len(re.findall(r'^RedirectMatch 301 ',rules,re.M))==13,'13 generated 301 declarations')
    check(len(re.findall(r'^RedirectMatch gone ',rules,re.M))==54,'54 generated 410 declarations')
    media=json.loads((ROOT/'migration/preserved-media.json').read_text())
    originals=json.loads((ROOT/'migration/bitrix-public-media-500-sha-map.json').read_text())['files']
    pdf=json.loads((ROOT/'migration/indexed-pdf.json').read_text())
    source=json.loads((ROOT/'migration/owner-category-source-media-2026-10-26.json').read_text())['files']
    for group,items in [('8 protected media',media),('500 original Bitrix images',originals),('indexed PDF',[pdf]),('33 category originals',source)]:
        passed=0
        for x in items:
            p=dist/x['path'].lstrip('/');b=p.read_bytes() if p.is_file() else b''
            ok=len(b)==x.get('source_bytes',x.get('bytes',x.get('size'))) and digest(b)==x.get('source_sha256',x.get('sha256'))
            passed+=int(ok)
        check(passed==len(items),group,passed=passed,total=len(items))
    broken=[];link_count=0
    for route,d in docs.items():
        for href in d.links:
            u=urlsplit(urljoin('https://aeroventa.ru'+route,href))
            if u.scheme not in ('http','https') or u.hostname not in ('aeroventa.ru','staging.aeroventa.ru'):continue
            link_count+=1;p=dist/unquote(u.path).lstrip('/')
            if not (p.is_file() or (p/'index.html').is_file()):broken.append({'route':route,'href':href})
    check(not broken,'All internal link targets exist',links=link_count,broken=broken)
    check((dist/'robots.txt').read_text().strip()=='User-agent: *\nDisallow: /','Staging robots disallow')
    check('<loc>' not in (dist/'sitemap.xml').read_text(),'Staging sitemap empty')
    manifest=json.loads((dist/'brand/site.webmanifest').read_text())
    for icon in manifest['icons']:
        b=(dist/icon['src'].lstrip('/')).read_bytes()
        check(b[:8]==b'\x89PNG\r\n\x1a\n' and 'x'.join(map(str,struct.unpack('>II',b[16:24])))==icon['sizes'],'PWA icon exact dimensions: '+icon['src'])
    ico=(dist/'brand/favicon.ico').read_bytes()
    check(struct.unpack('<HHH',ico[:6])==(0,1,2),'ICO contains two real image entries')
    coverage=json.loads((ROOT/'docs/recovery/final-scope-verdicts-20261027.json').read_text())
    check(len(coverage['rows'])==65 and len({r['id'] for r in coverage['rows']})==65,'65 verdict rows with per-ID reasons/evidence')
    ids=list(csv.DictReader((ROOT/'docs/recovery/final-scope-input-20261027.csv').open(encoding='utf-8-sig'),delimiter=';'))
    check(len(ids)==65 and len({r['ID'] for r in ids})==65,'65 unique input requirements')
    sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    result={'source_sha':sha,'baseline_sha':BASE_SHA,'verdict':'FAIL' if failures else 'PASS_SOURCE_CONTRACT','checks':checks,'failures':failures,'limits':['fixture only; no actual Directus build','29 original full HTML bodies not all available; 9 source-attested originals retained','No staging Apache HTTP readback or recipient inbox delivery claimed']}
    Path(args.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'verdict':result['verdict'],'checks':len(checks),'failures':failures},ensure_ascii=False))
    raise SystemExit(bool(failures))
if __name__=='__main__':main()
