/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Backend API Client
 * Single entry point for every call to the ZAKA Express backend:
 * resolves the API base URL (required on native iOS, where relative URLs point at the app bundle),
 * attaches the signed-in user's Firebase ID token and enforces a request timeout.
 */

import { Capacitor } from '@capacitor/core';
import { auth } from '../firebase/config';

const configuredBase = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

export const API_BASE_URL = configuredBase;

const DEFAULT_TIMEOUT_MS = 20000;

export class ApiConfigurationError extends Error {}

/**
 * Builds the absolute URL for a backend path such as '/api/payments/config'.
 * On the web the backend serves the app, so a relative path is correct.
 * Inside the native app there is no backend on the app's own origin, so VITE_API_BASE_URL is mandatory.
 */
export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (configuredBase) return `${configuredBase}${cleanPath}`;
  if (Capacitor.isNativePlatform()) {
    throw new ApiConfigurationError(
      'ZAKA server address is not configured for this app build (VITE_API_BASE_URL).'
    );
  }
  return cleanPath;
}

export async function getIdToken(forceRefresh = false): Promise<string | null> {
  try {
    return auth.currentUser ? await auth.currentUser.getIdToken(forceRefresh) : null;
  } catch {
    return null;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  /** JSON-serialisable request body */
  json?: unknown;
  /** Attach the Firebase ID token (default true) */
  authenticated?: boolean;
  timeoutMs?: number;
}

export async function apiFetch(path: string, options: ApiRequestOptions = {}): Promise<Response> {
  const { json, authenticated = true, timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...init } = options;

  const finalHeaders = new Headers(headers || {});
  if (json !== undefined) finalHeaders.set('Content-Type', 'application/json');
  if (authenticated) {
    const token = await getIdToken();
    if (token) finalHeaders.set('Authorization', `Bearer ${token}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(apiUrl(path), {
      ...init,
      headers: finalHeaders,
      body: json !== undefined ? JSON.stringify(json) : undefined,
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('The request timed out. Please check your internet connection and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Convenience wrapper returning parsed JSON (an empty object when the body is not JSON). */
export async function apiJson<T = any>(path: string, options: ApiRequestOptions = {}): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await apiFetch(path, options);
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}
