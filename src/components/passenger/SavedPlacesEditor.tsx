/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Saved (favourite) places
 * Every change is written to the passenger's account straight away, so saved places are still there
 * after signing out and back in. A place is located by searching for its address or pinning it on the map.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { SavedPlace, LocationCoordinates } from '../../types';
import { locationService, geocodingService, GeocodingResult } from '../../services/locationService';
import { LocationPickerMap } from '../common/LocationPickerMap';
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  Home,
  Loader2,
  LocateFixed,
  MapPin,
  Plane,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react';

const MAX_SAVED_PLACES = 12;

const PLACE_KINDS: { icon: SavedPlace['icon']; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { icon: 'home', label: 'Home', Icon: Home },
  { icon: 'work', label: 'Work', Icon: Briefcase },
  { icon: 'airport', label: 'Airport', Icon: Plane },
  { icon: 'favorite', label: 'Other', Icon: Star },
];

const iconFor = (icon: SavedPlace['icon']) => PLACE_KINDS.find((k) => k.icon === icon)?.Icon || Star;

export const SavedPlacesEditor: React.FC = () => {
  const { passengerProfile, userProfile, updatePassengerProfileData } = useAuth();
  // The account is the single source of truth: there is no unsaved local copy to lose
  const savedPlaces = passengerProfile?.savedPlaces || [];

  const [isAdding, setIsAdding] = useState(false);
  const [kind, setKind] = useState<SavedPlace['icon']>('home');
  const [label, setLabel] = useState('Home');
  const [address, setAddress] = useState('');
  const [pin, setPin] = useState<LocationCoordinates | null>(null);
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const latestPinRef = useRef<LocationCoordinates | null>(null);

  const mapCentre = userProfile?.currentLocation
    ? { latitude: userProfile.currentLocation.latitude, longitude: userProfile.currentLocation.longitude }
    : null;

  // Address search: instant matches from known places, then the full geocoder
  useEffect(() => {
    const query = address.trim();
    // Nothing to look up once the typed text already belongs to the pinned place
    if (!isAdding || query.length < 3 || pin) {
      setResults([]);
      setSearching(false);
      return;
    }
    setResults(geocodingService.getInstantCuratedMatches(query));
    setSearching(true);
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const found = await locationService.searchPlaces(query, mapCentre || undefined);
        if (active) setResults(found.slice(0, 6));
      } catch {
        // keep the instant matches
      } finally {
        if (active) setSearching(false);
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, isAdding, pin?.latitude, pin?.longitude]);

  const resetForm = () => {
    setIsAdding(false);
    setKind('home');
    setLabel('Home');
    setAddress('');
    setPin(null);
    setResults([]);
    setError('');
  };

  const persist = async (next: SavedPlace[], successMessage: string) => {
    if (!passengerProfile) {
      setError('Your profile is still loading. Please try again in a moment.');
      return false;
    }
    setSaving(true);
    setError('');
    try {
      await updatePassengerProfileData({ savedPlaces: next });
      setNotice(successMessage);
      setTimeout(() => setNotice(''), 3000);
      return true;
    } catch (err) {
      console.error('Saving favourite places failed:', err);
      setError('We could not save your places. Please check your connection and try again.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // A pin dropped or dragged on the map: look up the street address for it
  const handlePinMoved = (coords: LocationCoordinates) => {
    setPin(coords);
    setResults([]);
    setError('');
    setAddress(geocodingService.getInstantFallbackAddress(coords.latitude, coords.longitude));
    latestPinRef.current = coords;
    locationService.resolveAddressInBackground(coords.latitude, coords.longitude, (resolved) => {
      // Ignore the answer if the pin has moved on since this lookup started
      if (latestPinRef.current === coords) setAddress(resolved);
    });
  };

  const handlePickResult = (place: GeocodingResult) => {
    latestPinRef.current = place.coordinates;
    setPin(place.coordinates);
    setAddress(place.address || place.name);
    setResults([]);
    setError('');
  };

  const handleUseCurrentLocation = async () => {
    setLocating(true);
    setError('');
    try {
      const here = await locationService.getCurrentPosition();
      handlePinMoved({ latitude: here.latitude, longitude: here.longitude });
    } catch (err: any) {
      setError(err?.message || 'We could not get your current location.');
    } finally {
      setLocating(false);
    }
  };

  const handleSave = async () => {
    const cleanLabel = label.trim();
    if (!cleanLabel) {
      setError('Please give this place a name, for example Home or Gym.');
      return;
    }
    if (!pin) {
      setError('Please choose the address from the search results or drop a pin on the map.');
      return;
    }
    const place: SavedPlace = {
      id: `sp-${Date.now()}`,
      label: cleanLabel.slice(0, 40),
      address: address.trim() || geocodingService.getInstantFallbackAddress(pin.latitude, pin.longitude),
      location: { latitude: pin.latitude, longitude: pin.longitude },
      icon: kind,
    };
    if (await persist([...savedPlaces, place], `${place.label} saved.`)) {
      resetForm();
    }
  };

  const handleDelete = (id: string) => {
    persist(savedPlaces.filter((p) => p.id !== id), 'Place removed.');
  };

  return (
    <div className="space-y-4">
      {notice && (
        <div className="flex items-center gap-2 rounded-card bg-emerald-50 border border-emerald-200 p-3 text-xs font-bold text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-card bg-red-50 border border-red-200 p-3 text-xs font-bold text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-2">
        <span className="text-xs font-bold text-ink">Saved Favourite Locations</span>
        {savedPlaces.length === 0 && !isAdding && (
          <p className="rounded-card border border-dashed border-line p-4 text-center text-xs text-ink-3">
            You have no saved places yet. Add your home, work or any address you travel to often.
          </p>
        )}
        {savedPlaces.map((place) => {
          const PlaceIcon = iconFor(place.icon);
          return (
            <div key={place.id} className="flex items-center justify-between gap-2 rounded-card border border-line bg-surface-2 p-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-text">
                  <PlaceIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-ink truncate">{place.label}</p>
                  <p className="text-[11px] text-ink-3 truncate">{place.address}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(place.id)}
                disabled={saving}
                aria-label={`Remove ${place.label}`}
                className="shrink-0 rounded-full p-1.5 text-neutral-400 hover:bg-red-50 hover:text-danger disabled:opacity-50 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {!isAdding ? (
        <button
          id="btn-add-saved-place"
          type="button"
          onClick={() => {
            setIsAdding(true);
            setError('');
          }}
          disabled={savedPlaces.length >= MAX_SAVED_PLACES}
          className="flex w-full items-center justify-center gap-1.5 rounded-full bg-ink py-2.5 text-xs font-bold text-white hover:bg-black disabled:opacity-50 cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{savedPlaces.length >= MAX_SAVED_PLACES ? 'Saved places limit reached' : 'Add a Place'}</span>
        </button>
      ) : (
        <div className="rounded-card border border-line bg-white p-3 space-y-3">
          <span className="text-xs font-bold text-ink">Add New Place</span>

          <div className="grid grid-cols-4 gap-1.5">
            {PLACE_KINDS.map(({ icon, label: kindLabel, Icon }) => (
              <button
                key={icon}
                type="button"
                aria-pressed={kind === icon}
                onClick={() => {
                  setKind(icon);
                  // Keep a custom name the user typed; only swap one preset name for another
                  if (!label.trim() || PLACE_KINDS.some((k) => k.label === label)) {
                    setLabel(icon === 'favorite' ? '' : kindLabel);
                  }
                }}
                className={`flex flex-col items-center gap-1 rounded-card border py-2 text-[11px] font-bold transition-all cursor-pointer ${
                  kind === icon ? 'border-ink bg-ink text-white' : 'border-line bg-surface-2 text-ink-2'
                }`}
              >
                <Icon className="h-4 w-4" />
                {kindLabel}
              </button>
            ))}
          </div>

          <input
            type="text"
            aria-label="Place name"
            placeholder="Name (e.g. Home, Gym, University)"
            value={label}
            maxLength={40}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-input border border-line bg-surface-2 p-2.5 text-xs text-ink focus:border-primary focus:outline-none"
          />

          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary-text" />
              ) : (
                <Search className="h-4 w-4 text-neutral-400" />
              )}
            </div>
            <input
              type="text"
              aria-label="Address"
              placeholder="Search the address, or pin it on the map below"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                // Typing a different address unpins the old spot until a new one is chosen
                latestPinRef.current = null;
                setPin(null);
              }}
              className="w-full rounded-input border border-line bg-surface-2 py-2.5 pl-9 pr-3 text-xs text-ink focus:border-primary focus:outline-none"
            />
          </div>

          {results.length > 0 && (
            <div className="max-h-44 overflow-y-auto rounded-card border border-line divide-y divide-line">
              {results.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => handlePickResult(place)}
                  className="flex w-full items-center gap-2.5 p-2.5 text-left hover:bg-surface-2 cursor-pointer"
                >
                  <MapPin className="h-4 w-4 shrink-0 text-ink-2" />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-ink truncate">{place.name}</span>
                    <span className="block text-[11px] text-ink-3 truncate">{place.secondaryText || place.address}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          <LocationPickerMap value={pin} onChange={handlePinMoved} fallbackCenter={mapCentre} className="h-52 w-full" />

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={locating}
              className="flex items-center gap-1.5 text-[11px] font-bold text-ink underline disabled:opacity-50 cursor-pointer"
            >
              <LocateFixed className="h-3.5 w-3.5" />
              {locating ? 'Locating…' : 'Use my current location'}
            </button>
            <span className="text-[11px] text-ink-3">{pin ? 'Drag the pin to adjust' : 'No pin yet'}</span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetForm}
              disabled={saving}
              className="rounded-full border border-line px-4 py-2.5 text-xs font-bold text-ink-2 hover:bg-surface-2 cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="btn-save-place"
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-full bg-primary py-2.5 text-xs font-bold text-on-primary hover:bg-primary-hover disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Saving…' : 'Save Place'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
