import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "午餐點餐紀錄",
  description: "團隊每週午餐點餐紀錄系統",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "午餐點餐",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#F4A261",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        {/* Skin: apply saved primary color + wallpaper BEFORE React hydrates
            so users never see a flash of the default theme. Runs inline, once. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var s = JSON.parse(localStorage.getItem('lunch-skin') || '{}');
                  var presets = {
                    '#F4A261': '#D98544', '#7CA4CF': '#5F86B0', '#94B49F': '#769681',
                    '#E8A5A5': '#C88585', '#B79EC7': '#9680AE', '#8FBCBB': '#6FA09F',
                    '#C9847E': '#AA6964', '#6B7280': '#4B5563',
                    // Legacy mappings for users who had the old saturated palette
                    '#FF8C42': '#E07030', '#5B8FF9': '#4A76D6', '#52C41A': '#3FA00D',
                    '#EB5C9F': '#D44583', '#845EC2': '#6B47A0', '#14B8A6': '#0E948A',
                    '#E53935': '#C1272D', '#4B5563': '#374151'
                  };
                  var r = document.documentElement;
                  if (s.primaryColor) {
                    r.style.setProperty('--color-primary', s.primaryColor);
                    var dark = presets[s.primaryColor.toUpperCase()] || s.primaryColor;
                    r.style.setProperty('--color-primary-dark', dark);
                    var meta = document.querySelector('meta[name="theme-color"]');
                    if (meta) meta.setAttribute('content', s.primaryColor);
                  }
                  if (s.colorScheme === 'dark') r.classList.add('dark');
                  if (s.wallpaper) {
                    r.style.backgroundImage = 'url("' + s.wallpaper + '")';
                    r.style.backgroundSize = 'cover';
                    r.style.backgroundPosition = 'center center';
                    r.style.backgroundAttachment = 'fixed';
                    r.style.backgroundRepeat = 'no-repeat';
                    document.body.style.backgroundColor = 'transparent';
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
