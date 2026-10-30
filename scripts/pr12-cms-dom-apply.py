#!/usr/bin/env python3
"""Preserve the accepted Astro DOM while editing approved, named leaf fields.

This operates only on compiled build outputs, never on production. Each change
must match the immutable source+live baseline and an exact DOM node. It touches
only text tokens or existing quoted src/href/alt attributes, no HTML markup,
script, forms, classes, CSS or layout. An error aborts the entire build.
"""
import argparse
import html
from html.parser import HTMLParser
import json
import pathlib
import re

VOID={'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
def norm(value):return ' '.join(html.unescape(value).split())

def safe_changed(field):
    value=field['value'];kind=field['kind'];attribute=field.get('attribute')
    if not isinstance(value,str) or not value.strip() or len(value)>1600 or '\x00' in value:
        raise ValueError('Invalid editorial value')
    if kind=='text':return True
    if kind=='alt' and attribute=='alt':return True
    if kind in ('link','media') and attribute in ('href','src'):
        # No remote hosts, script protocols, fragments or traversal by ordinary
        # editor. New CMS image URLs must be locked to SHA-addressed resources.
        if not value.startswith('/') or value.startswith('//') or '\\' in value or '..' in value:
            raise ValueError('Unsafe resource URL')
        if any(x in value for x in ('<','>','"',"'",'\r','\n')):raise ValueError('Unsafe URL characters')
        return True
    raise ValueError('Not an editable CMS DOM field')

class EditTokens(HTMLParser):
    def __init__(self,body,items):
        super().__init__(convert_charrefs=False)
        self.body=body
        self.items={(o['node'],o['kind'],o.get('attribute')):o for o in items}
        self.seen=set();self.edits=[];self.stack=[];self.children=[{}]
        self.line_offsets=[0]
        for m in re.finditer('\n',body):self.line_offsets.append(m.end())
    def char_offset(self):
        line,col=self.getpos();return self.line_offsets[line-1]+col
    def start(self,tag,attrs,is_void=False):
        parent=self.stack[-1]['path'] if self.stack else ''
        nth=self.children[-1].get(tag,0)+1;self.children[-1][tag]=nth
        node=f'{parent}/{tag}[{nth}]'
        for attr,kind in [('src','media'),('href','link'),('alt','alt')]:
            key=(node,kind,attr)
            if key not in self.items:continue
            record=self.items[key];safe_changed(record)
            raw=self.get_starttag_text() or ''
            pat=re.compile(r'(?<![\w:-])'+attr+r'\s*=\s*(["\'])(.*?)\1',re.I|re.S)
            matches=list(pat.finditer(raw))
            if len(matches)!=1:raise ValueError('Missing/duplicate quoted '+attr+' at '+node)
            m=matches[0]
            if norm(m.group(2)) != norm(record['baseline']):raise ValueError('DOM attribute baseline drift at '+node)
            pos=self.char_offset();start=pos+m.start(2);end=pos+m.end(2)
            value=html.escape(record['value'],quote=True)
            self.edits.append((start,end,value));self.seen.add(key)
            # Replaced source images must never retain srcset pointing to
            # old, unrelated photographs. Responsive optimizer regenerates
            # variants from the new immutable CMS file after this patch.
            if tag=='img' and attr=='src':
                for obsolete in ('srcset','sizes'):
                    pat2=re.compile(r'\s+'+obsolete+r'\s*=\s*([\"\'])(.*?)\1',re.I|re.S)
                    match=pat2.search(raw)
                    if match:self.edits.append((pos+match.start(),pos+match.end(),''))
        if not is_void:self.stack.append({'tag':tag,'path':node});self.children.append({})
    def handle_starttag(self,tag,attrs):self.start(tag,attrs,tag in VOID)
    def handle_startendtag(self,tag,attrs):self.start(tag,attrs,True)
    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,-1,-1):
            if self.stack[i]['tag']==tag:
                del self.stack[i:];del self.children[i+1:];break
    def handle_data(self,data):
        if not self.stack:return
        key=(self.stack[-1]['path'],'text',None)
        if key not in self.items:return
        if key in self.seen:raise ValueError('Repeated text node '+key[0])
        record=self.items[key];safe_changed(record)
        # Entity-split text isn't safe for token-level edits, fail closed.
        if norm(data)!=norm(record['baseline']):raise ValueError('DOM text baseline drift at '+key[0])
        pos=self.char_offset()
        if self.body[pos:pos+len(data)]!=data:raise ValueError('Text token offset drift')
        prefix=re.match(r'^\s*',data).group(0);suffix=re.search(r'\s*$',data).group(0)
        self.edits.append((pos,pos+len(data),prefix+html.escape(record['value'],quote=False)+suffix))
        self.seen.add(key)
    def rewrite(self):
        self.feed(self.body);self.close()
        missing=set(self.items)-self.seen
        if missing:raise ValueError('Unmapped DOM fields: '+str(sorted(missing)[:3]))
        output=self.body
        for start,end,value in sorted(self.edits,key=lambda v:v[0],reverse=True):
            output=output[:start]+value+output[end:]
        return output

