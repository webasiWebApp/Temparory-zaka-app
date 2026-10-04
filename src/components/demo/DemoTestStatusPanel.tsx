/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Development Demo Test Status Panel
 * Displays real-time Firestore ride & payment telemetry for the two-sided demo simulation.
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { firestoreService } from '../../firebase/firestoreService';
import { RideDocument, PaymentRecord } from '../../types';
import {
  Car,
  User,
  Shield,
  CreditCard,
  Percent,
  CheckCircle2,
  Clock,
  Key,
  DollarSign,
  AlertCircle,
  X,
  ExternalLink,
} from 'lucide-react';

interface DemoTestStatusPanelProps {
  isOpen: boolean;
  onClose?: () => void;
}

export const DemoTestStatusPanel: React.FC<DemoTestStatusPanelProps> = ({
  isOpen,
  onClose,
}) => {
  const { activeDemoRideId, userProfile } = useAuth();
  const [activeRide, setActiveRide] = useState<RideDocument | null>(null);
  const [paymentRecord, setPaymentRecord] = useState<PaymentRecord | null>(null);

  // Real-time Firestore subscription to active test ride
  useEffect(() => {
    if (!activeDemoRideId) {
      // If activeDemoRideId is not set, listen to most recent demo ride by Amara
      const amaraUid = 'lVpNZkKx9mMnqEMXrKzjgFm2Ju42';
      const unsub = firestoreService.listenToPassengerRides(amaraUid, (rides) => {
        const demoRides = rides.filter((r) => r.isDemo);
        if (demoRides.length > 0) {
          setActiveRide(demoRides[0]);
        } else {
          setActiveRide(null);
        }
      });
      return () => unsub();
    }

    const unsubRide = firestoreService.listenToRide(activeDemoRideId, (ride: RideDocument | null) => {
      setActiveRide(ride);
    });

    const unsubPayment = firestoreService.listenToPaymentForRide(
      activeDemoRideId,
      (payment) => {
        setPaymentRecord(payment);
      }
    );

    return () => {
      unsubRide();
      unsubPayment();
    };
  }, [activeDemoRideId]);

  if (!isOpen) return null;

  const fareAmount = activeRide?.finalFare ?? activeRide?.estimatedFare ?? null;
  const driverEarnings = paymentRecord?.driverEarnings ?? (fareAmount ? Math.round(fareAmount * 0.85 * 100) / 100 : null);
  const platformCommission = paymentRecord?.platformFee ?? (fareAmount ? Math.round(fareAmount * 0.15 * 100) / 100 : null);
  const paymentStatus = paymentRecord?.paymentStatus ?? (activeRide?.paymentStatus || (activeRide?.status === 'completed' ? 'completed' : 'pending'));

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'searching':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">SEARCHING</span>;
      case 'accepted':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-900 border border-blue-300">ACCEPTED</span>;
      case 'driver_arriving':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-300">DRIVER ARRIVING</span>;
      case 'driver_arrived':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-900 border border-purple-300">DRIVER ARRIVED</span>;
      case 'in_progress':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-yellow-100 text-yellow-900 border border-yellow-400">IN PROGRESS</span>;
      case 'completed':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">COMPLETED</span>;
      case 'cancelled':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-neutral-200 text-ink">CANCELLED</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-surface-2 text-ink-2">IDLE / READY</span>;
    }
  };

  return (
    <div
      id="demo-test-status-panel"
      className="w-full border-b border-neutral-300 bg-ink text-white shadow-raised px-3 py-3 sm:px-6 sm:py-4 transition-all"
    >
      <div className="mx-auto max-w-7xl">
        {/* Header row */}
        <div className="flex items-center justify-between pb-2.5 border-b border-neutral-800">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-2 w-2 rounded-full bg-primary animate-ping" />
            <h3 className="text-xs sm:text-sm font-bold tracking-wide uppercase text-primary truncate">
              Demo Test Ride • Live Telemetry
            </h3>
            <span className="text-[11px] font-mono text-neutral-400 hidden sm:inline">
              (Direct Cloud Firestore Stream)
            </span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-ink transition-colors"
              aria-label="Close status panel"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Telemetry Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 pt-3">
          {/* Rider */}
          <div className="rounded-xl bg-neutral-800/80 p-2 border border-neutral-700/60">
            <div className="flex items-center gap-1 text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
              <User className="h-3 w-3 text-amber-400" />
              <span>Rider</span>
            </div>
            <p className="mt-1 text-xs sm:text-sm font-bold text-white truncate">
              Amara Dlamini
            </p>
          </div>

          {/* Driver */}
          <div className="rounded-xl bg-neutral-800/80 p-2 border border-neutral-700/60">
            <div className="flex items-center gap-1 text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
              <Car className="h-3 w-3 text-emerald-400" />
              <span>Driver</span>
            </div>
            <p className="mt-1 text-xs sm:text-sm font-bold text-white truncate">
              Sipho Nkosi
            </p>
          </div>

          {/* Ride ID */}
          <div className="rounded-xl bg-neutral-800/80 p-2 border border-neutral-700/60 col-span-2 sm:col-span-2">
            <div className="flex items-center gap-1 text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
              <ExternalLink className="h-3 w-3 text-primary" />
              <span>Firestore Ride ID</span>
            </div>
            <p className="mt-1 text-xs font-mono text-primary truncate select-all" title={activeRide?.id || 'None'}>
              {activeRide?.id ? activeRide.id : 'No active test ride'}
            </p>
          </div>

          {/* Current Status */}
          <div className="rounded-xl bg-neutral-800/80 p-2 border border-neutral-700/60">
            <div className="flex items-center gap-1 text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
              <Clock className="h-3 w-3 text-blue-400" />
              <span>Status</span>
            </div>
            <div className="mt-1">
              {getStatusBadge(activeRide?.status)}
            </div>
          </div>

          {/* Fare */}
          <div className="rounded-xl bg-neutral-800/80 p-2 border border-neutral-700/60">
            <div className="flex items-center gap-1 text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
              <DollarSign className="h-3 w-3 text-emerald-400" />
              <span>Fare</span>
            </div>
            <p className="mt-1 text-xs sm:text-sm font-bold text-white">
              {fareAmount ? `R${fareAmount.toFixed(2)}` : '—'}
            </p>
          </div>

          {/* Safety PIN */}
          <div className="rounded-xl bg-neutral-800/80 p-2 border border-amber-500/40 bg-amber-950/20">
            <div className="flex items-center gap-1 text-[11px] font-bold text-amber-300 uppercase tracking-wider">
              <Key className="h-3 w-3 text-primary" />
              <span>Safety PIN</span>
            </div>
            <p className="mt-1 text-sm font-mono font-bold text-primary tracking-wider">
              {activeRide?.otp || '—'}
            </p>
          </div>

          {/* Payment Status */}
          <div className="rounded-xl bg-neutral-800/80 p-2 border border-neutral-700/60">
            <div className="flex items-center gap-1 text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
              <CreditCard className="h-3 w-3 text-purple-400" />
              <span>Payment</span>
            </div>
            <p className="mt-1 text-[11px] font-bold uppercase text-white truncate">
              {paymentStatus}
            </p>
          </div>
        </div>

        {/* Financial Splits row */}
        <div className="mt-2.5 flex flex-wrap items-center justify-between rounded-xl bg-neutral-950/70 px-3 py-2 border border-neutral-800 text-[11px]">
          <div className="flex items-center gap-4">
            <span className="text-neutral-400 font-medium">85/15 Commission Split:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-400">Driver Earnings:</span>
              <span className="font-bold text-emerald-400">
                {driverEarnings ? `R${driverEarnings.toFixed(2)}` : '—'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-400">Platform Commission:</span>
              <span className="font-bold text-amber-300">
                {platformCommission ? `R${platformCommission.toFixed(2)}` : '—'}
              </span>
            </div>
          </div>
          <div className="text-[11px] text-ink-3 font-mono mt-1 sm:mt-0">
            Data Source: /rides/{activeRide?.id || '...'} • isDemo: true
          </div>
        </div>
      </div>
    </div>
  );
};
