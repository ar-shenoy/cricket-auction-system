import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

interface Player {
  id: string;
  name: string;
  mobile: string;
  email: string;
  role: string;
  battingStyle: string;
  bowlingStyle: string;
  age: number | null;
  city: string;
  bio: string;
  basePrice: number;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Sold' | 'Unsold';
  createdAt: string;
}

interface Summary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  sold: number;
  unsold: number;
  byRole: Record<string, number>;
}

export default function Players() {
  const { user, logout } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form for adding single player
  const [form, setForm] = useState({
    name: '', mobile: '', email: '', role: 'All-rounder',
    battingStyle: '', bowlingStyle: '', age: '', city: '', bio: '', basePrice: ''
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filter !== 'all') params.status = filter;
      if (search) params.search = search;

      const [playersRes, summaryRes] = await Promise.all([
        api.get('/players', { params }),
        api.get('/players/stats/summary')
      ]);
      setPlayers(playersRes.data);
      setSummary(summaryRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await api.patch(`/players/${id}/status`, { status });
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update status');
    }
  };

  const handleBulkApprove = async () => {
    if (selected.length === 0) return;
    try {
      await api.post('/players/bulk-approve', { ids: selected });
      setSelected([]);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Bulk approve failed');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/players/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setImportResult(res.data);
      loadData();
    } catch (err: any) {
      setImportResult({ error: err.response?.data?.error || 'Import failed' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/players', {
        ...form,
        age: form.age ? Number(form.age) : null,
        basePrice: form.basePrice ? Number(form.basePrice) : 0
      });
      setShowAddModal(false);
      setForm({ name: '', mobile: '', email: '', role: 'All-rounder', battingStyle: '', bowlingStyle: '', age: '', city: '', bio: '', basePrice: '' });
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to add player');
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'Pending': return 'bg-yellow-100 text-yellow-800';
      case 'Approved': return 'bg-green-100 text-green-800';
      case 'Rejected': return 'bg-red-100 text-red-800';
      case 'Sold': return 'bg-blue-100 text-blue-800';
      case 'Unsold': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-gray-500 hover:text-gray-700">← Dashboard</Link>
            <h1 className="text-xl font-bold text-gray-900">Players</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{user?.name}</span>
            <button onClick={logout} className="text-sm text-red-600 hover:text-red-700">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <div className="bg-white rounded-lg p-4 border text-center">
              <div className="text-2xl font-bold text-gray-900">{summary.total}</div>
              <div className="text-xs text-gray-500">Total</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200 text-center">
              <div className="text-2xl font-bold text-yellow-700">{summary.pending}</div>
              <div className="text-xs text-yellow-600">Pending</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 border border-green-200 text-center">
              <div className="text-2xl font-bold text-green-700">{summary.approved}</div>
              <div className="text-xs text-green-600">Approved</div>
            </div>
            <div className="bg-red-50 rounded-lg p-4 border border-red-200 text-center">
              <div className="text-2xl font-bold text-red-700">{summary.rejected}</div>
              <div className="text-xs text-red-600">Rejected</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 text-center">
              <div className="text-2xl font-bold text-blue-700">{summary.sold}</div>
              <div className="text-xs text-blue-600">Sold</div>
            </div>
            <div className="bg-gray-100 rounded-lg p-4 border text-center">
              <div className="text-2xl font-bold text-gray-700">{summary.unsold}</div>
              <div className="text-xs text-gray-500">Unsold</div>
            </div>
          </div>
        )}

        {/* Actions Bar */}
        <div className="bg-white rounded-xl shadow-sm border p-4 mb-6 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            {/* Filter */}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="all">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Sold">Sold</option>
              <option value="Unsold">Unsold</option>
            </select>

            {/* Search */}
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name / mobile / city..."
                className="border rounded-lg px-3 py-2 text-sm w-48 focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <button type="submit" className="bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg text-sm">Search</button>
            </form>
          </div>

          <div className="flex flex-wrap gap-2">
            {selected.length > 0 && (
              <button
                onClick={handleBulkApprove}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                Approve Selected ({selected.length})
              </button>
            )}

            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              + Add Player
            </button>

            <label className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer">
              {importing ? 'Importing...' : '📥 Import CSV'}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleImport}
                className="hidden"
                disabled={importing}
              />
            </label>
          </div>
        </div>

        {/* Import Result */}
        {importResult && (
          <div className={`mb-4 p-4 rounded-lg ${importResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {importResult.error ? (
              <p>{importResult.error}</p>
            ) : (
              <p>
                ✅ Imported: <strong>{importResult.imported}</strong> players &nbsp;|&nbsp;
                Skipped: <strong>{importResult.skipped}</strong>
              </p>
            )}
            <button onClick={() => setImportResult(null)} className="text-xs underline mt-1">Dismiss</button>
          </div>
        )}

        {/* Players Table */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading players...</div>
          ) : players.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No players found. Import a CSV from Google Form or add manually.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.length === players.filter(p => p.status === 'Pending').length && selected.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelected(players.filter(p => p.status === 'Pending').map(p => p.id));
                          } else {
                            setSelected([]);
                          }
                        }}
                      />
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600">Name</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Role</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Mobile</th>
                    <th className="px-4 py-3 font-medium text-gray-600">City</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Base Price</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map(player => (
                    <tr key={player.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        {player.status === 'Pending' && (
                          <input
                            type="checkbox"
                            checked={selected.includes(player.id)}
                            onChange={() => toggleSelect(player.id)}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{player.name}</td>
                      <td className="px-4 py-3">{player.role}</td>
                      <td className="px-4 py-3 text-gray-600">{player.mobile || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{player.city || '—'}</td>
                      <td className="px-4 py-3">₹{player.basePrice?.toLocaleString() || 0}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(player.status)}`}>
                          {player.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {player.status === 'Pending' && (
                            <>
                              <button
                                onClick={() => handleStatusChange(player.id, 'Approved')}
                                className="text-green-600 hover:text-green-800 text-xs font-medium"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleStatusChange(player.id, 'Rejected')}
                                className="text-red-600 hover:text-red-800 text-xs font-medium"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {player.status === 'Approved' && (
                            <button
                              onClick={() => handleStatusChange(player.id, 'Pending')}
                              className="text-gray-500 hover:text-gray-700 text-xs"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Help text for CSV */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <strong>Hybrid Import Tip:</strong> Create a Google Form with fields like Name, Mobile, Role, City, Age, Bio etc.
          Download responses as CSV → Click “Import CSV” above. The system auto-maps common column names.
        </div>
      </main>

      {/* Add Player Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-bold mb-4">Add New Player</h2>
            <form onSubmit={handleAddPlayer} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Mobile</label>
                  <input value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Role *</label>
                  <select value={form.role} onChange={e => setForm({...form, role: e.target.value})} className="w-full border rounded-lg px-3 py-2">
                    <option>Batsman</option>
                    <option>Bowler</option>
                    <option>All-rounder</option>
                    <option>Wicket-keeper</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">City</label>
                  <input value={form.city} onChange={e => setForm({...form, city: e.target.value})} className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Base Price</label>
                  <input type="number" value={form.basePrice} onChange={e => setForm({...form, basePrice: e.target.value})} className="w-full border rounded-lg px-3 py-2" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Bio / Experience</label>
                <textarea value={form.bio} onChange={e => setForm({...form, bio: e.target.value})} className="w-full border rounded-lg px-3 py-2" rows={2} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium">Add Player</button>
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 py-2 rounded-lg">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
