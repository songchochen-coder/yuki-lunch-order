'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import { LunchOrder, Member, getWeekStart, getWeekDates, formatDate, getWeekday } from '@/lib/types';
import { getOrdersByWeek, getMembers } from '@/lib/client-db';

export default function Home() {
  const [orders, setOrders] = useState<LunchOrder[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split('T')[0];
  const weekStart = getWeekStart(today);
  const weekDates = getWeekDates(today);

  useEffect(() => {
    setOrders(getOrdersByWeek(weekStart));
    setMembers(getMembers());
    setLoading(false);
  }, [weekStart]);

  const todayOrders = orders.filter(o => o.date === today);
  const weekTotal = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  const todayTotal = todayOrders.reduce((sum, o) => sum + o.totalAmount, 0);

  const userSpending: Record<string, number> = {};
  for (const o of orders) {
    userSpending[o.user] = (userSpending[o.user] || 0) + o.totalAmount;
  }

  if (loading) {
    return (
      <div className="page-container">
        <div className="flex flex-col items-center justify-center" style={{ minHeight: '60vh' }}>
          <div className="text-3xl mb-4">🍱</div>
          <p style={{ color: 'var(--color-text-secondary)' }}>載入中...</p>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">🍱 午餐點餐紀錄</h1>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {formatDate(weekDates[0])} ~ {formatDate(weekDates[4])}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="card">
          <p className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>今日花費</p>
          <p className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>${todayTotal.toLocaleString()}</p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{todayOrders.length} 筆訂單</p>
        </div>
        <div className="card">
          <p className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>本週總計</p>
          <p className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>${weekTotal.toLocaleString()}</p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{orders.length} 筆訂單</p>
        </div>
      </div>

      {members.length > 0 && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">成員儲值餘額</p>
            <Link href="/settings" className="text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>管理 &rarr;</Link>
          </div>
          <div className="flex flex-col gap-2">
            {members.map(m => (
              <div key={m.name} className="flex items-center justify-between">
                <span className="text-sm">{m.name}</span>
                <div className="text-right">
                  <span className="text-sm font-bold" style={{ color: m.balance < 0 ? 'var(--color-danger)' : m.balance < 200 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                    ${m.balance.toLocaleString()}
                  </span>
                  {userSpending[m.name] > 0 && (
                    <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>本週 -${userSpending[m.name].toLocaleString()}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Link href="/add" className="btn btn-primary btn-lg flex flex-col items-center gap-1">
          <span className="text-xl">🍱</span><span className="text-xs">點餐</span>
        </Link>
        <Link href="/scan" className="btn btn-primary btn-lg flex flex-col items-center gap-1">
          <span className="text-xl">📷</span><span className="text-xs">拍照辨識</span>
        </Link>
        <Link href="/weekly-plan" className="btn btn-outline btn-lg flex flex-col items-center gap-1">
          <span className="text-xl">📅</span><span className="text-xs">整週預排</span>
        </Link>
        <Link href="/menus" className="btn btn-outline btn-lg flex flex-col items-center gap-1">
          <span className="text-xl">📖</span><span className="text-xs">菜單庫</span>
        </Link>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold">今日訂單 ({getWeekday(today)})</h2>
          <Link href="/history" className="text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>查看全部 &rarr;</Link>
        </div>
        {todayOrders.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-2xl mb-2">🍽️</p>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>今天還沒有點餐紀錄</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {todayOrders.map(order => (
              <div key={order.id} className="card flex items-center gap-3" style={{ padding: '12px var(--spacing-md)' }}>
                <span className="text-2xl">🍱</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{order.restaurant}</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{order.user} &middot; {order.itemsText}</p>
                </div>
                <p className="text-sm font-bold whitespace-nowrap">${order.totalAmount.toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
