/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Payment Service Abstraction
 * Supports Cash settlement and prepares clean interfaces for Card and Digital payment providers.
 */

import { PaymentMethod, PaymentStatus, PaymentRecord, RideDocument } from '../types';
import { firestoreService } from '../firebase/firestoreService';
import { apiJson } from './apiClient';

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
      const { ok, status, data } = await apiJson<PaymentGatewayConfig>('/api/payments/config', { authenticated: false });
      if (!ok) throw new Error(`HTTP ${status}`);
      return data;
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
        message: 'Card payments are not available yet. Please pay with cash or your ZAKA wallet.',
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
            : 'Not available yet',
          badgeColor: isConfigured
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-amber-100 text-amber-800',
        };

      case 'digital':
        return {
          label: 'Electronic / Digital',
          description: 'Instant EFT, 1Voucher, Masterpass & digital payment channels via Peach Payments.',
          isConfigured,
          badgeText: isConfigured ? 'Peach Gateway' : 'Not available yet',
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
      // The trusted payment record (amount + 85/15 split) is written by the backend
      const settled = await firestoreService.settleRide(ride.id);
      if (!settled.success) {
        // Backend unreachable: keep a pending entry so the trip is not missing from the ledger
        const platformFee = Math.round(finalAmount * 15) / 100;
        const driverEarnings = Math.round((finalAmount - platformFee) * 100) / 100;
        await firestoreService.createOrUpdatePaymentRecord({
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
      }

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
      // The amount is decided by the server from the ride itself - it is not sent from the app
      const response = await apiJson<any>('/api/payments/peach/initiate', {
        method: 'POST',
        json: { rideId: ride.id, paymentMethod: method },
      });
      const data = response.data || {};

      if (data.code === 'PEACH_CREDENTIALS_REQUIRED') {
        return {
          success: false,
          code: 'PEACH_CREDENTIALS_REQUIRED',
          paymentStatus: 'pending',
          provider: 'peach',
          merchantTransactionId: data.merchantTransactionId,
          amount: data.amount,
          message: data.message || 'Card payments are not available yet. Please pay your driver in cash.',
        };
      }

      if (!response.ok || !data.success) {
        return {
          success: false,
          paymentStatus: 'pending',
          provider: 'peach',
          message:
            response.status === 401
              ? 'Your session has expired. Please sign in again to pay.'
              : data.error || data.message || 'Unable to initiate Peach Payments checkout session.',
        };
      }

      if (data.paymentStatus === 'paid') {
        return {
          success: true,
          paymentStatus: 'paid',
          provider: 'peach',
          amount: data.amount,
          message: data.message || 'Payment has already been confirmed.',
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
    rideId: string
  ): Promise<{ success: boolean; paymentStatus: PaymentStatus; message: string }> {
    try {
      // The server checks the checkout it created for this ride; nothing else is accepted from the app
      const { data } = await apiJson<any>('/api/payments/peach/verify', {
        method: 'POST',
        json: { rideId },
      });
      return {
        success: Boolean(data.success),
        paymentStatus: data.paymentStatus || 'pending',
        message: data.message || data.error || (data.success ? 'Payment verified successfully.' : 'Payment pending verification.'),
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
   * Starts a wallet top-up. On success the caller redirects the browser to Peach secure checkout;
   * the wallet is credited by the backend only once Peach confirms the payment.
   */
  async initiateWalletTopup(amount: number): Promise<{ success: boolean; redirectUrl?: string; transactionId?: string; message: string }> {
    try {
      const { status, data } = await apiJson<any>('/api/wallet/topup/initiate', {
        method: 'POST',
        json: { amount },
      });
      if (data?.success && data.redirectUrl) {
        return {
          success: true,
          redirectUrl: data.redirectUrl,
          transactionId: data.transactionId,
          message: 'Redirecting to secure checkout…',
        };
      }
      return {
        success: false,
        message:
          status === 401
            ? 'Your session has expired. Please sign in again.'
            : data?.message || data?.error || 'Could not start the top-up. Please try again.',
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Could not reach the payment service.' };
    }
  },

  /**
   * Confirms a top-up after the user returns from checkout (the webhook normally gets there first)
   */
  async verifyWalletTopup(transactionId: string): Promise<{ success: boolean; amount?: number; message: string }> {
    try {
      const { data } = await apiJson<any>('/api/wallet/topup/verify', {
        method: 'POST',
        json: { transactionId },
      });
      if (data?.success) {
        return {
          success: true,
          amount: data.amount,
          message: `R${Number(data.amount || 0).toFixed(2)} has been added to your wallet.`,
        };
      }
      return { success: false, message: data?.message || data?.error || 'Your top-up has not been confirmed yet.' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Could not confirm the top-up.' };
    }
  },

  /**
   * Driver confirms cash receipt, transitioning payment status to 'paid'
   */
  async confirmCashPayment(rideId: string, driverId: string): Promise<boolean> {
    return firestoreService.markCashPaymentPaid(rideId, driverId);
  },
};
