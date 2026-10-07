/**
 * Warehouse Management System (WMS) Types
 */

export type UserRole = 'admin' | 'supervisor' | 'staff' | 'reviewer' | 'evaluator';
export type StaffGroup = 'Group A' | 'Group B' | 'Group C' | 'Group D' | 'Shift A' | 'Shift B' | 'Shift C' | 'Shift D' | 'None' | string;

export interface UserAccount {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  group: StaffGroup;
  email: string;
  avatar?: string;
  pin?: string;
}

export type ContractType = 'FPA' | 'NON_FPA';

export type ProcurementStatus = 
  | 'NORMAL' 
  | 'MINIMUM' 
  | 'PR_REQUIRED' 
  | 'PR_PROCESSED' 
  | 'ARRIVED' 
  | 'PROCESSED';

export interface InventoryItem {
  id: string;
  material_no: string; // Tepat 18 digit angka SAP standard (material_code)
  name: string;
  specification: string; // Deskripsi / Spesifikasi teknis barang
  description?: string; // Alias for specification / description
  category: string;
  unit: string; // EA, PCS, SET, ROLL, MTR, KG, LTR, BOX, DRUM
  contract_type: ContractType;
  location: string; // Format Ruang.Rak.Baris.Tingkat (e.g. 1.03.02.04B)
  current_stock: number;
  initial_stock?: number; // Stok awal saat inisiasi / impor
  min_stock: number;
  max_stock: number;
  procurement_status: ProcurementStatus;
  created_at: string;
  updated_at: string;
  updated_by: string;
  notes?: string;
}

export type TransactionType = 'IN' | 'OUT' | 'STO';

export interface StockTransaction {
  id: string;
  item_id: string;
  material_no: string;
  item_name?: string;
  type: TransactionType;
  quantity: number;
  balance_before: number;
  balance_after: number;
  doc_ref: string; // No Surat Jalan / PO / SPK / Work Order / BA-STO
  pic_name: string; // Nama PIC penerima/pengambil
  operator_username: string;
  operator_group: StaffGroup;
  notes: string;
  timestamp: string; // ISO 8601 string
}

export type StoVarianceStatus = 'MATCH' | 'SURPLUS' | 'DEFICIT';

export interface StockTake {
  id: string;
  item_id: string;
  material_no: string;
  item_name?: string;
  location?: string;
  system_stock: number;
  physical_stock: number;
  variance: number; // physical_stock - system_stock
  status: StoVarianceStatus;
  ba_number: string; // Berita Acara STO
  auditor_username: string;
  auditor_group: StaffGroup;
  notes: string;
  timestamp: string;
  applied_to_stock: boolean;
}

export interface SyncStatusInfo {
  isOnline: boolean;
  firestoreConnected?: boolean;
  sqlConnected?: boolean;
  lastSyncedAt: Date | null;
  pendingSyncCount: number;
  syncSource: 'cloud' | 'local' | 'peer_tab';
}
