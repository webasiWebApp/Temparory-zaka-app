/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Driver Application
 * Visuals: Mobile-first, bold black & #FFC107 yellow, clean white cards, real-time dispatch
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { firestoreService } from '../../firebase/firestoreService';
import {
  DriverProfile,
  RideDocument,
  PaymentRecord,
  LocationCoordinates,
  GpsTrackingState,
} from '../../types';
import { fareService } from '../../services/fareService';
import { earningsService } from '../../services/earningsService';
import { mapService, TELEMETRY_THRESHOLDS } from '../../services/mapService';
import { locationService } from '../../services/locationService';
import { InteractiveMap } from '../common/InteractiveMap';
import { DriverPendingScreen } from './DriverPendingScreen';
import { IncomingRideCard } from './IncomingRideCard';
import { DriverActiveRideScreen } from './DriverActiveRideScreen';
import { DriverCompletedScreen } from './DriverCompletedScreen';
import {
  Power,
  DollarSign,
  Star,
  CheckCircle2,
  Navigation,
  MapPin,
  Car,
  Clock,
  Phone,
  Shield,
  ShieldCheck,
  AlertCircle,
  TrendingUp,
  Award,
  ChevronRight,
  Sparkles,
  Banknote,
  CreditCard,
  Smartphone,
  Calendar,
  Layers,
  ArrowUpRight,
  Filter,
  Satellite,
  Radio,
  WifiOff,
  LocateFixed,
} from 'lucide-react';

