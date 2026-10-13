import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

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

        // Get sold from the latest/completed auction or all
        const auctions = auctionsRes.data;
        if (auctions.length > 0) {
          // Try active first, then latest
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

  // Build squads
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
        rows.push([
          sq.team.name,
          p.player?.name || '',
          p.player?.role || '',
          String(p.soldPrice)
        ]);
      });
    });
    exportCSV([headers, ...rows], 'team-squads.csv');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading reports...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-gray-500 hover:text-gray-700">← Dashboard</Link>
            <h1 className="text-xl font-bold text-gray-900">Reports</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{user?.name}</span>
            <button onClick={logout} className="text-sm text-red-600 hover:text-red-700">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
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
                  : 'bg-white border text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* SUMMARY TAB */}
        {activeTab === 'summary' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border p-5 text-center">
                <div className="text-3xl font-bold text-gray-900">{soldCount}</div>
                <div className="text-sm text-gray-500 mt-1">Players Sold</div>
              </div>
              <div className="bg-white rounded-xl border p-5 text-center">
                <div className="text-3xl font-bold text-green-600">₹{totalSpent.toLocaleString()}</div>
                <div className="text-sm text-gray-500 mt-1">Total Spent</div>
              </div>
              <div className="bg-white rounded-xl border p-5 text-center">
                <div className="text-3xl font-bold text-yellow-600">{unsoldPlayers.length}</div>
                <div className="text-sm text-gray-500 mt-1">Unsold</div>
              </div>
              <div className="bg-white rounded-xl border p-5 text-center">
                <div className="text-3xl font-bold text-blue-600">{approvedLeft.length}</div>
                <div className="text-sm text-gray-500 mt-1">Still Available</div>
              </div>
            </div>

            {/* Team Spend Overview */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Team Spend Overview</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-gray-500">
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
                        <tr key={sq.team.id} className="border-b last:border-0">
                          <td className="py-3 font-medium">{sq.team.name}</td>
                          <td className="py-3">{sq.count}</td>
                          <td className="py-3 text-red-600">₹{sq.spent.toLocaleString()}</td>
                          <td className="py-3 text-green-600">₹{sq.team.remainingPurse.toLocaleString()}</td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-24 bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-blue-600 h-2 rounded-full"
                                  style={{ width: `${Math.min(util, 100)}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500">{util}%</span>
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

        {/* SOLD TAB */}
        {activeTab === 'sold' && (
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-semibold">Sold Players</h3>
              <button
                onClick={exportSold}
                className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg"
              >
                📥 Export CSV
              </button>
            </div>
            {sold.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No players sold yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 font-medium text-gray-600">#</th>
                      <th className="px-4 py-3 font-medium text-gray-600">Player</th>
                      <th className="px-4 py-3 font-medium text-gray-600">Role</th>
                      <th className="px-4 py-3 font-medium text-gray-600">Team</th>
                      <th className="px-4 py-3 font-medium text-gray-600">Sold Price</th>
                      <th className="px-4 py-3 font-medium text-gray-600">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sold.map((s, i) => (
                      <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                        <td className="px-4 py-3 font-medium">{s.player?.name || '—'}</td>
                        <td className="px-4 py-3">{s.player?.role || '—'}</td>
                        <td className="px-4 py-3">{s.team?.name || '—'}</td>
                        <td className="px-4 py-3 font-medium text-green-700">₹{s.soldPrice.toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
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

        {/* SQUADS TAB */}
        {activeTab === 'squads' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                onClick={exportSquads}
                className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg"
              >
                📥 Export All Squads CSV
              </button>
            </div>
            {squads.map(sq => (
              <div key={sq.team.id} className="bg-white rounded-xl border overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b flex justify-between items-center">
                  <div>
                    <span className="font-semibold text-gray-900">{sq.team.name}</span>
                    <span className="text-sm text-gray-500 ml-3">
                      {sq.count} players · Spent ₹{sq.spent.toLocaleString()} · Left ₹{sq.team.remainingPurse.toLocaleString()}
                    </span>
                  </div>
                </div>
                {sq.players.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500">No players bought yet.</div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-gray-500">
                        <th className="px-4 py-2 font-medium">Player</th>
                        <th className="px-4 py-2 font-medium">Role</th>
                        <th className="px-4 py-2 font-medium">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sq.players.map(p => (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="px-4 py-2 font-medium">{p.player?.name}</td>
                          <td className="px-4 py-2">{p.player?.role}</td>
                          <td className="px-4 py-2 text-green-700">₹{p.soldPrice.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        )}

        {/* UNSOLD TAB */}
        {activeTab === 'unsold' && (
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="p-4 border-b">
              <h3 className="font-semibold">Unsold Players</h3>
            </div>
            {unsoldPlayers.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No unsold players.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 font-medium text-gray-600">Name</th>
                      <th className="px-4 py-3 font-medium text-gray-600">Role</th>
                      <th className="px-4 py-3 font-medium text-gray-600">Base Price</th>
                      <th className="px-4 py-3 font-medium text-gray-600">City</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unsoldPlayers.map(p => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{p.name}</td>
                        <td className="px-4 py-3">{p.role}</td>
                        <td className="px-4 py-3">₹{(p.basePrice || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-500">{p.city || '—'}</td>
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
