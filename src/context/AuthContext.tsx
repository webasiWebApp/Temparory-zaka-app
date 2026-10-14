/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Firebase Authentication Context
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  User as FirebaseUser,
  UserCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  signInAnonymously,
  signInWithCredential,
  sendEmailVerification,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { auth, db } from '../firebase/config';
import { doc, onSnapshot } from 'firebase/firestore';
import { firestoreService } from '../firebase/firestoreService';
import {
  UserProfile,
  PassengerProfile,
  DriverProfile,
  UserRole,
  DriverVehicle,
} from '../types';
import { DEMO_PERSONAS } from '../data/demoPersonas';
import { isRiderTarget } from '../config/appTarget';
import { notificationService } from '../services/notificationService';
import { onAppResume } from '../services/appLifecycleService';
import { normalizePhoneNumber, validatePhoneNumber } from '../utils/phoneUtils';
import { storageService } from '../firebase/storageService';
import { phoneVerificationService, type VerifiedPhone } from '../services/phoneVerificationService';

interface SignUpData {
  email: string;
  pass: string;
  name: string;
  phone: string;
  role: UserRole;
  photoURL?: string;
  vehicle?: Omit<DriverVehicle, 'driverId'>;
  // Passengers: proof that `phone` was confirmed by SMS code (see phoneVerificationService)
  phoneVerificationToken?: string;
}

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  passengerProfile: PassengerProfile | null;
  driverProfile: DriverProfile | null;
  loading: boolean;
  isSigningOut: boolean;
  roles: UserRole[];
  activeRole: UserRole | null;
  isAdmin: boolean;
  isEmailVerified: boolean;
  verificationEmailSent: boolean;
  setVerificationEmailSent: (sent: boolean) => void;
  isDemoTestMode: boolean;
  activeDemoPersona: 'amara' | 'sipho' | 'kofi' | 'chidi' | null;
  activeDemoRideId: string | null;
  setActiveDemoRideId: (rideId: string | null) => void;
  startDemoTestMode: (initialPersona?: 'amara' | 'sipho') => Promise<void>;
  switchDemoTestPersona: (targetPersona: 'amara' | 'sipho') => Promise<void>;
  resetDemoRide: () => Promise<void>;
  exitDemoTestMode: () => Promise<void>;
  setActiveRole: (role: UserRole | null) => void;
  switchActiveRole: (newRole: 'passenger' | 'driver') => Promise<void>;
  becomeDriver: (vehicleData?: Partial<DriverVehicle>) => Promise<void>;
  sendVerificationEmail: (targetUser?: FirebaseUser) => Promise<void>;
  checkEmailVerification: () => Promise<boolean>;
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (data: SignUpData) => Promise<void>;
  registerPassengerAccount: (email: string, pass: string, name: string) => Promise<FirebaseUser>;
  provisionPassengerProfile: (
    uid: string,
    details: { name: string; phone: string; email: string; photoURL?: string }
  ) => Promise<{ userProfile: UserProfile; passengerProfile: PassengerProfile }>;
  // Without a role, an account that is not registered yet is NOT created: the call fails with
  // code NO_ZAKA_ACCOUNT so the user can choose Passenger or Driver first.
  signInWithGoogle: (preferredRole?: UserRole) => Promise<void>;
  signInWithApple: (preferredRole?: UserRole) => Promise<void>;
  confirmVerifiedPhone: (verified: VerifiedPhone) => Promise<void>;
  deleteAccount: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateUserProfileData: (data: Partial<UserProfile>) => Promise<void>;
  updatePassengerProfileData: (data: Partial<PassengerProfile>) => Promise<void>;
  updateDriverProfileData: (data: Partial<DriverProfile>) => Promise<void>;
  signInDemoPersona: (personaKey: 'amara' | 'sipho' | 'kofi' | 'chidi') => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfiles: () => Promise<void>;
}

// Demo mode exists for sales demonstrations only. It is compiled out of production builds:
// unless VITE_ENABLE_DEMO_MODE=true every demo entry point refuses to run, and no demo
// credential is present in the bundle (the password is supplied through the build environment).
const DEMO_MODE_ENABLED = import.meta.env.VITE_ENABLE_DEMO_MODE === 'true';
const DEMO_ACCOUNT_PASSWORD = DEMO_MODE_ENABLED ? String(import.meta.env.VITE_DEMO_ACCOUNT_PASSWORD || '') : '';

export const DEMO_IDENTITIES = {
  amara: {
    email: 'demo.amara.dlamini@zaka-internal.app',
    pass: DEMO_ACCOUNT_PASSWORD,
    uid: 'lVpNZkKx9mMnqEMXrKzjgFm2Ju42',
    name: 'Amara Dlamini',
    role: 'passenger' as UserRole,
  },
  sipho: {
    email: 'demo.sipho.nkosi@zaka-internal.app',
    pass: DEMO_ACCOUNT_PASSWORD,
    uid: 'qSI9wgzICxOra8JwdxLfFYviBdh2',
    name: 'Sipho Nkosi',
    role: 'driver' as UserRole,
  },
  kofi: {
    email: 'demo.kofi.mensah@zaka-internal.app',
    pass: DEMO_ACCOUNT_PASSWORD,
    name: 'Kofi Mensah',
    role: 'driver' as UserRole,
  },
  chidi: {
    email: 'demo.chidi.okonjo@zaka-internal.app',
    pass: DEMO_ACCOUNT_PASSWORD,
    name: 'Chidi Okonjo',
    role: 'admin' as UserRole,
  },
};

const DEMO_DISABLED_MESSAGE = 'Demo mode is not available in this build.';

/** Error code raised when a federated sign-in finds no ZAKA account and no role was chosen */
export const NO_ZAKA_ACCOUNT = 'zaka/no-account';

/** Federated providers verify the email address themselves */
function hasVerifiedProvider(user?: FirebaseUser | null): boolean {
  return Boolean(user?.providerData?.some((p) => p.providerId === 'google.com' || p.providerId === 'apple.com'));
}

/** Verification comes from Firebase Auth only - never from a field the user can write in Firestore */
function isAuthEmailVerified(user?: FirebaseUser | null): boolean {
  return Boolean(user && (user.emailVerified || hasVerifiedProvider(user)));
}

// Last role this account was confirmed to hold, remembered on the device. Used only when the profile
// cannot be loaded (offline / timeout) so that a Driver is never shown the Rider app by mistake.
function rememberRole(uid: string, role: UserRole) {
  try {
    localStorage.setItem(`zaka_last_role_${uid}`, role);
  } catch {
    // storage unavailable
  }
}

function recallRole(uid: string): UserRole | null {
  try {
    const v = localStorage.getItem(`zaka_last_role_${uid}`);
    return v === 'driver' || v === 'passenger' || v === 'admin' ? v : null;
  } catch {
    return null;
  }
}

export const ADMIN_EMAILS = [
  'admin@zaka.io',
  'webasiinfo@gmail.com',
];

