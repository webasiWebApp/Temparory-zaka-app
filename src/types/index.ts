/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Core Types & Interfaces
 */

export type UserRole = 'passenger' | 'driver' | 'admin';
export type UserStatus = 'active' | 'pending' | 'suspended';

export type VehicleType = 'economy' | 'comfort' | 'xl' | 'moto';

export type PaymentMethod = 'cash' | 'card' | 'digital' | 'wallet';
export type PaymentStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled';

export interface PricingConfig {
  rideType: VehicleType;
  name: string;
  tagline: string;
  baseFare: number;
  perKmRate: number;
  perMinuteRate: number;
  minimumFare: number;
  passengerCapacity: number;
  estimatedEtaMins: number;
  active: boolean;
  currency: string;
  updatedAt: string;
}

export interface FareBreakdown {
  rideType: VehicleType;
  baseFare: number;
  distanceKm: number;
  distanceFare: number;
  perKmRate: number;
  durationMinutes: number;
  timeFare: number;
  perMinuteRate: number;
  subtotal: number;
  minimumFare: number;
  isMinimumFareApplied: boolean;
  totalFare: number;
  currency: string;
}

export interface RideRequestData {
  passengerId: string;
  passengerName: string;
  passengerPhone: string;
  passengerRating?: number;
  pickupLocation: LocationCoordinates;
  destinationLocation: LocationCoordinates;
  pickupAddress: string;
  destinationAddress: string;
  rideType: VehicleType;
  distanceKm: number;
  estimatedDurationMinutes: number;
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  estimatedFare: number;
  minimumFare: number;
  currency: string;
  paymentMethod: PaymentMethod;
  status: RideStatus;
  otp: string;
  requestedAt: string;
}

export type RideStatus =
  | 'searching'
  | 'accepted'
  | 'driver_arriving'
  | 'driver_arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
}

export interface PassengerLocation {
  latitude: number;
  longitude: number;
  address: string;
  timestamp: number;
}

export interface LocationPoint extends LocationCoordinates {
  address: string;
  name: string;
  timestamp?: number;
}

export interface RecentDestination {
  id: string;
  name?: string;
  address: string;
  latitude: number;
  longitude: number;
  createdAt: string;
  lastUsedAt: string;
}

