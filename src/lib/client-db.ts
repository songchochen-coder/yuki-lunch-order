import { LunchOrder, Member, MenuTemplate, BalanceTransaction, generateId, getPaymentMethod, applyDiscount, toLocalDateStr, todayStr } from './types';

function readStore<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return fallback;
    return JSON.parse(stored);
  } catch {
    return fallback;
  }
}

function writeStore<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
}

// ─── Orders ───

export function getOrders(): LunchOrder[] {
  return readStore<LunchOrder[]>('lunch-orders', []);
}

export function getOrdersByWeek(weekStart: string): LunchOrder[] {
  const orders = getOrders();
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 5);
  const endStr = toLocalDateStr(end);
  return orders.filter(o => o.date >= weekStart && o.date < endStr);
}

export function createOrder(order: Omit<LunchOrder, 'id' | 'createdAt'>): LunchOrder {
  const orders = getOrders();
  // Auto-decide payment method: if the caller didn't specify one (normal path),
  // use balance when the member has enough; otherwise mark unpaid for cash collection.
  // Callers can still pass an explicit paymentMethod to override (e.g. future flows).
  let method = order.paymentMethod;
  if (!method) {
    const members = getMembers();
    const member = members.find(m => m.name === order.user);
    method = member && member.balance >= order.totalAmount ? 'balance' : 'unpaid';
  }

  const newOrder: LunchOrder = {
    ...order,
    paymentMethod: method,
    paidAt: method === 'cash' ? (order.paidAt || order.date) : order.paidAt,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  orders.push(newOrder);
  writeStore('lunch-orders', orders);

  const description = `${order.restaurant} - ${order.itemsText}`;
  if (method === 'balance') {
    deductBalance(order.user, order.totalAmount, newOrder.id, description);
  } else if (method === 'cash') {
    recordCashReceipt(order.user, order.totalAmount, newOrder.id, `現金收款 - ${description}`, newOrder.paidAt);
  }
  // 'unpaid' → no transaction; will be logged when collected

  return newOrder;
}

export function updateOrder(id: string, data: Partial<LunchOrder>): LunchOrder | null {
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return null;
  orders[idx] = { ...orders[idx], ...data };
  writeStore('lunch-orders', orders);
  return orders[idx];
}

export function deleteOrder(id: string): boolean {
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return false;
  const order = orders[idx];
  const method = getPaymentMethod(order);
  // Only balance-paid orders touched the stored balance, so only those refund.
  // Cash / unpaid orders have no balance impact to reverse.
  if (method === 'balance') {
    refundBalance(order.user, order.totalAmount, order.id, `退款 - ${order.restaurant}`);
  }
  orders.splice(idx, 1);
  writeStore('lunch-orders', orders);
  return true;
}

// Mark an unpaid order as cash-collected. Returns the updated order, or null if
// the order doesn't exist or isn't in an unpaid state.
export function markOrderPaid(id: string, paidDate?: string): LunchOrder | null {
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return null;
  const order = orders[idx];
  if (getPaymentMethod(order) !== 'unpaid') return null;

  const paidAt = paidDate || todayStr();
  const updated: LunchOrder = { ...order, paymentMethod: 'cash', paidAt };
  orders[idx] = updated;
  writeStore('lunch-orders', orders);

  recordCashReceipt(
    order.user,
    order.totalAmount,
    order.id,
    `現金收款 - ${order.restaurant} - ${order.itemsText}`,
    paidAt,
  );
  return updated;
}

export function getUnpaidOrders(user?: string): LunchOrder[] {
  return getOrders().filter(o => getPaymentMethod(o) === 'unpaid' && (!user || o.user === user));
}

// Back-settle unpaid orders with the member's current stored balance. Walks
// unpaid orders oldest-first and converts each to balance-paid while the
// balance can still cover the next one. Stops when balance runs out — any
// remaining unpaid orders stay unpaid and can be collected later as cash.
//
// Returns how many were settled and the total amount deducted. Used after a
// member deposits new money to clear their accumulated tab in one shot.
export function settleUnpaidWithBalance(user: string): { settled: number; amount: number; remaining: number } {
  const members = getMembers();
  const member = members.find(m => m.name === user);
  if (!member) return { settled: 0, amount: 0, remaining: 0 };

  const orders = getOrders();
  const unpaid = orders
    .map((o, idx) => ({ o, idx }))
    .filter(({ o }) => o.user === user && getPaymentMethod(o) === 'unpaid')
    .sort((a, b) => {
      if (a.o.date !== b.o.date) return a.o.date.localeCompare(b.o.date);
      return (a.o.createdAt || '').localeCompare(b.o.createdAt || '');
    });

  let available = member.balance;
  let settled = 0;
  let amount = 0;
  const settledMeta: { id: string; amt: number; description: string }[] = [];

  for (const { o, idx } of unpaid) {
    if (available < o.totalAmount) break;
    orders[idx] = { ...o, paymentMethod: 'balance' };
    available -= o.totalAmount;
    settled++;
    amount += o.totalAmount;
    settledMeta.push({
      id: o.id,
      amt: o.totalAmount,
      description: `補扣儲值金 - ${o.restaurant} - ${o.itemsText}`,
    });
  }

  const remaining = unpaid.length - settled;
  if (settled === 0) return { settled: 0, amount: 0, remaining };

  // Atomic apply: orders, balance, transactions all at once.
  writeStore('lunch-orders', orders);
  member.balance = available;
  writeStore('lunch-members', members);

  const txs = getTransactions();
  const now = new Date().toISOString();
  const date = todayStr();
  for (const s of settledMeta) {
    txs.push({
      id: generateId(),
      user,
      type: 'deduct',
      amount: s.amt,
      orderId: s.id,
      description: s.description,
      date,
      createdAt: now,
    });
  }
  writeStore('lunch-transactions', txs);

  return { settled, amount, remaining };
}

// Edit an existing order's editable fields. Handles balance reconciliation when
// the user or amount changes on a balance-paid order:
//   - Refund the old amount to the old user
//   - Re-deduct the new amount from the new user if they have enough balance
//   - Otherwise switch paymentMethod to 'unpaid' (no balance change)
// Unpaid orders: just update fields (no balance effect).
// Cash orders: update fields in place; the original cash receipt transaction
// stays in history (user can delete + recreate if they need to fix cash flow).
export function editOrder(
  id: string,
  changes: {
    date?: string;
    user?: string;
    restaurant?: string;
    itemsText?: string;
    totalAmount?: number;
    notes?: string;
  },
): LunchOrder | null {
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return null;
  const old = orders[idx];
  const method = getPaymentMethod(old);

  const newUser = changes.user ?? old.user;
  const newAmount = changes.totalAmount ?? old.totalAmount;
  const userChanged = newUser !== old.user;
  const amountChanged = changes.totalAmount !== undefined && changes.totalAmount !== old.totalAmount;

  // Balance reconciliation (only balance-paid orders touch stored value)
  let newMethod = method;
  if (method === 'balance' && (userChanged || amountChanged)) {
    // Refund original amount to original user
    refundBalance(old.user, old.totalAmount, old.id, `編輯前退款 - ${old.restaurant}`);
    // Try to deduct new amount from new user
    const members = getMembers();
    const target = members.find(m => m.name === newUser);
    if (target && target.balance >= newAmount) {
      deductBalance(newUser, newAmount, old.id, `編輯後扣款 - ${changes.restaurant ?? old.restaurant}`);
      newMethod = 'balance';
    } else {
      // Insufficient balance → let it become unpaid
      newMethod = 'unpaid';
    }
  }

  // Build the updated order
  const base = old.originalAmount ?? old.totalAmount;
  const updated: LunchOrder = {
    ...old,
    ...changes,
    paymentMethod: newMethod,
    paidAt: newMethod === 'cash' ? (old.paidAt ?? old.date) : (newMethod === 'unpaid' ? undefined : old.paidAt),
    // Amount change clears the discount formula (manual override semantics),
    // but keeps originalAmount so we still show the before/after strikethrough.
    originalAmount: amountChanged
      ? (newAmount === base ? undefined : base)
      : old.originalAmount,
    discountType: amountChanged ? undefined : old.discountType,
    discountValue: amountChanged ? undefined : old.discountValue,
  };

  orders[idx] = updated;
  writeStore('lunch-orders', orders);
  return updated;
}

// Reverse a balance-paid order back to unpaid state. Used to retroactively fix
// orders that were placed before the auto-unpaid logic existed (e.g. today's
// orders that deducted balance into the negative). Refunds the amount to the
// member's balance and marks the order as unpaid so it can be collected as cash.
export function markOrderUnpaid(id: string): LunchOrder | null {
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return null;
  const order = orders[idx];
  if (getPaymentMethod(order) !== 'balance') return null;

  const updated: LunchOrder = {
    ...order,
    paymentMethod: 'unpaid',
    paidAt: undefined,
  };
  orders[idx] = updated;
  writeStore('lunch-orders', orders);

  refundBalance(order.user, order.totalAmount, order.id, `改為未付款 - ${order.restaurant}`);
  return updated;
}

// Collect cash for ALL of a user's unpaid orders in one shot. Matches the real
// habit of settling a person's whole tab at once instead of order-by-order.
export function collectAllForUser(user: string, paidDate?: string): { count: number; total: number } {
  const orders = getOrders();
  const paidAt = paidDate || todayStr();
  let count = 0;
  let total = 0;
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    if (o.user !== user || getPaymentMethod(o) !== 'unpaid') continue;
    orders[i] = { ...o, paymentMethod: 'cash', paidAt };
    count++;
    total += o.totalAmount;
    recordCashReceipt(
      user,
      o.totalAmount,
      o.id,
      `現金收款 - ${o.restaurant} - ${o.itemsText}`,
      paidAt,
    );
  }
  if (count > 0) writeStore('lunch-orders', orders);
  return { count, total };
}

