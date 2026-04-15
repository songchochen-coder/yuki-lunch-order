'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { MenuTemplate, OrderItem } from '@/lib/types';
import { getMenus as dbGetMenus, updateMenu as dbUpdateMenu, deleteMenu as dbDeleteMenu } from '@/lib/client-db';

export default function MenusPage() {
  const router = useRouter();
  const [menus, setMenus] = useState<MenuTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMenu, setEditingMenu] = useState<string | null>(null);
  const [editItems, setEditItems] = useState<OrderItem[]>([]);
  const [toast, setToast] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }, []);

  useEffect(() => {
    const data = dbGetMenus();
    setMenus(data.sort((a, b) => b.useCount - a.useCount));
    setLoading(false);
  }, []);

  function startEdit(menu: MenuTemplate) {
    setEditingMenu(menu.id);
    setEditItems(menu.items.map(i => ({ ...i })));
  }

  function updateEditItem(idx: number, field: keyof OrderItem, value: string | number) {
    setEditItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  }

  function removeEditItem(idx: number) {
    setEditItems(prev => prev.filter((_, i) => i !== idx));
  }

  function addEditItem() {
    setEditItems(prev => [...prev, { name: '', price: 0, quantity: 1 }]);
  }

  function saveEdit(menuId: string) {
    const updated = dbUpdateMenu(menuId, { items: editItems.filter(i => i.name.trim()) });
    if (updated) {
      setMenus(prev => prev.map(m => m.id === menuId ? updated : m));
      setEditingMenu(null);
      showToast('已更新菜單');
    } else {
      showToast('更新失敗');
    }
  }

  function handleDeleteMenu(menuId: string) {
    if (!confirm('確定要刪除這個菜單嗎？')) return;
    const success = dbDeleteMenu(menuId);
    if (success) {
      setMenus(prev => prev.filter(m => m.id !== menuId));
      showToast('已刪除菜單');
    } else {
      showToast('刪除失敗');
    }
  }

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn btn-ghost" onClick={() => router.back()} style={{ fontSize: 20, padding: '4px 8px' }}>←</button>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>📖 菜單庫</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 rounded-full border-4 border-[var(--color-primary)] border-t-transparent animate-spin" />
        </div>
      ) : menus.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-2xl mb-2">📖</p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            菜單庫是空的
          </p>
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
            透過拍照辨識或手動點餐，菜單會自動加入
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {menus.map(menu => (
            <div key={menu.id} className="card">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold">{menu.restaurant}</h3>
                <div className="flex gap-2">
                  {editingMenu === menu.id ? (
                    <>
                      <button className="text-xs" style={{ color: 'var(--color-success)' }} onClick={() => saveEdit(menu.id)}>儲存</button>
                      <button className="text-xs" style={{ color: 'var(--color-text-muted)' }} onClick={() => setEditingMenu(null)}>取消</button>
                    </>
                  ) : (
                    <>
                      <button className="text-xs" style={{ color: 'var(--color-primary)' }} onClick={() => startEdit(menu)}>編輯</button>
                      <button className="text-xs" style={{ color: 'var(--color-danger)' }} onClick={() => handleDeleteMenu(menu.id)}>刪除</button>
                    </>
                  )}
                </div>
              </div>

              <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
                已點 {menu.useCount} 次 &middot; 最後使用 {menu.lastUsed}
              </p>

              {editingMenu === menu.id ? (
                <div className="flex flex-col gap-2">
                  {editItems.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input className="input flex-1 text-sm" value={item.name} onChange={e => updateEditItem(idx, 'name', e.target.value)} placeholder="品項名稱" />
                      <input className="input text-sm" style={{ width: 80 }} type="number" value={item.price || ''} onChange={e => updateEditItem(idx, 'price', Number(e.target.value))} placeholder="價格" />
                      <button className="text-xs" style={{ color: 'var(--color-danger)' }} onClick={() => removeEditItem(idx)}>✕</button>
                    </div>
                  ))}
                  <button className="btn btn-ghost text-xs" style={{ color: 'var(--color-primary)' }} onClick={addEditItem}>+ 新增品項</button>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {menu.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-xs">
                      <span>{item.name}</span>
                      <span style={{ color: 'var(--color-text-secondary)' }}>${item.price}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      <BottomNav />
    </div>
  );
}
