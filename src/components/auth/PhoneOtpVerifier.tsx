/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Phone number verification by one-time SMS code
 */

import React, { useEffect, useRef, useState } from 'react';
import { Phone, ShieldCheck, AlertTriangle, ArrowLeft } from 'lucide-react';
import { phoneVerificationService } from '../../services/phoneVerificationService';
import { validatePhoneNumber, formatPhoneDisplay } from '../../utils/phoneUtils';

interface PhoneOtpVerifierProps {
  initialPhone?: string;
  // Called with the confirmed number (canonical form). May reject to show an error.
  onVerified: (phone: string) => Promise<void>;
  onCancel?: () => void;
}

const RESEND_SECONDS = 45;

export const PhoneOtpVerifier: React.FC<PhoneOtpVerifierProps> = ({ initialPhone = '', onVerified, onCancel }) => {
  const [phone, setPhone] = useState(initialPhone);
  const [sentTo, setSentTo] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const recaptchaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => phoneVerificationService.dispose(), []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const sendCode = async () => {
    setError('');
    const check = validatePhoneNumber(phone);
    if (!check.valid) {
      setError(check.error || 'Please enter a valid mobile number.');
      return;
    }
    setBusy(true);
    try {
      // Already confirmed on this account (e.g. the profile update was interrupted): no second SMS needed
      if (phoneVerificationService.verifiedNumber() === check.normalized) {
        await onVerified(check.normalized);
        return;
      }
      if (!recaptchaRef.current) throw new Error('Please try again.');
      const id = await phoneVerificationService.sendCode(check.normalized, recaptchaRef.current);
      setVerificationId(id);
      setSentTo(check.normalized);
      setCode('');
      setResendIn(RESEND_SECONDS);
    } catch (err: any) {
      setError(err?.message || 'We could not send the code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Please enter the 6-digit code from the SMS.');
      return;
    }
    setBusy(true);
    try {
      const verified = await phoneVerificationService.confirmCode(verificationId, code);
      await onVerified(verified || sentTo);
    } catch (err: any) {
      setError(err?.message || 'We could not verify the code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-card border border-red-200 bg-red-50 p-3 text-xs font-bold text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!verificationId ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendCode();
          }}
          className="space-y-3"
        >
          <div>
            <label htmlFor="otp-phone-input" className="block text-xs font-bold text-ink mb-1">
              Mobile Number
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
              <input
                id="otp-phone-input"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+27 82 123 4567"
                className="w-full rounded-input border border-line bg-surface-2 py-2.5 pl-9 pr-3 text-xs text-ink focus:border-primary focus:outline-none"
                required
              />
            </div>
            <p className="mt-1 text-[11px] text-ink-3">We will send a 6-digit code by SMS to confirm this number is yours.</p>
          </div>
          <div className="flex items-center gap-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-full border border-line px-4 py-3 text-xs font-bold text-ink-2 hover:bg-surface-2 cursor-pointer"
              >
                Cancel
              </button>
            )}
            <button
              id="btn-send-phone-code"
              type="submit"
              disabled={busy}
              className="flex-1 rounded-full bg-primary py-3 text-xs font-bold text-on-primary hover:bg-primary-hover active:bg-primary-pressed disabled:opacity-50 cursor-pointer"
            >
              {busy ? 'Sending code…' : 'Send Verification Code'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={confirmCode} className="space-y-3">
          <div>
            <label htmlFor="otp-code-input" className="block text-xs font-bold text-ink mb-1">
              Enter the code sent to {formatPhoneDisplay(sentTo)}
            </label>
            <input
              id="otp-code-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="••••••"
              className="w-full rounded-input border border-line bg-surface-2 p-3 text-center text-lg font-bold tracking-[0.5em] text-ink focus:border-primary focus:outline-none"
              autoFocus
            />
          </div>
          <button
            id="btn-confirm-phone-code"
            type="submit"
            disabled={busy || code.length !== 6}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-xs font-bold text-on-primary hover:bg-primary-hover active:bg-primary-pressed disabled:opacity-50 cursor-pointer"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>{busy ? 'Verifying…' : 'Verify Number'}</span>
          </button>
          <div className="flex items-center justify-between text-[11px] font-bold">
            <button
              type="button"
              onClick={() => {
                setVerificationId('');
                setError('');
              }}
              className="flex items-center gap-1 text-ink-2 hover:text-ink cursor-pointer"
            >
              <ArrowLeft className="h-3 w-3" />
              Change number
            </button>
            <button
              type="button"
              disabled={busy || resendIn > 0}
              onClick={sendCode}
              className="text-ink underline disabled:no-underline disabled:text-ink-3 cursor-pointer disabled:cursor-default"
            >
              {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
            </button>
          </div>
        </form>
      )}

      {/* Host for the invisible reCAPTCHA Firebase requires before sending an SMS */}
      <div ref={recaptchaRef} />
    </div>
  );
};
