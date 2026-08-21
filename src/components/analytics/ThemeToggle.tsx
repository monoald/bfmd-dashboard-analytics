"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { CHIP_CLASS } from "./theme";

const STORAGE_KEY = "analytics-theme";

let listeners: (() => void)[] = [];

function subscribe(callback: () => void): () => void {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((listener) => listener !== callback);
  };
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains("dark");
}

function getServerSnapshot(): boolean {
  return false;
}

function setDarkMode(isDark: boolean): void {
  document.documentElement.classList.toggle("dark", isDark);
  localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light");
  for (const listener of listeners) listener();
}

export function ThemeToggle() {
  const isDark = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return (
    <button
      type="button"
      onClick={() => setDarkMode(!isDark)}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`${CHIP_CLASS} cursor-pointer`}
    >
      {isDark ? (
        <Sun className="h-3.5 w-3.5" />
      ) : (
        <Moon className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
