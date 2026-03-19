'use strict';

const express = require('express');
const https   = require('https');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CONFIG ──────────────────────────────────────────────────────────────────

const N8N_URL = (process.env.N8N_URL || 'https://n8n.timeprimo.com').replace(/\/$/, '');
const API_KEY = process.env.N8N_API_KEY || '';

if (!API_KEY) {
  console.warn('[WARN] N8N_API_KEY não definida. As chamadas à API vão falhar.');
}

const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MINUTES || '60', 10) * 60 * 1000;

// IDs-alvo: 26 lead-capture + roteador + subflows + externos
const TARGET_IDS = [
  // Lead Capture
  '7WyJuaN2yGeMgLes', 'oC4n2Mfqr5xc09aE', 'vtaf2xKkldFQaWhS', 'HJfPFDN8CQai2iTy',
  'wUV5H6iKuj9NQaIj', 'TAajZzr5IXz64Dif', 'Iiqm4zstTraKehNQ', 'rvtoEVF0AFtfG9bn',
  'D39YbOxrLw5ldIM2', '5TXqpiI54hXFdAyq', 'DrfFW3LnFyJxXoK9', 'jwbxWDh6QpkBjk2k',
  'OOBMiMBlMOUtnovi', 'MLLriTgQxSvWPE8Q', '7MRucTinqJnBBFIb', 'i2cReypAGl74SZjt',
  '5oeH8Hr8hfbIRoHs', 'X4OhhDfeXV6xhEfp', 'Dm8ttrpegNchLBsU', 'sSVevrtS0TM3C2T0',
  'O99kMSTVQcnI7jOe', 'Jl49Lmk6AgzOFNX5', 'pbQpCkSOuDRtecpz', 'eJVQdYO155DJoHCV',
  'G2QYUyrS3yRusgKb', 'QddKcpFWS7vHaZys',
  // Roteador
  'xz7enrd2Jt5A6Dv2',
  // SubFlows
  'Cjr3GNU5vHU5ZaHt', 'pACUaII7TvDewlsV', 'Sf6OPopONLMwUqGc',
  // Externos
  'OMsIGyqY69UPOeD5', 'aIqfJiD2tLaFMv4Q', 'R97OxbUiOFrqrR4O',
];

// ── CACHE ───────────────────────────────────────────────────────────────────

let cache = {
  data:        null,   // { [wfId]: workflowObject }
  lastUpdate:  null,   // Date
  refreshing:  false,
};

// ── HELPERS DE API ──────────────────────────────────────────────────────────

function apiGet(urlPath) {
  return new Promise((resolve, reject) => {
    const fullUrl = `${N8N_URL}${urlPath}`;
    const req = https.request(fullUrl, {
      headers: { 'X-N8N-API-KEY': API_KEY },
    }, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error(`JSON inválido em ${urlPath}: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error(`Timeout: ${fullUrl}`)); });
    req.end();
  });
}

async function fetchWorkflow(id) {
  try {
    return await apiGet(`/api/v1/workflows/${id}`);
  } catch (err) {
    console.error(`[ERRO] workflow ${id}:`, err.message);
    return { id, _error: err.message };
  }
}

async function refreshCache() {
  if (cache.refreshing) return;
  cache.refreshing = true;
  console.log(`[INFO] Atualizando cache — ${TARGET_IDS.length} workflows…`);

  const start = Date.now();
  const results = {};

  // Busca em paralelo com concorrência limitada (5 por vez) para não sobrecarregar a API
  const CONCURRENCY = 5;
  for (let i = 0; i < TARGET_IDS.length; i += CONCURRENCY) {
    const batch = TARGET_IDS.slice(i, i + CONCURRENCY);
    const resolved = await Promise.all(batch.map(fetchWorkflow));
    resolved.forEach(wf => { results[wf.id] = wf; });
  }

  cache.data       = results;
  cache.lastUpdate = new Date();
  cache.refreshing = false;
  console.log(`[INFO] Cache atualizado em ${Date.now() - start}ms`);
}

// Warm-up na inicialização
refreshCache();

// Renovação automática em background
setInterval(refreshCache, CACHE_TTL_MS);

// ── ROTAS ────────────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));

/** Retorna os dados de todos os workflows (JSON puro, sem o wrapper "WF_DATA =") */
app.get('/api/wf-data', async (req, res) => {
  // Se o cache ainda está vazio (cold start), aguarda
  if (!cache.data) {
    await refreshCache();
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    data:        cache.data,
    lastUpdate:  cache.lastUpdate,
    ttlMinutes:  CACHE_TTL_MS / 60000,
  });
});

/** Força atualização imediata do cache */
app.post('/api/refresh', async (req, res) => {
  await refreshCache();
  res.json({ ok: true, lastUpdate: cache.lastUpdate });
});

/** Health check para Railway */
app.get('/health', (_req, res) => {
  res.json({
    status:     'ok',
    lastUpdate: cache.lastUpdate,
    workflows:  cache.data ? Object.keys(cache.data).length : 0,
  });
});

app.listen(PORT, () => {
  console.log(`[INFO] Servidor rodando na porta ${PORT}`);
  console.log(`[INFO] Cache TTL: ${CACHE_TTL_MS / 60000} minutos`);
});
