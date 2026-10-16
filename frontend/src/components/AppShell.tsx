import React, { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';

const nav = [
  { to: '/', label: 'Home' },
  { to: '/players', label: 'Players' },
  { to: '/teams', label: 'Teams' },
  { to: '/auction', label: 'Auction' },
  { to: '/scoring', label: 'Scoring' },
  { to: '/reports', label: 'Reports' },
  { to: '/billing', label: 'Billing' }
];

export default function AppShell({
  children,
  title,
  subtitle,
  actions
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const { user, logout } = useAuth();
  const loc = useLocation();

  return (
    <div className="min-h-screen page-mesh text-[var(--text-primary)]">
      <header className="glass-nav sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="flex items-center gap-2 font-semibold text-[17px] tracking-tight shrink-0">
              <span className="text-xl">🏏</span>
              <span className="hidden sm:inline">AuctionScore</span>
            </Link>
            {title && (
              <div className="hidden md:block border-l border-black/10 dark:border-white/10 pl-3 min-w-0">
                <div className="font-semibold text-[15px] truncate text-[var(--text-primary)]">{title}</div>
                {subtitle && (
                  <div className="text-xs truncate text-[var(--text-secondary)]">{subtitle}</div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
            <Link to="/live" className="text-xs sm:text-sm px-2 py-1 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10">Live</Link>
            <a href="/scoreboard" target="_blank" rel="noreferrer" className="text-xs sm:text-sm px-2 py-1 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10">Board</a>
            <Link to="/points" className="text-xs sm:text-sm px-2 py-1 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10">Points</Link>
            <ThemeToggle />
            {user && (
              <button type="button" onClick={logout} className="text-xs sm:text-sm px-2 py-1 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10">Logout</button>
            )}
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-4 sm:px-6 pb-3 flex gap-1 overflow-x-auto">
          {nav.map(item => {
            const active = loc.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap transition font-medium ${
                  active
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {actions && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 flex justify-end gap-2">{actions}</div>
      )}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
    </div>
  );
}
