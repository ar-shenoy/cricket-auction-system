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
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const cropImgRef = useRef<HTMLImageElement>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [editing, setEditing] = useState<Team | null>(null);
  const [form, setForm] = useState({
    name: '', purse: '10000000', remainingPurse: '', maxPlayers: '15',
    logoUrl: '', managerName: '', managerEmail: '', managerPassword: ''
  });

  const loadTeams = (soft = false) => {
    if (!soft) setLoading(true);
    api.get('/teams')
      .then(r => setTeams(r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
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
      loadTeams(true);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save team');
    }
  };

  const handleDelete = async (team: Team) => {
    if (!confirm(`Delete team "${team.name}"?`)) return;
    try {
      await api.delete(`/teams/${team.id}`);
      loadTeams(true);
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
      setCropSrc(String(reader.result || ''));
      setCropZoom(1);
    };
    reader.readAsDataURL(file);
    if (logoFileRef.current) logoFileRef.current.value = '';
  };

  const applyLogoCrop = async () => {
    const img = cropImgRef.current;
    if (!img || !cropSrc) return;
    setUploadingLogo(true);
    try {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not available');
      const nw = img.naturalWidth || img.width;
      const nh = img.naturalHeight || img.height;
      const scale = Math.max(size / nw, size / nh) * cropZoom;
      const dw = nw * scale;
      const dh = nh * scale;
      const dx = (size - dw) / 2;
      const dy = (size - dh) / 2;
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, dx, dy, dw, dh);
      const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
      if (!blob) throw new Error('Crop failed');
      const fd = new FormData();
      fd.append('file', blob, 'logo.jpg');
      const res = await api.post('/upload/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm(prev => ({ ...prev, logoUrl: res.data.url }));
      setCropSrc(null);
    } catch (err: any) {
      alert(err.response?.data?.error || err.message || 'Upload failed');
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <AppShell title="Teams">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
        <p className="text-[14px]" style={{ color: 'var(--text-2)' }}>Purses, logos, and squad limits.</p>
        {user?.role === 'admin' && (
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
              <p className="mt-2 text-[12px]" style={{ color: 'var(--text-2)' }}>
                CSV headers: name, purse (or purse_value), max_players — optional logo_url
              </p>
            </>
          )}
          <button type="button" onClick={() => setImportResult(null)} className="ml-3 underline text-[12px]">Dismiss</button>
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
                <th>Team</th>
                <th>Purse</th>
                <th>Remaining</th>
                <th>Max</th>
                <th>Spent</th>
                {user?.role === 'admin' && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {teams.map(team => (
                <tr key={team.id}>
                  <td>
                    <div className="flex items-center gap-2 font-medium">
                      {team.logoUrl ? (
                        <img
                          src={team.logoUrl}
                          alt=""
                          className="w-9 h-9 rounded-full object-cover bg-black/20"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : <span className="text-lg">🏏</span>}
                      {team.name}
                    </div>
                  </td>
                  <td>₹{team.purse.toLocaleString()}</td>
                  <td style={{ color: '#30d158' }}>₹{team.remainingPurse.toLocaleString()}</td>
                  <td style={{ color: 'var(--text-2)' }}>{team.maxPlayers ?? '—'}</td>
                  <td style={{ color: '#ff3b30' }}>₹{(team.purse - team.remainingPurse).toLocaleString()}</td>
                  {user?.role === 'admin' && (
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(12px)' }}>
          <div className="glass-thick max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-[20px] font-semibold mb-4">{editing ? 'Edit Team' : 'Create Team'}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="as-label">Team name *</label>
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="as-input" />
              </div>
              <div>
                <label className="as-label">Total purse (₹) *</label>
                <input required type="number" value={form.purse} onChange={e => setForm({ ...form, purse: e.target.value })} className="as-input" />
              </div>
              <div>
                <label className="as-label">Max players</label>
                <input type="number" min={1} value={form.maxPlayers} onChange={e => setForm({ ...form, maxPlayers: e.target.value })} className="as-input" />
              </div>
              <div>
                <label className="as-label">Logo</label>
                <div className="flex gap-2">
                  <input type="url" value={form.logoUrl} onChange={e => setForm({ ...form, logoUrl: e.target.value })} className="as-input" placeholder="URL or upload" />
                  <label className="as-btn-ghost text-sm cursor-pointer whitespace-nowrap !px-3">
                    {uploadingLogo ? '…' : 'Upload'}
                    <input ref={logoFileRef} type="file" accept="image/*" onChange={handleLogoFile} className="hidden" />
                  </label>
                </div>
                {form.logoUrl && (
                  <img src={form.logoUrl} alt="" className="mt-2 w-16 h-16 rounded-full object-cover" />
                )}
              </div>
              {editing && (
                <div>
                  <label className="as-label">Remaining purse</label>
                  <input type="number" value={form.remainingPurse} onChange={e => setForm({ ...form, remainingPurse: e.target.value })} className="as-input" />
                </div>
              )}
              {!editing && (
                <>
                  <p className="text-[12px] pt-1" style={{ color: 'var(--text-2)' }}>Optional manager</p>
                  <input placeholder="Name" value={form.managerName} onChange={e => setForm({ ...form, managerName: e.target.value })} className="as-input" />
                  <input placeholder="Email" type="email" value={form.managerEmail} onChange={e => setForm({ ...form, managerEmail: e.target.value })} className="as-input" />
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
            <p className="text-[13px]" style={{ color: 'var(--text-2)' }}>Zoom so the team mark fills the circle. A square crop is applied on save.</p>
            <div className="mx-auto w-48 h-48 rounded-full overflow-hidden bg-black/40 relative ring-2 ring-white/20">
              <img
                ref={cropImgRef}
                src={cropSrc}
                alt="Crop"
                className="absolute left-1/2 top-1/2 max-w-none"
                style={{
                  transform: `translate(-50%, -50%) scale(${cropZoom})`,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
              />
            </div>
            <label className="block text-[13px]" style={{ color: 'var(--text-2)' }}>
              Zoom
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={cropZoom}
                onChange={e => setCropZoom(Number(e.target.value))}
                className="w-full mt-1"
              />
            </label>
            <div className="flex gap-2 justify-end">
              <button type="button" className="as-btn-ghost" onClick={() => setCropSrc(null)} disabled={uploadingLogo}>Cancel</button>
              <button type="button" className="as-btn-primary" onClick={applyLogoCrop} disabled={uploadingLogo}>
                {uploadingLogo ? 'Saving…' : 'Apply crop'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
