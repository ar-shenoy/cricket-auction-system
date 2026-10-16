import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import AppShell from '../components/AppShell';

interface Team {
  id: string;
  name: string;
  purse: number;
  remainingPurse: number;
  maxPlayers?: number | null;
  logoUrl?: string;
}

export default function Teams() {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [form, setForm] = useState({
    name: '', purse: '10000000', remainingPurse: '', maxPlayers: '15',
    logoUrl: '', managerName: '', managerEmail: '', managerPassword: ''
  });

  const loadTeams = () => {
    setLoading(true);
    api.get('/teams').then(r => setTeams(r.data)).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { loadTeams(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', purse: '10000000', remainingPurse: '', maxPlayers: '15', logoUrl: '', managerName: '', managerEmail: '', managerPassword: '' });
    setShowModal(true);
  };
  const openEdit = (team: Team) => {
    setEditing(team);
    setForm({
      name: team.name, purse: String(team.purse), remainingPurse: String(team.remainingPurse),
      maxPlayers: team.maxPlayers != null ? String(team.maxPlayers) : '', logoUrl: team.logoUrl || '',
      managerName: '', managerEmail: '', managerPassword: ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const maxPlayers = form.maxPlayers !== '' ? Number(form.maxPlayers) : null;
      if (editing) {
        await api.put(`/teams/${editing.id}`, {
          name: form.name, purse: Number(form.purse),
          remainingPurse: form.remainingPurse !== '' ? Number(form.remainingPurse) : undefined,
          maxPlayers, logoUrl: form.logoUrl || ''
        });
      } else {
        await api.post('/teams', {
          name: form.name, purse: Number(form.purse), maxPlayers, logoUrl: form.logoUrl || '',
          managerName: form.managerName || undefined, managerEmail: form.managerEmail || undefined,
          managerPassword: form.managerPassword || undefined
        });
      }
      setShowModal(false);
      loadTeams();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save team');
    }
  };

  const handleDelete = async (team: Team) => {
    if (!confirm(`Delete team "${team.name}"?`)) return;
    try {
      await api.delete(`/teams/${team.id}`);
      loadTeams();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post('/teams/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data);
      loadTeams();
    } catch (err: any) {
      setImportResult({ error: err.response?.data?.error || 'Import failed' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) { alert('Image must be under 1.5 MB'); return; }
    setUploadingLogo(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post('/upload/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm(prev => ({ ...prev, logoUrl: res.data.url }));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploadingLogo(false);
      if (logoFileRef.current) logoFileRef.current.value = '';
    }
  };

  const inputCls = 'w-full border border-gray-300 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-950 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <AppShell title="Teams">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <p className="text-gray-500 dark:text-slate-400 text-sm">Manage teams, purses, logos, and squad limits.</p>
        {user?.role === 'admin' && (
          <div className="flex gap-2">
            <button type="button" onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium">+ Create Team</button>
            <label className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-sm font-medium cursor-pointer">
              {importing ? 'Importing…' : 'Import CSV'}
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} className="hidden" disabled={importing} />
            </label>
          </div>
        )}
      </div>

      {importResult && (
        <div className={`mb-4 p-4 rounded-xl text-sm ${importResult.error ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'}`}>
          {importResult.error || `Imported ${importResult.imported} teams (skipped ${importResult.skipped})`}
          <button type="button" onClick={() => setImportResult(null)} className="ml-3 underline text-xs">Dismiss</button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-500">Loading…</div>
        ) : teams.length === 0 ? (
          <div className="p-10 text-center text-gray-500">No teams yet. Create or import CSV.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-slate-950/80 border-b border-gray-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-500 dark:text-slate-400">Team</th>
                <th className="px-4 py-3 font-medium text-gray-500 dark:text-slate-400">Purse</th>
                <th className="px-4 py-3 font-medium text-gray-500 dark:text-slate-400">Remaining</th>
                <th className="px-4 py-3 font-medium text-gray-500 dark:text-slate-400">Max</th>
                <th className="px-4 py-3 font-medium text-gray-500 dark:text-slate-400">Spent</th>
                {user?.role === 'admin' && <th className="px-4 py-3 font-medium text-gray-500 dark:text-slate-400">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {teams.map(team => (
                <tr key={team.id} className="border-b border-gray-100 dark:border-slate-800 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      {team.logoUrl ? <img src={team.logoUrl} alt="" className="w-8 h-8 rounded-full object-cover" /> : <span>🏏</span>}
                      {team.name}
                    </div>
                  </td>
                  <td className="px-4 py-3">₹{team.purse.toLocaleString()}</td>
                  <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 font-medium">₹{team.remainingPurse.toLocaleString()}</td>
                  <td className="px-4 py-3">{team.maxPlayers ?? '—'}</td>
                  <td className="px-4 py-3 text-red-500">₹{(team.purse - team.remainingPurse).toLocaleString()}</td>
                  {user?.role === 'admin' && (
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => openEdit(team)} className="text-indigo-600 dark:text-indigo-400 text-xs font-medium mr-3 hover:underline">Edit</button>
                      <button type="button" onClick={() => handleDelete(team)} className="text-red-500 text-xs font-medium hover:underline">Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{editing ? 'Edit Team' : 'Create Team'}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-slate-300">Team name *</label>
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-slate-300">Total purse (₹) *</label>
                <input required type="number" value={form.purse} onChange={e => setForm({ ...form, purse: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-slate-300">Max players</label>
                <input type="number" min={1} value={form.maxPlayers} onChange={e => setForm({ ...form, maxPlayers: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-slate-300">Logo</label>
                <div className="flex flex-wrap gap-2">
                  <input type="url" value={form.logoUrl} onChange={e => setForm({ ...form, logoUrl: e.target.value })} className={inputCls} placeholder="URL or upload" />
                  <label className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 text-sm cursor-pointer">
                    {uploadingLogo ? '…' : 'Upload'}
                    <input ref={logoFileRef} type="file" accept="image/*" onChange={handleLogoFile} className="hidden" />
                  </label>
                </div>
              </div>
              {editing && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-slate-300">Remaining purse</label>
                  <input type="number" value={form.remainingPurse} onChange={e => setForm({ ...form, remainingPurse: e.target.value })} className={inputCls} />
                </div>
              )}
              {!editing && (
                <>
                  <p className="text-xs text-gray-500 pt-2">Optional manager account</p>
                  <input placeholder="Manager name" value={form.managerName} onChange={e => setForm({ ...form, managerName: e.target.value })} className={inputCls} />
                  <input placeholder="Manager email" type="email" value={form.managerEmail} onChange={e => setForm({ ...form, managerEmail: e.target.value })} className={inputCls} />
                  <input placeholder="Manager password" type="password" value={form.managerPassword} onChange={e => setForm({ ...form, managerPassword: e.target.value })} className={inputCls} />
                </>
              )}
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl font-medium">{editing ? 'Save' : 'Create'}</button>
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 border border-gray-300 dark:border-slate-600 py-2.5 rounded-xl">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
