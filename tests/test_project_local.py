"""Bounded local-only verification of project file upload. Mail is captured, never sent."""
import json
import os
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

root=Path(__file__).resolve().parents[1]
webroot=root/'apps/web/public'
stub=root/'tests/sendmail_stub.sh'
capture=Path('/tmp/aeroventa-v43-test-mail.txt')
capture.unlink(missing_ok=True)
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0))
    port=sock.getsockname()[1]
env={**os.environ,'AEROVENTA_LEAD_TO':'office@aeroventa.ru','AEROVENTA_LEAD_FROM':'office@aeroventa.ru'}
server=subprocess.Popen(['php','-d',f'sendmail_path={stub}','-S',f'127.0.0.1:{port}','-t',str(webroot)],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    url=f'http://127.0.0.1:{port}/api/project.php'
    for _ in range(60):
        try:
            urllib.request.urlopen(url,timeout=.5)
        except urllib.error.HTTPError:
            break
        except OSError:
            time.sleep(.08)
    fields={'name':'Demo Customer','contact':'demo@example.com','task':'Technical test of file handoff',
            'source_page':'/montazh-po-proektu/','consent':'on',
            'started_at':str(int(time.time()*1000)-4000),'website':''}
    def multipart(fields,filename='plan.pdf',filedata=b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n'):
        boundary='----AEROVENTA_LOCAL_TEST_20261020'
        parts=[]
        for key,value in fields.items():
            parts.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n'.encode(),str(value).encode(),b'\r\n'])
        if filename is not None:
            parts.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="documents[]"; filename="{filename}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode(),filedata,b'\r\n'])
        parts.append(f'--{boundary}--\r\n'.encode())
        return b''.join(parts),f'multipart/form-data; boundary={boundary}'
    def request(*,origin='https://aeroventa.ru',fields=fields,filename='plan.pdf',filedata=None,method='POST'):
        if filedata is None:
            filedata=b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n'
        payload,ctype=multipart(fields,filename,filedata)
        req=urllib.request.Request(url,data=payload if method=='POST' else None,
            method=method,headers={'Content-Type':ctype,'Origin':origin,
                'Referer':'https://aeroventa.ru/montazh-po-proektu/',
                'Sec-Fetch-Site':'same-origin'})
        try:
            with urllib.request.urlopen(req,timeout=5) as response:
                return response.status,json.loads(response.read())
        except urllib.error.HTTPError as ex:
            return ex.code,json.loads(ex.read())
    cases=[
        ('method',request(method='GET'),405),
        ('origin',request(origin='https://evil.example'),403),
        ('consent',request(fields={**fields,'consent':''}),422),
        ('missing-files',request(filename=None),422),
        ('bad-file-signature',request(filedata=b'not a valid PDF'),415),
        ('valid',request(),200),
        ('duplicate',request(),409)
    ]
    for name,got,expected in cases:
        print(name,'PASS' if got[0]==expected else 'FAIL',got,expected)
    assert all(got[0]==expected for _,got,expected in cases)
    assert capture.exists()
    output=capture.read_text(errors='replace')
    assert output.count('---END MOCK EMAIL---')==1
    assert 'multipart/mixed' in output and 'project-01.pdf' in output
    print('PASS: project upload 7/7, captured one private mock message, external mails 0')
finally:
    server.terminate()
    try:server.wait(timeout=3)
    except subprocess.TimeoutExpired:
        server.kill()
        server.wait()
