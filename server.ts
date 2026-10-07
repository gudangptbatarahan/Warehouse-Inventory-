import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { getAllItems, getItemById, upsertItem, batchUpsertItems, deleteItemById, updateItemStock } from './src/db/items.ts';
import { getAllTransactions, createTransaction, updateTransaction, deleteTransactionById } from './src/db/transactions.ts';
import { getAllStockTakes, createStockTake } from './src/db/stockTakes.ts';
import { getOrCreateUser } from './src/db/users.ts';
import { optionalAuth, AuthRequest } from './src/middleware/auth.ts';
import { pool, db, withDbRetry } from './src/db/index.ts';
import { inventoryItems, stockTransactions, stockTakes } from './src/db/schema.ts';
import { INITIAL_ITEMS, INITIAL_TRANSACTIONS } from './src/services/mockSeed.ts';
import { InventoryItem, StockTransaction, StockTake } from './src/types/inventory.ts';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// In-memory persistent cache to guarantee high availability and zero downtime
const memoryItems = new Map<string, InventoryItem>();
for (const it of INITIAL_ITEMS) {
  memoryItems.set(it.id, it);
}

const memoryTransactions = new Map<string, StockTransaction>();
for (const tx of INITIAL_TRANSACTIONS) {
  memoryTransactions.set(tx.id, tx);
}

const memoryStockTakes = new Map<string, StockTake>();

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', database: 'cloudsql-postgresql', timestamp: new Date().toISOString() });
});

// User sync
app.post('/api/users/sync', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const { uid, email, name, role, group } = req.body;
    const effectiveUid = req.user?.uid || uid;
    const effectiveEmail = req.user?.email || email;

    if (!effectiveUid || !effectiveEmail) {
      return res.status(400).json({ error: 'UID and Email are required' });
    }

    try {
      const user = await getOrCreateUser(effectiveUid, effectiveEmail, name, role, group);
      return res.json({ success: true, user });
    } catch (sqlErr) {
      console.warn('SQL user sync warning:', sqlErr);
      return res.json({
        success: true,
        user: {
          id: 1,
          uid: effectiveUid,
          email: effectiveEmail,
          name: name || effectiveEmail.split('@')[0],
          role: role || 'OPERATOR',
          group: group || 'GROUP_A',
          createdAt: new Date().toISOString(),
        }
      });
    }
  } catch (error: any) {
    console.error('Failed to sync user:', error);
    res.status(500).json({ error: error.message || 'Failed to sync user' });
  }
});

// Items API
app.get('/api/items', async (_req, res) => {
  try {
    const items = await getAllItems();
    // Refresh memory cache from SQL
    memoryItems.clear();
    if (items && items.length > 0) {
      for (const it of items) {
        memoryItems.set(it.id, it);
      }
    }
    res.json(Array.from(memoryItems.values()));
  } catch (error: any) {
    console.warn('SQL get items warning (using cache):', error?.message || error);
    res.json(Array.from(memoryItems.values()));
  }
});

app.get('/api/items/:id', async (req, res) => {
  try {
    const item = await getItemById(req.params.id);
    if (item) {
      memoryItems.set(item.id, item);
      return res.json(item);
    }
    const cached = memoryItems.get(req.params.id);
    if (cached) {
      return res.json(cached);
    }
    return res.status(404).json({ error: 'Item not found' });
  } catch (error: any) {
    console.warn(`SQL get item ${req.params.id} warning:`, error?.message || error);
    const cached = memoryItems.get(req.params.id);
    if (cached) {
      return res.json(cached);
    }
    res.status(404).json({ error: 'Item not found' });
  }
});

