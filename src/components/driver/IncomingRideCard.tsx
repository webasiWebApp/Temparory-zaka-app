/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Driver Incoming Ride Request Card
 * Visuals: 15-second countdown timer, high-contrast route details, bright yellow #FFC107 action button
 */

import React, { useState, useEffect } from 'react';
import { RideDocument, LocationCoordinates } from '../../types';
import { fareService } from '../../services/fareService';
import {
  MapPin,
  Clock,
  Car,
  Check,
  X,
  Star,
  Navigation,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

interface IncomingRideCardProps {
  request: RideDocument;
  driverLocation?: LocationCoordinates;
  isAccepting: boolean;
  onAccept: (ride: RideDocument) => void;
  onDecline: (rideId: string) => void;
}

export const IncomingRideCard: React.FC<IncomingRideCardProps> = ({
  request,
  driverLocation,
  isAccepting,
  onAccept,
  onDecline,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(15);

  // Compute distance from driver's current position to the pickup location
  const pickupDistanceKm = driverLocation
    ? fareService.calculateDistanceKm(
        { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
        { latitude: request.pickupLocation.latitude, longitude: request.pickupLocation.longitude }
      )
    : 1.8;

  const pickupDurationMin = Math.max(1, Math.round(pickupDistanceKm * 2.2));

  // 15-second countdown timer
  useEffect(() => {
    setSecondsRemaining(15);
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onDecline(request.id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [request.id]);

  const timerPercentage = (secondsRemaining / 15) * 100;

  return (
    <div className="relative overflow-hidden rounded-3xl border-2 border-[#FFC107] bg-white p-4 shadow-xl sm:p-5 transition-all">
      {/* 15s Countdown Progress Bar */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-neutral-100 overflow-hidden">
        <div
          className={`h-full transition-all duration-1000 ease-linear ${
            secondsRemaining <= 5 ? 'bg-red-500' : 'bg-[#FFC107]'
          }`}
          style={{ width: `${timerPercentage}%` }}
        />
      </div>

      {/* Top Header: Ride Type, Countdown, Fare */}
      <div className="mt-1 flex items-center justify-between border-b border-[#E5E5E5] pb-3">
        <div className="flex items-center gap-2">
          <span className="rounded-xl bg-[#111111] px-2.5 py-1 text-[11px] font-black uppercase text-[#FFC107] tracking-wider">
            {request.rideType.toUpperCase()}
          </span>
          <div className="flex items-center gap-1 text-xs font-bold text-neutral-600">
            <Clock className={`h-3.5 w-3.5 ${secondsRemaining <= 5 ? 'text-red-500 animate-pulse' : 'text-neutral-400'}`} />
            <span className={`font-mono ${secondsRemaining <= 5 ? 'text-red-600 font-extrabold' : 'text-[#111111]'}`}>
              {secondsRemaining}s remaining
            </span>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xl font-black text-[#111111]">
            {fareService.formatZAR(request.estimatedFare)}
          </span>
          <span className="block text-[10px] font-semibold text-neutral-400">
            {request.paymentMethod?.toUpperCase() || 'CARD'}
          </span>
        </div>
      </div>

      {/* Passenger & Dispatch Info */}
      <div className="my-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-[#111111] font-black text-xs border border-[#E5E5E5] shrink-0">
            {request.passengerName ? request.passengerName.charAt(0) : 'P'}
          </div>
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-bold text-[#111111] truncate">{request.passengerName || 'Passenger'}</h4>
            <div className="flex items-center gap-1 text-[11px] text-neutral-500 flex-wrap">
              <Star className="h-3 w-3 fill-[#FFC107] text-[#FFC107] shrink-0" />
              <span className="font-bold text-[#111111]">{request.passengerRating ? request.passengerRating.toFixed(1) : '4.9'}</span>
              <span className="truncate">• {pickupDistanceKm.toFixed(1)} km away ({pickupDurationMin} min)</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-neutral-50 border border-neutral-200 px-2 py-1 text-center text-xs shrink-0">
          <span className="block text-[8px] font-bold uppercase text-neutral-400">Trip</span>
          <span className="font-black text-[#111111]">{request.estimatedDistanceKm} km</span>
        </div>
      </div>

      {/* Route Brief */}
      <div className="rounded-2xl border border-[#E5E5E5] bg-[#F9FAFB] p-3 space-y-2 text-xs">
        <div className="flex items-start gap-2.5">
          <div className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase text-emerald-700">Pickup Location</p>
            <p className="font-semibold text-[#111111] truncate">{request.pickupAddress}</p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <div className="mt-1 h-2.5 w-2.5 rounded-full bg-[#FFC107] shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase text-amber-700">Destination</p>
            <p className="font-semibold text-[#111111] truncate">{request.destinationAddress}</p>
          </div>
        </div>
      </div>

      {/* Action Buttons: Decline & Accept */}
      <div className="mt-4 flex gap-2.5">
        <button
          onClick={() => onDecline(request.id)}
          disabled={isAccepting}
          className="flex-1 rounded-2xl border border-[#E5E5E5] bg-white py-3.5 text-xs font-bold text-neutral-600 hover:bg-neutral-100 transition-colors"
        >
          Decline
        </button>

        <button
          onClick={() => onAccept(request)}
          disabled={isAccepting}
          className="flex-[2] rounded-2xl bg-[#FFC107] py-3.5 text-sm font-black text-[#111111] shadow-md hover:bg-[#FFB300] active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
        >
          {isAccepting ? (
            <span>Securing Dispatch...</span>
          ) : (
            <>
              <Check className="h-4 w-4 stroke-[3]" />
              <span>Accept Ride</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
