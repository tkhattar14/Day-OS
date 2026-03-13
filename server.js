#!/usr/bin/env node
// Focus App — Self-hosted daily operating system
// Zero npm dependencies — just Node.js
// HTTP + HTTPS + WebSocket

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { execSync } = require('child_process');
const { getCurrentSchedule, loadConfig } = require('./schedule');

// Load config
const config = loadConfig();
const PORT = process.env.PORT || config.server?.httpPort || 3141;
const HTTPS_PORT = process.env.HTTPS_PORT || config.server?.httpsPort || 3142;
const STATIC_DIR = __dirname;
const CERTS_DIR = path.join(__dirname, 'certs');
const AUDIO_DIR = path.join(__dirname, 'audio');
const DATA_DIR = path.join(__dirname, 'data');

// API keys from .env (loaded by setup or manually)
loadEnvFile();
const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const ELEVENLABS_VOICE = process.env.ELEVENLABS_VOICE || '';
const HOOKS_TOKEN = process.env.HOOKS_TOKEN || '';
const GATEWAY_PORT = process.env.GATEWAY_PORT || 18789;

// Ensure directories
[AUDIO_DIR, DATA_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// Simple .env loader (no dependencies)
function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const eq = line.indexOf('=');
      if (eq < 0) return;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      if (!process.env[key]) process.env[key] = val;
    });
  } catch (e) {}
}

const MIME_TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.svg': 'image/svg+xml',
};

// ===== STATE =====
const clients = new Set();
const messages = [];
const announcements = [];
let commitments = { date: '', commitments: [] };

const ANNOUNCEMENTS_FILE = path.join(DATA_DIR, 'announcements.json');
const COMMITMENTS_FILE = path.join(DATA_DIR, 'commitments.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'voice-messages.json');

// Load persisted state
try { messages.push(...JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'))); } catch (e) {}
try { announcements.push(...JSON.parse(fs.readFileSync(ANNOUNCEMENTS_FILE, 'utf8'))); } catch (e) {}
try { commitments = JSON.parse(fs.readFileSync(COMMITMENTS_FILE, 'utf8')); } catch (e) {}

// ===== ANNOUNCEMENTS =====
function addAnnouncement(text, type = 'info', source = 'system') {
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    text, type, source, timestamp: new Date().toISOString()
  };
  announcements.push(entry);
  if (announcements.length > 30) announcements.shift();
  try { fs.writeFileSync(ANNOUNCEMENTS_FILE, JSON.stringify(announcements, null, 2)); } catch (e) {}
  broadcast({ action: 'announcement', announcement: entry });
  return entry;
}

function removeAnnouncement(id) {
  const idx = announcements.findIndex(a => a.id === id);
  if (idx >= 0) {
    announcements.splice(idx, 1);
    try { fs.writeFileSync(ANNOUNCEMENTS_FILE, JSON.stringify(announcements, null, 2)); } catch (e) {}
    broadcast({ action: 'announcement_removed', id });
    return true;
  }
  return false;
}

// ===== WEBHOOK =====
function notifyWebhook(text) {
  const webhookConfig = config.webhook;
  if (!webhookConfig?.enabled && !HOOKS_TOKEN) return;
  
  const token = HOOKS_TOKEN || webhookConfig?.token || '';
  const url = webhookConfig?.url || `http://127.0.0.1:${GATEWAY_PORT}/hooks/wake`;
  if (!token) return;

  const template = webhookConfig?.messageTemplate || '[🎙️ Voice] User said: "{text}"';
  const message = template.replace('{text}', text);

  try {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const payload = JSON.stringify({ text: message, mode: 'now' });

    const req = transport.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => console.log(`[WEBHOOK] Response (${res.statusCode})`));
    });
    req.on('error', (e) => console.log(`[WEBHOOK] Error: ${e.message}`));
    req.write(payload);
    req.end();
  } catch (e) {
    console.log(`[WEBHOOK] Error: ${e.message}`);
  }
}

// ===== BROADCAST =====
function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
  });
}

function buildContext() {
  const schedule = getCurrentSchedule();
  let plan = null;
  try { plan = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'today.json'), 'utf8')); } catch (e) {}
  return { schedule, announcements, plan, commitments };
}