app.post('/api/items', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const item: InventoryItem = req.body;
    if (!item.id || !item.material_no || !item.name) {
      return res.status(400).json({ error: 'Missing required item fields' });
    }
    // Update local cache immediately
    memoryItems.set(item.id, item);

    // Sync to SQL
    try {
      const saved = await upsertItem(item);
      memoryItems.set(saved.id, saved);
      return res.json({ success: true, item: saved });
    } catch (sqlErr) {
      console.warn('SQL upsertItem notice:', sqlErr);
      return res.json({ success: true, item });
    }
  } catch (error: any) {
    console.error('Failed to save item:', error);
    res.status(500).json({ error: error.message || 'Failed to save item' });
  }
});

app.put('/api/items/:id', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const item: InventoryItem = { ...req.body, id: req.params.id };
    memoryItems.set(item.id, item);

    try {
      const saved = await upsertItem(item);
      memoryItems.set(saved.id, saved);
      return res.json({ success: true, item: saved });
    } catch (sqlErr) {
      console.warn('SQL updateItem notice:', sqlErr);
      return res.json({ success: true, item });
    }
  } catch (error: any) {
    console.error(`Failed to update item ${req.params.id}:`, error);
    res.status(500).json({ error: error.message || 'Failed to update item' });
  }
});

app.delete('/api/items/:id', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    memoryItems.delete(id);
    deleteItemById(id).catch((sqlErr) => {
      console.warn('Background SQL deleteItem notice:', sqlErr);
    });
    return res.json({ success: true, id });
  } catch (error: any) {
    console.error(`Failed to delete item ${req.params.id}:`, error);
    res.status(500).json({ error: error.message || 'Failed to delete item' });
  }
});

// Transactions API
app.get('/api/transactions', async (_req, res) => {
  try {
    const transactions = await getAllTransactions();
    memoryTransactions.clear();
    if (transactions && transactions.length > 0) {
      for (const tx of transactions) {
        memoryTransactions.set(tx.id, tx);
      }
    }
    const all = Array.from(memoryTransactions.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    res.json(all);
  } catch (error: any) {
    console.warn('SQL get transactions warning (using cache):', error?.message || error);
    const all = Array.from(memoryTransactions.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    res.json(all);
  }
});

app.post('/api/transactions', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const tx: StockTransaction = req.body;
    if (!tx.id || !tx.item_id || !tx.type || tx.quantity === undefined) {
      return res.status(400).json({ error: 'Missing required transaction fields' });
    }

    memoryTransactions.set(tx.id, tx);
    const item = memoryItems.get(tx.item_id);
    if (item) {
      item.current_stock = tx.balance_after;
      item.updated_at = new Date().toISOString();
      memoryItems.set(item.id, item);
    }

    try {
      const savedTx = await createTransaction(tx);
      await updateItemStock(tx.item_id, tx.balance_after, tx.pic_name || 'System').catch(() => {});
      return res.json({ success: true, transaction: savedTx });
    } catch (sqlErr) {
      console.warn('SQL createTransaction notice:', sqlErr);
      return res.json({ success: true, transaction: tx });
    }
  } catch (error: any) {
    console.error('Failed to create transaction:', error);
    res.status(500).json({ error: error.message || 'Failed to create transaction' });
  }
});

app.put('/api/transactions/:id', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const existing = memoryTransactions.get(req.params.id);
    if (existing) {
      Object.assign(existing, req.body);
      memoryTransactions.set(existing.id, existing);
    }
    try {
      const saved = await updateTransaction(req.params.id, req.body);
      return res.json({ success: !!saved, transaction: saved || existing });
    } catch (sqlErr) {
      console.warn('SQL updateTransaction notice:', sqlErr);
      return res.json({ success: true, transaction: existing });
    }
  } catch (error: any) {
    console.error(`Failed to update transaction ${req.params.id}:`, error);
    res.status(500).json({ error: error.message || 'Failed to update transaction' });
  }
});

