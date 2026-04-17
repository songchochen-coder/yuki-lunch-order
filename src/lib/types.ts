export interface OrderItem {
  name: string;
  price: number;
  quantity: number;
  note?: string; // e.g. 加辣、不要香菜
}

export interface LunchOrder {
  id: string;
  restaurant: string;
  items: OrderItem[];
  itemsText: string;
  totalAmount: number;        // final amount after discount
  originalAmount?: number;    // before discount
  discountType?: 'percent' | 'amount';
  discountValue?: number;     // percent: 9 means 9折 (0.9x); amount: $ deducted
  date: string; // YYYY-MM-DD
  user: string;
  notes: string;
  createdAt: string;
}

export function applyDiscount(
  amount: number,
  discountType?: 'percent' | 'amount',
  discountValue?: number,
): number {
  if (!discountType || !discountValue || discountValue <= 0) return amount;
  if (discountType === 'percent') {
    // 9折 => value=9 => multiplier 0.9
    const multiplier = Math.min(Math.max(discountValue, 0), 10) / 10;
    return Math.round(amount * multiplier);
  }
  // amount discount
  return Math.max(0, amount - discountValue);
}

export function formatDiscount(discountType?: 'percent' | 'amount', discountValue?: number): string {
  if (!discountType || !discountValue || discountValue <= 0) return '';
  if (discountType === 'percent') return `${discountValue}折`;
  return `-$${discountValue}`;
}

export interface Member {
  name: string;
  balance: number;
}

export interface MenuTemplate {
  id: string;
  restaurant: string;
  phone?: string;
  items: OrderItem[];
  lastUsed: string;
  useCount: number;
  createdAt: string;
}

export interface BalanceTransaction {
  id: string;
  user: string;
  type: 'deposit' | 'deduct';
  amount: number;
  orderId?: string;
  description: string;
  date: string;
  createdAt: string;
}

export interface AppSettings {
  users: string[];
  geminiApiKey?: string;
}

export interface AnalyzeResult {
  restaurant: string;
  phone?: string;
  items: OrderItem[];
  totalAmount: number;
}

export const WEEKDAYS = ['週一', '週二', '週三', '週四', '週五'] as const;

export function getWeekday(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDay();
  const map: Record<number, string> = {
    1: '週一', 2: '週二', 3: '週三', 4: '週四', 5: '週五',
    6: '週六', 0: '週日',
  };
  return map[day] || '';
}

export function getWeekStart(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().split('T')[0];
}

export function getWeekDates(dateStr: string): string[] {
  const monday = getWeekStart(dateStr);
  const dates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday + 'T00:00:00');
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
