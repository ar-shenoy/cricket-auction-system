import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import AppShell from '../components/AppShell';

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
  photoUrl?: string;
  status: string;
}

interface Summary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  sold: number;
  unsold: number;
}

const emptyForm = {
  name: '', mobile: '', email: '', role: 'All-rounder',
  battingStyle: '', bowlingStyle: '', age: '', city: '', bio: '', basePrice: '', photoUrl: ''
};

export default function Players() {
  const { user } = useAuth();
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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoFileRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => { setSelected([]); loadData(); }, [filter]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); loadData(); };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await api.patch(`/players/${id}/status`, { status });
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed');
    }
  };

  const handleBulkApprove = async () => {
    if (!selected.length) return;
    try {
      await api.post('/players/bulk-approve', { ids: selected });
      setSelected([]);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed');
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
      const res = await api.post('/players/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data);
      loadData();
    } catch (err: any) {
      setImportResult({ error: err.response?.data?.error || 'Import failed' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) { alert('Under 1.5 MB'); return; }
    setUploadingPhoto(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post('/upload/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm(prev => ({ ...prev, photoUrl: res.data.url }));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploadingPhoto(false);
      if (photoFileRef.current) photoFileRef.current.value = '';
    }
  };

  const openAdd = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (p: Player) => {
    setEditing(p);
    setForm({
      name: p.name, mobile: p.mobile || '', email: p.email || '', role: p.role,
      battingStyle: p.battingStyle || '', bowlingStyle: p.bowlingStyle || '',
      age: p.age != null ? String(p.age) : '', city: p.city || '', bio: p.bio || '',
      basePrice: p.basePrice != null ? String(p.basePrice) : '', photoUrl: p.photoUrl || ''
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...form, age: form.age ? Number(form.age) : null, basePrice: form.basePrice ? Number(form.basePrice) : 0 };
    try {
      if (editing) await api.put(`/players/${editing.id}`, payload);
      else await api.post('/players', payload);
      setShowModal(false);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Save failed');
    }
  };

  const handleDelete = async (p: Player) => {
    if (!confirm(`Delete "${p.name}"?`)) return;
    try {
      await api.delete(`/players/${p.id}`);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  };

  const allIds = players.map(p => p.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.includes(id));
  const toggleSelectAll = () => {
    if (allSelected) setSelected([]);
    else setSelected(allIds);
  };
  const toggleOne = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const selectedPendingCount = players.filter(p => selected.includes(p.id) && p.status === 'Pending').length;

  const handleBulkDelete = async () => {
    if (!selected.length) return;
    if (!confirm(`Delete ${selected.length} selected player(s)? This cannot be undone.`)) return;
    try {
      await api.post('/players/bulk-delete', { ids: selected });
      setSelected([]);
      loadData();
    } catch (err: any) {
      try {
        for (const id of selected) {
          await api.delete(`/players/${id}`);
        }
        setSelected([]);
        loadData();
      } catch (e2: any) {
        alert(e2.response?.data?.error || err.response?.data?.error || 'Bulk delete failed');
      }
    }
  };

  const statusStyle = (s: string): React.CSSProperties => {
    if (s === 'Pending') return { background: 'rgba(255,204,0,0.2)', color: '#ff9f0a' };
    if (s === 'Approved') return { background: 'rgba(48,209,88,0.2)', color: '#30d158' };
    if (s === 'Rejected') return { background: 'rgba(255,59,48,0.15)', color: '#ff3b30' };
    if (s === 'Sold') return { background: 'rgba(10,132,255,0.2)', color: 'var(--accent)' };
    return { background: 'var(--fill)', color: 'var(--text-2)' };
  };

  return (
    <AppShell title="Players">
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          {[['Total', summary.total], ['Pending', summary.pending], ['Approved', summary.approved], ['Rejected', summary.rejected], ['Sold', summary.sold], ['Unsold', summary.unsold]].map(([label, v]) => (
            <div key={String(label)} className="glass p-4 text-center">
              <div className="text-[24px] font-semibold" style={{ color: 'var(--text)' }}>{v}</div>
              <div className="text-[12px]" style={{ color: 'var(--text-2)' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="glass p-4 mb-4 flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <select value={filter} onChange={e => setFilter(e.target.value)} className="as-input w-auto">
            <option value="all">All status</option>
            {['Pending', 'Approved', 'Rejected', 'Sold', 'Unsold'].map(s => (<option key={s} value={s}>{s}</option>))}
          </select>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="as-input w-44" />
            <button type="submit" className="as-btn-ghost text-sm">Search</button>
          </form>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {players.length > 0 && (
            <button type="button" onClick={toggleSelectAll} className="as-btn-ghost text-sm">
              {allSelected ? 'Deselect all' : `Select all (${players.length})`}
            </button>
          )}
          {selected.length > 0 && (
            <>
              <span className="text-[13px]" style={{ color: 'var(--text-2)' }}>{selected.length} selected</span>
              {selectedPendingCount > 0 && (
                <button type="button" onClick={handleBulkApprove} className="as-btn-primary text-sm" style={{ background: '#30d158' }}>
                  Approve ({selectedPendingCount})
                </button>
              )}
              <button type="button" onClick={handleBulkDelete} className="as-btn-ghost text-sm" style={{ color: '#ff3b30' }}>
                Delete ({selected.length})
              </button>
              <button type="button" onClick={() => setSelected([])} className="as-btn-ghost text-sm">Clear</button>
            </>
          )}
          {user?.role === 'admin' && (
            <>
              <button type="button" onClick={openAdd} className="as-btn-primary text-sm">+ Add</button>
              <label className="as-btn-ghost text-sm cursor-pointer">
                {importing ? '…' : 'Import CSV'}
                <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} className="hidden" disabled={importing} />
              </label>
            </>
          )}
        </div>
      </div>

      {importResult && (
        <div className="glass p-4 mb-4 text-[14px]" style={{ color: importResult.error ? '#ff3b30' : '#30d158' }}>
          {importResult.error || `Imported ${importResult.imported}, skipped ${importResult.skipped}`}
          <button type="button" onClick={() => setImportResult(null)} className="ml-3 underline text-[12px]">Dismiss</button>
        </div>
      )}

      <div className="glass overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-[14px]" style={{ color: 'var(--text-2)' }}>Loading…</div>
        ) : players.length === 0 ? (
          <div className="p-10 text-center text-[14px]" style={{ color: 'var(--text-2)' }}>No players found.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} title="Select all" /></th>
                <th>Name</th><th>Role</th><th>Mobile</th><th>City</th><th>Base</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {players.map(p => (
                <tr key={p.id}>
                  <td><input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleOne(p.id)} /></td>
                  <td>
                    <div className="flex items-center gap-2 font-medium">
                      {p.photoUrl ? <img src={p.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover" /> : <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs" style={{ background: 'var(--fill)' }}>P</span>}
                      {p.name}
                    </div>
                  </td>
                  <td>{p.role}</td>
                  <td style={{ color: 'var(--text-2)' }}>{p.mobile || '—'}</td>
                  <td style={{ color: 'var(--text-2)' }}>{p.city || '—'}</td>
                  <td>₹{(p.basePrice || 0).toLocaleString()}</td>
                  <td><span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={statusStyle(p.status)}>{p.status}</span></td>
                  <td>
                    <div className="flex flex-wrap gap-2 text-[12px] font-medium">
                      {p.status === 'Pending' && (
                        <>
                          <button type="button" onClick={() => handleStatusChange(p.id, 'Approved')} style={{ color: '#30d158' }}>Approve</button>
                          <button type="button" onClick={() => handleStatusChange(p.id, 'Rejected')} style={{ color: '#ff3b30' }}>Reject</button>
                        </>
                      )}
                      <select value={p.status} onChange={e => handleStatusChange(p.id, e.target.value)} className="as-input !py-1 !px-2 text-[12px] w-auto">
                        {['Pending', 'Approved', 'Rejected', 'Sold', 'Unsold'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button type="button" onClick={() => openEdit(p)} style={{ color: 'var(--accent)' }}>Edit</button>
                      <button type="button" onClick={() => handleDelete(p)} style={{ color: '#ff3b30' }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(12px)' }}>
          <div className="glass-thick max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-[20px] font-semibold mb-4">{editing ? 'Edit player' : 'Add player'}</h2>
            <form onSubmit={handleSave} className="space-y-3">
              <div><label className="as-label">Name *</label><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="as-input" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="as-label">Mobile</label><input value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} className="as-input" /></div>
                <div><label className="as-label">Role</label><select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="as-input">{['Batsman', 'Bowler', 'All-rounder', 'Wicket-keeper'].map(r => <option key={r}>{r}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="as-label">City</label><input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="as-input" /></div>
                <div><label className="as-label">Base price</label><input type="number" value={form.basePrice} onChange={e => setForm({ ...form, basePrice: e.target.value })} className="as-input" /></div>
              </div>
              <div>
                <label className="as-label">Photo</label>
                <div className="flex gap-2">
                  <input type="url" value={form.photoUrl} onChange={e => setForm({ ...form, photoUrl: e.target.value })} className="as-input" placeholder="URL or upload" />
                  <label className="as-btn-ghost text-sm cursor-pointer !px-3">{uploadingPhoto ? '…' : 'Upload'}<input ref={photoFileRef} type="file" accept="image/*" onChange={handlePhotoFile} className="hidden" /></label>
                </div>
              </div>
              <div><label className="as-label">Bio</label><textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} className="as-input" rows={2} /></div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="as-btn-primary flex-1">{editing ? 'Save' : 'Add'}</button>
                <button type="button" onClick={() => setShowModal(false)} className="as-btn-ghost flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
