/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Production Express Backend Server
 * Secure Server-Side Execution Layer for Peach Payments, Driver Earnings & Vite Serving
 */

import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  initializeFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
} from 'firebase/firestore';

// Load environment variables from .env
dotenv.config();

const PORT = 3000;
const app = express();

// Ensure uploads directory exists and is statically served for driver document previews
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Helper function to serve driver compliance document (disk or Firestore)
async function serveDriverDocument(relPath: string, res: Response): Promise<boolean> {
  const cleanPath = relPath.replace(/^\/+/, '');
  const normalizedStoragePath = cleanPath.startsWith('drivers/') ? cleanPath : `drivers/${cleanPath}`;
  const diskPath = path.join(UPLOADS_DIR, normalizedStoragePath);

  // 1. If file exists on disk, stream it immediately
  if (fs.existsSync(diskPath) && fs.statSync(diskPath).isFile()) {
    const ext = path.extname(diskPath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    };
    const mime = mimeMap[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(diskPath);
    return true;
  }

  // 2. Fallback to Firestore driver_document_contents
  try {
    const docKey = normalizedStoragePath.replace(/\//g, '_');
    await ensureBackendAuthenticated();
    const contentDocRef = doc(db, 'driver_document_contents', docKey);
    const contentSnap = await getDoc(contentDocRef);
    if (contentSnap.exists() && contentSnap.data()?.fileData) {
      const data = contentSnap.data();
      const rawBase64 = data.fileData.includes('base64,') ? data.fileData.split('base64,')[1] : data.fileData;
      const buf = Buffer.from(rawBase64, 'base64');
      fs.mkdirSync(path.dirname(diskPath), { recursive: true });
      fs.writeFileSync(diskPath, buf);
      const mime = data.fileType || (normalizedStoragePath.endsWith('.pdf') ? 'application/pdf' : 'image/png');
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', 'inline');
      res.send(buf);
      return true;
    }
  } catch (err: any) {
    console.warn('[ZAKA Server] Document retrieval note:', err?.message);
  }

  return false;
}

app.use('/uploads', express.static(UPLOADS_DIR));

// Intercept any missing /uploads/* requests so they NEVER fall through to the SPA index.html
app.use('/uploads', async (req: Request, res: Response) => {
  const requestedPath = req.path.replace(/^\/+/, '');
  const served = await serveDriverDocument(requestedPath, res);
  if (!served) {
    res.status(404).json({
      error: 'Document not found',
      path: requestedPath,
      message: 'The requested document is not available on this server.',
    });
  }
});

// Intercept /drivers/* document requests so they NEVER fall through to the SPA index.html!
app.use('/drivers', async (req: Request, res: Response, next: NextFunction) => {
  const p = req.path.toLowerCase();
  if (
    p.includes('/documents/') ||
    p.includes('/profile-photo') ||
    p.endsWith('.pdf') ||
    p.endsWith('.png') ||
    p.endsWith('.jpg') ||
    p.endsWith('.jpeg') ||
    p.endsWith('.webp')
  ) {
    const requestedPath = `drivers${req.path}`;
    const served = await serveDriverDocument(requestedPath, res);
    if (!served) {
      res.status(404).json({
        error: 'Document not found',
        path: requestedPath,
        message: 'The requested driver document is not available.',
      });
    }
    return;
  }
  next();
});

// Dedicated document preview and inspection endpoint
app.get('/api/driver/document-preview', async (req: Request, res: Response) => {
  const storagePath = (req.query.storagePath as string) || (req.query.path as string) || '';
  const driverId = (req.query.driverId as string) || '';
  const documentType = (req.query.documentType as string) || '';

  let resolvedPath = storagePath;
  if (!resolvedPath && driverId && documentType) {
    resolvedPath = `drivers/${driverId}/documents/${documentType}`;
  }

  if (!resolvedPath) {
    res.status(400).json({ error: 'Missing required storagePath or driverId/documentType parameter' });
    return;
  }

  const served = await serveDriverDocument(resolvedPath, res);
  if (!served) {
    res.status(404).json({
      error: 'Document not found',
      path: resolvedPath,
      message: 'Unable to retrieve the requested document.',
    });
  }
});

// Body parsers with 25MB payload limit for high-resolution document uploads and rawBody retention for webhook HMAC
app.use(
  express.json({
    limit: '25mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: '25mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);

// Load Firebase configuration safely in ESM
const firebaseConfig = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'firebase-applet-config.json'), 'utf-8')
);

const fbApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const fbAuth = getAuth(fbApp);
const db = initializeFirestore(fbApp, { experimentalAutoDetectLongPolling: true }, firebaseConfig.firestoreDatabaseId);

// Backend Admin Service Authentication
const BACKEND_EMAIL = process.env.ZAKA_BACKEND_SERVICE_EMAIL || 'zaka.backend.service@zaka.io';
const BACKEND_PASSWORD = process.env.ZAKA_BACKEND_SERVICE_PASSWORD || 'ZakaSecurePass2026!#';

let cachedAuthUser: any = null;
async function ensureBackendAuthenticated() {
  if (cachedAuthUser && fbAuth.currentUser) {
    return cachedAuthUser;
  }
  try {
    const cred = await signInWithEmailAndPassword(fbAuth, BACKEND_EMAIL, BACKEND_PASSWORD);
    cachedAuthUser = cred.user;
    return cred.user;
  } catch (err: any) {
    console.warn('[ZAKA Server] Backend service auth warning:', err.message);
    return null;
  }
}

// Peach Payments Environment Configuration
function getPeachConfig() {
  const env = (process.env.PEACH_ENV || 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox';
  const entityId = process.env.PEACH_ENTITY_ID || '';
  const secretToken = process.env.PEACH_SECRET_TOKEN || '';
  const clientId = process.env.PEACH_CLIENT_ID || '';
  const clientSecret = process.env.PEACH_CLIENT_SECRET || '';
  const merchantId = process.env.PEACH_MERCHANT_ID || '';
  const webhookSecret = process.env.PEACH_WEBHOOK_SECRET || '';
  const webhookUrl = process.env.PEACH_WEBHOOK_URL || '';

  const isConfigured = Boolean(entityId && secretToken);
  const hasOAuthConfig = Boolean(clientId && clientSecret && merchantId);

  const baseUrl = env === 'production'
    ? 'https://secure.peachpayments.com'
    : 'https://testsecure.peachpayments.com';

  const authUrl = env === 'production'
    ? 'https://dashboard.peachpayments.com/api/oauth/token'
    : 'https://sandbox-dashboard.peachpayments.com/api/oauth/token';

  return {
    env,
    entityId,
    secretToken,
    clientId,
    clientSecret,
    merchantId,
    webhookSecret,
    webhookUrl,
    isConfigured,
    hasOAuthConfig,
    baseUrl,
    authUrl,
  };
}

// In-memory cache for Peach OAuth v2 token
interface PeachTokenCache {
  accessToken: string;
  expiresAt: number;
}
let cachedPeachToken: PeachTokenCache | null = null;

/**
 * Obtains an OAuth access token from Peach's authentication service using clientId, clientSecret, and merchantId
 */
async function getPeachAccessToken(): Promise<string | null> {
  const peach = getPeachConfig();
  if (!peach.hasOAuthConfig) {
    return null;
  }

  // Reuse cached token if valid for at least 60 seconds
  if (cachedPeachToken && Date.now() < cachedPeachToken.expiresAt - 60000) {
    return cachedPeachToken.accessToken;
  }

  try {
    const response = await fetch(peach.authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId: peach.clientId,
        clientSecret: peach.clientSecret,
        merchantId: peach.merchantId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[ZAKA Server] Peach OAuth token request failed (${response.status}):`, errorText);
      return null;
    }

    const data = await response.json();
    if (data?.access_token) {
      const expiresIn = Number(data.expires_in) || 86400;
      cachedPeachToken = {
        accessToken: data.access_token,
        expiresAt: Date.now() + expiresIn * 1000,
      };
      return data.access_token;
    }
  } catch (err: any) {
    console.warn('[ZAKA Server] Error obtaining Peach OAuth token:', err.message);
  }

  return null;
}

// Replay and idempotency cache for Webhook IDs
const processedWebhookIds = new Set<string>();

async function isWebhookAlreadyProcessed(webhookId: string): Promise<boolean> {
  if (processedWebhookIds.has(webhookId)) {
    return true;
  }
  try {
    const docRef = doc(db, 'processed_webhooks', webhookId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      processedWebhookIds.add(webhookId);
      return true;
    }
  } catch (e) {
    console.warn('[ZAKA Webhook] Failed checking processed webhook status in Firestore:', e);
  }
  return false;
}

async function markWebhookProcessed(webhookId: string, eventType?: string): Promise<void> {
  processedWebhookIds.add(webhookId);
  try {
    const docRef = doc(db, 'processed_webhooks', webhookId);
    await setDoc(docRef, {
      webhookId,
      eventType: eventType || 'payment_event',
      processedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[ZAKA Webhook] Failed recording processed webhook in Firestore:', e);
  }
}

/**
 * Calculates HMAC-SHA256 signature for Peach Payments Checkout v2
 * Sorted parameter keys concatenated without spaces
 */
function calculatePeachSignature(params: Record<string, string>, secretKey: string): string {
  const sortedKeys = Object.keys(params).sort();
  let toSign = '';
  for (const key of sortedKeys) {
    toSign += key + params[key];
  }
  return crypto.createHmac('sha256', secretKey).update(toSign).digest('hex');
}

// ============================================================================
// API ROUTES
// ============================================================================

// 1. Health Check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'ZAKA E-Hailing Platform API',
    timestamp: new Date().toISOString(),
  });
});

// Phone Number Normalization & Equivalence Helper for Uniqueness Enforcement
function getPhoneVariants(raw: string): string[] {
  if (!raw) return [];
  const cleaned = raw.trim().replace(/[\s\-\(\)\.]/g, '');
  const variants = new Set<string>();
  if (raw.trim()) variants.add(raw.trim());
  if (cleaned) variants.add(cleaned);

  let canonical = '';
  if (/^0[1-9]\d{8}$/.test(cleaned)) {
    canonical = '+27' + cleaned.slice(1);
  } else if (/^27[1-9]\d{8}$/.test(cleaned)) {
    canonical = '+' + cleaned;
  } else if (/^\+27[1-9]\d{8}$/.test(cleaned)) {
    canonical = cleaned;
  } else if (/^0027[1-9]\d{8}$/.test(cleaned)) {
    canonical = '+27' + cleaned.slice(4);
  }

  if (canonical) {
    variants.add(canonical);
    variants.add(`+27 ${canonical.slice(3, 5)} ${canonical.slice(5, 8)} ${canonical.slice(8)}`);
    variants.add(canonical.slice(1));
    const local = '0' + canonical.slice(3);
    variants.add(local);
    variants.add(`0${canonical.slice(3, 5)} ${canonical.slice(5, 8)} ${canonical.slice(8)}`);
    variants.add(`0${canonical.slice(3, 5)} ${canonical.slice(5)}`);
  }

  return Array.from(variants);
}

// 2. Phone Number Uniqueness Check (Querying phoneIndex, users, passengers, and drivers)
app.get('/api/auth/check-phone', async (req: Request, res: Response) => {
  try {
    const rawPhone = String(req.query.phone || '').trim();
    if (!rawPhone) {
      res.status(400).json({ isRegistered: false, error: 'Phone parameter is required' });
      return;
    }

    const variants = getPhoneVariants(rawPhone);
    await ensureBackendAuthenticated();

    // 1. Check phoneIndex collection for all canonical variants
    for (const v of variants) {
      try {
        const pSnap = await getDoc(doc(db, 'phoneIndex', v));
        if (pSnap.exists()) {
          const data = pSnap.data();
          if (data?.uid) {
            res.json({ isRegistered: true, uid: data.uid, source: 'phoneIndex' });
            return;
          }
        }
      } catch {
        // proceed
      }
    }

    // 2. Query users, passengers, and drivers collections
    const collectionsToCheck = ['users', 'passengers', 'drivers'];
    const chunk = variants.slice(0, 10);

    for (const colName of collectionsToCheck) {
      try {
        const q = query(collection(db, colName), where('phone', 'in', chunk), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docItem = snap.docs[0];
          const data = docItem.data();
          const uid = data.userId || data.uid || docItem.id;
          // Backfill phoneIndex with canonical format for fast subsequent checks
          const canonical = variants.find((v) => v.startsWith('+27') && !v.includes(' ')) || rawPhone;
          try {
            await setDoc(
              doc(db, 'phoneIndex', canonical),
              {
                uid,
                normalizedPhone: canonical,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            );
          } catch {}
          res.json({ isRegistered: true, uid, source: colName });
          return;
        }
      } catch (colErr) {
        console.warn(`[ZAKA Server] Warning querying ${colName} by phone:`, colErr);
      }
    }

    res.json({ isRegistered: false });
  } catch (err: any) {
    console.error('[ZAKA Server] check-phone error:', err);
    res.json({ isRegistered: false, error: err.message });
  }
});

// 3. Driver Verification Document Upload Endpoint (Resilient, High-Performance Storage)
app.post('/api/driver/upload-document', async (req: Request, res: Response) => {
  try {
    const { driverId, documentType, fileName, fileType, fileData } = req.body;

    if (!driverId || !documentType || !fileName || !fileData) {
      res.status(400).json({
        success: false,
        error: 'Missing required upload parameters (driverId, documentType, fileName, fileData)',
      });
      return;
    }

    // Permitted file types
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    const cleanType = fileType || (fileName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    const ext = (path.extname(fileName) || (cleanType === 'application/pdf' ? '.pdf' : '.jpg')).toLowerCase();
    const validExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];

    if (!allowedMimes.includes(cleanType) && !validExtensions.includes(ext)) {
      res.status(400).json({
        success: false,
        error: `Unsupported file type: ${cleanType}. Allowed: PDF, JPG, PNG, WEBP.`,
      });
      return;
    }

    // Decode base64 payload
    const base64Data = typeof fileData === 'string' && fileData.includes('base64,')
      ? fileData.split('base64,')[1]
      : fileData;
    const fileBuffer = Buffer.from(base64Data, 'base64');

    if (fileBuffer.length === 0) {
      res.status(400).json({
        success: false,
        error: 'The uploaded file is empty (0 bytes).',
      });
      return;
    }

    if (fileBuffer.length > 10 * 1024 * 1024) {
      res.status(400).json({
        success: false,
        error: `File is too large (${(fileBuffer.length / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is 10 MB.`,
      });
      return;
    }

    // Save file on disk
    const driverDocsDir = path.join(UPLOADS_DIR, 'drivers', driverId, 'documents');
    fs.mkdirSync(driverDocsDir, { recursive: true });

    const safeFileName = `${documentType}_${Date.now()}${ext}`;
    const filePath = path.join(driverDocsDir, safeFileName);
    fs.writeFileSync(filePath, fileBuffer);

    const fileUrl = `/uploads/drivers/${driverId}/documents/${safeFileName}`;
    const storagePath = `drivers/${driverId}/documents/${safeFileName}`;

    const keyMap: Record<string, string> = {
      'drivers-license': 'driversLicense',
      'prdp': 'prdp',
      'vehicle-registration': 'vehicleRegistration',
      'vehicle-inspection': 'vehicleInspection',
      'profile-photo': 'profilePhoto',
      'operating-license': 'operatingLicense',
    };

    const titles: Record<string, string> = {
      'drivers-license': "Driver's Licence Card",
      'prdp': 'Professional Driving Permit (PrDP)',
      'vehicle-registration': 'Vehicle Registration Certificate (RC1)',
      'vehicle-inspection': 'Vehicle Roadworthy Inspection Certificate',
      'profile-photo': 'Driver Profile Photo',
      'operating-license': 'Operating Licence / PRE Permit',
    };

    const docField = keyMap[documentType] || documentType;
    const record = {
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      documentType,
      title: titles[documentType] || documentType,
      fileUrl,
      storagePath,
      fileName,
      fileSizeBytes: fileBuffer.length,
      fileType: cleanType,
      status: 'pending',
      uploadedAt: new Date().toISOString(),
    };

    // Save to Firestore driver profile via backend admin
    try {
      await ensureBackendAuthenticated();
      const driverDocRef = doc(db, 'drivers', driverId);
      await setDoc(
        driverDocRef,
        {
          verificationDocuments: {
            [docField]: record,
          },
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      // Persist base64 data to Firestore if within 950KB limit for durable cross-container access
      if (base64Data && base64Data.length < 950 * 1024) {
        const docKey = storagePath.replace(/\//g, '_');
        await setDoc(doc(db, 'driver_document_contents', docKey), {
          driverId,
          documentType,
          fileName,
          fileType: cleanType,
          fileData: base64Data,
          storagePath,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (fsErr) {
      console.warn('[ZAKA Server] Firestore write warning in upload handler:', fsErr);
    }

    res.json({
      success: true,
      fileUrl,
      storagePath,
      fileName,
      fileSizeBytes: fileBuffer.length,
      fileType: cleanType,
      record,
    });
  } catch (err: any) {
    console.error('[ZAKA Server] Document upload error:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal server upload error' });
  }
});

// 3. Public Gateway Configuration (NO SECRETS EXPOSED)
app.get('/api/payments/config', (_req: Request, res: Response) => {
  const peach = getPeachConfig();
  res.json({
    provider: 'peach',
    env: peach.env,
    isConfigured: peach.isConfigured,
    currency: 'ZAR',
    commissionSplit: {
      driverPercent: 85,
      platformPercent: 15,
    },
    message: peach.isConfigured
      ? `Peach Payments active in ${peach.env.toUpperCase()} mode.`
      : 'ZAKA PAYMENT INTEGRATION IMPLEMENTED — AWAITING PEACH MERCHANT CREDENTIALS AND PRODUCTION ONBOARDING.',
  });
});

// 3. Initiate Electronic Payment (Peach Hosted Checkout)
app.post('/api/payments/peach/initiate', async (req: Request, res: Response) => {
  try {
    const { rideId, paymentMethod = 'card' } = req.body;

    if (!rideId || typeof rideId !== 'string') {
      res.status(400).json({ success: false, error: 'rideId is required' });
      return;
    }

    await ensureBackendAuthenticated();

    // Retrieve the authoritative ride document
    const rideRef = doc(db, 'rides', rideId);
    const rideSnap = await getDoc(rideRef);

    if (!rideSnap.exists()) {
      res.status(404).json({ success: false, error: 'Ride not found' });
      return;
    }

    const rideData = rideSnap.data();

    // Verify ride is completed or valid for payment
    if (rideData.status !== 'completed' && rideData.status !== 'in_progress') {
      res.status(400).json({
        success: false,
        error: `Cannot initiate payment for ride in status: ${rideData.status}`,
      });
      return;
    }

    // Authoritative fare calculation (Never trust amount from client)
    const authoritativeFare = Number(rideData.finalFare || rideData.estimatedFare) || 35.0;
    const amount = Math.round(authoritativeFare * 100) / 100;
    const platformCommission = Math.round(amount * 15) / 100;
    const driverEarnings = Math.round((amount - platformCommission) * 100) / 100;

    // Check existing payment record for this ride
    const paymentsRef = collection(db, 'payments');
    const q = query(paymentsRef, where('rideId', '==', rideId), limit(1));
    const paymentQuerySnap = await getDocs(q);

    let paymentDocId = '';
    let existingPayment: any = null;

    if (!paymentQuerySnap.empty) {
      const pDoc = paymentQuerySnap.docs[0];
      paymentDocId = pDoc.id;
      existingPayment = pDoc.data();

      // If already paid, return finalized state immediately (idempotency)
      if (existingPayment.paymentStatus === 'paid') {
        res.json({
          success: true,
          paymentStatus: 'paid',
          message: 'Payment has already been confirmed and settled.',
          paymentId: paymentDocId,
          amount,
        });
        return;
      }
    } else {
      paymentDocId = `PAY-${rideId.substring(0, 8)}-${Date.now().toString(36)}`;
    }

    // Peach merchantTransactionId must be 8-16 alphanumeric characters according to Peach specification
    // Format: 'ZK' (2) + shortRide (4) + random alphanumeric token (8) = 14 characters
    const shortRide = rideId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
    const randHex = crypto.randomBytes(4).toString('hex').toUpperCase();
    const merchantTransactionId = `ZK${shortRide}${randHex}`.slice(0, 16);

    const peach = getPeachConfig();

    // If Peach credentials have not yet been provided in environment
    if (!peach.isConfigured) {
      // Record payment attempt as pending in Firestore
      const paymentRecord = {
        id: paymentDocId,
        paymentId: paymentDocId,
        rideId,
        passengerId: rideData.passengerId,
        driverId: rideData.driverId || '',
        amount,
        currency: 'ZAR',
        paymentMethod,
        paymentStatus: 'pending',
        platformCommission,
        platformFee: platformCommission,
        driverEarnings,
        provider: 'peach',
        transactionReference: merchantTransactionId,
        merchantTransactionId,
        failureReason: 'PEACH_CREDENTIALS_REQUIRED',
        isDemo: Boolean(rideData.isDemo),
        updatedAt: new Date().toISOString(),
        createdAt: existingPayment?.createdAt || new Date().toISOString(),
        paidAt: null,
      };

      await setDoc(doc(db, 'payments', paymentDocId), paymentRecord, { merge: true });

      res.json({
        success: false,
        code: 'PEACH_CREDENTIALS_REQUIRED',
        message:
          'ZAKA PAYMENT INTEGRATION IMPLEMENTED — AWAITING PEACH MERCHANT CREDENTIALS AND PRODUCTION ONBOARDING. Set PEACH_ENTITY_ID and PEACH_SECRET_TOKEN in .env to enable live card checkout.',
        paymentStatus: 'pending',
        amount,
        merchantTransactionId,
        paymentId: paymentDocId,
      });
      return;
    }

    // Peach credentials configured: obtain OAuth token and initiate Hosted Checkout v2
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const shopperResultUrl = `${protocol}://${host}/api/payments/peach/return?rideId=${rideId}`;

    // Genuinely unique nonce per checkout instance
    const nonce = crypto.randomUUID();

    const checkoutParams: Record<string, string> = {
      'authentication.entityId': peach.entityId,
      amount: amount.toFixed(2),
      currency: 'ZAR',
      merchantTransactionId,
      nonce,
      paymentType: 'DB',
      shopperResultUrl,
    };

    // Calculate HMAC-SHA256 signature using PEACH_SECRET_TOKEN
    const signature = calculatePeachSignature(checkoutParams, peach.secretToken);
    checkoutParams['signature'] = signature;

    // Obtain OAuth Bearer token from Peach authentication service if client credentials are provided
    const accessToken = await getPeachAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const peachEndpoint = `${peach.baseUrl}/v2/checkout`;
    const peachResponse = await fetch(peachEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(checkoutParams),
    });

    const peachData = await peachResponse.json();

    if (!peachResponse.ok || (!peachData.redirectUrl && !peachData.id)) {
      console.warn('[ZAKA Server] Peach checkout response error:', peachData);
      res.status(502).json({
        success: false,
        error: 'Payment gateway communication error',
        details: peachData?.result?.description || peachData?.message || 'Gateway rejected checkout request',
      });
      return;
    }

    const redirectUrl = peachData.redirectUrl;
    const peachCheckoutId = peachData.id || peachData.checkoutId;

    // Update payment record in Firestore
    await setDoc(
      doc(db, 'payments', paymentDocId),
      {
        id: paymentDocId,
        paymentId: paymentDocId,
        rideId,
        passengerId: rideData.passengerId,
        driverId: rideData.driverId || '',
        amount,
        currency: 'ZAR',
        paymentMethod,
        paymentStatus: 'pending',
        platformCommission,
        platformFee: platformCommission,
        driverEarnings,
        provider: 'peach',
        transactionReference: merchantTransactionId,
        merchantTransactionId,
        peachCheckoutId,
        redirectUrl,
        isDemo: Boolean(rideData.isDemo),
        updatedAt: new Date().toISOString(),
        createdAt: existingPayment?.createdAt || new Date().toISOString(),
        paidAt: null,
      },
      { merge: true }
    );

    res.json({
      success: true,
      paymentStatus: 'pending',
      redirectUrl,
      peachCheckoutId,
      merchantTransactionId,
      amount,
      paymentId: paymentDocId,
    });
  } catch (err: any) {
    console.error('[ZAKA Server] /api/payments/peach/initiate error:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
});

// 4. Secure Payment Verification (Server-to-Server Confirmation)
app.post('/api/payments/peach/verify', async (req: Request, res: Response) => {
  try {
    const { rideId, checkoutId } = req.body;

    if (!rideId) {
      res.status(400).json({ success: false, error: 'rideId is required' });
      return;
    }

    await ensureBackendAuthenticated();

    // Query payment record for this ride
    const paymentsRef = collection(db, 'payments');
    const q = query(paymentsRef, where('rideId', '==', rideId), limit(1));
    const snap = await getDocs(q);

    if (snap.empty) {
      res.status(404).json({ success: false, error: 'Payment record not found for ride' });
      return;
    }

    const paymentDoc = snap.docs[0];
    const payment = paymentDoc.data();

    // Idempotency: if already paid, return finalized state immediately without duplicate ledger credits
    if (payment.paymentStatus === 'paid') {
      res.json({
        success: true,
        paymentStatus: 'paid',
        message: 'Payment is already confirmed and finalized.',
        paidAt: payment.paidAt,
        amount: payment.amount,
      });
      return;
    }

    const peach = getPeachConfig();
    if (!peach.isConfigured) {
      res.json({
        success: false,
        paymentStatus: payment.paymentStatus || 'pending',
        message: 'Peach credentials awaiting configuration.',
      });
      return;
    }

    // Query Peach Payments status API using server-side credentials
    const targetCheckoutId = checkoutId || payment.peachCheckoutId;
    if (!targetCheckoutId) {
      res.json({
        success: false,
        paymentStatus: 'pending',
        message: 'Awaiting checkout completion.',
      });
      return;
    }

    const statusHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const accessToken = await getPeachAccessToken();
    if (accessToken) {
      statusHeaders['Authorization'] = `Bearer ${accessToken}`;
    }

    const statusUrl = `${peach.baseUrl}/v2/checkout/${targetCheckoutId}?entityId=${encodeURIComponent(peach.entityId)}`;
    const statusRes = await fetch(statusUrl, {
      headers: statusHeaders,
    });

    const statusData = await statusRes.json();
    const resultCode = statusData?.result?.code || '';
    // Peach success result codes pattern (000.000.000 or 000.100.110 etc)
    const isSuccess = /^(000\.000\.|000\.100\.1|000\.[36]|000\.400\.0[^3]|000\.400\.100)/.test(resultCode);

    if (isSuccess) {
      const nowIso = new Date().toISOString();

      // Finalize payment record
      await updateDoc(doc(db, 'payments', paymentDoc.id), {
        paymentStatus: 'paid',
        paidAt: nowIso,
        updatedAt: nowIso,
        providerTransactionId: statusData.id || statusData.registrationId || targetCheckoutId,
      });

      // Update ride document
      await updateDoc(doc(db, 'rides', rideId), {
        paymentStatus: 'paid',
        updatedAt: nowIso,
      });

      // Send single notifications to Passenger and Driver
      try {
        const notifRef = collection(db, 'notifications');
        await setDoc(doc(notifRef), {
          userId: payment.passengerId,
          title: 'Payment Successful ✓',
          message: `Payment of R${payment.amount.toFixed(2)} confirmed via Peach Payments. Thank you for riding with ZAKA!`,
          type: 'payment',
          read: false,
          createdAt: nowIso,
        });

        if (payment.driverId) {
          await setDoc(doc(notifRef), {
            userId: payment.driverId,
            title: 'Payment Confirmed',
            message: `Payment of R${payment.amount.toFixed(2)} confirmed. +R${(payment.driverEarnings || payment.amount * 0.85).toFixed(2)} credited to your account.`,
            type: 'payment',
            read: false,
            createdAt: nowIso,
          });
        }
      } catch (notifErr) {
        console.warn('[ZAKA Server] Notification dispatch warning:', notifErr);
      }

      res.json({
        success: true,
        paymentStatus: 'paid',
        paidAt: nowIso,
        amount: payment.amount,
      });
      return;
    }

    res.json({
      success: false,
      paymentStatus: payment.paymentStatus || 'pending',
      resultCode,
      message: statusData?.result?.description || 'Transaction pending or not completed',
    });
  } catch (err: any) {
    console.error('[ZAKA Server] /api/payments/peach/verify error:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
});

// 5. Signed Peach Payments Webhook Endpoint
// Implements Peach Payments Webhook Signature specification:
// Headers: x-webhook-timestamp, x-webhook-id, x-webhook-signature, x-webhook-signature-algorithm
// Signature message: timestamp.webhookId.webhookURL.rawRequestBody signed with PEACH_WEBHOOK_SECRET
app.post('/api/payments/peach/webhook', async (req: Request, res: Response) => {
  try {
    const timestamp = req.get('x-webhook-timestamp') || '';
    const webhookId = req.get('x-webhook-id') || '';
    const receivedSignature = req.get('x-webhook-signature') || req.get('x-signature') || '';
    const rawRequestBody = (req as any).rawBody || JSON.stringify(req.body);

    const peach = getPeachConfig();
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const configuredWebhookUrl = peach.webhookUrl || `${protocol}://${host}/api/payments/peach/webhook`;

    // 1. Signature Verification with PEACH_WEBHOOK_SECRET
    if (peach.webhookSecret) {
      if (!receivedSignature || !timestamp || !webhookId) {
        console.warn('[ZAKA Webhook] Missing required webhook authentication headers');
        res.status(401).json({ error: 'Missing webhook signature headers' });
        return;
      }

      // Replay attack prevention: verify timestamp is within 5 minutes (300,000 ms)
      const parsedTimestamp = Number(timestamp)
        ? (timestamp.length === 10 ? Number(timestamp) * 1000 : Number(timestamp))
        : Date.parse(timestamp);

      if (parsedTimestamp && Math.abs(Date.now() - parsedTimestamp) > 5 * 60 * 1000) {
        console.warn('[ZAKA Webhook] Webhook timestamp outside allowed 5-minute tolerance window');
        res.status(400).json({ error: 'Webhook timestamp expired or invalid' });
        return;
      }

      // Format: timestamp.webhookId.webhookURL.rawRequestBody
      const messageToSign = `${timestamp}.${webhookId}.${configuredWebhookUrl}.${rawRequestBody}`;
      const expectedSignature = crypto
        .createHmac('sha256', peach.webhookSecret)
        .update(messageToSign)
        .digest('hex');

      // Secure constant-time comparison to prevent timing attacks
      const sigBuf = Buffer.from(receivedSignature, 'hex');
      const expBuf = Buffer.from(expectedSignature, 'hex');

      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        console.warn('[ZAKA Webhook] HMAC-SHA256 signature verification failed');
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }
    }

    // 2. Replay & Idempotency Protection by Webhook ID
    if (webhookId) {
      const alreadyHandled = await isWebhookAlreadyProcessed(webhookId);
      if (alreadyHandled) {
        console.log(`[ZAKA Webhook] Webhook ID ${webhookId} already processed. Acknowledging with HTTP 200.`);
        res.status(200).json({ received: true, status: 'already_processed' });
        return;
      }
    }

    const payload = req.body;
    console.log('[ZAKA Webhook] Received verified Peach Payments event:', payload?.event || payload?.type);

    const merchantTransactionId = payload.merchantTransactionId || payload.data?.merchantTransactionId;
    const resultCode = payload.result?.code || payload.data?.result?.code || '';
    const isSuccess = /^(000\.000\.|000\.100\.1|000\.[36]|000\.400\.0[^3]|000\.400\.100)/.test(resultCode);

    if (merchantTransactionId && isSuccess) {
      await ensureBackendAuthenticated();

      const paymentsRef = collection(db, 'payments');
      const q = query(paymentsRef, where('merchantTransactionId', '==', merchantTransactionId), limit(1));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const pDoc = snap.docs[0];
        const paymentData = pDoc.data();

        // Idempotency: verify not already finalized
        if (paymentData.paymentStatus !== 'paid') {
          const nowIso = new Date().toISOString();
          await updateDoc(doc(db, 'payments', pDoc.id), {
            paymentStatus: 'paid',
            paidAt: nowIso,
            updatedAt: nowIso,
            providerTransactionId: payload.id || payload.data?.id || paymentData.peachCheckoutId,
          });

          await updateDoc(doc(db, 'rides', paymentData.rideId), {
            paymentStatus: 'paid',
            updatedAt: nowIso,
          });

          // Send notifications to Passenger and Driver
          try {
            const notifRef = collection(db, 'notifications');
            await setDoc(doc(notifRef), {
              userId: paymentData.passengerId,
              title: 'Payment Successful ✓',
              message: `Payment of R${paymentData.amount.toFixed(2)} confirmed via Peach Payments.`,
              type: 'payment',
              read: false,
              createdAt: nowIso,
            });

            if (paymentData.driverId) {
              await setDoc(doc(notifRef), {
                userId: paymentData.driverId,
                title: 'Payment Confirmed',
                message: `Payment of R${paymentData.amount.toFixed(2)} confirmed. +R${(paymentData.driverEarnings || paymentData.amount * 0.85).toFixed(2)} credited to your account.`,
                type: 'payment',
                read: false,
                createdAt: nowIso,
              });
            }
          } catch (notifErr) {
            console.warn('[ZAKA Webhook] Notification dispatch error:', notifErr);
          }

          console.log(`[ZAKA Webhook] Successfully finalized payment for ride ${paymentData.rideId}`);
        }
      }
    }

    // Record webhook ID as safely processed
    if (webhookId) {
      await markWebhookProcessed(webhookId, payload?.event || payload?.type);
    }

    // Return HTTP 200 ONLY after safe acceptance and processing
    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('[ZAKA Webhook] Error processing webhook:', err);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

// 6. Peach Shopper Return Callback Endpoint
app.all('/api/payments/peach/return', async (req: Request, res: Response) => {
  const rideId = (req.query.rideId as string) || (req.body?.rideId as string) || '';
  const checkoutId = (req.query.id as string) || (req.body?.id as string) || '';

  console.log(`[ZAKA Shopper Return] Ride: ${rideId}, Checkout: ${checkoutId}`);

  // Redirect passenger back to application with verification flag
  res.redirect(`/?rideId=${encodeURIComponent(rideId)}&peachReturn=true&checkoutId=${encodeURIComponent(checkoutId)}`);
});

// ============================================================================
// VITE DEV SERVER / STATIC PRODUCTION FALLBACK
// ============================================================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ZAKA Server] Full-Stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
