/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Fare Calculation Service
 * 
 * Reusable fare calculation model adhering to:
 * Fare = Base Fare + (Distance × Per-KM Rate) + (Duration × Per-Minute Rate)
 * with Minimum Fare protection: Final Fare = Math.max(Calculated Fare, Minimum Fare)
 */

import { PricingConfig, FareBreakdown, VehicleType } from '../types';

export const ZAKA_DEFAULT_LAUNCH_PRICING: Record<VehicleType, PricingConfig> = {
  economy: {
    rideType: 'economy',
    name: 'Economy',
    tagline: 'Standard affordable ride for everyday commutes',
    baseFare: 25.0,
    perKmRate: 10.5,
    perMinuteRate: 1.5,
    minimumFare: 35.0,
    passengerCapacity: 4,
    estimatedEtaMins: 3,
    active: true,
    currency: 'ZAR',
    updatedAt: new Date().toISOString(),
  },
  comfort: {
    rideType: 'comfort',
    name: 'Comfort',
    tagline: 'Spacious, newer vehicles with top-rated drivers',
    baseFare: 35.0,
    perKmRate: 14.0,
    perMinuteRate: 2.0,
    minimumFare: 50.0,
    passengerCapacity: 4,
    estimatedEtaMins: 4,
    active: true,
    currency: 'ZAR',
    updatedAt: new Date().toISOString(),
  },
  xl: {
    rideType: 'xl',
    name: 'XL',
    tagline: 'Extra space for up to 6 passengers and luggage',
    baseFare: 45.0,
    perKmRate: 18.0,
    perMinuteRate: 2.5,
    minimumFare: 70.0,
    passengerCapacity: 6,
    estimatedEtaMins: 6,
    active: true,
    currency: 'ZAR',
    updatedAt: new Date().toISOString(),
  },
  moto: {
    rideType: 'moto',
    name: 'Moto',
    tagline: 'Fast and agile motorcycle ride to beat city traffic',
    baseFare: 15.0,
    perKmRate: 7.0,
    perMinuteRate: 1.0,
    minimumFare: 22.0,
    passengerCapacity: 1,
    estimatedEtaMins: 2,
    active: true,
    currency: 'ZAR',
    updatedAt: new Date().toISOString(),
  },
};

export const fareService = {
  /**
   * Calculates detailed fare breakdown based on dynamic pricing config, distance, and duration
   */
  calculateFareBreakdown(
    pricing: PricingConfig,
    distanceKm: number,
    durationMinutes: number
  ): FareBreakdown {
    const validDistance = Math.max(0, Number(distanceKm) || 0);
    const validDuration = Math.max(0, Number(durationMinutes) || 0);

    const baseFare = Number(pricing.baseFare) || 0;
    const perKmRate = Number(pricing.perKmRate) || 0;
    const perMinuteRate = Number(pricing.perMinuteRate) || 0;
    const minimumFare = Number(pricing.minimumFare) || 0;

    const distanceFare = Number((validDistance * perKmRate).toFixed(2));
    const timeFare = Number((validDuration * perMinuteRate).toFixed(2));
    const subtotal = Number((baseFare + distanceFare + timeFare).toFixed(2));

    const isMinimumFareApplied = subtotal < minimumFare;
    const totalFare = isMinimumFareApplied ? minimumFare : subtotal;

    return {
      rideType: pricing.rideType,
      baseFare,
      distanceKm: Number(validDistance.toFixed(1)),
      distanceFare,
      perKmRate,
      durationMinutes: Math.round(validDuration),
      timeFare,
      perMinuteRate,
      subtotal,
      minimumFare,
      isMinimumFareApplied,
      totalFare: Number(totalFare.toFixed(2)),
      currency: pricing.currency || 'ZAR',
    };
  },

  /**
   * Calculate distance in kilometers between two geo-coordinates using Haversine formula
   */
  calculateDistanceKm(
    point1: { latitude: number; longitude: number },
    point2: { latitude: number; longitude: number }
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((point2.latitude - point1.latitude) * Math.PI) / 180;
    const dLon = ((point2.longitude - point1.longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((point1.latitude * Math.PI) / 180) *
        Math.cos((point2.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(2));
  },

  /**
   * Format currency values consistently (e.g., R25.00, R79.00)
   */
  formatZAR(amount: number, showDecimals = true): string {
    const validAmount = Number(amount) || 0;
    if (showDecimals) {
      return `R${validAmount.toFixed(2)}`;
    }
    return `R${Math.round(validAmount)}`;
  },

  /**
   * Calculate all ride options for a given distance and duration
   */
  calculateAllRideOptions(
    pricingMap: Record<VehicleType, PricingConfig>,
    distanceKm: number,
    durationMinutes: number
  ): Record<VehicleType, FareBreakdown> {
    const result: Partial<Record<VehicleType, FareBreakdown>> = {};
    const types: VehicleType[] = ['economy', 'comfort', 'xl', 'moto'];

    for (const type of types) {
      const config = pricingMap[type] || ZAKA_DEFAULT_LAUNCH_PRICING[type];
      result[type] = this.calculateFareBreakdown(config, distanceKm, durationMinutes);
    }

    return result as Record<VehicleType, FareBreakdown>;
  },
};
