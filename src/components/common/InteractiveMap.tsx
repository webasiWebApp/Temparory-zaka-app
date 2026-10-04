/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Google Maps Interactive Map Component
 *
 * Real Google Maps JavaScript API vector rendering via @vis.gl/react-google-maps:
 * - Clean modern commercial ride-hailing styling
 * - Custom ZAKA orange pickup marker with ground radar pulse
 * - Charcoal destination marker with orange core
 * - Real-time vehicle icons with rotation
 * - Route polyline display
 * - GPS recentering button
 * - Preserves pickup/destination selection & map clicking
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
} from '@vis.gl/react-google-maps';
import { LocationCoordinates, RideDocument, VehicleType } from '../../types';
import { locationService, routingService, RouteGeometry } from '../../services/locationService';
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_MAP_ID,
  ZAKA_RIDE_MAP_STYLE,
  INTERNAL_USAGE_ATTRIBUTION_ID,
} from '../../config/googleMapsConfig';
import { Polyline } from './GoogleMapPolyline';
import { LocateFixed } from 'lucide-react';

interface InteractiveMapProps {
  pickupLocation?: (LocationCoordinates & { address?: string; name?: string }) | null;
  destinationLocation?: (LocationCoordinates & { address?: string; name?: string }) | null;
  driverLocation?: LocationCoordinates | null;
  activeRide?: RideDocument | null;
  mode?: 'passenger' | 'driver' | 'admin';
  nearbyDrivers?: {
    id: string;
    latitude: number;
    longitude: number;
    angle?: number;
    vehicleType?: VehicleType;
  }[];
  isDemo?: boolean;
  className?: string;
  estimatedDurationMin?: number;
  onMapClick?: (coords: LocationCoordinates) => void;
  onPickupMoved?: (coords: LocationCoordinates) => void;
  onRouteCalculated?: (route: RouteGeometry) => void;
  onRecenter?: () => void;
}

// Inner Controller to handle map camera, bounds, and recenter
const MapController: React.FC<{
  pickupLocation?: LocationCoordinates | null;
  destinationLocation?: LocationCoordinates | null;
  onRecenter?: () => void;
  onMapClick?: (coords: LocationCoordinates) => void;
}> = ({ pickupLocation, destinationLocation, onRecenter, onMapClick }) => {
  const map = useMap();
  const lastBoundsKeyRef = useRef<string>('');

  // Handle map click
  useEffect(() => {
    if (!map || !onMapClick) return;

    const listener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        onMapClick({
          latitude: e.latLng.lat(),
          longitude: e.latLng.lng(),
        });
      }
    });

    return () => {
      listener.remove();
    };
  }, [map, onMapClick]);

  // Fit bounds when both pickup and destination exist with balanced padding so both markers and route are clearly visible
  useEffect(() => {
    if (!map) return;

    if (pickupLocation && destinationLocation) {
      const boundsKey = `${pickupLocation.latitude.toFixed(4)},${pickupLocation.longitude.toFixed(4)}-${destinationLocation.latitude.toFixed(4)},${destinationLocation.longitude.toFixed(4)}`;
      if (boundsKey !== lastBoundsKeyRef.current) {
        lastBoundsKeyRef.current = boundsKey;
        const bounds = new google.maps.LatLngBounds();
        bounds.extend({ lat: pickupLocation.latitude, lng: pickupLocation.longitude });
        bounds.extend({ lat: destinationLocation.latitude, lng: destinationLocation.longitude });
        // Frame with comfortable breathing room: 75px top/bottom, 60px sides
        map.fitBounds(bounds, {
          top: 75,
          right: 60,
          bottom: 75,
          left: 60,
        });
      }
    } else if (pickupLocation && !destinationLocation && lastBoundsKeyRef.current) {
      lastBoundsKeyRef.current = '';
      map.panTo({ lat: pickupLocation.latitude, lng: pickupLocation.longitude });
      map.setZoom(15.5);
    }
  }, [map, pickupLocation?.latitude, pickupLocation?.longitude, destinationLocation?.latitude, destinationLocation?.longitude]);

  const handleRecenter = useCallback(() => {
    if (!map || !pickupLocation) return;
    map.panTo({ lat: pickupLocation.latitude, lng: pickupLocation.longitude });
    map.setZoom(16);
    onRecenter?.();
  }, [map, pickupLocation, onRecenter]);

  return (
    <div className="absolute right-3.5 bottom-3.5 z-20">
      <button
        onClick={handleRecenter}
        aria-label="Re-center map"
        title="Re-center map"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink shadow-raised hover:bg-white active:scale-95 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <LocateFixed className="h-4 w-4 text-primary-text stroke-[2.4]" />
      </button>
    </div>
  );
};