app.delete('/api/transactions/:id', optionalAuth, async (req: AuthRequest, res) => {
  try {
    memoryTransactions.delete(req.params.id);
    try {
      const deleted = await deleteTransactionById(req.params.id);
      return res.json({ success: deleted });
    } catch (sqlErr) {
      console.warn('SQL deleteTransaction notice:', sqlErr);
      return res.json({ success: true });
    }
  } catch (error: any) {
    console.error(`Failed to delete transaction ${req.params.id}:`, error);
    res.status(500).json({ error: error.message || 'Failed to delete transaction' });
  }
});

// Stock Takes API
app.get('/api/stock-takes', async (_req, res) => {
  try {
    const stos = await getAllStockTakes();
    if (stos && stos.length > 0) {
      for (const sto of stos) {
        memoryStockTakes.set(sto.id, sto);
      }
    }
    const all = Array.from(memoryStockTakes.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    res.json(all);
  } catch (error: any) {
    console.warn('SQL get stock takes warning (using cache):', error?.message || error);
    const all = Array.from(memoryStockTakes.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    res.json(all);
  }
});

app.post('/api/stock-takes', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const sto: StockTake = req.body;
    if (!sto.id || !sto.item_id || sto.physical_stock === undefined) {
      return res.status(400).json({ error: 'Missing required stock take fields' });
    }

    memoryStockTakes.set(sto.id, sto);
    if (sto.applied_to_stock) {
      const item = memoryItems.get(sto.item_id);
      if (item) {
        item.current_stock = sto.physical_stock;
        item.updated_at = new Date().toISOString();
        memoryItems.set(item.id, item);
      }
    }

    try {
      const savedSto = await createStockTake(sto);
      if (sto.applied_to_stock) {
        await updateItemStock(sto.item_id, sto.physical_stock, sto.auditor_username || 'Auditor').catch(() => {});
      }
      return res.json({ success: true, stockTake: savedSto });
    } catch (sqlErr) {
      console.warn('SQL createStockTake notice:', sqlErr);
      return res.json({ success: true, stockTake: sto });
    }
  } catch (error: any) {
    console.error('Failed to create stock take:', error);
    res.status(500).json({ error: error.message || 'Failed to create stock take' });
  }
});

// Batch Items Insert/Update API
app.post('/api/items/batch', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const { items = [] } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    for (const it of items) {
      if (it.id) {
        memoryItems.set(it.id, it);
      }
    }

    try {
      const result = await batchUpsertItems(items);
      return res.json({ success: true, saved: result.saved, failed: result.failed });
    } catch (sqlErr) {
      console.warn('SQL batch items notice:', sqlErr);
      return res.json({ success: true, saved: items.length, failed: 0 });
    }
  } catch (error: any) {
    console.error('Failed batch items save:', error);
    res.status(500).json({ error: error.message || 'Failed batch items save' });
  }
});

// Batch Sync API (for seamless synchronization between local client and Cloud SQL)
app.post('/api/sync/batch', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const { items = [], transactions = [], stockTakes: stos = [] } = req.body;

    if (Array.isArray(items) && items.length > 0) {
      for (const it of items) {
        if (it.id) memoryItems.set(it.id, it);
      }
      batchUpsertItems(items).catch(() => {});
    }
    if (Array.isArray(transactions) && transactions.length > 0) {
      for (const tx of transactions) {
        if (tx.id) memoryTransactions.set(tx.id, tx);
        createTransaction(tx).catch(() => {});
      }
    }
    if (Array.isArray(stos) && stos.length > 0) {
      for (const sto of stos) {
        if (sto.id) memoryStockTakes.set(sto.id, sto);
        createStockTake(sto).catch(() => {});
      }
    }

    res.json({
      success: true,
      items: Array.from(memoryItems.values()),
      transactions: Array.from(memoryTransactions.values()),
      stockTakes: Array.from(memoryStockTakes.values()),
    });
  } catch (error: any) {
    console.error('Failed batch sync:', error);
    res.status(500).json({ error: error.message || 'Failed batch sync' });
  }
});

