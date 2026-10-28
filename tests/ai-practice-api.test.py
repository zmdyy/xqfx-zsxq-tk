import importlib.util
import json
from pathlib import Path
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from flask import Flask

spec=importlib.util.spec_from_file_location('ai_api',Path(__file__).resolve().parents[1]/'ai_practice_api.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class Provider(BaseHTTPRequestHandler):
    requests=[]
    def log_message(self,*args): pass
    def do_POST(self):
        body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        self.requests.append((self.path,self.headers.get('Authorization'),body))
        if body['model']=='reject':
            self.send_response(401);self.end_headers();self.wfile.write(b'SECRET-SHOULD-NOT-ECHO');return
        self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps({'choices':[{'message':{'content':'{"ok":true}'}}]}).encode())

class TestApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),Provider);cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls): cls.server.shutdown();cls.server.server_close()
    def setUp(self):
        self.app=Flask(__name__);self.app.testing=True;module.register_ai_practice(self.app);self.client=self.app.test_client();self.config={'baseUrl':f'http://127.0.0.1:{self.server.server_port}/v1','model':'mock','apiKey':'SECRET-SHOULD-NOT-ECHO'}
    def payload(self): return {'config':self.config,'messages':[{'role':'user','content':[{'type':'text','text':'test'},{'type':'image_url','image_url':{'url':'data:image/png;base64,AA'}}]}]}
    def test_actual_http_relay(self):
        self.assertTrue(self.client.get('/ai/health').json['ok']);r=self.client.post('/ai/chat',json=self.payload());self.assertEqual(r.status_code,200);self.assertEqual(r.json['content'],'{"ok":true}');path,auth,body=Provider.requests[-1];self.assertEqual(path,'/v1/chat/completions');self.assertEqual(auth,'Bearer SECRET-SHOULD-NOT-ECHO');self.assertEqual(body['messages'][0]['content'][1]['type'],'image_url')
    def test_origin_and_lan_rejected(self):
        self.assertEqual(self.client.post('/ai/chat',json=self.payload(),headers={'Origin':'https://evil.example'}).status_code,403)
        self.assertEqual(self.client.post('/ai/chat',json=self.payload(),environ_base={'REMOTE_ADDR':'192.168.1.7'}).status_code,403)
    def test_production_private_endpoint_rejected(self):
        self.app.testing=False;r=self.client.post('/ai/chat',json=self.payload());self.assertEqual(r.status_code,400)
    def test_no_secret_echo(self):
        self.config['model']='reject';r=self.client.post('/ai/chat',json=self.payload());self.assertEqual(r.status_code,502);self.assertNotIn('SECRET',r.get_data(as_text=True))
    def test_invalid_messages(self):
        p=self.payload();p['messages']=[{'role':'tool'}];self.assertEqual(self.client.post('/ai/chat',json=p).status_code,400)

if __name__=='__main__': unittest.main()
