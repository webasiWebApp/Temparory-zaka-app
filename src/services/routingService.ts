/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Routing Service Abstraction
 * Calculates routes, driving polylines, distances and ETAs with caching,
 * timeouts, and fallback interpolation.
 */

import { LocationCoordinates } from '../types';

export interface RouteGeometry {
  coordinates: [number, number][]; // [latitude, longitude][]
  distanceKm: number;
  durationMin: number;
}

export class RoutingService {
  private routeCache = new Map<string, { timestamp: number; route: RouteGeometry }>();
  private CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
  private REQUEST_TIMEOUT_MS = 3500;
  private activeRouteController: AbortController | null = null;
  private currentRouteRequestId = 0;

  /**
   * Calculates Haversine distance in km between two GPS coordinates
   */
  calculateHaversineDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const straightLine = R * c;
    // Urban road factor (typical 1.25x - 1.30x multiplier over straight line)
    return Math.round(straightLine * 1.25 * 10) / 10;
  }

  /**
   * Calculates distance in metres between two GPS coordinates (useful for 15m threshold)
   */
  calculateDistanceMeters(
    c1: LocationCoordinates,
    c2: LocationCoordinates
  ): number {
    const km = this.calculateHaversineDistanceKm(c1.latitude, c1.longitude, c2.latitude, c2.longitude);
    return km * 1000;
  }

  /**
   * Determines whether two pairs of route coordinates differ materially (> 20 meters)
   */
  isMaterialDifference(
    p1: LocationCoordinates | null | undefined,
    d1: LocationCoordinates | null | undefined,
    p2: LocationCoordinates | null | undefined,
    d2: LocationCoordinates | null | undefined,
    thresholdMeters = 20
  ): boolean {
    if (!p1 || !d1 || !p2 || !d2) return true;
    const pickupDiff = this.calculateDistanceMeters(p1, p2);
    const destDiff = this.calculateDistanceMeters(d1, d2);
    return pickupDiff > thresholdMeters || destDiff > thresholdMeters;
  }

  /**
   * Estimates driving duration in minutes
   */
  estimateDurationMinutes(distanceKm: number): number {
    const averageSpeedKmH = 35; // typical city traffic speed in JHB/PTA
    const baseMinutes = (distanceKm / averageSpeedKmH) * 60;
    return Math.max(3, Math.round(baseMinutes + 2));
  }

  /**
   * Instant synchronous realistic Bezier road path generator (0ms execution)
   */
  getInstantRouteGeometry(
    pickup: LocationCoordinates,
    destination: LocationCoordinates
  ): RouteGeometry {
    const straightDistance = this.calculateHaversineDistanceKm(
      pickup.latitude,
      pickup.longitude,
      destination.latitude,
      destination.longitude
    );
    const duration = this.estimateDurationMinutes(straightDistance);

    const points: [number, number][] = [];
    const steps = 24;
    const midLat = (pickup.latitude + destination.latitude) / 2;
    const midLng = (pickup.longitude + destination.longitude) / 2;
    const ctrlLat = midLat + (destination.longitude - pickup.longitude) * 0.15;
    const ctrlLng = midLng - (destination.latitude - pickup.latitude) * 0.15;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const lat =
        Math.pow(1 - t, 2) * pickup.latitude +
        2 * (1 - t) * t * ctrlLat +
        Math.pow(t, 2) * destination.latitude;
      const lng =
        Math.pow(1 - t, 2) * pickup.longitude +
        2 * (1 - t) * t * ctrlLng +
        Math.pow(t, 2) * destination.longitude;
      points.push([lat, lng]);
    }

    return {
      coordinates: points,
      distanceKm: straightDistance,
      durationMin: duration,
    };
  }

  /**
   * Fetches real driving route following actual roads using Google Maps DirectionsService or fallback OSRM
   */
  async getRoute(
    pickup: LocationCoordinates,
    destination: LocationCoordinates
  ): Promise<RouteGeometry> {
    const cacheKey = `${pickup.latitude.toFixed(4)},${pickup.longitude.toFixed(4)}_${destination.latitude.toFixed(4)},${destination.longitude.toFixed(4)}`;
    const cached = this.routeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.route;
    }

    // Try Google Maps DirectionsService if available in window.google
    if (typeof window !== 'undefined' && (window as any).google?.maps?.DirectionsService) {
      try {
        const directionsService = new (window as any).google.maps.DirectionsService();
        const request: google.maps.DirectionsRequest = {
          origin: new (window as any).google.maps.LatLng(pickup.latitude, pickup.longitude),
          destination: new (window as any).google.maps.LatLng(destination.latitude, destination.longitude),
          travelMode: (window as any).google.maps.TravelMode.DRIVING,
          provideRouteAlternatives: false,
        };

        const result = await new Promise<google.maps.DirectionsResult>((resolve, reject) => {
          directionsService.route(request, (res: any, status: any) => {
            if (status === 'OK' && res?.routes?.[0]) {
              resolve(res);
            } else {
              reject(new Error(`Google DirectionsService status: ${status}`));
            }
          });
        });

        const route = result.routes[0];
        if (route?.overview_path?.length) {
          const coordinates: [number, number][] = route.overview_path.map((latLng: any) => [
            latLng.lat(),
            latLng.lng(),
          ]);

          const leg = route.legs?.[0];
          const distanceMeters = leg?.distance?.value || 0;
          const durationSeconds = leg?.duration?.value || 0;

          const distanceKm = Math.round((distanceMeters / 1000) * 10) / 10 || this.calculateHaversineDistanceKm(pickup.latitude, pickup.longitude, destination.latitude, destination.longitude);
          const durationMin = Math.round(durationSeconds / 60) || this.estimateDurationMinutes(distanceKm);

          const routeResult: RouteGeometry = {
            coordinates,
            distanceKm,
            durationMin: Math.max(1, durationMin),
          };

          this.routeCache.set(cacheKey, { timestamp: Date.now(), route: routeResult });
          return routeResult;
        }
      } catch (gErr) {
        console.warn('Google DirectionsService road routing error; trying fallback:', gErr);
      }
    }

    // Secondary driving road route via OSRM
    if (this.activeRouteController) {
      this.activeRouteController.abort();
    }
    this.activeRouteController = new AbortController();
    const currentSignal = this.activeRouteController.signal;
    const thisRequestId = ++this.currentRouteRequestId;

    try {
      const timeoutId = setTimeout(() => {
        if (this.activeRouteController?.signal === currentSignal) {
          this.activeRouteController.abort();
        }
      }, 5000);

      const url = `https://router.project-osrm.org/route/v1/driving/${pickup.longitude},${pickup.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`;
      const response = await fetch(url, { signal: currentSignal });
      clearTimeout(timeoutId);

      if (thisRequestId !== this.currentRouteRequestId) {
        throw new Error('Superseded route request');
      }

      if (response.ok) {
        const data = await response.json();
        if (data?.routes?.[0]) {
          const route = data.routes[0];
          const rawCoords = route.geometry.coordinates as [number, number][]; // [lng, lat]
          const latLngCoords = rawCoords.map(([lng, lat]) => [lat, lng] as [number, number]);
          const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
          const durationMin = Math.round(route.duration / 60);

          const result: RouteGeometry = {
            coordinates: latLngCoords,
            distanceKm: distanceKm || 1,
            durationMin: Math.max(1, durationMin || 3),
          };

          this.routeCache.set(cacheKey, { timestamp: Date.now(), route: result });
          return result;
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('Driving route network error:', err.message);
      }
    }

    throw new Error('Unable to compute driving road route. Please verify locations and connectivity.');
  }
}

export const routingService = new RoutingService();
