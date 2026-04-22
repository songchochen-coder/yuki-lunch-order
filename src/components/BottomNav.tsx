'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', img: '/snoopy/home.png', label: '首頁' },
  { href: '/history', img: '/snoopy/history.png', label: '紀錄' },
  { href: '/scan', img: '/snoopy/scan-hero.png', label: '掃描' },
  { href: '/stats', img: '/snoopy/stats.png', label: '統計' },
  { href: '/settings', img: '/snoopy/settings.png', label: '設定' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav">
      {NAV_ITEMS.map((item) => {
        const isActive = item.href === '/'
          ? pathname === '/'
          : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.img} alt={item.label} style={{ width: 32, height: 32, objectFit: 'contain' }} />
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
