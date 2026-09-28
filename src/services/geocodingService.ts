/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Geocoding Service Abstraction
 * Supports debounced searching, in-flight request cancellation, request caching,
 * timeouts, and high-quality curated South African fallback places.
 */

import { LocationCoordinates } from '../types';

export interface GeocodingResult {
  id: string;
  name: string;
  address: string;
  secondaryText?: string;
  coordinates: LocationCoordinates;
  type?: string;
}

// Curated South African landmark & transit locations (High reliability offline/fallback catalog)
export const CURATED_SA_PLACES: GeocodingResult[] = [
  {
    id: 'sa-plc-1',
    name: 'Sandton City & Nelson Mandela Square',
    address: '83 Rivonia Rd, Sandton, Johannesburg, 2196',
    secondaryText: 'Sandton Central, Johannesburg',
    coordinates: { latitude: -26.1076, longitude: 28.0567 },
    type: 'shopping_mall',
  },
  {
    id: 'sa-plc-2',
    name: 'Rosebank Mall & Gautrain Station',
    address: '50 Bath Ave, Rosebank, Johannesburg, 2196',
    secondaryText: 'Rosebank, Johannesburg',
    coordinates: { latitude: -26.1458, longitude: 28.0416 },
    type: 'transit_station',
  },
  {
    id: 'sa-plc-3',
    name: 'O.R. Tambo International Airport (JNB)',
    address: '1 Jones Rd, Kempton Park, Johannesburg, 1627',
    secondaryText: 'Departures & Arrivals Terminal',
    coordinates: { latitude: -26.1367, longitude: 28.2411 },
    type: 'airport',
  },
  {
    id: 'sa-plc-4',
    name: 'Mall of Africa',
    address: 'Lone Creek Cres & Magwa Cres, Waterfall City, Midrand, 1686',
    secondaryText: 'Waterfall City, Midrand',
    coordinates: { latitude: -26.0163, longitude: 28.1065 },
    type: 'shopping_mall',
  },
  {
    id: 'sa-plc-5',
    name: 'Menlyn Maine Central Square',
    address: 'Aramist Ave, Menlyn, Pretoria, 0181',
    secondaryText: 'Menlyn, Pretoria',
    coordinates: { latitude: -25.7865, longitude: 28.2815 },
    type: 'commercial',
  },
  {
    id: 'sa-plc-6',
    name: 'Johannesburg Park Station',
    address: 'Rissik St & Wolmarans St, Braamfontein, Johannesburg, 2001',
    secondaryText: 'Central Rail & Gautrain Terminal',
    coordinates: { latitude: -26.1956, longitude: 28.0418 },
    type: 'transit_station',
  },
  {
    id: 'sa-plc-7',
    name: 'University of the Witwatersrand (Wits)',
    address: '1 Jan Smuts Ave, Braamfontein, Johannesburg, 2000',
    secondaryText: 'Main Campus East, Braamfontein',
    coordinates: { latitude: -26.1912, longitude: 28.0289 },
    type: 'university',
  },
  {
    id: 'sa-plc-8',
    name: 'Vilakazi Street, Orlando West (Soweto)',
    address: 'Vilakazi St, Orlando West, Soweto, 1804',
    secondaryText: 'Soweto Heritage District',
    coordinates: { latitude: -26.2372, longitude: 27.9056 },
    type: 'attraction',
  },
  {
    id: 'sa-plc-9',
    name: 'Fourways Mall',
    address: 'William Nicol Dr & Fourways Blvd, Fourways, Sandton, 2055',
    secondaryText: 'Fourways, Johannesburg',
    coordinates: { latitude: -26.0189, longitude: 28.0069 },
    type: 'shopping_mall',
  },
  {
    id: 'sa-plc-10',
    name: 'Melrose Arch',
    address: 'Corlett Dr & M1, Melrose, Johannesburg, 2076',
    secondaryText: 'Melrose, Johannesburg',
    coordinates: { latitude: -26.1333, longitude: 28.0678 },
    type: 'shopping_mall',
  },
  {
    id: 'sa-plc-11',
    name: 'Pretoria Central / Union Buildings',
    address: 'Government Ave, Pretoria, 0002',
    secondaryText: 'Pretoria Central, Tshwane',
    coordinates: { latitude: -25.7402, longitude: 28.212 },
    type: 'government',
  },
  {
    id: 'sa-plc-12',
    name: 'Centurion Mall & Gautrain',
    address: 'Heuwel Ave, Centurion, 0157',
    secondaryText: 'Centurion Central, Gauteng',
    coordinates: { latitude: -25.8523, longitude: 28.1887 },
    type: 'transit_station',
  },
];

