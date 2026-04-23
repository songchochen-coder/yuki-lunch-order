'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { getSettings } from '@/lib/settings';
import { MenuTemplate, OrderItem, Member, todayStr } from '@/lib/types';
import { getMenus, getMembers, createOrder, saveMenu } from '@/lib/client-db';

export default function AddPage() {
  const router = useRouter();
  const today = todayStr();

  const [menus, setMenus] = useState<MenuTemplate[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [mode, setMode] = useState<'menu' | 'manual'>('menu');
  const [selectedMenu, setSelectedMenu] = useState<MenuTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [restaurant, setRestaurant] = useState('');
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [manualItemsText, setManualItemsText] = useState('');
  const [manualAmount, setManualAmount] = useState<number | ''>('');
  const [date, setDate] = useState(today);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    const settings = getSettings();
    const m = getMembers();
    setMembers(m);
    setMenus(getMenus());
    const names = m.length > 0 ? m.map(x => x.name) : settings.users;
    if (names.length > 0) setSelectedUsers([names[0]]);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }, []);

  const filteredMenus = menus.filter(m =>
    m.restaurant.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => b.useCount - a.useCount);

  function selectMenu(menu: MenuTemplate) {
    setSelectedMenu(menu);
    setRestaurant(menu.restaurant);
    setSelectedItems(menu.items.map(i => ({ ...i, quantity: 0 })));
  }

  function toggleItem(idx: number) {
    setSelectedItems(prev => {
      const items = [...prev];
      items[idx] = { ...items[idx], quantity: items[idx].quantity > 0 ? 0 : 1 };
      return items;
    });
  }

  function updateItemQty(idx: number, qty: number) {
    setSelectedItems(prev => {
      const items = [...prev];
      items[idx] = { ...items[idx], quantity: Math.max(0, qty) };
      return items;
    });
  }

  function updateItemNote(idx: number, note: string) {
    setSelectedItems(prev => {
      const items = [...prev];
      items[idx] = { ...items[idx], note };
      return items;
    });
  }

  const menuTotal = selectedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const pickedItems = selectedItems.filter(i => i.quantity > 0);

  function resetForm() {
    setSelectedMenu(null);
    setRestaurant('');
    setSelectedItems([]);
    setManualItemsText('');
    setManualAmount('');
    setDate(today);
    const names = members.length > 0 ? members.map(m => m.name) : getSettings().users;
    setSelectedUsers(names.length > 0 ? [names[0]] : []);
    setNotes('');
    setSearchQuery('');
  }

  const allUsers = members.length > 0 ? members.map(m => m.name) : getSettings().users;

  function handleSave() {
    const isManual = mode === 'manual';
    const finalRestaurant = restaurant.trim();
    const finalAmount = isManual ? (typeof manualAmount === 'number' ? manualAmount : 0) : menuTotal;
    const finalItemsText = isManual ? manualItemsText.trim() : pickedItems.map(i => `${i.name}x${i.quantity}${i.note ? `(${i.note})` : ''}`).join(', ');
    const finalItems = isManual ? [] : pickedItems;

    if (!finalRestaurant) { showToast('請輸入餐廳名稱'); return; }
    if (!finalItemsText && finalItems.length === 0) { showToast('請選擇或輸入品項'); return; }
    if (finalAmount <= 0) { showToast('請輸入金額'); return; }
    if (selectedUsers.length === 0) { showToast('請選擇點餐人'); return; }

    setSaving(true);
    try {
      // Save to menu database (manual input also builds menu library)
      if (finalRestaurant && (finalItems.length > 0 || finalItemsText)) {
        const itemsForMenu = finalItems.length > 0
          ? finalItems
          : [{ name: finalItemsText, price: finalAmount, quantity: 1 }];
        saveMenu({ restaurant: finalRestaurant, items: itemsForMenu });
      }

      if (selectedUsers.length > 1) {
        const splitAmount = Math.round(finalAmount / selectedUsers.length);
        for (const u of selectedUsers) {
          createOrder({
            restaurant: finalRestaurant,
            items: finalItems,
            itemsText: finalItemsText,
            totalAmount: splitAmount,
            date,
            user: u,
            notes: `${notes.trim()} (${selectedUsers.length}人平分)`.trim(),
          });
        }
      } else {
        createOrder({
          restaurant: finalRestaurant,
          items: finalItems,
          itemsText: finalItemsText || finalRestaurant,
          totalAmount: finalAmount,
          date,
          user: selectedUsers[0],
          notes: notes.trim(),
        });
      }
      showToast('儲存成功！');
      // Stay on page: keep restaurant & menu selected, reset user selection & quantities
      if (mode === 'menu' && selectedMenu) {
        // Reset item quantities to 0, keep menu visible
        setSelectedItems(prev => prev.map(i => ({ ...i, quantity: 0 })));
        // Move to next user
        const currentIdx = allUsers.indexOf(selectedUsers[0]);
        const nextUser = allUsers[(currentIdx + 1) % allUsers.length];
        setSelectedUsers([nextUser]);
        setNotes('');
      } else if (mode === 'manual') {
        // Keep restaurant, clear items
        setManualItemsText('');
        setManualAmount('');
        const currentIdx = allUsers.indexOf(selectedUsers[0]);
        const nextUser = allUsers[(currentIdx + 1) % allUsers.length];
        setSelectedUsers([nextUser]);
        setNotes('');
      } else {
        resetForm();
      }
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
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/snoopy/food-hero.png" alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} />
          <span>點餐</span>
        </h1>
      </div>

      <div className="flex gap-2 mb-4">
        <button className="btn flex-1" onClick={() => { setMode('menu'); resetForm(); }} style={{ background: mode === 'menu' ? 'var(--color-primary)' : 'var(--color-bg-input)', color: mode === 'menu' ? 'white' : 'var(--color-text)', border: mode === 'menu' ? 'none' : '1px solid var(--color-border)' }}>
          📖 從菜單庫選
        </button>
        <button className="btn flex-1" onClick={() => { setMode('manual'); resetForm(); }} style={{ background: mode === 'manual' ? 'var(--color-primary)' : 'var(--color-bg-input)', color: mode === 'manual' ? 'white' : 'var(--color-text)', border: mode === 'manual' ? 'none' : '1px solid var(--color-border)' }}>
          ✏️ 手動輸入
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {mode === 'menu' && !selectedMenu && (
          <>
            <div>
              <label className="input-label">搜尋餐廳</label>
              <input className="input" type="text" placeholder="輸入餐廳名稱..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            {filteredMenus.length === 0 ? (
              <div className="card text-center py-8">
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {menus.length === 0 ? '菜單庫是空的，先拍照辨識或手動新增吧！' : '找不到符合的餐廳'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredMenus.map(menu => (
                  <button key={menu.id} className="card text-left" onClick={() => selectMenu(menu)} style={{ cursor: 'pointer', padding: '12px var(--spacing-md)' }}>
                    <p className="text-sm font-semibold">{menu.restaurant}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{menu.items.length} 品項 &middot; 已點 {menu.useCount} 次</p>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {mode === 'menu' && selectedMenu && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">{selectedMenu.restaurant}</h2>
              <button className="btn btn-ghost text-xs" onClick={() => { setSelectedMenu(null); setSelectedItems([]); }}>換餐廳</button>
            </div>
            <div className="flex flex-col gap-1">
              {selectedItems.map((item, idx) => (
                <div key={idx} className="card" style={{ padding: '10px var(--spacing-md)' }}>
                  <div className="flex items-center gap-3">
                    <button onClick={() => toggleItem(idx)} style={{ width: 24, height: 24, borderRadius: 6, border: item.quantity > 0 ? 'none' : '2px solid var(--color-border)', background: item.quantity > 0 ? 'var(--color-primary)' : 'transparent', color: 'white', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {item.quantity > 0 ? '✓' : ''}
                    </button>
                    <div className="flex-1">
                      <p className="text-sm">{item.name}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>${item.price}</p>
                    </div>
                    {item.quantity > 0 && (
                      <div className="flex items-center gap-2">
                        <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 16 }} onClick={() => updateItemQty(idx, item.quantity - 1)}>-</button>
                        <span className="text-sm font-bold" style={{ minWidth: 20, textAlign: 'center' }}>{item.quantity}</span>
                        <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 16 }} onClick={() => updateItemQty(idx, item.quantity + 1)}>+</button>
                      </div>
                    )}
                  </div>
                  {item.quantity > 0 && (
                    <input
                      className="input mt-2"
                      type="text"
                      placeholder="備註（加辣、不要香菜...）"
                      value={item.note || ''}
                      onChange={e => updateItemNote(idx, e.target.value)}
                      style={{ fontSize: 12, padding: '4px 10px', marginLeft: 36 }}
                    />
                  )}
                </div>
              ))}
            </div>
            {menuTotal > 0 && (
              <div className="card" style={{ background: 'var(--color-tint-primary)' }}>
                <p className="text-sm font-bold">小計: ${menuTotal.toLocaleString()}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{pickedItems.map(i => `${i.name}x${i.quantity}${i.note ? `(${i.note})` : ''}`).join(', ')}</p>
              </div>
            )}
          </>
        )}

        {mode === 'manual' && (
          <>
            <div>
              <label className="input-label">餐廳名稱 *</label>
              <input className="input" type="text" placeholder="例：池上便當" value={restaurant} onChange={e => setRestaurant(e.target.value)} />
            </div>
            <div>
              <label className="input-label">品項說明 *</label>
              <input className="input" type="text" placeholder="例：排骨便當, 滷雞腿" value={manualItemsText} onChange={e => setManualItemsText(e.target.value)} />
            </div>
            <div>
              <label className="input-label">金額 (NT$) *</label>
              <input className="input" type="number" inputMode="numeric" placeholder="0" value={manualAmount} onChange={e => setManualAmount(e.target.value === '' ? '' : Number(e.target.value))} style={{ fontSize: 18, fontWeight: 600 }} />
            </div>
          </>
        )}

        <div>
          <label className="input-label">日期</label>
          <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>

        <div>
          <label className="input-label">點餐人（可多選平分）</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {allUsers.map(u => {
              const selected = selectedUsers.includes(u);
              const isSplit = selectedUsers.length > 1;
              return (
                <button key={u} className="btn" onClick={() => {
                  if (selectedUsers.length === 1 && selectedUsers[0] === u) return;
                  if (selectedUsers.length === 1) { setSelectedUsers([u]); }
                  else {
                    if (selected) { const f = selectedUsers.filter(x => x !== u); setSelectedUsers(f.length > 0 ? f : [u]); }
                    else { setSelectedUsers([...selectedUsers, u]); }
                  }
                }} style={{ flex: 1, fontSize: 14, padding: '10px 4px', background: selected ? (isSplit ? 'var(--color-success)' : 'var(--color-primary)') : 'var(--color-bg-input)', color: selected ? 'white' : 'var(--color-text)', border: selected ? 'none' : '1px solid var(--color-border)' }}>
                  {u}{selected && isSplit && ' ✓'}
                </button>
              );
            })}
            <button className="btn" onClick={() => { selectedUsers.length === allUsers.length ? setSelectedUsers([allUsers[0]]) : setSelectedUsers([...allUsers]); }} style={{ flex: 1, fontSize: 14, padding: '10px 4px', background: selectedUsers.length > 1 ? 'var(--color-success)' : 'var(--color-bg-input)', color: selectedUsers.length > 1 ? 'white' : 'var(--color-success)', border: selectedUsers.length > 1 ? 'none' : '1px solid var(--color-success)' }}>
              平分
            </button>
          </div>
          {selectedUsers.length > 1 && (
            <p className="text-xs mt-2" style={{ color: 'var(--color-success)' }}>
              每人 ${Math.round((mode === 'manual' ? (typeof manualAmount === 'number' ? manualAmount : 0) : menuTotal) / selectedUsers.length).toLocaleString()}（{selectedUsers.length} 人平分）
            </p>
          )}
        </div>

        <div>
          <label className="input-label">備註</label>
          <textarea className="input" rows={2} placeholder="選填備註..." value={notes} onChange={e => setNotes(e.target.value)} style={{ resize: 'vertical' }} />
        </div>

        <p className="text-xs" style={{ color: 'var(--color-text-muted)', marginTop: 4 }}>
          💡 餘額足夠會自動扣儲值金，不夠則標為「未付款」等收現金。折扣可在「統計 → 當日訂單」套用到整組。
        </p>

        <button className="btn btn-primary btn-lg btn-block" onClick={handleSave} disabled={saving} style={{ marginTop: 8, marginBottom: 8, fontSize: 17, padding: '14px 0' }}>
          {saving ? '儲存中...' : '儲存'}
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}
      <BottomNav />
    </div>
  );
}