// ===== REQUEST HANDLER =====
async function handleRequest(req, res) {
  const setCors = () => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  };
  setCors();
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // === API: Command broadcast ===
  if (req.method === 'POST' && req.url === '/api/command') {
    const body = await readBody(req);
    try {
      broadcast(JSON.parse(body));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, clients: clients.size }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
    return;
  }

  // === API: TTS ===
  if (req.method === 'POST' && req.url === '/api/tts') {
    if (!ELEVENLABS_KEY) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ElevenLabs API key not configured. Set ELEVENLABS_API_KEY in .env' }));
      return;
    }
    const body = await readBody(req);
    try {
      const { text, voice } = JSON.parse(body);
      const voiceId = voice || ELEVENLABS_VOICE || 'pNInz6obpgDQGcFmaJgB'; // Default: Adam
      const filename = `tts-${Date.now()}.mp3`;
      const filepath = path.join(AUDIO_DIR, filename);

      const postData = JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      });

      const ttsReq = https.request({
        hostname: 'api.elevenlabs.io',
        path: `/v1/text-to-speech/${voiceId}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_KEY, 'Accept': 'audio/mpeg' }
      }, (ttsRes) => {
        if (ttsRes.statusCode !== 200) {
          let errBody = '';
          ttsRes.on('data', d => errBody += d);
          ttsRes.on('end', () => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'TTS failed', detail: errBody }));
          });
          return;
        }
        const fileStream = fs.createWriteStream(filepath);
        ttsRes.pipe(fileStream);
        fileStream.on('finish', () => {
          const audioUrl = `/audio/${filename}`;
          const ann = addAnnouncement(text, 'voice', 'assistant');
          broadcast({ action: 'play_audio', url: audioUrl, text, announcementId: ann.id });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, url: audioUrl, clients: clients.size, announcementId: ann.id }));
          cleanupAudio();
        });
      });
      ttsReq.on('error', (e) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      });
      ttsReq.write(postData);
      ttsReq.end();
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
    return;
  }

  // === API: STT via Whisper ===
  if (req.method === 'POST' && req.url === '/api/stt') {
    if (!OPENAI_KEY) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'OpenAI API key not configured. Set OPENAI_API_KEY in .env' }));
      return;
    }
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const audioBuffer = Buffer.concat(chunks);
      const tmpFile = path.join(AUDIO_DIR, `stt-${Date.now()}.webm`);
      fs.writeFileSync(tmpFile, audioBuffer);

      try {
        const result = execSync(
          `curl -s "https://api.openai.com/v1/audio/transcriptions" ` +
          `-H "Authorization: Bearer ${OPENAI_KEY}" ` +
          `-F "file=@${tmpFile}" -F "model=whisper-1" -F "language=en"`,
          { timeout: 30000 }
        ).toString();

        const parsed = JSON.parse(result);
        const transcript = parsed.text || '';

        if (transcript.trim()) {
          const entry = { text: transcript.trim(), timestamp: new Date().toISOString() };
          messages.push(entry);
          if (messages.length > 50) messages.shift();
          fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
          console.log(`[STT] User said: "${transcript}"`);
          notifyWebhook(transcript);
        }

        try { fs.unlinkSync(tmpFile); } catch (e) {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, text: transcript }));
      } catch (e) {
        try { fs.unlinkSync(tmpFile); } catch (e2) {}
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Transcription failed' }));
      }
    });
    return;
  }

  // === API: Messages ===
  if (req.method === 'GET' && req.url === '/api/messages') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(messages));
    return;
  }
  if (req.method === 'POST' && req.url === '/api/messages/clear') {
    messages.length = 0;
    try { fs.writeFileSync(MESSAGES_FILE, '[]'); } catch (e) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // === API: Announcements ===
  if (req.method === 'GET' && req.url === '/api/announcements') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(announcements));
    return;
  }
  if (req.method === 'POST' && req.url === '/api/announce') {
    const body = await readBody(req);
    try {
      const { text, type } = JSON.parse(body);
      const ann = addAnnouncement(text, type || 'info', 'api');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, announcement: ann }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
    return;
  }
  if (req.method === 'DELETE' && req.url.startsWith('/api/announcements/')) {
    const id = req.url.split('/').pop();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: removeAnnouncement(id) }));
    return;
  }
  if (req.method === 'POST' && req.url === '/api/announcements/clear') {
    announcements.length = 0;
    try { fs.writeFileSync(ANNOUNCEMENTS_FILE, '[]'); } catch (e) {}
    broadcast({ action: 'announcements_cleared' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // === API: Commitments / Goals ===
  if (req.method === 'POST' && req.url === '/api/commitments') {
    const body = await readBody(req);
    try {
      commitments = JSON.parse(body);
      fs.writeFileSync(COMMITMENTS_FILE, JSON.stringify(commitments, null, 2));
      broadcast({ action: 'commitments_updated', commitments });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
    return;
  }
  if (req.method === 'GET' && req.url === '/api/commitments') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(commitments));
    return;
  }

  // === API: Schedule ===
  if (req.method === 'GET' && req.url === '/api/schedule') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getCurrentSchedule()));
    return;
  }

  // === API: Full context ===
  if (req.method === 'GET' && req.url.startsWith('/api/context')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(buildContext()));
    return;
  }

  // === API: Status ===
  if (req.method === 'GET' && req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      clients: clients.size, uptime: process.uptime(),
      voice: { tts: !!ELEVENLABS_KEY, stt: !!OPENAI_KEY },
      webhook: !!(HOOKS_TOKEN || config.webhook?.enabled)
    }));
    return;
  }

  // === Static files ===
  let filePath = req.url.split('?')[0];
  if (filePath === '/') filePath = '/index.html';

  const fullPath = path.join(STATIC_DIR, filePath);
  if (!fullPath.startsWith(STATIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(fullPath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(fullPath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
}

// ===== WEBSOCKET SETUP =====
function setupWS(wss, label) {
  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`[${label}] Client connected (${clients.size} total)`);
    ws.send(JSON.stringify({ action: 'connected', message: 'Focus App online' }));

    // Push full context on connect
    try { ws.send(JSON.stringify({ action: 'context', ...buildContext() })); }
    catch (e) { console.log(`[${label}] Context push error:`, e.message); }

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[${label}] Client disconnected (${clients.size} total)`);
    });
    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data.event === 'voice_message' && data.text) {
          const entry = { text: data.text, timestamp: new Date().toISOString() };
          messages.push(entry);
          if (messages.length > 50) messages.shift();
          fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
          console.log(`[VOICE] "${data.text}"`);
          ws.send(JSON.stringify({ action: 'toast', title: 'Message sent', message: data.text, type: 'success' }));
        }
      } catch (e) {}
    });
  });
}

