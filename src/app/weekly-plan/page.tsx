'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { getSettings } from '@/lib/settings';
import { MenuTemplate, OrderItem, getWeekday, formatDate, Member } from '@/lib/types';
import { getMenus, getMembers, createOrder } from '@/lib/client-db';

interface UserSelection {
  name: string;
  items: { itemIdx: number; quantity: number }[];
}

interface DayPlan {
  date: string;
  restaurant: string;
  menuItems: OrderItem[];
  selections: UserSelection[];
}

export default function WeeklyPlanPage() {
  const router = useRouter();
  const today = new Date().toISOString().split('T')[0];

  const [menus, setMenus] = useState<MenuTemplate[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<DayPlan[]>([]);
  const [addingDate, setAddingDate] = useState('');
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeUser, setActiveUser] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    const m = getMembers();
    setMembers(m);
    setMenus(getMenus());
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }, []);

  const allUsers = members.length > 0 ? members.map(m => m.name) : getSettings().users;

  const filteredMenus = menus.filter(m =>
    m.restaurant.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function addDate() {
    if (!addingDate) return;
    if (plans.some(p => p.date === addingDate)) {
      showToast('此日期已新增');
      return;
    }
    setPlans(prev => [...prev, {
      date: addingDate,
      restaurant: '',
      menuItems: [],
      selections: allUsers.map(name => ({ name, items: [] })),
    }].sort((a, b) => a.date.localeCompare(b.date)));
    setAddingDate('');
  }

  function removeDate(idx: number) {
    setPlans(prev => prev.filter((_, i) => i !== idx));
    setEditingDay(null);
  }

  function selectMenuForDay(dayIdx: number, menu: MenuTemplate) {
    setPlans(prev => {
      const updated = [...prev];
      updated[dayIdx] = {
        ...updated[dayIdx],
        restaurant: menu.restaurant,
        menuItems: menu.items.map(i => ({ name: i.name, price: i.price, quantity: 1 })),
        selections: allUsers.map(name => ({ name, items: [] })),
      };
      return updated;
    });
    setEditingDay(null);
    setSearchQuery('');
    setActiveUser(prev => ({ ...prev, [dayIdx]: 0 }));
  }

  function clearDay(dayIdx: number) {
    setPlans(prev => {
      const updated = [...prev];
      updated[dayIdx] = {
        ...updated[dayIdx],
        restaurant: '',
        menuItems: [],
        selections: allUsers.map(name => ({ name, items: [] })),
      };
      return updated;
    });
  }

  function getUserQty(dayIdx: number, userIdx: number, itemIdx: number): number {
    const sel = plans[dayIdx]?.selections[userIdx];
    if (!sel) return 0;
    const found = sel.items.find(si => si.itemIdx === itemIdx);
    return found ? found.quantity : 0;
  }

  function setUserQty(dayIdx: number, userIdx: number, itemIdx: number, qty: number) {
    setPlans(prev => {
      const updated = [...prev];
      const day = { ...updated[dayIdx] };
      const selections = [...day.selections];
      const sel = { ...selections[userIdx], items: [...selections[userIdx].items] };
      const existingIdx = sel.items.findIndex(si => si.itemIdx === itemIdx);
      if (qty <= 0) {
        if (existingIdx >= 0) sel.items.splice(existingIdx, 1);
      } else {
        if (existingIdx >= 0) {
          sel.items[existingIdx] = { ...sel.items[existingIdx], quantity: qty };
        } else {
          sel.items.push({ itemIdx, quantity: qty });
        }
      }
      selections[userIdx] = sel;
      day.selections = selections;
      updated[dayIdx] = day;
      return updated;
    });
  }

  function toggleUserItem(dayIdx: number, userIdx: number, itemIdx: number) {
    const current = getUserQty(dayIdx, userIdx, itemIdx);
    setUserQty(dayIdx, userIdx, itemIdx, current > 0 ? 0 : 1);
  }

  function getUserTotal(dayIdx: number, userIdx: number): number {
    const day = plans[dayIdx];
    if (!day) return 0;
    const sel = day.selections[userIdx];
    if (!sel) return 0;
    return sel.items.reduce((sum, si) => {
      const item = day.menuItems[si.itemIdx];
      return sum + (item ? item.price * si.quantity : 0);
    }, 0);
  }

  function getDayTotal(dayIdx: number): number {
    const day = plans[dayIdx];
    if (!day) return 0;
    return day.selections.reduce((sum, _, uIdx) => sum + getUserTotal(dayIdx, uIdx), 0);
  }

  function getDayOrderCount(dayIdx: number): number {
    const day = plans[dayIdx];
    if (!day) return 0;
    return day.selections.filter(s => s.items.length > 0).length;
  }

  const grandTotal = plans.reduce((sum, _, i) => sum + getDayTotal(i), 0);
  const totalOrderCount = plans.reduce((sum, _, i) => sum + getDayOrderCount(i), 0);

  function handleConfirm() {
    if (totalOrderCount === 0) { showToast('至少要為一位成員點餐'); return; }

    setSaving(true);
    try {
      for (const day of plans) {
        for (const sel of day.selections) {
          if (sel.items.length === 0) continue;
          const orderItems: OrderItem[] = sel.items.map(si => {
            const item = day.menuItems[si.itemIdx];
            return { name: item.name, price: item.price, quantity: si.quantity };
          });
          const total = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
          const itemsText = orderItems.map(i => `${i.name}x${i.quantity}`).join(', ');
          createOrder({
            restaurant: day.restaurant,
            items: orderItems,
            itemsText,
            totalAmount: total,
            date: day.date,
            user: sel.name,
            notes: '預排點餐',
          });
        }
      }
      showToast(`已建立 ${totalOrderCount} 筆訂單！`);
      setTimeout(() => router.push('/history'), 1500);
    } catch {
      showToast('儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn btn-ghost" onClick={() => router.back()} style={{ fontSize: 20, padding: '4px 8px' }}>←</button>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>📅 預排點餐</h1>
      </div>

      {/* Add date */}
      <div className="card mb-4">
        <label className="input-label">新增預排日期</label>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            type="date"
            value={addingDate}
            min={today}
            onChange={e => setAddingDate(e.target.value)}
          />
          <button className="btn btn-primary" onClick={addDate} disabled={!addingDate}>新增</button>
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
          可新增多天，自選日期（跳過假日）
        </p>
      </div>

      {/* Day plans */}
      {plans.length === 0 ? (
        <div className="card text-center py-8 mb-4">
          <p className="text-2xl mb-2">📅</p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>還沒有選擇日期</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mb-4">
          {plans.map((plan, dayIdx) => {
            const activeUserIdx = activeUser[dayIdx] ?? 0;
            const activeSel = plan.selections[activeUserIdx];
            const dayOrderCount = getDayOrderCount(dayIdx);
            const dayTotal = getDayTotal(dayIdx);

            return (
              <div key={plan.date} className="card">
                {/* Day header */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-sm font-bold">{getWeekday(plan.date)}</span>
                    <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>{formatDate(plan.date)}</span>
                    {dayOrderCount > 0 && (
                      <span className="text-xs ml-2" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                        {dayOrderCount}人 · ${dayTotal}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3">
                    {plan.restaurant && (
                      <button className="text-xs" style={{ color: 'var(--color-text-muted)' }} onClick={() => clearDay(dayIdx)}>重選餐廳</button>
                    )}
                    <button className="text-xs" style={{ color: 'var(--color-danger)' }} onClick={() => removeDate(dayIdx)}>移除</button>
                  </div>
                </div>

                {/* Restaurant selection */}
                {editingDay === dayIdx ? (
                  <div className="mb-3">
                    <input
                      className="input mb-2"
                      type="text"
                      placeholder="搜尋餐廳..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      autoFocus
                    />
                    <div className="flex flex-col gap-1" style={{ maxHeight: 200, overflowY: 'auto' }}>
                      {filteredMenus.map(menu => (
                        <button
                          key={menu.id}
                          className="text-left p-2 rounded"
                          style={{ background: 'var(--color-bg)', cursor: 'pointer' }}
                          onClick={() => selectMenuForDay(dayIdx, menu)}
                        >
                          <p className="text-sm font-semibold">{menu.restaurant}</p>
                          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            {menu.items.slice(0, 3).map(i => i.name).join(', ')}
                          </p>
                        </button>
                      ))}
                      {filteredMenus.length === 0 && (
                        <p className="text-xs text-center py-2" style={{ color: 'var(--color-text-muted)' }}>沒有符合的餐廳</p>
                      )}
                    </div>
                    <button className="btn btn-ghost text-xs mt-2" onClick={() => { setEditingDay(null); setSearchQuery(''); }}>取消</button>
                  </div>
                ) : !plan.restaurant ? (
                  <button
                    className="btn btn-outline btn-block text-sm"
                    onClick={() => setEditingDay(dayIdx)}
                  >
                    + 選擇餐廳
                  </button>
                ) : (
                  <>
                    <p className="text-sm font-semibold mb-3" style={{ color: 'var(--color-primary)' }}>{plan.restaurant}</p>

                    {/* User tabs */}
                    <div className="flex gap-1 mb-3" style={{ overflowX: 'auto' }}>
                      {plan.selections.map((sel, uIdx) => {
                        const userTotal = getUserTotal(dayIdx, uIdx);
                        const hasItems = sel.items.length > 0;
                        return (
                          <button
                            key={sel.name}
                            onClick={() => setActiveUser(prev => ({ ...prev, [dayIdx]: uIdx }))}
                            className="btn"
                            style={{
                              minWidth: 0, flex: '1 0 auto', fontSize: 12, padding: '6px 10px',
                              flexDirection: 'column', gap: 2,
                              background: activeUserIdx === uIdx ? 'var(--color-primary)' : hasItems ? '#FFF3E0' : 'var(--color-bg-input)',
                              color: activeUserIdx === uIdx ? 'white' : 'var(--color-text)',
                              border: activeUserIdx === uIdx ? 'none' : hasItems ? '2px solid var(--color-primary)' : '1px solid #E0E0E0',
                            }}
                          >
                            <span>{sel.name}</span>
                            {hasItems && <span style={{ fontSize: 10 }}>${userTotal}</span>}
                          </button>
                        );
                      })}
                    </div>

                    <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
                      為 <strong>{activeSel?.name}</strong> 勾選品項：
                    </p>
                    <div className="flex flex-col gap-1">
                      {plan.menuItems.map((item, itemIdx) => {
                        const qty = getUserQty(dayIdx, activeUserIdx, itemIdx);
                        const selected = qty > 0;
                        return (
                          <div
                            key={itemIdx}
                            className="flex items-center gap-3"
                            style={{
                              padding: '8px 10px', borderRadius: 8,
                              background: selected ? '#FFF3E0' : 'var(--color-bg)',
                              border: selected ? '2px solid var(--color-primary)' : '1px solid #EEE',
                            }}
                          >
                            <button
                              onClick={() => toggleUserItem(dayIdx, activeUserIdx, itemIdx)}
                              style={{
                                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                                border: selected ? 'none' : '2px solid #CCC',
                                background: selected ? 'var(--color-primary)' : 'transparent',
                                color: 'white', fontSize: 13, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >
                              {selected ? '✓' : ''}
                            </button>
                            <div className="flex-1" onClick={() => toggleUserItem(dayIdx, activeUserIdx, itemIdx)}>
                              <p className="text-sm">{item.name}</p>
                              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>${item.price}</p>
                            </div>
                            {selected && (
                              <div className="flex items-center gap-1">
                                <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 14 }} onClick={() => setUserQty(dayIdx, activeUserIdx, itemIdx, qty - 1)}>-</button>
                                <span className="text-sm font-bold" style={{ minWidth: 16, textAlign: 'center' }}>{qty}</span>
                                <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 14 }} onClick={() => setUserQty(dayIdx, activeUserIdx, itemIdx, qty + 1)}>+</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Summary */}
      {totalOrderCount > 0 && (
        <div className="card mb-4" style={{ background: '#FFF3E0' }}>
          <p className="text-sm font-bold">預排總覽</p>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            共 {plans.length} 天 / {totalOrderCount} 筆訂單 / 總計 ${grandTotal.toLocaleString()}
          </p>
        </div>
      )}

      <button
        className="btn btn-primary btn-lg btn-block"
        onClick={handleConfirm}
        disabled={saving || totalOrderCount === 0}
        style={{ marginBottom: 8, fontSize: 17, padding: '14px 0' }}
      >
        {saving ? '建立中...' : `確認送出 (${totalOrderCount}筆)`}
      </button>

      {toast && <div className="toast">{toast}</div>}
      <BottomNav />
    </div>
  );
}
