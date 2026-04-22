// User-facing "skin" — persistent UI personalization (primary color + wallpaper).
// Stored in localStorage so it survives reloads and works offline.

const STORAGE_KEY = 'lunch-skin';

export interface AppSkin {
  primaryColor: string;   // hex, e.g. "#FF8C42"
  wallpaper: string | null; // relative path like "/wallpapers/wp-01.jpg", or null for none
}

export const DEFAULT_SKIN: AppSkin = {
  primaryColor: '#FF8C42',
  wallpaper: null,
};

// Color presets shown in the settings picker. Names are display-only.
export const COLOR_PRESETS: { name: string; value: string; dark: string }[] = [
  { name: '橘色',   value: '#FF8C42', dark: '#E07030' },
  { name: '藍色',   value: '#5B8FF9', dark: '#4A76D6' },
  { name: '綠色',   value: '#52C41A', dark: '#3FA00D' },
  { name: '粉紅',   value: '#EB5C9F', dark: '#D44583' },
  { name: '紫色',   value: '#845EC2', dark: '#6B47A0' },
  { name: '青綠',   value: '#14B8A6', dark: '#0E948A' },
  { name: '深紅',   value: '#E53935', dark: '#C1272D' },
  { name: '深灰',   value: '#4B5563', dark: '#374151' },
];

// Wallpaper presets. Thumbnails are the same file (they're already ≤128KB after
// optimization; browser scales them for picker previews).
export const WALLPAPER_PRESETS: string[] = [
  '/wallpapers/wp-01.jpg',
  '/wallpapers/wp-02.jpg',
  '/wallpapers/wp-03.jpg',
  '/wallpapers/wp-04.jpg',
  '/wallpapers/wp-05.jpg',
  '/wallpapers/wp-06.jpg',
  '/wallpapers/wp-07.jpg',
  '/wallpapers/wp-08.jpg',
];

export function getSkin(): AppSkin {
  if (typeof window === 'undefined') return DEFAULT_SKIN;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SKIN;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SKIN, ...parsed };
  } catch {
    return DEFAULT_SKIN;
  }
}

export function saveSkin(skin: AppSkin): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(skin));
}

// Apply a skin to the DOM immediately. Sets CSS variables for color and toggles
// the wallpaper on the <html> element (wallpaper goes behind the 480px-wide
// body so desktop users see it fill the viewport margins too).
export function applySkin(skin: AppSkin): void {
  if (typeof document === 'undefined') return;

  // Primary color + its "dark" (hover) variant. Look up the paired dark shade
  // from the preset list; fall back to the color itself when it's custom.
  const preset = COLOR_PRESETS.find(p => p.value.toLowerCase() === skin.primaryColor.toLowerCase());
  const dark = preset?.dark ?? skin.primaryColor;

  const root = document.documentElement;
  root.style.setProperty('--color-primary', skin.primaryColor);
  root.style.setProperty('--color-primary-dark', dark);

  // Keep the browser chrome color (Safari/Chrome mobile top bar) in sync.
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute('content', skin.primaryColor);

  // Wallpaper on <html>, not body, so it fills viewport on desktop too.
  // Body background must become transparent to let the wallpaper through.
  if (skin.wallpaper) {
    root.style.backgroundImage = `url("${skin.wallpaper}")`;
    root.style.backgroundSize = 'cover';
    root.style.backgroundPosition = 'center center';
    root.style.backgroundAttachment = 'fixed';
    root.style.backgroundRepeat = 'no-repeat';
    document.body.style.backgroundColor = 'transparent';
  } else {
    root.style.backgroundImage = '';
    document.body.style.backgroundColor = '';
  }
}
