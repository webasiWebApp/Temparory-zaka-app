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
          pillColor: 'bg-[#FFF5EB] text-[#FF7A00]',
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
          pillColor: 'bg-emerald-50 text-emerald-700',
        };
      case 'driver_arrived':
        return {
          title: 'Driver Has Arrived',
          sub: `${ride.driverName || 'Driver'} is waiting at the pickup location outside.`,
          pillColor: 'bg-[#FFF5EB] text-[#FF7A00]',
        };
      case 'in_progress':
        return {
          title: 'Ride In Progress',
          sub: `Heading to ${ride.destinationAddress}. Enjoy your ride.`,
          pillColor: 'bg-neutral-900 text-white',
        };
      default:
        return {
          title: 'Active Trip',
          sub: 'Tracking live trip status.',
          pillColor: 'bg-neutral-100 text-neutral-800',
        };
    }
  };

  const statusInfo = getStatusBadge();

  return (
    <div id="passenger-active-ride-panel" className="w-full space-y-3.5">
      {/* 1. Header Banner & Current Status */}
      <div className="rounded-[28px] bg-white border border-neutral-100/90 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)] text-center transition-all">
        <div className="flex items-center justify-center gap-2">
          {ride.status === 'searching' && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF7A00] opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#FF7A00]" />
            </span>
          )}
          {ride.status === 'driver_arriving' && (
            <Navigation className="h-4 w-4 animate-bounce text-emerald-600" />
          )}
          {ride.status === 'driver_arrived' && (
            <Check className="h-4 w-4 stroke-[3] text-[#FF7A00]" />
          )}
          {ride.status === 'in_progress' && (
            <Car className="h-4 w-4 text-[#FF7A00]" />
          )}
          <span className={`rounded-full px-3 py-1 text-[11px] font-black tracking-wide ${statusInfo.pillColor}`}>
            {statusInfo.title}
          </span>
        </div>
        <p className="mt-1.5 text-xs text-neutral-500 truncate max-w-sm mx-auto font-medium">
          {statusInfo.sub}
        </p>
      </div>

      {/* 2. STATE: SEARCHING RADAR */}
      {ride.status === 'searching' && (
        <div className="rounded-[32px] bg-white border border-neutral-100/90 p-6 text-center shadow-[0_12px_36px_rgba(0,0,0,0.05)] space-y-4">
          <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF7A00]/20" />
            <span className="absolute inline-flex h-16 w-16 animate-pulse rounded-full bg-[#FF7A00]/10" />
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FF7A00] text-white shadow-[0_6px_20px_rgba(255,122,0,0.3)]">
              <Car className="h-7 w-7" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-center gap-1.5 text-xs font-mono font-bold text-neutral-500 mb-1">
              <Clock className="h-3.5 w-3.5 text-[#FF7A00]" />
              <span>Searching: {searchElapsedSec}s</span>
            </div>
            <p className="text-xs text-neutral-600 max-w-xs mx-auto leading-relaxed">
              Searching active ZAKA vehicles in your sector. Priority dispatch is assigned based on driver proximity.
            </p>
          </div>

          {/* High Demand Notice if delayed */}
          {isSearchDelayed && (
            <div className="rounded-[22px] border border-amber-200 bg-amber-50/80 p-3.5 text-left text-xs text-amber-950 flex items-start gap-2.5">
              <Info className="h-4 w-4 text-[#FF7A00] shrink-0 mt-0.5" />
              <div>
                <span className="font-black block">High Demand in Your Sector</span>
                <span className="text-[11px] text-amber-900">Nearby drivers may be completing other trips. Searching is actively broadcasting.</span>
              </div>
            </div>
          )}

          {/* Search Timeout Notice if 120s exceeded */}
          {isSearchTimedOut && (
            <div className="rounded-[22px] border border-amber-300 bg-amber-100/70 p-3.5 text-left text-xs text-amber-950 space-y-2">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-800 shrink-0 mt-0.5" />
                <div>
                  <span className="font-black block">No Drivers Available Immediately</span>
                  <span className="text-[11px] text-amber-900">Drivers haven't accepted yet. You can retry with priority dispatch or cancel.</span>
                </div>
              </div>
            </div>
          )}

          {/* Ride Summary Card */}
          <div className="rounded-[24px] bg-neutral-50/80 p-4 border border-neutral-100 text-left text-xs space-y-2">
            <div className="flex justify-between items-center font-black text-neutral-900">
              <span>Category: <strong className="text-[#FF7A00] uppercase">{ride.rideType}</strong></span>
              <span className="text-sm font-black">{fareService.formatZAR(ride.finalFare || ride.estimatedFare)}</span>
            </div>
            <div className="flex justify-between text-[11px] text-neutral-500 font-semibold">
              <span>Distance: {ride.estimatedDistanceKm} km</span>
              <span>Est. Duration: {ride.estimatedDurationMin} min</span>
            </div>
            <div className="pt-2 border-t border-neutral-200/60 truncate text-[11px] text-neutral-700">
              <span className="font-black text-emerald-600">Pickup: </span>
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
                className="w-full rounded-full bg-[#FF7A00] py-3.5 text-xs sm:text-sm font-black text-white shadow-[0_8px_20px_rgba(255,122,0,0.25)] hover:bg-[#E66E00] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
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
              className="w-full rounded-full border border-neutral-200 bg-white py-3.5 text-xs sm:text-sm font-bold text-neutral-700 hover:bg-neutral-50 active:scale-[0.98] transition-all disabled:opacity-50"
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
          <div className="rounded-[28px] bg-white border border-neutral-100/90 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FFF5EB] text-[#FF7A00] font-black text-base shrink-0 shadow-xs border border-[#FF7A00]/20">
                  {ride.driverName ? ride.driverName.charAt(0) : 'D'}
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-black text-neutral-900 truncate">
                    {ride.driverName || 'Sipho Ndlovu'}
                  </h4>
                  <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 flex-wrap mt-0.5">
                    <div className="flex items-center gap-0.5 font-black text-neutral-800">
                      <Star className="h-3 w-3 fill-[#FF7A00] text-[#FF7A00] shrink-0" />
                      <span>{ride.driverRating || 4.95}</span>
                    </div>
                    <span className="truncate">
                      • {ride.vehicleDetails?.colour || 'Silver'} {ride.vehicleDetails?.make || 'Toyota'} {ride.vehicleDetails?.model || 'Corolla'}
                    </span>
                  </div>
                </div>
              </div>

              {/* License Plate Badge */}
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-center shrink-0">
                <span className="block text-[8px] font-black tracking-widest text-[#FF7A00] uppercase">PLATE</span>
                <span className="font-mono text-xs font-black text-neutral-900">
                  {ride.vehicleDetails?.registrationNumber || 'ZK 89 GP'}
                </span>
              </div>
            </div>

            {/* Safety PIN Badge */}
            <div className="mt-3.5 flex items-center justify-between rounded-2xl bg-amber-50/80 border border-amber-200/80 px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4.5 w-4.5 text-amber-900 shrink-0" />
                <span className="text-xs font-black text-amber-950">
                  {ride.status === 'driver_arrived'
                    ? 'Share PIN with Driver to Start:'
                    : 'Your Safety PIN:'}
                </span>
              </div>
              <div className="rounded-xl bg-neutral-900 px-3 py-1 font-mono text-sm font-black tracking-widest text-[#FF7A00] shadow-xs">
                {safetyPin || '••••'}
              </div>
            </div>
          </div>

          {/* Quick Communication & Safety Actions (Floating Circular Action Buttons) */}
          <div className="flex items-center justify-around py-2">
            {/* Circular Call Button */}
            <div className="flex flex-col items-center gap-1.5">
              <a
                id="btn-call-driver"
                href={`tel:${ride.driverPhone || '+27718902345'}`}
                className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-full border border-white/90 bg-white/95 text-neutral-800 shadow-[0_6px_20px_rgba(0,0,0,0.06)] hover:bg-white active:scale-95 transition-all"
                title="Call Driver"
              >
                <Phone className="h-5 w-5 text-neutral-800 stroke-[2.2]" />
              </a>
              <span className="text-[11px] font-bold text-neutral-700">Call</span>
            </div>

            {/* Circular Message Button */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                id="btn-message-driver"
                type="button"
                onClick={() => setShowChatModal(true)}
                className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-full border border-white/90 bg-white/95 text-neutral-800 shadow-[0_6px_20px_rgba(0,0,0,0.06)] hover:bg-white active:scale-95 transition-all cursor-pointer"
                title="Message Driver"
              >
                <MessageSquare className="h-5 w-5 text-neutral-800 stroke-[2.2]" />
              </button>
              <span className="text-[11px] font-bold text-neutral-700">Message</span>
            </div>

            {/* Circular Share Button */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                id="btn-share-trip"
                type="button"
                onClick={() => setShowShareModal(true)}
                className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-full border border-white/90 bg-white/95 text-neutral-800 shadow-[0_6px_20px_rgba(0,0,0,0.06)] hover:bg-white active:scale-95 transition-all cursor-pointer"
                title="Share Live Trip"
              >
                <Share2 className="h-5 w-5 text-neutral-800 stroke-[2.2]" />
              </button>
              <span className="text-[11px] font-bold text-neutral-700">Share</span>
            </div>

            {/* Circular SOS Button */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                id="btn-sos-emergency"
                type="button"
                onClick={() => setShowEmergencyModal(true)}
                className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600 shadow-[0_6px_20px_rgba(239,68,68,0.18)] hover:bg-red-100 active:scale-95 transition-all cursor-pointer"
                title="Emergency SOS"
              >
                <AlertTriangle className="h-5 w-5 text-red-600 stroke-[2.2]" />
              </button>
              <span className="text-[11px] font-black text-red-600">SOS</span>
            </div>
          </div>

          {/* Route & Trip Metrics */}
          <div className="rounded-[28px] bg-white border border-neutral-100/90 p-4 space-y-3 text-xs shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
            <div className="flex items-start gap-3">
              <div className="mt-1 h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-emerald-100 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">Pickup Location</span>
                <p className="font-bold text-neutral-900 text-xs sm:text-sm truncate">{ride.pickupAddress}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 h-3 w-3 rounded-full bg-[#FF7A00] ring-4 ring-[#FFF5EB] shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">Dropoff Destination</span>
                <p className="font-bold text-neutral-900 text-xs sm:text-sm truncate">{ride.destinationAddress}</p>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-neutral-100 pt-2.5 text-[11px]">
              <span className="text-neutral-500 font-medium">
                Fare: <strong className="text-neutral-900">{fareService.formatZAR(ride.finalFare || ride.estimatedFare)}</strong> (<span className="text-[#FF7A00] font-black">{ride.rideType.toUpperCase()}</span>)
              </span>
              <span className="text-neutral-500 font-semibold">
                Est: {ride.estimatedDistanceKm} km • {ride.estimatedDurationMin} min
              </span>
            </div>
          </div>

          {/* Cancel Ride Option (Allowed if not in progress) */}
          {ride.status !== 'in_progress' && (
            <button
              onClick={onCancelRide}
              disabled={isCancelling}
              className="w-full rounded-full border border-neutral-200 bg-white py-3 text-xs font-bold text-neutral-600 hover:bg-neutral-50 transition-all disabled:opacity-50"
            >
              {isCancelling ? 'Cancelling Trip...' : 'Cancel Trip'}
            </button>
          )}
        </div>
      )}

      {/* ================= MODALS ================= */}

      {/* Emergency Assistance Modal (Requirement 16: Honest, non-simulated emergency direct dial) */}
      {showEmergencyModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4">
          <div className="w-full max-w-sm rounded-[32px] bg-white p-5 sm:p-6 shadow-2xl space-y-4 text-left border border-neutral-100">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-neutral-900">Emergency Assistance</h4>
                  <p className="text-[11px] text-neutral-500 font-semibold">Direct Dial & Safety Team</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEmergencyModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed">
              If you are in immediate physical danger, call the South African National Police Service (10111) or Ambulance (10177) directly.
            </p>

            <div className="space-y-2">
              <a
                href="tel:10111"
                className="flex items-center justify-between rounded-2xl bg-red-600 p-3.5 text-white font-black text-xs shadow-md hover:bg-red-700 active:scale-98 transition-all"
              >
                <span>Police Emergency Response</span>
                <span className="font-mono text-sm">10111 ↗</span>
              </a>

              <a
                href="tel:10177"
                className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-neutral-50 p-3.5 text-neutral-800 font-black text-xs hover:bg-neutral-100 active:scale-98 transition-all"
              >
                <span>Ambulance & Medical Rescue</span>
                <span className="font-mono text-sm">10177 ↗</span>
              </a>

              <a
                href="tel:0800001011"
                className="flex items-center justify-between rounded-2xl border border-[#FF7A00]/30 bg-[#FFF5EB] p-3.5 text-[#FF7A00] font-black text-xs hover:bg-[#FFEADA] active:scale-98 transition-all"
              >
                <span>ZAKA 24/7 Safety Dispatch</span>
                <span className="font-mono text-sm">0800 001 011 ↗</span>
              </a>
            </div>

            <button
              type="button"
              onClick={() => setShowEmergencyModal(false)}
              className="w-full rounded-full border border-neutral-200 py-3 text-xs font-bold text-neutral-700 hover:bg-neutral-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Share Trip Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4">
          <div className="w-full max-w-sm rounded-[32px] bg-white p-5 sm:p-6 shadow-2xl space-y-4 text-left border border-neutral-100">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF5EB] text-[#FF7A00]">
                  <Share2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-neutral-900">Share Live Trip Status</h4>
                  <p className="text-[11px] text-neutral-500 font-semibold">Let family follow your journey</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-2xl bg-neutral-50 p-3.5 text-xs space-y-1.5 border border-neutral-100">
              <p className="text-neutral-700">
                <strong>Driver:</strong> {ride.driverName || 'Sipho Ndlovu'}
              </p>
              <p className="text-neutral-700">
                <strong>Vehicle:</strong> {ride.vehicleDetails?.colour} {ride.vehicleDetails?.make} ({ride.vehicleDetails?.registrationNumber})
              </p>
              <p className="text-neutral-700 truncate">
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
                className="flex-1 rounded-full border border-neutral-200 py-3 text-xs font-bold text-neutral-700 hover:bg-neutral-50 flex items-center justify-center gap-1.5"
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
                className="flex-1 rounded-full bg-emerald-600 py-3 text-xs font-black text-white hover:bg-emerald-700 text-center flex items-center justify-center gap-1.5"
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4">
          <div className="w-full max-w-sm rounded-[32px] bg-white p-5 shadow-2xl space-y-3.5 text-left border border-neutral-100">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFF5EB] text-[#FF7A00] font-black text-xs">
                  {ride.driverName ? ride.driverName.charAt(0) : 'D'}
                </div>
                <div>
                  <h4 className="text-xs font-black text-neutral-900">{ride.driverName || 'Driver'}</h4>
                  <p className="text-[10px] text-emerald-600 font-bold">Assigned Driver</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowChatModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick response chips */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">Quick Messages</span>
              <div className="flex flex-wrap gap-1.5">
                {["I'm at pickup", "Wearing yellow", "Be right there", "Which car color?"].map((phrase) => (
                  <button
                    key={phrase}
                    type="button"
                    onClick={() => setChatMessage(phrase)}
                    className="rounded-full bg-neutral-100 px-3 py-1 text-[11px] font-semibold text-neutral-700 hover:bg-[#FFF5EB] hover:text-[#FF7A00] transition-colors"
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
              className="w-full rounded-2xl border border-neutral-200 p-3 text-xs focus:border-[#FF7A00] focus:outline-none"
            />

            {chatSent && (
              <p className="text-center text-xs font-bold text-emerald-600">
                ✓ Message sent to {ride.driverName || 'driver'}!
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowChatModal(false)}
                className="flex-1 rounded-full border border-neutral-200 py-3 text-xs font-bold text-neutral-700 hover:bg-neutral-50"
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
                className="flex-1 rounded-full bg-[#FF7A00] py-3 text-xs font-black text-white hover:bg-[#E66E00] active:scale-95 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5"
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
