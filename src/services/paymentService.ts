/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Payment Service Abstraction
 * Supports Cash settlement and prepares clean interfaces for Card and Digital payment providers.
 */

import { PaymentMethod, PaymentStatus, PaymentRecord, RideDocument } from '../types';
import { firestoreService } from '../firebase/firestoreService';

export interface PaymentGatewayConfig {
  provider: string;
  env: 'sandbox' | 'production';
  isConfigured: boolean;
  currency: string;
  commissionSplit: {
    driverPercent: number;
    platformPercent: number;
  };
  message: string;
}

export interface PaymentProviderResponse {
  success: boolean;
  paymentStatus: PaymentStatus;
  transactionReference?: string;
  merchantTransactionId?: string;
  provider: string;
  message: string;
  code?: string;
  requiresRedirect?: boolean;
  redirectUrl?: string;
  peachCheckoutId?: string;
  amount?: number;
}

export const paymentService = {
  /**
   * Formats numbers into South African Rand (ZAR) string
   */
  formatZAR(amount: number): string {
    const val = Number(amount) || 0;
    return `R${val.toFixed(2)}`;
  },

  /**
   * Retrieves public Peach Payments gateway configuration from secure server endpoint
   */
  async getGatewayConfig(): Promise<PaymentGatewayConfig> {
    try {
      const res = await fetch('/api/payments/config');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      return {
        provider: 'peach',
        env: 'sandbox',
        isConfigured: false,
        currency: 'ZAR',
        commissionSplit: {
          driverPercent: 85,
          platformPercent: 15,
        },
        message: 'ZAKA PAYMENT INTEGRATION IMPLEMENTED — AWAITING PEACH MERCHANT CREDENTIALS AND PRODUCTION ONBOARDING.',
      };
    }
  },

  /**
   * Returns metadata and capability status for a selected payment method
   */
  getPaymentMethodConfig(
    method: PaymentMethod,
    gatewayConfig?: PaymentGatewayConfig | null
  ): {
    label: string;
    description: string;
    isConfigured: boolean;
    badgeText?: string;
    badgeColor?: string;
  } {
    const isConfigured = Boolean(gatewayConfig?.isConfigured);
    const env = gatewayConfig?.env || 'sandbox';

    switch (method) {
      case 'cash':
        return {
          label: 'Cash Payment',
          description: 'Pay the driver directly after the trip.',
          isConfigured: true,
          badgeText: 'Direct',
          badgeColor: 'bg-emerald-100 text-emerald-800',
        };

      case 'card':
        return {
          label: 'Card (Peach Payments)',
          description: 'Pay securely via Peach Payments Hosted Checkout (Visa, Mastercard, 3D Secure).',
          isConfigured,
          badgeText: isConfigured
            ? env === 'production'
              ? 'Peach Secure'
              : 'Peach Sandbox'
            : 'Peach Integration Ready',
          badgeColor: isConfigured
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-amber-100 text-amber-800',
        };

      case 'digital':
        return {
          label: 'Electronic / Digital',
          description: 'Instant EFT, 1Voucher, Masterpass & digital payment channels via Peach Payments.',
          isConfigured,
          badgeText: isConfigured ? 'Peach Gateway' : 'Peach Integration Ready',
          badgeColor: isConfigured
            ? 'bg-blue-100 text-blue-800'
            : 'bg-amber-100 text-amber-800',
        };

      default:
        return {
          label: 'Cash Payment',
          description: 'Pay the driver directly after the trip.',
          isConfigured: true,
        };
    }
  },

  /**
   * Initiates payment for a completed ride.
   * For Cash: creates/updates payment record in Firestore with pending status for cash collection.
   * For Card/Digital: calls secure ZAKA server to initiate Peach Payments Hosted Checkout.
   */
  async processPaymentInitiation(
    ride: RideDocument,
    method: PaymentMethod
  ): Promise<PaymentProviderResponse> {
    const finalAmount = Number(ride.finalFare || ride.estimatedFare) || 35.0;

    if (method === 'cash') {
      const platformFee = Math.round(finalAmount * 15) / 100;
      const driverEarnings = Math.round((finalAmount - platformFee) * 100) / 100;

      // Ensure cash payment record exists in Firestore with status 'pending'
      const paymentId = await firestoreService.createOrUpdatePaymentRecord({
        rideId: ride.id,
        passengerId: ride.passengerId,
        driverId: ride.driverId || '',
        amount: finalAmount,
        currency: 'ZAR',
        paymentMethod: 'cash',
        paymentStatus: 'pending',
        platformCommission: platformFee,
        platformFee,
        driverEarnings,
        provider: 'cash',
        transactionReference: `CASH-${Date.now().toString(36).toUpperCase()}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        paidAt: null,
      });

      return {
        success: true,
        paymentStatus: 'pending',
        provider: 'cash',
        transactionReference: `CASH-${ride.id.substring(0, 8).toUpperCase()}`,
        message: 'Cash payment pending. Please hand the exact fare directly to your driver.',
      };
    }

    // Electronic Payment via Peach Payments
    try {
      const response = await fetch('/api/payments/peach/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rideId: ride.id,
          paymentMethod: method,
        }),
      });

      const data = await response.json();

      if (data.code === 'PEACH_CREDENTIALS_REQUIRED') {
        return {
          success: false,
          code: 'PEACH_CREDENTIALS_REQUIRED',
          paymentStatus: 'pending',
          provider: 'peach',
          merchantTransactionId: data.merchantTransactionId,
          amount: data.amount,
          message:
            'ZAKA PAYMENT INTEGRATION IMPLEMENTED — AWAITING PEACH MERCHANT CREDENTIALS AND PRODUCTION ONBOARDING.',
        };
      }

      if (!response.ok || !data.success) {
        return {
          success: false,
          paymentStatus: 'pending',
          provider: 'peach',
          message: data.error || data.message || 'Unable to initiate Peach Payments checkout session.',
        };
      }

      if (data.redirectUrl) {
        return {
          success: true,
          requiresRedirect: true,
          redirectUrl: data.redirectUrl,
          peachCheckoutId: data.peachCheckoutId,
          merchantTransactionId: data.merchantTransactionId,
          paymentStatus: 'pending',
          provider: 'peach',
          amount: data.amount,
          message: 'Redirecting to Peach Payments secure checkout...',
        };
      }

      return {
        success: Boolean(data.success),
        paymentStatus: data.paymentStatus || 'pending',
        merchantTransactionId: data.merchantTransactionId,
        provider: 'peach',
        message: data.message || 'Payment session active.',
      };
    } catch (err: any) {
      console.warn('[PaymentService] Peach initiate request failed:', err);
      return {
        success: false,
        paymentStatus: 'pending',
        provider: 'peach',
        message: 'Could not connect to payment service. Please try again or settle via Cash.',
      };
    }
  },

  /**
   * Verifies Peach Payments transaction status through server-side validation
   */
  async verifyPeachPayment(
    rideId: string,
    checkoutId?: string,
    merchantTransactionId?: string
  ): Promise<{ success: boolean; paymentStatus: PaymentStatus; message: string }> {
    try {
      const res = await fetch('/api/payments/peach/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rideId,
          checkoutId,
          merchantTransactionId,
        }),
      });

      const data = await res.json();
      return {
        success: Boolean(data.success),
        paymentStatus: data.paymentStatus || 'pending',
        message: data.message || (data.success ? 'Payment verified successfully.' : 'Payment pending verification.'),
      };
    } catch (err: any) {
      console.warn('[PaymentService] Peach verify request failed:', err);
      return {
        success: false,
        paymentStatus: 'pending',
        message: 'Network error verifying payment status.',
      };
    }
  },

  /**
   * Driver confirms cash receipt, transitioning payment status to 'paid'
   */
  async confirmCashPayment(rideId: string, driverId: string): Promise<boolean> {
    return firestoreService.markCashPaymentPaid(rideId, driverId);
  },
};
