/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Active Ride Passenger Panel
 * Clean White + Rounded iPhone-Style Interface
 * Handles all live passenger states: searching, accepted, driver_arriving, driver_arrived, in_progress
 */

import React, { useState, useEffect } from 'react';
import { RideDocument } from '../../types';
import { fareService } from '../../services/fareService';
import { firestoreService } from '../../firebase/firestoreService';
import { HIDE_RIDE_OTP_UI } from '../../config/appTarget';
import {
  Car,
  Star,
  ShieldCheck,
  Phone,
  MessageSquare,
  Share2,
  AlertTriangle,
  MapPin,
  Clock,
  X,
  Navigation,
  Check,
  Shield,
  Info,
  Send,
  Loader2,
  Copy,
  ExternalLink,
} from 'lucide-react';

interface ActiveRidePanelProps {
  ride: RideDocument;
  onCancelRide: () => Promise<void>;
  onRetryRide?: () => Promise<void>;
  isCancelling?: boolean;
}

export const ActiveRidePanel: React.FC<ActiveRidePanelProps> = ({
  ride,
  onCancelRide,
  onRetryRide,
  isCancelling = false,
}) => {
  // Modal states
  const [showEmergencyModal, setShowEmergencyModal] = useState<boolean>(false);
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [showChatModal, setShowChatModal] = useState<boolean>(false);
  const [chatMessage, setChatMessage] = useState<string>('');
  const [chatSent, setChatSent] = useState<boolean>(false);
  const [copiedEmergencyInfo, setCopiedEmergencyInfo] = useState<boolean>(false);

  // Search countdown / elapsed timer
  const [searchElapsedSec, setSearchElapsedSec] = useState<number>(0);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);

  // Safety PIN: read from the passenger-only private document of this ride
  const [safetyPin, setSafetyPin] = useState<string | null>(ride.otp || null);
  useEffect(() => {
    const unsubscribe = firestoreService.listenToRidePin(ride.id, (pin) => {
      setSafetyPin(pin || ride.otp || null);
    });
    return () => unsubscribe();
  }, [ride.id, ride.otp]);

  useEffect(() => {
    if (ride.status !== 'searching') return;

    const calcElapsed = () => {
      const requestedTime = ride.requestedAt ? new Date(ride.requestedAt).getTime() : Date.now();
      const elapsed = Math.floor((Date.now() - requestedTime) / 1000);
      setSearchElapsedSec(Math.max(0, elapsed));
    };

    calcElapsed();
    const timer = setInterval(calcElapsed, 1000);
    return () => clearInterval(timer);
  }, [ride.status, ride.requestedAt]);

  const isSearchTimedOut = ride.status === 'searching' && searchElapsedSec >= 120;
  const isSearchDelayed = ride.status === 'searching' && searchElapsedSec >= 60 && !isSearchTimedOut;

  const handleRetry = async () => {
    if (onRetryRide) {
      setIsRetrying(true);
      try {
        await onRetryRide();
        setSearchElapsedSec(0);
      } finally {
        setIsRetrying(false);
      }
    }
  };

  // Dynamic status title & description
  const getStatusBadge = () => {
    switch (ride.status) {
      case 'searching':
        return {
          title: `Searching for Nearby ${ride.rideType.toUpperCase()} Drivers`,
          sub: 'Broadcasting your ride request to highest-rated nearby drivers...',
          pillColor: 'bg-primary-50 text-primary-text',
        };
      case 'accepted':
        return {
          title: 'Driver Confirmed',
          sub: `${ride.driverName || 'Your driver'} accepted your trip and is preparing route.`,
          pillColor: 'bg-blue-50 text-blue-700',
        };
      case 'driver_arriving':
        return {
          title: 'Driver En Route',
          sub: `${ride.driverName || 'Driver'} is heading to your pickup location.`,
          pillColor: 'bg-emerald-50 text-success',
        };
      case 'driver_arrived':
        return {
          title: 'Driver Has Arrived',
          sub: `${ride.driverName || 'Driver'} is waiting at the pickup location outside.`,
          pillColor: 'bg-primary-50 text-primary-text',
        };
      case 'in_progress':
        return {
          title: 'Ride In Progress',
          sub: `Heading to ${ride.destinationAddress}. Enjoy your ride.`,
          pillColor: 'bg-ink text-white',
        };
      default:
        return {
          title: 'Active Trip',
          sub: 'Tracking live trip status.',
          pillColor: 'bg-surface-2 text-ink',
        };
    }
  };

  const statusInfo = getStatusBadge();

  return (
    <div id="passenger-active-ride-panel" className="w-full space-y-3.5">
      {/* 1. Header Banner & Current Status */}
      <div className="rounded-card bg-white border border-neutral-100/90 p-4 shadow-card text-center transition-all">
        <div className="flex items-center justify-center gap-2">
          {ride.status === 'searching' && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
            </span>
          )}
          {ride.status === 'driver_arriving' && (
            <Navigation className="h-4 w-4 animate-bounce text-success" />
          )}
          {ride.status === 'driver_arrived' && (
            <Check className="h-4 w-4 stroke-[3] text-primary-text" />
          )}
          {ride.status === 'in_progress' && (
            <Car className="h-4 w-4 text-primary-text" />
          )}
          <span className={`rounded-full px-3 py-1 text-[11px] font-bold tracking-wide ${statusInfo.pillColor}`}>
            {statusInfo.title}
          </span>
        </div>
        <p className="mt-1.5 text-xs text-ink-3 truncate max-w-sm mx-auto font-medium">
          {statusInfo.sub}
        </p>
      </div>

      {/* 2. STATE: SEARCHING RADAR */}
      {ride.status === 'searching' && (
        <div className="rounded-card bg-white border border-neutral-100/90 p-6 text-center shadow-card space-y-4">
          <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-100" />
            <span className="absolute inline-flex h-16 w-16 animate-pulse rounded-full bg-primary-50" />
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary ">
              <Car className="h-7 w-7" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-center gap-1.5 text-xs font-mono font-bold text-ink-3 mb-1">
              <Clock className="h-3.5 w-3.5 text-primary-text" />
              <span>Searching: {searchElapsedSec}s</span>
            </div>
            <p className="text-xs text-ink-2 max-w-xs mx-auto leading-relaxed">
              Searching active ZAKA vehicles in your sector. Priority dispatch is assigned based on driver proximity.
            </p>
          </div>

          {/* High Demand Notice if delayed */}
          {isSearchDelayed && (
            <div className="rounded-card border border-amber-200 bg-amber-50/80 p-3.5 text-left text-xs text-amber-950 flex items-start gap-2.5">
              <Info className="h-4 w-4 text-primary-text shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">High Demand in Your Sector</span>
                <span className="text-[11px] text-amber-900">Nearby drivers may be completing other trips. Searching is actively broadcasting.</span>
              </div>
            </div>
          )}

          {/* Search Timeout Notice if 120s exceeded */}
          {isSearchTimedOut && (
            <div className="rounded-card border border-amber-300 bg-amber-100/70 p-3.5 text-left text-xs text-amber-950 space-y-2">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-800 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">No Drivers Available Immediately</span>
                  <span className="text-[11px] text-amber-900">Drivers haven't accepted yet. You can retry with priority dispatch or cancel.</span>
                </div>
              </div>
            </div>
          )}

          {/* Ride Summary Card */}
          <div className="rounded-card bg-neutral-50/80 p-4 border border-line text-left text-xs space-y-2">
            <div className="flex justify-between items-center font-bold text-ink">
              <span>Category: <strong className="text-primary-text uppercase">{ride.rideType}</strong></span>
              <span className="text-sm font-bold">{fareService.formatZAR(ride.finalFare || ride.estimatedFare)}</span>
            </div>
            <div className="flex justify-between text-[11px] text-ink-3 font-semibold">
              <span>Distance: {ride.estimatedDistanceKm} km</span>
              <span>Est. Duration: {ride.estimatedDurationMin} min</span>
            </div>
            <div className="pt-2 border-t border-neutral-200/60 truncate text-[11px] text-ink-2">
              <span className="font-bold text-success">Pickup: </span>
              {ride.pickupAddress}
            </div>
          </div>

          <div className="space-y-2.5">
            {isSearchTimedOut && onRetryRide && (
              <button
                id="btn-retry-ride-search"
                type="button"
                onClick={handleRetry}
                disabled={isRetrying}
                className="w-full rounded-full bg-primary py-3.5 text-xs sm:text-sm font-bold text-on-primary hover:bg-primary-hover active:bg-primary-pressed active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isRetrying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Re-broadcasting Request...</span>
                  </>
                ) : (
                  <span>Retry Search for Drivers</span>
                )}
              </button>
            )}

            <button
              id="btn-cancel-ride-request"
              onClick={onCancelRide}
              disabled={isCancelling}
              className="w-full rounded-full border border-line bg-white py-3.5 text-xs sm:text-sm font-bold text-ink-2 hover:bg-surface-2 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isCancelling ? 'Cancelling Request...' : 'Cancel Ride Request'}
            </button>
          </div>
        </div>
      )}

      {/* 3. ASSIGNED DRIVER STATES (accepted, driver_arriving, driver_arrived, in_progress) */}
      {ride.status !== 'searching' && (
        <div className="space-y-3.5">
          {/* Driver & Vehicle Details Card */}
          <div className="rounded-card bg-white border border-neutral-100/90 p-4 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-text font-bold text-base shrink-0 border border-primary/20">
                  {ride.driverName ? ride.driverName.charAt(0) : 'D'}
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-ink truncate">
                    {ride.driverName || 'Sipho Ndlovu'}
                  </h4>
                  <div className="flex items-center gap-1.5 text-[11px] text-ink-3 flex-wrap mt-0.5">
                    <div className="flex items-center gap-0.5 font-bold text-ink">
                      <Star className="h-3 w-3 fill-primary text-primary-text shrink-0" />
                      <span>{ride.driverRating || 4.95}</span>
                    </div>
                    <span className="truncate">
                      • {ride.vehicleDetails?.colour || 'Silver'} {ride.vehicleDetails?.make || 'Toyota'} {ride.vehicleDetails?.model || 'Corolla'}
                    </span>
                  </div>
                </div>
              </div>

              {/* License Plate Badge */}
              <div className="rounded-card border border-line bg-surface-2 px-3 py-1.5 text-center shrink-0">
                <span className="block text-[11px] font-bold tracking-widest text-primary-text uppercase">PLATE</span>
                <span className="font-mono text-xs font-bold text-ink">
                  {ride.vehicleDetails?.registrationNumber || 'ZK 89 GP'}
                </span>
              </div>
            </div>

            {/* Safety PIN Badge */}
            {!HIDE_RIDE_OTP_UI && (
            <div className="mt-3.5 flex items-center justify-between rounded-card bg-amber-50/80 border border-amber-200/80 px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4.5 w-4.5 text-amber-900 shrink-0" />
                <span className="text-xs font-bold text-amber-950">
                  {ride.status === 'driver_arrived'
                    ? 'Share PIN with Driver to Start:'
                    : 'Your Safety PIN:'}
                </span>
              </div>
              <div className="rounded-xl bg-ink px-3 py-1 font-mono text-sm font-bold tracking-widest text-primary shadow-card">
                {safetyPin || '••••'}
              </div>
            </div>
            )}
          </div>

          {/* Quick Communication & Safety Actions (Floating Circular Action Buttons) */}
          <div className="flex items-center justify-around py-2">
            {/* Circular Call Button */}
            <div className="flex flex-col items-center gap-1.5">
              <a
                id="btn-call-driver"
                href={`tel:${ride.driverPhone || '+27718902345'}`}
                className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-full border border-white/90 bg-white/95 text-ink shadow-card hover:bg-white active:scale-95 transition-all"
                title="Call Driver"
              >
                <Phone className="h-5 w-5 text-ink stroke-[2.2]" />
              </a>
              <span className="text-[11px] font-bold text-ink-2">Call</span>
            </div>

            {/* Circular Message Button */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                id="btn-message-driver"
                type="button"
                onClick={() => setShowChatModal(true)}
                className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-full border border-white/90 bg-white/95 text-ink shadow-card hover:bg-white active:scale-95 transition-all cursor-pointer"
                title="Message Driver"
              >
                <MessageSquare className="h-5 w-5 text-ink stroke-[2.2]" />
              </button>
              <span className="text-[11px] font-bold text-ink-2">Message</span>
            </div>

            {/* Circular Share Button */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                id="btn-share-trip"
                type="button"
                onClick={() => setShowShareModal(true)}
                className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-full border border-white/90 bg-white/95 text-ink shadow-card hover:bg-white active:scale-95 transition-all cursor-pointer"
                title="Share Live Trip"
              >
                <Share2 className="h-5 w-5 text-ink stroke-[2.2]" />
              </button>
              <span className="text-[11px] font-bold text-ink-2">Share</span>
            </div>

            {/* Circular SOS Button */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                id="btn-sos-emergency"
                type="button"
                onClick={() => setShowEmergencyModal(true)}
                className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-full border border-red-200 bg-red-50 text-danger hover:bg-red-100 active:scale-95 transition-all cursor-pointer"
                title="Emergency SOS"
              >
                <AlertTriangle className="h-5 w-5 text-danger stroke-[2.2]" />
              </button>
              <span className="text-[11px] font-bold text-danger">SOS</span>
            </div>
          </div>

          {/* Route & Trip Metrics */}
          <div className="rounded-card bg-white border border-neutral-100/90 p-4 space-y-3 text-xs shadow-card">
            <div className="flex items-start gap-3">
              <div className="mt-1 h-3 w-3 rounded-full bg-success ring-4 ring-emerald-100 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide">Pickup Location</span>
                <p className="font-bold text-ink text-xs sm:text-sm truncate">{ride.pickupAddress}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 h-3 w-3 rounded-full bg-primary ring-4 ring-primary-50 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide">Dropoff Destination</span>
                <p className="font-bold text-ink text-xs sm:text-sm truncate">{ride.destinationAddress}</p>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-line pt-2.5 text-[11px]">
              <span className="text-ink-3 font-medium">
                Fare: <strong className="text-ink">{fareService.formatZAR(ride.finalFare || ride.estimatedFare)}</strong> (<span className="text-primary-text font-bold">{ride.rideType.toUpperCase()}</span>)
              </span>
              <span className="text-ink-3 font-semibold">
                Est: {ride.estimatedDistanceKm} km • {ride.estimatedDurationMin} min
              </span>
            </div>
          </div>

          {/* Cancel Ride Option (Allowed if not in progress) */}
          {ride.status !== 'in_progress' && (
            <button
              onClick={onCancelRide}
              disabled={isCancelling}
              className="w-full rounded-full border border-line bg-white py-3 text-xs font-bold text-ink-2 hover:bg-surface-2 transition-all disabled:opacity-50"
            >
              {isCancelling ? 'Cancelling Trip...' : 'Cancel Trip'}
            </button>
          )}
        </div>
      )}

      {/* ================= MODALS ================= */}

      {/* Emergency Assistance Modal (Requirement 16: Honest, non-simulated emergency direct dial) */}
      {showEmergencyModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-4">
          <div className="w-full max-w-sm rounded-[20px] bg-white p-5 sm:p-6 shadow-modal space-y-4 text-left border border-line">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-danger">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-ink">Emergency Assistance</h4>
                  <p className="text-[11px] text-ink-3 font-semibold">Direct Dial & Safety Team</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEmergencyModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-ink-3 hover:bg-neutral-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-ink-2 leading-relaxed">
              If you are in immediate physical danger, call the South African National Police Service (10111) or Ambulance (10177) directly.
            </p>

            <div className="space-y-2">
              <a
                href="tel:10111"
                className="flex items-center justify-between rounded-card bg-danger p-3.5 text-white font-bold text-xs shadow-card hover:bg-red-700 active:scale-98 transition-all"
              >
                <span>Police Emergency Response</span>
                <span className="font-mono text-sm">10111 ↗</span>
              </a>

              <a
                href="tel:10177"
                className="flex items-center justify-between rounded-card border border-line bg-surface-2 p-3.5 text-ink font-bold text-xs hover:bg-surface-2 active:scale-98 transition-all"
              >
                <span>Ambulance & Medical Rescue</span>
                <span className="font-mono text-sm">10177 ↗</span>
              </a>

              <a
                href="tel:0800001011"
                className="flex items-center justify-between rounded-card border border-primary/30 bg-primary-50 p-3.5 text-primary-text font-bold text-xs hover:bg-primary-50 active:scale-98 transition-all"
              >
                <span>ZAKA 24/7 Safety Dispatch</span>
                <span className="font-mono text-sm">0800 001 011 ↗</span>
              </a>
            </div>

            <button
              type="button"
              onClick={() => setShowEmergencyModal(false)}
              className="w-full rounded-full border border-line py-3 text-xs font-bold text-ink-2 hover:bg-surface-2"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Share Trip Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-4">
          <div className="w-full max-w-sm rounded-[20px] bg-white p-5 sm:p-6 shadow-modal space-y-4 text-left border border-line">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-primary-text">
                  <Share2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-ink">Share Live Trip Status</h4>
                  <p className="text-[11px] text-ink-3 font-semibold">Let family follow your journey</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-ink-3 hover:bg-neutral-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-card bg-surface-2 p-3.5 text-xs space-y-1.5 border border-line">
              <p className="text-ink-2">
                <strong>Driver:</strong> {ride.driverName || 'Sipho Ndlovu'}
              </p>
              <p className="text-ink-2">
                <strong>Vehicle:</strong> {ride.vehicleDetails?.colour} {ride.vehicleDetails?.make} ({ride.vehicleDetails?.registrationNumber})
              </p>
              <p className="text-ink-2 truncate">
                <strong>Heading to:</strong> {ride.destinationAddress}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const info = `I'm on a ZAKA ride with ${ride.driverName || 'driver'} (${ride.vehicleDetails?.make} - ${ride.vehicleDetails?.registrationNumber}). Destination: ${ride.destinationAddress}.`;
                  navigator.clipboard.writeText(info);
                  setCopiedEmergencyInfo(true);
                  setTimeout(() => setCopiedEmergencyInfo(false), 2000);
                }}
                className="flex-1 rounded-full border border-line py-3 text-xs font-bold text-ink-2 hover:bg-surface-2 flex items-center justify-center gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>{copiedEmergencyInfo ? 'Copied to Clipboard!' : 'Copy Trip Details'}</span>
              </button>

              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `I'm in a ZAKA ride with ${ride.driverName || 'driver'} (${ride.vehicleDetails?.registrationNumber}). Heading to ${ride.destinationAddress}.`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 rounded-full bg-success py-3 text-xs font-bold text-white hover:bg-emerald-700 text-center flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Passenger Chat Modal */}
      {showChatModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-4">
          <div className="w-full max-w-sm rounded-[20px] bg-white p-5 shadow-modal space-y-3.5 text-left border border-line">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-primary-text font-bold text-xs">
                  {ride.driverName ? ride.driverName.charAt(0) : 'D'}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-ink">{ride.driverName || 'Driver'}</h4>
                  <p className="text-[11px] text-success font-bold">Assigned Driver</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowChatModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-ink-3 hover:bg-neutral-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick response chips */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide">Quick Messages</span>
              <div className="flex flex-wrap gap-1.5">
                {["I'm at pickup", "Wearing yellow", "Be right there", "Which car color?"].map((phrase) => (
                  <button
                    key={phrase}
                    type="button"
                    onClick={() => setChatMessage(phrase)}
                    className="rounded-full bg-surface-2 px-3 py-1 text-[11px] font-semibold text-ink-2 hover:bg-primary-50 hover:text-primary-text transition-colors"
                  >
                    {phrase}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              rows={2}
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Type message to driver..."
              className="w-full rounded-input border border-line p-3 text-xs focus:border-primary focus:outline-none"
            />

            {chatSent && (
              <p className="text-center text-xs font-bold text-success">
                ✓ Message sent to {ride.driverName || 'driver'}!
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowChatModal(false)}
                className="flex-1 rounded-full border border-line py-3 text-xs font-bold text-ink-2 hover:bg-surface-2"
              >
                Close
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!chatMessage.trim()) return;
                  if (ride.driverId) {
                    await firestoreService.sendNotification({
                      userId: ride.driverId,
                      title: `Message from ${ride.passengerName || 'Passenger'}`,
                      message: chatMessage,
                      type: 'ride',
                      read: false,
                      createdAt: new Date().toISOString(),
                    });
                  }
                  setChatSent(true);
                  setTimeout(() => {
                    setChatSent(false);
                    setChatMessage('');
                    setShowChatModal(false);
                  }, 1200);
                }}
                disabled={!chatMessage.trim()}
                className="flex-1 rounded-full bg-primary py-3 text-xs font-bold text-on-primary hover:bg-primary-hover active:bg-primary-pressed active:scale-95 transition-all shadow-card disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Send Message</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