class GeocodingService {
  // In-memory cache for search queries
  private searchCache = new Map<string, { timestamp: number; results: GeocodingResult[] }>();
  // In-memory cache for reverse geocoding
  private reverseCache = new Map<string, { timestamp: number; address: string }>();
  // Active controller for ongoing search cancellation
  private activeSearchController: AbortController | null = null;
  // Active controller for ongoing reverse-geocoding cancellation
  private activeReverseController: AbortController | null = null;
  // Monotonically increasing request ID for race protection
  private currentReverseRequestId = 0;
  // Cache TTL: 15 minutes
  private CACHE_TTL_MS = 15 * 60 * 1000;
  // Network request timeout: 3500ms
  private REQUEST_TIMEOUT_MS = 3500;

  /**
   * Fast synchronous proximity match against curated South African places catalog (~150m radius)
   */
  findNearbyCuratedPlace(lat: number, lng: number, thresholdDegrees = 0.0015): GeocodingResult | null {
    for (const place of CURATED_SA_PLACES) {
      const dLat = Math.abs(place.coordinates.latitude - lat);
      const dLng = Math.abs(place.coordinates.longitude - lng);
      if (dLat < thresholdDegrees && dLng < thresholdDegrees) {
        return place;
      }
    }
    return null;
  }

  /**
   * Get an instant, synchronous address/label without blocking on network.
   * Checks reverseCache first, then curated places, then clean coordinate label.
   */
  getInstantFallbackAddress(lat: number, lng: number): string {
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = this.reverseCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.address;
    }

    const nearbyCurated = this.findNearbyCuratedPlace(lat, lng);
    if (nearbyCurated) {
      return nearbyCurated.name;
    }