export interface UserProfile {
  uid: string;
  name: string;
  phone: string;
  email: string;
  photoURL?: string;
  role?: UserRole; // Legacy single role field kept for backward compatibility
  roles?: UserRole[]; // Authoritative array of roles, e.g. ['passenger'], ['passenger', 'driver']
  activeRole?: UserRole; // Current active application role, e.g. 'passenger' | 'driver' | 'admin'
  emailVerified?: boolean; // Authoritative email verification status
  status: UserStatus;
  accountStatus?: UserStatus;
  currentLocation?: PassengerLocation;
  isDemo?: boolean;
  demoPersona?: 'amara' | 'sipho' | 'kofi' | 'chidi';
  termsAccepted?: boolean;
  termsAcceptedAt?: string;
  popiaConsent?: boolean;
  popiaConsentAt?: string;
  pushDeviceToken?: string;
  pushPlatform?: 'ios' | 'web' | 'android';
  pushTokenUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PhoneIndexRecord {
  uid: string;
  normalizedPhone: string;
  createdAt: string;
  updatedAt: string;
}

export interface PassengerProfile {
  userId: string;
  name: string;
  phone: string;
  rating: number;
  totalTrips: number;
  totalRatings?: number;
  ratingSum?: number;
  walletBalance?: number;
  savedPlaces?: {
    id: string;
    label: string;
    address: string;
    location: LocationCoordinates;
    icon: 'home' | 'work' | 'airport' | 'favorite';
  }[];
  isDemo?: boolean;
  demoPersona?: 'amara' | 'sipho' | 'kofi' | 'chidi';
  createdAt: string;
  updatedAt: string;
}

export interface DriverVehicle {
  driverId: string;
  vehicleType: VehicleType;
  make: string;
  model: string;
  year?: number | string;
  colour: string;
  registrationNumber: string;
  operatingLicenseNumber?: string;
  operatingLicenseExpiry?: string;
  passengerCapacity: number;
  photoURL?: string;
  status: 'active' | 'pending' | 'inactive';
  createdAt?: string;
  updatedAt?: string;
}

export interface DriverProfile {
  userId: string;
  name: string;
  phone: string;
  photoURL?: string;
  rating: number;
  totalTrips: number;
  totalRatings?: number;
  ratingSum?: number;
  online: boolean;
  available: boolean;
  verificationStatus: 'approved' | 'pending' | 'rejected';
  rejectionReason?: string;
  operatingLicenseNumber?: string;
  operatingLicenseExpiry?: string;
  verificationDocuments?: {
    driversLicense?: DriverDocumentRecord;
    prdp?: DriverDocumentRecord;
    vehicleRegistration?: DriverDocumentRecord;
    vehicleInspection?: DriverDocumentRecord;
    profilePhoto?: DriverDocumentRecord;
    operatingLicense?: DriverDocumentRecord;
    [key: string]: DriverDocumentRecord | undefined;
  };
  currentLocation?: LocationCoordinates & { timestamp: number };
  vehicle?: DriverVehicle;
  earningsToday?: number;
  earningsThisWeek?: number;
  totalEarnings?: number;
  isDemo?: boolean;
  demoPersona?: 'amara' | 'sipho' | 'kofi' | 'chidi';
  createdAt: string;
  updatedAt: string;
}

export type DriverDocumentType =
  | 'drivers-license'
  | 'prdp'
  | 'vehicle-registration'
  | 'vehicle-inspection'
  | 'profile-photo'
  | 'operating-license';

export type DocumentStatus = 'pending' | 'approved' | 'rejected';

export interface DriverDocumentRecord {
  id: string;
  documentType: DriverDocumentType;
  title: string;
  fileUrl: string;
  storagePath: string;
  fileName: string;
  fileSizeBytes: number;
  fileType: string;
  status: DocumentStatus;
  uploadedAt: string;
  reviewedAt?: string;
  rejectionReason?: string;
  expiryDate?: string;
}

export type GpsTrackingState =
  | 'LOCATION_REQUESTING'
  | 'LOCATION_GRANTED'
  | 'LOCATION_DENIED'
  | 'LOCATION_UNAVAILABLE'
  | 'LOCATION_STALE'
  | 'LOCATION_ERROR';

export interface RideEmergencyAlert {
  active: boolean;
  triggeredBy: 'driver' | 'passenger' | 'system';
  triggeredAt: string;
  coordinates?: LocationCoordinates;
  note?: string;
  acknowledgedByAdmin?: boolean;
}

export interface RideDocument {
  id: string;
  passengerId: string;
  passengerName: string;
  passengerPhone: string;
  passengerPhotoURL?: string;
  passengerRating?: number;
  driverId?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  driverPhotoURL?: string | null;
  driverRating?: number | null;
  driverCurrentLocation?: LocationCoordinates;
  vehicleDetails?: {
    make: string;
    model: string;
    colour: string;
    registrationNumber: string;
    vehicleType: VehicleType;
  } | null;
  pickupLocation: LocationCoordinates;
  destinationLocation: LocationCoordinates;
  pickupAddress: string;
  destinationAddress: string;
  rideType: VehicleType;
  passengerCount?: number;
  estimatedDistanceKm: number;
  distanceKm?: number;
  estimatedDurationMin: number;
  estimatedDurationMinutes?: number;
  baseFare?: number;
  distanceFare?: number;
  timeFare?: number;
  estimatedFare: number;
  currency?: string;
  finalFare?: number;
  status: RideStatus;
  // Safety PIN. Real rides keep it in /rides/{id}/private/pin (passenger-only); only demo/legacy rides carry it here.
  otp?: string;
  // PIN the driver submitted when starting the trip (validated by the security rules)
  enteredPin?: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  isDemo?: boolean;
  demoPersona?: 'amara' | 'sipho' | 'kofi' | 'chidi';
  requestedAt: string;
  acceptedAt?: string | null;
  driverArrivingAt?: string | null;
  driverArrivedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string;
  emergencyAlert?: RideEmergencyAlert;
  createdAt: string;
}

export interface PaymentRecord {
  id?: string;
  paymentId?: string;
  rideId: string;
  passengerId: string;
  driverId: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  platformCommission?: number;
  platformFee?: number; // Aliased to platformCommission for backwards compatibility
  driverEarnings?: number;
  provider?: string;
  transactionReference: string;
  merchantTransactionId?: string;
  providerTransactionId?: string;
  peachCheckoutId?: string;
  redirectUrl?: string;
  settledByServer?: boolean; // amount and split were written by the trusted backend
  failureReason?: string;
  isDemo?: boolean;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string | null;
  paidAt?: string | null;
}

export interface RatingRecord {
  id?: string;
  ratingId?: string;
  rideId: string;
  fromUserId: string;
  toUserId: string;
  fromRole: 'passenger' | 'driver';
  toRole: 'passenger' | 'driver';
  passengerId?: string;
  driverId?: string;
  rating: number;
  comment?: string;
  tip?: number;
  isDemo?: boolean;
  createdAt: string;
}

// Wallet ledger entry (written by the backend only)
export interface WalletTransaction {
  id: string;
  userId: string;
  type: 'topup' | 'ride_payment' | 'refund' | 'adjustment';
  direction: 'credit' | 'debit';
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  rideId?: string;
  description?: string;
  balanceAfter?: number;
  createdAt: string;
  completedAt?: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'ride' | 'system' | 'payment' | 'promo';
  read: boolean;
  createdAt: string;
}

export interface DriverEarningsSummary {
  today: {
    completedTrips: number;
    grossEarnings: number;
    paidRides: number;
    pendingPayments: number;
    driverNetEarnings: number;
  };
  thisWeek: {
    completedTrips: number;
    grossEarnings: number;
    driverNetEarnings: number;
  };
  thisMonth: {
    completedTrips: number;
    grossEarnings: number;
    driverNetEarnings: number;
  };
  lifetime: {
    completedTrips: number;
    grossEarnings: number;
    driverNetEarnings: number;
  };
}

export interface VehicleOptionConfig {
  type: VehicleType;
  name: string;
  tagline: string;
  capacity: number;
  etaMins: number;
  baseFare: number;
  perKmRate: number;
  perMinuteRate: number;
  minimumFare: number;
  iconName: string;
}

export interface AdminAuditRecord {
  id?: string;
  adminId: string;
  adminEmail: string;
  action:
    | 'approve_driver'
    | 'reject_driver'
    | 'approve_document'
    | 'reject_document'
    | 'update_pricing'
    | 'send_broadcast'
    | 'revoke_driver'
    | 'DRIVER_EMERGENCY_SOS';
  targetId: string;
  targetType: 'driver' | 'document' | 'pricing' | 'broadcast' | 'ride' | 'emergency';
  details: string;
  timestamp: string;
}
