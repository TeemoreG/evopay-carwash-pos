const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
dotenv.config();

// ==================== FILE LOGGER ====================
const LOG_DIR = path.join(__dirname, 'logs');
try {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (e) {
  // silent fallback
}

const LOG_FILE = path.join(LOG_DIR, 'app.log');
const LOG_MAX_BYTES = 5 * 1024 * 1024;
const LOG_KEEP_FILES = 3;

const origLog = console.log;
const origErr = console.error;
const origWarn = console.warn;

function rotateIfNeeded() {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const stats = fs.statSync(LOG_FILE);
    if (stats.size <= LOG_MAX_BYTES) return;

    for (let i = LOG_KEEP_FILES - 1; i >= 1; i--) {
      const older = path.join(LOG_DIR, `app.log.${i + 1}`);
      const newer = path.join(LOG_DIR, `app.log.${i}`);
      if (fs.existsSync(older)) fs.unlinkSync(older);
      if (fs.existsSync(newer)) fs.renameSync(newer, older);
    }
    fs.renameSync(LOG_FILE, path.join(LOG_DIR, 'app.log.1'));
  } catch (e) {
    origErr('[LOGGER] Rotation failed:', e.message);
  }
}

function writeLog(level, args) {
  try {
    rotateIfNeeded();
    const line = `[${new Date().toISOString()}] [${level}] ${args
      .map((a) => {
        if (a instanceof Error) return a.stack || a.message;
        if (typeof a === 'object') {
          try { return JSON.stringify(a); } catch { return String(a); }
        }
        return String(a);
      })
      .join(' ')}\n`;
    fs.appendFileSync(LOG_FILE, line);
  } catch (e) {
    origErr('[LOGGER] Write failed:', e.message);
  }
}

console.log = (...args) => { writeLog('LOG', args); origLog(...args); };
console.error = (...args) => { writeLog('ERR', args); origErr(...args); };
console.warn = (...args) => { writeLog('WARN', args); origWarn(...args); };

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason instanceof Error ? reason : new Error(String(reason)));
});

// ==================== ROUTES ====================
const salesRoutes = require('./routes/sales');
const itemsRoutes = require('./routes/items');
const stockRoutes = require('./routes/stock');
const dataRoutes = require('./routes/data');
const syncRoutes = require('./routes/sync');
const purchasesRoutes = require('./routes/purchases');
const importsRoutes = require('./routes/imports');
const branchesRoutes = require('./routes/branches');
const settingsRoutes = require('./routes/settings');
const usersRoutes = require('./routes/users');
const noticesRoutes = require('./routes/notices');
const customersRoutes = require('./routes/customers');
const suppliersRoutes = require('./routes/suppliers');
const paymentsRoutes = require('./routes/payments');
const printRoutes = require('./routes/print');
const receiptsRoutes = require('./routes/receipts');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

// ==================== CORS ====================
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, tin, bhfId, cmckey, Origin, Accept');
  res.setHeader('Access-Control-Max-Age', '3600');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  next();
});

// ==================== REQUEST / RESPONSE LOGGER ====================
const QUIET_PATHS = [
  '/api/health',
  '/api/vscu/status',
  '/api/pay/payment-status/',
  '/api/debug/logs',
];

const isQuietPath = (p) =>
  QUIET_PATHS.some((q) => p === q || p.startsWith(q));

app.use((req, res, next) => {
  const start = Date.now();
  const traceId = Math.random().toString(36).slice(2, 8);
  const quiet = isQuietPath(req.path);
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '-';

  if (!quiet) {
    console.log(`[${traceId}] REQ  ${req.method} ${req.originalUrl} | ip=${ip}`);

    if (req.method !== 'GET' && req.body && Object.keys(req.body).length) {
      const bodyStr = JSON.stringify(req.body);
      const preview = bodyStr.length > 400 ? bodyStr.slice(0, 400) + '...' : bodyStr;
      console.log(`[${traceId}] BODY ${preview}`);
    }
  }

  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    if (!quiet) {
      const ms = Date.now() - start;
      const status = res.statusCode;

      let summary = '';
      if (typeof payload === 'object' && payload !== null) {
        try {
          summary = JSON.stringify(payload);
          if (summary.length > 220) summary = summary.slice(0, 220) + '...';
        } catch {
          summary = '[object]';
        }
      } else {
        summary = String(payload);
      }

      const level = status >= 500 ? 'ERR' : status >= 400 ? 'WARN' : 'LOG';
      writeLog(level, [`[${traceId}] RES  ${status} ${req.method} ${req.originalUrl} (${ms}ms) ${summary}`]);
    }
    return originalJson(payload);
  };

  const originalSend = res.send.bind(res);
  res.send = (body) => {
    if (!quiet && typeof body === 'string' && body.length < 400) {
      const ms = Date.now() - start;
      const status = res.statusCode;
      const level = status >= 500 ? 'ERR' : status >= 400 ? 'WARN' : 'LOG';
      writeLog(level, [`[${traceId}] RES  ${status} ${req.method} ${req.originalUrl} (${ms}ms) [send] ${body.slice(0, 200)}`]);
    }
    return originalSend(body);
  };

  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  next();
});

