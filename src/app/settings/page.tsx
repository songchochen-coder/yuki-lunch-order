'use client';

import { useState, useEffect, useCallback } from 'react';
import BottomNav from '@/components/BottomNav';
import { Member, BalanceTransaction, todayStr } from '@/lib/types';
import { getSettings, saveSettings } from '@/lib/settings';
import { getMembers as dbGetMembers, saveMember as dbSaveMember, deleteMember as dbDeleteMember, deposit as dbDeposit, adjustBalance as dbAdjustBalance, getTransactions as dbGetTransactions, getUnpaidOrders, settleUnpaidWithBalance, getOrders, getRetentionCutoff, getExpiredSummary, deleteExpiredData, exportAllData, validateBackup, importBackup, type BackupSnapshot } from '@/lib/client-db';
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
  const [depositDate, setDepositDate] = useState(todayStr());
  const [depositMode, setDepositMode] = useState<'add' | 'deduct'>('add');
  const [depositNote, setDepositNote] = useState('');
  const [skin, setSkinState] = useState<AppSkin>({ primaryColor: '#F4A261', wallpaper: null, colorScheme: 'light', textSize: 'normal' });
  const [retentionMonths, setRetentionMonths] = useState<number>(4);
  const [maintSummary, setMaintSummary] = useState<{ totalOrders: number; expiredOrders: number; protectedUnpaid: number; expiredTx: number; earliest: string | null }>({
    totalOrders: 0, expiredOrders: 0, protectedUnpaid: 0, expiredTx: 0, earliest: null,
  });

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }, []);

  const refreshMaintSummary = useCallback((months: number) => {
    if (!months || months <= 0) {
      setMaintSummary({ totalOrders: getOrders().length, expiredOrders: 0, protectedUnpaid: 0, expiredTx: 0, earliest: null });
      return;
    }
    const cutoff = getRetentionCutoff(months);
    const s = getExpiredSummary(cutoff);
    setMaintSummary({
      totalOrders: getOrders().length,
      expiredOrders: s.deletableOrders.length,
      protectedUnpaid: s.protectedUnpaid.length,
      expiredTx: s.deletableTransactions,
      earliest: s.earliestDate,
    });
  }, []);

  useEffect(() => {
    const data = dbGetMembers();
    setMembers(data);
    const settings = getSettings();
    settings.users = data.map((m: Member) => m.name);
    saveSettings(settings);
    setGeminiApiKey(settings.geminiApiKey || '');
    setSkinState(getSkin());
    const months = settings.retentionMonths ?? 4;
    setRetentionMonths(months);
    refreshMaintSummary(months);
    setLoading(false);
  }, [refreshMaintSummary]);

  function handleRetentionChange(months: number) {
    setRetentionMonths(months);
    const settings = getSettings();
    settings.retentionMonths = months;
    saveSettings(settings);
    refreshMaintSummary(months);
  }

  function handleExportData() {
    const data = exportAllData();
    triggerDownload(JSON.stringify(data, null, 2), `lunch-order-backup-${todayStr()}.json`);
    showToast('已匯出備份');
  }

  // Tiny helper used by both export and the safety snapshot taken before
  // import. Centralises the URL.createObjectURL / click / revoke dance.
  function triggerDownload(json: string, filename: string) {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset the input so picking the same filename twice still triggers change
    e.target.value = '';

    const reader = new FileReader();
    reader.onerror = () => showToast('讀取檔案失敗');
    reader.onload = (event) => {
      const text = event.target?.result as string | undefined;
      if (!text) { showToast('檔案內容為空'); return; }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        showToast('檔案不是有效的 JSON');
        return;
      }

      const v = validateBackup(parsed);
      if (!v.ok) {
        alert('備份檔格式錯誤：\n\n' + v.errors.join('\n'));
        return;
      }

      const exportedAtLabel = v.exportedAt
        ? new Date(v.exportedAt).toLocaleString('zh-TW', { hour12: false })
        : '未知';
      const msg = [
        '即將從備份還原資料：',
        '',
        `備份時間：${exportedAtLabel}`,
        `備份內容：`,
        `  · 訂單：${v.counts.orders} 筆`,
        `  · 成員：${v.counts.members} 位`,
        `  · 交易紀錄：${v.counts.transactions} 筆`,
        `  · 菜單：${v.counts.menus} 個`,
        '',
        '⚠️ 目前裝置上的所有資料會被「完全取代」（無法復原）。',
        '',
        '為了安全，系統會先自動下載目前資料的快照備份。',
        '繼續嗎？',
      ].join('\n');
      if (!confirm(msg)) return;

      // Safety net: snapshot current state before the destructive import.
      try {
        const safety = exportAllData();
        triggerDownload(
          JSON.stringify(safety, null, 2),
          `lunch-order-pre-import-${todayStr()}.json`,
        );
      } catch {
        if (!confirm('安全快照下載失敗。仍要強制還原嗎？')) return;
      }

      try {
        const result = importBackup(parsed as BackupSnapshot);
        // Reload everything so the page reflects the new state
        setMembers(dbGetMembers());
        const settings = getSettings();
        const months = settings.retentionMonths ?? 4;
        setRetentionMonths(months);
        refreshMaintSummary(months);
        showToast(
          `已還原：${result.imported.orders} 訂單 / ${result.imported.members} 成員 / ${result.imported.transactions} 交易 / ${result.imported.menus} 菜單`,
        );
      } catch (err) {
        alert('還原失敗：' + (err instanceof Error ? err.message : String(err)));
      }
    };
    reader.readAsText(file);
  }

  function handleCleanupExpired() {
    if (retentionMonths <= 0) { showToast('保留期限為永久，無可清理'); return; }
    const cutoff = getRetentionCutoff(retentionMonths);
    const s = getExpiredSummary(cutoff);
    if (s.deletableOrders.length === 0 && s.deletableTransactions === 0) {
      showToast('目前沒有過期資料');
      return;
    }
    const msg = [
      `即將刪除早於 ${cutoff} 的資料：`,
      ``,
      `· 訂單：${s.deletableOrders.length} 筆`,
      `· 交易紀錄：${s.deletableTransactions} 筆`,
      s.protectedUnpaid.length > 0 ? `\n⚠️ ${s.protectedUnpaid.length} 筆未付款訂單會保留（不會刪）` : '',
      ``,
      `建議先按「💾 匯出備份」保存一份 JSON。`,
      `確定要清理嗎？此操作無法復原。`,
    ].filter(Boolean).join('\n');
    if (!confirm(msg)) return;
    const { deletedOrders, deletedTransactions } = deleteExpiredData(cutoff);
    refreshMaintSummary(retentionMonths);
    showToast(`已清理 ${deletedOrders} 筆訂單 / ${deletedTransactions} 筆交易`);
  }

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
      const note = depositNote.trim() || undefined;
      dbAdjustBalance(depositUser, signed, note, depositDate);
      setMembers(prev => prev.map(m =>
        m.name === depositUser ? { ...m, balance: m.balance + signed } : m
      ));
      const dateLabel = depositDate ? ` (${depositDate.slice(5).replace('-', '/')})` : '';
      showToast(depositMode === 'add'
        ? `已為 ${depositUser} 儲值 $${amt}${dateLabel}`
        : `已從 ${depositUser} 扣回 $${amt}${dateLabel}`);
      setDepositAmount('');
      setDepositNote('');

      // After a successful ADD, offer to back-settle any unpaid orders with
      // the freshly-topped-up balance. Skip for DEDUCT since we just removed
      // money and there's nothing new to settle.
      if (depositMode === 'add') {
        const unpaid = getUnpaidOrders(depositUser);
        if (unpaid.length > 0) {
          const unpaidTotal = unpaid.reduce((s, o) => s + o.totalAmount, 0);
          const current = dbGetMembers().find(m => m.name === depositUser);
          const balanceAfter = current?.balance ?? 0;
          const canAll = balanceAfter >= unpaidTotal;
          const msg = canAll
            ? `${depositUser} 有 ${unpaid.length} 筆未付款共 $${unpaidTotal.toLocaleString()}。\n儲值後餘額 $${balanceAfter.toLocaleString()} 夠全部抵扣。\n\n要從儲值金扣掉嗎？`
            : `${depositUser} 有 ${unpaid.length} 筆未付款共 $${unpaidTotal.toLocaleString()}。\n儲值後餘額 $${balanceAfter.toLocaleString()}，只夠抵扣最舊的幾筆。\n\n要先抵扣可負擔的部分嗎？剩下未扣的保持未付款。`;
          // Defer to let the toast render first
          setTimeout(() => {
            if (confirm(msg)) {
              const { settled, amount, remaining } = settleUnpaidWithBalance(depositUser);
              if (settled > 0) {
                // Refresh balances to reflect deductions
                setMembers(dbGetMembers());
                showToast(remaining > 0
                  ? `已抵扣 ${settled} 筆 $${amount.toLocaleString()}，還有 ${remaining} 筆未付款`
                  : `已抵扣 ${settled} 筆 $${amount.toLocaleString()}，全部清完 ✓`);
              }
            }
          }, 100);
        }
      }
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
      <h1 className="text-xl font-bold mb-4 flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/snoopy/settings.png" alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} />
        <span>設定</span>
      </h1>

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
          <div>
            <label className="input-label">備註（選填）</label>
            <input
              className="input"
              type="text"
              placeholder={depositMode === 'add' ? '例：紅包錢、月薪、退費...' : '例：扣多了、結清...'}
              value={depositNote}
              onChange={e => setDepositNote(e.target.value)}
              maxLength={40}
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
              { key: 'light', label: '☀️ 淺色' },
              { key: 'dark',  label: '🌙 深色' },
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
          <label className="input-label">字體大小</label>
          <div className="flex gap-2">
            {([
              { key: 'normal', label: 'A 標準',  hint: '一般尺寸' },
              { key: 'large',  label: 'A 大字體', hint: '老花眼友善 (+20%)' },
            ] as const).map(opt => {
              const active = skin.textSize === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => updateSkin({ textSize: opt.key })}
                  className="btn flex-1"
                  style={{
                    fontSize: opt.key === 'large' ? 17 : 14,
                    padding: '10px 4px',
                    background: active ? 'var(--color-primary)' : 'var(--color-bg-input)',
                    color: active ? 'white' : 'var(--color-text)',
                    border: active ? 'none' : '1px solid var(--color-border)',
                  }}
                  title={opt.hint}
                >{opt.label}</button>
              );
            })}
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
            💡 放大會影響全站的按鈕、輸入框、卡片文字
          </p>
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

      {/* Data Retention */}
      <div className="card mb-4">
        <p className="text-sm font-semibold mb-3">📦 資料維護</p>

        <div className="mb-3">
          <label className="input-label">保留期限</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { m: 3,  label: '3 個月' },
              { m: 4,  label: '4 個月' },
              { m: 6,  label: '6 個月' },
              { m: 12, label: '12 個月' },
              { m: 0,  label: '永久保留' },
            ].map(opt => {
              const active = retentionMonths === opt.m;
              return (
                <button
                  key={opt.m}
                  onClick={() => handleRetentionChange(opt.m)}
                  className="btn"
                  style={{
                    fontSize: 13, padding: '6px 12px',
                    background: active ? 'var(--color-primary)' : 'var(--color-bg-input)',
                    color: active ? 'white' : 'var(--color-text)',
                    border: active ? 'none' : '1px solid var(--color-border)',
                  }}
                >{opt.label}</button>
              );
            })}
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
            訂單與交易紀錄超過此期限會列為可清理。菜單庫、成員、餘額永久保留。
          </p>
        </div>

        {/* Maintenance stats */}
        <div className="mb-3 p-3" style={{ background: 'var(--color-bg-input)', borderRadius: 8 }}>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>目前訂單總數</span>
            <span className="text-sm font-semibold">{maintSummary.totalOrders} 筆</span>
          </div>
          {retentionMonths > 0 && (
            <>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>過期可清理</span>
                <span className="text-sm font-semibold" style={{ color: maintSummary.expiredOrders > 0 ? 'var(--color-warning)' : 'var(--color-text)' }}>
                  {maintSummary.expiredOrders} 筆訂單 / {maintSummary.expiredTx} 筆交易
                </span>
              </div>
              {maintSummary.protectedUnpaid > 0 && (
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>⏳ 未付款（保留）</span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-warning)' }}>
                    {maintSummary.protectedUnpaid} 筆
                  </span>
                </div>
              )}
              {maintSummary.earliest && (
                <div className="flex justify-between items-center">
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>最早過期日</span>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{maintSummary.earliest}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            className="btn btn-block"
            onClick={handleExportData}
            style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontSize: 14 }}
          >
            💾 匯出全部備份 (JSON)
          </button>

          {/* Native file picker styled as a button via <label>. The hidden
              input fills the label so the whole area is tappable. Reset
              afterwards so picking the same file again still triggers onChange. */}
          <label
            className="btn btn-block"
            style={{
              background: 'var(--color-bg-input)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
              fontSize: 14,
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            📥 從備份還原 (JSON)
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleImportBackup}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
            />
          </label>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            💡 還原會先自動下載目前資料的快照，才覆蓋。建議搭配「匯出備份」當定期備份習慣。
          </p>

          {retentionMonths > 0 && (maintSummary.expiredOrders > 0 || maintSummary.expiredTx > 0) && (
            <button
              className="btn btn-block"
              onClick={handleCleanupExpired}
              style={{ background: 'var(--color-tint-warning)', color: 'var(--color-warning)', border: '1px solid var(--color-warning)', fontSize: 14, marginTop: 4 }}
            >
              🧹 清理 {maintSummary.expiredOrders} 筆過期訂單 / {maintSummary.expiredTx} 筆交易
            </button>
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
