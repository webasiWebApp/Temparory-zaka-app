/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Ride History & Detailed Receipts
 * Clean White + Rounded iPhone-Style Interface
 * Mobile-first modal with filter pills, ZAR pricing breakdown, payment status & driver rating details
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { firestoreService } from '../../firebase/firestoreService';
import { RideDocument, PaymentRecord, RatingRecord } from '../../types';
import { fareService } from '../../services/fareService';
import {
  X,
  Clock,
  MapPin,
  Car,
  ChevronRight,
  Receipt,
  Star,
  Banknote,
  CreditCard,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  AlertCircle,
  FileText,
  Wallet,
} from 'lucide-react';

interface RideHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RideHistoryModal: React.FC<RideHistoryModalProps> = ({ isOpen, onClose }) => {
  const { userProfile, activeRole } = useAuth();
  const [rides, setRides] = useState<RideDocument[]>([]);
  const [filter, setFilter] = useState<'all' | 'completed' | 'cancelled'>('all');
  const [selectedRide, setSelectedRide] = useState<RideDocument | null>(null);
  const [selectedRidePayment, setSelectedRidePayment] = useState<PaymentRecord | null>(null);
  const [existingRating, setExistingRating] = useState<RatingRecord | null>(null);
  const [ratingVal, setRatingVal] = useState<number>(5);
  const [ratingComment, setRatingComment] = useState<string>('');
  const [isSubmittingRating, setIsSubmittingRating] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !userProfile?.uid) return;

    if (activeRole === 'passenger') {
      const unsub = firestoreService.listenToPassengerRides(userProfile.uid, (r) => {
        setRides(r);
      });
      return () => unsub();
    } else {
      const unsub = firestoreService.listenToDriverRides(userProfile.uid, (r) => {
        setRides(r);
      });
      return () => unsub();
    }
  }, [isOpen, userProfile?.uid, activeRole]);

  // Listen to payment record and rating when a ride is selected
  useEffect(() => {
    if (!selectedRide) {
      setSelectedRidePayment(null);
      setExistingRating(null);
      return;
    }

    const unsub = firestoreService.listenToPaymentForRide(selectedRide.id, (pay) => {
      setSelectedRidePayment(pay);
    });

    if (userProfile?.uid) {
      firestoreService.getRatingForRideAndUser(selectedRide.id, userProfile.uid).then((r) => {
        setExistingRating(r);
      });
    }

    return () => unsub();
  }, [selectedRide, userProfile?.uid]);

  const handleSubmitRating = async () => {
    if (!selectedRide || !userProfile?.uid || !selectedRide.driverId) return;
    setIsSubmittingRating(true);
    try {
      await firestoreService.submitRating({
        rideId: selectedRide.id,
        passengerId: selectedRide.passengerId,
        driverId: selectedRide.driverId,
        fromUserId: userProfile.uid,
        toUserId: selectedRide.driverId,
        fromRole: 'passenger',
        toRole: 'driver',
        rating: ratingVal,
        comment: ratingComment.trim(),
        createdAt: new Date().toISOString(),
      });
      const updated = await firestoreService.getRatingForRideAndUser(selectedRide.id, userProfile.uid);
      setExistingRating(updated);
    } catch (e) {
      console.warn('Error submitting rating in history:', e);
    } finally {
      setIsSubmittingRating(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredRides = rides.filter((r) => {
    if (filter === 'completed') return r.status === 'completed';
    if (filter === 'cancelled') return r.status === 'cancelled';
    return true;
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4 sm:pb-28 backdrop-blur-xs cursor-pointer"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-sheet sm:rounded-[20px] border border-line bg-white p-4 sm:p-6 shadow-modal space-y-4 max-h-[90dvh] sm:max-h-[calc(100dvh-9rem)] flex flex-col overflow-hidden pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:pb-6 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-primary-text">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-ink">
                {activeRole === 'driver' ? 'Driver Trip Ledger' : 'Ride History'}
              </h3>
              <p className="text-[11px] text-ink-3 font-semibold">{rides.length} trips total</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close history"
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-surface-2 text-ink-2 hover:bg-neutral-200 active:scale-95 transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Selected Ride Receipt Detail View */}
        {selectedRide ? (
          <div className="space-y-3.5 overflow-y-auto pr-1">
            <button
              onClick={() => setSelectedRide(null)}
              className="text-xs font-bold text-ink-2 hover:text-ink flex items-center gap-1.5 py-1"
            >
              ← Back to all trips
            </button>

            <div className="rounded-card border border-line bg-white p-4 space-y-3.5 text-xs shadow-card">
              {/* Receipt Top Banner */}
              <div className="flex justify-between items-start border-b border-line pb-3">
                <div>
                  <span className="inline-block rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-bold text-primary-text uppercase tracking-wide">
                    Official ZAKA Receipt
                  </span>
                  <p className="text-[11px] font-mono text-ink-3 mt-1 font-semibold">
                    Trip #{selectedRide.id.substring(0, 10)}
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    {new Date(selectedRide.createdAt).toLocaleString([], {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xl font-bold text-ink">
                    {fareService.formatZAR(selectedRide.finalFare || selectedRide.estimatedFare || 35.0)}
                  </span>
                  <span
                    className={`block text-[11px] font-bold uppercase mt-0.5 ${
                      selectedRide.status === 'completed'
                        ? 'text-success'
                        : selectedRide.status === 'cancelled'
                        ? 'text-red-500'
                        : 'text-amber-600'
                    }`}
                  >
                    {selectedRide.status}
                  </span>
                </div>
              </div>

              {/* Addresses Journey */}
              <div className="space-y-2.5 rounded-card bg-neutral-50/80 p-3.5 border border-line">
                <div className="flex items-start gap-2.5">
                  <div className="mt-1 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-emerald-100 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold text-neutral-400 uppercase">Pickup</span>
                    <p className="font-bold text-ink text-xs">{selectedRide.pickupAddress}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="mt-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-primary-50 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold text-neutral-400 uppercase">Destination</span>
                    <p className="font-bold text-ink text-xs">{selectedRide.destinationAddress}</p>
                  </div>
                </div>
              </div>

              {/* Driver or Passenger Details */}
              {selectedRide.driverName && (
                <div className="flex items-center justify-between rounded-card bg-white p-3 border border-line">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-primary-text font-bold text-xs">
                      {selectedRide.driverName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-ink text-xs">{selectedRide.driverName}</p>
                      <p className="text-[11px] text-ink-3 font-mono">
                        {selectedRide.vehicleDetails?.registrationNumber || 'ZK Verified Driver'}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                    Verified
                  </span>
                </div>
              )}

              {/* Payment Details */}
              <div className="space-y-1.5 border-t border-line pt-2.5 text-xs">
                <div className="flex justify-between text-ink-2">
                  <span>Payment Method:</span>
                  <span className="font-bold uppercase text-ink">{selectedRide.paymentMethod || 'cash'}</span>
                </div>
                <div className="flex justify-between text-ink-2">
                  <span>Payment Status:</span>
                  <span className={`font-bold uppercase ${
                    selectedRide.paymentStatus === 'paid' ? 'text-success' : 'text-amber-600'
                  }`}>
                    {selectedRide.paymentStatus || (selectedRide.status === 'completed' ? 'paid' : 'pending')}
                  </span>
                </div>
                <div className="flex justify-between text-ink-2">
                  <span>Vehicle Tier:</span>
                  <span className="font-bold uppercase text-primary-text">{selectedRide.rideType}</span>
                </div>
                {selectedRide.estimatedDistanceKm && (
                  <div className="flex justify-between text-ink-2">
                    <span>Trip Distance:</span>
                    <span className="font-bold text-ink">{selectedRide.estimatedDistanceKm} km</span>
                  </div>
                )}
              </div>

              {/* Driver & Trip Rating Section */}
              {selectedRide.status === 'completed' && activeRole === 'passenger' && (
                <div className="rounded-card bg-neutral-50/80 p-3.5 border border-line space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-ink uppercase tracking-wide">
                      Trip Rating
                    </span>
                    {existingRating ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                        Rated ✓
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                        Pending Rating
                      </span>
                    )}
                  </div>

                  {existingRating ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-primary-text">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`h-4 w-4 ${
                              s <= existingRating.rating
                                ? 'fill-primary text-primary-text'
                                : 'text-neutral-200'
                            }`}
                          />
                        ))}
                        <span className="text-xs font-bold text-ink ml-1">
                          {existingRating.rating}.0
                        </span>
                      </div>
                      {existingRating.comment && (
                        <p className="text-[11px] text-ink-2 italic">
                          "{existingRating.comment}"
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1 border-t border-neutral-200/60">
                      <p className="text-[11px] text-ink-3 font-medium">
                        How was your trip with {selectedRide.driverName || 'your driver'}?
                      </p>
                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setRatingVal(s)}
                            className="p-0.5 hover:scale-110 transition-transform"
                          >
                            <Star
                              className={`h-5 w-5 ${
                                s <= ratingVal
                                  ? 'fill-primary text-primary-text'
                                  : 'text-neutral-200'
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        placeholder="Leave feedback note (optional)..."
                        value={ratingComment}
                        onChange={(e) => setRatingComment(e.target.value)}
                        className="w-full rounded-input border border-line p-2.5 text-xs focus:border-primary focus:outline-none bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleSubmitRating}
                        disabled={isSubmittingRating}
                        className="w-full rounded-full bg-primary py-2.5 text-xs font-bold text-on-primary hover:bg-primary-hover active:bg-primary-pressed disabled:opacity-50 transition-all shadow-card"
                      >
                        {isSubmittingRating ? 'Saving Rating...' : 'Submit Rating'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* List of Rides with Filter Tabs */
          <>
            {/* Filter Pills */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
                  filter === 'all'
                    ? 'bg-ink text-white shadow-card'
                    : 'bg-surface-2 text-ink-2 hover:bg-neutral-200'
                }`}
              >
                All ({rides.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('completed')}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
                  filter === 'completed'
                    ? 'bg-success text-white shadow-card'
                    : 'bg-surface-2 text-ink-2 hover:bg-neutral-200'
                }`}
              >
                Completed ({rides.filter((r) => r.status === 'completed').length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('cancelled')}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
                  filter === 'cancelled'
                    ? 'bg-danger text-white shadow-card'
                    : 'bg-surface-2 text-ink-2 hover:bg-neutral-200'
                }`}
              >
                Cancelled ({rides.filter((r) => r.status === 'cancelled').length})
              </button>
            </div>

            <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
              {filteredRides.length === 0 ? (
                <div className="py-12 text-center text-xs text-neutral-400">
                  No {filter !== 'all' ? filter : ''} rides found in your account.
                </div>
              ) : (
                filteredRides.map((ride) => {
                  const fare = ride.finalFare || ride.estimatedFare || 35.0;
                  const isCash = ride.paymentMethod === 'cash';

                  return (
                    <div
                      key={ride.id}
                      onClick={() => setSelectedRide(ride)}
                      className="flex cursor-pointer items-center justify-between rounded-card border border-line bg-white p-3.5 hover:border-primary/40 transition-all shadow-card"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-50 text-primary-text font-bold shrink-0">
                          <Car className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs sm:text-sm font-bold text-ink truncate max-w-[180px] sm:max-w-[240px]">
                            {ride.destinationAddress}
                          </h4>
                          <div className="flex items-center gap-1.5 text-[11px] text-ink-3 mt-0.5">
                            <span>
                              {new Date(ride.createdAt).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                            <span>•</span>
                            <span className="uppercase font-semibold text-primary-text">{ride.rideType}</span>
                            <span>•</span>
                            <span className={`font-semibold uppercase ${
                              isCash ? 'text-success' : 'text-blue-700'
                            }`}>
                              {ride.paymentMethod || 'cash'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 pl-2">
                        <span className="text-xs sm:text-sm font-bold text-ink">
                          {fareService.formatZAR(fare)}
                        </span>
                        <span
                          className={`block text-[11px] font-bold uppercase mt-0.5 ${
                            ride.status === 'completed'
                              ? 'text-success'
                              : ride.status === 'cancelled'
                              ? 'text-red-500'
                              : 'text-amber-600'
                          }`}
                        >
                          {ride.status}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
