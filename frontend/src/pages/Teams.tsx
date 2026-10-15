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
  createdAt: string;
}

export default function Teams() {
  const { user, logout } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [form, setForm] = useState({
    name: '',
    purse: '10000000',
    remainingPurse: '',
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

  useEffect(() => { loadTeams(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', purse: '10000000', remainingPurse: '', managerName: '', managerEmail: '', managerPassword: '' });
    setShowModal(true);
  };

  const openEdit = (team: Team) => {
    setEditing(team);
    setForm({
      name: team.name,
      purse: String(team.purse),
      remainingPurse: String(team.remainingPurse),
      managerName: '', managerEmail: '', managerPassword: ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/teams/${editing.id}`, {
          name: form.name,
          purse: Number(form.purse),
          remainingPurse: form.remainingPurse !== '' ? Number(form.remainingPurse) : undefined
        });
      } else {
        await api.post('/teams', {
          name: form.name,
          purse: Number(form.purse),
          managerName: form.managerName || undefined,
          managerEmail: form.managerEmail || undefined,
          managerPassword: form.managerPassword || undefined
        });
      }
      setShowModal(false);
      setEditing(null);
      loadTeams();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save team');
    }
  };

  const handleDelete = async (team: Team) => {
    if (!confirm(`Delete team "${team.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/teams/${team.id}`);
      loadTeams();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete team');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">← Dashboard</Link>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Teams</h1>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span className="text-sm text-gray-600 dark:text-gray-300">{user?.name}</span>
            <button onClick={logout} className="text-sm text-red-600 hover:text-red-700">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex justify-between items-center mb-6">
          <p className="text-gray-500 dark:text-gray-400">Manage participating teams and their purses.</p>
          {user?.role === 'admin' && (
            <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              + Create Team
            </button>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading teams...</div>
          ) : teams.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">No teams yet. Create your first team.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Team Name</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Total Purse</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Remaining</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Spent</th>
                  {user?.role === 'admin' && (
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {teams.map(team => (
                  <tr key={team.id} className="border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{team.name}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">₹{team.purse.toLocaleString()}</td>
                    <td className="px-4 py-3 text-green-600 dark:text-green-400 font-medium">₹{team.remainingPurse.toLocaleString()}</td>
                    <td className="px-4 py-3 text-red-500">₹{(team.purse - team.remainingPurse).toLocaleString()}</td>
                    {user?.role === 'admin' && (
                      <td className="px-4 py-3">
                        <div className="flex gap-3">
                          <button onClick={() => openEdit(team)} className="text-blue-600 dark:text-blue-400 hover:underline text-xs font-medium">Edit</button>
                          <button onClick={() => handleDelete(team)} className="text-red-600 hover:underline text-xs font-medium">Delete</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{editing ? 'Edit Team' : 'Create New Team'}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Team Name *</label>
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="e.g. Mumbai Indians" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Total Purse (₹) *</label>
                <input required type="number" value={form.purse} onChange={e => setForm({ ...form, purse: e.target.value })}
                  className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
              {editing && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Remaining Purse (₹)</label>
                  <input type="number" value={form.remainingPurse} onChange={e => setForm({ ...form, remainingPurse: e.target.value })}
                    className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                </div>
              )}
              {!editing && (
                <>
                  <hr className="my-2 border-gray-200 dark:border-gray-600" />
                  <p className="text-xs text-gray-500 dark:text-gray-400">Optional: Create Team Manager account</p>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Manager Name</label>
                    <input value={form.managerName} onChange={e => setForm({ ...form, managerName: e.target.value })}
                      className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Manager Email</label>
                    <input type="email" value={form.managerEmail} onChange={e => setForm({ ...form, managerEmail: e.target.value })}
                      className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Manager Password</label>
                    <input type="password" value={form.managerPassword} onChange={e => setForm({ ...form, managerPassword: e.target.value })}
                      className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                  </div>
                </>
              )}
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium">
                  {editing ? 'Save Changes' : 'Create Team'}
                </button>
                <button type="button" onClick={() => { setShowModal(false); setEditing(null); }}
                  className="flex-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white py-2 rounded-lg">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
