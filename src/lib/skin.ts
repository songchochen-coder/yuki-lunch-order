// User-facing "skin" — persistent UI personalization (primary color + wallpaper).
// Stored in localStorage so it survives reloads and works offline.

const STORAGE_KEY = 'lunch-skin';

export type ColorScheme = 'light' | 'dark';

export interface AppSkin {
  primaryColor: string;   // hex, e.g. "#FF8C42"
  wallpaper: string | null; // relative path like "/wallpapers/wp-01.jpg", or null for none
  colorScheme: ColorScheme;
}

export const DEFAULT_SKIN: AppSkin = {
  primaryColor: '#F4A261',
  wallpaper: null,
  colorScheme: 'light',
};

// Color presets shown in the settings picker. Softer / Morandi-inspired
// palette — easier on the eyes and blends with pastel wallpapers.
export const COLOR_PRESETS: { name: string; value: string; dark: string }[] = [
  { name: '暖橘',     value: '#F4A261', dark: '#D98544' },
  { name: '霧藍',     value: '#7CA4CF', dark: '#5F86B0' },
  { name: '抹茶',     value: '#94B49F', dark: '#769681' },
  { name: '蜜桃',     value: '#E8A5A5', dark: '#C88585' },
  { name: '藕紫',     value: '#B79EC7', dark: '#9680AE' },
  { name: '薄荷',     value: '#8FBCBB', dark: '#6FA09F' },
  { name: '乾燥玫瑰', value: '#C9847E', dark: '#AA6964' },
  { name: '石墨',     value: '#6B7280', dark: '#4B5563' },
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

// Apply a skin to the DOM immediately. Sets CSS variables for color, toggles
// dark mode via the `.dark` class on <html>, and optionally installs the
// wallpaper (on <html>, so it fills the viewport even on desktop where body
// is a 480 px centered column).
export function applySkin(skin: AppSkin): void {
  if (typeof document === 'undefined') return;

  const preset = COLOR_PRESETS.find(p => p.value.toLowerCase() === skin.primaryColor.toLowerCase());
  const dark = preset?.dark ?? skin.primaryColor;

  const root = document.documentElement;
  root.style.setProperty('--color-primary', skin.primaryColor);
  root.style.setProperty('--color-primary-dark', dark);

  // Dark mode toggle
  if (skin.colorScheme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // Browser chrome color (Safari/Chrome mobile top bar).
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute('content', skin.primaryColor);

  // Wallpaper on <html> so it fills viewport.
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
