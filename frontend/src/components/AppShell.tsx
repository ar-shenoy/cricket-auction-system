import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import ThemeToggle from './ThemeToggle';

const ALL_NAV: { to: string; label: string; feature: string | null; adminOnly?: boolean; developerOnly?: boolean }[] = [
  { to: '/', label: 'Home', feature: null },
  { to: '/players', label: 'Players', feature: 'players' },
  { to: '/teams', label: 'Teams', feature: 'teams' },
  { to: '/auction', label: 'Auction', feature: 'auction' },
  { to: '/scoring', label: 'Scoring', feature: 'scoring' },
  { to: '/reports', label: 'Reports', feature: 'reports' },
  { to: '/billing', label: 'Billing', feature: 'billing' },
  { to: '/features', label: 'Features', feature: null, developerOnly: true }
];

export default function AppShell({
  title,
  subtitle,
  actions,
  children
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.get('/orgs/features').then(r => setFeatures(r.data.features || {})).catch(() => {});
  }, []);

  const nav = ALL_NAV.filter(item => {
    if ((item as any).adminOnly && user?.role !== 'admin') return false;
    if ((item as any).developerOnly && user?.role !== 'developer') return false;
    if (!item.feature) return true;
    if (features[item.feature] === false) return false;
    return true;
  });

  const topLinks = [
    { to: '/live', label: 'Live', feature: 'auction' },
    { to: '/results', label: 'Results', feature: 'auction' },
    { href: '/scoreboard', label: 'Board', feature: 'scoreboard' },
    { to: '/points', label: 'Points', feature: 'points' },
    { href: '/match-live', label: 'Match centre', feature: 'scoreboard' }
  ].filter(item => features[item.feature as string] !== false);

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
            {topLinks.map(item =>
              (item as any).href ? (
                <a
                  key={item.label}
                  href={(item as any).href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[13px] px-2.5 py-1 rounded-full transition"
                  style={{ color: 'var(--text-2)' }}
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.label}
                  to={item.to!}
                  className="text-[13px] px-2.5 py-1 rounded-full transition"
                  style={{ color: 'var(--text-2)' }}
                >
                  {item.label}
                </Link>
              )
            )}
            <ThemeToggle />
            {user && (
              <button
                type="button"
                onClick={logout}
                className="text-[13px] px-2.5 py-1 rounded-full"
                style={{ color: 'var(--text-2)' }}
              >
                Logout
              </button>
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
