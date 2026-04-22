'use client';

import { useState, useEffect, useCallback } from 'react';
import BottomNav from '@/components/BottomNav';
import SwipeToDelete from '@/components/SwipeToDelete';
import { LunchOrder, Member, getWeekStart, getWeekDates, formatDate, getWeekday, formatDiscount, getPaymentMethod } from '@/lib/types';
import { getOrdersByWeek, deleteOrder as dbDeleteOrder, markOrderPaid as dbMarkOrderPaid, markOrderUnpaid as dbMarkOrderUnpaid, editOrder as dbEditOrder, getMembers } from '@/lib/client-db';

export default function HistoryPage() {
  const [orders, setOrders] = useState<LunchOrder[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [toast, setToast] = useState('');
  const [editingOrder, setEditingOrder] = useState<LunchOrder | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const baseDate = new Date(today + 'T00:00:00');
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);
  const currentDate = baseDate.toISOString().split('T')[0];
  const weekStart = getWeekStart(currentDate);
  const weekDates = getWeekDates(currentDate);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }, []);

  useEffect(() => {
    setLoading(true);
    setOrders(getOrdersByWeek(weekStart));
    setMembers(getMembers());
    setLoading(false);
  }, [weekStart]);

  function refresh() {
    setOrders(getOrdersByWeek(weekStart));
    setMembers(getMembers());
  }

  function handleSaveEdit(changes: {
    date: string;
    user: string;
    restaurant: string;
    itemsText: string;
    totalAmount: number;
    notes: string;
  }) {
    if (!editingOrder) return;
    const updated = dbEditOrder(editingOrder.id, changes);
    if (updated) {
      refresh();
      setEditingOrder(null);
      showToast('已更新');
    } else {
      showToast('更新失敗');
    }
  }

  const weekTotal = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  const weekUnpaid = orders.filter(o => getPaymentMethod(o) === 'unpaid').reduce((s, o) => s + o.totalAmount, 0);

  const userTotals: Record<string, number> = {};
  for (const o of orders) {
    userTotals[o.user] = (userTotals[o.user] || 0) + o.totalAmount;
  }

  const ordersByDate: Record<string, LunchOrder[]> = {};
  for (const o of orders) {
    if (!ordersByDate[o.date]) ordersByDate[o.date] = [];
    ordersByDate[o.date].push(o);
  }

  function handleDelete(id: string) {
    const order = orders.find(o => o.id === id);
    const success = dbDeleteOrder(id);
    if (success) {
      setOrders(prev => prev.filter(o => o.id !== id));
      const wasBalance = order && getPaymentMethod(order) === 'balance';
      showToast(wasBalance ? '已刪除並退款' : '已刪除');
    } else {
      showToast('刪除失敗');
    }
  }

  function handleCollect(id: string) {
    const order = orders.find(o => o.id === id);
    if (!order) return;
    if (!confirm(`確認向 ${order.user} 收取現金 $${order.totalAmount.toLocaleString()}？`)) return;
    const updated = dbMarkOrderPaid(id);
    if (updated) {
      setOrders(prev => prev.map(o => (o.id === id ? updated : o)));
      showToast(`已收款 $${order.totalAmount.toLocaleString()}`);
    } else {
      showToast('收款失敗');
    }
  }

  function handleMarkUnpaid(id: string) {
    const order = orders.find(o => o.id === id);
    if (!order) return;
    if (!confirm(`把這筆改為未付款？\n$${order.totalAmount.toLocaleString()} 會退回 ${order.user} 的儲值金，並進入待收現金。`)) return;
    const updated = dbMarkOrderUnpaid(id);
    if (updated) {
      setOrders(prev => prev.map(o => (o.id === id ? updated : o)));
      showToast('已改為未付款');
    } else {
      showToast('操作失敗');
    }
  }

  return (
    <div className="page-container">
      <h1 className="text-xl font-bold mb-4">📋 點餐紀錄</h1>

      {/* Week Navigator */}
      <div className="card mb-4 flex items-center justify-between">
        <button className="btn btn-ghost" onClick={() => setWeekOffset(w => w - 1)}>← 上週</button>
        <div className="text-center">
          <p className="text-sm font-bold">{formatDate(weekDates[0])} ~ {formatDate(weekDates[4])}</p>
          {weekOffset === 0 && <p className="text-xs" style={{ color: 'var(--color-primary)' }}>本週</p>}
        </div>
        <button className="btn btn-ghost" onClick={() => setWeekOffset(w => w + 1)}>下週 →</button>
      </div>

      {/* Week Summary */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold">本週小計</p>
          <p className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>${weekTotal.toLocaleString()}</p>
        </div>
        {Object.keys(userTotals).length > 0 && (
          <div className="flex flex-wrap gap-3">
            {Object.entries(userTotals).sort((a, b) => b[1] - a[1]).map(([user, total]) => (
              <span key={user} className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {user}: ${total.toLocaleString()}
              </span>
            ))}
          </div>
        )}
        {weekUnpaid > 0 && (
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid #F0F0F0' }}>
            <span className="text-xs" style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
              ⏳ 本週待收現金：${weekUnpaid.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Swipe hint */}
      {orders.length > 0 && (
        <p className="text-xs mb-2 text-right" style={{ color: 'var(--color-text-muted)' }}>← 左滑可刪除</p>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 rounded-full border-4 border-[var(--color-primary)] border-t-transparent animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-2xl mb-2">🍽️</p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>這週還沒有點餐紀錄</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {weekDates.map(date => {
            const dayOrders = ordersByDate[date] || [];
            if (dayOrders.length === 0) return null;
            const dayTotal = dayOrders.reduce((s, o) => s + o.totalAmount, 0);
            return (
              <div key={date}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold">{getWeekday(date)} {formatDate(date)}</p>
                  <p className="text-sm font-bold">${dayTotal.toLocaleString()}</p>
                </div>
                <div className="flex flex-col gap-2">
                  {dayOrders.map(order => {
                    const method = getPaymentMethod(order);
                    const badge = method === 'unpaid'
                      ? { label: '⏳ 未付款', bg: 'var(--color-warning)' }
                      : method === 'cash'
                      ? { label: '💵 現金', bg: 'var(--color-success)' }
                      : null; // 'balance' → no badge (default, keep cards clean)
                    return (
                      <SwipeToDelete key={order.id} onDelete={() => handleDelete(order.id)}>
                        <div className="card flex items-center gap-3" style={{ padding: '10px var(--spacing-md)' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/snoopy/food.png" alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {order.restaurant}
                              {order.discountType && (
                                <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 999, background: 'var(--color-success)', color: 'white', fontWeight: 600 }}>
                                  {formatDiscount(order.discountType, order.discountValue)}
                                </span>
                              )}
                              {badge && (
                                <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 999, background: badge.bg, color: 'white', fontWeight: 600 }}>
                                  {badge.label}
                                </span>
                              )}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                              {order.user} &middot; {order.itemsText}
                            </p>
                          </div>
                          <div className="text-right flex items-center gap-2">
                            <div>
                              {order.originalAmount && order.originalAmount !== order.totalAmount && (
                                <p className="text-xs" style={{ color: 'var(--color-text-muted)', textDecoration: 'line-through' }}>
                                  ${order.originalAmount}
                                </p>
                              )}
                              <p className="text-sm font-bold">${order.totalAmount.toLocaleString()}</p>
                            </div>
                            <button
                              className="btn"
                              onClick={(e) => { e.stopPropagation(); setEditingOrder(order); }}
                              style={{
                                fontSize: 11, padding: '3px 8px',
                                background: 'transparent', color: 'var(--color-text)',
                                border: '1px solid #E0E0E0',
                              }}
                              title="編輯訂單"
                            >✎</button>
                            {method === 'unpaid' && (
                              <button
                                className="btn"
                                onClick={(e) => { e.stopPropagation(); handleCollect(order.id); }}
                                style={{
                                  fontSize: 12, padding: '4px 10px',
                                  background: 'var(--color-warning)', color: 'white', border: 'none',
                                }}
                              >收款</button>
                            )}
                            {method === 'balance' && (
                              <button
                                className="btn"
                                onClick={(e) => { e.stopPropagation(); handleMarkUnpaid(order.id); }}
                                style={{
                                  fontSize: 11, padding: '3px 8px',
                                  background: 'transparent', color: 'var(--color-warning)',
                                  border: '1px solid var(--color-warning)',
                                }}
                                title="改為未付款（退回儲值金，之後收現金）"
                              >↩ 未付</button>
                            )}
                          </div>
                        </div>
                      </SwipeToDelete>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      {editingOrder && (
        <EditOrderModal
          order={editingOrder}
          members={members}
          onSave={handleSaveEdit}
          onCancel={() => setEditingOrder(null)}
        />
      )}
      <BottomNav />
    </div>
  );
}

function EditOrderModal({
  order,
  members,
  onSave,
  onCancel,
}: {
  order: LunchOrder;
  members: Member[];
  onSave: (changes: {
    date: string;
    user: string;
    restaurant: string;
    itemsText: string;
    totalAmount: number;
    notes: string;
  }) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(order.date);
  const [user, setUser] = useState(order.user);
  const [restaurant, setRestaurant] = useState(order.restaurant);
  const [itemsText, setItemsText] = useState(order.itemsText);
  const [totalAmount, setTotalAmount] = useState<number | ''>(order.totalAmount);
  const [notes, setNotes] = useState(order.notes || '');
  const method = getPaymentMethod(order);

  const userChanged = user !== order.user;
  const amountChanged = totalAmount !== order.totalAmount;
  const targetMember = members.find(m => m.name === user);
  const newAmount = typeof totalAmount === 'number' ? totalAmount : 0;
  const willGoUnpaid = method === 'balance' && (userChanged || amountChanged) && (!targetMember || targetMember.balance < newAmount);

  function handleSave() {
    if (!restaurant.trim()) return;
    if (newAmount <= 0) return;
    onSave({
      date,
      user,
      restaurant: restaurant.trim(),
      itemsText: itemsText.trim() || restaurant.trim(),
      totalAmount: newAmount,
      notes: notes.trim(),
    });
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', width: '100%', maxWidth: 480,
          borderRadius: '16px 16px 0 0', padding: 20,
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">編輯訂單</h2>
          <button onClick={onCancel} className="btn btn-ghost" style={{ fontSize: 20, padding: '2px 8px' }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="input-label">日期</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          <div>
            <label className="input-label">點餐人</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {members.map(m => (
                <button
                  key={m.name}
                  onClick={() => setUser(m.name)}
                  className="btn"
                  style={{
                    flex: '1 1 80px', fontSize: 13, padding: '8px 4px',
                    background: user === m.name ? 'var(--color-primary)' : 'var(--color-bg-input)',
                    color: user === m.name ? 'white' : 'var(--color-text)',
                    border: user === m.name ? 'none' : '1px solid #E0E0E0',
                  }}
                >{m.name}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="input-label">餐廳名稱</label>
            <input className="input" type="text" value={restaurant} onChange={e => setRestaurant(e.target.value)} />
          </div>

          <div>
            <label className="input-label">品項說明</label>
            <input className="input" type="text" value={itemsText} onChange={e => setItemsText(e.target.value)} />
          </div>

          <div>
            <label className="input-label">金額 (NT$)</label>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              value={totalAmount}
              onChange={e => setTotalAmount(e.target.value === '' ? '' : Number(e.target.value))}
              style={{ fontSize: 16, fontWeight: 600 }}
            />
          </div>

          <div>
            <label className="input-label">備註</label>
            <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} style={{ resize: 'vertical' }} />
          </div>

          {/* Impact hint */}
          {method === 'balance' && (userChanged || amountChanged) && (
            <div style={{
              padding: 10, borderRadius: 8,
              background: willGoUnpaid ? '#FFF8E1' : '#E8F5E9',
              fontSize: 12,
              color: willGoUnpaid ? 'var(--color-warning)' : 'var(--color-success)',
            }}>
              {willGoUnpaid
                ? `⚠️ ${user} 餘額不足，儲存後此筆會自動變「未付款」等收現金`
                : userChanged
                  ? `💳 儲存後：退 $${order.totalAmount} 給 ${order.user}，從 ${user} 扣 $${newAmount}`
                  : `💳 儲存後：差額 $${Math.abs(newAmount - order.totalAmount)} 會${newAmount < order.totalAmount ? '退回' : '額外扣'} ${user} 儲值金`}
            </div>
          )}

          <div className="flex gap-2 mt-2">
            <button className="btn flex-1" onClick={onCancel} style={{ fontSize: 14 }}>取消</button>
            <button className="btn btn-primary flex-1" onClick={handleSave} style={{ fontSize: 14 }}>儲存</button>
          </div>
        </div>
      </div>
    </div>
  );
}
