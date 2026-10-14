/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Canonical Phone Normalization & Validation Utility
 * Standardizes South African numbers to E.164 canonical format: +27821234567
 */

/**
 * Normalizes equivalent phone number representations into a single canonical E.164 format.
 *
 * Examples handled for South Africa:
 * - 0821234567        -> +27821234567
 * - 082 123 4567      -> +27821234567
 * - 082-123-4567      -> +27821234567
 * - (082) 123 4567    -> +27821234567
 * - +27 82 123 4567   -> +27821234567
 * - +27821234567      -> +27821234567
 * - 27821234567       -> +27821234567
 * - 0027 82 123 4567  -> +27821234567
 * - +27 082 123 4567  -> +27821234567
 * - 82 123 4567       -> +27821234567
 */
export function normalizePhoneNumber(raw: string): string {
  if (!raw) return '';

  // 1. Strip all spaces, dashes, parentheses, dots
  let cleaned = raw.trim().replace(/[\s\-\(\)\.]/g, '');

  // 2. Handle international '00' prefix
  if (cleaned.startsWith('0027')) {
    cleaned = '+27' + cleaned.slice(4);
  } else if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  }

  // 3. Handle standard South African 10-digit format starting with '0'
  // e.g. 082 123 4567 -> +27821234567
  if (/^0[1-9]\d{8}$/.test(cleaned)) {
    return '+27' + cleaned.slice(1);
  }

  // 4. Handle 27 without leading '+' (e.g. 27821234567)
  if (/^27[1-9]\d{8}$/.test(cleaned)) {
    return '+' + cleaned;
  }

  // 5. Handle already well-formatted +27
  if (/^\+27[1-9]\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  // 6. Country code typed together with the trunk '0' (e.g. +27 082 123 4567 or 27 082 123 4567)
  if (/^\+?270[1-9]\d{8}$/.test(cleaned)) {
    return '+27' + cleaned.replace(/^\+?270/, '');
  }

  // 7. Bare 9-digit national number with the leading '0' left off (e.g. 82 123 4567)
  if (/^[1-9]\d{8}$/.test(cleaned)) {
    return '+27' + cleaned;
  }

  // 8. Generic E.164 international format fallback: ensure single leading '+'
  if (!cleaned.startsWith('+') && /^\d{9,15}$/.test(cleaned)) {
    return '+' + cleaned;
  }

  return cleaned;
}

/**
 * Filters phone input keystrokes so only South African (+27) numbers can be typed.
 * Keeps digits, spaces and a single leading '+'; a typed country code must be +27 / 0027.
 * Returns `previous` unchanged when the new value would be a non-South African number.
 */
export function filterSaPhoneInput(next: string, previous: string): string {
  const cleaned = next.replace(/[^\d+ ]/g, '').replace(/(?!^)\+/g, '');
  const digits = cleaned.replace(/\D/g, '');

  // '+' must lead into 27 ('+', '+2' are allowed while typing)
  if (cleaned.startsWith('+') && !digits.startsWith('27') && !'27'.startsWith(digits)) return previous;
  // International '00' prefix must lead into 0027
  if (digits.startsWith('00') && !digits.startsWith('0027') && !'0027'.startsWith(digits)) return previous;

  // Longest valid form is 0027 + 9 digits
  if (digits.length > 13) return previous;

  return cleaned;
}

/**
 * Validates whether a phone number can be normalized into a valid South African (+27) number.
 */
export function validatePhoneNumber(raw: string): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  if (!raw || !raw.trim()) {
    return {
      valid: false,
      normalized: '',
      error: 'Please enter your phone number.',
    };
  }

  const normalized = normalizePhoneNumber(raw);

  // Only South African numbers are accepted: +27 followed by 9 digits (total length: 12 chars)
  // Common mobile prefixes: 06x, 07x, 08x, landlines: 01x, 02x, etc.
  const isSouthAfrican = /^\+27[1-9]\d{8}$/.test(normalized);

  if (!isSouthAfrican) {
    return {
      valid: false,
      normalized,
      error: 'Please enter a valid South African mobile number (e.g. 082 123 4567).',
    };
  }

  return {
    valid: true,
    normalized,
  };
}

/**
 * Formats a canonical +27821234567 number into user-friendly display format: +27 82 123 4567
 */
export function formatPhoneDisplay(normalized: string): string {
  if (!normalized) return '';
  if (/^\+27[1-9]\d{8}$/.test(normalized)) {
    // +27 82 123 4567
    return `+27 ${normalized.slice(3, 5)} ${normalized.slice(5, 8)} ${normalized.slice(8)}`;
  }
  return normalized;
}
