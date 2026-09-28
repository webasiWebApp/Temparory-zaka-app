/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Firestore Backend Services
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db, auth } from './config';
import { handleFirestoreError, OperationType } from './firestoreErrors';
import {
  UserProfile,
  PassengerProfile,
  DriverProfile,
  DriverVehicle,
  DriverDocumentRecord,
  DriverDocumentType,
  DocumentStatus,
  RideDocument,
  RideStatus,
  PaymentRecord,
  PaymentMethod,
  PaymentStatus,
  RatingRecord,
  NotificationRecord,
  LocationCoordinates,
  PassengerLocation,
  RecentDestination,
  VehicleType,
  PricingConfig,
  AdminAuditRecord,
  UserRole,
} from '../types';
import { ZAKA_DEFAULT_LAUNCH_PRICING, fareService } from '../services/fareService';

/**
 * Recursively strips all keys with undefined values from an object or array.
 * Firestore rejects any payload containing undefined values with:
 * "Unsupported field value: undefined"
 */
export function removeUndefinedFields<T>(val: T): T {
  if (val === null || val === undefined) {
    return val;
  }
  if (Array.isArray(val)) {
    return val
      .filter((item) => item !== undefined)
      .map((item) => (typeof item === 'object' ? removeUndefinedFields(item) : item)) as unknown as T;
  }
  if (typeof val === 'object' && !(val instanceof Date) && !(val instanceof Timestamp)) {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(val as Record<string, any>)) {
      if (v !== undefined) {
        cleaned[k] = typeof v === 'object' && v !== null ? removeUndefinedFields(v) : v;
      }
    }
    return cleaned as T;
  }
  return val;
}
import { mapService } from '../services/mapService';

// In-memory telemetry cache to enforce the 15-metre and 10-second Firestore throttling rule
const driverLastPersistedTelemetry = new Map<string, { coords: LocationCoordinates; timestamp: number }>();

export const VEHICLE_CONFIGS: Record<VehicleType, {
  type: VehicleType;
  name: string;
  tagline: string;
  capacity: number;
  etaMins: number;
  baseFare: number;
  perKmRate: number;
  perMinuteRate: number;
  minimumFare: number;
  icon: string;
}> = {
  economy: {
    type: 'economy',
    name: 'Economy',
    tagline: 'Standard affordable ride for everyday commutes',
    capacity: 4,
    etaMins: 3,
    baseFare: 25.0,
    perKmRate: 10.5,
    perMinuteRate: 1.5,
    minimumFare: 35.0,
    icon: 'car-compact',
  },
  comfort: {
    type: 'comfort',
    name: 'Comfort',
    tagline: 'Spacious, newer vehicles with top-rated drivers',
    capacity: 4,
    etaMins: 4,
    baseFare: 35.0,
    perKmRate: 14.0,
    perMinuteRate: 2.0,
    minimumFare: 50.0,
    icon: 'car-sedan',
  },
  xl: {
    type: 'xl',
    name: 'XL',
    tagline: 'Extra space for up to 6 passengers and luggage',
    capacity: 6,
    etaMins: 6,
    baseFare: 45.0,
    perKmRate: 18.0,
    perMinuteRate: 2.5,
    minimumFare: 70.0,
    icon: 'car-suv',
  },
  moto: {
    type: 'moto',
    name: 'Moto',
    tagline: 'Fast and agile motorcycle ride to beat city traffic',
    capacity: 1,
    etaMins: 2,
    baseFare: 15.0,
    perKmRate: 7.0,
    perMinuteRate: 1.0,
    minimumFare: 22.0,
    icon: 'bike',
  },
};

