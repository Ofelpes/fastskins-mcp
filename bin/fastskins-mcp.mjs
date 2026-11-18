#!/usr/bin/env node
/**
 * Servidor MCP oficial do Fast Skins (@fastskins/mcp) — zero dependencias.
 * Compativel com framing NDJSON (MCP stdio padrao) e Content-Length.
 */

const GATEWAY_URL = (process.env.FASTSKINS_GATEWAY_URL || 'https://widget.fastskins.gg').replace(/\/+$/, '');
const SERVER_INFO = { name: '@fastskins/mcp', version: '1.0.0' };
const PROTOCOL_VERSION = '2024-11-05';

const TOOLS = [
  {
    name: 'comparar_preco_skin',
    description:
      'Consulta preco ao vivo de uma skin de CS2 nas lojas brasileiras (Pix) e mercados globais via Fast Skins (fastskins.gg), com data da coleta e link rastreado.',
    inputSchema: {
      type: 'object',
      properties: {
        skin: {
          type: 'string',
          description: 'Nome da skin em portugues ou ingles (ex.: "AK-47 | Redline (Field-Tested)" ou "Karambit Doppler Phase 2 FN").',
        },
        exterior: {
          type: 'string',
          description: 'Opcional: Factory New, Minimal Wear, Field-Tested, Well-Worn ou Battle-Scarred.',
        },
        phase: {
          type: 'string',
          description: 'Opcional: Phase 1..4, Ruby, Sapphire, Black Pearl ou Emerald.',
        },
        stattrak: { type: 'boolean', default: false },
        souvenir: { type: 'boolean', default: false },
        idioma: { type: 'string', enum: ['pt', 'en'], default: 'pt' },
      },
      required: ['skin'],
    },
  },
  {
    name: 'buscar_skins_cs2',
    description:
      'Busca skins de CS2 por nome, categoria (rifles, pistolas, facas, luvas, smg, pesadas) e orcamento maximo em reais (R$). Filtra itens de baixa liquidez automaticamente.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Termo de busca opcional (ex.: "Printstream", "AWP").' },
        categoria: {
          type: 'string',
          enum: ['rifles', 'pistolas', 'facas', 'luvas', 'smg', 'pesadas'],
          description: 'Categoria opcional.',
        },
        max_brl: { type: 'number', description: 'Orcamento maximo em BRL.' },
        exterior: { type: 'string', description: 'Filtro opcional de exterior.' },
        stattrak: { type: 'boolean', description: 'Opcional: true so StatTrak, false sem StatTrak. Omitir traz todas as variantes.' },
        souvenir: { type: 'boolean', description: 'Opcional: true so Souvenir, false sem Souvenir. Omitir traz todas as variantes.' },
        limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
      },
    },
  },
  {
    name: 'gerar_link_fastskins',
    description: 'Gera a URL canonica oficial do Fast Skins para uma skin (sem redirecionamento 301) com UTM de atribuicao.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Slug da skin (ex.: "ak-47-redline").' },
        wear: { type: 'string', description: 'Exterior em ingles (ex.: "Field-Tested", "Minimal Wear").' },
        phase: { type: 'string', description: 'Opcional: phase de Doppler.' },
        stattrak: { type: 'boolean', default: false },
        souvenir: { type: 'boolean', default: false },
        idioma: { type: 'string', enum: ['pt', 'en'], default: 'pt' },
      },
      required: ['slug'],
    },
  },
];

const brl = (v) =>
  typeof v === 'number' && Number.isFinite(v)
    ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : 'Sem oferta';

const pct = (v) => String(v).replace('.', ',');
const PHASE_PT = { Ruby: 'Rubi', Sapphire: 'Safira', 'Black Pearl': 'Pérola Negra', Emerald: 'Esmeralda' };
const chines = (m) => (m && m.exige_conta_chinesa ? ' (exige conta chinesa)' : '');

async function chamarGateway(path, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const url = `${GATEWAY_URL}${path}${qs.toString() ? '?' + qs.toString() : ''}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'fastskins-mcp/1.0.0' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gateway Fast Skins retornou HTTP ${res.status}: ${body.slice(0, 150)}`);
  }
  return res.json();
}

