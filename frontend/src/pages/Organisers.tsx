import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../services/api';

type OrgUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  lastLoginAt?: string | null;
};

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  accessUntil?: string | null;
  notes?: string;
  seasonLabel?: string;
  usage?: { teams: number; players: number; auctions: number; matches: number; sold: number };
  users?: OrgUser[];
};

const emptyForm = {
  orgName: '',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
  plan: 'free',
  accessUntil: '',
  seasonLabel: '',
  notes: ''
};

export default function Organisers() {
  const [list, setList] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pwdEdit, setPwdEdit] = useState<{ userId: string; password: string } | null>(null);

  const load = () => {
    setLoading(true);
    api.get('/platform/orgs')
      .then(r => setList(Array.isArray(r.data) ? r.data : []))
      .catch(e => setMsg(e.response?.data?.error || 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setCreds(null);
    try {
      const r = await api.post('/platform/orgs', {
        orgName: form.orgName,
        adminName: form.adminName || form.orgName,
        adminEmail: form.adminEmail,
        adminPassword: form.adminPassword,
        plan: form.plan,
        accessUntil: form.accessUntil || null,
        seasonLabel: form.seasonLabel,
        notes: form.notes
      });
      setCreds(r.data.credentials || null);
      setMsg(r.data.message || 'Created');
      setForm(emptyForm);
      load();
    } catch (err: any) {
      setMsg(err.response?.data?.error || 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    try {
      if (status === 'suspended') {
        await api.post(`/platform/orgs/${id}/suspend`, { reason: 'Tournament ended' });
      } else if (status === 'active') {
        await api.post(`/platform/orgs/${id}/activate`);
      } else {
        await api.patch(`/platform/orgs/${id}`, { status });
      }
      setMsg(`Organisation → ${status}`);
      load();
    } catch (e: any) {
      setMsg(e.response?.data?.error || 'Update failed');
    }
  };

  const resetPassword = async () => {
    if (!pwdEdit?.password) return;
    try {
      const r = await api.patch(`/platform/users/${pwdEdit.userId}`, { password: pwdEdit.password });
      setCreds(r.data.credentials || { email: '', password: pwdEdit.password });
      setMsg('Password reset — copy and share securely');
      setPwdEdit(null);
      load();
    } catch (e: any) {
      setMsg(e.response?.data?.error || 'Reset failed');
    }
  };

  const toggleUser = async (u: OrgUser) => {
    try {
      if (u.active) await api.post(`/platform/users/${u.id}/disable`);
      else await api.post(`/platform/users/${u.id}/enable`);
      load();
    } catch (e: any) {
      setMsg(e.response?.data?.error || 'Failed');
    }
  };

  const impersonate = async (userId: string) => {
    try {
      const r = await api.post(`/platform/impersonate/${userId}`);
      const token = r.data.token;
      if (token) {
        localStorage.setItem('token', token);
        setMsg('Impersonating organiser — reloading…');
        setTimeout(() => { window.location.href = '/'; }, 600);
      }
    } catch (e: any) {
      setMsg(e.response?.data?.error || 'Impersonate failed');
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMsg('Copied');
    } catch {
      setMsg('Could not copy');
    }
  };

  const statusColor = (s: string) =>
    s === 'active' ? '#30d158' : s === 'suspended' ? '#ff9f0a' : 'var(--text-3)';

  return (
    <AppShell title="Organisers" subtitle="Developer · provision logins · suspend after tournament">
      <div className="mb-6">
        <h2 className="text-[26px] font-extrabold tracking-tight uppercase" style={{ color: 'var(--text)' }}>
          Organisers
        </h2>
        <p className="text-[14px] mt-1" style={{ color: 'var(--text-2)' }}>
          You create every organiser login. After a tournament, suspend access — data stays until you reopen next season.
        </p>
        {msg && <p className="mt-3 text-[13px] font-semibold" style={{ color: 'var(--accent)' }}>{msg}</p>}
        {creds && (
          <div className="glass p-4 mt-3">
            <div className="as-section-title">Credentials (copy now)</div>
            <p className="text-[14px] font-mono" style={{ color: 'var(--text)' }}>
              {creds.email} / {creds.password}
            </p>
            <button type="button" className="as-btn-ghost mt-2 !text-[11px]" onClick={() => copy(`${creds.email}\n${creds.password}`)}>
              Copy both
            </button>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <form onSubmit={create} className="glass p-5 lg:col-span-2 space-y-3">
          <div className="as-section-title">Provision organiser</div>
          <div>
            <label className="as-label">Organisation name</label>
            <input className="as-input" value={form.orgName} onChange={e => setForm(f => ({ ...f, orgName: e.target.value }))} required placeholder="Udupi Premier League" />
          </div>
          <div>
            <label className="as-label">Admin display name</label>
            <input className="as-input" value={form.adminName} onChange={e => setForm(f => ({ ...f, adminName: e.target.value }))} placeholder="Ramesh (organiser)" />
          </div>
          <div>
            <label className="as-label">Login email</label>
            <input className="as-input" type="email" value={form.adminEmail} onChange={e => setForm(f => ({ ...f, adminEmail: e.target.value }))} required placeholder="upl@club.com" />
          </div>
          <div>
            <label className="as-label">Password (you set it)</label>
            <input className="as-input" value={form.adminPassword} onChange={e => setForm(f => ({ ...f, adminPassword: e.target.value }))} required minLength={6} placeholder="Min 6 characters" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="as-label">Plan</label>
              <select className="as-input" value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
              </select>
            </div>
            <div>
              <label className="as-label">Access until</label>
              <input className="as-input" type="date" value={form.accessUntil} onChange={e => setForm(f => ({ ...f, accessUntil: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="as-label">Season label</label>
            <input className="as-input" value={form.seasonLabel} onChange={e => setForm(f => ({ ...f, seasonLabel: e.target.value }))} placeholder="Season 2026" />
          </div>
          <div>
            <label className="as-label">Internal notes</label>
            <input className="as-input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Paid via UPI · WhatsApp group" />
          </div>
          <button type="submit" className="as-btn-primary w-full" disabled={busy}>
            {busy ? 'Creating…' : 'Create organiser'}
          </button>
        </form>

        <div className="lg:col-span-3 space-y-3">
          {loading ? (
            <div className="glass p-6" style={{ color: 'var(--text-2)' }}>Loading…</div>
          ) : list.length === 0 ? (
            <div className="glass p-6" style={{ color: 'var(--text-2)' }}>No organisers yet — create the first one.</div>
          ) : (
            list.map(org => (
              <div key={org.id} className="glass p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-[17px] font-bold" style={{ color: 'var(--text)' }}>{org.name}</div>
                    <div className="text-[12px]" style={{ color: 'var(--text-3)' }}>
                      {org.slug} · {org.plan}
                      {org.seasonLabel ? ` · ${org.seasonLabel}` : ''}
                      {org.accessUntil ? ` · until ${new Date(org.accessUntil).toLocaleDateString()}` : ''}
                    </div>
                    {org.notes && <div className="text-[12px] mt-1" style={{ color: 'var(--text-2)' }}>{org.notes}</div>}
                  </div>
                  <span className="as-chip" style={{ color: statusColor(org.status) }}>{org.status}</span>
                </div>
                <div className="flex flex-wrap gap-3 mt-2 text-[12px] tabular-nums" style={{ color: 'var(--text-2)' }}>
                  <span>{org.usage?.players ?? 0} players</span>
                  <span>{org.usage?.teams ?? 0} teams</span>
                  <span>{org.usage?.auctions ?? 0} auctions</span>
                  <span>{org.usage?.sold ?? 0} sold</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {org.status !== 'active' && (
                    <button type="button" className="as-btn-primary !text-[11px] !py-1.5" onClick={() => setStatus(org.id, 'active')}>Restore access</button>
                  )}
                  {org.status === 'active' && (
                    <button type="button" className="as-btn-ghost !text-[11px] !py-1.5" onClick={() => setStatus(org.id, 'suspended')}>Suspend (keep data)</button>
                  )}
                  {org.status !== 'archived' && (
                    <button type="button" className="as-btn-ghost !text-[11px] !py-1.5" onClick={() => setStatus(org.id, 'archived')}>Archive</button>
                  )}
                  <button type="button" className="as-btn-ghost !text-[11px] !py-1.5" onClick={() => setExpanded(expanded === org.id ? null : org.id)}>
                    {expanded === org.id ? 'Hide users' : 'Users'}
                  </button>
                </div>
                {expanded === org.id && (
                  <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--separator)' }}>
                    {(org.users || []).map(u => (
                      <div key={u.id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                        <span style={{ color: 'var(--text)' }}>{u.name}</span>
                        <span className="font-mono text-[12px]" style={{ color: 'var(--text-2)' }}>{u.email}</span>
                        <span className="as-chip !text-[10px]">{u.role}</span>
                        <span className="as-chip !text-[10px]" style={{ color: u.active ? '#30d158' : 'var(--text-3)' }}>
                          {u.active ? 'login on' : 'login off'}
                        </span>
                        <button type="button" className="as-btn-ghost !py-1 !px-2 !text-[10px] ml-auto" onClick={() => toggleUser(u)}>
                          {u.active ? 'Disable login' : 'Enable login'}
                        </button>
                        <button type="button" className="as-btn-ghost !py-1 !px-2 !text-[10px]" onClick={() => setPwdEdit({ userId: u.id, password: '' })}>Reset pwd</button>
                        <button type="button" className="as-btn-ghost !py-1 !px-2 !text-[10px]" onClick={() => impersonate(u.id)}>Login as</button>
                      </div>
                    ))}
                    {pwdEdit && (org.users || []).some(u => u.id === pwdEdit.userId) && (
                      <div className="flex gap-2 mt-2">
                        <input className="as-input" placeholder="New password" value={pwdEdit.password} onChange={e => setPwdEdit({ ...pwdEdit, password: e.target.value })} />
                        <button type="button" className="as-btn-primary shrink-0" onClick={resetPassword}>Set</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
