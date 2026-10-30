#!/usr/bin/env python3
"""Build a deterministic, source-and-live-verified, NO-WRITE CMS baseline.

Reads previously validated exact Astro source+accepted public HTTP inventories.
Never calls Directus and never changes a public website. Existing user draft
fields remain authoritative: import runner must use create-only/upsert-missing.
"""
import argparse
import collections
import hashlib
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]

def hash_value(x):return hashlib.sha256(x.encode('utf8')).hexdigest()

def valid_path(p):return isinstance(p,str) and re.fullmatch(r'/(?:[a-z0-9-]+/)*',p) is not None

def field_allowed(item):
    node=item['node'];k=item['kind'];attr=item['attribute']
    # Semantic content only. Do NOT import cookie banners, modal controls,
    # form labels, legal consent or global chrome as ordinary page content.
    if '/main[' not in node:return False
    if any('/'+seg+'[' in node for seg in ['button','label','input','form','svg','script','style']):return False
    if k=='text':return True
    if k=='alt' and attr=='alt':return True
    if k=='link' and attr=='href':return True
    if k=='media' and attr=='src':return True
    return False

def safe_value(k,v):
    if not isinstance(v,str) or not v.strip() or len(v)>1600:return False
    if k in ('link','media'):
        # Preserve existing internal URLs; new external links are not migrated
        return v.startswith('/') and not v.startswith('//') and '\\' not in v and '\x00' not in v
    return '\x00' not in v

def make_plan(source):
    if source.get('format')!='AEROVENTA_CMS_ACCEPTED_SITE_INVENTORY_V1' or not source.get('read_only'):
        raise ValueError('Unrecognized immutable source/live inventory')
    if not re.fullmatch(r'[a-f0-9]{40}',source['source_sha']):raise ValueError('Missing source commit')
    routes=[]; totals=collections.Counter(); skipped=collections.Counter()
    for entry in source['pages']:
        path=entry['path']
        if not valid_path(path):raise ValueError('Unsafe input route '+str(path))
        if entry['public_http']!=200:
            skipped['redirect_or_noncanonical_route']+=1
            continue
        refs={}
        for item in entry['source_inventory']:
            key=(item['node'],item['kind'],item['attribute'])
            refs.setdefault(key,[]).append(item)
        accepted=entry['accepted_inventory']
        duplicates=collections.Counter((x['node'],x['kind'],x['attribute']) for x in accepted)
        fields=[]
        for item in accepted:
            key=(item['node'],item['kind'],item['attribute']); kind=item['kind'];value=item['value']
            if not field_allowed(item):skipped['excluded_chrome_or_noneditable']+=1;continue
            if duplicates[key]!=1 or len(refs.get(key,[]))!=1:skipped['ambiguous_repeated_node']+=1;continue
            if not safe_value(kind,value):skipped['unsupported_or_truncated_value']+=1;continue
            original=refs[key][0]
            if original['value']!=value or original['value_sha256']!=item['value_sha256']:
                skipped['source_accepted_drift']+=1;continue
            data={'key':item['id'],'node':item['node'],'kind':kind,'attribute':item['attribute'],
                  'baseline':value,'value':value,'source_sha256':item['value_sha256']}
            fields.append(data);totals[kind]+=1
        if not fields: raise ValueError('No editable main fields for '+path)
        # Deliberately <=20 elements/block to avoid large, brittle CMS JSON.
        blocks=[{'block_type':'dom_fields','sort':i,'fact_checked':True,
                 'data':{'version':1,'page':path,'fields':fields[i:i+20]}}
                for i in range(0,len(fields),20)]
        seo={}
        meta={x['attribute']:x['value'] for x in accepted if x['kind']=='seo'}
        for src,dst in [('description','seo_description'),('og:title','og_title'),('og:description','og_description'),('canonical','canonical_override'),('og:image','og_image')]:
            if meta.get(src):seo[dst]=meta[src]
        heading_parts=[x['value'] for x in accepted if x['kind']=='text' and '/h1[' in x['node'] and '/main[' in x['node']]
        h1=' '.join(heading_parts).strip() or None
        routes.append({'path':path,'source_html_sha256':entry['source_html_sha256'],
                       'public_html_sha256':entry['public_html_sha256'],
                       'h1':h1,'seo':seo,'blocks':blocks,
                       'import_policy':'CREATE_MISSING_BLOCKS_ONLY_PRESERVE_EXISTING_DRAFTS',
                       'requires_owner_review':True})
    if len(routes)!=49:raise ValueError(f'Expected 49 exact accepted canonical pages, found {len(routes)}')
    return {'format':'AEROVENTA_OWNER_ACCEPTED_CMS_BASELINE_V1',
            'origin_source_sha':source['source_sha'],'authority':'APPROVED_ASTRO_SOURCE_PLUS_ACCEPTED_LIVE_HTTP',
            'directus_collection':'content','block_collection':'content_blocks','map_collection':'content_block_map',
            'write_policy':'NO_AUTOMATIC_PUBLICATION; CREATE_MISSING_ONLY; EXACT_ROUTE_IDENTITY; FAIL_ON_CONFLICT',
            'pages':routes,'summary':{'canonical_pages':len(routes),'fields':sum(totals.values()),
                      'content_by_kind':dict(totals),'excluded_by_reason':dict(skipped),
                      'noncanonical_routes':len(source['pages'])-len(routes)}}

def main():
    p=argparse.ArgumentParser();p.add_argument('--inventory');p.add_argument('--out');p.add_argument('--self-test',action='store_true');args=p.parse_args()
    if args.self_test:
        assert valid_path('/') and valid_path('/almaznoe-burenie/') and not valid_path('/../../private/')
        assert field_allowed({'node':'/html[1]/body[1]/main[1]/h2[1]','kind':'text','attribute':None})
        assert not field_allowed({'node':'/html[1]/body[1]/header[1]/a[1]','kind':'text','attribute':None})
        print('BASELINE_GENERATOR_SELF_TEST_PASS');return
    if not args.inventory or not args.out:p.error('Specify --inventory and --out')
    data=make_plan(json.loads(pathlib.Path(args.inventory).read_text('utf8')))
    dest=pathlib.Path(args.out);dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n','utf8')
    print('BASELINE_BLUEPRINT_PASS',json.dumps(data['summary'],ensure_ascii=False))
if __name__=='__main__': main()
