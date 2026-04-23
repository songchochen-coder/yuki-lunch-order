'use client';

import { useState, useEffect, useCallback } from 'react';
import BottomNav from '@/components/BottomNav';
import SwipeToDelete from '@/components/SwipeToDelete';
import { LunchOrder, Member, getWeekStart, getWeekDates, formatDate, getWeekday, formatDiscount, getPaymentMethod, todayStr, toLocalDateStr } from '@/lib/types';
import { getOrders, deleteOrder as dbDeleteOrder, markOrderPaid as dbMarkOrderPaid, markOrderUnpaid as dbMarkOrderUnpaid, editOrder as dbEditOrder, getMembers } from '@/lib/client-db';

export default function HistoryPage() {
  const [orders, setOrders] = useState<LunchOrder[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [editingOrder, setEditingOrder] = useState<LunchOrder | null>(null);

  // Filters
  const [selectedMember, setSelectedMember] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>(() => getWeekStart(todayStr()));
  const [dateTo, setDateTo] = useState<string>(() => getWeekDates(todayStr())[4]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }, []);

  const loadOrders = useCallback(() => {
    const all = getOrders();
    const filtered = all.filter(o => {
      if (o.date < dateFrom || o.date > dateTo) return false;
      if (selectedMember !== 'all' && o.user !== selectedMember) return false;
      return true;
    });
    setOrders(filtered);
  }, [dateFrom, dateTo, selectedMember]);

  useEffect(() => {
    setLoading(true);
    loadOrders();
    setMembers(getMembers());
    setLoading(false);
  }, [loadOrders]);

  function refresh() {
    loadOrders();
    setMembers(getMembers());
  }

  // ── Quick range presets ──
  function applyThisWeek() {
    const t = todayStr();
    setDateFrom(getWeekStart(t));
    setDateTo(getWeekDates(t)[4]);
  }
  function applyLastWeek() {
    const t = todayStr();
    const lastMon = new Date(getWeekStart(t) + 'T00:00:00');
    lastMon.setDate(lastMon.getDate() - 7);
    const lastFri = new Date(lastMon);
    lastFri.setDate(lastFri.getDate() + 4);
    setDateFrom(toLocalDateStr(lastMon));
    setDateTo(toLocalDateStr(lastFri));
  }
  function applyThisMonth() {
    const t = todayStr();
    const [y, m] = t.split('-');
    const lastDay = new Date(Number(y), Number(m), 0).getDate();
    setDateFrom(`${y}-${m}-01`);
    setDateTo(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
  }

  // Preset detection for highlighting the active preset button
  const preset = (() => {
    const t = todayStr();
    const thisWeekStart = getWeekStart(t);
    const thisWeekEnd = getWeekDates(t)[4];
    if (dateFrom === thisWeekStart && dateTo === thisWeekEnd) return 'this-week';

    const lastMon = new Date(thisWeekStart + 'T00:00:00');
    lastMon.setDate(lastMon.getDate() - 7);
    const lastFri = new Date(lastMon);
    lastFri.setDate(lastFri.getDate() + 4);
    if (dateFrom === toLocalDateStr(lastMon) && dateTo === toLocalDateStr(lastFri)) return 'last-week';

    const [y, m] = t.split('-');
    const lastDay = new Date(Number(y), Number(m), 0).getDate();
    if (dateFrom === `${y}-${m}-01` && dateTo === `${y}-${m}-${String(lastDay).padStart(2, '0')}`) return 'this-month';

    return 'custom';
  })();

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

  const rangeTotal = orders.reduce((sum, o) => sum + o.totalAmount, 0);

  // Breakdown by payment method (for summary pill + formatted text)
  const byMethod = { balance: 0, cash: 0, unpaid: 0 };
  for (const o of orders) {
    const m = getPaymentMethod(o);
    byMethod[m] += o.totalAmount;
  }

  const userTotals: Record<string, number> = {};
  for (const o of orders) {
    userTotals[o.user] = (userTotals[o.user] || 0) + o.totalAmount;
  }

  const ordersByDate: Record<string, LunchOrder[]> = {};
  for (const o of orders) {
    if (!ordersByDate[o.date]) ordersByDate[o.date] = [];
    ordersByDate[o.date].push(o);
  }

  // All dates in [dateFrom, dateTo] inclusive, for iteration of day groups
  const datesInRange = (() => {
    const result: string[] = [];
    const start = new Date(dateFrom + 'T00:00:00');
    const end = new Date(dateTo + 'T00:00:00');
    if (start > end) return result;
    const cur = new Date(start);
    while (cur <= end) {
      result.push(toLocalDateStr(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  })();

  // ── Copy / share: format the current filtered view as plain text ──
  function formatDetailText(): string {
    const memberLabel = selectedMember === 'all' ? '全體' : selectedMember;
    const rangeLabel = dateFrom === dateTo
      ? formatDate(dateFrom)
      : `${formatDate(dateFrom)} ~ ${formatDate(dateTo)}`;
    const lines: string[] = [];
    lines.push(`🍱 ${memberLabel} ${rangeLabel} 明細`);
    lines.push('━'.repeat(24));
    const sortedDates = [...datesInRange].reverse();
    for (const date of sortedDates) {
      const dayOrders = ordersByDate[date] || [];
      if (dayOrders.length === 0) continue;
      for (const o of dayOrders) {
        const weekday = getWeekday(date);
        const userPart = selectedMember === 'all' ? ` (${o.user})` : '';
        const m = getPaymentMethod(o);
        const methodTag = m === 'unpaid' ? ' ⏳未付' : m === 'cash' ? ' 💵現金' : '';
        lines.push(`${formatDate(date)} ${weekday} ${o.restaurant}${userPart} $${o.totalAmount.toLocaleString()}${methodTag}`);
        if (o.itemsText) lines.push(`  · ${o.itemsText}`);
      }
    }
    lines.push('━'.repeat(24));
    lines.push(`合計：$${rangeTotal.toLocaleString()}`);
    const methodsUsed = [byMethod.balance > 0, byMethod.cash > 0, byMethod.unpaid > 0].filter(Boolean).length;
    if (methodsUsed === 1) {
      if (byMethod.balance > 0) lines.push('付款：全部從儲值金扣款');
      else if (byMethod.cash > 0) lines.push('付款：全部現金已付');
      else lines.push('⏳ 全部未付款');
    } else if (methodsUsed > 1) {
      const parts: string[] = [];
      if (byMethod.balance) parts.push(`儲值金 $${byMethod.balance.toLocaleString()}`);
      if (byMethod.cash) parts.push(`現金 $${byMethod.cash.toLocaleString()}`);
      if (byMethod.unpaid) parts.push(`未付 $${byMethod.unpaid.toLocaleString()}`);
      lines.push(parts.join(' / '));
    }
    if (selectedMember === 'all' && Object.keys(userTotals).length > 1) {
      lines.push('');
      lines.push('按成員：');
      for (const [user, total] of Object.entries(userTotals).sort((a, b) => b[1] - a[1])) {
        const bal = members.find(m => m.name === user)?.balance;
        const balPart = typeof bal === 'number' ? `  (餘 $${bal.toLocaleString()})` : '';
        lines.push(`  ${user}: $${total.toLocaleString()}${balPart}`);
      }
    } else if (selectedMember !== 'all') {
      const bal = members.find(m => m.name === selectedMember)?.balance;
      if (typeof bal === 'number') {
        lines.push('');
        lines.push(`💳 ${selectedMember} 目前儲值金餘額：$${bal.toLocaleString()}`);
      }
    }
    return lines.join('\n');
  }

  async function handleCopy() {
    const text = formatDetailText();
    try {
      await navigator.clipboard.writeText(text);
      showToast('已複製到剪貼簿');
    } catch {
      showToast('複製失敗');
    }
  }

  async function handleShare() {
    const text = formatDetailText();
    const memberLabel = selectedMember === 'all' ? '全體' : selectedMember;
    const title = `${memberLabel} 訂餐明細`;
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as Navigator).share({ title, text });
      } catch (err) {
        // User cancelled the share sheet → do nothing. Other errors → fallback to copy.
        if ((err as Error).name !== 'AbortError') handleCopy();
      }
    } else {
      handleCopy();
    }
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
      <h1 className="text-xl font-bold mb-4 flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/snoopy/history.png" alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} />
        <span>點餐紀錄</span>
      </h1>

      {/* Filter card — member chips + date range + quick presets */}
      <div className="card mb-3">
        <div className="mb-3">
          <label className="input-label">成員</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[{ name: 'all', label: '全部' }, ...members.map(m => ({ name: m.name, label: m.name }))].map(opt => {
              const active = selectedMember === opt.name;
              return (
                <button
                  key={opt.name}
                  onClick={() => setSelectedMember(opt.name)}
                  className="btn"
                  style={{
                    fontSize: 13, padding: '6px 14px',
                    background: active ? 'var(--color-primary)' : 'var(--color-bg-input)',
                    color: active ? 'white' : 'var(--color-text)',
                    border: active ? 'none' : '1px solid var(--color-border)',
                  }}
                >{opt.label}</button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="input-label">日期範圍</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
            <input
              className="input"
              type="date"
              value={dateFrom}
              max={dateTo}
              onChange={e => setDateFrom(e.target.value)}
              style={{ flex: 1 }}
            />
            <span style={{ color: 'var(--color-text-muted)' }}>~</span>
            <input
              className="input"
              type="date"
              value={dateTo}
              min={dateFrom}
              onChange={e => setDateTo(e.target.value)}
              style={{ flex: 1 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { key: 'this-week',  label: '本週', fn: applyThisWeek  },
              { key: 'last-week',  label: '上週', fn: applyLastWeek  },
              { key: 'this-month', label: '本月', fn: applyThisMonth },
            ] as const).map(p => {
              const active = preset === p.key;
              return (
                <button
                  key={p.key}
                  onClick={p.fn}
                  className="btn flex-1"
                  style={{
                    fontSize: 12, padding: '6px 4px',
                    background: active ? 'var(--color-primary)' : 'var(--color-bg-input)',
                    color: active ? 'white' : 'var(--color-text-secondary)',
                    border: active ? 'none' : '1px solid var(--color-border)',
                  }}
                >{p.label}</button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Range summary with Copy / Share actions */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold">
            {selectedMember === 'all' ? '區間小計' : `${selectedMember} 小計`}
          </p>
          <p className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>${rangeTotal.toLocaleString()}</p>
        </div>

        {/* Payment method breakdown — only shown when multiple methods are
            mixed in the range. When everything is one method we just show a
            single tag because the breakdown number would just duplicate 合計. */}
        {(() => {
          const methodsUsed = [byMethod.balance > 0, byMethod.cash > 0, byMethod.unpaid > 0].filter(Boolean).length;
          if (methodsUsed === 0) return null;
          if (methodsUsed === 1) {
            const only =
              byMethod.balance > 0 ? { label: '💳 全部從儲值金扣款', color: 'var(--color-text-secondary)' } :
              byMethod.cash > 0    ? { label: '💵 全部現金已付',     color: 'var(--color-success)' } :
                                     { label: '⏳ 全部未付款',       color: 'var(--color-warning)' };
            return (
              <div className="mb-2">
                <span className="text-xs" style={{ color: only.color, fontWeight: 600 }}>
                  {only.label}
                </span>
              </div>
            );
          }
          return (
            <div className="flex flex-wrap gap-3 mb-2">
              {byMethod.balance > 0 && (
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  💳 儲值金 ${byMethod.balance.toLocaleString()}
                </span>
              )}
              {byMethod.cash > 0 && (
                <span className="text-xs" style={{ color: 'var(--color-success)' }}>
                  💵 現金 ${byMethod.cash.toLocaleString()}
                </span>
              )}
              {byMethod.unpaid > 0 && (
                <span className="text-xs" style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
                  ⏳ 未付 ${byMethod.unpaid.toLocaleString()}
                </span>
              )}
            </div>
          );
        })()}

        {/* Per-user totals (only useful when 全部 is selected) */}
        {selectedMember === 'all' && Object.keys(userTotals).length > 0 && (
          <div className="flex flex-wrap gap-3 mb-2">
            {Object.entries(userTotals).sort((a, b) => b[1] - a[1]).map(([user, total]) => {
              const bal = members.find(m => m.name === user)?.balance;
              return (
                <span key={user} className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {user}: ${total.toLocaleString()}
                  {typeof bal === 'number' && (
                    <span style={{ color: bal < 0 ? 'var(--color-danger)' : bal < 200 ? 'var(--color-warning)' : 'var(--color-success)', marginLeft: 4 }}>
                      （餘 ${bal.toLocaleString()}）
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {/* Balance callout when a specific member is selected */}
        {selectedMember !== 'all' && (() => {
          const bal = members.find(m => m.name === selectedMember)?.balance;
          if (typeof bal !== 'number') return null;
          return (
            <div className="flex items-center justify-between mb-2 pt-2" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                💳 {selectedMember} 目前儲值金餘額
              </span>
              <span className="text-sm font-bold" style={{ color: bal < 0 ? 'var(--color-danger)' : bal < 200 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                ${bal.toLocaleString()}
              </span>
            </div>
          );
        })()}

        {/* Copy / Share actions */}
        {orders.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-border-subtle)' }}>
            <button
              className="btn flex-1"
              onClick={handleCopy}
              style={{ fontSize: 13, padding: '8px', background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
            >📋 複製明細</button>
            <button
              className="btn btn-primary flex-1"
              onClick={handleShare}
              style={{ fontSize: 13, padding: '8px' }}
            >📤 分享</button>
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
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {selectedMember === 'all'
              ? '這個區間沒有點餐紀錄'
              : `${selectedMember} 在這個區間沒有點餐紀錄`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {[...datesInRange].reverse().map(date => {
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
                                border: '1px solid var(--color-border)',
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
          background: 'var(--color-bg-card)', width: '100%', maxWidth: 480,
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
                    border: user === m.name ? 'none' : '1px solid var(--color-border)',
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
              background: willGoUnpaid ? 'var(--color-tint-warning)' : '#E8F5E9',
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
