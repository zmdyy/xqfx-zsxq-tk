"""Local-only model transport. Source data remains browser-owned; no keys are persisted."""
import ipaddress
import socket
from urllib.parse import urlsplit
import requests
from flask import jsonify, request


class ApiConfigError(ValueError):
    pass


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
        return jsonify(ok=True, service='score-ai-practice', version=2)

    @app.route('/ai/chat', methods=['POST'])
    def ai_chat():
        if not local_request():
            return jsonify(ok=False, error='仅允许本地同源调用'), 403
        if request.content_length and request.content_length > 20 * 1024 * 1024:
            return jsonify(ok=False, error='请求图片过大，请减少本次人数或相关图片'), 413
        try:
            data = request.get_json(silent=True)
            if not isinstance(data, dict) or not isinstance(data.get('config'), dict):
                raise ApiConfigError('请求配置格式无效，请刷新页面后重试')
            config = data['config']
            key = str(config.get('apiKey') or '')
            endpoint = str(config.get('baseUrl') or '').rstrip('/')
            url = urlsplit(endpoint)
            if url.username or url.password or url.query or url.fragment or not url.hostname:
                raise ApiConfigError('API 地址格式无效')
            testing_local = app.testing and url.hostname in ('127.0.0.1', 'localhost')
            if url.scheme != 'https' and not testing_local:
                raise ApiConfigError('外部 API 地址必须使用 HTTPS')
            if not testing_local:
                addresses = socket.getaddrinfo(url.hostname, url.port or 443, type=socket.SOCK_STREAM)
                if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
                    raise ApiConfigError('API 地址必须指向外部公共服务')
            model = str(config.get('model') or '').strip()
            messages = data.get('messages')
            if not key or len(key) > 2048 or '\n' in key or '\r' in key or not model:
                raise ApiConfigError('请填写有效的模型名称和 API 密钥')
            if not isinstance(messages, list) or not messages or len(messages) > 100:
                raise ApiConfigError('请求消息格式无效')
            for message in messages:
                if not isinstance(message, dict) or message.get('role') not in ('system', 'user', 'assistant'):
                    raise ApiConfigError('消息角色无效')
            endpoint = endpoint if endpoint.endswith('/chat/completions') else endpoint + '/chat/completions'
            payload = {'model': model, 'messages': messages, 'max_tokens': 8192}
            if url.hostname == 'api.deepseek.com':
                if payload['model'] == 'deepseek-flas':
                    payload['model'] = 'deepseek-flash'
                payload.update(response_format={'type': 'json_object'}, thinking={'type': 'disabled'})
            response = requests.post(endpoint, headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'},
                                     json=payload,
                                     timeout=(10, 180), allow_redirects=False)
            if not response.ok or 300 <= response.status_code < 400:
                # Do not copy upstream bodies or headers: they may echo credentials or source data.
                return jsonify(ok=False, error='模型服务返回 HTTP ' + str(response.status_code) + '，请检查模型、额度和图片能力'), 502
            try:
                result = response.json()
            except ValueError:
                return jsonify(ok=False, error='模型服务返回非 JSON，可能是网关异常或接口地址不正确'), 502
            if not isinstance(result, dict) or not isinstance(result.get('choices'), list) or not result['choices'] or not isinstance(result['choices'][0], dict) or not isinstance(result['choices'][0].get('message'), dict):
                return jsonify(ok=False, error='模型服务返回格式不兼容：缺少 choices[0].message，请检查是否使用 chat/completions 接口'), 502
            choice = result['choices'][0]
            if choice.get('finish_reason') == 'length':
                return jsonify(ok=False, error='模型回复达到输出上限，结果被截断；请重试失败项'), 502
            if choice.get('finish_reason') == 'content_filter':
                return jsonify(ok=False, error='模型服务拦截了本次内容，请检查题图后重试'), 502
            content = choice['message'].get('content')
            if isinstance(content, list):
                content = '\n'.join(str(x.get('text', '')) for x in content if isinstance(x, dict))
            if not isinstance(content, str) or not content.strip():
                error = '模型只返回思考内容，未给出最终结果；DeepSeek 请使用内置默认配置后重试' if choice['message'].get('reasoning_content') else '模型返回空内容，请重试失败项或更换模型'
                return jsonify(ok=False, error=error), 502
            return jsonify(ok=True, content=content)
        except ApiConfigError as exc:
            # Only local validation messages are returned; upstream errors are handled above.
            return jsonify(ok=False, error=str(exc)), 400
        except (ValueError, TypeError):
            return jsonify(ok=False, error='API 地址格式无效，请检查协议、主机和端口'), 400
        except requests.Timeout:
            return jsonify(ok=False, error='模型响应超时，已完成的学生结果保留，可重试失败项'), 504
        except (requests.RequestException, OSError):
            return jsonify(ok=False, error='无法连接模型服务，请检查网络和 API 地址'), 502
