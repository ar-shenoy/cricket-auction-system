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
  tags?: string[];
  notes?: string;
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
  battingStyle: '', bowlingStyle: '', age: '', city: '', bio: '', notes: '', tags: '', basePrice: '', photoUrl: ''
};

export default function Players() {
  const { user } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkBasePrice, setBulkBasePrice] = useState('');
  const [bulkRole, setBulkRole] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
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
      setPlayers(playersRes.data || []);
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

  const handleBulkUpdate = async (fields: { basePrice?: string; role?: string; status?: string }) => {
    if (!selected.length) return;
    const payload: any = { ids: selected };
    if (fields.basePrice !== undefined && fields.basePrice !== '') payload.basePrice = Number(fields.basePrice);
    if (fields.role) payload.role = fields.role;
    if (fields.status) payload.status = fields.status;
    if (payload.basePrice === undefined && !payload.role && !payload.status) {
      alert('Set a base price, role, or status first');
      return;
    }
    setBulkBusy(true);
    try {
      const res = await api.post('/players/bulk-update', payload);
      setSelected([]);
      setBulkBasePrice('');
      setBulkRole('');
      loadData();
      alert(`Updated ${res.data.updated || selected.length} player(s)`);
    } catch (err: any) {
      try {
        let n = 0;
        for (const id of selected) {
          const body: any = {};
          if (payload.basePrice !== undefined) body.basePrice = payload.basePrice;
          if (payload.role) body.role = payload.role;
          if (payload.status) body.status = payload.status;
          await api.put(`/players/${id}`, body);
          n++;
        }
        setSelected([]);
        setBulkBasePrice('');
        setBulkRole('');
        loadData();
        alert(`Updated ${n} player(s)`);
      } catch (e2: any) {
        alert(e2.response?.data?.error || err.response?.data?.error || 'Bulk update failed');
      }
    } finally {
      setBulkBusy(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>, dry = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const url = dry ? '/players/import?dryRun=1' : '/players/import';
      const res = await api.post(url, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult({ ...res.data, dryRun: dry });
      if (!dry) loadData();
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
      notes: p.notes || '', tags: Array.isArray(p.tags) ? p.tags.join(', ') : '',
      basePrice: p.basePrice != null ? String(p.basePrice) : '', photoUrl: p.photoUrl || ''
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      age: form.age ? Number(form.age) : null,
      basePrice: form.basePrice ? Number(form.basePrice) : 0,
      notes: form.notes || '',
      tags: form.tags || ''
    };
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

  const handleMergeDuplicates = async () => {
    try {
      const r = await api.get('/players/duplicate-names');
      if (!r.data?.count) { alert('No duplicate names found'); return; }
      const msg = (r.data.groups || []).slice(0, 8).map((g: any) => `${g.name} (${g.count})`).join('\n');
      if (!confirm(`Found ${r.data.count} duplicate groups:\n${msg}\n\nMerge each group keeping the first?`)) return;
      for (const g of r.data.groups || []) {
        const sorted = g.players || [];
        if (sorted.length < 2) continue;
        const keepId = sorted[0].id;
        const mergeIds = sorted.slice(1).map((x: any) => x.id);
        await api.post('/players/merge-duplicates', { keepId, mergeIds });
      }
      alert('Merged');
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Merge failed');
    }
  };

  const allIds = players.map(p => p.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.includes(id));
  const toggleSelectAll = () => setSelected(allSelected ? [] : allIds);
  const toggleOne = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const selectedPendingCount = players.filter(p => selected.includes(p.id) && p.status === 'Pending').length;

  const handleBulkDelete = async () => {
    if (!selected.length) return;
    if (!confirm(`Delete ${selected.length} selected player(s)?`)) return;
    try {
      await api.post('/players/bulk-delete', { ids: selected });
      setSelected([]);
      loadData();
    } catch (err: any) {
      try {
        for (const id of selected) await api.delete(`/players/${id}`);
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
                <button type="button" onClick={handleBulkApprove} className="as-btn-primary text-sm" style={{ background: '#30d158' }} disabled={bulkBusy}>Approve ({selectedPendingCount})</button>
              )}
              <button type="button" onClick={() => handleBulkUpdate({ status: 'Approved' })} className="as-btn-ghost text-sm" disabled={bulkBusy}>Mark approved</button>
              <button type="button" onClick={() => handleBulkUpdate({ status: 'Rejected' })} className="as-btn-ghost text-sm" disabled={bulkBusy}>Reject</button>
              <input type="number" min={0} value={bulkBasePrice} onChange={e => setBulkBasePrice(e.target.value)} placeholder="Base" className="as-input w-24 text-sm" style={{ padding: '0.4rem 0.6rem' }} />
              <button type="button" disabled={bulkBusy || bulkBasePrice === ''} onClick={() => handleBulkUpdate({ basePrice: bulkBasePrice })} className="as-btn-primary text-sm">Set base</button>
              <select value={bulkRole} onChange={e => setBulkRole(e.target.value)} className="as-input w-auto text-sm" style={{ padding: '0.4rem 0.6rem' }}>
                <option value="">Role…</option>
                {['Batsman','Bowler','All-rounder','Wicket-keeper'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <button type="button" disabled={bulkBusy || !bulkRole} onClick={() => handleBulkUpdate({ role: bulkRole })} className="as-btn-ghost text-sm">Set role</button>
              <button type="button" onClick={handleBulkDelete} className="as-btn-ghost text-sm" style={{ color: '#ff3b30' }} disabled={bulkBusy}>Delete</button>
              <button type="button" onClick={() => setSelected([])} className="as-btn-ghost text-sm">Clear</button>
            </>
          )}
          {(user?.role === 'admin' || user?.role === 'developer') && (
            <>
              <button type="button" onClick={openAdd} className="as-btn-primary text-sm">+ Add</button>
              <label className="as-btn-ghost text-sm cursor-pointer">
                {importing ? '…' : 'Import CSV'}
                <input ref={fileInputRef} type="file" accept=".csv" onChange={e => handleImport(e, false)} className="hidden" disabled={importing} />
              </label>
              <button type="button" onClick={handleMergeDuplicates} className="as-btn-ghost text-sm">Merge duplicates</button>
            </>
          )}
        </div>
      </div>

      {importResult && (
        <div className="glass p-4 mb-4 text-[14px]" style={{ color: importResult.error ? '#ff3b30' : '#30d158' }}>
          {importResult.error || (importResult.dryRun
            ? `Dry-run: would create ${importResult.imported ?? importResult.wouldCreate ?? 0}, skip ${importResult.skipped ?? 0}`
            : `Imported ${importResult.imported}, skipped ${importResult.skipped}`)}
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
                      <span>
                        {p.name}
                        {Array.isArray(p.tags) && p.tags.length > 0 && (
                          <span className="ml-2 text-[11px] font-normal" style={{ color: 'var(--text-2)' }}>
                            {p.tags.map(t => <span key={t} className="mr-1 px-1.5 py-0.5 rounded" style={{ background: 'var(--fill)' }}>{t}</span>)}
                          </span>
                        )}
                      </span>
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
                <label className="as-label">Tags</label>
                <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} className="as-input" placeholder="capped, local, set-a" />
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-2)' }}>Comma-separated. Use set-a / set-b for multi-set pools.</p>
              </div>
              <div>
                <label className="as-label">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="as-input" rows={2} placeholder="Private scouting notes" />
              </div>
              <div>
                <label className="as-label">Photo</label>
                <div className="flex gap-2 items-center">
                  {form.photoUrl ? <img src={form.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover" /> : null}
                  <button type="button" className="as-btn-ghost text-sm" onClick={() => photoFileRef.current?.click()} disabled={uploadingPhoto}>{uploadingPhoto ? '…' : 'Upload'}</button>
                  <input ref={photoFileRef} type="file" accept="image/*" onChange={handlePhotoFile} className="hidden" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="as-btn-primary flex-1">{editing ? 'Save' : 'Create'}</button>
                <button type="button" onClick={() => setShowModal(false)} className="as-btn-ghost flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