    return `Pin (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  }

  /**
   * Instant synchronous filter of curated SA places for typing autocomplete (0ms latency)
   */
  getInstantCuratedMatches(query: string): GeocodingResult[] {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 1) return [];
    return CURATED_SA_PLACES.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.secondaryText?.toLowerCase().includes(q)
    );
  }

  /**
   * Search for addresses and places with request cancellation, caching, and timeout
   */
  async search(
    query: string,
    biasLocation?: LocationCoordinates
  ): Promise<GeocodingResult[]> {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery || cleanQuery.length < 2) {
      return [];
    }

    // 1. Check local search cache
    const cacheKey = `${cleanQuery}_${biasLocation ? `${biasLocation.latitude.toFixed(2)},${biasLocation.longitude.toFixed(2)}` : 'all'}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.results;
    }

    // 2. Cancel prior pending search request
    if (this.activeSearchController) {
      this.activeSearchController.abort();
    }
    this.activeSearchController = new AbortController();
    const currentSignal = this.activeSearchController.signal;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('GEOCODE_TIMEOUT')), this.REQUEST_TIMEOUT_MS);
      });

      let viewboxParam = '';
      if (biasLocation) {
        const offset = 0.6; // ~60km box around user
        viewboxParam = `&viewbox=${biasLocation.longitude - offset},${biasLocation.latitude + offset},${biasLocation.longitude + offset},${biasLocation.latitude - offset}&bounded=0`;
      }

      const encoded = encodeURIComponent(query.trim());
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&countrycodes=za&addressdetails=1&limit=8${viewboxParam}`;

      const fetchPromise = fetch(url, {
        signal: currentSignal,
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'ZAKAEHailing/1.0 (contact: info@zaka.co.za)',
        },
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]);

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          const parsedResults: GeocodingResult[] = data.map((item: any) => {
            const addr = item.address || {};
            const road = addr.road || addr.pedestrian || addr.suburb || item.name || '';
            const city = addr.city || addr.town || addr.municipality || addr.state || 'Gauteng';
            const suburb = addr.suburb || addr.neighbourhood || addr.city_district || '';

            const mainName = item.name || road || item.display_name.split(',')[0];
            const secondary = suburb ? `${suburb}, ${city}` : city;

            return {
              id: `geo-${item.place_id || Math.random().toString(36).slice(2, 8)}`,
              name: mainName,
              address: item.display_name,
              secondaryText: secondary,
              coordinates: {
                latitude: parseFloat(item.lat),
                longitude: parseFloat(item.lon),
              },
              type: item.type || 'place',
            };
          });

          // Cache and return
          this.searchCache.set(cacheKey, { timestamp: Date.now(), results: parsedResults });
          return parsedResults;
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Request was cancelled by newer keystroke, silently return cached/empty
        return cached?.results || [];
      }
      console.warn('Geocoding remote endpoint fallback:', err.message);
    }

    // 3. Fallback to curated catalog if remote fails or returns 0 matches
    const matchedCurated = CURATED_SA_PLACES.filter(
      (p) =>
        p.name.toLowerCase().includes(cleanQuery) ||
        p.address.toLowerCase().includes(cleanQuery) ||
        p.secondaryText?.toLowerCase().includes(cleanQuery)
    );

    if (matchedCurated.length > 0) {
      return matchedCurated;
    }

    return [];
  }

  /**
   * Reverse geocode coordinates to clean street address with caching, cancellation, and race protection
   */
  async reverseGeocode(lat: number, lng: number): Promise<string> {
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = this.reverseCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.address;
    }

    // Check if coordinates match a known curated location within ~150m
    const nearbyCurated = this.findNearbyCuratedPlace(lat, lng);
    if (nearbyCurated) {
      this.reverseCache.set(key, { timestamp: Date.now(), address: nearbyCurated.address });
      return nearbyCurated.address;
    }

    // Abort obsolete previous reverse-geocoding request
    if (this.activeReverseController) {
      this.activeReverseController.abort();
    }
    this.activeReverseController = new AbortController();
    const currentSignal = this.activeReverseController.signal;
    const thisRequestId = ++this.currentReverseRequestId;

    try {
      const timeoutId = setTimeout(() => {
        if (this.activeReverseController?.signal === currentSignal) {
          this.activeReverseController.abort();
        }
      }, this.REQUEST_TIMEOUT_MS);

      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
      const response = await fetch(url, {
        signal: currentSignal,
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'ZAKAEHailing/1.0 (contact: info@zaka.co.za)',
        },
      });
      clearTimeout(timeoutId);

      // Discard result if a newer reverse geocode request has superseded this one
      if (thisRequestId !== this.currentReverseRequestId) {
        return this.getInstantFallbackAddress(lat, lng);
      }

      if (response.ok) {
        const data = await response.json();
        if (data && data.display_name) {
          const addr = data.address || {};
          const road = addr.road || addr.pedestrian || addr.suburb || '';
          const houseNumber = addr.house_number ? `${addr.house_number} ` : '';
          const suburb = addr.suburb || addr.neighbourhood || addr.city_district || '';
          const city = addr.city || addr.town || addr.municipality || '';

          const formatted = road && (suburb || city)
            ? `${houseNumber}${road}, ${suburb ? `${suburb}, ` : ''}${city}`
            : data.display_name.split(',').slice(0, 3).join(',').trim();

          this.reverseCache.set(key, { timestamp: Date.now(), address: formatted });
          return formatted;
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.warn('Reverse geocode fallback to coordinate string:', e?.message || e);
      }
    }

    return this.getInstantFallbackAddress(lat, lng);
  }

  /**
   * Clear in-memory caches if needed
   */
  clearCache(): void {
    this.searchCache.clear();
    this.reverseCache.clear();
  }

  /**
   * Retrieve curated South African places list
   */
  getCuratedPlaces(): GeocodingResult[] {
    return CURATED_SA_PLACES;
  }
}

export const geocodingService = new GeocodingService();
