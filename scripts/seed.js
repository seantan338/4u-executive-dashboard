// scripts/seed.js
// One-shot: writes every feature from the registry into Firestore `projects`
// collection at 0% planned. Safe to re-run — uses merge=true so existing progress
// is preserved.
//
// Usage:
//   node scripts/seed.js                  # merge (preserve progress)
//   node scripts/seed.js --overwrite      # full overwrite (resets progress to 0)

require('dotenv').config();
const admin = require('firebase-admin');
const path = require('path');

// Load registry (it's a browser module, but guarded with CommonJS export at bottom)
require(path.join(__dirname, '..', 'frontend', 'js', 'feature-registry.js'));
const registry = global.FEATURE_REGISTRY;

if (!registry || !registry.FEATURES) {
  console.error('Could not load feature registry.');
  process.exit(1);
}

const raw = process.env.FIREBASE_SA_JSON || '';
if (!raw) {
  console.error('FIREBASE_SA_JSON not set in env. Cannot seed Firestore.');
  process.exit(1);
}

let sa;
try {
  sa = raw.trim().startsWith('{')
    ? JSON.parse(raw)
    : JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
} catch (e) {
  console.error('Invalid FIREBASE_SA_JSON:', e.message);
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const overwrite = process.argv.includes('--overwrite');

(async () => {
  const now = new Date().toISOString();
  let ok = 0, skip = 0, err = 0;

  for (const f of registry.FEATURES) {
    try {
      const docRef = db.collection('projects').doc(f.id);
      const existing = await docRef.get();

      const firstCreateStatus = f.defaultStatus || 'planned';
      const firstCreateProgress = typeof f.defaultProgress === 'number' ? f.defaultProgress : 0;
      const firstCreateDone = firstCreateStatus === 'done';

      const payload = {
        name: f.name,
        phase: f.phase,
        codebase: f.codebase,
        audience: f.audience,
        size: f.size,
        summary: f.summary,
        value: f.value,
        subtasks: f.subtasks.map(label => ({ label, done: firstCreateDone })),
        lastUpdated: now,
      };

      if (!existing.exists) {
        payload.createdAt = now;
        payload.status = firstCreateStatus;
        payload.progress = firstCreateProgress;
        payload.owner = '';
        payload.notes = '';
        await docRef.set(payload);
        console.log(`  + ${f.id}${firstCreateStatus !== 'planned' ? ' [' + firstCreateStatus + ']' : ''}`);
        ok++;
      } else if (overwrite) {
        payload.status = firstCreateStatus;
        payload.progress = firstCreateProgress;
        payload.owner = '';
        payload.notes = '';
        await docRef.set(payload);
        console.log(`  ↻ ${f.id} (overwrite)`);
        ok++;
      } else {
        // Merge non-progress fields (name, phase, subtask labels) so registry edits propagate
        // but preserve progress / status / notes / subtask done-state.
        const existingData = existing.data();
        const existingSubtasks = existingData.subtasks || [];
        const mergedSubtasks = payload.subtasks.map((s, i) => ({
          label: s.label,
          done: existingSubtasks[i] ? !!existingSubtasks[i].done : false,
        }));
        await docRef.set({
          name: payload.name,
          phase: payload.phase,
          codebase: payload.codebase,
          audience: payload.audience,
          size: payload.size,
          summary: payload.summary,
          value: payload.value,
          subtasks: mergedSubtasks,
          lastUpdated: now,
        }, { merge: true });
        console.log(`  · ${f.id} (merged, progress preserved)`);
        skip++;
      }
    } catch (e) {
      console.error(`  ! ${f.id}:`, e.message);
      err++;
    }
  }

  console.log(`\nDone. created=${ok} merged=${skip} errors=${err}`);
  process.exit(err > 0 ? 1 : 0);
})();
