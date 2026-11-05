/**
 * API do Campeonato Particular COD Mobile
 * Compatível com o HTML do site (estado, stream, login, senha, hora)
 *
 * Deploy gratuito: Render, Railway ou Fly.io
 */
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

/* ========== Estado em memória ========== */
const estado = {
  count: 0,
  max: 100,
  preco: 35,
  whats: '5531998605180',
  code: '',
  evento: '', // datetime-local string
  history: [],
  senha: process.env.ADM_SENHA || '2238'
};

/* Token de sessão ADM (simples, em memória) */
const tokens = new Set();

/* Clientes SSE conectados */
const clientes = new Set();

/* ========== Middlewares ========== */
app.use(cors({ origin: true })); // libera Netlify e qualquer origem
app.use(express.json({ limit: '100kb' }));

/* ========== Helpers ========== */
function agora() {
  return Date.now();
}

function snapshot() {
  return {
    count: estado.count,
    max: estado.max,
    preco: estado.preco,
    whats: estado.whats,
    code: estado.code,
    evento: estado.evento,
    history: estado.history.slice(-80),
    agora: agora()
  };
}

function broadcast() {
  const data = `data: ${JSON.stringify(snapshot())}\n\n`;
  for (const res of clientes) {
    try {
      res.write(data);
    } catch (_) {
      clientes.delete(res);
    }
  }
}

function tokenValido(req) {
  const t = req.headers['x-adm-token'] || '';
  return t && tokens.has(t);
}

function gerarToken() {
  return crypto.randomBytes(24).toString('hex');
}

/* ========== Rotas ========== */

/** Saúde */
app.get('/', (_req, res) => {
  res.json({ ok: true, serviço: 'Campeonato COD Mobile API', agora: agora() });
});

/** Hora do servidor */
app.get('/api/hora', (_req, res) => {
  res.json({ agora: agora() });
});

/** Estado atual (público) */
app.get('/api/estado', (_req, res) => {
  res.json(snapshot());
});

/** Atualizar estado (só com token ADM) */
app.post('/api/estado', (req, res) => {
  if (!tokenValido(req)) {
    return res.status(401).json({ erro: 'Não autorizado' });
  }

  const b = req.body || {};

  if (typeof b.count === 'number') estado.count = Math.max(0, Math.min(b.count, 9999));
  if (typeof b.max === 'number') estado.max = Math.max(1, Math.min(b.max, 9999));
  if (typeof b.preco === 'number') estado.preco = Math.max(0, b.preco);
  if (typeof b.whats === 'string') estado.whats = b.whats.replace(/\D/g, '') || estado.whats;
  if (typeof b.code === 'string') estado.code = b.code.trim().toUpperCase().slice(0, 40);
  if (typeof b.evento === 'string') estado.evento = b.evento;
  if (Array.isArray(b.history)) estado.history = b.history.slice(-80);

  // Garante que o contador não passa do máximo
  estado.count = Math.min(estado.count, estado.max);

  broadcast();
  res.json(snapshot());
});

/** Stream em tempo real (SSE) */
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  // Envia estado atual na conexão
  res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
  clientes.add(res);

  // Keep-alive a cada 25s (evita timeout de proxy)
  const keep = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (_) {
      clearInterval(keep);
      clientes.delete(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(keep);
    clientes.delete(res);
  });
});

/** Login do organizador */
app.post('/api/login', (req, res) => {
  const senha = String((req.body && req.body.senha) || '');
  if (senha && senha === estado.senha) {
    const token = gerarToken();
    tokens.add(token);
    // Limita quantidade de tokens ativos
    if (tokens.size > 20) {
      const primeiro = tokens.values().next().value;
      tokens.delete(primeiro);
    }
    return res.json({ token, ok: true });
  }
  res.status(401).json({ erro: 'Senha incorreta' });
});

/** Trocar senha (só com token) */
app.post('/api/senha', (req, res) => {
  if (!tokenValido(req)) {
    return res.status(401).json({ erro: 'Não autorizado' });
  }
  const nova = String((req.body && req.body.nova) || '').trim();
  if (nova.length < 4) {
    return res.status(400).json({ erro: 'Senha muito curta' });
  }
  estado.senha = nova;
  res.json({ ok: true });
});

/* ========== Start ========== */
app.listen(PORT, () => {
  console.log(`API COD Mobile rodando na porta ${PORT}`);
  console.log(`Senha ADM inicial: ${estado.senha}`);
});
