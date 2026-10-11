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
import { apiUrl, getIdToken } from '../../services/apiClient';
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

  const isPending = !driverProfile || driverProfile.verificationStatus !== 'approved';

  // Offline until the profile says otherwise, so nothing online-only runs for a missing or pending profile
  const [isOnline, setIsOnline] = useState<boolean>(driverProfile?.online ?? false);
  const [activeTrip, setActiveTrip] = useState<RideDocument | null>(null);
  const [justCompletedTrip, setJustCompletedTrip] = useState<RideDocument | null>(null);
  const [incomingRequests, setIncomingRequests] = useState<RideDocument[]>([]);
  const [isAccepting, setIsAccepting] = useState<boolean>(false);
  const [viewTab, setViewTab] = useState<'console' | 'earnings' | 'history' | 'application'>('console');

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

  const lastAcceptedFixAtRef = useRef<number>(0);
  // Rides this driver declined or let time out: kept out of the list when the listener delivers them again
  const declinedRideIdsRef = useRef<Set<string>>(new Set());

  const mountedRef = useRef<boolean>(true);
  const userProfileUidRef = useRef<string | null>(null);
  useEffect(() => {
    userProfileUidRef.current = userProfile?.uid || null;
  }, [userProfile?.uid]);

  const isDemo = Boolean(userProfile?.isDemo || userProfile?.uid?.startsWith('demo-') || isDemoTestMode);
  const [gpsState, setGpsState] = useState<GpsTrackingState>('LOCATION_REQUESTING');
  const [gpsErrorMsg, setGpsErrorMsg] = useState<string | null>(null);
  // The current position comes from a coarse fix (network / Wi-Fi), not a precise satellite fix
  const [gpsApproximate, setGpsApproximate] = useState<boolean>(false);
  const [isSimulatingGps, setIsSimulatingGps] = useState<boolean>(isDemo);
  const [toggleOnlineError, setToggleOnlineError] = useState<string | null>(null);

  // Sync online status with driverProfile
  useEffect(() => {
    if (driverProfile) {
      setIsOnline(Boolean(driverProfile.online));
    }
  }, [driverProfile?.online]);

  // Toggle online/offline status in Firestore
  const isTogglingRef = useRef<boolean>(false);
  const handleToggleOnline = async () => {
    if (!userProfile?.uid || isTogglingRef.current) return;
    isTogglingRef.current = true;
    try {
      await toggleOnline(userProfile.uid);
    } finally {
      isTogglingRef.current = false;
    }
  };

  const toggleOnline = async (uid: string) => {
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
        lastAcceptedFixAtRef.current = Date.now();
        setGpsState('LOCATION_GRANTED');
        setGpsErrorMsg(null);

        await firestoreService.toggleDriverOnlineStatus(uid, true, freshCoords);
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
      await firestoreService.toggleDriverOnlineStatus(uid, newStatus, driverLocation);
      setIsOnline(newStatus);
      await refreshProfiles();
    } catch (err: any) {
      console.error('Failed to toggle online status:', err);
      setToggleOnlineError(err.message || 'Could not update online status. Please check driver verification.');
    }
  };

  // Production GPS tracking using real device geolocation.
  // A warning is only raised when the device has really lost its position: a parked driver produces no
  // new readings, and indoor timeouts are routine, so neither of those counts as a failure on its own.
  useEffect(() => {
    if (!isOnline || isSimulatingGps) {
      return;
    }

    if (!('geolocation' in navigator)) {
      setGpsState('LOCATION_UNAVAILABLE');
      setGpsErrorMsg('GPS is not supported on this device or browser.');
      return;
    }

    const GOOD_ACCURACY_M = 100; // precise enough for street-level dispatch
    const MAX_ACCURACY_M = 2000; // anything coarser is not a usable position
    const COARSE_AFTER_MS = 10000; // a coarse fix is used once no precise fix has arrived for this long
    const POLL_MS = 15000; // while the watch is silent, the position is asked for directly
    const LOST_AFTER_MS = 60000; // no position at all for this long = signal lost

    const startedAt = Date.now();
    let cancelled = false;
    // Time of the last usable position (or since tracking started, when there has been none yet)
    const lastSignalAt = () => Math.max(lastAcceptedFixAtRef.current, startedAt);

    // Going online has just taken a fix: tracking carries on from it instead of showing "acquiring" again
    if (Date.now() - lastAcceptedFixAtRef.current > LOST_AFTER_MS) {
      setGpsState('LOCATION_REQUESTING');
    }

    const acceptFix = (pos: GeolocationPosition) => {
      if (cancelled) return;

      // Discard an old cached fix from the device
      if (pos.timestamp && Date.now() - pos.timestamp > 60000) {
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

      // A coarse fix (> 100 m) never replaces a recent precise one. It is used when nothing better has
      // arrived for a while: otherwise a phone indoors would have no position at all.
      const accuracy = pos.coords.accuracy || 0;
      const coarse = accuracy > GOOD_ACCURACY_M;
      const sinceLastFix = Date.now() - lastAcceptedFixAtRef.current;
      if (coarse && (accuracy > MAX_ACCURACY_M || sinceLastFix < COARSE_AFTER_MS)) {
        return;
      }

      const coords: LocationCoordinates = {
        latitude: Number(pos.coords.latitude.toFixed(6)),
        longitude: Number(pos.coords.longitude.toFixed(6)),
      };

      // Jump rejection (anomalous teleportation > 5000m). Only measured against a fix accepted in the
      // last 10 s: against an older or default position a real move would be rejected forever.
      const currentLoc = driverLocationRef.current;
      if (currentLoc && currentLoc.latitude !== 0 && sinceLastFix < 10000) {
        const jumpDist = mapService.distanceMeters(currentLoc, coords);
        if (jumpDist > 5000) {
          console.warn('Discarding extreme GPS jump anomaly:', jumpDist, 'meters');
          return;
        }
      }

      lastAcceptedFixAtRef.current = Date.now();
      // Same position again (parked): keep the same object so nothing re-renders
      setDriverLocation((prev) =>
        prev.latitude === coords.latitude && prev.longitude === coords.longitude ? prev : coords
      );
      setGpsState('LOCATION_GRANTED');
      setGpsApproximate(coarse);
      setGpsErrorMsg(null);

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
    };

    const handleError = (err: GeolocationPositionError) => {
      if (cancelled) return;
      if (err.code === 1) {
        console.warn('Driver device GPS permission denied:', err);
        setGpsState('LOCATION_DENIED');
        setGpsErrorMsg('Location permission denied. Allow location access for ZAKA in your device settings to receive ride requests.');
        return;
      }
      // Timeout or temporarily unavailable: the device keeps trying. Only reported once the position
      // has been missing for a full minute.
      if (Date.now() - lastSignalAt() < LOST_AFTER_MS) return;
      console.warn('Driver device GPS signal lost:', err);
      setGpsState(err.code === 2 ? 'LOCATION_UNAVAILABLE' : 'LOCATION_ERROR');
      setGpsErrorMsg('No GPS signal. Move to an open area or check that Location is switched on. ZAKA reconnects automatically.');
    };

    const watchId = navigator.geolocation.watchPosition(acceptFix, handleError, {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 5000,
    });

    // The watch only reports movement on many devices. While it is silent the position is requested
    // directly, which keeps a parked driver's location confirmed.
    const pollTimer = setInterval(() => {
      const silentFor = Date.now() - lastSignalAt();
      if (silentFor < POLL_MS) return;
      navigator.geolocation.getCurrentPosition(acceptFix, handleError, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 10000,
      });
      if (silentFor >= LOST_AFTER_MS) {
        setGpsState((prev) => (prev === 'LOCATION_GRANTED' || prev === 'LOCATION_REQUESTING' ? 'LOCATION_STALE' : prev));
        setGpsErrorMsg((prev) => prev || 'No GPS signal. Move to an open area or check that Location is switched on. ZAKA reconnects automatically.');
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
      clearInterval(pollTimer);
    };
  }, [isOnline, isSimulatingGps]);

  // ---- Going offline reliably -------------------------------------------------------------
  // 1. On tab close / app termination a beacon asks the server to take this driver offline.
  //    A beacon cannot carry headers, so a fresh ID token is kept ready and sent in the body.
  // 2. While online a heartbeat is written every 30s. If the beacon never arrives (crash, dead
  //    battery, lost signal) the server notices the missing heartbeat and takes the driver offline.
  const idTokenRef = useRef<string | null>(null);
  const isOnlineRef = useRef<boolean>(isOnline);
  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    if (!isOnline || !userProfile?.uid || isDemo) return;
    const uid = userProfile.uid;

    const refreshToken = () => {
      getIdToken().then((token) => {
        idTokenRef.current = token;
      });
    };
    refreshToken();
    const tokenTimer = setInterval(refreshToken, 10 * 60 * 1000);

    const beat = () => {
      firestoreService
        .sendDriverHeartbeat(uid, isSimulatingGps ? null : driverLocationRef.current)
        .catch(() => {});
    };
    beat();
    const heartbeatTimer = setInterval(beat, 30000);

    const goOfflineNow = () => {
      if (!isOnlineRef.current) return;
      let delivered = false;
      try {
        const payload = JSON.stringify({ idToken: idTokenRef.current });
        delivered = Boolean(
          idTokenRef.current &&
            navigator.sendBeacon?.(apiUrl('/api/driver/go-offline'), new Blob([payload], { type: 'application/json' }))
        );
      } catch {
        delivered = false;
      }
      if (!delivered) {
        firestoreService.toggleDriverOnlineStatus(uid, false).catch(() => {});
      }
    };

    // pagehide is the only unload signal iOS Safari delivers reliably; beforeunload covers desktop browsers
    window.addEventListener('pagehide', goOfflineNow);
    window.addEventListener('beforeunload', goOfflineNow);

    return () => {
      clearInterval(tokenTimer);
      clearInterval(heartbeatTimer);
      window.removeEventListener('pagehide', goOfflineNow);
      window.removeEventListener('beforeunload', goOfflineNow);
    };
  }, [isOnline, userProfile?.uid, isDemo, isSimulatingGps]);

  // Leaving the driver console (switching to Rider, signing out) also takes the driver offline.
  // Deferred by a tick so React's development double-mount does not knock an online driver offline.
  useEffect(() => {
    const uid = userProfile?.uid;
    if (!uid || isDemo) return;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      setTimeout(() => {
        if (!mountedRef.current && isOnlineRef.current) {
          firestoreService.toggleDriverOnlineStatus(uid, false).catch(() => {});
        }
      }, 0);
    };
  }, [userProfile?.uid, isDemo]);

  // Listen to incoming searching rides across the platform
  const hasActiveTrip = Boolean(activeTrip);
  useEffect(() => {
    if (!isOnline || hasActiveTrip) {
      setIncomingRequests((prev) => (prev.length ? [] : prev));
      return;
    }

    const unsubscribe = firestoreService.listenToSearchingRides((rides) => {
      // If we don't have an active trip, show incoming rides
      const resetTimestamp = sessionStorage.getItem('zaka_demo_reset_time')
        ? Number(sessionStorage.getItem('zaka_demo_reset_time'))
        : 0;

      const validSearching = rides.filter((r) => {
        if (declinedRideIdsRef.current.has(r.id)) return false;
        if (!resetTimestamp) return true;
        const reqTime = new Date(r.requestedAt).getTime();
        return reqTime > resetTimestamp || r.id === activeDemoRideId;
      });

      setIncomingRequests(validSearching);
    }, Boolean(userProfile?.isDemo));

    return () => unsubscribe();
  }, [isOnline, hasActiveTrip, userProfile?.isDemo, activeDemoRideId]);

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

      // Detect trip completion. The trip id comes from a ref so this listener is not torn down and
      // re-read from Firestore every time a trip starts or ends.
      const previousTripId = activeTripIdRef.current;
      if (previousTripId && !active) {
        const completed = validRides.find((r) => r.id === previousTripId && r.status === 'completed');
        if (completed) {
          setJustCompletedTrip(completed);
        }
      }

      activeTripIdRef.current = active?.id || null;
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
  }, [userProfile?.uid, activeDemoRideId]);

  // An online driver with no trip must be available for dispatch. This covers a passenger cancelling
  // after acceptance (the passenger cannot write to the driver's profile). Short delay so a ride that
  // was just accepted has time to arrive from Firestore first.
  useEffect(() => {
    const uid = userProfile?.uid;
    if (!uid || isDemo || !isOnline || activeTrip || isAccepting) return;
    if (driverProfile?.available !== false) return;
    const timer = setTimeout(() => {
      firestoreService.updateDriverFields(uid, { available: true }).catch(() => {});
    }, 4000);
    return () => clearTimeout(timer);
  }, [userProfile?.uid, isDemo, isOnline, activeTrip?.id, isAccepting, driverProfile?.available]);

  // Calculate dynamic driver earnings
  const earningsSummary = useMemo(() => {
    return earningsService.calculateDriverEarnings(driverHistory, driverPayments);
  }, [driverHistory, driverPayments]);

  // Demo Mode simulated driver movement along ride route (Only when simulation is active)
  useEffect(() => {
    if (!isOnline || !isSimulatingGps || !activeTrip || !userProfile?.uid) return;
    // Nothing to simulate unless the driver is heading somewhere: no timer is created at all
    if (activeTrip.status !== 'driver_arriving' && activeTrip.status !== 'in_progress') return;

    const target =
      activeTrip.status === 'driver_arriving' ? activeTrip.pickupLocation : activeTrip.destinationLocation;
    const targetLat = target.latitude;
    const targetLng = target.longitude;

    const interval = setInterval(() => {
      const currentLoc = driverLocationRef.current;

      // Arrived (within ~15 m): stop the timer instead of ticking forever
      if (mapService.distanceMeters(currentLoc, { latitude: targetLat, longitude: targetLng }) < 15) {
        clearInterval(interval);
        return;
      }

      // Smooth step movement (12% of remaining distance)
      const step = 0.12;
      const dLat = (targetLat - currentLoc.latitude) * step;
      const dLng = (targetLng - currentLoc.longitude) * step;

      const newLat = Number((currentLoc.latitude + dLat).toFixed(6));
      const newLng = Number((currentLoc.longitude + dLng).toFixed(6));

      const newCoords = { latitude: newLat, longitude: newLng };
      setDriverLocation(newCoords);

      // Throttled Firestore sync using mapService 15m / 10s rules
      const uid = userProfileUidRef.current;
      if (uid) {
        firestoreService.updateDriverLocationAndRide(
          uid,
          newCoords,
          activeTrip.id,
          false
        );
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [isOnline, isSimulatingGps, activeTrip?.id, activeTrip?.status]);

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
    declinedRideIdsRef.current.add(rideId);
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

  // If driver verification is pending or rejected, show pending review screen
  // (moved after all hooks to comply with React Rules of Hooks)
  if (isPending) {
    return <DriverPendingScreen />;
  }

  return (
    <div id="driver-main-container" className="relative flex h-[calc(100vh-61px)] w-full flex-col overflow-hidden bg-white lg:flex-row">
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
            className={`pointer-events-auto flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold shadow-raised transition-all active:scale-95 ${
              isOnline
                ? 'bg-ink text-white border border-primary'
                : 'bg-white text-ink-2 border border-line'
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
            <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-line bg-white/95 px-3 py-1.5 shadow-card backdrop-blur-xs text-[11px] font-bold">
              {isSimulatingGps ? (
                <>
                  <Radio className="h-3.5 w-3.5 text-blue-600 animate-pulse" />
                  <span className="text-ink-2">Simulated GPS (Demo)</span>
                  <button
                    onClick={() => setIsSimulatingGps(false)}
                    className="ml-1 text-[11px] text-blue-600 underline font-bold hover:text-blue-800"
                  >
                    Use Device GPS
                  </button>
                </>
              ) : gpsState === 'LOCATION_GRANTED' ? (
                <>
                  <Satellite className="h-3.5 w-3.5 text-success" />
                  <span className="text-emerald-800">
                    {gpsApproximate ? 'GPS Active (Approximate)' : 'GPS Locked (High Accuracy)'}
                  </span>
                  {isDemo && (
                    <button
                      onClick={() => setIsSimulatingGps(true)}
                      className="ml-1 text-[11px] text-ink-3 underline hover:text-ink"
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
                  <span className="text-danger">
                    {gpsState === 'LOCATION_DENIED' ? 'Location Blocked' : 'No GPS Signal'}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* GPS Failure Warning Banner */}
        {isOnline && !isSimulatingGps && (gpsState === 'LOCATION_DENIED' || gpsState === 'LOCATION_UNAVAILABLE' || gpsState === 'LOCATION_STALE' || gpsState === 'LOCATION_ERROR') && (
          <div className="absolute bottom-3 left-3 right-3 z-20 rounded-card border border-red-200 bg-red-50 p-3 shadow-raised flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
              <span className="font-semibold">
                {gpsErrorMsg || 'Your location is temporarily unavailable. Check GPS permissions or satellite signal.'}
              </span>
            </div>
            {isDemo && (
              <button
                onClick={() => setIsSimulatingGps(true)}
                className="shrink-0 rounded-full bg-danger px-2.5 py-1 text-[11px] font-bold text-white shadow-card hover:bg-red-700"
              >
                Switch to Demo GPS
              </button>
            )}
          </div>
        )}
      </div>

      {/* RIGHT: DRIVER CONTROL CONSOLE / DISPATCH PANEL */}
      <div className="z-20 flex flex-1 flex-col overflow-y-auto rounded-t-sheet border-t border-line bg-white p-3.5 sm:p-5 shadow-modal lg:h-full lg:max-w-md lg:rounded-none lg:border-t-0 lg:border-l">
        {/* Toggle Online Error Alert */}
        {toggleOnlineError && (
          <div className="mb-3 rounded-card border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
              <span>{toggleOnlineError}</span>
            </div>
            <button
              onClick={() => setToggleOnlineError(null)}
              className="font-bold text-danger underline text-[11px]"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Navigation Tabs (Console, Earnings, History) */}
        <div className="mb-3.5 flex items-center justify-between rounded-xl bg-surface-2 p-1 border border-line">
          <button
            id="tab-driver-console"
            onClick={() => setViewTab('console')}
            className={`flex-1 rounded-full py-1.5 text-xs font-bold transition-all ${
              viewTab === 'console'
                ? 'bg-white text-ink shadow-card'
                : 'text-ink-3 hover:text-ink'
            }`}
          >
            Console
          </button>
          <button
            id="tab-driver-earnings"
            onClick={() => setViewTab('earnings')}
            className={`flex-1 rounded-full py-1.5 text-xs font-bold transition-all ${
              viewTab === 'earnings'
                ? 'bg-white text-ink shadow-card'
                : 'text-ink-3 hover:text-ink'
            }`}
          >
            Earnings
          </button>
          <button
            id="tab-driver-history"
            onClick={() => setViewTab('history')}
            className={`flex-1 rounded-full py-1.5 text-xs font-bold transition-all ${
              viewTab === 'history'
                ? 'bg-white text-ink shadow-card'
                : 'text-ink-3 hover:text-ink'
            }`}
          >
            History
          </button>
          <button
            id="tab-driver-application"
            onClick={() => setViewTab('application')}
            className={`flex-1 rounded-full py-1.5 text-xs font-bold transition-all ${
              viewTab === 'application'
                ? 'bg-white text-ink shadow-card'
                : 'text-ink-3 hover:text-ink'
            }`}
          >
            Application
          </button>
        </div>

        {/* ================= DRIVER APPLICATION: details, vehicle and documents ================= */}
        {viewTab === 'application' && <DriverPendingScreen embedded />}

        {/* ================= TAB 1: DRIVER CONSOLE ================= */}
        {viewTab === 'console' && (
          <div className="space-y-3.5">
            {/* Driver Performance Metrics HUD */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-card border border-line bg-surface-2 p-2.5 text-center ">
                <span className="block text-[11px] font-bold uppercase text-neutral-400">Today</span>
                <span className="text-xs sm:text-sm font-bold text-ink">
                  {fareService.formatZAR(earningsSummary.today.driverNetEarnings || driverProfile?.earningsToday || 0)}
                </span>
              </div>
              <div className="rounded-card border border-line bg-surface-2 p-2.5 text-center ">
                <span className="block text-[11px] font-bold uppercase text-neutral-400">Rating</span>
                <div className="flex items-center justify-center gap-1">
                  <Star className="h-3 w-3 fill-primary text-primary" />
                  <span className="text-xs sm:text-sm font-bold text-ink">
                    {driverProfile?.rating?.toFixed(1) || '5.0'}
                  </span>
                </div>
              </div>
              <div className="rounded-card border border-line bg-surface-2 p-2.5 text-center ">
                <span className="block text-[11px] font-bold uppercase text-neutral-400">Trips</span>
                <span className="text-xs sm:text-sm font-bold text-ink">
                  {earningsSummary.lifetime.completedTrips || driverProfile?.totalTrips || 0}
                </span>
              </div>
            </div>

            {/* Vehicle & Verification Card */}
            <div className="rounded-card border border-line bg-surface-2 p-3 flex items-center justify-between ">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-ink font-bold shrink-0">
                  <Car className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-ink truncate">
                    {driverProfile?.vehicle?.colour || 'Silver'} {driverProfile?.vehicle?.make || 'Toyota'} {driverProfile?.vehicle?.model || 'Corolla'}
                  </p>
                  <p className="font-mono text-[11px] text-ink-3 font-semibold">
                    {driverProfile?.vehicle?.registrationNumber || 'ZK 89 GP'}
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 shrink-0">
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
                  <span className="text-xs font-bold text-success flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-success animate-ping" />
                    Incoming Requests ({incomingRequests.length})
                  </span>
                  <span className="text-[11px] text-neutral-400 font-bold">15S AUTO DISPATCH</span>
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
              <div className="rounded-card border border-line bg-surface-2 p-6 text-center ">
                {isOnline ? (
                  <>
                    <div className="relative mx-auto mb-3 flex h-14 w-14 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/30" />
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success text-white shadow-card">
                        <Navigation className="h-5 w-5" />
                      </div>
                    </div>
                    <h3 className="text-xs sm:text-sm font-bold text-ink">
                      Searching for nearby ride requests...
                    </h3>
                    <p className="mt-1 text-[11px] text-ink-3 max-w-xs mx-auto">
                      Stay in high-demand zones around Sandton, Rosebank, and the Airport to receive trips swiftly.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-200 text-ink-3">
                      <Power className="h-5 w-5" />
                    </div>
                    <h3 className="text-xs sm:text-sm font-bold text-ink">You are currently Offline</h3>
                    <p className="mt-1 text-[11px] text-ink-3 max-w-xs mx-auto">
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
            <div className="rounded-card border border-ink bg-ink p-4 text-white shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-primary-text">
                  Net Driver Earnings (85%)
                </span>
                <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-neutral-300">
                  {earningsSummary.lifetime.completedTrips} Trips Settled
                </span>
              </div>
              <h2 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {fareService.formatZAR(earningsSummary.lifetime.driverNetEarnings || driverProfile?.totalEarnings || 0)}
              </h2>

              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-neutral-800 pt-2 text-[11px] text-neutral-400">
                <div>
                  <span className="text-[11px] block">Gross Passenger Fares</span>
                  <span className="font-bold text-white">{fareService.formatZAR(earningsSummary.lifetime.grossEarnings)}</span>
                </div>
                <div>
                  <span className="text-[11px] block">ZAKA Platform Fee (15%)</span>
                  <span className="font-bold text-neutral-300">-{fareService.formatZAR(earningsSummary.lifetime.grossEarnings * 0.15)}</span>
                </div>
              </div>
            </div>

            {/* Timeframe Quick Stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-card border border-line bg-surface-2 p-2.5 text-center">
                <span className="text-[11px] font-bold uppercase text-neutral-400">Today</span>
                <p className="mt-0.5 text-xs sm:text-sm font-bold text-ink">
                  {fareService.formatZAR(earningsSummary.today.driverNetEarnings)}
                </p>
              </div>
              <div className="rounded-card border border-line bg-surface-2 p-2.5 text-center">
                <span className="text-[11px] font-bold uppercase text-neutral-400">This Week</span>
                <p className="mt-0.5 text-xs sm:text-sm font-bold text-ink">
                  {fareService.formatZAR(earningsSummary.thisWeek.driverNetEarnings)}
                </p>
              </div>
              <div className="rounded-card border border-line bg-surface-2 p-2.5 text-center">
                <span className="text-[11px] font-bold uppercase text-neutral-400">This Month</span>
                <p className="mt-0.5 text-xs sm:text-sm font-bold text-ink">
                  {fareService.formatZAR(earningsSummary.thisMonth.driverNetEarnings)}
                </p>
              </div>
            </div>

            {/* Pending Settlement Alert (Unconfirmed rides) */}
            {earningsSummary.pendingSettlement > 0 && (
              <div className="rounded-card border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">Pending Settlement</span>
                    <span className="font-bold text-amber-950">
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
            <div className="rounded-card border border-line bg-white p-3.5 space-y-2 text-xs ">
              <h4 className="font-bold text-ink flex items-center gap-1.5">
                <Banknote className="h-4 w-4 text-ink-3" />
                Payment Channels Breakdown
              </h4>
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-ink-2">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-success" />
                    Direct Cash Received:
                  </span>
                  <span className="font-bold text-ink">
                    {fareService.formatZAR(cashEarnings)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-ink-2">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    Card / Digital In-App:
                  </span>
                  <span className="font-bold text-ink">
                    {fareService.formatZAR(digitalEarnings)}
                  </span>
                </div>
              </div>
            </div>

            {/* Banking & Payout Info */}
            <div className="rounded-card border border-line bg-surface-2 p-3.5 text-xs ">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-ink">Direct Weekly Payout</h4>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                  Active
                </span>
              </div>
              <p className="mt-1 text-[11px] text-ink-3">
                Standard Bank SA (•••• 4819) • Payout cycle runs every Monday at 06:00 AM SAST.
              </p>
            </div>
          </div>
        )}

        {/* ================= TAB 3: DRIVER TRIP HISTORY ================= */}
        {viewTab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold text-ink uppercase tracking-wider">
                Trip Ledger ({driverHistory.length})
              </h3>
              <span className="text-[11px] text-neutral-400 font-medium">
                Tap trip for details
              </span>
            </div>

            {driverHistory.length === 0 ? (
              <div className="rounded-card border border-line bg-surface-2 py-10 text-center text-xs text-neutral-400">
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
                      className="cursor-pointer rounded-card border border-line bg-surface-2 p-3.5 space-y-1.5 text-xs hover:border-primary transition-all"
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-ink truncate">{trip.passengerName || 'Passenger'}</span>
                          <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase ${
                            isCash ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {trip.paymentMethod || 'cash'}
                          </span>
                        </div>
                        <span className="font-bold text-success shrink-0">
                          +{fareService.formatZAR(takeHome)}
                        </span>
                      </div>

                      <p className="text-[11px] text-ink-3 truncate">
                        {trip.destinationAddress}
                      </p>

                      <div className="flex justify-between items-center text-[11px] text-neutral-400 pt-1 border-t border-line">
                        <span>{trip.completedAt ? new Date(trip.completedAt).toLocaleDateString() : new Date(trip.createdAt).toLocaleDateString()}</span>
                        <span className="font-bold uppercase text-ink-2">{trip.status}</span>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-[20px] bg-white p-5 shadow-modal space-y-3.5">
              <div className="flex items-center justify-between border-b border-line pb-2.5">
                <h4 className="text-sm font-bold text-ink">Trip Receipt Summary</h4>
                <button
                  type="button"
                  onClick={() => setSelectedHistoryRide(null)}
                  className="rounded-full bg-surface-2 p-1 text-ink-3 hover:bg-neutral-200"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-ink-3">Passenger:</span>
                  <span className="font-bold text-ink">{selectedHistoryRide.passengerName || 'Passenger'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-3">Ride Type:</span>
                  <span className="font-bold uppercase text-ink">{selectedHistoryRide.rideType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-3">Payment:</span>
                  <span className="font-bold uppercase text-ink-2">{selectedHistoryRide.paymentMethod || 'cash'} ({selectedHistoryRide.paymentStatus || 'paid'})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-3">From:</span>
                  <span className="font-medium text-ink truncate max-w-[180px]">{selectedHistoryRide.pickupAddress}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-3">To:</span>
                  <span className="font-medium text-ink truncate max-w-[180px]">{selectedHistoryRide.destinationAddress}</span>
                </div>

                <div className="border-t border-line pt-2 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-ink-3">Gross Fare:</span>
                    <span className="font-bold text-ink">
                      {fareService.formatZAR(selectedHistoryRide.finalFare || selectedHistoryRide.estimatedFare || 35.0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-3">ZAKA Commission (15%):</span>
                    <span className="font-bold text-neutral-400">
                      -{fareService.formatZAR((selectedHistoryRide.finalFare || selectedHistoryRide.estimatedFare || 35.0) * 0.15)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm pt-1 border-t border-line">
                    <span className="font-bold text-ink">Net Driver Payout:</span>
                    <span className="font-bold text-success">
                      {fareService.formatZAR((selectedHistoryRide.finalFare || selectedHistoryRide.estimatedFare || 35.0) * 0.85)}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedHistoryRide(null)}
                className="w-full rounded-full bg-primary py-2.5 text-xs font-bold text-ink hover:bg-primary-hover active:bg-primary-pressed"
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

