# ZAKA E-Hailing — Development Plan

> Web-first launch • Shared Firebase backend • Rider + Driver + Admin
> Source: *ZAKA App Structure and Handover Document*

---

## 1. Goal

Ship a production-ready **web app** (Rider, Driver, Admin) on **one codebase and one Firebase backend**. iOS (Capacitor) is a future target and **not a launch blocker**.

**Production is "done" when:** *(acceptance criteria - tick each one during the live end-to-end pass, roadmap item 28)*

- [ ] Rider can register, verify email, log in, get GPS, request and track a ride
- [ ] Approved Driver can go online, receive/accept rides and complete trips
- [ ] Rider + Driver remain **one identity** (one UID) when dual-role
- [ ] Safety PIN is enforced server-side, not just shown in UI
- [ ] Payments are trusted (server/webhook-confirmed) and auditable
- [ ] Admin can securely operate the platform
- [ ] No demo auth, anonymous production login, or fake production data
- [ ] Firestore/Storage rules protect users, rides, payments and documents
- [ ] Critical flows work without console-only intervention
- [ ] Production build passes lint, build and end-to-end tests

---

## 2. Architecture & Stack

```
ZAKA (one codebase)
├── Web App: Rider | Driver | Admin/Operations
├── Future: Rider iOS, Driver iOS (Capacitor)
└── Shared Firebase Backend: Auth | Firestore | Storage | Security Rules
```

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite 6 + TypeScript, Tailwind CSS 4 |
| Backend | Firebase Auth, Cloud Firestore, Firebase Storage, Express server (`server.ts`) |
| Maps | Google Maps (`@vis.gl/react-google-maps`, Places) with Leaflet / OSRM fallback |
| Payments | Cash, ZAKA Wallet, Peach Payments Hosted Checkout (secrets backend-only) |
| Native (future) | Capacitor 8 for iOS |

---

## 3. Ground Rules (Developer Handover)

1. Make **small, isolated changes**
2. **Preserve** the existing Firebase architecture — no second backend
3. No unrelated UI changes while fixing a bug
4. Run **lint + build** after every meaningful change
5. Never weaken security rules to fix a UI problem
6. Each change report includes: **root cause, files changed, tests, build status, remaining blockers**

---

## 4. Core Design Decisions

### Identity & Roles
- One person = one Firebase Auth UID; Rider → Driver reuses the same UID
- `/users/{uid}` is the primary identity source: `roles[]`, `activeRole`, `phone`
- Admin is **never self-selectable** and never granted by a client-controlled flag
- Email/password + Google sign-in; email verification required for protected operations
- Phone numbers stored in one canonical format (e.g. `+27821234567`)

### Ride Lifecycle
`searching → accepted → driver_arriving → driver_arrived → in_progress → completed`

- Acceptance must be **atomic/transactional**
- Only the assigned driver can progress the driver side
- Riders see only their own rides
- Cancellation handled explicitly

### Safety PIN
- Cryptographic 4-digit PIN per ride, required before trip start
- Never exposed to unrelated users; verification **enforced**, not UI-only

### GPS & Maps
- Real browser geolocation, high accuracy preferred
- Reject stale/inaccurate telemetry and large jumps
- Rider radar shows only approved, online drivers with recent telemetry
- **No fake production GPS fallback** — on failure, show retry / manual pickup

### Fare & Payments
- Fare is server-trusted; never rely on client-only fare for settlement
- Pricing in `pricingConfigs`; changes are auditable
- Split: **85% driver / 15% platform**
- Settlement determined by trusted server/webhook confirmation
- Admin ledger tracks GMV, fees, driver payouts

---

## 5. Firestore Collections

