import io
import json
import struct
import unittest
import zlib
from server import Flashbox, TTL

def png():
    def chunk(kind, data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\x00\xff\x00\x00'))+chunk(b'IEND',b'')

class SharingTests(unittest.TestCase):
    def setUp(self):
        self.now=1000
        self.app=Flashbox('https://photos.example.com',clock=lambda:self.now)
    def request(self,path,method='GET',data=b'',origin='https://photos.example.com',mime='image/png'):
        route,_,query=path.partition('?')
        env={'PATH_INFO':route,'QUERY_STRING':query,'REQUEST_METHOD':method,'wsgi.input':io.BytesIO(data),'CONTENT_LENGTH':str(len(data)),'CONTENT_TYPE':mime,'HTTP_ORIGIN':origin,'REMOTE_ADDR':'127.0.0.1'}
        status=[]
        body=b''.join(self.app(env,lambda code,headers:status.extend([code,dict(headers)])))
        return status[0],status[1],body
    def share(self):
        code,_,body=self.request('/api/share','POST',png())
        self.assertEqual(code,'201 Created')
        return json.loads(body)
    def test_create_scan_page_qr_and_exact_download(self):
        share=self.share();token=share['url'].split('/')[-1]
        self.assertEqual(len(token),32)
        code,headers,page=self.request('/s/'+token)
        self.assertEqual(code,'200 OK');self.assertIn(b'Save photo',page)
        code,headers,qr=self.request(share['qr'])
        self.assertEqual(code,'200 OK');self.assertEqual(headers['Content-Type'],'image/svg+xml');self.assertIn(b'<svg',qr)
        code,headers,data=self.request('/media/'+token+'.png?download=1')
        self.assertEqual(data,png());self.assertIn('attachment',headers['Content-Disposition']);self.assertEqual(headers['Cache-Control'],'no-store')
    def test_expiration_removes_photo_and_qr(self):
        share=self.share();token=share['url'].split('/')[-1];self.now+=TTL+1
        for path in ['/s/'+token,'/media/'+token+'.png',share['qr']]:self.assertEqual(self.request(path)[0],'404 Not Found')
        self.assertEqual(len(self.app.photos),0)
    def test_origin_and_invalid_file_rejected(self):
        self.assertEqual(self.request('/api/share','POST',png(),origin='https://evil.example')[0],'403 Forbidden')
        self.assertEqual(self.request('/api/share','POST',b'not PNG')[0],'400 Bad Request')
        self.assertEqual(self.request('/api/share','POST',png(),mime='text/html')[0],'415 Unsupported Media Type')
        self.assertEqual(len(self.app.photos),0)
    def test_no_base_url_never_issues_unreachable_qr(self):
        self.app=Flashbox('')
        self.assertEqual(self.request('/api/share','POST',png())[0],'503 Service Unavailable')
    def test_shares_are_unique_and_old_snapshot_unchanged(self):
        first=self.share();second=self.share();self.assertNotEqual(first['url'],second['url'])
        token=first['url'].split('/')[-1];self.assertEqual(self.request('/media/'+token+'.png')[2],png())
    def test_no_source_directory_or_dependency_exposure(self):
        for path in ['/server.py','/.runtime/qrcode/main.py','/../README.md','/.env']:
            self.assertEqual(self.request(path)[0],'404 Not Found')
    def test_rate_limit(self):
        for _ in range(20):self.share()
        self.assertEqual(self.request('/api/share','POST',png())[0],'429 Too Many Requests')
        self.now+=61;self.share()

if __name__=='__main__':unittest.main()
