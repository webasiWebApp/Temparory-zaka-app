# ZAKA E-Hailing — Differences: PLAN.md vs ANALYSIS.md vs Actual System

> Generated: 2026-10-02

---

## 1. Technology Stack Discrepancies

| Item | PLAN.md | ANALYSIS.md / Actual System |
|---|---|---|
| React Version | React 18 | React **19.0.1** |
| TailwindCSS Version | "Tailwind CSS" (unversioned) | TailwindCSS **4.1.14** |
| Maps Stack | Leaflet + OpenStreetMap + Nominatim + OSRM | Leaflet + OSRM **+ Google Maps** (`@vis.gl/react-google-maps 1.10.1`) + Google Places API |
| AI Integration | Not mentioned | `@google/genai 2.4.0` is a dependency |
| Animation Library | Not mentioned | Motion (Framer Motion) 12.23.24 |
| Confetti | Not mentioned | `canvas-confetti 1.9.4` |
| Push Notifications | "Firebase real-time + Web Push" | Capacitor Push Notifications (iOS APNs), **no Web Push implementation** |

---

## 2. Firestore Collection Differences

| Collection | PLAN.md | ANALYSIS.md / Actual System |
|---|---|---|
| Pricing | `/pricingConfigs/{configId}` | `/pricing/{rideType}` (different name) |
| Vehicles | `/vehicles/{uid}` (keyed by user UID) | `/vehicles/{vehicleId}` (keyed by vehicle ID) |
| Recent Destinations | `/recentDestinations/{id}` (listed) | **Not implemented** — uses `savedPlaces[]` array inside `PassengerProfile` instead |
| Incidents/SOS | Not mentioned | `/incidents/{id}` exists in system |
| Audit Logs | Not mentioned as collection | `/audit_logs/{id}` exists in system |
| Processed Webhooks | Not mentioned | `/processed_webhooks/{id}` exists for idempotency |
| Driver Document Contents | Not mentioned | `/driver_document_contents/{key}` stores base64 blobs |
| Support Tickets | Not mentioned | `/support/{ticketId}` exists in system |
| Driver Compliance | Not mentioned | `/driverCompliance/{uid}` exists in system |
| Test Collection | Not mentioned | `/test/{docId}` exists with **public read** access |

---

## 3. Safety PIN / OTP - todo

| Aspect | PLAN.md | Actual System |
|---|---|---|
| Description | "Cryptographic 4-digit PIN per ride" | Simple 4-digit string in `RideDocument.otp` field |
| Enforcement | "Verification **enforced**, not UI-only" | Verification appears **UI-only** — no server-side enforcement preventing ride start without OTP match |
| Exposure | "Never exposed to unrelated users" | OTP is a field on the ride document; Firestore rules allow both passenger and driver to read the full ride |

---

## 4. GPS & Demo Mode

| Aspect | PLAN.md | Actual System |
|---|---|---|
| Fake GPS | "No fake production GPS fallback — on failure, show retry / manual pickup" | Demo GPS simulation **exists** with `setInterval` simulating driver movement (MEM-02 in ANALYSIS.md) |
| Demo Auth | "No one-click demo accounts in production" | 4 hardcoded demo personas with real Firebase credentials in `demoPersonas.ts` |
| Anonymous Login | "No automatic anonymous production login" | Anonymous auth **is supported** in `AuthContext.tsx` |
| Demo Data | "No silent fake sessions or fake production data" | Demo rides created with `isDemo: true` flag, but share the **same Firestore collections** as production data |

---

## 5. Fare & Payment Trust Model

| Aspect | PLAN.md | Actual System |
|---|---|---|
| Fare Trust | "Fare is server-trusted; never rely on client-only fare for settlement" | Fare is calculated **both** client-side (`fareService.ts`) and server-side (`server.ts`). Server recalculates at payment initiation, but the `estimatedFare` from client is stored in the ride document |
| Payment Auth | Implied: payments are secure and authenticated | ANALYSIS SEC-05: **No authentication** on `/api/payments/peach/initiate` and `/verify` — any caller with a `rideId` can initiate payment |
| Peach Secrets | "Secrets backend-only" | Correct — Peach secrets are only in `server.ts` env vars. However, the backend service password itself is **hardcoded as fallback** (SEC-02) |

---

## 6. Security: PLAN Expectations vs Actual State --todo

| PLAN.md Security Requirement | Actual State (ANALYSIS.md) |
|---|---|
| "Passengers access only their own protected data" | Partially met. Ratings readable by **all** authenticated users (SEC-10). Phone index **publicly** readable (SEC-13) |
| "Driver verification status is admin-controlled only" | Met in Firestore rules, but server uses **client SDK** not Admin SDK (SEC-17), weakening trust model |
| "Private documents protected via Storage authorization" | Storage rules don't check `email_verified` for admin access (BUG-08) |
| "Payment data strictly protected" | Payment endpoints have **no authentication** (SEC-05). `resource == null` bypass in payment rules (SEC-11) |
| "No client-controlled admin flag" | Met — admin is hardcoded UID list. But UIDs and personal email are **exposed in git** (SEC-06, SEC-07) |
| "Sensitive admin actions audited" | `audit_logs` collection exists but no server-side enforcement of audit logging |
| Not in plan: CORS | **No CORS policy** on Express server (SEC-14) |
| Not in plan: Rate Limiting | **No rate limiting** on any endpoint (SEC-15) |
| Not in plan: Path Traversal | Document serving has **path traversal vulnerability** (SEC-04) |
| Not in plan: Upload Auth | Document upload has **no authentication** (SEC-03) |

