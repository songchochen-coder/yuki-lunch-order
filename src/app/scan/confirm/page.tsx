'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { getSettings } from '@/lib/settings';
import type { AnalyzeResult, OrderItem, Member } from '@/lib/types';
import { getMembers, createOrder } from '@/lib/client-db';

export default function ConfirmPage() {
  const router = useRouter();

  const [restaurant, setRestaurant] = useState('');
  const [items, setItems] = useState<OrderItem[]>([]);
  const [date, setDate] = useState('');
  const [user, setUser] = useState('');
  const [users, setUsers] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
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

    const selectedPayer = sessionStorage.getItem('selectedPayer');
    const stored = sessionStorage.getItem('analyzeResult');
    if (!stored) {
      router.replace('/scan');
      return;
    }

    try {
      const result: AnalyzeResult = JSON.parse(stored);
      setRestaurant(result.restaurant || '未知餐廳');
      setItems(result.items || []);
      setDate(new Date().toISOString().split('T')[0]);
      setUser(selectedPayer || settings.users[0] || '');
      setLoaded(true);
    } catch {
      router.replace('/scan');
    }
  }, [router]);

  function updateItem(index: number, field: keyof OrderItem, value: string | number) {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function removeItem(index: number) {
    setItems(prev => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    setItems(prev => [...prev, { name: '', price: 0, quantity: 1 }]);
  }

  const totalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  async function handleSave() {
    if (!restaurant.trim()) { setError('請輸入餐廳名稱'); return; }
    if (items.length === 0) { setError('至少需要一個品項'); return; }
    if (!user) { setError('請選擇點餐人'); return; }

    setSaving(true);
    setError('');

    try {
      const itemsText = items.map(i => `${i.name}x${i.quantity}`).join(', ');
      createOrder({
        restaurant: restaurant.trim(),
        items,
        itemsText,
        totalAmount,
        date,
        user,
        notes: notes.trim(),
      });

      sessionStorage.removeItem('analyzeResult');
      sessionStorage.removeItem('selectedPayer');
      showToast('儲存成功！');
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

  return (
    <div className="page-container">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="btn btn-ghost">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1 className="text-xl font-bold">確認辨識結果</h1>
      </div>

      {/* Restaurant */}
      <div className="card mb-3">
        <label className="input-label">餐廳名稱</label>
        <input type="text" className="input" value={restaurant} onChange={e => setRestaurant(e.target.value)} />
      </div>

      {/* Items */}
      <div className="card mb-3">
        <div className="flex items-center justify-between mb-3">
          <label className="input-label mb-0">品項</label>
          <button onClick={addItem} className="btn btn-ghost text-xs" style={{ color: 'var(--color-primary)' }}>+ 新增品項</button>
        </div>
        {items.map((item, idx) => (
          <div key={idx} className="mb-3 pb-3 border-b last:border-0 last:mb-0 last:pb-0" style={{ borderColor: '#EEE' }}>
            <div className="flex gap-2 items-start">
              <div className="flex-1 flex flex-col gap-1">
                <input type="text" className="input text-sm" value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)} placeholder="品項名稱" />
                <div className="flex gap-2">
                  <input type="number" className="input text-sm" style={{ width: 100 }} value={item.price || ''} onChange={e => updateItem(idx, 'price', Number(e.target.value))} placeholder="價格" />
                  <input type="number" className="input text-sm" style={{ width: 60 }} value={item.quantity || ''} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))} placeholder="數量" min={1} />
                </div>
              </div>
              <button onClick={() => removeItem(idx)} className="btn btn-ghost p-1 mt-1" style={{ color: 'var(--color-danger)' }}>✕</button>
            </div>
          </div>
        ))}
        <div className="mt-3 pt-3" style={{ borderTop: '2px solid var(--color-primary)' }}>
          <p className="text-sm font-bold">合計: ${totalAmount.toLocaleString()}</p>
        </div>
      </div>

      {/* Date */}
      <div className="card mb-3">
        <label className="input-label">日期</label>
        <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
      </div>

      {/* User */}
      <div className="card mb-3">
        <label className="input-label">點餐人</label>
        <div className="flex gap-2 flex-wrap">
          {users.map(u => (
            <button key={u} onClick={() => setUser(u)} className={`btn flex-1 ${user === u ? 'btn-primary' : 'btn-outline'}`}>
              {u}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="card mb-4">
        <label className="input-label">備註</label>
        <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="選填備註..." style={{ resize: 'vertical' }} />
      </div>

      {error && (
        <div className="card mb-4 border-l-4" style={{ borderColor: 'var(--color-danger)', background: '#FFF5F5' }}>
          <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>
        </div>
      )}

      <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-lg btn-block mb-4">
        {saving ? '儲存中...' : '確認儲存'}
      </button>

      {toast && <div className="toast">{toast}</div>}
      <BottomNav />
    </div>
  );
}
