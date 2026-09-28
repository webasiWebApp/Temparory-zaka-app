/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Firebase Storage Service
 * Handles driver verification document uploads, validations, progress tracking, and metadata refs
 */

import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  UploadTaskSnapshot,
} from 'firebase/storage';
import { storage, auth } from './config';
import { DriverDocumentType, DriverDocumentRecord } from '../types';
import firebaseConfigData from '../../firebase-applet-config.json';

export interface UploadProgressCallback {
  (progressPercent: number, bytesTransferred: number, totalBytes: number): void;
}

export interface UploadDocumentResult {
  fileUrl: string;
  storagePath: string;
  fileName: string;
  fileSizeBytes: number;
  fileType: string;
}

// Permitted MIME types for South African driver/vehicle verification
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB max
const FIREBASE_UPLOAD_TIMEOUT_MS = 15000; // 15s watchdog

// Standardized mapping of required driver compliance document types
export const DOCUMENT_TYPE_MAP = {
  DRIVERS_LICENSE: 'drivers-license',
  PRDP: 'prdp',
  VEHICLE_RC1: 'vehicle-registration',
  ROADWORTHY: 'vehicle-inspection',
  DRIVER_PROFILE_PHOTO: 'profile-photo',
} as const;

export const DOCUMENT_TITLES: Record<DriverDocumentType, string> = {
  'drivers-license': "Driver's Licence Card",
  'prdp': 'Professional Driving Permit (PrDP)',
  'vehicle-registration': 'Vehicle Registration Certificate (RC1)',
  'vehicle-inspection': 'Vehicle Roadworthy Inspection Certificate',
  'profile-photo': 'Driver Profile Photo',
  'operating-license': 'Operating Licence / PRE Permit',
};

// Fast reachability cache for Firebase Storage bucket
let cachedBucketAvailable: boolean | null = null;
async function isFirebaseBucketAvailable(): Promise<boolean> {
  if (cachedBucketAvailable !== null) return cachedBucketAvailable;
  try {
    const bucket = firebaseConfigData.storageBucket || 'zaka-e-hailing.firebasestorage.app';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);
    // 404 indicates bucket is not provisioned on Google Cloud
    cachedBucketAvailable = res.status !== 404;
    return cachedBucketAvailable;
  } catch {
    cachedBucketAvailable = false;
    return false;
  }
}