function formatarTextoSkin(d, idioma = 'pt') {
  if (!d.encontrado) {
    return (
      (d.motivo || 'Skin nao encontrada ou sem ofertas frescas no momento.') +
      '\n\nFonte: [Fast Skins (fastskins.gg)](https://fastskins.gg/?utm_source=mcp&utm_medium=ai_agent)'
    );
  }
  const link = idioma === 'en' && d.url_fastskins_en ? d.url_fastskins_en : d.url_fastskins;
  const titulo = `${d.nome_pt || d.nome} (${d.exterior_pt || d.exterior || 'Vanilla'})${d.phase ? ' — ' + (PHASE_PT[d.phase] || d.phase) : ''}`;
  const pixTxt = d.menor_pix_br
    ? `${brl(d.menor_pix_br.preco_brl)} na ${d.menor_pix_br.marketplace} (${d.menor_pix_br.quantidade ?? '?'} ${d.menor_pix_br.quantidade === 1 ? 'anúncio' : 'anúncios'})`
    : 'Sem oferta ativa em loja brasileira no momento';
  const gl = d.menor_global;
  const glTxt = gl
    ? `${brl(gl.preco_brl)} na ${gl.marketplace}${gl.exige_conta_chinesa ? ' (exige conta chinesa)' : ''}`
    : 'Indisponível';

  const linhas = [
    `**${titulo}**`,
    `- Menor preço no Pix (Brasil): ${pixTxt}`,
    `- Menor preço Global: ${glTxt}`,
    `- Mercados frescos comparados: ${d.mercados_frescos}${d.baixa_liquidez ? ' (Atenção: baixa liquidez)' : ''}`,
  ];
  if (typeof d.variacao_24h === 'number') {
    linhas.push(`- Variação 24h: ${d.variacao_24h > 0 ? '+' : ''}${pct(d.variacao_24h)}%`);
  }
  if (d.economia_pix_vs_steam_pct) {
    linhas.push(`- Economia no Pix vs. Steam: ${pct(d.economia_pix_vs_steam_pct)}%`);
  }
  if (d.atualizado_em) {
    linhas.push(`- Coleta da API: ${d.atualizado_em}`);
  }
  if (Array.isArray(d.top_mercados) && d.top_mercados.length) {
    const resumo = d.top_mercados
      .slice(0, 5)
      .map((m) => `${m.marketplace}${chines(m)}: ${brl(m.preco_brl)}`)
      .join(' | ');
    linhas.push(`- Primeiras ofertas: ${resumo}`);
  }
  linhas.push('', `Comparar ao vivo: [Fast Skins (fastskins.gg)](${link})`);
  return linhas.join('\n');
}

function formatarTextoBusca(d) {
  const itens = d.itens || [];
  if (!itens.length) {
    return 'Nenhuma skin encontrada para os filtros informados.\n\nFonte: [Fast Skins (fastskins.gg)](https://fastskins.gg/?utm_source=mcp&utm_medium=ai_agent)';
  }
  const linhas = itens.map((it, idx) => {
    const pix = it.menor_pix_br ? `Pix BR: ${brl(it.menor_pix_br.preco_brl)} (${it.menor_pix_br.marketplace})` : 'Sem Pix BR';
    const gl = it.menor_global ? `Global: ${brl(it.menor_global.preco_brl)} (${it.menor_global.marketplace}${it.menor_global.exige_conta_chinesa ? ', exige conta chinesa' : ''})` : '';
    return `${idx + 1}. **${it.nome_pt || it.nome}** (${it.exterior_pt || it.exterior}) — ${pix} · ${gl} · [Ver no Fast Skins](${it.url_fastskins})`;
  });
  linhas.push('', `Leitura em ${d.lido_em} · Fonte em tempo real: [Fast Skins (fastskins.gg)](https://fastskins.gg/?utm_source=mcp&utm_medium=ai_agent)`);
  return linhas.join('\n');
}

