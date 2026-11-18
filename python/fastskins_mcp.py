"""Servidor MCP oficial do Fast Skins em Python 3.10+ (zero dependencias)."""
import json
import os
import sys
import urllib.parse
import urllib.request

GATEWAY_URL = os.environ.get('FASTSKINS_GATEWAY_URL', 'https://widget.fastskins.gg').rstrip('/')
SERVER_INFO = {'name': 'fastskins-mcp-python', 'version': '1.0.0'}
PROTOCOL_VERSION = '2024-11-05'

TOOLS = [
    {
        'name': 'comparar_preco_skin',
        'description': 'Consulta preco ao vivo de uma skin de CS2 nas lojas brasileiras (Pix) e mercados globais via Fast Skins (fastskins.gg).',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'skin': {'type': 'string', 'description': 'Nome da skin (ex.: "AK-47 | Redline (Field-Tested)").'},
                'exterior': {'type': 'string'},
                'phase': {'type': 'string'},
                'stattrak': {'type': 'boolean', 'default': False},
                'souvenir': {'type': 'boolean', 'default': False},
                'idioma': {'type': 'string', 'enum': ['pt', 'en'], 'default': 'pt'},
            },
            'required': ['skin'],
        },
    },
    {
        'name': 'buscar_skins_cs2',
        'description': 'Busca skins de CS2 por nome, categoria e orcamento maximo em reais (R$).',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'q': {'type': 'string'},
                'categoria': {'type': 'string'},
                'max_brl': {'type': 'number'},
                'exterior': {'type': 'string'},
                'stattrak': {'type': 'boolean', 'description': 'Opcional: true so StatTrak, false sem. Omitir traz todas.'},
                'souvenir': {'type': 'boolean', 'description': 'Opcional: true so Souvenir, false sem. Omitir traz todas.'},
                'limit': {'type': 'integer', 'default': 5},
            },
        },
    },
]


_PHASE_PT = {'Ruby': 'Rubi', 'Sapphire': 'Safira', 'Black Pearl': 'Pérola Negra', 'Emerald': 'Esmeralda'}


def _brl(v):
    if isinstance(v, (int, float)):
        s = f'{v:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
        return f'R$ {s}'
    return 'Sem oferta'


def _get(path, params):
    qs = urllib.parse.urlencode({k: v for k, v in params.items() if v not in (None, '')})
    url = f'{GATEWAY_URL}{path}?{qs}' if qs else f'{GATEWAY_URL}{path}'
    req = urllib.request.Request(url, headers={'Accept': 'application/json', 'User-Agent': 'fastskins-mcp-py/1.0'})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode('utf-8'))


