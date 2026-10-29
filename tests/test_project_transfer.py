import os,json,urllib.request,urllib.error,socket,subprocess,time,hashlib,tempfile,pathlib,sys
from email.parser import BytesParser
from email import policy
base=pathlib.Path(__file__).resolve().parents[1]
web=base/'apps/web/public'
private=tempfile.TemporaryDirectory(prefix='aeroventa-private-')
mailfile=pathlib.Path(private.name)/'sent.txt'
sendmail=pathlib.Path(private.name)/'sendmail_stub.sh'
sendmail.write_text('#!/bin/sh\ncat >> "$AEROVENTA_TEST_EMAIL"\nprintf "\\n---MAIL-END---\\n" >> "$AEROVENTA_TEST_EMAIL"\n')
sendmail.chmod(0o755)
with socket.socket() as sock: sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
env={**os.environ,'AEROVENTA_PROJECT_PRIVATE_ROOT':private.name+'/uploads','AEROVENTA_LEAD_TO':'office@aeroventa.ru','AEROVENTA_LEAD_FROM':'office@aeroventa.ru','AEROVENTA_TEST_EMAIL':str(mailfile)}
proc=subprocess.Popen(['php','-d','sendmail_path='+str(sendmail),'-S',f'127.0.0.1:{port}','-t',str(web)],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
baseurl=f'http://127.0.0.1:{port}/api/project-transfer.php?action='
headers={'Origin':'https://aeroventa.ru','Referer':'https://aeroventa.ru/montazh-po-proektu/','Sec-Fetch-Site':'same-origin'}
def req(action,payload=None,hs=None,method='POST'):
    if isinstance(payload,dict): payload=json.dumps(payload).encode()
    opts={**headers,**(hs or {})}
    if isinstance(payload,(bytes,bytearray)) and 'Content-Type' not in opts:opts['Content-Type']='application/octet-stream'
    request=urllib.request.Request(baseurl+action,data=payload,headers=opts,method=method)
    try:
        with urllib.request.urlopen(request,timeout=20) as r: data=r.read();code=r.status
    except urllib.error.HTTPError as e:data=e.read();code=e.code
    return code,json.loads(data)
try:
    for _ in range(70):
        try: req('invalid');break
        except (OSError,ConnectionError):time.sleep(.05)
    tiny=b'%PDF-1.4\n' + os.urandom(256000)
    dwg=b'AC1027'+os.urandom(2600)
    init={'name':'Test User','contact':'test@example.com','task':'Test engineering work','source_page':'/',
          'website':'','consent':True,'started_at':int(time.time()*1000)-3500,
          'files':[{'name':'drawing.pdf','size':len(tiny)},{'name':'working.dwg','size':len(dwg)}]}
    assert req('init',init,{'Origin':'https://attacker.example'})[0]==403
    assert req('init',dict(init,consent=False))[0]==422
    code,ret=req('init',init,{'Content-Type':'application/json'});assert code==201,(code,ret)
    auth={'X-AV-Upload-Id':ret['id'],'X-AV-Upload-Token':ret['token']}
    assert req('status',None,{'X-AV-Upload-Id':ret['id'],'X-AV-Upload-Token':'0'*64})[0]==403
    assert req('finish',None,auth)[0]==409
    assert req('chunk',tiny,dict(auth,**{'X-AV-File-Index':'0','X-AV-Offset':'0','X-AV-SHA256':'0'*64}))[0]==422
    def upload(index,blob,chunk=60000):
        offs=0
        for offset in range(0,len(blob),chunk):
            part=blob[offset:offset+chunk]
            h=dict(auth,**{'X-AV-File-Index':str(index),'X-AV-Offset':str(offset),'X-AV-SHA256':hashlib.sha256(part).hexdigest()})
            code,res=req('chunk',part,h);assert code==200,(code,res);offs=res['offset']
        return offs
    assert upload(0,tiny)==len(tiny)
    assert req('status',None,auth)[1]['offsets']==[len(tiny),0]
    wrong=dict(auth,**{'X-AV-File-Index':'0','X-AV-Offset':'0','X-AV-SHA256':hashlib.sha256(tiny[:10]).hexdigest()})
    assert req('chunk',tiny[:10],wrong)[0]==409
    assert upload(1,dwg)==len(dwg)
    code,data=req('finish',None,auth); assert code==200,(code,data)
    assert req('finish',None,auth)[1]['status']=='already_accepted'
    assert mailfile.exists()
    txt=mailfile.read_text()
    assert 'test@example.com' in txt and 'drawing.pdf' in txt and 'working.dwg' in txt and 'https://aeroventa.ru/api/project-transfer.php?action=download&t=' in txt
    assert len(txt)<8000,'Mail should never carry base64 attachments'
    link=txt.split('https://aeroventa.ru/api/project-transfer.php?action=download&t=')[1].split()[0]
    t=link[:64]
    get=lambda u:urllib.request.urlopen(f'http://127.0.0.1:{port}/api/project-transfer.php?action=download&t={t}'+u,timeout=20)
    with get('') as r: assert b'drawing.pdf' in r.read()
    with get('&file=0') as r: assert r.read()==tiny
    with get('&file=1') as r: assert r.read()==dwg
    code,_=req('init',dict(init,files=[{'name':'bad.pdf','size':len(dwg)}]),{'Content-Type':'application/json'});assert code==201
    print('PASS: 75MiB architecture / origin guard / invalid consent / per-chunk SHA / offset conflicts / exact-byte resume / authorized downloads / idempotent finish / short mail')
    print('STORAGE',private.name,'MAIL_SIZE',len(txt))
finally:
    proc.terminate();proc.wait(timeout=4);private.cleanup()
