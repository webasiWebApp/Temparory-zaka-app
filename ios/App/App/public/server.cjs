"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_vite = require("vite");
var import_app = require("firebase/app");
var import_auth = require("firebase/auth");
var import_firestore = require("firebase/firestore");
import_dotenv.default.config();
var PORT = 3e3;
var app = (0, import_express.default)();
app.use(
  import_express.default.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    }
  })
);
app.use(
  import_express.default.urlencoded({
    extended: true,
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    }
  })
);
var firebaseConfig = JSON.parse(
  import_fs.default.readFileSync(import_path.default.resolve(process.cwd(), "firebase-applet-config.json"), "utf-8")
);
var fbApp = (0, import_app.getApps)().length === 0 ? (0, import_app.initializeApp)(firebaseConfig) : (0, import_app.getApp)();
var fbAuth = (0, import_auth.getAuth)(fbApp);
var db = (0, import_firestore.initializeFirestore)(fbApp, { experimentalAutoDetectLongPolling: true }, firebaseConfig.firestoreDatabaseId);
var BACKEND_EMAIL = process.env.ZAKA_BACKEND_SERVICE_EMAIL || "zaka.backend.service@zaka.io";
var BACKEND_PASSWORD = process.env.ZAKA_BACKEND_SERVICE_PASSWORD || "ZakaSecurePass2026!#";
var cachedAuthUser = null;
async function ensureBackendAuthenticated() {
  if (cachedAuthUser && fbAuth.currentUser) {
    return cachedAuthUser;
  }
  try {
    const cred = await (0, import_auth.signInWithEmailAndPassword)(fbAuth, BACKEND_EMAIL, BACKEND_PASSWORD);
    cachedAuthUser = cred.user;
    return cred.user;
  } catch (err) {
    console.warn("[ZAKA Server] Backend service auth warning:", err.message);
    return null;
  }
}
function getPeachConfig() {
  const env = (process.env.PEACH_ENV || "sandbox").toLowerCase() === "production" ? "production" : "sandbox";
  const entityId = process.env.PEACH_ENTITY_ID || "";
  const secretToken = process.env.PEACH_SECRET_TOKEN || "";
  const clientId = process.env.PEACH_CLIENT_ID || "";
  const clientSecret = process.env.PEACH_CLIENT_SECRET || "";
  const merchantId = process.env.PEACH_MERCHANT_ID || "";
  const webhookSecret = process.env.PEACH_WEBHOOK_SECRET || "";
  const webhookUrl = process.env.PEACH_WEBHOOK_URL || "";
  const isConfigured = Boolean(entityId && secretToken);
  const hasOAuthConfig = Boolean(clientId && clientSecret && merchantId);
  const baseUrl = env === "production" ? "https://secure.peachpayments.com" : "https://testsecure.peachpayments.com";
  const authUrl = env === "production" ? "https://dashboard.peachpayments.com/api/oauth/token" : "https://sandbox-dashboard.peachpayments.com/api/oauth/token";
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
    authUrl
  };
}
var cachedPeachToken = null;
async function getPeachAccessToken() {
  const peach = getPeachConfig();
  if (!peach.hasOAuthConfig) {
    return null;
  }
  if (cachedPeachToken && Date.now() < cachedPeachToken.expiresAt - 6e4) {
    return cachedPeachToken.accessToken;
  }
  try {
    const response = await fetch(peach.authUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        clientId: peach.clientId,
        clientSecret: peach.clientSecret,
        merchantId: peach.merchantId
      })
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
        expiresAt: Date.now() + expiresIn * 1e3
      };
      return data.access_token;
    }
  } catch (err) {
    console.warn("[ZAKA Server] Error obtaining Peach OAuth token:", err.message);
  }
  return null;
}
var processedWebhookIds = /* @__PURE__ */ new Set();
async function isWebhookAlreadyProcessed(webhookId) {
  if (processedWebhookIds.has(webhookId)) {
    return true;
  }
  try {
    const docRef = (0, import_firestore.doc)(db, "processed_webhooks", webhookId);
    const snap = await (0, import_firestore.getDoc)(docRef);
    if (snap.exists()) {
      processedWebhookIds.add(webhookId);
      return true;
    }
  } catch (e) {
    console.warn("[ZAKA Webhook] Failed checking processed webhook status in Firestore:", e);
  }
  return false;
}
async function markWebhookProcessed(webhookId, eventType) {
  processedWebhookIds.add(webhookId);
  try {
    const docRef = (0, import_firestore.doc)(db, "processed_webhooks", webhookId);
    await (0, import_firestore.setDoc)(docRef, {
      webhookId,
      eventType: eventType || "payment_event",
      processedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (e) {
    console.warn("[ZAKA Webhook] Failed recording processed webhook in Firestore:", e);
  }
}
function calculatePeachSignature(params, secretKey) {
  const sortedKeys = Object.keys(params).sort();
  let toSign = "";
  for (const key of sortedKeys) {
    toSign += key + params[key];
  }
  return import_crypto.default.createHmac("sha256", secretKey).update(toSign).digest("hex");
}
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "ZAKA E-Hailing Platform API",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.get("/api/payments/config", (_req, res) => {
  const peach = getPeachConfig();
  res.json({
    provider: "peach",
    env: peach.env,
    isConfigured: peach.isConfigured,
    currency: "ZAR",
    commissionSplit: {
      driverPercent: 85,
      platformPercent: 15
    },
    message: peach.isConfigured ? `Peach Payments active in ${peach.env.toUpperCase()} mode.` : "ZAKA PAYMENT INTEGRATION IMPLEMENTED \u2014 AWAITING PEACH MERCHANT CREDENTIALS AND PRODUCTION ONBOARDING."
  });
});
app.post("/api/payments/peach/initiate", async (req, res) => {
  try {
    const { rideId, paymentMethod = "card" } = req.body;
    if (!rideId || typeof rideId !== "string") {
      res.status(400).json({ success: false, error: "rideId is required" });
      return;
    }
    await ensureBackendAuthenticated();
    const rideRef = (0, import_firestore.doc)(db, "rides", rideId);
    const rideSnap = await (0, import_firestore.getDoc)(rideRef);
    if (!rideSnap.exists()) {
      res.status(404).json({ success: false, error: "Ride not found" });
      return;
    }
    const rideData = rideSnap.data();
    if (rideData.status !== "completed" && rideData.status !== "in_progress") {
      res.status(400).json({
        success: false,
        error: `Cannot initiate payment for ride in status: ${rideData.status}`
      });
      return;
    }
    const authoritativeFare = Number(rideData.finalFare || rideData.estimatedFare) || 35;
    const amount = Math.round(authoritativeFare * 100) / 100;
    const platformCommission = Math.round(amount * 15) / 100;
    const driverEarnings = Math.round((amount - platformCommission) * 100) / 100;
    const paymentsRef = (0, import_firestore.collection)(db, "payments");
    const q = (0, import_firestore.query)(paymentsRef, (0, import_firestore.where)("rideId", "==", rideId), (0, import_firestore.limit)(1));
    const paymentQuerySnap = await (0, import_firestore.getDocs)(q);
    let paymentDocId = "";
    let existingPayment = null;
    if (!paymentQuerySnap.empty) {
      const pDoc = paymentQuerySnap.docs[0];
      paymentDocId = pDoc.id;
      existingPayment = pDoc.data();
      if (existingPayment.paymentStatus === "paid") {
        res.json({
          success: true,
          paymentStatus: "paid",
          message: "Payment has already been confirmed and settled.",
          paymentId: paymentDocId,
          amount
        });
        return;
      }
    } else {
      paymentDocId = `PAY-${rideId.substring(0, 8)}-${Date.now().toString(36)}`;
    }
    const shortRide = rideId.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase();
    const randHex = import_crypto.default.randomBytes(4).toString("hex").toUpperCase();
    const merchantTransactionId = `ZK${shortRide}${randHex}`.slice(0, 16);
    const peach = getPeachConfig();
    if (!peach.isConfigured) {
      const paymentRecord = {
        id: paymentDocId,
        paymentId: paymentDocId,
        rideId,
        passengerId: rideData.passengerId,
        driverId: rideData.driverId || "",
        amount,
        currency: "ZAR",
        paymentMethod,
        paymentStatus: "pending",
        platformCommission,
        platformFee: platformCommission,
        driverEarnings,
        provider: "peach",
        transactionReference: merchantTransactionId,
        merchantTransactionId,
        failureReason: "PEACH_CREDENTIALS_REQUIRED",
        isDemo: Boolean(rideData.isDemo),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        createdAt: existingPayment?.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
        paidAt: null
      };
      await (0, import_firestore.setDoc)((0, import_firestore.doc)(db, "payments", paymentDocId), paymentRecord, { merge: true });
      res.json({
        success: false,
        code: "PEACH_CREDENTIALS_REQUIRED",
        message: "ZAKA PAYMENT INTEGRATION IMPLEMENTED \u2014 AWAITING PEACH MERCHANT CREDENTIALS AND PRODUCTION ONBOARDING. Set PEACH_ENTITY_ID and PEACH_SECRET_TOKEN in .env to enable live card checkout.",
        paymentStatus: "pending",
        amount,
        merchantTransactionId,
        paymentId: paymentDocId
      });
      return;
    }
    const host = req.get("host") || "localhost:3000";
    const protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
    const shopperResultUrl = `${protocol}://${host}/api/payments/peach/return?rideId=${rideId}`;
    const nonce = import_crypto.default.randomUUID();
    const checkoutParams = {
      "authentication.entityId": peach.entityId,
      amount: amount.toFixed(2),
      currency: "ZAR",
      merchantTransactionId,
      nonce,
      paymentType: "DB",
      shopperResultUrl
    };
    const signature = calculatePeachSignature(checkoutParams, peach.secretToken);
    checkoutParams["signature"] = signature;
    const accessToken = await getPeachAccessToken();
    const headers = {
      "Content-Type": "application/json"
    };
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
    const peachEndpoint = `${peach.baseUrl}/v2/checkout`;
    const peachResponse = await fetch(peachEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(checkoutParams)
    });
    const peachData = await peachResponse.json();
    if (!peachResponse.ok || !peachData.redirectUrl && !peachData.id) {
      console.warn("[ZAKA Server] Peach checkout response error:", peachData);
      res.status(502).json({
        success: false,
        error: "Payment gateway communication error",
        details: peachData?.result?.description || peachData?.message || "Gateway rejected checkout request"
      });
      return;
    }
    const redirectUrl = peachData.redirectUrl;
    const peachCheckoutId = peachData.id || peachData.checkoutId;
    await (0, import_firestore.setDoc)(
      (0, import_firestore.doc)(db, "payments", paymentDocId),
      {
        id: paymentDocId,
        paymentId: paymentDocId,
        rideId,
        passengerId: rideData.passengerId,
        driverId: rideData.driverId || "",
        amount,
        currency: "ZAR",
        paymentMethod,
        paymentStatus: "pending",
        platformCommission,
        platformFee: platformCommission,
        driverEarnings,
        provider: "peach",
        transactionReference: merchantTransactionId,
        merchantTransactionId,
        peachCheckoutId,
        redirectUrl,
        isDemo: Boolean(rideData.isDemo),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        createdAt: existingPayment?.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
        paidAt: null
      },
      { merge: true }
    );
    res.json({
      success: true,
      paymentStatus: "pending",
      redirectUrl,
      peachCheckoutId,
      merchantTransactionId,
      amount,
      paymentId: paymentDocId
    });
  } catch (err) {
    console.error("[ZAKA Server] /api/payments/peach/initiate error:", err);
    res.status(500).json({ success: false, error: err.message || "Internal server error" });
  }
});
app.post("/api/payments/peach/verify", async (req, res) => {
  try {
    const { rideId, checkoutId } = req.body;
    if (!rideId) {
      res.status(400).json({ success: false, error: "rideId is required" });
      return;
    }
    await ensureBackendAuthenticated();
    const paymentsRef = (0, import_firestore.collection)(db, "payments");
    const q = (0, import_firestore.query)(paymentsRef, (0, import_firestore.where)("rideId", "==", rideId), (0, import_firestore.limit)(1));
    const snap = await (0, import_firestore.getDocs)(q);
    if (snap.empty) {
      res.status(404).json({ success: false, error: "Payment record not found for ride" });
      return;
    }
    const paymentDoc = snap.docs[0];
    const payment = paymentDoc.data();
    if (payment.paymentStatus === "paid") {
      res.json({
        success: true,
        paymentStatus: "paid",
        message: "Payment is already confirmed and finalized.",
        paidAt: payment.paidAt,
        amount: payment.amount
      });
      return;
    }
    const peach = getPeachConfig();
    if (!peach.isConfigured) {
      res.json({
        success: false,
        paymentStatus: payment.paymentStatus || "pending",
        message: "Peach credentials awaiting configuration."
      });
      return;
    }
    const targetCheckoutId = checkoutId || payment.peachCheckoutId;
    if (!targetCheckoutId) {
      res.json({
        success: false,
        paymentStatus: "pending",
        message: "Awaiting checkout completion."
      });
      return;
    }
    const statusHeaders = {
      "Content-Type": "application/json"
    };
    const accessToken = await getPeachAccessToken();
    if (accessToken) {
      statusHeaders["Authorization"] = `Bearer ${accessToken}`;
    }
    const statusUrl = `${peach.baseUrl}/v2/checkout/${targetCheckoutId}?entityId=${encodeURIComponent(peach.entityId)}`;
    const statusRes = await fetch(statusUrl, {
      headers: statusHeaders
    });
    const statusData = await statusRes.json();
    const resultCode = statusData?.result?.code || "";
    const isSuccess = /^(000\.000\.|000\.100\.1|000\.[36]|000\.400\.0[^3]|000\.400\.100)/.test(resultCode);
    if (isSuccess) {
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      await (0, import_firestore.updateDoc)((0, import_firestore.doc)(db, "payments", paymentDoc.id), {
        paymentStatus: "paid",
        paidAt: nowIso,
        updatedAt: nowIso,
        providerTransactionId: statusData.id || statusData.registrationId || targetCheckoutId
      });
      await (0, import_firestore.updateDoc)((0, import_firestore.doc)(db, "rides", rideId), {
        paymentStatus: "paid",
        updatedAt: nowIso
      });
      try {
        const notifRef = (0, import_firestore.collection)(db, "notifications");
        await (0, import_firestore.setDoc)((0, import_firestore.doc)(notifRef), {
          userId: payment.passengerId,
          title: "Payment Successful \u2713",
          message: `Payment of R${payment.amount.toFixed(2)} confirmed via Peach Payments. Thank you for riding with ZAKA!`,
          type: "payment",
          read: false,
          createdAt: nowIso
        });
        if (payment.driverId) {
          await (0, import_firestore.setDoc)((0, import_firestore.doc)(notifRef), {
            userId: payment.driverId,
            title: "Payment Confirmed",
            message: `Payment of R${payment.amount.toFixed(2)} confirmed. +R${(payment.driverEarnings || payment.amount * 0.85).toFixed(2)} credited to your account.`,
            type: "payment",
            read: false,
            createdAt: nowIso
          });
        }
      } catch (notifErr) {
        console.warn("[ZAKA Server] Notification dispatch warning:", notifErr);
      }
      res.json({
        success: true,
        paymentStatus: "paid",
        paidAt: nowIso,
        amount: payment.amount
      });
      return;
    }
    res.json({
      success: false,
      paymentStatus: payment.paymentStatus || "pending",
      resultCode,
      message: statusData?.result?.description || "Transaction pending or not completed"
    });
  } catch (err) {
    console.error("[ZAKA Server] /api/payments/peach/verify error:", err);
    res.status(500).json({ success: false, error: err.message || "Internal server error" });
  }
});
app.post("/api/payments/peach/webhook", async (req, res) => {
  try {
    const timestamp = req.get("x-webhook-timestamp") || "";
    const webhookId = req.get("x-webhook-id") || "";
    const receivedSignature = req.get("x-webhook-signature") || req.get("x-signature") || "";
    const rawRequestBody = req.rawBody || JSON.stringify(req.body);
    const peach = getPeachConfig();
    const host = req.get("host") || "localhost:3000";
    const protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
    const configuredWebhookUrl = peach.webhookUrl || `${protocol}://${host}/api/payments/peach/webhook`;
    if (peach.webhookSecret) {
      if (!receivedSignature || !timestamp || !webhookId) {
        console.warn("[ZAKA Webhook] Missing required webhook authentication headers");
        res.status(401).json({ error: "Missing webhook signature headers" });
        return;
      }
      const parsedTimestamp = Number(timestamp) ? timestamp.length === 10 ? Number(timestamp) * 1e3 : Number(timestamp) : Date.parse(timestamp);
      if (parsedTimestamp && Math.abs(Date.now() - parsedTimestamp) > 5 * 60 * 1e3) {
        console.warn("[ZAKA Webhook] Webhook timestamp outside allowed 5-minute tolerance window");
        res.status(400).json({ error: "Webhook timestamp expired or invalid" });
        return;
      }
      const messageToSign = `${timestamp}.${webhookId}.${configuredWebhookUrl}.${rawRequestBody}`;
      const expectedSignature = import_crypto.default.createHmac("sha256", peach.webhookSecret).update(messageToSign).digest("hex");
      const sigBuf = Buffer.from(receivedSignature, "hex");
      const expBuf = Buffer.from(expectedSignature, "hex");
      if (sigBuf.length !== expBuf.length || !import_crypto.default.timingSafeEqual(sigBuf, expBuf)) {
        console.warn("[ZAKA Webhook] HMAC-SHA256 signature verification failed");
        res.status(401).json({ error: "Invalid webhook signature" });
        return;
      }
    }
    if (webhookId) {
      const alreadyHandled = await isWebhookAlreadyProcessed(webhookId);
      if (alreadyHandled) {
        console.log(`[ZAKA Webhook] Webhook ID ${webhookId} already processed. Acknowledging with HTTP 200.`);
        res.status(200).json({ received: true, status: "already_processed" });
        return;
      }
    }
    const payload = req.body;
    console.log("[ZAKA Webhook] Received verified Peach Payments event:", payload?.event || payload?.type);
    const merchantTransactionId = payload.merchantTransactionId || payload.data?.merchantTransactionId;
    const resultCode = payload.result?.code || payload.data?.result?.code || "";
    const isSuccess = /^(000\.000\.|000\.100\.1|000\.[36]|000\.400\.0[^3]|000\.400\.100)/.test(resultCode);
    if (merchantTransactionId && isSuccess) {
      await ensureBackendAuthenticated();
      const paymentsRef = (0, import_firestore.collection)(db, "payments");
      const q = (0, import_firestore.query)(paymentsRef, (0, import_firestore.where)("merchantTransactionId", "==", merchantTransactionId), (0, import_firestore.limit)(1));
      const snap = await (0, import_firestore.getDocs)(q);
      if (!snap.empty) {
        const pDoc = snap.docs[0];
        const paymentData = pDoc.data();
        if (paymentData.paymentStatus !== "paid") {
          const nowIso = (/* @__PURE__ */ new Date()).toISOString();
          await (0, import_firestore.updateDoc)((0, import_firestore.doc)(db, "payments", pDoc.id), {
            paymentStatus: "paid",
            paidAt: nowIso,
            updatedAt: nowIso,
            providerTransactionId: payload.id || payload.data?.id || paymentData.peachCheckoutId
          });
          await (0, import_firestore.updateDoc)((0, import_firestore.doc)(db, "rides", paymentData.rideId), {
            paymentStatus: "paid",
            updatedAt: nowIso
          });
          try {
            const notifRef = (0, import_firestore.collection)(db, "notifications");
            await (0, import_firestore.setDoc)((0, import_firestore.doc)(notifRef), {
              userId: paymentData.passengerId,
              title: "Payment Successful \u2713",
              message: `Payment of R${paymentData.amount.toFixed(2)} confirmed via Peach Payments.`,
              type: "payment",
              read: false,
              createdAt: nowIso
            });
            if (paymentData.driverId) {
              await (0, import_firestore.setDoc)((0, import_firestore.doc)(notifRef), {
                userId: paymentData.driverId,
                title: "Payment Confirmed",
                message: `Payment of R${paymentData.amount.toFixed(2)} confirmed. +R${(paymentData.driverEarnings || paymentData.amount * 0.85).toFixed(2)} credited to your account.`,
                type: "payment",
                read: false,
                createdAt: nowIso
              });
            }
          } catch (notifErr) {
            console.warn("[ZAKA Webhook] Notification dispatch error:", notifErr);
          }
          console.log(`[ZAKA Webhook] Successfully finalized payment for ride ${paymentData.rideId}`);
        }
      }
    }
    if (webhookId) {
      await markWebhookProcessed(webhookId, payload?.event || payload?.type);
    }
    res.status(200).json({ received: true });
  } catch (err) {
    console.error("[ZAKA Webhook] Error processing webhook:", err);
    res.status(500).json({ error: "Webhook processing error" });
  }
});
app.all("/api/payments/peach/return", async (req, res) => {
  const rideId = req.query.rideId || req.body?.rideId || "";
  const checkoutId = req.query.id || req.body?.id || "";
  console.log(`[ZAKA Shopper Return] Ride: ${rideId}, Checkout: ${checkoutId}`);
  res.redirect(`/?rideId=${encodeURIComponent(rideId)}&peachReturn=true&checkoutId=${encodeURIComponent(checkoutId)}`);
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[ZAKA Server] Full-Stack server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Production Express Backend Server
 * Secure Server-Side Execution Layer for Peach Payments, Driver Earnings & Vite Serving
 */
//# sourceMappingURL=server.cjs.map
