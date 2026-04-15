'use client';

import { useState, useEffect } from 'react';
import BottomNav from '@/components/BottomNav';
import { LunchOrder, getWeekStart, getWeekDates, formatDate, getWeekday } from '@/lib/types';
import { getOrders } from '@/lib/client-db';

export default function StatsPage() {
  const [allOrders, setAllOrders] = useState<LunchOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month'>('week');

  const today = new Date().toISOString().split('T')[0];
  const weekStart = getWeekStart(today);
  const weekDates = getWeekDates(today);
  const monthStart = today.slice(0, 7) + '-01';

  useEffect(() => {
    setAllOrders(getOrders());
    setLoading(false);
  }, []);

  const orders = period === 'week'
    ? allOrders.filter(o => o.date >= weekStart && o.date <= weekDates[4])
    : allOrders.filter(o => o.date >= monthStart);

  const total = orders.reduce((s, o) => s + o.totalAmount, 0);
  const orderCount = orders.length;

  // Per-user stats
  const userStats: Record<string, { total: number; count: number }> = {};
  for (const o of orders) {
    if (!userStats[o.user]) userStats[o.user] = { total: 0, count: 0 };
    userStats[o.user].total += o.totalAmount;
    userStats[o.user].count += 1;
  }
  const userEntries = Object.entries(userStats).sort((a, b) => b[1].total - a[1].total);

  // Restaurant ranking
  const restaurantStats: Record<string, { total: number; count: number }> = {};
  for (const o of orders) {
    if (!restaurantStats[o.restaurant]) restaurantStats[o.restaurant] = { total: 0, count: 0 };
    restaurantStats[o.restaurant].total += o.totalAmount;
    restaurantStats[o.restaurant].count += 1;
  }
  const restaurantEntries = Object.entries(restaurantStats).sort((a, b) => b[1].count - a[1].count);

  // Daily spending (for week view)
  const dailySpending: Record<string, number> = {};
  if (period === 'week') {
    for (const d of weekDates) dailySpending[d] = 0;
    for (const o of orders) {
      if (dailySpending[o.date] !== undefined) dailySpending[o.date] += o.totalAmount;
    }
  }
  const maxDaily = Math.max(...Object.values(dailySpending), 1);

  if (loading) {
    return (
      <div className="page-container">
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 rounded-full border-4 border-[var(--color-primary)] border-t-transparent animate-spin" />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1 className="text-xl font-bold mb-4">📊 統計</h1>

      {/* Period Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          className="btn flex-1"
          onClick={() => setPeriod('week')}
          style={{
            background: period === 'week' ? 'var(--color-primary)' : 'var(--color-bg-input)',
            color: period === 'week' ? 'white' : 'var(--color-text)',
            border: period === 'week' ? 'none' : '1px solid #E0E0E0',
          }}
        >
          本週
        </button>
        <button
          className="btn flex-1"
          onClick={() => setPeriod('month')}
          style={{
            background: period === 'month' ? 'var(--color-primary)' : 'var(--color-bg-input)',
            color: period === 'month' ? 'white' : 'var(--color-text)',
            border: period === 'month' ? 'none' : '1px solid #E0E0E0',
          }}
        >
          本月
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="card">
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>總花費</p>
          <p className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>${total.toLocaleString()}</p>
        </div>
        <div className="card">
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>訂單數</p>
          <p className="text-lg font-bold">{orderCount}</p>
        </div>
      </div>

      {/* Daily Spending Bar Chart (week only) */}
      {period === 'week' && (
        <div className="card mb-4">
          <p className="text-sm font-semibold mb-3">每日花費</p>
          <div className="flex items-end gap-2" style={{ height: 120 }}>
            {weekDates.map(date => {
              const amount = dailySpending[date] || 0;
              const height = maxDaily > 0 ? (amount / maxDaily) * 100 : 0;
              const isToday = date === today;
              return (
                <div key={date} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-bold">{amount > 0 ? `$${amount}` : ''}</span>
                  <div
                    style={{
                      width: '100%',
                      height: `${Math.max(height, 4)}%`,
                      background: isToday ? 'var(--color-primary)' : '#FFD4B8',
                      borderRadius: '4px 4px 0 0',
                      minHeight: 4,
                    }}
                  />
                  <span className="text-xs" style={{ color: isToday ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                    {getWeekday(date).replace('週', '')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-user spending */}
      {userEntries.length > 0 && (
        <div className="card mb-4">
          <p className="text-sm font-semibold mb-3">每人花費</p>
          <div className="flex flex-col gap-3">
            {userEntries.map(([user, stats]) => {
              const pct = total > 0 ? Math.round((stats.total / total) * 100) : 0;
              return (
                <div key={user}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm">{user}</span>
                    <span className="text-sm font-bold">${stats.total.toLocaleString()} ({stats.count}筆)</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${pct}%`, background: 'var(--color-primary)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Restaurant ranking */}
      {restaurantEntries.length > 0 && (
        <div className="card mb-4">
          <p className="text-sm font-semibold mb-3">餐廳排行榜</p>
          <div className="flex flex-col gap-2">
            {restaurantEntries.slice(0, 10).map(([name, stats], idx) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: idx < 3 ? 'var(--color-primary)' : 'var(--color-text-muted)', minWidth: 20 }}>
                    #{idx + 1}
                  </span>
                  <span className="text-sm">{name}</span>
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {stats.count}次 / ${stats.total.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
