// backend/db/index.js
const { createClient } = require('@libsql/client');

let db;
let isConnected = false;

const connectDB = async () => {
  try {
    console.log('Connecting to Turso cloud database...');
    db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    await db.execute('PRAGMA foreign_keys = ON');
    isConnected = true;
    console.log('Turso connected successfully');
    return db;
  } catch (error) {
    console.error('Database connection error:', error.message);
    throw error;
  }
};

const getDB = () => {
  if (!db || !isConnected) throw new Error('Database not initialized. Call connectDB() first.');
  return db;
};

const allAsync = async (sql, params = []) => {
  try {
    const r = await getDB().execute({ sql, args: params });
    return r.rows;
  } catch (error) {
    console.error('SQL allAsync error:', error.message);
    throw error;
  }
};

const getAsync = async (sql, params = []) => {
  try {
    const r = await getDB().execute({ sql, args: params });
    return r.rows[0];
  } catch (error) {
    console.error('SQL getAsync error:', error.message);
    throw error;
  }
};

const runAsync = async (sql, params = []) => {
  try {
    const r = await getDB().execute({ sql, args: params });
    return { lastID: Number(r.lastInsertRowid), changes: r.rowsAffected };
  } catch (error) {
    console.error('SQL runAsync error:', error.message);
    throw error;
  }
};

const checkDatabase = async () => {
  try {
    const r = await getDB().execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='sales'`
    );
    return r.rows.length > 0;
  } catch (error) {
    console.log('Database check skipped:', error.message);
    return false;
  }
};

const closeDB = async () => {
  if (db && isConnected) {
    try {
      db.close();
      isConnected = false;
    } catch (error) {
      console.error('Error closing database:', error.message);
    }
  }
};

module.exports = { connectDB, getDB, allAsync, getAsync, runAsync, checkDatabase, closeDB };