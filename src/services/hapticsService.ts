/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Native iOS & Web Haptics Service
 * Provides subtle tactile feedback on Apple Taptic Engine with safe web vibration fallbacks.
 */

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export const hapticsService = {
  /**
   * Subtle selection click when selecting pickup, destination, or vehicle category pill
   */
  async selection(): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        await Haptics.selectionChanged();
      } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(10);
      }
    } catch {
      // Haptics fail silently if unsupported
    }
  },

  /**
   * Light impact on standard confirmation buttons
   */
  async light(): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        await Haptics.impact({ style: ImpactStyle.Light });
      } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(15);
      }
    } catch {
      // Ignore
    }
  },

  /**
   * Medium impact when requesting a ride or toggling primary booking state
   */
  async medium(): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        await Haptics.impact({ style: ImpactStyle.Medium });
      } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(25);
      }
    } catch {
      // Ignore
    }
  },

  /**
   * Celebratory success feedback when driver is matched or ride completes
   */
  async success(): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        await Haptics.notification({ type: NotificationType.Success });
      } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.([20, 50, 30]);
      }
    } catch {
      // Ignore
    }
  },

  /**
   * Warning or caution feedback for SOS or cancellation
   */
  async warning(): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        await Haptics.notification({ type: NotificationType.Warning });
      } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.([40, 40, 40]);
      }
    } catch {
      // Ignore
    }
  },
};
