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
  completedAt?: string;
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
    { to: '/players', title: 'Players', desc: 'Import, approve & manage squad', emoji: '👤', color: 'from-indigo-600/20 to-indigo-900/10 border-indigo-800' },
    { to: '/teams', title: 'Teams', desc: 'Purses, logos & squad slots', emoji: '🛡️', color: 'from-emerald-600/20 to-emerald-900/10 border-emerald-800' },
    { to: '/auction', title: 'Live auction', desc: 'Bid, sell, recall & undo', emoji: '⚡', color: 'from-amber-600/20 to-amber-900/10 border-amber-800' },
    { to: '/scoring', title: 'Live scoring', desc: 'Ball-by-ball + projector board', emoji: '📊', color: 'from-rose-600/20 to-rose-900/10 border-rose-800' },
    { to: '/reports', title: 'Reports', desc: 'Sold list, squads, export', emoji: '📋', color: 'from-sky-600/20 to-sky-900/10 border-sky-800' },
    { to: '/billing', title: 'Plan & billing', desc: 'Free vs Pro limits', emoji: '💎', color: 'from-violet-600/20 to-violet-900/10 border-violet-800' }
  ];

  return (
    <AppShell title="Dashboard" subtitle={user ? `Hi, ${user.name}` : undefined}>
      <div className="mb-8">
        <p className="text-indigo-400 text-sm font-semibold uppercase tracking-widest mb-1">Control center</p>
        <h2 className="text-3xl font-black tracking-tight">Run your tournament</h2>
        <p className="text-slate-400 mt-2 max-w-xl">
          Auction players, score matches live, and share public boards — all from one place.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {cards.map(c => (
          <Link
            key={c.to}
            to={c.to}
            className={`block rounded-2xl border bg-gradient-to-br ${c.color} p-5 hover:scale-[1.01] transition shadow-lg`}
          >
            <div className="text-3xl mb-3">{c.emoji}</div>
            <div className="font-bold text-lg text-white">{c.title}</div>
            <div className="text-sm text-slate-400 mt-1">{c.desc}</div>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg">Teams</h3>
            <Link to="/teams" className="text-sm text-indigo-400 hover:underline">Manage</Link>
          </div>
          {loading && <p className="text-slate-500 text-sm">Loading…</p>}
          {!loading && teams.length === 0 && (
            <p className="text-slate-500 text-sm">No teams yet. Add teams to start an auction.</p>
          )}
          <ul className="space-y-2">
            {teams.slice(0, 8).map(t => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-2 border-b border-slate-800 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  {t.logoUrl ? (
                    <img src={t.logoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs">🏏</span>
                  )}
                  <span className="font-medium truncate">{t.name}</span>
                </div>
                <span className="text-sm text-slate-400 tabular-nums shrink-0">
                  ₹{(t.remainingPurse ?? t.purse).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg">Auctions</h3>
            <Link to="/auction" className="text-sm text-indigo-400 hover:underline">Open</Link>
          </div>
          {loading && <p className="text-slate-500 text-sm">Loading…</p>}
          {!loading && auctions.length === 0 && <p className="text-slate-500 text-sm">No auctions yet.</p>}
          <ul className="space-y-2">
            {auctions.slice(0, 8).map(a => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-2 border-b border-slate-800 last:border-0">
                <span className="font-medium truncate">{a.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                  a.status === 'live' ? 'bg-emerald-900/50 text-emerald-300' :
                  a.status === 'completed' ? 'bg-slate-800 text-slate-400' : 'bg-amber-900/40 text-amber-300'
                }`}>{a.status}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link to="/live" className="text-slate-400 hover:text-indigo-400">Public live board →</Link>
        <Link to="/scoreboard" className="text-slate-400 hover:text-rose-400">Projector scoreboard →</Link>
        <Link to="/welcome" className="text-slate-400 hover:text-white">Marketing page →</Link>
      </div>
    </AppShell>
  );
}
