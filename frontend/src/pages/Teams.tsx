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
  const isAdmin = user?.role === 'admin' || user?.role === 'developer';
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const cropImgRef = useRef<HTMLImageElement>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [editing, setEditing] = useState<Team | null>(null);
  const [form, setForm] = useState({
    name: '', purse: '10000000', remainingPurse: '', maxPlayers: '15',
    logoUrl: '', managerName: '', managerEmail: '', managerPassword: ''
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkPurse, setBulkPurse] = useState('');
  const [bulkMaxPlayers, setBulkMaxPlayers] = useState('');

  const loadTeams = (soft = false) => {
    if (!soft) setLoading(true);
    api.get('/teams')
      .then(r => setTeams(r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadTeams(); }, []);

  const allIds = teams.map(t => t.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.includes(id));
  const toggleSelectAll = () => setSelected(allSelected ? [] : allIds);
  const toggleOne = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

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
          maxPlayers, logoUrl: form.logoUrl || undefined
        });
      } else {
        await api.post('/teams', {
          name: form.name, purse: Number(form.purse), maxPlayers,
          logoUrl: form.logoUrl || undefined,
          managerName: form.managerName || undefined,
          managerEmail: form.managerEmail || undefined,
          managerPassword: form.managerPassword || undefined
        });
      }
      setShowModal(false);
      loadTeams(true);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Save failed');
    }
  };

  const handleDelete = async (team: Team) => {
    if (!confirm(`Delete team "${team.name}"?`)) return;
    try {
      await api.delete(`/teams/${team.id}`);
      setSelected(prev => prev.filter(id => id !== team.id));
      loadTeams(true);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete');
    }
  };

  const handleBulkDelete = async () => {
    if (!selected.length) return;
    if (!confirm(`Delete ${selected.length} selected team(s)? Teams with sold players cannot be deleted.`)) return;
    setBulkBusy(true);
    try {
      try {
        await api.post('/teams/bulk-delete', { ids: selected });
      } catch {
        for (const id of selected) {
          try { await api.delete(`/teams/${id}`); } catch { /* skip locked */ }
        }
      }
      setSelected([]);
      loadTeams(true);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Bulk delete failed');
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkUpdate = async (fields: { purse?: string; maxPlayers?: string }) => {
    if (!selected.length) return;
    const payload: any = { ids: selected };
    if (fields.purse !== undefined && fields.purse !== '') payload.purse = Number(fields.purse);
    if (fields.maxPlayers !== undefined && fields.maxPlayers !== '') {
      payload.maxPlayers = fields.maxPlayers === 'null' ? null : Number(fields.maxPlayers);
    }
    if (payload.purse === undefined && payload.maxPlayers === undefined) return;
    setBulkBusy(true);
    try {
      try {
        await api.post('/teams/bulk-update', payload);
      } catch {
        for (const id of selected) {
          const body: any = {};
          if (payload.purse !== undefined) body.purse = payload.purse;
          if (payload.maxPlayers !== undefined) body.maxPlayers = payload.maxPlayers;
          try { await api.put(`/teams/${id}`, body); } catch { /* skip */ }
        }
      }
      setBulkPurse('');
      setBulkMaxPlayers('');
      loadTeams(true);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Bulk update failed');
    } finally {
      setBulkBusy(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/teams/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data);
      loadTeams(true);
    } catch (err: any) {
      setImportResult({ error: err.response?.data?.error || 'Import failed' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(String(reader.result));
      setCropZoom(1);
    };
    reader.readAsDataURL(file);
    if (logoFileRef.current) logoFileRef.current.value = '';
  };

  const applyLogoCrop = async () => {
    if (!cropSrc || !cropImgRef.current) return;
    setUploadingLogo(true);
    try {
      const img = cropImgRef.current;
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const scale = Math.max(size / iw, size / ih) * cropZoom;
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('crop failed'))), 'image/jpeg', 0.9)
      );
      const fd = new FormData();
      // Backend expects field name "file" (multer.single('file'))
      fd.append('file', blob, 'logo.jpg');
      const res = await api.post('/upload/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = res.data?.url || res.data?.path || '';
      setForm(f => ({ ...f, logoUrl: url }));
      setCropSrc(null);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Logo upload failed');
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <AppShell title="Teams">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
        <p className="text-[14px]" style={{ color: 'var(--text-2)' }}>Purses, logos, and squad limits.</p>
        {isAdmin && (
          <div className="flex gap-2">
            <button type="button" onClick={openCreate} className="as-btn-primary text-sm">+ Create</button>
            <label className="as-btn-ghost text-sm cursor-pointer">
              {importing ? '…' : 'Import CSV'}
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} className="hidden" disabled={importing} />
            </label>
          </div>
        )}
      </div>

      {importResult && (
        <div className="glass p-4 mb-4 text-[14px]" style={{ color: importResult.error ? '#ff3b30' : '#30d158' }}>
          {importResult.error || (
            <>
              Imported {importResult.imported}, skipped {importResult.skipped}
              {Array.isArray(importResult.errors) && importResult.errors.length > 0 && (
                <ul className="mt-2 text-[12px] space-y-0.5" style={{ color: 'var(--text-2)' }}>
                  {importResult.errors.slice(0, 8).map((e: any, i: number) => (
                    <li key={i}>{e.row ? `${e.row}: ` : ''}{e.reason}</li>
                  ))}
                </ul>
              )}
            </>
          )}
          <button type="button" onClick={() => setImportResult(null)} className="ml-3 underline text-[12px]">Dismiss</button>
        </div>
      )}

      {isAdmin && teams.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button type="button" onClick={toggleSelectAll} className="as-btn-ghost text-sm">
            {allSelected ? 'Deselect all' : `Select all (${teams.length})`}
          </button>
          {selected.length > 0 && (
            <>
              <span className="text-[13px]" style={{ color: 'var(--text-2)' }}>{selected.length} selected</span>
              <input type="number" placeholder="Purse" value={bulkPurse} onChange={e => setBulkPurse(e.target.value)} className="as-input w-28 text-sm" style={{ padding: '0.4rem 0.6rem' }} />
              <button type="button" disabled={bulkBusy || bulkPurse === ''} onClick={() => handleBulkUpdate({ purse: bulkPurse })} className="as-btn-ghost text-sm">Set purse</button>
              <input type="number" placeholder="Max players" value={bulkMaxPlayers} onChange={e => setBulkMaxPlayers(e.target.value)} className="as-input w-28 text-sm" style={{ padding: '0.4rem 0.6rem' }} />
              <button type="button" disabled={bulkBusy || bulkMaxPlayers === ''} onClick={() => handleBulkUpdate({ maxPlayers: bulkMaxPlayers })} className="as-btn-ghost text-sm">Set max</button>
              <button type="button" onClick={handleBulkDelete} className="as-btn-ghost text-sm" style={{ color: '#ff3b30' }} disabled={bulkBusy}>Delete ({selected.length})</button>
            </>
          )}
        </div>
      )}

      <div className="glass overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-[14px]" style={{ color: 'var(--text-2)' }}>Loading…</div>
        ) : teams.length === 0 ? (
          <div className="p-10 text-center text-[14px]" style={{ color: 'var(--text-2)' }}>No teams yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                {isAdmin && <th><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} title="Select all" /></th>}
                <th>Team</th>
                <th>Purse</th>
                <th>Remaining</th>
                <th>Max</th>
                <th>Spent</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {teams.map(team => (
                <tr key={team.id}>
                  {isAdmin && (
                    <td><input type="checkbox" checked={selected.includes(team.id)} onChange={() => toggleOne(team.id)} /></td>
                  )}
                  <td>
                    <div className="flex items-center gap-2">
                      {team.logoUrl ? (
                        <img src={team.logoUrl} alt="" className="w-8 h-8 rounded-lg object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <span className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold" style={{ background: 'var(--fill)' }}>
                          {(team.name || 'T').slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <span className="font-medium">{team.name}</span>
                    </div>
                  </td>
                  <td className="tabular-nums">₹{Number(team.purse || 0).toLocaleString()}</td>
                  <td className="tabular-nums">₹{Number(team.remainingPurse || 0).toLocaleString()}</td>
                  <td>{team.maxPlayers != null ? team.maxPlayers : '—'}</td>
                  <td className="tabular-nums">₹{Math.max(0, Number(team.purse || 0) - Number(team.remainingPurse || 0)).toLocaleString()}</td>
                  {isAdmin && (
                    <td>
                      <button type="button" onClick={() => openEdit(team)} className="text-[13px] font-medium mr-3" style={{ color: 'var(--accent)' }}>Edit</button>
                      <button type="button" onClick={() => handleDelete(team)} className="text-[13px] font-medium" style={{ color: '#ff3b30' }}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="glass p-5 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-[17px] mb-3">{editing ? 'Edit team' : 'Create team'}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input required placeholder="Team name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="as-input" />
              <input required type="number" placeholder="Purse" value={form.purse} onChange={e => setForm({ ...form, purse: e.target.value })} className="as-input" />
              {editing && (
                <input type="number" placeholder="Remaining purse" value={form.remainingPurse} onChange={e => setForm({ ...form, remainingPurse: e.target.value })} className="as-input" />
              )}
              <input type="number" placeholder="Max players (optional)" value={form.maxPlayers} onChange={e => setForm({ ...form, maxPlayers: e.target.value })} className="as-input" />
              <div className="space-y-2">
                <label className="text-[12px]" style={{ color: 'var(--text-2)' }}>Logo URL or upload</label>
                <input
                  type="url"
                  placeholder="https://… logo image URL"
                  value={form.logoUrl}
                  onChange={e => setForm({ ...form, logoUrl: e.target.value })}
                  className="as-input"
                />
                <div className="flex items-center gap-2">
                  {form.logoUrl ? (
                    <img src={form.logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover" onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3'; }} />
                  ) : (
                    <span className="w-10 h-10 rounded-lg flex items-center justify-center text-[11px]" style={{ background: 'var(--fill)' }}>Logo</span>
                  )}
                  <button type="button" className="as-btn-ghost text-sm" onClick={() => logoFileRef.current?.click()}>
                    Upload from device
                  </button>
                  <input ref={logoFileRef} type="file" accept="image/*" onChange={handleLogoFile} className="hidden" />
                </div>
              </div>
              {!editing && (
                <>
                  <div className="text-[12px] pt-1" style={{ color: 'var(--text-2)' }}>Optional manager account</div>
                  <input placeholder="Manager name" value={form.managerName} onChange={e => setForm({ ...form, managerName: e.target.value })} className="as-input" />
                  <input placeholder="Manager email" type="email" value={form.managerEmail} onChange={e => setForm({ ...form, managerEmail: e.target.value })} className="as-input" />
                  <input placeholder="Password" type="password" value={form.managerPassword} onChange={e => setForm({ ...form, managerPassword: e.target.value })} className="as-input" />
                </>
              )}
              <div className="flex gap-3 pt-2">
                <button type="submit" className="as-btn-primary flex-1">{editing ? 'Save' : 'Create'}</button>
                <button type="button" onClick={() => setShowModal(false)} className="as-btn-ghost flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {cropSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
          <div className="glass p-5 w-full max-w-md space-y-4">
            <h3 className="font-semibold text-[16px]">Crop logo</h3>
            <div className="mx-auto w-48 h-48 rounded-full overflow-hidden bg-black/40 relative ring-2 ring-white/20">
              <img ref={cropImgRef} src={cropSrc} alt="Crop" className="absolute left-1/2 top-1/2 max-w-none" style={{ transform: `translate(-50%, -50%) scale(${cropZoom})`, width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <label className="block text-[13px]" style={{ color: 'var(--text-2)' }}>
              Zoom
              <input type="range" min={1} max={3} step={0.05} value={cropZoom} onChange={e => setCropZoom(Number(e.target.value))} className="w-full mt-1" />
            </label>
            <div className="flex gap-2 justify-end">
              <button type="button" className="as-btn-ghost" onClick={() => setCropSrc(null)} disabled={uploadingLogo}>Cancel</button>
              <button type="button" className="as-btn-primary" onClick={applyLogoCrop} disabled={uploadingLogo}>{uploadingLogo ? 'Saving…' : 'Apply crop'}</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
