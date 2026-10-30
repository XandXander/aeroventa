#!/usr/bin/env python3
"""Build a source-backed, READ-ONLY inventory of all existing HTML pages.

Sources: compiled Astro templates + the accepted public aeroventa.ru HTML.
Explicitly reports anything NOT editable in Directus; no guessed completeness.
No authentication, production modifications, uploads, or calls to Directus.
"""
import argparse
import hashlib
import html
import json
import pathlib
import re
import urllib.error
import urllib.request
from html.parser import HTMLParser
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlsplit

BASE='https://aeroventa.ru'
TEXT_TAGS={'h1','h2','h3','h4','h5','h6','p','a','li','figcaption','summary','button','label','strong','em','span','dt','dd','th','td'}
MEDIA_TAGS={'img','source','video','picture'}
EXCLUDED={'script','style','svg','noscript','template'}
MAX_BYTES=2500000

def digest(data):return hashlib.sha256(data).hexdigest()

def route_from_html(root,file):
    rel=file.relative_to(root).as_posix()
    if rel=='index.html':return '/'
    if rel.endswith('/index.html'):return '/'+rel[:-len('index.html')]
    if rel=='404.html':return None
    if rel.endswith('.html'):return '/'+rel
    return None

class InventoryParser(HTMLParser):
    def __init__(self,route):
        super().__init__(convert_charrefs=True)
        self.route=route;self.stack=[];self.children=[{}];self.items=[];self.suppressed=0;self.count=0
    def element_path(self,tag):
        parent=self.stack[-1]['path'] if self.stack else ''
        nth=self.children[-1].get(tag,0)+1
        self.children[-1][tag]=nth
        return f'{parent}/{tag}[{nth}]'
    def add(self,kind,path,value,attribute=None,group='page'):
        if not isinstance(value,str) or not value.strip() or len(value)>4000:return
        if len(self.items)>=3500:raise ValueError('Overlarge page inventory')
        label=' '.join(value.split())
        if len(label)>1600:label=label[:1600]+'…'
        key=digest((self.route+'\x1f'+path+'\x1f'+kind+'\x1f'+str(attribute)).encode())[:24]
        self.items.append({'id':key,'node':path,'kind':kind,'attribute':attribute,'value':label,
                 'value_sha256':digest(value.encode()),'editable_in_admin':False,'cms_target':None,'scope':group})
    def handle_starttag(self,tag,attrs):
        if self.suppressed or tag in EXCLUDED:self.suppressed+=1 if tag in EXCLUDED else 0
        path=self.element_path(tag)
        d=dict(attrs)
        context='site' if tag in ('header','footer') or any(x['site'] for x in self.stack) else 'page'
        this={'tag':tag,'path':path,'site':context=='site','suppress':tag in EXCLUDED}
        if not self.suppressed:
            if tag in ('img','video','source'):
                for attr in ('src','srcset','poster','alt','title'):
                    if d.get(attr):self.add('media' if attr!='alt' and attr!='title' else 'alt',path,d[attr],attr,context)
            if tag=='a' and d.get('href'):
                self.add('link',path,d['href'],'href',context)
            if tag=='link' and d.get('rel')=='canonical' and d.get('href'):
                self.add('seo',path,d['href'],'canonical','site')
            if tag=='meta':
                k=d.get('name') or d.get('property')
                if k in ('description','robots','og:title','og:description','og:image','twitter:card','twitter:image'):
                    self.add('seo',path,d.get('content',''),k,'site')
        self.stack.append(this);self.children.append({})
    def handle_startendtag(self,tag,attrs):
        self.handle_starttag(tag,attrs);self.handle_endtag(tag)
    def handle_endtag(self,tag):
        if self.suppressed and tag in EXCLUDED:self.suppressed-=1
        if not self.stack:return
        if self.stack[-1]['tag']==tag:self.stack.pop();self.children.pop();return
        for i in range(len(self.stack)-1,-1,-1):
            if self.stack[i]['tag']==tag:
                del self.stack[i:];del self.children[i+1:];return
    def handle_data(self,value):
        if self.suppressed or not self.stack:return
        node=self.stack[-1]
        if node['tag'] in TEXT_TAGS and value.strip():
            self.add('text',node['path'],value,None,'site' if node['site'] else 'page')

