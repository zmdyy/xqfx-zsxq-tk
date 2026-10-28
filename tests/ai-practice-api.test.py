import importlib.util
import json
from pathlib import Path
import threading
import unittest
from unittest.mock import patch, Mock
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
        result={'choices':[{'finish_reason':'stop','message':{'content':'{"ok":true}'}}], 'usage':{'prompt_tokens':100,'completion_tokens':20,'total_tokens':120,'completion_tokens_details':{'reasoning_tokens':0},'secret':'SECRET-SHOULD-NOT-ECHO'}}
        if body['model']=='truncated': result={'choices':[{'finish_reason':'length','message':{'content':'{"bad"'}}]}
        if body['model']=='thinking-only': result={'choices':[{'message':{'content':None,'reasoning_content':'PRIVATE-REASONING'}}]}
        if body['model']=='empty': result={'choices':[{'message':{'content':''}}]}
        if body['model']=='wrong-format': result={'result':'SECRET-SHOULD-NOT-ECHO'}
        self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'not json' if body['model']=='non-json' else json.dumps(result).encode())

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
        self.assertTrue(self.client.get('/ai/health').json['ok']);r=self.client.post('/ai/chat',json=self.payload());self.assertEqual(r.status_code,200);self.assertEqual(r.json['content'],'{"ok":true}');path,auth,body=Provider.requests[-1];self.assertEqual(path,'/v1/chat/completions');self.assertEqual(auth,'Bearer SECRET-SHOULD-NOT-ECHO');self.assertEqual(body['messages'][0]['content'][1]['type'],'image_url');self.assertEqual(r.json['diagnostics']['usage']['total_tokens'],120);self.assertNotIn('secret',r.json['diagnostics']['usage']);self.assertEqual(r.json['diagnostics']['finishReason'],'stop');self.assertTrue(r.json['diagnostics']['requestId'])
    def test_origin_and_lan_rejected(self):
        self.assertEqual(self.client.post('/ai/chat',json=self.payload(),headers={'Origin':'https://evil.example'}).status_code,403)
        self.assertEqual(self.client.post('/ai/chat',json=self.payload(),environ_base={'REMOTE_ADDR':'192.168.1.7'}).status_code,403)
    def test_production_private_endpoint_rejected(self):
        self.app.testing=False;r=self.client.post('/ai/chat',json=self.payload());self.assertEqual(r.status_code,400)
    def test_no_secret_echo(self):
        self.config['model']='reject';r=self.client.post('/ai/chat',json=self.payload());self.assertEqual(r.status_code,502);self.assertNotIn('SECRET',r.get_data(as_text=True))
    def test_invalid_messages(self):
        p=self.payload();p['messages']=[{'role':'tool'}];self.assertEqual(self.client.post('/ai/chat',json=p).status_code,400)
    def test_specific_output_failures(self):
        for model,expected in [('truncated','长度限制'),('thinking-only','思考内容'),('empty','空内容'),('wrong-format','格式不兼容'),('non-json','非 JSON')]:
            with self.subTest(model=model):
                self.config['model']=model;r=self.client.post('/ai/chat',json=self.payload())
                self.assertEqual(r.status_code,502);self.assertIn(expected,r.json['error']);self.assertNotIn('SECRET',r.get_data(as_text=True));self.assertNotIn('PRIVATE',r.get_data(as_text=True))
    def test_deepseek_json_and_thinking_configuration(self):
        self.config.update(baseUrl='https://api.deepseek.com',model='deepseek-flas')
        response=Mock(ok=True,status_code=200);response.json.return_value={'choices':[{'finish_reason':'stop','message':{'content':'{"ok":true}'}}]}
        with patch.object(module.socket,'getaddrinfo',return_value=[(2,1,6,'',('8.8.8.8',443))]),patch.object(module.requests,'post',return_value=response) as post:
            r=self.client.post('/ai/chat',json=self.payload());self.assertEqual(r.status_code,200)
            payload=post.call_args.kwargs['json'];self.assertEqual(payload['model'],'deepseek-flash');self.assertEqual(payload['response_format'],{'type':'json_object'});self.assertEqual(payload['thinking'],{'type':'disabled'});self.assertEqual(payload['max_tokens'],8192)
    def test_bad_input_is_actionable_and_safe(self):
        for payload in [[],{'config':[]},None]:
            r=self.client.post('/ai/chat',json=payload);self.assertEqual(r.status_code,400);self.assertIn('配置格式',r.json['error'])
        self.config['baseUrl']='https://api.example:SECRET-SHOULD-NOT-ECHO';r=self.client.post('/ai/chat',json=self.payload());self.assertEqual(r.status_code,400);self.assertNotIn('SECRET',r.get_data(as_text=True))
    def test_network_diagnostics_separate_causes_without_exception_text(self):
        for exc,code in [(module.requests.exceptions.SSLError('SECRET-SHOULD-NOT-ECHO'),'tls_error'),(module.requests.exceptions.ProxyError('SECRET-SHOULD-NOT-ECHO'),'proxy_error'),(module.requests.exceptions.ConnectionError('SECRET-SHOULD-NOT-ECHO'),'connection_error'),(module.requests.exceptions.ConnectTimeout('SECRET-SHOULD-NOT-ECHO'),'connect_timeout'),(module.requests.exceptions.ReadTimeout('SECRET-SHOULD-NOT-ECHO'),'read_timeout')]:
            with self.subTest(code=code),patch.object(module.requests,'post',side_effect=exc):
                r=self.client.post('/ai/chat',json=self.payload());self.assertEqual(r.json['diagnostics']['errorType'],code);self.assertIn('elapsedMs',r.json['diagnostics']);self.assertNotIn('SECRET',r.get_data(as_text=True))
        self.config['baseUrl']='https://api.deepseek.com'
        with patch.object(module.socket,'getaddrinfo',side_effect=module.socket.gaierror('SECRET-SHOULD-NOT-ECHO')):
            r=self.client.post('/ai/chat',json=self.payload());self.assertEqual(r.json['diagnostics']['errorType'],'dns_error');self.assertEqual(r.json['diagnostics']['phase'],'dns');self.assertNotIn('SECRET',r.get_data(as_text=True))

if __name__=='__main__': unittest.main()
