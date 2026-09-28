/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Passenger Home Screen
 * Premium Modern African Mobility Interface:
 * Map as Visual Hero + Floating Destination Panel + Refined Cards & Typography (#FF7A00 Accent)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { firestoreService } from '../../firebase/firestoreService';
import {
  LocationCoordinates,
  PassengerLocation,
  VehicleType,
  PricingConfig,
  FareBreakdown,
  PaymentMethod,
  RecentDestination,
} from '../../types';
import { fareService, ZAKA_DEFAULT_LAUNCH_PRICING } from '../../services/fareService';
import { hapticsService } from '../../services/hapticsService';
import { InteractiveMap } from '../common/InteractiveMap';
import { DestinationSearchModal } from './DestinationSearchModal';
import {
  locationService,
  geocodingService,
  calculateDistanceKm,
  estimateDurationMin,
} from '../../services/locationService';
import {
  MapPin,
  Navigation,
  Search,
  Users,
  Clock,
  Edit3,
  X,
  ChevronRight,
  Shield,
  CreditCard,
  Wallet,
  ArrowRight,
  Info,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  AlertCircle,
  Building,
  Home,
  Check,
} from 'lucide-react';

interface PassengerHomeProps {
  onOpenMenu?: () => void;
  onOpenProfile?: () => void;
  onOpenHistory?: () => void;
  onOpenWallet?: () => void;
  onOpenNotifications?: () => void;
  onConfirmRideReady?: (details: {
    pickup: PassengerLocation;
    destination: { address: string; coordinates: LocationCoordinates; name?: string };
    rideType: VehicleType;
    estimatedFare: number;
    distanceKm: number;
    durationMin: number;
    paymentMethod: PaymentMethod;
    fareBreakdown?: FareBreakdown;
  }) => void;
}

// Fallback initial location restricted strictly to Demo/Development mode
const DEMO_FALLBACK_LOCATION: PassengerLocation = {
  latitude: -26.1458,
  longitude: 28.0416,
  address: 'Rosebank, Johannesburg, 2196 (Demo Pickup)',
  timestamp: Date.now(),
};

// Curated South African mobility hubs shown when user has no recent destinations stored
const DEFAULT_SAVED_HUBS = [
  {
    id: 'hub-rosebank',
    name: 'Rosebank Gautrain Station',
    address: 'Oxford Rd & Baker St, Rosebank, Johannesburg',
    latitude: -26.1465,
    longitude: 28.0415,
  },
  {
    id: 'hub-sandton',
    name: 'Sandton City Mall',
    address: '83 Rivonia Rd, Sandhurst, Sandton',
    latitude: -26.1076,
    longitude: 28.0567,
  },
  {
    id: 'hub-waterfront',
    name: 'V&A Waterfront',
    address: '19 Dock Rd, Victoria & Alfred Waterfront, Cape Town',
    latitude: -33.904,
    longitude: 18.421,
  },
  {
    id: 'hub-ortambo',
    name: 'O.R. Tambo International Airport',
    address: '1 Jones Rd, Kempton Park, Johannesburg',
    latitude: -26.1367,
    longitude: 28.2411,
  },
];

export const PassengerHome: React.FC<PassengerHomeProps> = ({
  onOpenProfile,
  onOpenHistory,
  onOpenWallet,
  onConfirmRideReady,
}) => {
  const { userProfile, isDemoTestMode } = useAuth();
  const isDemo = Boolean(userProfile?.isDemo || isDemoTestMode);

  // Location State
  const [currentLocation, setCurrentLocation] = useState<PassengerLocation | null>(null);
  const [pickup, setPickup] = useState<PassengerLocation | null>(
    isDemo ? DEMO_FALLBACK_LOCATION : null
  );
  const [destination, setDestination] = useState<{
    address: string;
    coordinates: LocationCoordinates;
    name?: string;
  } | null>(null);

  // GPS Permission & Status
  const [isLocating, setIsLocating] = useState<boolean>(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [hasGpsPermission, setHasGpsPermission] = useState<boolean | null>(null);

  // Search Modal state
  const [searchModalOpen, setSearchModalOpen] = useState<boolean>(false);
  const [isSelectingPickup, setIsSelectingPickup] = useState<boolean>(false);

  // Pricing State from Firestore
  const [pricingConfigs, setPricingConfigs] = useState<Record<VehicleType, PricingConfig>>(
    ZAKA_DEFAULT_LAUNCH_PRICING
  );
  const [pricingLoading, setPricingLoading] = useState<boolean>(true);

  // Selected Ride Type & Payment
  const [selectedRideType, setSelectedRideType] = useState<VehicleType>('economy');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [showFareBreakdown, setShowFareBreakdown] = useState<boolean>(false);

  // Route metrics
  const [routeDistanceKm, setRouteDistanceKm] = useState<number>(0);
  const [routeDurationMin, setRouteDurationMin] = useState<number>(0);

  // Safety & Fares Modals
  const [showSafetyModal, setShowSafetyModal] = useState<boolean>(false);
  const [showFaresModal, setShowFaresModal] = useState<boolean>(false);
  const [isSubmittingRide, setIsSubmittingRide] = useState<boolean>(false);

  // Real-time online drivers for map radar
  const [onlineDrivers, setOnlineDrivers] = useState<any[]>([]);

  // Stored recent destinations for this user
  const [recentDestinations, setRecentDestinations] = useState<RecentDestination[]>([]);

  // Listen to online drivers
  useEffect(() => {
    const unsub = firestoreService.listenToOnlineDrivers((drivers) => {
      setOnlineDrivers(drivers);
    }, isDemo);
    return () => unsub();
  }, [isDemo]);

  // Load recent destinations from Firestore for current user
  useEffect(() => {
    if (!userProfile?.uid) return;
    firestoreService
      .getRecentDestinations(userProfile.uid)
      .then((recents) => {
        if (Array.isArray(recents) && recents.length > 0) {
          setRecentDestinations(recents);
        }
      })
      .catch((err) => {
        console.warn('Note loading recent destinations for home:', err);
      });
  }, [userProfile?.uid]);

  const nearbyDriversForMap = useMemo(() => {
    return onlineDrivers
      .filter((d) => d.online && d.currentLocation)
      .map((d) => ({
        id: d.userId || d.id,
        latitude: d.currentLocation.latitude,
        longitude: d.currentLocation.longitude,
        vehicleType: d.vehicle?.vehicleType || 'economy',
        isDemoDriver: Boolean(d.isDemo),
      }));
  }, [onlineDrivers]);

  // Subscribe to real-time Pricing from Firestore
  useEffect(() => {
    setPricingLoading(true);
    const unsubscribe = firestoreService.listenToPricingConfigs((configs) => {
      setPricingConfigs(configs);
      setPricingLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Request GPS Location on Mount
  const fetchCurrentLocation = useCallback(async () => {
    setIsLocating(true);
    setLocationError(null);

    try {
      // Fast acquisition
      const pos = await locationService.getCurrentPosition();

      if (
        isNaN(pos.latitude) ||
        isNaN(pos.longitude) ||
        pos.latitude < -90 ||
        pos.latitude > 90 ||
        pos.longitude < -180 ||
        pos.longitude > 180
      ) {
        throw new Error('Device returned invalid geographic coordinates.');
      }

      setCurrentLocation(pos);
      setPickup(pos);
      setHasGpsPermission(true);

      // Async background resolution for street address
      locationService.resolveAddressInBackground(pos.latitude, pos.longitude, (resolvedAddr) => {
        setCurrentLocation((prev) => (prev ? { ...prev, address: resolvedAddr } : prev));
        setPickup((prev) => {
          if (
            prev &&
            Math.abs(prev.latitude - pos.latitude) < 0.0001 &&
            Math.abs(prev.longitude - pos.longitude) < 0.0001
          ) {
            return { ...prev, address: resolvedAddr };
          }
          return prev;
        });
      });

      if (userProfile?.uid && !isDemo) {
        firestoreService
          .updatePassengerCurrentLocation(userProfile.uid, pos)
          .catch((err) => console.warn('Could not sync user location to Firestore:', err));
      }
    } catch (err: any) {
      console.warn('Geolocation error:', err);
      setHasGpsPermission(false);
      const friendlyError =
        err.message ||
        'Location permission was unavailable or denied. Please enable device GPS or select your pickup location manually.';
      setLocationError(friendlyError);

      if (isDemo) {
        setPickup(DEMO_FALLBACK_LOCATION);
      } else {
        setPickup(null);
      }
    } finally {
      setIsLocating(false);
    }
  }, [userProfile?.uid, isDemo]);

  useEffect(() => {
    fetchCurrentLocation();
  }, [fetchCurrentLocation]);

  // Recalculate route metrics whenever pickup or destination coordinate changes
  useEffect(() => {
    if (pickup && destination) {
      const dist = calculateDistanceKm(
        pickup.latitude,
        pickup.longitude,
        destination.coordinates.latitude,
        destination.coordinates.longitude
      );
      const dur = estimateDurationMin(dist);
      setRouteDistanceKm(dist);
      setRouteDurationMin(dur);
    } else {
      setRouteDistanceKm(0);
      setRouteDurationMin(0);
    }
  }, [
    pickup?.latitude,
    pickup?.longitude,
    destination?.coordinates.latitude,
    destination?.coordinates.longitude,
  ]);

  // Calculate all ride options using the fareService
  const calculatedRideOptions = useMemo(() => {
    const optionsMap = fareService.calculateAllRideOptions(
      pricingConfigs,
      routeDistanceKm,
      routeDurationMin
    );
    const types: VehicleType[] = ['economy', 'comfort', 'xl', 'moto'];
    return types.map((type) => {
      const breakdown = optionsMap[type];
      const config = pricingConfigs[type] || ZAKA_DEFAULT_LAUNCH_PRICING[type];
      return {
        type,
        name: config.name,
        tagline: config.tagline,
        capacity: config.passengerCapacity,
        etaMins: config.estimatedEtaMins,
        fare: breakdown.totalFare,
        formattedFare: fareService.formatZAR(breakdown.totalFare),
        breakdown,
      };
    });
  }, [pricingConfigs, routeDistanceKm, routeDurationMin]);

  // Selected Option Breakdown
  const selectedOption = useMemo(() => {
    return (
      calculatedRideOptions.find((opt) => opt.type === selectedRideType) ||
      calculatedRideOptions[0]
    );
  }, [calculatedRideOptions, selectedRideType]);

  // Open Destination Picker
  const handleOpenDestinationSearch = () => {
    setIsSelectingPickup(false);
    setSearchModalOpen(true);
  };

  // Open Pickup Picker
  const handleOpenPickupSearch = () => {
    setIsSelectingPickup(true);
    setSearchModalOpen(true);
  };

  // Destination Selected
  const handleSelectDestination = (dest: {
    address: string;
    coordinates: LocationCoordinates;
    name?: string;
  }) => {
    hapticsService.light().catch(() => {});
    setDestination(dest);
  };

  // Pickup Selected
  const handleSelectPickup = (newPickup: {
    address: string;
    coordinates: LocationCoordinates;
    name?: string;
  }) => {
    hapticsService.light().catch(() => {});
    const updated: PassengerLocation = {
      latitude: newPickup.coordinates.latitude,
      longitude: newPickup.coordinates.longitude,
      address: newPickup.address,
      timestamp: Date.now(),
    };
    setPickup(updated);
  };

  // Clear selected destination
  const handleClearDestination = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDestination(null);
  };

  // Handle Confirm Ride
  const handleConfirmRide = async () => {
    if (!pickup || !destination || !selectedOption) return;

    hapticsService.medium().catch(() => {});
    setIsSubmittingRide(true);
    try {
      onConfirmRideReady?.({
        pickup,
        destination,
        rideType: selectedRideType,
        estimatedFare: selectedOption.fare,
        distanceKm: routeDistanceKm,
        durationMin: routeDurationMin,
        paymentMethod,
        fareBreakdown: selectedOption.breakdown,
      });
    } catch (e) {
      console.error('Error confirming ride:', e);
    } finally {
      setIsSubmittingRide(false);
    }
  };

  // Display destinations: User recent destinations or curated South African hubs
  const displayDestinations = useMemo(() => {
    if (recentDestinations.length > 0) {
      return recentDestinations.slice(0, 4);
    }
    return DEFAULT_SAVED_HUBS;
  }, [recentDestinations]);

  return (
    <div className="relative flex flex-1 w-full max-w-full flex-col min-h-0 bg-white overflow-hidden">
      {/* 
        =============================================================================
        2. DEDICATED MAP SECTION DIRECTLY UNDERNEATH HEADER
        Contained strictly in this top section, displaying pickup point and drivers
        =============================================================================
      */}
      <div className="relative w-full h-[35vh] min-h-[200px] max-h-[340px] shrink-0 bg-[#F2F2EE] border-b border-black/[0.08] overflow-hidden">
        <InteractiveMap
          pickupLocation={pickup}
          destinationLocation={
            destination
              ? {
                  latitude: destination.coordinates.latitude,
                  longitude: destination.coordinates.longitude,
                  address: destination.address,
                  name: destination.name,
                }
              : null
          }
          nearbyDrivers={nearbyDriversForMap}
          isDemo={isDemo}
          className="h-full w-full"
          onMapClick={(coords) => {
            const instantName = geocodingService.getInstantFallbackAddress(
              coords.latitude,
              coords.longitude
            );

            if (!destination) {
              setDestination({
                address: instantName,
                coordinates: coords,
                name: instantName,
              });

              locationService.resolveAddressInBackground(
                coords.latitude,
                coords.longitude,
                (resolvedAddr) => {
                  setDestination((prev) => {
                    if (
                      !prev ||
                      prev.coordinates.latitude !== coords.latitude ||
                      prev.coordinates.longitude !== coords.longitude
                    ) {
                      return prev;
                    }
                    return {
                      ...prev,
                      address: resolvedAddr,
                      name: resolvedAddr.split(',')[0].trim(),
                    };
                  });
                }
              );
            } else if (isSelectingPickup) {
              setPickup({
                latitude: coords.latitude,
                longitude: coords.longitude,
                address: instantName,
                timestamp: Date.now(),
              });
              setIsSelectingPickup(false);

              locationService.resolveAddressInBackground(
                coords.latitude,
                coords.longitude,
                (resolvedAddr) => {
                  setPickup((prev) => {
                    if (
                      !prev ||
                      prev.latitude !== coords.latitude ||
                      prev.longitude !== coords.longitude
                    ) {
                      return prev;
                    }
                    return {
                      ...prev,
                      address: resolvedAddr,
                    };
                  });
                }
              );
            }
          }}
          onPickupMoved={(newCoords) => {
            const instantAddr = geocodingService.getInstantFallbackAddress(
              newCoords.latitude,
              newCoords.longitude
            );
            setPickup({
              latitude: newCoords.latitude,
              longitude: newCoords.longitude,
              address: instantAddr,
              timestamp: Date.now(),
            });

            locationService.resolveAddressInBackground(
              newCoords.latitude,
              newCoords.longitude,
              (resolvedAddr) => {
                setPickup((prev) => {
                  if (
                    !prev ||
                    prev.latitude !== newCoords.latitude ||
                    prev.longitude !== newCoords.longitude
                  ) {
                    return prev;
                  }
                  return {
                    ...prev,
                    address: resolvedAddr,
                  };
                });
              }
            );
          }}
          estimatedDurationMin={routeDurationMin > 0 ? routeDurationMin : undefined}
          onRouteCalculated={(route) => {
            if (route.distanceKm > 0) {
              setRouteDistanceKm(route.distanceKm);
              setRouteDurationMin(route.durationMin);
            }
          }}
        />
      </div>

      {/* 
        =============================================================================
        3. WHITE BOOKING / SEARCH PANEL (Directly below map, solid white background)
        =============================================================================
      */}
      <div className="flex-1 w-full bg-white overflow-y-auto min-h-0 flex flex-col">
        {!destination ? (
          /* ========================================================================= */
          /* STATE 1: WHITE BOOKING & SEARCH PANEL ("Where are you going?")           */
          /* ========================================================================= */
          <div className="w-full max-w-2xl mx-auto p-4 sm:p-6 pb-28 sm:pb-32 flex flex-col space-y-4">
            
            {/* Current Pickup Summary */}
            <div className="flex items-center justify-between pb-3.5 border-b border-black/[0.06]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FF7A00]/10 text-[#FF7A00]">
                  <div className="h-2 w-2 rounded-full bg-[#FF7A00]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">
                    Current Pickup
                  </p>
                  <p className="text-xs font-semibold text-[#111111] truncate">
                    {isLocating ? 'Detecting GPS location...' : pickup?.address || 'Set pickup point'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleOpenPickupSearch}
                className="text-xs font-semibold text-[#FF7A00] hover:text-[#e06b00] px-2.5 py-1 rounded-lg hover:bg-orange-50/80 transition-colors shrink-0 cursor-pointer"
              >
                Change
              </button>
            </div>

            {/* Title: Where are you going? */}
            <div className="pt-0.5">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111111]">
                Where are you going?
              </h2>
            </div>

            {/* Destination Search Field Button */}
            <button
              id="btn-rider-search-destination"
              type="button"
              onClick={handleOpenDestinationSearch}
              className="flex w-full items-center justify-between rounded-2xl bg-[#F7F7F5] border border-neutral-200/70 px-4 py-3.5 text-left text-neutral-800 shadow-2xs hover:border-neutral-300 hover:bg-neutral-100/80 active:scale-[0.99] transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Search className="h-4.5 w-4.5 text-[#6B6B6B] group-hover:text-[#FF7A00] transition-colors shrink-0" />
                <span className="text-sm font-medium text-[#6B6B6B] group-hover:text-[#111111] transition-colors truncate">
                  Search destination
                </span>
              </div>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-neutral-400 group-hover:text-[#111111] shadow-2xs border border-neutral-200/60 transition-all shrink-0">
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </button>

            {/* Recent Destinations Section */}
            <div className="pt-2 border-t border-black/[0.04]">
              <div className="flex items-center justify-between mb-2 px-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">
                  Recent Destinations
                </span>
              </div>

              <div className="space-y-1">
                {displayDestinations.slice(0, 4).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      handleSelectDestination({
                        address: item.address,
                        coordinates: { latitude: item.latitude, longitude: item.longitude },
                        name: item.name,
                      })
                    }
                    className="flex w-full items-center justify-between rounded-xl p-2.5 hover:bg-[#F7F7F5] border border-transparent hover:border-neutral-200/50 transition-all text-left cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F7F7F5] text-[#6B6B6B] group-hover:bg-[#FF7A00]/10 group-hover:text-[#FF7A00] transition-colors">
                        <Clock className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-[#111111] truncate">
                          {item.name}
                        </p>
                        <p className="text-[11px] text-[#6B6B6B] truncate font-normal">
                          {item.address}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-neutral-300 group-hover:text-[#111111] transition-colors shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>

            {/* Footer Trust & Quick Actions */}
            <div className="pt-3 border-t border-black/[0.06] flex items-center justify-between text-xs text-[#6B6B6B]">
              <button
                type="button"
                onClick={() => setShowSafetyModal(true)}
                className="flex items-center gap-1.5 hover:text-[#111111] font-medium transition-colors cursor-pointer"
              >
                <Shield className="h-3.5 w-3.5 text-[#FF7A00]" />
                <span>Safety & SOS</span>
              </button>
              <span className="text-neutral-300">•</span>
              <button
                type="button"
                onClick={() => setShowFaresModal(true)}
                className="flex items-center gap-1.5 hover:text-[#111111] font-medium transition-colors cursor-pointer"
              >
                <CreditCard className="h-3.5 w-3.5 text-[#FF7A00]" />
                <span>Upfront Rates</span>
              </button>
              <span className="text-neutral-300">•</span>
              <button
                type="button"
                onClick={onOpenHistory}
                className="flex items-center gap-1.5 hover:text-[#111111] font-medium transition-colors cursor-pointer"
              >
                <Clock className="h-3.5 w-3.5 text-neutral-400" />
                <span>Trip History</span>
              </button>
            </div>

          </div>
        ) : (
          /* ========================================================================= */
          /* STATE 2: VEHICLE SELECTION & BOOKING ("Choose your ride")                */
          /* ========================================================================= */
          <div className="w-full max-w-2xl mx-auto p-4 sm:p-6 pb-28 sm:pb-32 flex flex-col space-y-4">
            
            {/* Top Bar: Back & Clear */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <button
                type="button"
                onClick={handleClearDestination}
                className="flex items-center gap-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Change Destination</span>
              </button>
              <button
                type="button"
                onClick={handleClearDestination}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Route Summary Card: High-Clarity Pickup & Destination Blocks */}
            <div className="rounded-2xl bg-[#F7F7F5] border border-neutral-200/90 p-4 space-y-3 shadow-2xs">
              {/* Pickup Section */}
              <div
                onClick={handleOpenPickupSearch}
                className="flex items-start gap-3.5 cursor-pointer group"
              >
                {/* ZAKA Orange Pickup Icon */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FF7A00]/15 text-[#FF7A00] mt-0.5 border border-[#FF7A00]/30 shadow-2xs group-hover:scale-105 transition-transform">
                  <div className="h-3 w-3 rounded-full bg-[#FF7A00] ring-2 ring-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#FF7A00]">
                      Pickup
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[#111111] leading-snug break-words group-hover:text-[#FF7A00] transition-colors mt-0.5">
                    {pickup?.address || 'Set pickup point'}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-medium text-neutral-400 group-hover:text-neutral-700 transition-colors shrink-0 mt-1">
                  <span>Edit</span>
                  <Edit3 className="h-3 w-3" />
                </div>
              </div>

              {/* Connecting Route Guide */}
              <div className="flex items-center gap-3 pl-3.5">
                <div className="h-4 w-0.5 bg-neutral-300 rounded-full" />
              </div>

              {/* Destination Section */}
              <div
                onClick={handleOpenDestinationSearch}
                className="flex items-start gap-3.5 cursor-pointer group"
              >
                {/* Distinct Black/Charcoal Destination Icon with Orange Core */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#111111] text-white mt-0.5 border border-black/20 shadow-2xs group-hover:scale-105 transition-transform">
                  <div className="relative flex items-center justify-center">
                    <MapPin className="h-4 w-4 text-[#FF7A00]" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#111111]">
                      Drop-off
                    </span>
                  </div>
                  <p className="text-xs font-bold text-[#111111] leading-snug break-words group-hover:text-[#FF7A00] transition-colors mt-0.5">
                    {destination.name ? `${destination.name} — ${destination.address}` : destination.address}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-medium text-neutral-400 group-hover:text-neutral-700 transition-colors shrink-0 mt-1">
                  <span>Change</span>
                  <ChevronRight className="h-3 w-3" />
                </div>
              </div>
            </div>

            {/* Route Distance & Time */}
            {routeDistanceKm > 0 && (
              <div className="flex items-center justify-between text-xs text-[#6B6B6B] px-1">
                <span className="font-medium">Estimated Trip</span>
                <span className="font-bold text-[#111111]">
                  {routeDistanceKm} km • ~{routeDurationMin} min
                </span>
              </div>
            )}

            {/* Vehicle Selection Header */}
            <div className="pt-1 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#111111]">Choose your ride</h3>
              <span className="text-[11px] font-medium text-[#6B6B6B]">Upfront ZAR Fares</span>
            </div>

            {/* Ride Options Grid */}
            <div className="space-y-2.5">
              {calculatedRideOptions.map((opt) => {
                const isSelected = selectedRideType === opt.type;

                return (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => {
                      hapticsService.selection().catch(() => {});
                      setSelectedRideType(opt.type);
                    }}
                    className={`flex w-full items-center justify-between rounded-2xl p-3.5 text-left transition-all relative cursor-pointer ${
                      isSelected
                        ? 'border-2 border-[#FF7A00] bg-orange-50/20 shadow-[0_4px_16px_rgba(255,122,0,0.1)]'
                        : 'border border-neutral-200/80 bg-white hover:border-neutral-300'
                    }`}
                  >
                    {/* Vehicle Icon / Glyph */}
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold ${
                          isSelected
                            ? 'bg-[#FF7A00] text-white shadow-[0_3px_10px_rgba(255,122,0,0.25)]'
                            : 'bg-neutral-100 text-neutral-800'
                        }`}
                      >
                        {opt.type === 'moto' ? '🏍️' : opt.type === 'comfort' ? '✨' : opt.type === 'xl' ? '🚙' : '🚗'}
                      </div>

                      {/* Vehicle Info */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-[#111111]">{opt.name}</p>
                          <span className="flex items-center gap-0.5 text-[10px] font-semibold text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded-md">
                            <Users className="h-3 w-3" />
                            <span>{opt.capacity}</span>
                          </span>
                        </div>
                        <p className="text-xs text-[#6B6B6B] mt-0.5 truncate">
                          {opt.tagline} • {opt.etaMins}m away
                        </p>
                      </div>
                    </div>

                    {/* Fare & Check Indicator */}
                    <div className="text-right shrink-0 pl-2">
                      <p className="text-base font-bold text-[#111111]">
                        {opt.formattedFare}
                      </p>
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#FF7A00]">
                          <Check className="h-3 w-3" /> Selected
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Fare Breakdown Dropdown */}
            {selectedOption && (
              <div className="rounded-xl border border-neutral-200/80 bg-[#F7F7F5] p-3 text-xs">
                <button
                  type="button"
                  onClick={() => setShowFareBreakdown(!showFareBreakdown)}
                  className="flex w-full items-center justify-between font-semibold text-neutral-800 hover:text-neutral-950 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5 text-[#FF7A00]" />
                    <span>Fare Breakdown ({selectedOption.name})</span>
                  </span>
                  {showFareBreakdown ? (
                    <ChevronUp className="h-4 w-4 text-neutral-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-neutral-500" />
                  )}
                </button>

                {showFareBreakdown && (
                  <div className="mt-2.5 space-y-1.5 border-t border-neutral-200/80 pt-2 text-[11px] text-[#6B6B6B]">
                    <div className="flex justify-between">
                      <span>Base Fare:</span>
                      <span className="font-semibold text-neutral-900">
                        {fareService.formatZAR(selectedOption.breakdown.baseFare)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Distance ({routeDistanceKm} km):</span>
                      <span className="font-semibold text-neutral-900">
                        {fareService.formatZAR(selectedOption.breakdown.distanceFare)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Estimated Time ({routeDurationMin} min):</span>
                      <span className="font-semibold text-neutral-900">
                        {fareService.formatZAR(selectedOption.breakdown.timeFare)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-neutral-200 pt-1.5 font-bold text-neutral-900">
                      <span>Total Fare:</span>
                      <span className="text-xs text-[#FF7A00] font-bold">
                        {selectedOption.formattedFare}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Payment Method Selector */}
            <div className="flex items-center justify-between rounded-xl border border-neutral-200/80 bg-white p-3 text-xs">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-[#111111]">
                  {paymentMethod === 'cash' ? <CreditCard className="h-3.5 w-3.5" /> : <Wallet className="h-3.5 w-3.5" />}
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-[#6B6B6B]">Payment Method</p>
                  <p className="font-bold text-[#111111]">
                    {paymentMethod === 'cash' ? 'Cash to Driver' : 'ZAKA In-App Wallet'}
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    paymentMethod === 'cash'
                      ? 'bg-[#111111] text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  Cash
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('wallet')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    paymentMethod === 'wallet'
                      ? 'bg-[#111111] text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  Wallet
                </button>
              </div>
            </div>

            {/* Primary Action Button: Confirm Ride */}
            <div className="pt-2">
              <button
                id="btn-confirm-ride-action"
                type="button"
                disabled={isSubmittingRide || !selectedOption}
                onClick={handleConfirmRide}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#FF7A00] py-3.5 px-4 text-sm font-bold text-white shadow-[0_4px_16px_rgba(255,122,0,0.28)] hover:bg-[#e06b00] active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingRide ? (
                  <span>Requesting ZAKA Ride...</span>
                ) : (
                  <>
                    <span>Confirm {selectedOption?.name} • {selectedOption?.formattedFare}</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>

          </div>
        )}
      </div>

      {/* Destination & Pickup Search Modal */}
      <DestinationSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onSelectDestination={handleSelectDestination}
        onSelectPickup={handleSelectPickup}
        currentPickup={pickup}
        isSelectingPickup={isSelectingPickup}
      />

      {/* Safety & SOS Modal */}
      {showSafetyModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-2xl border border-neutral-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-[#FF7A00]" />
                <h3 className="text-base font-bold text-[#111111]">Safety & SOS Center</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSafetyModal(false)}
                className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-xs text-neutral-600">
              <div className="rounded-xl bg-orange-50/60 border border-orange-200 p-3">
                <p className="font-bold text-orange-950">4-Digit Verification PIN</p>
                <p className="text-orange-800 text-[11px] mt-0.5">
                  Every ride requires sharing your one-time PIN with the driver before the trip can begin.
                </p>
              </div>
              <div className="rounded-xl bg-neutral-50 p-3 border border-neutral-100">
                <p className="font-bold text-neutral-900">Real-time GPS Tracking & Sharing</p>
                <p className="text-neutral-500 text-[11px] mt-0.5">
                  Share your live trip progress and driver details with trusted emergency contacts at any time.
                </p>
              </div>
              <a
                href="tel:10111"
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-red-600 py-3 text-xs font-bold text-white hover:bg-red-700 shadow-xs"
              >
                <AlertCircle className="h-4 w-4" />
                Emergency Services (10111)
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Upfront Fares Modal */}
      {showFaresModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-2xl border border-neutral-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-[#FF7A00]" />
                <h3 className="text-base font-bold text-[#111111]">Upfront Fare Transparency</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFaresModal(false)}
                className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-2.5 text-xs text-neutral-600">
              <p className="font-medium">
                ZAKA calculates upfront fares in South African Rand (ZAR) based on standard distance and duration metrics:
              </p>
              <div className="rounded-xl bg-neutral-50 p-3 border border-neutral-100 space-y-1.5 text-[11px]">
                <div className="flex justify-between font-bold text-neutral-800">
                  <span>Economy Base:</span>
                  <span>R20.00 base + R9.50/km</span>
                </div>
                <div className="flex justify-between font-bold text-neutral-800">
                  <span>Comfort Base:</span>
                  <span>R30.00 base + R13.00/km</span>
                </div>
                <div className="flex justify-between font-bold text-neutral-800">
                  <span>Driver Commission:</span>
                  <span className="text-emerald-600">85% to Driver (Only 15% ZAKA)</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFaresModal(false)}
                className="mt-2 w-full rounded-xl bg-neutral-900 py-3 text-xs font-bold text-white hover:bg-black cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
