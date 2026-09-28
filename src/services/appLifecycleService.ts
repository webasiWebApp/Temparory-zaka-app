/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - App Lifecycle & Network State Handler
 * Handles iOS foreground/background transitions, network reconnects, and listener resync.
 */

import { Capacitor } from '@capacitor/core';
import { App, AppState } from '@capacitor/app';

type ResumeCallback = () => void;
const resumeListeners: Set<ResumeCallback> = new Set();

let isInitialized = false;

export function initAppLifecycle(): void {
  if (isInitialized) return;
  isInitialized = true;

  if (Capacitor.isNativePlatform()) {
    App.addListener('appStateChange', (state: AppState) => {
      if (state.isActive) {
        console.log('[Lifecycle] App entered foreground. Triggering fresh data resync.');
        resumeListeners.forEach((cb) => {
          try {
            cb();
          } catch (e) {
            console.warn('[Lifecycle] Error in resume listener:', e);
          }
        });
      } else {
        console.log('[Lifecycle] App entered background.');
      }
    });

    App.addListener('appUrlOpen', (event) => {
      console.log('[Lifecycle] Deep link URL opened:', event.url);
      // Handle deep links like zaka://ride/... or zaka://payment-return
      if (event.url.includes('payment-return') || event.url.includes('pay-return')) {
        window.dispatchEvent(new CustomEvent('zaka:paymentReturn', { detail: { url: event.url } }));
      }
    });
  }

  // Also listen for standard web visibilitychange and online events
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        resumeListeners.forEach((cb) => {
          try {
            cb();
          } catch (e) {
            console.warn('[Lifecycle] Visibility change callback error:', e);
          }
        });
      }
    });

    window.addEventListener('online', () => {
      console.log('[Lifecycle] Network reconnected.');
      resumeListeners.forEach((cb) => {
        try {
          cb();
        } catch (e) {
          console.warn('[Lifecycle] Online callback error:', e);
        }
      });
    });
  }
}

/**
 * Register a listener to refresh active ride / driver location upon app foregrounding
 */
export function onAppResume(callback: ResumeCallback): () => void {
  initAppLifecycle();
  resumeListeners.add(callback);
  return () => {
    resumeListeners.delete(callback);
  };
}
