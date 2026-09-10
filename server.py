"""Flashbox + temporary, unguessable photo links. Run behind HTTPS in production."""
import json
import os
import re
import secrets
import struct
import sys
import threading
import time
import zlib
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / '.runtime'))
import qrcode
import qrcode.image.svg

TTL = 3600
MAX_IMAGE = 10 * 1024 * 1024
MAX_STORAGE = 128 * 1024 * 1024
STATIC = {'/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css', '/qr-share.js': 'qr-share.js'}

def valid_png(data):
    if not data.startswith(b'\x89PNG\r\n\x1a\n'):
        return False
    pos, count, has_data = 8, 0, False
    while pos + 12 <= len(data):
        size = struct.unpack('>I', data[pos:pos+4])[0]
        kind = data[pos+4:pos+8]
        end = pos + 12 + size
        if end > len(data) or zlib.crc32(data[pos+4:end-4]) != struct.unpack('>I', data[end-4:end])[0]:
            return False
        if count == 0:
            if kind != b'IHDR' or size != 13:
                return False
            w, h = struct.unpack('>II', data[pos+8:pos+16])
            if not (1 <= w <= 6000 and 1 <= h <= 6000 and w*h <= 12000000):
                return False
        if kind == b'IDAT':
            has_data = True
        if kind == b'IEND':
            return has_data and size == 0 and end == len(data)
        count += 1
        pos = end
    return False

