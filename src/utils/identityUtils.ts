/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Identity detail helpers shared by passenger verification and the driver application
 */

export const NATIONALITIES = [
  'South African', 'Zimbabwean', 'Mozambican', 'Basotho', 'Swazi', 'Motswana', 'Namibian', 'Malawian',
  'Zambian', 'Angolan', 'Congolese', 'Nigerian', 'Ghanaian', 'Kenyan', 'Tanzanian', 'Ugandan',
  'Ethiopian', 'Somali', 'Rwandan', 'Burundian', 'Cameroonian', 'Egyptian', 'Moroccan', 'Indian',
  'Pakistani', 'Bangladeshi', 'Chinese', 'British', 'German', 'French', 'Portuguese', 'Dutch',
  'American', 'Canadian', 'Brazilian', 'Australian',
];

/** Accepts YYYY/MM/DD (also - or . separators) and returns YYYY-MM-DD, or '' when it is not a real date */
export function parseDateOfBirth(input: string): string {
  const m = input.trim().match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (!m) return '';
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  const now = new Date();
  if (date.getTime() > now.getTime() || year < now.getFullYear() - 120) return '';
  return `${m[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Types the slashes for the user: 19900521 -> 1990/05/21 */
export function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}/${digits.slice(4)}`;
  return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6)}`;
}

/** South African ID number: 13 digits with a valid check digit, starting with the date of birth (YYMMDD) */
export function validateSouthAfricanId(idNumber: string, dateOfBirth: string): string | null {
  if (!/^\d{13}$/.test(idNumber)) return 'A South African ID number has 13 digits.';
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let digit = Number(idNumber[12 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  if (sum % 10 !== 0) return 'This ID number is not valid. Please check it and try again.';
  if (dateOfBirth && idNumber.slice(0, 6) !== dateOfBirth.replace(/-/g, '').slice(2)) {
    return 'This ID number does not match your date of birth.';
  }
  return null;
}

/** Shows only the last four characters of an ID number */
export function maskIdNumber(idNumber: string): string {
  return idNumber.length > 4 ? `${'•'.repeat(idNumber.length - 4)}${idNumber.slice(-4)}` : idNumber;
}

/** Age in whole years for a YYYY-MM-DD date of birth */
export function ageFromDateOfBirth(dateOfBirth: string): number {
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age;
}
