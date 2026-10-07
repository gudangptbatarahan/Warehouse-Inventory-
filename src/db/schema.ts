import { pgTable, text, integer, boolean, timestamp, serial } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table linked to Firebase Auth UID
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  username: text('username').notNull().default(''),
  name: text('name').notNull().default(''),
  role: text('role').notNull().default('staff'), // 'admin' | 'supervisor' | 'staff' | 'reviewer' | 'evaluator'
  group: text('group').notNull().default('Group A'), // 'Group A' | 'Group B' | 'Group C' | 'Group D' | 'None'
  createdAt: timestamp('created_at').defaultNow(),
});

// Master Inventory Items table
export const inventoryItems = pgTable('inventory_items', {
  id: text('id').primaryKey(),
  materialNo: text('material_no').notNull().unique(), // 18-digit SAP standard
  name: text('name').notNull(),
  specification: text('specification').notNull().default(''),
  category: text('category').notNull(),
  unit: text('unit').notNull(), // EA, PCS, SET, ROLL, MTR, KG, LTR, BOX, DRUM
  contractType: text('contract_type').notNull().default('NON_FPA'), // 'NON_FPA' | 'FPA'
  location: text('location').notNull(), // Ruang.Rak.Baris.Tingkat
  currentStock: integer('current_stock').notNull().default(0),
  minStock: integer('min_stock').notNull().default(0),
  maxStock: integer('max_stock').notNull().default(0),
  procurementStatus: text('procurement_status').notNull().default('NORMAL'),
  notes: text('notes').default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  updatedBy: text('updated_by').notNull(),
});

// Stock Transactions table (IN / OUT / STO mutations)
export const stockTransactions = pgTable('stock_transactions', {
  id: text('id').primaryKey(),
  itemId: text('item_id').notNull(),
  materialNo: text('material_no').notNull(),
  itemName: text('item_name').default(''),
  type: text('type').notNull(), // 'IN' | 'OUT' | 'STO'
  quantity: integer('quantity').notNull(),
  balanceBefore: integer('balance_before').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  docRef: text('doc_ref').notNull(), // Surat Jalan / PO / Work Order / BA-STO
  picName: text('pic_name').notNull(), // PIC penerima/pengambil
  operatorUsername: text('operator_username').notNull(),
  operatorGroup: text('operator_group').notNull(),
  notes: text('notes').default(''),
  timestamp: text('timestamp').notNull(), // ISO string
});

// Stock Takes (Physical Stock Opname / STO Audit)
export const stockTakes = pgTable('stock_takes', {
  id: text('id').primaryKey(),
  itemId: text('item_id').notNull(),
  materialNo: text('material_no').notNull(),
  itemName: text('item_name').default(''),
  location: text('location').default(''),
  systemStock: integer('system_stock').notNull(),
  physicalStock: integer('physical_stock').notNull(),
  variance: integer('variance').notNull(),
  status: text('status').notNull(), // 'MATCH' | 'SURPLUS' | 'DEFICIT'
  baNumber: text('ba_number').notNull(),
  auditorUsername: text('auditor_username').notNull(),
  auditorGroup: text('auditor_group').notNull(),
  notes: text('notes').default(''),
  timestamp: text('timestamp').notNull(),
  appliedToStock: boolean('applied_to_stock').notNull().default(false),
});

// Relations
export const inventoryItemsRelations = relations(inventoryItems, ({ many }) => ({
  transactions: many(stockTransactions),
  stockTakes: many(stockTakes),
}));

export const stockTransactionsRelations = relations(stockTransactions, ({ one }) => ({
  item: one(inventoryItems, {
    fields: [stockTransactions.itemId],
    references: [inventoryItems.id],
  }),
}));

export const stockTakesRelations = relations(stockTakes, ({ one }) => ({
  item: one(inventoryItems, {
    fields: [stockTakes.itemId],
    references: [inventoryItems.id],
  }),
}));
