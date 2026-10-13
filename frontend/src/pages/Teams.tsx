import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

interface Team {
  id: string;
  name: string;
  purse: number;
  remainingPurse: number;
  createdAt: string;
}

export default function Teams() {
  const { user, logout } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: '',
    purse: '10000000',
    managerName: '',
    managerEmail: '',
    managerPassword: ''
  });

  const loadTeams = () => {
    setLoading(true);
    api.get('/teams')
      .then(res => setTeams(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTeams();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/teams', {
        name: form.name,
        purse: Number(form.purse),
        managerName: form.managerName || undefined,
        managerEmail: form.managerEmail || undefined,
        managerPassword: form.managerPassword || undefined
      });
      setShowModal(false);
      setForm({ name: '', purse: '10000000', managerName: '', managerEmail: '', managerPassword: '' });
      loadTeams();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create team');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-gray-500 hover:text-gray-700">← Dashboard</Link>
            <h1 className="text-xl font-bold text-gray-900">Teams</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{user?.name}</span>
            <button onClick={logout} className="text-sm text-red-600 hover:text-red-700">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex justify-between items-center mb-6">
          <p className="text-gray-500">Manage participating teams and their purses.</p>
          {user?.role === 'admin' && (
            <button
              onClick={() => setShowModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              + Create Team
            </button>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading teams...</div>
          ) : teams.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No teams yet. Create your first team.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-600">Team Name</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Total Purse</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Remaining</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Spent</th>
                </tr>
              </thead>
              <tbody>
                {teams.map(team => (
                  <tr key={team.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{team.name}</td>
                    <td className="px-4 py-3">₹{team.purse.toLocaleString()}</td>
                    <td className="px-4 py-3 text-green-600 font-medium">₹{team.remainingPurse.toLocaleString()}</td>
                    <td className="px-4 py-3 text-red-500">₹{(team.purse - team.remainingPurse).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Create Team Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">Create New Team</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Team Name *</label>
                <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full border rounded-lg px-3 py-2" placeholder="e.g. Mumbai Indians" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Purse Amount (₹) *</label>
                <input required type="number" value={form.purse} onChange={e => setForm({...form, purse: e.target.value})} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <hr className="my-2" />
              <p className="text-xs text-gray-500">Optional: Create Team Manager account</p>
              <div>
                <label className="block text-sm font-medium mb-1">Manager Name</label>
                <input value={form.managerName} onChange={e => setForm({...form, managerName: e.target.value})} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Manager Email</label>
                <input type="email" value={form.managerEmail} onChange={e => setForm({...form, managerEmail: e.target.value})} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Manager Password</label>
                <input type="password" value={form.managerPassword} onChange={e => setForm({...form, managerPassword: e.target.value})} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium">Create Team</button>
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 py-2 rounded-lg">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
