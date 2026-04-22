// backend/server.js
// 4U Control Plane · Express server
// - Serves the new /frontend/ dashboard assets
// - Injects FIREBASE_CONFIG_JSON via /config.js
// - REST API for projects (Firestore-backed, in-memory fallback for dev)
// - Webhook for automated progress updates (future n8n / CI)

require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');

// ─── Firebase Admin (optional) ───────────────────────────────────────────────
const admin = require('firebase-admin');

function initFirebaseAdmin() {
  if (admin.apps && admin.apps.length) return admin;
  const raw = process.env.FIREBASE_SA_JSON || '';
  if (!raw) {
    console.warn('[firebase] FIREBASE_SA_JSON not set — using in-memory store');
    return null;
  }
  try {
    const sa = raw.trim().startsWith('{')
      ? JSON.parse(raw)
      : JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    admin.initializeApp({ credential: admin.credential.cert(sa) });
    console.info('[firebase] Admin SDK initialized');
    return admin;
  } catch (e) {
    console.error('[firebase] Failed to init Admin SDK:', e.message);
    return null;
  }
}

const firebaseAdmin = initFirebaseAdmin();
const db = firebaseAdmin ? firebaseAdmin.firestore() : null;

// In-memory fallback store so the UI is usable locally without Firebase creds.
// NOT persisted across restarts.
const memStore = new Map();

// ─── Express setup ────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-webhook-secret');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── Static frontend ──────────────────────────────────────────────────────────
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use('/frontend', express.static(frontendDir));

// Pretty routes → html files
const pages = {
  '/':            'index.html',
  '/index.html':  'index.html',
  '/admin':       'admin.html',
  '/admin.html':  'admin.html',
  '/feature':     'feature.html',
  '/feature.html':'feature.html',
};
Object.entries(pages).forEach(([route, file]) => {
  app.get(route, (_req, res) => {
    const p = path.join(frontendDir, file);
    if (fs.existsSync(p)) res.sendFile(p);
    else res.status(404).send('Page not found: ' + file);
  });
});

// ─── /config.js — inject Firebase client config from env ─────────────────────
app.get('/config.js', (_req, res) => {
  const cfg = process.env.FIREBASE_CONFIG_JSON || '{}';
  // Single-quote safe
  const safe = cfg.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  res.type('application/javascript');
  res.send(`window.__ZEABUR_FIREBASE_CONFIG_JSON = '${safe}';`);
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    firebase: !!db,
    store: db ? 'firestore' : 'memory',
    memCount: memStore.size,
  });
});

// ─── Projects API ─────────────────────────────────────────────────────────────
// GET /api/projects — list all
app.get('/api/projects', async (_req, res) => {
  try {
    if (db) {
      const snap = await db.collection('projects').get();
      const list = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      return res.json(list);
    }
    return res.json(Array.from(memStore.values()));
  } catch (e) {
    console.error('GET /api/projects', e);
    res.status(500).json({ error: 'server error' });
  }
});

// GET /api/projects/:id
app.get('/api/projects/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (db) {
      const doc = await db.collection('projects').doc(id).get();
      if (!doc.exists) return res.status(404).json({ error: 'not found' });
      return res.json({ id: doc.id, ...doc.data() });
    }
    const found = memStore.get(id);
    if (!found) return res.status(404).json({ error: 'not found' });
    res.json(found);
  } catch (e) {
    console.error('GET /api/projects/:id', e);
    res.status(500).json({ error: 'server error' });
  }
});

// Shared upsert logic
async function upsert(id, body, merge) {
  const doc = { ...body };
  delete doc.id;
  doc.lastUpdated = new Date().toISOString();
  if (!doc.createdAt) doc.createdAt = doc.lastUpdated;

  if (db) {
    await db.collection('projects').doc(id).set(doc, { merge });
  } else {
    const current = memStore.get(id) || {};
    memStore.set(id, merge ? { ...current, ...doc, id } : { ...doc, id, createdAt: current.createdAt || doc.createdAt });
  }
  return { ok: true, id };
}

// POST /api/projects — create (id in body)
app.post('/api/projects', async (req, res) => {
  try {
    if (!req.body || !req.body.id) return res.status(400).json({ error: 'missing id' });
    res.status(201).json(await upsert(String(req.body.id), req.body, false));
  } catch (e) {
    console.error('POST /api/projects', e);
    res.status(500).json({ error: 'server error' });
  }
});

// PUT /api/projects/:id — full replace (merge=false)
app.put('/api/projects/:id', async (req, res) => {
  try { res.json(await upsert(req.params.id, req.body || {}, false)); }
  catch (e) { console.error('PUT', e); res.status(500).json({ error: 'server error' }); }
});

// PATCH /api/projects/:id — partial update (merge=true) — used by admin UI
app.patch('/api/projects/:id', async (req, res) => {
  try { res.json(await upsert(req.params.id, req.body || {}, true)); }
  catch (e) { console.error('PATCH', e); res.status(500).json({ error: 'server error' }); }
});

// ─── Webhook for automated progress updates ──────────────────────────────────
app.post('/webhook/progress', async (req, res) => {
  try {
    const secret = process.env.WEBHOOK_SECRET || '';
    const provided = req.get('x-webhook-secret') || req.query.secret || '';
    if (!secret) {
      return res.status(503).json({ error: 'WEBHOOK_SECRET not configured on server' });
    }
    if (provided !== secret) return res.status(403).json({ error: 'forbidden' });
    if (!req.body || !req.body.id) return res.status(400).json({ error: 'missing id' });
    const result = await upsert(String(req.body.id), req.body, true);
    console.info(`[webhook] ${req.body.id} → progress=${req.body.progress ?? '—'} status=${req.body.status ?? '—'}`);
    res.json(result);
  } catch (e) {
    console.error('/webhook/progress', e);
    res.status(500).json({ error: 'server error' });
  }
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'not found' }));

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[4u] listening on :${PORT}`);
  console.log(`[4u] store = ${db ? 'firestore' : 'in-memory (dev)'}`);
  console.log(`[4u] open http://localhost:${PORT}/`);
});

module.exports = app;
