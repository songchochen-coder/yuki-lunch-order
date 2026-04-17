import { LunchOrder, Member, MenuTemplate, BalanceTransaction, generateId } from './types';

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
  const newOrder: LunchOrder = {
    ...order,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  orders.push(newOrder);
  writeStore('lunch-orders', orders);

  deductBalance(order.user, order.totalAmount, newOrder.id, `${order.restaurant} - ${order.itemsText}`);

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
  refundBalance(order.user, order.totalAmount, order.id, `退款 - ${order.restaurant}`);
  orders.splice(idx, 1);
  writeStore('lunch-orders', orders);
  return true;
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

export function saveMenu(menu: { restaurant: string; items: { name: string; price: number; quantity: number }[] }): MenuTemplate {
  const menus = getMenus();
  // If restaurant already exists, merge items instead of creating duplicate
  const existing = menus.find(m => m.restaurant === menu.restaurant);
  if (existing) {
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
