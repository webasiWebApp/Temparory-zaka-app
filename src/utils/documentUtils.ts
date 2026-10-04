/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Document Resolution & Preview Utilities
 */

import { ref, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/config';
import { DriverDocumentRecord } from '../types';
import { apiFetch } from '../services/apiClient';

/**
 * Documents held by the ZAKA server are private: they are fetched with the viewer's ID token and
 * handed to the UI as an in-memory blob URL (nothing viewable by link alone).
 */
async function fetchServerDocument(serverPath: string): Promise<string> {
  const res = await apiFetch(serverPath, { timeoutMs: 30000 });
  if (res.status === 401) throw new Error('Your session has expired. Please sign in again to view this document.');
  if (res.status === 403) throw new Error('You are not authorised to view this document.');
  if (res.status === 404) throw new Error('This document is no longer available. Please ask the driver to upload it again.');
  if (!res.ok) throw new Error('Unable to load this document. Please try again.');
  return URL.createObjectURL(await res.blob());
}

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

  // 3. Direct absolute HTTP/HTTPS URL (records uploaded before private storage links were introduced)
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
    return {
      url: fileUrl,
      isPdf,
      isImage,
      mimeType,
      fileName: docRecord.fileName || 'compliance_document',
    };
  }

  // 4. Document stored by the ZAKA server: authenticated fetch (owner driver or Admin only)
  let serverPath = '';
  if (fileUrl.startsWith('/uploads/')) {
    serverPath = fileUrl;
  } else if (storagePath) {
    const cleanPath = storagePath.replace(/^gs:\/\/[^/]+\//, '').replace(/^\/+/, '');
    serverPath = cleanPath.startsWith('drivers/') ? `/uploads/${cleanPath}` : `/uploads/drivers/${cleanPath}`;
  } else if (fileUrl && !fileUrl.startsWith('private://')) {
    const clean = fileUrl.replace(/^\/+/, '');
    serverPath = clean.startsWith('uploads/') ? `/${clean}` : `/uploads/${clean}`;
  }

  if (serverPath) {
    return {
      url: await fetchServerDocument(serverPath),
      isPdf,
      isImage,
      mimeType,
      fileName: docRecord.fileName || serverPath.split('/').pop() || 'compliance_document',
    };
  }

  throw new Error('Unable to resolve document location. No valid URL or storage path found.');
}
