/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Phone number verification by one-time SMS code
 *
 * Renders no <form> of its own so it can sit inside a larger form (e.g. passenger sign-up);
 * Enter in either field triggers the current step instead of submitting the outer form.
 */

import React, { useEffect, useState } from 'react';
import { Phone, ShieldCheck, AlertTriangle, ArrowLeft } from 'lucide-react';
import { phoneVerificationService, type VerifiedPhone } from '../../services/phoneVerificationService';
import { validatePhoneNumber, formatPhoneDisplay } from '../../utils/phoneUtils';

interface PhoneOtpVerifierProps {
  initialPhone?: string;
  label?: string;
  // Called with the confirmed number (canonical form) and its verification token. May reject to show an error.
  onVerified: (verified: VerifiedPhone) => Promise<void> | void;
  // Optional pre-send check (e.g. the number is not registered to another account). Throw to block.
  beforeSend?: (normalizedPhone: string) => Promise<void>;
  onCancel?: () => void;
}

export const PhoneOtpVerifier: React.FC<PhoneOtpVerifierProps> = ({
  initialPhone = '',
  label = 'Mobile Number',
  onVerified,
  beforeSend,
  onCancel,
}) => {
  const [phone, setPhone] = useState(initialPhone);
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const sendCode = async () => {
    if (busy) return;
    setError('');
    const check = validatePhoneNumber(sentTo || phone);
    if (!check.valid) {
      setError(check.error || 'Please enter a valid mobile number.');
      return;
    }
    setBusy(true);
    try {
      if (beforeSend) await beforeSend(check.normalized);
      const sent = await phoneVerificationService.sendCode(check.normalized);
      setSentTo(sent.phone);
      setCode('');
      setResendIn(sent.resendInSeconds);
    } catch (err: any) {
      setError(err?.message || 'We could not send the code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    if (busy) return;
    setError('');
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Please enter the 6-digit code from the SMS.');
      return;
    }
    setBusy(true);
    try {
      const verified = await phoneVerificationService.confirmCode(sentTo, code);
      await onVerified(verified);
    } catch (err: any) {
      setError(err?.message || 'We could not verify the code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onEnter = (action: () => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      action();
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

      {!sentTo ? (
        <div className="space-y-3">
          <div>
            <label htmlFor="otp-phone-input" className="block text-xs font-bold text-ink mb-1">
              {label}
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
              <input
                id="otp-phone-input"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={onEnter(sendCode)}
                placeholder="+27 82 123 4567"
                className="w-full rounded-input border border-line bg-surface-2 py-2.5 pl-9 pr-3 text-xs text-ink focus:border-primary focus:outline-none"
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
              type="button"
              onClick={sendCode}
              disabled={busy}
              className="flex-1 rounded-full bg-primary py-3 text-xs font-bold text-on-primary hover:bg-primary-hover active:bg-primary-pressed disabled:opacity-50 cursor-pointer"
            >
              {busy ? 'Sending code…' : 'Send Verification Code'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
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
              onKeyDown={onEnter(confirmCode)}
              placeholder="••••••"
              className="w-full rounded-input border border-line bg-surface-2 p-3 text-center text-lg font-bold tracking-[0.5em] text-ink focus:border-primary focus:outline-none"
              autoFocus
            />
          </div>
          <button
            id="btn-confirm-phone-code"
            type="button"
            onClick={confirmCode}
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
                setSentTo('');
                setCode('');
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
        </div>
      )}
    </div>
  );
};
