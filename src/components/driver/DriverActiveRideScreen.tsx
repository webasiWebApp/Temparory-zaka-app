/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Driver Active Ride Screen
 * Clean White + Rounded iPhone-Style Interface
 * Features:
 * - Dedicated handler for accepted, driver_arriving, driver_arrived, and in_progress states
 * - Silent Emergency SOS button with GPS coordinate logging & admin dashboard dispatch
 * - Clean white surfaces, soft shadows, rounded-card geometry, circular action buttons
 */

import React, { useState } from 'react';
import { RideDocument } from '../../types';
import { fareService } from '../../services/fareService';
import { firestoreService } from '../../firebase/firestoreService';
import {
  Car,
  MapPin,
  Phone,
  MessageSquare,
  Navigation,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  X,
  ChevronRight,
  ShieldAlert,
  Radio,
  Send,
  Loader2,
} from 'lucide-react';

interface DriverActiveRideScreenProps {
  ride: RideDocument;
  driverId: string;
  driverLocation?: { latitude: number; longitude: number };
  onStatusUpdated?: () => void;
}

export const DriverActiveRideScreen: React.FC<DriverActiveRideScreenProps> = ({
  ride,
  driverId,
  driverLocation = { latitude: -26.1076, longitude: 28.0567 },
  onStatusUpdated,
}) => {
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [showChatModal, setShowChatModal] = useState<boolean>(false);
  const [chatMessage, setChatMessage] = useState<string>('');
  const [chatSent, setChatSent] = useState<boolean>(false);

  // Emergency SOS state
  const [showSosModal, setShowSosModal] = useState<boolean>(false);
  const [sosNote, setSosNote] = useState<string>('');
  const [sosDispatched, setSosDispatched] = useState<boolean>(
    Boolean(ride.emergencyAlert?.active && ride.emergencyAlert?.triggeredBy === 'driver')
  );
  const [sosMessage, setSosMessage] = useState<string>('');
  const [isSendingSos, setIsSendingSos] = useState<boolean>(false);

  // 1. Action: Start Driving to Pickup (accepted -> driver_arriving)
  const handleStartDriving = async () => {
    setIsProcessing(true);
    try {
      const ok = await firestoreService.startDrivingToPickup(ride.id, driverId);
      if (ok && onStatusUpdated) onStatusUpdated();
    } catch (e) {
      console.error('Failed to start driving:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Action: I've Arrived (driver_arriving -> driver_arrived)
  const handleDriverArrived = async () => {
    setIsProcessing(true);
    try {
      const ok = await firestoreService.markDriverArrived(ride.id, driverId);
      if (ok && onStatusUpdated) onStatusUpdated();
    } catch (e) {
      console.error('Failed to mark arrived:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. Action: Start Ride (driver_arrived -> in_progress)
  const handleStartRide = async () => {
    if (!pinInput || pinInput.trim().length !== 4) {
      setPinError('Safety PIN is required. Ask the passenger for their 4-digit code.');
      return;
    }
    // The driver app does not know the PIN. It is checked by the backend security rules when the
    // trip start is submitted, so it cannot be skipped or guessed from the device.
    setPinError('');
    setIsProcessing(true);
    try {
      const res = await firestoreService.startRide(ride.id, driverId, pinInput);
      if (!res.success) {
        setPinError(res.message || 'Failed to start ride');
      } else if (onStatusUpdated) {
        onStatusUpdated();
      }
    } catch (e) {
      console.error('Failed to start ride:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. Action: Complete / End Ride (in_progress -> completed)
  const handleEndRide = async () => {
    setIsProcessing(true);
    try {
      const ok = await firestoreService.completeRide(
        ride.id,
        driverId,
        ride.finalFare || ride.estimatedFare
      );
      if (ok && onStatusUpdated) onStatusUpdated();
    } catch (e) {
      console.error('Failed to complete ride:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  // 5. Action: Trigger Silent Emergency SOS
  const handleTriggerSos = async () => {
    setIsSendingSos(true);
    try {
      // Obtain latest device GPS or fallback to driverLocation prop
      let coords = { ...driverLocation };
      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 3000,
              maximumAge: 10000,
            });
          });
          coords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          };
        } catch {
          // Fall back to driverLocation
        }
      }

      const res = await firestoreService.sendDriverEmergencySOS({
        rideId: ride.id,
        driverId,
        driverName: ride.driverName || 'Driver',
        coords,
        note: sosNote,
      });

      if (res.success) {
        setSosDispatched(true);
        setSosMessage(res.message);
        setTimeout(() => {
          setShowSosModal(false);
        }, 1800);
      } else {
        setSosMessage(res.message || 'Failed to dispatch alert.');
      }
    } catch (err: any) {
      setSosMessage('Failed to trigger emergency SOS. Try again.');
    } finally {
      setIsSendingSos(false);
    }
  };

  return (
    <div id="driver-active-ride-screen" className="space-y-3.5">
      {/* Silent SOS Dispatched Persistent Banner */}
      {sosDispatched && (
        <div className="rounded-card border border-red-200 bg-red-50/90 backdrop-blur-md p-3.5 flex items-center justify-between gap-3 text-red-900">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-danger text-white animate-pulse">
              <ShieldAlert className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold">Silent SOS Dispatched to Ops</p>
              <p className="text-[11px] text-danger truncate">
                Admin dashboard notified • GPS coordinates actively logged
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-800">
            Active
          </span>
        </div>
      )}

      {/* State & Trip Status Capsule Card */}
      <div className="rounded-card bg-white border border-neutral-100/90 p-4 shadow-card transition-all">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-bold tracking-wide text-primary-text">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {ride.status === 'accepted' && 'RIDE ASSIGNED'}
              {ride.status === 'driver_arriving' && 'EN ROUTE TO PICKUP'}
              {ride.status === 'driver_arrived' && 'AT PICKUP POINT'}
              {ride.status === 'in_progress' && 'TRIP IN PROGRESS'}
            </span>
            <h3 className="mt-1.5 text-base font-bold text-ink tracking-tight">
              {ride.status === 'accepted' && 'Head to Pickup Point'}
              {ride.status === 'driver_arriving' && 'Navigating to Passenger'}
              {ride.status === 'driver_arrived' && 'Passenger Boarding'}
              {ride.status === 'in_progress' && 'Driving to Destination'}
            </h3>
          </div>
          <div className="text-right shrink-0">
            <span className="text-[11px] font-semibold text-neutral-400 block">Fare</span>
            <span className="text-lg font-bold text-ink">
              {fareService.formatZAR(ride.finalFare || ride.estimatedFare)}
            </span>
          </div>
        </div>
      </div>

      {/* Passenger Profile & Quick Actions */}
      <div className="rounded-card bg-white border border-neutral-100/90 p-4 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-text font-bold text-base shrink-0 border border-primary/20">
              {ride.passengerName ? ride.passengerName.charAt(0) : 'P'}
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-ink truncate">
                {ride.passengerName || 'Passenger'}
              </h4>
              <p className="text-[11px] font-bold text-ink-3 font-mono">
                {ride.passengerPhone || '+27 71 890 2345'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Call Passenger Circular Button */}
            <a
              id="btn-driver-call-passenger"
              href={`tel:${ride.passengerPhone}`}
              title="Call Passenger"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-ink hover:bg-neutral-200 active:scale-95 transition-all shadow-card"
            >
              <Phone className="h-4.5 w-4.5" />
            </a>

            {/* Message Passenger Circular Button */}
            <button
              id="btn-driver-message-passenger"
              type="button"
              title="Message Passenger"
              onClick={() => setShowChatModal(true)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-ink hover:bg-neutral-200 active:scale-95 transition-all shadow-card"
            >
              <MessageSquare className="h-4.5 w-4.5" />
            </button>

            {/* Emergency SOS Circular Button */}
            <button
              id="btn-driver-emergency-sos"
              type="button"
              title="Silent Emergency SOS"
              onClick={() => setShowSosModal(true)}
              className={`flex h-11 w-11 items-center justify-center rounded-full active:scale-95 transition-all shadow-card ${
                sosDispatched
                  ? 'bg-danger text-white ring-2 ring-red-300 animate-pulse'
                  : 'bg-red-50 text-danger border border-red-200 hover:bg-red-100'
              }`}
            >
              <ShieldAlert className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Addresses & Route Details */}
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

        <div className="flex items-center justify-between border-t border-line pt-2.5 text-[11px] font-semibold text-ink-3">
          <span>Distance: <strong className="text-ink">{ride.estimatedDistanceKm || 5.0} km</strong></span>
          <span>Category: <strong className="text-primary-text uppercase">{ride.rideType}</strong></span>
          <span>Est: <strong className="text-ink">{ride.estimatedDurationMin || 12} min</strong></span>
        </div>
      </div>

      {/* ================= PRIMARY ACTION CONTROLS ================= */}

      {/* Step 1: When 'accepted' -> Start Driving to Pickup */}
      {ride.status === 'accepted' && (
        <button
          id="btn-start-driving-to-pickup"
          type="button"
          onClick={handleStartDriving}
          disabled={isProcessing}
          className="w-full rounded-full bg-primary py-4 text-sm font-bold text-on-primary hover:bg-primary-hover active:bg-primary-pressed active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Updating Status...</span>
            </>
          ) : (
            <>
              <Navigation className="h-4 w-4" />
              <span>Start Driving to Pickup</span>
            </>
          )}
        </button>
      )}

      {/* Step 2: When 'driver_arriving' -> I've Arrived */}
      {ride.status === 'driver_arriving' && (
        <button
          id="btn-driver-arrived"
          type="button"
          onClick={handleDriverArrived}
          disabled={isProcessing}
          className="w-full rounded-full bg-ink py-4 text-sm font-bold text-white shadow-raised hover:bg-ink active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Updating Status...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>I've Arrived at Pickup</span>
            </>
          )}
        </button>
      )}

      {/* Step 3: When 'driver_arrived' -> Safety PIN & Start Ride */}
      {ride.status === 'driver_arrived' && (
        <div className="space-y-3 rounded-card border border-amber-200 bg-amber-50/70 p-4">
          <div>
            <label className="block text-xs font-bold text-amber-950 mb-1.5">
              Enter Passenger Safety PIN (4-Digits):
            </label>
            <input
              id="input-passenger-otp-pin"
              type="text"
              maxLength={4}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="e.g. 8492"
              className="w-full rounded-input border border-amber-300 bg-white p-3 font-mono text-center text-xl font-bold tracking-widest text-ink focus:outline-none focus:ring-2 focus:ring-primary "
            />
            {pinError && <p className="mt-1 text-xs font-bold text-danger">{pinError}</p>}
          </div>

          <button
            id="btn-start-ride"
            type="button"
            onClick={handleStartRide}
            disabled={isProcessing}
            className="w-full rounded-full bg-primary py-4 text-sm font-bold text-on-primary hover:bg-primary-hover active:bg-primary-pressed active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Verifying Safety PIN...</span>
              </>
            ) : (
              <>
                <Car className="h-4 w-4" />
                <span>Start Ride</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Step 4: When 'in_progress' -> End Ride */}
      {ride.status === 'in_progress' && (
        <button
          id="btn-end-ride"
          type="button"
          onClick={handleEndRide}
          disabled={isProcessing}
          className="w-full rounded-full bg-success py-4 text-sm font-bold text-white hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Completing Trip...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              <span>End Ride • Collect {fareService.formatZAR(ride.finalFare || ride.estimatedFare)}</span>
            </>
          )}
        </button>
      )}

      {/* Driver Silent Emergency SOS Modal */}
      {showSosModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-4">
          <div className="w-full max-w-sm rounded-[20px] bg-white p-5 sm:p-6 shadow-modal space-y-4 text-left border border-line">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-danger">
                  <ShieldAlert className="h-5 w-5" />
                </span>
                <div>
                  <h4 className="text-sm font-bold text-ink">Silent Emergency SOS</h4>
                  <p className="text-[11px] text-ink-3 font-semibold">24/7 Security & Admin Ops</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSosModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-ink-3 hover:bg-neutral-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-card bg-surface-2 p-3 space-y-1 text-xs border border-line">
              <p className="text-ink-2 font-medium">
                This triggers a <strong>silent emergency alert</strong> directly to the ZAKA Admin Dashboard and logs your exact GPS coordinates:
              </p>
              <div className="mt-1 flex items-center gap-2 text-[11px] font-mono text-ink-2">
                <Radio className="h-3.5 w-3.5 text-red-500 animate-pulse" />
                <span>
                  GPS: {driverLocation.latitude.toFixed(5)}, {driverLocation.longitude.toFixed(5)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-ink-3 mb-1">
                Optional Incident Details (or leave blank for immediate dispatch):
              </label>
              <input
                type="text"
                value={sosNote}
                onChange={(e) => setSosNote(e.target.value)}
                placeholder="e.g. Passenger threatening, route deviation"
                className="w-full rounded-input border border-line p-3 text-xs focus:border-red-500 focus:outline-none"
              />
            </div>

            {sosMessage && (
              <p
                className={`text-center text-xs font-bold ${
                  sosDispatched ? 'text-success' : 'text-danger'
                }`}
              >
                {sosMessage}
              </p>
            )}

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowSosModal(false)}
                className="flex-1 rounded-full border border-line py-3 text-xs font-bold text-ink-2 hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-driver-sos"
                onClick={handleTriggerSos}
                disabled={isSendingSos}
                className="flex-1 rounded-full bg-danger py-3 text-xs font-bold text-white hover:bg-red-700 active:scale-95 transition-all shadow-card disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isSendingSos ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Sending SOS...</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>Send Silent SOS</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Driver Chat Modal */}
      {showChatModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-4">
          <div className="w-full max-w-sm rounded-[20px] bg-white p-5 shadow-modal space-y-3.5 text-left border border-line">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-primary-text font-bold text-xs">
                  {ride.passengerName ? ride.passengerName.charAt(0) : 'P'}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-ink">{ride.passengerName || 'Passenger'}</h4>
                  <p className="text-[11px] text-neutral-400 font-semibold">Active Trip Communication</p>
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
                {["I'm on the way", "I have arrived outside", "Traffic is light", "Be there in 2 mins"].map((phrase) => (
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
              placeholder="Type message to passenger..."
              className="w-full rounded-input border border-line p-3 text-xs focus:border-primary focus:outline-none"
            />

            {chatSent && (
              <p className="text-center text-xs font-bold text-success">
                ✓ Message sent to passenger!
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
                  await firestoreService.sendNotification({
                    userId: ride.passengerId,
                    title: `Message from Driver ${ride.driverName || ''}`,
                    message: chatMessage,
                    type: 'ride',
                    read: false,
                    createdAt: new Date().toISOString(),
                  });
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
