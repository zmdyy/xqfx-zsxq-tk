"""Local-only model transport. Source data remains browser-owned; no keys are persisted."""
import ipaddress
import socket
from urllib.parse import urlsplit
import requests
from flask import jsonify, request


def register_ai_practice(app):
    def local_request():
        try:
            if not ipaddress.ip_address(request.remote_addr or '').is_loopback:
                return False
        except ValueError:
            return False
        if urlsplit(request.host_url).hostname not in ('localhost', '127.0.0.1', '::1'):
            return False
        origin = request.headers.get('Origin')
        return not origin or origin.rstrip('/') == request.host_url.rstrip('/')

    @app.route('/ai/health', methods=['GET'])
    def ai_health():
        if not local_request():
            return jsonify(ok=False, error='请从本地启动地址使用 AI 推荐'), 403
        return jsonify(ok=True, service='score-ai-practice', version=1)

    @app.route('/ai/chat', methods=['POST'])
    def ai_chat():
        if not local_request():
            return jsonify(ok=False, error='仅允许本地同源调用'), 403
        if request.content_length and request.content_length > 20 * 1024 * 1024:
            return jsonify(ok=False, error='请求图片过大，请减少本次人数或相关图片'), 413
        data = request.get_json(silent=True) or {}
        config = data.get('config') or {}
        key = str(config.get('apiKey') or '')
        try:
            endpoint = str(config.get('baseUrl') or '').rstrip('/')
            url = urlsplit(endpoint)
            if url.username or url.password or url.query or url.fragment or not url.hostname:
                raise ValueError('API 地址格式无效')
            testing_local = app.testing and url.hostname in ('127.0.0.1', 'localhost')
            if url.scheme != 'https' and not testing_local:
                raise ValueError('外部 API 地址必须使用 HTTPS')
            if not testing_local:
                addresses = socket.getaddrinfo(url.hostname, url.port or 443, type=socket.SOCK_STREAM)
                if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
                    raise ValueError('API 地址必须指向外部公共服务')
            model = str(config.get('model') or '').strip()
            messages = data.get('messages')
            if not key or len(key) > 2048 or '\n' in key or '\r' in key or not model:
                raise ValueError('请填写有效的模型名称和 API 密钥')
            if not isinstance(messages, list) or not messages or len(messages) > 100:
                raise ValueError('请求消息格式无效')
            for message in messages:
                if not isinstance(message, dict) or message.get('role') not in ('system', 'user', 'assistant'):
                    raise ValueError('消息角色无效')
            endpoint = endpoint if endpoint.endswith('/chat/completions') else endpoint + '/chat/completions'
            response = requests.post(endpoint, headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'},
                                     json={'model': model, 'messages': messages, 'max_tokens': 4096},
                                     timeout=(10, 180), allow_redirects=False)
            if not response.ok or 300 <= response.status_code < 400:
                # Do not copy upstream bodies or headers: they may echo credentials or source data.
                return jsonify(ok=False, error='模型服务返回 HTTP ' + str(response.status_code) + '，请检查模型、额度和图片能力'), 502
            result = response.json()
            content = result['choices'][0]['message']['content']
            if isinstance(content, list):
                content = '\n'.join(str(x.get('text', '')) for x in content if isinstance(x, dict))
            if not isinstance(content, str) or not content.strip():
                raise ValueError('模型返回空内容，请检查模型配置')
            return jsonify(ok=True, content=content)
        except (ValueError, KeyError, IndexError, TypeError):
            return jsonify(ok=False, error='API 地址、配置或返回格式无效，请检查后重试'), 400
        except requests.Timeout:
            return jsonify(ok=False, error='模型响应超时，已完成的学生结果保留，可重试失败项'), 504
        except (requests.RequestException, OSError):
            return jsonify(ok=False, error='无法连接模型服务，请检查网络和 API 地址'), 502
