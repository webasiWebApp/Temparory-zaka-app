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
} from 'lucide-react';
import { VehicleType } from '../../types';
import { isRiderTarget } from '../../config/appTarget';
import { apiFetch } from '../../services/apiClient';
import { validatePhoneNumber as validateZakaPhone, formatPhoneDisplay, normalizePhoneNumber } from '../../utils/phoneUtils';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
];

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose }) => {
  const {
    userProfile,
    passengerProfile,
    driverProfile,
    activeRole,
    updateUserProfileData,
    updatePassengerProfileData,
    updateDriverProfileData,
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
  const [photoURL, setPhotoURL] = useState(userProfile?.photoURL || AVATAR_PRESETS[0]);

  // Driver Vehicle form states
  const [vehicleMake, setVehicleMake] = useState(driverProfile?.vehicle?.make || '');
  const [vehicleModel, setVehicleModel] = useState(driverProfile?.vehicle?.model || '');
  const [vehicleColour, setVehicleColour] = useState(driverProfile?.vehicle?.colour || '');
  const [vehiclePlate, setVehiclePlate] = useState(driverProfile?.vehicle?.registrationNumber || '');
  const [vehicleType, setVehicleType] = useState<VehicleType>(driverProfile?.vehicle?.vehicleType || 'economy');

  // Passenger Saved Places
  const [savedPlaces, setSavedPlaces] = useState(passengerProfile?.savedPlaces || []);
  const [newPlaceLabel, setNewPlaceLabel] = useState('');
  const [newPlaceAddress, setNewPlaceAddress] = useState('');

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
    setPhotoURL(userProfile?.photoURL || AVATAR_PRESETS[0]);
    setSavedPlaces(passengerProfile?.savedPlaces || []);
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

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Phone validation
    const phoneCheck = validateZakaPhone(phone);
    if (!phoneCheck.valid) {
      setError(phoneCheck.error || 'Please enter a valid South African mobile number (e.g. 082 123 4567).');
      return;
    }
    // Stored once, in canonical form (+27821234567), on every profile document
    const trimmedPhone = phoneCheck.normalized;

    // Name validation
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError('Please enter a valid name (at least 2 characters).');
      return;
    }

    setSaving(true);
    try {
      await updateUserProfileData({
        name: trimmedName,
        phone: trimmedPhone,
        photoURL,
      });

      if (activeRole === 'passenger') {
        await updatePassengerProfileData({
          name: trimmedName,
          phone: trimmedPhone,
          savedPlaces,
        });
      } else if (activeRole === 'driver') {
        await updateDriverProfileData({
          name: trimmedName,
          phone: trimmedPhone,
          photoURL,
          vehicle: {
            driverId: userProfile?.uid || '',
            make: vehicleMake,
            model: vehicleModel,
            colour: vehicleColour,
            registrationNumber: vehiclePlate,
            vehicleType,
            passengerCapacity: vehicleType === 'xl' ? 6 : vehicleType === 'moto' ? 1 : 4,
            // Vehicle approval is decided by ZAKA Admin, never by the driver's own profile form
            status: driverProfile?.vehicle?.status || 'pending',
          },
        });
      }

      setPhone(formatPhoneDisplay(trimmedPhone));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save changes');
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

  const handleAddPlace = () => {
    if (!newPlaceLabel || !newPlaceAddress) return;
    const newPlace = {
      id: `sp-${Date.now()}`,
      label: newPlaceLabel,
      address: newPlaceAddress,
      location: { latitude: -26.1458, longitude: 28.0416 },
      icon: 'favorite' as const,
    };
    setSavedPlaces([...savedPlaces, newPlace]);
    setNewPlaceLabel('');
    setNewPlaceAddress('');
  };

  const handleDeletePlace = (id: string) => {
    setSavedPlaces(savedPlaces.filter((p) => p.id !== id));
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
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-[20px] border border-line bg-white shadow-modal overflow-hidden cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line p-5">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src={photoURL || AVATAR_PRESETS[0]}
                alt={name || 'User'}
                className="h-11 w-11 rounded-card object-cover border border-line "
              />
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-ink">
                ✓
              </span>
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
              {/* Avatar Selector */}
              <div>
                <label className="block text-xs font-bold text-ink mb-2">
                  Choose Profile Photo
                </label>
                <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                  {AVATAR_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPhotoURL(preset)}
                      className={`relative h-12 w-12 shrink-0 rounded-full overflow-hidden border-2 transition-all ${
                        photoURL === preset ? 'border-primary scale-105 shadow-card' : 'border-line opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={preset} alt="avatar option" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-input border border-line bg-surface-2 p-3 text-xs text-ink focus:border-primary focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  Phone Number (South Africa +27)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-input border border-line bg-surface-2 p-3 text-xs text-ink focus:border-primary focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full rounded-input border border-line bg-[#EEEEEE] p-3 text-xs text-ink-3 cursor-not-allowed"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-xs font-bold text-ink shadow-card hover:bg-primary-hover active:bg-primary-pressed active:scale-[0.99] transition-all"
              >
                <Save className="h-4 w-4" />
                <span>{saving ? 'Saving...' : 'Save Profile Details'}</span>
              </button>
            </form>
          )}

          {/* TAB 2: PASSENGER SAVED PLACES */}
          {activeTab === 'places' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <span className="text-xs font-bold text-ink">Saved Favorite Locations</span>
                {savedPlaces.map((place) => (
                  <div
                    key={place.id}
                    className="flex items-center justify-between rounded-card border border-line bg-surface-2 p-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-200 text-ink">
                        <MapPin className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-ink">{place.label}</p>
                        <p className="text-[11px] text-ink-3 truncate max-w-[240px]">
                          {place.address}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeletePlace(place.id)}
                      className="rounded-full p-1.5 text-neutral-400 hover:bg-red-50 hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add New Place */}
              <div className="rounded-card border border-line p-3 space-y-2 bg-white">
                <span className="text-xs font-bold text-ink">Add New Place</span>
                <input
                  type="text"
                  placeholder="Label (e.g. Gym, University, Parent's Home)"
                  value={newPlaceLabel}
                  onChange={(e) => setNewPlaceLabel(e.target.value)}
                  className="w-full rounded-input border border-line bg-surface-2 p-2.5 text-xs text-ink"
                />
                <input
                  type="text"
                  placeholder="Address (e.g. 100 Main St, Johannesburg)"
                  value={newPlaceAddress}
                  onChange={(e) => setNewPlaceAddress(e.target.value)}
                  className="w-full rounded-input border border-line bg-surface-2 p-2.5 text-xs text-ink"
                />
                <button
                  type="button"
                  onClick={handleAddPlace}
                  className="flex w-full items-center justify-center gap-1.5 rounded-full bg-ink py-2.5 text-xs font-bold text-white hover:bg-ink"
                >
                  <Plus className="h-3.5 w-3.5 text-primary-text" />
                  <span>Add to Saved Places</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-xs font-bold text-ink"
              >
                <Save className="h-4 w-4" />
                <span>Save Places</span>
              </button>
            </div>
          )}

          {/* TAB 3: DRIVER VEHICLE DETAILS */}
          {activeTab === 'vehicle' && (
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
                  {(['economy', 'comfort', 'xl', 'moto'] as VehicleType[]).map((vClass) => (
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
