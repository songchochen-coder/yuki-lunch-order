export interface OrderItem {
  name: string;
  price: number;
  quantity: number;
  note?: string; // e.g. 加辣、不要香菜
}

export type PaymentMethod = 'balance' | 'cash' | 'unpaid';

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
  // Payment tracking
  // 'balance' — deducted from stored balance immediately (default; legacy orders)
  // 'cash'    — paid in cash; no balance change
  // 'unpaid'  — pending cash collection; no balance change
  paymentMethod?: PaymentMethod;
  paidAt?: string; // YYYY-MM-DD, set when unpaid → cash
}

// Legacy orders have no paymentMethod; treat them as 'balance'.
export function getPaymentMethod(order: Pick<LunchOrder, 'paymentMethod'>): PaymentMethod {
  return order.paymentMethod ?? 'balance';
}

export function formatPaymentMethod(method: PaymentMethod): string {
  switch (method) {
    case 'balance': return '儲值金';
    case 'cash': return '現金';
    case 'unpaid': return '未付款';
  }
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
  closedDays?: string; // e.g. "週日", "週六、週日", "每月第二個週一"
  items: OrderItem[];
  lastUsed: string;
  useCount: number;
  createdAt: string;
}

export interface BalanceTransaction {
  id: string;
  user: string;
  // 'deposit' +balance; 'deduct' -balance; 'cash' logs a cash receipt (no balance change)
  type: 'deposit' | 'deduct' | 'cash';
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

// Format a Date as YYYY-MM-DD in the LOCAL timezone. Using toISOString() here
// would silently shift the date back one day in UTC+N zones (e.g. Taiwan UTC+8
// where local midnight = 16:00 UTC the previous day), which is why the whole
// "本週" calculation was showing last week's range.
export function toLocalDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Today's date as a local YYYY-MM-DD string.
export function todayStr(): string {
  return toLocalDateStr();
}

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
  return toLocalDateStr(date);
}

export function getWeekDates(dateStr: string): string[] {
  const monday = getWeekStart(dateStr);
  const dates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday + 'T00:00:00');
    d.setDate(d.getDate() + i);
    dates.push(toLocalDateStr(d));
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
