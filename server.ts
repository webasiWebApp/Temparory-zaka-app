/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Production Express Backend Server
 * Secure Server-Side Execution Layer for Peach Payments, Driver Earnings & Vite Serving
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
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
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
  startAfter,
  runTransaction,
  deleteField,
} from 'firebase/firestore';

// Load environment variables from .env
dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const app = express();
// Honour X-Forwarded-* headers when deployed behind a reverse proxy / load balancer (correct req.ip and protocol)
app.set('trust proxy', 1);

// CORS policy: restrict to known frontend origins in production
const ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://0.0.0.0:3000',
      // Capacitor native WebView origins (iOS / Android)
      'capacitor://localhost',
      'ionic://localhost',
      'https://localhost',
      'http://localhost',
    ];

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.get('origin') || '';
  if (origin && (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// Simple in-memory rate limiter for sensitive endpoints
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
function rateLimit(windowMs: number, maxRequests: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const entry = rateLimitStore.get(key);
    if (!entry || now > entry.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (entry.count >= maxRequests) {
      res.status(429).json({ error: 'Too many requests. Please try again later.' });
      return;
    }
    entry.count++;
    next();
  };
}

// Clean up expired rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(key);
  }
}, 5 * 60 * 1000);

// Ensure uploads directory exists and is statically served for driver document previews
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Driver compliance documents are private: only the owning driver or a verified Admin may fetch them.
// Callers must send their Firebase ID token in the Authorization header (the web client fetches
// documents as blobs, so no token ever appears in a URL, log line or browser history).
function normalizeDriverDocumentPath(relPath: string): { storagePath: string; diskPath: string; driverId: string } | null {
  let cleanPath = '';
  try {
    cleanPath = decodeURIComponent(relPath || '');
  } catch {
    return null;
  }
  cleanPath = cleanPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^uploads\//, '');
  const storagePath = cleanPath.startsWith('drivers/') ? cleanPath : `drivers/${cleanPath}`;
  if (storagePath.split('/').some((segment) => segment === '..' || segment === '.')) {
    return null;
  }
  const diskPath = path.resolve(UPLOADS_DIR, storagePath);

  // Path traversal guard: ensure resolved path stays within UPLOADS_DIR/drivers
  const driversRoot = path.join(UPLOADS_DIR, 'drivers') + path.sep;
  if (!diskPath.startsWith(driversRoot)) {
    return null;
  }
  const driverId = storagePath.split('/')[1] || '';
  if (!driverId) return null;
  return { storagePath, diskPath, driverId };
}

async function serveDriverDocument(relPath: string, req: Request, res: Response): Promise<void> {
  const target = normalizeDriverDocumentPath(relPath);
  if (!target) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  const tokenUser = await verifyFirebaseIdToken(req);
  if (!tokenUser) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (tokenUser.uid !== target.driverId && !(await isAdminUser(tokenUser))) {
    res.status(403).json({ error: 'You are not authorised to view this document.' });
    return;
  }

  const { storagePath, diskPath } = target;
  const mimeMap: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  };
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 1. If file exists on disk, stream it immediately
  if (fs.existsSync(diskPath) && fs.statSync(diskPath).isFile()) {
    const mime = mimeMap[path.extname(diskPath).toLowerCase()] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(diskPath);
    return;
  }

  // 2. Fallback to Firestore driver_document_contents
  try {
    const docKey = storagePath.replace(/\//g, '_');
    await ensureBackendAuthenticated();
    const contentSnap = await getDoc(doc(db, 'driver_document_contents', docKey));
    if (contentSnap.exists() && contentSnap.data()?.fileData) {
      const data = contentSnap.data();
      const rawBase64 = data.fileData.includes('base64,') ? data.fileData.split('base64,')[1] : data.fileData;
      const buf = Buffer.from(rawBase64, 'base64');
      const mime = data.fileType || mimeMap[path.extname(storagePath).toLowerCase()] || 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', 'inline');
      res.send(buf);
      return;
    }
  } catch (err: any) {
    console.warn('[ZAKA Server] Document retrieval note:', err?.message);
  }

  res.status(404).json({ error: 'Document not found' });
}

// NOTE: /uploads is deliberately NOT exposed through express.static - every request is authorised.
app.use('/uploads', rateLimit(60000, 120), async (req: Request, res: Response) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  await serveDriverDocument(req.path, req, res);
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
    await serveDriverDocument(`drivers${req.path}`, req, res);
    return;
  }
  next();
});

