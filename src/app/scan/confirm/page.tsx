'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { getSettings } from '@/lib/settings';
import type { AnalyzeResult, OrderItem } from '@/lib/types';
import { applyDiscount, formatDiscount } from '@/lib/types';
import { getMembers, createOrder, saveMenu } from '@/lib/client-db';

interface UserSelection {
  name: string;
  items: { itemIdx: number; quantity: number; note?: string }[];
}

export default function ConfirmPage() {
  const router = useRouter();

  const [restaurant, setRestaurant] = useState('');
  const [phone, setPhone] = useState('');
  const [menuItems, setMenuItems] = useState<OrderItem[]>([]);
  const [date, setDate] = useState('');
  const [users, setUsers] = useState<string[]>([]);
  const [selections, setSelections] = useState<UserSelection[]>([]);
  const [activeUser, setActiveUser] = useState(0);
  const [notes, setNotes] = useState('');
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'amount'>('none');
  const [discountValue, setDiscountValue] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }, []);

  useEffect(() => {
    const settings = getSettings();
    const m = getMembers();
    const names = m.length > 0 ? m.map(x => x.name) : settings.users;
    setUsers(names);

    const stored = sessionStorage.getItem('analyzeResult');
    if (!stored) {
      router.replace('/scan');
      return;
    }

    try {
      const result: AnalyzeResult = JSON.parse(stored);
      setRestaurant(result.restaurant || '未知餐廳');
      setPhone(result.phone || '');
      setMenuItems(result.items || []);
      setDate(new Date().toISOString().split('T')[0]);
      // Initialize empty selections for each user
      setSelections(names.map(name => ({ name, items: [] })));
      setLoaded(true);
    } catch {
      router.replace('/scan');
    }
  }, [router]);

  function updateMenuItem(index: number, field: keyof OrderItem, value: string | number) {
    setMenuItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function removeMenuItem(index: number) {
    setMenuItems(prev => prev.filter((_, i) => i !== index));
    // Also remove from all selections
    setSelections(prev => prev.map(sel => ({
      ...sel,
      items: sel.items
        .filter(si => si.itemIdx !== index)
        .map(si => ({ ...si, itemIdx: si.itemIdx > index ? si.itemIdx - 1 : si.itemIdx })),
    })));
  }

  function addMenuItem() {
    setMenuItems(prev => [...prev, { name: '', price: 0, quantity: 1 }]);
  }

  function getUserQty(userIdx: number, itemIdx: number): number {
    const sel = selections[userIdx];
    if (!sel) return 0;
    const found = sel.items.find(si => si.itemIdx === itemIdx);
    return found ? found.quantity : 0;
  }

  function setUserQty(userIdx: number, itemIdx: number, qty: number) {
    setSelections(prev => {
      const updated = [...prev];
      const sel = { ...updated[userIdx], items: [...updated[userIdx].items] };
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
      updated[userIdx] = sel;
      return updated;
    });
  }

  function setUserItemNote(userIdx: number, itemIdx: number, note: string) {
    setSelections(prev => {
      const updated = [...prev];
      const sel = { ...updated[userIdx], items: [...updated[userIdx].items] };
      const existingIdx = sel.items.findIndex(si => si.itemIdx === itemIdx);
      if (existingIdx >= 0) {
        sel.items[existingIdx] = { ...sel.items[existingIdx], note };
      }
      updated[userIdx] = sel;
      return updated;
    });
  }

  function getUserItemNote(userIdx: number, itemIdx: number): string {
    const sel = selections[userIdx];
    if (!sel) return '';
    const found = sel.items.find(si => si.itemIdx === itemIdx);
    return found?.note || '';
  }

  function toggleUserItem(userIdx: number, itemIdx: number) {
    const current = getUserQty(userIdx, itemIdx);
    setUserQty(userIdx, itemIdx, current > 0 ? 0 : 1);
  }

  // Calculate per-user totals
  function getUserTotal(userIdx: number): number {
    const sel = selections[userIdx];
    if (!sel) return 0;
    return sel.items.reduce((sum, si) => {
      const item = menuItems[si.itemIdx];
      return sum + (item ? item.price * si.quantity : 0);
    }, 0);
  }

  const grandTotalOriginal = selections.reduce((sum, _, idx) => sum + getUserTotal(idx), 0);
  const dType = discountType === 'none' ? undefined : discountType;
  const dValue = typeof discountValue === 'number' ? discountValue : 0;
  const grandTotal = applyDiscount(grandTotalOriginal, dType, dValue);
  const usersWithOrders = selections.filter(sel => sel.items.length > 0);

  function handleSave() {
    if (!restaurant.trim()) { setError('請輸入餐廳名稱'); return; }
    if (usersWithOrders.length === 0) { setError('至少一位成員要點餐'); return; }

    setSaving(true);
    setError('');

    try {
      // Save menu template
      saveMenu({ restaurant: restaurant.trim(), phone: phone.trim() || undefined, items: menuItems });

      // Create one order per user (apply discount proportionally)
      for (const sel of usersWithOrders) {
        const orderItems: OrderItem[] = sel.items.map(si => {
          const item = menuItems[si.itemIdx];
          return { name: item.name, price: item.price, quantity: si.quantity, note: si.note || undefined };
        });
        const userOriginal = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
        // For percent: apply directly; For amount: scale proportional to user's share
        let userFinal = userOriginal;
        if (dType === 'percent') {
          userFinal = applyDiscount(userOriginal, dType, dValue);
        } else if (dType === 'amount' && grandTotalOriginal > 0) {
          const userDiscount = Math.round((dValue * userOriginal) / grandTotalOriginal);
          userFinal = Math.max(0, userOriginal - userDiscount);
        }
        const itemsText = orderItems.map(i => `${i.name}x${i.quantity}${i.note ? `(${i.note})` : ''}`).join(', ');

        createOrder({
          restaurant: restaurant.trim(),
          items: orderItems,
          itemsText,
          totalAmount: userFinal,
          originalAmount: userOriginal !== userFinal ? userOriginal : undefined,
          discountType: dType,
          discountValue: dType ? dValue : undefined,
          date,
          user: sel.name,
          notes: notes.trim(),
        });
      }

      sessionStorage.removeItem('analyzeResult');
      sessionStorage.removeItem('selectedPayer');
      showToast(`已為 ${usersWithOrders.length} 人建立訂單！`);
      setTimeout(() => router.push('/'), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <div className="page-container flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 rounded-full border-4 border-[var(--color-primary)] border-t-transparent animate-spin" />
      </div>
    );
  }

  const currentSel = selections[activeUser];

  return (
    <div className="page-container">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.back()} className="btn btn-ghost">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1 className="text-xl font-bold">團隊點餐</h1>
      </div>

      {/* Restaurant & Date & Phone */}
      <div className="card mb-3">
        <div className="flex gap-2 mb-2">
          <div className="flex-1">
            <label className="input-label">餐廳</label>
            <input type="text" className="input" value={restaurant} onChange={e => setRestaurant(e.target.value)} />
          </div>
          <div style={{ width: 140 }}>
            <label className="input-label">日期</label>
            <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="input-label">電話</label>
          <input type="tel" className="input" placeholder="店家電話（選填）" value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
      </div>

      {/* Menu Items (editable) */}
      <div className="card mb-3">
        <div className="flex items-center justify-between mb-2">
          <label className="input-label mb-0">菜單品項</label>
          <button onClick={addMenuItem} className="btn btn-ghost text-xs" style={{ color: 'var(--color-primary)' }}>+ 新增</button>
        </div>
        <div className="flex flex-col gap-1">
          {menuItems.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2" style={{ padding: '4px 0' }}>
              <div className="flex-1 flex items-center gap-2">
                <input type="text" className="input text-sm" style={{ flex: 1 }} value={item.name} onChange={e => updateMenuItem(idx, 'name', e.target.value)} placeholder="品項" />
                <input type="number" className="input text-sm" style={{ width: 70 }} value={item.price || ''} onChange={e => updateMenuItem(idx, 'price', Number(e.target.value))} placeholder="$" />
              </div>
              <button onClick={() => removeMenuItem(idx)} className="text-xs" style={{ color: 'var(--color-danger)', padding: 4 }}>✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* User tabs */}
      <div className="card mb-3">
        <label className="input-label">選擇成員點餐</label>
        <div className="flex gap-1 mb-3" style={{ overflowX: 'auto' }}>
          {users.map((u, idx) => {
            const userTotal = getUserTotal(idx);
            const hasItems = selections[idx]?.items.length > 0;
            return (
              <button
                key={u}
                onClick={() => setActiveUser(idx)}
                className="btn"
                style={{
                  minWidth: 0, flex: '1 0 auto', fontSize: 13, padding: '8px 12px',
                  flexDirection: 'column', gap: 2,
                  background: activeUser === idx ? 'var(--color-primary)' : hasItems ? 'var(--color-tint-primary)' : 'var(--color-bg-input)',
                  color: activeUser === idx ? 'white' : 'var(--color-text)',
                  border: activeUser === idx ? 'none' : hasItems ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                }}
              >
                <span>{u}</span>
                {hasItems && <span style={{ fontSize: 11 }}>${userTotal}</span>}
              </button>
            );
          })}
        </div>

        {/* Item selection for active user */}
        <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
          點擊品項為 <strong>{users[activeUser]}</strong> 點餐：
        </p>
        <div className="flex flex-col gap-1">
          {menuItems.map((item, idx) => {
            if (!item.name) return null;
            const qty = getUserQty(activeUser, idx);
            const selected = qty > 0;
            return (
              <div
                key={idx}
                style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: selected ? 'var(--color-tint-primary)' : 'var(--color-bg)',
                  border: selected ? '2px solid var(--color-primary)' : '1px solid #EEE',
                }}
              >
                <div className="flex items-center gap-3" style={{ cursor: 'pointer' }}>
                  <button
                    onClick={() => toggleUserItem(activeUser, idx)}
                    style={{
                      width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                      border: selected ? 'none' : '2px solid var(--color-border)',
                      background: selected ? 'var(--color-primary)' : 'transparent',
                      color: 'white', fontSize: 14, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {selected ? '✓' : ''}
                  </button>
                  <div className="flex-1" onClick={() => toggleUserItem(activeUser, idx)}>
                    <p className="text-sm font-semibold">{item.name}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>${item.price}</p>
                  </div>
                  {selected && (
                    <div className="flex items-center gap-2">
                      <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 16 }} onClick={() => setUserQty(activeUser, idx, qty - 1)}>-</button>
                      <span className="text-sm font-bold" style={{ minWidth: 20, textAlign: 'center' }}>{qty}</span>
                      <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 16 }} onClick={() => setUserQty(activeUser, idx, qty + 1)}>+</button>
                    </div>
                  )}
                </div>
                {selected && (
                  <input
                    className="input mt-2"
                    type="text"
                    placeholder="備註（加辣、不要香菜...）"
                    value={getUserItemNote(activeUser, idx)}
                    onChange={e => setUserItemNote(activeUser, idx, e.target.value)}
                    style={{ fontSize: 12, padding: '4px 10px', marginLeft: 36 }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Current user subtotal */}
        {currentSel && currentSel.items.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid #EEE' }}>
            <p className="text-sm font-bold">{users[activeUser]} 小計: ${getUserTotal(activeUser).toLocaleString()}</p>
          </div>
        )}
      </div>

      {/* Order Summary */}
      {usersWithOrders.length > 0 && (
        <div className="card mb-3" style={{ background: 'var(--color-tint-primary)' }}>
          <p className="text-sm font-bold mb-2">訂單總覽</p>
          {usersWithOrders.map((sel, i) => {
            const userIdx = selections.indexOf(sel);
            const total = getUserTotal(userIdx);
            const itemNames = sel.items.map(si => {
              const item = menuItems[si.itemIdx];
              return `${item?.name}x${si.quantity}${si.note ? `(${si.note})` : ''}`;
            }).join(', ');
            return (
              <div key={i} className="flex justify-between text-xs mb-1">
                <span>{sel.name}: {itemNames}</span>
                <span className="font-bold">${total.toLocaleString()}</span>
              </div>
            );
          })}
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--color-primary)' }}>
            {dType && grandTotalOriginal !== grandTotal && (
              <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                <span>原價</span>
                <span style={{ textDecoration: 'line-through' }}>${grandTotalOriginal.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold">
              <span>總計 ({usersWithOrders.length} 人){dType && ` ${formatDiscount(dType, dValue)}`}</span>
              <span>${grandTotal.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Discount */}
      <div className="card mb-3">
        <label className="input-label">折扣（選填）</label>
        <div className="flex gap-2 mb-2">
          <button
            className="btn flex-1"
            onClick={() => { setDiscountType('none'); setDiscountValue(''); }}
            style={{
              fontSize: 13, padding: '8px 4px',
              background: discountType === 'none' ? 'var(--color-primary)' : 'var(--color-bg-input)',
              color: discountType === 'none' ? 'white' : 'var(--color-text)',
              border: discountType === 'none' ? 'none' : '1px solid var(--color-border)',
            }}
          >無折扣</button>
          <button
            className="btn flex-1"
            onClick={() => setDiscountType('percent')}
            style={{
              fontSize: 13, padding: '8px 4px',
              background: discountType === 'percent' ? 'var(--color-primary)' : 'var(--color-bg-input)',
              color: discountType === 'percent' ? 'white' : 'var(--color-text)',
              border: discountType === 'percent' ? 'none' : '1px solid var(--color-border)',
            }}
          >打X折</button>
          <button
            className="btn flex-1"
            onClick={() => setDiscountType('amount')}
            style={{
              fontSize: 13, padding: '8px 4px',
              background: discountType === 'amount' ? 'var(--color-primary)' : 'var(--color-bg-input)',
              color: discountType === 'amount' ? 'white' : 'var(--color-text)',
              border: discountType === 'amount' ? 'none' : '1px solid var(--color-border)',
            }}
          >折 $X</button>
        </div>
        {discountType !== 'none' && (
          <input
            className="input"
            type="number"
            inputMode="decimal"
            placeholder={discountType === 'percent' ? '例：9 (表示 9 折)' : '例：50 (折 50 元)'}
            value={discountValue}
            onChange={e => setDiscountValue(e.target.value === '' ? '' : Number(e.target.value))}
          />
        )}
      </div>

      {/* Notes */}
      <div className="card mb-4">
        <label className="input-label">備註</label>
        <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="選填備註..." style={{ resize: 'vertical' }} />
      </div>

      {error && (
        <div className="card mb-4 border-l-4" style={{ borderColor: 'var(--color-danger)', background: 'var(--color-tint-danger)' }}>
          <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>
        </div>
      )}

      <button onClick={handleSave} disabled={saving || usersWithOrders.length === 0} className="btn btn-primary btn-lg btn-block mb-4">
        {saving ? '儲存中...' : `確認送出 (${usersWithOrders.length} 人)`}
      </button>

      {toast && <div className="toast">{toast}</div>}
      <BottomNav />
    </div>
  );
}
