import type { Debt } from '../types';

const DEBTS_KEY = 'netflow_debts';
const PENDING_KEY = 'netflow_pending';

export function saveDebts(debts: Debt[]): void { localStorage.setItem(DEBTS_KEY, JSON.stringify(debts)); }
export function loadDebts(): Debt[] | null { const d = localStorage.getItem(DEBTS_KEY); return d ? JSON.parse(d) : null; }
export function savePending(pending: any[]): void { localStorage.setItem(PENDING_KEY, JSON.stringify(pending)); }
export function loadPending(): any[] | null { const d = localStorage.getItem(PENDING_KEY); return d ? JSON.parse(d) : null; }
export function clearStorage(): void { localStorage.removeItem(DEBTS_KEY); localStorage.removeItem(PENDING_KEY); }
export function exportData(debts: Debt[]): void {
  const blob = new Blob([JSON.stringify(debts, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `netflow_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
