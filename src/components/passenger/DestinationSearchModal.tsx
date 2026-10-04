/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Destination & Pickup Search Experience
 * Visuals: Clean white panel, high-contrast typography, #ff860d accents, recent places, real-time search
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  ArrowLeft,
  X,
  MapPin,
  Clock,
  Navigation,
  Compass,
  Building,
  Plane,
  ShoppingBag,
  GraduationCap,
  Sparkles,
  Loader2,
  AlertCircle,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import { LocationCoordinates, RecentDestination, PassengerLocation } from '../../types';
import { locationService, geocodingService, GeocodingResult } from '../../services/locationService';
import { firestoreService } from '../../firebase/firestoreService';
import { useAuth } from '../../context/AuthContext';

interface DestinationSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDestination: (dest: { address: string; coordinates: LocationCoordinates; name?: string }) => void;
  onSelectPickup?: (pickup: { address: string; coordinates: LocationCoordinates; name?: string }) => void;
  currentPickup?: (LocationCoordinates & { address?: string; name?: string }) | null;
  isSelectingPickup?: boolean;
}

export const DestinationSearchModal: React.FC<DestinationSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectDestination,
  onSelectPickup,
  currentPickup,
  isSelectingPickup = false,
}) => {
  const { userProfile } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [recentDestinations, setRecentDestinations] = useState<RecentDestination[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGettingCurrentLocation, setIsGettingCurrentLocation] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Load recent destinations from Firestore
  useEffect(() => {
    if (!isOpen) return;

    if (userProfile?.uid) {
      firestoreService
        .getRecentDestinations(userProfile.uid)
        .then((recents) => {
          setRecentDestinations(recents);
        })
        .catch((err) => {
          console.warn('Error loading recent destinations:', err);
        });
    }

    // Auto-focus input after transition
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 150);

    return () => clearTimeout(timer);
  }, [isOpen, userProfile?.uid]);

  // Real-time search with INSTANT local matching and debounced network search
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      setResults([]);
      setIsLoading(false);
      setSearchError(null);
      return;
    }

    // 1. INSTANT LOCAL RESULTS (0ms latency): Display matching curated SA places immediately
    const instantLocalMatches = geocodingService.getInstantCuratedMatches(trimmed);
    if (instantLocalMatches.length > 0) {
      setResults(instantLocalMatches);
      setSearchError(null);
    }

    setIsLoading(true);

    const biasCoords = currentPickup
      ? { latitude: currentPickup.latitude, longitude: currentPickup.longitude }
      : undefined;

    // 2. NETWORK DEBOUNCED SEARCH (350ms): Fetch deeper street-level OSM results
    const debounceTimer = setTimeout(async () => {
      try {
        const searchResults = await locationService.searchPlaces(trimmed, biasCoords);
        // Merge instant matches with network results (de-duplicating by coordinates)
        const seen = new Set<string>();
        const merged: GeocodingResult[] = [];
        for (const item of [...searchResults, ...instantLocalMatches]) {
          const key = `${item.coordinates.latitude.toFixed(3)},${item.coordinates.longitude.toFixed(3)}`;
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(item);
          }
        }

        setResults(merged);
        if (merged.length === 0) {
          setSearchError('No matching places found. Try typing a street, city, or landmark.');
        } else {
          setSearchError(null);
        }
      } catch (err: any) {
        if (instantLocalMatches.length === 0) {
          setSearchError('Unable to fetch places. Please check your connection.');
        }
      } finally {
        setIsLoading(false);
      }
    }, 350);

    return () => clearTimeout(debounceTimer);
  }, [query, currentPickup?.latitude, currentPickup?.longitude]);

  if (!isOpen) return null;

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setSearchError(null);
    inputRef.current?.focus();
  };

  const handleSelectPlace = (place: {
    address: string;
    coordinates: LocationCoordinates;
    name?: string;
  }) => {
    // 1. Fire state update immediately without blocking
    if (isSelectingPickup) {
      onSelectPickup?.(place);
    } else {
      onSelectDestination(place);
      // 2. Asynchronously persist recent destination in the background
      if (userProfile?.uid) {
        firestoreService
          .saveRecentDestination(userProfile.uid, {
            address: place.address,
            name: place.name || place.address.split(',')[0],
            latitude: place.coordinates.latitude,
            longitude: place.coordinates.longitude,
          })
          .catch((e) => console.warn('Error saving recent destination:', e));
      }
    }
    // 3. Close modal immediately
    onClose();
  };

  const handleUseCurrentLocation = async () => {
    setIsGettingCurrentLocation(true);
    setSearchError(null);

    try {
      // Resolves immediately without waiting for Nominatim roundtrip
      const loc = await locationService.getCurrentPosition();
      const place = {
        name: 'Current Location',
        address: loc.address,
        coordinates: {
          latitude: loc.latitude,
          longitude: loc.longitude,
        },
      };

      if (isSelectingPickup) {
        onSelectPickup?.(place);
      } else {
        onSelectDestination(place);
      }
      onClose();
    } catch (e: any) {
      setSearchError(e?.message || 'Could not obtain current GPS position.');
    } finally {
      setIsGettingCurrentLocation(false);
    }
  };

  const handleDeleteRecent = async (e: React.MouseEvent, destId: string) => {
    e.stopPropagation();
    if (!userProfile?.uid) return;
    try {
      await firestoreService.deleteRecentDestination(userProfile.uid, destId);
      setRecentDestinations((prev) => prev.filter((d) => d.id !== destId));
    } catch (err) {
      console.warn('Error deleting recent destination:', err);
    }
  };

  const getPlaceIcon = (type?: string) => {
    switch (type) {
      case 'airport':
        return <Plane className="h-5 w-5 text-ink" />;
      case 'shopping_mall':
        return <ShoppingBag className="h-5 w-5 text-ink" />;
      case 'university':
        return <GraduationCap className="h-5 w-5 text-ink" />;
      default:
        return <MapPin className="h-5 w-5 text-ink" />;
    }
  };

  const curatedPlaces = locationService.getCuratedPlaces();

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white animate-in fade-in duration-200">
      {/* Top Header & Search Bar */}
      <div className="border-b border-line bg-white px-4 pt-4 pb-3 ">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-ink hover:bg-surface-2 active:scale-95 transition-all cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-ink">
              {isSelectingPickup ? 'Set Pickup Location' : 'Where are you going?'}
            </h2>
            <p className="text-xs text-ink-2 truncate max-w-[280px]">
              Pickup: {currentPickup?.address || 'Current Location (Pending selection)'}
            </p>
          </div>
        </div>

        {/* Search Input Container */}
        <div className="relative mt-3">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary-text" />
            ) : (
              <Search className="h-5 w-5 text-ink-2" />
            )}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isSelectingPickup ? 'Search pickup address or landmark' : 'Search destination, mall, airport...'}
            className="w-full rounded-input border border-line bg-surface-2 py-3.5 pl-11 pr-10 text-sm font-medium text-ink placeholder-ink-3 focus:border-primary focus:bg-white focus:outline-none transition-all shadow-inner"
          />
          {query && (
            <button
              onClick={handleClear}
              className="absolute inset-y-0 right-3 flex items-center text-ink-3 hover:text-ink min-h-[44px] min-w-[44px] justify-center"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Results / Recents List Area */}
      <div className="flex-1 overflow-y-auto px-4 py-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/* Option: Use Current Location */}
        <button
          onClick={handleUseCurrentLocation}
          disabled={isGettingCurrentLocation}
          className="flex w-full items-center gap-3.5 rounded-card p-3 text-left hover:bg-surface-2 active:bg-surface-2 transition-colors border-b border-surface-2"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-primary-text">
            {isGettingCurrentLocation ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Navigation className="h-5 w-5 text-primary-text fill-primary/20" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-ink">
              {isGettingCurrentLocation ? 'Detecting exact GPS...' : 'Use current GPS location'}
            </p>
            <p className="text-xs text-ink-2 truncate">Accurate device satellite coordinate</p>
          </div>
          <ChevronRight className="h-4 w-4 text-[#CCCCCC]" />
        </button>

        {/* Live Search Results */}
        {query.trim().length >= 2 ? (
          <div className="mt-3">
            <h3 className="px-2 pb-2 text-xs font-bold tracking-wider text-ink-3 uppercase">
              Search Results
            </h3>

            {searchError && (
              <div className="my-3 flex items-start gap-2.5 rounded-card bg-primary-50 p-3 text-xs text-[#855D00]">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{searchError}</span>
              </div>
            )}

            <div className="space-y-1">
              {results.map((place) => (
                <button
                  key={place.id}
                  onClick={() =>
                    handleSelectPlace({
                      address: place.address,
                      coordinates: place.coordinates,
                      name: place.name,
                    })
                  }
                  className="flex w-full items-center gap-3.5 rounded-card p-3 text-left hover:bg-surface-2 active:bg-surface-2 transition-all"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                    {getPlaceIcon(place.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-ink truncate">{place.name}</p>
                    <p className="text-xs text-ink-2 truncate">{place.secondaryText || place.address}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[#CCCCCC]" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* When not actively searching, show Recent Destinations & Popular Locations */
          <div className="mt-3 space-y-5">
            {/* Recent Destinations from Firestore */}
            {recentDestinations.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-2 pb-2">
                  <h3 className="text-xs font-bold tracking-wider text-ink-3 uppercase flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Recent Destinations
                  </h3>
                </div>
                <div className="space-y-1">
                  {recentDestinations.map((recent) => (
                    <div
                      key={recent.id}
                      onClick={() =>
                        handleSelectPlace({
                          address: recent.address,
                          coordinates: {
                            latitude: recent.latitude,
                            longitude: recent.longitude,
                          },
                          name: recent.name,
                        })
                      }
                      className="group flex w-full cursor-pointer items-center gap-3.5 rounded-card p-3 text-left hover:bg-surface-2 active:bg-surface-2 transition-all"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink">
                        <Clock className="h-5 w-5 text-ink-2" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-ink truncate">
                          {recent.name || recent.address.split(',')[0]}
                        </p>
                        <p className="text-xs text-ink-2 truncate">{recent.address}</p>
                      </div>
                      <button
                        onClick={(e) => handleDeleteRecent(e, recent.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-ink-3 hover:text-[#DC2626] rounded-full transition-all"
                        title="Remove from recents"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Popular Curated Places */}
            <div>
              <h3 className="px-2 pb-2 text-xs font-bold tracking-wider text-ink-3 uppercase flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary-text" />
                Popular Destinations
              </h3>
              <div className="space-y-1">
                {curatedPlaces.slice(0, 6).map((place) => (
                  <button
                    key={place.id}
                    onClick={() =>
                      handleSelectPlace({
                        address: place.address,
                        coordinates: place.coordinates,
                        name: place.name,
                      })
                    }
                    className="flex w-full items-center gap-3.5 rounded-card p-3 text-left hover:bg-surface-2 active:bg-surface-2 transition-all"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                      {getPlaceIcon(place.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-ink truncate">{place.name}</p>
                      <p className="text-xs text-ink-2 truncate">{place.secondaryText}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[#CCCCCC]" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