| Collection | Purpose | Written by |
|---|---|---|
| `/users/{uid}` | Identity, roles, activeRole, contact/profile | Owner (never `admin` role) |
| `/users/{uid}/recentDestinations/{id}` | Destination history | Owner |
| `/passengers/{uid}` | Passenger profile; `walletBalance` is backend-only | Owner / backend |
| `/drivers/{uid}` (+ `/documents`) | Driver profile, verification, operations | Owner (approval fields: Admin) |
| `/driverCompliance/{uid}` (+ `/documents`) | Compliance record per driver | Owner (pending) / Admin |
| `/driver_document_contents/{key}` | Document content cache for server-stored uploads | Backend |
| `/vehicles/{uid}` | Driver vehicle | Owner (approval: Admin) |
| `/rides/{rideId}` | Ride lifecycle | Passenger / assigned driver, transitions enforced by rules |
| `/rides/{rideId}/private/pin` | Safety PIN (passenger-readable only) | Passenger at request time |
| `/payments/{rideId}` | Payment ledger: amount, 15% commission, 85% driver earnings | Backend (`/api/rides/settle`); cash confirmation by driver |
| `/wallet_transactions/{id}` | Wallet ledger (top-ups, ride payments) | Backend only |
| `/ratings/{ratingId}` | Ratings (readable by the two participants and Admin only) | Participants |
| `/notifications/{id}` | In-app notifications | Participants / backend |
| `/pricing/{rideType}` | Tariffs | Admin |
| `/incidents/{id}` | Safety incidents / SOS | Reporter; resolution by Admin |
| `/support/{ticketId}` (+ `/messages`) | Support tickets | Owner; status by Admin |
| `/audit_logs/{id}` | Admin and system audit trail | Admin / backend |
| `/phoneIndex/{normalizedPhone}` | One account per phone number | Owner of the number |
| `/processed_webhooks/{id}` | Webhook idempotency | Backend only |
| `/system/{doc}` | Backend state (retention cursor, last run) | Backend only |

---

## 6. Feature Scope

### Rider
Register/login → map & GPS → pickup/destination (search + recents) → fare estimate → vehicle selection → request → matching → live tracking → Safety PIN → cancel → pay → tip/rate → history → profile/settings

### Driver
Register → driver/vehicle profile → document upload → verification status → online/offline → real GPS telemetry → incoming requests → accept/reject → en route → arrived → PIN verify → trip in progress → complete → earnings → wallet → history

**Gate:** approved driver + registered vehicle required before going online.

### Driver Verification Documents
Driver's Licence • PrDP • RC1/vehicle registration • Roadworthy/COF • Profile photo → Admin review → Approve/Reject

### Admin / Operations (desktop-first, not a separate customer app)
View passengers/drivers • approve/reject drivers • review documents • view rides/statuses • payment ledger • KPIs • controlled pricing config • audit sensitive actions • admin entry points hidden from ordinary users

### Notifications
- Firebase real-time listeners while the app is open (in-app bell)
- Browser system notifications while ZAKA is open in a background tab (permission asked on first interaction)
- Native iOS: APNs device-token registration is in place
- Key events: request, acceptance, arrival, trip start, completion, payment
- **Not yet available:** push delivery when the browser/app is fully closed. This needs Firebase Cloud Messaging with a
  service-account credential on the server (and a web-push VAPID key); it cannot be completed without those credentials.

#### Decision record - WhatsApp ride updates (TODO 35)
**Status: decided for launch - WhatsApp is NOT used for ride updates.** Ride updates are delivered in-app and by
browser/native notification only.

Reasons: (1) automated messages require the WhatsApp Business Platform (Cloud API) with Meta business verification
and pre-approved message templates - the WhatsApp Business *app* may not be used for automation; (2) POPIA requires a
separate, explicit opt-in before a phone number is used on a third-party messaging channel, and the sign-up consent
does not ask for it; (3) per-conversation cost has not been budgeted.

To reverse this decision the product owner must: obtain Meta business verification, approve templates, add a WhatsApp
opt-in to the consent screen, and budget conversation fees. Until all four exist the feature stays out of scope.
*(Recorded as the engineering default; the product owner can overrule it.)*

---

## 7. Roadmap (Development Sequence)

Legend: `[x]` built and passing lint + production build · `[~]` built, but cannot be finished or proven without an
external credential or device (stated next to the item) · `[ ]` not done.

> Nothing below has been exercised against the live Firebase project or a real Peach account from this workspace
> (no `.env` credentials are present). Item 28 is the live end-to-end pass that still has to be run.

