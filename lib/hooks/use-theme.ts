"use client";

import { useSyncExternalStore } from "react";
import { DARK_QUERY, THEME_STORAGE_KEY } from "@/lib/utils/theme-script";

export type Theme = "dark" | "light" | "system";

const listeners = new Set<() => void>();

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "system" ? stored : "dark";
  } catch {
    return "dark";
  }
}

function subscribe(listener: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  listeners.add(listener);
  media.addEventListener("change", listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", listener);
    window.removeEventListener("storage", listener);
  };
}

export function applyTheme(theme: Theme = readTheme()) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia(DARK_QUERY).matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}
  applyTheme(theme);
  for (const listener of listeners) listener();
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "dark" as Theme);
  const systemDark = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DARK_QUERY).matches,
    () => true,
  );
  const resolved: "dark" | "light" = theme === "system" ? (systemDark ? "dark" : "light") : theme;
  return { theme, resolved, setTheme };
}
