// feature-registry.js
// Single source of truth for every feature tracked by the 4U control plane.
// Edit this file to add/remove/rename features. Everything else (blueprint grid,
// feature pages, admin UI, Firestore seed) reads from here.
//
// Each feature is also the Firestore document ID in the `projects` collection.

(function (global) {
  'use strict';

  const CODEBASE = {
    SR_WEB: { id: 'sr-web-as', label: 'SR-Web-AS', color: '#d97706', note: 'React 19 candidate & recruiter app' },
    SR_TOOLS: { id: 'sunrise-tools', label: 'sunrise-tools', color: '#0891b2', note: '11 internal HTML tools' },
    SR_PROXY: { id: 'sr-proxy', label: 'sr-proxy', color: '#7c3aed', note: 'AI credential vault' },
    RECRUIT_OS: { id: 'recruitment-os', label: 'Recruitment OS', color: '#059669', note: 'Job + candidate ops platform' },
    FOUR_U: { id: '4u-platform', label: '4U Platform', color: '#dc2626', note: 'Control plane (this app)' },
    N8N: { id: 'n8n', label: 'n8n Automation', color: '#ea4b71', note: '15 workflows · MY + SG agency ops' },
  };

  const PHASES = {
    P1: { id: 'P1', label: 'Phase 1 — Foundation',     timeline: 'Current Sprint',   order: 1 },
    P2: { id: 'P2', label: 'Phase 2 — Core Workflows', timeline: '4–6 weeks',         order: 2 },
    P3: { id: 'P3', label: 'Phase 3 — Growth',         timeline: '2–3 months',        order: 3 },
    P4: { id: 'P4', label: 'Phase 4 — Scale',          timeline: '3–6 months',        order: 4 },
    P0: { id: 'P0', label: 'Phase 0 — Control Plane',  timeline: 'Always-on',         order: 0 },
    N0: { id: 'N0', label: 'n8n P0 — Now',             timeline: '0–30 days',         order: 10 },
    N1: { id: 'N1', label: 'n8n P1 — Next',            timeline: '30–90 days',        order: 11 },
    N2: { id: 'N2', label: 'n8n P2 — Later',           timeline: '90–180 days',       order: 12 },
  };

  const AUDIENCE = {
    CAND: 'Candidate',
    RECR: 'Recruiter',
    ADMIN: 'Admin',
    PART: 'Partner',
    INT: 'Internal',
    ALL: 'All roles',
    OPS: 'Operations',
    SALES: 'Sales',
    COMPL: 'Compliance',
    FIN: 'Finance',
    ANAL: 'Analytics',
    SUPP: 'Support',
  };

  const SIZE = { S: 'S · <1 week', M: 'M · 1–3 weeks', L: 'L · 3+ weeks' };

  // ---------------------------------------------------------------------------
  // FEATURE REGISTRY
  // ---------------------------------------------------------------------------
  // `id` is used as Firestore doc ID and URL slug. Keep it kebab-case and stable.
  // `subtasks` drive the feature page checklist; `progress` is computed from them
  // unless the admin UI overrides it explicitly.
  const FEATURES = [
    // -------- Phase 1: Foundation (Sunrise Recruit) --------
    {
      id: 'candidate-profile-crud',
      name: 'Candidate Profile CRUD',
      phase: 'P1', codebase: 'sr-web-as', audience: AUDIENCE.CAND, size: SIZE.M,
      summary: 'Create, read, update, delete candidate profiles with avatar upload and completeness scoring.',
      value: 'Core data model — required by recruiter search, pipeline, and AI matching.',
      subtasks: [
        'Firestore /candidates schema locked',
        'Create + edit form (multi-step wizard)',
        'Avatar upload to Firebase Storage',
        'Completeness score algorithm',
        'Delete with soft-delete audit log',
      ],
    },
    {
      id: 'resume-upload',
      name: 'Resume Upload',
      phase: 'P1', codebase: 'sr-web-as', audience: AUDIENCE.CAND, size: SIZE.S,
      summary: 'PDF/DOCX resume upload via Firebase Storage with validation and parse trigger.',
      value: 'Foundational for CV screener and AI matching.',
      subtasks: [
        'File picker + drag-drop UI',
        'Type + size validation (PDF/DOCX, 10MB)',
        'Firebase Storage upload with progress',
        'Parse trigger webhook to sr-proxy',
      ],
    },
    {
      id: 'firestore-security-rules',
      name: 'Firestore Security Rules',
      phase: 'P1', codebase: 'sr-web-as', audience: AUDIENCE.ADMIN, size: SIZE.M,
      summary: 'Role-based read/write rules at the database layer.',
      value: 'Non-negotiable. Prevents data leaks before public launch.',
      subtasks: [
        'Rules for /candidates (self-read, self-write)',
        'Rules for /jobs (recruiter-read, admin-write)',
        'Rules for /placements (admin-only)',
        'Emulator test suite',
        'Deploy to production project',
      ],
    },
    {
      id: 'sso-integration',
      name: 'SSO Integration',
      phase: 'P1', codebase: 'sr-web-as', audience: AUDIENCE.INT, size: SIZE.M,
      summary: 'SR-Web-AS issues signed SSO token; sunrise-tools validates before granting access.',
      value: 'Eliminates separate logins, improves security posture.',
      subtasks: [
        'Express endpoint generates signed JWT',
        'Shared secret SR_SSO_SECRET in env',
        'Redirect flow with ?sso= param',
        '15-minute expiry claim',
        'sunrise-tools validator middleware',
        'Strip token from URL post-validation',
      ],
    },
    {
      id: 'sr-proxy-auth',
      name: 'sr-proxy Request Authentication',
      phase: 'P1', codebase: 'sr-proxy', audience: AUDIENCE.INT, size: SIZE.S,
      summary: 'All AI inference requests require valid x-proxy-secret header.',
      value: 'Prevents unauthorised AI API key use and cost abuse.',
      subtasks: [
        'Middleware validates x-proxy-secret',
        '401 on missing/invalid secret',
        'CORS locked to sunrise-tools origin',
        'Rate limit per origin',
      ],
    },
    {
      id: 'admin-real-analytics',
      name: 'Admin Real Analytics',
      phase: 'P1', codebase: 'sr-web-as', audience: AUDIENCE.ADMIN, size: SIZE.M,
      summary: 'Replace placeholder admin metrics with live Firestore aggregations.',
      value: 'Leadership visibility for operational decisions.',
      subtasks: [
        'Aggregation query: total candidates',
        'Aggregation query: active jobs',
        'Aggregation query: placements',
        'Recruiter activity feed',
        'Caching layer (5-min TTL)',
      ],
    },

    // -------- Phase 2: Core Workflows --------
    {
      id: 'candidate-search',
      name: 'Candidate Search',
      phase: 'P2', codebase: 'sr-web-as', audience: AUDIENCE.RECR, size: SIZE.M,
      summary: 'Firestore-powered recruiter search with saved filters.',
      value: 'Core recruiter workflow — match candidates to roles at speed.',
      subtasks: [
        'Composite indexes on skills + location',
        'Filter UI: skills, location, availability',
        'Saved search documents',
        'Pagination + result count',
      ],
    },
    {
      id: 'application-pipeline-kanban',
      name: 'Application Pipeline (Kanban)',
      phase: 'P2', codebase: 'sr-web-as', audience: AUDIENCE.RECR, size: SIZE.L,
      summary: 'Drag-and-drop kanban: Sourced → Screened → Submitted → Interview → Offer → Placed.',
      value: 'Visual pipeline reduces missed follow-ups; surfaces recruiter workload.',
      subtasks: [
        'Kanban library chosen + integrated',
        'Stage definitions + order',
        'Drag-and-drop with optimistic updates',
        'Card click → candidate detail drawer',
        'Stage change audit trail',
        'Filter by recruiter / client',
      ],
    },
    {
      id: 'in-app-notifications',
      name: 'In-App Notifications',
      phase: 'P2', codebase: 'sr-web-as', audience: AUDIENCE.ALL, size: SIZE.M,
      summary: 'Real-time notifications via Firestore listeners.',
      value: 'Keeps users informed without manual checking.',
      subtasks: [
        '/notifications subcollection per user',
        'Bell icon with unread count',
        'Mark all read action',
        'Notification types: application, status, interview, partner',
      ],
    },
    {
      id: 'email-notification-system',
      name: 'Email Notification System',
      phase: 'P2', codebase: 'sr-web-as', audience: AUDIENCE.ALL, size: SIZE.M,
      summary: 'Transactional email via SendGrid or Resend.',
      value: 'Professional comms, fewer no-shows.',
      subtasks: [
        'Provider chosen (SendGrid vs Resend)',
        'Welcome email template',
        'Status-change template',
        'Interview reminder template',
        'Offer letter template',
        'Bounce + complaint handling',
      ],
    },
    {
      id: 'partner-portal-workflows',
      name: 'Partner Portal Workflows',
      phase: 'P2', codebase: 'sr-web-as', audience: AUDIENCE.PART, size: SIZE.L,
      summary: 'Real functionality: submit job orders, view submissions, approve/reject.',
      value: 'Client self-service reduces recruiter admin.',
      subtasks: [
        'Partner role + Firestore rules',
        'Job order intake form',
        'Candidate submission list',
        'Approve / reject actions',
        'Placement status tracker',
      ],
    },
    {
      id: 'interview-scheduling',
      name: 'Interview Scheduling',
      phase: 'P2', codebase: 'sr-web-as', audience: AUDIENCE.RECR, size: SIZE.L,
      summary: 'In-app booking with Google Calendar integration.',
      value: 'Eliminates scheduling back-and-forth.',
      subtasks: [
        'Availability slot model',
        'Google Calendar OAuth + event creation',
        'Time-slot picker UI',
        'Automated reminders (T-24h, T-1h)',
        'Reschedule / cancel flow',
      ],
    },

    // -------- Phase 3: Growth --------
    {
      id: 'messaging-system',
      name: 'Messaging System',
      phase: 'P3', codebase: 'sr-web-as', audience: AUDIENCE.RECR, size: SIZE.L,
      summary: 'In-app direct messaging with read receipts and attachments.',
      value: 'Replaces fragmented WhatsApp/email with auditable record.',
      subtasks: [
        'Firestore /threads + /messages schema',
        'Real-time message list UI',
        'Read-receipt tracking',
        'File attachment upload',
        'Search within threads',
      ],
    },
    {
      id: 'commission-placement-tracking',
      name: 'Commission & Placement Tracking',
      phase: 'P3', codebase: 'sr-web-as', audience: AUDIENCE.ADMIN, size: SIZE.L,
      summary: 'Placement records, fees, commission splits, PDF invoicing.',
      value: 'Revenue-critical — track and collect placement fees.',
      subtasks: [
        '/placements schema with fee terms',
        'Commission split calculation',
        'PDF invoice generator',
        'Payment status tracking',
        'Monthly revenue report',
      ],
    },
    {
      id: 'google-sheets-migration',
      name: 'Google Sheets Migration',
      phase: 'P3', codebase: 'sr-web-as', audience: AUDIENCE.INT, size: SIZE.M,
      summary: 'Migrate staff attendance, commissions, SOP logs to Firestore.',
      value: 'Eliminates data silos; reduces manual reconciliation.',
      subtasks: [
        'Inventory existing Sheets',
        'Schema mapping per sheet',
        'One-shot migration scripts',
        'Parallel-run validation period',
        'Cut-over + sheet archive',
      ],
    },
    {
      id: 'mobile-pwa',
      name: 'Mobile Responsive + PWA',
      phase: 'P3', codebase: 'sr-web-as', audience: AUDIENCE.ALL, size: SIZE.M,
      summary: 'Mobile breakpoints audit + PWA manifest + service worker.',
      value: 'Candidates browse on mobile; recruiter field use.',
      subtasks: [
        'Breakpoint audit (all screens)',
        'Fix layout bugs',
        'PWA manifest.json',
        'Service worker for offline cache',
        'Install prompt UX',
      ],
    },
    {
      id: 'ai-candidate-matching',
      name: 'AI Candidate Matching',
      phase: 'P3', codebase: 'sr-web-as', audience: AUDIENCE.RECR, size: SIZE.L,
      summary: 'Claude scores candidate-job fit on skills, experience, location, availability.',
      value: 'Reduces recruiter time-to-shortlist; key differentiator.',
      subtasks: [
        'Scoring prompt engineered',
        'Claude call via sr-proxy',
        'Score storage + cache',
        'Top-N surfacing on job view',
        'Explanation panel (why this score)',
      ],
    },

    // -------- Phase 4: Scale --------
    {
      id: 'analytics-dashboard',
      name: 'Analytics Dashboard',
      phase: 'P4', codebase: 'sr-web-as', audience: AUDIENCE.ADMIN, size: SIZE.L,
      summary: 'Executive + recruiter dashboards: time-to-hire, source attribution, pipeline velocity.',
      value: 'Data-driven hiring decisions.',
      subtasks: [
        'Metric definitions locked',
        'Aggregation pipeline (daily cron)',
        'Chart library chosen',
        'Role-based views',
        'CSV export',
      ],
    },
    {
      id: 'partner-api',
      name: 'Partner API',
      phase: 'P4', codebase: 'sr-web-as', audience: AUDIENCE.PART, size: SIZE.L,
      summary: 'REST API for partners: submit jobs, query status, webhooks.',
      value: 'Enterprise integrations; B2B revenue.',
      subtasks: [
        'API key issuance + rotation',
        'POST /jobs endpoint',
        'GET /candidates/:id/status',
        'Webhook delivery with retry',
        'Rate limits per partner',
        'API docs (OpenAPI)',
      ],
    },
    {
      id: 'white-label',
      name: 'White-Label Option',
      phase: 'P4', codebase: 'sr-web-as', audience: AUDIENCE.ADMIN, size: SIZE.L,
      summary: 'Configurable branding: logo, colours, domain.',
      value: 'High-value enterprise revenue stream.',
      subtasks: [
        'Tenant model in Firestore',
        'Per-tenant theme variables',
        'Custom domain support',
        'Logo upload + storage',
        'Tenant provisioning flow',
      ],
    },
    {
      id: 'automated-email-sequences',
      name: 'Automated Email Sequences',
      phase: 'P4', codebase: 'sr-web-as', audience: AUDIENCE.CAND, size: SIZE.M,
      summary: 'Drip sequences: post-registration, status updates, interview prep, re-engagement.',
      value: 'Improves candidate experience; reduces manual follow-up.',
      subtasks: [
        'Sequence definition schema',
        'Scheduler (cron or queue)',
        'Template editor',
        'Unsubscribe handling',
        'Per-sequence metrics',
      ],
    },
    {
      id: 'video-interview',
      name: 'Video Interview Integration',
      phase: 'P4', codebase: 'sr-web-as', audience: AUDIENCE.RECR, size: SIZE.L,
      summary: 'Embedded one-way + live video (Daily.co or similar).',
      value: 'Replaces costly third-party tools; async screening.',
      subtasks: [
        'Provider evaluated (Daily.co)',
        'One-way interview flow',
        'Live interview room',
        'Recording storage to Firebase',
        'Link recording to candidate profile',
      ],
    },

    // -------- n8n Automation Workflows (15 flows, 3 n8n-phases) --------
    // Note: these use n8n-specific phases N0/N1/N2, not the Sunrise Recruit P1–P4.
    // Two are already live per the existing master plan; seed will preserve that.
    {
      id: 'n8n-sr-job-order-auto-entry',
      name: 'SR Job Order Auto Entry',
      phase: 'N0', codebase: 'n8n', audience: AUDIENCE.OPS, size: SIZE.S,
      summary: 'Telegram message → Gemini extracts job fields → appends row to Google Sheets Job Order 2026.',
      value: 'Removes manual job-order typing. Live workflow · ~0 MYR cost.',
      defaultStatus: 'done', defaultProgress: 100,
      subtasks: [
        'Telegram trigger wired',
        'Gemini AI extractor prompt',
        'Split-out multi-jobs node',
        'Append to Google Sheets',
        'Production test run',
      ],
    },
    {
      id: 'n8n-sunrise-cv-automated-pipeline',
      name: 'Sunrise CV Automated Pipeline',
      phase: 'N0', codebase: 'n8n', audience: AUDIENCE.RECR, size: SIZE.M,
      summary: 'Telegram CV upload → whitelist → Gemini parse → ATS Master Sheet → Google Docs CV card → DOCX back to recruiter.',
      value: 'Automates the full CV intake loop. Live workflow.',
      defaultStatus: 'done', defaultProgress: 100,
      subtasks: [
        'Telegram file trigger',
        'Whitelist check',
        'Has-document IF branch',
        'Gemini doc analyzer',
        'JS data transform',
        'Write to ATS Master Sheet',
        'Copy original to Drive',
        'Create Sunrise CV Google Doc',
        'Download DOCX + send to recruiter',
      ],
    },
    {
      id: 'n8n-unified-lead-capture-dedup',
      name: 'Unified Lead Capture & Dedup',
      phase: 'N0', codebase: 'n8n', audience: AUDIENCE.SALES, size: SIZE.M,
      summary: 'All inbound leads (WhatsApp, web, FB/IG, referrals) land in one CRM. Auto-dedup, MY/SG routing, SLA timer.',
      value: 'Kills fragmented intake; enforces SLA from first touch.',
      subtasks: [
        'Parse contact + intent',
        'Dedup by phone/email',
        'MY/SG country routing',
        'Auto-tag source',
        'Create CRM record + task',
        'Send WA/email acknowledgement',
      ],
    },
    {
      id: 'n8n-auto-scheduling',
      name: 'Auto Scheduling — Candidate & Client Calls',
      phase: 'N0', codebase: 'n8n', audience: AUDIENCE.OPS, size: SIZE.S,
      summary: 'Prospect self-books via Calendly. Reminders T-24h & T-1h. No-show triggers reschedule prompt.',
      value: 'Eliminates scheduling back-and-forth.',
      subtasks: [
        'Calendly link via WA/email',
        'Timezone confirm MY/SG',
        'Google Calendar event creation',
        'T-24h + T-1h reminders',
        'No-show reschedule branch',
      ],
    },
    {
      id: 'n8n-candidate-onboarding-doc-pack',
      name: 'Candidate Onboarding Doc Pack',
      phase: 'N0', codebase: 'n8n', audience: AUDIENCE.RECR, size: SIZE.M,
      summary: 'Auto-collect IC, CV, certs, e-consent. OCR validation. Stored to Drive with naming rules.',
      value: 'Reduces paperwork chase; audit-ready storage.',
      subtasks: [
        'Send checklist link',
        'Upload + Google Vision OCR',
        'Completeness validator',
        'Auto-request missing docs',
        'Drive storage with naming rules',
        'CRM stage update + notify',
      ],
    },
    {
      id: 'n8n-job-order-intake-qualification',
      name: 'Job Order Intake + Auto-Qualification',
      phase: 'N0', codebase: 'n8n', audience: AUDIENCE.SALES, size: SIZE.M,
      summary: 'Standardise client JD briefs. AI scores urgency/budget/rarity. Routes to consultant.',
      value: 'Only qualified job orders hit the team; better conversion.',
      subtasks: [
        'Jotform JD intake form',
        'Validate salary/location/quota',
        'AI urgency + budget scoring',
        'Consultant owner assignment',
        'Proposal template generation',
        'CRM pipeline update',
      ],
    },
    {
      id: 'n8n-kyc-employer-verification',
      name: 'KYC / Employer Verification',
      phase: 'N0', codebase: 'n8n', audience: AUDIENCE.COMPL, size: SIZE.M,
      summary: 'Collect SSM, director ID, billing. Optional sanctions check. Internal approval + audit log.',
      value: 'Compliance-grade client onboarding.',
      subtasks: [
        'Collect SSM + director ID + billing',
        'Sanctions/PEP screening',
        'Email + phone verification',
        'Ops/Finance approval flow',
        'Verified-status in CRM',
        'Audit log to Drive',
      ],
    },
    {
      id: 'n8n-quote-contract-auto-generation',
      name: 'Quote + Contract Auto-Generation',
      phase: 'N0', codebase: 'n8n', audience: AUDIENCE.FIN, size: SIZE.M,
      summary: 'Pull client + role, pick template, fill fees/replacement window, send for e-sign.',
      value: 'Contract cycle collapses from days to minutes.',
      subtasks: [
        'Pull client + role from CRM',
        'Template selector (perm/contract/retained)',
        'Variable fill: fees + replacement',
        'Dropbox Sign send',
        'CRM stage + team notify',
      ],
    },
    {
      id: 'n8n-client-status-updates',
      name: 'Client Status Updates (Auto-Controlled)',
      phase: 'N0', codebase: 'n8n', audience: AUDIENCE.OPS, size: SIZE.S,
      summary: 'Candidate stage change → Gemini-drafted update → optional approval → WA/email → log.',
      value: 'Clients always in the loop without recruiter typing.',
      subtasks: [
        'Detect CRM stage change',
        'Gemini-drafted update',
        'Optional human approval gate',
        'Send via WA/email',
        'Communication log in CRM',
      ],
    },
    {
      id: 'n8n-candidate-job-matching',
      name: 'Candidate-to-Job Matching + Shortlist Builder',
      phase: 'N1', codebase: 'n8n', audience: AUDIENCE.RECR, size: SIZE.L,
      summary: 'Embed/score candidates vs JD on skills, location, salary, availability. Ranked PDF shortlist to client.',
      value: 'Competitive differentiator; time-to-shortlist collapses.',
      subtasks: [
        'Embedding/scoring function',
        'Top-N ranked list',
        'Recruiter review UI',
        'Shortlist PDF generation',
        'Email shortlist + CRM log',
      ],
    },
    {
      id: 'n8n-interview-coordination',
      name: 'Interview Coordination + Scorecards',
      phase: 'N1', codebase: 'n8n', audience: AUDIENCE.OPS, size: SIZE.M,
      summary: 'Propose slots, confirm, calendar invites, scorecard form to panel, aggregate, advance stage.',
      value: 'End-to-end interview loop with zero admin chasing.',
      subtasks: [
        'Propose available slots',
        'Confirm slot WA/email',
        'Calendar invites',
        'Scorecard form dispatch',
        'Feedback aggregation',
        'Stage move + notify',
      ],
    },
    {
      id: 'n8n-sg-work-pass-checklist',
      name: 'SG Work Pass / Visa Checklist (EP/SP/WP)',
      phase: 'N1', codebase: 'n8n', audience: AUDIENCE.COMPL, size: SIZE.M,
      summary: 'Determine SG pass type. Request docs in order. Validate. Auto-remind. Store + audit log.',
      value: 'SG placements without compliance gaps.',
      subtasks: [
        'Pass type determination (EP/SP/WP)',
        'Sequenced doc requests via WA',
        'Completeness validator',
        'Reminder loop',
        'Drive + CRM audit log',
      ],
    },
    {
      id: 'n8n-revenue-kpi-dashboard',
      name: 'Revenue + Consultant KPI Dashboard',
      phase: 'N2', codebase: 'n8n', audience: AUDIENCE.ANAL, size: SIZE.L,
      summary: 'Daily/weekly CRM extract. Compute placements, time-to-fill, source quality, revenue. SLA alerts.',
      value: 'Leadership visibility; data-driven consultant management.',
      subtasks: [
        'Nightly CRM extract',
        'Dedup + clean pipeline',
        'KPI computations (TTF, revenue)',
        'SLA breach alerts',
        'Weekly report email + WA',
      ],
    },
    {
      id: 'n8n-ai-recruiter-copilot',
      name: 'AI Recruiter Copilot (Internal Chatbot)',
      phase: 'N2', codebase: 'n8n', audience: AUDIENCE.SUPP, size: SIZE.L,
      summary: 'Recruiter asks "where is this candidate?" → Gemini retrieves CRM context, drafts outreach, summarises calls.',
      value: 'Recruiter leverage; faster response times.',
      subtasks: [
        'Candidate context retrieval',
        'Job order context retrieval',
        'Gemini answer generation',
        'Optional approval gate',
        'CRM action logging',
      ],
    },
    {
      id: 'n8n-4u-employer-dashboard-tokens',
      name: '4U Employer Dashboard + Token Payment',
      phase: 'N2', codebase: 'n8n', audience: AUDIENCE.SALES, size: SIZE.L,
      summary: 'React/Vite employer portal. Job posting. Token deduction per shortlist view. Firebase Auth.',
      value: 'Revenue channel: self-serve employer spend.',
      subtasks: [
        'Firebase Auth employer login',
        'Job vacancy posting flow',
        'Token wallet deduction',
        'Candidate preview unlock',
        'Shortlist selection UX',
        'n8n webhook ↔ Firebase sync',
      ],
    },

    // -------- Phase 0: 4U Control Plane (meta) --------
    {
      id: '4u-blueprint-dashboard',
      name: '4U Blueprint Dashboard',
      phase: 'P0', codebase: '4u-platform', audience: AUDIENCE.ADMIN, size: SIZE.M,
      summary: 'The big-picture overview you are looking at right now.',
      value: 'Single view of all 22+ features across Sunrise Recruit.',
      subtasks: [
        'Feature registry locked',
        'Grid layout responsive',
        'Live Firestore sync',
        'Phase + codebase filters',
        'Roll-up progress calculation',
      ],
    },
    {
      id: '4u-admin-toggle-ui',
      name: '4U Admin Toggle UI',
      phase: 'P0', codebase: '4u-platform', audience: AUDIENCE.ADMIN, size: SIZE.S,
      summary: 'Manual progress editor for every feature.',
      value: 'Owner updates progress without touching Firestore console.',
      subtasks: [
        'Feature list view',
        'Per-feature editor (progress, status, notes)',
        'Subtask check-off UI',
        'Save → Firestore via /api/projects',
      ],
    },
  ];

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function getById(id) { return FEATURES.find(f => f.id === id) || null; }
  function byPhase(phaseId) { return FEATURES.filter(f => f.phase === phaseId); }
  function byCodebase(cb) { return FEATURES.filter(f => f.codebase === cb); }
  function getCodebase(id) {
    return Object.values(CODEBASE).find(c => c.id === id) || { id, label: id, color: '#888', note: '' };
  }
  function getPhase(id) { return PHASES[id] || { id, label: id, timeline: '', order: 99 }; }

  global.FEATURE_REGISTRY = { FEATURES, PHASES, CODEBASE, AUDIENCE, SIZE, getById, byPhase, byCodebase, getCodebase, getPhase };
})(typeof window !== 'undefined' ? window : globalThis);

// CommonJS export for Node (used by the seed script)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).FEATURE_REGISTRY;
}