### Phase 1 - Identity Foundation
- [x] 1. Driver becomes Rider - a failed profile read is no longer treated as "new Rider" (that overwrote the Driver role); role is read, never re-assigned, on every sign-in path; last confirmed role is used when offline
- [x] 2. Wrong phone number - one canonical format (+27...) on every write; no placeholder numbers; uniqueness enforced by rules; phone required before requesting a ride
- [x] 3. Email verification - verification comes from Firebase Auth only; ride requests require a verified account in the security rules
- [x] 4. Email/password login - Firebase Auth + profile load with safe fallback

### Phase 2 - Core Ride Experience
- [x] 5. GPS & Maps - real geolocation, stale/jump rejection, heartbeat keeps parked drivers visible *(needs `VITE_GOOGLE_MAPS_API_KEY`)*
- [x] 6. Fare calculation - same Admin tariff for quote and stored fare; fare locked by rules after request; server validates it before any payment
- [x] 7. Ride PIN - cryptographic 4-digit PIN in a passenger-only document; the security rules reject a trip start without the matching PIN
- [x] 8. Ride status flow - legal transitions per role enforced by the security rules

### Phase 3 - Driver Onboarding & Operations
- [x] 9. Driver registration - always creates a Driver; Admin can never be self-assigned
- [x] 10. Document upload - authenticated, type- and content-checked; no public download links stored
- [x] 11. Admin document preview - every document request is authorised (owner or Admin); nothing is served statically
- [x] 12. Driver completion - completing a trip no longer writes rule-protected earnings fields (it was being rejected)
- [x] 13. Driver earnings - 85% / 15% split written by the backend ledger; dashboard derives from the ledger
- [x] 14. Wallet - real balance (backend-only), ledger, wallet ride payment; top-up via Peach *(top-up needs Peach credentials)*

### Phase 4 - Payments
- [x] 15. Cash payment - server-written ledger entry, driver confirmation, full split recorded
- [~] 16. Card / Peach Payments - checkout, verification and webhook implemented; **needs Peach merchant credentials** to run

### Phase 5 - Security Hardening
- [x] 17. Firebase security rules - rides, PIN, payments, wallet, phone index, backend-only collections
- [x] 18. Admin security - allow-listed UID or verified allow-listed email only; a Firestore role field alone grants nothing
- [x] 19. Payment security / webhooks - unsigned webhooks rejected; amount and transaction must match; a paid state can only come from the backend (or the driver for cash)

### Phase 6 - Notifications & Navigation Polish
- [~] 20. Push notifications - in-app + background-tab browser alerts + iOS token registration done; **closed-app push needs FCM server credentials**
- [x] 21. Wallet navigation - wallet modal crash (hook order) fixed; tab state stays in sync
- [x] 22. Profile -> Home - closing Profile returns the navigation to Home

### Phase 7 - Future iOS Prep *(non-blocking)*
- [~] 23. iPhone registration / networking - API base URL (`VITE_API_BASE_URL`), request timeouts, CORS for the native origin; **needs a device build to confirm**
- [~] 24. iOS authentication - native Google / Apple sign-in path added; **needs `GoogleService-Info.plist`, URL scheme, Apple capability and `npx cap sync ios` on a Mac**

### Phase 8 - Stabilisation & Release
- [x] 25. Crash fixes - hooks-order crashes (DriverApp, Wallet modal), undefined-field ride request failure
- [x] 26. Production cleanup - demo mode off by default; no demo credentials, fake people, free wallet credit or placeholder PINs in production paths
- [~] 27. Credential audit - secrets removed from source and from git tracking; **the exposed passwords still have to be rotated in Firebase** (they remain in git history)
- [ ] 28. Full Rider -> Driver -> Admin end-to-end test on the live project

---

## 8. Security Checklist

