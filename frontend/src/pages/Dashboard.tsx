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
        <h2 className="text-[32px] sm:text-[40px] font-semibold tracking-tight leading-tight" style={{ color: 'var(--text)' }}>
          Run your tournament
        </h2>
        <p className="mt-2 text-[15px] max-w-xl" style={{ color: 'var(--text-2)' }}>
          Auction, score live, and share public boards — all in one place.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5 mb-8">
        {cards.map(c => (
          <Link key={c.to} to={c.to} className="glass p-5 block transition active:scale-[0.98]" style={{ textDecoration: 'none' }}>
            <div className="text-[28px] mb-3">{c.emoji}</div>
            <div className="font-semibold text-[17px]" style={{ color: 'var(--text)' }}>{c.title}</div>
            <div className="text-[13px] mt-1" style={{ color: 'var(--text-2)' }}>{c.desc}</div>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-3.5">
        <div className="glass overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h3 className="font-semibold text-[17px]" style={{ color: 'var(--text)' }}>Teams</h3>
            <Link to="/teams" className="text-[14px] font-medium" style={{ color: 'var(--accent)' }}>Manage</Link>
          </div>
          {loading && <p className="px-4 pb-4 text-[14px]" style={{ color: 'var(--text-2)' }}>Loading…</p>}
          {!loading && teams.length === 0 && (
            <p className="px-4 pb-4 text-[14px]" style={{ color: 'var(--text-2)' }}>No teams yet.</p>
          )}
          {teams.slice(0, 8).map(t => (
            <div key={t.id} className="glass-row">
              {t.logoUrl ? (
                <img src={t.logoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs" style={{ background: 'var(--fill)' }}>🏏</span>
              )}
              <span className="font-medium flex-1 truncate text-[15px]" style={{ color: 'var(--text)' }}>{t.name}</span>
              <span className="text-[14px] tabular-nums" style={{ color: 'var(--text-2)' }}>₹{(t.remainingPurse ?? t.purse).toLocaleString()}</span>
            </div>
          ))}
        </div>

        <div className="glass overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h3 className="font-semibold text-[17px]" style={{ color: 'var(--text)' }}>Auctions</h3>
            <Link to="/auction" className="text-[14px] font-medium" style={{ color: 'var(--accent)' }}>Open</Link>
          </div>
          {loading && <p className="px-4 pb-4 text-[14px]" style={{ color: 'var(--text-2)' }}>Loading…</p>}
          {!loading && auctions.length === 0 && (
            <p className="px-4 pb-4 text-[14px]" style={{ color: 'var(--text-2)' }}>No auctions yet.</p>
          )}
          {auctions.slice(0, 8).map(a => (
            <div key={a.id} className="glass-row">
              <span className="font-medium flex-1 truncate text-[15px]" style={{ color: 'var(--text)' }}>{a.name}</span>
              <span
                className="glass-island text-[11px]"
                style={
                  a.status === 'live' ? { color: '#30d158' } :
                  a.status === 'completed' ? { color: 'var(--text-2)' } : { color: '#ff9f0a' }
                }
              >{a.status}</span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
