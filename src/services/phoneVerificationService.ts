/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Phone number verification by one-time SMS code
 *
 * The ZAKA server texts the code through Africa's Talking and, once the code is confirmed, hands back
 * a short-lived verification token. Only the server records the number as verified on the profile
 * (/api/passenger/confirm-phone), after checking that token.
 */

import { apiJson } from './apiClient';

export interface VerifiedPhone {
  /** Canonical number, e.g. +27821234567 */
  phone: string;
  /** Proof of verification, redeemed by recordOnPassengerProfile() */
  verificationToken: string;
}

async function post(path: string, json: unknown, fallback: string, authenticated = false) {
  try {
    const { ok, data } = await apiJson<any>(path, { method: 'POST', json, authenticated });
    if (!ok || data?.success === false) throw new Error(data?.error || fallback);
    return data;
  } catch (err: any) {
    if (err instanceof TypeError) throw new Error('Network error. Please check your connection and try again.');
    throw new Error(err?.message || fallback);
  }
}

export const phoneVerificationService = {
  /** Texts a 6-digit code. Returns the canonical number and the seconds before a resend is allowed. */
  async sendCode(phone: string): Promise<{ phone: string; resendInSeconds: number }> {
    const data = await post('/api/phone/send-code', { phone }, 'We could not send the code. Please try again.');
    return { phone: data.phone, resendInSeconds: Number(data.resendInSeconds) || 45 };
  },

  /** Checks the code and returns the verification token for the number. */
  async confirmCode(phone: string, code: string): Promise<VerifiedPhone> {
    const data = await post(
      '/api/phone/verify-code',
      { phone, code: code.trim() },
      'We could not verify the code. Please try again.'
    );
    return { phone: data.phone, verificationToken: data.verificationToken };
  },

  /** Marks the number as verified on the signed-in passenger's profile. */
  async recordOnPassengerProfile(verificationToken: string): Promise<{ phone: string; phoneVerifiedAt: string }> {
    const data = await post(
      '/api/passenger/confirm-phone',
      { verificationToken },
      'We could not confirm your phone number. Please try again.',
      true
    );
    return { phone: data.phone, phoneVerifiedAt: data.phoneVerifiedAt };
  },
};