- [x] Passengers access only their own protected data
- [x] Assigned drivers access only the ride data they need; the Safety PIN is never readable by a driver
- [x] Driver verification status is admin-controlled only
- [x] Private documents are served only to their owner or an Admin (server and Storage rules)
- [x] Payment data strictly protected; Peach secrets backend-only; `paid` cannot be set from a client (except driver-confirmed cash)
- [x] Wallet balance cannot be changed from a client
- [x] No client-controlled admin flag
- [x] Sensitive admin and system actions audited (`audit_logs`)
- [x] Ratings (comments, tips) readable only by the two participants and Admin

Known limits, accepted for launch and tracked here:
- Aggregate rating fields on driver/passenger profiles are still updated from the client (bounded to rating fields only).
- Ride/payment/system notifications can be created by any signed-in user for another user (needed for ride events).
- The server uses the Firebase client SDK with a service user; moving to the Admin SDK needs a service-account key.

## 8b. System Components Outside the Original Plan

| Component | Status | Description |
|---|---|---|
| Incidents / SOS | Implemented | `/incidents/{id}` - driver/passenger emergency alerts with GPS, shown in the Admin dashboard |
| Audit Logs | Implemented | `/audit_logs/{id}` - Admin actions, SOS, data erasure and retention runs |
| Support Tickets | Implemented | `/support/{ticketId}` with `messages` subcollection; status/priority Admin-only |
| Driver Compliance | Implemented | `/driverCompliance/{uid}` with `documents` subcollection |
| Processed Webhooks | Implemented | `/processed_webhooks/{id}` - idempotency for Peach webhooks (backend-only) |
| Wallet Ledger | Implemented | `/wallet_transactions/{id}` - top-ups and ride payments (backend-only writes) |
| Driver Presence | Implemented | Offline beacon on tab close + 30s heartbeat; server takes silent drivers offline |
| POPIA - consent | Implemented | Consent modal, `termsAccepted` / `popiaConsent` with timestamps |
| POPIA - access | Implemented | `GET /api/user/data-export` - profile, rides, **location history**, payments, wallet, ratings, notifications |
| POPIA - erasure | Implemented | `POST /api/user/delete-data` + account deletion; financial records kept in redacted form |
| POPIA - retention | Implemented | Daily server job (see below); manual trigger `POST /api/admin/popia-cleanup` |

### Data retention policy (enforced automatically, configurable in `.env`)

| Data | Kept for | Then |
|---|---|---|
| Notifications | 90 days | Deleted |
| Last known passenger location | 30 days | Removed |
| Finished rides | 365 days | Addresses, exact coordinates, phone numbers, SOS data removed; fare/payment figures kept |
| Guest / demo sessions and their rides | 30 days | Deleted |
| Sign-ups never verified and never used | 30 days | Deleted |
| Payment and wallet ledger | Not deleted | Statutory financial record (redacted of personal identifiers on account deletion) |

## 9. Demo Mode Cleanup Checklist

- [x] No one-click demo accounts in production (`VITE_ENABLE_DEMO_MODE` defaults to `false`; every demo entry point refuses to run)
- [x] No demo credentials in source or in the production bundle (`VITE_DEMO_ACCOUNT_PASSWORD` is build-time only)
- [x] No automatic anonymous production login
- [x] No fake production data (no seeded people, free wallet credit, default saved places or placeholder PINs)
- [x] Demo data is isolated (`isDemo` flag) and removed automatically by the retention job

---

## 10. UI / Design System

- **Style:** premium African mobility aesthetic, Poppins
- **Colours:** ZAKA orange `#FF7A00` (accent), darks `#111111` / `#181818`, white `#FFFFFF`, warm `#F7F7F5`, secondary text `#6B6B6B`
- **Rider:** map-first hero + floating destination panel
- **Driver:** operational dashboard
- **Admin:** desktop operations dashboard
- Refined cards, restrained glass effects; avoid heavy gradients and oversized bubble UI

---

## 11. Launch / Compliance (separate workstream)

Technical completion ≠ legal readiness. Handle separately:

- [ ] South African e-hailing licensing
- [ ] Platform registration
- [ ] Driver/vehicle compliance
- [ ] Data-protection compliance
- [ ] Payment-provider requirements

---

## 12. Per-Task Report Template

```
Root cause:
Files changed:
Tests run:
Lint/build status:
Remaining blockers:
```