// Driver marker component
const VehicleMarker: React.FC<{
  position: google.maps.LatLngLiteral;
  angle?: number;
}> = ({ position, angle = 0 }) => {
  return (
    <AdvancedMarker position={position} zIndex={500}>
      <div className="relative w-[26px] h-[26px] flex items-center justify-center pointer-events-none">
        <div
          style={{
            transform: `rotate(${angle}deg)`,
            transition: 'transform 0.35s ease',
          }}
          className="w-[22px] h-[22px] flex items-center justify-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6.5 4.5C6.5 3.12 7.62 2 9 2H15C16.38 2 17.5 3.12 17.5 4.5V19.5C17.5 20.88 16.38 22 15 22H9C7.62 22 6.5 20.88 6.5 19.5V4.5Z" fill="#1E1E1E"/>
            <path d="M7.8 6.5C7.8 5.95 8.25 5.5 8.8 5.5H15.2C15.75 5.5 16.2 5.95 16.2 6.5V8.5H7.8V6.5Z" fill="#4B4B4B"/>
            <rect x="8.5" y="9.8" width="7" height="4.5" rx="1.2" fill="#ff860d"/>
            <path d="M7.8 15.5H16.2V17C16.2 17.55 15.75 18 15.2 18H8.8C8.25 18 7.8 17.55 7.8 17V15.5Z" fill="#383838"/>
            <circle cx="8.2" cy="2.8" r="0.8" fill="#FFF8DB"/>
            <circle cx="15.8" cy="2.8" r="0.8" fill="#FFF8DB"/>
            <circle cx="8.2" cy="21.2" r="0.8" fill="#FF3B30"/>
            <circle cx="15.8" cy="21.2" r="0.8" fill="#FF3B30"/>
          </svg>
        </div>
      </div>
    </AdvancedMarker>
  );
};