class Flashbox:
    def __init__(self, base_url=None, clock=time.time):
        self.base = (base_url if base_url is not None else os.environ.get('PUBLIC_BASE_URL', '')).rstrip('/')
        if self.base:
            parts = urlsplit(self.base)
            if parts.scheme not in ('http', 'https') or not parts.netloc or parts.path or parts.query or parts.fragment or parts.username:
                raise ValueError('PUBLIC_BASE_URL must be an origin, e.g. https://photos.example.com')
        self.clock = clock
        self.photos = {}
        self.rate = {}
        self.lock = threading.Lock()

    def prune(self):
        now = self.clock()
        self.photos = {k:v for k,v in self.photos.items() if v[1] > now}
        self.rate = {k:v for k,v in self.rate.items() if v[0] > now-60}

    def __call__(self, env, start_response):
        path, method = env.get('PATH_INFO', '/'), env.get('REQUEST_METHOD', 'GET')
        headers = [('Cache-Control', 'no-store'), ('X-Content-Type-Options', 'nosniff'), ('Referrer-Policy', 'no-referrer')]
        def reply(code, body, mime='application/json', extra=()):
            if isinstance(body, dict): body = json.dumps(body).encode()
            if isinstance(body, str): body = body.encode()
            start_response(code, headers + [('Content-Type', mime), ('Content-Length', str(len(body)))] + list(extra))
            return [b'' if method == 'HEAD' else body]
        with self.lock: self.prune()
        if path == '/api/config' and method == 'GET':
            return reply('200 OK', {'qr_enabled': bool(self.base), 'expires_in': TTL})
        if path == '/api/share' and method == 'POST':
            if not self.base: return reply('503 Service Unavailable', {'error': 'QR sharing needs a hosted server with PUBLIC_BASE_URL configured.'})
            # Do not allow another site to use the storage through a visitor's browser.
            if env.get('HTTP_ORIGIN') != self.base:
                return reply('403 Forbidden', {'error': 'Open Flashbox at its configured sharing address.'})
            if env.get('CONTENT_TYPE', '').split(';')[0] != 'image/png':
                return reply('415 Unsupported Media Type', {'error': 'Please share a PNG strip.'})
            try: length = int(env.get('CONTENT_LENGTH', '0'))
            except ValueError: length = 0
            if not 0 < length <= MAX_IMAGE:
                return reply('413 Payload Too Large', {'error': 'The strip must be smaller than 10 MB.'})
            data = env['wsgi.input'].read(length)
            if len(data) != length or not valid_png(data):
                return reply('400 Bad Request', {'error': 'This PNG could not be read. Rebuild your strip and try again.'})
            with self.lock:
                address = env.get('REMOTE_ADDR', '')
                start, count = self.rate.get(address, (self.clock(), 0))
                if count >= 20:
                    return reply('429 Too Many Requests', {'error': 'Please wait a minute before creating another link.'})
                if sum(len(v[0]) for v in self.photos.values()) + length > MAX_STORAGE or len(self.photos) >= 256:
                    return reply('503 Service Unavailable', {'error': 'The photo server is full. Please download directly or try later.'})
                token = secrets.token_urlsafe(24)
                expiry = self.clock()+TTL
                self.photos[token] = (data, expiry)
                self.rate[address] = (start, count+1)
            return reply('201 Created', {'url': self.base+'/s/'+token, 'qr': '/qr/'+token+'.svg', 'expires_at': expiry*1000})
        match = re.fullmatch(r'/(s|media|qr)/([A-Za-z0-9_-]{32})(?:\.(png|svg))?', path)
        if match and method in ('GET', 'HEAD'):
            kind, token, _ = match.groups()
            with self.lock: photo = self.photos.get(token)
            if not photo:
                return reply('404 Not Found', '<!doctype html><meta name="viewport" content="width=device-width"><title>Link expired</title><body style="background:#F2E8D7;color:#29251F;font:18px system-ui;padding:40px"><h1>This moment has expired.</h1><p>Ask the booth owner to create a new QR code.</p></body>', 'text/html; charset=utf-8')
            data, expiry = photo
            if kind == 'media':
                disposition = 'attachment' if env.get('QUERY_STRING') == 'download=1' else 'inline'
                return reply('200 OK', data, 'image/png', [('Content-Disposition', disposition+'; filename="flashbox.png"')])
            if kind == 'qr':
                qr = qrcode.make(self.base+'/s/'+token, image_factory=qrcode.image.svg.SvgPathFillImage, border=4)
                return reply('200 OK', qr.to_string(), 'image/svg+xml')
            minutes = max(1, int((expiry-self.clock())/60))
            return reply('200 OK', f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your Flashbox photo</title><style>body{{margin:0;background:#F2E8D7;color:#29251F;font:15px system-ui;text-align:center;padding:25px 18px}}h1{{font-size:30px}}p{{color:#655b4f;line-height:1.6}}img{{display:block;max-width:100%;max-height:65vh;height:auto;width:auto;margin:22px auto;box-shadow:3px 7px 20px #29251f30}}a{{display:inline-block;background:#C1CAA9;color:#29251F;padding:15px 28px;border-radius:8px;text-decoration:none;font-weight:700}}small{{display:block;margin-top:20px}}</style><h1>A little moment. Yours.</h1><p>Your booth photo is ready to keep.</p><img src="/media/{token}.png" alt="Your Flashbox photo strip"><a href="/media/{token}.png?download=1" download="flashbox.png">↓ Save photo</a><p>On mobile, you can also touch and hold the photo to save it.</p><small>This link expires in about {minutes} minutes.<br>Anyone with the link can view this photo.</small></html>''', 'text/html; charset=utf-8', [('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'")])
        if path in STATIC and method in ('GET', 'HEAD'):
            file = ROOT / STATIC[path]
            mime = {'.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css'}[file.suffix]
            return reply('200 OK', file.read_bytes(), mime)
        return reply('404 Not Found', {'error': 'Not found'})

application = Flashbox()
def cleanup():
    while True:
        time.sleep(30)
        with application.lock: application.prune()
threading.Thread(target=cleanup, daemon=True).start()

if __name__ == '__main__':
    from wsgiref.simple_server import make_server
    port = int(os.environ.get('PORT', '4174'))
    print(f'Flashbox: http://localhost:{port}; sharing origin: {application.base or "not configured"}', flush=True)
    make_server('0.0.0.0', port, application).serve_forever()
