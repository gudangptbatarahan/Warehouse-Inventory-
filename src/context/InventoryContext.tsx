/**
 * Inventory State & Mutation Context
 * Handles business rules, stock validation, auto-18-digit formatting,
 * dual-persistence synchronization, and failure isolation.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  InventoryItem, 
  StockTransaction, 
  StockTake, 
  SyncStatusInfo, 
  TransactionType,
  StoVarianceStatus 
} from '../types/inventory';
import { syncManager } from '../services/syncManager';
import { useAuth } from './AuthContext';
import { padTo18Digits, evaluateProcurementStatus } from '../utils/materialUtils';

interface InventoryContextType {
  items: InventoryItem[];
  transactions: StockTransaction[];
  stockTakes: StockTake[];
  syncStatus: SyncStatusInfo;
  isLoading: boolean;
  // CRUD & Operations
  getItemById: (id: string) => InventoryItem | undefined;
  getItemByMaterialNo: (materialNo: string) => InventoryItem | undefined;
  getItemTransactions: (itemIdOrMaterialNo: string) => StockTransaction[];
  addItem: (itemData: Omit<InventoryItem, 'id' | 'created_at' | 'updated_at' | 'updated_by'>) => Promise<{ success: boolean; message: string; item?: InventoryItem }>;
  updateItem: (id: string, updates: Partial<InventoryItem>) => Promise<{ success: boolean; message: string }>;
  deleteItem: (id: string) => Promise<{ success: boolean; message: string }>;
  addTransaction: (data: {
    item_id: string;
    type: TransactionType;
    quantity: number;
    doc_ref: string;
    pic_name: string;
    notes?: string;
    customTimestamp?: string;
  }) => Promise<{ success: boolean; message: string; transaction?: StockTransaction }>;
  updateTransaction: (
    txId: string, 
    updates: { quantity?: number; doc_ref?: string; pic_name?: string; notes?: string; timestamp?: string }
  ) => Promise<{ success: boolean; message: string }>;
  deleteTransaction: (txId: string) => Promise<{ success: boolean; message: string }>;
  addStockTake: (data: {
    item_id: string;
    physical_stock: number;
    ba_number: string;
    shift?: string;
    notes?: string;
    applyToStock: boolean;
  }) => Promise<{ success: boolean; message: string }>;
  importItemsBatch: (newItems: Omit<InventoryItem, 'id' | 'created_at' | 'updated_at' | 'updated_by'>[]) => Promise<{ imported: number; updated: number; failed: number }>;
  triggerManualSync: () => Promise<void>;
  clearAllData: () => Promise<{ success: boolean; message: string }>;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, currentGroup } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [stockTakes, setStockTakes] = useState<StockTake[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatusInfo>(syncManager.getStatus());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Reload data from IndexedDB
  const refreshLocalState = useCallback(async () => {
    try {
      const dbData = await syncManager.initialize();
      setItems(dbData.items);
      // Sort transactions descending (newest first)
      setTransactions([...dbData.transactions].sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ));
      setStockTakes([...dbData.stockTakes].sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ));
    } catch (err) {
      console.error('Failed to refresh inventory state:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize and register listeners
  useEffect(() => {
    let isMounted = true;

    syncManager.initialize().then(initialData => {
      if (!isMounted) return;
      setItems(initialData.items);
      setTransactions([...initialData.transactions].sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ));
      setStockTakes([...initialData.stockTakes].sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ));
      setIsLoading(false);
    });

    const unsubStatus = syncManager.onStatusChange(status => {
      if (isMounted) setSyncStatus(status);
    });

    const unsubData = syncManager.onDataChange(() => {
      if (isMounted) refreshLocalState();
    });

    return () => {
      isMounted = false;
      unsubStatus();
      unsubData();
    };
  }, [refreshLocalState]);

  const getItemById = useCallback((id: string): InventoryItem | undefined => {
    return items.find(item => item.id === id);
  }, [items]);

  const getItemByMaterialNo = useCallback((materialNo: string): InventoryItem | undefined => {
    const padded = padTo18Digits(materialNo);
    return items.find(item => item.material_no === padded || item.material_no === materialNo);
  }, [items]);

  const getItemTransactions = useCallback((itemIdOrMaterialNo: string): StockTransaction[] => {
    const padded = padTo18Digits(itemIdOrMaterialNo);
    return transactions.filter(tx => 
      tx.item_id === itemIdOrMaterialNo || 
      tx.material_no === padded || 
      tx.material_no === itemIdOrMaterialNo
    );
  }, [transactions]);

  // Add Item with 18-digit padding and isolated initial transaction
  const addItem = async (
    itemData: Omit<InventoryItem, 'id' | 'created_at' | 'updated_at' | 'updated_by'>
  ): Promise<{ success: boolean; message: string; item?: InventoryItem }> => {
    try {
      const paddedMaterialNo = padTo18Digits(itemData.material_no);
      if (!paddedMaterialNo || paddedMaterialNo.length !== 18) {
        return { success: false, message: 'Nomor material harus tepat 18 angka digit.' };
      }

      // Check duplicates
      const existing = items.find(i => i.material_no === paddedMaterialNo);
      if (existing) {
        return { success: false, message: `Nomor material ${paddedMaterialNo} sudah terdaftar (${existing.name}).` };
      }

      const initialStock = Number(itemData.current_stock) || 0;
      const minStock = Number(itemData.min_stock) || 0;
      const maxStock = Number(itemData.max_stock) || 100;
      const calculatedStatus = evaluateProcurementStatus(initialStock, minStock, itemData.procurement_status);

      const newItem: InventoryItem = {
        ...itemData,
        contract_type: itemData.contract_type || 'NON_FPA',
        id: `item-${paddedMaterialNo}`,
        material_no: paddedMaterialNo,
        current_stock: initialStock,
        min_stock: minStock,
        max_stock: maxStock,
        procurement_status: calculatedStatus,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: currentUser?.username || 'supervisor',
        notes: itemData.notes || ''
      };

      // 1. Generate initial balance IN transaction if initialStock > 0
      const initTx: StockTransaction | null = initialStock > 0 ? {
        id: `tx-init-${paddedMaterialNo}-${Date.now()}`,
        item_id: newItem.id,
        material_no: paddedMaterialNo,
        item_name: newItem.name,
        type: 'IN',
        quantity: initialStock,
        balance_before: 0,
        balance_after: initialStock,
        doc_ref: 'BA-SALDO-AWAL-SYSTEM',
        pic_name: currentUser?.name || 'Administrator Gudang',
        operator_username: currentUser?.username || 'supervisor',
        operator_group: currentGroup || 'Group A',
        notes: 'Saldo awal registrasi master barang baru',
        timestamp: new Date().toISOString()
      } : null;

      // 2. Instant optimistic UI update (<1ms)
      setItems(prev => [newItem, ...prev]);
      if (initTx) {
        setTransactions(prev => [initTx, ...prev]);
      }

      // 3. Background sync
      const bgPromises: Promise<unknown>[] = [syncManager.saveItem(newItem)];
      if (initTx) {
        bgPromises.push(syncManager.saveTransaction(initTx));
      }
      Promise.allSettled(bgPromises).catch(err => {
        console.warn('Background sync error on addItem:', err);
      });

      return { success: true, message: `Barang ${newItem.name} (${paddedMaterialNo}) berhasil ditambahkan.`, item: newItem };
    } catch (err) {
      console.error('Failed to add item:', err);
      return { success: false, message: `Gagal menambahkan barang: ${err instanceof Error ? err.message : String(err)}` };
    }
  };

  const updateItem = async (
    id: string, 
    updates: Partial<InventoryItem>
  ): Promise<{ success: boolean; message: string }> => {
    try {
      const existing = items.find(i => i.id === id);
      if (!existing) {
        return { success: false, message: 'Barang tidak ditemukan.' };
      }

      // If material_no changed, check format and collision
      let finalMaterialNo = existing.material_no;
      if (updates.material_no && updates.material_no !== existing.material_no) {
        finalMaterialNo = padTo18Digits(updates.material_no);
        const dup = items.find(i => i.id !== id && i.material_no === finalMaterialNo);
        if (dup) {
          return { success: false, message: `Nomor material ${finalMaterialNo} sudah digunakan oleh ${dup.name}.` };
        }
      }

      const updatedStock = updates.current_stock !== undefined ? Number(updates.current_stock) : existing.current_stock;
      const updatedMin = updates.min_stock !== undefined ? Number(updates.min_stock) : existing.min_stock;
      const status = evaluateProcurementStatus(updatedStock, updatedMin, updates.procurement_status || existing.procurement_status);

      const mergedItem: InventoryItem = {
        ...existing,
        ...updates,
        material_no: finalMaterialNo,
        current_stock: updatedStock,
        min_stock: updatedMin,
        procurement_status: status,
        updated_at: new Date().toISOString(),
        updated_by: currentUser?.username || 'supervisor',
        notes: updates.notes ?? existing.notes ?? ''
      };

      // 1. Instant optimistic state update (<1ms reaction in UI)
      setItems(prev => prev.map(i => i.id === id ? mergedItem : i));

      // 2. Background persistent save (IndexedDB + Cloud SQL + Firestore)
      syncManager.saveItem(mergedItem).catch(err => {
        console.warn('Background sync error on updateItem:', err);
      });

      return { success: true, message: 'Data master barang berhasil diperbarui.' };
    } catch (err) {
      return { success: false, message: `Gagal memperbarui barang: ${err instanceof Error ? err.message : String(err)}` };
    }
  };

  const deleteItem = async (id: string): Promise<{ success: boolean; message: string }> => {
    try {
      // 1. Instant optimistic state update (immediate UI reaction <10ms)
      setItems(prev => prev.filter(i => i.id !== id));

      // 2. Local deletion and background remote sync
      await syncManager.deleteItem(id);
      return { success: true, message: 'Barang berhasil dihapus.' };
    } catch (err) {
      await refreshLocalState();
      return { success: false, message: `Gagal menghapus barang: ${err instanceof Error ? err.message : String(err)}` };
    }
  };

  // Stock Mutation with strict OUT <= current_stock validation
  const addTransaction = async (data: {
    item_id: string;
    type: TransactionType;
    quantity: number;
    doc_ref: string;
    pic_name: string;
    notes?: string;
    customTimestamp?: string;
  }): Promise<{ success: boolean; message: string; transaction?: StockTransaction }> => {
    try {
      const item = items.find(i => i.id === data.item_id || i.material_no === data.item_id);
      if (!item) {
        return { success: false, message: 'Barang tidak ditemukan di inventaris.' };
      }

      const qty = Number(data.quantity);
      if (isNaN(qty) || qty <= 0) {
        return { success: false, message: 'Kuantitas mutasi harus lebih besar dari 0.' };
      }

      if (!data.doc_ref || !data.doc_ref.trim()) {
        return { success: false, message: 'Nomor Dokumen Acuan (PO/Surat Jalan/SPK) wajib diisi.' };
      }

      if (!data.pic_name || !data.pic_name.trim()) {
        return { success: false, message: 'Nama PIC Pengambil / Penerima wajib diisi.' };
      }

      const balanceBefore = Number(item.current_stock) || 0;
      let balanceAfter = balanceBefore;

      if (data.type === 'IN') {
        balanceAfter = balanceBefore + qty;
      } else if (data.type === 'OUT') {
        // STRICT VALIDATION
        if (qty > balanceBefore) {
          return { 
            success: false, 
            message: `Stok tidak mencukupi! Kuantitas keluar (${qty} ${item.unit}) melebihi saldo fisik saat ini (${balanceBefore} ${item.unit}).` 
          };
        }
        balanceAfter = balanceBefore - qty;
      } else if (data.type === 'STO') {
        balanceAfter = qty;
      }

      const timestamp = data.customTimestamp || new Date().toISOString();

      const newTx: StockTransaction = {
        id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        item_id: item.id,
        material_no: item.material_no,
        item_name: item.name,
        type: data.type,
        quantity: qty,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        doc_ref: data.doc_ref.trim(),
        pic_name: data.pic_name.trim(),
        operator_username: currentUser?.username || 'staff',
        operator_group: currentGroup || 'Group A',
        notes: (data.notes && data.notes.trim()) || '-',
        timestamp
      };

      // Update item's current stock & status
      const updatedStatus = evaluateProcurementStatus(balanceAfter, item.min_stock);
      const updatedItem: InventoryItem = {
        ...item,
        current_stock: balanceAfter,
        procurement_status: updatedStatus,
        updated_at: new Date().toISOString(),
        updated_by: currentUser?.username || 'staff'
      };

      // 1. Instant optimistic state update (<1ms)
      setTransactions(prev => [newTx, ...prev]);
      setItems(prev => prev.map(i => i.id === item.id ? updatedItem : i));

      // 2. Background persistent sync
      Promise.allSettled([
        syncManager.saveTransaction(newTx),
        syncManager.saveItem(updatedItem)
      ]).catch(err => console.warn('Background sync mutation error:', err));

      return { 
        success: true, 
        message: `Mutasi ${data.type} sebesar ${qty} ${item.unit} berhasil dicatat. Sisa saldo: ${balanceAfter} ${item.unit}.`,
        transaction: newTx 
      };
    } catch (err) {
      console.error('Mutation error:', err);
      return { success: false, message: `Gagal mencatat mutasi: ${err instanceof Error ? err.message : String(err)}` };
    }
  };

  // Transaction Edit / Correction
  const updateTransaction = async (
    txId: string, 
    updates: { quantity?: number; doc_ref?: string; pic_name?: string; notes?: string; timestamp?: string }
  ): Promise<{ success: boolean; message: string }> => {
    try {
      const tx = transactions.find(t => t.id === txId);
      if (!tx) {
        return { success: false, message: 'Transaksi tidak ditemukan.' };
      }

      const item = items.find(i => i.id === tx.item_id);
      if (!item) {
        return { success: false, message: 'Barang terkait transaksi tidak ditemukan.' };
      }

      let newBalanceAfter = tx.balance_after;
      let newQty = tx.quantity;
      let updatedItem: InventoryItem | null = null;

      if (updates.quantity !== undefined && updates.quantity !== tx.quantity) {
        newQty = Number(updates.quantity);
        if (newQty <= 0) {
          return { success: false, message: 'Kuantitas baru harus lebih besar dari 0.' };
        }

        const delta = newQty - tx.quantity;
        let newStock = item.current_stock;
        if (tx.type === 'IN') {
          // If IN increased, current stock increases
          newStock = item.current_stock + delta;
          if (newStock < 0) {
            return { success: false, message: 'Koreksi kuantitas IN akan menyebabkan saldo stok negatif!' };
          }
          newBalanceAfter = tx.balance_before + newQty;
        } else if (tx.type === 'OUT') {
          // If OUT increased, current stock decreases
          newStock = item.current_stock - delta;
          if (newStock < 0) {
            return { success: false, message: `Koreksi kuantitas OUT melebihi saldo fisik (${item.current_stock} ${item.unit})!` };
          }
          newBalanceAfter = tx.balance_before - newQty;
        }

        updatedItem = {
          ...item,
          current_stock: newStock,
          procurement_status: evaluateProcurementStatus(newStock, item.min_stock),
          updated_at: new Date().toISOString(),
          updated_by: currentUser?.username || 'supervisor'
        };
      }

      const updatedTx: StockTransaction = {
        ...tx,
        quantity: newQty,
        balance_after: newBalanceAfter,
        doc_ref: updates.doc_ref !== undefined ? updates.doc_ref.trim() : tx.doc_ref,
        pic_name: updates.pic_name !== undefined ? updates.pic_name.trim() : tx.pic_name,
        notes: updates.notes !== undefined ? updates.notes.trim() : tx.notes,
        timestamp: updates.timestamp !== undefined ? updates.timestamp.trim() : tx.timestamp
      };

      // 1. Instant optimistic state update
      setTransactions(prev => prev.map(t => t.id === txId ? updatedTx : t));
      if (updatedItem) {
        setItems(prev => prev.map(i => i.id === updatedItem!.id ? updatedItem! : i));
      }

      // 2. Background sync
      Promise.allSettled([
        syncManager.saveTransaction(updatedTx),
        updatedItem ? syncManager.saveItem(updatedItem) : Promise.resolve()
      ]).catch(err => console.warn('Background sync error on updateTransaction:', err));

      return { success: true, message: 'Koreksi transaksi berhasil disimpan dan saldo stok telah disesuaikan.' };
    } catch (err) {
      return { success: false, message: `Gagal memperbarui transaksi: ${err instanceof Error ? err.message : String(err)}` };
    }
  };

  // Transaction Delete / Rollback (Authorized for Supervisor)
  const deleteTransaction = async (txId: string): Promise<{ success: boolean; message: string }> => {
    try {
      const tx = transactions.find(t => t.id === txId);
      if (!tx) {
        return { success: false, message: 'Transaksi tidak ditemukan.' };
      }

      const item = items.find(i => i.id === tx.item_id);
      let updatedItem: InventoryItem | null = null;
      if (item) {
        let revertedStock = item.current_stock;
        // Revert stock impact
        if (tx.type === 'IN') {
          revertedStock = Math.max(0, item.current_stock - tx.quantity);
        } else if (tx.type === 'OUT') {
          revertedStock = item.current_stock + tx.quantity;
        }
        updatedItem = {
          ...item,
          current_stock: revertedStock,
          procurement_status: evaluateProcurementStatus(revertedStock, item.min_stock),
          updated_at: new Date().toISOString(),
          updated_by: currentUser?.username || 'supervisor'
        };
      }

      // 1. Instant optimistic state update (<1ms)
      setTransactions(prev => prev.filter(t => t.id !== txId));
      if (updatedItem) {
        setItems(prev => prev.map(i => i.id === updatedItem!.id ? updatedItem! : i));
      }

      // 2. Background sync
      Promise.allSettled([
        syncManager.deleteTransaction(txId),
        updatedItem ? syncManager.saveItem(updatedItem) : Promise.resolve()
      ]).catch(err => console.warn('Background sync deleteTransaction error:', err));

      return { success: true, message: 'Riwayat mutasi berhasil dihapus dan saldo stok telah dikembalikan.' };
    } catch (err) {
      return { success: false, message: `Gagal menghapus transaksi: ${err instanceof Error ? err.message : String(err)}` };
    }
  };

  // Stock Take (STO)
  const addStockTake = async (data: {
    item_id: string;
    physical_stock: number;
    ba_number: string;
    shift?: string;
    notes?: string;
    applyToStock: boolean;
  }): Promise<{ success: boolean; message: string }> => {
    try {
      const item = items.find(i => i.id === data.item_id);
      if (!item) {
        return { success: false, message: 'Barang tidak ditemukan.' };
      }

      const systemStock = Number(item.current_stock) || 0;
      const physicalStock = Number(data.physical_stock) || 0;
      const variance = physicalStock - systemStock;

      let status: StoVarianceStatus = 'MATCH';
      if (variance > 0) status = 'SURPLUS';
      else if (variance < 0) status = 'DEFICIT';

      const targetShift = data.shift || currentGroup || 'Shift A';

      const stoRecord: StockTake = {
        id: `sto-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        item_id: item.id,
        material_no: item.material_no,
        item_name: item.name,
        location: item.location,
        system_stock: systemStock,
        physical_stock: physicalStock,
        variance,
        status,
        ba_number: data.ba_number.trim() || `BA-STO-${new Date().toISOString().slice(0, 10)}`,
        auditor_username: currentUser?.username || 'staff',
        auditor_group: targetShift,
        notes: data.notes || `Stock Opname Fisik: Selisih ${variance} ${item.unit}`,
        timestamp: new Date().toISOString(),
        applied_to_stock: data.applyToStock
      };

      // 1. Instant optimistic state update for STO
      setStockTakes(prev => [stoRecord, ...prev]);

      const bgPromises: Promise<unknown>[] = [
        syncManager.saveStockTake(stoRecord)
      ];

      // If user chose to apply variance to system stock balance
      if (data.applyToStock && variance !== 0) {
        const stoTx: StockTransaction = {
          id: `tx-sto-${Date.now()}`,
          item_id: item.id,
          material_no: item.material_no,
          item_name: item.name,
          type: 'STO',
          quantity: Math.abs(variance),
          balance_before: systemStock,
          balance_after: physicalStock,
          doc_ref: stoRecord.ba_number,
          pic_name: currentUser?.name || 'Tim Auditor STO',
          operator_username: currentUser?.username || 'supervisor',
          operator_group: targetShift,
          notes: `Penyesuaian Fisik STO: ${status} ${variance > 0 ? '+' : ''}${variance} ${item.unit}`,
          timestamp: new Date().toISOString()
        };

        const updatedItem: InventoryItem = {
          ...item,
          current_stock: physicalStock,
          procurement_status: evaluateProcurementStatus(physicalStock, item.min_stock),
          updated_at: new Date().toISOString(),
          updated_by: currentUser?.username || 'supervisor'
        };

        setTransactions(prev => [stoTx, ...prev]);
        setItems(prev => prev.map(i => i.id === item.id ? updatedItem : i));

        bgPromises.push(syncManager.saveTransaction(stoTx));
        bgPromises.push(syncManager.saveItem(updatedItem));
      }

      Promise.allSettled(bgPromises).catch(err => {
        console.warn('Background sync error on addStockTake:', err);
      });

      return { 
        success: true, 
        message: `Audit STO berhasil disimpan. Status: ${status} (Selisih: ${variance} ${item.unit})${data.applyToStock ? ' & Saldo sistem disesuaikan' : ''}.` 
      };
    } catch (err) {
      return { success: false, message: `Gagal menyimpan STO: ${err instanceof Error ? err.message : String(err)}` };
    }
  };

  // Batch Import (e.g. from Excel/CSV)
  const importItemsBatch = async (
    newItemsData: Omit<InventoryItem, 'id' | 'created_at' | 'updated_at' | 'updated_by'>[]
  ): Promise<{ imported: number; updated: number; failed: number }> => {
    let imported = 0;
    let updated = 0;
    let failed = 0;

    const itemsToSave: InventoryItem[] = [];
    const now = new Date().toISOString();
    const currentUserTag = currentUser?.name || currentUser?.username || 'Supervisor';

    // Fast O(1) lookups
    const existingMap = new Map<string, InventoryItem>();
    for (const it of items) {
      existingMap.set(it.material_no, it);
    }
    const batchSeenMap = new Map<string, InventoryItem>();

    for (const data of newItemsData) {
      try {
        const paddedNo = padTo18Digits(data.material_no);
        if (!paddedNo || paddedNo.length !== 18) {
          failed++;
          continue;
        }

        const existing = existingMap.get(paddedNo) || batchSeenMap.get(paddedNo);
        if (existing) {
          const updatedItem: InventoryItem = {
            ...existing,
            ...data,
            material_no: paddedNo,
            updated_at: now,
            updated_by: currentUserTag,
            procurement_status: evaluateProcurementStatus(data.current_stock, data.min_stock)
          };
          itemsToSave.push(updatedItem);
          batchSeenMap.set(paddedNo, updatedItem);
          updated++;
        } else {
          const newItem: InventoryItem = {
            ...data,
            id: `item-${paddedNo}`,
            material_no: paddedNo,
            created_at: now,
            updated_at: now,
            updated_by: currentUserTag,
            procurement_status: evaluateProcurementStatus(data.current_stock, data.min_stock)
          };
          itemsToSave.push(newItem);
          batchSeenMap.set(paddedNo, newItem);
          imported++;
        }
      } catch {
        failed++;
      }
    }

    if (itemsToSave.length > 0) {
      // 1. Generate initial balance IN transactions for items with current_stock > 0
      const initTxs: StockTransaction[] = [];
      for (const it of itemsToSave) {
        if (it.current_stock > 0) {
          initTxs.push({
            id: `tx-init-${it.material_no}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            item_id: it.id,
            material_no: it.material_no,
            item_name: it.name,
            type: 'IN',
            quantity: it.current_stock,
            balance_before: 0,
            balance_after: it.current_stock,
            doc_ref: 'BA-SALDO-AWAL-IMPORT',
            pic_name: currentUserTag,
            operator_username: currentUser?.username || 'supervisor',
            operator_group: currentGroup || 'Group A',
            notes: 'Saldo awal dari import spreadsheet data master',
            timestamp: now
          });
        }
      }

      // 2. Instant optimistic state update (<10ms)
      setItems(prev => {
        const itemMap = new Map(prev.map(i => [i.id, i]));
        for (const item of itemsToSave) {
          itemMap.set(item.id, item);
        }
        return Array.from(itemMap.values());
      });

      if (initTxs.length > 0) {
        setTransactions(prev => [...initTxs, ...prev]);
      }

      // 3. Persist to local & remote in background
      syncManager.saveItemsBatch(itemsToSave).catch(err => console.warn('Sync items batch error:', err));
      for (const tx of initTxs) {
        syncManager.saveTransaction(tx).catch(err => console.warn('Sync init tx error:', err));
      }
    }

    return { imported, updated, failed };
  };

  const clearAllData = async (): Promise<{ success: boolean; message: string }> => {
    try {
      setItems([]);
      setTransactions([]);
      setStockTakes([]);
      await syncManager.clearAllData();
      return {
        success: true,
        message: 'Seluruh data dummy berhasil dihapus. Database kini bersih (0 barang). Silakan upload file Excel data master asli Anda.'
      };
    } catch (err) {
      await refreshLocalState();
      return {
        success: false,
        message: `Gagal membersihkan database: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  };

  const triggerManualSync = async () => {
    await syncManager.checkCloudAndFlushQueue();
    await refreshLocalState();
  };

  return (
    <InventoryContext.Provider
      value={{
        items,
        transactions,
        stockTakes,
        syncStatus,
        isLoading,
        getItemById,
        getItemByMaterialNo,
        getItemTransactions,
        addItem,
        updateItem,
        deleteItem,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        addStockTake,
        importItemsBatch,
        triggerManualSync,
        clearAllData
      }}
    >
      {children}
    </InventoryContext.Provider>
  );
};

export function useInventory(): InventoryContextType {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error('useInventory must be used within an InventoryProvider');
  }
  return context;
}