export const ADMIN_UIDS = [
  'Js6QAJWZskfRhInQFlX4fjlZ9Ws1',
  'KCKA8mq7u6Udj5Lp4pIMSqlEgPJ2',
];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [passengerProfile, setPassengerProfile] = useState<PassengerProfile | null>(null);
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);
  const [rawActiveRole, setRawActiveRole] = useState<UserRole | null>(isRiderTarget ? 'passenger' : null);
  const activeRole: UserRole | null = isRiderTarget ? 'passenger' : rawActiveRole;

  // Authoritative verified admin computation (never allow self-escalation or demo bypass)
  const userEmail = (currentUser?.email || userProfile?.email || '').trim().toLowerCase();
  // Mirrors firestore.rules isRealAdmin(): allow-listed UID, or allow-listed email that is verified.
  // The role stored in Firestore is never enough on its own.
  const isAdmin = Boolean(
    currentUser &&
    !currentUser.isAnonymous &&
    !userProfile?.isDemo &&
    (
      ADMIN_UIDS.includes(currentUser.uid) ||
      (userEmail && ADMIN_EMAILS.includes(userEmail) && isAuthEmailVerified(currentUser))
    )
  );

  // Authoritative roles array for the authenticated user (strictly secured against escalation)
  const roles: UserRole[] = React.useMemo(() => {
    if (isRiderTarget) return ['passenger'];
    if (!userProfile) return [];
    let baseRoles: UserRole[] = [];
    if (Array.isArray(userProfile.roles) && userProfile.roles.length > 0) {
      baseRoles = [...userProfile.roles];
    } else if (userProfile.role) {
      baseRoles = [userProfile.role];
    } else {
      baseRoles = ['passenger'];
    }

    // Hard security boundary: non-admins cannot have 'admin' in roles
    if (!isAdmin) {
      baseRoles = baseRoles.filter((r) => r !== 'admin');
      if (baseRoles.length === 0) baseRoles.push('passenger');
    } else if (!baseRoles.includes('admin')) {
      baseRoles.push('admin');
    }
    return baseRoles;
  }, [userProfile, isAdmin]);

  // Authoritative email verification status
  // (`userProfile.emailVerified` in memory is set from Firebase Auth by fetchProfiles /
  // checkEmailVerification - it is what makes the screen re-render after verification.)
  const isEmailVerified: boolean = Boolean(
    isAuthEmailVerified(currentUser) ||
    (userProfile?.emailVerified && isAuthEmailVerified(auth.currentUser)) ||
    isAdmin ||
    (DEMO_MODE_ENABLED && userProfile?.isDemo)
  );

  const [verificationEmailSent, setVerificationEmailSent] = useState<boolean>(false);

  const switchActiveRole = async (newRole: 'passenger' | 'driver') => {
    if (isRiderTarget) {
      setRawActiveRole('passenger');
      return;
    }
    if (!userProfile || !currentUser) {
      throw new Error('You must be signed in to switch roles.');
    }
    if (!roles.includes(newRole)) {
      throw new Error(`Your account does not possess the "${newRole}" role.`);
    }

    setLoading(true);
    try {
      await firestoreService.switchUserActiveRole(currentUser.uid, newRole);
      setRawActiveRole(newRole);
      setUserProfile((prev) => prev ? { ...prev, activeRole: newRole, role: newRole } : null);
    } catch (err: any) {
      console.error('Failed to switch active role:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const becomeDriver = async (vehicleData?: Partial<DriverVehicle>) => {
    if (!currentUser || !userProfile) {
      throw new Error('You must be signed in to become a driver.');
    }
    setLoading(true);
    try {
      await firestoreService.becomeDriver(currentUser.uid, vehicleData);
      await fetchProfiles(currentUser.uid, currentUser);
    } catch (err: any) {
      console.error('Failed to add driver role:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const sendVerificationEmail = async (targetUser?: FirebaseUser): Promise<void> => {
    const userToVerify = targetUser || auth.currentUser || currentUser;
    if (!userToVerify) {
      throw new Error('No active user session found to send verification email.');
    }
    try {
      await sendEmailVerification(userToVerify);
      setVerificationEmailSent(true);
      console.log('[ZAKA AUTH] Verification email dispatched successfully to', userToVerify.email);
    } catch (err: any) {
      const code = err?.code || '';
      console.warn('[ZAKA AUTH] sendEmailVerification note:', code, err?.message);
      let userMsg = 'Failed to send verification email. Please try again.';
      if (code === 'auth/too-many-requests') {
        userMsg = 'Too many requests. Please wait a moment before requesting another verification email.';
      } else if (code === 'auth/invalid-email') {
        userMsg = 'The email address is invalid for verification.';
      } else if (code === 'auth/user-token-expired') {
        userMsg = 'Your session has expired. Please sign in again to verify your email.';
      } else if (code === 'auth/network-request-failed') {
        userMsg = 'Network error. Please check your internet connection and try again.';
      } else if (err?.message) {
        userMsg = err.message;
      }
      throw new Error(userMsg);
    }
  };

  const checkEmailVerification = async (): Promise<boolean> => {
    const user = auth.currentUser || currentUser;
    if (!user) return false;
    await user.reload();
    const verified = Boolean(user.emailVerified);
    if (verified) {
      // The security rules read email_verified from the ID token, which only changes on refresh
      await user.getIdToken(true).catch(() => null);
      if (userProfile?.uid) {
        try {
          await firestoreService.updateUserProfile(userProfile.uid, { emailVerified: true });
        } catch (err) {
          console.warn('Note updating emailVerified in user profile:', err);
        }
      }
      setUserProfile((prev) => (prev ? { ...prev, emailVerified: true } : null));
      setVerificationEmailSent(false);
    }
    return verified;
  };

  const setActiveRole = (role: UserRole | null) => {
    if (isRiderTarget) {
      setRawActiveRole('passenger');
      return;
    }
    if (!role) {
      setRawActiveRole(null);
      return;
    }
    if (role === 'admin') {
      if (!isAdmin) {
        console.warn('[ZAKA Security] Blocked unauthorized role switch to admin.');
        return;
      }
      setRawActiveRole('admin');
      return;
    }
    if (role === 'passenger' || role === 'driver') {
      const allowedRoles = Array.isArray(userProfile?.roles) && userProfile.roles.length > 0
        ? userProfile.roles
        : [userProfile?.role || 'passenger'];
      if (!allowedRoles.includes(role) && !roles.includes(role) && !isAdmin && userProfile?.role !== role) {
        console.warn(`[ZAKA Security] Blocked unauthorized role switch: user does not have role "${role}".`);
        return;
      }
      setRawActiveRole(role);
      if (currentUser?.uid) {
        firestoreService.switchUserActiveRole(currentUser.uid, role).catch(() => {});
      }
    }
  };
  const [loading, setLoading] = useState<boolean>(true);
  const [isSigningOut, setIsSigningOut] = useState<boolean>(false);
  const isSigningInDemoRef = useRef<boolean>(false);
  const isRegisteringRef = useRef<boolean>(false);
  const isSigningInRef = useRef<boolean>(false);

  // Demo Simulation State
  // Demo mode is gated by VITE_ENABLE_DEMO_MODE env variable — set to 'true' to enable.
  // In production builds, omit this variable or set to 'false' to disable all demo features.
  const isDemoEnabled = DEMO_MODE_ENABLED;
  const [isDemoTestMode, setIsDemoTestMode] = useState<boolean>(() => {
    if (!isDemoEnabled) return false;
    try {
      return sessionStorage.getItem('zaka_demo_test_mode') === 'true';
    } catch {
      return false;
    }
  });

  const [activeDemoPersona, setActiveDemoPersona] = useState<'amara' | 'sipho' | 'kofi' | 'chidi' | null>(() => {
    try {
      return (sessionStorage.getItem('zaka_active_demo_persona') as any) || null;
    } catch {
      return null;
    }
  });

  const [activeDemoRideId, setActiveDemoRideIdState] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('zaka_active_demo_ride_id') || null;
    } catch {
      return null;
    }
  });

  const setActiveDemoRideId = (rideId: string | null) => {
    setActiveDemoRideIdState(rideId);
    try {
      if (rideId) {
        sessionStorage.setItem('zaka_active_demo_ride_id', rideId);
      } else {
        sessionStorage.removeItem('zaka_active_demo_ride_id');
      }
    } catch (e) {
      console.warn('sessionStorage note:', e);
    }
  };

  // Load Firestore data for a specific user ID with admin detection & auto-recovery
  const fetchProfiles = async (uid: string, fbUser?: FirebaseUser | null) => {
    try {
      const userAuth = fbUser || currentUser || auth.currentUser;
      const userEmail = (userAuth?.email || '').trim().toLowerCase();
      const isAdminAccount =
        (ADMIN_EMAILS.includes(userEmail) && isAuthEmailVerified(userAuth)) ||
        Boolean(userAuth && ADMIN_UIDS.includes(userAuth.uid));

      // Throws when the profile cannot be read; only a genuinely missing profile returns null
      let uProfile = await firestoreService.getUserProfile(uid);

      // If user profile is missing in Firestore, recover/provision it automatically
      if (!uProfile && userAuth) {
        const now = new Date().toISOString();
        if (isAdminAccount) {
          uProfile = {
            uid,
            name: userAuth.displayName || 'ZAKA Fleet Administrator',
            phone: userAuth.phoneNumber || '',
            email: userEmail,
            role: 'admin',
            status: 'active',
            accountStatus: 'active',
            createdAt: now,
            updatedAt: now,
          };
          await firestoreService.createUserProfile(uProfile);
        } else {
          // Check if driver or passenger doc exists
          const existingDriver = await firestoreService.getDriverProfile(uid);
          const existingPassenger = await firestoreService.getPassengerProfile(uid);
          // A sign-up that was interrupted before its profile was written must come back with the role
          // it was registering for (remembered on this device), not silently become a Rider.
          const wasRegisteringDriver = !isRiderTarget && !existingPassenger && recallRole(uid) === 'driver';
          const detectedRole: UserRole = existingDriver || wasRegisteringDriver ? 'driver' : 'passenger';
          const recoveredPhone = existingPassenger?.phone || userAuth.phoneNumber || '';
          uProfile = {
            uid,
            name: userAuth.displayName || existingPassenger?.name || 'ZAKA Member',
            phone: recoveredPhone,
            email: userEmail,
            role: detectedRole,
            status: 'active',
            accountStatus: 'active',
            createdAt: now,
            updatedAt: now,
          };
          await firestoreService.createUserProfile(uProfile);
          if (detectedRole === 'driver' && !existingDriver) {
            await firestoreService.createOrUpdateDriver({
              userId: uid,
              name: uProfile.name,
              phone: recoveredPhone,
              rating: 5.0,
              totalTrips: 0,
              online: false,
              available: false,
              verificationStatus: 'pending',
              currentLocation: { latitude: -26.1458, longitude: 28.0416, timestamp: Date.now() },
              earningsToday: 0,
              earningsThisWeek: 0,
              totalEarnings: 0,
              createdAt: now,
              updatedAt: now,
            });
          }
        }
      }

      if (uProfile) {
        // Normalize any 'rider' / 'driver' / 'admin' role strings
        const normalizeRoleStr = (r?: any): UserRole => {
          const s = String(r || '').trim().toLowerCase();
          if (s === 'driver') return 'driver';
          if (s === 'admin') return 'admin';
          return 'passenger';
        };

        const baseRole = normalizeRoleStr(uProfile.role);
        let rawUserRoles: UserRole[] = [];
        if (Array.isArray(uProfile.roles) && uProfile.roles.length > 0) {
          rawUserRoles = uProfile.roles.map(normalizeRoleStr);
        } else {
          rawUserRoles = [baseRole];
        }

        // Strict role validation against verified admin status
        let userRoles: UserRole[];
        if (isAdminAccount) {
          userRoles = rawUserRoles.includes('admin') ? rawUserRoles : [...rawUserRoles, 'admin'];
        } else {
          // Normal accounts can NEVER possess the 'admin' role
          userRoles = rawUserRoles.filter((r) => r !== 'admin');
          if (userRoles.length === 0) {
            userRoles.push(baseRole);
          }
        }

        // Check if driver profile exists in Firestore (e.g. driver doc already registered)
        // The Rider app never loads a driver profile, so it does not spend a read looking for one
        const dProfile = isRiderTarget ? null : await firestoreService.getDriverProfile(uid);
        if (dProfile && !userRoles.includes('driver')) {
          userRoles.push('driver');
        }

        // Resolve active role safely: Never downgrade or default a driver to passenger
        let effectiveActiveRole: UserRole;
        if (isRiderTarget) {
          effectiveActiveRole = 'passenger';
        } else if (isAdminAccount) {
          // Authorized Admin account
          effectiveActiveRole = (uProfile.activeRole && userRoles.includes(normalizeRoleStr(uProfile.activeRole)))
            ? normalizeRoleStr(uProfile.activeRole)
            : 'admin';
        } else {
          // Normal account (Passenger or Driver)
          const isDriver =
            baseRole === 'driver' ||
            normalizeRoleStr(uProfile.activeRole) === 'driver' ||
            userRoles.includes('driver') ||
            Boolean(dProfile);

          if (isDriver && !userRoles.includes('passenger') && baseRole !== 'passenger') {
            effectiveActiveRole = 'driver';
          } else if (normalizeRoleStr(uProfile.activeRole) === 'driver' && isDriver) {
            effectiveActiveRole = 'driver';
          } else if (normalizeRoleStr(uProfile.activeRole) === 'passenger' && userRoles.includes('passenger')) {
            effectiveActiveRole = 'passenger';
          } else if (baseRole === 'driver') {
            effectiveActiveRole = 'driver';
          } else if (isDriver) {
            effectiveActiveRole = 'driver';
          } else {
            effectiveActiveRole = 'passenger';
          }
        }

        const isVerified = Boolean(
          isAuthEmailVerified(userAuth) ||
          isAdminAccount ||
          (DEMO_MODE_ENABLED && uProfile.isDemo)
        );

        // Keep the stored flag in step with Firebase Auth (used by data-retention housekeeping)
        if (isAuthEmailVerified(userAuth) && uProfile.emailVerified !== true) {
          firestoreService.updateUserProfile(uid, { emailVerified: true }).catch(() => {});
        }

        // Auto-heal/sanitize database state if previously contaminated with admin role
        if (!isAdminAccount && (uProfile.role === 'admin' || uProfile.activeRole === 'admin' || rawUserRoles.includes('admin'))) {
          firestoreService.updateUserProfile(uid, {
            role: effectiveActiveRole,
            activeRole: effectiveActiveRole,
            roles: userRoles,
          }).catch((err) => console.warn('Note updating sanitized profile:', err));
        }

        uProfile = {
          ...uProfile,
          roles: userRoles,
          activeRole: effectiveActiveRole,
          role: effectiveActiveRole,
          emailVerified: isVerified,
        };

        setUserProfile(uProfile);
        setRawActiveRole(effectiveActiveRole);
        rememberRole(uid, effectiveActiveRole);

        // Load passenger profile ONLY if user actually has passenger role and is not purely a driver
        if ((userRoles.includes('passenger') || isRiderTarget) && uProfile.role !== 'driver') {
          // A read failure leaves pProfile undefined: nothing is written and the profile already on
          // screen is kept, so a network hiccup can never reset the passenger's saved data.
          let pProfile: PassengerProfile | null | undefined;
          try {
            pProfile = await firestoreService.getPassengerProfile(uid);
          } catch {
            pProfile = undefined;
          }
          if (pProfile === undefined) {
            // keep the current passenger profile
          } else if (!pProfile) {
            pProfile = {
              userId: uid,
              name: uProfile.name || 'ZAKA Member',
              phone: uProfile.phone || '',
              rating: 5.0,
              totalTrips: 0,
              walletBalance: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            await firestoreService.createOrUpdatePassenger(pProfile).catch(() => {});
          } else if (uProfile.phone && (!pProfile.phone || pProfile.phone.includes('000 0000'))) {
            // Keep passenger profile phone in sync with user's verified phone
            pProfile = { ...pProfile, phone: uProfile.phone };
            const { walletBalance: _serverOwned, ...passengerFields } = pProfile;
            firestoreService.createOrUpdatePassenger(passengerFields as PassengerProfile).catch(() => {});
          } else if (pProfile.phone && (!uProfile.phone || uProfile.phone.includes('000 0000'))) {
            // Recover real phone from passenger profile into userProfile
            uProfile.phone = pProfile.phone;
            firestoreService.updateUserProfile(uid, { phone: pProfile.phone }).catch(() => {});
          }
          if (pProfile) setPassengerProfile(pProfile);
        } else {
          setPassengerProfile(null);
        }

        // Always load driver profile if user has driver role or effective role is driver
        if ((userRoles.includes('driver') || uProfile.role === 'driver' || effectiveActiveRole === 'driver') && !isRiderTarget) {
          const freshDProfile = dProfile || await firestoreService.getDriverProfile(uid);
          setDriverProfile(freshDProfile);
        } else {
          setDriverProfile(null);
        }
      }
    } catch (err) {
      console.warn('Error fetching user profiles from Firestore:', err);
      // Fallback: If profile loading failed, ensure user is still recognized as authenticated
      const userAuth = fbUser || currentUser || auth.currentUser;
      if (userAuth && !userProfile) {
        const userEmail = (userAuth?.email || '').trim().toLowerCase();
        const isAdminAccount =
          (ADMIN_EMAILS.includes(userEmail) && isAuthEmailVerified(userAuth)) ||
          Boolean(userAuth && ADMIN_UIDS.includes(userAuth.uid));
        // The profile could not be loaded. Use the role this account last had on this device rather
        // than assuming Rider. Nothing is written back, so the stored role is never overwritten.
        const fallbackRole: UserRole = isAdminAccount ? 'admin' : (recallRole(uid) === 'driver' ? 'driver' : 'passenger');
        const fallbackProfile: UserProfile = {
          uid,
          name: userAuth.displayName || 'ZAKA Member',
          phone: userAuth.phoneNumber || '',
          email: userEmail,
          role: fallbackRole,
          roles: [fallbackRole],
          activeRole: fallbackRole,
          status: 'active',
          accountStatus: 'active',
          emailVerified: isAuthEmailVerified(userAuth),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setUserProfile(fallbackProfile);
        setRawActiveRole(isRiderTarget ? 'passenger' : fallbackRole);
      }
    }
  };

  const refreshProfiles = async () => {
    if (userProfile?.uid) {
      await fetchProfiles(userProfile.uid, currentUser);
    } else if (currentUser?.uid) {
      await fetchProfiles(currentUser.uid, currentUser);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      // If we are currently handling signIn, signInDemoPersona, or signUp registration, do not run background fetchProfiles or clear loading prematurely
      if (isSigningInRef.current || isSigningInDemoRef.current || isRegisteringRef.current) {
        return;
      }
      setLoading(true);
      setCurrentUser(fbUser);
      if (fbUser) {
        await fetchProfiles(fbUser.uid, fbUser);
        if (isRiderTarget) {
          notificationService.registerNativePush(fbUser.uid).catch(() => {});
        }
      } else {
        // If not logged in, clear authenticated user profiles and active role
        setUserProfile(null);
        setPassengerProfile(null);
        setDriverProfile(null);
        setActiveRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Real-time listener on driver document for instant approval updates & verification state
  useEffect(() => {
    const uid = currentUser?.uid || userProfile?.uid;
    if (!uid || (userProfile?.role !== 'driver' && activeRole !== 'driver')) {
      return;
    }

    const unsubDriver = onSnapshot(
      doc(db, 'drivers', uid),
      (snap) => {
        if (snap.exists()) {
          const dData = snap.data() as DriverProfile;
          // Location and heartbeat writes land here every few seconds. They change nothing the UI
          // reads from the profile, so they must not re-render every screen that uses the auth context.
          const stripTelemetry = (p: any) => {
            const { currentLocation, lastLocation, lastSeenAt, updatedAt, ...rest } = p || {};
            return JSON.stringify(rest);
          };
          setDriverProfile((prev) => {
            const next = { ...prev, ...dData };
            return prev && stripTelemetry(prev) === stripTelemetry(next) ? prev : next;
          });
        }
      },
      (err) => {
        console.warn('Driver snapshot listener note:', err);
      }
    );

    return () => unsubDriver();
  }, [currentUser?.uid, userProfile?.uid, userProfile?.role, activeRole]);

  // Real-time listener on the passenger document: the wallet balance is credited / debited by the backend
  useEffect(() => {
    const uid = currentUser?.uid;
    if (!uid || !passengerProfile?.userId || passengerProfile.userId !== uid) {
      return;
    }
    const unsubPassenger = firestoreService.listenToPassengerProfile(uid, (fresh) => {
      if (fresh) setPassengerProfile((prev) => (prev ? { ...prev, ...fresh } : fresh));
    });
    return () => unsubPassenger();
  }, [currentUser?.uid, passengerProfile?.userId]);

  // Listen to app foregrounding and network reconnects to refresh profile and rides
  useEffect(() => {
    const unsubResume = onAppResume(() => {
      console.log('[Auth] App resumed from background. Syncing user profile.');
      refreshProfiles();
    });
    return () => {
      unsubResume();
    };
  }, []);

  // Format user-friendly error messages from Firebase error codes
  const getReadableAuthError = (err: any): string => {
    const code = err?.code || '';
    switch (code) {
      case 'auth/email-already-in-use':
        return 'An account with this email address already exists. Please sign in instead.';
      case 'auth/invalid-email':
        return 'The email address is invalid. Please check and try again.';
      case 'auth/weak-password':
        return 'Password is too weak. Please use at least 6 characters.';
      case 'auth/network-request-failed':
        return 'Network connection error. Please check your internet connection.';
      case 'auth/user-disabled':
        return 'This account has been disabled. Please contact ZAKA support.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Unable to sign in. Please check your email and password.';
      case 'auth/account-exists-with-different-credential':
        return 'An account already exists with this email address. Please sign in using the provider originally used to register.';
      case 'auth/too-many-requests':
        return 'Too many failed sign-in attempts. Please wait a few moments and try again.';
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return 'Sign-in cancelled.';
      case 'auth/popup-blocked':
        return 'Sign-in popup was blocked by your browser. Please allow popups or use Demo accounts.';
      case 'auth/unauthorized-domain':
        return `Sign-in is not enabled for ${window.location.hostname} yet. This domain must be added under Firebase Authentication > Settings > Authorized domains.`;
      case 'auth/operation-not-allowed':
        return 'Email/Password sign-in is not enabled. Please contact support or use Google Sign-In.';
      case 'permission-denied':
        return 'Access was denied. Please verify your account and try again.';
      case 'unavailable':
        return 'ZAKA service is temporarily unavailable. Please check your internet connection and try again.';
      case 'deadline-exceeded':
        return 'The request timed out. Please check your internet connection and try again.';
      default: {
        const msg = err?.message || '';
        if (msg.includes('permission-denied') || msg.includes('Missing or insufficient permissions')) {
          return 'Access was denied. Please verify your account and try again.';
        }
        if (msg.includes('unavailable') || msg.includes('Could not reach Cloud Firestore')) {
          return 'Network service is currently unavailable. Please check your internet connection and try again.';
        }
        if (msg.includes('timed out') || msg.includes('deadline-exceeded')) {
          return 'The request timed out. Please check your internet connection and try again.';
        }
        if (msg.startsWith('{') && msg.endsWith('}')) {
          return 'A network or profile error occurred. Please try again.';
        }
        return msg || 'Registration failed. Please check your connection and try again.';
      }
    }
  };

  const signIn = async (email: string, pass: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }
    if (!pass) {
      throw new Error('Please enter your password.');
    }

    setLoading(true);
    isSigningInRef.current = true;

    let res: UserCredential;
    try {
      res = await signInWithEmailAndPassword(auth, normalizedEmail, pass);
      console.log('[ZAKA AUTH] signInWithEmailAndPassword successful:', normalizedEmail, 'UID:', res.user.uid);
    } catch (error: any) {
      console.warn('[ZAKA AUTH] signInWithEmailAndPassword notice:', error?.code, error?.message);
      isSigningInRef.current = false;
      setLoading(false);
      throw new Error(getReadableAuthError(error));
    }

    // Step 2: Firebase user authenticated. Get Firebase UID and verify auth.currentUser
    const authenticatedUser = res.user || auth.currentUser;
    if (!authenticatedUser) {
      isSigningInRef.current = false;
      setLoading(false);
      throw new Error('Unable to sign in. Please check your email and password.');
    }

    setCurrentUser(authenticatedUser);

    // Step 3: Load corresponding Firestore profile, read role, and route
    try {
      await fetchProfiles(authenticatedUser.uid, authenticatedUser);
    } catch (profileErr: any) {
      console.warn('[ZAKA AUTH] Note: Profile sync notice after authentication:', profileErr?.message);
    } finally {
      isSigningInRef.current = false;
      setLoading(false);
    }
  };

  /**
   * Obtains a Firebase session from Google or Apple.
   * - Web: standard popup.
   * - Native iOS/Android (Capacitor): popups and redirects do not work inside the WebView, so the
   *   native Google / Apple sign-in sheet is used and its credential is handed to the Firebase JS SDK.
   */
  const federatedSignIn = async (providerId: 'google.com' | 'apple.com'): Promise<FirebaseUser> => {
    if (Capacitor.isNativePlatform()) {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      if (providerId === 'google.com') {
        const result = await FirebaseAuthentication.signInWithGoogle();
        const idToken = result.credential?.idToken;
        if (!idToken) throw new Error('Google sign-in did not return a credential. Please try again.');
        const credential = GoogleAuthProvider.credential(idToken, result.credential?.accessToken);
        return (await signInWithCredential(auth, credential)).user;
      }
      const result = await FirebaseAuthentication.signInWithApple();
      const idToken = result.credential?.idToken;
      if (!idToken) throw new Error('Apple sign-in did not return a credential. Please try again.');
      const appleProvider = new OAuthProvider('apple.com');
      const credential = appleProvider.credential({ idToken, rawNonce: result.credential?.nonce });
      return (await signInWithCredential(auth, credential)).user;
    }

    if (providerId === 'google.com') {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return (await signInWithPopup(auth, provider)).user;
    }
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    return (await signInWithPopup(auth, provider)).user;
  };

  const signInWithProvider = async (
    providerId: 'google.com' | 'apple.com',
    preferredRole: UserRole | undefined,
    defaultName: string
  ) => {
    setLoading(true);
    isSigningInRef.current = true;
    const label = providerId === 'google.com' ? 'Google' : 'Apple';
    try {
      const fbUser = await federatedSignIn(providerId);
      const uid = fbUser.uid;

      // Returning account: load it exactly like an email/password sign-in (role is read, never re-assigned)
      const existing = await firestoreService.getUserProfile(uid);
      if (!existing && !preferredRole && !isRiderTarget) {
        // Signing in must never create an account on the user's behalf. The session is closed and the
        // caller sends them to registration, where they choose Passenger or Driver themselves.
        await firebaseSignOut(auth).catch(() => {});
        const noAccount: any = new Error(
          `No ZAKA account is registered for this ${label} account yet. Choose Passenger or Driver to create one.`
        );
        noAccount.code = NO_ZAKA_ACCOUNT;
        throw noAccount;
      }
      if (!existing) {
        const assignedRole: UserRole = isRiderTarget ? 'passenger' : (preferredRole === 'driver' ? 'driver' : 'passenger');
        // Remembered before any write so an interrupted sign-up is recovered with this role
        rememberRole(uid, assignedRole);
        const now = new Date().toISOString();
        // Federated accounts do not come with a phone number: it is left empty and the user is asked
        // for it in their profile. A made-up number is never stored.
        const phone = fbUser.phoneNumber ? normalizePhoneNumber(fbUser.phoneNumber) : '';
        const newProfile: UserProfile = {
          uid,
          name: fbUser.displayName || defaultName,
          phone,
          email: (fbUser.email || '').trim().toLowerCase(),
          photoURL: fbUser.photoURL || '',
          role: assignedRole,
          roles: [assignedRole],
          activeRole: assignedRole,
          emailVerified: true,
          status: 'active',
          accountStatus: 'active',
          createdAt: now,
          updatedAt: now,
        };
        await firestoreService.createUserProfile(newProfile);

        if (assignedRole === 'passenger') {
          await firestoreService.createOrUpdatePassenger({
            userId: uid,
            name: newProfile.name,
            phone,
            rating: 5.0,
            totalTrips: 0,
            walletBalance: 0,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          await firestoreService.createOrUpdateDriver({
            userId: uid,
            name: newProfile.name,
            phone,
            photoURL: newProfile.photoURL,
            rating: 5.0,
            totalTrips: 0,
            online: false,
            available: false,
            verificationStatus: 'pending',
            currentLocation: {
              latitude: -26.1458,
              longitude: 28.0416,
              timestamp: Date.now(),
            },
            earningsToday: 0,
            earningsThisWeek: 0,
            totalEarnings: 0,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      setCurrentUser(fbUser);
      await fetchProfiles(uid, fbUser);

      if (isRiderTarget) {
        notificationService.registerNativePush(uid).catch(() => {});
      }
    } catch (err: any) {
      const cancelled =
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request' ||
        /cancel/i.test(String(err?.message || ''));
      if (cancelled) {
        console.log(`${label} Sign In was dismissed by user.`);
        throw new Error('Sign-in cancelled.');
      }
      if (err?.code === NO_ZAKA_ACCOUNT) {
        throw err;
      }
      console.error(`${label} Sign In error:`, err);
      throw new Error(getReadableAuthError(err));
    } finally {
      isSigningInRef.current = false;
      setLoading(false);
    }
  };

  const signInWithGoogle = (preferredRole?: UserRole) =>
    signInWithProvider('google.com', preferredRole, 'ZAKA User');

  const signInWithApple = (preferredRole?: UserRole) =>
    signInWithProvider('apple.com', preferredRole, 'ZAKA User');

  const deleteAccount = async () => {
    if (!auth.currentUser) {
      throw new Error('No authenticated user session found to delete.');
    }
    const uid = auth.currentUser.uid;
    setLoading(true);
    try {
      // 0. Remove verification documents held in Cloud Storage (only the owner may delete them)
      const storedDocs = Object.values(driverProfile?.verificationDocuments || {});
      await Promise.all(
        storedDocs
          .filter((d): d is NonNullable<typeof d> => Boolean(d?.storagePath))
          .map((d) => storageService.deleteDocument(d.storagePath))
      );
      // Identity verification photos (ID document and selfie)
      await firestoreService.deletePassengerVerificationImages(uid);
      // Driver's personal details (home address, date of birth, nationality, ID number)
      await firestoreService.deleteDriverPrivateDetails(uid);
      // 1. Delete or anonymize profile data in Firestore
      await firestoreService.deleteOrAnonymizeUserProfile(uid);
      // 2. Delete the user from Firebase Auth
      await auth.currentUser.delete();
      // 3. Clear local state
      setCurrentUser(null);
      setUserProfile(null);
      setPassengerProfile(null);
      setDriverProfile(null);
      setActiveRole(null);
    } catch (err: any) {
      console.error('Error during account deletion:', err);
      if (err?.code === 'auth/requires-recent-login') {
        throw new Error('For security reasons, deleting your account requires a fresh login. Please sign out and sign back in before deleting your account.');
      }
      throw new Error(err?.message || 'Failed to delete account. Please try again or contact support.');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (email: string) => {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      console.log('[ZAKA AUTH] Password reset email sent to:', cleanEmail);
    } catch (err: any) {
      console.warn('[ZAKA AUTH] resetPassword notice:', err?.code, err?.message);
      throw new Error(getReadableAuthError(err));
    }
  };

  const REGISTRATION_TIMEOUT_MS = 15000;

  function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
    let timer: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const err: any = new Error(`${operationName} timed out. Please check your internet connection and try again.`);
        err.code = 'deadline-exceeded';
        reject(err);
      }, timeoutMs);
    });

    return Promise.race([
      promise.then((res) => {
        clearTimeout(timer);
        return res;
      }),
      timeoutPromise,
    ]).finally(() => {
      clearTimeout(timer);
    });
  }

  const registerPassengerAccount = async (email: string, pass: string, name: string): Promise<FirebaseUser> => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }
    if (!cleanName) {
      throw new Error('Please enter your full name.');
    }
    if (!pass || pass.length < 6) {
      throw new Error('Password must contain at least 6 characters.');
    }

    console.log('[ZAKA AUTH] registration:create-auth');

    // If currentUser is already authenticated with this exact email, reuse existing session
    if (auth.currentUser && auth.currentUser.email?.toLowerCase() === cleanEmail) {
      console.log('[ZAKA AUTH] registration:auth-created (reusing authenticated user)');
      return auth.currentUser;
    }

    let fbUser: FirebaseUser;
    try {
      const res = await withTimeout(
        createUserWithEmailAndPassword(auth, cleanEmail, pass),
        REGISTRATION_TIMEOUT_MS,
        'Account registration'
      );
      fbUser = res.user;
      console.log('[ZAKA AUTH] registration:auth-created');

      // Dispatch Firebase email verification link immediately
      try {
        await sendEmailVerification(fbUser);
        setVerificationEmailSent(true);
        console.log('[ZAKA AUTH] verification-email-dispatched to', cleanEmail);
      } catch (eErr) {
        console.warn('Note sending initial verification email:', eErr);
      }
    } catch (authErr: any) {
      // If the account was already created during a previous interrupted attempt,
      // authenticate using signInWithEmailAndPassword to recover the existing Firebase user session
      // so profile provisioning can proceed without duplicate account creation errors.
      if (authErr?.code === 'auth/email-already-in-use') {
        try {
          const signRes = await withTimeout(
            signInWithEmailAndPassword(auth, cleanEmail, pass),
            REGISTRATION_TIMEOUT_MS,
            'Account authentication'
          );
          fbUser = signRes.user;
          console.log('[ZAKA AUTH] registration:auth-created (reusing existing user)');
        } catch {
          throw new Error(getReadableAuthError(authErr));
        }
      } else {
        throw new Error(getReadableAuthError(authErr));
      }
    }

    // Update display name
    try {
      await withTimeout(
        updateProfile(fbUser, { displayName: cleanName }),
        REGISTRATION_TIMEOUT_MS,
        'Profile name update'
      );
    } catch (profileErr) {
      console.warn('Notice updating Auth profile name:', profileErr);
    }

    return fbUser;
  };

  const provisionPassengerProfile = async (
    uid: string,
    details: { name: string; phone: string; email: string; photoURL?: string }
  ): Promise<{ userProfile: UserProfile; passengerProfile: PassengerProfile }> => {
    if (!uid) {
      throw new Error('Missing authenticated user identity for profile provisioning.');
    }

    const cleanEmail = details.email.trim().toLowerCase();
    const cleanName = details.name.trim();

    // 1. Normalize and validate South African / international phone format
    const phoneVal = validatePhoneNumber(details.phone);
    if (!phoneVal.valid) {
      throw new Error(phoneVal.error || 'Please enter a valid South African mobile number.');
    }
    const normalizedPhone = phoneVal.normalized;

    // 2. Check phone uniqueness against global phone index
    const phoneCheck = await firestoreService.checkPhoneRegistered(normalizedPhone);
    if (phoneCheck.isRegistered && !phoneCheck.isOwn) {
      throw new Error('This phone number is already registered with ZAKA. Please log in to your existing account.');
    }

    // 3. Atomically reserve phone index in Firestore
    try {
      await firestoreService.claimPhoneIndex(normalizedPhone, uid);
    } catch (claimErr: any) {
      throw new Error(claimErr?.message || 'This phone number is already registered with ZAKA. Please log in to your existing account.');
    }

    const now = new Date().toISOString();
    const isVerified = Boolean(auth.currentUser?.emailVerified);

    const newUserProfile: UserProfile = {
      uid,
      name: cleanName,
      phone: normalizedPhone,
      email: cleanEmail,
      photoURL: details.photoURL || '',
      role: 'passenger',
      roles: ['passenger'],
      activeRole: 'passenger',
      emailVerified: isVerified,
      status: 'active',
      accountStatus: 'active',
      createdAt: now,
      updatedAt: now,
    };

    console.log('[ZAKA AUTH] registration:create-user-profile');
    try {
      await withTimeout(
        firestoreService.createUserProfile(newUserProfile),
        REGISTRATION_TIMEOUT_MS,
        'User profile provisioning'
      );
      console.log('[ZAKA AUTH] registration:user-profile-created');
    } catch (userErr: any) {
      console.error('[ZAKA AUTH] registration:failed', {
        stage: 'create-user-profile',
        code: userErr?.code,
        message: userErr?.message,
      });
      throw new Error("Your ZAKA account was created, but we couldn't finish setting up your profile. Please try again.");
    }

    console.log('[ZAKA AUTH] registration:create-passenger-profile');
    const pProf: PassengerProfile = {
      userId: uid,
      name: cleanName,
      phone: normalizedPhone,
      rating: 5.0,
      totalTrips: 0,
      walletBalance: 0,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await withTimeout(
        firestoreService.createOrUpdatePassenger(pProf),
        REGISTRATION_TIMEOUT_MS,
        'Passenger profile provisioning'
      );
      console.log('[ZAKA AUTH] registration:passenger-profile-created');
    } catch (passengerErr: any) {
      console.error('[ZAKA AUTH] registration:failed', {
        stage: 'create-passenger-profile',
        code: passengerErr?.code,
        message: passengerErr?.message,
      });
      throw new Error("Your ZAKA account was created, but we couldn't finish setting up your profile. Please try again.");
    }

    // Set authenticated state
    setUserProfile(newUserProfile);
    setPassengerProfile(pProf);
    setRawActiveRole('passenger');
    if (auth.currentUser) {
      setCurrentUser(auth.currentUser);
    }

    if (isRiderTarget) {
      notificationService.registerNativePush(uid).catch(() => {});
    }

    console.log('[ZAKA AUTH] registration:complete');
    return { userProfile: newUserProfile, passengerProfile: pProf };
  };

  const signUp = async (data: SignUpData) => {
    setLoading(true);
    isRegisteringRef.current = true;
    console.log('[ZAKA AUTH] registration:start');

    try {
      if (data.role === 'passenger' || isRiderTarget) {
        // Passengers must confirm their number by SMS code before an account is created
        if (!data.phoneVerificationToken) {
          throw new Error('Please verify your phone number with the SMS code before continuing.');
        }

        // Step 1: Real Firebase Auth account
        const user = await registerPassengerAccount(data.email, data.pass, data.name);

        // Step 2: Idempotent Firestore profile provisioning with phone normalization & uniqueness
        await provisionPassengerProfile(user.uid, {
          name: data.name,
          phone: data.phone,
          email: data.email,
          photoURL: data.photoURL,
        });

        // Step 3: The server records the confirmed number. If this fails the account still works and
        // the passenger is asked to verify the number again on the verification screen.
        try {
          const recorded = await phoneVerificationService.recordOnPassengerProfile(data.phoneVerificationToken);
          setPassengerProfile((prev) =>
            prev ? { ...prev, phone: recorded.phone, phoneVerified: true, phoneVerifiedAt: recorded.phoneVerifiedAt } : prev
          );
        } catch (phoneErr: any) {
          console.warn('[ZAKA AUTH] registration:phone-confirmation', phoneErr?.message);
        }
      } else if (data.role === 'driver') {
        const cleanEmail = data.email.trim().toLowerCase();
        const cleanName = data.name.trim();

        // 1. Normalize and check phone uniqueness BEFORE creating Auth account
        const phoneVal = validatePhoneNumber(data.phone);
        if (!phoneVal.valid) {
          throw new Error(phoneVal.error || 'Please enter a valid South African phone number.');
        }
        const normalizedPhone = phoneVal.normalized;

        const phoneCheck = await firestoreService.checkPhoneRegistered(normalizedPhone);
        if (phoneCheck.isRegistered && !phoneCheck.isOwn) {
          throw new Error('This phone number is already registered. Please sign in instead.');
        }

        const now = new Date().toISOString();

        let fbUser: FirebaseUser;
        if (auth.currentUser && auth.currentUser.email?.toLowerCase() === cleanEmail) {
          fbUser = auth.currentUser;
        } else {
          try {
            const res = await withTimeout(
              createUserWithEmailAndPassword(auth, cleanEmail, data.pass),
              REGISTRATION_TIMEOUT_MS,
              'Driver registration'
            );
            fbUser = res.user;

            // Dispatch verification email
            try {
              await sendEmailVerification(fbUser);
              setVerificationEmailSent(true);
            } catch (vErr) {
              console.warn('Note sending driver verification email:', vErr);
            }
          } catch (authErr: any) {
            if (authErr?.code === 'auth/email-already-in-use') {
              try {
                const signRes = await withTimeout(
                  signInWithEmailAndPassword(auth, cleanEmail, data.pass),
                  REGISTRATION_TIMEOUT_MS,
                  'Driver authentication'
                );
                fbUser = signRes.user;
              } catch {
                throw new Error(getReadableAuthError(authErr));
              }
            } else {
              throw new Error(getReadableAuthError(authErr));
            }
          }
        }

        // Remembered before any profile write so an interrupted sign-up is recovered as a Driver
        rememberRole(fbUser.uid, 'driver');

        // Atomically claim phone index
        try {
          await firestoreService.claimPhoneIndex(normalizedPhone, fbUser.uid);
        } catch (claimErr: any) {
          throw new Error(claimErr?.message || 'This phone number is already registered. Please sign in instead.');
        }

        try {
          await withTimeout(
            updateProfile(fbUser, { displayName: cleanName }),
            REGISTRATION_TIMEOUT_MS,
            'Driver display name update'
          );
        } catch {
          // ignore
        }

        // Registration always produces a Driver. Admin is never granted by the sign-up form.
        const assignedRoles: UserRole[] = ['driver'];
        const activeRole: UserRole = 'driver';

        const newUserProfile: UserProfile = {
          uid: fbUser.uid,
          name: cleanName,
          phone: normalizedPhone,
          email: cleanEmail,
          photoURL: data.photoURL || '',
          role: activeRole,
          roles: assignedRoles,
          activeRole,
          emailVerified: Boolean(fbUser.emailVerified),
          status: 'active',
          accountStatus: 'active',
          createdAt: now,
          updatedAt: now,
        };

        const dProf: DriverProfile = {
          userId: fbUser.uid,
          name: cleanName,
          phone: normalizedPhone,
          photoURL: data.photoURL || '',
          rating: 5.0,
          totalTrips: 0,
          online: false,
          available: false,
          verificationStatus: 'pending',
          currentLocation: {
            latitude: -26.1458,
            longitude: 28.0416,
            timestamp: Date.now(),
          },
          vehicle: data.vehicle
            ? {
                driverId: fbUser.uid,
                ...data.vehicle,
                status: 'pending',
              }
            : undefined,
          earningsToday: 0,
          earningsThisWeek: 0,
          totalEarnings: 0,
          createdAt: now,
          updatedAt: now,
        };

        await withTimeout(
          firestoreService.createUserProfile(newUserProfile),
          REGISTRATION_TIMEOUT_MS,
          'Driver user profile'
        );
        await withTimeout(
          firestoreService.createOrUpdateDriver(dProf),
          REGISTRATION_TIMEOUT_MS,
          'Driver profile'
        );
        if (data.vehicle) {
          await withTimeout(
            firestoreService.createOrUpdateVehicle({
              driverId: fbUser.uid,
              ...data.vehicle,
              status: 'pending',
            }),
            REGISTRATION_TIMEOUT_MS,
            'Driver vehicle'
          );
        }

        // Both documents were just written above, so they are used as-is instead of being read back
        setUserProfile(newUserProfile);
        setPassengerProfile(null);
        setDriverProfile(dProf);
        setRawActiveRole('driver');
        rememberRole(fbUser.uid, 'driver');
        setCurrentUser(fbUser);
      }
    } catch (err: any) {
      console.warn('[ZAKA AUTH] registration:status', { message: err?.message });
      throw err;
    } finally {
      isRegisteringRef.current = false;
      setLoading(false);
    }
  };

  const updateUserProfileData = async (data: Partial<UserProfile>) => {
    if (!userProfile?.uid) return;
    const uid = userProfile.uid;
    const changes: Partial<UserProfile> = { ...data };

    // Phone numbers are always stored in canonical form (+27821234567) and reserved for one account
    if (typeof changes.phone === 'string') {
      const phoneVal = validatePhoneNumber(changes.phone);
      if (!phoneVal.valid) {
        throw new Error(phoneVal.error || 'Please enter a valid South African mobile number.');
      }
      changes.phone = phoneVal.normalized;
      const previous = userProfile.phone ? normalizePhoneNumber(userProfile.phone) : '';
      if (changes.phone !== previous) {
        const check = await firestoreService.checkPhoneRegistered(changes.phone);
        if (check.isRegistered && !check.isOwn) {
          throw new Error('This phone number is already registered to another ZAKA account.');
        }
        await firestoreService.claimPhoneIndex(changes.phone, uid);
        if (previous) {
          await firestoreService.releasePhoneIndex(previous, uid);
        }
      }
    }

    // Only the changed fields are written: role, roles and verification flags are never re-sent
    await firestoreService.updateUserProfile(uid, changes);
    setUserProfile((prev) => (prev ? { ...prev, ...changes, updatedAt: new Date().toISOString() } : prev));
  };

  const updatePassengerProfileData = async (data: Partial<PassengerProfile>) => {
    if (!passengerProfile?.userId) return;
    // The wallet balance belongs to the backend and is never written from the app
    const { walletBalance: _serverOwned, ...changes } = data;
    if (typeof changes.phone === 'string') {
      changes.phone = normalizePhoneNumber(changes.phone);
    }
    await firestoreService.updatePassengerFields(passengerProfile.userId, changes);
    setPassengerProfile((prev) => (prev ? { ...prev, ...changes, updatedAt: new Date().toISOString() } : prev));
  };

  /**
   * Records a number the user has just confirmed by SMS code (see phoneVerificationService) on their
   * profile. 'phoneVerified' itself is written only by the server, after it checks the token.
   */
  const confirmVerifiedPhone = async ({ phone: verifiedPhone, verificationToken }: VerifiedPhone) => {
    const phone = normalizePhoneNumber(verifiedPhone);
    if (!phone) throw new Error('We could not confirm your phone number. Please try again.');
    // Reserves the number in phoneIndex for this account (and releases the previous one)
    await updateUserProfileData({ phone });
    if (!passengerProfile?.userId) return;
    const recorded = await phoneVerificationService.recordOnPassengerProfile(verificationToken);
    setPassengerProfile((prev) =>
      prev
        ? { ...prev, phone: recorded.phone, phoneVerified: true, phoneVerifiedAt: recorded.phoneVerifiedAt, updatedAt: recorded.phoneVerifiedAt }
        : prev
    );
  };

  const updateDriverProfileData = async (data: Partial<DriverProfile>) => {
    if (!driverProfile?.userId) return;
    const changes: Partial<DriverProfile> = { ...data };
    if (typeof changes.phone === 'string') {
      changes.phone = normalizePhoneNumber(changes.phone);
    }
    // Only the edited fields are written; approval, rating and earnings fields are admin / backend owned
    await firestoreService.updateDriverFields(driverProfile.userId, changes);
    setDriverProfile((prev) => (prev ? { ...prev, ...changes, updatedAt: new Date().toISOString() } : prev));
  };

  const signInDemoPersona = async (personaKey: 'amara' | 'sipho' | 'kofi' | 'chidi') => {
    if (!DEMO_MODE_ENABLED) {
      throw new Error(DEMO_DISABLED_MESSAGE);
    }
    setLoading(true);
    isSigningInDemoRef.current = true;
    try {
      const persona = DEMO_PERSONAS[personaKey];
      if (!persona) {
        throw new Error(`Demo persona "${personaKey}" not found`);
      }

      // 1. If currently signed in, sign out cleanly to ensure fresh anonymous session
      if (auth.currentUser) {
        try {
          await firebaseSignOut(auth);
        } catch (e) {
          console.warn('Sign out note prior to demo sign-in:', e);
        }
      }

      // 2. Authenticate session anonymously with Firebase Auth (or fallback to dedicated demo credentials)
      let userCredential;
      try {
        userCredential = await signInAnonymously(auth);
      } catch (authErr: any) {
        console.warn('signInAnonymously unavailable, using dedicated demo credential:', authErr.code);
        if (DEMO_IDENTITIES[personaKey] && DEMO_ACCOUNT_PASSWORD) {
          userCredential = await signInWithEmailAndPassword(
            auth,
            DEMO_IDENTITIES[personaKey].email,
            DEMO_IDENTITIES[personaKey].pass
          );
        } else {
          throw authErr;
        }
      }

      const anonUid = userCredential.user.uid;
      const nowIso = new Date().toISOString();

      // 3. Prepare demo data with anonUid, isDemo: true, and demoPersona
      const demoUser: UserProfile = {
        ...persona.userProfile,
        uid: anonUid,
        isDemo: true,
        demoPersona: personaKey,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      let demoPassenger: PassengerProfile | null = null;
      let demoDriver: DriverProfile | null = null;

      if (persona.passengerProfile) {
        demoPassenger = {
          ...persona.passengerProfile,
          userId: anonUid,
          isDemo: true,
          demoPersona: personaKey,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
      }

      if (persona.driverProfile) {
        demoDriver = {
          ...persona.driverProfile,
          userId: anonUid,
          isDemo: true,
          demoPersona: personaKey,
          vehicle: persona.driverProfile.vehicle
            ? {
                ...persona.driverProfile.vehicle,
                driverId: anonUid,
              }
            : undefined,
          online: true,
          available: true,
          verificationStatus: 'approved',
          currentLocation: {
            latitude: persona.driverProfile.currentLocation?.latitude || -26.142,
            longitude: persona.driverProfile.currentLocation?.longitude || 28.046,
            timestamp: Date.now(),
          },
          createdAt: nowIso,
          updatedAt: nowIso,
        };
      }

      // 4. Save to Firestore so real queries, listeners, and transactions work reliably
      await firestoreService.createUserProfile(demoUser);
      if (demoPassenger) {
        await firestoreService.createOrUpdatePassenger(demoPassenger);
      }
      if (demoDriver) {
        await firestoreService.createOrUpdateDriver(demoDriver);
      }

      // 5. Update local React state
      setCurrentUser(userCredential.user);
      setUserProfile(demoUser);
      setActiveRole(demoUser.role || 'passenger');
      setPassengerProfile(demoPassenger);
      setDriverProfile(demoDriver);

      if (personaKey === 'amara' || personaKey === 'sipho') {
        setIsDemoTestMode(true);
        setActiveDemoPersona(personaKey);
        try {
          sessionStorage.setItem('zaka_demo_test_mode', 'true');
          sessionStorage.setItem('zaka_active_demo_persona', personaKey);
        } catch (e) {
          // ignore
        }
      }
    } catch (err: any) {
      console.error('Failed to sign in demo persona:', err);
      throw err;
    } finally {
      isSigningInDemoRef.current = false;
      setLoading(false);
    }
  };

  const switchDemoTestPersona = async (targetPersona: 'amara' | 'sipho') => {
    if (!DEMO_MODE_ENABLED || !DEMO_ACCOUNT_PASSWORD) {
      throw new Error(DEMO_DISABLED_MESSAGE);
    }
    setLoading(true);
    isSigningInDemoRef.current = true;
    try {
      const demoAccount = DEMO_IDENTITIES[targetPersona];
      const userCredential = await signInWithEmailAndPassword(
        auth,
        demoAccount.email,
        demoAccount.pass
      );
      const uid = userCredential.user.uid;
      setCurrentUser(userCredential.user);

      if (targetPersona === 'amara') {
        const uProf = await firestoreService.getUserProfile(uid);
        const pProf = await firestoreService.getPassengerProfile(uid);
        setUserProfile(
          uProf || {
            uid,
            name: demoAccount.name,
            email: demoAccount.email,
            phone: '+27 82 123 4567',
            role: 'passenger',
            status: 'active',
            isDemo: true,
            demoPersona: 'amara',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        );
        setPassengerProfile(
          pProf || {
            userId: uid,
            name: demoAccount.name,
            phone: '+27 82 123 4567',
            rating: 4.95,
            totalTrips: 18,
            walletBalance: 250.0,
            isDemo: true,
            demoPersona: 'amara',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        );
        setDriverProfile(null);
        setActiveRole('passenger');
      } else {
        const uProf = await firestoreService.getUserProfile(uid);
        const dProf = await firestoreService.getDriverProfile(uid);
        setUserProfile(
          uProf || {
            uid,
            name: demoAccount.name,
            email: demoAccount.email,
            phone: '+27 71 234 5678',
            role: 'driver',
            status: 'active',
            isDemo: true,
            demoPersona: 'sipho',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        );
        setDriverProfile(
          dProf || {
            userId: uid,
            name: demoAccount.name,
            phone: '+27 71 234 5678',
            rating: 4.88,
            totalTrips: 42,
            online: true,
            available: true,
            verificationStatus: 'approved',
            vehicle: {
              driverId: uid,
              make: 'Toyota',
              model: 'Corolla Quest',
              year: 2021,
              colour: 'White',
              registrationNumber: 'ND 824-912',
              vehicleType: 'economy',
              passengerCapacity: 4,
              status: 'active',
            },
            currentLocation: {
              latitude: -26.115,
              longitude: 28.052,
              timestamp: Date.now(),
            },
            earningsToday: 540.0,
            earningsThisWeek: 3200.0,
            totalEarnings: 14500.0,
            isDemo: true,
            demoPersona: 'sipho',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        );
        setPassengerProfile(null);
        setActiveRole('driver');
      }

      setIsDemoTestMode(true);
      setActiveDemoPersona(targetPersona);
      try {
        sessionStorage.setItem('zaka_demo_test_mode', 'true');
        sessionStorage.setItem('zaka_active_demo_persona', targetPersona);
      } catch (e) {
        // ignore
      }
    } catch (err) {
      console.error('Failed to switch demo persona:', err);
      throw err;
    } finally {
      isSigningInDemoRef.current = false;
      setLoading(false);
    }
  };

  const startDemoTestMode = async (initialPersona: 'amara' | 'sipho' = 'amara') => {
    if (!isDemoEnabled) {
      console.warn('[ZAKA] Demo mode is disabled. Set VITE_ENABLE_DEMO_MODE=true to enable.');
      return;
    }
    setIsDemoTestMode(true);
    try {
      sessionStorage.setItem('zaka_demo_test_mode', 'true');
    } catch (e) {
      // ignore
    }
    await switchDemoTestPersona(initialPersona);
  };

  const resetDemoRide = async () => {
    if (!DEMO_MODE_ENABLED) return;
    try {
      if (activeDemoRideId) {
        const ride = await firestoreService.getRide(activeDemoRideId);
        if (ride && (ride.status === 'searching' || ride.status === 'accepted')) {
          await firestoreService.cancelRide(activeDemoRideId, 'Reset by demo tester');
        }
      }
      setActiveDemoRideId(null);
      try {
        sessionStorage.setItem('zaka_demo_reset_time', Date.now().toString());
      } catch (e) {
        // ignore
      }

      // Ensure Sipho is available and online
      try {
        await firestoreService.toggleDriverOnlineStatus(DEMO_IDENTITIES.sipho.uid, true);
      } catch (e) {
        console.warn('Driver online toggle note:', e);
      }
    } catch (err) {
      console.error('Error resetting demo ride:', err);
    }
  };

  const exitDemoTestMode = async () => {
    setIsDemoTestMode(false);
    setActiveDemoPersona(null);
    setActiveDemoRideId(null);
    try {
      sessionStorage.removeItem('zaka_demo_test_mode');
      sessionStorage.removeItem('zaka_active_demo_persona');
      sessionStorage.removeItem('zaka_active_demo_ride_id');
      sessionStorage.removeItem('zaka_demo_reset_time');
    } catch (e) {
      // ignore
    }
    await signOut();
  };

  const signOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      // 1. If currently active as an online driver, toggle offline in Firestore first
      if (driverProfile?.userId && driverProfile.online) {
        try {
          await firestoreService.toggleDriverOnlineStatus(driverProfile.userId, false);
        } catch (offlineErr) {
          console.warn('Note setting driver offline on sign out:', offlineErr);
        }
      }

      // 2. Await Firebase Auth signOut
      await firebaseSignOut(auth);
    } catch (err: any) {
      console.warn('Firebase signOut note:', err);
    } finally {
      // 3. Clear all user session and role state in memory
      setCurrentUser(null);
      setUserProfile(null);
      setPassengerProfile(null);
      setDriverProfile(null);
      setActiveRole(null);
      setIsDemoTestMode(false);
      setActiveDemoPersona(null);
      setActiveDemoRideId(null);
      try {
        sessionStorage.removeItem('zaka_demo_test_mode');
        sessionStorage.removeItem('zaka_active_demo_persona');
        sessionStorage.removeItem('zaka_active_demo_ride_id');
      } catch (e) {
        // ignore
      }
      setIsSigningOut(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        passengerProfile,
        driverProfile,
        loading,
        isSigningOut,
        roles,
        activeRole,
        isAdmin,
        isEmailVerified,
        verificationEmailSent,
        setVerificationEmailSent,
        isDemoTestMode,
        activeDemoPersona,
        activeDemoRideId,
        setActiveDemoRideId,
        startDemoTestMode,
        switchDemoTestPersona,
        resetDemoRide,
        exitDemoTestMode,
        setActiveRole,
        switchActiveRole,
        becomeDriver,
        sendVerificationEmail,
        checkEmailVerification,
        signIn,
        signUp,
        registerPassengerAccount,
        provisionPassengerProfile,
        signInWithGoogle,
        signInWithApple,
        confirmVerifiedPhone,
        deleteAccount,
        resetPassword,
        updateUserProfileData,
        updatePassengerProfileData,
        updateDriverProfileData,
        signInDemoPersona,
        signOut,
        refreshProfiles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
