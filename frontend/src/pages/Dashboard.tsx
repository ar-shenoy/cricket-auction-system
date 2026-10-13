import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import api from '../services/api';
import ThemeToggle from '../components/ThemeToggle';

interface Team {
  id: string;
  name: string;
  purse: number;
  remainingPurse: number;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/teams')
      .then(res => setTeams(res.data))
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
            <Link to="/live" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">Public Live View</Link>
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
                      <td className="py-3 font-medium text-gray-900 dark:text-white">{team.name}</td>
                      <td className="py-3">₹{team.purse.toLocaleString()}</td>
                      <td className="py-3 text-green-600 font-medium">₹{team.remainingPurse.toLocaleString()}</td>
                      <td className="py-3 text-red-500">₹{(team.purse - team.remainingPurse).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
