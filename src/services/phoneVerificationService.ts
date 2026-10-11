/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Phone number verification by one-time SMS code (Firebase Phone Auth)
 *
 * The number is linked to the signed-in account, so Firebase guarantees that it really belongs to the
 * user and that no other account holds it. The security rules read it back from the session token.
 */

import {
  PhoneAuthProvider,
  RecaptchaVerifier,
  linkWithCredential,
  updatePhoneNumber,
} from 'firebase/auth';
import { auth } from '../firebase/config';
import { normalizePhoneNumber } from '../utils/phoneUtils';

let recaptcha: RecaptchaVerifier | null = null;

function resetRecaptcha() {
  try {
    recaptcha?.clear();
  } catch {
    // already gone
  }
  recaptcha = null;
}

function readableError(err: any): string {
  switch (err?.code) {
    case 'auth/invalid-phone-number':
    case 'auth/missing-phone-number':
      return 'This phone number is not valid. Please check it and try again.';
    case 'auth/invalid-verification-code':
    case 'auth/missing-verification-code':
      return 'That code is not correct. Please check the SMS and try again.';
    case 'auth/code-expired':
      return 'This code has expired. Please request a new one.';
    case 'auth/credential-already-in-use':
    case 'auth/account-exists-with-different-credential':
    case 'auth/phone-number-already-exists':
      return 'This phone number is already registered to another ZAKA account.';
    case 'auth/too-many-requests':
    case 'auth/quota-exceeded':
      return 'Too many codes have been requested. Please wait a while before trying again.';
    case 'auth/captcha-check-failed':
      return 'The security check failed. Please try again.';
    case 'auth/operation-not-allowed':
    case 'auth/billing-not-enabled':
      return 'SMS verification is not available right now. Please contact ZAKA support.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection and try again.';
    case 'auth/requires-recent-login':
      return 'For your security, please sign out and sign in again before changing your number.';
    case 'auth/user-token-expired':
      return 'Your session has expired. Please sign in again.';
    default:
      return err?.message && !String(err.message).startsWith('Firebase:')
        ? err.message
        : 'We could not verify your phone number. Please try again.';
  }
}

export const phoneVerificationService = {
  /** The number confirmed for the signed-in account, in canonical form ('' when none) */
  verifiedNumber(): string {
    return auth.currentUser?.phoneNumber ? normalizePhoneNumber(auth.currentUser.phoneNumber) : '';
  },

  /**
   * Sends the SMS code. `container` hosts the invisible reCAPTCHA Firebase requires on the web.
   * Returns the verification id to pass to confirmCode().
   */
  async sendCode(phone: string, container: HTMLElement): Promise<string> {
    if (!auth.currentUser) throw new Error('Your session has expired. Please sign in again.');
    try {
      resetRecaptcha();
      // reCAPTCHA cannot be rendered twice into the same element, so every attempt gets a fresh one
      container.innerHTML = '';
      const host = document.createElement('div');
      container.appendChild(host);
      recaptcha = new RecaptchaVerifier(auth, host, { size: 'invisible' });
      return await new PhoneAuthProvider(auth).verifyPhoneNumber(phone, recaptcha);
    } catch (err: any) {
      resetRecaptcha();
      console.warn('[ZAKA AUTH] phone code request:', err?.code, err?.message);
      throw new Error(readableError(err));
    }
  },

  /** Checks the code and attaches the number to the signed-in account. Returns the verified number. */
  async confirmCode(verificationId: string, code: string): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error('Your session has expired. Please sign in again.');
    try {
      const credential = PhoneAuthProvider.credential(verificationId, code.trim());
      if (user.phoneNumber) {
        await updatePhoneNumber(user, credential);
      } else {
        await linkWithCredential(user, credential);
      }
      // The security rules read phone_number from the ID token, which only changes on refresh
      await user.getIdToken(true).catch(() => null);
      resetRecaptcha();
      return normalizePhoneNumber(auth.currentUser?.phoneNumber || '');
    } catch (err: any) {
      console.warn('[ZAKA AUTH] phone code confirmation:', err?.code, err?.message);
      throw new Error(readableError(err));
    }
  },

  dispose() {
    resetRecaptcha();
  },
};
