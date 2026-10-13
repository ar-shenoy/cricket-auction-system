import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import api from '../services/api';

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏏</span>
            <h1 className="text-xl font-bold text-gray-900">Cricket Auction</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {user?.name} <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full ml-1">{user?.role}</span>
            </span>
            <button
              onClick={logout}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-gray-500 mt-1">Welcome back! Manage your auction from here.</p>
        </div>

        {/* Quick Actions */}
        {user?.role === 'admin' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Link
              to="/teams"
              className="bg-white p-5 rounded-xl shadow-sm border hover:shadow-md transition flex flex-col items-center text-center"
            >
              <span className="text-3xl mb-2">👥</span>
              <span className="font-semibold text-gray-800">Manage Teams</span>
            </Link>
            <Link
              to="/players"
              className="bg-white p-5 rounded-xl shadow-sm border hover:shadow-md transition flex flex-col items-center text-center"
            >
              <span className="text-3xl mb-2">🧑‍🦱</span>
              <span className="font-semibold text-gray-800">Players</span>
            </Link>
            <Link
              to="/auction"
              className="bg-white p-5 rounded-xl shadow-sm border hover:shadow-md transition flex flex-col items-center text-center"
            >
              <span className="text-3xl mb-2">💰</span>
              <span className="font-semibold text-gray-800">Live Auction</span>
            </Link>
            <Link
              to="/reports"
              className="bg-white p-5 rounded-xl shadow-sm border hover:shadow-md transition flex flex-col items-center text-center"
            >
              <span className="text-3xl mb-2">📊</span>
              <span className="font-semibold text-gray-800">Reports</span>
            </Link>
          </div>
        )}

        {/* Teams Overview */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Teams Overview</h3>
          {loading ? (
            <p className="text-gray-500">Loading teams...</p>
          ) : teams.length === 0 ? (
            <p className="text-gray-500">No teams created yet. {user?.role === 'admin' && 'Go to Manage Teams to add some.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b text-sm text-gray-500">
                    <th className="pb-3 font-medium">Team</th>
                    <th className="pb-3 font-medium">Total Purse</th>
                    <th className="pb-3 font-medium">Remaining</th>
                    <th className="pb-3 font-medium">Spent</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map(team => (
                    <tr key={team.id} className="border-b last:border-0">
                      <td className="py-3 font-medium text-gray-900">{team.name}</td>
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
