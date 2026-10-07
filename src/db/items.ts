import { db, withDbRetry } from './index.ts';
import { inventoryItems, stockTransactions, stockTakes } from './schema.ts';
import { eq, or, sql } from 'drizzle-orm';
import { InventoryItem } from '../types/inventory.ts';

function toDomain(row: typeof inventoryItems.$inferSelect): InventoryItem {
  const spec = row.specification || '';
  return {
    id: row.id,
    material_no: row.materialNo,
    name: row.name,
    specification: spec,
    description: spec,
    category: row.category,
    unit: row.unit,
    contract_type: row.contractType as InventoryItem['contract_type'],
    location: row.location,
    current_stock: Number(row.currentStock) || 0,
    initial_stock: Number(row.currentStock) || 0,
    min_stock: Number(row.minStock) || 0,
    max_stock: Number(row.maxStock) || 0,
    procurement_status: row.procurementStatus as InventoryItem['procurement_status'],
    notes: row.notes || '',
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    updated_by: row.updatedBy,
  };
}

export async function getAllItems(): Promise<InventoryItem[]> {
  try {
    return await withDbRetry(async () => {
      const rows = await db.select().from(inventoryItems);
      return rows.map(toDomain);
    });
  } catch (error) {
    console.error('Failed to fetch items from SQL:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getItemById(id: string): Promise<InventoryItem | null> {
  try {
    return await withDbRetry(async () => {
      const rows = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
      return rows.length > 0 ? toDomain(rows[0]) : null;
    });
  } catch (error) {
    console.error(`Failed to fetch item ${id} from SQL:`, error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function upsertItem(item: InventoryItem): Promise<InventoryItem> {
  try {
    const insertPayload = {
      id: item.id || `item-${item.material_no}`,
      materialNo: item.material_no,
      name: item.name,
      specification: item.specification || item.description || '',
      category: item.category || 'Umum',
      unit: item.unit || 'PCS',
      contractType: item.contract_type || 'NON_FPA',
      location: item.location || '1.01.01.01A',
      currentStock: Number(item.current_stock) || 0,
      minStock: Number(item.min_stock) || 0,
      maxStock: Number(item.max_stock) || 50,
      procurementStatus: item.procurement_status || 'NORMAL',
      notes: item.notes || '',
      createdAt: item.created_at || new Date().toISOString(),
      updatedAt: item.updated_at || new Date().toISOString(),
      updatedBy: item.updated_by || 'Supervisor',
    };

    return await withDbRetry(async () => {
      // Check if item exists by id or materialNo to avoid unique constraint violations
      const existing = await db
        .select()
        .from(inventoryItems)
        .where(
          or(
            eq(inventoryItems.id, insertPayload.id),
            eq(inventoryItems.materialNo, insertPayload.materialNo)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        const targetId = existing[0].id;
        const result = await db
          .update(inventoryItems)
          .set({
            materialNo: insertPayload.materialNo,
            name: insertPayload.name,
            specification: insertPayload.specification,
            category: insertPayload.category,
            unit: insertPayload.unit,
            contractType: insertPayload.contractType,
            location: insertPayload.location,
            currentStock: insertPayload.currentStock,
            minStock: insertPayload.minStock,
            maxStock: insertPayload.maxStock,
            procurementStatus: insertPayload.procurementStatus,
            notes: insertPayload.notes,
            updatedAt: insertPayload.updatedAt,
            updatedBy: insertPayload.updatedBy,
          })
          .where(eq(inventoryItems.id, targetId))
          .returning();

        return toDomain(result[0]);
      } else {
        const result = await db
          .insert(inventoryItems)
          .values(insertPayload)
          .returning();

        return toDomain(result[0]);
      }
    });
  } catch (error: any) {
    console.error('Failed to upsert item in SQL:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function batchUpsertItems(items: InventoryItem[]): Promise<{ saved: number; failed: number }> {
  if (!items || items.length === 0) return { saved: 0, failed: 0 };

  // Deduplicate in memory by material_no keeping latest
  const dedupMap = new Map<string, InventoryItem>();
  for (const it of items) {
    if (it.material_no) {
      dedupMap.set(it.material_no, it);
    }
  }
  const uniqueItems = Array.from(dedupMap.values());

  const chunkSize = 50;
  let saved = 0;
  let failed = 0;

  for (let i = 0; i < uniqueItems.length; i += chunkSize) {
    const chunk = uniqueItems.slice(i, i + chunkSize);
    const chunkRows = chunk.map(it => ({
      id: it.id || `item-${it.material_no}`,
      materialNo: it.material_no,
      name: it.name,
      specification: it.specification || it.description || '',
      category: it.category || 'Mekanikal & Valve',
      unit: it.unit || 'PCS',
      contractType: it.contract_type || 'NON_FPA',
      location: it.location || '1.01.01.01A',
      currentStock: Number(it.current_stock) || 0,
      minStock: Number(it.min_stock) || 0,
      maxStock: Number(it.max_stock) || 50,
      procurementStatus: it.procurement_status || 'NORMAL',
      notes: it.notes || '',
      createdAt: it.created_at || new Date().toISOString(),
      updatedAt: it.updated_at || new Date().toISOString(),
      updatedBy: it.updated_by || 'system',
    }));

    try {
      await withDbRetry(async () => {
        await db
          .insert(inventoryItems)
          .values(chunkRows)
          .onConflictDoUpdate({
            target: inventoryItems.materialNo,
            set: {
              name: sql`excluded.name`,
              specification: sql`excluded.specification`,
              category: sql`excluded.category`,
              unit: sql`excluded.unit`,
              contractType: sql`excluded.contract_type`,
              location: sql`excluded.location`,
              currentStock: sql`excluded.current_stock`,
              minStock: sql`excluded.min_stock`,
              maxStock: sql`excluded.max_stock`,
              procurementStatus: sql`excluded.procurement_status`,
              notes: sql`excluded.notes`,
              updatedAt: sql`excluded.updated_at`,
              updatedBy: sql`excluded.updated_by`,
            },
          });
      });
      saved += chunk.length;
    } catch (chunkErr) {
      console.warn('Batch chunk insert fallback to individual upsert:', chunkErr);
      for (const item of chunk) {
        try {
          await upsertItem(item);
          saved++;
        } catch {
          failed++;
        }
      }
    }
  }

  return { saved, failed };
}

export async function updateItemStock(id: string, newStock: number, updatedBy: string, status?: string): Promise<InventoryItem | null> {
  try {
    const updatePayload: Record<string, unknown> = {
      currentStock: newStock,
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy,
    };
    if (status) {
      updatePayload.procurementStatus = status;
    }

    return await withDbRetry(async () => {
      const result = await db.update(inventoryItems)
        .set(updatePayload)
        .where(eq(inventoryItems.id, id))
        .returning();

      return result.length > 0 ? toDomain(result[0]) : null;
    });
  } catch (error) {
    console.error(`Failed to update item stock ${id} in SQL:`, error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function deleteItemById(id: string): Promise<boolean> {
  try {
    return await withDbRetry(async () => {
      // 1. Delete dependent stock transactions and stock takes first (handles both id and material_no)
      await db.delete(stockTransactions)
        .where(or(eq(stockTransactions.itemId, id), eq(stockTransactions.materialNo, id)))
        .catch(() => {});
      await db.delete(stockTakes)
        .where(or(eq(stockTakes.itemId, id), eq(stockTakes.materialNo, id)))
        .catch(() => {});

      // 2. Delete item from inventoryItems
      const res = await db.delete(inventoryItems)
        .where(or(eq(inventoryItems.id, id), eq(inventoryItems.materialNo, id)))
        .returning();
      return res.length > 0;
    });
  } catch (error) {
    console.error(`Failed to delete item ${id} in SQL:`, error);
    return false;
  }
}
