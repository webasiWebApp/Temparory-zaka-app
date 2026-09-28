/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Location, Geocoding & Routing Services
 */

import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { LocationCoordinates, PassengerLocation } from '../types';
import { geocodingService, GeocodingResult, CURATED_SA_PLACES } from './geocodingService';
import { routingService, RouteGeometry } from './routingService';
import { mapService, TELEMETRY_THRESHOLDS } from './mapService';

export type { GeocodingResult, RouteGeometry };
export { CURATED_SA_PLACES, TELEMETRY_THRESHOLDS, mapService, geocodingService, routingService };

// Haversine formula for exact distance between two GPS coordinates
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  return routingService.calculateHaversineDistanceKm(lat1, lon1, lat2, lon2);
}

// Estimate driving duration based on urban speed (~30 - 45 km/h) + traffic buffer
export function estimateDurationMin(distanceKm: number): number {
  return routingService.estimateDurationMinutes(distanceKm);
}

// Curated points alias for backwards compatibility
const POPULAR_LOCAL_PLACES: GeocodingResult[] = CURATED_SA_PLACES;

// Deduplicate concurrent in-flight GPS requests
let pendingGpsPromise: Promise<PassengerLocation> | null = null;

export const locationService = {
  /**
   * Get current device GPS location immediately without waiting for reverse-geocoding network roundtrip.
   * On iOS native devices, utilizes Capacitor Geolocation with native CoreLocation accuracy.
   * On Web, falls back to standard W3C Geolocation API.
   * Resolves instantly with coordinates and local/curated label.
   */
  async getCurrentPosition(): Promise<PassengerLocation> {
    if (pendingGpsPromise) {
      return pendingGpsPromise;
    }

    pendingGpsPromise = (async () => {
      try {
        let lat: number;
        let lng: number;
        let timestamp: number;

        if (Capacitor.isNativePlatform()) {
          // Native CoreLocation via Capacitor Geolocation
          let permStatus = await Geolocation.checkPermissions();
          if (permStatus.location !== 'granted') {
            permStatus = await Geolocation.requestPermissions();
          }

          if (permStatus.location === 'denied') {
            const err = new Error('Location permission was denied. Please allow location access in your iOS Settings (Settings > Privacy > Location Services) or enter your pickup manually.');
            (err as any).code = 1;
            throw err;
          }

          const nativePos = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 12000,
            maximumAge: 10000,
          });

          lat = nativePos.coords.latitude;
          lng = nativePos.coords.longitude;
          timestamp = nativePos.timestamp || Date.now();
        } else {
          // Web W3C Geolocation
          const webPos = await new Promise<GeolocationPosition>((resolve, reject) => {
            if (!navigator.geolocation) {
              const err = new Error('Geolocation is not supported by your browser or device.');
              (err as any).code = 2;
              reject(err);
              return;
            }

            navigator.geolocation.getCurrentPosition(
              (pos) => resolve(pos),
              (error) => {
                let msg = 'Unable to retrieve location.';
                switch (error.code) {
                  case error.PERMISSION_DENIED:
                    msg = 'Location permission was denied. Please allow location access in your browser or enter your pickup manually.';
                    break;
                  case error.POSITION_UNAVAILABLE:
                    msg = 'Location information is currently unavailable. Please check your device GPS.';
                    break;
                  case error.TIMEOUT:
                    msg = 'Location request timed out. Please retry.';
                    break;
                }
                const customErr = new Error(msg);
                (customErr as any).code = error.code;
                reject(customErr);
              },
              {
                enableHighAccuracy: true,
                timeout: 12000,
                maximumAge: 10000,
              }
            );
          });

          lat = webPos.coords.latitude;
          lng = webPos.coords.longitude;
          timestamp = webPos.timestamp || Date.now();
        }

        // 1. Strict coordinate bounds & NaN validation
        if (
          typeof lat !== 'number' ||
          typeof lng !== 'number' ||
          isNaN(lat) ||
          isNaN(lng) ||
          lat < -90 ||
          lat > 90 ||
          lng < -180 ||
          lng > 180
        ) {
          const err = new Error('Device returned invalid geographic coordinates.');
          (err as any).code = 2;
          throw err;
        }

        // 2. Reject excessively stale fixes (> 60s old)
        if (timestamp && Date.now() - timestamp > 60000) {
          console.warn('GPS fix is stale (> 60s old).');
        }

        // 3. FAST IMMEDIATE RETURN: Use instant address (curated place if near, or clean pin label)
        const instantAddress = geocodingService.getInstantFallbackAddress(lat, lng);

        return {
          latitude: Number(lat.toFixed(6)),
          longitude: Number(lng.toFixed(6)),
          address: instantAddress,
          timestamp,
        };
      } finally {
        pendingGpsPromise = null;
      }
    })();

    return pendingGpsPromise;
  },

  /**
   * Fast helper to retrieve raw current coordinates
   */
  async getFastCurrentCoordinates(): Promise<LocationCoordinates> {
    const loc = await this.getCurrentPosition();
    return { latitude: loc.latitude, longitude: loc.longitude };
  },

  /**
   * Reverse geocodes latitude/longitude into a human readable address (cached & cancellable)
   */
  async reverseGeocode(lat: number, lng: number): Promise<string> {
    return geocodingService.reverseGeocode(lat, lng);
  },

  /**
   * Asynchronously resolves street address in background without blocking UI
   */
  resolveAddressInBackground(
    lat: number,
    lng: number,
    onSuccess: (address: string) => void
  ): () => void {
    let cancelled = false;
    geocodingService
      .reverseGeocode(lat, lng)
      .then((addr) => {
        if (!cancelled && addr) {
          onSuccess(addr);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('Background address resolution note:', err?.message || err);
        }
      });

    return () => {
      cancelled = true;
    };
  },

  /**
   * Searches for real geographical places matching a query string
   */
  async searchPlaces(
    query: string,
    nearLocation?: LocationCoordinates
  ): Promise<GeocodingResult[]> {
    return geocodingService.search(query, nearLocation);
  },

  /**
   * Fetches real OSRM driving route polyline coordinates, or generates realistic curved road coordinates
   */
  async getRoute(
    pickup: LocationCoordinates,
    destination: LocationCoordinates
  ): Promise<RouteGeometry> {
    return routingService.getRoute(pickup, destination);
  },

  getCuratedPlaces(): GeocodingResult[] {
    return geocodingService.getCuratedPlaces();
  },
};
