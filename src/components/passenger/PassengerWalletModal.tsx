/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Clean White iPhone-Style Wallet & Payment Modal
 * Visuals: Clean white surfaces, soft shadows, rounded-3xl cards, circular buttons, ZAKA orange accent
 */

import React, { useState } from 'react';
import {
  X,
  Wallet,
  CreditCard,
  Banknote,
  Plus,
  CheckCircle2,
  Tag,
  ArrowUpRight,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { fareService } from '../../services/fareService';
import { PaymentMethod } from '../../types';

interface PassengerWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPaymentMethod?: PaymentMethod;
  onSelectPaymentMethod?: (method: PaymentMethod) => void;
}

export const PassengerWalletModal: React.FC<PassengerWalletModalProps> = ({
  isOpen,
  onClose,
  currentPaymentMethod = 'cash',
  onSelectPaymentMethod,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(currentPaymentMethod);
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [walletBalance, setWalletBalance] = useState(120.0);
  const [showTopupSuccess, setShowTopupSuccess] = useState(false);

  if (!isOpen) return null;

  const handleApplyPromo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoCode.trim()) return;
    setPromoApplied(true);
    setTimeout(() => setPromoApplied(false), 4000);
    setPromoCode('');
  };

  const handleTopup = (amount: number) => {
    setWalletBalance((prev) => prev + amount);
    setShowTopupSuccess(true);
    setTimeout(() => setShowTopupSuccess(false), 2500);
  };

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4 transition-all cursor-pointer"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-lg flex-col rounded-t-[32px] sm:rounded-[32px] bg-white p-5 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.12)] border border-neutral-100 max-h-[90vh] overflow-y-auto pb-[max(1.75rem,env(safe-area-inset-bottom))] cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FFF3E0] text-[#FF7A00]">
              <Wallet className="h-5 w-5 stroke-[2.4]" />
            </div>
            <div>
              <h2 id="wallet-modal-title" className="text-lg font-extrabold text-neutral-900 tracking-tight">
                ZAKA Wallet & Pay
              </h2>
              <p className="text-xs text-neutral-500 font-medium">Manage payment methods & credits</p>
            </div>
          </div>

          {/* iPhone-Style Circular Close Button */}
          <button
            onClick={onClose}
            aria-label="Close wallet"
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 active:scale-95 transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Clean White Balance Card */}
        <div className="mt-5 rounded-[28px] bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 p-6 text-white shadow-[0_10px_30px_rgba(0,0,0,0.15)] relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-32 h-32 rounded-full bg-[#FF7A00]/20 blur-2xl pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                ZAKA Stored Credit
              </span>
              <span className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-bold text-[#FFA000] backdrop-blur-md">
                <Sparkles className="h-3 w-3" /> Active
              </span>
            </div>
            <div className="mt-2 text-3xl font-black tracking-tight text-white">
              {fareService.formatZAR(walletBalance)}
            </div>
            <p className="mt-1 text-xs text-neutral-400">Available for rides across South Africa</p>

            {/* Quick Top-up Pill Buttons */}
            <div className="mt-4 flex items-center gap-2 pt-2 border-t border-white/10">
              <span className="text-[11px] text-neutral-300 font-semibold mr-1">Quick Add:</span>
              {[50, 100, 200].map((amt) => (
                <button
                  key={amt}
                  onClick={() => handleTopup(amt)}
                  className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white hover:bg-white/25 active:scale-95 transition-all min-h-[32px]"
                >
                  +{amt}
                </button>
              ))}
            </div>
            {showTopupSuccess && (
              <p className="mt-2 text-[11px] font-bold text-emerald-400 animate-in fade-in">
                ✓ Balance successfully updated!
              </p>
            )}
          </div>
        </div>

        {/* Payment Methods Selection */}
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-neutral-500">
              Default Payment Method
            </span>
          </div>

          {/* Cash */}
          <div
            onClick={() => {
              setSelectedMethod('cash');
              onSelectPaymentMethod?.('cash');
            }}
            className={`flex cursor-pointer items-center justify-between rounded-[24px] p-4 transition-all border ${
              selectedMethod === 'cash'
                ? 'border-[#FF7A00] bg-[#FFF8E1]/30 shadow-[0_4px_16px_rgba(255,122,0,0.08)]'
                : 'border-neutral-200 bg-neutral-50/70 hover:bg-white hover:border-neutral-300'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-full ${
                  selectedMethod === 'cash' ? 'bg-[#FF7A00] text-white' : 'bg-neutral-200 text-neutral-700'
                }`}
              >
                <Banknote className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-neutral-900">Cash to Driver</h4>
                <p className="text-xs text-neutral-500 font-medium">Settle exact fare with driver upon arrival</p>
              </div>
            </div>
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                selectedMethod === 'cash' ? 'border-[#FF7A00] bg-[#FF7A00] text-white' : 'border-neutral-300'
              }`}
            >
              {selectedMethod === 'cash' && <CheckCircle2 className="h-4 w-4" />}
            </div>
          </div>

          {/* Card */}
          <div
            onClick={() => {
              setSelectedMethod('card');
              onSelectPaymentMethod?.('card');
            }}
            className={`flex cursor-pointer items-center justify-between rounded-[24px] p-4 transition-all border ${
              selectedMethod === 'card'
                ? 'border-[#FF7A00] bg-[#FFF8E1]/30 shadow-[0_4px_16px_rgba(255,122,0,0.08)]'
                : 'border-neutral-200 bg-neutral-50/70 hover:bg-white hover:border-neutral-300'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-full ${
                  selectedMethod === 'card' ? 'bg-[#FF7A00] text-white' : 'bg-neutral-200 text-neutral-700'
                }`}
              >
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-neutral-900">Credit / Debit Card</h4>
                <p className="text-xs text-neutral-500 font-medium">Visa & Mastercard •••• 4242</p>
              </div>
            </div>
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                selectedMethod === 'card' ? 'border-[#FF7A00] bg-[#FF7A00] text-white' : 'border-neutral-300'
              }`}
            >
              {selectedMethod === 'card' && <CheckCircle2 className="h-4 w-4" />}
            </div>
          </div>

          {/* Digital QR / Instant EFT */}
          <div
            onClick={() => {
              setSelectedMethod('digital');
              onSelectPaymentMethod?.('digital');
            }}
            className={`flex cursor-pointer items-center justify-between rounded-[24px] p-4 transition-all border ${
              selectedMethod === 'digital'
                ? 'border-[#FF7A00] bg-[#FFF8E1]/30 shadow-[0_4px_16px_rgba(255,122,0,0.08)]'
                : 'border-neutral-200 bg-neutral-50/70 hover:bg-white hover:border-neutral-300'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-full ${
                  selectedMethod === 'digital' ? 'bg-[#FF7A00] text-white' : 'bg-neutral-200 text-neutral-700'
                }`}
              >
                <ArrowUpRight className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-neutral-900">Instant EFT & QR</h4>
                <p className="text-xs text-neutral-500 font-medium">Capitec Pay, SnapScan & Ozow</p>
              </div>
            </div>
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                selectedMethod === 'digital' ? 'border-[#FF7A00] bg-[#FF7A00] text-white' : 'border-neutral-300'
              }`}
            >
              {selectedMethod === 'digital' && <CheckCircle2 className="h-4 w-4" />}
            </div>
          </div>
        </div>

        {/* Promo Voucher Input */}
        <div className="mt-6 rounded-[24px] border border-neutral-200 bg-neutral-50/70 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="h-4 w-4 text-[#FF7A00]" />
            <span className="text-xs font-extrabold text-neutral-800">Add Promo Voucher</span>
          </div>
          <form onSubmit={handleApplyPromo} className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. ZAKA50"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              className="flex-1 rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-xs font-bold text-neutral-900 placeholder:text-neutral-400 focus:border-[#FF7A00] focus:outline-none focus:ring-2 focus:ring-[#FF7A00]/20 min-h-[44px]"
            />
            <button
              type="submit"
              className="rounded-full bg-neutral-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-neutral-800 active:scale-95 transition-all min-h-[44px] shrink-0"
            >
              Apply
            </button>
          </form>
          {promoApplied && (
            <p className="mt-2 text-xs font-bold text-emerald-600 animate-in fade-in">
              🎉 Promo ZAKA50 applied! R50 off your next trip.
            </p>
          )}
        </div>

        {/* Security Guarantee Note */}
        <div className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-neutral-500 font-medium">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span>Encrypted 256-bit PCI-DSS South African Payment Gateway</span>
        </div>

        {/* Primary Action Button */}
        <button
          onClick={onClose}
          className="mt-6 w-full rounded-full py-3.5 bg-[#FF7A00] text-white font-extrabold text-sm shadow-[0_8px_24px_rgba(255,122,0,0.25)] hover:bg-[#F57C00] active:scale-[0.98] transition-all min-h-[48px] cursor-pointer"
        >
          Save & Done
        </button>
      </div>
    </div>
  );
};