// Manually override an order's amount (for exceptions that group-discount can't
// express, e.g. "drinks don't count toward the discount"). Reconciles balance
// for balance-paid orders. Clears discountType/Value because the amount no
// longer follows the group's formula — but keeps originalAmount for history.
// Expected flow: apply group discount first, THEN tweak exceptions.
export function setOrderAmount(id: string, newAmount: number): LunchOrder | null {
  if (newAmount < 0) return null;
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return null;
  const o = orders[idx];
  if (newAmount === o.totalAmount) return o;

  const base = o.originalAmount ?? o.totalAmount;
  const updated: LunchOrder = {
    ...o,
    totalAmount: newAmount,
    originalAmount: newAmount === base ? undefined : base,
    discountType: undefined,
    discountValue: undefined,
  };
  orders[idx] = updated;
  writeStore('lunch-orders', orders);

  const diff = o.totalAmount - newAmount;
  if (getPaymentMethod(o) === 'balance' && diff !== 0) {
    if (diff > 0) refundBalance(o.user, diff, o.id, `手動調整 - ${o.restaurant}`);
    else deductBalance(o.user, -diff, o.id, `手動調整 - ${o.restaurant}`);
  }
  return updated;
}

// Apply a discount retroactively to every order for one restaurant on one date.
// Each person's own amount is recalculated from their originalAmount (captured
// the first time a discount is applied). Balance-paid orders get a refund/extra
// deduction for the diff; unpaid & cash orders just update their recorded amount.
// Pass discountType 'none' (or falsy value) to clear a previously-applied discount.
export function applyGroupDiscount(
  restaurant: string,
  date: string,
  discountType: 'percent' | 'amount' | 'none',
  discountValue: number,
): { affected: number } {
  const orders = getOrders();
  let affected = 0;

  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    if (o.restaurant !== restaurant || o.date !== date) continue;

    // Base we discount FROM = the true original (before any prior discount).
    // If no prior discount, today's totalAmount is already the original.
    const base = o.originalAmount ?? o.totalAmount;

    let newAmount: number;
    let newType: 'percent' | 'amount' | undefined;
    let newValue: number | undefined;

    if (discountType === 'none' || !discountValue || discountValue <= 0) {
      newAmount = base;
      newType = undefined;
      newValue = undefined;
    } else {
      newAmount = applyDiscount(base, discountType, discountValue);
      newType = discountType;
      newValue = discountValue;
    }

    const diff = o.totalAmount - newAmount; // positive = refund owed to balance
    const method = getPaymentMethod(o);

    orders[i] = {
      ...o,
      totalAmount: newAmount,
      originalAmount: newAmount === base ? undefined : base,
      discountType: newType,
      discountValue: newValue,
    };
    affected++;

    // Reconcile balance for balance-paid orders.
    if (method === 'balance' && diff !== 0) {
      if (diff > 0) {
        refundBalance(o.user, diff, o.id, `折扣退款 - ${restaurant}`);
      } else {
        // Negative diff = charge more (discount reduced / removed)
        deductBalance(o.user, -diff, o.id, `折扣調整 - ${restaurant}`);
      }
    }
  }

  writeStore('lunch-orders', orders);
  return { affected };
}