// ==================== DB READY GUARD ====================
const { ensureReady } = require('./db');

app.use(async (req, res, next) => {
  // Skip static + debug endpoints — they don't need DB
  if (
    req.path.startsWith('/api/debug') ||
    req.path.startsWith('/api/health') ||
    (!req.path.startsWith('/api') &&
      !req.path.startsWith('/mpesa-callback') &&
      !req.path.startsWith('/c2b-callback') &&
      !req.path.startsWith('/c2b-validation'))
  ) {
    return next();
  }
  try {
    await ensureReady();
    next();
  } catch (err) {
    console.error('[DB READY] failed:', err.message);
    res.status(503).json({ error: 'Database unavailable', details: err.message });
  }
});

// ==================== API ROUTES ====================
app.use('/api/sales', salesRoutes);
app.use('/api/items', itemsRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/purchases', purchasesRoutes);
app.use('/api/imports', importsRoutes);
app.use('/api/branches', branchesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/notices', noticesRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/pay', paymentsRoutes);
app.use('/api/print', printRoutes);
app.use('/api/receipts', receiptsRoutes);

// ==================== SAFARICOM CALLBACK ALIASES ====================
app.post('/mpesa-callback', (req, res, next) => {
  console.log('[ALIAS] POST /mpesa-callback -> /api/pay/mpesa-callback');
  req.url = '/mpesa-callback';
  paymentsRoutes(req, res, next);
});
app.post('/c2b-callback', (req, res, next) => {
  console.log('[ALIAS] POST /c2b-callback -> /api/pay/c2b-callback');
  req.url = '/c2b-callback';
  paymentsRoutes(req, res, next);
});
app.post('/c2b-validation', (req, res, next) => {
  console.log('[ALIAS] POST /c2b-validation -> /api/pay/c2b-validation');
  req.url = '/c2b-validation';
  paymentsRoutes(req, res, next);
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Evopay Car Wash POS',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/api/vscu/status', async (req, res) => {
  try {
    const vscuClient = require('./services/vscuClient');
    const status = await vscuClient.checkStatus();
    res.json(status);
  } catch (error) {
    res.json({ online: false, error: error.message });
  }
});

app.post('/api/initializer/selectInitInfo', async (req, res) => {
  try {
    const vscuUrl = process.env.VSCU_URL || 'http://192.168.60.29:8090';
    const response = await axios.post(
      `${vscuUrl}/initializer/selectInitInfo`,
      req.body,
      {
        headers: {
          'Content-Type': 'application/json',
          'tin': req.body.tin || process.env.TIN,
          'bhfId': req.body.bhfId || process.env.BHF_ID
        },
        timeout: 30000
      }
    );
    res.json(response.data);
  } catch (error) {
    let errorMessage = 'VSCU not reachable.';
    let statusCode = 500;
    if (error.code === 'ECONNREFUSED') errorMessage = 'VSCU not reachable.';
    else if (error.code === 'ECONNRESET') errorMessage = 'VSCU crashed.';
    else if (error.response) {
      errorMessage = error.response.data?.resultMsg || 'VSCU error';
      statusCode = error.response.status;
    } else if (error.request) errorMessage = 'No response from VSCU.';
    res.status(statusCode).json({
      error: errorMessage,
      details: error.message,
      resultCd: error.response?.data?.resultCd || '999'
    });
  }
});

// ==================== DEBUG: LIVE LOG VIEWER ====================
app.get('/api/debug/logs', (req, res) => {
  const expected = process.env.LOG_VIEW_KEY;
  if (!expected) {
    return res.status(404).send('LOG_VIEW_KEY not set in .env');
  }
  if (req.query.key !== expected) {
    return res.status(401).send('Unauthorized — wrong key');
  }

  // Raw text mode (?raw=1) — returns plain log text
  if (req.query.raw === '1') {
    const limit = Math.min(parseInt(req.query.lines, 10) || 500, 5000);
    try {
      const content = fs.readFileSync(LOG_FILE, 'utf8');
      const lines = content.split('\n');
      res.type('text/plain').send(lines.slice(-limit).join('\n'));
    } catch (e) {
      res.status(500).send('Log read error: ' + e.message);
    }
    return;
  }

  // HTML live viewer — auto-refreshes
  const key = req.query.key;
  res.type('html').send(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Evopay POS — Live Logs</title>
<style>
  * { box-sizing: border-box; }
  body {
    background: #0f1626;
    color: #d1d5db;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 12px;
    margin: 0;
    padding: 0;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
  header {
    background: #1a2236;
    padding: 10px 14px;
    border-bottom: 1px solid #2a3450;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  }
  h1 { color: #f47b20; font-size: 13px; margin: 0; font-weight: 600; }
  .status { color: #6b7280; font-size: 11px; }
  .status.on { color: #22c55e; }
  .status.err { color: #ef4444; }
  .controls { display: flex; gap: 8px; align-items: center; }
  button {
    background: #2a3450;
    color: #d1d5db;
    border: none;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-family: inherit;
  }
  button:hover { background: #3a4560; }
  button.active { background: #f47b20; color: white; }
  main {
    flex: 1;
    overflow: auto;
    padding: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .line { padding: 1px 0; }
  .line.ERR { color: #f87171; }
  .line.WARN { color: #fbbf24; }
  .line.LOG { color: #d1d5db; }
  .ts { color: #6b7280; }
</style>
</head><body>
<header>
  <h1>Evopay POS — Live Logs</h1>
  <div class="controls">
    <span class="status" id="status">connecting...</span>
    <button id="pauseBtn">Pause</button>
    <button id="wrapBtn">No-Wrap</button>
    <button id="clearBtn">Clear View</button>
  </div>
</header>
<main id="log"></main>
<script>
const KEY = ${JSON.stringify(key)};
const POLL_MS = 1500;
const MAX_LINES = 1000;
let paused = false;
let lastContent = '';
let wrap = true;

const logEl = document.getElementById('log');
const statusEl = document.getElementById('status');
const pauseBtn = document.getElementById('pauseBtn');
const wrapBtn = document.getElementById('wrapBtn');
const clearBtn = document.getElementById('clearBtn');

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function render(text) {
  const lines = text.split('\\n').filter(l => l.trim());
  const visible = lines.slice(-MAX_LINES);
  logEl.innerHTML = visible.map(line => {
    const m = line.match(/\\[(.*?)\\] \\[(LOG|WARN|ERR)\\] (.*)/);
    if (!m) return '<div class="line">' + escapeHtml(line) + '</div>';
    return '<div class="line ' + m[2] + '">' +
      '<span class="ts">[' + m[1] + ']</span> ' +
      '[' + m[2] + '] ' +
      escapeHtml(m[3]) +
    '</div>';
  }).join('');
  logEl.scrollTop = logEl.scrollHeight;
}

async function refresh() {
  if (paused) return;
  try {
    const r = await fetch('/api/debug/logs?key=' + encodeURIComponent(KEY) + '&raw=1&lines=' + MAX_LINES);
    if (!r.ok) {
      statusEl.textContent = 'error ' + r.status;
      statusEl.className = 'status err';
      return;
    }
    const text = await r.text();
    if (text !== lastContent) {
      lastContent = text;
      render(text);
    }
    statusEl.textContent = 'live · ' + new Date().toLocaleTimeString();
    statusEl.className = 'status on';
  } catch (e) {
    statusEl.textContent = 'disconnected';
    statusEl.className = 'status err';
  }
}

pauseBtn.onclick = () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  pauseBtn.classList.toggle('active', paused);
};
wrapBtn.onclick = () => {
  wrap = !wrap;
  logEl.style.whiteSpace = wrap ? 'pre-wrap' : 'pre';
  logEl.style.overflowX = wrap ? 'hidden' : 'auto';
  wrapBtn.textContent = wrap ? 'No-Wrap' : 'Wrap';
  wrapBtn.classList.toggle('active', !wrap);
};
clearBtn.onclick = () => { logEl.innerHTML = ''; lastContent = ''; };

refresh();
setInterval(refresh, POLL_MS);
</script>
</body></html>`);
});

// List log files + sizes
app.get('/api/debug/logs/list', (req, res) => {
  const expected = process.env.LOG_VIEW_KEY;
  if (!expected) return res.status(404).end();
  if (req.query.key !== expected) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const files = fs.readdirSync(LOG_DIR).map((f) => {
      const stat = fs.statSync(path.join(LOG_DIR, f));
      return { name: f, sizeBytes: stat.size, modified: stat.mtime };
    });
    res.json({ dir: LOG_DIR, files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==================== FRONTEND STATIC SERVING ====================
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get(/^(?!\/api|\/mpesa-callback|\/c2b-callback|\/c2b-validation).*/, (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

// ==================== SYNC ====================
const db = require('./db');
const vscuClient = require('./services/vscuClient');

let isAutoSyncing = false;

async function processManualSync() {
  if (isAutoSyncing) return;
  isAutoSyncing = true;

  try {
    const status = await vscuClient.checkStatus();
    if (!status.connected || !status.online) {
      isAutoSyncing = false;
      return { synced: 0, failed: 0, message: 'VSCU offline' };
    }

    const pending = await db.allAsync(
      `SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 50`
    );

    if (pending.length === 0) {
      isAutoSyncing = false;
      return { synced: 0, failed: 0, message: 'No pending items' };
    }

    let synced = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        const payload = JSON.parse(item.payload);
        let response = null;

        if (item.endpoint === '/trnsSales/saveSales') response = await vscuClient.sendSale(payload);
        else if (item.endpoint === '/items/saveItems') response = await vscuClient.saveItem(payload);
        else if (item.endpoint === '/items/saveItemComposition') response = await vscuClient.sendComposition(payload);
        else if (item.endpoint === '/stock/saveStockItems') response = await vscuClient.saveStock(payload);
        else if (item.endpoint === '/purchases/savePurchases') response = await vscuClient.savePurchase(payload);
        else if (item.endpoint === '/branches/saveBrancheCustomers') response = await vscuClient.saveBranchCustomer(payload);
        else if (item.endpoint === '/branches/saveBrancheUsers') response = await vscuClient.saveBranchUser(payload);
        else {
          await db.runAsync(
            `UPDATE sync_queue SET retry_count = retry_count + 1, error = ?, last_attempt = CURRENT_TIMESTAMP WHERE id = ?`,
            ['Unknown endpoint: ' + item.endpoint, item.id]
          );
          failed++;
          continue;
        }

        if (response && (response.resultCd === '000' || response.resultCd === '00')) {
          await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, [item.id]);
          synced++;
        } else {
          const errorMsg = response?.resultMsg || response?.message || 'Unknown error';
          await db.runAsync(
            `UPDATE sync_queue SET retry_count = retry_count + 1, error = ?, last_attempt = CURRENT_TIMESTAMP WHERE id = ?`,
            [errorMsg, item.id]
          );
          failed++;
        }
      } catch (itemError) {
        await db.runAsync(
          `UPDATE sync_queue SET retry_count = retry_count + 1, error = ?, last_attempt = CURRENT_TIMESTAMP WHERE id = ?`,
          [itemError.message, item.id]
        );
        failed++;
      }
    }

    return { synced, failed, message: `Synced ${synced}, failed ${failed}` };
  } catch (error) {
    return { synced: 0, failed: 0, message: error.message };
  } finally {
    isAutoSyncing = false;
  }
}

app._manualSync = processManualSync;

// ==================== GLOBAL ERROR MIDDLEWARE ====================
app.use((err, req, res, next) => {
  console.error('[EXPRESS ERROR]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ==================== BOOT ====================
const { connectDB } = require('./db');

connectDB().then(() => {
  console.log('=========================================');
  console.log('  Evopay Car Wash POS API — STARTING');
  console.log(`  Time:       ${new Date().toISOString()}`);
  console.log(`  Port:       ${PORT}`);
  console.log(`  Node:       ${process.version}`);
  console.log(`  VSCU:       ${process.env.VSCU_URL || 'not set'}`);
  console.log(`  M-Pesa env: ${process.env.MPESA_ENV || 'sandbox'}`);
  console.log(`  Log file:   ${LOG_FILE}`);
  console.log(`  Log viewer: /api/debug/logs?key=${process.env.LOG_VIEW_KEY || '(set LOG_VIEW_KEY)'}`);
  console.log('=========================================');

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Listening on 0.0.0.0:${PORT}`);
  });

  process.on('SIGTERM', () => {
    console.log('[SHUTDOWN] SIGTERM received');
    server.close(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    console.log('[SHUTDOWN] SIGINT received');
    server.close(() => process.exit(0));
  });
}).catch((err) => {
  console.error('Failed to connect to database:', err.message);
  process.exit(1);
});

module.exports = app;