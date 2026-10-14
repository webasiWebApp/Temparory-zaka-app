/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Phone number verification by one-time SMS code (Africa's Talking)
 *
 * Codes are kept only in this server's memory (hashed, short-lived, limited attempts). A correct code
 * is exchanged for a signed verification token that proves, for a limited time, that the holder
 * received SMS on that number. The token is then redeemed by /api/passenger/confirm-phone.
 */

import crypto from 'crypto';

// Read on use: this module is imported before server.ts loads .env
function gateway() {
  const username = String(process.env.AFRICASTALKING_USERNAME || '').trim();
  return {
    username,
    apiKey: String(process.env.AFRICASTALKING_API_KEY || '').trim(),
    senderId: String(process.env.AFRICASTALKING_SENDER_ID || '').trim(),
    endpoint:
      username === 'sandbox'
        ? 'https://api.sandbox.africastalking.com/version1/messaging'
        : 'https://api.africastalking.com/version1/messaging',
  };
}

const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 45 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;
const TOKEN_TTL_MS = 30 * 60 * 1000;

// Signs verification tokens. Without a configured secret a per-process one is used, so tokens
// issued before a restart simply stop working (the user re-verifies).
const fallbackSecret = crypto.randomBytes(32).toString('hex');
function tokenSecret(): string {
  return process.env.PHONE_OTP_TOKEN_SECRET || fallbackSecret;
}

export class PhoneOtpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function isSmsGatewayConfigured(): boolean {
  const { username, apiKey } = gateway();
  return Boolean(username && apiKey);
}

/** Sends one SMS through Africa's Talking. Throws when the gateway does not accept the message. */
export async function sendSms(to: string, message: string): Promise<void> {
  if (!isSmsGatewayConfigured()) {
    throw new PhoneOtpError('SMS verification is not available right now. Please contact ZAKA support.', 503);
  }
  const { username, apiKey, senderId, endpoint } = gateway();
  const body = new URLSearchParams({ username, to, message });
  if (senderId) body.set('from', senderId);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    // Africa's Talking answers authentication and validation errors in plain text
  }
  const recipient = data?.SMSMessageData?.Recipients?.[0];
  // 100 Processed, 101 Sent, 102 Queued
  if (!response.ok || !recipient || ![100, 101, 102].includes(Number(recipient.statusCode))) {
    console.error('[ZAKA SMS] Africa\'s Talking rejected the message:', response.status, recipient?.status || data?.SMSMessageData?.Message || text.slice(0, 200));
    throw new PhoneOtpError('We could not send the SMS to this number. Please check it and try again.', 502);
  }
}

interface PendingCode {
  hash: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
  sends: number[];
}

const pendingCodes = new Map<string, PendingCode>();

setInterval(() => {
  const now = Date.now();
  for (const [phone, entry] of pendingCodes) {
    if (now > entry.expiresAt && now - entry.lastSentAt > 60 * 60 * 1000) pendingCodes.delete(phone);
  }
}, 10 * 60 * 1000).unref();

function hashCode(phone: string, code: string): string {
  return crypto.createHmac('sha256', tokenSecret()).update(`${phone}:${code}`).digest('hex');
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', tokenSecret()).update(payload).digest('base64url');
}

/** Generates a code for the (canonical) number and texts it. */
export async function sendVerificationCode(phone: string): Promise<{ resendInSeconds: number }> {
  const now = Date.now();
  const existing = pendingCodes.get(phone);
  const recentSends = (existing?.sends || []).filter((t) => now - t < 60 * 60 * 1000);

  if (existing && now - existing.lastSentAt < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - existing.lastSentAt)) / 1000);
    throw new PhoneOtpError(`Please wait ${wait} seconds before requesting another code.`, 429);
  }
  if (recentSends.length >= MAX_SENDS_PER_HOUR) {
    throw new PhoneOtpError('Too many codes have been requested for this number. Please try again in an hour.', 429);
  }

  const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
  await sendSms(phone, `Your ZAKA verification code is ${code}. It expires in 5 minutes. Never share this code with anyone.`);

  pendingCodes.set(phone, {
    hash: hashCode(phone, code),
    expiresAt: now + CODE_TTL_MS,
    attempts: 0,
    lastSentAt: now,
    sends: [...recentSends, now],
  });
  return { resendInSeconds: RESEND_COOLDOWN_MS / 1000 };
}

/** Checks the code. On success returns a signed token proving the number was verified. */
export function checkVerificationCode(phone: string, code: string): string {
  const entry = pendingCodes.get(phone);
  if (!entry || Date.now() > entry.expiresAt || entry.attempts >= MAX_ATTEMPTS) {
    throw new PhoneOtpError('This code has expired. Please request a new one.', 410);
  }
  entry.attempts++;
  const expected = Buffer.from(entry.hash, 'hex');
  const actual = Buffer.from(hashCode(phone, code), 'hex');
  if (!crypto.timingSafeEqual(expected, actual)) {
    throw new PhoneOtpError(
      entry.attempts >= MAX_ATTEMPTS
        ? 'Too many incorrect attempts. Please request a new code.'
        : 'That code is not correct. Please check the SMS and try again.',
      400
    );
  }
  pendingCodes.delete(phone);

  const payload = Buffer.from(JSON.stringify({ phone, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/** Returns the verified number carried by a token, or null when it is forged or expired. */
export function readVerificationToken(token: string): string | null {
  if (typeof token !== 'string' || token.length > 512) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data?.phone !== 'string' || typeof data?.exp !== 'number' || Date.now() > data.exp) return null;
    return data.phone;
  } catch {
    return null;
  }
}
