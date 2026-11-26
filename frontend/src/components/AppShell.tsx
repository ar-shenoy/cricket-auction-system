import React, { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';
import api from '../services/api';

type NavItem = {
  to: string;
  label: string;
  feature: string | null;
  adminOnly?: boolean;
  developerOnly?: boolean;
};

const ALL_NAV: NavItem[] = [
  { to: '/', label: 'Home', feature: null },
  { to: '/players', label: 'Players', feature: 'players', adminOnly: true },
  { to: '/teams', label: 'Teams', feature: 'teams' },
  { to: '/auction', label: 'Auction', feature: 'auction' },
  { to: '/scoring', label: 'Scoring', feature: 'scoring', adminOnly: true },
  { to: '/hub', label: 'Hub', feature: 'hub', adminOnly: true },
  { to: '/broadcast', label: 'Broadcast', feature: 'broadcast', adminOnly: true },
  { to: '/franchise', label: 'Franchise', feature: 'franchise' },
  { to: '/reports', label: 'Reports', feature: 'reports', adminOnly: true },
  { to: '/intelligence', label: 'Intel', feature: 'intelligence', adminOnly: true },
  { to: '/billing', label: 'Billing', feature: 'billing', adminOnly: true },
  { to: '/notifications', label: 'Alerts', feature: null, adminOnly: true },
  { to: '/features', label: 'Features', feature: null, developerOnly: true },
  { to: '/audit', label: 'Audit', feature: null, developerOnly: true },
  { to: '/health', label: 'Health', feature: null, developerOnly: true },
  { to: '/promos', label: 'Promos', feature: null, developerOnly: true }
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
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.get('/orgs/features')
      .then(r => setFeatures(r.data.features || {}))
      .catch(() => {});
  }, [loc.pathname]);

  const isAdmin = user?.role === 'admin';
  const isDeveloper = user?.role === 'developer';
  const isStaff = isAdmin || isDeveloper;

  const nav = ALL_NAV.filter(item => {
    if (item.developerOnly && !isDeveloper) return false;
    if (item.adminOnly && !isStaff) return false;
    if (!item.feature) return true;
    if (features[item.feature] === false) return false;
    return true;
  });

  const topLinks = [
    { to: '/live', label: 'Live', feature: 'auction' },
    { href: '/scoreboard', label: 'Board', feature: 'scoreboard' },
    { to: '/points', label: 'Points', feature: 'points' },
    { href: '/match-live', label: 'Match', feature: 'scoreboard' },
    { href: '/tournament', label: 'Cup', feature: null }
  ].filter(item => {
    if (!item.feature) return true;
    return features[item.feature] !== false;
  });

  const roleLabel =
    user?.role === 'developer' ? 'DEV' :
    user?.role === 'admin' ? 'ADMIN' :
    user?.role === 'team_manager' ? 'CAPTAIN' : 'USER';

  return (
    <div className="page-mesh" style={{ color: 'var(--text)' }}>
      <header className="glass-nav">
        <div className="max-w-6xl mx-auto px-3 sm:px-5 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link to="/" className="as-brand shrink-0">
              <span className="as-brand-mark" aria-hidden>🏏</span>
              <span className="hidden xs:inline sm:inline">Auction Admin</span>
            </Link>
            <span className="as-chip as-chip--live">{roleLabel}</span>
            {title && (
              <div className="hidden lg:block pl-3 min-w-0" style={{ borderLeft: '1px solid var(--separator)' }}>
                <div className="as-page-title truncate">{title}</div>
                {subtitle && <div className="as-page-sub truncate">{subtitle}</div>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1 flex-wrap justify-end">
            {topLinks.map(item =>
              (item as any).href ? (
                <a
                  key={item.label}
                  href={(item as any).href}
                  target="_blank"
                  rel="noreferrer"
                  className="as-nav-link hidden sm:inline-flex"
                >
                  {item.label}
                </a>
              ) : (
                <Link key={item.label} to={item.to!} className="as-nav-link hidden sm:inline-flex">
                  {item.label}
                </Link>
              )
            )}
            <Link to="/live" className="as-nav-link sm:hidden">Live</Link>
            <ThemeToggle />
            {user && (
              <button type="button" onClick={logout} className="as-nav-link">
                Out
              </button>
            )}
          </div>
        </div>
        <nav className="as-shell-nav max-w-6xl mx-auto px-3 sm:px-5 pb-2.5 sm:pb-3 flex gap-1 overflow-x-auto">
          {nav.map(item => {
            const active = loc.pathname === item.to || (item.to !== '/' && loc.pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`as-nav-link${active ? ' is-active' : ''}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {title && (
        <div className="lg:hidden max-w-6xl mx-auto px-3 sm:px-5 pt-3">
          <div className="as-page-title">{title}</div>
          {subtitle && <div className="as-page-sub">{subtitle}</div>}
        </div>
      )}

      {actions && (
        <div className="max-w-6xl mx-auto px-3 sm:px-5 pt-3 sm:pt-4 flex flex-wrap justify-end gap-2">{actions}</div>
      )}

      <main className="max-w-6xl mx-auto px-3 sm:px-5 py-4 sm:py-6 md:py-8">{children}</main>
    </div>
  );
}
