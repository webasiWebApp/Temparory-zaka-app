/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Demo Test Mode Control Banner & Switcher
 * Facilitates two-sided real-time ride simulation between Rider (Amara) and Driver (Sipho).
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { DemoTestStatusPanel } from './DemoTestStatusPanel';
import {
  Car,
  User,
  RotateCcw,
  Activity,
  LogOut,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

export const DemoTestBanner: React.FC = () => {
  const {
    isDemoTestMode,
    activeDemoPersona,
    switchDemoTestPersona,
    resetDemoRide,
    exitDemoTestMode,
    activeRole,
    userProfile,
    loading,
  } = useAuth();

  const [isSwitching, setIsSwitching] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showStatusPanel, setShowStatusPanel] = useState(true);

  // Determine current view based on active role or demo persona
  const isRiderView = activeRole === 'passenger' || activeDemoPersona === 'amara';
  const currentPersonaName = isRiderView ? 'Rider — Amara Dlamini' : 'Driver — Sipho Nkosi';
  const nextRoleLabel = isRiderView ? 'Switch to Driver' : 'Switch to Rider';

  // Toggle between Amara and Sipho
  const handleSwitchPersona = async () => {
    if (isSwitching) return;
    setIsSwitching(true);
    try {
      const target = isRiderView ? 'sipho' : 'amara';
      await switchDemoTestPersona(target);
    } catch (err) {
      console.error('Failed to switch demo persona:', err);
    } finally {
      setIsSwitching(false);
    }
  };

  // Reset demo ride
  const handleResetRide = async () => {
    if (isResetting) return;
    setIsResetting(true);
    try {
      await resetDemoRide();
    } catch (err) {
      console.error('Failed to reset demo ride:', err);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div id="demo-test-mode-banner-container" className="w-full shrink-0 z-40 bg-ink text-white select-none">
      {/* Top Banner Bar */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-6">
        {/* Left: Indicator & Current Persona View */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-[11px] sm:text-xs font-bold text-primary uppercase tracking-wider shrink-0">
            <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span>DEMO TEST MODE</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-neutral-200 truncate">
            <span className="text-neutral-400 hidden sm:inline">Current View:</span>
            <span className="inline-flex items-center gap-1.5 font-bold text-white bg-neutral-800/80 px-2 py-0.5 rounded-md border border-neutral-700/60 truncate">
              {isRiderView ? (
                <User className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              ) : (
                <Car className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              )}
              <span className="truncate">{currentPersonaName}</span>
            </span>
          </div>
        </div>

        {/* Right: Actions (Switch, Reset, Status, Exit) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
          {/* Persona Switch Button */}
          <button
            id="btn-demo-switch-persona"
            type="button"
            onClick={handleSwitchPersona}
            disabled={isSwitching || loading}
            className={`flex items-center gap-1.5 rounded-full px-2.5 sm:px-3.5 py-1.5 text-xs font-bold transition-all active:scale-95 shadow-card ${
              isRiderView
                ? 'bg-success text-neutral-950 hover:bg-emerald-400'
                : 'bg-primary text-neutral-950 hover:bg-primary-hover active:bg-primary-pressed'
            } disabled:opacity-50`}
            title={`Switch to ${isRiderView ? 'Driver Sipho' : 'Rider Amara'}`}
          >
            {isSwitching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isRiderView ? (
              <Car className="h-3.5 w-3.5" />
            ) : (
              <User className="h-3.5 w-3.5" />
            )}
            <span className="whitespace-nowrap">{nextRoleLabel}</span>
          </button>

          {/* Reset Demo Ride */}
          <button
            id="btn-demo-reset-ride"
            type="button"
            onClick={handleResetRide}
            disabled={isResetting || isSwitching}
            className="flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-800/90 px-2 sm:px-2.5 py-1.5 text-xs font-bold text-neutral-200 hover:bg-neutral-700 hover:text-white transition-colors active:scale-95 disabled:opacity-50"
            title="Reset demo test ride to start a fresh ride"
          >
            <RotateCcw className={`h-3 w-3 sm:h-3.5 sm:w-3.5 ${isResetting ? 'animate-spin text-primary' : ''}`} />
            <span className="hidden md:inline">Reset Demo Ride</span>
          </button>

          {/* Toggle Live Status Panel */}
          <button
            id="btn-demo-toggle-status"
            type="button"
            onClick={() => setShowStatusPanel((prev) => !prev)}
            className={`flex items-center gap-1 rounded-full border px-2 sm:px-2.5 py-1.5 text-xs font-bold transition-colors active:scale-95 ${
              showStatusPanel
                ? 'border-amber-400/50 bg-amber-500/20 text-primary'
                : 'border-neutral-700 bg-neutral-800/90 text-neutral-300 hover:bg-neutral-700'
            }`}
            title="Toggle real-time Firestore ride & payment telemetry"
          >
            <Activity className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary" />
            <span className="hidden lg:inline">Live Telemetry</span>
            {showStatusPanel ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>

          {/* Exit Demo Mode */}
          <button
            id="btn-demo-exit"
            type="button"
            onClick={exitDemoTestMode}
            className="flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-800/60 p-1.5 sm:px-2 text-xs font-medium text-neutral-400 hover:bg-red-950/40 hover:border-red-600/60 hover:text-red-300 transition-colors"
            title="Exit Demo Test Mode"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Exit</span>
          </button>
        </div>
      </div>

      {/* Real-time Status Panel */}
      <DemoTestStatusPanel
        isOpen={showStatusPanel}
        onClose={() => setShowStatusPanel(false)}
      />
    </div>
  );
};
