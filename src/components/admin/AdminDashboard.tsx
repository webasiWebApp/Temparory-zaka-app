/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Admin Operations Dashboard
 * Visuals: Desktop-first, clean white cards, subtle borders, black & #FFC107 yellow accents
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { firestoreService } from '../../firebase/firestoreService';
import {
  UserProfile,
  PassengerProfile,
  PassengerVerificationImage,
  PassengerVerificationImageKind,
  ACTIVE_VEHICLE_TYPES,
  DriverProfile,
  RideDocument,
  PaymentRecord,
  RatingRecord,
  VehicleType,
  PricingConfig,
  DriverDocumentType,
  DriverDocumentRecord,
  DriverPrivateDetails,
  DRIVER_DOCUMENT_FIELD_KEYS,
  DocumentStatus,
  AdminAuditRecord,
} from '../../types';
import { resolveDocumentUrl, ResolvedDocument } from '../../utils/documentUtils';
import { fareService, ZAKA_DEFAULT_LAUNCH_PRICING } from '../../services/fareService';
import { paymentService, PaymentGatewayConfig } from '../../services/paymentService';
import { InteractiveMap } from '../common/InteractiveMap';
import { onGoHome } from '../../utils/appEvents';
import { formatPhoneDisplay, normalizePhoneNumber } from '../../utils/phoneUtils';
import {
  Users,
  Car,
  TrendingUp,
  ShieldCheck,
  CreditCard,
  Bell,
  Settings,
  Check,
  X,
  RefreshCw,
  Search,
  Filter,
  ArrowUpRight,
  Clock,
  MapPin,
  Send,
  Save,
  Calculator,
  Sliders,
  DollarSign,
  Star,
  LogOut,
  Eye,
  FileText,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FileCheck,
  ClipboardList,
  ShieldAlert,
  Download,
  ExternalLink,
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const { signOut, isSigningOut, userProfile, isAdmin, setActiveRole } = useAuth();
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'passengers' | 'drivers' | 'rides' | 'vehicles' | 'payments' | 'ratings' | 'notifications' | 'settings'
  >('dashboard');

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [passengers, setPassengers] = useState<PassengerProfile[]>([]);
  // Passenger identity review (ID document + live photo)
  const [reviewPassenger, setReviewPassenger] = useState<PassengerProfile | null>(null);
  const [reviewImages, setReviewImages] = useState<Partial<Record<PassengerVerificationImageKind, PassengerVerificationImage>>>({});
  const [reviewImagesLoading, setReviewImagesLoading] = useState(false);
  const [reviewRejectReason, setReviewRejectReason] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewZoomUrl, setReviewZoomUrl] = useState<string | null>(null);

  // ZAKA logo pressed: back to the dashboard overview
  useEffect(() => onGoHome(() => setActiveTab('dashboard')), []);
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [rides, setRides] = useState<RideDocument[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [ratings, setRatings] = useState<RatingRecord[]>([]);
  const [pricingConfigs, setPricingConfigs] = useState<Record<VehicleType, PricingConfig>>(
    ZAKA_DEFAULT_LAUNCH_PRICING
  );
  const [loading, setLoading] = useState(true);

  // Admin pricing edit form state
  const [editingPricing, setEditingPricing] = useState<Record<VehicleType, PricingConfig>>(
    ZAKA_DEFAULT_LAUNCH_PRICING
  );
  const [savingTier, setSavingTier] = useState<VehicleType | null>(null);
  const [pricingSuccessMsg, setPricingSuccessMsg] = useState<string | null>(null);

  // Simulator state
  const [simDistance, setSimDistance] = useState<number>(8.5);
  const [simDuration, setSimDuration] = useState<number>(18);

  // Broadcast notification state
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastSuccess, setBroadcastSuccess] = useState(false);

  // Gateway status state
  const [gatewayConfig, setGatewayConfig] = useState<PaymentGatewayConfig | null>(null);

  // Driver Verification Console & Audit State
  const [auditLogs, setAuditLogs] = useState<AdminAuditRecord[]>([]);
  const [selectedDriverForReview, setSelectedDriverForReview] = useState<DriverProfile | null>(null);
  // Private details of the driver under review (home address, date of birth, nationality, ID number)
  const [reviewDriverDetails, setReviewDriverDetails] = useState<DriverPrivateDetails | null | 'loading'>(null);
  const reviewDriverId = selectedDriverForReview?.userId || '';
  useEffect(() => {
    if (!reviewDriverId) {
      setReviewDriverDetails(null);
      return;
    }
    let cancelled = false;
    setReviewDriverDetails('loading');
    firestoreService
      .getDriverPrivateDetails(reviewDriverId)
      .then((d) => {
        if (!cancelled) setReviewDriverDetails(d);
      })
      .catch(() => {
        if (!cancelled) setReviewDriverDetails(null);
      });
    return () => {
      cancelled = true;
    };
  }, [reviewDriverId]);
  const [driverStatusFilter, setDriverStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [driverSearchTerm, setDriverSearchTerm] = useState('');
  const [rejectDriverModal, setRejectDriverModal] = useState<{
    isOpen: boolean;
    driverId: string;
    driverName: string;
    reason: string;
  } | null>(null);
  const [rejectDocModal, setRejectDocModal] = useState<{
    isOpen: boolean;
    driverId: string;
    docType: DriverDocumentType;
    title: string;
    reason: string;
  } | null>(null);
  const [isUpdatingDoc, setIsUpdatingDoc] = useState(false);

  // Document Preview Modal State
  const [previewDocModal, setPreviewDocModal] = useState<{
    isOpen: boolean;
    doc: DriverDocumentRecord;
    title: string;
    driverName: string;
    driverId: string;
  } | null>(null);
  const [previewDocError, setPreviewDocError] = useState<string | null>(null);
  const [previewDocLoading, setPreviewDocLoading] = useState(false);
  const [resolvedDocData, setResolvedDocData] = useState<ResolvedDocument | null>(null);

  const handleOpenDocumentPreview = async (docData: DriverDocumentRecord, docTitle: string) => {
    setPreviewDocError(null);
    setPreviewDocLoading(true);
    setResolvedDocData(null);
    setPreviewDocModal({
      isOpen: true,
      doc: docData,
      title: docTitle,
      driverName: selectedDriverForReview?.name || 'Driver',
      driverId: selectedDriverForReview?.userId || '',
    });

    try {
      const res = await resolveDocumentUrl(docData);
      setResolvedDocData(res);
    } catch (err: any) {
      console.warn('Document preview resolution error:', err);
      setPreviewDocError(err?.message || 'Unable to load this document. File may be unavailable.');
    } finally {
      setPreviewDocLoading(false);
    }
  };

  const handleRetryDocumentPreview = async () => {
    if (!previewDocModal?.doc) return;
    setPreviewDocError(null);
    setPreviewDocLoading(true);
    try {
      const res = await resolveDocumentUrl(previewDocModal.doc);
      setResolvedDocData(res);
    } catch (err: any) {
      setPreviewDocError(err?.message || 'Unable to load this document. Please check connection and retry.');
    } finally {
      setPreviewDocLoading(false);
    }
  };

  // Keyboard accessibility: Escape key closes preview modal safely without navigating away
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewDocModal) {
          setPreviewDocModal(null);
          setPreviewDocError(null);
          setResolvedDocData(null);
        } else if (selectedDriverForReview) {
          setSelectedDriverForReview(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewDocModal, selectedDriverForReview]);

  const loadAdminData = async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const isDemo = Boolean(userProfile?.isDemo);
      const [u, pax, d, r, p, pr, rat, gw, logs] = await Promise.all([
        firestoreService.getAllUsers(isDemo),
        isDemo ? Promise.resolve([]) : firestoreService.getAllPassengers().catch(() => []),
        firestoreService.getAllDrivers(isDemo),
        firestoreService.getAllRides(isDemo),
        firestoreService.getAllPayments(isDemo),
        firestoreService.getPricingConfigs(),
        firestoreService.getAllRatings(isDemo),
        paymentService.getGatewayConfig().catch(() => null),
        firestoreService.getAuditLogs(50).catch(() => []),
      ]);
      setUsers(u);
      setPassengers(pax);
      setDrivers(d);
      setRides(r);
      setPayments(p);
      setPricingConfigs(pr);
      setEditingPricing(pr);
      setRatings(rat);
      if (gw) setGatewayConfig(gw);
      setAuditLogs(logs);
    } catch (e) {
      console.warn('Error loading admin data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    loadAdminData();

    // Listen to real-time pricing updates
    const unsubPricing = firestoreService.listenToPricingConfigs((updated) => {
      setPricingConfigs(updated);
      setEditingPricing((prev) => ({ ...updated, ...prev }));
    });

    return () => unsubPricing();
  }, [isAdmin]);

  const totalPassengers = users.filter((u) => u.role === 'passenger').length;
  const totalDriversCount = drivers.length;
  const activeOnlineDrivers = drivers.filter((d) => d.online).length;
  const completedRides = rides.filter((r) => r.status === 'completed').length;
  const inProgressRides = rides.filter((r) => r.status === 'in_progress' || r.status === 'driver_arriving').length;
  const cancelledRides = rides.filter((r) => r.status === 'cancelled').length;

  // Platform GMV & Revenue (15% take rate)
  const totalGmv = payments.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const platformRevenue = totalGmv * 0.15;

  const passengerById = new Map(passengers.map((p) => [p.userId, p]));
  const pendingPassengerCount = passengers.filter((p) => p.verificationStatus === 'pending').length;

  const openPassengerReview = async (passenger: PassengerProfile) => {
    setReviewPassenger(passenger);
    setReviewImages({});
    setReviewRejectReason('');
    setReviewError('');
    setReviewImagesLoading(true);
    try {
      setReviewImages(await firestoreService.getPassengerVerificationImages(passenger.userId));
    } catch (err) {
      console.warn('Could not load passenger verification photos:', err);
      setReviewError('The verification photos could not be loaded. Please try again.');
    } finally {
      setReviewImagesLoading(false);
    }
  };

  const handleReviewPassenger = async (status: 'approved' | 'rejected') => {
    if (!reviewPassenger) return;
    const reason = reviewRejectReason.trim();
    if (status === 'rejected' && reason.length < 5) {
      setReviewError('Please tell the passenger why the submission was not approved.');
      return;
    }
    setReviewBusy(true);
    setReviewError('');
    try {
      const adminInfo = userProfile?.uid
        ? { adminId: userProfile.uid, adminEmail: userProfile.email || 'admin@zaka.io' }
        : undefined;
      await firestoreService.reviewPassengerVerification(reviewPassenger.userId, status, reason, adminInfo);
      setReviewPassenger(null);
      await loadAdminData();
    } catch (err) {
      console.error('Passenger review failed:', err);
      setReviewError('The decision could not be saved. Please try again.');
    } finally {
      setReviewBusy(false);
    }
  };

  const handleApproveDriver = async (driverId: string) => {
    const adminInfo = userProfile?.uid
      ? { adminId: userProfile.uid, adminEmail: userProfile.email || 'admin@zaka.io' }
      : undefined;
    await firestoreService.updateDriverVerificationStatus(driverId, 'approved', undefined, adminInfo);
    await loadAdminData();
    if (selectedDriverForReview?.userId === driverId) {
      setSelectedDriverForReview((prev) => (prev ? { ...prev, verificationStatus: 'approved' } : null));
    }
  };

  const handleRejectDriver = async (driverId: string, reason: string) => {
    const adminInfo = userProfile?.uid
      ? { adminId: userProfile.uid, adminEmail: userProfile.email || 'admin@zaka.io' }
      : undefined;
    await firestoreService.updateDriverVerificationStatus(driverId, 'rejected', reason, adminInfo);
    await loadAdminData();
    if (selectedDriverForReview?.userId === driverId) {
      setSelectedDriverForReview((prev) =>
        prev
          ? {
              ...prev,
              verificationStatus: 'rejected',
              rejectionReason: reason,
              online: false,
              available: false,
            }
          : null
      );
    }
    setRejectDriverModal(null);
  };

  const handleReviewDocument = async (
    driverId: string,
    docType: DriverDocumentType,
    status: DocumentStatus,
    reason?: string
  ) => {
    setIsUpdatingDoc(true);
    try {
      const adminInfo = userProfile?.uid
        ? { adminId: userProfile.uid, adminEmail: userProfile.email || 'admin@zaka.io' }
        : undefined;
      await firestoreService.updateDriverDocumentReview(driverId, docType, status, reason, adminInfo);
      await loadAdminData();

      // Update local state for modal
      if (selectedDriverForReview?.userId === driverId) {
        const field = DRIVER_DOCUMENT_FIELD_KEYS[docType];
        setSelectedDriverForReview((prev) => {
          if (!prev) return null;
          const currentDocs: any = prev.verificationDocuments || {};
          const existing = currentDocs[field];
          return {
            ...prev,
            verificationDocuments: {
              ...currentDocs,
              [field]: existing ? { ...existing, status, rejectionReason: reason } : undefined,
            },
          };
        });
      }
      setRejectDocModal(null);
    } catch (e) {
      console.warn('Error reviewing document:', e);
    } finally {
      setIsUpdatingDoc(false);
    }
  };

  const handleSavePricingTier = async (type: VehicleType) => {
    const tier = editingPricing[type];
    if (!tier) return;
    setSavingTier(type);
    try {
      await firestoreService.updatePricingConfig(type, {
        baseFare: Number(tier.baseFare) || 0,
        perKmRate: Number(tier.perKmRate) || 0,
        perMinuteRate: Number(tier.perMinuteRate) || 0,
        minimumFare: Number(tier.minimumFare) || 0,
        passengerCapacity: Number(tier.passengerCapacity) || 1,
        active: Boolean(tier.active),
        currency: 'ZAR',
      });
      setPricingSuccessMsg(`Updated ${tier.name} pricing in Firestore!`);
      setTimeout(() => setPricingSuccessMsg(null), 3500);
    } catch (e) {
      console.error('Failed to update pricing:', e);
    } finally {
      setSavingTier(null);
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle || !broadcastMsg) return;
    setIsBroadcasting(true);

    try {
      for (const u of users) {
        await firestoreService.sendNotification({
          userId: u.uid,
          title: broadcastTitle,
          message: broadcastMsg,
          type: 'promo',
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
      setBroadcastSuccess(true);
      setBroadcastTitle('');
      setBroadcastMsg('');
      setTimeout(() => setBroadcastSuccess(false), 4000);
    } catch (e) {
      console.error('Error sending broadcast:', e);
    } finally {
      setIsBroadcasting(false);
    }
  };

  if (!isAdmin) {
    const returnRole = userProfile?.role === 'driver' ? 'driver' : 'passenger';
    return (
      <div className="flex min-h-[calc(100vh-61px)] flex-col items-center justify-center bg-surface-2 p-6 text-center">
        <div className="w-full max-w-md space-y-4 rounded-card border border-line bg-white p-8 shadow-raised">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-card bg-red-100 text-danger">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-ink">Administrator Access Restricted</h2>
            <p className="mt-2 text-xs text-ink-2 leading-relaxed">
              Your account does not have verified fleet operations administrator permissions.
              Access to user directories, driver verification credentials, and pricing controls is restricted.
            </p>
          </div>
          <button
            onClick={() => setActiveRole(returnRole)}
            className="w-full rounded-full bg-ink py-3 text-xs font-bold text-white shadow-card hover:bg-ink transition-all active:scale-[0.99]"
          >
            Return to {returnRole === 'driver' ? 'Driver App' : 'Passenger App'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-61px)] bg-surface-2">
      {/* LEFT SIDEBAR NAVIGATION */}
      <aside className="hidden w-64 flex-col border-r border-line bg-white p-4 md:flex">
        <div className="mb-4 px-3 py-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">
            ZAKA OPERATIONS
          </span>
          <h2 className="text-sm font-bold text-ink">Fleet Control Hub</h2>
        </div>

        <nav className="space-y-1">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: TrendingUp },
            { id: 'passengers', label: 'Passengers', icon: Users },
            { id: 'drivers', label: 'Drivers & Queue', icon: ShieldCheck },
            { id: 'rides', label: 'Rides & Dispatch', icon: Car },
            { id: 'vehicles', label: 'Vehicle Fleet', icon: Car },
            { id: 'payments', label: 'Financial Ledger', icon: CreditCard },
            { id: 'ratings', label: 'Ratings & Quality', icon: Star },
            { id: 'notifications', label: 'Broadcast Alerts', icon: Bell },
            { id: 'settings', label: 'Fare Architecture', icon: Settings },
          ].map((item) => {
            const Icon = item.icon;
            const isSel = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`flex w-full items-center gap-3 rounded-full px-3.5 py-2.5 text-xs font-bold transition-all ${
                  isSel
                    ? 'bg-ink text-white shadow-card'
                    : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-line pt-4 space-y-2">
          <button
            onClick={loadAdminData}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-line bg-surface-2 py-2 text-xs font-bold text-ink-2 hover:bg-surface-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync Live Data</span>
          </button>

          <button
            onClick={() => signOut()}
            disabled={isSigningOut}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50/70 py-2 text-xs font-bold text-danger hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>{isSigningOut ? 'Signing Out...' : 'Sign Out Admin'}</span>
          </button>
        </div>
      </aside>

      {/* MAIN ADMIN WORKSPACE */}
      <main className="flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8 max-w-full">
        {/* MOBILE HORIZONTAL TAB SWITCHER */}
        <div className="mb-4 flex overflow-x-auto pb-1 gap-1.5 md:hidden border-b border-line scrollbar-none">
          {[
            { id: 'dashboard', label: 'Overview', icon: TrendingUp },
            { id: 'passengers', label: 'Riders', icon: Users },
            { id: 'drivers', label: 'Drivers', icon: ShieldCheck },
            { id: 'rides', label: 'Rides', icon: Car },
            { id: 'vehicles', label: 'Vehicles', icon: Car },
            { id: 'payments', label: 'Ledger', icon: CreditCard },
            { id: 'ratings', label: 'Ratings', icon: Star },
            { id: 'notifications', label: 'Alerts', icon: Bell },
            { id: 'settings', label: 'Pricing', icon: Settings },
          ].map((item) => {
            const Icon = item.icon;
            const isSel = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                  isSel
                    ? 'bg-ink text-white shadow-card'
                    : 'bg-white border border-line text-ink-2'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* TOP STATS BENTO GRID */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
          <div className="rounded-card border border-line bg-white p-4 ">
            <span className="text-[11px] font-bold uppercase text-neutral-400">Total Rides</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-ink">{rides.length}</span>
              <span className="text-xs font-bold text-success">
                {completedRides} Completed
              </span>
            </div>
          </div>

          <div className="rounded-card border border-line bg-white p-4 ">
            <span className="text-[11px] font-bold uppercase text-neutral-400">Platform GMV</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-ink">
                {fareService.formatZAR(totalGmv)}
              </span>
              <span className="text-xs font-bold text-primary-text">
                {fareService.formatZAR(platformRevenue)} Net
              </span>
            </div>
          </div>

          <div className="rounded-card border border-line bg-white p-4 ">
            <span className="text-[11px] font-bold uppercase text-neutral-400">Active Drivers</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-ink">{activeOnlineDrivers}</span>
              <span className="text-xs font-bold text-ink-3">
                / {totalDriversCount} Total
              </span>
            </div>
          </div>

          <div className="rounded-card border border-line bg-white p-4 ">
            <span className="text-[11px] font-bold uppercase text-neutral-400">Passengers</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-ink">{totalPassengers}</span>
              <span className="text-xs font-bold text-ink-3">Active Base</span>
            </div>
          </div>
        </div>

        {/* TAB 1: OVERVIEW DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Live Map & Operations Feed */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Map View */}
              <div className="lg:col-span-8 overflow-hidden rounded-card border border-line bg-white ">
                <div className="border-b border-line p-4 flex justify-between items-center">
                  <div>
                    <h3 className="text-sm font-bold text-ink">Live Fleet Radar Feed</h3>
                    <p className="text-[11px] text-ink-3">Real-time driver positions & active trips</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-success animate-ping" />
                    {activeOnlineDrivers} Drivers Online
                  </span>
                </div>
                <div className="h-80 w-full">
                  <InteractiveMap
                    pickupLocation={{ latitude: -26.1458, longitude: 28.0416 }}
                    destinationLocation={{ latitude: -26.1076, longitude: 28.0567 }}
                    nearbyDrivers={drivers
                      .filter((d) => d.online && d.currentLocation)
                      .map((d) => ({
                        id: d.userId,
                        latitude: d.currentLocation!.latitude,
                        longitude: d.currentLocation!.longitude,
                        vehicleType: d.vehicle?.vehicleType || 'economy',
                      }))}
                    isDemo={Boolean(userProfile?.isDemo)}
                    mode="admin"
                  />
                </div>
              </div>

              {/* In-Flight & Recent Dispatches */}
              <div className="lg:col-span-4 rounded-card border border-line bg-white p-4 ">
                <div className="mb-3 flex items-center justify-between border-b border-line pb-3">
                  <h3 className="text-sm font-bold text-ink">Recent Activity</h3>
                  <span className="text-[11px] font-bold text-neutral-400">FIRESTORE FEED</span>
                </div>

                <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
                  {rides.slice(0, 5).map((ride) => (
                    <div
                      key={ride.id}
                      className="rounded-card border border-line bg-surface-2 p-3 text-xs space-y-1"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-ink">{ride.passengerName}</span>
                        <span className="font-mono font-bold text-ink">
                          {fareService.formatZAR(ride.estimatedFare)}
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-3 truncate">{ride.destinationAddress}</p>
                      <div className="flex justify-between items-center pt-1 text-[11px] text-neutral-400">
                        <span>{ride.rideType.toUpperCase()}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 font-bold uppercase ${
                            ride.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : ride.status === 'in_progress'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-neutral-200 text-ink-2'
                          }`}
                        >
                          {ride.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PASSENGERS */}
        {activeTab === 'passengers' && (
          <div className="rounded-card border border-line bg-white p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <h3 className="text-base font-bold text-ink">Registered Passengers</h3>
                <p className="text-xs text-ink-3">
                  Passengers can request rides only after their ID document and live photo are approved here.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {pendingPassengerCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                    {pendingPassengerCount} awaiting review
                  </span>
                )}
                <span className="text-xs font-bold text-neutral-400">
                  {users.filter((u) => u.role === 'passenger').length} Users
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line text-neutral-400 font-bold uppercase text-[11px]">
                    <th className="pb-2">Passenger</th>
                    <th className="pb-2">Phone</th>
                    <th className="pb-2">Email</th>
                    <th className="pb-2">Identity</th>
                    <th className="pb-2">Joined Date</th>
                    <th className="pb-2 text-right">Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {users
                    .filter((u) => u.role === 'passenger')
                    // Submissions waiting for a decision come first
                    .sort((a, b) => {
                      const rank = (uid: string) => (passengerById.get(uid)?.verificationStatus === 'pending' ? 0 : 1);
                      return rank(a.uid) - rank(b.uid);
                    })
                    .map((p) => {
                      const pax = passengerById.get(p.uid);
                      const idStatus = pax?.verificationStatus || 'unverified';
                      return (
                        <tr key={p.uid} className="hover:bg-surface-2">
                          <td className="py-3 font-bold text-ink">{p.name}</td>
                          <td className="py-3 text-ink-2">
                            {p.phone}
                            {pax?.phoneVerified && (
                              <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                OTP
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-ink-3">{p.email}</td>
                          <td className="py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${
                                idStatus === 'approved'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : idStatus === 'pending'
                                  ? 'bg-amber-100 text-amber-800'
                                  : idStatus === 'rejected'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-neutral-100 text-ink-3'
                              }`}
                            >
                              {idStatus === 'unverified' ? 'Not submitted' : idStatus}
                            </span>
                          </td>
                          <td className="py-3 text-neutral-400">
                            {new Date(p.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-3 text-right">
                            {pax && idStatus !== 'unverified' ? (
                              <button
                                type="button"
                                onClick={() => openPassengerReview(pax)}
                                className={`rounded-full px-3 py-1.5 text-[11px] font-bold cursor-pointer ${
                                  idStatus === 'pending'
                                    ? 'bg-ink text-white hover:bg-black'
                                    : 'border border-line bg-white text-ink hover:bg-surface-2'
                                }`}
                              >
                                {idStatus === 'pending' ? 'Review' : 'View'}
                              </button>
                            ) : (
                              <span className="text-[11px] text-neutral-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: DRIVERS & VERIFICATION QUEUE */}
        {activeTab === 'drivers' && (
          <div className="space-y-6">
            <div className="rounded-card border border-line bg-white p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-line pb-4 gap-3">
                <div>
                  <h3 className="text-base font-bold text-ink">Driver Compliance & Verification Console</h3>
                  <p className="text-xs text-ink-3">
                    Audit compliance documentation, authorize driver roadworthiness, and inspect credentials
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
                    {drivers.filter((d) => d.verificationStatus === 'pending').length} Pending Review
                  </span>
                  <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-ink-2">
                    {drivers.length} Total
                  </span>
                </div>
              </div>

              {/* Filters & Search */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                  {(['all', 'pending', 'approved', 'rejected'] as const).map((filter) => {
                    const count =
                      filter === 'all'
                        ? drivers.length
                        : drivers.filter((d) => d.verificationStatus === filter).length;
                    return (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setDriverStatusFilter(filter)}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize transition-all ${
                          driverStatusFilter === filter
                            ? 'bg-ink text-white shadow-card'
                            : 'bg-surface-2 text-ink-2 hover:bg-neutral-200'
                        }`}
                      >
                        {filter === 'all' ? 'All Drivers' : filter} ({count})
                      </button>
                    );
                  })}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-neutral-400" />
                  <input
                    type="text"
                    value={driverSearchTerm}
                    onChange={(e) => setDriverSearchTerm(e.target.value)}
                    placeholder="Search name, phone, reg..."
                    className="w-full rounded-input border border-line bg-surface-2 pl-8 pr-3 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              {/* Drivers List */}
              <div className="space-y-3">
                {drivers
                  .filter((drv) => {
                    if (driverStatusFilter !== 'all' && drv.verificationStatus !== driverStatusFilter) {
                      return false;
                    }
                    if (driverSearchTerm.trim()) {
                      const q = driverSearchTerm.toLowerCase();
                      const nameMatch = drv.name.toLowerCase().includes(q);
                      const phoneMatch = drv.phone?.toLowerCase().includes(q);
                      const regMatch = drv.vehicle?.registrationNumber?.toLowerCase().includes(q);
                      return nameMatch || phoneMatch || regMatch;
                    }
                    return true;
                  })
                  .map((drv) => {
                    const docSpecs = [
                      { key: 'driversLicense', name: 'License' },
                      { key: 'prdp', name: 'PrDP' },
                      { key: 'vehicleRegistration', name: 'RC1' },
                      { key: 'vehicleInspection', name: 'COF' },
                      { key: 'profilePhoto', name: 'Photo' },
                    ];
                    const docsObj = drv.verificationDocuments || {};
                    const verifiedCount = docSpecs.filter(
                      (d) => (docsObj as any)[d.key]?.status === 'approved'
                    ).length;

                    return (
                      <div
                        key={drv.userId}
                        className="flex flex-col md:flex-row items-start md:items-center justify-between rounded-card border border-line bg-surface-2 p-4 gap-3 hover:border-neutral-300 transition-all"
                      >
                        <div className="flex items-start sm:items-center gap-3 min-w-0">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-primary text-ink font-bold text-base shadow-card">
                            {drv.name.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-sm font-bold text-ink truncate">{drv.name}</h4>
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                                  drv.verificationStatus === 'approved'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : drv.verificationStatus === 'pending'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {drv.verificationStatus}
                              </span>
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-800 border border-blue-200">
                                {verifiedCount}/5 Docs Approved
                              </span>
                            </div>
                            <p className="text-[11px] text-ink-2 mt-0.5">
                              {drv.vehicle
                                ? `${drv.vehicle.colour} ${drv.vehicle.make} ${drv.vehicle.model} • ${drv.vehicle.registrationNumber} (${drv.vehicle.year})`
                                : 'No vehicle registered'}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-neutral-400">
                              <span>Phone: {drv.phone || 'N/A'}</span>
                              <span>Rating: {drv.rating?.toFixed(1) || '5.0'} ★</span>
                              <span>Trips: {drv.totalTrips || 0}</span>
                              <span>Earnings: {fareService.formatZAR(drv.totalEarnings || 0)}</span>
                              {drv.online && (
                                <span className="flex items-center gap-1 font-bold text-success">
                                  <span className="h-1.5 w-1.5 rounded-full bg-success animate-ping" />
                                  Online Now
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 w-full md:w-auto justify-end border-t md:border-t-0 border-line pt-2 md:pt-0">
                          <button
                            type="button"
                            onClick={() => setSelectedDriverForReview(drv)}
                            className="flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-bold text-ink hover:bg-surface-2 active:scale-95 transition-all"
                          >
                            <Eye className="h-3.5 w-3.5 text-ink-2" />
                            <span>Review Docs</span>
                          </button>

                          {drv.verificationStatus !== 'approved' && (
                            <button
                              type="button"
                              onClick={() => handleApproveDriver(drv.userId)}
                              className="flex items-center gap-1 rounded-full bg-success px-3 py-1.5 text-xs font-bold text-white shadow-card hover:bg-emerald-700 active:scale-95 transition-all"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>Approve</span>
                            </button>
                          )}

                          {drv.verificationStatus === 'approved' && (
                            <button
                              type="button"
                              onClick={() =>
                                setRejectDriverModal({
                                  isOpen: true,
                                  driverId: drv.userId,
                                  driverName: drv.name,
                                  reason: '',
                                })
                              }
                              className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-danger hover:bg-red-100 active:scale-95 transition-all"
                            >
                              <X className="h-3.5 w-3.5" />
                              <span>Revoke</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                {drivers.length === 0 && (
                  <div className="rounded-card border border-dashed border-line p-8 text-center text-xs text-neutral-400">
                    No drivers registered on the platform yet.
                  </div>
                )}
              </div>
            </div>

            {/* AUDIT TRAIL LOGS */}
            <div className="rounded-card border border-line bg-white p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary-text" />
                  <h3 className="text-sm font-bold text-ink">Compliance & Admin Audit Trail</h3>
                </div>
                <span className="text-[11px] font-bold text-neutral-400">
                  {auditLogs.length} Recent Events
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line text-neutral-400 font-bold uppercase text-[11px]">
                      <th className="pb-2">Timestamp</th>
                      <th className="pb-2">Admin</th>
                      <th className="pb-2">Action</th>
                      <th className="pb-2">Target</th>
                      <th className="pb-2">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {auditLogs.slice(0, 15).map((log, idx) => (
                      <tr key={log.id || idx} className="hover:bg-surface-2">
                        <td className="py-2.5 text-ink-3 font-mono text-[11px] whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-2.5 font-bold text-ink">{log.adminEmail}</td>
                        <td className="py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                              log.action.includes('approve')
                                ? 'bg-emerald-100 text-emerald-800'
                                : log.action.includes('reject') || log.action.includes('revoke')
                                ? 'bg-red-100 text-red-800'
                                : 'bg-surface-2 text-ink'
                            }`}
                          >
                            {log.action.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono text-[11px] text-ink-2 truncate max-w-[120px]">
                          {log.targetId}
                        </td>
                        <td className="py-2.5 text-ink-2">{log.details}</td>
                      </tr>
                    ))}
                    {auditLogs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-neutral-400 text-xs">
                          No audit events recorded yet. Admin approvals and rejections will appear here.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: RIDES & DISPATCH */}
        {activeTab === 'rides' && (
          <div className="rounded-card border border-line bg-white p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <h3 className="text-base font-bold text-ink">Platform Rides Ledger</h3>
                <p className="text-xs text-ink-3">Complete trip lifecycles in Firestore</p>
              </div>
              <span className="text-xs font-bold text-neutral-400">{rides.length} Total</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line text-neutral-400 font-bold uppercase text-[11px]">
                    <th className="pb-2">Ride ID</th>
                    <th className="pb-2">Passenger</th>
                    <th className="pb-2">Driver</th>
                    <th className="pb-2">Class</th>
                    <th className="pb-2">Route</th>
                    <th className="pb-2">Fare</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rides.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-2">
                      <td className="py-3 font-mono text-[11px] text-ink-3">
                        {r.id.substring(0, 8)}...
                      </td>
                      <td className="py-3 font-bold text-ink">{r.passengerName}</td>
                      <td className="py-3 text-ink-2">{r.driverName || 'Unassigned'}</td>
                      <td className="py-3 font-bold uppercase text-ink-3">{r.rideType}</td>
                      <td className="py-3 text-ink-2 max-w-[200px] truncate">
                        {r.destinationAddress}
                      </td>
                      <td className="py-3 font-mono font-bold text-ink">
                        {fareService.formatZAR(r.estimatedFare)}
                      </td>
                      <td className="py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${
                            r.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : r.status === 'in_progress'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-neutral-200 text-ink-2'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: VEHICLE FLEET */}
        {activeTab === 'vehicles' && (
          <div className="rounded-card border border-line bg-white p-5 space-y-4">
            <div className="border-b border-line pb-4">
              <h3 className="text-base font-bold text-ink">Active Vehicle Fleet</h3>
              <p className="text-xs text-ink-3">Vehicles mapped to certified drivers</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {drivers
                .filter((d) => d.vehicle)
                .map((d) => (
                  <div
                    key={d.userId}
                    className="rounded-card border border-line bg-surface-2 p-4 space-y-2"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-ink">
                          <Car className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-ink">
                            {d.vehicle?.make} {d.vehicle?.model}
                          </h4>
                          <span className="font-mono text-[11px] font-bold text-ink-3">
                            {d.vehicle?.registrationNumber}
                          </span>
                        </div>
                      </div>
                      <span className="rounded bg-neutral-200 px-2 py-0.5 text-[11px] font-bold uppercase">
                        {d.vehicle?.vehicleType}
                      </span>
                    </div>
                    <div className="border-t border-line pt-2 text-[11px] text-ink-2">
                      <p>Driver: <span className="font-bold text-ink">{d.name}</span></p>
                      <p>Color: {d.vehicle?.colour}</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* TAB 6: FINANCIAL LEDGER & PAYMENT GATEWAY */}
        {activeTab === 'payments' && (
          <div className="space-y-5">
            {/* Gateway Configuration Status Card */}
            <div className="rounded-card border border-line bg-white p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-card bg-black text-white">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-ink flex items-center gap-2">
                      VodaPay Gateway Integration
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        gatewayConfig?.isConfigured
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {gatewayConfig?.isConfigured
                          ? `${gatewayConfig.env.toUpperCase()} LIVE`
                          : 'READY — PENDING CREDENTIALS'}
                      </span>
                    </h3>
                    <p className="text-xs text-ink-3">
                      South African Merchant Gateway (Visa, Mastercard, Instant EFT, 3D Secure)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-xl border border-line bg-surface-2 px-3 py-1.5 text-xs font-mono font-bold text-ink-2">
                    Split: 85% Driver / 15% Platform
                  </span>
                </div>
              </div>

              {/* Status & Webhook Specs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="rounded-card border border-line bg-surface-2 p-3">
                  <span className="text-[11px] font-bold uppercase text-neutral-400">Environment</span>
                  <p className="font-bold text-ink capitalize mt-0.5">
                    {gatewayConfig?.env || 'sandbox'}
                  </p>
                  <p className="text-[11px] text-ink-3 mt-1">
                    Base URL: {gatewayConfig?.env === 'production' ? 'api.vodapaygateway.vodacom.co.za' : 'api.vodapaygatewayuat.vodacom.co.za'}
                  </p>
                </div>

                <div className="rounded-card border border-line bg-surface-2 p-3">
                  <span className="text-[11px] font-bold uppercase text-neutral-400">Webhook Listener</span>
                  <p className="font-mono font-bold text-ink mt-0.5 truncate">
                    /api/payments/vodapay/notify
                  </p>
                  <p className="text-[11px] text-ink-3 mt-1">
                    Authenticated by a one-time token per payment
                  </p>
                </div>

                <div className="rounded-card border border-line bg-surface-2 p-3">
                  <span className="text-[11px] font-bold uppercase text-neutral-400">Merchant Onboarding Status</span>
                  <p className={`font-bold mt-0.5 ${gatewayConfig?.isConfigured ? 'text-success' : 'text-amber-700'}`}>
                    {gatewayConfig?.isConfigured ? 'Configured & Active' : 'Awaiting Merchant Credentials'}
                  </p>
                  <p className="text-[11px] text-ink-3 mt-1">
                    {gatewayConfig?.isConfigured
                      ? 'Hosted checkout endpoints active.'
                      : 'Set VODAPAY_API_KEY in the server environment'}
                  </p>
                </div>
              </div>

              {!gatewayConfig?.isConfigured && (
                <div className="rounded-card border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900">
                  <p className="font-bold text-amber-950">
                    ZAKA PAYMENT INTEGRATION IMPLEMENTED — AWAITING VODAPAY API KEY
                  </p>
                  <p className="text-[11px] mt-1 text-amber-800">
                    The ZAKA backend has completed end-to-end implementation for VodaPay Gateway hosted checkout, shopper return routing, and payment notification processing. Set <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">VODAPAY_API_KEY</code> and <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">VODAPAY_ENV</code> on the server to enable debit/credit card charges.
                  </p>
                </div>
              )}
            </div>

            {/* Platform Financial Ledger */}
            <div className="rounded-card border border-line bg-white p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <div>
                  <h3 className="text-base font-bold text-ink">Platform Financial Ledger</h3>
                  <p className="text-xs text-ink-3">Authoritative payment transactions, gateway refs, and driver payouts</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-neutral-400 block">Gross Merchandise Value</span>
                  <span className="text-base font-bold text-ink">
                    {fareService.formatZAR(totalGmv)}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line text-neutral-400 font-bold uppercase text-[11px]">
                      <th className="pb-2">Tx Ref / ID</th>
                      <th className="pb-2">Gateway / Provider</th>
                      <th className="pb-2">Total Fare</th>
                      <th className="pb-2">Platform (15%)</th>
                      <th className="pb-2">Driver Net (85%)</th>
                      <th className="pb-2">Method</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-neutral-400 text-xs">
                          No transactions recorded yet. Completed trips will appear here automatically.
                        </td>
                      </tr>
                    ) : (
                      payments.map((p, idx) => {
                        const amount = p.amount || 0;
                        const platformFee = p.platformFee ?? p.platformCommission ?? (amount * 0.15);
                        const driverEarnings = p.driverEarnings ?? (amount - platformFee);
                        const isSettled = p.paymentStatus === 'paid';

                        return (
                          <tr key={p.id || idx} className="hover:bg-surface-2">
                            <td className="py-3 font-mono font-bold text-ink-2">
                              {p.transactionReference || p.merchantTransactionId || (p.id ? p.id.substring(0, 12) : 'REF-N/A')}
                            </td>
                            <td className="py-3 font-semibold text-ink-2 capitalize">
                              {p.provider === 'vodapay' ? 'VodaPay' : p.provider || 'Cash Direct'}
                            </td>
                            <td className="py-3 font-bold text-ink">
                              {fareService.formatZAR(amount)}
                            </td>
                            <td className="py-3 text-amber-600 font-bold">
                              {fareService.formatZAR(platformFee)}
                            </td>
                            <td className="py-3 text-success font-bold">
                              {fareService.formatZAR(driverEarnings)}
                            </td>
                            <td className="py-3 uppercase font-semibold text-ink-3">
                              {p.paymentMethod}
                            </td>
                            <td className="py-3">
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${
                                isSettled
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}>
                                {p.paymentStatus}
                              </span>
                            </td>
                            <td className="py-3 text-neutral-400">
                              {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: RATINGS & QUALITY */}
        {activeTab === 'ratings' && (
          <div className="rounded-card border border-line bg-white p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <h3 className="text-base font-bold text-ink">Ratings & Community Quality</h3>
                <p className="text-xs text-ink-3">Passenger & driver reviews, compliments, and tips</p>
              </div>
              <span className="text-xs font-bold text-neutral-400">{ratings.length} Reviews Recorded</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line text-neutral-400 font-bold uppercase text-[11px]">
                    <th className="pb-2">Trip Ref</th>
                    <th className="pb-2">Direction</th>
                    <th className="pb-2">Score</th>
                    <th className="pb-2">Feedback & Compliments</th>
                    <th className="pb-2">Tip Added</th>
                    <th className="pb-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {ratings.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-neutral-400 text-xs">
                        No ratings submitted yet across the platform.
                      </td>
                    </tr>
                  ) : (
                    ratings.map((rat) => (
                      <tr key={rat.id} className="hover:bg-surface-2">
                        <td className="py-3 font-mono text-[11px] text-ink-3">
                          {rat.rideId.substring(0, 8)}...
                        </td>
                        <td className="py-3 font-bold capitalize">
                          <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                            rat.fromRole === 'passenger'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-900'
                          }`}>
                            {rat.fromRole} → {rat.toRole}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1 font-bold text-ink">
                            <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                            <span>{rat.rating}.0</span>
                          </div>
                        </td>
                        <td className="py-3 text-ink-2 max-w-xs">
                          {rat.comment || <span className="text-neutral-300 italic">No text provided</span>}
                        </td>
                        <td className="py-3 font-bold text-success">
                          {rat.tip && rat.tip > 0 ? fareService.formatZAR(rat.tip) : '—'}
                        </td>
                        <td className="py-3 text-neutral-400">
                          {new Date(rat.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 8: BROADCAST NOTIFICATIONS */}
        {activeTab === 'notifications' && (
          <div className="max-w-xl rounded-card border border-line bg-white p-5 space-y-4">
            <div className="border-b border-line pb-3">
              <h3 className="text-base font-bold text-ink">Broadcast Platform Alert</h3>
              <p className="text-xs text-ink-3">
                Send real-time in-app announcements to all registered passengers and drivers
              </p>
            </div>

            {broadcastSuccess && (
              <div className="rounded-card bg-emerald-50 border border-emerald-200 p-3 text-xs font-bold text-emerald-800">
                Broadcast notification successfully delivered to {users.length} users!
              </div>
            )}

            <form onSubmit={handleSendBroadcast} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  Notification Title
                </label>
                <input
                  type="text"
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  placeholder="e.g. Weekend Promo: 20% off Sandton Rides"
                  className="w-full rounded-input border border-line bg-surface-2 p-2.5 text-xs text-ink focus:border-primary focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  Message Content
                </label>
                <textarea
                  value={broadcastMsg}
                  onChange={(e) => setBroadcastMsg(e.target.value)}
                  placeholder="Type announcement message here..."
                  rows={3}
                  className="w-full rounded-input border border-line bg-surface-2 p-2.5 text-xs text-ink focus:border-primary focus:outline-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isBroadcasting}
                className="flex items-center justify-center gap-2 rounded-full bg-primary py-3 text-xs font-bold text-ink shadow-card hover:bg-primary-hover active:bg-primary-pressed active:scale-[0.99] transition-all w-full"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{isBroadcasting ? 'Broadcasting...' : 'Send to All Users'}</span>
              </button>
            </form>
          </div>
        )}

        {/* TAB 8: FARE ARCHITECTURE CONFIG */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="rounded-card border border-line bg-white p-5 ">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-line pb-4 gap-3">
                <div>
                  <h3 className="text-base font-bold text-ink">ZAKA Fare Rate Architecture</h3>
                  <p className="text-xs text-ink-3">
                    Live Firestore configuration: Base Fare + (Distance × Per-KM) + (Duration × Per-Minute)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    Live in ZAR (R)
                  </span>
                </div>
              </div>

              {pricingSuccessMsg && (
                <div className="mt-4 rounded-card bg-emerald-50 border border-emerald-200 p-3 text-xs font-bold text-emerald-800 flex items-center gap-2">
                  <Check className="h-4 w-4 text-success" />
                  <span>{pricingSuccessMsg}</span>
                </div>
              )}

              {/* TIER CARDS GRID */}
              <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
                {ACTIVE_VEHICLE_TYPES.map((vt) => {
                  const current = editingPricing[vt] || ZAKA_DEFAULT_LAUNCH_PRICING[vt];
                  const isSaving = savingTier === vt;

                  return (
                    <div
                      key={vt}
                      className="rounded-card border border-line bg-surface-2 p-5 space-y-4 "
                    >
                      <div className="flex items-center justify-between border-b border-line pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-bold text-xs text-ink">
                            {vt === 'economy' ? '🚗' : vt === 'comfort' ? '✨' : vt === 'xl' ? '🚙' : '🏍️'}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-ink uppercase">{current.name}</h4>
                            <p className="text-[11px] text-ink-3">{current.tagline}</p>
                          </div>
                        </div>

                        <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-ink-2">
                          <input
                            type="checkbox"
                            checked={current.active !== false}
                            onChange={(e) =>
                              setEditingPricing((prev) => ({
                                ...prev,
                                [vt]: { ...prev[vt], active: e.target.checked },
                              }))
                            }
                            className="rounded border-line text-primary-text focus:ring-primary"
                          />
                          <span>Active</span>
                        </label>
                      </div>

                      {/* Config Inputs */}
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block text-[11px] font-bold text-ink-2 mb-1">
                            Base Fare (R)
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 font-bold text-neutral-400">R</span>
                            <input
                              type="number"
                              step="0.50"
                              min="0"
                              value={current.baseFare}
                              onChange={(e) =>
                                setEditingPricing((prev) => ({
                                  ...prev,
                                  [vt]: { ...prev[vt], baseFare: parseFloat(e.target.value) || 0 },
                                }))
                              }
                              className="w-full rounded-input border border-line bg-white pl-7 pr-3 py-2 text-xs font-bold text-ink focus:border-primary focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-ink-2 mb-1">
                            Per Kilometer Rate (R/km)
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 font-bold text-neutral-400">R</span>
                            <input
                              type="number"
                              step="0.50"
                              min="0"
                              value={current.perKmRate}
                              onChange={(e) =>
                                setEditingPricing((prev) => ({
                                  ...prev,
                                  [vt]: { ...prev[vt], perKmRate: parseFloat(e.target.value) || 0 },
                                }))
                              }
                              className="w-full rounded-input border border-line bg-white pl-7 pr-3 py-2 text-xs font-bold text-ink focus:border-primary focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-ink-2 mb-1">
                            Per Minute Rate (R/min)
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 font-bold text-neutral-400">R</span>
                            <input
                              type="number"
                              step="0.10"
                              min="0"
                              value={current.perMinuteRate}
                              onChange={(e) =>
                                setEditingPricing((prev) => ({
                                  ...prev,
                                  [vt]: { ...prev[vt], perMinuteRate: parseFloat(e.target.value) || 0 },
                                }))
                              }
                              className="w-full rounded-input border border-line bg-white pl-7 pr-3 py-2 text-xs font-bold text-ink focus:border-primary focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-ink-2 mb-1">
                            Minimum Fare (R)
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 font-bold text-neutral-400">R</span>
                            <input
                              type="number"
                              step="1.00"
                              min="0"
                              value={current.minimumFare}
                              onChange={(e) =>
                                setEditingPricing((prev) => ({
                                  ...prev,
                                  [vt]: { ...prev[vt], minimumFare: parseFloat(e.target.value) || 0 },
                                }))
                              }
                              className="w-full rounded-input border border-line bg-white pl-7 pr-3 py-2 text-xs font-bold text-ink focus:border-primary focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-ink-2 mb-1">
                            Passenger Capacity
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={current.passengerCapacity}
                            onChange={(e) =>
                              setEditingPricing((prev) => ({
                                ...prev,
                                [vt]: { ...prev[vt], passengerCapacity: parseInt(e.target.value, 10) || 1 },
                              }))
                            }
                            className="w-full rounded-input border border-line bg-white px-3 py-2 text-xs font-bold text-ink focus:border-primary focus:outline-none"
                          />
                        </div>

                        <div className="flex items-end">
                          <button
                            onClick={() => handleSavePricingTier(vt)}
                            disabled={isSaving}
                            className="flex w-full items-center justify-center gap-1.5 rounded-full bg-ink py-2 text-xs font-bold text-white shadow-card hover:bg-ink disabled:opacity-50"
                          >
                            <Save className="h-3.5 w-3.5" />
                            <span>{isSaving ? 'Saving...' : 'Save to Firestore'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* LIVE SIMULATOR BENCH */}
            <div className="rounded-card border border-line bg-white p-5 space-y-4">
              <div className="border-b border-line pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-primary-text" />
                  <div>
                    <h3 className="text-sm font-bold text-ink">Real-time Fare Simulator</h3>
                    <p className="text-[11px] text-ink-3">
                      Verify passenger estimated fares with minimum fare protection across all categories
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
                <div>
                  <label className="block text-xs font-bold text-ink-2 mb-1">
                    Trip Distance: <span className="text-ink font-bold">{simDistance} km</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    step="0.5"
                    value={simDistance}
                    onChange={(e) => setSimDistance(parseFloat(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-2 mb-1">
                    Trip Duration: <span className="text-ink font-bold">{simDuration} mins</span>
                  </label>
                  <input
                    type="range"
                    min="2"
                    max="90"
                    step="1"
                    value={simDuration}
                    onChange={(e) => setSimDuration(parseInt(e.target.value, 10))}
                    className="w-full accent-primary"
                  />
                </div>
              </div>

              {/* CALCULATED SIMULATOR TIERS */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                {ACTIVE_VEHICLE_TYPES.map((vt) => {
                  const conf = editingPricing[vt] || ZAKA_DEFAULT_LAUNCH_PRICING[vt];
                  const breakdown = fareService.calculateFareBreakdown(conf, simDistance, simDuration);

                  return (
                    <div
                      key={vt}
                      className="rounded-card border border-line bg-surface-2 p-3.5 space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-ink uppercase">{conf.name}</span>
                        {breakdown.isMinimumFareApplied && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">
                            MIN FARE
                          </span>
                        )}
                      </div>
                      <div className="text-xl font-bold text-ink">
                        {fareService.formatZAR(breakdown.totalFare)}
                      </div>
                      <div className="text-[11px] text-ink-3 space-y-0.5 pt-1 border-t border-line">
                        <div className="flex justify-between">
                          <span>Base:</span>
                          <span>{fareService.formatZAR(breakdown.baseFare)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Distance:</span>
                          <span>{fareService.formatZAR(breakdown.distanceFare)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Time:</span>
                          <span>{fareService.formatZAR(breakdown.timeFare)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: DRIVER COMPLIANCE & DOCUMENT INSPECTION */}
      {selectedDriverForReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-[20px] bg-white p-6 shadow-modal border border-line space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-line pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-card bg-primary text-ink font-bold text-lg shadow-card">
                  {selectedDriverForReview.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-ink">{selectedDriverForReview.name}</h3>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                        selectedDriverForReview.verificationStatus === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : selectedDriverForReview.verificationStatus === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {selectedDriverForReview.verificationStatus}
                    </span>
                  </div>
                  <p className="text-xs text-ink-3 mt-0.5">
                    ID: <span className="font-mono text-[11px]">{selectedDriverForReview.userId}</span> • Phone: {selectedDriverForReview.phone || 'N/A'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDriverForReview(null)}
                className="rounded-full p-1.5 text-neutral-400 hover:bg-surface-2 hover:text-ink-2 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Personal details: private record, never shown to passengers */}
            <div className="rounded-card border border-line bg-surface-2 p-3.5 text-xs space-y-2">
              <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block">
                Personal Details (Admin only)
              </span>
              {reviewDriverDetails === 'loading' ? (
                <p className="text-ink-3 italic">Loading...</p>
              ) : reviewDriverDetails ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-ink">
                  <div className="col-span-2 sm:col-span-4">
                    <span className="text-neutral-400 block text-[11px]">Home Address</span>
                    <span className="font-bold">{reviewDriverDetails.homeAddress || '—'}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[11px]">Date of Birth</span>
                    <span className="font-bold">{(reviewDriverDetails.dateOfBirth || '').replace(/-/g, '/') || '—'}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[11px]">Gender</span>
                    <span className="font-bold capitalize">{reviewDriverDetails.gender || '—'}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[11px]">Nationality</span>
                    <span className="font-bold">{reviewDriverDetails.nationality || '—'}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[11px]">ID / Passport Number</span>
                    <span className="font-mono font-bold">{reviewDriverDetails.idNumber || '—'}</span>
                  </div>
                </div>
              ) : (
                <p className="text-ink-3 italic">The driver has not submitted their personal details yet.</p>
              )}
            </div>

            {/* Vehicle Details Card */}
            <div className="rounded-card border border-line bg-surface-2 p-3.5 text-xs space-y-2">
              <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block">
                Registered Motor Vehicle
              </span>
              {selectedDriverForReview.vehicle ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-ink">
                  <div>
                    <span className="text-neutral-400 block text-[11px]">Make & Model</span>
                    <span className="font-bold">{selectedDriverForReview.vehicle.make} {selectedDriverForReview.vehicle.model}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[11px]">Registration</span>
                    <span className="font-mono font-bold">{selectedDriverForReview.vehicle.registrationNumber}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[11px]">Colour / Year</span>
                    <span className="font-bold">
                      {selectedDriverForReview.vehicle.colour}
                      {selectedDriverForReview.vehicle.year ? ` (${selectedDriverForReview.vehicle.year})` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[11px]">Category</span>
                    <span className="font-bold capitalize">{selectedDriverForReview.vehicle.vehicleType}</span>
                  </div>
                </div>
              ) : (
                <p className="text-ink-3 italic">No vehicle currently linked to this profile.</p>
              )}
            </div>

            {/* Rejection Reason Notice if previously rejected */}
            {selectedDriverForReview.verificationStatus === 'rejected' && selectedDriverForReview.rejectionReason && (
              <div className="rounded-card border border-red-200 bg-red-50 p-3.5 text-xs text-red-900 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">Current Rejection Reason:</span>
                  <p className="mt-0.5">{selectedDriverForReview.rejectionReason}</p>
                </div>
              </div>
            )}

            {/* Compliance Documents Checklist */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-ink uppercase tracking-wider">
                  Required Supporting Documents
                </h4>
                <span className="text-[11px] text-ink-3">Audit & verification checklist</span>
              </div>

              {[
                {
                  type: 'id-document' as DriverDocumentType,
                  title: 'ID Document',
                  fieldKey: 'idDocument' as const,
                  category: 'Driver Identity',
                  desc: 'RSA ID card / book, or passport with a valid permit',
                },
                {
                  type: 'proof-of-address' as DriverDocumentType,
                  title: 'Proof of Address',
                  fieldKey: 'proofOfAddress' as const,
                  category: 'Driver Identity',
                  desc: 'Utility bill, bank statement or lease, not older than 3 months',
                },
                {
                  type: 'drivers-license' as DriverDocumentType,
                  title: "Driver's Licence Card (Code B/EB)",
                  fieldKey: 'driversLicense' as const,
                  category: 'Driver Qualification',
                  desc: 'RSA driving licence card for motor vehicles',
                },
                {
                  type: 'prdp' as DriverDocumentType,
                  title: 'Professional Driving Permit (PrDP)',
                  fieldKey: 'prdp' as const,
                  category: 'Driver Compliance',
                  desc: 'Valid ' + 'P' + ' category passenger transport endorsement',
                },
                {
                  type: 'vehicle-registration' as DriverDocumentType,
                  title: 'Vehicle Registration Certificate (RC1)',
                  fieldKey: 'vehicleRegistration' as const,
                  category: 'Vehicle Documentation',
                  desc: 'NaTIS registered vehicle ownership/operator document',
                },
                {
                  type: 'proof-of-ownership' as DriverDocumentType,
                  title: 'Proof of Vehicle Ownership',
                  fieldKey: 'proofOfOwnership' as const,
                  category: 'Vehicle Documentation',
                  desc: 'Registration in the driver\'s name, finance agreement or owner\'s letter',
                },
                {
                  type: 'vehicle-inspection' as DriverDocumentType,
                  title: 'Roadworthy Inspection Certificate (COF)',
                  fieldKey: 'vehicleInspection' as const,
                  category: 'Vehicle Safety',
                  desc: 'DEKRA / AVTS safety inspection within past 12 months',
                },
                {
                  type: 'profile-photo' as DriverDocumentType,
                  title: 'Driver Profile Photo',
                  fieldKey: 'profilePhoto' as const,
                  category: 'Safety & Identification',
                  desc: 'Forward-facing headshot for passenger verification',
                },
              ].map((docSpec) => {
                const docsObj: any = selectedDriverForReview.verificationDocuments || {};
                const docData: DriverDocumentRecord | undefined = docsObj[docSpec.fieldKey];
                const status: DocumentStatus | 'missing' = docData?.status || 'missing';

                return (
                  <div
                    key={docSpec.type}
                    className="rounded-card border border-line bg-white p-3.5 space-y-2 hover:border-neutral-300 transition-all"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-ink-3" />
                          <h5 className="text-xs font-bold text-ink">{docSpec.title}</h5>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${
                              status === 'approved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : status === 'pending'
                                ? 'bg-amber-100 text-amber-800'
                                : status === 'rejected'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-surface-2 text-ink-3'
                            }`}
                          >
                            {status === 'approved'
                              ? 'Complete / Approved'
                              : status === 'pending'
                              ? 'Pending Review'
                              : status === 'rejected'
                              ? 'Rejected'
                              : 'Missing'}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-3 mt-0.5">{docSpec.desc}</p>
                      </div>

                      {/* Document Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {docData && (
                          <button
                            type="button"
                            onClick={() => handleOpenDocumentPreview(docData, docSpec.title)}
                            className="flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-ink hover:bg-surface-2 hover:border-neutral-300 transition-colors cursor-pointer"
                            title={`Preview ${docSpec.title}`}
                          >
                            <Eye className="h-3 w-3 text-ink-2" />
                            <span>Preview</span>
                          </button>
                        )}

                        {docData && status !== 'approved' && (
                          <button
                            type="button"
                            disabled={isUpdatingDoc}
                            onClick={() =>
                              handleReviewDocument(
                                selectedDriverForReview.userId,
                                docSpec.type,
                                'approved'
                              )
                            }
                            className="flex items-center gap-1 rounded-full bg-success px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                          >
                            <Check className="h-3 w-3" />
                            <span>Approve</span>
                          </button>
                        )}

                        {docData && status !== 'rejected' && (
                          <button
                            type="button"
                            disabled={isUpdatingDoc}
                            onClick={() =>
                              setRejectDocModal({
                                isOpen: true,
                                driverId: selectedDriverForReview.userId,
                                docType: docSpec.type,
                                title: docSpec.title,
                                reason: '',
                              })
                            }
                            className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-bold text-danger hover:bg-red-100 transition-colors disabled:opacity-50"
                          >
                            <X className="h-3 w-3" />
                            <span>Reject</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Rejection Note inside document card */}
                    {status === 'rejected' && docData?.rejectionReason && (
                      <div className="rounded-xl bg-red-50 p-2 text-[11px] text-red-800 border border-red-200">
                        <span className="font-bold">Rejection reason:</span> {docData.rejectionReason}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Overall Driver Decision Actions */}
            <div className="border-t border-line pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedDriverForReview(null)}
                className="w-full sm:w-auto rounded-full border border-line px-4 py-2 text-xs font-bold text-ink-2 hover:bg-surface-2 transition-colors"
              >
                Close Window
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() =>
                    setRejectDriverModal({
                      isOpen: true,
                      driverId: selectedDriverForReview.userId,
                      driverName: selectedDriverForReview.name,
                      reason: '',
                    })
                  }
                  className="w-full sm:w-auto rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-danger hover:bg-red-100 transition-colors"
                >
                  Reject Application
                </button>

                <button
                  type="button"
                  onClick={() => handleApproveDriver(selectedDriverForReview.userId)}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-full bg-success px-4 py-2 text-xs font-bold text-white shadow-card hover:bg-emerald-700 transition-colors"
                >
                  <Check className="h-4 w-4" />
                  <span>Approve Driver (Grant Online Access)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: REJECT DRIVER WITH REASON */}
      {rejectDriverModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-[20px] bg-white p-6 shadow-modal border border-line space-y-4">
            <div className="flex items-center gap-2.5 text-danger">
              <ShieldAlert className="h-6 w-6" />
              <h3 className="text-base font-bold text-ink">Reject Driver Application</h3>
            </div>

            <p className="text-xs text-ink-2 leading-relaxed">
              Please specify the compliance reason for rejecting <strong>{rejectDriverModal.driverName}</strong>. This feedback will be sent directly to the driver's notifications and recorded in the audit trail.
            </p>

            <div>
              <label className="block text-[11px] font-bold text-neutral-400 uppercase mb-1">
                Rejection Reason (Required)
              </label>
              <textarea
                rows={3}
                value={rejectDriverModal.reason}
                onChange={(e) =>
                  setRejectDriverModal((prev) => (prev ? { ...prev, reason: e.target.value } : null))
                }
                placeholder="e.g., Roadworthy inspection expired on 2025-11-01; PrDP certificate image unreadable..."
                className="w-full rounded-input border border-neutral-300 p-3 text-xs text-ink focus:border-red-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setRejectDriverModal(null)}
                className="rounded-full border border-line px-4 py-2 text-xs font-bold text-ink-2 hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!rejectDriverModal.reason.trim()}
                onClick={() => handleRejectDriver(rejectDriverModal.driverId, rejectDriverModal.reason)}
                className="rounded-full bg-danger px-4 py-2 text-xs font-bold text-white shadow-card hover:bg-red-700 disabled:opacity-50"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: REJECT SPECIFIC DOCUMENT WITH REASON */}
      {rejectDocModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-[20px] bg-white p-6 shadow-modal border border-line space-y-4">
            <div className="flex items-center gap-2.5 text-amber-700">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-base font-bold text-ink">Reject Document: {rejectDocModal.title}</h3>
            </div>

            <p className="text-xs text-ink-2 leading-relaxed">
              Specify what needs correction so the driver can upload an acceptable replacement.
            </p>

            <div>
              <label className="block text-[11px] font-bold text-neutral-400 uppercase mb-1">
                Correction Required (Required)
              </label>
              <textarea
                rows={3}
                value={rejectDocModal.reason}
                onChange={(e) =>
                  setRejectDocModal((prev) => (prev ? { ...prev, reason: e.target.value } : null))
                }
                placeholder="e.g., Image is blurry; document corners cut off; name does not match vehicle registration..."
                className="w-full rounded-input border border-neutral-300 p-3 text-xs text-ink focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setRejectDocModal(null)}
                className="rounded-full border border-line px-4 py-2 text-xs font-bold text-ink-2 hover:bg-surface-2 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!rejectDocModal.reason.trim() || isUpdatingDoc}
                onClick={() =>
                  handleReviewDocument(
                    rejectDocModal.driverId,
                    rejectDocModal.docType,
                    'rejected',
                    rejectDocModal.reason
                  )
                }
                className="rounded-full bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-card hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
              >
                {isUpdatingDoc ? 'Updating...' : 'Reject Document'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: ADMIN DRIVER COMPLIANCE DOCUMENT PREVIEW */}
      {/* PASSENGER IDENTITY REVIEW */}
      {reviewPassenger && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Passenger identity review"
          onClick={() => !reviewBusy && setReviewPassenger(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[20px] border border-line bg-white shadow-modal"
          >
            <div className="flex items-center justify-between border-b border-line p-5">
              <div>
                <h3 className="text-base font-bold text-ink">{reviewPassenger.name}</h3>
                <p className="text-[11px] text-ink-3">
                  Identity submission
                  {reviewPassenger.verificationSubmittedAt
                    ? ` • ${new Date(reviewPassenger.verificationSubmittedAt).toLocaleString()}`
                    : ''}
                  {' • '}
                  <span className="font-bold uppercase text-ink-2">{reviewPassenger.verificationStatus}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewPassenger(null)}
                aria-label="Close review"
                className="rounded-full p-1.5 text-neutral-400 hover:bg-surface-2 hover:text-ink cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-card border border-line bg-surface-2 p-4 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-[11px] text-ink-3">Date of Birth</dt>
                  <dd className="font-bold text-ink">{(reviewPassenger.dateOfBirth || '—').replace(/-/g, '/')}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-ink-3">Gender</dt>
                  <dd className="font-bold capitalize text-ink">{reviewPassenger.gender || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-ink-3">Nationality</dt>
                  <dd className="font-bold text-ink">{reviewPassenger.nationality || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-ink-3">ID / Passport Number</dt>
                  <dd className="font-mono font-bold text-ink">{reviewPassenger.idNumber || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-ink-3">Mobile Number</dt>
                  <dd className="font-bold text-ink">
                    {reviewPassenger.phone ? formatPhoneDisplay(normalizePhoneNumber(reviewPassenger.phone)) : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-ink-3">Number confirmed by SMS</dt>
                  <dd className={`font-bold ${reviewPassenger.phoneVerified ? 'text-success' : 'text-danger'}`}>
                    {reviewPassenger.phoneVerified ? 'Yes' : 'No'}
                  </dd>
                </div>
              </dl>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(['idDocument', 'selfie'] as PassengerVerificationImageKind[]).map((kind) => (
                  <div key={kind} className="space-y-1.5">
                    <span className="text-xs font-bold text-ink">{kind === 'idDocument' ? 'ID Document' : 'Live Photo'}</span>
                    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-card border border-line bg-surface-2">
                      {reviewImages[kind]?.dataUrl ? (
                        <button
                          type="button"
                          title="View full size"
                          onClick={() => setReviewZoomUrl(reviewImages[kind]?.dataUrl || null)}
                          className="h-full w-full cursor-zoom-in"
                        >
                          <img
                            src={reviewImages[kind]?.dataUrl}
                            alt={kind === 'idDocument' ? 'ID document' : 'Live photo'}
                            className="h-full w-full object-contain"
                          />
                        </button>
                      ) : (
                        <span className="text-[11px] text-ink-3">
                          {reviewImagesLoading ? 'Loading…' : 'Not available'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {reviewPassenger.verificationStatus === 'rejected' && reviewPassenger.rejectionReason && (
                <p className="rounded-card border border-red-200 bg-red-50 p-3 text-xs font-bold text-danger">
                  Previously rejected: {reviewPassenger.rejectionReason}
                </p>
              )}

              {reviewError && (
                <p role="alert" className="rounded-card border border-red-200 bg-red-50 p-3 text-xs font-bold text-danger">
                  {reviewError}
                </p>
              )}

              <div>
                <label htmlFor="passenger-reject-reason" className="mb-1 block text-xs font-bold text-ink">
                  Reason (required to reject or revoke, shown to the passenger)
                </label>
                <input
                  id="passenger-reject-reason"
                  type="text"
                  value={reviewRejectReason}
                  onChange={(e) => setReviewRejectReason(e.target.value)}
                  placeholder="e.g. The ID photo is blurred. Please upload a clearer one."
                  className="w-full rounded-input border border-line bg-surface-2 p-2.5 text-xs text-ink focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-line p-4">
              <button
                type="button"
                disabled={reviewBusy}
                onClick={() => handleReviewPassenger('rejected')}
                className="rounded-full border border-red-300 bg-white px-4 py-2.5 text-xs font-bold text-danger hover:bg-red-50 disabled:opacity-50 cursor-pointer"
              >
                {reviewPassenger.verificationStatus === 'approved' ? 'Revoke Approval' : 'Reject'}
              </button>
              {reviewPassenger.verificationStatus !== 'approved' && (
                <button
                  id="btn-approve-passenger"
                  type="button"
                  disabled={reviewBusy}
                  onClick={() => handleReviewPassenger('approved')}
                  className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-black disabled:opacity-50 cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  {reviewBusy ? 'Saving…' : 'Approve Passenger'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full-size view of a passenger verification photo */}
      {reviewZoomUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Verification photo"
          onClick={() => setReviewZoomUrl(null)}
          className="fixed inset-0 z-[60] flex cursor-zoom-out items-center justify-center bg-black/80 p-4"
        >
          <img src={reviewZoomUrl} alt="Verification photo, full size" className="max-h-full max-w-full rounded-card object-contain" />
        </div>
      )}

      {previewDocModal?.isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setPreviewDocModal(null);
              setPreviewDocError(null);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-5"
        >
          <div className="relative flex flex-col w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-[20px] bg-white shadow-modal border border-line animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-line px-5 py-4 bg-neutral-50/80">
              <div className="flex items-center gap-3 min-w-0">
                <div className="rounded-xl bg-ink p-2 text-white shrink-0">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="truncate">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-bold text-ink truncate">
                      {previewDocModal.title}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase shrink-0 ${
                        previewDocModal.doc.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : previewDocModal.doc.status === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : previewDocModal.doc.status === 'rejected'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-surface-2 text-ink-3'
                      }`}
                    >
                      {previewDocModal.doc.status === 'approved'
                        ? 'Approved'
                        : previewDocModal.doc.status === 'pending'
                        ? 'Pending Review'
                        : previewDocModal.doc.status === 'rejected'
                        ? 'Rejected'
                        : 'Uploaded'}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-3 truncate mt-0.5">
                    Driver: <span className="font-bold text-ink-2">{previewDocModal.driverName}</span>
                    {previewDocModal.doc.fileName ? (
                      <> • File: <span className="font-mono text-ink-2">{previewDocModal.doc.fileName}</span></>
                    ) : null}
                    {previewDocModal.doc.fileSizeBytes ? (
                      <> • {(previewDocModal.doc.fileSizeBytes / 1024).toFixed(1)} KB</>
                    ) : null}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setPreviewDocModal(null);
                    setPreviewDocError(null);
                  }}
                  className="rounded-full p-2 text-ink-3 hover:bg-neutral-200 transition-colors cursor-pointer"
                  title="Close preview (Esc)"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Body / Viewer */}
            <div className="relative flex-1 overflow-auto p-4 sm:p-6 bg-neutral-100/50 flex flex-col items-center justify-center min-h-[380px]">
              {previewDocLoading && !resolvedDocData ? (
                <div className="flex flex-col items-center justify-center p-12 space-y-3">
                  <RefreshCw className="h-8 w-8 animate-spin text-primary-text" />
                  <p className="text-xs font-bold text-ink-2">Retrieving compliance document...</p>
                </div>
              ) : previewDocError ? (
                <div className="rounded-card border border-red-200 bg-red-50 p-6 max-w-md w-full text-center space-y-3 ">
                  <AlertTriangle className="h-10 w-10 text-danger mx-auto" />
                  <h4 className="text-sm font-bold text-red-900">Unable to load this document</h4>
                  <p className="text-xs text-danger leading-relaxed">
                    {previewDocError}
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleRetryDocumentPreview}
                      className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3.5 py-2 text-xs font-bold text-danger hover:bg-red-100 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Retry</span>
                    </button>
                    {resolvedDocData?.url && (
                      <a
                        href={resolvedDocData.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-3.5 py-2 text-xs font-bold text-white hover:bg-ink transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-primary-text" />
                        <span>Open in New Tab</span>
                      </a>
                    )}
                  </div>
                </div>
              ) : resolvedDocData?.isPdf ? (
                <div className="w-full h-full flex flex-col items-center">
                  <object
                    data={resolvedDocData.url}
                    type="application/pdf"
                    className="w-full h-[62vh] rounded-card border border-neutral-300 bg-white "
                  >
                    <iframe
                      src={resolvedDocData.url}
                      title={previewDocModal.title}
                      className="w-full h-[62vh] rounded-card border border-neutral-300 bg-white "
                      onError={() => {
                        setPreviewDocError('The PDF document could not be embedded directly. You can open it in a separate tab or download it.');
                      }}
                    >
                      <div className="p-8 text-center space-y-3">
                        <FileText className="h-12 w-12 text-neutral-400 mx-auto" />
                        <p className="text-xs font-bold text-ink-2">PDF preview is not supported directly in this frame.</p>
                        <a
                          href={resolvedDocData.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-3.5 py-2 text-xs font-bold text-white hover:bg-ink transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-primary-text" />
                          <span>Open PDF in New Tab</span>
                        </a>
                      </div>
                    </iframe>
                  </object>
                </div>
              ) : resolvedDocData ? (
                <div className="relative flex items-center justify-center w-full max-h-[66vh] overflow-auto rounded-card bg-neutral-900/5 p-2 sm:p-4 border border-neutral-200/60">
                  <img
                    src={resolvedDocData.url}
                    alt={previewDocModal.title}
                    className="max-h-[62vh] max-w-full rounded-xl object-contain shadow-card transition-all"
                    onLoad={() => setPreviewDocLoading(false)}
                    onError={() => {
                      setPreviewDocLoading(false);
                      setPreviewDocError('Unable to load document image. File format might be corrupted or inaccessible.');
                    }}
                  />
                </div>
              ) : null}
            </div>

            {/* Modal Footer with Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-line px-5 py-3.5 bg-white">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {resolvedDocData?.url && (
                  <>
                    <a
                      href={resolvedDocData.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-2 px-3.5 py-2 text-xs font-bold text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-ink-3" />
                      <span>Open in New Tab</span>
                    </a>
                    <a
                      href={resolvedDocData.url}
                      download={resolvedDocData.fileName || previewDocModal.doc.fileName || 'compliance_document'}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-2 px-3.5 py-2 text-xs font-bold text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors"
                    >
                      <Download className="h-3.5 w-3.5 text-ink-3" />
                      <span>Download</span>
                    </a>
                  </>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
                {previewDocModal.doc.status !== 'approved' && (
                  <button
                    type="button"
                    disabled={isUpdatingDoc}
                    onClick={async () => {
                      await handleReviewDocument(
                        previewDocModal.driverId,
                        previewDocModal.doc.documentType,
                        'approved'
                      );
                      setPreviewDocModal((prev) =>
                        prev ? { ...prev, doc: { ...prev.doc, status: 'approved' } } : null
                      );
                    }}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-full bg-success px-4 py-2 text-xs font-bold text-white shadow-card hover:bg-emerald-700 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Approve Document</span>
                  </button>
                )}

                {previewDocModal.doc.status !== 'rejected' && (
                  <button
                    type="button"
                    disabled={isUpdatingDoc}
                    onClick={() => {
                      const docToReject = previewDocModal;
                      setPreviewDocModal(null);
                      setResolvedDocData(null);
                      setRejectDocModal({
                        isOpen: true,
                        driverId: docToReject.driverId,
                        docType: docToReject.doc.documentType,
                        title: docToReject.title,
                        reason: '',
                      });
                    }}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-danger hover:bg-red-100 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Reject Document</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setPreviewDocModal(null);
                    setPreviewDocError(null);
                    setResolvedDocData(null);
                  }}
                  className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-xs font-bold text-ink-2 hover:bg-surface-2 transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
