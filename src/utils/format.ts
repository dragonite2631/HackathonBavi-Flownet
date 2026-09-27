export function formatMoney(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}tr`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)}k`;
  return `${amount}đ`;
}

export function formatDate(dateStr: string): string {
  return dateStr ? dateStr.replace('T', ' ') : '';
}

export function formatFullMoney(amount: number): string {
  return amount.toLocaleString('vi-VN') + 'đ';
}
