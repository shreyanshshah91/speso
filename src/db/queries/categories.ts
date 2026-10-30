import type { SQLiteDatabase } from 'expo-sqlite';

import type { Category, TransactionType } from '@/types';

interface CategoryRow {
  id: number;
  name: string;
  icon: string;
  color: string;
  type: TransactionType;
  is_default: number;
  sort_order: number;
}

function mapRow(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    type: row.type,
    isDefault: row.is_default === 1,
    sortOrder: row.sort_order,
  };
}

export async function listCategories(
  db: SQLiteDatabase,
  type?: TransactionType
): Promise<Category[]> {
  const rows = type
    ? await db.getAllAsync<CategoryRow>(
        'SELECT * FROM categories WHERE type = ? ORDER BY sort_order ASC, name ASC',
        type
      )
    : await db.getAllAsync<CategoryRow>('SELECT * FROM categories ORDER BY sort_order ASC, name ASC');
  return rows.map(mapRow);
}

export async function createCategory(
  db: SQLiteDatabase,
  input: Pick<Category, 'name' | 'icon' | 'color' | 'type'>
): Promise<number> {
  const maxRow = await db.getFirstAsync<{ maxOrder: number | null }>(
    'SELECT MAX(sort_order) as maxOrder FROM categories WHERE type = ?',
    input.type
  );
  const sortOrder = (maxRow?.maxOrder ?? -1) + 1;
  const result = await db.runAsync(
    'INSERT INTO categories (name, icon, color, type, is_default, sort_order) VALUES (?, ?, ?, ?, 0, ?)',
    input.name,
    input.icon,
    input.color,
    input.type,
    sortOrder
  );
  return result.lastInsertRowId;
}

export async function updateCategory(
  db: SQLiteDatabase,
  id: number,
  input: Pick<Category, 'name' | 'icon' | 'color'>
) {
  await db.runAsync(
    'UPDATE categories SET name = ?, icon = ?, color = ? WHERE id = ?',
    input.name,
    input.icon,
    input.color,
    id
  );
}

export async function deleteCategory(db: SQLiteDatabase, id: number) {
  const count = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM transactions WHERE category_id = ?',
    id
  );
  if ((count?.c ?? 0) > 0) {
    throw new Error('Cannot delete a category that has transactions. Reassign them first.');
  }
  await db.runAsync('DELETE FROM categories WHERE id = ?', id);
}

export async function reorderCategories(db: SQLiteDatabase, orderedIds: number[]) {
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.runAsync('UPDATE categories SET sort_order = ? WHERE id = ?', i, orderedIds[i]);
    }
  });
}
