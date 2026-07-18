import type { MenuItem } from '@/types/pos';

/* ── Types ────────────────────────────────────────────── */
export interface MenuSnapshot {
  id: string;
  label: string;
  ts: string;
  items: MenuItem[];
}

export type DiffStatus = 'added' | 'removed' | 'price_changed' | 'unchanged';

export interface DiffRow {
  status: DiffStatus;
  item_name: string;
  category: string;
  old_price: number | null;
  new_price: number | null;
  selector: string;
  available: boolean;
}

export interface DiffResult {
  added: number;
  removed: number;
  price_changed: number;
  unchanged: number;
  rows: DiffRow[];
}

/* ── localStorage keys ───────────────────────────────── */
const STORAGE_KEY = 'revenue-pulse:menu-snapshots';
const MAX_SNAPSHOTS = 10;

/* ── Snapshot persistence ────────────────────────────── */
export function loadSnapshots(): MenuSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MenuSnapshot[]) : [];
  } catch {
    return [];
  }
}

export function saveSnapshot(items: MenuItem[], label?: string): MenuSnapshot {
  const existing = loadSnapshots();
  const ts = new Date().toISOString();
  const snapshot: MenuSnapshot = {
    id: `snap-${Date.now().toString(36)}`,
    label: label || `Snapshot ${existing.length + 1}`,
    ts,
    items,
  };

  // Keep newest MAX_SNAPSHOTS snapshots
  const updated = [snapshot, ...existing].slice(0, MAX_SNAPSHOTS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // localStorage full — try trimming older entries
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([snapshot, ...existing.slice(0, 3)]));
    } catch {}
  }

  return snapshot;
}

export function deleteSnapshot(id: string): void {
  const existing = loadSnapshots();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing.filter((s) => s.id !== id)));
}

export function clearAllSnapshots(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/* ── Diff engine ─────────────────────────────────────── */
export function diffMenus(oldItems: MenuItem[], newItems: MenuItem[]): DiffResult {
  const rows: DiffRow[] = [];

  // Index both by item_name (normalized) for stable comparison
  const oldMap = new Map(oldItems.map((i) => [i.item_name.toLowerCase().trim(), i]));
  const newMap = new Map(newItems.map((i) => [i.item_name.toLowerCase().trim(), i]));

  // Walk new items first — added or changed
  for (const [key, newItem] of newMap) {
    const old = oldMap.get(key);
    if (!old) {
      rows.push({
        status: 'added',
        item_name: newItem.item_name,
        category: newItem.category,
        old_price: null,
        new_price: newItem.item_price,
        selector: newItem.pos_element_selector,
        available: newItem.available,
      });
    } else if (Math.abs(old.item_price - newItem.item_price) > 0.001) {
      rows.push({
        status: 'price_changed',
        item_name: newItem.item_name,
        category: newItem.category,
        old_price: old.item_price,
        new_price: newItem.item_price,
        selector: newItem.pos_element_selector,
        available: newItem.available,
      });
    } else {
      rows.push({
        status: 'unchanged',
        item_name: newItem.item_name,
        category: newItem.category,
        old_price: old.item_price,
        new_price: newItem.item_price,
        selector: newItem.pos_element_selector,
        available: newItem.available,
      });
    }
  }

  // Walk old items — find removals
  for (const [key, oldItem] of oldMap) {
    if (!newMap.has(key)) {
      rows.push({
        status: 'removed',
        item_name: oldItem.item_name,
        category: oldItem.category,
        old_price: oldItem.item_price,
        new_price: null,
        selector: oldItem.pos_element_selector,
        available: false,
      });
    }
  }

  // Sort: changes first (added, removed, price_changed), then unchanged
  const ORDER: Record<DiffStatus, number> = {
    added: 0,
    removed: 1,
    price_changed: 2,
    unchanged: 3,
  };
  rows.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.item_name.localeCompare(b.item_name));

  return {
    added: rows.filter((r) => r.status === 'added').length,
    removed: rows.filter((r) => r.status === 'removed').length,
    price_changed: rows.filter((r) => r.status === 'price_changed').length,
    unchanged: rows.filter((r) => r.status === 'unchanged').length,
    rows,
  };
}

/* ── Helpers ─────────────────────────────────────────── */
export function formatSnapshotLabel(snap: MenuSnapshot): string {
  const d = new Date(snap.ts);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${snap.label} — ${date} ${time} (${snap.items.length} items)`;
}
