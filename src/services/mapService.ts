/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Unified Map Service & Telemetry Throttler
 * Coordinates geocoding, routing, coordinate interpolation, and production GPS write throttling.
 */

import { LocationCoordinates } from '../types';
import { geocodingService, GeocodingResult, CURATED_SA_PLACES } from './geocodingService';
import { routingService, RouteGeometry } from './routingService';

// Throttling thresholds to protect Firestore write limits and network
export const TELEMETRY_THRESHOLDS = {
  MIN_DISTANCE_METERS: 15,     // 15 meters
  MIN_TIME_INTERVAL_MS: 10000, // 10 seconds
  STALE_LOCATION_MS: 20000,    // 20 seconds without GPS update = STALE
};

export const mapService = {
  geocoding: geocodingService,
  routing: routingService,

  /**
   * Distance between two coordinates in metres
   */
  distanceMeters(c1: LocationCoordinates, c2: LocationCoordinates): number {
    return routingService.calculateDistanceMeters(c1, c2);
  },

  /**
   * Production Throttling Check:
   * Decides whether a driver's GPS coordinate should be persisted to Firestore.
   * Only returns TRUE if:
   *   1. The driver has moved >= 15 metres from the last persisted coordinate, OR
   *   2. At least 10 seconds have elapsed since the last write.
   */
  shouldPersistLocation(
    lastPersistedCoords: LocationCoordinates | null,
    newCoords: LocationCoordinates,
    lastPersistedTimestampMs: number,
    nowMs: number = Date.now()
  ): { shouldPersist: boolean; reason: 'distance' | 'time' | 'initial' | 'none'; distanceMeters: number } {
    if (!lastPersistedCoords || lastPersistedTimestampMs === 0) {
      return { shouldPersist: true, reason: 'initial', distanceMeters: 0 };
    }

    const distMeters = this.distanceMeters(lastPersistedCoords, newCoords);
    const timeElapsedMs = nowMs - lastPersistedTimestampMs;

    if (distMeters >= TELEMETRY_THRESHOLDS.MIN_DISTANCE_METERS) {
      return { shouldPersist: true, reason: 'distance', distanceMeters: Math.round(distMeters) };
    }

    if (timeElapsedMs >= TELEMETRY_THRESHOLDS.MIN_TIME_INTERVAL_MS) {
      return { shouldPersist: true, reason: 'time', distanceMeters: Math.round(distMeters) };
    }

    return { shouldPersist: false, reason: 'none', distanceMeters: Math.round(distMeters) };
  },

  /**
   * Linear coordinate interpolation for smooth client-side rendering
   */
  interpolateCoordinates(
    start: LocationCoordinates,
    end: LocationCoordinates,
    t: number // 0 to 1
  ): LocationCoordinates {
    const clampedT = Math.max(0, Math.min(1, t));
    return {
      latitude: start.latitude + (end.latitude - start.latitude) * clampedT,
      longitude: start.longitude + (end.longitude - start.longitude) * clampedT,
    };
  },

  /**
   * Calculates bearing angle between two coordinates in degrees (0 - 360)
   */
  calculateBearing(start: LocationCoordinates, end: LocationCoordinates): number {
    const startLat = (start.latitude * Math.PI) / 180;
    const startLng = (start.longitude * Math.PI) / 180;
    const endLat = (end.latitude * Math.PI) / 180;
    const endLng = (end.longitude * Math.PI) / 180;

    const dLng = endLng - startLng;
    const y = Math.sin(dLng) * Math.cos(endLat);
    const x =
      Math.cos(startLat) * Math.sin(endLat) -
      Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);

    const brng = (Math.atan2(y, x) * 180) / Math.PI;
    return (brng + 360) % 360;
  },
};

export { geocodingService, routingService, CURATED_SA_PLACES };
export type { GeocodingResult, RouteGeometry };
