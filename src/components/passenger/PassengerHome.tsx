/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Passenger Home Screen
 * Premium Modern African Mobility Interface:
 * Map as Visual Hero + Floating Destination Panel + Refined Cards & Typography (#ff860d Accent)
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
  SavedPlace,
  ACTIVE_VEHICLE_TYPES,
} from '../../types';
import { fareService, ZAKA_DEFAULT_LAUNCH_PRICING } from '../../services/fareService';
import { hapticsService } from '../../services/hapticsService';
import { onGoHome } from '../../utils/appEvents';
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
  Car,
  CarFront,
  Bus,
  Briefcase,
  Plane,
  Star,
} from 'lucide-react';

// One simple line icon per ride type
const RIDE_TYPE_ICONS: Record<VehicleType, React.ComponentType<{ className?: string }>> = {
  economy: Car,
  comfort: CarFront,
  xl: Bus,
  moto: Car,
};

const SAVED_PLACE_ICONS: Record<SavedPlace['icon'], React.ComponentType<{ className?: string }>> = {
  home: Home,
  work: Briefcase,
  airport: Plane,
  favorite: Star,
};

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
  }) => void | Promise<void>;
  // Why the last ride request could not be made (shown next to the Confirm button)
  requestError?: string | null;
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
  requestError,
}) => {
  const { userProfile, passengerProfile, isDemoTestMode } = useAuth();
  const savedPlaces = passengerProfile?.savedPlaces || [];
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
  const [confirmNotice, setConfirmNotice] = useState<string | null>(null);

  // ZAKA logo pressed: back to the start of the booking flow
  useEffect(
    () =>
      onGoHome(() => {
        setDestination(null);
        setSearchModalOpen(false);
        setIsSelectingPickup(false);
        setShowSafetyModal(false);
        setShowFaresModal(false);
        setConfirmNotice(null);
      }),
    []
  );

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
    return ACTIVE_VEHICLE_TYPES.map((type) => {
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
    if (isSubmittingRide || !destination || !selectedOption) return;
    setConfirmNotice(null);

    // Without a pickup point nothing can be requested: say so instead of ignoring the tap
    if (!pickup) {
      setConfirmNotice('Please set your pickup location before confirming your ride.');
      handleOpenPickupSearch();
      return;
    }

    hapticsService.medium().catch(() => {});
    setIsSubmittingRide(true);
    try {
      // Awaited so the button stays in its "Requesting" state until the ride exists or has failed
      await onConfirmRideReady?.({
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
      setConfirmNotice('We could not request your ride. Please try again.');
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
      <div className="relative w-full h-[35vh] min-h-[200px] max-h-[340px] shrink-0 bg-surface-2 border-b border-black/[0.08] overflow-hidden">
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
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-text">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">
                    Current Pickup
                  </p>
                  <p className="text-xs font-semibold text-ink truncate">
                    {isLocating ? 'Detecting GPS location...' : pickup?.address || 'Set pickup point'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleOpenPickupSearch}
                className="text-xs font-semibold text-primary-text hover:text-primary-hover px-2.5 py-1 rounded-full hover:bg-orange-50/80 transition-colors shrink-0 cursor-pointer"
              >
                Change
              </button>
            </div>

            {/* Title: Where are you going? */}
            <div className="pt-0.5">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
                Where are you going?
              </h2>
            </div>

            {/* Destination Search Field Button */}
            <button
              id="btn-rider-search-destination"
              type="button"
              onClick={handleOpenDestinationSearch}
              className="flex w-full items-center justify-between rounded-card bg-surface-2 border border-neutral-200/70 px-4 py-3.5 text-left text-ink hover:border-neutral-300 hover:bg-neutral-100/80 active:scale-[0.99] transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Search className="h-4.5 w-4.5 text-ink-2 group-hover:text-primary-text transition-colors shrink-0" />
                <span className="text-sm font-medium text-ink-2 group-hover:text-ink transition-colors truncate">
                  Search destination
                </span>
              </div>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-neutral-400 group-hover:text-ink border border-neutral-200/60 transition-all shrink-0">
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </button>

            {/* Saved (favourite) places: one tap pins the place on the map as the destination */}
            <div className="pt-2 border-t border-black/[0.04]">
              <div className="flex items-center justify-between mb-2 px-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">
                  Saved Places
                </span>
                <button
                  id="btn-manage-saved-places"
                  type="button"
                  onClick={onOpenProfile}
                  className="text-[11px] font-semibold text-primary-text hover:text-primary-hover cursor-pointer"
                >
                  {savedPlaces.length > 0 ? 'Manage' : 'Add a place'}
                </button>
              </div>
              {savedPlaces.length === 0 ? (
                <p className="px-0.5 text-[11px] text-ink-3">
                  Save your home, work and other favourite addresses for one-tap booking.
                </p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {savedPlaces.map((place) => {
                    const PlaceIcon = SAVED_PLACE_ICONS[place.icon] || Star;
                    return (
                      <button
                        key={place.id}
                        type="button"
                        title={place.address}
                        onClick={() =>
                          handleSelectDestination({
                            address: place.address,
                            coordinates: place.location,
                            name: place.label,
                          })
                        }
                        className="flex shrink-0 items-center gap-2 rounded-full border border-neutral-200/80 bg-white py-1.5 pl-2 pr-3.5 text-left hover:border-primary hover:bg-primary-50 transition-colors cursor-pointer max-w-[220px]"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-text">
                          <PlaceIcon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-ink truncate">{place.label}</span>
                          <span className="block text-[11px] text-ink-2 truncate">{place.address}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recent Destinations Section */}
            <div className="pt-2 border-t border-black/[0.04]">
              <div className="flex items-center justify-between mb-2 px-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">
                  {recentDestinations.length > 0 ? 'Recent Destinations' : 'Popular Destinations'}
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
                    className="flex w-full items-center justify-between rounded-card p-2.5 hover:bg-surface-2 border border-transparent hover:border-neutral-200/50 transition-all text-left cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2 group-hover:bg-primary-50 group-hover:text-primary-text transition-colors">
                        <Clock className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-ink truncate">
                          {item.name}
                        </p>
                        <p className="text-[11px] text-ink-2 truncate font-normal">
                          {item.address}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-neutral-300 group-hover:text-ink transition-colors shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>

            {/* Footer Trust & Quick Actions */}
            <div className="pt-3 border-t border-black/[0.06] flex items-center justify-between text-xs text-ink-2">
              <button
                type="button"
                onClick={() => setShowSafetyModal(true)}
                className="flex items-center gap-1.5 hover:text-ink font-medium transition-colors cursor-pointer"
              >
                <Shield className="h-3.5 w-3.5 text-primary-text" />
                <span>Safety & SOS</span>
              </button>
              <span className="text-neutral-300">•</span>
              <button
                type="button"
                onClick={() => setShowFaresModal(true)}
                className="flex items-center gap-1.5 hover:text-ink font-medium transition-colors cursor-pointer"
              >
                <CreditCard className="h-3.5 w-3.5 text-primary-text" />
                <span>Upfront Rates</span>
              </button>
              <span className="text-neutral-300">•</span>
              <button
                type="button"
                onClick={onOpenHistory}
                className="flex items-center gap-1.5 hover:text-ink font-medium transition-colors cursor-pointer"
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
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <button
                type="button"
                onClick={handleClearDestination}
                className="flex items-center gap-2 text-xs font-semibold text-ink-2 hover:text-ink transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Change Destination</span>
              </button>
              <button
                type="button"
                onClick={handleClearDestination}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-ink-3 hover:bg-neutral-200 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Route Summary Card: High-Clarity Pickup & Destination Blocks */}
            <div className="rounded-card bg-surface-2 border border-neutral-200/90 p-4 space-y-3 ">
              {/* Pickup Section */}
              <div
                onClick={handleOpenPickupSearch}
                className="flex items-start gap-3.5 cursor-pointer group"
              >
                {/* ZAKA Orange Pickup Icon */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-text mt-0.5 border border-primary/30 group-hover:scale-105 transition-transform">
                  <div className="h-3 w-3 rounded-full bg-primary ring-2 ring-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-primary-text">
                      Pickup
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-ink leading-snug break-words group-hover:text-primary-text transition-colors mt-0.5">
                    {pickup?.address || 'Set pickup point'}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-medium text-neutral-400 group-hover:text-ink-2 transition-colors shrink-0 mt-1">
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
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-white mt-0.5 border border-black/20 group-hover:scale-105 transition-transform">
                  <div className="relative flex items-center justify-center">
                    <MapPin className="h-4 w-4 text-primary-text" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-ink">
                      Drop-off
                    </span>
                  </div>
                  <p className="text-xs font-bold text-ink leading-snug break-words group-hover:text-primary-text transition-colors mt-0.5">
                    {destination.name ? `${destination.name} — ${destination.address}` : destination.address}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-medium text-neutral-400 group-hover:text-ink-2 transition-colors shrink-0 mt-1">
                  <span>Change</span>
                  <ChevronRight className="h-3 w-3" />
                </div>
              </div>
            </div>

            {/* Route Distance & Time */}
            {routeDistanceKm > 0 && (
              <div className="flex items-center justify-between text-xs text-ink-2 px-1">
                <span className="font-medium">Estimated Trip</span>
                <span className="font-bold text-ink">
                  {routeDistanceKm} km • ~{routeDurationMin} min
                </span>
              </div>
            )}

            {/* Vehicle Selection Header */}
            <div className="pt-1 flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink">Choose your ride</h3>
              <span className="text-[11px] font-medium text-ink-2">Upfront ZAR Fares</span>
            </div>

            {/* Ride Options Grid */}
            <div className="space-y-2.5">
              {calculatedRideOptions.map((opt) => {
                const isSelected = selectedRideType === opt.type;
                const RideIcon = RIDE_TYPE_ICONS[opt.type];

                return (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => {
                      hapticsService.selection().catch(() => {});
                      setSelectedRideType(opt.type);
                    }}
                    className={`flex w-full items-center justify-between rounded-card p-3.5 text-left transition-all relative cursor-pointer ${
                      isSelected
                        ? 'border-2 border-primary bg-orange-50/20 '
                        : 'border border-neutral-200/80 bg-white hover:border-neutral-300'
                    }`}
                  >
                    {/* Vehicle Icon */}
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                          isSelected
                            ? 'bg-primary text-on-primary '
                            : 'bg-surface-2 text-ink'
                        }`}
                      >
                        <RideIcon className="h-5 w-5" />
                      </div>

                      {/* Vehicle Info */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-ink">{opt.name}</p>
                          <span className="flex items-center gap-0.5 text-[11px] font-semibold text-ink-3 bg-surface-2 px-1.5 py-0.5 rounded-md">
                            <Users className="h-3 w-3" />
                            <span>{opt.capacity}</span>
                          </span>
                        </div>
                        <p className="text-xs text-ink-2 mt-0.5 truncate">
                          {opt.tagline} • {opt.etaMins}m away
                        </p>
                      </div>
                    </div>

                    {/* Fare & Check Indicator */}
                    <div className="text-right shrink-0 pl-2">
                      <p className="text-base font-bold text-ink">
                        {opt.formattedFare}
                      </p>
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-text">
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
              <div className="rounded-xl border border-neutral-200/80 bg-surface-2 p-3 text-xs">
                <button
                  type="button"
                  onClick={() => setShowFareBreakdown(!showFareBreakdown)}
                  className="flex w-full items-center justify-between font-semibold text-ink hover:text-neutral-950 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5 text-primary-text" />
                    <span>Fare Breakdown ({selectedOption.name})</span>
                  </span>
                  {showFareBreakdown ? (
                    <ChevronUp className="h-4 w-4 text-ink-3" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-ink-3" />
                  )}
                </button>

                {showFareBreakdown && (
                  <div className="mt-2.5 space-y-1.5 border-t border-neutral-200/80 pt-2 text-[11px] text-ink-2">
                    <div className="flex justify-between">
                      <span>Base Fare:</span>
                      <span className="font-semibold text-ink">
                        {fareService.formatZAR(selectedOption.breakdown.baseFare)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Distance ({routeDistanceKm} km):</span>
                      <span className="font-semibold text-ink">
                        {fareService.formatZAR(selectedOption.breakdown.distanceFare)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Estimated Time ({routeDurationMin} min):</span>
                      <span className="font-semibold text-ink">
                        {fareService.formatZAR(selectedOption.breakdown.timeFare)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-line pt-1.5 font-bold text-ink">
                      <span>Total Fare:</span>
                      <span className="text-xs text-primary-text font-bold">
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
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-ink">
                  {paymentMethod === 'cash' ? <CreditCard className="h-3.5 w-3.5" /> : <Wallet className="h-3.5 w-3.5" />}
                </div>
                <div>
                  <p className="text-[11px] uppercase font-semibold text-ink-2">Payment Method</p>
                  <p className="font-bold text-ink">
                    {paymentMethod === 'cash' ? 'Cash to Driver' : 'ZAKA In-App Wallet'}
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                    paymentMethod === 'cash'
                      ? 'bg-ink text-white'
                      : 'bg-surface-2 text-ink-2 hover:bg-neutral-200'
                  }`}
                >
                  Cash
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('wallet')}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                    paymentMethod === 'wallet'
                      ? 'bg-ink text-white'
                      : 'bg-surface-2 text-ink-2 hover:bg-neutral-200'
                  }`}
                >
                  Wallet
                </button>
              </div>
            </div>

            {/* Primary Action Button: Confirm Ride */}
            <div className="pt-2 space-y-2">
              {(confirmNotice || requestError) && (
                <div
                  id="confirm-ride-error"
                  role="alert"
                  className="flex items-start gap-2 rounded-card border border-red-200 bg-red-50 p-3 text-xs font-bold text-danger"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{confirmNotice || requestError}</span>
                </div>
              )}
              <button
                id="btn-confirm-ride-action"
                type="button"
                disabled={isSubmittingRide || !selectedOption}
                onClick={handleConfirmRide}
                className="w-full flex items-center justify-center gap-2 rounded-full bg-primary py-3.5 px-4 text-sm font-bold text-on-primary hover:bg-primary-hover active:bg-primary-pressed active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="w-full max-w-md rounded-[20px] bg-white p-5 shadow-modal border border-line animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary-text" />
                <h3 className="text-base font-bold text-ink">Safety & SOS Center</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSafetyModal(false)}
                className="rounded-full p-1 text-neutral-400 hover:bg-surface-2 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-xs text-ink-2">
              <div className="rounded-xl bg-orange-50/60 border border-orange-200 p-3">
                <p className="font-bold text-orange-950">4-Digit Verification PIN</p>
                <p className="text-orange-800 text-[11px] mt-0.5">
                  Every ride requires sharing your one-time PIN with the driver before the trip can begin.
                </p>
              </div>
              <div className="rounded-xl bg-surface-2 p-3 border border-line">
                <p className="font-bold text-ink">Real-time GPS Tracking & Sharing</p>
                <p className="text-ink-3 text-[11px] mt-0.5">
                  Share your live trip progress and driver details with trusted emergency contacts at any time.
                </p>
              </div>
              <a
                href="tel:10111"
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-danger py-3 text-xs font-bold text-white hover:bg-red-700 shadow-card"
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
          <div className="w-full max-w-md rounded-[20px] bg-white p-5 shadow-modal border border-line animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary-text" />
                <h3 className="text-base font-bold text-ink">Upfront Fare Transparency</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFaresModal(false)}
                className="rounded-full p-1 text-neutral-400 hover:bg-surface-2 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-2.5 text-xs text-ink-2">
              <p className="font-medium">
                ZAKA calculates upfront fares in South African Rand (ZAR) based on standard distance and duration metrics:
              </p>
              <div className="rounded-xl bg-surface-2 p-3 border border-line space-y-1.5 text-[11px]">
                <div className="flex justify-between font-bold text-ink">
                  <span>Economy Base:</span>
                  <span>R20.00 base + R9.50/km</span>
                </div>
                <div className="flex justify-between font-bold text-ink">
                  <span>Comfort Base:</span>
                  <span>R30.00 base + R13.00/km</span>
                </div>
                <div className="flex justify-between font-bold text-ink">
                  <span>Driver Commission:</span>
                  <span className="text-success">85% to Driver (Only 15% ZAKA)</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFaresModal(false)}
                className="mt-2 w-full rounded-full bg-ink py-3 text-xs font-bold text-white hover:bg-black cursor-pointer"
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