# Python HTMLParser does not emit handle_endtag for <img> when not self-closing;
# html void tags must not remain on stack, or DOM paths would drift.
VOID={'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
_old=InventoryParser.handle_starttag
def _start(self,tag,attrs):
    _old(self,tag,attrs)
    if tag in VOID and self.stack and self.stack[-1]['tag']==tag:self.stack.pop();self.children.pop()
InventoryParser.handle_starttag=_start

def scan(route,data):
    parser=InventoryParser(route);parser.feed(data.decode('utf8','replace'));parser.close()
    return parser.items

def get(url):
    req=urllib.request.Request(url,headers={'User-Agent':'AEROVENTA-CMS-ReadOnly-Inventory/1.0','Accept':'text/html'})
    try:
        with urllib.request.urlopen(req,timeout=18) as response:
            final=urlsplit(response.url)
            if final.hostname!='aeroventa.ru' or response.status!=200 or 'text/html' not in response.headers.get('Content-Type',''):
                return None, 'HTTP_OR_REDIRECT_NOT_ACCEPTED'
            raw=response.read(MAX_BYTES+1)
            if len(raw)>MAX_BYTES:return None,'HTML_EXCEEDS_LIMIT'
            return raw,None
    except (urllib.error.HTTPError,urllib.error.URLError,TimeoutError) as err:return None,type(err).__name__

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--dist',default='apps/web/dist');p.add_argument('--output',default='release_out/accepted-site-inventory.json')
    p.add_argument('--live',action='store_true');p.add_argument('--self-test',action='store_true');p.add_argument('--source-sha',default='')
    args=p.parse_args()
    if args.self_test:
        example=b'<html><body><header><a href="/">AEROVENTA</a></header><main><h1>Good title</h1><figure><img src="/evidence/a.webp" alt="A"/><figcaption>Scene</figcaption></figure></main></body></html>'
        a=scan('/',example)
        assert any(x['kind']=='text' and x['value']=='Good title' for x in a)
        assert any(x['kind']=='media' and x['value']=='/evidence/a.webp' for x in a)
        assert any(x['kind']=='link' and x['scope']=='site' for x in a)
        assert route_from_html(pathlib.Path('dist'),pathlib.Path('dist/blog/index.html'))=='/blog/'
        print('AEROVENTA_CMS_ACCEPTED_INVENTORY_SELF_TEST_PASS');return
    root=pathlib.Path(args.dist)
    assert root.is_dir(),'Astro static dist missing; do not invent pages'
    results=[];seen=set()
    for file in sorted(root.rglob('*.html')):
        route=route_from_html(root,file)
        if not route or route in seen:continue
        seen.add(route)
        local=file.read_bytes()
        if len(local)>MAX_BYTES:raise RuntimeError('Unsafe local HTML size: '+route)
        local_items=scan(route,local)
        item={'path':route,'source_html_sha256':digest(local),'source_item_count':len(local_items),
              'source_inventory':local_items,'source_template':'static Astro output','public_http':'NOT_CHECKED','public_match':None}
        results.append(item)
    if not results:raise RuntimeError('No static Astro routes found')
    if args.live:
        # Bounded parallel read-only requests. Each result has a fixed route key,
        # preserving deterministic output order independent of response speed.
        def reconcile(item):
            actual,error=get(urljoin(BASE,item['path']))
            if error:item.update(public_http=error,public_match=False,accepted_inventory=[])
            else:
                accepted=scan(item['path'],actual)
                item.update(public_http=200,public_html_sha256=digest(actual),
                            public_match=digest(actual)==item['source_html_sha256'],
                            accepted_inventory=accepted,accepted_item_count=len(accepted))
            return item
        with ThreadPoolExecutor(max_workers=6) as pool:
            results=list(pool.map(reconcile,results))
    coverage={'format':'AEROVENTA_CMS_ACCEPTED_SITE_INVENTORY_V1',
      'source_sha':args.source_sha or None,'public_site':BASE,'read_only':True,
      'pages_in_compiled_source':len(results),'pages_checked_live':sum(x['public_http']==200 for x in results),
      'pages_source_exactly_matches_live':sum(x['public_match'] is True for x in results),
      'live_routes_unverified':[x['path'] for x in results if x['public_http']!=200],
      'unmapped_editable_elements':sum(len(x.get('accepted_inventory',x['source_inventory'])) for x in results),
      'disposition':'COVERAGE_INVENTORY_ONLY_NOT_CMS_IMPORT_OR_PUBLICATION','pages':results}
    dst=pathlib.Path(args.output);dst.parent.mkdir(parents=True,exist_ok=True)
    dst.write_text(json.dumps(coverage,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({k:v for k,v in coverage.items() if k!='pages'},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