export function getUnpaidTotalsByUser(): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const o of getOrders()) {
    if (getPaymentMethod(o) !== 'unpaid') continue;
    totals[o.user] = (totals[o.user] || 0) + o.totalAmount;
  }
  return totals;
}

// ─── Data retention ───

// Compute the cutoff date (local YYYY-MM-DD) for a retention window. Orders
// with a date strictly older than this are considered expired.
export function getRetentionCutoff(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return toLocalDateStr(d);
}

// Summarize what a cleanup pass would touch without actually deleting.
// Covers orders + transactions (both aged off after `retentionMonths`). Unpaid
// orders are ALWAYS protected from deletion regardless of age.
export function getExpiredSummary(cutoffDate: string): {
  deletableOrders: LunchOrder[];
  protectedUnpaid: LunchOrder[];
  deletableTransactions: number;
  earliestDate: string | null;
} {
  const orders = getOrders();
  const oldOrders = orders.filter(o => o.date < cutoffDate);
  const deletableOrders = oldOrders.filter(o => getPaymentMethod(o) !== 'unpaid');
  const protectedUnpaid = oldOrders.filter(o => getPaymentMethod(o) === 'unpaid');

  const txs = getTransactions();
  const oldTxs = txs.filter(t => t.date < cutoffDate);

  // Earliest date across both sources (for "最早 YYYY-MM-DD" display)
  let earliest: string | null = null;
  for (const o of oldOrders) if (!earliest || o.date < earliest) earliest = o.date;
  for (const t of oldTxs) if (!earliest || t.date < earliest) earliest = t.date;

  return {
    deletableOrders,
    protectedUnpaid,
    deletableTransactions: oldTxs.length,
    earliestDate: earliest,
  };
}

