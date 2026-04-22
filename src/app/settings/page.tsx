'use client';

import { useState, useEffect, useCallback } from 'react';
import BottomNav from '@/components/BottomNav';
import { Member, BalanceTransaction } from '@/lib/types';
import { getSettings, saveSettings } from '@/lib/settings';
import { getMembers as dbGetMembers, saveMember as dbSaveMember, deleteMember as dbDeleteMember, deposit as dbDeposit, adjustBalance as dbAdjustBalance, getTransactions as dbGetTransactions } from '@/lib/client-db';
import { AppSkin, getSkin, saveSkin, applySkin, COLOR_PRESETS, WALLPAPER_PRESETS } from '@/lib/skin';

export default function SettingsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [newMemberName, setNewMemberName] = useState('');
  const [depositUser, setDepositUser] = useState('');
  const [depositAmount, setDepositAmount] = useState<number | ''>('');
  const [transactions, setTransactions] = useState<BalanceTransaction[]>([]);
  const [showTxUser, setShowTxUser] = useState('');
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [depositDate, setDepositDate] = useState(new Date().toISOString().split('T')[0]);
  const [depositMode, setDepositMode] = useState<'add' | 'deduct'>('add');
  const [skin, setSkinState] = useState<AppSkin>({ primaryColor: '#F4A261', wallpaper: null, colorScheme: 'light' });

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }, []);

  useEffect(() => {
    const data = dbGetMembers();
    setMembers(data);
    const settings = getSettings();
    settings.users = data.map((m: Member) => m.name);
    saveSettings(settings);
    setGeminiApiKey(settings.geminiApiKey || '');
    setSkinState(getSkin());
    setLoading(false);
  }, []);

  function updateSkin(patch: Partial<AppSkin>) {
    const next = { ...skin, ...patch };
    setSkinState(next);
    saveSkin(next);
    applySkin(next);
  }

  function addMember() {
    const name = newMemberName.trim();
    if (!name) { showToast('請輸入成員名稱'); return; }
    if (members.some(m => m.name === name)) { showToast('成員已存在'); return; }

    const member = dbSaveMember(name);
    setMembers(prev => [...prev, member]);
    setNewMemberName('');

    const settings = getSettings();
    settings.users = [...settings.users, name];
    saveSettings(settings);
    showToast('已新增成員');
  }

  function removeMember(name: string) {
    if (!confirm(`確定要移除「${name}」嗎？`)) return;
    dbDeleteMember(name);
    setMembers(prev => prev.filter(m => m.name !== name));

    const settings = getSettings();
    settings.users = settings.users.filter(u => u !== name);
    saveSettings(settings);
    showToast('已移除成員');
  }

  function handleDeposit() {
    if (!depositUser) { showToast('請選擇成員'); return; }
    if (!depositAmount || depositAmount <= 0) { showToast('請輸入金額'); return; }

    try {
      const amt = typeof depositAmount === 'number' ? depositAmount : 0;
      const signed = depositMode === 'add' ? amt : -amt;
      if (depositMode === 'deduct') {
        const member = members.find(m => m.name === depositUser);
        if (!member) { showToast('找不到成員'); return; }
        if (!confirm(`確認從 ${depositUser} 的儲值金扣回 $${amt}？\n目前餘額 $${member.balance} → 扣後 $${member.balance - amt}`)) return;
      }
      dbAdjustBalance(depositUser, signed, undefined, depositDate);
      setMembers(prev => prev.map(m =>
        m.name === depositUser ? { ...m, balance: m.balance + signed } : m
      ));
      const dateLabel = depositDate ? ` (${depositDate.slice(5).replace('-', '/')})` : '';
      showToast(depositMode === 'add'
        ? `已為 ${depositUser} 儲值 $${amt}${dateLabel}`
        : `已從 ${depositUser} 扣回 $${amt}${dateLabel}`);
      setDepositAmount('');
    } catch {
      showToast(depositMode === 'add' ? '儲值失敗' : '扣款失敗');
    }
  }

  function loadTransactions(user: string) {
    if (showTxUser === user) { setShowTxUser(''); return; }
    const data = dbGetTransactions(user);
    setTransactions(data);
    setShowTxUser(user);
  }

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
      <h1 className="text-xl font-bold mb-4">⚙️ 設定</h1>

      {/* Members */}
      <div className="card mb-4">
        <p className="text-sm font-semibold mb-3">團隊成員</p>
        <div className="flex flex-col gap-2 mb-3">
          {members.map(m => (
            <div key={m.name}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm">{m.name}</span>
                  <span
                    className="text-sm font-bold ml-2"
                    style={{ color: m.balance < 0 ? 'var(--color-danger)' : m.balance < 200 ? 'var(--color-warning)' : 'var(--color-success)' }}
                  >
                    ${m.balance.toLocaleString()}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button className="text-xs" style={{ color: 'var(--color-primary)' }} onClick={() => loadTransactions(m.name)}>
                    {showTxUser === m.name ? '收起' : '紀錄'}
                  </button>
                  <button className="text-xs" style={{ color: 'var(--color-danger)' }} onClick={() => removeMember(m.name)}>移除</button>
                </div>
              </div>
              {showTxUser === m.name && (
                <div className="mt-2 ml-4" style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {transactions.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>暫無紀錄</p>
                  ) : (
                    transactions.slice().reverse().slice(0, 30).map(tx => {
                      const [, mm, dd] = (tx.date || '').split('-');
                      const dateLabel = mm && dd ? `${parseInt(mm)}/${parseInt(dd)}` : tx.date;
                      // Cash receipts don't change balance; show them neutral with a 💵 marker.
                      const isCash = tx.type === 'cash';
                      const sign = tx.type === 'deposit' ? '+' : tx.type === 'deduct' ? '-' : '💵';
                      const color = tx.type === 'deposit'
                        ? 'var(--color-success)'
                        : tx.type === 'deduct'
                        ? 'var(--color-danger)'
                        : 'var(--color-warning)';
                      return (
                        <div key={tx.id} className="flex justify-between text-xs py-1" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                          <div className="flex-1">
                            <span className="font-semibold" style={{ color }}>
                              {sign}{isCash ? ' ' : ''}${tx.amount}
                            </span>
                            <span className="ml-1" style={{ color: 'var(--color-text-muted)' }}>{tx.description}</span>
                          </div>
                          <span className="ml-2 font-semibold" style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{dateLabel}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            type="text"
            placeholder="新成員名稱"
            value={newMemberName}
            onChange={e => setNewMemberName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addMember()}
          />
          <button className="btn btn-primary" onClick={addMember}>新增</button>
        </div>
      </div>

      {/* Deposit / Deduct */}
      <div className="card mb-4">
        <p className="text-sm font-semibold mb-3 flex items-center gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/snoopy/transfer.png" alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
          儲值金調整
        </p>
        <div className="flex flex-col gap-3">
          <div>
            <label className="input-label">動作</label>
            <div className="flex gap-2">
              <button
                className="btn flex-1"
                onClick={() => setDepositMode('add')}
                style={{
                  fontSize: 14, padding: '8px 4px',
                  background: depositMode === 'add' ? 'var(--color-success)' : 'var(--color-bg-input)',
                  color: depositMode === 'add' ? 'white' : 'var(--color-text)',
                  border: depositMode === 'add' ? 'none' : '1px solid var(--color-border)',
                }}
              >＋ 儲值</button>
              <button
                className="btn flex-1"
                onClick={() => setDepositMode('deduct')}
                style={{
                  fontSize: 14, padding: '8px 4px',
                  background: depositMode === 'deduct' ? 'var(--color-danger)' : 'var(--color-bg-input)',
                  color: depositMode === 'deduct' ? 'white' : 'var(--color-text)',
                  border: depositMode === 'deduct' ? 'none' : '1px solid var(--color-border)',
                }}
              >－ 扣回</button>
            </div>
            {depositMode === 'deduct' && (
              <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                💡 多儲值要扣回、或修正錯誤時使用。會寫入一筆扣款交易紀錄。
              </p>
            )}
          </div>
          <div>
            <label className="input-label">選擇成員</label>
            <div className="flex gap-2 flex-wrap">
              {members.map(m => (
                <button
                  key={m.name}
                  className="btn flex-1"
                  onClick={() => setDepositUser(m.name)}
                  style={{
                    fontSize: 14, padding: '8px 4px',
                    background: depositUser === m.name ? 'var(--color-primary)' : 'var(--color-bg-input)',
                    color: depositUser === m.name ? 'white' : 'var(--color-text)',
                    border: depositUser === m.name ? 'none' : '1px solid var(--color-border)',
                  }}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="input-label">金額 (NT$)</label>
            <div className="flex gap-2">
              {[500, 1000, 2000].map(amt => (
                <button
                  key={amt}
                  className="btn flex-1"
                  onClick={() => setDepositAmount(amt)}
                  style={{
                    fontSize: 14, padding: '8px 4px',
                    background: depositAmount === amt ? (depositMode === 'add' ? 'var(--color-success)' : 'var(--color-danger)') : 'var(--color-bg-input)',
                    color: depositAmount === amt ? 'white' : 'var(--color-text)',
                    border: depositAmount === amt ? 'none' : '1px solid var(--color-border)',
                  }}
                >
                  ${amt}
                </button>
              ))}
            </div>
            <input
              className="input mt-2"
              type="number"
              inputMode="numeric"
              placeholder="自訂金額"
              value={depositAmount}
              onChange={e => setDepositAmount(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
          <div>
            <label className="input-label">日期</label>
            <input
              className="input"
              type="date"
              value={depositDate}
              onChange={e => setDepositDate(e.target.value)}
            />
          </div>
          <button
            className="btn btn-block"
            onClick={handleDeposit}
            disabled={!depositUser || !depositAmount}
            style={{
              background: depositMode === 'add' ? 'var(--color-primary)' : 'var(--color-danger)',
              color: 'white',
              border: 'none',
            }}
          >
            {depositMode === 'add' ? '確認儲值' : '確認扣回'}
          </button>
        </div>
      </div>

      {/* Gemini API Key */}
      <div className="card mb-4">
        <p className="text-sm font-semibold mb-2">Gemini API Key</p>
        <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
          拍照辨識菜單需要 Gemini API Key。
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', marginLeft: 4 }}>
            前往取得 &rarr;
          </a>
        </p>
        <input
          className="input"
          type="password"
          placeholder="貼上你的 Gemini API Key"
          value={geminiApiKey}
          onChange={e => {
            setGeminiApiKey(e.target.value);
            const settings = getSettings();
            settings.geminiApiKey = e.target.value;
            saveSettings(settings);
          }}
        />
        {geminiApiKey && (
          <p className="text-xs mt-2" style={{ color: 'var(--color-success)' }}>
            已設定 (Key 儲存在你的瀏覽器中)
          </p>
        )}
      </div>

      {/* Skin / Theme */}
      <div className="card mb-4">
        <p className="text-sm font-semibold mb-3">🎨 主題設定</p>

        <div className="mb-4">
          <label className="input-label">顯示模式</label>
          <div className="flex gap-2">
            {([
              { key: 'light', label: '☀️ 淺色', color: '#FFF8F2' },
              { key: 'dark',  label: '🌙 深色', color: '#1E1E22' },
            ] as const).map(opt => {
              const active = skin.colorScheme === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => updateSkin({ colorScheme: opt.key })}
                  className="btn flex-1"
                  style={{
                    fontSize: 14, padding: '10px 4px',
                    background: active ? 'var(--color-primary)' : 'var(--color-bg-input)',
                    color: active ? 'white' : 'var(--color-text)',
                    border: active ? 'none' : '1px solid var(--color-border)',
                  }}
                >{opt.label}</button>
              );
            })}
          </div>
        </div>

        <div className="mb-4">
          <label className="input-label">主色調</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {COLOR_PRESETS.map(preset => {
              const active = skin.primaryColor.toLowerCase() === preset.value.toLowerCase();
              return (
                <button
                  key={preset.value}
                  onClick={() => updateSkin({ primaryColor: preset.value })}
                  title={preset.name}
                  style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: preset.value,
                    border: active ? '3px solid #1A1A1A' : '2px solid #FFF',
                    boxShadow: active ? '0 0 0 2px ' + preset.value : '0 0 0 1px var(--color-border)',
                    cursor: 'pointer', padding: 0,
                  }}
                />
              );
            })}
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
            影響按鈕、徽章、連結等所有主色元素
          </p>
        </div>

        <div>
          <label className="input-label">桌布</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {/* "None" option */}
            <button
              onClick={() => updateSkin({ wallpaper: null })}
              style={{
                height: 72, borderRadius: 8,
                background: 'var(--color-bg-input)',
                border: skin.wallpaper === null ? '3px solid var(--color-primary)' : '1px solid var(--color-border)',
                fontSize: 12, color: 'var(--color-text-secondary)',
                cursor: 'pointer',
              }}
            >無</button>
            {WALLPAPER_PRESETS.map(wp => {
              const active = skin.wallpaper === wp;
              return (
                <button
                  key={wp}
                  onClick={() => updateSkin({ wallpaper: wp })}
                  aria-label={`桌布 ${wp}`}
                  style={{
                    height: 72, borderRadius: 8,
                    backgroundImage: `url("${wp}")`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    border: active ? '3px solid var(--color-primary)' : '1px solid var(--color-border)',
                    cursor: 'pointer', padding: 0,
                  }}
                />
              );
            })}
          </div>
          {skin.wallpaper && (
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
              💡 桌布顯示在內容卡片後方。若覺得太花可換「無」回乾淨底色。
            </p>
          )}
        </div>
      </div>

      {/* Data Management */}
      <div className="card mb-4">
        <p className="text-sm font-semibold mb-3">資料管理</p>
        <div className="flex flex-col gap-2">
          <button
            className="btn btn-block"
            style={{ background: 'var(--color-tint-primary)', color: 'var(--color-warning)', border: '1px solid var(--color-warning)', fontSize: 13 }}
            onClick={() => {
              if (!confirm('確定要清空所有點餐紀錄嗎？\n（成員和儲值金不受影響）')) return;
              localStorage.removeItem('lunch-orders');
              showToast('已清空所有點餐紀錄');
            }}
          >
            清空點餐紀錄
          </button>
          <button
            className="btn btn-block"
            style={{ background: 'var(--color-tint-primary)', color: 'var(--color-warning)', border: '1px solid var(--color-warning)', fontSize: 13 }}
            onClick={() => {
              if (!confirm('確定要清空菜單庫嗎？')) return;
              localStorage.removeItem('lunch-menus');
              showToast('已清空菜單庫');
            }}
          >
            清空菜單庫
          </button>
          <button
            className="btn btn-block"
            style={{ background: 'var(--color-tint-primary)', color: 'var(--color-warning)', border: '1px solid var(--color-warning)', fontSize: 13 }}
            onClick={() => {
              if (!confirm('確定要清空儲值交易紀錄嗎？\n（餘額不受影響）')) return;
              localStorage.removeItem('lunch-transactions');
              showToast('已清空交易紀錄');
            }}
          >
            清空交易紀錄
          </button>
          <button
            className="btn btn-block"
            style={{ background: 'var(--color-tint-danger)', color: 'var(--color-danger)', border: '1px solid var(--color-danger)', fontSize: 13, marginTop: 8 }}
            onClick={() => {
              if (!confirm('⚠️ 確定要清空所有資料嗎？\n\n包含：\n- 所有點餐紀錄\n- 菜單庫\n- 成員與儲值金\n- 交易紀錄\n\n此操作無法復原！')) return;
              if (!confirm('再次確認：真的要全部清除嗎？')) return;
              localStorage.removeItem('lunch-orders');
              localStorage.removeItem('lunch-members');
              localStorage.removeItem('lunch-menus');
              localStorage.removeItem('lunch-transactions');
              setMembers([]);
              showToast('已清空所有資料');
            }}
          >
            ⚠️ 清空全部資料
          </button>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
      <BottomNav />
    </div>
  );
}
