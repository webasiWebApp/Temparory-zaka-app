/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Instant Demo Personas & Offline-Safe State
 */

import { UserProfile, PassengerProfile, DriverProfile } from '../types';

export interface DemoPersonaData {
  userProfile: UserProfile;
  passengerProfile?: PassengerProfile;
  driverProfile?: DriverProfile;
}

export const DEMO_PERSONAS: Record<'amara' | 'sipho' | 'kofi' | 'chidi', DemoPersonaData> = {
  amara: {
    userProfile: {
      uid: 'passenger-amara-01',
      name: 'Amara Dlamini',
      phone: '+27 82 455 9012',
      email: 'amara.dlamini@zaka.io',
      role: 'passenger',
      status: 'active',
      accountStatus: 'active',
      createdAt: '2026-01-15T08:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
    },
    passengerProfile: {
      userId: 'passenger-amara-01',
      name: 'Amara Dlamini',
      phone: '+27 82 455 9012',
      rating: 4.9,
      totalTrips: 34,
      walletBalance: 85.5,
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
      createdAt: '2026-01-15T08:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
    },
  },
  sipho: {
    userProfile: {
      uid: 'driver-sipho-01',
      name: 'Sipho Ndlovu',
      phone: '+27 71 890 2345',
      email: 'sipho.ndlovu@zaka.io',
      role: 'driver',
      status: 'active',
      accountStatus: 'active',
      createdAt: '2026-01-10T09:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
    },
    driverProfile: {
      userId: 'driver-sipho-01',
      name: 'Sipho Ndlovu',
      phone: '+27 71 890 2345',
      photoURL:
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      rating: 4.95,
      totalTrips: 184,
      online: true,
      available: true,
      verificationStatus: 'approved',
      currentLocation: {
        latitude: -26.142,
        longitude: 28.046,
        timestamp: Date.now(),
      },
      vehicle: {
        driverId: 'driver-sipho-01',
        vehicleType: 'comfort',
        make: 'Toyota',
        model: 'Corolla Quest',
        colour: 'Silver Metallic',
        registrationNumber: 'ZK 89 NH GP',
        passengerCapacity: 4,
        status: 'active',
      },
      earningsToday: 64.5,
      earningsThisWeek: 420.0,
      totalEarnings: 3840.0,
      createdAt: '2026-01-10T09:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
    },
  },
  kofi: {
    userProfile: {
      uid: 'driver-kofi-02',
      name: 'Kofi Mensah',
      phone: '+27 83 112 4490',
      email: 'kofi.mensah@zaka.io',
      role: 'driver',
      status: 'active',
      accountStatus: 'active',
      createdAt: '2026-01-20T11:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
    },
    driverProfile: {
      userId: 'driver-kofi-02',
      name: 'Kofi Mensah',
      phone: '+27 83 112 4490',
      rating: 4.88,
      totalTrips: 92,
      online: true,
      available: true,
      verificationStatus: 'approved',
      currentLocation: {
        latitude: -26.115,
        longitude: 28.051,
        timestamp: Date.now(),
      },
      vehicle: {
        driverId: 'driver-kofi-02',
        vehicleType: 'economy',
        make: 'Suzuki',
        model: 'Swift GL',
        colour: 'Pearl White',
        registrationNumber: 'ZK 42 TR GP',
        passengerCapacity: 4,
        status: 'active',
      },
      earningsToday: 38.0,
      earningsThisWeek: 260.0,
      totalEarnings: 1950.0,
      createdAt: '2026-01-20T11:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
    },
  },
  chidi: {
    userProfile: {
      uid: 'admin-chidi-01',
      name: 'Chidi Okafor',
      phone: '+27 11 400 9000',
      email: 'admin.chidi@zaka.io',
      role: 'admin',
      status: 'active',
      accountStatus: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
    },
  },
};