// Delete expired orders (skipping unpaid) + expired transactions. Members,
// balances, and menus are never touched. Returns counts for toast feedback.
export function deleteExpiredData(cutoffDate: string): { deletedOrders: number; deletedTransactions: number } {
  const orders = getOrders();
  const keepOrders = orders.filter(o =>
    o.date >= cutoffDate || getPaymentMethod(o) === 'unpaid'
  );
  const deletedOrders = orders.length - keepOrders.length;
  if (deletedOrders > 0) writeStore('lunch-orders', keepOrders);

  const txs = getTransactions();
  const keepTxs = txs.filter(t => t.date >= cutoffDate);
  const deletedTransactions = txs.length - keepTxs.length;
  if (deletedTransactions > 0) writeStore('lunch-transactions', keepTxs);

  return { deletedOrders, deletedTransactions };
}

export interface BackupSnapshot {
  version: number;
  exportedAt: string;
  orders: LunchOrder[];
  members: Member[];
  transactions: BalanceTransaction[];
  menus: MenuTemplate[];
}

// Return EVERYTHING as a JSON-serialisable snapshot. Intended for manual
// backup before the user prunes old records — also re-used as the safety
// auto-export taken just before importBackup() overwrites everything.
export function exportAllData(): BackupSnapshot {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    orders: getOrders(),
    members: getMembers(),
    transactions: getTransactions(),
    menus: getMenus(),
  };
}

export interface ImportValidation {
  ok: boolean;
  errors: string[];
  counts: { orders: number; members: number; transactions: number; menus: number };
  exportedAt: string | null;
}

// Verify a backup-shaped object before any destructive write. Validates the
// top-level structure plus a sample of each array's required fields. The UI
// uses the result to decide whether to even prompt the user to overwrite.
export function validateBackup(data: unknown): ImportValidation {
  const errors: string[] = [];
  const counts = { orders: 0, members: 0, transactions: 0, menus: 0 };

  if (!data || typeof data !== 'object') {
    return { ok: false, errors: ['檔案不是有效的 JSON 物件'], counts, exportedAt: null };
  }
  const d = data as Record<string, unknown>;

  if (!Array.isArray(d.orders)) errors.push('缺少 orders 陣列');
  else counts.orders = d.orders.length;

  if (!Array.isArray(d.members)) errors.push('缺少 members 陣列');
  else counts.members = d.members.length;

  if (!Array.isArray(d.transactions)) errors.push('缺少 transactions 陣列');
  else counts.transactions = d.transactions.length;

  if (!Array.isArray(d.menus)) errors.push('缺少 menus 陣列');
  else counts.menus = d.menus.length;

  // Spot-check first item shape on each non-empty array
  if (Array.isArray(d.orders) && d.orders.length > 0) {
    const o = d.orders[0] as Record<string, unknown>;
    if (typeof o?.id !== 'string' || typeof o?.user !== 'string' || typeof o?.totalAmount !== 'number') {
      errors.push('orders 內容格式異常');
    }
  }
  if (Array.isArray(d.members) && d.members.length > 0) {
    const m = d.members[0] as Record<string, unknown>;
    if (typeof m?.name !== 'string' || typeof m?.balance !== 'number') {
      errors.push('members 內容格式異常');
    }
  }

  const exportedAt = typeof d.exportedAt === 'string' ? d.exportedAt : null;
  return { ok: errors.length === 0, errors, counts, exportedAt };
}