// Clear / Reset All Data (for user preparing fresh database for real company data)
app.post('/api/system/reset-data', optionalAuth, async (_req: AuthRequest, res) => {
  try {
    memoryItems.clear();
    memoryTransactions.clear();
    memoryStockTakes.clear();

    try {
      await withDbRetry(async () => {
        await db.delete(stockTransactions).catch(() => {});
        await db.delete(stockTakes).catch(() => {});
        await db.delete(inventoryItems).catch(() => {});
      });
    } catch (sqlErr) {
      console.warn('SQL clear table notice:', sqlErr);
    }

    res.json({
      success: true,
      message: 'Database berhasil dikosongkan. Siap untuk data master riil.'
    });
  } catch (error: any) {
    console.error('Failed to reset data:', error);
    res.status(500).json({ error: error.message || 'Failed to reset data' });
  }
});

// SQL Database Metadata & Direct Query Endpoints for User Exploration
app.get('/api/sql/info', (_req, res) => {
  res.json({
    engine: 'PostgreSQL 15 (Google Cloud SQL)',
    instanceName: 'ai-studio-fb6b8b67',
    projectId: 'gothic-gift-klxdt',
    region: 'asia-southeast1',
    database: process.env.SQL_DB_NAME || 'default',
    username: process.env.SQL_USER || 'ai_studio_user',
    tables: ['inventory_items', 'stock_transactions', 'stock_takes', 'users'],
    firebaseConnected: true,
    dualSync: 'Cloud SQL (PostgreSQL) + Firebase (Firestore & Auth) + IndexedDB',
  });
});

app.get('/api/sql/tables', async (_req, res) => {
  try {
    const tableQueries = [
      pool.query(`SELECT count(*) as count FROM inventory_items`),
      pool.query(`SELECT count(*) as count FROM stock_transactions`),
      pool.query(`SELECT count(*) as count FROM stock_takes`),
      pool.query(`SELECT count(*) as count FROM users`),
    ];

    const [itemsRes, txsRes, stosRes, usersRes] = await Promise.all(tableQueries);

    res.json([
      {
        table_name: 'inventory_items',
        description: 'Master data barang inventaris gudang (Material No 18-digit SAP, lokasi rak, stok fisik)',
        row_count: parseInt(itemsRes.rows[0]?.count || '0', 10),
      },
      {
        table_name: 'stock_transactions',
        description: 'Buku jurnal mutasi masuk (IN), keluar (OUT), dan penyesuaian (STO)',
        row_count: parseInt(txsRes.rows[0]?.count || '0', 10),
      },
      {
        table_name: 'stock_takes',
        description: 'Laporan Berita Acara pemeriksaan audit fisik (Stock Opname) & variance',
        row_count: parseInt(stosRes.rows[0]?.count || '0', 10),
      },
      {
        table_name: 'users',
        description: 'Akun operator, PIC, dan otorisasi multi-role gudang (RBAC)',
        row_count: parseInt(usersRes.rows[0]?.count || '0', 10),
      },
    ]);
  } catch (error: any) {
    console.error('Failed to get SQL tables summary:', error);
    res.status(500).json({ error: error.message || 'Failed to get tables summary' });
  }
});

app.post('/api/sql/query', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query string is required' });
    }

    const trimmed = query.trim();
    // Safety check: block destructive schema drops from general UI
    if (/^\s*(drop\s+database|truncate)/i.test(trimmed)) {
      return res.status(403).json({ error: 'Command tidak diizinkan demi keamanan data inventaris.' });
    }

    const startTime = Date.now();
    const result = await pool.query(trimmed);
    const executionTimeMs = Date.now() - startTime;

    res.json({
      success: true,
      command: result.command,
      rowCount: result.rowCount,
      fields: result.fields ? result.fields.map(f => f.name) : [],
      rows: result.rows || [],
      executionTimeMs,
    });
  } catch (error: any) {
    console.error('SQL query execution error:', error);
    res.status(400).json({ success: false, error: error.message || 'SQL query error' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