const InteractiveMapContent: React.FC<InteractiveMapProps> = ({
  pickupLocation,
  destinationLocation,
  activeRide,
  nearbyDrivers = [],
  isDemo = false,
  className = '',
  estimatedDurationMin: propDurationMin,
  onMapClick,
  onPickupMoved,
  onRouteCalculated,
  onRecenter,
}) => {
  const [routeCoordinates, setRouteCoordinates] = useState<google.maps.LatLngLiteral[]>([]);
  const [calculatedDurationMin, setCalculatedDurationMin] = useState<number | null>(null);
  const lastRoutePickupRef = useRef<LocationCoordinates | null>(null);
  const lastRouteDestRef = useRef<LocationCoordinates | null>(null);

  const initialCenter = useMemo<google.maps.LatLngLiteral>(() => {
    return {
      lat: pickupLocation?.latitude || -26.1458,
      lng: pickupLocation?.longitude || 28.0416,
    };
  }, []);

  // Calculate and Draw Route Line (Instant Optimistic + Background OSRM refinement)
  useEffect(() => {
    const pLat = pickupLocation?.latitude;
    const pLng = pickupLocation?.longitude;
    const dLat = destinationLocation?.latitude;
    const dLng = destinationLocation?.longitude;

    if (
      typeof pLat === 'number' &&
      typeof pLng === 'number' &&
      typeof dLat === 'number' &&
      typeof dLng === 'number' &&
      !isNaN(pLat) &&
      !isNaN(pLng) &&
      !isNaN(dLat) &&
      !isNaN(dLng)
    ) {
      const isMaterial = routingService.isMaterialDifference(
        lastRoutePickupRef.current,
        lastRouteDestRef.current,
        { latitude: pLat, longitude: pLng },
        { latitude: dLat, longitude: dLng },
        15
      );

      if (!isMaterial && routeCoordinates.length > 0) {
        return;
      }

      lastRoutePickupRef.current = { latitude: pLat, longitude: pLng };
      lastRouteDestRef.current = { latitude: dLat, longitude: dLng };

      // 1. Instant optimistic route
      const instantRoute = routingService.getInstantRouteGeometry(
        { latitude: pLat, longitude: pLng },
        { latitude: dLat, longitude: dLng }
      );
      setRouteCoordinates(
        instantRoute.coordinates.map(([lat, lng]) => ({ lat, lng }))
      );
      setCalculatedDurationMin(instantRoute.durationMin);
      onRouteCalculated?.(instantRoute);

      // 2. Refined road network route
      let isSubscribed = true;
      locationService
        .getRoute({ latitude: pLat, longitude: pLng }, { latitude: dLat, longitude: dLng })
        .then((realRoute) => {
          if (!isSubscribed) return;
          setRouteCoordinates(
            realRoute.coordinates.map(([lat, lng]) => ({ lat, lng }))
          );
          setCalculatedDurationMin(realRoute.durationMin);
          onRouteCalculated?.(realRoute);
        })
        .catch((e) => {
          console.warn('Google Map background road route note:', e);
        });

      return () => {
        isSubscribed = false;
      };
    } else {
      lastRoutePickupRef.current = null;
      lastRouteDestRef.current = null;
      setRouteCoordinates([]);
      setCalculatedDurationMin(null);
    }
  }, [
    pickupLocation?.latitude,
    pickupLocation?.longitude,
    destinationLocation?.latitude,
    destinationLocation?.longitude,
    onRouteCalculated,
  ]);

  // Derived effective trip duration
  const effectiveDurationMin = propDurationMin || calculatedDurationMin || (activeRide?.estimatedDurationMin ?? null);

  // Calculate midpoint coordinate along the route polyline for the ETA pill
  const routeMidpoint = useMemo<google.maps.LatLngLiteral | null>(() => {
    if (routeCoordinates.length === 0) return null;
    const midIndex = Math.floor(routeCoordinates.length / 2);
    return routeCoordinates[midIndex];
  }, [routeCoordinates]);

  // Resolve drivers to render
  const driversToRender = useMemo(() => {
    const list: Array<{
      id: string;
      latitude: number;
      longitude: number;
      angle?: number;
    }> = [];

    if (activeRide?.driverCurrentLocation) {
      list.push({
        id: activeRide.driverId || 'active-driver',
        latitude: activeRide.driverCurrentLocation.latitude,
        longitude: activeRide.driverCurrentLocation.longitude,
        angle: 0,
      });
    }

    if (nearbyDrivers && nearbyDrivers.length > 0) {
      nearbyDrivers.forEach((d) => {
        if (!list.some((existing) => existing.id === d.id)) {
          list.push(d);
        }
      });
    }

    if (list.length === 0 && isDemo && pickupLocation) {
      list.push(
        {
          id: 'demo-driver-1',
          latitude: pickupLocation.latitude + 0.0035,
          longitude: pickupLocation.longitude + 0.0042,
          angle: 45,
        },
        {
          id: 'demo-driver-2',
          latitude: pickupLocation.latitude - 0.0045,
          longitude: pickupLocation.longitude + 0.0031,
          angle: 120,
        },
        {
          id: 'demo-driver-3',
          latitude: pickupLocation.latitude + 0.0028,
          longitude: pickupLocation.longitude - 0.0052,
          angle: 210,
        }
      );
    }

    return list.filter(
      (d) =>
        typeof d.latitude === 'number' &&
        typeof d.longitude === 'number' &&
        !isNaN(d.latitude) &&
        !isNaN(d.longitude)
    );
  }, [nearbyDrivers, activeRide, pickupLocation, isDemo]);

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      <Map
        mapId={GOOGLE_MAPS_MAP_ID}
        defaultCenter={initialCenter}
        defaultZoom={15.5}
        gestureHandling="greedy"
        disableDefaultUI={true}
        clickableIcons={false}
        styles={ZAKA_RIDE_MAP_STYLE}
        className="w-full h-full"
        internalUsageAttributionIds={[INTERNAL_USAGE_ATTRIBUTION_ID]}
      >
        {/* Dual-Layer Route Polyline (rendered with zIndex 20-21, well beneath markers at 900+) */}
        {routeCoordinates.length > 0 && (
          <>
            {/* White outline for high contrast casing */}
            <Polyline
              path={routeCoordinates}
              strokeColor="#FFFFFF"
              strokeWeight={6.5}
              strokeOpacity={0.95}
              zIndex={20}
            />
            {/* ZAKA clean medium-width orange route line */}
            <Polyline
              path={routeCoordinates}
              strokeColor="#ff860d"
              strokeWeight={4}
              strokeOpacity={1}
              zIndex={21}
            />
          </>
        )}

        {/* Pickup Marker: ZAKA Signature Orange Pin with attached small white rounded "PICKUP" label */}
        {pickupLocation && (
          <AdvancedMarker
            position={{ lat: pickupLocation.latitude, lng: pickupLocation.longitude }}
            zIndex={1000}
            draggable={true}
            onDragEnd={(e) => {
              if (e.latLng) {
                onPickupMoved?.({
                  latitude: Number(e.latLng.lat().toFixed(6)),
                  longitude: Number(e.latLng.lng().toFixed(6)),
                });
              }
            }}
          >
            <div className="relative flex flex-col items-center justify-end cursor-pointer group select-none">
              {/* Clean, premium white rounded "PICKUP" label attached near marker */}
              <div className="mb-1 flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-0.5 border border-black/[0.08] backdrop-blur-xs pointer-events-none transition-transform group-hover:scale-105">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-[11px] font-bold tracking-wider text-ink uppercase">
                  PICKUP
                </span>
              </div>

              <div className="relative w-[34px] h-[38px] flex flex-col items-center justify-end">
                {/* Ground contact shadow */}
                <div className="absolute -bottom-[1px] left-1/2 -translate-x-1/2 w-3.5 h-1 rounded-full bg-black/25 blur-[1px]" />
                {/* Sleek ZAKA Orange Pinpoint Pin */}
                <div className="relative z-10 transition-transform active:scale-95 drop-shadow-[0_3px_5px_rgba(0,0,0,0.22)]">
                  <svg width="30" height="36" viewBox="0 0 30 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15 0C6.716 0 0 6.716 0 15C0 23.3 12.9 34.6 14.39 35.88C14.75 36.19 15.25 36.19 15.61 35.88C17.1 34.6 30 23.3 30 15C30 6.716 23.284 0 15 0Z" fill="#ff860d"/>
                    <circle cx="15" cy="14.5" r="5.5" fill="#FFFFFF"/>
                    <circle cx="15" cy="14.5" r="2.8" fill="#111111"/>
                  </svg>
                </div>
              </div>
            </div>
          </AdvancedMarker>
        )}

        {/* Drop-off / Destination Marker: Distinct Dark Pin with Orange Center & attached white rounded "DROP-OFF" label */}
        {destinationLocation && (
          <AdvancedMarker
            position={{ lat: destinationLocation.latitude, lng: destinationLocation.longitude }}
            zIndex={990}
          >
            <div className="relative flex flex-col items-center justify-end cursor-pointer group select-none">
              {/* Clean, premium white rounded "DROP-OFF" label attached near marker */}
              <div className="mb-1 flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-0.5 border border-black/[0.08] backdrop-blur-xs pointer-events-none transition-transform group-hover:scale-105">
                <span className="h-2 w-2 rounded-full bg-ink" />
                <span className="text-[11px] font-bold tracking-wider text-ink uppercase">
                  DROP-OFF
                </span>
              </div>

              <div className="relative w-[34px] h-[38px] flex flex-col items-center justify-end">
                <div className="absolute -bottom-[1px] left-1/2 -translate-x-1/2 w-3.5 h-1 rounded-full bg-black/25 blur-[1px]" />
                <div className="relative z-10 drop-shadow-[0_3px_5px_rgba(0,0,0,0.25)]">
                  <svg width="30" height="36" viewBox="0 0 30 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15 0C6.716 0 0 6.716 0 15C0 23.3 12.9 34.6 14.39 35.88C14.75 36.19 15.25 36.19 15.61 35.88C17.1 34.6 30 23.3 30 15C30 6.716 23.284 0 15 0Z" fill="#111111"/>
                    <circle cx="15" cy="14.5" r="5.5" fill="#ff860d"/>
                    <rect x="12.5" y="12" width="5" height="5" rx="1" fill="#FFFFFF"/>
                  </svg>
                </div>
              </div>
            </div>
          </AdvancedMarker>
        )}

        {/* Dynamic Estimated Trip Time Pill positioned near the route line */}
        {routeMidpoint && effectiveDurationMin && effectiveDurationMin > 0 && (
          <AdvancedMarker position={routeMidpoint} zIndex={850}>
            <div className="pointer-events-none select-none -translate-y-4">
              <div className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 shadow-raised border border-black/[0.08] backdrop-blur-xs">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-[11px] font-bold text-ink whitespace-nowrap tracking-tight">
                  {effectiveDurationMin} min
                </span>
              </div>
            </div>
          </AdvancedMarker>
        )}

        {/* Online / Roaming Driver Markers */}
        {driversToRender.map((driver) => (
          <VehicleMarker
            key={driver.id}
            position={{ lat: driver.latitude, lng: driver.longitude }}
            angle={driver.angle || 0}
          />
        ))}

        {/* Controller for Click, FitBounds, and Recenter */}
        <MapController
          pickupLocation={pickupLocation}
          destinationLocation={destinationLocation}
          onRecenter={onRecenter}
          onMapClick={onMapClick}
        />
      </Map>
    </div>
  );
};

export const InteractiveMap: React.FC<InteractiveMapProps> = (props) => {
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className={`relative h-full w-full flex items-center justify-center bg-surface-2 p-4 text-center ${props.className || ''}`}>
        <div className="max-w-xs p-4 bg-white rounded-card border border-line">
          <p className="text-sm font-semibold text-ink">Google Maps API Key Missing</p>
          <p className="text-xs text-ink-3 mt-1">Please set VITE_GOOGLE_MAPS_API_KEY to display the live Google Map.</p>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <InteractiveMapContent {...props} />
    </APIProvider>
  );
};
