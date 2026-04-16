'use client';

import { useState, useEffect, useCallback } from 'react';
import BottomNav from '@/components/BottomNav';
import { LunchOrder, getWeekStart, getWeekDates, formatDate, getWeekday, formatDiscount } from '@/lib/types';
import { getOrdersByWeek, deleteOrder as dbDeleteOrder } from '@/lib/client-db';

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

  // Group by user
  const userTotals: Record<string, number> = {};
  for (const o of orders) {
    userTotals[o.user] = (userTotals[o.user] || 0) + o.totalAmount;
  }

  // Group by date
  const ordersByDate: Record<string, LunchOrder[]> = {};
  for (const o of orders) {
    if (!ordersByDate[o.date]) ordersByDate[o.date] = [];
    ordersByDate[o.date].push(o);
  }

  function handleDelete(id: string) {
    if (!confirm('確定要刪除這筆訂單嗎？（會自動退款）')) return;
    const success = dbDeleteOrder(id);
    if (success) {
      setOrders(prev => prev.filter(o => o.id !== id));
      showToast('已刪除並退款');
    } else {
      showToast('刪除失敗');
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
      </div>

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
                  {dayOrders.map(order => (
                    <div key={order.id} className="card flex items-center gap-3" style={{ padding: '10px var(--spacing-md)' }}>
                      <span className="text-xl">🍱</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {order.restaurant}
                          {order.discountType && (
                            <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 999, background: 'var(--color-success)', color: 'white', fontWeight: 600 }}>
                              {formatDiscount(order.discountType, order.discountValue)}
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
                          onClick={() => handleDelete(order.id)}
                          className="text-xs"
                          style={{ color: 'var(--color-danger)', padding: '4px' }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
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
