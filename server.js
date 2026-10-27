/**
 * Neet Photography · Production Web Server & REST API
 * Handles database queries, admin authentication, real-time sync polling,
 * and responsive frontend static delivery.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// In-memory active admin sessions
const activeSessions = new Set();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Authentication Helper Middleware
function getIsAdmin(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return false;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  return activeSessions.has(token);
}

function requireAdmin(req, res, next) {
  if (!getIsAdmin(req)) {
    return res.status(401).json({
      error: 'Unauthorized: Admin access required. Please enter your photographer PIN.'
    });
  }
  next();
}

// ----------------- API ROUTES -----------------

// 1. Version / Real-time Sync Polling
// Clients ping this endpoint to detect if Neet modified dates from another phone/PC
app.get('/api/version', (req, res) => {
  res.json({
    lastUpdated: db.getLastUpdated(),
    serverTime: Date.now()
  });
});

// 2. Studio Public Settings
app.get('/api/settings', (req, res) => {
  const settings = db.getSettings();
  res.json(settings);
});

// 3. Update Settings (Admin Only)
app.put('/api/settings', requireAdmin, (req, res) => {
  const { studioName, phone, newPin } = req.body;
  const updated = db.updateSettings({ studioName, phone, newPin });
  res.json({
    success: true,
    message: 'Settings updated successfully',
    settings: updated
  });
});

// 4. Admin Login with PIN
app.post('/api/auth/login', (req, res) => {
  const { pin } = req.body;
  if (!pin) {
    return res.status(400).json({ error: 'PIN is required' });
  }

  if (db.verifyPin(pin)) {
    const token = crypto.randomBytes(24).toString('hex');
    activeSessions.add(token);
    return res.json({
      success: true,
      token,
      message: 'Editor access granted. Welcome Neet!'
    });
  } else {
    return res.status(401).json({ error: 'Invalid PIN. Please try again.' });
  }
});

// 5. Admin Logout
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    activeSessions.delete(token);
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

// 6. Verify Session Token
app.get('/api/auth/check', (req, res) => {
  res.json({ isAdmin: getIsAdmin(req) });
});

// 7. Get Shoot Schedule by Category
// Sanitizes client phone and notes for public viewers
app.get('/api/schedule', (req, res) => {
  const category = req.query.category || 'traditional';
  const isAdmin = getIsAdmin(req);
  const shoots = db.getShootsByCategory(category, isAdmin);

  res.json({
    category,
    isAdmin,
    lastUpdated: db.getLastUpdated(),
    shoots
  });
});

// 8. Sign / Update Shoot Date (Admin Only)
app.post('/api/schedule', requireAdmin, (req, res) => {
  const { category, date, clientName, venue, time, phone, status, notes } = req.body;

  if (!category || !date) {
    return res.status(400).json({ error: 'Category and date are required' });
  }

  const saved = db.saveShoot({
    category,
    date,
    clientName,
    venue,
    time,
    phone,
    status,
    notes
  });

  res.json({
    success: true,
    message: 'Shoot date signed and saved successfully',
    shoot: saved,
    lastUpdated: db.getLastUpdated()
  });
});

// 9. Release / Delete Shoot Date (Admin Only)
app.delete('/api/schedule', requireAdmin, (req, res) => {
  const { category, date } = req.body;
  if (!category || !date) {
    return res.status(400).json({ error: 'Category and date are required' });
  }

  const success = db.deleteShoot(category, date);
  res.json({
    success,
    message: success ? 'Date released and marked available' : 'Date was not found',
    lastUpdated: db.getLastUpdated()
  });
});

// 10. Backup Database (Admin Only)
app.get('/api/backup', requireAdmin, (req, res) => {
  const backup = db.exportBackup();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="neet-schedule-backup-${new Date().toISOString().slice(0, 10)}.json"`
  );
  res.json(backup);
});

// 11. Restore Database (Admin Only)
app.post('/api/backup', requireAdmin, (req, res) => {
  try {
    db.restoreBackup(req.body);
    res.json({ success: true, message: 'Database restored successfully' });
  } catch (err) {
    res.status(400).json({ error: 'Failed to restore backup: ' + err.message });
  }
});

// Client-side routing fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 Neet Photography Server is RUNNING!`);
  console.log(`📡 Local URL:   http://localhost:${PORT}`);
  console.log(`💾 Database:    Persistent SQLite (neet_schedule.db)`);
  console.log(`🔐 Default PIN: 1234`);
  console.log(`==================================================\n`);
});