export const firestoreService = {
  // ================= USERS & AUTH PROFILES =================

  /**
   * Checks whether a canonical normalized phone number is already registered in the system
   * across users, passengers, drivers, and phoneIndex collections.
   */
  async checkPhoneRegistered(normalizedPhone: string): Promise<{ isRegistered: boolean; uid?: string }> {
    if (!normalizedPhone) return { isRegistered: false };

    // 1. Check server-side endpoint (which checks phoneIndex, users, passengers, and drivers with admin privileges)
    try {
      const res = await fetch(`/api/auth/check-phone?phone=${encodeURIComponent(normalizedPhone)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.isRegistered === 'boolean') {
          return { isRegistered: data.isRegistered, uid: data.uid };
        }
      }
    } catch (netErr) {
      console.warn('Note checking phone registered via backend API:', netErr);
    }

    // 2. Direct client-side phoneIndex check as fallback
    try {
      const pRef = doc(db, 'phoneIndex', normalizedPhone);
      const snap = await getDoc(pRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data?.uid) {
          return { isRegistered: true, uid: data.uid };
        }
      }
    } catch (err: any) {
      console.warn('Note checking phone registered in phoneIndex:', err);
    }

    return { isRegistered: false };
  },

  /**
   * Atomically claims and reserves a normalized phone number for a user UID via a Firestore transaction.
   * Throws if the phone is already mapped to a different user.
   */
  async claimPhoneIndex(normalizedPhone: string, uid: string): Promise<void> {
    if (!normalizedPhone || !uid) return;
    const phoneRef = doc(db, 'phoneIndex', normalizedPhone);
    const now = new Date().toISOString();

    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(phoneRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data?.uid && data.uid !== uid) {
            throw new Error('This phone number is already registered. Please sign in instead.');
          }
        }
        transaction.set(phoneRef, {
          uid,
          normalizedPhone,
          createdAt: snap.exists() ? snap.data()?.createdAt || now : now,
          updatedAt: now,
        }, { merge: true });
      });
    } catch (err: any) {
      if (err?.message && (err.message.includes('already registered') || err.message.includes('already registered with ZAKA'))) {
        throw err;
      }
      console.warn('phoneIndex claim transaction note (proceeding):', err);
    }
  },

  async createUserProfile(user: UserProfile): Promise<void> {
    try {
      const userRef = doc(db, 'users', user.uid);
      const existingRoles = Array.isArray(user.roles) && user.roles.length > 0
        ? user.roles
        : [user.role || 'passenger'];
      const activeRole = user.activeRole || user.role || existingRoles[0] || 'passenger';

      await setDoc(userRef, {
        ...user,
        roles: existingRoles,
        activeRole,
        role: activeRole, // legacy compat
        emailVerified: Boolean(user.emailVerified),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (e: any) {
      if (e?.code === 'permission-denied') {
        handleFirestoreError(e, OperationType.CREATE, `users/${user.uid}`);
      }
      throw e;
    }
  },

  /**
   * Upgrades an existing authenticated Rider to also have the Driver role under the same UID.
   * Does NOT create a second Firebase Auth account.
   */
  async becomeDriver(uid: string, vehicleData?: Partial<DriverVehicle>): Promise<void> {
    const userRef = doc(db, 'users', uid);
    const driverRef = doc(db, 'drivers', uid);
    const vehicleRef = doc(db, 'vehicles', uid);
    const now = new Date().toISOString();

    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      throw new Error('User profile not found for driver onboarding.');
    }
    const userData = userSnap.data() as UserProfile;
    const currentRoles: UserRole[] = Array.isArray(userData.roles) && userData.roles.length > 0
      ? userData.roles
      : [userData.role || 'passenger'];

    const newRoles: UserRole[] = Array.from(new Set([...currentRoles, 'driver']));

    // 1. Update user identity document: add driver to roles array
    await setDoc(userRef, {
      roles: newRoles,
      updatedAt: now,
    }, { merge: true });

    // 2. Create or initialize driver document in pending verification state
    const dSnap = await getDoc(driverRef);
    if (!dSnap.exists()) {
      const driverDoc: DriverProfile = {
        userId: uid,
        name: userData.name || 'ZAKA Driver',
        phone: userData.phone || '',
        photoURL: userData.photoURL || '',
        rating: 5.0,
        totalTrips: 0,
        online: false,
        available: false,
        verificationStatus: 'pending',
        currentLocation: {
          latitude: -26.1458,
          longitude: 28.0416,
          timestamp: Date.now(),
        },
        earningsToday: 0,
        earningsThisWeek: 0,
        totalEarnings: 0,
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(driverRef, driverDoc);
    }

    // 3. Create or initialize vehicle document in pending state
    const vSnap = await getDoc(vehicleRef);
    if (!vSnap.exists()) {
      const vehicleDoc: DriverVehicle = {
        driverId: uid,
        vehicleType: vehicleData?.vehicleType || 'economy',
        make: vehicleData?.make || 'Toyota',
        model: vehicleData?.model || 'Corolla Quest',
        year: vehicleData?.year || 2021,
        colour: vehicleData?.colour || 'White',
        registrationNumber: vehicleData?.registrationNumber || 'PENDING',
        passengerCapacity: vehicleData?.passengerCapacity || (vehicleData?.vehicleType === 'xl' ? 6 : 4),
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(vehicleRef, vehicleDoc);
    }
  },

  /**
   * Switches the user's active role between authorized roles (e.g. passenger <-> driver).
   */
  async switchUserActiveRole(uid: string, newRole: UserRole): Promise<void> {
    const userRef = doc(db, 'users', uid);
    const now = new Date().toISOString();

    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;
    const userData = userSnap.data() as UserProfile;
    const roles: UserRole[] = Array.isArray(userData.roles) && userData.roles.length > 0
      ? userData.roles
      : [userData.role || 'passenger'];

    if (!roles.includes(newRole)) {
      throw new Error(`Cannot switch to role "${newRole}" because it has not been granted to this account.`);
    }

    // If switching away from driver, ensure driver goes offline in Firestore
    if (newRole !== 'driver') {
      try {
        const dRef = doc(db, 'drivers', uid);
        await updateDoc(dRef, { online: false, available: false, updatedAt: now });
      } catch {
        // ignore if driver doc not yet initialized
      }
    }

    await setDoc(userRef, {
      activeRole: newRole,
      role: newRole,
      updatedAt: now,
    }, { merge: true });
  },

  async getUserProfile(uid: string): Promise<UserProfile | null> {
    try {
      const userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) return null;
      return snap.data() as UserProfile;
    } catch (e: any) {
      if (e?.code === 'permission-denied') {
        handleFirestoreError(e, OperationType.GET, `users/${uid}`);
      }
      console.warn('Notice reading user profile from Firestore:', e);
      return null;
    }
  },

  async updateUserProfile(uid: string, updates: Partial<UserProfile>): Promise<void> {
    try {
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, {
        ...updates,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (e: any) {
      if (e?.code === 'permission-denied') {
        handleFirestoreError(e, OperationType.UPDATE, `users/${uid}`);
      }
      throw e;
    }
  },

  /**
   * Securely deletes or anonymizes a user's profile and personal identity data upon user request (POPIA/GDPR compliance).
   * Note: Completed ride transactions and payments remain intact with pseudonymized user references for statutory financial compliance.
   */
  async deleteOrAnonymizeUserProfile(uid: string): Promise<void> {
    try {
      const userRef = doc(db, 'users', uid);
      const passengerRef = doc(db, 'passengers', uid);

      // Delete the passenger profile document
      try {
        await deleteDoc(passengerRef);
      } catch (err) {
        console.warn('Note deleting passenger document:', err);
      }

      // Delete the user profile document
      try {
        await deleteDoc(userRef);
      } catch (err) {
        console.warn('Note deleting user document:', err);
      }
    } catch (err) {
      console.error('Error during user profile deletion:', err);
      throw err;
    }
  },

  // ================= PASSENGER LOCATION & RECENT DESTINATIONS =================

  async updatePassengerCurrentLocation(uid: string, location: PassengerLocation): Promise<void> {
    const userRef = doc(db, 'users', uid);
    const now = new Date().toISOString();
    await setDoc(
      userRef,
      {
        currentLocation: {
          latitude: location.latitude,
          longitude: location.longitude,
          address: location.address,
          timestamp: location.timestamp || Date.now(),
          updatedAt: now,
        },
        updatedAt: now,
      },
      { merge: true }
    );
  },

  async saveRecentDestination(
    uid: string,
    destination: {
      address: string;
      latitude: number;
      longitude: number;
      name?: string;
    }
  ): Promise<string> {
    const recentRef = collection(db, 'users', uid, 'recentDestinations');
    const now = new Date().toISOString();

    // Check for existing duplicate address or near coordinates
    try {
      const q = query(recentRef, limit(20));
      const snap = await getDocs(q);
      const existing = snap.docs.find((d) => {
        const data = d.data();
        const sameAddress =
          data.address?.toLowerCase().trim() === destination.address.toLowerCase().trim();
        const closeCoords =
          Math.abs(data.latitude - destination.latitude) < 0.001 &&
          Math.abs(data.longitude - destination.longitude) < 0.001;
        return sameAddress || closeCoords;
      });

      if (existing) {
        // Update lastUsedAt
        await updateDoc(doc(db, 'users', uid, 'recentDestinations', existing.id), {
          lastUsedAt: now,
          name: destination.name || existing.data().name || destination.address.split(',')[0],
          address: destination.address,
          latitude: destination.latitude,
          longitude: destination.longitude,
        });
        return existing.id;
      }
    } catch (e) {
      console.warn('Note checking recent destinations:', e);
    }

    // Add new destination document
    const newDoc = await addDoc(recentRef, {
      name: destination.name || destination.address.split(',')[0],
      address: destination.address,
      latitude: destination.latitude,
      longitude: destination.longitude,
      createdAt: now,
      lastUsedAt: now,
    });
    return newDoc.id;
  },

  async getRecentDestinations(uid: string): Promise<RecentDestination[]> {
    try {
      const recentRef = collection(db, 'users', uid, 'recentDestinations');
      const q = query(recentRef, orderBy('lastUsedAt', 'desc'), limit(10));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as RecentDestination[];
    } catch (err) {
      console.warn('Error fetching recent destinations:', err);
      return [];
    }
  },

  async deleteRecentDestination(uid: string, destinationId: string): Promise<void> {
    const destRef = doc(db, 'users', uid, 'recentDestinations', destinationId);
    await deleteDoc(destRef);
  },

  async createOrUpdatePassenger(passenger: PassengerProfile): Promise<void> {
    try {
      const pRef = doc(db, 'passengers', passenger.userId);
      await setDoc(pRef, {
        ...passenger,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (e: any) {
      if (e?.code === 'permission-denied') {
        handleFirestoreError(e, OperationType.CREATE, `passengers/${passenger.userId}`);
      }
      throw e;
    }
  },

  async getPassengerProfile(userId: string): Promise<PassengerProfile | null> {
    try {
      const pRef = doc(db, 'passengers', userId);
      const snap = await getDoc(pRef);
      if (!snap.exists()) return null;
      return snap.data() as PassengerProfile;
    } catch (e: any) {
      if (e?.code === 'permission-denied') {
        handleFirestoreError(e, OperationType.GET, `passengers/${userId}`);
      }
      console.warn('Notice reading passenger profile:', e);
      return null;
    }
  },

  async createOrUpdateDriver(driver: DriverProfile): Promise<void> {
    try {
      const dRef = doc(db, 'drivers', driver.userId);
      await setDoc(dRef, {
        ...driver,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (e: any) {
      if (e?.code === 'permission-denied') {
        handleFirestoreError(e, OperationType.CREATE, `drivers/${driver.userId}`);
      }
      throw e;
    }
  },

  async getDriverProfile(userId: string): Promise<DriverProfile | null> {
    try {
      const dRef = doc(db, 'drivers', userId);
      const snap = await getDoc(dRef);
      if (!snap.exists()) return null;
      return snap.data() as DriverProfile;
    } catch (e: any) {
      if (e?.code === 'permission-denied') {
        handleFirestoreError(e, OperationType.GET, `drivers/${userId}`);
      }
      console.warn('Notice reading driver profile:', e);
      return null;
    }
  },

  async createOrUpdateVehicle(vehicle: DriverVehicle): Promise<void> {
    const vRef = doc(db, 'vehicles', vehicle.driverId);
    await setDoc(vRef, {
      ...vehicle,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    // Also link vehicle directly in driver doc
    const dRef = doc(db, 'drivers', vehicle.driverId);
    await updateDoc(dRef, {
      vehicle,
      updatedAt: new Date().toISOString(),
    });
  },

  async toggleDriverOnlineStatus(driverId: string, online: boolean, location?: LocationCoordinates): Promise<void> {
    const dRef = doc(db, 'drivers', driverId);
    if (online) {
      const snap = await getDoc(dRef);
      if (snap.exists()) {
        const data = snap.data() as DriverProfile;
        // Non-demo drivers MUST be verified by admin
        if (!data.isDemo && data.verificationStatus !== 'approved') {
          throw new Error('Your driver profile has not been verified yet. Only approved drivers can go online.');
        }
        if (!data.vehicle || !data.vehicle.registrationNumber) {
          throw new Error('You must register a vehicle before going online.');
        }
      }
    } else {
      // Driver going offline: clear throttle cache so going online later forces an immediate GPS sync
      driverLastPersistedTelemetry.delete(driverId);
    }
    const updateData: any = {
      online,
      isOnline: online,
      available: online,
      updatedAt: new Date().toISOString(),
    };
    if (location && !isNaN(location.latitude) && !isNaN(location.longitude)) {
      updateData.currentLocation = {
        ...location,
        timestamp: Date.now(),
      };
      updateData.lastLocation = {
        ...location,
        timestamp: Date.now(),
      };
      driverLastPersistedTelemetry.set(driverId, { coords: location, timestamp: Date.now() });
    }
    await updateDoc(dRef, updateData);
  },

  async updateDriverLocation(driverId: string, location: LocationCoordinates): Promise<void> {
    if (
      isNaN(location.latitude) ||
      isNaN(location.longitude) ||
      location.latitude < -90 ||
      location.latitude > 90 ||
      location.longitude < -180 ||
      location.longitude > 180
    ) {
      return;
    }
    const dRef = doc(db, 'drivers', driverId);
    await updateDoc(dRef, {
      currentLocation: {
        ...location,
        timestamp: Date.now(),
      },
      updatedAt: new Date().toISOString(),
    });
  },

  // Listen to all online drivers with demo separation, stale removal, and sanity bounds
  listenToOnlineDrivers(callback: (drivers: DriverProfile[]) => void, isDemo?: boolean) {
    const q = query(
      collection(db, 'drivers'),
      where('online', '==', true),
      limit(50)
    );
    return onSnapshot(q, (snapshot) => {
      const now = Date.now();
      const drivers = snapshot.docs
        .map((doc) => doc.data() as DriverProfile)
        .filter((d) => {
          // 1. Strict demo isolation
          const driverIsDemo = Boolean(d.isDemo);
          if (isDemo !== undefined && driverIsDemo !== isDemo) {
            return false;
          }
          // 2. Verification check (approved only)
          if (d.verificationStatus !== 'approved') {
            return false;
          }
          // 3. Coordinate validation
          if (!d.currentLocation || typeof d.currentLocation.latitude !== 'number' || typeof d.currentLocation.longitude !== 'number') {
            return false;
          }
          if (isNaN(d.currentLocation.latitude) || isNaN(d.currentLocation.longitude)) {
            return false;
          }
          if (d.currentLocation.latitude < -90 || d.currentLocation.latitude > 90 || d.currentLocation.longitude < -180 || d.currentLocation.longitude > 180) {
            return false;
          }
          // 4. Stale-signal handling for production (telemetry older than 45s is considered inactive)
          if (!driverIsDemo) {
            const locTime = d.currentLocation.timestamp || (d.updatedAt ? new Date(d.updatedAt).getTime() : 0);
            if (!locTime || now - locTime > 45000) {
              return false;
            }
          }
          return true;
        });

      // Deduplicate by userId
      const seen = new Set<string>();
      const uniqueDrivers = drivers.filter((d) => {
        const key = d.userId;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      callback(uniqueDrivers);
    }, (err) => {
      console.warn('Error listening to online drivers:', err);
    });
  },

  // ================= RIDES & DISPATCH ENGINE =================

  async createRideRequest(rideData: Omit<RideDocument, 'id'>): Promise<string> {
    const ridesCol = collection(db, 'rides');
    
    // Server-side validation of fare calculations
    const dist = rideData.estimatedDistanceKm || rideData.distanceKm || 1;
    const dur = rideData.estimatedDurationMin || rideData.estimatedDurationMinutes || 5;
    
    // Retrieve dynamic pricing if available, else fallback to standard ZAKA tariffs
    const pricingConfig = ZAKA_DEFAULT_LAUNCH_PRICING[rideData.rideType] || ZAKA_DEFAULT_LAUNCH_PRICING.economy;
    const calculated = fareService.calculateFareBreakdown(pricingConfig, dist, dur);
    
    const nowIso = new Date().toISOString();
    const isDemo = rideData.isDemo ?? (auth.currentUser?.isAnonymous || false);
    const docRef = await addDoc(ridesCol, {
      ...rideData,
      isDemo: Boolean(isDemo),
      distanceKm: dist,
      estimatedDistanceKm: dist,
      estimatedDurationMinutes: dur,
      estimatedDurationMin: dur,
      baseFare: calculated.baseFare,
      distanceFare: calculated.distanceFare,
      timeFare: calculated.timeFare,
      estimatedFare: calculated.totalFare || rideData.estimatedFare,
      currency: 'ZAR',
      status: 'searching' as RideStatus,
      driverId: null,
      driverName: null,
      driverPhone: null,
      driverPhotoURL: null,
      driverRating: null,
      driverCurrentLocation: null,
      vehicleDetails: null,
      acceptedAt: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      createdAt: nowIso,
      requestedAt: nowIso,
    });

    // Create system notification for passenger
    await this.sendNotification({
      userId: rideData.passengerId,
      title: 'Searching for ZAKA Driver',
      message: `Looking for nearby ${rideData.rideType.toUpperCase()} drivers for your trip to ${rideData.destinationAddress}`,
      type: 'ride',
      read: false,
      createdAt: nowIso,
    });

    return docRef.id;
  },

  /**
   * Proximity-based driver matching logic:
   * Filter drivers: active, approved, online, available, not assigned to active trip
   * Rank drivers by distance (Driver -> Pickup)
   */
  async getEligibleDriversForRide(
    pickupLat: number,
    pickupLon: number,
    rideType?: VehicleType,
    isDemo: boolean = false
  ): Promise<Array<{ driver: DriverProfile; distanceKm: number; etaMins: number }>> {
    try {
      const driversCol = collection(db, 'drivers');
      const q = query(
        driversCol,
        where('online', '==', true),
        where('available', '==', true),
        where('verificationStatus', '==', 'approved')
      );
      const snap = await getDocs(q);
      const results: Array<{ driver: DriverProfile; distanceKm: number; etaMins: number }> = [];

      snap.forEach((docSnap) => {
        const d = docSnap.data() as DriverProfile;
        // Strict demo separation: demo drivers for demo rides only, real drivers for real rides only
        if (Boolean(d.isDemo) !== isDemo) return;

        if (d.currentLocation && typeof d.currentLocation.latitude === 'number' && typeof d.currentLocation.longitude === 'number') {
          // If rideType specified, check vehicle type match if configured
          if (rideType && d.vehicle && d.vehicle.vehicleType) {
            // XL drivers can take XL and Economy; Economy drivers take Economy; etc.
            if (rideType === 'xl' && d.vehicle.vehicleType !== 'xl') return;
            if (rideType === 'moto' && d.vehicle.vehicleType !== 'moto') return;
          }

          const dist = fareService.calculateDistanceKm(
            { latitude: d.currentLocation.latitude, longitude: d.currentLocation.longitude },
            { latitude: pickupLat, longitude: pickupLon }
          );
          const eta = Math.max(1, Math.round(dist * 2.2)); // ~25-35 km/h urban speed
          results.push({ driver: d, distanceKm: dist, etaMins: eta });
        }
      });

      // Rank ascending by proximity
      results.sort((a, b) => a.distanceKm - b.distanceKm);
      return results;
    } catch (err) {
      console.warn('Error finding eligible drivers:', err);
      return [];
    }
  },

  async getRide(rideId: string): Promise<RideDocument | null> {
    try {
      const snap = await getDoc(doc(db, 'rides', rideId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as RideDocument;
    } catch (err) {
      console.warn('Error fetching ride:', err);
      return null;
    }
  },

  listenToRide(rideId: string, callback: (ride: RideDocument | null) => void) {
    return this.listenToActiveRide(rideId, callback);
  },

  listenToActiveRide(rideId: string, callback: (ride: RideDocument | null) => void) {
    const rideRef = doc(db, 'rides', rideId);
    return onSnapshot(rideRef, (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }
      callback({ id: snapshot.id, ...snapshot.data() } as RideDocument);
    }, (err) => {
      console.warn('Error listening to active ride:', err);
    });
  },

  listenToPassengerRides(passengerId: string, callback: (rides: RideDocument[]) => void) {
    const q = query(
      collection(db, 'rides'),
      where('passengerId', '==', passengerId),
      limit(50)
    );
    return onSnapshot(q, (snapshot) => {
      const rides = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as RideDocument[];
      // Sort newest first
      rides.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(rides);
    }, (err) => {
      console.warn('Error listening to passenger rides:', err);
    });
  },

  listenToSearchingRides(callback: (rides: RideDocument[]) => void, isDemo?: boolean) {
    const isAnonymousOrDemo = isDemo ?? (auth.currentUser?.isAnonymous || false);
    const q = isAnonymousOrDemo
      ? query(
          collection(db, 'rides'),
          where('status', '==', 'searching'),
          where('isDemo', '==', true),
          limit(25)
        )
      : query(
          collection(db, 'rides'),
          where('status', '==', 'searching'),
          where('isDemo', '==', false),
          limit(25)
        );
    return onSnapshot(q, (snapshot) => {
      const rides = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as RideDocument[];
      rides.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      if (isAnonymousOrDemo) {
        callback(rides);
      } else {
        callback(rides.filter((r) => !r.isDemo));
      }
    }, (err) => {
      console.warn('Error listening to searching rides:', err);
    });
  },

  listenToDriverRides(driverId: string, callback: (rides: RideDocument[]) => void) {
    const q = query(
      collection(db, 'rides'),
      where('driverId', '==', driverId),
      limit(50)
    );
    return onSnapshot(q, (snapshot) => {
      const rides = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as RideDocument[];
      rides.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(rides);
    }, (err) => {
      console.warn('Error listening to driver rides:', err);
    });
  },

  // Atomic ride acceptance via Firestore Transaction (prevents race conditions)
  async acceptRideTransaction(rideId: string, driver: DriverProfile): Promise<boolean> {
    const rideRef = doc(db, 'rides', rideId);
    const driverRef = doc(db, 'drivers', driver.userId);

    try {
      await runTransaction(db, async (transaction) => {
        const rideSnap = await transaction.get(rideRef);
        if (!rideSnap.exists()) {
          throw new Error('Ride does not exist');
        }

        const rideData = rideSnap.data() as RideDocument;
        if (rideData.status !== 'searching') {
          throw new Error('Ride is no longer available');
        }

        // Update ride document to 'accepted'
        transaction.update(rideRef, {
          driverId: driver.userId,
          driverName: driver.name,
          driverPhone: driver.phone,
          driverPhotoURL: driver.photoURL || '',
          driverRating: driver.rating || 5.0,
          driverCurrentLocation: driver.currentLocation || null,
          vehicleDetails: driver.vehicle ? {
            make: driver.vehicle.make,
            model: driver.vehicle.model,
            colour: driver.vehicle.colour,
            registrationNumber: driver.vehicle.registrationNumber,
            vehicleType: driver.vehicle.vehicleType,
          } : null,
          status: 'accepted',
          acceptedAt: new Date().toISOString(),
        });

        // Set driver availability to false while assigned to a ride
        const dSnap = await transaction.get(driverRef);
        if (dSnap.exists()) {
          transaction.update(driverRef, {
            available: false,
            updatedAt: new Date().toISOString(),
          });
        }
      });

      // Send notification to passenger
      const rideSnap = await getDoc(rideRef);
      if (rideSnap.exists()) {
        const r = rideSnap.data() as RideDocument;
        await this.sendNotification({
          userId: r.passengerId,
          title: 'Driver Confirmed!',
          message: `${driver.name} accepted your ride in a ${driver.vehicle?.colour || ''} ${driver.vehicle?.make || 'Vehicle'} (${driver.vehicle?.registrationNumber || ''}). Your safety PIN is ${r.otp}`,
          type: 'ride',
          read: false,
          createdAt: new Date().toISOString(),
        });
      }

      return true;
    } catch (err: any) {
      console.error('Accept ride transaction failed:', err.message);
      return false;
    }
  },

  // Transition: accepted -> driver_arriving
  async startDrivingToPickup(rideId: string, driverId: string): Promise<boolean> {
    const rideRef = doc(db, 'rides', rideId);
    try {
      await runTransaction(db, async (transaction) => {
        const rideSnap = await transaction.get(rideRef);
        if (!rideSnap.exists()) throw new Error('Ride not found');
        const ride = rideSnap.data() as RideDocument;
        if (ride.driverId !== driverId) throw new Error('Unauthorized driver');
        if (ride.status !== 'accepted') throw new Error(`Invalid status transition from ${ride.status}`);

        const arrivingTime = new Date().toISOString();
        transaction.update(rideRef, {
          status: 'driver_arriving',
          driverArrivingAt: arrivingTime,
          updatedAt: arrivingTime,
        });
      });

      const snap = await getDoc(rideRef);
      if (snap.exists()) {
        const r = snap.data() as RideDocument;
        await this.sendNotification({
          userId: r.passengerId,
          title: 'Driver is on the way!',
          message: `${r.driverName || 'Your driver'} is en route to your pickup location.`,
          type: 'ride',
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
      return true;
    } catch (e) {
      console.error('Failed to start driving to pickup:', e);
      return false;
    }
  },

  // Transition: driver_arriving -> driver_arrived
  async markDriverArrived(rideId: string, driverId: string): Promise<boolean> {
    const rideRef = doc(db, 'rides', rideId);
    try {
      const arrivedTime = new Date().toISOString();
      await runTransaction(db, async (transaction) => {
        const rideSnap = await transaction.get(rideRef);
        if (!rideSnap.exists()) throw new Error('Ride not found');
        const ride = rideSnap.data() as RideDocument;
        if (ride.driverId !== driverId) throw new Error('Unauthorized driver');
        if (ride.status !== 'driver_arriving') throw new Error(`Invalid status transition from ${ride.status}`);

        transaction.update(rideRef, {
          status: 'driver_arrived',
          driverArrivedAt: arrivedTime,
          updatedAt: arrivedTime,
        });
      });

      const snap = await getDoc(rideRef);
      if (snap.exists()) {
        const r = snap.data() as RideDocument;
        await this.sendNotification({
          userId: r.passengerId,
          title: 'Driver has arrived!',
          message: `${r.driverName || 'Your driver'} is waiting at the pickup location. Share your PIN (${r.otp}) to begin.`,
          type: 'ride',
          read: false,
          createdAt: arrivedTime,
        });
      }
      return true;
    } catch (e) {
      console.error('Failed to mark driver arrived:', e);
      return false;
    }
  },

  // Transition: driver_arrived -> in_progress
  async startRide(rideId: string, driverId: string, enteredOtp?: string): Promise<{ success: boolean; message?: string }> {
    const rideRef = doc(db, 'rides', rideId);
    try {
      const startTime = new Date().toISOString();
      await runTransaction(db, async (transaction) => {
        const rideSnap = await transaction.get(rideRef);
        if (!rideSnap.exists()) throw new Error('Ride not found');
        const ride = rideSnap.data() as RideDocument;
        if (ride.driverId !== driverId) throw new Error('Unauthorized driver');
        if (ride.status !== 'driver_arrived') throw new Error(`Invalid status transition from ${ride.status}`);

        if (enteredOtp && enteredOtp.trim() !== ride.otp) {
          throw new Error('INVALID_PIN');
        }

        transaction.update(rideRef, {
          status: 'in_progress',
          startedAt: startTime,
          updatedAt: startTime,
        });
      });

      const snap = await getDoc(rideRef);
      if (snap.exists()) {
        const r = snap.data() as RideDocument;
        await this.sendNotification({
          userId: r.passengerId,
          title: 'Ride in Progress',
          message: `Your trip with ${r.driverName || 'your driver'} to ${r.destinationAddress} has begun. Have a safe journey!`,
          type: 'ride',
          read: false,
          createdAt: startTime,
        });
      }
      return { success: true };
    } catch (e: any) {
      console.error('Failed to start ride:', e);
      if (e.message === 'INVALID_PIN') {
        return { success: false, message: 'Invalid 4-digit Safety PIN. Please verify with passenger.' };
      }
      return { success: false, message: e.message || 'Failed to start ride' };
    }
  },

  // Transition: in_progress -> completed
  async completeRide(rideId: string, driverId: string, finalFare?: number): Promise<boolean> {
    const rideRef = doc(db, 'rides', rideId);
    const driverRef = doc(db, 'drivers', driverId);

    try {
      const completedTime = new Date().toISOString();
      let passengerId = '';
      let passengerName = '';
      let driverName = '';
      let calculatedFare = 0;
      let ridePaymentMethod: PaymentMethod = 'cash';
      let destinationAddr = '';
      let isDemoRide = false;

      await runTransaction(db, async (transaction) => {
        const rideSnap = await transaction.get(rideRef);
        if (!rideSnap.exists()) throw new Error('Ride not found');
        const ride = rideSnap.data() as RideDocument;
        if (ride.driverId !== driverId) throw new Error('Unauthorized driver');
        if (ride.status !== 'in_progress') throw new Error(`Invalid status transition from ${ride.status}`);

        passengerId = ride.passengerId;
        passengerName = ride.passengerName || 'Passenger';
        driverName = ride.driverName || 'Driver';
        calculatedFare = Number(finalFare) || Number(ride.finalFare) || Number(ride.estimatedFare) || 35.0;
        ridePaymentMethod = ride.paymentMethod || 'cash';
        destinationAddr = ride.destinationAddress || 'Destination';
        isDemoRide = Boolean(ride.isDemo);

        // Cash payments start as 'pending' until driver confirms receipt
        const initialPaymentStatus: PaymentStatus = ridePaymentMethod === 'cash' ? 'pending' : 'paid';

        transaction.update(rideRef, {
          status: 'completed',
          finalFare: calculatedFare,
          completedAt: completedTime,
          paymentStatus: initialPaymentStatus,
          updatedAt: completedTime,
        });

        // Update driver stats & re-enable availability
        const driverSnap = await transaction.get(driverRef);
        if (driverSnap.exists()) {
          const dData = driverSnap.data() as DriverProfile;
          const netEarnings = Math.round(calculatedFare * 0.85 * 100) / 100; // Exact 85% driver take-home rounded
          transaction.update(driverRef, {
            available: dData.online !== false, // available if still online
            totalTrips: (dData.totalTrips || 0) + 1,
            earningsToday: (dData.earningsToday || 0) + netEarnings,
            earningsThisWeek: (dData.earningsThisWeek || 0) + netEarnings,
            totalEarnings: (dData.totalEarnings || 0) + netEarnings,
            updatedAt: completedTime,
          });
        }
      });

      // Update passenger statistics safely
      if (passengerId) {
        try {
          const pRef = doc(db, 'passengers', passengerId);
          const pSnap = await getDoc(pRef);
          if (pSnap.exists()) {
            const pData = pSnap.data() as PassengerProfile;
            await updateDoc(pRef, {
              totalTrips: (pData.totalTrips || 0) + 1,
              updatedAt: completedTime,
            });
          }
        } catch (passengerUpdateErr) {
          console.warn('Note: Passenger profile totalTrips could not be updated by driver:', passengerUpdateErr);
        }

        // Record or update payment document in Firestore (1:1 with ride)
        const initialPaymentStatus: PaymentStatus = ridePaymentMethod === 'cash' ? 'pending' : 'paid';
        const driverEarnings = Math.round(calculatedFare * 0.85 * 100) / 100;
        const platformFee = Math.round(calculatedFare * 0.15 * 100) / 100;
        await this.createOrUpdatePaymentRecord({
          rideId,
          passengerId,
          driverId,
          amount: calculatedFare,
          driverEarnings,
          platformFee,
          currency: 'ZAR',
          paymentMethod: ridePaymentMethod,
          paymentStatus: initialPaymentStatus,
          provider: ridePaymentMethod === 'cash' ? 'cash' : 'zaka-gateway',
          transactionReference: `ZAK-${Date.now().toString(36).toUpperCase()}`,
          isDemo: isDemoRide,
          createdAt: completedTime,
          updatedAt: completedTime,
          paidAt: initialPaymentStatus === 'paid' ? completedTime : null,
        });

        // Send passenger completion notification
        if (ridePaymentMethod === 'cash') {
          await this.sendNotification({
            userId: passengerId,
            title: 'Payment Due • Cash',
            message: `Your trip to ${destinationAddr} is complete. Total fare is R${calculatedFare.toFixed(2)}. Please hand cash directly to your driver.`,
            type: 'payment',
            read: false,
            createdAt: completedTime,
          });
        } else {
          await this.sendNotification({
            userId: passengerId,
            title: 'Trip Completed • Paid',
            message: `You arrived at your destination! Total fare: R${calculatedFare.toFixed(2)}. Please rate your driver.`,
            type: 'payment',
            read: false,
            createdAt: completedTime,
          });
        }

        // Send driver completion notification
        if (ridePaymentMethod === 'cash') {
          await this.sendNotification({
            userId: driverId,
            title: 'Cash Collection Due',
            message: `Please collect R${calculatedFare.toFixed(2)} cash from ${passengerName} and mark payment as completed.`,
            type: 'payment',
            read: false,
            createdAt: completedTime,
          });
        } else {
          await this.sendNotification({
            userId: driverId,
            title: 'Trip Completed',
            message: `Trip with ${passengerName} completed. R${(calculatedFare * 0.85).toFixed(2)} net take-home credited to your wallet.`,
            type: 'ride',
            read: false,
            createdAt: completedTime,
          });
        }
      }

      return true;
    } catch (e) {
      console.error('Failed to complete ride:', e);
      return false;
    }
  },

  // Update driver location in both driver profile and active ride document with GPS throttling
  async updateDriverLocationAndRide(
    driverId: string,
    location: LocationCoordinates,
    activeRideId?: string | null,
    forceUpdate: boolean = false
  ): Promise<boolean> {
    try {
      // 1. Sanity check coordinates
      if (
        !location ||
        typeof location.latitude !== 'number' ||
        typeof location.longitude !== 'number' ||
        isNaN(location.latitude) ||
        isNaN(location.longitude) ||
        location.latitude < -90 ||
        location.latitude > 90 ||
        location.longitude < -180 ||
        location.longitude > 180
      ) {
        return false;
      }

      const now = Date.now();
      const last = driverLastPersistedTelemetry.get(driverId);

      // 2. Teleportation anomaly filter (> 5000m jump in < 10s = impossible speed > 1800 km/h)
      if (last && (now - last.timestamp < 10000)) {
        const dist = mapService.distanceMeters(last.coords, location);
        if (dist > 5000) {
          console.warn('Erroneous GPS teleportation jump rejected:', dist, 'meters');
          return false;
        }
      }

      // 3. Throttling check (15m or 10s rule)
      if (!forceUpdate && last) {
        const check = mapService.shouldPersistLocation(
          last.coords,
          location,
          last.timestamp,
          now
        );
        if (!check.shouldPersist) {
          // Throttled: displacement < 15m and interval < 10s
          return false;
        }
      }

      const iso = new Date().toISOString();

      // 4. Update driver doc
      const driverRef = doc(db, 'drivers', driverId);
      await updateDoc(driverRef, {
        currentLocation: {
          ...location,
          timestamp: now,
        },
        updatedAt: iso,
      });

      // 5. If active ride present, update ride doc
      if (activeRideId) {
        const rideRef = doc(db, 'rides', activeRideId);
        await updateDoc(rideRef, {
          driverCurrentLocation: {
            ...location,
            timestamp: now,
          },
        });
      }

      // 6. Only advance throttle cache once persistence successfully commits
      driverLastPersistedTelemetry.set(driverId, { coords: location, timestamp: now });

      return true;
    } catch (err) {
      console.warn('Silent failure updating driver location stream:', err);
      return false;
    }
  },

  async retryRideSearch(rideId: string): Promise<boolean> {
    const rideRef = doc(db, 'rides', rideId);
    try {
      const nowIso = new Date().toISOString();
      await updateDoc(rideRef, {
        status: 'searching',
        requestedAt: nowIso,
        updatedAt: nowIso,
      });
      return true;
    } catch (err) {
      console.error('Error retrying ride search:', err);
      return false;
    }
  },

  async updateRideStatus(rideId: string, status: RideStatus, extra: Partial<RideDocument> = {}): Promise<void> {
    const rideRef = doc(db, 'rides', rideId);
    const updateData: any = {
      status,
      ...extra,
    };

    if (status === 'accepted') {
      updateData.acceptedAt = new Date().toISOString();
    } else if (status === 'driver_arrived') {
      updateData.driverArrivedAt = new Date().toISOString();
    } else if (status === 'in_progress') {
      updateData.startedAt = new Date().toISOString();
    } else if (status === 'completed') {
      updateData.completedAt = new Date().toISOString();
    } else if (status === 'cancelled') {
      updateData.cancelledAt = new Date().toISOString();
    }

    await updateDoc(rideRef, updateData);

    // If completed or cancelled, make the driver available again & update totals
    const snap = await getDoc(rideRef);
    if (snap.exists()) {
      const ride = snap.data() as RideDocument;
      if (ride.driverId && (status === 'completed' || status === 'cancelled')) {
        const driverRef = doc(db, 'drivers', ride.driverId);
        const driverSnap = await getDoc(driverRef);
        if (driverSnap.exists()) {
          const dData = driverSnap.data() as DriverProfile;
          const newTotalTrips = status === 'completed' ? (dData.totalTrips || 0) + 1 : (dData.totalTrips || 0);
          const fareEarned = status === 'completed' ? (ride.finalFare || ride.estimatedFare) * 0.85 : 0;
          await updateDoc(driverRef, {
            available: true,
            totalTrips: newTotalTrips,
            earningsToday: (dData.earningsToday || 0) + fareEarned,
            earningsThisWeek: (dData.earningsThisWeek || 0) + fareEarned,
            totalEarnings: (dData.totalEarnings || 0) + fareEarned,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }
  },

  async cancelRide(rideId: string, reason = 'Cancelled by user', cancelledBy: 'passenger' | 'driver' | 'admin' = 'passenger'): Promise<{ success: boolean; message?: string }> {
    const rideRef = doc(db, 'rides', rideId);
    try {
      let driverToFree: string | null = null;
      let passengerToNotify: string | null = null;
      let driverToNotify: string | null = null;

      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(rideRef);
        if (!snap.exists()) throw new Error('Ride not found');
        const ride = snap.data() as RideDocument;

        if (ride.status === 'completed' || ride.status === 'cancelled') {
          throw new Error('Ride is already finalized');
        }

        if (cancelledBy === 'passenger' && ride.status === 'in_progress') {
          throw new Error('Cannot cancel a trip while already in progress.');
        }

        driverToFree = ride.driverId || null;
        passengerToNotify = ride.passengerId;
        driverToNotify = ride.driverId || null;

        transaction.update(rideRef, {
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          cancellationReason: reason,
        });

        if (driverToFree) {
          const driverRef = doc(db, 'drivers', driverToFree);
          const dSnap = await transaction.get(driverRef);
          if (dSnap.exists()) {
            transaction.update(driverRef, {
              available: true,
              updatedAt: new Date().toISOString(),
            });
          }
        }
      });

      // Notify relevant parties after successful cancellation
      const nowIso = new Date().toISOString();
      if (cancelledBy === 'driver' && passengerToNotify) {
        this.sendNotification({
          userId: passengerToNotify as string,
          title: 'Driver Cancelled Trip',
          message: `Your driver had to cancel the trip (${reason}). We apologize for the inconvenience. Please request another vehicle.`,
          type: 'ride',
          read: false,
          createdAt: nowIso,
        }).catch((err: any) => console.warn('Could not send passenger cancel notification:', err));
      } else if (cancelledBy === 'passenger' && driverToNotify) {
        this.sendNotification({
          userId: driverToNotify as string,
          title: 'Trip Cancelled by Passenger',
          message: `The passenger cancelled the trip (${reason}). You are now available for new dispatch requests.`,
          type: 'ride',
          read: false,
          createdAt: nowIso,
        }).catch((err: any) => console.warn('Could not send driver cancel notification:', err));
      }

      return { success: true };
    } catch (e: any) {
      console.warn('Cancel ride failed:', e.message);
      return { success: false, message: e.message || 'Cancellation failed' };
    }
  },

  // ================= PAYMENTS & RATINGS =================

  /**
   * Ensures exactly 1 Payment record per Ride to prevent duplicates (keyed by rideId)
   */
  async createOrUpdatePaymentRecord(paymentData: Omit<PaymentRecord, 'id'>): Promise<string> {
    try {
      const payRef = doc(db, 'payments', paymentData.rideId);
      const isDemo = paymentData.isDemo ?? (auth.currentUser?.isAnonymous || false);
      const nowIso = new Date().toISOString();
      await setDoc(payRef, {
        ...paymentData,
        id: paymentData.rideId,
        isDemo: Boolean(isDemo),
        paymentId: paymentData.paymentId || `PAY-${Date.now().toString(36).toUpperCase()}`,
        updatedAt: nowIso,
      }, { merge: true });
      return paymentData.rideId;
    } catch (err) {
      console.error('Error creating or updating payment record:', err);
      throw err;
    }
  },

  /**
   * Driver marks a cash payment as collected and paid
   */
  async markCashPaymentPaid(rideId: string, driverId: string): Promise<boolean> {
    try {
      const nowIso = new Date().toISOString();
      const rideRef = doc(db, 'rides', rideId);
      const rideSnap = await getDoc(rideRef);
      if (!rideSnap.exists()) return false;

      const ride = rideSnap.data() as RideDocument;
      if (ride.paymentStatus === 'paid') {
        return true; // Already paid idempotently
      }
      if (ride.driverId !== driverId) {
        throw new Error('Unauthorized: only the assigned driver can confirm cash payment');
      }

      // 1. Update ride doc paymentStatus to 'paid'
      await updateDoc(rideRef, {
        paymentStatus: 'paid',
        updatedAt: nowIso,
      });

      // 2. Update payment document directly
      const payRef = doc(db, 'payments', rideId);
      await setDoc(payRef, {
        rideId,
        passengerId: ride.passengerId,
        driverId,
        amount: ride.finalFare || ride.estimatedFare,
        currency: 'ZAR',
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        provider: 'cash',
        transactionReference: `CASH-${Date.now().toString(36).toUpperCase()}`,
        paidAt: nowIso,
        updatedAt: nowIso,
      }, { merge: true });

      // 3. Send confirmation notification to passenger
      await this.sendNotification({
        userId: ride.passengerId,
        title: 'Payment Confirmed ✓',
        message: `Driver confirmed receipt of R${(ride.finalFare || ride.estimatedFare).toFixed(2)} cash. Thank you for riding with ZAKA!`,
        type: 'payment',
        read: false,
        createdAt: nowIso,
      });

      return true;
    } catch (e) {
      console.error('Error marking cash payment as paid:', e);
      return false;
    }
  },

  /**
   * Listen to payment changes for a specific ride
   */
  listenToPaymentForRide(rideId: string, callback: (payment: PaymentRecord | null) => void) {
    const payRef = doc(db, 'payments', rideId);
    return onSnapshot(payRef, (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }
      callback({ id: snapshot.id, ...snapshot.data() } as PaymentRecord);
    }, (err) => {
      console.warn('Error listening to ride payment:', err);
    });
  },

  /**
   * Listen to all payments for a specific driver
   */
  listenToDriverPayments(driverId: string, callback: (payments: PaymentRecord[]) => void) {
    const q = query(collection(db, 'payments'), where('driverId', '==', driverId));
    return onSnapshot(q, (snapshot) => {
      const payments = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as PaymentRecord[];
      payments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(payments);
    }, (err) => {
      console.warn('Error listening to driver payments:', err);
    });
  },

  /**
   * Check if a user has already submitted a rating for this ride
   */
  async getRatingForRideAndUser(rideId: string, fromUserId: string): Promise<RatingRecord | null> {
    try {
      const q = query(
        collection(db, 'ratings'),
        where('rideId', '==', rideId),
        where('fromUserId', '==', fromUserId)
      );
      const snap = await getDocs(q);
      if (snap.empty) return null;
      return { id: snap.docs[0].id, ...snap.docs[0].data() } as RatingRecord;
    } catch (err) {
      console.warn('Error checking existing rating:', err);
      return null;
    }
  },

  /**
   * Submit Rating and update recipient aggregate rating securely
   */
  async submitRating(rating: RatingRecord): Promise<void> {
    try {
      // 1. Check for duplicate rating by this user on this ride
      const existing = await this.getRatingForRideAndUser(rating.rideId, rating.fromUserId);
      if (existing) {
        console.log('Rating already submitted for this trip');
        return;
      }

      // 2. Add rating document
      const ratingsCol = collection(db, 'ratings');
      const docRef = await addDoc(ratingsCol, {
        ...rating,
        createdAt: new Date().toISOString(),
      });

      // 3. Update recipient's aggregate ratings in drivers or passengers collection
      if (rating.toRole === 'driver' || rating.toUserId === rating.driverId) {
        const targetDriverId = rating.toUserId || rating.driverId;
        if (targetDriverId) {
          const dRef = doc(db, 'drivers', targetDriverId);
          const dSnap = await getDoc(dRef);
          if (dSnap.exists()) {
            const dData = dSnap.data() as DriverProfile;
            const currentSum = (dData.ratingSum !== undefined ? dData.ratingSum : (dData.rating || 5.0) * (dData.totalRatings || 1)) + rating.rating;
            const totalRatings = (dData.totalRatings || 0) + 1;
            const newAverage = Number((currentSum / totalRatings).toFixed(1));

            await updateDoc(dRef, {
              rating: newAverage,
              totalRatings,
              ratingSum: currentSum,
              updatedAt: new Date().toISOString(),
            });
          }
        }
      } else if (rating.toRole === 'passenger' || rating.toUserId === rating.passengerId) {
        const targetPassengerId = rating.toUserId || rating.passengerId;
        if (targetPassengerId) {
          const pRef = doc(db, 'passengers', targetPassengerId);
          const pSnap = await getDoc(pRef);
          if (pSnap.exists()) {
            const pData = pSnap.data() as PassengerProfile;
            const currentSum = (pData.ratingSum !== undefined ? pData.ratingSum : (pData.rating || 5.0) * (pData.totalRatings || 1)) + rating.rating;
            const totalRatings = (pData.totalRatings || 0) + 1;
            const newAverage = Number((currentSum / totalRatings).toFixed(1));

            await updateDoc(pRef, {
              rating: newAverage,
              totalRatings,
              ratingSum: currentSum,
              updatedAt: new Date().toISOString(),
            });
          }
        }
      }
    } catch (err) {
      console.error('Error submitting rating:', err);
      throw err;
    }
  },

  async getAllRatings(isDemo?: boolean): Promise<RatingRecord[]> {
    const isAnon = isDemo ?? (auth.currentUser?.isAnonymous || false);
    const q = isAnon
      ? query(collection(db, 'ratings'), where('isDemo', '==', true))
      : collection(db, 'ratings');
    const snap = await getDocs(q);
    const ratings = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as RatingRecord[];
    ratings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return ratings;
  },

  // ================= NOTIFICATIONS =================

  listenToUserNotifications(userId: string, callback: (notifications: NotificationRecord[]) => void) {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId)
    );
    return onSnapshot(q, (snapshot) => {
      const notes = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as NotificationRecord[];
      notes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(notes);
    }, (err) => {
      console.warn('Error listening to notifications:', err);
    });
  },

  async sendNotification(note: Omit<NotificationRecord, 'id'>): Promise<void> {
    try {
      const notesCol = collection(db, 'notifications');
      await addDoc(notesCol, note);
    } catch (err) {
      console.warn('Error sending notification:', err);
    }
  },

  async markNotificationRead(notificationId: string): Promise<void> {
    const nRef = doc(db, 'notifications', notificationId);
    await updateDoc(nRef, { read: true });
  },

  async markAllNotificationsRead(userId: string): Promise<void> {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        where('read', '==', false)
      );
      const snap = await getDocs(q);
      const batchPromises = snap.docs.map((d) => updateDoc(d.ref, { read: true }));
      await Promise.all(batchPromises);
    } catch (err) {
      console.warn('Error marking all notifications read:', err);
    }
  },

  async deleteNotification(notificationId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'notifications', notificationId));
    } catch (err) {
      console.warn('Error deleting notification:', err);
    }
  },

  // ================= ADMIN PLATFORM DATA =================

  async getAllUsers(isDemo?: boolean): Promise<UserProfile[]> {
    const isAnon = isDemo ?? (auth.currentUser?.isAnonymous || false);
    const q = isAnon
      ? query(collection(db, 'users'), where('isDemo', '==', true), limit(100))
      : query(collection(db, 'users'), limit(100));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => d.data() as UserProfile);
    return isAnon ? list.filter((u) => u.isDemo) : list.filter((u) => !u.isDemo);
  },

  async getAllDrivers(isDemo?: boolean): Promise<DriverProfile[]> {
    const isAnon = isDemo ?? (auth.currentUser?.isAnonymous || false);
    const q = isAnon
      ? query(collection(db, 'drivers'), where('isDemo', '==', true), limit(100))
      : query(collection(db, 'drivers'), limit(100));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => d.data() as DriverProfile);
    return isAnon ? list.filter((d) => d.isDemo) : list.filter((d) => !d.isDemo);
  },

  async getAllRides(isDemo?: boolean): Promise<RideDocument[]> {
    const isAnon = isDemo ?? (auth.currentUser?.isAnonymous || false);
    const q = isAnon
      ? query(collection(db, 'rides'), where('isDemo', '==', true), limit(100))
      : query(collection(db, 'rides'), limit(100));
    const snap = await getDocs(q);
    let rides = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as RideDocument[];
    rides = isAnon ? rides.filter((r) => r.isDemo) : rides.filter((r) => !r.isDemo);
    rides.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return rides;
  },

  async getAllPayments(isDemo?: boolean): Promise<PaymentRecord[]> {
    const isAnon = isDemo ?? (auth.currentUser?.isAnonymous || false);
    const q = isAnon
      ? query(collection(db, 'payments'), where('isDemo', '==', true), limit(100))
      : query(collection(db, 'payments'), limit(100));
    const snap = await getDocs(q);
    let payments = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PaymentRecord[];
    payments = isAnon ? payments.filter((p) => p.isDemo) : payments.filter((p) => !p.isDemo);
    payments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return payments;
  },

  async updateDriverVerificationStatus(
    driverId: string,
    status: 'approved' | 'pending' | 'rejected',
    rejectionReason?: string,
    adminInfo?: { adminId: string; adminEmail: string }
  ): Promise<void> {
    const dRef = doc(db, 'drivers', driverId);
    const updatePayload: any = {
      verificationStatus: status,
      status: status === 'approved' ? 'active' : status,
      updatedAt: new Date().toISOString(),
    };
    if (rejectionReason !== undefined) {
      updatePayload.rejectionReason = rejectionReason;
    }
    if (status === 'rejected') {
      updatePayload.online = false;
      updatePayload.available = false;
    }
    await updateDoc(dRef, updatePayload);

    // Sync account status on corresponding user doc
    try {
      const uRef = doc(db, 'users', driverId);
      await updateDoc(uRef, {
        accountStatus: status === 'approved' ? 'active' : 'pending',
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // ignore if user doc not present or permissions restricted
    }

    // Send driver notification
    const nowIso = new Date().toISOString();
    if (status === 'approved') {
      await this.sendNotification({
        userId: driverId,
        title: 'Driver Profile Approved!',
        message: 'Congratulations! Your ZAKA driver compliance review is complete and approved. You can now go online to accept passenger rides.',
        type: 'system',
        read: false,
        createdAt: nowIso,
      });
    } else if (status === 'rejected') {
      await this.sendNotification({
        userId: driverId,
        title: 'Driver Verification Requires Attention',
        message: rejectionReason
          ? `Your application was not approved: "${rejectionReason}". Please review and re-submit your documents.`
          : 'Your driver application requires attention. Please check your verification documents and re-upload.',
        type: 'system',
        read: false,
        createdAt: nowIso,
      });
    }

    // Record audit log if admin info is provided
    if (adminInfo) {
      await this.recordAuditLog({
        adminId: adminInfo.adminId,
        adminEmail: adminInfo.adminEmail,
        action: status === 'approved' ? 'approve_driver' : 'reject_driver',
        targetId: driverId,
        targetType: 'driver',
        details: status === 'approved'
          ? 'Driver verification status approved'
          : `Driver verification rejected. Reason: ${rejectionReason || 'No reason provided'}`,
        timestamp: nowIso,
      });
    }
  },

  /**
   * Driver: Save or replace an uploaded verification document metadata record
   */
  async saveDriverDocument(
    driverId: string,
    docRecord: DriverDocumentRecord
  ): Promise<void> {
    const driverRef = doc(db, 'drivers', driverId);
    const keyMap: Record<DriverDocumentType, string> = {
      'drivers-license': 'driversLicense',
      'prdp': 'prdp',
      'vehicle-registration': 'vehicleRegistration',
      'vehicle-inspection': 'vehicleInspection',
      'profile-photo': 'profilePhoto',
      'operating-license': 'operatingLicense',
    };
    const fieldKey = keyMap[docRecord.documentType] || docRecord.documentType;
    const nowIso = new Date().toISOString();

    // Build clean record payload without undefined values.
    // For newly uploaded / re-uploaded documents: status is 'pending' and rejectionReason is completely omitted.
    // NEVER pass rejectionReason: undefined or any undefined optional fields to Firestore.
    const recordPayload: Record<string, any> = {
      id: docRecord.id || `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      documentType: docRecord.documentType,
      title: docRecord.title || docRecord.documentType,
      fileUrl: docRecord.fileUrl,
      storagePath: docRecord.storagePath,
      fileName: docRecord.fileName,
      fileSizeBytes: docRecord.fileSizeBytes || 0,
      fileType: docRecord.fileType || 'application/octet-stream',
      status: 'pending',
      uploadedAt: nowIso,
    };

    // Optional fields: ONLY add if explicitly defined with non-empty values
    if (docRecord.expiryDate && typeof docRecord.expiryDate === 'string' && docRecord.expiryDate.trim()) {
      recordPayload.expiryDate = docRecord.expiryDate.trim();
    }
    if (docRecord.reviewedAt && typeof docRecord.reviewedAt === 'string' && docRecord.reviewedAt.trim()) {
      recordPayload.reviewedAt = docRecord.reviewedAt.trim();
    }

    const sanitizedRecord = removeUndefinedFields(recordPayload) as DriverDocumentRecord;

    // 1. Update on driver document for reactive UI bindings
    // updateDoc replaces the specific map at verificationDocuments.${fieldKey} cleanly
    try {
      await updateDoc(driverRef, {
        [`verificationDocuments.${fieldKey}`]: sanitizedRecord,
        updatedAt: nowIso,
      });
    } catch {
      await setDoc(
        driverRef,
        {
          verificationDocuments: {
            [fieldKey]: sanitizedRecord,
          },
          updatedAt: nowIso,
        },
        { merge: true }
      );
    }

    // 2. Persist in secure subcollection (/drivers/{driverId}/documents/{docType})
    try {
      const subDocRef = doc(db, 'drivers', driverId, 'documents', docRecord.documentType);
      await setDoc(
        subDocRef,
        removeUndefinedFields({
          ...sanitizedRecord,
          driverId,
          updatedAt: nowIso,
        }),
        { merge: true }
      );
    } catch (e) {
      console.warn('Subcollection document write note:', e);
    }

    // 3. Persist in deterministic compliance record (/driverCompliance/{driverId}/documents/{documentId})
    try {
      const complianceDocRef = doc(db, 'driverCompliance', driverId, 'documents', docRecord.documentType);
      const compliancePayload: Record<string, any> = {
        id: sanitizedRecord.id,
        driverId,
        documentType: sanitizedRecord.documentType,
        originalFileName: sanitizedRecord.fileName,
        contentType: sanitizedRecord.fileType,
        sizeBytes: sanitizedRecord.fileSizeBytes,
        storagePath: sanitizedRecord.storagePath,
        fileUrl: sanitizedRecord.fileUrl,
        uploadedAt: sanitizedRecord.uploadedAt,
        uploadedBy: auth.currentUser?.uid || driverId,
        status: 'pending',
        verificationStatus: 'pending',
        updatedAt: nowIso,
      };
      if (sanitizedRecord.expiryDate) {
        compliancePayload.expiryDate = sanitizedRecord.expiryDate;
      }
      await setDoc(complianceDocRef, removeUndefinedFields(compliancePayload), { merge: true });
    } catch (e) {
      console.warn('driverCompliance write note:', e);
    }
  },

  /**
   * Admin: Review and update verification status of a specific driver document
   */
  async updateDriverDocumentReview(
    driverId: string,
    documentType: DriverDocumentType,
    status: DocumentStatus,
    rejectionReason?: string,
    adminInfo?: { adminId: string; adminEmail: string }
  ): Promise<void> {
    const driverRef = doc(db, 'drivers', driverId);
    const keyMap: Record<DriverDocumentType, string> = {
      'drivers-license': 'driversLicense',
      'prdp': 'prdp',
      'vehicle-registration': 'vehicleRegistration',
      'vehicle-inspection': 'vehicleInspection',
      'profile-photo': 'profilePhoto',
      'operating-license': 'operatingLicense',
    };
    const fieldKey = keyMap[documentType] || documentType;
    const nowIso = new Date().toISOString();

    const updatePayload: Record<string, any> = {
      [`verificationDocuments.${fieldKey}.status`]: status,
      [`verificationDocuments.${fieldKey}.reviewedAt`]: nowIso,
      updatedAt: nowIso,
    };
    if (rejectionReason !== undefined && rejectionReason !== null && rejectionReason.trim()) {
      updatePayload[`verificationDocuments.${fieldKey}.rejectionReason`] = rejectionReason.trim();
    }

    await updateDoc(driverRef, removeUndefinedFields(updatePayload));

    // Update subcollection doc
    try {
      const subDocRef = doc(db, 'drivers', driverId, 'documents', documentType);
      const subDocPayload: Record<string, any> = {
        status,
        reviewedAt: nowIso,
        updatedAt: nowIso,
      };
      if (rejectionReason && rejectionReason.trim()) {
        subDocPayload.rejectionReason = rejectionReason.trim();
      } else {
        subDocPayload.rejectionReason = null;
      }
      await updateDoc(subDocRef, removeUndefinedFields(subDocPayload));
    } catch (e) {
      console.warn('Subcollection document review update note:', e);
    }

    // Send driver notification and log audit
    if (adminInfo) {
      await this.recordAuditLog({
        adminId: adminInfo.adminId,
        adminEmail: adminInfo.adminEmail,
        action: status === 'approved' ? 'approve_document' : 'reject_document',
        targetId: `${driverId}/${documentType}`,
        targetType: 'document',
        details: `Document ${documentType} marked ${status}${rejectionReason ? `: ${rejectionReason}` : ''}`,
        timestamp: nowIso,
      });

      if (status === 'rejected') {
        await this.sendNotification({
          userId: driverId,
          title: `Document Update: ${documentType}`,
          message: rejectionReason
            ? `Your uploaded ${documentType} was rejected: "${rejectionReason}". Please re-upload.`
            : `Your uploaded ${documentType} was rejected. Please upload a clear valid document.`,
          type: 'system',
          read: false,
          createdAt: nowIso,
        });
      }
    }
  },

  // ================= ADMIN AUDIT LOGS =================
  async recordAuditLog(log: Omit<AdminAuditRecord, 'id'>): Promise<void> {
    try {
      await addDoc(collection(db, 'audit_logs'), log);
    } catch (err) {
      console.warn('Failed to record audit log:', err);
    }
  },

  /**
   * Emergency SOS for Driver - Sends silent notification to admin dashboard and logs GPS coordinates
   */
  async sendDriverEmergencySOS(params: {
    rideId: string;
    driverId: string;
    driverName?: string;
    coords: { latitude: number; longitude: number };
    note?: string;
  }): Promise<{ success: boolean; message: string }> {
    try {
      const { rideId, driverId, driverName = 'Driver', coords, note } = params;
      const timestamp = new Date().toISOString();

      // 1. Silent notification to admin users
      await this.sendNotification({
        userId: 'admin',
        title: '🚨 DRIVER EMERGENCY SOS',
        message: `SILENT SOS ALERT: Driver ${driverName} triggered emergency distress during trip #${rideId.slice(0, 8)}. Live GPS: [${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}].`,
        type: 'system',
        read: false,
        createdAt: timestamp,
      });

      // 2. Also broadcast to any active admin accounts
      try {
        const adminQuery = query(collection(db, 'users'), where('role', '==', 'admin'));
        const adminSnap = await getDocs(adminQuery);
        adminSnap.forEach((doc) => {
          if (doc.id !== 'admin') {
            this.sendNotification({
              userId: doc.id,
              title: '🚨 DRIVER EMERGENCY SOS',
              message: `SILENT SOS: Driver ${driverName} triggered emergency alert at [${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}].`,
              type: 'system',
              read: false,
              createdAt: timestamp,
            });
          }
        });
      } catch (err) {
        // Continue even if query fails
      }

      // 3. Log into audit_logs collection with GPS coordinates
      await this.recordAuditLog({
        adminId: driverId,
        adminEmail: `driver:${driverName}`,
        action: 'DRIVER_EMERGENCY_SOS',
        targetId: rideId,
        targetType: 'emergency',
        details: `Driver triggered silent Emergency SOS during active trip #${rideId}. Current GPS coordinates: Latitude ${coords.latitude}, Longitude ${coords.longitude}. ${note ? `Note: ${note}` : ''}`,
        timestamp,
      });

      // 4. Update ride document with emergency status
      try {
        const rideRef = doc(db, 'rides', rideId);
        await updateDoc(rideRef, {
          'emergencyAlert.active': true,
          'emergencyAlert.triggeredBy': 'driver',
          'emergencyAlert.triggeredAt': timestamp,
          'emergencyAlert.coordinates': coords,
          updatedAt: timestamp,
        });
      } catch (rideErr) {
        console.warn('Could not update ride document with emergency flag:', rideErr);
      }

      return {
        success: true,
        message: `Silent emergency SOS sent to Admin & Security dispatch. Coordinates [${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}] logged.`,
      };
    } catch (error: any) {
      console.error('Failed to trigger driver emergency SOS:', error);
      return {
        success: false,
        message: error?.message || 'Failed to dispatch SOS alert.',
      };
    }
  },

  async getAuditLogs(limitCount = 50): Promise<AdminAuditRecord[]> {
    try {
      const q = query(collection(db, 'audit_logs'), limit(limitCount));
      const snap = await getDocs(q);
      const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as AdminAuditRecord[];
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return logs;
    } catch (err) {
      console.warn('Failed to fetch audit logs:', err);
      return [];
    }
  },

  /**
   * Get all verification documents for a driver
   */
  async getDriverDocuments(driverId: string): Promise<DriverDocumentRecord[]> {
    try {
      const subColRef = collection(db, 'drivers', driverId, 'documents');
      const snap = await getDocs(subColRef);
      if (!snap.empty) {
        return snap.docs.map((d) => d.data() as DriverDocumentRecord);
      }
    } catch (e) {
      console.warn('Could not read document subcollection, falling back to driver doc:', e);
    }
    const dRef = doc(db, 'drivers', driverId);
    const snap = await getDoc(dRef);
    if (snap.exists()) {
      const data = snap.data() as DriverProfile;
      if (data.verificationDocuments) {
        return Object.values(data.verificationDocuments).filter((v): v is DriverDocumentRecord => Boolean(v));
      }
    }
    return [];
  },

  async updateUserStatus(userId: string, status: 'active' | 'pending' | 'suspended'): Promise<void> {
    const uRef = doc(db, 'users', userId);
    await updateDoc(uRef, {
      status,
      updatedAt: new Date().toISOString(),
    });
  },

  // ================= DYNAMIC PRICING CONFIGURATION =================

  async getPricingConfigs(): Promise<Record<VehicleType, PricingConfig>> {
    try {
      const snap = await getDocs(collection(db, 'pricing'));
      if (snap.empty) {
        // Automatically seed initial defaults
        await this.seedInitialPricingIfEmpty();
        return { ...ZAKA_DEFAULT_LAUNCH_PRICING };
      }

      const map: Partial<Record<VehicleType, PricingConfig>> = { ...ZAKA_DEFAULT_LAUNCH_PRICING };
      snap.docs.forEach((d) => {
        const data = d.data() as PricingConfig;
        if (data.rideType) {
          map[data.rideType] = {
            ...ZAKA_DEFAULT_LAUNCH_PRICING[data.rideType],
            ...data,
          };
        }
      });

      return map as Record<VehicleType, PricingConfig>;
    } catch (err) {
      console.warn('Error getting pricing configs, using default launch rates:', err);
      return { ...ZAKA_DEFAULT_LAUNCH_PRICING };
    }
  },

  listenToPricingConfigs(callback: (pricingMap: Record<VehicleType, PricingConfig>) => void) {
    const pCol = collection(db, 'pricing');
    return onSnapshot(pCol, (snapshot) => {
      if (snapshot.empty) {
        callback({ ...ZAKA_DEFAULT_LAUNCH_PRICING });
        return;
      }

      const map: Partial<Record<VehicleType, PricingConfig>> = { ...ZAKA_DEFAULT_LAUNCH_PRICING };
      snapshot.docs.forEach((d) => {
        const data = d.data() as PricingConfig;
        if (data.rideType) {
          map[data.rideType] = {
            ...ZAKA_DEFAULT_LAUNCH_PRICING[data.rideType],
            ...data,
          };
        }
      });

      callback(map as Record<VehicleType, PricingConfig>);
    }, (err) => {
      console.warn('Notice: using default launch pricing configs:', err);
      callback({ ...ZAKA_DEFAULT_LAUNCH_PRICING });
    });
  },

  async updatePricingConfig(rideType: VehicleType, updates: Partial<PricingConfig>): Promise<void> {
    const pRef = doc(db, 'pricing', rideType);
    const existing = (await getDoc(pRef)).data() as PricingConfig | undefined;
    const base = existing || ZAKA_DEFAULT_LAUNCH_PRICING[rideType];

    const mergedData: PricingConfig = {
      ...base,
      ...updates,
      rideType,
      updatedAt: new Date().toISOString(),
    };

    await setDoc(pRef, mergedData, { merge: true });
  },

  async seedInitialPricingIfEmpty(): Promise<void> {
    try {
      if (!auth.currentUser) return;
      const pSnap = await getDocs(collection(db, 'pricing'));
      if (!pSnap.empty) return;

      const types: VehicleType[] = ['economy', 'comfort', 'xl', 'moto'];
      for (const t of types) {
        const conf = ZAKA_DEFAULT_LAUNCH_PRICING[t];
        const pRef = doc(db, 'pricing', t);
        await setDoc(pRef, conf);
      }
      console.log('Initial ZAKA pricing architecture seeded to Firestore.');
    } catch (e) {
      // Handled silently
    }
  },

  // ================= SEED INITIAL DEMO PERSONAS =================
  async seedDemoDataIfEmpty(): Promise<void> {
    try {
      if (!auth.currentUser) return;
      await this.seedInitialPricingIfEmpty();

      const usersSnap = await getDocs(collection(db, 'users'));
      if (!usersSnap.empty) {
        return; // Already populated
      }

      console.log('🌱 Seeding initial ZAKA Firestore documents...');

      // 1. Passenger: Amara Dlamini
      const passengerId = 'passenger-amara-01';
      await this.createUserProfile({
        uid: passengerId,
        name: 'Amara Dlamini',
        phone: '+27 82 455 9012',
        email: 'amara.dlamini@zaka.io',
        role: 'passenger',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await this.createOrUpdatePassenger({
        userId: passengerId,
        name: 'Amara Dlamini',
        phone: '+27 82 455 9012',
        rating: 4.9,
        totalTrips: 34,
        walletBalance: 85.50,
        savedPlaces: [
          {
            id: 'sp-1',
            label: 'Home',
            address: '42 Oxford Road, Rosebank, Johannesburg',
            location: { latitude: -26.1458, longitude: 28.0416 },
            icon: 'home',
          },
          {
            id: 'sp-2',
            label: 'Work HQ',
            address: 'Sandton City Office Tower, 5th St, Sandton',
            location: { latitude: -26.1076, longitude: 28.0567 },
            icon: 'work',
          },
          {
            id: 'sp-3',
            label: 'Airport Terminal',
            address: 'O.R. Tambo International Airport, Kempton Park',
            location: { latitude: -26.1367, longitude: 28.2411 },
            icon: 'airport',
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // 2. Driver (Online & Verified): Sipho Ndlovu
      const driverSiphoId = 'driver-sipho-01';
      await this.createUserProfile({
        uid: driverSiphoId,
        name: 'Sipho Ndlovu',
        phone: '+27 71 890 2345',
        email: 'sipho.ndlovu@zaka.io',
        role: 'driver',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await this.createOrUpdateDriver({
        userId: driverSiphoId,
        name: 'Sipho Ndlovu',
        phone: '+27 71 890 2345',
        photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        rating: 4.95,
        totalTrips: 184,
        online: true,
        available: true,
        verificationStatus: 'approved',
        currentLocation: {
          latitude: -26.1420,
          longitude: 28.0460,
          timestamp: Date.now(),
        },
        vehicle: {
          driverId: driverSiphoId,
          vehicleType: 'comfort',
          make: 'Toyota',
          model: 'Corolla Quest',
          colour: 'Silver Metallic',
          registrationNumber: 'ZK 89 NH GP',
          passengerCapacity: 4,
          status: 'active',
        },
        earningsToday: 64.50,
        earningsThisWeek: 420.00,
        totalEarnings: 3840.00,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // 3. Driver (Economy / Moto): Kofi Mensah
      const driverKofiId = 'driver-kofi-02';
      await this.createUserProfile({
        uid: driverKofiId,
        name: 'Kofi Mensah',
        phone: '+27 83 112 4490',
        email: 'kofi.mensah@zaka.io',
        role: 'driver',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await this.createOrUpdateDriver({
        userId: driverKofiId,
        name: 'Kofi Mensah',
        phone: '+27 83 112 4490',
        rating: 4.88,
        totalTrips: 92,
        online: true,
        available: true,
        verificationStatus: 'approved',
        currentLocation: {
          latitude: -26.1150,
          longitude: 28.0510,
          timestamp: Date.now(),
        },
        vehicle: {
          driverId: driverKofiId,
          vehicleType: 'economy',
          make: 'Suzuki',
          model: 'Swift GL',
          colour: 'Pearl White',
          registrationNumber: 'ZK 42 TR GP',
          passengerCapacity: 4,
          status: 'active',
        },
        earningsToday: 38.00,
        earningsThisWeek: 260.00,
        totalEarnings: 1950.00,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // 4. Admin: Chidi Okafor (Fleet Operations)
      const adminId = 'admin-chidi-01';
      await this.createUserProfile({
        uid: adminId,
        name: 'Chidi Okafor',
        phone: '+27 11 400 9000',
        email: 'admin.chidi@zaka.io',
        role: 'admin',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      console.log('✅ ZAKA Firestore demo personas seeded successfully.');
    } catch (e) {
      console.warn('Notice seeding demo data:', e);
    }
  },
};
