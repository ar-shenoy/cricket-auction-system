import React from 'react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="text-xs sm:text-sm px-3 py-1.5 rounded-full font-medium transition
        text-[var(--text-secondary)] hover:text-[var(--text-primary)]
        bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15"
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