export const DriverApp: React.FC = () => {
  const {
    userProfile,
    driverProfile,
    refreshProfiles,
    activeDemoRideId,
    setActiveDemoRideId,
    isDemoTestMode,
  } = useAuth();

  // If driver verification is pending or rejected, show pending review screen
  if (!driverProfile || driverProfile.verificationStatus !== 'approved') {
    return <DriverPendingScreen />;
  }

  const [isOnline, setIsOnline] = useState<boolean>(driverProfile?.online ?? true);
  const [activeTrip, setActiveTrip] = useState<RideDocument | null>(null);
  const [justCompletedTrip, setJustCompletedTrip] = useState<RideDocument | null>(null);
  const [incomingRequests, setIncomingRequests] = useState<RideDocument[]>([]);
  const [isAccepting, setIsAccepting] = useState<boolean>(false);
  const [viewTab, setViewTab] = useState<'console' | 'earnings' | 'history'>('console');

  // Clear active/completed trips when activeDemoRideId is cleared in demo mode
  useEffect(() => {
    if (isDemoTestMode && !activeDemoRideId) {
      setActiveTrip(null);
      setJustCompletedTrip(null);
    }
  }, [isDemoTestMode, activeDemoRideId]);

  // Completed rides history & payments for driver
  const [driverHistory, setDriverHistory] = useState<RideDocument[]>([]);
  const [driverPayments, setDriverPayments] = useState<PaymentRecord[]>([]);
  const [selectedHistoryRide, setSelectedHistoryRide] = useState<RideDocument | null>(null);

  // Driver current coordinates (Rosebank / Sandton initial default)
  const [driverLocation, setDriverLocation] = useState<LocationCoordinates>({
    latitude: driverProfile?.currentLocation?.latitude || -26.1420,
    longitude: driverProfile?.currentLocation?.longitude || 28.0460,
  });

  const driverLocationRef = useRef<LocationCoordinates>(driverLocation);
  useEffect(() => {
    driverLocationRef.current = driverLocation;
  }, [driverLocation]);

  const activeTripIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeTripIdRef.current = activeTrip?.id || null;
  }, [activeTrip?.id]);

  const userProfileUidRef = useRef<string | null>(null);
  useEffect(() => {
    userProfileUidRef.current = userProfile?.uid || null;
  }, [userProfile?.uid]);

  const isDemo = Boolean(userProfile?.isDemo || userProfile?.uid?.startsWith('demo-') || isDemoTestMode);
  const [gpsState, setGpsState] = useState<GpsTrackingState>('LOCATION_REQUESTING');
  const [gpsErrorMsg, setGpsErrorMsg] = useState<string | null>(null);
  const [isSimulatingGps, setIsSimulatingGps] = useState<boolean>(isDemo);
  const [toggleOnlineError, setToggleOnlineError] = useState<string | null>(null);

  // Sync online status with driverProfile
  useEffect(() => {
    if (driverProfile) {
      setIsOnline(driverProfile.online);
    }
  }, [driverProfile]);

  // Toggle online/offline status in Firestore
  const handleToggleOnline = async () => {
    if (!userProfile?.uid) return;
    setToggleOnlineError(null);
    const newStatus = !isOnline;

    // Production security & reliability check:
    // When going online in production, require active GPS lock
    if (newStatus && !isDemo) {
      if (!('geolocation' in navigator)) {
        setToggleOnlineError('Geolocation is not supported on this browser or mobile device.');
        return;
      }
      try {
        setGpsState('LOCATION_REQUESTING');
        const fix = await locationService.getCurrentPosition();
        const freshCoords = {
          latitude: fix.latitude,
          longitude: fix.longitude,
        };
        setDriverLocation(freshCoords);
        setGpsState('LOCATION_GRANTED');
        setGpsErrorMsg(null);

        await firestoreService.toggleDriverOnlineStatus(userProfile.uid, true, freshCoords);
        setIsOnline(true);
        await refreshProfiles();
        return;
      } catch (err: any) {
        setGpsState('LOCATION_DENIED');
        const msg = err.message || 'Cannot go online without GPS. Please allow location permissions in your browser.';
        setGpsErrorMsg(msg);
        setToggleOnlineError(msg);
        return;
      }
    }

    try {
      await firestoreService.toggleDriverOnlineStatus(userProfile.uid, newStatus, driverLocation);
      setIsOnline(newStatus);
      await refreshProfiles();
    } catch (err: any) {
      console.error('Failed to toggle online status:', err);
      setToggleOnlineError(err.message || 'Could not update online status. Please check driver verification.');
    }
  };

  // Production GPS tracking using real device geolocation
  useEffect(() => {
    if (!isOnline || isSimulatingGps) {
      return;
    }

    if (!('geolocation' in navigator)) {
      setGpsState('LOCATION_UNAVAILABLE');
      setGpsErrorMsg('GPS is not supported on this device or browser.');
      return;
    }

    setGpsState('LOCATION_REQUESTING');
    let watchId: number | null = null;
    let staleTimeout: NodeJS.Timeout | null = null;

    const armStaleTimer = () => {
      if (staleTimeout) clearTimeout(staleTimeout);
      staleTimeout = setTimeout(() => {
        setGpsState('LOCATION_STALE');
      }, TELEMETRY_THRESHOLDS.STALE_LOCATION_MS);
    };

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        // Discard stale cached fix from device
        if (pos.timestamp && Date.now() - pos.timestamp > 20000) {
          return;
        }

        // Reject poor accuracy fixes (> 100m is too coarse for street dispatch)
        if (pos.coords.accuracy && pos.coords.accuracy > 100) {
          console.warn('GPS fix rejected due to low accuracy (> 100m):', pos.coords.accuracy);
          return;
        }

        // Validate coordinate bounds
        if (
          isNaN(pos.coords.latitude) ||
          isNaN(pos.coords.longitude) ||
          pos.coords.latitude < -90 ||
          pos.coords.latitude > 90 ||
          pos.coords.longitude < -180 ||
          pos.coords.longitude > 180
        ) {
          return;
        }

        const coords: LocationCoordinates = {
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        };

        // Jump rejection (anomalous teleportation > 5000m)
        const currentLoc = driverLocationRef.current;
        if (currentLoc && currentLoc.latitude !== 0) {
          const jumpDist = mapService.distanceMeters(currentLoc, coords);
          if (jumpDist > 5000) {
            console.warn('Discarding extreme GPS jump anomaly:', jumpDist, 'meters');
            return;
          }
        }

        // Always update local state immediately for responsive local rendering
        setDriverLocation(coords);
        setGpsState('LOCATION_GRANTED');
        setGpsErrorMsg(null);
        armStaleTimer();

        // Persist to Firestore with 15m / 10s throttling
        const uid = userProfileUidRef.current;
        if (uid) {
          firestoreService.updateDriverLocationAndRide(
            uid,
            coords,
            activeTripIdRef.current,
            false // throttled
          );
        }
      },
      (err) => {
        console.warn('Driver device GPS watch error:', err);
        if (err.code === 1) {
          setGpsState('LOCATION_DENIED');
          setGpsErrorMsg('Location permission denied. Enable GPS in browser permissions to receive passenger dispatch.');
        } else if (err.code === 2) {
          setGpsState('LOCATION_UNAVAILABLE');
          setGpsErrorMsg('Your GPS location is temporarily unavailable.');
        } else {
          setGpsState('LOCATION_ERROR');
          setGpsErrorMsg('GPS signal timeout. Retrying satellite lock...');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      }
    );

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (staleTimeout) clearTimeout(staleTimeout);
    };
  }, [isOnline, isSimulatingGps]);

  // Clean offline handling if driver closes, navigates away from tab, or unmounts
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isOnline && userProfile?.uid && !isDemo) {
        firestoreService.toggleDriverOnlineStatus(userProfile.uid, false).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (isOnline && userProfile?.uid && !isDemo) {
        firestoreService.toggleDriverOnlineStatus(userProfile.uid, false).catch(() => {});
      }
    };
  }, [isOnline, userProfile?.uid, isDemo]);

  // Listen to incoming searching rides across the platform
  useEffect(() => {
    if (!isOnline || activeTrip) {
      setIncomingRequests([]);
      return;
    }

    const unsubscribe = firestoreService.listenToSearchingRides((rides) => {
      // If we don't have an active trip, show incoming rides
      const resetTimestamp = sessionStorage.getItem('zaka_demo_reset_time')
        ? Number(sessionStorage.getItem('zaka_demo_reset_time'))
        : 0;

      const validSearching = rides.filter((r) => {
        if (!resetTimestamp) return true;
        const reqTime = new Date(r.requestedAt).getTime();
        return reqTime > resetTimestamp || r.id === activeDemoRideId;
      });

      setIncomingRequests(validSearching);
    }, Boolean(userProfile?.isDemo));

    return () => unsubscribe();
  }, [isOnline, activeTrip, userProfile?.isDemo, activeDemoRideId]);

  // Listen to assigned active rides for this driver
  useEffect(() => {
    if (!userProfile?.uid) return;

    const resetTimestamp = sessionStorage.getItem('zaka_demo_reset_time')
      ? Number(sessionStorage.getItem('zaka_demo_reset_time'))
      : 0;

    const unsubscribeRides = firestoreService.listenToDriverRides(userProfile.uid, (rides) => {
      setDriverHistory(rides);

      const validRides = rides.filter((r) => {
        if (!resetTimestamp) return true;
        const reqTime = new Date(r.requestedAt).getTime();
        return reqTime > resetTimestamp || r.id === activeDemoRideId;
      });

      const active = validRides.find(
        (r) =>
          r.status === 'accepted' ||
          r.status === 'driver_arriving' ||
          r.status === 'driver_arrived' ||
          r.status === 'in_progress'
      );

      // Detect trip completion
      if (activeTrip && !active) {
        const completed = validRides.find((r) => r.id === activeTrip.id && r.status === 'completed');
        if (completed) {
          setJustCompletedTrip(completed);
        }
      }

      setActiveTrip(active || null);
    });

    // Listen to driver payments
    const unsubscribePayments = firestoreService.listenToDriverPayments(userProfile.uid, (payments) => {
      setDriverPayments(payments);
    });

    return () => {
      unsubscribeRides();
      unsubscribePayments();
    };
  }, [userProfile?.uid, activeTrip, activeDemoRideId]);

  // Calculate dynamic driver earnings
  const earningsSummary = useMemo(() => {
    return earningsService.calculateDriverEarnings(driverHistory, driverPayments);
  }, [driverHistory, driverPayments]);

  // Demo Mode simulated driver movement along ride route (Only when simulation is active)
  useEffect(() => {
    if (!isOnline || !isSimulatingGps || !activeTrip || !userProfile?.uid) return;

    const interval = setInterval(() => {
      let targetLat = driverLocation.latitude;
      let targetLng = driverLocation.longitude;

      if (activeTrip.status === 'driver_arriving') {
        targetLat = activeTrip.pickupLocation.latitude;
        targetLng = activeTrip.pickupLocation.longitude;
      } else if (activeTrip.status === 'in_progress') {
        targetLat = activeTrip.destinationLocation.latitude;
        targetLng = activeTrip.destinationLocation.longitude;
      } else {
        return;
      }

      // Smooth step movement (12% of remaining distance)
      const step = 0.12;
      const dLat = (targetLat - driverLocation.latitude) * step;
      const dLng = (targetLng - driverLocation.longitude) * step;

      const newLat = Number((driverLocation.latitude + dLat).toFixed(6));
      const newLng = Number((driverLocation.longitude + dLng).toFixed(6));

      const newCoords = { latitude: newLat, longitude: newLng };
      setDriverLocation(newCoords);

      // Throttled Firestore sync using mapService 15m / 10s rules
      firestoreService.updateDriverLocationAndRide(
        userProfile.uid,
        newCoords,
        activeTrip.id,
        false
      );
    }, 2500);

    return () => clearInterval(interval);
  }, [isOnline, isSimulatingGps, activeTrip, driverLocation, userProfile?.uid]);

  // Accept an incoming ride using Firestore Transaction
  const handleAcceptRide = async (ride: RideDocument) => {
    if (!userProfile?.uid || !driverProfile) return;
    setIsAccepting(true);

    try {
      const success = await firestoreService.acceptRideTransaction(ride.id, {
        ...driverProfile,
        userId: userProfile.uid,
        name: userProfile.name,
        phone: userProfile.phone,
      });

      if (success) {
        setIncomingRequests([]);
        if (isDemoTestMode || userProfile.isDemo) {
          setActiveDemoRideId(ride.id);
        }
      } else {
        alert('This ride was already assigned to another driver or cancelled.');
      }
    } catch (e) {
      console.error('Failed to accept ride:', e);
    } finally {
      setIsAccepting(false);
    }
  };

  // Decline an incoming ride
  const handleDeclineRide = (rideId: string) => {
    setIncomingRequests((prev) => prev.filter((r) => r.id !== rideId));
  };

  // Calculate channel earnings
  const cashEarnings = useMemo(() => {
    return driverPayments
      .filter((p) => p.paymentMethod === 'cash' && p.paymentStatus === 'paid')
      .reduce((acc, p) => acc + (p.amount || 0) * 0.85, 0);
  }, [driverPayments]);

  const digitalEarnings = useMemo(() => {
    return driverPayments
      .filter((p) => p.paymentMethod !== 'cash' && p.paymentStatus === 'paid')
      .reduce((acc, p) => acc + (p.amount || 0) * 0.85, 0);
  }, [driverPayments]);

  return (
    <div id="driver-main-container" className="relative flex h-[calc(100vh-61px)] w-full flex-col overflow-hidden bg-[#F4F5F7] lg:flex-row">
      {/* LEFT: INTERACTIVE DRIVER RADAR & NAVIGATION MAP */}
      <div className="relative h-[42vh] w-full shrink-0 lg:h-full lg:flex-1">
        <InteractiveMap
          pickupLocation={{
            latitude: activeTrip ? activeTrip.pickupLocation.latitude : driverLocation.latitude,
            longitude: activeTrip ? activeTrip.pickupLocation.longitude : driverLocation.longitude,
            address: activeTrip?.pickupAddress || 'Current Driver Location',
          }}
          destinationLocation={{
            latitude: activeTrip ? activeTrip.destinationLocation.latitude : -26.1076,
            longitude: activeTrip ? activeTrip.destinationLocation.longitude : 28.0567,
            address: activeTrip?.destinationAddress || 'Sandton Hub',
          }}
          driverLocation={driverLocation}
          activeRide={activeTrip}
          mode="driver"
        />

        {/* Master Online / Offline Floating Switch and GPS Telemetry Badge on Map */}
        <div className="absolute top-3.5 left-3.5 right-3.5 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
          <button
            id="btn-toggle-driver-online"
            onClick={handleToggleOnline}
            className={`pointer-events-auto flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-black shadow-lg transition-all active:scale-95 ${
              isOnline
                ? 'bg-[#111111] text-[#FFC107] border border-[#FFC107]'
                : 'bg-white text-neutral-600 border border-[#E5E5E5]'
            }`}
          >
            <Power className={`h-3.5 w-3.5 ${isOnline ? 'text-emerald-400' : 'text-neutral-400'}`} />
            <span>{isOnline ? 'ONLINE • READY' : 'OFFLINE'}</span>
            <span
              className={`h-2 w-2 rounded-full ${
                isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-300'
              }`}
            />
          </button>

          {/* GPS Telemetry Pill */}
          {isOnline && (
            <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white/95 px-3 py-1.5 shadow-md backdrop-blur-xs text-[11px] font-bold">
              {isSimulatingGps ? (
                <>
                  <Radio className="h-3.5 w-3.5 text-blue-600 animate-pulse" />
                  <span className="text-neutral-700">Simulated GPS (Demo)</span>
                  <button
                    onClick={() => setIsSimulatingGps(false)}
                    className="ml-1 text-[10px] text-blue-600 underline font-black hover:text-blue-800"
                  >
                    Use Device GPS
                  </button>
                </>
              ) : gpsState === 'LOCATION_GRANTED' ? (
                <>
                  <Satellite className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-800">GPS Locked (High Accuracy)</span>
                  {isDemo && (
                    <button
                      onClick={() => setIsSimulatingGps(true)}
                      className="ml-1 text-[10px] text-neutral-500 underline hover:text-neutral-800"
                    >
                      Simulate
                    </button>
                  )}
                </>
              ) : gpsState === 'LOCATION_REQUESTING' ? (
                <>
                  <Satellite className="h-3.5 w-3.5 text-amber-500 animate-spin" />
                  <span className="text-amber-800">Acquiring GPS Lock...</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-red-500" />
                  <span className="text-red-700">GPS Warning</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* GPS Failure Warning Banner */}
        {isOnline && !isSimulatingGps && (gpsState === 'LOCATION_DENIED' || gpsState === 'LOCATION_UNAVAILABLE' || gpsState === 'LOCATION_STALE' || gpsState === 'LOCATION_ERROR') && (
          <div className="absolute bottom-3 left-3 right-3 z-20 rounded-2xl border border-red-200 bg-red-50 p-3 shadow-lg flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span className="font-semibold">
                {gpsErrorMsg || 'Your location is temporarily unavailable. Check GPS permissions or satellite signal.'}
              </span>
            </div>
            {isDemo && (
              <button
                onClick={() => setIsSimulatingGps(true)}
                className="shrink-0 rounded-xl bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-red-700"
              >
                Switch to Demo GPS
              </button>
            )}
          </div>
        )}
      </div>

      {/* RIGHT: DRIVER CONTROL CONSOLE / DISPATCH PANEL */}
      <div className="z-20 flex flex-1 flex-col overflow-y-auto rounded-t-3xl border-t border-[#E5E5E5] bg-white p-3.5 sm:p-5 shadow-2xl lg:h-full lg:max-w-md lg:rounded-none lg:border-t-0 lg:border-l">
        {/* Toggle Online Error Alert */}
        {toggleOnlineError && (
          <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{toggleOnlineError}</span>
            </div>
            <button
              onClick={() => setToggleOnlineError(null)}
              className="font-bold text-red-600 underline text-[11px]"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Navigation Tabs (Console, Earnings, History) */}
        <div className="mb-3.5 flex items-center justify-between rounded-xl bg-[#F5F5F5] p-1 border border-[#E5E5E5]">
          <button
            id="tab-driver-console"
            onClick={() => setViewTab('console')}
            className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all ${
              viewTab === 'console'
                ? 'bg-white text-[#111111] shadow-xs'
                : 'text-neutral-500 hover:text-[#111111]'
            }`}
          >
            Console
          </button>
          <button
            id="tab-driver-earnings"
            onClick={() => setViewTab('earnings')}
            className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all ${
              viewTab === 'earnings'
                ? 'bg-white text-[#111111] shadow-xs'
                : 'text-neutral-500 hover:text-[#111111]'
            }`}
          >
            Earnings
          </button>
          <button
            id="tab-driver-history"
            onClick={() => setViewTab('history')}
            className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all ${
              viewTab === 'history'
                ? 'bg-white text-[#111111] shadow-xs'
                : 'text-neutral-500 hover:text-[#111111]'
            }`}
          >
            History
          </button>
        </div>

        {/* ================= TAB 1: DRIVER CONSOLE ================= */}
        {viewTab === 'console' && (
          <div className="space-y-3.5">
            {/* Driver Performance Metrics HUD */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-[#E5E5E5] bg-[#F9FAFB] p-2.5 text-center shadow-2xs">
                <span className="block text-[9px] font-bold uppercase text-neutral-400">Today</span>
                <span className="text-xs sm:text-sm font-black text-[#111111]">
                  {fareService.formatZAR(earningsSummary.today.driverNetEarnings || driverProfile?.earningsToday || 0)}
                </span>
              </div>
              <div className="rounded-2xl border border-[#E5E5E5] bg-[#F9FAFB] p-2.5 text-center shadow-2xs">
                <span className="block text-[9px] font-bold uppercase text-neutral-400">Rating</span>
                <div className="flex items-center justify-center gap-1">
                  <Star className="h-3 w-3 fill-[#FFC107] text-[#FFC107]" />
                  <span className="text-xs sm:text-sm font-black text-[#111111]">
                    {driverProfile?.rating?.toFixed(1) || '5.0'}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-[#E5E5E5] bg-[#F9FAFB] p-2.5 text-center shadow-2xs">
                <span className="block text-[9px] font-bold uppercase text-neutral-400">Trips</span>
                <span className="text-xs sm:text-sm font-black text-[#111111]">
                  {earningsSummary.lifetime.completedTrips || driverProfile?.totalTrips || 0}
                </span>
              </div>
            </div>

            {/* Vehicle & Verification Card */}
            <div className="rounded-2xl border border-[#E5E5E5] bg-[#F9FAFB] p-3 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFC107] text-[#111111] font-bold shrink-0">
                  <Car className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#111111] truncate">
                    {driverProfile?.vehicle?.colour || 'Silver'} {driverProfile?.vehicle?.make || 'Toyota'} {driverProfile?.vehicle?.model || 'Corolla'}
                  </p>
                  <p className="font-mono text-[10px] text-neutral-500 font-semibold">
                    {driverProfile?.vehicle?.registrationNumber || 'ZK 89 GP'}
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[9px] font-bold text-emerald-800 shrink-0">
                APPROVED
              </span>
            </div>

            {/* CASE 1: JUST COMPLETED TRIP SCREEN */}
            {justCompletedTrip ? (
              <DriverCompletedScreen
                ride={justCompletedTrip}
                onBackToHome={() => {
                  setJustCompletedTrip(null);
                  refreshProfiles();
                }}
              />
            ) : activeTrip ? (
              /* CASE 2: ACTIVE DISPATCHED TRIP (accepted, driver_arriving, driver_arrived, in_progress) */
              <DriverActiveRideScreen
                ride={activeTrip}
                driverId={userProfile?.uid || ''}
                driverLocation={driverLocation}
                onStatusUpdated={refreshProfiles}
              />
            ) : incomingRequests.length > 0 ? (
              /* CASE 3: INCOMING RIDE REQUESTS ON RADAR WITH 15S AUTO DISPATCH */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                    Incoming Requests ({incomingRequests.length})
                  </span>
                  <span className="text-[10px] text-neutral-400 font-bold">15S AUTO DISPATCH</span>
                </div>

                {incomingRequests.map((req) => (
                  <IncomingRideCard
                    key={req.id}
                    request={req}
                    driverLocation={driverLocation}
                    isAccepting={isAccepting}
                    onAccept={handleAcceptRide}
                    onDecline={handleDeclineRide}
                  />
                ))}
              </div>
            ) : (
              /* CASE 4: ONLINE RADAR SCANNING */
              <div className="rounded-2xl border border-[#E5E5E5] bg-[#F9FAFB] p-6 text-center shadow-2xs">
                {isOnline ? (
                  <>
                    <div className="relative mx-auto mb-3 flex h-14 w-14 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/30" />
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xs">
                        <Navigation className="h-5 w-5" />
                      </div>
                    </div>
                    <h3 className="text-xs sm:text-sm font-bold text-[#111111]">
                      Searching for nearby ride requests...
                    </h3>
                    <p className="mt-1 text-[11px] text-neutral-500 max-w-xs mx-auto">
                      Stay in high-demand zones around Sandton, Rosebank, and the Airport to receive trips swiftly.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-200 text-neutral-500">
                      <Power className="h-5 w-5" />
                    </div>
                    <h3 className="text-xs sm:text-sm font-bold text-[#111111]">You are currently Offline</h3>
                    <p className="mt-1 text-[11px] text-neutral-500 max-w-xs mx-auto">
                      Tap the online button above to begin receiving passenger dispatch requests.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: DRIVER EARNINGS ================= */}
        {viewTab === 'earnings' && (
          <div className="space-y-3.5">
            {/* Total Balance Card */}
            <div className="rounded-2xl border border-[#111111] bg-[#111111] p-4 text-white shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#FFC107]">
                  Net Driver Earnings (85%)
                </span>
                <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[9px] font-bold text-neutral-300">
                  {earningsSummary.lifetime.completedTrips} Trips Settled
                </span>
              </div>
              <h2 className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-white">
                {fareService.formatZAR(earningsSummary.lifetime.driverNetEarnings || driverProfile?.totalEarnings || 0)}
              </h2>

              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-neutral-800 pt-2 text-[11px] text-neutral-400">
                <div>
                  <span className="text-[10px] block">Gross Passenger Fares</span>
                  <span className="font-bold text-white">{fareService.formatZAR(earningsSummary.lifetime.grossEarnings)}</span>
                </div>
                <div>
                  <span className="text-[10px] block">ZAKA Platform Fee (15%)</span>
                  <span className="font-bold text-neutral-300">-{fareService.formatZAR(earningsSummary.lifetime.grossEarnings * 0.15)}</span>
                </div>
              </div>
            </div>

            {/* Timeframe Quick Stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-[#E5E5E5] bg-[#F9FAFB] p-2.5 shadow-2xs text-center">
                <span className="text-[9px] font-bold uppercase text-neutral-400">Today</span>
                <p className="mt-0.5 text-xs sm:text-sm font-black text-[#111111]">
                  {fareService.formatZAR(earningsSummary.today.driverNetEarnings)}
                </p>
              </div>
              <div className="rounded-2xl border border-[#E5E5E5] bg-[#F9FAFB] p-2.5 shadow-2xs text-center">
                <span className="text-[9px] font-bold uppercase text-neutral-400">This Week</span>
                <p className="mt-0.5 text-xs sm:text-sm font-black text-[#111111]">
                  {fareService.formatZAR(earningsSummary.thisWeek.driverNetEarnings)}
                </p>
              </div>
              <div className="rounded-2xl border border-[#E5E5E5] bg-[#F9FAFB] p-2.5 shadow-2xs text-center">
                <span className="text-[9px] font-bold uppercase text-neutral-400">This Month</span>
                <p className="mt-0.5 text-xs sm:text-sm font-black text-[#111111]">
                  {fareService.formatZAR(earningsSummary.thisMonth.driverNetEarnings)}
                </p>
              </div>
            </div>

            {/* Pending Settlement Alert (Unconfirmed rides) */}
            {earningsSummary.pendingSettlement > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">Pending Settlement</span>
                    <span className="font-black text-amber-950">
                      {fareService.formatZAR(earningsSummary.pendingSettlement)}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Unconfirmed fare awaiting payment receipt or gateway settlement confirmation.
                  </p>
                </div>
              </div>
            )}

            {/* Payment Method Split */}
            <div className="rounded-2xl border border-[#E5E5E5] bg-white p-3.5 space-y-2 text-xs shadow-2xs">
              <h4 className="font-bold text-[#111111] flex items-center gap-1.5">
                <Banknote className="h-4 w-4 text-neutral-500" />
                Payment Channels Breakdown
              </h4>
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-neutral-600">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Direct Cash Received:
                  </span>
                  <span className="font-black text-[#111111]">
                    {fareService.formatZAR(cashEarnings)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-neutral-600">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    Card / Digital In-App:
                  </span>
                  <span className="font-black text-[#111111]">
                    {fareService.formatZAR(digitalEarnings)}
                  </span>
                </div>
              </div>
            </div>

            {/* Banking & Payout Info */}
            <div className="rounded-2xl border border-[#E5E5E5] bg-[#F9FAFB] p-3.5 text-xs shadow-2xs">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-[#111111]">Direct Weekly Payout</h4>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-800">
                  Active
                </span>
              </div>
              <p className="mt-1 text-[11px] text-neutral-500">
                Standard Bank SA (•••• 4819) • Payout cycle runs every Monday at 06:00 AM SAST.
              </p>
            </div>
          </div>
        )}

        {/* ================= TAB 3: DRIVER TRIP HISTORY ================= */}
        {viewTab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold text-[#111111] uppercase tracking-wider">
                Trip Ledger ({driverHistory.length})
              </h3>
              <span className="text-[10px] text-neutral-400 font-medium">
                Tap trip for details
              </span>
            </div>

            {driverHistory.length === 0 ? (
              <div className="rounded-2xl border border-[#E5E5E5] bg-[#F9FAFB] py-10 text-center text-xs text-neutral-400">
                No past trips recorded in history yet.
              </div>
            ) : (
              <div className="space-y-2">
                {driverHistory.map((trip) => {
                  const fare = trip.finalFare || trip.estimatedFare || 35.0;
                  const takeHome = fare * 0.85;
                  const isCash = trip.paymentMethod === 'cash';

                  return (
                    <div
                      key={trip.id}
                      onClick={() => setSelectedHistoryRide(trip)}
                      className="cursor-pointer rounded-2xl border border-[#E5E5E5] bg-[#F9FAFB] p-3.5 space-y-1.5 shadow-2xs text-xs hover:border-[#FFC107] transition-all"
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-[#111111] truncate">{trip.passengerName || 'Passenger'}</span>
                          <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                            isCash ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {trip.paymentMethod || 'cash'}
                          </span>
                        </div>
                        <span className="font-black text-emerald-600 shrink-0">
                          +{fareService.formatZAR(takeHome)}
                        </span>
                      </div>

                      <p className="text-[11px] text-neutral-500 truncate">
                        {trip.destinationAddress}
                      </p>

                      <div className="flex justify-between items-center text-[10px] text-neutral-400 pt-1 border-t border-[#E5E5E5]">
                        <span>{trip.completedAt ? new Date(trip.completedAt).toLocaleDateString() : new Date(trip.createdAt).toLocaleDateString()}</span>
                        <span className="font-bold uppercase text-neutral-700">{trip.status}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Selected History Ride Details Modal */}
        {selectedHistoryRide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl space-y-3.5">
              <div className="flex items-center justify-between border-b border-[#E5E5E5] pb-2.5">
                <h4 className="text-sm font-black text-[#111111]">Trip Receipt Summary</h4>
                <button
                  type="button"
                  onClick={() => setSelectedHistoryRide(null)}
                  className="rounded-full bg-neutral-100 p-1 text-neutral-500 hover:bg-neutral-200"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Passenger:</span>
                  <span className="font-bold text-[#111111]">{selectedHistoryRide.passengerName || 'Passenger'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Ride Type:</span>
                  <span className="font-bold uppercase text-[#111111]">{selectedHistoryRide.rideType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Payment:</span>
                  <span className="font-bold uppercase text-neutral-700">{selectedHistoryRide.paymentMethod || 'cash'} ({selectedHistoryRide.paymentStatus || 'paid'})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">From:</span>
                  <span className="font-medium text-[#111111] truncate max-w-[180px]">{selectedHistoryRide.pickupAddress}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">To:</span>
                  <span className="font-medium text-[#111111] truncate max-w-[180px]">{selectedHistoryRide.destinationAddress}</span>
                </div>

                <div className="border-t border-[#E5E5E5] pt-2 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Gross Fare:</span>
                    <span className="font-bold text-[#111111]">
                      {fareService.formatZAR(selectedHistoryRide.finalFare || selectedHistoryRide.estimatedFare || 35.0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">ZAKA Commission (15%):</span>
                    <span className="font-bold text-neutral-400">
                      -{fareService.formatZAR((selectedHistoryRide.finalFare || selectedHistoryRide.estimatedFare || 35.0) * 0.15)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm pt-1 border-t border-[#E5E5E5]">
                    <span className="font-black text-[#111111]">Net Driver Payout:</span>
                    <span className="font-black text-emerald-600">
                      {fareService.formatZAR((selectedHistoryRide.finalFare || selectedHistoryRide.estimatedFare || 35.0) * 0.85)}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedHistoryRide(null)}
                className="w-full rounded-2xl bg-[#FFC107] py-2.5 text-xs font-bold text-[#111111] hover:bg-[#FFB300]"
              >
                Close Receipt
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

