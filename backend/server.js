const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
dotenv.config();

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
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'tin', 'bhfId', 'cmckey', 'Origin', 'Accept'],
}));

// ==================== REQUEST / RESPONSE LOGGER ====================
// Quiet paths: health checks, root, VSCU status (frontend already shows it),
// payment status polling (too frequent, useful info already logged at source).
const QUIET_PATHS = [
  '/api/health',
  '/',
  '/api/vscu/status',
  '/api/pay/payment-status/',
];

const isQuietPath = (path) =>
  QUIET_PATHS.some((p) => path === p || path.startsWith(p));

app.use((req, res, next) => {
  const start = Date.now();
  const traceId = Math.random().toString(36).slice(2, 8);
  const quiet = isQuietPath(req.path);

  if (!quiet) {
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`${ts} [${traceId}] REQ  ${req.method} ${req.originalUrl}`);

    if (req.method !== 'GET' && req.body && Object.keys(req.body).length) {
      const bodyStr = JSON.stringify(req.body);
      const preview = bodyStr.length > 400 ? bodyStr.slice(0, 400) + '...' : bodyStr;
      console.log(`${ts} [${traceId}] BODY ${preview}`);
    }
  }

  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    if (!quiet) {
      const ms = Date.now() - start;
      const ts = new Date().toISOString().slice(11, 19);
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

      console.log(`${ts} [${traceId}] RES  ${status} ${req.method} ${req.originalUrl} (${ms}ms) ${summary}`);
    }
    return originalJson(payload);
  };

  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Prevent caching (fixes 304 on /vscu/status)
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  next();
});

// ==================== ROUTES ====================
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

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Evopay Car Wash POS',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/', (req, res) => {
  res.json({
    service: 'Evopay Car Wash POS API',
    status: 'running',
    docs: '/api/health'
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

// ==================== BOOT ====================
const { connectDB } = require('./db');

connectDB().then(() => {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('-----------------------------------------');
    console.log('  Evopay Car Wash POS API');
    console.log(`  Listening on 0.0.0.0:${PORT}`);
    console.log(`  VSCU target: ${process.env.VSCU_URL || 'not set'}`);
    console.log(`  M-Pesa env: ${process.env.MPESA_ENV || 'sandbox'}`);
    console.log('-----------------------------------------');
  });

  process.on('SIGTERM', () => {
    server.close(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    server.close(() => process.exit(0));
  });
}).catch(err => {
  console.error('Failed to connect to database:', err.message);
  process.exit(1);
});

module.exports = app;