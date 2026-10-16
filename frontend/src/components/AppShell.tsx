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
    <div className="page-mesh" style={{ color: 'var(--text)' }}>
      <header className="glass-nav">
        <div className="max-w-6xl mx-auto px-4 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="flex items-center gap-2 font-semibold text-[17px] tracking-tight shrink-0" style={{ color: 'var(--text)' }}>
              <span className="text-[20px] leading-none">🏏</span>
              <span className="hidden sm:inline">AuctionScore</span>
            </Link>
            {title && (
              <div className="hidden md:block pl-3 min-w-0" style={{ borderLeft: '0.5px solid var(--separator)' }}>
                <div className="font-semibold text-[15px] truncate" style={{ color: 'var(--text)' }}>{title}</div>
                {subtitle && (
                  <div className="text-[12px] truncate" style={{ color: 'var(--text-2)' }}>{subtitle}</div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 flex-wrap justify-end">
            <Link to="/live" className="text-[13px] px-2.5 py-1 rounded-full" style={{ color: 'var(--text-2)' }}>Live</Link>
            <a href="/scoreboard" target="_blank" rel="noreferrer" className="text-[13px] px-2.5 py-1 rounded-full" style={{ color: 'var(--text-2)' }}>Board</a>
            <Link to="/points" className="text-[13px] px-2.5 py-1 rounded-full" style={{ color: 'var(--text-2)' }}>Points</Link>
            <ThemeToggle />
            {user && (
              <button type="button" onClick={logout} className="text-[13px] px-2.5 py-1 rounded-full" style={{ color: 'var(--text-2)' }}>Logout</button>
            )}
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-4 sm:px-5 pb-2.5 flex gap-1 overflow-x-auto">
          {nav.map(item => {
            const active = loc.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="px-3.5 py-1.5 rounded-full text-[13px] whitespace-nowrap font-medium transition"
                style={
                  active
                    ? { background: 'var(--accent)', color: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }
                    : { color: 'var(--text-2)' }
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {actions && (
        <div className="max-w-6xl mx-auto px-4 sm:px-5 pt-4 flex justify-end gap-2">{actions}</div>
      )}
      <main className="max-w-6xl mx-auto px-4 sm:px-5 py-6 sm:py-8">{children}</main>
    </div>
  );
}