def patch(html_text,blocks):
    changed=[]
    for block in blocks:
        if block.get('block_type')!='dom_fields':raise ValueError('Only dom_fields are accepted')
        for field in block['data']['fields']:
            if field['value']==field['baseline']:continue
            changed.append(field)
    if not changed:return html_text,0
    unique={(x['node'],x['kind'],x.get('attribute')) for x in changed}
    if len(unique)!=len(changed):raise ValueError('Duplicate changed DOM selectors')
    return EditTokens(html_text,changed).rewrite(),len(changed)

def main():
    p=argparse.ArgumentParser();p.add_argument('--manifest');p.add_argument('--dist');p.add_argument('--blueprint');p.add_argument('--contract-test',action='store_true');p.add_argument('--report');p.add_argument('--self-test',action='store_true');args=p.parse_args()
    if args.self_test:
        src='<html><body><main><h1>Old title</h1><img src="/evidence/old.jpg" alt="Old" /></main></body></html>'
        mainpath='/html[1]/body[1]/main[1]'
        blocks=[{'block_type':'dom_fields','data':{'fields':[
          {'node':mainpath+'/h1[1]','kind':'text','attribute':None,'baseline':'Old title','value':'New title'},
          {'node':mainpath+'/img[1]','kind':'alt','attribute':'alt','baseline':'Old','value':'New alt'}]}}]
        out,n=patch(src,blocks)
        assert n==2 and '<h1>New title</h1>' in out and 'alt="New alt"' in out and '/evidence/old.jpg' in out
        try:patch(src,[{'block_type':'dom_fields','data':{'fields':[{'node':mainpath+'/h1[1]','kind':'text','attribute':None,'baseline':'WRONG','value':'New title'}]}}]);raise AssertionError('Expected drift failure')
        except ValueError:pass
        print('CMS_DOM_EDITOR_SELF_TEST_PASS');return
    if args.contract_test:
        if not args.blueprint or not args.dist or not args.report:p.error('Contract-test requires --blueprint --dist --report')
        blueprint=json.loads(pathlib.Path(args.blueprint).read_text('utf8'))
        failures=[];results=[]
        for route in blueprint['pages']:
            address=route['path'];rel='index.html' if address=='/' else address.lstrip('/')+'index.html'
            html_doc=(pathlib.Path(args.dist)/rel).read_text('utf8')
            trial=[]
            for b in route['blocks']:
                data={'fields':[]}
                for field in b['data']['fields']:
                    edited=dict(field)
                    if field['kind']=='media':edited['value']='/cms-media/'+'a'*64+'.webp'
                    elif field['kind']=='link':edited['value']='/contact/' if field['value']!='/contact/' else '/about/'
                    else:edited['value']='КОНТРОЛЬ '+field['baseline']
                    data['fields'].append(edited)
                trial.append({'block_type':'dom_fields','data':data})
            try:
                output,n=patch(html_doc,trial)
                assert n==sum(len(x['data']['fields']) for x in trial) and output!=html_doc
                results.append({'path':address,'fields':n,'status':'PASS'})
            except Exception as error:
                failures.append({'path':address,'reason':str(error)[:250]})
                results.append({'path':address,'status':'FAIL'})
        proof={'format':'AEROVENTA_DOM_EDITOR_CONTRACT_V1','pages':len(results),'passed':len(results)-len(failures),'fields_mapped':sum(x.get('fields',0) for x in results),'failures':failures,'results':results}
        pathlib.Path(args.report).parent.mkdir(parents=True,exist_ok=True)
        pathlib.Path(args.report).write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n','utf8')
        if failures:raise ValueError('DOM mapping contract failed on '+str(len(failures))+' pages: '+str(failures[:3]))
        print('CMS_DOM_CONTRACT_PASS',proof['pages'],proof['fields_mapped'])
        return
    if not args.manifest or not args.dist:p.error('Specify --manifest and --dist')
    manifest=json.loads(pathlib.Path(args.manifest).read_text('utf8'))
    if manifest.get('format')!='AEROVENTA_CMS_DOM_OVERRIDE_V1':raise ValueError('Unknown manifest')
    dist=pathlib.Path(args.dist).resolve();changed=0;paths=[]
    pending=[]
    for route in manifest['pages']:
        address=route['path']
        if not re.fullmatch(r'/(?:[a-z0-9-]+/)*',address):raise ValueError('Unsafe route')
        rel='index.html' if address=='/' else address.lstrip('/')+'index.html'
        file=(dist/rel).resolve()
        if not file.is_relative_to(dist) or not file.is_file():raise ValueError('Missing compiled page '+address)
        source=file.read_text('utf8');result,n=patch(source,route['blocks']);changed+=n;paths.append(address)
        pending.append((file,result,n))
    # Commit locally only after every route has validated successfully.
    for file,result,n in pending:
        if n:file.write_text(result,'utf8')
    print('CMS_DOM_EXACT_PATCH_PASS',json.dumps({'routes':len(paths),'changed_fields':changed},ensure_ascii=False))
if __name__=='__main__':main()
