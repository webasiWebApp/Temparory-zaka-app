/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Application Target Configuration
 * Supports multi-target builds from a single unified codebase:
 * - 'web': Full platform (Passenger, Driver, Admin, Demo Simulator)
 * - 'rider-ios': Dedicated native iOS Rider / Passenger experience
 * - 'driver-ios': Future-ready dedicated native iOS Driver experience
 */

export type AppTarget = 'web' | 'rider-ios' | 'driver-ios';

const envTarget = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_APP_TARGET) || 'web';
const rawTarget = String(envTarget).trim().toLowerCase();

export const APP_TARGET: AppTarget =
  rawTarget === 'rider-ios' || rawTarget === 'driver-ios' ? rawTarget : 'web';

export const isRiderTarget = APP_TARGET === 'rider-ios';
export const isDriverTarget = APP_TARGET === 'driver-ios';
export const isWebTarget = APP_TARGET === 'web';

/**
 * Temporary switch: when true, passengers skip the identity verification screen (phone code, ID, live photo).
 * Nothing is removed - set to false (or VITE_BYPASS_PASSENGER_VERIFICATION=false) to enforce it again.
 * Client-side only: firestore.rules still require an approved passenger to book until the rules are relaxed.
 */
const bypassEnv = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BYPASS_PASSENGER_VERIFICATION) || 'true';
export const BYPASS_PASSENGER_VERIFICATION = String(bypassEnv).trim().toLowerCase() !== 'false';
