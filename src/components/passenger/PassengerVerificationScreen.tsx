/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Passenger Identity Verification
 * A passenger confirms their phone number, supplies their identity details, uploads a photo of their
 * ID document and takes a live photo. ZAKA Admin approves the submission before they can book rides.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { firestoreService } from '../../firebase/firestoreService';
import { PhoneOtpVerifier } from '../auth/PhoneOtpVerifier';
import { compressImageToDataUrl, captureVideoFrame, validateImageFile } from '../../utils/imageUtils';
import { formatPhoneDisplay, normalizePhoneNumber } from '../../utils/phoneUtils';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  IdCard,
  RefreshCw,
  ShieldCheck,
  Upload,
  User,
} from 'lucide-react';

const NATIONALITIES = [
  'South African', 'Zimbabwean', 'Mozambican', 'Basotho', 'Swazi', 'Motswana', 'Namibian', 'Malawian',
  'Zambian', 'Angolan', 'Congolese', 'Nigerian', 'Ghanaian', 'Kenyan', 'Tanzanian', 'Ugandan',
  'Ethiopian', 'Somali', 'Rwandan', 'Burundian', 'Cameroonian', 'Egyptian', 'Moroccan', 'Indian',
  'Pakistani', 'Bangladeshi', 'Chinese', 'British', 'German', 'French', 'Portuguese', 'Dutch',
  'American', 'Canadian', 'Brazilian', 'Australian',
];

