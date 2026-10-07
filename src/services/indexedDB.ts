/**
 * IndexedDB Service for Local & Offline-First Persistence
 * Provides ultra-fast reads, reliable offline capabilities, and sync queue.
 */
import { InventoryItem, StockTransaction, StockTake } from '../types/inventory';

const DB_NAME = 'wms_warehouse_db';
const DB_VERSION = 2;

export interface PendingSyncItem {
  id: string;
  collection: 'items' | 'transactions' | 'stockTakes';
  action: 'set' | 'delete';
  data: unknown;
  timestamp: number;
}

let dbInstance: IDBDatabase | null = null;

export async function getLocalDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('items')) {
        const itemStore = db.createObjectStore('items', { keyPath: 'id' });
        itemStore.createIndex('material_no', 'material_no', { unique: false });
        itemStore.createIndex('category', 'category', { unique: false });
        itemStore.createIndex('location', 'location', { unique: false });
      }

      if (!db.objectStoreNames.contains('transactions')) {
        const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
        txStore.createIndex('item_id', 'item_id', { unique: false });
        txStore.createIndex('material_no', 'material_no', { unique: false });
        txStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      if (!db.objectStoreNames.contains('stockTakes')) {
        const stoStore = db.createObjectStore('stockTakes', { keyPath: 'id' });
        stoStore.createIndex('item_id', 'item_id', { unique: false });
        stoStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      if (!db.objectStoreNames.contains('pending_sync')) {
        db.createObjectStore('pending_sync', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('IndexedDB open error:', (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

// Generic Store Operations
export async function getAllFromLocal<T>(storeName: string): Promise<T[]> {
  try {
    const db = await getLocalDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error(`Error reading ${storeName} from local DB:`, err);
    return [];
  }
}

export async function putToLocal<T extends { id: string }>(storeName: string, item: T): Promise<void> {
  try {
    const db = await getLocalDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(item);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error(`Error putting into ${storeName}:`, err);
  }
}

export async function putBatchToLocal<T extends { id: string }>(storeName: string, items: T[]): Promise<void> {
  try {
    const db = await getLocalDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      items.forEach((item) => store.put(item));

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error(`Error putting batch into ${storeName}:`, err);
  }
}

export async function deleteFromLocal(storeName: string, id: string): Promise<void> {
  try {
    const db = await getLocalDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error(`Error deleting from ${storeName}:`, err);
  }
}

export async function clearLocalStore(storeName: string): Promise<void> {
  try {
    const db = await getLocalDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error(`Error clearing ${storeName}:`, err);
  }
}

// Queue for offline mutations to replay to Firestore when network re-establishes
export async function addPendingSync(item: PendingSyncItem): Promise<void> {
  await putToLocal('pending_sync', item);
}

export async function getPendingSync(): Promise<PendingSyncItem[]> {
  return getAllFromLocal<PendingSyncItem>('pending_sync');
}

export async function removePendingSync(id: string): Promise<void> {
  await deleteFromLocal('pending_sync', id);
}
