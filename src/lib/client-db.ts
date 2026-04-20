import { LunchOrder, Member, MenuTemplate, BalanceTransaction, generateId, getPaymentMethod, applyDiscount } from './types';

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
  const endStr = end.toISOString().split('T')[0];
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

  const paidAt = paidDate || new Date().toISOString().split('T')[0];
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

// Collect cash for ALL of a user's unpaid orders in one shot. Matches the real
// habit of settling a person's whole tab at once instead of order-by-order.
export function collectAllForUser(user: string, paidDate?: string): { count: number; total: number } {
  const orders = getOrders();
  const paidAt = paidDate || new Date().toISOString().split('T')[0];
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

  const date = depositDate || new Date().toISOString().split('T')[0];
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
    date: new Date().toISOString().split('T')[0],
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
    date: new Date().toISOString().split('T')[0],
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
    date: date || new Date().toISOString().split('T')[0],
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
    existing.lastUsed = new Date().toISOString().split('T')[0];
    existing.useCount += 1;
    writeStore('lunch-menus', menus);
    return existing;
  }
  const newMenu: MenuTemplate = {
    ...menu,
    id: generateId(),
    lastUsed: new Date().toISOString().split('T')[0],
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
    existing.lastUsed = new Date().toISOString().split('T')[0];
    existing.useCount += 1;
    writeStore('lunch-menus', menus);
  } else {
    saveMenu({ restaurant, items: items.map(i => ({ name: i.name, price: i.price, quantity: 1 })) });
  }
}
