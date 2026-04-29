# 4U Control Plane

Live dashboards + admin UI for tracking the Sunrise Recruit build. Express
backend serving static HTML/JS/CSS frontend, backed by Firebase / Firestore
(with an in-memory fallback for local dev).

## Repo layout
backend/server.js              Express server + REST API + /config.js injector
frontend/index.html            Blueprint
frontend/feature.html          Per-feature deep dive (?id=<feature-id>)
frontend/admin.html            Manual progress editor (no auth — see security note)
frontend/css/4u.css            Unified design system
frontend/js/feature-registry.js Single source of truth for tracked features
frontend/js/4u-client.js       Firestore-first client with REST fallback
scripts/seed.js                One-shot Firestore seeder
zeabur.json                    Zeabur platform config (port + healthcheck)
package.json

## Deploying to Zeabur

1. Push this repo/branch to GitHub.
2. In Zeabur, create a service from this repo. Zeabur auto-detects Node and
   runs 
pm ci && npm start. zeabur.json declares port 3000 and /health
   as the health check.
3. Set environment variables in the Zeabur service:
   - FIREBASE_CONFIG_JSON — single-line JSON of the Firebase web config
   - FIREBASE_SA_JSON     — Firebase Admin service-account key (raw JSON or base64)
   - WEBHOOK_SECRET       — only if you use /webhook/progress
   - PORT is set automatically by Zeabur
4. After first deploy, seed Firestore from Zeabur's service shell:
   npm run seed              # creates missing docs, preserves progress
   npm run seed -- --overwrite # force-reset everything to 0%
5. Lock down Firestore — paste these rules into the Firebase console:
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /projects/{id} {
         allow read: if true;
         allow write: if false;
       }
     }
   }

## Running locally
cp .env.example .env      # then fill in your values
npm install
npm start                 # http://localhost:3000

Without env vars set, the server boots in in-memory mode — UI works but data
does not persist across restarts.

## Security notes

- Rotate any Firebase keys that may have been committed to git history in
  earlier revisions of this repo.
- /admin.html has NO authentication. Either put the deployment behind
  Zeabur's network access controls, add an Express auth middleware, or
  restrict it to a private domain before exposing externally.
- CORS is currently *. Tighten in ackend/server.js once a real domain
  is in use.
