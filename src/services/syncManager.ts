/**
 * Dual Persistence Synchronization Manager
 * Orchestrates Cloud SQL (PostgreSQL), Firebase Cloud Firestore, local IndexedDB cache, and BroadcastChannel.
 * Guarantees that updates in Firebase Console or Cloud SQL immediately reflect in the system.
 */
import { 
  collection, 
  onSnapshot, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  doc, 
  writeBatch,
  Unsubscribe 
} from 'firebase/firestore';
import { db, cleanForFirestore, handleFirestoreError, OperationType, testFirestoreConnection } from './firebase';
import { 
  getAllFromLocal, 
  putToLocal, 
  putBatchToLocal, 
  deleteFromLocal, 
  clearLocalStore,
  addPendingSync, 
  getPendingSync, 
  removePendingSync 
} from './indexedDB';
import { INITIAL_ITEMS, INITIAL_TRANSACTIONS } from './mockSeed';
import { InventoryItem, StockTransaction, StockTake, SyncStatusInfo } from '../types/inventory';

// BroadcastChannel for instant inter-tab communication
const broadcast = typeof BroadcastChannel !== 'undefined' 
  ? new BroadcastChannel('wms_warehouse_channel') 
  : null;

export class SyncManager {
  private static instance: SyncManager;
  private unsubscribers: Unsubscribe[] = [];
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private isSqlConnected = false;
  private isFirestoreConnected = false;
  private syncStatusListeners: ((status: SyncStatusInfo) => void)[] = [];
  private dataChangeListeners: (() => void)[] = [];

  private lastSyncedAt: Date | null = null;
  private pendingCount = 0;

  private constructor() {
    this.setupNetworkListeners();
    this.setupBroadcastChannel();
  }

