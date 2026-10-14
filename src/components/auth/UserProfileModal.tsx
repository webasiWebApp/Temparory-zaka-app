/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - User Profile & Account Management Modal
 * Styling: Clean white panels, subtle borders, black & #FFC107 yellow accents
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  X,
  User,
  Phone,
  Mail,
  Car,
  MapPin,
  Star,
  CheckCircle2,
  Shield,
  Clock,
  LogOut,
  Save,
  Plus,
  Trash2,
  KeyRound,
  Sparkles,
  Camera,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { VehicleType, ACTIVE_VEHICLE_TYPES, DriverPrivateDetails } from '../../types';
import { firestoreService } from '../../firebase/firestoreService';
import { isRiderTarget } from '../../config/appTarget';
import { maskIdNumber } from '../../utils/identityUtils';
import { apiFetch } from '../../services/apiClient';
import { validatePhoneNumber as validateZakaPhone, formatPhoneDisplay, normalizePhoneNumber } from '../../utils/phoneUtils';
import { ownPhotoURL, imageToAvatarDataUrl, validateImageFile } from '../../utils/imageUtils';
import { SavedPlacesEditor } from '../passenger/SavedPlacesEditor';
import { PhoneOtpVerifier } from './PhoneOtpVerifier';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Firestore errors arrive as raw JSON or SDK text: never show those to the user */
function readableSaveError(err: any): string {
  const msg = String(err?.message || '');
  if (!msg || msg.startsWith('{') || /permission|insufficient|firestore/i.test(msg)) {
    return 'We could not save your changes. Please check your connection and try again.';
  }
  return msg;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose }) => {
  const {
    userProfile,
    passengerProfile,
    driverProfile,
    activeRole,
    updateUserProfileData,
    updatePassengerProfileData,
    updateDriverProfileData,
    confirmVerifiedPhone,
    resetPassword,
    deleteAccount,
    isSigningOut,
    signOut,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'profile' | 'places' | 'vehicle' | 'security'>('profile');
  const [signOutError, setSignOutError] = useState<string | null>(null);

  // Account Deletion States
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState(userProfile?.name || '');
  const [phone, setPhone] = useState(userProfile?.phone ? formatPhoneDisplay(normalizePhoneNumber(userProfile.phone)) : '');
  const [email] = useState(userProfile?.email || '');
  const [photoURL, setPhotoURL] = useState(ownPhotoURL(userProfile?.photoURL));
  const photoInputRef = React.useRef<HTMLInputElement | null>(null);
  const [changingPhone, setChangingPhone] = useState(false);
  // Driver's private details (home address, identity): only this driver and Admin can read them
  const [driverDetails, setDriverDetails] = useState<DriverPrivateDetails | null>(null);

  React.useEffect(() => {
    if (!isOpen || activeRole !== 'driver' || !userProfile?.uid) return;
    let cancelled = false;
    firestoreService
      .getDriverPrivateDetails(userProfile.uid)
      .then((d) => {
        if (!cancelled) setDriverDetails(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeRole, userProfile?.uid]);

  const isPassenger = activeRole === 'passenger';
  const isDriver = activeRole === 'driver';
  // Identity details are fixed once a passenger has submitted them for verification,
  // and once a driver has submitted their application details
  const identityLocked =
    (isPassenger && ['pending', 'approved'].includes(passengerProfile?.verificationStatus || '')) ||
    (isDriver && Boolean(driverProfile?.detailsSubmittedAt));
  // A driver's contact number and vehicle are part of their verified record: fixed after registration
  const driverPhoneLocked = isDriver && Boolean(userProfile?.phone);
  const vehicleLocked = Boolean(driverProfile?.vehicle?.registrationNumber);

  // Driver Vehicle form states
  const [vehicleMake, setVehicleMake] = useState(driverProfile?.vehicle?.make || '');
  const [vehicleModel, setVehicleModel] = useState(driverProfile?.vehicle?.model || '');
  const [vehicleColour, setVehicleColour] = useState(driverProfile?.vehicle?.colour || '');
  const [vehiclePlate, setVehiclePlate] = useState(driverProfile?.vehicle?.registrationNumber || '');
  const [vehicleType, setVehicleType] = useState<VehicleType>(driverProfile?.vehicle?.vehicleType || 'economy');

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Keep the form in step with the signed-in account each time the modal is opened
  React.useEffect(() => {
    if (!isOpen) return;
    setName(userProfile?.name || '');
    setPhone(userProfile?.phone ? formatPhoneDisplay(normalizePhoneNumber(userProfile.phone)) : '');
    setPhotoURL(ownPhotoURL(userProfile?.photoURL));
    setChangingPhone(false);
    setError('');
    setExportNotice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userProfile?.uid]);

  const handleExportData = async () => {
    setExporting(true);
    setExportNotice(null);
    try {
      const res = await apiFetch('/api/user/data-export', { timeoutMs: 60000 });
      if (res.status === 429) throw new Error('You have requested several exports recently. Please try again in an hour.');
      if (!res.ok) throw new Error('We could not prepare your data export. Please try again.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'zaka-data-export.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportNotice('Your data export has been downloaded.');
    } catch (err: any) {
      setExportNotice(err?.message || 'We could not prepare your data export. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const isPushedRef = React.useRef(false);

  React.useEffect(() => {
    if (!isOpen) return;

    // Handle Escape key dismissal
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Support browser / mobile back button dismissal
    const handlePopState = () => {
      isPushedRef.current = false;
      onClose();
    };

    try {
      window.history.pushState({ zakaModal: 'profile' }, '');
      isPushedRef.current = true;
      window.addEventListener('popstate', handlePopState);
    } catch {
      // In sandboxed environments if pushState fails
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
      if (isPushedRef.current) {
        isPushedRef.current = false;
        try {
          if (window.history.state?.zakaModal === 'profile') {
            window.history.back();
          }
        } catch {}
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    const problem = validateImageFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    try {
      setPhotoURL(await imageToAvatarDataUrl(file));
    } catch (err: any) {
      setError(err?.message || 'We could not read this image. Please choose another one.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // A passenger's number only changes through SMS verification (see "Change number")
    const phoneEditable = !isPassenger && !driverPhoneLocked;
    let trimmedPhone = '';
    if (phoneEditable && (phone.trim() || isDriver)) {
      const phoneCheck = validateZakaPhone(phone);
      if (!phoneCheck.valid) {
        setError(phoneCheck.error || 'Please enter a valid South African mobile number (e.g. 082 123 4567).');
        return;
      }
      // Stored once, in canonical form (+27821234567), on every profile document
      trimmedPhone = phoneCheck.normalized;
    }

    // Name validation
    const trimmedName = identityLocked ? userProfile?.name || '' : name.trim();
    if (trimmedName.length < 2) {
      setError('Please enter a valid name (at least 2 characters).');
      return;
    }

    setSaving(true);
    try {
      // Only what this form is allowed to change is sent
      await updateUserProfileData({
        ...(identityLocked ? {} : { name: trimmedName }),
        ...(trimmedPhone ? { phone: trimmedPhone } : {}),
        photoURL,
      });

      if (isPassenger) {
        if (!identityLocked) {
          await updatePassengerProfileData({ name: trimmedName });
        }
      } else if (activeRole === 'driver') {
        // Only what the driver may still change is sent: a registered vehicle and phone number are fixed
        const vehicleEntered = Boolean(vehicleMake.trim() && vehicleModel.trim() && vehicleColour.trim() && vehiclePlate.trim());
        await updateDriverProfileData({
          ...(identityLocked ? {} : { name: trimmedName }),
          ...(trimmedPhone ? { phone: trimmedPhone } : {}),
          photoURL,
          ...(!vehicleLocked && vehicleEntered
            ? {
                vehicle: {
                  driverId: userProfile?.uid || '',
                  make: vehicleMake.trim(),
                  model: vehicleModel.trim(),
                  colour: vehicleColour.trim(),
                  registrationNumber: vehiclePlate.trim().toUpperCase(),
                  vehicleType,
                  passengerCapacity: vehicleType === 'xl' ? 6 : 4,
                  // Vehicle approval is decided by ZAKA Admin, never by the driver's own profile form
                  status: driverProfile?.vehicle?.status || 'pending',
                },
              }
            : {}),
        });
      }

      if (trimmedPhone) setPhone(formatPhoneDisplay(trimmedPhone));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Profile update failed:', err);
      setError(readableSaveError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSendResetPassword = async () => {
    if (!email) return;
    try {
      await resetPassword(email);
      setResetSent(true);
      setTimeout(() => setResetSent(false), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-profile-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 pb-24 sm:pb-4 backdrop-blur-sm cursor-pointer"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-lg flex-col rounded-[20px] border border-line bg-white shadow-modal overflow-hidden cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line p-5">
          <div className="flex items-center gap-3">
            <div className="relative">
              {photoURL ? (
                <img
                  src={photoURL}
                  alt={name || 'User'}
                  className="h-11 w-11 rounded-card object-cover border border-line "
                />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-card bg-ink text-base font-bold text-white">
                  {(userProfile?.name || 'U').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <h3 id="user-profile-modal-title" className="text-base font-bold text-ink">{userProfile?.name || 'Account Settings'}</h3>
              <p className="text-[11px] text-ink-3 font-medium">
                {userProfile?.email} • <span className="uppercase font-bold text-ink">{activeRole}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close profile"
            className="rounded-full p-1.5 text-neutral-400 hover:bg-surface-2 hover:text-ink cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-line bg-surface-2 px-4 pt-2">
          <button
            onClick={() => setActiveTab('profile')}
            className={`border-b-2 px-3.5 py-2 text-xs font-bold transition-all ${
              activeTab === 'profile'
                ? 'border-ink text-ink'
                : 'border-transparent text-ink-3 hover:text-ink'
            }`}
          >
            Profile Info
          </button>

          {activeRole === 'passenger' && (
            <button
              onClick={() => setActiveTab('places')}
              className={`border-b-2 px-3.5 py-2 text-xs font-bold transition-all ${
                activeTab === 'places'
                  ? 'border-ink text-ink'
                  : 'border-transparent text-ink-3 hover:text-ink'
              }`}
            >
              Saved Places
            </button>
          )}

          {!isRiderTarget && activeRole === 'driver' && (
            <button
              onClick={() => setActiveTab('vehicle')}
              className={`border-b-2 px-3.5 py-2 text-xs font-bold transition-all ${
                activeTab === 'vehicle'
                  ? 'border-ink text-ink'
                  : 'border-transparent text-ink-3 hover:text-ink'
              }`}
            >
              Vehicle Details
            </button>
          )}

          <button
            onClick={() => setActiveTab('security')}
            className={`border-b-2 px-3.5 py-2 text-xs font-bold transition-all ${
              activeTab === 'security'
                ? 'border-ink text-ink'
                : 'border-transparent text-ink-3 hover:text-ink'
            }`}
          >
            Security & Auth
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {saveSuccess && (
            <div className="flex items-center gap-2 rounded-card bg-emerald-50 border border-emerald-200 p-3 text-xs font-bold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              <span>Profile changes saved.</span>
            </div>
          )}

          {resetSent && (
            <div className="flex items-center gap-2 rounded-card bg-amber-50 border border-amber-200 p-3 text-xs font-bold text-amber-900">
              <CheckCircle2 className="h-4 w-4" />
              <span>Password reset link sent to your registered email!</span>
            </div>
          )}

          {error && (
            <div className="rounded-card bg-red-50 border border-red-200 p-3 text-xs font-bold text-danger">
              {error}
            </div>
          )}

          {/* TAB 1: PROFILE INFO */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              {/* Drivers upload their own profile photo (passengers see it when a ride is accepted) */}
              {isDriver && (
                <div>
                  <span className="block text-xs font-bold text-ink mb-2">Profile Photo</span>
                  <div className="flex items-center gap-3">
                    {photoURL ? (
                      <img src={photoURL} alt="Your profile" className="h-14 w-14 rounded-full object-cover border border-line" />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 border border-line text-ink-3">
                        <User className="h-6 w-6" />
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        id="btn-upload-profile-photo"
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-2 text-xs font-bold text-ink hover:bg-surface-2 cursor-pointer"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        {photoURL ? 'Change Photo' : 'Upload Photo'}
                      </button>
                      {photoURL && (
                        <button
                          type="button"
                          onClick={() => setPhotoURL('')}
                          className="rounded-full px-3 py-2 text-xs font-bold text-ink-2 hover:bg-surface-2 cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handlePhotoSelected}
                      className="hidden"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="profile-name" className="block text-xs font-bold text-ink mb-1">Name and Surname</label>
                <input
                  id="profile-name"
                  type="text"
                  value={identityLocked ? userProfile?.name || '' : name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={identityLocked}
                  className={`w-full rounded-input border border-line p-3 text-xs focus:border-primary focus:outline-none ${
                    identityLocked ? 'bg-[#EEEEEE] text-ink-3 cursor-not-allowed' : 'bg-surface-2 text-ink'
                  }`}
                  required
                />
              </div>

              {isPassenger ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="block text-xs font-bold text-ink">Mobile Number</span>
                    {passengerProfile?.phoneVerified && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success">
                        <CheckCircle2 className="h-3 w-3" />
                        Verified
                      </span>
                    )}
                  </div>
                  {changingPhone ? (
                    <div className="rounded-card border border-line p-3">
                      <PhoneOtpVerifier
                        onCancel={() => setChangingPhone(false)}
                        onVerified={async (verified) => {
                          await confirmVerifiedPhone(verified);
                          setPhone(formatPhoneDisplay(verified.phone));
                          setChangingPhone(false);
                          setSaveSuccess(true);
                          setTimeout(() => setSaveSuccess(false), 3000);
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="tel"
                        aria-label="Mobile number"
                        value={phone || 'Not set'}
                        disabled
                        className="w-full rounded-input border border-line bg-[#EEEEEE] p-3 text-xs text-ink-3 cursor-not-allowed"
                      />
                      <button
                        id="btn-change-phone"
                        type="button"
                        onClick={() => {
                          setError('');
                          setChangingPhone(true);
                        }}
                        className="shrink-0 rounded-full border border-line bg-white px-3.5 py-2.5 text-xs font-bold text-ink hover:bg-surface-2 cursor-pointer"
                      >
                        {phone ? 'Change' : 'Add'}
                      </button>
                    </div>
                  )}
                  <p className="mt-1 text-[11px] text-ink-3">A new number is confirmed with a code sent by SMS.</p>
                </div>
              ) : (
                <div>
                  <label htmlFor="profile-phone" className="block text-xs font-bold text-ink mb-1">
                    Phone Number (South Africa +27)
                  </label>
                  <input
                    id="profile-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={driverPhoneLocked}
                    className={`w-full rounded-input border border-line p-3 text-xs focus:border-primary focus:outline-none ${
                      driverPhoneLocked ? 'bg-[#EEEEEE] text-ink-3 cursor-not-allowed' : 'bg-surface-2 text-ink'
                    }`}
                    required={isDriver}
                  />
                  {isDriver && (
                    <p className="mt-1 text-[11px] text-ink-3">
                      {driverPhoneLocked
                        ? 'Your phone number and email address are fixed after registration. Contact ZAKA support to change them.'
                        : 'Check this number carefully: it cannot be changed after you save it.'}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-ink mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full rounded-input border border-line bg-[#EEEEEE] p-3 text-xs text-ink-3 cursor-not-allowed"
                />
              </div>

              {/* Driver's personal details: private to the driver and Admin, managed on the application page */}
              {isDriver && (
                <div className="rounded-card border border-line bg-surface-2 p-3 space-y-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-ink">
                    <Shield className="h-3.5 w-3.5 text-primary-text" />
                    Personal Details
                  </span>
                  {driverDetails ? (
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div className="col-span-2">
                        <dt className="text-[11px] text-ink-3">Home Address</dt>
                        <dd className="font-bold text-ink">{driverDetails.homeAddress || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-ink-3">Date of Birth</dt>
                        <dd className="font-bold text-ink">{(driverDetails.dateOfBirth || '').replace(/-/g, '/') || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-ink-3">Gender</dt>
                        <dd className="font-bold capitalize text-ink">{driverDetails.gender || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-ink-3">Nationality</dt>
                        <dd className="font-bold text-ink">{driverDetails.nationality || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-ink-3">ID / Passport Number</dt>
                        <dd className="font-mono font-bold text-ink">{driverDetails.idNumber ? maskIdNumber(driverDetails.idNumber) : '—'}</dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="text-xs text-ink-2">Not provided yet.</p>
                  )}
                  <p className="text-[11px] text-ink-3">
                    Only you and ZAKA Admin can see these details. Add them or update your home address under Application in the driver console.
                  </p>
                </div>
              )}

              {/* Passenger identity details: shown for reference, never editable after registration */}
              {isPassenger && passengerProfile?.dateOfBirth && (
                <div className="rounded-card border border-line bg-surface-2 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-ink">
                      <Shield className="h-3.5 w-3.5 text-primary-text" />
                      Identity Details
                    </span>
                    <span className="rounded-full bg-white border border-line px-2 py-0.5 text-[11px] font-bold uppercase text-ink-2">
                      {passengerProfile.verificationStatus === 'approved'
                        ? 'Verified'
                        : passengerProfile.verificationStatus === 'pending'
                        ? 'Under review'
                        : passengerProfile.verificationStatus === 'rejected'
                        ? 'Not approved'
                        : 'Not submitted'}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div>
                      <dt className="text-[11px] text-ink-3">Date of Birth</dt>
                      <dd className="font-bold text-ink">{passengerProfile.dateOfBirth.replace(/-/g, '/')}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-ink-3">Gender</dt>
                      <dd className="font-bold text-ink capitalize">{passengerProfile.gender || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-ink-3">Nationality</dt>
                      <dd className="font-bold text-ink">{passengerProfile.nationality || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-ink-3">ID Number</dt>
                      <dd className="font-bold text-ink">{passengerProfile.idNumber ? maskIdNumber(passengerProfile.idNumber) : '—'}</dd>
                    </div>
                  </dl>
                  <p className="text-[11px] text-ink-3">
                    Your name, date of birth, gender, nationality and ID number cannot be changed after registration.
                    Contact ZAKA support if any of them is wrong.
                  </p>
                </div>
              )}

              {/* Nothing on this form is editable for a passenger whose identity is locked */}
              {!identityLocked && (
                <button
                  type="submit"
                  disabled={saving}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-xs font-bold text-ink shadow-card hover:bg-primary-hover active:bg-primary-pressed active:scale-[0.99] transition-all"
                >
                  <Save className="h-4 w-4" />
                  <span>{saving ? 'Saving...' : 'Save Profile Details'}</span>
                </button>
              )}
            </form>
          )}

          {/* TAB 2: PASSENGER SAVED PLACES (each change is saved to the account immediately) */}
          {activeTab === 'places' && <SavedPlacesEditor />}

          {/* TAB 3: DRIVER VEHICLE DETAILS */}
          {activeTab === 'vehicle' && vehicleLocked && (
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-card border border-line bg-surface-2 p-4 text-xs">
                <div>
                  <dt className="text-[11px] text-ink-3">Make</dt>
                  <dd className="font-bold text-ink">{driverProfile?.vehicle?.make || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-ink-3">Model</dt>
                  <dd className="font-bold text-ink">{driverProfile?.vehicle?.model || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-ink-3">Colour</dt>
                  <dd className="font-bold text-ink">{driverProfile?.vehicle?.colour || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-ink-3">Licence Plate</dt>
                  <dd className="font-mono font-bold text-ink">{driverProfile?.vehicle?.registrationNumber}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-ink-3">Vehicle Class</dt>
                  <dd className="font-bold uppercase text-ink">{driverProfile?.vehicle?.vehicleType}</dd>
                </div>
              </dl>
              <p className="flex items-start gap-1.5 text-[11px] text-ink-3">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Vehicle details are fixed after registration to keep your verified vehicle record accurate. To register a different vehicle, contact ZAKA support.
              </p>
            </div>
          )}

          {activeTab === 'vehicle' && !vehicleLocked && (
            <form onSubmit={handleSaveProfile} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-ink-2 mb-1">Make</label>
                  <input
                    type="text"
                    value={vehicleMake}
                    onChange={(e) => setVehicleMake(e.target.value)}
                    placeholder="Toyota"
                    className="w-full rounded-input border border-line bg-surface-2 p-2.5 text-xs text-ink"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-ink-2 mb-1">Model</label>
                  <input
                    type="text"
                    value={vehicleModel}
                    onChange={(e) => setVehicleModel(e.target.value)}
                    placeholder="Corolla"
                    className="w-full rounded-input border border-line bg-surface-2 p-2.5 text-xs text-ink"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-ink-2 mb-1">Colour</label>
                  <input
                    type="text"
                    value={vehicleColour}
                    onChange={(e) => setVehicleColour(e.target.value)}
                    placeholder="Silver"
                    className="w-full rounded-input border border-line bg-surface-2 p-2.5 text-xs text-ink"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-ink-2 mb-1">License Plate</label>
                  <input
                    type="text"
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value)}
                    placeholder="ZK 89 GP"
                    className="w-full rounded-input border border-line bg-surface-2 p-2.5 text-xs text-ink"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-ink-2 mb-1">
                  Vehicle Category Class
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ACTIVE_VEHICLE_TYPES.map((vClass) => (
                    <button
                      key={vClass}
                      type="button"
                      onClick={() => setVehicleType(vClass)}
                      className={`rounded-full border py-2 text-xs font-bold uppercase transition-all ${
                        vehicleType === vClass
                          ? 'border-ink bg-ink text-white'
                          : 'border-line bg-surface-2 text-ink-2'
                      }`}
                    >
                      {vClass}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-xs font-bold text-ink shadow-card hover:bg-primary-hover active:bg-primary-pressed"
              >
                <Save className="h-4 w-4" />
                <span>Save Vehicle Specs</span>
              </button>
              <p className="text-[11px] text-ink-3">
                Check these details carefully: they cannot be changed after you save them.
              </p>
            </form>
          )}

          {/* TAB 4: SECURITY & AUTH */}
          {activeTab === 'security' && (
            <div className="space-y-4">
              <div className="rounded-card border border-line bg-surface-2 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-ink">
                  <KeyRound className="h-4 w-4 text-primary-text" />
                  <span>Password Reset</span>
                </div>
                <p className="text-xs text-ink-3">
                  Send a password reset link to your registered email ({email}).
                </p>
                <button
                  type="button"
                  onClick={handleSendResetPassword}
                  className="rounded-full border border-line bg-white px-4 py-2 text-xs font-bold text-ink hover:bg-surface-2"
                >
                  Send Password Reset Email
                </button>
              </div>

              <div className="rounded-card border border-red-200 bg-red-50/50 p-4 space-y-2">
                <span className="text-xs font-bold text-danger">Account Session</span>
                <p className="text-xs text-ink-2">
                  End your current authenticated session on this browser.
                </p>
                {signOutError && (
                  <div className="p-2 text-xs text-danger bg-red-100 rounded-xl font-bold">
                    {signOutError}
                  </div>
                )}
                <button
                  type="button"
                  disabled={isSigningOut}
                  onClick={async () => {
                    try {
                      setSignOutError(null);
                      await signOut();
                      onClose();
                    } catch (err: any) {
                      setSignOutError(err?.message || 'Failed to sign out. Please try again.');
                    }
                  }}
                  className="flex items-center gap-2 rounded-full bg-danger px-4 py-2.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span>{isSigningOut ? 'Signing Out of ZAKA...' : 'Sign Out of ZAKA'}</span>
                </button>
              </div>

              {/* POPIA Compliant Data Export */}
              <div className="rounded-card border border-line bg-neutral-50/40 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-ink-2" />
                  <span className="text-xs font-bold text-ink-2">Download My Data (POPIA)</span>
                </div>
                <p className="text-xs text-ink-3 leading-relaxed">
                  Download a copy of your personal data: profile, ride and location history, payments, wallet activity, ratings and notifications.
                </p>
                {exportNotice && (
                  <p className="text-xs font-bold text-ink-2">{exportNotice}</p>
                )}
                <button
                  id="btn-download-my-data"
                  type="button"
                  disabled={exporting}
                  onClick={handleExportData}
                  className="flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-3.5 py-2 text-xs font-bold text-ink-2 hover:bg-surface-2 active:scale-[0.99] transition-all disabled:opacity-50"
                >
                  {exporting ? 'Preparing your data…' : 'Download My Data'}
                </button>
              </div>

              {/* Apple App Store Guideline 5.1.1(v) Compliant Account Deletion */}
              <div className="rounded-card border border-red-200 bg-red-50/40 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-danger" />
                  <span className="text-xs font-bold text-danger">Delete Account & Data</span>
                </div>
                <p className="text-xs text-ink-2 leading-relaxed">
                  In compliance with privacy standards and App Store policies, you can permanently delete your ZAKA account. This will erase your personal profile, saved places, contact details, and device notification tokens.
                </p>

                {deleteError && (
                  <div className="flex items-start gap-2 rounded-xl bg-red-100 p-2.5 text-xs text-danger font-medium">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-danger" />
                    <span>{deleteError}</span>
                  </div>
                )}

                {!showDeleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteConfirm(true);
                      setDeleteConfirmText('');
                      setDeleteError(null);
                    }}
                    className="flex items-center gap-2 rounded-full border border-red-300 bg-white px-3.5 py-2 text-xs font-bold text-danger hover:bg-red-50 active:scale-[0.99] transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Request Account Deletion</span>
                  </button>
                ) : (
                  <div className="space-y-3 rounded-xl border border-red-300 bg-white p-3.5 ">
                    <p className="text-xs font-bold text-red-800">
                      Are you sure? This action is permanent and cannot be undone.
                    </p>
                    <p className="text-[11px] text-ink-3">
                      Type <strong>DELETE</strong> below to confirm deletion of your ZAKA account:
                    </p>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="Type DELETE"
                      className="w-full rounded-input border border-red-200 bg-red-50/50 px-3 py-2 text-xs text-ink font-bold focus:border-red-500 focus:outline-none uppercase"
                    />
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={deleteConfirmText.trim() !== 'DELETE' || deletingAccount}
                        onClick={async () => {
                          setDeletingAccount(true);
                          setDeleteError(null);
                          try {
                            await deleteAccount();
                            onClose();
                          } catch (err: any) {
                            setDeleteError(err.message || 'Failed to delete account. Please try again.');
                          } finally {
                            setDeletingAccount(false);
                          }
                        }}
                        className="flex-1 rounded-full bg-danger py-2.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-40 active:scale-[0.99] transition-all"
                      >
                        {deletingAccount ? 'Deleting Account...' : 'Permanently Delete My Account'}
                      </button>
                      <button
                        type="button"
                        disabled={deletingAccount}
                        onClick={() => {
                          setShowDeleteConfirm(false);
                          setDeleteConfirmText('');
                          setDeleteError(null);
                        }}
                        className="rounded-full border border-line px-3 py-2.5 text-xs font-bold text-ink-2 hover:bg-surface-2"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
