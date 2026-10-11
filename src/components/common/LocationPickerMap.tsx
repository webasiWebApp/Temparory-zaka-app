/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Location Picker Map
 * A small map for pinning one exact spot: tap the map to drop the pin, or drag the pin to adjust it.
 */

import React, { useEffect } from 'react';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { LocationCoordinates } from '../../types';
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_MAP_ID,
  INTERNAL_USAGE_ATTRIBUTION_ID,
} from '../../config/googleMapsConfig';

interface LocationPickerMapProps {
  value: LocationCoordinates | null;
  onChange: (coords: LocationCoordinates) => void;
  // Where the map opens when nothing is pinned yet
  fallbackCenter?: LocationCoordinates | null;
  className?: string;
}

const DEFAULT_CENTER: LocationCoordinates = { latitude: -26.1458, longitude: 28.0416 };

const round = (n: number) => Number(n.toFixed(6));

const PickerController: React.FC<Pick<LocationPickerMapProps, 'value' | 'onChange'>> = ({ value, onChange }) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const listener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) onChange({ latitude: round(e.latLng.lat()), longitude: round(e.latLng.lng()) });
    });
    return () => listener.remove();
  }, [map, onChange]);

  // Follow the pin when it is set from outside the map (address search, "use my location")
  useEffect(() => {
    if (!map || !value) return;
    map.panTo({ lat: value.latitude, lng: value.longitude });
    if ((map.getZoom() || 0) < 15) map.setZoom(16);
  }, [map, value?.latitude, value?.longitude]);

  return null;
};

export const LocationPickerMap: React.FC<LocationPickerMapProps> = ({ value, onChange, fallbackCenter, className = '' }) => {
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className={`flex items-center justify-center rounded-card border border-line bg-surface-2 p-4 text-center text-xs text-ink-3 ${className}`}>
        The map is unavailable. Search for the address above instead.
      </div>
    );
  }

  const start = value || fallbackCenter || DEFAULT_CENTER;

  return (
    <div className={`zaka-map-mono relative overflow-hidden rounded-card border border-line ${className}`}>
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
        <Map
          mapId={GOOGLE_MAPS_MAP_ID}
          renderingType="RASTER"
          defaultCenter={{ lat: start.latitude, lng: start.longitude }}
          defaultZoom={value ? 16 : 13}
          gestureHandling="greedy"
          disableDefaultUI={true}
          clickableIcons={false}
          className="h-full w-full"
          internalUsageAttributionIds={[INTERNAL_USAGE_ATTRIBUTION_ID]}
        >
          {value && (
            <AdvancedMarker
              position={{ lat: value.latitude, lng: value.longitude }}
              draggable={true}
              onDragEnd={(e) => {
                if (e.latLng) onChange({ latitude: round(e.latLng.lat()), longitude: round(e.latLng.lng()) });
              }}
            >
              <svg width="30" height="36" viewBox="0 0 30 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-[0_3px_5px_rgba(0,0,0,0.25)]">
                <path d="M15 0C6.716 0 0 6.716 0 15C0 23.3 12.9 34.6 14.39 35.88C14.75 36.19 15.25 36.19 15.61 35.88C17.1 34.6 30 23.3 30 15C30 6.716 23.284 0 15 0Z" fill="#ff860d" />
                <circle cx="15" cy="14.5" r="5.5" fill="#FFFFFF" />
                <circle cx="15" cy="14.5" r="2.8" fill="#111111" />
              </svg>
            </AdvancedMarker>
          )}
          <PickerController value={value} onChange={onChange} />
        </Map>
      </APIProvider>
      {!value && (
        <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
          <span className="rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold text-ink shadow-raised">
            Tap the map to drop a pin
          </span>
        </div>
      )}
    </div>
  );
};
