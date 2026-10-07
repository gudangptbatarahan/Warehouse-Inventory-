import { db, withDbRetry } from './index.ts';
import { stockTakes, inventoryItems } from './schema.ts';
import { eq, or, desc } from 'drizzle-orm';
import { StockTake } from '../types/inventory.ts';

function toDomain(row: typeof stockTakes.$inferSelect): StockTake {
  return {
    id: row.id,
    item_id: row.itemId,
    material_no: row.materialNo,
    item_name: row.itemName || '',
    location: row.location || '',
    system_stock: row.systemStock,
    physical_stock: row.physicalStock,
    variance: row.variance,
    status: row.status as StockTake['status'],
    ba_number: row.baNumber,
    auditor_username: row.auditorUsername,
    auditor_group: row.auditorGroup as StockTake['auditor_group'],
    notes: row.notes || '',
    timestamp: row.timestamp,
    applied_to_stock: row.appliedToStock,
  };
}

export async function getAllStockTakes(): Promise<StockTake[]> {
  try {
    return await withDbRetry(async () => {
      const rows = await db.select().from(stockTakes).orderBy(desc(stockTakes.timestamp));
      return rows.map(toDomain);
    });
  } catch (error) {
    console.error('Failed to fetch stock takes from SQL:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function createStockTake(sto: StockTake): Promise<StockTake> {
  try {
    const payload = {
      id: sto.id,
      itemId: sto.item_id,
      materialNo: sto.material_no,
      itemName: sto.item_name || '',
      location: sto.location || '',
      systemStock: sto.system_stock,
      physicalStock: sto.physical_stock,
      variance: sto.variance,
      status: sto.status,
      baNumber: sto.ba_number,
      auditorUsername: sto.auditor_username,
      auditorGroup: sto.auditor_group,
      notes: sto.notes || '',
      timestamp: sto.timestamp,
      appliedToStock: sto.applied_to_stock,
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
          location: payload.location || '1.01.01.01A',
          currentStock: payload.physicalStock,
          minStock: 5,
          maxStock: 50,
          procurementStatus: 'NORMAL',
          notes: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          updatedBy: payload.auditorUsername || 'system',
        }).onConflictDoNothing();
      }

      const result = await db.insert(stockTakes)
        .values(payload)
        .onConflictDoUpdate({
          target: stockTakes.id,
          set: {
            physicalStock: payload.physicalStock,
            variance: payload.variance,
            status: payload.status,
            baNumber: payload.baNumber,
            auditorUsername: payload.auditorUsername,
            auditorGroup: payload.auditorGroup,
            notes: payload.notes,
            timestamp: payload.timestamp,
            appliedToStock: payload.appliedToStock,
          }
        })
        .returning();

      return toDomain(result[0]);
    });
  } catch (error) {
    console.error('Failed to create stock take in SQL:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}