// Dedicated document preview and inspection endpoint
app.get('/api/driver/document-preview', rateLimit(60000, 120), async (req: Request, res: Response) => {
  const storagePath = (req.query.storagePath as string) || (req.query.path as string) || '';
  if (!storagePath) {
    res.status(400).json({ error: 'Missing required storagePath parameter' });
    return;
  }
  await serveDriverDocument(storagePath, req, res);
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
const BACKEND_EMAIL = process.env.ZAKA_BACKEND_SERVICE_EMAIL;
const BACKEND_PASSWORD = process.env.ZAKA_BACKEND_SERVICE_PASSWORD;

if (!BACKEND_EMAIL || !BACKEND_PASSWORD) {
  console.error('[ZAKA Server] FATAL: ZAKA_BACKEND_SERVICE_EMAIL and ZAKA_BACKEND_SERVICE_PASSWORD must be set in environment variables.');
  process.exit(1);
}

let cachedAuthUser: any = null;
async function ensureBackendAuthenticated() {
  if (cachedAuthUser && fbAuth.currentUser) {
    return cachedAuthUser;
  }
  try {
    const cred = await signInWithEmailAndPassword(fbAuth, BACKEND_EMAIL as string, BACKEND_PASSWORD as string);
    cachedAuthUser = cred.user;
    return cred.user;
  } catch (err: any) {
    console.warn('[ZAKA Server] Backend service auth warning:', err.message);
    return null;
  }
}

// Firebase ID Token Verification (using Firebase Auth REST API since we use the client SDK)
interface VerifiedUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

const verifiedTokenCache = new Map<string, { user: VerifiedUser; expiresAt: number }>();

async function verifyIdTokenString(idToken: string): Promise<VerifiedUser | null> {
  if (!idToken || typeof idToken !== 'string' || idToken.length > 4096) return null;

  const cached = verifiedTokenCache.get(idToken);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  try {
    // accounts:lookup only succeeds for a genuine, unexpired ID token issued for this project
    const response = await fetch(
      `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo?key=${firebaseConfig.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        signal: AbortSignal.timeout(10000),
      }
    );
    const data = await response.json();
    if (data.users && data.users.length > 0 && data.users[0].localId && !data.users[0].disabled) {
      const account = data.users[0];
      const federated = Array.isArray(account.providerUserInfo)
        ? account.providerUserInfo.some((p: any) => p.providerId === 'google.com' || p.providerId === 'apple.com')
        : false;
      const user: VerifiedUser = {
        uid: account.localId,
        email: String(account.email || '').trim().toLowerCase(),
        emailVerified: Boolean(account.emailVerified) || federated,
      };
      // Short-lived cache keeps document previews and polling responsive without re-validating every call
      verifiedTokenCache.set(idToken, { user, expiresAt: Date.now() + 60 * 1000 });
      return user;
    }
    return null;
  } catch {
    return null;
  }
}

async function verifyFirebaseIdToken(req: Request): Promise<VerifiedUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return verifyIdTokenString(authHeader.slice(7).trim());
}

// Admin identity mirrors firestore.rules isRealAdmin(): allow-listed UID, or allow-listed + verified email.
const ADMIN_UIDS = (process.env.ZAKA_ADMIN_UIDS || 'Js6QAJWZskfRhInQFlX4fjlZ9Ws1,KCKA8mq7u6Udj5Lp4pIMSqlEgPJ2')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
const ADMIN_EMAILS = (process.env.ZAKA_ADMIN_EMAILS || 'admin@zaka.io')
  .split(',')
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean);

async function isAdminUser(user: VerifiedUser | null): Promise<boolean> {
  if (!user) return false;
  if (ADMIN_UIDS.includes(user.uid)) return true;
  return Boolean(user.emailVerified && user.email && ADMIN_EMAILS.includes(user.email));
}

setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of verifiedTokenCache) {
    if (entry.expiresAt <= now) verifiedTokenCache.delete(token);
  }
}, 5 * 60 * 1000);

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
app.get('/api/auth/check-phone', rateLimit(60000, 10), async (req: Request, res: Response) => {
  try {
    // Called during sign-up, before the user has a session. It is rate limited per IP and only ever
    // answers yes/no - the owning account (uid) is never disclosed.
    const rawPhone = String(req.query.phone || '').trim();
    if (!rawPhone) {
      res.status(400).json({ isRegistered: false, error: 'Phone parameter is required' });
      return;
    }

    const variants = getPhoneVariants(rawPhone);
    await ensureBackendAuthenticated();

    // A signed-in caller is additionally told whether the number is their own (so an interrupted
    // registration can be resumed). Nobody is ever told which other account owns a number.
    const caller = await verifyFirebaseIdToken(req);

    // 1. Check phoneIndex collection for all canonical variants
    for (const v of variants) {
      try {
        const pSnap = await getDoc(doc(db, 'phoneIndex', v));
        if (pSnap.exists()) {
          const data = pSnap.data();
          if (data?.uid) {
            res.json({ isRegistered: true, ownedByCaller: Boolean(caller && caller.uid === data.uid) });
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
          res.json({ isRegistered: true, ownedByCaller: Boolean(caller && caller.uid === uid) });
          return;
        }
      } catch (colErr) {
        console.warn(`[ZAKA Server] Warning querying ${colName} by phone:`, colErr);
      }
    }

    res.json({ isRegistered: false });
  } catch (err: any) {
    console.error('[ZAKA Server] check-phone error:', err);
    res.json({ isRegistered: false });
  }
});

// 3. Driver Verification Document Upload Endpoint (Resilient, High-Performance Storage)
app.post('/api/driver/upload-document', rateLimit(60000, 5), async (req: Request, res: Response) => {
  try {
    // Verify the caller is authenticated and is the driver uploading their own documents
    const tokenUser = await verifyFirebaseIdToken(req);
    const { driverId, documentType, fileName, fileType, fileData } = req.body;

    if (!tokenUser) {
      res.status(401).json({ success: false, error: 'Authentication required. Provide a valid Firebase ID token.' });
      return;
    }

    if (tokenUser.uid !== driverId) {
      res.status(403).json({ success: false, error: 'You can only upload documents for your own driver profile.' });
      return;
    }

    if (!driverId || !documentType || !fileName || !fileData || typeof fileName !== 'string' || typeof fileData !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Missing required upload parameters (driverId, documentType, fileName, fileData)',
      });
      return;
    }

    // documentType becomes part of the stored file name, so only the known types are accepted
    const allowedDocumentTypes = [
      'drivers-license',
      'prdp',
      'vehicle-registration',
      'vehicle-inspection',
      'profile-photo',
      'operating-license',
    ];
    if (!allowedDocumentTypes.includes(documentType)) {
      res.status(400).json({ success: false, error: 'Unknown document type.' });
      return;
    }

    // Permitted file types: the extension AND (when supplied) the declared MIME type must both be allowed
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    const cleanType = fileType || (fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    const ext = (path.extname(fileName) || (cleanType === 'application/pdf' ? '.pdf' : '.jpg')).toLowerCase();
    const validExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];

    if (!allowedMimes.includes(cleanType) || !validExtensions.includes(ext)) {
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

    // The content must really be what the extension claims (blocks disguised HTML / scripts)
    const head = fileBuffer.subarray(0, 12);
    const looksLikePdf = head.subarray(0, 4).toString('latin1') === '%PDF';
    const looksLikePng = head[0] === 0x89 && head.subarray(1, 4).toString('latin1') === 'PNG';
    const looksLikeJpeg = head[0] === 0xff && head[1] === 0xd8;
    const looksLikeWebp = head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP';
    const contentMatches =
      (ext === '.pdf' && looksLikePdf) ||
      (ext === '.png' && looksLikePng) ||
      ((ext === '.jpg' || ext === '.jpeg') && looksLikeJpeg) ||
      (ext === '.webp' && looksLikeWebp);
    if (fileBuffer.length > 0 && !contentMatches) {
      res.status(400).json({ success: false, error: 'The file content does not match its type. Please upload a real PDF, JPG, PNG or WEBP.' });
      return;
    }

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
    res.status(500).json({ success: false, error: 'Internal server upload error' });
  }
});

// ============================================================================
// POPIA: DATA EXPORT, ERASURE AND RETENTION
// ============================================================================

async function listDocs(q: any): Promise<Array<Record<string, any>>> {
  try {
    const snap = await getDocs(q);
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
  } catch (err: any) {
    console.warn('[ZAKA Server] Query note:', err?.message);
    return [];
  }
}

// 3a. POPIA Data Export — authenticated user can download their own personal data,
// including the full location history ZAKA holds about them.
app.get('/api/user/data-export', rateLimit(3600000, 5), async (req: Request, res: Response) => {
  try {
    const tokenUser = await verifyFirebaseIdToken(req);
    if (!tokenUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const uid = tokenUser.uid;
    await ensureBackendAuthenticated();

    const exportData: Record<string, any> = {
      exportedAt: new Date().toISOString(),
      userId: uid,
      notice:
        'This file contains the personal information ZAKA holds about you (POPIA section 23 access request). Contact details of other riders and drivers are excluded.',
    };

    const readDoc = async (key: string, ref: any) => {
      try {
        const snap = await getDoc(ref);
        if (snap.exists()) exportData[key] = snap.data();
      } catch {}
    };

    await readDoc('userProfile', doc(db, 'users', uid));
    await readDoc('passengerProfile', doc(db, 'passengers', uid));
    await readDoc('driverProfile', doc(db, 'drivers', uid));
    await readDoc('vehicle', doc(db, 'vehicles', uid));

    // Rides (as passenger or driver). The other party's phone number is not the requester's data.
    const asPassenger = await listDocs(query(collection(db, 'rides'), where('passengerId', '==', uid), limit(1000)));
    const asDriver = await listDocs(query(collection(db, 'rides'), where('driverId', '==', uid), limit(1000)));
    const rides: any[] = [];
    for (const r of asPassenger) {
      const { driverPhone, enteredPin, ...rest } = r;
      rides.push({ ...rest, exportedAs: 'passenger' });
    }
    for (const r of asDriver) {
      if (rides.find((x) => x.id === r.id)) continue;
      const { passengerPhone, enteredPin, otp, ...rest } = r;
      rides.push({ ...rest, exportedAs: 'driver' });
    }
    exportData.rides = rides;

    // Location history: every place and position ZAKA has stored for this user
    const recentDestinations = await listDocs(collection(db, 'users', uid, 'recentDestinations'));
    exportData.recentDestinations = recentDestinations;
    const locationHistory: any[] = [];
    if (exportData.userProfile?.currentLocation) {
      locationHistory.push({ source: 'last_known_passenger_location', ...exportData.userProfile.currentLocation });
    }
    if (exportData.driverProfile?.currentLocation) {
      locationHistory.push({ source: 'last_known_driver_location', ...exportData.driverProfile.currentLocation });
    }
    for (const r of rides) {
      if (r.pickupLocation) {
        locationHistory.push({
          source: 'ride_pickup',
          rideId: r.id,
          address: r.pickupAddress || '',
          ...r.pickupLocation,
          recordedAt: r.requestedAt || r.createdAt || null,
        });
      }
      if (r.destinationLocation) {
        locationHistory.push({
          source: 'ride_destination',
          rideId: r.id,
          address: r.destinationAddress || '',
          ...r.destinationLocation,
          recordedAt: r.completedAt || r.requestedAt || r.createdAt || null,
        });
      }
      if (r.exportedAs === 'driver' && r.driverCurrentLocation) {
        locationHistory.push({ source: 'ride_driver_position', rideId: r.id, ...r.driverCurrentLocation });
      }
    }
    for (const d of recentDestinations) {
      locationHistory.push({
        source: 'recent_destination',
        address: d.address || '',
        latitude: d.latitude,
        longitude: d.longitude,
        recordedAt: d.lastUsedAt || d.createdAt || null,
      });
    }
    exportData.locationHistory = locationHistory;

    // Payments
    const payments = await listDocs(query(collection(db, 'payments'), where('passengerId', '==', uid), limit(1000)));
    for (const p of await listDocs(query(collection(db, 'payments'), where('driverId', '==', uid), limit(1000)))) {
      if (!payments.find((x) => x.id === p.id)) payments.push(p);
    }
    exportData.payments = payments;
    exportData.walletTransactions = await listDocs(
      query(collection(db, 'wallet_transactions'), where('userId', '==', uid), limit(1000))
    );

    // Ratings given, and ratings received (without the identity of the person who wrote them)
    exportData.ratingsGiven = await listDocs(query(collection(db, 'ratings'), where('fromUserId', '==', uid), limit(1000)));
    exportData.ratingsReceived = (
      await listDocs(query(collection(db, 'ratings'), where('toUserId', '==', uid), limit(1000)))
    ).map((r) => ({ rideId: r.rideId, rating: r.rating, comment: r.comment || '', createdAt: r.createdAt }));

    exportData.notifications = await listDocs(query(collection(db, 'notifications'), where('userId', '==', uid), limit(1000)));
    exportData.incidents = await listDocs(query(collection(db, 'incidents'), where('reportedBy', '==', uid), limit(500)));
    exportData.supportTickets = await listDocs(query(collection(db, 'support'), where('userId', '==', uid), limit(500)));
    exportData.driverDocuments = await listDocs(collection(db, 'drivers', uid, 'documents'));

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="zaka-data-export-${uid}.json"`);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (err: any) {
    console.error('[ZAKA Server] Data export error:', err);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const ACTIVE_RIDE_STATUSES = ['searching', 'accepted', 'driver_arriving', 'driver_arrived', 'in_progress'];

/**
 * Erases the personal data held for one account. Completed ride and payment records are kept
 * (statutory financial records) but stripped of anything that identifies the person.
 */
async function purgeUserData(uid: string): Promise<void> {
  if (!SAFE_ID_PATTERN.test(uid)) return;
  const removeAll = async (q: any) => {
    try {
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        try { await deleteDoc(d.ref); } catch {}
      }
    } catch (err: any) {
      console.warn('[POPIA] Purge query note:', err?.message);
    }
  };

  await removeAll(query(collection(db, 'notifications'), where('userId', '==', uid), limit(500)));
  await removeAll(collection(db, 'users', uid, 'recentDestinations'));
  await removeAll(query(collection(db, 'phoneIndex'), where('uid', '==', uid), limit(20)));
  await removeAll(collection(db, 'drivers', uid, 'documents'));
  await removeAll(collection(db, 'driverCompliance', uid, 'documents'));
  await removeAll(query(collection(db, 'driver_document_contents'), where('driverId', '==', uid), limit(50)));

  // Uploaded verification files stored on this server
  try {
    fs.rmSync(path.join(UPLOADS_DIR, 'drivers', uid), { recursive: true, force: true });
  } catch {}

  // Rides: remove identifying details, keep the financial record
  const nowIso = new Date().toISOString();
  for (const r of await listDocs(query(collection(db, 'rides'), where('passengerId', '==', uid), limit(1000)))) {
    try {
      await updateDoc(doc(db, 'rides', r.id), {
        passengerName: 'Deleted user',
        passengerPhone: deleteField(),
        passengerPhotoURL: deleteField(),
        updatedAt: nowIso,
      });
      await deleteDoc(doc(db, 'rides', r.id, 'private', 'pin'));
    } catch {}
  }
  for (const r of await listDocs(query(collection(db, 'rides'), where('driverId', '==', uid), limit(1000)))) {
    try {
      await updateDoc(doc(db, 'rides', r.id), {
        driverName: 'Deleted driver',
        driverPhone: deleteField(),
        driverPhotoURL: deleteField(),
        driverCurrentLocation: deleteField(),
        updatedAt: nowIso,
      });
    } catch {}
  }

  for (const ref of [
    doc(db, 'driverCompliance', uid),
    doc(db, 'vehicles', uid),
    doc(db, 'drivers', uid),
    doc(db, 'passengers', uid),
    doc(db, 'users', uid),
  ]) {
    try { await deleteDoc(ref); } catch {}
  }
}

// 3a-2. POPIA Erasure — called by the app immediately before the Firebase Auth account is deleted
app.post('/api/user/delete-data', rateLimit(3600000, 5), async (req: Request, res: Response) => {
  try {
    const tokenUser = await verifyFirebaseIdToken(req);
    if (!tokenUser) {
      res.status(401).json({ success: false, error: 'Authentication required.' });
      return;
    }
    await ensureBackendAuthenticated();
    const uid = tokenUser.uid;

    // An account cannot disappear in the middle of a trip
    const mine = [
      ...(await listDocs(query(collection(db, 'rides'), where('passengerId', '==', uid), limit(1000)))),
      ...(await listDocs(query(collection(db, 'rides'), where('driverId', '==', uid), limit(1000)))),
    ];
    if (mine.some((r) => ACTIVE_RIDE_STATUSES.includes(r.status))) {
      res.status(409).json({
        success: false,
        error: 'You have a ride in progress. Please complete or cancel it before deleting your account.',
      });
      return;
    }

    await purgeUserData(uid);

    try {
      await setDoc(doc(collection(db, 'audit_logs')), {
        adminId: 'system',
        adminEmail: 'system',
        action: 'USER_DATA_ERASURE',
        targetId: uid,
        targetType: 'user',
        details: 'Account holder requested deletion. Personal data erased; financial records retained in redacted form.',
        timestamp: new Date().toISOString(),
      });
    } catch {}

    res.json({ success: true });
  } catch (err: any) {
    console.error('[ZAKA Server] Data erasure error:', err);
    res.status(500).json({ success: false, error: 'Failed to erase account data' });
  }
});

// ---------------------------------------------------------------------------
// Data retention policy (all periods configurable through environment variables)
//  - Notifications ............................ deleted after POPIA_NOTIFICATION_RETENTION_DAYS (90)
//  - Last known passenger location ............ removed after POPIA_LOCATION_RETENTION_DAYS (30)
//  - Finished rides ........................... addresses, exact coordinates and phone numbers
//                                               removed after POPIA_RETENTION_DAYS (365); fare and
//                                               payment figures are kept as financial records
//  - Guest / demo sessions and sign-ups that
//    were never verified ...................... deleted after POPIA_GUEST_RETENTION_DAYS (30)
// ---------------------------------------------------------------------------
const POPIA_RETENTION_DAYS = Math.max(30, Number(process.env.POPIA_RETENTION_DAYS) || 365);
const POPIA_NOTIFICATION_RETENTION_DAYS = Math.max(7, Number(process.env.POPIA_NOTIFICATION_RETENTION_DAYS) || 90);
const POPIA_LOCATION_RETENTION_DAYS = Math.max(1, Number(process.env.POPIA_LOCATION_RETENTION_DAYS) || 30);
const POPIA_GUEST_RETENTION_DAYS = Math.max(1, Number(process.env.POPIA_GUEST_RETENTION_DAYS) || 30);
const DAY_MS = 24 * 60 * 60 * 1000;
const REDACTED_ADDRESS = 'Removed (data retention policy)';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

let popiaRetentionRunning = false;

async function runPopiaRetention(triggeredBy: string, overrideRetentionDays?: number) {
  const stats = {
    notificationsDeleted: 0,
    ridesAnonymised: 0,
    locationsCleared: 0,
    demoUsersDeleted: 0,
    demoRidesDeleted: 0,
    unverifiedSignupsDeleted: 0,
  };
  if (popiaRetentionRunning) return { skipped: true, stats };
  popiaRetentionRunning = true;

  const retentionDays = Math.max(30, Number(overrideRetentionDays) || POPIA_RETENTION_DAYS);
  const rideCutoff = isoDaysAgo(retentionDays);
  const guestCutoff = isoDaysAgo(POPIA_GUEST_RETENTION_DAYS);

  try {
    await ensureBackendAuthenticated();

    // 1. Old notifications (read or unread)
    try {
      const snap = await getDocs(
        query(collection(db, 'notifications'), where('createdAt', '<', isoDaysAgo(POPIA_NOTIFICATION_RETENTION_DAYS)), limit(400))
      );
      for (const d of snap.docs) {
        await deleteDoc(d.ref);
        stats.notificationsDeleted++;
      }
    } catch (err: any) {
      console.warn('[POPIA] Notification retention note:', err?.message);
    }

    // 2. Stale last-known passenger locations
    try {
      const snap = await getDocs(
        query(collection(db, 'users'), where('currentLocation.updatedAt', '<', isoDaysAgo(POPIA_LOCATION_RETENTION_DAYS)), limit(300))
      );
      for (const d of snap.docs) {
        await updateDoc(d.ref, { currentLocation: deleteField() });
        stats.locationsCleared++;
      }
    } catch (err: any) {
      console.warn('[POPIA] Location retention note:', err?.message);
    }

    // 3. Finished rides past the retention period: strip location history and contact details.
    //    A cursor is persisted so each run continues where the previous one stopped.
    try {
      const stateRef = doc(db, 'system', 'popia_retention');
      const stateSnap = await getDoc(stateRef);
      let cursor: string = (stateSnap.exists() && stateSnap.data()?.ridesCursor) || '';
      const base = collection(db, 'rides');
      const snap = await getDocs(
        cursor
          ? query(base, orderBy('createdAt'), startAfter(cursor), limit(300))
          : query(base, orderBy('createdAt'), limit(300))
      );
      for (const d of snap.docs) {
        const r: any = d.data();
        if (!r.createdAt || r.createdAt >= rideCutoff) break;
        // Never touch a ride that is still open; stop so it is revisited on a later run
        if (r.status !== 'completed' && r.status !== 'cancelled') break;
        if (!r.anonymizedAt) {
          const coarse = (loc: any) =>
            loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number'
              ? { latitude: Number(loc.latitude.toFixed(2)), longitude: Number(loc.longitude.toFixed(2)) }
              : loc || null;
          await updateDoc(d.ref, {
            pickupAddress: REDACTED_ADDRESS,
            destinationAddress: REDACTED_ADDRESS,
            pickupLocation: coarse(r.pickupLocation),
            destinationLocation: coarse(r.destinationLocation),
            driverCurrentLocation: deleteField(),
            passengerPhone: deleteField(),
            driverPhone: deleteField(),
            emergencyAlert: deleteField(),
            enteredPin: deleteField(),
            otp: deleteField(),
            anonymizedAt: new Date().toISOString(),
          });
          try { await deleteDoc(doc(db, 'rides', d.id, 'private', 'pin')); } catch {}
          stats.ridesAnonymised++;
        }
        cursor = r.createdAt;
      }
      await setDoc(stateRef, { ridesCursor: cursor, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (err: any) {
      console.warn('[POPIA] Ride retention note:', err?.message);
    }

    // 4a. Guest / demo sessions
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('isDemo', '==', true), limit(200)));
      for (const d of snap.docs) {
        const created = d.data().createdAt || d.data().updatedAt || '';
        if (created && created < guestCutoff) {
          await purgeUserData(d.id);
          stats.demoUsersDeleted++;
        }
      }
    } catch (err: any) {
      console.warn('[POPIA] Guest cleanup note:', err?.message);
    }

    // 4b. Rides and payments generated by guest / demo sessions
    try {
      const snap = await getDocs(query(collection(db, 'rides'), where('isDemo', '==', true), limit(300)));
      for (const d of snap.docs) {
        const created = d.data().createdAt || d.data().requestedAt || '';
        if (created && created < guestCutoff) {
          try { await deleteDoc(doc(db, 'rides', d.id, 'private', 'pin')); } catch {}
          try {
            const pay = await getDoc(doc(db, 'payments', d.id));
            if (pay.exists() && pay.data()?.isDemo) await deleteDoc(pay.ref);
          } catch {}
          await deleteDoc(d.ref);
          stats.demoRidesDeleted++;
        }
      }
    } catch (err: any) {
      console.warn('[POPIA] Demo ride cleanup note:', err?.message);
    }

    // 4c. People who started signing up but never verified their email and never used the service
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('emailVerified', '==', false), limit(200)));
      for (const d of snap.docs) {
        const u: any = d.data();
        const created = u.createdAt || '';
        if (!created || created >= guestCutoff) continue;
        if (u.role === 'admin' || u.role === 'driver' || (Array.isArray(u.roles) && u.roles.some((r: string) => r !== 'passenger'))) continue;
        const driverSnap = await getDoc(doc(db, 'drivers', d.id));
        if (driverSnap.exists()) continue;
        const rideSnap = await getDocs(query(collection(db, 'rides'), where('passengerId', '==', d.id), limit(1)));
        if (!rideSnap.empty) continue;
        await purgeUserData(d.id);
        stats.unverifiedSignupsDeleted++;
      }
    } catch (err: any) {
      console.warn('[POPIA] Unverified sign-up cleanup note:', err?.message);
    }

    const total = Object.values(stats).reduce((a, b) => a + b, 0);
    try {
      await setDoc(
        doc(db, 'system', 'popia_retention'),
        { lastRunAt: new Date().toISOString(), lastRunBy: triggeredBy, lastRunStats: stats },
        { merge: true }
      );
      if (total > 0 || triggeredBy !== 'scheduler') {
        await setDoc(doc(collection(db, 'audit_logs')), {
          adminId: triggeredBy,
          adminEmail: triggeredBy === 'scheduler' ? 'system' : triggeredBy,
          action: 'POPIA_DATA_CLEANUP',
          targetId: 'retention',
          targetType: 'system',
          details: `Retention ${retentionDays}d / guest ${POPIA_GUEST_RETENTION_DAYS}d. ${JSON.stringify(stats)}`,
          timestamp: new Date().toISOString(),
        });
      }
    } catch {}

    return { skipped: false, retentionDays, stats };
  } finally {
    popiaRetentionRunning = false;
  }
}

// The retention policy enforces itself: first pass shortly after boot, then once a day.
setTimeout(() => {
  runPopiaRetention('scheduler').catch((err) => console.warn('[POPIA] Scheduled retention failed:', err?.message));
}, 2 * 60 * 1000).unref();
setInterval(() => {
  runPopiaRetention('scheduler').catch((err) => console.warn('[POPIA] Scheduled retention failed:', err?.message));
}, DAY_MS).unref();

// 3b. Manual trigger for the same retention job (Admin only)
app.post('/api/admin/popia-cleanup', rateLimit(3600000, 6), async (req: Request, res: Response) => {
  try {
    const tokenUser = await verifyFirebaseIdToken(req);
    if (!tokenUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!(await isAdminUser(tokenUser))) {
      res.status(403).json({ error: 'Admin access required.' });
      return;
    }
    const result = await runPopiaRetention(tokenUser.uid, Number(req.body?.retentionDays) || undefined);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[ZAKA Server] POPIA cleanup error:', err);
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

// ============================================================================
// DRIVER PRESENCE
// ============================================================================

// 3c. Driver Offline Beacon (last-gasp on tab close / app termination).
// navigator.sendBeacon cannot set headers, so the ID token may also arrive in the JSON body.
// The driver taken offline is ALWAYS the owner of the token - never an id supplied by the caller.
app.post('/api/driver/go-offline', rateLimit(10000, 6), async (req: Request, res: Response) => {
  try {
    const tokenUser =
      (await verifyFirebaseIdToken(req)) || (await verifyIdTokenString(String(req.body?.idToken || '')));
    if (!tokenUser) {
      res.status(401).json({ success: false, error: 'Authentication required.' });
      return;
    }
    await ensureBackendAuthenticated();
    const driverRef = doc(db, 'drivers', tokenUser.uid);
    const driverSnap = await getDoc(driverRef);
    if (!driverSnap.exists()) {
      res.status(404).json({ success: false, error: 'Driver not found' });
      return;
    }
    if (!driverSnap.data()?.online) {
      res.json({ success: true, message: 'Driver already offline' });
      return;
    }
    await updateDoc(driverRef, {
      online: false,
      isOnline: false,
      available: false,
      updatedAt: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err: any) {
    console.warn('[ZAKA Server] Driver go-offline beacon error:', err.message);
    res.status(500).json({ success: false });
  }
});

// Safety net for every case the beacon cannot cover (crash, dead battery, lost signal, killed app):
// the driver app sends a heartbeat while online, and any driver whose heartbeat stops is taken offline.
const DRIVER_HEARTBEAT_TIMEOUT_MS = Math.max(60000, Number(process.env.DRIVER_HEARTBEAT_TIMEOUT_MS) || 3 * 60 * 1000);

async function sweepStaleDrivers(): Promise<void> {
  try {
    await ensureBackendAuthenticated();
    const snap = await getDocs(query(collection(db, 'drivers'), where('online', '==', true), limit(300)));
    const now = Date.now();
    for (const d of snap.docs) {
      const data: any = d.data();
      if (data.isDemo) continue;
      const lastSeen = Math.max(
        Number(data.currentLocation?.timestamp) || 0,
        Date.parse(data.lastSeenAt || '') || 0,
        Date.parse(data.updatedAt || '') || 0
      );
      if (now - lastSeen > DRIVER_HEARTBEAT_TIMEOUT_MS) {
        await updateDoc(d.ref, {
          online: false,
          isOnline: false,
          available: false,
          offlineReason: 'heartbeat_timeout',
          updatedAt: new Date().toISOString(),
        });
        console.log(`[ZAKA Server] Driver ${d.id} marked offline (no heartbeat).`);
      }
    }
  } catch (err: any) {
    console.warn('[ZAKA Server] Stale driver sweep note:', err?.message);
  }
}
setInterval(sweepStaleDrivers, 60 * 1000).unref();

// ============================================================================
// FARES, PAYMENTS AND WALLET
// ============================================================================

const PLATFORM_COMMISSION_PERCENT = 15;

function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function splitFare(amount: number): { platformCommission: number; driverEarnings: number } {
  const platformCommission = Math.round(amount * PLATFORM_COMMISSION_PERCENT) / 100;
  return { platformCommission, driverEarnings: round2(amount - platformCommission) };
}

// Launch tariffs, used only when the Admin has not yet saved a tariff in /pricing
const DEFAULT_PRICING: Record<string, { baseFare: number; perKmRate: number; perMinuteRate: number; minimumFare: number }> = {
  economy: { baseFare: 25.0, perKmRate: 10.5, perMinuteRate: 1.5, minimumFare: 35.0 },
  comfort: { baseFare: 35.0, perKmRate: 14.0, perMinuteRate: 2.0, minimumFare: 50.0 },
  xl: { baseFare: 45.0, perKmRate: 18.0, perMinuteRate: 2.5, minimumFare: 70.0 },
  moto: { baseFare: 15.0, perKmRate: 7.0, perMinuteRate: 1.0, minimumFare: 22.0 },
};

function haversineKm(a: any, b: any): number {
  if (!a || !b || typeof a.latitude !== 'number' || typeof b.latitude !== 'number') return 0;
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * The amount ZAKA will actually charge for a ride.
 * The passenger is charged the fare they were quoted (it is locked on the ride by the security
 * rules the moment the ride is requested). The quote is cross-checked against the Admin tariff:
 * a road route can never be shorter than the straight line between pickup and destination, so a
 * quote below the tariff for that straight line is impossible for an honest client and is
 * replaced by the full tariff calculation.
 */
async function computeAuthoritativeFare(ride: any): Promise<{ amount: number; adjusted: boolean }> {
  const rideType = DEFAULT_PRICING[ride.rideType] ? ride.rideType : 'economy';
  let pricing = DEFAULT_PRICING[rideType];
  try {
    const snap = await getDoc(doc(db, 'pricing', rideType));
    if (snap.exists()) {
      const p: any = snap.data();
      pricing = {
        baseFare: Number(p.baseFare) >= 0 ? Number(p.baseFare) : pricing.baseFare,
        perKmRate: Number(p.perKmRate) >= 0 ? Number(p.perKmRate) : pricing.perKmRate,
        perMinuteRate: Number(p.perMinuteRate) >= 0 ? Number(p.perMinuteRate) : pricing.perMinuteRate,
        minimumFare: Number(p.minimumFare) >= 0 ? Number(p.minimumFare) : pricing.minimumFare,
      };
    }
  } catch {}

  const straightKm = haversineKm(ride.pickupLocation, ride.destinationLocation);
  const claimedKm = Math.max(0, Number(ride.estimatedDistanceKm ?? ride.distanceKm) || 0);
  const minutes = Math.max(0, Number(ride.estimatedDurationMin ?? ride.estimatedDurationMinutes) || 0);

  const tariff = (km: number, mins: number) =>
    Math.max(pricing.minimumFare, round2(pricing.baseFare + km * pricing.perKmRate + mins * pricing.perMinuteRate));

  const quoted = round2(Number(ride.estimatedFare) || 0);
  // 2% tolerance absorbs rounding differences between client and server arithmetic
  const lowestPossible = tariff(straightKm, 0) * 0.98;
  if (quoted > 0 && quoted >= lowestPossible) {
    return { amount: quoted, adjusted: false };
  }
  return { amount: tariff(Math.max(claimedKm, straightKm), minutes), adjusted: true };
}

async function resolvePaymentRef(rideId: string): Promise<{ ref: any; id: string; data: any | null }> {
  // Canonical location is /payments/{rideId} (one payment per ride); older records used generated ids
  const direct = doc(db, 'payments', rideId);
  const snap = await getDoc(direct);
  if (snap.exists()) return { ref: direct, id: rideId, data: snap.data() };
  const legacy = await getDocs(query(collection(db, 'payments'), where('rideId', '==', rideId), limit(1)));
  if (!legacy.empty) return { ref: legacy.docs[0].ref, id: legacy.docs[0].id, data: legacy.docs[0].data() };
  return { ref: direct, id: rideId, data: null };
}

async function pushNotification(userId: string, title: string, message: string, type: string = 'payment') {
  if (!userId) return;
  try {
    await setDoc(doc(collection(db, 'notifications')), {
      userId,
      title,
      message,
      type,
      read: false,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[ZAKA Server] Notification dispatch warning:', err);
  }
}

/**
 * Server-side settlement of a completed ride. Writes the trusted payment record
 * (amount, 15% commission, 85% driver earnings) and, for wallet rides, debits the passenger.
 * Safe to call repeatedly: a ride is only ever charged once.
 */
async function settleRide(rideId: string, ride: any): Promise<Record<string, any>> {
  const rideRef = doc(db, 'rides', rideId);
  const existing = await resolvePaymentRef(rideId);
  const nowIso = new Date().toISOString();
  const method: string = ride.paymentMethod || 'cash';

  if (existing.data?.paymentStatus === 'paid') {
    if (ride.paymentStatus !== 'paid') {
      await updateDoc(rideRef, { paymentStatus: 'paid', updatedAt: nowIso });
    }
    return { paymentStatus: 'paid', amount: existing.data.amount, paymentMethod: existing.data.paymentMethod, paymentId: existing.id };
  }

  // The fare is decided once; later calls reuse it
  let amount: number;
  let adjusted = false;
  if (existing.data?.settledByServer && Number(existing.data.amount) > 0) {
    amount = Number(existing.data.amount);
  } else {
    const fare = await computeAuthoritativeFare(ride);
    amount = fare.amount;
    adjusted = fare.adjusted;
  }
  const { platformCommission, driverEarnings } = splitFare(amount);
  const firstSettlement = !existing.data?.settledByServer;

  const record: Record<string, any> = {
    id: existing.id,
    paymentId: existing.data?.paymentId || `PAY-${Date.now().toString(36).toUpperCase()}`,
    rideId,
    passengerId: ride.passengerId,
    driverId: ride.driverId || '',
    amount,
    currency: 'ZAR',
    paymentMethod: method,
    platformCommission,
    platformFee: platformCommission,
    driverEarnings,
    provider: method === 'cash' ? 'cash' : method === 'wallet' ? 'zaka-wallet' : 'peach',
    transactionReference: existing.data?.transactionReference || `ZAK-${Date.now().toString(36).toUpperCase()}`,
    isDemo: Boolean(ride.isDemo),
    settledByServer: true,
    createdAt: existing.data?.createdAt || nowIso,
    updatedAt: nowIso,
  };

  let paymentStatus = 'pending';
  let code: string | undefined;

  if (ride.isDemo && method !== 'cash') {
    // Demo rides never move real money
    await setDoc(existing.ref, { ...record, paymentStatus: 'paid', paidAt: nowIso, simulated: true, failureReason: null }, { merge: true });
    await updateDoc(rideRef, { finalFare: amount, paymentStatus: 'paid', updatedAt: nowIso });
    paymentStatus = 'paid';
  } else if (method === 'wallet') {
    const passengerRef = doc(db, 'passengers', ride.passengerId);
    await runTransaction(db, async (tx) => {
      const passengerSnap = await tx.get(passengerRef);
      const paySnap = await tx.get(existing.ref);
      if (paySnap.exists() && (paySnap.data() as any).paymentStatus === 'paid') {
        paymentStatus = 'paid';
        return;
      }
      const passenger: any = passengerSnap.exists() ? passengerSnap.data() : null;
      const balance = round2(Number(passenger?.walletBalance) || 0);
      if (!passenger || passenger.isDemo || balance < amount) {
        code = 'INSUFFICIENT_WALLET_BALANCE';
        tx.set(existing.ref, { ...record, paymentStatus: 'pending', paidAt: null, failureReason: code }, { merge: true });
        tx.update(rideRef, { finalFare: amount, updatedAt: nowIso });
        return;
      }
      const balanceAfter = round2(balance - amount);
      tx.update(passengerRef, { walletBalance: balanceAfter, updatedAt: nowIso });
      tx.set(doc(db, 'wallet_transactions', `RIDE-${rideId}`), {
        userId: ride.passengerId,
        type: 'ride_payment',
        direction: 'debit',
        amount,
        currency: 'ZAR',
        rideId,
        status: 'completed',
        balanceAfter,
        description: `Trip to ${ride.destinationAddress || 'destination'}`,
        createdAt: nowIso,
        completedAt: nowIso,
      });
      tx.set(existing.ref, { ...record, paymentStatus: 'paid', paidAt: nowIso, failureReason: null }, { merge: true });
      tx.update(rideRef, { finalFare: amount, paymentStatus: 'paid', updatedAt: nowIso });
      paymentStatus = 'paid';
    });
    if (paymentStatus === 'paid' && !code) {
      await pushNotification(ride.passengerId, 'Paid from ZAKA Wallet ✓', `R${amount.toFixed(2)} was paid from your wallet. Thank you for riding with ZAKA!`);
      await pushNotification(ride.driverId, 'Payment Confirmed', `Wallet payment of R${amount.toFixed(2)} confirmed. Your earnings: R${driverEarnings.toFixed(2)}.`);
    } else if (code) {
      await pushNotification(
        ride.passengerId,
        'Wallet balance too low',
        `Your wallet could not cover the R${amount.toFixed(2)} fare. Please top up or pay your driver in cash.`
      );
    }
  } else {
    // Cash: confirmed by the driver. Card / digital: confirmed by Peach (verify endpoint or webhook).
    await setDoc(
      existing.ref,
      { ...record, paymentStatus: existing.data?.paymentStatus || 'pending', paidAt: existing.data?.paidAt || null },
      { merge: true }
    );
    await updateDoc(rideRef, { finalFare: amount, updatedAt: nowIso });
  }

  if (adjusted) {
    await updateDoc(rideRef, { fareAdjustedByServer: true });
    console.warn(`[ZAKA Server] Ride ${rideId}: quoted fare was below tariff and has been corrected to R${amount.toFixed(2)}.`);
  }

  // Lifetime earnings figure on the driver profile is maintained here, once per ride
  if (firstSettlement && ride.driverId && !ride.isDemo) {
    try {
      const driverRef = doc(db, 'drivers', ride.driverId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(driverRef);
        if (!snap.exists()) return;
        tx.update(driverRef, { totalEarnings: round2((Number((snap.data() as any).totalEarnings) || 0) + driverEarnings) });
      });
    } catch (err: any) {
      console.warn('[ZAKA Server] Driver earnings aggregate note:', err?.message);
    }
  }

  return { paymentStatus, amount, platformCommission, driverEarnings, paymentMethod: method, paymentId: existing.id, code };
}

// 3d. Ride settlement — called by the driver app when a trip ends (and by the passenger app as a fallback)
app.post('/api/rides/settle', rateLimit(60000, 30), async (req: Request, res: Response) => {
  try {
    const tokenUser = await verifyFirebaseIdToken(req);
    if (!tokenUser) {
      res.status(401).json({ success: false, error: 'Authentication required.' });
      return;
    }
    const { rideId } = req.body || {};
    if (!rideId || typeof rideId !== 'string' || !SAFE_ID_PATTERN.test(rideId)) {
      res.status(400).json({ success: false, error: 'rideId is required' });
      return;
    }
    await ensureBackendAuthenticated();
    const rideSnap = await getDoc(doc(db, 'rides', rideId));
    if (!rideSnap.exists()) {
      res.status(404).json({ success: false, error: 'Ride not found' });
      return;
    }
    const ride: any = rideSnap.data();
    if (tokenUser.uid !== ride.passengerId && tokenUser.uid !== ride.driverId && !(await isAdminUser(tokenUser))) {
      res.status(403).json({ success: false, error: 'You are not a participant of this ride.' });
      return;
    }
    if (ride.status !== 'completed') {
      res.status(400).json({ success: false, error: `Ride is not completed (status: ${ride.status}).` });
      return;
    }
    const result = await settleRide(rideId, ride);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[ZAKA Server] /api/rides/settle error:', err);
    res.status(500).json({ success: false, error: 'Settlement failed' });
  }
});

// 3e. Public Gateway Configuration (NO SECRETS EXPOSED)
app.get('/api/payments/config', (_req: Request, res: Response) => {
  const peach = getPeachConfig();
  res.json({
    provider: 'peach',
    env: peach.env,
    isConfigured: peach.isConfigured,
    currency: 'ZAR',
    commissionSplit: {
      driverPercent: 100 - PLATFORM_COMMISSION_PERCENT,
      platformPercent: PLATFORM_COMMISSION_PERCENT,
    },
    message: peach.isConfigured
      ? `Peach Payments active in ${peach.env.toUpperCase()} mode.`
      : 'Card payments are not available yet. Please pay with cash or your ZAKA wallet.',
  });
});

// ---------------------------------------------------------------------------
// Peach Payments helpers
// ---------------------------------------------------------------------------
const PEACH_SUCCESS_PATTERN = /^(000\.000\.|000\.100\.1|000\.[36]|000\.400\.0[^3]|000\.400\.100)/;

function publicBaseUrl(req: Request): string {
  if (process.env.APP_PUBLIC_URL) return process.env.APP_PUBLIC_URL.replace(/\/+$/, '');
  const host = req.get('host') || `localhost:${PORT}`;
  return `${req.protocol === 'https' ? 'https' : 'http'}://${host}`;
}

function newMerchantTransactionId(prefix: string, seed: string): string {
  // Peach merchantTransactionId: 8-16 alphanumeric characters
  const short = seed.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
  return `${prefix}${short}${crypto.randomBytes(4).toString('hex').toUpperCase()}`.slice(0, 16);
}

async function createPeachCheckout(params: {
  amount: number;
  merchantTransactionId: string;
  shopperResultUrl: string;
}): Promise<{ ok: boolean; redirectUrl?: string; checkoutId?: string; details?: string }> {
  const peach = getPeachConfig();
  const checkoutParams: Record<string, string> = {
    'authentication.entityId': peach.entityId,
    amount: params.amount.toFixed(2),
    currency: 'ZAR',
    merchantTransactionId: params.merchantTransactionId,
    nonce: crypto.randomUUID(),
    paymentType: 'DB',
    shopperResultUrl: params.shopperResultUrl,
  };
  checkoutParams['signature'] = calculatePeachSignature(checkoutParams, peach.secretToken);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const accessToken = await getPeachAccessToken();
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const response = await fetch(`${peach.baseUrl}/v2/checkout`, {
    method: 'POST',
    headers,
    body: JSON.stringify(checkoutParams),
    signal: AbortSignal.timeout(20000),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || (!data.redirectUrl && !data.id)) {
    console.warn('[ZAKA Server] Peach checkout response error:', data);
    return { ok: false, details: data?.result?.description || data?.message || 'Gateway rejected checkout request' };
  }
  return { ok: true, redirectUrl: data.redirectUrl, checkoutId: data.id || data.checkoutId };
}

async function fetchPeachCheckoutStatus(checkoutId: string): Promise<{
  isSuccess: boolean;
  resultCode: string;
  description: string;
  providerId: string;
  amount: number | null;
  merchantTransactionId: string;
}> {
  const peach = getPeachConfig();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const accessToken = await getPeachAccessToken();
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  const url = `${peach.baseUrl}/v2/checkout/${encodeURIComponent(checkoutId)}?entityId=${encodeURIComponent(peach.entityId)}`;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  const data: any = await response.json().catch(() => ({}));
  const resultCode = data?.result?.code || '';
  return {
    isSuccess: PEACH_SUCCESS_PATTERN.test(resultCode),
    resultCode,
    description: data?.result?.description || '',
    providerId: data?.id || data?.registrationId || checkoutId,
    amount: data?.amount !== undefined && data?.amount !== null && !isNaN(Number(data.amount)) ? Number(data.amount) : null,
    merchantTransactionId: data?.merchantTransactionId || '',
  };
}

/** A gateway confirmation only counts if it is for the transaction and amount we created. */
function gatewayResultMatches(
  expected: { amount: number; merchantTransactionId?: string },
  actual: { amount: number | null; merchantTransactionId: string }
): boolean {
  if (actual.merchantTransactionId && expected.merchantTransactionId && actual.merchantTransactionId !== expected.merchantTransactionId) {
    return false;
  }
  if (actual.amount !== null && Math.abs(actual.amount - Number(expected.amount)) > 0.009) {
    return false;
  }
  return true;
}

/** Marks a card payment and its ride as paid exactly once. Returns true only on the first confirmation. */
async function finalizeRidePayment(paymentRef: any, providerTransactionId: string): Promise<boolean> {
  const nowIso = new Date().toISOString();
  let transitioned = false;
  let payment: any = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(paymentRef);
    if (!snap.exists()) return;
    payment = snap.data();
    if (payment.paymentStatus === 'paid') return;
    tx.update(paymentRef, {
      paymentStatus: 'paid',
      paidAt: nowIso,
      updatedAt: nowIso,
      failureReason: null,
      providerTransactionId: providerTransactionId || payment.peachCheckoutId || '',
    });
    tx.update(doc(db, 'rides', payment.rideId), { paymentStatus: 'paid', updatedAt: nowIso });
    transitioned = true;
  });
  if (transitioned && payment) {
    const amount = Number(payment.amount) || 0;
    const earnings = Number(payment.driverEarnings) || splitFare(amount).driverEarnings;
    await pushNotification(payment.passengerId, 'Payment Successful ✓', `Payment of R${amount.toFixed(2)} confirmed via Peach Payments. Thank you for riding with ZAKA!`);
    await pushNotification(payment.driverId, 'Payment Confirmed', `Payment of R${amount.toFixed(2)} confirmed. Your earnings: R${earnings.toFixed(2)}.`);
  }
  return transitioned;
}

/** Credits a confirmed top-up to the passenger's wallet exactly once. */
async function creditWalletTopup(transactionId: string, providerTransactionId: string): Promise<boolean> {
  const txRef = doc(db, 'wallet_transactions', transactionId);
  const nowIso = new Date().toISOString();
  let credited = false;
  let info: any = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(txRef);
    if (!snap.exists()) return;
    info = snap.data();
    if (info.type !== 'topup' || info.status === 'completed') return;
    const passengerRef = doc(db, 'passengers', info.userId);
    const passengerSnap = await tx.get(passengerRef);
    const balance = round2(Number(passengerSnap.exists() ? (passengerSnap.data() as any).walletBalance : 0) || 0);
    const balanceAfter = round2(balance + Number(info.amount));
    tx.set(passengerRef, { userId: info.userId, walletBalance: balanceAfter, updatedAt: nowIso }, { merge: true });
    tx.update(txRef, { status: 'completed', completedAt: nowIso, balanceAfter, providerTransactionId: providerTransactionId || '' });
    credited = true;
  });
  if (credited && info) {
    await pushNotification(info.userId, 'Wallet Topped Up ✓', `R${Number(info.amount).toFixed(2)} has been added to your ZAKA wallet.`);
  }
  return credited;
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------
const WALLET_TOPUP_MIN = 20;
const WALLET_TOPUP_MAX = 5000;

// 3f. Start a wallet top-up through Peach Hosted Checkout
app.post('/api/wallet/topup/initiate', rateLimit(60000, 6), async (req: Request, res: Response) => {
  try {
    const tokenUser = await verifyFirebaseIdToken(req);
    if (!tokenUser) {
      res.status(401).json({ success: false, error: 'Authentication required.' });
      return;
    }
    if (!tokenUser.emailVerified) {
      res.status(403).json({ success: false, error: 'Please verify your email address before adding funds.' });
      return;
    }
    const amount = round2(Number(req.body?.amount));
    if (!amount || amount < WALLET_TOPUP_MIN || amount > WALLET_TOPUP_MAX) {
      res.status(400).json({ success: false, error: `Top-up amount must be between R${WALLET_TOPUP_MIN} and R${WALLET_TOPUP_MAX}.` });
      return;
    }

    const peach = getPeachConfig();
    if (!peach.isConfigured) {
      res.json({
        success: false,
        code: 'PEACH_CREDENTIALS_REQUIRED',
        message: 'Wallet top-ups are not available yet because card payments have not been activated.',
      });
      return;
    }

    await ensureBackendAuthenticated();
    const transactionId = `WTX-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const merchantTransactionId = newMerchantTransactionId('ZW', tokenUser.uid);
    const checkout = await createPeachCheckout({
      amount,
      merchantTransactionId,
      shopperResultUrl: `${publicBaseUrl(req)}/api/payments/peach/return?walletTx=${encodeURIComponent(transactionId)}`,
    });
    if (!checkout.ok) {
      res.status(502).json({ success: false, error: 'Payment gateway communication error', details: checkout.details });
      return;
    }

    await setDoc(doc(db, 'wallet_transactions', transactionId), {
      userId: tokenUser.uid,
      type: 'topup',
      direction: 'credit',
      amount,
      currency: 'ZAR',
      status: 'pending',
      provider: 'peach',
      merchantTransactionId,
      peachCheckoutId: checkout.checkoutId || '',
      description: 'Wallet top-up',
      createdAt: new Date().toISOString(),
    });

    res.json({ success: true, transactionId, redirectUrl: checkout.redirectUrl, amount });
  } catch (err: any) {
    console.error('[ZAKA Server] /api/wallet/topup/initiate error:', err);
    res.status(500).json({ success: false, error: 'Could not start the top-up' });
  }
});

// 3g. Confirm a wallet top-up with Peach (server-to-server) and credit the balance
app.post('/api/wallet/topup/verify', rateLimit(60000, 20), async (req: Request, res: Response) => {
  try {
    const tokenUser = await verifyFirebaseIdToken(req);
    if (!tokenUser) {
      res.status(401).json({ success: false, error: 'Authentication required.' });
      return;
    }
    const transactionId = String(req.body?.transactionId || '');
    if (!SAFE_ID_PATTERN.test(transactionId)) {
      res.status(400).json({ success: false, error: 'transactionId is required' });
      return;
    }
    await ensureBackendAuthenticated();
    const snap = await getDoc(doc(db, 'wallet_transactions', transactionId));
    if (!snap.exists() || snap.data().userId !== tokenUser.uid || snap.data().type !== 'topup') {
      res.status(404).json({ success: false, error: 'Top-up not found' });
      return;
    }
    const info: any = snap.data();
    if (info.status === 'completed') {
      res.json({ success: true, status: 'completed', amount: info.amount });
      return;
    }
    if (!getPeachConfig().isConfigured || !info.peachCheckoutId) {
      res.json({ success: false, status: info.status, message: 'Awaiting payment confirmation.' });
      return;
    }
    const status = await fetchPeachCheckoutStatus(info.peachCheckoutId);
    if (status.isSuccess && gatewayResultMatches(info, status)) {
      await creditWalletTopup(transactionId, status.providerId);
      res.json({ success: true, status: 'completed', amount: info.amount });
      return;
    }
    res.json({ success: false, status: info.status, resultCode: status.resultCode, message: status.description || 'Payment not completed yet.' });
  } catch (err: any) {
    console.error('[ZAKA Server] /api/wallet/topup/verify error:', err);
    res.status(500).json({ success: false, error: 'Could not verify the top-up' });
  }
});

// ---------------------------------------------------------------------------
// Card payments
// ---------------------------------------------------------------------------

// 3. Initiate Electronic Payment (Peach Hosted Checkout)
app.post('/api/payments/peach/initiate', rateLimit(60000, 10), async (req: Request, res: Response) => {
  try {
    const tokenUser = await verifyFirebaseIdToken(req);
    if (!tokenUser) {
      res.status(401).json({ success: false, error: 'Authentication required.' });
      return;
    }

    const { rideId, paymentMethod = 'card' } = req.body || {};
    if (!rideId || typeof rideId !== 'string' || !SAFE_ID_PATTERN.test(rideId)) {
      res.status(400).json({ success: false, error: 'rideId is required' });
      return;
    }
    const method = paymentMethod === 'digital' ? 'digital' : 'card';

    await ensureBackendAuthenticated();
    const rideRef = doc(db, 'rides', rideId);
    const rideSnap = await getDoc(rideRef);
    if (!rideSnap.exists()) {
      res.status(404).json({ success: false, error: 'Ride not found' });
      return;
    }
    const rideData: any = rideSnap.data();

    // Only the passenger who took the ride can pay for it
    if (tokenUser.uid !== rideData.passengerId) {
      res.status(403).json({ success: false, error: 'You can only initiate payment for your own rides.' });
      return;
    }
    if (rideData.status !== 'completed') {
      res.status(400).json({ success: false, error: `Cannot initiate payment for ride in status: ${rideData.status}` });
      return;
    }

    // Trusted amount and commission split (never taken from the request)
    if (rideData.paymentMethod !== method) {
      await updateDoc(rideRef, { paymentMethod: method, updatedAt: new Date().toISOString() });
    }
    const settled = await settleRide(rideId, { ...rideData, paymentMethod: method });
    const payment = await resolvePaymentRef(rideId);
    const amount = Number(settled.amount);

    if (settled.paymentStatus === 'paid') {
      res.json({
        success: true,
        paymentStatus: 'paid',
        message: 'Payment has already been confirmed and settled.',
        paymentId: payment.id,
        amount,
      });
      return;
    }

    const merchantTransactionId = newMerchantTransactionId('ZK', rideId);
    const peach = getPeachConfig();

    if (!peach.isConfigured) {
      await setDoc(payment.ref, { failureReason: 'PEACH_CREDENTIALS_REQUIRED', updatedAt: new Date().toISOString() }, { merge: true });
      res.json({
        success: false,
        code: 'PEACH_CREDENTIALS_REQUIRED',
        message: 'Card payments are not available yet. Please pay your driver in cash.',
        paymentStatus: 'pending',
        amount,
        paymentId: payment.id,
      });
      return;
    }

    const checkout = await createPeachCheckout({
      amount,
      merchantTransactionId,
      shopperResultUrl: `${publicBaseUrl(req)}/api/payments/peach/return?rideId=${encodeURIComponent(rideId)}`,
    });
    if (!checkout.ok) {
      res.status(502).json({ success: false, error: 'Payment gateway communication error', details: checkout.details });
      return;
    }

    await setDoc(
      payment.ref,
      {
        transactionReference: merchantTransactionId,
        merchantTransactionId,
        peachCheckoutId: checkout.checkoutId || '',
        redirectUrl: checkout.redirectUrl || '',
        failureReason: null,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    res.json({
      success: true,
      paymentStatus: 'pending',
      redirectUrl: checkout.redirectUrl,
      peachCheckoutId: checkout.checkoutId,
      merchantTransactionId,
      amount,
      paymentId: payment.id,
    });
  } catch (err: any) {
    console.error('[ZAKA Server] /api/payments/peach/initiate error:', err);
    res.status(500).json({ success: false, error: 'Could not start the payment' });
  }
});

// 4. Secure Payment Verification (Server-to-Server Confirmation)
app.post('/api/payments/peach/verify', rateLimit(60000, 30), async (req: Request, res: Response) => {
  try {
    const tokenUser = await verifyFirebaseIdToken(req);
    if (!tokenUser) {
      res.status(401).json({ success: false, error: 'Authentication required.' });
      return;
    }

    const { rideId } = req.body || {};
    if (!rideId || typeof rideId !== 'string' || !SAFE_ID_PATTERN.test(rideId)) {
      res.status(400).json({ success: false, error: 'rideId is required' });
      return;
    }

    await ensureBackendAuthenticated();
    const found = await resolvePaymentRef(rideId);
    if (!found.data) {
      res.status(404).json({ success: false, error: 'Payment record not found for ride' });
      return;
    }
    const payment = found.data;

    if (tokenUser.uid !== payment.passengerId && tokenUser.uid !== payment.driverId) {
      res.status(403).json({ success: false, error: 'You can only verify payment for your own rides.' });
      return;
    }

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

    if (!getPeachConfig().isConfigured) {
      res.json({ success: false, paymentStatus: payment.paymentStatus || 'pending', message: 'Card payments are not available yet.' });
      return;
    }

    // Only the checkout this server created for this ride is ever consulted -
    // a checkout id supplied by the caller is ignored so another payment cannot be substituted.
    if (!payment.peachCheckoutId) {
      res.json({ success: false, paymentStatus: 'pending', message: 'Awaiting checkout completion.' });
      return;
    }

    const status = await fetchPeachCheckoutStatus(payment.peachCheckoutId);
    if (status.isSuccess && gatewayResultMatches(payment, status)) {
      await finalizeRidePayment(found.ref, status.providerId);
      res.json({ success: true, paymentStatus: 'paid', paidAt: new Date().toISOString(), amount: payment.amount });
      return;
    }
    if (status.isSuccess) {
      console.error(`[ZAKA Server] Peach confirmation for ride ${rideId} does not match the expected amount/transaction. Not finalised.`);
    }

    res.json({
      success: false,
      paymentStatus: payment.paymentStatus || 'pending',
      resultCode: status.resultCode,
      message: status.description || 'Transaction pending or not completed',
    });
  } catch (err: any) {
    console.error('[ZAKA Server] /api/payments/peach/verify error:', err);
    res.status(500).json({ success: false, error: 'Could not verify the payment' });
  }
});

// 5. Signed Peach Payments Webhook Endpoint
// Implements Peach Payments Webhook Signature specification:
// Headers: x-webhook-timestamp, x-webhook-id, x-webhook-signature, x-webhook-signature-algorithm
// Signature message: timestamp.webhookId.webhookURL.rawRequestBody signed with PEACH_WEBHOOK_SECRET
app.post('/api/payments/peach/webhook', rateLimit(60000, 120), async (req: Request, res: Response) => {
  try {
    const timestamp = req.get('x-webhook-timestamp') || '';
    const webhookId = req.get('x-webhook-id') || '';
    const receivedSignature = req.get('x-webhook-signature') || req.get('x-signature') || '';
    const rawRequestBody = (req as any).rawBody || JSON.stringify(req.body);

    const peach = getPeachConfig();

    // 1. An unsigned webhook can never confirm a payment. Without a configured secret the endpoint is closed.
    if (!peach.webhookSecret) {
      console.warn('[ZAKA Webhook] Rejected: PEACH_WEBHOOK_SECRET is not configured.');
      res.status(503).json({ error: 'Webhook processing is not configured' });
      return;
    }
    if (!receivedSignature || !timestamp || !webhookId) {
      console.warn('[ZAKA Webhook] Missing required webhook authentication headers');
      res.status(401).json({ error: 'Missing webhook signature headers' });
      return;
    }

    // Replay attack prevention: timestamp must parse and be within 5 minutes
    const parsedTimestamp = /^\d+$/.test(timestamp)
      ? (timestamp.length <= 10 ? Number(timestamp) * 1000 : Number(timestamp))
      : Date.parse(timestamp);
    if (!parsedTimestamp || isNaN(parsedTimestamp) || Math.abs(Date.now() - parsedTimestamp) > 5 * 60 * 1000) {
      console.warn('[ZAKA Webhook] Webhook timestamp missing, invalid or outside the 5-minute tolerance window');
      res.status(400).json({ error: 'Webhook timestamp expired or invalid' });
      return;
    }

    // Format: timestamp.webhookId.webhookURL.rawRequestBody
    const configuredWebhookUrl = peach.webhookUrl || `${publicBaseUrl(req)}/api/payments/peach/webhook`;
    const expectedSignature = crypto
      .createHmac('sha256', peach.webhookSecret)
      .update(`${timestamp}.${webhookId}.${configuredWebhookUrl}.${rawRequestBody}`)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    const sigBuf = Buffer.from(receivedSignature, 'hex');
    const expBuf = Buffer.from(expectedSignature, 'hex');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      console.warn('[ZAKA Webhook] HMAC-SHA256 signature verification failed');
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    // 2. Replay & Idempotency Protection by Webhook ID
    if (await isWebhookAlreadyProcessed(webhookId)) {
      res.status(200).json({ received: true, status: 'already_processed' });
      return;
    }

    const payload = req.body || {};
    console.log('[ZAKA Webhook] Received verified Peach Payments event:', payload?.event || payload?.type);

    const merchantTransactionId = String(payload.merchantTransactionId || payload.data?.merchantTransactionId || '');
    const resultCode = payload.result?.code || payload.data?.result?.code || '';
    const rawAmount = payload.amount ?? payload.data?.amount;
    const reported = {
      amount: rawAmount !== undefined && rawAmount !== null && !isNaN(Number(rawAmount)) ? Number(rawAmount) : null,
      merchantTransactionId,
    };
    const providerId = String(payload.id || payload.data?.id || '');

    if (merchantTransactionId && PEACH_SUCCESS_PATTERN.test(resultCode)) {
      await ensureBackendAuthenticated();

      const paySnap = await getDocs(
        query(collection(db, 'payments'), where('merchantTransactionId', '==', merchantTransactionId), limit(1))
      );
      if (!paySnap.empty) {
        const pDoc = paySnap.docs[0];
        if (gatewayResultMatches(pDoc.data() as any, reported)) {
          if (await finalizeRidePayment(pDoc.ref, providerId)) {
            console.log(`[ZAKA Webhook] Finalized payment for ride ${pDoc.data().rideId}`);
          }
        } else {
          console.error(`[ZAKA Webhook] Amount mismatch for ${merchantTransactionId}. Payment NOT finalised.`);
        }
      } else {
        // Not a ride payment: check wallet top-ups
        const topupSnap = await getDocs(
          query(collection(db, 'wallet_transactions'), where('merchantTransactionId', '==', merchantTransactionId), limit(1))
        );
        if (!topupSnap.empty) {
          const tDoc = topupSnap.docs[0];
          if (gatewayResultMatches(tDoc.data() as any, reported)) {
            await creditWalletTopup(tDoc.id, providerId);
          } else {
            console.error(`[ZAKA Webhook] Amount mismatch for top-up ${merchantTransactionId}. Wallet NOT credited.`);
          }
        }
      }
    }

    await markWebhookProcessed(webhookId, payload?.event || payload?.type);

    // Return HTTP 200 ONLY after safe acceptance and processing
    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('[ZAKA Webhook] Error processing webhook:', err);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

// 6. Peach Shopper Return Callback Endpoint
// Carries no trust: the app re-verifies the payment with the server after this redirect.
app.all('/api/payments/peach/return', async (req: Request, res: Response) => {
  const clean = (v: unknown) => (typeof v === 'string' && SAFE_ID_PATTERN.test(v) ? v : '');
  const rideId = clean(req.query.rideId) || clean(req.body?.rideId);
  const walletTx = clean(req.query.walletTx) || clean(req.body?.walletTx);

  if (walletTx) {
    res.redirect(`/?peachReturn=true&walletTopup=${encodeURIComponent(walletTx)}`);
    return;
  }
  res.redirect(`/?rideId=${encodeURIComponent(rideId)}&peachReturn=true`);
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
