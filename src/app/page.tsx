'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import { LunchOrder, Member, getWeekStart, getWeekDates, formatDate, getWeekday } from '@/lib/types';
import { getOrdersByWeek, getMembers, getUnpaidTotalsByUser, collectAllForUser } from '@/lib/client-db';

export default function Home() {
  const [orders, setOrders] = useState<LunchOrder[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [unpaidTotals, setUnpaidTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const today = new Date().toISOString().split('T')[0];
  const weekStart = getWeekStart(today);
  const weekDates = getWeekDates(today);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }, []);

  useEffect(() => {
    setOrders(getOrdersByWeek(weekStart));
    setMembers(getMembers());
    setUnpaidTotals(getUnpaidTotalsByUser());
    setLoading(false);
  }, [weekStart]);

  function handleCollectUser(user: string) {
    const total = unpaidTotals[user] || 0;
    if (total <= 0) return;
    if (!confirm(`確認向 ${user} 收取現金 $${total.toLocaleString()}？\n（會把所有未付款訂單一次銷帳）`)) return;
    const { count, total: collected } = collectAllForUser(user);
    if (count > 0) {
      setUnpaidTotals(getUnpaidTotalsByUser());
      setOrders(getOrdersByWeek(weekStart));
      showToast(`已收款 $${collected.toLocaleString()}（${count} 筆）`);
    } else {
      showToast('沒有未付款訂單');
    }
  }

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/snoopy/food.png" alt="食物" style={{ width: 56, height: 56, objectFit: 'contain', marginBottom: 12 }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>載入中...</p>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/snoopy/food.png" alt="" style={{ width: 26, height: 26, objectFit: 'contain' }} />
          <span>午餐點餐紀錄</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/snoopy/sakura.png" alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
        </h1>
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
            <p className="text-sm font-semibold flex items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/snoopy/transfer.png" alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
              成員儲值餘額
            </p>
            <Link href="/settings" className="text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>管理 &rarr;</Link>
          </div>
          <div className="flex flex-col gap-2">
            {members.map(m => {
              const unpaid = unpaidTotals[m.name] || 0;
              return (
                <div key={m.name} className="flex items-center justify-between">
                  <span className="text-sm">{m.name}</span>
                  <div className="text-right flex items-center gap-2">
                    <div>
                      <span className="text-sm font-bold" style={{ color: m.balance < 0 ? 'var(--color-danger)' : m.balance < 200 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                        ${m.balance.toLocaleString()}
                      </span>
                      {userSpending[m.name] > 0 && (
                        <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>本週 -${userSpending[m.name].toLocaleString()}</span>
                      )}
                    </div>
                    {unpaid > 0 && (
                      <button
                        onClick={() => handleCollectUser(m.name)}
                        className="btn"
                        style={{
                          fontSize: 11, padding: '3px 8px', border: 'none',
                          background: 'var(--color-warning)', color: 'white', fontWeight: 600,
                        }}
                        title={`向 ${m.name} 收款`}
                      >
                        ⏳ 收款 ${unpaid.toLocaleString()}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {Object.values(unpaidTotals).some(v => v > 0) && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid #F0F0F0' }}>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                💡 點右側「收款」按鈕一次銷掉該員所有未付款訂單
              </p>
            </div>
          )}
        </div>
      )}

      {/* Home action shortcuts: icons float directly over the wallpaper with
          no button chrome. Text has a subtle shadow to stay readable on any
          background without fighting the wallpaper visually. */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { href: '/add',         img: '/snoopy/food-hero.png', label: '點餐' },
          { href: '/scan',        img: '/snoopy/scan-hero.png', label: '拍照辨識' },
          { href: '/weekly-plan', img: '/icon-512.png',         label: '整週預排' },
          { href: '/menus',       img: '/snoopy/menu.png',      label: '菜單庫' },
        ].map(a => (
          <Link
            key={a.href}
            href={a.href}
            className="flex flex-col items-center justify-center"
            style={{
              gap: 6, padding: '16px 8px',
              textDecoration: 'none',
              color: 'var(--color-text)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.img} alt="" style={{ width: 64, height: 64, objectFit: 'contain' }} />
            <span
              className="text-xs"
              style={{
                fontWeight: 600,
                textShadow: '0 1px 2px rgba(255,255,255,0.9), 0 0 8px rgba(255,255,255,0.6)',
              }}
            >{a.label}</span>
          </Link>
        ))}
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/snoopy/food.png" alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} />
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

      {toast && <div className="toast">{toast}</div>}
      <BottomNav />
    </div>
  );
}
