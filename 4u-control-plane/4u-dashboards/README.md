# 4U Control Plane

Live dashboards + admin UI for tracking the Sunrise Recruit build.

## What's in the box

```
backend/
  server.js              Express server + REST API + /config.js injector
frontend/
  index.html             The Blueprint — master view of all features
  feature.html           Dynamic per-feature deep-dive (?id=<feature-id>)
  admin.html             Manual progress editor (no auth)
  css/4u.css             Unified design system
  js/
    feature-registry.js  Single source of truth — edit this to add features
    4u-client.js         Firestore-first API client + REST fallback
scripts/
  seed.js                One-shot Firestore seeder
package.json
```

## Architecture

```
    ┌────────────────────────────┐      ┌─────────────────────────────┐
    │  Blueprint  /  Feature UI  │◀─────│   Firestore                 │
    │  (read-only dashboards)    │      │   collection: projects      │
    └────────────────────────────┘      │   doc id = feature.id       │
                                        └─────────────────────────────┘
    ┌────────────────────────────┐                   ▲
    │  Admin UI  (you)           │──PATCH /api/──────┘
    │  toggle, progress, notes   │
    └────────────────────────────┘
```

The **feature registry** (`frontend/js/feature-registry.js`) is the single source
of truth for *what* is being tracked. When you add a new feature, edit that file,
commit, redeploy. The admin UI's **Seed** button (or `npm run seed`) pushes new
features into Firestore without touching already-tracked ones.

Progress, status, notes, and checkbox state live in Firestore (`projects`
collection). The admin UI writes via `PATCH /api/projects/:id`.

## Routes

| Path                | Purpose                                  |
|---------------------|------------------------------------------|
| `/`                 | Blueprint dashboard                      |
| `/feature.html?id=candidate-profile-crud` | Any feature page |
| `/admin.html`       | Admin editor                             |
| `/api/projects`     | `GET` list, `POST` create                |
| `/api/projects/:id` | `GET`, `PUT` (replace), `PATCH` (merge)  |
| `/webhook/progress` | POST with `x-webhook-secret` header      |
| `/config.js`        | Firebase client config (injected)        |
| `/health`           | `{ ok, firebase, store }`                |

## Environment variables

```bash
PORT=3000

# Client-side Firebase config (single-line JSON) — rendered into pages via /config.js
FIREBASE_CONFIG_JSON={"apiKey":"...","authDomain":"...","projectId":"...","storageBucket":"...","messagingSenderId":"...","appId":"..."}

# Server-side Firebase Admin service account (base64 or raw JSON)
FIREBASE_SA_JSON=<base64 or JSON of service account key>

# Webhook secret for automated progress updates (optional)
WEBHOOK_SECRET=<long random string>
```

⚠️ **Security:** the previous version of this repo had Firebase credentials
and project IDs hardcoded in committed HTML. They're removed here. Client
config is injected at runtime from `FIREBASE_CONFIG_JSON`. **Rotate any keys
that were committed to git**, and set Firestore rules to deny-by-default
before exposing this URL.

## Running locally

```bash
npm install
# Without Firebase (in-memory store, data lost on restart):
npm start
# With Firebase:
FIREBASE_CONFIG_JSON='{"apiKey":"...","projectId":"..."}' \
FIREBASE_SA_JSON='...' \
npm start
```

Open http://localhost:3000/.

## Seeding Firestore

Once, after first deploy:

```bash
npm run seed              # only creates missing docs, preserves progress
npm run seed -- --overwrite  # force-reset everything to 0%
```

Or click the **"Seed all features to Firestore"** button on `/admin.html`.

## Adding a new feature

1. Open `frontend/js/feature-registry.js`.
2. Copy an existing feature object, give it a kebab-case `id`, fill in fields.
3. Commit + redeploy.
4. The feature appears on the blueprint immediately (at 0% planned).
5. Click **Seed** on the admin page, or run `npm run seed`, to create the
   Firestore doc.

## Firestore rules starter (paste into Firestore console)

The admin UI has no auth right now. Until you add one, consider locking writes
to admin SDK only:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Public read so the blueprint + feature pages can render
    match /projects/{id} {
      allow read: if true;
      // Writes only from server (via Firebase Admin SDK which bypasses rules)
      allow write: if false;
    }
  }
}
```

With these rules the admin UI still works because the Admin UI writes through
your Express backend (`PATCH /api/projects/:id`), and the server uses the
Firebase Admin SDK which ignores security rules.

## What was cleaned up from the previous repo

- `frontend/index.html`, `sunrise-n8n-workflow-master-plan.html`, and
  `4u-platform-executive-dashboard.html` contained literal backslash-escaped
  HTML (`<script\ src=...>`) from a broken injection script. Replaced with
  clean files.
- Firebase project ID + API key that were hardcoded in committed HTML are
  removed. Rotate them.
- Two parallel data models (`system_metrics/project_progress` vs
  `projects/*`) unified onto `projects/*` only.
