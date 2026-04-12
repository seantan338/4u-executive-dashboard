// realtime.js
// Handles real-time subscription to 'projects' collection using Firestore onSnapshot
// Fallback: polling REST endpoint '/api/projects'

(function (global) {
    'use strict';

    function startRealtime(options) {
        // options: { onUpdate: function(projectsArray), onError: fn }
        const onUpdate = (options && options.onUpdate) ? options.onUpdate : function () { };
        const onError = (options && options.onError) ? options.onError : function () { };

        // Try Firestore
        try {
            if (window.firebase && window.FIREBASE_CONFIG && firebase.firestore) {
                const db = firebase.firestore();
                console.info('[realtime] starting Firestore onSnapshot for collection: projects');
                const unsub = db.collection('projects').onSnapshot(snapshot => {
                    const list = [];
                    snapshot.forEach(doc => list.push(Object.assign({ id: doc.id }, doc.data())));
                    onUpdate(list);
                }, err => {
                    console.error('[realtime] Firestore snapshot error', err);
                    onError(err);
                });
                return { mode: 'firestore', unsubscribe: unsub };
            }
        } catch (e) {
            console.warn('[realtime] Firestore not available or init failed', e);
        }

        // Fallback to REST polling
        console.info('[realtime] Falling back to REST polling /api/projects');
        let stopped = false;
        async function tick() {
            try {
                const res = await fetch('/api/projects');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const list = await res.json();
                onUpdate(list);
            } catch (err) {
                console.error('[realtime] Polling error', err);
                onError(err);
            }
            if (!stopped) setTimeout(tick, (options && options.intervalMs) || 20000);
        }
        tick();
        return { mode: 'poll', stop: () => { stopped = true; } };
    }

    global.__4u_realtime = { startRealtime };
})(window);