def _executar_tool(name, args):
    if name == 'comparar_preco_skin':
        d = _get('/v1/skin', {
            'q': args.get('skin', ''),
            'exterior': args.get('exterior', ''),
            'phase': args.get('phase', ''),
            'stattrak': 'true' if args.get('stattrak') else 'false',
            'souvenir': 'true' if args.get('souvenir') else 'false',
            'src': 'mcp',
            'ref': 'mcp_python',
        })
        if not d.get('encontrado'):
            txt = (d.get('motivo') or 'Skin nao encontrada.') + '\n\nFonte: [Fast Skins (fastskins.gg)](https://fastskins.gg/?utm_source=mcp)'
        else:
            pix = d.get('menor_pix_br')
            gl = d.get('menor_global')
            pix_s = f"{_brl(pix['preco_brl'])} na {pix['marketplace']}" if pix else 'Sem oferta BR ativa'
            gl_s = f"{_brl(gl['preco_brl'])} na {gl['marketplace']}" + (' (exige conta chinesa)' if gl.get('exige_conta_chinesa') else '') if gl else 'Indisponivel'
            link = d.get('url_fastskins_en') if args.get('idioma') == 'en' else d.get('url_fastskins')
            txt = '\n'.join([
                f"**{d.get('nome_pt') or d.get('nome')} ({d.get('exterior_pt') or d.get('exterior')})" + (f" — {_PHASE_PT.get(d['phase'], d['phase'])}" if d.get('phase') else '') + "**",
                f'- Menor preço no Pix (Brasil): {pix_s}',
                f'- Menor preço Global: {gl_s}',
                f"- Mercados frescos: {d.get('mercados_frescos')}",
                f"- Coleta: {d.get('atualizado_em') or d.get('lido_em')}",
                '',
                f'Comparar ao vivo: [Fast Skins (fastskins.gg)]({link})',
            ])
        return {'content': [{'type': 'text', 'text': txt}], 'isError': False}

    if name == 'buscar_skins_cs2':
        d = _get('/v1/search', {
            'q': args.get('q', ''),
            'cat': args.get('categoria', ''),
            'max_brl': args.get('max_brl', ''),
            'exterior': args.get('exterior', ''),
            'stattrak': str(args['stattrak']).lower() if isinstance(args.get('stattrak'), bool) else '',
            'souvenir': str(args['souvenir']).lower() if isinstance(args.get('souvenir'), bool) else '',
            'limit': args.get('limit', 5),
            'src': 'mcp',
            'ref': 'mcp_python',
        })
        itens = d.get('itens') or []
        if not itens:
            txt = 'Nenhuma skin encontrada.\n\nFonte: [Fast Skins (fastskins.gg)](https://fastskins.gg/?utm_source=mcp)'
        else:
            linhas = []
            for i, it in enumerate(itens, 1):
                pix = f"Pix: {_brl(it['menor_pix_br']['preco_brl'])} ({it['menor_pix_br']['marketplace']})" if it.get('menor_pix_br') else 'Sem Pix BR'
                gl = f"Global: {_brl(it['menor_global']['preco_brl'])} ({it['menor_global']['marketplace']}{', exige conta chinesa' if it['menor_global'].get('exige_conta_chinesa') else ''})" if it.get('menor_global') else ''
                linhas.append(f"{i}. **{it.get('nome_pt') or it.get('nome')}** ({it.get('exterior_pt')}) — {pix} · {gl} · [Fast Skins]({it['url_fastskins']})")
            linhas.append('\nFonte: [Fast Skins (fastskins.gg)](https://fastskins.gg/?utm_source=mcp)')
            txt = '\n'.join(linhas)
        return {'content': [{'type': 'text', 'text': txt}], 'isError': False}

    raise ValueError(f'Ferramenta desconhecida: {name}')


def main():
    if hasattr(sys.stdin, 'reconfigure'):
        sys.stdin.reconfigure(encoding='utf-8')
        sys.stdout.reconfigure(encoding='utf-8')
    for linha in sys.stdin:
        linha = linha.strip()
        if not linha:
            continue
        msg = json.loads(linha)
        mid = msg.get('id')
        method = msg.get('method')
        params = msg.get('params') or {}
        if method == 'initialize':
            out = {'jsonrpc': '2.0', 'id': mid, 'result': {'protocolVersion': PROTOCOL_VERSION, 'capabilities': {'tools': {}}, 'serverInfo': SERVER_INFO}}
        elif method == 'notifications/initialized':
            continue
        elif method == 'ping':
            out = {'jsonrpc': '2.0', 'id': mid, 'result': {}}
        elif method == 'tools/list':
            out = {'jsonrpc': '2.0', 'id': mid, 'result': {'tools': TOOLS}}
        elif method == 'tools/call':
            try:
                res = _executar_tool(params.get('name'), params.get('arguments') or {})
                out = {'jsonrpc': '2.0', 'id': mid, 'result': res}
            except Exception as exc:
                out = {'jsonrpc': '2.0', 'id': mid, 'error': {'code': -32603, 'message': str(exc)}}
        elif mid is not None:
            out = {'jsonrpc': '2.0', 'id': mid, 'error': {'code': -32601, 'message': f'Metodo nao suportado: {method}'}}
        else:
            continue
        sys.stdout.write(json.dumps(out, ensure_ascii=False) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
