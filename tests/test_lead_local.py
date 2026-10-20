"""Test PHP handler against a local fake sendmail binary; never sends external mail."""
import subprocess, urllib.request, urllib.error, json, time, os, socket
from pathlib import Path
root = Path(__file__).resolve().parents[1]
webroot = root / 'apps/web/public'
stub = root / 'tests/sendmail_stub.sh'
capture = Path('/tmp/aeroventa-v43-test-mail.txt')
capture.unlink(missing_ok=True)
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
env = {**os.environ, 'AEROVENTA_LEAD_TO':'office@aeroventa.ru',
       'AEROVENTA_LEAD_FROM':'office@aeroventa.ru'}  # MOCK ONLY
server = subprocess.Popen(['php', '-d', f'sendmail_path={stub}',
                           '-S', f'127.0.0.1:{port}', '-t', str(webroot)],
                          env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(60):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/api/lead.php', timeout=0.4)
        except urllib.error.HTTPError:
            break
        except OSError:
            time.sleep(0.08)
    url = f'http://127.0.0.1:{port}/api/lead.php'
    payload = {'name':'Demo Customer','contact':'demo@example.com','task':'Test HVAC project request',
               'company':'','source_page':'/contact/','consent':True,
               'started_at':int(time.time()*1000)-3500,'website':''}
    def request(body=None, origin='https://aeroventa.ru', method='POST'):
        headers = {'content-type':'application/json','Origin':origin,
                   'Referer':'https://aeroventa.ru/contact/','Sec-Fetch-Site':'same-origin'}
        req = urllib.request.Request(url,
             data=json.dumps(payload if body is None else body).encode() if method == 'POST' else None,
             headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=5) as res:
                return res.status, json.loads(res.read())
        except urllib.error.HTTPError as ex:
            return ex.code, json.loads(ex.read())
    cases = [
        ('method',request(method='GET'),405),
        ('cross-origin',request(origin='https://evil.example'),403),
        ('consent',request({**payload,'consent':False}),422),
        ('contact',request({**payload,'contact':'bad-contact'}),422),
        ('too-fast',request({**payload,'started_at':int(time.time()*1000)}),422),
        ('honeypot',request({**payload,'website':'spam.com'}),200),
        ('valid',request(),200),
        ('duplicate',request(),409),
    ]
    for name, got, expected in cases:
        print(name, 'PASS' if got[0] == expected else 'FAIL', got[0], expected)
    assert all(got[0] == expected for _,got,expected in cases)
    assert capture.is_file() and capture.read_text().count('---END MOCK EMAIL---') == 1
    print('PASS: 8/8, mock captured 1, outbound messages 0')
finally:
    server.terminate()
    try: server.wait(timeout=3)
    except subprocess.TimeoutExpired:
        server.kill()
        server.wait()
