/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Become a Driver Modal
 * Upgrades an existing authenticated Rider to also have the Driver role under the same UID.
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { VehicleType, DriverVehicle, ACTIVE_VEHICLE_TYPES } from '../../types';
import {
  X,
  Car,
  ShieldCheck,
  CheckCircle2,
  FileCheck,
  ArrowRight,
  Sparkles,
  AlertCircle,
  Clock,
  Loader2,
} from 'lucide-react';

interface BecomeDriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const BecomeDriverModal: React.FC<BecomeDriverModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { userProfile, becomeDriver, switchActiveRole } = useAuth();

  const [vehicleMake, setVehicleMake] = useState('Toyota');
  const [vehicleModel, setVehicleModel] = useState('Corolla Quest');
  const [vehicleYear, setVehicleYear] = useState('2021');
  const [vehicleColour, setVehicleColour] = useState('White');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('economy');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successComplete, setSuccessComplete] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const plateClean = vehiclePlate.trim().toUpperCase();
    if (!plateClean) {
      setError('Please enter your vehicle registration plate number.');
      return;
    }

    setLoading(true);
    try {
      const vehicle: Partial<DriverVehicle> = {
        vehicleType,
        make: vehicleMake.trim() || 'Toyota',
        model: vehicleModel.trim() || 'Corolla Quest',
        year: Number(vehicleYear) || 2021,
        colour: vehicleColour.trim() || 'White',
        registrationNumber: plateClean,
        passengerCapacity: vehicleType === 'xl' ? 6 : 4,
        status: 'pending',
      };

      await becomeDriver(vehicle);
      setSuccessComplete(true);
      onSuccess?.();
    } catch (err: any) {
      setError(err?.message || 'Failed to update your account to include driver role.');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchToDriverNow = async () => {
    try {
      await switchActiveRole('driver');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Could not switch to Driver mode.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs select-none">
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[20px] border border-white/80 bg-white p-6 sm:p-8 shadow-modal animate-in fade-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 rounded-full p-2 text-neutral-400 hover:bg-surface-2 hover:text-ink-2 transition-colors cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        {!successComplete ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Header */}
            <div className="space-y-1.5 pr-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-card bg-amber-50 text-primary-text mb-2">
                <Car className="h-6 w-6 stroke-[2.2]" />
              </div>
              <h2 className="text-xl font-bold text-neutral-950">
                Drive with ZAKA
              </h2>
              <p className="text-xs text-ink-3 leading-relaxed">
                Add Driver capabilities to your existing ZAKA identity ({userProfile?.name || 'Rider'}). You will be able to switch between Rider and Driver modes seamlessly with one account.
              </p>
            </div>

            {/* Checklist */}
            <div className="space-y-2 rounded-card bg-surface-2 p-4 border border-line text-xs text-ink-2">
              <p className="font-bold text-ink mb-1 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary-text" />
                Onboarding Requirements:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-ink-2">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                  <span>Valid Driver's Licence</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                  <span>Professional Permit (PrDP)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                  <span>Vehicle Registration (RC1)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                  <span>Roadworthy Certificate</span>
                </div>
              </div>
              <p className="text-[11px] text-neutral-400 pt-1 border-t border-neutral-200/60">
                * Documents can be uploaded once your driver profile is created.
              </p>
            </div>

            {/* Vehicle Starter Inputs */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-ink">Vehicle Information</p>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-ink-2 mb-1">Make</label>
                  <input
                    type="text"
                    required
                    value={vehicleMake}
                    onChange={(e) => setVehicleMake(e.target.value)}
                    placeholder="Toyota"
                    className="w-full rounded-input border border-line px-3 py-2 text-xs font-medium focus:border-neutral-900 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-ink-2 mb-1">Model</label>
                  <input
                    type="text"
                    required
                    value={vehicleModel}
                    onChange={(e) => setVehicleModel(e.target.value)}
                    placeholder="Corolla Quest"
                    className="w-full rounded-input border border-line px-3 py-2 text-xs font-medium focus:border-neutral-900 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-ink-2 mb-1">Year</label>
                  <input
                    type="number"
                    min={2005}
                    max={2026}
                    value={vehicleYear}
                    onChange={(e) => setVehicleYear(e.target.value)}
                    className="w-full rounded-input border border-line px-3 py-2 text-xs font-medium focus:border-neutral-900 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-ink-2 mb-1">Colour</label>
                  <input
                    type="text"
                    required
                    value={vehicleColour}
                    onChange={(e) => setVehicleColour(e.target.value)}
                    placeholder="White"
                    className="w-full rounded-input border border-line px-3 py-2 text-xs font-medium focus:border-neutral-900 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-ink-2 mb-1">Plate Number</label>
                  <input
                    type="text"
                    required
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                    placeholder="ZK 89 GP"
                    className="w-full rounded-input border border-line px-3 py-2 text-xs font-medium uppercase tracking-wider focus:border-neutral-900 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-ink-2 mb-1">Vehicle Tier</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {ACTIVE_VEHICLE_TYPES.map((vt) => (
                    <button
                      key={vt}
                      type="button"
                      onClick={() => setVehicleType(vt)}
                      className={`rounded-full py-2 px-1 text-center text-[11px] font-bold capitalize transition-all cursor-pointer border ${
                        vehicleType === vt
                          ? 'border-neutral-900 bg-ink text-white '
                          : 'border-line bg-white text-ink-2 hover:bg-surface-2'
                      }`}
                    >
                      {vt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 p-3 text-xs text-danger border border-red-200 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Actions */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-xs font-bold text-ink hover:bg-primary-hover active:bg-primary-pressed active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Adding Driver Role...</span>
                  </>
                ) : (
                  <>
                    <span>Submit Driver Application</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="text-center space-y-5 py-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-success">
              <CheckCircle2 className="h-8 w-8 stroke-[2.2]" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-neutral-950">
                Driver Role Added!
              </h2>
              <p className="text-xs text-ink-2 leading-relaxed max-w-sm mx-auto">
                Your ZAKA identity now supports both <strong>Rider Mode</strong> and <strong>Driver Mode</strong> under your single account.
              </p>
              <p className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200/60 max-w-sm mx-auto">
                Your driver status is currently <strong>Pending Verification</strong>. Please switch to Driver Mode to submit your licence and vehicle documents for admin approval.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={handleSwitchToDriverNow}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-neutral-950 py-3.5 text-xs font-bold text-white shadow-card hover:bg-ink active:scale-[0.99] transition-all cursor-pointer"
              >
                <Car className="h-4 w-4 text-primary-text" />
                <span>Switch to Driver Mode Now</span>
                <ArrowRight className="h-4 w-4 text-neutral-400" />
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-full border border-line py-3 text-xs font-bold text-ink-2 hover:bg-surface-2 transition-all cursor-pointer"
              >
                Stay in Rider Mode for Now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
