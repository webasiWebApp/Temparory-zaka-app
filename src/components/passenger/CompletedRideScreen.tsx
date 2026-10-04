/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Passenger Completed Ride Screen
 * Clean White + Rounded iPhone-Style Interface
 * Receipt summary, payment verification, tip & rating submission
 */

import React, { useState, useEffect } from 'react';
import { RideDocument, PaymentRecord } from '../../types';
import { fareService } from '../../services/fareService';
import { firestoreService } from '../../firebase/firestoreService';
import { paymentService, PaymentGatewayConfig } from '../../services/paymentService';
import {
  CheckCircle2,
  Star,
  MapPin,
  Car,
  Clock,
  Navigation,
  CreditCard,
  Banknote,
  Smartphone,
  Check,
  Shield,
  Heart,
  Sparkles,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Lock,
  ArrowRight,
  Wallet,
} from 'lucide-react';

interface CompletedRideScreenProps {
  ride: RideDocument;
  onDone: () => void;
}

const PASSENGER_COMPLIMENT_TAGS = [
  'Safe Driver',
  'Clean Car',
  'Great Music',
  'Polite & Friendly',
  'Smooth Navigation',
  'On-Time Arrival',
];

export const CompletedRideScreen: React.FC<CompletedRideScreenProps> = ({
  ride,
  onDone,
}) => {
  const [ratingVal, setRatingVal] = useState<number>(5);
  const [tipVal, setTipVal] = useState<number>(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [ratingComment, setRatingComment] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [paymentRecord, setPaymentRecord] = useState<PaymentRecord | null>(null);
  const [gatewayConfig, setGatewayConfig] = useState<PaymentGatewayConfig | null>(null);

  // Payment flow state
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const [isVerifyingPeach, setIsVerifyingPeach] = useState<boolean>(false);

  const finalFare = ride.finalFare || ride.estimatedFare || 35.0;
  const formattedRequestedTime = ride.requestedAt
    ? new Date(ride.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Earlier';
  const formattedCompletedTime = ride.completedAt
    ? new Date(ride.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Load gateway config
  useEffect(() => {
    paymentService.getGatewayConfig().then(setGatewayConfig).catch(console.warn);
  }, []);

  // Listen to payment record in real-time
  useEffect(() => {
    const unsub = firestoreService.listenToPaymentForRide(ride.id, (pay) => {
      if (pay) setPaymentRecord(pay);
    });
    return () => unsub();
  }, [ride.id]);

  // Check if passenger returned from Peach Checkout
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('peachReturn') === 'true' && urlParams.get('rideId') === ride.id) {
      setIsVerifyingPeach(true);
      paymentService
        .verifyPeachPayment(ride.id)
        .then((res) => {
          if (res.success) {
            setPaymentNotice('Peach payment confirmed successfully!');
          }
        })
        .finally(() => {
          setIsVerifyingPeach(false);
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        });
    }
  }, [ride.id]);

  const paymentMethod = paymentRecord?.paymentMethod || ride.paymentMethod;
  const isCash = paymentMethod === 'cash';
  const isWallet = paymentMethod === 'wallet';
  const isPaid = paymentRecord?.paymentStatus === 'paid' || ride.paymentStatus === 'paid';
  const walletShort = isWallet && !isPaid && paymentRecord?.failureReason === 'INSUFFICIENT_WALLET_BALANCE';

  // Fallback settlement: normally the driver app triggers it when the trip ends
  useEffect(() => {
    if (ride.status === 'completed' && ride.paymentStatus !== 'paid') {
      firestoreService.settleRide(ride.id).catch(() => {});
    }
  }, [ride.id, ride.status]);

  const handleRetryWalletPayment = async () => {
    setIsProcessingPayment(true);
    setPaymentNotice(null);
    try {
      const res = await firestoreService.settleRide(ride.id);
      if (res.success && res.paymentStatus === 'paid') {
        setPaymentNotice('Paid from your ZAKA wallet.');
      } else if (res.code === 'INSUFFICIENT_WALLET_BALANCE') {
        setPaymentNotice('Your wallet balance is still too low. Top up or switch to cash.');
      } else {
        setPaymentNotice('Could not complete the wallet payment. Please try again.');
      }
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleInitiateCardPayment = async () => {
    setIsProcessingPayment(true);
    setPaymentNotice(null);
    try {
      const initResult = await paymentService.processPaymentInitiation(
        ride,
        'card'
      );
      if (initResult.success && initResult.redirectUrl) {
        window.location.href = initResult.redirectUrl;
      } else if (initResult.success) {
        setPaymentNotice(initResult.paymentStatus === 'paid' ? 'Payment confirmed.' : 'Payment started. Awaiting confirmation.');
      } else {
        setPaymentNotice(initResult.message || 'Payment gateway connection error.');
      }
    } catch (e: any) {
      setPaymentNotice(e.message || 'Payment initiation failed.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleVerifyStatus = async () => {
    setIsVerifyingPeach(true);
    try {
      const res = await paymentService.verifyPeachPayment(ride.id);
      setPaymentNotice(res.message);
    } catch (e: any) {
      setPaymentNotice('Verification check error.');
    } finally {
      setIsVerifyingPeach(false);
    }
  };

  const handleSwitchToCash = async () => {
    try {
      await firestoreService.switchRidePaymentToCash(ride.id);
      setPaymentNotice('Switched to cash. Please pay your driver directly.');
    } catch (e) {
      console.warn('Error switching to cash:', e);
      setPaymentNotice('Could not switch to cash. Please try again.');
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmitRatingAndClose = async () => {
    setIsSubmitting(true);
    try {
      if (ride.driverId) {
        const fullComment = [
          selectedTags.length > 0 ? `[${selectedTags.join(', ')}]` : '',
          ratingComment.trim(),
        ].filter(Boolean).join(' ');

        await firestoreService.submitRating({
          rideId: ride.id,
          passengerId: ride.passengerId,
          driverId: ride.driverId,
          fromUserId: ride.passengerId,
          toUserId: ride.driverId,
          fromRole: 'passenger',
          toRole: 'driver',
          rating: ratingVal,
          comment: fullComment,
          tip: tipVal,
          createdAt: new Date().toISOString(),
        });
      }
      setSubmitted(true);
      setTimeout(() => {
        onDone();
      }, 600);
    } catch (err) {
      console.warn('Rating submission error:', err);
      onDone();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="passenger-completed-ride-screen" className="w-full max-w-lg mx-auto space-y-4 text-center">
      {/* Success Badge */}
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 shadow-[0_6px_20px_rgba(16,185,129,0.15)] ring-8 ring-emerald-50/50">
        <Check className="h-8 w-8 stroke-[3]" />
      </div>

      <div>
        <span className="inline-block rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-800 uppercase tracking-wide mb-1.5">
          Trip Completed
        </span>
        <h3 className="text-2xl font-black text-neutral-900 tracking-tight">You Have Arrived!</h3>
        <p className="text-xs text-neutral-500 max-w-xs mx-auto mt-1 font-medium">
          Thank you for riding with ZAKA. Your receipt is summarized below.
        </p>
      </div>

      {/* Driver Summary Card */}
      <div className="rounded-[28px] bg-white border border-neutral-100/90 p-4 text-left shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FFF5EB] text-[#FF7A00] font-black text-base shrink-0 shadow-xs border border-[#FF7A00]/20">
              {ride.driverName ? ride.driverName.charAt(0) : 'D'}
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-black text-neutral-900 truncate">{ride.driverName || 'Your driver'}</h4>
              <p className="text-[11px] text-neutral-500 truncate font-semibold">
                {[ride.vehicleDetails?.colour, ride.vehicleDetails?.make, ride.vehicleDetails?.model].filter(Boolean).join(' ') || 'Vehicle'}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-1 font-mono text-xs font-black text-neutral-900">
              {ride.vehicleDetails?.registrationNumber || '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Route & Timings Card */}
      <div className="rounded-[28px] bg-white border border-neutral-100/90 p-4 text-left text-xs space-y-3 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
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
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">Destination</span>
            <p className="font-bold text-neutral-900 text-xs sm:text-sm truncate">{ride.destinationAddress}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-neutral-100 pt-3 text-center text-[11px]">
          <div>
            <span className="text-neutral-400 block text-[10px] font-semibold">Distance</span>
            <span className="font-black text-neutral-900">{ride.estimatedDistanceKm ?? '—'} km</span>
          </div>
          <div>
            <span className="text-neutral-400 block text-[10px] font-semibold">Duration</span>
            <span className="font-black text-neutral-900">{ride.estimatedDurationMin ?? '—'} min</span>
          </div>
          <div>
            <span className="text-neutral-400 block text-[10px] font-semibold">Completed</span>
            <span className="font-black text-neutral-900">{formattedCompletedTime}</span>
          </div>
        </div>
      </div>

      {/* Payment Receipt Card with Status */}
      <div className="rounded-[28px] bg-white border border-neutral-100/90 p-4 text-left shadow-[0_8px_24px_rgba(0,0,0,0.04)] space-y-3">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5 text-xs">
          <div className="flex items-center gap-2">
            {isCash ? (
              <Banknote className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : paymentMethod === 'card' || paymentMethod === 'digital' ? (
              <CreditCard className="h-4 w-4 text-blue-600 shrink-0" />
            ) : (
              <Wallet className="h-4 w-4 text-[#FF7A00] shrink-0" />
            )}
            <span className="text-neutral-600 font-bold uppercase tracking-wide text-[11px]">
              {isCash ? 'Cash Payment' : isWallet ? 'ZAKA Wallet' : 'Card Payment'}
            </span>
          </div>
          <span className="font-black text-neutral-900 text-lg">
            {fareService.formatZAR(finalFare)}
          </span>
        </div>

        {/* Live Payment Status Banner & Gateway Actions */}
        {isCash ? (
          <div className={`rounded-2xl p-3 text-xs flex items-center gap-2.5 ${
            isPaid
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-amber-50 text-amber-900 border border-amber-200'
          }`}>
            {isPaid ? (
              <>
                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
                <div>
                  <span className="font-bold block">Cash Payment Confirmed ✓</span>
                  <span className="text-[11px] text-emerald-700">
                    Your driver has verified receipt of {fareService.formatZAR(finalFare)} in cash.
                  </span>
                </div>
              </>
            ) : (
              <>
                <Clock className="h-4.5 w-4.5 text-amber-600 shrink-0" />
                <div>
                  <span className="font-bold block">Cash Due to Driver</span>
                  <span className="text-[11px] text-amber-800">
                    Please pay {fareService.formatZAR(finalFare)} directly to your driver{tipVal > 0 ? `, plus your ${fareService.formatZAR(tipVal)} tip` : ''}.
                  </span>
                </div>
              </>
            )}
          </div>
        ) : isWallet ? (
          <div className="space-y-2">
            <div className={`rounded-2xl p-3 text-xs flex items-center justify-between gap-2 ${
              isPaid
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-amber-50 text-amber-900 border border-amber-200'
            }`}>
              <div className="flex items-center gap-2.5">
                {isPaid ? (
                  <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
                ) : (
                  <Wallet className="h-4.5 w-4.5 text-amber-600 shrink-0" />
                )}
                <div>
                  <span className="font-bold block">
                    {isPaid ? 'Paid from ZAKA Wallet ✓' : walletShort ? 'Wallet balance too low' : 'Wallet payment processing'}
                  </span>
                  <span className="text-[11px] text-neutral-600">
                    {isPaid
                      ? `${fareService.formatZAR(finalFare)} was deducted from your wallet.`
                      : walletShort
                        ? 'Top up your wallet and retry, or pay your driver in cash.'
                        : 'Confirming your wallet payment…'}
                  </span>
                </div>
              </div>
              {!isPaid && (
                <button
                  type="button"
                  onClick={handleRetryWalletPayment}
                  disabled={isProcessingPayment}
                  className="shrink-0 rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-black text-white hover:bg-neutral-800 active:scale-95 transition-all"
                >
                  {isProcessingPayment ? 'Checking…' : 'Retry'}
                </button>
              )}
            </div>

            {paymentNotice && (
              <p className="text-center text-xs font-bold text-neutral-700">{paymentNotice}</p>
            )}

            {!isPaid && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={handleSwitchToCash}
                  className="text-xs font-bold text-neutral-500 hover:text-neutral-900 underline underline-offset-2"
                >
                  Pay your driver in cash instead
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className={`rounded-2xl p-3 text-xs flex items-center justify-between ${
              isPaid
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-blue-50 text-blue-900 border border-blue-200'
            }`}>
              <div className="flex items-center gap-2.5">
                {isPaid ? (
                  <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
                ) : (
                  <CreditCard className="h-4.5 w-4.5 text-blue-600 shrink-0" />
                )}
                <div>
                  <span className="font-bold block">
                    {isPaid ? 'Payment Settled Successfully' : 'Digital Payment Pending'}
                  </span>
                  <span className="text-[11px] text-neutral-600">
                    {isPaid ? 'Peach Payments transaction confirmed' : '3D-Secure card authorization'}
                  </span>
                </div>
              </div>

              {!isPaid && (
                <button
                  type="button"
                  onClick={handleInitiateCardPayment}
                  disabled={isProcessingPayment}
                  className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-black text-white hover:bg-blue-700 active:scale-95 transition-all shadow-xs"
                >
                  {isProcessingPayment ? 'Connecting...' : 'Pay Now'}
                </button>
              )}
            </div>

            {paymentNotice && (
              <p className="text-center text-xs font-bold text-neutral-700">{paymentNotice}</p>
            )}

            {!isPaid && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={handleSwitchToCash}
                  className="text-xs font-bold text-neutral-500 hover:text-neutral-900 underline underline-offset-2"
                >
                  Prefer to pay cash? Switch to Cash Payment
                </button>
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5 text-[11px] text-neutral-500 pt-1">
          <div className="flex justify-between">
            <span>Ride Fare ({ride.rideType.toUpperCase()})</span>
            <span className="font-semibold text-neutral-700">{fareService.formatZAR(finalFare)}</span>
          </div>
          {tipVal > 0 && (
            <div className="flex justify-between text-emerald-600 font-semibold">
              <span>Driver Tip (given in cash)</span>
              <span>+{fareService.formatZAR(tipVal)}</span>
            </div>
          )}
          <div className="flex justify-between text-[10px] text-neutral-400 pt-1.5 border-t border-neutral-100">
            <span>Requested at {formattedRequestedTime}</span>
            <span>Ref: {ride.id.slice(0, 8).toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* Rate Driver Section */}
      <div className="rounded-[28px] bg-white border border-neutral-100/90 p-4 space-y-3.5 text-left shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
        <p className="text-sm font-black text-neutral-900 text-center">
          How was your ride with {ride.driverName || 'your driver'}?
        </p>

        {/* Stars */}
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRatingVal(star)}
              className="p-1 transition-transform active:scale-125"
              aria-label={`Rate ${star} stars`}
            >
              <Star
                className={`h-8 w-8 ${
                  star <= ratingVal
                    ? 'fill-[#FF7A00] text-[#FF7A00]'
                    : 'text-neutral-200'
                }`}
              />
            </button>
          ))}
        </div>

        {/* Compliment Tags */}
        <div className="space-y-2 pt-1 border-t border-neutral-100">
          <span className="block text-center text-xs font-bold text-neutral-500">Add Compliments</span>
          <div className="flex flex-wrap justify-center gap-1.5">
            {PASSENGER_COMPLIMENT_TAGS.map((tag) => {
              const isSelected = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all ${
                    isSelected
                      ? 'bg-[#FFF5EB] text-[#FF7A00] ring-1 ring-[#FF7A00]/40'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {isSelected ? `✓ ${tag}` : `+ ${tag}`}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tip Selection */}
        <div className="space-y-2 pt-1 border-t border-neutral-100">
          <span className="block text-center text-xs font-bold text-neutral-500">Add a Driver Tip</span>
          <div className="flex justify-center gap-2">
            {[0, 10, 20, 50].map((tip) => (
              <button
                key={tip}
                type="button"
                onClick={() => setTipVal(tip)}
                className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
                  tipVal === tip
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                {tip === 0 ? 'No Tip' : `R${tip}`}
              </button>
            ))}
          </div>
        </div>

        {/* Feedback text */}
        <textarea
          value={ratingComment}
          onChange={(e) => setRatingComment(e.target.value)}
          placeholder="Leave an additional note (optional)..."
          rows={2}
          className="w-full rounded-2xl border border-neutral-200 p-3 text-xs focus:border-[#FF7A00] focus:outline-none"
        />
      </div>

      {/* Done Button */}
      <button
        id="btn-done-completed-ride"
        onClick={handleSubmitRatingAndClose}
        disabled={isSubmitting || submitted}
        className="w-full rounded-full bg-[#FF7A00] py-4 text-sm font-black text-white shadow-[0_8px_20px_rgba(255,122,0,0.25)] hover:bg-[#E66E00] active:scale-[0.98] transition-all disabled:opacity-50"
      >
        {isSubmitting ? 'Submitting Feedback...' : submitted ? 'Thank You! Completed ✓' : 'Submit & Finish'}
      </button>
    </div>
  );
};