  public static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  private setupNetworkListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', async () => {
      this.isOnline = true;
      this.startFirestoreListeners();
      await this.flushPendingQueue();
      this.notifyStatus();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.isSqlConnected = false;
      this.isFirestoreConnected = false;
      this.stopFirestoreListeners();
      this.notifyStatus();
    });
  }

  private setupBroadcastChannel(): void {
    if (!broadcast) return;

    broadcast.onmessage = (event) => {
      if (event.data?.type === 'WMS_DATA_MUTATED') {
        this.notifyDataChanged();
      }
    };
  }

  private broadcastMutation(): void {
    if (broadcast) {
      broadcast.postMessage({ type: 'WMS_DATA_MUTATED', timestamp: Date.now() });
    }
  }

  public onStatusChange(callback: (status: SyncStatusInfo) => void): () => void {
    this.syncStatusListeners.push(callback);
    callback(this.getStatus());
    return () => {
      this.syncStatusListeners = this.syncStatusListeners.filter(cb => cb !== callback);
    };
  }

  public onDataChange(callback: () => void): () => void {
    this.dataChangeListeners.push(callback);
    return () => {
      this.dataChangeListeners = this.dataChangeListeners.filter(cb => cb !== callback);
    };
  }

  private notifyStatus(): void {
    const status = this.getStatus();
    this.syncStatusListeners.forEach(cb => cb(status));
  }

  private notifyDataChanged(): void {
    this.dataChangeListeners.forEach(cb => cb());
  }

  public getStatus(): SyncStatusInfo {
    return {
      isOnline: this.isOnline,
      firestoreConnected: this.isFirestoreConnected,
      lastSyncedAt: this.lastSyncedAt,
      pendingSyncCount: this.pendingCount,
      syncSource: this.isSqlConnected || this.isFirestoreConnected ? 'cloud' : 'local'
    };
  }

  /**
   * Initializes data from Cloud SQL, Firestore, and IndexedDB
   */
  public async initialize(): Promise<{
    items: InventoryItem[];
    transactions: StockTransaction[];
    stockTakes: StockTake[];
  }> {
    // 1. Read existing local items
    let localItems = await getAllFromLocal<InventoryItem>('items');
    let localTransactions = await getAllFromLocal<StockTransaction>('transactions');
    let localStockTakes = await getAllFromLocal<StockTake>('stockTakes');

    // 2. Fetch directly from Cloud SQL PostgreSQL Backend
    try {
      const [itemsRes, txRes, stoRes] = await Promise.all([
        fetch('/api/items'),
        fetch('/api/transactions'),
        fetch('/api/stock-takes'),
      ]);

      if (itemsRes.ok) {
        const sqlItems: InventoryItem[] = await itemsRes.json();
        if (Array.isArray(sqlItems) && sqlItems.length > 0) {
          await putBatchToLocal('items', sqlItems);
          localItems = sqlItems;
        }
      }

      if (txRes.ok) {
        const sqlTxs: StockTransaction[] = await txRes.json();
        if (Array.isArray(sqlTxs) && sqlTxs.length > 0) {
          await putBatchToLocal('transactions', sqlTxs);
          localTransactions = sqlTxs;
        }
      }

      if (stoRes.ok) {
        const sqlStos: StockTake[] = await stoRes.json();
        if (Array.isArray(sqlStos) && sqlStos.length > 0) {
          await putBatchToLocal('stockTakes', sqlStos);
          localStockTakes = sqlStos;
        }
      }

      this.isSqlConnected = true;
      this.lastSyncedAt = new Date();
    } catch (sqlErr) {
      console.warn('SQL fetch notice:', sqlErr);
      this.isSqlConnected = false;
    }

    // 3. Check Firestore connection & pull any new documents (like user-added docs from Firebase Console)
    this.isFirestoreConnected = await testFirestoreConnection();
    if (this.isFirestoreConnected) {
      try {
        const [firestoreItemsSnap, firestoreTxSnap] = await Promise.all([
          getDocs(collection(db, 'items')),
          getDocs(collection(db, 'transactions'))
        ]);

        if (!firestoreItemsSnap.empty) {
          const cloudItems: InventoryItem[] = [];
          firestoreItemsSnap.forEach(docSnap => {
            const data = docSnap.data() as InventoryItem;
            if (!data.id) data.id = docSnap.id;
            cloudItems.push(data);
          });

          // Merge into local items & SQL
          for (const it of cloudItems) {
            await putToLocal('items', it);
            // Upsert into SQL backend
            fetch('/api/items', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(it),
            }).catch(() => {});
          }
          localItems = await getAllFromLocal<InventoryItem>('items');
        }

        if (!firestoreTxSnap.empty) {
          const cloudTxs: StockTransaction[] = [];
          firestoreTxSnap.forEach(docSnap => {
            const data = docSnap.data() as StockTransaction;
            if (!data.id) data.id = docSnap.id;
            cloudTxs.push(data);
          });

          for (const tx of cloudTxs) {
            await putToLocal('transactions', tx);
            fetch('/api/transactions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(tx),
            }).catch(() => {});
          }
          localTransactions = await getAllFromLocal<StockTransaction>('transactions');
        }

        // Attach real-time listeners for live updates from Firebase Console
        this.startFirestoreListeners();
      } catch (err) {
        console.warn('Initial Firestore sync notice:', err);
      }
    }

    // 4. Allow system to cleanly operate with 0 items without re-injecting dummy data
    const isFirstEverVisit = typeof localStorage !== 'undefined' && localStorage.getItem('wms_has_ever_visited') !== 'true';

    if (isFirstEverVisit) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('wms_has_ever_visited', 'true');
      }
      if (localItems.length === 0) {
        await putBatchToLocal('items', INITIAL_ITEMS);
        localItems = INITIAL_ITEMS;
        for (const it of INITIAL_ITEMS) {
          setDoc(doc(db, 'items', it.id), cleanForFirestore(it)).catch(() => {});
        }
      }
      if (localTransactions.length === 0) {
        await putBatchToLocal('transactions', INITIAL_TRANSACTIONS);
        localTransactions = INITIAL_TRANSACTIONS;
        for (const tx of INITIAL_TRANSACTIONS) {
          setDoc(doc(db, 'transactions', tx.id), cleanForFirestore(tx)).catch(() => {});
        }
      }
    }

    // 5. Flush any queued offline sync tasks
    if (this.isOnline) {
      await this.flushPendingQueue();
    }

    this.notifyStatus();

    return {
      items: localItems,
      transactions: localTransactions,
      stockTakes: localStockTakes
    };
  }

  /**
   * Real-time listeners to Firestore so updates made in Firebase Console immediately reflect in the app
   */
  public startFirestoreListeners(): void {
    this.stopFirestoreListeners();

    try {
      // Items listener
      const unsubItems = onSnapshot(
        collection(db, 'items'),
        async (snapshot) => {
          if (!snapshot.empty) {
            for (const docChange of snapshot.docChanges()) {
              const data = docChange.doc.data() as InventoryItem;
              if (!data.id) data.id = docChange.doc.id;

              if (docChange.type === 'removed') {
                await deleteFromLocal('items', data.id);
                fetch(`/api/items/${data.id}`, { method: 'DELETE' }).catch(() => {});
              } else {
                await putToLocal('items', data);
                // Also mirror to Cloud SQL
                fetch('/api/items', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(data),
                }).catch(() => {});
              }
            }
            this.lastSyncedAt = new Date();
            this.notifyDataChanged();
            this.notifyStatus();
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, 'items');
        }
      );
      this.unsubscribers.push(unsubItems);

      // Transactions listener
      const unsubTxs = onSnapshot(
        collection(db, 'transactions'),
        async (snapshot) => {
          if (!snapshot.empty) {
            for (const docChange of snapshot.docChanges()) {
              const data = docChange.doc.data() as StockTransaction;
              if (!data.id) data.id = docChange.doc.id;

              if (docChange.type === 'removed') {
                await deleteFromLocal('transactions', data.id);
                fetch(`/api/transactions/${data.id}`, { method: 'DELETE' }).catch(() => {});
              } else {
                await putToLocal('transactions', data);
                // Also mirror to Cloud SQL
                fetch('/api/transactions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(data),
                }).catch(() => {});
              }
            }
            this.lastSyncedAt = new Date();
            this.notifyDataChanged();
            this.notifyStatus();
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, 'transactions');
        }
      );
      this.unsubscribers.push(unsubTxs);
    } catch (err) {
      console.warn('Failed to start Firestore listeners:', err);
    }
  }

  public stopFirestoreListeners(): void {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
  }

  /**
   * Save Item to Cloud SQL + Firestore + Local Cache
   */
  public async saveItem(item: InventoryItem): Promise<void> {
    const cleaned = cleanForFirestore(item) as InventoryItem;

    // 1. Local cache
    await putToLocal('items', cleaned);
    this.broadcastMutation();
    this.notifyDataChanged();

    // 2. Parallelize Cloud SQL + Firestore in background
    const syncPromises: Promise<unknown>[] = [];

    if (this.isOnline) {
      // Cloud SQL Sync
      syncPromises.push(
        fetch('/api/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleaned),
        }).then(() => {
          this.lastSyncedAt = new Date();
          this.isSqlConnected = true;
        }).catch(err => {
          console.warn('SQL saveItem notice:', err);
        })
      );

      // Firestore Sync
      syncPromises.push(
        setDoc(doc(db, 'items', item.id), cleaned)
          .then(() => {
            this.isFirestoreConnected = true;
          })
          .catch(err => {
            handleFirestoreError(err, OperationType.WRITE, `items/${item.id}`);
          })
      );
    } else {
      syncPromises.push(
        addPendingSync({
          id: `item-${item.id}-${Date.now()}`,
          collection: 'items',
          action: 'set',
          data: cleaned,
          timestamp: Date.now()
        }).then(() => {
          this.pendingCount++;
        })
      );
    }

    await Promise.allSettled(syncPromises);
    this.notifyStatus();
  }

  /**
   * Save Batch of Items to Cloud SQL + Firestore + Local Cache
   */
  public async saveItemsBatch(itemsToSave: InventoryItem[]): Promise<void> {
    if (itemsToSave.length === 0) return;

    const cleanedList = itemsToSave.map(it => cleanForFirestore(it) as InventoryItem);

    // 1. Put all into IndexedDB in one operation (instant local cache)
    await putBatchToLocal('items', cleanedList);
    this.broadcastMutation();
    this.notifyDataChanged();

    // 2. Send single bulk request to backend Cloud SQL (non-blocking in background)
    fetch('/api/sync/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cleanedList }),
    }).then(() => {
      this.lastSyncedAt = new Date();
      this.isSqlConnected = true;
    }).catch(err => {
      console.warn('SQL batch save notice:', err);
    });

    // 3. Save to Firestore using writeBatch in chunks of 400 (ultra-fast, 1 request per 400 items)
    try {
      if (this.isOnline) {
        const batchSize = 400;
        for (let i = 0; i < cleanedList.length; i += batchSize) {
          const chunk = cleanedList.slice(i, i + batchSize);
          const batch = writeBatch(db);
          for (const it of chunk) {
            batch.set(doc(db, 'items', it.id), it);
          }
          await batch.commit();
        }
        this.isFirestoreConnected = true;
      } else {
        for (const it of cleanedList) {
          await addPendingSync({
            id: `item-${it.id}-${Date.now()}`,
            collection: 'items',
            action: 'set',
            data: it,
            timestamp: Date.now()
          });
        }
        this.pendingCount += cleanedList.length;
      }
    } catch (err) {
      console.warn('Firestore batch save notice:', err);
    }

    this.notifyStatus();
  }

  /**
   * Delete Item from Cloud SQL + Firestore + Local Cache
   */
  public async deleteItem(id: string): Promise<void> {
    // 1. Instant Local cache deletion (<10ms)
    await deleteFromLocal('items', id);
    this.broadcastMutation();
    this.notifyDataChanged();
    this.notifyStatus();

    // 2. Asynchronous remote deletion (non-blocking)
    const runRemoteDelete = async () => {
      if (this.isOnline) {
        try {
          await fetch(`/api/items/${id}`, { method: 'DELETE' });
        } catch (err) {
          console.warn('SQL deleteItem notice:', err);
        }

        try {
          await deleteDoc(doc(db, 'items', id));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `items/${id}`);
        }
      } else {
        await addPendingSync({
          id: `del-item-${id}-${Date.now()}`,
          collection: 'items',
          action: 'delete',
          data: { id },
          timestamp: Date.now()
        });
        this.pendingCount++;
      }
    };

    runRemoteDelete().catch(err => console.warn('Remote delete notice:', err));
  }

  /**
   * Completely clear all dummy / sample data from the database
   * (Prepares the system cleanly for user to import real warehouse data)
   */
  public async clearAllData(): Promise<void> {
    // 1. Mark in localStorage so auto-seed never re-populates dummy data
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('wms_dummy_cleared', 'true');
    }

    // 2. Clear all local IndexedDB stores
    await Promise.all([
      clearLocalStore('items'),
      clearLocalStore('transactions'),
      clearLocalStore('stockTakes'),
      clearLocalStore('pending_sync')
    ]);

    this.pendingCount = 0;
    this.broadcastMutation();
    this.notifyDataChanged();

    // 3. Clear remote Firestore documents in batches
    try {
      if (this.isOnline) {
        const [itemsSnap, txSnap] = await Promise.all([
          getDocs(collection(db, 'items')),
          getDocs(collection(db, 'transactions'))
        ]);

        if (!itemsSnap.empty) {
          const batch = writeBatch(db);
          itemsSnap.docs.slice(0, 450).forEach(d => batch.delete(d.ref));
          await batch.commit().catch(() => {});
        }
        if (!txSnap.empty) {
          const batch = writeBatch(db);
          txSnap.docs.slice(0, 450).forEach(d => batch.delete(d.ref));
          await batch.commit().catch(() => {});
        }
      }
    } catch (err) {
      console.warn('Firestore clearAllData notice:', err);
    }

    // 4. Reset backend SQL & Memory Cache
    try {
      await fetch('/api/system/reset-data', { method: 'POST' });
    } catch (err) {
      console.warn('SQL reset notice:', err);
    }

    this.notifyStatus();
  }

  /**
   * Save Transaction to Cloud SQL + Firestore + Local Cache
   */
  public async saveTransaction(tx: StockTransaction): Promise<void> {
    const cleaned = cleanForFirestore(tx) as StockTransaction;

    // 1. Local cache
    await putToLocal('transactions', cleaned);
    this.broadcastMutation();
    this.notifyDataChanged();

    // 2. Cloud SQL
    try {
      if (this.isOnline) {
        await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleaned),
        });
        this.lastSyncedAt = new Date();
        this.isSqlConnected = true;
      }
    } catch (err) {
      console.warn('SQL saveTransaction notice:', err);
    }

    // 3. Firestore
    try {
      if (this.isOnline) {
        await setDoc(doc(db, 'transactions', tx.id), cleaned);
        this.isFirestoreConnected = true;
      } else {
        await addPendingSync({
          id: `tx-${tx.id}-${Date.now()}`,
          collection: 'transactions',
          action: 'set',
          data: cleaned,
          timestamp: Date.now()
        });
        this.pendingCount++;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `transactions/${tx.id}`);
    }

    this.notifyStatus();
  }

  /**
   * Delete Transaction from Cloud SQL + Firestore + Local Cache
   */
  public async deleteTransaction(id: string): Promise<void> {
    // 1. Local cache
    await deleteFromLocal('transactions', id);
    this.broadcastMutation();
    this.notifyDataChanged();

    // 2. Cloud SQL
    try {
      if (this.isOnline) {
        await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
      }
    } catch (err) {
      console.warn('SQL deleteTransaction notice:', err);
    }

    // 3. Firestore
    try {
      if (this.isOnline) {
        await deleteDoc(doc(db, 'transactions', id));
      } else {
        await addPendingSync({
          id: `del-tx-${id}-${Date.now()}`,
          collection: 'transactions',
          action: 'delete',
          data: { id },
          timestamp: Date.now()
        });
        this.pendingCount++;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `transactions/${id}`);
    }

    this.notifyStatus();
  }

  /**
   * Save Stock Take
   */
  public async saveStockTake(sto: StockTake): Promise<void> {
    const cleaned = cleanForFirestore(sto) as StockTake;

    await putToLocal('stockTakes', cleaned);
    this.broadcastMutation();
    this.notifyDataChanged();

    try {
      if (this.isOnline) {
        await fetch('/api/stock-takes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleaned),
        });
      }
    } catch (err) {
      console.warn('SQL saveStockTake notice:', err);
    }

    try {
      if (this.isOnline) {
        await setDoc(doc(db, 'stockTakes', sto.id), cleaned);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `stockTakes/${sto.id}`);
    }

    this.notifyStatus();
  }

  public async checkCloudAndFlushQueue(): Promise<void> {
    await this.flushPendingQueue();
  }

  /**
   * Flushes offline queued tasks
   */
  private async flushPendingQueue(): Promise<void> {
    try {
      const pending = await getPendingSync();
      this.pendingCount = pending.length;
      if (pending.length === 0) return;

      for (const task of pending) {
        try {
          if (task.collection === 'items') {
            if (task.action === 'set') {
              const it = task.data as InventoryItem;
              await fetch('/api/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(it),
              });
              await setDoc(doc(db, 'items', it.id), cleanForFirestore(it));
            } else if (task.action === 'delete') {
              const { id } = task.data as { id: string };
              await fetch(`/api/items/${id}`, { method: 'DELETE' });
              await deleteDoc(doc(db, 'items', id));
            }
          } else if (task.collection === 'transactions') {
            if (task.action === 'set') {
              const tx = task.data as StockTransaction;
              await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tx),
              });
              await setDoc(doc(db, 'transactions', tx.id), cleanForFirestore(tx));
            } else if (task.action === 'delete') {
              const { id } = task.data as { id: string };
              await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
              await deleteDoc(doc(db, 'transactions', id));
            }
          }
          await removePendingSync(task.id);
        } catch (err) {
          console.error('Failed to flush task:', task.id, err);
        }
      }

      const remaining = await getPendingSync();
      this.pendingCount = remaining.length;
      this.lastSyncedAt = new Date();
      this.notifyStatus();
    } catch (err) {
      console.warn('Queue flush notice:', err);
    }
  }
}

export const syncManager = SyncManager.getInstance();
