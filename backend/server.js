// backend/server.js
// Sunrise Recruit / 4U Platform — Main Express Server
// Handles: static config injection, progress webhook, projects API, CORS

require('dotenv').config(); // loads .env for local dev (npm install dotenv)

const express = require('express');
const path = require('path');

// ─── Firebase Admin ───────────────────────────────────────────────────────────
const admin = require('firebase-admin');

function initFirebaseAdmin() {
    if (admin.apps && admin.apps.length) return admin;
    const raw = process.env.FIREBASE_SA_JSON || '';
    if (!raw) {
        console.warn('[firebase] FIREBASE_SA_JSON not set — admin SDK disabled');
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

// ─── Express setup ────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS — allow all origins (tighten in production if needed)
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-webhook-secret');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// ─── Serve frontend static files ──────────────────────────────────────────────
app.use('/frontend', express.static(path.join(__dirname, '../frontend')));
// Serve root index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ─── /config.js — inject Firebase frontend config from env into page ──────────
// Frontend pages load <script src="/config.js"></script>
// which sets window.__ZEABUR_FIREBASE_CONFIG_JSON for api-client.js to consume
app.get('/config.js', (req, res) => {
    const cfg = process.env.FIREBASE_CONFIG_JSON || '{}';
    const safe = cfg.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    res.type('application/javascript');
    res.send(`window.__ZEABUR_FIREBASE_CONFIG_JSON = '${safe}';`);
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({
        ok: true,
        time: new Date().toISOString(),
        firebase: !!db
    });
});

// ─── GET /api/projects — list all projects (REST fallback / admin) ─────────────
app.get('/api/projects', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'database not available' });
    try {
        const snap = await db.collection('projects').get();
        const list = [];
        snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        res.json(list);
    } catch (err) {
        console.error('/api/projects error', err);
        res.status(500).json({ error: 'server error' });
    }
});

// ─── GET /api/projects/:id — single project ────────────────────────────────────
app.get('/api/projects/:id', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'database not available' });
    try {
        const doc = await db.collection('projects').doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ error: 'not found' });
        res.json({ id: doc.id, ...doc.data() });
    } catch (err) {
        console.error('/api/projects/:id error', err);
        res.status(500).json({ error: 'server error' });
    }
});

// ─── POST /api/projects — create project ───────────────────────────────────────
app.post('/api/projects', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'database not available' });
    const payload = req.body;
    if (!payload || !payload.id) return res.status(400).json({ error: 'missing id' });
    try {
        const id = String(payload.id);
        const doc = { ...payload };
        delete doc.id;
        doc.createdAt = new Date().toISOString();
        doc.lastUpdated = doc.createdAt;
        await db.collection('projects').doc(id).set(doc);
        res.status(201).json({ ok: true, id });
    } catch (err) {
        console.error('/api/projects POST error', err);
        res.status(500).json({ error: 'server error' });
    }
});

// ─── PUT/PATCH /api/projects/:id — update project ──────────────────────────────
async function updateProject(req, res, merge) {
    if (!db) return res.status(503).json({ error: 'database not available' });
    try {
        const id = req.params.id;
        const doc = { ...req.body };
        delete doc.id;
        doc.lastUpdated = new Date().toISOString();
        await db.collection('projects').doc(id).set(doc, { merge });
        res.json({ ok: true, id });
    } catch (err) {
        console.error('update project error', err);
        res.status(500).json({ error: 'server error' });
    }
}
app.put('/api/projects/:id', (req, res) => updateProject(req, res, false));
app.patch('/api/projects/:id', (req, res) => updateProject(req, res, true));

// ─── POST /webhook/progress — n8n / automation progress updates ────────────────
// Expects header: x-webhook-secret matching env WEBHOOK_SECRET
// Body: { id, name?, progress, status, notes?, tags?, region? }
app.post('/webhook/progress', async (req, res) => {
    try {
        const secret = process.env.WEBHOOK_SECRET || '';
        const provided = req.get('x-webhook-secret') || req.query.secret || '';
        if (secret && provided !== secret) {
            return res.status(403).json({ error: 'forbidden' });
        }

        const payload = req.body;
        if (!payload || !payload.id) return res.status(400).json({ error: 'missing id' });
        if (!db) return res.status(503).json({ error: 'database not available' });

        const id = String(payload.id);
        const doc = { ...payload };
        delete doc.id;
        doc.lastUpdated = new Date().toISOString();

        await db.collection('projects').doc(id).set(doc, { merge: true });
        console.info(`[webhook] Updated project "${id}" progress=${doc.progress} status=${doc.status}`);
        return res.json({ ok: true, id });
    } catch (err) {
        console.error('/webhook/progress error', err);
        return res.status(500).json({ error: 'server error' });
    }
});

// ─── 404 fallback ─────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'not found' }));

// ─── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[server] Listening on port ${PORT}`);
    console.log(`[server] Firebase Admin: ${db ? 'ENABLED' : 'DISABLED (check FIREBASE_SA_JSON)'}`);
});

module.exports = app;