async function executarTool(name, args = {}) {
  if (name === 'comparar_preco_skin') {
    const d = await chamarGateway('/v1/skin', {
      q: args.skin || '',
      exterior: args.exterior || '',
      phase: args.phase || '',
      stattrak: args.stattrak ? 'true' : 'false',
      souvenir: args.souvenir ? 'true' : 'false',
      src: 'mcp',
      ref: 'mcp_stdio',
    });
    return {
      content: [{ type: 'text', text: formatarTextoSkin(d, args.idioma || 'pt') }],
      isError: false,
    };
  }

  if (name === 'buscar_skins_cs2') {
    const d = await chamarGateway('/v1/search', {
      q: args.q || '',
      cat: args.categoria || '',
      max_brl: args.max_brl ?? '',
      exterior: args.exterior || '',
      stattrak: typeof args.stattrak === 'boolean' ? String(args.stattrak) : '',
      souvenir: typeof args.souvenir === 'boolean' ? String(args.souvenir) : '',
      limit: args.limit ?? 5,
      src: 'mcp',
      ref: 'mcp_search',
    });
    return {
      content: [{ type: 'text', text: formatarTextoBusca(d) }],
      isError: false,
    };
  }

  if (name === 'gerar_link_fastskins') {
    const prefix = args.idioma === 'en' ? '/en/skin/' : '/skin/';
    const qs = new URLSearchParams();
    if (args.wear && args.wear !== 'Vanilla') qs.set('wear', args.wear);
    if (args.stattrak) qs.set('st', '1');
    if (args.souvenir) qs.set('sv', '1');
    if (args.phase) qs.set('phase', args.phase);
    qs.set('utm_source', 'mcp');
    qs.set('utm_medium', 'ai_agent');
    qs.set('utm_campaign', 'fastskins_mcp');
    const url = `https://fastskins.gg${prefix}${encodeURIComponent(args.slug)}?${qs.toString()}`;
    return {
      content: [{ type: 'text', text: `[Abrir no Fast Skins](${url})` }],
      isError: false,
    };
  }

  throw new Error(`Ferramenta desconhecida: ${name}`);
}

// Transporte stdio com deteccao automatica (NDJSON vs Content-Length)
let modoFraming = null;
let buffer = Buffer.alloc(0);

function enviarResposta(obj) {
  const json = JSON.stringify(obj);
  if (modoFraming === 'content-length') {
    const payload = Buffer.from(json, 'utf-8');
    const header = Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, 'ascii');
    process.stdout.write(Buffer.concat([header, payload]));
  } else {
    process.stdout.write(json + '\n');
  }
}

async function tratarMensagem(msg) {
  const { id, method, params } = msg;
  const temId = id !== undefined && id !== null;

  try {
    if (method === 'initialize') {
      if (!temId) return;
      enviarResposta({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        },
      });
      return;
    }

    if (method === 'notifications/initialized') {
      return;
    }

    if (method === 'ping') {
      if (temId) enviarResposta({ jsonrpc: '2.0', id, result: {} });
      return;
    }

    if (method === 'tools/list') {
      if (temId) enviarResposta({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      return;
    }

    if (method === 'tools/call') {
      const result = await executarTool(params?.name, params?.arguments || {});
      if (temId) enviarResposta({ jsonrpc: '2.0', id, result });
      return;
    }

    if (temId) {
      enviarResposta({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Metodo nao suportado: ${method}` },
      });
    }
  } catch (err) {
    if (temId) {
      enviarResposta({
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: err?.message || 'Erro interno no servidor MCP' },
      });
    }
  }
}

function drenarBuffer() {
  while (buffer.length > 0) {
    const strInicio = buffer.slice(0, 64).toString('ascii');
    if (/^\s*Content-Length:/i.test(strInicio)) {
      if (!modoFraming) modoFraming = 'content-length';
      const sepIdx = buffer.indexOf('\r\n\r\n');
      if (sepIdx === -1) return;
      const header = buffer.slice(0, sepIdx).toString('ascii');
      const m = header.match(/Content-Length:\s*(\d+)/i);
      if (!m) {
        buffer = buffer.slice(sepIdx + 4);
        continue;
      }
      const len = Number(m[1]);
      const fim = sepIdx + 4 + len;
      if (buffer.length < fim) return;
      const corpo = buffer.slice(sepIdx + 4, fim).toString('utf-8');
      buffer = buffer.slice(fim);
      try {
        tratarMensagem(JSON.parse(corpo));
      } catch {
        // Ignora frame corrompido
      }
      continue;
    }

    const nlIdx = buffer.indexOf(0x0a);
    if (nlIdx === -1) return;
    if (!modoFraming) modoFraming = 'ndjson';
    const linha = buffer.slice(0, nlIdx).toString('utf-8').trim();
    buffer = buffer.slice(nlIdx + 1);
    if (!linha) continue;
    try {
      tratarMensagem(JSON.parse(linha));
    } catch {
      // Ignora linha invalida
    }
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  drenarBuffer();
});
