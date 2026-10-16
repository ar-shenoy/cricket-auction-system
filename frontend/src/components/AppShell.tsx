import React, { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';

const nav = [
  { to: '/', label: 'Dashboard' },
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
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-white transition-colors">
      <header className="border-b border-gray-200 dark:border-slate-800 sticky top-0 z-40 bg-white/90 dark:bg-slate-950/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="flex items-center gap-2 font-bold text-lg shrink-0">
              <span className="text-2xl">🏏</span>
              <span className="hidden sm:inline">AuctionScore</span>
            </Link>
            {title && (
              <div className="hidden md:block border-l border-gray-200 dark:border-slate-700 pl-3 min-w-0">
                <div className="font-semibold truncate">{title}</div>
                {subtitle && <div className="text-xs text-gray-500 dark:text-slate-400 truncate">{subtitle}</div>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Link to="/live" className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 px-2">Live</Link>
            <a href="/scoreboard" target="_blank" rel="noreferrer" className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 px-2">Board</a>
            <Link to="/points" className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 px-2">Points</Link>
            <ThemeToggle />
            {user && (
              <button type="button" onClick={logout} className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white px-2">Logout</button>
            )}
          </div>
        </div>
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 pb-3 flex gap-1 overflow-x-auto">
          {nav.map(item => {
            const active = loc.pathname === item.to;
            return (
              <Link key={item.to} to={item.to} className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${
                active ? 'bg-indigo-600 text-white font-medium' : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800'
              }`}>{item.label}</Link>
            );
          })}
        </nav>
      </header>
      {actions && <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 flex justify-end gap-2">{actions}</div>}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}
