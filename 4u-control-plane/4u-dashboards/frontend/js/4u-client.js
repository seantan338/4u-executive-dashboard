// 4u-client.js — Firestore-first API client with REST fallback.
// Depends on firebase compat SDK being loaded BEFORE this script,
// and window.FIREBASE_CONFIG being set (injected by /config.js).

(function (global) {
  'use strict';

  const STATUSES = ['planned', 'in-progress', 'done', 'blocked'];

  let db = null;
  let mode = 'rest'; // 'firestore' | 'rest'

  function init() {
    if (global.__4u_client_initialized) return mode;
    try {
      if (global.firebase && global.FIREBASE_CONFIG && global.FIREBASE_CONFIG.apiKey) {
        if (!global.firebase.apps.length) {
          global.firebase.initializeApp(global.FIREBASE_CONFIG);
        }
        db = global.firebase.firestore();
        mode = 'firestore';
        console.info('[4u] Firestore mode');
      } else {
        console.info('[4u] REST mode (no Firebase config)');
      }
    } catch (e) {
      console.warn('[4u] Firebase init failed, using REST fallback:', e);
      mode = 'rest';
    }
    global.__4u_client_initialized = true;
    return mode;
  }

  // ---- Read: subscribe to all projects (realtime when firestore) -----------
  function subscribeProjects(onUpdate, onError) {
    init();
    if (mode === 'firestore') {
      return db.collection('projects').onSnapshot(
        snap => {
          const list = [];
          snap.forEach(doc => list.push(Object.assign({ id: doc.id }, doc.data())));
          onUpdate(list);
        },
        err => { console.error('[4u] snapshot error', err); if (onError) onError(err); }
      );
    }
    // REST polling fallback
    let stopped = false;
    const tick = async () => {
      try {
        const r = await fetch('/api/projects');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const list = await r.json();
        if (!stopped) onUpdate(list);
      } catch (e) {
        console.error('[4u] poll error', e);
        if (onError) onError(e);
      }
      if (!stopped) setTimeout(tick, 15000);
    };
    tick();
    return () => { stopped = true; };
  }

  // ---- Read: single project ------------------------------------------------
  async function getProject(id) {
    init();
    if (mode === 'firestore') {
      const doc = await db.collection('projects').doc(id).get();
      return doc.exists ? Object.assign({ id: doc.id }, doc.data()) : null;
    }
    const r = await fetch('/api/projects/' + encodeURIComponent(id));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  // ---- Read: subscribe to single project (realtime when firestore) --------
  function subscribeProject(id, onUpdate, onError) {
    init();
    if (mode === 'firestore') {
      return db.collection('projects').doc(id).onSnapshot(
        doc => { onUpdate(doc.exists ? Object.assign({ id: doc.id }, doc.data()) : null); },
        err => { if (onError) onError(err); }
      );
    }
    let stopped = false;
    const tick = async () => {
      try { onUpdate(await getProject(id)); }
      catch (e) { if (onError) onError(e); }
      if (!stopped) setTimeout(tick, 15000);
    };
    tick();
    return () => { stopped = true; };
  }

  // ---- Write: upsert project (admin UI) -----------------------------------
  async function upsertProject(obj) {
    if (!obj || !obj.id) throw new Error('project.id required');
    const id = obj.id;
    const payload = Object.assign({}, obj);
    delete payload.id;
    payload.lastUpdated = new Date().toISOString();

    // Always use REST so server is source of truth and can mediate writes later
    const r = await fetch('/api/projects/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  // ---- Utilities -----------------------------------------------------------

  // Merge registry defaults with live Firestore data so missing docs
  // still render (as 0% planned, unless feature specifies defaultStatus/defaultProgress).
  function mergeWithRegistry(liveList) {
    const reg = (global.FEATURE_REGISTRY && global.FEATURE_REGISTRY.FEATURES) || [];
    const liveMap = new Map();
    (liveList || []).forEach(p => liveMap.set(p.id, p));
    return reg.map(f => {
      const live = liveMap.get(f.id);
      const hasLive = !!live;
      // Subtasks: prefer live (admin toggled) → else registry defaults
      // If feature is defaultStatus=done and no live, check all boxes by default
      const defaultChecked = !hasLive && f.defaultStatus === 'done';
      const subtasks = Array.isArray(live && live.subtasks) ? live.subtasks
                     : (f.subtasks || []).map(label => ({ label, done: defaultChecked }));
      // Progress: live explicit → else derived from checks → else registry default → else 0
      let progress;
      if (hasLive && typeof live.progress === 'number') {
        progress = live.progress;
      } else if (hasLive) {
        progress = subtasks.length === 0 ? 0
          : Math.round(100 * subtasks.filter(s => s.done).length / subtasks.length);
      } else if (typeof f.defaultProgress === 'number') {
        progress = f.defaultProgress;
      } else {
        progress = 0;
      }
      const status = (hasLive && live.status)
        ? live.status
        : (f.defaultStatus || (progress === 0 ? 'planned' : progress >= 100 ? 'done' : 'in-progress'));
      return Object.assign({}, f, {
        progress, status, subtasks,
        notes: (live && live.notes) || '',
        lastUpdated: (live && live.lastUpdated) || null,
        owner: (live && live.owner) || '',
      });
    });
  }

  function formatWhen(iso) {
    if (!iso) return 'never';
    const d = new Date(iso); const now = Date.now();
    const s = Math.floor((now - d.getTime()) / 1000);
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }

  function toast(msg, kind) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    if (kind === 'error') t.style.borderColor = 'var(--blk)';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  }

  global.FourU = {
    init, subscribeProjects, subscribeProject, getProject, upsertProject,
    mergeWithRegistry, formatWhen, toast, STATUSES,
    get mode() { return mode; },
  };
})(window);
