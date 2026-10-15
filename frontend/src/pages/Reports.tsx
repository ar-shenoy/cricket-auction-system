import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import ThemeToggle from '../components/ThemeToggle';

interface Team {
  id: string;
  name: string;
  purse: number;
  remainingPurse: number;
}

interface Player {
  id: string;
  name: string;
  role: string;
  status: string;
  basePrice: number;
  city?: string;
}

interface SoldRecord {
  id: string;
  playerId: string;
  teamId: string;
  soldPrice: number;
  soldAt: string;
  player?: Player;
  team?: Team;
}

export default function Reports() {
  const { user, logout } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [sold, setSold] = useState<SoldRecord[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'sold' | 'squads' | 'unsold'>('summary');

  useEffect(() => {
    const load = async () => {
      try {
        const [teamsRes, playersRes, auctionsRes] = await Promise.all([
          api.get('/teams'),
          api.get('/players'),
          api.get('/auctions')
        ]);

        setTeams(teamsRes.data);
        setPlayers(playersRes.data);

        const auctions = auctionsRes.data;
        if (auctions.length > 0) {
          const target = auctions.find((a: any) => a.status === 'live' || a.status === 'paused') ||
                         auctions.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
          if (target) {
            const soldRes = await api.get(`/auctions/${target.id}/sold`);
            setSold(soldRes.data);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const totalSpent = sold.reduce((sum, s) => sum + (s.soldPrice || 0), 0);
  const soldCount = sold.length;
  const unsoldPlayers = players.filter(p => p.status === 'Unsold');
  const approvedLeft = players.filter(p => p.status === 'Approved');

  const squads = teams.map(team => {
    const teamSold = sold.filter(s => s.teamId === team.id);
    return {
      team,
      players: teamSold,
      spent: teamSold.reduce((sum, s) => sum + s.soldPrice, 0),
      count: teamSold.length
    };
  });

  const exportCSV = (rows: string[][], filename: string) => {
    const csvContent = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportSold = () => {
    const headers = ['Player', 'Role', 'Team', 'Sold Price', 'Sold At'];
    const rows = sold.map(s => [
      s.player?.name || '',
      s.player?.role || '',
      s.team?.name || '',
      String(s.soldPrice),
      s.soldAt ? new Date(s.soldAt).toLocaleString() : ''
    ]);
    exportCSV([headers, ...rows], 'sold-players.csv');
  };

  const exportSquads = () => {
    const headers = ['Team', 'Player', 'Role', 'Sold Price'];
    const rows: string[][] = [];
    squads.forEach(sq => {
      sq.players.forEach(p => {
        rows.push([sq.team.name, p.player?.name || '', p.player?.role || '', String(p.soldPrice)]);
      });
    });
    exportCSV([headers, ...rows], 'team-squads.csv');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">Loading reports...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700 sticky top-0 z-10 print:shadow-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">← Dashboard</Link>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Reports</h1>
          </div>
          <div className="flex items-center gap-3 print:hidden">
            <ThemeToggle />
            <span className="text-sm text-gray-600 dark:text-gray-300">{user?.name}</span>
            <button onClick={logout} className="text-sm text-red-600 hover:text-red-700">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-wrap gap-2 mb-6 print:hidden">
          {[
            { key: 'summary', label: 'Summary' },
            { key: 'sold', label: `Sold (${soldCount})` },
            { key: 'squads', label: 'Team Squads' },
            { key: 'unsold', label: `Unsold (${unsoldPlayers.length})` }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 border dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'summary' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-5 text-center">
                <div className="text-3xl font-bold text-gray-900 dark:text-white">{soldCount}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Players Sold</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-5 text-center">
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">₹{totalSpent.toLocaleString()}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Total Spent</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-5 text-center">
                <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{unsoldPlayers.length}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Unsold</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-5 text-center">
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{approvedLeft.length}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Still Available</div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-6">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Team Spend Overview</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b dark:border-gray-700 text-gray-500 dark:text-gray-400">
                      <th className="pb-3 font-medium">Team</th>
                      <th className="pb-3 font-medium">Players</th>
                      <th className="pb-3 font-medium">Spent</th>
                      <th className="pb-3 font-medium">Remaining</th>
                      <th className="pb-3 font-medium">Utilization</th>
                    </tr>
                  </thead>
                  <tbody>
                    {squads.map(sq => {
                      const util = sq.team.purse > 0 ? Math.round((sq.spent / sq.team.purse) * 100) : 0;
                      return (
                        <tr key={sq.team.id} className="border-b dark:border-gray-700 last:border-0">
                          <td className="py-3 font-medium text-gray-900 dark:text-white">{sq.team.name}</td>
                          <td className="py-3 text-gray-700 dark:text-gray-300">{sq.count}</td>
                          <td className="py-3 text-red-600 dark:text-red-400">₹{sq.spent.toLocaleString()}</td>
                          <td className="py-3 text-green-600 dark:text-green-400">₹{sq.team.remainingPurse.toLocaleString()}</td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${Math.min(util, 100)}%` }} />
                              </div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">{util}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sold' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b dark:border-gray-700 flex flex-wrap justify-between items-center gap-2">
              <h3 className="font-semibold text-gray-900 dark:text-white">Sold Players</h3>
              <div className="flex gap-2 print:hidden">
                <button onClick={exportSold} className="text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 px-3 py-1.5 rounded-lg">
                  📥 Export CSV
                </button>
                <button type="button" onClick={() => window.print()} className="text-sm bg-gray-700 hover:bg-gray-800 text-white px-3 py-1.5 rounded-lg">
                  🖨️ Print / PDF
                </button>
              </div>
            </div>
            {sold.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">No players sold yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700">
                    <tr>
                      <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">#</th>
                      <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Player</th>
                      <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Role</th>
                      <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Team</th>
                      <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Sold Price</th>
                      <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sold.map((s, i) => (
                      <tr key={s.id} className="border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{i + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{s.player?.name || '—'}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{s.player?.role || '—'}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{s.team?.name || '—'}</td>
                        <td className="px-4 py-3 font-medium text-green-700 dark:text-green-400">₹{s.soldPrice.toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                          {s.soldAt ? new Date(s.soldAt).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'squads' && (
          <div className="space-y-4">
            <div className="flex justify-end print:hidden">
              <button onClick={exportSquads} className="text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 px-3 py-1.5 rounded-lg">
                📥 Export All Squads CSV
              </button>
            </div>
            {squads.map(sq => (
              <div key={sq.team.id} className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700 flex justify-between items-center">
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-white">{sq.team.name}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400 ml-3">
                      {sq.count} players · Spent ₹{sq.spent.toLocaleString()} · Left ₹{sq.team.remainingPurse.toLocaleString()}
                    </span>
                  </div>
                </div>
                {sq.players.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500 dark:text-gray-400">No players bought yet.</div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b dark:border-gray-700 text-gray-500 dark:text-gray-400">
                        <th className="px-4 py-2 font-medium">Player</th>
                        <th className="px-4 py-2 font-medium">Role</th>
                        <th className="px-4 py-2 font-medium">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sq.players.map(p => (
                        <tr key={p.id} className="border-b dark:border-gray-700 last:border-0">
                          <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{p.player?.name}</td>
                          <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{p.player?.role}</td>
                          <td className="px-4 py-2 text-green-700 dark:text-green-400">₹{p.soldPrice.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'unsold' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white">Unsold Players</h3>
            </div>
            {unsoldPlayers.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">No unsold players.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700">
                    <tr>
                      <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Name</th>
                      <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Role</th>
                      <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Base Price</th>
                      <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">City</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unsoldPlayers.map(p => (
                      <tr key={p.id} className="border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{p.name}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{p.role}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">₹{(p.basePrice || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{p.city || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
