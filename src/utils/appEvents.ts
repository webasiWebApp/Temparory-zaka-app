/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - App-wide navigation events
 */

const GO_HOME_EVENT = 'zaka:go-home';

/** Fired when the ZAKA logo is pressed: every screen returns to its Home view */
export function emitGoHome(): void {
  window.dispatchEvent(new Event(GO_HOME_EVENT));
}

export function onGoHome(handler: () => void): () => void {
  window.addEventListener(GO_HOME_EVENT, handler);
  return () => window.removeEventListener(GO_HOME_EVENT, handler);
}
