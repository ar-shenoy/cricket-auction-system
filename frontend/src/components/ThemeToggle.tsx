import React from 'react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="glass-island"
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      aria-label="Toggle theme"
      style={{ padding: '0.35rem 0.65rem', minWidth: 36 }}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
