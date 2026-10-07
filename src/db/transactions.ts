import { db, withDbRetry } from './index.ts';
import { stockTransactions, inventoryItems } from './schema.ts';
import { eq, or, desc } from 'drizzle-orm';
import { StockTransaction } from '../types/inventory.ts';

function toDomain(row: typeof stockTransactions.$inferSelect): StockTransaction {
  return {
    id: row.id,
    item_id: row.itemId,
    material_no: row.materialNo,
    item_name: row.itemName || '',
    type: row.type as StockTransaction['type'],
    quantity: row.quantity,
    balance_before: row.balanceBefore,
    balance_after: row.balanceAfter,
    doc_ref: row.docRef,
    pic_name: row.picName,
    operator_username: row.operatorUsername,
    operator_group: row.operatorGroup as StockTransaction['operator_group'],
    notes: row.notes || '',
    timestamp: row.timestamp,
  };
}

export async function getAllTransactions(): Promise<StockTransaction[]> {
  try {
    return await withDbRetry(async () => {
      const rows = await db.select().from(stockTransactions).orderBy(desc(stockTransactions.timestamp));
      return rows.map(toDomain);
    });
  } catch (error) {
    console.error('Failed to fetch transactions from SQL:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getTransactionsByItemId(itemId: string): Promise<StockTransaction[]> {
  try {
    return await withDbRetry(async () => {
      const rows = await db.select()
        .from(stockTransactions)
        .where(eq(stockTransactions.itemId, itemId))
        .orderBy(desc(stockTransactions.timestamp));
      return rows.map(toDomain);
    });
  } catch (error) {
    console.error(`Failed to fetch transactions for item ${itemId} from SQL:`, error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function createTransaction(tx: StockTransaction): Promise<StockTransaction> {
  try {
    const payload = {
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
    };

    return await withDbRetry(async () => {
      // 1. Ensure parent item exists in inventory_items to satisfy foreign key constraint
      const existing = await db.select({ id: inventoryItems.id })
        .from(inventoryItems)
        .where(or(eq(inventoryItems.id, payload.itemId), eq(inventoryItems.materialNo, payload.materialNo)))
        .limit(1);

      if (existing.length > 0) {
        payload.itemId = existing[0].id;
      } else {
        const fallbackId = payload.itemId || `item-${payload.materialNo}`;
        payload.itemId = fallbackId;
        await db.insert(inventoryItems).values({
          id: fallbackId,
          materialNo: payload.materialNo,
          name: payload.itemName || `Item ${payload.materialNo}`,
          specification: '',
          category: 'Mekanik & Sparepart',
          unit: 'PCS',
          contractType: 'NON_FPA',
          location: '1.01.01.01A',
          currentStock: payload.balanceAfter,
          minStock: 5,
          maxStock: 50,
          procurementStatus: 'NORMAL',
          notes: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          updatedBy: payload.operatorUsername || 'system',
        }).onConflictDoNothing();
      }

      const result = await db.insert(stockTransactions)
        .values(payload)
        .onConflictDoUpdate({
          target: stockTransactions.id,
          set: {
            itemId: payload.itemId,
            materialNo: payload.materialNo,
            itemName: payload.itemName,
            type: payload.type,
            quantity: payload.quantity,
            balanceBefore: payload.balanceBefore,
            balanceAfter: payload.balanceAfter,
            docRef: payload.docRef,
            picName: payload.picName,
            operatorUsername: payload.operatorUsername,
            operatorGroup: payload.operatorGroup,
            notes: payload.notes,
            timestamp: payload.timestamp,
          }
        })
        .returning();

      return toDomain(result[0]);
    });
  } catch (error) {
    console.error('Failed to create transaction in SQL:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function updateTransaction(
  id: string, 
  updates: Partial<Pick<StockTransaction, 'quantity' | 'doc_ref' | 'pic_name' | 'notes' | 'timestamp' | 'balance_after'>>
): Promise<StockTransaction | null> {
  try {
    const setPayload: Record<string, unknown> = {};
    if (updates.quantity !== undefined) setPayload.quantity = updates.quantity;
    if (updates.doc_ref !== undefined) setPayload.docRef = updates.doc_ref;
    if (updates.pic_name !== undefined) setPayload.picName = updates.pic_name;
    if (updates.notes !== undefined) setPayload.notes = updates.notes;
    if (updates.timestamp !== undefined) setPayload.timestamp = updates.timestamp;
    if (updates.balance_after !== undefined) setPayload.balanceAfter = updates.balance_after;

    return await withDbRetry(async () => {
      const result = await db.update(stockTransactions)
        .set(setPayload)
        .where(eq(stockTransactions.id, id))
        .returning();

      return result.length > 0 ? toDomain(result[0]) : null;
    });
  } catch (error) {
    console.error(`Failed to update transaction ${id} in SQL:`, error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function deleteTransactionById(id: string): Promise<boolean> {
  try {
    return await withDbRetry(async () => {
      const res = await db.delete(stockTransactions).where(eq(stockTransactions.id, id)).returning();
      return res.length > 0;
    });
  } catch (error) {
    console.error(`Failed to delete transaction ${id} in SQL:`, error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}