// Atomically replace every store with the contents of a validated backup.
// Caller is expected to have already saved a safety snapshot of the current
// state via exportAllData() — see the settings page handler.
export function importBackup(data: BackupSnapshot): { imported: { orders: number; members: number; transactions: number; menus: number } } {
  if (typeof window === 'undefined') throw new Error('localStorage unavailable');
  const v = validateBackup(data);
  if (!v.ok) throw new Error('備份資料無效：' + v.errors.join('；'));

  writeStore('lunch-orders', data.orders);
  writeStore('lunch-members', data.members);
  writeStore('lunch-transactions', data.transactions);
  writeStore('lunch-menus', data.menus);

  return {
    imported: {
      orders: data.orders.length,
      members: data.members.length,
      transactions: data.transactions.length,
      menus: data.menus.length,
    },
  };
}

// ─── Members ───

export function getMembers(): Member[] {
  return readStore<Member[]>('lunch-members', []);
}

export function saveMember(name: string): Member {
  const members = getMembers();
  const existing = members.find(m => m.name === name);
  if (existing) return existing;
  const member: Member = { name, balance: 0 };
  members.push(member);
  writeStore('lunch-members', members);
  return member;
}

export function deleteMember(name: string): boolean {
  const members = getMembers();
  const idx = members.findIndex(m => m.name === name);
  if (idx === -1) return false;
  members.splice(idx, 1);
  writeStore('lunch-members', members);
  return true;
}

export function deposit(user: string, amount: number, description?: string, depositDate?: string): BalanceTransaction {
  const members = getMembers();
  const member = members.find(m => m.name === user);
  if (!member) throw new Error(`Member "${user}" not found`);

  member.balance += amount;
  writeStore('lunch-members', members);

  const date = depositDate || todayStr();
  const tx: BalanceTransaction = {
    id: generateId(),
    user,
    type: 'deposit',
    amount,
    description: description || `儲值 $${amount}`,
    date,
    createdAt: new Date().toISOString(),
  };
  const txs = getTransactions();
  txs.push(tx);
  writeStore('lunch-transactions', txs);
  return tx;
}

// Manually adjust a member's balance. Positive = add (same as deposit);
// negative = subtract (refund excess stored value, correct mistakes, etc.).
// Always a positive-valued amount stored in the transaction; the type field
// distinguishes direction. Use description to note WHY the adjustment happened.
export function adjustBalance(
  user: string,
  signedAmount: number,
  description?: string,
  adjustDate?: string,
): BalanceTransaction {
  if (signedAmount === 0) throw new Error('Adjustment cannot be zero');
  const members = getMembers();
  const member = members.find(m => m.name === user);
  if (!member) throw new Error(`Member "${user}" not found`);

  member.balance += signedAmount;
  writeStore('lunch-members', members);

  const date = adjustDate || todayStr();
  const isCredit = signedAmount > 0;
  const magnitude = Math.abs(signedAmount);
  const tx: BalanceTransaction = {
    id: generateId(),
    user,
    type: isCredit ? 'deposit' : 'deduct',
    amount: magnitude,
    description: description || (isCredit ? `儲值 $${magnitude}` : `手動扣款 $${magnitude}`),
    date,
    createdAt: new Date().toISOString(),
  };
  const txs = getTransactions();
  txs.push(tx);
  writeStore('lunch-transactions', txs);
  return tx;
}

