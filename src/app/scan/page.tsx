'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { getSettings } from '@/lib/settings';
import { Member } from '@/lib/types';
import { getMembers } from '@/lib/client-db';

async function compressImage(file: File): Promise<string> {
  const maxWidth = 800;
  const quality = 0.6;
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  let w = bitmap.width;
  let h = bitmap.height;
  if (w > maxWidth) {
    h = Math.round((h * maxWidth) / w);
    w = maxWidth;
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/jpeg', quality);
  });
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default function ScanPage() {
  const router = useRouter();
  const [users, setUsers] = useState<string[]>([]);
  const [payer, setPayer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    const settings = getSettings();
    const m = getMembers();
    const names = m.length > 0 ? m.map(x => x.name) : settings.users;
    setUsers(names);
    setPayer(names[0] || '');
  }, []);

  async function handleImage(file: File) {
    setError('');
    setLoading(true);
    setPreview(null);
    try {
      setPreview(URL.createObjectURL(file));
      const base64 = await compressImage(file);
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType: 'image/jpeg' }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `API error ${res.status}`);
      }
      const result = await res.json();
      sessionStorage.setItem('analyzeResult', JSON.stringify(result));
      sessionStorage.setItem('selectedPayer', payer);
      router.push('/scan/confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleImage(files[0]);
    }
  }

  return (
    <div className="page-container">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="btn btn-ghost">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1 className="text-xl font-bold">📷 拍照辨識菜單</h1>
      </div>

      <div className="card mb-4">
        <label className="input-label">誰要點餐？</label>
        <div className="flex gap-2 flex-wrap">
          {users.map(u => (
            <button key={u} onClick={() => setPayer(u)} className={`btn flex-1 ${payer === u ? 'btn-primary' : 'btn-outline'}`}>
              {u}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="card flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-[var(--color-primary)] border-t-transparent animate-spin" />
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>AI 辨識菜單中...</p>
          {preview && <img src={preview} alt="Preview" className="mt-4 max-h-40 rounded-lg object-contain opacity-60" />}
        </div>
      ) : (
        <div className="card flex flex-col items-center justify-center py-12 gap-6">
          <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
          <p className="text-sm text-center" style={{ color: 'var(--color-text-secondary)' }}>拍攝菜單照片或從相簿選取</p>
          <div className="w-full max-w-xs">
            <label style={{ position: 'relative', overflow: 'hidden', display: 'flex' }} className="btn btn-primary btn-lg btn-block cursor-pointer">
              📷 選擇照片
              <input type="file" accept="image/*" onChange={handleFileChange} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
            </label>
          </div>
        </div>
      )}

      {error && (
        <div className="card mt-4 border-l-4 border-[var(--color-danger)]" style={{ background: '#FFF5F5' }}>
          <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>
          <button onClick={() => setError('')} className="btn btn-ghost text-xs mt-2">關閉</button>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
