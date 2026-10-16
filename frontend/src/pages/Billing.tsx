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
}

export default function Billing() {
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/orgs/me')
      .then(r => setOrg(r.data))
      .catch(() => setOrg(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const activateDemo = async () => {
    setBusy(true);
    setMsg('');
    try {
      await api.post('/billing/demo-activate');
      setMsg('Pro activated (demo).');
      load();
    } catch (e: any) {
      setMsg(e.response?.data?.error || 'Could not activate');
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
        <div className="grid sm:grid-cols-2 gap-3.5">
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
            {msg && <p className="mt-3 text-[14px]" style={{ color: 'var(--accent)' }}>{msg}</p>}
            {!isPro && (
              <button type="button" onClick={activateDemo} disabled={busy} className="as-btn-primary mt-5 text-sm">
                {busy ? '…' : 'Activate Pro (demo)'}
              </button>
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