function deductBalance(user: string, amount: number, orderId: string, description: string) {
  const members = getMembers();
  const member = members.find(m => m.name === user);
  if (!member) return;

  member.balance -= amount;
  writeStore('lunch-members', members);

  const tx: BalanceTransaction = {
    id: generateId(),
    user,
    type: 'deduct',
    amount,
    orderId,
    description,
    date: todayStr(),
    createdAt: new Date().toISOString(),
  };
  const txs = getTransactions();
  txs.push(tx);
  writeStore('lunch-transactions', txs);
}

function refundBalance(user: string, amount: number, orderId: string, description: string) {
  const members = getMembers();
  const member = members.find(m => m.name === user);
  if (!member) return;

  member.balance += amount;
  writeStore('lunch-members', members);

  const tx: BalanceTransaction = {
    id: generateId(),
    user,
    type: 'deposit',
    amount,
    orderId,
    description,
    date: todayStr(),
    createdAt: new Date().toISOString(),
  };
  const txs = getTransactions();
  txs.push(tx);
  writeStore('lunch-transactions', txs);
}

// Log a cash receipt. Does NOT touch the member's balance — cash is paid outside
// the stored-value system. This gives us an auditable trail of cash collections.
function recordCashReceipt(user: string, amount: number, orderId: string, description: string, date?: string) {
  const tx: BalanceTransaction = {
    id: generateId(),
    user,
    type: 'cash',
    amount,
    orderId,
    description,
    date: date || todayStr(),
    createdAt: new Date().toISOString(),
  };
  const txs = getTransactions();
  txs.push(tx);
  writeStore('lunch-transactions', txs);
}

// ─── Transactions ───

export function getTransactions(user?: string): BalanceTransaction[] {
  const txs = readStore<BalanceTransaction[]>('lunch-transactions', []);
  if (user) return txs.filter(t => t.user === user);
  return txs;
}

// ─── Menus ───

export function getMenus(): MenuTemplate[] {
  return readStore<MenuTemplate[]>('lunch-menus', []);
}

export function saveMenu(menu: { restaurant: string; phone?: string; items: { name: string; price: number; quantity: number }[] }): MenuTemplate {
  const menus = getMenus();
  // If restaurant already exists, merge items instead of creating duplicate
  const existing = menus.find(m => m.restaurant === menu.restaurant);
  if (existing) {
    if (menu.phone && !existing.phone) existing.phone = menu.phone;
    for (const item of menu.items) {
      const existingItem = existing.items.find(i => i.name === item.name);
      if (existingItem) {
        existingItem.price = item.price;
      } else {
        existing.items.push({ name: item.name, price: item.price, quantity: 1 });
      }
    }
    existing.lastUsed = todayStr();
    existing.useCount += 1;
    writeStore('lunch-menus', menus);
    return existing;
  }
  const newMenu: MenuTemplate = {
    ...menu,
    id: generateId(),
    lastUsed: todayStr(),
    useCount: 1,
    createdAt: new Date().toISOString(),
  };
  menus.push(newMenu);
  writeStore('lunch-menus', menus);
  return newMenu;
}

export function updateMenu(id: string, data: Partial<MenuTemplate>): MenuTemplate | null {
  const menus = getMenus();
  const idx = menus.findIndex(m => m.id === id);
  if (idx === -1) return null;
  menus[idx] = { ...menus[idx], ...data };
  writeStore('lunch-menus', menus);
  return menus[idx];
}

export function deleteMenu(id: string): boolean {
  const menus = getMenus();
  const idx = menus.findIndex(m => m.id === id);
  if (idx === -1) return false;
  menus.splice(idx, 1);
  writeStore('lunch-menus', menus);
  return true;
}

function autoSaveMenu(restaurant: string, items: { name: string; price: number; quantity: number }[]) {
  if (!restaurant || items.length === 0) return;
  const menus = getMenus();
  const existing = menus.find(m => m.restaurant === restaurant);
  if (existing) {
    for (const item of items) {
      const existingItem = existing.items.find(i => i.name === item.name);
      if (existingItem) {
        existingItem.price = item.price;
      } else {
        existing.items.push({ name: item.name, price: item.price, quantity: 1 });
      }
    }
    existing.lastUsed = todayStr();
    existing.useCount += 1;
    writeStore('lunch-menus', menus);
  } else {
    saveMenu({ restaurant, items: items.map(i => ({ name: i.name, price: i.price, quantity: 1 })) });
  }
}
