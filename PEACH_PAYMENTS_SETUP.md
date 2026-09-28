# ZAKA E-Hailing — Peach Payments Production & Sandbox Integration Guide

This guide outlines the production deployment, sandbox testing, and merchant onboarding lifecycle for Peach Payments on the ZAKA E-Hailing platform.

---

## Architecture Overview

```
ZAKA Passenger / Driver App (React Web/Mobile)
                  │
                  ▼
         Secure ZAKA Server Layer
       (/api/payments/peach/initiate)
                  │
                  ▼
       Peach Payments Checkout API (v2)
  (Sandbox: https://testsecure.peachpayments.com)
  (Production: https://secure.peachpayments.com)
                  │
                  ▼
    Peach Payment Processing & 3D Secure
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
Passenger Redirect     Server-to-Server
(shopperResultUrl)     Signed Webhook
        │             (/api/payments/peach/webhook)
        └─────────┬─────────┘
                  ▼
    Authoritative ZAKA Verification
    - Validates HMAC SHA-256 Signature
    - Verifies Authoritative Ride & Fare
    - Finalizes Payment to 'paid'
    - Calculates 85% Driver Net / 15% Platform Commission
    - Dispatches Passenger & Driver Notifications
```

---

## Step-by-Step Onboarding Lifecycle

### 1. Create and Activate Peach Payments Merchant Account
- Sign up at [https://dashboard.peachpayments.com](https://dashboard.peachpayments.com) or contact Peach Payments Sales / Onboarding for a South African merchant account.
- Complete FICA / CIPC business verification with Peach Payments and your acquiring bank (e.g. Absa, Standard Bank, Nedbank, First National Bank).

### 2. Obtain Sandbox & Production Credentials
Log in to the Peach Payments Dashboard and navigate to **Checkout > Credentials**:
- **Entity ID / Channel ID**: Your unique checkout channel identifier (e.g., `8a8294174b...`).
- **Secret Token**: The private secret used to generate and verify HMAC SHA-256 signatures.
- **Client ID & Client Secret**: OAuth credentials for API reporting and status queries.
- **Merchant ID**: Your registered merchant identifier.

### 3. Configure Server Environment Variables
In your deployment environment (e.g., Cloud Run environment variables or `.env` file):
```env
PEACH_ENV=sandbox
PEACH_ENTITY_ID=<Your-Peach-Entity-ID>
PEACH_SECRET_TOKEN=<Your-Peach-Secret-Token>
PEACH_CLIENT_ID=<Your-Peach-Client-ID>
PEACH_CLIENT_SECRET=<Your-Peach-Client-Secret>
PEACH_MERCHANT_ID=<Your-Peach-Merchant-ID>
PEACH_WEBHOOK_SECRET=<Your-Peach-Webhook-Secret>
```

> **CRITICAL SECURITY NOTE:**
> Never place these credentials in frontend React source files, Vite environment variables (`VITE_*`), Firestore documents, or git repositories. They must strictly reside in the server-side environment.

### 4. Configure Webhooks and Redirect URLs in Peach Dashboard
1. Go to **Dashboard > Webhooks** and add an endpoint:
   - **URL**: `https://<your-domain>/api/payments/peach/webhook`
   - **Events**: `payment.successful`, `payment.failed`, `payment.cancelled`
2. Allowlist your application domain in **Dashboard > Domains / Security**:
   - Add your production URL and staging URLs.

### 5. Run Sandbox Testing
With `PEACH_ENV=sandbox`:
- Use Peach Payments test credit/debit card numbers provided in their sandbox documentation.
- Test 3D Secure challenges, successful authorisations, cancellations, and card declines.
- Verify that driver earnings (85%) and platform commission (15%) are correctly allocated only upon payment confirmation.

### 6. Switch to Production
Only after completing full end-to-end sandbox verification and acquiring bank sign-off:
1. Update `PEACH_ENV=production`.
2. Replace sandbox Entity ID, Secret Token, and OAuth credentials with live production credentials.
3. Perform a real low-value test transaction (e.g. R35.00 ride) to verify live settlement.
