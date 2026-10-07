/**
 * Material, Location, and SAP Standard Utilities
 */

import { ProcurementStatus } from '../types/inventory';

export const STANDARD_UNITS = [
  'EA',
  'PCS',
  'SET',
  'ROLL',
  'MTR',
  'KG',
  'LTR',
  'BOX',
  'DRUM',
  'CAN',
  'PAIL',
  'BTL'
] as const;

export const CATEGORIES = [
  'Mekanikal & Valve',
  'Elektrikal & Instrumentasi',
  'Pneumatik & Hidrolik',
  'Pipa, Flange & Fitting',
  'Pelumas & Kimia Industri',
  'Safety & APD',
  'Fastener & Gasket',
  'Consumables & Sparepart'
] as const;

/**
 * Normalizes input string to exact 18-digit SAP Material Number with leading zero padding.
 * Example: '310070000000000235' (17 digits) -> '031007000000000235'
 * If input is already 18 digits, returns it cleaned.
 */
export function padTo18Digits(input: string | number | undefined | null): string {
  if (input === undefined || input === null) return '';
  const cleaned = String(input).replace(/\D/g, '').trim();
  if (!cleaned) return '';
  if (cleaned.length >= 18) {
    return cleaned.slice(0, 18);
  }
  return cleaned.padStart(18, '0');
}

/**
 * Checks if a string is a valid 18-digit SAP Material Number.
 */
export function isValid18DigitMaterial(materialNo: string): boolean {
  return /^[0-9]{18}$/.test(materialNo);
}

/**
 * Auto-generates a realistic 18-digit SAP material code.
 * Standard format: 03100 + 13 random digits.
 */
export function generateRandom18DigitCode(prefix = '03100'): string {
  const needed = 18 - prefix.length;
  let randomPart = '';
  for (let i = 0; i < needed; i++) {
    randomPart += Math.floor(Math.random() * 10).toString();
  }
  return `${prefix}${randomPart}`;
}

export interface ParsedLocation {
  room: string;
  rack: string;
  row: string;
  level: string;
}

/**
 * Parses location string formatted as Ruang.Rak.Baris.Tingkat (e.g., 1.03.02.04B)
 */
export function parseLocation(locStr: string): ParsedLocation {
  const parts = (locStr || '').split('.');
  return {
    room: parts[0] || '1',
    rack: parts[1] || '01',
    row: parts[2] || '01',
    level: parts[3] || '01A',
  };
}

/**
 * Formats location parts into standard Ruang.Rak.Baris.Tingkat
 */
export function formatLocation(loc: ParsedLocation): string {
  const r = (loc.room || '1').trim();
  const rk = (loc.rack || '01').padStart(2, '0').trim();
  const rw = (loc.row || '01').padStart(2, '0').trim();
  const lvl = (loc.level || '01A').toUpperCase().trim();
  return `${r}.${rk}.${rw}.${lvl}`;
}

/**
 * Formats ISO timestamp to 24-hour localized date-time (WIB / standard 24h)
 * Example: 2026-09-29 18:30:15
 */
export function formatDateTime24(isoString: string | undefined): string {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch {
    return isoString;
  }
}

/**
 * Determine procurement alert status based on current stock vs min stock
 */
export function evaluateProcurementStatus(currentStock: number, minStock: number, currentStatus?: ProcurementStatus): ProcurementStatus {
  if (currentStock <= 0) {
    return 'PR_REQUIRED';
  }
  if (currentStock <= minStock) {
    if (currentStatus === 'PR_PROCESSED' || currentStatus === 'ARRIVED') {
      return currentStatus;
    }
    return 'MINIMUM';
  }
  return 'NORMAL';
}
