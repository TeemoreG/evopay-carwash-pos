const express = require('express');
const net = require('net');
const router = express.Router();

// POST /api/print/tcp
// body: { ip, port, data: number[] }
router.post('/tcp', (req, res) => {
  const { ip, port = 9100, data } = req.body || {};
  if (!ip || !Array.isArray(data)) {
    return res.status(400).json({ error: 'ip and data[] required' });
  }

  const buf = Buffer.from(data);
  const socket = new net.Socket();
  let finished = false;

  const done = (err) => {
    if (finished) return;
    finished = true;
    socket.destroy();
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true, bytes: buf.length });
  };

  socket.setTimeout(5000);
  socket.on('timeout', () => done(new Error('Printer timeout')));
  socket.on('error', (e) => done(e));
  socket.connect(port, ip, () => {
    socket.write(buf, () => {
      // give the printer a moment, then close
      setTimeout(() => done(null), 200);
    });
  });
});

// GET /api/print/status?ip=192.168.1.50&port=9100
// TCP probe — returns { reachable: true/false, ip, port }
router.get('/status', (req, res) => {
  const { ip, port = 9100 } = req.query;
  if (!ip) {
    return res.status(400).json({ reachable: false, error: 'ip required' });
  }

  const socket = new net.Socket();
  let finished = false;

  const done = (err) => {
    if (finished) return;
    finished = true;
    socket.destroy();
    if (err) {
      return res.json({ reachable: false, ip, port: Number(port), error: err.message });
    }
    res.json({ reachable: true, ip, port: Number(port) });
  };

  socket.setTimeout(2000);
  socket.on('timeout', () => done(new Error('timeout')));
  socket.on('error', (e) => done(e));
  socket.connect(Number(port), ip, () => done(null));
});

module.exports = router;