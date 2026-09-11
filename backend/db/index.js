const path = require('path');
const fs = require('fs');

let db;
let isConnected = false;

const connectDB = async () => {
  const useTurso = !!process.env.TURSO_DATABASE_URL;

  if (useTurso) {
    console.log('Connecting to Turso cloud database...');
    const { createClient } = require('@libsql/client');
    db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    await db.execute('PRAGMA foreign_keys = ON');
  } else {
    console.log('Connecting to local SQLite file...');
    const sqlite3 = require('sqlite3');
    const { open } = require('sqlite');
    const dbPath = path.join(__dirname, 'evopay.db');
    if (!fs.existsSync(path.dirname(dbPath))) {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    await db.run('PRAGMA foreign_keys = ON');
  }

  isConnected = true;
  console.log(useTurso ? 'Turso connected.' : 'Local DB connected.');
  return db;
};

const getDB = () => {
  if (!db || !isConnected) throw new Error('Database not initialized. Call connectDB() first.');
  return db;
};

// Unified exec — works for both drivers
const exec = async (sql, params = []) => {
  const d = getDB();
  if (typeof d.execute === 'function') {
    // Turso
    const r = await d.execute({ sql, args: params });
    return { rows: r.rows, lastID: Number(r.lastInsertRowid), changes: r.rowsAffected };
  }
  // Local sqlite
  const isSelect = /^\s*select/i.test(sql);
  if (isSelect) {
    const rows = await d.all(sql, params);
    return { rows, lastID: 0, changes: 0 };
  }
  const r = await d.run(sql, params);
  return { rows: [], lastID: r.lastID, changes: r.changes };
};

const allAsync = async (sql, params = []) => (await exec(sql, params)).rows;
const getAsync = async (sql, params = []) => (await exec(sql, params)).rows[0] || null;
const runAsync = async (sql, params = []) => {
  const r = await exec(sql, params);
  return { lastID: r.lastID, changes: r.changes };
};

const closeDB = async () => {
  if (db && isConnected) {
    try {
      if (typeof db.close === 'function') await db.close();
      isConnected = false;
    } catch {}
  }
};

module.exports = { connectDB, getDB, allAsync, getAsync, runAsync, closeDB };