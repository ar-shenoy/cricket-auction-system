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

  const exportCsv = () => {
    const rows = [['Player', 'Role', 'Team', 'Sold Price']];
    sold.forEach(s => {
      rows.push([
        s.player?.name || s.playerId,
        s.player?.role || '',
        s.team?.name || s.teamId,
        String(s.soldPrice)
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'auction-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">Loading results...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700 sticky top-0 z-10 print:shadow-none">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">📊 {auctionName}</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Public results · no login required</p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <ThemeToggle />
            <Link to="/live" className="text-sm text-indigo-600 dark:text-indigo-400">Live</Link>
            <button onClick={exportCsv} className="text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg">Export CSV</button>
            <button onClick={() => window.print()} className="text-sm bg-gray-700 text-white px-3 py-1.5 rounded-lg">Print / PDF</button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {error && <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-sm">{error}</div>}

        <section className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Team purses</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {teams.map(t => (
              <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/40">
                {t.logoUrl ? <img src={t.logoUrl} alt="" className="w-10 h-10 rounded object-cover" /> : <span className="text-2xl">🏏</span>}
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">{t.name}</div>
                  <div className="text-xs text-green-600 dark:text-green-400">₹{t.remainingPurse.toLocaleString()} left</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b dark:border-gray-700 font-semibold text-gray-900 dark:text-white">
            Sold players ({sold.length})
          </div>
          {sold.length === 0 ? (
            <p className="p-6 text-sm text-gray-500 dark:text-gray-400">No sales yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300">
                  <tr>
                    <th className="px-4 py-2">Player</th>
                    <th className="px-4 py-2">Role</th>
                    <th className="px-4 py-2">Team</th>
                    <th className="px-4 py-2">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {sold.map(s => (
                    <tr key={s.id} className="border-t dark:border-gray-700">
                      <td className="px-4 py-2 text-gray-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          {s.player?.photoUrl && <img src={s.player.photoUrl} alt="" className="w-7 h-7 rounded-full object-cover" />}
                          {s.player?.name || s.playerId}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{s.player?.role || '—'}</td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{s.team?.name || s.teamId}</td>
                      <td className="px-4 py-2 font-medium text-green-600 dark:text-green-400">₹{s.soldPrice.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
