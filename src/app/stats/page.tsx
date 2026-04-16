'use client';

import { useState, useEffect } from 'react';
import BottomNav from '@/components/BottomNav';
import { LunchOrder, getWeekStart, getWeekDates, formatDate, getWeekday } from '@/lib/types';
import { getOrders } from '@/lib/client-db';

type Tab = 'order' | 'overview';

export default function StatsPage() {
  const [allOrders, setAllOrders] = useState<LunchOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('order');
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);

  const weekStart = getWeekStart(today);
  const weekDates = getWeekDates(today);
  const monthStart = today.slice(0, 7) + '-01';

  useEffect(() => {
    setAllOrders(getOrders());
    setLoading(false);
  }, []);

  // ─── Restaurant Order View (tab: order) ───
  const dayOrders = allOrders.filter(o => o.date === selectedDate);

  // Group by restaurant, then aggregate items
  const restaurantOrders: Record<string, {
    totalAmount: number;
    orderCount: number;
    itemTotals: Record<string, { quantity: number; price: number; totalAmount: number; users: string[] }>;
    userItems: { user: string; items: string; amount: number }[];
  }> = {};

  for (const o of dayOrders) {
    if (!restaurantOrders[o.restaurant]) {
      restaurantOrders[o.restaurant] = { totalAmount: 0, orderCount: 0, itemTotals: {}, userItems: [] };
    }
    const r = restaurantOrders[o.restaurant];
    r.totalAmount += o.totalAmount;
    r.orderCount += 1;
    r.userItems.push({ user: o.user, items: o.itemsText, amount: o.totalAmount });

    // Aggregate individual items
    if (o.items && o.items.length > 0) {
      for (const it of o.items) {
        const key = it.name;
        if (!r.itemTotals[key]) {
          r.itemTotals[key] = { quantity: 0, price: it.price, totalAmount: 0, users: [] };
        }
        r.itemTotals[key].quantity += it.quantity;
        r.itemTotals[key].totalAmount += it.price * it.quantity;
        if (!r.itemTotals[key].users.includes(o.user)) {
          r.itemTotals[key].users.push(o.user);
        }
      }
    }
  }

  const restaurantEntries = Object.entries(restaurantOrders).sort((a, b) => b[1].totalAmount - a[1].totalAmount);

  // ─── Overview Stats (tab: overview) ───
  const orders = period === 'week'
    ? allOrders.filter(o => o.date >= weekStart && o.date <= weekDates[4])
    : allOrders.filter(o => o.date >= monthStart);

  const total = orders.reduce((s, o) => s + o.totalAmount, 0);
  const orderCount = orders.length;

  const userStats: Record<string, { total: number; count: number }> = {};
  for (const o of orders) {
    if (!userStats[o.user]) userStats[o.user] = { total: 0, count: 0 };
    userStats[o.user].total += o.totalAmount;
    userStats[o.user].count += 1;
  }
  const userEntries = Object.entries(userStats).sort((a, b) => b[1].total - a[1].total);

  const restaurantStats: Record<string, { total: number; count: number }> = {};
  for (const o of orders) {
    if (!restaurantStats[o.restaurant]) restaurantStats[o.restaurant] = { total: 0, count: 0 };
    restaurantStats[o.restaurant].total += o.totalAmount;
    restaurantStats[o.restaurant].count += 1;
  }
  const restaurantRanking = Object.entries(restaurantStats).sort((a, b) => b[1].count - a[1].count);

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

      {/* Tab Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          className="btn flex-1"
          onClick={() => setTab('order')}
          style={{
            background: tab === 'order' ? 'var(--color-primary)' : 'var(--color-bg-input)',
            color: tab === 'order' ? 'white' : 'var(--color-text)',
            border: tab === 'order' ? 'none' : '1px solid #E0E0E0',
          }}
        >
          📞 商家訂單
        </button>
        <button
          className="btn flex-1"
          onClick={() => setTab('overview')}
          style={{
            background: tab === 'overview' ? 'var(--color-primary)' : 'var(--color-bg-input)',
            color: tab === 'overview' ? 'white' : 'var(--color-text)',
            border: tab === 'overview' ? 'none' : '1px solid #E0E0E0',
          }}
        >
          📈 總覽
        </button>
      </div>

      {tab === 'order' ? (
        <>
          {/* Date Picker */}
          <div className="card mb-4">
            <label className="input-label">選擇日期</label>
            <div className="flex gap-2 items-center">
              <button className="btn btn-ghost" onClick={() => {
                const d = new Date(selectedDate + 'T00:00:00');
                d.setDate(d.getDate() - 1);
                setSelectedDate(d.toISOString().split('T')[0]);
              }}>←</button>
              <input
                className="input flex-1"
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                style={{ textAlign: 'center' }}
              />
              <button className="btn btn-ghost" onClick={() => {
                const d = new Date(selectedDate + 'T00:00:00');
                d.setDate(d.getDate() + 1);
                setSelectedDate(d.toISOString().split('T')[0]);
              }}>→</button>
            </div>
            <p className="text-xs mt-2 text-center" style={{ color: 'var(--color-text-muted)' }}>
              {getWeekday(selectedDate)} {formatDate(selectedDate)}
              {selectedDate === today && ' (今天)'}
            </p>
          </div>

          {/* Day Summary */}
          {dayOrders.length > 0 && (
            <div className="card mb-4" style={{ background: '#FFF3E0' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>當日訂單</p>
                  <p className="text-sm font-bold">{dayOrders.length} 筆 / {restaurantEntries.length} 家餐廳</p>
                </div>
                <p className="text-xl font-bold" style={{ color: 'var(--color-primary)' }}>
                  ${dayOrders.reduce((s, o) => s + o.totalAmount, 0).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {/* Per-Restaurant Orders */}
          {restaurantEntries.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-2xl mb-2">🍽️</p>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>當天沒有訂單</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {restaurantEntries.map(([name, info]) => {
                const itemList = Object.entries(info.itemTotals).sort((a, b) => b[1].quantity - a[1].quantity);
                return (
                  <div key={name} className="card">
                    <div className="flex items-center justify-between mb-3 pb-2" style={{ borderBottom: '2px solid var(--color-primary)' }}>
                      <div>
                        <p className="text-base font-bold">🏪 {name}</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {info.orderCount} 人訂餐
                        </p>
                      </div>
                      <p className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>
                        ${info.totalAmount.toLocaleString()}
                      </p>
                    </div>

                    {/* Aggregated items (for calling the restaurant) */}
                    {itemList.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                          📋 訂單彙總（跟店家說）
                        </p>
                        <div className="flex flex-col gap-1">
                          {itemList.map(([itemName, itemInfo]) => (
                            <div key={itemName} className="flex items-center justify-between text-sm" style={{ padding: '6px 10px', background: 'var(--color-bg)', borderRadius: 6 }}>
                              <div className="flex items-center gap-2">
                                <span className="font-bold" style={{ color: 'var(--color-primary)', minWidth: 30 }}>
                                  x{itemInfo.quantity}
                                </span>
                                <span>{itemName}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>${itemInfo.price}</span>
                                <span className="text-sm font-semibold ml-2">${itemInfo.totalAmount}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Per-user breakdown */}
                    <div>
                      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                        👥 各人明細（方便收款）
                      </p>
                      <div className="flex flex-col gap-1">
                        {info.userItems.map((ui, i) => (
                          <div key={i} className="flex items-center justify-between text-xs" style={{ padding: '4px 0' }}>
                            <div className="flex-1">
                              <span className="font-semibold">{ui.user}</span>
                              <span className="ml-2" style={{ color: 'var(--color-text-muted)' }}>{ui.items}</span>
                            </div>
                            <span className="font-semibold">${ui.amount}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Overview Period Toggle */}
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

          {restaurantRanking.length > 0 && (
            <div className="card mb-4">
              <p className="text-sm font-semibold mb-3">餐廳排行榜</p>
              <div className="flex flex-col gap-2">
                {restaurantRanking.slice(0, 10).map(([name, stats], idx) => (
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
        </>
      )}

      <BottomNav />
    </div>
  );
}
