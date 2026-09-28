/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Unauthenticated Welcome & Auth Portal
 * Styling: Clean white cards, bold black route lines, #FFC107 yellow accents
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import { isRiderTarget } from '../../config/appTarget';
import {
  Shield,
  Car,
  User,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Lock,
  MapPin,
  Clock,
  CreditCard,
  PhoneCall,
  ChevronRight,
} from 'lucide-react';

interface WelcomeAuthScreenProps {
  onOpenAuth: (initialMode?: 'signin' | 'signup', initialRole?: UserRole) => void;
}

export const WelcomeAuthScreen: React.FC<WelcomeAuthScreenProps> = ({ onOpenAuth }) => {
  const { signInWithGoogle, loading } = useAuth();
  const [selectedRoleTab, setSelectedRoleTab] = useState<UserRole>('passenger');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveRole = isRiderTarget ? 'passenger' : selectedRoleTab;

  const handleGoogleFastAuth = async (role: UserRole) => {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle(role);
    } catch (err: any) {
      if (err.message !== 'Sign-in cancelled.') {
        setError(err.message || 'Google sign-in failed.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between w-full min-h-[calc(100dvh-61px)] bg-[#F7F7F5]">
      {/* Top Banner / Hero Section */}
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12 flex-1 flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Platform Branding & Value Prop */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3.5 py-1.5 text-xs font-bold text-amber-900 shadow-2xs">
              <span className="flex h-2 w-2 rounded-full bg-[#FFC107] animate-pulse" />
              <span>South Africa&apos;s Modern E-Hailing Network</span>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-[#111111] leading-[1.15]">
                Fast, Safe &amp; Reliable Rides Across South Africa.
              </h1>
              <p className="text-sm sm:text-base text-neutral-600 font-medium max-w-xl leading-relaxed">
                Connect seamlessly with verified drivers in Johannesburg, Sandton, Rosebank, and Pretoria.
                Experience transparent upfront fares, instant PIN verification, and 24/7 safety.
              </p>
            </div>

            {/* Platform Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white border border-[#E5E5E5] text-[#111111] shadow-2xs">
                  <ShieldCheck className="h-5 w-5 text-[#FFC107]" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-[#111111]">Safety OTP &amp; SOS</h4>
                  <p className="text-[11px] text-neutral-500">Every trip verified</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white border border-[#E5E5E5] text-[#111111] shadow-2xs">
                  <CreditCard className="h-5 w-5 text-[#FFC107]" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-[#111111]">ZAR Upfront Fares</h4>
                  <p className="text-[11px] text-neutral-500">No unexpected surcharges</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white border border-[#E5E5E5] text-[#111111] shadow-2xs">
                  <Clock className="h-5 w-5 text-[#FFC107]" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-[#111111]">Fast Dispatch</h4>
                  <p className="text-[11px] text-neutral-500">Average 3 min pickup</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Login & Registration Portal */}
          <div className="lg:col-span-5">
            <div className="rounded-3xl border border-[#E5E5E5] bg-white p-6 sm:p-8 shadow-xl space-y-6">
              {/* Role Selection Tabs (Web Target Only) */}
              {!isRiderTarget ? (
                <div className="flex items-center rounded-2xl bg-[#F5F5F5] p-1 border border-[#E5E5E5]">
                  <button
                    type="button"
                    onClick={() => setSelectedRoleTab('passenger')}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all ${
                      selectedRoleTab === 'passenger'
                        ? 'bg-[#111111] text-white shadow-xs'
                        : 'text-neutral-600 hover:text-[#111111]'
                    }`}
                  >
                    <User className={`h-3.5 w-3.5 ${selectedRoleTab === 'passenger' ? 'text-[#FFC107]' : ''}`} />
                    <span>Rider</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedRoleTab('driver')}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all ${
                      selectedRoleTab === 'driver'
                        ? 'bg-[#111111] text-white shadow-xs'
                        : 'text-neutral-600 hover:text-[#111111]'
                    }`}
                  >
                    <Car className={`h-3.5 w-3.5 ${selectedRoleTab === 'driver' ? 'text-[#FFC107]' : ''}`} />
                    <span>Driver</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedRoleTab('admin')}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all ${
                      selectedRoleTab === 'admin'
                        ? 'bg-[#111111] text-white shadow-xs'
                        : 'text-neutral-600 hover:text-[#111111]'
                    }`}
                  >
                    <Shield className={`h-3.5 w-3.5 ${selectedRoleTab === 'admin' ? 'text-[#FFC107]' : ''}`} />
                    <span>Admin</span>
                  </button>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3.5 py-1 text-xs font-bold text-amber-900 w-fit">
                  <User className="h-3.5 w-3.5 text-[#FFC107]" />
                  <span>ZAKA Rider App</span>
                </div>
              )}

              {error && (
                <div className="rounded-2xl bg-red-50 border border-red-200 p-3 text-xs font-bold text-red-600">
                  {error}
                </div>
              )}

              {/* Dynamic Role Card Description */}
              <div className="space-y-2">
                <h3 className="text-lg font-black text-[#111111]">
                  {effectiveRole === 'passenger' && 'Ride with ZAKA'}
                  {effectiveRole === 'driver' && 'Drive & Earn with ZAKA'}
                  {effectiveRole === 'admin' && 'Admin Operations Portal'}
                </h3>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  {effectiveRole === 'passenger' &&
                    'Sign in to book rides, track your live driver on the map, and manage your wallet and saved destinations.'}
                  {effectiveRole === 'driver' &&
                    'Sign in to go online, accept incoming ride requests in your area, and track your daily and weekly earnings.'}
                  {effectiveRole === 'admin' &&
                    'Sign in with administrator credentials to manage fleet verification, pricing algorithms, and platform dispatch.'}
                </p>
              </div>

              {/* Primary Actions */}
              <div className="space-y-3">
                {/* 1. Google Sign-in */}
                {effectiveRole !== 'admin' && (
                  <button
                    type="button"
                    onClick={() => handleGoogleFastAuth(effectiveRole)}
                    disabled={googleLoading || loading}
                    className="flex w-full items-center justify-center gap-2.5 rounded-2xl border border-[#E5E5E5] bg-white py-3.5 text-xs font-bold text-[#111111] hover:bg-neutral-50 active:scale-[0.99] transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Continue with Google</span>
                  </button>
                )}

                {/* 3. Email Sign In Button */}
                <button
                  type="button"
                  onClick={() => onOpenAuth('signin', effectiveRole)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#111111] py-3.5 text-xs font-black text-white hover:bg-neutral-800 active:scale-[0.99] transition-all shadow-md cursor-pointer"
                >
                  <span>Sign In with Email &amp; Password</span>
                  <ArrowRight className="h-4 w-4 text-[#FFC107]" />
                </button>

                {/* 4. Register New Account */}
                {effectiveRole !== 'admin' && (
                  <button
                    type="button"
                    onClick={() => onOpenAuth('signup', effectiveRole)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FFC107] py-3.5 text-xs font-black text-[#111111] hover:bg-[#FFB300] active:scale-[0.99] transition-all shadow-md cursor-pointer"
                  >
                    <span>
                      {effectiveRole === 'passenger' ? 'Create New Rider Account' : 'Register New Driver Partner'}
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#E5E5E5] bg-white py-4 px-6 text-center text-xs text-neutral-500">
        <p>© 2026 ZAKA Technologies (Pty) Ltd • Johannesburg, South Africa • All rights reserved</p>
      </footer>
    </div>
  );
};
