import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../services/api';

type Promo = {
  id: string;
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  appliesTo: string;
  maxRedemptions: number | null;
  redeemedCount: number;
  expiresAt: string | null;
  active: boolean;
  note?: string;
};

type OrgRow = { id: string; name: string; features?: Record<string, boolean> };

const emptyForm = {
  code: '',
  discountType: 'percent' as 'percent' | 'fixed',
  discountValue: '20',
  appliesTo: 'pro_upgrade',
  maxRedemptions: '',
  expiresAt: '',
  note: ''
};

export default function Promos() {
  const [list, setList] = useState<Promo[]>([]);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [target, setTarget] = useState<'all' | string>('all');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [promoFeatureOn, setPromoFeatureOn] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/billing/promos'),
      api.get('/orgs').catch(() => ({ data: [] }))
    ])
      .then(([pr, orgRes]) => {
        setList(Array.isArray(pr.data) ? pr.data : []);
        const o = Array.isArray(orgRes.data) ? orgRes.data : [];
        setOrgs(o);
      })
      .catch(() => setMsg('Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (target === 'all') {
      setPromoFeatureOn(orgs.some(o => o.features?.promoCodes === true));
    } else {
      const o = orgs.find(x => x.id === target);
      setPromoFeatureOn(o?.features?.promoCodes === true);
    }
  }, [target, orgs]);

  const toggleFeature = async () => {
    const next = !promoFeatureOn;
    try {
      if (target === 'all') {
        await api.put('/orgs/features', { scope: 'all', features: { promoCodes: next } });
        setMsg(next ? 'Promo codes enabled for ALL organisations.' : 'Promo codes disabled for all organisations.');
      } else {
        await api.put('/orgs/features', { orgId: target, features: { promoCodes: next } });
        const name = orgs.find(o => o.id === target)?.name || 'org';
        setMsg(next ? `Promo codes enabled for ${name} only.` : `Promo codes disabled for ${name}.`);
      }
      setPromoFeatureOn(next);
      const orgRes = await api.get('/orgs').catch(() => ({ data: [] }));
      setOrgs(Array.isArray(orgRes.data) ? orgRes.data : []);
    } catch (e: any) {
      setMsg(e.response?.data?.error || 'Could not update feature');
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await api.post('/billing/promos', {
        code: form.code,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        appliesTo: form.appliesTo,
        maxRedemptions: form.maxRedemptions === '' ? null : Number(form.maxRedemptions),
        expiresAt: form.expiresAt || null,
        note: form.note,
        active: true
      });
      setForm(emptyForm);
      setMsg('Promo created — share the code with the organiser.');
      load();
    } catch (err: any) {
      setMsg(err.response?.data?.error || 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (p: Promo) => {
    try {
      await api.patch(`/billing/promos/${p.id}`, { active: !p.active });
      load();
    } catch (err: any) {
      setMsg(err.response?.data?.error || 'Update failed');
    }
  };

  const remove = async (p: Promo) => {
    if (!confirm(`Delete promo ${p.code}?`)) return;
    try {
      await api.delete(`/billing/promos/${p.id}`);
      load();
    } catch (err: any) {
      setMsg(err.response?.data?.error || 'Delete failed');
    }
  };

  return (
    <AppShell title="Promo codes" subtitle="Developer · scope by organisation">
      <div className="mb-6">
        <h2 className="text-[26px] font-extrabold tracking-tight uppercase" style={{ color: 'var(--text)' }}>
          Promo codes
        </h2>
        <p className="text-[14px] mt-1" style={{ color: 'var(--text-2)' }}>
          Codes are platform-wide. The Billing promo field only shows for orgs where you enable the feature.
        </p>
        {msg && <p className="mt-3 text-[13px] font-semibold" style={{ color: 'var(--accent)' }}>{msg}</p>}
      </div>

      <div className="glass p-5 mb-4">
        <div className="as-section-title">Who can use promos</div>
        <div className="grid sm:grid-cols-3 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className="as-label">Organisation</label>
            <select className="as-input" value={target} onChange={e => setTarget(e.target.value)}>
              <option value="all">All organisations</option>
              {orgs.map(o => (
                <option key={o.id} value={o.id}>
                  {o.name}{o.features?.promoCodes ? ' · ON' : ''}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className={promoFeatureOn ? 'as-btn-primary w-full' : 'as-btn-ghost w-full'}
            onClick={toggleFeature}
          >
            {promoFeatureOn ? 'Feature ON' : 'Enable feature'}
          </button>
        </div>
        <p className="text-[12px] mt-2" style={{ color: 'var(--text-3)' }}>
          Default is off. Only enabled orgs see the promo field on Billing.
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <form onSubmit={create} className="glass p-5 lg:col-span-2 space-y-3">
          <div className="as-section-title">Issue code</div>
          <div>
            <label className="as-label">Code</label>
            <input className="as-input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="LAUNCH20" required minLength={3} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="as-label">Type</label>
              <select className="as-input" value={form.discountType} onChange={e => setForm(f => ({ ...f, discountType: e.target.value as 'percent' | 'fixed' }))}>
                <option value="percent">Percent %</option>
                <option value="fixed">Fixed ₹</option>
              </select>
            </div>
            <div>
              <label className="as-label">Value</label>
              <input className="as-input" type="number" min={1} value={form.discountValue} onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))} required />
            </div>
          </div>
          <div>
            <label className="as-label">Applies to</label>
            <select className="as-input" value={form.appliesTo} onChange={e => setForm(f => ({ ...f, appliesTo: e.target.value }))}>
              <option value="pro_upgrade">Pro upgrade</option>
              <option value="all">All paid purposes</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="as-label">Max uses</label>
              <input className="as-input" type="number" min={0} value={form.maxRedemptions} onChange={e => setForm(f => ({ ...f, maxRedemptions: e.target.value }))} placeholder="Unlimited" />
            </div>
            <div>
              <label className="as-label">Expires</label>
              <input className="as-input" type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="as-label">Note</label>
            <input className="as-input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Sold to Club X" />
          </div>
          <button type="submit" className="as-btn-primary w-full" disabled={busy}>{busy ? 'Creating…' : 'Create promo'}</button>
        </form>

        <div className="glass p-0 lg:col-span-3 overflow-hidden">
          <div className="px-5 pt-4 pb-2"><div className="as-section-title">Issued codes</div></div>
          {loading ? (
            <div className="p-6 text-[14px]" style={{ color: 'var(--text-2)' }}>Loading…</div>
          ) : list.length === 0 ? (
            <div className="p-6 text-[14px]" style={{ color: 'var(--text-2)' }}>No promos yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead><tr><th>Code</th><th>Discount</th><th>Uses</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {list.map(p => (
                    <tr key={p.id}>
                      <td><span className="font-bold" style={{ color: 'var(--accent)' }}>{p.code}</span></td>
                      <td className="tabular-nums text-[13px]">{p.discountType === 'fixed' ? `₹${p.discountValue}` : `${p.discountValue}%`}</td>
                      <td className="tabular-nums text-[13px]">{p.redeemedCount || 0}{p.maxRedemptions != null ? ` / ${p.maxRedemptions}` : ''}</td>
                      <td><span className={`as-chip ${p.active ? 'as-chip--live' : ''}`}>{p.active ? 'Active' : 'Off'}</span></td>
                      <td className="text-right">
                        <button type="button" className="as-btn-ghost !py-1.5 !px-2 !text-[10px] mr-1" onClick={() => toggleActive(p)}>{p.active ? 'Disable' : 'Enable'}</button>
                        <button type="button" className="as-btn-ghost !py-1.5 !px-2 !text-[10px]" onClick={() => remove(p)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
