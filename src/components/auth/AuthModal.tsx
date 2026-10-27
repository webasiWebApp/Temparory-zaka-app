/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Comprehensive Firebase Authentication & Registration
 * Visuals: Yellow #FFC107 brand primary, white cards, subtle borders, dark typography
 */

import React, { useState } from 'react';
import { useAuth, NO_ZAKA_ACCOUNT } from '../../context/AuthContext';
import { UserRole, VehicleType, ACTIVE_VEHICLE_TYPES } from '../../types';
import { imageToAvatarDataUrl, validateImageFile } from '../../utils/imageUtils';
import { isRiderTarget, BYPASS_PASSENGER_VERIFICATION } from '../../config/appTarget';
import { validatePhoneNumber, formatPhoneDisplay, filterSaPhoneInput } from '../../utils/phoneUtils';
import { firestoreService } from '../../firebase/firestoreService';
import type { VerifiedPhone } from '../../services/phoneVerificationService';
import { PhoneOtpVerifier } from './PhoneOtpVerifier';
import {
  X,
  User,
  Car,
  Shield,
  Sparkles,
  ArrowRight,
  Mail,
  Lock,
  Phone,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  Info,
  ShieldCheck,
  Camera,
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup' | 'forgot';
  initialRole?: UserRole;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'signin',
  initialRole = 'passenger',
}) => {
  const {
    signIn,
    signUp,
    registerPassengerAccount,
    provisionPassengerProfile,
    signInWithGoogle,
    resetPassword,
  } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(initialMode);
  const [signupStep, setSignupStep] = useState<'role' | 'details'>(isRiderTarget ? 'details' : 'role');
  const [role, setRole] = useState<UserRole>(isRiderTarget ? 'passenger' : initialRole);

  // Input fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  // Passenger sign-up: the number confirmed by SMS code (required before the account is created)
  const [verifiedPhone, setVerifiedPhone] = useState<VerifiedPhone | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Driver vehicle specs
  const [vehicleMake, setVehicleMake] = useState('Toyota');
  const [vehicleModel, setVehicleModel] = useState('Corolla Quest');
  const [vehicleColour, setVehicleColour] = useState('Silver');
  const [vehiclePlate, setVehiclePlate] = useState('ZK 89 GP');
  const [vehicleType, setVehicleType] = useState<VehicleType>('economy');

  // Driver's own profile photo (optional at registration, shown to passengers once approved)
  const [driverPhoto, setDriverPhoto] = useState('');
  const driverPhotoInputRef = React.useRef<HTMLInputElement | null>(null);
  // Shown when a Google sign-in found no ZAKA account: the user picks Passenger or Driver first
  const [googleNotice, setGoogleNotice] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isProfilePending, setIsProfilePending] = useState(false);
  const [createdAuthUser, setCreatedAuthUser] = useState<any>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  // Quick Password Reset State
  const [quickResetLoading, setQuickResetLoading] = useState(false);
  const [quickResetSuccess, setQuickResetSuccess] = useState(false);
  const [quickResetEmail, setQuickResetEmail] = useState('');

  const handleQuickPasswordReset = async (targetEmail?: string) => {
    const emailToUse = (targetEmail || email || '').trim().toLowerCase();
    if (!emailToUse || !emailToUse.includes('@')) {
      setError('Please enter a valid email address to receive a password reset link.');
      return;
    }
    setQuickResetLoading(true);
    try {
      await resetPassword(emailToUse);
      setQuickResetSuccess(true);
      setQuickResetEmail(emailToUse);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Unable to send password reset email. Please try again.');
    } finally {
      setQuickResetLoading(false);
    }
  };

  React.useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      const chosenRole = isRiderTarget ? 'passenger' : (initialRole || 'passenger');
      setRole(chosenRole);
      if (initialRole === 'driver') {
        setSignupStep('details');
      } else if (initialMode === 'signup' && !isRiderTarget && !initialRole) {
        setSignupStep('role');
      } else {
        setSignupStep('details');
      }
      setError('');
      setIsProfilePending(false);
      setCreatedAuthUser(null);
      setQuickResetSuccess(false);
      setGoogleNotice('');
    }
  }, [isOpen, initialMode, initialRole]);

  if (!isOpen) return null;

  // Signing in never creates an account: only the registration screen, where the user has chosen
  // Passenger or Driver, passes a role. A Google account with no ZAKA profile is sent there to choose.
  const handleGoogleSignIn = async (selectedRole?: UserRole) => {
    setError('');
    setGoogleNotice('');
    setLoading(true);
    try {
      await signInWithGoogle(mode === 'signup' ? selectedRole : undefined);
      onClose();
    } catch (err: any) {
      if (err?.code === NO_ZAKA_ACCOUNT) {
        setMode('signup');
        setSignupStep('role');
        setGoogleNotice(err.message);
      } else if (err.message !== 'Sign-in cancelled.') {
        setError(err.message || 'Google sign-in was unsuccessful.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDriverPhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    try {
      setDriverPhoto(await imageToAvatarDataUrl(file));
      setError('');
    } catch (err: any) {
      setError(err?.message || 'We could not read this image. Please choose another one.');
    }
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setQuickResetSuccess(false);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);

    try {
      await signIn(cleanEmail, password);
      onClose();
    } catch (err: any) {
      console.warn('[ZAKA Login Modal] Sign-in notice:', err?.message || err);
      setError(err.message || 'Unable to sign in. Please check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();

    if (!cleanName) {
      setError('Please enter your full name.');
      return;
    }

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    if (role === 'passenger' && !BYPASS_PASSENGER_VERIFICATION && !verifiedPhone) {
      setError('Please verify your phone number with the SMS code we send you.');
      return;
    }

    if (!cleanPhone) {
      setError('Please enter your phone number.');
      return;
    }

    if (password.length < 6) {
      setError('Password must contain at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please ensure both passwords are identical.');
      return;
    }

    setLoading(true);
    try {
      if (role === 'passenger') {
        await signUp({
          email: cleanEmail,
          pass: password,
          name: cleanName,
          phone: verifiedPhone?.phone ?? cleanPhone,
          role: 'passenger',
          phoneVerificationToken: verifiedPhone?.verificationToken,
        });
        setName('');
        setEmail('');
        setPhone('');
        setVerifiedPhone(null);
        setPassword('');
        setConfirmPassword('');
        setError('');
        setIsProfilePending(false);
        setCreatedAuthUser(null);
        onClose();
      } else {
        await signUp({
          email: cleanEmail,
          pass: password,
          name: cleanName,
          phone: cleanPhone,
          role,
          photoURL: driverPhoto || undefined,
          vehicle: {
            vehicleType,
            make: vehicleMake,
            model: vehicleModel,
            colour: vehicleColour,
            registrationNumber: vehiclePlate,
            passengerCapacity: vehicleType === 'xl' ? 6 : 4,
            status: 'pending',
          },
        });
        setDriverPhoto('');
        setName('');
        setEmail('');
        setPhone('');
        setPassword('');
        setConfirmPassword('');
        setError('');
        setIsProfilePending(false);
        setCreatedAuthUser(null);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      await resetPassword(email);
      setResetSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92dvh] w-full max-w-md flex-col rounded-[20px] border border-line bg-white shadow-modal overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-line p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-bold text-ink text-base shadow-card">
              Z
            </div>
            <div>
              <h3 className="text-base font-bold text-ink">
                {mode === 'signin' && 'Sign In to ZAKA'}
                {mode === 'signup' && 'Create Your ZAKA Account'}
                {mode === 'forgot' && 'Reset Your Password'}
              </h3>
              <p className="text-[11px] text-ink-3 font-medium">
                Official Firebase Authentication & Firestore DB
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-neutral-400 hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Quick Password Reset Success Banner */}
          {quickResetSuccess && (
            <div className="rounded-card bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-800 space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                <span>Password Reset Link Dispatched!</span>
              </div>
              <p className="text-[11px] text-success leading-relaxed font-medium">
                We sent a password reset email to <strong>{quickResetEmail}</strong>. Please check your inbox or spam folder, click the link to set or update your password, then sign in below.
              </p>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="rounded-card bg-red-50 border border-red-200 p-3.5 text-xs text-danger space-y-2.5">
              <div className="flex items-start gap-2.5 font-bold">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-danger" />
                <span className="leading-snug">{error}</span>
              </div>

              {/* Action 1: If account already exists / already registered */}
              {(error.includes('already exists') || error.includes('already registered')) && (
                <div className="pt-2 border-t border-red-200/80 space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setMode('signin');
                    }}
                    className="w-full flex items-center justify-center gap-1.5 rounded-full bg-white border border-red-200 py-2.5 text-xs font-bold text-ink hover:bg-surface-2 active:scale-[0.99] transition-all cursor-pointer"
                  >
                    <span>Sign In to Existing Account</span>
                    <ArrowRight className="h-3.5 w-3.5 text-primary-text" />
                  </button>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleGoogleSignIn(role)}
                      className="flex items-center justify-center gap-1.5 rounded-full bg-white border border-red-200 py-2 text-xs font-bold text-ink hover:bg-surface-2 active:scale-[0.99] transition-all cursor-pointer"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                      <span>Continue with Google</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickPasswordReset(email)}
                      disabled={quickResetLoading}
                      className="flex items-center justify-center gap-1.5 rounded-full bg-white border border-red-200 py-2 text-xs font-bold text-ink hover:bg-surface-2 active:scale-[0.99] transition-all cursor-pointer"
                    >
                      <KeyRound className="h-3.5 w-3.5 text-primary-text" />
                      <span>{quickResetLoading ? 'Sending...' : 'Reset Password'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Action 2: If sign in failed due to invalid credentials or user not found */}
              {(error.includes('Unable to sign in') || error.includes('invalid') || error.includes('password')) && !error.includes('already') && (
                <div className="pt-2 border-t border-red-200/80 space-y-2">
                  <p className="text-[11px] text-ink-2 font-medium">
                    If this account was registered with Google, you can sign in with Google or set a password using the link below:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleQuickPasswordReset(email)}
                      disabled={quickResetLoading}
                      className="flex items-center justify-center gap-1.5 rounded-full bg-white border border-red-200 py-2 text-xs font-bold text-ink hover:bg-surface-2 active:scale-[0.99] transition-all cursor-pointer"
                    >
                      <KeyRound className="h-3.5 w-3.5 text-primary-text" />
                      <span>{quickResetLoading ? 'Sending link...' : 'Send Reset / Set Link'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGoogleSignIn(role)}
                      className="flex items-center justify-center gap-1.5 rounded-full bg-white border border-red-200 py-2 text-xs font-bold text-ink hover:bg-surface-2 active:scale-[0.99] transition-all cursor-pointer"
                    >
                      <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                      <span>Continue with Google</span>
                    </button>
                  </div>
                </div>
              )}

              {error.includes('Email/Password provider requires activation') && (
                <div className="pt-2 border-t border-red-200/80 space-y-2">
                  <p className="text-[11px] text-red-800 leading-relaxed font-medium">
                    <strong>Notice:</strong> Email/Password provider requires activation in the Firebase Console. You can continue using Google Sign-In:
                  </p>
                  <button
                    type="button"
                    onClick={() => handleGoogleSignIn(role)}
                    className="w-full mt-1.5 flex items-center justify-center gap-2 rounded-full bg-white border border-red-200 py-2 text-xs font-bold text-ink hover:bg-surface-2"
                  >
                    <span>Continue with Google as {role === 'driver' ? 'Driver' : 'Passenger'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ================= MODE 1: SIGN IN ================= */}
          {mode === 'signin' && (
            <>
              {/* Google Sign In Option */}
              <button
                type="button"
                onClick={() => handleGoogleSignIn(role)}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2.5 rounded-full border border-line bg-white py-3 text-xs font-bold text-ink hover:bg-surface-2 active:scale-[0.99] transition-all "
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>

              <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-line" />
                </div>
                <span className="relative bg-white px-3 text-[11px] font-bold uppercase text-neutral-400">
                  Or Sign In with Email
                </span>
              </div>

              <form onSubmit={handleSignInSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="w-full rounded-input border border-line bg-surface-2 py-2.5 pl-9 pr-3 text-xs text-ink focus:border-primary focus:outline-none"
                      required
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck="false"
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-ink">Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setMode('forgot');
                      }}
                      className="text-[11px] font-bold text-ink hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-input border border-line bg-surface-2 py-2.5 pl-9 pr-10 text-xs text-ink focus:border-primary focus:outline-none"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-neutral-400 hover:text-ink"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-primary py-3.5 text-xs font-bold text-ink shadow-card hover:bg-primary-hover active:bg-primary-pressed active:scale-[0.99] transition-all"
                >
                  {loading ? 'Authenticating...' : 'Sign In to ZAKA'}
                </button>
              </form>

              <div className="text-center text-xs text-ink-3 pt-1">
                Don't have a ZAKA account yet?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setMode('signup');
                    setSignupStep('role');
                  }}
                  className="font-bold text-ink underline"
                >
                  Register Now
                </button>
              </div>
            </>
          )}

          {/* ================= MODE 2: SIGN UP FLOW ================= */}
          {mode === 'signup' && (
            <>
              {/* Step 1: "How will you use ZAKA?" Role Selection */}
              {signupStep === 'role' && (
                <div className="space-y-4">
                  {googleNotice && (
                    <div role="status" className="flex items-start gap-2 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
                      <Info className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{googleNotice}</span>
                    </div>
                  )}
                  <div className="text-center space-y-1">
                    <h4 className="text-sm font-bold text-ink">How will you use ZAKA?</h4>
                    <p className="text-xs text-ink-3">
                      Select your account type to proceed with customized onboarding.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {/* Passenger Option */}
                    <div
                      onClick={() => setRole('passenger')}
                      className={`cursor-pointer rounded-card border-2 p-4 transition-all ${
                        role === 'passenger'
                          ? 'border-primary bg-amber-50/40 '
                          : 'border-line hover:border-neutral-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-card bg-ink text-white">
                          <User className="h-6 w-6" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h5 className="text-xs font-bold text-ink">I want to Ride (Passenger)</h5>
                            {role === 'passenger' && (
                              <CheckCircle2 className="h-4 w-4 text-ink fill-primary" />
                            )}
                          </div>
                          <p className="text-[11px] text-ink-3 mt-0.5 leading-snug">
                            Request on-demand rides, track live drivers, pay seamlessly, and travel safely.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Driver Option */}
                    <div
                      onClick={() => setRole('driver')}
                      className={`cursor-pointer rounded-card border-2 p-4 transition-all ${
                        role === 'driver'
                          ? 'border-primary bg-amber-50/40 '
                          : 'border-line hover:border-neutral-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-card bg-ink text-white">
                          <Car className="h-6 w-6" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h5 className="text-xs font-bold text-ink">I want to Drive (Driver)</h5>
                            {role === 'driver' && (
                              <CheckCircle2 className="h-4 w-4 text-ink fill-primary" />
                            )}
                          </div>
                          <p className="text-[11px] text-ink-3 mt-0.5 leading-snug">
                            Earn 85% on every trip with flexible hours, smart dispatches, and weekly payouts.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSignupStep('details')}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-xs font-bold text-ink shadow-card hover:bg-primary-hover active:bg-primary-pressed active:scale-[0.99] transition-all"
                  >
                    <span>Continue with Email Registration</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>

                  <div className="relative flex items-center justify-center pt-1">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-line" />
                    </div>
                    <span className="relative bg-white px-3 text-[11px] font-bold uppercase text-neutral-400">
                      Or Fast Signup
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleGoogleSignIn(role)}
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2.5 rounded-full border border-line bg-white py-3 text-xs font-bold text-ink hover:bg-surface-2 active:scale-[0.99] transition-all "
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Register as {role === 'passenger' ? 'Passenger' : 'Driver'} with Google</span>
                  </button>

                  <div className="text-center text-xs text-ink-3">
                    Already registered?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setMode('signin');
                      }}
                      className="font-bold text-ink underline"
                    >
                      Sign In
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Account Details & Registration Form */}
              {signupStep === 'details' && (
                <form onSubmit={handleSignUpSubmit} className="space-y-3.5">
                  {!isRiderTarget && (
                    <div className="flex items-center rounded-card bg-surface-2 p-1 border border-line mb-2">
                      <button
                        type="button"
                        onClick={() => setRole('passenger')}
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-full py-2 text-xs font-bold transition-all cursor-pointer ${
                          role === 'passenger'
                            ? 'bg-ink text-white shadow-card'
                            : 'text-ink-2 hover:text-ink'
                        }`}
                      >
                        <User className={`h-3.5 w-3.5 ${role === 'passenger' ? 'text-primary' : ''}`} />
                        <span>Passenger / Rider</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRole('driver')}
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-full py-2 text-xs font-bold transition-all cursor-pointer ${
                          role === 'driver'
                            ? 'bg-ink text-white shadow-card'
                            : 'text-ink-2 hover:text-ink'
                        }`}
                      >
                        <Car className={`h-3.5 w-3.5 ${role === 'driver' ? 'text-primary' : ''}`} />
                        <span>Driver (Drive &amp; Earn)</span>
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between pb-1">
                    <span className="text-[11px] font-bold text-ink-3 uppercase">
                      {role === 'passenger' ? 'Passenger Registration' : 'Driver Registration'}
                    </span>
                    {!isRiderTarget && (
                      <button
                        type="button"
                        onClick={() => setSignupStep('role')}
                        className="text-[11px] font-bold text-ink underline cursor-pointer"
                      >
                        Overview
                      </button>
                    )}
                  </div>

                  {/* Personal Information */}
                  <div>
                    <label className="block text-[11px] font-bold text-ink-2 mb-1">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Tendai Mthembu"
                        className="w-full rounded-input border border-line bg-surface-2 py-2.5 pl-9 pr-3 text-xs text-ink focus:border-primary focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  {role === 'passenger' && !BYPASS_PASSENGER_VERIFICATION ? (
                    verifiedPhone ? (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="block text-[11px] font-bold text-ink-2">Phone Number (South Africa)</span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success">
                            <ShieldCheck className="h-3 w-3" />
                            Verified
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="tel"
                            aria-label="Verified phone number"
                            value={formatPhoneDisplay(verifiedPhone.phone)}
                            disabled
                            className="w-full rounded-input border border-line bg-[#EEEEEE] py-2.5 px-3 text-xs text-ink-3 cursor-not-allowed"
                          />
                          <button
                            type="button"
                            onClick={() => setVerifiedPhone(null)}
                            className="shrink-0 rounded-full border border-line px-3 py-2 text-[11px] font-bold text-ink-2 hover:bg-surface-2 cursor-pointer"
                          >
                            Change
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-card border border-line p-3">
                        <PhoneOtpVerifier
                          label="Phone Number (South Africa)"
                          initialPhone={phone}
                          beforeSend={async (normalized) => {
                            const check = await firestoreService.checkPhoneRegistered(normalized);
                            if (check.isRegistered && !check.isOwn) {
                              throw new Error('This phone number is already registered with ZAKA. Please log in to your existing account.');
                            }
                          }}
                          onVerified={(verified) => {
                            setVerifiedPhone(verified);
                            setPhone(formatPhoneDisplay(verified.phone));
                            setError('');
                          }}
                        />
                      </div>
                    )
                  ) : (
                    <div>
                      <label className="block text-[11px] font-bold text-ink-2 mb-1">
                        Phone Number (South Africa)
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone((prev) => filterSaPhoneInput(e.target.value, prev))}
                          onBlur={() => {
                            if (!phone.trim()) return;
                            const check = validatePhoneNumber(phone);
                            if (check.valid) {
                              setPhone(formatPhoneDisplay(check.normalized));
                              setError('');
                            } else {
                              setError(check.error || 'Please enter a valid South African mobile number.');
                            }
                          }}
                          placeholder="+27 82 123 4567"
                          className="w-full rounded-input border border-line bg-surface-2 py-2.5 pl-9 pr-3 text-xs text-ink focus:border-primary focus:outline-none"
                          required
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold text-ink-2 mb-1">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="user@example.com"
                        className="w-full rounded-input border border-line bg-surface-2 py-2.5 pl-9 pr-3 text-xs text-ink focus:border-primary focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  {/* Password & Confirm Password */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-ink-2 mb-1">Password</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Min. 6 chars"
                          className="w-full rounded-input border border-line bg-surface-2 py-2.5 pl-3 pr-8 text-xs text-ink focus:border-primary focus:outline-none"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-ink"
                        >
                          {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-ink-2 mb-1">Confirm Password</label>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Repeat password"
                          className="w-full rounded-input border border-line bg-surface-2 py-2.5 pl-3 pr-8 text-xs text-ink focus:border-primary focus:outline-none"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-ink"
                        >
                          {showConfirmPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Driver Profile Photo */}
                  {role === 'driver' && (
                    <div className="flex items-center gap-3 rounded-card border border-line bg-surface-2 p-3.5">
                      {driverPhoto ? (
                        <img src={driverPhoto} alt="Your profile" className="h-14 w-14 shrink-0 rounded-full object-cover border border-line" />
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white border border-line text-ink-3">
                          <User className="h-6 w-6" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="block text-[11px] font-bold uppercase text-ink">Profile Photo</span>
                        <p className="text-[11px] text-ink-3 leading-snug">
                          A clear photo of your face. Passengers see it when you accept their ride.
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          <button
                            id="btn-register-driver-photo"
                            type="button"
                            onClick={() => driverPhotoInputRef.current?.click()}
                            className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[11px] font-bold text-ink hover:bg-surface-2 cursor-pointer"
                          >
                            <Camera className="h-3.5 w-3.5" />
                            {driverPhoto ? 'Change Photo' : 'Upload Photo'}
                          </button>
                          {driverPhoto && (
                            <button
                              type="button"
                              onClick={() => setDriverPhoto('')}
                              className="rounded-full px-2.5 py-1.5 text-[11px] font-bold text-ink-2 hover:bg-white cursor-pointer"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                      <input
                        ref={driverPhotoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleDriverPhotoSelected}
                        className="hidden"
                      />
                    </div>
                  )}

                  {/* What happens after the account is created */}
                  {role === 'driver' && (
                    <div className="flex items-start gap-2 rounded-card border border-line bg-surface-2 p-3 text-[11px] text-ink-2">
                      <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary-text" />
                      <span>
                        Next step: your driver application. You will add your home address and identity details and upload your
                        ID document, proof of address, Professional Driving Permit (PDP), vehicle registration and proof of
                        vehicle ownership. Vehicle details cannot be changed after registration.
                      </span>
                    </div>
                  )}

                  {/* Driver Vehicle Specs */}
                  {role === 'driver' && (
                    <div className="rounded-card border border-line bg-surface-2 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase text-ink">
                          Vehicle Specifications
                        </span>
                        <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                          Pending Verification
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={vehicleMake}
                          onChange={(e) => setVehicleMake(e.target.value)}
                          placeholder="Make (e.g. Toyota)"
                          className="rounded-input border border-line bg-white p-2 text-xs text-ink"
                          required
                        />
                        <input
                          type="text"
                          value={vehicleModel}
                          onChange={(e) => setVehicleModel(e.target.value)}
                          placeholder="Model (e.g. Corolla)"
                          className="rounded-input border border-line bg-white p-2 text-xs text-ink"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={vehicleColour}
                          onChange={(e) => setVehicleColour(e.target.value)}
                          placeholder="Colour (e.g. Silver)"
                          className="rounded-input border border-line bg-white p-2 text-xs text-ink"
                          required
                        />
                        <input
                          type="text"
                          value={vehiclePlate}
                          onChange={(e) => setVehiclePlate(e.target.value)}
                          placeholder="Plate (e.g. ZK 89 GP)"
                          className="rounded-input border border-line bg-white p-2 text-xs text-ink"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-ink-3 uppercase mb-1">
                          Vehicle Service Class
                        </label>
                        <div className="grid grid-cols-3 gap-1">
                          {ACTIVE_VEHICLE_TYPES.map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setVehicleType(v)}
                              className={`rounded-full py-1.5 text-[11px] font-bold uppercase transition-all ${
                                vehicleType === v
                                  ? 'bg-ink text-white'
                                  : 'bg-white border border-line text-ink-2'
                              }`}
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                      </div>

                      <p className="text-[11px] text-ink-3 leading-snug">
                        * Note: New driver accounts start with status <strong>Pending Verification</strong> until approved by Fleet Admin.
                      </p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-full bg-primary py-3.5 text-xs font-bold text-ink shadow-card hover:bg-primary-hover active:bg-primary-pressed active:scale-[0.99] transition-all cursor-pointer"
                  >
                    {loading
                      ? isProfilePending
                        ? 'Setting Up Profile...'
                        : 'Creating ZAKA Account...'
                      : isProfilePending
                      ? 'Finish Setting Up Profile'
                      : role === 'driver'
                      ? 'Complete Driver Registration'
                      : 'Complete Passenger Registration'}
                  </button>

                  <div className="text-center text-xs text-ink-3">
                    Already registered?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setMode('signin');
                      }}
                      className="font-bold text-ink underline"
                    >
                      Sign In
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {/* ================= MODE 3: FORGOT PASSWORD ================= */}
          {mode === 'forgot' && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-card bg-amber-100 text-ink mb-2">
                  <KeyRound className="h-6 w-6 text-ink" />
                </div>
                <h4 className="text-sm font-bold text-ink">Reset Your Password</h4>
                <p className="text-xs text-ink-3">
                  Enter your registered email address and we will send a password reset link to your inbox.
                </p>
              </div>

              {resetSuccess ? (
                <div className="space-y-3 rounded-card bg-emerald-50 border border-emerald-200 p-4 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
                  <h5 className="text-xs font-bold text-emerald-900">Password Reset Link Sent!</h5>
                  <p className="text-[11px] text-emerald-800">
                    We've emailed instructions to <strong>{email}</strong>. Please check your inbox and spam folder.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setResetSuccess(false);
                      setMode('signin');
                    }}
                    className="w-full rounded-full bg-ink py-2.5 text-xs font-bold text-white hover:bg-ink"
                  >
                    Return to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-bold text-ink mb-1">
                      Registered Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="user@example.com"
                        className="w-full rounded-input border border-line bg-surface-2 py-2.5 pl-9 pr-3 text-xs text-ink focus:border-primary focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-full bg-primary py-3.5 text-xs font-bold text-ink shadow-card hover:bg-primary-hover active:bg-primary-pressed active:scale-[0.99] transition-all"
                  >
                    {loading ? 'Sending Instructions...' : 'Send Password Reset Link'}
                  </button>

                  <div className="text-center text-xs text-ink-3">
                    Remember your password?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setMode('signin');
                      }}
                      className="font-bold text-ink underline"
                    >
                      Back to Sign In
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
