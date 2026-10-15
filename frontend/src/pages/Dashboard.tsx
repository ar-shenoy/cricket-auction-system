import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
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

interface AuctionRow {
  id: string;
  name: string;
  status: string;
  createdAt?: string;
  completedAt?: string;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [auctions, setAuctions] = useState<AuctionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try { fetch(`${getSocketUrl()}/api/health`); } catch {}
    Promise.all([
      api.get('/teams'),
      api.get('/auctions').catch(() => ({ data: [] }))
    ])
      .then(([teamsRes, auctionsRes]) => {
        setTeams(teamsRes.data);
        const list = Array.isArray(auctionsRes.data) ? auctionsRes.data : [];
        setAuctions(list.sort((a: AuctionRow, b: AuctionRow) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        ));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏏</span>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Cricket Auction</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/live" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">Public Live</Link>
            <Link to="/results" className="text-sm text-green-600 dark:text-green-400 hover:underline">Results</Link>
            <ThemeToggle />
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {user?.name} <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full ml-1">{user?.role}</span>
            </span>
            <button onClick={logout} className="text-sm text-red-600 hover:text-red-700 font-medium">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Welcome back! Manage your auction from here.</p>
        </div>

        {user?.role === 'admin' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Link to="/teams" className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border dark:border-gray-700 hover:shadow-md transition flex flex-col items-center text-center">
              <span className="text-3xl mb-2">👥</span>
              <span className="font-semibold text-gray-800 dark:text-gray-200">Manage Teams</span>
            </Link>
            <Link to="/players" className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border dark:border-gray-700 hover:shadow-md transition flex flex-col items-center text-center">
              <span className="text-3xl mb-2">🧔‍♂️</span>
              <span className="font-semibold text-gray-800 dark:text-gray-200">Players</span>
            </Link>
            <Link to="/auction" className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border dark:border-gray-700 hover:shadow-md transition flex flex-col items-center text-center">
              <span className="text-3xl mb-2">💰</span>
              <span className="font-semibold text-gray-800 dark:text-gray-200">Live Auction</span>
            </Link>
            <Link to="/reports" className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border dark:border-gray-700 hover:shadow-md transition flex flex-col items-center text-center">
              <span className="text-3xl mb-2">📊</span>
              <span className="font-semibold text-gray-800 dark:text-gray-200">Reports</span>
            </Link>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Teams Overview</h3>
          {loading ? (
            <p className="text-gray-500">Loading teams...</p>
          ) : teams.length === 0 ? (
            <p className="text-gray-500">No teams created yet. {user?.role === 'admin' && 'Go to Manage Teams to add some.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b dark:border-gray-700 text-sm text-gray-500">
                    <th className="pb-3 font-medium">Team</th>
                    <th className="pb-3 font-medium">Total Purse</th>
                    <th className="pb-3 font-medium">Remaining</th>
                    <th className="pb-3 font-medium">Spent</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map(team => (
                    <tr key={team.id} className="border-b dark:border-gray-700 last:border-0">
                      <td className="py-3 font-medium text-gray-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          {team.logoUrl ? <img src={team.logoUrl} alt="" className="w-7 h-7 rounded object-cover" /> : null}
                          {team.name}
                        </div>
                      </td>
                      <td className="py-3 text-gray-700 dark:text-gray-300">₹{team.purse.toLocaleString()}</td>
                      <td className="py-3 text-green-600 font-medium">₹{team.remainingPurse.toLocaleString()}</td>
                      <td className="py-3 text-red-500">₹{(team.purse - team.remainingPurse).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <section className="mt-8 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="font-semibold text-gray-900 dark:text-white">Auction history</h2>
            <div className="flex gap-3 text-sm">
              <a href="/live" target="_blank" rel="noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">Open live</a>
              <a href="/results" target="_blank" rel="noreferrer" className="text-green-600 dark:text-green-400 hover:underline">Public results</a>
            </div>
          </div>
          {auctions.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No auctions yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {auctions.map(a => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 border-b dark:border-gray-700 pb-2 last:border-0">
                  <span className="text-gray-900 dark:text-white font-medium">{a.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    a.status === 'live' ? 'bg-green-100 text-green-700' :
                    a.status === 'completed' ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' :
                    a.status === 'paused' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>{a.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
