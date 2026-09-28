/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Firebase Configuration & Initialization
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
  getAuth,
  Auth,
} from 'firebase/auth';
import { initializeFirestore, getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { Capacitor } from '@capacitor/core';
import { isRiderTarget } from '../config/appTarget';
import firebaseConfigData from '../../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: firebaseConfigData.apiKey,
  authDomain: firebaseConfigData.authDomain,
  projectId: firebaseConfigData.projectId,
  storageBucket: firebaseConfigData.storageBucket || `${firebaseConfigData.projectId}.firebasestorage.app`,
  messagingSenderId: firebaseConfigData.messagingSenderId,
  appId: firebaseConfigData.appId,
};

// Initialize Firebase App singleton
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase Authentication with explicit persistence chain for Capacitor iOS WKWebView compatibility
export const auth: Auth = (() => {
  if (getApps().length) {
    try {
      return getAuth(app);
    } catch {
      // ignore
    }
  }
  try {
    const isNative = Capacitor.isNativePlatform() || isRiderTarget;
    return initializeAuth(app, {
      persistence: isNative
        ? [indexedDBLocalPersistence, browserLocalPersistence]
        : [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence],
    });
  } catch {
    return getAuth(app);
  }
})();

// Initialize Cloud Firestore
// CRITICAL iOS / WKWebView resilience:
// In Capacitor WKWebView on iOS, 'experimentalAutoDetectLongPolling: true' triggers connection probing
// loops that can hang indefinitely in WKWebView, blocking setDoc / getDoc promises and causing
// account registration to freeze. On native iOS, standard WebSocket connectivity is used ({}).
// In web/iframe environments, experimentalAutoDetectLongPolling is retained for proxy compatibility.
const dbId = firebaseConfigData.firestoreDatabaseId || undefined;
export const db: Firestore = (() => {
  try {
    const isNative = Capacitor.isNativePlatform() || isRiderTarget;
    const firestoreSettings = isNative
      ? {}
      : { experimentalAutoDetectLongPolling: true };

    return initializeFirestore(app, firestoreSettings, dbId);
  } catch {
    return dbId ? getFirestore(app, dbId) : getFirestore(app);
  }
})();

// Initialize Firebase Storage with bounded retry timeouts
export const storage: FirebaseStorage = (() => {
  const bucketUrl = firebaseConfig.storageBucket
    ? (firebaseConfig.storageBucket.startsWith('gs://') ? firebaseConfig.storageBucket : `gs://${firebaseConfig.storageBucket}`)
    : undefined;
  const s = bucketUrl ? getStorage(app, bucketUrl) : getStorage(app);
  // Prevent uploads from hanging indefinitely in background exponential retry loops
  s.maxUploadRetryTime = 4000; // 4 seconds bounded retry window to prevent long freezes on unreachable buckets
  s.maxOperationRetryTime = 4000; // 4 seconds bounded operation retry window
  return s;
})();

export default app;

