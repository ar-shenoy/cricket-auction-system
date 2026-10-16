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
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 sticky top-0 z-40 bg-slate-950/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="flex items-center gap-2 font-bold text-lg shrink-0">
              <span className="text-2xl">🏏</span>
              <span className="hidden sm:inline">AuctionScore</span>
            </Link>
            {title && (
              <div className="hidden md:block border-l border-slate-700 pl-3 min-w-0">
                <div className="font-semibold truncate">{title}</div>
                {subtitle && <div className="text-xs text-slate-400 truncate">{subtitle}</div>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Link to="/live" className="text-xs sm:text-sm text-slate-400 hover:text-indigo-400 px-2">Live</Link>
            <a href="/scoreboard" target="_blank" rel="noreferrer" className="text-xs sm:text-sm text-slate-400 hover:text-rose-400 px-2">Board</a>
            <Link to="/points" className="text-xs sm:text-sm text-slate-400 hover:text-purple-400 px-2">Points</Link>
            <ThemeToggle />
            {user && (
              <button type="button" onClick={logout} className="text-xs sm:text-sm text-slate-400 hover:text-white px-2">Logout</button>
            )}
          </div>
        </div>
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 pb-3 flex gap-1 overflow-x-auto">
          {nav.map(item => {
            const active = loc.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${
                  active ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {(title || actions) && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 flex flex-wrap items-end justify-between gap-3 md:hidden">
          {title && (
            <div>
              <h1 className="text-xl font-bold">{title}</h1>
              {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
            </div>
          )}
          {actions}
        </div>
      )}
      {actions && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 hidden md:flex justify-end gap-2">{actions}</div>
      )}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}

export function PublicShell({
  children,
  title,
  right
}: {
  children: ReactNode;
  title: string;
  right?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-950/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Link to="/welcome" className="text-2xl shrink-0">🏏</Link>
            <div className="min-w-0">
              <div className="text-xs text-slate-500 uppercase tracking-wide">AuctionScore</div>
              <h1 className="font-bold truncate">{title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm shrink-0">{right}</div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
