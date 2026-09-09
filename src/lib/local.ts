/**
 * LocalStorage-backed personal state (no login in the MVP).
 * Every accessor is safe to call during SSR (returns defaults).
 */

export const KEYS = {
  known: "tf:known", // string[] of node ids the user marked as known
  recent: "tf:recent", // {id, at}[]
  streak: "tf:streak", // { days: string[] } ISO dates visited
  theme: "tf:theme",
  level: "tf:level", // preferred depth tab (TL;DR / Practical / Deep Dive)
} as const;

/** Fired on window whenever this module writes to localStorage (same-tab sync). */
export const STORAGE_EVENT = "tf:storage";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: { key } }));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function getKnown(): string[] {
  return read<string[]>(KEYS.known, []);
}
export function setKnown(id: string, known: boolean) {
  const set = new Set(getKnown());
  if (known) set.add(id);
  else set.delete(id);
  write(KEYS.known, [...set]);
}

export interface RecentItem {
  id: string;
  at: number;
}
export function getRecent(): RecentItem[] {
  return read<RecentItem[]>(KEYS.recent, []);
}
export function pushRecent(id: string) {
  const list = getRecent().filter((r) => r.id !== id);
  list.unshift({ id, at: Date.now() });
  write(KEYS.recent, list.slice(0, 12));
}

export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export interface StreakInfo {
  days: string[];
  current: number;
}
export function getStreak(): StreakInfo {
  const { days } = read<{ days: string[] }>(KEYS.streak, { days: [] });
  return { days, current: computeStreak(days) };
}
export function recordVisit(): StreakInfo {
  const today = todayKey();
  const { days } = read<{ days: string[] }>(KEYS.streak, { days: [] });
  if (!days.includes(today)) {
    days.push(today);
    days.sort();
    write(KEYS.streak, { days: days.slice(-60) });
  }
  return getStreak();
}
function computeStreak(days: string[]): number {
  if (days.length === 0) return 0;
  const set = new Set(days);
  let count = 0;
  const cursor = new Date();
  // allow the streak to count if yesterday was the last visit
  if (!set.has(todayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (set.has(todayKey(cursor))) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

export type Theme = "light" | "dark";
export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(KEYS.theme);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}
export function setTheme(theme: Theme | null) {
  if (typeof window === "undefined") return;
  try {
    if (theme) window.localStorage.setItem(KEYS.theme, theme);
    else window.localStorage.removeItem(KEYS.theme);
  } catch {
    /* ignore */
  }
  const resolved =
    theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = resolved;
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: { key: KEYS.theme } }));
}

export function setLevel(key: string) {
  write(KEYS.level, key);
}
/** Streak computed from a raw stored value (for hooks). */
export function streakFromRaw(raw: string | null | undefined): StreakInfo {
  if (!raw) return { days: [], current: 0 };
  try {
    const { days } = JSON.parse(raw) as { days: string[] };
    return { days, current: computeStreak(days) };
  } catch {
    return { days: [], current: 0 };
  }
}

/** Inline script that sets data-theme before first paint (default: OS, dark-leaning). */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEYS.theme}");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}})();`;
