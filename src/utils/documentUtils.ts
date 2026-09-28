/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Document Resolution & Preview Utilities
 */

import { ref, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/config';
import { DriverDocumentRecord } from '../types';

export interface ResolvedDocument {
  url: string;
  isPdf: boolean;
  isImage: boolean;
  mimeType: string;
  fileName: string;
}

/**
 * Resolves a DriverDocumentRecord to a reliable, downloadable and previewable URL.
 * Checks Data URIs, Firebase Cloud Storage SDK download URLs, server static endpoints,
 * and handles fallbacks seamlessly without ever navigating away from the app.
 */
export async function resolveDocumentUrl(docRecord: DriverDocumentRecord): Promise<ResolvedDocument> {
  if (!docRecord) {
    throw new Error('No document record provided');
  }

  const declaredType = (docRecord.fileType || '').toLowerCase();
  const fileName = (docRecord.fileName || '').toLowerCase();
  const fileUrl = (docRecord.fileUrl || '').trim();
  const storagePath = (docRecord.storagePath || '').trim();

  const isPdf =
    declaredType === 'application/pdf' ||
    fileName.endsWith('.pdf') ||
    fileUrl.toLowerCase().includes('.pdf') ||
    storagePath.toLowerCase().endsWith('.pdf');

  const mimeType = isPdf ? 'application/pdf' : (declaredType || 'image/jpeg');
  const isImage = !isPdf;

  // 1. If base64/data URI is present
  if (fileUrl.startsWith('data:')) {
    return {
      url: fileUrl,
      isPdf,
      isImage,
      mimeType,
      fileName: docRecord.fileName || 'compliance_document',
    };
  }

  // 2. If Firebase Storage storagePath exists, try to get a signed download URL
  if (storagePath) {
    try {
      const cleanPath = storagePath.replace(/^gs:\/\/[^/]+\//, '').replace(/^\/+/, '');
      const storageRef = ref(storage, cleanPath);
      const downloadUrl = await getDownloadURL(storageRef);
      if (downloadUrl && downloadUrl.startsWith('http')) {
        return {
          url: downloadUrl,
          isPdf,
          isImage,
          mimeType,
          fileName: docRecord.fileName || cleanPath.split('/').pop() || 'compliance_document',
        };
      }
    } catch {
      // Storage bucket not provisioned or direct access restricted, fall back to server endpoints
    }
  }

  // 3. Direct absolute HTTP/HTTPS URL
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
    return {
      url: fileUrl,
      isPdf,
      isImage,
      mimeType,
      fileName: docRecord.fileName || 'compliance_document',
    };
  }

  // 4. Server-hosted /uploads path
  if (fileUrl.startsWith('/uploads/')) {
    return {
      url: fileUrl,
      isPdf,
      isImage,
      mimeType,
      fileName: docRecord.fileName || 'compliance_document',
    };
  }

  // 5. If storagePath exists, map to /uploads/drivers/...
  if (storagePath) {
    const cleanPath = storagePath.replace(/^\/+/, '');
    const mappedUrl = cleanPath.startsWith('drivers/') ? `/uploads/${cleanPath}` : `/uploads/drivers/${cleanPath}`;
    return {
      url: mappedUrl,
      isPdf,
      isImage,
      mimeType,
      fileName: docRecord.fileName || cleanPath.split('/').pop() || 'compliance_document',
    };
  }

  // 6. Generic fileUrl
  if (fileUrl) {
    const clean = fileUrl.replace(/^\/+/, '');
    const mappedUrl = clean.startsWith('uploads/') ? `/${clean}` : `/uploads/${clean}`;
    return {
      url: mappedUrl,
      isPdf,
      isImage,
      mimeType,
      fileName: docRecord.fileName || 'compliance_document',
    };
  }

  throw new Error('Unable to resolve document location. No valid URL or storage path found.');
}
