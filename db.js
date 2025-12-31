// db.js
const Database = require('better-sqlite3');
const db = new Database('trading_data.db');
db.exec('CREATE TABLE IF NOT EXISTS ticks (id INTEGER PRIMARY KEY, symbol TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, last_digit INTEGER, price REAL)');
db.pragma('journal_mode = WAL');

const insert = db.prepare('INSERT INTO ticks (symbol, last_digit, price) VALUES (?, ?, ?)');
const getTicks = db.prepare('SELECT * FROM ticks WHERE symbol = ? ORDER BY timestamp DESC LIMIT ?');

let tickCache = new Map(); // symbol -> array of recent ticks

module.exports = {
  addTick: (s, ld, p) => {
    insert.run(s, ld, p);
    if (!tickCache.has(s)) tickCache.set(s, []);
    tickCache.get(s).push({ last_digit: ld, price: p });
    if (tickCache.get(s).length > 1000) tickCache.get(s).shift();
  },
  getHistoricalTicks: (s, l=10000) => getTicks.all(s, l),
  getRecentTicks: (s) => tickCache.get(s) || []
};