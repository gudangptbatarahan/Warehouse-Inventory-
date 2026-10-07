import { db } from './index.ts';
import { inventoryItems, stockTransactions } from './schema.ts';
import { INITIAL_ITEMS, INITIAL_TRANSACTIONS } from '../services/mockSeed.ts';

export async function ensureSeeded() {
  try {
    const existing = await db.select().from(inventoryItems).limit(1);
    if (existing.length === 0) {
      console.log('Seeding initial inventory items into PostgreSQL Cloud SQL...');
      for (const item of INITIAL_ITEMS) {
        await db.insert(inventoryItems).values({
          id: item.id,
          materialNo: item.material_no,
          name: item.name,
          specification: item.specification || '',
          category: item.category,
          unit: item.unit,
          contractType: item.contract_type,
          location: item.location,
          currentStock: item.current_stock,
          minStock: item.min_stock,
          maxStock: item.max_stock,
          procurementStatus: item.procurement_status,
          notes: item.notes || '',
          createdAt: item.created_at,
          updatedAt: item.updated_at,
          updatedBy: item.updated_by,
        }).onConflictDoNothing();
      }

      for (const tx of INITIAL_TRANSACTIONS) {
        await db.insert(stockTransactions).values({
          id: tx.id,
          itemId: tx.item_id,
          materialNo: tx.material_no,
          itemName: tx.item_name || '',
          type: tx.type,
          quantity: tx.quantity,
          balanceBefore: tx.balance_before,
          balanceAfter: tx.balance_after,
          docRef: tx.doc_ref,
          picName: tx.pic_name,
          operatorUsername: tx.operator_username,
          operatorGroup: tx.operator_group,
          notes: tx.notes || '',
          timestamp: tx.timestamp,
        }).onConflictDoNothing();
      }
      console.log('Initial inventory seed completed.');
    }
  } catch (error) {
    console.error('Error during initial seed check:', error);
  }
}