export const storageService = {
  /**
   * Validates a candidate file before attempting upload
   */
  validateFile(file: File): { valid: boolean; error?: string } {
    if (!file) {
      return { valid: false, error: 'No file selected. Please choose a file to upload.' };
    }

    if (file.size === 0) {
      return {
        valid: false,
        error: 'The selected file is empty (0 bytes). Please choose a valid document.',
      };
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      return {
        valid: false,
        error: `File is too large (${sizeMb} MB). Maximum allowed size is 10 MB.`,
      };
    }

    const fileExt = (file.name.split('.').pop() || '').toLowerCase();
    const hasValidExt = ALLOWED_EXTENSIONS.includes(fileExt);
    const hasValidMime = ALLOWED_MIME_TYPES.includes(file.type);

    if (!hasValidMime && !hasValidExt) {
      return {
        valid: false,
        error: `Unsupported file type (${file.type || fileExt || 'unknown'}). Allowed formats: PDF, PNG, JPG, or WEBP.`,
      };
    }

    return { valid: true };
  },

  /**
   * Uploads via server-side storage endpoint with native XMLHttpRequest progress reporting
   */
  uploadViaServer(
    driverId: string,
    documentType: DriverDocumentType,
    file: File,
    onProgress?: UploadProgressCallback
  ): Promise<UploadDocumentResult> {
    return new Promise<UploadDocumentResult>((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => {
        reject(new Error('Failed to read the file for upload. Please select the file again.'));
      };

      reader.onload = () => {
        const base64Data = reader.result as string;

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/driver/upload-document');
        xhr.setRequestHeader('Content-Type', 'application/json');

        if (xhr.upload && onProgress) {
          xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable && evt.total > 0) {
              const percent = Math.min(Math.round((evt.loaded / evt.total) * 100), 99);
              onProgress(percent, evt.loaded, evt.total);
            }
          };
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const res = JSON.parse(xhr.responseText);
              if (res.success) {
                if (onProgress) {
                  onProgress(100, file.size, file.size);
                }
                resolve({
                  fileUrl: res.fileUrl,
                  storagePath: res.storagePath,
                  fileName: res.fileName,
                  fileSizeBytes: res.fileSizeBytes,
                  fileType: res.fileType,
                });
                return;
              }
              reject(new Error(res.error || 'Server rejected document upload.'));
            } catch {
              reject(new Error('Invalid response from upload server.'));
            }
          } else {
            let errorMsg = `Upload failed with HTTP ${xhr.status}`;
            try {
              const errRes = JSON.parse(xhr.responseText);
              if (errRes.error) errorMsg = errRes.error;
            } catch {}
            reject(new Error(errorMsg));
          }
        };

        xhr.onerror = () => {
          reject(new Error('Network connection error during document upload. Please retry.'));
        };

        xhr.ontimeout = () => {
          reject(new Error('Upload timed out. Please check your network connection and retry.'));
        };

        // Generous 45-second timeout for large files on mobile networks
        xhr.timeout = 45000;

        xhr.send(
          JSON.stringify({
            driverId,
            documentType,
            fileName: file.name,
            fileType: file.type,
            fileData: base64Data,
          })
        );
      };

      reader.readAsDataURL(file);
    });
  },

  /**
   * Uploads directly to Firebase Cloud Storage via uploadBytesResumable
   */
  uploadViaFirebaseStorage(
    driverId: string,
    documentType: DriverDocumentType,
    file: File,
    onProgress?: UploadProgressCallback
  ): Promise<UploadDocumentResult> {
    const fileExt = (file.name.split('.').pop() || (file.type === 'application/pdf' ? 'pdf' : 'jpg')).toLowerCase();
    const timestamp = Date.now();
    const storagePath =
      documentType === 'profile-photo'
        ? `drivers/${driverId}/profile-photo`
        : `drivers/${driverId}/documents/${documentType}_${timestamp}.${fileExt}`;

    const storageRef = ref(storage, storagePath);
    const metadata = {
      contentType: file.type || (fileExt === 'pdf' ? 'application/pdf' : 'image/jpeg'),
      customMetadata: {
        driverId,
        documentType,
        originalName: file.name,
        uploadedBy: auth.currentUser?.uid || driverId,
        uploadedAt: new Date().toISOString(),
      },
    };

    const uploadTask = uploadBytesResumable(storageRef, file, metadata);

    return new Promise<UploadDocumentResult>((resolve, reject) => {
      let isSettled = false;

      const timeoutId = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          try {
            uploadTask.cancel();
          } catch {
            // ignore
          }
          reject(
            new Error(
              'Upload timed out. Please check your network connection and retry.'
            )
          );
        }
      }, FIREBASE_UPLOAD_TIMEOUT_MS);

      uploadTask.on(
        'state_changed',
        (snapshot: UploadTaskSnapshot) => {
          if (isSettled) return;
          const total = snapshot.totalBytes || file.size;
          const progress = total > 0 ? (snapshot.bytesTransferred / total) * 100 : 0;
          if (onProgress) {
            onProgress(Math.min(Math.round(progress), 99), snapshot.bytesTransferred, total);
          }
        },
        (error) => {
          if (isSettled) return;
          isSettled = true;
          clearTimeout(timeoutId);
          console.warn('Firebase Storage upload notification:', error.code, error.message);
          reject(error);
        },
        async () => {
          if (isSettled) return;
          isSettled = true;
          clearTimeout(timeoutId);
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            if (onProgress) {
              onProgress(100, file.size, file.size);
            }
            resolve({
              fileUrl: downloadUrl,
              storagePath,
              fileName: file.name,
              fileSizeBytes: file.size,
              fileType: file.type,
            });
          } catch (err: any) {
            reject(new Error(`Failed to retrieve file download URL: ${err.message}`));
          }
        }
      );
    });
  },

  /**
   * Resilient upload orchestrator:
   * Validates file, checks Firebase Cloud Storage availability,
   * uploads to Firebase Storage or seamless backend storage endpoint with live progress.
   */
  async uploadDriverDocument(
    driverId: string,
    documentType: DriverDocumentType,
    file: File,
    onProgress?: UploadProgressCallback
  ): Promise<UploadDocumentResult> {
    const validation = this.validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid file');
    }

    // 1. Initial simulated progress pulse to confirm upload initiation immediately in UI
    if (onProgress) {
      onProgress(15, Math.round(file.size * 0.15), file.size);
    }

    // 2. Check if Firebase Cloud Storage is available
    const bucketActive = await isFirebaseBucketAvailable();

    if (bucketActive) {
      try {
        return await this.uploadViaFirebaseStorage(driverId, documentType, file, onProgress);
      } catch (err: any) {
        console.warn('Firebase Storage upload failed, falling back to server storage:', err?.message);
        // Fall back seamlessly to server storage endpoint
      }
    }

    // 3. Resilient server storage upload with real progress tracking
    return await this.uploadViaServer(driverId, documentType, file, onProgress);
  },

  /**
   * Deletes a previously uploaded document file
   */
  async deleteDocument(storagePath: string): Promise<void> {
    if (!storagePath) return;
    try {
      const storageRef = ref(storage, storagePath);
      await deleteObject(storageRef);
    } catch (err) {
      console.warn('Could not delete prior document file from storage:', err);
    }
  },
};
