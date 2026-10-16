import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import api, { getSocketUrl } from '../services/api';
import AppShell from '../components/AppShell';

interface Team {
  id: string;
  name: string;
  purse: number;
  remainingPurse: number;
  logoUrl?: string;
}

interface AuctionRow {
  id: string;
  name: string;
  status: string;
  createdAt?: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [auctions, setAuctions] = useState<AuctionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try { fetch(`${getSocketUrl()}/api/health`); } catch {}
    Promise.all([api.get('/teams'), api.get('/auctions').catch(() => ({ data: [] }))])
      .then(([teamsRes, auctionsRes]) => {
        setTeams(teamsRes.data);
        const list = Array.isArray(auctionsRes.data) ? auctionsRes.data : [];
        setAuctions(
          list.sort(
            (a: AuctionRow, b: AuctionRow) =>
              new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
          )
        );
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    { to: '/players', title: 'Players', desc: 'Import, approve & manage', emoji: '👤' },
    { to: '/teams', title: 'Teams', desc: 'Purses, logos & squads', emoji: '🛡️' },
    { to: '/auction', title: 'Auction', desc: 'Live bidding room', emoji: '⚡' },
    { to: '/scoring', title: 'Scoring', desc: 'Ball-by-ball + board', emoji: '📊' },
    { to: '/reports', title: 'Reports', desc: 'Squads & exports', emoji: '📋' },
    { to: '/billing', title: 'Billing', desc: 'Plan & limits', emoji: '💎' }
  ];

  return (
    <AppShell title="Home" subtitle={user ? user.name : undefined}>
      <div className="mb-8">
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
          Run your tournament
        </h2>
        <p className="mt-2 text-[15px] text-[var(--text-secondary)] max-w-xl">
          Auction, score live, and share public boards — all in one place.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {cards.map(c => (
          <Link
            key={c.to}
            to={c.to}
            className="glass rounded-[22px] p-5 hover:scale-[1.02] transition active:scale-[0.99] block"
          >
            <div className="text-3xl mb-3">{c.emoji}</div>
            <div className="font-semibold text-[17px] text-[var(--text-primary)]">{c.title}</div>
            <div className="text-sm text-[var(--text-secondary)] mt-1">{c.desc}</div>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="glass rounded-[22px] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[17px] text-[var(--text-primary)]">Teams</h3>
            <Link to="/teams" className="text-sm text-[var(--accent)] font-medium">Manage</Link>
          </div>
          {loading && <p className="text-sm text-[var(--text-secondary)]">Loading…</p>}
          {!loading && teams.length === 0 && (
            <p className="text-sm text-[var(--text-secondary)]">No teams yet.</p>
          )}
          <ul className="space-y-2">
            {teams.slice(0, 8).map(t => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-2 border-b border-black/5 dark:border-white/10 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  {t.logoUrl ? (
                    <img src={t.logoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center text-xs">🏏</span>
                  )}
                  <span className="font-medium truncate text-[var(--text-primary)]">{t.name}</span>
                </div>
                <span className="text-sm tabular-nums text-[var(--text-secondary)] shrink-0">
                  ₹{(t.remainingPurse ?? t.purse).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="glass rounded-[22px] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[17px] text-[var(--text-primary)]">Auctions</h3>
            <Link to="/auction" className="text-sm text-[var(--accent)] font-medium">Open</Link>
          </div>
          {loading && <p className="text-sm text-[var(--text-secondary)]">Loading…</p>}
          {!loading && auctions.length === 0 && (
            <p className="text-sm text-[var(--text-secondary)]">No auctions yet.</p>
          )}
          <ul className="space-y-2">
            {auctions.slice(0, 8).map(a => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-2 border-b border-black/5 dark:border-white/10 last:border-0">
                <span className="font-medium truncate text-[var(--text-primary)]">{a.name}</span>
                <span className={`text-xs px-2.5 py-0.5 rounded-full shrink-0 font-medium ${
                  a.status === 'live' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
                  a.status === 'completed' ? 'bg-black/5 dark:bg-white/10 text-[var(--text-secondary)]' :
                  'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                }`}>{a.status}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
