"""Local-only model relay with allowlisted, response-only diagnostic metadata."""
import ipaddress
import socket
import re
import time
import uuid
from urllib.parse import urlsplit
import requests
from flask import jsonify, request

BUILD = '20261028-unified-v1'


class ApiConfigError(ValueError):
    pass


def _usage(value):
    value = value if isinstance(value, dict) else {}
    out = {k: v for k in ('prompt_tokens', 'completion_tokens', 'total_tokens', 'prompt_cache_hit_tokens', 'prompt_cache_miss_tokens')
           if isinstance((v := value.get(k)), (int, float)) and not isinstance(v, bool) and v >= 0}
    details = value.get('completion_tokens_details')
    if isinstance(details, dict) and isinstance(details.get('reasoning_tokens'), (int, float)):
        out['completion_tokens_details'] = {'reasoning_tokens': details['reasoning_tokens']}
    return out


def _network_code(exc):
    # Inspect types only. Exception messages can contain URLs, proxy credentials or echoed bodies.
    names, pending, visited = set(), [exc], set()
    while pending and len(visited) < 16:
        current = pending.pop()
        if id(current) in visited:
            continue
        visited.add(id(current)); names.add(type(current).__name__)
        pending.extend(x for x in (getattr(current, '__cause__', None), getattr(current, '__context__', None), getattr(current, 'reason', None), *getattr(current, 'args', ())) if isinstance(x, BaseException))
    if names & {'SSLError', 'SSLCertVerificationError', 'CertificateError'}:
        return 'tls_error'
    if 'ProxyError' in names:
        return 'proxy_error'
    if names & {'gaierror', 'NameResolutionError'}:
        return 'dns_error'
    return 'connection_error'


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
        return jsonify(ok=True, service='score-ai-practice', version=3, build=BUILD)

    @app.route('/ai/chat', methods=['POST'])
    def ai_chat():
        if not local_request():
            return jsonify(ok=False, error='仅允许本地同源调用'), 403
        start = time.monotonic()
        meta = {'build': BUILD, 'requestId': uuid.uuid4().hex, 'phase': 'validation'}

        def reply(status, error=None, content=None, error_type=None):
            meta['elapsedMs'] = round((time.monotonic() - start) * 1000)
            if error_type:
                meta['errorType'] = error_type
            return jsonify(ok=not error, **({'error': error} if error else {'content': content}), diagnostics=meta), status

        if request.content_length and request.content_length > 20 * 1024 * 1024:
            return reply(413, '请求图片过大，请减少相关图片', error_type='payload_too_large')
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
                meta['phase'] = 'dns'
                addresses = socket.getaddrinfo(url.hostname, url.port or 443, type=socket.SOCK_STREAM)
                if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
                    raise ApiConfigError('API 地址必须指向外部公共服务')
            meta['phase'] = 'validation'
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
            meta.update(maxTokens=8192, jsonMode=False)
            if url.hostname == 'api.deepseek.com':
                if payload['model'] == 'deepseek-flas':
                    payload['model'] = 'deepseek-flash'
                payload.update(response_format={'type': 'json_object'}, thinking={'type': 'disabled'})
                meta.update(thinking='disabled', jsonMode=True)
            meta['phase'] = 'upstream'
            response = requests.post(endpoint, headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'},
                                     json=payload, timeout=(10, 180), allow_redirects=False)
            meta['upstreamStatus'] = response.status_code
            if not response.ok or 300 <= response.status_code < 400:
                return reply(502, '模型服务返回 HTTP ' + str(response.status_code) + '，请检查模型、额度和图片能力', error_type='upstream_http')
            meta['phase'] = 'parse'
            try:
                result = response.json()
            except ValueError:
                return reply(502, '模型服务返回非 JSON，可能是网关异常或接口地址不正确', error_type='non_json')
            if not isinstance(result, dict) or not isinstance(result.get('choices'), list) or not result['choices'] or not isinstance(result['choices'][0], dict) or not isinstance(result['choices'][0].get('message'), dict):
                return reply(502, '模型服务返回格式不兼容：缺少 choices[0].message，请检查是否使用 chat/completions 接口', error_type='response_schema')
            if isinstance(result.get('model'), str) and re.fullmatch(r'[A-Za-z0-9_.:-]{1,100}', result['model']) and key not in result['model']:
                meta['model'] = result['model']
            choice = result['choices'][0]
            reason = choice.get('finish_reason')
            if reason in ('stop', 'length', 'content_filter', 'tool_calls', 'insufficient_system_resource', 'aborted'):
                meta['finishReason'] = reason
            meta['usage'] = _usage(result.get('usage'))
            content = choice['message'].get('content')
            if isinstance(content, list):
                content = '\n'.join(x['text'] for x in content if isinstance(x, dict) and isinstance(x.get('text'), str))
            meta['responseCharacters'] = len(content) if isinstance(content, str) else 0
            reasoning = choice['message'].get('reasoning_content')
            meta['reasoningCharacters'] = len(reasoning) if isinstance(reasoning, str) else 0
            if reason == 'length':
                return reply(502, '模型因长度限制中止（输出额度或上下文限制），请导出调用诊断后排查', error_type='length_limit')
            if reason == 'content_filter':
                return reply(502, '模型服务拦截了本次内容，请检查题图后重试', error_type='content_filter')
            if not isinstance(content, str) or not content.strip():
                error = '模型只返回思考内容，未给出最终结果；DeepSeek 请使用内置默认配置后重试' if meta['reasoningCharacters'] else '模型返回空内容，请重试失败项或更换模型'
                return reply(502, error, error_type='reasoning_only' if meta['reasoningCharacters'] else 'empty_content')
            meta['phase'] = 'response'
            return reply(200, content=content)
        except ApiConfigError as exc:
            return reply(400, str(exc), error_type='invalid_config')
        except (ValueError, TypeError):
            return reply(400, 'API 地址格式无效，请检查协议、主机和端口', error_type='invalid_config')
        except requests.ConnectTimeout:
            return reply(504, '连接模型服务超时，请检查网络或代理', error_type='connect_timeout')
        except requests.ReadTimeout:
            return reply(504, '等待模型回复超时，已完成结果保留，可重试失败项', error_type='read_timeout')
        except requests.Timeout:
            return reply(504, '模型请求超时，已完成结果保留，可重试失败项', error_type='timeout')
        except (requests.RequestException, OSError) as exc:
            code = _network_code(exc)
            messages = {'dns_error': '模型服务域名解析失败，请检查 DNS 或网络', 'tls_error': '连接模型服务时 TLS 证书验证失败，请检查证书与代理', 'proxy_error': '连接模型服务的代理失败，请检查代理设置', 'connection_error': '连接模型服务中断，请检查网络并导出调用诊断'}
            return reply(502, messages[code], error_type=code)
