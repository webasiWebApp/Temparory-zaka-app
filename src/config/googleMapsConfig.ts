/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Google Maps Platform Styling & Configuration
 * Minimalist, modern commercial ride-hailing map theme:
 * - Light neutral ground (#F5F5F3)
 * - Subtle roads (#FFFFFF & #EAEAEA)
 * - No excessive road labels or point-of-interest clutter
 * - Muted soft-green parks and calm water features
 */

export const GOOGLE_MAPS_API_KEY =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '';

// Map ID required for AdvancedMarkerElement and Vector/Cloud styling
export const GOOGLE_MAPS_MAP_ID =
  (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string) || 'DEMO_MAP_ID';

// Solution attribution ID required by Google Maps Platform AI Studio governance
export const INTERNAL_USAGE_ATTRIBUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

// Premium High-Contrast Black and White / Grayscale Ride-Hailing Map Style
// All land, water, parks, roads, transit, and labels are rendered in elegant black, white, and monochromatic greys.
// Pick-up marker, drop-off marker, ETA pill, and the orange route polyline remain in vivid, punchy color.
export const ZAKA_RIDE_MAP_STYLE: google.maps.MapTypeStyle[] = [
  // Global base: pure monochromatic tone with clear contrast
  {
    featureType: 'all',
    elementType: 'geometry',
    stylers: [{ saturation: -100 }],
  },
  {
    featureType: 'all',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#333333' }, { saturation: -100 }],
  },
  {
    featureType: 'all',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#ffffff' }, { weight: 2 }],
  },
  {
    featureType: 'all',
    elementType: 'labels.icon',
    stylers: [{ visibility: 'off' }],
  },
  // Turn off all distracting business, medical, commercial POIs
  {
    featureType: 'poi',
    stylers: [{ visibility: 'off' }],
  },
  // Parks & green spaces in crisp light grey
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#e5e5e5' }, { visibility: 'on' }, { saturation: -100 }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
  // Landscape: bright clean white/off-white surfaces
  {
    featureType: 'landscape.natural',
    elementType: 'geometry',
    stylers: [{ color: '#f5f5f5' }, { saturation: -100 }],
  },
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry',
    stylers: [{ color: '#eeeeee' }, { saturation: -100 }],
  },
  // Water: crisp smooth light silver-grey with dark text
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#dadada' }, { saturation: -100 }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#666666' }, { saturation: -100 }],
  },
  // Highways: clean defined white fill with solid charcoal-grey borders
  {
    featureType: 'road.highway',
    elementType: 'geometry.fill',
    stylers: [{ color: '#ffffff' }, { saturation: -100 }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#bbbbbb' }, { weight: 1.2 }, { saturation: -100 }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#222222' }, { saturation: -100 }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#ffffff' }, { weight: 2 }],
  },
  // Arterial Roads: crisp white with clear outline
  {
    featureType: 'road.arterial',
    elementType: 'geometry.fill',
    stylers: [{ color: '#ffffff' }, { saturation: -100 }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#cccccc' }, { weight: 1 }, { saturation: -100 }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#444444' }, { saturation: -100 }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#ffffff' }, { weight: 2 }],
  },
  // Local Streets: clean white with subtle defining line
  {
    featureType: 'road.local',
    elementType: 'geometry.fill',
    stylers: [{ color: '#ffffff' }, { saturation: -100 }],
  },
  {
    featureType: 'road.local',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#e0e0e0' }, { weight: 0.8 }, { saturation: -100 }],
  },
  {
    featureType: 'road.local',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#666666' }, { saturation: -100 }],
  },
  {
    featureType: 'road.local',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#ffffff' }, { weight: 2 }],
  },
  // Clean, high-legibility Black & White Area and Locality labels
  {
    featureType: 'administrative.neighborhood',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#555555' }, { saturation: -100 }],
  },
  {
    featureType: 'administrative.neighborhood',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#ffffff' }, { weight: 2 }],
  },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#111111' }, { saturation: -100 }],
  },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#ffffff' }, { weight: 2.5 }],
  },
  {
    featureType: 'administrative.land_parcel',
    stylers: [{ visibility: 'off' }],
  },
  // Transit: subtle grayscale lines
  {
    featureType: 'transit.line',
    elementType: 'geometry',
    stylers: [{ color: '#cccccc' }, { saturation: -100 }],
  },
  {
    featureType: 'transit.station',
    stylers: [{ visibility: 'off' }],
  },
];
