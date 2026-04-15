'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { getSettings } from '@/lib/settings';
import { MenuTemplate, OrderItem, getWeekday, formatDate, Member } from '@/lib/types';
import { getMenus, getMembers, createOrder } from '@/lib/client-db';

interface DayPlan {
  date: string;
  restaurant: string;
  items: OrderItem[];
  total: number;
}

export default function WeeklyPlanPage() {
  const router = useRouter();
  const today = new Date().toISOString().split('T')[0];

  const [menus, setMenus] = useState<MenuTemplate[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<DayPlan[]>([]);
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [addingDate, setAddingDate] = useState('');

  useEffect(() => {
    const settings = getSettings();
    const m = getMembers();
    setMembers(m);
    setMenus(getMenus());
    const names = m.length > 0 ? m.map(x => x.name) : settings.users;
    setSelectedUser(names[0] || '');
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }, []);

  const filteredMenus = menus.filter(m =>
    m.restaurant.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function addDate() {
    if (!addingDate) return;
    if (plans.some(p => p.date === addingDate)) {
      showToast('此日期已新增');
      return;
    }
    setPlans(prev => [...prev, { date: addingDate, restaurant: '', items: [], total: 0 }]
      .sort((a, b) => a.date.localeCompare(b.date)));
    setAddingDate('');
  }

  function removeDate(idx: number) {
    setPlans(prev => prev.filter((_, i) => i !== idx));
  }

  function selectMenuForDay(dayIdx: number, menu: MenuTemplate) {
    setPlans(prev => {
      const updated = [...prev];
      const items = menu.items.map(i => ({ ...i, quantity: 1 }));
      updated[dayIdx] = {
        ...updated[dayIdx],
        restaurant: menu.restaurant,
        items,
        total: items.reduce((s, i) => s + i.price * i.quantity, 0),
      };
      return updated;
    });
    setEditingDay(null);
    setSearchQuery('');
  }

  function clearDay(dayIdx: number) {
    setPlans(prev => {
      const updated = [...prev];
      updated[dayIdx] = { ...updated[dayIdx], restaurant: '', items: [], total: 0 };
      return updated;
    });
  }

  const weekTotal = plans.reduce((sum, p) => sum + p.total, 0);
  const filledDays = plans.filter(p => p.restaurant).length;

  const allUsers = members.length > 0 ? members.map(m => m.name) : getSettings().users;

  function handleConfirm() {
    if (!selectedUser) { showToast('請選擇點餐人'); return; }
    if (filledDays === 0) { showToast('至少選擇一天的餐點'); return; }

    setSaving(true);
    try {
      for (const plan of plans) {
        if (!plan.restaurant) continue;
        createOrder({
          restaurant: plan.restaurant,
          items: plan.items.filter(i => i.quantity > 0),
          itemsText: plan.items.filter(i => i.quantity > 0).map(i => `${i.name}x${i.quantity}`).join(', '),
          totalAmount: plan.total,
          date: plan.date,
          user: selectedUser,
          notes: '預排點餐',
        });
      }
      showToast(`已建立 ${filledDays} 天的訂單！`);
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
        <label className="input-label">選擇日期</label>
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
          選擇要預排午餐的日期，可新增多天
        </p>
      </div>

      {/* User selector */}
      <div className="card mb-4">
        <label className="input-label">點餐人</label>
        <div className="flex gap-2 flex-wrap">
          {allUsers.map(u => (
            <button
              key={u}
              className="btn"
              onClick={() => setSelectedUser(u)}
              style={{
                flex: 1, fontSize: 14, padding: '8px 4px',
                background: selectedUser === u ? 'var(--color-primary)' : 'var(--color-bg-input)',
                color: selectedUser === u ? 'white' : 'var(--color-text)',
                border: selectedUser === u ? 'none' : '1px solid #E0E0E0',
              }}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {/* Day plans */}
      {plans.length === 0 ? (
        <div className="card text-center py-8 mb-4">
          <p className="text-2xl mb-2">📅</p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>還沒有選擇日期，請先新增要預排的日期</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mb-4">
          {plans.map((plan, idx) => (
            <div key={plan.date} className="card">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-sm font-bold">{getWeekday(plan.date)}</span>
                  <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>{formatDate(plan.date)}</span>
                </div>
                <div className="flex gap-3">
                  {plan.restaurant && (
                    <button className="text-xs" style={{ color: 'var(--color-text-muted)' }} onClick={() => clearDay(idx)}>清除餐廳</button>
                  )}
                  <button className="text-xs" style={{ color: 'var(--color-danger)' }} onClick={() => removeDate(idx)}>移除</button>
                </div>
              </div>

              {editingDay === idx ? (
                <div>
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
                        onClick={() => selectMenuForDay(idx, menu)}
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
              ) : plan.restaurant ? (
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>{plan.restaurant}</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {plan.items.filter(i => i.quantity > 0).map(i => i.name).join(', ')}
                  </p>
                  <p className="text-sm font-bold mt-1">${plan.total.toLocaleString()}</p>
                </div>
              ) : (
                <button
                  className="btn btn-outline btn-block text-sm"
                  onClick={() => setEditingDay(idx)}
                >
                  + 選擇餐廳
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      {filledDays > 0 && (
        <div className="card mb-4" style={{ background: '#FFF3E0' }}>
          <p className="text-sm font-bold">預排預覽</p>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            已選 {filledDays} 天，總計 ${weekTotal.toLocaleString()}
          </p>
        </div>
      )}

      <button
        className="btn btn-primary btn-lg btn-block"
        onClick={handleConfirm}
        disabled={saving || filledDays === 0}
        style={{ marginBottom: 8, fontSize: 17, padding: '14px 0' }}
      >
        {saving ? '建立中...' : `確認預排點餐 (${filledDays}天)`}
      </button>

      {toast && <div className="toast">{toast}</div>}
      <BottomNav />
    </div>
  );
}
