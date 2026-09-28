/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Driver Completed Ride Screen
 * High-contrast summary of finished trip with net earnings, cash payment confirmation & passenger rating
 */

import React, { useState, useEffect } from 'react';
import { RideDocument, PaymentRecord } from '../../types';
import { fareService } from '../../services/fareService';
import { firestoreService } from '../../firebase/firestoreService';
import {
  CheckCircle2,
  DollarSign,
  MapPin,
  Car,
  Clock,
  Navigation,
  Check,
  TrendingUp,
  Banknote,
  CreditCard,
  Smartphone,
  Star,
  Sparkles,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface DriverCompletedScreenProps {
  ride: RideDocument;
  onBackToHome: () => void;
}

const DRIVER_PASSENGER_TAGS = [
  'Polite & Respectful',
  'Ready at Pickup',
  'Great Conversation',
  'Clean Passenger',
  'Followed Safety Rules',
];

export const DriverCompletedScreen: React.FC<DriverCompletedScreenProps> = ({
  ride,
  onBackToHome,
}) => {
  const [isConfirmingCash, setIsConfirmingCash] = useState<boolean>(false);
  const [paymentRecord, setPaymentRecord] = useState<PaymentRecord | null>(null);

  // Rating State
  const [ratingVal, setRatingVal] = useState<number>(5);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [feedbackComment, setFeedbackComment] = useState<string>('');
  const [isSubmittingRating, setIsSubmittingRating] = useState<boolean>(false);
  const [ratingSubmitted, setRatingSubmitted] = useState<boolean>(false);

  const finalFare = ride.finalFare || ride.estimatedFare || 35.0;
  const netEarnings = finalFare * 0.85; // 85% Driver Take-Home
  const platformFee = finalFare * 0.15;

  const completedTime = ride.completedAt
    ? new Date(ride.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Listen to payment record in real-time
  useEffect(() => {
    const unsub = firestoreService.listenToPaymentForRide(ride.id, (pay) => {
      if (pay) setPaymentRecord(pay);
    });
    return () => unsub();
  }, [ride.id]);

  const isCash = ride.paymentMethod === 'cash';
  const isPaid = paymentRecord?.paymentStatus === 'paid' || ride.paymentStatus === 'paid';
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  const handleVerifyElectronic = async () => {
    setIsVerifying(true);
    try {
      await fetch('/api/payments/peach/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rideId: ride.id }),
      });
    } catch (e) {
      console.warn('Verify payment error:', e);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleConfirmCashPayment = async () => {
    if (!ride.driverId) return;
    setIsConfirmingCash(true);
    try {
      await firestoreService.markCashPaymentPaid(ride.id, ride.driverId);
    } catch (e) {
      console.warn('Error confirming cash payment:', e);
    } finally {
      setIsConfirmingCash(false);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmitPassengerRating = async () => {
    if (!ride.passengerId || !ride.driverId) return;
    setIsSubmittingRating(true);
    try {
      const fullComment = [
        selectedTags.length > 0 ? `[${selectedTags.join(', ')}]` : '',
        feedbackComment.trim(),
      ].filter(Boolean).join(' ');

      await firestoreService.submitRating({
        rideId: ride.id,
        passengerId: ride.passengerId,
        driverId: ride.driverId,
        fromUserId: ride.driverId,
        toUserId: ride.passengerId,
        fromRole: 'driver',
        toRole: 'passenger',
        rating: ratingVal,
        comment: fullComment,
        tip: 0,
        createdAt: new Date().toISOString(),
      });
      setRatingSubmitted(true);
    } catch (e) {
      console.warn('Error submitting passenger rating:', e);
      setRatingSubmitted(true);
    } finally {
      setIsSubmittingRating(false);
    }
  };

  return (
    <div id="driver-completed-screen" className="w-full max-w-lg mx-auto space-y-4 text-center">
      {/* Success Badge */}
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-xs">
        <Check className="h-7 w-7 stroke-[3]" />
      </div>

      <div>
        <span className="inline-block rounded-full bg-emerald-100 px-3 py-0.5 text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1">
          Dispatched & Completed
        </span>
        <h3 className="text-lg sm:text-xl font-black text-[#111111] tracking-tight">Trip Completed!</h3>
        <p className="text-xs text-neutral-500 max-w-xs mx-auto">
          {isCash
            ? 'Collect cash from passenger and verify below.'
            : 'Payment has been processed to your driver earnings.'}
        </p>
      </div>

      {/* Cash Collection Action Banner if Cash */}
      {isCash ? (
        <div className={`rounded-2xl border p-4 text-left transition-all ${
          isPaid
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : 'bg-amber-50 border-amber-300 text-amber-950 shadow-sm'
        }`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Banknote className={`h-5 w-5 ${isPaid ? 'text-emerald-600' : 'text-amber-700'} shrink-0`} />
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider">
                  {isPaid ? 'Cash Payment Confirmed' : 'Cash Collection Required'}
                </h4>
                <p className="text-xs mt-0.5">
                  {isPaid
                    ? `Received R${finalFare.toFixed(2)} cash from passenger.`
                    : `Please collect R${finalFare.toFixed(2)} cash from passenger.`}
                </p>
              </div>
            </div>
            <span className="text-sm font-black shrink-0">
              {fareService.formatZAR(finalFare)}
            </span>
          </div>

          {!isPaid && (
            <button
              id="btn-mark-cash-paid"
              type="button"
              onClick={handleConfirmCashPayment}
              disabled={isConfirmingCash}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#111111] py-2.5 text-xs font-bold text-white shadow-xs hover:bg-neutral-800 active:scale-[0.99] transition-all"
            >
              {isConfirmingCash ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Recording Payment...</span>
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 text-[#FFC107]" />
                  <span>Mark Cash Payment as Paid / Received</span>
                </>
              )}
            </button>
          )}
        </div>
      ) : (
        /* Electronic Payment Status Banner for Driver */
        <div className={`rounded-2xl border p-4 text-left transition-all ${
          isPaid
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : 'bg-blue-50 border-blue-200 text-blue-950 shadow-sm'
        }`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <CreditCard className={`h-5 w-5 ${isPaid ? 'text-emerald-600' : 'text-blue-600'} shrink-0`} />
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider">
                  {isPaid ? 'Peach Payment Confirmed' : 'Electronic Payment Processing'}
                </h4>
                <p className="text-xs mt-0.5">
                  {isPaid
                    ? `Payment of R${finalFare.toFixed(2)} confirmed via Peach Payments. Net earnings (+R${netEarnings.toFixed(2)}) finalized.`
                    : `Passenger is paying via Peach Payments. Earnings finalize automatically upon gateway confirmation.`}
                </p>
              </div>
            </div>
            <span className="text-sm font-black shrink-0">
              {fareService.formatZAR(finalFare)}
            </span>
          </div>

          {!isPaid && (
            <button
              id="btn-driver-refresh-payment"
              type="button"
              onClick={handleVerifyElectronic}
              disabled={isVerifying}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-blue-300 bg-white py-2 text-xs font-bold text-blue-900 shadow-xs hover:bg-blue-50 active:scale-[0.99] transition-all"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
              <span>{isVerifying ? 'Checking Gateway...' : 'Refresh Payment Status'}</span>
            </button>
          )}
        </div>
      )}

      {/* Net Earnings Card */}
      <div className="rounded-2xl border border-[#111111] bg-[#111111] p-4 text-white shadow-md text-left">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#FFC107]">
            Driver Take-Home (85%)
          </span>
          <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] font-mono text-neutral-300">
            {ride.paymentMethod?.toUpperCase() || 'CASH'}
          </span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight mt-0.5 text-white">
          {fareService.formatZAR(netEarnings)}
        </h2>
        <div className="mt-2.5 flex items-center justify-between border-t border-neutral-800 pt-2 text-[11px] text-neutral-400">
          <span>Gross Fare: {fareService.formatZAR(finalFare)}</span>
          <span>ZAKA Fee (15%): {fareService.formatZAR(platformFee)}</span>
        </div>
      </div>

      {/* Passenger & Trip Summary Card */}
      <div className="rounded-2xl border border-[#E5E5E5] bg-[#F9FAFB] p-3.5 text-left text-xs space-y-2.5 shadow-2xs">
        <div className="flex items-center justify-between border-b border-[#E5E5E5] pb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200 text-[#111111] font-bold text-xs shrink-0">
              {ride.passengerName ? ride.passengerName.charAt(0) : 'P'}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-[#111111] truncate">{ride.passengerName || 'Passenger'}</p>
              <p className="text-[10px] text-neutral-500">{ride.rideType.toUpperCase()} Ride</p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-neutral-400">
            {completedTime}
          </span>
        </div>

        {/* Addresses */}
        <div className="space-y-1.5 text-[11px]">
          <div className="flex items-start gap-2">
            <div className="mt-1 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
            <div className="min-w-0 flex-1 truncate">
              <span className="text-neutral-400 font-medium">From: </span>
              <span className="font-semibold text-[#111111]">{ride.pickupAddress}</span>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="mt-1 h-2 w-2 rounded-full bg-[#FFC107] shrink-0" />
            <div className="min-w-0 flex-1 truncate">
              <span className="text-neutral-400 font-medium">To: </span>
              <span className="font-semibold text-[#111111]">{ride.destinationAddress}</span>
            </div>
          </div>
        </div>

        {/* Distance & Time stats */}
        <div className="grid grid-cols-2 gap-2 border-t border-[#E5E5E5] pt-2 text-center text-[11px]">
          <div>
            <span className="text-neutral-400 block text-[10px]">Trip Distance</span>
            <span className="font-bold text-[#111111]">{ride.estimatedDistanceKm || 5.2} km</span>
          </div>
          <div>
            <span className="text-neutral-400 block text-[10px]">Duration</span>
            <span className="font-bold text-[#111111]">{ride.estimatedDurationMin || 15} min</span>
          </div>
        </div>
      </div>

      {/* Rate Passenger Card */}
      <div className="rounded-2xl border border-[#E5E5E5] bg-white p-3.5 space-y-3 text-left shadow-2xs">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-[#111111]">
            Rate Passenger ({ride.passengerName || 'Passenger'})
          </p>
          {ratingSubmitted && (
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              Submitted ✓
            </span>
          )}
        </div>

        {!ratingSubmitted ? (
          <>
            {/* Star selector */}
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRatingVal(star)}
                  className="p-1 transition-transform active:scale-125"
                  aria-label={`Rate passenger ${star} stars`}
                >
                  <Star
                    className={`h-6 w-6 ${
                      star <= ratingVal
                        ? 'fill-[#FFC107] text-[#FFC107]'
                        : 'text-neutral-200'
                    }`}
                  />
                </button>
              ))}
            </div>

            {/* Quick compliments */}
            <div className="flex flex-wrap justify-center gap-1.5 pt-1">
              {DRIVER_PASSENGER_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition-all ${
                      isSelected
                        ? 'bg-[#111111] text-[#FFC107] shadow-xs'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {isSelected ? `✓ ${tag}` : `+ ${tag}`}
                  </button>
                );
              })}
            </div>

            {/* Submit rating */}
            <button
              type="button"
              onClick={handleSubmitPassengerRating}
              disabled={isSubmittingRating}
              className="w-full rounded-xl bg-neutral-100 py-2 text-xs font-bold text-[#111111] hover:bg-neutral-200 transition-all"
            >
              {isSubmittingRating ? 'Saving Rating...' : 'Submit Passenger Rating'}
            </button>
          </>
        ) : (
          <p className="text-center text-xs text-neutral-500 py-1">
            Thank you for helping keep the ZAKA community safe and rated!
          </p>
        )}
      </div>

      {/* Back to Home Action Button */}
      <button
        id="btn-driver-back-home"
        type="button"
        onClick={onBackToHome}
        className="w-full rounded-2xl bg-[#FFC107] py-3.5 text-xs sm:text-sm font-black text-[#111111] shadow-md hover:bg-[#FFB300] active:scale-[0.99] transition-all"
      >
        Back to Driver Home • Ready for Trips
      </button>
    </div>
  );
};

