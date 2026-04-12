// api-client.js
// Lightweight adapter for reading/writing project progress.
// Supports two modes:
// 1) Firestore (recommended): expects firebase compat SDK to be loaded and window.FIREBASE_CONFIG set before this script runs.
// 2) REST fallback: expects a backend REST API at /api/projects

(function (global) {
    'use strict';

    const MODE = {
        FIRESTORE: 'firestore',
        REST: 'rest'
    };

    let activeMode = null;
    let db = null;

    // Initialize Firebase (compat) when window.FIREBASE_CONFIG is provided.
    function initFirebaseIfAvailable() {
        try {
            if (window.FIREBASE_CONFIG && window.firebase && !global.__4u_firebase_initialized) {
                firebase.initializeApp(window.FIREBASE_CONFIG);
                db = firebase.firestore();
                activeMode = MODE.FIRESTORE;
                global.__4u_firebase_initialized = true;
                console.info('[api-client] Firebase initialized, using Firestore mode.');
            }
        } catch (e) {
            console.warn('[api-client] Firebase init error:', e);
        }
    }

    // Public: determine mode (try Firestore then fallback to REST)
    function detectMode() {
        initFirebaseIfAvailable();
        if (db) return MODE.FIRESTORE;
        return MODE.REST;
    }

    // Subscribe to projects collection (real-time). callback receives array of project objects.
    function subscribeProjects(callback, errorCallback) {
        const mode = detectMode();
        if (mode === MODE.FIRESTORE) {
            return db.collection('projects').onSnapshot(snapshot => {
                const list = [];
                snapshot.forEach(doc => {
                    list.push(Object.assign({ id: doc.id }, doc.data()));
                });
                callback(list);
            }, err => {
                console.error('[api-client] Firestore onSnapshot error', err);
                if (typeof errorCallback === 'function') errorCallback(err);
            });
        } else {
            // REST polling fallback: fetch immediately and then every 20s
            let stopped = false;
            async function tick() {
                try {
                    const res = await fetch('/api/projects');
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    const list = await res.json();
                    if (!stopped) callback(list);
                } catch (err) {
                    console.error('[api-client] REST fetch error', err);
                    if (typeof errorCallback === 'function') errorCallback(err);
                }
                if (!stopped) setTimeout(tick, 20000);
            }
            tick();
            return () => { stopped = true; };
        }
    }

    // Get single project by id (promise)
    async function getProject(id) {
        const mode = detectMode();
        if (mode === MODE.FIRESTORE) {
            const doc = await db.collection('projects').doc(id).get();
            if (!doc.exists) return null;
            return Object.assign({ id: doc.id }, doc.data());
        } else {
            const res = await fetch('/api/projects/' + encodeURIComponent(id));
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return await res.json();
        }
    }

    // Update / create a project (used by webhooks or admin UI)
    async function upsertProject(obj) {
        const mode = detectMode();
        if (!obj || !obj.id) throw new Error('project object with id required');
        const id = obj.id;
        if (mode === MODE.FIRESTORE) {
            const data = Object.assign({}, obj);
            delete data.id;
            data.lastUpdated = new Date().toISOString();
            await db.collection('projects').doc(id).set(data, { merge: true });
            return { ok: true };
        } else {
            const res = await fetch('/api/projects/' + encodeURIComponent(id), {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj)
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return await res.json();
        }
    }

    // Render helpers (lightweight DOM helpers used by the dashboards)
    function createProjectCardDOM(p) {
        // container with id proj-{id}
        const el = document.createElement('div');
        el.className = 'card project-card';
        el.id = 'proj-' + sanitizeId(p.id);

        const header = document.createElement('div'); header.className = 'card-header';
        const title = document.createElement('div'); title.className = 'card-title'; title.textContent = p.name || p.id;
        const badge = document.createElement('div'); badge.className = 'badge';
        if (p.status === 'completed') badge.classList.add('good');
        else if (p.status === 'error' || p.status === 'blocked') badge.classList.add('error');
        else if (p.status === 'in_progress' || p.status === 'active') badge.classList.add('warn');
        badge.textContent = (p.status || 'unknown').toUpperCase();

        header.appendChild(title); header.appendChild(badge);

        const desc = document.createElement('div'); desc.className = 'card-sub'; desc.textContent = p.notes || p.type || '';

        const progWrap = document.createElement('div'); progWrap.className = 'progress-wrap mt-8';
        const progLabel = document.createElement('div'); progLabel.className = 'progress-meta';
        const left = document.createElement('div'); left.textContent = 'Progress';
        const right = document.createElement('div'); right.textContent = (Number(p.progress) || 0) + '%'; right.id = 'proj-' + sanitizeId(p.id) + '-text';
        progLabel.appendChild(left); progLabel.appendChild(right);

        const prog = document.createElement('div'); prog.className = 'progress';
        const fill = document.createElement('div'); fill.className = 'fill fill-brand'; fill.style.width = (Number(p.progress) || 0) + '%'; fill.id = 'proj-' + sanitizeId(p.id) + '-bar';
        prog.appendChild(fill);

        progWrap.appendChild(progLabel); progWrap.appendChild(prog);

        el.appendChild(header); el.appendChild(desc); el.appendChild(progWrap);
        return el;
    }

    function sanitizeId(id) { return String(id).replace(/[^a-zA-Z0-9_-]/g, '-'); }

    // Render a list of projects into containerId
    function renderProjectList(containerId, projects) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn('[api-client] renderProjectList: container not found', containerId);
            return;
        }
        // Clear and render
        container.innerHTML = '';
        projects.forEach(p => {
            const card = createProjectCardDOM(p);
            container.appendChild(card);
        });
    }

    // Update single project DOM if exists (by id)
    function updateProjectDOM(p) {
        const id = 'proj-' + sanitizeId(p.id);
        const card = document.getElementById(id);
        if (!card) return false;
        const text = document.getElementById(id + '-text');
        const bar = document.getElementById(id + '-bar');
        if (text) text.textContent = (Number(p.progress) || 0) + '%';
        if (bar) bar.style.width = (Number(p.progress) || 0) + '%';
        // update badge
        const badge = card.querySelector('.badge');
        if (badge) badge.textContent = (p.status || 'unknown').toUpperCase();
        return true;
    }

    // Expose API
    global.__4u_api = {
        subscribeProjects,
        getProject,
        upsertProject,
        renderProjectList,
        updateProjectDOM,
        detectMode
    };

})(window);