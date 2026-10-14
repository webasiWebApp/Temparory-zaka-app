/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Driver Application Page
 * The driver's personal details, vehicle and supporting documents (ID, proof of address, Driver's
 * Licence, PrDP, RC1, proof of ownership, Roadworthy Certificate) with upload progress and review status.
 * Shown full screen until ZAKA Admin approves the driver, and under "Application" in the driver
 * console afterwards.
 */

import React, { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { firestoreService } from '../../firebase/firestoreService';
import { storageService, DOCUMENT_TITLES } from '../../firebase/storageService';
import { DriverDocumentType, DriverDocumentRecord, DocumentStatus, DRIVER_DOCUMENT_FIELD_KEYS } from '../../types';
import { DriverApplicationDetails } from './DriverApplicationDetails';
import { resolveDocumentUrl, ResolvedDocument } from '../../utils/documentUtils';
import {
  Clock,
  Shield,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Car,
  RefreshCw,
  ArrowRight,
  User,
  LogOut,
  Sparkles,
  Upload,
  FileText,
  Eye,
  X,
  FileCheck,
  AlertCircle,
  Mail,
} from 'lucide-react';

export type UploadPhase = 'IDLE' | 'SELECTED' | 'VALIDATING' | 'UPLOADING' | 'UPLOADED' | 'FAILED';

export interface DocUploadState {
  phase: UploadPhase;
  progress: number;
  fileName?: string;
  error?: string;
}

const REQUIRED_DOCS: {
  type: DriverDocumentType;
  title: string;
  description: string;
  category: 'Driver' | 'Vehicle';
}[] = [
  {
    type: 'id-document',
    title: 'ID Document',
    description: 'South African ID card (both sides), green ID book, or passport photo page with a valid permit.',
    category: 'Driver',
  },
  {
    type: 'proof-of-address',
    title: 'Proof of Address',
    description: 'Utility bill, bank statement or lease in your name, not older than 3 months.',
    category: 'Driver',
  },
  {
    type: 'drivers-license',
    title: "Driver's Licence Card",
    description: 'Valid South African code B, EB, or higher driver licence card (front and back).',
    category: 'Driver',
  },
  {
    type: 'prdp',
    title: 'Professional Driving Permit (PrDP)',
    description: 'Category G or P Professional Driving Permit issued by traffic authority.',
    category: 'Driver',
  },
  {
    type: 'vehicle-registration',
    title: 'Vehicle Registration (RC1)',
    description: 'NaTIS certificate of registration (RC1) or the current licence disc for the vehicle.',
    category: 'Vehicle',
  },
  {
    type: 'proof-of-ownership',
    title: 'Proof of Vehicle Ownership',
    description: 'Registration in your name, a finance agreement, or a signed letter from the owner allowing you to use the vehicle.',
    category: 'Vehicle',
  },
  {
    type: 'vehicle-inspection',
    title: 'Roadworthy Inspection Certificate',
    description: 'Annual DEKRA or AVTS 100-point roadworthy compliance inspection sheet.',
    category: 'Vehicle',
  },
  {
    type: 'profile-photo',
    title: 'Driver Profile Photo',
    description: 'Clear, front-facing portrait photograph against a plain background for passenger identification.',
    category: 'Driver',
  },
];

interface DriverPendingScreenProps {
  // Shown inside the driver console (approved drivers): no page frame, sign-out or email banner
  embedded?: boolean;
}

export const DriverPendingScreen: React.FC<DriverPendingScreenProps> = ({ embedded = false }) => {
  const {
    currentUser,
    userProfile,
    driverProfile,
    isEmailVerified,
    sendVerificationEmail,
    checkEmailVerification,
    setActiveRole,
    refreshProfiles,
    isSigningOut,
    signOut,
  } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [uploadStates, setUploadStates] = useState<Record<string, DocUploadState>>({});
  const [previewDoc, setPreviewDoc] = useState<DriverDocumentRecord | null>(null);
  const [resolvedPreview, setResolvedPreview] = useState<ResolvedDocument | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [activeUploadingDoc, setActiveUploadingDoc] = useState<DriverDocumentType | null>(null);

  const handleOpenPreview = async (rec: DriverDocumentRecord) => {
    setPreviewDoc(rec);
    setPreviewError(null);
    setPreviewLoading(true);
    setResolvedPreview(null);
    try {
      const res = await resolveDocumentUrl(rec);
      setResolvedPreview(res);
    } catch (e: any) {
      setPreviewError(e?.message || 'Unable to load preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Guard against any lingering scroll-lock or overflow-hidden on body/html
  React.useEffect(() => {
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    const resetScrollLock = () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
    window.addEventListener('resize', resetScrollLock);
    return () => {
      window.removeEventListener('resize', resetScrollLock);
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, []);

  // Keyboard accessibility and escape listener for document preview modal
  React.useEffect(() => {
    if (!previewDoc) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewDoc(null);
        setResolvedPreview(null);
        setPreviewError(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewDoc]);

  // Email verification actions and state
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendFeedback, setResendFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleResendEmail = async () => {
    if (isResendingEmail || resendCooldown > 0) return;
    setIsResendingEmail(true);
    setResendFeedback(null);
    try {
      await sendVerificationEmail();
      setResendFeedback({
        type: 'success',
        message: 'A fresh verification link has been sent to your email inbox.',
      });
      setResendCooldown(60);
    } catch (err: any) {
      setResendFeedback({
        type: 'error',
        message: err?.message || 'Failed to resend verification email. Please try again in a moment.',
      });
    } finally {
      setIsResendingEmail(false);
    }
  };

  const handleCheckEmailStatus = async () => {
    setIsCheckingEmail(true);
    setResendFeedback(null);
    try {
      const verified = await checkEmailVerification();
      if (verified) {
        setResendFeedback({
          type: 'success',
          message: 'Email verified successfully! Your account is verified.',
        });
      } else {
        setResendFeedback({
          type: 'error',
          message: 'Your email has not been verified yet. Please check your inbox and click the verification link.',
        });
      }
    } catch (err: any) {
      setResendFeedback({
        type: 'error',
        message: err?.message || 'Could not verify status. Please try again.',
      });
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshProfiles();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const handleFileUpload = async (docType: DriverDocumentType, file: File) => {
    if (!userProfile?.uid) return;

    setActiveUploadingDoc(docType);

    // Reset input value so re-selecting the exact same file works
    if (fileInputRefs.current[docType]) {
      fileInputRefs.current[docType]!.value = '';
    }

    try {
      // Phase 1: SELECTED
      setUploadStates((prev) => ({
        ...prev,
        [docType]: { phase: 'SELECTED', progress: 0, fileName: file.name },
      }));

      // Phase 2: VALIDATING (validates MIME, size, emptiness before starting upload)
      const validation = storageService.validateFile(file);
      if (!validation.valid) {
        setUploadStates((prev) => ({
          ...prev,
          [docType]: {
            phase: 'FAILED',
            progress: 0,
            fileName: file.name,
            error: validation.error || 'Invalid file format or size.',
          },
        }));
        return;
      }

      // Phase 3: UPLOADING (begins real stream)
      setUploadStates((prev) => ({
        ...prev,
        [docType]: { phase: 'UPLOADING', progress: 10, fileName: file.name, error: undefined },
      }));

      const uploadRes = await storageService.uploadDriverDocument(
        userProfile.uid,
        docType,
        file,
        (percent) => {
          setUploadStates((prev) => ({
            ...prev,
            [docType]: {
              phase: 'UPLOADING',
              progress: Math.max(10, Math.min(percent, 99)),
              fileName: file.name,
            },
          }));
        }
      );

      const record: DriverDocumentRecord = {
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        documentType: docType,
        title: DOCUMENT_TITLES[docType] || docType,
        fileUrl: uploadRes.fileUrl,
        storagePath: uploadRes.storagePath,
        fileName: uploadRes.fileName,
        fileSizeBytes: uploadRes.fileSizeBytes,
        fileType: uploadRes.fileType,
        status: 'pending',
        uploadedAt: new Date().toISOString(),
      };

      await firestoreService.saveDriverDocument(userProfile.uid, record);
      await refreshProfiles();

      // Phase 4: UPLOADED
      setUploadStates((prev) => ({
        ...prev,
        [docType]: { phase: 'UPLOADED', progress: 100, fileName: file.name },
      }));

      // Automatically transition to IDLE after 3 seconds so the card is clean
      setTimeout(() => {
        setUploadStates((prev) => {
          if (prev[docType]?.phase === 'UPLOADED') {
            return {
              ...prev,
              [docType]: { phase: 'IDLE', progress: 0 },
            };
          }
          return prev;
        });
      }, 3000);
    } catch (err: any) {
      console.error('Failed document upload:', err);
      // Phase 5: FAILED
      setUploadStates((prev) => ({
        ...prev,
        [docType]: {
          phase: 'FAILED',
          progress: 0,
          fileName: file.name,
          error: err?.message || 'Upload failed. Please verify your connection and try again.',
        },
      }));
    } finally {
      // ALWAYS release upload lock and scroll locks unconditionally
      setActiveUploadingDoc(null);
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
  };

  const isRejected = driverProfile?.verificationStatus === 'rejected';
  const isApproved = driverProfile?.verificationStatus === 'approved';
  const docs = driverProfile?.verificationDocuments || {};

  // Count uploaded and approved docs
  const keyMap = DRIVER_DOCUMENT_FIELD_KEYS;

  const uploadedCount = REQUIRED_DOCS.filter(
    (rd) => !!docs[keyMap[rd.type]]
  ).length;

  return (
    <div
      id="driver-pending-scroll-container"
      className={
        embedded
          ? 'relative w-full'
          : 'relative flex-1 w-full h-full min-h-0 overflow-y-auto overscroll-contain bg-white p-3 sm:p-6 py-6 sm:py-8'
      }
    >
      <div
        className={
          embedded
            ? 'w-full space-y-4'
            : 'mx-auto w-full max-w-2xl space-y-5 rounded-card border border-line bg-white p-5 shadow-raised sm:p-8'
        }
      >
        {/* Email Verification Banner */}
        {!embedded && !isEmailVerified && (
          <div className="rounded-card border border-amber-300 bg-amber-50/90 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary shadow-card">
                <Mail className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
                    Verification email sent
                  </h3>
                  <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[11px] font-bold text-amber-950 uppercase">
                    Action Required
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-2 leading-relaxed font-medium">
                  Please check your email (<span className="font-bold text-ink">{currentUser?.email || userProfile?.email || 'your registered email'}</span>) and verify your email address.
                </p>
                {resendFeedback && (
                  <p
                    className={`mt-1.5 text-xs font-semibold ${
                      resendFeedback.type === 'success' ? 'text-success' : 'text-danger'
                    }`}
                  >
                    {resendFeedback.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-200/80">
              <button
                type="button"
                onClick={handleResendEmail}
                disabled={isResendingEmail || resendCooldown > 0}
                className="flex items-center gap-1.5 rounded-full bg-white border border-amber-300 px-3 py-1.5 text-xs font-bold text-ink hover:bg-surface-2 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isResendingEmail ? 'animate-spin' : ''}`} />
                <span>
                  {isResendingEmail
                    ? 'Sending...'
                    : resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : 'Resend verification email'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleCheckEmailStatus}
                disabled={isCheckingEmail}
                className="flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-white shadow-card hover:bg-ink active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-primary-text" />
                <span>{isCheckingEmail ? 'Checking...' : "I've verified my email"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Header Icon & Status */}
        <div className="text-center space-y-2">
          <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
            {isRejected ? (
              <div className="flex h-16 w-16 items-center justify-center rounded-card bg-red-100 text-danger">
                <AlertTriangle className="h-8 w-8" />
              </div>
            ) : isApproved ? (
              <div className="flex h-16 w-16 items-center justify-center rounded-card bg-emerald-100 text-success">
                <ShieldCheck className="h-8 w-8" />
              </div>
            ) : (
              <>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-card bg-amber-300/40" />
                <div className="flex h-16 w-16 items-center justify-center rounded-card bg-primary text-ink shadow-card">
                  <Clock className="h-8 w-8 text-ink" />
                </div>
              </>
            )}
          </div>

          <div>
            <span
              className={`inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${
                isRejected
                  ? 'bg-red-100 text-red-800 border border-red-200'
                  : isApproved
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-amber-100 text-amber-900 border border-amber-200'
              }`}
            >
              {isRejected
                ? 'Application Status: Requires Attention'
                : isApproved
                ? 'Application Status: Approved'
                : 'Application Status: In Verification'}
            </span>
            <h2 className="mt-2 text-xl font-bold text-ink">
              {isRejected ? 'Driver Application Not Approved' : 'Driver Application'}
            </h2>
            <p className="mt-1 text-xs text-ink-2 leading-relaxed max-w-lg mx-auto">
              {isRejected
                ? (driverProfile?.rejectionReason || 'Our fleet compliance team could not verify some of your details. Review the documents below or re-upload clearer photos.')
                : isApproved
                ? 'Your application is approved. Your details and documents are kept here; upload a new copy when a document expires.'
                : 'Welcome to ZAKA! To drive with us, complete your personal details, confirm your vehicle and upload the supporting documents below. ZAKA Admin reviews every application before you can go online.'}
            </p>
          </div>
        </div>

        {/* Personal details and vehicle */}
        <DriverApplicationDetails />

        {/* Documents Upload Section */}
        <div className="space-y-3 rounded-card border border-line bg-white p-4">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-ink">
                Required Verification Documents
              </span>
              <p className="text-[11px] text-ink-3">Accepted formats: PDF, JPG, PNG, WEBP (Max 10MB)</p>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-surface-2 text-ink-2">
              {uploadedCount} of {REQUIRED_DOCS.length} Uploaded
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 pt-1">
            {REQUIRED_DOCS.map((docItem) => {
              const field = keyMap[docItem.type];
              const existingRecord: DriverDocumentRecord | undefined = docs[field];
              const state: DocUploadState = uploadStates[docItem.type] || { phase: 'IDLE', progress: 0 };
              const isDocApproved = existingRecord?.status === 'approved';
              const isDocRejected = existingRecord?.status === 'rejected';
              const isBusy = state.phase === 'VALIDATING' || state.phase === 'UPLOADING';

              return (
                <div
                  key={docItem.type}
                  className="rounded-xl border border-line p-3.5 hover:border-neutral-300 transition-colors bg-surface-2"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          isDocApproved
                            ? 'bg-emerald-100 text-success'
                            : isDocRejected
                            ? 'bg-red-100 text-danger'
                            : existingRecord
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-surface-2 text-ink-3'
                        }`}
                      >
                        {isDocApproved ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : isDocRejected ? (
                          <AlertCircle className="h-4 w-4" />
                        ) : existingRecord ? (
                          <FileCheck className="h-4 w-4" />
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-ink">{docItem.title}</h4>
                          <span
                            className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                              isDocApproved
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : isDocRejected
                                ? 'bg-red-100 text-red-800 border-red-300'
                                : existingRecord
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : 'bg-surface-2 text-ink-2 border-neutral-300'
                            }`}
                          >
                            {isDocApproved
                              ? 'Complete'
                              : isDocRejected
                              ? 'Rejected'
                              : existingRecord
                              ? 'Pending'
                              : 'Missing'}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-3 line-clamp-1">{docItem.description}</p>
                        {existingRecord && (
                          <p className="text-[11px] text-neutral-400 mt-0.5">
                            Uploaded: {existingRecord.fileName} •{' '}
                            {existingRecord.fileSizeBytes
                              ? `${(existingRecord.fileSizeBytes / 1024).toFixed(0)} KB`
                              : 'File attached'}
                          </p>
                        )}
                        {isDocRejected && existingRecord.rejectionReason && (
                          <p className="text-[11px] font-bold text-danger mt-1">
                            Reason: {existingRecord.rejectionReason}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {existingRecord?.fileUrl && (
                        <button
                          type="button"
                          onClick={() => handleOpenPreview(existingRecord)}
                          className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1.5 text-[11px] font-bold text-ink-2 hover:bg-surface-2 cursor-pointer"
                          title="Preview Document"
                        >
                          <Eye className="h-3 w-3" />
                          <span>View</span>
                        </button>
                      )}

                      <input
                        type="file"
                        ref={(el) => {
                          fileInputRefs.current[docItem.type] = el;
                        }}
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(docItem.type, file);
                        }}
                      />

                      <button
                        onClick={() => fileInputRefs.current[docItem.type]?.click()}
                        disabled={isBusy}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold shadow-card transition-all ${
                          isBusy
                            ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                            : existingRecord
                            ? 'border border-line bg-white text-ink hover:bg-surface-2'
                            : 'bg-primary text-ink hover:bg-primary-hover active:bg-primary-pressed'
                        }`}
                      >
                        <Upload className="h-3 w-3" />
                        <span>{isBusy ? 'Processing...' : existingRecord ? 'Replace' : 'Upload'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Phase 1: Selected */}
                  {state.phase === 'SELECTED' && (
                    <div className="mt-2.5 flex items-center justify-between rounded-xl bg-blue-50 p-2 text-[11px] font-bold text-blue-900 border border-blue-200">
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                        <span className="truncate">Selected: {state.fileName || 'Document'}</span>
                      </div>
                      <span className="text-[11px] text-blue-600 font-semibold shrink-0">Selected</span>
                    </div>
                  )}

                  {/* Phase 2: Validating */}
                  {state.phase === 'VALIDATING' && (
                    <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-amber-50 p-2 text-[11px] font-bold text-amber-800 border border-amber-200">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-600" />
                      <span>Validating document format and size (max 10MB)...</span>
                    </div>
                  )}

                  {/* Phase 3: Real Upload Progress */}
                  {state.phase === 'UPLOADING' && (
                    <div className="mt-2.5 space-y-1">
                      <div className="flex justify-between text-[11px] text-ink-2">
                        <span className="font-semibold">Uploading to secure Firebase Storage...</span>
                        <span className="font-bold">{state.progress}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                        <div
                          className="h-full bg-primary transition-all duration-150"
                          style={{ width: `${Math.max(state.progress, 5)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Phase 4: Uploaded confirmation */}
                  {state.phase === 'UPLOADED' && (
                    <div className="mt-2 flex items-center gap-1.5 rounded-xl bg-emerald-50 p-2 text-[11px] font-bold text-emerald-800 border border-emerald-200">
                      <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                      <span>Document uploaded successfully to Firebase Storage.</span>
                    </div>
                  )}

                  {/* Phase 5: Failed with clear error and retry */}
                  {state.phase === 'FAILED' && state.error && (
                    <div className="mt-2 rounded-xl bg-red-50 p-2.5 border border-red-200 space-y-1.5">
                      <div className="flex items-start gap-2 text-[11px] font-bold text-danger">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-danger mt-0.5" />
                        <span className="flex-1">{state.error}</span>
                      </div>
                      <div className="flex items-center gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => fileInputRefs.current[docItem.type]?.click()}
                          className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-danger border border-red-300 hover:bg-red-50"
                        >
                          <RefreshCw className="h-3 w-3" />
                          <span>Retry Upload</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setUploadStates((prev) => ({
                              ...prev,
                              [docItem.type]: { phase: 'IDLE', progress: 0 },
                            }))
                          }
                          className="text-[11px] font-bold text-ink-3 hover:text-ink-2"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          {/* Refresh status */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-line bg-surface-2 py-3 text-xs font-bold text-ink hover:bg-surface-2 transition-all active:scale-[0.99]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Checking Status with Firestore...' : 'Refresh Status'}</span>
          </button>
        </div>

        {/* Footer info & Logout */}
        {signOutError && (
          <div className="text-xs text-danger bg-red-50 p-2 rounded-xl text-center font-bold">
            {signOutError}
          </div>
        )}
        {!embedded && (
          <div className="flex items-center justify-between border-t border-line pt-3 text-xs text-ink-3">
            <span>Logged in as {userProfile?.name || 'Driver'}</span>
            <button
              disabled={isSigningOut}
              onClick={async () => {
                try {
                  setSignOutError(null);
                  await signOut();
                } catch (err: any) {
                  setSignOutError(err?.message || 'Failed to sign out.');
                }
              }}
              className="flex items-center gap-1 font-bold text-danger hover:underline disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>{isSigningOut ? 'Signing Out...' : 'Sign Out'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Document Preview Modal */}
      {previewDoc && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setPreviewDoc(null);
              setResolvedPreview(null);
              setPreviewError(null);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
        >
          <div className="relative max-h-[90dvh] w-full max-w-2xl overflow-hidden rounded-[20px] bg-white shadow-modal flex flex-col">
            <div className="flex items-center justify-between border-b border-line p-4">
              <div>
                <h3 className="text-sm font-bold text-ink">{previewDoc.title}</h3>
                <p className="text-[11px] text-ink-3">{resolvedPreview?.fileName || previewDoc.fileName}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviewDoc(null);
                  setResolvedPreview(null);
                  setPreviewError(null);
                }}
                className="rounded-full p-1.5 text-ink-3 hover:bg-surface-2 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-surface-2 min-h-[300px]">
              {previewLoading && !resolvedPreview ? (
                <div className="flex flex-col items-center gap-2 p-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-primary-text" />
                  <span className="text-xs font-semibold text-ink-2">Loading document...</span>
                </div>
              ) : previewError ? (
                <div className="text-center p-6 space-y-3">
                  <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
                  <p className="text-xs text-danger font-bold">{previewError}</p>
                  <button
                    type="button"
                    onClick={() => handleOpenPreview(previewDoc)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-bold text-ink-2 hover:bg-surface-2"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Retry</span>
                  </button>
                </div>
              ) : resolvedPreview?.isPdf ? (
                <div className="w-full h-full flex flex-col items-center">
                  <object
                    data={resolvedPreview.url}
                    type="application/pdf"
                    className="w-full h-[55vh] rounded-xl border border-neutral-300 bg-white "
                  >
                    <div className="text-center space-y-3 p-6">
                      <FileText className="h-16 w-16 text-neutral-400 mx-auto" />
                      <p className="text-xs font-bold text-ink-2">PDF Document Attached</p>
                      <a
                        href={resolvedPreview.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-xs font-bold text-white shadow-card hover:bg-ink"
                      >
                        <span>Open in New Tab</span>
                        <ArrowRight className="h-3.5 w-3.5 text-primary-text" />
                      </a>
                    </div>
                  </object>
                </div>
              ) : resolvedPreview ? (
                <img
                  src={resolvedPreview.url}
                  alt={previewDoc.title}
                  className="max-h-[60vh] max-w-full rounded-xl object-contain shadow-card"
                  onError={() => setPreviewError('Unable to display image. The file may be corrupt or inaccessible.')}
                />
              ) : null}
            </div>
            {resolvedPreview?.url && (
              <div className="flex items-center justify-between border-t border-line px-4 py-3 bg-white">
                <a
                  href={resolvedPreview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-2 hover:text-ink"
                >
                  <ArrowRight className="h-3.5 w-3.5 text-primary-text" />
                  <span>Open in New Tab</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewDoc(null);
                    setResolvedPreview(null);
                    setPreviewError(null);
                  }}
                  className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-bold text-ink-2 hover:bg-surface-2 cursor-pointer"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