/** Accepts YYYY/MM/DD (also - or . separators) and returns YYYY-MM-DD, or '' when it is not a real date */
function parseDateOfBirth(input: string): string {
  const m = input.trim().match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (!m) return '';
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  const now = new Date();
  if (date.getTime() > now.getTime() || year < now.getFullYear() - 120) return '';
  return `${m[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Types the slashes for the user: 19900521 -> 1990/05/21 */
function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}/${digits.slice(4)}`;
  return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6)}`;
}

/** South African ID number: 13 digits with a valid check digit, starting with the date of birth (YYMMDD) */
function validateSouthAfricanId(idNumber: string, dateOfBirth: string): string | null {
  if (!/^\d{13}$/.test(idNumber)) return 'A South African ID number has 13 digits.';
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let digit = Number(idNumber[12 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  if (sum % 10 !== 0) return 'This ID number is not valid. Please check it and try again.';
  if (dateOfBirth && idNumber.slice(0, 6) !== dateOfBirth.replace(/-/g, '').slice(2)) {
    return 'This ID number does not match your date of birth.';
  }
  return null;
}

/** Live camera capture: the photo must be taken now, it cannot be picked from the gallery */
const LiveSelfieCapture: React.FC<{
  value: string;
  onCapture: (dataUrl: string) => void;
  onError: (message: string) => void;
}> = ({ value, onCapture, onError }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [useFallback, setUseFallback] = useState(false);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  useEffect(() => stopCamera, []);

  // The <video> only exists once cameraOn is true, so the stream is attached after that render
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOn]);

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setUseFallback(true);
      fallbackInputRef.current?.click();
      return;
    }
    setStarting(true);
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      setCameraOn(true);
    } catch (err: any) {
      // No in-page camera access: the device camera app is used instead (still a fresh photo)
      setUseFallback(true);
      onError(
        err?.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow camera access for ZAKA, or use the button below to open your camera.'
          : 'We could not start the camera here. Use the button below to open your camera.'
      );
    } finally {
      setStarting(false);
    }
  };

  const takePhoto = () => {
    if (!videoRef.current) return;
    try {
      onCapture(captureVideoFrame(videoRef.current));
      stopCamera();
    } catch (err: any) {
      onError(err?.message || 'We could not take the photo. Please try again.');
    }
  };

  const handleFallbackFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) {
      onError(problem);
      return;
    }
    try {
      onCapture(await compressImageToDataUrl(file, 1000));
    } catch (err: any) {
      onError(err?.message || 'We could not read the photo. Please try again.');
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-card border border-line bg-surface-2">
        {cameraOn ? (
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover -scale-x-100" />
        ) : value ? (
          <img src={value} alt="Your live photo" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 p-4 text-center text-ink-3">
            <Camera className="h-8 w-8" />
            <p className="text-xs font-medium">Face the camera in good light, without a hat or sunglasses.</p>
          </div>
        )}
      </div>

      {cameraOn ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={stopCamera}
            className="rounded-full border border-line px-4 py-2.5 text-xs font-bold text-ink-2 hover:bg-surface-2 cursor-pointer"
          >
            Cancel
          </button>
          <button
            id="btn-take-live-photo"
            type="button"
            onClick={takePhoto}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-ink py-2.5 text-xs font-bold text-white hover:bg-black cursor-pointer"
          >
            <Camera className="h-4 w-4" />
            Take Photo
          </button>
        </div>
      ) : (
        <button
          id="btn-start-live-photo"
          type="button"
          disabled={starting}
          onClick={useFallback ? () => fallbackInputRef.current?.click() : startCamera}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-line bg-white py-2.5 text-xs font-bold text-ink hover:bg-surface-2 disabled:opacity-50 cursor-pointer"
        >
          <Camera className="h-4 w-4" />
          {starting ? 'Starting camera…' : value ? 'Retake Live Photo' : 'Open Camera'}
        </button>
      )}

      {/* capture="user" opens the front camera directly on phones instead of the photo gallery */}
      <input
        ref={fallbackInputRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={handleFallbackFile}
        className="hidden"
      />
    </div>
  );
};

export const PassengerVerificationScreen: React.FC = () => {
  const {
    userProfile,
    passengerProfile,
    confirmVerifiedPhone,
    updateUserProfileData,
    refreshProfiles,
  } = useAuth();

  const status = passengerProfile?.verificationStatus || 'unverified';
  const phoneVerified = Boolean(passengerProfile?.phoneVerified && passengerProfile.phone);

  const [name, setName] = useState('');
  const [dobInput, setDobInput] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [nationality, setNationality] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [idPhoto, setIdPhoto] = useState('');
  const [idPhotoName, setIdPhotoName] = useState('');
  const [selfie, setSelfie] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const idInputRef = useRef<HTMLInputElement | null>(null);

  // Start from what the account already holds (also pre-fills a re-submission after a rejection)
  useEffect(() => {
    if (!passengerProfile) return;
    const startingName = userProfile?.name || passengerProfile.name || '';
    setName(/^ZAKA (User|Member)$/.test(startingName) ? '' : startingName);
    setDobInput((passengerProfile.dateOfBirth || '').replace(/-/g, '/'));
    setGender(passengerProfile.gender || '');
    setNationality(passengerProfile.nationality || '');
    setIdNumber(passengerProfile.idNumber || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passengerProfile?.userId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshProfiles();
    } finally {
      setRefreshing(false);
    }
  };

  const handleIdPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      setIdPhoto(await compressImageToDataUrl(file));
      setIdPhotoName(file.name || 'id-document.jpg');
    } catch (err: any) {
      setError(err?.message || 'We could not read this image. Please choose another one.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile?.uid) return;
    setError('');

    const cleanName = name.trim().replace(/\s+/g, ' ');
    if (cleanName.split(' ').length < 2 || cleanName.length < 4) {
      setError('Please enter your name and surname exactly as they appear on your ID document.');
      return;
    }
    const dateOfBirth = parseDateOfBirth(dobInput);
    if (!dateOfBirth) {
      setError('Please enter your date of birth as YYYY/MM/DD, for example 1990/05/21.');
      return;
    }
    if (!gender) {
      setError('Please select your gender.');
      return;
    }
    const cleanNationality = nationality.trim();
    if (cleanNationality.length < 3) {
      setError('Please enter your nationality.');
      return;
    }
    const cleanId = idNumber.trim().replace(/\s+/g, '').toUpperCase();
    if (/^south african$/i.test(cleanNationality)) {
      const idProblem = validateSouthAfricanId(cleanId, dateOfBirth);
      if (idProblem) {
        setError(idProblem);
        return;
      }
    } else if (!/^[A-Z0-9]{5,20}$/.test(cleanId)) {
      setError('Please enter your passport or ID number (letters and digits only).');
      return;
    }
    if (!idPhoto) {
      setError('Please upload a photo of your ID document.');
      return;
    }
    if (!selfie) {
      setError('Please take a live photo of yourself.');
      return;
    }

    setSubmitting(true);
    try {
      if (cleanName !== userProfile.name) {
        await updateUserProfileData({ name: cleanName });
      }
      await firestoreService.savePassengerVerificationImage(userProfile.uid, 'idDocument', idPhoto, idPhotoName);
      await firestoreService.savePassengerVerificationImage(userProfile.uid, 'selfie', selfie, 'live-photo.jpg');
      await firestoreService.submitPassengerVerification(userProfile.uid, {
        name: cleanName,
        dateOfBirth,
        gender,
        nationality: cleanNationality,
        idNumber: cleanId,
        idDocumentFileName: idPhotoName,
        selfieFileName: 'live-photo.jpg',
      });
      await refreshProfiles();
    } catch (err: any) {
      console.error('Passenger verification submission failed:', err);
      const msg = String(err?.message || '');
      setError(
        msg && !msg.startsWith('{') && !/permission/i.test(msg)
          ? msg
          : 'We could not submit your details. Please check your connection and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="flex-1 w-full overflow-y-auto bg-surface-2">
      <div className="mx-auto w-full max-w-lg p-4 sm:p-6 pb-16 space-y-4">{children}</div>
    </div>
  );

  // The passenger profile could not be loaded (e.g. offline): nothing can be shown or submitted yet
  if (!passengerProfile) {
    return shell(
      <div className="rounded-card border border-line bg-white p-6 text-center space-y-3">
        <AlertTriangle className="mx-auto h-8 w-8 text-warning" />
        <h2 className="text-base font-bold text-ink">We could not load your profile</h2>
        <p className="text-xs text-ink-2">Please check your internet connection and try again.</p>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Try Again
        </button>
      </div>
    );
  }

  if (status === 'pending') {
    return shell(
      <div id="passenger-verification-pending" className="rounded-card border border-line bg-white p-6 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-text">
          <Clock className="h-6 w-6" />
        </div>
        <h2 className="text-base font-bold text-ink">Your details are being reviewed</h2>
        <p className="text-xs text-ink-2 leading-relaxed">
          Thank you, {userProfile?.name?.split(' ')[0] || 'there'}. The ZAKA team is checking your ID document and live
          photo. You will be able to request rides as soon as your identity is approved, and we will notify you here.
        </p>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-5 py-2.5 text-xs font-bold text-ink hover:bg-surface-2 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Check Status
        </button>
      </div>
    );
  }

  return shell(
    <>
      <div className="space-y-1">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-bold text-primary-text">
          <ShieldCheck className="h-3.5 w-3.5" />
          Identity Verification
        </div>
        <h1 className="text-xl font-bold tracking-tight text-ink">Verify your identity to start riding</h1>
        <p className="text-xs text-ink-2">
          For everyone&apos;s safety, ZAKA verifies every passenger before their first ride. This takes a few minutes.
        </p>
      </div>

      {status === 'rejected' && (
        <div role="alert" className="rounded-card border border-red-200 bg-red-50 p-3.5 text-xs text-danger space-y-1">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Your previous submission was not approved</span>
          </div>
          <p className="font-medium">
            {passengerProfile.rejectionReason || 'Please check your details and photos, then submit again.'}
          </p>
        </div>
      )}

      {/* STEP 1: PHONE NUMBER */}
      <section className="rounded-card border border-line bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">1. Confirm your mobile number</h2>
          {phoneVerified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
              <CheckCircle2 className="h-3 w-3" />
              Verified
            </span>
          )}
        </div>
        {phoneVerified ? (
          <p className="text-xs font-bold text-ink">{formatPhoneDisplay(normalizePhoneNumber(passengerProfile.phone))}</p>
        ) : (
          <PhoneOtpVerifier
            initialPhone={userProfile?.phone ? formatPhoneDisplay(normalizePhoneNumber(userProfile.phone)) : ''}
            onVerified={confirmVerifiedPhone}
          />
        )}
      </section>

      {/* STEPS 2 & 3: IDENTITY DETAILS AND PHOTOS (available once the phone number is confirmed) */}
      <form
        onSubmit={handleSubmit}
        className={`space-y-4 ${phoneVerified ? '' : 'pointer-events-none opacity-50'}`}
        aria-disabled={!phoneVerified}
      >
        <section className="rounded-card border border-line bg-white p-4 space-y-3">
          <div>
            <h2 className="text-sm font-bold text-ink">2. Your details</h2>
            <p className="text-[11px] text-ink-3">
              Enter these exactly as on your ID document. They cannot be changed after you submit.
            </p>
          </div>

          <div>
            <label htmlFor="verify-name" className="block text-xs font-bold text-ink mb-1">Name and Surname</label>
            <div className="relative">
              <User className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
              <input
                id="verify-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Tendai Mthembu"
                className="w-full rounded-input border border-line bg-surface-2 py-2.5 pl-9 pr-3 text-xs text-ink focus:border-primary focus:outline-none"
                disabled={!phoneVerified}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="verify-dob" className="block text-xs font-bold text-ink mb-1">Date of Birth (YYYY/MM/DD)</label>
              <input
                id="verify-dob"
                type="text"
                inputMode="numeric"
                autoComplete="bday"
                value={dobInput}
                onChange={(e) => setDobInput(formatDateInput(e.target.value))}
                placeholder="1990/05/21"
                maxLength={10}
                className="w-full rounded-input border border-line bg-surface-2 p-2.5 text-xs text-ink focus:border-primary focus:outline-none"
                disabled={!phoneVerified}
              />
            </div>
            <div>
              <span className="block text-xs font-bold text-ink mb-1">Gender</span>
              <div className="grid grid-cols-2 gap-2">
                {(['male', 'female'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={gender === g}
                    onClick={() => setGender(g)}
                    disabled={!phoneVerified}
                    className={`rounded-full border py-2.5 text-xs font-bold capitalize transition-all cursor-pointer ${
                      gender === g ? 'border-ink bg-ink text-white' : 'border-line bg-surface-2 text-ink-2'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="verify-nationality" className="block text-xs font-bold text-ink mb-1">Nationality</label>
              <input
                id="verify-nationality"
                type="text"
                list="verify-nationality-options"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                placeholder="e.g. South African"
                className="w-full rounded-input border border-line bg-surface-2 p-2.5 text-xs text-ink focus:border-primary focus:outline-none"
                disabled={!phoneVerified}
              />
              <datalist id="verify-nationality-options">
                {NATIONALITIES.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <div>
              <label htmlFor="verify-id-number" className="block text-xs font-bold text-ink mb-1">ID / Passport Number</label>
              <input
                id="verify-id-number"
                type="text"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder="13-digit ID or passport number"
                maxLength={24}
                className="w-full rounded-input border border-line bg-surface-2 p-2.5 text-xs text-ink focus:border-primary focus:outline-none"
                disabled={!phoneVerified}
              />
            </div>
          </div>
        </section>

        <section className="rounded-card border border-line bg-white p-4 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-ink">3. Your ID document and a live photo</h2>
            <p className="text-[11px] text-ink-3">
              These photos are private: only you and the ZAKA verification team can see them.
            </p>
          </div>

          <div className="space-y-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-ink">
              <IdCard className="h-4 w-4 text-primary-text" />
              Photo of your ID document
            </span>
            {idPhoto && (
              <img
                src={idPhoto}
                alt="Your ID document"
                className="max-h-56 w-full rounded-card border border-line bg-surface-2 object-contain"
              />
            )}
            <button
              id="btn-upload-id-document"
              type="button"
              onClick={() => idInputRef.current?.click()}
              disabled={!phoneVerified}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-line bg-white py-2.5 text-xs font-bold text-ink hover:bg-surface-2 cursor-pointer"
            >
              <Upload className="h-4 w-4" />
              {idPhoto ? 'Replace ID Photo' : 'Upload ID Photo'}
            </button>
            <input
              ref={idInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleIdPhoto}
              className="hidden"
            />
            <p className="text-[11px] text-ink-3">
              Smart ID card, green ID book or passport photo page. All four corners must be visible and the text readable.
            </p>
          </div>

          <div className="space-y-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-ink">
              <Camera className="h-4 w-4 text-primary-text" />
              Live photo of you
            </span>
            {phoneVerified && <LiveSelfieCapture value={selfie} onCapture={(d) => { setSelfie(d); setError(''); }} onError={setError} />}
          </div>
        </section>

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-card border border-red-200 bg-red-50 p-3 text-xs font-bold text-danger">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          id="btn-submit-passenger-verification"
          type="submit"
          disabled={submitting || !phoneVerified}
          className="w-full rounded-full bg-primary py-3.5 text-sm font-bold text-on-primary hover:bg-primary-hover active:bg-primary-pressed disabled:opacity-50 cursor-pointer"
        >
          {submitting ? 'Submitting…' : 'Submit for Verification'}
        </button>
      </form>
    </>
  );
};
