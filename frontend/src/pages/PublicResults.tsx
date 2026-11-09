import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getSocketUrl } from '../services/api';
import ThemeToggle from '../components/ThemeToggle';

interface Team {
  id: string;
  name: string;
  purse: number;
  remainingPurse: number;
  logoUrl?: string;
}

interface Player {
  id: string;
  name: string;
  role: string;
  status: string;
  photoUrl?: string;
}

interface SoldRecord {
  id: string;
  playerId: string;
  teamId: string;
  soldPrice: number;
  soldAt?: string;
  player?: Player;
  team?: Team;
}

export default function PublicResults() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [sold, setSold] = useState<SoldRecord[]>([]);
  const [auctionName, setAuctionName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        try { await fetch(`${getSocketUrl()}/api/health`); } catch {}
        const activeRes = await api.get('/auctions/public/active');
        const active = activeRes.data;
        if (!active?.id) {
          setError('No auction data available yet.');
          setLoading(false);
          return;
        }
        setAuctionName(active.name || 'Auction Results');
        const [soldRes, teamsRes] = await Promise.all([
          api.get(`/auctions/${active.id}/public/sold`),
          api.get('/teams')
        ]);
        setSold(soldRes.data || []);
        setTeams(teamsRes.data || []);
      } catch {
        setError('Could not load results. Backend may be waking up — refresh in 30s.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent">
        <div className="text-gray-500 dark:text-[var(--text-secondary)]">Loading results...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-transparent text-[var(--text-primary)]">
      <header className="glass border-b border-gray-200 dark:border-slate-800 sticky top-0 z-10 print:shadow-none">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">📊 {auctionName}</h1>
            <p className="text-xs text-gray-500 dark:text-[var(--text-secondary)]">Public results · no login required</p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <ThemeToggle />
            <Link to="/live" className="text-sm text-indigo-400">Live</Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {error && <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-sm">{error}</div>}

        <section className="glass rounded-xl p-4">
          <h2 className="font-semibold text-[var(--text-primary)] mb-3">Teams & squads</h2>
          <div className="space-y-2">
            {teams.map(tm => {
              const squad = sold.filter(s => s.teamId === tm.id);
              const open = expandedTeamId === tm.id;
              return (
                <div key={tm.id} className="rounded-xl overflow-hidden" style={{ background: 'var(--fill, rgba(255,255,255,0.04))' }}>
                  <button
                    type="button"
                    onClick={() => setExpandedTeamId(open ? null : tm.id)}
                    className="w-full flex items-center gap-3 p-3 text-left"
                  >
                    {tm.logoUrl ? (
                      <img src={tm.logoUrl} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                    ) : (
                      <span className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-semibold shrink-0 bg-black/10 dark:bg-white/10">
                        {(tm.name || 'T').slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-[var(--text-primary)] truncate">{tm.name}</div>
                      <div className="text-xs text-green-600 dark:text-green-400">
                        ₹{Number(tm.remainingPurse ?? 0).toLocaleString()} left · {squad.length} player{squad.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <span className="text-[var(--text-secondary)] text-lg">{open ? '▾' : '▸'}</span>
                  </button>
                  {open && (
                    <div className="px-3 pb-3">
                      {squad.length === 0 ? (
                        <div className="text-sm text-[var(--text-secondary)] px-2 py-2">No players bought yet.</div>
                      ) : (
                        <ul className="space-y-1.5">
                          {squad.map(s => (
                            <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 bg-black/5 dark:bg-white/5 text-sm">
                              <span className="truncate text-[var(--text-primary)]">{s.player?.name || '—'}</span>
                              <span className="tabular-nums text-emerald-500 shrink-0">₹{Number(s.soldPrice).toLocaleString()}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

      </main>
    </div>
  );
}
