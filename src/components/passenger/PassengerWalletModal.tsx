/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Clean White iPhone-Style Wallet & Payment Modal
 * Visuals: Clean white surfaces, soft shadows, rounded-card cards, circular buttons, ZAKA orange accent
 *
 * The balance and the transaction list are read live from Firestore. The balance itself is only ever
 * changed by the backend: credited when Peach Payments confirms a top-up, debited when a wallet ride is settled.
 */

import React, { useEffect, useState } from 'react';
import {
  X,
  Wallet,
  CreditCard,
  Banknote,
  CheckCircle2,
  ShieldCheck,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { fareService } from '../../services/fareService';
import { firestoreService } from '../../firebase/firestoreService';
import { paymentService, PaymentGatewayConfig } from '../../services/paymentService';
import { PaymentMethod, WalletTransaction } from '../../types';

interface PassengerWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPaymentMethod?: PaymentMethod;
  onSelectPaymentMethod?: (method: PaymentMethod) => void;
  /** Message to show when the modal opens (e.g. result of a top-up the user just returned from) */
  initialNotice?: string | null;
}

const TOPUP_AMOUNTS = [50, 100, 200, 500];

export const PassengerWalletModal: React.FC<PassengerWalletModalProps> = ({
  isOpen,
  onClose,
  currentPaymentMethod = 'cash',
  onSelectPaymentMethod,
  initialNotice = null,
}) => {
  const { userProfile, passengerProfile } = useAuth();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(currentPaymentMethod);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [gatewayConfig, setGatewayConfig] = useState<PaymentGatewayConfig | null>(null);
  const [toppingUp, setToppingUp] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: 'info' | 'error' | 'success'; text: string } | null>(null);

  const walletBalance = passengerProfile?.walletBalance ?? 0;
  const uid = userProfile?.uid;

  useEffect(() => {
    setSelectedMethod(currentPaymentMethod);
  }, [currentPaymentMethod]);

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

  // Live wallet ledger + gateway availability while the modal is open
  useEffect(() => {
    if (!isOpen || !uid) return;
    setNotice(initialNotice ? { tone: 'info', text: initialNotice } : null);
    paymentService.getGatewayConfig().then(setGatewayConfig).catch(() => setGatewayConfig(null));
    const unsubscribe = firestoreService.listenToWalletTransactions(uid, setTransactions);
    return () => unsubscribe();
  }, [isOpen, uid, initialNotice]);

  if (!isOpen) return null;

  const cardAvailable = Boolean(gatewayConfig?.isConfigured);

  const handleTopup = async (amount: number) => {
    setNotice(null);
    setToppingUp(amount);
    try {
      const result = await paymentService.initiateWalletTopup(amount);
      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }
      setNotice({ tone: result.success ? 'info' : 'error', text: result.message });
    } catch (err: any) {
      setNotice({ tone: 'error', text: err?.message || 'Could not start the top-up. Please try again.' });
    } finally {
      setToppingUp(null);
    }
  };

  const selectMethod = (method: PaymentMethod) => {
    setSelectedMethod(method);
    onSelectPaymentMethod?.(method);
  };

  const methods: Array<{
    id: PaymentMethod;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    disabled?: boolean;
  }> = [
    {
      id: 'cash',
      title: 'Cash to Driver',
      subtitle: 'Settle the exact fare with your driver on arrival',
      icon: <Banknote className="h-5 w-5" />,
    },
    {
      id: 'wallet',
      title: 'ZAKA Wallet',
      subtitle: `Pay from your balance (${fareService.formatZAR(walletBalance)} available)`,
      icon: <Wallet className="h-5 w-5" />,
    },
    {
      id: 'card',
      title: 'Credit / Debit Card',
      subtitle: cardAvailable
        ? 'Visa & Mastercard via Peach Payments secure checkout'
        : 'Not available yet',
      icon: <CreditCard className="h-5 w-5" />,
      disabled: !cardAvailable,
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4 sm:pb-28 transition-all cursor-pointer"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-lg flex-col rounded-t-sheet sm:rounded-[20px] bg-white p-5 sm:p-7 shadow-modal border border-line max-h-[90dvh] sm:max-h-[calc(100dvh-9rem)] overflow-y-auto pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:pb-7 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-line">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-50 text-primary-text">
              <Wallet className="h-5 w-5 stroke-[2.4]" />
            </div>
            <div>
              <h2 id="wallet-modal-title" className="text-lg font-bold text-ink tracking-tight">
                ZAKA Wallet & Pay
              </h2>
              <p className="text-xs text-ink-3 font-medium">Manage payment methods & credits</p>
            </div>
          </div>

          {/* iPhone-Style Circular Close Button */}
          <button
            id="btn-close-wallet"
            onClick={onClose}
            aria-label="Close wallet"
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-surface-2 text-ink-2 hover:bg-neutral-200 active:scale-95 transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Balance Card */}
        <div className="mt-5 rounded-card bg-ink p-6 text-white shadow-modal relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-32 h-32 rounded-full bg-primary-100 blur-2xl pointer-events-none" />
          <div className="relative z-10">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-300">
              ZAKA Wallet Balance
            </span>
            <div id="wallet-balance-amount" className="mt-2 text-3xl font-bold tracking-tight text-white">
              {fareService.formatZAR(walletBalance)}
            </div>
            <p className="mt-1 text-xs text-neutral-400">Available for rides across South Africa</p>

            {/* Top-up */}
            <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-white/10">
              <span className="text-[11px] text-neutral-300 font-semibold mr-1">Add funds:</span>
              {TOPUP_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  onClick={() => handleTopup(amt)}
                  disabled={toppingUp !== null}
                  className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white hover:bg-white/25 active:scale-95 transition-all min-h-[32px] disabled:opacity-50"
                >
                  {toppingUp === amt ? 'Opening…' : `+R${amt}`}
                </button>
              ))}
            </div>
            {gatewayConfig && !cardAvailable && (
              <p className="mt-2 text-[11px] font-semibold text-amber-300">
                Top-ups open as soon as card payments are activated for ZAKA.
              </p>
            )}
          </div>
        </div>

        {notice && (
          <div
            className={`mt-3 flex items-start gap-2 rounded-card border p-3 text-xs font-bold ${
              notice.tone === 'error'
                ? 'border-red-200 bg-red-50 text-danger'
                : notice.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{notice.text}</span>
          </div>
        )}

        {/* Payment Methods Selection */}
        <div className="mt-6 space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-3">
            Default Payment Method
          </span>

          {methods.map((m) => {
            const active = selectedMethod === m.id;
            return (
              <button
                key={m.id}
                type="button"
                disabled={m.disabled}
                onClick={() => selectMethod(m.id)}
                className={`flex w-full items-center justify-between rounded-card p-4 text-left transition-all border ${
                  active
                    ? 'border-primary bg-primary-50/30 '
                    : 'border-line bg-neutral-50/70 hover:bg-white hover:border-neutral-300'
                } ${m.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-full ${
                      active ? 'bg-primary text-on-primary' : 'bg-neutral-200 text-ink-2'
                    }`}
                  >
                    {m.icon}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-ink">{m.title}</h4>
                    <p className="text-xs text-ink-3 font-medium">{m.subtitle}</p>
                  </div>
                </div>
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                    active ? 'border-primary bg-primary text-on-primary' : 'border-neutral-300'
                  }`}
                >
                  {active && <CheckCircle2 className="h-4 w-4" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Wallet Activity */}
        <div className="mt-6">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-3">
            Wallet Activity
          </span>
          {transactions.length === 0 ? (
            <p className="mt-2 rounded-card border border-line bg-neutral-50/70 p-4 text-xs font-medium text-ink-3">
              No wallet activity yet. Top-ups and wallet ride payments will appear here.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-card border border-line bg-white">
              {transactions.slice(0, 20).map((tx) => {
                const credit = tx.direction === 'credit';
                const pending = tx.status !== 'completed';
                return (
                  <li key={tx.id} className="flex items-center justify-between gap-3 p-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          pending
                            ? 'bg-amber-50 text-amber-600'
                            : credit
                              ? 'bg-emerald-50 text-success'
                              : 'bg-surface-2 text-ink-2'
                        }`}
                      >
                        {pending ? (
                          <Clock className="h-4 w-4" />
                        ) : credit ? (
                          <ArrowDownLeft className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-ink">
                          {tx.description || (tx.type === 'topup' ? 'Wallet top-up' : 'Ride payment')}
                        </p>
                        <p className="text-[11px] font-medium text-ink-3">
                          {new Date(tx.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                          {pending ? ' • Awaiting confirmation' : ''}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 text-xs font-bold ${
                        pending ? 'text-neutral-400' : credit ? 'text-success' : 'text-ink'
                      }`}
                    >
                      {credit ? '+' : '−'}
                      {fareService.formatZAR(tx.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Security Note */}
        <div className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-ink-3 font-medium">
          <ShieldCheck className="h-4 w-4 text-success" />
          <span>Card details are handled by Peach Payments and never stored by ZAKA</span>
        </div>

        {/* Primary Action Button */}
        <button
          id="btn-wallet-done"
          onClick={onClose}
          className="mt-6 w-full rounded-full py-3.5 bg-primary text-on-primary font-bold text-sm hover:bg-[#F57C00] active:scale-[0.98] transition-all min-h-[48px] cursor-pointer"
        >
          Save & Done
        </button>
      </div>
    </div>
  );
};
