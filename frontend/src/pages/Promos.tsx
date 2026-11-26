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
  createdAt?: string;
};

const emptyForm = {
  code: '',
  discountType: 'percent' as 'percent' | 'fixed',
  discountValue: '20',
  appliesTo: 'pro_upgrade',
  maxRedemptions: '',
  expiresAt: '',
  note: '',
  active: true
};

export default function Promos() {
  const [list, setList] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [promoFeatureOn, setPromoFeatureOn] = useState(false);
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/billing/promos'),
      api.get('/orgs/features').catch(() => ({ data: { features: {} } }))
    ])
      .then(([pr, fr]) => {
        setList(Array.isArray(pr.data) ? pr.data : []);
        const f = fr.data.features || {};
        setFeatures(f);
        setPromoFeatureOn(f.promoCodes === true);
      })
      .catch(() => setMsg('Failed to load promos'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggleFeature = async () => {
    const next = !promoFeatureOn;
    try {
      const merged = { ...features, promoCodes: next };
      const r = await api.put('/orgs/features', { features: merged });
      setFeatures(r.data.features || merged);
      setPromoFeatureOn(next);
      setMsg(next ? 'Promo codes enabled on Billing for this org.' : 'Promo codes disabled for this org.');
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
        active: form.active
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
    <AppShell title="Promo codes" subtitle="Developer · issue discounts for organisers">
      <div className="mb-6">
        <h2 className="text-[26px] font-extrabold tracking-tight uppercase" style={{ color: 'var(--text)' }}>
          Promo codes
        </h2>
        <p className="text-[14px] mt-1" style={{ color: 'var(--text-2)' }}>
          Issue codes after a sale. Turn the feature on so organisers see a promo field on Billing.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className={promoFeatureOn ? 'as-btn-primary' : 'as-btn-ghost'} onClick={toggleFeature}>
            {promoFeatureOn ? 'Feature ON for this org' : 'Enable for this org'}
          </button>
          <span className="text-[12px]" style={{ color: 'var(--text-3)' }}>
            Default is off — only orgs you enable can redeem.
          </span>
        </div>
        {msg && (
          <p className="mt-3 text-[13px] font-semibold" style={{ color: 'var(--accent)' }}>{msg}</p>
        )}
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <form onSubmit={create} className="glass p-5 lg:col-span-2 space-y-3">
          <div className="as-section-title">Issue code</div>
          <div>
            <label className="as-label">Code</label>
            <input
              className="as-input"
              value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="LAUNCH20"
              required
              minLength={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="as-label">Type</label>
              <select
                className="as-input"
                value={form.discountType}
                onChange={e => setForm(f => ({ ...f, discountType: e.target.value as 'percent' | 'fixed' }))}
              >
                <option value="percent">Percent %</option>
                <option value="fixed">Fixed ₹</option>
              </select>
            </div>
            <div>
              <label className="as-label">Value</label>
              <input
                className="as-input"
                type="number"
                min={1}
                value={form.discountValue}
                onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))}
                required
              />
            </div>
          </div>
          <div>
            <label className="as-label">Applies to</label>
            <select
              className="as-input"
              value={form.appliesTo}
              onChange={e => setForm(f => ({ ...f, appliesTo: e.target.value }))}
            >
              <option value="pro_upgrade">Pro upgrade</option>
              <option value="all">All paid purposes</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="as-label">Max uses (blank = ∞)</label>
              <input
                className="as-input"
                type="number"
                min={0}
                value={form.maxRedemptions}
                onChange={e => setForm(f => ({ ...f, maxRedemptions: e.target.value }))}
                placeholder="Unlimited"
              />
            </div>
            <div>
              <label className="as-label">Expires</label>
              <input
                className="as-input"
                type="date"
                value={form.expiresAt}
                onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="as-label">Internal note</label>
            <input
              className="as-input"
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder="Sold to Club X · WhatsApp"
            />
          </div>
          <button type="submit" className="as-btn-primary w-full" disabled={busy}>
            {busy ? 'Creating…' : 'Create promo'}
          </button>
        </form>

        <div className="glass p-0 lg:col-span-3 overflow-hidden">
          <div className="px-5 pt-4 pb-2">
            <div className="as-section-title">Issued codes</div>
          </div>
          {loading ? (
            <div className="p-6 text-[14px]" style={{ color: 'var(--text-2)' }}>Loading…</div>
          ) : list.length === 0 ? (
            <div className="p-6 text-[14px]" style={{ color: 'var(--text-2)' }}>No promos yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Discount</th>
                    <th>Uses</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(p => (
                    <tr key={p.id}>
                      <td>
                        <span className="font-bold tracking-wide" style={{ color: 'var(--accent)' }}>{p.code}</span>
                        {p.note && (
                          <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{p.note}</div>
                        )}
                      </td>
                      <td className="tabular-nums text-[13px]">
                        {p.discountType === 'fixed' ? `₹${p.discountValue}` : `${p.discountValue}%`}
                        <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{p.appliesTo}</div>
                      </td>
                      <td className="tabular-nums text-[13px]">
                        {p.redeemedCount || 0}
                        {p.maxRedemptions != null ? ` / ${p.maxRedemptions}` : ''}
                      </td>
                      <td>
                        <span className={`as-chip ${p.active ? 'as-chip--live' : ''}`}>
                          {p.active ? 'Active' : 'Off'}
                        </span>
                        {p.expiresAt && (
                          <div className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>
                            exp {new Date(p.expiresAt).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <button type="button" className="as-btn-ghost !py-1.5 !px-2 !text-[10px] mr-1" onClick={() => toggleActive(p)}>
                          {p.active ? 'Disable' : 'Enable'}
                        </button>
                        <button type="button" className="as-btn-ghost !py-1.5 !px-2 !text-[10px]" onClick={() => remove(p)}>
                          Delete
                        </button>
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
