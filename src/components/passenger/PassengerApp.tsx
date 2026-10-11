/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Passenger Application
 * Visuals: Clean white panels, bold black route, bright yellow #FFC107 action buttons & accents
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { firestoreService, VEHICLE_CONFIGS } from '../../firebase/firestoreService';
import { hapticsService } from '../../services/hapticsService';
import {
  RideDocument,
  LocationCoordinates,
  PassengerLocation,
  VehicleType,
  PaymentMethod,
  FareBreakdown,
  UserRole,
} from '../../types';
import { InteractiveMap } from '../common/InteractiveMap';
import { PassengerHome } from './PassengerHome';
import { ActiveRidePanel } from './ActiveRidePanel';
import { CompletedRideScreen } from './CompletedRideScreen';
import { GlassSelectorNav, NavTabId } from '../common/GlassSelectorNav';
import { PassengerWalletModal } from './PassengerWalletModal';
import { RideHistoryModal } from './RideHistoryModal';
import { ZakaWelcomeScreen } from './ZakaWelcomeScreen';
import { paymentService } from '../../services/paymentService';
import { fareService } from '../../services/fareService';
import { onGoHome } from '../../utils/appEvents';

interface PassengerAppProps {
  onOpenProfile?: () => void;
  onOpenHistory?: () => void;
  onOpenAuth?: (mode?: 'signin' | 'signup' | 'forgot', role?: UserRole) => void;
  isProfileOpen?: boolean;
  onCloseProfile?: () => void;
  isHistoryOpen?: boolean;
  onCloseHistory?: () => void;
}

