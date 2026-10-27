/**
 * Neet Photography · Database Layer
 * Uses Node 22 built-in SQLite (DatabaseSync) with persistent file storage,
 * and automatic JSON fallback for universal cloud hosting compatibility.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_FILE = path.join(__dirname, 'neet_schedule.db');
const JSON_BACKUP_FILE = path.join(__dirname, 'neet_schedule_data.json');

// Default initial schedule from Neet's original sample
const DEFAULT_BOOKED = {
  "2026-10": [25, 30],
  "2026-11": [2, 3, 11, 12, 14],
  "2027-01": [19, 24, 25, 26, 27, 28, 31],
  "2027-02": [1, 2, 10, 11, 12, 15, 16]
};

let db = null;
let useJsonFallback = false;
let memoryCache = null;

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

// Initialize Database
function initDB() {
  try {
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(DB_FILE);

    // Create tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS shoots (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        date TEXT NOT NULL,
        client_name TEXT,
        venue TEXT,
        time TEXT,
        phone TEXT,
        status TEXT DEFAULT 'confirmed',
        notes TEXT,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_shoots_cat_date ON shoots(category, date);
    `);

    // Initialize default settings if not exists
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('studio_settings');
    if (!row) {
      const defaultSettings = {
        studioName: 'Neet Photography',
        phone: '+91 98765 43210',
        pinHash: hashPin('1234'), // default PIN: 1234
        lastUpdated: Date.now()
      };
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(
        'studio_settings',
        JSON.stringify(defaultSettings)
      );

      // Seed default shoots
      seedInitialData();
    }

    console.log('✅ SQLite Database successfully initialized at:', DB_FILE);
  } catch (err) {
    console.warn('⚠️ node:sqlite not available or error occurred. Using persistent JSON storage fallback:', err.message);
    useJsonFallback = true;
    initJsonFallback();
  }
}

// Seed initial shoots from sample file
function seedInitialData() {
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO shoots (id, category, date, client_name, venue, time, phone, status, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  const categories = ['traditional', 'semi', 'wedding'];

  for (const cat of categories) {
    for (const monthStr in DEFAULT_BOOKED) {
      const days = DEFAULT_BOOKED[monthStr];
      days.forEach(day => {
        const dStr = String(day).padStart(2, '0');
        const fullDate = `${monthStr}-${dStr}`;
        const id = `${cat}_${fullDate}`;
        insertStmt.run(
          id,
          cat,
          fullDate,
          'Reserved Shoot',
          '',
          '',
          '',
          'confirmed',
          '',
          now,
          now
        );
      });
    }
  }
  console.log('✅ Initial shoot dates seeded successfully.');
}

// Fallback JSON Storage implementation
function initJsonFallback() {
  if (fs.existsSync(JSON_BACKUP_FILE)) {
    try {
      memoryCache = JSON.parse(fs.readFileSync(JSON_BACKUP_FILE, 'utf8'));
      return;
    } catch (e) {}
  }

  memoryCache = {
    settings: {
      studioName: 'Neet Photography',
      phone: '+91 98765 43210',
      pinHash: hashPin('1234'),
      lastUpdated: Date.now()
    },
    shoots: {}
  };

  const categories = ['traditional', 'semi', 'wedding'];
  const now = new Date().toISOString();
  for (const cat of categories) {
    for (const monthStr in DEFAULT_BOOKED) {
      const days = DEFAULT_BOOKED[monthStr];
      days.forEach(day => {
        const dStr = String(day).padStart(2, '0');
        const fullDate = `${monthStr}-${dStr}`;
        const id = `${cat}_${fullDate}`;
        memoryCache.shoots[id] = {
          id,
          category: cat,
          date: fullDate,
          client_name: 'Reserved Shoot',
          venue: '',
          time: '',
          phone: '',
          status: 'confirmed',
          notes: '',
          created_at: now,
          updated_at: now
        };
      });
    }
  }
  saveJsonFallback();
}

function saveJsonFallback() {
  fs.writeFileSync(JSON_BACKUP_FILE, JSON.stringify(memoryCache, null, 2), 'utf8');
}

// ----------------- PUBLIC API METHODS -----------------

function getSettings() {
  if (useJsonFallback) {
    const s = { ...memoryCache.settings };
    delete s.pinHash;
    return s;
  }
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('studio_settings');
  if (row) {
    const s = JSON.parse(row.value);
    delete s.pinHash;
    return s;
  }
  return { studioName: 'Neet Photography', phone: '' };
}

function verifyPin(inputPin) {
  const inputHash = hashPin(inputPin);
  if (useJsonFallback) {
    return memoryCache.settings.pinHash === inputHash;
  }
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('studio_settings');
  if (row) {
    const s = JSON.parse(row.value);
    return s.pinHash === inputHash;
  }
  return false;
}

function updateSettings({ studioName, phone, newPin }) {
  let s;
  if (useJsonFallback) {
    s = memoryCache.settings;
    if (studioName) s.studioName = studioName;
    if (phone !== undefined) s.phone = phone;
    if (newPin) s.pinHash = hashPin(newPin);
    s.lastUpdated = Date.now();
    saveJsonFallback();
    return getSettings();
  }

  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('studio_settings');
  s = row ? JSON.parse(row.value) : {};
  if (studioName) s.studioName = studioName;
  if (phone !== undefined) s.phone = phone;
  if (newPin) s.pinHash = hashPin(newPin);
  s.lastUpdated = Date.now();

  db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(
    JSON.stringify(s),
    'studio_settings'
  );
  return getSettings();
}

function getLastUpdated() {
  if (useJsonFallback) {
    return memoryCache.settings.lastUpdated || Date.now();
  }
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('studio_settings');
  return row ? JSON.parse(row.value).lastUpdated || Date.now() : Date.now();
}

function touchUpdated() {
  if (useJsonFallback) {
    memoryCache.settings.lastUpdated = Date.now();
    saveJsonFallback();
    return;
  }
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('studio_settings');
  if (row) {
    const s = JSON.parse(row.value);
    s.lastUpdated = Date.now();
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(
      JSON.stringify(s),
      'studio_settings'
    );
  }
}

// Retrieve shoots for a category.
// If isAdmin is false, sensitive client details (phone and notes) are sanitized for privacy!
function getShootsByCategory(category, isAdmin = false) {
  if (useJsonFallback) {
    const result = {};
    for (const id in memoryCache.shoots) {
      const shoot = memoryCache.shoots[id];
      if (shoot.category === category) {
        if (isAdmin) {
          result[shoot.date] = shoot;
        } else {
          result[shoot.date] = {
            id: shoot.id,
            category: shoot.category,
            date: shoot.date,
            status: shoot.status,
            name: 'Reserved'
          };
        }
      }
    }
    return result;
  }

  const rows = db.prepare('SELECT * FROM shoots WHERE category = ?').all(category);
  const result = {};
  rows.forEach(r => {
    if (isAdmin) {
      result[r.date] = {
        id: r.id,
        category: r.category,
        date: r.date,
        name: r.client_name,
        venue: r.venue,
        time: r.time,
        phone: r.phone,
        status: r.status,
        notes: r.notes,
        updatedAt: r.updated_at
      };
    } else {
      result[r.date] = {
        id: r.id,
        category: r.category,
        date: r.date,
        status: r.status,
        name: 'Reserved'
      };
    }
  });
  return result;
}

// Save or Update a shoot (Admin only)
function saveShoot({ category, date, clientName, venue, time, phone, status, notes }) {
  const id = `${category}_${date}`;
  const now = new Date().toISOString();

  if (useJsonFallback) {
    memoryCache.shoots[id] = {
      id,
      category,
      date,
      client_name: clientName || 'Signed Shoot',
      venue: venue || '',
      time: time || '',
      phone: phone || '',
      status: status || 'confirmed',
      notes: notes || '',
      created_at: memoryCache.shoots[id]?.created_at || now,
      updated_at: now
    };
    touchUpdated();
    saveJsonFallback();
    return memoryCache.shoots[id];
  }

  const stmt = db.prepare(`
    INSERT INTO shoots (id, category, date, client_name, venue, time, phone, status, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      client_name = excluded.client_name,
      venue = excluded.venue,
      time = excluded.time,
      phone = excluded.phone,
      status = excluded.status,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    id,
    category,
    date,
    clientName || 'Signed Shoot',
    venue || '',
    time || '',
    phone || '',
    status || 'confirmed',
    notes || '',
    now,
    now
  );

  touchUpdated();
  return { id, category, date, clientName, venue, time, phone, status, notes };
}

// Delete / Release a shoot (Admin only)
function deleteShoot(category, date) {
  const id = `${category}_${date}`;
  if (useJsonFallback) {
    if (memoryCache.shoots[id]) {
      delete memoryCache.shoots[id];
      touchUpdated();
      saveJsonFallback();
      return true;
    }
    return false;
  }

  const res = db.prepare('DELETE FROM shoots WHERE id = ?').run(id);
  touchUpdated();
  return res.changes > 0;
}

// Get complete database backup
function exportBackup() {
  if (useJsonFallback) {
    return { settings: memoryCache.settings, shoots: memoryCache.shoots };
  }
  const shoots = db.prepare('SELECT * FROM shoots').all();
  const settingsRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('studio_settings');
  return {
    settings: settingsRow ? JSON.parse(settingsRow.value) : {},
    shoots
  };
}

// Restore database backup
function restoreBackup(data) {
  if (!data || !data.shoots) throw new Error('Invalid backup structure');

  if (useJsonFallback) {
    memoryCache = data;
    touchUpdated();
    saveJsonFallback();
    return true;
  }

  db.exec('DELETE FROM shoots');
  const insertStmt = db.prepare(`
    INSERT INTO shoots (id, category, date, client_name, venue, time, phone, status, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const list = Array.isArray(data.shoots) ? data.shoots : Object.values(data.shoots);
  for (const s of list) {
    insertStmt.run(
      s.id || `${s.category}_${s.date}`,
      s.category,
      s.date,
      s.client_name || s.name || '',
      s.venue || '',
      s.time || '',
      s.phone || '',
      s.status || 'confirmed',
      s.notes || '',
      s.created_at || new Date().toISOString(),
      s.updated_at || new Date().toISOString()
    );
  }

  if (data.settings) {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(
      JSON.stringify(data.settings),
      'studio_settings'
    );
  }
  touchUpdated();
  return true;
}

// Initialize on require
initDB();

module.exports = {
  getSettings,
  verifyPin,
  updateSettings,
  getLastUpdated,
  getShootsByCategory,
  saveShoot,
  deleteShoot,
  exportBackup,
  restoreBackup
};
