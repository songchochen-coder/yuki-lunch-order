'use client';

import { useState, useEffect, useCallback } from 'react';
import BottomNav from '@/components/BottomNav';
import SwipeToDelete from '@/components/SwipeToDelete';
import { LunchOrder, getWeekStart, getWeekDates, formatDate, getWeekday, formatDiscount, getPaymentMethod } from '@/lib/types';
import { getOrdersByWeek, deleteOrder as dbDeleteOrder, markOrderPaid as dbMarkOrderPaid, markOrderUnpaid as dbMarkOrderUnpaid } from '@/lib/client-db';

export default function HistoryPage() {
  const [orders, setOrders] = useState<LunchOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [toast, setToast] = useState('');

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
    setLoading(false);
  }, [weekStart]);

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
                          <span className="text-xl">🍱</span>
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
      <BottomNav />
    </div>
  );
}