function cleanupAudio() {
  try {
    const files = fs.readdirSync(AUDIO_DIR).filter(f => f.startsWith('tts-')).sort().reverse();
    files.slice(20).forEach(f => { try { fs.unlinkSync(path.join(AUDIO_DIR, f)); } catch (e) {} });
  } catch (e) {}
}

// Push context every 15 seconds
setInterval(() => {
  if (clients.size === 0) return;
  try { broadcast({ action: 'context', ...buildContext() }); }
  catch (e) { console.log('[PUSH] Context error:', e.message); }
}, 15000);

// ===== START SERVERS =====
const server = http.createServer(handleRequest);
setupWS(new WebSocketServer({ server }), 'WS');

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ⚡ Focus App`);
  console.log(`  HTTP:  http://0.0.0.0:${PORT}`);
  console.log(`  API:   http://localhost:${PORT}/api/status\n`);
});

// HTTPS (required for microphone on iOS/iPad)
try {
  const sslOpts = {
    key: fs.readFileSync(path.join(CERTS_DIR, 'server.key')),
    cert: fs.readFileSync(path.join(CERTS_DIR, 'server.crt')),
  };
  const httpsServer = https.createServer(sslOpts, handleRequest);
  setupWS(new WebSocketServer({ server: httpsServer }), 'WSS');

  httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    console.log(`  HTTPS: https://0.0.0.0:${HTTPS_PORT}`);
    console.log(`  📱 Open https://<your-ip>:${HTTPS_PORT} on your tablet\n`);
  });
} catch (e) {
  console.log(`  ⚠️  HTTPS not available (run setup.sh to generate certs)`);
  console.log(`  📱 Voice input requires HTTPS — run: ./setup.sh\n`);
}
