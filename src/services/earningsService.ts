/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Driver Earnings Calculation Service
 * Reusable engine for computing real-time daily, weekly, and monthly earnings
 */

import { RideDocument, PaymentRecord, DriverEarningsSummary } from '../types';

export interface DriverEarningsBreakdown {
  cashTotal: number;
  cardTotal: number;
  digitalTotal: number;
  grossCommissionTotal: number;
  paidCommissionTotal: number;
  pendingTotal: number;
}

export interface DetailedDriverEarningsSummary extends DriverEarningsSummary {
  breakdown: DriverEarningsBreakdown;
  pendingSettlement: number;
}

export const earningsService = {
  /**
   * Calculates comprehensive driver earnings across today, this week, and this month
   * from real completed rides and payment records.
   *
   * Business Rules:
   * - Driver gross earnings = completed ride final fares
   * - Commission split: 85% Driver Take-Home, 15% ZAKA Platform Commission
   * - Confirmed earnings are finalized ONLY when payment status is confirmed ('paid'):
   *   * Cash: Driver confirmed cash collection
   *   * Electronic (Peach): Verified successful transaction
   * - Pending payments are tracked separately under pendingSettlement
   */
  calculateDriverEarnings(
    rides: RideDocument[],
    payments: PaymentRecord[] = []
  ): DetailedDriverEarningsSummary {
    const now = new Date();
    
    // Start of Today (00:00:00)
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    // Start of This Week (Monday 00:00:00)
    const dayOfWeek = now.getDay();
    const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday).getTime();
    
    // Start of This Month (1st 00:00:00)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    // Map payments by rideId for quick status lookup
    const paymentMap = new Map<string, PaymentRecord>();
    payments.forEach((p) => {
      if (p.rideId) {
        paymentMap.set(p.rideId, p);
      }
    });

    const breakdown: DriverEarningsBreakdown = {
      cashTotal: 0,
      cardTotal: 0,
      digitalTotal: 0,
      grossCommissionTotal: 0,
      paidCommissionTotal: 0,
      pendingTotal: 0,
    };

    let pendingSettlement = 0;

    const summary: DetailedDriverEarningsSummary = {
      today: {
        completedTrips: 0,
        grossEarnings: 0,
        paidRides: 0,
        pendingPayments: 0,
        driverNetEarnings: 0,
      },
      thisWeek: {
        completedTrips: 0,
        grossEarnings: 0,
        driverNetEarnings: 0,
      },
      thisMonth: {
        completedTrips: 0,
        grossEarnings: 0,
        driverNetEarnings: 0,
      },
      lifetime: {
        completedTrips: 0,
        grossEarnings: 0,
        driverNetEarnings: 0,
      },
      breakdown,
      pendingSettlement: 0,
    };

    // Filter only completed rides
    const completedRides = rides.filter((r) => r.status === 'completed');

    completedRides.forEach((ride) => {
      const fare = Number(ride.finalFare || ride.estimatedFare) || 0;
      // Precise 85 / 15 split with rounding to 2 decimal places
      const commission = Math.round(fare * 15) / 100;
      const netFare = Math.round((fare - commission) * 100) / 100;
      
      const tripTime = ride.completedAt
        ? new Date(ride.completedAt).getTime()
        : new Date(ride.createdAt).getTime();

      // Check payment status from payment document or ride document
      const paymentDoc = paymentMap.get(ride.id);
      const isPaid = paymentDoc
        ? paymentDoc.paymentStatus === 'paid'
        : ride.paymentStatus === 'paid';

      breakdown.grossCommissionTotal += commission;

      if (isPaid) {
        // Confirmed finalized earnings
        if (ride.paymentMethod === 'cash') {
          breakdown.cashTotal += netFare;
        } else if (ride.paymentMethod === 'card') {
          breakdown.cardTotal += netFare;
        } else {
          breakdown.digitalTotal += netFare;
        }
        breakdown.paidCommissionTotal += commission;

        // Lifetime Confirmed
        summary.lifetime.completedTrips += 1;
        summary.lifetime.grossEarnings += fare;
        summary.lifetime.driverNetEarnings += netFare;

        // This Month
        if (tripTime >= startOfMonth) {
          summary.thisMonth.completedTrips += 1;
          summary.thisMonth.grossEarnings += fare;
          summary.thisMonth.driverNetEarnings += netFare;
        }

        // This Week
        if (tripTime >= startOfWeek) {
          summary.thisWeek.completedTrips += 1;
          summary.thisWeek.grossEarnings += fare;
          summary.thisWeek.driverNetEarnings += netFare;
        }

        // Today
        if (tripTime >= startOfToday) {
          summary.today.completedTrips += 1;
          summary.today.grossEarnings += fare;
          summary.today.driverNetEarnings += netFare;
          summary.today.paidRides += 1;
        }
      } else {
        // Pending settlement: do not finalize net earnings yet
        pendingSettlement += netFare;
        breakdown.pendingTotal += netFare;

        if (tripTime >= startOfToday) {
          summary.today.pendingPayments += 1;
        }
      }
    });

    summary.pendingSettlement = pendingSettlement;
    return summary;
  },

  /**
   * Formats ZAR currency string
   */
  formatZAR(amount: number): string {
    return `R${(Number(amount) || 0).toFixed(2)}`;
  },
};