---

## 7. Server Architecture

| Aspect | PLAN.md | Actual System |
|---|---|---|
| Firebase SDK | Implies proper backend setup ("Firebase backend") | Server uses **Firebase Client SDK** instead of Admin SDK (SEC-17). Authenticates with email/password instead of service account JSON |
| Backend scope | "Express endpoints" (minimal) | Full Express server: Vite proxy, static files, payment gateway, document uploads, phone checks, webhook handler (~1143 lines) |

---

## 8. Admin Dashboard

| Aspect | PLAN.md | Actual System |
|---|---|---|
| Scope | "View passengers/drivers, approve/reject, review docs, view rides, payment ledger, KPIs, pricing, audit" | All listed features implemented **plus**: vehicles tab, ratings tab, notifications broadcast tab, pricing simulator. More extensive than planned |
| Access | "Admin entry points hidden from ordinary users" | Admin UIDs and email addresses **hardcoded in Firestore/Storage rules** and committed to git |

---

## 9. Notifications

| Aspect | PLAN.md | Actual System |
|---|---|---|
| Web Push | Listed as feature: "Web Push for background/closed browser" | **Not implemented**. Only Capacitor iOS push (APNs) and in-app Firestore notifications |
| WhatsApp | "WhatsApp automation requires WhatsApp Business Platform/API" | **Not implemented at all** — no WhatsApp integration in codebase |

---

## 10. Roadmap Phase Status

PLAN.md lists 28 tasks across 8 phases, **all unchecked** (`- [ ]`). However, the actual system has substantial implementation across all phases:

| Phase | PLAN Status | Actual System Status |
|---|---|---|
| Phase 1 — Identity | All unchecked | **Largely implemented**: multi-role, phone normalization, email verification, login |
| Phase 2 — Core Ride | All unchecked | **Implemented**: GPS, fare calc, OTP (UI-only), ride status flow |
| Phase 3 — Driver Ops | All unchecked | **Implemented**: registration, document upload, admin preview, earnings |
| Phase 4 — Payments | All unchecked | **Implemented**: cash + Peach Payments integration with webhook handling |
| Phase 5 — Security | All unchecked | **Partially done**: Firestore rules exist but have issues (41 findings in ANALYSIS) |
| Phase 6 — Notifications | All unchecked | **Partially done**: in-app + iOS push; no Web Push, no WhatsApp |
| Phase 7 — iOS Prep | All unchecked | **Partially done**: Capacitor config exists, rider-ios build target ready |
| Phase 8 — Stabilisation | All unchecked | **Not started**: demo mode still active, credentials in git, critical bugs remain |

---

## 11. Code Quality Issues Not Addressed in PLAN.md

These issues found in ANALYSIS.md have no corresponding plan item:

| Issue | Severity | Description |
|---|---|---|
| MEM-01 / BUG-06 | CRITICAL | React Rules of Hooks violation in `DriverApp.tsx` — crashes at runtime for unapproved drivers |
| BUG-01 | Medium | `NextFunction` not imported in `server.ts` — TypeScript compilation fails |
| BUG-02 | Low | `package.json` name is `"react-example"` instead of `"zaka-e-hailing"` |
| BUG-04 | Low | Dual lockfiles (`bun.lock` + `package-lock.json`) — non-deterministic builds |
| BUG-05 | Medium | `isAuthenticated` uses `||` between `currentUser` and `userProfile` — can flash incorrect state |
| BUG-07 | Medium | Demo persona UIDs in Firestore rules will never match real anonymous auth UIDs |
| PERF-04 | High | Base64 documents stored in Firestore (up to 950KB per doc) — anti-pattern |
| MEM-02 | High | GPS simulation interval recreated every 2.5s due to `driverLocation` dependency |

---

## 12. POPIA Compliance Gaps

| Aspect | PLAN.md | Actual System |
|---|---|---|
| Consent | Not detailed | `ComplianceModal.tsx` exists, `popiaConsent` field tracked |
| Data Retention | Not mentioned | **No retention or auto-deletion policy** |
| Data Export | Not mentioned | **No user data export feature** |
| Phone Privacy | "Phone numbers stored in canonical format" | Phone index is **publicly readable** without authentication (SEC-13) |
| Demo Data Cleanup | "Any retained demo infrastructure is isolated" | Demo data shares **same collections** as production; no cleanup mechanism |

---

## Summary

| Category | Differences Found |
|---|---|
| Tech Stack | 7 |
| Firestore Collections | 10 |
| Security Gaps (plan vs reality) | 10 |
| Feature Discrepancies | 8 |
| Unplanned Bugs/Issues | 8 |
| Compliance Gaps | 5 |
| **Total** | **48** |

**Key Takeaway:** The PLAN.md represents the intended production-ready state. The ANALYSIS.md reveals the actual state has significant security vulnerabilities (5 critical, 3 high), a critical React hooks crash bug, and several architectural deviations from the plan. The roadmap checkboxes are all unchecked despite most features being substantially built — the plan needs updating to reflect current progress and remaining gaps.
