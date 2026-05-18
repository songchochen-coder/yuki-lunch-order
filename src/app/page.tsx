'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import { LunchOrder, Member, getWeekStart, getWeekDates, formatDate, getWeekday, todayStr, formatBalance } from '@/lib/types';
import { getOrdersByWeek, getMembers, getUnpaidTotalsByUser, collectAllForUser, getTransactions } from '@/lib/client-db';

export default function Home() {
  const [orders, setOrders] = useState<LunchOrder[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [unpaidTotals, setUnpaidTotals] = useState<Record<string, number>>({});
  // Names of members who have ever interacted with the stored-value system
  // (deposit or deduct transaction). Used to suppress the low-balance banner
  // for members who pay cash only — their $0 isn't "running low", it just
  // means they don't use the balance feature at all.
  const [activeBalanceUsers, setActiveBalanceUsers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const today = todayStr();
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
    const active = new Set<string>();
    for (const t of getTransactions()) {
      if (t.type === 'deposit' || t.type === 'deduct') active.add(t.user);
    }
    setActiveBalanceUsers(active);
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
          <img src="/snoopy/menu-hero.png" alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} />
          <span>午餐點餐紀錄</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/snoopy/sakura.png" alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
        </h1>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {formatDate(weekDates[0])} ~ {formatDate(weekDates[4])}
        </span>
      </div>
      <div className="title-divider" />

      {/* Balance alert banner — surfaces members who owe money (negative) or are
          running low (0–199). Renders nothing when everyone is fine, so it
          self-clears the moment balances recover. Whole banner is a Link to
          /settings so a single tap takes you to the deposit form. */}
      {(() => {
        // Negative balance always warrants alert (clearly engaged with the
        // system). Low (0–199) only counts if they've actually used stored
        // value before — otherwise $0 means "doesn't use this feature",
        // not "running low".
        const negative = members.filter(m => m.balance < 0);
        const low = members.filter(m =>
          m.balance >= 0 && m.balance < 200 && activeBalanceUsers.has(m.name)
        );
        if (negative.length === 0 && low.length === 0) return null;
        const hasNegative = negative.length > 0;
        const accent = hasNegative ? 'var(--color-danger)' : 'var(--color-warning)';
        const bg = hasNegative ? 'var(--color-tint-danger)' : 'var(--color-tint-warning)';
        return (
          <Link
            href="/settings"
            className="card mb-4 alert-banner"
            style={{
              display: 'block',
              background: bg,
              border: `1.5px solid ${accent}`,
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <p className="text-sm font-bold mb-2" style={{ color: accent }}>
              ⚠️ {hasNegative ? '有成員儲值金不足' : '有成員餘額偏低'}
            </p>
            <div className="flex flex-col gap-1">
              {negative.map(m => (
                <div key={m.name} className="flex justify-between text-xs">
                  <span>{m.name}</span>
                  <span>
                    <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{formatBalance(m.balance)}</span>
                    <span className="ml-2" style={{ color: 'var(--color-text-muted)' }}>已欠款</span>
                  </span>
                </div>
              ))}
              {low.map(m => (
                <div key={m.name} className="flex justify-between text-xs">
                  <span>{m.name}</span>
                  <span>
                    <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>{formatBalance(m.balance)}</span>
                    <span className="ml-2" style={{ color: 'var(--color-text-muted)' }}>偏低</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
              點此到設定儲值 →
            </p>
          </Link>
        );
      })()}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="card fade-up fade-up-1">
          <p className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>今日花費</p>
          <p className="font-bold" style={{ color: 'var(--color-primary)' }}>
            <span style={{ fontSize: '0.72em', opacity: 0.6, fontWeight: 600, marginRight: 1 }}>$</span>
            <span style={{ fontSize: '1.35rem', letterSpacing: '-0.01em' }}>{todayTotal.toLocaleString()}</span>
          </p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{todayOrders.length} 筆訂單</p>
        </div>
        <div className="card fade-up fade-up-2">
          <p className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>本週總計</p>
          <p className="font-bold" style={{ color: 'var(--color-primary)' }}>
            <span style={{ fontSize: '0.72em', opacity: 0.6, fontWeight: 600, marginRight: 1 }}>$</span>
            <span style={{ fontSize: '1.35rem', letterSpacing: '-0.01em' }}>{weekTotal.toLocaleString()}</span>
          </p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{orders.length} 筆訂單</p>
        </div>
      </div>

      {members.length > 0 && (
        <div className="card mb-4 fade-up fade-up-3">
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
                        {formatBalance(m.balance)}
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
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                💡 點右側「收款」按鈕一次銷掉該員所有未付款訂單
              </p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mt-6 mb-4 fade-up fade-up-4">
        <Link href="/add" className="btn btn-primary btn-lg flex flex-col items-center gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/snoopy/food-hero.png" alt="" style={{ width: 56, height: 56, objectFit: 'contain' }} />
          <span className="text-xs">點餐</span>
        </Link>
        <Link href="/scan" className="btn btn-primary btn-lg flex flex-col items-center gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/snoopy/scan-hero.png" alt="" style={{ width: 56, height: 56, objectFit: 'contain' }} />
          <span className="text-xs">拍照辨識</span>
        </Link>
        <Link href="/weekly-plan" className="btn btn-primary btn-lg flex flex-col items-center gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/snoopy/plan-hero.png" alt="" style={{ width: 56, height: 56, objectFit: 'contain' }} />
          <span className="text-xs">整週預排</span>
        </Link>
        <Link href="/menus" className="btn btn-primary btn-lg flex flex-col items-center gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/snoopy/menu-hero.png" alt="" style={{ width: 56, height: 56, objectFit: 'contain' }} />
          <span className="text-xs">菜單庫</span>
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
