/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Driver Application: personal and vehicle details
 * Personal details are kept in a private record that only the driver and ZAKA Admin can read.
 * Identity and vehicle details are fixed once saved; only the home address can be updated.
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { firestoreService } from '../../firebase/firestoreService';
import { DriverPrivateDetails, VehicleType, ACTIVE_VEHICLE_TYPES } from '../../types';
import {
  NATIONALITIES,
  parseDateOfBirth,
  formatDateInput,
  validateSouthAfricanId,
  maskIdNumber,
  ageFromDateOfBirth,
} from '../../utils/identityUtils';
import { Car, CheckCircle2, Home, Lock, RefreshCw, Save, User } from 'lucide-react';

const MIN_DRIVER_AGE = 18;

const inputClass =
  'w-full rounded-input border border-line bg-surface-2 p-2.5 text-xs text-ink focus:border-primary focus:outline-none';
const labelClass = 'mb-1 block text-[11px] font-bold text-ink-2';

function readableError(err: any, fallback: string): string {
  const msg = String(err?.message || '');
  if (!msg || msg.startsWith('{') || /permission|insufficient|firestore/i.test(msg)) return fallback;
  return msg;
}

export const DriverApplicationDetails: React.FC = () => {
  const { userProfile, driverProfile, refreshProfiles } = useAuth();
  const uid = userProfile?.uid || '';

  // ---- Personal details -------------------------------------------------------------------
  const [details, setDetails] = useState<DriverPrivateDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [homeAddress, setHomeAddress] = useState('');
  const [dobInput, setDobInput] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [nationality, setNationality] = useState('South African');
  const [idNumber, setIdNumber] = useState('');
  const [editingAddress, setEditingAddress] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [detailsSaved, setDetailsSaved] = useState(false);

  const loadDetails = async () => {
    if (!uid) return;
    setLoadingDetails(true);
    setLoadFailed(false);
    try {
      const saved = await firestoreService.getDriverPrivateDetails(uid);
      setDetails(saved);
      setHomeAddress(saved?.homeAddress || '');
    } catch {
      // The form is not offered when the saved details could not be read: it must never overwrite them
      setLoadFailed(true);
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    loadDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid || savingDetails) return;
    setDetailsError('');

    const cleanAddress = homeAddress.trim().replace(/\s+/g, ' ');
    if (cleanAddress.length < 10) {
      setDetailsError('Please enter your full home address (street, suburb and city).');
      return;
    }
    const dateOfBirth = parseDateOfBirth(dobInput);
    if (!dateOfBirth) {
      setDetailsError('Please enter your date of birth as YYYY/MM/DD.');
      return;
    }
    if (ageFromDateOfBirth(dateOfBirth) < MIN_DRIVER_AGE) {
      setDetailsError(`You must be at least ${MIN_DRIVER_AGE} years old to drive with ZAKA.`);
      return;
    }
    if (!gender) {
      setDetailsError('Please select your gender.');
      return;
    }
    const cleanId = idNumber.trim().replace(/\s+/g, '').toUpperCase();
    if (nationality === 'South African') {
      const idProblem = validateSouthAfricanId(cleanId, dateOfBirth);
      if (idProblem) {
        setDetailsError(idProblem);
        return;
      }
    } else if (!/^[A-Z0-9]{6,20}$/.test(cleanId)) {
      setDetailsError('Please enter your passport or ID number (letters and digits only).');
      return;
    }

    setSavingDetails(true);
    try {
      await firestoreService.saveDriverPrivateDetails(
        uid,
        { homeAddress: cleanAddress, dateOfBirth, gender, nationality, idNumber: cleanId },
        true
      );
      await loadDetails();
      setDetailsSaved(true);
      setTimeout(() => setDetailsSaved(false), 3000);
    } catch (err: any) {
      setDetailsError(readableError(err, 'We could not save your details. Please check your connection and try again.'));
    } finally {
      setSavingDetails(false);
    }
  };

  const handleSaveAddress = async () => {
    if (!uid || savingDetails) return;
    setDetailsError('');
    const cleanAddress = homeAddress.trim().replace(/\s+/g, ' ');
    if (cleanAddress.length < 10) {
      setDetailsError('Please enter your full home address (street, suburb and city).');
      return;
    }
    setSavingDetails(true);
    try {
      await firestoreService.saveDriverPrivateDetails(uid, { homeAddress: cleanAddress }, false);
      setDetails((prev) => (prev ? { ...prev, homeAddress: cleanAddress } : prev));
      setEditingAddress(false);
      setDetailsSaved(true);
      setTimeout(() => setDetailsSaved(false), 3000);
    } catch (err: any) {
      setDetailsError(readableError(err, 'We could not save your address. Please check your connection and try again.'));
    } finally {
      setSavingDetails(false);
    }
  };

  // ---- Vehicle ----------------------------------------------------------------------------
  const vehicle = driverProfile?.vehicle;
  const vehicleRegistered = Boolean(vehicle?.registrationNumber);
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [colour, setColour] = useState('');
  const [plate, setPlate] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('economy');
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [vehicleError, setVehicleError] = useState('');

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid || savingVehicle) return;
    setVehicleError('');
    const cleanPlate = plate.trim().toUpperCase().replace(/\s+/g, ' ');
    if (!make.trim() || !model.trim() || !colour.trim() || cleanPlate.length < 4) {
      setVehicleError('Please complete the make, model, colour and licence plate number.');
      return;
    }
    setSavingVehicle(true);
    try {
      await firestoreService.createOrUpdateVehicle({
        driverId: uid,
        vehicleType,
        make: make.trim(),
        model: model.trim(),
        colour: colour.trim(),
        registrationNumber: cleanPlate,
        passengerCapacity: vehicleType === 'xl' ? 6 : 4,
        status: 'pending',
      });
      await refreshProfiles();
    } catch (err: any) {
      setVehicleError(readableError(err, 'We could not save your vehicle. Please check your connection and try again.'));
    } finally {
      setSavingVehicle(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Personal details */}
      <div className="space-y-3 rounded-card border border-line bg-white p-4">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink">
            <User className="h-3.5 w-3.5 text-primary-text" />
            Personal Details
          </span>
          {details ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
              <CheckCircle2 className="h-3 w-3" />
              Saved
            </span>
          ) : (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-ink-2">Required</span>
          )}
        </div>

        {detailsSaved && (
          <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-[11px] font-bold text-emerald-800">
            Your details have been saved.
          </p>
        )}
        {detailsError && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-2 text-[11px] font-bold text-danger">
            {detailsError}
          </p>
        )}

        {loadingDetails ? (
          <div className="flex items-center gap-2 py-3 text-xs font-semibold text-ink-2">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Loading your details...
          </div>
        ) : loadFailed ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] font-bold text-amber-900">
            <span>We could not load your details. Check your connection and try again.</span>
            <button type="button" onClick={loadDetails} className="shrink-0 underline cursor-pointer">
              Retry
            </button>
          </div>
        ) : details ? (
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1 text-[11px] font-bold text-ink-2">
                  <Home className="h-3 w-3" />
                  Home Address
                </span>
                {!editingAddress && (
                  <button
                    type="button"
                    onClick={() => {
                      setHomeAddress(details.homeAddress || '');
                      setDetailsError('');
                      setEditingAddress(true);
                    }}
                    className="text-[11px] font-bold text-ink underline cursor-pointer"
                  >
                    {details.homeAddress ? 'Update' : 'Add'}
                  </button>
                )}
              </div>
              {editingAddress ? (
                <div className="space-y-2">
                  <textarea
                    aria-label="Home address"
                    value={homeAddress}
                    onChange={(e) => setHomeAddress(e.target.value)}
                    rows={2}
                    maxLength={200}
                    placeholder="Street address, suburb, city, postal code"
                    className={inputClass}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveAddress}
                      disabled={savingDetails}
                      className="rounded-full bg-primary px-3.5 py-1.5 text-[11px] font-bold text-ink hover:bg-primary-hover disabled:opacity-50 cursor-pointer"
                    >
                      {savingDetails ? 'Saving...' : 'Save Address'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingAddress(false)}
                      className="rounded-full px-3 py-1.5 text-[11px] font-bold text-ink-2 hover:bg-surface-2 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs font-bold text-ink">{details.homeAddress || 'Not provided'}</p>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-surface-2 p-3 text-xs">
              <div>
                <dt className="text-[11px] text-ink-3">Date of Birth</dt>
                <dd className="font-bold text-ink">{(details.dateOfBirth || '').replace(/-/g, '/') || '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-ink-3">Gender</dt>
                <dd className="font-bold capitalize text-ink">{details.gender || '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-ink-3">Nationality</dt>
                <dd className="font-bold text-ink">{details.nationality || '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-ink-3">ID / Passport Number</dt>
                <dd className="font-mono font-bold text-ink">{details.idNumber ? maskIdNumber(details.idNumber) : '—'}</dd>
              </div>
            </dl>
            <p className="flex items-start gap-1.5 text-[11px] text-ink-3">
              <Lock className="mt-0.5 h-3 w-3 shrink-0" />
              These details are only visible to you and ZAKA Admin. Passengers never see them. To correct them, contact ZAKA support.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSaveDetails} className="space-y-3">
            <div>
              <label htmlFor="driver-home-address" className={labelClass}>Home Address</label>
              <textarea
                id="driver-home-address"
                value={homeAddress}
                onChange={(e) => setHomeAddress(e.target.value)}
                rows={2}
                maxLength={200}
                placeholder="Street address, suburb, city, postal code"
                className={inputClass}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="driver-dob" className={labelClass}>Date of Birth</label>
                <input
                  id="driver-dob"
                  type="text"
                  inputMode="numeric"
                  value={dobInput}
                  onChange={(e) => setDobInput(formatDateInput(e.target.value))}
                  placeholder="YYYY/MM/DD"
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label htmlFor="driver-gender" className={labelClass}>Gender</label>
                <select
                  id="driver-gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value as 'male' | 'female' | '')}
                  className={inputClass}
                  required
                >
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="driver-nationality" className={labelClass}>Nationality</label>
                <select
                  id="driver-nationality"
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  className={inputClass}
                >
                  {NATIONALITIES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="driver-id-number" className={labelClass}>
                  {nationality === 'South African' ? 'ID Number' : 'Passport / ID Number'}
                </label>
                <input
                  id="driver-id-number"
                  type="text"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  maxLength={20}
                  placeholder={nationality === 'South African' ? '13-digit ID number' : 'Passport number'}
                  className={inputClass}
                  required
                />
              </div>
            </div>
            <p className="flex items-start gap-1.5 text-[11px] text-ink-3">
              <Lock className="mt-0.5 h-3 w-3 shrink-0" />
              Only you and ZAKA Admin can see these details. Date of birth, gender, nationality and ID number cannot be changed after you save them.
            </p>
            <button
              type="submit"
              disabled={savingDetails}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-xs font-bold text-ink shadow-card hover:bg-primary-hover active:bg-primary-pressed disabled:opacity-50 cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{savingDetails ? 'Saving...' : 'Save Personal Details'}</span>
            </button>
          </form>
        )}
      </div>

      {/* Vehicle */}
      <div className="space-y-3 rounded-card border border-line bg-white p-4">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink">
            <Car className="h-3.5 w-3.5 text-primary-text" />
            Vehicle
          </span>
          {vehicleRegistered ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase text-amber-800">
              <Lock className="h-3 w-3" />
              Registered
            </span>
          ) : (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-ink-2">Required</span>
          )}
        </div>

        {vehicleRegistered && vehicle ? (
          <>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-surface-2 p-3 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-[11px] text-ink-3">Make</dt>
                <dd className="font-bold text-ink">{vehicle.make || '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-ink-3">Model</dt>
                <dd className="font-bold text-ink">{vehicle.model || '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-ink-3">Colour</dt>
                <dd className="font-bold text-ink">{vehicle.colour || '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-ink-3">Licence Plate</dt>
                <dd className="font-mono font-bold text-ink">{vehicle.registrationNumber}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-ink-3">Vehicle Class</dt>
                <dd className="font-bold uppercase text-ink">{vehicle.vehicleType}</dd>
              </div>
            </dl>
            <p className="flex items-start gap-1.5 text-[11px] text-ink-3">
              <Lock className="mt-0.5 h-3 w-3 shrink-0" />
              Vehicle details are fixed after registration. To register a different vehicle, contact ZAKA support.
            </p>
          </>
        ) : (
          <form onSubmit={handleSaveVehicle} className="space-y-3">
            {vehicleError && (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-2 text-[11px] font-bold text-danger">
                {vehicleError}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="driver-vehicle-make" className={labelClass}>Make</label>
                <input id="driver-vehicle-make" type="text" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Toyota" maxLength={40} className={inputClass} required />
              </div>
              <div>
                <label htmlFor="driver-vehicle-model" className={labelClass}>Model</label>
                <input id="driver-vehicle-model" type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Corolla" maxLength={40} className={inputClass} required />
              </div>
              <div>
                <label htmlFor="driver-vehicle-colour" className={labelClass}>Colour</label>
                <input id="driver-vehicle-colour" type="text" value={colour} onChange={(e) => setColour(e.target.value)} placeholder="Silver" maxLength={30} className={inputClass} required />
              </div>
              <div>
                <label htmlFor="driver-vehicle-plate" className={labelClass}>Licence Plate Number</label>
                <input id="driver-vehicle-plate" type="text" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="ZK 89 GP" maxLength={12} className={inputClass} required />
              </div>
            </div>
            <div>
              <span className={labelClass}>Vehicle Class</span>
              <div className="grid grid-cols-3 gap-1.5">
                {ACTIVE_VEHICLE_TYPES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={vehicleType === v}
                    onClick={() => setVehicleType(v)}
                    className={`rounded-full border py-2 text-[11px] font-bold uppercase transition-all cursor-pointer ${
                      vehicleType === v ? 'border-ink bg-ink text-white' : 'border-line bg-surface-2 text-ink-2'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <p className="flex items-start gap-1.5 text-[11px] text-ink-3">
              <Lock className="mt-0.5 h-3 w-3 shrink-0" />
              Check these details carefully: they cannot be changed after you save them.
            </p>
            <button
              type="submit"
              disabled={savingVehicle}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-xs font-bold text-ink shadow-card hover:bg-primary-hover active:bg-primary-pressed disabled:opacity-50 cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{savingVehicle ? 'Saving...' : 'Save Vehicle'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
