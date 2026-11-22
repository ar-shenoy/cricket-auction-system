import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import api, { getSocketUrl } from '../services/api';
import AppShell from '../components/AppShell';

interface Summary {
  counts: {
    teams: number; players: number; approved: number; sold: number; unsold: number;
    matches: number; matchesCompleted: number; bids: number;
  };
  auction: {
    active: { id: string; name: string; status: string } | null;
    totalPurse: number; totalSpent: number; remainingPurse: number;
    spendByTeam: { teamId: string; name: string; spent: number; remaining: number; playersBought: number; purse: number }[];
    topBuys: { playerName: string; role: string | null; teamName: string; price: number }[];
    spendByRole: { role: string; count: number; spend: number }[];
  };
  match: {
    live: {
      id: string; name: string; status: string; teamAName: string; teamBName: string;
      innings: number; scoreA: string; scoreB: string | null;
    } | null;
    recent: { id: string; name: string; status: string; teamAName: string; teamBName: string; result: string | null }[];
  };
}

function inr(n: number) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    try { fetch(`${getSocketUrl()}/api/health`); } catch {}
    api.get('/analytics/summary')
      .then(r => setSummary(r.data))
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, []);

  const ops = [
    { to: '/auction', title: 'Auction room', desc: 'Bid, sell, undo, share live', tag: 'Core' },
    { to: '/scoring', title: 'Match scoring', desc: 'Ball-by-ball · D/L · Super Over', tag: 'Core' },
    { to: '/hub', title: 'Tournament Hub', desc: 'Seasons, venues, fixtures', tag: 'Ops' },
    { to: '/broadcast', title: 'Broadcast', desc: 'Lower-thirds & sponsors', tag: 'Ops' },
    { to: '/players', title: 'Player pool', desc: 'Import, approve, roles', tag: 'Setup' },
    { to: '/teams', title: 'Franchises', desc: 'Purses, caps, logos', tag: 'Setup' },
    { to: '/reports', title: 'Reports', desc: 'Squads, spends, exports', tag: 'Analysis' },
    { to: '/intelligence', title: 'Intelligence', desc: 'Market values & efficiency', tag: 'Analysis' },
    { to: '/billing', title: 'Plan', desc: 'Limits & upgrades', tag: 'Org' }
  ];

  return (
    <AppShell title="Home" subtitle={user ? user.name : undefined}>
      <div className="mb-6">
        <h2 className="text-[28px] sm:text-[36px] font-semibold tracking-tight leading-tight" style={{ color: 'var(--text)' }}>
          Tournament command centre
        </h2>
        <p className="mt-1.5 text-[14px] max-w-2xl" style={{ color: 'var(--text-2)' }}>
          Auction, score live, hub fixtures, and public feeds — one place for your league.
        </p>
      </div>

      {loading && !summary && (
        <div className="glass p-6 text-center mb-4" style={{ color: 'var(--text-2)' }}>Loading summary…</div>
      )}

      {summary && (
        <div className="space-y-5 mb-6">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="glass p-4">
              <div className="text-[11px] uppercase tracking-wide font-semibold mb-2" style={{ color: 'var(--text-2)' }}>Live auction</div>
              {summary.auction?.active ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-[16px]">{summary.auction.active.name}</div>
                    <div className="text-[12px] capitalize" style={{ color: summary.auction.active.status === 'live' ? '#30d158' : 'var(--text-2)' }}>
                      {summary.auction.active.status}
                    </div>
                  </div>
                  <Link to="/auction" className="as-btn-primary text-sm">Open room</Link>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[14px]" style={{ color: 'var(--text-2)' }}>No draft/live auction</div>
                  <Link to="/auction" className="as-btn-ghost text-sm">Create</Link>
                </div>
              )}
            </div>
            <div className="glass p-4">
              <div className="text-[11px] uppercase tracking-wide font-semibold mb-2" style={{ color: 'var(--text-2)' }}>Live match</div>
              {summary.match?.live ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-[16px]">{summary.match.live.teamAName} vs {summary.match.live.teamBName}</div>
                    <div className="text-[12px] tabular-nums" style={{ color: 'var(--text-2)' }}>
                      {summary.match.live.scoreA}
                      {summary.match.live.scoreB ? ` · ${summary.match.live.scoreB}` : ''}
                    </div>
                  </div>
                  <Link to="/scoring" className="as-btn-primary text-sm">Score</Link>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[14px]" style={{ color: 'var(--text-2)' }}>No live match</div>
                  <Link to="/scoring" className="as-btn-ghost text-sm">Start</Link>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { label: 'Purse deployed', value: inr(summary.auction?.totalSpent || 0) },
              { label: 'Purse left', value: inr(summary.auction?.remainingPurse || 0) },
              { label: 'Players sold', value: String(summary.counts?.sold ?? 0) },
              { label: 'Matches done', value: String(summary.counts?.matchesCompleted ?? 0) }
            ].map(k => (
              <div key={k.label} className="glass p-3.5">
                <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>{k.label}</div>
                <div className="text-[20px] font-semibold tabular-nums mt-1">{k.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass p-4 mb-6">
        <div className="font-semibold text-[15px] mb-2">Public feeds</div>
        <div className="flex flex-wrap gap-2">
          <a href="/live" target="_blank" rel="noreferrer" className="as-btn-ghost text-sm">Auction live</a>
          <a href="/results" target="_blank" rel="noreferrer" className="as-btn-ghost text-sm">Results</a>
          <a href="/match-live" target="_blank" rel="noreferrer" className="as-btn-ghost text-sm">Match centre</a>
          <a href="/scoreboard" target="_blank" rel="noreferrer" className="as-btn-ghost text-sm">Projector board</a>
          <a href="/points" target="_blank" rel="noreferrer" className="as-btn-ghost text-sm">Points</a>
        </div>
      </div>

      <div>
        <div className="text-[12px] uppercase tracking-wide font-semibold mb-2.5" style={{ color: 'var(--text-2)' }}>Operations</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ops.map(c => (
            <Link key={c.to} to={c.to} className="glass p-4 block transition active:scale-[0.98]" style={{ textDecoration: 'none' }}>
              <div className="text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: 'var(--accent)' }}>{c.tag}</div>
              <div className="font-semibold text-[15px]" style={{ color: 'var(--text)' }}>{c.title}</div>
              <div className="text-[12px] mt-0.5" style={{ color: 'var(--text-2)' }}>{c.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