export const PassengerApp: React.FC<PassengerAppProps> = ({
  onOpenProfile,
  onOpenHistory,
  onOpenAuth,
  isProfileOpen,
  onCloseProfile,
  isHistoryOpen,
  onCloseHistory,
}) => {
  const {
    currentUser,
    userProfile,
    passengerProfile,
    activeDemoRideId,
    setActiveDemoRideId,
    isDemoTestMode,
  } = useAuth();

  const isAuthenticated = Boolean(currentUser || userProfile);

  // Active ride tracking from Firestore
  const [activeRideId, setActiveRideId] = useState<string | null>(activeDemoRideId || null);
  const [activeRide, setActiveRide] = useState<RideDocument | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // iPhone Glass Navigation State
  const [activeNavTab, setActiveNavTab] = useState<NavTabId>('home');
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [isInternalHistoryOpen, setIsInternalHistoryOpen] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('cash');
  const [walletNotice, setWalletNotice] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  // Returning from VodaPay secure checkout after a wallet top-up: confirm it with the server
  useEffect(() => {
    if (!userProfile?.uid) return;
    const params = new URLSearchParams(window.location.search);
    const topupId = params.get('walletTopup');
    if (!topupId || params.get('paymentReturn') !== 'true') return;

    window.history.replaceState({}, document.title, window.location.pathname);
    setWalletNotice('Confirming your top-up…');
    setIsWalletOpen(true);
    setActiveNavTab('wallet');

    // VodaPay confirms to the server separately from this browser redirect, so the confirmation can
    // land a few seconds later: check a handful of times before giving up.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = (attempt: number) => {
      paymentService.verifyWalletTopup(topupId).then((res) => {
        if (cancelled) return;
        if (res.success || attempt >= 6) {
          setWalletNotice(res.message);
          return;
        }
        timer = setTimeout(() => check(attempt + 1), 5000);
      });
    };
    check(1);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [userProfile?.uid]);

  // Ride request errors dismiss themselves
  useEffect(() => {
    if (!requestError) return;
    const timer = setTimeout(() => setRequestError(null), 12000);
    return () => clearTimeout(timer);
  }, [requestError]);

  // ZAKA logo pressed: back to the Home tab with the wallet and trip history closed
  useEffect(
    () =>
      onGoHome(() => {
        setActiveNavTab('home');
        setIsWalletOpen(false);
        setIsInternalHistoryOpen(false);
        setWalletNotice(null);
      }),
    []
  );

  // When Profile is closed or dismissed, explicitly set the active navigation tab to: "home"
  useEffect(() => {
    if (!isProfileOpen && activeNavTab === 'profile') {
      setActiveNavTab('home');
    }
  }, [isProfileOpen, activeNavTab]);

  // When History modal is closed or dismissed, explicitly ensure active tab resets from rides to home
  useEffect(() => {
    if (!isHistoryOpen && !isInternalHistoryOpen && activeNavTab === 'rides') {
      setActiveNavTab('home');
    }
  }, [isHistoryOpen, isInternalHistoryOpen, activeNavTab]);

  const handleNavChange = (tab: NavTabId) => {
    setActiveNavTab(tab);
    if (tab === 'home') {
      setIsWalletOpen(false);
      setIsInternalHistoryOpen(false);
      if (isProfileOpen && onCloseProfile) {
        onCloseProfile();
      }
      if (isHistoryOpen && onCloseHistory) {
        onCloseHistory();
      }
    } else if (tab === 'rides') {
      setIsWalletOpen(false);
      if (isProfileOpen && onCloseProfile) {
        onCloseProfile();
      }
      if (!userProfile?.uid) {
        onOpenAuth?.('signin', 'passenger');
        setActiveNavTab('home');
        return;
      }
      if (onOpenHistory) {
        onOpenHistory();
      } else {
        setIsInternalHistoryOpen(true);
      }
    } else if (tab === 'wallet') {
      setIsInternalHistoryOpen(false);
      if (isProfileOpen && onCloseProfile) {
        onCloseProfile();
      }
      if (isHistoryOpen && onCloseHistory) {
        onCloseHistory();
      }
      if (!userProfile?.uid) {
        onOpenAuth?.('signin', 'passenger');
        setActiveNavTab('home');
        return;
      }
      setIsWalletOpen(true);
    } else if (tab === 'profile') {
      setIsWalletOpen(false);
      setIsInternalHistoryOpen(false);
      if (isHistoryOpen && onCloseHistory) {
        onCloseHistory();
      }
      if (!userProfile?.uid) {
        onOpenAuth?.('signin', 'passenger');
        setActiveNavTab('home');
        return;
      }
      if (onOpenProfile) {
        onOpenProfile();
      }
    }
  };

  // Sync activeDemoRideId from context
  useEffect(() => {
    if (activeDemoRideId && activeDemoRideId !== activeRideId) {
      setActiveRideId(activeDemoRideId);
    } else if (!activeDemoRideId && activeRide?.status === 'completed') {
      setActiveRide(null);
      setActiveRideId(null);
    }
  }, [activeDemoRideId]);

  const previousRideStatusRef = useRef<string | null>(null);

  // Listen to passenger's active ride in real time from Firestore
  useEffect(() => {
    if (!userProfile?.uid) return;

    const resetTimestamp = sessionStorage.getItem('zaka_demo_reset_time')
      ? Number(sessionStorage.getItem('zaka_demo_reset_time'))
      : 0;

    const unsubscribe = firestoreService.listenToPassengerRides(
      userProfile.uid,
      (rides) => {
        // Filter out rides requested before the last demo reset if resetTimestamp exists
        const validRides = rides.filter((r) => {
          if (!resetTimestamp) return true;
          const reqTime = new Date(r.requestedAt).getTime();
          return reqTime > resetTimestamp || r.id === activeDemoRideId;
        });

        // Find most recent active ride if any
        const currentActive = validRides.find(
          (r) =>
            r.status === 'searching' ||
            r.status === 'accepted' ||
            r.status === 'driver_arriving' ||
            r.status === 'driver_arrived' ||
            r.status === 'in_progress'
        );

        if (currentActive) {
          // Tactile haptic feedback on important status milestones
          if (previousRideStatusRef.current !== currentActive.status) {
            if (currentActive.status === 'accepted' || currentActive.status === 'driver_arrived') {
              hapticsService.success().catch(() => {});
            }
            previousRideStatusRef.current = currentActive.status;
          }

          setActiveRideId(currentActive.id);
          setActiveRide(currentActive);
          if (isDemoTestMode && !activeDemoRideId) {
            setActiveDemoRideId(currentActive.id);
          }
        } else if (activeRideId || activeDemoRideId) {
          // If we had an active ride that just completed
          const targetId = activeRideId || activeDemoRideId;
          const justCompleted = validRides.find((r) => r.id === targetId && r.status === 'completed');
          if (justCompleted) {
            if (previousRideStatusRef.current !== 'completed') {
              hapticsService.success().catch(() => {});
              previousRideStatusRef.current = 'completed';
            }
            setActiveRide(justCompleted);
          } else {
            previousRideStatusRef.current = null;
            setActiveRide(null);
            setActiveRideId(null);
          }
        } else {
          previousRideStatusRef.current = null;
          setActiveRide(null);
          setActiveRideId(null);
        }
      }
    );

    return () => unsubscribe();
  }, [userProfile?.uid, activeRideId, activeDemoRideId, isDemoTestMode]);

  // Cancel requested ride
  const handleCancelRide = async () => {
    if (!activeRide?.id) return;
    setIsCancelling(true);
    try {
      await hapticsService.warning();
      await firestoreService.cancelRide(activeRide.id, 'Passenger cancelled request');
      setActiveRide(null);
      setActiveRideId(null);
      if (activeDemoRideId) {
        setActiveDemoRideId(null);
      }
      previousRideStatusRef.current = null;
    } catch (err) {
      console.error('Cancellation error:', err);
    } finally {
      setIsCancelling(false);
    }
  };

  // Retry searching ride with refreshed priority timestamp
  const handleRetryRide = async () => {
    if (!activeRide?.id) return;
    try {
      await firestoreService.retryRideSearch(activeRide.id);
    } catch (err) {
      console.error('Retry ride search error:', err);
    }
  };

  // Create real ride request in Firestore
  const handleConfirmRideRequest = async (details: {
    pickup: PassengerLocation;
    destination: { address: string; coordinates: LocationCoordinates; name?: string };
    rideType: VehicleType;
    estimatedFare: number;
    distanceKm: number;
    durationMin: number;
    paymentMethod: PaymentMethod;
    fareBreakdown?: FareBreakdown;
  }) => {
    if (!userProfile?.uid) {
      onOpenAuth?.();
      return;
    }
    // A second tap while the first request is still being created must not book a second ride
    if (isRequesting) return;

    setRequestError(null);

    // The driver must be able to reach the passenger: a real contact number is required
    if (!userProfile.phone || !/^\+\d{9,15}$/.test(userProfile.phone.replace(/\s/g, ''))) {
      setRequestError('Please add your mobile number in your Profile before requesting a ride.');
      onOpenProfile?.();
      return;
    }

    // Wallet rides need enough balance to cover the quoted fare
    if (details.paymentMethod === 'wallet' && !userProfile.isDemo) {
      const balance = passengerProfile?.walletBalance ?? 0;
      if (balance < details.estimatedFare) {
        setRequestError(
          `Your wallet balance (${fareService.formatZAR(balance)}) does not cover this ${fareService.formatZAR(details.estimatedFare)} fare. Top up your wallet or choose cash.`
        );
        return;
      }
    }

    setIsRequesting(true);
    try {
      // The Safety PIN is generated and stored privately by createRideRequest
      const rideId = await firestoreService.createRideRequest({
        passengerId: userProfile.uid,
        passengerName: userProfile.name || 'Passenger',
        passengerPhone: userProfile.phone,
        isDemo: userProfile.isDemo || false,
        demoPersona: userProfile.demoPersona,
        pickupAddress: details.pickup.address,
        pickupLocation: {
          latitude: details.pickup.latitude,
          longitude: details.pickup.longitude,
        },
        destinationAddress: details.destination.address,
        destinationLocation: details.destination.coordinates,
        rideType: details.rideType,
        estimatedFare: details.estimatedFare,
        estimatedDistanceKm: details.distanceKm,
        estimatedDurationMin: details.durationMin,
        paymentMethod: details.paymentMethod,
        paymentStatus: 'pending',
        status: 'searching',
        requestedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      setActiveRideId(rideId);
      if (isDemoTestMode || userProfile.isDemo) {
        setActiveDemoRideId(rideId);
      }
    } catch (err: any) {
      console.error('Error creating ride request:', err);
      const msg = String(err?.message || '');
      setRequestError(
        msg && !msg.startsWith('{')
          ? msg
          : 'We could not request your ride. Please check your connection and try again.'
      );
    } finally {
      setIsRequesting(false);
    }
  };

  const renderWalletAndHistoryModals = () => (
    <>
      <PassengerWalletModal
        isOpen={isWalletOpen}
        onClose={() => {
          setIsWalletOpen(false);
          setWalletNotice(null);
          setActiveNavTab('home');
        }}
        initialNotice={walletNotice}
        currentPaymentMethod={selectedPaymentMethod}
        onSelectPaymentMethod={(m) => setSelectedPaymentMethod(m)}
      />
      <RideHistoryModal
        isOpen={isInternalHistoryOpen}
        onClose={() => {
          setIsInternalHistoryOpen(false);
          setActiveNavTab('home');
        }}
      />
      {requestError && (
        <div
          id="ride-request-error"
          role="alert"
          onClick={() => setRequestError(null)}
          className="fixed left-4 right-4 top-20 z-[60] mx-auto max-w-md cursor-pointer rounded-card border border-red-200 bg-red-50 p-3.5 text-xs font-bold text-danger shadow-raised"
        >
          {requestError}
        </div>
      )}
    </>
  );

  // Signed-Out View: Clean ZAKA Welcome Screen (No bottom nav, no trip history, no authenticated widgets)
  if (!isAuthenticated) {
    return (
      <ZakaWelcomeScreen
        onSignIn={() => onOpenAuth?.('signin')}
        onSignUp={() => onOpenAuth?.('signup')}
      />
    );
  }

  // When no ride is active in Firestore, render the primary PassengerHome with bottom glass nav
  if (
    !activeRide ||
    (activeRide.status !== 'searching' &&
      activeRide.status !== 'accepted' &&
      activeRide.status !== 'driver_arriving' &&
      activeRide.status !== 'driver_arrived' &&
      activeRide.status !== 'in_progress' &&
      activeRide.status !== 'completed')
  ) {
    return (
      <div className="relative flex-1 flex flex-col w-full h-full min-h-0 overflow-hidden bg-white">
        <PassengerHome
          onOpenMenu={onOpenProfile}
          onOpenProfile={onOpenProfile}
          onOpenHistory={onOpenHistory || (() => setIsInternalHistoryOpen(true))}
          onOpenWallet={() => handleNavChange('wallet')}
          onConfirmRideReady={handleConfirmRideRequest}
          requestError={requestError}
        />

        {/* iPhone-Style Frosted Glass Floating Navigation */}
        <GlassSelectorNav activeTab={activeNavTab} onTabChange={handleNavChange} />

        {renderWalletAndHistoryModals()}
      </div>
    );
  }

  // Active Ride or Completed State View
  return (
    <div
      id="passenger-main-container"
      className="relative flex flex-1 w-full flex-col min-h-0 bg-white lg:flex-row lg:h-[calc(100dvh-61px)] lg:overflow-hidden"
    >
      {/* MAP VIEW CONTAINER */}
      <div className="relative h-[38vh] min-h-[220px] max-h-[360px] w-full shrink-0 lg:h-full lg:flex-1 lg:max-h-none min-h-0">
        <InteractiveMap
          pickupLocation={{
            latitude: activeRide.pickupLocation.latitude,
            longitude: activeRide.pickupLocation.longitude,
            address: activeRide.pickupAddress,
          }}
          destinationLocation={{
            latitude: activeRide.destinationLocation.latitude,
            longitude: activeRide.destinationLocation.longitude,
            address: activeRide.destinationAddress,
          }}
          activeRide={activeRide}
          mode="passenger"
          isDemo={Boolean(userProfile?.isDemo || activeRide?.isDemo)}
        />
      </div>

      {/* BOTTOM FLOATING PANEL */}
      <div className="z-20 flex flex-1 flex-col overflow-y-auto rounded-t-sheet border-t border-line bg-white p-4 shadow-card sm:p-6 lg:h-full lg:max-w-md lg:rounded-none lg:border-t-0 lg:border-l pb-28 sm:pb-32">
        {activeRide && activeRide.status !== 'completed' ? (
          <ActiveRidePanel
            ride={activeRide}
            onCancelRide={handleCancelRide}
            onRetryRide={handleRetryRide}
            isCancelling={isCancelling}
          />
        ) : activeRide && activeRide.status === 'completed' ? (
          <CompletedRideScreen
            ride={activeRide}
            onDone={() => {
              setActiveRide(null);
              setActiveRideId(null);
              setActiveDemoRideId(null);
            }}
          />
        ) : null}
      </div>

      {/* iPhone-Style Frosted Glass Floating Navigation */}
      <GlassSelectorNav activeTab={activeNavTab} onTabChange={handleNavChange} />

      {renderWalletAndHistoryModals()}
    </div>
  );
};
