import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import ThemeToggle from '../components/ThemeToggle';

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

const emptyForm = {
  name: '', mobile: '', email: '', role: 'All-rounder',
  battingStyle: '', bowlingStyle: '', age: '', city: '', bio: '', basePrice: ''
};

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
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Player | null>(null);
  const [form, setForm] = useState(emptyForm);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => { loadData(); }, [filter]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); loadData(); };

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
      const res = await api.post('/players/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data);
      loadData();
    } catch (err: any) {
      setImportResult({ error: err.response?.data?.error || 'Import failed' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (p: Player) => {
    setEditing(p);
    setForm({
      name: p.name,
      mobile: p.mobile || '',
      email: p.email || '',
      role: p.role,
      battingStyle: p.battingStyle || '',
      bowlingStyle: p.bowlingStyle || '',
      age: p.age != null ? String(p.age) : '',
      city: p.city || '',
      bio: p.bio || '',
      basePrice: p.basePrice != null ? String(p.basePrice) : ''
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      age: form.age ? Number(form.age) : null,
      basePrice: form.basePrice ? Number(form.basePrice) : 0
    };
    try {
      if (editing) {
        await api.put(`/players/${editing.id}`, payload);
      } else {
        await api.post('/players', payload);
      }
      setShowModal(false);
      setEditing(null);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save player');
    }
  };

  const handleDelete = async (p: Player) => {
    if (!confirm(`Delete player "${p.name}"?${p.status === 'Sold' ? ' Any sale record will be removed and purse refunded.' : ''}`)) return;
    try {
      await api.delete(`/players/${p.id}`);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete');
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const pendingIds = players.filter(p => p.status === 'Pending').map(p => p.id);
  const allPendingSelected = pendingIds.length > 0 && pendingIds.every(id => selected.includes(id));

  const selectAllPending = () => {
    if (allPendingSelected) {
      setSelected(prev => prev.filter(id => !pendingIds.includes(id)));
    } else {
      setSelected(prev => Array.from(new Set([...prev, ...pendingIds])));
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'Pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
      case 'Approved': return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
      case 'Rejected': return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
      case 'Sold': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
      case 'Unsold': return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const inputCls = 'w-full border dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">← Dashboard</Link>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Players</h1>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span className="text-sm text-gray-600 dark:text-gray-300">{user?.name}</span>
            <button onClick={logout} className="text-sm text-red-600 hover:text-red-700">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {[
              { label: 'Total', v: summary.total, cls: 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white' },
              { label: 'Pending', v: summary.pending, cls: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800' },
              { label: 'Approved', v: summary.approved, cls: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800' },
              { label: 'Rejected', v: summary.rejected, cls: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800' },
              { label: 'Sold', v: summary.sold, cls: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
              { label: 'Unsold', v: summary.unsold, cls: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300' },
            ].map(c => (
              <div key={c.label} className={`rounded-lg p-4 border dark:border-gray-700 text-center ${c.cls}`}>
                <div className="text-2xl font-bold">{c.v}</div>
                <div className="text-xs opacity-80">{c.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-4 mb-6 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className={inputCls + ' w-auto'}>
              <option value="all">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Sold">Sold</option>
              <option value="Unsold">Unsold</option>
            </select>
            <form onSubmit={handleSearch} className="flex gap-2">
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name / mobile / city..." className={inputCls + ' w-48'} />
              <button type="submit" className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white px-3 py-2 rounded-lg text-sm">Search</button>
            </form>
          </div>
          <div className="flex flex-wrap gap-2">
            {pendingIds.length > 0 && (
              <button onClick={selectAllPending} className="bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-white px-4 py-2 rounded-lg text-sm font-medium">
                {allPendingSelected ? 'Deselect all' : `Select all pending (${pendingIds.length})`}
              </button>
            )}
            {selected.length > 0 && (
              <button onClick={handleBulkApprove} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                Approve Selected ({selected.length})
              </button>
            )}
            <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Add Player</button>
            <label className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer">
              {importing ? 'Importing...' : '📥 Import CSV'}
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} className="hidden" disabled={importing} />
            </label>
          </div>
        </div>

        {importResult && (
          <div className={`mb-4 p-4 rounded-lg ${importResult.error ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'}`}>
            {importResult.error ? <p>{importResult.error}</p> : (
              <p>✅ Imported: <strong>{importResult.imported}</strong> | Skipped: <strong>{importResult.skipped}</strong></p>
            )}
            <button onClick={() => setImportResult(null)} className="text-xs underline mt-1">Dismiss</button>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading players...</div>
          ) : players.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">No players found. Import CSV or add manually.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3">
                      {pendingIds.length > 0 && (
                        <input
                          type="checkbox"
                          checked={allPendingSelected}
                          onChange={selectAllPending}
                          title="Select all pending"
                        />
                      )}
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Name</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Role</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Mobile</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">City</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Base</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Status</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map(player => (
                    <tr key={player.id} className="border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3">
                        {player.status === 'Pending' && (
                          <input type="checkbox" checked={selected.includes(player.id)} onChange={() => toggleSelect(player.id)} />
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{player.name}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{player.role}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{player.mobile || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{player.city || '—'}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">₹{player.basePrice?.toLocaleString() || 0}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(player.status)}`}>{player.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2 items-center">
                          {player.status === 'Pending' && (
                            <>
                              <button onClick={() => handleStatusChange(player.id, 'Approved')} className="text-green-600 dark:text-green-400 text-xs font-medium">Approve</button>
                              <button onClick={() => handleStatusChange(player.id, 'Rejected')} className="text-red-600 text-xs font-medium">Reject</button>
                            </>
                          )}
                          <select
                            value={player.status}
                            onChange={e => handleStatusChange(player.id, e.target.value)}
                            className="text-xs border dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            title="Change status"
                          >
                            <option value="Pending">Pending</option>
                            <option value="Approved">Approved</option>
                            <option value="Rejected">Rejected</option>
                            <option value="Sold">Sold</option>
                            <option value="Unsold">Unsold</option>
                          </select>
                          <button onClick={() => openEdit(player)} className="text-blue-600 dark:text-blue-400 text-xs font-medium">Edit</button>
                          <button onClick={() => handleDelete(player)} className="text-red-600 text-xs font-medium">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm text-blue-800 dark:text-blue-300">
          <strong>Hybrid Import:</strong> Google Form → CSV → Import. Columns like Name, Mobile, Role, City, Age, Bio are auto-mapped.
        </div>
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{editing ? 'Edit Player' : 'Add New Player'}</h2>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Name *</label>
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Mobile</label>
                  <input value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Role *</label>
                  <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className={inputCls}>
                    <option>Batsman</option><option>Bowler</option><option>All-rounder</option><option>Wicket-keeper</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">City</label>
                  <input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Base Price</label>
                  <input type="number" value={form.basePrice} onChange={e => setForm({ ...form, basePrice: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Bio / Experience</label>
                <textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} className={inputCls} rows={2} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium">{editing ? 'Save' : 'Add Player'}</button>
                <button type="button" onClick={() => { setShowModal(false); setEditing(null); }} className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white py-2 rounded-lg">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
