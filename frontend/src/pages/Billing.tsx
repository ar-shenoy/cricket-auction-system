import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import AppShell from '../components/AppShell';

interface OrgInfo {
  id: string;
  name: string;
  plan: string;
  planExpiresAt?: string | null;
  limits?: Record<string, number | boolean>;
  usage?: { teams: number; players: number; matches: number; auctions: number };
  features?: Record<string, boolean>;
}

export default function Billing() {
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [promo, setPromo] = useState('');
  const [promoPreview, setPromoPreview] = useState<{
    amountInr: number;
    discountInr: number;
    listPriceInr: number;
    promo?: { code: string };
  } | null>(null);
  const [promoErr, setPromoErr] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/orgs/me'),
      api.get('/orgs/features').catch(() => ({ data: { features: {} } }))
    ])
      .then(([me, fr]) => {
        setOrg(me.data);
        setFeatures(fr.data.features || {});
      })
      .catch(() => setOrg(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const promoEnabled = features.promoCodes === true;

  const applyPromo = async () => {
    setPromoErr('');
    setPromoPreview(null);
    if (!promo.trim()) return;
    try {
      const r = await api.post('/billing/validate-promo', { code: promo.trim() });
      setPromoPreview(r.data);
      setMsg(`Promo ${r.data.promo?.code} applied — save ₹${r.data.discountInr}`);
    } catch (e: any) {
      setPromoErr(e.response?.data?.error || 'Invalid promo');
    }
  };

  const activateDemo = async () => {
    setBusy(true);
    setMsg('');
    try {
      const body = promoEnabled && promo.trim() ? { promoCode: promo.trim() } : {};
      await api.post('/billing/demo-activate', body);
      setMsg('Pro activated (demo).');
      load();
    } catch (e: any) {
      setMsg(e.response?.data?.error || 'Could not activate');
    } finally {
      setBusy(false);
    }
  };

  const startCheckout = async () => {
    setBusy(true);
    setMsg('');
    try {
      const body = promoEnabled && promo.trim() ? { promoCode: promo.trim() } : {};
      const r = await api.post('/billing/create-order', body);
      if (r.data.free) {
        setMsg('Promo covered 100% — Pro activated.');
        load();
        return;
      }
      if (r.data.demo) {
        setMsg(
          `Order ready (demo). Pay ₹${r.data.amountInr}` +
            (r.data.discountInr ? ` (saved ₹${r.data.discountInr})` : '') +
            '. Use Activate Pro (demo) without Razorpay.'
        );
        return;
      }
      setMsg(`Order ${r.data.orderId} · ₹${r.data.amountInr}. Complete payment with Razorpay checkout.`);
    } catch (e: any) {
      setMsg(e.response?.data?.error || 'Checkout failed');
    } finally {
      setBusy(false);
    }
  };

  const isPro = org?.plan === 'pro';

  return (
    <AppShell title="Billing">
      <div className="mb-6">
        <h2 className="text-[28px] font-semibold tracking-tight" style={{ color: 'var(--text)' }}>Plan & limits</h2>
        <p className="text-[15px] mt-1" style={{ color: 'var(--text-2)' }}>
          Free tier works offline. Pro unlocks higher limits (Razorpay optional).
        </p>
      </div>

      {loading ? (
        <div className="glass p-8 text-center" style={{ color: 'var(--text-2)' }}>Loading…</div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3.5 as-stagger">
          <div className="glass p-6">
            <div className="text-[13px]" style={{ color: 'var(--text-2)' }}>Organization</div>
            <div className="text-[22px] font-semibold mt-1" style={{ color: 'var(--text)' }}>{org?.name || '—'}</div>
            <div className="mt-4 flex items-center gap-2">
              <span className="glass-island text-[12px]" style={{ color: isPro ? '#30d158' : 'var(--text-2)' }}>
                {isPro ? 'Pro' : 'Free'}
              </span>
              {org?.planExpiresAt && (
                <span className="text-[13px]" style={{ color: 'var(--text-2)' }}>
                  until {new Date(org.planExpiresAt).toLocaleDateString()}
                </span>
              )}
            </div>

            {!isPro && promoEnabled && (
              <div className="mt-5 space-y-2 as-pop">
                <label className="as-label">Promo code</label>
                <div className="flex gap-2">
                  <input
                    className="as-input"
                    value={promo}
                    onChange={e => {
                      setPromo(e.target.value.toUpperCase());
                      setPromoPreview(null);
                      setPromoErr('');
                    }}
                    placeholder="ENTER CODE"
                  />
                  <button type="button" className="as-btn-ghost shrink-0" onClick={applyPromo}>
                    Apply
                  </button>
                </div>
                {promoErr && <p className="text-[12px]" style={{ color: 'var(--danger)' }}>{promoErr}</p>}
                {promoPreview && (
                  <p className="text-[13px]" style={{ color: 'var(--accent)' }}>
                    ₹{promoPreview.listPriceInr} → <strong>₹{promoPreview.amountInr}</strong>
                    {' '}(−₹{promoPreview.discountInr})
                  </p>
                )}
              </div>
            )}

            {msg && <p className="mt-3 text-[14px]" style={{ color: 'var(--accent)' }}>{msg}</p>}
            {!isPro && (
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={activateDemo} disabled={busy} className="as-btn-primary text-sm">
                  {busy ? '…' : 'Activate Pro (demo)'}
                </button>
                <button type="button" onClick={startCheckout} disabled={busy} className="as-btn-ghost text-sm">
                  Create order
                </button>
              </div>
            )}
          </div>

          <div className="glass p-6">
            <div className="text-[13px] mb-3" style={{ color: 'var(--text-2)' }}>Usage</div>
            {[
              ['Teams', org?.usage?.teams, org?.limits?.maxTeams],
              ['Players', org?.usage?.players, org?.limits?.maxPlayers],
              ['Matches', org?.usage?.matches, org?.limits?.maxMatches],
              ['Auctions', org?.usage?.auctions, org?.limits?.maxAuctions]
            ].map(([label, used, max]) => (
              <div key={String(label)} className="glass-row !px-0">
                <span style={{ color: 'var(--text)' }}>{label}</span>
                <span className="ml-auto tabular-nums text-[14px]" style={{ color: 'var(--text-2)' }}>
                  {used ?? 0}{max != null && max !== true ? ` / ${max}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-6 text-[13px]" style={{ color: 'var(--text-3)' }}>
        Razorpay is optional — leave keys unset and use demo activate for testing.{' '}
        <Link to="/" style={{ color: 'var(--accent)' }}>Back home</Link>
      </p>
    </AppShell>
  );
}
