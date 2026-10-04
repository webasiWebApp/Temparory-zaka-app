/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Mandatory Email Verification Screen
 * Enforces email verification before accessing protected ride and driver operations.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Mail,
  CheckCircle2,
  RefreshCw,
  LogOut,
  AlertCircle,
  Clock,
  ShieldCheck,
  Send,
  ArrowRight,
} from 'lucide-react';

export const VerifyEmailScreen: React.FC = () => {
  const { currentUser, userProfile, verificationEmailSent, sendVerificationEmail, checkEmailVerification, signOut } = useAuth();
  const [isChecking, setIsChecking] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const email = currentUser?.email || userProfile?.email || 'your email address';

  // Cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Send the link automatically when the user lands here without one having been sent in this
  // session (sign-in with an unverified account, recovered registration, or a failed initial send).
  useEffect(() => {
    const uid = currentUser?.uid;
    if (!uid || verificationEmailSent) return;
    const key = `zaka_verify_email_sent_${uid}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // sessionStorage unavailable: fall through and send once per mount
    }
    setIsSending(true);
    sendVerificationEmail()
      .then(() => {
        setResendCooldown(60);
        setFeedback({
          type: 'success',
          message: 'Verification email sent to ' + email + '. Please check your inbox and spam folder.',
        });
      })
      .catch((err: any) => {
        try {
          sessionStorage.removeItem(key);
        } catch {
          // ignore
        }
        setFeedback({
          type: 'error',
          message: err?.message || 'Failed to send verification email. Please use the resend button below.',
        });
      })
      .finally(() => setIsSending(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);

  const handleCheckStatus = async () => {
    setIsChecking(true);
    setFeedback(null);
    try {
      const isVerified = await checkEmailVerification();
      if (isVerified) {
        setFeedback({
          type: 'success',
          message: 'Email verified successfully! Loading your ZAKA experience...',
        });
      } else {
        setFeedback({
          type: 'error',
          message: 'Your email is not verified yet. Please click the confirmation link in the email sent to ' + email + ', then try again.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Could not verify status. Please check your internet connection.',
      });
    } finally {
      setIsChecking(false);
    }
  };

  const handleResendEmail = async () => {
    if (resendCooldown > 0 || isSending) return;
    setIsSending(true);
    setFeedback(null);
    try {
      await sendVerificationEmail();
      setResendCooldown(60);
      setFeedback({
        type: 'success',
        message: 'A fresh verification email has been dispatched to ' + email + '. Please check your inbox and spam folder.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Failed to send verification email. Please wait a moment and try again.',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#F7F7F5] px-4 py-8 select-none text-[#111111]">
      <div className="w-full max-w-md space-y-6 rounded-[32px] border border-white/90 bg-white/95 backdrop-blur-2xl p-6 sm:p-8 shadow-[0_12px_40px_rgba(0,0,0,0.06)]">
        {/* Brand Icon Header */}
        <div className="text-center space-y-3">
          <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-3xl bg-amber-400/25" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-tr from-[#FF7A00] to-[#FFA000] text-white shadow-[0_8px_24px_rgba(255,122,0,0.32)]">
              <Mail className="h-10 w-10 stroke-[2.2]" />
            </div>
          </div>

          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200/60 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-amber-800">
              <Clock className="h-3 w-3" /> Action Required
            </span>
            <h1 className="text-2xl font-black tracking-tight text-neutral-950">
              Verify your email
            </h1>
            <p className="text-xs text-neutral-500 font-medium leading-relaxed max-w-xs mx-auto">
              We've sent a verification link to your email address:
            </p>
            <p className="text-sm font-black text-neutral-900 break-all bg-neutral-50 rounded-xl py-1.5 px-3 border border-neutral-100">
              {email}
            </p>
          </div>
        </div>

        {/* Informational Guidance */}
        <div className="space-y-2 rounded-2xl bg-neutral-50/80 p-3.5 border border-neutral-100 text-xs text-neutral-600">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="h-4 w-4 text-[#FF7A00] shrink-0 mt-0.5" />
            <p className="leading-snug">
              <strong className="text-neutral-900 font-bold">Mandatory Security Verification:</strong> Unverified accounts cannot request rides, access saved payment methods, or activate driver status.
            </p>
          </div>
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-neutral-400 shrink-0 mt-0.5" />
            <p className="leading-snug">
              Click the link in your inbox. Be sure to check your spam/junk folder if it takes a few minutes to arrive.
            </p>
          </div>
        </div>

        {/* Feedback Message Banner */}
        {feedback && (
          <div
            className={`rounded-2xl p-3.5 text-xs font-semibold leading-relaxed flex items-start gap-2.5 animate-in fade-in duration-200 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                : feedback.type === 'error'
                ? 'bg-red-50 text-red-900 border border-red-200'
                : 'bg-neutral-100 text-neutral-800 border border-neutral-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">{feedback.message}</div>
          </div>
        )}

        {/* Primary Action Buttons */}
        <div className="space-y-2.5 pt-1">
          {/* Check Verification Status */}
          <button
            type="button"
            onClick={handleCheckStatus}
            disabled={isChecking}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-950 py-3.5 text-xs font-bold text-white shadow-[0_4px_16px_rgba(0,0,0,0.12)] hover:bg-neutral-900 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 text-[#FF7A00] ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Checking status with Firebase...' : "I've Verified My Email — Check Status"}</span>
            <ArrowRight className="h-4 w-4 text-neutral-400 ml-1" />
          </button>

          {/* Resend Verification Email */}
          <button
            type="button"
            onClick={handleResendEmail}
            disabled={isSending || resendCooldown > 0}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white py-3 text-xs font-bold text-neutral-800 hover:bg-neutral-50 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5 text-neutral-500" />
            <span>
              {resendCooldown > 0
                ? `Resend available in ${resendCooldown}s`
                : isSending
                ? 'Sending email...'
                : 'Resend Verification Email'}
            </span>
          </button>
        </div>

        {/* Footer Logout */}
        <div className="border-t border-neutral-100 pt-3 flex items-center justify-between text-xs text-neutral-400">
          <span>Wrong email?</span>
          <button
            type="button"
            onClick={async () => {
              await signOut();
            }}
            className="flex items-center gap-1.5 font-bold text-red-600 hover:underline cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
