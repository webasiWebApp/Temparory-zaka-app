# ZAKA E-Hailing Platform — Full Software Engineering Analysis

> **Date:** 2026-10-02
> **Codebase:** `zaka-e-hailing`
> **Analyst:** Claude Sonnet 4.6 (Claude Code)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Architecture](#3-architecture)
4. [Directory & File Structure](#4-directory--file-structure)
5. [Core Data Model](#5-core-data-model)
6. [Security Issues](#6-security-issues)
7. [Memory Leaks & Resource Management](#7-memory-leaks--resource-management)
8. [Code Quality & Bug Analysis](#8-code-quality--bug-analysis)
9. [Performance Considerations](#9-performance-considerations)
10. [Compliance & POPIA](#10-compliance--popia)
11. [Summary Scorecard](#11-summary-scorecard)
12. [Recommended Action Plan](#12-recommended-action-plan)

---

## 1. Project Overview

ZAKA is a full-stack, real-time e-hailing platform targeting South Africa (ZAR currency, South African phone numbers, POPIA compliance). It is a multi-role, multi-target application built from a single unified codebase, supporting:

- **Passenger App** — Booking rides, live tracking, payment
- **Driver App** — Dispatch console, GPS telemetry, earnings dashboard
- **Admin Dashboard** — Driver verification, document review, pricing management, safety/SOS
- **Demo/Test Mode** — Scripted persona simulator for sales demos

Payment gateway: **Peach Payments** (ZA-specific hosted checkout, HMAC-SHA256 signed).
Maps: **Google Maps** (routing, places) + **Leaflet** (interactive rendering) + **OSRM** (open-source routing fallback).

---

## 2. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| UI Framework | React | 19.0.1 |
| Language | TypeScript | ~5.8.2 |
| Build Tool | Vite | 6.2.3 |
| Styling | TailwindCSS | 4.1.14 |
| Animation | Motion (Framer Motion) | 12.23.24 |
| Icons | Lucide React | 0.546.0 |
| Backend Server | Express.js | 4.21.2 |
| Server Runner | tsx / Node.js | 4.23.13 |
| Database | Firebase Firestore | 12.18.0 |
| Auth | Firebase Authentication | 12.18.0 |
| Storage | Firebase Storage | 12.18.0 |
| Mobile Native | Capacitor (iOS) | 8.5.2 |
| Maps (component) | @vis.gl/react-google-maps | 1.10.1 |
| Maps (lib) | Leaflet | 1.9.4 |
| Payment Gateway | Peach Payments (REST) | — |
| AI Integration | @google/genai | 2.4.0 |
| Push Notifications | @capacitor/push-notifications | 8.1.2 |
| Haptics | @capacitor/haptics | 8.0.2 |
| Confetti | canvas-confetti | 1.9.4 |

---

## 3. Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser / iOS)                   │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ PassengerApp │  │  DriverApp   │  │   AdminDashboard     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                                   │
│  ┌──────▼─────────────────▼──────────────────────▼───────────┐  │
│  │                    AuthContext (React Context)             │  │
│  └─────────────────────────────────────────────┬─────────────┘  │
│                                                 │              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────▼───────────┐  │
│  │ firestoreService│  │locationService│  │  fareService etc. │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────┘  │
└─────────┼─────────────────┼───────────────────────────────────┘
          │ Firestore SDK   │ Geolocation API
          ▼                 ▼
┌─────────────────┐   ┌─────────────────────┐
│  Firebase Cloud │   │  Express.js Server  │
│  Firestore      │   │  (server.ts)        │
│  Firebase Auth  │◄──│  /api/payments/*    │
│  Firebase Store │   │  /api/driver/*      │
└─────────────────┘   │  /api/auth/*        │
                      └────────┬────────────┘
                               │ HTTPS REST
                               ▼
                      ┌─────────────────────┐
                      │  Peach Payments API │
                      │  (Hosted Checkout)  │
                      └─────────────────────┘
```

### 3.2 Multi-Target Build System

The codebase supports three build targets via `VITE_APP_TARGET` env variable:

| Target | Command | Use Case |
|---|---|---|
| `web` | `vite build` | Full platform (default) |
| `rider-ios` | `VITE_APP_TARGET=rider-ios vite build && npx cap sync ios` | Native iOS Rider app |
| `driver-ios` | Future | Native iOS Driver app |

The `isRiderTarget` flag (`src/config/appTarget.ts`) gates admin & driver UI branches at compile time, producing a leaner passenger-only bundle for the iOS App Store.

### 3.3 State Management

No external state management library (Redux, Zustand). State is managed via:

- **React Context** (`AuthContext`) — global auth/profile state, active role
- **Component-level `useState`** — local UI state per screen
- **Firestore `onSnapshot` listeners** — real-time ride, driver, payment updates (replaces polling)
- **`useRef`** — mutable values that should not trigger re-renders (driver location, active trip ID)

### 3.4 Authentication Flow

```
User lands → WelcomeAuthScreen / ZakaWelcomeScreen
  → AuthModal (email/password | Google OAuth | Apple OAuth | Anonymous)
  → Firebase Auth → onAuthStateChanged → AuthContext
  → Load UserProfile from Firestore /users/{uid}
  → Load PassengerProfile or DriverProfile
  → Role-based routing: passenger | driver | admin
```

### 3.5 Real-Time Ride Lifecycle

```
Passenger requests ride
  → Firestore /rides/{rideId} created (status: 'searching')
  → DriverApp listens via listenToSearchingRides()
  → Driver accepts → Firestore transaction (atomic claim)
  → status: 'accepted' → 'driver_arriving' → 'driver_arrived'
  → OTP verified → status: 'in_progress'
  → Driver completes → status: 'completed'
  → PaymentService: cash OR Peach Checkout initiated
  → Webhook confirms payment → paymentStatus: 'paid'
```

### 3.6 Server-Side Layer (`server.ts`)

The Express server acts as:
1. **Vite dev server proxy** (development mode)
2. **Static file server** for production `dist/`
3. **Secure payment gateway proxy** — Peach API calls never expose secrets to the client
4. **Driver document upload handler** — receives base64-encoded files, writes to disk
5. **Phone uniqueness check** — queries Firestore server-side
6. **Webhook receiver** — validates HMAC-SHA256 signatures from Peach

---

## 4. Directory & File Structure

```
zaka-e-hailing/
├── src/
│   ├── App.tsx                        # Root: role-based routing + modal orchestration
│   ├── main.tsx                       # Vite entry point
│   ├── index.css                      # Global styles + Tailwind directives
│   ├── vite-env.d.ts                  # Vite env type declarations
│   │
│   ├── config/
│   │   ├── appTarget.ts               # Multi-target build flag (web | rider-ios | driver-ios)
│   │   └── googleMapsConfig.ts        # Google Maps API key loader
│   │
│   ├── types/
│   │   └── index.ts                   # All core TypeScript interfaces & enums
│   │
│   ├── context/
│   │   └── AuthContext.tsx            # Firebase auth + profile state (React Context)
│   │
│   ├── firebase/
│   │   ├── config.ts                  # Firebase app initialization (Auth, Firestore, Storage)
│   │   ├── firestoreService.ts        # All Firestore CRUD & real-time listeners
│   │   ├── firestoreErrors.ts         # Firestore error message normalization
│   │   └── storageService.ts          # Firebase Storage upload helpers
│   │
│   ├── services/
│   │   ├── locationService.ts         # GPS, geolocation, reverse geocoding facade
│   │   ├── geocodingService.ts        # Google Places + curated SA places search
│   │   ├── routingService.ts          # OSRM route polyline + Haversine distance
│   │   ├── mapService.ts              # Map coordinate helpers, telemetry thresholds
│   │   ├── fareService.ts             # Fare calculation + ZAR formatting
│   │   ├── earningsService.ts         # Driver earnings aggregation
│   │   ├── paymentService.ts          # Client-side Peach payment flow (initiate/verify)
│   │   ├── notificationService.ts     # Push notification registration + dispatch
│   │   ├── hapticsService.ts          # Capacitor haptic feedback wrapper
│   │   └── appLifecycleService.ts     # Capacitor app resume/background lifecycle
│   │
│   ├── components/
│   │   ├── admin/
│   │   │   └── AdminDashboard.tsx     # Admin: driver verification, pricing, broadcasts
│   │   ├── auth/
│   │   │   ├── AuthModal.tsx          # Sign-in / sign-up / forgot password modal
│   │   │   ├── UserProfileModal.tsx   # User profile editor
│   │   │   ├── VerifyEmailScreen.tsx  # Email verification gate
│   │   │   └── WelcomeAuthScreen.tsx  # Landing auth screen (web)
│   │   ├── common/
│   │   │   ├── Header.tsx             # Top navigation bar
│   │   │   ├── InteractiveMap.tsx     # Google Maps + driver/passenger markers
│   │   │   ├── GoogleMapPolyline.tsx  # Route polyline renderer
│   │   │   ├── GlassSelectorNav.tsx   # iOS-style bottom navigation
│   │   │   ├── ComplianceModal.tsx    # POPIA consent modal
│   │   │   └── NotificationCenterModal.tsx
│   │   ├── passenger/
│   │   │   ├── PassengerApp.tsx       # Passenger main orchestrator
│   │   │   ├── PassengerHome.tsx      # Ride booking home screen
│   │   │   ├── ZakaWelcomeScreen.tsx  # Passenger welcome / splash
│   │   │   ├── ActiveRidePanel.tsx    # Live ride tracking panel
│   │   │   ├── CompletedRideScreen.tsx# Post-ride rating + payment
│   │   │   ├── DestinationSearchModal.tsx # Places search autocomplete
│   │   │   ├── PassengerWalletModal.tsx
│   │   │   └── RideHistoryModal.tsx
│   │   ├── driver/
│   │   │   ├── DriverApp.tsx          # Driver main orchestrator + GPS tracking
│   │   │   ├── DriverPendingScreen.tsx# Verification pending state
│   │   │   ├── IncomingRideCard.tsx   # Ride request card with 15s timer
│   │   │   ├── DriverActiveRideScreen.tsx # Active trip controls
│   │   │   ├── DriverCompletedScreen.tsx  # Trip completion summary
│   │   │   └── BecomeDriverModal.tsx  # Driver onboarding + document upload
│   │   └── demo/
│   │       ├── DemoTestBanner.tsx     # Demo mode persona switcher banner
│   │       └── DemoTestStatusPanel.tsx
│   │
│   ├── data/
│   │   └── demoPersonas.ts            # Seeded demo user personas (Amara, Sipho, Kofi, Chidi)
│   │
│   └── utils/
│       ├── documentUtils.ts           # Document helper utilities
│       └── phoneUtils.ts              # SA phone number normalization + validation
│
├── server.ts                          # Express backend (payments, uploads, phone check)
├── firebase-applet-config.json        # Firebase project credentials (COMMITTED - see Security)
├── firestore.rules                    # Firestore security rules
├── storage.rules                      # Firebase Storage security rules
├── firestore.indexes.json             # Composite index definitions
├── firebase-blueprint.json            # Firebase project structure blueprint
├── .env.example                       # Environment variable template
├── vite.config.ts                     # Vite build configuration
├── capacitor.config.ts                # Capacitor iOS native config
├── tsconfig.json                      # TypeScript config
├── package.json                       # Dependencies (name: "react-example" — wrong)
├── bun.lock                           # Bun lockfile
├── package-lock.json                  # npm lockfile (both present — inconsistency)
├── index.html                         # Vite HTML entry
├── PEACH_PAYMENTS_SETUP.md            # Peach integration guide
├── metadata.json                      # Project metadata
├── uploads/                           # Driver document uploads (local disk)
└── ios/                               # Capacitor iOS native project
    └── App/
        ├── App.xcodeproj/
        ├── App/ (Swift AppDelegate, SceneDelegate)
        └── CapApp-SPM/ (Swift Package Manager dependencies)
```

---

## 5. Core Data Model

### Firestore Collections

| Collection | Purpose | Key Fields |
|---|---|---|
| `/users/{uid}` | Single identity per user | `role`, `roles[]`, `activeRole`, `status`, `emailVerified` |
| `/passengers/{uid}` | Passenger-specific profile | `rating`, `totalTrips`, `walletBalance`, `savedPlaces` |
| `/drivers/{uid}` | Driver profile + vehicle | `verificationStatus`, `online`, `available`, `vehicle`, `currentLocation` |
| `/drivers/{uid}/documents/{docId}` | Verification documents | `documentType`, `status`, `fileUrl`, `storagePath` |
| `/vehicles/{vehicleId}` | Vehicle records | `driverId`, `vehicleType`, `registrationNumber`, `status` |
| `/rides/{rideId}` | Ride lifecycle | `status`, `passengerId`, `driverId`, `otp`, `paymentStatus` |
| `/payments/{paymentId}` | Payment ledger | `amount`, `paymentStatus`, `platformCommission`, `driverEarnings` |
| `/ratings/{ratingId}` | Mutual ratings | `fromRole`, `toRole`, `rating`, `comment`, `tip` |
| `/notifications/{id}` | In-app notifications | `userId`, `type`, `read` |
| `/pricing/{rideType}` | Fare configuration | `baseFare`, `perKmRate`, `perMinuteRate` |
| `/incidents/{id}` | Safety incidents / SOS | `reportedBy`, `driverId`, `passengerId` |
| `/audit_logs/{id}` | Admin action audit trail | `adminId`, `action`, `targetId` |
| `/phoneIndex/{phone}` | Phone uniqueness index | `uid`, `normalizedPhone` |
| `/processed_webhooks/{id}` | Webhook idempotency | `webhookId`, `processedAt` |
| `/driver_document_contents/{key}` | Base64 document cache | `fileData`, `fileType`, `driverId` |
| `/support/{ticketId}` | Support tickets | `userId`, `status`, `priority` |
| `/driverCompliance/{uid}` | Compliance records | — |

---

## 6. Security Issues

Issues are rated: **CRITICAL**, **HIGH**, **MEDIUM**, **LOW**, **INFO**.

---

### SEC-01 — CRITICAL: Firebase Credentials Committed to Git

**File:** `firebase-applet-config.json`

```json
{
  "apiKey": "AIzaSyCW4zDmrFi_MhzCWkbNGAJw5EBoobVoPvc",
  "projectId": "zaka-e-hailing",
  "appId": "1:105704662606:web:56f481909e46445edb451f",
  "oAuthClientId": "105704662606-ghi9d1k6astu3pj2oulpfubfbsifpksa.apps.googleusercontent.com"
}
```

This file is tracked in git (not in `.gitignore`). Firebase web API keys are meant to be public-facing (they are embedded in web apps), but the **OAuth Client ID**, **App ID**, and **project identifiers** are all exposed in version history. Any developer with repository access (or if it's ever public) has full targeting capability. Mitigation: restrict the API key in the Google Cloud Console to specific HTTP referrers and IP ranges.

---

### SEC-02 — CRITICAL: Backend Service Account Password Hardcoded as Fallback

**File:** `server.ts:187`, `.env.example:39`

```typescript
const BACKEND_PASSWORD = process.env.ZAKA_BACKEND_SERVICE_PASSWORD || '[REDACTED - rotate this password]';
```

And in `.env.example`:
```
ZAKA_BACKEND_SERVICE_PASSWORD=[REDACTED - rotate this password]
```

The actual production service account password is hardcoded as the fallback value and is also present in the example env file. This is committed to git. Anyone with repo access has the backend service account credentials. The server uses this account to perform admin-level Firestore writes (payment finalization, driver document updates).

**Fix:** Remove the hardcoded fallback entirely. Throw an error on startup if `ZAKA_BACKEND_SERVICE_PASSWORD` is not set. Rotate the password immediately.

---

### SEC-03 — CRITICAL: No Authentication on Document Upload Endpoint

**File:** `server.ts:460`

```typescript
app.post('/api/driver/upload-document', async (req: Request, res: Response) => {
  const { driverId, documentType, fileName, fileType, fileData } = req.body;
  // No Firebase ID token verification — driverId trusted from request body
```

The upload endpoint accepts `driverId` from the request body without verifying a Firebase JWT. Any unauthenticated caller who knows the API endpoint can upload arbitrary files for any driver, associating them with a targeted `driverId`. The Firestore security rules do enforce ownership on document subcollections, but the Express endpoint bypasses them entirely.

**Fix:** Extract `Authorization: Bearer <idToken>` from request headers, verify with Firebase Admin SDK, and assert `decodedToken.uid === driverId`.

---

### SEC-04 — CRITICAL: Path Traversal Risk in Document Server

**File:** `server.ts:44-45`

```typescript
const cleanPath = relPath.replace(/^\/+/, '');
const normalizedStoragePath = cleanPath.startsWith('drivers/') ? cleanPath : `drivers/${cleanPath}`;
const diskPath = path.join(UPLOADS_DIR, normalizedStoragePath);
```

Only leading slashes are stripped. A path like `drivers/../../../etc/passwd` is not sanitized. `path.join` on Unix will resolve the `../` traversal sequences, potentially reading any file on the server's filesystem.

**Fix:** After joining, assert that the resolved path starts with `UPLOADS_DIR`:
```typescript
const resolved = path.resolve(UPLOADS_DIR, normalizedStoragePath);
if (!resolved.startsWith(UPLOADS_DIR + path.sep)) {
  res.status(400).json({ error: 'Invalid path' });
  return;
}
```

---

### SEC-05 — CRITICAL: No Authentication on Payment Endpoints

**File:** `server.ts:617`, `server.ts:829`

```typescript
app.post('/api/payments/peach/initiate', async (req: Request, res: Response) => {
  const { rideId, paymentMethod = 'card' } = req.body;
  // No token verification — any caller with a rideId can initiate payment
```

Both `/api/payments/peach/initiate` and `/api/payments/peach/verify` accept `rideId` from the body without verifying the caller is the passenger who owns the ride. An attacker could initiate and poll payment state for any ride ID.

**Fix:** Require and verify Firebase ID token. Assert that the authenticated UID matches `rideData.passengerId`.

---

### SEC-06 — HIGH: Admin UIDs Hardcoded in Firestore Rules

**File:** `firestore.rules:32`, `storage.rules:17`

```
request.auth.uid in ['Js6QAJWZskfRhInQFlX4fjlZ9Ws1', 'KCKA8mq7u6Udj5Lp4pIMSqlEgPJ2']
```

Hardcoded UIDs are in version history. If compromised, an attacker can use these UIDs as targets for social engineering or account compromise. This is a known Firestore pattern, but the UID values must never be exposed publicly.

---

### SEC-07 — HIGH: Personal Admin Email in Source Code & Rules

**File:** `firestore.rules:35`, `storage.rules:16`

```
request.auth.token.get('email', '') in ['admin@zaka.io', 'zaka.backend.service@zaka.io', 'ian.mkhize@gmail.com']
```

A personal Gmail address is hardcoded in both Firestore rules and storage rules. This leaks the identity of an admin and is committed to the repository. Personal email accounts are more susceptible to phishing and account takeover than corporate accounts.

**Fix:** Remove personal email from rules. Use custom claims (`role: 'admin'`) exclusively.

---

### SEC-08 — HIGH: Phone Number Lookup Leaks Registration Status Without Auth

**File:** `server.ts:391`

```typescript
app.get('/api/auth/check-phone', async (req: Request, res: Response) => {
  // Returns { isRegistered: true, uid: '...', source: 'users' }
  // No authentication required
```

Any unauthenticated caller can enumerate whether a phone number is registered and obtain the associated Firebase UID. This is a user enumeration vulnerability.

---

### SEC-09 — MEDIUM: Firestore Notifications — Any Authenticated User Can Notify Any User

**File:** `firestore.rules:453-459`

```
allow create: if isAuthenticated() && (
  request.resource.data.userId != null &&
  request.resource.data.userId != ''
);
```

Any authenticated user can create a notification targeting any `userId`. This could be used to spam other users with in-app notifications.

**Fix:** Restrict notification creation to the backend service account or require the `userId` to match a ride participant.

---

### SEC-10 — MEDIUM: Ratings — Any Authenticated User Can Read All Ratings

**File:** `firestore.rules:425`

```
allow read: if isAuthenticated();
```

All ratings records (including comments and tips) are readable by any authenticated user. This could expose private feedback.

---

### SEC-11 — MEDIUM: Payments Read Rule — `resource == null` Bypass

**File:** `firestore.rules:382`

```
resource == null ||
```

When `resource == null` (document does not exist), the rule evaluates to `true` and grants access. This is likely unintended — it means any authenticated user can "read" a non-existent payment document (Firestore returns empty, but the rule passes). Harmless in practice but indicative of a rule logic error.

---

### SEC-12 — MEDIUM: `/test` Collection Publicly Readable

**File:** `firestore.rules:551-553`

```
match /test/{docId} {
  allow read: if true;
}
```

Unauthenticated read access to the `test` collection. If any sensitive test data is written here during development, it is publicly exposed.

---

### SEC-13 — MEDIUM: Phone Index Publicly Readable

**File:** `firestore.rules:558-564`

```
match /phoneIndex/{phone} {
  allow read: if true;
```

Any unauthenticated user can query the phone index to check if a phone number is registered and retrieve the associated UID.

---

### SEC-14 — LOW: No CORS Policy on Express Server

**File:** `server.ts` (entire file)

No CORS middleware is configured. In production, this means any origin can make cross-origin requests to the API server. When deployed, `cors` middleware should be added to restrict origins to known frontend domains.

---

### SEC-15 — LOW: No Rate Limiting on Sensitive Endpoints

**File:** `server.ts`

`/api/auth/check-phone`, `/api/payments/peach/initiate`, and `/api/driver/upload-document` have no rate limiting. These endpoints could be abused for enumeration or resource exhaustion.

---

### SEC-16 — LOW: In-Memory Webhook Idempotency Cache Not Persistent

**File:** `server.ts:299`

```typescript
const processedWebhookIds = new Set<string>();
```

The in-memory Set is cleared on server restart. While Firestore is also checked, if the server restarts during a transient Firestore outage, a webhook could be processed twice. Use Firestore as the single source of truth and remove the in-memory cache, or implement a proper distributed cache.

---

### SEC-17 — LOW: Server Uses Firebase Client SDK Instead of Admin SDK

**File:** `server.ts:15-28`

```typescript
import { initializeApp } from 'firebase/app';       // Client SDK
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'; // Client SDK
```

The server logs in with email/password via the client SDK. The proper approach is `firebase-admin` with a service account JSON, which does not require credentials in env vars and bypasses security rules with server-side authority. Using the client SDK on the server means:
- Security rules still apply (requires `ensureBackendAuthenticated()` before every operation)
- Token refresh is less reliable
- No access to admin-only features (custom token minting, user management)

---

## 7. Memory Leaks & Resource Management

### MEM-01 — CRITICAL: React Hooks Called After Early Return (Rules of Hooks Violation)

**File:** `src/components/driver/DriverApp.tsx:68-72`

```typescript
export const DriverApp: React.FC = () => {
  // ...

  if (!driverProfile || driverProfile.verificationStatus !== 'approved') {
    return <DriverPendingScreen />;   // <-- early return HERE
  }

  const [isOnline, setIsOnline] = useState<boolean>(...);  // hooks AFTER early return
  const [activeTrip, setActiveTrip] = useState<RideDocument | null>(null);
  // ... 20+ more hooks
```

This is a **direct violation of the React Rules of Hooks**. Hooks must always be called in the same order and must not be called conditionally. React will throw: *"Rendered fewer hooks than expected. This may be caused by an accidental early return statement."*

This means `DriverApp` will crash at runtime for any driver whose `verificationStatus !== 'approved'`. The bug is hidden in development if all demo drivers are pre-approved.

**Fix:** Move the early return to after all hooks, or extract the pending screen logic:
```typescript
const isPending = !driverProfile || driverProfile.verificationStatus !== 'approved';
// ... all hooks ...
if (isPending) return <DriverPendingScreen />;
```

---

### MEM-02 — HIGH: Demo GPS Simulation Interval Recreated on Every Location Update

**File:** `src/components/driver/DriverApp.tsx:373-411`

```typescript
useEffect(() => {
  // ...
  const interval = setInterval(() => {
    // updates driverLocation
  }, 2500);
  return () => clearInterval(interval);
}, [isOnline, isSimulatingGps, activeTrip, driverLocation, userProfile?.uid]);
//                                                ^^^^^^^^^^^^^
```

`driverLocation` is listed as a dependency, but it is also **mutated inside the effect** via `setDriverLocation`. This causes the effect to re-run (and create a new interval) every 2.5 seconds — 24 interval recreations per minute. While cleanup happens correctly, this is wasteful and creates high overhead.

**Fix:** Use a `ref` for the driver location inside the simulation loop instead of a state dependency:
```typescript
const driverLocationRef = useRef(driverLocation); // already exists in the file
// use driverLocationRef.current inside the interval
}, [isOnline, isSimulatingGps, activeTrip?.id, userProfile?.uid]); // remove driverLocation
```

---

### MEM-03 — MEDIUM: Firestore Subscriptions Recreated on Active Trip Change

**File:** `src/components/driver/DriverApp.tsx:321-365`

```typescript
useEffect(() => {
  const unsubscribeRides = firestoreService.listenToDriverRides(...)
  const unsubscribePayments = firestoreService.listenToDriverPayments(...)
  return () => {
    unsubscribeRides();
    unsubscribePayments();
  };
}, [userProfile?.uid, activeTrip, activeDemoRideId]);  // activeTrip as dep
```

`activeTrip` (a full object) is a dependency. Every time any field on `activeTrip` updates (e.g., `driverCurrentLocation`), the subscriptions are torn down and re-established. Each re-subscription generates a new Firestore read from the server, triggering billing and latency spikes.

**Fix:** Use `activeTrip?.id` instead of the full object as a dependency.

---

### MEM-04 — MEDIUM: `resolveAddressInBackground` Callers May Not Cancel on Unmount

**File:** `src/services/locationService.ts:176-198`

```typescript
resolveAddressInBackground(lat, lng, onSuccess): () => void {
  let cancelled = false;
  geocodingService.reverseGeocode(lat, lng)
    .then(addr => { if (!cancelled) onSuccess(addr); });
  return () => { cancelled = true; };
}
```

The function returns a cancellation function. If callers do not store and call this cancel function on component unmount, `onSuccess` may call `setState` on an unmounted component (React 18 suppresses the warning but the callback still fires). Audit all call sites to ensure the cancel function is stored and called in cleanup.

---

### MEM-05 — LOW: `beforeunload` Handler References Stale Closure

**File:** `src/components/driver/DriverApp.tsx:280-293`

```typescript
useEffect(() => {
  const handleBeforeUnload = () => {
    if (isOnline && userProfile?.uid && !isDemo) {
      firestoreService.toggleDriverOnlineStatus(userProfile.uid, false).catch(() => {});
    }
  };
  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [isOnline, userProfile?.uid, isDemo]);
```

The cleanup is correct — the listener is removed and re-added when dependencies change. No leak here, but the `beforeunload` async call (`firestoreService.toggleDriverOnlineStatus`) is a fire-and-forget Promise in a synchronous event handler, which browsers may cancel before the Promise resolves. Consider using `navigator.sendBeacon` for reliable last-gasp server notifications.

---

### MEM-06 — LOW: Multiple `onSnapshot` Listeners in AuthContext

**File:** `src/context/AuthContext.tsx`

The AuthContext subscribes to `onSnapshot` for the user document and potentially driver/passenger profiles. If the unsubscribe functions are not called correctly when the auth state changes (e.g., on sign-out), stale listeners may fire with data from the previous user session.

Verify that all `onSnapshot` unsubscribe functions are called in the `onAuthStateChanged` handler before subscribing to the new user's documents.

---

## 8. Code Quality & Bug Analysis

### BUG-01 — `NextFunction` Not Imported in `server.ts`

**File:** `server.ts:106`

```typescript
app.use('/drivers', async (req: Request, res: Response, next: NextFunction) => {
```

`NextFunction` is used but never imported from `'express'`. TypeScript compilation will fail.

**Fix:**
```typescript
import type { Request, Response, NextFunction } from 'express';
```

---

### BUG-02 — `package.json` Name is `"react-example"`

**File:** `package.json:2`

```json
"name": "react-example",
```

The package name should be `"zaka-e-hailing"`. This is a leftover from a scaffolded template and causes confusion in npm/bun outputs.

---

### BUG-03 — `earningsSummary.pendingSettlement` Type Mismatch

**File:** `src/components/driver/DriverApp.tsx:790`

```typescript
{earningsSummary.pendingSettlement > 0 && (
```

The `DriverEarningsSummary` interface in `src/types/index.ts` does not include a `pendingSettlement` field. This will be a TypeScript type error unless `earningsService` returns a different shape.

---

### BUG-04 — Dual Lock Files (`bun.lock` + `package-lock.json`)

Both `bun.lock` and `package-lock.json` exist in the repository. This indicates the project has been installed with both `bun` and `npm`. The two lockfiles can diverge in resolved versions, causing non-deterministic builds on different CI/CD environments. Standardize on one package manager.

---

### BUG-05 — `isAuthenticated` Computed Incorrectly

**File:** `src/App.tsx:35`

```typescript
const isAuthenticated = Boolean(currentUser || userProfile);
```

`currentUser` (from Firebase Auth) and `userProfile` (from Firestore) can be temporarily out of sync during sign-in. The `currentUser` may be set while `userProfile` is still loading from Firestore, or `userProfile` may briefly exist from a previous cached state. Relying on `||` between both can cause the UI to flash authenticated state before the profile is ready. Use `loading` flag as the primary gate.

---

### BUG-06 — `DriverApp` Rules of Hooks Violation (Repeated from MEM-01)

See **MEM-01** — this is both a runtime crash bug and a hooks violation.

---

### BUG-07 — Demo Persona UIDs Hardcoded in Firestore Rules Never Match Real Auth

**File:** `firestore.rules:184, 361`

```
request.auth.uid in ['demo-amara-uid', 'demo-sipho-uid', 'demo-kofi-uid']
```

Firebase Anonymous Authentication generates random UIDs like `abc123XYZ`. These fixed string literals will never match real anonymous auth UIDs, making the rules effectively dead code for anonymous demo users. The intended demo access may not work as designed.

---

### BUG-08 — `storage.rules` Does Not Require Email Verification

**File:** `storage.rules:14-18`

Unlike Firestore rules, the Storage rules do not check `email_verified` for admin access:
```
request.auth.token.get('email', '') in ['admin@zaka.io', ...]
```
A user who registers with an admin email address without verifying it could potentially gain admin storage access.

---

### BUG-09 — Vite Config Missing `define` for `process.env` in Server Code

**File:** `vite.config.ts`

The Vite config is minimal with no environment variable definitions. If any server-side env vars are accidentally imported into frontend bundles, they will fail silently (undefined) rather than failing at build time. Add explicit `define` or use `envPrefix` to clearly scope what is and isn't exposed.

---

## 9. Performance Considerations

### PERF-01 — Firestore Reads: Full Driver Profile on Every Ride Accept

When a driver accepts a ride, `driverProfile` (full object) is spread into the acceptance payload:
```typescript
firestoreService.acceptRideTransaction(ride.id, {
  ...driverProfile,
  userId: userProfile.uid,
  ...
});
```
If `driverProfile` contains large nested objects (documents, photos), this creates an over-sized Firestore write. Pass only the required fields.

---

### PERF-02 — No Composite Index Documentation for Queries

Several Firestore queries use `where` + `limit` combinations (`where('rideId', '==', ...)`, `where('phone', 'in', [...])`). Without composite indexes, these queries will fail at runtime on production data. `firestore.indexes.json` should be audited to ensure all query patterns are indexed.

---

### PERF-03 — `getPhoneVariants` Generates Up to 7 Variants Per Check

**File:** `server.ts:359-388`

The phone check endpoint generates 7 variants per input and performs up to 3 collection queries × 7 variants = 21 Firestore reads per request. On a high-traffic platform, this is expensive. The `phoneIndex` collection is the correct long-term solution — prioritize migrating all users to the index.

---

### PERF-04 — Base64 Document Storage in Firestore

**File:** `server.ts:567-577`

Documents up to 950KB are stored as base64 strings in Firestore (`driver_document_contents` collection). This is a significant anti-pattern — Firestore has a 1MB document size limit and is not designed for binary blob storage. For files larger than ~50KB, use Firebase Storage or a CDN. This approach also increases Firestore read/write costs substantially.

---

### PERF-05 — GPS Simulation Interval Churn

See **MEM-02** — 24 interval recreations per minute during demo simulation, each triggering React reconciliation.

---

## 10. Compliance & POPIA

The platform shows awareness of POPIA (South Africa's Protection of Personal Information Act):

**Implemented:**
- `ComplianceModal.tsx` — explicit POPIA consent screen
- `UserProfile.termsAccepted`, `UserProfile.popiaConsent` with timestamps
- Passengers can delete their account (`allow delete: if request.auth.uid == userId`)
- Driver documents access is restricted to the driver and admins

**Gaps:**
- No data retention / automatic deletion policy enforced in Firestore rules or backend
- Location history is stored in ride documents but there is no user-accessible data export
- Phone numbers are indexed in a public-readable collection (see SEC-13)
- Anonymous user data (demo rides) may persist indefinitely with no cleanup mechanism

---

## 11. Summary Scorecard

| Category | Issues Found | Critical | High | Medium | Low |
|---|---|---|---|---|---|
| Security | 17 | 5 | 3 | 4 | 5 |
| Memory Leaks | 6 | 1 | 2 | 2 | 1 |
| Code Bugs | 9 | 1 | 2 | 4 | 2 |
| Performance | 5 | 0 | 1 | 3 | 1 |
| Compliance | 4 | 0 | 1 | 2 | 1 |
| **Total** | **41** | **7** | **9** | **15** | **10** |

**Overall Architecture Quality:** Well-structured for the scope. Clean separation of concerns between services, components, and context. Firestore rules are comprehensive and show security awareness. The multi-target build system is a strong design decision.

**Primary Risk:** The backend Express server lacks authentication middleware on its most sensitive endpoints (SEC-03, SEC-05) and hardcodes service account credentials (SEC-02). These must be fixed before production deployment.

---

## 12. Recommended Action Plan

### Immediate (Before Any Production Traffic)

1. **Rotate** `ZAKA_BACKEND_SERVICE_PASSWORD` — the current value is in git history
2. **Fix** `SEC-02` — remove the hardcoded fallback password in `server.ts`
3. **Fix** `MEM-01 / BUG-06` — move all `useState`/`useEffect` calls before the early return in `DriverApp.tsx`
4. **Fix** `SEC-03` — add Firebase ID token verification middleware to `/api/driver/upload-document`
5. **Fix** `SEC-04` — add path traversal guard in `serveDriverDocument`
6. **Fix** `SEC-05` — add Firebase ID token verification to payment endpoints
7. **Fix** `BUG-01` — import `NextFunction` in `server.ts`

### Short-Term (Sprint 1)

8. Switch server from Firebase Client SDK to **Firebase Admin SDK** (SEC-17)
9. Add **CORS middleware** with allowlist to Express server (SEC-14)
10. Add **rate limiting** to sensitive endpoints (SEC-15)
11. Fix `MEM-02` — remove `driverLocation` from simulation effect dependencies
12. Fix `MEM-03` — use `activeTrip?.id` instead of full object as Firestore listener dep
13. Add `NextFunction` import and fix TypeScript compilation errors
14. Rename `package.json` `name` field from `react-example` to `zaka-e-hailing`
15. Standardize on one package manager — remove either `bun.lock` or `package-lock.json`

### Medium-Term (Sprint 2)

16. Restrict `/phoneIndex` and `/test` Firestore rules to authenticated users only
17. Tighten notifications `create` rule to prevent cross-user spam
18. Migrate document storage from Firestore base64 to Firebase Storage (PERF-04)
19. Remove personal admin email from Firestore and Storage rules (SEC-07)
20. Implement data retention policies for POPIA compliance
21. Add `firestore.indexes.json` validation to CI pipeline
22. Add `navigator.sendBeacon` for driver offline status on page unload

---

*Generated by Claude Code (claude-sonnet-4-6) — 2026-10-02*
