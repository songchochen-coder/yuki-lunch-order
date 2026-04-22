'use client';

import { useState, useEffect, useCallback } from 'react';
import BottomNav from '@/components/BottomNav';
import SwipeToDelete from '@/components/SwipeToDelete';
import { LunchOrder, MenuTemplate, getWeekStart, getWeekDates, formatDate, getWeekday, formatDiscount, getPaymentMethod } from '@/lib/types';
import { getOrders, deleteOrder, getMenus, applyGroupDiscount, markOrderPaid as dbMarkOrderPaid, markOrderUnpaid as dbMarkOrderUnpaid, setOrderAmount as dbSetOrderAmount } from '@/lib/client-db';

type Tab = 'order' | 'overview';

export default function StatsPage() {
  const [allOrders, setAllOrders] = useState<LunchOrder[]>([]);
  const [menuList, setMenuList] = useState<MenuTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }, []);

  function handleDeleteOrder(id: string) {
    const existing = allOrders.find(o => o.id === id);
    const wasBalance = existing && getPaymentMethod(existing) === 'balance';
    const success = deleteOrder(id);
    if (success) {
      setAllOrders(prev => prev.filter(o => o.id !== id));
      showToast(wasBalance ? '已刪除並退款' : '已刪除');
    } else {
      showToast('刪除失敗');
    }
  }

  function handleCollectOrder(id: string) {
    const order = allOrders.find(o => o.id === id);
    if (!order) return;
    if (!confirm(`確認向 ${order.user} 收取現金 $${order.totalAmount.toLocaleString()}？`)) return;
    const updated = dbMarkOrderPaid(id);
    if (updated) {
      setAllOrders(prev => prev.map(o => (o.id === id ? updated : o)));
      showToast(`已收款 $${order.totalAmount.toLocaleString()}`);
    } else {
      showToast('收款失敗');
    }
  }

  function handleMarkUnpaid(id: string) {
    const order = allOrders.find(o => o.id === id);
    if (!order) return;
    if (!confirm(`把這筆改為未付款？\n$${order.totalAmount.toLocaleString()} 會退回 ${order.user} 的儲值金，並進入待收現金。`)) return;
    const updated = dbMarkOrderUnpaid(id);
    if (updated) {
      setAllOrders(prev => prev.map(o => (o.id === id ? updated : o)));
      showToast('已改為未付款，儲值金已退回');
    } else {
      showToast('操作失敗');
    }
  }

  // Inline discount UI state: which restaurant group is currently being edited
  const [discountEditing, setDiscountEditing] = useState<string | null>(null); // restaurant name
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [discountValue, setDiscountValue] = useState<number | ''>('');

  function openDiscount(restaurant: string, existingType?: 'percent' | 'amount', existingValue?: number) {
    setDiscountEditing(restaurant);
    setDiscountType(existingType || 'percent');
    setDiscountValue(existingValue || '');
  }
  function closeDiscount() {
    setDiscountEditing(null);
    setDiscountValue('');
  }
  function applyDiscountGroup(restaurant: string) {
    const value = typeof discountValue === 'number' ? discountValue : 0;
    if (value <= 0) { showToast('請輸入折扣數字'); return; }
    const { affected } = applyGroupDiscount(restaurant, selectedDate, discountType, value);
    setAllOrders(getOrders());
    showToast(`已套用折扣到 ${affected} 筆訂單`);
    closeDiscount();
  }
  function clearDiscountGroup(restaurant: string) {
    if (!confirm(`確定要清除「${restaurant}」當日折扣？`)) return;
    const { affected } = applyGroupDiscount(restaurant, selectedDate, 'none', 0);
    setAllOrders(getOrders());
    showToast(`已清除 ${affected} 筆訂單的折扣`);
    closeDiscount();
  }

  // Per-order manual amount override — for exceptions like "drinks don't count"
  const [amountEditing, setAmountEditing] = useState<string | null>(null); // order id
  const [amountValue, setAmountValue] = useState<number | ''>('');

  function openAmountEdit(orderId: string, currentAmount: number) {
    setAmountEditing(orderId);
    setAmountValue(currentAmount);
  }
  function closeAmountEdit() {
    setAmountEditing(null);
    setAmountValue('');
  }
  function saveAmountEdit(orderId: string) {
    const value = typeof amountValue === 'number' ? amountValue : -1;
    if (value < 0) { showToast('請輸入正確金額'); return; }
    const updated = dbSetOrderAmount(orderId, value);
    if (updated) {
      setAllOrders(getOrders());
      showToast(`已更新金額為 $${value.toLocaleString()}`);
    } else {
      showToast('更新失敗');
    }
    closeAmountEdit();
  }
  const [tab, setTab] = useState<Tab>('order');
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);

  const weekStart = getWeekStart(today);
  const weekDates = getWeekDates(today);
  const monthStart = today.slice(0, 7) + '-01';

  useEffect(() => {
    setAllOrders(getOrders());
    setMenuList(getMenus());
    setLoading(false);
  }, []);

  // ─── Restaurant Order View (tab: order) ───
  const dayOrders = allOrders.filter(o => o.date === selectedDate);

  // Group by restaurant, then aggregate items
  const restaurantOrders: Record<string, {
    totalAmount: number;
    orderCount: number;
    itemTotals: Record<string, { quantity: number; price: number; totalAmount: number; users: string[] }>;
    userItems: { id: string; user: string; items: string; amount: number; originalAmount?: number; discountType?: 'percent' | 'amount'; discountValue?: number; paymentMethod: 'balance' | 'cash' | 'unpaid' }[];
    originalTotalAmount: number;
  }> = {};

  for (const o of dayOrders) {
    if (!restaurantOrders[o.restaurant]) {
      restaurantOrders[o.restaurant] = { totalAmount: 0, orderCount: 0, itemTotals: {}, userItems: [], originalTotalAmount: 0 };
    }
    const r = restaurantOrders[o.restaurant];
    r.totalAmount += o.totalAmount;
    r.originalTotalAmount += o.originalAmount || o.totalAmount;
    r.orderCount += 1;
    r.userItems.push({ id: o.id, user: o.user, items: o.itemsText, amount: o.totalAmount, originalAmount: o.originalAmount, discountType: o.discountType, discountValue: o.discountValue, paymentMethod: getPaymentMethod(o) });

    // Aggregate individual items
    if (o.items && o.items.length > 0) {
      for (const it of o.items) {
        // Include note in key so "排骨飯(加辣)" and "排骨飯" are separate
        const key = it.note ? `${it.name}(${it.note})` : it.name;
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
            border: tab === 'order' ? 'none' : '1px solid var(--color-border)',
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
            border: tab === 'overview' ? 'none' : '1px solid var(--color-border)',
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
                // Use UTC math to avoid timezone issues (UTC+8 was breaking right arrow)
                const d = new Date(selectedDate + 'T00:00:00Z');
                d.setUTCDate(d.getUTCDate() - 1);
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
                const d = new Date(selectedDate + 'T00:00:00Z');
                d.setUTCDate(d.getUTCDate() + 1);
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
            <div className="card mb-4" style={{ background: 'var(--color-tint-primary)' }}>
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
                const menuEntry = menuList.find(m => m.restaurant === name);
                const menuPhone = menuEntry?.phone;
                const menuClosedDays = menuEntry?.closedDays;
                // Group discount = any order in group that already has one (we apply uniformly).
                const existingDiscount = info.userItems.find(u => u.discountType);
                const isEditingDiscount = discountEditing === name;
                return (
                  <div key={name} className="card">
                    <div className="flex items-center justify-between mb-3 pb-2" style={{ borderBottom: '2px solid var(--color-primary)' }}>
                      <div>
                        <p className="text-base font-bold flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/snoopy/food.png" alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                          {name}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {info.orderCount} 人訂餐
                        </p>
                        <div className="flex flex-wrap gap-3">
                          {menuPhone && (
                            <a href={`tel:${menuPhone}`} className="text-xs" style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>
                              📞 {menuPhone}
                            </a>
                          )}
                          {menuClosedDays && (
                            <span className="text-xs" style={{ color: 'var(--color-danger)' }}>🚫 休 {menuClosedDays}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        {info.originalTotalAmount !== info.totalAmount && (
                          <p className="text-xs" style={{ color: 'var(--color-text-muted)', textDecoration: 'line-through' }}>
                            ${info.originalTotalAmount.toLocaleString()}
                          </p>
                        )}
                        <p className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>
                          ${info.totalAmount.toLocaleString()}
                        </p>
                        <button
                          className="btn btn-ghost"
                          onClick={() => isEditingDiscount ? closeDiscount() : openDiscount(name, existingDiscount?.discountType, existingDiscount?.discountValue)}
                          style={{ fontSize: 11, padding: '2px 8px', marginTop: 4 }}
                        >
                          {existingDiscount
                            ? `${formatDiscount(existingDiscount.discountType, existingDiscount.discountValue)} ✎`
                            : '＋ 套用折扣'}
                        </button>
                      </div>
                    </div>

                    {/* Inline group-discount editor */}
                    {isEditingDiscount && (
                      <div className="mb-3 p-3" style={{ background: 'var(--color-bg)', borderRadius: 8 }}>
                        <p className="text-xs font-semibold mb-1">🏷️ 整組折扣（套到 {info.orderCount} 筆訂單）</p>
                        <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
                          套完後若有不折扣品項，可用下方各人旁邊的「✎」單獨改金額
                        </p>
                        <div className="flex gap-2 mb-2">
                          <button
                            className="btn flex-1"
                            onClick={() => setDiscountType('percent')}
                            style={{
                              fontSize: 12, padding: '6px 4px',
                              background: discountType === 'percent' ? 'var(--color-primary)' : 'white',
                              color: discountType === 'percent' ? 'white' : 'var(--color-text)',
                              border: discountType === 'percent' ? 'none' : '1px solid var(--color-border)',
                            }}
                          >打 X 折</button>
                          <button
                            className="btn flex-1"
                            onClick={() => setDiscountType('amount')}
                            style={{
                              fontSize: 12, padding: '6px 4px',
                              background: discountType === 'amount' ? 'var(--color-primary)' : 'white',
                              color: discountType === 'amount' ? 'white' : 'var(--color-text)',
                              border: discountType === 'amount' ? 'none' : '1px solid var(--color-border)',
                            }}
                          >每人折 $X</button>
                        </div>
                        <input
                          className="input mb-2"
                          type="number"
                          inputMode="decimal"
                          placeholder={discountType === 'percent' ? '例：9 (9 折)' : '例：20 (每人折 $20)'}
                          value={discountValue}
                          onChange={e => setDiscountValue(e.target.value === '' ? '' : Number(e.target.value))}
                          style={{ fontSize: 14 }}
                        />
                        <div className="flex gap-2">
                          <button
                            className="btn btn-primary flex-1"
                            onClick={() => applyDiscountGroup(name)}
                            style={{ fontSize: 13, padding: '8px' }}
                          >套用</button>
                          {existingDiscount && (
                            <button
                              className="btn flex-1"
                              onClick={() => clearDiscountGroup(name)}
                              style={{ fontSize: 13, padding: '8px', background: 'var(--color-tint-danger)', color: 'var(--color-danger)', border: '1px solid var(--color-danger)' }}
                            >清除折扣</button>
                          )}
                          <button
                            className="btn flex-1"
                            onClick={closeDiscount}
                            style={{ fontSize: 13, padding: '8px' }}
                          >取消</button>
                        </div>
                      </div>
                    )}

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
                      <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>← 左滑可刪除</p>
                      <div className="flex flex-col gap-1">
                        {info.userItems.map((ui, i) => {
                          const isUnpaid = ui.paymentMethod === 'unpaid';
                          const isCash = ui.paymentMethod === 'cash';
                          const isBalance = ui.paymentMethod === 'balance';
                          const isEditingAmount = amountEditing === ui.id;
                          // Manually overridden: has originalAmount set but no discountType
                          const isManual = !!ui.originalAmount && !ui.discountType;
                          return (
                            <div key={ui.id || i}>
                              <SwipeToDelete onDelete={() => handleDeleteOrder(ui.id)}>
                                <div className="flex items-center justify-between text-xs" style={{ padding: '6px 10px', background: isUnpaid ? 'var(--color-tint-warning)' : 'white', borderRadius: 6 }}>
                                  <div className="flex-1">
                                    <span className="font-semibold">{ui.user}</span>
                                    <span className="ml-2" style={{ color: 'var(--color-text-muted)' }}>{ui.items}</span>
                                    {ui.discountType && (
                                      <span style={{ marginLeft: 4, fontSize: 9, padding: '1px 4px', borderRadius: 999, background: 'var(--color-success)', color: 'white', fontWeight: 600 }}>
                                        {formatDiscount(ui.discountType, ui.discountValue)}
                                      </span>
                                    )}
                                    {isManual && (
                                      <span style={{ marginLeft: 4, fontSize: 9, padding: '1px 4px', borderRadius: 999, background: 'var(--color-primary)', color: 'white', fontWeight: 600 }}>
                                        自訂金額
                                      </span>
                                    )}
                                    {isUnpaid && (
                                      <span style={{ marginLeft: 4, fontSize: 9, padding: '1px 4px', borderRadius: 999, background: 'var(--color-warning)', color: 'white', fontWeight: 600 }}>
                                        ⏳ 未付款
                                      </span>
                                    )}
                                    {isCash && (
                                      <span style={{ marginLeft: 4, fontSize: 9, padding: '1px 4px', borderRadius: 999, background: 'var(--color-success)', color: 'white', fontWeight: 600 }}>
                                        💵 現金
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-right flex items-center gap-2">
                                    <div>
                                      {ui.originalAmount && ui.originalAmount !== ui.amount && (
                                        <span className="mr-2" style={{ color: 'var(--color-text-muted)', textDecoration: 'line-through', fontSize: 10 }}>
                                          ${ui.originalAmount}
                                        </span>
                                      )}
                                      <span className="font-semibold">${ui.amount}</span>
                                    </div>
                                    <button
                                      className="btn"
                                      onClick={(e) => { e.stopPropagation(); isEditingAmount ? closeAmountEdit() : openAmountEdit(ui.id, ui.amount); }}
                                      style={{ fontSize: 11, padding: '2px 6px', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                                      title="手動改金額（不折扣品項）"
                                    >✎</button>
                                    {isUnpaid && (
                                      <button
                                        className="btn"
                                        onClick={(e) => { e.stopPropagation(); handleCollectOrder(ui.id); }}
                                        style={{
                                          fontSize: 11, padding: '2px 8px',
                                          background: 'var(--color-warning)', color: 'white', border: 'none',
                                        }}
                                      >收款</button>
                                    )}
                                    {isBalance && (
                                      <button
                                        className="btn"
                                        onClick={(e) => { e.stopPropagation(); handleMarkUnpaid(ui.id); }}
                                        style={{
                                          fontSize: 11, padding: '2px 6px',
                                          background: 'transparent', color: 'var(--color-warning)', border: '1px solid var(--color-warning)',
                                        }}
                                        title="改為未付款（退回儲值金，之後收現金）"
                                      >↩ 未付</button>
                                    )}
                                  </div>
                                </div>
                              </SwipeToDelete>
                              {isEditingAmount && (
                                <div className="flex gap-2 mt-1 mb-1" style={{ padding: '0 10px' }}>
                                  <input
                                    className="input flex-1"
                                    type="number"
                                    inputMode="numeric"
                                    placeholder="輸入實際金額"
                                    value={amountValue}
                                    onChange={e => setAmountValue(e.target.value === '' ? '' : Number(e.target.value))}
                                    style={{ fontSize: 13, padding: '6px 10px' }}
                                    autoFocus
                                  />
                                  <button
                                    className="btn btn-primary"
                                    onClick={() => saveAmountEdit(ui.id)}
                                    style={{ fontSize: 12, padding: '6px 12px' }}
                                  >儲存</button>
                                  <button
                                    className="btn"
                                    onClick={closeAmountEdit}
                                    style={{ fontSize: 12, padding: '6px 12px' }}
                                  >取消</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
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
                border: period === 'week' ? 'none' : '1px solid var(--color-border)',
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
                border: period === 'month' ? 'none' : '1px solid var(--color-border)',
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

      {toast && <div className="toast">{toast}</div>}
      <BottomNav />
    </div>
  );
}
